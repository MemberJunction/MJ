import { describe, it, expect, beforeEach } from 'vitest';
import { DatabasePlatform, PlatformSQL, IsPlatformSQL } from '../generic/platformSQL';
import { RunViewParams } from '../views/runView';
import {
    ProviderBase,
} from '../generic/providerBase';
import {
    RunViewResult,
    ProviderConfigDataBase,
    ProviderType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    PotentialDuplicateRequest,
    PotentialDuplicateResponse,
    DatasetItemFilterType,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
} from '../generic/interfaces';
import { RunQueryParams, RunQueryResult } from '../generic/runQuery';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, RecordDependency } from '../generic/securityInfo';
import { EntityDependency, RecordMergeRequest, RecordMergeResult, EntityMergeOptions } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';

// ---------------------------------------------------------------------------
// Minimal concrete subclass of ProviderBase for testing platform SQL methods.
// All abstract methods are stubbed — we only test ResolveSQL, PlatformKey,
// and ResolvePlatformSQLInParams via the public surface.
// ---------------------------------------------------------------------------
class TestProvider extends ProviderBase {
    private _platformKeyOverride: DatabasePlatform = 'sqlserver';

    /** Allow tests to change the platform key */
    public SetPlatformKeyForTest(platform: DatabasePlatform): void {
        this._platformKeyOverride = platform;
    }

    override get PlatformKey(): DatabasePlatform {
        return this._platformKeyOverride;
    }

    // --- Required abstract stubs ---------------------------------------------------
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> {
        return { Success: true, Results: [] as T[], TotalRowCount: 0, ExecutionTime: 0, RowCount: 0, UserViewRunID: '', Filtered: false, ErrorMessage: '' };
    }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { return []; }
    protected async InternalRunQuery(): Promise<RunQueryResult> {
        return { Success: true, Results: [], Fields: [] };
    }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] };
    }
    public async MergeRecords(): Promise<RecordMergeResult> { return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', RecordStatus: [], Request: {} as RecordMergeRequest, KeyValueOfSurvivingRecord: new CompositeKey() }; }
    public async GetDatasetByName(): Promise<DatasetResultType> { return { Success: false, Status: 'Error', Results: [], LatestUpdateDate: new Date(), EntityUpdateDates: [] }; }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> { return { Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] }; }
    public get InstanceConnectionString(): string { return ''; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider { return {} as ILocalStorageProvider; }
    protected get Metadata(): IMetadataProvider { return {} as IMetadataProvider; }
}

// ---------------------------------------------------------------------------
// A PostgreSQL-flavored provider
// ---------------------------------------------------------------------------
class PostgreSQLTestProvider extends TestProvider {
    constructor() {
        super();
        this.SetPlatformKeyForTest('postgresql');
    }
}

