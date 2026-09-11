import { EntityFieldInfo, EntityInfo, EntityPermissionInfo, FieldPermissionAccess } from '@memberjunction/core';

/**
 * A permission row that should exist but does not, at its snapshot defaults.
 */
export type FieldPermissionSnapshotRow = {
    EntityFieldID: string;
    RoleID: string;
    ReadAccess: FieldPermissionAccess;
    UpdateAccess: FieldPermissionAccess;
    CreateAccess: FieldPermissionAccess;
};

/**
 * What reconciliation must write to bring an entity's field-permission rows back in line with
 * its fields and its entity-level permissions.
 *
 * There is no `ToUpdate`. An existing row is never touched, because an administrator's
 * tightening has to survive every reconciliation — including disable → schema change →
 * re-enable. That single rule is what makes "keep the rows, functionally inactive" on disable
 * and "graceful reconciliation" on re-enable the same code path.
 */
export type FieldPermissionDelta = {
    /** (field, role) pairs that should have a row and do not. */
    ToInsert: FieldPermissionSnapshotRow[];
    /** IDs of rows that should no longer exist. */
    ToDelete: string[];
};

/**
 * A role's effective entity-level access, after Allow/Deny aggregation of its own rows —
 * narrowed to the three verbs field security actually has.
 *
 * **Entity permissions are CRUD; field permissions are CRU.** `CanDelete` is read off the
 * entity permission and then deliberately dropped here, because deletion is row-scoped: you
 * delete a record, not a column, so there is nothing for a field-level Delete to mean. A role
 * holding delete on the entity deletes whole rows regardless of which columns it may read.
 *
 * {@link EntityFieldUserPermissionInfo} makes the same narrowing one level down, and the two
 * need to agree — this type is what the snapshot defaults are derived FROM, and that type is
 * what the aggregation resolves TO.
 */
type RoleEntityAccessForFieldVerbs = {
    CanRead: boolean;
    CanUpdate: boolean;
    CanCreate: boolean;
};

/**
 * Computes the field-permission rows an entity is missing and the ones it should no longer
 * have. Pure — no I/O, no entity objects, no provider. Everything comes off `EntityInfo`.
 *
 * **Snapshot defaults mirror entity-level permissions**, so enabling field security on an
 * entity changes no behavior until an administrator tightens a specific field. A role that can
 * read the entity gets `ReadAccess = 'Allow'`; its Update and Create follow the entity-level
 * grants, defaulting to `No Access`.
 *
 * **A role without entity-level read gets no rows at all.** The entity-level gate already
 * excludes it, so rows would be noise — and a row granting Update without Read would violate
 * the Read-required CHECK constraint anyway.
 *
 * **Unrestrictable fields (primary keys, `__mj_` columns) get no rows.** They are forced open
 * in the aggregation regardless, so rows for them are clutter that would also trip the
 * save-time guard.
 *
 * **No role is excluded — including the ones the MJ system user holds.** Those rows are what
 * keeps the system user working now that the aggregation has no bypass for it: it holds the
 * standard roles (UI, Developer, Integration), which carry entity read on essentially
 * everything, so the snapshot grants them `Allow` here and the save-time guards refuse any
 * later `Deny` aimed at them. Access the server relies on is therefore visible in the data
 * rather than implied by an exemption in code.
 */
export function ComputeFieldPermissionDelta(entity: EntityInfo): FieldPermissionDelta {
    const accessByRoleID = buildRoleEntityAccessMap(entity);
    const rolesWithEntityPermission = buildRolesWithAnyEntityPermission(entity);
    const restrictableFields = entity.Fields.filter(isRestrictable);

    // The two halves ask DIFFERENT questions of the same permission rows, and must not share an
    // answer. Creating a snapshot row is a grant, so it is offered only to roles that can actually
    // READ the entity (`accessByRoleID`). Deleting a row destroys an administrator's configuration,
    // so it is justified only when the row can no longer influence any decision — which turns on
    // whether the role relates to the entity at all, never on the strength of that relationship.
    return {
        ToInsert: computeMissingRows(restrictableFields, accessByRoleID),
        ToDelete: computeOrphanRowIDs(entity, rolesWithEntityPermission),
    };
}

