/**
 * MinScore semantics: a floor on the semantic (vector) lane's own cosine score, applied before
 * RRF fusion. Fused RRF scores are rank-based and not comparable to a similarity threshold, so
 * MinScore is never applied to them, and lanes whose score is not a similarity (keyword LIKE,
 * full-text, tag, storage) have no numeric floor: a hit there already means the text matched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockEntityByName, mockRunViewFn } = vi.hoisted(() => ({
    mockEntityByName: vi.fn(),
    mockRunViewFn: vi.fn(),
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        EntityByName(name: string) { return mockEntityByName(name); }
        Entities = [];
        // Static Provider so SearchEnricher's `Metadata.Provider` fallback
        // resolves when tests bypass Config().
        static Provider = {
            EntityByName: (_name: string) => null,
            Entities: [],
        };
    }
    class MockRunView {
        RunView = mockRunViewFn;
    }
    return {
        ...actual,
        Metadata: MockMetadata,
        RunView: MockRunView,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
    };
});

import { SearchEngine } from '../generic/SearchEngine';
import type { SearchResultItem, SearchParams, SearchStreamEvent } from '../generic/search.types';
import { BaseSearchProvider } from '../generic/ISearchProvider';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';

function createUser(id: string): UserInfo {
    return { ID: id, Name: 'Test User', Email: 't@example.com' } as UserInfo;
}

function makeItem(id: string, sourceType: SearchResultItem['SourceType']): SearchResultItem {
    return {
        ID: `r-${id}`,
        EntityName: 'Test',
        RecordID: id,
        SourceType: sourceType,
        Title: `record ${id}`,
        Snippet: `snippet ${id}`,
        Score: 0.5,
        ScoreBreakdown: { [sourceType.charAt(0).toUpperCase() + sourceType.slice(1)]: 0.5 } as SearchResultItem['ScoreBreakdown'],
        Tags: [],
        MatchedAt: new Date(),
        ResultType: 'entity-record',
    };
}

interface ProviderEntry {
    Provider: BaseSearchProvider;
    ID: string;
    DisplayName: string;
    Icon: string;
    Priority: number;
    SupportsPreview: boolean;
    MaxResultsOverride: number | null;
    Record: unknown;
}

interface SearchEngineTestState {
    _providerEntries: ProviderEntry[];
    _configured: boolean;
}

class TestSearchEngine extends SearchEngine {
    public InjectProviders(entries: ProviderEntry[]): void {
        const state = this as unknown as SearchEngineTestState;
        state._providerEntries = entries;
        state._configured = true;
    }
    // Bypass the entity-permission safety net for these tests — we're
    // verifying provider-fanout error isolation, not RLS.
    public override async filterByPermissions(results: SearchResultItem[]): Promise<SearchResultItem[]> {
        return results;
    }
    // The merged multi-provider refactor reads `this.Base.ProviderToUse` from
    // SearchEngineBase, which isn't initialized in unit tests that bypass
    // Config(). Stub a minimal IMetadataProvider that satisfies the few
    // accesses the engine makes during provider fanout.
    protected override get ProviderToUse(): IMetadataProvider {
        return {
            EntityByName: (_name: string) => null,
            Entities: [],
        } as unknown as IMetadataProvider;
    }
}

function makeEntry(label: string, provider: BaseSearchProvider): ProviderEntry {
    return {
        Provider: provider,
        ID: `prov-${label}`,
        DisplayName: label,
        Icon: 'fa-solid fa-circle',
        Priority: 0,
        SupportsPreview: false,
        MaxResultsOverride: null,
        Record: {} as unknown,
    };
}


function scored(id: string, sourceType: SearchResultItem['SourceType'], score: number): SearchResultItem {
    const item = makeItem(id, sourceType);
    const key = sourceType === 'fulltext' ? 'FullText' : sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
    return { ...item, Score: score, ScoreBreakdown: { [key]: score } as SearchResultItem['ScoreBreakdown'] };
}

/** Returns a fixed list, in the order given (providers return best-first). */
class FixedProvider extends BaseSearchProvider {
    public override readonly SourceType: SearchResultItem['SourceType'];
    constructor(sourceType: SearchResultItem['SourceType'], private readonly items: SearchResultItem[]) {
        super();
        this.SourceType = sourceType;
    }
    public override IsAvailable(): boolean { return true; }
    public override async Initialize(): Promise<void> { /* no-op */ }
    public override async Search(): Promise<SearchResultItem[]> {
        return this.items.map(i => ({ ...i }));
    }
}

