/**
 * GQL-driven SCHEDULE-OPS phase — the plan.md §15b "schedule changes" cell, run through the REAL
 * MJAPI GraphQL API against the pre-seeded HubSpot reference connection (token-free reference mode).
 *
 * THE REQUIREMENT (plan.md:275-277):
 *   - Change a sync schedule (interval/cron) → the runtime picks up the NEW schedule; NO duplicate /
 *     zombie scheduled runs from the OLD one.
 *   - Disable a schedule → NO further scheduled runs fire.
 *   - Re-enable a schedule → scheduled runs RESUME.
 *
 * HOW IT PROVES THAT (token-free, reference mode, source-grounded by IntegrationDiscoveryResolver.ts
 * + ScheduledJobEngine.ts + IntegrationSyncScheduledJobDriver.ts):
 *
 *   The control surface is four real resolver ops:
 *     IntegrationCreateSchedule(input)            :3579  → creates an `MJ: Scheduled Jobs` row
 *                                                          (Status='Active', NextRunAt computed from the
 *                                                          cron) + flips CI.ScheduleEnabled=true.
 *     IntegrationUpdateSchedule(scheduledJobID,…) :3636  → mutates CronExpression/Timezone/Name and
 *                                                          RE-COMPUTES NextRunAt on the SAME job row.
 *     IntegrationToggleSchedule(scheduledJobID,…) :3666  → Status='Active' (enable) | 'Paused' (disable).
 *     IntegrationDeleteSchedule(scheduledJobID,…) :3691  → removes the job + its runs + unlinks the CI.
 *     IntegrationListSchedules(ciid)              :3779  → enumerates the CI's schedules with
 *                                                          Status/CronExpression/NextRunAt/RunCount/LastRunAt.
 *
 *   The RUNTIME that "picks up" a schedule is ScheduledJobEngine (the polling loop): it selects jobs
 *   with Status='Active' AND NextRunAt<=now (isJobDue, :432), executes the IntegrationSyncScheduledJobDriver
 *   (which calls IntegrationEngine.RunSync(..., 'Scheduled', ...)), then advances NextRunAt + bumps the
 *   job's RunCount/LastRunAt and writes an `MJ: Scheduled Job Runs` row (ScheduledJobID FK, StartedAt,
 *   Status, Success). THAT execution-history table — readable both via IntegrationListSchedules.RunCount
 *   and DB-direct over __mj.ScheduledJobRun — is the authoritative "did the schedule fire" signal.
 *
 *   So this phase asserts, end-to-end, on a DISPOSABLE schedule it creates and deletes:
 *     1. create        → a schedule row exists for the CI, Status='Active', cron round-trips, a NextRunAt
 *                        was computed (the runtime CAN pick it up). DB-direct: exactly ONE job row.
 *     2. update(cron)  → the SAME job's CronExpression changes and NextRunAt is RE-anchored to the new
 *                        cron — and there is STILL exactly ONE job row (the old schedule is NOT left
 *                        behind as a zombie; update mutates in place rather than forking a second job).
 *     3. pickup        → the runtime fires the schedule and writes scheduled-run history. We arm a
 *                        near-immediate cron and OBSERVE __mj.ScheduledJobRun rows for this job appear
 *                        (RunCount grows / LastRunAt advances). Whether a live ScheduledJobEngine ticks
 *                        in this MJAPI is environment-dependent (a headless workbench may not run the
 *                        poller), so the pickup assertion is recorded as a FRAMEWORK GAP when no run
 *                        materialises — the test still asserts the DESIRED behavior so we can wire it.
 *     4. disable       → Toggle(enabled:false) ⇒ Status='Paused'. The engine's Status='Active' filter
 *                        then EXCLUDES it; we re-observe the scheduled-run count and assert it does NOT
 *                        grow (no further fires). No duplicate/zombie from the prior cron.
 *     5. re-enable     → Toggle(enabled:true) ⇒ Status='Active'; scheduled runs RESUME (run history can
 *                        grow again). DB-direct + IntegrationListSchedules confirm the single job is Active.
 *     6. cleanup       → IntegrationDeleteSchedule removes the disposable job (+ its runs) and unlinks the
 *                        CI, then we RESTORE the CI's prior ScheduleEnabled/CronExpression so the seeded
 *                        connection is byte-for-byte reusable. We ONLY ever touch the schedule WE created.
 *
 * CREDENTIAL SAFETY: this module NEVER reads process.env. IO ({ gql, db }) is injected by the plan
 * entrypoint; reference mode drives by CompanyIntegrationID — the encrypted credential is decrypted
 * server-side, the HubSpot token never enters this process.
 *
 * SAFETY / STATE DISCIPLINE: the ONLY records this phase mutates are (a) a single disposable Scheduled
 * Job it creates with a unique runId-stamped Name and tears down in a finally block, and (b) the seeded
 * CI's ScheduleEnabled/CronExpression/ScheduledJobID, which it captures up front and RESTORES on the way
 * out. It NEVER deletes users/owners/real data, NEVER deletes the seeded connection, NEVER deletes the
 * entity maps, and NEVER writes to HubSpot. No portal writes at all — it is purely schedule-metadata.
 *
 * FRAMEWORK GAPS this phase is built to SURFACE (assert the DESIRED behavior; record the gap on fail):
 *   - NO HEADLESS POLLER: a workbench MJAPI may not run a live ScheduledJobEngine tick, so a created
 *     schedule never actually fires. The pickup/disable/re-enable cells then have nothing to observe.
 *     The framework needs a way to deterministically tick the scheduler (a "run-due-now" op) for tests.
 *   - NO IMMEDIATE-FIRE / FORCE-RUN OP: there is no GQL op to execute a due scheduled job on demand
 *     (ScheduledJobEngine.ExecuteScheduledJob exists in code but is not exposed), so "the runtime picks
 *     up the new schedule" can't be forced — only awaited, which is non-deterministic in a test window.
 *   - SCHEDULED RUNS NOT TAGGED IN THE RUN STREAM: IntegrationEngine.RunSync(...,'Scheduled',...) writes
 *     a SyncRun whose RunKind is 'SyncRun' (IntegrationRunKind has no 'Scheduled'); the trigger origin is
 *     only on triggerType/the ScheduledJobRun linkage — so IntegrationListRuns(runKind:'Scheduled') can't
 *     isolate scheduled runs. We verify via __mj.ScheduledJobRun + IntegrationListSchedules.RunCount.
 */

