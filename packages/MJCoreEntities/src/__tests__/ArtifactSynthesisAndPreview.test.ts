import { describe, expect, it } from 'vitest';
import {
    BuildArtifactPreviewSnapshot,
    BuildArtifactVersionConfigurationWithPreview,
    BuildSvgThumbnailDataUrl,
    IsValidThumbnailDataUrl,
    ParseArtifactVersionConfiguration
} from '../custom/ArtifactPreviewSnapshot';
import { ArtifactSynthesisEngine } from '../custom/ArtifactSynthesisEngine';
import { DocumentLiveBlockEngine } from '../custom/DocumentLiveBlockEngine';

describe('ArtifactPreviewSnapshot Hardening (SVG rejection, MaskLiveDataBlocks, Fence & CSS safety)', () => {
    it('IsValidThumbnailDataUrl strictly rejects image/svg+xml and accepts png/jpeg/webp base64 data URLs', () => {
        expect(IsValidThumbnailDataUrl('data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=')).toBe(false);
        expect(IsValidThumbnailDataUrl('data:image/svg+xml,<svg></svg>')).toBe(false);
        expect(IsValidThumbnailDataUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8')).toBe(true);
        expect(IsValidThumbnailDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/')).toBe(true);
        expect(IsValidThumbnailDataUrl('data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ')).toBe(true);
    });

    it('MaskLiveDataBlocks masks live spreadsheet =MJ.* formulas & LiveTableID cells and live slide mj-block regions', () => {
        const sheetJson = JSON.stringify({
            Version: 1,
            ActiveSheetID: 'sheet-1',
            Worksheets: [
                {
                    SheetID: 'sheet-1',
                    Name: 'Live Metrics',
                    LiveTables: [{ LiveTableID: 'lt-1', Mode: 'Live' }],
                    Cells: {
                        A1: { RawValue: 'Account', Formula: null },
                        B1: { RawValue: 'ARR', Formula: null },
                        A2: {
                            RawValue: 'Secret Customer Corp',
                            DisplayValue: 'Secret Customer Corp',
                            Formula: '=MJ.ENTITY("Sales", "Name")'
                        },
                        B2: {
                            RawValue: 950000,
                            DisplayValue: '$950,000',
                            Formula: null,
                            LiveTableID: 'lt-1'
                        },
                        A3: { RawValue: 'Static Header', Formula: null }
                    }
                }
            ]
        });

        const maskedSheet = BuildArtifactPreviewSnapshot(sheetJson, 'SpreadsheetArtifactViewerPlugin', 'Sheet');
        expect(maskedSheet).not.toBeNull();
        expect(maskedSheet!.Kind).toBe('sheet');
        if (maskedSheet!.Kind === 'sheet') {
            const serializedRows = JSON.stringify(maskedSheet!.Rows);
            expect(serializedRows).not.toContain('Secret Customer Corp');
            expect(serializedRows).not.toContain('$950,000');
            expect(serializedRows).toContain('•••');
            expect(serializedRows).toContain('Static Header');
        }

        const slideJson = JSON.stringify({
            Version: 1,
            Theme: 'corporate',
            Slides: [
                {
                    SlideID: 'slide-1',
                    SlideNumber: 1,
                    Layout: 'TitleAndBody',
                    Title: 'Executive Metrics',
                    Regions: [
                        {
                            RegionID: 'reg-live',
                            Label: 'Live Query',
                            Kind: 'mj-block',
                            MarkdownContent: '',
                            BlockSpec: { BlockID: 'b-1', Kind: 'SavedQuery', Mode: 'Live', QueryID: 'q-1' }
                        },
                        {
                            RegionID: 'reg-text',
                            Label: 'Notes',
                            Kind: 'rich-text',
                            MarkdownContent: 'Public summary text'
                        }
                    ]
                }
            ]
        });

        const maskedSlides = BuildArtifactPreviewSnapshot(slideJson, 'SlideDeckArtifactViewerPlugin', 'Deck');
        expect(maskedSlides).not.toBeNull();
        expect(maskedSlides!.Kind).toBe('slides');
        if (maskedSlides!.Kind === 'slides') {
            expect(maskedSlides!.SlideTitle).toBe('Executive Metrics');
            expect(maskedSlides!.LeftMetric).toBe('••• Live Data •••');
            expect(maskedSlides!.RightMetric).toBe('Public summary text');
        }
    });

    it('BuildArtifactVersionConfigurationWithPreview suppresses CapturedThumbnailDataUrl when live data exists and MaskLiveDataBlocks is true', () => {
        const pngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8';
        const docWithLiveBlock = [
            '# Revenue Brief',
            '',
            ':::mj-block',
            '{"BlockID":"blk-live","Kind":"SavedQuery","Mode":"Live","QueryID":"q-revenue"}',
            ':::'
        ].join('\n');

        const maskedConfigStr = BuildArtifactVersionConfigurationWithPreview(
            null,
            docWithLiveBlock,
            'MarkdownArtifactViewerPlugin',
            'Revenue Brief',
            { CapturedThumbnailDataUrl: pngDataUrl }
        );
        const maskedConfig = ParseArtifactVersionConfiguration(maskedConfigStr);
        expect(maskedConfig).not.toBeNull();
        // Because MaskLiveDataBlocks defaults to true and content has live mj-block, client pixel screenshot must be suppressed
        expect(maskedConfig!.thumbnailDataUrl).toBeDefined();
        expect(maskedConfig!.thumbnailDataUrl).not.toBe(pngDataUrl);
        expect(maskedConfig!.thumbnailDataUrl!.startsWith('data:image/svg+xml')).toBe(true);

        // When MaskLiveDataBlocks is explicitly false, valid PNG capture is accepted
        const unmaskedConfigStr = BuildArtifactVersionConfigurationWithPreview(
            null,
            docWithLiveBlock,
            'MarkdownArtifactViewerPlugin',
            'Revenue Brief',
            {
                CapturedThumbnailDataUrl: pngDataUrl,
                Policy: { Enabled: true, Mode: 'Rendered', MaskLiveDataBlocks: false }
            }
        );
        const unmaskedConfig = ParseArtifactVersionConfiguration(unmaskedConfigStr);
        expect(unmaskedConfig!.thumbnailDataUrl).toBe(pngDataUrl);
    });

    it('extractDocSnapshot tracks :::mj-block vs stray ::: and BuildSvgThumbnailDataUrl strips url(...) CSS injection', () => {
        const mdWithStrayColons = [
            '# Heading',
            ':::',
            'Visible line one.',
            ':::mj-block',
            '{"BlockID":"blk-1","Kind":"EntityView","Mode":"Live","EntityName":"Users"}',
            ':::',
            'Trailing visible line.'
        ].join('\n');

        const docSnap = BuildArtifactPreviewSnapshot(mdWithStrayColons, 'MarkdownArtifactViewerPlugin', 'Doc');
        expect(docSnap).not.toBeNull();
        expect(docSnap!.Kind).toBe('doc');
        if (docSnap!.Kind === 'doc') {
            expect(docSnap!.Excerpt).toContain('Visible line one.');
            expect(docSnap!.Excerpt).toContain('Trailing visible line.');
            expect(docSnap!.Excerpt).not.toContain('EntityView');
        }

        const svgDataUrl = BuildSvgThumbnailDataUrl({
            Kind: 'slides',
            SlideTitle: 'Test Deck',
            LeftMetric: 'Point 1',
            ThemeAccent: 'red; background: url(https://evil.example/leak.png)'
        });
        expect(svgDataUrl).not.toBeNull();
        const decodedSvg = Buffer.from(svgDataUrl!.replace(/^data:image\/svg\+xml;base64,/, ''), 'base64').toString('utf8');
        expect(decodedSvg.toLowerCase()).not.toContain('url(');
        expect(decodedSvg.toLowerCase()).not.toContain('evil.example');
    });
});

describe('ArtifactSynthesisEngine Security, Prompt Hygiene & Spreadsheet Fidelity', () => {
    const engine = ArtifactSynthesisEngine.Instance;
    const allowedArtifactId = '11111111-1111-4111-8111-111111111111';
    const forbiddenArtifactId = '99999999-9999-4999-8999-999999999999';

    it('BuildSynthesisPrompts emits :::mj-block syntax (never backtick ```mj-block)', () => {
        const prompts = engine.BuildSynthesisPrompts({
            Digests: [
                {
                    ArtifactID: allowedArtifactId,
                    Name: 'Q4 Sheet',
                    ArtifactType: 'Spreadsheet',
                    SummaryText: 'Revenue: $10M',
                    Sections: ['Summary'],
                    EmbeddedCharts: [
                        {
                            ArtifactID: allowedArtifactId,
                            ArtifactName: 'Q4 Sheet',
                            WorksheetName: 'Summary',
                            ChartID: 'chart-rev',
                            ChartTitle: 'Revenue Trend',
                            RangeAddress: 'A1:B6'
                        }
                    ],
                    CharCount: 20
                }
            ],
            TargetKind: 'document',
            Goal: 'Create executive board update',
            LinkChartsAndRanges: true
        });

        expect(prompts.SystemPrompt).toContain(':::mj-block');
        expect(prompts.SystemPrompt).not.toContain('```mj-block');
    });

    it('NormalizeSynthesizedOutput rejects injected EntityView/SavedQuery and unauthorized ArtifactID blocks in Markdown and Slides, strips FrozenSnapshot, and mints unique BlockIDs', () => {
        const rawDoc = [
            '# Executive Brief',
            '',
            '```mj-block',
            JSON.stringify({
                BlockID: 'dup-id',
                Kind: 'Artifact',
                Mode: 'Frozen',
                ArtifactID: allowedArtifactId,
                SheetChartID: 'chart-1',
                FrozenSnapshot: { CapturedAt: '2026-01-01T00:00:00Z', Columns: [], Rows: [{ Secret: 'forged' }], TotalRowCount: 1 }
            }),
            '```',
            '',
            ':::mj-block',
            JSON.stringify({
                BlockID: 'dup-id',
                Kind: 'Artifact',
                Mode: 'Live',
                ArtifactID: allowedArtifactId,
                SheetRange: 'A1:B10'
            }),
            ':::',
            '',
            ':::mj-block',
            JSON.stringify({ BlockID: 'bad-kind', Kind: 'EntityView', Mode: 'Live', EntityName: 'Users' }),
            ':::',
            '',
            ':::mj-block',
            JSON.stringify({ BlockID: 'bad-query', Kind: 'SavedQuery', Mode: 'Live', QueryID: 'q-secret' }),
            ':::',
            '',
            ':::mj-block',
            JSON.stringify({ BlockID: 'bad-art', Kind: 'Artifact', Mode: 'Live', ArtifactID: forbiddenArtifactId }),
            ':::'
        ].join('\n');

        const docNormalized = engine.NormalizeSynthesizedOutput({
            TargetKind: 'document',
            RawOutput: JSON.stringify({ Title: 'Exec Brief', Description: 'Summary', Content: rawDoc }),
            AllowedSourceArtifactIds: [allowedArtifactId]
        });

        expect(docNormalized.Content).not.toContain('```mj-block');
        expect(docNormalized.Content).not.toContain('EntityView');
        expect(docNormalized.Content).not.toContain('SavedQuery');
        expect(docNormalized.Content).not.toContain(forbiddenArtifactId);
        expect(docNormalized.Content).not.toContain('FrozenSnapshot');
        expect(docNormalized.Content).not.toContain('forged');
        expect(docNormalized.LinkedChartCount).toBe(2);

        const parsedSegments = DocumentLiveBlockEngine.Instance
            .ParseMarkdownDirectives(docNormalized.Content)
            .filter((s) => s.Type === 'mj-block');
        expect(parsedSegments).toHaveLength(2);
        const ids = parsedSegments.map((s) => s.BlockSpec!.BlockID);
        expect(new Set(ids).size).toBe(2); // collision-free BlockIDs
        for (const seg of parsedSegments) {
            expect(seg.BlockSpec!.Kind).toBe('Artifact');
            expect(seg.BlockSpec!.Mode).toBe('Live');
            expect(seg.BlockSpec!.FrozenSnapshot).toBeUndefined();
        }

        // Slide normalization also enforces strict block filtering + unique BlockIDs
        const rawSlides = {
            Title: 'Deck',
            Description: 'Slides',
            Slides: [
                {
                    Layout: 'TitleAndBody',
                    Title: 'Charts',
                    Regions: [
                        { RegionID: 'r1', Kind: 'mj-block', BlockSpec: { BlockID: 'dup', Kind: 'EntityView', Mode: 'Live', EntityName: 'Users' } },
                        { RegionID: 'r2', Kind: 'mj-block', BlockSpec: { BlockID: 'dup', Kind: 'Artifact', Mode: 'Live', ArtifactID: forbiddenArtifactId } },
                        {
                            RegionID: 'r3',
                            Kind: 'mj-block',
                            BlockSpec: {
                                BlockID: 'dup',
                                Kind: 'Artifact',
                                Mode: 'Frozen',
                                ArtifactID: allowedArtifactId,
                                FrozenSnapshot: { Rows: [{ forged: true }] }
                            }
                        },
                        { RegionID: 'r4', Kind: 'mj-block', BlockSpec: { BlockID: 'dup', Kind: 'Artifact', Mode: 'Live', ArtifactID: allowedArtifactId, SheetRange: 'A1:C5' } }
                    ]
                }
            ]
        };
        const slidesNormalized = engine.NormalizeSynthesizedOutput({
            TargetKind: 'presentation',
            RawOutput: JSON.stringify(rawSlides),
            AllowedSourceArtifactIds: [allowedArtifactId]
        });
        expect(slidesNormalized.LinkedChartCount).toBe(2);
        const parsedDeck = JSON.parse(slidesNormalized.Content) as {
            Slides: Array<{ Regions: Array<{ RegionID: string; Kind: string; BlockSpec?: { BlockID: string; Mode: string; FrozenSnapshot?: object } }> }>;
        };
        const keptRegions = parsedDeck.Slides[0]!.Regions;
        expect(keptRegions).toHaveLength(2);
        const slideBlockIds = keptRegions.map((r) => r.BlockSpec!.BlockID);
        expect(new Set(slideBlockIds).size).toBe(2);
        expect(keptRegions[0]!.BlockSpec!.Mode).toBe('Live');
        expect(keptRegions[0]!.BlockSpec!.FrozenSnapshot).toBeUndefined();
    });

    it('NormalizeSynthesizedOutput preserves columns past Z (AA, AB) and keeps Formula=null on non-formula literal cells', () => {
        const wideColumns = Array.from({ length: 28 }, (_, i) => `Col${i + 1}`);
        const wideRow = Array.from({ length: 28 }, (_, i) => i + 1);
        const sheetOutput = engine.NormalizeSynthesizedOutput({
            TargetKind: 'spreadsheet',
            RawOutput: JSON.stringify({
                Title: 'Wide Sheet',
                Description: '28 columns',
                Worksheets: [
                    {
                        Name: 'Data',
                        Headers: wideColumns,
                        Rows: [wideRow]
                    }
                ]
            }),
            AllowedSourceArtifactIds: [allowedArtifactId]
        });

        const parsed = JSON.parse(sheetOutput.Content) as {
            Worksheets: Array<{ Cells: Record<string, { RawValue: string | number | null; Formula: string | null }> }>;
        };
        const cells = parsed.Worksheets[0]!.Cells;
        expect(cells['AA1']?.RawValue).toBe('Col27');
        expect(cells['AB1']?.RawValue).toBe('Col28');
        expect(cells['AB2']?.RawValue).toBe(28);

        // BuildDeterministicFallbackSynthesis must emit explicit Formula: null on literal source text
        const fallback = engine.BuildDeterministicFallbackSynthesis(
            [
                {
                    ArtifactID: allowedArtifactId,
                    Name: 'Notes',
                    ArtifactType: 'Markdown Document',
                    SummaryText: '=HYPERLINK("http://evil.example")',
                    Sections: ['=IMPORTXML(...)'],
                    EmbeddedCharts: [],
                    CharCount: 40
                }
            ],
            'spreadsheet',
            'Summarize notes',
            'Fallback Sheet'
        );
        const fallbackWorkbook = JSON.parse(fallback.Content) as {
            Worksheets: Array<{ Cells: Record<string, { RawValue: string | number | null; Formula: string | null }> }>;
        };
        const row2Cells = Object.entries(fallbackWorkbook.Worksheets[0]!.Cells).filter(([ref]) => ref.endsWith('2'));
        expect(row2Cells.length).toBeGreaterThan(0);
        for (const [, cell] of row2Cells) {
            expect(cell.Formula).toBeNull();
        }
    });

    it('ExtractSourceDigest samples both head rows and summary/tail rows beyond row 12 (P2-2)', () => {
        const cells: Record<string, { RawValue: string | number; Formula: string | null }> = {
            A1: { RawValue: 'Item', Formula: null },
            B1: { RawValue: 'Amount', Formula: null }
        };
        for (let r = 2; r <= 24; r++) {
            cells[`A${r}`] = { RawValue: `LineItem-${r}`, Formula: null };
            cells[`B${r}`] = { RawValue: r * 10, Formula: null };
        }
        cells['A25'] = { RawValue: 'Grand Total', Formula: null };
        cells['B25'] = { RawValue: 3000, Formula: '=SUM(B2:B24)' };

        const digest = engine.ExtractSourceDigest({
            ArtifactID: allowedArtifactId,
            Name: 'Monthly Ledger',
            ArtifactType: 'Spreadsheet',
            Content: JSON.stringify({
                Version: 1,
                ActiveSheetID: 's1',
                Worksheets: [{ SheetID: 's1', Name: 'Ledger', Cells: cells }]
            })
        });

        expect(digest.SummaryText).toContain('LineItem-2');
        expect(digest.SummaryText).toContain('Grand Total');
        expect(digest.SummaryText).toContain('2990');
    });
});
