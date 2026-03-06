import { describe, it, expect } from 'vitest';
import { DatabasePlatform, PlatformSQL, IsPlatformSQL } from '../generic/platformSQL';
import { RunViewParams } from '../views/runView';

describe('PlatformSQL Extended', () => {
    // =========================================================================
    // PlatformSQL interface — creating instances with all field combinations
    // =========================================================================
    describe('PlatformSQL interface creation', () => {
        it('should create with only default', () => {
            const sql: PlatformSQL = { default: 'SELECT 1' };
            expect(sql.default).toBe('SELECT 1');
            expect(sql.sqlserver).toBeUndefined();
            expect(sql.postgresql).toBeUndefined();
        });

        it('should create with default and sqlserver', () => {
            const sql: PlatformSQL = {
                default: 'SELECT 1',
                sqlserver: 'SELECT TOP 1 * FROM [Table]'
            };
            expect(sql.default).toBe('SELECT 1');
            expect(sql.sqlserver).toBe('SELECT TOP 1 * FROM [Table]');
            expect(sql.postgresql).toBeUndefined();
        });

        it('should create with default and postgresql', () => {
            const sql: PlatformSQL = {
                default: 'SELECT 1',
                postgresql: 'SELECT * FROM "Table" LIMIT 1'
            };
            expect(sql.default).toBe('SELECT 1');
            expect(sql.sqlserver).toBeUndefined();
            expect(sql.postgresql).toBe('SELECT * FROM "Table" LIMIT 1');
        });

        it('should create with all platforms specified', () => {
            const sql: PlatformSQL = {
                default: 'SELECT 1',
                sqlserver: 'SELECT TOP 1 * FROM [Table]',
                postgresql: 'SELECT * FROM "Table" LIMIT 1'
            };
            expect(sql.default).toBe('SELECT 1');
            expect(sql.sqlserver).toBe('SELECT TOP 1 * FROM [Table]');
            expect(sql.postgresql).toBe('SELECT * FROM "Table" LIMIT 1');
        });

        it('should allow empty string as default', () => {
            const sql: PlatformSQL = { default: '' };
            expect(sql.default).toBe('');
        });

        it('should allow empty string as platform variant', () => {
            const sql: PlatformSQL = {
                default: 'SELECT 1',
                sqlserver: '',
                postgresql: ''
            };
            expect(sql.sqlserver).toBe('');
            expect(sql.postgresql).toBe('');
        });

        it('should allow complex SQL with special characters', () => {
            const sql: PlatformSQL = {
                default: "Name LIKE '%O''Brien%' AND Status IN ('Active', 'Pending')",
                sqlserver: "[Name] LIKE '%O''Brien%' AND [Status] IN ('Active', 'Pending')",
                postgresql: '"Name" LIKE \'%O\'\'Brien%\' AND "Status" IN (\'Active\', \'Pending\')'
            };
            expect(sql.default).toContain("O''Brien");
            expect(sql.sqlserver).toContain('[Name]');
            expect(sql.postgresql).toContain('"Name"');
        });

        it('should allow multiline SQL strings', () => {
            const sql: PlatformSQL = {
                default: `
                    Status = 'Active'
                    AND CreatedAt > '2024-01-01'
                `,
                sqlserver: `
                    [Status] = 'Active'
                    AND [CreatedAt] > '2024-01-01'
                `
            };
            expect(sql.default).toContain('Status');
            expect(sql.sqlserver).toContain('[Status]');
        });
    });

    // =========================================================================
    // IsPlatformSQL type guard — exhaustive testing
    // =========================================================================
    describe('IsPlatformSQL type guard extended', () => {
        it('should return true for minimal PlatformSQL (only default)', () => {
            expect(IsPlatformSQL({ default: 'x' })).toBe(true);
        });

        it('should return true for PlatformSQL with all fields', () => {
            expect(IsPlatformSQL({
                default: 'x',
                sqlserver: 'y',
                postgresql: 'z'
            })).toBe(true);
        });

        it('should return false for a plain string', () => {
            expect(IsPlatformSQL('SELECT 1')).toBe(false);
        });

        it('should return false for an empty string', () => {
            expect(IsPlatformSQL('')).toBe(false);
        });

        it('should return false for null', () => {
            expect(IsPlatformSQL(null)).toBe(false);
        });

        it('should return false for undefined', () => {
            expect(IsPlatformSQL(undefined)).toBe(false);
        });

        it('should return false for an empty object (no default key)', () => {
            expect(IsPlatformSQL({} as PlatformSQL)).toBe(false);
        });

        it('should return false for object with only sqlserver key (no default)', () => {
            expect(IsPlatformSQL({ sqlserver: 'SELECT 1' } as PlatformSQL)).toBe(false);
        });

        it('should return false for object with only postgresql key (no default)', () => {
            expect(IsPlatformSQL({ postgresql: 'SELECT 1' } as PlatformSQL)).toBe(false);
        });

        it('should return true for PlatformSQL with empty default', () => {
            expect(IsPlatformSQL({ default: '' })).toBe(true);
        });

        it('should return false for number value', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing runtime behavior with wrong types
            expect(IsPlatformSQL(42 as unknown as string)).toBe(false);
        });

        it('should return false for boolean value', () => {
            expect(IsPlatformSQL(true as unknown as string)).toBe(false);
        });

        it('should return false for an array', () => {
            expect(IsPlatformSQL(['SELECT 1'] as unknown as string)).toBe(false);
        });
    });

    // =========================================================================
    // Simulated ResolveSQL logic (matching ProviderBase.ResolveSQL)
    // =========================================================================
    describe('ResolveSQL logic', () => {
        /**
         * Mirrors the ProviderBase.ResolveSQL method so we can test
         * resolution logic independently without instantiating the full provider.
         */
        function resolveSQL(value: string | PlatformSQL | undefined | null, platform: DatabasePlatform): string {
            if (value == null) return '';
            if (typeof value === 'string') return value;
            const platformVariant = value[platform];
            if (platformVariant != null && platformVariant.length > 0) return platformVariant;
            return value.default;
        }

        it('should return plain string as-is for sqlserver', () => {
            expect(resolveSQL('SELECT 1', 'sqlserver')).toBe('SELECT 1');
        });

        it('should return plain string as-is for postgresql', () => {
            expect(resolveSQL('SELECT 1', 'postgresql')).toBe('SELECT 1');
        });

        it('should return empty string for null', () => {
            expect(resolveSQL(null, 'sqlserver')).toBe('');
        });

        it('should return empty string for undefined', () => {
            expect(resolveSQL(undefined, 'postgresql')).toBe('');
        });

        it('should resolve sqlserver variant when available', () => {
            const sql: PlatformSQL = {
                default: 'DEFAULT SQL',
                sqlserver: 'SS SQL',
                postgresql: 'PG SQL'
            };
            expect(resolveSQL(sql, 'sqlserver')).toBe('SS SQL');
        });

        it('should resolve postgresql variant when available', () => {
            const sql: PlatformSQL = {
                default: 'DEFAULT SQL',
                sqlserver: 'SS SQL',
                postgresql: 'PG SQL'
            };
            expect(resolveSQL(sql, 'postgresql')).toBe('PG SQL');
        });

        it('should fall back to default when platform variant is missing', () => {
            const sql: PlatformSQL = {
                default: 'DEFAULT SQL',
                sqlserver: 'SS SQL'
            };
            expect(resolveSQL(sql, 'postgresql')).toBe('DEFAULT SQL');
        });

        it('should fall back to default when platform variant is empty string', () => {
            const sql: PlatformSQL = {
                default: 'DEFAULT SQL',
                postgresql: ''
            };
            expect(resolveSQL(sql, 'postgresql')).toBe('DEFAULT SQL');
        });

        it('should use empty default if nothing else matches', () => {
            const sql: PlatformSQL = { default: '' };
            expect(resolveSQL(sql, 'sqlserver')).toBe('');
        });

        it('should resolve correctly when only one platform variant exists', () => {
            const sql: PlatformSQL = {
                default: "Status = 'Active'",
                postgresql: '"Status" = true'
            };
            expect(resolveSQL(sql, 'postgresql')).toBe('"Status" = true');
            expect(resolveSQL(sql, 'sqlserver')).toBe("Status = 'Active'");
        });
    });

    // =========================================================================
    // RunViewParams with PlatformSQL ExtraFilter
    // =========================================================================
    describe('RunViewParams with PlatformSQL ExtraFilter', () => {
        it('should accept PlatformSQL for ExtraFilter with all variants', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: {
                    default: "IsActive = 1",
                    sqlserver: "[IsActive] = 1",
                    postgresql: '"IsActive" = true'
                }
            };
            expect(IsPlatformSQL(params.ExtraFilter)).toBe(true);
            const filter = params.ExtraFilter as PlatformSQL;
            expect(filter.default).toBe('IsActive = 1');
            expect(filter.sqlserver).toBe('[IsActive] = 1');
            expect(filter.postgresql).toBe('"IsActive" = true');
        });

        it('should accept PlatformSQL with only default for ExtraFilter', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: {
                    default: "Status = 'Active'"
                }
            };
            expect(IsPlatformSQL(params.ExtraFilter)).toBe(true);
        });

        it('should maintain backward compatibility with string ExtraFilter', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: "Status = 'Active'"
            };
            expect(typeof params.ExtraFilter).toBe('string');
            expect(IsPlatformSQL(params.ExtraFilter)).toBe(false);
        });
    });

    // =========================================================================
    // RunViewParams with PlatformSQL OrderBy
    // =========================================================================
    describe('RunViewParams with PlatformSQL OrderBy', () => {
        it('should accept PlatformSQL for OrderBy with platform variants', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                OrderBy: {
                    default: 'Name ASC',
                    postgresql: '"Name" ASC NULLS LAST'
                }
            };
            expect(IsPlatformSQL(params.OrderBy)).toBe(true);
            const orderBy = params.OrderBy as PlatformSQL;
            expect(orderBy.postgresql).toBe('"Name" ASC NULLS LAST');
        });

        it('should maintain backward compatibility with string OrderBy', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                OrderBy: 'Name ASC'
            };
            expect(typeof params.OrderBy).toBe('string');
            expect(IsPlatformSQL(params.OrderBy)).toBe(false);
        });
    });

    // =========================================================================
    // JSON serialization / deserialization roundtrip
    // =========================================================================
    describe('PlatformSQL serialization roundtrip', () => {
        it('should roundtrip a PlatformSQL with all fields via JSON', () => {
            const original: PlatformSQL = {
                default: 'SELECT 1',
                sqlserver: 'SELECT TOP 1 FROM [t]',
                postgresql: 'SELECT 1 FROM "t" LIMIT 1'
            };
            const json = JSON.stringify(original);
            const parsed = JSON.parse(json) as PlatformSQL;
            expect(parsed.default).toBe(original.default);
            expect(parsed.sqlserver).toBe(original.sqlserver);
            expect(parsed.postgresql).toBe(original.postgresql);
            expect(IsPlatformSQL(parsed)).toBe(true);
        });

        it('should roundtrip a PlatformSQL with only default', () => {
            const original: PlatformSQL = { default: 'Status = 1' };
            const json = JSON.stringify(original);
            const parsed = JSON.parse(json) as PlatformSQL;
            expect(parsed.default).toBe(original.default);
            expect(IsPlatformSQL(parsed)).toBe(true);
        });

        it('should roundtrip a PlatformSQL with undefined variants correctly', () => {
            const original: PlatformSQL = {
                default: 'SELECT 1',
                sqlserver: undefined
            };
            const json = JSON.stringify(original);
            const parsed = JSON.parse(json) as PlatformSQL;
            // JSON.stringify drops undefined values
            expect(parsed.sqlserver).toBeUndefined();
            expect(parsed.default).toBe('SELECT 1');
            expect(IsPlatformSQL(parsed)).toBe(true);
        });

        it('should roundtrip RunViewParams with PlatformSQL fields', () => {
            const original: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1', sqlserver: 'B=1' },
                OrderBy: { default: 'Name', postgresql: '"Name" NULLS LAST' },
                MaxRows: 100,
                ResultType: 'simple'
            };
            const json = JSON.stringify(original);
            const parsed = JSON.parse(json) as RunViewParams;
            expect(parsed.EntityName).toBe('Users');
            expect(IsPlatformSQL(parsed.ExtraFilter)).toBe(true);
            expect(IsPlatformSQL(parsed.OrderBy)).toBe(true);
            expect(parsed.MaxRows).toBe(100);
            expect(parsed.ResultType).toBe('simple');
        });
    });

    // =========================================================================
    // RunViewParams.Equals with PlatformSQL vs string comparisons
    // =========================================================================
    describe('RunViewParams.Equals with PlatformSQL', () => {
        it('should consider identical PlatformSQL ExtraFilter objects equal', () => {
            const a: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1', sqlserver: 'B=1', postgresql: 'C=1' }
            };
            const b: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1', sqlserver: 'B=1', postgresql: 'C=1' }
            };
            expect(RunViewParams.Equals(a, b)).toBe(true);
        });

        it('should detect difference in PlatformSQL default field', () => {
            const a: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1' }
            };
            const b: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=2' }
            };
            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('should detect difference in PlatformSQL platform variant', () => {
            const a: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1', sqlserver: 'X=1' }
            };
            const b: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1', sqlserver: 'X=2' }
            };
            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('should consider string and PlatformSQL with same default NOT equal', () => {
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

        it('should consider identical PlatformSQL OrderBy objects equal', () => {
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

        it('should detect difference in OrderBy PlatformSQL', () => {
            const a: RunViewParams = {
                EntityName: 'Users',
                OrderBy: { default: 'Name ASC' }
            };
            const b: RunViewParams = {
                EntityName: 'Users',
                OrderBy: { default: 'Name DESC' }
            };
            expect(RunViewParams.Equals(a, b)).toBe(false);
        });

        it('should handle both ExtraFilter and OrderBy as PlatformSQL', () => {
            const a: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'F=1', sqlserver: 'F=2' },
                OrderBy: { default: 'Name', postgresql: '"Name"' }
            };
            const b: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'F=1', sqlserver: 'F=2' },
                OrderBy: { default: 'Name', postgresql: '"Name"' }
            };
            expect(RunViewParams.Equals(a, b)).toBe(true);
        });

        it('should handle undefined PlatformSQL variants treated as equal', () => {
            const a: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1', sqlserver: undefined, postgresql: undefined }
            };
            const b: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1' }
            };
            expect(RunViewParams.Equals(a, b)).toBe(true);
        });

        it('should consider null params equal', () => {
            expect(RunViewParams.Equals(null, null)).toBe(true);
        });

        it('should consider undefined params equal', () => {
            expect(RunViewParams.Equals(undefined, undefined)).toBe(true);
        });

        it('should return false when one param is null and other is defined', () => {
            const a: RunViewParams = { EntityName: 'Users' };
            expect(RunViewParams.Equals(a, null)).toBe(false);
            expect(RunViewParams.Equals(null, a)).toBe(false);
        });
    });

    // =========================================================================
    // Combining PlatformSQL with other RunViewParams options
    // =========================================================================
    describe('PlatformSQL combined with other RunViewParams options', () => {
        it('should work with MaxRows and ResultType', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: "Status='Active'", postgresql: '"Status" = \'Active\'' },
                MaxRows: 50,
                ResultType: 'simple'
            };
            expect(IsPlatformSQL(params.ExtraFilter)).toBe(true);
            expect(params.MaxRows).toBe(50);
            expect(params.ResultType).toBe('simple');
        });

        it('should work with Fields array', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1' },
                Fields: ['ID', 'Name', 'Email']
            };
            expect(IsPlatformSQL(params.ExtraFilter)).toBe(true);
            expect(params.Fields).toEqual(['ID', 'Name', 'Email']);
        });

        it('should work with StartRow pagination', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'Status=1', sqlserver: '[Status]=1', postgresql: '"Status"=true' },
                OrderBy: { default: 'Name ASC' },
                StartRow: 20,
                MaxRows: 10,
                ResultType: 'simple'
            };
            expect(IsPlatformSQL(params.ExtraFilter)).toBe(true);
            expect(IsPlatformSQL(params.OrderBy)).toBe(true);
            expect(params.StartRow).toBe(20);
            expect(params.MaxRows).toBe(10);
        });

        it('should work with UserSearchString', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'Active=1' },
                UserSearchString: 'John'
            };
            expect(IsPlatformSQL(params.ExtraFilter)).toBe(true);
            expect(params.UserSearchString).toBe('John');
        });

        it('should work with SaveViewResults and ForceAuditLog', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'Active=1' },
                SaveViewResults: true,
                ForceAuditLog: true,
                AuditLogDescription: 'Test audit'
            };
            expect(IsPlatformSQL(params.ExtraFilter)).toBe(true);
            expect(params.SaveViewResults).toBe(true);
            expect(params.ForceAuditLog).toBe(true);
        });

        it('should work with CacheLocal options', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'Active=1' },
                CacheLocal: true,
                CacheLocalTTL: 60000
            };
            expect(params.CacheLocal).toBe(true);
            expect(params.CacheLocalTTL).toBe(60000);
        });

        it('should preserve Equals comparison with all combined params', () => {
            const a: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1', sqlserver: 'B=1' },
                OrderBy: { default: 'Name' },
                MaxRows: 100,
                StartRow: 0,
                ResultType: 'simple',
                Fields: ['ID', 'Name'],
                UserSearchString: 'test',
                CacheLocal: true,
                CacheLocalTTL: 5000
            };
            const b: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1', sqlserver: 'B=1' },
                OrderBy: { default: 'Name' },
                MaxRows: 100,
                StartRow: 0,
                ResultType: 'simple',
                Fields: ['ID', 'Name'],
                UserSearchString: 'test',
                CacheLocal: true,
                CacheLocalTTL: 5000
            };
            expect(RunViewParams.Equals(a, b)).toBe(true);
        });
    });

    // =========================================================================
    // DatabasePlatform type
    // =========================================================================
    describe('DatabasePlatform type', () => {
        it('should accept sqlserver as a valid platform', () => {
            const platform: DatabasePlatform = 'sqlserver';
            expect(platform).toBe('sqlserver');
        });

        it('should accept postgresql as a valid platform', () => {
            const platform: DatabasePlatform = 'postgresql';
            expect(platform).toBe('postgresql');
        });

        it('should be usable as PlatformSQL key', () => {
            const platform: DatabasePlatform = 'postgresql';
            const sql: PlatformSQL = {
                default: 'fallback',
                sqlserver: 'ss',
                postgresql: 'pg'
            };
            expect(sql[platform]).toBe('pg');
        });
    });
});
