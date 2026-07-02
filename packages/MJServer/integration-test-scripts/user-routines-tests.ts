/**
 * user-routines-tests.ts — live, deterministic integration tests for the User Routines
 * feature (P1.5): the entity servers + the UserRoutineDispatcherDriver, end to end against
 * the real database. No LLM calls — the executable fixture targets the pure-computation
 * 'Calculate Expression' core Action.
 *
 * Covers:
 *   - MJUserRoutineEntityServer: NextRunAt computed on save (same cron helper as the
 *     dispatcher), the StartAt floor, respect for an explicitly-set NextRunAt (the
 *     dispatcher's claim path), invalid-cron rejection, TargetType-without-TargetID rejection.
 *   - MJUserRoutineRecipientEntityServer: the User-xor-Email exclusivity validator
 *     (both rejected, neither rejected, exactly one accepted).
 *   - Due-eligibility: IsRoutineDue + the SQL prefilter (BuildDueRoutineFilter) agree on
 *     the activation-window edges (future StartAt → not due; past EndAt → sunset).
 *   - A FULL dispatcher pass (driver.Execute with a fabricated ScheduledJobExecutionContext):
 *     seeding of a NULL-NextRunAt routine (computed, NOT run), claim-before-run (NextRunAt
 *     advanced), the UserRoutineRun row with ActionExecutionLogID linkage + ResultSummary +
 *     ResultHash, routine LastRunAt/LastRunStatus/LastResultHash rollup, and the in-app
 *     notification (NotifyCondition=Always) with NotificationSent flagged.
 *   - OnChange semantics on a second pass: an identical result hash produces NO new
 *     notification.
 *
 * NOTE: driver.Execute sweeps ALL due Active routines in the instance — the UserRoutine
 * tables are new with this feature, so in practice only this suite's fixtures qualify.
 *
 * Deterministic (no model calls). Creates + deletes its own routine / recipient / run /
 * notification fixtures (try/finally cleanup). References (never mutates) the existing
 * 'Calculate Expression' Action.
 *
 * USAGE (from the repo root):
 *   npx tsx packages/MJServer/integration-test-scripts/user-routines-tests.ts
 *
 * Exit code: 0 = passed, 1 = failures, 2 = bootstrap error.
 */
import { TestRunner, Assert, AssertEqual } from './lib/harness';
import { bootstrapAI, verifyActionLog } from './lib/ai-bootstrap';
import { RunView, UserInfo } from '@memberjunction/core';
import {
    MJScheduledJobEntity,
    MJScheduledJobRunEntity,
    MJUserRoutineEntity,
    MJUserRoutineRecipientEntity,
    MJUserRoutineRunEntity,
} from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import {
    UserRoutineDispatcherDriver,
    ScheduledJobExecutionContext,
    IsRoutineDue,
    BuildDueRoutineFilter,
} from '@memberjunction/scheduling-engine';

const TAG = '(mj-integration-test — safe to delete)';
const HOURLY = '0 0 * * * *';

type Row = Record<string, unknown>;

/** True-DB-state fetch of a single row by ID (BypassCache) — direct SQL writes below bypass entity events. */
async function fetchById(entity: string, id: string, user: UserInfo): Promise<Row> {
    const result = await new RunView().RunView({ EntityName: entity, ExtraFilter: `ID='${id}'`, ResultType: 'simple', BypassCache: true }, user);
    Assert(result.Success, `RunView('${entity}') failed: ${result.ErrorMessage}`);
    Assert(result.Results.length === 1, `${entity} ${id} not found (got ${result.Results.length} rows)`);
    return result.Results[0] as Row;
}

