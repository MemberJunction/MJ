/**
 * Compaction of older tool-call arguments (`NativeControl.CompactToolArguments`).
 *
 * A write tool's argument is the whole document; without compaction it is resent on every later
 * turn. Older call turns keep their call id, name and small arguments, lose their large string
 * arguments to a stub, and lose the provider signature and reasoning minted for the original
 * arguments — so Gemini replays them under its placeholder signature, which always validates.
 */
import { describe, it, expect } from 'vitest';
import { CompactAnsweredToolCallArguments } from '../native-tools/tool-result-turns';
import type { AgentChatMessage } from '@memberjunction/ai-core-plus';

const big = 'x'.repeat(5000);
const callTurn = (id: string, args: Record<string, unknown>): AgentChatMessage => ({
    role: 'assistant',
    content: '',
    toolCalls: [{ id, name: 'write_file', arguments: args, providerMetadata: { thoughtSignature: `sig-${id}` } }],
    reasoning: [{ provider: 'gemini', kind: 'thought', text: 'thinking', signature: 'thought-sig' }]
}) as AgentChatMessage;
const result = (id: string): AgentChatMessage =>
    ({ role: 'tool', content: [{ type: 'tool_result', toolCallId: id, toolName: 'write_file', content: 'ok' }] }) as AgentChatMessage;

/** Four answered write turns, oldest first. */
const history = (): AgentChatMessage[] => [
    { role: 'user', content: 'Write the files.' } as AgentChatMessage,
    callTurn('c1', { path: 'a.ts', content: big }), result('c1'),
    callTurn('c2', { path: 'b.ts', content: big }), result('c2'),
    callTurn('c3', { path: 'c.ts', content: big }), result('c3'),
    callTurn('c4', { path: 'd.ts', content: big }), result('c4')
];

describe('CompactAnsweredToolCallArguments', () => {
    it('stubs the large arguments of all but the two most recent call turns', () => {
        const messages = history();

        expect(CompactAnsweredToolCallArguments(messages)).toBe(2);

        expect(messages[1].toolCalls?.[0].arguments).toEqual({ path: 'a.ts', content: '[content omitted: 5,000 characters sent to write_file]' });
        expect(messages[3].toolCalls?.[0].arguments.content).toMatch(/^\[content omitted/);
        expect(messages[5].toolCalls?.[0].arguments.content).toBe(big);
        expect(messages[7].toolCalls?.[0].arguments.content).toBe(big);
    });

    it('keeps the call id and name, and drops the signature and reasoning only on compacted turns', () => {
        const messages = history();

        CompactAnsweredToolCallArguments(messages);

        expect(messages[1].toolCalls?.[0]).toMatchObject({ id: 'c1', name: 'write_file' });
        expect(messages[1].toolCalls?.[0].providerMetadata).toBeUndefined();
        expect(messages[1].reasoning).toBeUndefined();
        expect(messages[7].toolCalls?.[0].providerMetadata).toEqual({ thoughtSignature: 'sig-c4' });
        expect(messages[7].reasoning).toHaveLength(1);
    });

    it('leaves a turn with only small arguments exactly as it was, signature included', () => {
        const messages = [callTurn('c1', { path: 'a.ts' }), result('c1'), callTurn('c2', {}), callTurn('c3', {})];
        const before = messages[0];

        expect(CompactAnsweredToolCallArguments(messages)).toBe(0);
        expect(messages[0]).toBe(before);
    });

    it('does nothing with fewer call turns than it keeps', () => {
        const messages = history().slice(0, 5);

        expect(CompactAnsweredToolCallArguments(messages)).toBe(0);
    });
});
