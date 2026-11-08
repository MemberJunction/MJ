import { describe, it, expect } from 'vitest';
import {
    SlideDeckEngine,
    SLIDE_LAYOUT_CATALOG,
    SLIDE_DECK_THEME_PRESETS
} from '../custom/SlideDeckEngine';
import { DocumentBlockExecutionResult } from '../custom/DocumentLiveBlockEngine';

describe('SlideDeckEngine (Wave 2 Slides Schema, Layouts, Theme Seeds, Freeze & Markdown Conversion)', () => {
    const engine = SlideDeckEngine.Instance;

    it('creates a default 16:9 deck and builds regions for all canonical layouts', () => {
        const deck = engine.CreateDefaultDeck('Q4 Board Review', 'deck-q4');
        expect(deck.DeckID).toBe('deck-q4');
        expect(deck.Title).toBe('Q4 Board Review');
        expect(deck.AspectRatio).toBe('16:9');
        expect(deck.Slides.length).toBeGreaterThanOrEqual(3);

        for (const layoutMeta of SLIDE_LAYOUT_CATALOG) {
            const regions = engine.BuildRegionsForLayout(layoutMeta.Kind);
            expect(regions.length).toBeGreaterThanOrEqual(1);
            expect(regions[0].RegionID).toBeTruthy();
        }
    });

    it('converts a Markdown Document with headings, tables, speaker notes, and :::mj-block directives into a SlideDeckSpec (§ 5.2)', () => {
        const markdown = [
            '# Enterprise AI Transformation',
            'Executive summary for the board.',
            '> Speaker Notes: Welcome the board and frame our Q4 milestones.',
            '',
            '## Strategic Pillars',
            '- Unified metadata layer',
            '- Viewer-scoped RLS and FLS enforcement',
            '> Speaker Notes: Emphasize zero-trust data governance.',
            '',
            '## Live Customer Telemetry',
            ':::mj-block',
            '{"BlockID":"blk-ev-customers","Kind":"EntityView","Mode":"Live","Title":"Active Enterprise Accounts","EntityName":"MJ: Users","DisplayMode":"table"}',
            ':::',
            'Commentary on enterprise adoption.',
            '',
            '## Architecture Topology',
            ':::mj-block',
            '{"BlockID":"blk-wb-arch","Kind":"Artifact","Mode":"Live","Title":"Yjs Cluster Topology","ArtifactID":"wb-1111","ArtifactType":"Whiteboard"}',
            ':::'
        ].join('\n');

        const deck = engine.ConvertMarkdownToSlideDeck(markdown, 'AI Transformation Deck');
        expect(deck.Slides).toHaveLength(4);
        expect(deck.Slides[0].Layout).toBe('Title');
        expect(deck.Slides[0].Title).toBe('Enterprise AI Transformation');
        expect(deck.Slides[0].SpeakerNotes).toContain('Welcome the board');

        expect(deck.Slides[1].Layout).toBe('TitleAndBody');
        expect(deck.Slides[1].Regions[0].MarkdownContent).toContain('Unified metadata layer');

        expect(deck.Slides[2].Layout).toBe('LiveDataSlide');
        const liveDataBlock = engine.ExtractRegionBlockSpec(deck.Slides[2].Regions[0]);
        expect(liveDataBlock?.BlockID).toBe('blk-ev-customers');
        expect(liveDataBlock?.Kind).toBe('EntityView');

        expect(deck.Slides[3].Layout).toBe('ChartAndText');
        const wbBlock = engine.ExtractRegionBlockSpec(deck.Slides[3].Regions[0]);
        expect(wbBlock?.BlockID).toBe('blk-wb-arch');
        expect(wbBlock?.Kind).toBe('Artifact');
        expect(wbBlock?.ArtifactType).toBe('Whiteboard');
    });

    it('updates a single slide and region in isolation without mutating any other slide (Wave 2 Accept #3)', () => {
        const initial = engine.CreateDefaultDeck('Isolation Test Deck', 'deck-iso');
        const slide1Before = JSON.stringify(initial.Slides[0]);
        const slide3Before = JSON.stringify(initial.Slides[2]);

        const { Deck: afterMeta, UpdatedSlide } = engine.UpdateSlideMetadata(initial, 'slide-2', {
            Title: 'Updated Slide 2 Only',
            SpeakerNotes: 'Updated notes for slide 2'
        });

        expect(UpdatedSlide?.Title).toBe('Updated Slide 2 Only');
        expect(JSON.stringify(afterMeta.Slides[0])).toBe(slide1Before);
        expect(JSON.stringify(afterMeta.Slides[2])).toBe(slide3Before);

        const { Deck: afterRegion, UpdatedRegion } = engine.UpsertSlideRegion(afterMeta, 'slide-2', {
            RegionID: 'left',
            MarkdownContent: '- Updated Left Column Bullet Only'
        });
        expect(UpdatedRegion?.MarkdownContent).toBe('- Updated Left Column Bullet Only');
        expect(JSON.stringify(afterRegion.Slides[0])).toBe(slide1Before);
        expect(JSON.stringify(afterRegion.Slides[2])).toBe(slide3Before);
    });

    it('reorders slides and preserves any concurrently added slide not present in orderedSlideIds (Wave 2 Accept #1)', () => {
        const initial = engine.CreateDefaultDeck('Reorder Deck', 'deck-reorder');
        const { Deck: withFourth } = engine.AddSlide(initial, {
            SlideID: 'slide-4',
            Layout: 'BigNumber',
            Title: 'Fourth Slide KPI'
        });

        // Reorder specifying only 3 slides — slide-4 must still be preserved at the end
        const reordered = engine.ReorderSlides(withFourth, ['slide-3', 'slide-1', 'slide-2']);
        expect(reordered.Slides.map((s) => s.SlideID)).toEqual(['slide-3', 'slide-1', 'slide-2', 'slide-4']);
        expect(reordered.Slides.map((s) => s.SlideNumber)).toEqual([1, 2, 3, 4]);
    });

    it('derives contrast-safe themes from organization brand color seeds and applies preset themes (Wave 2 Accept #4)', () => {
        const initial = engine.CreateDefaultDeck('Brand Theme Deck', 'deck-theme');

        // Dark background brand seed -> light foreground text
        const darkBrandDeck = engine.ApplyTheme(initial, {
            OrganizationName: 'Acme Robotics',
            PrimaryColor: '#7C3AED',
            AccentColor: '#F59E0B',
            BackgroundColor: '#0F172A',
            HeadingFont: 'Outfit, sans-serif'
        });
        expect(darkBrandDeck.Theme.PrimaryColor.toUpperCase()).toBe('#7C3AED');
        expect(darkBrandDeck.Theme.AccentColor.toUpperCase()).toBe('#F59E0B');
        expect(darkBrandDeck.Theme.BackgroundColor.toUpperCase()).toBe('#0F172A');
        expect(darkBrandDeck.Theme.TextColor.toUpperCase()).toBe('#F8FAFC');
        expect(darkBrandDeck.Theme.BrandSeedSource).toBe('Acme Robotics');

        // Light background brand seed -> dark foreground text
        const lightBrandDeck = engine.ApplyTheme(darkBrandDeck, {
            OrganizationName: 'Sunlight Corp',
            PrimaryColor: '#0284C7',
            BackgroundColor: '#FFFFFF'
        });
        expect(lightBrandDeck.Theme.TextColor.toUpperCase()).toBe('#0F172A');

        // Named preset
        const emeraldDeck = engine.ApplyTheme(lightBrandDeck, SLIDE_DECK_THEME_PRESETS[2].ThemeID);
        expect(emeraldDeck.Theme.ThemeID).toBe('emerald-growth');
    });

    it('freezes live MJ blocks with viewer-scoped execution snapshots for Presentation Mode (O6) and .pptx export (Accept #2)', () => {
        const deck = engine.CreateDefaultDeck('Freeze Deck', 'deck-freeze');
        const resultsMap = new Map<string, DocumentBlockExecutionResult>([
            [
                'slide-blk-ev-1',
                {
                    Success: true,
                    BlockID: 'slide-blk-ev-1',
                    Kind: 'EntityView',
                    Mode: 'Live',
                    Columns: [
                        { Name: 'Name', DisplayName: 'Initiative Name', Type: 'nvarchar' },
                        { Name: 'Status', DisplayName: 'Status', Type: 'nvarchar' }
                    ],
                    Rows: [
                        { Name: 'Project Aurora', Status: 'Active' },
                        { Name: 'Project Titan', Status: 'Approved' }
                    ],
                    TotalRowCount: 2
                }
            ]
        ]);

        const frozenDeck = engine.FreezeDeckLiveBlocksForPresentation(deck, resultsMap, {
            ID: 'user-presenter-1',
            Name: 'Alice Presenter'
        });

        const slide3 = frozenDeck.Slides[2];
        const blockSpec = engine.ExtractRegionBlockSpec(slide3.Regions[0]);
        expect(blockSpec?.Mode).toBe('Frozen');
        expect(blockSpec?.FrozenSnapshot?.FrozenByUserID).toBe('user-presenter-1');
        expect(blockSpec?.FrozenSnapshot?.Rows).toHaveLength(2);
        expect(blockSpec?.FrozenSnapshot?.Rows[0]['Name']).toBe('Project Aurora');
    });
});
