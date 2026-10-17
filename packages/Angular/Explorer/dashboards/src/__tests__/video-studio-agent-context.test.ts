/**
 * Tests for the Video Studio pure agent-context and filter/resolver helpers across
 * all three resource surfaces:
 *   1. Productions (`VideoStudioProductionsResource`)
 *   2. Brand Kits (`VideoStudioBrandKitsResource`)
 *   3. Archetypes (`VideoStudioArchetypesResource`)
 */
import { describe, it, expect } from 'vitest';
import {
    VIDEO_STUDIO_NAME_LIST_CAP,
    CapVideoStudioNames,
    ResolveVideoStudioItem,
    FilterProductionCards,
    CountActiveProductionPopoverFilters,
    BuildProductionsAgentContext,
    FilterBrandKitCards,
    BuildBrandKitsAgentContext,
    FilterArchetypeCards,
    GroupArchetypesByCategory,
    BuildArchetypesAgentContext,
    ARCHETYPE_CATEGORIES,
    ProductionCardSnapshot,
    ProductionFilterState,
    ProductionsAgentContextInput,
    BrandKitCardSnapshot,
    BrandKitFilterState,
    BrandKitsAgentContextInput,
    ArchetypeCardSnapshot,
    ArchetypeFilterState,
    ArchetypesAgentContextInput,
    STUDIO_VIDEO_FORMATS,
    ParseArchetypeDefaultFormats,
    ClampStudioDuration,
    ComposeStudioFirstMessage,
    BuildStudioAppContext,
    BuildStudioAgentContext,
} from '../VideoStudio/video-studio-agent-context';

// ============================================================================
// Common helpers
// ============================================================================

describe('CapVideoStudioNames & ResolveVideoStudioItem', () => {
    it('caps name arrays at VIDEO_STUDIO_NAME_LIST_CAP without mutating input', () => {
        const names = Array.from({ length: 30 }, (_, i) => `Item ${i}`);
        const capped = CapVideoStudioNames(names);
        expect(capped.length).toBe(VIDEO_STUDIO_NAME_LIST_CAP);
        expect(names.length).toBe(30);
    });

    it('resolves items by exact ID, exact Name, or partial Name (case-insensitive)', () => {
        const items = [
            { ID: '111-AAA', Name: 'Quarterly Member Briefing' },
            { ID: '222-BBB', Name: 'Product Launch Teaser' },
        ];

        const byId = ResolveVideoStudioItem('111-aaa', items, 'production');
        expect(byId.Ok).toBe(true);
        if (byId.Ok) expect(byId.Item.Name).toBe('Quarterly Member Briefing');

        const byExactName = ResolveVideoStudioItem('product launch teaser', items, 'production');
        expect(byExactName.Ok).toBe(true);
        if (byExactName.Ok) expect(byExactName.Item.ID).toBe('222-BBB');

        const byPartial = ResolveVideoStudioItem('member', items, 'production');
        expect(byPartial.Ok).toBe(true);
        if (byPartial.Ok) expect(byPartial.Item.ID).toBe('111-AAA');
    });

    it('returns descriptive errors when reference is blank, list is empty, or nothing matches', () => {
        const items = [{ ID: '111-AAA', Name: 'Alpha Video' }];

        const emptyRef = ResolveVideoStudioItem('   ', items, 'production');
        expect(emptyRef.Ok).toBe(false);
        if (!emptyRef.Ok) expect(emptyRef.Error).toContain('ID or name is required');

        const emptyList = ResolveVideoStudioItem('Alpha', [], 'production');
        expect(emptyList.Ok).toBe(false);
        if (!emptyList.Ok) expect(emptyList.Error).toContain('No productions are currently loaded');

        const miss = ResolveVideoStudioItem('Beta', items, 'production');
        expect(miss.Ok).toBe(false);
        if (!miss.Ok) {
            expect(miss.Error).toContain('No production matches "Beta"');
            expect(miss.Error).toContain('Alpha Video');
        }
    });
});

// ============================================================================
// 1. Productions surface helpers
// ============================================================================

