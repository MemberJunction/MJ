/**
 * Unit tests for the omnibar provider registry + the concrete providers' pure logic.
 *
 * The OmnibarProvider base registers via the MJ ClassFactory; these tests register
 * fakes under the same base and verify discovery ordering/exclusion, then exercise
 * each shipping provider's suggestion mapping with a mocked OmnibarContext — no
 * Angular TestBed, no network.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { of } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { MentionSuggestion, ComposerSuggestionRequest } from '@memberjunction/ng-composer';
import {
    DiscoverOmnibarProviders, GetOmnibarNavPayload, OmnibarProvider, OMNIBAR_NAV_KEY,
} from './omnibar-provider';
import { OmnibarSearchProvider } from './providers/omnibar-search.provider';
import { OmnibarCommandProvider } from './providers/omnibar-command.provider';
import { OmnibarAgentProvider } from './providers/omnibar-agent.provider';
import { LoadOmnibarProviders } from './index';
import { ResolveOmnibarEnabled } from './omnibar-user-setting';
import type { ApplicationManager, BaseApplication } from '@memberjunction/ng-base-application';
import type { SearchResponse, SearchResultItem, SearchService } from '@memberjunction/ng-search';
import type { CommandPaletteService } from '../command-palette/command-palette.service';

const REQ: ComposerSuggestionRequest = { Query: '', MaxResults: 9, ContextUser: null, Provider: null };

/**
 * Typed context doubles. Each fake's provided members are compile-checked against the real
 * service (`Pick`-typed param / `satisfies`), with exactly ONE `as unknown as` seam per double —
 * the services are classes with private state we deliberately don't fake.
 */
const asSearch = (double: Pick<SearchService, 'PreviewSearch'>): SearchService => double as unknown as SearchService;

/** Minimal SearchResponse — the provider only reads Results; the remaining required fields are zeroed. */
const searchResponse = (results: Array<Partial<SearchResultItem>>): SearchResponse => ({
    Success: true,
    Results: results as SearchResultItem[],
    Groups: [],
    Filters: [],
    TotalCount: results.length,
    ElapsedMs: 0,
    SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
    Providers: [],
});

/**
 * ⚠️ PROCESS-GLOBAL REGISTRATION — these two @RegisterClass decorators write into the
 * MJGlobal ClassFactory singleton and are NEVER unregistered: ClassFactory exposes no
 * public unregister/remove API (only Register + read-only registration getters), and
 * poking its private registration array from a test would be a hack we deliberately avoid.
 *
 * Why this is safe today:
 *  - The keys ('test-zebra' / 'test-alpha') are unique, obviously test-only strings that
 *    no production code path ever asks the factory for.
 *  - Vitest runs each test FILE in its own isolated process/worker by default, so the
 *    registrations die with this file's process and cannot leak into other specs.
 *
 * If that isolation ever changes (e.g. vitest `isolate: false` / single-process mode, or
 * these fakes get hoisted into a shared setup file), other tests calling
 * DiscoverOmnibarProviders() WILL see these fakes. At that point either (a) add a proper
 * Unregister API to ClassFactory and tear these down in afterAll, or (b) scope assertions
 * in other specs to exclude 'test-*' keys.
 */
@RegisterClass(OmnibarProvider, 'test-zebra')
class ZebraProvider extends OmnibarProvider {
    public readonly TriggerChar = '$';
    public readonly Key = 'test-zebra';
    public override readonly Priority = 1;
    public readonly ModeLabel = 'Zebra';
    public async GetSuggestions(): Promise<MentionSuggestion[]> {
        return [{ type: 'zebra', id: 'z1', name: 'Z', displayName: 'Z' }];
    }
}

// ⚠️ Process-global registration too — see the ZebraProvider comment above.
@RegisterClass(OmnibarProvider, 'test-alpha')
class AlphaProvider extends OmnibarProvider {
    public readonly TriggerChar = '!';
    public readonly Key = 'test-alpha';
    public override readonly Priority = 99;
    public readonly ModeLabel = 'Alpha';
    public async GetSuggestions(): Promise<MentionSuggestion[]> {
        return [];
    }
}

describe('DiscoverOmnibarProviders', () => {
    beforeAll(() => {
        LoadOmnibarProviders();
        // Touch the fakes so their decorators execute even under aggressive isolation.
        void ZebraProvider;
        void AlphaProvider;
    });

    it('discovers registered providers including the shipping four', () => {
        const keys = DiscoverOmnibarProviders().map((p) => p.Key);
        expect(keys).toContain('omnibar-search');
        expect(keys).toContain('omnibar-records');
        expect(keys).toContain('omnibar-commands');
        expect(keys).toContain('omnibar-agents');
        expect(keys).toContain('test-zebra');
    });

    it('sorts by Priority desc then Key asc', () => {
        const providers = DiscoverOmnibarProviders();
        const priorities = providers.map((p) => p.Priority);
        expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    });

    it('filters ExcludedTriggerKeys case-insensitively', () => {
        const keys = DiscoverOmnibarProviders(['TEST-ZEBRA']).map((p) => p.Key);
        expect(keys).not.toContain('test-zebra');
        expect(keys).toContain('test-alpha');
    });

    it('returns stable singleton instances across calls', () => {
        const a = DiscoverOmnibarProviders().find((p) => p.Key === 'test-zebra');
        const b = DiscoverOmnibarProviders().find((p) => p.Key === 'test-zebra');
        expect(a).toBe(b);
    });
});

