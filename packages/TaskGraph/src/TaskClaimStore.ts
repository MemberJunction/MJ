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
