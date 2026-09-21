import {
    BaseEntity,
    BaseEntityResult,
    EntityDeleteOptions,
    EntityFieldInfo,
    EntitySaveOptions,
    EntityInfo,
    FieldPermissionAccess,
    FieldPermissionRuleForRole,
    FieldPermissionRuleVerbs,
    IMetadataProvider,
    IsRestrictingFieldRule,
    LogError,
    RunView,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJEntityFieldPermissionEntity } from '@memberjunction/core-entities';
import { SystemUserFieldAccessLossReason, SystemUserHoldsRole, UserCache } from '@memberjunction/generic-database-provider';

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
 * A third category is refused for a different reason: a **`Deny`** aimed at a role the MJ system
 * user holds (see {@link SystemUserRoleRejectionReason}). That one is not about diagnosability —
 * it is what lets the runtime aggregation have no exempt user at all. The server's own account
 * gets its access from ordinary `Allow` rows like everyone else, and this guard is what stops
 * those being revoked.
 *
 * Note what is deliberately NOT here: any notion of a user who is exempt from a Deny at
 * RUNTIME. The guards are on which *targets* are restrictable and on what may be *configured*,
 * never on whose access is evaluated. A feature whose purpose is compensation and donor-giving
 * confidentiality cannot ship with a role that quietly reads everything.
 */
