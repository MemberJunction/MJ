/**
 * The identity an A2A task runs as.
 */
import type { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * The user a task runs as: the authenticated caller, taken from `users` (the user cache) so that
 * it carries the caller's roles, which the API key's own user record does not. Throws rather than
 * running a task as anyone else: with no caller, or a caller who is not an active cached user,
 * there is no identity to run as.
 *
 * @param authenticatedUser - The user the request authenticated as, if any
 * @param users - The active users, with their roles
 */
export function ResolveTaskCaller(authenticatedUser: UserInfo | undefined, users: UserInfo[]): UserInfo {
    if (!authenticatedUser) {
        throw new Error("No authenticated caller available for processing task");
    }
    const cached = users.find((u: UserInfo) => UUIDsEqual(u.ID, authenticatedUser.ID));
    if (!cached) {
        throw new Error("The authenticated caller is not an active user");
    }
    return cached;
}
