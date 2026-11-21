/**
 * ActionEngineBase keeps lookup indexes (actions by name, categories by ID, params and result codes
 * by action) over its cached arrays. Its configs have no Filter, OrderBy or AdditionalLoading, so
 * BaseEngine applies saves and deletes to those arrays in place: an update replaces an element and
 * keeps the array's reference and length. These tests drive the REAL BaseEngine mutation paths and
 * check that every lookup sees the change right away.
 *
 * Impact without the fix: a param whose LogValue was switched to false kept being logged in
 * plaintext until restart, GetActionByName returned the old entity, and GetResultCode missed new codes.
 *
 * Only the boundaries are stubbed: cloneEntityForCache (it builds an entity through the metadata
 * provider), syncLocalCacheForConfig (the local cache), and the provider applyRemoteRecordData uses.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BaseEnginePropertyConfig, BaseEntity, BaseEntityEvent, CompositeKey, IMetadataProvider } from '@memberjunction/core';
import { ActionEngineBase } from '../ActionEngine-Base';

const ACTION_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const ACTION_B = 'aaaaaaaa-0000-4000-8000-000000000002';
const ROOT_CATEGORY = '15E03732-607E-4125-86F4-8C846EE88749';
const CATEGORY_X = 'cccccccc-0000-4000-8000-000000000001';
const CATEGORY_Y = 'cccccccc-0000-4000-8000-000000000002';

/** The fields of the cached rows these lookups read. */
interface RowFields {
    ID: string;
    Name?: string;
    ActionID?: string;
    CategoryID?: string;
    ParentID?: string | null;
    ResultCode?: string;
    LogValue?: boolean;
}

/** A structural stand-in for a cached entity row: its fields plus what BaseEngine's key matching reads. */
type FakeRow = RowFields & {
    EntityInfo: { PrimaryKeys: Array<{ Name: string; IsUniqueIdentifier: boolean }> };
    PrimaryKey: CompositeKey;
    LoadFromData(data: RowFields): Promise<boolean>;
};

function row(fields: RowFields): FakeRow {
    const r: FakeRow = {
        ...fields,
        EntityInfo: { PrimaryKeys: [{ Name: 'ID', IsUniqueIdentifier: true }] },
        get PrimaryKey() { return CompositeKey.FromKeyValuePair('ID', r.ID); },
        async LoadFromData(data: RowFields) { Object.assign(r, data); return true; },
    };
    return r;
}

/** The protected and private members of ActionEngineBase/BaseEngine these tests drive or seed. */
interface EngineInternals {
    _Actions: FakeRow[];
    _ActionCategories: FakeRow[];
    _Params: FakeRow[];
    _ActionResultCodes: FakeRow[];
    cloneEntityForCache(source: BaseEntity, config: BaseEnginePropertyConfig): Promise<BaseEntity | null>;
    syncLocalCacheForConfig(config: BaseEnginePropertyConfig, event: BaseEntityEvent): Promise<void>;
    applyImmediateMutation(config: BaseEnginePropertyConfig, event: BaseEntityEvent): Promise<void>;
    applyRemoteRecordData(configs: BaseEnginePropertyConfig[], entityName: string, recordDataJSON: string): Promise<boolean>;
    applyRemoteDelete(configs: BaseEnginePropertyConfig[], primaryKeyValuesJSON: string): boolean;
    notifyAlreadyAppliedMutation(config: BaseEnginePropertyConfig, changeType: 'add' | 'update' | 'delete', entity: BaseEntity): void;
}

function config(propertyName: string, entityName: string): BaseEnginePropertyConfig {
    return Object.assign(new BaseEnginePropertyConfig(), { PropertyName: propertyName, EntityName: entityName, CacheLocal: true });
}

const PARAMS = config('_Params', 'MJ: Action Params');
const RESULT_CODES = config('_ActionResultCodes', 'MJ: Action Result Codes');
const ACTIONS = config('_Actions', 'MJ: Actions');
const CATEGORIES = config('_ActionCategories', 'MJ: Action Categories');

const engine = ActionEngineBase.Instance;
const internals = engine as unknown as EngineInternals;

