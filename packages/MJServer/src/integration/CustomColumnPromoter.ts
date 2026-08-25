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
 * The ADD COLUMN runs through RSU's normal pipeline — migration written, committed, MJAPI
 * restarted once for the whole batch — because the restart is what exposes the new columns over
 * GraphQL and the commit is what stops the database carrying columns the repository has no record
 * of. The JSON spread of staged values into those columns happens here too.
 */
import {
    LogError,
    LogStatus,
    LogStatusEx,
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
    inferColumnTypeFromStats,
    type SchemaPromotionResult,
    type PromotionCandidate,
    type CustomKeyStat,
    type InferredColumnType,
} from '@memberjunction/integration-engine';

/**
 * A custom-key candidate persisted to CompanyIntegration.Configuration.customKeyCandidates
 * (out-of-band capture): key identity + sizing statistics + the inferred column
 * type, NEVER raw sample values (PII-safe — the config row is operator-visible). Written
 * with REPLACE semantics per synced entity on every sync, so keys that vanish evict.
 */
interface PersistedCustomKeyCandidate {
    Key: string;
    Occurrences: number;
    TotalRecords: number;
    MaxLength: number;
    Inferred: InferredColumnType;
}
import type { BaseEntity } from '@memberjunction/core';
import { DDLGenerator, type TargetColumnConfig, type DatabasePlatform } from '@memberjunction/integration-schema-builder';
import { RuntimeSchemaManager, type RSUPipelineInput, type RSUPipelineResult } from '@memberjunction/schema-engine';
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
    /**
     * Column AND field map already exist, but rows may still hold the value only in the overflow
     * JSON — a run interrupted between ADD COLUMN and the value spread leaves exactly this state,
     * and nothing else ever finishes it: the key is no longer "unmapped" so capture stops, and the
     * old terminate check skipped it as done. A spread-recovery item re-runs ONLY the backfill
     * (no DDL, no metadata writes); the idempotent spread settles it to a no-op once every row is
     * filled. Never surfaced as a UI candidate and never counted as a column added.
     */
    recoverSpread?: boolean;
}

