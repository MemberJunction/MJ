import '@angular/compiler';
import { inflateRawSync } from 'node:zlib';
import { describe, it, expect, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import {
  DocumentLiveBlockEngine,
  SlideDeckEngine,
  SpreadsheetEngine,
  type DocumentBlockSpec,
  type SlideDeckSpec,
} from '@memberjunction/core-entities';
import { DocumentImportExportService } from '../lib/services/document-import-export.service';
import { SlideDeckExportService } from '../lib/services/slide-deck-export.service';
import { DocumentCollaborationService } from '../lib/services/document-collaboration.service';
import { SpreadsheetArtifactViewerComponent } from '../lib/components/plugins/spreadsheet-artifact-viewer.component';
import {
  ARTIFACT_AI_ASSISTANT_ENABLED,
  RegisterArtifactAiAssistantHandler,
  RequestArtifactAiAssistant,
  type ArtifactAskAiRequest,
} from '../lib/services/artifact-ai-assistant-bridge';

function parseZipArchiveEntries(zipBytes: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  let eocdOffset = -1;
  for (let i = zipBytes.byteLength - 22; i >= Math.max(0, zipBytes.byteLength - 65558); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    return entries;
  }
  const cdCount = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder('utf-8');

  for (let i = 0; i < cdCount && cdOffset + 46 <= eocdOffset; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) {
      break;
    }
    const method = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    const name = decoder.decode(zipBytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));

    if (view.getUint32(localHeaderOffset, true) === 0x04034b50) {
      const lfhNameLen = view.getUint16(localHeaderOffset + 26, true);
      const lfhExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
      const rawSlice = zipBytes.subarray(dataStart, dataStart + compressedSize);
      const content =
        method === 8 ? new Uint8Array(inflateRawSync(rawSlice)) : new Uint8Array(rawSlice);
      entries.set(name, content);
    }

    cdOffset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function hasPngSignature(bytes: Uint8Array | undefined): boolean {
  if (!bytes || bytes.byteLength < 8) {
    return false;
  }
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

describe('Next Horizons Batch A–D: Native .docx/.pptx PNG Export & AI Assistant Bridge', () => {
  let docIoService: DocumentImportExportService;
  let slideExportService: SlideDeckExportService;
  let collabService: DocumentCollaborationService;

  beforeEach(() => {
    docIoService = new DocumentImportExportService();
    slideExportService = new SlideDeckExportService();
    collabService = new DocumentCollaborationService();
  });

  it('embeds native PNG ImageRun drawings in .docx for Chart and Whiteboard blocks (§3.4)', async () => {
    const chartSpec: DocumentBlockSpec = {
      BlockID: 'blk-chart-1',
      Kind: 'Artifact',
      Mode: 'Frozen',
      Title: 'Q4 ARR Chart',
      ArtifactID: 'wb-art-1',
      ArtifactType: 'Excel Spreadsheet',
      SheetChartID: 'chart-arr',
    };
    const whiteboardSpec: DocumentBlockSpec = {
      BlockID: 'blk-wb-1',
      Kind: 'Artifact',
      Mode: 'Frozen',
      Title: 'System Architecture Whiteboard',
      ArtifactID: 'wb-art-2',
      ArtifactType: 'Whiteboard',
      EmbedMode: 'Inline',
    };
    const markdown = [
      '# Executive Brief',
      '',
      DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(chartSpec),
      '',
      DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(whiteboardSpec),
    ].join('\n');

    const docxBytes = await docIoService.ConvertMarkdownToDocxBytes(
      markdown,
      'Executive Brief',
      undefined,
    );
    expect(docxBytes.byteLength).toBeGreaterThan(1000);

    const entries = parseZipArchiveEntries(docxBytes);
    const mediaPaths = Array.from(entries.keys()).filter(
      (p) => p.startsWith('word/media/') && p.endsWith('.png'),
    );
    expect(mediaPaths.length).toBeGreaterThanOrEqual(2);

    for (const mediaPath of mediaPaths) {
      expect(hasPngSignature(entries.get(mediaPath))).toBe(true);
    }

    const docXmlBytes = entries.get('word/document.xml');
    const docXml = docXmlBytes ? new TextDecoder('utf-8').decode(docXmlBytes) : '';
    expect(docXml).toContain('<w:drawing>');
    expect(docXml).toContain('Executive Brief');
  });

  it('embeds native PNG <p:pic> media and relationships in .pptx for Chart and Whiteboard slide blocks (§3.4)', () => {
    const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Visual Review', 'deck-png-1');
    const chartBlock: DocumentBlockSpec = {
      BlockID: 'slide-blk-chart',
      Kind: 'Artifact',
      Mode: 'Frozen',
      Title: 'Revenue Growth Chart',
      ArtifactID: 'sheet-art-1',
      ArtifactType: 'Excel Spreadsheet',
      SheetChartID: 'chart-1',
    };
    const whiteboardBlock: DocumentBlockSpec = {
      BlockID: 'slide-blk-wb',
      Kind: 'Artifact',
      Mode: 'Frozen',
      Title: 'Architecture Whiteboard',
      ArtifactID: 'wb-art-1',
      ArtifactType: 'Whiteboard',
      EmbedMode: 'Inline',
    };

    const deck: SlideDeckSpec = {
      ...baseDeck,
      Slides: [
        {
          ...baseDeck.Slides[0],
          Regions: [
            {
              RegionID: 'reg-chart',
              Label: 'Revenue Chart',
              Kind: 'mj-block',
              MarkdownContent: '',
              BlockSpec: chartBlock,
            },
            {
              RegionID: 'reg-wb',
              Label: 'Architecture Whiteboard',
              Kind: 'mj-block',
              MarkdownContent: '',
              BlockSpec: whiteboardBlock,
            },
          ],
        },
      ],
    };

    const fakeUser = { ID: 'u-exporter', Name: 'Exporter User', Email: 'exp@test.local' } as unknown as UserInfo;
    const pkg = slideExportService.ExportToPptxPackage(deck, new Map(), fakeUser);
    const textEntries = slideExportService.InspectPptxArchiveEntries(pkg.Bytes);
    const binEntries = slideExportService.InspectPptxArchiveBinaryEntries(pkg.Bytes);

    const pngNames = Array.from(binEntries.keys()).filter(
      (k) => k.startsWith('ppt/media/') && k.endsWith('.png'),
    );
    expect(pngNames).toContain('ppt/media/image1.png');
    expect(pngNames).toContain('ppt/media/image2.png');
    expect(hasPngSignature(binEntries.get('ppt/media/image1.png'))).toBe(true);
    expect(hasPngSignature(binEntries.get('ppt/media/image2.png'))).toBe(true);

    const slide1Xml = textEntries.get('ppt/slides/slide1.xml') ?? '';
    expect(slide1Xml).toContain('<p:pic>');
    expect(slide1Xml).toContain('r:embed="rIdImg1"');
    expect(slide1Xml).toContain('r:embed="rIdImg2"');

    const slide1Rels = textEntries.get('ppt/slides/_rels/slide1.xml.rels') ?? '';
    expect(slide1Rels).toContain('../media/image1.png');
    expect(slide1Rels).toContain('../media/image2.png');

    const contentTypes = textEntries.get('[Content_Types].xml') ?? '';
    expect(contentTypes).toContain('Extension="png"');
  });

  it('hides /ai slash command while inline Ask AI is turned off without using any Copilot branding', () => {
    expect(ARTIFACT_AI_ASSISTANT_ENABLED).toBe(false);
    const cmds = collabService.GetSlashCommands('ai');
    const aiCmd = cmds.find((c) => c.Command === '/ai');
    expect(aiCmd).toBeUndefined();

    const allCmdsJson = JSON.stringify(collabService.GetSlashCommands()).toLowerCase();
    expect(allCmdsJson).not.toContain('copilot');
  });

  it('does not dispatch Ask AI requests while ARTIFACT_AI_ASSISTANT_ENABLED is false', () => {
    const received: ArtifactAskAiRequest[] = [];
    const req1: ArtifactAskAiRequest = {
      ArtifactID: 'art-1',
      ArtifactTitle: 'Q4 Plan',
      ArtifactKind: 'doc',
      ContextLabel: 'Heading: Executive Summary',
      SelectedContent: 'Draft executive summary text',
      SuggestingModeDefault: true,
    };

    const unregister = RegisterArtifactAiAssistantHandler((req) => {
      received.push(req);
    });
    expect(RequestArtifactAiAssistant(req1)).toBe(false);
    expect(received).toHaveLength(0);

    unregister();
  });

  it('auto-detects contiguous spreadsheet table ranges and renders bar, line, area, and pie geometry', () => {
    const engine = SpreadsheetEngine.Instance;
    const wb = engine.CreateEmptyWorkbook('Sales Report', ['Regional Sales'], 12, 6);
    const sheet = wb.Worksheets[0];
    engine.SetCell(wb, sheet.SheetID, 'A1', { Value: 'Region' }, false);
    engine.SetCell(wb, sheet.SheetID, 'B1', { Value: 'Quarter' }, false);
    engine.SetCell(wb, sheet.SheetID, 'C1', { Value: 'Revenue' }, false);
    engine.SetCell(wb, sheet.SheetID, 'D1', { Value: 'Units Sold' }, false);
    engine.SetCell(wb, sheet.SheetID, 'A2', { Value: 'North America' }, false);
    engine.SetCell(wb, sheet.SheetID, 'B2', { Value: 'Q1' }, false);
    engine.SetCell(wb, sheet.SheetID, 'C2', { Value: 1245000 }, false);
    engine.SetCell(wb, sheet.SheetID, 'D2', { Value: 820 }, false);
    engine.SetCell(wb, sheet.SheetID, 'A3', { Value: 'Europe' }, false);
    engine.SetCell(wb, sheet.SheetID, 'B3', { Value: 'Q2' }, false);
    engine.SetCell(wb, sheet.SheetID, 'C3', { Value: 987000 }, false);
    engine.SetCell(wb, sheet.SheetID, 'D3', { Value: 640 }, true);

    const comp = Object.create(SpreadsheetArtifactViewerComponent.prototype) as SpreadsheetArtifactViewerComponent;
    Object.assign(comp as object, {
      Workbook: wb,
      SelectedRange: 'A1',
      ActiveRowIndex: 1,
      ActiveColumnIndex: 1,
      readonly: false,
      FallbackXlsxBytes: null,
      liveSyncUnavailable: false,
      SourceJsonText: '',
      SelectedChartSeriesByChartID: {},
      cdr: { markForCheck: () => undefined },
    });

    comp.AddRangeChartFromSelection();
    expect(sheet.Charts).toHaveLength(1);
    const chart = sheet.Charts[0];
    expect(chart.SourceRange).toBe('A1:D3');

    const dataset = comp.GetChartDataset(chart);
    expect(dataset).not.toBeNull();
    // Revenue (~1.25M) vs Units Sold (~820) differ >20x, so default active series picks primary series cleanly
    const defaultSeries = comp.GetActiveChartSeries(chart, dataset!);
    expect(defaultSeries).toHaveLength(1);
    expect(defaultSeries[0].Name).toBe('Revenue');

    const maxVal = comp.GetChartMaxValueForSeries(defaultSeries);
    expect(maxVal).toBe(1245000);

    const bars = comp.GetChartBarRects(chart, dataset!, defaultSeries, maxVal);
    expect(bars).toHaveLength(2);
    expect(bars[0].Height).toBeGreaterThan(100);
    expect(bars[0].FormattedValue).toBe('1.25M');

    chart.ChartType = 'line';
    const lines = comp.GetChartLineSeries(dataset!, defaultSeries, maxVal);
    expect(lines).toHaveLength(1);
    expect(lines[0].PolylinePoints).toContain(',');
    expect(lines[0].AreaPath).toContain('M ');

    chart.ChartType = 'pie';
    const slices = comp.GetChartPieSlices(chart, dataset!, defaultSeries);
    expect(slices).toHaveLength(2);
    expect(slices[0].Path).toContain('A 62 62');

    // Switching series to Units Sold plots at 0..820 scale cleanly
    comp.SetChartSeriesSelection(chart.ChartID, 1);
    const unitSeries = comp.GetActiveChartSeries(chart, dataset!);
    expect(unitSeries[0].Name).toBe('Units Sold');
    expect(comp.GetChartMaxValueForSeries(unitSeries)).toBe(820);

    comp.RemoveRangeChart(chart);
    expect(sheet.Charts).toHaveLength(0);
  });
});
