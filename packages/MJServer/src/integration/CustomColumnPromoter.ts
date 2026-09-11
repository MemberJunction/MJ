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
import { RuntimeSchemaManager, type RSUPipelineInput, type RSUPipelineResult, type RSUPendingWork } from '@memberjunction/schema-engine';
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

/** Page size for the full-table overflow walks (spread + stale purge). */
const OVERFLOW_PAGE_SIZE = 500;

/**
 * Rows the stale purge may WRITE in one pass, the row-wise sibling of {@link MAX_PROMOTIONS_PER_PASS}.
 *
 * Each purged row costs one `BaseEntity.Save()` — roughly nine serialized round trips, which is the
 * only write shape MJ offers today (there is no batched-update provider capability; `TransactionGroup`
 * gives atomicity, not batching, since both dialect implementations loop one query per item). That
 * puts the purge around 250 rows/min, so an unbounded sweep of a large table would hold the post-sync
 * promotion callback open for hours.
 *
 * Residue is inert while it waits — the field-map-first terminate check already stops a mapped key
 * being re-offered as a new column — so draining it across several syncs costs nothing but time.
 * The budget bounds WRITES, not the scan: the walk keeps reading (page reads are cheap and rows
 * already purged fall through in memory) so a later pass still reaches residue further down the table.
 */
const MAX_PURGE_ROWS_PER_PASS = 1000;

