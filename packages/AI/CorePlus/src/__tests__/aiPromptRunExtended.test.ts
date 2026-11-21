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

describe('ParseMessagesData — template data capture fields', () => {
    const shape = { data: { keyCount: 2, totalBytes: 300, keys: { rows: 280, user: 20 } } };

    it('returns the None marker and the shape, with no input data', () => {
        const run = makeRun(JSON.stringify({ dataCapture: 'None', dataShape: shape, messages: [{ role: 'system', content: 'hi' }] }));
        const parsed = run.ParseMessagesData();
        expect(parsed.dataCapture).toBe('None');
        expect(parsed.dataShape).toEqual(shape);
        expect(parsed.dataCaptureNote).toBeNull();
        expect(parsed.inputData).toBeNull();
        expect(parsed.chatMessages).toHaveLength(1);
    });

    it('returns the note of a Referenced run stored as Full', () => {
        const run = makeRun(JSON.stringify({ dataCapture: 'Full', dataCaptureNote: 'Referenced capture stored all data: template "X" was not found', data: { a: 1 }, messages: [] }));
        const parsed = run.ParseMessagesData();
        expect(parsed.dataCapture).toBe('Full');
        expect(parsed.dataCaptureNote).toContain('template "X" was not found');
        expect(parsed.inputData).toEqual({ a: 1 });
    });

    it('returns a note that ends in valid JSON unchanged', () => {
        const note = 'Referenced capture stored all data: template could not be parsed: unexpected token in {"line": 3, "col": 7}';
        const parsed = makeRun(JSON.stringify({ dataCapture: 'Full', dataCaptureNote: note, data: { a: 1 }, messages: [] })).ParseMessagesData();
        expect(parsed.dataCaptureNote).toBe(note);
    });

    it('returns the note of a run whose capture step failed', () => {
        const note = 'Template data was not stored: the capture step failed. See the server log.';
        const parsed = makeRun(JSON.stringify({ dataCapture: 'None', dataCaptureNote: note, messages: [] })).ParseMessagesData();
        expect(parsed.dataCapture).toBe('None');
        expect(parsed.dataShape).toBeNull();
        expect(parsed.dataCaptureNote).toBe(note);
        expect(parsed.inputData).toBeNull();
    });

    it('returns nulls for rows saved before capture modes existed', () => {
        const parsed = makeRun(JSON.stringify({ data: { a: 1 }, messages: [] })).ParseMessagesData();
        expect(parsed.dataCapture).toBeNull();
        expect(parsed.dataShape).toBeNull();
        expect(parsed.dataCaptureNote).toBeNull();
    });

    it('ignores an unknown marker value', () => {
        const parsed = makeRun(JSON.stringify({ dataCapture: 'Partial', dataShape: shape, messages: [] })).ParseMessagesData();
        expect(parsed.dataCapture).toBeNull();
        expect(parsed.dataShape).toBeNull();
    });

    it('returns nulls for the bare-array shape and for empty Messages', () => {
        expect(makeRun(JSON.stringify([{ role: 'user', content: 'x' }])).ParseMessagesData().dataCapture).toBeNull();
        expect(makeRun(null).ParseMessagesData().dataShape).toBeNull();
    });

    it('returns nulls for malformed JSON and for a JSON value that is not an object or array', () => {
        for (const messages of ['{not json', '"plain text"', '42']) {
            const parsed = makeRun(messages).ParseMessagesData();
            expect(parsed.dataCapture).toBeNull();
            expect(parsed.dataShape).toBeNull();
            expect(parsed.dataCaptureNote).toBeNull();
        }
    });
});
