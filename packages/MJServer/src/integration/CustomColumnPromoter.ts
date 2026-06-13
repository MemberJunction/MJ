/**
 * Post-sync custom-column promoter (gaps.md §2 / M2b-server).
 *
 * Registered onto {@link IntegrationEngine} as the post-sync schema-promotion hook (the engine
 * itself has no dependency on RSU/CodeGen — see SetPostSyncSchemaPromotionCallback). After a
 * sync drains, the engine invokes this for the synced entities; here we:
 *
 *   1. GATE — sample the overflow column per entity. No overflow rows → no work (this is what
 *      keeps a customs-free sync single-stage / 1×; your hard rule).
 *   2. PLAN — {@link buildOverflowStats} + {@link planPromotions} decide which keys earn a real
 *      column and the generously-bounded type for each (pure engine logic, unit-tested).
 *   3. PROMOTE — for the winners: ADD COLUMN via {@link DDLGenerator} + {@link RuntimeSchemaManager}
 *      (CodeGen reflects the column into a real EntityField), an IOF row per field (IsCustom,
 *      MetadataSource='Discovered'), and a field map so the next sync maps it natively → the
 *      capture/promote loop terminates.
 *
 * DIALECT PARITY (crucial, per PR #2752): the coverage scan is RunView (dialect-agnostic); DDL
 * goes through DDLGenerator driven by provider.PlatformKey ('sqlserver' | 'postgresql'); RSU has
 * dual SS/PG setup; IOF + field map are BaseEntity. No SS-only SQL anywhere in this file.
 *
 * The MJAPI restart (so the new column is exposed over GraphQL) + the JSON spread of staged
 * values into the new columns are M3 — this stage applies the schema only (SkipRestart).
 */
