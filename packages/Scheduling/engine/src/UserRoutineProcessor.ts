/**
 * @fileoverview Pure, side-effect-free logic for the User Routines dispatcher.
 *
 * Everything in this module is deterministic and unit-testable without a database:
 * due-evaluation (activation window + NextRunAt), next-run/claim computation (cron with a
 * StartAt floor), OnChange result hashing, the notify-condition matrix, and recipient
 * ordering. The `UserRoutineDispatcherDriver` composes these primitives with the entity
 * layer; `MJUserRoutineEntityServer` (in @memberjunction/core-entities-server) reuses
 * `ComputeRoutineNextRunAt` so the entity save path and the dispatcher compute NextRunAt
 * with the SAME cron helper and StartAt semantics.
 *
 * @module @memberjunction/scheduling-engine
 */

import { createHash } from 'node:crypto';
import type { MJUserRoutineEntity, MJUserRoutineRunEntity } from '@memberjunction/core-entities';
import { CronExpressionHelper } from './CronExpressionHelper';

/**
 * The minimal, entity-derived field set the schedule evaluation functions read.
 * Field types are indexed off the generated entity (never hand-copied unions) so
 * CodeGen CHECK-constraint changes flow through automatically.
 */
export interface UserRoutineScheduleFields {
    Status: MJUserRoutineEntity['Status'];
    CronExpression: MJUserRoutineEntity['CronExpression'];
    Timezone: MJUserRoutineEntity['Timezone'];
    StartAt: MJUserRoutineEntity['StartAt'];
    EndAt: MJUserRoutineEntity['EndAt'];
    NextRunAt: MJUserRoutineEntity['NextRunAt'];
}

/**
 * Same 1-second tolerance the ScheduledJobEngine applies when comparing NextRunAt to the
 * evaluation time, so a routine whose NextRunAt lands a few hundred ms after the sweep
 * timestamp still runs on this pass instead of waiting a full dispatcher interval.
 */
export const ROUTINE_DUE_TOLERANCE_MS = 1000;

/**
 * Compute the next run time for a routine: the first cron occurrence strictly after
 * `fromDate`, floored by the routine's activation-window start. When `startAt` is in the
 * future relative to `fromDate`, the next occurrence is computed from `startAt` instead —
 * an Active routine never gets a NextRunAt before its window opens.
 *
 * @throws when the cron expression or timezone is invalid (callers validate first via
 *         {@link CronExpressionHelper.ValidateExpression} / entity Validate()).
 */
export function ComputeRoutineNextRunAt(
    cronExpression: string,
    timezone: string,
    fromDate: Date,
    startAt?: Date | null
): Date {
    const effectiveFrom = startAt != null && startAt.getTime() > fromDate.getTime() ? startAt : fromDate;
    return CronExpressionHelper.GetNextRunTime(cronExpression, timezone || 'UTC', effectiveFrom);
}

/**
 * Activation-window check (independent of NextRunAt):
 * - StartAt: NULL = eligible immediately; otherwise eligible once `StartAt <= now`.
 * - EndAt:   NULL = no end; otherwise eligible only while `EndAt > now` (automatic sunset —
 *   a routine whose EndAt equals the evaluation time has already ended).
 */
export function IsRoutineWithinActivationWindow(
    fields: Pick<UserRoutineScheduleFields, 'StartAt' | 'EndAt'>,
    now: Date
): boolean {
    if (fields.StartAt != null && fields.StartAt.getTime() > now.getTime()) {
        return false;
    }
    if (fields.EndAt != null && fields.EndAt.getTime() <= now.getTime()) {
        return false;
    }
    return true;
}

/**
 * Full due-evaluation: Active + inside the activation window + NextRunAt set and passed
 * (within {@link ROUTINE_DUE_TOLERANCE_MS}). A NULL NextRunAt is never "due" — it means the
 * routine needs seeding (see {@link RoutineNeedsSeeding}).
 */
export function IsRoutineDue(fields: UserRoutineScheduleFields, now: Date): boolean {
    if (fields.Status !== 'Active') {
        return false;
    }
    if (!IsRoutineWithinActivationWindow(fields, now)) {
        return false;
    }
    if (fields.NextRunAt == null) {
        return false;
    }
    return fields.NextRunAt.getTime() <= now.getTime() + ROUTINE_DUE_TOLERANCE_MS;
}

