// @vitest-environment jsdom
import '@angular/compiler';
import { inflateRawSync } from 'node:zlib';
import { describe, it, expect, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import {
  DocumentLiveBlockEngine,
  SlideDeckEngine,
  SpreadsheetEngine,
  type DocumentBlockExecutionResult,
  type DocumentBlockSpec,
  type SlideDeckSpec,
} from '@memberjunction/core-entities';
import { DocumentImportExportService } from '../lib/services/document-import-export.service';
import {
  BuildSandboxedHtmlDocument,
  SanitizeHtmlForSandboxedFrame,
} from '../lib/utils/html-sandbox.util';
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

  it('emits native DrawingML charts (<c:chartSpace>) for Chart blocks and PNG <p:pic> media for Whiteboard blocks (§3.4, NW-4)', () => {
    const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Visual Review', 'deck-png-1');
    const chartBlock: DocumentBlockSpec = {
      BlockID: 'slide-blk-chart',
      Kind: 'EntityView',
      Mode: 'Live',
      Title: 'Revenue Growth Chart',
      EntityName: 'MJ: Artifacts',
      DisplayMode: 'chart',
      ChartType: 'bar',
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

    const fakeUser = { ID: 'u-exporter', Name: 'Exporter User', Email: 'exp@test.local' } as Partial<UserInfo> as UserInfo;
    const resultsMap = new Map<string, DocumentBlockExecutionResult>([
      [
        'slide-blk-chart',
        {
          Success: true,
          BlockID: 'slide-blk-chart',
          Kind: 'EntityView',
          Mode: 'Live',
          Columns: [
            { Name: 'Quarter', DisplayName: 'Quarter', Type: 'nvarchar' },
            { Name: 'Revenue', DisplayName: 'Revenue', Type: 'decimal' },
          ],
          Rows: [
            { Quarter: 'Q1', Revenue: 120 },
            { Quarter: 'Q2', Revenue: 185 },
          ],
          TotalRowCount: 2,
        },
      ],
    ]);
    const pkg = slideExportService.ExportToPptxPackage(deck, resultsMap, fakeUser);
    const textEntries = slideExportService.InspectPptxArchiveEntries(pkg.Bytes);
    const binEntries = slideExportService.InspectPptxArchiveBinaryEntries(pkg.Bytes);

    // Chart block emits native DrawingML ppt/charts/chart1.xml instead of a PNG bitmap
    const chartXml = textEntries.get('ppt/charts/chart1.xml') ?? '';
    expect(chartXml).toContain('<c:chartSpace');
    expect(chartXml).toContain('Revenue');

    // Whiteboard block continues to emit PNG <p:pic> media
    const pngNames = Array.from(binEntries.keys()).filter(
      (k) => pStartsWithMedia(k),
    );
    function pStartsWithMedia(k: string): boolean {
      return k.startsWith('ppt/media/') && k.endsWith('.png');
    }
    expect(pngNames).toEqual(['ppt/media/image1.png']);
    expect(hasPngSignature(binEntries.get('ppt/media/image1.png'))).toBe(true);

    const slide1Xml = textEntries.get('ppt/slides/slide1.xml') ?? '';
    expect(slide1Xml).toContain('http://schemas.openxmlformats.org/drawingml/2006/chart');
    expect(slide1Xml).toContain('<p:pic>');
    expect(slide1Xml).toContain('r:embed="rIdImg1_1"');

    const slide1Rels = textEntries.get('ppt/slides/_rels/slide1.xml.rels') ?? '';
    expect(slide1Rels).toContain('../charts/chart1.xml');
    expect(slide1Rels).toContain('../media/image1.png');

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

  it('P0-19: strips XSS/mXSS vectors from printable HTML and builds a sandbox="allow-modals" document without allow-same-origin or document.write', () => {
    const dirtyHtml = [
      '<h1>Quarterly Summary</h1>',
      '<script>alert("xss")</script>',
      '<link rel="stylesheet" href="https://evil.test/steal.css">',
      '<form action="https://evil.test/phish"><input name="tok"></form>',
      '<img src="https://example.org/ok.png" onerror="alert(1)">',
      '<a href="javascript:alert(2)">bad link</a>',
      '<a href="data:application/xhtml+xml,<html/>">bad data</a>',
      '<img src="data:image/svg+xml,<svg onload=alert(3)/>">',
      '<iframe src="https://evil.test/frame"></iframe>',
    ].join('\n');

    const sanitizedBody = SanitizeHtmlForSandboxedFrame('<h1>Quarterly Summary</h1><script>alert("xss")</script>');
    const docHtml = BuildSandboxedHtmlDocument({
      Title: 'Title <script>alert(1)</script>',
      BodyHtml: sanitizedBody,
    });
    expect(docHtml).not.toContain('<script');
    expect(docHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(docHtml).toContain('Content-Security-Policy');
    expect(docHtml).toContain('Quarterly Summary');

    // Verify sandboxed iframe print path & ExportPrintablePdf DOM/regex fragment sanitizer
    const originalDoc = Reflect.get(globalThis, 'document') as Document | undefined;
    const appended: Array<{ tagName: string; attrs: Record<string, string>; srcdoc?: string }> = [];
    let printCalled = false;
    const printMock = (): void => {
      printCalled = true;
    };
    try {
      const loadListeners: Array<() => void> = [];
      const mockFrame = {
        attrs: {} as Record<string, string>,
        style: {} as Record<string, string>,
        srcdoc: '',
        setAttribute(k: string, v: string): void {
          this.attrs[k] = v;
        },
        addEventListener(eventName: string, listener: () => void): void {
          if (eventName === 'load') {
            loadListeners.push(listener);
          }
        },
        remove(): void {},
        contentWindow: {
          addEventListener: (): void => {},
          focus: (): void => {},
          print: printMock,
        },
      };
      Reflect.set(globalThis, 'document', {
        createElement: (tag: string) => {
          if (tag === 'iframe') {
            return mockFrame;
          }
          return {
            innerHTML: dirtyHtml,
            content: {
              querySelectorAll: () => [],
              childNodes: [],
            },
          };
        },
        body: {
          appendChild: (el: { attrs: Record<string, string>; srcdoc?: string }) => {
            appended.push({ tagName: 'iframe', attrs: el.attrs, srcdoc: el.srcdoc });
            for (const listener of loadListeners) {
              listener();
            }
            return el;
          },
        },
      });
      const svc = new DocumentImportExportService();
      svc.ExportPrintablePdf(dirtyHtml, 'Printable <script>bad</script> Report', 'landscape');
      expect(appended).toHaveLength(1);
      expect(printCalled).toBe(false);
      expect(appended[0].attrs['sandbox']).toBe('allow-modals allow-scripts');
      expect(appended[0].attrs['sandbox']).not.toContain('allow-same-origin');
      const srcdoc = appended[0].srcdoc ?? '';
      expect(srcdoc).toContain('@page { size: A4 landscape;');
      expect(srcdoc).toContain("script-src 'nonce-");
      expect(srcdoc).toContain("connect-src 'none'");
      expect(srcdoc).toContain('window.print()');
      expect(srcdoc).toContain("type: 'mj-print-done'");
      expect(srcdoc).not.toContain('<script>bad</script>');
      expect(srcdoc).not.toContain('<script>alert(1)');
      expect(srcdoc).not.toContain('<link');
      expect(srcdoc).not.toContain('<form');
      expect(srcdoc).not.toContain('<iframe');
      expect(srcdoc).not.toContain('onerror');
      expect(srcdoc).not.toContain('javascript:');
      expect(srcdoc).not.toContain('data:application/xhtml+xml');
      expect(srcdoc).not.toContain('data:image/svg+xml');
    } finally {
      Reflect.set(globalThis, 'document', originalDoc);
    }
  });

  it('DOCX export normalizes CRLF, preserves escaped table pipes, renders LiveBlockResults, and flags unverified frozen snapshots without attribution', async () => {
    const svc = new DocumentImportExportService();
    const liveBlock: DocumentBlockSpec = {
      BlockID: 'blk-live-export',
      Kind: 'EntityView',
      Mode: 'Live',
      Title: 'Live Accounts',
      EntityName: 'Accounts',
    };
    const tamperedFrozenBlock: DocumentBlockSpec = {
      BlockID: 'blk-tampered-export',
      Kind: 'SavedQuery',
      Mode: 'Frozen',
      Title: 'Forged Snapshot',
      QueryName: 'ARR Query',
      FrozenSnapshot: {
        FrozenAt: '2026-11-01T00:00:00Z',
        FrozenByUserID: 'attacker-id',
        FrozenByUserName: 'Spoofed Exec',
        Columns: [{ Name: 'Metric', DisplayName: 'Metric', Type: 'string' }],
        Rows: [{ Metric: 'ARR $10M' }],
        TotalRowCount: 1,
        SecurityWarningAcknowledged: false,
      },
    };

    const md = [
      '# CRLF Heading\r\n',
      'Check ~~old price~~ and [Docs](https://memberjunction.org).\r\n',
      '1. First ordered item\r\n2. Second ordered item\r\n',
      '---\r\n',
      '| Metric | Formula |\r\n| --- | --- |\r\n| Net | A \\| B |\r\n',
      DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(liveBlock).replace(/\n/g, '\r\n'),
      '\r\n',
      DocumentLiveBlockEngine.Instance.SerializeBlockToMarkdownDirective(tamperedFrozenBlock).replace(/\n/g, '\r\n'),
    ].join('\r\n');

    const liveResults = new Map([
      [
        'blk-live-export',
        {
          BlockID: 'blk-live-export',
          Kind: 'EntityView' as const,
          Mode: 'Live' as const,
          Success: true,
          Columns: [{ Name: 'Account', DisplayName: 'Account', Type: 'string' }],
          Rows: [{ Account: 'Acme Corp' }],
          TotalRowCount: 1,
        },
      ],
    ]);

    const bytes = await svc.ConvertMarkdownToDocxBytes(md, 'CRLF Audit', {
      LiveBlockResults: liveResults,
      VerifyFrozenSnapshot: (b) => b.BlockID !== 'blk-tampered-export',
    });
    const entries = parseZipArchiveEntries(bytes);
    const docXml = Buffer.from(entries.get('word/document.xml') ?? new Uint8Array()).toString('utf8');

    expect(docXml).toContain('CRLF Heading');
    expect(docXml).toContain('old price');
    expect(docXml).toContain('A | B');
    expect(docXml).toContain('Acme Corp');
    expect(docXml).toContain('Unverified Snapshot (signature missing or invalid)');
    expect(docXml).not.toContain('Spoofed Exec');
  });
});
