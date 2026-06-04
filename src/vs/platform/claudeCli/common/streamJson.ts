/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Typed discriminated union for Claude Code CLI `--output-format stream-json` events.
 *
 * Schema captured from claude-code v2.1.162. Each event is a newline-delimited JSON line.
 * All consumers must parse defensively — unknown types should be skipped, not thrown.
 *
 * @see https://docs.anthropic.com/en/docs/claude-code/cli-reference#output-formats
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type ClaudeCliStreamEvent =
	| ClaudeCliSystemEvent
	| ClaudeCliAssistantEvent
	| ClaudeCliRateLimitEvent
	| ClaudeCliResultEvent
	| ClaudeCliUnknownEvent;

// ---------------------------------------------------------------------------
// system events
// ---------------------------------------------------------------------------

export type ClaudeCliSystemEvent =
	| ClaudeCliSystemInitEvent
	| ClaudeCliSystemHookStartedEvent
	| ClaudeCliSystemHookResponseEvent
	| ClaudeCliSystemUnknownEvent;

export interface ClaudeCliSystemInitEvent {
	readonly type: 'system';
	readonly subtype: 'init';
	readonly cwd: string;
	readonly session_id: string;
	readonly model: string;
	readonly permissionMode: string;
	readonly apiKeySource: string;
	readonly claude_code_version: string;
	readonly tools: readonly string[];
	readonly uuid: string;
}

export interface ClaudeCliSystemHookStartedEvent {
	readonly type: 'system';
	readonly subtype: 'hook_started';
	readonly hook_id: string;
	readonly hook_name: string;
	readonly hook_event: string;
	readonly uuid: string;
	readonly session_id: string;
}

export interface ClaudeCliSystemHookResponseEvent {
	readonly type: 'system';
	readonly subtype: 'hook_response';
	readonly hook_id: string;
	readonly hook_name: string;
	readonly hook_event: string;
	readonly output: string;
	readonly stdout: string;
	readonly stderr: string;
	readonly exit_code: number;
	readonly outcome: 'success' | 'error';
	readonly uuid: string;
	readonly session_id: string;
}

export interface ClaudeCliSystemUnknownEvent {
	readonly type: 'system';
	readonly subtype: string;
	readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// assistant events — streaming message chunks
// ---------------------------------------------------------------------------

export interface ClaudeCliAssistantEvent {
	readonly type: 'assistant';
	readonly message: ClaudeCliAssistantMessage;
	readonly parent_tool_use_id: string | null;
	readonly session_id: string;
	readonly uuid: string;
	readonly request_id: string;
}

export interface ClaudeCliAssistantMessage {
	readonly model: string;
	readonly id: string;
	readonly type: 'message';
	readonly role: 'assistant';
	readonly content: readonly ClaudeCliContentBlock[];
	readonly stop_reason: string | null;
	readonly usage: ClaudeCliUsage;
}

export type ClaudeCliContentBlock =
	| ClaudeCliTextBlock
	| ClaudeCliThinkingBlock
	| ClaudeCliToolUseBlock;

export interface ClaudeCliTextBlock {
	readonly type: 'text';
	readonly text: string;
}

export interface ClaudeCliThinkingBlock {
	readonly type: 'thinking';
	readonly thinking: string;
	readonly signature: string;
}

export interface ClaudeCliToolUseBlock {
	readonly type: 'tool_use';
	readonly id: string;
	readonly name: string;
	readonly input: Record<string, unknown>;
	readonly caller?: { readonly type: string };
}

export interface ClaudeCliUsage {
	readonly input_tokens: number;
	readonly output_tokens: number;
	readonly cache_read_input_tokens?: number;
	readonly cache_creation_input_tokens?: number;
}

// ---------------------------------------------------------------------------
// rate_limit_event
// ---------------------------------------------------------------------------

export interface ClaudeCliRateLimitEvent {
	readonly type: 'rate_limit_event';
	readonly rate_limit_info: {
		readonly status: 'allowed' | 'rate_limited';
		readonly resetsAt: number;
		readonly rateLimitType: string;
	};
	readonly uuid: string;
	readonly session_id: string;
}

// ---------------------------------------------------------------------------
// result — final event, always last
// ---------------------------------------------------------------------------

export interface ClaudeCliResultEvent {
	readonly type: 'result';
	readonly subtype: 'success' | 'error';
	readonly is_error: boolean;
	readonly result: string;
	readonly stop_reason: string;
	readonly session_id: string;
	readonly duration_ms: number;
	readonly num_turns: number;
	readonly total_cost_usd: number;
	readonly usage: ClaudeCliResultUsage;
	readonly permission_denials: readonly unknown[];
	readonly terminal_reason: string;
	readonly uuid: string;
}

export interface ClaudeCliResultUsage {
	readonly input_tokens: number;
	readonly output_tokens: number;
	readonly cache_read_input_tokens?: number;
	readonly cache_creation_input_tokens?: number;
}

// ---------------------------------------------------------------------------
// unknown — forward-compat fallback
// ---------------------------------------------------------------------------

export interface ClaudeCliUnknownEvent {
	readonly type: string;
	readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isSystemEvent(e: ClaudeCliStreamEvent): e is ClaudeCliSystemEvent {
	return e.type === 'system';
}

export function isSystemInitEvent(e: ClaudeCliStreamEvent): e is ClaudeCliSystemInitEvent {
	return e.type === 'system' && (e as ClaudeCliSystemEvent).subtype === 'init';
}

export function isAssistantEvent(e: ClaudeCliStreamEvent): e is ClaudeCliAssistantEvent {
	return e.type === 'assistant';
}

export function isResultEvent(e: ClaudeCliStreamEvent): e is ClaudeCliResultEvent {
	return e.type === 'result';
}

export function isToolUseBlock(b: ClaudeCliContentBlock): b is ClaudeCliToolUseBlock {
	return b.type === 'tool_use';
}

export function isTextBlock(b: ClaudeCliContentBlock): b is ClaudeCliTextBlock {
	return b.type === 'text';
}

export function isThinkingBlock(b: ClaudeCliContentBlock): b is ClaudeCliThinkingBlock {
	return b.type === 'thinking';
}
