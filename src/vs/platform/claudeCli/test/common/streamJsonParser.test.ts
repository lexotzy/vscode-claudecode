/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { StreamJsonParser } from '../../common/streamJsonParser.js';
import { isAssistantEvent, isResultEvent, isSystemInitEvent } from '../../common/streamJson.js';

suite('StreamJsonParser', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let parser: StreamJsonParser;

	setup(() => {
		parser = new StreamJsonParser();
	});

	test('parses a single complete line', () => {
		const events = parser.feed('{"type":"result","subtype":"success","is_error":false,"result":"Hello!","stop_reason":"end_turn","session_id":"abc","duration_ms":100,"num_turns":1,"total_cost_usd":0.01,"usage":{"input_tokens":3,"output_tokens":5},"permission_denials":[],"terminal_reason":"completed","uuid":"xyz"}\n');
		assert.strictEqual(events.length, 1);
		assert.ok(isResultEvent(events[0]));
	});

	test('parses multiple lines in one chunk', () => {
		const chunk = [
			'{"type":"system","subtype":"init","cwd":"/tmp","session_id":"s1","model":"claude-sonnet-4-6","permissionMode":"default","apiKeySource":"none","claude_code_version":"2.0.0","tools":[],"uuid":"u1"}',
			'{"type":"assistant","message":{"model":"claude-sonnet-4-6","id":"msg_1","type":"message","role":"assistant","content":[{"type":"text","text":"Hi"}],"stop_reason":null,"usage":{"input_tokens":1,"output_tokens":1}},"parent_tool_use_id":null,"session_id":"s1","uuid":"u2","request_id":"r1"}',
		].join('\n') + '\n';

		const events = parser.feed(chunk);
		assert.strictEqual(events.length, 2);
		assert.ok(isSystemInitEvent(events[0]));
		assert.ok(isAssistantEvent(events[1]));
	});

	test('buffers partial lines across chunks', () => {
		const line = '{"type":"result","subtype":"success","is_error":false,"result":"ok","stop_reason":"end_turn","session_id":"s","duration_ms":1,"num_turns":1,"total_cost_usd":0,"usage":{"input_tokens":1,"output_tokens":1},"permission_denials":[],"terminal_reason":"completed","uuid":"u"}';

		// Split at arbitrary positions
		const mid = Math.floor(line.length / 2);
		const events1 = parser.feed(line.slice(0, mid));
		assert.strictEqual(events1.length, 0, 'no events before newline');

		const events2 = parser.feed(line.slice(mid) + '\n');
		assert.strictEqual(events2.length, 1);
		assert.ok(isResultEvent(events2[0]));
	});

	test('skips malformed JSON lines silently', () => {
		const events = parser.feed('not valid json\n{"type":"result","subtype":"success","is_error":false,"result":"ok","stop_reason":"end_turn","session_id":"s","duration_ms":1,"num_turns":1,"total_cost_usd":0,"usage":{"input_tokens":1,"output_tokens":1},"permission_denials":[],"terminal_reason":"completed","uuid":"u"}\n');
		assert.strictEqual(events.length, 1);
		assert.ok(isResultEvent(events[0]));
	});

	test('skips empty lines', () => {
		const events = parser.feed('\n\n\n');
		assert.strictEqual(events.length, 0);
	});

	test('flush returns remaining buffered content without newline', () => {
		const line = '{"type":"result","subtype":"success","is_error":false,"result":"ok","stop_reason":"end_turn","session_id":"s","duration_ms":1,"num_turns":1,"total_cost_usd":0,"usage":{"input_tokens":1,"output_tokens":1},"permission_denials":[],"terminal_reason":"completed","uuid":"u"}';
		parser.feed(line); // no trailing newline
		const events = parser.flush();
		assert.strictEqual(events.length, 1);
		assert.ok(isResultEvent(events[0]));
	});

	test('flush clears buffer', () => {
		parser.feed('partial');
		parser.flush();
		const events = parser.feed('\n'); // leftover newline should yield nothing
		assert.strictEqual(events.length, 0);
	});

	test('reset clears buffer without emitting', () => {
		parser.feed('{"type":"res');
		parser.reset();
		const events = parser.feed('ult"}\n'); // would be malformed anyway, but buffer is cleared
		assert.strictEqual(events.length, 0);
	});

	test('parses tool_use content block', () => {
		const line = JSON.stringify({
			type: 'assistant',
			message: {
				model: 'claude-sonnet-4-6',
				id: 'msg_1',
				type: 'message',
				role: 'assistant',
				content: [{ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/tmp/x' }, caller: { type: 'direct' } }],
				stop_reason: null,
				usage: { input_tokens: 1, output_tokens: 1 },
			},
			parent_tool_use_id: null,
			session_id: 's1',
			uuid: 'u1',
			request_id: 'r1',
		}) + '\n';

		const events = parser.feed(line);
		assert.strictEqual(events.length, 1);
		assert.ok(isAssistantEvent(events[0]));
		if (isAssistantEvent(events[0])) {
			const block = events[0].message.content[0];
			assert.strictEqual(block.type, 'tool_use');
			if (block.type === 'tool_use') {
				assert.strictEqual(block.name, 'Read');
			}
		}
	});
});
