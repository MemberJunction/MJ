/**
 * Unit coverage for the S31b view-only cache read-permission gate
 * (ProviderBase.cacheDeniedForViewOnlyRequest).
 *
 * Background: the server cache-hit path returns BEFORE the DB provider's read-permission gate.
 * The primary S31 gate keys off the entity resolved from params.EntityName, so a ViewID/ViewName-only
 * request (the Explorer-standard saved-view shape) resolved no entity there and the gate was disarmed
 * — a read-denied user could be served rows a permitted user warmed for the same ViewID. This gate
 * fails closed for view-identifier-only requests (or, when ViewEntity is supplied, resolves the entity
 * synchronously and applies the normal CanRead check).
 */
import { describe, it, expect } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
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
} from '../generic/interfaces';
import { RunQueryResult } from '../generic/runQuery';
import { QueryExecutionSpec } from '../generic/queryExecutionSpec';
import { CompositeKey } from '../generic/compositeKey';
import { UserInfo, RecordDependency } from '../generic/securityInfo';
import { EntityInfo, RecordMergeRequest, RecordMergeResult } from '../generic/entityInfo';
import { TransactionGroupBase } from '../generic/transactionGroup';
import { RunViewParams } from '../views/runView';

const READABLE_ENTITY_ID = '11111111-1111-1111-1111-111111111111';
const DENIED_ENTITY_ID = '22222222-2222-2222-2222-222222222222';

/** Minimal provider that models two entities: one readable, one read-denied, keyed by ID. */
class ViewGateTestProvider extends ProviderBase {
    /** Expose the protected gate for direct assertion. */
    public gate(params: RunViewParams, user?: UserInfo): boolean {
        return this.cacheDeniedForViewOnlyRequest(params, user);
    }

    public override EntityByID(id: string): EntityInfo | undefined {
        if (id === READABLE_ENTITY_ID) {
            return { ID: id, Name: 'Readable', GetUserPermisions: () => ({ CanRead: true }) } as unknown as EntityInfo;
        }
        if (id === DENIED_ENTITY_ID) {
            return { ID: id, Name: 'Denied', GetUserPermisions: () => ({ CanRead: false }) } as unknown as EntityInfo;
        }
        return undefined;
    }

    // --- Required abstract implementations (unused by the gate under test) ---
    override get PlatformKey() { return 'sqlserver' as const; }
    protected get AllowRefresh(): boolean { return false; }
    public get ProviderType(): ProviderType { return 'Network'; }
    public get DatabaseConnection(): object { return {}; }
    protected async InternalGetEntityRecordName(): Promise<string> { return ''; }
    protected async InternalGetEntityRecordNames(_info: EntityRecordNameInput[]): Promise<EntityRecordNameResult[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* noop */ }
    protected async InternalRunView<T>(): Promise<RunViewResult<T>> { throw new Error('not used'); }
    protected async InternalRunViews<T>(): Promise<RunViewResult<T>[]> { throw new Error('not used'); }
    protected async InternalRunQuery(): Promise<RunQueryResult> { return { Success: true, Results: [] }; }
    protected async InternalRunQueries(): Promise<RunQueryResult[]> { return []; }
    protected async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, _contextUser?: UserInfo): Promise<RunQueryResult> { throw new Error('not used'); }
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
    public get InstanceConnectionString(): string { return 'view-only-cache-gate-test'; }
    public async CreateTransactionGroup(): Promise<TransactionGroupBase> { return {} as TransactionGroupBase; }
    get LocalStorageProvider(): ILocalStorageProvider {
        return { GetItem: async () => null, SetItem: async () => {}, Remove: async () => {} } as ILocalStorageProvider;
    }
    protected get Metadata(): IMetadataProvider { return this as unknown as IMetadataProvider; }
}

/** A ViewEntity stub whose .Get('EntityID') returns the supplied entity id. */
function viewEntity(entityID: string | undefined) {
    return { Get: (field: string) => (field === 'EntityID' ? entityID : undefined) } as unknown as RunViewParams['ViewEntity'];
}

describe('ProviderBase.cacheDeniedForViewOnlyRequest (S31b view-only cache gate)', () => {
    const provider = new ViewGateTestProvider();
    const user = new UserInfo(null as unknown as IMetadataProvider, { ID: 'user-1' });

    it('does not gate an EntityName-based request (the entity-resolved S31 gate owns that path)', () => {
        expect(provider.gate({ EntityName: 'Anything', ViewID: 'v-1' } as RunViewParams, user)).toBe(false);
    });

    it('does not gate when there is no context user (null-user semantics are the DB path’s job)', () => {
        expect(provider.gate({ ViewID: 'v-1' } as RunViewParams, undefined)).toBe(false);
    });

    it('does not gate a plain entity-less/malformed request with no view identifier', () => {
        expect(provider.gate({} as RunViewParams, user)).toBe(false);
    });

    it('FAILS CLOSED for a ViewID-only request under a context user (the reported leak shape)', () => {
        expect(provider.gate({ ViewID: 'v-1' } as RunViewParams, user)).toBe(true);
    });

    it('FAILS CLOSED for a ViewName-only request under a context user', () => {
        expect(provider.gate({ ViewName: 'My Saved View' } as RunViewParams, user)).toBe(true);
    });

    it('allows caching when ViewEntity resolves to a READABLE entity for the user', () => {
        expect(provider.gate({ ViewEntity: viewEntity(READABLE_ENTITY_ID) } as RunViewParams, user)).toBe(false);
    });

    it('gates when ViewEntity resolves to a READ-DENIED entity for the user', () => {
        expect(provider.gate({ ViewEntity: viewEntity(DENIED_ENTITY_ID) } as RunViewParams, user)).toBe(true);
    });

    it('FAILS CLOSED when ViewEntity is present but its entity cannot be resolved', () => {
        expect(provider.gate({ ViewEntity: viewEntity('unknown-id') } as RunViewParams, user)).toBe(true);
    });
});
