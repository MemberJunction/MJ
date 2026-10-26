import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Engine-side logging behaviour for the Entity Action workflow extensions.
 *
 * These tests are deliberately narrow: they exercise what `ActionEngineServer` does with the
 * `ActionExecutionLog` row — which column gets the as-called inputs, which gets the final merged set,
 * when a row is written at all, and what provenance is stamped on it. The redaction RULES themselves
 * are covered exhaustively in `actions-base/src/__tests__/ParamRedaction.test.ts`; here the REAL
 * redactor is used (not a stub) so the wiring is proven end-to-end rather than assumed.
 */

// ── The log row under test ───────────────────────────────────────────────────────────────────────
// A plain capturing object rather than a generated entity: the engine only ever assigns to these
// columns, so a recorder is a faithful stand-in and lets each test read exactly what was written.
interface CapturedLogRow {
    ActionID: string;
    StartedAt: Date | null;
    EndedAt: Date | null;
    UserID: string;
    Params: string;
    ResultParams: string;
    ResultCode: string | undefined;
    Message: string | undefined;
    EntityActionID: string | null;
    EntityActionInvocationTypeID: string | null;
    TargetEntityID: string | null;
    TargetRecordID: string | null;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
    LatestResult: unknown;
}

const { logRows } = vi.hoisted(() => ({ logRows: [] as CapturedLogRow[] }));

function newLogRow(): CapturedLogRow {
    const row: CapturedLogRow = {
        ActionID: '',
        StartedAt: null,
        EndedAt: null,
        UserID: '',
        Params: '',
        ResultParams: '',
        ResultCode: undefined,
        Message: undefined,
        EntityActionID: null,
        EntityActionInvocationTypeID: null,
        TargetEntityID: null,
        TargetRecordID: null,
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(true),
        LatestResult: null
    };
    logRows.push(row);
    return row;
}

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return {
        ...actual,
        Metadata: vi.fn(function () {
            return { GetEntityObject: vi.fn().mockImplementation(async () => newLogRow()) };
        }),
        LogError: vi.fn(),
        LogErrorEx: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogVerbose: vi.fn(),
        RunView: vi.fn(),
        RunQuery: vi.fn(),
        BaseEngine: class MockBaseEngine<T> {
            protected static getInstance<U>(_key?: string): U {
                return {} as U;
            }
            protected ContextUser = { ID: 'test-user-id', Name: 'Test User' };
            protected Loaded = true;
            protected async Load() {}
            protected async AdditionalLoading() {}
            protected HandleSingleViewResult() {}
            protected RunViewProviderToUse = undefined;
        }
    };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => (await importOriginal()) as Record<string, unknown>);

const { mockClassFactory } = vi.hoisted(() => ({
    mockClassFactory: { CreateInstance: vi.fn(), GetAllRegistrations: vi.fn().mockReturnValue([]) }
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        // The real MJGlobal behind a mocked ClassFactory: constructing a real BaseEntity (the
        // field-security tests below) reads the global object store.
        MJGlobal: {
            Instance: Object.create(actual.MJGlobal.Instance, { ClassFactory: { value: mockClassFactory } })
        }
    };
});

/**
 * The real `actions-base` — including the real `RedactParamsToJSON` — with only `ActionEngineBase`
 * swapped for a shell so the engine's singleton/metadata bootstrap doesn't need a provider.
 */
vi.mock('@memberjunction/actions-base', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    class MockActionEngineBase {
        public ContextUser = { ID: 'test-user-id', Name: 'Test User' };
        public Loaded = true;
        private static _inst: MockActionEngineBase | undefined;
        static get Instance(): MockActionEngineBase {
            return (MockActionEngineBase._inst ??= new MockActionEngineBase());
        }
        static getInstance<T>(): T {
            return MockActionEngineBase.Instance as unknown as T;
        }
        public ActionParams: Array<Record<string, unknown>> = [];
        get Actions() { return []; }
        get ActionCategories() { return []; }
        get ActionFilters() { return []; }
        get ActionResultCodes() { return []; }
        get ActionLibraries() { return []; }
        async Config() {}
        async Load() {}
    }
    return { ...actual, ActionEngineBase: MockActionEngineBase };
});

