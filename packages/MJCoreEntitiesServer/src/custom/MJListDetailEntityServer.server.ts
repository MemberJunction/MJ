import { BaseEntity, BaseEntityResult, EntityDeleteOptions, LogError, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJListDetailEntityExtended, MJListEntityExtended } from '@memberjunction/core-entities';

/**
 * Server-side List Details entity. Enforces the SAME row-level DELETE authorization as
 * {@link MJListEntityServer}, but scoped through the parent List's owner: a user may delete a
 * List Detail only if they own the List it belongs to, UNLESS they hold the Developer or Integration
 * role (who may delete any). The rule itself lives once in {@link MJListEntityExtended.UserCanDelete}
 * and is shared with the Lists entity and the UI — a single source of truth for "who can delete".
 *
 * Why this is needed: the `EntityPermission` migration grants the UI role entity-wide Delete on BOTH
 * Lists AND List Details (so users can manage their own lists). Lists get owner-scoping in
 * `MJListEntityServer`; without this parallel override a UI user could delete the membership rows of
 * lists they DON'T own, because a List Detail carries no owner of its own — only a `ListID`.
 *
 * The owner is resolved by looking up the parent List's `UserID`. If the parent List can't be found
 * (an orphaned detail, or the parent already deleted during list teardown — `spDeleteList` does not
 * cascade, so details are removed while the parent still exists in the normal path) the rule
 * fails OPEN: there is no owner to protect and the coarse entity permission still applies. Enforcement
 * only bites when a parent List genuinely exists and is owned by someone else.
 */
@RegisterClass(BaseEntity, 'MJ: List Details')
export class MJListDetailEntityServer extends MJListDetailEntityExtended {
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const ownerUserID = await this.resolveParentListOwnerUserID();

        // Only enforce when we could positively identify the owning user. A null owner means the
        // parent List wasn't found (orphan / already-deleted parent) — nothing to protect, fall open.
        if (ownerUserID != null &&
            !MJListEntityExtended.UserCanDelete(ownerUserID, this.ContextCurrentUser)) {
            const result = new BaseEntityResult();
            result.StartedAt = new Date();
            result.Success = false;
            result.Type = 'delete';
            result.Message = 'You do not have permission to delete this List item. Only the owner of ' +
                'the parent List, or a user in the Developer or Integration role, may delete it.';
            result.EndedAt = new Date();
            this.RegisterResultHistoryEntry(result);
            return false;
        }
        return super.Delete(options);
    }

    /**
     * Looks up the `UserID` (owner) of this detail's parent List. Returns `null` when it can't be
     * positively determined (no `ListID`, parent not found, or the lookup failed) so the caller can
     * fail open rather than block a legitimate/cascade delete. A read-only `simple` RunView limited to
     * the single `UserID` field keeps this cheap.
     */
    private async resolveParentListOwnerUserID(): Promise<string | null> {
        if (!this.ListID) {
            return null;
        }
        try {
            const rv = new RunView();
            const result = await rv.RunView<{ ID: string; UserID: string }>({
                EntityName: 'MJ: Lists',
                ExtraFilter: `ID = '${this.ListID}'`,
                Fields: ['ID', 'UserID'],
                MaxRows: 1,
                ResultType: 'simple'
            }, this.ContextCurrentUser);

            if (result.Success && result.Results && result.Results.length > 0) {
                return result.Results[0].UserID ?? null;
            }
        } catch (e) {
            // Fail open on a lookup error — don't block deletes on a transient read failure. The
            // security-relevant case (parent exists, owned by someone else) resolves normally.
            LogError(`MJListDetailEntityServer: failed to resolve parent List owner for ListID '${this.ListID}': ${e}`);
        }
        return null;
    }
}
