import { describe, it, expect } from 'vitest';
import {
    ArtifactSynthesisEngine,
    SYNTHESIS_TARGET_TYPE_NAME_MAP,
    SlideDeckEngine,
    SpreadsheetEngine,
    DocumentLiveBlockEngine,
} from '../index';

describe('ArtifactSynthesisEngine', () => {
    const engine = ArtifactSynthesisEngine.Instance;

    it('normalizes target kind aliases cleanly', () => {
        expect(engine.NormalizeTargetKind('presentation')).toBe('presentation');
        expect(engine.NormalizeTargetKind('Slides')).toBe('presentation');
        expect(engine.NormalizeTargetKind('deck')).toBe('presentation');
        expect(engine.NormalizeTargetKind('document')).toBe('document');
        expect(engine.NormalizeTargetKind('markdown document')).toBe('document');
        expect(engine.NormalizeTargetKind('spreadsheet')).toBe('spreadsheet');
        expect(engine.NormalizeTargetKind('excel spreadsheet')).toBe('spreadsheet');
        expect(engine.NormalizeTargetKind('unknown-thing')).toBe('presentation');
        expect(SYNTHESIS_TARGET_TYPE_NAME_MAP.presentation).toBe('Presentation');
        expect(SYNTHESIS_TARGET_TYPE_NAME_MAP.document).toBe('Markdown Document');
        expect(SYNTHESIS_TARGET_TYPE_NAME_MAP.spreadsheet).toBe('Excel Spreadsheet');
    });

    it('extracts digests from Markdown Document, Spreadsheet with ChartSpec, Presentation, and Whiteboard', () => {
        const mdBlock = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective({
            BlockID: 'blk-1',
            Kind: 'EntityView',
            Mode: 'Live',
            EntityName: 'MJ: Users',
            Title: 'Active Users',
        });

        const docDigest = engine.ExtractSourceDigest({
            ArtifactID: '11111111-1111-1111-1111-111111111111',
            Name: 'FY27 Strategy Brief',
            ArtifactType: 'Markdown Document',
            VersionNumber: 3,
            Content: `# Executive Summary\n\nCloud ARR grew 42% YoY.\n\n## Operating Plan\n\n${mdBlock}\n`,
        });
        expect(docDigest.Sections).toEqual(['Executive Summary', 'Operating Plan']);
        expect(docDigest.SummaryText).toContain('Cloud ARR grew 42% YoY.');
        expect(docDigest.SummaryText).toContain('Active Users');

        const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Revenue Workbook');
        const sheet = wb.Worksheets[0];
        SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'A1', { Value: 'Quarter' });
        SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'B1', { Value: 'ARR' });
        SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'A2', { Value: 'Q1' });
        SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'B2', { Value: 1250000 });
        sheet.Charts = [
            {
                ChartID: 'chart-arr-1',
                Title: 'ARR Growth by Quarter',
                ChartType: 'bar',
                SheetID: sheet.SheetID,
                SourceRange: 'A1:B2',
                PositionCell: 'D2',
            },
        ];

        const sheetDigest = engine.ExtractSourceDigest({
            ArtifactID: '22222222-2222-2222-2222-222222222222',
            Name: 'FY27 ARR Model',
            ArtifactType: 'Excel Spreadsheet',
            VersionNumber: 2,
            Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
        });
        expect(sheetDigest.EmbeddedCharts).toHaveLength(1);
        expect(sheetDigest.EmbeddedCharts[0]).toMatchObject({
            ArtifactID: '22222222-2222-2222-2222-222222222222',
            ChartID: 'chart-arr-1',
            ChartTitle: 'ARR Growth by Quarter',
            RangeAddress: 'A1:B2',
        });
        expect(sheetDigest.SummaryText).toContain('1250000');

        const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Product Roadmap');
        deck.Slides[0].Regions = [
            {
                RegionID: 'r1',
                Label: 'Key Bets',
                Kind: 'rich-text',
                MarkdownContent: 'Ship Multi-Artifact Synthesis in Q2.',
            },
        ];
        const deckDigest = engine.ExtractSourceDigest({
            ArtifactID: '33333333-3333-3333-3333-333333333333',
            Name: 'Product Roadmap Deck',
            ArtifactType: 'Presentation',
            Content: SlideDeckEngine.Instance.SerializeDeckSpec(deck),
        });
        expect(deckDigest.SummaryText).toContain('Ship Multi-Artifact Synthesis in Q2.');

        const whiteboardDigest = engine.ExtractSourceDigest({
            ArtifactID: '44444444-4444-4444-4444-444444444444',
            Name: 'System Topology',
            ArtifactType: 'Whiteboard',
            Content: JSON.stringify({
                elements: [
                    { type: 'text', text: 'API Gateway' },
                    { type: 'rectangle', text: 'Synthesis Engine' },
                ],
            }),
        });
        expect(whiteboardDigest.SummaryText).toContain('API Gateway');
        expect(whiteboardDigest.SummaryText).toContain('Synthesis Engine');
    });

    it('builds prompts referencing verified digests and chart link hints', () => {
        const sheetDigest = engine.ExtractSourceDigest({
            ArtifactID: '22222222-2222-2222-2222-222222222222',
            Name: 'ARR Model',
            ArtifactType: 'Excel Spreadsheet',
            Content: JSON.stringify({
                WorkbookID: 'wb-1',
                Title: 'ARR Model',
                Worksheets: [
                    {
                        SheetID: 's1',
                        Name: 'Summary',
                        Cells: { A1: { Value: 'Total' }, B1: { Value: 500 } },
                        Charts: [
                            {
                                ChartID: 'c1',
                                Title: 'ARR Chart',
                                ChartType: 'line',
                                SheetID: 's1',
                                SourceRange: 'A1:B4',
                                PositionCell: 'D2',
                            },
                        ],
                    },
                ],
            }),
        });

        const prompts = engine.BuildSynthesisPrompts({
            Digests: [sheetDigest],
            TargetKind: 'presentation',
            Goal: 'Create a board update deck',
            Title: 'Q1 Board Update',
            LinkChartsAndRanges: true,
        });

        expect(prompts.SystemPrompt).toContain('Multi-Artifact Synthesis AI');
        expect(prompts.SystemPrompt).toContain('ChartAndText');
        expect(prompts.UserPrompt).toContain('Create a board update deck');
        expect(prompts.UserPrompt).toContain('ChartID="c1"');
        expect(prompts.UserPrompt).toContain('22222222-2222-2222-2222-222222222222');
    });

    it('strips unverified Artifact references during presentation and document normalization', () => {
        const allowedId = '22222222-2222-2222-2222-222222222222';
        const spoofedId = '99999999-9999-9999-9999-999999999999';

        const rawDeckJson = JSON.stringify({
            Title: 'Board Synthesis',
            Description: 'Combined findings',
            Slides: [
                {
                    Layout: 'TitleAndBody',
                    Title: 'Verified & Spoofed Charts',
                    Regions: [
                        {
                            RegionID: 'r-ok',
                            Label: 'Authorized Chart',
                            Kind: 'mj-block',
                            BlockSpec: {
                                BlockID: 'b1',
                                Kind: 'Artifact',
                                Mode: 'Frozen',
                                ArtifactID: allowedId,
                                SheetChartID: 'chart-arr-1',
                                Title: 'ARR Chart',
                            },
                        },
                        {
                            RegionID: 'r-bad',
                            Label: 'Unauthorized Chart',
                            Kind: 'mj-block',
                            BlockSpec: {
                                BlockID: 'b2',
                                Kind: 'Artifact',
                                Mode: 'Live',
                                ArtifactID: spoofedId,
                                Title: 'Secret Salary Sheet',
                            },
                        },
                    ],
                },
            ],
        });

        const normalizedDeck = engine.NormalizeSynthesizedOutput({
            TargetKind: 'presentation',
            RawOutput: rawDeckJson,
            AllowedSourceArtifactIds: [allowedId],
        });

        expect(normalizedDeck.TargetKind).toBe('presentation');
        expect(normalizedDeck.LinkedChartCount).toBe(1);
        expect(normalizedDeck.Warnings.some((w) => w.includes(spoofedId))).toBe(true);
        const parsed = SlideDeckEngine.Instance.ParseDeckSpec(normalizedDeck.Content);
        expect(parsed.Slides[0].Regions).toHaveLength(1);
        expect(parsed.Slides[0].Regions[0].BlockSpec?.ArtifactID).toBe(allowedId);
        // Permissions invariant: synthesized artifact embeds are normalized to Live mode so viewer RLS applies.
        expect(parsed.Slides[0].Regions[0].BlockSpec?.Mode).toBe('Live');

        const verifiedDirective = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective({
            BlockID: 'blk-ok',
            Kind: 'Artifact',
            Mode: 'Live',
            ArtifactID: allowedId,
            SheetChartID: 'chart-arr-1',
            Title: 'ARR Chart',
        });
        const spoofedDirective = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective({
            BlockID: 'blk-bad',
            Kind: 'Artifact',
            Mode: 'Live',
            ArtifactID: spoofedId,
            Title: 'Forbidden',
        });

        const normalizedDoc = engine.NormalizeSynthesizedOutput({
            TargetKind: 'document',
            RawOutput: JSON.stringify({
                Title: 'Board Memo',
                Markdown: `# Summary\n\n${verifiedDirective}\n\n${spoofedDirective}\n`,
            }),
            AllowedSourceArtifactIds: [allowedId],
        });

        expect(normalizedDoc.LinkedChartCount).toBe(1);
        expect(normalizedDoc.Content).toContain(allowedId);
        expect(normalizedDoc.Content).not.toContain(spoofedId);
    });

    it('normalizes spreadsheet synthesis with formulas and builds deterministic fallbacks across all 3 formats', () => {
        const sheetJson = JSON.stringify({
            Title: 'Consolidated Rollup',
            Description: 'KPI summary',
            Worksheets: [
                {
                    Name: 'Rollup',
                    Headers: ['Metric', 'Q1', 'Q2', 'H1 Total'],
                    Rows: [
                        ['ARR', 100, 140, '=SUM(B2:C2)'],
                    ],
                },
            ],
        });

        const normalizedSheet = engine.NormalizeSynthesizedOutput({
            TargetKind: 'spreadsheet',
            RawOutput: sheetJson,
            AllowedSourceArtifactIds: [],
        });
        expect(normalizedSheet.TargetKind).toBe('spreadsheet');
        const wb = SpreadsheetEngine.Instance.ParseWorkbook(normalizedSheet.Content);
        expect(wb.Worksheets[0].Name).toBe('Rollup');
        expect(wb.Worksheets[0].Cells['D2'].Formula).toBe('=SUM(B2:C2)');
        expect(wb.Worksheets[0].Cells['D2'].ComputedValue).toBe(240);

        const digests = [
            engine.ExtractSourceDigest({
                ArtifactID: '22222222-2222-2222-2222-222222222222',
                Name: 'Q1 Metrics',
                ArtifactType: 'Excel Spreadsheet',
                Content: JSON.stringify({
                    WorkbookID: 'w1',
                    Title: 'Q1 Metrics',
                    Worksheets: [
                        {
                            SheetID: 's1',
                            Name: 'Revenue',
                            Cells: { A1: { Value: 'Quarter' }, B1: { Value: 'Revenue' } },
                            Charts: [
                                {
                                    ChartID: 'c1',
                                    Title: 'Revenue Chart',
                                    ChartType: 'bar',
                                    SheetID: 's1',
                                    SourceRange: 'A1:B4',
                                    PositionCell: 'D2',
                                },
                            ],
                        },
                    ],
                }),
            }),
        ];

        const fallbackDeck = engine.BuildDeterministicFallbackSynthesis(
            digests,
            'presentation',
            'Executive Rollup',
            'Summarize Q1 performance',
            true,
        );
        expect(fallbackDeck.LinkedChartCount).toBe(1);
        expect(fallbackDeck.ArtifactTypeName).toBe('Presentation');

        const fallbackDoc = engine.BuildDeterministicFallbackSynthesis(
            digests,
            'document',
            'Executive Memo',
            'Summarize Q1 performance',
            true,
        );
        expect(fallbackDoc.LinkedChartCount).toBe(1);
        expect(fallbackDoc.Content).toContain('# Executive Memo');

        const fallbackSheet = engine.BuildDeterministicFallbackSynthesis(
            digests,
            'spreadsheet',
            'Index Sheet',
            'Index Q1 assets',
            false,
        );
        expect(fallbackSheet.ArtifactTypeName).toBe('Excel Spreadsheet');
        expect(fallbackSheet.Content).toContain('Q1 Metrics');
    });
});
