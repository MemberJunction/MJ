/**
 * Tests for the Video Studio pure agent-context and filter/resolver helpers across
 * all three resource surfaces:
 *   1. Productions (`VideoStudioProductionsResource`)
 *   2. Brand Kits (`VideoStudioBrandKitsResource`)
 *   3. Archetypes (`VideoStudioArchetypesResource`)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { BrandKitEngine, VideoStudioEngine } from '@memberjunction/core-entities';
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
    BuildArchetypeBeatStripItems,
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
    ArchetypeBeatTemplateInput,
    STUDIO_VIDEO_FORMATS,
    ParseArchetypeDefaultFormats,
    ClampStudioDuration,
    BuildSavedQuerySearchFilter,
    ComposeStudioFirstMessage,
    BuildStudioAppContext,
    BuildStudioBriefClientTools,
} from '../VideoStudio/video-studio-agent-context';
import { VSStudioSlideInStateService } from '../VideoStudio/services/vs-studio-slide-in-state.service';

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
        const prevTz = process.env.TZ;
        process.env.TZ = 'America/Chicago';
        try {
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
        } finally {
            if (prevTz === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = prevTz;
            }
        }
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
        expect(ctx['SuppressChatOverlay']).toBe(true);
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

    it('builds Brand Kits agent context with active/inactive/default counts and SuppressChatOverlay: true', () => {
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
        expect(ctx['SuppressChatOverlay']).toBe(true);
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

    it('builds Archetypes agent context with shipped/company counts, categories, and SuppressChatOverlay: true', () => {
        const input: ArchetypesAgentContextInput = {
            AllCards: archetypes,
            FilteredCards: archetypes,
            Filters: { SearchQuery: '', Category: 'all', Scope: 'all' },
            SelectedArchetype: archetypes[0],
            IsLoading: false,
        };
        const ctx = BuildArchetypesAgentContext(input);
        expect(ctx['Surface']).toBe('VideoStudioArchetypes');
        expect(ctx['SuppressChatOverlay']).toBe(true);
        expect(ctx['TotalArchetypeCount']).toBe(2);
        expect(ctx['ShippedArchetypeCount']).toBe(1);
        expect(ctx['CompanyArchetypeCount']).toBe(1);
        expect(ctx['SelectedArchetypeId']).toBe('arch-1');
        expect(ctx['AvailableCategories']).toEqual([...ARCHETYPE_CATEGORIES]);
    });
});

// ============================================================================
// 4. Studio brief helpers & shared slide-in state service
// ============================================================================

describe('ParseArchetypeDefaultFormats, ClampStudioDuration, ComposeStudioFirstMessage, BuildStudioAppContext, BuildStudioBriefClientTools & VSStudioSlideInStateService', () => {
    it('parses JSON array or comma-separated formats and falls back to 16:9 when empty/invalid', () => {
        expect(ParseArchetypeDefaultFormats('["16:9", "9:16"]')).toEqual(['16:9', '9:16']);
        expect(ParseArchetypeDefaultFormats('16:9, 1:1, 4:5, 16:9')).toEqual(['16:9', '1:1', '4:5']);
        expect(ParseArchetypeDefaultFormats('invalid, 99:99')).toEqual(['16:9']);
        expect(ParseArchetypeDefaultFormats('')).toEqual(['16:9']);
        expect(ParseArchetypeDefaultFormats(null)).toEqual(['16:9']);
        expect(STUDIO_VIDEO_FORMATS).toEqual(['16:9', '9:16', '1:1', '4:5']);
    });

    it('clamps duration to archetype min and max bounds', () => {
        expect(ClampStudioDuration(45, 15, 90)).toBe(45);
        expect(ClampStudioDuration(5, 15, 90)).toBe(15);
        expect(ClampStudioDuration(140, 15, 90)).toBe(90);
        expect(ClampStudioDuration(Number.NaN, 15, 90)).toBe(15);
    });

    it('escapes SQL LIKE wildcards (%, _, [, \\) with ESCAPE and single quotes via EscapeSQLString in BuildSavedQuerySearchFilter', () => {
        expect(BuildSavedQuerySearchFilter('')).toBe('');
        expect(BuildSavedQuerySearchFilter('   ')).toBe('');
        expect(BuildSavedQuerySearchFilter('50%_off')).toBe(
            "Name LIKE '%50\\%\\_off%' ESCAPE '\\'",
        );
        expect(BuildSavedQuerySearchFilter("O'Reilly [Q1]\\KPI")).toBe(
            "Name LIKE '%O''Reilly \\[Q1]\\\\KPI%' ESCAPE '\\'",
        );
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

    it('builds Studio app context including optional narration and captions settings', () => {
        const appCtx = BuildStudioAppContext({
            ArchetypeID: 'arch-1',
            BrandKitID: 'kit-1',
            Formats: ['16:9', '1:1'],
            DurationSeconds: 75,
            QueryIDs: ['q-1', 'q-2'],
            NarrationEnabled: true,
            CaptionsMode: 'Burned',
        });
        expect(appCtx).toEqual({
            VideoStudio: {
                ArchetypeID: 'arch-1',
                BrandKitID: 'kit-1',
                Formats: ['16:9', '1:1'],
                DurationSeconds: 75,
                QueryIDs: ['q-1', 'q-2'],
                NarrationEnabled: true,
                CaptionsMode: 'Burned',
            },
        });
    });

    it('scales beat templates via largest-remainder rounding so integer Seconds sum to DefaultDurationSeconds for every seeded archetype', () => {
        const metadataPath = resolve(
            __dirname,
            '../../../../../../metadata/video-archetypes/.video-archetypes.json',
        );
        const rawJson = JSON.parse(readFileSync(metadataPath, 'utf8')) as Array<{
            fields: {
                Name: string;
                DefaultDurationSeconds: number;
                BeatTemplate: ArchetypeBeatTemplateInput[];
            };
        }>;
        expect(rawJson.length).toBeGreaterThanOrEqual(7);

        for (const entry of rawJson) {
            const { Name, DefaultDurationSeconds, BeatTemplate } = entry.fields;
            const items = BuildArchetypeBeatStripItems(BeatTemplate, DefaultDurationSeconds);
            expect(items.length).toBe(BeatTemplate.length);
            for (const item of items) {
                expect(Number.isInteger(item.Seconds)).toBe(true);
                expect(item.Seconds).toBeGreaterThanOrEqual(1);
            }
            const sum = items.reduce((acc, item) => acc + item.Seconds, 0);
            expect(sum, `${Name} beat sum should equal DefaultDurationSeconds`).toBe(
                DefaultDurationSeconds,
            );
        }

        // Also verify fallback min/max weights when DefaultDurationSeconds is omitted on beats
        const minMaxOnly = BuildArchetypeBeatStripItems(
            [
                { Key: 'a', Label: 'A', MinDurationSeconds: 2, MaxDurationSeconds: 4 },
                { Key: 'b', Label: 'B', MinDurationSeconds: 4, MaxDurationSeconds: 8 },
                { Key: 'c', Label: 'C', MinDurationSeconds: 2, MaxDurationSeconds: 4 },
            ],
            25,
        );
        expect(minMaxOnly.reduce((acc, item) => acc + item.Seconds, 0)).toBe(25);
    });

    it('keeps open state, ConversationId, and brief client tool selections across page changes in VSStudioSlideInStateService', async () => {
        const service = new VSStudioSlideInStateService();
        expect(service.IsOpen).toBe(false);
        expect(service.ConversationId).toBeNull();

        service.OpenIterate('conv-across-pages-1', 'art-1', 2);
        expect(service.IsOpen).toBe(true);
        expect(service.ConversationId).toBe('conv-across-pages-1');
        expect(service.PendingArtifactId).toBe('art-1');
        expect(service.PendingArtifactVersionNumber).toBe(2);
        expect(service.IsBriefShowing).toBe(false);
        // When an active conversation is open, BuildBriefClientTools returns []
        expect(service.BuildBriefClientTools()).toEqual([]);

        // Opening a new production resets ConversationId to null while keeping IsOpen = true
        service.OpenNewProduction();
        expect(service.IsOpen).toBe(true);
        expect(service.ConversationId).toBeNull();
        expect(service.IsBriefShowing).toBe(true);

        const sampleArchetype = makeArchetypeCard({
            ID: 'arch-kpi-1',
            Name: 'KPI Briefing',
            DefaultDurationSeconds: 60,
            MinDurationSeconds: 30,
            MaxDurationSeconds: 90,
            DefaultFormats: '["16:9", "9:16"]',
        });
        const sampleKit = makeBrandKitCard({
            ID: 'kit-org-1',
            Name: 'Org Default Kit',
        });

        const getVsEngineSpy = vi
            .spyOn(VideoStudioEngine, 'GetProviderInstance')
            .mockReturnValue({
                Archetypes: [sampleArchetype],
            } as unknown as VideoStudioEngine);
        const getBkEngineSpy = vi
            .spyOn(BrandKitEngine, 'GetProviderInstance')
            .mockReturnValue({
                BrandKits: [sampleKit],
            } as unknown as BrandKitEngine);

        const publishedContexts: Record<string, unknown>[] = [];
        const tools = service.BuildBriefClientTools({
            OnBriefMutated: () => {
                publishedContexts.push(
                    service.BuildCombinedAppContext({ Surface: 'VideoStudioBrandKits', SuppressChatOverlay: true }),
                );
            },
        });
        expect(tools.map((t) => t.Name)).toEqual([
            'SelectStudioArchetype',
            'SelectStudioBrandKit',
            'SetStudioFormats',
            'SetStudioTopic',
        ]);

        const archTool = tools.find((t) => t.Name === 'SelectStudioArchetype')!;
        const kitTool = tools.find((t) => t.Name === 'SelectStudioBrandKit')!;
        const fmtTool = tools.find((t) => t.Name === 'SetStudioFormats')!;
        const topicTool = tools.find((t) => t.Name === 'SetStudioTopic')!;

        expect((await archTool.Handler({ archetype: 'KPI Briefing' })).Success).toBe(true);
        expect((await kitTool.Handler({ brandKit: 'Org Default Kit' })).Success).toBe(true);
        expect((await fmtTool.Handler({ formats: ['16:9', '9:16'] })).Success).toBe(true);
        expect((await topicTool.Handler({ topic: 'Q3 ARR growth' })).Success).toBe(true);

        // Moving to Archetypes page preserves IsOpen, ConversationId, and brief state
        expect(service.IsOpen).toBe(true);
        expect(service.BriefSelectedArchetype?.ID).toBe('arch-kpi-1');
        expect(service.BriefSelectedBrandKit?.ID).toBe('kit-org-1');
        expect(service.BriefSelectedFormats).toEqual(['16:9', '9:16']);
        expect(service.BriefTopic).toBe('Q3 ARR growth');
        expect(publishedContexts.length).toBe(4);

        const archetypesCombined = service.BuildCombinedAppContext({
            Surface: 'VideoStudioArchetypes',
            SuppressChatOverlay: true,
        });
        expect(archetypesCombined['Surface']).toBe('VideoStudioArchetypes');
        expect(archetypesCombined['SuppressChatOverlay']).toBe(true);
        expect((archetypesCombined['VideoStudio'] as Record<string, unknown>)['ArchetypeID']).toBe('arch-kpi-1');
        expect((archetypesCombined['VideoStudio'] as Record<string, unknown>)['BrandKitID']).toBe('kit-org-1');
        expect((archetypesCombined['VideoStudio'] as Record<string, unknown>)['Formats']).toEqual(['16:9', '9:16']);

        // Also test BuildStudioBriefClientTools directly with a mounted brief handle
        const handle = {
            ApplyClientToolArchetype: (ref: string) => ({
                Success: true,
                Message: `Selected ${ref}`,
                Data: { SelectedArchetypeId: 'arch-resolved-9' },
            }),
            ApplyClientToolBrandKit: (ref: string) => ({
                Success: true,
                Message: `Selected ${ref}`,
                Data: { SelectedBrandKitId: 'kit-resolved-9' },
            }),
            ApplyClientToolFormats: (formats: unknown) => ({
                Success: true,
                Message: 'Formats set',
                Data: { SelectedFormats: formats },
            }),
            ApplyClientToolTopic: (topic: string) => ({
                Success: true,
                Message: 'Topic set',
                Data: { Topic: topic },
            }),
        };
        const directTools = BuildStudioBriefClientTools({
            GetBriefComponent: () => handle,
        });
        const directArchRes = await directTools[0].Handler({ archetype: 'Executive Briefing' });
        expect(directArchRes.Success).toBe(true);
        expect(directArchRes.Data?.['SelectedArchetypeId']).toBe('arch-resolved-9');
        expect(getVsEngineSpy).toHaveBeenCalled();
        expect(getBkEngineSpy).toHaveBeenCalled();
        vi.restoreAllMocks();
    });
});





