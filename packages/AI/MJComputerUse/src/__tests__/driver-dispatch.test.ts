import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MJTestEntity, MJTestEntity_ITestConfiguration } from '@memberjunction/core-entities';
import { ComputerUseTrace, ComputerUseResult, ReplayInfo, hashGoal } from '@memberjunction/computer-use';
import { ComputerUseTestDriver } from '../test-driver/ComputerUseTestDriver.js';
import { MJComputerUseEngine } from '../engine/MJComputerUseEngine.js';
import type { DriverExecutionContext } from '@memberjunction/testing-engine';
import { MJRunComputerUseParams } from '../types/mj-params.js';
import { ComputerUseTestConfig, ComputerUseTestInput } from '../test-driver/types.js';
import { loadScript } from '../test-driver/script-store.js';

/**
 * `dispatchRun` and `maybeRecordScript` are where the replay tier's promises are
 * actually kept: which tier runs, whether the model is consulted after a
 * divergence, and what — if anything — is written back to the test row. They had
 * no coverage, which is how a heal reached the promoted script unnoticed.
 *
 * Both are driven directly here with a stub engine, so nothing needs a browser,
 * a model, or a database.
 */

/** Records which legs ran, and what each returned. */
class StubEngine {
    public replayCalls = 0;
    public runCalls = 0;
    constructor(
        private readonly replayResult: ComputerUseResult,
        private readonly runResult: ComputerUseResult
    ) {}
    async Replay(_trace: ComputerUseTrace, _params: MJRunComputerUseParams): Promise<ComputerUseResult> {
        this.replayCalls++;
        return this.replayResult;
    }
    async Run(_params: MJRunComputerUseParams): Promise<ComputerUseResult> {
        this.runCalls++;
        return this.runResult;
    }
}

/** Exposes the two seams and silences the test-run log. */
class TestableDriver extends ComputerUseTestDriver {
    protected override logToTestRun(): void { /* no console/DB in unit tests */ }
    public dispatch(...args: Parameters<ComputerUseTestDriver['dispatchRun']>) {
        return this.dispatchRun(...args);
    }
    public record(...args: Parameters<ComputerUseTestDriver['maybeRecordScript']>) {
        return this.maybeRecordScript(...args);
    }
}

function result(status: string, opts: { diverged?: number; done?: boolean } = {}): ComputerUseResult {
    const r = new ComputerUseResult();
    r.Status = status as ComputerUseResult['Status'];
    r.Steps = [];
    r.FinalJudgeVerdict = { Done: opts.done ?? (status === 'Completed') } as ComputerUseResult['FinalJudgeVerdict'];
    if (opts.diverged !== undefined) {
        const info = new ReplayInfo();
        info.Diverged = opts.diverged;
        r.Replay = info;
    }
    return r;
}

/** The goal every fixture uses; the script's hash must match it or the tier falls to llm. */
const GOAL = 'log in';

function scriptJson(selector = '#old'): MJTestEntity_ITestConfiguration {
    return {
        ReplayScript: {
            TestId: 'test-1',
            GoalHash: hashGoal(GOAL),
            AppBuildHash: '',
            Steps: [{
                Instruction: 'click Save',
                UrlBefore: 'http://app/',
                Action: { Method: 'click', Target: { Role: 'button', Name: 'Save', Selector: selector } },
                Precondition: { WaitForTarget: true },
            }],
        },
    } as unknown as MJTestEntity_ITestConfiguration;
}

function fakeTest(config: MJTestEntity_ITestConfiguration | null): MJTestEntity {
    const entity = {
        ID: 'test-1',
        Name: 'T001 - Login Smoke',
        Configuration: config ? JSON.stringify(config) : null,
        _cached: undefined as MJTestEntity_ITestConfiguration | null | undefined,
        _lastRaw: undefined as string | null | undefined,
        get ConfigurationObject(): MJTestEntity_ITestConfiguration | null {
            if (this.Configuration !== this._lastRaw) {
                this._cached = this.Configuration ? JSON.parse(this.Configuration) : null;
                this._lastRaw = this.Configuration;
            }
            return this._cached!;
        },
        set ConfigurationObject(value: MJTestEntity_ITestConfiguration | null) {
            const raw = value ? JSON.stringify(value) : null;
            this.Configuration = raw;
            this._cached = value;
            this._lastRaw = raw;
        },
        Save: vi.fn(async () => true),
    };
    return entity as unknown as MJTestEntity;
}

/** Only the two members these seams touch; the rest of the context is unused here. */
const ctx = (test: MJTestEntity): DriverExecutionContext =>
    ({ test, testRun: { ID: 'run-1' } }) as unknown as DriverExecutionContext;
const params = (): MJRunComputerUseParams => {
    const p = new MJRunComputerUseParams();
    p.Goal = GOAL;
    return p;
};

let driver: TestableDriver;
beforeEach(() => { driver = new TestableDriver(); });

