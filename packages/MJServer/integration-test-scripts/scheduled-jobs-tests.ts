/**
 * scheduled-jobs-tests.ts — live integration tests for the Scheduled Jobs engine.
 *
 * Exercises the engine's run lifecycle + distributed lease against a real database, independent of
 * what the job's driver actually does. We point a job at a missing Record Process so the driver fails
 * FAST and DETERMINISTICALLY — what we assert is the ENGINE's contract:
 *   - SJ1: ExecuteScheduledJob persists a terminal MJ: Scheduled Job Run and increments the job's stats
 *   - SJ2: the distributed lock is RELEASED after the run (LockToken/ExpectedCompletionAt cleared) so
 *          the job is immediately re-runnable — and a second run increments RunCount again
 *
 * Deterministic (no model calls). Creates + deletes its own job/run fixtures (try/finally cleanup).
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/scheduled-jobs-tests.ts
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI, settle } from './lib/ai-bootstrap';
import { Metadata, RunView } from '@memberjunction/core';
import { MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { SchedulingEngine } from '@memberjunction/scheduling-engine';

const TERMINAL = new Set(['Completed', 'Failed', 'Cancelled']);
const JOB_NAME = 'mj-integration-test-job (safe to delete)';

async function main(): Promise<void> {
    const { user } = await bootstrapAI();
    const suite = new TestRunner('Scheduled Jobs engine live integration (run lifecycle + distributed lease)');

    const engine = SchedulingEngine.Instance;
    await engine.Config(true, user);
    const jobType = engine.ScheduledJobTypes.find((t) => t.Name === 'Run Record Process') ?? engine.ScheduledJobTypes[0];
    Assert(!!jobType, 'No scheduled job types are seeded in this database');

    const md = new Metadata();
    const job = await md.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', user);
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
    await engine.Config(true, user); // make the engine aware of the new job

    let failures = 0;
    try {
        suite.Test('SJ1: ExecuteScheduledJob persists a terminal Scheduled Job Run + increments job stats', async () => {
            const run = await engine.ExecuteScheduledJob(job.ID, user);
            Assert(!!run?.ID, 'no Scheduled Job Run was created');
            Assert(TERMINAL.has(run.Status), `run did not reach a terminal status (got '${run.Status}')`);
            Assert(run.CompletedAt != null, 'run CompletedAt was not set');

            await job.Load(job.ID);
            AssertEqual(job.RunCount, 1, 'job RunCount after one execution');
            Assert(job.LastRunAt != null, 'job LastRunAt was not set');
            console.log(`      → run ${run.ID}: Status=${run.Status}, job RunCount=${job.RunCount}`);
        });

        suite.Test('SJ2: the distributed lock is released after a run, and the job is immediately re-runnable', async () => {
            await job.Load(job.ID);
            Assert(job.LockToken == null, `LockToken was not released after the run (still '${job.LockToken}')`);
            Assert(job.ExpectedCompletionAt == null, 'ExpectedCompletionAt (lease) was not cleared after the run');

            // A second execution must acquire the (now-free) lock, run, and bump RunCount to 2.
            await settle(200);
            const run2 = await engine.ExecuteScheduledJob(job.ID, user);
            Assert(TERMINAL.has(run2.Status), `second run not terminal (got '${run2.Status}')`);
            await job.Load(job.ID);
            AssertEqual(job.RunCount, 2, 'RunCount after a second execution (lock was reusable)');
            Assert(job.LockToken == null, 'LockToken not released after the second run');
            console.log(`      → re-ran cleanly: RunCount=${job.RunCount}, lock released both times`);
        });

        failures = await suite.Run();
    } finally {
        // Cleanup: delete the runs (FK to job) then the job itself.
        const runs = await new RunView().RunView<MJScheduledJobRunEntity>(
            { EntityName: 'MJ: Scheduled Job Runs', ExtraFilter: `ScheduledJobID='${job.ID}'`, ResultType: 'entity_object' }, user,
        );
        for (const r of runs.Results ?? []) {
            await r.Delete().catch(() => undefined);
        }
        await job.Delete().catch(() => undefined);
    }

    process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
