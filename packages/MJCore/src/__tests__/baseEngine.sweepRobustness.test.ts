/**
 * Three ways the engine/database sweep misbehaved, all found in review (plan §16.3 #6, #10, #20).
 *
 * The existing sweep tests drive the happy path: rows differ, the config reloads. None of them has
 * a row with a null `__mj_UpdatedAt`, an entity without that column, a peer holding the slot lock,
 * or an observer watching the order of emissions — which is exactly the set of things that went
 * wrong.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { BaseEngine, BaseEnginePropertyConfig } from '../generic/baseEngine';
import { LocalCacheManager } from '../generic/localCacheManager';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import type { EntityInfo } from '../generic/entityInfo';
import type { UserInfo } from '../generic/securityInfo';
import type { RunViewDatabaseStatus } from '../generic/interfaces';

const ENTITY = 'MJ: AI Models';

/** Rows the engine "holds", one of which may carry no timestamp. */
const STAMPED = [
    { ID: '1', __mj_UpdatedAt: '2026-09-01T00:00:00.000Z' },
    { ID: '2', __mj_UpdatedAt: '2026-09-02T00:00:00.000Z' },
];
const WITH_A_NULL_STAMP = [
    { ID: '1', __mj_UpdatedAt: '2026-09-01T00:00:00.000Z' },
    { ID: '2', __mj_UpdatedAt: null },
];

function entityInfo(hasUpdatedAt: boolean): EntityInfo {
    return {
        Name: ENTITY,
        SchemaName: '__mj',
        BaseView: 'vwAIModels',
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: hasUpdatedAt ? [{ Name: '__mj_UpdatedAt', IsUpdatedAtField: true }] : [{ Name: 'ID', IsUpdatedAtField: false }],
    } as unknown as EntityInfo;
}

/** An engine holding one entity config, with the sweep's collaborators stubbed. */
class SweepEngine extends BaseEngine<SweepEngine> {
    public Status: RunViewDatabaseStatus = { Success: true, RowCount: 2, MaxUpdatedAt: '2026-09-02T00:00:00.000Z' };
    public HasUpdatedAtColumn = true;
    public Reloads = 0;
    public readonly EmitOrder: string[] = [];
    public RebuildCount = 0;

    public constructor(rows: Array<Record<string, unknown>>) {
        super();
        this.installConfig(rows);
    }

    private installConfig(rows: Array<Record<string, unknown>>): void {
        const config: BaseEnginePropertyConfig = { Type: 'entity', EntityName: ENTITY, PropertyName: '_models' };
        const self = this as unknown as {
            _metadataConfigs: BaseEnginePropertyConfig[];
            _dataMap: Map<string, unknown>;
            _loaded: boolean;
        };
        self._metadataConfigs = [config];
        self._dataMap = new Map([['_models', { entityName: ENTITY, data: rows, loadedSuccessfully: true }]]);
        self._loaded = true;
    }

    public override get Loaded(): boolean { return true; }

    protected override get ProviderToUse() {
        return { EntityByName: () => entityInfo(this.HasUpdatedAtColumn) } as never;
    }

    protected override get RunViewProviderToUse() {
        return {
            EntityByName: () => entityInfo(this.HasUpdatedAtColumn),
            GetRunViewsDatabaseStatus: async () => [this.Status],
            RunView: async () => ({ Success: true, Results: STAMPED, RowCount: STAMPED.length, TotalRowCount: STAMPED.length, ErrorMessage: '', ExecutionTime: 0, UserViewRunID: '' }),
        } as never;
    }

    /**
     * Deliberately NOT overriding LoadSingleConfig: the emission under test happens inside the
     * real LoadSingleEntityConfig, so a stub there would make the ordering test vacuous. The
     * RunView provider below returns rows instead.
     */
    protected override HandleSingleViewResult(): void {
        this.Reloads++;
    }

    protected override async RebuildDerivedState(): Promise<void> {
        this.RebuildCount++;
        this.EmitOrder.push('rebuild');
    }

