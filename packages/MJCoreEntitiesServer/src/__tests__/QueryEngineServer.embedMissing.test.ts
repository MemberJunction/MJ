/**
 * QueryEngineServer.EmbedMissingQueries: the later path that gives a vector to every query saved with
 * SkipEmbeddings (`mj sync push`). It embeds each cached query that has text but no stored vector,
 * persists the vector on the query, adds it to the index, and does nothing while the host has
 * switched save-time embeddings off. The load starts it without waiting; query changes start it again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Base64ToFloat32Vector } from '@memberjunction/global';

/** A cached query row as QueryEngine holds it (the fields the engine reads and writes). */
interface QueryRow {
    ID: string;
    Name: string;
    Description: string | null;
    UserQuestion: string | null;
    Category: string | null;
    Status: string;
    Reusable: boolean;
    SQL: string | null;
    EmbeddingVector: string | null;
    EmbeddingVectorBinary: string | null;
    EmbeddingModelID: string | null;
    LatestResult: { CompleteMessage: string } | null;
    PrimaryKey: { ToConcatenatedString(): string };
    Save: () => Promise<boolean>;
}

const { queryEngineState, embedTextLocal } = vi.hoisted(() => ({
    queryEngineState: {
        queries: [] as QueryRow[],
        /** The base engine's DataChange$ subscriber; tests emit changes through it. */
        changeHandler: null as ((event: { config: { EntityName: string } }) => void) | null,
    },
    embedTextLocal: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn() };
});
vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        QueryEngine: {
            Instance: {
                get Queries(): QueryRow[] { return queryEngineState.queries; },
                Config: vi.fn().mockResolvedValue(undefined),
                DataChange$: {
                    subscribe(handler: (event: { config: { EntityName: string } }) => void) {
                        queryEngineState.changeHandler = handler;
                        return { unsubscribe: () => undefined };
                    },
                },
            },
        },
    };
});
vi.mock('@memberjunction/aiengine', async () => {
    // The real shared backfill from the package entry; the local model is the mocked AIEngine below, whose entity
    // embedding call (AIEngine.EmbedTextLocalForEntity) embeds through the mocked EmbedTextLocal with the real check.
    const { EmbeddingBackfill } = await vi.importActual<typeof import('@memberjunction/aiengine')>('@memberjunction/aiengine');
    return {
        EmbeddingBackfill,
        AIEngine: {
            Instance: { Config: vi.fn().mockResolvedValue(undefined), EmbedTextLocal: embedTextLocal },
            EmbedTextLocalForEntity: async (_entity: object, text: string) => EmbeddingBackfill.RequireLocalVector(await embedTextLocal(text)),
        },
    };
});

import { QueryEngineServer } from '../engines/QueryEngineServer';
import { SaveTimeAISettings } from '@memberjunction/ai';

// Exact in float32, so the binary round-trip compares equal.
const VECTOR = [0.5, -0.25, 3];

function row(id: string, name: string, vector: string | null, save = vi.fn().mockResolvedValue(true)): QueryRow {
    return {
        ID: id, Name: name, Description: null, UserQuestion: null, Category: null, Status: 'Approved', Reusable: true,
        SQL: 'SELECT 1', EmbeddingVector: vector, EmbeddingVectorBinary: null, EmbeddingModelID: null, LatestResult: null,
        PrimaryKey: { ToConcatenatedString: () => `ID|${id}` },
        Save: save,
    };
}

