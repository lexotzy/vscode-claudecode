/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IClaudeCliService = createDecorator<IClaudeCliService>('claudeCliService');

/** Raw NDJSON line emitted by the Claude CLI stdout for a session. */
export interface IClaudeCliDataPayload {
	readonly sessionId: string;
	readonly line: string;
}

/** Emitted when a Claude CLI process exits. */
export interface IClaudeCliEndPayload {
	readonly sessionId: string;
	readonly code: number | null;
}

/** Emitted when Claude Code requests permission to use a tool. */
export interface IClaudeCliPermissionPayload {
	readonly sessionId: string;
	readonly requestId: string;
	readonly toolName: string;
	readonly toolInput: Record<string, unknown>;
	readonly description?: string;
}

/**
 * Manages Claude Code CLI processes.
 * All events are service-level and tagged with `sessionId` so multiple sessions
 * can share a single IPC channel.
 */
export interface IClaudeCliService {
	readonly _serviceBrand: undefined;

	/** Fires for each complete NDJSON line from a running CLI process. */
	readonly onDidSessionData: Event<IClaudeCliDataPayload>;

	/** Fires when a CLI process exits. */
	readonly onDidSessionEnd: Event<IClaudeCliEndPayload>;

	/** Fires when Claude Code requests tool permission via the MCP bridge. */
	readonly onDidPermissionRequest: Event<IClaudeCliPermissionPayload>;

	/** Returns true if the claude binary is discoverable. */
	checkIsAvailable(): Promise<boolean>;

	/**
	 * Spawns a Claude CLI process for the given workspace.
	 * Events for this session are tagged with `sessionId` on the service-level emitters.
	 */
	startSession(sessionId: string, workspacePath: string, prompt: string, resumeCliSessionId?: string, modelId?: string): Promise<void>;

	/** Terminates the CLI process for the given session and cleans up resources. */
	stopSession(sessionId: string): Promise<void>;

	/** Responds to a pending tool permission request (allow or deny). */
	respondToPermission(requestId: string, allow: boolean): Promise<void>;

	/** Checks whether the user is authenticated with Claude Code. */
	checkAuthStatus(): Promise<'authenticated' | 'unauthenticated'>;
}
