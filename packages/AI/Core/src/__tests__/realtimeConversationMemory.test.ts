import { describe, it, expect, vi } from 'vitest';
import {
    RealtimeConversationMemory,
    RenderRealtimeMemorySeed,
    REALTIME_MEMORY_MAX_SEED_CHARS,
    REALTIME_MEMORY_MAX_ENTRY_CHARS,
    REALTIME_MEMORY_TRUNCATED_TAIL,
} from '../generic/realtimeConversationMemory';

describe('RealtimeConversationMemory', () => {
    it('records entries in order and Seed returns them oldest first', () => {
        const m = new RealtimeConversationMemory();
        m.Record({ Kind: 'user', Text: 'hi' });
        m.Record({ Kind: 'assistant', Text: 'Question 1' });
        expect(m.Seed().Entries.map((e) => e.Kind)).toEqual(['user', 'assistant']);
        expect(m.Length).toBe(2);
    });

    it('ignores blank text', () => {
        const m = new RealtimeConversationMemory();
        m.Record({ Kind: 'user', Text: '  ' });
        m.Record({ Kind: 'assistant', Text: '' });
        m.Record({ Kind: 'note', Text: '\n\t' });
        expect(m.Length).toBe(0);
        expect(m.Seed().Entries).toEqual([]);
    });

    it('truncates a long entry with the tail marker at Record time', () => {
        const m = new RealtimeConversationMemory({ MaxEntryChars: 10 });
        m.Record({ Kind: 'toolResult', Name: 'lookup_order', OutputJson: 'x'.repeat(50) });
        const e = m.Seed().Entries[0];
        expect(e.Kind === 'toolResult' && e.OutputJson.endsWith(REALTIME_MEMORY_TRUNCATED_TAIL)).toBe(true);
        expect(e.Kind === 'toolResult' && e.OutputJson.length).toBe(10 + REALTIME_MEMORY_TRUNCATED_TAIL.length);
    });

    it('logs one line naming the kind and tool, never the content, when Record truncates', () => {
        const Log = vi.fn();
        const m = new RealtimeConversationMemory({ MaxEntryChars: 5, Log });
        m.Record({ Kind: 'toolCall', Name: 'lookup_order', ArgumentsJson: 'secret-arguments' });
        m.Record({ Kind: 'user', Text: 'short' });
        expect(Log).toHaveBeenCalledTimes(1);
        const line = Log.mock.calls[0][0] as string;
        expect(line).toContain('toolCall');
        expect(line).toContain('lookup_order');
        expect(line).not.toContain('secret');
    });

    it('truncates Text and ArgumentsJson too', () => {
        const m = new RealtimeConversationMemory({ MaxEntryChars: 4 });
        m.Record({ Kind: 'user', Text: 'abcdefgh' });
        m.Record({ Kind: 'toolCall', Name: 'n', ArgumentsJson: '12345678' });
        const [u, c] = m.Seed().Entries;
        expect(u.Kind === 'user' && u.Text).toBe('abcd' + REALTIME_MEMORY_TRUNCATED_TAIL);
        expect(c.Kind === 'toolCall' && c.ArgumentsJson).toBe('1234' + REALTIME_MEMORY_TRUNCATED_TAIL);
    });

    it('drops the oldest whole entries when the seed cap is exceeded and counts them', () => {
        const m = new RealtimeConversationMemory({ MaxSeedChars: 12 });
        m.Record({ Kind: 'user', Text: 'aaaaa' });
        m.Record({ Kind: 'assistant', Text: 'bbbbb' });
        m.Record({ Kind: 'user', Text: 'ccccc' });
        const seed = m.Seed();
        expect(seed.Entries.map((e) => (e as { Text: string }).Text)).toEqual(['bbbbb', 'ccccc']);
        expect(seed.DroppedEntries).toBe(1);
        expect(seed.Chars).toBe(10);
    });

    it('counts tool entries as Name plus payload length', () => {
        const m = new RealtimeConversationMemory();
        m.Record({ Kind: 'toolCall', Name: 'abc', ArgumentsJson: '{"a":1}' });
        expect(m.Seed().Chars).toBe(3 + 7);
    });

    it('Seed is pure and Clear empties the ledger', () => {
        const Log = vi.fn();
        const m = new RealtimeConversationMemory({ MaxSeedChars: 6, Log });
        m.Record({ Kind: 'user', Text: 'aaaaa' });
        m.Record({ Kind: 'user', Text: 'bbbbb' });
        const first = m.Seed();
        const second = m.Seed();
        expect(second).toEqual(first);
        expect(m.Length).toBe(2);
        expect(Log).not.toHaveBeenCalled();
        m.Clear();
        expect(m.Length).toBe(0);
        expect(m.Seed()).toEqual({ Entries: [], DroppedEntries: 0, Chars: 0 });
    });

    it('uses the default caps', () => {
        expect(REALTIME_MEMORY_MAX_SEED_CHARS).toBe(24_000);
        expect(REALTIME_MEMORY_MAX_ENTRY_CHARS).toBe(2_000);
        const m = new RealtimeConversationMemory();
        m.Record({ Kind: 'user', Text: 'x'.repeat(REALTIME_MEMORY_MAX_ENTRY_CHARS + 1) });
        const e = m.Seed().Entries[0];
        expect(e.Kind === 'user' && e.Text.length).toBe(REALTIME_MEMORY_MAX_ENTRY_CHARS + REALTIME_MEMORY_TRUNCATED_TAIL.length);
    });
});

