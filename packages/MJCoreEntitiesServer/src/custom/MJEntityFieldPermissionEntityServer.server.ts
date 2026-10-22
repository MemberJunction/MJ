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
    LogError,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType,
    ValidationResult,
} from '@memberjunction/core';
import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJEntityFieldPermissionEntity } from '@memberjunction/core-entities';
import { SystemUserFieldAccessLossReason, UserCache } from '@memberjunction/generic-database-provider';
import {
    FieldPermissionAccessIs,
    FieldPermissionAccessVerbs,
    IsRestrictingFieldRuleAnyCase,
    NormalizeFieldPermissionAccess,
} from './fieldPermissionAccess';
import {
    GuardedTransactionGroupRefusal,
    LoadStoredSystemUser,
    PendingGuardedGroupWrite,
    PendingGuardedGroupWriteFor,
    RecordGuardedTransactionGroupWrite,
    UserHoldsRole,
} from './systemUserGuardState';

/** Where a rule is bound: the (role, field) pair its row occupies. */
type RuleBinding = { RoleID: string | null; EntityFieldID: string | null };

/** A resolved target field together with the entity that owns it. */
type RuleTarget = { Entity: EntityInfo; Field: EntityFieldInfo };

const UNDETERMINED_PRIOR_BINDING_MESSAGE =
    'Could not determine which role and field this permission rule was bound to before the edit, so the ' +
    "change cannot be checked against the MJ system user's access on the target it is leaving. Refusing to " +
    'save rather than risk removing access the server depends on. Reload the record and try again.';

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
    /** This write's place in its transaction group, held from the group check until the write enrols. */
    private pendingGroupWrite: PendingGuardedGroupWrite | null = null;

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
     * Normalizes Access spellings, then refuses an EDIT that would strip the MJ system user's last
     * `Allow` on a field.
     *
     * **Normalization.** The Access columns' CHECK constraint is case-insensitive, so `'deny'` or
     * `'ALLOW'` would otherwise persist and read one way while enforcing another. Rewriting them to
     * the canonical value-list spelling keeps the stored data honest; the guards compare
     * case-insensitively regardless, so normalization is not the only line of defence.
     *
     * **The access-loss guard** is not in `Validate()` for two reasons. It needs the field's rules
     * as they stand in the DATABASE — loaded metadata lags recent writes, and reading a stale
     * sibling row as `Allow` is exactly how three individually-innocent `No Access` edits get
     * through one at a time. And loading them is asynchronous, which `Validate()` is not.
     *
     * Inserts are deliberately not checked: adding a rule can only add access, never remove an
     * existing `Allow`, so the `Deny` check in `Validate()` covers them completely. It has to —
     * snapshot initialization writes its rows one at a time, and an aggregate check would refuse
     * the half-built state.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        this.normalizeAccessSpellings();
        const rejection = await this.systemUserSaveRejection();
        if (rejection) {
            return this.refuse(rejection, 'save');
        }
        const pending = this.takePendingGroupWrite();
        const saved = await super.Save(options);
        if (saved) {
            RecordGuardedTransactionGroupWrite(pending);
        }
        return saved;
    }

    /** The write the group check passed, cleared so a later save cannot reuse it. */
    private takePendingGroupWrite(): PendingGuardedGroupWrite | null {
        const pending = this.pendingGroupWrite;
        this.pendingGroupWrite = null;
        return pending;
    }

    /**
     * The transaction-group rule for this write. When it passes, the write is held as pending and
     * counted only once it enrols, so a write refused later, by any check, does not count.
     */
    private groupRefusal(concernsSystemUser: boolean): string | null {
        const refusal = GuardedTransactionGroupRefusal(this.TransactionGroup, concernsSystemUser);
        if (!refusal) {
            this.pendingGroupWrite = PendingGuardedGroupWriteFor(this.TransactionGroup, concernsSystemUser);
        }
        return refusal;
    }

    /**
     * The system-user checks for a save, on the role set as stored in the database (the cached one
     * lags a role assigned a moment ago): a `Deny` on a role the system user holds; an edit that
     * strips its last `Allow`; and a transaction group holding this and another guarded write that
     * concerns it. An insert that restricts nothing needs none of these and reads nothing, which
     * keeps reconciliation's bulk inserts free. A read that fails refuses the save.
     */
    private async systemUserSaveRejection(): Promise<string | null> {
        this.pendingGroupWrite = null;
        const restricting = IsRestrictingFieldRuleAnyCase(this);
        if (!this.IsSaved && !restricting) {
            return null;
        }
        try {
            const systemUser = await LoadStoredSystemUser(this.RunViewProviderToUse);
            const prior = this.IsSaved ? this.priorBinding() : null;
            const concerns = UserHoldsRole(systemUser, this.RoleID) || (prior === null && this.IsSaved) || UserHoldsRole(systemUser, prior?.RoleID);
            const groupRefusal = this.groupRefusal(concerns);
            if (groupRefusal) {
                return groupRefusal;
            }
            if (restricting && UserHoldsRole(systemUser, this.RoleID)) {
                return MJEntityFieldPermissionEntityServer.SystemUserRoleRejectionReason(this.RoleID, this, systemUser);
            }
            return this.IsSaved ? await this.systemUserEditLossReason(systemUser) : null;
        } catch (e) {
            return MJEntityFieldPermissionEntityServer.unverifiableMessage(e);
        }
    }

    /** The refusal when the system user's field access cannot be checked because a read failed. */
    private static unverifiableMessage(error: unknown): string {
        const detail = error instanceof Error ? error.message : String(error);
        return `Could not check this field rule against the MJ system user's field access, so it was not saved. ${detail}`;
    }

    /**
     * Refuses a DELETE that would strip the MJ system user's last `Allow` on a field — the other
     * way, besides editing one to `No Access`, to remove access without writing a `Deny`.
     *
     * Judged against the row's STORED binding: a delete removes the row by ID, so an unsaved
     * re-point on this object does not change which target loses it.
     *
     * Reconciliation's orphan deletes usually clear this guard — a row whose field became
     * unrestrictable is forced open regardless — but not always: an orphaned row can be the system
     * user's last `Allow` on a field while another of its roles still reads the entity. The
     * reconciler logs and skips such a refusal rather than aborting.
     */
    public override async Delete(options?: EntityDeleteOptions): Promise<boolean> {
        const rejection = await this.systemUserDeleteRejection();
        if (rejection) {
            return this.refuse(rejection, 'delete');
        }
        const pending = this.takePendingGroupWrite();
        const deleted = await super.Delete(options);
        if (deleted) {
            RecordGuardedTransactionGroupWrite(pending);
        }
        return deleted;
    }

    /** The system-user checks for a delete, on the role set as stored in the database. */
    private async systemUserDeleteRejection(): Promise<string | null> {
        this.pendingGroupWrite = null;
        try {
            const systemUser = await LoadStoredSystemUser(this.RunViewProviderToUse);
            const prior = this.priorBinding();
            const concerns = prior === null || UserHoldsRole(systemUser, prior.RoleID);
            const groupRefusal = this.groupRefusal(concerns);
            return groupRefusal ?? (await this.systemUserDeleteLossReason(systemUser));
        } catch (e) {
            return MJEntityFieldPermissionEntityServer.unverifiableMessage(e);
        }
    }

    /** Rewrites each Access value to its canonical spelling; unrecognized values are left for validation to report. */
    private normalizeAccessSpellings(): void {
        for (const verb of FieldPermissionAccessVerbs) {
            const canonical = NormalizeFieldPermissionAccess(this[verb]);
            if (canonical && canonical !== this[verb]) {
                this[verb] = canonical;
            }
        }
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
     * Why the pending EDIT would leave the system user short of its entity-level access, or null.
     *
     * An edit that changes `RoleID` or `EntityFieldID` MOVES the rule: it is a delete from the
     * target it leaves as well as an insert into the one it joins. Judging only the destination
     * let a sequence of saves strip the system user's last `Allow` without writing a `Deny` —
     * re-point that row at a role the system user does not hold, and the cheap exit on the NEW
     * role waved it through. So both targets are evaluated:
     *
     * - **the destination field**, with this row's new values projected in, whenever the system
     *   user holds the new role — or, when the field is unchanged, the old one (the row's old
     *   binding drops out of that same field's aggregate);
     * - **the vacated field**, with this row removed, whenever the field itself changed and the
     *   system user holds the old role.
     *
     * The cheap exits are what keep the queries off ordinary permission administration: the
     * aggregation only consults rules bound to roles the user holds, so a change touching no such
     * role cannot move the system user's access at all.
     */
    private async systemUserEditLossReason(systemUser: UserInfo | null): Promise<string | null> {
        const prior = this.priorBinding();
        if (!prior) {
            return UNDETERMINED_PRIOR_BINDING_MESSAGE;
        }
        const holds = (roleID: string | null) => UserHoldsRole(systemUser, roleID);
        const fieldMoved = !UUIDsEqual(prior.EntityFieldID, this.EntityFieldID);
        const touchesDestination = holds(this.RoleID) || (!fieldMoved && holds(prior.RoleID));
        if (touchesDestination) {
            const rejection = await this.projectedLossReason(this.EntityFieldID, true, systemUser);
            if (rejection) {
                return rejection;
            }
        }
        if (fieldMoved && holds(prior.RoleID)) {
            return this.projectedLossReason(prior.EntityFieldID, false, systemUser);
        }
        return null;
    }

    /** Why deleting this row would leave the system user short of its entity-level access, or null. */
    private async systemUserDeleteLossReason(systemUser: UserInfo | null): Promise<string | null> {
        const prior = this.priorBinding();
        if (!prior) {
            return UNDETERMINED_PRIOR_BINDING_MESSAGE;
        }
        if (!UserHoldsRole(systemUser, prior.RoleID)) {
            return null;
        }
        return this.projectedLossReason(prior.EntityFieldID, false, systemUser);
    }

    /**
     * Projects one field's stored rules with this row's change applied and asks whether the
     * system user keeps its access there.
     *
     * @param entityFieldID the field whose aggregate to evaluate
     * @param includeThisRow true to project this row in with its CURRENT values (it is on this
     *                       field after the change); false to project it out (it is leaving)
     * @param systemUser the system user with its role set as stored
     */
    private async projectedLossReason(entityFieldID: string | null, includeThisRow: boolean, systemUser: UserInfo | null): Promise<string | null> {
        const target = this.resolveTargetByFieldID(entityFieldID);
        if (!target) {
            return null;
        }
        const current = await this.loadCurrentRules(target.Field.ID);
        const others: FieldPermissionRuleForRole[] = current.filter((r) => !UUIDsEqual(r.ID, this.ID));
        const projected = includeThisRow
            ? [
                  ...others,
                  { RoleID: this.RoleID, ReadAccess: this.ReadAccess, UpdateAccess: this.UpdateAccess, CreateAccess: this.CreateAccess },
              ]
            : others;
        return SystemUserFieldAccessLossReason(target.Entity, target.Field, projected, systemUser);
    }

    /**
     * The (role, field) pair this row occupies in the database — the dirty fields' old values,
     * otherwise their current ones. Null when a re-pointed field's prior value cannot be
     * established, which callers treat as a refusal: an unknown vacated target cannot be shown safe.
     */
    private priorBinding(): RuleBinding | null {
        const roleID = this.priorValue('RoleID', this.RoleID);
        const entityFieldID = this.priorValue('EntityFieldID', this.EntityFieldID);
        if (roleID === undefined || entityFieldID === undefined) {
            return null;
        }
        return { RoleID: roleID, EntityFieldID: entityFieldID };
    }

    /** A column's stored value; undefined when it is dirty and its old value is not a usable ID. */
    private priorValue(fieldName: 'RoleID' | 'EntityFieldID', current: string | null): string | null | undefined {
        const field = this.GetFieldByName(fieldName);
        if (!field?.Dirty) {
            return current;
        }
        const old = field.OldValue;
        return typeof old === 'string' && old.length > 0 ? old : undefined;
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
     * @param storedSystemUser the system user with its role set as stored in the database;
     *             defaults to the user cache's system user
     */
    public static SystemUserRoleRejectionReason(roleID: string | null, rule?: FieldPermissionRuleVerbs, storedSystemUser?: UserInfo | null): string | null {
        if (!roleID) {
            return null;
        }
        if (rule && !IsRestrictingFieldRuleAnyCase(rule)) {
            return null; // grants and neutrals are exactly what keep the system user working
        }
        // UserCache is populated on the server; a client-side save (or a cold cache) simply
        // skips the check rather than blocking an administrator on missing state. `Save()` passes
        // the system user with its role set as stored, which the cache may not show yet.
        const systemUser = storedSystemUser ?? UserCache.Instance?.GetSystemUser?.();
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
        // Compared case-insensitively: the column's collation stores 'no access' as the same value.
        const offending: string[] = [];
        if (!FieldPermissionAccessIs(rule.UpdateAccess, FieldPermissionAccess.NoAccess)) offending.push('Update');
        if (!FieldPermissionAccessIs(rule.CreateAccess, FieldPermissionAccess.NoAccess)) offending.push('Create');
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

    /**
     * Resolves `EntityFieldID` to its {@link EntityFieldInfo} from loaded metadata.
     *
     * Returns null when metadata cannot resolve it — for instance immediately after a schema
     * change, before the metadata cache has refreshed. That case passes validation rather than
     * blocking the administrator: the foreign key already guarantees the row points at a real
     * field, and the runtime aggregation guards hold regardless of what is stored here. Failing
     * closed would trade a real, recurring workflow block for no additional protection.
     */
    private resolveTarget(): RuleTarget | null {
        return this.resolveTargetByFieldID(this.EntityFieldID);
    }

    /** The field a given `EntityFieldID` names, so the re-point guard can resolve a row's OLD field too. */
    private resolveTargetByFieldID(entityFieldID: string | null): RuleTarget | null {
        if (!entityFieldID) {
            return null; // the NOT NULL column is the base class's problem to report, not ours
        }
        const md = this.ProviderToUse as unknown as IMetadataProvider;
        for (const entity of md?.Entities ?? []) {
            const match = entity.Fields.find((f) => UUIDsEqual(f.ID, entityFieldID));
            if (match) {
                return { Entity: entity, Field: match };
            }
        }
        return null;
    }
}