import { ActionEngineServer } from '../generic/ActionEngine';
import { BaseAction } from '../generic/BaseAction';
import type { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { MJActionParamEntity, MJEntityActionParamEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import { BuildUser, EmployeeEntityInfo, FullEmployeeRow, HR_ROLE_ID, INTERN_ROLE_ID, LoadEmployeeFor, SALARY } from './fieldSecurityFixture';

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────

const ACTION_ID = 'AC710000-0000-0000-0000-000000000001';
const ENTITY_ACTION_ID = 'EA710000-0000-0000-0000-000000000002';
const INVOCATION_TYPE_ID = '17710000-0000-0000-0000-000000000003';
const TARGET_ENTITY_ID = 'E7710000-0000-0000-0000-000000000004';
const TARGET_RECORD_ID = '4E710000-0000-0000-0000-000000000005';
const PARAM_DEF_ID = 'PA710000-0000-0000-0000-000000000006';

interface EngineInternals {
    ActionParams: MJActionParamEntity[];
    ActionResultCodes: unknown[];
    _logQueue: { Insert: (e: unknown) => void; Update: (e: unknown, mutate: () => void) => void; Settled: (e: unknown) => Promise<void> };
}

/**
 * An engine whose log queue applies mutations synchronously. The real queue is fire-and-forget and
 * chains the 'ended' UPDATE behind the 'started' INSERT (covered by the existing ActionEngine tests);
 * flattening it here keeps these assertions about WHAT is written, not when.
 */
function engine(paramDefinitions: MJActionParamEntity[] = []): ActionEngineServer {
    const e = new ActionEngineServer();
    const internals = e as unknown as EngineInternals;
    // The engine reads param definitions off the shared ActionEngineBase cache via a getter, so the
    // value has to be planted on the instance rather than assigned through it.
    Object.defineProperty(e, 'ActionParams', { get: () => paramDefinitions, configurable: true });
    Object.defineProperty(e, 'ActionResultCodes', { get: () => [], configurable: true });
    const inserted: unknown[] = [];
    internals._logQueue = {
        Insert: (row: unknown) => { inserted.push(row); },
        Update: (_row: unknown, mutate: () => void) => { mutate(); },
        // Writes apply synchronously above, so every row has already "landed".
        Settled: () => Promise.resolve()
    };
    (e as unknown as { _inserted: unknown[] })._inserted = inserted;
    return e;
}

function insertedRows(e: ActionEngineServer): unknown[] {
    return (e as unknown as { _inserted: unknown[] })._inserted;
}

function runParams(overrides: Partial<RunActionParams> = {}): RunActionParams {
    return {
        Action: { ID: ACTION_ID, Name: 'Test Action', DriverClass: 'TestLoggingAction', Type: 'Custom' },
        ContextUser: { ID: 'test-user-id', Name: 'Test User' },
        Filters: [],
        Params: [],
        SkipActionLog: false,
        ...overrides
    } as unknown as RunActionParams;
}

function paramDefinition(name: string, logValue: boolean): MJActionParamEntity {
    return { ID: PARAM_DEF_ID, ActionID: ACTION_ID, Name: name, LogValue: logValue } as MJActionParamEntity;
}

/**
 * How many times an action BODY actually executed. `LoggingMode` decides whether a row is written;
 * it must never decide whether the action runs. Asserting "nothing was logged" alone cannot tell a
 * correct suppression apart from a regression that skipped execution entirely — both leave zero rows.
 */
let bodyRunCount = 0;

/** An action that appends an output param — the real-world reason Params must be snapshotted early. */
class OutputWritingAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<{ Success: boolean; ResultCode: string; Message: string }> {
        bodyRunCount++;
        params.Params.push({ Name: 'Result Payload', Value: { rows: 3 }, Type: 'Output' } as ActionParam);
        return { Success: true, ResultCode: 'SUCCESS', Message: 'ok' };
    }
}

class FailingAction extends BaseAction {
    protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string; Message: string }> {
        bodyRunCount++;
        return { Success: false, ResultCode: 'FAILED', Message: 'nope' };
    }
}

beforeEach(() => {
    logRows.length = 0;
    bodyRunCount = 0;
    mockClassFactory.CreateInstance.mockReset();
    mockClassFactory.CreateInstance.mockImplementation(() => new OutputWritingAction());
});

// ── Params vs ResultParams ───────────────────────────────────────────────────────────────────────

