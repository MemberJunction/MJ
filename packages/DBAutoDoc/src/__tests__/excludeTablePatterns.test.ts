import { describe, it, expect } from 'vitest';
import {
    compileTableExcludePatterns,
    tableMatchesAnyPattern,
} from '../discovery/OrganicKeyDetectionRunner.js';

describe('excludeTablePatterns', () => {
    describe('compileTableExcludePatterns', () => {
        it('returns empty array for undefined / empty input', () => {
            expect(compileTableExcludePatterns(undefined)).toEqual([]);
            expect(compileTableExcludePatterns([])).toEqual([]);
        });

        it('compiles patterns with no wildcards as exact (case-insensitive) match', () => {
            const ms = compileTableExcludePatterns(['sysdiagrams']);
            expect(tableMatchesAnyPattern('sysdiagrams', ms)).toBe(true);
            expect(tableMatchesAnyPattern('SYSDIAGRAMS', ms)).toBe(true);
            expect(tableMatchesAnyPattern('sysdiagrams_extra', ms)).toBe(false);
            expect(tableMatchesAnyPattern('prefix_sysdiagrams', ms)).toBe(false);
        });

        it('treats `*` as multi-char wildcard', () => {
            const ms = compileTableExcludePatterns(['tw_temp_*']);
            expect(tableMatchesAnyPattern('tw_temp_foo', ms)).toBe(true);
            expect(tableMatchesAnyPattern('tw_temp_', ms)).toBe(true);
            expect(tableMatchesAnyPattern('tw_temp', ms)).toBe(false);
            expect(tableMatchesAnyPattern('TW_TEMP_BAR', ms)).toBe(true);
            expect(tableMatchesAnyPattern('xtw_temp_foo', ms)).toBe(false);
        });

        it('treats `%` as multi-char wildcard (SQL-style)', () => {
            const ms = compileTableExcludePatterns(['DataConversion%']);
            expect(tableMatchesAnyPattern('DataConversionPerson', ms)).toBe(true);
            expect(tableMatchesAnyPattern('dataconversion', ms)).toBe(true);
            expect(tableMatchesAnyPattern('NotDataConversion', ms)).toBe(false);
        });

        it('handles wildcards in the middle and at both ends', () => {
            const ms = compileTableExcludePatterns(['*_BAK_*']);
            expect(tableMatchesAnyPattern('Foo_BAK_2024', ms)).toBe(true);
            expect(tableMatchesAnyPattern('_BAK_', ms)).toBe(true);
            expect(tableMatchesAnyPattern('FOO_bak_2024', ms)).toBe(true); // case-insensitive
            expect(tableMatchesAnyPattern('NoBackupHere', ms)).toBe(false);
        });

        it('escapes regex special chars in literal pattern parts', () => {
            const ms = compileTableExcludePatterns(['t.able+name', 'foo$bar']);
            expect(tableMatchesAnyPattern('t.able+name', ms)).toBe(true);
            expect(tableMatchesAnyPattern('tXableYname', ms)).toBe(false); // dots are literal
            expect(tableMatchesAnyPattern('foo$bar', ms)).toBe(true);
        });

        it('skips empty / whitespace patterns silently (never matches)', () => {
            const ms = compileTableExcludePatterns(['', '   ', 'real_pattern']);
            expect(ms).toHaveLength(3);
            expect(tableMatchesAnyPattern('', ms)).toBe(false);
            expect(tableMatchesAnyPattern('anything', ms)).toBe(false);
            expect(tableMatchesAnyPattern('real_pattern', ms)).toBe(true);
        });
    });

    describe('tableMatchesAnyPattern', () => {
        it('returns false when no matchers provided', () => {
            expect(tableMatchesAnyPattern('foo', [])).toBe(false);
        });

        it('returns true on first match (short-circuits)', () => {
            const ms = compileTableExcludePatterns(['tw_temp_*', 'DataConversion*', '*_BAK_*']);
            expect(tableMatchesAnyPattern('tw_temp_x', ms)).toBe(true);
            expect(tableMatchesAnyPattern('DataConversionPerson', ms)).toBe(true);
            expect(tableMatchesAnyPattern('Foo_BAK_2024', ms)).toBe(true);
            expect(tableMatchesAnyPattern('Person', ms)).toBe(false);
        });

        it('handles the realistic APTIFY exclude set', () => {
            const ms = compileTableExcludePatterns([
                'tw_temp_*',
                'tmp_*',
                'DataConversion*',
                '*_BAK_*',
                '*_bk_*',
                '*__bk',
                'sysdiagrams',
                '__MigrationHistory',
            ]);

            // Should be excluded
            expect(tableMatchesAnyPattern('tw_temp_focus_groups_for_tyson', ms)).toBe(true);
            expect(tableMatchesAnyPattern('tmp_MemberDetailsFY', ms)).toBe(true);
            expect(tableMatchesAnyPattern('DataConversionPerson', ms)).toBe(true);
            expect(tableMatchesAnyPattern('ArchiveMembershipExpertSystemCounts__c_BAK_10092025', ms)).toBe(true);
            expect(tableMatchesAnyPattern('TopicCodeLink_bk_20250604', ms)).toBe(true);
            expect(tableMatchesAnyPattern('vwMembers__TW_bk', ms)).toBe(false); // doesn't fit any pattern
            expect(tableMatchesAnyPattern('Foo__bk', ms)).toBe(true);

            // Production tables should pass through
            expect(tableMatchesAnyPattern('Person', ms)).toBe(false);
            expect(tableMatchesAnyPattern('OrderMaster', ms)).toBe(false);
            expect(tableMatchesAnyPattern('Subscription', ms)).toBe(false);
            expect(tableMatchesAnyPattern('ViewFields', ms)).toBe(false); // legit Aptify config table
        });
    });
});
