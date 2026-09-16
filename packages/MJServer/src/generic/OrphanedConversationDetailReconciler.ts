import { LogError, LogStatus, RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJAIAgentRunEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';

/**
 * Grace period after a run reaches a terminal state before its conversation detail is considered
 * abandoned. The normal path closes the detail moments after the run finishes; this waits well past
 * that so a reconcile can never race a completion that is already on its way.
 */
export const ORPHAN_DETAIL_GRACE_MS = 2 * 60 * 1000;

/** Ceiling on details closed per pass, so a large backlog cannot stall startup. */
const MAX_DETAILS_PER_PASS = 200;

/** Agent-run statuses that mean execution is over, whatever the outcome. */
const TERMINAL_RUN_STATUSES = ['Completed', 'Failed', 'Cancelled'];

/**
 * Close conversation details left `In-Progress` by a run that is already over (MJ #4222).
 *
 * WHY THIS EXISTS. `AgentRunner` closes the detail as the final step of a run, so a process that
 * dies mid-run never reaches it. The agent-run watchdog repairs the RUN — force-failing it once the
 * heartbeat goes stale — but nothing repairs the detail, and the detail is the row the chat renders
 * from. The result is durable state that disagrees with itself: a terminal run beside a message
 * that still says it is being generated, spinning forever for anyone who opens it.
 *
 * WHY NOT IN THE SWEEP PROC. `spSweepStaleAIAgentRuns` is a single set-based UPDATE, and extending
 * it to the detail would be the obvious fix. It would also be the wrong one: `MJ: Conversation
 * Details` declares `TrustServerCacheCompletely`, so the server's RunView cache relies on
 * `BaseEntity` events for invalidation and a stored procedure fires none. The row would change
 * while every instance kept serving `In-Progress` from cache — a worse failure than the one being
 * fixed, because reconciliation itself would read the stale value back. Going through
 * `BaseEntity.Save()` costs a per-row write and buys correct invalidation everywhere.
 *
 * Idempotent and safe to run concurrently on several instances: the write is a no-op once the
 * status is terminal, and each pass re-reads state before deciding.
 *
 * @returns How many details were closed.
 */
export async function reconcileOrphanedConversationDetails(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    graceMs: number = ORPHAN_DETAIL_GRACE_MS
): Promise<number> {
    try {
        const rv = RunView.FromMetadataProvider(provider);

        const detailResult = await rv.RunView<MJConversationDetailEntity>(
            {
                EntityName: 'MJ: Conversation Details',
                ExtraFilter: `Status = 'In-Progress' AND Role = 'AI'`,
                OrderBy: '__mj_CreatedAt ASC',
                MaxRows: MAX_DETAILS_PER_PASS,
                ResultType: 'entity_object',
            },
            contextUser
        );
        if (!detailResult.Success || !detailResult.Results?.length) {
            return 0;
        }

        const runsByDetail = await loadTerminalRuns(rv, detailResult.Results.map(d => d.ID), contextUser);
        if (runsByDetail.size === 0) {
            return 0;
        }

        const ownersByConversation = await loadConversationOwners(
            rv,
            detailResult.Results.map(d => d.ConversationID).filter((id): id is string => !!id),
            contextUser
        );

        const cutoff = Date.now() - graceMs;
        let closed = 0;

        for (const detail of detailResult.Results) {
            const run = runsByDetail.get(detail.ID);
            if (!run) {
                // No run yet, or its run is still executing. Both are legitimately in progress.
                continue;
            }
            const completedAt = run.CompletedAt ? new Date(run.CompletedAt).getTime() : NaN;
            if (!Number.isFinite(completedAt) || completedAt > cutoff) {
                // Inside the grace window — the owning process may still be closing this itself.
                continue;
            }

            // Write as the conversation's OWNER, not as the system user.
            //
            // `MJConversationDetailEntityExtended.Save()` gates writes on conversation ownership: a
            // non-owner without a resource grant is refused, returning false with no result
            // registered anywhere — indistinguishable from a crash, and the reason this pass
            // silently wrote nothing at all until it was traced. The system user owns no
            // conversations, so it is exactly the caller that gate exists to stop. Saving as the
            // owner satisfies the gate on its own terms rather than routing around it, and keeps
            // the write attributable to the person whose message it is.
            const owner = detail.ConversationID ? ownersByConversation.get(detail.ConversationID) : undefined;
            if (!owner) {
                LogError(`[OrphanDetailReconciler] No owner resolved for conversation ${detail.ConversationID}; leaving detail ${detail.ID}`);
                continue;
            }
            const writable = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', owner);
            if (!(await writable.Load(detail.ID))) {
                LogError(`[OrphanDetailReconciler] Could not load detail ${detail.ID} for write`);
                continue;
            }
            writable.Status = run.Status === 'Completed' ? 'Complete' : 'Error';
            if (!writable.Message) {
                writable.Message = run.ErrorMessage ?? '❌ Failed';
            }

            if (await writable.Save()) {
                closed++;
            } else {
                const result = writable.LatestResult;
                LogError(
                    `[OrphanDetailReconciler] Failed to close detail ${detail.ID}: ` +
                    `${result?.CompleteMessage || result?.Message || 'no message'}`
                );
            }
        }

        if (closed > 0) {
            LogStatus(`[OrphanDetailReconciler] Closed ${closed} conversation detail(s) left behind by finished runs`);
        }
        return closed;
    } catch (err) {
        // Maintenance work must never take the server down with it.
        LogError(`[OrphanDetailReconciler] Pass failed: ${err instanceof Error ? err.message : String(err)}`);
        return 0;
    }
}

/**
 * Newest terminal run per conversation detail. Details whose newest run is still executing are
 * deliberately absent, so a retried message is judged on its latest attempt rather than an older
 * finished one.
 */
async function loadTerminalRuns(
    rv: RunView,
    detailIds: string[],
    contextUser: UserInfo
): Promise<Map<string, MJAIAgentRunEntity>> {
    const quoted = detailIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    const result = await rv.RunView<MJAIAgentRunEntity>(
        {
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ConversationDetailID IN (${quoted})`,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object',
        },
        contextUser
    );
    if (!result.Success) {
        return new Map();
    }

    const newest = new Map<string, MJAIAgentRunEntity>();
    for (const run of result.Results ?? []) {
        const detailId = run.ConversationDetailID;
        if (!detailId || newest.has(detailId)) {
            continue; // DESC order puts the newest run first
        }
        newest.set(detailId, run);
    }

    // Drop any detail whose newest attempt is still running.
    for (const [detailId, run] of newest) {
        if (!TERMINAL_RUN_STATUSES.includes(run.Status)) {
            newest.delete(detailId);
        }
    }
    return newest;
}

/**
 * Owner `UserInfo` per conversation, resolved through {@link UserCache}. The reconciler writes as
 * the owner so the conversation-detail permission gate is satisfied on its own terms.
 */
async function loadConversationOwners(
    rv: RunView,
    conversationIds: string[],
    contextUser: UserInfo
): Promise<Map<string, UserInfo>> {
    const owners = new Map<string, UserInfo>();
    if (conversationIds.length === 0) {
        return owners;
    }
    const quoted = [...new Set(conversationIds)].map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    const result = await rv.RunView<{ ID: string; UserID: string }>(
        {
            EntityName: 'MJ: Conversations',
            ExtraFilter: `ID IN (${quoted})`,
            Fields: ['ID', 'UserID'],
            ResultType: 'simple',
        },
        contextUser
    );
    if (!result.Success) {
        return owners;
    }
    const users = UserCache.Instance.Users;
    for (const row of result.Results ?? []) {
        if (!row.UserID) {
            continue;
        }
        const user = users.find(u => UUIDsEqual(u.ID, row.UserID));
        if (user) {
            owners.set(row.ID, user);
        }
    }
    return owners;
}