/**
 * A field is restrictable when field security could meaningfully apply to it. Primary keys and
 * `__mj_` system columns are not, and neither is any field on the security-configuration or
 * identity entities.
 */
function isRestrictable(field: EntityFieldInfo): boolean {
    return !field.IsUnrestrictableField && !field.IsOnUnrestrictableEntity;
}

/**
 * Every role holding ANY entity-permission row for this entity, whatever it grants and whichever
 * `Type` it carries.
 *
 * This is the orphan test's criterion, and it is deliberately weaker than
 * {@link buildRoleEntityAccessMap}. A field rule bound to a role is live at runtime purely on ROLE
 * MEMBERSHIP — `EntityFieldInfo.AggregateFieldRulesForUser` matches on
 * `user.UserRoles.find(...)` and never consults that role's entity-level access. So a role that
 * grants nothing at entity level still contributes its field rules to the aggregate of any user who
 * holds it AND gets entity access from a different role. Judging such a row inert because its own
 * role cannot read the entity confuses a per-role fact with a per-user one, and deleting it on that
 * basis destroys a `Deny` that was fully in force — turning "a Deny always wins" into
 * "a Deny wins until reconciliation runs".
 *
 * Membership of this set is what `MJEntityFieldPermissionEntityServer.Validate()` requires before a
 * field rule may be written at all, so the rule reconciliation enforces on cleanup is the same one
 * authoring enforces on write.
 */
function buildRolesWithAnyEntityPermission(entity: EntityInfo): Set<string> {
    const roleIDs = new Set<string>();
    for (const permission of entity.Permissions) {
        const roleID = normalizeID(permission.RoleID);
        if (roleID) {
            roleIDs.add(roleID);
        }
    }
    return roleIDs;
}

/**
 * Each role's effective entity-level access, aggregating its own Allow/Deny rows the same way
 * `EntityInfo.GetUserPermisions` does one level up: a Deny beats an Allow for the same action.
 *
 * Roles resolving to no read access are omitted entirely, so callers can treat presence in the
 * map as "this role should have rows."
 */
function buildRoleEntityAccessMap(entity: EntityInfo): Map<string, RoleEntityAccessForFieldVerbs> {
    const allow = new Map<string, RoleEntityAccessForFieldVerbs>();
    const deny = new Map<string, RoleEntityAccessForFieldVerbs>();

    for (const permission of entity.Permissions) {
        const roleID = normalizeID(permission.RoleID);
        if (!roleID) {
            continue;
        }
        const bucket = isDenyPermission(permission) ? deny : allow;
        foldPermissionInto(bucket, roleID, permission);
    }

    const effective = new Map<string, RoleEntityAccessForFieldVerbs>();
    for (const [roleID, granted] of allow) {
        const blocked = deny.get(roleID) ?? { CanRead: false, CanUpdate: false, CanCreate: false };
        const access: RoleEntityAccessForFieldVerbs = {
            CanRead: granted.CanRead && !blocked.CanRead,
            CanUpdate: granted.CanUpdate && !blocked.CanUpdate,
            CanCreate: granted.CanCreate && !blocked.CanCreate,
        };
        if (access.CanRead) {
            effective.set(roleID, access);
        }
    }
    return effective;
}

function isDenyPermission(permission: EntityPermissionInfo): boolean {
    return (permission.Type ?? 'Allow').trim().toLowerCase() === 'deny';
}

function foldPermissionInto(bucket: Map<string, RoleEntityAccessForFieldVerbs>, roleID: string, permission: EntityPermissionInfo): void {
    const current = bucket.get(roleID) ?? { CanRead: false, CanUpdate: false, CanCreate: false };
    current.CanRead = current.CanRead || !!permission.CanRead;
    current.CanUpdate = current.CanUpdate || !!permission.CanUpdate;
    current.CanCreate = current.CanCreate || !!permission.CanCreate;
    bucket.set(roleID, current);
}