describe('dispatchRun tier selection', () => {
    it('runs the agent and never replays when the test has no script', async () => {
        const engine = new StubEngine(result('Completed'), result('Completed'));
        const out = await driver.dispatch(engine as unknown as MJComputerUseEngine, params(), {}, ctx(fakeTest(null)));

        expect(engine.replayCalls).toBe(0);
        expect(engine.runCalls).toBe(1);
        expect(out.tier).toBe('llm');
        expect(out.fellBackToLlm).toBe(false);
    });

    it('replays a stored script and does NOT call the model when replay completes', async () => {
        const engine = new StubEngine(result('Completed'), result('Completed'));
        const out = await driver.dispatch(engine as unknown as MJComputerUseEngine, params(), {}, ctx(fakeTest(scriptJson())));

        expect(engine.replayCalls).toBe(1);
        expect(engine.runCalls).toBe(0);
        expect(out.tier).toBe('replay-with-heal');
        expect(out.fellBackToLlm).toBe(false);
    });

    it('falls back to the model when replay diverges, reporting the tier that produced the result', async () => {
        const engine = new StubEngine(result('Failed', { diverged: 2 }), result('Completed'));
        const out = await driver.dispatch(engine as unknown as MJComputerUseEngine, params(), {}, ctx(fakeTest(scriptJson())));

        expect(engine.replayCalls).toBe(1);
        expect(engine.runCalls).toBe(1);
        expect(out.tier).toBe('llm');
        expect(out.fellBackToLlm).toBe(true);
        // The drift signal has to survive a green fallback, or a silently-stale
        // script looks identical to one that never needed healing.
        expect(out.replayInfo?.Diverged).toBe(2);
    });

    it('AllowLLMFallback:false reports the divergence and never calls the model', async () => {
        const config = { ...scriptJson(), AllowLLMFallback: false } as MJTestEntity_ITestConfiguration;
        const engine = new StubEngine(result('Failed', { diverged: 1 }), result('Completed'));
        const out = await driver.dispatch(engine as unknown as MJComputerUseEngine, params(), {}, ctx(fakeTest(config)));

        expect(engine.runCalls).toBe(0);
        expect(out.result.Status).toBe('Failed');
        expect(out.fellBackToLlm).toBe(false);
    });

    it('leaves the stored script untouched when replay mutates the trace it was given', async () => {
        const test = fakeTest(scriptJson('#old'));
        class MutatingEngine extends StubEngine {
            override async Replay(trace: ComputerUseTrace): Promise<ComputerUseResult> {
                // What a heal does: rewrite the selector in place.
                trace.Steps[0].Action.Target!.Selector = '#healed';
                return super.Replay(trace, params());
            }
        }
        const engine = new MutatingEngine(result('Completed'), result('Completed'));
        await driver.dispatch(engine as unknown as MJComputerUseEngine, params(), {}, ctx(test));

        expect(loadScript(test)!.Steps[0].Action.Target!.Selector).toBe('#old');
    });

    it('honours forceTier llm even when a script exists', async () => {
        const engine = new StubEngine(result('Completed'), result('Completed'));
        const config: ComputerUseTestConfig = { forceTier: 'llm' };
        const out = await driver.dispatch(engine as unknown as MJComputerUseEngine, params(), config, ctx(fakeTest(scriptJson())));

        expect(engine.replayCalls).toBe(0);
        expect(out.tier).toBe('llm');
    });
});

describe('maybeRecordScript gating', () => {
    /** A run shaped so isRecordableRun accepts it. */
    function recordable(): ComputerUseResult {
        const r = result('Completed', { done: true });
        r.Steps = [{
            StepNumber: 1,
            UrlBefore: 'http://app/',
            UrlAfter: 'http://app/data',
            ControllerReasoning: 'click Data',
            InteractiveElements: [{ Index: 0, Role: 'link', Name: 'Data', Selector: '#d' }],
            ActionResults: [{ Success: true, Action: { Type: 'ClickElement', Index: 0 } }],
            ToolCalls: [],
        }] as never;
        return r;
    }

    const recordArgs = (test: MJTestEntity, over: Record<string, unknown> = {}) => ({
        result: recordable(),
        status: 'Passed',
        gating: [],
        tier: 'llm' as const,
        fellBackToLlm: false,
        runParams: params(),
        input: { goal: 'log in' } as ComputerUseTestInput,
        variableValues: {},
        context: ctx(test),
        config: {} as ComputerUseTestConfig,
        ...over,
    }) as unknown as Parameters<TestableDriver['record']>[0];

    it('records a green LLM run into the promoted slot when there is no script yet', async () => {
        const test = fakeTest(null);
        await driver.record(recordArgs(test));
        expect(test.ConfigurationObject?.ReplayScript).toBeDefined();
        expect(test.ConfigurationObject?.PendingReplayScript).toBeUndefined();
    });

    it('does NOT record a completed replay — that would launder healed selectors in', async () => {
        const test = fakeTest(scriptJson());
        await driver.record(recordArgs(test, { tier: 'replay-with-heal', fellBackToLlm: false }));
        expect(test.ConfigurationObject?.PendingReplayScript).toBeUndefined();
        expect(test.ConfigurationObject?.ReplayScript?.Steps[0].Action.Target?.Selector).toBe('#old');
    });

    it('a green fallback lands in the PENDING slot, leaving the promoted script alone', async () => {
        const test = fakeTest(scriptJson());
        await driver.record(recordArgs(test, { tier: 'llm', fellBackToLlm: true }));
        expect(test.ConfigurationObject?.PendingReplayScript).toBeDefined();
        expect(test.ConfigurationObject?.ReplayScript?.Steps[0].Action.Target?.Selector).toBe('#old');
    });

    it('does not record a failing run', async () => {
        const test = fakeTest(null);
        await driver.record(recordArgs(test, { status: 'Failed' }));
        expect(test.ConfigurationObject?.ReplayScript).toBeUndefined();
    });

    it('does not record when a gating oracle failed', async () => {
        const test = fakeTest(null);
        await driver.record(recordArgs(test, { gating: [{ passed: false }] }));
        expect(test.ConfigurationObject?.ReplayScript).toBeUndefined();
    });

    it('does not record when the test opts out with recordReplayScript:false', async () => {
        const test = fakeTest(null);
        await driver.record(recordArgs(test, { config: { recordReplayScript: false } }));
        expect(test.ConfigurationObject?.ReplayScript).toBeUndefined();
    });
});
