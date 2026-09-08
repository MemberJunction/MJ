/**
 * @fileoverview Resolution of API scope-rule `ResourcePattern` values to a single entity target.
 *
 * Lives here, in the one package every consumer already depends on, because the rule has to be
 * IDENTICAL in two places that cannot import each other: CodeGenLib's mint/drift materialization
 * gates (`ManageMetadataBase.loadAPIKeyRowFilterTargets`) and the runtime refresher's Leak-1 gate
 * (`MaterializationRefresher.loadAPIKeyRowFilterTargets`). Those gates decide whether an entity is
 * row-restricted; a copy that drifts open in one of them silently re-opens the leak the other one
 * closes, and nothing in the build would notice.
 *
 * @module @memberjunction/global/ResourcePatternUtils
 */

/**
 * Characters that make a `ResourcePattern` impossible to resolve to exactly one entity.
 *
 * A deliberate SUPERSET of what `IsExactResourceName` (MJCoreEntitiesServer's save-time validator)
 * rejects — `*`, `?`, `,` — with `%` added as extra fail-closed cover for the SQL wildcard, which the
 * save-time validator does not police. Each character matters independently:
 *  - `*` / `%` — a glob or SQL wildcard spans an unknown number of entities;
 *  - `?`       — omitting it fails OPEN: `Sk?p` would be kept as a literal target name, match no
 *                entity, and leave the entity it was meant to fence reading as unrestricted;
 *  - `,`       — a list names more than one resource.
 */
const UNRESOLVABLE_RESOURCE_PATTERN_CHARS = /[*%,?]/;

/**
 * Resolves an API scope rule's `ResourcePattern` to the single entity name it targets, normalized for
 * lookup (trimmed and lowercased), or `null` when it cannot be resolved to exactly one entity.
 *
 * `null` is the FAIL-CLOSED answer, and callers must treat it as "this rule may name any entity"
 * rather than "this rule names nothing" — a pattern we cannot map may well name the very entity the
 * caller is about to mirror into an unscoped snapshot. Refusing to materialize is recoverable and
 * loud; mirroring restricted rows is neither.
 *
 * Normalization matches the way scope rules are authored and resolved: `IsExactResourceName` gates
 * the pattern at save time and `Metadata.EntityByName` resolves it, both case-insensitively.
 *
 * @param pattern the rule's raw `ResourcePattern` (null/undefined/blank all resolve to `null`).
 * @returns the trimmed, lowercased entity name, or `null` when the pattern is not a single exact name.
 *
 * @example
 * ResolveSingleEntityResourceTarget('  Salaries ')   // 'salaries'
 * ResolveSingleEntityResourceTarget('MJ: AI Agents') // 'mj: ai agents'
 * ResolveSingleEntityResourceTarget('Sk?p')          // null  (would otherwise fence nothing)
 * ResolveSingleEntityResourceTarget('A,B')           // null
 */
export function ResolveSingleEntityResourceTarget(pattern: string | null | undefined): string | null {
    if (pattern == null) {
        return null;
    }
    const trimmed = pattern.trim();
    if (trimmed.length === 0 || UNRESOLVABLE_RESOURCE_PATTERN_CHARS.test(trimmed)) {
        return null;
    }
    return trimmed.toLowerCase();
}