import {
    LogError,
    LogStatus,
    Metadata,
    RunView,
    type UserInfo,
    type IMetadataProvider,
    type DatabaseProviderBase,
    type EntityInfo,
} from '@memberjunction/core';
import {
    IntegrationEngine,
    CUSTOM_OVERFLOW_COLUMN,
    CONTENT_HASH_COLUMN,
    computeContentHash,
    buildOverflowStats,
    planPromotions,
    sanitizeColumnName,
    type SchemaPromotionResult,
    type PromotionCandidate,
} from '@memberjunction/integration-engine';
import type { BaseEntity } from '@memberjunction/core';
import { DDLGenerator, type TargetColumnConfig, type DatabasePlatform } from '@memberjunction/integration-schema-builder';
import { RuntimeSchemaManager, type RSUPipelineInput } from '@memberjunction/schema-engine';
import {
    MJCompanyIntegrationEntity,
    MJCompanyIntegrationEntityMapEntity,
    MJCompanyIntegrationFieldMapEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';

/** Max rows sampled from the overflow column to compute coverage + infer types (bounded memory). */
const OVERFLOW_SAMPLE_SIZE = 1000;

/**
 * Max columns promoted in a SINGLE pass, so a feed that suddenly exposes hundreds of distinct
 * high-coverage keys can't mint hundreds of columns in one sync (bounded schema churn). The
 * remainder is logged + deferred; it promotes on subsequent syncs (the keys stay captured).
 */
const MAX_PROMOTIONS_PER_PASS = 25;

/** A coverage-passing key with its resolved column + what work it still needs (M4: promote OR recover). */
interface WorkItem {
    candidate: PromotionCandidate;
    /** Original source key — the field map's SourceFieldName + the IOF Name. */
    sourceKey: string;
    /** Sanitized, collision-resolved column / DestinationFieldName / EntityField name. */
    columnName: string;
    /** The real DB column does not exist yet → needs ADD COLUMN. */
    needsColumn: boolean;
    /** No active field map for this source key → needs one (covers the partial-promotion crash window). */
    needsFieldMap: boolean;
}

/** Registers the post-sync custom-column promotion hook on the IntegrationEngine singleton. */
export function registerIntegrationCustomColumnPromoter(): void {
    IntegrationEngine.Instance.SetPostSyncSchemaPromotionCallback(async (ctx) => {
        const user = ctx.ContextUser as UserInfo;
        const provider = ctx.Provider as IMetadataProvider | undefined;
        // GATE — promotion runs RSU (ADD COLUMN + register EntityField) + restart, which is disruptive.
        // It is OPT-IN per connection (DEFAULT OFF): by default a sync only CAPTURES unmapped fields into
        // the overflow column; the user triggers promotion on demand via IntegrationPromoteCustomColumns
        // (after reviewing IntegrationListCustomColumnCandidates). Set Configuration.autoPromoteCustomColumns=true
        // to restore automatic post-sync promotion. (Capture is unconditional; only the RSU step is gated.)
        if (!(await readAutoPromoteFlag(ctx.CompanyIntegrationID, user, provider))) {
            LogStatus(
                `[CustomColumnPromoter] Auto-promote OFF for CI ${ctx.CompanyIntegrationID} — unmapped fields captured to ` +
                `the overflow column; awaiting on-demand promotion (IntegrationPromoteCustomColumns).`
            );
            return { Promoted: false, ColumnsAdded: [], SchemaUpdatePending: false };
        }
        const promoter = new IntegrationCustomColumnPromoter(user, provider);
        return promoter.PromoteForSync(ctx.CompanyIntegrationID, ctx.SyncedEntityNames);
    });
    LogStatus('[CustomColumnPromoter] Registered post-sync custom-column promotion hook (auto-promote opt-in, default OFF).');
}

/** Reads the per-connection `autoPromoteCustomColumns` flag (default false = capture-only, on-demand promotion). */
async function readAutoPromoteFlag(companyIntegrationID: string, user: UserInfo, provider?: IMetadataProvider): Promise<boolean> {
    try {
        const md = provider ?? Metadata.Provider;
        const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', user);
        if (!(await ci.Load(companyIntegrationID)) || !ci.Configuration) return false;
        return (JSON.parse(ci.Configuration) as { autoPromoteCustomColumns?: boolean }).autoPromoteCustomColumns === true;
    } catch { return false; }
}

const NOT_PROMOTED: SchemaPromotionResult = { Promoted: false, ColumnsAdded: [], SchemaUpdatePending: false };

/**
 * Orchestrates promotion for one sync run. One instance per invocation (carries the per-sync
 * context user + provider so it respects the bound provider, never the global default blindly).
 */
export class IntegrationCustomColumnPromoter {
    constructor(
        private readonly user: UserInfo,
        private readonly providerOverride?: IMetadataProvider,
    ) {}

    private get provider(): IMetadataProvider {
        return this.providerOverride ?? Metadata.Provider;
    }

    private get dbProvider(): DatabaseProviderBase {
        return this.provider as unknown as DatabaseProviderBase;
    }

    /** Entry point: promote custom columns for every entity touched by the sync. */
    public async PromoteForSync(
        companyIntegrationID: string,
        syncedEntityNames: string[],
    ): Promise<SchemaPromotionResult> {
        const integrationID = await this.resolveIntegrationID(companyIntegrationID);
        if (!integrationID) return NOT_PROMOTED;

        const columnsAdded: Array<{ EntityName: string; ColumnName: string }> = [];
        for (const entityName of syncedEntityNames) {
            try {
                const added = await this.promoteEntity(companyIntegrationID, integrationID, entityName);
                columnsAdded.push(...added);
            } catch (err) {
                // One entity's promotion failure must not abort the others, and never the sync.
                LogError(`[CustomColumnPromoter] Promotion failed for entity '${entityName}': ${this.msg(err)}`);
            }
        }

        const promoted = columnsAdded.length > 0;
        if (promoted) {
            // Make the freshly-created EntityFields visible in-process for the next sync's mapping.
            try { await this.provider.Refresh(); } catch (err) { LogError(`[CustomColumnPromoter] provider.Refresh failed: ${this.msg(err)}`); }
        }
        return { Promoted: promoted, ColumnsAdded: columnsAdded, SchemaUpdatePending: promoted };
    }

    /** Gate → plan → promote for a single target entity. Returns the columns it added. */
    private async promoteEntity(
        companyIntegrationID: string,
        integrationID: string,
        entityName: string,
    ): Promise<Array<{ EntityName: string; ColumnName: string }>> {
        const planned = await this.planWorkForEntity(companyIntegrationID, entityName);
        if (!planned || planned.work.length === 0) return []; // no overflow / no entity map / already converged
        const { entityInfo, entityMap } = planned;
        let work = planned.work;

        // M4a: bound schema churn per pass — the remainder stays captured and promotes next sync.
        if (work.length > MAX_PROMOTIONS_PER_PASS) {
            LogStatus(`[CustomColumnPromoter] ${work.length} candidates on ${entityName}; promoting ${MAX_PROMOTIONS_PER_PASS} this pass, ${work.length - MAX_PROMOTIONS_PER_PASS} deferred to next sync.`);
            work = work.slice(0, MAX_PROMOTIONS_PER_PASS);
        }

        // 4. PROMOTE: ADD COLUMN+CodeGen (only the keys that need a column) → IOF rows → field maps → spread.
        const newColumns = work.filter(w => w.needsColumn);
        if (newColumns.length > 0 && !await this.applySchemaChange(entityInfo, newColumns)) {
            return []; // DDL failed — leave everything captured; retry next sync (no partial commit lost)
        }
        await this.createIntegrationObjectFields(integrationID, entityMap.ExternalObjectName, work);
        await this.createFieldMaps(entityMap.ID, work.filter(w => w.needsFieldMap));
        // M3: spread staged values into the real columns + re-baseline the content hash.
        // CRITICAL: refresh metadata FIRST. applySchemaChange just added the columns AND had RSU
        // regenerate the spUpdate sproc to include them — but the running provider's in-memory entity
        // metadata still predates the column add (the Refresh at the top ran before it). Without this,
        // the spread's row.Save() builds a sproc call from the STALE field list that doesn't match the
        // regenerated sproc → "Error executing SQL" (the spread-save failures). Re-loading metadata
        // here aligns the entity's field set with the new DB sproc so the backfill saves succeed.
        try { await this.provider.Refresh(); } catch (err) { LogError(`[CustomColumnPromoter] pre-spread Refresh failed: ${this.msg(err)}`); }
        const refreshedEntityInfo = this.provider.EntityByName(entityName) ?? entityInfo;
        await this.spreadAndRebaseline(entityName, entityMap.ID, refreshedEntityInfo, work);

        LogStatus(`[CustomColumnPromoter] Promoted/recovered ${work.length} custom column(s) on ${entityName}: ${work.map(w => w.columnName).join(', ')}`);
        return work.map(w => ({ EntityName: entityName, ColumnName: w.columnName }));
    }

    /**
     * Dry-run of GATE → scan → PLAN → resolve-work for ONE entity, WITHOUT applying any schema change.
     * Shared by {@link promoteEntity} (which then PROMOTES the work) and {@link ListCandidates} (which only
     * reports it). Returns null when the entity has no overflow column / no captured customs / no entity map.
     * Because the work list is computed live (overflow keys minus already-column-and-mapped), re-running is
     * inherently deduped — a concurrent discovery that already promoted a key yields no work item for it.
     */
    private async planWorkForEntity(
        companyIntegrationID: string,
        entityName: string,
    ): Promise<{ entityInfo: EntityInfo; entityMap: { ID: string; ExternalObjectName: string }; work: WorkItem[] } | null> {
        const entityInfo = this.provider.EntityByName(entityName);
        if (!entityInfo?.SchemaName || !entityInfo.BaseTable) return null;
        // No overflow column on this table (predates the feature) → nothing to promote.
        if (!entityInfo.Fields.some(f => f.Name === CUSTOM_OVERFLOW_COLUMN)) return null;

        const overflowJson = await this.scanOverflow(entityName);
        if (overflowJson.length === 0) return null; // no customs captured

        const passing = planPromotions(buildOverflowStats(overflowJson), {});
        if (passing.length === 0) return null;

        const entityMap = await this.findEntityMap(companyIntegrationID, entityName);
        if (!entityMap) {
            LogError(`[CustomColumnPromoter] No entity map for ${entityName} on CI ${companyIntegrationID}.`);
            return null;
        }

        // Skip fully-terminated keys (column + field map both exist); keep promote (needs column) / recover.
        const fieldMapSources = await this.activeFieldMapSources(entityMap.ID);
        const work = this.resolveWorkItems(passing, entityInfo, fieldMapSources);
        return { entityInfo, entityMap, work };
    }

    /**
     * Lists the custom-column CANDIDATES for one entity — the "new columns found" awaiting promotion,
     * computed live from the overflow column minus already-mapped/already-a-column keys (inherently deduped).
     * READ-ONLY: no schema change, no RSU. Backs `IntegrationListCustomColumnCandidates`.
     */
    public async ListCandidates(
        companyIntegrationID: string,
        entityName: string,
    ): Promise<Array<{ EntityName: string; SourceKey: string; ColumnName: string; InferredType: string; NeedsColumn: boolean }>> {
        const planned = await this.planWorkForEntity(companyIntegrationID, entityName);
        if (!planned) return [];
        return planned.work.map(w => ({
            EntityName: entityName,
            SourceKey: w.sourceKey,
            ColumnName: w.columnName,
            InferredType: w.candidate.Inferred.SchemaFieldType,
            NeedsColumn: w.needsColumn,
        }));
    }

    /** Samples the overflow column (rows where it is non-null) — dialect-agnostic via RunView. */
    private async scanOverflow(entityName: string): Promise<Array<string | null>> {
        const rv = new RunView();
        const res = await rv.RunView<Record<string, unknown>>({
            EntityName: entityName,
            Fields: [CUSTOM_OVERFLOW_COLUMN],
            ExtraFilter: `${CUSTOM_OVERFLOW_COLUMN} IS NOT NULL`,
            MaxRows: OVERFLOW_SAMPLE_SIZE,
            ResultType: 'simple',
        }, this.user);
        if (!res.Success) {
            LogError(`[CustomColumnPromoter] Overflow scan failed for ${entityName}: ${res.ErrorMessage}`);
            return [];
        }
        return (res.Results ?? []).map(r => (r[CUSTOM_OVERFLOW_COLUMN] as string | null) ?? null);
    }

    /**
     * Splits coverage-passing keys into actionable work items, dropping any that are fully
     * terminated (column AND field map both exist). A key whose column exists but whose field
     * map is missing becomes a RECOVERY item (covers the crash window between ADD COLUMN and the
     * field-map write) — needsColumn=false, needsFieldMap=true.
     */
    private resolveWorkItems(
        passing: PromotionCandidate[],
        entityInfo: EntityInfo,
        fieldMapSources: ReadonlySet<string>,
    ): WorkItem[] {
        const existingByLower = new Map(entityInfo.Fields.map(f => [f.Name.toLowerCase(), f.Name]));
        const taken = new Set(entityInfo.Fields.map(f => f.Name.toLowerCase()));
        const items: WorkItem[] = [];
        for (const candidate of passing) {
            const existingCol = existingByLower.get(sanitizeColumnName(candidate.Key).toLowerCase());
            const hasColumn = !!existingCol;
            const hasFieldMap = fieldMapSources.has(candidate.Key.toLowerCase());
            if (hasColumn && hasFieldMap) continue; // terminated — nothing to do
            const columnName = existingCol ?? this.uniqueColumnName(sanitizeColumnName(candidate.Key), taken);
            if (!hasColumn) taken.add(columnName.toLowerCase());
            items.push({ candidate, sourceKey: candidate.Key, columnName, needsColumn: !hasColumn, needsFieldMap: !hasFieldMap });
        }
        return items;
    }

    /** Active field-map SOURCE field names for an entity map (lowercased) — for the terminate/recovery check. */
    private async activeFieldMapSources(entityMapID: string): Promise<ReadonlySet<string>> {
        const rv = new RunView();
        const res = await rv.RunView<MJCompanyIntegrationFieldMapEntity>({
            EntityName: 'MJ: Company Integration Field Maps',
            ExtraFilter: `EntityMapID='${entityMapID}' AND Status='Active'`,
            Fields: ['SourceFieldName'],
            ResultType: 'simple',
        }, this.user);
        return new Set(res.Success ? (res.Results ?? []).map(r => (r.SourceFieldName ?? '').toLowerCase()) : []);
    }

    /** Suffixes _2, _3, … until the sanitized name does not collide with an existing/assigned one. */
    private uniqueColumnName(base: string, taken: Set<string>): string {
        if (!taken.has(base.toLowerCase())) return base;
        for (let i = 2; i < 1000; i++) {
            const candidate = `${base}_${i}`;
            if (!taken.has(candidate.toLowerCase())) return candidate;
        }
        return `${base}_${Date.now() % 100000}`; // pathological fallback (never expected)
    }

    /** Generates ADD COLUMN DDL for the new columns and runs it through RSU (CodeGen reflects them). */
    private async applySchemaChange(entityInfo: EntityInfo, named: WorkItem[]): Promise<boolean> {
        const platform = this.dbProvider.PlatformKey as DatabasePlatform;
        const ddl = new DDLGenerator();
        const statements = named.map(n =>
            ddl.GenerateAlterTableAddColumn(
                entityInfo.SchemaName,
                entityInfo.BaseTable,
                this.toTargetColumn(n, platform),
                platform,
            ),
        );
        const input: RSUPipelineInput = {
            MigrationSQL: statements.join('\n'),
            Description: `Promote ${named.length} custom column(s) on ${entityInfo.Name}`,
            AffectedTables: [`${entityInfo.SchemaName}.${entityInfo.BaseTable}`],
            // M3 owns the restart-signal + restart; this stage applies schema only. Runtime
            // promotion creates no git commit (the dev RSU flow does; a per-sync commit is noise).
            SkipRestart: true,
            SkipGitCommit: true,
        };
        const result = await RuntimeSchemaManager.Instance.RunPipeline(input);
        if (!result.Success) {
            LogError(`[CustomColumnPromoter] RSU ADD COLUMN failed on ${entityInfo.Name}: ${result.ErrorMessage ?? result.ErrorStep ?? 'unknown'}`);
        }
        return result.Success;
    }

    /** Builds a per-platform TargetColumnConfig from a planned candidate. */
    private toTargetColumn(n: WorkItem, platform: DatabasePlatform): TargetColumnConfig {
        const inferred = n.candidate.Inferred;
        return {
            SourceFieldName: n.sourceKey,
            TargetColumnName: n.columnName,
            TargetSqlType: platform === 'sqlserver' ? inferred.SqlServerType : inferred.PostgresType,
            IsNullable: true, // customs are always nullable (never fabricate NOT NULL)
            MaxLength: inferred.MaxLength,
            Precision: null,
            Scale: null,
            DefaultValue: null,
        };
    }

    /** Creates an IOF row per promoted field (IsCustom, MetadataSource='Discovered'). */
    private async createIntegrationObjectFields(
        integrationID: string,
        externalObjectName: string,
        named: WorkItem[],
    ): Promise<void> {
        const objectID = await this.resolveIntegrationObjectID(integrationID, externalObjectName);
        if (!objectID) {
            LogError(`[CustomColumnPromoter] No IntegrationObject '${externalObjectName}' for integration ${integrationID}; IOF rows skipped.`);
            return;
        }
        // Lookup-or-reactivate-or-create — NEVER blind-create over an existing field. A field the source
        // dropped is DEACTIVATED (Status='Inactive'), not deleted, and its column is preserved. When that
        // key reappears in the payload and reaches promotion, the IOF already exists: reactivate it (so the
        // active-filtered ApplyAll re-materializes the still-present column) instead of creating a duplicate.
        // This is the "removed-then-re-added" case + the recovery case (column existed, field map missing).
        const existingIOFs = await this.existingIOFsByName(objectID);
        for (const n of named) {
            const existing = existingIOFs.get(n.sourceKey.toLowerCase());
            if (existing) {
                if (existing.Status !== 'Active') {
                    const reIof = await this.provider.GetEntityObject<MJIntegrationObjectFieldEntity>('MJ: Integration Object Fields', this.user);
                    if (await reIof.Load(existing.ID)) {
                        reIof.Status = 'Active';
                        const ok = await reIof.Save();
                        if (!ok) LogError(`[CustomColumnPromoter] Failed to reactivate IOF '${n.sourceKey}': ${reIof.LatestResult?.CompleteMessage ?? 'unknown'}`);
                    }
                }
                continue;
            }
            const iof = await this.provider.GetEntityObject<MJIntegrationObjectFieldEntity>('MJ: Integration Object Fields', this.user);
            iof.NewRecord();
            iof.IntegrationObjectID = objectID;
            iof.Name = n.sourceKey;
            iof.DisplayName = n.sourceKey;
            iof.Description = `Custom field discovered during sync; promoted to column ${n.columnName}.`;
            iof.Type = n.candidate.Inferred.SchemaFieldType;
            iof.Length = n.candidate.Inferred.MaxLength;
            iof.AllowsNull = true;
            iof.IsPrimaryKey = false;   // never fabricated for customs (deferred to D4)
            iof.IsUniqueKey = false;
            iof.IsReadOnly = false;
            iof.IsRequired = false;
            iof.IsCustom = true;
            // Provenance is STAMPED by this write path, never inferred later. 'Discovered' = the
            // system found it automatically (vs 'Declared' curated / 'Custom' customer-added). The
            // Configuration marker records the finer truth: it was data-sampled from a flat-file
            // feed (not an authoritative describe endpoint) with this coverage, and its type was
            // INFERRED — so consumers can treat it as soft / safely re-typable.
            iof.MetadataSource = 'Discovered';
            iof.Configuration = JSON.stringify({
                promotedFrom: 'overflow',
                coverage: Number(n.candidate.Coverage.toFixed(3)),
                typeInferredFromData: true,
            });
            iof.Status = 'Active';
            if (!await iof.Save()) {
                LogError(`[CustomColumnPromoter] IOF save failed for ${n.sourceKey}: ${iof.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }
        }
    }

    /** Creates a field map (source key → new column) so the next sync maps natively → terminate. */
    private async createFieldMaps(entityMapID: string, named: WorkItem[]): Promise<void> {
        for (const n of named) {
            const fm = await this.provider.GetEntityObject<MJCompanyIntegrationFieldMapEntity>('MJ: Company Integration Field Maps', this.user);
            fm.NewRecord();
            fm.EntityMapID = entityMapID;
            fm.SourceFieldName = n.sourceKey;
            fm.DestinationFieldName = n.columnName;
            fm.IsKeyField = false;
            fm.IsRequired = false;
            fm.Status = 'Active';
            if (!await fm.Save()) {
                LogError(`[CustomColumnPromoter] Field map save failed for ${n.sourceKey}: ${fm.LatestResult?.CompleteMessage ?? 'unknown'}`);
            }
        }
    }

    /**
     * Spreads the staged overflow JSON values into the freshly-created real columns, then
     * re-baselines the content hash (gaps.md §2 step 3). JS per-row pass — dialect-agnostic (no
     * cast SQL, which is where PG bugs hide); BaseEntity handles the dialect on write. The overflow
     * column is intentionally NOT cleared: once the field map exists the key is no longer "unmapped",
     * so the next sync stops re-capturing it and planPromotions skips the now-existing column — the
     * stale value self-heals. Bounded to rows that carry overflow, paged, once on the discovery sync.
     */
    private async spreadAndRebaseline(
        entityName: string,
        entityMapID: string,
        entityInfo: EntityInfo,
        named: WorkItem[],
    ): Promise<void> {
        const hasHashCol = entityInfo.Fields.some(f => f.Name === CONTENT_HASH_COLUMN);
        const mappedDestFields = hasHashCol ? await this.activeDestinationFields(entityMapID) : [];

        let startRow = 0;
        const pageSize = 500;
        for (;;) {
            const rv = new RunView();
            const res = await rv.RunView<BaseEntity>({
                EntityName: entityName,
                ExtraFilter: `${CUSTOM_OVERFLOW_COLUMN} IS NOT NULL`,
                ResultType: 'entity_object',
                MaxRows: pageSize,
                StartRow: startRow,
            }, this.user);
            if (!res.Success) {
                LogError(`[CustomColumnPromoter] Spread scan failed for ${entityName}: ${res.ErrorMessage}`);
                return;
            }
            const rows = res.Results ?? [];
            for (const row of rows) {
                await this.spreadOneRow(row, named, hasHashCol, mappedDestFields);
            }
            if (rows.length < pageSize) break;
            startRow += pageSize;
        }
    }

    /** Applies the staged values + re-baselined hash to a single row entity and saves it. */
    private async spreadOneRow(
        row: BaseEntity,
        named: WorkItem[],
        hasHashCol: boolean,
        mappedDestFields: string[],
    ): Promise<void> {
        // Dynamic .Get/.Set is REQUIRED here: these columns were created at runtime and have no
        // generated typed property in this still-running process (full typed access arrives on the
        // post-promotion restart). This is the sanctioned exception to the no-.Get/.Set rule.
        const overflow = this.parseOverflow(row.Get(CUSTOM_OVERFLOW_COLUMN));
        if (!overflow) return;
        let changed = false;
        for (const n of named) {
            if (Object.prototype.hasOwnProperty.call(overflow, n.sourceKey)) {
                row.Set(n.columnName, overflow[n.sourceKey]);
                changed = true;
            }
        }
        if (!changed) return;
        if (hasHashCol) {
            // Re-baseline to the next-sync value: hash over all active mapped destination columns
            // (now incl. the new ones) as they sit on the row — matches what the next sync computes.
            const mapped: Record<string, unknown> = {};
            for (const dest of mappedDestFields) mapped[dest] = row.Get(dest);
            row.Set(CONTENT_HASH_COLUMN, computeContentHash(mapped));
        }
        if (!await row.Save()) {
            LogError(`[CustomColumnPromoter] Spread save failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
        }
    }

    /** Active field-map destination column names for an entity map (for hash re-baseline). */
    private async activeDestinationFields(entityMapID: string): Promise<string[]> {
        const rv = new RunView();
        const res = await rv.RunView<MJCompanyIntegrationFieldMapEntity>({
            EntityName: 'MJ: Company Integration Field Maps',
            ExtraFilter: `EntityMapID='${entityMapID}' AND Status='Active'`,
            Fields: ['DestinationFieldName'],
            ResultType: 'simple',
        }, this.user);
        return res.Success ? (res.Results ?? []).map(r => r.DestinationFieldName).filter(Boolean) : [];
    }

    private parseOverflow(raw: unknown): Record<string, unknown> | null {
        if (typeof raw !== 'string' || raw.length === 0) return null;
        try {
            const parsed: unknown = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
        } catch {
            return null;
        }
    }

    /** Loads the CompanyIntegration's IntegrationID. */
    private async resolveIntegrationID(companyIntegrationID: string): Promise<string | null> {
        const ci = await this.provider.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', this.user);
        const loaded = await ci.Load(companyIntegrationID);
        return loaded ? ci.IntegrationID : null;
    }

    /** Finds the entity map (ExternalObject↔Entity) for this CI + target entity. */
    private async findEntityMap(
        companyIntegrationID: string,
        entityName: string,
    ): Promise<{ ID: string; ExternalObjectName: string } | null> {
        const rv = new RunView();
        const res = await rv.RunView<MJCompanyIntegrationEntityMapEntity>({
            EntityName: 'MJ: Company Integration Entity Maps',
            ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}' AND Entity='${this.escape(entityName)}'`,
            ResultType: 'simple',
            MaxRows: 1,
        }, this.user);
        const row = res.Success ? res.Results?.[0] : undefined;
        return row ? { ID: row.ID, ExternalObjectName: row.ExternalObjectName } : null;
    }

    /** Existing IOF field names (lowercased) for an object — for idempotent IOF creation. */
    private async existingIOFsByName(objectID: string): Promise<ReadonlyMap<string, { ID: string; Status: string }>> {
        const rv = new RunView();
        const res = await rv.RunView<MJIntegrationObjectFieldEntity>({
            EntityName: 'MJ: Integration Object Fields',
            ExtraFilter: `IntegrationObjectID='${objectID}'`,
            Fields: ['ID', 'Name', 'Status'],
            ResultType: 'simple',
        }, this.user);
        const map = new Map<string, { ID: string; Status: string }>();
        if (res.Success) for (const r of res.Results ?? []) {
            map.set((r.Name ?? '').toLowerCase(), { ID: String(r.ID), Status: r.Status ?? 'Active' });
        }
        return map;
    }

    /** Resolves the IntegrationObject ID for an external object name under an integration. */
    private async resolveIntegrationObjectID(integrationID: string, externalObjectName: string): Promise<string | null> {
        const rv = new RunView();
        const res = await rv.RunView<MJIntegrationObjectEntity>({
            EntityName: 'MJ: Integration Objects',
            ExtraFilter: `IntegrationID='${integrationID}' AND Name='${this.escape(externalObjectName)}'`,
            Fields: ['ID', 'Name', 'IntegrationID'],
            ResultType: 'simple',
            MaxRows: 1,
        }, this.user);
        const row = res.Success ? res.Results?.[0] : undefined;
        return row ? row.ID : null;
    }

    private escape(value: string): string {
        return value.replace(/'/g, "''");
    }

    private msg(err: unknown): string {
        return err instanceof Error ? err.message : String(err);
    }
}
