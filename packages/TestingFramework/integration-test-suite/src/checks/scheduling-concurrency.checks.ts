/**
 * scheduling-concurrency.checks.ts — the 'scheduling-concurrency' bundle (SC1–SC3): engine-level
 * ConcurrencyMode semantics for the Scheduled Jobs engine (Domain 5 of the integration-test
 * expansion catalog — the legs the sibling 'scheduled-jobs' bundle does NOT cover: that bundle
 * exercises the run lifecycle + lease release via `ExecuteScheduledJob`; THIS bundle exercises the
 * polling path `ExecuteScheduledJobs` under a HELD lock, one ConcurrencyMode at a time).
 *
 * SERVER TRANSPORT: in-process against `SchedulingEngine.Instance` + the live DB (the atomic lock
 * sprocs are the thing under test — there is no client surface for the poll path).
 *
 * Isolation technique: the fixture job's `NextRunAt` is pinned to 2001-01-01 and every poll uses
 * `evalTime` = 2001-01-02 — no real job in any deployment can have a NextRunAt before the product
 * existed, so the poll can only ever match OUR fixture job. The "another holder is running" state
 * is simulated by writing a foreign `LockToken` + future `ExpectedCompletionAt` directly onto the
 * job row: `spAcquireScheduledJobLock`'s WHERE clause (LockToken IS NULL OR lease stale) then
 * refuses acquisition exactly as it would against a live holder.
 *
 *   - SC1 (Skip):       a due-but-locked job is SKIPPED — no run row, no stats bump, and the
 *                        foreign lock is left untouched.
 *   - SC2 (Queue):      a due-but-locked job records a queue-event run — and, per the
 *                        **bug-register B8 FIX** (createQueuedJobRun used to write Status='Running'
 *                        with no drainer to ever complete it → orphaned-Running-forever), that run
 *                        is TERMINAL ON CREATION (Cancelled/Success=false/CompletedAt set). This
 *                        check pins the fixed contract; if a real drainer ever ships, SC2 must be
 *                        updated together with createQueuedJobRun.
 *   - SC3 (Concurrent): the SAME due job under the SAME held lock EXECUTES anyway (no lock
 *                        needed), reaches a terminal run, bumps RunCount, advances NextRunAt — and
 *                        does NOT release the foreign holder's lock. SC3 is also the positive
 *                        control that retro-proves SC1/SC2 were not vacuous: identical evalTime and
 *                        lock state, only the mode differs.
 *
 * Driver economics: like the 'scheduled-jobs' bundle, the job points its 'Run Record Process'
 * driver at a missing Record Process so SC3's execution fails fast + deterministically — the
 * ConcurrencyMode / lease / stats contract is identical on success or failure. No LLM calls.
 *
 * Self-cleaning: Teardown deletes every Scheduled Job Run for the fixture job, then the job.
 *
 * NOTE on fixtures: module state, not a typed IntegrationCheckContext slot — this bundle does not
 * modify the shared contract in @memberjunction/testing-integration (see actions-pipeline header).
 */
import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import { SchedulingEngine } from '@memberjunction/scheduling-engine';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const JOB_NAME = 'mj-integration-test-concurrency-job (mj-integration-test — safe to delete)';
/** Pinned far in the past so ONLY the fixture job can ever be due at EVAL_TIME (see header). */
const DUE_AT = new Date('2001-01-01T00:00:00Z');
const EVAL_TIME = new Date('2001-01-02T00:00:00Z');
/** The simulated foreign holder's token (must be a valid uniqueidentifier — the column is one). */
const FOREIGN_TOKEN = '11111111-2222-4333-8444-555555555555';
const TERMINAL = new Set(['Completed', 'Failed', 'Cancelled', 'Timeout']);

interface SchedulingConcurrencyFixture {
    JobID: string;
}
let fixture: SchedulingConcurrencyFixture | undefined;

