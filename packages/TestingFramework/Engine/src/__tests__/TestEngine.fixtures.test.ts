/**
 * TestEngine.fixtures.test.ts — the suite-scoped fixture lifecycle (D6 / Phase 4).
 *
 * Proves the load-bearing guarantees of the SetupSuite / TeardownSuite mechanism that
 * RunSuite added, WITHOUT a database: a registered stub driver records its hook calls,
 * and the TestEngine's cache getters + entity create/update are spied to fake entities.
 *
 * Guarantees under test:
 *  - SetupSuite runs exactly once before the first Execute (with a SuiteFixtureContext
 *    whose SuiteRunID matches the created suite run).
 *  - TeardownSuite runs exactly once after the last test — even when an Execute THROWS,
 *    even when an Execute returns 'Timeout', and a throw FROM TeardownSuite is swallowed.
 *  - A thrown Execute is hardened into a 'Error' result (never left 'Running').
 *  - Two suite runs get fresh, isolated fixture contexts (no leak through the cached driver).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type {
    MJTestEntity, MJTestRunEntity, MJTestSuiteEntity, MJTestSuiteRunEntity, MJTestSuiteTestEntity, MJTestTypeEntity
} from '@memberjunction/core-entities';
import { TestEngine } from '../engine/TestEngine';
import { BaseTestDriver } from '../drivers/BaseTestDriver';
import type {
    DriverExecutionContext, DriverExecutionResult, SuiteFixtureContext, ResolvedTestVariables
} from '../types';

// ── Stub driver: registered once; reads module-level `behavior` each run ──────────────
interface StubBehavior {
    setupCalls: number;
    teardownCalls: number;
    teardownThrows: boolean;
    /** CreatedRecords.length observed at each SetupSuite — proves per-run isolation. */
    setupSeenCreatedRecords: number[];
    /** SuiteRunID observed at SetupSuite — must equal the created suite run's ID. */
    lastSetupSuiteRunId: string | null;
    /** Per-test Execute behavior, keyed by test name. */
    executeFor: (testName: string) => Promise<DriverExecutionResult>;
}

let behavior: StubBehavior;

function passResult(testRunId = 'x'): DriverExecutionResult {
    return {
        targetType: 'Stub', targetLogId: testRunId, status: 'Passed', score: 1,
        oracleResults: [{ oracleType: 'stub', passed: true, score: 1, message: 'ok' }],
        passedChecks: 1, failedChecks: 0, totalChecks: 1
    };
}

@RegisterClass(BaseTestDriver, 'StubFixtureDriver')
export class StubFixtureDriver extends BaseTestDriver {
    public override supportsCancellation(): boolean { return true; }

    public override async SetupSuite(context: SuiteFixtureContext, _user: UserInfo): Promise<void> {
        behavior.setupCalls++;
        behavior.setupSeenCreatedRecords.push(context.CreatedRecords.length);
        behavior.lastSetupSuiteRunId = context.SuiteRunID;
        // Simulate provisioning a fixture row so the isolation test can detect a leak.
        context.CreatedRecords.push({ EntityName: 'StubFixture', PrimaryKeyID: 'fx-1' });
    }

    public override async TeardownSuite(_context: SuiteFixtureContext, _user: UserInfo): Promise<void> {
        behavior.teardownCalls++;
        if (behavior.teardownThrows) {
            throw new Error('teardown boom');
        }
    }

    public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        return behavior.executeFor(context.test.Name);
    }
}

// ── Fake-entity helpers (only the fields RunSuite touches) ────────────────────────────
const SUITE_ID = 'suite-1';
const TYPE_ID = 'tt-stub';

function fakeSuite(): MJTestSuiteEntity {
    return { ID: SUITE_ID, Name: 'Stub Suite', Variables: null, Configuration: null } as unknown as MJTestSuiteEntity;
}
function fakeType(): MJTestTypeEntity {
    return { ID: TYPE_ID, Name: 'Stub Type', DriverClass: 'StubFixtureDriver', VariablesSchema: null } as unknown as MJTestTypeEntity;
}
function fakeTests(names: string[]): MJTestEntity[] {
    return names.map((Name, i) => ({ ID: `test-${i}`, Name, TypeID: TYPE_ID, Variables: null, RepeatCount: null, MaxExecutionTimeMS: null } as unknown as MJTestEntity));
}
function fakeSuiteTests(tests: MJTestEntity[]): MJTestSuiteTestEntity[] {
    return tests.map((t, i) => ({ SuiteID: SUITE_ID, TestID: t.ID, Sequence: i + 1, Status: 'Active' } as unknown as MJTestSuiteTestEntity));
}

// The engine surface we spy/stub. Casting to this shape (not `any`) lets us reach the
// private create/update methods + the variable resolver without a live DB.
interface EnginePrivates {
    createSuiteRun: (...a: unknown[]) => Promise<MJTestSuiteRunEntity>;
    createTestRun: (...a: unknown[]) => Promise<MJTestRunEntity>;
    updateSuiteRun: (...a: unknown[]) => Promise<void>;
    updateTestRun: (...a: unknown[]) => Promise<void>;
    _variableResolver: { resolveVariables: (...a: unknown[]) => ResolvedTestVariables };
    _driverCache: Map<string, unknown>;
}

let suiteRunCounter = 0;