@RegisterClass(BaseEntity, 'MJ: Entity Field Permissions')
export class MJEntityFieldPermissionEntityServer extends MJEntityFieldPermissionEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();

        const target = this.resolveTarget();
        if (target) {
            const entityPermissionRejection = MJEntityFieldPermissionEntityServer.EntityPermissionRequiredRejectionReason(
                target.Entity,
                this.RoleID
            );
            if (entityPermissionRejection) {
                result.Errors.push(
                    new ValidationErrorInfo('RoleID', entityPermissionRejection, this.RoleID, ValidationErrorType.Failure)
                );
            }
        }

        const targetField = target?.Field;
        if (targetField) {
            const rejection = MJEntityFieldPermissionEntityServer.RejectionReason(targetField);
            if (rejection) {
                result.Errors.push(
                    new ValidationErrorInfo('EntityFieldID', rejection, this.EntityFieldID, ValidationErrorType.Failure)
                );
            }
            const writeVerbRejection = MJEntityFieldPermissionEntityServer.WriteVerbRejectionReason(targetField, this);
            if (writeVerbRejection) {
                result.Errors.push(
                    new ValidationErrorInfo('EntityFieldID', writeVerbRejection, this.EntityFieldID, ValidationErrorType.Failure)
                );
            }
        }

        const roleRejection = MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(this.RoleID, this);
        if (roleRejection) {
            result.Errors.push(new ValidationErrorInfo('RoleID', roleRejection, this.RoleID, ValidationErrorType.Failure));
        }

        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /**
     * Refuses an EDIT that would strip the MJ system user's last `Allow` on a field.
     *
     * Not in `Validate()` for two reasons. It needs the field's rules as they stand in the
     * DATABASE — loaded metadata lags recent writes, and reading a stale sibling row as `Allow` is
     * exactly how three individually-innocent `No Access` edits get through one at a time. And
     * loading them is asynchronous, which `Validate()` is not.
     *
     * Inserts are deliberately not checked: adding a rule can only add access, never remove an
     * existing `Allow`, so the `Deny` check in `Validate()` covers them completely. It has to —
     * snapshot initialization writes its rows one at a time, and an aggregate check would refuse
     * the half-built state.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.IsSaved) {
            const rejection = await this.systemUserAccessLossReason(false);
            if (rejection) {
                return this.refuse(rejection, 'save');
            }
        }
        return super.Save(options);
    }

    /**
     * Refuses a DELETE that would strip the MJ system user's last `Allow` on a field — the other
     * way, besides editing one to `No Access`, to remove access without writing a `Deny`.
     *
     * Reconciliation's own orphan deletes are unaffected: it only removes rows whose role has lost
     * entity-level read (so the system user is already denied one level up and the guard stands
     * down) or whose field became unrestrictable (forced open regardless).
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const rejection = await this.systemUserAccessLossReason(true);
        if (rejection) {
            return this.refuse(rejection, 'delete');
        }
        return super.Delete(options);
    }

    /**
     * Records a refusal on the result history so `LatestResult.CompleteMessage` explains it, and
     * returns false — the contract `Save()` and `Delete()` already have for a logical failure.
     */
    private refuse(message: string, type: 'save' | 'delete'): boolean {
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = type === 'delete' ? 'delete' : this.IsSaved ? 'update' : 'create';
        result.Message = message;
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        this.ResultHistory.push(result);
        return false;
    }

    /**
     * Why the pending change would leave the system user short of its entity-level access, or null.
     *
     * @param removing true when this row is being deleted rather than edited
     */
    private async systemUserAccessLossReason(removing: boolean): Promise<string | null> {
        // Cheap exit first: the aggregation only ever consults rules bound to a role the user
        // holds, so a change to any other role's rule cannot move the system user's access at all.
        // This is what keeps the query below off the path of ordinary permission administration —
        // it runs only for edits to the handful of roles the server's own account holds.
        if (!SystemUserHoldsRole(this.RoleID)) {
            return null;
        }
        const target = this.resolveTarget();
        if (!target) {
            return null;
        }

        const current = await this.loadCurrentRules(target.Field.ID);
        const others = current.filter(r => !UUIDsEqual(r.ID, this.ID));
        const projected: FieldPermissionRuleForRole[] = removing
            ? others
            : [
                  ...others,
                  {
                      RoleID: this.RoleID,
                      ReadAccess: this.ReadAccess,
                      UpdateAccess: this.UpdateAccess,
                      CreateAccess: this.CreateAccess,
                  },
              ];
        return SystemUserFieldAccessLossReason(target.Entity, target.Field, projected);
    }

    /**
     * Every rule currently stored against this field, straight from the database.
     *
     * `BypassCache` because this decides an access-control question: a cached result that predates
     * a sibling row's edit would answer it with data the guard is specifically trying to catch up
     * with. Inside a transaction this reads the scope's own uncommitted writes, which is what
     * reconciliation needs.
     */
    private async loadCurrentRules(entityFieldID: string): Promise<Array<FieldPermissionRuleForRole & { ID: string }>> {
        const rv = new RunView(this.RunViewProviderToUse);
        const result = await rv.RunView<FieldPermissionRuleForRole & { ID: string }>(
            {
                EntityName: 'MJ: Entity Field Permissions',
                ExtraFilter: `EntityFieldID = '${entityFieldID}'`,
                Fields: ['ID', 'RoleID', 'ReadAccess', 'UpdateAccess', 'CreateAccess'],
                ResultType: 'simple',
                BypassCache: true,
            },
            this.ContextCurrentUser
        );
        if (!result.Success) {
            // Cannot evaluate the guard — say so rather than silently permitting. The caller sees
            // an empty rule set, which never produces a refusal, so this is a fail-open that is at
            // least visible in the log; the startup sweep is the backstop.
            LogError(
                `[FieldSecurity] Could not load sibling rules for field ${entityFieldID}; ` +
                `the system-user access guard did not run: ${result.ErrorMessage}`
            );
            return [];
        }
        return result.Results ?? [];
    }

    /**
     * Why this rule may not target this role, or null when it may.
     *
     * Refuses a **restricting** rule aimed at a role the MJ **system user** holds. The system
     * user is what the server runs background work as: it pre-warms the shared engine caches at
     * startup, and in task mode (job and agent runners) whichever caller touches an engine first
     * configures it for the whole process. Restricting that account does not just restrict it —
     * engines cache their data process-wide, so a partially loaded engine would then serve
     * incomplete records to every user afterward. The damage is silent and nowhere near the rule
     * that caused it.
     *
     * **Only a `Deny` is refused.** Field security has no runtime exemption for any user, so the
     * system user's own access comes from ordinary rows: snapshot initialization writes it
     * `Allow` on every field its roles can read, and this guard is what stops that access being
     * taken away again. `Allow` and `No Access` both save — `Allow` is the grant the server
     * depends on, and `No Access` is neutral, unable to reduce access another role has granted.
     * Refusing those would make it impossible to enable field security on any entity at all,
     * since the standard roles (UI, Developer, Integration) carry entity permissions almost
     * everywhere.
     *
     * This is a guard on CONFIGURATION, not a runtime exemption. What is refused is the
     * arrangement that would make the server unable to do its own work. Take the role off the
     * system user and the rule saves.
     *
     * The database tier already refuses the equivalent arrangement: CodeGen skips a column DENY
     * for any role a service login belongs to, and warns. This is the same rule for the
     * application tier.
     *
     * @param roleID the role the rule targets
     * @param rule the rule's three verbs; omitted only by callers that are pre-checking a role
     *             rather than a specific rule, which are answered as though the rule denied
     */
    public static SystemUserRoleRejectionReason(roleID: string | null, rule?: FieldPermissionRuleVerbs): string | null {
        if (!roleID) {
            return null;
        }
        if (rule && !IsRestrictingFieldRule(rule)) {
            return null; // grants and neutrals are exactly what keep the system user working
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
            `Role '${roleName}' is held by the MJ system user, so it cannot carry a Deny on any field. ` +
            `The server runs background work as that account and shares one engine cache across all users — ` +
            `restricting it would let partially loaded records reach everyone. ` +
            `Remove the role from the system user first, or apply this rule to a different role.`
        );
    }

    /**
     * Why this rule's Update/Create verbs may not target this field, or null when they may.
     *
     * A **read-only** field cannot be written through the API by anyone: it is excluded from the
     * generated create input type and from the update SET list, and `BaseEntity` never marks it
     * dirty. So an Update or Create verb on it is inert in both directions — a `Deny` prevents
     * nothing that was possible, and an `Allow` grants nothing that was not. Left to save, it
     * reads on screen as a working permission and silently is not one.
     *
     * **Read is untouched, deliberately.** Restricting READ on a read-only field is legitimate
     * and is one of the main things administrators want: foreign-key display columns are
     * read-only, and "hide which client this contract belongs to" is exactly a read restriction
     * on one. Only the two write verbs are refused.
     *
     * Note `EntityFieldInfo.ReadOnly` is the right predicate here, not `IsVirtual`: IS-A parent
     * fields are virtual but ARE writable through the child's save chain, and `ReadOnly` is
     * defined off `AllowUpdateAPI` precisely to tell those apart from joined display columns.
     */
    public static WriteVerbRejectionReason(field: EntityFieldInfo, rule: FieldPermissionRuleVerbs): string | null {
        if (!field.ReadOnly) {
            return null;
        }
        const offending: string[] = [];
        if (rule.UpdateAccess !== FieldPermissionAccess.NoAccess) offending.push('Update');
        if (rule.CreateAccess !== FieldPermissionAccess.NoAccess) offending.push('Create');
        if (offending.length === 0) {
            return null;
        }
        return (
            `Field '${field.Entity}.${field.Name}' is read-only, so its ${offending.join(' and ')} ` +
            `${offending.length > 1 ? 'permissions have' : 'permission has'} no effect — the field cannot be written ` +
            `through the API by any user. Set ${offending.length > 1 ? 'them' : 'it'} to 'No Access'. ` +
            `Read permission on this field still applies normally.`
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
    /**
     * Why this role may not carry a field rule on this entity, or null when it may.
     *
     * A field permission REFINES an entity permission — the entity gate decides whether you reach
     * the record at all, and field rules then decide which columns of it you see. A rule bound to a
     * role that has no relationship to the entity is not a refinement of anything, and it is the
     * configuration that made the reconciler's orphan test ambiguous: such a row is fully live at
     * runtime (aggregation matches on role membership alone) while looking inert to any check that
     * asks what the role can do on its own.
     *
     * Requires only that an entity-permission row EXISTS, not that it grants read. A role whose
     * entity permission grants nothing is the ordinary way to express a deny-only carve-out —
     * "these users are normal, minus this column" — and demanding a grant would force an
     * administrator to hand out entity access in order to take a column away. Deleting the entity
     * permission removes the relationship, and reconciliation then cleans up the field rules with
     * it; see `computeOrphanRowIDs`, which tests exactly this condition.
     *
     * Attributed to `RoleID` because that is the value the administrator must change — either pick
     * a role that has entity access, or grant this one an entity permission first.
     */
    public static EntityPermissionRequiredRejectionReason(entity: EntityInfo, roleID: string | null): string | null {
        if (!roleID) {
            return null; // the NOT NULL column is the base class's problem to report, not ours
        }
        if (entity.Permissions.some((p) => UUIDsEqual(p.RoleID, roleID))) {
            return null;
        }
        return (
            `This role has no entity permission on '${entity.Name}', so a field rule for it would refine nothing. ` +
            `Field permissions narrow the access an entity permission already grants — give the role an entity ` +
            `permission on '${entity.Name}' first (one that grants nothing is fine, and is how a deny-only ` +
            `carve-out is expressed), then set the field rule.`
        );
    }

    private resolveTarget(): { Entity: EntityInfo; Field: EntityFieldInfo } | null {
        if (!this.EntityFieldID) {
            return null; // the NOT NULL column is the base class's problem to report, not ours
        }
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        for (const entity of md?.Entities ?? []) {
            const match = entity.Fields.find((f) => UUIDsEqual(f.ID, this.EntityFieldID));
            if (match) {
                return { Entity: entity, Field: match };
            }
        }
        return null;
    }
}
