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
import { IMetadataProvider, DatabaseProviderBase, LogError, LogStatus, UserInfo } from '@memberjunction/core';
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

    private sql(provider: IMetadataProvider): DatabaseProviderBase {
        return provider as unknown as DatabaseProviderBase;
    }

    /** Schema-qualified `Task` table for the provider's configured core schema. */
    private taskTable(provider: IMetadataProvider): string {
        const db = this.sql(provider);
        return `${db.QuoteIdentifier(db.MJCoreSchemaName)}.${db.QuoteIdentifier('Task')}`;
    }

    private agentRunTable(provider: IMetadataProvider): string {
        const db = this.sql(provider);
        return `${db.QuoteIdentifier(db.MJCoreSchemaName)}.${db.QuoteIdentifier('AIAgentRun')}`;
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
        const db = this.sql(provider);
        const num = (v: number | null): string => (v == null ? 'NULL' : String(v));
        const sql = `
            UPDATE ${this.agentRunTable(provider)}
            SET ${db.QuoteIdentifier('TotalCostRollup')} = ${num(totals.Cost)},
                ${db.QuoteIdentifier('TotalTokensUsedRollup')} = ${num(totals.Tokens)},
                ${db.QuoteIdentifier('TotalPromptTokensUsedRollup')} = ${num(totals.PromptTokens)},
                ${db.QuoteIdentifier('TotalCompletionTokensUsedRollup')} = ${num(totals.CompletionTokens)}
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(runID)}'`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const errorClause = errorMessage == null
            ? ''
            : `, ${db.QuoteIdentifier('ErrorMessage')} = CONCAT(COALESCE(${db.QuoteIdentifier('ErrorMessage')} + CHAR(10) + CHAR(10), ''), '${this.escape(errorMessage)}')`;
        const sql = `
            UPDATE ${this.agentRunTable(provider)}
            SET ${db.QuoteIdentifier('Status')} = '${succeeded ? 'Completed' : 'Failed'}',
                ${db.QuoteIdentifier('Success')} = ${succeeded ? 1 : 0},
                ${db.QuoteIdentifier('CompletedAt')} = SYSUTCDATETIME()${errorClause}
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(runID)}'
              AND ${db.QuoteIdentifier('Status')} = 'Paused'`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        // The lease is written AND compared on the database's clock (SYSUTCDATETIME), never this
        // process's. The claim protocol is multi-instance: a lease written from one host's clock and
        // judged expired against another's turns ordinary NTP skew into premature reclamation — the
        // task runs twice — or into a lease that outlives its worker. One clock, the only shared one.
        const ttlSeconds = Math.max(0, Math.round(this.claimTTLSeconds));
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('Status')} = 'In Progress',
                ${db.QuoteIdentifier('ClaimedBy')} = '${this.escape(this.instanceID)}',
                ${db.QuoteIdentifier('ClaimExpiresAt')} = DATEADD(SECOND, ${ttlSeconds}, SYSUTCDATETIME()),
                ${db.QuoteIdentifier('StartedAt')} = SYSUTCDATETIME()
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(taskID)}'
              AND ${db.QuoteIdentifier('Status')} = 'Pending'
              AND (${db.QuoteIdentifier('ClaimedBy')} IS NULL
                   OR ${db.QuoteIdentifier('ClaimExpiresAt')} IS NULL
                   OR ${db.QuoteIdentifier('ClaimExpiresAt')} < SYSUTCDATETIME())`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        // Same single-clock rule as TryClaim: the renewal is computed on the database's clock.
        const ttlSeconds = Math.max(0, Math.round(this.claimTTLSeconds));
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('ClaimExpiresAt')} = DATEADD(SECOND, ${ttlSeconds}, SYSUTCDATETIME())
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(taskID)}'
              AND ${db.QuoteIdentifier('ClaimedBy')} = '${this.escape(this.instanceID)}'
              AND ${db.QuoteIdentifier('Status')} = 'In Progress'`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const sets: string[] = [
            `${db.QuoteIdentifier('Status')} = '${outcome.Status}'`,
            `${db.QuoteIdentifier('CompletedAt')} = SYSUTCDATETIME()`,
            `${db.QuoteIdentifier('PercentComplete')} = ${outcome.Status === 'Complete' ? 100 : 0}`,
            // Release the claim as part of the same atomic write — a separate release could be
            // interrupted, leaving a terminal task holding a claim that the sweep would then flag.
            `${db.QuoteIdentifier('ClaimedBy')} = NULL`,
            `${db.QuoteIdentifier('ClaimExpiresAt')} = NULL`,
        ];
        sets.push(`${db.QuoteIdentifier('OutputPayload')} = ${this.literalOrNull(outcome.OutputPayload)}`);
        sets.push(`${db.QuoteIdentifier('ErrorMessage')} = ${this.literalOrNull(outcome.ErrorMessage)}`);
        sets.push(`${db.QuoteIdentifier('AgentRunID')} = ${outcome.AgentRunID ? `'${this.escape(outcome.AgentRunID)}'` : 'NULL'}`);
        // Only when supplied — see the note on the parameter. `undefined` means "leave it alone",
        // which is not the same as an explicit null.
        if (outcome.Configuration !== undefined) {
            sets.push(`${db.QuoteIdentifier('Configuration')} = ${this.literalOrNull(outcome.Configuration)}`);
        }

        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${sets.join(', ')}
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(taskID)}'
              AND ${db.QuoteIdentifier('Status')} = 'In Progress'
              AND ${db.QuoteIdentifier('ClaimedBy')} = '${this.escape(this.instanceID)}'`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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

        // Capture what will be reclaimed BEFORE reclaiming, so the log names the tasks. The
        // subsequent UPDATE re-states the same predicate, so a task whose claim was refreshed in
        // between is correctly skipped rather than reclaimed on stale information.
        const candidates = await db.ExecuteSQL<{ ID: string; Name: string; ClaimedBy: string }>(
            `SELECT ${db.QuoteIdentifier('ID')}, ${db.QuoteIdentifier('Name')}, ${db.QuoteIdentifier('ClaimedBy')}
             FROM ${this.taskTable(provider)}
             WHERE ${db.QuoteIdentifier('Status')} = 'In Progress'
               AND ${MachineTaskSQL(db.QuoteIdentifier.bind(db))}
               AND ${db.QuoteIdentifier('ClaimedBy')} IS NOT NULL
               AND ${db.QuoteIdentifier('ClaimExpiresAt')} IS NOT NULL
               AND ${db.QuoteIdentifier('ClaimExpiresAt')} < SYSUTCDATETIME()`,
            undefined, undefined, contextUser,
        );

        if (!candidates || candidates.length === 0) return [];

        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('Status')} = 'Pending',
                ${db.QuoteIdentifier('ClaimedBy')} = NULL,
                ${db.QuoteIdentifier('ClaimExpiresAt')} = NULL
            WHERE ${db.QuoteIdentifier('Status')} = 'In Progress'
              AND ${MachineTaskSQL(db.QuoteIdentifier.bind(db))}
              AND ${db.QuoteIdentifier('ClaimedBy')} IS NOT NULL
              AND ${db.QuoteIdentifier('ClaimExpiresAt')} IS NOT NULL
              AND ${db.QuoteIdentifier('ClaimExpiresAt')} < SYSUTCDATETIME()`;
        const released = await this.affectedRows(db, sql, contextUser);

        const events: ReconciliationEvent[] = candidates.slice(0, released).map((c) => ({
            TaskID: c.ID,
            Action: 'ExpiredClaimReleased',
            Detail: `Claim held by '${c.ClaimedBy}' expired; task '${c.Name}' returned to Pending.`,
        }));
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
        const db = this.sql(provider);
        const rows = await db.ExecuteSQL<{ ID: string; Name: string }>(
            `SELECT ${db.QuoteIdentifier('ID')}, ${db.QuoteIdentifier('Name')}
             FROM ${this.taskTable(provider)}
             WHERE ${db.QuoteIdentifier('Status')} = 'In Progress'
               AND ${MachineTaskSQL(db.QuoteIdentifier.bind(db))}
               AND ${db.QuoteIdentifier('ClaimedBy')} IS NULL`,
            undefined, undefined, contextUser,
        );
        const events = (rows ?? []).map((r) => ({
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
        const db = this.sql(provider);
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('Status')} = '${this.escape(status)}',
                ${db.QuoteIdentifier('PercentComplete')} = ${Number.isFinite(percentComplete) ? Math.round(percentComplete) : 0},
                ${db.QuoteIdentifier('CompletedAt')} = SYSUTCDATETIME()
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(parentTaskID)}'
              AND ${db.QuoteIdentifier('Status')} NOT IN (${TERMINAL_PARENT_STATUS_SQL})`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('Status')} = '${this.escape(status)}',
                ${db.QuoteIdentifier('PercentComplete')} = ${Number.isFinite(percentComplete) ? Math.round(percentComplete) : 0}
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(parentTaskID)}'
              AND ${db.QuoteIdentifier('Status')} NOT IN (${TERMINAL_PARENT_STATUS_SQL})`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('StartedAt')} = '${startedAt.toISOString()}'
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(parentTaskID)}'
              AND ${db.QuoteIdentifier('StartedAt')} IS NULL`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const nowIso = new Date().toISOString();
        const payload = db.QuoteIdentifier('InputPayload');
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${payload} = JSON_MODIFY(
                    JSON_MODIFY(${payload}, '$.continuationDeliveredAt', '${this.escape(nowIso)}'),
                    '$.continuationDeliveredAs', '${this.escape(deliveredAs)}')
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(parentTaskID)}'
              AND ${db.QuoteIdentifier('TypeID')} = '${this.escape(workflowTaskTypeID)}'
              AND ISJSON(${payload}) = 1
              AND JSON_VALUE(${payload}, '$.continuationDeliveredAt') IS NULL`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('Status')} = 'Skipped'
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(taskID)}'
              AND ${db.QuoteIdentifier('TypeID')} = '${this.escape(workflowTaskTypeID)}'
              AND ${db.QuoteIdentifier('Status')} = 'Pending'`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('ClaimedBy')} = '${this.escape(marker)}'
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(taskID)}'
              AND ${db.QuoteIdentifier('Status')} = 'Pending'
              AND ${db.QuoteIdentifier('ClaimedBy')} IS NULL`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('Status')} = 'Cancelled'
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(taskID)}'
              AND ${db.QuoteIdentifier('Status')} NOT IN (${TERMINAL_PARENT_STATUS_SQL})`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const payload = db.QuoteIdentifier('InputPayload');
        const nowIso = new Date().toISOString();
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${payload} = JSON_MODIFY(${payload}, '$.earlyFinishedAt', '${this.escape(nowIso)}')
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(parentTaskID)}'
              AND ${db.QuoteIdentifier('TypeID')} = '${this.escape(workflowTaskTypeID)}'
              AND ISJSON(${payload}) = 1
              AND JSON_VALUE(${payload}, '$.earlyFinishedAt') IS NULL`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('OutputPayload')} = '${this.escape(outputPayload)}'
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(parentTaskID)}'
              AND ${db.QuoteIdentifier('TypeID')} = '${this.escape(workflowTaskTypeID)}'`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const payload = db.QuoteIdentifier('InputPayload');
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${payload} = JSON_MODIFY(${payload}, '$.debug', NULL)
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(parentTaskID)}'
              AND ${db.QuoteIdentifier('TypeID')} = '${this.escape(workflowTaskTypeID)}'
              AND ISJSON(${payload}) = 1`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const payload = db.QuoteIdentifier('InputPayload');

        // Innermost first, so the outermost JSON_MODIFY sees every prior change — and every write
        // starts from a payload whose containing objects are known to exist (see ensureObjects).
        const expression = fields.reduce(
            (inner, field) => `JSON_MODIFY(${inner}, '${this.escape(field.Path)}', ${this.renderDebugValue(field.Value)})`,
            this.ensureObjects(payload, fields.map((f) => f.Path)),
        );

        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${payload} = ${expression}
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(parentTaskID)}'
              AND ${db.QuoteIdentifier('TypeID')} = '${this.escape(workflowTaskTypeID)}'
              AND ISJSON(${payload}) = 1`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
    }

    /**
     * Wraps a payload expression so every object CONTAINING one of these paths exists.
     *
     * `JSON_MODIFY` does not create intermediate objects: writing `$.debug.paused` into a payload
     * with no `debug` key, or `$.debug.edgeOverrides."<id>"` with no override map yet, silently
     * changes nothing — which for a control verb means the write reports success (rowcount 1, the
     * row WAS updated, just not the way anyone meant) and the workflow never pauses. A graph only
     * acquires a `debug` key the first time somebody debugs it, so this is the NORMAL first call,
     * not an edge case.
     *
     * This hazard arrived WITH field-scoped writes and is the price of them: the whole-bag write
     * they replaced targeted `$.debug`, one level down from a root that always exists, so it
     * created the containing object as a side effect of every verb. Field-scoping is still the
     * right trade — it removes the step-resurrection class outright — but it moves the
     * container's existence from implicit to something this method has to guarantee.
     *
     * Each containing object is created only when absent, shallowest first, so an existing bag is
     * never replaced.
     */
    private ensureObjects(payload: string, paths: readonly string[]): string {
        const parents = new Set<string>();
        for (const path of paths) {
            for (const prefix of ContainingPaths(path)) parents.add(prefix);
        }
        // Shallowest first: `$.debug` must exist before `$.debug.edgeOverrides` can be added to it.
        const ordered = [...parents].sort((a, b) => a.length - b.length);
        return ordered.reduce(
            (inner, parent) =>
                `CASE WHEN JSON_QUERY(${inner}, '${this.escape(parent)}') IS NULL` +
                ` THEN JSON_MODIFY(${inner}, '${this.escape(parent)}', JSON_QUERY('{}'))` +
                ` ELSE ${inner} END`,
            payload,
        );
    }

    /** Renders one debug value as a SQL literal `JSON_MODIFY` will store with the right JSON type. */
    private renderDebugValue(value: TaskGraphDebugFieldValue): string {
        switch (value.Kind) {
            // `NULL` in lax mode DELETES the key, which is what "this verb cleared it" should mean.
            case 'null': return 'NULL';
            case 'bool': return `CAST(${value.Value ? 1 : 0} AS BIT)`;
            case 'string': return `'${this.escape(value.Value)}'`;
            // JSON_QUERY keeps objects and arrays as JSON rather than storing them as a string.
            case 'json': return `JSON_QUERY('${this.escape(value.Value)}')`;
        }
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
        const db = this.sql(provider);
        const payload = db.QuoteIdentifier('InputPayload');
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${payload} = JSON_MODIFY(${payload}, '$.debug.step', NULL)
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(parentTaskID)}'
              AND ${db.QuoteIdentifier('TypeID')} = '${this.escape(workflowTaskTypeID)}'
              AND ISJSON(${payload}) = 1
              AND JSON_VALUE(${payload}, '$.debug.step') IS NOT NULL`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const payload = db.QuoteIdentifier('InputPayload');
        const base = this.ensureObjects(payload, ['$.debug.paused']);
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${payload} = JSON_MODIFY(JSON_MODIFY(JSON_MODIFY(${base},
                    '$.debug.paused', CAST(1 AS BIT)),
                    '$.debug.pausedReason', 'breakpoint'),
                    '$.debug.pausedAtTaskID', '${this.escape(breakpointTaskID)}')
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(parentTaskID)}'
              AND ${db.QuoteIdentifier('TypeID')} = '${this.escape(workflowTaskTypeID)}'
              AND ISJSON(${payload}) = 1
              AND (JSON_VALUE(${payload}, '$.debug.paused') IS NULL
                   OR JSON_VALUE(${payload}, '$.debug.paused') = 'false')`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const value = inputPayload == null ? 'NULL' : `'${this.escape(inputPayload)}'`;
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('InputPayload')} = ${value}
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(taskID)}'
              AND ${db.QuoteIdentifier('TypeID')} = '${this.escape(workflowTaskTypeID)}'
              AND ${db.QuoteIdentifier('Status')} = '${this.escape(expectedStatus)}'`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
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
        const db = this.sql(provider);
        const output = outputPayload == null ? 'NULL' : `'${this.escape(outputPayload)}'`;
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('Status')} = 'Complete',
                ${db.QuoteIdentifier('OutputPayload')} = ${output},
                ${db.QuoteIdentifier('ErrorMessage')} = NULL,
                ${db.QuoteIdentifier('CompletedAt')} = SYSUTCDATETIME(),
                ${db.QuoteIdentifier('PercentComplete')} = 100,
                ${db.QuoteIdentifier('ClaimedBy')} = NULL,
                ${db.QuoteIdentifier('ClaimExpiresAt')} = NULL
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(taskID)}'
              AND ${db.QuoteIdentifier('TypeID')} = '${this.escape(workflowTaskTypeID)}'
              AND (${db.QuoteIdentifier('Status')} IN ('Pending','Failed','Blocked')
                   OR (${db.QuoteIdentifier('Status')} = 'In Progress'
                       AND (${db.QuoteIdentifier('ClaimExpiresAt')} IS NULL
                            OR ${db.QuoteIdentifier('ClaimExpiresAt')} < SYSUTCDATETIME())))`;
        return (await this.affectedRows(db, sql, contextUser)) === 1;
    }

    /** Runs the affected-rows statement, returning 0 on error rather than throwing into the loop. */
    private async affectedRows(db: DatabaseProviderBase, sql: string, contextUser: UserInfo): Promise<number> {
        try {
            // Trailing SELECT is how the row count comes back as data across both dialects, rather
            // than depending on a driver-specific rowsAffected field.
            const rows = await db.ExecuteSQL<{ AffectedRows: number }>(
                `${sql};\nSELECT @@ROWCOUNT AS ${db.QuoteIdentifier('AffectedRows')}`,
                undefined, undefined, contextUser,
            );
            return Number(rows?.[0]?.AffectedRows ?? 0);
        } catch (e) {
            LogError(`[TaskGraph] guarded write failed: ${e instanceof Error ? e.message : String(e)}`);
            return 0;
        }
    }

    private literalOrNull(value: string | null | undefined): string {
        return value == null ? 'NULL' : `'${this.escape(value)}'`;
    }

    /** Single-quote escaping. Inputs here are UUIDs and JSON the dispatcher itself produced. */
    private escape(value: string): string {
        return value.replace(/'/g, "''");
    }
}
