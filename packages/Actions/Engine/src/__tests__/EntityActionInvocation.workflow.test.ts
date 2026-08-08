import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The Entity Action workflow extensions as seen from the invocation layer: the new
 * `'Entity Object Data'` param value type, the provenance object handed to `RunAction`, and the
 * scope gate that stops a narrowed binding from firing on records outside its scope.
 */

const { mockClassFactory, mockIsEntityActionInScope, mockRunAction } = vi.hoisted(() => ({
    mockClassFactory: { CreateInstance: vi.fn(), GetAllRegistrations: vi.fn().mockReturnValue([]) },
    mockIsEntityActionInScope: vi.fn(),
    mockRunAction: vi.fn()
}));

vi.mock('@memberjunction/global', async (importOriginal) => ({
    MJLruCache: (await importOriginal<typeof import('@memberjunction/global')>()).MJLruCache,
    MJGlobal: { Instance: { ClassFactory: mockClassFactory } },
    RegisterClass: () => (target: Function) => target,
    RequiresSubclass: () => (target: Function) => target,
    SafeJSONParse: vi.fn((str: string) => {
        try { return JSON.parse(str); } catch { return null; }
    }),
    UUIDsEqual: (a: unknown, b: unknown): boolean =>
        typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase(),
    NormalizeUUID: (value: unknown): string => (typeof value === 'string' ? value.toLowerCase() : String(value)),
    BaseSingleton: class BaseSingletonMock<T> {
        protected constructor() {}
        protected static getInstance<U>(this: new () => U): U { return new this(); }
    }
}));

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class {},
    Metadata: vi.fn(),
    RunView: vi.fn(),
    LogError: vi.fn(),
    UserInfo: class {},
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
    CodeNameFromString: (s: string) => s.replace(/\s/g, '_'),
    BaseEngine: class {
        static getInstance() { return new this(); }
        protected ContextUser = { ID: 'test-user' };
        protected Loaded = true;
        async Config() {}
        async Load() {}
    }
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJActionParamEntity: class {},
    MJEntityActionParamEntity: class {}
}));

vi.mock('@memberjunction/actions-base', () => ({
    ActionEngineBase: class {
        static get Instance() { return new this(); }
        static getInstance() { return new this(); }
    },
    EntityActionEngineBase: class {
        static get Instance() { return new this(); }
        static getInstance() { return new this(); }
    },
    MJActionEntityExtended: class {},
    MJEntityActionEntityExtended: class {},
    ActionParam: class {},
    ActionResult: class {},
    ActionResultSimple: class {},
    ActionInvocationProvenance: class {},
    RunActionParams: class {},
    EntityActionInvocationParams: class {},
    EntityActionResult: class {},
    IsEntityActionInScope: mockIsEntityActionInScope,
    // The real resolver factory reads the global ClassFactory; the invocation layer only passes it
    // through to IsEntityActionInScope, which is stubbed here, so an identity stand-in is enough.
    ResolveEntityActionScopeResolver: vi.fn(() => ({ IsInScope: vi.fn() }))
}));

vi.mock('../generic/ActionEngine', () => ({
    ActionEngineServer: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            Actions: [{ ID: 'ACTION-1', Name: 'Notify', Params: { Items: [{ ID: 'p1', Name: 'Record', Type: 'Input' }] } }],
            ActionFilters: [],
            RunAction: mockRunAction
        }
    }
}));

import { EntityActionInvocationSingleRecord } from '../entity-actions/EntityActionInvocationTypes';
import type { EntityActionInvocationParams } from '@memberjunction/actions-base';

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

const ENTITY_ACTION_ID = 'EA000000-0000-0000-0000-000000000001';
const INVOCATION_TYPE_ID = '17000000-0000-0000-0000-000000000002';
const TARGET_ENTITY_ID = 'E7000000-0000-0000-0000-000000000003';

