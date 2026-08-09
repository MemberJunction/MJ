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
 */
export function ComputeFieldPermissionDelta(
    entity: EntityInfo,
    options: FieldPermissionDeltaOptions = {}
): FieldPermissionDelta {
    const excluded = new Set((options.ExcludedRoleIDs ?? []).map(normalizeID).filter(Boolean));
    const accessByRoleID = buildRoleEntityAccessMap(entity, excluded);
    const restrictableFields = entity.Fields.filter(isRestrictable);

    return {
        ToInsert: computeMissingRows(restrictableFields, accessByRoleID),
        ToDelete: computeOrphanRowIDs(entity, accessByRoleID),
    };
}

/** Caller-supplied narrowing for {@link ComputeFieldPermissionDelta}. */
export type FieldPermissionDeltaOptions = {
    /**
     * Roles that must never receive permission rows — in practice, the roles the MJ system user
     * holds.
     *
     * Two independent reasons, and the first is fatal without this:
     *
     * 1. `MJEntityFieldPermissionEntityServer` REFUSES to save a row aimed at a system-user role.
     *    Since the standard roles (UI, Developer, Integration) hold entity permissions on
     *    essentially everything and the system user holds those roles, a snapshot that included
     *    them would fail on the very first row — making it impossible to enable field security on
     *    any entity at all.
     * 2. Even if it saved, the row would do nothing. The system user is exempt in the
     *    aggregation, so rows for its roles are clutter — exactly the reasoning that excludes
     *    unrestrictable fields.
     *
     * Passed in rather than resolved here so this module stays pure and testable; the reconciler
     * reads the roles off the user cache.
     */
    ExcludedRoleIDs?: string[];
};

/**
 * A field is restrictable when field security could meaningfully apply to it. Primary keys and
 * `__mj_` system columns are not, and neither is any field on the security-configuration or
 * identity entities.
 */
function isRestrictable(field: EntityFieldInfo): boolean {
    return !field.IsUnrestrictableField && !field.IsOnUnrestrictableEntity;
}

/**
 * Each role's effective entity-level access, aggregating its own Allow/Deny rows the same way
 * `EntityInfo.GetUserPermisions` does one level up: a Deny beats an Allow for the same action.
 *
 * Roles resolving to no read access are omitted entirely, so callers can treat presence in the
 * map as "this role should have rows."
 */
function buildRoleEntityAccessMap(
    entity: EntityInfo,
    excludedRoleIDs: ReadonlySet<string>
): Map<string, RoleEntityAccessForFieldVerbs> {
    const allow = new Map<string, RoleEntityAccessForFieldVerbs>();
    const deny = new Map<string, RoleEntityAccessForFieldVerbs>();

    for (const permission of entity.Permissions) {
        const roleID = normalizeID(permission.RoleID);
        if (!roleID || excludedRoleIDs.has(roleID)) {
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
            missing.push({
                EntityFieldID: field.ID,
                RoleID: roleID,
                // Read is Allow by construction — buildRoleEntityAccessMap omits roles without
                // it — which is what keeps these rows on the right side of the Read-required
                // CHECK constraint no matter what Update and Create resolve to.
                ReadAccess: FieldPermissionAccess.Allow,
                UpdateAccess: access.CanUpdate ? FieldPermissionAccess.Allow : FieldPermissionAccess.NoAccess,
                CreateAccess: access.CanCreate ? FieldPermissionAccess.Allow : FieldPermissionAccess.NoAccess,
            });
        }
    }
    return missing;
}

/**
 * Rows that should no longer exist. Three ways a row becomes an orphan:
 *
 *  - its field is no longer restrictable (a column was made a primary key, or the entity joined
 *    the unrestrictable list);
 *  - its role lost entity-level read, so the entity gate excludes it and the row can no longer
 *    affect any decision;
 *  - its role no longer exists at all, which reads the same way here.
 *
 * A row whose FIELD was dropped disappears with the field's cascade, so it never reaches this
 * walk — `entity.Fields` is the live set.
 */
function computeOrphanRowIDs(entity: EntityInfo, accessByRoleID: Map<string, RoleEntityAccessForFieldVerbs>): string[] {
    const orphans: string[] = [];
    for (const field of entity.Fields) {
        const fieldIsRestrictable = isRestrictable(field);
        for (const permission of field.FieldPermissions) {
            const roleID = normalizeID(permission.RoleID);
            if (!fieldIsRestrictable || !roleID || !accessByRoleID.has(roleID)) {
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