/**
 * Every (restrictable field × qualifying role) pair that has no row yet, at snapshot defaults.
 */
function computeMissingRows(
    fields: EntityFieldInfo[],
    accessByRoleID: Map<string, RoleEntityAccessForFieldVerbs>
): FieldPermissionSnapshotRow[] {
    const missing: FieldPermissionSnapshotRow[] = [];
    for (const field of fields) {
        const existingRoleIDs = new Set(field.FieldPermissions.map(fp => normalizeID(fp.RoleID)).filter(Boolean));
        for (const [roleID, access] of accessByRoleID) {
            if (existingRoleIDs.has(roleID)) {
                continue;
            }
            // A read-only field cannot be written through the API by anyone — it is excluded from
            // the generated create input and from the update SET list — so an Update or Create
            // verb on it can never decide anything. Writing `Allow` there would author a rule
            // that reads as a granted permission and is in fact inert, on ~1,000 fields x every
            // qualifying role. Read stays meaningful and is untouched: restricting a foreign-key
            // display column ("who does this record belong to") is a legitimate and common use.
            const writable = !field.ReadOnly;
            missing.push({
                EntityFieldID: field.ID,
                RoleID: roleID,
                // Read is Allow by construction — buildRoleEntityAccessMap omits roles without
                // it — which is what keeps these rows on the right side of the Read-required
                // CHECK constraint no matter what Update and Create resolve to.
                ReadAccess: FieldPermissionAccess.Allow,
                UpdateAccess: writable && access.CanUpdate ? FieldPermissionAccess.Allow : FieldPermissionAccess.NoAccess,
                CreateAccess: writable && access.CanCreate ? FieldPermissionAccess.Allow : FieldPermissionAccess.NoAccess,
            });
        }
    }
    return missing;
}

/**
 * Rows that should no longer exist. Two ways a row becomes an orphan:
 *
 *  - its field is no longer restrictable (a column was made a primary key, or the entity joined
 *    the unrestrictable list), so the aggregation returns fully-open for it regardless of any rule;
 *  - its role holds no entity-permission row for this entity at all, so no user can carry the rule
 *    into an aggregate through this entity — which also covers a role that no longer exists.
 *
 * A row whose FIELD was dropped disappears with the field's cascade, so it never reaches this
 * walk — `entity.Fields` is the live set.
 *
 * **A role's entity-level ACCESS is deliberately not part of this test**, and an earlier version of
 * this function that used it was wrong. It reasoned that a role without entity read is excluded by
 * the entity gate, so its field rules cannot matter. But `EntityInfo.GetUserPermisions` aggregates
 * the entity gate across ALL of a user's roles, exactly as the field aggregation does — so a user
 * reading the entity through role S still carries role R's field rules, whatever R grants on its
 * own. Deleting them silently restored access an administrator had explicitly denied, and
 * `computeMissingRows` only ever writes `Allow`, so it never came back.
 */
function computeOrphanRowIDs(entity: EntityInfo, rolesWithEntityPermission: Set<string>): string[] {
    const orphans: string[] = [];
    for (const field of entity.Fields) {
        const fieldIsRestrictable = isRestrictable(field);
        for (const permission of field.FieldPermissions) {
            const roleID = normalizeID(permission.RoleID);
            if (!fieldIsRestrictable || !roleID || !rolesWithEntityPermission.has(roleID)) {
                orphans.push(permission.ID);
            }
        }
    }
    return orphans;
}

/**
 * Lowercased ID for map keys. UUIDs arrive with different casing depending on their source, so
 * normalize once here rather than scanning with a comparator on every lookup.
 */
function normalizeID(id: string | null | undefined): string {
    return (id ?? '').trim().toLowerCase();
}

/**
 * True when the delta would change nothing, so callers can skip opening a transaction at all.
 * Reconciliation runs on ordinary saves, and the overwhelmingly common answer is "nothing to do".
 */
export function IsEmptyFieldPermissionDelta(delta: FieldPermissionDelta): boolean {
    return delta.ToInsert.length === 0 && delta.ToDelete.length === 0;
}
