/**
 * Pure heuristics for the CodeGen "Smart Field Identification" pipeline.
 *
 * The LLM behind the prompt template at
 * `metadata/prompts/templates/codegen/smart-field-identification.template.md`
 * is liberal with `AllowUserSearchAPI`, `IncludeInUserSearchAPI`, and the
 * `Contains` predicate. These helpers are the code-level safety net that
 * applies regardless of what the model returns. They live in their own
 * module so they can be unit-tested without spinning up the database layer.
 *
 * Conventions:
 *   - All functions are pure and side-effect free.
 *   - `*FieldName` predicates do simple regex matches on the field name; they
 *     intentionally don't try to read field type or extended-type metadata.
 *   - "Identifier-shaped" means a unique business identifier the user types
 *     in full (Email, SKU, OrderNumber). "Name-like" means a human-readable
 *     prefix users type into a search box (Name, Title, FirstName).
 */

export type SearchPredicate = 'BeginsWith' | 'Contains' | 'EndsWith' | 'Exact';

/**
 * Cap on searchable fields per entity. The plan calls out 0–2 as typical and
 * >3 as exceptional. This cap kicks in after eligibility filtering — fields
 * blocked by other guardrails don't count against the cap.
 */
export const MAX_SEARCHABLE_FIELDS_PER_ENTITY = 5;

/**
 * Match narrative field names that should never participate in plain
 * (non-FTS) `LIKE` search. These force unindexed `LIKE '%term%'` scans
 * even when MaxLength is small, and the data is rarely the right global-
 * search target anyway. If a narrative field genuinely needs to be
 * searchable, it belongs in `fullTextSearchFields[]` on an FTS-enabled
 * entity, not in `searchableFields`.
 *
 * Matches:
 *   - Exact names: Comments, Note(s), Description, Bio, Body, Memo,
 *     Summary, Content, Remark(s), Details
 *   - Suffix variants: ReleaseNotes, EndpointDescription, BodyText
 *
 * The suffix half is the noisier matcher — false positives on names
 * like `ReleaseNotes` or `RequestBody` are intentional (those are also
 * narrative content), but if a real-world entity gets caught
 * unfairly, an operator can set `AutoUpdateIncludeInUserSearchAPI=0`
 * on that field to opt out of LLM-driven flips.
 */
export function isNarrativeFieldName(fieldName: string): boolean {
    if (!fieldName) return false;
    const exact = /^(Comments?|Notes?|Description|Bio|Body|Memo|Summary|Content|Remarks?|Details)$/i;
    if (exact.test(fieldName)) return true;
    const suffix = /(Comment|Note|Description|Bio|Body|Memo|Summary|Content|Remark)s?$/i;
    return suffix.test(fieldName);
}

/**
 * Identifier-shaped field names — values users type in full, where `Exact`
 * is the right predicate by default.
 */
export function isIdentifierFieldName(fieldName: string): boolean {
    if (!fieldName) return false;
    return /^(Email|SKU|SSN|ISBN|ZipCode|PostalCode|Phone(Number)?|.+(Number|Code|ID))$/i.test(fieldName)
        && !/^ID$/i.test(fieldName); // bare "ID" is the PK, not an identifier
}

/**
 * Name-like field names — human-readable prefixes where `BeginsWith` is the
 * right predicate by default.
 */
export function isNameLikeFieldName(fieldName: string): boolean {
    if (!fieldName) return false;
    return /^(Name|Title|FirstName|LastName|MiddleName|DisplayName|FullName|Label)$/i.test(fieldName);
}

/**
 * Match entity names that are detail / line-item / step / param / mapping
 * children of a parent record. These are reached through their parent — they
 * are never global-search targets even when they have text columns.
 *
 * Whole-word boundaries on the trailing token are intentional — we don't
 * want to false-positive on entities like `Stepford Cities` (silly example,
 * but the principle holds).
 */
export function isDetailOrLineItemEntity(entityName: string | undefined): boolean {
    if (!entityName) return false;
    const n = entityName.trim();
    return /(\b|\s)(Details?|Lines?|Items?|Steps?|Params?|Mappings?)$/i.test(n);
}

/**
 * Default predicate for a searchable field when the LLM didn't supply one
 * (or supplied an inappropriate `Contains` we had to reject).
 */
export function defaultPredicateFor(fieldName: string): SearchPredicate {
    if (isIdentifierFieldName(fieldName)) return 'Exact';
    if (isNameLikeFieldName(fieldName)) return 'BeginsWith';
    return 'BeginsWith';
}

/**
 * Normalize a single LLM-proposed predicate against the field context.
 *
 * Rules:
 *   - `Contains` is reserved for fields included in `fullTextSearchFields[]`
 *     on an FTS-enabled entity. Anywhere else, we rewrite `Contains` to
 *     the field's default predicate.
 *   - `Exact` and `EndsWith` pass through unchanged.
 *   - `BeginsWith` passes through unchanged.
 *   - If the LLM didn't propose a predicate at all (or proposed one we
 *     rejected), fall back to `defaultPredicateFor()`.
 */
