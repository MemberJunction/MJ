import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ search: vi.fn(), warn: vi.fn() }));
vi.mock('cosmiconfig', () => ({ cosmiconfigSync: () => ({ search: h.search }) }));
vi.mock('@memberjunction/core', async (importOriginal) => ({ ...(await importOriginal<object>()), LogWarning: h.warn }));

import {
    BuildCaptureFailedPromptRunMessages, BuildStoredPromptRunMessages, BuildTemplateDataObjectShape, ReadServerTemplateDataCaptureDefault,
    ResolveTemplateDataCaptureMode, TEMPLATE_DATA_CAPTURE_FAILED_NOTE,
} from '../PromptRunDataCapture';

const messages = [{ role: 'system' as const, content: 'rendered prompt' }];
const unused = () => { throw new Error('analysis must not run in this mode'); };
const parallel = { parallelizationMode: 'ModelSpecific' as const, totalTasks: 2, successfulTasks: 2, failedTasks: 0, selectedTaskId: 't1', executionGroups: [0] };

/** The shape record of an input that has no keys. */
const noKeys = (totalBytes: number) => ({ keyCount: 0, totalBytes, keys: {}, keysElided: false });

beforeEach(() => { h.search.mockReset(); h.warn.mockReset(); });

describe('ResolveTemplateDataCaptureMode', () => {
    it('uses the call override first, then the prompt settings, then the server default', () => {
        expect(ResolveTemplateDataCaptureMode('Full', ['None'], 'Referenced')).toBe('Full');
        expect(ResolveTemplateDataCaptureMode(undefined, ['Referenced'], 'Full')).toBe('Referenced');
        expect(ResolveTemplateDataCaptureMode(undefined, [null], 'Full')).toBe('Full');
        expect(ResolveTemplateDataCaptureMode(undefined, [], 'Full')).toBe('Full');
    });
    it('uses the first prompt setting that is not null', () => {
        expect(ResolveTemplateDataCaptureMode(undefined, [null, 'Full', 'None'], 'Referenced')).toBe('Full');
    });
    it('skips an invalid value and uses the next level', () => {
        expect(ResolveTemplateDataCaptureMode('full', ['Referenced'], 'None')).toBe('Referenced');
        expect(ResolveTemplateDataCaptureMode(undefined, ['Partial', 'Full'], 'None')).toBe('Full');
        expect(ResolveTemplateDataCaptureMode(undefined, ['Partial'], 'Referenced')).toBe('Referenced');
    });
});

describe('ReadServerTemplateDataCaptureDefault', () => {
    it('returns None when no config file is found', () => {
        h.search.mockReturnValue(null);
        expect(ReadServerTemplateDataCaptureDefault()).toBe('None');
    });
    it('returns the configured mode', () => {
        h.search.mockReturnValue({ isEmpty: false, config: { aiPromptRuns: { templateDataCapture: 'Full' } } });
        expect(ReadServerTemplateDataCaptureDefault()).toBe('Full');
    });
    it('warns and returns None for an invalid value', () => {
        h.search.mockReturnValue({ isEmpty: false, config: { aiPromptRuns: { templateDataCapture: 'full' } } });
        expect(ReadServerTemplateDataCaptureDefault()).toBe('None');
        expect(h.warn).toHaveBeenCalledOnce();
    });
    it('warns and returns None when the config cannot be read', () => {
        h.search.mockImplementation(() => { throw new Error('bad file'); });
        expect(ReadServerTemplateDataCaptureDefault()).toBe('None');
        expect(h.warn).toHaveBeenCalledOnce();
    });
});

describe('BuildTemplateDataObjectShape', () => {
    it('records key sizes and never values', () => {
        const shape = BuildTemplateDataObjectShape({ rows: [{ secret: 'IT-SECRET' }], n: 7 });
        expect(shape).toEqual({ keyCount: 2, totalBytes: 25, keys: { rows: 24, n: 1 } });
        expect(JSON.stringify(shape)).not.toContain('IT-SECRET');
    });
    it('keeps the 25 largest keys and marks the record elided', () => {
        const obj = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, 'x'.repeat(i)]));
        const shape = BuildTemplateDataObjectShape(obj);
        expect(shape.keyCount).toBe(30);
        expect(Object.keys(shape.keys)).toHaveLength(25);
        expect(shape.keys.k29).toBe(31);
        expect(shape.keys.k0).toBeUndefined();
        expect(shape.keysElided).toBe(true);
    });
    it('records -1 for a value that cannot be serialized', () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(BuildTemplateDataObjectShape({ cyclic }).keys.cyclic).toBe(-1);
    });
    it('counts UTF-8 bytes, not characters', () => {
        // "é" is 2 bytes and "😀" is 4 bytes in UTF-8; the JSON quotes add 2 bytes
        expect(BuildTemplateDataObjectShape({ accent: 'é', emoji: '😀' }).keys).toEqual({ accent: 4, emoji: 6 });
    });
    it('records an input that is not a key/value object as an input with no keys', () => {
        expect(BuildTemplateDataObjectShape('abc')).toEqual(noKeys(5));
        expect(BuildTemplateDataObjectShape(10n)).toEqual(noKeys(-1));
    });
});

