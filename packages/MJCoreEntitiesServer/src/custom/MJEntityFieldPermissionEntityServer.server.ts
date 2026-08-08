import {
    BaseEntity,
    EntityFieldInfo,
    IMetadataProvider,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJEntityFieldPermissionEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

/**
 * Server-side `MJ: Entity Field Permissions` entity — the save-time half of the
 * unrestrictable-target guard for field-level security.
 *
 * The runtime aggregation (`EntityFieldInfo.GetUserFieldPermissions`) already forces access
 * open for these targets, so this subclass is not what makes the system safe. It is what makes
 * the system *diagnosable*: without it an administrator can save a row that silently does
 * nothing, then reasonably conclude the feature is broken. Rejecting at save says why.
 *
 * Two categories are refused, matching the two runtime guards exactly:
 *
 * 1. **Primary keys and system columns.** Stripping a primary key from a result breaks entity
 *    load, `CompositeKey` construction, relationship resolution, and cache fingerprinting —
 *    failures that surface nowhere near the permission record that caused them.
 * 2. **The security-configuration and identity surface** (see
 *    {@link EntityFieldInfo.IsOnUnrestrictableEntity}). Restricting a column on the very
 *    entities field security is administered through produces a configuration that cannot be
 *    reversed through the product — recovery would mean direct SQL against the database.
 *
 * Note what is deliberately NOT here: any notion of a user who is exempt from a Deny. The
 * guard is on which *targets* are restrictable, not on which *users* are bound. A feature
 * whose purpose is compensation and donor-giving confidentiality cannot ship with a role that
 * quietly reads everything.
 */
@RegisterClass(BaseEntity, 'MJ: Entity Field Permissions')
export class MJEntityFieldPermissionEntityServer extends MJEntityFieldPermissionEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();

        const targetField = this.resolveTargetField();
        if (targetField) {
            const rejection = MJEntityFieldPermissionEntityServer.RejectionReason(targetField);
            if (rejection) {
                result.Errors.push(
                    new ValidationErrorInfo('EntityFieldID', rejection, this.EntityFieldID, ValidationErrorType.Failure)
                );
            }
        }

        const roleRejection = MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(this.RoleID);
        if (roleRejection) {
            result.Errors.push(new ValidationErrorInfo('RoleID', roleRejection, this.RoleID, ValidationErrorType.Failure));
        }

        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /**
     * Why this rule may not target this role, or null when it may.
     *
     * Refuses a rule aimed at a role the MJ **system user** holds. The system user is what the
     * server runs background work as: it pre-warms the shared engine caches at startup, and in
     * task mode (job and agent runners) whichever caller touches an engine first configures it
     * for the whole process. Restricting that account does not just restrict it — engines cache
     * their data process-wide, so a partially loaded engine would then serve incomplete records
     * to every user afterward. The damage is silent and nowhere near the rule that caused it.
     *
     * This is a guard on CONFIGURATION, not a runtime exemption. Field security still has no
     * user who is exempt from a Deny — that stands. What is refused here is the arrangement
     * that would make the server unable to do its own work. Take the role off the system user
     * and the rule saves.
     *
     * The database tier already refuses the equivalent arrangement: CodeGen skips a column DENY
     * for any role a service login belongs to, and warns. This is the same rule for the
     * application tier.
     */
    public static SystemUserRoleRejectionReason(roleID: string | null): string | null {
        if (!roleID) {
            return null;
        }
        // UserCache is populated on the server; a client-side save (or a cold cache) simply
        // skips the check rather than blocking an administrator on missing state.
        const systemUser = UserCache.Instance?.GetSystemUser?.();
        if (!systemUser?.UserRoles?.length) {
            return null;
        }
        const holdsRole = systemUser.UserRoles.some(ur => UUIDsEqual(ur.RoleID, roleID));
        if (!holdsRole) {
            return null;
        }
        const roleName = systemUser.UserRoles.find(ur => UUIDsEqual(ur.RoleID, roleID))?.Role ?? roleID;
        return (
            `Role '${roleName}' is held by the MJ system user, so it cannot carry field-level permissions. ` +
            `The server runs background work as that account and shares one engine cache across all users — ` +
            `restricting it would let partially loaded records reach everyone. ` +
            `Remove the role from the system user first, or apply this rule to a different role.`
        );
    }

    /**
     * Why this field may not be secured, or null when it may be.
     * Static + field-driven so the same wording can back a future admin-UI pre-check.
     */
    public static RejectionReason(field: EntityFieldInfo): string | null {
        if (field.IsUnrestrictableField) {
            const reason = field.IsPrimaryKey || field.IsSoftPrimaryKey ? 'a primary key' : 'a system column';
            return (
                `Field '${field.Entity}.${field.Name}' is ${reason} and cannot be secured by field-level permissions. ` +
                `Primary keys and system columns must stay readable — removing one from a result breaks entity loading, ` +
                `composite keys, relationship resolution, and cache fingerprinting. Secure the sensitive field itself instead.`
            );
        }

        if (field.IsOnUnrestrictableEntity) {
            return (
                `Entity '${field.Entity}' is part of the security configuration and identity surface, so its fields ` +
                `cannot be secured by field-level permissions. Restricting a column here can produce a configuration ` +
                `that cannot be reversed through the application — undoing it would require direct database access.`
            );
        }

        return null;
    }

    /**
     * Resolves `EntityFieldID` to its {@link EntityFieldInfo} from loaded metadata.
     *
     * Returns null when metadata cannot resolve it — for instance immediately after a schema
     * change, before the metadata cache has refreshed. That case passes validation rather than
     * blocking the administrator: the foreign key already guarantees the row points at a real
     * field, and the runtime aggregation guards hold regardless of what is stored here. Failing
     * closed would trade a real, recurring workflow block for no additional protection.
     */
    private resolveTargetField(): EntityFieldInfo | null {
        if (!this.EntityFieldID) {
            return null; // the NOT NULL column is the base class's problem to report, not ours
        }
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        for (const entity of md?.Entities ?? []) {
            const match = entity.Fields.find((f) => UUIDsEqual(f.ID, this.EntityFieldID));
            if (match) {
                return match;
            }
        }
        return null;
    }
}