function save(saveSubType: 'create' | 'update', fields: RowFields): BaseEntityEvent {
    return { type: 'save', saveSubType, baseEntity: row(fields) as unknown as BaseEntity, payload: null } as BaseEntityEvent;
}

function remove(fields: RowFields): BaseEntityEvent {
    return { type: 'delete', baseEntity: row(fields) as unknown as BaseEntity, payload: { OldValues: { ID: fields.ID } } } as BaseEntityEvent;
}

/** Calls every lookup so each index is built before the mutation under test. */
function primeIndexes(): void {
    engine.GetParamsByActionID(ACTION_A);
    engine.GetResultCode(ACTION_A, 'SUCCESS');
    engine.GetActionByName('Send Email');
    engine.IsChildCategoryOf(CATEGORY_X, ROOT_CATEGORY);
}

beforeEach(() => {
    internals._Actions = [row({ ID: ACTION_A, Name: 'Send Email', CategoryID: CATEGORY_X }), row({ ID: ACTION_B, Name: 'Get Weather', CategoryID: CATEGORY_Y })];
    internals._ActionCategories = [row({ ID: CATEGORY_X, ParentID: ROOT_CATEGORY }), row({ ID: CATEGORY_Y, ParentID: null })];
    internals._Params = [row({ ID: 'p1', ActionID: ACTION_A, Name: 'To', LogValue: true }), row({ ID: 'p2', ActionID: ACTION_A, Name: 'Body', LogValue: true })];
    internals._ActionResultCodes = [row({ ID: 'r1', ActionID: ACTION_A, ResultCode: 'SUCCESS' })];
    internals.cloneEntityForCache = async (source) => row({ ...(source as unknown as RowFields) }) as unknown as BaseEntity;
    internals.syncLocalCacheForConfig = async () => {};
    primeIndexes();
});

describe('ActionEngineBase lookup indexes — fresh after in-place BaseEngine mutations (applyImmediateMutation)', () => {
    it('param update: a LogValue switched to false is visible at once', async () => {
        await internals.applyImmediateMutation(PARAMS, save('update', { ID: 'p2', ActionID: ACTION_A, Name: 'Body', LogValue: false }));
        const body = engine.GetParamsByActionID(ACTION_A).find(p => p.Name === 'Body');
        expect(body?.LogValue).toBe(false);
    });

    it('param create: a new LogValue=false param is returned', async () => {
        await internals.applyImmediateMutation(PARAMS, save('create', { ID: 'p3', ActionID: ACTION_A, Name: 'ApiKey', LogValue: false }));
        expect(engine.GetParamsByActionID(ACTION_A).map(p => p.Name)).toEqual(['To', 'Body', 'ApiKey']);
    });

    it('param delete: the removed param is gone', async () => {
        await internals.applyImmediateMutation(PARAMS, remove({ ID: 'p1' }));
        expect(engine.GetParamsByActionID(ACTION_A).map(p => p.Name)).toEqual(['Body']);
    });

    it('result code create: GetResultCode finds the new code', async () => {
        await internals.applyImmediateMutation(RESULT_CODES, save('create', { ID: 'r2', ActionID: ACTION_A, ResultCode: 'RATE_LIMITED' }));
        expect(engine.GetResultCode(ACTION_A, 'RATE_LIMITED')?.ID).toBe('r2');
    });

    it('result code update: a code moved to another action is found there and not under the old one', async () => {
        await internals.applyImmediateMutation(RESULT_CODES, save('update', { ID: 'r1', ActionID: ACTION_B, ResultCode: 'SUCCESS' }));
        expect(engine.GetResultCode(ACTION_B, 'SUCCESS')?.ID).toBe('r1');
        expect(engine.GetResultCode(ACTION_A, 'SUCCESS')).toBeUndefined();
    });

    it('result code delete: the removed code is gone', async () => {
        await internals.applyImmediateMutation(RESULT_CODES, remove({ ID: 'r1' }));
        expect(engine.GetResultCode(ACTION_A, 'SUCCESS')).toBeUndefined();
    });

    it('action update: a renamed action resolves by its new name and not its old one', async () => {
        await internals.applyImmediateMutation(ACTIONS, save('update', { ID: ACTION_A, Name: 'Send Message', CategoryID: CATEGORY_X }));
        expect(engine.GetActionByName('Send Message')?.ID).toBe(ACTION_A);
        expect(engine.GetActionByName('Send Email')).toBeUndefined();
    });

    it('action create and delete: the index follows both', async () => {
        await internals.applyImmediateMutation(ACTIONS, save('create', { ID: 'aaaaaaaa-0000-4000-8000-000000000003', Name: 'Translate', CategoryID: CATEGORY_Y }));
        expect(engine.GetActionByName('Translate')).toBeDefined();
        await internals.applyImmediateMutation(ACTIONS, remove({ ID: ACTION_B }));
        expect(engine.GetActionByName('Get Weather')).toBeUndefined();
    });

    it('category update: a re-parented category is no longer a core category', async () => {
        await internals.applyImmediateMutation(CATEGORIES, save('update', { ID: CATEGORY_X, ParentID: null }));
        expect(engine.IsChildCategoryOf(CATEGORY_X, ROOT_CATEGORY)).toBe(false);
    });

    it('category create and delete: the index follows both', async () => {
        const created = 'cccccccc-0000-4000-8000-000000000003';
        await internals.applyImmediateMutation(CATEGORIES, save('create', { ID: created, ParentID: ROOT_CATEGORY }));
        expect(engine.IsChildCategoryOf(created, ROOT_CATEGORY)).toBe(true);
        await internals.applyImmediateMutation(CATEGORIES, remove({ ID: CATEGORY_X }));
        expect(engine.IsChildCategoryOf(CATEGORY_X, ROOT_CATEGORY)).toBe(false);
    });
});

