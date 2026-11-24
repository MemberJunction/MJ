import { describe, it, expect } from 'vitest';
import { VoiceConversation } from '../voice/voiceConversation';

const call = (ID: string, Name = 'find_revenue') => ({ CallID: ID, Name, Arguments: '{"year":"2025"}' });
const roles = (c: VoiceConversation, instruction?: string) => c.Messages('SYS', instruction).map((m) => m.role);
const contents = (c: VoiceConversation, instruction?: string) => c.Messages('SYS', instruction).map((m) => String(m.content ?? ''));

describe('VoiceConversation', () => {
    it('renders the system prompt, then turns in order', () => {
        const c = new VoiceConversation();
        c.AddUser('Hi');
        c.AddAssistant('Hello!');
        expect(c.Messages('SYS')).toEqual([
            { role: 'system', content: 'SYS' },
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello!' },
        ]);
    });

    it('marks notes so the model does not take them for the user, in a role every model reads', () => {
        const c = new VoiceConversation();
        c.AddNote('On the Sales page.');
        const [, note] = c.Messages('SYS');
        expect(note.role).toBe('user');
        expect(note.content).toMatch(/not said by the user.*On the Sales page\./i);
    });

    it('puts a one-off instruction last, marked, without keeping it', () => {
        const c = new VoiceConversation();
        c.AddAssistant('Hello!');
        const last = c.Messages('SYS', 'Say the report is ready.').at(-1);
        expect(last?.role).toBe('user');
        expect(last?.content).toMatch(/not said by the user.*Say the report is ready\./i);
        expect(contents(c).join()).not.toContain('report is ready');
    });

    it('ignores empty turns', () => {
        const c = new VoiceConversation();
        c.AddUser('  ');
        c.AddAssistant('');
        c.AddNote('');
        expect(roles(c)).toEqual(['system']);
    });

    it('answers a running call with a placeholder, so the history stays valid', () => {
        const c = new VoiceConversation();
        c.AddUser('Revenue?');
        c.AddToolCalls('One moment.', [call('a')]);
        const [, , assistant, tool] = c.Messages('SYS');
        expect(assistant).toEqual({
            role: 'assistant',
            content: 'One moment.',
            tool_calls: [{ id: 'a', type: 'function', function: { name: 'find_revenue', arguments: '{"year":"2025"}' } }],
        });
        expect(tool).toMatchObject({ role: 'tool', tool_call_id: 'a' });
        expect(String(tool.content)).toMatch(/still running/);
    });

    it('puts a result that comes right away in its place', () => {
        const c = new VoiceConversation();
        c.AddToolCalls('', [call('a'), call('b')]);
        c.AddToolResult('b', '{"v":2}');
        c.AddToolResult('a', '{"v":1}');
        const tools = c.Messages('SYS').filter((m) => m.role === 'tool');
        expect(tools).toEqual([
            { role: 'tool', tool_call_id: 'a', content: '{"v":1}' },
            { role: 'tool', tool_call_id: 'b', content: '{"v":2}' },
        ]);
    });

    it('brings a result that comes after the conversation moved on to the end, named', () => {
        const c = new VoiceConversation();
        c.AddToolCalls('', [call('a')]);
        c.AddUser('What is two plus two?');
        c.AddAssistant('Four.');
        c.AddToolResult('a', '{"v":1}');
        const messages = c.Messages('SYS');
        expect(String(messages.find((m) => m.role === 'tool')?.content)).toMatch(/still running/);
        expect(messages.at(-1)?.role).toBe('user');
        expect(String(messages.at(-1)?.content)).toMatch(/not said by the user.*find_revenue.*\{"v":1\}/is);
    });

    it('puts a result after the progress notes that came before it', () => {
        const c = new VoiceConversation();
        c.AddToolCalls('', [call('a')]);
        c.AddNote('Still gathering data.');
        c.AddToolResult('a', '{"v":1}');
        expect(roles(c)).toEqual(['system', 'user', 'assistant', 'tool']);
        expect(contents(c).at(-1)).toBe('{"v":1}');
    });

    it('keeps a result for a call it does not know, as a note', () => {
        const c = new VoiceConversation();
        c.AddToolResult('zzz', '{"v":1}');
        expect(roles(c)).toEqual(['system', 'user']);
        expect(contents(c).at(-1)).toContain('{"v":1}');
    });

    it('takes each result once', () => {
        const c = new VoiceConversation();
        c.AddToolCalls('', [call('a')]);
        c.AddToolResult('a', 'first');
        c.AddToolResult('a', 'second');
        expect(contents(c).filter((t) => t === 'first' || t.includes('second'))).toEqual(['first']);
    });

    it('drops the oldest turns past its cap, starting at a user turn and never splitting a call from its result', () => {
        const c = new VoiceConversation(6);
        for (let i = 0; i < 10; i++) {
            c.AddUser(`u${i}`);
            c.AddToolCalls('', [call(`c${i}`)]);
            c.AddToolResult(`c${i}`, `r${i}`);
            c.AddAssistant(`a${i}`);
        }
        const messages = c.Messages('SYS');
        expect(messages[1].role).toBe('user');
        const ids = messages.flatMap((m) => (m.role === 'assistant' ? (m.tool_calls ?? []).map((t) => t.id) : []));
        const answered = messages.flatMap((m) => (m.role === 'tool' ? [m.tool_call_id] : []));
        expect(answered).toEqual(ids);
        expect(contents(c).at(-1)).toBe('a9');
    });

    it('cuts one very long entry and says so', () => {
        const c = new VoiceConversation();
        c.AddToolCalls('', [call('a')]);
        c.AddToolResult('a', 'x'.repeat(500_000));
        const tool = String(c.Messages('SYS').at(-1)?.content);
        expect(tool.length).toBeLessThan(51_000);
        expect(tool).toMatch(/truncated/);
    });

    it('cuts a very long instruction', () => {
        const c = new VoiceConversation();
        expect(String(c.Messages('SYS', 'x'.repeat(500_000)).at(-1)?.content).length).toBeLessThan(9_000);
    });

    it('drops the oldest entries past its total size', () => {
        const c = new VoiceConversation();
        for (let i = 0; i < 40; i++) {
            c.AddUser(`u${i} ${'x'.repeat(40_000)}`);
            c.AddAssistant(`a${i}`);
        }
        const all = contents(c);
        expect(all.join('').length).toBeLessThan(450_000);
        expect(all.at(-1)).toBe('a39');
    });

    it('keeps trimming even when no user turn is left to start at', () => {
        const c = new VoiceConversation(3);
        for (let i = 0; i < 10; i++) c.AddAssistant(`a${i}`);
        expect(contents(c)).toEqual(['SYS', 'a7', 'a8', 'a9']);
    });
});
