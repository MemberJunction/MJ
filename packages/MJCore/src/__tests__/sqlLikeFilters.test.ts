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

            it('should escape literal % with bracket syntax', () => {
                expect(manager.executeFilter('sqlLikeContains', '100%')).toBe("'%100[%]%'");
            });

            it('should escape literal _ with bracket syntax', () => {
                expect(manager.executeFilter('sqlLikeContains', 'first_name')).toBe("'%first[_]name%'");
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

            it('should escape literal % with bracket syntax', () => {
                expect(manager.executeFilter('sqlLikeBegins', '100%')).toBe("'100[%]%'");
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

            it('should escape literal % with bracket syntax', () => {
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

            it('should escape literal % with backslash syntax', () => {
                expect(manager.executeFilter('sqlLikeContains', '100%')).toBe("'%100\\%%'");
            });

            it('should escape literal _ with backslash syntax', () => {
                expect(manager.executeFilter('sqlLikeContains', 'first_name')).toBe("'%first\\_name%'");
            });
        });

        describe('sqlLikeBegins', () => {
            it('should append % after the value', () => {
                expect(manager.executeFilter('sqlLikeBegins', 'Leadership')).toBe("'Leadership%'");
            });

            it('should escape literal % with backslash syntax', () => {
                expect(manager.executeFilter('sqlLikeBegins', '100%')).toBe("'100\\%%'");
            });

            it('should escape literal _ with backslash syntax', () => {
                expect(manager.executeFilter('sqlLikeBegins', 'first_name')).toBe("'first\\_name%'");
            });
        });

        describe('sqlLikeEnds', () => {
            it('should prepend % before the value', () => {
                expect(manager.executeFilter('sqlLikeEnds', 'Conference')).toBe("'%Conference'");
            });

            it('should escape literal % with backslash syntax', () => {
                expect(manager.executeFilter('sqlLikeEnds', '100%')).toBe("'%100\\%'");
            });

            it('should escape literal _ with backslash syntax', () => {
                expect(manager.executeFilter('sqlLikeEnds', 'first_name')).toBe("'%first\\_name'");
            });
        });
    });
});