describe('ActionEngineBase lookup indexes — fresh after remote and already-applied mutations', () => {
    it('remote delete (applyRemoteDelete): the removed param is gone', () => {
        internals.applyRemoteDelete([PARAMS], JSON.stringify([{ FieldName: 'ID', Value: 'p1' }]));
        expect(engine.GetParamsByActionID(ACTION_A).map(p => p.Name)).toEqual(['Body']);
    });

    it('remote save (applyRemoteRecordData): a LogValue switched to false is visible at once', async () => {
        const provider = { GetEntityObject: async () => row({ ID: '' }) } as unknown as IMetadataProvider;
        Object.defineProperty(engine, 'ProviderToUse', { configurable: true, get: () => provider });
        try {
            const applied = await internals.applyRemoteRecordData([PARAMS], PARAMS.EntityName,
                JSON.stringify({ ID: 'p1', ActionID: ACTION_A, Name: 'To', LogValue: false }));
            expect(applied).toBe(true);
            expect(engine.GetParamsByActionID(ACTION_A).find(p => p.Name === 'To')?.LogValue).toBe(false);
        } finally {
            delete (engine as unknown as Record<string, unknown>).ProviderToUse;
        }
    });

    it('already-applied save (notifyAlreadyAppliedMutation): a param moved to another action in place is indexed there', () => {
        const param = internals._Params[0];
        param.ActionID = ACTION_B;
        internals.notifyAlreadyAppliedMutation(PARAMS, 'update', param as unknown as BaseEntity);
        expect(engine.GetParamsByActionID(ACTION_B).map(p => p.Name)).toEqual(['To']);
        expect(engine.GetParamsByActionID(ACTION_A).map(p => p.Name)).toEqual(['Body']);
    });

    it('DataChange$ subscribers already see the fresh index', async () => {
        let seen: boolean | undefined;
        const sub = engine.DataChange$.subscribe(() => {
            seen = engine.GetParamsByActionID(ACTION_A).find(p => p.Name === 'Body')?.LogValue;
        });
        try {
            await internals.applyImmediateMutation(PARAMS, save('update', { ID: 'p2', ActionID: ACTION_A, Name: 'Body', LogValue: false }));
        } finally {
            sub.unsubscribe();
        }
        expect(seen).toBe(false);
    });
});