/**
 * A stand-in record whose fields are GETTERS, exactly like a generated entity class — which is the
 * whole reason `'Entity Object Data'` exists. `Object.keys()` / spread on this object yields the
 * private backing store, not the columns.
 */
class RecordLikeEntity {
    private _data: Record<string, unknown>;
    constructor(data: Record<string, unknown>) { this._data = data; }
    public get ID(): unknown { return this._data['ID']; }
    public get Amount(): unknown { return this._data['Amount']; }
    public GetAll(): Record<string, unknown> { return { ...this._data }; }
    public get PrimaryKey(): { ToString: () => string; ToConcatenatedString: () => string } {
        return {
            ToString: () => `ID=${String(this._data['ID'])}`,
            ToConcatenatedString: () => `ID|${String(this._data['ID'])}`
        };
    }
}

function invocationParams(overrides: Record<string, unknown> = {}): EntityActionInvocationParams {
    return {
        EntityAction: {
            ID: ENTITY_ACTION_ID,
            ActionID: 'ACTION-1',
            EntityID: TARGET_ENTITY_ID,
            LoggingMode: 'All',
            Filters: [],
            Params: [{ ActionParamID: 'p1', ValueType: 'Entity Object Data', Value: '' }],
            // Read with .map() on the dispatch path; an absent array is not the same as an empty one.
            Filters: []
        },
        InvocationType: { ID: INVOCATION_TYPE_ID, Name: 'Single Record' },
        ContextUser: { ID: 'test-user' },
        EntityObject: new RecordLikeEntity({ ID: 'rec-1', Amount: 42 }),
        ...overrides
    } as unknown as EntityActionInvocationParams;
}

beforeEach(() => {
    mockIsEntityActionInScope.mockReset();
    mockIsEntityActionInScope.mockResolvedValue(true);
    mockRunAction.mockReset();
    mockRunAction.mockResolvedValue({ Success: true, Message: 'OK', RunParams: {}, LogEntry: null });
});

// ── 'Entity Object Data' ─────────────────────────────────────────────────────────────────────────

describe("MapParams — 'Entity Object Data'", () => {
    const invocation = new EntityActionInvocationSingleRecord();

    it('passes the field values as a plain object, not the live entity', async () => {
        const record = new RecordLikeEntity({ ID: 'rec-1', Amount: 42 });
        const result = await invocation.MapParams(
            [{ ID: 'p1', Name: 'Record', Type: 'Input' }] as never,
            [{ ActionParamID: 'p1', ValueType: 'Entity Object Data', Value: '' }] as never,
            record as unknown as Record<string, Function>
        );

        expect(result[0].Value).toEqual({ ID: 'rec-1', Amount: 42 });
        expect(result[0].Value).not.toBe(record);
    });

    it('survives JSON serialization — the reason the value type exists at all', async () => {
        const record = new RecordLikeEntity({ ID: 'rec-1', Amount: 42 });

        const asObject = await invocation.MapParams(
            [{ ID: 'p1', Name: 'Record', Type: 'Input' }] as never,
            [{ ActionParamID: 'p1', ValueType: 'Entity Object', Value: '' }] as never,
            record as unknown as Record<string, Function>
        );
        const asData = await invocation.MapParams(
            [{ ID: 'p1', Name: 'Record', Type: 'Input' }] as never,
            [{ ActionParamID: 'p1', ValueType: 'Entity Object Data', Value: '' }] as never,
            record as unknown as Record<string, Function>
        );

        // Spreading the live record loses every column (they are getters on the prototype).
        expect({ ...(asObject[0].Value as object) }).not.toHaveProperty('Amount');
        expect(JSON.parse(JSON.stringify(asData[0].Value))).toEqual({ ID: 'rec-1', Amount: 42 });
    });

    it('hands back an independent copy — mutating it cannot corrupt the record', async () => {
        const record = new RecordLikeEntity({ ID: 'rec-1', Amount: 42 });
        const result = await invocation.MapParams(
            [{ ID: 'p1', Name: 'Record', Type: 'Input' }] as never,
            [{ ActionParamID: 'p1', ValueType: 'Entity Object Data', Value: '' }] as never,
            record as unknown as Record<string, Function>
        );

        (result[0].Value as Record<string, unknown>)['Amount'] = 999;
        expect(record.Amount).toBe(42);
    });
});

