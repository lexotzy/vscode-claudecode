/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClaudeCliStreamEvent } from './streamJson.js';

/**
 * Incremental newline-delimited JSON parser for Claude Code CLI stream-json output.
 *
 * Handles partial lines (stdout chunks may not align to line boundaries).
 * Never throws on malformed input — invalid lines are logged and skipped.
 * Pure function — no I/O, no side effects, easily unit-testable.
 */
export class StreamJsonParser {

	private _buffer = '';

	/**
	 * Feed a raw stdout chunk. Returns zero or more parsed events.
	 * Partial lines are buffered until a newline arrives.
	 */
	feed(chunk: string): ClaudeCliStreamEvent[] {
		this._buffer += chunk;
		const events: ClaudeCliStreamEvent[] = [];

		let newlineIdx: number;
		while ((newlineIdx = this._buffer.indexOf('\n')) !== -1) {
			const line = this._buffer.slice(0, newlineIdx).trimEnd();
			this._buffer = this._buffer.slice(newlineIdx + 1);

			if (line.length === 0) {
				continue;
			}

			const event = parseLine(line);
			if (event !== undefined) {
				events.push(event);
			}
		}

		return events;
	}

	/**
	 * Flush any remaining buffered content (e.g. after process exit without trailing newline).
	 */
	flush(): ClaudeCliStreamEvent[] {
		const remaining = this._buffer.trim();
		this._buffer = '';

		if (remaining.length === 0) {
			return [];
		}

		const event = parseLine(remaining);
		return event !== undefined ? [event] : [];
	}

	reset(): void {
		this._buffer = '';
	}
}

function parseLine(line: string): ClaudeCliStreamEvent | undefined {
	if (!line.startsWith('{')) {
		return undefined;
	}

	try {
		return JSON.parse(line) as ClaudeCliStreamEvent;
	} catch {
		// Malformed JSON — skip silently (caller may log if needed)
		return undefined;
	}
}
