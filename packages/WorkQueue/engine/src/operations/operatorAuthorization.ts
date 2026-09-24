import { Metadata } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';

export type OperatorAccess = 'read' | 'operate';

/** Read operations expose delivery rows (payloads may hold PII), so they require Read on the deliveries entity. */
export const OPERATOR_READ_ENTITY = 'MJ: Work Queue Deliveries';
/** Replay and discard change what a subscription processes, so they require Update on the subscriptions entity. */
export const OPERATOR_OPERATE_ENTITY = 'MJ: Work Queue Subscriptions';

export type EntityPermissionLookup = (entityName: string, user: UserInfo) => { CanRead: boolean; CanUpdate: boolean } | null;

/**
 * BaseRemotableOperation.Authorize receives no provider, so entity metadata comes from Metadata.Provider. Entity
 * permissions are global metadata — identical on every provider of the process — so this is not a multi-provider hazard.
 */
const metadataLookup: EntityPermissionLookup = (entityName, user) => {
    const entity = Metadata.Provider.EntityByName(entityName);
    return entity ? entity.GetUserPermisions(user) : null;
};

let testLookup: EntityPermissionLookup | null = null;

/** Unit tests only: replace the metadata lookup (pass null to restore it). */
export function SetOperatorPermissionLookupForTests(lookup: EntityPermissionLookup | null): void {
    testLookup = lookup;
}

/**
 * 03 §8 (F7): MJ's resolver checks RequiredScope only for API-key callers, so every work-queue operation also requires
 * an entity permission of the acting user. Fails closed: an unknown entity or a lookup error refuses.
 */
export function AuthorizeWorkQueueOperator(access: OperatorAccess, user: UserInfo, lookup: EntityPermissionLookup = testLookup ?? metadataLookup): boolean {
    try {
        const permissions = lookup(access === 'read' ? OPERATOR_READ_ENTITY : OPERATOR_OPERATE_ENTITY, user);
        if (!permissions) {
            return false;
        }
        return access === 'read' ? permissions.CanRead === true : permissions.CanUpdate === true;
    } catch {
        return false;
    }
}
