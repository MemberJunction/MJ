import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import { BaseEntity, BaseEntityEvent } from '../generic/baseEntity';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { EntityInfo, EntityPermissionInfo } from '../generic/entityInfo';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { CacheRowDeltaPayload, CacheRowValue } from '../generic/localCacheManager';
import { ProviderBase } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import { TransformSimpleObjectToEntityObject } from '../generic/util';
import { RunViewParams } from '../views/runView';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

class Wave41aTestProvider extends TestMetadataProvider {
    public internalRunViewsCalls: RunViewParams[][] = [];
    public trustServerCache = false;

    protected override get TrustLocalCacheCompletely(): boolean {
        return this.trustServerCache;
    }

    protected override async InternalRunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
        this.internalRunViewsCalls.push(params.map(p => ({ ...p })));
        return params.map(p => ({
            Success: true,
            Results: [{ ID: 'row-1', Name: p.EntityName ?? '' }] as T[],
            RowCount: 1,
            TotalRowCount: 1,
            ExecutionTime: 1,
            ErrorMessage: '',
            UserViewRunID: '',
        }));
    }

    public checkServerCacheAllowed(params: RunViewParams): boolean {
        return this.IsServerCacheAllowedForEntity(params);
    }

    public checkShouldWiden(params: RunViewParams): boolean {
        return this.shouldWidenAndPopulateCache(params);
    }
}

class Wave41aTestEngine extends BaseEngine<Wave41aTestEngine> {
    public Items: BaseEntity[] = [];

    public static get Instance(): Wave41aTestEngine {
        return super.getInstance<Wave41aTestEngine>();
    }

    public async ApplySaveMutation(config: BaseEnginePropertyConfig, event: BaseEntityEvent): Promise<void> {
        await this.applyImmediateMutation(config, event);
    }

    public override async cloneEntityForCache(
        source: BaseEntity,
        config: BaseEnginePropertyConfig
    ): Promise<BaseEntity | null> {
        return super.cloneEntityForCache(source, config);
    }

    public FindIndexByPrimaryKeys(dataArray: BaseEntity[], target: BaseEntity): number {
        return this.findEntityIndexByPrimaryKeys(dataArray, target);
    }

    public SeedLoadedRows(propertyName: string, entityName: string, rows: BaseEntity[]): void {
        this.Items = rows;
        this._dataMap.set(propertyName, {
            entityName,
            data: rows,
            loadedSuccessfully: true,
        });
    }

    public async ApplyRowDelta(
        config: BaseEnginePropertyConfig,
        delta: CacheRowDeltaPayload
    ): Promise<void> {
        await this.OnExternalCacheChange(config, {
            Category: 'RunViewEngine',
            Key: 'fp-items',
            Action: 'row_delta',
            Timestamp: Date.now(),
            SourceServerId: 'remote-node-2',
            Data: JSON.stringify(delta),
        });
    }
}

const TEST_ENTITY = 'Test Entity 1';
const ROLE_A = '11111111-1111-4111-8111-111111111111';
const ROLE_B = '22222222-2222-4222-8222-222222222222';
const USER_1 = '33333333-3333-4333-8333-333333333333';

