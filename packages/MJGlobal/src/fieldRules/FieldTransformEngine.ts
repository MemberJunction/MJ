import { MJLruCache } from '../MJLruCache';
import type {
    TransformStep,
    TransformOnError,
    TransformStepResult,
    DirectConfig,
    RegexConfig,
    SplitConfig,
    CombineConfig,
    LookupConfig,
    FormatConfig,
    CoerceConfig,
    SubstringConfig,
    CustomConfig,
} from './transforms';

/** Signature of a compiled custom/formula expression: `(value, fields) => result`. */
export type CompiledExpression = (value: unknown, fields: Record<string, unknown>) => unknown;

/**
 * Framework-agnostic engine that runs a field-value transform pipeline over a single `(value, fields)`
 * pair. Lifted from the MemberJunction integration field-mapping engine so the integration sync AND the
 * rules-based bulk-update processor share one implementation of every transform type.
 *
 * Holds an LRU cache of compiled custom/formula expressions (an identical expression compiles once, not
 * once per record). A failed compile is cached as the `Error` it threw and re-thrown from cache, so a
 * malformed expression is compiled exactly once across a whole batch.
 */
export class FieldTransformEngine {
    private readonly compiledExpressionCache = new MJLruCache<string, CompiledExpression | Error>();

    /**
     * Runs `value` through every step of `steps`, returning the final value (or `Skipped` when an
     * OnError='Skip' step drops the field). `fields` is the full record, available to combine/custom steps.
     */
    public ExecutePipeline(value: unknown, fields: Record<string, unknown>, steps: TransformStep[]): TransformStepResult {
        let current = value;
        for (const step of steps) {
            const result = this.ExecuteStep(step, current, fields);
            if (result.Skipped) {
                return result;
            }
            current = result.Value;
        }
        return { Value: current, Skipped: false };
    }

    /**
     * Executes a single transform step, applying the configured transformation and handling errors
     * according to the step's OnError strategy (default 'Null' — grace: null the field, keep going).
     */
    public ExecuteStep(step: TransformStep, value: unknown, fields: Record<string, unknown>): TransformStepResult {
        const onError: TransformOnError = step.OnError ?? 'Null';
        try {
            return { Value: this.dispatch(step, value, fields), Skipped: false };
        } catch (err) {
            return this.handleError(onError, err);
        }
    }

    /**
     * Evaluates a value-producing expression against the record. Reuses the compiled-expression cache.
     * The expression sees the current field value as `value` and all record fields as `fields`
     * (e.g. `fields.FirstName + ' ' + fields.LastName`).
     */
    public Evaluate(expression: string, value: unknown, fields: Record<string, unknown>): unknown {
        return this.getCompiled(expression)(value, fields);
    }

    private dispatch(step: TransformStep, value: unknown, fields: Record<string, unknown>): unknown {
        switch (step.Type) {
            case 'direct':
                return this.applyDirect(value, step.Config as DirectConfig);
            case 'regex':
                return this.applyRegex(value, step.Config as RegexConfig);
            case 'split':
                return this.applySplit(value, step.Config as SplitConfig);
            case 'combine':
                return this.applyCombine(fields, step.Config as CombineConfig);
            case 'lookup':
                return this.applyLookup(value, step.Config as LookupConfig);
            case 'format':
                return this.applyFormat(value, step.Config as FormatConfig);
            case 'coerce':
                return this.applyCoerce(value, step.Config as CoerceConfig);
            case 'substring':
                return this.applySubstring(value, step.Config as SubstringConfig);
            case 'custom':
                try {
                    return this.Evaluate((step.Config as CustomConfig).Expression, value, fields);
                } catch (err) {
                    throw new Error(`Custom transform expression failed: ${err instanceof Error ? err.message : String(err)}`);
                }
            default:
                throw new Error(`Unknown transform type: ${(step as TransformStep).Type}`);
        }
    }

    private handleError(onError: TransformOnError, err: unknown): TransformStepResult {
        switch (onError) {
            case 'Skip':
                return { Value: undefined, Skipped: true };
            case 'Null':
                return { Value: null, Skipped: false };
            case 'Fail':
                throw err;
        }
    }

    private applyDirect(value: unknown, config: DirectConfig): unknown {
        return value == null && config.DefaultValue !== undefined ? config.DefaultValue : value;
    }

    private applyRegex(value: unknown, config: RegexConfig): unknown {
        return String(value ?? '').replace(new RegExp(config.Pattern, config.Flags ?? ''), config.Replacement);
    }

    private applySplit(value: unknown, config: SplitConfig): unknown {
        return String(value ?? '').split(config.Delimiter)[config.Index] ?? null;
    }

    private applyCombine(fields: Record<string, unknown>, config: CombineConfig): unknown {
        return config.SourceFields.map((f) => String(fields[f] ?? '')).join(config.Separator);
    }

    private applyLookup(value: unknown, config: LookupConfig): unknown {
        const lowerKey = String(value ?? '').toLowerCase();
        const entry = Object.entries(config.Map).find(([key]) => key.toLowerCase() === lowerKey);
        return entry ? entry[1] : (config.Default ?? null);
    }

    private applyFormat(value: unknown, config: FormatConfig): unknown {
        if (config.FormatType === 'date') {
            const dateVal = value instanceof Date ? value : new Date(String(value));
            if (isNaN(dateVal.getTime())) {
                throw new Error(`Cannot format "${String(value)}" as a date`);
            }
            return config.FormatString.toLowerCase() === 'iso' || config.FormatString === 'ISO8601'
                ? dateVal.toISOString()
                : dateVal.toLocaleDateString('en-US');
        }
        if (config.FormatType === 'number') {
            const numVal = Number(value);
            if (!Number.isFinite(numVal)) {
                throw new Error(`Cannot format "${String(value)}" as a number`);
            }
            return numVal.toFixed(Number(config.FormatString) || 0);
        }
        return String(value ?? '');
    }

    private applyCoerce(value: unknown, config: CoerceConfig): unknown {
        switch (config.TargetType) {
            case 'string':
                return String(value ?? '');
            case 'number': {
                const num = Number(value);
                if (isNaN(num)) {
                    throw new Error(`Cannot coerce "${String(value)}" to number`);
                }
                return num;
            }
            case 'boolean': {
                if (typeof value === 'boolean') return value;
                if (typeof value === 'number') return value !== 0;
                const s = String(value).toLowerCase().trim();
                return s === 'true' || s === '1' || s === 'yes';
            }
            case 'date': {
                const d = new Date(String(value));
                if (isNaN(d.getTime())) {
                    throw new Error(`Cannot coerce "${String(value)}" to date`);
                }
                return d;
            }
            default:
                throw new Error(`Unknown coerce target type: ${(config as CoerceConfig).TargetType}`);
        }
    }

    private applySubstring(value: unknown, config: SubstringConfig): unknown {
        const s = String(value ?? '');
        return config.Length !== undefined ? s.substring(config.Start, config.Start + config.Length) : s.substring(config.Start);
    }

    private getCompiled(expression: string): CompiledExpression {
        let cached = this.compiledExpressionCache.Get(expression);
        if (cached === undefined) {
            cached = this.compile(expression);
            this.compiledExpressionCache.Set(expression, cached);
        }
        if (cached instanceof Error) {
            throw cached;
        }
        return cached;
    }

    private compile(expression: string): CompiledExpression | Error {
        try {
            // eslint-disable-next-line @typescript-eslint/no-implied-eval
            return new Function('value', 'fields', `return (${expression});`) as CompiledExpression;
        } catch (err) {
            return err instanceof Error ? err : new Error(String(err));
        }
    }
}
