import { Float32VectorToBase64 } from '@memberjunction/global';
import { LogError, LogStatus, type BaseEntity, type EntitySaveOptions, type SimpleEmbeddingResult } from '@memberjunction/core';
import { SaveTimeAISettings } from '@memberjunction/ai';
// Type-only: this module never loads AIEngine, so engines and tests can use it without the whole engine graph.
import type { AIEngine } from '../AIEngine';
import { EmbeddingBackfillSettings } from './EmbeddingBackfillSettings';

/**
 * Embedding itself is unavailable — e.g. no local embedding model is configured. An embedder throws it only for that
 * exact condition, never for one text it rejects. A backfill run that meets it stops with one log line instead of
 * walking its whole backlog; the records wait for the next load or change.
 */
export class EmbeddingUnavailableError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'EmbeddingUnavailableError';
    }
}

/** What a record holds for one stored vector: the JSON and binary forms and the model that produced them. */
export interface StoredVectorColumns {
    Json: string | null;
    Binary: string | null;
    ModelID: string | null;
}

/** One vector of a record: the text it is computed from, and how its stored columns are read and written. */
export interface EmbeddingVectorSlot<T extends BaseEntity> {
    /** The text the vector is computed from. */
    Text(record: T): string | null;
    /** The stored columns as the record holds them now. */
    Read(record: T): StoredVectorColumns;
    /** Writes the stored columns (a computed vector, or the values {@link Read} returned, to put them back). */
    Write(record: T, columns: StoredVectorColumns): void;
}

/** A record whose vector lives in the usual three columns (`EmbeddingVector`, `EmbeddingVectorBinary`, `EmbeddingModelID`). */
export interface StandardVectorRecord extends BaseEntity {
    EmbeddingVector: string | null;
    EmbeddingVectorBinary: string | null;
    EmbeddingModelID: string | null;
}

/** What the engine that owns a backfill tells it, apart from how it embeds ({@link EmbeddingBackfillEmbedder}). */
export interface EmbeddingBackfillBaseOptions<T extends BaseEntity> {
    /** Prefix of every log line, e.g. `QueryEngineServer`. */
    Name: string;
    /** The vectors of one record. */
    Slots: ReadonlyArray<EmbeddingVectorSlot<T>>;
    /**
     * The records to look at. A cache-backed engine returns its cached records; a database-backed one reads at most
     * `limit` records that lack a vector (the pass needs `batch size + 1` to know whether records are left over).
     */
    LoadCandidates(limit: number): Promise<T[]>;
    /**
     * Whether a slot of a record needs a vector. Default: its text is not blank and it has neither stored form.
     * TagEngine also re-embeds a vector that came from another model.
     */
    NeedsVector?(record: T, slot: EmbeddingVectorSlot<T>): boolean;
    /**
     * Called once every slot of a record has its computed vector, before the save, whatever the save then does — e.g.
     * to add the vectors to the engine's in-memory index. The index must not depend on persistence: a record whose
     * save fails still exists and must still be found (TagEngine's semantic de-duplication); its columns are put
     * back, so a later run retries the save.
     */
    OnEmbedded?(record: T, vectors: SimpleEmbeddingResult[]): void;
    /** Options for the save that persists the vectors. */
    SaveOptions?: EntitySaveOptions;
}

/**
 * How a backfill embeds: one text at a time (`EmbedText`, which throws when no vector comes back — the local model
 * through `AIEngine.EmbedTextLocalForEntity` or `AIEngine.EmbedTextLocal`), or a pass's texts at once (`EmbedTexts`, in order,
 * `null` for a text that got no vector — TagEngine, which embeds in batches with its own model).
 */
export type EmbeddingBackfillEmbedder<T extends BaseEntity> =
    | { EmbedText(text: string, record: T): Promise<SimpleEmbeddingResult>; EmbedTexts?: never }
    | { EmbedTexts(texts: string[]): Promise<Array<SimpleEmbeddingResult | null>>; EmbedText?: never };

/** Everything the engine that owns a backfill tells it. */
export type EmbeddingBackfillOptions<T extends BaseEntity> = EmbeddingBackfillBaseOptions<T> & EmbeddingBackfillEmbedder<T>;