describe('Wave 4.1a — Core & Engine Parking Brakes', () => {
    let provider: Wave41aTestProvider;
    const savedCoalesceWindow = ProviderBase.CoalesceWindowMs;
    const savedCoalesceMicrotask = ProviderBase.CoalesceUseMicrotask;
    const savedLinger = ProviderBase.DedupLingerMs;

    beforeEach(async () => {
        provider = new Wave41aTestProvider();
        provider.setMockDelay(0);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        provider.internalRunViewsCalls = [];
        ProviderBase.DedupLingerMs = 0;
    });

    afterEach(() => {
        ProviderBase.CoalesceWindowMs = savedCoalesceWindow;
        ProviderBase.CoalesceUseMicrotask = savedCoalesceMicrotask;
        ProviderBase.DedupLingerMs = savedLinger;
    });

    describe('Adaptive Microtask-Drain Coalescer', () => {
        it('flushes an isolated RunViews call via microtask without sleeping for CoalesceWindowMs', async () => {
            ProviderBase.CoalesceWindowMs = 500;
            ProviderBase.CoalesceUseMicrotask = true;

            const start = performance.now();
            const results = await provider.RunViews([
                { EntityName: TEST_ENTITY, ExtraFilter: "Name='Solo'", ResultType: 'simple' },
            ]);
            const elapsedMs = performance.now() - start;

            expect(results).toHaveLength(1);
            expect(results[0].Success).toBe(true);
            expect(provider.internalRunViewsCalls).toHaveLength(1);
            expect(elapsedMs).toBeLessThan(100);
        });

        it('coalesces callers arriving across adjacent microtask hops into a single mega-batch', async () => {
            ProviderBase.CoalesceWindowMs = 200;
            ProviderBase.CoalesceUseMicrotask = true;

            const callImmediate = provider.RunViews([
                { EntityName: TEST_ENTITY, ExtraFilter: 'Hop=0', ResultType: 'simple' },
            ]);
            const callHop1 = Promise.resolve().then(() =>
                provider.RunViews([
                    { EntityName: TEST_ENTITY, ExtraFilter: 'Hop=1', ResultType: 'simple' },
                ])
            );
            const callHop2 = Promise.resolve()
                .then(() => Promise.resolve())
                .then(() =>
                    provider.RunViews([
                        { EntityName: TEST_ENTITY, ExtraFilter: 'Hop=2', ResultType: 'simple' },
                    ])
                );

            const [r0, r1, r2] = await Promise.all([callImmediate, callHop1, callHop2]);

            expect(r0[0].Success).toBe(true);
            expect(r1[0].Success).toBe(true);
            expect(r2[0].Success).toBe(true);
            expect(provider.internalRunViewsCalls).toHaveLength(1);
            expect(provider.internalRunViewsCalls[0]).toHaveLength(3);
        });
    });

    describe('Server Narrow-Fields Widening Guards', () => {
        it('disables server caching and widening for ExternalDataSourceID entities and UserSearchString queries', () => {
            provider.trustServerCache = true;
            const entity = provider.EntityByName(TEST_ENTITY);
            expect(entity).toBeDefined();

            const savedAllowCaching = entity.AllowCaching;
            const savedTrustServer = entity.TrustServerCacheCompletely;
            const savedExternalDs = entity.ExternalDataSourceID;
            try {
                entity.AllowCaching = true;
                entity.TrustServerCacheCompletely = true;
                entity.ExternalDataSourceID = null;

                // Baseline: normal server narrow-Fields query widens for superset caching
                expect(
                    provider.checkShouldWiden({
                        EntityName: TEST_ENTITY,
                        Fields: ['ID', 'Name'],
                        ResultType: 'simple',
                    })
                ).toBe(true);

                // Ad-hoc UserSearchString narrow query preserves narrow SQL projection (no widening)
                expect(
                    provider.checkShouldWiden({
                        EntityName: TEST_ENTITY,
                        Fields: ['ID', 'Name'],
                        UserSearchString: 'acme',
                        ResultType: 'simple',
                    })
                ).toBe(false);

                // ExternalDataSourceID entity is excluded from server cache + widening
                entity.ExternalDataSourceID = '44444444-4444-4444-8444-444444444444';
                expect(provider.checkServerCacheAllowed({ EntityName: TEST_ENTITY })).toBe(false);
                expect(
                    provider.checkShouldWiden({
                        EntityName: TEST_ENTITY,
                        Fields: ['ID', 'Name'],
                        ResultType: 'simple',
                    })
                ).toBe(false);
            } finally {
                entity.AllowCaching = savedAllowCaching;
                entity.TrustServerCacheCompletely = savedTrustServer;
                entity.ExternalDataSourceID = savedExternalDs;
            }
        });
    });

    describe('GetEntityObject({ skipNewRecord: true }) & lazy _raw hydration', () => {
        it('skips NewRecord() event broadcast and preserves BaseEntity lazy _raw storage across hydration', async () => {
            const newRecordEvents: BaseEntityEvent[] = [];
            const sub = MJGlobal.Instance.GetEventListener(false).subscribe(evt => {
                if (evt.event === MJEventType.ComponentEvent && evt.eventCode === 'BaseEntityEvent') {
                    const entityEvt = evt.args as BaseEntityEvent;
                    if (entityEvt?.type === 'new_record') {
                        newRecordEvents.push(entityEvt);
                    }
                }
            });

            try {
                const rawRow = {
                    ID: '55555555-5555-4555-8555-555555555555',
                    Name: 'Fast Raw Entity',
                };

                const single = await provider.GetEntityObject<BaseEntity>(TEST_ENTITY, { SkipNewRecord: true });
                expect(newRecordEvents).toHaveLength(0);
                await single.LoadFromData(rawRow);
                expect(single.IsSaved).toBe(true);
                expect(single.Get('ID')).toBe(rawRow.ID);
                expect(single.Get('Name')).toBe('Fast Raw Entity');

                const batch = await TransformSimpleObjectToEntityObject<BaseEntity>(
                    provider,
                    TEST_ENTITY,
                    [
                        { ID: '66666666-6666-4666-8666-666666666661', Name: 'Row 1' },
                        { ID: '66666666-6666-4666-8666-666666666662', Name: 'Row 2' },
                    ]
                );
                expect(newRecordEvents).toHaveLength(0);
                expect(batch).toHaveLength(2);
                expect(batch[0].Get('Name')).toBe('Row 1');
                expect(batch[1].Get('Name')).toBe('Row 2');
            } finally {
                sub.unsubscribe();
            }
        });
    });

    describe('EntityInfo.GetUserPermisions memoization and invalidation', () => {
        it('memoizes repeated lookups per (entity, user) and invalidates when roles, flags, or permissions change', () => {
            const entity = new EntityInfo({
                ID: '77777777-7777-4777-8777-777777777777',
                Name: 'Orders',
                SchemaName: '__mj',
                BaseTable: 'Order',
                BaseView: 'vwOrders',
                AllowCreateAPI: true,
                AllowUpdateAPI: true,
                AllowDeleteAPI: false,
                Permissions: [
                    new EntityPermissionInfo({
                        ID: 'perm-a',
                        EntityID: '77777777-7777-4777-8777-777777777777',
                        RoleID: ROLE_A,
                        Type: 'Allow',
                        CanRead: true,
                        CanCreate: true,
                        CanUpdate: true,
                        CanDelete: true,
                    }),
                ],
                Fields: [],
            });
            const user = new UserInfo(null, {
                ID: USER_1,
                Name: 'Tester',
                Email: 'tester@example.com',
                IsActive: true,
                UserRoles: [{ UserID: USER_1, RoleID: ROLE_A, Role: 'Admin' }],
            });

            const first = entity.GetUserPermisions(user);
            const second = entity.GetUserPermisions(user);
            expect(second).toBe(first);
            expect(first.CanRead).toBe(true);
            expect(first.CanCreate).toBe(true);
            expect(first.CanDelete).toBe(false);

            // Flipping AllowCreateAPI invalidates the memo
            entity.AllowCreateAPI = false;
            const afterApiToggle = entity.GetUserPermisions(user);
            expect(afterApiToggle).not.toBe(first);
            expect(afterApiToggle.CanCreate).toBe(false);

            // Adding a Deny row and user role invalidates the memo
            entity.Permissions.push(
                new EntityPermissionInfo({
                    ID: 'perm-b-deny',
                    EntityID: entity.ID,
                    RoleID: ROLE_B,
                    Type: 'Deny',
                    CanRead: false,
                    CanCreate: false,
                    CanUpdate: true,
                    CanDelete: false,
                })
            );
            user.UserRoles.push({ UserID: USER_1, RoleID: ROLE_B, Role: 'Restricted' } as UserInfo['UserRoles'][number]);
            const afterDeny = entity.GetUserPermisions(user);
            expect(afterDeny.CanUpdate).toBe(false);
            expect(afterDeny.CanRead).toBe(true);
        });
    });

    describe('BaseEngine generic BaseEntity PK lookup, in-place save fast path & O(Δ) row_delta', () => {
        it('resolves generic BaseEntity primary keys via .Get(), skips clone on in-place saves, and applies consecutive row_deltas in O(Δ)', async () => {
            const engine = new Wave41aTestEngine();
            const config = new BaseEnginePropertyConfig({
                PropertyName: 'Items',
                EntityName: TEST_ENTITY,
                AddToObject: true,
            });
            // Bind engine to our test provider via ProviderToUse setter helper
            Reflect.set(engine, '_provider', provider);

            const rowCount = 200;
            const rawRows = Array.from({ length: rowCount }, (_, idx) => ({
                ID: `00000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
                Name: `Item ${idx + 1}`,
            }));
            const entities = await TransformSimpleObjectToEntityObject<BaseEntity>(provider, TEST_ENTITY, rawRows);
            engine.SeedLoadedRows('Items', TEST_ENTITY, entities);

            // 1. Generic BaseEntity instances (no generated `get ID()` getter) resolve exact index (not row 0!)
            const target150 = await provider.GetEntityObject<BaseEntity>(TEST_ENTITY, { skipNewRecord: true });
            await target150.LoadFromData(rawRows[150]);
            expect(engine.FindIndexByPrimaryKeys(engine.Items, target150)).toBe(150);

            // 2. Saving an in-array instance in place does NOT invoke cloneEntityForCache
            const cloneSpy = vi.spyOn(engine, 'cloneEntityForCache');
            const saveEvent = new BaseEntityEvent();
            saveEvent.type = 'save';
            saveEvent.saveSubType = 'update';
            saveEvent.baseEntity = entities[42];
            await engine.ApplySaveMutation(config, saveEvent);
            expect(cloneSpy).not.toHaveBeenCalled();

            // 3. Consecutive external row_delta updates reuse DeltaRowKeyIndex without re-reading untouched rows
            const makeDelta = (rowIndex: number, updatedName: string, nextCount: number): CacheRowDeltaPayload => ({
                upsertedRows: [
                    {
                        ID: rawRows[rowIndex].ID,
                        Name: updatedName,
                    } as Record<string, CacheRowValue>,
                ],
                deletedPrimaryKeys: [],
                primaryKeyFields: ['ID'],
                rowCount: nextCount,
                totalRowCount: nextCount,
            });

            // Delta 1 builds DeltaRowKeyIndex once across the 200 rows and updates index 10
            await engine.ApplyRowDelta(config, makeDelta(10, 'Updated 11', rowCount));
            expect(engine.Items[10].Get('Name')).toBe('Updated 11');

            // Spy on untouched row #199's .Get() before Delta 2: warm O(Δ) path must NOT read untouched rows
            const untouchedSpy = vi.spyOn(engine.Items[199], 'Get');
            await engine.ApplyRowDelta(config, makeDelta(20, 'Updated 21', rowCount));
            expect(engine.Items[20].Get('Name')).toBe('Updated 21');
            expect(untouchedSpy).not.toHaveBeenCalled();
        });
    });
});
