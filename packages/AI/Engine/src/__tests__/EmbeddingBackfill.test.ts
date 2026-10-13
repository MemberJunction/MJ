/**
 * EmbeddingBackfill: the shared later path that gives a vector to records saved without one (`mj sync push` saves
 * with SkipEmbeddings). AIEngine (notes, examples), TagEngine, QueryEngineServer and ComponentMetadataEngineServer
 * delegate to it, so its guarantees are pinned here once: which records it picks, how it writes and persists,
 * how it puts a record back after a failure, one pass at a time plus one rerun, the per-pass bound with automatic
 * later passes, the host switch, and the local-embedding helper the entity saves share.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Base64ToFloat32Vector } from '@memberjunction/global';
import type { SimpleEmbeddingResult } from '@memberjunction/core';

const { logError, logStatus } = vi.hoisted(() => ({
    logError: vi.fn(),
    logStatus: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: logError, LogStatus: logStatus };
});

import { SaveTimeAISettings } from '@memberjunction/ai';
import { EmbeddingBackfill, EmbeddingUnavailableError, type EmbeddingBackfillBaseOptions, type EmbeddingBackfillEmbedder, type StandardVectorRecord } from '../services/EmbeddingBackfill';
import { EmbeddingBackfillSettings } from '../services/EmbeddingBackfillSettings';

/** A record double: the three standard vector columns, a text, a primary key and a spied Save. */
interface FakeRow {
    ID: string;
    Text: string | null;
    EmbeddingVector: string | null;
    EmbeddingVectorBinary: string | null;
    EmbeddingModelID: string | null;
    EntityInfo: { Name: string };
    PrimaryKey: { ToConcatenatedString(): string; ToString(): string };
    LatestResult: { CompleteMessage: string } | null;
    Save: ReturnType<typeof vi.fn>;
}

/** The record type the backfill under test works on: a standard vector record that also carries its text. */
interface FakeRecord extends StandardVectorRecord {
    Text: string | null;
}

/** The test double typed as the record the backfill works on — the one cast this file needs (a partial BaseEntity). */
function asRecord(row: FakeRow): FakeRecord {
    return row as unknown as FakeRecord;
}

function row(id: string, text: string | null, vector: string | null = null, saveResult = true): FakeRow {
    return {
        ID: id, Text: text, EmbeddingVector: vector, EmbeddingVectorBinary: null, EmbeddingModelID: vector ? 'model-old' : null,
        EntityInfo: { Name: 'Fake Rows' }, PrimaryKey: { ToConcatenatedString: () => `ID|${id}`, ToString: () => `ID=${id}` },
        LatestResult: saveResult ? null : { CompleteMessage: 'save refused' },
        Save: vi.fn().mockResolvedValue(saveResult),
    };
}

const VECTOR = [0.5, -0.25, 3]; // exact in float32, so the binary round-trip compares equal
const textOf = (r: FakeRecord): string | null => r.Text;
/** More loader calls than any test needs: a loop that does not end fails the test instead of hanging the worker. */
const RUNAWAY_LOADS = 50;

/**
 * A backfill over `rows`, embedding every text as VECTOR (one text at a time) unless `embedder` says otherwise.
 */
function backfillOver(
    rows: FakeRow[],
    overrides: Partial<EmbeddingBackfillBaseOptions<FakeRecord>> = {},
    embedder?: EmbeddingBackfillEmbedder<FakeRecord>,
) {
    const loadCandidates = vi.fn(async (_limit: number) => {
        if (loadCandidates.mock.calls.length > RUNAWAY_LOADS) throw new Error('runaway loop');
        return rows.map(asRecord);
    });
    const embedText = vi.fn(async (_text: string, _record: FakeRecord): Promise<SimpleEmbeddingResult> => ({ vector: VECTOR, modelID: 'model-local' }));
    const onEmbedded = vi.fn();
    const backfill = new EmbeddingBackfill<FakeRecord>({
        Name: 'TestBackfill',
        Slots: [EmbeddingBackfill.StandardSlot<FakeRecord>(textOf)],
        LoadCandidates: loadCandidates,
        OnEmbedded: onEmbedded,
        ...overrides,
        ...(embedder || { EmbedText: embedText }),
    });
    return { backfill, loadCandidates, embedText, onEmbedded };
}

