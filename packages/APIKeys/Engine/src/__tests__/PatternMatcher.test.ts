/**
 * Unit tests for PatternMatcher
 * Comprehensive coverage including edge cases not in the original spec file
 */

import { describe, it, expect } from 'vitest';
import { PatternMatcher } from '../PatternMatcher';

describe('PatternMatcher', () => {
    describe('match()', () => {
        describe('exact matches', () => {
            it('should match exact value', () => {
                const result = PatternMatcher.match('Users', 'Users');
                expect(result.matched).toBe(true);
                expect(result.matchedPattern).toBe('Users');
            });

            it('should be case-insensitive', () => {
                expect(PatternMatcher.match('Users', 'users').matched).toBe(true);
                expect(PatternMatcher.match('users', 'USERS').matched).toBe(true);
                expect(PatternMatcher.match('UsErS', 'uSeRs').matched).toBe(true);
            });

            it('should not match different values', () => {
                const result = PatternMatcher.match('Users', 'Products');
                expect(result.matched).toBe(false);
                expect(result.matchedPattern).toBeNull();
            });
        });

        describe('wildcard patterns', () => {
            it('should match universal wildcard (*)', () => {
                expect(PatternMatcher.match('AnyValue', '*').matched).toBe(true);
                expect(PatternMatcher.match('AnyValue', '*').matchedPattern).toBe('*');
            });

            it('should match null pattern as wildcard', () => {
                expect(PatternMatcher.match('AnyValue', null).matched).toBe(true);
                expect(PatternMatcher.match('AnyValue', null).matchedPattern).toBe('*');
            });

            it('should match prefix wildcard', () => {
                expect(PatternMatcher.match('SkipAnalysis', 'Skip*').matched).toBe(true);
                expect(PatternMatcher.match('DataAgent', 'Skip*').matched).toBe(false);
            });

            it('should match suffix wildcard', () => {
                expect(PatternMatcher.match('SkipAgent', '*Agent').matched).toBe(true);
                expect(PatternMatcher.match('SkipReport', '*Agent').matched).toBe(false);
            });

            it('should match contains wildcard', () => {
                expect(PatternMatcher.match('DailyReportSummary', '*Report*').matched).toBe(true);
                expect(PatternMatcher.match('DailySummary', '*Report*').matched).toBe(false);
            });
        });

        describe('single character wildcard (?)', () => {
            it('should match exactly one character', () => {
                expect(PatternMatcher.match('Users', 'User?').matched).toBe(true);
                expect(PatternMatcher.match('User1', 'User?').matched).toBe(true);
                expect(PatternMatcher.match('User', 'User?').matched).toBe(false);
                expect(PatternMatcher.match('User12', 'User?').matched).toBe(false);
            });
        });

        describe('comma-separated patterns', () => {
            it('should match any pattern in list', () => {
                const result = PatternMatcher.match('Products', 'Users,Accounts,Products');
                expect(result.matched).toBe(true);
                expect(result.matchedPattern).toBe('Products');
            });

            it('should return first matching pattern', () => {
                const result = PatternMatcher.match('Users', 'Users,Accounts');
                expect(result.matchedPattern).toBe('Users');
            });

            it('should handle whitespace around patterns', () => {
                expect(PatternMatcher.match('Users', ' Users , Accounts ').matched).toBe(true);
            });

            it('should handle mixed wildcards in list', () => {
                const result = PatternMatcher.match('SkipAgent', 'Users,Skip*,Products');
                expect(result.matched).toBe(true);
                expect(result.matchedPattern).toBe('Skip*');
            });

            it('should not match if none in list match', () => {
                expect(PatternMatcher.match('Orders', 'Users,Accounts').matched).toBe(false);
            });
        });

        describe('edge cases', () => {
            it('should not match empty pattern', () => {
                expect(PatternMatcher.match('Users', '').matched).toBe(false);
            });

            it('should not match whitespace-only pattern', () => {
                expect(PatternMatcher.match('Users', '   ').matched).toBe(false);
            });

            it('should handle empty value with wildcard', () => {
                expect(PatternMatcher.match('', '*').matched).toBe(true);
            });

            it('should handle regex special characters in value', () => {
                expect(PatternMatcher.match('User.Name', 'User.Name').matched).toBe(true);
            });

            it('should escape regex special characters', () => {
                // . in pattern should be literal, not regex any-char
                expect(PatternMatcher.match('UserXName', 'User.Name').matched).toBe(false);
            });

            it('should handle patterns with colons', () => {
                expect(PatternMatcher.match('entity:read', 'entity:read').matched).toBe(true);
                expect(PatternMatcher.match('entity:read', 'entity:*').matched).toBe(true);
            });
        });
    });

    describe('hasWildcards()', () => {
        it('should detect * wildcard', () => {
            expect(PatternMatcher.hasWildcards('*')).toBe(true);
            expect(PatternMatcher.hasWildcards('Skip*')).toBe(true);
            expect(PatternMatcher.hasWildcards('*Agent')).toBe(true);
        });

        it('should detect ? wildcard', () => {
            expect(PatternMatcher.hasWildcards('User?')).toBe(true);
        });

        it('should return false for exact patterns', () => {
            expect(PatternMatcher.hasWildcards('Users')).toBe(false);
        });

        it('should treat null as wildcard', () => {
            expect(PatternMatcher.hasWildcards(null)).toBe(true);
        });
    });

    describe('parsePatterns()', () => {
        it('should parse comma-separated patterns', () => {
            expect(PatternMatcher.parsePatterns('Users,Accounts')).toEqual(['Users', 'Accounts']);
        });

        it('should trim whitespace', () => {
            expect(PatternMatcher.parsePatterns(' Users , Accounts ')).toEqual(['Users', 'Accounts']);
        });

        it('should return ["*"] for null', () => {
            expect(PatternMatcher.parsePatterns(null)).toEqual(['*']);
        });

        it('should filter empty patterns', () => {
            expect(PatternMatcher.parsePatterns('Users,,Accounts')).toEqual(['Users', 'Accounts']);
        });
    });

    describe('isValidPattern()', () => {
        it('should accept valid patterns', () => {
            expect(PatternMatcher.isValidPattern('Users')).toBe(true);
            expect(PatternMatcher.isValidPattern('*')).toBe(true);
            expect(PatternMatcher.isValidPattern('Skip*')).toBe(true);
            expect(PatternMatcher.isValidPattern('entity:read')).toBe(true);
            expect(PatternMatcher.isValidPattern('Users,Accounts')).toBe(true);
            expect(PatternMatcher.isValidPattern(null)).toBe(true);
        });

        it('should reject invalid patterns', () => {
            expect(PatternMatcher.isValidPattern('')).toBe(false);
            expect(PatternMatcher.isValidPattern('Users;drop table')).toBe(false);
            expect(PatternMatcher.isValidPattern('$regex')).toBe(false);
        });

        it('should accept underscores and hyphens', () => {
            expect(PatternMatcher.isValidPattern('User_Name')).toBe(true);
            expect(PatternMatcher.isValidPattern('User-Name')).toBe(true);
        });

        it('should reject trailing comma creating empty pattern', () => {
            expect(PatternMatcher.isValidPattern('Users,')).toBe(false);
        });
    });
});
