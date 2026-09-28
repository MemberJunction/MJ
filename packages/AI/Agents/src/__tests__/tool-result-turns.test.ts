import { describe, it, expect } from 'vitest';
import { BuildAssistantToolCallTurn, BuildToolResultTurn, CompactToolResultContent } from '../native-tools/tool-result-turns';

const calls = [{ id: 'call_0', name: 'run_ad_hoc_query', arguments: { Query: 'q' } }, { id: 'call_1', name: 'get_entity_details', arguments: {} }];

describe('buildAssistantToolCallTurn', () => {
    it('is an assistant turn carrying the calls verbatim and the narration as content', () => {
        const m = BuildAssistantToolCallTurn({ text: 'Checking two things.', toolCalls: calls });
        expect(m.role).toBe('assistant');
        expect(m.content).toBe('Checking two things.');
        expect(m.toolCalls).toEqual(calls);
    });
    it('uses an empty string when the model wrote nothing beside the calls', () => {
        expect(BuildAssistantToolCallTurn({ text: '', toolCalls: calls }).content).toBe('');
    });
});

describe('buildToolResultTurn', () => {
    it('is a tool turn with one tool_result block per result, paired by toolCallId, errors flagged', () => {
        const m = BuildToolResultTurn([
            { toolCallId: 'call_0', toolName: 'run_ad_hoc_query', content: '| n |\n| 3 |', isError: false },
            { toolCallId: 'call_1', toolName: 'get_entity_details', content: 'Entity not found', isError: true }
        ], { turnAdded: 2, messageType: 'action-result', expirationTurns: 3, expirationMode: 'Compact' });
        expect(m.role).toBe('tool');
        expect(Array.isArray(m.content)).toBe(true);
        const blocks = m.content as Array<Record<string, unknown>>;
        expect(blocks.map((b) => [b.type, b.toolCallId, b.toolName, b.isError])).toEqual([
            ['tool_result', 'call_0', 'run_ad_hoc_query', false], ['tool_result', 'call_1', 'get_entity_details', true]]);
        expect(m.metadata?.messageType).toBe('action-result');
    });
});

describe('compactToolResultContent', () => {
    it("compacts each block's content and never replaces the block array", () => {
        const m = BuildToolResultTurn([{ toolCallId: 'call_0', toolName: 'x', content: 'a'.repeat(100), isError: false }], undefined);
        const c = CompactToolResultContent(m, (t) => t.slice(0, 10) + '…');
        expect(Array.isArray(c.content)).toBe(true);
        expect((c.content as Array<{ content: string }>)[0].content).toBe('aaaaaaaaaa…');
    });
});