/** What one pass did. */
export interface EmbeddingBackfillPassResult {
    /** Records saved with new vectors. */
    Embedded: number;
    /** Records the pass tried to embed and save (the saved ones plus those that failed). */
    Attempted: number;
    /**
     * True when records needing a vector were left for a later pass: the pass hit the batch size, or its read came
     * back full of records it had to skip (so more may lie behind them).
     */
    MoreRemain: boolean;
}

/** Vectors computed for a record whose save failed: what `OnEmbedded` indexed, kept so a rebuilt index can get it back. */
interface UnsavedVectors {
    /** The texts the vectors were computed from, one per slot that needed a vector. */
    Texts: string[];
    Vectors: SimpleEmbeddingResult[];
}

/** A record of the current pass and the slots of it that need a vector. */
interface PendingRecord<T extends BaseEntity> {
    Record: T;
    Slots: ReadonlyArray<EmbeddingVectorSlot<T>>;
}

/**
 * Gives a vector to every record of one kind that has text but no stored vector, and persists it — the shared later
 * path for records saved with `BaseEntity.SkipEmbeddings` (`mj sync push` sets it so a short-lived CLI never loads the
 * embedding model; the record's save then clears a now-stale vector instead of computing it). `AIEngine` (agent notes
 * and examples), `TagEngine`, `QueryEngineServer` and `ComponentMetadataEngineServer` each own one and trigger it when
 * they load and when such records change.
 *
 * What it guarantees:
 * - **One pass at a time.** A {@link Run} during a pass schedules one more pass after it, so records that changed
 *   meanwhile are seen; it never starts a second concurrent pass.
 * - **Bounded work per pass.** A pass embeds at most `EmbeddingBackfillSettings.BatchSize` records. When more are
 *   left, the next pass runs `PassDelayMs` later, on its own, until none are left — so a large one-time backfill
 *   after a deploy is spread out instead of running in one burst at startup.
 * - **Failures never starve the rest.** A record whose embedding or save fails is skipped for the rest of the run,
 *   so records that keep failing cannot fill every batch and hold back the records behind them. So is a record a
 *   full database read returned that has nothing to embed (e.g. whitespace-only text, which a `<> ''` filter lets
 *   through on PostgreSQL); the next read asks for that many more rows to reach past them. A run is the chain of
 *   passes from a first {@link Run} until no pass is left to run; the next run (load or change) retries the
 *   skipped records. Every continuing pass saves a record or skips one more, so a run always ends.
 * - **Persisted, then retried on failure.** Each record's vectors are written to its columns and saved through the
 *   entity layer (so Record Changes and the save's own logic apply). When the embedding or the save fails, the
 *   columns are put back to what the record held, so the next run sees it as missing and retries. The owner's
 *   in-memory index gets a computed vector whether or not the save succeeds (`OnEmbedded`).
 * - **Honours the host switch.** Nothing is computed while `SaveTimeAISettings` has `embeddings` off.
 *
 * {@link Trigger} starts a pass without waiting for it — engines call it after loading, so a similarity search never
 * waits for a backfill. {@link RunUntilDone} is the awaited mode for an engine whose load must wait for every vector
 * (TagEngine): the same batches, run back to back instead of `PassDelayMs` apart.
 */
export class EmbeddingBackfill<T extends BaseEntity> {
    private _loop: Promise<number> | null = null;
    private _rerun = false;
    /** Set by {@link RunUntilDone}: the running loop drains instead of scheduling later passes. */
    private _drain = false;
    private _nextPassTimer: ReturnType<typeof setTimeout> | null = null;
    /** Keys of the records whose embedding or save failed in the current run; skipped until the run ends. */
    private readonly _failedThisRun = new Set<string>();
    /** Keys of records a full read returned with nothing to embed in the current run; skipped until the run ends. */
    private readonly _unusableThisRun = new Set<string>();
    /** How many times `OnEmbedded` threw in the current run (the vector then is not in the owner's index). */
    private _indexFailuresThisRun = 0;
    /**
     * By record key: vectors handed to `OnEmbedded` whose save then failed. An owner that rebuilds its index from the
     * persisted vectors gets them back with {@link ReplayUnsavedVectors}. Kept only when there is an `OnEmbedded`.
     */
    private readonly _unsaved = new Map<string, UnsavedVectors>();

    public constructor(private readonly options: EmbeddingBackfillOptions<T>) {}

