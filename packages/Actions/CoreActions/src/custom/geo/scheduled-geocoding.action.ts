import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, MJGlobal, MJEventType } from '@memberjunction/global';
import {
    RunView, Metadata, LogStatus, LogError, UserInfo, EntityInfo,
    CompositeKey, BaseEntity, BaseEntityEvent, IMetadataProvider, DatabaseProviderBase,
    IsKeysetPaginationOrderableType, LocalCacheManager, BaseEngineRegistry
} from '@memberjunction/core';
import { MJRecordGeoCodeEntity } from '@memberjunction/core-entities';
import { GeoCodeSyncService, GeocodeMemo } from '@memberjunction/geo-core';
import { GetDialect, SQLDialect } from '@memberjunction/sql-dialect';

/**
 * Console progress context threaded into {@link ScheduledGeocodingAction.geocodeBatch}
 * so that per-batch log lines read as one continuous, cumulative stream across
 * every page of a group (entity) rather than resetting to `1/N` each page.
 */
type BatchProgress = {
    /** Display label for the group, e.g. the entity name. */
    Label: string;
    /** Denominator: total records in scope for this group (0 = unknown → rendered as `?`). */
    Total: number;
    /** Records already processed for this group before the current call — anchors the cumulative range. */
    Offset: number;
    /** 1-based page number, shown in parens. Omitted for single-page groups. */
    Page?: number;
};

/**
 * Scheduled geocoding maintenance action that handles three tasks:
 *
 * 1. **Missing & stale records** — Finds records in geo-enabled entities that
 *    have non-null geo fields but no RecordGeoCode row (missing), or whose
 *    record was updated after its last successful geocode (stale — catches
 *    bulk SQL address updates that bypass BaseEntity.Save()), and geocodes them.
 *    Both conditions are evaluated **in SQL** (NOT EXISTS / EXISTS subqueries
 *    against vwRecordGeoCodes), so pages contain only actionable records — the
 *    action never walks already-geocoded rows and never bulk-loads the
 *    RecordGeoCode table into memory.
 * 2. **Failed retries** — Retries RecordGeoCode rows with Status='failed'
 *    up to a configurable max retry count.
 * 3. **Orphan cleanup** — Removes RecordGeoCode rows whose source entity
 *    record no longer exists.
 *
 * ## Parameters
 * - **BatchSize** (default 10) — Number of records to geocode **concurrently**
 *   in each parallel batch. Controls API rate pressure. Google Geocoding API
 *   allows 50 QPS, so 10 is conservative and leaves headroom.
 * - **MaxTotalRecords** (default 50,000) — Safety cap on the total number of
 *   records processed in a single run. Override via scheduled job parameters.
 *   Logs a warning when the limit is reached so operators know remaining
 *   records exist for the next run. Also acts as a coarse per-run quota guard
 *   for free-tier API plans (e.g. set to 2400 to stay under Geocod.io's daily
 *   2,500 free cap).
 * - **MaxRetries** (default 5) — Maximum retry count for failed geocoding
 *   attempts before a record is considered permanently failed.
 * - **GeocodingProvider** (optional) — Name of the geocoding provider to use
 *   for this run: `'google'`, `'geocodio'`, or `'here'`. Overrides the
 *   `apiIntegrations.geocoding.defaultProvider` config setting. When omitted,
 *   falls back to config; when neither is set, the first configured provider
 *   is chosen in priority order: geocodio → here → google.
 *
 * ## Address-level dedup
 * A per-run {@link GeocodeMemo} is passed to GeoCodeSyncService so duplicate
 * addresses within the run (including concurrent duplicates inside a parallel
 * batch) coalesce into one lookup, and the persistent `MJ: Geo Address Caches`
 * table shares provider results across runs, records, and entities.
 *
 * ## Cache Invalidation
 * After geocoding each record, the action loads the parent entity record
 * and fires a synthetic BaseEntity 'save' event so that any cached RunView
 * results containing stale lat/lng (from the RecordGeoCode JOIN) are
 * invalidated. This reload + event is skipped when no in-process consumer
 * exists (LocalCacheManager uninitialized / entity caching disabled, and no
 * BaseEngine caches the entity) — see {@link cacheInvalidationNeeded}.
 *
 * Designed to run on a schedule (every few hours) as a safety net for records
 * that bypass BaseEntity.Save() (bulk SQL imports, direct DB operations).
 */
@RegisterClass(BaseAction, 'Scheduled Geocoding')
export class ScheduledGeocodingAction extends BaseAction {
    private static readonly DEFAULT_MAX_RETRIES = 5;
    private static readonly DEFAULT_BATCH_SIZE = 10;
    /** Safety default: cap total records per run to prevent unbounded memory growth in extreme cases. */
    private static readonly DEFAULT_MAX_TOTAL = 50_000;
    /** Page size for RunView pagination — controls how many BaseEntity objects exist simultaneously. */
    private static readonly PAGE_SIZE = 500;
    /** Indentation prefix for child log lines nested under a group/entity header. */
    private static readonly INDENT = '   ';

