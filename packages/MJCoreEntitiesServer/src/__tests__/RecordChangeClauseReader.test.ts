import { describe, expect, it } from 'vitest';
import { ReadClauseTokens } from '../custom/RecordChangeClauseReader';

describe('ReadClauseTokens', () => {
    it.each([
        ['a function argument', 'BINARY_CHECKSUM(*) > 0'],
        ['a qualified select list', `EXISTS (SELECT r.* FROM vwOther r WHERE r.ID = 'x')`],
        ['a select list', `EXISTS (SELECT TOP 1 * FROM vwOther)`],
    ])('gives null for * as %s', (_label: string, text: string) => {
        expect(ReadClauseTokens(text)).toBeNull();
    });
});