describe('GetOmnibarNavPayload', () => {
    it('reads the payload and tolerates its absence', () => {
        const withNav: MentionSuggestion = {
            type: 'record', id: '1', name: 'A', displayName: 'A',
            data: { [OMNIBAR_NAV_KEY]: { kind: 'record', entityName: 'Users', recordId: 'X' } },
        };
        const without: MentionSuggestion = { type: 'entity', id: '2', name: 'B', displayName: 'B' };
        expect(GetOmnibarNavPayload(withNav)?.kind).toBe('record');
        expect(GetOmnibarNavPayload(without)).toBeNull();
    });
});

describe('OmnibarSearchProvider', () => {
    it('maps preview results to grouped suggestions and always appends see-all', async () => {
        const provider = new OmnibarSearchProvider();
        provider.Attach({
            Search: asSearch({
                PreviewSearch: async () => searchResponse([
                    { Title: 'Amanda Reyes', Snippet: 'At risk', EntityName: 'Members', RecordID: 'r1', ResultType: 'entity-record', Score: 0.94 },
                    { Title: 'Playbook.pdf', Snippet: '', EntityName: '', RecordID: 'f1', ResultType: 'storage-file', Score: 0.7, RawMetadata: '{"x":1}' },
                ]),
            }),
        });
        const out = await provider.GetSuggestions({ ...REQ, Query: 'renewal' });
        expect(out).toHaveLength(3);
        expect(GetOmnibarNavPayload(out[0])).toEqual({ kind: 'record', entityName: 'Members', recordId: 'r1' });
        expect(GetOmnibarNavPayload(out[1])?.kind).toBe('file');
        const seeAll = GetOmnibarNavPayload(out[2]);
        expect(seeAll).toEqual({ kind: 'search', query: 'renewal' });
    });

    it('degrades to just see-all when the search service throws', async () => {
        const provider = new OmnibarSearchProvider();
        provider.Attach({ Search: asSearch({ PreviewSearch: async () => { throw new Error('down'); } }) });
        const out = await provider.GetSuggestions({ ...REQ, Query: 'x' });
        expect(out).toHaveLength(1);
        expect(GetOmnibarNavPayload(out[0])?.kind).toBe('search');
    });

    it('returns [] with no Search service attached (graceful degradation)', async () => {
        const provider = new OmnibarSearchProvider();
        provider.Attach({});
        expect(await provider.GetSuggestions({ ...REQ, Query: 'x' })).toEqual([]);
    });
});

describe('OmnibarCommandProvider', () => {
    const apps = [
        { ID: 'a1', Name: 'Skills Studio', Description: 'Author skills', Icon: 'fa-solid fa-wand-magic-sparkles', Color: '', GetNavItems: async () => [] },
        { ID: 'a2', Name: 'Chat', Description: 'Conversations', Icon: '', Color: '', GetNavItems: async () => [{ Label: 'Conversations', Icon: '' }] },
    ] satisfies Array<Pick<BaseApplication, 'ID' | 'Name' | 'Description' | 'Icon' | 'Color' | 'GetNavItems'>> as unknown as BaseApplication[];
    const context = {
        // installed-apps stream (the provider deliberately ignores AllApplications)
        Apps: { Applications: of(apps) } satisfies Pick<ApplicationManager, 'Applications'> as unknown as ApplicationManager,
        PaletteService: { GetRecentApps: async () => ['a2'] } satisfies Pick<CommandPaletteService, 'GetRecentApps'> as unknown as CommandPaletteService,
    };

    it('fuzzy-ranks apps (starts-with beats contains) and payloads carry kind app', async () => {
        const provider = new OmnibarCommandProvider();
        provider.Attach(context);
        const out = await provider.GetSuggestions({ ...REQ, Query: 'sk' });
        expect(out.length).toBeGreaterThan(0);
        expect(out[0].displayName).toBe('Skills Studio');
        expect(GetOmnibarNavPayload(out[0])).toEqual({ kind: 'app', appId: 'a1', appName: 'Skills Studio' });
    });

    it('empty state orders by recency (recent app a2 first)', async () => {
        const provider = new OmnibarCommandProvider();
        provider.Attach(context);
        const out = await provider.EmptyStateSuggestions(REQ);
        expect(out[0].displayName).toBe('Chat');
    });
});

describe('OmnibarAgentProvider', () => {
    it('returns [] gracefully when no agent-mentions composer plugin is registered', async () => {
        const provider = new OmnibarAgentProvider();
        provider.Attach({});
        // In this test bundle ng-conversations' plugins are not loaded, so the
        // composer-registry delegate resolves to null — the graceful path.
        expect(await provider.GetSuggestions({ ...REQ, Query: 'sa' })).toEqual([]);
    });
});

describe('ResolveOmnibarEnabled (two-layer gate: instance availability × per-user opt-in)', () => {
    it('is OFF when the instance master switch is off, regardless of the user setting', () => {
        expect(ResolveOmnibarEnabled(false, 'true')).toBe(false);
        expect(ResolveOmnibarEnabled(false, 'false')).toBe(false);
        expect(ResolveOmnibarEnabled(false, undefined)).toBe(false);
    });

    it('is OFF by default (opt-in): available instance + no user setting = legacy trio', () => {
        expect(ResolveOmnibarEnabled(true, undefined)).toBe(false);
    });

    it('is ON only when the user explicitly opted in with the string "true"', () => {
        expect(ResolveOmnibarEnabled(true, 'true')).toBe(true);
        expect(ResolveOmnibarEnabled(true, 'false')).toBe(false);
        expect(ResolveOmnibarEnabled(true, '')).toBe(false);
        expect(ResolveOmnibarEnabled(true, 'TRUE')).toBe(false); // exact-match contract
        expect(ResolveOmnibarEnabled(true, '1')).toBe(false);
    });
});