describe('SearchEngine MinScore is a semantic-lane floor applied before fusion', () => {
    let engine: TestSearchEngine;
    const user = createUser('u-floor');

    beforeEach(() => {
        engine = new TestSearchEngine();
        mockEntityByName.mockReturnValue({ Name: 'Test', FirstPrimaryKey: { Name: 'ID' } });
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
    });

    it('drops vector hits below MinScore before fusion', async () => {
        engine.InjectProviders([
            makeEntry('Vec', new FixedProvider('vector', [scored('v-high', 'vector', 0.8), scored('v-low', 'vector', 0.2)])),
            makeEntry('Kw', new FixedProvider('entity', [scored('k', 'entity', 0.59)])),
        ]);
        const result = await engine.Search({ Query: 'floor-a', MinScore: 0.5 } as SearchParams, user);
        const ids = result.Results.map(r => r.RecordID);
        expect(ids).toContain('v-high');
        expect(ids).toContain('k');
        expect(ids).not.toContain('v-low');
    });

    it('never drops keyword (entity) hits, whatever their heuristic score', async () => {
        engine.InjectProviders([
            makeEntry('Kw', new FixedProvider('entity', [scored('k-weak', 'entity', 0.15)])),
        ]);
        const result = await engine.Search({ Query: 'floor-b', MinScore: 0.9 } as SearchParams, user);
        expect(result.Results.map(r => r.RecordID)).toEqual(['k-weak']);
    });

    it('does not filter on the fused Score', async () => {
        // Both pass their lane (vector 0.7 >= 0.6; keyword has no floor). Each is one lane's #1
        // out of two lanes, so its fused Score is 0.5, below MinScore. Both must still come back.
        engine.InjectProviders([
            makeEntry('Vec', new FixedProvider('vector', [scored('a', 'vector', 0.7)])),
            makeEntry('Kw', new FixedProvider('entity', [scored('b', 'entity', 0.59)])),
        ]);
        const result = await engine.Search({ Query: 'floor-c', MinScore: 0.6 } as SearchParams, user);
        expect(result.Results.map(r => r.RecordID).sort()).toEqual(['a', 'b']);
        for (const r of result.Results) expect(r.Score).toBeCloseTo(0.5, 10);
    });

    it('counts only the vector hits that passed the floor', async () => {
        engine.InjectProviders([
            makeEntry('Vec', new FixedProvider('vector', [scored('v1', 'vector', 0.8), scored('v2', 'vector', 0.3)])),
        ]);
        const result = await engine.Search({ Query: 'floor-d', MinScore: 0.5 } as SearchParams, user);
        expect(result.SourceCounts.Vector).toBe(1);
        expect(result.Results.map(r => r.RecordID)).toEqual(['v1']);
    });

    it('with no MinScore, keeps every vector hit', async () => {
        engine.InjectProviders([
            makeEntry('Vec', new FixedProvider('vector', [scored('v1', 'vector', 0.8), scored('v2', 'vector', 0.05)])),
        ]);
        const result = await engine.Search({ Query: 'floor-e' } as SearchParams, user);
        expect(result.Results.map(r => r.RecordID)).toEqual(['v1', 'v2']);
    });

    it('applies the floor to streamed per-provider results too', async () => {
        engine.InjectProviders([
            makeEntry('Vec', new FixedProvider('vector', [scored('v-high', 'vector', 0.8), scored('v-low', 'vector', 0.2)])),
        ]);
        const streamed: string[] = [];
        for await (const ev of engine.streamSearch({ Query: 'floor-f', MinScore: 0.5 } as SearchParams, user)) {
            const e = ev as SearchStreamEvent;
            if (e.phase === 'provider') streamed.push(...e.results.map(r => r.RecordID));
        }
        expect(streamed).toEqual(['v-high']);
    });
});
