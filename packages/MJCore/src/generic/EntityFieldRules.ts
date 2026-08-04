/**
 * @fileoverview Metadata-aware field rules for MemberJunction entities — the higher-order sibling of
 * the pure field-rules engine in `@memberjunction/global`.
 *
 * The pure engine ({@link FieldRulesEvaluator} / {@link FieldTransformEngine} in `@memberjunction/global`)
 * is deliberately metadata-blind: it computes a per-field diff from a plain `Record<string, unknown>`
 * and an injected lookup resolver, so it can run anywhere (client, server, integration sync — wherever
 * the "record" came from). {@link EntityFieldRules} layers the things that only make sense when the
 * **target is a real MJ entity**, and which need the metadata layer in this package:
 *
 *  1. **Validation** — does each rule's target field exist on the entity, and is it writable
 *     (not a primary key / read-only / virtual)? Source `field` references valid? This is a pre-flight
 *     check a UX can run before anyone presses "Run".
 *  2. **Type coercion** — a formula that yields the string `"42"` becomes the number `42` for a numeric
 *     column, using each field's {@link EntityFieldInfo.TSType}. The pure engine produces raw values;
 *     this aligns them to the entity's actual SQL types.
 *  3. **Entity lookups** — a built-in `RunView`-backed resolver for `lookup` rule sources.
 *  4. **Apply** — write the computed values onto a {@link BaseEntity} and `Save()`, so MJ's Record
 *     Changes versioning captures the before/after automatically. Dry-run returns the diff and writes nothing.
 *
 * The **target is always an MJ entity**; the **source** may be the entity's own fields plus an optional
 * injected `context` (data context, query result, agent output, related-entity lookups) — all data you
 * already hold. When the *other side* is a live external system (its own protocol, auth, match
 * resolution, sync direction), that is the domain of `@memberjunction/integration`, which uses the same
 * pure transform engine for its per-field transforms. One engine, two purpose-built layers.
 */
import { FieldRulesEvaluator } from '@memberjunction/global';
import type { EntityDocumentResolver, FieldChange, FieldRuleSet, LookupResolver, PromptResolver, ResolvedLookup } from '@memberjunction/global';
import { BaseEntity } from './baseEntity';
import { EntityFieldInfo, EntityFieldTSType } from './entityInfo';
import { Metadata } from './metadata';
import { IMetadataProvider } from './interfaces';
import { UserInfo } from './securityInfo';
import { RunView } from '../views/runView';

/** Result of {@link EntityFieldRules.Validate} — a pre-flight check of a rule set against entity metadata. */
export interface EntityFieldRulesValidation {
    /** True when every rule targets an existing, writable field and all source field references resolve. */
    Valid: boolean;
    /** Human-readable problems, one per offending rule (empty when Valid). */
    Errors: string[];
}

/** Options controlling a compute/apply pass. */
export interface EntityFieldRulesOptions {
    /**
     * Extra data the rules may reference beyond the entity's own fields (merged on top of the entity's
     * field map — a `formula` can read `fields.SomeContextKey`, a `condition` can read `SomeContextKey`).
     * Use for values you already hold: a data context, a query result, an agent's output payload.
     */
    Context?: Record<string, unknown>;
    /** When true, compute the diff but DO NOT write — the returned changes are the preview. */
    DryRun?: boolean;
}

/** Outcome of {@link EntityFieldRules.ApplyToEntity}. */
export interface EntityFieldRulesResult {
    /** The per-field diff (old → new) for every rule — the dry-run preview AND the applied record. */
    Changes: FieldChange[];
    /** Names of the fields that were (or, in dry-run, would be) written. */
    AppliedFields: string[];
    /** True when the entity was saved (always false in dry-run, on error, or when nothing changed). */
    Saved: boolean;
    /** True when this was a dry-run (no write attempted). */
    DryRun: boolean;
    /** Per-rule evaluation errors (condition/source/transform), if any. No write happens when present. */
    Errors: string[];
    /** Save error detail, when a real apply failed to persist. */
    SaveError?: string;
}

