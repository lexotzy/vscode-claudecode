/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { IClaudeCliService, IClaudeCliSession, IPermissionRequest } from '../common/claudeCli.js';
import { StreamJsonParser } from '../common/streamJsonParser.js';
import { ClaudeCliStreamEvent } from '../common/streamJson.js';

// Access Node.js modules via require — electron-browser layer.
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
// MCP approval server script
//
// This script is passed as a `node -e` argument inside the `--mcp-config`
// JSON that we inject into every Claude Code CLI invocation.  It acts as a
// minimal MCP stdio server for the `approve_tool_use` tool: when Claude calls
// the tool it POSTs the request to our in-process HTTP approval server and
// waits for the response before returning allow/deny to the CLI.
//
// Rules: only single-quoted strings (JSON embedding is handled by
// JSON.stringify, but keeping single quotes avoids any accidental
// double-encoding); no external dependencies beyond Node builtins.
// ---------------------------------------------------------------------------
// Fully left-aligned so the VS Code hygiene checker does not flag space-indented lines.
const MCP_APPROVAL_SCRIPT = [
	`'use strict';`,
	`var http=require('http');`,
	`var rl=require('readline').createInterface({input:process.stdin,terminal:false});`,
	`var approvalUrl=process.argv[2];`,
	`rl.on('line',function(line){`,
	`if(!line.trim())return;`,
	`var msg;try{msg=JSON.parse(line);}catch(e){return;}`,
	`var id=msg.id,method=msg.method,params=msg.params;`,
	`if(method==='initialize'){`,
	`out(id,{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'vscode-approval',version:'1.0'}});`,
	`}else if(method==='notifications/initialized'){`,
	`}else if(method==='tools/list'){`,
	`out(id,{tools:[{name:'approve_tool_use',description:'Request VS Code approval',inputSchema:{type:'object',properties:{tool_name:{type:'string'},tool_input:{type:'object'},description:{type:'string'}},required:['tool_name']}}]});`,
	`}else if(method==='tools/call'&&params&&params.name==='approve_tool_use'){`,
	`var a=params.arguments||{};`,
	`var body=JSON.stringify({id:String(id),tool_name:a.tool_name,tool_input:a.tool_input,description:a.description});`,
	`var u=new URL(approvalUrl);`,
	`var req=http.request({hostname:u.hostname,port:parseInt(u.port,10),path:u.pathname,method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},function(res){`,
	`var d='';`,
	`res.on('data',function(c){d+=c;});`,
	`res.on('end',function(){`,
	`var r;try{r=JSON.parse(d);}catch(e){r={behavior:'deny',message:'parse error'};}`,
	`out(id,{content:[{type:'text',text:JSON.stringify(r)}]});`,
	`});`,
	`});`,
	`req.on('error',function(){out(id,{content:[{type:'text',text:JSON.stringify({behavior:'deny',message:'VS Code approval server unreachable'})}]});});`,
	`req.write(body);req.end();`,
	`}else if(id!=null){`,
	`process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:id,error:{code:-32601,message:'Method not found'}})+'\n');`,
	`}`,
	`});`,
	`function out(id,result){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:id,result:result})+'\n');}`,
].join('\n');

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

class ClaudeCliSession extends Disposable implements IClaudeCliSession {

	private readonly _onDidEmitEvent = this._register(new Emitter<ClaudeCliStreamEvent>());
	readonly onDidEmitEvent = this._onDidEmitEvent.event;

	private readonly _onDidExit = this._register(new Emitter<number>());
	readonly onDidExit = this._onDidExit.event;

	private readonly _onPermissionRequest = this._register(new Emitter<IPermissionRequest>());
	readonly onPermissionRequest = this._onPermissionRequest.event;

	private readonly _parser = new StreamJsonParser();
	private _process: IChildProcess | undefined;
	private _exited = false;

	/** HTTP server for receiving permission requests from the MCP bridge. */
	private _httpServer: ReturnType<typeof import('http').createServer> | undefined;
	/** Maps requestId → resolver function that completes the pending HTTP response. */
	private readonly _pendingPermissions = new Map<string, (allow: boolean) => void>();

	constructor(
		readonly sessionId: string,
		readonly workspaceUri: URI,
		private readonly _claudePath: string,
		private readonly _prompt: string,
		private readonly _logService: ILogService,
		private readonly _resumeSessionId?: string,
	) {
		super();
		// Start HTTP approval server first, then spawn the CLI once we have the port.
		this._startPermissionServer().then(
			port => this._spawnCli(port),
			err => {
				this._logService.warn(`[ClaudeCliSession] permission server failed to start (${err?.message ?? err}); spawning without approval bridge`);
				this._spawnCli(undefined);
			}
		);
	}

