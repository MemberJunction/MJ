import { FieldPermissionAccess, LogWarning } from '@memberjunction/core';
import type { EntityFieldInfo, EntityInfo } from '@memberjunction/core';

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
 *   taking Read away from that role).
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
        for (const field of entity.Fields ?? []) {
            if (IsIndexRestrictedField(field)) {
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
 * Whether one field of an entity that has field-level security enabled must stay out of shared
 * indexes, judged on its own entity's rules. See {@link GetIndexRestrictedFieldNames} for the rule,
 * including IS-A inheritance. The caller is responsible for checking the entity's
 * `EnableFieldLevelSecurity` flag first.
 */
export function IsIndexRestrictedField(field: EntityFieldInfo): boolean {
    if (field.IsUnrestrictableField || field.IsOnUnrestrictableEntity) {
        return false;
    }
    const rules = field.FieldPermissions ?? [];
    if (rules.length === 0) {
        return true;
    }
    const allow = FieldPermissionAccess.Allow.toLowerCase();
    return rules.some((rule) => (rule.ReadAccess ?? '').trim().toLowerCase() !== allow);
}

/**
 * A shallow copy of `row` without the keys named in `restricted` (lowercased names, compared
 * case-insensitively). Returns `row` itself when nothing is restricted, so the common case
 * allocates nothing.
 */
export function OmitRestrictedValues<T extends Record<string, unknown>>(row: T, restricted: ReadonlySet<string>): T {
    if (restricted.size === 0 || !row) {
        return row;
    }
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        if (!restricted.has(key.toLowerCase())) {
            copy[key] = value;
        }
    }
    return copy as T;
}

/** Warnings already issued, so a template that names a restricted field is reported once per process, not per record. */
const warnedTemplateFields = new Set<string>();

/**
 * Log, once per (template, entity, field), that a template explicitly references a field kept out
 * of shared indexes. The field renders empty: the value is withheld rather than the record
 * skipped, so the rest of the document still indexes.
 *
 * @param templateKey identifies the template (its ID or name) in the warning and the once-only key
 * @param templateText the template's source, scanned for the field names
 * @param entityName the entity whose fields are restricted
 * @param restricted lowercased restricted field names
 */
export function WarnOnTemplateRestrictedFieldReferences(
    templateKey: string,
    templateText: string | null | undefined,
    entityName: string,
    restricted: ReadonlySet<string>
): void {
    if (!templateText || restricted.size === 0) {
        return;
    }
    for (const fieldName of restricted) {
        const onceKey = `${templateKey}|${entityName}|${fieldName}`.toLowerCase();
        if (warnedTemplateFields.has(onceKey) || !templateReferencesField(templateText, fieldName)) {
            continue;
        }
        warnedTemplateFields.add(onceKey);
        LogWarning(
            `Entity document template "${templateKey}" references field "${fieldName}" of "${entityName}", which field-level ` +
            `security restricts for at least one role. It renders empty: restricted values are never written into ` +
            `embeddings, vector metadata or stored document text.`
        );
    }
}

/** Whether the template source names `fieldName` as a whole identifier (case-insensitive). */
function templateReferencesField(templateText: string, fieldName: string): boolean {
    const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^A-Za-z0-9_])${escaped}($|[^A-Za-z0-9_])`, 'i').test(templateText);
}

/** Clears the once-only warning memory. For tests. */
export function ResetTemplateRestrictedFieldWarnings(): void {
    warnedTemplateFields.clear();
}
