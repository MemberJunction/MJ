/**
 * The operation handlers an A2A task is processed with.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { EntityOperations } from './EntityOperations.js';
import { AgentOperations } from './AgentOperations.js';
import { ResolveTaskCaller } from './TaskCaller.js';

/** The handlers for one task, each bound to the task's caller. */
export interface TaskOperations {
    /** The user the task runs as. */
    Caller: UserInfo;
    EntityOps: EntityOperations;
    AgentOps: AgentOperations;
}

/**
 * Builds the entity and agent operation handlers for a task. Both run as the caller resolved by
 * {@link ResolveTaskCaller}, so row- and field-level security apply to the caller, never to the
 * system user or another fallback identity. Throws when there is no caller to run as.
 *
 * @param authenticatedUser - The user the request authenticated as, if any
 * @param users - The cached users, with their roles
 * @param provider - The metadata provider every operation binds to
 */
export function CreateTaskOperations(authenticatedUser: UserInfo | undefined, users: UserInfo[], provider: IMetadataProvider): TaskOperations {
    const caller = ResolveTaskCaller(authenticatedUser, users);
    return {
        Caller: caller,
        EntityOps: new EntityOperations(provider, caller),
        AgentOps: new AgentOperations(caller, provider),
    };
}
