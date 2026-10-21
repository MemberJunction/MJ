import { LogWarning } from '@memberjunction/core';

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
