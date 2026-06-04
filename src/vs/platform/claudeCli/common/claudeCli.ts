/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ClaudeCliStreamEvent } from './streamJson.js';

export const IClaudeCliService = createDecorator<IClaudeCliService>('claudeCliService');

/**
 * A pending tool-permission request forwarded from the Claude Code CLI via
 * the `--permission-prompt-tool` MCP bridge.
 */
export interface IPermissionRequest {
	readonly requestId: string;
	readonly toolName: string;
	readonly toolInput: Record<string, unknown>;
	readonly description?: string;
}

/**
 * A running Claude Code CLI process bound to a workspace folder.
 */
export interface IClaudeCliSession extends IDisposable {
	readonly sessionId: string;
	readonly workspaceUri: URI;

	/** Fires for every parsed stream-json event from the CLI process. */
	readonly onDidEmitEvent: Event<ClaudeCliStreamEvent>;

	/** Fires once when the process exits, with the exit code. */
	readonly onDidExit: Event<number>;

	/**
	 * Fires when the CLI requests permission for a tool use via the
	 * `--permission-prompt-tool` MCP bridge.  Only fires when the in-process
	 * HTTP approval server started successfully; callers MUST respond via
	 * {@link respondToPermission} or the CLI will stall indefinitely.
	 */
	readonly onPermissionRequest: Event<IPermissionRequest>;

	/** Send a follow-up message to a running interactive session (stdin). */
	sendInput(text: string): void;

	/** Terminate the underlying process. */
	cancel(): void;

	/**
	 * Resolve a pending permission request.
	 * @param requestId The {@link IPermissionRequest.requestId} to resolve.
	 * @param allow     `true` = allow the tool use, `false` = deny it.
	 */
	respondToPermission(requestId: string, allow: boolean): void;
}

/**
 * Manages Claude Code CLI processes — one per workspace folder.
 * Spawns `claude --output-format stream-json`, parses events, and exposes them.
 */
export interface IClaudeCliService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether the `claude` binary was found on this machine.
	 * When `false`, the provider should surface an "install Claude Code" prompt.
	 */
	readonly isAvailable: boolean;

	/**
	 * Resolved path to the `claude` binary, or `undefined` when not found.
	 */
	readonly claudePath: string | undefined;

	/**
	 * Start a new Claude Code session for the given workspace folder.
	 * The prompt is passed as `-p <prompt>` to the CLI.
	 *
	 * Only one session per workspace folder is allowed at a time.
	 * Calling this while a session is already running for the same folder
	 * disposes the previous session first.
	 *
	 * @param workspaceUri    The workspace folder URI (fsPath used as cwd).
	 * @param prompt          The initial user prompt.
	 * @param sessionId       Stable identifier for this session (from the sessions provider).
	 * @param resumeSessionId When provided, passes `--resume <id>` so Claude continues
	 *                        the prior conversation instead of starting fresh.
	 */
	startSession(workspaceUri: URI, prompt: string, sessionId: string, resumeSessionId?: string): IClaudeCliSession;

	/**
	 * Returns the active session for a given workspace URI, if any.
	 */
	getSession(workspaceUri: URI): IClaudeCliSession | undefined;

	/**
	 * Terminate the active session for a workspace and release resources.
	 */
	stopSession(workspaceUri: URI): void;

	/**
	 * Check whether the user is authenticated with Claude Code.
	 * Runs `claude auth status` and resolves based on exit code.
	 * Returns `'unauthenticated'` when the binary is unavailable.
	 */
	checkAuthStatus(): Promise<'authenticated' | 'unauthenticated'>;
}
