/**
 * Unit tests for PatternMatcher
 * Tests glob-style pattern matching for API key scope authorization
 */

import { PatternMatcher } from './PatternMatcher';

describe('PatternMatcher', () => {
    describe('match()', () => {
        describe('exact matches', () => {
            it('should match exact value', () => {
                const result = PatternMatcher.match('Users', 'Users');
                expect(result.matched).toBe(true);
                expect(result.matchedPattern).toBe('Users');
            });

            it('should be case-insensitive', () => {
                const result = PatternMatcher.match('Users', 'users');
                expect(result.matched).toBe(true);
            });

            it('should not match different values', () => {
                const result = PatternMatcher.match('Users', 'Products');
                expect(result.matched).toBe(false);
                expect(result.matchedPattern).toBeNull();
            });
        });

        describe('wildcard patterns', () => {
            it('should match universal wildcard (*)', () => {
                const result = PatternMatcher.match('AnyValue', '*');
                expect(result.matched).toBe(true);
                expect(result.matchedPattern).toBe('*');
            });

            it('should match null pattern as wildcard', () => {
                const result = PatternMatcher.match('AnyValue', null);
                expect(result.matched).toBe(true);
                expect(result.matchedPattern).toBe('*');
            });

            it('should match prefix pattern (Skip*)', () => {
                const result = PatternMatcher.match('SkipAnalysisAgent', 'Skip*');
                expect(result.matched).toBe(true);
                expect(result.matchedPattern).toBe('Skip*');
            });

            it('should not match non-matching prefix', () => {
                const result = PatternMatcher.match('DataAgent', 'Skip*');
                expect(result.matched).toBe(false);
            });

            it('should match suffix pattern (*Agent)', () => {
                const result = PatternMatcher.match('SkipAnalysisAgent', '*Agent');
                expect(result.matched).toBe(true);
            });

            it('should not match non-matching suffix', () => {
                const result = PatternMatcher.match('SkipAnalysisReport', '*Agent');
                expect(result.matched).toBe(false);
            });

            it('should match contains pattern (*Report*)', () => {
                const result = PatternMatcher.match('DailyReportSummary', '*Report*');
                expect(result.matched).toBe(true);
            });

            it('should not match non-matching contains', () => {
                const result = PatternMatcher.match('DailySummary', '*Report*');
                expect(result.matched).toBe(false);
            });
        });

        describe('single character wildcard (?)', () => {
            it('should match single character', () => {
                const result = PatternMatcher.match('Users', 'User?');
                expect(result.matched).toBe(true);
            });

            it('should match exactly one character', () => {
                expect(PatternMatcher.match('User1', 'User?').matched).toBe(true);
                expect(PatternMatcher.match('User', 'User?').matched).toBe(false);
                expect(PatternMatcher.match('User12', 'User?').matched).toBe(false);
            });

            it('should work with multiple ?', () => {
                const result = PatternMatcher.match('AB', '??');
                expect(result.matched).toBe(true);
            });
        });

        describe('comma-separated patterns', () => {
            it('should match any pattern in list', () => {
                const result = PatternMatcher.match('Products', 'Users,Accounts,Products');
                expect(result.matched).toBe(true);
                expect(result.matchedPattern).toBe('Products');
            });

            it('should match first pattern in list', () => {
                const result = PatternMatcher.match('Users', 'Users,Accounts,Products');
                expect(result.matched).toBe(true);
                expect(result.matchedPattern).toBe('Users');
            });

            it('should not match if none in list match', () => {
                const result = PatternMatcher.match('Orders', 'Users,Accounts,Products');
                expect(result.matched).toBe(false);
            });

            it('should handle whitespace around patterns', () => {
                const result = PatternMatcher.match('Users', ' Users , Accounts , Products ');
                expect(result.matched).toBe(true);
            });

            it('should handle mixed wildcards in list', () => {
                const result = PatternMatcher.match('SkipAgent', 'Users,Skip*,Products');
                expect(result.matched).toBe(true);
                expect(result.matchedPattern).toBe('Skip*');
            });
        });

        describe('edge cases', () => {
            it('should not match empty pattern', () => {
                const result = PatternMatcher.match('Users', '');
                expect(result.matched).toBe(false);
            });

            it('should not match whitespace-only pattern', () => {
                const result = PatternMatcher.match('Users', '   ');
                expect(result.matched).toBe(false);
            });

            it('should handle empty value with wildcard', () => {
                const result = PatternMatcher.match('', '*');
                expect(result.matched).toBe(true);
            });

            it('should handle special regex characters', () => {
                const result = PatternMatcher.match('User.Name', 'User.Name');
                expect(result.matched).toBe(true);
            });

            it('should escape regex special characters in patterns', () => {
                // The . in pattern should be literal, not regex "any char"
                const result = PatternMatcher.match('UserXName', 'User.Name');
                expect(result.matched).toBe(false);
            });
        });
    });

    describe('hasWildcards()', () => {
        it('should return true for *', () => {
            expect(PatternMatcher.hasWildcards('*')).toBe(true);
            expect(PatternMatcher.hasWildcards('Skip*')).toBe(true);
            expect(PatternMatcher.hasWildcards('*Agent')).toBe(true);
        });

        it('should return true for ?', () => {
            expect(PatternMatcher.hasWildcards('User?')).toBe(true);
        });

        it('should return false for exact patterns', () => {
            expect(PatternMatcher.hasWildcards('Users')).toBe(false);
        });

        it('should return true for null (treated as wildcard)', () => {
            expect(PatternMatcher.hasWildcards(null)).toBe(true);
        });
    });

    describe('parsePatterns()', () => {
        it('should parse comma-separated patterns', () => {
            const patterns = PatternMatcher.parsePatterns('Users,Accounts,Products');
            expect(patterns).toEqual(['Users', 'Accounts', 'Products']);
        });

        it('should handle whitespace', () => {
            const patterns = PatternMatcher.parsePatterns(' Users , Accounts ');
            expect(patterns).toEqual(['Users', 'Accounts']);
        });

        it('should return ["*"] for null', () => {
            const patterns = PatternMatcher.parsePatterns(null);
            expect(patterns).toEqual(['*']);
        });

        it('should filter empty patterns', () => {
            const patterns = PatternMatcher.parsePatterns('Users,,Accounts');
            expect(patterns).toEqual(['Users', 'Accounts']);
        });
    });

    describe('isValidPattern()', () => {
        it('should accept valid patterns', () => {
            expect(PatternMatcher.isValidPattern('Users')).toBe(true);
            expect(PatternMatcher.isValidPattern('*')).toBe(true);
            expect(PatternMatcher.isValidPattern('Skip*')).toBe(true);
            expect(PatternMatcher.isValidPattern('entity:read')).toBe(true);
            expect(PatternMatcher.isValidPattern('Users,Accounts')).toBe(true);
        });

        it('should accept null as valid (wildcard)', () => {
            expect(PatternMatcher.isValidPattern(null)).toBe(true);
        });

        it('should reject empty string', () => {
            expect(PatternMatcher.isValidPattern('')).toBe(false);
        });

        it('should reject patterns with invalid characters', () => {
            expect(PatternMatcher.isValidPattern('Users;drop table')).toBe(false);
            expect(PatternMatcher.isValidPattern('$regex')).toBe(false);
        });

        it('should accept underscores and hyphens', () => {
            expect(PatternMatcher.isValidPattern('User_Name')).toBe(true);
            expect(PatternMatcher.isValidPattern('User-Name')).toBe(true);
        });
    });
});
