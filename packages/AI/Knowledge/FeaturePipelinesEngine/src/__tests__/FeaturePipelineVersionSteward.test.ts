import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityInfo, UserInfo, type IMetadataProvider, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import { MJActionEntity, MJRecordProcessEntity, type MJProcessRunEntity, type MJTestRunEntity } from '@memberjunction/core-entities';
import { RunActionParams } from '@memberjunction/actions-base';
import type { DataFeatureSpec } from '@memberjunction/feature-pipelines';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';

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
vi.mock('../processors/InferProcessor', () => ({
    InferProcessor: { FromRecordProcess: fromRecordProcess },
}));
vi.mock('@memberjunction/record-set-processor', () => ({
    RecordProcessExecutor: class { public RunByID = runByID; },
}));
vi.mock('@memberjunction/testing-engine', () => ({
    TestEngine: { Instance: { Config: testConfig, GetTestByID: () => ({ __mj_UpdatedAt: testUpdatedAt.Current }), RunTest: runTest } },
}));
import { FeaturePipelineVersionSteward } from '../steward/FeaturePipelineVersionSteward';
import { StewardFeaturePipelineVersionAction, type StewardFeaturePipelineActionContext } from '../actions/StewardFeaturePipelineVersionAction';

/** A `MJ: Record Processes` row whose identifying fields live in memory. */
class TestRecordProcess extends MJRecordProcessEntity {
    constructor(private readonly id: string) {
        super(new EntityInfo());
    }
    override get ID(): string { return this.id; }
    override get Name(): string { return `Pipeline ${this.id}`; }
    override get EntityID(): string { return 'ENT-1'; }
}

type TestRunRow = Pick<MJTestRunEntity, 'ID' | 'Status' | 'ErrorMessage'>;
type ProcessRunRow = Pick<MJProcessRunEntity, 'ID' | 'StartTime' | '__mj_UpdatedAt'>;
type ReadRow = MJRecordProcessEntity | TestRunRow | ProcessRunRow;

