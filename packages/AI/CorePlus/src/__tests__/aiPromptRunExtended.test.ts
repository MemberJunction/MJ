import { describe, it, expect, vi } from 'vitest';

// Keep the REAL ParseJSONRecursive (the actual parse logic under test); stub only RegisterClass so the
// decorator doesn't need MJGlobal's registry wired up in the unit test.
vi.mock('@memberjunction/global', async (importActual) => {
    const actual = await importActual<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

// Minimal entity bases — we only exercise ParseMessagesData, which reads `this.Messages`.
vi.mock('@memberjunction/core', () => ({ BaseEntity: class BaseEntity {} }));
vi.mock('@memberjunction/core-entities', () => ({
    MJAIPromptRunEntity: class MJAIPromptRunEntity {
        public Messages: string | null = null;
    },
}));

import { MJAIPromptRunEntityExtended } from '../MJAIPromptRunEntityExtended';

function makeRun(messages: string | null): MJAIPromptRunEntityExtended {
    const run = new MJAIPromptRunEntityExtended();
    (run as unknown as { Messages: string | null }).Messages = messages;
    return run;
}

describe('MJAIPromptRunEntityExtended.ParseMessagesData', () => {
    it('parses a TOP-LEVEL ChatMessage[] array (the realtime co-agent shape)', () => {
        const run = makeRun(
            JSON.stringify([
                { role: 'user', content: 'open localhost 4201' },
                { role: 'assistant', content: 'opening now' },
            ]),
        );
        const { chatMessages, inputData } = run.ParseMessagesData();
        expect(chatMessages).toHaveLength(2);
        expect(chatMessages[0].role).toBe('user');
        expect(chatMessages[1].content).toBe('opening now');
        // A bare array carries no { data } context.
        expect(inputData).toBeNull();
    });

    it('still parses the wrapped { messages, data } shape (normal prompt runs)', () => {
        const run = makeRun(
            JSON.stringify({
                messages: [{ role: 'system', content: 'hi' }],
                data: { foo: 'bar' },
            }),
        );
        const { chatMessages, inputData } = run.ParseMessagesData();
        expect(chatMessages).toHaveLength(1);
        expect(chatMessages[0].role).toBe('system');
        expect(inputData).toEqual({ foo: 'bar' });
    });

    it('returns empty for null Messages', () => {
        expect(makeRun(null).ParseMessagesData().chatMessages).toEqual([]);
    });

    it('returns empty (no throw) for malformed JSON', () => {
        expect(makeRun('{not json').ParseMessagesData().chatMessages).toEqual([]);
    });
});