/** Spy the engine's cache getters + entity create/update so RunSuite runs DB-free. */
function wireEngine(tests: MJTestEntity[]): TestEngine {
    const engine = TestEngine.Instance;
    const priv = engine as unknown as EnginePrivates;
    priv._driverCache.clear(); // never reuse a driver instance across tests

    vi.spyOn(engine, 'GetTestSuiteByID').mockReturnValue(fakeSuite());
    vi.spyOn(engine, 'GetTestsForSuite').mockReturnValue(tests);
    vi.spyOn(engine, 'GetTestByID').mockImplementation((id: string) => tests.find(t => t.ID === id));
    vi.spyOn(engine, 'GetTestTypeByID').mockReturnValue(fakeType());
    vi.spyOn(engine, 'TestSuiteTests', 'get').mockReturnValue(fakeSuiteTests(tests));

    vi.spyOn(priv, 'createSuiteRun').mockImplementation(async () => {
        suiteRunCounter++;
        return { ID: `suiterun-${suiteRunCounter}`, StartedAt: new Date(), CompletedAt: new Date(), Status: 'Running' } as unknown as MJTestSuiteRunEntity;
    });
    vi.spyOn(priv, 'createTestRun').mockImplementation(async () =>
        ({ ID: 'testrun-x', StartedAt: new Date(), CompletedAt: new Date(), Status: 'Running' } as unknown as MJTestRunEntity));
    vi.spyOn(priv, 'updateSuiteRun').mockResolvedValue(undefined);
    vi.spyOn(priv, 'updateTestRun').mockResolvedValue(undefined);
    vi.spyOn(priv._variableResolver, 'resolveVariables').mockReturnValue({ values: {}, sources: {} } as unknown as ResolvedTestVariables);

    return engine;
}

const USER = { ID: 'u-1', Name: 'Tester', Email: 't@x' } as unknown as UserInfo;

beforeEach(() => {
    behavior = {
        setupCalls: 0,
        teardownCalls: 0,
        teardownThrows: false,
        setupSeenCreatedRecords: [],
        lastSetupSuiteRunId: null,
        executeFor: async () => passResult()
    };
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('TestEngine suite-scoped fixture lifecycle', () => {
    it('calls SetupSuite once (with the suite run ID) before the tests, and TeardownSuite once after', async () => {
        const tests = fakeTests(['T1', 'T2', 'T3']);
        const engine = wireEngine(tests);

        const result = await engine.RunSuite(SUITE_ID, { verbose: false }, USER);

        expect(behavior.setupCalls).toBe(1);
        expect(behavior.teardownCalls).toBe(1);
        expect(behavior.lastSetupSuiteRunId).toBe(result.suiteRunId);
        expect(result.testResults).toHaveLength(3);
        expect(result.testResults.every(r => r.status === 'Passed')).toBe(true);
    });

    it('runs TeardownSuite even when an Execute THROWS mid-suite (the load-bearing guarantee)', async () => {
        const tests = fakeTests(['T1', 'T2', 'T3']);
        behavior.executeFor = async (name) =>
            name === 'T2' ? Promise.reject(new Error('boom')) : passResult();
        const engine = wireEngine(tests);

        const result = await engine.RunSuite(SUITE_ID, { verbose: false }, USER);

        expect(behavior.setupCalls).toBe(1);
        expect(behavior.teardownCalls).toBe(1); // GUARANTEED despite T2 throwing
        // The thrown Execute is hardened into an 'Error' result (never left 'Running').
        const t2 = result.testResults.find(r => r.testName === 'T2');
        expect(t2?.status).toBe('Error');
    });

    it('runs TeardownSuite when an Execute returns Timeout', async () => {
        const tests = fakeTests(['T1']);
        behavior.executeFor = async () => ({ ...passResult(), status: 'Timeout', score: 0 });
        const engine = wireEngine(tests);

        await engine.RunSuite(SUITE_ID, { verbose: false }, USER);

        expect(behavior.teardownCalls).toBe(1);
    });

    it('swallows a throw FROM TeardownSuite (RunSuite still resolves, updateSuiteRun still runs)', async () => {
        const tests = fakeTests(['T1']);
        behavior.teardownThrows = true;
        const engine = wireEngine(tests);
        const updateSuiteRunSpy = vi.spyOn(engine as unknown as EnginePrivates, 'updateSuiteRun');

        await expect(engine.RunSuite(SUITE_ID, { verbose: false }, USER)).resolves.toBeDefined();

        expect(behavior.teardownCalls).toBe(1);
        expect(updateSuiteRunSpy).toHaveBeenCalledTimes(1); // ran despite the teardown throw
    });

    it('gives each suite run a FRESH fixture context (no leak through the cached driver)', async () => {
        const engine = wireEngine(fakeTests(['T1']));
        await engine.RunSuite(SUITE_ID, { verbose: false }, USER);
        await engine.RunSuite(SUITE_ID, { verbose: false }, USER);

        // Each SetupSuite must observe an EMPTY CreatedRecords — even though the stub pushed a
        // record on the prior run. A leak would show the second run starting at 1.
        expect(behavior.setupSeenCreatedRecords).toEqual([0, 0]);
        expect(behavior.setupCalls).toBe(2);
        expect(behavior.teardownCalls).toBe(2);
    });
});
