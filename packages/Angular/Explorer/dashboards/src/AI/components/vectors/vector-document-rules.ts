/**
 * Rules the Vectors tab applies when it turns a model suggestion into real metadata.
 *
 * Three separate refusals live here, and they share a theme with `sensitive-fields.ts`: the
 * suggestion comes from a language model and the template stays hand-editable afterwards, so
 * anything that matters has to be a property of the code rather than of the prompt.
 *
 *   1. The Entity Document Type is resolved from the use case the user actually picked,
 *      instead of always writing a duplicate-detection document.
 *   2. The number of interpolated fields is bounded, because an unbounded list is how a
 *      template balloons and how columns nobody chose end up embedded.
 *   3. MemberJunction's own internal entities are not offered as vectorization targets.
 *
 * Kept out of the component so each rule can be tested as a function rather than through a
 * TestBed, matching how `sensitive-fields.ts` is structured.
 */

import { templatePlaceholderNames } from './sensitive-fields';

// ─── 1. Entity Document Type per use case ────────────────────────────────────

/**
 * The Entity Document Type each use case writes.
 *
 * The dialog offers three use cases, and until now every one of them produced a
 * `Record Duplicate` document — the type name was hardcoded in the save path, so choosing
 * "search" silently discarded the choice and wrote the wrong type. A vector pool is typed:
 * `Provider.SearchEntity` and the Search Entity action read `Search`-typed documents, so a
 * search request stored as `Record Duplicate` is not merely mislabelled, it is not found by
 * the thing that wanted it.
 *
 * The two names here are MJ's own, not invented: both are seeded Entity Document Types, and
 * the Vectorize Entity action's `EntityDocumentType` parameter is documented as defaulting
 * to `Record Duplicate` and accepting `Search`.
 *
 * `classification` maps to `Classification`, which MJ does **not** currently seed. That is
 * deliberate: the use case is offered by the UI, so it resolves to the type it means, and an
 * install without that type gets a refusal that names it. Silently substituting a type that
 * does exist is the exact defect this map removes.
 */
export const ENTITY_DOCUMENT_TYPE_BY_USE_CASE: Readonly<Record<string, string>> = {
    'duplicate detection': 'Record Duplicate',
    'search': 'Search',
    'classification': 'Classification',
};

/**
 * The Entity Document Type name for a use case, or null when the use case is unrecognised.
 *
 * Returns null rather than falling back to a default: a use case this code does not know
 * about must not quietly become a duplicate-detection document.
 */
export function entityDocumentTypeForUseCase(useCase: string | null | undefined): string | null {
    if (!useCase) {
        return null;
    }
    return ENTITY_DOCUMENT_TYPE_BY_USE_CASE[useCase.trim().toLowerCase()] ?? null;
}

// ─── 2. How many fields a template may interpolate ───────────────────────────

/**
 * The most distinct fields one generated template may interpolate.
 *
 * Derived from the suggestion prompt's own contract rather than copied from elsewhere.
 * `metadata/prompts/templates/system/entity-document-suggestion.template.md` requires
 * "**Output must be 1-4 natural language sentences**" and explains at length why a
 * key-value dump embeds badly compared with English prose.
 *
 * So: 4 sentences — the prompt's own ceiling — times 6 interpolations per sentence, past
 * which a sentence stops being the natural English the prompt demands and becomes the dump
 * it explicitly forbids. That gives 24.
 *
 * Cross-check against the prompt's three worked examples, which interpolate 8, 6 and 4
 * distinct placeholders: 24 is three times the richest thing the prompt itself demonstrates,
 * so the cap cannot fire on anything the prompt teaches a model to produce. It fires when a
 * model has ignored the sentence contract and reached for the whole table.
 */
export const MAX_TEMPLATE_FIELDS = 24;

/** Distinct `{{Placeholder}}` field names a template interpolates. */
export function templateFieldNames(templateText: string | null | undefined): string[] {
    return [...new Set(templatePlaceholderNames(templateText))];
}

/**
 * Truncates a model-supplied field list to the cap.
 *
 * Truncation rather than refusal, because this list is the model's own description of what
 * it selected and is shown as chips — dropping the tail and saying so is more useful than
 * discarding the whole suggestion. The authoritative refusal is on the template, below,
 * since the template is what actually gets embedded.
 */
export function capSelectedFields(
    fields: ReadonlyArray<string> | null | undefined,
): { fields: string[]; dropped: number } {
    if (!fields || fields.length === 0) {
        return { fields: [], dropped: 0 };
    }
    const unique = [...new Set(fields)];
    if (unique.length <= MAX_TEMPLATE_FIELDS) {
        return { fields: unique, dropped: 0 };
    }
    return {
        fields: unique.slice(0, MAX_TEMPLATE_FIELDS),
        dropped: unique.length - MAX_TEMPLATE_FIELDS,
    };
}

/**
 * The refusal message when a template interpolates more fields than the cap allows, or null
 * when it is within the cap.
 *
 * A template cannot be truncated without mangling its prose, so this one refuses rather than
 * trimming — and the message carries both numbers, because "too many fields" without the
 * count is not actionable. The template is editable in the dialog, so the user can act on it
 * without losing the suggestion.
 */
export function templateFieldCapRefusal(templateText: string | null | undefined): string | null {
    const names = templateFieldNames(templateText);
    if (names.length <= MAX_TEMPLATE_FIELDS) {
        return null;
    }
    return (
        `This template interpolates ${names.length} fields, and at most ${MAX_TEMPLATE_FIELDS} ` +
        `may be embedded. A template this wide stops reading like the natural language that ` +
        `embeds well, and pulls in columns nobody chose. Remove ` +
        `${names.length - MAX_TEMPLATE_FIELDS} field(s) from the template and save again.`
    );
}

// ─── 3. Which entities may be offered as vectorization targets ───────────────

/**
 * Schemas whose entities are not offered in the picker.
 *
 * Follows the existing frontend precedent — `FRONTEND_BLOCKED_SCHEMAS` in
 * `DatabaseDesigner/services/database-designer.engine.ts` and in
 * `DatabaseDesigner/components/create-wizard/steps/step-relationships.component.ts`, both
 * `new Set(['__mj'])` — rather than inventing a rule.
 */
export const VECTOR_BLOCKED_SCHEMAS: ReadonlySet<string> = new Set(['__mj']);

/**
 * True when an entity may be offered as a vectorization target.
 *
 * The picker previously listed every entity in metadata, so MemberJunction's own ~378
 * internal entities — prompt runs, audit logs, record changes, credentials — were offered
 * alongside the user's business tables, both as noise and as embedding targets.
 *
 * Two rules, and they currently pick out the same set: every `MJ:`-prefixed entity is in the
 * `__mj` schema and vice versa (378 and 378, exactly coextensive, in the 5.46 baseline). The
 * name-prefix rule is therefore defence in depth against an MJ entity registered into some
 * other schema, not extra coverage today. Said plainly so nobody later reads it as load
 * bearing and is surprised.
 *
 * Note MJ does seed two `Search`-typed documents over `__mj` entities (`AI Agents Search`,
 * `AI Prompts Search`), so framework entities are not unvectorizable in principle. Those
 * arrive through metadata sync, which is a different authoring channel with a different
 * audience; this dialog is where a business user configures vectorization of their own data,
 * and burying their tables under the framework's is the defect being fixed.
 */
export function isVectorizableEntity(
    entity: { Name: string; SchemaName?: string | null },
): boolean {
    if (entity.SchemaName && VECTOR_BLOCKED_SCHEMAS.has(entity.SchemaName)) {
        return false;
    }
    return !entity.Name.startsWith('MJ:');
}
