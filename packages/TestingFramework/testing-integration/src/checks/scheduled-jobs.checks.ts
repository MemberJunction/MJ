/**
 * scheduled-jobs.checks.ts — the 'scheduled-jobs' bundle (SJ1–SJ2): live integration checks for the
 * Scheduled Jobs engine's run lifecycle + distributed lease. Graduated verbatim from
 * integration-test-scripts/scheduled-jobs-tests.ts.
 *
 * A real `MJ: Scheduled Jobs` row (pointed at a missing Record Process so its driver fails fast +
 * deterministically) is run through SchedulingEngine.Instance; what we assert is the ENGINE's contract:
 *   - SJ1: ExecuteScheduledJob persists a terminal MJ: Scheduled Job Run and increments the job's stats
 *   - SJ2: the distributed lock is RELEASED after the run (LockToken/ExpectedCompletionAt cleared) so
 *          the job is immediately re-runnable — and a second run increments RunCount again
 *
 * Deterministic (no model calls). The bundle lifecycle creates the Scheduled Job fixture once and
 * tears it down (with the Scheduled Job Runs the checks create) afterwards.
 */
import { RunView } from '@memberjunction/core';
import { MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { SchedulingEngine } from '@memberjunction/scheduling-engine';
import { Assert, AssertEqual, settle } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

const TERMINAL = new Set(['Completed', 'Failed', 'Cancelled']);
const JOB_NAME = 'mj-integration-test-job (safe to delete)';

/** Fetch the fixture (thrown if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext) {
    Assert(ctx.ScheduledJobsFixture != null, 'scheduled-jobs fixture missing (bundle Setup did not run)');
    return ctx.ScheduledJobsFixture!;
}

export const ScheduledJobsChecks: NamedCheck[] = [
    {
        Id: 'scheduled-jobs.SJ1',
        Name: 'SJ1: ExecuteScheduledJob persists a terminal Scheduled Job Run + increments job stats',
        Fn: async (ctx: IntegrationCheckContext) => {
            const job = fx(ctx).Job;
            const engine = SchedulingEngine.Instance;
            const run = await engine.ExecuteScheduledJob(job.ID, ctx.User);
            Assert(!!run?.ID, 'no Scheduled Job Run was created');
            Assert(TERMINAL.has(run.Status), `run did not reach a terminal status (got '${run.Status}')`);
            Assert(run.CompletedAt != null, 'run CompletedAt was not set');

            await job.Load(job.ID);
            AssertEqual(job.RunCount, 1, 'job RunCount after one execution');
            Assert(job.LastRunAt != null, 'job LastRunAt was not set');
            console.log(`      → run ${run.ID}: Status=${run.Status}, job RunCount=${job.RunCount}`);
        }
    },
    {
        Id: 'scheduled-jobs.SJ2',
        Name: 'SJ2: the distributed lock is released after a run, and the job is immediately re-runnable',
        Fn: async (ctx: IntegrationCheckContext) => {
            const job = fx(ctx).Job;
            const engine = SchedulingEngine.Instance;
            await job.Load(job.ID);
            Assert(job.LockToken == null, `LockToken was not released after the run (still '${job.LockToken}')`);
            Assert(job.ExpectedCompletionAt == null, 'ExpectedCompletionAt (lease) was not cleared after the run');

            // A second execution must acquire the (now-free) lock, run, and bump RunCount to 2.
            await settle(200);
            const run2 = await engine.ExecuteScheduledJob(job.ID, ctx.User);
            Assert(TERMINAL.has(run2.Status), `second run not terminal (got '${run2.Status}')`);
            await job.Load(job.ID);
            AssertEqual(job.RunCount, 2, 'RunCount after a second execution (lock was reusable)');
            Assert(job.LockToken == null, 'LockToken not released after the second run');
            console.log(`      → re-ran cleanly: RunCount=${job.RunCount}, lock released both times`);
        }
    }
];

for (const check of ScheduledJobsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('scheduled-jobs', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const engine = SchedulingEngine.Instance;
        await engine.Config(true, ctx.User);
        const jobType = engine.ScheduledJobTypes.find((t) => t.Name === 'Run Record Process') ?? engine.ScheduledJobTypes[0];
        Assert(!!jobType, 'No scheduled job types are seeded in this database');

        const md = ctx.Provider;
        const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', ctx.User);
        job.NewRecord();
        job.Name = JOB_NAME;
        job.JobTypeID = jobType!.ID;
        job.CronExpression = '0 * * * * *';
        job.Timezone = 'UTC';
        job.Status = 'Active';
        job.NextRunAt = new Date();
        job.ConcurrencyMode = 'Skip';
        // Point at a non-existent Record Process: the driver fails fast + deterministically, which is all we
        // need — the engine's lease + run-lifecycle + stats contract runs identically on success or failure.
        job.Configuration = JSON.stringify({ RecordProcessID: '00000000-0000-0000-0000-000000000000' });
        Assert(await job.Save(), `creating the test scheduled job failed: ${job.LatestResult?.CompleteMessage}`);
        // Publish the fixture handle IMMEDIATELY after the save — before the throwable Config refresh
        // below — so a crash there can never orphan the just-created job; Teardown always sweeps it.
        ctx.ScheduledJobsFixture = { Job: job };
        await engine.Config(true, ctx.User); // make the engine aware of the new job
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        if (!ctx.ScheduledJobsFixture) {
            return;
        }
        const user = ctx.User;
        const job = ctx.ScheduledJobsFixture.Job;
        // Cleanup: delete the runs (FK to job) then the job itself.
        const runs = await new RunView().RunView<MJScheduledJobRunEntity>(
            { EntityName: 'MJ: Scheduled Job Runs', ExtraFilter: `ScheduledJobID='${job.ID}'`, ResultType: 'entity_object' }, user,
        );
        for (const r of runs.Results ?? []) {
            await r.Delete().catch(() => undefined);
        }
        await job.Delete().catch(() => undefined);
        ctx.ScheduledJobsFixture = undefined;
    }
});