/**
 * Metadata-aware application of a {@link FieldRuleSet} to MJ entity records. Instantiate once per bulk
 * run and reuse across records so the underlying expression cache is shared. Holds an acting user for
 * the built-in lookup resolver.
 */
export class EntityFieldRules {
    private readonly evaluator: FieldRulesEvaluator;

    /**
     * @param contextUser - The acting user, used by the built-in `RunView`-backed lookup resolver
     *   (required server-side; client-side may omit it).
     * @param promptResolver - Optional resolver for `prompt` rule sources. Core does not depend on the AI
     *   stack, so this is injected by a higher layer that has an `AIPromptRunner` (the bulk-update
     *   processor supplies one). Omit it and any `prompt` rule reports a clear error instead of running.
     * @param entityDocumentResolver - Optional resolver for `entityDocument` rule sources. Core does not
     *   depend on the templates/AI stack, so this is injected by a higher layer that can render an Entity
     *   Document (the processor supplies one). Omit it and any `entityDocument` rule reports a clear error.
     */
    constructor(private readonly contextUser?: UserInfo, promptResolver?: PromptResolver, entityDocumentResolver?: EntityDocumentResolver) {
        this.evaluator = new FieldRulesEvaluator({
            LookupResolver: this.buildLookupResolver(),
            PromptResolver: promptResolver,
            EntityDocumentResolver: entityDocumentResolver,
        });
    }

    /**
     * Pre-flight validation of a rule set against an entity's metadata. Pure + synchronous — safe to run
     * in a UX on every edit. Checks each rule's target field exists and is writable, and that any `field`
     * source reference resolves to a real field.
     *
     * @param entityName - The target entity.
     * @param ruleSet - The rules to validate.
     * @param provider - Metadata provider to resolve the entity (defaults to the global provider). Pass
     *   the owning provider in multi-provider contexts.
     */
    public static Validate(entityName: string, ruleSet: FieldRuleSet, provider?: IMetadataProvider): EntityFieldRulesValidation {
        const md = provider ?? Metadata.Provider;
        const entity = md?.EntityByName(entityName);
        if (!entity) {
            return { Valid: false, Errors: [`entity '${entityName}' not found in metadata`] };
        }
        const field = (name: string): EntityFieldInfo | undefined =>
            entity.FieldByName(name);

        const errors: string[] = [];
        ruleSet.Rules.forEach((rule, i) => {
            const target = field(rule.TargetField);
            if (!target) {
                errors.push(`rule ${i + 1}: target field '${rule.TargetField}' does not exist on '${entityName}'`);
            } else if (target.ReadOnly) {
                errors.push(`rule ${i + 1}: target field '${rule.TargetField}' is read-only and cannot be set`);
            }
            if (rule.Source.Kind === 'field' && !field(rule.Source.Field)) {
                errors.push(`rule ${i + 1}: source field '${rule.Source.Field}' does not exist on '${entityName}'`);
            }
        });
        return { Valid: errors.length === 0, Errors: errors };
    }

    /**
     * Computes the per-field changes for a loaded entity — WITHOUT mutating it — coercing each new value
     * to the target field's type. This is the dry-run primitive.
     *
     * @param entity - A loaded entity (its current values are the "old" side of the diff).
     * @param ruleSet - The rules to evaluate.
     * @param context - Optional extra data the rules may reference (merged over the entity's fields).
     */
    public async ComputeForEntity(entity: BaseEntity, ruleSet: FieldRuleSet, context?: Record<string, unknown>): Promise<FieldChange[]> {
        const record = context ? { ...entity.GetAll(), ...context } : entity.GetAll();
        const changes = await this.evaluator.ComputeChanges(record, ruleSet);
        return changes.map((change) => this.coerceChange(change, entity));
    }

