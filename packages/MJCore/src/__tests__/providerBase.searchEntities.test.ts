/**
 * Tests for ProviderBase.SearchEntities()
 *
 * SearchEntities is the cross-mode (lexical / semantic / hybrid) search helper
 * on IMetadataProvider. These tests exercise the orchestration logic by
 * stubbing the private lexical/semantic passes and the permission filter,
 * leaving the blending + result-shaping under test.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderBase } from '../generic/providerBase';
import { EntityInfo } from '../generic/entityInfo';
import { ProviderType } from '../generic/interfaces';
import { ScoredCandidate } from '../generic/scoring/ReciprocalRankFusion';

/** Minimal ProviderBase subclass that lets each test inject its own
 *  lexical/semantic/permission stubs via `as any` access. */
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

    // Override the private passes via `as any` in tests by stashing results
    // on instance fields and shadowing the originals.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async searchEntitiesLexicalPass(): Promise<ScoredCandidate[]> { return this.stubLexical; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async searchEntitiesSemanticPass(): Promise<ScoredCandidate[]> { return this.stubSemantic; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async resolveSearchEntityDocument(): Promise<{ id: string; driverClass: string | null; apiName: string | null } | null> {
        // Semantic mode requires a resolved EntityDocument; pretend we have one
        return { id: 'doc-1', driverClass: null, apiName: null };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async searchEntitiesFilterByPermission(_entity: EntityInfo, ids: string[]): Promise<Set<string>> {
        // Default: pass everything through. Tests override stubPermissionAllowedIds to restrict.
        return this.stubPermissionAllowedIds ?? new Set(ids);
    }

    // Stubs for abstract pieces that SearchEntities doesn't exercise:
    protected async InternalRunView(): Promise<{ Success: boolean; Results: unknown[]; RowCount: number; TotalRowCount: number; ExecutionTime: number; ErrorMessage: string; UserViewRunID: string }> {
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
    }
    protected async InternalRunViews(): Promise<never[]> { return []; }
    protected async InternalRunQuery(): Promise<{ Success: boolean; Results: unknown[]; RowCount: number; TotalRowCount: number; ExecutionTime: number; ErrorMessage: string; QueryID: string; QueryName: string }> {
        return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '', QueryID: '', QueryName: '' };
    }
}

/** Build a minimal EntityInfo stand-in. SearchEntities only reads .Name, .ID, and (via lexical pass which is stubbed) Fields. */
const buildEntity = (overrides: Partial<{ ID: string; Name: string }> = {}): EntityInfo => ({
    ID: overrides.ID ?? 'entity-1',
    Name: overrides.Name ?? 'Test Entity',
    Fields: [],
} as unknown as EntityInfo);

describe('ProviderBase.SearchEntities', () => {
    let provider: StubProvider;

    beforeEach(() => {
        provider = new StubProvider();
        provider.stubEntity = buildEntity();
    });

    describe('input validation', () => {
        it('returns empty for unknown entity', async () => {
            provider.stubEntity = undefined;
            const r = await provider.SearchEntities('Nope', 'find this');
            expect(r).toEqual([]);
        });

        it('returns empty for empty search text', async () => {
            const r = await provider.SearchEntities('Test', '   ');
            expect(r).toEqual([]);
        });
    });

    describe('mode dispatch', () => {
        it('lexical mode returns only lexical results in lexical order', async () => {
            provider.stubLexical = [
                { ID: 'a', Score: 1.0 },
                { ID: 'b', Score: 0.7 },
            ];
            provider.stubSemantic = [{ ID: 'c', Score: 0.9 }];

            const r = await provider.SearchEntities('Test', 'foo', { mode: 'lexical', topK: 10 });
            expect(r.map(x => x.recordId)).toEqual(['a', 'b']);
            expect(r.every(x => x.matchType === 'lexical')).toBe(true);
        });

        it('semantic mode returns only semantic results', async () => {
            provider.stubLexical = [{ ID: 'a', Score: 1.0 }];
            provider.stubSemantic = [
                { ID: 'c', Score: 0.9 },
                { ID: 'd', Score: 0.8 },
            ];

            const r = await provider.SearchEntities('Test', 'foo', { mode: 'semantic', topK: 10 });
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

            const r = await provider.SearchEntities('Test', 'foo', { topK: 10 });
            // 'shared' should rank first (appears in both lists)
            expect(r[0].recordId).toBe('shared');
            expect(r[0].matchType).toBe('hybrid');
            expect(r[0].components.lexical).toBeDefined();
            expect(r[0].components.semantic).toBeDefined();
        });
    });

    describe('weights', () => {
        it('lexical weight 0 effectively suppresses lexical contribution', async () => {
            provider.stubLexical = [{ ID: 'lex-only', Score: 1.0 }];
            provider.stubSemantic = [{ ID: 'sem-only', Score: 1.0 }];

            const r = await provider.SearchEntities('Test', 'foo', {
                mode: 'hybrid',
                weights: { lexical: 0, semantic: 1 },
                topK: 10,
            });
            // Only sem-only survives — lex-only's RRF contribution is zero
            expect(r.map(x => x.recordId)).toEqual(['sem-only']);
        });
    });

    describe('topK and minScore', () => {
        it('respects topK', async () => {
            provider.stubLexical = [
                { ID: 'a', Score: 1.0 },
                { ID: 'b', Score: 0.9 },
                { ID: 'c', Score: 0.8 },
                { ID: 'd', Score: 0.7 },
            ];
            const r = await provider.SearchEntities('Test', 'foo', { mode: 'lexical', topK: 2 });
            expect(r).toHaveLength(2);
        });

        it('drops results below minScore', async () => {
            provider.stubLexical = [
                { ID: 'a', Score: 1.0 },
                { ID: 'b', Score: 0.05 },
            ];
            const r = await provider.SearchEntities('Test', 'foo', {
                mode: 'lexical',
                topK: 10,
                minScore: 0.1,
            });
            expect(r.map(x => x.recordId)).toEqual(['a']);
        });
    });

    describe('permission filter', () => {
        it('drops records the user cannot read', async () => {
            provider.stubLexical = [
                { ID: 'allowed', Score: 0.9 },
                { ID: 'denied', Score: 0.8 },
            ];
            provider.stubPermissionAllowedIds = new Set(['allowed']);

            const r = await provider.SearchEntities('Test', 'foo', { mode: 'lexical', topK: 10 });
            expect(r.map(x => x.recordId)).toEqual(['allowed']);
        });
    });

    describe('result shape', () => {
        it('includes both component scores for a hybrid match', async () => {
            provider.stubLexical = [{ ID: 'x', Score: 0.7 }];
            provider.stubSemantic = [{ ID: 'x', Score: 0.9 }];

            const r = await provider.SearchEntities('Test', 'foo', { topK: 1 });
            expect(r[0].matchType).toBe('hybrid');
            expect(r[0].components.lexical).toBeCloseTo(0.7, 5);
            expect(r[0].components.semantic).toBeCloseTo(0.9, 5);
        });

        it('marks lexical-only matches as type lexical with no semantic component', async () => {
            provider.stubLexical = [{ ID: 'x', Score: 0.9 }];
            provider.stubSemantic = [];

            const r = await provider.SearchEntities('Test', 'foo', { topK: 1 });
            expect(r[0].matchType).toBe('lexical');
            expect(r[0].components.lexical).toBeDefined();
            expect(r[0].components.semantic).toBeUndefined();
        });
    });
});
