import { DatabaseProviderBase, IMetadataProvider, RunView, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationRecordMapEntity } from '@memberjunction/core-entities';
import type { SqlQuoter } from './prefetchFilter.js';

/** One external↔MJ mapping awaiting write. */
export interface PendingRecordMap {
    /** The MJ entity the mapping is for. Batches are keyed on this + CompanyIntegrationID. */
    EntityID: string;
    /** The external system's ID for the record. */
    ExternalID: string;
    /** The MJ record's primary key, '|'-joined for composite PKs. */
    EntityRecordID: string;
}

/** A mapping that did not make it to the database, with the reason. */
export interface RecordMapFailure {
    ExternalID: string;
    EntityID: string;
    ErrorMessage: string;
}

/** An existing map row, as read back for a chunk. */
interface ExistingRecordMap {
    ID: string;
    EntityRecordID: string;
}

/**
 * Batched writer for `MJ: Company Integration Record Maps`.
 *
 * **Why this exists.** The per-record `SaveRecordMap` costs three round trips — a `RunView` to
 * find an existing mapping, a `Load`, and a `Save` — for *every* record the sync touches,
 * including records it decided not to change. On a no-change full sync that is roughly 60% of
 * the total cost: we pay full price to discover there is nothing to do.
 *
 * **What it does instead.** It queues mappings and resolves a whole chunk against the database in
 * ONE `RunView`, then writes only the rows that are actually new or actually point somewhere
 * different. On an incremental sync where mappings are stable that is one read and zero writes
 * per chunk, against 3N round trips before.
 *
 * **Every write goes through the provider's entity layer, never hand-written SQL.** `RunView` and
 * `GetEntityObject`/`Save()` are dialect-agnostic by construction — `Save()` lands in the
 * CodeGen-generated `spCreate`/`spUpdate` for the entity, on whichever platform the provider is —
 * so this file contains no SQL text, no `ExecuteSQL`, and no platform branch that could be right
 * on SQL Server and wrong on Postgres. The one place SQL text is unavoidable is a `RunView`
 * `ExtraFilter`, and both its identifiers and its literals are quoted through the provider's own
 * dialect, the same seam `buildContentHashPrefetchFilter` uses.
 *
 * Going through the entity layer also means the writes get everything a direct statement would
 * have skipped: field validation, `__mj_CreatedAt`/`__mj_UpdatedAt`, Record Changes tracking, and
 * — the one that bites silently — the save event that drives `LocalCacheManager` invalidation.
 * This entity is read by `RunView` elsewhere in this engine, so a raw `UPDATE` here would leave
 * those cached reads stale until their TTL (see `ScheduledJobEngine.updateJobStatistics`, which
 * has to invalidate by hand for exactly that reason).
 *
 * **Per-row error attribution is the hard requirement, not an extra.** Batching without it trades
 * a slow correct sync for a fast wrong one: one malformed row would silently take out its 499
 * neighbours. Here attribution is structural rather than reconstructed — each mapping is its own
 * `Save()` returning its own boolean, so a failure names the row that failed and the other rows in
 * the chunk are unaffected. There is no read-back-and-diff step because there is nothing to
 * reconstruct.
 *
 * **Durability note.** Mappings are written slightly later than the record they describe, so a
 * process killed between the two loses that window's map rows. That is recoverable by design:
 * the next sync re-matches those records by primary key (see `MatchEngine.FindByKeyFields`) and
 * re-establishes the mapping. It cannot produce duplicates — the write is an upsert keyed on
 * (CompanyIntegration, Entity, ExternalID).
 */
export class RecordMapBatch {
    /**
     * Hard ceiling on the chunk size. A chunk becomes one `IN (…)` list in a `RunView` filter, so
     * the filter text grows linearly with the chunk; past 5,000 IDs it starts approaching filter
     * length and query-plan limits on both platforms.
     */
    public static readonly CHUNK_SIZE_CEILING = 5_000;

    /**
     * Chunk size. 500 keeps the generated filter well inside length limits.
     * Read from MJ_INTEGRATION_RECORD_MAP_CHUNK_SIZE at class-init and clamped to
     * [1, CHUNK_SIZE_CEILING].
     */
    public static readonly ChunkSize = RecordMapBatch.computeChunkSize();

    /**
     * How many map rows are saved concurrently within a chunk.
     *
     * The writes are independent — each is its own row, keyed on its own external ID — so they do
     * not have to be serialized. Bounded rather than unbounded so a first-ever sync of a large
     * entity cannot open 500 simultaneous requests against the connection pool the rest of the
     * sync is also using.
     */
    public static readonly WriteConcurrency = 10;

