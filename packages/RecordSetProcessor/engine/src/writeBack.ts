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
    /** True if the processed record's fields were updated. */
    updatedRecord: boolean;
    /** ID of the created child record, when a child mapping was applied. */
    createdChildID?: string;
}

/**
 * Applies an {@link OutputMappingConfig} against a work result. Single-primary-key entities only
 * (composite keys throw a clear error). Field/child values are resolved from the result via the
 * shared resolver, so `"$.path"` reads `result.path`.
 */
export async function applyOutputMapping(opts: {
    outputMapping: OutputMappingConfig;
    result: unknown;
    record: RecordRef;
    contextUser: UserInfo;
    provider?: IMetadataProvider;
}): Promise<WriteBackResult> {
    const { outputMapping, result, record, contextUser } = opts;
    const provider = opts.provider ?? Metadata.Provider;
    const sources = { $: result, record: record.Record ?? {} };
    const out: WriteBackResult = { updatedRecord: false };

    // 1) Update fields on the processed record.
    if (outputMapping.fields && Object.keys(outputMapping.fields).length > 0) {
        const entity = provider.EntityByID(record.EntityID);
        if (!entity) {
            throw new Error(`applyOutputMapping: entity '${record.EntityID}' not found in metadata`);
        }
        if (entity.PrimaryKeys.length !== 1) {
            throw new Error(`applyOutputMapping: write-back currently supports single-primary-key entities only ('${entity.Name}')`);
        }
        const obj = await provider.GetEntityObject<BaseEntity>(entity.Name, contextUser);
        const loaded = await obj.InnerLoad(CompositeKey.FromKeyValuePair(entity.FirstPrimaryKey.Name, record.RecordID));
        if (!loaded) {
            throw new Error(`applyOutputMapping: record '${record.RecordID}' of '${entity.Name}' not found`);
        }
        for (const [field, ref] of Object.entries(outputMapping.fields)) {
            // Dynamic, config-driven field names — the legitimate use of Set() (no compile-time property).
            obj.Set(field, resolveMappingRef(ref, sources));
        }
        const saved = await obj.Save();
        if (!saved) {
            throw new Error(`applyOutputMapping: failed updating '${entity.Name}' record '${record.RecordID}': ${obj.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        out.updatedRecord = true;
    }

    // 2) Create a child record.
    if (outputMapping.childRecord) {
        const child = await provider.GetEntityObject<BaseEntity>(outputMapping.childRecord.entity, contextUser);
        child.NewRecord();
        child.Set(outputMapping.childRecord.parentField, record.RecordID);
        for (const [field, ref] of Object.entries(outputMapping.childRecord.map)) {
            child.Set(field, resolveMappingRef(ref, sources));
        }
        const saved = await child.Save();
        if (!saved) {
            throw new Error(`applyOutputMapping: failed creating '${outputMapping.childRecord.entity}' child: ${child.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        out.createdChildID = child.FirstPrimaryKey?.Value != null ? String(child.FirstPrimaryKey.Value) : undefined;
    }

    return out;
}
