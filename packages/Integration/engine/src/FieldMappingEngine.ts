import { MJLruCache } from '@memberjunction/global';
import { computeUnmappedFields } from './CustomOverflow.js';
import { flattenRecord, hasNestedObject } from './RecordFlatten.js';
import type { ICompanyIntegrationFieldMap } from './entity-types.js';
import type { ExternalRecord, MappedRecord } from './types.js';
import type {
    TransformStep,
    TransformOnError,
    RegexConfig,
    SplitConfig,
    CombineConfig,
    LookupConfig,
    FormatConfig,
    CoerceConfig,
    SubstringConfig,
    CustomConfig,
    DirectConfig,
} from './transforms.js';

/**
 * Engine responsible for applying field-level mappings and transformations
 * from external records to MJ entity fields.
 */
export class FieldMappingEngine {
    /**
     * Cache of compiled custom-expression functions, keyed by the expression string, so an
     * identical expression is compiled once instead of once per record in a mapping batch.
     *
     * A failed compile is cached as the `Error` it threw — a malformed expression is therefore
     * compiled a single time (then re-thrown from cache on every record) rather than recompiled
     * on the per-record error path. Bounded via {@link MJLruCache} because the owning
     * `IntegrationEngine` is a process-lifetime singleton; expression cardinality is normally
     * tiny (it tracks configured field maps), so the 1000-entry default is comfortably ample.
     */
    private readonly customFunctionCache = new MJLruCache<string, CompiledExpression | Error>();

    /**
     * Applies field mappings to a batch of external records, producing mapped records
     * ready for match resolution and persistence.
     *
     * @param records - External records to map
     * @param fieldMaps - Active field map entities defining source→destination mappings
     * @param entityName - Target MJ entity name
     * @returns Array of mapped records with transformed field values
     */
    public Apply(
        records: ExternalRecord[],
        fieldMaps: ICompanyIntegrationFieldMap[],
        entityName: string
    ): MappedRecord[] {
        const activeMaps = fieldMaps.filter(fm => fm.Status === 'Active');
        return records.map(record => this.MapSingleRecord(record, activeMaps, entityName));
    }

    /**
     * Maps a single external record through all active field mappings.
     */
    private MapSingleRecord(
        record: ExternalRecord,
        fieldMaps: ICompanyIntegrationFieldMap[],
        entityName: string
    ): MappedRecord {
        // Flatten nested source objects to scalar columns (e.g. checkin_question.id →
        // checkin_question_id) BEFORE mapping. The match keys on the mapped PK VALUE
        // (MatchEngine.FindByKeyFields), so an object-valued source field would produce a
        // per-occurrence / per-version key → duplicate rows. Discovery flattens identically, so
        // the field maps reference the flattened scalar names. A record with no nested objects
        // passes through unchanged — every flat-record connector is a no-op here.
        const ext: ExternalRecord = hasNestedObject(record.Fields)
            ? { ...record, Fields: flattenRecord(record.Fields) }
            : record;

        const mappedFields: Record<string, unknown> = {};
        const mappedSourceNames = new Set<string>();

        for (const fieldMap of fieldMaps) {
            mappedSourceNames.add(fieldMap.SourceFieldName);
            const value = this.ApplyFieldMapping(ext, fieldMap);
            if (value !== undefined) {
                mappedFields[fieldMap.DestinationFieldName] = value;
            }
        }

        // Capture the source keys with no field map (gaps.md §2). Cheap O(columns) diff;
        // the result is empty (and discarded by the writer) in the common all-mapped case,
        // so this adds no measurable cost to a customs-free sync. The engine parks any extras
        // in the __mj_integration_CustomOverflow system column — see {@link CustomOverflow}.
        const unmappedFields = computeUnmappedFields(ext.Fields, mappedSourceNames);

        return {
            ExternalRecord: ext,
            MJEntityName: entityName,
            MappedFields: mappedFields,
            ChangeType: ext.IsDeleted ? 'Delete' : 'Create',
            UnmappedFields: unmappedFields,
        };
    }

    /**
     * Applies a single field mapping, including the full transform pipeline.
     * Returns undefined if the field should be skipped (OnError: Skip).
     */
    private ApplyFieldMapping(
        record: ExternalRecord,
        fieldMap: ICompanyIntegrationFieldMap
    ): unknown {
        let value: unknown = record.Fields[fieldMap.SourceFieldName];
        const pipeline = this.ParseTransformPipeline(fieldMap.TransformPipeline);

        for (const step of pipeline) {
            const result = this.ExecuteTransformStep(step, value, record.Fields);
            if (result.Skipped) return undefined;
            value = result.Value;
        }

        return value;
    }