    /** Reads + clamps the chunk size from env; warns once when a configured value is clamped down. */
    private static computeChunkSize(): number {
        const ceiling = RecordMapBatch.CHUNK_SIZE_CEILING;
        const raw = parseInt(process.env.MJ_INTEGRATION_RECORD_MAP_CHUNK_SIZE ?? '', 10);
        if (!Number.isFinite(raw) || raw <= 0) return 500;
        if (raw > ceiling) {
            console.warn(`[RecordMapBatch] MJ_INTEGRATION_RECORD_MAP_CHUNK_SIZE=${raw} exceeds the maximum ${ceiling} — clamped to ${ceiling}.`);
            return ceiling;
        }
        return raw;
    }

    /**
     * Queued mappings, keyed `EntityID|ExternalID` — the upsert's own key, so the map both
     * dedups and preserves queue order (JS Maps iterate in insertion order). A Map rather than
     * an array because dedup on every Queue() would otherwise be a scan of the whole batch.
     */
    private pending = new Map<string, PendingRecordMap>();
    private failures: RecordMapFailure[] = [];

    /** The dedup key. EntityID is a UUID, so the separator cannot appear in the left half. */
    private static pendingKey(entityID: string, externalID: string): string {
        return `${entityID}|${externalID}`;
    }

    /**
     * @param provider          the provider that owns this sync's connection
     * @param companyIntegrationID the CompanyIntegration all queued mappings belong to
     * @param contextUser       user context for the writes
     * @param saveSingle        the original one-row upsert, used when the chunk read fails
     */
    constructor(
        private readonly provider: IMetadataProvider,
        private readonly companyIntegrationID: string,
        private readonly contextUser: UserInfo,
        private readonly saveSingle: (
            companyIntegrationID: string,
            externalID: string,
            entityID: string,
            entityRecordID: string,
            contextUser: UserInfo
        ) => Promise<void>,
    ) {}

    /** Mappings that failed to write, with the external ID that owns each failure. */
    public get Failures(): readonly RecordMapFailure[] {
        return this.failures;
    }

    /** Returns the failures accumulated so far and clears them, so a caller reports each once. */
    public TakeFailures(): RecordMapFailure[] {
        const taken = this.failures;
        this.failures = [];
        return taken;
    }

    /**
     * Drops everything queued but not yet written.
     *
     * Called when the batch transaction that produced these mappings rolled back: the records
     * they point at do not exist, so writing the mappings would leave the map pointing at
     * nothing. The per-record retry path re-queues whatever actually commits.
     */
    public Discard(): void {
        this.pending.clear();
    }

    /**
     * Queues a mapping. **Never writes** — the caller decides when a flush is safe.
     *
     * Queuing deliberately does not auto-flush on a full chunk. Queue() is called from inside the
     * apply pass's batch transaction, and a flush fired from there would write map rows within
     * that transaction, which `Discard()` could no longer un-queue on rollback. The apply loop
     * calls {@link Flush} once per batch, after commit — which also bounds `pending` to one
     * batch's worth of mappings.
     *
     * Queuing the same external ID twice within a window keeps only the latest — the mapping is
     * an upsert, so the last value written would win anyway.
     */
    public Queue(mapping: PendingRecordMap): void {
        this.pending.set(RecordMapBatch.pendingKey(mapping.EntityID, mapping.ExternalID), mapping);
    }

    /** Writes everything queued. Safe to call repeatedly; a no-op when the queue is empty. */
    public async Flush(): Promise<void> {
        if (this.pending.size === 0) return;

        const queued = Array.from(this.pending.values());
        this.pending.clear();

        // Group by entity: the mapping's identity includes EntityID, so a chunk read has to be
        // scoped to one entity to be answerable in a single filter.
        const byEntity = new Map<string, PendingRecordMap[]>();
        for (const m of queued) {
            const bucket = byEntity.get(m.EntityID);
            if (bucket) bucket.push(m);
            else byEntity.set(m.EntityID, [m]);
        }

        for (const [entityID, mappings] of byEntity) {
            for (let i = 0; i < mappings.length; i += RecordMapBatch.ChunkSize) {
                await this.flushChunk(entityID, mappings.slice(i, i + RecordMapBatch.ChunkSize));
            }
        }
    }

    /**
     * Resolves one chunk against the database in a single read, then writes only what differs.
     *
     * A mapping whose row already points at the same MJ record needs no write at all — that is
     * the common case on an incremental sync and the reason this is cheaper than the per-record
     * path even though the writes themselves are per-row.
     */
    private async flushChunk(entityID: string, chunk: PendingRecordMap[]): Promise<void> {
        const existing = await this.readExisting(entityID, chunk);
        if (!existing) {
            // The read is what makes the batched path safe; without it we cannot tell an insert
            // from an update, and guessing either way produces a duplicate map row. Fall back to
            // the per-record upsert, which does its own read.
            await this.writeIndividually(entityID, chunk);
            return;
        }

        const work = chunk.filter(m => existing.get(m.ExternalID)?.EntityRecordID !== m.EntityRecordID);
        for (let i = 0; i < work.length; i += RecordMapBatch.WriteConcurrency) {
            const slice = work.slice(i, i + RecordMapBatch.WriteConcurrency);
            await Promise.all(slice.map(m => this.writeOne(entityID, m, existing.get(m.ExternalID)?.ID)));
        }
    }