/** The steward's reads: Record Processes, Test Runs and running Process Runs from memory; every read is recorded. */
class StewardReadProvider extends EntitiesOnlyProvider {
    public RecordProcesses: MJRecordProcessEntity[] = [];
    public TestRuns: TestRunRow[] = [];
    public RunningProcessRuns: ProcessRunRow[] = [];
    public readonly Views: RunViewParams[] = [];
    constructor() {
        super([]);
    }
    public Answer(params: RunViewParams): RunViewResult<ReadRow> {
        this.Views.push(params);
        const rows: ReadRow[] = params.EntityName === 'MJ: Record Processes' ? this.RecordProcesses
            : params.EntityName === 'MJ: Process Runs' ? this.RunningProcessRuns : this.TestRuns;
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
afterEach(() => {
    vi.useRealTimers();
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
        expect(runByID.mock.calls[0][1]).toMatchObject({ TriggeredBy: 'OnDemand', Scope: { Kind: 'records', RecordIDs: ['r1', 'r2'] }, ScheduledJobRunID: 'SJR-1', Provider: provider });
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
        expect(resolveRunPin.mock.calls[0][0]).toMatchObject({ RecordProcessID: 'RP-1', EntityID: 'ENT-1', DryRun: true, Provider: provider });
        expect(plan.mock.calls[0][0]).toMatchObject({ RecordProcessID: 'RP-1', Pin: { PromptVersionHash: 'h' }, ...spec, Provider: provider });
    });

    it('evaluates a version once: at most once per pass, and not again after an earlier run for it', async () => {
        plan.mockResolvedValue({ Kind: 'evaluate', Version: 2, GoldenSetTestID: 'T-1', Since: new Date('2026-10-01T00:00:00Z') });
        runTest.mockResolvedValue({ testRunId: 'TR-1', status: 'Failed' });
        expect((await steward.RunOnce({ ContextUser: user, Provider: provider })).map((o) => o.Action)).toEqual(['evaluated', 'held']);
        expect(runTest).toHaveBeenCalledTimes(1);
        provider.TestRuns = [{ ID: 'TR-0', Status: 'Error', ErrorMessage: 'Golden set labels failed the label-quality check: …' }];
        const out = await steward.RunOnce({ ContextUser: user, Provider: provider });
        expect(out).toMatchObject([{ Action: 'held', TestRunID: 'TR-0', Detail: expect.stringContaining('TR-0') }]);
        expect(runTest).toHaveBeenCalledTimes(1);
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

    // a failed backfill is marked done only when its run attempted every named record; otherwise the next pass reruns it
    it.each([
        ['failed before any record', 'error', ['r1'], { Processed: 0 }],
        ['attempted every record (one failed, one skipped)', 'error', ['r1', 'r2'], { Processed: 2, Success: 0, Error: 1, Skipped: 1 }],
        ['stopped after one of two records', 'error', ['r1', 'r2'], { Processed: 1, Success: 0, Error: 1 }],
        ['had no records, only the version to activate', 'error', [], { Total: 0, Processed: 0, Success: 0 }],
    ])('a failed backfill run that %s ends as %s', async (_case, action: string, recordIDs: string[], counts: Partial<typeof completedRun>) => {
        plan.mockResolvedValue({ Kind: 'backfill', Version: 2, RecordIDs: recordIDs });
        runByID.mockResolvedValue({ ...completedRun, ...counts, Status: 'Failed', ErrorMessage: 'version refused' });
        expect(await steward.RunOnce({ ContextUser: user, Provider: provider })).toMatchObject([{ Action: action, ProcessRunID: 'PR-1' }]);
        expect(markBackfilled).toHaveBeenCalledTimes(action === 'backfilled' ? 1 : 0);
    });

    it('marks the version backfilled only when no record failed; the failed ones are retried on the next pass', async () => {
        const recordIDs = Array.from({ length: 1308 }, (_v, i) => `r${i}`);
        plan.mockResolvedValue({ Kind: 'backfill', Version: 2, RecordIDs: recordIDs });
        runByID.mockResolvedValueOnce({ ProcessRunID: 'PR-1', Status: 'Failed', Total: 1308, Processed: 1308, Success: 1267, Error: 41, Skipped: 0 });
        expect(await steward.RunOnce({ ContextUser: user, Provider: provider })).toMatchObject([{
            Action: 'error', ProcessRunID: 'PR-1',
            Detail: 'backfill run Failed: 1308 processed, 41 failed, 0 skipped; 41 record(s) retried on the next pass',
        }]);
        expect(markBackfilled).not.toHaveBeenCalled();
        runByID.mockResolvedValueOnce({ ProcessRunID: 'PR-2', Status: 'Completed', Total: 41, Processed: 41, Success: 41, Error: 0, Skipped: 0 });
        expect(await steward.RunOnce({ ContextUser: user, Provider: provider })).toMatchObject([{ Action: 'backfilled', ProcessRunID: 'PR-2' }]);
        expect(markBackfilled).toHaveBeenCalledTimes(1);
    });

    it('defers a backfill while another run of the pipeline is still running, and starts one when none is', async () => {
        plan.mockResolvedValue({ Kind: 'backfill', Version: 2, RecordIDs: ['r1', 'r2'] });
        // checkpointed 5 minutes ago: the run is still making progress
        provider.RunningProcessRuns = [{ ID: 'PR-0', StartTime: new Date('2026-10-17T04:03:41Z'), __mj_UpdatedAt: new Date(Date.now() - 5 * 60_000) }];
        expect(await steward.RunOnce({ ContextUser: user, Provider: provider })).toMatchObject([{
            Action: 'held', Version: 2, ProcessRunID: 'PR-0',
            Detail: 'backfill deferred: Process Run PR-0 (started 2026-10-17T04:03:41.000Z) is still running',
        }]);
        expect(runByID).not.toHaveBeenCalled();
        expect(markBackfilled).not.toHaveBeenCalled();
        expect(provider.Views.find((v) => v.EntityName === 'MJ: Process Runs')).toMatchObject({
            ExtraFilter: "RecordProcessID='RP-1' AND Status='Running' AND DryRun=0", BypassCache: true, MaxRows: 1,
            Fields: ['ID', 'StartTime', '__mj_UpdatedAt'], OrderBy: '__mj_UpdatedAt DESC',
        });
        provider.RunningProcessRuns = [];
        runByID.mockResolvedValue(completedRun);
        expect((await steward.RunOnce({ ContextUser: user, Provider: provider })).map((o) => o.Action)).toEqual(['backfilled']);
        expect(runByID).toHaveBeenCalledTimes(1);
    });

    it('ignores a Running run not checkpointed for over 30 minutes (its server stopped), warning once, and backfills', async () => {
        // LogWarning writes through the error channel with a [WARNING] prefix, so it stays visible in production
        const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        plan.mockResolvedValue({ Kind: 'backfill', Version: 2, RecordIDs: ['r1', 'r2'] });
        provider.RunningProcessRuns = [{ ID: 'PR-STALE', StartTime: new Date('2026-10-16T01:00:00Z'), __mj_UpdatedAt: new Date(Date.now() - 45 * 60_000) }];
        runByID.mockResolvedValue(completedRun);
        expect(await steward.RunOnce({ ContextUser: user, Provider: provider })).toMatchObject([{ Action: 'backfilled', ProcessRunID: 'PR-1' }]);
        expect(runByID).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toContain('[WARNING]');
        expect(warn.mock.calls[0][0]).toContain('PR-STALE');
        warn.mockRestore();
    });

    it('renews the lease every minute while a backfill runs, however long its batches take, and stops after it', async () => {
        vi.useFakeTimers();
        plan.mockResolvedValue({ Kind: 'backfill', Version: 2, RecordIDs: ['r1', 'r2'] });
        // one batch of ten minutes: the executor reports no progress until it ends
        runByID.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(completedRun), 10 * 60_000)));
        const heartbeat = vi.fn();
        const pass = steward.RunOnce({ ContextUser: user, Provider: provider, Heartbeat: heartbeat });
        for (let minute = 1; minute <= 10; minute++) {
            await vi.advanceTimersByTimeAsync(60_000);
            expect(heartbeat.mock.calls.length).toBeGreaterThanOrEqual(minute);
        }
        expect((await pass).map((o) => o.Action)).toEqual(['backfilled']);
        const afterPass = heartbeat.mock.calls.length;
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        expect(heartbeat).toHaveBeenCalledTimes(afterPass);
        expect(vi.getTimerCount()).toBe(0);
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

describe('FeaturePipelineVersionSteward.StewardPipelineByID & StewardFeaturePipelineVersionAction', () => {
    function buildActionParams(recordProcessID: string | undefined, p: IMetadataProvider = provider): RunActionParams<StewardFeaturePipelineActionContext> {
        const params = new RunActionParams<StewardFeaturePipelineActionContext>();
        params.Action = new MJActionEntity(new EntityInfo());
        params.ContextUser = user;
        params.Filters = [];
        params.Params = recordProcessID !== undefined ? [{ Name: 'RecordProcessID', Value: recordProcessID, Type: 'Input' }] : [];
        params.Context = { Provider: p };
        return params;
    }

    it('stewards a single pipeline by ID and populates action output params', async () => {
        plan.mockResolvedValue({ Kind: 'backfill', Version: 2, RecordIDs: ['r1', 'r2'] });
        runByID.mockResolvedValue(completedRun);
        const action = new StewardFeaturePipelineVersionAction();
        const params = buildActionParams('RP-1');
        const result = await action.Run(params);
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(provider.Views[0]).toMatchObject({
            EntityName: 'MJ: Record Processes',
            ExtraFilter: "ID='RP-1' AND WorkType='Infer' AND Status='Active'",
        });
        expect(params.Params?.find((p) => p.Name === 'Version')?.Value).toBe(2);
        expect(params.Params?.find((p) => p.Name === 'LastAction')?.Value).toBe('backfilled');
        expect(params.Params?.find((p) => p.Name === 'Outcomes')?.Value).toMatchObject([{ RecordProcessID: 'RP-1', Action: 'backfilled' }]);
    });

    it('fails with STEWARD_ERROR when the pipeline errors or is not found', async () => {
        plan.mockRejectedValue(new Error('boom'));
        const action = new StewardFeaturePipelineVersionAction();
        const result = await action.Run(buildActionParams('RP-1'));
        expect(result).toMatchObject({ Success: false, ResultCode: 'STEWARD_ERROR', Message: 'Pipeline RP-1: error — boom' });

        provider.RecordProcesses = [];
        const missing = await action.Run(buildActionParams('RP-MISSING'));
        expect(missing).toMatchObject({
            Success: false,
            ResultCode: 'STEWARD_ERROR',
            Message: "RP-MISSING: error — Active Infer Record Process 'RP-MISSING' not found",
        });
    });

    it('fails with MISSING_PARAMETERS when RecordProcessID is omitted', async () => {
        const action = new StewardFeaturePipelineVersionAction();
        const result = await action.Run(buildActionParams(undefined));
        expect(result).toMatchObject({ Success: false, ResultCode: 'MISSING_PARAMETERS', Message: 'RecordProcessID is required' });
    });
});
