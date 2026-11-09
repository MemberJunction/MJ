import { ProviderBase } from '../../generic/providerBase';
import { LocalCacheManager } from '../../generic/localCacheManager';
import { GetGlobalObjectStore } from '@memberjunction/global';
import {
    RunViewResult,
    ProviderType,
    EntityRecordNameInput,
    EntityRecordNameResult,
    PotentialDuplicateResponse,
    DatasetResultType,
    DatasetStatusResultType,
    ILocalStorageProvider,
    IMetadataProvider,
    RunViewWithCacheCheckParams,
    RunViewsWithCacheCheckResponse,
} from '../../generic/interfaces';
import { RunQueryResult } from '../../generic/runQuery';
import { QueryExecutionSpec } from '../../generic/queryExecutionSpec';
import { CompositeKey } from '../../generic/compositeKey';
import { UserInfo, RecordDependency } from '../../generic/securityInfo';
import { EntityInfo, RecordMergeRequest, RecordMergeResult } from '../../generic/entityInfo';
import { TransactionGroupBase } from '../../generic/transactionGroup';
import { RunViewParams } from '../../views/runView';

/** What a {@link ClientSmartCacheTestProvider} serves. */
export interface ClientSmartCacheTestOptions {
    /** The only entity the provider knows. It must allow caching for the cache to store results. */
    Entity: EntityInfo;
    /** The stand-in server's rows, read on every request so a test can change them between calls. */
    ServerRows: () => Record<string, unknown>[];
}

/**
 * A browser-mode provider (`TrustLocalCacheCompletely` false) whose `RunViewsWithCacheCheck` is a
 * stand-in server: it answers 'current' whenever the browser sends a cache status (it found a
 * cached copy for that exact request) and otherwise 'stale', with the server rows projected to the
 * request's Fields. Because it never compares timestamps, a test sees only what the browser itself
 * does with its cache.
 */
export class ClientSmartCacheTestProvider extends ProviderBase {
    public receivedChecks: RunViewWithCacheCheckParams[][] = [];

    constructor(private readonly options: ClientSmartCacheTestOptions) {
        super();
    }

    public async RunViewsWithCacheCheck<T>(checkParams: RunViewWithCacheCheckParams[]): Promise<RunViewsWithCacheCheckResponse<T>> {
        this.receivedChecks.push(checkParams);
        return {
            success: true,
            results: checkParams.map((cp, i) => {
                if (cp.cacheStatus) {
                    return { viewIndex: i, status: 'current' as const };
                }
                const rows = this.options.ServerRows().map(row => this.project(row, cp.params));
                return {
                    viewIndex: i,
                    status: 'stale' as const,
                    results: rows as T[],
                    maxUpdatedAt: LocalCacheManager.MaxUpdatedAtOfRows(this.options.ServerRows()) ?? '',
                    rowCount: rows.length,
                };
            }),
        };
    }

    private project(row: Record<string, unknown>, p: RunViewParams): Record<string, unknown> {
        if (!p.Fields || p.Fields.length === 0) {
            return { ...row };
        }
        const requested = new Set(p.Fields.map(f => f.trim().toLowerCase()));
        const projected: Record<string, unknown> = {};
        for (const key of Object.keys(row)) {
            if (requested.has(key.toLowerCase())) {
                projected[key] = row[key];
            }
        }
        return projected;
    }

    public lastCheck(): RunViewWithCacheCheckParams[] {
        return this.receivedChecks[this.receivedChecks.length - 1];
    }

    // --- Hooks the production code calls ---
    public override EntityByName(name: string): EntityInfo | undefined {
        return name === this.options.Entity.Name ? this.options.Entity : undefined;
    }
    protected override get TrustLocalCacheCompletely(): boolean { return false; }

    // --- Required abstract implementations (unused by the smart-cache flow) ---
    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Network'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> {
        throw new Error('InternalRunView should not be called in the smart-cache flow');
    }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> {
        throw new Error('InternalRunViews should not be called in the smart-cache flow');
    }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _contextUser?: UserInfo): Promise<RunQueryResult> {
        throw new Error('Not supported');
    }
    protected async GetCurrentUser(): Promise<UserInfo> { return new UserInfo(null as unknown as IMetadataProvider, {}); }
    public async GetRecordDependencies(): Promise<RecordDependency[]> { return []; }
    public async GetRecordDuplicates(): Promise<PotentialDuplicateResponse> {
        return { EntityName: '', PrimaryKey: new CompositeKey(), DuplicateRunDetailMatchRecords: [] };
    }
    public async MergeRecords(): Promise<RecordMergeResult> {
        return { Success: false, OverallStatus: 'Error', RecordMergeLogID: '', RecordStatus: [], Request: {} as RecordMergeRequest, KeyValueOfSurvivingRecord: new CompositeKey() };
    }
    public async GetDatasetByName(): Promise<DatasetResultType> {
        return { Success: false, Status: 'Error', Results: [], LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public async GetDatasetStatusByName(): Promise<DatasetStatusResultType> {
        return { Success: false, Status: 'Error', LatestUpdateDate: new Date(), EntityUpdateDates: [] };
    }
    public get InstanceConnectionString(): string { return 'client-fields-fingerprint-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider {
        return {
            GetItem: async () => null,
            SetItem: async () => {},
            Remove: async () => {},
        } as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

/** Drops the LocalCacheManager singleton so the next test initializes a fresh one. */
export function ResetLocalCacheManager(): void {
    const g = GetGlobalObjectStore();
    if (g) {
        delete g['___SINGLETON__LocalCacheManager'];
    }
}

/** Waits for the provider's fire-and-forget cache writes to settle. */
export async function Settle(ms = 25): Promise<void> {
    await new Promise(r => setTimeout(r, ms));
}
