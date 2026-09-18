/**
 * @fileoverview The compare-and-swap claim protocol for durable task execution.
 *
 * This is the mechanism that lets more than one dispatcher instance work the same task table
 * without two of them running the same task, and that lets a crashed instance's work be picked up
 * rather than stranded. It is deliberately a small, self-contained unit: every state transition is
 * a guarded `UPDATE ... WHERE <expected state>` whose rowcount is the answer, so correctness rests
 * on the database's own atomicity rather than on a distributed lock manager.
 *
 * **Why rowcount and not read-then-write.** Reading a task, deciding it is claimable, then writing
 * the claim is a textbook race: two instances can both read `Pending`. The single-statement form —
 * `UPDATE Task SET ClaimedBy=@me WHERE ID=@id AND Status='Pending'` — makes the check and the write
 * one atomic operation, so exactly one instance sees rowcount 1 and the other sees 0 and moves on.
 *
 * **Why every transition is guarded, not just the initial claim.** Per D20 the Task table stays
 * user-writable: entity forms, Data Explorer, GraphQL, and any agent holding an update-record action
 * can change `Status` or clear `ClaimedBy` underneath a running executor. A completion write that
 * only said "set this task Complete" would happily overwrite a task someone had reassigned. Guarding
 * on `ClaimedBy=@me` means a stale executor's write fails cleanly (rowcount 0) instead of
 * double-completing, and the dispatcher can defer to the sweep.
 *
 * @module @memberjunction/task-graph
 */