// ── Provenance ───────────────────────────────────────────────────────────────────────────────────

describe('BuildProvenance', () => {
    const invocation = new EntityActionInvocationSingleRecord();

    it('carries the binding, invocation type, target entity, target record and LoggingMode', () => {
        const params = invocationParams();
        const provenance = invocation.BuildProvenance(params, params.EntityObject);

        expect(provenance).toEqual({
            EntityActionID: ENTITY_ACTION_ID,
            EntityActionInvocationTypeID: INVOCATION_TYPE_ID,
            TargetEntityID: TARGET_ENTITY_ID,
            // MJ's canonical serialized record-ID format, not the display form.
            TargetRecordID: 'ID|rec-1',
            LoggingMode: 'All',
            EntityActionParams: params.EntityAction.Params
        });
    });

    it('leaves TargetRecordID undefined when the dispatch has no record yet', () => {
        const provenance = invocation.BuildProvenance(invocationParams(), undefined);
        expect(provenance.TargetRecordID).toBeUndefined();
        expect(provenance.EntityActionID).toBe(ENTITY_ACTION_ID);
    });

    it('is threaded into RunAction so the log row can be stamped', async () => {
        await invocation.InvokeAction(invocationParams());

        expect(mockRunAction).toHaveBeenCalledTimes(1);
        const runArgs = mockRunAction.mock.calls[0][0] as { Provenance: Record<string, unknown> };
        expect(runArgs.Provenance.EntityActionID).toBe(ENTITY_ACTION_ID);
        expect(runArgs.Provenance.TargetRecordID).toBe('ID|rec-1');
        expect(runArgs.Provenance.LoggingMode).toBe('All');
        // The bindings travel with the provenance so the redactor can honour per-binding LogValue.
        expect(runArgs.Provenance.EntityActionParams).toHaveLength(1);
    });
});

// ── Scope gate ───────────────────────────────────────────────────────────────────────────────────

describe('InvokeAction — scope gate', () => {
    const invocation = new EntityActionInvocationSingleRecord();

    it('runs the action when the record is in scope', async () => {
        const result = await invocation.InvokeAction(invocationParams());
        expect(mockRunAction).toHaveBeenCalledTimes(1);
        expect(result?.Success).toBe(true);
    });

    it('does NOT run the action, and returns null, when the record is out of scope', async () => {
        mockIsEntityActionInScope.mockResolvedValue(false);
        const result = await invocation.InvokeAction(invocationParams());

        expect(mockRunAction).not.toHaveBeenCalled();
        // null means "never ran", which is distinct from a failed run — callers must not report it
        // as a failure.
        expect(result).toBeNull();
    });

    it('checks scope BEFORE doing any work — no params mapped, no action resolved', async () => {
        mockIsEntityActionInScope.mockResolvedValue(false);
        const mapSpy = vi.spyOn(invocation, 'MapParams');

        await invocation.InvokeAction(invocationParams());

        expect(mapSpy).not.toHaveBeenCalled();
        mapSpy.mockRestore();
    });

    it('asks about the binding and the subject record it is dispatching for', async () => {
        const params = invocationParams();
        await invocation.InvokeAction(params);

        expect(mockIsEntityActionInScope).toHaveBeenCalledTimes(1);
        const [binding, subject] = mockIsEntityActionInScope.mock.calls[0];
        expect(binding).toBe(params.EntityAction);
        expect(subject).toBe(params.EntityObject);
    });
});
