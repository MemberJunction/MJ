import { BaseEngine, BaseEnginePropertyConfig, BaseEntity, CompositeKey, ConsoleColor, EntityFieldTSType, EntityInfo, IMetadataProvider, LogError, LogStatus, Metadata, RunQuery, RunView, UpdateCurrentConsoleLine, UpdateCurrentConsoleProgress, UserInfo } from "@memberjunction/core";
import { MJRecordChangeReplayRunEntity } from "@memberjunction/core-entities";
import { UUIDsEqual } from "@memberjunction/global";
import { SQLServerDataProvider, SQLServerProviderConfigData } from "@memberjunction/sqlserver-dataprovider";
import { PostgreSQLDialect, SQLDialect, SQLServerDialect } from "@memberjunction/sql-dialect";
import { getHeapStatistics } from "v8";

/**
 * Maximum number of rows per detection query page. Since changes are replayed
 * per-entity and then discarded (not accumulated), this can be generous.
 */
const DETECTION_PAGE_SIZE = 5000;

/**
 * Abort the entire run if this percentage of entities fail detection.
 * Prevents hammering a database that's clearly under pressure.
 */
const FAILURE_ABORT_THRESHOLD = 0.5;

/**
 * Number of consecutive entity failures that triggers a cooldown pause.
 * After this many failures in a row, the engine pauses before continuing
 * to let the database recover.
 */
const CONSECUTIVE_FAILURE_COOLDOWN_THRESHOLD = 5;

/**
 * Milliseconds to pause after hitting the consecutive failure threshold.
 */
const COOLDOWN_PAUSE_MS = 30_000;

/**
 * Maximum percentage of Node.js heap that can be used before the engine
 * skips remaining entities to prevent OOM crashes.
 */
const HEAP_USAGE_LIMIT_PERCENT = 0.85;


/**
 * Represents a change to a single field in a record
 */
export class FieldChange {
    public FieldName: string;
    public OldValue: any;
    public NewValue: any;
}

/**
 * Represents a change to a single record in an entity
 */
export class ChangeDetectionItem {
    public Entity: EntityInfo;
    public PrimaryKey: CompositeKey;
    public Type: 'Create' | 'Update' | 'Delete';
    public ChangedAt: Date;
    public Changes: FieldChange[];
    /**
     * Populated for Create and Update types only. This is the latest version of the record from the organic database table
     */
    public LatestRecord?: BaseEntity;

    public LegacyKey?: boolean = false; // if true, this means that the key was a single value and not a concatenated key
    public LegacyKeyValue?: string; // if LegacyKey is true, this will be the single value of the key
}

/**
 * Result type for a change detection operation
 */
export class ChangeDetectionResult {
    public Success: boolean;
    public ErrorMessage?: string;
    public Changes: ChangeDetectionItem[];
}

/**
 * Engine to handle detection of external changes and "replay" them in MemberJunction to invoke all standard functionality
 * such as BaseEntity sub-classes as well as any custom logic that are tied to the system via Actions/AI Actions/etc...
 * 
 * This is a server only package
 */
