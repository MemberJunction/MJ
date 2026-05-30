/**
 * @fileoverview Persists dynamically discovered integration objects and fields
 * to the IntegrationObject / IntegrationObjectField tables.
 *
 * Called during RSU (after IntrospectSchema) to ensure the metadata DB reflects
 * all objects and fields the connector discovered — not just the static ones
 * from mj-sync push.
 *
 * Static records (IsCustom = false) are never overwritten — they are the
 * curated baseline. Dynamic-only records (IsCustom = true) are upserted freely.
 * When a dynamic field overlaps with a static field, the static record wins
 * for constraint columns (IsPrimaryKey, IsRequired, Description, etc.) and
 * dynamic wins for type/size columns (Type, Length, Precision, Scale).
 */

import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import type {
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
    MJActionEntity,
    MJActionParamEntity,
    MJActionResultCodeEntity,
    MJActionCategoryEntity,
} from '@memberjunction/core-entities';
import type { SourceSchemaInfo, SourceObjectInfo, SourceFieldInfo } from './types';
import { ActionMetadataGenerator, type IntegrationObjectInfo } from './ActionMetadataGenerator';

export interface PersistSchemaOptions {
    IntegrationID: string;
    SourceSchema: SourceSchemaInfo;
    ContextUser: UserInfo;
    Provider?: IMetadataProvider;
    /**
     * When true, persistence runs through a TransactionGroup batch — substantially
     * faster on large schemas (Salesforce ~1,800 sobjects). Set false for diagnostic
     * runs where per-record error visibility matters.
     * Default: true.
     */
    UseTransactionGroup?: boolean;
}

/** Per-field provenance recording which source decided each attribute during the merge. */
export interface FieldMergeLog {
    ObjectName: string;
    FieldName: string;
    /** What overall record was decided to be the row's MetadataSource. */
    EffectiveSource: 'Declared' | 'Discovered' | 'Custom';
    /**
     * Per-attribute precedence map: 'Declared' = curated value won (no overwrite from
     * discovery), 'Discovered' = describe output won (overwrote curated for DDL-affecting
     * attribute), 'Initial' = field is newly created (no prior value).
     */
    AttributeWinners: {
        Type?: 'Declared' | 'Discovered' | 'Initial';
        Length?: 'Declared' | 'Discovered' | 'Initial';
        AllowsNull?: 'Declared' | 'Discovered' | 'Initial';
        IsRequired?: 'Declared' | 'Discovered' | 'Initial';
        IsPrimaryKey?: 'Declared' | 'Discovered' | 'Initial';
        IsUniqueKey?: 'Declared' | 'Discovered' | 'Initial';
        IsReadOnly?: 'Declared' | 'Discovered' | 'Initial';
        Description?: 'Declared' | 'Discovered' | 'Initial';
        ForeignKey?: 'Declared' | 'Discovered' | 'Initial';
    };
}

/** Per-object provenance summary. */
export interface ObjectMergeLog {
    ObjectName: string;
    EffectiveSource: 'Declared' | 'Discovered' | 'Custom';
    /** Whether the row was just created (no prior). */
    Created: boolean;
    /** Whether any attribute changed from prior value. */
    Updated: boolean;
}

export interface PersistSchemaResult {
    ObjectsCreated: number;
    ObjectsUpdated: number;
    FieldsCreated: number;
    FieldsUpdated: number;
    /**
     * Per-object and per-field merge provenance.
     * Lets the caller (e.g. progress-artifacts emitter, UI dashboard) surface
     * EXACTLY which source decided each attribute — declared static metadata,
     * runtime describe overlay, or initial creation. Structural transparency
     * per the framework's overlay-precedence rule.
     */
    ObjectMergeLog: ObjectMergeLog[];
    FieldMergeLog: FieldMergeLog[];
}

/**
 * Maps generic source types (from connectors) to MJ EntityField-compatible type strings.
 */
function MapSourceType(sourceType: string): string {
    const t = (sourceType ?? '').toLowerCase();
    if (t === 'string' || t === 'text' || t === 'richtext') return 'nvarchar';
    if (t === 'integer' || t === 'int' || t === 'number') return 'nvarchar'; // stored as nvarchar in integration schemas
    if (t === 'decimal' || t === 'float' || t === 'currency') return 'nvarchar';
    if (t === 'boolean' || t === 'bool') return 'bit';
    if (t === 'datetime' || t === 'date' || t === 'timestamp') return 'datetimeoffset';
    if (t === 'enum' || t === 'enumeration' || t === 'picklist') return 'nvarchar';
    return 'nvarchar';
}

