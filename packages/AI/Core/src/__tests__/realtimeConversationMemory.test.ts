import { describe, it, expect, vi } from 'vitest';
import {
    RealtimeConversationMemory,
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
