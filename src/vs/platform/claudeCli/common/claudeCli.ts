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
 * A running Claude Code CLI process bound to a workspace folder.
 */
export interface IClaudeCliSession extends IDisposable {
	readonly sessionId: string;
	readonly workspaceUri: URI;

	/** Fires for every parsed stream-json event from the CLI process. */
	readonly onDidEmitEvent: Event<ClaudeCliStreamEvent>;

	/** Fires once when the process exits, with the exit code. */
	readonly onDidExit: Event<number>;

	/** Send a follow-up message to a running interactive session (stdin). */
	sendInput(text: string): void;

	/** Terminate the underlying process. */
	cancel(): void;
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
	 * @param workspaceUri The workspace folder URI (fsPath used as cwd).
	 * @param prompt The initial user prompt.
	 * @param sessionId Stable identifier for this session (from the sessions provider).
	 */
	startSession(workspaceUri: URI, prompt: string, sessionId: string): IClaudeCliSession;

	/**
	 * Returns the active session for a given workspace URI, if any.
	 */
	getSession(workspaceUri: URI): IClaudeCliSession | undefined;

	/**
	 * Terminate the active session for a workspace and release resources.
	 */
	stopSession(workspaceUri: URI): void;
}
