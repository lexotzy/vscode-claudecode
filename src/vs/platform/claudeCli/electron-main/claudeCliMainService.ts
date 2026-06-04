/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, execSync, execFile } from 'child_process';
import { existsSync } from 'fs';
import type { IncomingMessage, ServerResponse, Server } from 'http';
import { createInterface } from 'readline';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { IClaudeCliService, IClaudeCliDataPayload, IClaudeCliEndPayload, IClaudeCliPermissionPayload } from '../common/claudeCli.js';
import { escalatingKill } from '../common/processLifecycle.js';

/** Minimal child-process shape used internally. */
interface IChildProcess {
	readonly stdout: NodeJS.ReadableStream;
	readonly stderr: NodeJS.ReadableStream;
	on(event: 'error', listener: (err: Error) => void): unknown;
	on(event: 'close', listener: (code: number | null) => void): unknown;
	kill(signal?: string): boolean;
}

const CLAUDE_BINARY_NAME = process.platform === 'win32' ? 'claude.cmd' : 'claude';

// ---------------------------------------------------------------------------
// MCP approval server script (passed as `node -e` inside --mcp-config JSON)
// ---------------------------------------------------------------------------
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
// Per-session state
// ---------------------------------------------------------------------------

interface ISessionData {
	readonly sessionId: string;
	readonly proc: IChildProcess;
	readonly httpServer: Server | undefined;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ClaudeCliMainService extends Disposable implements IClaudeCliService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidSessionData = this._register(new Emitter<IClaudeCliDataPayload>());
	readonly onDidSessionData = this._onDidSessionData.event;

	private readonly _onDidSessionEnd = this._register(new Emitter<IClaudeCliEndPayload>());
	readonly onDidSessionEnd = this._onDidSessionEnd.event;

	private readonly _onDidPermissionRequest = this._register(new Emitter<IClaudeCliPermissionPayload>());
	readonly onDidPermissionRequest = this._onDidPermissionRequest.event;

	private readonly _sessions = new Map<string, ISessionData>();
	private readonly _pendingPermissions = new Map<string, (allow: boolean) => void>();
	private readonly _permissionSession = new Map<string, string>();
	/** Temporary HTTP server storage between _startPermissionServer and _spawnCli. */
	private readonly _pendingServers = new Map<string, Server>();

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	// -- Public API --

	async checkIsAvailable(): Promise<boolean> {
		return !!this._resolveClaudePath();
	}

	async startSession(sessionId: string, workspacePath: string, prompt: string, resumeCliSessionId?: string): Promise<void> {
		const claudePath = this._resolveClaudePath();
		if (!claudePath) {
			throw new Error('Claude Code CLI not found. Install from https://claude.ai/code');
		}
		await this.stopSession(sessionId);

		let permissionPort: number | undefined;
		try {
			permissionPort = await this._startPermissionServer(sessionId);
		} catch (err) {
			this._logService.warn(`[ClaudeCliMainService] permission server failed (${(err as Error)?.message ?? err}); spawning without approval bridge`);
		}

		this._spawnCli(sessionId, claudePath, workspacePath, prompt, permissionPort, resumeCliSessionId);
	}

	async stopSession(sessionId: string): Promise<void> {
		const session = this._sessions.get(sessionId);
		if (!session) {
			return;
		}
		for (const [reqId, sid] of this._permissionSession) {
			if (sid === sessionId) {
				const resolver = this._pendingPermissions.get(reqId);
				if (resolver) {
					this._pendingPermissions.delete(reqId);
					resolver(false);
				}
				this._permissionSession.delete(reqId);
			}
		}
		escalatingKill(session.proc);
		session.httpServer?.close();
		this._sessions.delete(sessionId);
	}

	async respondToPermission(requestId: string, allow: boolean): Promise<void> {
		const resolver = this._pendingPermissions.get(requestId);
		if (resolver) {
			this._pendingPermissions.delete(requestId);
			this._permissionSession.delete(requestId);
			resolver(allow);
		}
	}

	async checkAuthStatus(): Promise<'authenticated' | 'unauthenticated'> {
		const claudePath = this._resolveClaudePath();
		if (!claudePath) {
			return 'unauthenticated';
		}
		return new Promise(resolve => {
			execFile(claudePath, ['auth', 'status'], { timeout: 5000 }, err => {
				resolve(err ? 'unauthenticated' : 'authenticated');
			});
		});
	}

	// -- Private helpers --

	private _resolveClaudePath(): string | undefined {
		const configured = this._configurationService.getValue<string>('claudeCode.path');
		if (configured?.trim() && existsSync(configured.trim())) {
			return configured.trim();
		}
		return this._findClaudePathInline() ?? this._findViaPathEnv();
	}