    /**
     * Parses the JSON transform pipeline string into typed TransformStep objects.
     */
    private ParseTransformPipeline(pipelineJson: string | null): TransformStep[] {
        if (!pipelineJson || pipelineJson.trim() === '') return [];

        try {
            const parsed: unknown = JSON.parse(pipelineJson);
            if (!Array.isArray(parsed)) return [];
            return parsed as TransformStep[];
        } catch {
            return [];
        }
    }

    /**
     * Executes a single transform step, applying the configured transformation
     * and handling errors according to the step's OnError strategy.
     */
    private ExecuteTransformStep(
        step: TransformStep,
        value: unknown,
        allFields: Record<string, unknown>
    ): TransformStepResult {
        // Grace by default (§8 "still get as much data"): an unconfigured transform that errors on one
        // record's value nulls that FIELD and lets the record sync, rather than failing the record/batch.
        // An author can still opt into strict 'Fail' or 'Skip' explicitly per step.
        const onError: TransformOnError = step.OnError ?? 'Null';

        try {
            const transformed = this.DispatchTransform(step, value, allFields);
            return { Value: transformed, Skipped: false };
        } catch (err) {
            return this.HandleTransformError(onError, err);
        }
    }

    /**
     * Dispatches to the appropriate transform handler based on step type.
     */
    private DispatchTransform(
        step: TransformStep,
        value: unknown,
        allFields: Record<string, unknown>
    ): unknown {
        switch (step.Type) {
            case 'direct':
                return this.ApplyDirect(value, step.Config as DirectConfig);
            case 'regex':
                return this.ApplyRegex(value, step.Config as RegexConfig);
            case 'split':
                return this.ApplySplit(value, step.Config as SplitConfig);
            case 'combine':
                return this.ApplyCombine(allFields, step.Config as CombineConfig);
            case 'lookup':
                return this.ApplyLookup(value, step.Config as LookupConfig);
            case 'format':
                return this.ApplyFormat(value, step.Config as FormatConfig);
            case 'coerce':
                return this.ApplyCoerce(value, step.Config as CoerceConfig);
            case 'substring':
                return this.ApplySubstring(value, step.Config as SubstringConfig);
            case 'custom':
                return this.ApplyCustom(value, allFields, step.Config as CustomConfig);
            default:
                throw new Error(`Unknown transform type: ${step.Type}`);
        }
    }

    /**
     * Handles a transform error according to the OnError strategy.
     */
    private HandleTransformError(onError: TransformOnError, err: unknown): TransformStepResult {
        switch (onError) {
            case 'Skip':
                return { Value: undefined, Skipped: true };
            case 'Null':
                return { Value: null, Skipped: false };
            case 'Fail':
                throw err;
        }
    }

    /**
     * Direct pass-through, applying default value if source is null/undefined.
     */
    private ApplyDirect(value: unknown, config: DirectConfig): unknown {
        if (value == null && config.DefaultValue !== undefined) {
            return config.DefaultValue;
        }
        return value;
    }

    /**
     * Applies a regex replacement to a string value.
     */
    private ApplyRegex(value: unknown, config: RegexConfig): unknown {
        const strValue = String(value ?? '');
        const regex = new RegExp(config.Pattern, config.Flags ?? '');
        return strValue.replace(regex, config.Replacement);
    }

    /**
     * Splits a string value and extracts a part by index.
     */
    private ApplySplit(value: unknown, config: SplitConfig): unknown {
        const strValue = String(value ?? '');
        const parts = strValue.split(config.Delimiter);
        return parts[config.Index] ?? null;
    }

    /**
     * Combines multiple source fields with a separator.
     */
    private ApplyCombine(allFields: Record<string, unknown>, config: CombineConfig): unknown {
        const values = config.SourceFields.map(f => String(allFields[f] ?? ''));
        return values.join(config.Separator);
    }

    /**
     * Performs a case-insensitive value lookup/mapping.
     */
    private ApplyLookup(value: unknown, config: LookupConfig): unknown {
        const strValue = String(value ?? '');
        const lowerKey = strValue.toLowerCase();
        const entry = Object.entries(config.Map).find(
            ([key]) => key.toLowerCase() === lowerKey
        );
        return entry ? entry[1] : (config.Default ?? null);
    }

