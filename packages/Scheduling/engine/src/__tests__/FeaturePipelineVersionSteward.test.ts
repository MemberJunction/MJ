import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo, UserInfo, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import { MJRecordProcessEntity, MJScheduledJobEntity, MJScheduledJobRunEntity, type MJTestRunEntity } from '@memberjunction/core-entities';
import type { DataFeatureSpec } from '@memberjunction/feature-pipelines';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import type { ScheduledJobExecutionContext } from '../BaseScheduledJob';

const { plan, markBackfilled, runTest, runByID, resolveRunPin, testConfig, fromRecordProcess, pipelineSpec, testUpdatedAt } = vi.hoisted(() => ({
    plan: vi.fn(),
    markBackfilled: vi.fn(),
    runTest: vi.fn(),
    runByID: vi.fn(),
    resolveRunPin: vi.fn(),
    testConfig: vi.fn(),
    fromRecordProcess: vi.fn(),
    pipelineSpec: { Current: {} },
    testUpdatedAt: { Current: new Date('2026-09-01T00:00:00Z') },
}));
vi.mock('@memberjunction/feature-pipelines', () => ({
    FeaturePipelineVersionService: { Instance: { PlanUnattended: plan, MarkBackfilled: markBackfilled } },
}));
vi.mock('@memberjunction/record-set-processor', () => ({
    InferProcessor: { FromRecordProcess: fromRecordProcess },
    RecordProcessExecutor: class { public RunByID = runByID; },
}));
vi.mock('@memberjunction/testing-engine', () => ({
    TestEngine: { Instance: { Config: testConfig, GetTestByID: () => ({ __mj_UpdatedAt: testUpdatedAt.Current }), RunTest: runTest } },
}));
import { FeaturePipelineVersionSteward, type StewardOutcome } from '../FeaturePipelineVersionSteward';
import { FeaturePipelineVersionStewardDriver } from '../drivers/FeaturePipelineVersionStewardDriver';

/** A `MJ: Record Processes` row whose identifying fields live in memory. */
class TestRecordProcess extends MJRecordProcessEntity {
    constructor(private readonly id: string) {
        super(new EntityInfo());
    }
    override get ID(): string { return this.id; }
    override get Name(): string { return `Pipeline ${this.id}`; }
    override get EntityID(): string { return 'ENT-1'; }
}

/** A scheduled job whose Configuration lives in memory. */
class TestStewardJob extends MJScheduledJobEntity {
    constructor(private configuration: string | null) {
        super(new EntityInfo());
    }
    override get Name(): string { return 'Feature Pipeline Version Steward'; }
    override get Configuration(): string | null { return this.configuration; }
    override set Configuration(value: string | null) { this.configuration = value; }
}

/** A scheduled-job run with an in-memory ID. */
class TestStewardJobRun extends MJScheduledJobRunEntity {
    constructor() {
        super(new EntityInfo());
    }
    override get ID(): string { return 'SJR-1'; }
}

type TestRunRow = Pick<MJTestRunEntity, 'ID' | 'Status' | 'ErrorMessage'>;

/** The steward's reads: Record Processes and Test Runs from memory; every read is recorded. */
class StewardReadProvider extends EntitiesOnlyProvider {
    public RecordProcesses: MJRecordProcessEntity[] = [];
    public TestRuns: TestRunRow[] = [];
    public readonly Views: RunViewParams[] = [];
    constructor() {
        super([]);
    }
    public Answer(params: RunViewParams): RunViewResult<MJRecordProcessEntity | TestRunRow> {
        this.Views.push(params);
        const rows: Array<MJRecordProcessEntity | TestRunRow> = params.EntityName === 'MJ: Record Processes' ? this.RecordProcesses : this.TestRuns;
        return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' };
    }
}

const user = new UserInfo(undefined, { ID: 'u', Name: 'Steward', Email: 'steward@example.com' });
let provider: StewardReadProvider;
const steward = FeaturePipelineVersionSteward.Instance;
const completedRun = { ProcessRunID: 'PR-1', Status: 'Completed', Total: 2, Processed: 2, Success: 2, Error: 0, Skipped: 0 };

beforeEach(() => {
    vi.clearAllMocks();
    plan.mockReset();
    runTest.mockReset();
    runByID.mockReset();
    pipelineSpec.Current = {};
    testUpdatedAt.Current = new Date('2026-09-01T00:00:00Z');
    fromRecordProcess.mockImplementation(() => ({ Spec: pipelineSpec.Current, ResolveRunPin: resolveRunPin }));
    resolveRunPin.mockResolvedValue({ PromptID: 'P', PromptVersionHash: 'h', AIModelID: 'M', ParametersHash: 'x', SpecHash: 's' });
    provider = new StewardReadProvider();
    provider.RecordProcesses = [new TestRecordProcess('RP-1')];
    vi.spyOn(provider, 'RunView').mockImplementation(async (params: RunViewParams) => provider.Answer(params));
});

