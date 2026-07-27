import { DatabaseProviderBase, IMetadataProvider, RunView, type UserInfo } from '@memberjunction/core';

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

/**
 * Batched writer for `MJ: Company Integration Record Maps`.
 *
 * **Why this exists.** The per-record `SaveRecordMap` costs three round trips — a `RunView` to
 * find an existing mapping, a `Load`, and a `Save` — for *every* record the sync touches,
 * including records it decided not to change. On a no-change full sync that is roughly 60% of
 * the total cost: we pay full price to discover there is nothing to do.
 *
 * This writer queues mappings and flushes them set-based, so a 500-record batch costs three
 * statements instead of fifteen hundred.
 *
 * **Per-row error attribution is the hard requirement, not an extra.** Batching without it
 * trades a slow correct sync for a fast wrong one: one malformed row would silently take out
 * its 499 neighbours. Two mechanisms keep attribution exact:
 *
 *  1. After the set-based write, the chunk's mappings are read back. Anything missing — or
 *     pointing at a different MJ record than we queued — is reported individually by external
 *     ID. The database itself, not our optimism, decides which rows landed.
 *  2. If the set-based write throws outright (a chunk-level failure: bad literal, deadlock,
 *     constraint), the chunk is replayed one row at a time through the original single-row
 *     upsert. The 499 good rows still commit and the bad one is named.
 *
 * **Durability note.** Mappings are written slightly later than the record they describe, so a
 * process killed between the two loses that window's map rows. That is recoverable by design:
 * the next sync re-matches those records by primary key (see `MatchEngine.FindByKeyFields`) and
 * re-establishes the mapping. It cannot produce duplicates — the write is an upsert keyed on
 * (CompanyIntegration, Entity, ExternalID).
 */
export class RecordMapBatch {
    /**
     * Hard ceiling on the statement chunk size. The upsert inlines one `SELECT … UNION ALL` per
     * mapping, so the generated SQL grows linearly with the chunk; past 5,000 rows it starts
     * approaching batch-length and query-plan limits on both platforms.
     */
    public static readonly CHUNK_SIZE_CEILING = 5_000;

    /**
     * Statement chunk size. 500 keeps the generated SQL well inside parameter/length limits.
     * Read from MJ_INTEGRATION_RECORD_MAP_CHUNK_SIZE at class-init and clamped to
     * [1, CHUNK_SIZE_CEILING].
     */
    public static readonly ChunkSize = RecordMapBatch.computeChunkSize();

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

    private pending: PendingRecordMap[] = [];
    private failures: RecordMapFailure[] = [];

    /**
     * @param provider          the provider that owns this sync's connection
     * @param companyIntegrationID the CompanyIntegration all queued mappings belong to
     * @param contextUser       user context for the writes
     * @param saveSingle        the original one-row upsert, used as the per-row fallback
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
        this.pending = [];
    }

    /**
     * Queues a mapping. **Never writes** — the caller decides when a flush is safe.
     *
     * Queuing deliberately does not auto-flush on a full chunk. Queue() is called from inside the
     * apply pass's batch transaction, and a flush fired from there would write map rows within
     * that transaction: `Discard()` could no longer un-queue them on rollback (they'd already be
     * in the statement stream), and `verifyChunk`'s read-back would be reading uncommitted rows
     * through the same connection and so would "verify" writes that a rollback then erases. The
     * apply loop calls {@link Flush} once per batch, after commit — which also bounds `pending`
     * to one batch's worth of mappings.
     *
     * Queuing the same external ID twice within a window keeps only the latest — the mapping is
     * an upsert, so the last value written would win anyway; collapsing it here just avoids
     * asking the database to write the same row twice in one statement, which MERGE-style
     * upserts reject outright.
     */
    public Queue(mapping: PendingRecordMap): void {
        const existingIndex = this.pending.findIndex(
            p => p.EntityID === mapping.EntityID && p.ExternalID === mapping.ExternalID
        );
        if (existingIndex >= 0) this.pending[existingIndex] = mapping;
        else this.pending.push(mapping);
    }

