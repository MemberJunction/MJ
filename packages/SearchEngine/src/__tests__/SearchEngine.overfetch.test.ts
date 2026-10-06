/**
 * Tests for `SearchEngine.ResolvePermissionOverfetchFactor`: the caller's `PermissionOverfetchFactor`
 * wins; else the largest of each resolved scope's declared `permissionOverfetchFactor` (a scope that
 * declares none counts as the engine default); else the engine default. Clamped to 1–20, and the
 * clamp is logged. Plus the wiring: the factor multiplies what providers are asked for, never what
 * the caller gets, and `streamSearch`'s partial events are capped to the caller's own `MaxResults`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
    class MockMetadata {
        EntityByName(_name: string) { return null; }
        Entities = [];
        static Provider = { EntityByName: (_name: string) => null, Entities: [] };
    }
    return { ...actual, Metadata: MockMetadata, LogError: vi.fn(), LogStatus: vi.fn() };
});

import { LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { SearchEngine } from '../generic/SearchEngine';
import { BaseSearchProvider } from '../generic/ISearchProvider';
import type { SearchParams, SearchResultItem } from '../generic/search.types';
import type { ScopeBundle } from '@memberjunction/core-entities';

/** The provider-list state `Search()` reads, reached without `Config()` (the metadata pipeline). */
interface SearchEngineTestState {
    _providerEntries: ProviderEntry[];
    _configured: boolean;
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

class TestSearchEngine extends SearchEngine {
    public TestResolve(params: SearchParams, scopes: ScopeBundle[]): number {
        return this.ResolvePermissionOverfetchFactor(params, scopes);
    }
    public InjectProviders(entries: ProviderEntry[]): void {
        const state = this as unknown as SearchEngineTestState;
        state._providerEntries = entries;
        state._configured = true;
    }
    public override async filterByPermissions(results: SearchResultItem[]): Promise<SearchResultItem[]> {
        return results;
    }
    protected override get ProviderToUse(): IMetadataProvider {
        return { EntityByName: (_name: string) => null, Entities: [] } as unknown as IMetadataProvider;
    }
}

/** A provider that remembers the `topK` it was asked for and returns that many distinct hits. */
class CountingProvider extends BaseSearchProvider {
    public override readonly SourceType: SearchResultItem['SourceType'] = 'fulltext';
    public askedFor: number[] = [];
    public override IsAvailable(): boolean { return true; }
    public override async Initialize(): Promise<void> { /* no-op */ }
    public override async Search(_query: string, topK: number): Promise<SearchResultItem[]> {
        this.askedFor.push(topK);
        return Array.from({ length: topK }, (_, i) => ({
            ID: `r-${i}`, EntityName: 'Test', RecordID: `${i}`, SourceType: this.SourceType, Title: `record ${i}`,
            Snippet: `snippet ${i}`, Score: 1 - i / 100, ScoreBreakdown: {}, Tags: [], MatchedAt: new Date(), ResultType: 'entity-record',
        }));
    }
}
function entry(provider: BaseSearchProvider): ProviderEntry {
    return { Provider: provider, ID: 'p-1', DisplayName: 'Counting', Icon: '', Priority: 1, SupportsPreview: false, MaxResultsOverride: null, Record: {} };
}
const user = { ID: 'U-1', Name: 'Test User', Email: 't@example.com' } as UserInfo;

/** A bundle whose scope carries only what the resolver reads: its `ScopeConfig` JSON. */
function scopeWithConfig(config: Record<string, unknown> | string | null): ScopeBundle {
    const scopeConfig = typeof config === 'string' || config === null ? config : JSON.stringify(config);
    return { Scope: { ScopeConfig: scopeConfig } } as unknown as ScopeBundle;
}

const query: SearchParams = { Query: 'budget' };

describe('SearchEngine.ResolvePermissionOverfetchFactor', () => {
    let engine: TestSearchEngine;

    beforeEach(() => {
        engine = TestSearchEngine.getInstance<TestSearchEngine>();
    });

    it('uses the engine default (2) with no caller value and no scopes', () => {
        expect(engine.TestResolve(query, [])).toBe(2);
    });

    it('uses the engine default when the resolved scopes declare nothing', () => {
        expect(engine.TestResolve(query, [scopeWithConfig({ rrfK: 60 }), scopeWithConfig(null)])).toBe(2);
    });

    it('reads a scope\'s declared factor', () => {
        expect(engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 4 })])).toBe(4);
    });

    it('takes the largest factor across the resolved scopes', () => {
        const scopes = [
            scopeWithConfig({ permissionOverfetchFactor: 3 }),
            scopeWithConfig({}),
            scopeWithConfig({ permissionOverfetchFactor: 5 }),
        ];
        expect(engine.TestResolve(query, scopes)).toBe(5);
    });

    it('lets the caller\'s value win over every scope', () => {
        const scopes = [scopeWithConfig({ permissionOverfetchFactor: 5 })];
        expect(engine.TestResolve({ ...query, PermissionOverfetchFactor: 3 }, scopes)).toBe(3);
    });

    it('never goes below 1, for a caller value or a scope value — a value below 1 means "no over-fetch", not "ignored"', () => {
        expect(engine.TestResolve({ ...query, PermissionOverfetchFactor: 0.25 }, [])).toBe(1);
        expect(engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 0.5 })])).toBe(1);
    });

    it('never exceeds the ceiling (20), for a caller value or a scope value', () => {
        expect(engine.TestResolve({ ...query, PermissionOverfetchFactor: 1000 }, [])).toBe(20);
        expect(engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 1000 })])).toBe(20);
        expect(engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 20 })])).toBe(20);
    });

    it('ignores a scope value that is not a finite number', () => {
        const scopes = [
            scopeWithConfig({ permissionOverfetchFactor: '4' }),
            // JSON has no NaN/Infinity (`JSON.stringify` turns both into null); a raw `1e999` parses to Infinity.
            scopeWithConfig('{"permissionOverfetchFactor":1e999}'),
            scopeWithConfig({ permissionOverfetchFactor: null }),
            scopeWithConfig('{not json'),
        ];
        expect(engine.TestResolve(query, scopes)).toBe(2);
    });

    it('falls through to the scopes when the caller\'s value is not a finite number', () => {
        const scopes = [scopeWithConfig({ permissionOverfetchFactor: 3 })];
        expect(engine.TestResolve({ ...query, PermissionOverfetchFactor: Number.NaN }, scopes)).toBe(3);
    });

    it('counts a scope that declares nothing as the default, so a low factor beside it never pulls the search below the default', () => {
        expect(engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 1 }), scopeWithConfig(null)])).toBe(2);
        expect(engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 3 }), scopeWithConfig({})])).toBe(3);
    });

    it('logs a clamp, and stays quiet for a value within range', () => {
        vi.mocked(LogStatus).mockClear();
        engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 50 })]);
        expect(vi.mocked(LogStatus)).toHaveBeenCalledWith(expect.stringContaining('clamped to 20'));
        vi.mocked(LogStatus).mockClear();
        engine.TestResolve(query, [scopeWithConfig({ permissionOverfetchFactor: 4 })]);
        expect(vi.mocked(LogStatus)).not.toHaveBeenCalled();
    });
});

