/**
 * @fileoverview Guard for a scope's rendered filter values.
 *
 * A scope's `MetadataFilter` is where tenant and permission push-down lives for every
 * external-index lane. The providers previously applied it behind a bare type guard:
 *
 * ```typescript
 * if (idx.MetadataFilter && typeof idx.MetadataFilter === 'string') { body.filter = idx.MetadataFilter; }
 * ```
 *
 * That conflates two very different situations. If no filter was authored, running
 * unfiltered is correct. But if a filter **was** authored and merely arrived in an
 * unusable shape — a template that failed to render, a JSON filter that didn't parse,
 * an object where the lane needs a string — the guard fell through and the lane ran
 * **completely unfiltered**, silently dropping the tenant predicate. Breaking the
 * filter was therefore the cheapest way to defeat it.
 *
 * This module makes the distinction explicit so a lane can fail closed:
 *
 *   - `absent`   — nothing authored; run unfiltered (unchanged behaviour)
 *   - `usable`   — apply it
 *   - `unusable` — a filter was authored but cannot be applied; the caller MUST skip
 *                  the lane rather than query without it
 *
 * @module @memberjunction/search-engine
 */

/**
 * Outcome of checking a scope's rendered filter value for a particular lane.
 *
 * `unusable` is the case that matters: it means an author intended a restriction that
 * the lane cannot express, so proceeding would silently widen the search.
 */
export type ScopeFilterCheck<T> =
    | { Status: 'absent' }
    | { Status: 'usable'; Value: T }
    | { Status: 'unusable'; Reason: string };

/** True when a value carries no authored filter at all (null/undefined/blank string). */
function isAbsent(raw: unknown): boolean {
    if (raw === null || raw === undefined) return true;
    return typeof raw === 'string' && raw.trim().length === 0;
}

/**
 * Check a filter for a lane that needs a **string** (Azure AI Search OData `$filter`,
 * Typesense `filter_by`).
 *
 * An object here means the scope's template rendered JSON for a lane that cannot consume
 * it — authored intent that cannot be applied, hence `unusable` rather than ignored.
 */
export function CheckScopeStringFilter(raw: unknown): ScopeFilterCheck<string> {
    if (isAbsent(raw)) return { Status: 'absent' };
    if (typeof raw === 'string') return { Status: 'usable', Value: raw };
    return {
        Status: 'unusable',
        Reason: `expected a string filter for this lane but got ${typeof raw}; the scope's MetadataFilter likely rendered JSON for a lane that requires a string`,
    };
}

/**
 * Check a filter for a lane that needs a structured **object** (Elasticsearch /
 * OpenSearch filter DSL).
 *
 * A leftover string means the rendered template never parsed as JSON — usually a render
 * failure or malformed JSON in the scope definition.
 */
export function CheckScopeObjectFilter(raw: unknown): ScopeFilterCheck<object> {
    if (isAbsent(raw)) return { Status: 'absent' };
    if (typeof raw === 'object') return { Status: 'usable', Value: raw as object };
    if (typeof raw === 'string') {
        return {
            Status: 'unusable',
            Reason: `expected a structured filter object but got a string; the scope's MetadataFilter did not render to valid JSON: ${raw.trim().substring(0, 120)}`,
        };
    }
    return { Status: 'unusable', Reason: `expected a structured filter object but got ${typeof raw}` };
}

/**
 * Check a **rendered** scope template against its source, for fields that RESTRICT
 * (`ExtraFilter`, `MetadataFilter`, `ExternalIndexConfig`).
 *
 * This catches the two ways a restriction can evaporate during rendering, neither of which
 * the value alone can reveal — by the time a provider sees the constraint, the source
 * template has been discarded, so "authored but rendered to nothing" is indistinguishable
 * from "never authored":
 *
 *  1. **Rendered empty.** `RenderScopeTemplate` runs Nunjucks with `throwOnUndefined: false`,
 *     so a mistyped dimension (`SecondaryScopes.EffectiveChanneID`) makes a `{% if %}` guard
 *     false and the entire restricting clause silently disappears — the lane then runs
 *     unrestricted. (We deliberately do NOT flip `throwOnUndefined`: legitimate templates
 *     output optional dimensions, and flipping it would break them all.)
 *  2. **Template leaked through.** On a render error `RenderScopeTemplate` returns the RAW
 *     template, so `{% if %}`/`{{ }}` syntax reaches a filter as literal text.
 *
 * @param source   the un-rendered template from the scope row
 * @param rendered the output of RenderScopeTemplate / RenderScopeJsonTemplate
 */
