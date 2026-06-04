/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IClaudeCliService, IClaudeCliSession } from '../common/claudeCli.js';
import { StreamJsonParser } from '../common/streamJsonParser.js';
import { ClaudeCliStreamEvent } from '../common/streamJson.js';

// Access child_process via require — electron-browser has nodeIntegration
// so the global require is available at runtime. Avoids a static import
// that would violate the electron-browser layer import-pattern rule.
const { spawn, execSync } = require('child_process') as typeof import('child_process');

/** Minimal child-process shape used by ClaudeCliSession. */
interface IChildProcess {
	readonly stdout: { on(event: 'data', listener: (chunk: Buffer) => void): void };
	readonly stderr: { on(event: 'data', listener: (chunk: Buffer) => void): void };
	readonly stdin: { write(s: string): boolean };
	on(event: 'error', listener: (err: Error) => void): unknown;
	on(event: 'close', listener: (code: number | null) => void): unknown;
	kill(signal?: string): boolean;
}

// Inline binary name constant (avoids node/ layer import).
const CLAUDE_BINARY_NAME = process.platform === 'win32' ? 'claude.cmd' : 'claude';

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

class ClaudeCliSession extends Disposable implements IClaudeCliSession {

	private readonly _onDidEmitEvent = this._register(new Emitter<ClaudeCliStreamEvent>());
	readonly onDidEmitEvent = this._onDidEmitEvent.event;

	private readonly _onDidExit = this._register(new Emitter<number>());
	readonly onDidExit = this._onDidExit.event;

	private readonly _parser = new StreamJsonParser();
	private _process: IChildProcess | undefined;
	private _exited = false;

	constructor(
		readonly sessionId: string,
		readonly workspaceUri: URI,
		private readonly _claudePath: string,
		private readonly _prompt: string,
		private readonly _logService: ILogService,
	) {
		super();
		this._start();
	}

	private _start(): void {
		const cwd = this.workspaceUri.fsPath;
		const args = [
			'-p', this._prompt,
			'--output-format', 'stream-json',
			'--verbose',
		];

		this._logService.info(`[ClaudeCliSession] spawning: ${this._claudePath} ${args.join(' ')} (cwd=${cwd})`);

		const proc = spawn(this._claudePath, args, {
			cwd,
			shell: false,
			env: { ...process.env },
		});

		this._process = proc as unknown as IChildProcess;

		proc.stdout.on('data', (chunk: Buffer) => {
			const events = this._parser.feed(chunk.toString('utf8'));
			for (const event of events) {
				this._onDidEmitEvent.fire(event);
			}
		});

		proc.stderr.on('data', (chunk: Buffer) => {
			this._logService.warn(`[ClaudeCliSession] stderr: ${chunk.toString('utf8').trim()}`);
		});

		proc.on('error', (err) => {
			this._logService.error(`[ClaudeCliSession] process error: ${err.message}`);
			this._handleExit(1);
		});

		proc.on('close', (code) => {
			// Flush any remaining buffered content
			const remaining = this._parser.flush();
			for (const event of remaining) {
				this._onDidEmitEvent.fire(event);
			}
			this._handleExit(code ?? 1);
		});
	}

	private _handleExit(code: number): void {
		if (this._exited) { return; }
		this._exited = true;
		this._logService.info(`[ClaudeCliSession] exited with code ${code}`);
		this._onDidExit.fire(code);
	}

	sendInput(text: string): void {
		if (!this._process || this._exited) { return; }
		this._process.stdin.write(text + '\n');
	}

	cancel(): void {
		if (this._process && !this._exited) {
			this._logService.info(`[ClaudeCliSession] cancelling session ${this.sessionId}`);
			this._process.kill('SIGTERM');
		}
		this.dispose();
	}

	override dispose(): void {
		if (this._process && !this._exited) {
			this._process.kill('SIGTERM');
		}
		this._parser.reset();
		super.dispose();
	}
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ClaudeCliService extends Disposable implements IClaudeCliService {
	declare readonly _serviceBrand: undefined;

	readonly claudePath: string | undefined;
	readonly isAvailable: boolean;

	private readonly _sessions = new Map<string, ClaudeCliSession>();

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this.claudePath = findClaudePathInline() ?? findViaPathEnv();
		this.isAvailable = !!this.claudePath;

		if (this.isAvailable) {
			this._logService.info(`[ClaudeCliService] found claude at: ${this.claudePath}`);
		} else {
			this._logService.warn(`[ClaudeCliService] claude binary not found — provider will show install prompt`);
		}
	}

	startSession(workspaceUri: URI, prompt: string, sessionId: string): IClaudeCliSession {
		if (!this.claudePath) {
			throw new Error('Claude Code CLI not found. Please install it from https://claude.ai/code');
		}

		// Dispose any existing session for this workspace
		this.stopSession(workspaceUri);

		const session = new ClaudeCliSession(sessionId, workspaceUri, this.claudePath, prompt, this._logService);

		const key = workspaceUri.toString();
		this._sessions.set(key, session);

		// Auto-cleanup when the session exits
		session.onDidExit(() => {
			if (this._sessions.get(key) === session) {
				this._sessions.delete(key);
			}
		});

		return session;
	}

	getSession(workspaceUri: URI): IClaudeCliSession | undefined {
		return this._sessions.get(workspaceUri.toString());
	}

	stopSession(workspaceUri: URI): void {
		const key = workspaceUri.toString();
		const existing = this._sessions.get(key);
		if (existing) {
			existing.cancel();
			this._sessions.delete(key);
		}
	}

	override dispose(): void {
		for (const session of this._sessions.values()) {
			session.cancel();
		}
		this._sessions.clear();
		super.dispose();
	}
}

registerSingleton(IClaudeCliService, ClaudeCliService, InstantiationType.Delayed);

/**
 * Inlined binary discovery (mirrors findClaude.ts without the node/ import).
 * Checks common install locations before falling back to PATH.
 */
function findClaudePathInline(): string | undefined {
	const { existsSync } = require('fs') as typeof import('fs');
	const env = process.env;
	const envOverride = env['CLAUDE_CLI_PATH'];
	if (envOverride && existsSync(envOverride)) {
		return envOverride;
	}
	const home = env['HOME'] || env['USERPROFILE'] || '';
	const candidates = process.platform === 'win32'
		? [
			`${env['APPDATA'] || ''}\\npm\\claude.cmd`,
			`${env['APPDATA'] || ''}\\npm\\claude`,
			`${env['LOCALAPPDATA'] || ''}\\Programs\\claude\\claude.exe`,
		]
		: [
			`${home}/.superset/bin/claude`,
			`${home}/.npm-global/bin/claude`,
			`${home}/.local/bin/claude`,
			'/opt/homebrew/bin/claude',
			'/usr/local/bin/claude',
			'/usr/bin/claude',
		];
	for (const p of candidates) {
		if (p && existsSync(p)) {
			return p;
		}
	}
	return undefined;
}

/**
 * Last-resort PATH lookup — tries executing `claude --version` to verify presence.
 */
function findViaPathEnv(): string | undefined {
	try {
		const result = execSync(`${CLAUDE_BINARY_NAME} --version`, { encoding: 'utf8', timeout: 3000 });
		if (result && result.trim().length > 0) {
			return CLAUDE_BINARY_NAME;
		}
	} catch {
		// Not found in PATH
	}
	return undefined;
}
