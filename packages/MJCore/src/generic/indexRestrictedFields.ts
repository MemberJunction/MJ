import { EntityFieldInfo, EntityInfo, FieldPermissionAccess } from './entityInfo';

/**
 * Field-level security for derived indexes: which fields of an entity must never be written into
 * an embedding, vector metadata, stored document text or any other artifact that is built once
 * and then served to many readers.
 *
 * Reads are projected per user, but an index is built once — usually by a privileged account —
 * and shared. An embedding cannot be projected after the fact, so the only way to keep a
 * restricted value out of it is to never render that value into the indexed text. The rule is
 * deliberately coarser than any single user's view: a field is excluded when **any** role is
 * kept from reading it, so the index holds only what every reader of the entity may see.
 *
 * A field counts as restricted on an entity with `EnableFieldLevelSecurity` set when:
 * - it has no permission rows at all (field security fails closed on such a field for everyone), or
 * - any of its rows does not grant Read — a `Deny`, or a `No Access` row (snapshot
 *   initialization only ever writes `Allow` for Read, so a `No Access` row is an administrator
 *   taking Read away from that role), or
 * - a role that can read the entity has no `Allow` Read row for the field. Runtime enforcement
 *   grants nothing to a role without a row, so a holder of only that role cannot read the field.
 *
 * "A role that can read the entity" means a role with an entity-level `Allow` permission row
 * granting Read and no entity-level `Deny` row on Read. Roles outside that set are left out on
 * purpose: they cannot read any record of the entity, so they never see the field either way,
 * and counting them would exclude every field the moment any unrelated role exists.
 *
 * Primary keys, `__mj_` system columns and fields on the unrestrictable security/identity
 * entities are never restricted, matching runtime enforcement.
 *
 * Names are returned lowercased so callers match case-insensitively.
 */
export function GetIndexRestrictedFieldNames(entity: EntityInfo | null | undefined): Set<string> {
    const restricted = new Set<string>();
    if (!entity?.FieldLevelSecurityApplies) {
        return restricted;
    }
    if (entity.EnableFieldLevelSecurity) {
        const readerRoleIds = getEntityReaderRoleIds(entity);
        for (const field of entity.Fields ?? []) {
            if (IsIndexRestrictedField(field, readerRoleIds)) {
                restricted.add(field.Name.trim().toLowerCase());
            }
        }
    }
    addFieldsRestrictedOnParent(entity, restricted);
    return restricted;
}

/**
 * An IS-A child mirrors each parent field as a field of its own, read from the same row, so a
 * field restricted on any ancestor stays restricted on the child. Only the child's mirrors of
 * parent fields are added: a field the child defines itself answers to the child's own rules.
 */
function addFieldsRestrictedOnParent(entity: EntityInfo, restricted: Set<string>): void {
    const parent = entity.ParentID ? entity.ParentEntityInfo : null;
    if (!parent?.FieldLevelSecurityApplies) {
        return;
    }
    const parentRestricted = GetIndexRestrictedFieldNames(parent);
    for (const field of entity.Fields ?? []) {
        const mirrored = parent.FieldByName(field.Name);
        if (mirrored && parentRestricted.has(mirrored.Name.trim().toLowerCase())) {
            restricted.add(field.Name.trim().toLowerCase());
        }
    }
}

/**
 * The lowercased IDs of the roles that can read records of `entity`: an entity-level `Allow`
 * row granting Read, and no entity-level `Deny` row on Read for the same role.
 */
function getEntityReaderRoleIds(entity: EntityInfo): Set<string> {
    const granted = new Set<string>();
    const denied = new Set<string>();
    for (const permission of entity.Permissions ?? []) {
        if (!permission.RoleID || !permission.CanRead) {
            continue;
        }
        (permission.IsDeny ? denied : granted).add(permission.RoleID.trim().toLowerCase());
    }
    for (const roleId of denied) {
        granted.delete(roleId);
    }
    return granted;
}

/**
 * Whether one field of an entity that has field-level security enabled must stay out of shared
 * indexes, judged on its own entity's rules. See {@link GetIndexRestrictedFieldNames} for the rule,
 * including IS-A inheritance. The caller is responsible for checking the entity's
 * `EnableFieldLevelSecurity` flag first.
 *
 * @param field the field to judge
 * @param readerRoleIds lowercased IDs of the roles that can read the entity; each must hold an
 *   `Allow` Read row for the field or the field is restricted. Omitted, only the field's own rows
 *   are judged.
 */
export function IsIndexRestrictedField(field: EntityFieldInfo, readerRoleIds?: ReadonlySet<string>): boolean {
    if (field.IsUnrestrictableField || field.IsOnUnrestrictableEntity) {
        return false;
    }
    const rules = field.FieldPermissions ?? [];
    if (rules.length === 0) {
        return true;
    }
    const allow = FieldPermissionAccess.Allow.toLowerCase();
    if (rules.some((rule) => (rule.ReadAccess ?? '').trim().toLowerCase() !== allow)) {
        return true;
    }
    return readerRoleLacksRule(rules.map((rule) => rule.RoleID), readerRoleIds);
}

/** Whether some reader role has no rule row among `ruleRoleIds`. */
function readerRoleLacksRule(ruleRoleIds: ReadonlyArray<string | null | undefined>, readerRoleIds?: ReadonlySet<string>): boolean {
    if (!readerRoleIds || readerRoleIds.size === 0) {
        return false;
    }
    const covered = new Set(ruleRoleIds.filter((id): id is string => !!id).map((id) => id.trim().toLowerCase()));
    for (const roleId of readerRoleIds) {
        if (!covered.has(roleId)) {
            return true;
        }
    }
    return false;
}
