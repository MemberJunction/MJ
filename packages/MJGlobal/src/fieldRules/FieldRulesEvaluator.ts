import { SafeExpressionEvaluator } from '../SafeExpressionEvaluator';
import { FieldTransformEngine } from './FieldTransformEngine';
import type {
    EntityDocumentResolver,
    FieldChange,
    FieldRule,
    FieldRuleSet,
    FieldRuleValueSource,
    LookupResolver,
    PromptResolver,
} from './rules';

/** Options for an evaluator instance. */
export interface FieldRulesEvaluatorOptions {
    /** Resolver for `lookup` sources. Omit if no rule uses a lookup (a lookup rule then errors). */
    LookupResolver?: LookupResolver;
    /** Resolver for `prompt` sources. Omit if no rule uses a prompt (a prompt rule then errors). */
    PromptResolver?: PromptResolver;
    /** Resolver for `entityDocument` sources. Omit if no rule renders one (such a rule then errors). */
    EntityDocumentResolver?: EntityDocumentResolver;
}

/**
 * Computes the field changes a {@link FieldRuleSet} would make to a record — WITHOUT mutating anything.
 *
 * Returning a list of {@link FieldChange} (old → new per rule) is what makes a dry-run preview possible:
 * the caller decides whether to apply. Conditions are evaluated with the safe expression evaluator;
 * value formulas + the transform pipeline run through the shared {@link FieldTransformEngine}; entity
 * lookups go through the injected resolver. The engine never touches a database itself.
 */
export class FieldRulesEvaluator {
    private readonly transforms = new FieldTransformEngine();
    private readonly conditions = new SafeExpressionEvaluator();
    private readonly lookupResolver?: LookupResolver;
    private readonly promptResolver?: PromptResolver;
    private readonly entityDocumentResolver?: EntityDocumentResolver;

    constructor(options?: FieldRulesEvaluatorOptions) {
        this.lookupResolver = options?.LookupResolver;
        this.promptResolver = options?.PromptResolver;
        this.entityDocumentResolver = options?.EntityDocumentResolver;
    }

    /** Computes one {@link FieldChange} per rule for a record (a row of field name → current value). */
    public async ComputeChanges(record: Record<string, unknown>, ruleSet: FieldRuleSet): Promise<FieldChange[]> {
        const changes: FieldChange[] = [];
        for (const rule of ruleSet.Rules) {
            changes.push(await this.evaluateRule(record, rule));
        }
        return changes;
    }

    private async evaluateRule(record: Record<string, unknown>, rule: FieldRule): Promise<FieldChange> {
        const oldValue = record[rule.TargetField];
        const unchanged = (extra: Partial<FieldChange>): FieldChange => ({
            Field: rule.TargetField, OldValue: oldValue, NewValue: oldValue, Changed: false, Applied: false, ...extra,
        });

        const condition = this.checkCondition(record, rule);
        if (condition.error) return unchanged({ Error: condition.error });
        if (!condition.passed) return unchanged({ SkipReason: 'condition evaluated false' });

        let value: unknown;
        try {
            value = await this.resolveSource(record, rule.Source);
        } catch (err) {
            return unchanged({ Error: `source: ${this.message(err)}` });
        }

        if (rule.Transforms?.length) {
            try {
                const result = this.transforms.ExecutePipeline(value, record, rule.Transforms);
                if (result.Skipped) return unchanged({ SkipReason: 'transform skipped the field' });
                value = result.Value;
            } catch (err) {
                return unchanged({ Error: `transform: ${this.message(err)}` });
            }
        }

        return {
            Field: rule.TargetField,
            OldValue: oldValue,
            NewValue: value,
            Changed: !this.equal(oldValue, value),
            Applied: true,
        };
    }

    private checkCondition(record: Record<string, unknown>, rule: FieldRule): { passed: boolean; error?: string } {
        if (!rule.Condition) {
            return { passed: true };
        }
        const result = this.conditions.evaluate(rule.Condition, record);
        if (!result.success) {
            return { passed: false, error: `condition: ${result.error ?? 'invalid expression'}` };
        }
        return { passed: result.value === true };
    }

    private async resolveSource(record: Record<string, unknown>, source: FieldRuleValueSource): Promise<unknown> {
        switch (source.Kind) {
            case 'static':
                return source.Value;
            case 'field':
                return record[source.Field];
            case 'formula':
                return this.transforms.Evaluate(source.Expression, undefined, record);
            case 'lookup': {
                if (!this.lookupResolver) {
                    throw new Error('a lookup rule was used but no LookupResolver was provided');
                }
                const matchValue = await this.resolveSource(record, source.Lookup.MatchValue);
                const resolved = await this.lookupResolver({
                    Entity: source.Lookup.Entity,
                    MatchField: source.Lookup.MatchField,
                    MatchValue: matchValue,
                    ReturnField: source.Lookup.ReturnField,
                });
                return resolved === undefined ? (source.Lookup.Default ?? null) : resolved;
            }
            case 'prompt': {
                if (!this.promptResolver) {
                    throw new Error('a prompt rule was used but no PromptResolver was provided');
                }
                // By default hand the WHOLE record to the prompt; otherwise resolve each shaped Data entry
                // through the same source machinery (so Data values can be fields, formulas, statics, …).
                let data: Record<string, unknown> = record;
                if (source.Prompt.Data) {
                    data = {};
                    for (const [key, valueSource] of Object.entries(source.Prompt.Data)) {
                        data[key] = await this.resolveSource(record, valueSource);
                    }
                }
                return this.promptResolver({ PromptID: source.Prompt.PromptID, Data: data });
            }
            case 'entityDocument': {
                if (!this.entityDocumentResolver) {
                    throw new Error('an entityDocument rule was used but no EntityDocumentResolver was provided');
                }
                return this.entityDocumentResolver({ EntityDocumentID: source.EntityDocument?.EntityDocumentID, Record: record });
            }
        }
    }

    private equal(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
        if (a == null && b == null) return true;
        return false;
    }

    private message(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}
