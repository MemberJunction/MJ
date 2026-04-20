import { describe, it, expect } from 'vitest';
import {
    PlatformVariantsJSON,
    ParsePlatformVariants,
    ResolvePlatformVariant
} from '../generic/platformVariants';
import { QueryInfo } from '../generic/queryInfo';
import { RowLevelSecurityFilterInfo } from '../generic/securityInfo';

describe('PlatformVariants', () => {
    describe('ParsePlatformVariants', () => {
        it('should parse valid JSON', () => {
            const json = JSON.stringify({
                SQL: { postgresql: 'SELECT 1' },
                _meta: { translatedBy: 'manual' }
            });
            const result = ParsePlatformVariants(json);
            expect(result).not.toBeNull();
            expect(result!.SQL!.postgresql).toBe('SELECT 1');
            expect(result!._meta!.translatedBy).toBe('manual');
        });

        it('should return null for null input', () => {
            expect(ParsePlatformVariants(null)).toBeNull();
        });

        it('should return null for undefined input', () => {
            expect(ParsePlatformVariants(undefined)).toBeNull();
        });

        it('should return null for empty string', () => {
            expect(ParsePlatformVariants('')).toBeNull();
        });

        it('should return null for invalid JSON', () => {
            expect(ParsePlatformVariants('not valid json {')).toBeNull();
        });

        it('should parse JSON with multiple field variants', () => {
            const json = JSON.stringify({
                SQL: { sqlserver: 'SELECT TOP 10 *', postgresql: 'SELECT * LIMIT 10' },
                CacheValidationSQL: { postgresql: 'SELECT MAX("__mj_UpdatedAt") FROM "Users"' },
                _meta: { sourceDialect: 'sqlserver', translatedBy: 'llm', llmModel: 'claude-4' }
            });
            const result = ParsePlatformVariants(json);
            expect(result!.SQL!.sqlserver).toBe('SELECT TOP 10 *');
            expect(result!.SQL!.postgresql).toBe('SELECT * LIMIT 10');
            expect(result!.CacheValidationSQL!.postgresql).toContain('MAX');
            expect(result!._meta!.llmModel).toBe('claude-4');
        });
    });

    describe('ResolvePlatformVariant', () => {
        const variants: PlatformVariantsJSON = {
            SQL: {
                sqlserver: 'SELECT TOP 10 * FROM [Users]',
                postgresql: 'SELECT * FROM "Users" LIMIT 10'
            },
            CacheValidationSQL: {
                postgresql: 'SELECT MAX("__mj_UpdatedAt") FROM "Users"'
            },
            FilterText: {
                postgresql: '"IsActive" = true'
            }
        };

        it('should return postgresql variant when available', () => {
            const result = ResolvePlatformVariant(variants, 'SQL', 'postgresql');
            expect(result).toBe('SELECT * FROM "Users" LIMIT 10');
        });

        it('should return sqlserver variant when available', () => {
            const result = ResolvePlatformVariant(variants, 'SQL', 'sqlserver');
            expect(result).toBe('SELECT TOP 10 * FROM [Users]');
        });

        it('should return null when no variant for the requested platform', () => {
            const result = ResolvePlatformVariant(variants, 'CacheValidationSQL', 'sqlserver');
            expect(result).toBeNull();
        });

        it('should return null when field has no variants', () => {
            const result = ResolvePlatformVariant(variants, 'WhereClause', 'postgresql');
            expect(result).toBeNull();
        });

        it('should return null when variants object is null', () => {
            const result = ResolvePlatformVariant(null, 'SQL', 'postgresql');
            expect(result).toBeNull();
        });

        it('should return null for empty string variant', () => {
            const emptyVariants: PlatformVariantsJSON = {
                SQL: { postgresql: '' }
            };
            const result = ResolvePlatformVariant(emptyVariants, 'SQL', 'postgresql');
            expect(result).toBeNull();
        });

        it('should return FilterText variant', () => {
            const result = ResolvePlatformVariant(variants, 'FilterText', 'postgresql');
            expect(result).toBe('"IsActive" = true');
        });
    });

    describe('QueryInfo.GetPlatformSQL', () => {
        function createQueryInfo(overrides: Record<string, unknown> = {}): QueryInfo {
            return new QueryInfo({
                ID: 'q-1',
                Name: 'Test Query',
                SQL: 'SELECT TOP 10 * FROM [Users] WHERE [IsActive] = 1',
                Status: 'Approved',
                CacheValidationSQL: 'SELECT MAX(__mj_UpdatedAt) FROM [Users]',
                PlatformVariants: null,
                ...overrides
            });
        }

        it('should return base SQL when no PlatformVariants', () => {
            const query = createQueryInfo();
            expect(query.GetPlatformSQL('postgresql')).toBe('SELECT TOP 10 * FROM [Users] WHERE [IsActive] = 1');
            expect(query.GetPlatformSQL('sqlserver')).toBe('SELECT TOP 10 * FROM [Users] WHERE [IsActive] = 1');
        });

        it('should return platform variant SQL when available', () => {
            const query = createQueryInfo({
                PlatformVariants: JSON.stringify({
                    SQL: { postgresql: 'SELECT * FROM "Users" WHERE "IsActive" = true LIMIT 10' }
                })
            });
            expect(query.GetPlatformSQL('postgresql')).toBe('SELECT * FROM "Users" WHERE "IsActive" = true LIMIT 10');
        });

        it('should fall back to base SQL when platform not in variants', () => {
            const query = createQueryInfo({
                PlatformVariants: JSON.stringify({
                    SQL: { postgresql: 'SELECT * FROM "Users" LIMIT 10' }
                })
            });
            // sqlserver not in variants, falls back to base SQL
            expect(query.GetPlatformSQL('sqlserver')).toBe('SELECT TOP 10 * FROM [Users] WHERE [IsActive] = 1');
        });

        it('should fall back to base SQL when variants JSON is invalid', () => {
            const query = createQueryInfo({
                PlatformVariants: 'invalid json'
            });
            expect(query.GetPlatformSQL('postgresql')).toBe('SELECT TOP 10 * FROM [Users] WHERE [IsActive] = 1');
        });
    });

    describe('QueryInfo.GetPlatformCacheValidationSQL', () => {
        function createQueryInfo(overrides: Record<string, unknown> = {}): QueryInfo {
            return new QueryInfo({
                ID: 'q-1',
                Name: 'Test Query',
                SQL: 'SELECT 1',
                Status: 'Approved',
                CacheValidationSQL: 'SELECT MAX(__mj_UpdatedAt) FROM [Users]',
                PlatformVariants: null,
                ...overrides
            });
        }

        it('should return base CacheValidationSQL when no variants', () => {
            const query = createQueryInfo();
            expect(query.GetPlatformCacheValidationSQL('postgresql')).toBe('SELECT MAX(__mj_UpdatedAt) FROM [Users]');
        });

        it('should return platform variant CacheValidationSQL', () => {
            const query = createQueryInfo({
                PlatformVariants: JSON.stringify({
                    CacheValidationSQL: { postgresql: 'SELECT MAX("__mj_UpdatedAt") FROM "Users"' }
                })
            });
            expect(query.GetPlatformCacheValidationSQL('postgresql')).toBe('SELECT MAX("__mj_UpdatedAt") FROM "Users"');
        });

        it('should return null when base CacheValidationSQL is null and no variant', () => {
            const query = createQueryInfo({ CacheValidationSQL: null });
            expect(query.GetPlatformCacheValidationSQL('postgresql')).toBeNull();
        });
    });

    describe('RowLevelSecurityFilterInfo.GetPlatformFilterText', () => {
        function createRLSFilter(overrides: Record<string, unknown> = {}): RowLevelSecurityFilterInfo {
            return new RowLevelSecurityFilterInfo({
                ID: 'rls-1',
                Name: 'Active Users Only',
                FilterText: '[IsActive] = 1',
                PlatformVariants: null,
                ...overrides
            });
        }

        it('should return base FilterText when no PlatformVariants', () => {
            const filter = createRLSFilter();
            expect(filter.GetPlatformFilterText('postgresql')).toBe('[IsActive] = 1');
            expect(filter.GetPlatformFilterText('sqlserver')).toBe('[IsActive] = 1');
        });

        it('should return platform variant FilterText when available', () => {
            const filter = createRLSFilter({
                PlatformVariants: JSON.stringify({
                    FilterText: { postgresql: '"IsActive" = true' }
                })
            });
            expect(filter.GetPlatformFilterText('postgresql')).toBe('"IsActive" = true');
        });

        it('should fall back to base FilterText when platform not in variants', () => {
            const filter = createRLSFilter({
                PlatformVariants: JSON.stringify({
                    FilterText: { postgresql: '"IsActive" = true' }
                })
            });
            expect(filter.GetPlatformFilterText('sqlserver')).toBe('[IsActive] = 1');
        });

        it('should fall back to base FilterText when variants JSON is invalid', () => {
            const filter = createRLSFilter({
                PlatformVariants: '{bad json'
            });
            expect(filter.GetPlatformFilterText('postgresql')).toBe('[IsActive] = 1');
        });

        it('should cache parsed variants across multiple calls', () => {
            const filter = createRLSFilter({
                PlatformVariants: JSON.stringify({
                    FilterText: { postgresql: '"IsActive" = true' }
                })
            });
            // Call multiple times - should not throw or behave differently
            expect(filter.GetPlatformFilterText('postgresql')).toBe('"IsActive" = true');
            expect(filter.GetPlatformFilterText('postgresql')).toBe('"IsActive" = true');
            expect(filter.GetPlatformFilterText('sqlserver')).toBe('[IsActive] = 1');
        });
    });
});
