/**
 * Unit tests for the omnibar provider registry + the concrete providers' pure logic.
 *
 * The OmnibarProvider base registers via the MJ ClassFactory; these tests register
 * fakes under the same base and verify discovery ordering/exclusion, then exercise
 * each shipping provider's suggestion mapping with a mocked OmnibarContext (and a
 * stubbed DashboardEngine for the search provider's Dashboards group) — no Angular
 * TestBed, no network.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { of } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { DashboardEngine } from '@memberjunction/core-entities';
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

describe('OmnibarSearchProvider — Dashboards group', () => {
    type EngineDashboard = ReturnType<DashboardEngine['GetAccessibleDashboards']>[number];
    type DashboardEngineDouble = Pick<DashboardEngine, 'Loaded' | 'GetAccessibleDashboards'>;

    const USER_ID = 'user-ana';
    const ANA = { ID: USER_ID } satisfies Pick<UserInfo, 'ID'> as unknown as UserInfo;
    const RECORD: Partial<SearchResultItem> = { Title: 'Pipeline review', Snippet: '', EntityName: 'Members', RecordID: 'r1', ResultType: 'entity-record', Score: 0.8 };

    type DashboardFields = Pick<EngineDashboard, 'ID' | 'Name' | 'Description' | 'Category' | 'User' | 'Type' | 'DriverClass'>;
    const dashboard = (ID: string, Name: string, Type: EngineDashboard['Type'] = 'Config', DriverClass: string | null = null): EngineDashboard => {
        const fields: DashboardFields = { ID, Name, Description: null, Category: 'Sales', User: 'Ana', Type, DriverClass };
        return fields as unknown as EngineDashboard;
    };

    /** A Config dashboard with its own description or category. */
    const describedDashboard = (ID: string, Name: string, details: Partial<Pick<DashboardFields, 'Description' | 'Category'>>): EngineDashboard =>
        Object.assign(dashboard(ID, Name), details);

    /** The live checkpoint's "weekly" record: its name matches the query. */
    const WEEKLY_DIGEST: Partial<SearchResultItem> = { ...RECORD, Title: 'Weekly Entity Digest', RecordID: 'r-digest' };
    const REVENUE_BOARD_ID = 'rb';
    const revenueBoard = () => describedDashboard(REVENUE_BOARD_ID, 'Revenue Board', { Description: 'Weekly sales numbers by team' });

    /** Engine double holding `dashboards`; the global DashboardEngine.Instance returns it. */
    const stubEngine = (loaded: boolean, dashboards: EngineDashboard[]): DashboardEngineDouble => {
        const engine: DashboardEngineDouble = { Loaded: loaded, GetAccessibleDashboards: vi.fn(() => dashboards) };
        vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
        return engine;
    };

    /** Metadata provider double whose only member is the signed-in user. */
    const providerFor = (userId: string): IMetadataProvider =>
        ({ CurrentUser: { ID: userId } }) satisfies { CurrentUser: Pick<UserInfo, 'ID'> } as unknown as IMetadataProvider;

    /** Search double that returns `results` for every preview, so each test can read the requested count. */
    const previewReturning = (results: Array<Partial<SearchResultItem>>) =>
        vi.fn(async (query: string, maxResults?: number) => {
            void query;
            void maxResults;
            return searchResponse(results);
        });

    const kinds = (out: MentionSuggestion[]) => out.map((s) => GetOmnibarNavPayload(s)?.kind);
    const dashboardIds = (out: MentionSuggestion[]) =>
        out.map((s) => GetOmnibarNavPayload(s)).flatMap((nav) => (nav?.kind === 'dashboard' ? [nav.dashboardId] : []));

    const searchProvider = (search: SearchService): OmnibarSearchProvider => {
        const provider = new OmnibarSearchProvider();
        provider.Attach({ Search: search });
        return provider;
    };

    it('lists dashboards whose name matches first, in a Dashboards group, before the search results and see-all', async () => {
        const engine = stubEngine(true, [dashboard('d1', 'Sales pipeline'), dashboard('d2', 'Ops health'), dashboard('d3', 'Pipeline forecast')]);
        const provider = searchProvider(asSearch({ PreviewSearch: previewReturning([RECORD]) }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'pipe', ContextUser: ANA });

        expect(engine.GetAccessibleDashboards).toHaveBeenCalledWith(USER_ID);
        expect(out.map((s) => s.data?.['group'])).toEqual(['Dashboards', 'Dashboards', 'Records', '']);
        // A name that starts with the query ranks before a name that only contains it.
        expect(GetOmnibarNavPayload(out[0])).toEqual({ kind: 'dashboard', dashboardId: 'd3', dashboardName: 'Pipeline forecast' });
        expect(GetOmnibarNavPayload(out[1])).toEqual({ kind: 'dashboard', dashboardId: 'd1', dashboardName: 'Sales pipeline' });
        expect(out[0]).toMatchObject({
            type: 'dashboard', id: 'dashboard:d3', name: 'Pipeline forecast', displayName: 'Pipeline forecast',
            description: 'Sales · Ana', icon: 'fa-solid fa-gauge-high',
        });
        expect(kinds(out).slice(2)).toEqual(['record', 'search']);
    });

    it('lists a dashboard that matches only by description after the search results, so a record whose name matches stays first', async () => {
        stubEngine(true, [revenueBoard(), dashboard('d2', 'Ops health')]);
        const provider = searchProvider(asSearch({ PreviewSearch: previewReturning([WEEKLY_DIGEST]) }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'weekly', ContextUser: ANA });

        expect(out.map((s) => s.name)).toEqual(['Weekly Entity Digest', 'Revenue Board', 'See all results for “weekly”']);
        expect(out.map((s) => s.data?.['group'])).toEqual(['Records', 'Dashboards', '']);
    });

    it('lists name matches before the search results and description or category matches after them, both as Dashboards', async () => {
        stubEngine(true, [revenueBoard(), dashboard('wk', 'Weekly KPIs'), describedDashboard('ops', 'Ops board', { Category: 'Weekly reviews' })]);
        const provider = searchProvider(asSearch({ PreviewSearch: previewReturning([WEEKLY_DIGEST]) }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'weekly', ContextUser: ANA });

        expect(kinds(out)).toEqual(['dashboard', 'record', 'dashboard', 'dashboard', 'search']);
        expect(dashboardIds(out)).toEqual(['wk', REVENUE_BOARD_ID, 'ops']);
        expect(out.map((s) => s.data?.['group'])).toEqual(['Dashboards', 'Records', 'Dashboards', 'Dashboards', '']);
    });

    it('shares the three-dashboard cap, name matches first, and asks search for the rows left', async () => {
        stubEngine(true, [
            revenueBoard(),
            describedDashboard('churn', 'Churn', { Description: 'Weekly churn' }),
            dashboard('wk', 'Weekly KPIs'),
            dashboard('ops', 'Ops weekly'),
        ]);
        const preview = previewReturning(Array.from({ length: 5 }, (_, i) => ({ ...RECORD, RecordID: `r${i}` })));
        const provider = searchProvider(asSearch({ PreviewSearch: preview }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'weekly', ContextUser: ANA });

        // 9 rows = 2 name matches + 5 search results + 1 description match + see-all
        expect(preview).toHaveBeenCalledWith('weekly', REQ.MaxResults - 1 - 3);
        expect(kinds(out)).toEqual(['dashboard', 'dashboard', 'record', 'record', 'record', 'record', 'record', 'dashboard', 'search']);
        expect(dashboardIds(out)).toEqual(['wk', 'ops', REVENUE_BOARD_ID]);
        expect(out).toHaveLength(REQ.MaxResults);
    });

    it('keeps a dashboard whose exact name was typed among the three rows, before longer names that contain it', async () => {
        stubEngine(true, [dashboard('d1', 'Sales pipeline'), dashboard('d2', 'Sales by region'), dashboard('d3', 'Sales forecast'), dashboard('d4', 'Sales')]);
        const provider = searchProvider(asSearch({ PreviewSearch: previewReturning([]) }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'Sales', ContextUser: ANA });

        expect(dashboardIds(out)).toEqual(['d4', 'd1', 'd2']);
    });

    it('shows at most three dashboards and asks search for the rest of MaxResults', async () => {
        stubEngine(true, ['a', 'b', 'c', 'd', 'e'].map((id) => dashboard(id, `Pipeline ${id}`)));
        const preview = previewReturning(Array.from({ length: 5 }, (_, i) => ({ ...RECORD, RecordID: `r${i}` })));
        const provider = searchProvider(asSearch({ PreviewSearch: preview }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'pipe', ContextUser: ANA });

        // 9 rows = 3 dashboards + 5 search results + see-all
        expect(preview).toHaveBeenCalledWith('pipe', REQ.MaxResults - 1 - 3);
        expect(dashboardIds(out)).toEqual(['a', 'b', 'c']);
        expect(out).toHaveLength(REQ.MaxResults);
    });

    it('asks search for MaxResults - 1 when no dashboard matches', async () => {
        stubEngine(true, [dashboard('d2', 'Ops health')]);
        const preview = previewReturning([RECORD]);
        const provider = searchProvider(asSearch({ PreviewSearch: preview }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'pipe', ContextUser: ANA });

        expect(preview).toHaveBeenCalledWith('pipe', REQ.MaxResults - 1);
        expect(kinds(out)).toEqual(['record', 'search']);
    });

    it('lists only dashboards the dashboard tab can render: Config, and Code with a driver class', async () => {
        stubEngine(true, [
            dashboard('dyn', 'Pipeline sandbox', 'Dynamic Code'),
            dashboard('code', 'Pipeline admin', 'Code', 'PipelineAdmin'),
            dashboard('no-driver', 'Pipeline draft', 'Code'),
            dashboard('cfg', 'Pipeline board'),
        ]);
        const provider = searchProvider(asSearch({ PreviewSearch: previewReturning([]) }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'pipe', ContextUser: ANA });

        expect(dashboardIds(out)).toEqual(['code', 'cfg']);
    });

    it('adds no dashboards while the engine is not loaded', async () => {
        const engine = stubEngine(false, [dashboard('d1', 'Sales pipeline')]);
        const preview = previewReturning([RECORD]);
        const provider = searchProvider(asSearch({ PreviewSearch: preview }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'pipe', ContextUser: ANA });

        expect(engine.GetAccessibleDashboards).not.toHaveBeenCalled();
        expect(preview).toHaveBeenCalledWith('pipe', REQ.MaxResults - 1);
        expect(kinds(out)).toEqual(['record', 'search']);
    });

    it('uses the search provider user when ContextUser is null', async () => {
        const engine = stubEngine(true, [dashboard('d1', 'Sales pipeline')]);
        const searchWithUser: Pick<SearchService, 'PreviewSearch' | 'Provider'> = { PreviewSearch: previewReturning([]), Provider: providerFor(USER_ID) };
        const provider = searchProvider(searchWithUser as unknown as SearchService);

        const out = await provider.GetSuggestions({ ...REQ, Query: 'pipe' });

        expect(engine.GetAccessibleDashboards).toHaveBeenCalledWith(USER_ID);
        expect(kinds(out)).toEqual(['dashboard', 'search']);
    });

    it('still returns search results when ContextUser is null and no user is known', async () => {
        const engine = stubEngine(true, [dashboard('d1', 'Sales pipeline')]);
        const preview = previewReturning([RECORD]);
        const provider = searchProvider(asSearch({ PreviewSearch: preview }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'pipe' });

        expect(engine.GetAccessibleDashboards).not.toHaveBeenCalled();
        expect(preview).toHaveBeenCalledWith('pipe', REQ.MaxResults - 1);
        expect(kinds(out)).toEqual(['record', 'search']);
    });

    it('keeps the dashboards and see-all when the search service throws', async () => {
        stubEngine(true, [dashboard('d1', 'Sales pipeline')]);
        const provider = searchProvider(asSearch({ PreviewSearch: async () => { throw new Error('down'); } }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'pipe', ContextUser: ANA });

        expect(kinds(out)).toEqual(['dashboard', 'search']);
    });

    it('keeps name matches before description matches when the search service throws', async () => {
        stubEngine(true, [revenueBoard(), dashboard('wk', 'Weekly KPIs')]);
        const provider = searchProvider(asSearch({ PreviewSearch: async () => { throw new Error('down'); } }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'weekly', ContextUser: ANA });

        expect(dashboardIds(out)).toEqual(['wk', REVENUE_BOARD_ID]);
        expect(kinds(out)).toEqual(['dashboard', 'dashboard', 'search']);
    });

    it('reads the DashboardEngine of the provider on the request', async () => {
        const globalEngine = stubEngine(true, [dashboard('g1', 'Global pipeline')]);
        const scopedEngine: DashboardEngineDouble = { Loaded: true, GetAccessibleDashboards: vi.fn(() => [dashboard('s1', 'Scoped pipeline')]) };
        const getProviderInstance = vi.spyOn(DashboardEngine, 'GetProviderInstance').mockReturnValue(scopedEngine as unknown as DashboardEngine);
        const scopedProvider = providerFor('user-bo');
        const provider = searchProvider(asSearch({ PreviewSearch: previewReturning([]) }));

        const out = await provider.GetSuggestions({ ...REQ, Query: 'pipe', Provider: scopedProvider });

        expect(getProviderInstance).toHaveBeenCalledWith(scopedProvider, DashboardEngine);
        expect(scopedEngine.GetAccessibleDashboards).toHaveBeenCalledWith('user-bo');
        expect(globalEngine.GetAccessibleDashboards).not.toHaveBeenCalled();
        expect(dashboardIds(out)).toEqual(['s1']);
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
