/**
 * Tests for graceful degradation when one provider throws mid-search.
 *
 * Closes a release-readiness gap: `executeScopeBundle` wraps each provider
 * in try/catch and returns `[]` on throw, but no test exercises the path
 * where one provider crashes among healthy ones. Real production failure
 * mode: the embedding service has a blip, or Pinecone's API key rotates,
 * or Elasticsearch returns a 5xx. The expected behavior is that the
 * other providers' results still flow through and the overall search
 * returns Success with degraded coverage.
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
import type { SearchResultItem, SearchParams } from '../generic/search.types';
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

/** A provider that succeeds quickly, returning a single deterministic item. */
class HealthyProvider extends BaseSearchProvider {
    public override readonly SourceType: SearchResultItem['SourceType'];
    private readonly _label: string;
    constructor(label: string, sourceType: SearchResultItem['SourceType']) {
        super();
        this._label = label;
        this.SourceType = sourceType;
    }
    public override IsAvailable(): boolean { return true; }
    public override async Initialize(): Promise<void> { /* no-op */ }
    public override async Search(): Promise<SearchResultItem[]> {
        return [makeItem(this._label, this.SourceType)];
    }
}

/**
 * A provider that passes IsAvailable() but throws asynchronously when
 * Search is invoked. Mirrors the real-world "service was reachable at
 * registration time, then went down between Config() and Search()" path
 * — exactly the case `executeScopeBundle`'s try/catch is meant to cover.
 */
class CrashingAsyncProvider extends BaseSearchProvider {
    public override readonly SourceType: SearchResultItem['SourceType'];
    private readonly _errorMessage: string;
    constructor(sourceType: SearchResultItem['SourceType'], errorMessage = 'simulated provider crash') {
        super();
        this.SourceType = sourceType;
        this._errorMessage = errorMessage;
    }
    public override IsAvailable(): boolean { return true; }
    public override async Initialize(): Promise<void> { /* no-op */ }
    public override async Search(): Promise<SearchResultItem[]> {
        // Yield to the microtask queue first so the throw happens *during*
        // the search promise, not at construction. Reproduces a real async
        // failure (e.g. a fetch rejecting mid-request).
        await new Promise<void>((r) => setTimeout(r, 1));
        throw new Error(this._errorMessage);
    }
}

