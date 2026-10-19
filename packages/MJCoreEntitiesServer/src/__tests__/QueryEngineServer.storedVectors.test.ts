/**
 * Unit tests for QueryEngineServer.RefreshQueryEmbeddings reading persisted query embeddings:
 * the binary `EmbeddingVectorBinary` column (base64 float32) is preferred, the JSON
 * `EmbeddingVector` column is the fallback, and a row with neither — or with nothing readable —
 * is skipped without failing the rest of the load. Uses the real SimpleVectorService.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Float32VectorToBase64 } from '@memberjunction/global';

interface QueryRow {
    ID: string;
    Name: string;
    Description: string | null;
    Category: string | null;
    Status: string;
    Reusable: boolean;
    SQL: string | null;
    UserQuestion: string | null;
    EmbeddingVector: string | null;
    EmbeddingVectorBinary: string | null;
}

const { queryEngineState, logError } = vi.hoisted(() => ({
    queryEngineState: { queries: [] as QueryRow[] },
    logError: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: logError, LogStatus: vi.fn() };
});

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        QueryEngine: { Instance: { get Queries(): QueryRow[] { return queryEngineState.queries; } } },
    };
});

import { QueryEngineServer } from '../engines/QueryEngineServer';

// Exact in float32, so binary decodes compare equal.
const BINARY_VEC = [0.5, 0.25, -1];
const JSON_VEC = [0.125, 2, 4];

function queryRow(id: string, binary: string | null, json: string | null): QueryRow {
    return {
        ID: id, Name: `Query ${id}`, Description: null, Category: null, Status: 'Approved',
        Reusable: true, SQL: 'SELECT 1', UserQuestion: null,
        EmbeddingVector: json, EmbeddingVectorBinary: binary,
    };
}

function refresh(rows: QueryRow[]): QueryEngineServer {
    queryEngineState.queries = rows;
    const engine = QueryEngineServer.Instance;
    engine.RefreshQueryEmbeddings();
    return engine;
}

function vectorOf(engine: QueryEngineServer, key: string): number[] | undefined {
    const service = engine.QueryVectorService;
    expect(service).not.toBeNull();
    return service!.GetVector(key);
}

describe('QueryEngineServer.RefreshQueryEmbeddings stored vectors', () => {
    beforeEach(() => {
        logError.mockClear();
        queryEngineState.queries = [];
    });

    it('loads a query that has only the binary column', () => {
        const engine = refresh([queryRow('bin-only', Float32VectorToBase64(BINARY_VEC), null)]);
        expect(vectorOf(engine, 'bin-only')).toEqual(BINARY_VEC);
    });

    it('prefers the binary column over a disagreeing JSON column', () => {
        const engine = refresh([queryRow('both', Float32VectorToBase64(BINARY_VEC), JSON.stringify(JSON_VEC))]);
        expect(vectorOf(engine, 'both')).toEqual(BINARY_VEC);
    });

    it('falls back to JSON when the binary column is not a whole number of float32 values', () => {
        const partialFloat = Buffer.from([1, 2, 3]).toString('base64');
        const engine = refresh([queryRow('partial', partialFloat, JSON.stringify(JSON_VEC))]);
        expect(vectorOf(engine, 'partial')).toEqual(JSON_VEC);
        expect(logError).not.toHaveBeenCalled();
    });

    it('falls back to JSON when the binary column holds a non-finite value', () => {
        const engine = refresh([queryRow('nan', Float32VectorToBase64([1, Number.NaN, 2]), JSON.stringify(JSON_VEC))]);
        expect(vectorOf(engine, 'nan')).toEqual(JSON_VEC);
    });

    it('silently skips a query with neither column, and still loads the others', () => {
        const engine = refresh([
            queryRow('none', null, null),
            queryRow('json', null, JSON.stringify(JSON_VEC)),
        ]);
        expect(engine.QueryVectorService!.Size).toBe(1);
        expect(engine.QueryVectorService!.Has('none')).toBe(false);
        expect(vectorOf(engine, 'json')).toEqual(JSON_VEC);
        expect(logError).not.toHaveBeenCalled();
    });

    it('logs and skips a query whose stored vector is unreadable, without aborting the refresh', () => {
        const engine = refresh([
            queryRow('bad', Buffer.from([7]).toString('base64'), '{not json'),
            queryRow('good', Float32VectorToBase64(BINARY_VEC), null),
        ]);
        expect(engine.QueryVectorService!.Has('bad')).toBe(false);
        expect(vectorOf(engine, 'good')).toEqual(BINARY_VEC);
        expect(logError).toHaveBeenCalledTimes(1);
        expect(String(logError.mock.calls[0][0])).toContain('Query bad');
    });
});