describe('RenderRealtimeMemorySeed', () => {
    const PREAMBLE =
        '[Connection resumed. Transcript so far, for continuity. Continue exactly where the conversation left off. ' +
        'Do not greet again and do not restart. If you already remember this conversation, this is the same one.]';

    it('puts the preamble first and merges it with a leading user entry', () => {
        const turns = RenderRealtimeMemorySeed({ Entries: [{ Kind: 'user', Text: 'hi' }], DroppedEntries: 0, Chars: 2 });
        expect(turns).toEqual([{ Role: 'user', Texts: [PREAMBLE, 'hi'] }]);
    });

    it('states how many entries were dropped', () => {
        const turns = RenderRealtimeMemorySeed({ Entries: [{ Kind: 'assistant', Text: 'Question 9' }], DroppedEntries: 7, Chars: 10 });
        expect(turns[0].Role).toBe('user');
        expect(turns[0].Texts).toEqual([
            '[Connection resumed. Transcript so far, for continuity; 7 earlier entries omitted. Continue exactly where the conversation left off. ' +
                'Do not greet again and do not restart. If you already remember this conversation, this is the same one.]',
        ]);
        expect(turns[1]).toEqual({ Role: 'model', Texts: ['Question 9'] });
    });

    it('renders each kind under its role and merges only adjacent same-role entries', () => {
        const turns = RenderRealtimeMemorySeed({
            Entries: [
                { Kind: 'assistant', Text: 'Question 1' },
                { Kind: 'toolCall', Name: 'lookup_order', ArgumentsJson: '{"id":1}' },
                { Kind: 'toolResult', Name: 'lookup_order', OutputJson: '{"ok":true}' },
                { Kind: 'note', Text: 'a note' },
                { Kind: 'user', Text: 'an answer' },
                { Kind: 'assistant', Text: 'Question 2' },
            ],
            DroppedEntries: 0,
            Chars: 0,
        });
        expect(turns).toEqual([
            { Role: 'user', Texts: [PREAMBLE] },
            { Role: 'model', Texts: ['Question 1', '[called lookup_order {"id":1}]'] },
            { Role: 'user', Texts: ['[lookup_order returned {"ok":true}]', 'a note', 'an answer'] },
            { Role: 'model', Texts: ['Question 2'] },
        ]);
    });
});