import { IMetadataProvider, DatabaseProviderBase, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { TERMINAL_TASK_GRAPH_STATUSES, type TerminalTaskGraphStatus } from '@memberjunction/ai-core-plus';
import { MachineTaskSQL } from './task-predicates';
import { ReconciliationEvent } from './types';

/**
 * A value one debug-bag field is being set to.
 *
 * Discriminated so the statement renders each with the right JSON type — a boolean stored as the
 * string `"true"` reads back as truthy-but-wrong, and an object stored as a string reads back as a
 * string. `null` deletes the key.
 */
export type TaskGraphDebugFieldValue =
    | { Kind: 'null' }
    | { Kind: 'bool'; Value: boolean }
    | { Kind: 'string'; Value: string }
    /** Pre-serialized JSON for an object or array. */
    | { Kind: 'json'; Value: string };

/** One field of the debug bag, addressed by its JSON path. */
export type TaskGraphDebugFieldWrite = {
    Path: string;
    Value: TaskGraphDebugFieldValue;
};

/**
 * Every object path that must exist for a JSON path to be writable — i.e. its proper prefixes,
 * excluding the root and the leaf itself.
 *
 * `$.debug.edgeOverrides."abc"` → `['$.debug', '$.debug.edgeOverrides']`.
 *
 * Exported and pure because the rule ("JSON_MODIFY does not create intermediate objects") is the
 * kind of database behaviour that is easy to assume wrongly and cheap to pin with a test.
 */
export function ContainingPaths(path: string): string[] {
    const segments: string[] = [];
    let current = '';
    let quoted = false;
    for (const char of path) {
        if (char === '"') { quoted = !quoted; current += char; continue; }
        if (char === '.' && !quoted) { segments.push(current); current = ''; continue; }
        current += char;
    }
    segments.push(current);

    // Drop the root ('$') and the leaf: neither needs creating — the root is the document, and the
    // leaf is what the caller is about to write.
    const containers: string[] = [];
    for (let i = 2; i < segments.length; i++) {
        containers.push(segments.slice(0, i).join('.'));
    }
    return containers;
}

/**
 * One argument to a task-graph procedure.
 *
 * Named because SQL Server binds by name, and carrying the name alongside the value keeps a call
 * site from silently shifting every argument by one when a parameter is inserted.
 */
type GuardedProcParam = { Name: string; Value: unknown };

/** Fields the claim protocol needs from a candidate task. */
export type ClaimableTask = {
    ID: string;
    Name: string;
    AgentID: string | null;
    UserID: string | null;
    InputPayload: string | null;
};

/**
 * Guarded reads and writes over the `Task` claim columns.
 *
 * Uses direct SQL rather than `BaseEntity.Save()` on purpose, and this is the one place in the
 * program where that is correct: the entire point is a *conditional* write whose rowcount is the
 * return value. `Save()` issues an unconditional update and reports success for a row whose state
 * changed underneath it, which is precisely the race being defended against. Every method here is a
 * single statement; nothing reads-then-writes.
 */
/**
 * Statuses a graph parent has stopped moving from — the single source of truth.
 *
 * `Blocked` is INCLUDED: `ComputeParentRollup` returns it as settled, so a
 * failure-blocked graph is as settled as a completed one. Leaving it out left a Blocked settlement
 * unprotected from overwrite AND invisible to the rescue sweep — a stranded run with extra steps.
 *
 * Exported because the dispatcher's sweep filters on the same set. Two lists that must agree is how
 * a graph becomes invisible to the machinery meant to rescue it.
 */
export const TERMINAL_PARENT_STATUSES = TERMINAL_TASK_GRAPH_STATUSES;

export type TerminalParentStatus = TerminalTaskGraphStatus;

/**
 * The only status a *progress* write may set.
 *
 * Typed rather than left as a string so the split between the two parent writes is enforced instead
 * of remembered: settling is a once-only guarded transition with a completion timestamp, and it goes
 * through {@link TaskClaimStore.TrySettleParent}. Handing a terminal status to the progress method
 * is now a compile error rather than a graph that settles without a `CompletedAt`.
 */
export type NonTerminalParentStatus = 'In Progress';

/** The same set as a SQL literal list, so the guards and the sweep cannot drift. */
export const TERMINAL_PARENT_STATUS_SQL = TERMINAL_PARENT_STATUSES.map((s) => `'${s}'`).join(',');

export class TaskClaimStore {
    constructor(
        private readonly instanceID: string,
        private readonly claimTTLSeconds: number,
    ) {}

    /** The last guarded write's failure, or null when the last one actually ran. */
    private _lastWriteError: string | null = null;
    private _consecutiveWriteFailures = 0;

    /**
     * Whether the most recent guarded write FAILED, as opposed to losing its race.
     *
     * The dispatcher reads this after a false return: "another instance won" and "this process
     * cannot write to the database at all" produce the same `false`, and treating the second as the
     * first is what let a dispatcher skip every task in the table, forever, in silence.
     */
    public get LastWriteFailed(): boolean {
        return this._lastWriteError !== null;
    }

    /** The last failure's message, for a caller that wants to say why it is stuck. */
    public get LastWriteError(): string | null {
        return this._lastWriteError;
    }

    /** How many guarded writes have failed in a row. Reset by the first one that runs. */
    public get ConsecutiveWriteFailures(): number {
        return this._consecutiveWriteFailures;
    }

    private sql(provider: IMetadataProvider): DatabaseProviderBase {
        return provider as unknown as DatabaseProviderBase;
    }

    /** The claim TTL as whole seconds, which is what the procedures take. */
    private ttlSeconds(): number {
        return Math.max(0, Math.round(this.claimTTLSeconds));
    }

    /**
     * Writes a graph's cost rollup onto the submitting run, those four columns and no others.
     *
     * **The full-row `Save()` this replaces could revert a peer's settle** (C4). Two instances
     * entering the settled branch for one graph is by design, so instance B's rollup — loaded before
     * A settled the run — would write back `Paused` over A's `Completed`, along with every other
     * column it had read. And a crash between this write and the same pass's lifecycle write left
     * the run `Paused` under a claimed marker, which no sweep re-enters.
     */
    public async TrySetRunCostRollup(
        provider: IMetadataProvider,
        runID: string,
        totals: { Cost: number | null; Tokens: number | null; PromptTokens: number | null; CompletionTokens: number | null },
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphSetRunCostRollup', [
            { Name: 'AgentRunID', Value: runID },
            { Name: 'TotalCostRollup', Value: totals.Cost },
            { Name: 'TotalTokensUsedRollup', Value: totals.Tokens },
            { Name: 'TotalPromptTokensUsedRollup', Value: totals.PromptTokens },
            { Name: 'TotalCompletionTokensUsedRollup', Value: totals.CompletionTokens },
        ], contextUser);
    }

    /**
     * Settles a parked agent run, guarded on it still being parked.
     *
     * Same reasoning as the rollup above and as every parent write since Round 1: a full-row save
     * carries a whole stale snapshot, and the `Paused` predicate makes the transition once-only
     * across instances rather than last-write-wins.
     */
    public async TrySettleRun(
        provider: IMetadataProvider,
        runID: string,
        succeeded: boolean,
        errorMessage: string | null,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphSettleRun', [
            { Name: 'AgentRunID', Value: runID },
            { Name: 'Succeeded', Value: succeeded },
            { Name: 'ErrorMessage', Value: errorMessage },
        ], contextUser);
    }

    /**
     * Attempts to claim one task.
     *
     * The `Status='Pending'` predicate is the whole contract: a task another instance already moved
     * to `In Progress` fails the predicate and yields rowcount 0. `ClaimedBy IS NULL OR
     * ClaimExpiresAt < now` additionally lets an expired claim be taken over without a separate
     * reconciliation pass having to run first.
     *
     * @returns true when this instance now owns the task
     */
    public async TryClaim(provider: IMetadataProvider, taskID: string, contextUser: UserInfo): Promise<boolean> {
        // The lease is written AND compared on the database's clock (SYSUTCDATETIME), never this
        // process's. The claim protocol is multi-instance: a lease written from one host's clock and
        // judged expired against another's turns ordinary NTP skew into premature reclamation — the
        // task runs twice — or into a lease that outlives its worker. One clock, the only shared one.
        return this.guardedWrite(provider, 'spTaskGraphClaimTask', [
            { Name: 'TaskID', Value: taskID },
            { Name: 'ClaimedBy', Value: this.instanceID },
            { Name: 'ClaimTTLSeconds', Value: this.ttlSeconds() },
        ], contextUser);
    }

    /**
     * Extends this instance's claim on a task it is actively running.
     *
     * Guarded on `ClaimedBy=@me` so a heartbeat can never resurrect a claim that reconciliation
     * already released — if the sweep took the task back, the heartbeat fails and the executor
     * learns its work is no longer owned.
     *
     * @returns true when the claim was extended; false means this instance no longer owns the task
     */
    public async Heartbeat(provider: IMetadataProvider, taskID: string, contextUser: UserInfo): Promise<boolean> {
        // Same single-clock rule as TryClaim: the renewal is computed on the database's clock.
        return this.guardedWrite(provider, 'spTaskGraphHeartbeat', [
            { Name: 'TaskID', Value: taskID },
            { Name: 'ClaimedBy', Value: this.instanceID },
            { Name: 'ClaimTTLSeconds', Value: this.ttlSeconds() },
        ], contextUser);
    }

    /**
     * Records a terminal outcome and releases the claim in one guarded statement.
     *
     * Guarded on both `Status='In Progress'` and `ClaimedBy=@me`: a task that was cancelled or
     * reassigned while running fails the predicate, so a stale executor cannot overwrite the newer
     * decision. The caller treats rowcount 0 as "someone else owns this now" rather than an error.
     *
     * @returns true when this instance's outcome was recorded
     */
    public async CompleteClaimed(
        provider: IMetadataProvider,
        taskID: string,
        outcome: {
            Status: 'Complete' | 'Failed';
            OutputPayload?: string | null;
            ErrorMessage?: string | null;
            AgentRunID?: string | null;
            /**
             * The step's Configuration bag, when the run produced something that belongs in it.
             *
             * Written in the SAME guarded UPDATE as the rest of the outcome rather than a follow-up
             * save, because a second write could land after the row was reclaimed and would then
             * attribute one instance's runtime artefacts to another instance's execution.
             *
             * Omitted leaves the column untouched — a step whose run produces no artefacts must not
             * have its authored configuration blanked as a side effect of finishing.
             */
            Configuration?: string | null;
        },
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphCompleteClaimed', [
            { Name: 'TaskID', Value: taskID },
            { Name: 'ClaimedBy', Value: this.instanceID },
            { Name: 'Status', Value: outcome.Status },
            { Name: 'OutputPayload', Value: outcome.OutputPayload ?? null },
            { Name: 'ErrorMessage', Value: outcome.ErrorMessage ?? null },
            { Name: 'AgentRunID', Value: outcome.AgentRunID ?? null },
            // `undefined` means "leave it alone", which is not the same as an explicit null — so the
            // flag, not the value, decides whether the column is written.
            { Name: 'Configuration', Value: outcome.Configuration ?? null },
            { Name: 'SetConfiguration', Value: outcome.Configuration !== undefined },
        ], contextUser);
    }

    /**
     * Reclaims tasks whose claims have lapsed, returning them to `Pending` so any instance can pick
     * them up.
     *
     * **Scoped to tasks a dispatcher executes**, via the one shared predicate — see `task-predicates`.
     * Expressed that way rather than as a list of the runner columns that happened to exist when this
     * was written: the earlier form named `AgentID` and `ActionID` only, and the day `PromptID`
     * arrived, a crashed prompt task became unrecoverable and undiagnosable in the same stroke.
     *
     * **Tasks a person completes are exempt.** One never carries a claim, so `In Progress` with no
     * claim is its *legitimate* parked shape — an approval waiting on someone. Normalizing it would
     * reset that approval out from under the user. Their lifecycle is driven by `DueAt` notification
     * and escalation, never by claim expiry.
     *
     * Only expired claims are reclaimed; a live claim is left strictly alone, which is what keeps a
     * slow-but-healthy task from being executed twice.
     */
    public async ReleaseExpiredClaims(provider: IMetadataProvider, contextUser: UserInfo): Promise<ReconciliationEvent[]> {
        const db = this.sql(provider);

        // Read from the base VIEW, which is what the runtime roles are granted (#4575) — and which
        // also keeps the "a dispatcher completes this task" definition in the one module that owns
        // it, rather than restating it inside a procedure where it would drift.
        //
        // Capture what will be reclaimed BEFORE reclaiming, so the log can name the tasks. The
        // procedure re-states the LEASE predicate, which is the part that has to be evaluated at
        // write time: a claim refreshed in between is correctly skipped rather than reclaimed on
        // stale information.
        const candidates = await RunView.FromMetadataProvider(provider).RunView<{ ID: string; Name: string; ClaimedBy: string }>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter:
                    `Status='In Progress' AND ${MachineTaskSQL()} AND ClaimedBy IS NOT NULL ` +
                    `AND ClaimExpiresAt IS NOT NULL AND ClaimExpiresAt < ${db.Dialect.CurrentTimestampUTC()}`,
                Fields: ['ID', 'Name', 'ClaimedBy'],
                ResultType: 'simple',
                // The claim protocol mutates these rows out from under any cache; a stale read here
                // would reclaim a task somebody is still running.
                BypassCache: true,
            },
            contextUser,
        );
        if (!candidates.Success) {
            LogError(`[TaskGraph reconciliation] could not read expired-claim candidates: ${candidates.ErrorMessage}`);
            return [];
        }

        const rows = candidates.Results ?? [];
        if (rows.length === 0) return [];

        // The procedure reports which ids it actually released, so the events name the tasks that
        // were reclaimed rather than assuming they were the first N candidates.
        const released = await this.callProc<{ ID: string }>(provider, 'spTaskGraphReleaseExpiredClaims', [
            { Name: 'TaskIDs', Value: JSON.stringify(rows.map((r) => r.ID)) },
        ], contextUser);
        if (released === null) return [];

        const byID = new Map(rows.map((r) => [r.ID.toLowerCase(), r]));
        const events: ReconciliationEvent[] = released.map((r) => {
            const candidate = byID.get(String(r.ID).toLowerCase());
            return {
                TaskID: String(r.ID),
                Action: 'ExpiredClaimReleased' as const,
                Detail: `Claim held by '${candidate?.ClaimedBy ?? 'unknown'}' expired; task '${candidate?.Name ?? r.ID}' returned to Pending.`,
            };
        });
        for (const e of events) {
            LogStatus(`[TaskGraph reconciliation] ${e.Action}: ${e.Detail}`);
        }
        return events;
    }

    /**
     * Returns *agent* tasks sitting `In Progress` with no claim at all.
     *
     * This is the anomalous shape D20 anticipates from a human or an agent writing `Status`
     * directly. It is reported rather than silently corrected: the row is evidence of tampering or
     * of a bug, and Record Changes already carries the audit trail. Human-assigned tasks are
     * excluded because for them this shape is legitimate, not anomalous.
     */
    public async FindOrphanedInProgress(provider: IMetadataProvider, contextUser: UserInfo): Promise<ReconciliationEvent[]> {
        // From the view, for the same reason as the sweep above (#4575).
        const result = await RunView.FromMetadataProvider(provider).RunView<{ ID: string; Name: string }>(
            {
                EntityName: 'MJ: Tasks',
                ExtraFilter: `Status='In Progress' AND ${MachineTaskSQL()} AND ClaimedBy IS NULL`,
                Fields: ['ID', 'Name'],
                ResultType: 'simple',
                BypassCache: true,
            },
            contextUser,
        );
        if (!result.Success) {
            LogError(`[TaskGraph reconciliation] could not read orphaned In Progress tasks: ${result.ErrorMessage}`);
            return [];
        }

        const events = (result.Results ?? []).map((r) => ({
            TaskID: r.ID,
            Action: 'OrphanedInProgressReleased' as const,
            Detail: `Agent task '${r.Name}' is In Progress with no claim — no dispatcher owns it.`,
        }));
        for (const e of events) {
            LogError(`[TaskGraph reconciliation] ${e.Action}: ${e.Detail}`);
        }
        return events;
    }

    /**
     * Writes a graph parent's terminal status, and only if it is not already terminal.
     *
     * **Why this is not `parent.Save()`.** `GenerateSaveSQL` sends every updateable column on every
     * save, not just the dirty ones — so a full-row save carries the whole in-memory snapshot,
     * including `InputPayload`. Two instances polling the same settling graph both compute the
     * terminal rollup; if one claims the continuation marker (written into that JSON bag) and the
     * other then saves its pre-marker snapshot, **the marker is erased** and the settlement is
     * delivered a second time. For `reinvoke` that is a second billed agent turn for one settlement
     * — precisely the failure P4 exists to prevent, reintroduced through a column nobody thought
     * they were writing.
     *
     * Column-scoped and guarded, per the doctrine every task transition already follows: touch
     * `Status`/`PercentComplete`/`CompletedAt` and nothing else, and only from a non-terminal state.
     * The second instance's write becomes a no-op instead of a rewind.
     *
     * @returns true when this call moved the parent to terminal; false when it was already terminal
     *          (someone else settled it) or the write failed
     */
    public async TrySettleParent(
        provider: IMetadataProvider,
        parentTaskID: string,
        status: TerminalParentStatus,
        percentComplete: number,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphSettleParent', [
            { Name: 'ParentTaskID', Value: parentTaskID },
            { Name: 'Status', Value: status },
            { Name: 'PercentComplete', Value: Number.isFinite(percentComplete) ? Math.round(percentComplete) : 0 },
        ], contextUser);
    }

    /**
     * Updates a graph parent's in-flight progress — column-scoped, and refused once it is terminal.
     *
     * **The race this closes needs no exotic timing.** Instance A loads the graph while a child is
     * still In Progress and computes a non-terminal rollup. Instance B loads after that child
     * finishes, settles the parent and claims the continuation. A's full-row progress `Save()` then
     * lands: `Status` reverts to non-terminal *and* A's pre-marker `InputPayload` snapshot erases
     * the marker. The next pass finds a non-terminal parent with a terminal rollup and an absent
     * marker — so it settles again and delivers again. That is the duplicate `reinvoke` P4 exists to
     * prevent, arriving through the last unguarded window.
     *
     * "These writes happen before settlement" is true per instance and false across instances, which
     * is exactly the kind of timing argument a guard replaces with a structural one.
     */
    public async TryUpdateParentProgress(
        provider: IMetadataProvider,
        parentTaskID: string,
        status: NonTerminalParentStatus,
        percentComplete: number,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphUpdateParentProgress', [
            { Name: 'ParentTaskID', Value: parentTaskID },
            { Name: 'Status', Value: status },
            { Name: 'PercentComplete', Value: Number.isFinite(percentComplete) ? Math.round(percentComplete) : 0 },
        ], contextUser);
    }

    /**
     * Stamps a graph parent's start time, once, without touching anything else.
     *
     * Same reason as {@link TrySettleParent}: a full-row `Save()` here would carry the whole
     * in-memory snapshot including `InputPayload`, so stamping a start time could erase a
     * continuation marker another instance had just claimed. Guarded on `StartedAt IS NULL` so it is
     * naturally once-only and safe to call on every pass.
     */
    public async TryStampParentStart(
        provider: IMetadataProvider,
        parentTaskID: string,
        startedAt: Date,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphStampParentStart', [
            { Name: 'ParentTaskID', Value: parentTaskID },
            { Name: 'StartedAt', Value: startedAt },
        ], contextUser);
    }

    /**
     * Claims the right to deliver a graph's continuation — exactly once, across every instance.
     *
     * **What this replaces.** `claimContinuation` was Load → check the marker → `BaseEntity.Save()`:
     * an unconditional last-write-wins UPDATE. Two dispatchers polling the same settled graph inside
     * one interval both read "no marker", both saved, and both delivered. The comments called it a
     * compare-and-swap; it was read-check-write. Every *task* transition in this store is a guarded
     * single statement for exactly this reason — the continuation marker was the one transition that
     * was not.
     *
     * The marker lives inside the parent's `InputPayload` JSON bag rather than a column, so the
     * guard is a JSON predicate. That keeps one representation for writer and reader: this statement
     * writes it, `ParseTaskGraphParentMetadata` reads it, and a graph settled before this existed is
     * decided by the same parser as one settled after — which a new column plus a backfill could not
     * promise.
     *
     * Timestamps are ISO 8601 UTC because the TS reader parses them; `JSON_MODIFY` on a row whose
     * payload is absent or unparseable writes nothing and the rowcount says so, which is the honest
     * outcome — a graph we cannot read metadata for is one we must not deliver for.
     *
     * `workflowTaskTypeID` is REQUIRED rather than optional because this statement injects keys into
     * a row's `InputPayload`. `MJ: Tasks` holds conversation tasks and users' own to-dos as well as
     * workflow graphs; a mis-targeted claim would silently edit somebody's payload. Passing the
     * discriminator is not a filter the caller may forget — it is the caller stating which family of
     * task it believes it is writing to, and the statement refusing if it is wrong.
     *
     * @param deliveredAs how the settlement is being delivered, recorded alongside the marker so an
     *                    expired settlement is distinguishable from a delivered one after the fact
     * @returns true when this instance won the right to deliver
     */
    public async TryClaimContinuation(
        provider: IMetadataProvider,
        parentTaskID: string,
        deliveredAs: 'delivered' | 'expired' | 'cancelled',
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphClaimContinuation', [
            { Name: 'ParentTaskID', Value: parentTaskID },
            { Name: 'TaskTypeID', Value: workflowTaskTypeID },
            { Name: 'DeliveredAs', Value: deliveredAs },
            { Name: 'DeliveredAt', Value: new Date().toISOString() },
        ], contextUser);
    }

    /**
     * Skips one task, refusing if anything has taken it since the caller looked.
     *
     * **Why this cannot be a `Save()`** — and R3-1 is the proof that the earlier reasoning was wrong.
     * The early-finish path skipped siblings with a full-row `BaseEntity.Save()` against a snapshot
     * taken before the loop began, justified by "the siblings are Pending and unclaimed until the
     * skip lands". They are not: `executeClaimed` is not awaited, so this instance's own next poll
     * tick runs concurrently with the loop, and a sibling can be claimed and STARTED between the
     * snapshot and its own write. The full-row save then overwrote `In Progress` back to `Skipped`
     * and cleared `ClaimedBy` mid-execution — the agent's real side effects had already fired, its
     * completion was refused by the claim guard, and its output was discarded. The graph settled
     * `Complete` with no record anywhere that the step ran.
     *
     * **The status predicate is `Status='Pending'` alone, deliberately.** `TryClaim` moves a task
     * to `In Progress` in the same statement that stamps `ClaimedBy`, so a task an executor holds is
     * never `Pending` — the status IS the claim test. Adding `ClaimedBy IS NULL` would look like
     * defence in depth and would instead break a real case: a notified human task carries a marker
     * in `ClaimedBy` while still `Pending`, and those must stay skippable.
     *
     * **Type-scoped, like every other write in this store that a caller-supplied ID can reach.**
     * `MJ: Tasks` also holds conversation tasks and users' personal to-dos; without the
     * discriminator an operator verb pointed at a mis-derived (or hostile) ID could write `Skipped`
     * onto somebody's to-do. The engine-internal caller (`endGraphEarly`) derives its IDs from a
     * workflow parent's own children, but it pays the same predicate — one statement, one contract.
     *
     * @returns true when this call is the one that skipped it; false means something else got there
     */
    public async TrySkipPending(
        provider: IMetadataProvider,
        taskID: string,
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphSkipPending', [
            { Name: 'TaskID', Value: taskID },
            { Name: 'TaskTypeID', Value: workflowTaskTypeID },
        ], contextUser);
    }

    /**
     * Stamps the human-notified marker, once, without touching anything else.
     *
     * The marker lives in `ClaimedBy` because a human task has no executor claim, and it exists to
     * stop the notify path re-raising on every poll. It was written with a full-row `Save()` against
     * a snapshot — so it could revert a status the row had reached since, and two instances could
     * both write it after both having seen it absent. Guarded on the marker being unset, it is
     * naturally once-only and the rowcount says which instance did it.
     */
    public async TryMarkHumanNotified(
        provider: IMetadataProvider,
        taskID: string,
        marker: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphMarkHumanNotified', [
            { Name: 'TaskID', Value: taskID },
            { Name: 'Marker', Value: marker },
        ], contextUser);
    }

    /**
     * Cancels one task, refusing if it settled while the caller was looking elsewhere.
     *
     * **The terminal check has to be IN the statement.** `Cancel` loaded every child, tested the
     * terminal set against that in-memory snapshot, and wrote `Status='Cancelled'` with a full-row
     * `BaseEntity.Save()` — an unconditional UPDATE sending every updateable column against a
     * PK-only predicate. A child whose executor's guarded `CompleteClaimed` landed between the load
     * and its save had its entire outcome overwritten: `Complete` back to `Cancelled`,
     * `OutputPayload` to NULL (the null-clear companions make those explicit clears),
     * `AgentRunID`/`CompletedAt`/runtime `Configuration` reverted, and stale claim columns
     * re-instated on a terminal row.
     *
     * The moment users cancel is exactly the moment tasks are running, so this is not a narrow
     * window. The reverse ordering was always safe — `CompleteClaimed`'s own predicate refuses a
     * cancelled row — so the hazard lived entirely in this write.
     *
     * @returns true when this call cancelled it; false means it had already settled
     */
    public async TryCancelTask(
        provider: IMetadataProvider,
        taskID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphCancelTask', [
            { Name: 'TaskID', Value: taskID },
        ], contextUser);
    }

    /**
     * Records, durably and once, that a graph is finishing early.
     *
     * **The declaration has to outlive the deciding instance's memory.** An early finish is decided
     * by one task's result (`result.ChatMessage`) and nothing else in the system knows: skip seeds
     * are derived from durable condition and exclusive-group state, so no claim filter on any
     * instance — including the deciding one, whose poll loop runs concurrently — can tell that the
     * remaining steps are about to be skipped. Writing it here first is what lets
     * `loadGraphState` fold those steps into the claim filter, closing the window for everyone
     * rather than narrowing it for one.
     *
     * Guarded and once-only for the same reason the continuation marker is: two tasks can end the
     * same flow, and the first declaration is the one that counts. Type-scoped like every other
     * statement here that writes into a payload column.
     *
     * @returns true when this call is the one that declared it
     */
    public async TryDeclareEarlyFinish(
        provider: IMetadataProvider,
        parentTaskID: string,
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphDeclareEarlyFinish', [
            { Name: 'ParentTaskID', Value: parentTaskID },
            { Name: 'TaskTypeID', Value: workflowTaskTypeID },
            { Name: 'FinishedAt', Value: new Date().toISOString() },
        ], contextUser);
    }

    /**
     * Records why a graph ended early, writing that column and no other.
     *
     * The hazard is the one {@link TrySettleParent} exists for, reached by a different route. A task
     * that ends the flow early skips its siblings, which makes the graph fully terminal — so another
     * instance's very next poll can settle it and claim the continuation marker. The old code had
     * already loaded the parent by then and finished with a full-row `Save()`, which would write back
     * the pre-settle snapshot: status reverted to `In Progress`, marker gone, graph delivered twice.
     *
     * No status predicate here, unlike the other writes: the early-finish message is the truthful
     * summary whether or not the graph has settled since, and two tasks ending the same flow both
     * describe it correctly. The bug was never the value — it was the other columns riding along.
     *
     * Type-scoped for the same reason the claim is: every statement in this store that writes into a
     * payload column states which family of task it means, so a mis-derived parent ID cannot edit a
     * conversation task or somebody's to-do.
     */
    public async TrySetParentOutput(
        provider: IMetadataProvider,
        parentTaskID: string,
        outputPayload: string,
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphSetParentOutput', [
            { Name: 'ParentTaskID', Value: parentTaskID },
            { Name: 'TaskTypeID', Value: workflowTaskTypeID },
            { Name: 'OutputPayload', Value: outputPayload },
        ], contextUser);
    }

    /**
     * Clears a graph's debug state entirely — the "stop debugging this run" write.
     *
     * Whole-bag, and safe to be: deleting `$.debug` is the one operation that genuinely owns every
     * field in it. Every PARTIAL change goes through {@link TryWriteDebugFields}, because a
     * read-merge-write of the whole bag puts back whatever the fields a verb does not own held at
     * read time — most sharply resurrecting a step allowance the dispatcher consumed in between.
     */
    public async TryClearDebugState(
        provider: IMetadataProvider,
        parentTaskID: string,
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphClearDebugState', [
            { Name: 'ParentTaskID', Value: parentTaskID },
            { Name: 'TaskTypeID', Value: workflowTaskTypeID },
        ], contextUser);
    }

    /**
     * One field of the debug bag, as a value the statement can write.
     *
     * Typed rather than a raw SQL fragment so a caller cannot inject one: the shape decides how the
     * value is rendered, and every string goes through {@link escape}.
     */
    public static DebugField(path: string, value: TaskGraphDebugFieldValue): TaskGraphDebugFieldWrite {
        return { Path: path, Value: value };
    }

    /**
     * Writes named fields of a graph's debug bag, leaving every other field alone.
     *
     * **Why field-scoped rather than rewriting `$.debug`.** A read-merge-write of the whole bag is
     * the same stale-snapshot hazard as a full-row save, one level down: a verb that reads the bag,
     * merges its own change, and writes the result puts back whatever the fields it does NOT own
     * held at read time. The sharp case is the step allowance — if the dispatcher consumes it
     * between a `SetBreakpoints` read and its write, the rewrite *resurrects* the consumed
     * allowance and one press of Step releases two waves, straight through the CAS that exists to
     * prevent exactly that. Writing only the paths a verb owns removes the class rather than
     * narrowing the window.
     *
     * Paths are nested `JSON_MODIFY` calls, so the whole set lands in one statement.
     */
    public async TryWriteDebugFields(
        provider: IMetadataProvider,
        parentTaskID: string,
        fields: readonly TaskGraphDebugFieldWrite[],
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        if (fields.length === 0) return true;

        // Containing objects are computed here rather than in SQL: `ContainingPaths` is pure, tested,
        // and the rule it encodes (JSON_MODIFY does not create intermediate objects) is the kind of
        // database behaviour that is easy to assume wrongly.
        const containers = [...new Set(fields.flatMap((f) => ContainingPaths(f.Path)))]
            // Shallowest first: `$.debug` must exist before `$.debug.edgeOverrides` can be added to it.
            .sort((a, b) => a.length - b.length);

        return this.guardedWrite(provider, 'spTaskGraphWriteDebugFields', [
            { Name: 'ParentTaskID', Value: parentTaskID },
            { Name: 'TaskTypeID', Value: workflowTaskTypeID },
            { Name: 'Containers', Value: JSON.stringify(containers) },
            { Name: 'Fields', Value: JSON.stringify(fields.map((f) => this.renderDebugField(f))) },
        ], contextUser);
    }

    /**
     * Consumes a paused graph's one-shot step allowance — exactly once, across every instance.
     *
     * The predicate `$.debug.step IS NOT NULL` is the whole contract: two dispatchers polling the
     * same paused graph inside one interval both see the allowance, but only one statement clears it
     * and sees rowcount 1. The loser claims nothing and waits for the next allowance, so "step" can
     * never release two waves.
     */
    public async TryConsumeStepMarker(
        provider: IMetadataProvider,
        parentTaskID: string,
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphConsumeStepMarker', [
            { Name: 'ParentTaskID', Value: parentTaskID },
            { Name: 'TaskTypeID', Value: workflowTaskTypeID },
        ], contextUser);
    }

    /**
     * Pauses a graph because an eligible task hit a breakpoint — once, whichever instance sees it
     * first.
     *
     * Guarded on "not already paused" so two instances arriving at the same breakpoint in the same
     * interval produce one `BreakpointHit` announcement, not two. The graph's existing breakpoint
     * list and edge overrides are untouched — only the pause fields are written.
     *
     * The `$.debug` object is created when absent, for the same reason the field-scoped writes need
     * it: `JSON_MODIFY` will not create a missing container, so without this the pause would report
     * success and the workflow would run straight through its breakpoint. Reachable here only since
     * the writes became field-scoped — the whole-bag write this replaced created `$.debug` on the
     * way past, so a breakpoint could not exist without its container already being there.
     */
    public async TryPauseAtBreakpoint(
        provider: IMetadataProvider,
        parentTaskID: string,
        breakpointTaskID: string,
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphPauseAtBreakpoint', [
            { Name: 'ParentTaskID', Value: parentTaskID },
            { Name: 'BreakpointTaskID', Value: breakpointTaskID },
            { Name: 'TaskTypeID', Value: workflowTaskTypeID },
        ], contextUser);
    }


    /**
     * Replaces a task's input, guarded on the status the caller believes it is in.
     *
     * **Why this is a guarded statement and not `task.Save()`.** The obvious shape — load, check
     * `Status === 'Pending'` in memory, save — is an unconditional full-row UPDATE carrying the
     * whole loaded snapshot. A task claimed between the load and the save has its `Status`,
     * `ClaimedBy` and `ClaimExpiresAt` reverted to that snapshot *while its body executes*, after
     * which a second instance claims it again and the step runs twice. That is the stale-snapshot
     * class this file's header exists to prevent, and it does not become safe because the window is
     * small — the dispatcher polls every few seconds.
     *
     * `expectedStatus` is a parameter because two verbs need it: editing the brief of a step that
     * has not started (`Pending`) and correcting the brief of one that failed, on the way into a
     * retry (`Failed`).
     */
    public async TryUpdateInputPayload(
        provider: IMetadataProvider,
        taskID: string,
        inputPayload: string | null,
        expectedStatus: 'Pending' | 'Failed',
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphUpdateInputPayload', [
            { Name: 'TaskID', Value: taskID },
            { Name: 'TaskTypeID', Value: workflowTaskTypeID },
            { Name: 'InputPayload', Value: inputPayload },
            { Name: 'ExpectedStatus', Value: expectedStatus },
        ], contextUser);
    }

    /**
     * Marks a task Complete with an operator-supplied output — the escape hatch for a wedged or
     * externally-resolved step.
     *
     * The guard is deliberately narrow: `Pending`, `Failed`, `Blocked`, or `In Progress` **with a
     * lapsed claim**. A live claim means an executor is genuinely working, and force-completing
     * underneath it would hand dependents an output the still-running body is about to contradict —
     * that case must go through Cancel or wait for the claim to lapse. Downstream edges evaluate
     * against the supplied output exactly as they would a runner's.
     *
     * **The lapsed-claim test uses the DATABASE clock, not this process's.** With app/DB skew — or
     * skew between two app servers — a claim that is live on the clock that wrote it can read as
     * expired on the clock that judges it, and this verb would then complete a task underneath a
     * running executor. That interleaving is the entire reason the gate is narrow, so the gate must
     * not be the thing that gets it wrong. The database is the one reference every instance shares.
     * (This verb once carried a residual asymmetry — it *judged* on the database clock while
     * `TryClaim` still *wrote* the lease from the claiming process's clock, trading app-vs-app skew
     * for app-vs-DB skew. The claim protocol has since moved its write to `SYSUTCDATETIME()` as
     * well, so both ends of the comparison now come from the one shared clock and the window is
     * closed rather than relocated.)
     */
    public async TryForceComplete(
        provider: IMetadataProvider,
        taskID: string,
        outputPayload: string | null,
        workflowTaskTypeID: string,
        contextUser: UserInfo,
    ): Promise<boolean> {
        return this.guardedWrite(provider, 'spTaskGraphForceComplete', [
            { Name: 'TaskID', Value: taskID },
            { Name: 'TaskTypeID', Value: workflowTaskTypeID },
            { Name: 'OutputPayload', Value: outputPayload },
        ], contextUser);
    }

    /**
     * Runs one guarded procedure and returns whether THIS instance won.
     *
     * A false here means the guard did not match — someone else won the race, or the row had already
     * moved on. It does NOT mean the write failed; a failure returns false too, but records itself
     * (see {@link LastWriteFailed}) so the caller can tell the two apart.
     */
    private async guardedWrite(
        provider: IMetadataProvider,
        procName: string,
        params: ReadonlyArray<GuardedProcParam>,
        contextUser: UserInfo,
    ): Promise<boolean> {
        const rows = await this.callProc<{ AffectedRows: number }>(provider, procName, params, contextUser);
        if (rows === null) return false;
        return Number(rows[0]?.AffectedRows ?? 0) === 1;
    }

    /**
     * Calls one of the task-graph procedures, returning its rows — or `null` when the call FAILED.
     *
     * **Why procedures and not raw SQL** (#4575). These statements used to be sent as direct DML
     * against the `Task` and `AIAgentRun` base tables. MJ grants its runtime roles SELECT on views
     * and EXECUTE on procedures and never table-level DML, so under a least-privilege login every
     * write was refused — and, because a refusal was reported as rowcount 0, the dispatcher read it
     * as a lost race and skipped every task forever. The guards themselves are unchanged; they moved
     * into procedures the runtime roles can actually execute.
     *
     * **Why `null` and not 0.** A statement that never ran is not a lost race, and collapsing the two
     * is what kept that defect invisible. Callers still get `false` from {@link guardedWrite} — the
     * dispatch loop must not fault on one bad write — but the failure is recorded and logged as a
     * failure, so an inert dispatcher can say so.
     */
    private async callProc<T extends Record<string, unknown>>(
        provider: IMetadataProvider,
        procName: string,
        params: ReadonlyArray<GuardedProcParam>,
        contextUser: UserInfo,
    ): Promise<T[] | null> {
        const db = this.sql(provider);
        // Named arguments on SQL Server, positional on PostgreSQL — the call wrapper itself belongs
        // to the dialect, so neither form is spelled out here.
        const placeholders = params.map((param, i) =>
            db.PlatformKey === 'postgresql'
                ? db.BuildParameterPlaceholder(i)
                : `@${param.Name}=${db.BuildParameterPlaceholder(i)}`);
        const call = db.Dialect.ProcedureCallSyntax(db.MJCoreSchemaName, procName, placeholders);

        try {
            const rows = await db.ExecuteSQL<T>(
                call,
                params.map((param) => param.Value),
                { isMutation: true, description: `TaskGraph ${procName}` },
                contextUser,
            );
            this._lastWriteError = null;
            this._consecutiveWriteFailures = 0;
            return rows ?? [];
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            this._lastWriteError = `${procName}: ${message}`;
            this._consecutiveWriteFailures++;
            LogError(
                `[TaskGraph] guarded write ${procName} FAILED — the statement never ran, so this is NOT ` +
                `a lost race (${this._consecutiveWriteFailures} consecutive). ${message}`,
            );
            return null;
        }
    }

    /**
     * Renders one debug-bag field for the procedure's `@Fields` argument.
     *
     * The `Kind` travels with the value because it decides the JSON type written: a boolean stored as
     * the string `"true"` reads back as truthy-but-wrong, and an object stored as a string reads back
     * as a string.
     */
    private renderDebugField(field: TaskGraphDebugFieldWrite): { Path: string; Kind: TaskGraphDebugFieldValue['Kind']; Value: unknown } {
        const value = field.Value;
        switch (value.Kind) {
            case 'null': return { Path: field.Path, Kind: 'null', Value: null };
            case 'bool': return { Path: field.Path, Kind: 'bool', Value: value.Value };
            case 'string': return { Path: field.Path, Kind: 'string', Value: value.Value };
            // Embedded as real JSON, not as a string, so the procedure's JSON_QUERY sees an object.
            case 'json': return { Path: field.Path, Kind: 'json', Value: JSON.parse(value.Value) };
        }
    }
}
