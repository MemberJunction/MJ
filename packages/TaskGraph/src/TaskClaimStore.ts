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
import { ReconciliationEvent } from './types';

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
        const expires = new Date(Date.now() + this.claimTTLSeconds * 1000);
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('Status')} = 'In Progress',
                ${db.QuoteIdentifier('ClaimedBy')} = '${this.escape(this.instanceID)}',
                ${db.QuoteIdentifier('ClaimExpiresAt')} = '${expires.toISOString()}',
                ${db.QuoteIdentifier('StartedAt')} = '${new Date().toISOString()}'
            WHERE ${db.QuoteIdentifier('ID')} = '${this.escape(taskID)}'
              AND ${db.QuoteIdentifier('Status')} = 'Pending'
              AND (${db.QuoteIdentifier('ClaimedBy')} IS NULL
                   OR ${db.QuoteIdentifier('ClaimExpiresAt')} IS NULL
                   OR ${db.QuoteIdentifier('ClaimExpiresAt')} < '${new Date().toISOString()}')`;
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
        const expires = new Date(Date.now() + this.claimTTLSeconds * 1000);
        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('ClaimExpiresAt')} = '${expires.toISOString()}'
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
            `${db.QuoteIdentifier('CompletedAt')} = '${new Date().toISOString()}'`,
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
     * **Human tasks are exempt** (review round 2). A task assigned to a person (`UserID` set) never
     * carries a claim, so `In Progress` with no claim is its *legitimate* parked shape — an approval
     * waiting on someone. Normalizing it would reset that approval out from under the user. Their
     * lifecycle is driven by `DueAt` notification and escalation, never by claim expiry.
     *
     * Only expired claims are reclaimed; a live claim is left strictly alone, which is what keeps a
     * slow-but-healthy task from being executed twice.
     */
    public async ReleaseExpiredClaims(provider: IMetadataProvider, contextUser: UserInfo): Promise<ReconciliationEvent[]> {
        const db = this.sql(provider);
        const now = new Date().toISOString();

        // Capture what will be reclaimed BEFORE reclaiming, so the log names the tasks. The
        // subsequent UPDATE re-states the same predicate, so a task whose claim was refreshed in
        // between is correctly skipped rather than reclaimed on stale information.
        const candidates = await db.ExecuteSQL<{ ID: string; Name: string; ClaimedBy: string }>(
            `SELECT ${db.QuoteIdentifier('ID')}, ${db.QuoteIdentifier('Name')}, ${db.QuoteIdentifier('ClaimedBy')}
             FROM ${this.taskTable(provider)}
             WHERE ${db.QuoteIdentifier('Status')} = 'In Progress'
               AND (${db.QuoteIdentifier('AgentID')} IS NOT NULL OR ${db.QuoteIdentifier('ActionID')} IS NOT NULL)
               AND ${db.QuoteIdentifier('ClaimedBy')} IS NOT NULL
               AND ${db.QuoteIdentifier('ClaimExpiresAt')} IS NOT NULL
               AND ${db.QuoteIdentifier('ClaimExpiresAt')} < '${now}'`,
            undefined, undefined, contextUser,
        );

        if (!candidates || candidates.length === 0) return [];

        const sql = `
            UPDATE ${this.taskTable(provider)}
            SET ${db.QuoteIdentifier('Status')} = 'Pending',
                ${db.QuoteIdentifier('ClaimedBy')} = NULL,
                ${db.QuoteIdentifier('ClaimExpiresAt')} = NULL
            WHERE ${db.QuoteIdentifier('Status')} = 'In Progress'
              AND (${db.QuoteIdentifier('AgentID')} IS NOT NULL OR ${db.QuoteIdentifier('ActionID')} IS NOT NULL)
              AND ${db.QuoteIdentifier('ClaimedBy')} IS NOT NULL
              AND ${db.QuoteIdentifier('ClaimExpiresAt')} IS NOT NULL
              AND ${db.QuoteIdentifier('ClaimExpiresAt')} < '${now}'`;
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
               AND (${db.QuoteIdentifier('AgentID')} IS NOT NULL OR ${db.QuoteIdentifier('ActionID')} IS NOT NULL)
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
                ${db.QuoteIdentifier('CompletedAt')} = '${new Date().toISOString()}'
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
        deliveredAs: 'delivered' | 'expired',
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