/** Registers the post-sync custom-column promotion hook on the IntegrationEngine singleton. */
export function registerIntegrationCustomColumnPromoter(): void {
    IntegrationEngine.Instance.SetPostSyncSchemaPromotionCallback(async (ctx) => {
        const user = ctx.ContextUser as UserInfo;
        const provider = ctx.Provider as IMetadataProvider | undefined;
        const promoter = new IntegrationCustomColumnPromoter(user, provider);
        // out-of-band candidates: persist the sync's in-memory custom-key statistics
        // (REPLACE semantics per synced entity — vanished keys evict) so on-demand
        // IntegrationListCustomColumnCandidates sees them even when the content-hash fast path
        // skipped every row (the hash basis excludes overflow, so skipped rows never write it).
        // Unconditional — runs whether or not auto-promote is on. PII-safe: names/lengths/types
        // only, never raw values.
        await promoter.PersistCandidateStats(ctx.CompanyIntegrationID, ctx.SyncedEntityNames, ctx.CustomKeyStats);
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
        return promoter.PromoteForSync(ctx.CompanyIntegrationID, ctx.SyncedEntityNames, ctx.CustomKeyStats);
    });
    // Verbose-only: this is a boot-time registration confirmation, not operator-actionable at
    // standard level. Routes through the global verbose gate (set from the server's telemetry.level).
    LogStatusEx({ message: '[CustomColumnPromoter] Registered post-sync custom-column promotion hook (auto-promote opt-in, default OFF).', verboseOnly: true });
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
        customKeyStats?: Record<string, CustomKeyStat[]>,
    ): Promise<SchemaPromotionResult> {
        const integrationID = await this.resolveIntegrationID(companyIntegrationID);
        if (!integrationID) return NOT_PROMOTED;

        // ── PHASE 1: PLAN — build every entity's work list + its RSU input; run NO pipeline. ──
        // The old shape ran the FULL RSU pipeline per entity — a sync touching N entities with
        // candidates paid N CodeGen + compile passes where the batch API exists precisely to pay
        // one. Plan everything first, then promote once.
        interface EntityPlan {
            entityName: string;
            entityInfo: EntityInfo;
            entityMap: { ID: string; ExternalObjectName: string };
            work: WorkItem[];
            /** Index of this entity's input in the RSU batch; -1 when it needs no DDL. */
            batchIndex: number;
        }
        const plans: EntityPlan[] = [];
        const batchInputs: RSUPipelineInput[] = [];
        for (const entityName of syncedEntityNames) {
            try {
                const planned = await this.planWorkForEntity(companyIntegrationID, entityName, customKeyStats?.[entityName]);
                if (!planned || planned.work.length === 0) continue; // no overflow / no entity map / already converged
                const { entityInfo, entityMap } = planned;
                let work = planned.work;
                // M4a: bound schema churn per pass — the remainder stays captured and promotes next sync.
                if (work.length > MAX_PROMOTIONS_PER_PASS) {
                    LogStatus(`[CustomColumnPromoter] ${work.length} candidates on ${entityName}; promoting ${MAX_PROMOTIONS_PER_PASS} this pass, ${work.length - MAX_PROMOTIONS_PER_PASS} deferred to next sync.`);
                    work = work.slice(0, MAX_PROMOTIONS_PER_PASS);
                }
                const newColumns = work.filter(w => w.needsColumn);
                const plan: EntityPlan = { entityName, entityInfo, entityMap, work, batchIndex: -1 };
                if (newColumns.length > 0) {
                    plan.batchIndex = batchInputs.length;
                    batchInputs.push(this.buildSchemaInput(entityInfo, newColumns));
                }
                plans.push(plan);
            } catch (err) {
                // One entity's planning failure must not abort the others, and never the sync.
                LogError(`[CustomColumnPromoter] Planning failed for entity '${entityName}': ${this.msg(err)}`);
            }
        }
        if (plans.length === 0) return NOT_PROMOTED;

        // ── PHASE 2: ONE batched RSU pass for ALL entities' ADD COLUMN migrations. ──
        // RunPipelineBatch runs every migration under one lock, then ONE CodeGen + compile +
        // restart + git commit — which is now genuinely one restart and one commit for the whole
        // promotion, rather than one per entity. See buildSchemaInput: the inputs no longer set
        // SkipRestart/SkipGitCommit, so the batch commits the migration and restarts once at the
        // end, which is what exposes the new columns over GraphQL and what keeps the repository in
        // step with the database.
        let batchResults: RSUPipelineResult[] = [];
        if (batchInputs.length > 0) {
            const batch = await RuntimeSchemaManager.Instance.RunPipelineBatch(batchInputs);
            batchResults = batch.Results ?? [];
            // M3: make the freshly-created EntityFields + regenerated sprocs visible in-process
            // ONCE for the whole batch. CRITICAL: the spread below builds sproc calls from this
            // metadata; without the refresh, row.Save() uses the STALE field list that predates
            // the column add and mismatches the regenerated sproc → "Error executing SQL".
            try { await this.provider.Refresh(); } catch (err) { LogError(`[CustomColumnPromoter] post-batch Refresh failed: ${this.msg(err)}`); }
        }

        // ── PHASE 3: IOF rows + field maps + value spread for every entity whose DDL landed. ──
        const columnsAdded: Array<{ EntityName: string; ColumnName: string }> = [];
        for (const plan of plans) {
            try {
                if (plan.batchIndex >= 0) {
                    const res = batchResults[plan.batchIndex];
                    if (!res || !res.Success) {
                        // DDL failed — leave everything captured; retry next promote (no partial commit lost).
                        LogError(`[CustomColumnPromoter] RSU ADD COLUMN failed on ${plan.entityInfo.Name}: ${res?.ErrorMessage ?? res?.ErrorStep ?? 'unknown'} — leaving ${plan.entityName} captured for retry.`);
                        continue;
                    }
                }
                await this.createIntegrationObjectFields(integrationID, plan.entityMap.ExternalObjectName, plan.work);
                await this.createFieldMaps(plan.entityMap.ID, plan.work.filter(w => w.needsFieldMap));
                const refreshedEntityInfo = this.provider.EntityByName(plan.entityName) ?? plan.entityInfo;
                await this.spreadAndRebaseline(plan.entityName, plan.entityMap.ID, refreshedEntityInfo, plan.work);
                // recoverSpread items add no column/metadata — they only finish an interrupted
                // backfill, so they don't count as "columns added" (keeps SchemaUpdatePending honest).
                const added = plan.work.filter(w => !w.recoverSpread);
                LogStatus(`[CustomColumnPromoter] Promoted/recovered ${plan.work.length} custom column(s) on ${plan.entityName}: ${plan.work.map(w => w.columnName).join(', ')}`);
                columnsAdded.push(...added.map(w => ({ EntityName: plan.entityName, ColumnName: w.columnName })));
            } catch (err) {
                // One entity's promotion failure must not abort the others, and never the sync.
                LogError(`[CustomColumnPromoter] Promotion failed for entity '${plan.entityName}': ${this.msg(err)}`);
            }
        }

        const promoted = columnsAdded.length > 0;
        return { Promoted: promoted, ColumnsAdded: columnsAdded, SchemaUpdatePending: promoted };
    }

    /**
     * Dry-run of GATE → scan → PLAN → resolve-work for ONE entity, WITHOUT applying any schema change.
     * Shared by {@link PromoteForSync} (phase 1, which then batch-PROMOTES the work) and {@link ListCandidates} (which only
     * reports it). Returns null when the entity has no overflow column / no captured customs / no entity map.
     * Because the work list is computed live (overflow keys minus already-column-and-mapped), re-running is
     * inherently deduped — a concurrent discovery that already promoted a key yields no work item for it.
     */
    private async planWorkForEntity(
        companyIntegrationID: string,
        entityName: string,
        inRunStats?: CustomKeyStat[],
    ): Promise<{ entityInfo: EntityInfo; entityMap: { ID: string; ExternalObjectName: string }; work: WorkItem[] } | null> {
        const entityInfo = this.provider.EntityByName(entityName);
        if (!entityInfo?.SchemaName || !entityInfo.BaseTable) return null;
        // No overflow column on this table (predates the feature) → nothing to promote.
        if (!entityInfo.Fields.some(f => f.Name === CUSTOM_OVERFLOW_COLUMN)) return null;

        // Candidate sources, most-authoritative first (dedup by key):
        //  1. live overflow-column scan (rows that were actually written),
        // 2. THIS run's in-memory stats (rows the content-hash fast path skipped —
        //     out-of-band capture; the hash basis excludes overflow so skips never write it),
        //  3. candidates persisted from prior runs (survive restarts for on-demand listing).
        const overflowJson = await this.scanOverflow(entityName);

        // U3 note (rkihm-BC review, #3061): this in-repo promotion path passes no `LockUntilFullSync`, so it
        // does NOT yet enforce "hold promotion until a full sync since the last schema change." The lever
        // exists on `PromotionPlanOptions`, but pulling it here requires this caller to know whether a full
        // sync has completed post-rediscovery — DEFERRED and tracked as a follow-up. The engine ships the
        // gate; wiring MJServer's own consumer to set it is a separate change. Until then, this path retains
        // the pre-U3 behavior for a rediscover-then-incremental sequence.
        const byKey = new Map<string, PromotionCandidate>();
        for (const c of planPromotions(buildOverflowStats(overflowJson), {})) byKey.set(c.Key, c);
        for (const c of this.candidatesFromStats(inRunStats)) if (!byKey.has(c.Key)) byKey.set(c.Key, c);
        for (const c of await this.loadPersistedCandidates(companyIntegrationID, entityName)) if (!byKey.has(c.Key)) byKey.set(c.Key, c);
        const passing = [...byKey.values()];
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
        // recoverSpread items are not "new columns found" — they are an internal backfill-recovery
        // signal (column + field map already exist), so they must not surface as UI candidates.
        return planned.work.filter(w => !w.recoverSpread).map(w => ({
            EntityName: entityName,
            SourceKey: w.sourceKey,
            ColumnName: w.columnName,
            InferredType: w.candidate.Inferred.SchemaFieldType,
            NeedsColumn: w.needsColumn,
        }));
    }

    /** Maps THIS run's in-memory custom-key stats to promotion candidates (out-of-band capture). */
    private candidatesFromStats(stats?: CustomKeyStat[]): PromotionCandidate[] {
        if (!stats || stats.length === 0) return [];
        return stats
            .filter(s => s.TotalRecords > 0 && s.Occurrences > 0)
            .map(s => ({
                Key: s.Key,
                Coverage: s.Occurrences / s.TotalRecords,
                Inferred: inferColumnTypeFromStats(s.SampleValues, s.MaxLength),
            }));
    }

    /** Loads candidates persisted by {@link PersistCandidateStats} for one entity (empty on any gap). */
    private async loadPersistedCandidates(companyIntegrationID: string, entityName: string): Promise<PromotionCandidate[]> {
        try {
            const ci = await this.provider.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', this.user);
            if (!(await ci.Load(companyIntegrationID)) || !ci.Configuration) return [];
            const cfg = JSON.parse(ci.Configuration) as { customKeyCandidates?: Record<string, PersistedCustomKeyCandidate[]> };
            const persisted = cfg.customKeyCandidates?.[entityName];
            if (!Array.isArray(persisted)) return [];
            return persisted
                .filter(p => p && typeof p.Key === 'string' && p.TotalRecords > 0)
                .map(p => ({ Key: p.Key, Coverage: p.Occurrences / p.TotalRecords, Inferred: p.Inferred }));
        } catch {
            return [];
        }
    }

    /**
     * Persists the sync's custom-key statistics onto CompanyIntegration.Configuration
     * (`customKeyCandidates`, keyed by entity name) with REPLACE semantics per SYNCED entity:
     * an entity synced with stats gets exactly this run's key set (vanished keys evict); an
     * entity synced with NO custom keys has its entry removed. Unsynced entities keep theirs.
     * PII-safe — key names, counts, lengths and inferred types only, never raw values. Caps
     * the stored set per entity so a pathological source can't bloat the config row.
     */
    public async PersistCandidateStats(
        companyIntegrationID: string,
        syncedEntityNames: string[],
        statsByEntity?: Record<string, CustomKeyStat[]>,
    ): Promise<void> {
        const MAX_PERSISTED_KEYS_PER_ENTITY = 200;
        try {
            const ci = await this.provider.GetEntityObject<MJCompanyIntegrationEntity>('MJ: Company Integrations', this.user);
            if (!(await ci.Load(companyIntegrationID))) return;
            const cfg = (ci.Configuration ? JSON.parse(ci.Configuration) : {}) as Record<string, unknown> & {
                customKeyCandidates?: Record<string, PersistedCustomKeyCandidate[]>;
            };
            const candidates = { ...(cfg.customKeyCandidates ?? {}) };
            let changed = false;
            for (const entityName of syncedEntityNames) {
                const stats = statsByEntity?.[entityName];
                if (stats && stats.length > 0) {
                    candidates[entityName] = stats
                        .filter(s => s.TotalRecords > 0 && s.Occurrences > 0)
                        .slice(0, MAX_PERSISTED_KEYS_PER_ENTITY)
                        .map(s => ({
                            Key: s.Key,
                            Occurrences: s.Occurrences,
                            TotalRecords: s.TotalRecords,
                            MaxLength: s.MaxLength,
                            Inferred: inferColumnTypeFromStats(s.SampleValues, s.MaxLength),
                        }));
                    changed = true;
                } else if (candidates[entityName]) {
                    delete candidates[entityName]; // synced clean → evict stale candidates
                    changed = true;
                }
            }
            if (!changed) return;
            if (Object.keys(candidates).length > 0) cfg.customKeyCandidates = candidates;
            else delete cfg.customKeyCandidates;
            ci.Configuration = JSON.stringify(cfg);
            if (!await ci.Save()) {
                LogError(`[CustomColumnPromoter] Failed to persist custom-key candidates for CI ${companyIntegrationID}: ${ci.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (err) {
            // Best-effort — candidate persistence must never fail the sync.
            LogError(`[CustomColumnPromoter] PersistCandidateStats failed for CI ${companyIntegrationID}: ${this.msg(err)}`);
        }
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
            if (hasColumn && hasFieldMap) {
                // Schema + mapping are terminated — but see WorkItem.recoverSpread: an interrupted
                // spread leaves rows carrying the value only in overflow, and this was the one exit
                // that made that state permanent. Keep it as a spread-recovery item instead.
                items.push({ candidate, sourceKey: candidate.Key, columnName: existingCol!, needsColumn: false, needsFieldMap: false, recoverSpread: true });
                continue;
            }
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

    /**
     * Builds the RSUPipelineInput (ADD COLUMN DDL) for one entity's new columns — pure, runs NO
     * pipeline. PromoteForSync collects these across all entities and runs ONE RunPipelineBatch so
     * the whole promote is a single CodeGen/compile/restart pass.
     */
    private buildSchemaInput(entityInfo: EntityInfo, named: WorkItem[]): RSUPipelineInput {
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
        return {
            MigrationSQL: statements.join('\n'),
            Description: `Promote ${named.length} custom column(s) on ${entityInfo.Name}`,
            AffectedTables: [`${entityInfo.SchemaName}.${entityInfo.BaseTable}`],
            // SkipRestart MUST stay true: `pm2 restart` kills this process ("Expected: pm2
            // restart killed us and we caught the signal" — RuntimeSchemaManager.restartMJAPI), and
            // PHASE 3 below still has to create the IOF rows, the field maps and spread the staged
            // values. Restarting here would end the function at the DDL, leaving exactly the
            // interrupted-spread state this PR exists to recover from — on every promotion.
            SkipRestart: true,

            // SkipGitCommit, by contrast, was wrong and is now dropped, so the migration and the
            // regenerated code reach the repository. It is the only place in the repo either flag
            // was forced rather than passed in; every integration entry point takes them as
            // arguments defaulting to false, so add/remove tables, refresh schema and first-time
            // setup all commit already. Without the commit the database carries columns git has no
            // record of — observed live, where a workspace's promoted columns were present only
            // because a LATER schema refresh happened to re-emit them as ADD COLUMN IF NOT EXISTS.
            // The commit does not touch the process, so it is safe where the restart is not.
            //
            // The restart itself remains genuinely unsolved: it has to happen AFTER phase 3, and
            // nothing performs it — `sync.schema_update` carries restartRequiredForGraphQL: true
            // and has no subscriber, while the client arms its RSU poll and waits for a restart
            // that never comes. Until that is closed, the columns do not reach GraphQL. Deliberately
            // NOT fixed by restarting here, which would break promotion outright.
        };
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
                // Idempotent spread: only write when the destination is still unset. A freshly-added
                // column is null on first spread (so it fills); an already-backfilled column is left
                // alone, so a re-run after an interrupted spread finishes the gap without rewriting
                // settled rows — the recoverSpread path converges to a read-only pass.
                const current = row.Get(n.columnName);
                if (current === null || current === undefined) {
                    row.Set(n.columnName, overflow[n.sourceKey]);
                    changed = true;
                }
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
