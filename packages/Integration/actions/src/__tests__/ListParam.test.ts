import { describe, it, expect } from 'vitest';
import { ParseListParam } from '../ListParam.js';
import { InvalidBackupParameterError } from '../BackupSourceGuard.js';

describe('ParseListParam', () => {
    it('splits a comma-separated list, trimming entries and dropping blanks', () => {
        expect(ParseListParam(' a , b,, c ', 'P')).toEqual(['a', 'b', 'c']);
    });

    it('reads a JSON array of strings', () => {
        expect(ParseListParam('["a", " b ", ""]', 'P')).toEqual(['a', 'b']);
    });

    it('reads a JSON array with leading whitespace and keeps commas inside its entries', () => {
        expect(ParseListParam('  ["a,b"]', 'P')).toEqual(['a,b']);
    });

    it('returns an empty list for an empty JSON array or only commas', () => {
        expect(ParseListParam('[]', 'P')).toEqual([]);
        expect(ParseListParam(' , , ', 'P')).toEqual([]);
    });

    it.each([
        ['malformed JSON', '["a"'],
        ['a non-string entry', '["a", 1]'],
        ['a nested array', '[["a"]]'],
    ])('refuses %s as INVALID_PARAMETER, naming the parameter', (_label, value) => {
        let thrown: unknown;
        try {
            ParseListParam(value, 'EntityMapIDs');
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(InvalidBackupParameterError);
        expect((thrown as InvalidBackupParameterError).ResultCode).toBe('INVALID_PARAMETER');
        expect((thrown as Error).message).toContain("'EntityMapIDs'");
    });
});