    /** Writes everything queued. Safe to call repeatedly; a no-op when the queue is empty. */
    public async Flush(): Promise<void> {
        if (this.pending.length === 0) return;

        const queued = this.pending;
        this.pending = [];

        // Group by entity: the upsert key includes EntityID, so one statement per entity.
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

    /** Writes one chunk set-based, then verifies it row by row. */
    private async flushChunk(entityID: string, chunk: PendingRecordMap[]): Promise<void> {
        try {
            await this.upsertChunk(entityID, chunk);
        } catch (err) {
            // Chunk-level failure — replay row by row so one bad row cannot take out the rest.
            await this.replayIndividually(entityID, chunk, err);
            return;
        }
        await this.verifyChunk(entityID, chunk);
    }

    /**
     * The set-based upsert: UPDATE the mappings that already exist, INSERT the ones that don't.
     *
     * Two statements rather than a single MERGE because the record-map table carries no unique
     * constraint on (CompanyIntegrationID, EntityID, ExternalSystemRecordID) — so neither SQL
     * Server's `MERGE ... ON` guarantees nor Postgres's `ON CONFLICT` are available. UPDATE-then-
     * INSERT-where-not-exists needs no constraint and behaves identically on both platforms.
     */
    private async upsertChunk(entityID: string, chunk: PendingRecordMap[]): Promise<void> {
        const provider = this.provider as DatabaseProviderBase;
        const d = provider.Dialect;
        const table = this.qualifiedTableName();

        const ci = d.QuoteStringLiteral(this.companyIntegrationID);
        const eid = d.QuoteStringLiteral(entityID);
        const cCI = d.QuoteIdentifier('CompanyIntegrationID');
        const cEntity = d.QuoteIdentifier('EntityID');
        const cExt = d.QuoteIdentifier('ExternalSystemRecordID');
        const cRec = d.QuoteIdentifier('EntityRecordID');

        // Portable inline row source: a UNION ALL of SELECTs. `VALUES (...) AS v(a,b)` differs
        // between the two dialects; a UNION ALL of plain SELECTs does not.
        const src = chunk
            .map(m => `SELECT ${d.QuoteStringLiteral(m.ExternalID)} AS ext, ${d.QuoteStringLiteral(m.EntityRecordID)} AS rid`)
            .join(' UNION ALL ');

        const isSqlServer = d.PlatformKey === 'sqlserver';

        // UPDATE — the one statement whose syntax genuinely diverges.
        const updateSQL = isSqlServer
            ? `WITH src AS (${src}) ` +
              `UPDATE t SET t.${cRec} = s.rid FROM ${table} t INNER JOIN src s ON t.${cExt} = s.ext ` +
              `WHERE t.${cCI} = ${ci} AND t.${cEntity} = ${eid} AND t.${cRec} <> s.rid`
            : `WITH src AS (${src}) ` +
              `UPDATE ${table} t SET ${cRec} = s.rid FROM src s ` +
              `WHERE t.${cExt} = s.ext AND t.${cCI} = ${ci} AND t.${cEntity} = ${eid} AND t.${cRec} <> s.rid`;
        await provider.ExecuteSQL(updateSQL, undefined, undefined, this.contextUser);

        // INSERT the ones with no row yet. ID / timestamp columns are left to their defaults.
        const insertSQL =
            `WITH src AS (${src}) ` +
            `INSERT INTO ${table} (${cCI}, ${cEntity}, ${cExt}, ${cRec}) ` +
            `SELECT ${ci}, ${eid}, s.ext, s.rid FROM src s ` +
            `WHERE NOT EXISTS (SELECT 1 FROM ${table} x ` +
            `WHERE x.${cCI} = ${ci} AND x.${cEntity} = ${eid} AND x.${cExt} = s.ext)`;
        await provider.ExecuteSQL(insertSQL, undefined, undefined, this.contextUser);
    }

    /**
     * Reads the chunk back and records a failure for every mapping the database does not now
     * agree with. This is what makes batched writes as accountable as per-row ones.
     */
    private async verifyChunk(entityID: string, chunk: PendingRecordMap[]): Promise<void> {
        // Same dialect-aware quoting the write path uses (upsertChunk) — a hand-rolled
        // `replace(/'/g, "''")` is a second, subtly different escaping rule for the same values.
        const d = (this.provider as DatabaseProviderBase).Dialect;
        const inList = chunk.map(m => d.QuoteStringLiteral(m.ExternalID)).join(',');
        const rv = new RunView();
        const written = await rv.RunView<{ ExternalSystemRecordID: string; EntityRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter:
                `CompanyIntegrationID=${d.QuoteStringLiteral(this.companyIntegrationID)} ` +
                `AND EntityID=${d.QuoteStringLiteral(entityID)} ` +
                `AND ExternalSystemRecordID IN (${inList})`,
            Fields: ['ExternalSystemRecordID', 'EntityRecordID'],
            IgnoreMaxRows: true,
            ResultType: 'simple',
            BypassCache: true, // we are checking what actually committed, not what we hoped
        }, this.contextUser);

        if (!written.Success) {
            // We cannot tell which rows landed, so we cannot claim any of them did.
            for (const m of chunk) {
                this.failures.push({
                    ExternalID: m.ExternalID,
                    EntityID: entityID,
                    ErrorMessage:
                        `Record map write could not be verified: ${written.ErrorMessage ?? 'read-back failed'}. ` +
                        `The mapping may or may not have been written; the next sync will re-establish it by primary key.`,
                });
            }
            return;
        }

        const actual = new Map(written.Results.map(r => [r.ExternalSystemRecordID, r.EntityRecordID]));
        for (const m of chunk) {
            const got = actual.get(m.ExternalID);
            if (got === undefined) {
                this.failures.push({
                    ExternalID: m.ExternalID,
                    EntityID: entityID,
                    ErrorMessage: 'Record map row was not written (no mapping present after upsert).',
                });
            } else if (got !== m.EntityRecordID) {
                this.failures.push({
                    ExternalID: m.ExternalID,
                    EntityID: entityID,
                    ErrorMessage: `Record map points at MJ record '${got}' but this sync wrote '${m.EntityRecordID}'.`,
                });
            }
        }
    }

    /** Fallback path: one row at a time, so a chunk-level failure costs one row, not 500. */
    private async replayIndividually(
        entityID: string,
        chunk: PendingRecordMap[],
        chunkError: unknown
    ): Promise<void> {
        const chunkMsg = chunkError instanceof Error ? chunkError.message : String(chunkError);
        console.warn(
            `[RecordMapBatch] Set-based record-map write failed for ${chunk.length} mapping(s) ` +
            `(${chunkMsg}); falling back to per-row writes so isolated failures stay isolated.`
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

    /** Resolves the record-map table's physical name through metadata, never hardcoded. */
    private qualifiedTableName(): string {
        const d = (this.provider as DatabaseProviderBase).Dialect;
        const info = this.provider.EntityByName('MJ: Company Integration Record Maps');
        if (!info?.SchemaName || !info?.BaseTable) {
            throw new Error('Cannot resolve the physical table for "MJ: Company Integration Record Maps"');
        }
        return `${d.QuoteIdentifier(info.SchemaName)}.${d.QuoteIdentifier(info.BaseTable)}`;
    }
}