describe('BuildStoredPromptRunMessages', () => {
    const data = { rows: [1, 2], user: 'u', _CURRENT_PAYLOAD: { big: true } };
    const templateData = { extra: 'e' };

    it('None: stores the shape without _CURRENT_PAYLOAD, and no values', () => {
        const stored = BuildStoredPromptRunMessages({ Mode: 'None', Data: data, TemplateData: templateData, Messages: messages, GetReferencedVariables: unused });
        expect(stored.dataCapture).toBe('None');
        expect(stored.data).toBeUndefined();
        expect(stored.templateData).toBeUndefined();
        expect(Object.keys(stored.dataShape!.data!.keys).sort()).toEqual(['rows', 'user']);
        expect(stored.dataShape!.templateData!.keyCount).toBe(1);
        expect(stored.messages).toEqual(messages);
    });

    it('None with no inputs: no shape record', () => {
        const stored = BuildStoredPromptRunMessages({ Mode: 'None', Messages: messages, GetReferencedVariables: unused });
        expect(stored.dataShape).toBeUndefined();
    });

    it('Full: stores the inputs without _CURRENT_PAYLOAD', () => {
        const stored = BuildStoredPromptRunMessages({ Mode: 'Full', Data: data, TemplateData: templateData, Messages: messages, GetReferencedVariables: unused });
        expect(stored.data).toEqual({ rows: [1, 2], user: 'u' });
        expect(stored.templateData).toEqual(templateData);
        expect(stored.dataShape).toBeUndefined();
    });

    it('Referenced: keeps only the referenced keys', () => {
        const stored = BuildStoredPromptRunMessages({
            Mode: 'Referenced', Data: data, TemplateData: templateData, Messages: messages,
            GetReferencedVariables: () => ({ Names: new Set(['rows', 'r', '_CURRENT_PAYLOAD']), Complete: true }),
        });
        expect(stored.dataCapture).toBe('Referenced');
        expect(stored.data).toEqual({ rows: [1, 2] });
        expect(stored.templateData).toEqual({});
        expect(stored.dataCaptureNote).toBeUndefined();
    });

    it('Referenced, incomplete analysis: stores Full with a note', () => {
        const stored = BuildStoredPromptRunMessages({
            Mode: 'Referenced', Data: data, Messages: messages,
            GetReferencedVariables: () => ({ Names: new Set(['rows']), Complete: false, Reason: 'template "X" was not found' }),
        });
        expect(stored.dataCapture).toBe('Full');
        expect(stored.dataCaptureNote).toContain('template "X" was not found');
        expect(stored.data).toEqual({ rows: [1, 2], user: 'u' });
    });

    it('Referenced with no inputs: skips the analysis and stores no note', () => {
        const stored = BuildStoredPromptRunMessages({ Mode: 'Referenced', Messages: messages, GetReferencedVariables: unused });
        expect(stored.dataCapture).toBe('Referenced');
        expect(stored).not.toHaveProperty('dataCaptureNote');
        expect(stored).not.toHaveProperty('data');
        expect(stored).not.toHaveProperty('templateData');
    });

    it('keeps the parallel block and writes messages last', () => {
        const stored = BuildStoredPromptRunMessages({ Mode: 'None', Data: data, Messages: messages, GetReferencedVariables: unused, ParallelExecution: parallel });
        expect(stored.parallelExecution).toEqual(parallel);
        expect(Object.keys(stored).at(-1)).toBe('messages');
    });

    it('does not change the caller objects', () => {
        const input = { ...data };
        BuildStoredPromptRunMessages({ Mode: 'Full', Data: input, Messages: messages, GetReferencedVariables: unused });
        expect(input._CURRENT_PAYLOAD).toEqual({ big: true });
    });
});