describe('ActionExecutionLog.Params — the as-called inputs', () => {
    it('captures inputs BEFORE the action mutates the array it was handed', async () => {
        const e = engine();
        const params = runParams({ Params: [{ Name: 'Mode', Value: 'fast', Type: 'Input' }] as ActionParam[] });

        await e.RunAction(params);

        const row = logRows[0];
        const logged = JSON.parse(row.Params) as ActionParam[];
        // The action pushed 'Result Payload' onto the SAME array. Params must not show it.
        expect(logged).toEqual([{ Name: 'Mode', Value: 'fast', Type: 'Input' }]);
        expect(params.Params).toHaveLength(2);
    });

    it('writes the final merged set — inputs AND outputs — to ResultParams', async () => {
        const e = engine();
        await e.RunAction(runParams({ Params: [{ Name: 'Mode', Value: 'fast', Type: 'Input' }] as ActionParam[] }));

        const merged = JSON.parse(logRows[0].ResultParams) as ActionParam[];
        expect(merged.map(p => p.Name)).toEqual(['Mode', 'Result Payload']);
    });

    it('never overwrites Params with the post-run set', async () => {
        const e = engine();
        await e.RunAction(runParams({ Params: [{ Name: 'Mode', Value: 'fast', Type: 'Input' }] as ActionParam[] }));

        expect(logRows[0].Params).not.toEqual(logRows[0].ResultParams);
        expect(logRows[0].Params).not.toContain('Result Payload');
    });

    it('redacts a LogValue=false parameter in BOTH columns', async () => {
        const e = engine([paramDefinition('Mode', false)]);
        await e.RunAction(runParams({ Params: [{ Name: 'Mode', Value: 'a-secret-value', Type: 'Input' }] as ActionParam[] }));

        expect(logRows[0].Params).not.toContain('a-secret-value');
        expect(logRows[0].ResultParams).not.toContain('a-secret-value');
        expect(JSON.parse(logRows[0].Params)[0].Reason).toBe('ParamLogValueFalse');
    });

    it('redacts a whole-record binding value, using the binding from Provenance', async () => {
        const e = engine([paramDefinition('Record', true)]);
        const bindings = [
            { ActionParamID: PARAM_DEF_ID, ValueType: 'Entity Object Data', LogValue: true } as MJEntityActionParamEntity
        ];
        await e.RunAction(
            runParams({
                Params: [{ Name: 'Record', Value: { ID: 'r1', Ssn: '123-45-6789' }, Type: 'Input' }] as ActionParam[],
                Provenance: { EntityActionParams: bindings }
            } as Partial<RunActionParams>)
        );

        expect(logRows[0].Params).not.toContain('123-45-6789');
        expect(JSON.parse(logRows[0].Params)[0].Reason).toBe('WholeRecordValueType');
    });
});

// ── Provenance stamping ──────────────────────────────────────────────────────────────────────────

describe('Provenance stamping', () => {
    it('writes all four columns when the run came from an Entity Action binding', async () => {
        const e = engine();
        await e.RunAction(
            runParams({
                Provenance: {
                    EntityActionID: ENTITY_ACTION_ID,
                    EntityActionInvocationTypeID: INVOCATION_TYPE_ID,
                    TargetEntityID: TARGET_ENTITY_ID,
                    TargetRecordID: TARGET_RECORD_ID
                }
            } as Partial<RunActionParams>)
        );

        const row = logRows[0];
        expect(row.EntityActionID).toBe(ENTITY_ACTION_ID);
        expect(row.EntityActionInvocationTypeID).toBe(INVOCATION_TYPE_ID);
        expect(row.TargetEntityID).toBe(TARGET_ENTITY_ID);
        expect(row.TargetRecordID).toBe(TARGET_RECORD_ID);
    });

    it('leaves all four NULL for a direct invocation — that NULL is the "nobody configured this" signal', async () => {
        const e = engine();
        await e.RunAction(runParams());

        const row = logRows[0];
        expect(row.EntityActionID).toBeNull();
        expect(row.EntityActionInvocationTypeID).toBeNull();
        expect(row.TargetEntityID).toBeNull();
        expect(row.TargetRecordID).toBeNull();
    });

    it('nulls any individual column the provenance did not carry', async () => {
        const e = engine();
        await e.RunAction(
            runParams({ Provenance: { EntityActionID: ENTITY_ACTION_ID } } as Partial<RunActionParams>)
        );

        expect(logRows[0].EntityActionID).toBe(ENTITY_ACTION_ID);
        expect(logRows[0].TargetRecordID).toBeNull();
    });
});

// ── LoggingMode ──────────────────────────────────────────────────────────────────────────────────