describe('QueryEngineServer.EmbedMissingQueries', () => {
    beforeEach(() => {
        embedTextLocal.mockReset();
        embedTextLocal.mockResolvedValue({ result: { vector: VECTOR }, model: { ID: 'model-local' } });
        SaveTimeAISettings.Instance.Config = {};
    });
    afterEach(() => {
        SaveTimeAISettings.Instance.Config = {};
    });

    it('embeds and persists every query with text but no vector, and indexes it; leaves embedded and text-less queries alone', async () => {
        const missing = row('q-missing', 'Pushed Query', null);
        const embedded = row('q-has', 'Has Vector', JSON.stringify(VECTOR));
        const empty = row('q-empty', '', null);
        queryEngineState.queries = [missing, embedded, empty];
        const engine = QueryEngineServer.Instance;
        engine.RefreshQueryEmbeddings();

        expect(await engine.EmbedMissingQueries()).toBe(1);

        expect(embedTextLocal).toHaveBeenCalledTimes(1);
        expect(embedTextLocal).toHaveBeenCalledWith('Pushed Query');
        expect(missing.Save).toHaveBeenCalledTimes(1);
        expect(JSON.parse(missing.EmbeddingVector || 'null')).toEqual(VECTOR);
        expect(Array.from(Base64ToFloat32Vector(missing.EmbeddingVectorBinary) || [])).toEqual(VECTOR);
        expect(missing.EmbeddingModelID).toBe('model-local');
        expect(embedded.Save).not.toHaveBeenCalled();
        expect(empty.Save).not.toHaveBeenCalled();
        expect(engine.QueryVectorService?.Has('q-missing')).toBe(true);
    });

    it('does nothing while the host has switched save-time embeddings off', async () => {
        SaveTimeAISettings.Instance.Config = { Embeddings: false };
        const missing = row('q-missing-2', 'Pushed Query', null);
        queryEngineState.queries = [missing];
        QueryEngineServer.Instance.RefreshQueryEmbeddings();

        expect(await QueryEngineServer.Instance.EmbedMissingQueries()).toBe(0);
        expect(embedTextLocal).not.toHaveBeenCalled();
        expect(missing.Save).not.toHaveBeenCalled();
    });

    it('a failed save is not counted, the query is still indexed for similarity search, and the next run retries the save', async () => {
        const failing = row('q-fail', 'Pushed Query', null, vi.fn().mockResolvedValue(false));
        queryEngineState.queries = [failing];
        QueryEngineServer.Instance.RefreshQueryEmbeddings();

        expect(await QueryEngineServer.Instance.EmbedMissingQueries()).toBe(0);
        expect(QueryEngineServer.Instance.QueryVectorService?.Has('q-fail')).toBe(true);
        expect(failing.EmbeddingVector).toBeNull(); // still "missing", so the next pass picks it up

        failing.Save = vi.fn().mockResolvedValue(true);
        expect(await QueryEngineServer.Instance.EmbedMissingQueries()).toBe(1);
    });

    it('an index rebuild on an MJ: Queries change keeps the computed vector of a query whose save failed', async () => {
        const failing = row('q-fail-2', 'Unsaveable Query', null, vi.fn().mockResolvedValue(false));
        queryEngineState.queries = [failing];
        const engine = QueryEngineServer.Instance;
        engine.RefreshQueryEmbeddings();
        expect(await engine.EmbedMissingQueries()).toBe(0);

        engine.RefreshQueryEmbeddings(); // what the change handler runs: rebuilt from persisted vectors

        expect(engine.QueryVectorService?.Has('q-fail-2')).toBe(true);
    });

    it('the load starts the backfill without waiting for it, and every MJ: Queries change starts it again', async () => {
        const atLoad = row('q-at-load', 'Pushed Before Load', null);
        queryEngineState.queries = [atLoad];
        let answer: (value: { result: { vector: number[] }; model: { ID: string } }) => void = () => undefined;
        embedTextLocal.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));

        await QueryEngineServer.Instance.Config(true); // resolves while the local model has not answered
        await vi.waitFor(() => expect(embedTextLocal).toHaveBeenCalledWith('Pushed Before Load'));
        expect(atLoad.Save).not.toHaveBeenCalled();
        answer({ result: { vector: VECTOR }, model: { ID: 'model-local' } });
        await vi.waitFor(() => expect(atLoad.Save).toHaveBeenCalledTimes(1));

        const later = row('q-later', 'Pushed After Load', null);
        queryEngineState.queries = [atLoad, later];
        queryEngineState.changeHandler?.({ config: { EntityName: 'MJ: Query Fields' } });
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(later.Save).not.toHaveBeenCalled();
        queryEngineState.changeHandler?.({ config: { EntityName: 'MJ: Queries' } });
        await vi.waitFor(() => expect(later.Save).toHaveBeenCalledTimes(1));
    });
});
