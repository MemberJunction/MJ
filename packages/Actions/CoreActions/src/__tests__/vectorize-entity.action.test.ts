/**
 * Tests for VectorizeEntityAction — the thin wrapper that drives
 * EntityVectorSyncer over the active Entity Documents of a given type
 * (e.g. 'Search'). Focus areas:
 *   - the "nothing to vectorize" no-op (returns Success/NO_DOCUMENTS, NOT a
 *     failure) so unattended jobs (the daily Entity Vector Sync) don't report
 *     failed runs on a fresh/empty DB,
 *   - per-document failure aggregation (any failure => FAILED),
 *   - top-level error capture (Config / GetActiveEntityDocuments throws =>
 *     a legible FAILED result, never an uncaught throw),
 *   - param shaping (EntityNames parsing, EntityDocumentType default).
 *
 * EntityVectorSyncer is mocked so the tests exercise the action's control
 * flow without touching engines, embeddings, or the database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Controllable EntityVectorSyncer mock -----------------------------------
const configMock = vi.fn();
const getActiveEntityDocumentsMock = vi.fn();
const vectorizeEntityMock = vi.fn();

vi.mock('@memberjunction/ai-vector-sync', () => ({
    EntityVectorSyncer: class {
        public Config = configMock;
        public GetActiveEntityDocuments = getActiveEntityDocumentsMock;
        public VectorizeEntity = vectorizeEntityMock;
    },
}));

vi.mock('@memberjunction/core', () => ({
    LogStatus: vi.fn(),
    LogError: vi.fn(),
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        public async Run(params: unknown): Promise<unknown> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (this as any).InternalRunAction(params);
        }
    },
}));

import { VectorizeEntityAction } from '../custom/utilities/vectorize-entity.action';

const doc = (id: string, entityID = `entity-${id}`, name = `Doc ${id}`) => ({
    ID: id,
    EntityID: entityID,
    Name: name,
});

const makeParams = (overrides: Array<{ Name: string; Value: unknown }> = []) => ({
    Params: overrides.map(p => ({ Name: p.Name, Type: 'Input', Value: p.Value })),
    ContextUser: { ID: 'user-1', Email: 'tester@example.com' },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (action: VectorizeEntityAction, params: unknown) => (action as any).InternalRunAction(params);

describe('VectorizeEntityAction', () => {
    let action: VectorizeEntityAction;

    beforeEach(() => {
        action = new VectorizeEntityAction();
        configMock.mockReset().mockResolvedValue(undefined);
        getActiveEntityDocumentsMock.mockReset().mockResolvedValue([]);
        vectorizeEntityMock.mockReset().mockResolvedValue(undefined);
    });

    describe('no-op when nothing to vectorize', () => {
        it('returns Success with NO_DOCUMENTS when no active documents exist', async () => {
            getActiveEntityDocumentsMock.mockResolvedValue([]);

            const r = await run(action, makeParams([{ Name: 'EntityDocumentType', Value: 'Search' }]));

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('NO_DOCUMENTS');
            expect(r.Message).toMatch(/Search/);
            expect(r.Message).toMatch(/nothing to vectorize/i);
            // Critically, it must NOT attempt any vectorization
            expect(vectorizeEntityMock).not.toHaveBeenCalled();
        });

        it('names the requested entities in the no-op message', async () => {
            getActiveEntityDocumentsMock.mockResolvedValue([]);

            const r = await run(action, makeParams([
                { Name: 'EntityNames', Value: 'Customers' },
                { Name: 'EntityDocumentType', Value: 'Search' },
            ]));

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('NO_DOCUMENTS');
            expect(r.Message).toMatch(/Customers/);
        });
    });

    describe('happy path', () => {
        it('vectorizes every active document and returns SUCCESS', async () => {
            getActiveEntityDocumentsMock.mockResolvedValue([doc('a'), doc('b')]);

            const r = await run(action, makeParams([{ Name: 'EntityDocumentType', Value: 'Search' }]));

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            expect(vectorizeEntityMock).toHaveBeenCalledTimes(2);
            expect(vectorizeEntityMock).toHaveBeenCalledWith(
                expect.objectContaining({ entityID: 'entity-a', entityDocumentID: 'a' }),
                expect.anything()
            );
        });
    });

    describe('failure aggregation', () => {
        it('returns FAILED when any document fails, but still processes the rest', async () => {
            getActiveEntityDocumentsMock.mockResolvedValue([doc('ok'), doc('bad')]);
            vectorizeEntityMock.mockImplementation((p: { entityDocumentID: string }) => {
                if (p.entityDocumentID === 'bad') throw new Error('embedding model offline');
                return Promise.resolve(undefined);
            });

            const r = await run(action, makeParams([{ Name: 'EntityDocumentType', Value: 'Search' }]));

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('FAILED');
            expect(r.Message).toMatch(/embedding model offline/);
            expect(vectorizeEntityMock).toHaveBeenCalledTimes(2); // both attempted
        });
    });

    describe('top-level error capture', () => {
        it('returns FAILED (not a throw) when Config() throws', async () => {
            configMock.mockRejectedValue(new Error('DB connection refused'));

            const r = await run(action, makeParams([{ Name: 'EntityDocumentType', Value: 'Search' }]));

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('FAILED');
            expect(r.Message).toMatch(/DB connection refused/);
        });

        it('returns FAILED (not a throw) when GetActiveEntityDocuments() throws', async () => {
            getActiveEntityDocumentsMock.mockRejectedValue(new Error('type misconfigured'));

            const r = await run(action, makeParams([{ Name: 'EntityDocumentType', Value: 'Search' }]));

            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('FAILED');
            expect(r.Message).toMatch(/type misconfigured/);
        });
    });

    describe('parameter shaping', () => {
        it('defaults EntityDocumentType to "Record Duplicate" when omitted', async () => {
            getActiveEntityDocumentsMock.mockResolvedValue([]);

            await run(action, makeParams([]));

            expect(getActiveEntityDocumentsMock).toHaveBeenCalledWith([], 'Record Duplicate');
        });

        it('splits a comma-delimited EntityNames string into an array', async () => {
            getActiveEntityDocumentsMock.mockResolvedValue([]);

            await run(action, makeParams([
                { Name: 'EntityNames', Value: 'Customers,Orders,Products' },
                { Name: 'EntityDocumentType', Value: 'Search' },
            ]));

            expect(getActiveEntityDocumentsMock).toHaveBeenCalledWith(
                ['Customers', 'Orders', 'Products'],
                'Search'
            );
        });

        it('passes an array EntityNames value through unchanged', async () => {
            getActiveEntityDocumentsMock.mockResolvedValue([]);

            await run(action, makeParams([
                { Name: 'EntityNames', Value: ['Customers', 'Orders'] },
                { Name: 'EntityDocumentType', Value: 'Search' },
            ]));

            expect(getActiveEntityDocumentsMock).toHaveBeenCalledWith(['Customers', 'Orders'], 'Search');
        });
    });
});