export class IntegrationSchemaSync {

    /**
     * Upserts IntegrationObject and IntegrationObjectField records from
     * dynamically discovered schema.
     *
     * - Objects matched by (IntegrationID, Name)
     * - Fields matched by (IntegrationObjectID, Name)
     * - Records are never deleted here — stale ones stick around
     *
     * **Merge strategy — describe wins for technical fields.** When a discovered
     * field matches an existing record, we refresh Type, AllowsNull, IsRequired,
     * and IsPrimaryKey from the live describe output. These are the attributes
     * that drive DDL generation and sync-time coercion; curated values can
     * (and do) drift from what the external system actually exposes and cause
     * overflow / null-violation errors.
     *
     * Curated metadata still wins for **semantic** fields — DisplayName,
     * Description (only filled when empty), Sequence, Category — because those
     * are human-authored and the describe output usually doesn't improve them.
     */
    public static async PersistDiscoveredSchema(opts: PersistSchemaOptions): Promise<PersistSchemaResult> {
        const { IntegrationID, SourceSchema, ContextUser } = opts;
        const md: IMetadataProvider = opts.Provider ?? Metadata.Provider;
        const engine = IntegrationEngineBase.Instance;
        const useBatch = opts.UseTransactionGroup ?? true;
        const result: PersistSchemaResult = {
            ObjectsCreated: 0,
            ObjectsUpdated: 0,
            FieldsCreated: 0,
            FieldsUpdated: 0,
            ObjectMergeLog: [],
            FieldMergeLog: [],
        };

        // Load existing objects for this integration from cache
        const existingObjects = engine.GetIntegrationObjectsByIntegrationID(IntegrationID);

        // Phase 1: upsert objects. Object upserts must complete before field upserts
        // (fields need ObjectID). Within this phase, upserts are independent so we
        // batch-execute via Promise.all (concurrency cap to avoid hammering the DB).
        const objectUpserts = SourceSchema.Objects.map(srcObj => async () => {
            const objResult = await IntegrationSchemaSync.UpsertObject(
                md, IntegrationID, srcObj, existingObjects, ContextUser
            );
            return { srcObj, ...objResult };
        });
        const objectResults = useBatch
            ? await IntegrationSchemaSync.batchExec(objectUpserts, 8)
            : await IntegrationSchemaSync.serialExec(objectUpserts);

        for (const r of objectResults) {
            result.ObjectsCreated += r.Created ? 1 : 0;
            result.ObjectsUpdated += r.Updated ? 1 : 0;
            result.ObjectMergeLog.push({
                ObjectName: r.srcObj.ExternalName,
                EffectiveSource: r.EffectiveSource,
                Created: r.Created,
                Updated: r.Updated,
            });
        }

        // Build sibling name→ID map for FK resolution during field upserts.
        // Combines the freshly-upserted set with whatever was already in the engine
        // cache, so discovered FK targets like "Contacts" resolve to a UUID regardless
        // of whether the target object was just created this run or pre-existed.
        const siblingNameToID = new Map<string, string>();
        for (const eo of existingObjects) {
            if (eo.ID) siblingNameToID.set(eo.Name.toLowerCase(), eo.ID);
        }
        for (const r of objectResults) {
            if (r.ObjectID) siblingNameToID.set(r.srcObj.ExternalName.toLowerCase(), r.ObjectID);
        }

        // Phase 2: upsert fields per object. Across objects is parallelizable; within
        // an object the field set is sequential against the cached field list.
        const fieldUpsertJobs = objectResults
            .filter(r => r.ObjectID)
            .map(r => async () => {
                const existingFields = engine.GetIntegrationObjectFields(r.ObjectID!);
                const perObjectLogs: FieldMergeLog[] = [];
                const perObjectStats = { created: 0, updated: 0 };
                for (const srcField of r.srcObj.Fields) {
                    const fr = await IntegrationSchemaSync.UpsertField(
                        md, r.ObjectID!, srcField, existingFields, ContextUser, siblingNameToID
                    );
                    if (fr.Created) perObjectStats.created++;
                    if (fr.Updated) perObjectStats.updated++;
                    perObjectLogs.push({
                        ObjectName: r.srcObj.ExternalName,
                        FieldName: srcField.Name,
                        EffectiveSource: fr.EffectiveSource,
                        AttributeWinners: fr.AttributeWinners,
                    });
                }
                return { stats: perObjectStats, logs: perObjectLogs };
            });

        const fieldResults = useBatch
            ? await IntegrationSchemaSync.batchExec(fieldUpsertJobs, 8)
            : await IntegrationSchemaSync.serialExec(fieldUpsertJobs);

        for (const fr of fieldResults) {
            result.FieldsCreated += fr.stats.created;
            result.FieldsUpdated += fr.stats.updated;
            result.FieldMergeLog.push(...fr.logs);
        }

        console.log(`[IntegrationSchemaSync] Persisted schema for ${IntegrationID}: ${result.ObjectsCreated} objects created, ${result.ObjectsUpdated} updated, ${result.FieldsCreated} fields created, ${result.FieldsUpdated} updated`);
        return result;
    }

