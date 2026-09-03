import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntityInfo,
    IMetadataProvider,
    IsRestrictingFieldRule,
    Metadata,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJUserRoleEntity } from '@memberjunction/core-entities';
import { FindSystemUserFieldAccessViolations, UserCache } from '@memberjunction/generic-database-provider';

/**
 * Server-side `MJ: User Roles` entity — the other half of the system-user guard for
 * field-level security.
 *
 * `MJEntityFieldPermissionEntityServer` guards the RULES; this guards the account's ROLE SET, from
 * both directions. Without both halves an administrator reaches the forbidden state simply by
 * doing the steps in a different order.
 *
 * - **Assignment** ({@link SystemUserRejectionReason}) — refuses giving the system user a role that
 *   already denies a field. Only DENYING rules count here, because adding a role can only add rules
 *   to the aggregate: its `Allow` rows grant, its `No Access` rows are inert, and only a `Deny`
 *   can take something away. A guard that counted every rule would refuse to reassemble the
 *   account's own role set the moment field security was enabled anywhere.
 * - **Removal** ({@link Delete}) — refuses taking a role away when that would leave the account
 *   short of its entity-level access. Removal is the opposite shape: it drops rules OUT of the
 *   aggregate, so what matters is not what the departing role said but whether an `Allow` survives
 *   without it.
 *
 * Why the system user must stay unrestricted: the server runs background work as that account.
 * It pre-warms the shared engine caches at startup, and in task mode — which job and agent
 * runners use — engines instead load on first touch, so whichever caller gets there first
 * configures the engine for the entire process. Engine caches are process-wide and shared
 * across users. A restricted system user could therefore leave partially loaded records in a
 * cache that everyone reads afterward, with nothing at the point of failure pointing back at
 * the role assignment that caused it.
 *
 * This restricts CONFIGURATION only. There is no user who is exempt from a Deny at runtime —
 * not even the system user, whose access comes from the same rows as everyone else's.
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
     * Refuses REMOVING a role from the system user when that would cost the account its field
     * access.
     *
     * The mirror of the assignment guard, and needed for the same reason the field-permission
     * subclass guards its own delete path: the system user's access is ordinary `Allow` rows, and
     * taking a role away drops that role's rows out of the aggregate. If the remaining roles have
     * `No Access` on a field, the last removal denies it — with no `Deny` written anywhere and no
     * field-permission row touched.
     *
     * Permits the removal when it also costs the account its entity-level read, since it is then
     * denied one level up and field rules decide nothing — which is why the projection re-evaluates
     * the entity ceiling too, rather than only the field rules.
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const rejection = this.systemUserRoleRemovalReason();
        if (rejection) {
            const result = new BaseEntityResult();
            result.Success = false;
            result.Type = 'delete';
            result.Message = rejection;
            result.StartedAt = new Date();
            result.EndedAt = new Date();
            this.ResultHistory.push(result);
            return false;
        }
        return super.Delete(options);
    }

    /**
     * Why this role may not be taken off this user, or null when it may.
     * Only ever rejects for the system user; every other user is unaffected.
     */
    private systemUserRoleRemovalReason(): string | null {
        const systemUser = UserCache.Instance?.GetSystemUser?.();
        if (!systemUser || !this.UserID || !this.RoleID || !UUIDsEqual(systemUser.ID, this.UserID)) {
            return null; // not the system user — nothing to guard
        }

        const provider = this.ProviderToUse as unknown as IMetadataProvider;
        const lost = FindSystemUserFieldAccessViolations(provider, systemUser, { WithoutRoleID: this.RoleID });
        if (lost.length === 0) {
            return null;
        }
        const shown = lost.slice(0, 3).map(v => `${v.EntityName}.${v.FieldName}`).join(', ');
        const more = lost.length > 3 ? `, and ${lost.length - 3} more` : '';
        return (
            `Removing this role from the MJ system user would leave it unable to use ${lost.length} field(s) ` +
            `(${shown}${more}). The server runs background work as that account and shares one engine cache across ` +
            `all users, so restricting it would let partially loaded records reach everyone. Field security has no ` +
            `exempt user — grant those fields to another role the system user holds first.`
        );
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

        const restricted = MJUserRoleEntityServer.EntitiesWithRestrictingFieldRulesForRole(roleID);
        if (restricted.length === 0) {
            return null;
        }
        const shown = restricted.slice(0, 3).join(', ');
        const more = restricted.length > 3 ? `, and ${restricted.length - 3} more` : '';
        return (
            `This role denies access to at least one field (on ${shown}${more}), so it cannot be assigned to the MJ system user. ` +
            `The server runs background work as that account and shares one engine cache across all users — ` +
            `restricting it would let partially loaded records reach everyone. ` +
            `Assign this role to a regular user, or remove its field permissions first.`
        );
    }

    /**
     * Names of entities where this role carries at least one RESTRICTING field rule — a `Deny`
     * on any verb. Walks cached metadata only — no database access. Runs only when the system
     * user is the save target, which is rare.
     *
     * Grants and neutrals are ignored, and must be: the system user holds the standard roles
     * (UI, Developer, Integration), snapshot initialization writes those roles `Allow` rows on
     * every entity they can read, and field security has no runtime exemption to fall back on.
     * A guard that counted any rule at all would refuse to reassemble the system user's own role
     * set the moment field security was enabled anywhere.
     *
     * Deliberately does NOT gate on {@link EntityInfo.EnableFieldLevelSecurity}, even though
     * rules on a disabled entity are inactive and gating would be the cheaper walk. Gating
     * would leave the two halves of this guard unable to compose, and the gap is reachable in
     * three ordinary steps: disable field security on an entity, assign the role (now carrying
     * no active rules) to the system user, re-enable. Each step is permitted and the end state
     * is the one both guards exist to prevent. Disabling preserves rules so re-enabling does
     * not lose them, so a rule on a disabled entity is dormant rather than gone.
     */
    private static EntitiesWithRestrictingFieldRulesForRole(roleID: string): string[] {
        const md = new Metadata();
        const names: string[] = [];
        for (const entity of md.Entities as EntityInfo[]) {
            const hit = entity.Fields.some(
                f =>
                    f.HasFieldPermissions &&
                    f.FieldPermissions.some(fp => UUIDsEqual(fp.RoleID, roleID) && IsRestrictingFieldRule(fp))
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
