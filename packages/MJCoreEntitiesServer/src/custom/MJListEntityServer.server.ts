import { BaseEntity, BaseEntityResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJListEntityExtended } from '@memberjunction/core-entities';

/**
 * Server-side Lists entity. Enforces row-level DELETE authorization: a user may delete a List only
 * if they own it, UNLESS they hold the Developer or Integration role (who may delete any List). The
 * rule itself lives once in {@link MJListEntityExtended.UserCanDelete} and is shared with the UI.
 *
 * This is the security-critical enforcement point. The `EntityPermission` migration grants the UI
 * role entity-wide Delete permission on Lists (so standard users can delete their own); this override
 * narrows that back down to owner-or-privileged at the application layer, since coarse entity
 * permissions can't express row-level ownership. On denial it returns `false` and records a
 * `BaseEntityResult` so callers get `LatestResult.CompleteMessage` (Delete does not throw on a
 * logical rejection — see the CLAUDE.md Save/Delete error-handling contract).
 */
@RegisterClass(BaseEntity, 'MJ: Lists')
export class MJListEntityServer extends MJListEntityExtended {
    public override async Delete(): Promise<boolean> {
        if (!MJListEntityExtended.UserCanDelete(this.UserID, this.ContextCurrentUser)) {
            const result = new BaseEntityResult();
            result.StartedAt = new Date();
            result.Success = false;
            result.Type = 'delete';
            result.Message = 'You do not have permission to delete this List. Only the List owner, ' +
                'or a user in the Developer or Integration role, may delete it.';
            result.EndedAt = new Date();
            this.RegisterResultHistoryEntry(result);
            return false;
        }
        return super.Delete();
    }
}