export class ExternalChangeDetectorEngine extends BaseEngine<ExternalChangeDetectorEngine> {
    private _dialect: SQLDialect;

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider) {
        const p = <SQLServerDataProvider> ( provider || Metadata.Provider );
        
        // Initialize dialect
        const platform = (p as any).DatabasePlatform || 'sqlserver';
        this._dialect = platform === 'postgresql' ? new PostgreSQLDialect() : new SQLServerDialect();

        const c: Array<Partial<BaseEnginePropertyConfig>> = [
            {
                EntityName: "MJ: Entities",
                PropertyName: "_EligibleEntities",
                Filter: `ID IN (SELECT ID FROM ${p.MJCoreSchemaName}.vwEntitiesWithExternalChangeTracking)`, // limit to entities that are in this view. This view has the logic which basically is TrackRecordChanges=1 and also has an UpdatedAt field
                CacheLocal: true
            }
        ];
        await this.Load(c, provider, forceRefresh, contextUser);
    }

    public static get Instance(): ExternalChangeDetectorEngine {
        return super.getInstance<ExternalChangeDetectorEngine>();
    }


    private _IneligibleEntities: string[] = [];// ['Entities', 'MJ: Entity Fields', 'MJ: Entity Field Values', 'MJ: Entity Relationships', 'MJ: Record Changes']; // default ineligible entities --- turned off for now
    /**
     * A list of entities that will automatically be excluded from all calls to this class. This array is used as a "safety"
     * mechanism to prevent the system from trying to replay changes to these entities which wouldn't negatively affect system integrity
     * but could cause performance issues. If you want to add/remove entities to this list, you can do so by manipulating this array.
     * 
     * If you want to run Change Detection and/or replay changes for entities in this array, you will need to remove them
     * in your code before calling the methods in this class. While executing methods on this class with these default 
     * ineligible entities will not cause any issues, they may take a long time to run and utilize a significant amount
     * of resources. 
     */
    public get IneligibleEntities(): string[] {
        return this._IneligibleEntities;
    }


    private _EligibleEntities: EntityInfo[];
    /**
     * A list of the entities that are eligible for external change detection. This is determined by using the underlying 
     * database view vwEntitiesWithExternalChangeTracking which is a view that is maintained by the MJ system and is used to
     * find a list of entities that have the required characteristics that support external change detection. These characteristics
     * include:
     *  * The entity has the TrackRecordChanges property set to 1
     *  * The entity has the special UpdatedAt/CreatedAt fields (which are called __mj_UpdatedAt and __mj_CreatedAt in the database). These fields are AUTOMATICALLY added to an entity that has TrackRecordChanges set to 1 by the MJ CodeGen tool.
     *  * The entity is not in the IneligibleEntities list. See info on the IneligibleEntities property for more information on excluded entities.
     */
    public get EligibleEntities(): EntityInfo[] {
        const netEligible = this._EligibleEntities.filter(e => !this.IneligibleEntities.map(i => i.toLowerCase().trim()).includes(e.Name.toLowerCase().trim()));
        return netEligible;
    }

    /**
     * Detects external changes for a single entity. Results are paginated
     * (DETECTION_PAGE_SIZE rows per query) to cap memory regardless of how
     * many untracked records exist.
     *
     * Detection queries return ot.* so we build LatestRecord inline —
     * no second round-trip to the database.
     */
    public async DetectChangesForEntity(entity: EntityInfo): Promise<ChangeDetectionResult> {
        try {
            this.validateEntityEligibility(entity);

            const md = new Metadata();
            const rq = new RunQuery();
            const params = this.buildDetectionParams(entity);
            const changes: ChangeDetectionItem[] = [];

            // Detect creations (paginated)
            await this.detectPages(rq, 'ExternalChangeDetection_DetectCreations', params.creation, async (row) => {
                const item = this.buildChangeItem(entity, row, 'Create');
                const created = new Date(row.__ecd_CreatedAt as string);
                const updated = new Date(row.__ecd_UpdatedAt as string);
                item.ChangedAt = created >= updated ? created : updated;
                item.LatestRecord = await this.buildEntityFromRow(md, entity, row);
                changes.push(item);
            });

            // Track creation PKs so we can skip duplicates in update detection
            const createdKeys = new Set(changes.map(c => c.PrimaryKey.ToConcatenatedString()));

            // Detect updates (paginated)
            await this.detectPages(rq, 'ExternalChangeDetection_DetectUpdates', params.update, async (row) => {
                const item = this.buildChangeItem(entity, row, 'Update');
                item.ChangedAt = new Date(row.__ecd_UpdatedAt as string);
                // skip if already detected as a creation
                if (!createdKeys.has(item.PrimaryKey.ToConcatenatedString())) {
                    item.LatestRecord = await this.buildEntityFromRow(md, entity, row);
                    changes.push(item);
                }
            });

            // Detect deletions (single call — bounded by RecordChange entries, not entity size)
            const deleteResult = await rq.RunQuery({
                QueryName: 'ExternalChangeDetection_DetectDeletions',
                Parameters: params.deletion
            }, this.ContextUser);
            if (deleteResult?.Success) {
                for (const row of deleteResult.Results) {
                    changes.push(this.buildDeleteItem(entity, row));
                }
            }

            // Determine field-level changes for updates
            for (const c of changes) {
                if (c.Type === 'Update') {
                    const result = await this.DetermineRecordChanges(md, c);
                    c.Changes = result.changes;
                }
            }

            return { Success: true, Changes: changes };
        }
        catch (e) {
            LogError(e);
            return { Success: false, ErrorMessage: e.message, Changes: [] };
        }
    }

    /**
     * Validates that entity is non-null and in the eligible list.
     */
    private validateEntityEligibility(entity: EntityInfo): void {
        if (!entity)
            throw new Error("entity parameter is required");

        if (!this.EligibleEntities.find(e => UUIDsEqual(e.ID, entity.ID)))
            throw new Error(`Entity ${entity.Name} is not eligible for external change detection. Refer to the documentation on the EligibleEntities and IneligibleEntities properties for more information.`);
    }

    /**
     * Builds the template parameter objects for all three detection queries.
     */
    private buildDetectionParams(entity: EntityInfo): {
        creation: Record<string, string>,
        update: Record<string, string>,
        deletion: Record<string, string>
    } {
        const base = {
            EntityID: entity.ID,
            SchemaName: entity.SchemaName,
            BaseView: entity.BaseView,
            PrimaryKeyJoin: this.getPrimaryKeyString(entity, 'ot'),
            PrimaryKeyOrderBy: entity.PrimaryKeys.map(pk => `ot.${this._dialect.QuoteIdentifier(pk.Name)}`).join(', ')
        };
        return {
            creation: {
                ...base,
                CreatedAtField: EntityInfo.CreatedAtFieldName,
                UpdatedAtField: EntityInfo.UpdatedAtFieldName
            },
            update: {
                ...base,
                UpdatedAtField: EntityInfo.UpdatedAtFieldName
            },
            deletion: {
                EntityID: base.EntityID,
                SchemaName: base.SchemaName,
                BaseView: base.BaseView,
                PrimaryKeyJoin: base.PrimaryKeyJoin,
                PrimaryKeyIsNull: entity.PrimaryKeys.map(pk =>
                    `ot.${this._dialect.QuoteIdentifier(pk.Name)} IS NULL`
                ).join(' AND ')
            }
        };
    }

    /**
     * Runs a detection query in pages of DETECTION_PAGE_SIZE, calling the
     * provided handler for each result row. Stops when a page returns fewer
     * rows than the page size.
     *
     * If a page query fails (timeout, connection error, etc.), logs the error
     * and stops pagination for this entity rather than retrying or crashing.
     * The caller's try/catch in DetectChangesForEntity will report partial results.
     */
    private async detectPages(
        rq: RunQuery,
        queryName: string,
        parameters: Record<string, string>,
        handleRow: (row: Record<string, unknown>) => Promise<void>
    ): Promise<void> {
        let startRow = 0;

        for (;;) {
            const result = await rq.RunQuery({
                QueryName: queryName,
                Parameters: parameters,
                MaxRows: DETECTION_PAGE_SIZE,
                StartRow: startRow
            }, this.ContextUser);

            if (!result?.Success) {
                // Query failed (timeout, connection error, etc.) — stop paginating
                // this entity. Don't throw — let the caller report partial results.
                LogError(`Detection query ${queryName} failed at offset ${startRow}: ${result?.ErrorMessage || 'unknown error'}`);
                break;
            }

            if (result.Results.length === 0)
                break;

            for (const row of result.Results) {
                await handleRow(row);
            }

            // If we got fewer rows than requested, this was the last page
            if (result.Results.length < DETECTION_PAGE_SIZE)
                break;

            startRow += DETECTION_PAGE_SIZE;
        }
    }

    /**
     * Builds a ChangeDetectionItem with PrimaryKey extracted from a query result row.
     */
    private buildChangeItem(
        entity: EntityInfo,
        row: Record<string, unknown>,
        type: 'Create' | 'Update'
    ): ChangeDetectionItem {
        const item = new ChangeDetectionItem();
        item.Entity = entity;
        item.PrimaryKey = new CompositeKey(entity.PrimaryKeys.map(pk => ({
            FieldName: pk.Name,
            Value: row[pk.Name]
        })));
        item.Type = type;
        item.ChangedAt = new Date();
        item.Changes = [];
        return item;
    }

    /**
     * Builds a ChangeDetectionItem for a deletion from a RecordChanges row.
     */
    private buildDeleteItem(entity: EntityInfo, row: Record<string, unknown>): ChangeDetectionItem {
        const item = new ChangeDetectionItem();
        item.Entity = entity;
        const ck = new CompositeKey();
        const recordID = row.RecordID as string;

        // Legacy data may have a bare value instead of Field|Value format
        if (recordID.indexOf(CompositeKey.DefaultValueDelimiter) === -1) {
            ck.LoadFromSingleKeyValuePair(entity.PrimaryKeys[0].Name, recordID);
            item.LegacyKey = true;
            item.LegacyKeyValue = recordID;
        }
        else {
            ck.LoadFromConcatenatedString(recordID);
        }

        item.PrimaryKey = ck;
        item.Type = 'Delete';
        item.ChangedAt = row.ChangedAt as Date;
        item.Changes = [];
        return item;
    }

    /**
     * Creates a BaseEntity instance and loads it with data from a query result row.
     * Strips __ecd_ prefixed columns (our timestamp aliases) before loading to
     * avoid "field not found in entity" warnings from BaseEntity.SetMany().
     */
    private async buildEntityFromRow(
        md: Metadata,
        entity: EntityInfo,
        row: Record<string, unknown>
    ): Promise<BaseEntity> {
        const cleanRow: Record<string, unknown> = {};
        for (const key of Object.keys(row)) {
            if (!key.startsWith('__ecd_'))
                cleanRow[key] = row[key];
        }
        const record = await md.GetEntityObject(entity.Name, this.ContextUser);
        await record.LoadFromData(cleanRow);
        return record;
    }

    /**
     * Compares the current record with the last RecordChange snapshot to determine field-level changes.
     */
    public async DetermineRecordChanges(md: Metadata, change: ChangeDetectionItem): Promise<{changes: FieldChange[], latestRecord: BaseEntity}> {
        try {
            const record = change.LatestRecord;
            if (!record)
                return {changes: [], latestRecord: null};

            const result = await this.GetLatestRecordChangesDataForEntityRecord(change);
            const fullRecordJSON = result?.FullRecordJSON as string | undefined;
            if (fullRecordJSON?.length > 0) {
                const json = JSON.parse(fullRecordJSON);
                const changes: FieldChange[] = [];
                for (const field of record.Fields) {
                    if (!field.IsPrimaryKey) {
                        const differResult = this.DoValuesDiffer(field.FieldType, field.Value, json[field.Name]);
                        if (differResult.differ) {
                            changes.push({
                                FieldName: field.Name,
                                NewValue: differResult.castValue1,
                                OldValue: differResult.castValue2
                            });
                        }
                    }
                }
                return {changes, latestRecord: record};
            }
            else {
                LogStatus(`      WARNING: No record found, or no FullRecordJSON found, in vwRecordChanges for ${change.Entity.Name}: ${change.PrimaryKey.ToConcatenatedString()}`);
                return {changes: [], latestRecord: record};
            }
        }
        catch (e) {
            LogError(e);
            return {changes: [], latestRecord: null};
        }
    }

    protected DoValuesDiffer(tsType: EntityFieldTSType, value1: unknown, value2: unknown): {differ: boolean, castValue1: unknown, castValue2: unknown} {
        let castValue1: unknown = value1;
        let castValue2: unknown = value2;

        switch (tsType) {
            case EntityFieldTSType.Date:
                castValue1 = value1 ? new Date(value1 as string) : null;
                castValue2 = value2 ? new Date(value2 as string) : null;
                if (castValue1 && castValue2) {
                    const d1 = (castValue1 as Date).getTime();
                    const d2 = (castValue2 as Date).getTime();
                    return {differ: d1 !== d2, castValue1, castValue2};
                }
                return {differ: castValue1 !== castValue2, castValue1, castValue2};
            case EntityFieldTSType.Number:
                castValue1 = value1 ? parseFloat(value1 as string) : 0;
                castValue2 = value2 ? parseFloat(value2 as string) : 0;
                return {differ: castValue1 !== castValue2, castValue1, castValue2};
            case EntityFieldTSType.Boolean:
                castValue1 = this.CastToBoolean(value1);
                castValue2 = this.CastToBoolean(value2);
                return {differ: castValue1 !== castValue2, castValue1, castValue2};
            default:
                castValue1 = value1 ? (value1 as string).toString().trim() : '';
                castValue2 = value2 ? (value2 as string).toString().trim() : '';
                return {differ: castValue1 !== castValue2, castValue1, castValue2};
        }
    }

    /**
     * Casts a value to a boolean, properly handling string representations like 'false' and '0'
     * which are truthy in JavaScript but should be treated as false.
     */
    protected CastToBoolean(value: unknown): boolean {
        if (typeof value === 'string') {
            const lower = value.toLowerCase().trim();
            return lower === 'true' || lower === '1';
        }
        return !!value;
    }

    protected async GetLatestRecordChangesDataForEntityRecord(change: ChangeDetectionItem): Promise<Record<string, unknown> | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: "MJ: Record Changes",
                ExtraFilter: `EntityID = '${change.Entity.ID}' AND RecordID = '${change.PrimaryKey.ToConcatenatedString()}' AND Type IN ('Update', 'Create')`,
                OrderBy: "ChangedAt DESC"
            }, this.ContextUser);

            if (result?.Success && result.Results.length > 0)
                return result.Results[0] as Record<string, unknown>;

            return null;
        }
        catch (e) {
            LogError(e);
            return null;
        }
    }

    protected getPrimaryKeyString(entity: EntityInfo, tablePrefix: string): string {
        const concatOp = this._dialect.ConcatOperator();
        const castToText = (expr: string) => this._dialect.CastToText(expr);
        const quote = (id: string) => this._dialect.QuoteIdentifier(id);
        const table = quote(tablePrefix);

        return entity.PrimaryKeys.map(pk => 
            `'${pk.Name}${CompositeKey.DefaultValueDelimiter}' ${concatOp} ${castToText(`${table}.${quote(pk.Name)}`)}`
        ).join(` ${concatOp} '${CompositeKey.DefaultFieldDelimiter}' ${concatOp} `);
    }

    /**
     * Row count thresholds for dynamic concurrency. Entities are sorted smallest-first
     * and processed with a concurrency level appropriate to their size.
     * Conservative values to avoid overwhelming production databases where
     * detection queries use string-concat PK joins that force full table scans.
     */
    private static readonly CONCURRENCY_TIERS = [
        { maxRows: 1_000,     concurrency: 5 },  // tiny tables
        { maxRows: 10_000,    concurrency: 3 },  // small tables
        { maxRows: 50_000,    concurrency: 2 },  // medium tables
        { maxRows: Infinity,  concurrency: 1 },  // large tables — one at a time
    ];

    /**
     * Detects and replays external changes for the specified entities in an interleaved
     * fashion: each entity's changes are detected, replayed, and then discarded before
     * moving to the next entity. This keeps memory bounded to one entity's changes at
     * a time rather than accumulating all changes across all entities.
     *
     * Entity concurrency is dynamically determined from approximate row counts
     * (via sys.partitions) so small tables run in parallel while large tables
     * don't overwhelm the DB.
     *
     * Production safety mechanisms:
     * - **Circuit breaker**: Aborts if >50% of entities fail
     * - **Cooldown**: Pauses 30s after 5 consecutive failures
     * - **Heap guard**: Stops if heap usage exceeds 85%
     *
     * @param entities Array of entities to process
     * @param replayBatchSize Concurrent replays per entity. Defaults to 20.
     * @param maxConcurrency Max parallel entity detection. Defaults to 5.
     * @param staleTimeoutHours Hours before a stuck run is considered stale. Defaults to 24.
     * @returns Summary with success status and aggregate counts
     */
    public async DetectAndReplayChanges(
        entities: EntityInfo[],
        replayBatchSize: number = 20,
        maxConcurrency: number = 5,
        staleTimeoutHours: number = 24
    ): Promise<{ Success: boolean; ErrorMessage?: string; TotalDetected: number; TotalReplayed: number; EntitiesProcessed: number; EntitiesFailed: number }> {
        if (!entities || entities.length === 0)
            throw new Error("entities parameter is required and must have at least one entity");

        const rowCounts = await this.getApproxRowCounts(entities);
        const sortedEntities = rowCounts.size > 0
            ? [...entities].sort((a, b) => (rowCounts.get(a.ID) ?? 0) - (rowCounts.get(b.ID) ?? 0))
            : entities;

        LogStatus(`Detecting and replaying changes for ${sortedEntities.length} entities with dynamic concurrency (max ${maxConcurrency})`);

        // Start the replay run record (ensures no concurrent runs)
        const run = await this.StartRun(staleTimeoutHours);
        const replayProviders = await this.createReplayProviders(replayBatchSize);

        let entitiesProcessed = 0;
        let entitiesFailed = 0;
        let consecutiveFailures = 0;
        let totalDetected = 0;
        let totalReplayed = 0;
        let aborted = false;
        let i = 0;

        try {
            while (i < sortedEntities.length && !aborted) {
                // Heap guard
                if (this.isHeapPressureHigh()) {
                    LogStatus(`   ⚠ Heap usage exceeds ${Math.round(HEAP_USAGE_LIMIT_PERCENT * 100)}%, stopping to prevent OOM (${entitiesProcessed}/${sortedEntities.length} processed)`);
                    aborted = true;
                    break;
                }

                // Circuit breaker
                if (entitiesProcessed >= 10 && entitiesFailed / entitiesProcessed > FAILURE_ABORT_THRESHOLD) {
                    LogStatus(`   ⚠ Circuit breaker: ${entitiesFailed}/${entitiesProcessed} entities failed, aborting`);
                    aborted = true;
                    break;
                }

                // Dynamic concurrency for detection (entities run in parallel)
                const dynamicSize = this.getConcurrencyForEntity(sortedEntities[i], rowCounts);
                const concurrency = Math.min(dynamicSize, maxConcurrency);
                const batch = sortedEntities.slice(i, i + concurrency);

                // Detect changes for this batch of entities in parallel
                const batchPromises = batch.map(e => {
                    const rows = rowCounts?.get(e.ID);
                    const rowInfo = rows != null ? ` (~${rows.toLocaleString()} rows)` : '';
                    UpdateCurrentConsoleLine(`   Detecting: ${e.Name}${rowInfo}`, ConsoleColor.gray);
                    return this.DetectChangesForEntity(e);
                });
                const batchResults = await Promise.all(batchPromises);

                // Replay each entity's changes immediately, then discard
                for (let j = 0; j < batch.length; j++) {
                    const entity = batch[j];
                    const detection = batchResults[j];
                    entitiesProcessed++;

                    if (!detection.Success) {
                        entitiesFailed++;
                        consecutiveFailures++;
                        UpdateCurrentConsoleProgress(`   Failed: ${entity.Name}`, entitiesProcessed, sortedEntities.length, ConsoleColor.crimson);
                        continue;
                    }

                    const changeCount = detection.Changes.length;
                    totalDetected += changeCount;

                    if (changeCount > 0) {
                        const replayed = await this.replayEntityChanges(detection.Changes, replayProviders, replayBatchSize);
                        totalReplayed += replayed;
                    }

                    consecutiveFailures = 0;
                    UpdateCurrentConsoleProgress(`   Done: ${entity.Name} (${changeCount} changes)`, entitiesProcessed, sortedEntities.length, ConsoleColor.cyan);
                    // Changes go out of scope here — GC can reclaim the BaseEntity objects
                }

                i += batch.length;

                // Cooldown after consecutive failures
                if (consecutiveFailures >= CONSECUTIVE_FAILURE_COOLDOWN_THRESHOLD && i < sortedEntities.length) {
                    LogStatus(`   ⏸ ${consecutiveFailures} consecutive failures, pausing ${COOLDOWN_PAUSE_MS / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, COOLDOWN_PAUSE_MS));
                    consecutiveFailures = 0;
                }
            }

            run.Status = aborted ? 'Error' : 'Complete';
            run.EndedAt = new Date();
            await run.Save();

            const summary = `${entitiesProcessed} entities processed, ${entitiesFailed} failed, ${totalDetected} changes detected, ${totalReplayed} replayed`;
            LogStatus(`Run complete: ${summary}`);

            return {
                Success: entitiesFailed === 0 && !aborted,
                ErrorMessage: aborted ? `Aborted after ${entitiesProcessed} entities` : undefined,
                TotalDetected: totalDetected,
                TotalReplayed: totalReplayed,
                EntitiesProcessed: entitiesProcessed,
                EntitiesFailed: entitiesFailed
            };
        }
        catch (e) {
            LogError(e);
            run.Status = 'Error';
            run.EndedAt = new Date();
            await run.Save();
            return {
                Success: false,
                ErrorMessage: e instanceof Error ? e.message : String(e),
                TotalDetected: totalDetected,
                TotalReplayed: totalReplayed,
                EntitiesProcessed: entitiesProcessed,
                EntitiesFailed: entitiesFailed
            };
        }
    }

    /**
     * Replays a single entity's changes and returns the count of successful replays.
     * Changes are processed in batches for concurrency but the entire set is for
     * one entity only, keeping memory bounded.
     */
    private async replayEntityChanges(
        changes: ChangeDetectionItem[],
        providers: SQLServerDataProvider[],
        batchSize: number
    ): Promise<number> {
        let successCount = 0;
        for (let i = 0; i < changes.length; i += batchSize) {
            const batch = changes.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map((c, idx) => this.ReplayChange(providers[idx], c))
            );
            successCount += results.filter(r => r).length;
        }
        return successCount;
    }

    /**
     * Checks whether Node.js heap usage is approaching the V8 heap limit.
     * Uses v8.getHeapStatistics().heap_size_limit which is the actual max
     * (set by --max-old-space-size or V8's default), not the currently
     * allocated heapTotal which starts small and grows on demand.
     */
    private isHeapPressureHigh(): boolean {
        const stats = getHeapStatistics();
        const usedRatio = stats.used_heap_size / stats.heap_size_limit;
        return usedRatio > HEAP_USAGE_LIMIT_PERCENT;
    }

    /**
     * Queries sys.partitions for fast approximate row counts (no table scans).
     * Returns a Map of entityID → approx row count.
     */
    private async getApproxRowCounts(entities: EntityInfo[]): Promise<Map<string, number>> {
        try {
            const provider = Metadata.Provider as SQLServerDataProvider;
            const entityIDs = entities.map(e => `'${e.ID}'`).join(',');
            const sql = `
                SELECT
                    e.ID,
                    ISNULL(SUM(p.rows), 0) AS ApproxRows
                FROM ${provider.MJCoreSchemaName}.vwEntities e
                LEFT JOIN sys.partitions p
                    ON p.object_id = OBJECT_ID(e.SchemaName + '.' + e.BaseTable)
                    AND p.index_id IN (0, 1)
                WHERE e.ID IN (${entityIDs})
                GROUP BY e.ID
            `;
            const rows = await provider.ExecuteSQL(sql);
            const map = new Map<string, number>();
            if (rows) {
                for (const row of rows) {
                    map.set(row.ID as string, row.ApproxRows as number);
                }
            }
            return map;
        }
        catch (e) {
            LogStatus('   Warning: Could not fetch row counts for dynamic concurrency, using default batch size');
            return new Map<string, number>();
        }
    }

    /**
     * Determines the concurrency level for an entity based on its approximate row count.
     */
    private getConcurrencyForEntity(entity: EntityInfo, rowCounts: Map<string, number> | null): number {
        if (!rowCounts || rowCounts.size === 0)
            return 2;

        const rows = rowCounts.get(entity.ID) ?? 0;
        for (const tier of ExternalChangeDetectorEngine.CONCURRENCY_TIERS) {
            if (rows <= tier.maxRows)
                return tier.concurrency;
        }
        return 1;
    }

    /**
     * @deprecated Use DetectAndReplayChanges() instead, which interleaves detection and replay
     * per entity to keep memory bounded. This method accumulates all changes in memory.
     */
    public async DetectChangesForEntities(entities: EntityInfo[], maxConcurrency: number = 5): Promise<ChangeDetectionResult> {
        if (!entities)
            throw new Error("entities parameter is required");
        if (entities.length === 0)
            throw new Error("entities parameter must have at least one entity in it");

        const result: ChangeDetectionResult = new ChangeDetectionResult();
        result.Success = true;
        result.Changes = [];

        for (const entity of entities) {
            const r = await this.DetectChangesForEntity(entity);
            if (r.Success)
                result.Changes.push(...r.Changes);
            else {
                result.Success = false;
                result.ErrorMessage = (result.ErrorMessage || '') + `\n${entity.Name}: ${r.ErrorMessage}`;
            }
        }
        return result;
    }

    /**
     * @deprecated Use DetectAndReplayChanges() instead.
     */
    public async DetectChangesForAllEligibleEntities(maxConcurrency?: number): Promise<ChangeDetectionResult> {
        return await this.DetectChangesForEntities(this.EligibleEntities, maxConcurrency);
    }

    /**
     * This method will replay all of the items in the changes array
     * @param changes Array of changes to replay.
     * @param batchSize Optional, defines the # of concurrent changes to replay at once. If you want to replay changes serially, set this to 1
     * @param staleTimeoutHours Optional, defines how many hours a run can be in progress before it is considered stale. Defaults to 24.
     * @returns {Promise<boolean>} - Returns true if all changes are successfully replayed, otherwise false.
     */
    public async ReplayChanges(changes: ChangeDetectionItem[], batchSize: number = 20, staleTimeoutHours: number = 24): Promise<boolean> {
        let run; // declare outside of try block so we have access to it in the catch block
        try {
            if (changes && changes.length > 0) {
                const results: boolean[] = [];
                run = await this.StartRun(staleTimeoutHours);
                LogStatus(`Replaying ${changes.length} changes`);

                // Create per-save provider pool: each concurrent save gets its own provider
                // instance with independent transaction state, sharing the same connection pool.
                const replayProviders = await this.createReplayProviders(batchSize);

                let numProcessed = 0;
                const logInterval = Math.max(1, Math.floor(changes.length / 10)); // Log at ~10% intervals
                for (let i = 0; i < changes.length; i += batchSize) {
                    const batch = changes.slice(i, i + batchSize);

                    const batchPromises = batch.map(async (c, index) => {
                        const provider = replayProviders[index];
                        const result = await this.ReplayChange(provider, c);
                        numProcessed++;
                        if (numProcessed % logInterval === 0 || numProcessed === changes.length) {
                            UpdateCurrentConsoleProgress(`   Replayed ${numProcessed} of ${changes.length} changes`, numProcessed, changes.length);
                        }
                        return result;
                    });

                    const batchResults = await Promise.all(batchPromises);
                    results.push(...batchResults);
                }

                // finalize the run record
                run.Status = 'Complete';
                run.EndedAt = new Date();
                await run.Save();

                return results.every(r => r === true);
            }
            else {
                return true; // no changes to replay
            }
        }
        catch (e) {
            LogError(e);
            if (run) {
                run.Status = 'Error';
                run.EndedAt = new Date();
                await run.Save();
            }
            return false;
        }
    }

    /**
     * Replays a single change using a dedicated provider instance to isolate
     * transaction state from other concurrent replays.
     *
     * For Create/Update: re-creates the entity on the per-save provider via
     * LoadFromData (default replaceOldValues=false), which marks the entity as
     * existing (IsSaved=true) while keeping fields dirty so Save() issues an UPDATE.
     *
     * For Delete: creates a fresh entity on the per-save provider, loads by
     * primary key, then deletes.
     */
    protected async ReplayChange(provider: SQLServerDataProvider, change: ChangeDetectionItem): Promise<boolean> {
        try {
            switch (change.Type) {
                case 'Create':
                case 'Update':
                    if (change.LatestRecord) {
                        const entity = await provider.GetEntityObject(
                            change.Entity.Name,
                            this.ContextUser
                        );
                        await entity.LoadFromData(change.LatestRecord.GetAll());
                        return await entity.Save();
                    }
                    else
                        return false;
                case 'Delete':
                    const record = await provider.GetEntityObject(change.Entity.Name, this.ContextUser);
                    if (await record.InnerLoad(change.PrimaryKey)) {
                        return await record.Delete();
                    }
                    else {
                        // if we can't load it, it's already gone, so we're good
                        return true;
                    }
            }
        }
        catch (e) {
            LogError(e);
            return false;
        }
    }

    /**
     * Creates lightweight provider instances that share the singleton's connection pool
     * but have independent transaction state. This follows the MJServer per-request
     * provider pattern (see MJServer/src/context.ts:createPerRequestProviders) to
     * avoid race conditions when concurrent Save() calls interleave transaction
     * Begin/Commit/Rollback on a shared provider instance.
     *
     * Each provider reuses cached metadata (ignoreExistingMetadata=false) so creation
     * is fast with no DB round trips for metadata loading.
     */
    private async createReplayProviders(count: number): Promise<SQLServerDataProvider[]> {
        const singletonProvider = Metadata.Provider as SQLServerDataProvider;
        const pool = singletonProvider.DatabaseConnection;
        const schema = singletonProvider.MJCoreSchemaName;

        const providerPromises = Array.from({ length: count }, async () => {
            const config = new SQLServerProviderConfigData(
                pool, schema, 0, undefined, undefined, false
            );
            const provider = new SQLServerDataProvider();
            await provider.Config(config);
            return provider;
        });
        return Promise.all(providerPromises);
    }

    protected async StartRun(staleTimeoutHours: number = 24): Promise<MJRecordChangeReplayRunEntity> {
        // first make sure an existing run isn't in progress
        const rv = new RunView();
        const existingRun = await rv.RunView({
            EntityName: "MJ: Record Change Replay Runs",
            ExtraFilter: "Status NOT IN('Complete', 'Error')"
        }, this.ContextUser);
        if (existingRun && existingRun.Success) {
            if (existingRun.Results.length > 0) {
                // we have an existing run, check to see if it is "stale"
                const runData = existingRun.Results[0];
                const startedAt = new Date(runData.StartedAt);
                const now = new Date();
                const diff = now.getTime() - startedAt.getTime();
                const hours = diff / (1000 * 60 * 60);
                if (hours > staleTimeoutHours) {
                    // this is a stale run, so mark it as error and allow a new run to proceed
                    const md = new Metadata();
                    const staleRun = await md.GetEntityObject<MJRecordChangeReplayRunEntity>("MJ: Record Change Replay Runs", this.ContextUser);
                    await staleRun.InnerLoad(runData.ID);
                    staleRun.Status = 'Error';
                    staleRun.EndedAt = new Date();
                    await staleRun.Save();
                    LogStatus(`Marked stale Record Change Replay Run ${runData.ID} as Error (Started: ${startedAt.toISOString()})`);
                }
                else {
                    throw new Error(`Existing Record Change Replay Run ${runData.ID} is not complete or marked as error, cannot start a new run. It started at ${startedAt.toISOString()}.`);
                }
            }

            // if we get here, either there was no existing run, or we just marked a stale run as error
            const md = new Metadata();
            const run = await md.GetEntityObject<MJRecordChangeReplayRunEntity>("MJ: Record Change Replay Runs", this.ContextUser)
            run.StartedAt = new Date();
            run.UserID = this.ContextUser.ID;
            run.Status = 'In Progress';
            if (await run.Save()) {
                // Mitigate race conditions: double-check that no other process started a run at the exact same time
                const doubleCheck = await rv.RunView({
                    EntityName: "MJ: Record Change Replay Runs",
                    ExtraFilter: `Status = 'In Progress' AND ID <> '${run.ID}'`
                }, this.ContextUser);
                
                if (doubleCheck && doubleCheck.Success && doubleCheck.Results.length > 0) {
                    // Another run snuck in! Back out to prevent duplicate processing.
                    run.Status = 'Error';
                    run.EndedAt = new Date();
                    await run.Save(); // Mark it as an error rather than deleting it to keep an audit trail
                    throw new Error("Another process started a run concurrently. Aborting this run to prevent duplicate work.");
                }

                return run;
            }
            else
                throw new Error("Failed to start run");
        }
        else {
            // failed to run the view
            throw new Error("Failed to check for existing run: " + existingRun.ErrorMessage);
        }
    }    
}
