/**
 * user-routines.checks.ts — the 'user-routines' bundle (UR1–UR16): live, deterministic integration
 * checks for the User Routines feature (P1.5) — the entity servers + the UserRoutineDispatcherDriver,
 * end to end against the real DB. Graduated VERBATIM from integration-test-scripts/user-routines-tests.ts
 * (check bodies unchanged; the shared closure state moved onto ctx.UserRoutinesFixture and the
 * create/cleanup became a BundleLifecycle).
 *
 * No LLM calls — the executable fixture targets the pure-computation 'Calculate Expression' core Action.
 * The ordered checks share state via the fixture: UR9 creates the due/future/sunset routines, UR10/UR11
 * run + assert the due one, UR13 re-arms it (OnChange), UR14 deletes it. Teardown removes every routine /
 * recipient / run / notification / conversation the bundle created, in FK-safe order.
 */
import { RunView, BaseEntity, CompositeKey } from '@memberjunction/core';
import type { UserInfo, DatabaseProviderBase } from '@memberjunction/core';
import {
    MJScheduledJobEntity,
    MJScheduledJobRunEntity,
    MJUserRoutineEntity,
    MJUserRoutineRecipientEntity,
} from '@memberjunction/core-entities';
import { ActionEngineServer } from '@memberjunction/actions';
import {
    UserRoutineDispatcherDriver,
    ScheduledJobExecutionContext,
    IsRoutineDue,
    BuildDueRoutineFilter,
} from '@memberjunction/scheduling-engine';
import { Assert, AssertEqual } from '../test-runner';
import { verifyActionLog } from '../ai-verify';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext, UserRoutinesFixture } from '../check';

const TAG = '(mj-integration-test — safe to delete)';
const HOURLY = '0 0 * * * *';

type Row = Record<string, unknown>;

/** Fetch the fixture (thrown if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext): UserRoutinesFixture {
    Assert(ctx.UserRoutinesFixture != null, 'user-routines fixture missing (bundle Setup did not run)');
    return ctx.UserRoutinesFixture!;
}

/**
 * Server-transport bundle: ctx.Provider is a DatabaseProviderBase. Narrow to it for the raw-SQL
 * legs (ExecuteSQL / MJCoreSchemaName) — not on the generic IMetadataProvider surface — and for
 * GetEntityObject (inherited from ProviderBase).
 */
function prov(ctx: IntegrationCheckContext): DatabaseProviderBase {
    return ctx.Provider as unknown as DatabaseProviderBase;
}

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

/** Create a routine fixture with sensible defaults; overrides applied before Save. */
async function makeRoutine(
    ctx: IntegrationCheckContext,
    name: string,
    configure: (r: MJUserRoutineEntity) => void
): Promise<MJUserRoutineEntity> {
    const provider = prov(ctx);
    const user = ctx.User;
    const f = fx(ctx);
    const r = await provider.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', user);
    r.NewRecord();
    r.Name = `${name} ${TAG}`;
    r.Description = `Test routine ${TAG}`;
    r.UserID = user.ID;
    r.Status = 'Paused';
    r.RoutineType = 'Scheduled';
    r.TargetType = 'Action';
    r.TargetID = f.CalcActionID;
    r.CronExpression = HOURLY;
    r.Timezone = 'UTC';
    configure(r);
    Assert(await r.Save(), `creating routine "${name}" failed: ${r.LatestResult?.CompleteMessage}`);
    f.CreatedRoutineIds.push(r.ID);
    return r;
}

/** Fabricate the ScheduledJobExecutionContext the driver receives from the engine (never saved). */
async function makeDispatcherContext(ctx: IntegrationCheckContext): Promise<ScheduledJobExecutionContext> {
    const provider = prov(ctx);
    const user = ctx.User;
    const schedule = await provider.GetEntityObject<MJScheduledJobEntity>('MJ: Scheduled Jobs', user);
    schedule.NewRecord();
    schedule.Name = `User Routine Dispatcher (in-test) ${TAG}`;
    schedule.Configuration = JSON.stringify({ MaxConcurrentRoutines: 2 });
    const run = await provider.GetEntityObject<MJScheduledJobRunEntity>('MJ: Scheduled Job Runs', user);
    run.NewRecord();
    return { Schedule: schedule, Run: run, ContextUser: user };
}

