/**
 * @fileoverview Entity-map / field-map lifecycle helpers shared by the ApplyAll selection
 * path, the post-restart RSU pending-work consumer, and the schema-evolution refresh diff
 * (RSU spec): selection removal DISABLES (never deletes — data is kept), re-selection
 * re-enables, and a refresh's new objects arrive disabled-by-default.
 */
import { CompositeKey, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntityMapEntity,
    MJCompanyIntegrationFieldMapEntity,
    MJCompanyIntegrationSyncWatermarkEntity,
} from '@memberjunction/core-entities';

/**
 * RSU-spec remove-as-disable: entity maps for this CompanyIntegration whose
 * ExternalObjectName is NOT in the selected set are set `Status='Inactive'` +
 * `SyncEnabled=false`, and their Active field maps are disabled with them. Data and
 * tables are KEPT — a later re-selection re-enables everything (see
 * {@link ReenableFieldMapsForEntityMap} + the ApplyAll create-or-reuse path).
 *
 * @returns the ExternalObjectNames actually disabled this call.
 */
export async function DisableUnselectedEntityMaps(
    companyIntegrationID: string,
    selectedExternalObjectNames: string[],
    contextUser: UserInfo,
    md: IMetadataProvider,
): Promise<string[]> {
    const selected = new Set(selectedExternalObjectNames.map(n => n.toLowerCase()));
    const disabled: string[] = [];

    const maps = await new RunView().RunView<MJCompanyIntegrationEntityMapEntity>({
        EntityName: 'MJ: Company Integration Entity Maps',
        ExtraFilter: `CompanyIntegrationID='${companyIntegrationID.replace(/'/g, "''")}'`,
        ResultType: 'entity_object',
        BypassCache: true, // lifecycle decisions must read committed state
    }, contextUser);
    if (!maps.Success) return disabled;

    for (const em of maps.Results) {
        const name = (em.ExternalObjectName ?? '').toLowerCase();
        if (!name || selected.has(name)) continue;
        if (em.Status === 'Inactive' && em.SyncEnabled === false) continue; // already off
        em.Status = 'Inactive';
        em.SyncEnabled = false;
        if (!await em.Save()) {
            LogError(`[EntityMapLifecycle] Failed to disable entity map for '${em.ExternalObjectName}': ${em.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            continue;
        }
        await SetFieldMapsStatus(em.ID, 'Inactive', contextUser, md);
        disabled.push(em.ExternalObjectName ?? em.ID);
    }
    return disabled;
}

/**
 * Sets one entity map's enabled state (Status + SyncEnabled) and cascades the same status to
 * its field maps. Used by the schema-evolution diff (RSU spec): NEW objects arrive
 * `enabled=false` by default (the user turns them on after the refresh; autoEnableNewObjects
 * opts into enabled=true).
 */
export async function SetEntityMapEnabled(
    entityMapID: string,
    enabled: boolean,
    contextUser: UserInfo,
    md: IMetadataProvider,
): Promise<boolean> {
    const em = await md.GetEntityObject<MJCompanyIntegrationEntityMapEntity>('MJ: Company Integration Entity Maps', contextUser);
    if (!await em.InnerLoad(CompositeKey.FromID(entityMapID))) return false;
    em.Status = enabled ? 'Active' : 'Inactive';
    em.SyncEnabled = enabled;
    if (!await em.Save()) {
        LogError(`[EntityMapLifecycle] Failed to set entity map ${entityMapID} enabled=${enabled}: ${em.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        return false;
    }
    await SetFieldMapsStatus(entityMapID, enabled ? 'Active' : 'Inactive', contextUser, md);
    return true;
}

/**
 * RSU-spec re-add-re-enables: flips every non-Active field map of an entity map back to
 * Active. Called when a previously-removed (disabled) object is re-selected — the entity
 * map itself is re-activated by the caller's create-or-reuse; this brings its field maps
 * back with it.
 */
export async function ReenableFieldMapsForEntityMap(
    entityMapID: string,
    contextUser: UserInfo,
    md: IMetadataProvider,
): Promise<number> {
    return SetFieldMapsStatus(entityMapID, 'Active', contextUser, md);
}

/** Sets every field map of an entity map to the given status (skips rows already there). */
async function SetFieldMapsStatus(
    entityMapID: string,
    status: 'Active' | 'Inactive',
    contextUser: UserInfo,
    md: IMetadataProvider,
): Promise<number> {
    const fms = await new RunView().RunView<MJCompanyIntegrationFieldMapEntity>({
        EntityName: 'MJ: Company Integration Field Maps',
        ExtraFilter: `EntityMapID='${entityMapID.replace(/'/g, "''")}'`,
        ResultType: 'entity_object',
        BypassCache: true,
    }, contextUser);
    if (!fms.Success) return 0;
    let changed = 0;
    for (const fm of fms.Results) {
        if (fm.Status === status) continue;
        fm.Status = status;
        if (await fm.Save()) changed++;
        else LogError(`[EntityMapLifecycle] Failed to set field map '${fm.SourceFieldName}' to ${status}: ${fm.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return changed;
}

/**
 * U10 / RSU-spec §schema-change: resets the PULL watermark for the given entity maps so the
 * next sync ignores the incremental cursor, re-fetches the full object, and BACKFILLS rows
 * for newly-added columns (content-hash keeps genuinely-unchanged mapped values write-free
 * only when the mapped set is unchanged — a schema change alters the mapped set, so changed
 * rows rewrite exactly once). Nulling the value (not deleting the row) keeps bookkeeping.
 */
export async function ResetPullWatermarks(
    entityMapIDs: string[],
    contextUser: UserInfo,
    md: IMetadataProvider,
): Promise<string[]> {
    const reset: string[] = [];
    if (entityMapIDs.length === 0) return reset;
    const inList = entityMapIDs.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    const wms = await new RunView().RunView<{ ID: string; EntityMapID: string }>({
        EntityName: 'MJ: Company Integration Sync Watermarks',
        ExtraFilter: `EntityMapID IN (${inList}) AND Direction='Pull'`,
        Fields: ['ID', 'EntityMapID'],
        ResultType: 'simple',
        BypassCache: true,
    }, contextUser);
    if (!wms.Success) return reset;
    for (const row of wms.Results) {
        const wm = await md.GetEntityObject<MJCompanyIntegrationSyncWatermarkEntity>(
            'MJ: Company Integration Sync Watermarks', contextUser
        );
        if (!await wm.InnerLoad(CompositeKey.FromID(row.ID))) continue;
        wm.WatermarkValue = null;
        if (await wm.Save()) reset.push(row.EntityMapID);
        else LogError(`[EntityMapLifecycle] Failed to reset watermark for entity map ${row.EntityMapID}: ${wm.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return reset;
}