async function fetchRuns(routineId: string, user: UserInfo): Promise<Row[]> {
    const result = await new RunView().RunView({
        EntityName: 'MJ: User Routine Runs',
        ExtraFilter: `RoutineID='${routineId}'`,
        OrderBy: 'StartedAt ASC',
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    Assert(result.Success, `RunView(runs) failed: ${result.ErrorMessage}`);
    return result.Results as Row[];
}

async function main(): Promise<void> {
    const { user, provider } = await bootstrapAI();
    await ActionEngineServer.Instance.Config(false, user);

    const suite = new TestRunner('User Routines — entity servers + dispatcher end-to-end');

    // ── Resolve the referenced (never mutated) executable Action fixture target ─────────────
    const calcAction = ActionEngineServer.Instance.Actions.find(a => a.Name === 'Calculate Expression' && a.Status === 'Active');
    Assert(!!calcAction, `need the core 'Calculate Expression' Action (Active) in the instance for the executable fixture`);

    // Track fixtures for FK-safe teardown: notifications → runs (+ their action logs) → recipients → routines.
    const createdRoutineIds: string[] = [];
    const createdRecipientIds: string[] = [];

    /** Create a routine fixture with sensible defaults; overrides applied before Save. */
    const makeRoutine = async (
        name: string,
        configure: (r: MJUserRoutineEntity) => void
    ): Promise<MJUserRoutineEntity> => {
        const r = await provider.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', user);
        r.NewRecord();
        r.Name = `${name} ${TAG}`;
        r.Description = `Test routine ${TAG}`;
        r.UserID = user.ID;
        r.Status = 'Paused';
        r.RoutineType = 'Scheduled';
        r.TargetType = 'Action';
        r.TargetID = calcAction!.ID;
        r.CronExpression = HOURLY;
        r.Timezone = 'UTC';
        configure(r);
        Assert(await r.Save(), `creating routine "${name}" failed: ${r.LatestResult?.CompleteMessage}`);
        createdRoutineIds.push(r.ID);
        return r;
    };

    /** Fabricate the ScheduledJobExecutionContext the driver receives from the engine (never saved). */
    const makeDispatcherContext = async (): Promise<ScheduledJobExecutionContext> => {
        const schedule = await provider.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', user);
        schedule.NewRecord();
        schedule.Name = `User Routine Dispatcher (in-test) ${TAG}`;
        schedule.Configuration = JSON.stringify({ MaxConcurrentRoutines: 2 });
        const run = await provider.GetEntityObject<MJScheduledJobRunEntity>('MJ: Scheduled Job Runs', user);
        run.NewRecord();
        return { Schedule: schedule, Run: run, ContextUser: user };
    };

    let routineDue: MJUserRoutineEntity;
    let routineFutureStart: MJUserRoutineEntity;
    let routineSunset: MJUserRoutineEntity;
    let routineSeed: MJUserRoutineEntity;
    let firstRunId: string | null = null;

    try {
        // ── Entity server: NextRunAt maintenance ────────────────────────────────────────────
        suite.Test('UR1: Save computes NextRunAt from the cron expression when not set', async () => {
            const r = await makeRoutine('NextRunAt Compute', () => { /* defaults */ });
            Assert(r.NextRunAt != null, 'NextRunAt must be computed by the entity server on save');
            Assert(r.NextRunAt!.getTime() > Date.now(), 'computed NextRunAt must be in the future');
            AssertEqual(r.NextRunAt!.getUTCMinutes(), 0, 'hourly cron must land on the top of an hour');
        });

        suite.Test('UR2: Save floors NextRunAt at a future StartAt (activation window)', async () => {
            const startAt = new Date(Date.now() + 24 * 3_600_000);
            const r = await makeRoutine('StartAt Floor', (x) => { x.StartAt = startAt; });
            Assert(r.NextRunAt != null, 'NextRunAt must be computed');
            Assert(r.NextRunAt!.getTime() >= startAt.getTime(), `NextRunAt (${r.NextRunAt!.toISOString()}) must not precede StartAt (${startAt.toISOString()})`);
        });

        suite.Test('UR3: Save respects an explicitly-set NextRunAt (the dispatcher claim contract)', async () => {
            const explicit = new Date(Date.now() - 5 * 60_000);
            const r = await makeRoutine('Explicit NextRunAt', (x) => { x.NextRunAt = explicit; });
            Assert(r.NextRunAt != null && Math.abs(r.NextRunAt.getTime() - explicit.getTime()) < 1000,
                `explicitly-set NextRunAt must survive the save (got ${r.NextRunAt?.toISOString()})`);
        });

        suite.Test('UR4: Save REJECTS an invalid cron expression', async () => {
            const r = await provider.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', user);
            r.NewRecord();
            r.Name = `Bad Cron ${TAG}`;
            r.UserID = user.ID;
            r.Status = 'Paused';
            r.TargetType = 'Action';
            r.TargetID = calcAction!.ID;
            r.CronExpression = 'definitely not a cron';
            r.Timezone = 'UTC';
            const saved = await r.Save();
            Assert(!saved, 'save must FAIL for an invalid cron expression');
            if (saved) createdRoutineIds.push(r.ID); // safety: track if it somehow persisted
        });

        suite.Test('UR5: Save REJECTS a TargetType without a TargetID', async () => {
            const r = await provider.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', user);
            r.NewRecord();
            r.Name = `No Target ${TAG}`;
            r.UserID = user.ID;
            r.Status = 'Paused';
            r.TargetType = 'Action';
            r.CronExpression = HOURLY;
            r.Timezone = 'UTC';
            const saved = await r.Save();
            Assert(!saved, 'save must FAIL when TargetID is missing');
            if (saved) createdRoutineIds.push(r.ID);
        });

        // ── Entity server: recipient exclusivity ────────────────────────────────────────────
        suite.Test('UR6: Recipient rejects BOTH UserID and Email set', async () => {
            const host = await makeRoutine('Recipient Host', () => { /* defaults */ });
            const rec = await provider.GetEntityObject<MJUserRoutineRecipientEntity>('MJ: User Routine Recipients', user);
            rec.NewRecord();
            rec.RoutineID = host.ID;
            rec.UserID = user.ID;
            rec.Email = 'external@example.com';
            const saved = await rec.Save();
            Assert(!saved, 'save must FAIL when both UserID and Email are set');
            const msg = (rec.LatestResult?.CompleteMessage ?? '').toLowerCase();
            Assert(msg.includes('user') || msg.includes('email'), 'failure message should mention the exclusivity rule');
        });

        suite.Test('UR7: Recipient rejects NEITHER UserID nor Email set', async () => {
            const host = createdRoutineIds[createdRoutineIds.length - 1];
            const rec = await provider.GetEntityObject<MJUserRoutineRecipientEntity>('MJ: User Routine Recipients', user);
            rec.NewRecord();
            rec.RoutineID = host;
            const saved = await rec.Save();
            Assert(!saved, 'save must FAIL when neither UserID nor Email is set');
        });

        suite.Test('UR8: Recipient accepts exactly one grantee (a User) with Sequence + Channel', async () => {
            const host = createdRoutineIds[createdRoutineIds.length - 1];
            const rec = await provider.GetEntityObject<MJUserRoutineRecipientEntity>('MJ: User Routine Recipients', user);
            rec.NewRecord();
            rec.RoutineID = host;
            rec.UserID = user.ID;
            rec.Channel = 'InApp';
            rec.Sequence = 1;
            Assert(await rec.Save(), `save should SUCCEED with a single recipient identity: ${rec.LatestResult?.CompleteMessage}`);
            createdRecipientIds.push(rec.ID);
        });

        // ── Due-eligibility: window edges, in JS and in the SQL prefilter ───────────────────
        suite.Test('UR9: due-evaluation + SQL prefilter agree on window edges (due now / future StartAt / past EndAt)', async () => {
            routineDue = await makeRoutine('Due Now', (x) => {
                x.Status = 'Active';
                x.NextRunAt = new Date(Date.now() - 5 * 60_000);
                x.StartingPayload = JSON.stringify({ Expression: '6*7' });
                x.NotifyCondition = 'Always';
                x.NotifyViaInApp = true;
                x.NotifyViaEmail = false;
            });
            routineFutureStart = await makeRoutine('Future Start', (x) => {
                x.Status = 'Active';
                x.StartAt = new Date(Date.now() + 24 * 3_600_000);
            });
            routineSunset = await makeRoutine('Sunset', (x) => {
                x.Status = 'Active';
                x.EndAt = new Date(Date.now() - 3_600_000);
                x.NextRunAt = new Date(Date.now() - 5 * 60_000);
            });

            const now = new Date();
            Assert(IsRoutineDue(routineDue, now), 'the past-NextRunAt Active routine must be due');
            Assert(!IsRoutineDue(routineFutureStart, now), 'a routine before its StartAt must NOT be due');
            Assert(!IsRoutineDue(routineSunset, now), 'a routine past its EndAt must NOT be due (automatic sunset)');

            const prefilter = await new RunView().RunView<{ ID: string }>({
                EntityName: 'MJ: User Routines',
                ExtraFilter: BuildDueRoutineFilter(now.toISOString()),
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            }, user);
            Assert(prefilter.Success, `prefilter RunView failed: ${prefilter.ErrorMessage}`);
            const ids = new Set(prefilter.Results.map(r => r.ID.toUpperCase()));
            Assert(ids.has(routineDue.ID.toUpperCase()), 'SQL prefilter must include the due routine');
            Assert(!ids.has(routineFutureStart.ID.toUpperCase()), 'SQL prefilter must exclude a routine before its StartAt');
            Assert(!ids.has(routineSunset.ID.toUpperCase()), 'SQL prefilter must exclude a routine past its EndAt');
        });

        // ── Full dispatcher pass ─────────────────────────────────────────────────────────────
        suite.Test('UR10: dispatcher pass — seeds a NULL-NextRunAt routine (computed, NOT run) and executes the due Action routine', async () => {
            // Seed candidate: Active hourly routine whose NextRunAt we null via direct SQL
            // (bypassing the entity server) to emulate a legacy/externally-created row.
            routineSeed = await makeRoutine('Seed Candidate', (x) => { x.Status = 'Active'; });
            await provider.ExecuteSQL(
                `UPDATE [${provider.MJCoreSchemaName}].[UserRoutine] SET NextRunAt = NULL WHERE ID = '${routineSeed.ID}'`,
                [],
                { isMutation: true, description: 'user-routines-tests: null NextRunAt for the seeding fixture' },
                user
            );

            const beforeRun = Date.now();
            const driver = new UserRoutineDispatcherDriver();
            const result = await driver.Execute(await makeDispatcherContext());
            Assert(result.Success, `dispatcher sweep failed: ${result.ErrorMessage}`);
            const details = (result.Details ?? {}) as Record<string, number>;
            Assert((details.RoutinesSeeded ?? 0) >= 1, `expected at least one seeded routine, got ${details.RoutinesSeeded}`);
            Assert((details.RoutinesRun ?? 0) >= 1, `expected at least one executed routine, got ${details.RoutinesRun}`);

            // Seeding: NextRunAt recomputed, and the routine was NOT run.
            const seedBack = await fetchById('MJ: User Routines', routineSeed.ID, user);
            Assert(seedBack.NextRunAt != null, 'seeded routine must have a computed NextRunAt');
            Assert(new Date(String(seedBack.NextRunAt)).getTime() > beforeRun, 'seeded NextRunAt must be in the future');
            AssertEqual((await fetchRuns(routineSeed.ID, user)).length, 0, 'a seeded routine must NOT produce a run row');

            // Non-eligible routines did not run either.
            AssertEqual((await fetchRuns(routineFutureStart.ID, user)).length, 0, 'future-StartAt routine must not run');
            AssertEqual((await fetchRuns(routineSunset.ID, user)).length, 0, 'sunset routine must not run');
        });

        suite.Test('UR11: the run row carries linkage + hash, and the routine rolls up LastRun* (claimed forward)', async () => {
            const runs = await fetchRuns(routineDue.ID, user);
            AssertEqual(runs.length, 1, 'exactly one run row for the due routine');
            const run = runs[0];
            firstRunId = String(run.ID);
            AssertEqual(String(run.Status), 'Success', `run status (error: ${run.ErrorMessage ?? 'none'})`);
            Assert(run.CompletedAt != null, 'run CompletedAt must be set');
            Assert(run.ActionExecutionLogID != null, 'Action-target run must link its Action Execution Log');
            Assert(String(run.ResultSummary ?? '').includes('42'), `ResultSummary should carry the calculation result (got: ${String(run.ResultSummary).substring(0, 120)})`);
            Assert(/^[0-9a-f]{64}$/.test(String(run.ResultHash ?? '')), 'ResultHash must be a sha256 hex digest');
            AssertEqual(run.NotificationSent, true, 'NotifyCondition=Always must flag NotificationSent');

            // The linked action log finalized correctly (shared verifier from the harness).
            await verifyActionLog(String(run.ActionExecutionLogID), user);

            // Routine rollup + claim-before-run: NextRunAt advanced into the future.
            const routineBack = await fetchById('MJ: User Routines', routineDue.ID, user);
            Assert(routineBack.LastRunAt != null, 'routine LastRunAt must be set');
            AssertEqual(String(routineBack.LastRunStatus), 'Success', 'routine LastRunStatus');
            AssertEqual(String(routineBack.LastResultHash), String(run.ResultHash), 'routine LastResultHash must match the run hash');
            Assert(new Date(String(routineBack.NextRunAt)).getTime() > Date.now(), 'claim must have advanced NextRunAt past now');
        });

        suite.Test('UR12: the owner received an in-app notification for the run', async () => {
            const notifications = await new RunView().RunView({
                EntityName: 'MJ: User Notifications',
                ExtraFilter: `UserID='${user.ID}' AND ResourceConfiguration LIKE '%${firstRunId}%'`,
                ResultType: 'simple',
                BypassCache: true,
            }, user);
            Assert(notifications.Success, `notification RunView failed: ${notifications.ErrorMessage}`);
            AssertEqual(notifications.Results.length, 1, 'exactly one in-app notification for the first run');
            const n = notifications.Results[0] as Row;
            Assert(String(n.Title ?? '').includes(routineDue.Name), 'notification title carries the routine name');
        });

        suite.Test('UR13: OnChange — an identical result on a second pass produces NO new notification', async () => {
            // Re-arm the routine: due again, now with OnChange semantics. Same expression → same hash.
            // Reload first — the dispatcher persisted LastRun*/NextRunAt on its own entity instance,
            // so saving this (stale) one without reloading would clobber that bookkeeping.
            Assert(await routineDue.Load(routineDue.ID), 'reloading the due routine failed');
            routineDue.NextRunAt = new Date(Date.now() - 60_000);
            routineDue.NotifyCondition = 'OnChange';
            Assert(await routineDue.Save(), `re-arming the routine failed: ${routineDue.LatestResult?.CompleteMessage}`);

            const driver = new UserRoutineDispatcherDriver();
            const result = await driver.Execute(await makeDispatcherContext());
            Assert(result.Success, `second dispatcher sweep failed: ${result.ErrorMessage}`);

            const runs = await fetchRuns(routineDue.ID, user);
            AssertEqual(runs.length, 2, 'a second run row exists after the second pass');
            const secondRun = runs[1];
            AssertEqual(String(secondRun.Status), 'Success', `second run status (error: ${secondRun.ErrorMessage ?? 'none'})`);
            AssertEqual(String(secondRun.ResultHash), String(runs[0].ResultHash), 'identical expression must produce an identical hash');
            AssertEqual(secondRun.NotificationSent, false, 'OnChange with an unchanged hash must NOT notify');

            const notifications = await new RunView().RunView({
                EntityName: 'MJ: User Notifications',
                ExtraFilter: `UserID='${user.ID}' AND ResourceConfiguration LIKE '%${String(secondRun.ID)}%'`,
                ResultType: 'simple',
                BypassCache: true,
            }, user);
            AssertEqual(notifications.Results.length, 0, 'no notification row for the unchanged second run');
        });

        const failures = await suite.Run();
        await cleanup(provider, user, createdRecipientIds, createdRoutineIds);
        process.exit(failures > 0 ? 1 : 0);
    } catch (error) {
        await cleanup(provider, user, createdRecipientIds, createdRoutineIds);
        throw error;
    }
}

/**
 * Tear down in FK-safe order: notifications for our runs → run rows (collecting their action
 * logs) → the action logs → recipients → routines. Every step is best-effort.
 */
async function cleanup(
    provider: Awaited<ReturnType<typeof bootstrapAI>>['provider'],
    user: Awaited<ReturnType<typeof bootstrapAI>>['user'],
    recipientIds: string[],
    routineIds: string[],
): Promise<void> {
    const del = async (entityName: string, id: string) => {
        try {
            const e = await provider.GetEntityObject(entityName, user);
            if (await e.Load(id)) await e.Delete();
        } catch { /* best-effort cleanup */ }
    };

    for (const routineId of routineIds) {
        try {
            const runs = await new RunView().RunView<{ ID: string; ActionExecutionLogID: string | null }>({
                EntityName: 'MJ: User Routine Runs',
                ExtraFilter: `RoutineID='${routineId}'`,
                Fields: ['ID', 'ActionExecutionLogID'],
                ResultType: 'simple',
                BypassCache: true,
            }, user);
            for (const run of runs.Results ?? []) {
                // Notifications reference the run only inside ResourceConfiguration JSON. Even
                // Owner-type users are not granted Delete on 'MJ: User Notifications' via the
                // entity API, so the self-cleaning teardown removes the suite's own rows with
                // direct SQL (scoped to the exact run IDs this suite created).
                try {
                    await provider.ExecuteSQL(
                        `DELETE FROM [${provider.MJCoreSchemaName}].[UserNotification] WHERE ResourceConfiguration LIKE '%${run.ID}%'`,
                        [],
                        { isMutation: true, description: 'user-routines-tests: cleanup in-app notifications' },
                        user
                    );
                } catch { /* best-effort cleanup */ }
                await del('MJ: User Routine Runs', run.ID);
                if (run.ActionExecutionLogID) await del('MJ: Action Execution Logs', run.ActionExecutionLogID);
            }
        } catch { /* best-effort cleanup */ }
    }
    for (const id of recipientIds) await del('MJ: User Routine Recipients', id);
    for (const id of routineIds) await del('MJ: User Routines', id);
}

main().catch((error) => {
    console.error('\nBOOTSTRAP / CONNECTIVITY ERROR:', error instanceof Error ? error.message : error);
    process.exit(2);
});
