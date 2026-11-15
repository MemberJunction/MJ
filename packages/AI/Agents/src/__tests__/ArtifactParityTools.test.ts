import { describe, it, expect, vi, afterEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ArtifactToolExecutionContext } from '@memberjunction/ai-core-plus';
import {
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    SlideDeckEngine,
    SpreadsheetCellStyleSpec,
    SpreadsheetEngine
} from '@memberjunction/core-entities';
import { DocumentToolLibrary } from '../artifact-tools/DocumentToolLibrary';
import { SlideDeckToolLibrary } from '../artifact-tools/SlideDeckToolLibrary';
import { SpreadsheetToolLibrary } from '../artifact-tools/SpreadsheetToolLibrary';

describe('Artifact Tool Libraries — SLICE B Parity & Security Suite', () => {
    const VALID_WB_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const VALID_SHEET_UUID = '11111111-2222-4333-8444-555555555555';
    const VALID_VERSION_UUID = '99999999-8888-4777-8666-555555555555';
    const shortIdContext = {
        resolveArtifactId: (ref: string): string | null => {
            if (ref === 'D') return VALID_WB_UUID;
            if (ref === 'S') return VALID_SHEET_UUID;
            return null;
        },
        resolveVersionId: (ref: string): string | null => {
            if (ref === 'E') return VALID_VERSION_UUID;
            return null;
        }
    };

    describe('DocumentToolLibrary [B-P0-2] & [B-P1-1]', () => {
        it('preserves $100/$& patterns when normalizing short-ID mj-block directives', async () => {
            const lib = new DocumentToolLibrary();
            const directive = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective({
                BlockID: 'blk-dollar',
                Kind: 'Artifact',
                Mode: 'Live',
                Title: 'Revenue $100M & Margin $& Plan',
                ArtifactID: 'D',
                ArtifactType: 'Whiteboard',
                EmbedMode: 'Inline'
            });

            const res = await lib.InvokeTool(
                'insert_block_after',
                { markdown: directive },
                '# Header',
                shortIdContext
            );
            expect(res.success).toBe(true);
            const updatedContent = (res.data as { updatedContent: string }).updatedContent;
            expect(updatedContent).toContain(VALID_WB_UUID);
            expect(updatedContent).toContain('Revenue $100M & Margin $& Plan');
        });

        it('does not expose deferred propose_suggestion tool', async () => {
            const lib = new DocumentToolLibrary();
            expect(lib.GetToolList().some((t) => t.name === 'propose_suggestion')).toBe(false);
            const res = await lib.InvokeTool(
                'propose_suggestion',
                { targetBlockId: 'blk-1', proposedMarkdown: 'New', rationale: 'Test' },
                '# Title'
            );
            expect(res.success).toBe(false);
            expect(res.errorMessage).toContain('Unknown tool');
        });

        it('supports upsert_table alignments, expanded insert_live_block, embed_artifact_block (replaceBlockId + sheet fields), move_block, and duplicate_block', async () => {
            const lib = new DocumentToolLibrary();
            const tableRes = await lib.InvokeTool(
                'upsert_table',
                {
                    headers: ['Name', 'Score', 'Notes'],
                    rows: [['Alpha', '99', 'Good']],
                    alignments: ['left', 'right', 'center']
                },
                '# Report'
            );
            expect(tableRes.success).toBe(true);
            const doc1 = (tableRes.data as { updatedContent: string }).updatedContent;
            expect(doc1).toContain('| :--- | ---: | :---: |');

            const liveRes = await lib.InvokeTool(
                'insert_live_block',
                {
                    kind: 'EntityView',
                    title: 'Sales Chart',
                    entityName: 'Deals',
                    viewName: 'Open Pipeline',
                    maxRows: 25,
                    displayMode: 'chart',
                    chartType: 'bar',
                    categoryField: 'Stage',
                    valueFields: ['Amount']
                },
                doc1
            );
            expect(liveRes.success).toBe(true);
            const liveBlockId = (liveRes.data as { blockId: string }).blockId;
            const doc2 = (liveRes.data as { updatedContent: string }).updatedContent;
            expect(doc2).toContain('"ViewName": "Open Pipeline"');
            expect(doc2).toContain('"MaxRows": 25');
            expect(doc2).toContain('"DisplayMode": "chart"');
            expect(doc2).toContain('"ChartType": "bar"');
            expect(doc2).toContain('"CategoryField": "Stage"');
            expect(doc2).toContain('"ValueFields": [\n    "Amount"\n  ]');

            const blocks2 = lib.ParseLogicalBlocks(doc2);
            const tableBlock = blocks2.find((b) => b.kind === 'table');
            expect(tableBlock).toBeTruthy();

            const embedReplaceRes = await lib.InvokeTool(
                'embed_artifact_block',
                {
                    artifactId: 'S',
                    artifactType: 'Excel Spreadsheet',
                    sheetName: 'Summary',
                    range: 'A1:C5',
                    chartId: 'chart-1',
                    displayMode: 'chart',
                    replaceBlockId: tableBlock!.blockId
                },
                doc2,
                shortIdContext
            );
            expect(embedReplaceRes.success).toBe(true);
            const doc3 = (embedReplaceRes.data as { updatedContent: string }).updatedContent;
            expect(doc3).toContain(`"ArtifactID": "${VALID_SHEET_UUID}"`);
            expect(doc3).toContain('"SheetID": "Summary"');
            expect(doc3).toContain('"SheetRange": "A1:C5"');
            expect(doc3).toContain('"SheetChartID": "chart-1"');
            expect(doc3).toContain('"DisplayMode": "chart"');

            const dupRes = await lib.InvokeTool(
                'duplicate_block',
                { blockId: liveBlockId },
                doc3
            );
            expect(dupRes.success).toBe(true);
            const dupData = dupRes.data as { blockId: string; updatedContent: string };
            expect(dupData.blockId).not.toBe(liveBlockId);
            const blocksAfterDup = lib.ParseLogicalBlocks(dupData.updatedContent);
            expect(blocksAfterDup.filter((b) => b.kind === 'mj-block').length).toBe(3);

            const moveRes = await lib.InvokeTool(
                'move_block',
                { blockId: dupData.blockId, afterBlockId: 'START' },
                dupData.updatedContent
            );
            expect(moveRes.success).toBe(true);
            const movedBlocks = lib.ParseLogicalBlocks((moveRes.data as { updatedContent: string }).updatedContent);
            expect(movedBlocks[0].blockId).toBe(dupData.blockId);
        });
    });

    describe('SlideDeckToolLibrary [B-P1-2]', () => {
        it('supports imageUrl/imageAlt, full mjBlock fields, duplicate_slide, update_deck_metadata, short IDs in add_slide/generate_deck_from_markdown, and expectedRevisionHash on all mutators', async () => {
            const deckEngine = SlideDeckEngine.Instance;
            const deck = deckEngine.CreateDefaultDeck('Initial Deck', 'deck-b');
            const initialJson = deckEngine.SerializeDeckSpec(deck);
            const lib = new SlideDeckToolLibrary();

            const initRead = await lib.InvokeTool('read_deck', {}, initialJson);
            const rev0 = (initRead.data as { revisionHash: string }).revisionHash;

            // Stale expectedRevisionHash rejected on mutating tools
            const staleAdd = await lib.InvokeTool(
                'add_slide',
                { title: 'Should Fail', expectedRevisionHash: 'bad-rev' },
                initialJson
            );
            expect(staleAdd.success).toBe(false);
            expect(staleAdd.errorMessage).toContain('Stale revision hash');

            // add_slide resolves short artifact ID inside markdownContent
            const blockDirective = DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective({
                BlockID: 'wb-slide-block',
                Kind: 'Artifact',
                Mode: 'Live',
                Title: 'Arch $100 Whiteboard',
                ArtifactID: 'D',
                ArtifactType: 'Whiteboard',
                EmbedMode: 'Inline'
            });
            const addRes = await lib.InvokeTool(
                'add_slide',
                {
                    slideId: 'slide-custom',
                    title: 'Architecture',
                    markdownContent: blockDirective,
                    expectedRevisionHash: rev0
                },
                initialJson,
                shortIdContext
            );
            expect(addRes.success).toBe(true);
            const afterAdd = addRes.data as { updatedContent: string; revisionHash: string };
            expect(afterAdd.updatedContent).toContain(VALID_WB_UUID);
            expect(afterAdd.updatedContent).toContain('Arch $100 Whiteboard');

            // upsert_slide_element sets imageUrl/imageAlt and forwards full mjBlock fields
            const imgRes = await lib.InvokeTool(
                'update_slide_region',
                {
                    slideId: 'slide-custom',
                    regionId: 'main',
                    kind: 'image',
                    imageUrl: 'https://example.com/chart.png',
                    imageAlt: 'Quarterly growth chart',
                    expectedRevisionHash: afterAdd.revisionHash
                },
                afterAdd.updatedContent
            );
            expect(imgRes.success).toBe(true);
            const afterImg = imgRes.data as {
                updatedRegion: { ImageUrl?: string; ImageAlt?: string };
                updatedContent: string;
                revisionHash: string;
            };
            expect(afterImg.updatedRegion.ImageUrl).toBe('https://example.com/chart.png');
            expect(afterImg.updatedRegion.ImageAlt).toBe('Quarterly growth chart');

            const mjRes = await lib.InvokeTool(
                'upsert_slide_element',
                {
                    slideId: 'slide-custom',
                    regionId: 'sheet-embed',
                    mjBlock: {
                        Kind: 'Artifact',
                        ArtifactID: 'S',
                        ArtifactType: 'Excel Spreadsheet',
                        VersionID: 'E',
                        SheetName: 'Q4',
                        Range: 'A1:B4',
                        ChartID: 'chart-2',
                        DisplayMode: 'chart',
                        MaxRows: 50,
                        Fields: ['Month', 'Revenue'],
                        Parameters: { Year: 2026 }
                    },
                    expectedRevisionHash: afterImg.revisionHash
                },
                afterImg.updatedContent,
                shortIdContext
            );
            expect(mjRes.success).toBe(true);
            const afterMj = mjRes.data as {
                updatedRegion: { BlockSpec?: DocumentBlockSpec };
                updatedContent: string;
                revisionHash: string;
            };
            expect(afterMj.updatedRegion.BlockSpec?.ArtifactID).toBe(VALID_SHEET_UUID);
            expect(afterMj.updatedRegion.BlockSpec?.VersionID).toBe(VALID_VERSION_UUID);
            expect(afterMj.updatedRegion.BlockSpec?.SheetID).toBe('Q4');
            expect(afterMj.updatedRegion.BlockSpec?.SheetRange).toBe('A1:B4');
            expect(afterMj.updatedRegion.BlockSpec?.SheetChartID).toBe('chart-2');
            expect(afterMj.updatedRegion.BlockSpec?.DisplayMode).toBe('chart');
            expect(afterMj.updatedRegion.BlockSpec?.MaxRows).toBe(50);
            expect(afterMj.updatedRegion.BlockSpec?.Fields).toEqual(['Month', 'Revenue']);

            // duplicate_slide creates new slide with unique IDs
            const dupRes = await lib.InvokeTool(
                'duplicate_slide',
                {
                    slideId: 'slide-custom',
                    title: 'Architecture Backup',
                    expectedRevisionHash: afterMj.revisionHash
                },
                afterMj.updatedContent
            );
            expect(dupRes.success).toBe(true);
            const afterDup = dupRes.data as {
                duplicatedSlide: { SlideID: string; Title: string };
                slideCount: number;
                updatedContent: string;
                revisionHash: string;
            };
            expect(afterDup.duplicatedSlide.SlideID).not.toBe('slide-custom');
            expect(afterDup.duplicatedSlide.Title).toBe('Architecture Backup');
            expect(afterDup.slideCount).toBe(deck.Slides.length + 2);

            // Stale expectedRevisionHash rejected across all remaining SlideDeck mutators
            for (const [toolName, staleArgs] of [
                ['update_slide', { slideId: 'slide-custom', title: 'X' }],
                ['delete_slide', { slideId: 'slide-custom' }],
                ['duplicate_slide', { slideId: 'slide-custom' }],
                ['reorder_slides', { slideIds: ['slide-custom'] }],
                ['upsert_slide_element', { slideId: 'slide-custom', regionId: 'main', markdownContent: 'x' }],
                ['update_slide_region', { slideId: 'slide-custom', regionId: 'main', markdownContent: 'x' }],
                ['delete_slide_element', { slideId: 'slide-custom', regionId: 'main' }],
                ['update_speaker_notes', { slideId: 'slide-custom', speakerNotes: 'x' }],
                ['update_deck_metadata', { title: 'X' }],
                ['apply_theme', { themeId: 'executive-slate' }],
                ['generate_deck_from_markdown', { markdown: '# X' }]
            ] as const) {
                const staleRes = await lib.InvokeTool(
                    toolName,
                    { ...staleArgs, expectedRevisionHash: 'stale-rev' },
                    afterDup.updatedContent
                );
                expect(staleRes.success).toBe(false);
                expect(staleRes.errorMessage).toContain('Stale revision hash');
            }

            // update_deck_metadata updates title, aspectRatio, and master chrome
            const metaRes = await lib.InvokeTool(
                'update_deck_metadata',
                {
                    title: 'Q4 Board Deck',
                    subtitle: 'Confidential',
                    aspectRatio: '4:3',
                    footerText: 'Internal Only',
                    showSlideNumbers: true,
                    expectedRevisionHash: afterDup.revisionHash
                },
                afterDup.updatedContent
            );
            expect(metaRes.success).toBe(true);
            const afterMeta = metaRes.data as {
                title: string;
                aspectRatio: string;
                master: { FooterText?: string };
                updatedContent: string;
                revisionHash: string;
            };
            expect(afterMeta.title).toBe('Q4 Board Deck');
            expect(afterMeta.aspectRatio).toBe('4:3');
            expect(afterMeta.master.FooterText).toBe('Internal Only');

            // generate_deck_from_markdown resolves short artifact IDs cleanly
            const genRes = await lib.InvokeTool(
                'generate_deck_from_markdown',
                {
                    markdown: `# Overview\n\n${blockDirective}`,
                    expectedRevisionHash: afterMeta.revisionHash
                },
                afterMeta.updatedContent,
                shortIdContext
            );
            expect(genRes.success).toBe(true);
            expect((genRes.data as { updatedContent: string }).updatedContent).toContain(VALID_WB_UUID);
        });
    });

    describe('SpreadsheetToolLibrary [B-P1-3]', () => {
        it('preserves existing cell styles in write_cells, supports rich styles + format_range, returns style in read_range, and supports clear_range modes', async () => {
            const engine = SpreadsheetEngine.Instance;
            const wb = engine.CreateEmptyWorkbook('Formatting Test', ['Sheet 1']);
            const lib = new SpreadsheetToolLibrary();
            let content = engine.SerializeWorkbook(wb);

            const write1 = await lib.InvokeTool(
                'write_cells',
                {
                    sheet: 'Sheet 1',
                    cells: [
                        {
                            address: 'B2',
                            value: 1250.5,
                            formatType: 'currency',
                            bold: true,
                            italic: true,
                            horizontalAlign: 'right',
                            textColor: '#111827',
                            backgroundColor: '#FEF3C7',
                            note: 'Revenue cell'
                        }
                    ]
                },
                content
            );
            expect(write1.success).toBe(true);
            content = (write1.data as { updatedContent: string }).updatedContent;

            // Updating value alone MUST preserve existing Style (bold, italic, colors, currency)
            const write2 = await lib.InvokeTool(
                'write_cells',
                {
                    sheet: 'Sheet 1',
                    cells: [{ address: 'B2', value: 2500 }]
                },
                content
            );
            expect(write2.success).toBe(true);
            content = (write2.data as { updatedContent: string }).updatedContent;

            const readRes = await lib.InvokeTool('read_range', { sheet: 'Sheet 1', range: 'B2' }, content);
            expect(readRes.success).toBe(true);
            const cellStyle = (readRes.data as { cell: { style: SpreadsheetCellStyleSpec | null; computedValue: number } }).cell;
            expect(cellStyle.computedValue).toBe(2500);
            expect(cellStyle.style?.Bold).toBe(true);
            expect(cellStyle.style?.Italic).toBe(true);
            expect(cellStyle.style?.FormatType).toBe('currency');
            expect(cellStyle.style?.HorizontalAlign).toBe('right');
            expect(cellStyle.style?.TextColor).toBe('#111827');
            expect(cellStyle.style?.BackgroundColor).toBe('#FEF3C7');

            // format_range formats an entire range without wiping values
            const fmtRes = await lib.InvokeTool(
                'format_range',
                {
                    sheet: 'Sheet 1',
                    range: 'B2:C3',
                    horizontalAlign: 'center',
                    backgroundColor: '#E0F2FE'
                },
                content
            );
            expect(fmtRes.success).toBe(true);
            content = (fmtRes.data as { updatedContent: string }).updatedContent;

            const readB2AfterFmt = await lib.InvokeTool('read_range', { sheet: 'Sheet 1', range: 'B2' }, content);
            const b2Cell = (readB2AfterFmt.data as { cell: { computedValue: number; style: SpreadsheetCellStyleSpec } }).cell;
            expect(b2Cell.computedValue).toBe(2500);
            expect(b2Cell.style.Bold).toBe(true);
            expect(b2Cell.style.HorizontalAlign).toBe('center');
            expect(b2Cell.style.BackgroundColor).toBe('#E0F2FE');

            // clear_range mode='values' keeps style & note
            const clearValues = await lib.InvokeTool(
                'clear_range',
                { sheet: 'Sheet 1', range: 'B2', mode: 'values' },
                content
            );
            expect(clearValues.success).toBe(true);
            content = (clearValues.data as { updatedContent: string }).updatedContent;
            const parsedAfterValClear = engine.ParseWorkbook(content);
            expect(parsedAfterValClear.Worksheets[0].Cells['B2'].RawValue).toBeNull();
            expect(parsedAfterValClear.Worksheets[0].Cells['B2'].Style?.Bold).toBe(true);
            expect(parsedAfterValClear.Worksheets[0].Cells['B2'].Note).toBe('Revenue cell');

            // clear_range mode='notes' clears note, keeps style
            const clearNotes = await lib.InvokeTool(
                'clear_range',
                { sheet: 'Sheet 1', range: 'B2', mode: 'notes' },
                content
            );
            expect(clearNotes.success).toBe(true);
            content = (clearNotes.data as { updatedContent: string }).updatedContent;
            expect(engine.ParseWorkbook(content).Worksheets[0].Cells['B2'].Note).toBeNull();

            // clear_range mode='formats' clears style
            const clearFormats = await lib.InvokeTool(
                'clear_range',
                { sheet: 'Sheet 1', range: 'B2:C3', mode: 'formats' },
                content
            );
            expect(clearFormats.success).toBe(true);
            content = (clearFormats.data as { updatedContent: string }).updatedContent;
            expect(engine.ParseWorkbook(content).Worksheets[0].Cells['B2'].Style).toBeUndefined();
        });

        it('supports delete_rows, delete_columns, delete_chart, delete_live_table, delete_embedded_artifact, set_sheet_layout, duplicate_sheet, reorder_sheets, upsert_chart offsetX/Y, embed_artifact sizing, and protectedRanges in outline', async () => {
            const engine = SpreadsheetEngine.Instance;
            const wb = engine.CreateEmptyWorkbook('Structure Test', ['Data']);
            engine.SetCell(wb, 'Data', 'A1', { Value: 'Item' }, false);
            engine.SetCell(wb, 'Data', 'B1', { Value: 'DropMe' }, false);
            engine.SetCell(wb, 'Data', 'C1', { Value: 'Val' }, false);
            engine.SetCell(wb, 'Data', 'A2', { Value: 'RowDrop' }, false);
            engine.SetCell(wb, 'Data', 'C2', { Value: 10 }, false);
            engine.SetCell(wb, 'Data', 'A3', { Value: 'Keep' }, false);
            engine.SetCell(wb, 'Data', 'C3', { Value: 42 }, false);
            engine.AddProtectedRange(wb, 'Data', {
                RangeID: 'prot-1',
                Range: 'D5:E6',
                LockedByUserID: '11111111-1111-1111-1111-111111111111',
                AllowEditors: false
            });

            const lib = new SpreadsheetToolLibrary();
            let content = engine.SerializeWorkbook(wb);

            // get_workbook_outline includes protectedRanges
            const outlineRes = await lib.InvokeTool('get_workbook_outline', {}, content);
            expect(outlineRes.success).toBe(true);
            const sheets = (outlineRes.data as { sheets: Array<{ protectedRanges: Array<{ RangeID: string }> }> }).sheets;
            expect(sheets[0].protectedRanges).toHaveLength(1);
            expect(sheets[0].protectedRanges[0].RangeID).toBe('prot-1');

            // delete_rows & delete_columns shift surviving cells cleanly
            const delRowRes = await lib.InvokeTool(
                'delete_rows',
                { sheet: 'Data', atRowNumber: 2, count: 1 },
                content
            );
            expect(delRowRes.success).toBe(true);
            content = (delRowRes.data as { updatedContent: string }).updatedContent;

            const delColRes = await lib.InvokeTool(
                'delete_columns',
                { sheet: 'Data', atColumnNumber: 2, count: 1 },
                content
            );
            expect(delColRes.success).toBe(true);
            content = (delColRes.data as { updatedContent: string }).updatedContent;
            expect(engine.ParseWorkbook(content).Worksheets[0].Cells['B2']?.RawValue).toBe(42);

            // set_sheet_layout
            const layoutRes = await lib.InvokeTool(
                'set_sheet_layout',
                {
                    sheet: 'Data',
                    frozenRows: 1,
                    frozenColumns: 1,
                    rowHeights: [{ rowNumber: 1, height: 36 }],
                    columnWidths: [{ column: 'A', width: 220 }]
                },
                content
            );
            expect(layoutRes.success).toBe(true);
            content = (layoutRes.data as { updatedContent: string }).updatedContent;
            const afterLayout = engine.ParseWorkbook(content).Worksheets[0];
            expect(afterLayout.FrozenRows).toBe(1);
            expect(afterLayout.FrozenColumns).toBe(1);
            expect(afterLayout.Rows[0].Height).toBe(36);
            expect(afterLayout.Columns[0].Width).toBe(220);

            // upsert_chart offsetX/offsetY + delete_chart
            const chartRes = await lib.InvokeTool(
                'upsert_chart',
                {
                    sheet: 'Data',
                    chartId: 'c-main',
                    sourceRange: 'A1:B2',
                    placement: 'sheet',
                    offsetX: 18,
                    offsetY: 24
                },
                content
            );
            expect(chartRes.success).toBe(true);
            const chartData = chartRes.data as {
                chart: { OffsetX?: number; OffsetY?: number };
                updatedContent: string;
            };
            expect(chartData.chart.OffsetX).toBe(18);
            expect(chartData.chart.OffsetY).toBe(24);
            content = chartData.updatedContent;

            // embed_artifact versionId/widthPx/heightPx/allowInlineEdit
            const embedRes = await lib.InvokeTool(
                'embed_artifact',
                {
                    sheet: 'Data',
                    embedId: 'emb-1',
                    artifactId: 'D',
                    versionId: 'E',
                    widthPx: 640,
                    heightPx: 400,
                    allowInlineEdit: false
                },
                content,
                shortIdContext
            );
            expect(embedRes.success).toBe(true);
            const embedData = embedRes.data as {
                embeddedArtifact: {
                    ArtifactVersionID?: string | null;
                    WidthPx: number;
                    HeightPx: number;
                    AllowInlineEdit: boolean;
                };
                updatedContent: string;
            };
            expect(embedData.embeddedArtifact.ArtifactVersionID).toBe(VALID_VERSION_UUID);
            expect(embedData.embeddedArtifact.WidthPx).toBe(640);
            expect(embedData.embeddedArtifact.HeightPx).toBe(400);
            expect(embedData.embeddedArtifact.AllowInlineEdit).toBe(false);
            content = embedData.updatedContent;

            const badVersionRes = await lib.InvokeTool(
                'embed_artifact',
                {
                    sheet: 'Data',
                    embedId: 'emb-bad-ver',
                    artifactId: 'D',
                    versionId: 'v-99'
                },
                content,
                shortIdContext
            );
            expect(badVersionRes.success).toBe(false);
            expect(badVersionRes.errorMessage).toContain('MJ: Artifact Versions UUID');

            // upsert_live_table -> duplicate_sheet -> reorder_sheets -> deletions
            const liveTblRes = await lib.InvokeTool(
                'upsert_live_table',
                {
                    sheet: 'Data',
                    tableId: 'tbl-main',
                    sourceType: 'EntityView',
                    entityName: 'MJ: Users'
                },
                content
            );
            expect(liveTblRes.success).toBe(true);
            content = (liveTblRes.data as { updatedContent: string }).updatedContent;

            const dupSheetRes = await lib.InvokeTool(
                'duplicate_sheet',
                { sheet: 'Data', newName: 'Data Backup' },
                content
            );
            expect(dupSheetRes.success).toBe(true);
            const dupSheetData = dupSheetRes.data as {
                sheetId: string;
                name: string;
                sheetCount: number;
                updatedContent: string;
            };
            expect(dupSheetData.name).toBe('Data Backup');
            expect(dupSheetData.sheetCount).toBe(2);
            content = dupSheetData.updatedContent;

            const reorderRes = await lib.InvokeTool(
                'reorder_sheets',
                { sheetIds: ['Data Backup', 'Data'] },
                content
            );
            expect(reorderRes.success).toBe(true);
            const reorderData = reorderRes.data as {
                orderedSheets: Array<{ name: string }>;
                updatedContent: string;
            };
            expect(reorderData.orderedSheets.map((s) => s.name)).toEqual(['Data Backup', 'Data']);
            content = reorderData.updatedContent;

            const delChart = await lib.InvokeTool('delete_chart', { sheet: 'Data', chartId: 'c-main' }, content);
            expect(delChart.success).toBe(true);
            content = (delChart.data as { updatedContent: string }).updatedContent;
            expect(engine.ParseWorkbook(content).Worksheets[1].Charts).toHaveLength(0);

            const delEmbed = await lib.InvokeTool(
                'delete_embedded_artifact',
                { sheet: 'Data', embedId: 'emb-1' },
                content
            );
            expect(delEmbed.success).toBe(true);
            content = (delEmbed.data as { updatedContent: string }).updatedContent;
            expect(engine.ParseWorkbook(content).Worksheets[1].EmbeddedArtifacts).toHaveLength(0);

            const delTbl = await lib.InvokeTool(
                'delete_live_table',
                { sheet: 'Data', tableId: 'tbl-main' },
                content
            );
            expect(delTbl.success).toBe(true);
            content = (delTbl.data as { updatedContent: string }).updatedContent;
            expect(engine.ParseWorkbook(content).Worksheets[1].LiveTables).toHaveLength(0);
        });
    });

    describe('SpreadsheetToolLibrary [R2-P1-2] ProtectedRanges lock enforcement', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        const ownerId = '11111111-1111-4111-8111-111111111111';
        const nonOwnerId = '22222222-2222-4222-8222-222222222222';
        const mockProvider = {} as IMetadataProvider;
        const makeUser = (id: string): UserInfo => ({ ID: id, Name: id } as UserInfo);
        const ownerCtx: ArtifactToolExecutionContext = {
            actorUserId: ownerId,
            ownerUserId: ownerId,
            isEditor: true,
            contextUser: makeUser(ownerId),
            provider: mockProvider
        };
        const nonOwnerEditorCtx: ArtifactToolExecutionContext = {
            actorUserId: nonOwnerId,
            ownerUserId: ownerId,
            isEditor: true,
            contextUser: makeUser(nonOwnerId),
            provider: mockProvider
        };

        it('blocks non-owner delete_sheet when sheet contains non-editable ProtectedRanges and allows owner', async () => {
            const engine = SpreadsheetEngine.Instance;
            const wb = engine.CreateEmptyWorkbook('SheetDeleteLock', ['Summary', 'LockedTab']);
            engine.AddProtectedRange(wb, 'LockedTab', {
                RangeID: 'prot-tab',
                Range: 'B2:C4',
                LockedByUserID: ownerId,
                AllowEditors: false
            });
            const lib = new SpreadsheetToolLibrary();
            const content = engine.SerializeWorkbook(wb);

            const blockedRes = await lib.InvokeTool(
                'delete_sheet',
                { sheet: 'LockedTab' },
                content,
                nonOwnerEditorCtx
            );
            expect(blockedRes.success).toBe(false);
            expect(blockedRes.errorMessage).toContain('protected range');

            const ownerRes = await lib.InvokeTool(
                'delete_sheet',
                { sheet: 'LockedTab' },
                content,
                ownerCtx
            );
            expect(ownerRes.success).toBe(true);
            const afterOwner = engine.ParseWorkbook((ownerRes.data as { updatedContent: string }).updatedContent);
            expect(afterOwner.Worksheets.map((w) => w.Name)).toEqual(['Summary']);
        });

        it('blocks non-owner upsert_live_table and refresh_live_tables when target footprint intersects ProtectedRanges', async () => {
            const engine = SpreadsheetEngine.Instance;
            const wb = engine.CreateEmptyWorkbook('LiveTableLock', ['Sheet1']);
            engine.AddProtectedRange(wb, 'Sheet1', {
                RangeID: 'prot-tbl',
                Range: 'C2:D4',
                LockedByUserID: ownerId,
                AllowEditors: false
            });
            const lib = new SpreadsheetToolLibrary();
            const content = engine.SerializeWorkbook(wb);

            const execSpy = vi.spyOn(DocumentLiveBlockEngine.Instance, 'ExecuteBlock').mockImplementation(async (block) => ({
                BlockID: block.BlockID,
                Kind: block.Kind,
                Mode: 'Live',
                Title: block.Title,
                Success: true,
                ExecutedAt: '2026-11-15T00:00:00Z',
                Columns: [
                    { Name: 'Name', Type: 'string' },
                    { Name: 'Code', Type: 'string' },
                    { Name: 'Score', Type: 'number' }
                ],
                Rows: [
                    { Name: 'Alpha', Code: 'A', Score: 10 },
                    { Name: 'Beta', Code: 'B', Score: 99 }
                ],
                TotalRowCount: 2,
                Truncated: false
            }));
            vi.spyOn(engine, 'EvaluateMjCustomFunctions').mockResolvedValue({
                EvaluatedCount: 0,
                AccessDeniedCount: 0,
                SkippedCount: 0,
                Errors: []
            });

            // 1. Pre-materialization block when anchorCell itself is inside ProtectedRanges
            const directAnchorBlock = await lib.InvokeTool(
                'upsert_live_table',
                {
                    sheet: 'Sheet1',
                    tableId: 'tbl-direct',
                    sourceType: 'EntityView',
                    entityName: 'MJ: Users',
                    anchorCell: 'C2'
                },
                content,
                nonOwnerEditorCtx
            );
            expect(directAnchorBlock.success).toBe(false);
            expect(directAnchorBlock.errorMessage).toContain('protected range');
            expect(execSpy).not.toHaveBeenCalled();

            // 2. Post-materialization block when anchor A1 expands into C2:D4
            const spillBlock = await lib.InvokeTool(
                'upsert_live_table',
                {
                    sheet: 'Sheet1',
                    tableId: 'tbl-spill',
                    sourceType: 'EntityView',
                    entityName: 'MJ: Users',
                    anchorCell: 'A1'
                },
                content,
                nonOwnerEditorCtx
            );
            expect(spillBlock.success).toBe(false);
            expect(spillBlock.errorMessage).toContain('protected range');

            // 3. Owner succeeds for upsert_live_table
            const ownerUpsert = await lib.InvokeTool(
                'upsert_live_table',
                {
                    sheet: 'Sheet1',
                    tableId: 'tbl-spill',
                    sourceType: 'EntityView',
                    entityName: 'MJ: Users',
                    anchorCell: 'A1'
                },
                content,
                ownerCtx
            );
            expect(ownerUpsert.success).toBe(true);
            const withLiveTable = (ownerUpsert.data as { updatedContent: string }).updatedContent;

            // 4. Non-owner refresh_live_tables is blocked when materialized footprint intersects C2:D4
            const nonOwnerRefresh = await lib.InvokeTool(
                'refresh_live_tables',
                { tableId: 'tbl-spill' },
                withLiveTable,
                nonOwnerEditorCtx
            );
            expect(nonOwnerRefresh.success).toBe(false);
            expect(nonOwnerRefresh.errorMessage).toContain('protected range');

            // 4b. Non-owner refresh_live_tables on a table whose anchor intersects C2:D4 is blocked before ExecuteBlock
            const wbAnchoredInLock = engine.CreateEmptyWorkbook('AnchoredLock', ['Sheet1']);
            engine.AddProtectedRange(wbAnchoredInLock, 'Sheet1', {
                RangeID: 'prot-tbl',
                Range: 'C2:D4',
                LockedByUserID: ownerId,
                AllowEditors: false
            });
            wbAnchoredInLock.Worksheets[0].LiveTables.push({
                TableID: 'tbl-in-lock',
                Title: 'Locked Anchor Table',
                SourceType: 'EntityView',
                EntityName: 'MJ: Users',
                AnchorCell: 'C2',
                IncludeHeaders: true,
                Mode: 'Live'
            });
            execSpy.mockClear();
            const preBlockedRefresh = await lib.InvokeTool(
                'refresh_live_tables',
                { tableId: 'tbl-in-lock' },
                engine.SerializeWorkbook(wbAnchoredInLock),
                nonOwnerEditorCtx
            );
            expect(preBlockedRefresh.success).toBe(false);
            expect(preBlockedRefresh.errorMessage).toContain('protected range');
            expect(execSpy).not.toHaveBeenCalled();

            // 5. Owner refresh_live_tables succeeds
            const ownerRefresh = await lib.InvokeTool(
                'refresh_live_tables',
                { tableId: 'tbl-spill' },
                withLiveTable,
                ownerCtx
            );
            expect(ownerRefresh.success).toBe(true);
        });

        it('blocks non-owner sort_and_filter when target rows intersect ProtectedRanges and allows owner', async () => {
            const engine = SpreadsheetEngine.Instance;
            const wb = engine.CreateEmptyWorkbook('SortFilterLock', ['Data'], 6, 4);
            engine.SetCell(wb, 'Data', 'A1', { Value: 'Item' }, false);
            engine.SetCell(wb, 'Data', 'B1', { Value: 'Amount' }, false);
            engine.SetCell(wb, 'Data', 'A2', { Value: 'Zebra' }, false);
            engine.SetCell(wb, 'Data', 'B2', { Value: 20 }, false);
            engine.SetCell(wb, 'Data', 'A3', { Value: 'Apple' }, false);
            engine.SetCell(wb, 'Data', 'B3', { Value: 10 }, false);
            engine.AddProtectedRange(wb, 'Data', {
                RangeID: 'prot-rows',
                Range: 'B2:B3',
                LockedByUserID: ownerId,
                AllowEditors: false
            });
            const lib = new SpreadsheetToolLibrary();
            const content = engine.SerializeWorkbook(wb);

            const blockedSort = await lib.InvokeTool(
                'sort_and_filter',
                { sheet: 'Data', sortColumn: 'A', sortDirection: 'asc' },
                content,
                nonOwnerEditorCtx
            );
            expect(blockedSort.success).toBe(false);
            expect(blockedSort.errorMessage).toContain('protected range');

            const blockedFilter = await lib.InvokeTool(
                'sort_and_filter',
                { sheet: 'Data', filters: [{ columnLetter: 'A', operator: 'equals', value: 'Apple' }] },
                content,
                nonOwnerEditorCtx
            );
            expect(blockedFilter.success).toBe(false);
            expect(blockedFilter.errorMessage).toContain('protected range');

            const ownerSort = await lib.InvokeTool(
                'sort_and_filter',
                { sheet: 'Data', sortColumn: 'A', sortDirection: 'asc' },
                content,
                ownerCtx
            );
            expect(ownerSort.success).toBe(true);
            const sortedWb = engine.ParseWorkbook((ownerSort.data as { updatedContent: string }).updatedContent);
            expect(sortedWb.Worksheets[0].Cells['A2']?.RawValue).toBe('Apple');
        });
    });
});