function makeProductionCard(overrides: Partial<ProductionCardSnapshot> = {}): ProductionCardSnapshot {
    return {
        ID: 'prod-1',
        Name: 'Q3 Revenue Recap',
        Description: 'Executive data story covering Q3 numbers',
        VersionID: 'ver-1',
        VersionNumber: 2,
        PosterFileID: 'file-1',
        PosterUrl: '/media/file-1?token=abc',
        Status: 'Delivered',
        Archetype: 'DataStory',
        BrandKitID: 'kit-1',
        BrandKitName: 'Association Primary Kit',
        CompanyID: 'comp-1',
        CompanyName: 'Acme Association',
        DurationSeconds: 60,
        AspectRatio: '16:9',
        SceneCount: 5,
        UpdatedAt: new Date(2026, 5, 15, 12, 0, 0),
        ...overrides,
    };
}

function makeProductionFilters(overrides: Partial<ProductionFilterState> = {}): ProductionFilterState {
    return {
        SearchQuery: '',
        Archetype: 'all',
        BrandKitID: 'all',
        CompanyID: 'all',
        Status: 'all',
        FromDate: '',
        ToDate: '',
        ...overrides,
    };
}

describe('FilterProductionCards & BuildProductionsAgentContext', () => {
    const cards: ProductionCardSnapshot[] = [
        makeProductionCard(),
        makeProductionCard({
            ID: 'prod-2',
            Name: 'Annual Conference Teaser',
            Description: 'Social promo clip',
            Status: 'Briefing',
            Archetype: 'Social',
            BrandKitID: 'kit-2',
            BrandKitName: 'Conference Sub-Brand',
            CompanyID: 'comp-2',
            CompanyName: 'Global Events Corp',
            UpdatedAt: new Date(2026, 7, 31, 22, 45, 0),
        }),
    ];

    it('filters by free-text query, archetype, brand kit, company, status, and local-time date range', () => {
        expect(FilterProductionCards(cards, makeProductionFilters()).length).toBe(2);
        expect(FilterProductionCards(cards, makeProductionFilters({ SearchQuery: 'conference' })).map((c) => c.ID)).toEqual(['prod-2']);
        expect(FilterProductionCards(cards, makeProductionFilters({ Archetype: 'DataStory' })).map((c) => c.ID)).toEqual(['prod-1']);
        expect(FilterProductionCards(cards, makeProductionFilters({ BrandKitID: 'kit-2' })).map((c) => c.ID)).toEqual(['prod-2']);
        expect(FilterProductionCards(cards, makeProductionFilters({ CompanyID: 'comp-1' })).map((c) => c.ID)).toEqual(['prod-1']);
        expect(FilterProductionCards(cards, makeProductionFilters({ Status: 'Briefing' })).map((c) => c.ID)).toEqual(['prod-2']);
        expect(
            FilterProductionCards(cards, makeProductionFilters({ FromDate: '2026-07-01', ToDate: '2026-08-31' })).map((c) => c.ID),
        ).toEqual(['prod-2']);
    });

    it('includes a card updated late in the local day of ToDate and excludes next local day', () => {
        const lateLocalCard = makeProductionCard({
            ID: 'prod-late-local',
            UpdatedAt: new Date(2026, 7, 31, 23, 30, 0),
        });
        const nextLocalMorningCard = makeProductionCard({
            ID: 'prod-next-day',
            UpdatedAt: new Date(2026, 8, 1, 0, 5, 0),
        });
        const matched = FilterProductionCards(
            [lateLocalCard, nextLocalMorningCard],
            makeProductionFilters({ FromDate: '2026-08-31', ToDate: '2026-08-31' }),
        );
        expect(matched.map((c) => c.ID)).toEqual(['prod-late-local']);
    });

    it('counts active popover filters accurately', () => {
        expect(CountActiveProductionPopoverFilters(makeProductionFilters())).toBe(0);
        expect(
            CountActiveProductionPopoverFilters(
                makeProductionFilters({ Archetype: 'Social', Status: 'Briefing', FromDate: '2026-07-01' }),
            ),
        ).toBe(3);
    });

    it('builds bounded Productions agent context with selection and filter metadata', () => {
        const input: ProductionsAgentContextInput = {
            TotalCount: 2,
            FilteredCards: [cards[0]],
            Filters: makeProductionFilters({ Status: 'Delivered' }),
            BrandKitFilterName: null,
            CompanyFilterName: null,
            SelectedProduction: cards[0],
            AvailableArchetypes: ['DataStory', 'Social'],
            AvailableBrandKitNames: ['Association Primary Kit'],
            AvailableCompanyNames: ['Acme Association'],
            IsLoading: false,
        };
        const ctx = BuildProductionsAgentContext(input);
        expect(ctx['Surface']).toBe('VideoStudioProductions');
        expect(ctx['TotalProductionCount']).toBe(2);
        expect(ctx['FilteredProductionCount']).toBe(1);
        expect(ctx['StatusFilter']).toBe('Delivered');
        expect(ctx['HasActiveFilters']).toBe(true);
        expect(ctx['SelectedProductionId']).toBe('prod-1');
        expect(ctx['SelectedProductionName']).toBe('Q3 Revenue Recap');
        expect(ctx['VisibleProductionNames']).toEqual(['Q3 Revenue Recap']);
    });
});