export function CheckRenderedTemplate(source: string | null | undefined, rendered: unknown): ScopeFilterCheck<unknown> {
    if (isAbsent(source)) return { Status: 'absent' };

    const renderedIsEmpty = rendered === null || rendered === undefined
        || (typeof rendered === 'string' && rendered.trim().length === 0);
    if (renderedIsEmpty) {
        return {
            Status: 'unusable',
            Reason: `a restricting template was authored but rendered to nothing, so the restriction would vanish — usually an undefined dimension in a {% if %} guard (Nunjucks runs with throwOnUndefined:false). Template: ${String(source).substring(0, 160)}`,
        };
    }
    if (typeof rendered === 'string' && (rendered.includes('{{') || rendered.includes('{%'))) {
        return {
            Status: 'unusable',
            Reason: `the template did not render — raw template syntax survived into the value, which means RenderScopeTemplate hit an error and returned the source verbatim: ${rendered.substring(0, 160)}`,
        };
    }
    return { Status: 'usable', Value: rendered };
}

/**
 * Parse a `RequiredMetadataKeys` declaration into a list of key names.
 *
 * Accepts a JSON array (`["OrganizationID","ContentSourceID"]`) or a comma-separated
 * string, because both shapes turn up in hand-authored metadata. Returns an empty array
 * when nothing is declared.
 *
 * @throws {Error} when a value IS declared but cannot be parsed. A malformed contract must
 *   not silently degrade to "no contract" — that would turn a typo into an unguarded lane,
 *   which is the exact failure this feature exists to prevent.
 */
export function ParseRequiredMetadataKeys(raw: string | null | undefined): string[] {
    if (isAbsent(raw)) return [];
    const trimmed = String(raw).trim();
    if (trimmed.startsWith('{')) {
        // A JSON object is a shape the author clearly meant as structured data. Falling through
        // to the comma-split branch would turn the entire literal into one nonsense "key name"
        // that no filter can ever satisfy, permanently skipping the lane with a reason nobody
        // can act on. Reject it as the malformed declaration it is.
        throw new Error(
            `RequiredMetadataKeys must be a JSON array or a comma-separated list of key names, but got a JSON object: ${trimmed.substring(0, 120)}`
        );
    }

    let keys: string[];
    if (trimmed.startsWith('[')) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            throw new Error(`RequiredMetadataKeys is not valid JSON: ${trimmed.substring(0, 120)}`);
        }
        if (!Array.isArray(parsed)) throw new Error(`RequiredMetadataKeys must be a JSON array, got ${typeof parsed}`);
        keys = parsed.map((k) => String(k).trim());
        if (keys.some((k) => k.length === 0)) throw new Error('RequiredMetadataKeys contains a blank key name');
    } else {
        keys = trimmed.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
    }

    // Metadata keys are identifiers. Anything else is a typo — an unbalanced bracket, a stray
    // quote — and a typo'd key silently disables the lane forever, since no rendered filter can
    // contain it. Naming the bad token is far more useful than a lane that never runs.
    const malformed = keys.filter((k) => !VALID_METADATA_KEY_RE.test(k));
    if (malformed.length) {
        throw new Error(
            `RequiredMetadataKeys contains value(s) that are not valid metadata key names: ${malformed.map((k) => JSON.stringify(k)).join(', ')}`
        );
    }
    return keys;
}

/** Metadata key names are identifiers; dots and dashes are allowed for nested/hyphenated labels. */
const VALID_METADATA_KEY_RE = /^[A-Za-z_][A-Za-z0-9_.\-]*$/;

/**
 * Check that a **rendered** metadata filter actually constrains on every key its scope
 * declared in `RequiredMetadataKeys`.
 *
 * This catches the failure mode {@link CheckRenderedTemplate} structurally cannot: a filter
 * that rendered **partially**. A realistic scope filter is several optional clauses —
 *
 * ```
 * {"OrganizationID": "{{ ctx.PrimaryScopeRecordID }}"
 *  {% if ctx.SecondaryScopes.EffectiveChannelID %}, "ContentSourceID": {...}{% endif %}}
 * ```
 *
 * — and if the channel dimension is absent (a mistyped dimension name, a caller that omitted
 * it, a value the dimension resolver discarded as spoofed) the org clause still renders. The
 * filter is non-empty, contains no leftover template syntax, and passes every other guard,
 * yet the lane now searches the entire tenant instead of the one channel. The restriction
 * did not fail; it evaporated, and nothing downstream can tell the difference.
 *
 * Declaring the keys makes the author's intent checkable. The check is deliberately a
 * **presence** test rather than a semantic one: proving that a filter genuinely restricts on
 * a key would mean interpreting five different provider filter dialects. Presence is cheap,
 * dialect-agnostic, and catches the whole vanished-clause class, which is what actually
 * happens in practice.
 *
 * @param rendered the rendered filter — a JSON string, or an already-parsed object
 * @param requiredKeys key names from `ParseRequiredMetadataKeys`
 */
