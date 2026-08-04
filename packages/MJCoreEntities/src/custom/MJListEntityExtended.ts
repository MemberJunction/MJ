import { BaseEntity, UserInfo } from "@memberjunction/core";
import { RegisterClass, UUIDsEqual } from "@memberjunction/global";
import { MJListEntity } from "../generated/entity_subclasses";

/**
 * Roles whose members may delete ANY List, regardless of ownership. Compared case-insensitively
 * (and trimmed) against the user's role names.
 */
const LIST_DELETE_PRIVILEGED_ROLES = ['developer', 'integration'];

/**
 * Client-side extension of the Lists entity. Its primary purpose is to host the shared, pure
 * {@link UserCanDelete} authorization rule so BOTH the Angular UI (to enable/disable Delete
 * affordances) and the server-side `MJListEntityServer` (to actually enforce the rule inside
 * `Delete()`) evaluate identical logic from a single source of truth — no drift, and no
 * cross-package re-export (both the client and the server import `@memberjunction/core-entities`
 * directly, per CLAUDE.md rule #5).
 */
@RegisterClass(BaseEntity, 'MJ: Lists')
export class MJListEntityExtended extends MJListEntity {
    /**
     * Authorization rule for deleting a List:
     *   - a user in the **Developer** or **Integration** role may delete ANY List;
     *   - any other user (e.g. the standard **UI** role) may delete a List ONLY if they own it
     *     (`List.UserID === user.ID`).
     *
     * Pure and side-effect free so it can be called from both the client (button enable/disable)
     * and the server (hard enforcement). UUID comparison uses {@link UUIDsEqual} to be safe across
     * SQL Server (uppercase) and PostgreSQL (lowercase) casing.
     *
     * @param listOwnerUserID the List's owning UserID (`List.UserID`)
     * @param user the acting user, with `UserRoles` populated; `null`/`undefined` → not allowed
     */
    public static UserCanDelete(listOwnerUserID: string | null | undefined, user: UserInfo | null | undefined): boolean {
        if (!user) {
            return false;
        }
        const hasPrivilegedRole = (user.UserRoles ?? []).some(
            ur => LIST_DELETE_PRIVILEGED_ROLES.includes((ur.Role ?? '').trim().toLowerCase())
        );
        if (hasPrivilegedRole) {
            return true;
        }
        return UUIDsEqual(listOwnerUserID, user.ID);
    }
}