    /**
     * Computes and (unless `DryRun`) writes the rule results onto the entity, then `Save()`s it — so MJ
     * Record Changes versioning captures the before/after. No write occurs if any rule errored or nothing
     * changed.
     *
     * @param entity - A loaded entity to update.
     * @param ruleSet - The rules to apply.
     * @param options - {@link EntityFieldRulesOptions} (context + dry-run).
     */
    public async ApplyToEntity(entity: BaseEntity, ruleSet: FieldRuleSet, options?: EntityFieldRulesOptions): Promise<EntityFieldRulesResult> {
        const changes = await this.ComputeForEntity(entity, ruleSet, options?.Context);
        const errors = changes.filter((c) => c.Error).map((c) => `${c.Field}: ${c.Error}`);
        const toApply = changes.filter((c) => c.Applied && c.Changed && !c.Error);
        const base: EntityFieldRulesResult = {
            Changes: changes, AppliedFields: toApply.map((c) => c.Field), Saved: false, DryRun: !!options?.DryRun, Errors: errors,
        };

        if (options?.DryRun || errors.length > 0 || toApply.length === 0) {
            return base;
        }
        for (const change of toApply) {
            // Dynamic, rule-driven field names — the legitimate use of Set() (no compile-time property).
            entity.Set(change.Field, change.NewValue);
        }
        const saved = await entity.Save();
        return { ...base, Saved: saved, SaveError: saved ? undefined : (entity.LatestResult?.CompleteMessage ?? 'save failed') };
    }

    /** Coerces a computed change's NewValue to the target field's TS type (no-op for un-applied/errored). */
    private coerceChange(change: FieldChange, entity: BaseEntity): FieldChange {
        if (!change.Applied || change.Error || change.NewValue == null) {
            return change;
        }
        const field = entity.EntityInfo.FieldByName(change.Field);
        if (!field) {
            return change;
        }
        const coerced = EntityFieldRules.coerceToType(change.NewValue, field.TSType);
        return coerced === change.NewValue ? change : { ...change, NewValue: coerced, Changed: !EntityFieldRules.equal(change.OldValue, coerced) };
    }

    /** Aligns a raw value to an entity field's TS type. Leaves the value untouched when it can't convert. */
    private static coerceToType(value: unknown, tsType: EntityFieldTSType): unknown {
        switch (tsType) {
            case EntityFieldTSType.Number: {
                const n = Number(value);
                return Number.isFinite(n) ? n : value;
            }
            case EntityFieldTSType.Boolean: {
                if (typeof value === 'boolean') return value;
                if (typeof value === 'number') return value !== 0;
                const s = String(value).toLowerCase().trim();
                if (s === 'true' || s === '1' || s === 'yes') return true;
                if (s === 'false' || s === '0' || s === 'no') return false;
                return value;
            }
            case EntityFieldTSType.Date: {
                const d = value instanceof Date ? value : new Date(String(value));
                return isNaN(d.getTime()) ? value : d;
            }
            case EntityFieldTSType.String:
                return typeof value === 'string' ? value : String(value);
            default:
                return value;
        }
    }

    private static equal(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
        return a == null && b == null;
    }

    /** A `RunView`-backed resolver for `lookup` rule sources (match one row, return one field). */
    private buildLookupResolver(): LookupResolver {
        return async (lookup: ResolvedLookup): Promise<unknown> => {
            const result = await new RunView().RunView(
                {
                    EntityName: lookup.Entity,
                    ExtraFilter: `[${lookup.MatchField}] = ${EntityFieldRules.sqlLiteral(lookup.MatchValue)}`,
                    Fields: [lookup.ReturnField],
                    MaxRows: 1,
                    ResultType: 'simple',
                },
                this.contextUser,
            );
            if (!result.Success || !result.Results?.length) {
                return undefined;
            }
            return (result.Results[0] as Record<string, unknown>)[lookup.ReturnField];
        };
    }

    /** Minimal SQL literal rendering for the lookup filter (escapes string quotes; numbers/bools inline). */
    private static sqlLiteral(value: unknown): string {
        if (value == null) return 'NULL';
        if (typeof value === 'number' || typeof value === 'bigint') return String(value);
        if (typeof value === 'boolean') return value ? '1' : '0';
        return `'${String(value).replace(/'/g, "''")}'`;
    }
}