// ============================================================================
// 2. Brand Kits surface helpers
// ============================================================================

function makeBrandKitCard(overrides: Partial<BrandKitCardSnapshot> = {}): BrandKitCardSnapshot {
    return {
        ID: 'kit-1',
        Name: 'Org Primary Kit',
        Description: 'Default organization-wide brand kit',
        CompanyID: null,
        CompanyName: null,
        IsDefault: true,
        Status: 'Active',
        Swatches: [{ Name: 'Primary', Value: '#0055AA' }],
        PrimaryLogoFileID: 'file-logo-1',
        PrimaryLogoUrl: '/media/file-logo-1?token=xyz',
        AssetCount: 4,
        ...overrides,
    };
}

describe('FilterBrandKitCards & BuildBrandKitsAgentContext', () => {
    const kits: BrandKitCardSnapshot[] = [
        makeBrandKitCard(),
        makeBrandKitCard({
            ID: 'kit-2',
            Name: 'Acme Regional Kit',
            Description: 'Regional brand identity',
            CompanyID: 'comp-1',
            CompanyName: 'Acme Association',
            IsDefault: false,
            Status: 'Inactive',
        }),
    ];

    it('filters brand kits by search query, org-wide vs company ID, and status', () => {
        const allFilter: BrandKitFilterState = { SearchQuery: '', CompanyID: 'all', Status: 'all' };
        expect(FilterBrandKitCards(kits, allFilter).length).toBe(2);
        expect(FilterBrandKitCards(kits, { ...allFilter, CompanyID: 'org-wide' }).map((k) => k.ID)).toEqual(['kit-1']);
        expect(FilterBrandKitCards(kits, { ...allFilter, CompanyID: 'comp-1' }).map((k) => k.ID)).toEqual(['kit-2']);
        expect(FilterBrandKitCards(kits, { ...allFilter, Status: 'Active' }).map((k) => k.ID)).toEqual(['kit-1']);
        expect(FilterBrandKitCards(kits, { ...allFilter, SearchQuery: 'regional' }).map((k) => k.ID)).toEqual(['kit-2']);
    });

    it('builds Brand Kits agent context with active/inactive/default counts', () => {
        const input: BrandKitsAgentContextInput = {
            AllCards: kits,
            FilteredCards: [kits[0]],
            Filters: { SearchQuery: '', CompanyID: 'all', Status: 'Active' },
            CompanyFilterName: null,
            AvailableCompanyNames: ['Acme Association'],
            IsLoading: false,
        };
        const ctx = BuildBrandKitsAgentContext(input);
        expect(ctx['Surface']).toBe('VideoStudioBrandKits');
        expect(ctx['TotalBrandKitCount']).toBe(2);
        expect(ctx['FilteredBrandKitCount']).toBe(1);
        expect(ctx['ActiveBrandKitCount']).toBe(1);
        expect(ctx['InactiveBrandKitCount']).toBe(1);
        expect(ctx['DefaultBrandKitCount']).toBe(1);
        expect(ctx['HasActiveFilters']).toBe(true);
    });
});

// ============================================================================
// 3. Archetypes surface helpers
// ============================================================================

