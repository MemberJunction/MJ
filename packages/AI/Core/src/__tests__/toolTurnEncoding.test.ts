/**
 * EncodeToolTurnsAsText — the one rendering of a native history for a model without tools.
 *
 * The runner's native→envelope fallback stripped the declarations but
 * kept the functionCall / tool_result turns, so the retry failed for a second reason and the loop
 * burned its remaining attempts on the same request.
 */
import { describe, expect, it } from 'vitest';
import { ACTION_RESULT_TEXT_PREFIX, EncodeToolTurnsAsText } from '../generic/toolTurnEncoding';
import type { ChatMessage } from '../generic/chat.types';

const nativeHistory: ChatMessage[] = [
    { role: 'system', content: 'You are the agent.' },
    { role: 'user', content: 'Find the members.' },
    {
        role: 'assistant',
        content: 'Looking that up.',
        toolCalls: [
            { id: 'call_1', name: 'get_entity_details', arguments: { entityName: 'Members' } },
            { id: 'call_2', name: 'run_query', arguments: { sql: 'SELECT 1' } }
        ]
    },
    {
        role: 'tool',
        content: [
            { type: 'tool_result', toolCallId: 'call_1', toolName: 'get_entity_details', isError: false, content: '# Members\n- ID' },
            { type: 'tool_result', toolCallId: 'call_2', toolName: 'run_query', isError: true, content: 'Invalid object name' }
        ]
    },
    { role: 'assistant', content: 'Done.' }
];

describe('EncodeToolTurnsAsText', () => {
    it('keeps the call turn\'s prose, renders every tool result as an [Action Result] user message, and passes other turns through', () => {
        const out = EncodeToolTurnsAsText(nativeHistory);
        expect(out.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user', 'user', 'assistant']);
        expect(out[2]).toEqual({ role: 'assistant', content: 'Looking that up.' });
        expect(out[3]).toEqual({ role: 'user', content: `${ACTION_RESULT_TEXT_PREFIX} get_entity_details succeeded. # Members\n- ID` });
        expect(out[4]).toEqual({ role: 'user', content: `${ACTION_RESULT_TEXT_PREFIX} run_query failed. Invalid object name` });
        expect(out[0]).toBe(nativeHistory[0]); // untouched turns are the same objects
        expect(out[5]).toBe(nativeHistory[4]);
        expect(out.some((m) => m.toolCalls || m.role === 'tool')).toBe(false); // nothing native survives
    });

    it('drops a call turn that carried no prose — the envelope path never had the model\'s own call turn', () => {
        const out = EncodeToolTurnsAsText([
            { role: 'assistant', content: '', toolCalls: [{ id: 'c', name: 'get_entity_details', arguments: {} }] },
            { role: 'tool', content: [{ type: 'tool_result', toolCallId: 'c', toolName: 'get_entity_details', isError: false, content: 'x' }] }
        ]);
        expect(out).toEqual([{ role: 'user', content: `${ACTION_RESULT_TEXT_PREFIX} get_entity_details succeeded. x` }]);
    });

    it('reads a call turn\'s prose out of text blocks too, and names an unnamed result "tool"', () => {
        const out = EncodeToolTurnsAsText([
            { role: 'assistant', content: [{ type: 'text', content: 'first' }, { type: 'text', content: 'second' }], toolCalls: [{ id: 'c', name: 't', arguments: {} }] },
            { role: 'tool', content: [{ type: 'tool_result', toolCallId: 'c', isError: false, content: 'r' }] }
        ]);
        expect(out).toEqual([
            { role: 'assistant', content: 'first\nsecond' },
            { role: 'user', content: `${ACTION_RESULT_TEXT_PREFIX} tool succeeded. r` }
        ]);
    });

    it('returns an already-textual history unchanged, message for message', () => {
        const textual: ChatMessage[] = [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }];
        expect(EncodeToolTurnsAsText(textual)).toEqual(textual);
    });
});