describe('FeaturePipelineVersionSteward.RunOnce', () => {
    it('evaluates, re-plans and backfills in one pass, and marks the version backfilled', async () => {
        plan.mockResolvedValueOnce({ Kind: 'evaluate', Version: 2, GoldenSetTestID: 'T-1', Since: new Date('2026-10-01T00:00:00Z') })
            .mockResolvedValueOnce({ Kind: 'backfill', Version: 2, RecordIDs: ['r1', 'r2'] });
        runTest.mockResolvedValue({ testRunId: 'TR-1', status: 'Passed' });
        runByID.mockResolvedValue(completedRun);
        const out = await steward.RunOnce({ ContextUser: user, Provider: provider, ScheduledJobRunID: 'SJR-1' });
        expect(out.map((o) => o.Action)).toEqual(['evaluated', 'backfilled']);
        expect(out[0].TestRunID).toBe('TR-1');
        expect(out[1].ProcessRunID).toBe('PR-1');
        expect(runByID.mock.calls[0][0]).toBe('RP-1');
        expect(runByID.mock.calls[0][1]).toMatchObject({ triggeredBy: 'OnDemand', scope: { Kind: 'records', RecordIDs: ['r1', 'r2'] }, scheduledJobRunID: 'SJR-1', provider });
        // every named record is re-derived: a watermark written before the version changed must not skip it
        expect(runByID.mock.calls[0][1].SkipUnchanged).toBe(false);
        expect(markBackfilled).toHaveBeenCalledWith('RP-1', 2, user, provider);
        // one processor per pipeline per pass: its lookup constraints are read once, not once per plan
        expect(fromRecordProcess).toHaveBeenCalledTimes(1);
        expect(resolveRunPin).toHaveBeenCalledTimes(2);
    });

    it('plans each Active Infer pipeline with its current pin, gate and opt-outs', async () => {
        const spec: Pick<DataFeatureSpec, 'Activation' | 'Unattended'> = {
            Activation: { GoldenSetTestID: 'T-1', Metric: 'accuracy', Threshold: 0.9 }, Unattended: { AutoBackfill: false },
        };
        pipelineSpec.Current = spec;
        plan.mockResolvedValue({ Kind: 'none', Version: 1 });
        await steward.RunOnce({ ContextUser: user, Provider: provider });
        expect(provider.Views[0]).toMatchObject({ EntityName: 'MJ: Record Processes', ExtraFilter: "WorkType='Infer' AND Status='Active'" });
        expect(resolveRunPin.mock.calls[0][0]).toMatchObject({ recordProcessID: 'RP-1', entityID: 'ENT-1', DryRun: true, provider });
        expect(plan.mock.calls[0][0]).toMatchObject({ RecordProcessID: 'RP-1', Pin: { PromptVersionHash: 'h' }, ...spec, Provider: provider });
    });

    it('limits the pass to the pipelines it is given', async () => {
        plan.mockResolvedValue({ Kind: 'none', Version: 1 });
        await steward.RunOnce({ ContextUser: user, Provider: provider, RecordProcessIDs: ['RP-1', "R'2"] });
        expect(provider.Views[0].ExtraFilter).toBe("WorkType='Infer' AND Status='Active' AND ID IN ('RP-1','R''2')");
    });

    it('does not re-run an evaluation that already ran for this version and golden set', async () => {
        plan.mockResolvedValue({ Kind: 'evaluate', Version: 2, GoldenSetTestID: 'T-1', Since: new Date('2026-10-01T00:00:00Z') });
        provider.TestRuns = [{ ID: 'TR-0', Status: 'Error', ErrorMessage: 'Golden set labels failed the label-quality check: …' }];
        const out = await steward.RunOnce({ ContextUser: user, Provider: provider });
        expect(out).toMatchObject([{ Action: 'held', TestRunID: 'TR-0', Detail: expect.stringContaining('TR-0') }]);
        expect(runTest).not.toHaveBeenCalled();
    });

    it('counts a run of the test as this evaluation only from the later of the version\'s date and the test\'s last change', async () => {
        plan.mockResolvedValue({ Kind: 'evaluate', Version: 2, GoldenSetTestID: "T'1", Since: new Date('2026-10-01T00:00:00Z') });
        provider.TestRuns = [{ ID: 'TR-0', Status: 'Failed', ErrorMessage: null }];
        await steward.RunOnce({ ContextUser: user, Provider: provider });
        testUpdatedAt.Current = new Date('2026-10-10T00:00:00Z'); // the golden set changed after the version was registered
        await steward.RunOnce({ ContextUser: user, Provider: provider });
        const testRunReads = provider.Views.filter((v) => v.EntityName === 'MJ: Test Runs');
        expect(testRunReads.map((v) => v.ExtraFilter)).toEqual([
            "TestID='T''1' AND StartedAt >= '2026-10-01T00:00:00.000Z'",
            "TestID='T''1' AND StartedAt >= '2026-10-10T00:00:00.000Z'",
        ]);
        expect(testRunReads[0]).toMatchObject({ OrderBy: 'StartedAt DESC', MaxRows: 1 });
    });

    it('evaluates at most once per pass', async () => {
        plan.mockResolvedValue({ Kind: 'evaluate', Version: 2, GoldenSetTestID: 'T-1', Since: new Date('2026-10-01T00:00:00Z') });
        runTest.mockResolvedValue({ testRunId: 'TR-1', status: 'Failed' });
        const out = await steward.RunOnce({ ContextUser: user, Provider: provider });
        expect(runTest).toHaveBeenCalledTimes(1);
        expect(out.map((o) => o.Action)).toEqual(['evaluated', 'held']);
    });

    it('records held and refused plans without running anything', async () => {
        provider.RecordProcesses = [new TestRecordProcess('RP-1'), new TestRecordProcess('RP-2')];
        plan.mockResolvedValueOnce({ Kind: 'held', Version: 3, Message: 'AutoBackfill is false' })
            .mockResolvedValueOnce({ Kind: 'refused', Version: 4, Message: 'v4 was refused activation' });
        const out = await steward.RunOnce({ ContextUser: user, Provider: provider });
        expect(out).toMatchObject([{ Action: 'held', Version: 3, Detail: 'AutoBackfill is false' }, { Action: 'refused', Version: 4 }]);
        expect(runByID).not.toHaveBeenCalled();
        expect(runTest).not.toHaveBeenCalled();
    });

    it('records a pipeline with nothing to do as none', async () => {
        plan.mockResolvedValue({ Kind: 'none', Version: 1 });
        expect(await steward.RunOnce({ ContextUser: user, Provider: provider })).toMatchObject([{ RecordProcessID: 'RP-1', Action: 'none', Version: 1 }]);
    });

    it('does not mark a backfill done when its run failed, so the next pass runs it again', async () => {
        plan.mockResolvedValue({ Kind: 'backfill', Version: 2, RecordIDs: ['r1'] });
        runByID.mockResolvedValue({ ...completedRun, Status: 'Failed', Processed: 0, ErrorMessage: 'version refused' });
        const out = await steward.RunOnce({ ContextUser: user, Provider: provider });
        expect(out).toMatchObject([{ Action: 'error', ProcessRunID: 'PR-1', Detail: expect.stringContaining('version refused') }]);
        expect(markBackfilled).not.toHaveBeenCalled();
    });

    it('marks a backfill done when its run failed only after attempting every named record', async () => {
        plan.mockResolvedValue({ Kind: 'backfill', Version: 2, RecordIDs: ['r1', 'r2'] });
        // a run with a failed record ends Failed; it still handed both records (one skipped) to the processor
        runByID.mockResolvedValue({ ...completedRun, Status: 'Failed', Processed: 2, Success: 0, Error: 1, Skipped: 1, ErrorMessage: '1 record failed' });
        expect(await steward.RunOnce({ ContextUser: user, Provider: provider })).toMatchObject([{ Action: 'backfilled' }]);
        expect(markBackfilled).toHaveBeenCalledWith('RP-1', 2, user, provider);
        markBackfilled.mockClear();
        // stopped after one of the two (its error-rate breaker): retried
        runByID.mockResolvedValue({ ...completedRun, Status: 'Failed', Processed: 1, Success: 0, Error: 1, Skipped: 0 });
        expect(await steward.RunOnce({ ContextUser: user, Provider: provider })).toMatchObject([{ Action: 'error' }]);
        expect(markBackfilled).not.toHaveBeenCalled();
    });

    it('retries a failed backfill of no records, which only had to activate the version', async () => {
        plan.mockResolvedValue({ Kind: 'backfill', Version: 2, RecordIDs: [] });
        runByID.mockResolvedValue({ ...completedRun, Status: 'Failed', Total: 0, Processed: 0, Success: 0, ErrorMessage: 'version refused' });
        expect(await steward.RunOnce({ ContextUser: user, Provider: provider })).toMatchObject([{ Action: 'error' }]);
        expect(markBackfilled).not.toHaveBeenCalled();
    });

    it('records an evaluation that returned no result as an error, naming the test', async () => {
        plan.mockResolvedValue({ Kind: 'evaluate', Version: 2, GoldenSetTestID: 'T-1', Since: new Date('2026-10-01T00:00:00Z') });
        runTest.mockResolvedValue([]);
        expect(await steward.RunOnce({ ContextUser: user, Provider: provider })).toMatchObject([{ Action: 'error', Detail: 'Golden-set test T-1 returned no result' }]);
    });

    it('keeps going when one pipeline throws', async () => {
        provider.RecordProcesses = [new TestRecordProcess('RP-1'), new TestRecordProcess('RP-2')];
        plan.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ Kind: 'none', Version: 1 });
        const heartbeat = vi.fn();
        const out = await steward.RunOnce({ ContextUser: user, Provider: provider, Heartbeat: heartbeat });
        expect(out.map((o) => [o.RecordProcessID, o.Action])).toEqual([['RP-1', 'error'], ['RP-2', 'none']]);
        expect(out[0]).toMatchObject({ Version: null, Detail: 'boom' });
        expect(heartbeat).toHaveBeenCalledTimes(2);
    });
});

