import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabasePlatform, PlatformSQL, IsPlatformSQL } from '../generic/platformSQL';
import { RunViewParams } from '../views/runView';
import { RunQuerySQLFilterManager } from '../generic/runQuerySQLFilterImplementations';

describe('PlatformSQL', () => {
    describe('IsPlatformSQL type guard', () => {
        it('should return true for a PlatformSQL object', () => {
            const value: PlatformSQL = { default: 'SELECT 1' };
            expect(IsPlatformSQL(value)).toBe(true);
        });

        it('should return true for a PlatformSQL with platform variants', () => {
            const value: PlatformSQL = {
                default: 'SELECT 1',
                sqlserver: 'SELECT TOP 1',
                postgresql: 'SELECT 1 LIMIT 1'
            };
            expect(IsPlatformSQL(value)).toBe(true);
        });

        it('should return false for a plain string', () => {
            expect(IsPlatformSQL('SELECT 1')).toBe(false);
        });

        it('should return false for null', () => {
            expect(IsPlatformSQL(null)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(IsPlatformSQL(undefined)).toBe(false);
        });

        it('should return false for an object without default key', () => {
            const value = { sqlserver: 'SELECT 1' };
            // Cast to test runtime behavior with unexpected shape
            expect(IsPlatformSQL(value as PlatformSQL)).toBe(false);
        });
    });

    describe('RunViewParams with PlatformSQL', () => {
        describe('ExtraFilter accepts PlatformSQL', () => {
            it('should accept a plain string (backward compatible)', () => {
                const params: RunViewParams = {
                    EntityName: 'Users',
                    ExtraFilter: "Status = 'Active'"
                };
                expect(params.ExtraFilter).toBe("Status = 'Active'");
            });

            it('should accept a PlatformSQL object', () => {
                const params: RunViewParams = {
                    EntityName: 'Users',
                    ExtraFilter: {
                        default: "Status = 'Active'",
                        sqlserver: "[IsAdmin] = 1",
                        postgresql: '"IsAdmin" = true'
                    }
                };
                expect(IsPlatformSQL(params.ExtraFilter)).toBe(true);
            });
        });

        describe('OrderBy accepts PlatformSQL', () => {
            it('should accept a plain string (backward compatible)', () => {
                const params: RunViewParams = {
                    EntityName: 'Users',
                    OrderBy: 'Name ASC'
                };
                expect(params.OrderBy).toBe('Name ASC');
            });

            it('should accept a PlatformSQL object', () => {
                const params: RunViewParams = {
                    EntityName: 'Users',
                    OrderBy: {
                        default: 'Name ASC',
                        postgresql: '"Name" ASC NULLS LAST'
                    }
                };
                expect(IsPlatformSQL(params.OrderBy)).toBe(true);
            });
        });

        describe('Equals with PlatformSQL', () => {
            it('should consider identical PlatformSQL objects equal', () => {
                const a: RunViewParams = {
                    EntityName: 'Users',
                    ExtraFilter: { default: 'A=1', sqlserver: 'B=1' }
                };
                const b: RunViewParams = {
                    EntityName: 'Users',
                    ExtraFilter: { default: 'A=1', sqlserver: 'B=1' }
                };
                expect(RunViewParams.Equals(a, b)).toBe(true);
            });

            it('should consider different PlatformSQL objects not equal', () => {
                const a: RunViewParams = {
                    EntityName: 'Users',
                    ExtraFilter: { default: 'A=1' }
                };
                const b: RunViewParams = {
                    EntityName: 'Users',
                    ExtraFilter: { default: 'B=2' }
                };
                expect(RunViewParams.Equals(a, b)).toBe(false);
            });

            it('should consider string and PlatformSQL not equal', () => {
                const a: RunViewParams = {
                    EntityName: 'Users',
                    ExtraFilter: 'A=1'
                };
                const b: RunViewParams = {
                    EntityName: 'Users',
                    ExtraFilter: { default: 'A=1' }
                };
                expect(RunViewParams.Equals(a, b)).toBe(false);
            });

            it('should compare OrderBy PlatformSQL objects', () => {
                const a: RunViewParams = {
                    EntityName: 'Users',
                    OrderBy: { default: 'Name ASC', postgresql: '"Name" ASC NULLS LAST' }
                };
                const b: RunViewParams = {
                    EntityName: 'Users',
                    OrderBy: { default: 'Name ASC', postgresql: '"Name" ASC NULLS LAST' }
                };
                expect(RunViewParams.Equals(a, b)).toBe(true);
            });

            it('should handle undefined PlatformSQL variants in equality', () => {
                const a: RunViewParams = {
                    EntityName: 'Users',
                    ExtraFilter: { default: 'A=1', sqlserver: undefined }
                };
                const b: RunViewParams = {
                    EntityName: 'Users',
                    ExtraFilter: { default: 'A=1' }
                };
                expect(RunViewParams.Equals(a, b)).toBe(true);
            });
        });
    });

    describe('RunQuerySQLFilterManager platform support', () => {
        it('should default to sqlserver platform', () => {
            expect(RunQuerySQLFilterManager.Instance.Platform).toBe('sqlserver');
        });

        describe('sqlBoolean filter', () => {
            it('should return 1/0 for SQL Server', () => {
                RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
                expect(RunQuerySQLFilterManager.Instance.executeFilter('sqlBoolean', true)).toBe('1');
                expect(RunQuerySQLFilterManager.Instance.executeFilter('sqlBoolean', false)).toBe('0');
            });

            it('should return true/false for PostgreSQL', () => {
                RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');
                expect(RunQuerySQLFilterManager.Instance.executeFilter('sqlBoolean', true)).toBe('true');
                expect(RunQuerySQLFilterManager.Instance.executeFilter('sqlBoolean', false)).toBe('false');
            });
        });

        describe('sqlIdentifier filter', () => {
            it('should use [brackets] for SQL Server', () => {
                RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
                expect(RunQuerySQLFilterManager.Instance.executeFilter('sqlIdentifier', 'UserName')).toBe('[UserName]');
            });

            it('should use "double quotes" for PostgreSQL', () => {
                RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');
                expect(RunQuerySQLFilterManager.Instance.executeFilter('sqlIdentifier', 'UserName')).toBe('"UserName"');
            });

            it('should reject invalid identifiers on both platforms', () => {
                RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
                expect(() => RunQuerySQLFilterManager.Instance.executeFilter('sqlIdentifier', 'DROP TABLE')).toThrow();

                RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');
                expect(() => RunQuerySQLFilterManager.Instance.executeFilter('sqlIdentifier', 'DROP TABLE')).toThrow();
            });
        });

        describe('SetPlatform', () => {
            it('should update platform and re-apply overrides', () => {
                RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
                expect(RunQuerySQLFilterManager.Instance.executeFilter('sqlBoolean', true)).toBe('1');

                RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');
                expect(RunQuerySQLFilterManager.Instance.executeFilter('sqlBoolean', true)).toBe('true');

                // Switch back
                RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
                expect(RunQuerySQLFilterManager.Instance.executeFilter('sqlBoolean', true)).toBe('1');
            });

            it('should not re-apply when platform is unchanged', () => {
                RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
                const filter1 = RunQuerySQLFilterManager.Instance.getFilter('sqlBoolean');
                const impl1 = filter1?.implementation;

                // Same platform - should not change implementation reference
                RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
                const filter2 = RunQuerySQLFilterManager.Instance.getFilter('sqlBoolean');
                expect(filter2?.implementation).toBe(impl1);
            });
        });

        describe('non-platform-sensitive filters are unaffected', () => {
            it('sqlString works the same on both platforms', () => {
                RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
                const ssResult = RunQuerySQLFilterManager.Instance.executeFilter('sqlString', "O'Brien");

                RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');
                const pgResult = RunQuerySQLFilterManager.Instance.executeFilter('sqlString', "O'Brien");

                expect(ssResult).toBe(pgResult);
                expect(ssResult).toBe("'O''Brien'");
            });

            it('sqlNumber works the same on both platforms', () => {
                RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
                const ssResult = RunQuerySQLFilterManager.Instance.executeFilter('sqlNumber', '42');

                RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');
                const pgResult = RunQuerySQLFilterManager.Instance.executeFilter('sqlNumber', '42');

                expect(ssResult).toBe(pgResult);
                expect(ssResult).toBe(42);
            });
        });

        // Reset to default after tests
        afterEach(() => {
            RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
        });
    });
});
