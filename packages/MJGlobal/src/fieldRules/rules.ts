import type { TransformStep } from './transforms';

/**
 * How a field rule produces its base value (before any transform pipeline runs):
 *  - `static`  — a literal constant
 *  - `field`   — copy another field's current value
 *  - `formula` — a JS value expression over the record (`fields.X`), e.g. `fields.FirstName + ' ' + fields.LastName`
 *  - `lookup`  — resolve a value from another entity by matching a key (requires a LookupResolver)
 */
export type FieldRuleValueSource =
    | { Kind: 'static'; Value: unknown }
    | { Kind: 'field'; Field: string }
    | { Kind: 'formula'; Expression: string }
    | { Kind: 'lookup'; Lookup: FieldRuleLookup };

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
