/**
 * Field-level sync directives.
 *
 * A connector can now declare that a source field should not be synced at all
 * (`SourceFieldInfo.SyncDirective: 'Exclude'`). The directive is persisted into
 * `IntegrationObjectField.Configuration` (a JSON column that already exists, so no
 * migration is required) and honoured by the mapping stage, which strips excluded
 * keys from the record BEFORE field mapping runs.
 *
 * Why stripping must happen there and not by deactivating a field map: an unmapped
 * source key does not disappear — `computeUnmappedFields` captures it and the writer
 * parks it in `__mj_integration_CustomOverflow`. Deactivating the map therefore
 * REROUTES the value instead of excluding it, and the custom-column promoter will
 * happily resurrect it as a real column later. Stripping before mapping keeps the
 * key out of MappedFields, out of the overflow, and out of the content hash (whose
 * basis is MappedFields), so an excluded field stops influencing change detection
 * entirely.
 *
 * What this is for, concretely (measured on a live tenant, 2026-08-19):
 *   - `preferences` on Totara Users / Enrolled_Users: Moodle UI widget state
 *     (file-picker recents, user-selector toggles), identical nine keys on 100% of
 *     rows — ~2.5M expanded values of nothing.
 *   - `courseformatoptions` on Courses: course theming (header colours, tile icons).
 *   - `enrolledcourses` on Enrolled_Users: re-derives the Enrolled_Users table
 *     itself — ~7.6M expanded values that duplicate an object already synced.
 *
 * The directive lives in Configuration rather than a new column so that existing
 * installs pick it up on their next schema sync with no DDL. Absence of a directive
 * means Sync — connectors that never heard of this feature behave exactly as before.
 */

/** The Configuration key under which a field's sync directive is stored. */
export const SYNC_DIRECTIVE_CONFIG_KEY = 'syncDirective';

/** Recognised directive values. Anything unrecognised is treated as 'Sync'. */
export type FieldSyncDirective = 'Sync' | 'Exclude';

/** Minimal shape of an IntegrationObjectField row this module needs. */
export interface FieldWithConfiguration {
    Name: string;
    Configuration: string | null;
}

/**
 * Reads the sync directive out of an IntegrationObjectField.Configuration JSON blob.
 * Malformed JSON, a missing key, or an unrecognised value all mean 'Sync' — the
 * directive can only ever narrow what is synced, never break a sync by its absence.
 */
export function ReadFieldSyncDirective(configuration: string | null | undefined): FieldSyncDirective {
    if (!configuration) return 'Sync';
    try {
        const parsed: unknown = JSON.parse(configuration);
        if (parsed && typeof parsed === 'object') {
            const v = (parsed as Record<string, unknown>)[SYNC_DIRECTIVE_CONFIG_KEY];
            if (typeof v === 'string' && v.toLowerCase() === 'exclude') return 'Exclude';
        }
    } catch {
        // Malformed Configuration is not this feature's problem to surface.
    }
    return 'Sync';
}

/**
 * Merges a directive into an existing Configuration JSON string, preserving every
 * other key. Returns the new JSON, or the original string when nothing changes
 * (so callers can cheaply detect no-op writes). Setting 'Sync' REMOVES the key
 * rather than storing the default.
 */
export function WriteFieldSyncDirective(
    configuration: string | null | undefined,
    directive: FieldSyncDirective,
): string | null {
    let obj: Record<string, unknown> = {};
    if (configuration) {
        try {
            const parsed: unknown = JSON.parse(configuration);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                obj = parsed as Record<string, unknown>;
            }
        } catch {
            // Unparseable existing Configuration: preserve it untouched rather than
            // destroy whatever it held. The directive is not worth data loss.
            return configuration;
        }
    }
    if (directive === 'Exclude') {
        obj[SYNC_DIRECTIVE_CONFIG_KEY] = 'Exclude';
    } else {
        delete obj[SYNC_DIRECTIVE_CONFIG_KEY];
    }
    const out = Object.keys(obj).length > 0 ? JSON.stringify(obj) : null;
    return out;
}

/**
 * The set of source field names to strip for one integration object, derived from
 * its IntegrationObjectField rows. Empty set when nothing is excluded — the
 * mapping engine's fast path.
 */
export function ComputeExcludedSourceNames(fields: ReadonlyArray<FieldWithConfiguration>): Set<string> {
    const out = new Set<string>();
    for (const f of fields) {
        if (ReadFieldSyncDirective(f.Configuration) === 'Exclude') {
            out.add(f.Name);
        }
    }
    return out;
}

/**
 * Returns a copy of `fields` without the excluded keys, or the ORIGINAL object when
 * no key matches (so the no-exclusions path allocates nothing). Matching is exact:
 * source field names are the connector's own spelling, already used verbatim as
 * field-map SourceFieldName and overflow keys.
 */
export function StripExcludedFields(
    fields: Record<string, unknown>,
    excluded: ReadonlySet<string>,
): Record<string, unknown> {
    if (excluded.size === 0) return fields;
    let hit = false;
    for (const k of Object.keys(fields)) {
        if (excluded.has(k)) { hit = true; break; }
    }
    if (!hit) return fields;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
        if (!excluded.has(k)) out[k] = v;
    }
    return out;
}