describe('LoggingMode', () => {
    it("'All' (and no binding at all) writes a row on success", async () => {
        const e = engine();
        await e.RunAction(runParams());
        expect(insertedRows(e)).toHaveLength(1);
        expect(logRows[0].EndedAt).toBeInstanceOf(Date);
    });

    it("'None' writes nothing, even on failure", async () => {
        mockClassFactory.CreateInstance.mockImplementation(() => new FailingAction());
        const e = engine();
        const result = await e.RunAction(runParams({ Provenance: { LoggingMode: 'None' } } as Partial<RunActionParams>));

        expect(result.Success).toBe(false);
        expect(logRows).toHaveLength(0);
        expect(result.LogEntry).toBeFalsy();
        // Zero rows is also what a regression that never ran the action looks like — pin execution.
        expect(bodyRunCount).toBe(1);
    });

    it.each(['All', 'FailuresOnly', 'None'] as const)(
        "'%s' gates logging but NEVER execution — the action body still runs and its result is returned",
        async (mode) => {
            const e = engine();
            const result = await e.RunAction(
                runParams({
                    Params: [{ Name: 'Mode', Value: 'fast', Type: 'Input' }] as ActionParam[],
                    Provenance: { LoggingMode: mode }
                } as Partial<RunActionParams>)
            );

            expect(bodyRunCount).toBe(1);
            expect(result.Success).toBe(true);
            expect(result.Result?.ResultCode ?? result.Message).toBeTruthy();
            // The action's side effect on the caller's array is unaffected by the logging decision.
            expect(result.Params.map(p => p.Name)).toEqual(['Mode', 'Result Payload']);
        }
    );

    it("'SkipActionLog' suppresses the row without suppressing the run", async () => {
        const e = engine();
        const result = await e.RunAction(runParams({ SkipActionLog: true } as Partial<RunActionParams>));

        expect(logRows).toHaveLength(0);
        expect(bodyRunCount).toBe(1);
        expect(result.Success).toBe(true);
    });

    it("'FailuresOnly' writes nothing on success and returns no LogEntry", async () => {
        const e = engine();
        const result = await e.RunAction(
            runParams({ Provenance: { LoggingMode: 'FailuresOnly' } } as Partial<RunActionParams>)
        );

        expect(result.Success).toBe(true);
        // The row object is built but the 'started' INSERT is withheld and no 'ended' UPDATE follows.
        expect(insertedRows(e)).toHaveLength(0);
        expect(logRows[0]?.EndedAt ?? null).toBeNull();
        expect(result.LogEntry).toBeUndefined();
    });

    it("'FailuresOnly' DOES write on failure", async () => {
        mockClassFactory.CreateInstance.mockImplementation(() => new FailingAction());
        const e = engine();
        const result = await e.RunAction(
            runParams({ Provenance: { LoggingMode: 'FailuresOnly' } } as Partial<RunActionParams>)
        );

        expect(result.Success).toBe(false);
        expect(logRows[0].EndedAt).toBeInstanceOf(Date);
        expect(logRows[0].ResultCode ?? null).toBeNull();
        expect(logRows[0].Message).toBe('nope');
    });

    it("'FailuresOnly' writes when the action throws", async () => {
        mockClassFactory.CreateInstance.mockImplementation(() => {
            class Thrower extends BaseAction {
                protected async InternalRunAction(): Promise<never> {
                    throw new Error('boom');
                }
            }
            return new Thrower();
        });
        const e = engine();
        const result = await e.RunAction(
            runParams({ Provenance: { LoggingMode: 'FailuresOnly' } } as Partial<RunActionParams>)
        );

        expect(result.Success).toBe(false);
        expect(logRows[0].EndedAt).toBeInstanceOf(Date);
        expect(logRows[0].Message).toContain('boom');
    });

    it('SkipActionLog still wins over every LoggingMode', async () => {
        mockClassFactory.CreateInstance.mockImplementation(() => new FailingAction());
        const e = engine();
        await e.RunAction(
            runParams({ SkipActionLog: true, Provenance: { LoggingMode: 'All' } } as Partial<RunActionParams>)
        );

        expect(logRows).toHaveLength(0);
    });

    it('skips param redaction and JSON serialization inside SnapshotInputParams when SkipActionLog is true or LoggingMode is None (MJ-AI-13)', async () => {
        const e = engine();
        const paramDefsSpy = vi.spyOn(
            e as unknown as { ParamDefinitionsFor: (p: RunActionParams) => MJActionParamEntity[] },
            'ParamDefinitionsFor'
        );

        await e.RunAction(
            runParams({
                Params: [{ Name: 'Large', Value: { big: 'payload' }, Type: 'Input' }] as ActionParam[],
                SkipActionLog: true
            } as Partial<RunActionParams>)
        );
        await e.RunAction(
            runParams({
                Params: [{ Name: 'Large', Value: { big: 'payload' }, Type: 'Input' }] as ActionParam[],
                Provenance: { LoggingMode: 'None' }
            } as Partial<RunActionParams>)
        );

        expect(paramDefsSpy).not.toHaveBeenCalled();
    });

    it('instantiates BaseAction only once per RunAction even when Audience is evaluated (MJ-AI-14)', async () => {
        class AudienceSupportingAction extends OutputWritingAction {
            public override get SupportsAudience(): boolean {
                return true;
            }
        }
        mockClassFactory.CreateInstance.mockImplementation(() => new AudienceSupportingAction());
        const e = engine();
        const result = await e.RunAction(
            runParams({
                Audience: { Readers: [{ ID: 'reader-2' }] } as RunActionParams['Audience']
            })
        );

        expect(result.Success).toBe(true);
        expect(mockClassFactory.CreateInstance).toHaveBeenCalledTimes(1);
    });
});