export const UserRoutinesChecks: NamedCheck[] = [
    // ── Entity server: NextRunAt maintenance ────────────────────────────────────────────
    {
        Id: 'user-routines.UR1',
        Name: 'UR1: Save computes NextRunAt from the cron expression when not set',
        Fn: async (ctx) => {
            const r = await makeRoutine(ctx, 'NextRunAt Compute', () => { /* defaults */ });
            Assert(r.NextRunAt != null, 'NextRunAt must be computed by the entity server on save');
            Assert(r.NextRunAt!.getTime() > Date.now(), 'computed NextRunAt must be in the future');
            AssertEqual(r.NextRunAt!.getUTCMinutes(), 0, 'hourly cron must land on the top of an hour');
        }
    },
    {
        Id: 'user-routines.UR2',
        Name: 'UR2: Save floors NextRunAt at a future StartAt (activation window)',
        Fn: async (ctx) => {
            const startAt = new Date(Date.now() + 24 * 3_600_000);
            const r = await makeRoutine(ctx, 'StartAt Floor', (x) => { x.StartAt = startAt; });
            Assert(r.NextRunAt != null, 'NextRunAt must be computed');
            Assert(r.NextRunAt!.getTime() >= startAt.getTime(), `NextRunAt (${r.NextRunAt!.toISOString()}) must not precede StartAt (${startAt.toISOString()})`);
        }
    },
    {
        Id: 'user-routines.UR3',
        Name: 'UR3: Save respects an explicitly-set NextRunAt (the dispatcher claim contract)',
        Fn: async (ctx) => {
            const explicit = new Date(Date.now() - 5 * 60_000);
            const r = await makeRoutine(ctx, 'Explicit NextRunAt', (x) => { x.NextRunAt = explicit; });
            Assert(r.NextRunAt != null && Math.abs(r.NextRunAt.getTime() - explicit.getTime()) < 1000,
                `explicitly-set NextRunAt must survive the save (got ${r.NextRunAt?.toISOString()})`);
        }
    },
    {
        Id: 'user-routines.UR4',
        Name: 'UR4: Save REJECTS an invalid cron expression',
        Fn: async (ctx) => {
            const provider = prov(ctx);
            const user = ctx.User;
            const f = fx(ctx);
            const r = await provider.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', user);
            r.NewRecord();
            r.Name = `Bad Cron ${TAG}`;
            r.UserID = user.ID;
            r.Status = 'Paused';
            r.TargetType = 'Action';
            r.TargetID = f.CalcActionID;
            r.CronExpression = 'definitely not a cron';
            r.Timezone = 'UTC';
            const saved = await r.Save();
            Assert(!saved, 'save must FAIL for an invalid cron expression');
            if (saved) f.CreatedRoutineIds.push(r.ID); // safety: track if it somehow persisted
        }
    },
    {
        Id: 'user-routines.UR5',
        Name: 'UR5: Save REJECTS a TargetType without a TargetID',
        Fn: async (ctx) => {
            const provider = prov(ctx);
            const user = ctx.User;
            const f = fx(ctx);
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
            if (saved) f.CreatedRoutineIds.push(r.ID);
        }
    },
    // ── Entity server: recipient exclusivity ────────────────────────────────────────────
    {
        Id: 'user-routines.UR6',
        Name: 'UR6: Recipient rejects BOTH UserID and Email set',
        Fn: async (ctx) => {
            const provider = prov(ctx);
            const user = ctx.User;
            const host = await makeRoutine(ctx, 'Recipient Host', () => { /* defaults */ });
            const rec = await provider.GetEntityObject<MJUserRoutineRecipientEntity>('MJ: User Routine Recipients', user);
            rec.NewRecord();
            rec.RoutineID = host.ID;
            rec.UserID = user.ID;
            rec.Email = 'external@example.com';
            const saved = await rec.Save();
            Assert(!saved, 'save must FAIL when both UserID and Email are set');
            const msg = (rec.LatestResult?.CompleteMessage ?? '').toLowerCase();
            Assert(msg.includes('user') || msg.includes('email'), 'failure message should mention the exclusivity rule');
        }
    },
    {
        Id: 'user-routines.UR7',
        Name: 'UR7: Recipient rejects NEITHER UserID nor Email set',
        Fn: async (ctx) => {
            const provider = prov(ctx);
            const user = ctx.User;
            const f = fx(ctx);
            const host = f.CreatedRoutineIds[f.CreatedRoutineIds.length - 1];
            const rec = await provider.GetEntityObject<MJUserRoutineRecipientEntity>('MJ: User Routine Recipients', user);
            rec.NewRecord();
            rec.RoutineID = host;
            const saved = await rec.Save();
            Assert(!saved, 'save must FAIL when neither UserID nor Email is set');
        }
    },
    {
        Id: 'user-routines.UR8',
        Name: 'UR8: Recipient accepts exactly one grantee (a User) with Sequence + Channel',
        Fn: async (ctx) => {
            const provider = prov(ctx);
            const user = ctx.User;
            const f = fx(ctx);
            const host = f.CreatedRoutineIds[f.CreatedRoutineIds.length - 1];
            const rec = await provider.GetEntityObject<MJUserRoutineRecipientEntity>('MJ: User Routine Recipients', user);
            rec.NewRecord();
            rec.RoutineID = host;
            rec.UserID = user.ID;
            rec.Channel = 'InApp';
            rec.Sequence = 1;
            Assert(await rec.Save(), `save should SUCCEED with a single recipient identity: ${rec.LatestResult?.CompleteMessage}`);
            f.CreatedRecipientIds.push(rec.ID);
        }
    },
    // ── Due-eligibility: window edges, in JS and in the SQL prefilter ───────────────────
    {
        Id: 'user-routines.UR9',
        Name: 'UR9: due-evaluation + SQL prefilter agree on window edges (due now / future StartAt / past EndAt)',
        Fn: async (ctx) => {
            const user = ctx.User;
            const f = fx(ctx);
            f.RoutineDue = await makeRoutine(ctx, 'Due Now', (x) => {
                x.Status = 'Active';
                x.NextRunAt = new Date(Date.now() - 5 * 60_000);
                x.StartingPayload = JSON.stringify({ Expression: '6*7' });
                x.NotifyCondition = 'Always';
                x.NotifyViaInApp = true;
                x.NotifyViaEmail = false;
            });
            f.RoutineFutureStart = await makeRoutine(ctx, 'Future Start', (x) => {
                x.Status = 'Active';
                x.StartAt = new Date(Date.now() + 24 * 3_600_000);
            });
            f.RoutineSunset = await makeRoutine(ctx, 'Sunset', (x) => {
                x.Status = 'Active';
                x.EndAt = new Date(Date.now() - 3_600_000);
                x.NextRunAt = new Date(Date.now() - 5 * 60_000);
            });

            const now = new Date();
            Assert(IsRoutineDue(f.RoutineDue, now), 'the past-NextRunAt Active routine must be due');
            Assert(!IsRoutineDue(f.RoutineFutureStart, now), 'a routine before its StartAt must NOT be due');
            Assert(!IsRoutineDue(f.RoutineSunset, now), 'a routine past its EndAt must NOT be due (automatic sunset)');

            const prefilter = await new RunView().RunView<{ ID: string }>({
                EntityName: 'MJ: User Routines',
                ExtraFilter: BuildDueRoutineFilter(now.toISOString()),
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true,
            }, user);
            Assert(prefilter.Success, `prefilter RunView failed: ${prefilter.ErrorMessage}`);
            const ids = new Set(prefilter.Results.map(r => r.ID.toUpperCase()));
            Assert(ids.has(f.RoutineDue.ID.toUpperCase()), 'SQL prefilter must include the due routine');
            Assert(!ids.has(f.RoutineFutureStart.ID.toUpperCase()), 'SQL prefilter must exclude a routine before its StartAt');
            Assert(!ids.has(f.RoutineSunset.ID.toUpperCase()), 'SQL prefilter must exclude a routine past its EndAt');
        }
    },
    // ── Full dispatcher pass ─────────────────────────────────────────────────────────────
    {
        Id: 'user-routines.UR10',
        Name: 'UR10: dispatcher pass — seeds a NULL-NextRunAt routine (computed, NOT run) and executes the due Action routine',
        Fn: async (ctx) => {
            const provider = prov(ctx);
            const user = ctx.User;
            const f = fx(ctx);
            // Seed candidate: Active hourly routine whose NextRunAt we null via direct SQL
            // (bypassing the entity server) to emulate a legacy/externally-created row.
            f.RoutineSeed = await makeRoutine(ctx, 'Seed Candidate', (x) => { x.Status = 'Active'; });
            await provider.ExecuteSQL(
                `UPDATE [${provider.MJCoreSchemaName}].[UserRoutine] SET NextRunAt = NULL WHERE ID = '${f.RoutineSeed.ID}'`,
                [],
                { isMutation: true, description: 'user-routines: null NextRunAt for the seeding fixture' },
                user
            );

            const beforeRun = Date.now();
            const driver = new UserRoutineDispatcherDriver();
            const result = await driver.Execute(await makeDispatcherContext(ctx));
            Assert(result.Success, `dispatcher sweep failed: ${result.ErrorMessage}`);
            const details = (result.Details ?? {}) as Record<string, number>;
            Assert((details.RoutinesSeeded ?? 0) >= 1, `expected at least one seeded routine, got ${details.RoutinesSeeded}`);
            Assert((details.RoutinesRun ?? 0) >= 1, `expected at least one executed routine, got ${details.RoutinesRun}`);

            // Seeding: NextRunAt recomputed, and the routine was NOT run.
            const seedBack = await fetchById('MJ: User Routines', f.RoutineSeed.ID, user);
            Assert(seedBack.NextRunAt != null, 'seeded routine must have a computed NextRunAt');
            Assert(new Date(String(seedBack.NextRunAt)).getTime() > beforeRun, 'seeded NextRunAt must be in the future');
            AssertEqual((await fetchRuns(f.RoutineSeed.ID, user)).length, 0, 'a seeded routine must NOT produce a run row');

            // Non-eligible routines did not run either.
            AssertEqual((await fetchRuns(f.RoutineFutureStart!.ID, user)).length, 0, 'future-StartAt routine must not run');
            AssertEqual((await fetchRuns(f.RoutineSunset!.ID, user)).length, 0, 'sunset routine must not run');
        }
    },
    {
        Id: 'user-routines.UR11',
        Name: 'UR11: the run row carries linkage + hash, and the routine rolls up LastRun* (claimed forward)',
        Fn: async (ctx) => {
            const user = ctx.User;
            const f = fx(ctx);
            const runs = await fetchRuns(f.RoutineDue!.ID, user);
            AssertEqual(runs.length, 1, 'exactly one run row for the due routine');
            const run = runs[0];
            f.FirstRunId = String(run.ID);
            AssertEqual(String(run.Status), 'Success', `run status (error: ${run.ErrorMessage ?? 'none'})`);
            Assert(run.CompletedAt != null, 'run CompletedAt must be set');
            Assert(run.ActionExecutionLogID != null, 'Action-target run must link its Action Execution Log');
            Assert(String(run.ResultSummary ?? '').includes('42'), `ResultSummary should carry the calculation result (got: ${String(run.ResultSummary).substring(0, 120)})`);
            Assert(/^[0-9a-f]{64}$/.test(String(run.ResultHash ?? '')), 'ResultHash must be a sha256 hex digest');
            AssertEqual(run.NotificationSent, true, 'NotifyCondition=Always must flag NotificationSent');

            // The linked action log finalized correctly (shared verifier from the package).
            await verifyActionLog(String(run.ActionExecutionLogID), user);

            // Routine rollup + claim-before-run: NextRunAt advanced into the future.
            const routineBack = await fetchById('MJ: User Routines', f.RoutineDue!.ID, user);
            Assert(routineBack.LastRunAt != null, 'routine LastRunAt must be set');
            AssertEqual(String(routineBack.LastRunStatus), 'Success', 'routine LastRunStatus');
            AssertEqual(String(routineBack.LastResultHash), String(run.ResultHash), 'routine LastResultHash must match the run hash');
            Assert(new Date(String(routineBack.NextRunAt)).getTime() > Date.now(), 'claim must have advanced NextRunAt past now');
        }
    },
    {
        Id: 'user-routines.UR12',
        Name: 'UR12: the owner received an in-app notification for the run',
        Fn: async (ctx) => {
            const user = ctx.User;
            const f = fx(ctx);
            const notifications = await new RunView().RunView({
                EntityName: 'MJ: User Notifications',
                ExtraFilter: `UserID='${user.ID}' AND ResourceConfiguration LIKE '%${f.FirstRunId}%'`,
                ResultType: 'simple',
                BypassCache: true,
            }, user);
            Assert(notifications.Success, `notification RunView failed: ${notifications.ErrorMessage}`);
            AssertEqual(notifications.Results.length, 1, 'exactly one in-app notification for the first run');
            const n = notifications.Results[0] as Row;
            Assert(String(n.Title ?? '').includes(f.RoutineDue!.Name), 'notification title carries the routine name');
        }
    },
    {
        Id: 'user-routines.UR13',
        Name: 'UR13: OnChange — an identical result on a second pass produces NO new notification',
        Fn: async (ctx) => {
            const user = ctx.User;
            const f = fx(ctx);
            // Re-arm the routine: due again, now with OnChange semantics. Same expression → same hash.
            // Reload first — the dispatcher persisted LastRun*/NextRunAt on its own entity instance,
            // so saving this (stale) one without reloading would clobber that bookkeeping.
            Assert(await f.RoutineDue!.Load(f.RoutineDue!.ID), 'reloading the due routine failed');
            f.RoutineDue!.NextRunAt = new Date(Date.now() - 60_000);
            f.RoutineDue!.NotifyCondition = 'OnChange';
            Assert(await f.RoutineDue!.Save(), `re-arming the routine failed: ${f.RoutineDue!.LatestResult?.CompleteMessage}`);

            const driver = new UserRoutineDispatcherDriver();
            const result = await driver.Execute(await makeDispatcherContext(ctx));
            Assert(result.Success, `second dispatcher sweep failed: ${result.ErrorMessage}`);

            const runs = await fetchRuns(f.RoutineDue!.ID, user);
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
        }
    },
    {
        Id: 'user-routines.UR14',
        Name: 'UR14: deleting a routine that has RUN cascades its run bookkeeping (recipients + runs) then the row — one Delete() call',
        Fn: async (ctx) => {
            const user = ctx.User;
            const f = fx(ctx);
            // routineDue has 2 run rows (UR11/UR13) and lives behind an FK — before the
            // entity-server cascade this Delete() failed on the UserRoutineRun FK.
            const runsBefore = await fetchRuns(f.RoutineDue!.ID, user);
            Assert(runsBefore.length >= 2, `precondition: the due routine must have run rows (got ${runsBefore.length})`);
            const actionLogIds = runsBefore.map((r) => String(r.ActionExecutionLogID ?? '')).filter(Boolean);
            f.OrphanedActionLogIds.push(...actionLogIds);
            f.OrphanedRunIds.push(...runsBefore.map((r) => String(r.ID)));

            Assert(await f.RoutineDue!.Delete(), `routine delete failed: ${f.RoutineDue!.LatestResult?.CompleteMessage}`);
            AssertEqual((await fetchRuns(f.RoutineDue!.ID, user)).length, 0, 'run bookkeeping rows must be gone with the routine');
            const routineGone = await new RunView().RunView({
                EntityName: 'MJ: User Routines',
                ExtraFilter: `ID='${f.RoutineDue!.ID}'`,
                ResultType: 'simple',
                BypassCache: true,
            }, user);
            AssertEqual(routineGone.Results.length, 0, 'the routine row itself must be gone');

            // The LINKED execution records survive — that's where the real telemetry lives.
            for (const logId of actionLogIds) {
                const log = await new RunView().RunView({
                    EntityName: 'MJ: Action Execution Logs',
                    ExtraFilter: `ID='${logId}'`,
                    ResultType: 'simple',
                    BypassCache: true,
                }, user);
                AssertEqual(log.Results.length, 1, 'linked Action Execution Log must survive the routine delete');
            }
        }
    },
    // ── Routine conversations (deterministic — EnsureRoutineConversation directly, no LLM) ──
    {
        Id: 'user-routines.UR15',
        Name: 'UR15: EnsureRoutineConversation creates a hidden, Application-scoped conversation linked to the routine',
        Fn: async (ctx) => {
            const user = ctx.User;
            const f = fx(ctx);
            const r = await makeRoutine(ctx, 'Conversation Mode', (x) => { x.Status = 'Paused'; x.TargetType = 'Action'; });
            const driver = new UserRoutineDispatcherDriver();
            const conversationId = await driver.EnsureRoutineConversation(r, user);
            Assert(conversationId != null, 'expected a conversation to be created (requires the Routines application in the instance)');
            f.CreatedConversationIds.push(conversationId!);
            AssertEqual(String(r.ConversationID), String(conversationId), 'ConversationID must be persisted on the routine');

            const convo = await fetchById('MJ: Conversations', conversationId!, user);
            AssertEqual(String(convo.ApplicationScope), 'Application', 'conversation must be Application-scoped (hidden from the default chat list)');
            Assert(convo.ApplicationID != null, 'Application scope requires a bound ApplicationID (CK_Conversation_ScopeAppBinding)');
            AssertEqual(String(convo.Type), 'Routine', 'conversation Type marks its origin');
            AssertEqual(String(convo.UserID), String(user.ID), 'conversation is owned by the routine owner');
            AssertEqual(String(convo.LinkedRecordID), String(r.ID), 'conversation links back to the routine record');
        }
    },
    {
        Id: 'user-routines.UR16',
        Name: 'UR16: EnsureRoutineConversation is idempotent — the second call reuses the persisted conversation',
        Fn: async (ctx) => {
            const user = ctx.User;
            const f = fx(ctx);
            const r = await makeRoutine(ctx, 'Conversation Reuse', (x) => { x.Status = 'Paused'; x.TargetType = 'Action'; });
            const driver = new UserRoutineDispatcherDriver();
            const first = await driver.EnsureRoutineConversation(r, user);
            Assert(first != null, 'first call must create a conversation');
            f.CreatedConversationIds.push(first!);
            const second = await driver.EnsureRoutineConversation(r, user);
            AssertEqual(String(second), String(first), 'second call must return the SAME conversation, not create another');
        }
    }
];

