import type { TransformStep } from './transforms';

/**
 * How a field rule produces its base value (before any transform pipeline runs):
 *  - `static`  — a literal constant
 *  - `field`   — copy another field's current value
 *  - `formula` — a JS value expression over the record (`fields.X`), e.g. `fields.FirstName + ' ' + fields.LastName`
 *  - `lookup`  — resolve a value from another entity by matching a key (requires a LookupResolver)
 *  - `prompt`  — run an AI prompt over the record and use its output (requires a PromptResolver). By
 *    default the WHOLE record is passed as the prompt's data; supply `Data` to send a narrower / shaped
 *    context (e.g. a rendered entity-document of the record). Powerful but one model call PER record —
 *    use the dry-run preview + bounded concurrency, and prefer it for enrichment/summarization fields.
 */
export type FieldRuleValueSource =
    | { Kind: 'static'; Value: unknown }
    | { Kind: 'field'; Field: string }
    | { Kind: 'formula'; Expression: string }
    | { Kind: 'lookup'; Lookup: FieldRuleLookup }
    | { Kind: 'prompt'; Prompt: FieldRulePrompt }
    | { Kind: 'entityDocument'; EntityDocument?: FieldRuleEntityDocument };

/**
 * Renders the record as text via an MJ Entity Document template (the same templates used for
 * embeddings/RAG), using the existing rendering infrastructure through an injected
 * {@link EntityDocumentResolver}. Most useful inside a `prompt` source's `Data` — hand the LLM a rich,
 * curated rendering of the record instead of raw fields.
 */
export interface FieldRuleEntityDocument {
    /** Which Entity Document template to render. Omit to use the entity's default/primary document. */
    EntityDocumentID?: string;
}

/** An AI prompt source: run a prompt over the record and use its output as the field value. */
export interface FieldRulePrompt {
    /** The AI prompt to run (its ID). */
    PromptID: string;
    /**
     * Optional shaping of the data handed to the prompt. Omit to pass the whole record. Each entry's
     * value is computed like any other source (`field` / `formula` / `static`), so you can pass selected
     * fields, derived values, or a pre-rendered entity-document string under named keys.
     */
    Data?: Record<string, FieldRuleValueSource>;
}

/** An entity lookup: find a record where MatchField === (computed) MatchValue, return ReturnField. */
export interface FieldRuleLookup {
    /** Entity to look in (e.g. 'Accounts'). */
    Entity: string;
    /** Field on the lookup entity to match against. */
    MatchField: string;
    /** How to compute the value to match (static / field / formula). */
    MatchValue: FieldRuleValueSource;
    /** Field to return from the matched record. */
    ReturnField: string;
    /** Value to use when no record matches. */
    Default?: unknown;
}

/** A single rule: set TargetField from Source (optionally transformed), gated by an optional Condition. */
export interface FieldRule {
    /** The field on the record to set. */
    TargetField: string;
    /** How to produce the base value. */
    Source: FieldRuleValueSource;
    /** Optional transform pipeline applied to the computed value. */
    Transforms?: TransformStep[];
    /** Optional boolean expression over the record — the rule only applies when it evaluates true. */
    Condition?: string;
}

/** An ordered set of field rules applied to each record. */
export interface FieldRuleSet {
    Rules: FieldRule[];
}

/** The computed outcome of one rule for one record — the unit of a dry-run preview. */
export interface FieldChange {
    /** The target field. */
    Field: string;
    /** The record's current value. */
    OldValue: unknown;
    /** The computed new value (equals OldValue when not Applied). */
    NewValue: unknown;
    /** True when NewValue differs from OldValue. */
    Changed: boolean;
    /** True when the rule produced a value to write (condition passed, no skip/error). */
    Applied: boolean;
    /** Why the rule did not apply (condition false / transform skipped). */
    SkipReason?: string;
    /** Set when computing the value errored (condition or source/transform). */
    Error?: string;
}

/** A lookup with its MatchValue already resolved to a concrete value, handed to the LookupResolver. */
export interface ResolvedLookup {
    Entity: string;
    MatchField: string;
    MatchValue: unknown;
    ReturnField: string;
}

/**
 * Resolves an entity lookup to a value. Injected into the evaluator so the engine stays framework-pure
 * (the bulk-update processor supplies a RunView-backed resolver; unit tests supply a stub).
 * Should return the matched record's ReturnField value, or `undefined` when nothing matches.
 */
export type LookupResolver = (lookup: ResolvedLookup) => Promise<unknown>;

/** A prompt source with its data already resolved to concrete values, handed to the PromptResolver. */
export interface ResolvedPrompt {
    PromptID: string;
    /** The data context for the prompt run (the whole record by default, or the shaped `Data` map). */
    Data: Record<string, unknown>;
}

/**
 * Runs an AI prompt and returns its output value. Injected into the evaluator so the engine itself never
 * depends on the AI stack — the bulk-update processor supplies a real `AIPromptRunner`-backed resolver;
 * unit tests supply a stub. This is the same dependency-inversion seam as {@link LookupResolver}.
 */
export type PromptResolver = (prompt: ResolvedPrompt) => Promise<unknown>;

/** An entity-document source with its record handed to the {@link EntityDocumentResolver} to render. */
export interface ResolvedEntityDocument {
    EntityDocumentID?: string;
    /** The record's field values, to render through the Entity Document template. */
    Record: Record<string, unknown>;
}

/**
 * Renders a record to text via the existing Entity Document / Template infrastructure. Injected so the
 * engine never depends on `@memberjunction/templates` or the AI/vector stack — the bulk-update processor
 * supplies a resolver backed by the real render infra. Same dependency-inversion seam as the others.
 */
export type EntityDocumentResolver = (doc: ResolvedEntityDocument) => Promise<string>;
