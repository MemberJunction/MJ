import type { MJCompanyIntegrationFieldMapEntity } from '@memberjunction/core-entities';
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
        fieldMaps: MJCompanyIntegrationFieldMapEntity[],
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
        fieldMaps: MJCompanyIntegrationFieldMapEntity[],
        entityName: string
    ): MappedRecord {
        const mappedFields: Record<string, unknown> = {};

        for (const fieldMap of fieldMaps) {
            const value = this.ApplyFieldMapping(record, fieldMap);
            if (value !== undefined) {
                mappedFields[fieldMap.DestinationFieldName] = value;
            }
        }

        return {
            ExternalRecord: record,
            MJEntityName: entityName,
            MappedFields: mappedFields,
            ChangeType: record.IsDeleted ? 'Delete' : 'Create',
        };
    }

    /**
     * Applies a single field mapping, including the full transform pipeline.
     * Returns undefined if the field should be skipped (OnError: Skip).
     */
    private ApplyFieldMapping(
        record: ExternalRecord,
        fieldMap: MJCompanyIntegrationFieldMapEntity
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
        const onError: TransformOnError = step.OnError ?? 'Fail';

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
            return this.FormatDate(dateVal, config.FormatString);
        }
        if (config.FormatType === 'number') {
            const numVal = Number(value);
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
            case 'date':
                return new Date(String(value));
            default:
                throw new Error(`Unknown coerce target type: ${config.TargetType}`);
        }
    }

    /**
     * Coerces a value to a number, throwing on NaN.
     */
    private CoerceToNumber(value: unknown): number {
        const num = Number(value);
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
            // eslint-disable-next-line @typescript-eslint/no-implied-eval
            const fn = new Function('value', 'fields', `return (${config.Expression});`);
            return fn(value, allFields) as unknown;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Custom transform expression failed: ${message}`);
        }
    }
}

/** Internal result of executing a single transform step */
interface TransformStepResult {
    Value: unknown;
    Skipped: boolean;
}