function fx(): SchedulingConcurrencyFixture {
    Assert(fixture != null, 'scheduling-concurrency fixture missing (bundle Setup did not run)');
    return fixture!;
}

/** Loads a FRESH entity copy of the fixture job (never reuses the engine's cached instance). */
async function loadJob(ctx: IntegrationCheckContext): Promise<MJScheduledJobEntity> {
    const job = await ctx.Provider.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', ctx.User);
    Assert(await job.Load(fx().JobID), `could not load fixture job ${fx().JobID}`);
    return job;
}

/**
 * Simulates "another holder is mid-execution": foreign token + a lease 10 minutes out. The atomic
 * acquire sproc refuses while the lease is fresh, which is precisely the contested-lock state.
 */
async function holdForeignLock(job: MJScheduledJobEntity): Promise<void> {
    job.LockToken = FOREIGN_TOKEN;
    job.LockedAt = new Date();
    job.ExpectedCompletionAt = new Date(Date.now() + 10 * 60 * 1000);
    Assert(await job.Save(), `could not simulate the held lock: ${job.LatestResult?.CompleteMessage ?? 'unknown error'}`);
}

/** All Scheduled Job Run rows for the fixture job, straight from the DB (BypassCache). */
async function runsForJob(ctx: IntegrationCheckContext): Promise<MJScheduledJobRunEntity[]> {
    const result = await new RunView().RunView<MJScheduledJobRunEntity>({
        EntityName: 'MJ: Scheduled Job Runs',
        ExtraFilter: `ScheduledJobID='${fx().JobID}'`,
        ResultType: 'entity_object',
        BypassCache: true
    }, ctx.User);
    Assert(result.Success, `reading Scheduled Job Runs failed: ${result.ErrorMessage}`);
    return result.Results ?? [];
}

/** Asserts the engine's refreshed cache sees the fixture job as due at EVAL_TIME (anti-vacuity). */
function assertJobDueInCache(mode: MJScheduledJobEntity['ConcurrencyMode']): MJScheduledJobEntity {
    const cached = SchedulingEngine.Instance.ScheduledJobs.find(j => UUIDsEqual(j.ID, fx().JobID));
    Assert(cached != null, 'fixture job is not in the engine cache — Config(true) refresh missing');
    AssertEqual(cached!.ConcurrencyMode, mode, 'cached ConcurrencyMode');
    Assert(cached!.NextRunAt != null && cached!.NextRunAt.getTime() <= EVAL_TIME.getTime(),
        `fixture job is not due at EVAL_TIME (NextRunAt=${cached!.NextRunAt?.toISOString()}) — the poll below would be vacuous`);
    return cached!;
}