    /**
     * Applies date/number/string formatting.
     */
    private ApplyFormat(value: unknown, config: FormatConfig): unknown {
        if (config.FormatType === 'date') {
            const dateVal = value instanceof Date ? value : new Date(String(value));
            // Throw a CONTROLLED error on an unparseable date — vs the raw RangeError FormatDate→toISOString()
            // would throw — so ExecuteTransformStep's OnError strategy handles it uniformly (default 'Null').
            if (isNaN(dateVal.getTime())) throw new Error(`Cannot format "${String(value)}" as a date`);
            return this.FormatDate(dateVal, config.FormatString);
        }
        if (config.FormatType === 'number') {
            const numVal = Number(value);
            // Throw on non-numeric — was: emitted the literal string "NaN", which BYPASSED OnError and then
            // failed SQL numeric binding (corrupting the write). OnError now handles it (default 'Null').
            if (!Number.isFinite(numVal)) throw new Error(`Cannot format "${String(value)}" as a number`);
            return numVal.toFixed(Number(config.FormatString) || 0);
        }
        return String(value ?? '');
    }

    /**
     * Basic date formatting supporting ISO and common format tokens.
     */
    private FormatDate(date: Date, formatString: string): string {
        if (formatString.toLowerCase() === 'iso' || formatString === 'ISO8601') {
            return date.toISOString();
        }
        return date.toLocaleDateString('en-US');
    }

    /**
     * Coerces a value to the specified target type.
     */
    private ApplyCoerce(value: unknown, config: CoerceConfig): unknown {
        switch (config.TargetType) {
            case 'string':
                return String(value ?? '');
            case 'number':
                return this.CoerceToNumber(value);
            case 'boolean':
                return this.CoerceToBoolean(value);
            case 'date': {
                // Throw on unparseable — was: returned an Invalid Date that corrupted the write, bypassing
                // OnError. OnError handles it now (default 'Null' → field nulled, record syncs).
                const d = new Date(String(value));
                if (isNaN(d.getTime())) throw new Error(`Cannot coerce "${String(value)}" to date`);
                return d;
            }
            default:
                throw new Error(`Unknown coerce target type: ${config.TargetType}`);
        }
    }

    /**
     * Coerces a value to a number, throwing on NaN.
     */
    private CoerceToNumber(value: unknown): number {
        const num = Number(value);
        // Throw on unparseable so OnError decides (default 'Null' → field nulled, record syncs; 'Fail' → strict).
        // The throw is caught by ExecuteTransformStep and never escapes to fail the record/batch.
        if (isNaN(num)) {
            throw new Error(`Cannot coerce "${String(value)}" to number`);
        }
        return num;
    }

    /**
     * Coerces a value to boolean, supporting common truthy/falsy strings.
     */
    private CoerceToBoolean(value: unknown): boolean {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        const strVal = String(value).toLowerCase().trim();
        return strVal === 'true' || strVal === '1' || strVal === 'yes';
    }

    /**
     * Extracts a substring from a string value.
     */
    private ApplySubstring(value: unknown, config: SubstringConfig): unknown {
        const strValue = String(value ?? '');
        if (config.Length !== undefined) {
            return strValue.substring(config.Start, config.Start + config.Length);
        }
        return strValue.substring(config.Start);
    }

    /**
     * Evaluates a custom JavaScript expression.
     * The expression has access to `value` (current field value) and `fields` (all record fields).
     */
    private ApplyCustom(
        value: unknown,
        allFields: Record<string, unknown>,
        config: CustomConfig
    ): unknown {
        try {
            const fn = this.GetCompiledExpression(config.Expression);
            return fn(value, allFields);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Custom transform expression failed: ${message}`);
        }
    }

    /**
     * Returns the compiled function for an expression, compiling and caching on first use.
     * If the expression failed to compile previously, the cached error is re-thrown — a
     * malformed expression is compiled exactly once across an entire batch.
     */
    private GetCompiledExpression(expression: string): CompiledExpression {
        let cached = this.customFunctionCache.Get(expression);
        if (cached === undefined) {
            cached = this.compileExpression(expression);
            this.customFunctionCache.Set(expression, cached);
        }
        if (cached instanceof Error) {
            throw cached;
        }
        return cached;
    }

    /**
     * Compiles a custom expression into a callable, returning the thrown `Error` instead of
     * propagating it so the caller can cache compile failures alongside successes.
     */
    private compileExpression(expression: string): CompiledExpression | Error {
        try {
            // eslint-disable-next-line @typescript-eslint/no-implied-eval
            return new Function('value', 'fields', `return (${expression});`) as CompiledExpression;
        } catch (err) {
            return err instanceof Error ? err : new Error(String(err));
        }
    }
}

/** Signature of a compiled custom-transform expression: `(value, fields) => result`. */
type CompiledExpression = (value: unknown, fields: Record<string, unknown>) => unknown;

/** Internal result of executing a single transform step */
interface TransformStepResult {
    Value: unknown;
    Skipped: boolean;
}