describe('the over-fetch factor in a search', () => {
    it('asks each provider for ceil(MaxResults × factor) and still returns at most MaxResults', async () => {
        const engine = TestSearchEngine.getInstance<TestSearchEngine>();
        const provider = new CountingProvider();
        engine.InjectProviders([entry(provider)]);
        const result = await engine.Search({ Query: 'budget plan', MaxResults: 2, PermissionOverfetchFactor: 3 }, user);
        expect(result.Success).toBe(true);
        expect(provider.askedFor).toEqual([6]);
        expect(result.Results).toHaveLength(2);
    });

    it('caps each streamed partial event to the caller\'s MaxResults while the provider is still asked for more', async () => {
        const engine = TestSearchEngine.getInstance<TestSearchEngine>();
        const provider = new CountingProvider();
        engine.InjectProviders([entry(provider)]);
        const partialSizes: number[] = [];
        let finalSize = -1;
        for await (const ev of engine.streamSearch({ Query: 'budget plan streamed', MaxResults: 2, PermissionOverfetchFactor: 3 }, user)) {
            if (ev.phase === 'provider') partialSizes.push(ev.results.length);
            if (ev.phase === 'final') finalSize = ev.results.length;
        }
        expect(provider.askedFor).toEqual([6]);
        expect(partialSizes).toEqual([2]);
        expect(finalSize).toBe(2);
    });
});