    /**
     * The vector and model of a local embedding result (`AIEngine.EmbedTextLocal`) — the one "require a vector"
     * check, shared by `AIEngine.EmbedTextLocalForEntity` (the entity saves) and AIEngine's own backfills.
     * @throws EmbeddingUnavailableError when there is no result (no local embedding model)
     * @throws Error when the result has no vector or no model
     */
    public static RequireLocalVector(embedding: Awaited<ReturnType<AIEngine['EmbedTextLocal']>>): SimpleEmbeddingResult {
        if (!embedding) {
            // `EmbedTextLocal` returns null only when no local embedding model is configured.
            throw new EmbeddingUnavailableError('Failed to generate embedding - no local embedding model');
        }
        if (!embedding.result?.vector?.length || !embedding.model?.ID) {
            throw new Error('Failed to generate embedding - no vector or model ID returned');
        }
        return { vector: embedding.result.vector, modelID: embedding.model.ID };
    }

    /** The slot of a {@link StandardVectorRecord} whose vector is computed from `text`. */
    public static StandardSlot<R extends StandardVectorRecord>(text: (record: R) => string | null): EmbeddingVectorSlot<R> {
        return {
            Text: text,
            Read: r => ({ Json: r.EmbeddingVector, Binary: r.EmbeddingVectorBinary, ModelID: r.EmbeddingModelID }),
            Write: (r, c) => {
                r.EmbeddingVector = c.Json;
                r.EmbeddingVectorBinary = c.Binary;
                r.EmbeddingModelID = c.ModelID;
            },
        };
    }

    /** The stored columns of a computed vector: JSON, float32 bytes, and its model. */
    public static ColumnsOf(vector: SimpleEmbeddingResult): StoredVectorColumns {
        return { Json: JSON.stringify(vector.vector), Binary: Float32VectorToBase64(vector.vector), ModelID: vector.modelID };
    }

    /**
     * Runs passes until none is pending: one pass, then one more if {@link Run} or {@link Trigger} was called during
     * it. A call during a pass returns the running loop, which includes the pass that call asked for. When a pass
     * leaves records over, the loop ends and the next pass — which also covers any call made meanwhile — runs on its
     * own later.
     * @returns how many records the loop saved with new vectors
     */
    public async Run(): Promise<number> {
        if (this._loop) {
            this._rerun = true;
            return this._loop;
        }
        this._loop = this.runLoop();
        return this._loop;
    }

    /**
     * Awaited mode: runs passes back to back — each still at most `BatchSize` records — until no record needs a
     * vector, then resolves. For an engine whose load must not finish before every record has its vector (TagEngine:
     * semantic de-duplication of new tags needs every existing tag's vector). A call during a running loop joins it
     * and makes it drain too. A record that fails is skipped for the rest of the run (left for the next load or
     * change), so records that keep failing can neither hold the caller forever nor keep the others from their turn.
     * @returns how many records the loop saved with new vectors
     */
    public async RunUntilDone(): Promise<number> {
        this._drain = true;
        return this.Run();
    }

    /** True when at least one slot of the record needs a vector (the test a pass applies to each candidate). */
    public NeedsAnyVector(record: T): boolean {
        return this.options.Slots.some(slot => this.needsVector(record, slot));
    }

    /**
     * Hands `OnEmbedded` again the vectors computed for records whose save failed — for an owner that has just
     * rebuilt its in-memory index from the persisted vectors (which those records lack), so a record whose save
     * failed stays findable (TagEngine's de-duplication, QueryEngineServer's similarity search). Only for a record of
     * `records` that still needs a vector for the same texts; any other kept entry (record saved, deleted or edited
     * since) is dropped.
     * @param records the owner's current records (the list the index was rebuilt from)
     * @returns how many records' vectors were handed back
     */
    public ReplayUnsavedVectors(records: T[]): number {
        if (this._unsaved.size === 0 || !this.options.OnEmbedded) return 0;
        const current = new Map(records.map(r => [EmbeddingBackfill.KeyOf(r), r] as const));
        let replayed = 0;
        for (const [key, kept] of [...this._unsaved]) {
            const record = current.get(key);
            const texts = record ? this.options.Slots.filter(slot => this.needsVector(record, slot)).map(slot => slot.Text(record) || '') : [];
            if (!record || texts.length !== kept.Texts.length || texts.some((t, i) => t !== kept.Texts[i])) {
                this._unsaved.delete(key);
                continue;
            }
            if (this.handToIndex(record, kept.Vectors)) {
                replayed++;
            }
        }
        return replayed;
    }

