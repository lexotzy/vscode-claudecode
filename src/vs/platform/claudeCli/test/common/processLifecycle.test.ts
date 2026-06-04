/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { escalatingKill, IKillableProcess } from '../../common/processLifecycle.js';

suite('escalatingKill', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeFakeProcess(): { proc: IKillableProcess; signals: string[]; triggerClose: () => void } {
		const signals: string[] = [];
		let closeListener: ((code: number | null) => void) | undefined;
		const proc: IKillableProcess = {
			kill: (signal) => { signals.push(signal ?? 'SIGTERM'); return true; },
			on: (event, listener) => {
				if (event === 'close') {
					closeListener = listener as (code: number | null) => void;
				}
				return proc as unknown as NodeJS.EventEmitter;
			},
		};
		return { proc, signals, triggerClose: () => closeListener?.(0) };
	}

	test('sends SIGTERM immediately', () => {
		const { proc, signals } = makeFakeProcess();
		escalatingKill(proc, 10_000);
		assert.deepStrictEqual(signals, ['SIGTERM']);
	});

	test('escalates to SIGKILL after timeout when process has not exited', async () => {
		const { proc, signals } = makeFakeProcess();
		escalatingKill(proc, 50);
		await new Promise<void>(resolve => setTimeout(resolve, 120));
		assert.deepStrictEqual(signals, ['SIGTERM', 'SIGKILL']);
	});

	test('does not escalate to SIGKILL when process exits before timeout', async () => {
		const { proc, signals, triggerClose } = makeFakeProcess();
		escalatingKill(proc, 300);
		await new Promise<void>(resolve => setTimeout(resolve, 20));
		triggerClose();
		await new Promise<void>(resolve => setTimeout(resolve, 350));
		assert.deepStrictEqual(signals, ['SIGTERM']);
	});
});
