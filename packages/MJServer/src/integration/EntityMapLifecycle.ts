/**
 * @fileoverview Entity-map / field-map lifecycle helpers shared by the ApplyAll selection
 * path, the post-restart RSU pending-work consumer, and the schema-evolution refresh diff
 * Selection removal DISABLES (never deletes — data is kept), re-selection
 * re-enables, and a refresh's new objects arrive disabled-by-default.
 */
import { CompositeKey, IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import type {
    MJCompanyIntegrationEntityMapEntity,
    MJCompanyIntegrationFieldMapEntity,
    MJCompanyIntegrationSyncWatermarkEntity,
} from '@memberjunction/core-entities';

/**
 * Remove-as-disable: entity maps for this CompanyIntegration whose
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
 * its field maps. Used by the schema-evolution diff: NEW objects arrive
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
 * Re-add re-enables: flips every non-Active field map of an entity map back to
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
 * DAG-aware removal advisory (rsuplan "adding and removing tables"): when a removal
 * disables object X but a STILL-ACTIVE object depends on X (hard-FK or soft-FK parent edge —
 * the same edges the sync engine layers by), the dependents are NOT auto-removed; instead each
 * broken dependency is surfaced as a warning so a consumer can prompt the user to force-remove
 * (or re-add) them. Pure + deterministic for unit testing: callers supply the parent map.
 *
 * @param activeObjectNames  objects remaining active after the removal
 * @param removedObjectNames objects being removed/disabled this pass
 * @param parentsByLowerName object name (lowercased) → its parent object names (the DAG edges)
 * @returns one warning per active object that depends on ≥1 removed object
 */
export function ComputeRemovedDependencyWarnings(
    activeObjectNames: string[],
    removedObjectNames: string[],
    parentsByLowerName: Map<string, string[]>,
): string[] {
    if (removedObjectNames.length === 0 || activeObjectNames.length === 0) return [];
    const removedLower = new Set(removedObjectNames.map(n => n.toLowerCase()));
    const warnings: string[] = [];
    for (const name of activeObjectNames) {
        const parents = parentsByLowerName.get(name.toLowerCase()) ?? [];
        const cut = parents.filter(p => removedLower.has(p.toLowerCase()));
        if (cut.length > 0) {
            warnings.push(
                `Object '${name}' remains active but depends on removed object(s) ${cut.map(c => `'${c}'`).join(', ')} — ` +
                `its parent references cannot resolve until they return; review whether '${name}' should be removed too (force-remove) or the parent re-added.`
            );
        }
    }
    return warnings;
}

/**
 * DAG-aware FORCE-REMOVE (rsuplan "adding and removing tables": "a consumer may want the user
 * to force remove those too"): computes the TRANSITIVE closure of still-active objects that
 * depend — directly or through other dependents — on a removed object. Callers opting into
 * cascade removal disable this set alongside the removed objects (still remove-as-disable,
 * never delete; a re-add re-enables). Pure + deterministic for unit testing.
 *
 * @param activeObjectNames  objects remaining active after the (non-cascaded) removal
 * @param removedObjectNames objects being removed/disabled this pass
 * @param parentsByLowerName object name (lowercased) → its parent object names (the DAG edges)
 * @returns the active objects to cascade-disable, in dependency-discovery order
 */
export function ComputeCascadeRemovalSet(
    activeObjectNames: string[],
    removedObjectNames: string[],
    parentsByLowerName: Map<string, string[]>,
): string[] {
    if (removedObjectNames.length === 0 || activeObjectNames.length === 0) return [];
    const gone = new Set(removedObjectNames.map(n => n.toLowerCase()));
    const cascade: string[] = [];
    let grew = true;
    while (grew) {
        grew = false;
        for (const name of activeObjectNames) {
            const lower = name.toLowerCase();
            if (gone.has(lower)) continue; // already removed or already cascaded
            const parents = parentsByLowerName.get(lower) ?? [];
            if (parents.some(p => gone.has(p.toLowerCase()))) {
                gone.add(lower);
                cascade.push(name);
                grew = true;
            }
        }
    }
    return cascade;
}

/**
 * U10 schema-change: resets the PULL watermark for the given entity maps so the
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

/** One discovered source field, reduced to what the selection decision needs. */
export interface SelectableSourceField {
    Name: string;
    IsPrimaryKey?: boolean;
}

/**
 * Which discovered fields get a field map, given the user's column selection.
 *
 * A PRIMARY KEY field is ALWAYS mapped, selected or not. The table build already applies this rule
 * (`buildTargetConfigs`: `|| f.IsPrimaryKey`), so the key column exists in the table either way —
 * and without the same rule here, deselecting the key produced a table WITH its key column but no
 * field map carrying `IsKeyField`. The sync then had no identity to match on and silently fell back
 * to content-hash matching: nothing errored, records just stopped being recognised as the same
 * record across syncs.
 *
 * Nothing enforces selecting the key in the UI, and nothing should — identity is not a preference,
 * so the invariant belongs here rather than in a validation message.
 *
 * `null`/`undefined` selection means "all fields", which is not the same as an EMPTY selection —
 * an empty array is a real (if unusual) choice, and still yields the keys.
 */
export function selectFieldsToMap<T extends SelectableSourceField>(
    allFields: readonly T[],
    selectedFieldNames: readonly string[] | null | undefined,
): T[] {
    if (!selectedFieldNames) return [...allFields];
    const selected = new Set(selectedFieldNames.map(n => n.toLowerCase()));
    return allFields.filter(f => selected.has(f.Name.toLowerCase()) || f.IsPrimaryKey === true);
}

/** One existing field map, reduced to what the reconciliation decision needs. */
export interface ExistingFieldMapRead {
    SourceFieldName: string | null;
    Status: string | null;
}

/** What a refresh should do to one entity map's field maps. Names are the SOURCE field names. */
export interface FieldMapReconcilePlan {
    /** Source fields with no field map at all → create one, with this Status. */
    Create: Array<{ SourceFieldName: string; Status: 'Active' | 'Inactive' }>;
    /** Field maps whose source field is back in the resolution → re-enable. */
    Enable: string[];
    /** Field maps whose source field is no longer in the resolution → disable (never delete). */
    Disable: string[];
}

/**
 * Decides the field-map reconciliation for ONE entity map on a schema refresh.
 *
 * Pure so the three branches are pinned by tests rather than by a live refresh — the resolver that
 * calls this imports schema-builder and schema-engine, which makes it unimportable in a unit test,
 * so a decision left inline there is a decision nothing can check. Same reasoning as
 * `decideAbsentDeactivations` in the engine.
 *
 * The rules:
 *  - **New column → `Active`.** A refresh is an explicit request to bring the source's current shape
 *    in, so a column it finds is adopted rather than queued for approval. `autoEnableNewColumns:
 *    false` gates it for a connection that wants to review first.
 *
 *    This is REFRESH ONLY. A column first seen mid-SYNC is never auto-created — it is captured as a
 *    candidate with its statistics and needs acceptance before any DDL runs (see
 *    `CustomColumnPromoter`, `Configuration.autoPromoteCustomColumns`, default false). Refresh is a
 *    deliberate act; a sync is not, and must not reshape the schema on its own.
 *  - **The map bounds the column.** Nothing is Active on a map that is not enabled, flag or no flag.
 *  - **Re-added column → `Active`, ungated.** That row is not new; it was disabled because the source
 *    stopped reporting the column, so it returns to the state it had.
 *  - **Vanished column → `Inactive`, never deleted.** Retiring is reversible by the branch above.
 */
export function decideFieldMapReconcile(
    activeFieldNames: readonly string[],
    existing: readonly ExistingFieldMapRead[],
    mapEnabled: boolean,
    // Defaults to the CONTRACT (everything.txt): a refresh's new columns arrive disabled and
    // the user turns them on. An omitted argument must not silently adopt.
    autoEnableNewColumns = false,
): FieldMapReconcilePlan {
    const plan: FieldMapReconcilePlan = { Create: [], Enable: [], Disable: [] };
    const existingByLower = new Map(
        existing.map(fm => [(fm.SourceFieldName ?? '').toLowerCase(), fm] as const)
    );
    const activeLower = new Set(activeFieldNames.map(n => n.toLowerCase()));

    for (const name of activeFieldNames) {
        const found = existingByLower.get(name.toLowerCase());
        if (!found) {
            plan.Create.push({
                SourceFieldName: name,
                Status: mapEnabled && autoEnableNewColumns ? 'Active' : 'Inactive',
            });
        } else if (found.Status !== 'Active' && mapEnabled) {
            plan.Enable.push(found.SourceFieldName ?? name);
        }
    }
    for (const fm of existing) {
        const name = fm.SourceFieldName ?? '';
        if (fm.Status === 'Active' && !activeLower.has(name.toLowerCase())) {
            plan.Disable.push(name);
        }
    }
    return plan;
}

// ── Re-keying: when a connector upgrade changes what identifies a row ────────────────────────
//
// A connector release can change an object's primary key — PheedLoop 1.4.6 makes Attendees
// `code + eventCode` because the object is fetched once per event and an attendee at two events
// comes back twice with the same `code`.
//
// That is not an ordinary schema change. `BaseRESTIntegrationConnector.ToExternalRecord` builds
// `ExternalID` by joining every IsPrimaryKey field with '|' in Sequence order, so changing the key
// changes the identity of every row the source will ever send again. Nothing can match a row
// already stored: the RecordMap is keyed `EntityID|ExternalID`, and the fallback
// (`MatchEngine.FindByKeyFields`) queries the destination table by key fields that are NULL on
// rows written before the change. The next sync therefore inserts the whole source ALONGSIDE the
// rows already there, leaving two copies of everything and nothing to say which is current.
//
// So a re-key means the object's stored data has to go, and the source reloaded under the new
// identity. This is the same reasoning as U10's watermark reset one step further: not just
// "re-fetch everything", but "re-fetch everything into a table that is not holding rows the
// re-fetch can never reconcile with".

const ENTITY_RECORD_MAPS = 'MJ: Company Integration Record Maps';

/** A catalog or entity field, as much of one as the key decision needs. */
export interface KeyCandidateField {
    Name: string;
    IsPrimaryKey: boolean | null;
    Sequence: number | null;
}

/**
 * The key that decides identity, in the order identity uses.
 *
 * Deliberately NOT `SourceObjectInfo.PrimaryKeyFields`. That is built in
 * `buildSourceSchemaFromPersistedRows` as `fields.filter(f => f.IsPrimaryKey).map(f => f.Name)`
 * over `GetIntegrationObjectFields`, which returns rows in load order with NO Sequence sort — so
 * its order is not the order `ToExternalRecord` joins in, and comparing against it would miss a
 * reorder and could invent one.
 */
export function IdentityKeyFields(fields: ReadonlyArray<KeyCandidateField>): string[] {
    return fields
        .filter(f => f.IsPrimaryKey === true)
        .slice()
        .sort((a, b) => (a.Sequence ?? 0) - (b.Sequence ?? 0))
        .map(f => f.Name);
}

/**
 * Has the identity changed between the key the tables were BUILT with and the key the catalog
 * now declares?
 *
 * Ordered, not set-based: `code|eventCode` and `eventCode|code` are different identity strings,
 * so a key that keeps its columns and reorders them strands rows exactly like one that gains a
 * column.
 *
 * Returns false when the built key is EMPTY. That is "we could not read it", not "it had no key" —
 * an object genuinely without a key never had stable identities to strand, and treating unknown as
 * empty would re-key every table on a workspace whose entity metadata failed to load.
 */
export function DecideRekeyed(builtKey: readonly string[], catalogKey: readonly string[]): boolean {
    if (builtKey.length === 0) return false;
    const norm = (s: string) => (s ?? '').trim().toLowerCase();
    if (builtKey.length !== catalogKey.length) return true;
    return builtKey.some((n, i) => norm(n) !== norm(catalogKey[i]));
}

/**
 * Clear everything that ties a re-keyed object's stored rows to the source, so the next sync
 * rebuilds it: the record maps, then the rows themselves.
 *
 * Set-based, not row-by-row. `BaseEntity.Save()`/`Delete()` is roughly nine serialized round trips
 * per row, which is fine for a handful and unusable for a table with real data in it — and a
 * re-key can land on the biggest table a connector has. Same mechanism the engine's own run-history
 * retention uses (`IntegrationEngine.pruneRunHistory`): the provider's Dialect quotes both the
 * identifiers and the literals, so one statement is correct on SQL Server and Postgres alike.
 *
 * Order matters. Record maps first: if the row delete succeeds and the map delete then fails, the
 * maps point at rows that no longer exist and the next sync tries to UPDATE them, which fails per
 * record rather than re-inserting. Maps-first degrades the other way — worst case the rows survive
 * with no maps, which the next run resolves by re-inserting, i.e. exactly the state we were
 * heading for anyway.
 *
 * Returns the object names actually cleared. A failure is logged and the object is left out rather
 * than aborting the whole evolution — a table that could not be cleared must not silently look
 * like one that was.
 */
export async function ClearRekeyedObjectData(
    targets: ReadonlyArray<{
        ExternalObjectName: string;
        EntityMapID: string;
        EntityID: string;
        SchemaName: string;
        BaseTable: string;
    }>,
    companyIntegrationID: string,
    contextUser: UserInfo,
    md: IMetadataProvider,
): Promise<string[]> {
    const cleared: string[] = [];
    if (targets.length === 0) return cleared;

    // DatabaseProviderBase carries Dialect + ExecuteSQL; typed structurally so this module keeps
    // its existing import surface.
    const provider = md as unknown as {
        Dialect?: { QuoteIdentifier(s: string): string; QuoteStringLiteral(s: string): string };
        ExecuteSQL?: (
            sql: string, p?: unknown, o?: unknown, u?: UserInfo
        ) => Promise<unknown>;
    };
    const d = provider.Dialect;
    if (!d || typeof provider.ExecuteSQL !== 'function') {
        LogError('[EntityMapLifecycle] Cannot clear re-keyed objects: provider exposes no Dialect/ExecuteSQL');
        return cleared;
    }

    // Resolved from metadata, never spelled out. A hardcoded `__mj.CompanyIntegrationRecordMap`
    // would be a second place the schema is declared, and the one place nothing would update.
    const rmEntity = (md as unknown as { Entities?: ReadonlyArray<{ Name: string; SchemaName: string; BaseTable: string }> })
        .Entities?.find(e => e.Name === ENTITY_RECORD_MAPS);
    if (!rmEntity?.SchemaName || !rmEntity.BaseTable) {
        LogError(`[EntityMapLifecycle] Cannot clear re-keyed objects: '${ENTITY_RECORD_MAPS}' is not registered`);
        return cleared;
    }
    const recordMaps = `${d.QuoteIdentifier(rmEntity.SchemaName)}.${d.QuoteIdentifier(rmEntity.BaseTable)}`;

    const ci = d.QuoteStringLiteral(String(companyIntegrationID));
    for (const t of targets) {
        if (!t.SchemaName || !t.BaseTable || !t.EntityID) {
            LogError(`[EntityMapLifecycle] Skipping re-key clear for ${t.ExternalObjectName}: no resolved table`);
            continue;
        }
        try {
            await provider.ExecuteSQL(
                `DELETE FROM ${recordMaps} WHERE ${d.QuoteIdentifier('CompanyIntegrationID')}=${ci} ` +
                `AND ${d.QuoteIdentifier('EntityID')}=${d.QuoteStringLiteral(String(t.EntityID))}`,
                undefined, undefined, contextUser
            );
            const table = `${d.QuoteIdentifier(t.SchemaName)}.${d.QuoteIdentifier(t.BaseTable)}`;
            await provider.ExecuteSQL(`DELETE FROM ${table}`, undefined, undefined, contextUser);
            cleared.push(t.ExternalObjectName);
        } catch (err) {
            LogError(
                `[EntityMapLifecycle] Failed to clear re-keyed object ${t.ExternalObjectName}: ` +
                `${err instanceof Error ? err.message : String(err)}`
            );
        }
    }
    return cleared;
}