export const SchedulingConcurrencyChecks: NamedCheck[] = [
    {
        Id: 'scheduling-concurrency.SC1',
        Name: 'SC1: ConcurrencyMode=Skip — a due-but-locked job is skipped: no run row, no stats, lock untouched',
        Fn: async (ctx: IntegrationCheckContext) => {
            const job = await loadJob(ctx);
            await holdForeignLock(job);
            assertJobDueInCache('Skip');

            const returned = await SchedulingEngine.Instance.ExecuteScheduledJobs(ctx.User, EVAL_TIME);
            Assert(!returned.some(r => UUIDsEqual(r.ScheduledJobID, fx().JobID)),
                'Skip mode must not return a run for the locked job');
            AssertEqual((await runsForJob(ctx)).length, 0, 'Scheduled Job Run rows after a skipped poll');

            const after = await loadJob(ctx);
            AssertEqual(after.RunCount, 0, 'RunCount after a skipped poll');
            Assert(after.LockToken != null && UUIDsEqual(after.LockToken, FOREIGN_TOKEN),
                `the foreign holder's lock must be left untouched (got LockToken=${after.LockToken})`);
            // NOTE: due-ness under this exact evalTime + lock state is positively proven by SC3
            // (same conditions, Concurrent mode, job runs) — SC1's "nothing happened" is not vacuous.
            console.log(`      → due+locked job skipped cleanly; foreign lock + stats untouched`);
        }
    },
    {
        Id: 'scheduling-concurrency.SC2',
        Name: 'SC2: ConcurrencyMode=Queue — the queue-event run is TERMINAL on creation, never orphaned Running (B8 fix pin)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const job = await loadJob(ctx);
            // The foreign lock persists from SC1 — reassert rather than assume.
            Assert(job.LockToken != null && UUIDsEqual(job.LockToken, FOREIGN_TOKEN), 'foreign lock lost between SC1 and SC2');
            Assert(job.ExpectedCompletionAt != null && job.ExpectedCompletionAt.getTime() > Date.now(), 'foreign lease already stale — SC2 would not be contested');
            job.ConcurrencyMode = 'Queue';
            Assert(await job.Save(), `switching to Queue failed: ${job.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            await SchedulingEngine.Instance.Config(true, ctx.User); // the poll branches on the CACHED entity's mode
            assertJobDueInCache('Queue');

            const returned = await SchedulingEngine.Instance.ExecuteScheduledJobs(ctx.User, EVAL_TIME);
            const queued = returned.filter(r => UUIDsEqual(r.ScheduledJobID, fx().JobID));
            AssertEqual(queued.length, 1, 'queue events returned for the locked job');

            // ─────────────────────────────────────────────────────────────────────────────
            // 🚨 bug-register B8 (plans/integration-test-expansion/bug-register.md) — FIXED
            // in this change-set: `createQueuedJobRun` used to write Status='Running' with NO
            // drainer anywhere in the engine to ever complete it, so every Queue-mode
            // contention produced a run orphaned in 'Running' forever. The fix terminalizes
            // the queue event on creation (Cancelled / Success=false / CompletedAt set, with
            // an explanatory ErrorMessage) until real queue draining is designed. This pin
            // MUST be updated together with createQueuedJobRun if a drainer ships.
            // ─────────────────────────────────────────────────────────────────────────────
            const run = queued[0];
            Assert(run.Status !== 'Running',
                'queue-event run came back Status=Running — the B8 orphan-Running defect has regressed');
            AssertEqual(run.Status, 'Cancelled', 'queue-event run status (terminal on creation)');
            Assert(run.QueuedAt != null, 'QueuedAt must record when the queue event happened');
            Assert(run.CompletedAt != null, 'a terminal queue-event run must carry CompletedAt');
            AssertEqual(run.Success, false, 'queue-event run Success');
            Assert((run.ErrorMessage ?? '').includes('ConcurrencyMode=Queue'),
                `queue-event ErrorMessage must explain itself (got: ${run.ErrorMessage})`);

            // The DB row agrees with the returned entity (the returned object could lie post-save).
            const rows = await runsForJob(ctx);
            AssertEqual(rows.length, 1, 'persisted run rows after the queue event');
            AssertEqual(rows[0].Status, 'Cancelled', 'persisted queue-event run status');

            const after = await loadJob(ctx);
            AssertEqual(after.RunCount, 0, 'RunCount — a queue event is not an execution');
            console.log(`      → queue event recorded as terminal '${run.Status}' (B8 pinned), stats untouched`);
        }
    },
    {
        Id: 'scheduling-concurrency.SC3',
        Name: 'SC3: ConcurrencyMode=Concurrent — the same due job under the same held lock executes to terminal (positive control)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const job = await loadJob(ctx);
            Assert(job.LockToken != null && UUIDsEqual(job.LockToken, FOREIGN_TOKEN), 'foreign lock lost before SC3');
            Assert(job.ExpectedCompletionAt != null && job.ExpectedCompletionAt.getTime() > Date.now(), 'foreign lease already stale — SC3 would not be contested');
            job.ConcurrencyMode = 'Concurrent';
            Assert(await job.Save(), `switching to Concurrent failed: ${job.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            await SchedulingEngine.Instance.Config(true, ctx.User);
            assertJobDueInCache('Concurrent');

            const priorRuns = (await runsForJob(ctx)).length; // SC2's queue-event row
            const returned = await SchedulingEngine.Instance.ExecuteScheduledJobs(ctx.User, EVAL_TIME);
            const executed = returned.filter(r => UUIDsEqual(r.ScheduledJobID, fx().JobID));
            AssertEqual(executed.length, 1, 'runs returned for the job in Concurrent mode');
            const run = executed[0];
            Assert(TERMINAL.has(run.Status), `Concurrent-mode run did not reach a terminal status (got '${run.Status}')`);
            Assert(run.CompletedAt != null, 'Concurrent-mode run CompletedAt not set');
            Assert(run.QueuedAt == null, 'an EXECUTED run must not carry QueuedAt — that is the queue-event marker');

            AssertEqual((await runsForJob(ctx)).length, priorRuns + 1, 'persisted run rows after the Concurrent execution');

            const after = await loadJob(ctx);
            AssertEqual(after.RunCount, 1, 'RunCount after the Concurrent execution (stats sproc fired)');
            Assert(after.NextRunAt != null && after.NextRunAt.getTime() > EVAL_TIME.getTime(),
                `NextRunAt must advance past the eval time after an execution (got ${after.NextRunAt?.toISOString()})`);
            // Concurrent mode acquired no lock, so its finally must NOT release the foreign holder's.
            Assert(after.LockToken != null && UUIDsEqual(after.LockToken, FOREIGN_TOKEN),
                `Concurrent mode must not release a lock it never held (got LockToken=${after.LockToken})`);

            console.log(`      → executed to '${run.Status}' despite the held lock; RunCount=1, NextRunAt advanced, foreign lock preserved`);
        }
    }
];

for (const check of SchedulingConcurrencyChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('scheduling-concurrency', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const engine = SchedulingEngine.Instance;
        await engine.Config(true, ctx.User);
        const jobType = engine.ScheduledJobTypes.find((t) => t.Name === 'Run Record Process') ?? engine.ScheduledJobTypes[0];
        Assert(!!jobType, 'No scheduled job types are seeded in this database');

        const job = await ctx.Provider.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', ctx.User);
        job.NewRecord();
        job.Name = JOB_NAME;
        job.JobTypeID = jobType!.ID;
        job.CronExpression = '0 * * * * *';
        job.Timezone = 'UTC';
        job.Status = 'Active';
        job.NextRunAt = DUE_AT; // 2001 — due ONLY at this bundle's archaic evalTime, never in a live poll
        job.ConcurrencyMode = 'Skip';
        // Missing Record Process → the driver fails fast + deterministically when SC3 executes it.
        job.Configuration = JSON.stringify({ RecordProcessID: '00000000-0000-0000-0000-000000000000' });
        Assert(await job.Save(), `creating the concurrency fixture job failed: ${job.LatestResult?.CompleteMessage}`);
        // Publish the fixture handle IMMEDIATELY after the save so a crash in the Config refresh
        // below can never orphan the just-created job; Teardown always sweeps it.
        fixture = { JobID: job.ID };
        await engine.Config(true, ctx.User);
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        if (!fixture) {
            return;
        }
        const jobId = fixture.JobID;
        const runs = await new RunView().RunView<MJScheduledJobRunEntity>({
            EntityName: 'MJ: Scheduled Job Runs',
            ExtraFilter: `ScheduledJobID='${jobId}'`,
            ResultType: 'entity_object',
            BypassCache: true
        }, ctx.User).catch(() => undefined);
        for (const r of runs?.Results ?? []) {
            await r.Delete().catch(() => undefined);
        }
        const job = await ctx.Provider.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', ctx.User).catch(() => undefined);
        if (job && (await job.Load(jobId).catch(() => false))) {
            await job.Delete().catch(() => undefined);
        }
        fixture = undefined;
    }
});