describe('ProviderBase Platform SQL', () => {
    let sqlServerProvider: TestProvider;
    let postgresProvider: PostgreSQLTestProvider;

    beforeEach(() => {
        sqlServerProvider = new TestProvider();
        postgresProvider = new PostgreSQLTestProvider();
    });

    // =========================================================================
    // PlatformKey detection
    // =========================================================================
    describe('PlatformKey', () => {
        it('should default to sqlserver', () => {
            const provider = new TestProvider();
            expect(provider.PlatformKey).toBe('sqlserver');
        });

        it('should return postgresql when overridden', () => {
            expect(postgresProvider.PlatformKey).toBe('postgresql');
        });

        it('should allow dynamic platform switching', () => {
            const provider = new TestProvider();
            expect(provider.PlatformKey).toBe('sqlserver');
            provider.SetPlatformKeyForTest('postgresql');
            expect(provider.PlatformKey).toBe('postgresql');
            provider.SetPlatformKeyForTest('sqlserver');
            expect(provider.PlatformKey).toBe('sqlserver');
        });
    });

    // =========================================================================
    // ResolveSQL — public method on ProviderBase
    // =========================================================================
    describe('ResolveSQL', () => {
        describe('with plain strings', () => {
            it('should return plain string unchanged for sqlserver provider', () => {
                expect(sqlServerProvider.ResolveSQL('SELECT 1')).toBe('SELECT 1');
            });

            it('should return plain string unchanged for postgresql provider', () => {
                expect(postgresProvider.ResolveSQL('SELECT 1')).toBe('SELECT 1');
            });

            it('should return empty string for null', () => {
                expect(sqlServerProvider.ResolveSQL(null)).toBe('');
            });

            it('should return empty string for undefined', () => {
                expect(sqlServerProvider.ResolveSQL(undefined)).toBe('');
            });

            it('should return empty string unchanged', () => {
                expect(sqlServerProvider.ResolveSQL('')).toBe('');
            });
        });

        describe('with PlatformSQL objects on sqlserver provider', () => {
            it('should return sqlserver variant when available', () => {
                const sql: PlatformSQL = {
                    default: 'DEFAULT',
                    sqlserver: 'SQLSERVER',
                    postgresql: 'POSTGRESQL'
                };
                expect(sqlServerProvider.ResolveSQL(sql)).toBe('SQLSERVER');
            });

            it('should fall back to default when sqlserver variant is missing', () => {
                const sql: PlatformSQL = {
                    default: 'DEFAULT',
                    postgresql: 'POSTGRESQL'
                };
                expect(sqlServerProvider.ResolveSQL(sql)).toBe('DEFAULT');
            });

            it('should fall back to default when sqlserver variant is empty', () => {
                const sql: PlatformSQL = {
                    default: 'DEFAULT',
                    sqlserver: ''
                };
                expect(sqlServerProvider.ResolveSQL(sql)).toBe('DEFAULT');
            });

            it('should fall back to default when sqlserver variant is undefined', () => {
                const sql: PlatformSQL = {
                    default: 'DEFAULT',
                    sqlserver: undefined
                };
                expect(sqlServerProvider.ResolveSQL(sql)).toBe('DEFAULT');
            });
        });

        describe('with PlatformSQL objects on postgresql provider', () => {
            it('should return postgresql variant when available', () => {
                const sql: PlatformSQL = {
                    default: 'DEFAULT',
                    sqlserver: 'SQLSERVER',
                    postgresql: 'POSTGRESQL'
                };
                expect(postgresProvider.ResolveSQL(sql)).toBe('POSTGRESQL');
            });

            it('should fall back to default when postgresql variant is missing', () => {
                const sql: PlatformSQL = {
                    default: 'DEFAULT',
                    sqlserver: 'SQLSERVER'
                };
                expect(postgresProvider.ResolveSQL(sql)).toBe('DEFAULT');
            });

            it('should fall back to default when postgresql variant is empty', () => {
                const sql: PlatformSQL = {
                    default: 'DEFAULT',
                    postgresql: ''
                };
                expect(postgresProvider.ResolveSQL(sql)).toBe('DEFAULT');
            });
        });

        describe('edge cases', () => {
            it('should handle PlatformSQL with only default', () => {
                const sql: PlatformSQL = { default: 'ONLY DEFAULT' };
                expect(sqlServerProvider.ResolveSQL(sql)).toBe('ONLY DEFAULT');
                expect(postgresProvider.ResolveSQL(sql)).toBe('ONLY DEFAULT');
            });

            it('should handle empty default with no platform variants', () => {
                const sql: PlatformSQL = { default: '' };
                expect(sqlServerProvider.ResolveSQL(sql)).toBe('');
                expect(postgresProvider.ResolveSQL(sql)).toBe('');
            });

            it('should handle empty default with a platform variant', () => {
                const sql: PlatformSQL = {
                    default: '',
                    sqlserver: 'SQLSERVER'
                };
                // sqlserver provider gets the variant
                expect(sqlServerProvider.ResolveSQL(sql)).toBe('SQLSERVER');
                // postgresql provider gets empty default
                expect(postgresProvider.ResolveSQL(sql)).toBe('');
            });

            it('should resolve complex SQL with quoted identifiers', () => {
                const sql: PlatformSQL = {
                    default: "Name = 'Active'",
                    sqlserver: "[Name] = 'Active' AND [IsAdmin] = 1",
                    postgresql: '"Name" = \'Active\' AND "IsAdmin" = true'
                };
                expect(sqlServerProvider.ResolveSQL(sql)).toBe("[Name] = 'Active' AND [IsAdmin] = 1");
                expect(postgresProvider.ResolveSQL(sql)).toBe('"Name" = \'Active\' AND "IsAdmin" = true');
            });
        });
    });

    // =========================================================================
    // ResolvePlatformSQLInParams — protected, tested via ResolveSQL behavior
    // on params. We create params, call ResolveSQL on each field and verify
    // the expected outcome, mirroring what ResolvePlatformSQLInParams does.
    // =========================================================================
    describe('Platform-specific SQL handling in params (mirrors ResolvePlatformSQLInParams)', () => {
        it('should resolve PlatformSQL ExtraFilter for sqlserver', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: {
                    default: "Status = 'Active'",
                    sqlserver: "[Status] = 'Active'",
                    postgresql: '"Status" = \'Active\''
                }
            };
            // Simulate what ResolvePlatformSQLInParams does
            if (IsPlatformSQL(params.ExtraFilter)) {
                params.ExtraFilter = sqlServerProvider.ResolveSQL(params.ExtraFilter);
            }
            expect(params.ExtraFilter).toBe("[Status] = 'Active'");
        });

        it('should resolve PlatformSQL ExtraFilter for postgresql', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: {
                    default: "Status = 'Active'",
                    sqlserver: "[Status] = 'Active'",
                    postgresql: '"Status" = \'Active\''
                }
            };
            if (IsPlatformSQL(params.ExtraFilter)) {
                params.ExtraFilter = postgresProvider.ResolveSQL(params.ExtraFilter);
            }
            expect(params.ExtraFilter).toBe('"Status" = \'Active\'');
        });

        it('should resolve PlatformSQL OrderBy for sqlserver', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                OrderBy: {
                    default: 'Name ASC',
                    sqlserver: '[Name] ASC',
                    postgresql: '"Name" ASC NULLS LAST'
                }
            };
            if (IsPlatformSQL(params.OrderBy)) {
                params.OrderBy = sqlServerProvider.ResolveSQL(params.OrderBy);
            }
            expect(params.OrderBy).toBe('[Name] ASC');
        });

        it('should resolve PlatformSQL OrderBy for postgresql', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                OrderBy: {
                    default: 'Name ASC',
                    sqlserver: '[Name] ASC',
                    postgresql: '"Name" ASC NULLS LAST'
                }
            };
            if (IsPlatformSQL(params.OrderBy)) {
                params.OrderBy = postgresProvider.ResolveSQL(params.OrderBy);
            }
            expect(params.OrderBy).toBe('"Name" ASC NULLS LAST');
        });

        it('should leave string ExtraFilter unchanged', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: "Status = 'Active'"
            };
            if (IsPlatformSQL(params.ExtraFilter)) {
                params.ExtraFilter = sqlServerProvider.ResolveSQL(params.ExtraFilter);
            }
            // Should remain unchanged since it's a string, not PlatformSQL
            expect(params.ExtraFilter).toBe("Status = 'Active'");
        });

        it('should leave string OrderBy unchanged', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                OrderBy: 'Name ASC'
            };
            if (IsPlatformSQL(params.OrderBy)) {
                params.OrderBy = sqlServerProvider.ResolveSQL(params.OrderBy);
            }
            expect(params.OrderBy).toBe('Name ASC');
        });

        it('should handle mixed PlatformSQL ExtraFilter and string OrderBy', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: {
                    default: 'A=1',
                    sqlserver: '[A]=1'
                },
                OrderBy: 'Name ASC'
            };
            if (IsPlatformSQL(params.ExtraFilter)) {
                params.ExtraFilter = sqlServerProvider.ResolveSQL(params.ExtraFilter);
            }
            if (IsPlatformSQL(params.OrderBy)) {
                params.OrderBy = sqlServerProvider.ResolveSQL(params.OrderBy);
            }
            expect(params.ExtraFilter).toBe('[A]=1');
            expect(params.OrderBy).toBe('Name ASC');
        });

        it('should handle mixed string ExtraFilter and PlatformSQL OrderBy', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: 'A=1',
                OrderBy: {
                    default: 'Name ASC',
                    postgresql: '"Name" ASC NULLS LAST'
                }
            };
            if (IsPlatformSQL(params.ExtraFilter)) {
                params.ExtraFilter = postgresProvider.ResolveSQL(params.ExtraFilter);
            }
            if (IsPlatformSQL(params.OrderBy)) {
                params.OrderBy = postgresProvider.ResolveSQL(params.OrderBy);
            }
            expect(params.ExtraFilter).toBe('A=1');
            expect(params.OrderBy).toBe('"Name" ASC NULLS LAST');
        });

        it('should fall back to default when platform variant missing in params', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: {
                    default: 'FALLBACK FILTER'
                }
            };
            if (IsPlatformSQL(params.ExtraFilter)) {
                params.ExtraFilter = sqlServerProvider.ResolveSQL(params.ExtraFilter);
            }
            expect(params.ExtraFilter).toBe('FALLBACK FILTER');
        });
    });

    // =========================================================================
    // Cross-platform query equivalence
    // =========================================================================
    describe('cross-platform query equivalence', () => {
        it('should resolve the same PlatformSQL differently per provider', () => {
            const sql: PlatformSQL = {
                default: 'IsActive = 1',
                sqlserver: '[IsActive] = 1',
                postgresql: '"IsActive" = true'
            };
            const ssResult = sqlServerProvider.ResolveSQL(sql);
            const pgResult = postgresProvider.ResolveSQL(sql);
            expect(ssResult).not.toBe(pgResult);
            expect(ssResult).toBe('[IsActive] = 1');
            expect(pgResult).toBe('"IsActive" = true');
        });

        it('should resolve identically when only default is provided', () => {
            const sql: PlatformSQL = { default: 'SharedSQL' };
            expect(sqlServerProvider.ResolveSQL(sql)).toBe(postgresProvider.ResolveSQL(sql));
        });

        it('should resolve identically for plain strings on both providers', () => {
            const plainSQL = "Status = 'Active'";
            expect(sqlServerProvider.ResolveSQL(plainSQL)).toBe(postgresProvider.ResolveSQL(plainSQL));
        });

        it('should resolve TOP/LIMIT patterns correctly', () => {
            const sql: PlatformSQL = {
                default: 'SELECT TOP 10 * FROM Users',
                sqlserver: 'SELECT TOP 10 * FROM [Users]',
                postgresql: 'SELECT * FROM "Users" LIMIT 10'
            };
            expect(sqlServerProvider.ResolveSQL(sql)).toContain('TOP 10');
            expect(postgresProvider.ResolveSQL(sql)).toContain('LIMIT 10');
        });

        it('should resolve boolean patterns correctly', () => {
            const sql: PlatformSQL = {
                default: 'IsActive = 1',
                sqlserver: '[IsActive] = 1',
                postgresql: '"IsActive" = true'
            };
            expect(sqlServerProvider.ResolveSQL(sql)).toContain('= 1');
            expect(postgresProvider.ResolveSQL(sql)).toContain('= true');
        });
    });

    // =========================================================================
    // Error handling for unsupported / edge-case platforms
    // =========================================================================
    describe('error handling and edge cases', () => {
        it('should use default when platform variant key does not exist', () => {
            const sql: PlatformSQL = {
                default: 'FALLBACK'
            };
            // Neither sqlserver nor postgresql key exists
            expect(sqlServerProvider.ResolveSQL(sql)).toBe('FALLBACK');
            expect(postgresProvider.ResolveSQL(sql)).toBe('FALLBACK');
        });

        it('should handle null and undefined inputs gracefully', () => {
            expect(sqlServerProvider.ResolveSQL(null)).toBe('');
            expect(sqlServerProvider.ResolveSQL(undefined)).toBe('');
            expect(postgresProvider.ResolveSQL(null)).toBe('');
            expect(postgresProvider.ResolveSQL(undefined)).toBe('');
        });

        it('should handle params with undefined ExtraFilter and OrderBy', () => {
            const params: RunViewParams = {
                EntityName: 'Users'
            };
            // Neither ExtraFilter nor OrderBy are set — should not fail
            expect(IsPlatformSQL(params.ExtraFilter)).toBe(false);
            expect(IsPlatformSQL(params.OrderBy)).toBe(false);
        });

        it('should handle params where ExtraFilter is null', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: undefined,
                OrderBy: undefined
            };
            // ResolveSQL on undefined should return empty string
            expect(sqlServerProvider.ResolveSQL(params.ExtraFilter)).toBe('');
            expect(sqlServerProvider.ResolveSQL(params.OrderBy)).toBe('');
        });

        it('should preserve other params when resolving PlatformSQL fields', () => {
            const params: RunViewParams = {
                EntityName: 'Users',
                ExtraFilter: { default: 'A=1', sqlserver: '[A]=1' },
                OrderBy: { default: 'Name', postgresql: '"Name"' },
                MaxRows: 50,
                StartRow: 10,
                ResultType: 'simple',
                Fields: ['ID', 'Name'],
                CacheLocal: true
            };

            // Resolve for sqlserver
            if (IsPlatformSQL(params.ExtraFilter)) {
                params.ExtraFilter = sqlServerProvider.ResolveSQL(params.ExtraFilter);
            }
            if (IsPlatformSQL(params.OrderBy)) {
                params.OrderBy = sqlServerProvider.ResolveSQL(params.OrderBy);
            }

            // ExtraFilter used sqlserver variant
            expect(params.ExtraFilter).toBe('[A]=1');
            // OrderBy fell back to default (no sqlserver variant)
            expect(params.OrderBy).toBe('Name');
            // Other fields preserved
            expect(params.EntityName).toBe('Users');
            expect(params.MaxRows).toBe(50);
            expect(params.StartRow).toBe(10);
            expect(params.ResultType).toBe('simple');
            expect(params.Fields).toEqual(['ID', 'Name']);
            expect(params.CacheLocal).toBe(true);
        });
    });
});
