import { describe, it, expect, beforeEach } from 'vitest';
import { RunQuerySQLFilterManager } from '../generic/runQuerySQLFilterImplementations';

describe('sqlLike filters', () => {
    let manager: RunQuerySQLFilterManager;

    beforeEach(() => {
        manager = RunQuerySQLFilterManager.Instance;
        manager.SetPlatform('sqlserver');
    });

    describe('SQL Server (default)', () => {
        describe('sqlLikeContains', () => {
            it('should wrap value with % on both sides', () => {
                expect(manager.executeFilter('sqlLikeContains', 'Leadership Conference')).toBe("'%Leadership Conference%'");
            });

            it('should return NULL for null', () => {
                expect(manager.executeFilter('sqlLikeContains', null)).toBe('NULL');
            });

            it('should return NULL for undefined', () => {
                expect(manager.executeFilter('sqlLikeContains', undefined)).toBe('NULL');
            });

            it('should escape single quotes', () => {
                expect(manager.executeFilter('sqlLikeContains', "O'Brien")).toBe("'%O''Brien%'");
            });

            it('should strip and not escape boundary % wildcards', () => {
                expect(manager.executeFilter('sqlLikeContains', '100%')).toBe("'%100%'");
            });

            it('should escape literal _ with bracket syntax', () => {
                expect(manager.executeFilter('sqlLikeContains', 'first_name')).toBe("'%first[_]name%'");
            });

            it('should escape interior % with bracket syntax', () => {
                expect(manager.executeFilter('sqlLikeContains', '50% off 100% items')).toBe("'%50[%] off 100[%] items%'");
            });

            it('should strip leading and trailing % wildcards from value', () => {
                expect(manager.executeFilter('sqlLikeContains', '%Leadership%')).toBe("'%Leadership%'");
            });

            it('should strip multiple leading and trailing % wildcards', () => {
                expect(manager.executeFilter('sqlLikeContains', '%%Leadership%%')).toBe("'%Leadership%'");
            });

            it('should handle empty string', () => {
                expect(manager.executeFilter('sqlLikeContains', '')).toBe("'%%'");
            });

            it('should convert numbers to strings', () => {
                expect(manager.executeFilter('sqlLikeContains', 2023)).toBe("'%2023%'");
            });
        });

        describe('sqlLikeBegins', () => {
            it('should append % after the value', () => {
                expect(manager.executeFilter('sqlLikeBegins', 'Leadership')).toBe("'Leadership%'");
            });

            it('should return NULL for null', () => {
                expect(manager.executeFilter('sqlLikeBegins', null)).toBe('NULL');
            });

            it('should return NULL for undefined', () => {
                expect(manager.executeFilter('sqlLikeBegins', undefined)).toBe('NULL');
            });

            it('should escape single quotes', () => {
                expect(manager.executeFilter('sqlLikeBegins', "O'Brien")).toBe("'O''Brien%'");
            });

            it('should strip trailing % wildcard from value', () => {
                expect(manager.executeFilter('sqlLikeBegins', 'Leadership%')).toBe("'Leadership%'");
            });

            it('should preserve leading % as literal and escape it', () => {
                expect(manager.executeFilter('sqlLikeBegins', '%Leadership')).toBe("'[%]Leadership%'");
            });

            it('should escape literal _ with bracket syntax', () => {
                expect(manager.executeFilter('sqlLikeBegins', 'first_name')).toBe("'first[_]name%'");
            });
        });

        describe('sqlLikeEnds', () => {
            it('should prepend % before the value', () => {
                expect(manager.executeFilter('sqlLikeEnds', 'Conference')).toBe("'%Conference'");
            });

            it('should return NULL for null', () => {
                expect(manager.executeFilter('sqlLikeEnds', null)).toBe('NULL');
            });

            it('should return NULL for undefined', () => {
                expect(manager.executeFilter('sqlLikeEnds', undefined)).toBe('NULL');
            });

            it('should escape single quotes', () => {
                expect(manager.executeFilter('sqlLikeEnds', "O'Brien")).toBe("'%O''Brien'");
            });

            it('should strip leading % wildcard from value', () => {
                expect(manager.executeFilter('sqlLikeEnds', '%Conference')).toBe("'%Conference'");
            });

            it('should preserve trailing % as literal and escape it', () => {
                expect(manager.executeFilter('sqlLikeEnds', '100%')).toBe("'%100[%]'");
            });

            it('should escape literal _ with bracket syntax', () => {
                expect(manager.executeFilter('sqlLikeEnds', 'first_name')).toBe("'%first[_]name'");
            });
        });
    });

    describe('PostgreSQL', () => {
        beforeEach(() => {
            manager.SetPlatform('postgresql');
        });

        describe('sqlLikeContains', () => {
            it('should wrap value with % on both sides', () => {
                expect(manager.executeFilter('sqlLikeContains', 'Leadership Conference')).toBe("'%Leadership Conference%'");
            });

            it('should return NULL for null', () => {
                expect(manager.executeFilter('sqlLikeContains', null)).toBe('NULL');
            });

            it('should escape single quotes', () => {
                expect(manager.executeFilter('sqlLikeContains', "O'Brien")).toBe("'%O''Brien%'");
            });

            it('should strip and not escape boundary % wildcards', () => {
                expect(manager.executeFilter('sqlLikeContains', '100%')).toBe("'%100%'");
            });

            it('should escape interior % with backslash syntax', () => {
                expect(manager.executeFilter('sqlLikeContains', '50% off 100% items')).toBe("'%50\\% off 100\\% items%'");
            });

            it('should strip leading and trailing % wildcards from value', () => {
                expect(manager.executeFilter('sqlLikeContains', '%Leadership%')).toBe("'%Leadership%'");
            });

            it('should escape literal _ with backslash syntax', () => {
                expect(manager.executeFilter('sqlLikeContains', 'first_name')).toBe("'%first\\_name%'");
            });
        });

        describe('sqlLikeBegins', () => {
            it('should append % after the value', () => {
                expect(manager.executeFilter('sqlLikeBegins', 'Leadership')).toBe("'Leadership%'");
            });

            it('should strip trailing % wildcard from value', () => {
                expect(manager.executeFilter('sqlLikeBegins', 'Leadership%')).toBe("'Leadership%'");
            });

            it('should preserve leading % as literal and escape it', () => {
                expect(manager.executeFilter('sqlLikeBegins', '%Leadership')).toBe("'\\%Leadership%'");
            });

            it('should escape literal _ with backslash syntax', () => {
                expect(manager.executeFilter('sqlLikeBegins', 'first_name')).toBe("'first\\_name%'");
            });
        });

        describe('sqlLikeEnds', () => {
            it('should prepend % before the value', () => {
                expect(manager.executeFilter('sqlLikeEnds', 'Conference')).toBe("'%Conference'");
            });

            it('should strip leading % wildcard from value', () => {
                expect(manager.executeFilter('sqlLikeEnds', '%Conference')).toBe("'%Conference'");
            });

            it('should preserve trailing % as literal and escape it', () => {
                expect(manager.executeFilter('sqlLikeEnds', '100%')).toBe("'%100\\%'");
            });

            it('should escape literal _ with backslash syntax', () => {
                expect(manager.executeFilter('sqlLikeEnds', 'first_name')).toBe("'%first\\_name'");
            });
        });
    });
});
