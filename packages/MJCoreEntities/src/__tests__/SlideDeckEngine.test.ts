import { describe, it, expect, beforeEach } from 'vitest';
import {
    SlideDeckEngine,
    SLIDE_LAYOUT_CATALOG,
    SLIDE_DECK_THEME_PRESETS
} from '../custom/SlideDeckEngine';
import {
    ComputeFrozenSnapshotHash,
    DocumentBlockExecutionResult,
    DocumentLiveBlockEngine,
    ValidateFrozenBlockSnapshot
} from '../custom/DocumentLiveBlockEngine';
import { SpreadsheetEngine } from '../custom/SpreadsheetEngine';

describe('SlideDeckEngine (Wave 2 Slides Schema, Layouts, Theme Seeds, Freeze & Markdown Conversion)', () => {
    const engine = SlideDeckEngine.Instance;

    beforeEach(() => {
        DocumentLiveBlockEngine.Instance.SetSigningSecret('test-frozen-block-hmac-secret-at-least-32-bytes!!');
    });

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

    it('D6: mints collision-free UUID SlideIDs in AddSlide/DuplicateSlide, mints fresh BlockIDs on DuplicateSlide, and uses clean neutral placeholders', () => {
        const initial = engine.CreateDefaultDeck('Collision Deck', 'deck-uuid');
        const { Deck: afterAdd1, AddedSlide: sA } = engine.AddSlide(initial, { Layout: 'TitleAndBody', Title: 'Added A' });
        const { Deck: afterDelete } = engine.DeleteSlide(afterAdd1, 'slide-2');
        const { Deck: afterAdd2, AddedSlide: sB } = engine.AddSlide(afterDelete, { Layout: 'TitleAndBody', Title: 'Added B' });

        expect(sA.SlideID).not.toBe(sB.SlideID);
        const allSlideIds = afterAdd2.Slides.map((s) => s.SlideID);
        expect(new Set(allSlideIds).size).toBe(allSlideIds.length);

        // DuplicateSlide on slide-3 (which has slide-blk-ev-1) mints both a fresh SlideID and a fresh BlockID
        const { Deck: afterDup, DuplicatedSlide } = engine.DuplicateSlide(afterAdd2, 'slide-3');
        expect(DuplicatedSlide).toBeTruthy();
        expect(DuplicatedSlide!.SlideID).not.toBe('slide-3');
        const origBlock = engine.ExtractRegionBlockSpec(afterDup.Slides.find((s) => s.SlideID === 'slide-3')!.Regions[0]);
        const dupBlock = engine.ExtractRegionBlockSpec(DuplicatedSlide!.Regions[0]);
        expect(origBlock?.BlockID).toBe('slide-blk-ev-1');
        expect(dupBlock?.BlockID).toBeTruthy();
        expect(dupBlock?.BlockID).not.toBe(origBlock?.BlockID);

        // Clean placeholders check
        expect(initial.Master.HeaderText).toBe('');
        expect(initial.Master.FooterText).toBe('');
        const liveSlideRegions = engine.BuildRegionsForLayout('LiveDataSlide');
        const liveSpec = engine.ExtractRegionBlockSpec(liveSlideRegions[0]);
        expect(liveSpec?.ExtraFilter).toBeUndefined();
        const quoteRegions = engine.BuildRegionsForLayout('Quote');
        expect(quoteRegions[0].MarkdownContent).not.toContain('VP of Enterprise Architecture');
        const bigNumRegions = engine.BuildRegionsForLayout('BigNumber');
        expect(bigNumRegions[0].MarkdownContent).not.toContain('99.98%');

        // Print CSS sanitization check
        const hostileDeck = engine.ApplyTheme(initial, {
            PrimaryColor: '#ff0000; } body { background: url(https://evil.example/x) } /*',
            HeadingFont: 'Inter; @import url(https://evil.example/font.css);'
        });
        const printHtml = engine.RenderPrintHtml(hostileDeck);
        expect(printHtml).not.toContain('url(');
        expect(printHtml).not.toContain('@import');
        expect(hostileDeck.Theme.PrimaryColor).not.toContain(';');
        expect(hostileDeck.Theme.PrimaryColor).not.toContain('{');
    });

    it('P1-6 / P2-3: validates ImageUrl and Master.LogoUrl schemes, hardens SanitizeCssValue, and keeps backtick vs ::: fences separate', () => {
        expect(engine.SanitizeImageUrl('javascript:alert(1)')).toBeUndefined();
        expect(engine.SanitizeImageUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
        expect(engine.SanitizeImageUrl('data:image/svg+xml;utf8,<svg onload=alert(1)/>')).toBeUndefined();
        expect(engine.SanitizeImageUrl('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png');
        expect(engine.SanitizeImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');

        expect(engine.SanitizeCssValue('red) ; } body { color: blue', 'inherit')).toBe('inherit');
        expect(engine.SanitizeCssValue('expression(alert(1))', 'inherit')).toBe('inherit');
        expect(engine.SanitizeCssValue('Inter, sans-serif', 'system-ui')).toBe('Inter, sans-serif');

        const deck = engine.CreateDefaultDeck('Image Safety Deck', 'deck-img-safety');
        deck.Master.LogoUrl = 'javascript:alert(1)';
        const { Deck: updated } = engine.UpsertSlideRegion(deck, deck.Slides[0].SlideID, {
            RegionID: 'img-region',
            Kind: 'image',
            Label: 'Logo',
            ImageUrl: 'data:text/html;base64,PHNjcmlwdD4=',
            MarkdownContent: ''
        });
        expect(updated.Slides[0].Regions.find((r) => r.RegionID === 'img-region')?.ImageUrl).toBeUndefined();

        const roundTripped = engine.ParseDeckSpec(engine.SerializeDeckSpec(updated));
        expect(roundTripped.Master.LogoUrl).toBeUndefined();

        const multiBlockMd = [
            '# Architecture Slide',
            '```ts',
            'const fence = "not a directive close";',
            ':::',
            '```',
            ':::mj-block',
            '{"BlockID":"blk-one","Kind":"EntityView","Mode":"Live","Title":"Block One","EntityName":"MJ: Users"}',
            ':::',
            ':::mj-block',
            '{"BlockID":"blk-two","Kind":"SavedQuery","Mode":"Live","Title":"Block Two","QueryName":"Top Revenue"}',
            ':::'
        ].join('\n');
        const parsedDeck = engine.ConvertMarkdownToSlideDeck(multiBlockMd, 'Multi Block Deck');
        const allBlockIds = parsedDeck.Slides.flatMap((s) =>
            s.Regions.map((r) => r.BlockSpec?.BlockID).filter((id): id is string => Boolean(id))
        );
        expect(allBlockIds).toContain('blk-one');
        expect(allBlockIds).toContain('blk-two');
    });

    it('P0-12: blocks non-owner UpdateSlideMetadata layout changes and DeleteSlide when region 2..N is locked', () => {
        const ownerId = '11111111-1111-1111-1111-111111111111';
        const otherEditorId = '22222222-2222-2222-2222-222222222222';
        let deck = engine.CreateDefaultDeck('Governance Deck', 'deck-gov');
        // Switch slide 2 to Comparison (multiple regions) and lock region #2 (index 1)
        const slide2Id = deck.Slides[1].SlideID;
        deck = engine.UpdateSlideMetadata(
            deck,
            slide2Id,
            { Layout: 'Comparison' },
            { ActorUserID: ownerId, OwnerUserID: ownerId, IsEditor: true }
        ).Deck;
        const targetRegionId = deck.Slides[1].Regions[1].RegionID;
        deck = engine.SetRegionLock(deck, slide2Id, targetRegionId, true, ownerId, false, ownerId).Deck;

        // Non-owner editor cannot switch layout (which would truncate/drop region #2)
        expect(() =>
            engine.UpdateSlideMetadata(
                deck,
                slide2Id,
                { Layout: 'BigNumber' },
                { ActorUserID: otherEditorId, OwnerUserID: ownerId, IsEditor: true }
            )
        ).toThrow(/locked/i);

        // Non-owner editor cannot delete a slide containing a locked region
        expect(() =>
            engine.DeleteSlide(deck, slide2Id, {
                ActorUserID: otherEditorId,
                OwnerUserID: ownerId,
                IsEditor: true
            })
        ).toThrow();

        // Owner CAN switch layout or delete
        const ownerChanged = engine.UpdateSlideMetadata(
            deck,
            slide2Id,
            { Layout: 'BigNumber' },
            { ActorUserID: ownerId, OwnerUserID: ownerId, IsEditor: true }
        );
        expect(ownerChanged.UpdatedSlide?.Layout).toBe('BigNumber');
    });

    it('P0-6 / P1-6: signs FreezeDeckLiveBlocksForPresentation with HMAC and freezes Kind=Artifact blocks + rich RenderPrintHtml', () => {
        const secret = 'test-frozen-block-hmac-secret-at-least-32-bytes!!';
        let deck = engine.CreateDefaultDeck('Executive Briefing', 'deck-hmac-print');
        deck.Master.HeaderText = 'CONFIDENTIAL';
        deck.Master.FooterText = 'Board Packet';
        deck.Master.OrganizationName = 'Acme Corp';
        deck.Master.LogoUrl = 'https://cdn.acme.example/logo.png';

        const slide0Id = deck.Slides[0].SlideID;
        const slide1Id = deck.Slides[1].SlideID;

        deck = engine.UpsertSlideRegion(deck, slide0Id, {
            RegionID: 'kpi-1',
            Kind: 'big-number',
            Label: 'ARR',
            BigNumberValue: '$18.4M',
            BigNumberLabel: 'Annual Recurring Revenue',
            BigNumberDelta: '+31% YoY',
            MarkdownContent: ''
        }).Deck;
        deck = engine.UpsertSlideRegion(deck, slide0Id, {
            RegionID: 'quote-1',
            Kind: 'quote',
            Label: 'Customer Quote',
            MarkdownContent: 'MemberJunction cut our reporting cycle in half.',
            QuoteAttribution: 'Jane Doe, CFO'
        }).Deck;
        deck = engine.UpsertSlideRegion(deck, slide0Id, {
            RegionID: 'hero-img',
            Kind: 'image',
            Label: 'Chart Snapshot',
            ImageUrl: 'https://cdn.acme.example/chart.png',
            ImageAlt: 'Quarterly Trend',
            MarkdownContent: ''
        }).Deck;
        deck = engine.UpsertSlideRegion(deck, slide1Id, {
            RegionID: 'embedded-artifact',
            Kind: 'mj-block',
            Label: 'Whiteboard Diagram',
            BlockSpec: {
                BlockID: 'blk-artifact-1',
                Kind: 'Artifact',
                Mode: 'Live',
                Title: 'Platform Topology',
                ArtifactID: '33333333-3333-3333-3333-333333333333',
                DisplayMode: 'cards'
            },
            MarkdownContent: ''
        }).Deck;

        const results = new Map<string, DocumentBlockExecutionResult>([
            [
                'blk-artifact-1',
                {
                    BlockID: 'blk-artifact-1',
                    Success: true,
                    Kind: 'Artifact',
                    Mode: 'Live',
                    Columns: [{ Name: 'Summary', DisplayName: 'Summary', Type: 'string' }],
                    Rows: [{ Summary: 'Diagram Snapshot Ready' }],
                    TotalRowCount: 1,
                    ArtifactContent: '<svg>diagram</svg>',
                    ArtifactType: 'Whiteboard'
                }
            ]
        ]);

        const frozen = engine.FreezeDeckLiveBlocksForPresentation(
            deck,
            results,
            { ID: 'presenter-1', Name: 'Alex Presenter' },
            { SigningSecret: secret, RequireSignature: true }
        );
        const frozenRegion = frozen.Slides[1].Regions.find((r) => r.RegionID === 'embedded-artifact');
        expect(frozenRegion?.BlockSpec?.Mode).toBe('Frozen');
        expect(frozenRegion?.BlockSpec?.FrozenSnapshot?.SnapshotContentHash).toMatch(/^hmac-sha256:/);
        expect(frozenRegion?.BlockSpec?.FrozenSnapshot?.ArtifactContentSnapshot).toBe('<svg>diagram</svg>');
        const verification = ValidateFrozenBlockSnapshot(frozenRegion?.BlockSpec?.FrozenSnapshot, secret);
        expect(verification.Valid).toBe(true);
        expect(verification.SnapshotVerified).toBe(true);

        const html = engine.RenderPrintHtml(frozen);
        expect(html).toContain('$18.4M');
        expect(html).toContain('Annual Recurring Revenue');
        expect(html).toContain('+31% YoY');
        expect(html).toContain('Jane Doe, CFO');
        expect(html).toContain('https://cdn.acme.example/chart.png');
        expect(html).toContain('https://cdn.acme.example/logo.png');
        expect(html).toContain('Diagram Snapshot Ready');
        expect(html).not.toContain(':::mj-block');
    });

    it('NW-4: headless .pptx ExportDeckToPptxBytes & ImportDeckFromPptxBytes round-trip with valid DrawingML theme1.xml, chart, table, hidden slides & 4:3/16:9 aspect ratio', () => {
        let deck = engine.CreateDefaultDeck('FY26 Strategy\u0007 Deck', 'deck-pptx-nw4');
        deck.AspectRatio = '4:3';
        deck.Slides[0].Title = 'Executive\u0000 Overview';
        deck.Slides[0].SpeakerNotes = 'Discuss revenue mix and gross margin.';
        deck = engine.UpsertSlideRegion(deck, deck.Slides[0].SlideID, {
            RegionID: 'pptx-table',
            Kind: 'table',
            Label: 'Regional Mix',
            MarkdownContent: '| Region | Revenue |\n| --- | --- |\n| NA | 120 |\n| EMEA | 85 |'
        }).Deck;
        deck = engine.UpsertSlideRegion(deck, deck.Slides[1].SlideID, {
            RegionID: 'pptx-chart-blk',
            Kind: 'mj-block',
            Label: 'Frozen Sales Chart',
            MarkdownContent: '',
            BlockSpec: {
                BlockID: 'blk-pptx-chart',
                Kind: 'SavedQuery',
                Mode: 'Frozen',
                Title: 'Quarterly Revenue',
                QueryName: 'QRev',
                DisplayMode: 'chart',
                ChartType: 'bar',
                FrozenSnapshot: (() => {
                    const snap = {
                        FrozenAt: '2026-01-15T10:00:00.000Z',
                        FrozenByUserID: 'u-1',
                        FrozenByUserName: 'Alice',
                        SecurityWarningAcknowledged: true,
                        Binding: { BlockID: 'blk-pptx-chart', Kind: 'SavedQuery', SourceTargetID: 'QRev' },
                        Columns: [
                            { Name: 'Quarter', DisplayName: 'Quarter', Type: 'string' },
                            { Name: 'Revenue', DisplayName: 'Revenue', Type: 'number' }
                        ],
                        Rows: [
                            { Quarter: 'Q1', Revenue: 100 },
                            { Quarter: 'Q2', Revenue: 140 }
                        ],
                        TotalRowCount: 2
                    };
                    return {
                        ...snap,
                        SnapshotContentHash: ComputeFrozenSnapshotHash(snap)
                    };
                })()
            }
        }).Deck;

        // Mark slide 3 hidden
        deck = engine.UpdateSlideMetadata(deck, deck.Slides[2].SlideID, { Hidden: true }).Deck;

        // Default excludes Hidden slide
        const pptxBytes = engine.ExportDeckToPptxBytes(deck);
        const zipEntries = SpreadsheetEngine.Instance.ExtractZipArchive(pptxBytes);
        const decode = (name: string): string => new TextDecoder().decode(zipEntries.get(name)!);

        const presXml = decode('ppt/presentation.xml');
        expect(presXml).toContain('cx="9144000"'); // 4:3 width
        expect(presXml).not.toContain('slide3.xml');

        const themeXml = decode('ppt/theme/theme1.xml');
        expect(themeXml).toContain('<a:fmtScheme');
        // Verify 3 items in each fmtScheme list (fillStyleLst, lnStyleLst, effectStyleLst, bgFillStyleLst)
        expect((themeXml.match(/<a:ln\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
        expect((themeXml.match(/<a:effectStyle>/g) ?? []).length).toBeGreaterThanOrEqual(3);
        expect(themeXml).toContain('<a:bgFillStyleLst>');

        const slide1Xml = decode('ppt/slides/slide1.xml');
        expect(slide1Xml).not.toContain('\u0000');
        expect(slide1Xml).toContain('<a:tbl>');
        expect(decode('ppt/notesSlides/notesSlide1.xml')).toContain('Discuss revenue mix');

        const chartXml = decode('ppt/charts/chart1.xml');
        expect(chartXml).toContain('<c:chartSpace');
        expect(chartXml).toContain('<c:barChart>');
        expect(chartXml).toContain('Quarterly Revenue');

        // IncludeHiddenSlides keeps hidden slide with show="0"
        const withHiddenBytes = engine.ExportDeckToPptxBytes(deck, { IncludeHiddenSlides: true });
        const withHiddenEntries = SpreadsheetEngine.Instance.ExtractZipArchive(withHiddenBytes);
        const hiddenSlideXml = new TextDecoder().decode(withHiddenEntries.get('ppt/slides/slide3.xml')!);
        expect(hiddenSlideXml).toContain('show="0"');

        // Round-trip back via ImportDeckFromPptxBytes
        const reimported = engine.ImportDeckFromPptxBytes(withHiddenBytes);
        expect(reimported.AspectRatio).toBe('4:3');
        expect(reimported.Title).toBe('FY26 Strategy Deck');
        expect(reimported.Slides.length).toBe(deck.Slides.length);
        expect(reimported.Slides[0].Title).toBe('Executive Overview');
        expect(reimported.Slides[0].SpeakerNotes).toContain('Discuss revenue mix');
        expect(reimported.Slides[2].Hidden).toBe(true);
    });

    it('S3: FreezeDeckLiveBlocksForPresentation does not re-sign already-Frozen blocks unless ForceRefreshFrozen is true', () => {
        const engine = SlideDeckEngine.Instance;
        const secret = 'test-frozen-block-hmac-secret-at-least-32-bytes!!';
        let deck = engine.CreateDefaultDeck('Frozen Preservation');
        const originalSnap = {
            FrozenAt: '2026-01-01T00:00:00.000Z',
            FrozenByUserID: 'orig-user',
            FrozenByUserName: 'Orig User',
            SecurityWarningAcknowledged: true,
            Binding: { BlockID: 'blk-already-frozen', Kind: 'SavedQuery', SourceTargetID: 'Q-orig' },
            Columns: [{ Name: 'C', DisplayName: 'C', Type: 'string' }],
            Rows: [{ C: 'original-frozen-row' }],
            TotalRowCount: 1,
        };
        const signedOrigSnap = {
            ...originalSnap,
            SnapshotContentHash: ComputeFrozenSnapshotHash(originalSnap, secret),
        };
        deck = engine.UpsertSlideRegion(deck, deck.Slides[0].SlideID, {
            RegionID: 'reg-frozen',
            Kind: 'mj-block',
            Label: 'Frozen Block',
            MarkdownContent: '',
            BlockSpec: {
                BlockID: 'blk-already-frozen',
                Kind: 'SavedQuery',
                QueryID: 'Q-orig',
                Mode: 'Frozen',
                FrozenSnapshot: signedOrigSnap,
            },
        }).Deck;

        const spoofedResult = new Map([
            [
                'blk-already-frozen',
                {
                    BlockID: 'blk-already-frozen',
                    Kind: 'SavedQuery' as const,
                    Mode: 'Live' as const,
                    Success: true,
                    Columns: [{ Name: 'C', DisplayName: 'C', Type: 'string' }],
                    Rows: [{ C: 'spoofed-overwrite-row' }],
                    TotalRowCount: 1,
                },
            ],
        ]);
        const updatedDeck = engine.FreezeDeckLiveBlocksForPresentation(
            deck,
            spoofedResult,
            { ID: 'presenter-1', Name: 'Presenter' },
            { SigningSecret: secret }
        );
        const preservedRegion = updatedDeck.Slides[0].Regions.find((r) => r.RegionID === 'reg-frozen');
        expect(preservedRegion?.BlockSpec?.FrozenSnapshot).toEqual(signedOrigSnap);
    });
});
