import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
}));

import { LogError } from '@memberjunction/core';
import { ReadHostTools, ReadTrimmedString } from '../realtime/bridge-host-params';

const tool = { Name: 'end_call', Description: 'Hang up.', ParametersSchema: { type: 'object', properties: {} } };

describe('ReadHostTools', () => {
    it('passes well-formed tool definitions through', () => {
        expect(ReadHostTools([tool])).toEqual([tool]);
    });

    it('treats absent, null and empty as no tools, without logging', () => {
        vi.mocked(LogError).mockClear();
        expect(ReadHostTools(undefined)).toBeUndefined();
        expect(ReadHostTools(null)).toBeUndefined();
        expect(ReadHostTools([])).toBeUndefined();
        expect(LogError).not.toHaveBeenCalled();
    });

    it.each([
        ['a non-array', 'end_call'],
        ['an array with a non-object', [tool, 'x']],
        ['a definition with no name', [{ ...tool, Name: '' }]],
        ['a definition with a non-string description', [{ ...tool, Description: 5 }]],
        ['a definition whose schema is an array', [{ ...tool, ParametersSchema: [] }]],
        ['a definition with a null schema', [{ ...tool, ParametersSchema: null }]],
    ])('ignores and logs %s instead of throwing', (_label, value) => {
        vi.mocked(LogError).mockClear();
        expect(ReadHostTools(value)).toBeUndefined();
        expect(LogError).toHaveBeenCalledTimes(1);
    });
});

describe('ReadTrimmedString', () => {
    it('trims a string and drops a blank one', () => {
        expect(ReadTrimmedString('  hello ', 'x')).toBe('hello');
        expect(ReadTrimmedString('   ', 'x')).toBeUndefined();
    });

    it('treats absent as absent without logging', () => {
        vi.mocked(LogError).mockClear();
        expect(ReadTrimmedString(undefined, 'x')).toBeUndefined();
        expect(ReadTrimmedString(null, 'x')).toBeUndefined();
        expect(LogError).not.toHaveBeenCalled();
    });

    it.each([5, true, {}, ['a']])('ignores and logs a non-string (%j) rather than throwing on trim()', (value) => {
        vi.mocked(LogError).mockClear();
        expect(ReadTrimmedString(value, 'realtimeHostFraming')).toBeUndefined();
        expect(LogError).toHaveBeenCalledWith(expect.stringContaining('realtimeHostFraming'));
    });
});
