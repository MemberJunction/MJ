/**
 * Tests for ProviderBase.SearchEntity() / SearchEntities() — the two-tier
 * ranked-search API.
 *
 * The orchestration (lexical + semantic + RRF blend + permission filter)
 * is concrete on ProviderBase. The semantic pass is `protected abstract`
 * and is overridden by concrete providers (server-side: real embedder +
 * vector pool; client-side: full GraphQL proxy that bypasses this code path).
 *
 * These tests exercise the orchestration by replacing the private helpers
 * on the class prototype before each case. Private members in TypeScript
 * are a compile-time guard, not a runtime one — JavaScript still lets us
 * swap them, which is the only way to test the orchestration in isolation
 * without standing up a database + AIEngine + vector pool.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { EntityInfo } from '../generic/entityInfo';
import { ProviderType } from '../generic/interfaces';
import { ScoredCandidate } from '../generic/scoring/ReciprocalRankFusion';

/** Minimal concrete `ProviderBase` for testing. Implements the abstract
 *  semantic pass via a per-instance result list; other private helpers on
 *  ProviderBase are stubbed via prototype monkey-patching below. */
class StubProvider extends ProviderBase {
    public stubEntity: EntityInfo | undefined;
    public stubLexical: ScoredCandidate[] = [];
    public stubSemantic: ScoredCandidate[] = [];
    public stubPermissionAllowedIds: Set<string> | null = null;

    constructor() { super(); }

    public get ProviderType(): ProviderType { return 'Database'; }
    public get DatabaseConnection(): unknown { return {}; }
    public EntityByName(_name: string): EntityInfo | undefined { return this.stubEntity; }
    public async GetEntityRecordName(): Promise<string> { return ''; }
    public async GetEntityRecordNames(): Promise<never[]> { return []; }
    public async GetRecordFavoriteStatus(): Promise<boolean> { return false; }
    public async SetRecordFavoriteStatus(): Promise<void> { /* no-op */ }

    protected async searchEntitiesSemanticPass(): Promise<ScoredCandidate[]> {
        return this.stubSemantic;
    }

    protected async InternalRunView(): Promise<{ Success: boolean; Results: unknown[]; RowCount: number; TotalRowCount: number; ExecutionTime: number; ErrorMessage: string; UserViewRunID: string }> {
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    }
    protected async InternalRunViews(): Promise<never[]> { return []; }
    protected async InternalRunQuery(): Promise<{ Success: boolean; Results: unknown[]; RowCount: number; TotalRowCount: number; ExecutionTime: number; ErrorMessage: string; QueryID: string; QueryName: string }> {
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', QueryID: '', QueryName: '' };
    }
}

const buildEntity = (overrides: Partial<{ ID: string; Name: string }> = {}): EntityInfo => ({
    ID: overrides.ID ?? 'entity-1',
    Name: overrides.Name ?? 'Test Entity',
    Fields: [],
} as unknown as EntityInfo);