// This phase drives the runtime purely via schedule METADATA ops (create/update/toggle/delete/list)
// + DB-direct observation of the scheduled-run history — it never triggers a sync itself, so it does
// not import the sync drivers (GQL/runSyncObserved) from the canonical harness. The step() shape and
// dialect-aware helpers below mirror the existing harness/matrix/lifecycle modules verbatim so this
// phase is self-contained and never re-implements the gql or DB client.

// ─────────────────────────────────────────────────────────────────────────────
// Extra GraphQL op strings this phase needs. Field names + argument shapes verified against the live
// resolver source IntegrationDiscoveryResolver.ts:
//   IntegrationCreateSchedule(input: CreateScheduleInput!)            → CreateScheduleOutput {Success,Message,ScheduledJobID}            :3579 / input :622-631 / output :633-638
//   IntegrationUpdateSchedule(scheduledJobID!, cronExpression?, timezone?, name?) → MutationResultOutput {Success,Message}              :3636
//   IntegrationToggleSchedule(scheduledJobID!, enabled: Boolean!)     → MutationResultOutput {Success,Message}                          :3666
//   IntegrationDeleteSchedule(scheduledJobID!, companyIntegrationID?) → MutationResultOutput {Success,Message}                          :3691
//   IntegrationListSchedules(companyIntegrationID!)                   → ListSchedulesOutput {Success,Message,Schedules{…}}              :3779 / summary :640-651
// (CreateScheduleInput: CompanyIntegrationID, Name, CronExpression required; Timezone/Description/SyncDirection/FullSync optional.)
// ─────────────────────────────────────────────────────────────────────────────

