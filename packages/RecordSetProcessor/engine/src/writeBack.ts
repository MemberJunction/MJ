/**
 * @fileoverview Output-mapping write-back — applies a work's structured result back onto the data
 * model per an `OutputMapping` config: update fields on the processed record and/or create a child
 * record. Reads from the result use the generic value-mapping resolver (`$` = the result root).
 * @module @memberjunction/record-set-processor
 */

import { BaseEntity, CompositeKey, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { resolveMappingRef } from '@memberjunction/global';
import { RecordRef } from '@memberjunction/record-set-processor-base';

/** Declarative description of how a work's structured output is written back. */
export interface OutputMappingConfig {
    /** Map of `EntityFieldName -> resultRef` (e.g. `{ "Satisfaction": "$.satisfaction" }`) applied to the processed record. */
    fields?: Record<string, string>;
    /** Optional child record to create from the result. */
    childRecord?: {
        /** Target child entity name. */
        entity: string;
        /** FK field on the child set to the processed record's primary key. */
        parentField: string;
        /** Map of `ChildFieldName -> resultRef`. */
        map: Record<string, string>;
    };
}

/** Outcome of {@link applyOutputMapping}. */
export interface WriteBackResult {
    /** True if the processed record's fields were actually updated (always false on a dry-run). */
    updatedRecord: boolean;
    /** ID of the created child record, when a child mapping was applied (absent on a dry-run). */
    createdChildID?: string;
    /** True when this was a dry-run: values were computed (and field names validated) but NOTHING was saved. */
    dryRun?: boolean;
    /** On a dry-run, the resolved field values that WOULD be written to the processed record — the write-back preview. */
    previewFields?: Record<string, unknown>;
    /** On a dry-run with a child mapping, the resolved child values that WOULD be created. */
    previewChild?: Record<string, unknown>;
}

/**
 * Applies an {@link OutputMappingConfig} against a work result. Single-primary-key entities only
 * (composite keys throw a clear error). Field/child values are resolved from the result via the
 * shared resolver, so `"$.path"` reads `result.path`.
 *
 * **Dry-run** (`dryRun: true`): the mapped values are still resolved and the target entity/field
 * metadata is still validated, but NO entity is saved and NO child is created — the would-be values
 * are returned in `previewFields` / `previewChild` so a dry-run preview can show exactly what an apply
 * would write. This is what lets a dry-run of any wrapped work type (Action / Agent / Infer / ML Model)
 * compute its effect without mutating data, mirroring the `FieldRulesProcessor` dry-run preview.
 */
export async function applyOutputMapping(opts: {
    outputMapping: OutputMappingConfig;
    result: unknown;
    record: RecordRef;
    contextUser: UserInfo;
    provider?: IMetadataProvider;
    /** When true, compute + validate the mapping but do NOT save anything (returns a preview instead). */
    dryRun?: boolean;
}): Promise<WriteBackResult> {
    const { outputMapping, result, record, contextUser, dryRun } = opts;
    const provider = opts.provider ?? Metadata.Provider;
    const sources = { $: result, record: record.Record ?? {} };
    const out: WriteBackResult = { updatedRecord: false };
    if (dryRun) {
        out.dryRun = true;
    }

    // 1) Update fields on the processed record.
    if (outputMapping.fields && Object.keys(outputMapping.fields).length > 0) {
        const entity = provider.EntityByID(record.EntityID);
        if (!entity) {
            throw new Error(`applyOutputMapping: entity '${record.EntityID}' not found in metadata`);
        }
        if (entity.PrimaryKeys.length !== 1) {
            throw new Error(`applyOutputMapping: write-back currently supports single-primary-key entities only ('${entity.Name}')`);
        }
        // Resolve the mapped values once — shared by the dry-run preview and the real apply.
        const resolved: Record<string, unknown> = {};
        for (const [field, ref] of Object.entries(outputMapping.fields)) {
            resolved[field] = resolveMappingRef(ref, sources);
        }
        if (dryRun) {
            // Compute-only: surface what an apply WOULD write, persist nothing.
            out.previewFields = resolved;
        } else {
            const obj = await provider.GetEntityObject<BaseEntity>(entity.Name, contextUser);
            const loaded = await obj.InnerLoad(CompositeKey.FromKeyValuePair(entity.FirstPrimaryKey.Name, record.RecordID));
            if (!loaded) {
                throw new Error(`applyOutputMapping: record '${record.RecordID}' of '${entity.Name}' not found`);
            }
            for (const [field, value] of Object.entries(resolved)) {
                // Dynamic, config-driven field names — the legitimate use of Set() (no compile-time property).
                obj.Set(field, value);
            }
            const saved = await obj.Save();
            if (!saved) {
                throw new Error(`applyOutputMapping: failed updating '${entity.Name}' record '${record.RecordID}': ${obj.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            out.updatedRecord = true;
        }
    }

    // 2) Create a child record.
    if (outputMapping.childRecord) {
        const childMap: Record<string, unknown> = { [outputMapping.childRecord.parentField]: record.RecordID };
        for (const [field, ref] of Object.entries(outputMapping.childRecord.map)) {
            childMap[field] = resolveMappingRef(ref, sources);
        }
        if (dryRun) {
            out.previewChild = childMap;
        } else {
            const child = await provider.GetEntityObject<BaseEntity>(outputMapping.childRecord.entity, contextUser);
            child.NewRecord();
            for (const [field, value] of Object.entries(childMap)) {
                child.Set(field, value);
            }
            const saved = await child.Save();
            if (!saved) {
                throw new Error(`applyOutputMapping: failed creating '${outputMapping.childRecord.entity}' child: ${child.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            out.createdChildID = child.FirstPrimaryKey?.Value != null ? String(child.FirstPrimaryKey.Value) : undefined;
        }
    }

    return out;
}