	// -- Permission bridge --

	private _startPermissionServer(): Promise<number> {
		return new Promise<number>((resolve, reject) => {
			const { createServer } = require('http') as typeof import('http');
			const server = createServer((req, res) => this._handlePermissionRequest(req, res));
			server.on('error', reject);
			server.listen(0, '127.0.0.1', () => {
				const addr = server.address() as { port: number } | null;
				if (!addr) {
					reject(new Error('Could not determine bound port'));
					return;
				}
				this._httpServer = server;
				resolve(addr.port);
			});
		});
	}

	private _handlePermissionRequest(
		req: import('http').IncomingMessage,
		res: import('http').ServerResponse,
	): void {
		if (req.method !== 'POST') {
			res.statusCode = 405;
			res.end();
			return;
		}
		let body = '';
		req.on('data', (chunk: Buffer | string) => { body += chunk; });
		req.on('end', () => {
			let parsed: { id: string; tool_name: string; tool_input?: Record<string, unknown>; description?: string };
			try {
				parsed = JSON.parse(body);
			} catch {
				res.statusCode = 400;
				res.end();
				return;
			}
			const request: IPermissionRequest = {
				requestId: parsed.id,
				toolName: parsed.tool_name,
				toolInput: parsed.tool_input ?? {},
				description: parsed.description,
			};
			this._logService.info(`[ClaudeCliSession] permission request for tool '${request.toolName}' (id=${request.requestId})`);
			this._pendingPermissions.set(request.requestId, (allow) => {
				const result = allow
					? { behavior: 'allow' }
					: { behavior: 'deny', message: 'Denied by VS Code user' };
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify(result));
			});
			this._onPermissionRequest.fire(request);
		});
	}

	respondToPermission(requestId: string, allow: boolean): void {
		const resolver = this._pendingPermissions.get(requestId);
		if (resolver) {
			this._pendingPermissions.delete(requestId);
			resolver(allow);
		}
	}

	// -- CLI spawn --

	private _spawnCli(permissionPort: number | undefined): void {
		if (this._exited) {
			return; // disposed before the async server start finished
		}

		const cwd = this.workspaceUri.fsPath;
		const args: string[] = [
			'-p', this._prompt,
			'--output-format', 'stream-json',
			'--verbose',
		];

		if (this._resumeSessionId) {
			args.push('--resume', this._resumeSessionId);
			this._logService.info(`[ClaudeCliSession] resuming CLI session ${this._resumeSessionId}`);
		}

		if (permissionPort !== undefined) {
			const approvalUrl = `http://127.0.0.1:${permissionPort}/approve`;
			const mcpConfig = JSON.stringify({
				mcpServers: {
					vscode_approval: {
						command: 'node',
						args: ['-e', MCP_APPROVAL_SCRIPT, '--', approvalUrl],
					},
				},
			});
			args.push('--mcp-config', mcpConfig);
			args.push('--permission-prompt-tool', 'mcp__vscode_approval__approve_tool_use');
			this._logService.info(`[ClaudeCliSession] permission bridge active on port ${permissionPort}`);
		}

		this._logService.info(`[ClaudeCliSession] spawning: ${this._claudePath} (cwd=${cwd})`);

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
		// Deny any stalled permission requests so callers don't hang.
		for (const [id, resolver] of this._pendingPermissions) {
			this._logService.warn(`[ClaudeCliSession] auto-denying stalled permission request ${id} on exit`);
			resolver(false);
		}
		this._pendingPermissions.clear();
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
		// Deny pending permissions and shut down the HTTP server.
		for (const resolver of this._pendingPermissions.values()) {
			resolver(false);
		}
		this._pendingPermissions.clear();
		this._httpServer?.close();
		this._httpServer = undefined;
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

	startSession(workspaceUri: URI, prompt: string, sessionId: string, resumeSessionId?: string): IClaudeCliSession {
		if (!this.claudePath) {
			throw new Error('Claude Code CLI not found. Please install it from https://claude.ai/code');
		}

		// Dispose any existing session for this workspace
		this.stopSession(workspaceUri);

		const session = new ClaudeCliSession(sessionId, workspaceUri, this.claudePath, prompt, this._logService, resumeSessionId);

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