export function normalizePredicate(opts: {
    fieldName: string;
    proposed?: SearchPredicate;
    isInFullTextSearchFields: boolean;
    entityFullTextSearchEnabled: boolean;
}): { predicate: SearchPredicate; rewritten: boolean } {
    const { fieldName, proposed, isInFullTextSearchFields, entityFullTextSearchEnabled } = opts;
    if (proposed === 'Contains') {
        const ftsEligible = isInFullTextSearchFields && entityFullTextSearchEnabled;
        if (ftsEligible) {
            return { predicate: 'Contains', rewritten: false };
        }
        return { predicate: defaultPredicateFor(fieldName), rewritten: true };
    }
    if (proposed === 'Exact' || proposed === 'EndsWith' || proposed === 'BeginsWith') {
        return { predicate: proposed, rewritten: false };
    }
    return { predicate: defaultPredicateFor(fieldName), rewritten: false };
}

/**
 * Per-entity cap. Given an already-eligible list of field names (PK / type /
 * narrative guardrails have already run), trim to the configured cap,
 * preferring name-like and identifier-shaped fields over ambiguous matches.
 */
export function applySearchableFieldsCap(eligibleFieldNames: string[]): {
    accepted: string[];
    dropped: string[];
} {
    if (eligibleFieldNames.length <= MAX_SEARCHABLE_FIELDS_PER_ENTITY) {
        return { accepted: [...eligibleFieldNames], dropped: [] };
    }
    // Stable-sort by preference rank (name-like first, then identifier, then
    // anything else), preserving original order within each rank.
    const ranked = eligibleFieldNames.map((name, idx) => ({
        name,
        idx,
        rank: isNameLikeFieldName(name) ? 0 : isIdentifierFieldName(name) ? 1 : 2,
    }));
    ranked.sort((a, b) => a.rank - b.rank || a.idx - b.idx);
    const accepted = ranked.slice(0, MAX_SEARCHABLE_FIELDS_PER_ENTITY).map(r => r.name);
    const acceptedSet = new Set(accepted);
    const dropped = eligibleFieldNames.filter(n => !acceptedSet.has(n));
    return { accepted, dropped };
}

/**
 * First-pass cleanup of the raw LLM result, applied immediately after the
 * model returns. Catches contradictory shapes the LLM occasionally emits.
 *
 * - If `allowUserSearch === false`, force `searchableFields` and
 *   `searchPredicates` to empty (the entity is opted out — any field-level
 *   flags would be no-ops at best, misleading at worst).
 * - If `searchableFields` is empty, force `allowUserSearch` to `false`.
 * - Deduplicate `searchableFields` while preserving order.
 *
 * Returns a NEW object (does not mutate the input).
 */
export function normalizeSmartFieldResultShape<T extends {
    searchableFields?: string[];
    searchPredicates?: Array<{ field: string; predicate: SearchPredicate }>;
    allowUserSearch?: boolean;
}>(result: T): T {
    const out: T = { ...result };
    const fields = Array.isArray(out.searchableFields) ? out.searchableFields : [];
    // Dedupe while preserving order.
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const name of fields) {
        if (typeof name === 'string' && name.length > 0 && !seen.has(name)) {
            seen.add(name);
            deduped.push(name);
        }
    }
    out.searchableFields = deduped;

    if (out.allowUserSearch === false) {
        out.searchableFields = [];
        out.searchPredicates = [];
    } else if (deduped.length === 0) {
        out.allowUserSearch = false;
        out.searchPredicates = [];
    }
    return out;
}

/**
 * Heuristic: does the entity name match an audit / log / run-history /
 * change-tracking shape? Mirrors the existing `isLikelyLogOrAuditEntity`
 * heuristic on `ManageMetadataBase` so callers outside the class (e.g.
 * tests) can ask the same question without having to subclass.
 */
export function isLikelyLogOrAuditEntityName(name: string | undefined): boolean {
    if (!name) return false;
    const n = name.trim();
    if (/\bLogs?$/i.test(n)) return true;
    if (/\bAudit\b/i.test(n)) return true;
    if (/\bRecord Changes?$/i.test(n)) return true;
    if (/\bRuns?$/i.test(n) && !/Test Runs?$/i.test(n)) return true;
    if (/\bRun (History|Steps|Messages)$/i.test(n)) return true;
    if (/\bExecution Logs?$/i.test(n)) return true;
    return false;
}

/**
 * Decide whether an LLM-proposed entity-level enable (0 → 1 flip on
 * `AllowUserSearchAPI`) should be allowed through. Returns a reason string
 * when blocked, `null` when accepted.
 *
 * The plan's gating conditions:
 *   - `confidence === 'high'`
 *   - `acceptedSearchableFields.length >= 1` (post-guardrail)
 *   - entity is NOT log/audit-shaped
 *   - entity is NOT detail/line-item-shaped
 */
export function entityLevelEnableBlockedReason(opts: {
    entityName: string | undefined;
    confidence: 'high' | 'medium' | 'low' | undefined;
    acceptedSearchableFieldsCount: number;
}): string | null {
    if (opts.confidence !== 'high') {
        return `confidence is '${opts.confidence ?? 'unknown'}' (need 'high')`;
    }
    if (opts.acceptedSearchableFieldsCount < 1) {
        return 'no searchable fields survived guardrails';
    }
    if (isLikelyLogOrAuditEntityName(opts.entityName)) {
        return 'entity name matches log/audit/run-history shape';
    }
    if (isDetailOrLineItemEntity(opts.entityName)) {
        return 'entity name matches detail/line-item/step/param/mapping shape';
    }
    return null;
}