    protected override emitPropertyChange(propertyName: string): void {
        this.EmitOrder.push(`emit:${propertyName}`);
    }

    protected override async Config(): Promise<void> { /* pre-loaded */ }
}

describe('the sweep compares the way the database does', () => {
    beforeEach(() => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
    });

    it('does not call a config stale forever because one held row has no timestamp', async () => {
        const engine = new SweepEngine(WITH_A_NULL_STAMP);
        // SQL MAX ignores NULLs, so the database reports the other row's stamp.
        engine.Status = { Success: true, RowCount: 2, MaxUpdatedAt: '2026-09-01T00:00:00.000Z' };

        const first = await engine.SweepAgainstDatabase();
        const second = await engine.SweepAgainstDatabase();

        expect(first.Reloaded).toEqual([]);
        expect(second.Reloaded).toEqual([]);
        expect(engine.Reloads).toBe(0);
    });

    it('compares by row count alone for an entity with no timestamp column', async () => {
        const engine = new SweepEngine(STAMPED);
        engine.HasUpdatedAtColumn = false;
        engine.Status = { Success: true, RowCount: 2, MaxUpdatedAt: undefined };

        expect((await engine.SweepAgainstDatabase()).Reloaded).toEqual([]);

        engine.Status = { Success: true, RowCount: 3, MaxUpdatedAt: undefined };
        expect((await engine.SweepAgainstDatabase()).Reloaded).toEqual(['_models']);
    });

    it('still reloads when the database really is ahead', async () => {
        const engine = new SweepEngine(STAMPED);
        engine.Status = { Success: true, RowCount: 2, MaxUpdatedAt: '2026-09-09T00:00:00.000Z' };

        expect((await engine.SweepAgainstDatabase()).Reloaded).toEqual(['_models']);
        expect(engine.Reloads).toBe(1);
    });

    it('reloads when one side has a stamp and the other does not', async () => {
        const engine = new SweepEngine(STAMPED);
        engine.Status = { Success: true, RowCount: 2, MaxUpdatedAt: undefined };

        expect((await engine.SweepAgainstDatabase()).Reloaded).toEqual(['_models']);
    });
});

describe('the sweep emits after the rebuild', () => {
    beforeEach(() => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
    });

    it('never lets a subscriber see the property before its derived state is rebuilt', async () => {
        const engine = new SweepEngine(STAMPED);
        engine.Status = { Success: true, RowCount: 5, MaxUpdatedAt: '2026-09-09T00:00:00.000Z' };

        await engine.SweepAgainstDatabase();

        // One emission, and it comes after the rebuild.
        expect(engine.EmitOrder).toEqual(['rebuild', 'emit:_models']);
    });
});

describe('the sweep writes the shared slot under its lock', () => {
    beforeEach(() => {
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
    });

    it('routes the refreshed rows through the cross-process lock, not a bare write', async () => {
        const manager = LocalCacheManager.Instance;
        const storage = new MockCacheStorageProvider();
        /** A peer holds this slot's lock while our write runs; the write must wait for it. */
        const order: string[] = [];
        (storage as unknown as { SharedAcrossProcesses: boolean }).SharedAcrossProcesses = true;
        (storage as unknown as { WithKeyLock: unknown }).WithKeyLock = async <T>(_key: string, _cat: string, work: () => Promise<T>): Promise<T> => {
            order.push('lock');
            const result = await work();
            order.push('unlock');
            return result;
        };
        await manager.Initialize(storage);
        const setItem = vi.spyOn(storage, 'SetItem').mockImplementation(async () => { order.push('write'); });

        await manager.ReplaceRunViewResultLocked('MJ: AI Models|||-1|0||', { EntityName: ENTITY } as never,
            [{ ID: '1' }], '2026-09-09T00:00:00.000Z', 1);

        expect(order).toEqual(['lock', 'write', 'unlock']);
        setItem.mockRestore();
    });
});
