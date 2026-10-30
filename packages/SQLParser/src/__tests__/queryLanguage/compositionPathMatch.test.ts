/**
 * MatchCompositionPath: a composition reference finds its query by the full category path, or by a
 * whole-segment suffix of exactly one same-named query's category path; never by name alone.
 */
import { describe, it, expect } from 'vitest';
import { MatchCompositionPath, CompositionFullPath, type CompositionPathCandidate } from '../../template/compositionPathMatch.js';

const query = (CategoryPath: string, Name: string): CompositionPathCandidate => ({ CategoryPath, Name });

describe('MatchCompositionPath', () => {
    const activeUsers = query('/MJ/Demos/', 'Active Users');
    const roster = query('Members/Roster', 'Active Member Roster');

    it('matches the full path exactly, ignoring case, surrounding spaces and empty segments', () => {
        expect(MatchCompositionPath('mj/ demos', 'active users', [activeUsers])).toEqual({ Kind: 'Exact', Target: activeUsers });
        expect(MatchCompositionPath(['MJ', 'Demos'], 'Active Users', [activeUsers])).toEqual({ Kind: 'Exact', Target: activeUsers });
    });

    it('finds the one query whose category path ends with the given segments, and reports its full path', () => {
        expect(MatchCompositionPath('Demos', 'Active Users', [activeUsers])).toEqual({ Kind: 'PartialPath', Target: activeUsers, FullPath: 'MJ/Demos/Active Users' });
        expect(MatchCompositionPath('Roster', 'Active Member Roster', [roster])).toMatchObject({ Kind: 'PartialPath', FullPath: 'Members/Roster/Active Member Roster' });
    });

    it('a wrong path, a part-of-segment suffix or a non-trailing segment finds nothing', () => {
        expect(MatchCompositionPath('Sales', 'Active Users', [activeUsers])).toEqual({ Kind: 'NotFound' });
        expect(MatchCompositionPath('mos', 'Active Users', [activeUsers])).toEqual({ Kind: 'NotFound' });
        expect(MatchCompositionPath('MJ', 'Active Users', [activeUsers])).toEqual({ Kind: 'NotFound' });
        expect(MatchCompositionPath('X/MJ/Demos', 'Active Users', [activeUsers])).toEqual({ Kind: 'NotFound' });
    });

    it('no name-only fallback: a reference with no path finds only a query with no category', () => {
        expect(MatchCompositionPath('', 'Active Users', [activeUsers])).toEqual({ Kind: 'NotFound' });
        const loose = query('', 'Loose');
        expect(MatchCompositionPath([], 'Loose', [loose])).toEqual({ Kind: 'Exact', Target: loose });
    });

    it('a suffix of more than one query\'s path is ambiguous and finds nothing', () => {
        const other = query('Archive/Demos', 'Active Users');
        expect(MatchCompositionPath('Demos', 'Active Users', [activeUsers, other])).toEqual({ Kind: 'Ambiguous', Exact: false, Count: 2 });
    });

    it('an exact match wins over suffix matches', () => {
        const top = query('Demos', 'Active Users');
        expect(MatchCompositionPath('Demos', 'Active Users', [activeUsers, top])).toEqual({ Kind: 'Exact', Target: top });
    });

    it('two queries at the same full path are ambiguous', () => {
        expect(MatchCompositionPath('MJ/Demos', 'Active Users', [activeUsers, query('MJ/Demos/', 'active users')])).toEqual({ Kind: 'Ambiguous', Exact: true, Count: 2 });
    });

    it('writes a full path from the category segments and the name', () => {
        expect(CompositionFullPath(activeUsers)).toBe('MJ/Demos/Active Users');
        expect(CompositionFullPath(query('', 'Loose'))).toBe('Loose');
    });
});