/** An already-promoted key whose value is still sitting in the staging JSON — residue, not a candidate. */
interface StaleOverflowKey {
    /** The source field name as it appears inside the overflow JSON. */
    sourceKey: string;
    /** The real column it was promoted to (the active field map's DestinationFieldName). */
    columnName: string;
}

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
                if (!planned) continue; // no overflow column / no captured customs / no entity map
                const { entityInfo, entityMap } = planned;

                // PURGE FIRST — strip already-promoted keys from the staging JSON BEFORE any column is
                // created, and before the RSU pass that would restart this process. A failed or skipped
                // sync is not evidence that a column is missing, and leaving the residue in place is what
                // makes an already-promoted key re-surface as a phantom "new column". Runs even when there
                // is nothing new to promote, which is the only way pre-existing residue on rows the sync
                // never rewrites ever gets cleaned rather than endlessly re-detected.
                if (planned.stale.length > 0) {
                    await this.purgeStaleOverflowKeys(entityName, entityMap.ID, entityInfo, planned.stale);
                }
                if (planned.work.length === 0) continue; // already converged
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

        // Register the follow-up DURABLY before the restart, the way the apply-objects path does
        // (IntegrationDiscoveryResolver: `rsuInput.PendingWork = [pendingPayload]`). The restart is
        // what loads the regenerated entity classes, so everything downstream of the DDL — the IOF
        // rows, the field maps, the overflow spread — belongs after it, not before.
        //
        // Carried on the first input because RSU restarts ONCE for the whole batch; the payload
        // describes every entity in the pass.
        if (batchInputs.length > 0) {
            batchInputs[0].PendingWork = [{
                WorkType: 'promote-columns',
                CompanyIntegrationID: companyIntegrationID,
                // Not used by the promote path (which works from PromotedColumns), but the contract
                // requires them and they keep the row legible to an operator reading the table.
                SourceObjectNames: plans.map(p => p.entityMap.ExternalObjectName),
                SchemaName: plans[0].entityInfo.SchemaName,
                CreatedAt: new Date().toISOString(),
                PromotedColumns: plans.map(p => ({
                    EntityName: p.entityName,
                    EntityMapID: p.entityMap.ID,
                    ExternalObjectName: p.entityMap.ExternalObjectName,
                    IntegrationID: integrationID,
                    Columns: p.work.map(w => ({
                        SourceKey: w.sourceKey,
                        ColumnName: w.columnName,
                        SchemaFieldType: w.candidate.Inferred.SchemaFieldType,
                        MaxLength: w.candidate.Inferred.MaxLength,
                        Coverage: w.candidate.Coverage,
                    })),
                })),
            }];
            batchInputs[0].ContextUser = this.user;
        }

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

        // ── PHASE 3: the NO-DDL case only — IOF rows + field maps + value spread, inline. ──
        //
        // An entity that needed a column went through the batch, and the batch RESTARTS: `pm2
        // restart` kills this process, so nothing below runs for it. Its IOF rows, field maps and
        // spread are completed by the post-restart consumer from the PendingWork registered above
        // (CompletePromotion) — which is also where they belong, because only after the restart are
        // the regenerated entity classes loaded.
        //
        // What is left here is the recovery-only pass: work items that need no column, so no
        // migration, so no batch entry and no restart. Those are finished inline exactly as before.
        // Explicitly filtered rather than left to fall through, so this reads as the branch it is
        // instead of as dead code that happens to be unreachable.
        const columnsAdded: Array<{ EntityName: string; ColumnName: string }> = [];
        for (const plan of plans) {
            if (plan.batchIndex >= 0) {
                const res = batchResults[plan.batchIndex];
                if (!res || !res.Success) {
                    // DDL failed — leave everything captured; retry next promote (no partial commit
                    // lost). The PendingWork row stays Pending and is re-processable.
                    LogError(`[CustomColumnPromoter] RSU ADD COLUMN failed on ${plan.entityInfo.Name}: ${res?.ErrorMessage ?? res?.ErrorStep ?? 'unknown'} — leaving ${plan.entityName} captured for retry.`);
                } else {
                    // Succeeded. The restart has either already ended this process or is about to,
                    // and the consumer owns the follow-up — so do NOT do the metadata work here.
                    // Still COUNT the columns: they were promoted, and SchemaUpdatePending is
                    // derived from this list. The client keys its "workspace updating" state off
                    // that flag, so dropping these would tell it nothing happened.
                    const added = plan.work.filter(w => !w.recoverSpread);
                    LogStatus(`[CustomColumnPromoter] Promoted ${added.length} column(s) on ${plan.entityName}: ${added.map(w => w.columnName).join(', ')} — metadata + spread deferred to the post-restart consumer.`);
                    columnsAdded.push(...added.map(w => ({ EntityName: plan.entityName, ColumnName: w.columnName })));
                }
                continue;
            }
            try {
                // Completion goes through the SAME method the post-restart consumer calls, given the
                // same payload shape. There is one implementation of "finish a promotion", so the
                // no-restart case can never drift from the restart case — which is the drift that
                // would be impossible to notice, since only one of them runs on any given pass.
                await this.CompletePromotion([{
                    EntityName: plan.entityName,
                    EntityMapID: plan.entityMap.ID,
                    ExternalObjectName: plan.entityMap.ExternalObjectName,
                    IntegrationID: integrationID,
                    Columns: plan.work.map(w => ({
                        SourceKey: w.sourceKey,
                        ColumnName: w.columnName,
                        SchemaFieldType: w.candidate.Inferred.SchemaFieldType,
                        MaxLength: w.candidate.Inferred.MaxLength,
                        Coverage: w.candidate.Coverage,
                    })),
                }], new Map([[plan.entityName, plan.entityInfo]]));
                // recoverSpread items add no column/metadata — they only finish an interrupted
                // backfill, so they don't count as "columns added" (keeps SchemaUpdatePending honest).
                const added = plan.work.filter(w => !w.recoverSpread);
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
     * Finish a promotion AFTER the restart — the IntegrationObjectField rows, the field maps and
     * the overflow→column spread — from the {@link RSUPendingWork} the pre-restart pass registered.
     *
     * Same work PHASE 3 does inline when no restart occurred; it lives here rather than in the
     * consumer so promotion logic stays in one class. The difference is that here the regenerated
     * entity classes ARE loaded, so the spread writes through real typed columns instead of the
     * dynamic .Get/.Set the pre-restart path is forced into.
     *
     * Idempotent, because a pending row is marked Completed only after success and so stays
     * re-processable after a crash: field maps are filtered against those already active, and the
     * spread only fills a destination that is still empty.
     */
    public async CompletePromotion(
        promoted: NonNullable<RSUPendingWork['PromotedColumns']>,
        knownEntities?: ReadonlyMap<string, EntityInfo>,
    ): Promise<Array<{ EntityName: string; ColumnName: string }>> {
        const columnsAdded: Array<{ EntityName: string; ColumnName: string }> = [];
        for (const entry of promoted) {
            try {
                // Provider first — post-restart it holds the REGENERATED class, which is the whole
                // reason completion was deferred. knownEntities is the inline caller handing back the
                // EntityInfo it already resolved, for the no-DDL pass where nothing was regenerated.
                const entityInfo = this.provider.EntityByName(entry.EntityName) ?? knownEntities?.get(entry.EntityName);
                if (!entityInfo) {
                    LogError(`[CustomColumnPromoter] Post-restart: entity '${entry.EntityName}' not found; skipping.`);
                    continue;
                }
                // Destination names are CARRIED, never recomputed: uniqueColumnName may have
                // suffixed one to dodge a collision, and re-deriving it here could pick a different
                // name than the column the migration actually created.
                const existingMaps = await this.activeFieldMaps(entry.EntityMapID);
                const named: WorkItem[] = entry.Columns.map(c => ({
                    candidate: {
                        Key: c.SourceKey,
                        Coverage: c.Coverage,
                        // SqlServerType/PostgresType drive DDL only, which ran before the restart.
                        // The phase-3 work below reads SchemaFieldType and MaxLength.
                        Inferred: {
                            SchemaFieldType: c.SchemaFieldType,
                            MaxLength: c.MaxLength,
                            SqlServerType: '',
                            PostgresType: '',
                        },
                    } as unknown as PromotionCandidate,
                    sourceKey: c.SourceKey,
                    columnName: c.ColumnName,
                    needsColumn: false,
                    needsFieldMap: !existingMaps.has(c.SourceKey.toLowerCase()),
                }));

                await this.createIntegrationObjectFields(entry.IntegrationID, entry.ExternalObjectName, named);
                await this.createFieldMaps(entry.EntityMapID, named.filter(n => n.needsFieldMap));
                await this.spreadAndRebaseline(entry.EntityName, entry.EntityMapID, entityInfo, named);

                LogStatus(`[CustomColumnPromoter] Post-restart: completed ${named.length} promoted column(s) on ${entry.EntityName}: ${named.map(n => n.columnName).join(', ')}`);
                columnsAdded.push(...named.map(n => ({ EntityName: entry.EntityName, ColumnName: n.columnName })));
            } catch (err) {
                // One entity must not abort the others; the pending row stays open for retry.
                LogError(`[CustomColumnPromoter] Post-restart completion failed for '${entry.EntityName}': ${this.msg(err)}`);
            }
        }
        return columnsAdded;
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
    ): Promise<{ entityInfo: EntityInfo; entityMap: { ID: string; ExternalObjectName: string }; work: WorkItem[]; stale: StaleOverflowKey[] } | null> {
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
        // Every key literally present in the staging JSON right now. Kept separate from the candidate
        // set below, which drops low-coverage keys — a stale key must be purged regardless of coverage.
        const liveOverflowKeys = new Set<string>();
        for (const raw of overflowJson) {
            const parsed = this.parseOverflow(raw);
            if (parsed) for (const k of Object.keys(parsed)) liveOverflowKeys.add(k);
        }

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
        // Nothing captured AND nothing staged — genuinely nothing to look at. A key can be staged
        // without being a candidate (coverage filtered it out), and that key still needs purging, so
        // this deliberately does NOT return early on `passing.length === 0` alone.
        if (passing.length === 0 && liveOverflowKeys.size === 0) return null;

        const entityMap = await this.findEntityMap(companyIntegrationID, entityName);
        if (!entityMap) {
            LogError(`[CustomColumnPromoter] No entity map for ${entityName} on CI ${companyIntegrationID}.`);
            return null;
        }

        // Skip fully-terminated keys (column + field map both exist); keep promote (needs column) / recover.
        const fieldMaps = await this.activeFieldMaps(entityMap.ID);
        const work = this.resolveWorkItems(passing, entityInfo, fieldMaps);

        // Keys that are ALREADY promoted (active field map) yet whose value is still sitting in the
        // staging JSON. These are not candidates — they are residue, and they cannot clear themselves:
        // the next sync only rewrites a row whose content hash changed, and the hash basis excludes the
        // overflow column, so a row untouched since before the promotion keeps the key indefinitely.
        const stale: StaleOverflowKey[] = [];
        for (const key of liveOverflowKeys) {
            const columnName = fieldMaps.get(key.toLowerCase());
            if (columnName) stale.push({ sourceKey: key, columnName });
        }
        return { entityInfo, entityMap, work, stale };
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
        fieldMaps: ReadonlyMap<string, string>,
    ): WorkItem[] {
        const existingByLower = new Map(entityInfo.Fields.map(f => [f.Name.toLowerCase(), f.Name]));
        const taken = new Set(entityInfo.Fields.map(f => f.Name.toLowerCase()));
        const items: WorkItem[] = [];
        for (const candidate of passing) {
            // An ACTIVE field map is the authoritative proof that this key was already promoted, and it
            // names the column that was created. Trust it ahead of a re-sanitized guess against the
            // in-memory field list: that list can predate the ADD COLUMN in THIS process (the promoter
            // refreshes its own provider, not every other one), and the real column may carry a
            // collision suffix the guess cannot reproduce. Both misses used to read as "no column yet",
            // re-offering an already-promoted key to the operator as a brand-new column — and, on
            // promotion, minting a duplicate `_2` column beside the working one.
            const mappedDest = fieldMaps.get(candidate.Key.toLowerCase());
            const hasFieldMap = mappedDest !== undefined;
            const existingCol =
                (mappedDest ? existingByLower.get(mappedDest.toLowerCase()) ?? mappedDest : undefined) ??
                existingByLower.get(sanitizeColumnName(candidate.Key).toLowerCase());
            const hasColumn = !!existingCol;
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

    /**
     * Active field maps for an entity map, as `lowercased SourceFieldName -> DestinationFieldName`.
     *
     * The destination name is what makes this authoritative: it records the column promotion ACTUALLY
     * created, which may carry a collision suffix (`_2`) that re-sanitizing the source key can never
     * reproduce. One query serves the terminate/recovery check, the stale-key detection and the hash
     * re-baseline, where there used to be two identical queries and a lossier projection.
     */
    private async activeFieldMaps(entityMapID: string): Promise<ReadonlyMap<string, string>> {
        const rv = new RunView();
        const res = await rv.RunView<MJCompanyIntegrationFieldMapEntity>({
            EntityName: 'MJ: Company Integration Field Maps',
            ExtraFilter: `EntityMapID='${entityMapID}' AND Status='Active'`,
            Fields: ['SourceFieldName', 'DestinationFieldName'],
            ResultType: 'simple',
        }, this.user);
        const maps = new Map<string, string>();
        if (res.Success) {
            for (const r of res.Results ?? []) {
                const source = (r.SourceFieldName ?? '').toLowerCase();
                // '' destination keeps the key MAPPED for the terminate check while signalling that no
                // column name is recoverable from it — a `has()` miss and a `get()` of '' are different answers.
                if (source) maps.set(source, r.DestinationFieldName ?? '');
            }
        }
        return maps;
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
            // Neither SkipRestart nor SkipGitCommit is set, so RSU runs its normal pipeline. Both
            // are optional and RSU gates on `!inputs.every(i => i.SkipGitCommit)`, so omitting them
            // IS the default — no caller or platform change is needed to get commit + restart.
            //
            // `pm2 restart` kills this process, so PHASE 3 below does NOT run when the restart
            // happens. That is why the follow-up is registered as PendingWork above: the
            // post-restart consumer completes it, with the regenerated entity classes actually
            // loaded. PHASE 3 remains as the fallback for the case where no DDL was needed (no
            // batch, so no restart) — mirroring the apply path, which likewise finishes inline only
            // when the restart did not occur.
            //
            // Both flags were previously hardcoded true here, the only place in the repo either was
            // forced rather than passed in. Every integration entry point takes them as arguments
            // defaulting to false, so add/remove tables, refresh schema and first-time setup all
            // commit and restart; promotion was the outlier. Without the restart the columns never
            // reached GraphQL — "already usable (metadata refreshed)" conflated metadata with CODE,
            // since Refresh() reloads EntityField rows but does not load regenerated classes into a
            // running process. Without the commit the database carried columns git had no record of.

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
     * cast SQL, which is where PG bugs hide); BaseEntity handles the dialect on write. Each promoted
     * key is also STRIPPED from the staging JSON as it is spread: it is no longer unmapped, and
     * leaving it behind is what later re-surfaces it as a phantom new column (see
     * {@link purgeStaleOverflowKeys}). Bounded to rows that carry overflow, paged.
     */
    private async spreadAndRebaseline(
        entityName: string,
        entityMapID: string,
        entityInfo: EntityInfo,
        named: WorkItem[],
    ): Promise<void> {
        const hasHashCol = entityInfo.Fields.some(f => f.Name === CONTENT_HASH_COLUMN);
        const mappedDestFields = hasHashCol ? await this.activeDestinationFields(entityMapID) : [];
        await this.forEachOverflowRow(entityName, entityInfo, row =>
            this.spreadOneRow(row, named, hasHashCol, mappedDestFields),
        );
    }

    /**
     * Removes already-promoted keys from the staging JSON across the WHOLE table, spreading each
     * value into its real column first if that column is still empty (a row promoted before the
     * spread ever reached it must not lose the value on the way out).
     *
     * This exists because the residue cannot self-heal. The sync rewrites a row only when its content
     * hash changes, and the hash basis deliberately excludes the overflow column — so a row that has
     * not changed since before the promotion is never rewritten, keeps the promoted key forever, and
     * keeps that key showing up in the candidate listing as a new column to add.
     */
    private async purgeStaleOverflowKeys(
        entityName: string,
        entityMapID: string,
        entityInfo: EntityInfo,
        stale: StaleOverflowKey[],
    ): Promise<void> {
        const columns = new Set(entityInfo.Fields.map(f => f.Name.toLowerCase()));
        const purgeable = stale.filter(k => columns.has(k.columnName.toLowerCase()));
        if (purgeable.length === 0) {
            // Mapped but no such column in this process's metadata: the map may be newer than the
            // metadata, so DON'T strip the staged value — that would be the only copy of it.
            LogStatus(`[CustomColumnPromoter] ${stale.length} mapped key(s) on ${entityName} have no column in current metadata; purge skipped this pass.`);
            return;
        }
        // Same re-baseline as the spread: the promoted columns are already in the field maps, so they
        // are already part of what the next sync hashes. Backfilling one without re-baselining would
        // leave every purged row hash-mismatched and force a needless rewrite on the next sync.
        const hasHashCol = entityInfo.Fields.some(f => f.Name === CONTENT_HASH_COLUMN);
        const mappedDestFields = hasHashCol ? await this.activeDestinationFields(entityMapID) : [];
        let written = 0;
        let removedFromSet = 0;
        await this.forEachOverflowRow(
            entityName,
            entityInfo,
            async row => {
                const result = await this.purgeOneRow(row, purgeable, hasHashCol, mappedDestFields);
                if (result.wrote) written++;
                if (result.leftSet) removedFromSet++;
                return result.leftSet;
            },
            () => written >= MAX_PURGE_ROWS_PER_PASS,
        );
        const keys = purgeable.map(k => k.sourceKey).join(', ');
        if (written >= MAX_PURGE_ROWS_PER_PASS) {
            LogStatus(`[CustomColumnPromoter] Purged ${keys} from ${written} row(s) on ${entityName} — per-pass budget reached; any remaining residue is purged on the next sync.`);
        } else {
            LogStatus(`[CustomColumnPromoter] Purged ${keys} from the staging JSON of ${written} row(s) on ${entityName} (already promoted).`);
        }
    }

    /**
     * Walks every row of `entityName` whose overflow JSON is non-null, in pages, applying `visit`.
     *
     * `visit` reports whether the row LEFT the filtered set (its JSON went null). Those removals shift
     * every later row toward the front, so the offset advances by rows-seen-minus-rows-removed rather
     * than by page size — otherwise the walk skips exactly as many rows as it cleans. Ordering is
     * pinned to the primary key so the offsets refer to a stable sequence across the paged queries.
     *
     * `stop` is checked before each row and ends the walk early — a write budget, not a scan limit,
     * so a capped caller still reads past rows it has nothing to do on. See {@link MAX_PURGE_ROWS_PER_PASS}.
     */
    private async forEachOverflowRow(
        entityName: string,
        entityInfo: EntityInfo,
        visit: (row: BaseEntity) => Promise<boolean>,
        stop?: () => boolean,
    ): Promise<void> {
        const orderBy = entityInfo.PrimaryKeys.map(pk => pk.Name).join(', ');
        let seen = 0;
        let removed = 0;
        for (;;) {
            const rv = new RunView();
            const res = await rv.RunView<BaseEntity>({
                EntityName: entityName,
                ExtraFilter: `${CUSTOM_OVERFLOW_COLUMN} IS NOT NULL`,
                OrderBy: orderBy.length > 0 ? orderBy : undefined,
                ResultType: 'entity_object',
                MaxRows: OVERFLOW_PAGE_SIZE,
                StartRow: seen - removed,
            }, this.user);
            if (!res.Success) {
                LogError(`[CustomColumnPromoter] Overflow row scan failed for ${entityName}: ${res.ErrorMessage}`);
                return;
            }
            const rows = res.Results ?? [];
            for (const row of rows) {
                if (stop?.()) return;
                if (await visit(row)) removed++;
                seen++;
            }
            if (rows.length < OVERFLOW_PAGE_SIZE) break;
        }
    }

    /**
     * Strips the given already-promoted keys from one row's staging JSON, backfilling any real column
     * that is still empty.
     *
     * Reports both facts the caller needs and they are NOT the same: `wrote` is what the per-pass
     * budget spends (one Save), `leftSet` is whether the row dropped out of the `IS NOT NULL` filter
     * and so shifts the paged offsets. A row that keeps other unmapped keys is written but stays.
     */
    private async purgeOneRow(
        row: BaseEntity,
        stale: StaleOverflowKey[],
        hasHashCol: boolean,
        mappedDestFields: string[],
    ): Promise<{ wrote: boolean; leftSet: boolean }> {
        const overflow = this.parseOverflow(row.Get(CUSTOM_OVERFLOW_COLUMN));
        if (!overflow) return { wrote: false, leftSet: false };
        let changed = false;
        for (const k of stale) {
            if (!Object.prototype.hasOwnProperty.call(overflow, k.sourceKey)) continue;
            const current = row.Get(k.columnName);
            if (current === null || current === undefined) row.Set(k.columnName, overflow[k.sourceKey]);
            delete overflow[k.sourceKey];
            changed = true;
        }
        // Nothing of ours in this row — a pure read, so it costs no budget. This is the case that makes
        // a capped pass still able to reach residue further down: rows an earlier pass already cleaned
        // fall through here instead of being re-written.
        if (!changed) return { wrote: false, leftSet: false };
        const remaining = Object.keys(overflow).length > 0 ? JSON.stringify(overflow) : null;
        row.Set(CUSTOM_OVERFLOW_COLUMN, remaining);
        if (hasHashCol) {
            const mapped: Record<string, unknown> = {};
            for (const dest of mappedDestFields) mapped[dest] = row.Get(dest);
            row.Set(CONTENT_HASH_COLUMN, computeContentHash(mapped));
        }
        if (!await row.Save()) {
            LogError(`[CustomColumnPromoter] Overflow purge save failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
            return { wrote: false, leftSet: false };
        }
        return { wrote: true, leftSet: remaining === null };
    }

    /**
     * Applies the staged values + re-baselined hash to a single row entity and saves it. Returns true
     * when the row's overflow JSON went null (it left the filtered set — see {@link forEachOverflowRow}).
     */
    private async spreadOneRow(
        row: BaseEntity,
        named: WorkItem[],
        hasHashCol: boolean,
        mappedDestFields: string[],
    ): Promise<boolean> {
        // Dynamic .Get/.Set is REQUIRED here: these columns were created at runtime and have no
        // generated typed property in this still-running process (full typed access arrives on the
        // post-promotion restart). This is the sanctioned exception to the no-.Get/.Set rule.
        const overflow = this.parseOverflow(row.Get(CUSTOM_OVERFLOW_COLUMN));
        if (!overflow) return false;
        let changed = false;
        for (const n of named) {
            if (Object.prototype.hasOwnProperty.call(overflow, n.sourceKey)) {
                // Idempotent spread: only WRITE when the destination is still unset. A freshly-added
                // column is null on first spread (so it fills); an already-backfilled column is left
                // alone, so a re-run after an interrupted spread finishes the gap without overwriting
                // a settled value.
                const current = row.Get(n.columnName);
                if (current === null || current === undefined) {
                    row.Set(n.columnName, overflow[n.sourceKey]);
                }
                // The STRIP is unconditional, and deliberately outside the guard above: the key now has
                // a real column and an active field map, so it is no longer unmapped whether or not this
                // pass was the one that filled it. Leaving it behind relies on a later sync to evict it,
                // which never happens for a row whose content hash does not change (the hash basis
                // excludes this column). Stripping is what makes the recovery pass converge — once the
                // key is gone from the JSON the row drops out of the scan entirely.
                delete overflow[n.sourceKey];
                changed = true;
            }
        }
        if (!changed) return false;
        const remaining = Object.keys(overflow).length > 0 ? JSON.stringify(overflow) : null;
        row.Set(CUSTOM_OVERFLOW_COLUMN, remaining);
        if (hasHashCol) {
            // Re-baseline to the next-sync value: hash over all active mapped destination columns
            // (now incl. the new ones) as they sit on the row — matches what the next sync computes.
            const mapped: Record<string, unknown> = {};
            for (const dest of mappedDestFields) mapped[dest] = row.Get(dest);
            row.Set(CONTENT_HASH_COLUMN, computeContentHash(mapped));
        }
        if (!await row.Save()) {
            LogError(`[CustomColumnPromoter] Spread save failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
            return false;
        }
        return remaining === null;
    }

    /** Active field-map destination column names for an entity map (for hash re-baseline). */
    private async activeDestinationFields(entityMapID: string): Promise<string[]> {
        return [...(await this.activeFieldMaps(entityMapID)).values()].filter(Boolean);
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