    /** Starts {@link Run} without waiting for it; a failure is logged. */
    public Trigger(): void {
        void this.runAndLog();
    }

    private async runAndLog(): Promise<void> {
        try {
            await this.Run();
        } catch (error) {
            LogError(`${this.options.Name}: embedding records without a vector failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async runLoop(): Promise<number> {
        let embedded = 0;
        try {
            let again: boolean;
            do {
                this._rerun = false;
                const pass = await this.runPassUnlessUnavailable();
                if (!pass) break;
                embedded += pass.Embedded;
                // Draining (awaited mode) continues at once; otherwise the rest continues in a later pass, which
                // also covers a rerun asked for meanwhile. A rerun is never dropped: it runs now or in that pass.
                const continueNow = pass.MoreRemain && this._drain;
                if (pass.MoreRemain && !continueNow) {
                    this.scheduleNextPass();
                }
                this.LogPass(pass, continueNow ? 'now' : pass.MoreRemain ? 'later' : 'none');
                again = continueNow || (this._rerun && !this._nextPassTimer);
            } while (again);
        } finally {
            this._loop = null;
            this._drain = false;
            if (!this._nextPassTimer) {
                this.endRun();
            }
        }
        return embedded;
    }

    /**
     * Runs a pass; when embedding itself is unavailable ({@link EmbeddingUnavailableError}) logs that once and
     * returns null, which ends the loop with no later pass — the records wait for the next load or change.
     */
    private async runPassUnlessUnavailable(): Promise<EmbeddingBackfillPassResult | null> {
        try {
            return await this.RunPass();
        } catch (error) {
            if (!(error instanceof EmbeddingUnavailableError)) throw error;
            LogError(`${this.options.Name}: embedding is unavailable (${error.message}); stopping this run — the records without a vector wait for the next load or change`);
            return null;
        }
    }

    /** Schedules the next pass of the run after a pass that left records over (one timer at a time). */
    private scheduleNextPass(): void {
        if (this._nextPassTimer) return;
        this._nextPassTimer = setTimeout(() => {
            this._nextPassTimer = null;
            this.Trigger();
        }, EmbeddingBackfillSettings.Instance.PassDelayMs);
        // A pending pass must not keep a finishing process alive.
        this._nextPassTimer.unref?.();
    }

    /** Ends the run: reports the records that failed in it, and forgets the skipped ones so the next run retries them. */
    private endRun(): void {
        if (this._failedThisRun.size > 0) {
            LogError(`${this.options.Name}: ${this._failedThisRun.size} record(s) could not be embedded and saved in this run; they are retried on the next load or change`);
        }
        if (this._indexFailuresThisRun > 0) {
            LogError(`${this.options.Name}: ${this._indexFailuresThisRun} computed vector(s) could not be added to the in-memory index in this run`);
        }
        this._failedThisRun.clear();
        this._unusableThisRun.clear();
        this._indexFailuresThisRun = 0;
    }

    /**
     * Logs what a pass did, and when the next one runs: `now` (awaited mode), `later` (`PassDelayMs` from now) or
     * `none`. Silent for a pass that found nothing to do.
     */
    protected LogPass(pass: EmbeddingBackfillPassResult, next: 'now' | 'later' | 'none'): void {
        if (pass.Attempted === 0 && !pass.MoreRemain) return;
        const failed = pass.Attempted - pass.Embedded;
        const failures = failed > 0 ? ` (${failed} failed, skipped for the rest of this run)` : '';
        const rest = next === 'now' ? '; more remain, next pass now'
            : next === 'later' ? `; more remain, next pass in ${EmbeddingBackfillSettings.Instance.PassDelayMs / 1000}s`
            : '';
        LogStatus(`${this.options.Name}: embedded ${pass.Embedded} of ${pass.Attempted} record(s) saved without a vector${failures}${rest}`);
    }

    /**
     * One pass: reads the candidates, keeps those with a slot that needs a vector and not skipped in this run, and
     * embeds and saves at most a batch of them. Computes nothing while the host has switched embeddings off.
     */
    protected async RunPass(): Promise<EmbeddingBackfillPassResult> {
        if (SaveTimeAISettings.Instance.IsDisabled('Embeddings')) {
            return { Embedded: 0, Attempted: 0, MoreRemain: false };
        }
        const batchSize = EmbeddingBackfillSettings.Instance.BatchSize;
        // A database-backed loader returns the same skipped rows again (they still lack a vector): read that many more.
        const limit = batchSize + 1 + this._failedThisRun.size + this._unusableThisRun.size;
        const candidates = await this.options.LoadCandidates(limit);
        const pending = this.FindPending(candidates);
        const newlyUnusable = candidates.length === limit ? this.SkipUnusable(candidates) : 0;
        const batch = pending.slice(0, batchSize);
        const embedded = batch.length > 0 ? await this.EmbedAndPersistBatch(batch) : 0;
        return { Embedded: embedded, Attempted: batch.length, MoreRemain: pending.length > batch.length || newlyUnusable > 0 };
    }

    /** The candidates not skipped in this run with at least one slot that needs a vector, each with those slots. */
    protected FindPending(candidates: T[]): PendingRecord<T>[] {
        const pending: PendingRecord<T>[] = [];
        for (const record of candidates) {
            if (this.IsSkippedThisRun(record)) continue;
            const slots = this.options.Slots.filter(slot => this.needsVector(record, slot));
            if (slots.length > 0) {
                pending.push({ Record: record, Slots: slots });
            }
        }
        return pending;
    }

    /**
     * After a read that came back full (exactly the limit asked for, so more rows may lie behind it): skips, for the
     * rest of the run, each candidate that lacks a stored vector in a slot yet has nothing to embed — a database
     * filter can return such rows (whitespace-only text passes `<> ''` on PostgreSQL), and if they filled every read,
     * the rows behind them would never be reached. A cache-backed loader returns every record, so it rarely hits this.
     * @returns how many records were newly skipped
     */
    protected SkipUnusable(candidates: T[]): number {
        let added = 0;
        for (const record of candidates) {
            if (this.IsSkippedThisRun(record) || this.NeedsAnyVector(record)) continue;
            const blankWithoutVector = this.options.Slots.some(slot => {
                const stored = slot.Read(record);
                return !stored.Json && !stored.Binary;
            });
            if (blankWithoutVector) {
                this._unusableThisRun.add(EmbeddingBackfill.KeyOf(record));
                added++;
            }
        }
        return added;
    }

    /** True when the record failed or was found unusable earlier in the current run. */
    protected IsSkippedThisRun(record: T): boolean {
        if (this._failedThisRun.size === 0 && this._unusableThisRun.size === 0) return false;
        const key = EmbeddingBackfill.KeyOf(record);
        return this._failedThisRun.has(key) || this._unusableThisRun.has(key);
    }

    /** The key a run's skip sets hold a record under: its primary key (a database read returns new objects each pass). */
    protected static KeyOf(record: BaseEntity): string {
        return record.PrimaryKey.ToConcatenatedString();
    }

    private needsVector(record: T, slot: EmbeddingVectorSlot<T>): boolean {
        if (this.options.NeedsVector) {
            return this.options.NeedsVector(record, slot);
        }
        const stored = slot.Read(record);
        return !stored.Json && !stored.Binary && (slot.Text(record) || '').trim().length > 0;
    }

    /**
     * Embeds every slot text of the batch, then saves each record whose slots all got a vector. A record that got no
     * vector or could not be saved is skipped for the rest of the run.
     * @returns how many records were saved
     */
    protected async EmbedAndPersistBatch(batch: PendingRecord<T>[]): Promise<number> {
        const texts = batch.flatMap(p => p.Slots.map(slot => slot.Text(p.Record) || ''));
        const vectors = await this.embedTexts(texts, batch.flatMap(p => p.Slots.map(() => p.Record)));
        let offset = 0;
        let saved = 0;
        for (const p of batch) {
            const own = vectors.slice(offset, offset + p.Slots.length);
            offset += p.Slots.length;
            const complete = own.filter((v): v is SimpleEmbeddingResult => v !== null);
            if (complete.length === p.Slots.length && await this.PersistVectors(p.Record, p.Slots, complete)) {
                if (this._unsaved.size > 0) this._unsaved.delete(EmbeddingBackfill.KeyOf(p.Record));
                saved++;
                continue;
            }
            const key = EmbeddingBackfill.KeyOf(p.Record);
            this._failedThisRun.add(key);
            if (complete.length === p.Slots.length && this.options.OnEmbedded) {
                // Embedded and indexed, but not saved: keep the vectors so a rebuilt index can get them back.
                this._unsaved.set(key, { Texts: p.Slots.map(slot => slot.Text(p.Record) || ''), Vectors: complete });
            }
        }
        return saved;
    }

    /**
     * Embeds `texts` (the text of `records[i]` at `i`) with the owner's embedder; null where no vector came back.
     * Only exact signals mean embedding is unavailable: the embedder throws {@link EmbeddingUnavailableError}, or a
     * batch embedder throws or returns a result list whose length does not match the texts. Any other failure of one text is that text's: it is logged,
     * its record is skipped for the rest of the run, and the pass goes on — so records the model rejects can never
     * hold back the records behind them.
     * @throws EmbeddingUnavailableError when embedding itself is unavailable
     */
    private async embedTexts(texts: string[], records: T[]): Promise<Array<SimpleEmbeddingResult | null>> {
        const options = this.options;
        if (options.EmbedTexts) {
            return this.embedTextsAtOnce(options.EmbedTexts, texts);
        }
        const results: Array<SimpleEmbeddingResult | null> = [];
        for (const [i, text] of texts.entries()) {
            try {
                results.push(await options.EmbedText(text, records[i]));
            } catch (error) {
                if (error instanceof EmbeddingUnavailableError) throw error;
                LogError(`${this.options.Name}: embedding a text failed: ${error instanceof Error ? error.message : String(error)}`);
                results.push(null);
            }
        }
        return results;
    }

    /**
     * A batch embedder's results, one per text. Embedding is unavailable only when the embedder throws or returns a
     * result list that does not match the texts; a null entry is a per-text failure.
     * @throws EmbeddingUnavailableError
     */
    private async embedTextsAtOnce(
        embed: (texts: string[]) => Promise<Array<SimpleEmbeddingResult | null>>,
        texts: string[],
    ): Promise<Array<SimpleEmbeddingResult | null>> {
        let results: Array<SimpleEmbeddingResult | null>;
        try {
            results = await embed(texts);
        } catch (error) {
            if (error instanceof EmbeddingUnavailableError) throw error;
            throw new EmbeddingUnavailableError(error instanceof Error ? error.message : String(error));
        }
        if (!Array.isArray(results) || results.length !== texts.length) {
            throw new EmbeddingUnavailableError(`the batch embedder returned ${Array.isArray(results) ? results.length : 'no'} result(s) for ${texts.length} text(s)`);
        }
        // A null entry is that text's failure (its record is skipped for the rest of the run), never "unavailable":
        // a batch of only rejected texts must not stop the run, or the next run would reach the same rows first.
        return results;
    }

    /**
     * Hands a record's vectors to `OnEmbedded`. A throw there is logged and counted as an index failure — no save is
     * involved — and does not stop the save.
     * @returns true when the hook ran without throwing (or there is none)
     */
    private handToIndex(record: T, vectors: SimpleEmbeddingResult[]): boolean {
        if (!this.options.OnEmbedded) return true;
        try {
            this.options.OnEmbedded(record, vectors);
            return true;
        } catch (error) {
            this._indexFailuresThisRun++;
            LogError(`${this.options.Name}: adding the vector of ${record.EntityInfo?.Name} ${EmbeddingBackfill.KeyOf(record)} to the in-memory index failed: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Hands the vectors to `OnEmbedded`, writes them to the record's slots and saves it. On a failed save (or a throw)
     * the slots are put back to what the record held, so the record is seen as missing again and the next run
     * retries it; the in-memory index keeps the vector meanwhile.
     * @returns true when the record was saved
     */
    protected async PersistVectors(record: T, slots: ReadonlyArray<EmbeddingVectorSlot<T>>, vectors: SimpleEmbeddingResult[]): Promise<boolean> {
        const before = slots.map(slot => slot.Read(record));
        this.handToIndex(record, vectors);
        try {
            slots.forEach((slot, i) => slot.Write(record, EmbeddingBackfill.ColumnsOf(vectors[i])));
            if (await record.Save(this.options.SaveOptions)) {
                return true;
            }
            LogError(`${this.options.Name}: could not save the vector of ${record.EntityInfo?.Name} ${EmbeddingBackfill.KeyOf(record)}: ${record.LatestResult?.CompleteMessage || 'unknown error'}`);
        } catch (error) {
            LogError(`${this.options.Name}: saving the vector of ${record.EntityInfo?.Name} ${EmbeddingBackfill.KeyOf(record)} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        slots.forEach((slot, i) => slot.Write(record, before[i]));
        return false;
    }
}