/**
 * A routine "needs seeding" when it is Active, inside its activation window, and has never
 * had a NextRunAt computed (newly created outside the entity-server save path, or legacy
 * rows). The dispatcher computes + saves NextRunAt for these WITHOUT running them — they
 * become due on a later sweep once their first cron occurrence passes.
 */
export function RoutineNeedsSeeding(fields: UserRoutineScheduleFields, now: Date): boolean {
    return fields.Status === 'Active' && fields.NextRunAt == null && IsRoutineWithinActivationWindow(fields, now);
}

/**
 * SQL prefilter for the dispatcher's due-routine sweep. Matches Active routines inside
 * their activation window whose NextRunAt is NULL (seeding candidates) or has passed.
 * Every row returned is re-verified in JS via {@link IsRoutineDue} / {@link RoutineNeedsSeeding}
 * — the SQL filter only narrows the sweep, it is not the source of truth.
 */
export function BuildDueRoutineFilter(nowIso: string): string {
    return `Status='Active'` +
        ` AND (StartAt IS NULL OR StartAt <= '${nowIso}')` +
        ` AND (EndAt IS NULL OR EndAt > '${nowIso}')` +
        ` AND (NextRunAt IS NULL OR NextRunAt <= '${nowIso}')`;
}

/**
 * SHA-256 hex digest of the normalized result content. Normalization collapses all
 * whitespace runs to single spaces and trims, so cosmetic formatting differences (line
 * wrapping, trailing newlines) do not register as "changes" for OnChange detection.
 * Null/undefined content hashes as the empty string — deterministic, never throws.
 */
export function ComputeResultHash(content: string | null | undefined): string {
    const normalized = (content ?? '').replace(/\s+/g, ' ').trim();
    return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * The notify-condition matrix. Only terminal outcomes (Success/Failed) can notify —
 * Running/Skipped never do, regardless of condition.
 *
 * - `Always`:    any terminal outcome.
 * - `OnSuccess`: Status === 'Success'.
 * - `OnFailure`: Status === 'Failed'.
 * - `OnChange`:  the run's ResultHash differs from the routine's prior LastResultHash.
 *   A NULL prior hash (first run) counts as changed — the first observation of a
 *   monitored value is itself news.
 */
export function EvaluateNotifyCondition(
    condition: MJUserRoutineEntity['NotifyCondition'],
    runStatus: MJUserRoutineRunEntity['Status'],
    resultHash: string | null,
    priorResultHash: string | null
): boolean {
    if (runStatus !== 'Success' && runStatus !== 'Failed') {
        return false;
    }
    switch (condition) {
        case 'Always':
            return true;
        case 'OnSuccess':
            return runStatus === 'Success';
        case 'OnFailure':
            return runStatus === 'Failed';
        case 'OnChange':
            return resultHash != null && resultHash !== priorResultHash;
        default:
            // Future CHECK-constraint values flow through the generated union; stay total
            // and conservative (no notification) until explicitly handled.
            return false;
    }
}

/**
 * Returns a new array of recipients ordered by ascending Sequence. Ties preserve the
 * input order (stable). The input array is not mutated.
 */
export function SortRecipientsBySequence<T extends { Sequence: number }>(recipients: T[]): T[] {
    return [...recipients].sort((a, b) => a.Sequence - b.Sequence);
}

/**
 * Run `worker` over `items` with at most `limit` concurrent executions. Results are
 * returned in input order. The worker is responsible for its own error handling — a
 * rejection from one item propagates, so dispatcher callers wrap each routine's work in
 * its own try/catch (per-routine error isolation).
 */
export async function RunWithBoundedConcurrency<TItem, TResult>(
    items: TItem[],
    limit: number,
    worker: (item: TItem) => Promise<TResult>
): Promise<TResult[]> {
    const effectiveLimit = Math.max(1, Math.floor(limit));
    const results: TResult[] = new Array<TResult>(items.length);
    let nextIndex = 0;

    const lane = async (): Promise<void> => {
        while (true) {
            const index = nextIndex++;
            if (index >= items.length) {
                return;
            }
            results[index] = await worker(items[index]);
        }
    };

    const lanes = Array.from({ length: Math.min(effectiveLimit, items.length) }, () => lane());
    await Promise.all(lanes);
    return results;
}