function makeArchetypeCard(overrides: Partial<ArchetypeCardSnapshot> = {}): ArchetypeCardSnapshot {
    return {
        ID: 'arch-1',
        Name: 'Executive Member Briefing',
        Description: '90-second leadership update',
        Category: 'Briefing',
        Status: 'Active',
        CompanyID: null,
        CompanyName: null,
        IsShipped: true,
        DefaultDurationSeconds: 90,
        MinDurationSeconds: 60,
        MaxDurationSeconds: 120,
        DefaultFormats: '16:9, 1:1',
        BeatCount: 4,
        BeatLabels: ['Hook', 'Key Metric', 'Deep Dive', 'Call to Action'],
        ...overrides,
    };
}

describe('FilterArchetypeCards, GroupArchetypesByCategory & BuildArchetypesAgentContext', () => {
    const archetypes: ArchetypeCardSnapshot[] = [
        makeArchetypeCard(),
        makeArchetypeCard({
            ID: 'arch-2',
            Name: 'Acme Custom Product Walkthrough',
            Description: 'Company-specific product tour',
            Category: 'Product',
            CompanyID: 'comp-1',
            CompanyName: 'Acme Association',
            IsShipped: false,
            DefaultDurationSeconds: 120,
            BeatLabels: ['Intro', 'Demo'],
        }),
    ];

    it('filters archetypes by query (including beat labels), category, and scope', () => {
        const base: ArchetypeFilterState = { SearchQuery: '', Category: 'all', Scope: 'all' };
        expect(FilterArchetypeCards(archetypes, base).length).toBe(2);
        expect(FilterArchetypeCards(archetypes, { ...base, SearchQuery: 'key metric' }).map((a) => a.ID)).toEqual(['arch-1']);
        expect(FilterArchetypeCards(archetypes, { ...base, Category: 'Product' }).map((a) => a.ID)).toEqual(['arch-2']);
        expect(FilterArchetypeCards(archetypes, { ...base, Scope: 'shipped' }).map((a) => a.ID)).toEqual(['arch-1']);
        expect(FilterArchetypeCards(archetypes, { ...base, Scope: 'company' }).map((a) => a.ID)).toEqual(['arch-2']);
    });

    it('groups archetypes by canonical category order and omits empty categories', () => {
        const groups = GroupArchetypesByCategory(archetypes);
        expect(groups.map((g) => g.Category)).toEqual(['Briefing', 'Product']);
        expect(groups[0].Archetypes[0].ID).toBe('arch-1');
        expect(groups[1].Archetypes[0].ID).toBe('arch-2');
    });

    it('builds Archetypes agent context with shipped/company counts and categories', () => {
        const input: ArchetypesAgentContextInput = {
            AllCards: archetypes,
            FilteredCards: archetypes,
            Filters: { SearchQuery: '', Category: 'all', Scope: 'all' },
            SelectedArchetype: archetypes[0],
            IsLoading: false,
        };
        const ctx = BuildArchetypesAgentContext(input);
        expect(ctx['Surface']).toBe('VideoStudioArchetypes');
        expect(ctx['TotalArchetypeCount']).toBe(2);
        expect(ctx['ShippedArchetypeCount']).toBe(1);
        expect(ctx['CompanyArchetypeCount']).toBe(1);
        expect(ctx['SelectedArchetypeId']).toBe('arch-1');
        expect(ctx['AvailableCategories']).toEqual([...ARCHETYPE_CATEGORIES]);
    });
});

// ============================================================================
// 4. Studio surface
// ============================================================================

