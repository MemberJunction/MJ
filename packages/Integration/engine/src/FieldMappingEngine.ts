import { FieldTransformEngine } from '@memberjunction/global';
import { computeUnmappedFields } from './CustomOverflow.js';
import { flattenRecord, hasNestedObject } from './RecordFlatten.js';
import type { ICompanyIntegrationFieldMap } from './entity-types.js';
import type { ExternalRecord, MappedRecord } from './types.js';
import type { TransformStep } from './transforms.js';

/**
 * Engine responsible for applying field-level mappings and transformations from external records to
 * MJ entity fields.
 *
 * The per-value transform pipeline (direct / regex / split / combine / lookup / format / coerce /
 * substring / custom) is owned by the shared {@link FieldTransformEngine} in `@memberjunction/global`
 * and reused here, so integration sync and the rules-based bulk-update processor run the *exact same*
 * transform implementation — one place to fix, one place to extend. This engine keeps only the
 * integration-specific concerns: source flattening, field-map iteration, and unmapped-field overflow
 * capture. See the Field Rules guide in `@memberjunction/global` for the shared engine, and
 * `EntityFieldRules` in `@memberjunction/core` for the metadata-aware entity-update sibling.
 */
export class FieldMappingEngine {
    /** The shared transform pipeline. Holds its own LRU cache of compiled custom expressions. */
    private readonly transformEngine = new FieldTransformEngine();

    /**
     * Applies field mappings to a batch of external records, producing mapped records ready for match
     * resolution and persistence.
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
     * Applies a single field mapping, including the full transform pipeline (delegated to the shared
     * {@link FieldTransformEngine}). Returns undefined if the field should be skipped (OnError: Skip).
     */
    private ApplyFieldMapping(
        record: ExternalRecord,
        fieldMap: ICompanyIntegrationFieldMap
    ): unknown {
        const value: unknown = record.Fields[fieldMap.SourceFieldName];
        const pipeline = this.ParseTransformPipeline(fieldMap.TransformPipeline);
        const result = this.transformEngine.ExecutePipeline(value, record.Fields, pipeline);
        return result.Skipped ? undefined : result.Value;
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
}