describe('ProviderBase.SearchEntity / SearchEntities', () => {
    let provider: StubProvider;
    type ProviderBaseProto = ProviderBase & {
        resolveSearchEntityDocument: (...args: unknown[]) => Promise<{ id: string; driverClass: string | null; apiName: string | null } | null>;
        searchEntitiesLexicalPass: (...args: unknown[]) => Promise<ScoredCandidate[]>;
        searchEntitiesFilterByPermission: (entity: EntityInfo, ids: string[], contextUser?: unknown) => Promise<Set<string>>;
    };
    let proto: ProviderBaseProto;
    let originalResolve: ProviderBaseProto['resolveSearchEntityDocument'];
    let originalLexical: ProviderBaseProto['searchEntitiesLexicalPass'];
    let originalFilter: ProviderBaseProto['searchEntitiesFilterByPermission'];

    beforeEach(() => {
        provider = new StubProvider();
        provider.stubEntity = buildEntity();
        proto = ProviderBase.prototype as ProviderBaseProto;
        originalResolve = proto.resolveSearchEntityDocument;
        originalLexical = proto.searchEntitiesLexicalPass;
        originalFilter = proto.searchEntitiesFilterByPermission;

        proto.resolveSearchEntityDocument = vi.fn(async () => ({ id: 'doc-1', driverClass: null, apiName: null }));
        proto.searchEntitiesLexicalPass = vi.fn(async function (this: StubProvider) {
            return this.stubLexical;
        }) as ProviderBaseProto['searchEntitiesLexicalPass'];
        proto.searchEntitiesFilterByPermission = vi.fn(async function (
            this: StubProvider, _entity: EntityInfo, ids: string[]
        ) {
            return this.stubPermissionAllowedIds ?? new Set(ids);
        }) as ProviderBaseProto['searchEntitiesFilterByPermission'];
    });

    afterEach(() => {
        proto.resolveSearchEntityDocument = originalResolve;
        proto.searchEntitiesLexicalPass = originalLexical;
        proto.searchEntitiesFilterByPermission = originalFilter;
    });

    describe('SearchEntity — input validation', () => {
        it('returns empty for unknown entity', async () => {
            provider.stubEntity = undefined;
            const r = await provider.SearchEntity({ entityName: 'Nope', searchText: 'find this' });
            expect(r).toEqual([]);
        });

        it('returns empty for empty search text', async () => {
            const r = await provider.SearchEntity({ entityName: 'Test', searchText: '   ' });
            expect(r).toEqual([]);
        });
    });

    describe('SearchEntity — mode dispatch', () => {
        it('lexical mode returns only lexical results in lexical order', async () => {
            provider.stubLexical = [
                { ID: 'a', Score: 1.0 },
                { ID: 'b', Score: 0.7 },
            ];
            provider.stubSemantic = [{ ID: 'c', Score: 0.9 }];

            const r = await provider.SearchEntity({
                entityName: 'Test', searchText: 'foo',
                options: { mode: 'lexical', topK: 10 }
            });
            expect(r.map(x => x.recordId)).toEqual(['a', 'b']);
            expect(r.every(x => x.matchType === 'lexical')).toBe(true);
        });

        it('semantic mode returns only semantic results', async () => {
            provider.stubLexical = [{ ID: 'a', Score: 1.0 }];
            provider.stubSemantic = [
                { ID: 'c', Score: 0.9 },
                { ID: 'd', Score: 0.8 },
            ];

            const r = await provider.SearchEntity({
                entityName: 'Test', searchText: 'foo',
                options: { mode: 'semantic', topK: 10 }
            });
            expect(r.map(x => x.recordId)).toEqual(['c', 'd']);
            expect(r.every(x => x.matchType === 'semantic')).toBe(true);
        });

        it('hybrid mode (default) blends both via RRF; shared records dominate', async () => {
            provider.stubLexical = [
                { ID: 'shared', Score: 1.0 },
                { ID: 'only-lex', Score: 0.7 },
            ];
            provider.stubSemantic = [
                { ID: 'shared', Score: 0.9 },
                { ID: 'only-sem', Score: 0.8 },
            ];

            const r = await provider.SearchEntity({
                entityName: 'Test', searchText: 'foo',
                options: { topK: 10 }
            });
            expect(r[0].recordId).toBe('shared');
            expect(r[0].matchType).toBe('hybrid');
            expect(r[0].components.lexical).toBeDefined();
            expect(r[0].components.semantic).toBeDefined();
        });
    });

    describe('SearchEntity — weights', () => {
        it('lexical weight 0 suppresses lexical contribution', async () => {
            provider.stubLexical = [{ ID: 'lex-only', Score: 1.0 }];
            provider.stubSemantic = [{ ID: 'sem-only', Score: 1.0 }];

            const r = await provider.SearchEntity({
                entityName: 'Test', searchText: 'foo',
                options: { mode: 'hybrid', weights: { lexical: 0, semantic: 1 }, topK: 10 }
            });
            expect(r.map(x => x.recordId)).toEqual(['sem-only']);
        });
    });

    describe('SearchEntity — topK and minScore', () => {
        it('respects topK', async () => {
            provider.stubLexical = [
                { ID: 'a', Score: 1.0 },
                { ID: 'b', Score: 0.9 },
                { ID: 'c', Score: 0.8 },
                { ID: 'd', Score: 0.7 },
            ];
            const r = await provider.SearchEntity({
                entityName: 'Test', searchText: 'foo',
                options: { mode: 'lexical', topK: 2 }
            });
            expect(r).toHaveLength(2);
        });

        it('drops results below minScore', async () => {
            provider.stubLexical = [
                { ID: 'a', Score: 1.0 },
                { ID: 'b', Score: 0.05 },
            ];
            const r = await provider.SearchEntity({
                entityName: 'Test', searchText: 'foo',
                options: { mode: 'lexical', topK: 10, minScore: 0.1 }
            });
            expect(r.map(x => x.recordId)).toEqual(['a']);
        });
    });

    describe('SearchEntity — permission filter', () => {
        it('drops records the user cannot read', async () => {
            provider.stubLexical = [
                { ID: 'allowed', Score: 0.9 },
                { ID: 'denied', Score: 0.8 },
            ];
            provider.stubPermissionAllowedIds = new Set(['allowed']);

            const r = await provider.SearchEntity({
                entityName: 'Test', searchText: 'foo',
                options: { mode: 'lexical', topK: 10 }
            });
            expect(r.map(x => x.recordId)).toEqual(['allowed']);
        });
    });

    describe('SearchEntity — result shape', () => {
        it('includes both component scores for a hybrid match', async () => {
            provider.stubLexical = [{ ID: 'x', Score: 0.7 }];
            provider.stubSemantic = [{ ID: 'x', Score: 0.9 }];

            const r = await provider.SearchEntity({
                entityName: 'Test', searchText: 'foo',
                options: { topK: 1 }
            });
            expect(r[0].matchType).toBe('hybrid');
            expect(r[0].components.lexical).toBeCloseTo(0.7, 5);
            expect(r[0].components.semantic).toBeCloseTo(0.9, 5);
        });

        it('marks lexical-only matches as type lexical with no semantic component', async () => {
            provider.stubLexical = [{ ID: 'x', Score: 0.9 }];
            provider.stubSemantic = [];

            const r = await provider.SearchEntity({
                entityName: 'Test', searchText: 'foo',
                options: { topK: 1 }
            });
            expect(r[0].matchType).toBe('lexical');
            expect(r[0].components.lexical).toBeDefined();
            expect(r[0].components.semantic).toBeUndefined();
        });
    });

    describe('SearchEntities (plural)', () => {
        it('returns an empty array when given an empty input list', async () => {
            const r = await provider.SearchEntities([]);
            expect(r).toEqual([]);
        });

        it('fans the call out across N entities, returning result arrays aligned by input order', async () => {
            // Same stub responds to every per-entity call (StubProvider only stubs one entity).
            // We assert the orchestration shape: N inputs → N output arrays in the same order.
            provider.stubLexical = [{ ID: 'a', Score: 0.9 }];
            provider.stubSemantic = [];

            const r = await provider.SearchEntities([
                { entityName: 'Test', searchText: 'one', options: { mode: 'lexical', topK: 1 } },
                { entityName: 'Test', searchText: 'two', options: { mode: 'lexical', topK: 1 } },
                { entityName: 'Test', searchText: 'three', options: { mode: 'lexical', topK: 1 } },
            ]);

            expect(r).toHaveLength(3);
            expect(r.every(group => group[0].recordId === 'a')).toBe(true);
        });
    });
});
