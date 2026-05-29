/**
 * Tests for SearchEntitiesAction — the metadata-driven wrapper around
 * IMetadataProvider.SearchEntities(). The action is intentionally thin
 * (extract params, delegate, return) so tests focus on validation,
 * param shaping, and pass-through behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchEntitiesMock = vi.fn();

vi.mock('@memberjunction/core', () => ({
    Metadata: vi.fn().mockImplementation(() => ({ SearchEntities: searchEntitiesMock })),
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

import { SearchEntitiesAction } from '../custom/data/search-entities.action';

const makeParams = (overrides: Array<{ Name: string; Value: unknown }>): {
    Params: Array<{ Name: string; Type: string; Value: unknown }>;
    ContextUser?: unknown;
    Provider?: unknown;
} => ({
    Params: overrides.map(p => ({ Name: p.Name, Type: 'Input', Value: p.Value })),
});

describe('SearchEntitiesAction', () => {
    let action: SearchEntitiesAction;

    beforeEach(() => {
        action = new SearchEntitiesAction();
        searchEntitiesMock.mockReset();
        searchEntitiesMock.mockResolvedValue([]);
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

    describe('pass-through to SearchEntities', () => {
        it('defaults to hybrid mode with topK=10, weights 1.0', async () => {
            const params = makeParams([
                { Name: 'EntityName', Value: 'MJ: Entities' },
                { Name: 'SearchText', Value: 'invoices' },
            ]);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (action as any).InternalRunAction(params);

            expect(searchEntitiesMock).toHaveBeenCalledOnce();
            const [entityName, text, opts] = searchEntitiesMock.mock.calls[0];
            expect(entityName).toBe('MJ: Entities');
            expect(text).toBe('invoices');
            expect(opts.mode).toBe('hybrid');
            expect(opts.topK).toBe(10);
            expect(opts.weights).toEqual({ lexical: 1.0, semantic: 1.0 });
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

            const [, , opts] = searchEntitiesMock.mock.calls[0];
            expect(opts.mode).toBe('semantic');
            expect(opts.topK).toBe(5);
            expect(opts.weights).toEqual({ lexical: 2.5, semantic: 0.5 });
            expect(opts.rrfK).toBe(30);
            expect(opts.entityDocumentId).toBe('doc-abc');
        });
    });

    describe('result shaping', () => {
        it('packages results into SUCCESS message and output params', async () => {
            searchEntitiesMock.mockResolvedValue([
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

            // Output params added
            const countParam = params.Params.find(p => p.Name === 'Count');
            const resultsParam = params.Params.find(p => p.Name === 'Results');
            expect(countParam?.Value).toBe(2);
            expect((resultsParam?.Value as unknown[]).length).toBe(2);
        });
    });

    describe('error handling', () => {
        it('returns UNEXPECTED_ERROR when the provider throws', async () => {
            searchEntitiesMock.mockRejectedValueOnce(new Error('boom'));
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