	private _findClaudePathInline(): string | undefined {
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

	private _findViaPathEnv(): string | undefined {
		try {
			const result = execSync(`${CLAUDE_BINARY_NAME} --version`, { encoding: 'utf8', timeout: 3000 });
			if (result?.trim().length > 0) {
				return CLAUDE_BINARY_NAME;
			}
		} catch {
			// Not in PATH
		}
		return undefined;
	}

	private async _startPermissionServer(sessionId: string): Promise<number> {
		const { createServer } = await import('http');
		return new Promise<number>((resolve, reject) => {
			const server = createServer((req: IncomingMessage, res: ServerResponse) => {
				this._handleHttpPermission(req, res, sessionId);
			});
			server.on('error', reject);
			server.listen(0, '127.0.0.1', () => {
				const addr = server.address() as { port: number } | null;
				if (!addr) {
					reject(new Error('Could not determine bound port'));
					return;
				}
				this._pendingServers.set(sessionId, server);
				resolve(addr.port);
			});
		});
	}

	private _handleHttpPermission(req: IncomingMessage, res: ServerResponse, sessionId: string): void {
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
			const requestId = parsed.id;
			this._logService.info(`[ClaudeCliMainService] permission request '${parsed.tool_name}' (id=${requestId})`);

			this._pendingPermissions.set(requestId, (allow: boolean) => {
				const result = allow
					? { behavior: 'allow' }
					: { behavior: 'deny', message: 'Denied by VS Code user' };
				res.setHeader('Content-Type', 'application/json');
				res.end(JSON.stringify(result));
			});
			this._permissionSession.set(requestId, sessionId);

			this._onDidPermissionRequest.fire({
				sessionId,
				requestId,
				toolName: parsed.tool_name,
				toolInput: parsed.tool_input ?? {},
				description: parsed.description,
			});
		});
	}

	private _spawnCli(
		sessionId: string,
		claudePath: string,
		workspacePath: string,
		prompt: string,
		permissionPort: number | undefined,
		resumeCliSessionId?: string,
	): void {
		const args: string[] = [
			'-p', prompt,
			'--output-format', 'stream-json',
			'--verbose',
		];

		if (resumeCliSessionId) {
			args.push('--resume', resumeCliSessionId);
			this._logService.info(`[ClaudeCliMainService] resuming CLI session ${resumeCliSessionId}`);
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
			this._logService.info(`[ClaudeCliMainService] permission bridge active on port ${permissionPort}`);
		}

		this._logService.info(`[ClaudeCliMainService] spawning: ${claudePath} (cwd=${workspacePath})`);

		const proc = spawn(claudePath, args, {
			cwd: workspacePath,
			shell: false,
			env: { ...process.env },
		});

		const httpServer = this._pendingServers.get(sessionId);
		this._pendingServers.delete(sessionId);

		this._sessions.set(sessionId, {
			sessionId,
			proc: proc as unknown as IChildProcess,
			httpServer,
		});

		const rl = createInterface({ input: proc.stdout!, terminal: false });
		rl.on('line', (line: string) => {
			if (line.trim()) {
				this._onDidSessionData.fire({ sessionId, line });
			}
		});

		proc.stderr!.on('data', (chunk: Buffer) => {
			this._logService.warn(`[ClaudeCliMainService] [${sessionId}] stderr: ${chunk.toString('utf8').trim()}`);
		});

		proc.on('error', (err: Error) => {
			this._logService.error(`[ClaudeCliMainService] [${sessionId}] process error: ${err.message}`);
			this._cleanupSession(sessionId, 1);
		});

		proc.on('close', (code: number | null) => {
			this._logService.info(`[ClaudeCliMainService] [${sessionId}] exited with code ${code}`);
			this._cleanupSession(sessionId, code);
		});
	}

	private _cleanupSession(sessionId: string, code: number | null): void {
		for (const [reqId, sid] of this._permissionSession) {
			if (sid === sessionId) {
				const resolver = this._pendingPermissions.get(reqId);
				if (resolver) {
					this._pendingPermissions.delete(reqId);
					resolver(false);
				}
				this._permissionSession.delete(reqId);
			}
		}
		const session = this._sessions.get(sessionId);
		if (session) {
			session.httpServer?.close();
			this._sessions.delete(sessionId);
		}
		this._onDidSessionEnd.fire({ sessionId, code });
	}

	override dispose(): void {
		for (const session of this._sessions.values()) {
			escalatingKill(session.proc);
			session.httpServer?.close();
		}
		this._sessions.clear();
		for (const resolver of this._pendingPermissions.values()) {
			resolver(false);
		}
		this._pendingPermissions.clear();
		this._permissionSession.clear();
		super.dispose();
	}
}