// ── Field security on the persisted parameters ──────────────────────────────────────────────────

describe('ActionExecutionLog parameters are projected for the user the action ran for', () => {
    const employees = EmployeeEntityInfo();

    /** A request provider: the entity list the projection reads, and the log row factory. */
    const provider = { Entities: [employees], EntityByID: () => undefined, GetEntityObject: vi.fn(async () => newLogRow()) };

    /** An action that returns an engine-cached (system-loaded) employee and a plain full-width row. */
    class SystemRowAction extends BaseAction {
        protected async InternalRunAction(params: RunActionParams): Promise<{ Success: boolean; ResultCode: string; Message: string }> {
            params.Params.push({ Name: 'Employee', Value: await LoadEmployeeFor(employees, null), Type: 'Output' } as ActionParam);
            params.Params.push({ Name: 'Rows', Value: [FullEmployeeRow()], Type: 'Output' } as ActionParam);
            return { Success: true, ResultCode: 'SUCCESS', Message: 'ok' };
        }
    }

    async function loggedResultParams(contextUser: UserInfo, inputs: ActionParam[] = []): Promise<ActionParam[]> {
        mockClassFactory.CreateInstance.mockImplementation(() => new SystemRowAction());
        await engine().RunAction(runParams({ ContextUser: contextUser, Params: inputs, Provider: provider } as Partial<RunActionParams>));
        return JSON.parse(logRows[0].ResultParams) as ActionParam[];
    }

    it('REGRESSION: ResultParams never carries a field the context user is denied', async () => {
        const logged = await loggedResultParams(BuildUser([INTERN_ROLE_ID], 'intern-log'));

        expect(JSON.stringify(logged)).not.toContain(String(SALARY));
        expect(logged.find(p => p.Name === 'Employee')?.Value).toEqual({ ID: FullEmployeeRow().ID, Name: 'Ada', Notes: 'n' });
        expect(logged.find(p => p.Name === 'Rows')?.Value).toEqual([{ ID: FullEmployeeRow().ID, Name: 'Ada', Notes: 'n' }]);
    });

    it('REGRESSION: Params (the as-called inputs) is projected the same way', async () => {
        await loggedResultParams(BuildUser([INTERN_ROLE_ID], 'intern-log'), [{ Name: 'Seed', Value: FullEmployeeRow(), Type: 'Input' }] as ActionParam[]);
        expect(logRows[0].Params).not.toContain(String(SALARY));
    });

    it('REGRESSION: an entity object of an entity the context user cannot read is logged as null', async () => {
        const unreadable = EmployeeEntityInfo();
        unreadable.Permissions.splice(0, unreadable.Permissions.length, ...unreadable.Permissions.filter(p => p.RoleID !== INTERN_ROLE_ID));
        class UnreadableRowAction extends BaseAction {
            protected async InternalRunAction(params: RunActionParams): Promise<{ Success: boolean; ResultCode: string; Message: string }> {
                params.Params.push({ Name: 'Employee', Value: await LoadEmployeeFor(unreadable, null), Type: 'Output' } as ActionParam);
                return { Success: true, ResultCode: 'SUCCESS', Message: 'ok' };
            }
        }
        mockClassFactory.CreateInstance.mockImplementation(() => new UnreadableRowAction());
        const unreadableProvider = { ...provider, Entities: [unreadable] };
        await engine().RunAction(runParams({ ContextUser: BuildUser([INTERN_ROLE_ID], 'intern-log'), Provider: unreadableProvider } as Partial<RunActionParams>));

        expect(logRows[0].ResultParams).not.toContain('Ada');
        expect((JSON.parse(logRows[0].ResultParams) as ActionParam[])[0].Value).toBeNull();
    });

    it('keeps the field for a context user allowed to read it', async () => {
        const logged = await loggedResultParams(BuildUser([HR_ROLE_ID], 'hr-log'));
        expect(logged.find(p => p.Name === 'Employee')?.Value).toMatchObject({ Salary: SALARY });
        expect(logged.find(p => p.Name === 'Rows')?.Value).toEqual([FullEmployeeRow()]);
    });
});