for (const check of UserRoutinesChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('user-routines', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const user = ctx.User;
        await ActionEngineServer.Instance.Config(false, user);

        // Resolve the referenced (never mutated) executable Action fixture target.
        const calcAction = ActionEngineServer.Instance.Actions.find(a => a.Name === 'Calculate Expression' && a.Status === 'Active');
        Assert(!!calcAction, `need the core 'Calculate Expression' Action (Active) in the instance for the executable fixture`);

        ctx.UserRoutinesFixture = {
            CalcActionID: calcAction!.ID,
            CreatedRoutineIds: [],
            CreatedRecipientIds: [],
            OrphanedActionLogIds: [],
            OrphanedRunIds: [],
            CreatedConversationIds: [],
            FirstRunId: null,
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.UserRoutinesFixture;
        if (!f) {
            return;
        }
        const provider = prov(ctx);
        const user = ctx.User;
        const del = async (entityName: string, id: string) => {
            try {
                // Generic (entity-name-driven) teardown: the base BaseEntity exposes InnerLoad(CompositeKey);
                // the string-keyed Load(id) lives only on the generated subclasses, so use the base method.
                const e = await provider.GetEntityObject<BaseEntity>(entityName, user);
                if (await e.InnerLoad(CompositeKey.FromID(id))) await e.Delete();
            } catch { /* best-effort cleanup */ }
        };

        // Rows UR14's cascade orphaned from the run-row lookup below: the surviving action logs,
        // and the notification rows keyed to the already-deleted runs.
        for (const logId of f.OrphanedActionLogIds) await del('MJ: Action Execution Logs', logId);
        for (const runId of f.OrphanedRunIds) {
            try {
                await provider.ExecuteSQL(
                    `DELETE FROM [${provider.MJCoreSchemaName}].[UserNotification] WHERE ResourceConfiguration LIKE '%${runId}%'`,
                    [],
                    { isMutation: true, description: 'user-routines: cleanup notifications for cascade-deleted runs' },
                    user
                );
            } catch { /* best-effort cleanup */ }
        }

        for (const routineId of f.CreatedRoutineIds) {
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
                            { isMutation: true, description: 'user-routines: cleanup in-app notifications' },
                            user
                        );
                    } catch { /* best-effort cleanup */ }
                    await del('MJ: User Routine Runs', run.ID);
                    if (run.ActionExecutionLogID) await del('MJ: Action Execution Logs', run.ActionExecutionLogID);
                }
            } catch { /* best-effort cleanup */ }
        }
        for (const id of f.CreatedRecipientIds) await del('MJ: User Routine Recipients', id);
        for (const id of f.CreatedRoutineIds) await del('MJ: User Routines', id);
        // Conversations AFTER routines — UserRoutine.ConversationID FK-references them.
        for (const id of f.CreatedConversationIds) await del('MJ: Conversations', id);
        ctx.UserRoutinesFixture = undefined;
    }
});