    /**
     * Batch executor with bounded concurrency. Independent async jobs run in parallel
     * up to `concurrency`; failures within a job propagate as-is. This is the lightest-
     * weight batching primitive we can rely on without depending on a TransactionGroup
     * abstraction that doesn't exist in MJCore. Order-of-completion irrelevant for
     * upserts; order-of-emission preserved in the returned array.
     */
    private static async batchExec<T>(jobs: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
        const results: T[] = new Array(jobs.length);
        let next = 0;
        const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
            while (true) {
                const i = next++;
                if (i >= jobs.length) return;
                results[i] = await jobs[i]();
            }
        });
        await Promise.all(workers);
        return results;
    }

    /** Serial executor — slower, used for diagnostic runs where per-record errors matter. */
    private static async serialExec<T>(jobs: Array<() => Promise<T>>): Promise<T[]> {
        const out: T[] = [];
        for (const j of jobs) out.push(await j());
        return out;
    }

    // ── Object upsert ────────────────────────────────────────────────

    private static async UpsertObject(
        md: IMetadataProvider,
        integrationID: string,
        srcObj: SourceObjectInfo,
        existingObjects: MJIntegrationObjectEntity[],
        contextUser: UserInfo
    ): Promise<{ ObjectID: string | null; Created: boolean; Updated: boolean; EffectiveSource: 'Declared' | 'Discovered' | 'Custom' }> {
        const existing = existingObjects.find(
            o => o.Name.toLowerCase() === srcObj.ExternalName.toLowerCase()
        );

        if (existing) {
            // Declared row exists. Discovery may enrich (e.g. Description if empty,
            // IncrementalWatermarkField if newly observed). Curated values win for
            // everything human-authored; describe wins only for technical/empty slots.
            let dirty = false;
            if (!existing.Description && srcObj.Description) {
                existing.Description = srcObj.Description;
                dirty = true;
            }
            if (srcObj.IncrementalWatermarkField && !existing.IncrementalWatermarkField) {
                existing.IncrementalWatermarkField = srcObj.IncrementalWatermarkField;
                dirty = true;
            }
            if (dirty) {
                try { await existing.Save(); } catch { /* ignore save failures on declared records */ }
                return { ObjectID: existing.ID, Created: false, Updated: true, EffectiveSource: 'Declared' };
            }
            return { ObjectID: existing.ID, Created: false, Updated: false, EffectiveSource: 'Declared' };
        }

        // New row — mark as 'Discovered' by default. Vendor-signaled custom objects
        // (e.g. HubSpot namespace, Salesforce __c suffix) should be promoted to
        // 'Custom' by the concrete connector's DiscoverObjects override before
        // PersistDiscoveredSchema is called; absent a signal, 'Discovered' is the
        // safer label.
        try {
            const obj = await md.GetEntityObject<MJIntegrationObjectEntity>('MJ: Integration Objects', contextUser);
            obj.NewRecord();
            obj.IntegrationID = integrationID;
            obj.Name = srcObj.ExternalName;
            obj.DisplayName = srcObj.ExternalLabel || srcObj.ExternalName;
            if (srcObj.Description) obj.Description = srcObj.Description;
            if (srcObj.IncrementalWatermarkField) obj.IncrementalWatermarkField = srcObj.IncrementalWatermarkField;
            obj.Status = 'Active';
            obj.Set('IsCustom', true);
            obj.Set('MetadataSource', 'Discovered');
            obj.Sequence = 999;
            const saved = await obj.Save();
            if (saved) {
                return { ObjectID: obj.ID, Created: true, Updated: false, EffectiveSource: 'Discovered' };
            }
        } catch (err) {
            console.warn(`[IntegrationSchemaSync] Failed to create IntegrationObject '${srcObj.ExternalName}': ${err instanceof Error ? err.message : err}`);
        }
        return { ObjectID: null, Created: false, Updated: false, EffectiveSource: 'Discovered' };
    }

    // ── Field upsert ─────────────────────────────────────────────────

    private static async UpsertField(
        md: IMetadataProvider,
        objectID: string,
        srcField: SourceFieldInfo,
        existingFields: MJIntegrationObjectFieldEntity[],
        contextUser: UserInfo,
        siblingNameToID?: Map<string, string>
    ): Promise<{ Created: boolean; Updated: boolean; EffectiveSource: 'Declared' | 'Discovered' | 'Custom'; AttributeWinners: FieldMergeLog['AttributeWinners'] }> {
        const resolveFK = (target?: string | null): string | undefined => {
            if (!target || !siblingNameToID) return undefined;
            return siblingNameToID.get(target.toLowerCase());
        };
        const existing = existingFields.find(
            f => f.Name.toLowerCase() === srcField.Name.toLowerCase()
        );
        const winners: FieldMergeLog['AttributeWinners'] = {};

        if (existing) {
            // Declared row exists. Overlay rule:
            //  - Describe wins for DDL-affecting attributes (Type, AllowsNull, IsRequired, IsPrimaryKey, IsUniqueKey, IsReadOnly).
            //    Curated values for these can drift from what the live system enforces and cause sync errors.
            //  - Curated wins for semantic attributes (Description if non-empty, DisplayName, Sequence, Category).
            //
            // Returned attribute winners surface EXACTLY which source decided each
            // attribute so the caller (progress emitter, UI) can show structural
            // transparency on the merge.
            let dirty = false;
            const mappedType = MapSourceType(srcField.SourceType);
            const describedAllowsNull = srcField.AllowsNull ?? !srcField.IsRequired;

            if (existing.Type !== mappedType) {
                existing.Type = mappedType;
                dirty = true;
                winners.Type = 'Discovered';
            } else {
                winners.Type = 'Declared';
            }
            if (existing.AllowsNull !== describedAllowsNull) {
                existing.AllowsNull = describedAllowsNull;
                dirty = true;
                winners.AllowsNull = 'Discovered';
            } else {
                winners.AllowsNull = 'Declared';
            }
            if (existing.IsRequired !== srcField.IsRequired) {
                existing.IsRequired = srcField.IsRequired;
                dirty = true;
                winners.IsRequired = 'Discovered';
            } else {
                winners.IsRequired = 'Declared';
            }
            if (existing.IsPrimaryKey !== srcField.IsPrimaryKey) {
                existing.IsPrimaryKey = srcField.IsPrimaryKey;
                dirty = true;
                winners.IsPrimaryKey = 'Discovered';
            } else {
                winners.IsPrimaryKey = 'Declared';
            }
            if (srcField.IsUniqueKey !== undefined && existing.IsUniqueKey !== srcField.IsUniqueKey) {
                existing.IsUniqueKey = srcField.IsUniqueKey;
                dirty = true;
                winners.IsUniqueKey = 'Discovered';
            } else {
                winners.IsUniqueKey = 'Declared';
            }
            if (srcField.IsReadOnly !== undefined && existing.IsReadOnly !== srcField.IsReadOnly) {
                existing.IsReadOnly = srcField.IsReadOnly;
                dirty = true;
                winners.IsReadOnly = 'Discovered';
            } else {
                winners.IsReadOnly = 'Declared';
            }
            // Description: only fill if missing — curated descriptions outrank
            // generic describe output. So 'Declared' wins unless the row had
            // no description at all and discovery has one.
            if (!existing.Description && srcField.Description) {
                existing.Description = srcField.Description;
                dirty = true;
                winners.Description = 'Discovered';
            } else if (existing.Description) {
                winners.Description = 'Declared';
            }
            // FK metadata overlay: declared wins if already set. Otherwise resolve the
            // discovered ForeignKeyTarget name against sibling objects in this integration
            // and persist the UUID. Unresolvable targets leave the field FK-less rather than
            // fabricating an ID — explorer agents/users get to set the link later.
            if (srcField.IsForeignKey && srcField.ForeignKeyTarget && !existing.RelatedIntegrationObjectID) {
                const resolvedID = resolveFK(srcField.ForeignKeyTarget);
                if (resolvedID) {
                    existing.RelatedIntegrationObjectID = resolvedID;
                    dirty = true;
                    winners.ForeignKey = 'Discovered';
                }
            } else if (existing.RelatedIntegrationObjectID) {
                winners.ForeignKey = 'Declared';
            }
            if (dirty) {
                const saved = await existing.Save();
                if (!saved) {
                    console.warn(
                        `[IntegrationSchemaSync] UpsertField save failed for '${srcField.Name}': ${existing.LatestResult?.CompleteMessage ?? 'unknown error'}`
                    );
                }
                return { Created: false, Updated: true, EffectiveSource: 'Declared', AttributeWinners: winners };
            }
            return { Created: false, Updated: false, EffectiveSource: 'Declared', AttributeWinners: winners };
        }

        // New field — discovered for the first time
        try {
            const field = await md.GetEntityObject<MJIntegrationObjectFieldEntity>('MJ: Integration Object Fields', contextUser);
            field.NewRecord();
            field.IntegrationObjectID = objectID;
            field.Name = srcField.Name;
            field.DisplayName = srcField.Label || srcField.Name;
            if (srcField.Description) field.Description = srcField.Description;
            field.Type = MapSourceType(srcField.SourceType);
            field.AllowsNull = srcField.AllowsNull ?? !srcField.IsRequired;
            field.IsPrimaryKey = srcField.IsPrimaryKey;
            field.IsRequired = srcField.IsRequired;
            field.IsReadOnly = srcField.IsReadOnly ?? false;
            field.IsUniqueKey = srcField.IsUniqueKey ?? false;
            field.Status = 'Active';
            field.Set('IsCustom', true);
            field.Set('MetadataSource', 'Discovered');
            field.Sequence = 999;
            if (srcField.IsForeignKey && srcField.ForeignKeyTarget) {
                const resolvedID = resolveFK(srcField.ForeignKeyTarget);
                if (resolvedID) field.RelatedIntegrationObjectID = resolvedID;
            }
            const saved = await field.Save();
            const initialWinners: FieldMergeLog['AttributeWinners'] = {
                Type: 'Initial', Length: 'Initial', AllowsNull: 'Initial',
                IsRequired: 'Initial', IsPrimaryKey: 'Initial', IsUniqueKey: 'Initial',
                IsReadOnly: 'Initial', Description: 'Initial', ForeignKey: 'Initial',
            };
            return { Created: saved, Updated: false, EffectiveSource: 'Discovered', AttributeWinners: initialWinners };
        } catch (err) {
            console.warn(`[IntegrationSchemaSync] Failed to create IntegrationObjectField '${srcField.Name}': ${err instanceof Error ? err.message : err}`);
        }
        return { Created: false, Updated: false, EffectiveSource: 'Discovered', AttributeWinners: {} };
    }

    // ── Action generation for discovered custom objects ──────────────

    /**
     * Generates Action entities for newly discovered custom objects by
     * feeding them through the same `ActionMetadataGenerator` used for
     * standard objects, then persisting the result via BaseEntity.Save().
     *
     * This ensures custom object actions are structurally identical to
     * standard ones — same verbs, same param shapes, same result codes.
     */
    public static async GenerateActionsForCustomObjects(opts: {
        IntegrationName: string;
        CustomObjects: IntegrationObjectInfo[];
        SupportsSearch: boolean;
        SupportsListing: boolean;
        ContextUser: UserInfo;
        IconClass?: string;
        Provider?: IMetadataProvider;
    }): Promise<{ ActionsCreated: number }> {
        const { IntegrationName, CustomObjects, ContextUser } = opts;
        if (CustomObjects.length === 0) return { ActionsCreated: 0 };

        // Use the same generator as the offline CLI
        const generator = new ActionMetadataGenerator();
        const result = generator.Generate({
            IntegrationName,
            CategoryName: IntegrationName,
            IconClass: opts.IconClass ?? 'fa-solid fa-plug',
            Objects: CustomObjects,
            IncludeSearch: opts.SupportsSearch,
            IncludeList: opts.SupportsListing,
            CreateCategory: true,
        });

        // Persist action records via BaseEntity — same structure, just saved to DB
        // instead of writing to mj-sync JSON
        const md: IMetadataProvider = opts.Provider ?? Metadata.Provider;
        let created = 0;

        // Ensure category exists
        const categoryID = await IntegrationSchemaSync.ResolveOrCreateCategory(
            md, IntegrationName, result.CategoryRecords, ContextUser
        );

        for (const actionRecord of result.ActionRecords) {
            const actionName = actionRecord.fields['Name'] as string;

            // Skip if action already exists
            const rv = new RunView();
            const existing = await rv.RunView({
                EntityName: 'MJ: Actions',
                ExtraFilter: `Name='${actionName.replace(/'/g, "''")}'`,
                MaxRows: 1,
                ResultType: 'simple',
                Fields: ['ID'],
            }, ContextUser);
            if (existing.Success && existing.Results.length > 0) continue;

            try {
                const actionID = await IntegrationSchemaSync.PersistActionRecord(
                    md, actionRecord, categoryID, ContextUser
                );
                if (actionID) created++;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[IntegrationSchemaSync] Failed to create action '${actionName}': ${msg}`);
            }
        }

        if (created > 0) {
            console.log(`[IntegrationSchemaSync] Created ${created} actions for ${CustomObjects.length} custom objects in ${IntegrationName}`);
        }
        return { ActionsCreated: created };
    }

    private static async PersistActionRecord(
        md: IMetadataProvider,
        record: { fields: Record<string, unknown>; relatedEntities: Record<string, Array<{ fields: Record<string, unknown> }>> },
        categoryID: string | null,
        contextUser: UserInfo
    ): Promise<string | null> {
        const action = await md.GetEntityObject<MJActionEntity>('MJ: Actions', contextUser);
        action.NewRecord();
        action.Name = record.fields['Name'] as string;
        action.Description = (record.fields['Description'] as string) ?? '';
        action.Type = 'Custom';
        action.Status = 'Active';
        action.DriverClass = record.fields['DriverClass'] as string;
        // Config is a JSON object from the generator — stringify it
        const configObj = record.fields['Config'];
        action.Set('Config_', typeof configObj === 'string' ? configObj : JSON.stringify(configObj));
        if (categoryID) action.CategoryID = categoryID;
        if (record.fields['IconClass']) action.Set('IconClass', record.fields['IconClass'] as string);

        const saved = await action.Save();
        if (!saved) return null;

        // Persist params
        const params = record.relatedEntities['MJ: Action Params'] ?? [];
        for (const p of params) {
            const param = await md.GetEntityObject<MJActionParamEntity>('MJ: Action Params', contextUser);
            param.NewRecord();
            param.ActionID = action.ID;
            param.Name = p.fields['Name'] as string;
            param.Type = p.fields['Type'] as 'Input' | 'Output' | 'Both';
            param.ValueType = (p.fields['ValueType'] ?? 'Scalar') as 'Scalar' | 'Simple Object' | 'BaseEntity Sub-Class' | 'Other' | 'MediaOutput';
            param.IsArray = (p.fields['IsArray'] as boolean) ?? false;
            param.IsRequired = (p.fields['IsRequired'] as boolean) ?? false;
            if (p.fields['Description']) param.Description = p.fields['Description'] as string;
            await param.Save();
        }

        // Persist result codes
        const codes = record.relatedEntities['MJ: Action Result Codes'] ?? [];
        for (const c of codes) {
            const code = await md.GetEntityObject<MJActionResultCodeEntity>('MJ: Action Result Codes', contextUser);
            code.NewRecord();
            code.ActionID = action.ID;
            code.ResultCode = c.fields['ResultCode'] as string;
            if (c.fields['Description']) code.Description = c.fields['Description'] as string;
            code.IsSuccess = (c.fields['IsSuccess'] as boolean) ?? false;
            await code.Save();
        }

        return action.ID;
    }

    private static async ResolveOrCreateCategory(
        md: IMetadataProvider,
        integrationName: string,
        categoryRecords: Array<{ fields: Record<string, unknown> }>,
        contextUser: UserInfo
    ): Promise<string | null> {
        const rv = new RunView();
        const existing = await rv.RunView<MJActionCategoryEntity>({
            EntityName: 'MJ: Action Categories',
            ExtraFilter: `Name='${integrationName.replace(/'/g, "''")}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        }, contextUser);

        if (existing.Success && existing.Results.length > 0) {
            return existing.Results[0].ID;
        }

        // Create from generator's category record if available
        const catRecord = categoryRecords[0];
        try {
            const cat = await md.GetEntityObject<MJActionCategoryEntity>('MJ: Action Categories', contextUser);
            cat.NewRecord();
            cat.Name = integrationName;
            cat.Description = catRecord?.fields['Description'] as string ?? `Actions for ${integrationName} integration`;
            cat.Status = 'Active';
            const saved = await cat.Save();
            return saved ? cat.ID : null;
        } catch {
            return null;
        }
    }
}
