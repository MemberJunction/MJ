import {
    BaseEntity,
    EntityInfo,
    Metadata,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJUserRoleEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';

/**
 * Server-side `MJ: User Roles` entity — the other half of the system-user guard for
 * field-level security.
 *
 * `MJEntityFieldPermissionEntityServer` refuses a field rule aimed at a role the system user
 * already holds. This refuses the reverse move: giving the system user a role that already
 * carries field rules. Without both, an administrator can reach the forbidden state by doing
 * the two steps in the other order.
 *
 * Why the system user must stay unrestricted: the server runs background work as that account.
 * It pre-warms the shared engine caches at startup, and in task mode — which job and agent
 * runners use — engines instead load on first touch, so whichever caller gets there first
 * configures the engine for the entire process. Engine caches are process-wide and shared
 * across users. A restricted system user could therefore leave partially loaded records in a
 * cache that everyone reads afterward, with nothing at the point of failure pointing back at
 * the role assignment that caused it.
 *
 * This restricts CONFIGURATION only. There is still no user who is exempt from a Deny at
 * runtime — that decision stands unchanged.
 */
@RegisterClass(BaseEntity, 'MJ: User Roles')
export class MJUserRoleEntityServer extends MJUserRoleEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();

        const rejection = MJUserRoleEntityServer.SystemUserRejectionReason(this.UserID, this.RoleID);
        if (rejection) {
            result.Errors.push(new ValidationErrorInfo('RoleID', rejection, this.RoleID, ValidationErrorType.Failure));
        }

        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /**
     * Why this role may not be given to this user, or null when it may.
     * Only ever rejects for the system user; every other user is unaffected.
     */
    public static SystemUserRejectionReason(userID: string | null, roleID: string | null): string | null {
        if (!userID || !roleID) {
            return null;
        }
        // UserCache is populated on the server; a cold cache skips the check rather than
        // blocking an administrator on missing state.
        const systemUser = UserCache.Instance?.GetSystemUser?.();
        if (!systemUser || !UUIDsEqual(systemUser.ID, userID)) {
            return null; // not the system user — nothing to guard
        }

        const restricted = MJUserRoleEntityServer.EntitiesWithFieldRulesForRole(roleID);
        if (restricted.length === 0) {
            return null;
        }
        const shown = restricted.slice(0, 3).join(', ');
        const more = restricted.length > 3 ? `, and ${restricted.length - 3} more` : '';
        return (
            `This role carries field-level permissions (on ${shown}${more}), so it cannot be assigned to the MJ system user. ` +
            `The server runs background work as that account and shares one engine cache across all users — ` +
            `restricting it would let partially loaded records reach everyone. ` +
            `Assign this role to a regular user, or remove its field permissions first.`
        );
    }

    /**
     * Names of entities that have at least one field rule bound to this role. Walks cached
     * metadata only — no database access. Runs only when the system user is the save target,
     * which is rare.
     *
     * Deliberately does NOT gate on {@link EntityInfo.EnableFieldLevelSecurity}, even though
     * rules on a disabled entity are inactive and gating would be the cheaper walk. Gating
     * would leave the two halves of this guard unable to compose, and the gap is reachable in
     * three ordinary steps: disable field security on an entity, assign the role (now carrying
     * no active rules) to the system user, re-enable. Each step is permitted and the end state
     * is the one both guards exist to prevent. Disabling preserves rules so re-enabling does
     * not lose them, so a rule on a disabled entity is dormant rather than gone.
     */
    private static EntitiesWithFieldRulesForRole(roleID: string): string[] {
        const md = new Metadata();
        const names: string[] = [];
        for (const entity of md.Entities as EntityInfo[]) {
            const hit = entity.Fields.some(
                f => f.HasFieldPermissions && f.FieldPermissions.some(fp => UUIDsEqual(fp.RoleID, roleID))
            );
            if (hit) {
                names.push(entity.Name);
            }
        }
        return names;
    }
}

/**
 * Loader stub — prevents the class from being tree-shaken out of the bundle. Mirrors the
 * pattern used by the other server-side entity subclasses in this package.
 */
export function LoadMJUserRoleEntityServer(): void {
    // no-op
}
