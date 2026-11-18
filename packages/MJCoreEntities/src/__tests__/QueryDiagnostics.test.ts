import { describe, expect, it } from 'vitest';
import {
    FormatQueryDiagnostic,
    HasQueryRuleDiagnostics,
    ParseQueryDiagnostic,
    ParseQueryDiagnostics,
    ParseQuerySaveMessage,
    QueryTextPosition,
} from '../custom/QueryDiagnostics';

describe('QueryTextPosition', () => {
    it('counts lines and columns from 1', () => {
        expect(QueryTextPosition('SELECT 1', 0)).toEqual({ Line: 1, Column: 1 });
        expect(QueryTextPosition('SELECT\n  {{ x }}', 9)).toEqual({ Line: 2, Column: 3 });
    });

    it('treats \\r\\n as one line break and a lone \\r as one', () => {
        expect(QueryTextPosition('a\r\nb', 3)).toEqual({ Line: 2, Column: 1 });
        expect(QueryTextPosition('a\rb', 2)).toEqual({ Line: 2, Column: 1 });
    });

    it('clamps an offset past the end', () => {
        expect(QueryTextPosition('ab', 99)).toEqual({ Line: 1, Column: 3 });
    });
});

describe('FormatQueryDiagnostic / ParseQueryDiagnostic', () => {
    it('round-trips code, location, message and fix', () => {
        const text = FormatQueryDiagnostic({ Code: 'MJQ_UNFILTERED_VALUE', Line: 3, Column: 14, Message: 'The value is written without a filter.', FixHint: 'Add | sqlString.' });
        expect(text).toBe('MJQ_UNFILTERED_VALUE at line 3, column 14: The value is written without a filter. Fix: Add | sqlString.');
        expect(ParseQueryDiagnostic(text)).toEqual({ Code: 'MJQ_UNFILTERED_VALUE', Line: 3, Column: 14, Message: 'The value is written without a filter.', FixHint: 'Add | sqlString.' });
    });

    it('writes no location or fix when there is none', () => {
        const text = FormatQueryDiagnostic({ Code: 'MJQ_SYNTAX', Message: 'bad' });
        expect(text).toBe('MJQ_SYNTAX: bad');
        expect(ParseQueryDiagnostic(text)).toEqual({ Code: 'MJQ_SYNTAX', Line: null, Column: null, Message: 'bad', FixHint: null });
    });

    it('reads a line without a code as a plain message', () => {
        expect(ParseQueryDiagnostic('The query returns more than one column named "A".')).toEqual({
            Code: null, Line: null, Column: null, Message: 'The query returns more than one column named "A".', FixHint: null,
        });
    });
});

describe('ParseQuerySaveMessage', () => {
    it('splits the headline from the findings', () => {
        const msg = 'Query "Q" was not saved:\nMJQ_SYNTAX at line 1, column 8: bad Fix: fix it\nThe query returns more than one column named "A".';
        const parsed = ParseQuerySaveMessage(msg);
        expect(parsed.Headline).toBe('Query "Q" was not saved:');
        expect(parsed.Diagnostics).toHaveLength(2);
        expect(parsed.Diagnostics[0]).toMatchObject({ Code: 'MJQ_SYNTAX', Line: 1, Column: 8, FixHint: 'fix it' });
        expect(parsed.Diagnostics[1].Code).toBeNull();
    });

    it('finds the headline after a prefix the transport adds', () => {
        const parsed = ParseQuerySaveMessage('Failed to create query:\nQuery "Q" was not saved:\nMJQ_SYNTAX: bad');
        expect(parsed.Headline).toBe('Failed to create query:');
        expect(parsed.Diagnostics.map(d => d.Code)).toEqual([null, 'MJQ_SYNTAX']);
    });

    it('keeps a generic failure as one plain finding', () => {
        const parsed = ParseQuerySaveMessage('Network error');
        expect(parsed.Headline).toBeNull();
        expect(parsed.Diagnostics).toEqual([{ Code: null, Line: null, Column: null, Message: 'Network error', FixHint: null }]);
        expect(HasQueryRuleDiagnostics('Network error')).toBe(false);
    });

    it('is empty for no text', () => {
        expect(ParseQuerySaveMessage(null)).toEqual({ Headline: null, Diagnostics: [] });
        expect(ParseQueryDiagnostics(undefined)).toEqual([]);
    });

    it('reports coded findings', () => {
        expect(HasQueryRuleDiagnostics('Query "Q" was not saved:\nMJQ_SYNTAX: bad')).toBe(true);
    });
});