describe('BuildStoredPromptRunMessages: inputs that are not key/value objects', () => {
    // UTF-8 byte lengths of the JSON forms: "abc" 5, 5 1, true 4, null 4
    describe.each<[string, unknown, number]>([
        ['a string', 'abc', 5],
        ['a number', 5, 1],
        ['a boolean', true, 4],
        ['null', null, 4],
    ])('%s', (_label, value, bytes) => {
        it('None: records an input with no keys and stores no value', () => {
            const stored = BuildStoredPromptRunMessages({ Mode: 'None', Data: value, TemplateData: value, Messages: messages, GetReferencedVariables: unused });
            expect(stored.dataCapture).toBe('None');
            expect(stored.dataShape).toEqual({ data: noKeys(bytes), templateData: noKeys(bytes) });
            expect(stored).not.toHaveProperty('data');
            expect(stored).not.toHaveProperty('templateData');
        });
        it('Referenced: keeps the input as passed, with no analysis', () => {
            const stored = BuildStoredPromptRunMessages({ Mode: 'Referenced', Data: value, TemplateData: value, Messages: messages, GetReferencedVariables: unused });
            expect(stored.dataCapture).toBe('Referenced');
            expect(stored.data).toBe(value);
            expect(stored.templateData).toBe(value);
            expect(stored).not.toHaveProperty('dataCaptureNote');
        });
        it('Full: stores the input as passed', () => {
            const stored = BuildStoredPromptRunMessages({ Mode: 'Full', Data: value, TemplateData: value, Messages: messages, GetReferencedVariables: unused });
            expect(stored.dataCapture).toBe('Full');
            expect(stored.data).toBe(value);
            expect(stored.templateData).toBe(value);
            expect(stored).not.toHaveProperty('dataShape');
        });
    });

    it('counts an array as an input with no keys', () => {
        const array = [1, 'x', { _CURRENT_PAYLOAD: 1 }]; // JSON [1,"x",{"_CURRENT_PAYLOAD":1}] is 30 bytes
        const none = BuildStoredPromptRunMessages({ Mode: 'None', Data: array, Messages: messages, GetReferencedVariables: unused });
        expect(none.dataShape).toEqual({ data: noKeys(30) });
        const referenced = BuildStoredPromptRunMessages({ Mode: 'Referenced', Data: array, Messages: messages, GetReferencedVariables: unused });
        expect(referenced.dataCapture).toBe('Referenced');
        expect(referenced.data).toBe(array);
        const full = BuildStoredPromptRunMessages({ Mode: 'Full', Data: array, Messages: messages, GetReferencedVariables: unused });
        expect(full.data).toBe(array);
    });

    it('Referenced: filters an object input and keeps the other input as passed', () => {
        const stored = BuildStoredPromptRunMessages({
            Mode: 'Referenced', Data: { rows: [1], other: 2, _CURRENT_PAYLOAD: {} }, TemplateData: 'abc', Messages: messages,
            GetReferencedVariables: () => ({ Names: new Set(['rows']), Complete: true }),
        });
        expect(stored.dataCapture).toBe('Referenced');
        expect(stored.data).toEqual({ rows: [1] });
        expect(stored.templateData).toBe('abc');
    });

    it('serializes every mode', () => {
        for (const Mode of ['None', 'Referenced', 'Full'] as const) {
            const stored = BuildStoredPromptRunMessages({ Mode, Data: 'abc', TemplateData: null, Messages: messages, GetReferencedVariables: unused });
            expect(() => JSON.stringify(stored)).not.toThrow();
        }
    });
});

describe('BuildCaptureFailedPromptRunMessages', () => {
    it('stores None with the fixed note and the messages, and no template data', () => {
        expect(BuildCaptureFailedPromptRunMessages(messages)).toEqual({ dataCapture: 'None', dataCaptureNote: TEMPLATE_DATA_CAPTURE_FAILED_NOTE, messages });
    });
    it('keeps the parallel block and writes messages last', () => {
        const stored = BuildCaptureFailedPromptRunMessages(messages, parallel);
        expect(stored).toEqual({ dataCapture: 'None', dataCaptureNote: TEMPLATE_DATA_CAPTURE_FAILED_NOTE, parallelExecution: parallel, messages });
        expect(Object.keys(stored).at(-1)).toBe('messages');
    });
    it('uses a fixed note', () => {
        expect(TEMPLATE_DATA_CAPTURE_FAILED_NOTE).toBe('Template data was not stored: the capture step failed. See the server log.');
    });
});