describe('FeaturePipelineVersionStewardDriver', () => {
    const context = (configuration: string | null): ScheduledJobExecutionContext => ({
        Schedule: new TestStewardJob(configuration), Run: new TestStewardJobRun(), ContextUser: user, Provider: provider,
    });
    const driver = new FeaturePipelineVersionStewardDriver();

    it('runs the pass on the provider the engine read the job with, limited by the job\'s Configuration', async () => {
        plan.mockResolvedValue({ Kind: 'none', Version: 1 });
        const result = await driver.Execute(context(JSON.stringify({ RecordProcessIDs: ['RP-1'] })));
        expect(result).toMatchObject({ Success: true, Details: { Outcomes: [{ RecordProcessID: 'RP-1', Action: 'none' }] } });
        expect(provider.Views[0].ExtraFilter).toContain("ID IN ('RP-1')");
        expect(plan.mock.calls[0][0].Provider).toBe(provider);
    });

    it('runs every pipeline when the job has no Configuration', async () => {
        plan.mockResolvedValue({ Kind: 'none', Version: 1 });
        expect((await driver.Execute(context(null))).Success).toBe(true);
        expect(provider.Views[0].ExtraFilter).toBe("WorkType='Infer' AND Status='Active'");
    });

    it('fails the run, naming each pipeline that errored', async () => {
        plan.mockRejectedValue(new Error('boom'));
        expect(await driver.Execute(context('{}'))).toMatchObject({ Success: false, ErrorMessage: 'Pipeline RP-1: boom' });
    });

    it('validates RecordProcessIDs as an array of IDs', () => {
        expect(driver.ValidateConfiguration(new TestStewardJob('{}')).Success).toBe(true);
        expect(driver.ValidateConfiguration(new TestStewardJob(null)).Success).toBe(true);
        expect(driver.ValidateConfiguration(new TestStewardJob(JSON.stringify({ RecordProcessIDs: ['RP-1'] }))).Success).toBe(true);
        expect(driver.ValidateConfiguration(new TestStewardJob(JSON.stringify({ RecordProcessIDs: 'RP-1' }))).Errors[0].Source).toBe('Configuration.RecordProcessIDs');
        expect(driver.ValidateConfiguration(new TestStewardJob(JSON.stringify({ RecordProcessIDs: [7] }))).Success).toBe(false);
        expect(driver.ValidateConfiguration(new TestStewardJob('{not json')).Errors[0].Source).toBe('Configuration');
    });

    it('notifies the actions taken, and ignores Details it cannot read', () => {
        const outcomes: StewardOutcome[] = [
            { RecordProcessID: 'RP-1', Name: 'Job titles', Version: 2, Action: 'backfilled', Detail: 'backfill run Completed: 2 processed, 0 failed, 0 skipped' },
            { RecordProcessID: 'RP-2', Name: 'Other', Version: 1, Action: 'none', Detail: 'nothing to do' },
        ];
        const n = driver.FormatNotification(context('{}'), { Success: true, Details: { Outcomes: outcomes } });
        expect(n).toMatchObject({ Subject: 'Feature Pipeline Version Steward: 1 action(s)', Body: 'Job titles v2: backfilled — backfill run Completed: 2 processed, 0 failed, 0 skipped', Priority: 'Low' });
        const unreadable = driver.FormatNotification(context('{}'), { Success: false, Details: { Outcomes: [{ Action: 7 }, 'x'] } });
        expect(unreadable).toMatchObject({ Subject: 'Feature Pipeline Version Steward: errors', Body: 'No version changes.', Priority: 'High' });
    });
});