describe('ParseArchetypeDefaultFormats, ClampStudioDuration, ComposeStudioFirstMessage & BuildStudioAgentContext', () => {
    it('parses JSON array or comma-separated formats and falls back to 16:9 when empty/invalid', () => {
        expect(ParseArchetypeDefaultFormats('["16:9", "9:16"]')).toEqual(['16:9', '9:16']);
        expect(ParseArchetypeDefaultFormats('16:9, 1:1, 4:5, 16:9')).toEqual(['16:9', '1:1', '4:5']);
        expect(ParseArchetypeDefaultFormats('invalid, 99:99')).toEqual(['16:9']);
        expect(ParseArchetypeDefaultFormats('')).toEqual(['16:9']);
        expect(ParseArchetypeDefaultFormats(null)).toEqual(['16:9']);
    });

    it('clamps duration to archetype min and max bounds', () => {
        expect(ClampStudioDuration(45, 15, 90)).toBe(45);
        expect(ClampStudioDuration(5, 15, 90)).toBe(15);
        expect(ClampStudioDuration(140, 15, 90)).toBe(90);
        expect(ClampStudioDuration(Number.NaN, 15, 90)).toBe(15);
    });

    it('composes deterministic plain-text first message naming archetype, topic, duration, formats, brand kit, and queries', () => {
        const message = ComposeStudioFirstMessage({
            ArchetypeName: 'Executive Briefing',
            Topic: 'Q3 revenue growth and customer expansion',
            DurationSeconds: 60,
            Formats: ['16:9', '9:16'],
            BrandKitName: 'Acme Primary Brand',
            QueryNames: ['Quarterly ARR By Segment', 'Top Customer Renewals'],
        });

        expect(message).toBe(
            'Make a Executive Briefing video, about Q3 revenue growth and customer expansion, 60 seconds, formats 16:9, 9:16, brand kit Acme Primary Brand, data from Quarterly ARR By Segment, Top Customer Renewals.',
        );

        const minimal = ComposeStudioFirstMessage({
            ArchetypeName: 'Social Reel',
            Topic: 'New feature launch',
            DurationSeconds: 15,
            Formats: ['9:16'],
            BrandKitName: null,
            QueryNames: [],
        });

        expect(minimal).toBe(
            'Make a Social Reel video, about New feature launch, 15 seconds, formats 9:16, brand kit none, data from none.',
        );
    });

    it('builds Studio app context and bounded Studio agent context', () => {
        const appCtx = BuildStudioAppContext({
            ArchetypeID: 'arch-1',
            BrandKitID: 'kit-1',
            Formats: ['16:9', '1:1'],
            DurationSeconds: 75,
            QueryIDs: ['q-1', 'q-2'],
        });
        expect(appCtx).toEqual({
            VideoStudio: {
                ArchetypeID: 'arch-1',
                BrandKitID: 'kit-1',
                Formats: ['16:9', '1:1'],
                DurationSeconds: 75,
                QueryIDs: ['q-1', 'q-2'],
            },
        });

        const manyArchetypes = Array.from({ length: 30 }, (_, i) => ({
            ID: `arch-${i}`,
            Name: `Archetype ${i}`,
        }));
        const manyKits = Array.from({ length: 28 }, (_, i) => ({
            ID: `kit-${i}`,
            Name: `Brand Kit ${i}`,
        }));
        const manyQueries = Array.from({ length: 27 }, (_, i) => ({
            ID: `q-${i}`,
            Name: `Query ${i}`,
        }));

        const ctx = BuildStudioAgentContext({
            AllArchetypes: manyArchetypes,
            AllBrandKits: manyKits,
            SelectedArchetype: makeArchetypeCard(),
            SelectedBrandKit: makeBrandKitCard(),
            SelectedFormats: ['16:9', '9:16'],
            DurationSeconds: 90,
            Topic: 'Annual membership recap',
            SelectedQueries: manyQueries,
            ActiveConversationId: 'conv-123',
            IsLoading: false,
        });

        expect(ctx['Surface']).toBe('VideoStudioStudio');
        expect(ctx['TotalArchetypeCount']).toBe(30);
        expect(ctx['TotalBrandKitCount']).toBe(28);
        expect(ctx['SelectedArchetypeId']).toBe('arch-1');
        expect(ctx['SelectedBrandKitId']).toBe('kit-1');
        expect(ctx['CanStartProduction']).toBe(true);
        expect((ctx['AvailableArchetypeNames'] as string[]).length).toBe(VIDEO_STUDIO_NAME_LIST_CAP);
        expect(ctx['AvailableArchetypeCount']).toBe(30);
        expect((ctx['AvailableBrandKitNames'] as string[]).length).toBe(VIDEO_STUDIO_NAME_LIST_CAP);
        expect(ctx['AvailableBrandKitCount']).toBe(28);
        expect((ctx['SelectedQueryNames'] as string[]).length).toBe(VIDEO_STUDIO_NAME_LIST_CAP);
        expect(ctx['SelectedQueryCount']).toBe(27);
        expect(ctx['AvailableFormats']).toEqual([...STUDIO_VIDEO_FORMATS]);
    });
});