export function CheckRequiredMetadataKeys(rendered: unknown, requiredKeys: string[]): ScopeFilterCheck<unknown> {
    if (requiredKeys.length === 0) return { Status: 'usable', Value: rendered };
    if (isAbsent(rendered)) {
        return {
            Status: 'unusable',
            Reason: `this lane declares RequiredMetadataKeys [${requiredKeys.join(', ')}] but no filter was rendered at all, so none of them constrain the search`,
        };
    }

    const present = collectFilterKeys(rendered);
    const missing = requiredKeys.filter((k) => !present.has(k.toLowerCase()));
    if (missing.length === 0) return { Status: 'usable', Value: rendered };

    return {
        Status: 'unusable',
        Reason: `the rendered filter does not constrain on required metadata key${missing.length > 1 ? 's' : ''} [${missing.join(', ')}] — the clause was almost certainly dropped because a dimension it depends on was absent or discarded, which would widen this lane. Rendered: ${renderedPreview(rendered)}`,
    };
}

/**
 * Collect every key name a rendered filter mentions, lowercased.
 *
 * For an object (or a JSON string that parses to one) this walks the structure and gathers
 * property names at every depth, so a key nested inside a provider's boolean wrapper
 * (`{"$and":[{"OrganizationID":…}]}`) still counts. For a non-JSON string — Azure OData,
 * Typesense `filter_by` — it falls back to identifier tokens, since those dialects express
 * a constraint as `Key eq 'value'` rather than as structure.
 */
function collectFilterKeys(rendered: unknown): Set<string> {
    const keys = new Set<string>();

    const walk = (node: unknown): void => {
        if (Array.isArray(node)) {
            for (const item of node) walk(item);
            return;
        }
        if (node !== null && typeof node === 'object') {
            for (const [key, value] of Object.entries(node)) {
                keys.add(key.toLowerCase());
                walk(value);
            }
        }
    };

    if (typeof rendered === 'string') {
        const trimmed = rendered.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                walk(JSON.parse(trimmed));
                return keys;
            } catch {
                // Not JSON after all — fall through to token scanning.
            }
        }
        // Strip quoted literals BEFORE tokenizing. Without this, a filter that merely mentions
        // the key name as a VALUE — `Title eq 'ContentSourceID'` — satisfies a contract it does
        // not actually constrain on, which is a fail-open. The structured path never had this
        // problem because a JSON walk distinguishes keys from values by position; a flat string
        // has to earn that distinction by removing the places values live.
        const withoutLiterals = trimmed.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""');
        for (const token of withoutLiterals.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) keys.add(token.toLowerCase());
        return keys;
    }

    walk(rendered);
    return keys;
}

/** Short, safe preview of a rendered filter for an error message. */
function renderedPreview(rendered: unknown): string {
    const text = typeof rendered === 'string' ? rendered : JSON.stringify(rendered);
    return (text ?? '').substring(0, 160);
}

/**
 * Check a filter for a lane that needs **JSON** and will accept either an already-parsed
 * object or a JSON string it can parse itself (vector metadata filters).
 *
 * A string that fails to parse is `unusable`. This is the specific path that previously
 * dropped the whole filter — including the tenant clause — and queried the entire index.
 */
export function CheckScopeJsonFilter(raw: unknown): ScopeFilterCheck<object> {
    if (isAbsent(raw)) return { Status: 'absent' };
    if (typeof raw === 'object') return { Status: 'usable', Value: raw as object };
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        try {
            const parsed: unknown = JSON.parse(trimmed);
            if (parsed !== null && typeof parsed === 'object') return { Status: 'usable', Value: parsed as object };
            return {
                Status: 'unusable',
                Reason: `MetadataFilter parsed to a ${typeof parsed} rather than an object: ${trimmed.substring(0, 120)}`,
            };
        } catch {
            return {
                Status: 'unusable',
                Reason: `MetadataFilter is not valid JSON: ${trimmed.substring(0, 120)}`,
            };
        }
    }
    return { Status: 'unusable', Reason: `MetadataFilter has unsupported type ${typeof raw}` };
}
