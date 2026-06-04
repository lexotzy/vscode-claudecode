/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How long to wait after SIGTERM before sending SIGKILL.
 * 5 s is generous — claude typically exits within 1 s of SIGTERM.
 */
export const SIGTERM_TO_SIGKILL_TIMEOUT_MS = 5_000;

/** Minimal process interface required by escalatingKill. */
export interface IKillableProcess {
	kill(signal?: string): boolean;
	on(event: 'close', listener: (code: number | null) => void): unknown;
}

/**
 * Sends SIGTERM to the process immediately, then escalates to SIGKILL if the
 * process has not exited within `timeoutMs`.  The SIGKILL timer is cancelled
 * automatically when the process closes, so callers do not need to track it.
 *
 * @param proc      The process to terminate.
 * @param timeoutMs Milliseconds to wait before escalating (default 5 s).
 */
export function escalatingKill(proc: IKillableProcess, timeoutMs = SIGTERM_TO_SIGKILL_TIMEOUT_MS): void {
	proc.kill('SIGTERM');
	const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
	proc.on('close', () => clearTimeout(timer));
}