    /**
     * Geocoding provider name in effect for the current run. Set at the top of
     * InternalRunAction from the 'GeocodingProvider' action parameter and read
     * when calling SyncIfChanged. Null = let the registry pick the default
     * (config or priority order).
     *
     * Stored on the instance rather than plumbed through every intermediate
     * method because BaseAction instances are created per-invocation in the
     * MJ Actions runner, so cross-call leakage isn't a concern.
     */
    private currentGeocodingProvider: string | null = null;

    /**
     * Per-run address memo passed to GeoCodeSyncService so duplicate addresses
     * across all records/entities in this run share one cache read / provider
     * call. Per-invocation instance state, same rationale as
     * {@link currentGeocodingProvider}.
     */
    private runMemo: GeocodeMemo = new Map();

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contextUser = params.ContextUser;
        if (!contextUser) {
            return { Success: false, ResultCode: 'MISSING_USER', Message: 'ScheduledGeocodingAction requires a context user' };
        }

        const maxRetries = this.getNumericParam(params, 'MaxRetries', ScheduledGeocodingAction.DEFAULT_MAX_RETRIES);
        const batchSize = this.getNumericParam(params, 'BatchSize', ScheduledGeocodingAction.DEFAULT_BATCH_SIZE);
        const maxTotal = this.getNumericParam(params, 'MaxTotalRecords', ScheduledGeocodingAction.DEFAULT_MAX_TOTAL);
        const geocodingProvider = this.getStringParam(params, 'GeocodingProvider');
        this.currentGeocodingProvider = geocodingProvider ?? null;
        this.runMemo = new Map();

        LogStatus(`🌍 Scheduled Geocoding — starting (batch ${batchSize} · max ${this.fmt(maxTotal)} · provider ${geocodingProvider ?? 'config-default'})`);

        const stats = { MissingProcessed: 0, MissingSuccess: 0, RetriesProcessed: 0, RetriesSuccess: 0, OrphansRemoved: 0 };

        // Step 1: Find and geocode missing/stale records
        const missingStats = await this.processMissingRecords(contextUser, batchSize, maxTotal, params.Provider);
        stats.MissingProcessed = missingStats.Processed;
        stats.MissingSuccess = missingStats.Success;

        // Step 2: Retry failed geocoding attempts
        const retryMaxTotal = Math.max(0, maxTotal - stats.MissingProcessed);
        const retryStats = await this.processFailedRetries(contextUser, maxRetries, batchSize, retryMaxTotal, params.Provider);
        stats.RetriesProcessed = retryStats.Processed;
        stats.RetriesSuccess = retryStats.Success;

        // Step 3: Clean up orphaned RecordGeoCode rows
        stats.OrphansRemoved = await this.cleanupOrphanedRecords(contextUser, batchSize, params.Provider);

        const totalRecordsProcessed = stats.MissingProcessed + stats.RetriesProcessed;
        if (totalRecordsProcessed >= maxTotal) {
            LogStatus(`⚠️  MaxTotal limit (${this.fmt(maxTotal)}) reached — remaining records will be picked up on the next run.`);
        }

