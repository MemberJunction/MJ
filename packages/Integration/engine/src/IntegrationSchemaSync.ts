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
}

export interface PersistSchemaResult {
    ObjectsCreated: number;
    ObjectsUpdated: number;
    FieldsCreated: number;
    FieldsUpdated: number;
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
        const result: PersistSchemaResult = { ObjectsCreated: 0, ObjectsUpdated: 0, FieldsCreated: 0, FieldsUpdated: 0 };

        // Load existing objects for this integration from cache
        const existingObjects = engine.GetIntegrationObjectsByIntegrationID(IntegrationID);

        for (const srcObj of SourceSchema.Objects) {
            const objResult = await IntegrationSchemaSync.UpsertObject(
                md, IntegrationID, srcObj, existingObjects, ContextUser
            );
            result.ObjectsCreated += objResult.Created ? 1 : 0;
            result.ObjectsUpdated += objResult.Updated ? 1 : 0;

            // Now upsert fields for this object
            const objectID = objResult.ObjectID;
            if (!objectID) continue;

            const existingFields = engine.GetIntegrationObjectFields(objectID);
            for (const srcField of srcObj.Fields) {
                const fieldResult = await IntegrationSchemaSync.UpsertField(
                    md, objectID, srcField, existingFields, ContextUser
                );
                result.FieldsCreated += fieldResult.Created ? 1 : 0;
                result.FieldsUpdated += fieldResult.Updated ? 1 : 0;
            }
        }

        console.log(`[IntegrationSchemaSync] Persisted schema for ${IntegrationID}: ${result.ObjectsCreated} objects created, ${result.ObjectsUpdated} updated, ${result.FieldsCreated} fields created, ${result.FieldsUpdated} updated`);
        return result;
    }

    // ── Object upsert ────────────────────────────────────────────────

    private static async UpsertObject(
        md: IMetadataProvider,
        integrationID: string,
        srcObj: SourceObjectInfo,
        existingObjects: MJIntegrationObjectEntity[],
        contextUser: UserInfo
    ): Promise<{ ObjectID: string | null; Created: boolean; Updated: boolean }> {
        const existing = existingObjects.find(
            o => o.Name.toLowerCase() === srcObj.ExternalName.toLowerCase()
        );

        if (existing) {
            // Static object exists — don't overwrite, but update type/capability fields if empty
            let dirty = false;
            if (!existing.Description && srcObj.Description) {
                existing.Description = srcObj.Description;
                dirty = true;
            }
            if (dirty) {
                try { await existing.Save(); } catch { /* ignore save failures on static records */ }
                return { ObjectID: existing.ID, Created: false, Updated: true };
            }
            return { ObjectID: existing.ID, Created: false, Updated: false };
        }

        // New custom object — create it
        try {
            const obj = await md.GetEntityObject<MJIntegrationObjectEntity>('MJ: Integration Objects', contextUser);
            obj.NewRecord();
            obj.IntegrationID = integrationID;
            obj.Name = srcObj.ExternalName;
            obj.DisplayName = srcObj.ExternalLabel || srcObj.ExternalName;
            if (srcObj.Description) obj.Description = srcObj.Description;
            obj.Status = 'Active';
            obj.Set('IsCustom', true);
            obj.Sequence = 999; // custom objects at the end
            const saved = await obj.Save();
            if (saved) {
                return { ObjectID: obj.ID, Created: true, Updated: false };
            }
        } catch (err) {
            console.warn(`[IntegrationSchemaSync] Failed to create IntegrationObject '${srcObj.ExternalName}': ${err instanceof Error ? err.message : err}`);
        }
        return { ObjectID: null, Created: false, Updated: false };
    }

    // ── Field upsert ─────────────────────────────────────────────────

    private static async UpsertField(
        md: IMetadataProvider,
        objectID: string,
        srcField: SourceFieldInfo,
        existingFields: MJIntegrationObjectFieldEntity[],
        contextUser: UserInfo
    ): Promise<{ Created: boolean; Updated: boolean }> {
        const existing = existingFields.find(
            f => f.Name.toLowerCase() === srcField.Name.toLowerCase()
        );

        if (existing) {
            // Refresh technical attributes from describe — the live source is
            // the truth here. Curated DisplayName, Sequence, Category, etc. are
            // left alone; only fields that affect DDL and sync coercion get
            // rewritten from the describe payload.
            let dirty = false;
            const mappedType = MapSourceType(srcField.SourceType);
            const describedAllowsNull = !srcField.IsRequired;

            if (existing.Type !== mappedType) {
                existing.Type = mappedType;
                dirty = true;
            }
            if (existing.AllowsNull !== describedAllowsNull) {
                existing.AllowsNull = describedAllowsNull;
                dirty = true;
            }
            if (existing.IsRequired !== srcField.IsRequired) {
                existing.IsRequired = srcField.IsRequired;
                dirty = true;
            }
            if (existing.IsPrimaryKey !== srcField.IsPrimaryKey) {
                existing.IsPrimaryKey = srcField.IsPrimaryKey;
                dirty = true;
            }
            // Description: only fill if missing — curated descriptions outrank
            // generic describe output.
            if (!existing.Description && srcField.Description) {
                existing.Description = srcField.Description;
                dirty = true;
            }
            if (dirty) {
                const saved = await existing.Save();
                if (!saved) {
                    console.warn(
                        `[IntegrationSchemaSync] UpsertField save failed for '${srcField.Name}': ${existing.LatestResult?.CompleteMessage ?? 'unknown error'}`
                    );
                }
                return { Created: false, Updated: true };
            }
            return { Created: false, Updated: false };
        }

        // New custom field — create it
        try {
            const field = await md.GetEntityObject<MJIntegrationObjectFieldEntity>('MJ: Integration Object Fields', contextUser);
            field.NewRecord();
            field.IntegrationObjectID = objectID;
            field.Name = srcField.Name;
            field.DisplayName = srcField.Label || srcField.Name;
            if (srcField.Description) field.Description = srcField.Description;
            field.Type = MapSourceType(srcField.SourceType);
            field.AllowsNull = !srcField.IsRequired;
            field.IsPrimaryKey = srcField.IsPrimaryKey;
            field.IsRequired = srcField.IsRequired;
            field.IsReadOnly = false;
            field.IsUniqueKey = false;
            field.Status = 'Active';
            field.Set('IsCustom', true);
            field.Sequence = 999;
            const saved = await field.Save();
            return { Created: saved, Updated: false };
        } catch (err) {
            console.warn(`[IntegrationSchemaSync] Failed to create IntegrationObjectField '${srcField.Name}': ${err instanceof Error ? err.message : err}`);
        }
        return { Created: false, Updated: false };
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
