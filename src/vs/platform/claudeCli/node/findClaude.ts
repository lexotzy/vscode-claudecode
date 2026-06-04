/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'fs';
import { join } from '../../../base/common/path.js';

/**
 * Resolves the absolute path to the `claude` CLI binary.
 *
 * Resolution order:
 * 1. Explicit override via `CLAUDE_CLI_PATH` environment variable
 * 2. Common install locations (macOS/Linux: ~/.local/bin, ~/.superset/bin, npm global)
 * 3. Windows: %APPDATA%\npm, %LOCALAPPDATA%\Programs\claude
 * 4. System PATH via `which`/`where` (caller must exec this as a fallback)
 *
 * Returns `undefined` when no binary is found — callers should surface a
 * "Claude Code not found" error and link to installation docs.
 */
export function findClaudePath(): string | undefined {
	// 1. Explicit override
	const envOverride = process.env['CLAUDE_CLI_PATH'];
	if (envOverride && existsSync(envOverride)) {
		return envOverride;
	}

	const home = process.env['HOME'] || process.env['USERPROFILE'] || '';
	const isWindows = process.platform === 'win32';

	if (isWindows) {
		const candidates = buildWindowsCandidates();
		for (const p of candidates) {
			if (existsSync(p)) { return p; }
		}
	} else {
		const candidates = buildUnixCandidates(home);
		for (const p of candidates) {
			if (existsSync(p)) { return p; }
		}
	}

	return undefined;
}

function buildUnixCandidates(home: string): string[] {
	return [
		// Superset install (this machine's confirmed location)
		join(home, '.superset', 'bin', 'claude'),
		// npm global
		join(home, '.npm-global', 'bin', 'claude'),
		join(home, '.local', 'bin', 'claude'),
		// nvm / fnm installed node
		join(home, '.nvm', 'versions', 'node', 'current', 'bin', 'claude'),
		// Homebrew (Apple Silicon)
		'/opt/homebrew/bin/claude',
		// Homebrew (Intel)
		'/usr/local/bin/claude',
		// System PATH fallback
		'/usr/bin/claude',
	];
}

function buildWindowsCandidates(): string[] {
	const appData = process.env['APPDATA'] || '';
	const localAppData = process.env['LOCALAPPDATA'] || '';
	return [
		join(appData, 'npm', 'claude.cmd'),
		join(appData, 'npm', 'claude'),
		join(localAppData, 'Programs', 'claude', 'claude.exe'),
		join(localAppData, 'Programs', 'claude', 'claude.cmd'),
	];
}

/**
 * The CLI binary name to use when falling back to PATH resolution via child_process.
 * On Windows, try `claude.cmd` first (npm global shim), then `claude`.
 */
export const CLAUDE_BINARY_NAME = process.platform === 'win32' ? 'claude.cmd' : 'claude';