    /**
     * Reads the chunk's existing map rows in one query, keyed by external ID. Returns null when
     * the read fails, which is deliberately distinct from an empty map (read succeeded, nothing
     * there) — the two lead to different write paths.
     */
    private async readExisting(
        entityID: string,
        chunk: PendingRecordMap[]
    ): Promise<Map<string, ExistingRecordMap> | null> {
        const q = this.quoter;
        if (!q) return null; // no dialect to quote with — the per-row path resolves each row itself

        const inList = chunk.map(m => q.QuoteStringLiteral(m.ExternalID)).join(',');
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string; ExternalSystemRecordID: string; EntityRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter:
                `${q.QuoteIdentifier('CompanyIntegrationID')}=${q.QuoteStringLiteral(this.companyIntegrationID)} ` +
                `AND ${q.QuoteIdentifier('EntityID')}=${q.QuoteStringLiteral(entityID)} ` +
                `AND ${q.QuoteIdentifier('ExternalSystemRecordID')} IN (${inList})`,
            Fields: ['ID', 'ExternalSystemRecordID', 'EntityRecordID'],
            IgnoreMaxRows: true, // a chunk can exceed the entity's default row cap
            ResultType: 'simple',
            BypassCache: true, // this decides INSERT vs UPDATE; a stale miss duplicates the row
        }, this.contextUser);

        if (!result.Success) return null;

        const byExternalID = new Map<string, ExistingRecordMap>();
        for (const row of result.Results) {
            // First row wins if the table somehow carries a duplicate for this key: writing to
            // whichever we saw last would flip the mapping between syncs for no reason.
            if (!byExternalID.has(row.ExternalSystemRecordID)) {
                byExternalID.set(row.ExternalSystemRecordID, { ID: row.ID, EntityRecordID: row.EntityRecordID });
            }
        }
        return byExternalID;
    }

    /**
     * Writes one mapping through the provider's entity layer — update in place when a row already
     * exists, insert otherwise. A failure is attributed to this external ID and nothing else.
     */
    private async writeOne(entityID: string, mapping: PendingRecordMap, existingID: string | undefined): Promise<void> {
        try {
            const recordMap = await this.provider.GetEntityObject<MJCompanyIntegrationRecordMapEntity>(
                'MJ: Company Integration Record Maps',
                this.contextUser
            );

            if (existingID) {
                const loaded = await recordMap.Load(existingID);
                // The row was read a moment ago, so a failure to load means it has since been
                // deleted. Insert rather than abandon the mapping.
                if (!loaded) recordMap.NewRecord();
            } else {
                recordMap.NewRecord();
            }

            recordMap.CompanyIntegrationID = this.companyIntegrationID;
            recordMap.EntityID = entityID;
            recordMap.ExternalSystemRecordID = mapping.ExternalID;
            recordMap.EntityRecordID = mapping.EntityRecordID;

            if (!await recordMap.Save()) {
                this.failures.push({
                    ExternalID: mapping.ExternalID,
                    EntityID: entityID,
                    ErrorMessage: `Record map write failed: ${recordMap.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                });
            }
        } catch (err) {
            this.failures.push({
                ExternalID: mapping.ExternalID,
                EntityID: entityID,
                ErrorMessage: err instanceof Error ? err.message : String(err),
            });
        }
    }

    /** Fallback when the chunk read failed: one row at a time through the original upsert. */
    private async writeIndividually(entityID: string, chunk: PendingRecordMap[]): Promise<void> {
        console.warn(
            `[RecordMapBatch] Could not read existing record maps for ${chunk.length} mapping(s); ` +
            `falling back to per-row upserts so each row resolves itself.`
        );

        for (const m of chunk) {
            try {
                await this.saveSingle(this.companyIntegrationID, m.ExternalID, entityID, m.EntityRecordID, this.contextUser);
            } catch (err) {
                this.failures.push({
                    ExternalID: m.ExternalID,
                    EntityID: entityID,
                    ErrorMessage: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    /**
     * The provider's dialect, for the one place SQL text is unavoidable — a `RunView`
     * `ExtraFilter`. Same seam `buildContentHashPrefetchFilter` uses, so both filters this engine
     * builds quote by the platform's own rule rather than a hand-rolled `replace(/'/g, "''")`
     * that happens to match it today.
     *
     * Narrowed with `instanceof` rather than cast: `IMetadataProvider` in general carries no
     * dialect (a client-side provider has none), and null routes to the per-row path instead of
     * guessing an escaping rule.
     */
    private get quoter(): SqlQuoter | null {
        return this.provider instanceof DatabaseProviderBase ? this.provider.Dialect : null;
    }
}