/** A provider that throws synchronously inside Search. */
class CrashingSyncProvider extends BaseSearchProvider {
    public override readonly SourceType: SearchResultItem['SourceType'];
    constructor(sourceType: SearchResultItem['SourceType']) {
        super();
        this.SourceType = sourceType;
    }
    public override IsAvailable(): boolean { return true; }
    public override async Initialize(): Promise<void> { /* no-op */ }
    public override async Search(): Promise<SearchResultItem[]> {
        throw new Error('synchronous provider crash');
    }
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

describe('SearchEngine provider mid-flight failure handling', () => {
    let engine: TestSearchEngine;
    const user = createUser('u-1');

    beforeEach(() => {
        engine = new TestSearchEngine();
        mockEntityByName.mockReturnValue({ Name: 'Test', FirstPrimaryKey: { Name: 'ID' } });
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
    });

    it('returns surviving providers\' results when one async provider throws', async () => {
        // 1 healthy + 1 crashing → engine should still return the healthy
        // provider's hits and report Success at the search-level.
        engine.InjectProviders([
            makeEntry('HealthyVec', new HealthyProvider('alive', 'vector')),
            makeEntry('CrashingFT', new CrashingAsyncProvider('fulltext')),
        ]);

        const params: SearchParams = { Query: 'test' };
        const result = await engine.Search(params, user);

        expect(result.Success).toBe(true);
        expect(result.Results.length).toBeGreaterThan(0);
        expect(result.Results.some(r => r.RecordID === 'alive')).toBe(true);
        expect(result.SourceCounts.Vector).toBe(1);
        expect(result.SourceCounts.FullText).toBe(0); // crashed → 0 hits, not undefined
    });

    it('returns surviving providers\' results when one synchronous provider throws', async () => {
        engine.InjectProviders([
            makeEntry('CrashingVec', new CrashingSyncProvider('vector')),
            makeEntry('HealthyFT', new HealthyProvider('alive', 'fulltext')),
        ]);

        const params: SearchParams = { Query: 'test' };
        const result = await engine.Search(params, user);

        expect(result.Success).toBe(true);
        expect(result.Results.some(r => r.RecordID === 'alive')).toBe(true);
        expect(result.SourceCounts.Vector).toBe(0);
        expect(result.SourceCounts.FullText).toBe(1);
    });

    it('returns success with zero results when ALL providers throw', async () => {
        // Edge case: every provider crashes. Search itself should still
        // return Success=true with an empty result set — failing closed
        // would mask the per-provider error, which is the whole point of
        // the per-provider try/catch.
        engine.InjectProviders([
            makeEntry('CrashA', new CrashingAsyncProvider('vector')),
            makeEntry('CrashB', new CrashingAsyncProvider('fulltext')),
            makeEntry('CrashC', new CrashingSyncProvider('entity')),
        ]);

        const params: SearchParams = { Query: 'test' };
        const result = await engine.Search(params, user);

        expect(result.Success).toBe(true);
        expect(result.Results).toHaveLength(0);
        expect(result.SourceCounts.Vector).toBe(0);
        expect(result.SourceCounts.FullText).toBe(0);
        expect(result.SourceCounts.Entity).toBe(0);
    });

    it('isolates failures across providers (one bad provider does not poison fusion)', async () => {
        // Two healthy providers + one crashing in the middle. The fusion
        // step receives results from the two healthy providers and the
        // crashed one shows up as `Source: ..., Results: []`. Multi-source
        // RRF should still kick in for the two healthy providers' hits.
        engine.InjectProviders([
            makeEntry('HealthyVec', new HealthyProvider('record1', 'vector')),
            makeEntry('CrashEnt', new CrashingAsyncProvider('entity')),
            makeEntry('HealthyFT', new HealthyProvider('record2', 'fulltext')),
        ]);

        const params: SearchParams = { Query: 'test' };
        const result = await engine.Search(params, user);

        expect(result.Success).toBe(true);
        expect(result.SourceCounts.Vector).toBe(1);
        expect(result.SourceCounts.Entity).toBe(0);
        expect(result.SourceCounts.FullText).toBe(1);
        // Both surviving records are present; the crashed provider didn't
        // remove them from the fused list.
        const ids = result.Results.map(r => r.RecordID);
        expect(ids).toContain('record1');
        expect(ids).toContain('record2');
    });

    it('streamSearch emits provider events for healthy providers when one throws', async () => {
        // The streaming surface should also degrade gracefully — fast
        // healthy providers still emit `provider` events, then a final
        // `fused` + `final` after the search promise settles.
        engine.InjectProviders([
            makeEntry('HealthyVec', new HealthyProvider('alive', 'vector')),
            makeEntry('CrashingFT', new CrashingAsyncProvider('fulltext')),
        ]);

        const params: SearchParams = { Query: 'test' };
        const phases: string[] = [];
        const providerEvents: Array<{ name: string; count: number }> = [];

        for await (const ev of engine.streamSearch(params, user)) {
            phases.push(ev.phase);
            if (ev.phase === 'provider') {
                providerEvents.push({ name: ev.providerName, count: ev.results.length });
            }
        }

        expect(phases).toContain('fused');
        expect(phases).toContain('final');
        expect(phases).not.toContain('error');
        // We get a provider event for both — the crashed one with 0 results,
        // the healthy one with 1.
        expect(providerEvents).toHaveLength(2);
        const healthy = providerEvents.find(p => p.count === 1);
        const failed = providerEvents.find(p => p.count === 0);
        expect(healthy).toBeDefined();
        expect(failed).toBeDefined();
    });
});
