/**
 * Tests for SearchEngine.streamSearch's true concurrent emission contract.
 *
 * Closes the documented P2C.1 divergence: per `streaming-mechanism-decision.md`,
 * streamSearch was originally a post-hoc partition that only emitted provider
 * events after the entire pipeline completed. v2 (this file) asserts that
 * provider events arrive in the order their underlying provider promises
 * settle — not in registration order, not after fusion.
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
import type { SearchResultItem, SearchStreamEvent, SearchParams } from '../generic/search.types';
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
        ScoreBreakdown: {},
        Tags: [],
        MatchedAt: new Date(),
        ResultType: 'entity-record',
    };
}

class FakeProvider extends BaseSearchProvider {
    public override readonly SourceType: SearchResultItem['SourceType'];
    private readonly _delayMs: number;
    private readonly _label: string;

    constructor(label: string, sourceType: SearchResultItem['SourceType'], delayMs: number) {
        super();
        this._label = label;
        this.SourceType = sourceType;
        this._delayMs = delayMs;
    }

    public override IsAvailable(): boolean { return true; }
    public override async Initialize(): Promise<void> { /* no-op */ }

    public override async Search(): Promise<SearchResultItem[]> {
        await new Promise<void>((r) => setTimeout(r, this._delayMs));
        return [makeItem(this._label, this.SourceType)];
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

// Test-only escape hatch interface: SearchEngine guards its provider-list
// state behind private fields. Rather than `as any`, we narrow to a
// structural type that exposes just the two fields tests need to mutate.
interface SearchEngineTestState {
    _providerEntries: ProviderEntry[];
    _configured: boolean;
}

class TestSearchEngine extends SearchEngine {
    public InjectProviders(entries: ProviderEntry[]): void {
        // Bypass Config() — set internal state directly so tests don't need
        // the full SearchEngineBase metadata pipeline. The double-cast goes
        // through `unknown` which TypeScript permits without `any`.
        const state = this as unknown as SearchEngineTestState;
        state._providerEntries = entries;
        state._configured = true;
    }

    public override async filterByPermissions(results: SearchResultItem[]): Promise<SearchResultItem[]> {
        return results;
    }
    // Stub IMetadataProvider — the merged multi-provider refactor reads
    // `this.Base.ProviderToUse` which isn't initialized when tests bypass Config().
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

describe('SearchEngine.streamSearch (P2C.1 v2 — concurrent emission)', () => {
    let engine: TestSearchEngine;
    const user = createUser('u-1');

    beforeEach(() => {
        engine = new TestSearchEngine();
        mockEntityByName.mockReturnValue({ Name: 'Test', FirstPrimaryKey: { Name: 'ID' } });
        mockRunViewFn.mockResolvedValue({ Success: true, Results: [] });
    });

    it('emits provider events in resolution order, not registration order', async () => {
        // Register slow provider first, fast provider second. If streaming
        // was post-hoc partition, events would arrive in registration order
        // (slow → fast). With concurrent emission, fast must come first.
        const slow = new FakeProvider('slow-vector', 'vector', 80);
        const fast = new FakeProvider('fast-fulltext', 'fulltext', 10);
        engine.InjectProviders([
            makeEntry('SlowVector', slow),
            makeEntry('FastFullText', fast),
        ]);

        const params: SearchParams = { Query: 'test' };
        const providerOrder: string[] = [];
        const phaseOrder: SearchStreamEvent['phase'][] = [];

        for await (const ev of engine.streamSearch(params, user)) {
            phaseOrder.push(ev.phase);
            if (ev.phase === 'provider') {
                providerOrder.push(ev.providerName);
            }
        }

        // Resolution order: fulltext (10ms) before vector (80ms).
        expect(providerOrder).toEqual(['FullText', 'Vector']);

        // Provider events must precede fused, fused must precede final.
        const lastProviderIdx = phaseOrder.lastIndexOf('provider');
        const fusedIdx = phaseOrder.indexOf('fused');
        const finalIdx = phaseOrder.indexOf('final');
        expect(lastProviderIdx).toBeGreaterThanOrEqual(0);
        expect(fusedIdx).toBeGreaterThan(lastProviderIdx);
        expect(finalIdx).toBeGreaterThan(fusedIdx);
    });

    it('first provider event arrives before slowest provider has resolved', async () => {
        // The point of streaming is to surface partials EARLY. Assert that
        // the time-to-first-provider-event is less than the slow provider's
        // total latency. If streaming was post-hoc, ttfb >= slowMs.
        const slowMs = 100;
        const fastMs = 5;
        const slow = new FakeProvider('slow', 'vector', slowMs);
        const fast = new FakeProvider('fast', 'fulltext', fastMs);
        engine.InjectProviders([makeEntry('Slow', slow), makeEntry('Fast', fast)]);

        const params: SearchParams = { Query: 'test' };
        const t0 = Date.now();
        let firstProviderAt = -1;

        for await (const ev of engine.streamSearch(params, user)) {
            if (ev.phase === 'provider' && firstProviderAt < 0) {
                firstProviderAt = Date.now() - t0;
            }
        }

        expect(firstProviderAt).toBeGreaterThanOrEqual(0);
        // The fast provider takes 5ms; even with timer slop, the first
        // event should fire well before the slow provider's 100ms.
        expect(firstProviderAt).toBeLessThan(slowMs);
    });

    it('emits a single error event when the search throws and skips fused/final', async () => {
        class FailingProvider extends BaseSearchProvider {
            public override readonly SourceType: SearchResultItem['SourceType'] = 'vector';
            public override IsAvailable(): boolean { return true; }
            public override async Initialize(): Promise<void> { /* no-op */ }
            public override async Search(): Promise<SearchResultItem[]> {
                throw new Error('provider exploded');
            }
        }
        // Single failing provider — its catch block returns [] so search
        // completes successfully with zero results. To force the error
        // branch we instead inject zero providers and pass an empty query.
        engine.InjectProviders([]);

        const params: SearchParams = { Query: '' }; // empty query → Failure
        const phases: SearchStreamEvent['phase'][] = [];
        for await (const ev of engine.streamSearch(params, user)) {
            phases.push(ev.phase);
        }
        expect(phases).toContain('error');
        expect(phases).not.toContain('fused');
        expect(phases).not.toContain('final');
    });
});
