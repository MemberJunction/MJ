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

        result.Success = result.Success && result.Errors.length === 0;
        return result;
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
