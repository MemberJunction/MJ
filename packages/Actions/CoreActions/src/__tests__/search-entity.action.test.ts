/**
 * Tests for SearchEntityAction — the metadata-driven wrapper around
 * IMetadataProvider.SearchEntity(). The action is intentionally thin
 * (extract params, delegate, return) so tests focus on validation,
 * param shaping, and pass-through behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchEntityMock = vi.fn();

vi.mock('@memberjunction/core', () => ({
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

import { SearchEntityAction } from '../custom/data/search-entity.action';

const makeProvider = () => ({ SearchEntity: searchEntityMock });

const makeParams = (
    overrides: Array<{ Name: string; Value: unknown }>,
    opts: { withProvider?: boolean } = { withProvider: true }
): {
    Params: Array<{ Name: string; Type: string; Value: unknown }>;
    ContextUser?: unknown;
    Provider?: unknown;
} => ({
    Params: overrides.map(p => ({ Name: p.Name, Type: 'Input', Value: p.Value })),
    Provider: opts.withProvider !== false ? makeProvider() : undefined,
});

describe('SearchEntityAction', () => {
    let action: SearchEntityAction;

    beforeEach(() => {
        action = new SearchEntityAction();
        searchEntityMock.mockReset();
        searchEntityMock.mockResolvedValue([]);
    });

    describe('parameter validation', () => {
        it('returns MISSING_PARAMETER when EntityName is absent', async () => {
            const params = makeParams([{ Name: 'SearchText', Value: 'foo' }]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await (action as any).InternalRunAction(params);
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('MISSING_PARAMETER');
            expect(r.Message).toMatch(/EntityName/);
        });

        it('returns MISSING_PARAMETER when SearchText is absent', async () => {
            const params = makeParams([{ Name: 'EntityName', Value: 'Foo' }]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await (action as any).InternalRunAction(params);
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('MISSING_PARAMETER');
            expect(r.Message).toMatch(/SearchText/);
        });

        it('returns MISSING_PROVIDER when params.Provider is absent', async () => {
            const params = makeParams(
                [
                    { Name: 'EntityName', Value: 'Foo' },
                    { Name: 'SearchText', Value: 'bar' },
                ],
                { withProvider: false }
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await (action as any).InternalRunAction(params);
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('MISSING_PROVIDER');
        });

        it('rejects invalid Mode values', async () => {
            const params = makeParams([
                { Name: 'EntityName', Value: 'Foo' },
                { Name: 'SearchText', Value: 'bar' },
                { Name: 'Mode', Value: 'fuzzy' },
            ]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await (action as any).InternalRunAction(params);
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('INVALID_PARAMETER');
        });
    });

    describe('pass-through to SearchEntity', () => {
        it('packages params into a single SearchEntityParams object with hybrid defaults', async () => {
            const params = makeParams([
                { Name: 'EntityName', Value: 'MJ: Entities' },
                { Name: 'SearchText', Value: 'invoices' },
            ]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (action as any).InternalRunAction(params);

            expect(searchEntityMock).toHaveBeenCalledOnce();
            const [searchParams] = searchEntityMock.mock.calls[0];
            expect(searchParams.entityName).toBe('MJ: Entities');
            expect(searchParams.searchText).toBe('invoices');
            expect(searchParams.options.mode).toBe('hybrid');
            expect(searchParams.options.topK).toBe(10);
            expect(searchParams.options.weights).toEqual({ lexical: 1.0, semantic: 1.0 });
        });

        it('passes through topK, mode, weights, RRFK, EntityDocumentID', async () => {
            const params = makeParams([
                { Name: 'EntityName', Value: 'Foo' },
                { Name: 'SearchText', Value: 'bar' },
                { Name: 'Mode', Value: 'semantic' },
                { Name: 'TopK', Value: 5 },
                { Name: 'LexicalWeight', Value: 2.5 },
                { Name: 'SemanticWeight', Value: 0.5 },
                { Name: 'RRFK', Value: 30 },
                { Name: 'EntityDocumentID', Value: 'doc-abc' },
            ]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (action as any).InternalRunAction(params);

            const [searchParams] = searchEntityMock.mock.calls[0];
            expect(searchParams.options.mode).toBe('semantic');
            expect(searchParams.options.topK).toBe(5);
            expect(searchParams.options.weights).toEqual({ lexical: 2.5, semantic: 0.5 });
            expect(searchParams.options.rrfK).toBe(30);
            expect(searchParams.options.entityDocumentId).toBe('doc-abc');
        });
    });

    describe('result shaping', () => {
        it('packages results into SUCCESS message and output params', async () => {
            searchEntityMock.mockResolvedValue([
                { recordId: 'a', score: 0.9, matchType: 'hybrid', components: {}, entityRecordDocumentId: 'erd-1' },
                { recordId: 'b', score: 0.8, matchType: 'lexical', components: {}, entityRecordDocumentId: null },
            ]);

            const params = makeParams([
                { Name: 'EntityName', Value: 'Foo' },
                { Name: 'SearchText', Value: 'bar' },
            ]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await (action as any).InternalRunAction(params);

            expect(r.Success).toBe(true);
            expect(r.ResultCode).toBe('SUCCESS');
            const payload = JSON.parse(r.Message);
            expect(payload.count).toBe(2);
            expect(payload.results).toHaveLength(2);

            const countParam = params.Params.find(p => p.Name === 'Count');
            const resultsParam = params.Params.find(p => p.Name === 'Results');
            expect(countParam?.Value).toBe(2);
            expect((resultsParam?.Value as unknown[]).length).toBe(2);
        });
    });

    describe('error handling', () => {
        it('returns UNEXPECTED_ERROR when the provider throws', async () => {
            searchEntityMock.mockRejectedValueOnce(new Error('boom'));
            const params = makeParams([
                { Name: 'EntityName', Value: 'Foo' },
                { Name: 'SearchText', Value: 'bar' },
            ]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await (action as any).InternalRunAction(params);
            expect(r.Success).toBe(false);
            expect(r.ResultCode).toBe('UNEXPECTED_ERROR');
            expect(r.Message).toMatch(/boom/);
        });
    });
});
