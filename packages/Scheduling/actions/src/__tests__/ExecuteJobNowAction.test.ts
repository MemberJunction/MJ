/**
 * Tests for `Execute Scheduled Job Now`.
 *
 * The bug this action shipped with is the thing to defend against returning: it wrote a
 * `Status='Running'` run row and reported success, but nothing consumed those rows — the cron
 * poller selects jobs by *schedule*, never by pending run record. So the action claimed to work,
 * left a row that said Running forever, and ran nothing. Every test here is ultimately about that:
 * the action must reach the engine, and its result must reflect what the job actually did.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeScheduledJob = vi.fn();
const engineConfig = vi.fn();

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (_target: Function) => {},
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {},
}));

vi.mock('@memberjunction/scheduling-engine', () => ({
    SchedulingEngine: {
        get Instance() {
            return { Config: engineConfig, ExecuteScheduledJob: executeScheduledJob };
        },
    },
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class {},
    UserInfo: class {},
    RunView: class {},
    LogError: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
    MJScheduledJobRunEntity: class {},
}));

import { ExecuteScheduledJobNowAction } from '../ExecuteJobNowAction';
import type { RunActionParams } from '@memberjunction/actions-base';

type JobStub = { ID: string; Name: string; Status: string };

/** Drives the action while stubbing the one thing it inherits: loading the job row. */
class TestableAction extends ExecuteScheduledJobNowAction {
    constructor(private job: JobStub | null, private loadError: { Success: boolean; ResultCode: string; Message: string } | null = null) {
        super();
    }
    protected override async loadJob() {
        return this.loadError ? { job: null, error: this.loadError } : { job: this.job as never, error: null };
    }
    public Run(params: RunActionParams) {
        return this.InternalRunAction(params);
    }
}

const activeJob: JobStub = { ID: 'job-1', Name: 'Nightly sync', Status: 'Active' };

const params = (over: Array<{ Name: string; Value: unknown; Type?: string }> = []): RunActionParams => ({
    Params: [{ Name: 'JobID', Value: 'job-1', Type: 'Input' }, ...over],
    ContextUser: { ID: 'user-1' },
} as unknown as RunActionParams);

const completedRun = { ID: 'run-1', Status: 'Completed', ErrorMessage: null };

const outputs = (p: RunActionParams) =>
    Object.fromEntries(p.Params.filter((x) => x.Type === 'Output').map((x) => [x.Name, x.Value]));

beforeEach(() => {
    vi.clearAllMocks();
    engineConfig.mockResolvedValue(undefined);
    executeScheduledJob.mockResolvedValue(completedRun);
});

describe('it actually runs the job', () => {
    it('executes through the scheduling engine rather than writing a run row', async () => {
        const p = params();
        const result = await new TestableAction(activeJob).Run(p);

        expect(executeScheduledJob).toHaveBeenCalledWith('job-1', expect.anything());
        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
    });

    it('reports the real run ID and status as outputs', async () => {
        const p = params();
        await new TestableAction(activeJob).Run(p);
        expect(outputs(p)).toEqual({ RunID: 'run-1', RunStatus: 'Completed' });
    });

    it('configures the engine before asking it to run anything', async () => {
        await new TestableAction(activeJob).Run(params());
        expect(engineConfig).toHaveBeenCalled();
    });
});

describe('the result reflects what the job did', () => {
    it('fails the action when the job failed', async () => {
        // The whole point: success used to mean "a row was inserted", which was always true.
        executeScheduledJob.mockResolvedValue({ ID: 'run-2', Status: 'Failed', ErrorMessage: 'source unreachable' });

        const result = await new TestableAction(activeJob).Run(params());

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('JOB_FAILED');
        expect(result.Message).toContain('source unreachable');
    });

    it.each(['Cancelled', 'Timeout'])('treats a %s run as a failed action', async (status) => {
        executeScheduledJob.mockResolvedValue({ ID: 'run-3', Status: status, ErrorMessage: null });
        const result = await new TestableAction(activeJob).Run(params());
        expect(result.Success).toBe(false);
        expect(result.Message).toContain(status);
    });
});

describe('failures a caller can act on are named', () => {
    it('classifies lock contention as LOCKED, not a generic failure', async () => {
        // Actionable: the job is already running, so the caller should retry rather than debug.
        executeScheduledJob.mockRejectedValue(new Error('Could not acquire lock for job job-1 — held by another holder'));

        const result = await new TestableAction(activeJob).Run(params());

        expect(result.ResultCode).toBe('LOCKED');
        expect(result.Success).toBe(false);
    });

    it('classifies an unknown job as NOT_FOUND', async () => {
        executeScheduledJob.mockRejectedValue(new Error('Scheduled job job-1 not found or not active'));
        expect((await new TestableAction(activeJob).Run(params())).ResultCode).toBe('NOT_FOUND');
    });

    it('falls back to FAILED for anything else', async () => {
        executeScheduledJob.mockRejectedValue(new Error('database on fire'));
        const result = await new TestableAction(activeJob).Run(params());
        expect(result.ResultCode).toBe('FAILED');
        expect(result.Message).toContain('database on fire');
    });

    it('refuses a job that is not Active, without touching the engine', async () => {
        const result = await new TestableAction({ ...activeJob, Status: 'Paused' }).Run(params());
        expect(result.ResultCode).toBe('VALIDATION_ERROR');
        expect(executeScheduledJob).not.toHaveBeenCalled();
    });

    it('requires a JobID', async () => {
        const result = await new TestableAction(activeJob).Run({ Params: [], ContextUser: {} } as unknown as RunActionParams);
        expect(result.ResultCode).toBe('VALIDATION_ERROR');
        expect(executeScheduledJob).not.toHaveBeenCalled();
    });
});

describe('Wait=false', () => {
    it('returns STARTED without waiting for the job', async () => {
        let settle!: () => void;
        executeScheduledJob.mockReturnValue(new Promise<typeof completedRun>((r) => { settle = () => r(completedRun); }));

        const result = await new TestableAction(activeJob).Run(params([{ Name: 'Wait', Value: false, Type: 'Input' }]));

        expect(result.ResultCode).toBe('STARTED');
        expect(result.Success).toBe(true);
        expect(executeScheduledJob).toHaveBeenCalled();
        settle();
    });

    it('does not leave a rejected floating promise, which would take the process down', async () => {
        executeScheduledJob.mockRejectedValue(new Error('boom'));

        const result = await new TestableAction(activeJob).Run(params([{ Name: 'Wait', Value: false, Type: 'Input' }]));

        expect(result.ResultCode).toBe('STARTED');
        // Let the rejection land; an unhandled one fails the run.
        await new Promise((r) => setImmediate(r));
    });

    it('waits by default — an unqualified "run it now" wants the outcome', async () => {
        const result = await new TestableAction(activeJob).Run(params());
        expect(result.ResultCode).toBe('SUCCESS');
    });
});