        LogStatus(`🏁 Scheduled Geocoding — complete · missing/stale ${this.fmt(stats.MissingProcessed)} (${this.fmt(stats.MissingSuccess)} ✓) · retries ${this.fmt(stats.RetriesProcessed)} (${this.fmt(stats.RetriesSuccess)} ✓) · orphans ${this.fmt(stats.OrphansRemoved)} removed`);

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: JSON.stringify(stats)
        };
    }

    // ================================================================
    // Step 1: Process missing/stale RecordGeoCode rows
    // ================================================================

    /**
     * Find records in geo-enabled entities that need geocoding work (no
     * RecordGeoCode row, or updated after their last successful geocode) and
     * geocode them. Processes up to maxTotal records in parallel batches.
     */
    private async processMissingRecords(
        contextUser: UserInfo,
        batchSize: number,
        maxTotal: number,
        provider?: IMetadataProvider
    ): Promise<{ Processed: number; Success: number }> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const geoEntities = md.Entities.filter(e => e.SupportsGeoCoding);
        if (geoEntities.length === 0) return { Processed: 0, Success: 0 };

        // The dialect (SQL Server vs PostgreSQL) is bound to the provider, not the
        // entity, so resolve it once for all per-entity filters.
        const platformKey = (md as unknown as DatabaseProviderBase).PlatformKey ?? 'sqlserver';
        const dialect = GetDialect(platformKey);
        const rgcInfo = md.EntityByName('MJ: Record Geo Codes');
        if (!rgcInfo) {
            LogError('ScheduledGeocodingAction: MJ: Record Geo Codes entity not found in metadata');
            return { Processed: 0, Success: 0 };
        }

        let totalProcessed = 0;
        let totalSuccess = 0;

        for (const entityInfo of geoEntities) {
            if (totalProcessed >= maxTotal) break;

            const remaining = maxTotal - totalProcessed;
            const entityStats = await this.processMissingForEntity(entityInfo, contextUser, batchSize, remaining, dialect, rgcInfo);
            totalProcessed += entityStats.Processed;
            totalSuccess += entityStats.Success;
        }

        if (totalProcessed > 0) {
            LogStatus(`✅ Missing/stale-record geocoding complete — ${this.fmt(totalProcessed)} processed, ${this.fmt(totalSuccess)} geocoded`);
        }

        return { Processed: totalProcessed, Success: totalSuccess };
    }

    /**
     * Process all records needing geocoding work for a single entity using
     * pagination. The needs-work condition (missing OR stale) is pushed into
     * SQL — see {@link buildNeedsWorkFilter} — so every fetched record is
     * actionable and no client-side filtering or RecordGeoCode bulk-load is
     * needed. Pages are PAGE_SIZE records, so at most PAGE_SIZE BaseEntity
     * objects exist at a time regardless of entity size.
     *
     * Every processed record exits the SQL filter (a new RecordGeoCode row is
     * created, or GeocodedAt is refreshed past __mj_UpdatedAt), so pagination
     * can't loop. Single-column-PK entities additionally use keyset (AfterKey)
     * paging as a belt-and-braces guard; composite-PK entities refetch from
     * the start with a processed-ID guard.
     */
    private async processMissingForEntity(
        entityInfo: EntityInfo,
        contextUser: UserInfo,
        batchSize: number,
        maxRows: number,
        dialect: SQLDialect,
        rgcInfo: EntityInfo
    ): Promise<{ Processed: number; Success: number }> {
        const pkField = entityInfo.FirstPrimaryKey;
        if (!pkField) return { Processed: 0, Success: 0 };

        // Keyset pagination requires a single-column PK. For composite-PK entities, the action
        // falls back to refetch-from-start pagination with a processed-ID guard.
        const canUseKeyset = entityInfo.PrimaryKeys.length === 1 && IsKeysetPaginationOrderableType(pkField.Type);

        const geoFields = this.getGeoAddressFields(entityInfo);
        if (geoFields.length === 0) return { Processed: 0, Success: 0 };

        try {
            const needsWorkFilter = this.buildNeedsWorkFilter(entityInfo, geoFields, rgcInfo, dialect);

            let totalProcessed = 0;
            let totalSuccess = 0;
            let lastSeenKey: CompositeKey | undefined; // keyset mode
            let pageNumber = 0;             // 1-based, shown in batch lines
            let candidateTotal = 0;         // denominator: records needing work (from page-1 TotalRowCount)
            let headerLogged = false;       // emit the entity header lazily, only when there's work to do
            // Composite-PK guard: records already attempted this run. Processed
            // records normally exit the SQL filter, but a record whose processing
            // errored before a RecordGeoCode row existed would reappear on refetch —
            // the guard prevents an infinite loop on such records.
            const attemptedIds = canUseKeyset ? null : new Set<string>();

            while (totalProcessed < maxRows) {
                pageNumber++;
                const pageResult = await this.loadEntityPage(entityInfo.Name, needsWorkFilter, canUseKeyset ? pkField.Name : null, lastSeenKey, contextUser);
                if (!pageResult.Success || pageResult.Results.length === 0) break;

                // TotalRowCount reports the full count matching the filter regardless of the
                // keyset seek predicate, so the first page gives us a stable denominator.
                if (candidateTotal === 0) candidateTotal = pageResult.TotalRowCount;

                let pageEntities = pageResult.Results;
                if (attemptedIds) {
                    pageEntities = pageEntities.filter(e => !attemptedIds.has(e.PrimaryKey.ToString()));
                    if (pageEntities.length === 0) break; // everything left was already attempted this run
                    for (const e of pageEntities) attemptedIds.add(e.PrimaryKey.ToString());
                }

                if (!headerLogged) {
                    this.logEntityHeader(entityInfo, candidateTotal);
                    headerLogged = true;
                }

                const budget = maxRows - totalProcessed;
                const toProcess = pageEntities.slice(0, budget);
                const stats = await this.geocodeBatch(toProcess, entityInfo, contextUser, batchSize, {
                    Label: entityInfo.Name,
                    Total: candidateTotal,
                    Offset: totalProcessed,
                    Page: pageNumber
                });
                totalProcessed += stats.Processed;
                totalSuccess += stats.Success;

                // If this page was smaller than PAGE_SIZE, we've exhausted the entity
                if (pageResult.Results.length < ScheduledGeocodingAction.PAGE_SIZE) break;

                if (canUseKeyset) {
                    // Advance the seek cursor to the last record's PK on this page
                    const lastRecord = pageResult.Results[pageResult.Results.length - 1];
                    const lastValue = (lastRecord as unknown as Record<string, unknown>)[pkField.Name];
                    if (lastValue == null) break;
                    lastSeenKey = CompositeKey.FromKeyValuePair(pkField.Name, lastValue);
                }
            }

            if (headerLogged) {
                this.logEntityComplete(entityInfo, totalProcessed, totalSuccess);
            }

            return { Processed: totalProcessed, Success: totalSuccess };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`ScheduledGeocodingAction: Error querying missing records for ${entityInfo.Name}: ${msg}`);
            return { Processed: 0, Success: 0 };
        }
    }

    /**
     * Build the SQL filter selecting records that need geocoding work:
     *
     * - **missing** — has geo field data but no RecordGeoCode row at all
     * - **stale** — has a successful RecordGeoCode row, but the source record
     *   was updated after it was geocoded (`__mj_UpdatedAt > rgc.GeocodedAt`).
     *   This catches bulk SQL address updates that bypassed BaseEntity.Save().
     *   Records whose update didn't touch geo fields are cheaply "touched"
     *   (GeocodedAt refresh, no API call) by GeoCodeSyncService's
     *   touchOnHashMatch handling, so they exit this filter after one pass.
     *
     * The correlated subqueries reference the outer view by its exposed name
     * (unaliased base view), which both SQL Server and PostgreSQL support, and
     * mirror the RecordID format of the view's geo JOIN (single PK cast to
     * string; composite PK values CONCAT'd with '||').
     */
    private buildNeedsWorkFilter(
        entityInfo: EntityInfo,
        geoFields: EntityInfo['Fields'],
        rgcInfo: EntityInfo,
        dialect: SQLDialect
    ): string {
        const nonNullConditions = geoFields.map(f => `${f.Name} IS NOT NULL`).join(' OR ');
        const rgcRef = dialect.QuoteSchema(rgcInfo.SchemaName, rgcInfo.BaseView);
        const entityIdLit = dialect.QuoteStringLiteral(entityInfo.ID);
        const recordIdExpr = this.buildRecordIdExpression(entityInfo, dialect);
        const matchClause = `rgc.EntityID = ${entityIdLit} AND rgc.RecordID = ${recordIdExpr}`;
        const missingClause = `NOT EXISTS (SELECT 1 FROM ${rgcRef} rgc WHERE ${matchClause})`;

        const updatedAtField = entityInfo.Fields.find(f => f.Name.trim().toLowerCase() === '__mj_updatedat');
        if (!updatedAtField) {
            return `(${nonNullConditions}) AND ${missingClause}`;
        }

        const updatedAtRef = `${dialect.QuoteIdentifier(entityInfo.BaseView)}.${dialect.QuoteIdentifier(updatedAtField.Name)}`;
        const staleClause = `EXISTS (SELECT 1 FROM ${rgcRef} rgc WHERE ${matchClause} AND rgc.Status = 'success' AND ${updatedAtRef} > rgc.GeocodedAt)`;
        return `(${nonNullConditions}) AND (${missingClause} OR ${staleClause})`;
    }

    /**
     * SQL expression producing the outer record's RecordID string, matching the
     * format GeoCodeSyncService persists (and the view geo JOIN uses): a single
     * PK cast to a bounded string, or composite PK values joined with '||'.
     * Columns are qualified with the base view's exposed name so they resolve
     * to the outer query from inside the correlated subquery.
     */
    private buildRecordIdExpression(entityInfo: EntityInfo, dialect: SQLDialect): string {
        const viewRef = dialect.QuoteIdentifier(entityInfo.BaseView);
        const casts = entityInfo.PrimaryKeys.map(pk =>
            dialect.CastToBoundedString(`${viewRef}.${dialect.QuoteIdentifier(pk.Name)}`, 450)
        );
        if (casts.length === 1) return casts[0];
        const separator = dialect.QuoteStringLiteral('||');
        return `CONCAT(${casts.join(`, ${separator}, `)})`;
    }

    /**
     * Load a single page of entity records needing geocoding work.
     *
     * With a keyset column, uses **seek pagination** (`WHERE pk > @lastSeen
     * ORDER BY pk LIMIT N`) — O(log N) per page regardless of depth. Without
     * one (composite PK), fetches from the start each time; processed records
     * exit the needs-work filter, so the next fetch naturally returns the next
     * batch of unprocessed records.
     */
    private async loadEntityPage(
        entityName: string,
        needsWorkFilter: string,
        keysetPkName: string | null,
        lastSeenKey: CompositeKey | undefined,
        contextUser: UserInfo
    ): Promise<{ Success: boolean; Results: BaseEntity[]; TotalRowCount: number }> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: entityName,
            ExtraFilter: needsWorkFilter,
            OrderBy: keysetPkName ?? undefined,
            MaxRows: ScheduledGeocodingAction.PAGE_SIZE,
            AfterKey: keysetPkName ? lastSeenKey : undefined,
            BypassCache: true,
            ResultType: 'entity_object'
        }, contextUser);

        return {
            Success: result.Success,
            Results: result.Success ? (result.Results as unknown as BaseEntity[]) : [],
            TotalRowCount: result.Success ? result.TotalRowCount : 0
        };
    }

    // ================================================================
    // Step 2: Retry failed geocoding attempts
    // ================================================================

    /**
     * Retry failed geocoding attempts. Always refetches from the start of the
     * filtered set: processed rows change state (success, not_geocodable, or
     * RetryCount bump), so advancing an OFFSET over the shrinking/reordering
     * filter would skip rows. Rows already attempted this run are tracked in a
     * Set so re-failed rows (still matching the filter with a higher
     * RetryCount) can't cause an infinite loop.
     */
    private async processFailedRetries(
        contextUser: UserInfo,
        maxRetries: number,
        batchSize: number,
        maxTotal: number,
        provider?: IMetadataProvider
    ): Promise<{ Processed: number; Success: number }> {
        if (maxTotal <= 0) return { Processed: 0, Success: 0 };

        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const rv = new RunView();
        let totalProcessed = 0;
        let totalSuccess = 0;
        let retryTotal = 0;   // denominator: total failed-and-retriable rows (from page-1 TotalRowCount)
        const attemptedIds = new Set<string>();

        while (totalProcessed < maxTotal) {
            const pageResult = await rv.RunView<MJRecordGeoCodeEntity>({
                EntityName: 'MJ: Record Geo Codes',
                ExtraFilter: `Status='failed' AND RetryCount < ${maxRetries}`,
                OrderBy: 'RetryCount ASC, GeocodedAt ASC',
                MaxRows: ScheduledGeocodingAction.PAGE_SIZE,
                BypassCache: true,
                ResultType: 'entity_object'
            }, contextUser);

            if (!pageResult.Success || pageResult.Results.length === 0) break;

            const freshRecords = pageResult.Results.filter(r => !attemptedIds.has(r.ID));
            if (freshRecords.length === 0) break; // everything still failing was already attempted this run

            if (totalProcessed === 0) {
                retryTotal = Math.min(pageResult.TotalRowCount, maxTotal);
                LogStatus(`🔁 Retrying failed geocodes — ${this.fmt(retryTotal)} pending`);
            }

            const budget = maxTotal - totalProcessed;
            const records = freshRecords.slice(0, budget);
            for (const r of records) attemptedIds.add(r.ID);

            // Group by entity for efficient processing
            const byEntity = new Map<string, MJRecordGeoCodeEntity[]>();
            for (const geoRecord of records) {
                const key = geoRecord.EntityID;
                let arr = byEntity.get(key);
                if (!arr) {
                    arr = [];
                    byEntity.set(key, arr);
                }
                arr.push(geoRecord);
            }

            for (const [entityId, geoRecords] of byEntity) {
                const entityInfo = md.EntityByID(entityId);
                if (!entityInfo) continue;

                const entities = await this.loadSourceEntities(geoRecords, entityInfo, contextUser, provider);
                if (entities.length === 0) continue;

                const stats = await this.geocodeBatch(entities, entityInfo, contextUser, batchSize, {
                    Label: entityInfo.Name,
                    Total: retryTotal,
                    Offset: totalProcessed
                });
                totalSuccess += stats.Success;
            }

            // Count every claimed row as processed — including rows whose source
            // record no longer exists (they're cleaned up by the orphan step).
            totalProcessed += records.length;

            if (pageResult.Results.length < ScheduledGeocodingAction.PAGE_SIZE) break;
        }

        return { Processed: totalProcessed, Success: totalSuccess };
    }

    /**
     * Load source entity records for a set of RecordGeoCode rows.
     * Skips records whose source entity no longer exists.
     */
    private async loadSourceEntities(
        geoRecords: MJRecordGeoCodeEntity[],
        entityInfo: EntityInfo,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<BaseEntity[]> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const entities: BaseEntity[] = [];

        for (const geoRecord of geoRecords) {
            try {
                const entity = await md.GetEntityObject(entityInfo.Name, contextUser);
                const pk = new CompositeKey([{ FieldName: 'ID', Value: geoRecord.RecordID }]);
                const loaded = await entity.InnerLoad(pk);
                if (loaded) {
                    entities.push(entity);
                }
            } catch {
                // Source record doesn't exist or can't be loaded — skip
            }
        }

        return entities;
    }

    // ================================================================
    // Step 3: Orphan cleanup
    // ================================================================

    /**
     * Remove RecordGeoCode rows whose source entity record no longer exists.
     * Processes one entity at a time, paginating orphan queries to avoid loading
     * all orphan rows into memory simultaneously.
     */
    private async cleanupOrphanedRecords(
        contextUser: UserInfo,
        batchSize: number,
        provider?: IMetadataProvider
    ): Promise<number> {
        const rv = new RunView();
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        // Resolve the dialect for the active provider once — the orphan filter
        // is built per-entity but the dialect (SQL Server vs PostgreSQL) is
        // bound to the provider, not the entity, so deriving it here keeps
        // the per-entity loop dialect-agnostic.
        const platformKey = (md as unknown as DatabaseProviderBase).PlatformKey ?? 'sqlserver';
        const dialect = GetDialect(platformKey);
        let totalRemoved = 0;

        const entityIds = await this.getDistinctGeoCodeEntityIds(rv, contextUser);

        for (const entityId of entityIds) {
            try {
                const entityInfo = md.EntityByID(entityId);
                if (!entityInfo) continue;

                const pkField = entityInfo.FirstPrimaryKey;
                if (!pkField) continue;

                const entityRemoved = await this.cleanupOrphansForEntity(
                    entityId, entityInfo, pkField.Name, contextUser, batchSize, rv, dialect
                );
                totalRemoved += entityRemoved;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`ScheduledGeocodingAction: Orphan cleanup error for entity ${entityId}: ${msg}`);
            }
        }

        return totalRemoved;
    }

    /**
     * Enumerate the distinct EntityIDs present in RecordGeoCode with a keyset
     * loop — each iteration seeks the next EntityID above the last one seen
     * (`TOP 1 ... WHERE EntityID > @last ORDER BY EntityID`), so the cost is
     * one indexed point query per distinct entity instead of streaming every
     * row's EntityID into memory for a client-side distinct. GUID string
     * comparison semantics differ per platform but are self-consistent with
     * ORDER BY on the same column, which is all cursor advancement needs.
     */
    private async getDistinctGeoCodeEntityIds(rv: RunView, contextUser: UserInfo): Promise<string[]> {
        const entityIds: string[] = [];
        let lastEntityId: string | null = null;

        for (;;) {
            const page = await rv.RunView<{ EntityID: string }>({
                EntityName: 'MJ: Record Geo Codes',
                Fields: ['EntityID'],
                ExtraFilter: lastEntityId ? `EntityID > '${lastEntityId}'` : '',
                OrderBy: 'EntityID',
                MaxRows: 1,
                ResultType: 'simple',
                BypassCache: true
            }, contextUser);

            if (!page.Success || page.Results.length === 0) break;
            lastEntityId = page.Results[0].EntityID;
            entityIds.push(lastEntityId);
        }

        return entityIds;
    }

    /**
     * Paginated orphan cleanup for a single entity. Fetches pages of orphan rows,
     * deletes them, then fetches the next page. Since deleted rows disappear from
     * subsequent queries, we always fetch from offset 0.
     */
    private async cleanupOrphansForEntity(
        entityId: string,
        entityInfo: EntityInfo,
        pkFieldName: string,
        contextUser: UserInfo,
        batchSize: number,
        rv: RunView,
        dialect: SQLDialect
    ): Promise<number> {
        let entityRemoved = 0;
        const sourceRef = dialect.QuoteSchema(entityInfo.SchemaName, entityInfo.BaseView);
        const pkRef = `src.${dialect.QuoteIdentifier(pkFieldName)}`;
        const pkAsString = dialect.CastToBoundedString(pkRef, 450);
        const entityIdLit = dialect.QuoteStringLiteral(entityId);
        const orphanFilter = `EntityID = ${entityIdLit} AND NOT EXISTS (SELECT 1 FROM ${sourceRef} src WHERE ${pkAsString} = RecordID)`;

        // Paginate: fetch a page, delete it, repeat. Since we're deleting rows,
        // always query from the start — deleted rows won't appear again.
        let hasMore = true;
        while (hasMore) {
            const orphanResult = await rv.RunView<MJRecordGeoCodeEntity>({
                EntityName: 'MJ: Record Geo Codes',
                ExtraFilter: orphanFilter,
                MaxRows: ScheduledGeocodingAction.PAGE_SIZE,
                BypassCache: true,
                ResultType: 'entity_object'
            }, contextUser);

            if (!orphanResult.Success || orphanResult.Results.length === 0) break;

            const orphans = orphanResult.Results;
            for (let i = 0; i < orphans.length; i += batchSize) {
                const batch = orphans.slice(i, i + batchSize);
                const results = await Promise.allSettled(batch.map(o => o.Delete()));
                entityRemoved += results.filter(r => r.status === 'fulfilled' && r.value).length;
            }

            // If we got fewer than PAGE_SIZE, we've exhausted the orphans
            hasMore = orphans.length >= ScheduledGeocodingAction.PAGE_SIZE;
        }

        if (entityRemoved > 0) {
            LogStatus(`🧹 ${entityInfo.Name} — removed ${this.fmt(entityRemoved)} orphaned geo records`);
        }
        return entityRemoved;
    }

    // ================================================================
    // Core: parallel batch geocoding with cache invalidation
    // ================================================================

    /**
     * Geocode a list of entity records in parallel batches, then fire cache
     * invalidation events for each successfully geocoded record (when an
     * in-process cache consumer exists — see {@link cacheInvalidationNeeded}).
     *
     * @param entities - Pre-loaded BaseEntity instances to geocode
     * @param entityInfo - Entity metadata
     * @param contextUser - User context
     * @param batchSize - Number of concurrent geocoding operations per batch
     * @param progress - Optional console progress context. When supplied, each batch logs a
     *   cumulative `records X–Y of Total` line (anchored to `progress.Offset`) instead of a
     *   per-call `batch N/M` line that resets every page.
     */
    private async geocodeBatch(
        entities: BaseEntity[],
        entityInfo: EntityInfo,
        contextUser: UserInfo,
        batchSize: number,
        progress?: BatchProgress
    ): Promise<{ Processed: number; Success: number }> {
        let totalSuccess = 0;
        const invalidationNeeded = this.cacheInvalidationNeeded(entityInfo);

        for (let i = 0; i < entities.length; i += batchSize) {
            const batch = entities.slice(i, i + batchSize);

            const results = await Promise.allSettled(
                batch.map(entity => this.geocodeAndInvalidate(entity, contextUser, invalidationNeeded))
            );

            const batchSuccess = results.filter(r => r.status === 'fulfilled' && r.value).length;
            totalSuccess += batchSuccess;

            if (progress) {
                this.logBatchProgress(progress, i, batch.length, batchSuccess);
            }
        }

        return { Processed: entities.length, Success: totalSuccess };
    }

    /**
     * Determine whether post-geocode cache invalidation work (entity reload +
     * synthetic save event) has any in-process consumer:
     *
     * - **LocalCacheManager** — relevant when it's initialized AND caching is
     *   allowed for this entity. (The per-entity fingerprint index isn't
     *   consulted because shared storage backends like Redis can hold entries
     *   the local index doesn't know about.)
     * - **BaseEngine caches** — any loaded engine holding this entity's rows
     *   updates them from save events.
     *
     * When neither applies, the reload + event would be pure overhead (one
     * extra SQL round trip per geocoded record), so callers skip it. The
     * synthetic event is process-local either way, so skipping it never
     * changes cross-server behavior.
     */
    private cacheInvalidationNeeded(entityInfo: EntityInfo): boolean {
        const lcm = LocalCacheManager.Instance;
        if (lcm.IsInitialized && lcm.IsCachingEnabledForEntity(entityInfo)) return true;
        return BaseEngineRegistry.Instance.FindCachedEntity(entityInfo.Name).length > 0;
    }

    /**
     * Geocode a single entity record and (when needed) fire a cache
     * invalidation event.
     *
     * After geocoding updates the RecordGeoCode row, we need to tell the
     * cache system that this entity record's view data has changed (because
     * the view JOINs to RecordGeoCode for __mj_Latitude/__mj_Longitude).
     * We do this by firing a synthetic BaseEntity 'save' event with the
     * entity instance — the same event that BaseEntity.Save() fires.
     *
     * @returns true if geocoding succeeded, false otherwise
     */
    private async geocodeAndInvalidate(
        entity: BaseEntity,
        contextUser: UserInfo,
        invalidationNeeded: boolean
    ): Promise<boolean> {
        try {
            const result = await GeoCodeSyncService.Instance.SyncIfChanged(entity, contextUser, {
                providerName: this.currentGeocodingProvider,
                memo: this.runMemo,
                touchOnHashMatch: true
            });

            if (result && invalidationNeeded) {
                // Geocoding produced new coordinates — fire cache invalidation.
                // Reload the entity to pick up fresh data from the view (including
                // the updated __mj_Latitude/__mj_Longitude from RecordGeoCode JOIN),
                // then raise a save event so LocalCacheManager updates its caches.
                await entity.InnerLoad(entity.PrimaryKey);
                this.fireSyntheticSaveEvent(entity);
            }

            return true;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`ScheduledGeocodingAction: Failed to geocode ${entity.EntityInfo.Name} record: ${msg}`);
            return false;
        }
    }

    /**
     * Fire a synthetic BaseEntity 'save' event via MJGlobal so that
     * LocalCacheManager and BaseEngine listeners pick up the change.
     *
     * This is the same event that BaseEntity.RaiseEvent() fires after
     * a successful Save(), but triggered externally because the record's
     * view data changed due to a RecordGeoCode update (not a direct save).
     *
     * The entity instance is passed as both `component` and `event.baseEntity`
     * so cache handlers can read EntityInfo, PrimaryKeys, and GetAll() —
     * exactly the same contract as a real save event.
     */
    private fireSyntheticSaveEvent(entity: BaseEntity): void {
        const event = new BaseEntityEvent();
        event.type = 'save';
        event.saveSubType = 'update';
        event.baseEntity = entity;
        // Match BaseEntity.RaiseEvent() contract: include the entity's bound provider so
        // multi-provider listeners (LocalCacheManager, BaseEngine, …) scope correctly.
        event.provider = entity.ProviderToUse as unknown as IMetadataProvider | undefined;
        event.payload = null;

        MJGlobal.Instance.RaiseEvent({
            component: entity,
            event: MJEventType.ComponentEvent,
            eventCode: BaseEntity.BaseEventCode,
            args: event
        });
    }

    // ================================================================
    // Console UX helpers
    // ================================================================

    /**
     * Format an integer with locale thousands separators for console output
     * (e.g. `2000` → `2,000`). Pinned to `en-US` for deterministic logs.
     */
    private fmt(n: number): string {
        return n.toLocaleString('en-US');
    }

    /**
     * Emit the group header that precedes a single entity's batch lines, e.g.
     * `📍 Members — 2,000 records needing geocoding`.
     */
    private logEntityHeader(entityInfo: EntityInfo, candidateTotal: number): void {
        const scope = candidateTotal > 0
            ? `${this.fmt(candidateTotal)} records needing geocoding`
            : 'records needing geocoding';
        LogStatus(`📍 ${entityInfo.Name} — ${scope}`);
    }

    /**
     * Emit one indented, cumulative batch line beneath the entity header, e.g.
     * `   ✓ records 1,991–2,000 of 2,000 · 10/10  (page 4)`. The range is anchored
     * to `progress.Offset` so the numbers run continuously across every page.
     */
    private logBatchProgress(progress: BatchProgress, localIndex: number, batchCount: number, batchSuccess: number): void {
        const start = progress.Offset + localIndex + 1;
        const end = progress.Offset + localIndex + batchCount;
        const total = progress.Total > 0 ? this.fmt(progress.Total) : '?';
        const allOk = batchSuccess === batchCount;
        const icon = allOk ? '✓' : '⚠';
        const failNote = allOk ? '' : ` · ${this.fmt(batchCount - batchSuccess)} failed`;
        const pageNote = progress.Page != null ? `  (page ${progress.Page})` : '';
        LogStatus(`${ScheduledGeocodingAction.INDENT}${icon} records ${this.fmt(start)}–${this.fmt(end)} of ${total} · ${batchSuccess}/${batchCount}${failNote}${pageNote}`);
    }

    /**
     * Emit the indented per-entity completion line, e.g.
     * `   ✅ Members — 1,974 geocoded, 26 failed`. Since the SQL filter only
     * returns records needing work, processed = geocoded + failed (records
     * touched by the stale sweep with an unchanged hash count as geocoded work
     * performed without an API call).
     */
    private logEntityComplete(entityInfo: EntityInfo, processed: number, success: number): void {
        const failed = processed - success;
        const parts = [`${this.fmt(success)} geocoded`];
        if (failed > 0) parts.push(`${this.fmt(failed)} failed`);
        LogStatus(`${ScheduledGeocodingAction.INDENT}✅ ${entityInfo.Name} — ${parts.join(', ')}`);
    }

    // ================================================================
    // Helpers
    // ================================================================

    /**
     * Get the geo address fields (non-lat/lng) for an entity.
     * These are the fields that, when non-null, indicate a record
     * should have a geocode.
     */
    private getGeoAddressFields(entityInfo: EntityInfo): EntityInfo['Fields'] {
        return entityInfo.Fields.filter(f =>
            f.ExtendedType != null && f.ExtendedType.startsWith('Geo') &&
            f.ExtendedType !== 'GeoLatitude' && f.ExtendedType !== 'GeoLongitude'
        );
    }

    /**
     * Extract a numeric parameter with a default value.
     */
    private getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) return defaultValue;
        const parsed = Number(param.Value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Extract an optional string parameter, returning null if absent or empty.
     */
    private getStringParam(params: RunActionParams, name: string): string | null {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) return null;
        const v = String(param.Value).trim();
        return v.length > 0 ? v : null;
    }
}
