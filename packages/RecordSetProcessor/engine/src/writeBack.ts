/**
 * @fileoverview Output-mapping write-back — applies a work's structured result back onto the data
 * model per an `OutputMapping` config: update fields on the processed record and/or create a child
 * record. Reads from the result use the generic value-mapping resolver (`$` = the result root).
 * @module @memberjunction/record-set-processor
 */

import { BaseEntity, CompositeKey, IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { UUIDsEqual, resolveMappingRef } from '@memberjunction/global';
import { RecordRef } from '@memberjunction/record-set-processor-base';
import { TagEngine, TaxonomyMode } from '@memberjunction/tag-engine';
import type { MJTagEntity } from '@memberjunction/core-entities';

/** Provenance information about the executing process run, passed down to write-back and mapped via `$run.*`. */
export interface RunProvenance {
    ProcessRunID?: string;
    RecordProcessID?: string;
    PromptID?: string;
    PromptVersionHash?: string;
    AIPromptRunID?: string;
    ExecutedAt?: string;
    FeatureValueCacheID?: string;
}

/** Child record mapping configuration, supporting optional array fan-out. */
export interface ChildRecordMapping {
    /** Target child entity name. */
    entity: string;
    /** FK field on the child set to the processed record's primary key. */
    parentField: string;
    /** Map of `ChildFieldName -> resultRef`. */
    map: Record<string, string>;
    /** Optional ref resolving to an array for fan-out (one child created per array element). */
    fanOutRef?: string;
}

/** Tag output mapping configuration for taxonomy linking. */
export interface TagOutputMapping {
    /** Result path resolving to a tag string or string array (e.g. "$.tags"). */
    ref: string;
    /** Root tag this feature's values must live under. Required. */
    rootTagId: string;
    /** How deep below the root a value may be placed/created. 1 = direct children only. */
    maxDepth?: number;
    /** Maps to TagEngine's TaxonomyMode. Default 'constrained'. */
    growth?: 'constrained' | 'auto-grow' | 'hybrid';
    /** Minimum semantic-match score to accept an existing tag. */
    matchThreshold?: number;
    /** Entity the TaggedItem points at. Default: the processed entity. */
    taggedEntityName?: string;
}

/** Declarative description of how a work's structured output is written back. */
export interface OutputMappingConfig {
    /** Map of `EntityFieldName -> resultRef` (e.g. `{ "Satisfaction": "$.satisfaction" }`) applied to the processed record. */
    fields?: Record<string, string>;
    /** Optional single child record to create from the result (kept for backward compatibility). */
    childRecord?: ChildRecordMapping;
    /** Optional child records to create from the result, supporting fan-out over arrays. */
    childRecords?: ChildRecordMapping[];
    /** Optional tags to link or create via the MJ Tagging system. */
    tags?: TagOutputMapping[];
}

/** Preview outcome for a single resolved tag. */
export interface TagWriteBackPreview {
    tagText: string;
    resolvedTagID?: string;
    resolvedTagName?: string;
    matched: boolean;
    created: boolean;
    rootTagID: string;
    depth?: number;
    error?: string;
}

/** Outcome of {@link applyOutputMapping}. */
export interface WriteBackResult {
    /** True if the processed record's fields were actually updated (always false on a dry-run). */
    updatedRecord: boolean;
    /** ID of the created child record, when a single child mapping was applied (absent on a dry-run). */
    createdChildID?: string;
    /** IDs of created child records when childRecords (or fan-out) was applied (absent on a dry-run). */
    createdChildIDs?: string[];
    /** IDs of created tagged item records (absent on a dry-run). */
    createdTaggedItemIDs?: string[];
    /** True when this was a dry-run: values were computed (and field names validated) but NOTHING was saved. */
    dryRun?: boolean;
    /** On a dry-run, the resolved field values that WOULD be written to the processed record — the write-back preview. */
    previewFields?: Record<string, unknown>;
    /** On a dry-run with a single child mapping, the resolved child values that WOULD be created. */
    previewChild?: Record<string, unknown>;
    /** On a dry-run with childRecords (or fan-out), the array of resolved child records that WOULD be created. */
    previewChildren?: Array<Record<string, unknown>>;
    /** On a dry-run with tag mappings, the resolved tag previews. */
    previewTags?: TagWriteBackPreview[];
}

/**
 * Computes the depth of a tag relative to a root tag.
 * Returns 0 if tagID === rootTagID, 1 for direct children, 2 for grandchildren, etc.
 * Returns -1 if the tag is not a descendant of rootTagID.
 */
function computeTagDepth(
    tagID: string,
    rootTagID: string,
    tagEngine: { GetTagByID: (id: string) => { ID: string; ParentID: string | null } | undefined }
): number {
    if (UUIDsEqual(tagID, rootTagID)) {
        return 0;
    }
    let currentID: string | null = tagID;
    let depth = 0;
    while (currentID) {
        const currentTag = tagEngine.GetTagByID(currentID);
        if (!currentTag) {
            return -1;
        }
        if (UUIDsEqual(currentTag.ParentID ?? '', rootTagID)) {
            return depth + 1;
        }
        currentID = currentTag.ParentID;
        depth++;
        if (depth > 50) {
            return -1;
        }
    }
    return -1;
}

/**
 * Applies an {@link OutputMappingConfig} against a work result.
 * Supports updating fields (both single-key and composite-key entities), creating child records
 * (with array fan-out), and linking/creating tags via TagEngine.
 *
 * Values resolve from `$` (result), `record` (parent row) and `$run` (provenance).
 */
export async function applyOutputMapping(opts: {
    outputMapping: OutputMappingConfig;
    result: unknown;
    record: RecordRef;
    contextUser: UserInfo;
    provider?: IMetadataProvider;
    /** When true, compute + validate the mapping but do NOT save anything (returns a preview instead). */
    dryRun?: boolean;
    /** Optional run provenance information mapped via `$run.*`. */
    run?: RunProvenance;
}): Promise<WriteBackResult> {
    const { outputMapping, result, record, contextUser, dryRun, run } = opts;
    const provider = opts.provider ?? Metadata.Provider;
    const sources: Record<string, unknown> = {
        $: result,
        record: record.Record ?? {},
        $run: run ?? {},
    };
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
            // RecordID is the compact CompositeKey segment (bare value for a single column, "F1|v1||F2|v2" for composite).
            const loaded = await obj.InnerLoad(CompositeKey.FromURLSegment(entity, record.RecordID));
            if (!loaded) {
                throw new Error(`applyOutputMapping: record '${record.RecordID}' of '${entity.Name}' not found`);
            }
            for (const [field, value] of Object.entries(resolved)) {
                // Dynamic, config-driven field names — legitimate use of Set() (no compile-time property).
                obj.Set(field, value);
            }
            const saved = await obj.Save();
            if (!saved) {
                throw new Error(`applyOutputMapping: failed updating '${entity.Name}' record '${record.RecordID}': ${obj.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            out.updatedRecord = true;
        }
    }

    // 2) Create child records (single childRecord and/or childRecords with fan-out).
    const childConfigs: ChildRecordMapping[] = [];
    if (outputMapping.childRecord) {
        childConfigs.push(outputMapping.childRecord);
    }
    if (outputMapping.childRecords && Array.isArray(outputMapping.childRecords)) {
        for (const c of outputMapping.childRecords) {
            childConfigs.push(c);
        }
    }

    if (childConfigs.length > 0) {
        const childRecordsToCreate: Array<{ entity: string; data: Record<string, unknown> }> = [];

        for (const childConfig of childConfigs) {
            if (childConfig.fanOutRef) {
                const fanOutVal = resolveMappingRef(childConfig.fanOutRef, sources);
                const items = Array.isArray(fanOutVal) ? fanOutVal : [];
                for (const item of items) {
                    const itemSources: Record<string, unknown> = {
                        $: item,
                        item,
                        parent: result,
                        record: record.Record ?? {},
                        $run: run ?? {},
                    };
                    const childMap: Record<string, unknown> = { [childConfig.parentField]: record.RecordID };
                    for (const [field, ref] of Object.entries(childConfig.map)) {
                        childMap[field] = resolveMappingRef(ref, itemSources);
                    }
                    childRecordsToCreate.push({ entity: childConfig.entity, data: childMap });
                }
            } else {
                const childMap: Record<string, unknown> = { [childConfig.parentField]: record.RecordID };
                for (const [field, ref] of Object.entries(childConfig.map)) {
                    childMap[field] = resolveMappingRef(ref, sources);
                }
                childRecordsToCreate.push({ entity: childConfig.entity, data: childMap });
            }
        }

        if (childRecordsToCreate.length > 0) {
            if (dryRun) {
                out.previewChildren = childRecordsToCreate.map((c) => c.data);
                if (outputMapping.childRecord && childRecordsToCreate.length > 0) {
                    out.previewChild = childRecordsToCreate[0].data;
                }
            } else {
                const createdIDs: string[] = [];
                for (const item of childRecordsToCreate) {
                    const child = await provider.GetEntityObject<BaseEntity>(item.entity, contextUser);
                    child.NewRecord();
                    for (const [field, value] of Object.entries(item.data)) {
                        child.Set(field, value);
                    }
                    const saved = await child.Save();
                    if (!saved) {
                        throw new Error(`applyOutputMapping: failed creating '${item.entity}' child: ${child.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                    }
                    const childKey = child.PrimaryKey.ToCompactURLSegment();
                    createdIDs.push(childKey.length > 0 ? childKey : 'created');
                }
                out.createdChildIDs = createdIDs;
                if (outputMapping.childRecord && createdIDs.length > 0) {
                    out.createdChildID = createdIDs[0];
                }
            }
        }
    }

    // 3) Apply tags via MJ Tagging system.
    if (outputMapping.tags && outputMapping.tags.length > 0) {
        const previewTags: TagWriteBackPreview[] = [];
        const createdTaggedItemIDs: string[] = [];

        await TagEngine.Instance.Config(false, contextUser);

        for (const tagMapping of outputMapping.tags) {
            const rawTagVal = resolveMappingRef(tagMapping.ref, sources);
            const tagNames: string[] = [];
            if (typeof rawTagVal === 'string') {
                tagNames.push(rawTagVal);
            } else if (Array.isArray(rawTagVal)) {
                for (const item of rawTagVal) {
                    if (typeof item === 'string') {
                        tagNames.push(item);
                    } else if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') {
                        tagNames.push(item.name);
                    }
                }
            }

            const growthMode = (tagMapping.growth ?? 'constrained') as TaxonomyMode;
            const matchThreshold = tagMapping.matchThreshold ?? 0.8;

            for (const tagName of tagNames) {
                if (!tagName || typeof tagName !== 'string' || tagName.trim().length === 0) {
                    continue;
                }
                const trimmedName = tagName.trim();

                if (dryRun) {
                    let matchedTag: MJTagEntity | null = null;
                    try {
                        matchedTag = await TagEngine.Instance.ResolveTag(
                            trimmedName,
                            1.0,
                            'constrained',
                            tagMapping.rootTagId,
                            matchThreshold,
                            contextUser
                        );
                    } catch {
                        matchedTag = null;
                    }

                    if (matchedTag) {
                        const depth = computeTagDepth(matchedTag.ID, tagMapping.rootTagId, TagEngine.Instance);
                        const exceedsMaxDepth = tagMapping.maxDepth !== undefined && depth > tagMapping.maxDepth;
                        previewTags.push({
                            tagText: trimmedName,
                            resolvedTagID: matchedTag.ID,
                            resolvedTagName: matchedTag.Name,
                            matched: true,
                            created: false,
                            rootTagID: tagMapping.rootTagId,
                            depth,
                            error: exceedsMaxDepth ? `Match exceeds maxDepth (${depth} > ${tagMapping.maxDepth})` : undefined,
                        });
                    } else {
                        if (growthMode === 'auto-grow') {
                            const depth = 1;
                            const exceedsMaxDepth = tagMapping.maxDepth !== undefined && depth > tagMapping.maxDepth;
                            previewTags.push({
                                tagText: trimmedName,
                                matched: false,
                                created: true,
                                rootTagID: tagMapping.rootTagId,
                                depth,
                                error: exceedsMaxDepth ? `Created tag exceeds maxDepth (${depth} > ${tagMapping.maxDepth})` : undefined,
                            });
                        } else {
                            previewTags.push({
                                tagText: trimmedName,
                                matched: false,
                                created: false,
                                rootTagID: tagMapping.rootTagId,
                            });
                        }
                    }
                } else {
                    let wasCreated = false;
                    const resolvedTag = await TagEngine.Instance.ResolveTag(
                        trimmedName,
                        1.0,
                        growthMode,
                        tagMapping.rootTagId,
                        matchThreshold,
                        contextUser,
                        {
                            onTagCreated: () => {
                                wasCreated = true;
                            },
                        }
                    );

                    if (!resolvedTag) {
                        continue;
                    }

                    const depth = computeTagDepth(resolvedTag.ID, tagMapping.rootTagId, TagEngine.Instance);
                    if (tagMapping.maxDepth !== undefined && depth > tagMapping.maxDepth) {
                        throw new Error(`applyOutputMapping: tag '${resolvedTag.Name}' depth (${depth}) exceeds maxDepth (${tagMapping.maxDepth}) under root '${tagMapping.rootTagId}'`);
                    }

                    let targetEntityID = record.EntityID;
                    if (tagMapping.taggedEntityName) {
                        const taggedEntity = provider.EntityByName(tagMapping.taggedEntityName);
                        if (!taggedEntity) {
                            throw new Error(`applyOutputMapping: taggedEntityName '${tagMapping.taggedEntityName}' not found in metadata`);
                        }
                        targetEntityID = taggedEntity.ID;
                    }

                    const taggedItem = await TagEngine.Instance.CreateTaggedItem(
                        resolvedTag.ID,
                        targetEntityID,
                        record.RecordID,
                        1.0,
                        contextUser
                    );
                    if (taggedItem) {
                        const itemKey = taggedItem.PrimaryKey.ToCompactURLSegment();
                        createdTaggedItemIDs.push(itemKey.length > 0 ? itemKey : taggedItem.ID);
                    }
                }
            }
        }

        if (dryRun) {
            out.previewTags = previewTags;
        } else {
            out.createdTaggedItemIDs = createdTaggedItemIDs;
        }
    }

    return out;
}