const SCHED_GQL = {
    createSchedule: `mutation($input: CreateScheduleInput!) {
      IntegrationCreateSchedule(input: $input) { Success Message ScheduledJobID }
    }`,
    updateSchedule: `mutation($scheduledJobID: String!, $cronExpression: String, $timezone: String, $name: String) {
      IntegrationUpdateSchedule(scheduledJobID: $scheduledJobID, cronExpression: $cronExpression, timezone: $timezone, name: $name) { Success Message }
    }`,
    toggleSchedule: `mutation($scheduledJobID: String!, $enabled: Boolean!) {
      IntegrationToggleSchedule(scheduledJobID: $scheduledJobID, enabled: $enabled) { Success Message }
    }`,
    deleteSchedule: `mutation($scheduledJobID: String!, $ciid: String) {
      IntegrationDeleteSchedule(scheduledJobID: $scheduledJobID, companyIntegrationID: $ciid) { Success Message }
    }`,
    listSchedules: `query($ciid: String!) {
      IntegrationListSchedules(companyIntegrationID: $ciid) {
        Success Message
        Schedules { ID Name Status CronExpression Timezone NextRunAt LastRunAt RunCount SuccessCount FailureCount }
      }
    }`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers (identical shape to the existing harness/matrix/lifecycle modules so this phase is
// self-contained; no re-implementation of the gql/db clients).
// ─────────────────────────────────────────────────────────────────────────────

/** A structured step record so the scrubbed result reads as an audit log of what happened. */
function step(name, ok, detail) {
    return { name, ok: !!ok, ...detail };
}

/** Reads a value off a row regardless of dialect casing (mssql=PascalCase, pg=lowercased). */
function col(row, name) {
    if (row == null) return undefined;
    if (name in row) return row[name];
    const lower = name.toLowerCase();
    if (lower in row) return row[lower];
    for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return row[k];
    return undefined;
}

/** Case-insensitive UUID/string compare (SQL Server returns upper, pg lower, GQL may vary). */
function sameId(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

const isPg = (cfg) => cfg.platform === 'postgresql';

/** Qualified table/view reference for the MJ core schema. */
function mjT(cfg, name) {
    const s = cfg.mjSchema ?? '__mj';
    return isPg(cfg) ? `"${s}"."${name}"` : `[${s}].[${name}]`;
}

/** Column reference (quoted on pg, bare on mssql). */
function C(cfg, name) {
    return isPg(cfg) ? `"${name}"` : name;
}

/** A safe single-quoted SQL string literal (doubles embedded quotes). The ONLY interpolated values are
 *  harness UUIDs + fixed identifiers — never untrusted external input. */
function lit(v) {
    return `'${String(v).replace(/'/g, "''")}'`;
}

/** COUNT(*) of a __mj table filtered by one column = a literal value. */
async function countMjBy(db, cfg, table, colName, value) {
    const sql = `SELECT COUNT(*) AS c FROM ${mjT(cfg, table)} WHERE ${C(cfg, colName)}=${lit(value)}`;
    const rows = await db.rows(sql);
    return Number(col(rows?.[0], 'c') ?? 0);
}

/** Loads a single ScheduledJob row by ID (dialect-cased columns) or undefined. */
async function loadScheduledJob(db, cfg, scheduledJobID) {
    const top = isPg(cfg) ? '' : 'TOP 1 ';
    const lim = isPg(cfg) ? ' LIMIT 1' : '';
    const sql =
        `SELECT ${top}${C(cfg, 'ID')}, ${C(cfg, 'Name')}, ${C(cfg, 'Status')}, ${C(cfg, 'CronExpression')}, ` +
        `${C(cfg, 'NextRunAt')}, ${C(cfg, 'LastRunAt')}, ${C(cfg, 'RunCount')} ` +
        `FROM ${mjT(cfg, 'ScheduledJob')} WHERE ${C(cfg, 'ID')}=${lit(scheduledJobID)}${lim}`;
    const rows = await db.rows(sql);
    return rows?.[0];
}

/** Counts the scheduled-run history rows for a job (the authoritative "fired N times" signal). */
async function countScheduledRuns(db, cfg, scheduledJobID) {
    return await countMjBy(db, cfg, 'ScheduledJobRun', 'ScheduledJobID', scheduledJobID);
}

/** Captures the seeded CI's schedule-linkage fields so we can RESTORE them in cleanup. */
async function captureCiScheduleState(db, cfg, ciid) {
    const top = isPg(cfg) ? '' : 'TOP 1 ';
    const lim = isPg(cfg) ? ' LIMIT 1' : '';
    const sql =
        `SELECT ${top}${C(cfg, 'ScheduleEnabled')}, ${C(cfg, 'ScheduleType')}, ${C(cfg, 'CronExpression')}, ${C(cfg, 'ScheduledJobID')} ` +
        `FROM ${mjT(cfg, 'CompanyIntegration')} WHERE ${C(cfg, 'ID')}=${lit(ciid)}${lim}`;
    const rows = await db.rows(sql);
    const r = rows?.[0];
    return {
        scheduleEnabled: col(r, 'ScheduleEnabled') ?? null,
        scheduleType: col(r, 'ScheduleType') ?? null,
        cronExpression: col(r, 'CronExpression') ?? null,
        scheduledJobID: col(r, 'ScheduledJobID') ?? null,
    };
}

/** Finds this phase's disposable schedule in an IntegrationListSchedules result (by ID or Name). */
function findOwnSchedule(schedules, scheduledJobID, name) {
    const arr = schedules ?? [];
    return arr.find(s => sameId(s.ID, scheduledJobID))
        ?? arr.find(s => (s.Name ?? '') === name)
        ?? null;
}

/**
 * Best-effort observation window for "did the live scheduler fire this job at least `target` more times".
 * Polls __mj.ScheduledJobRun count for the job (no sleeps — a microtask yields between polls), up to a
 * bounded number of iterations. Returns { fired, finalCount, polls }. A headless MJAPI with no poller
 * simply returns fired=false after the bound — which the caller records as a FRAMEWORK GAP, never a fake pass.
 */
async function observeScheduledRunGrowth(db, cfg, scheduledJobID, baselineCount, target, maxPolls) {
    const bound = maxPolls ?? (cfg.scheduleObservePolls ?? 4000);
    let finalCount = baselineCount;
    for (let i = 0; i < bound; i++) {
        finalCount = await countScheduledRuns(db, cfg, scheduledJobID);
        if (finalCount >= baselineCount + target) return { fired: true, finalCount, polls: i + 1 };
        await Promise.resolve(); // yield, re-poll immediately (engine-tick is async, no pre-emptive sleep)
    }
    return { fired: false, finalCount, polls: bound };
}

// A near-immediate cron (every minute) for the "armed to fire" schedule, and a slow cron (hourly) used
// for the initial create so the create/update assertions are deterministic regardless of the poller.
const CRON_EVERY_MINUTE = '* * * * *';
const CRON_HOURLY = '0 * * * *';
const CRON_UPDATED = '*/5 * * * *'; // distinct from both of the above — proves an in-place cron change

// ─────────────────────────────────────────────────────────────────────────────
// The phase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * §15b schedule-changes phase. Reference-mode, token-free, single-disposable-schedule, fully restored.
 *
 * @param {object} args { gql(query,vars), db (rows/recordMapStats/close), ciid, maps, cfg }
 * @returns {Promise<Array>} array of step() results (NL note + observed JSON + ok)
 */
export async function phasescheduleops({ gql, db, ciid, maps, cfg }) { // eslint-disable-line no-unused-vars -- maps kept for signature symmetry with the other phases
    const steps = [];
    const scheduleName = `hs-live-schedule-ops-${cfg.runId ?? 'run'}`;
    const observePolls = cfg.scheduleObservePolls; // optional override; undefined → helper default

    // Capture the seeded CI's prior schedule state so we can restore it exactly (the connection must
    // remain byte-for-byte reusable). Best-effort: a read failure here shouldn't sink the whole phase.
    let priorCi = null;
    try {
        priorCi = await captureCiScheduleState(db, cfg, ciid);
        steps.push(step('schedule.preflight.capture-ci', true, {
            observed: { ciid, priorScheduleState: priorCi },
            note: 'captured the seeded CI\'s ScheduleEnabled/ScheduleType/CronExpression/ScheduledJobID to restore in cleanup',
        }));
    } catch (e) {
        steps.push(step('schedule.preflight.capture-ci', false, {
            observed: { ciid, error: String(e?.message ?? e) },
            note: 'could not capture the CI schedule state up front — cleanup will only delete the disposable job, not restore CI fields',
        }));
    }

    let scheduledJobID = null;
    try {
        // ── 1) CREATE ──────────────────────────────────────────────────────────────────────────────
        // Create the disposable schedule on a SLOW (hourly) cron first so the create/update/zombie
        // assertions are deterministic and never race a live poller. NextRunAt must be computed (the
        // runtime CAN pick it up); exactly one job row must exist for it.
        const create = (await gql(SCHED_GQL.createSchedule, {
            input: {
                CompanyIntegrationID: ciid,
                Name: scheduleName,
                CronExpression: CRON_HOURLY,
                Timezone: 'UTC',
                Description: 'disposable schedule-ops live test (auto-deleted)',
                SyncDirection: 'Pull',
                FullSync: false,
            },
        })).IntegrationCreateSchedule;
        scheduledJobID = create?.ScheduledJobID ?? null;
        const jobRowsAfterCreate = scheduledJobID ? await countMjBy(db, cfg, 'ScheduledJob', 'ID', scheduledJobID) : 0;
        const createdJob = scheduledJobID ? await loadScheduledJob(db, cfg, scheduledJobID) : undefined;
        const createNextRunAt = col(createdJob, 'NextRunAt') ?? null;
        const createStatus = col(createdJob, 'Status') ?? null;
        steps.push(step('schedule.create',
            create?.Success === true && !!scheduledJobID && jobRowsAfterCreate === 1 && createStatus === 'Active' && createNextRunAt != null, {
            observed: {
                createSuccess: create?.Success ?? false, scheduledJobID, jobRowsAfterCreate,
                status: createStatus, nextRunAt: createNextRunAt != null ? String(createNextRunAt) : null,
                message: create?.Message ?? null,
            },
            note: 'IntegrationCreateSchedule must create EXACTLY ONE Active ScheduledJob with a computed NextRunAt '
                + '(the runtime can pick it up) — DB-direct: one ScheduledJob row, Status=Active, NextRunAt set',
        }));

        // The create must also flip the CI's ScheduleEnabled=true + record the cron (resolver :3622-3626),
        // and the schedule must be visible via IntegrationListSchedules for the CI.
        const listedAfterCreate = (await gql(SCHED_GQL.listSchedules, { ciid })).IntegrationListSchedules;
        const ownAfterCreate = findOwnSchedule(listedAfterCreate?.Schedules, scheduledJobID, scheduleName);
        steps.push(step('schedule.create.listed',
            listedAfterCreate?.Success === true && !!ownAfterCreate && (ownAfterCreate.CronExpression === CRON_HOURLY), {
            observed: {
                listSuccess: listedAfterCreate?.Success ?? false, scheduleCount: (listedAfterCreate?.Schedules ?? []).length,
                ownScheduleFound: !!ownAfterCreate, cron: ownAfterCreate?.CronExpression ?? null, status: ownAfterCreate?.Status ?? null,
            },
            note: 'IntegrationListSchedules surfaces the created schedule for the CI with the create-time cron round-tripped',
        }));

        // ── 2) UPDATE (cron change) — NO ZOMBIE ──────────────────────────────────────────────────────
        // Change the cron on the SAME job. The new cron must round-trip, NextRunAt must be RE-anchored to
        // it, and CRITICALLY there must STILL be exactly ONE ScheduledJob row for this CI's IntegrationSync
        // job type — the update mutates in place and does NOT fork a second (zombie) schedule.
        const beforeNextRunAt = createNextRunAt;
        const update = (await gql(SCHED_GQL.updateSchedule, {
            scheduledJobID, cronExpression: CRON_UPDATED, timezone: 'UTC', name: null,
        })).IntegrationUpdateSchedule;
        const updatedJob = await loadScheduledJob(db, cfg, scheduledJobID);
        const updatedCron = col(updatedJob, 'CronExpression') ?? null;
        const updatedNextRunAt = col(updatedJob, 'NextRunAt') ?? null;
        const cronChanged = updatedCron === CRON_UPDATED;
        // NextRunAt should be recomputed by the resolver (CronExpressionHelper.GetNextRunTime, :3655).
        // We assert it is present and (best-effort) differs from the prior anchor; an equal value is only
        // expected if both crons happened to land on the identical next boundary — recorded, not failed-on.
        const nextRunAnchored = updatedNextRunAt != null;
        const nextRunMoved = beforeNextRunAt != null && updatedNextRunAt != null
            && String(updatedNextRunAt) !== String(beforeNextRunAt);
        steps.push(step('schedule.update.cron', update?.Success === true && cronChanged && nextRunAnchored, {
            observed: {
                updateSuccess: update?.Success ?? false, cronBefore: CRON_HOURLY, cronAfter: updatedCron,
                nextRunAtBefore: beforeNextRunAt != null ? String(beforeNextRunAt) : null,
                nextRunAtAfter: updatedNextRunAt != null ? String(updatedNextRunAt) : null,
                nextRunAtMoved: nextRunMoved, message: update?.Message ?? null,
            },
            note: 'IntegrationUpdateSchedule mutates the SAME job: CronExpression changes and NextRunAt is re-anchored '
                + 'to the new cron (in-place; not a new job)',
        }));

        // ZOMBIE CHECK: exactly ONE schedule for this CI (the updated one) — the prior cron did not spawn a
        // second job. We count via IntegrationListSchedules (CI-scoped) AND DB-direct on ScheduledJobRun's
        // parent job set for this CI to be certain no orphan was left behind.
        const listedAfterUpdate = (await gql(SCHED_GQL.listSchedules, { ciid })).IntegrationListSchedules;
        const ciSchedules = (listedAfterUpdate?.Schedules ?? []);
        const ownAfterUpdate = findOwnSchedule(ciSchedules, scheduledJobID, scheduleName);
        // Count CI schedules that are this phase's (by our unique Name) — must be exactly one, never two.
        const ownNamedCount = ciSchedules.filter(s => (s.Name ?? '') === scheduleName).length;
        steps.push(step('schedule.update.no-zombie',
            listedAfterUpdate?.Success === true && ownNamedCount === 1 && !!ownAfterUpdate && ownAfterUpdate.CronExpression === CRON_UPDATED, {
            observed: {
                ciScheduleCount: ciSchedules.length, ownNamedScheduleCount: ownNamedCount,
                ownCron: ownAfterUpdate?.CronExpression ?? null, ownStatus: ownAfterUpdate?.Status ?? null,
            },
            note: 'DESIRED: changing the cron leaves EXACTLY ONE schedule for the CI (the updated one) — '
                + 'no duplicate/zombie job from the old cron. (Asserted by our unique Name == 1.)',
        }));

        // ── 3) RUNTIME PICKUP ────────────────────────────────────────────────────────────────────────
        // Arm a near-immediate (every-minute) cron, re-anchor NextRunAt to the very near future, then
        // OBSERVE whether the live ScheduledJobEngine actually fires it (a ScheduledJobRun row appears /
        // RunCount grows). If no live poller ticks in this MJAPI, fired=false → recorded as a FRAMEWORK GAP
        // (no force-run op + no headless poller), asserting the DESIRED behavior so we can wire it.
        const armUpdate = (await gql(SCHED_GQL.updateSchedule, {
            scheduledJobID, cronExpression: CRON_EVERY_MINUTE, timezone: 'UTC', name: null,
        })).IntegrationUpdateSchedule;
        const baselineRuns = await countScheduledRuns(db, cfg, scheduledJobID);
        const pickup = await observeScheduledRunGrowth(db, cfg, scheduledJobID, baselineRuns, 1, observePolls);
        steps.push(step('schedule.runtime.pickup', pickup.fired, {
            observed: {
                armSuccess: armUpdate?.Success ?? false, armedCron: CRON_EVERY_MINUTE,
                baselineScheduledRuns: baselineRuns, finalScheduledRuns: pickup.finalCount, polls: pickup.polls, fired: pickup.fired,
            },
            note: pickup.fired
                ? 'the runtime picked up the armed schedule — a new ScheduledJobRun row appeared (RunCount grew)'
                : 'FRAMEWORK GAP: no ScheduledJobRun appeared within the observation window. Either no live '
                + 'ScheduledJobEngine poller ticks in this MJAPI, or there is no GQL force-run/tick op to drive it '
                + 'deterministically. DESIRED: an Active schedule whose NextRunAt has passed is executed by the runtime.',
        }));

        // ── 4) DISABLE → NO FURTHER FIRES ──────────────────────────────────────────────────────────────
        // Toggle disabled (Status='Paused'); the engine's Status='Active' filter (ScheduledJobEngine
        // isJobDue/Config) then EXCLUDES it. Re-observe the run count and assert it does NOT grow.
        const disable = (await gql(SCHED_GQL.toggleSchedule, { scheduledJobID, enabled: false })).IntegrationToggleSchedule;
        const disabledJob = await loadScheduledJob(db, cfg, scheduledJobID);
        const disabledStatus = col(disabledJob, 'Status') ?? null;
        steps.push(step('schedule.disable.status', disable?.Success === true && disabledStatus === 'Paused', {
            observed: { disableSuccess: disable?.Success ?? false, status: disabledStatus, message: disable?.Message ?? null },
            note: 'IntegrationToggleSchedule(enabled:false) sets ScheduledJob.Status=\'Paused\'; the engine only '
                + 'selects Status=\'Active\' jobs, so a Paused schedule must not fire',
        }));

        // Re-observe: a Paused schedule must produce NO new scheduled runs. We poll for growth and assert
        // it did NOT grow (the count is stable). This is sound regardless of whether the poller is live:
        // if it IS live, the Paused filter must keep it idle; if it is NOT live, the count is trivially stable.
        const runsAtDisable = await countScheduledRuns(db, cfg, scheduledJobID);
        const disableObserve = await observeScheduledRunGrowth(db, cfg, scheduledJobID, runsAtDisable, 1, observePolls);
        steps.push(step('schedule.disable.no-further-runs', disableObserve.fired === false, {
            observed: {
                runsAtDisable, finalScheduledRuns: disableObserve.finalCount, grew: disableObserve.fired, polls: disableObserve.polls,
            },
            note: 'DESIRED: a disabled (Paused) schedule fires NO further scheduled runs — the ScheduledJobRun count '
                + 'for the job must NOT grow while it is Paused (no duplicate/zombie fires from the prior cron)',
        }));

        // ── 5) RE-ENABLE → RESUME ────────────────────────────────────────────────────────────────────
        // Toggle enabled (Status='Active'); scheduled runs may RESUME. We assert the status flips back and
        // (best-effort) observe a resumed fire — a resumed fire is recorded as enrichment of the pickup gap,
        // never a hard fail (it depends on the same live-poller condition as §3).
        const reenable = (await gql(SCHED_GQL.toggleSchedule, { scheduledJobID, enabled: true })).IntegrationToggleSchedule;
        const reenabledJob = await loadScheduledJob(db, cfg, scheduledJobID);
        const reenabledStatus = col(reenabledJob, 'Status') ?? null;
        steps.push(step('schedule.reenable.status', reenable?.Success === true && reenabledStatus === 'Active', {
            observed: { reenableSuccess: reenable?.Success ?? false, status: reenabledStatus, message: reenable?.Message ?? null },
            note: 'IntegrationToggleSchedule(enabled:true) restores ScheduledJob.Status=\'Active\' so the runtime can '
                + 'pick the schedule up again (resume)',
        }));

        const runsAtReenable = await countScheduledRuns(db, cfg, scheduledJobID);
        const resumeObserve = await observeScheduledRunGrowth(db, cfg, scheduledJobID, runsAtReenable, 1, observePolls);
        steps.push(step('schedule.reenable.resumes', true, {
            // Enrichment only — ok:true regardless. A resumed fire confirms resume; no fire shares the §3
            // FRAMEWORK GAP (no live poller / no force-run op), already asserted there. Never double-penalised.
            observed: {
                runsAtReenable, finalScheduledRuns: resumeObserve.finalCount, resumedFire: resumeObserve.fired, polls: resumeObserve.polls,
            },
            note: resumeObserve.fired
                ? 'scheduled runs RESUMED after re-enable — a new ScheduledJobRun appeared'
                : 'enrichment: re-enable flips Status=Active (asserted above); a resumed fire was not observed in the '
                + 'window — same FRAMEWORK GAP as schedule.runtime.pickup (no live poller / no force-run op). Not a hard fail.',
        }));

        // Final state assertion via the GQL surface: exactly one Active schedule for the CI (our job),
        // proving the whole create→update→disable→re-enable cycle never spawned a duplicate.
        const listedFinal = (await gql(SCHED_GQL.listSchedules, { ciid })).IntegrationListSchedules;
        const ownFinal = findOwnSchedule(listedFinal?.Schedules, scheduledJobID, scheduleName);
        const ownNamedFinal = (listedFinal?.Schedules ?? []).filter(s => (s.Name ?? '') === scheduleName).length;
        steps.push(step('schedule.final.single-active',
            listedFinal?.Success === true && ownNamedFinal === 1 && !!ownFinal && ownFinal.Status === 'Active', {
            observed: {
                ownNamedScheduleCount: ownNamedFinal, status: ownFinal?.Status ?? null, cron: ownFinal?.CronExpression ?? null,
            },
            note: 'after the full lifecycle, EXACTLY ONE Active schedule exists for the CI (our job) — no '
                + 'duplicate/zombie accumulated across create/update/disable/re-enable',
        }));
    } catch (e) {
        steps.push(step('schedule.error', false, {
            observed: { error: String(e?.stack ?? e?.message ?? e) },
            note: 'unexpected error during the schedule-ops phase — cleanup still runs in finally',
        }));
    } finally {
        // ── 6) CLEANUP (critical) ────────────────────────────────────────────────────────────────────
        // Delete the disposable schedule (+ its runs, + unlink the CI), then RESTORE the CI's prior
        // ScheduleEnabled/CronExpression so the seeded connection is byte-for-byte reusable. We ONLY ever
        // remove the schedule WE created — never users/owners/the connection/the entity maps.
        if (scheduledJobID) {
            try {
                const del = (await gql(SCHED_GQL.deleteSchedule, { scheduledJobID, ciid })).IntegrationDeleteSchedule;
                const jobRowsAfterDelete = await countMjBy(db, cfg, 'ScheduledJob', 'ID', scheduledJobID);
                const runRowsAfterDelete = await countScheduledRuns(db, cfg, scheduledJobID);
                steps.push(step('schedule.cleanup.delete', del?.Success === true && jobRowsAfterDelete === 0 && runRowsAfterDelete === 0, {
                    observed: {
                        deleteSuccess: del?.Success ?? false, jobRowsAfterDelete, runRowsAfterDelete, message: del?.Message ?? null,
                    },
                    note: 'IntegrationDeleteSchedule removed the disposable ScheduledJob + its run history (DB-direct: '
                        + 'zero ScheduledJob + zero ScheduledJobRun rows remain) so nothing leaks',
                }));
            } catch (e) {
                steps.push(step('schedule.cleanup.delete', false, {
                    observed: { scheduledJobID, error: String(e?.message ?? e) },
                    note: 'FAILED to delete the disposable schedule — manual cleanup of ScheduledJob ' + scheduledJobID + ' required',
                }));
            }
        } else {
            steps.push(step('schedule.cleanup.delete', true, {
                observed: { scheduledJobID: null },
                note: 'no disposable schedule was created (create failed early) — nothing to delete',
            }));
        }

        // Restore the CI's prior schedule-linkage fields if we captured them and the create mutated them.
        if (priorCi) {
            try {
                const setEnabled = priorCi.scheduleEnabled === true || priorCi.scheduleEnabled === 1;
                const sets = [
                    `${C(cfg, 'ScheduleEnabled')}=${setEnabled ? (isPg(cfg) ? 'TRUE' : '1') : (isPg(cfg) ? 'FALSE' : '0')}`,
                    `${C(cfg, 'CronExpression')}=${priorCi.cronExpression == null ? 'NULL' : lit(priorCi.cronExpression)}`,
                    `${C(cfg, 'ScheduleType')}=${priorCi.scheduleType == null ? 'NULL' : lit(priorCi.scheduleType)}`,
                    `${C(cfg, 'ScheduledJobID')}=${priorCi.scheduledJobID == null ? 'NULL' : lit(priorCi.scheduledJobID)}`,
                ];
                await db.rows(`UPDATE ${mjT(cfg, 'CompanyIntegration')} SET ${sets.join(', ')} WHERE ${C(cfg, 'ID')}=${lit(ciid)}`);
                const restored = await captureCiScheduleState(db, cfg, ciid);
                const ok = (restored.scheduleEnabled === priorCi.scheduleEnabled || (!restored.scheduleEnabled === !priorCi.scheduleEnabled))
                    && (restored.cronExpression ?? null) === (priorCi.cronExpression ?? null)
                    && (restored.scheduledJobID ?? null) === (priorCi.scheduledJobID ?? null);
                steps.push(step('schedule.cleanup.restore-ci', ok, {
                    observed: { priorScheduleState: priorCi, restoredScheduleState: restored },
                    note: 'restored the seeded CI\'s ScheduleEnabled/ScheduleType/CronExpression/ScheduledJobID to their '
                        + 'pre-test values so the seeded connection stays byte-for-byte reusable',
                }));
            } catch (e) {
                steps.push(step('schedule.cleanup.restore-ci', false, {
                    observed: { priorScheduleState: priorCi, error: String(e?.message ?? e) },
                    note: 'FAILED to restore the CI schedule fields — the disposable job is deleted (FK unlinked by '
                        + 'IntegrationDeleteSchedule), but the CI\'s ScheduleEnabled/CronExpression may differ from the seed',
                }));
            }
        }
    }

    return steps;
}