/**
 * A database-backed loader over `rows`: like a `MaxRows`-limited read filtered on `text <> '' AND vector IS NULL`,
 * which on PostgreSQL lets whitespace-only text through. Records every limit it was asked for.
 */
function databaseLoader(rows: FakeRow[]) {
    const limits: number[] = [];
    const load = async (limit: number): Promise<FakeRecord[]> => {
        limits.push(limit);
        if (limits.length > RUNAWAY_LOADS) throw new Error('runaway loop');
        return rows
            .filter(r => r.Text !== null && r.Text !== '' && !r.EmbeddingVector && !r.EmbeddingVectorBinary)
            .slice(0, limit)
            .map(asRecord);
    };
    return { load, limits };
}

describe('EmbeddingBackfill', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        SaveTimeAISettings.Instance.Config = {};
        EmbeddingBackfillSettings.Instance.Config = {};
    });
    afterEach(() => {
        SaveTimeAISettings.Instance.Config = {};
        EmbeddingBackfillSettings.Instance.Config = {};
    });

    describe('one pass', () => {
        it('embeds and saves every record with text and no vector; leaves records with a vector and blank texts alone', async () => {
            const missing = row('missing', 'a pushed record');
            const embedded = row('embedded', 'has one', JSON.stringify(VECTOR));
            const blank = row('blank', '   ');
            const { backfill, embedText, onEmbedded } = backfillOver([missing, embedded, blank]);

            expect(await backfill.Run()).toBe(1);

            expect(embedText).toHaveBeenCalledTimes(1);
            expect(embedText).toHaveBeenCalledWith('a pushed record', missing);
            expect(JSON.parse(missing.EmbeddingVector || 'null')).toEqual(VECTOR);
            expect(Array.from(Base64ToFloat32Vector(missing.EmbeddingVectorBinary) || [])).toEqual(VECTOR);
            expect(missing.EmbeddingModelID).toBe('model-local');
            expect(missing.Save).toHaveBeenCalledTimes(1);
            expect(onEmbedded).toHaveBeenCalledWith(missing, [{ vector: VECTOR, modelID: 'model-local' }]);
            expect(embedded.Save).not.toHaveBeenCalled();
            expect(blank.Save).not.toHaveBeenCalled();
        });

        it('a failed save puts the columns back to what the record held, still hands the vector to OnEmbedded, and the next run retries', async () => {
            // A stale vector the engine wants replaced: the record must get it back, not empty columns.
            const stale = row('stale', 'text', JSON.stringify([9, 9]), false);
            const { backfill, onEmbedded } = backfillOver([stale], { NeedsVector: r => r.EmbeddingModelID !== 'model-local' });

            expect(await backfill.Run()).toBe(0);
            expect(stale.EmbeddingVector).toBe(JSON.stringify([9, 9]));
            expect(stale.EmbeddingVectorBinary).toBeNull();
            expect(stale.EmbeddingModelID).toBe('model-old');
            // The in-memory index must not depend on persistence (TagEngine's de-duplication).
            expect(onEmbedded).toHaveBeenCalledWith(stale, [{ vector: VECTOR, modelID: 'model-local' }]);
            expect(logError).toHaveBeenCalledWith(expect.stringContaining('save refused'));

            stale.Save = vi.fn().mockResolvedValue(true);
            expect(await backfill.Run()).toBe(1);
            expect(stale.EmbeddingModelID).toBe('model-local');
        });

        it('a save that throws is handled like a failed save', async () => {
            const throwing = row('throwing', 'text');
            throwing.Save = vi.fn().mockRejectedValue(new Error('connection lost'));
            const { backfill, onEmbedded } = backfillOver([throwing]);

            expect(await backfill.Run()).toBe(0);
            expect(throwing.EmbeddingVector).toBeNull();
            expect(onEmbedded).toHaveBeenCalledTimes(1);
            expect(logError).toHaveBeenCalledWith(expect.stringContaining('connection lost'));
        });

        it('a text that gets no vector leaves that record unsaved and the others are still saved', async () => {
            const failing = row('failing', 'the model fails on this');
            const fine = row('fine', 'fine text');
            const { backfill, onEmbedded } = backfillOver([failing, fine], {}, {
                EmbedText: async (text: string) => {
                    if (text === 'the model fails on this') throw new Error('no vector');
                    return { vector: VECTOR, modelID: 'model-local' };
                },
            });

            expect(await backfill.Run()).toBe(1);
            expect(failing.Save).not.toHaveBeenCalled();
            expect(failing.EmbeddingVector).toBeNull();
            expect(fine.Save).toHaveBeenCalledTimes(1);
            // No vector, nothing to index.
            expect(onEmbedded.mock.calls.map(c => c[0])).toEqual([fine]);
        });

        it('a batch embedder (EmbedTexts) gets every text of the pass at once; a null result leaves its record unsaved', async () => {
            const first = row('first', 'one');
            const second = row('second', 'two');
            const embedTexts = vi.fn(async (texts: string[]) => texts.map(t => (t === 'one' ? { vector: VECTOR, modelID: 'model-tag' } : null)));
            const { backfill } = backfillOver([first, second], {}, { EmbedTexts: embedTexts });

            expect(await backfill.Run()).toBe(1);
            expect(embedTexts).toHaveBeenCalledTimes(1);
            expect(embedTexts).toHaveBeenCalledWith(['one', 'two']);
            expect(first.EmbeddingModelID).toBe('model-tag');
            expect(second.Save).not.toHaveBeenCalled();
        });

        it('computes nothing while the host has switched save-time embeddings off', async () => {
            SaveTimeAISettings.Instance.Config = { Embeddings: false };
            const missing = row('off', 'text');
            const { backfill, loadCandidates, embedText } = backfillOver([missing]);

            expect(await backfill.Run()).toBe(0);
            expect(loadCandidates).not.toHaveBeenCalled();
            expect(embedText).not.toHaveBeenCalled();
            expect(missing.Save).not.toHaveBeenCalled();
        });

        it('NeedsAnyVector applies the same test as a pass', () => {
            const { backfill } = backfillOver([]);
            expect(backfill.NeedsAnyVector(asRecord(row('a', 'text')))).toBe(true);
            expect(backfill.NeedsAnyVector(asRecord(row('b', 'text', JSON.stringify(VECTOR))))).toBe(false);
            expect(backfill.NeedsAnyVector(asRecord(row('c', ' ')))).toBe(false);
        });
    });

    describe('one pass at a time', () => {
        it('a run during a pass joins it and causes exactly one more pass, never a concurrent one', async () => {
            const missing = row('m', 'text');
            let release: () => void = () => undefined;
            const gate = new Promise<void>(resolve => { release = resolve; });
            let active = 0;
            let maxActive = 0;
            const gatedLoader = vi.fn(async (_limit: number) => {
                active++;
                maxActive = Math.max(maxActive, active);
                await gate;
                active--;
                return [asRecord(missing)];
            });
            const { backfill } = backfillOver([missing], { LoadCandidates: gatedLoader });

            const first = backfill.Run();
            const second = backfill.Run();
            const third = backfill.Run();
            release();

            expect(await first).toBe(1);
            expect(await second).toBe(1); // the same loop
            expect(await third).toBe(1);
            expect(maxActive).toBe(1);
            expect(gatedLoader).toHaveBeenCalledTimes(2); // the pass, then one rerun for the two calls during it
            expect(missing.Save).toHaveBeenCalledTimes(1);
        });
    });

    describe('bounded passes', () => {
        it('embeds at most BatchSize records per pass and asks the loader for one more; the rest continue in later passes on their own', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 2, PassDelaySeconds: 0 };
            const rows = ['a', 'b', 'c', 'd', 'e'].map(id => row(id, `text ${id}`));
            const { backfill, loadCandidates } = backfillOver(rows);

            expect(await backfill.Run()).toBe(2);
            expect(loadCandidates).toHaveBeenCalledWith(3);
            expect(rows.filter(r => r.Save.mock.calls.length > 0)).toHaveLength(2);

            await vi.waitFor(() => expect(rows.every(r => r.Save.mock.calls.length === 1)).toBe(true));
            expect(loadCandidates).toHaveBeenCalledTimes(3);
            expect(logStatus).toHaveBeenCalledWith(expect.stringContaining('more remain'));
        });

        it('records that keep failing are skipped for the rest of the run, so the records behind them get their vector', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 1, PassDelaySeconds: 0 };
            const rows = [row('x', 'text x', null, false), row('y', 'text y', null, false), row('z', 'text z')];
            const { backfill } = backfillOver(rows);

            expect(await backfill.Run()).toBe(0); // the first pass's one record failed …
            await vi.waitFor(() => expect(rows[2].Save).toHaveBeenCalledTimes(1)); // … and later passes reached z
            expect(rows[0].Save).toHaveBeenCalledTimes(1); // each failing record was tried once in the run
            expect(rows[1].Save).toHaveBeenCalledTimes(1);
            await vi.waitFor(() => expect(logError).toHaveBeenCalledWith(
                'TestBackfill: 2 record(s) could not be embedded and saved in this run; they are retried on the next load or change'));
        });

        it('a run during a pass is never dropped, even when every record of that pass failed', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 1, PassDelaySeconds: 0 };
            const rows = [row('x', 'text x', null, false), row('y', 'text y', null, false)];
            let release: () => void = () => undefined;
            const gate = new Promise<void>(resolve => { release = resolve; });
            const gatedLoader = vi.fn(async (_limit: number) => {
                if (gatedLoader.mock.calls.length === 1) await gate;
                if (gatedLoader.mock.calls.length > RUNAWAY_LOADS) throw new Error('runaway loop');
                return rows.map(asRecord);
            });
            const { backfill } = backfillOver(rows, { LoadCandidates: gatedLoader });

            const first = backfill.Run();
            rows.push(row('pushed', 'saved during the pass'));
            void backfill.Run(); // e.g. the change event of that save
            release();
            await first;

            await vi.waitFor(() => expect(rows[2].Save).toHaveBeenCalledTimes(1));
        });

        it('reads past a full read of rows with nothing to embed (whitespace-only text on PostgreSQL), asking for that many more', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 1, PassDelaySeconds: 0 };
            const rows = [row('ws1', '   '), row('ws2', ' \t\n'), row('real', 'real text')];
            const db = databaseLoader(rows);
            const { backfill } = backfillOver(rows, { LoadCandidates: db.load });

            expect(await backfill.RunUntilDone()).toBe(1);
            expect(rows[2].Save).toHaveBeenCalledTimes(1);
            expect(db.limits).toEqual([2, 4]); // batch + 1, then + the 2 rows skipped
            expect(rows[0].Save).not.toHaveBeenCalled();
        });

        it('reads past rows a database read keeps returning because their save fails', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 1, PassDelaySeconds: 0 };
            const rows = [row('f1', 'text f1', null, false), row('f2', 'text f2', null, false), row('ok', 'text ok')];
            const db = databaseLoader(rows);
            const { backfill } = backfillOver(rows, { LoadCandidates: db.load });

            expect(await backfill.RunUntilDone()).toBe(1);
            expect(rows[2].EmbeddingModelID).toBe('model-local');
            expect(db.limits).toEqual([2, 3, 4]);
        });

        it('a new run retries the records the last run skipped', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 1, PassDelaySeconds: 3600 };
            const failing = row('f', 'text f', null, false);
            const { backfill } = backfillOver([failing]);

            expect(await backfill.Run()).toBe(0);
            failing.Save = vi.fn().mockResolvedValue(true);
            expect(await backfill.Run()).toBe(1);
        });
    });

    describe('RunUntilDone (awaited mode)', () => {
        it('runs the batches back to back and resolves only when every record has its vector — no later pass is scheduled', async () => {
            // A long delay: if the awaited mode fell back to a scheduled pass, the run would resolve with records left.
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 2, PassDelaySeconds: 3600 };
            const rows = ['a', 'b', 'c', 'd', 'e'].map(id => row(id, `text ${id}`));
            const { backfill, loadCandidates } = backfillOver(rows);

            expect(await backfill.RunUntilDone()).toBe(5);
            expect(rows.every(r => r.Save.mock.calls.length === 1)).toBe(true);
            expect(loadCandidates).toHaveBeenCalledTimes(3); // 2 + 2 + 1, each pass still bounded
            expect(loadCandidates.mock.calls.every(c => c[0] === 3)).toBe(true);
        });

        it('ends once every record has been tried, so records that keep failing cannot hold the caller', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 1, PassDelaySeconds: 3600 };
            const rows = [row('x', 'text x', null, false), row('y', 'text y', null, false)];
            const { backfill, loadCandidates } = backfillOver(rows);

            expect(await backfill.RunUntilDone()).toBe(0);
            expect(loadCandidates).toHaveBeenCalledTimes(2); // x, then y — each tried once
            expect(rows.every(r => r.Save.mock.calls.length === 1)).toBe(true);
        });

        it('logs that the next pass runs now, never the scheduled delay', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 2, PassDelaySeconds: 3600 };
            const rows = ['a', 'b', 'c'].map(id => row(id, `text ${id}`));
            const { backfill } = backfillOver(rows);

            await backfill.RunUntilDone();

            const lines = logStatus.mock.calls.map(c => String(c[0]));
            expect(lines).toContain('TestBackfill: embedded 2 of 2 record(s) saved without a vector; more remain, next pass now');
            expect(lines.some(l => l.includes('next pass in'))).toBe(false);
        });

        it('the awaited mode ends with its run: a later ordinary run is bounded again', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 1, PassDelaySeconds: 3600 };
            const first = [row('f1', 'text f1')];
            const rows = [...first];
            const { backfill } = backfillOver(rows);
            expect(await backfill.RunUntilDone()).toBe(1);

            rows.push(row('l1', 'text l1'), row('l2', 'text l2'), row('l3', 'text l3'));
            expect(await backfill.Run()).toBe(1); // one bounded pass; the rest waits for the (hour-long) later pass
        });

        it('joining a running ordinary run makes that run drain too', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 1, PassDelaySeconds: 3600 };
            const rows = ['p', 'q', 'r'].map(id => row(id, `text ${id}`));
            const { backfill } = backfillOver(rows);

            const ordinary = backfill.Run();
            const awaited = backfill.RunUntilDone();
            expect(await awaited).toBe(3);
            expect(await ordinary).toBe(3);
            expect(rows.every(r => r.Save.mock.calls.length === 1)).toBe(true);
        });
    });

    describe('embedding unavailable (V3)', () => {
        /** Every LogError line of the run, as text. */
        const errorLines = () => logError.mock.calls.map(c => String(c[0]));

        it('a typed "unavailable" from the embedder stops the run at the first text with one log line', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 2, PassDelaySeconds: 0 };
            const rows = ['a', 'b', 'c', 'd', 'e'].map(id => row(id, `text ${id}`));
            const embedText = vi.fn(async (): Promise<SimpleEmbeddingResult> => { throw new EmbeddingUnavailableError('no local embedding model is configured'); });
            const { backfill, loadCandidates } = backfillOver(rows, {}, { EmbedText: embedText });

            expect(await backfill.RunUntilDone()).toBe(0);
            expect(embedText).toHaveBeenCalledTimes(1);
            expect(loadCandidates).toHaveBeenCalledTimes(1);
            expect(errorLines()).toEqual([
                'TestBackfill: embedding is unavailable (no local embedding model is configured); stopping this run — the records without a vector wait for the next load or change',
            ]);
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(loadCandidates).toHaveBeenCalledTimes(1); // no later pass was scheduled
        });

        it('a batch of only rejected texts (nulls) never stops the run: the good rows behind it still get vectors', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 1, PassDelaySeconds: 0 };
            const rejected = row('ws', 'rejected text');
            const good = [row('g1', 'text g1'), row('g2', 'text g2')];
            const embedTexts = vi.fn(async (texts: string[]) =>
                texts.map(t => (t.startsWith('rejected') ? null : { vector: VECTOR, modelID: 'model-tag' })));
            const { backfill } = backfillOver([rejected, ...good], {}, { EmbedTexts: embedTexts });

            expect(await backfill.RunUntilDone()).toBe(2);
            expect(good.every(r => r.Save.mock.calls.length === 1)).toBe(true);
            expect(rejected.Save).not.toHaveBeenCalled();
            expect(errorLines().some(l => l.includes('unavailable'))).toBe(false);
        });

        it('records whose text the model rejects never stop the run: later records still get their vectors', async () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 3, PassDelaySeconds: 0 };
            const rejected = [row('r1', 'rejected one'), row('r2', 'rejected two')];
            const later = ['a', 'b', 'c'].map(id => row(id, `text ${id}`));
            const { backfill } = backfillOver([...rejected, ...later], {}, {
                EmbedText: async (text: string) => {
                    if (text.startsWith('rejected')) throw new Error('input rejected by the model');
                    return { vector: VECTOR, modelID: 'model-local' };
                },
            });

            expect(await backfill.RunUntilDone()).toBe(3);
            expect(later.every(r => r.Save.mock.calls.length === 1)).toBe(true);
            expect(errorLines().filter(l => l.includes('embedding a text failed: input rejected by the model'))).toHaveLength(2);
            expect(errorLines().some(l => l.includes('unavailable'))).toBe(false);
        });

        it('a first text that fails while the second embeds is a problem with that text: the pass goes on and logs it', async () => {
            const bad = row('bad', 'the model fails on this');
            const good = row('good', 'fine');
            const { backfill } = backfillOver([bad, good], {}, {
                EmbedText: async (text: string) => {
                    if (text === 'the model fails on this') throw new Error('token limit');
                    return { vector: VECTOR, modelID: 'model-local' };
                },
            });

            expect(await backfill.Run()).toBe(1);
            expect(errorLines()).toContain('TestBackfill: embedding a text failed: token limit');
            expect(errorLines().some(l => l.includes('unavailable'))).toBe(false);
        });

        it.each([
            ['throws', async (): Promise<Array<SimpleEmbeddingResult | null>> => { throw new Error('runner down'); }],
            ['returns a result list that does not match the texts', async (): Promise<Array<SimpleEmbeddingResult | null>> => []],
        ])('a batch embedder that %s stops the run with one log line', async (_label, embedTexts) => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 2, PassDelaySeconds: 0 };
            const rows = ['a', 'b', 'c', 'd'].map(id => row(id, `text ${id}`));
            const { backfill, loadCandidates } = backfillOver(rows, {}, { EmbedTexts: vi.fn(embedTexts) });

            expect(await backfill.RunUntilDone()).toBe(0);
            expect(loadCandidates).toHaveBeenCalledTimes(1);
            expect(errorLines()).toHaveLength(1);
            expect(errorLines()[0]).toContain('embedding is unavailable');
        });
    });

    describe('OnEmbedded failures (V5)', () => {
        it('a throw from OnEmbedded is logged as an index failure, counted at the end of the run, and the save still happens', async () => {
            const r = row('r', 'text r');
            const { backfill } = backfillOver([r], { OnEmbedded: () => { throw new Error('dimension mismatch'); } });

            expect(await backfill.Run()).toBe(1);
            expect(r.Save).toHaveBeenCalledTimes(1);
            const lines = logError.mock.calls.map(c => String(c[0]));
            expect(lines).toContain('TestBackfill: adding the vector of Fake Rows ID|r to the in-memory index failed: dimension mismatch');
            expect(lines).toContain('TestBackfill: 1 computed vector(s) could not be added to the in-memory index in this run');
            expect(lines.some(l => l.includes('saving the vector'))).toBe(false);
        });
    });

    describe('ReplayUnsavedVectors (V2)', () => {
        it('hands an index rebuilt from persisted vectors the vectors of records whose save failed', async () => {
            const failing = row('f', 'text f', null, false);
            const fine = row('ok', 'text ok');
            const { backfill, onEmbedded } = backfillOver([failing, fine]);
            await backfill.Run();
            onEmbedded.mockClear();

            expect(backfill.ReplayUnsavedVectors([failing, fine].map(asRecord))).toBe(1);
            expect(onEmbedded).toHaveBeenCalledWith(failing, [{ vector: VECTOR, modelID: 'model-local' }]);
        });

        it('drops a kept vector once the record is saved, deleted, or its text changed', async () => {
            const a = row('a', 'text a', null, false);
            const b = row('b', 'text b', null, false);
            const c = row('c', 'text c', null, false);
            const { backfill, onEmbedded } = backfillOver([a, b, c]);
            await backfill.Run();
            onEmbedded.mockClear();

            a.EmbeddingVector = JSON.stringify(VECTOR); // saved since
            b.Text = 'edited';                           // text changed: the kept vector is stale
            // c deleted: not in the owner's list
            expect(backfill.ReplayUnsavedVectors([a, b].map(asRecord))).toBe(0);
            expect(onEmbedded).not.toHaveBeenCalled();
            b.Text = 'text b';
            expect(backfill.ReplayUnsavedVectors([a, b, c].map(asRecord))).toBe(0); // all three were dropped
        });
    });

    describe('Trigger', () => {
        it('starts a run without waiting for it and logs a failure instead of throwing', async () => {
            const { backfill } = backfillOver([], { LoadCandidates: async () => { throw new Error('database unavailable'); } });

            expect(() => backfill.Trigger()).not.toThrow();
            await vi.waitFor(() => expect(logError).toHaveBeenCalledWith(expect.stringContaining('database unavailable')));
        });
    });

    describe('RequireLocalVector', () => {
        it('returns the vector and model of a local embedding result', () => {
            expect(EmbeddingBackfill.RequireLocalVector({ result: { vector: VECTOR }, model: { ID: 'model-local' } } as never))
                .toEqual({ vector: VECTOR, modelID: 'model-local' });
        });

        it('throws EmbeddingUnavailableError when there is no result (no local embedding model)', () => {
            expect(() => EmbeddingBackfill.RequireLocalVector(null)).toThrow(EmbeddingUnavailableError);
        });

        it.each([
            ['an empty vector', { result: { vector: [] }, model: { ID: 'model-local' } }],
            ['no model', { result: { vector: VECTOR }, model: null }],
        ])('throws when the local model returns %s', (_label, value) => {
            expect(() => EmbeddingBackfill.RequireLocalVector(value as never)).toThrow('Failed to generate embedding - no vector or model ID returned');
        });
    });

    describe('EmbeddingBackfillSettings', () => {
        it('defaults to 100 records per pass and 10 seconds between passes', () => {
            expect(EmbeddingBackfillSettings.Instance.BatchSize).toBe(100);
            expect(EmbeddingBackfillSettings.Instance.PassDelayMs).toBe(10_000);
        });

        it('uses a configured positive integer batch size and ignores anything else', () => {
            EmbeddingBackfillSettings.Instance.Config = { BatchSize: 25, PassDelaySeconds: 0 };
            expect(EmbeddingBackfillSettings.Instance.BatchSize).toBe(25);
            expect(EmbeddingBackfillSettings.Instance.PassDelayMs).toBe(0); // 0 is a real setting: no wait
            for (const invalid of [0, -5, 1.5]) {
                EmbeddingBackfillSettings.Instance.Config = { BatchSize: invalid };
                expect(EmbeddingBackfillSettings.Instance.BatchSize).toBe(100);
            }
        });
    });
});
