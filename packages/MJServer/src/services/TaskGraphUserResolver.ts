/**
 * @fileoverview MJServer's implementation of the task-graph `TaskUserResolver` seam.
 *
 * The dispatcher runs as the system user, but each step of a graph runs as the person who
 * submitted it. The graph records that person only as an ID, so the dispatcher needs a way back to
 * a `UserInfo` with its roles — and the process-wide user cache lives here, on the server side,
 * where the task-graph package cannot reach it.
 *
 * @module @memberjunction/server
 */
import { LogError, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { TaskUserResolver } from '@memberjunction/task-graph';

/**
 * Looks a graph's submitter up in {@link UserCache}.
 *
 * `FindUser` answers from memory for anyone the cache holds and falls back to a single-row read for
 * someone created since the last refresh, so a graph started by a brand-new user still runs. The
 * cache keeps itself current on user and role changes, which is why the dispatcher looks the user
 * up per step rather than holding a copy for the life of the graph.
 */
export class TaskGraphUserResolver implements TaskUserResolver {
    public async FindUserByID(userID: string): Promise<UserInfo | undefined> {
        try {
            return await UserCache.Instance.FindUser({ ID: userID });
        } catch (e) {
            // The seam's contract is "never throw": an unanswered lookup fails the step, which is
            // the safe outcome, whereas a throw would be the dispatcher's problem to interpret.
            LogError(`[TaskGraphUserResolver] Looking up user ${userID} failed: ${e instanceof Error ? e.message : String(e)}`);
            return undefined;
        }
    }
}
