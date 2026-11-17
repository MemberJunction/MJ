import { Injectable } from '@angular/core';
import {
  SlideDeckEngine,
  SpreadsheetEngine,
  type SlideDeckSpec,
  type SlideSpec,
  type SlideRegionSpec,
  type DocumentBlockExecutionResult,
  type DocumentBlockSpec,
} from '@memberjunction/core-entities';
import { EscapeHtml } from '../components/previews/office-preview.logic';
import { IsVisualDiagramOrChartBlock, RasterizeBlockDiagramToPng } from '../utils/diagram-png-encoder';
import { PrintHtmlInSandboxedIframe } from '../utils/html-sandbox.util';

/** Optional configuration passed to {@link SlideDeckExportService.ExportToPptxPackage}. */
export interface PptxExportOptions {
  /** Pre-rendered PNG bytes keyed by `DocumentBlockSpec.BlockID` for Charts/Whiteboards (`§ 3.4`). */
  RasterizedImagesByBlockId?: ReadonlyMap<string, Uint8Array>;
  /** When `true`, includes slides marked `Hidden: true` with OpenXML `show="0"`; defaults to `false` (skips hidden slides). */
  IncludeHiddenSlides?: boolean;
  /**
   * Optional set of already-authenticated block/region IDs (`BlockID`, `RegionID`, or
   * `${SlideID}:${RegionID}`) passed through to {@link SlideDeckEngine.ExportDeckToPptxBytes}.
   */
  VerifiedBlockIds?: ReadonlySet<string>;
}

interface SlideMediaImageRef {
  RelId: string;
  MediaFileName: string;
  Bytes: Uint8Array;
}

/**
 * Result of generating an OpenXML `.pptx` presentation archive (`§ 5.3`, `Accept #2`, `Accept #5`).
 */
export interface PptxExportPackage {
  /** Raw PKZIP `.pptx` archive bytes (`PK\x03\x04...`). */
  Bytes: Uint8Array;
  /** The frozen copy of the {@link SlideDeckSpec} used to produce the export (`Accept #2`). */
  FrozenDeck: SlideDeckSpec;
  /** Count of slides written into `ppt/slides/slide1..N.xml`. */
  SlideCount: number;
  /** Count of live MJ blocks frozen into static table/chart snapshots during export (`Accept #2`). */
  FrozenBlockCount: number;
}

/**
 * Service handling presentation export for MJ Slides (`§ 5.3`):
 * - **`.pptx` (OpenXML PowerPoint)**:
 *   - Automatically freezes all live MJ blocks (`EntityView`, `SavedQuery`, `DashboardPart`) with the
 *     current viewer's RLS/FLS-scoped data (`Accept #2`).
 *   - Emits editable OpenXML `<p:sp>` text shapes (`<a:t>`), native DrawingML `<a:tbl>` tables for frozen
 *     data blocks, theme color palettes (`ppt/theme/theme1.xml`), master headers/footers, and speaker notes
 *     (`ppt/notesSlides/notesSlide1..N.xml`) (`Accept #5`).
 * - **`.pdf` (16:9 Widescreen Printable Deck)**:
 *   - Renders all slides at 16:9 aspect ratio with optional speaker notes for browser PDF printing.
 */
@Injectable({
  providedIn: 'root',
})
export class SlideDeckExportService {
  private static crcTable: Uint32Array | null = null;

  /**
   * Freezes all live MJ blocks in `deck` (`Accept #2`) and generates a standards-compliant
   * OpenXML `.pptx` PKZIP archive with editable text runs (`<a:t>`), native tables (`<a:tbl>`),
   * and speaker notes (`Accept #5`).
   */
  public ExportToPptxPackage(
    deck: SlideDeckSpec,
    blockResultsByBlockId: ReadonlyMap<string, DocumentBlockExecutionResult>,
    user?: { ID: string; Name: string } | null,
    options?: PptxExportOptions,
  ): PptxExportPackage {
    const originalBlocksById = new Map<string, DocumentBlockSpec>();
    for (const origSlide of deck.Slides) {
      for (const origRegion of origSlide.Regions) {
        const origBlock = SlideDeckEngine.Instance.ExtractRegionBlockSpec(origRegion);
        if (origBlock?.BlockID) {
          originalBlocksById.set(origBlock.BlockID, origBlock);
        }
      }
    }
    const frozenDeck = SlideDeckEngine.Instance.FreezeDeckLiveBlocksForPresentation(
      deck,
      blockResultsByBlockId,
      user,
    );

    let frozenBlockCount = 0;
    const verifiedBlockIds = new Set<string>(options?.VerifiedBlockIds ?? []);
    for (const slide of frozenDeck.Slides) {
      for (const region of slide.Regions) {
        const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
        if (block && block.Mode === 'Frozen' && block.FrozenSnapshot) {
          frozenBlockCount++;
          const origBlock = originalBlocksById.get(block.BlockID);
          const blockResult = blockResultsByBlockId.get(block.BlockID);
          const wasOriginallyLive = origBlock?.Mode !== 'Frozen';
          const isFreshlyFrozenLiveResult =
            wasOriginallyLive &&
            blockResult?.Success === true &&
            blockResult.Mode === 'Live' &&
            blockResult.FrozenSnapshot?.SnapshotVerified !== false &&
            blockResult.FrozenMetadata?.SnapshotVerified !== false;
          const isVerifiedFrozenResult =
            blockResult?.FrozenSnapshot?.SnapshotVerified === true ||
            blockResult?.FrozenMetadata?.SnapshotVerified === true;
          const isSnapshotVerified = isFreshlyFrozenLiveResult || isVerifiedFrozenResult;
          if (isSnapshotVerified) {
            verifiedBlockIds.add(block.BlockID);
            if (region.RegionID) {
              verifiedBlockIds.add(region.RegionID);
              if (slide.SlideID) {
                verifiedBlockIds.add(`${slide.SlideID}:${region.RegionID}`);
              }
            }
          }
        }
      }
    }

    const includeHidden = Boolean(options?.IncludeHiddenSlides);
    const slides = includeHidden ? frozenDeck.Slides : frozenDeck.Slides.filter((s) => !s.Hidden);

    // Delegate OpenXML generation (including native DrawingML ppt/charts/chartN.xml vector charts)
    // to SlideDeckEngine / SlideDeckPptxEngine, keeping untrusted/tampered snapshots failed closed.
    const engineBytes = SlideDeckEngine.Instance.ExportDeckToPptxBytes(frozenDeck, {
      IncludeHiddenSlides: includeHidden,
      VerifiedBlockIds: verifiedBlockIds,
    });

    const bytes = this.augmentEnginePptxWithRasterMedia(
      engineBytes,
      slides,
      frozenDeck,
      blockResultsByBlockId,
      options,
    );

    return {
      Bytes: bytes,
      FrozenDeck: frozenDeck,
      SlideCount: slides.length,
      FrozenBlockCount: frozenBlockCount,
    };
  }

  /**
   * Generates a `.pptx` archive and triggers a browser file download.
   */
  public DownloadPptxFile(
    deck: SlideDeckSpec,
    blockResultsByBlockId: ReadonlyMap<string, DocumentBlockExecutionResult>,
    fileName = 'presentation.pptx',
    user?: { ID: string; Name: string } | null,
    options?: PptxExportOptions,
  ): PptxExportPackage {
    const pkg = this.ExportToPptxPackage(deck, blockResultsByBlockId, user, options);
    const normalizedName = fileName.toLowerCase().endsWith('.pptx') ? fileName : `${fileName}.pptx`;
    const arrayBuffer = pkg.Bytes.buffer.slice(
      pkg.Bytes.byteOffset,
      pkg.Bytes.byteOffset + pkg.Bytes.byteLength,
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    this.triggerBlobDownload(blob, normalizedName);
    return pkg;
  }

  /**
   * Augments the engine-generated `.pptx` archive with raster PNG `<p:pic>` parts for
   * inline Whiteboards/diagrams, explicit `RasterizedImagesByBlockId`, or inline base64 PNGs.
   * Chart blocks with tabular data remain native DrawingML charts (`ppt/charts/chartN.xml`).
   */
  private augmentEnginePptxWithRasterMedia(
    engineBytes: Uint8Array,
    slides: ReadonlyArray<SlideSpec>,
    frozenDeck: SlideDeckSpec,
    blockResultsByBlockId: ReadonlyMap<string, DocumentBlockExecutionResult>,
    options?: PptxExportOptions,
  ): Uint8Array {
    const mediaPlacements: Array<{
      slideNum: number;
      name: string;
      bytes: Uint8Array;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];

    const marginX = 609600;
    const slideW = frozenDeck.AspectRatio === '4:3' ? 9144000 : 12192000;
    const contentW = slideW - marginX * 2;

    slides.forEach((slide, slideIdx) => {
      const slideNum = slideIdx + 1;
      const regionCount = Math.max(slide.Regions.length, 1);
      const regionWidth = Math.floor(contentW / regionCount);

      slide.Regions.forEach((region, rIdx) => {
        const x = marginX + rIdx * regionWidth;
        const y = 1752600;
        const w = Math.max(regionWidth - 152400, 457200);
        const h = 4419600;

        const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
        if (block) {
          const explicitBytes = options?.RasterizedImagesByBlockId?.get(block.BlockID);
          if (explicitBytes && explicitBytes.byteLength > 0) {
            mediaPlacements.push({
              slideNum,
              name: block.Title || region.Label,
              bytes: explicitBytes,
              x,
              y,
              w,
              h,
            });
            return;
          }
          const isChartBlock =
            block.DisplayMode === 'chart' ||
            Boolean(block.ChartType) ||
            Boolean(block.SheetChartID);
          if (!isChartBlock && IsVisualDiagramOrChartBlock(block)) {
            const liveResult = blockResultsByBlockId.get(block.BlockID);
            const pngBytes = RasterizeBlockDiagramToPng(
              block,
              {
                Primary: frozenDeck.Theme?.PrimaryColor,
                Accent: frozenDeck.Theme?.AccentColor,
              },
              liveResult,
            );
            mediaPlacements.push({
              slideNum,
              name: block.Title || region.Label,
              bytes: pngBytes,
              x,
              y,
              w,
              h,
            });
          }
          return;
        }

        if (region.Kind === 'image' && region.ImageUrl) {
          const pngMatch = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/i.exec(region.ImageUrl.trim());
          if (pngMatch) {
            const rawStr =
              typeof atob === 'function'
                ? atob(pngMatch[1])
                : Buffer.from(pngMatch[1], 'base64').toString('binary');
            const pngBytes = new Uint8Array(rawStr.length);
            for (let i = 0; i < rawStr.length; i++) {
              pngBytes[i] = rawStr.charCodeAt(i);
            }
            mediaPlacements.push({
              slideNum,
              name: region.ImageAlt || region.Label,
              bytes: pngBytes,
              x,
              y,
              w,
              h,
            });
          }
        }
      });
    });

    if (mediaPlacements.length === 0) {
      return engineBytes;
    }

    const binEntries = this.InspectPptxArchiveBinaryEntries(engineBytes);
    const mutableEntries = new Map<string, string | Uint8Array>();
    const decoder = new TextDecoder('utf-8');
    binEntries.forEach((value, key) => {
      mutableEntries.set(key, value);
    });

    let nextImageIndex = 1;
    let nextShapeId = 500;
    const picXmlBySlide = new Map<number, string[]>();
    const relXmlBySlide = new Map<number, string[]>();

    for (const item of mediaPlacements) {
      const mediaFileName = `image${nextImageIndex++}.png`;
      const relId = `rIdImg${item.slideNum}_${nextImageIndex - 1}`;
      mutableEntries.set(`ppt/media/${mediaFileName}`, item.bytes);

      const pics = picXmlBySlide.get(item.slideNum) ?? [];
      pics.push(this.buildPictureXml(nextShapeId++, item.name, relId, item.x, item.y, item.w, item.h));
      picXmlBySlide.set(item.slideNum, pics);

      const rels = relXmlBySlide.get(item.slideNum) ?? [];
      rels.push(
        `  <Relationship Id="${this.escapeXml(relId)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${this.escapeXml(mediaFileName)}"/>`,
      );
      relXmlBySlide.set(item.slideNum, rels);
    }

    picXmlBySlide.forEach((pics, slideNum) => {
      const slidePath = `ppt/slides/slide${slideNum}.xml`;
      const rawSlide = mutableEntries.get(slidePath);
      if (rawSlide instanceof Uint8Array) {
        const slideXml = decoder
          .decode(rawSlide)
          .replace('</p:spTree>', () => `${pics.join('\n')}\n    </p:spTree>`);
        mutableEntries.set(slidePath, slideXml);
      }

      const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
      const relLines = relXmlBySlide.get(slideNum) ?? [];
      const rawRels = mutableEntries.get(relsPath);
      if (rawRels instanceof Uint8Array) {
        const relsXml = decoder
          .decode(rawRels)
          .replace('</Relationships>', () => `${relLines.join('\n')}\n</Relationships>`);
        mutableEntries.set(relsPath, relsXml);
      }
    });

    const rawContentTypes = mutableEntries.get('[Content_Types].xml');
    if (rawContentTypes instanceof Uint8Array) {
      const ctXml = decoder.decode(rawContentTypes);
      if (!ctXml.includes('Extension="png"')) {
        mutableEntries.set(
          '[Content_Types].xml',
          ctXml.replace(
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n  <Default Extension="png" ContentType="image/png"/>',
          ),
        );
      }
    }

    const encoder = new TextEncoder();
    const archiveEntries: Array<{ Name: string; Data: Uint8Array }> = [];
    mutableEntries.forEach((value, name) => {
      archiveEntries.push({
        Name: name,
        Data: value instanceof Uint8Array ? value : encoder.encode(value),
      });
    });
    return SpreadsheetEngine.Instance.BuildZipArchive(archiveEntries);
  }

  /**
   * Parses a `.pptx` PKZIP byte buffer generated by {@link ExportToPptxPackage} into a map of
   * `filePath -> utf8XmlString` for deterministic inspection in unit and E2E tests.
   */
  public InspectPptxArchiveEntries(pptxBytes: Uint8Array): Map<string, string> {
    const binEntries = this.InspectPptxArchiveBinaryEntries(pptxBytes);
    const entries = new Map<string, string>();
    const decoder = new TextDecoder('utf-8');
    binEntries.forEach((dataBytes, fileName) => {
      entries.set(fileName, decoder.decode(dataBytes));
    });
    return entries;
  }

  /**
   * Builds a 16:9 or 4:3 printable HTML document for `.pdf` export (`§ 5.3`).
   */
  public BuildPrintableDeckHtml(
    deck: SlideDeckSpec,
    blockResultsByBlockId: ReadonlyMap<string, DocumentBlockExecutionResult>,
    includeSpeakerNotes = true,
    user?: { ID: string; Name: string } | null,
  ): string {
    const parts = this.buildPrintableDeckParts(deck, blockResultsByBlockId, includeSpeakerNotes, user);
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${EscapeHtml(parts.title)}</title>
  <style>
${parts.css}
  </style>
</head>
<body>
${parts.bodyHtml}
</body>
</html>`;
  }

  private buildPrintableDeckParts(
    deck: SlideDeckSpec,
    blockResultsByBlockId: ReadonlyMap<string, DocumentBlockExecutionResult>,
    includeSpeakerNotes: boolean,
    user?: { ID: string; Name: string } | null,
  ): { title: string; css: string; bodyHtml: string } {
    const frozenDeck = SlideDeckEngine.Instance.FreezeDeckLiveBlocksForPresentation(
      deck,
      blockResultsByBlockId,
      user,
    );
    const engine = SlideDeckEngine.Instance;
    const rawTheme = frozenDeck.Theme;
    const theme = {
      PrimaryColor: engine.SanitizeCssValue(rawTheme?.PrimaryColor, '#4f46e5'),
      AccentColor: engine.SanitizeCssValue(rawTheme?.AccentColor, '#0ea5e9'),
      BackgroundColor: engine.SanitizeCssValue(rawTheme?.BackgroundColor, '#ffffff'),
      SurfaceColor: engine.SanitizeCssValue(rawTheme?.SurfaceColor, '#f8fafc'),
      TextColor: engine.SanitizeCssValue(rawTheme?.TextColor, '#0f172a'),
      MutedTextColor: engine.SanitizeCssValue(rawTheme?.MutedTextColor, '#475569'),
      HeadingFont: engine.SanitizeCssValue(rawTheme?.HeadingFont, 'Inter, system-ui, sans-serif'),
      BodyFont: engine.SanitizeCssValue(rawTheme?.BodyFont, 'Inter, system-ui, sans-serif'),
    };
    const visibleSlides = frozenDeck.Slides.filter((s) => !s.Hidden);
    const total = visibleSlides.length;
    const isFourByThree = frozenDeck.AspectRatio === '4:3';

    const slideSections = visibleSlides.map((slide, idx) => {
      const regionsHtml = slide.Regions.map((r) => this.renderPrintableRegionHtml(r)).join('\n');
      const notesHtml =
        includeSpeakerNotes && slide.SpeakerNotes
          ? `<div class="print-speaker-notes"><strong>Speaker Notes:</strong> ${EscapeHtml(slide.SpeakerNotes)}</div>`
          : '';
      return `<section class="print-slide-page" data-slide-id="${EscapeHtml(slide.SlideID)}">
  <div class="print-slide-canvas">
    <header class="print-slide-master-header">
      <span>${EscapeHtml(frozenDeck.Master.HeaderText || frozenDeck.Title)}</span>
      <span>${EscapeHtml(frozenDeck.Master.OrganizationName || '')}</span>
    </header>
    <div class="print-slide-heading">
      <h1>${EscapeHtml(slide.Title)}</h1>
      ${slide.Subtitle ? `<p class="print-slide-subtitle">${EscapeHtml(slide.Subtitle)}</p>` : ''}
    </div>
    <div class="print-slide-regions layout-${EscapeHtml(slide.Layout.toLowerCase())}">
      ${regionsHtml}
    </div>
    <footer class="print-slide-master-footer">
      <span>${EscapeHtml(frozenDeck.Master.FooterText || '')}</span>
      ${frozenDeck.Master.ShowSlideNumbers ? `<span>${idx + 1} / ${total}</span>` : ''}
    </footer>
  </div>
  ${notesHtml}
</section>`;
    });

    const css = `    @page { size: ${isFourByThree ? '10in 7.5in' : '16in 9in'}; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ${this.sanitizeStyleDeclarationValue(theme.BodyFont || 'Inter, system-ui, sans-serif')};
      background: ${this.sanitizeStyleDeclarationValue(theme.BackgroundColor)};
      color: ${this.sanitizeStyleDeclarationValue(theme.TextColor)};
    }
    .print-slide-page {
      page-break-after: always;
      padding: 32px 48px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .print-slide-canvas {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 2px solid ${this.sanitizeStyleDeclarationValue(theme.PrimaryColor)};
      border-radius: 12px;
      padding: 28px 36px;
      background: ${this.sanitizeStyleDeclarationValue(theme.BackgroundColor)};
    }
    .print-slide-master-header, .print-slide-master-footer {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: ${this.sanitizeStyleDeclarationValue(theme.MutedTextColor)};
    }
    .print-slide-heading h1 {
      margin: 12px 0 4px;
      font-size: 32px;
      color: ${this.sanitizeStyleDeclarationValue(theme.PrimaryColor)};
      font-family: ${this.sanitizeStyleDeclarationValue(theme.HeadingFont || 'Inter, system-ui, sans-serif')};
    }
    .print-slide-subtitle {
      margin: 0 0 16px;
      font-size: 18px;
      color: ${this.sanitizeStyleDeclarationValue(theme.MutedTextColor)};
    }
    .print-slide-regions {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      align-items: start;
    }
    .print-region-card {
      background: ${this.sanitizeStyleDeclarationValue(theme.SurfaceColor)};
      border-radius: 8px;
      padding: 16px;
    }
    .print-region-card img {
      max-width: 100%;
      max-height: 360px;
      object-fit: contain;
      display: block;
    }
    .print-big-number {
      font-size: 54px;
      font-weight: 800;
      color: ${this.sanitizeStyleDeclarationValue(theme.AccentColor)};
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 13px;
    }
    th, td {
      border: 1px solid ${this.sanitizeStyleDeclarationValue(theme.MutedTextColor)};
      padding: 6px 10px;
      text-align: left;
    }
    .print-speaker-notes {
      margin-top: 12px;
      padding: 10px 14px;
      font-size: 13px;
      background: ${this.sanitizeStyleDeclarationValue(theme.SurfaceColor)};
      border-left: 4px solid ${this.sanitizeStyleDeclarationValue(theme.AccentColor)};
    }`;

    return {
      title: frozenDeck.Title,
      css,
      bodyHtml: slideSections.join('\n'),
    };
  }

  /**
   * Sanitizes CSS declaration values emitted into printable HTML `<style>` blocks so
   * `<style>` breakout and `url(...)`/`expression(...)`/statement-injection payloads are rejected.
   */
  private sanitizeStyleDeclarationValue(value: string): string {
    return SlideDeckEngine.Instance.SanitizeCssValue(value, '')
      .replace(/<\/style/gi, '')
      .replace(/[<>;{}]/g, '');
  }

  /**
   * Prints the deck via a sandboxed, CSP-isolated hidden iframe (no `window.open` / `document.write`)
   * and returns the printable HTML markup.
   */
  public ExportPrintablePdf(
    deck: SlideDeckSpec,
    blockResultsByBlockId: ReadonlyMap<string, DocumentBlockExecutionResult>,
    includeSpeakerNotes = true,
    user?: { ID: string; Name: string } | null,
  ): string {
    const parts = this.buildPrintableDeckParts(deck, blockResultsByBlockId, includeSpeakerNotes, user);
    PrintHtmlInSandboxedIframe(parts.bodyHtml, {
      Title: parts.title,
      TrustedPrintCss: parts.css,
    });
    return this.BuildPrintableDeckHtml(deck, blockResultsByBlockId, includeSpeakerNotes, user);
  }

  private renderPrintableRegionHtml(region: SlideRegionSpec): string {
    const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
    if (block) {
      if (block.FrozenSnapshot && block.FrozenSnapshot.Columns.length > 0) {
        const cols = block.FrozenSnapshot.Columns;
        const ths = cols.map((c) => `<th>${EscapeHtml(c.DisplayName || c.Name)}</th>`).join('');
        const trs = block.FrozenSnapshot.Rows.map((row) => {
          const tds = cols.map((c) => `<td>${EscapeHtml(String(row[c.Name] ?? ''))}</td>`).join('');
          return `<tr>${tds}</tr>`;
        }).join('');
        const chartNote =
          block.DisplayMode === 'chart' || Boolean(block.SheetChartID)
            ? ` · ${EscapeHtml(block.ChartType || 'bar')} chart`
            : '';
        return `<div class="print-region-card">
          <h4>${EscapeHtml(block.Title || region.Label)} (Frozen Snapshot${chartNote})</h4>
          <table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>
        </div>`;
      }
      return `<div class="print-region-card">
        <h4>${EscapeHtml(block.Title || region.Label)} (${EscapeHtml(block.Kind)})</h4>
        <p>Artifact / Block ID: ${EscapeHtml(block.ArtifactID || block.BlockID)}</p>
      </div>`;
    }

    if (region.Kind === 'big-number') {
      return `<div class="print-region-card">
        <div class="print-big-number">${EscapeHtml(region.BigNumberValue || '')}</div>
        <div><strong>${EscapeHtml(region.BigNumberLabel || '')}</strong></div>
        ${region.BigNumberDelta ? `<div>${EscapeHtml(region.BigNumberDelta)}</div>` : ''}
      </div>`;
    }

    if (region.Kind === 'quote') {
      return `<div class="print-region-card">
        <blockquote>${EscapeHtml(region.MarkdownContent)}</blockquote>
        ${region.QuoteAttribution ? `<cite>— ${EscapeHtml(region.QuoteAttribution)}</cite>` : ''}
      </div>`;
    }

    if (region.Kind === 'image') {
      const safeSrc = SlideDeckEngine.Instance.SanitizeImageUrl(region.ImageUrl ?? '');
      if (safeSrc) {
        return `<div class="print-region-card">
          <img src="${EscapeHtml(safeSrc)}" alt="${EscapeHtml(region.ImageAlt || region.Label)}" />
        </div>`;
      }
      return `<div class="print-region-card"><p>${EscapeHtml(region.ImageAlt || region.Label)}</p></div>`;
    }

    if (region.Kind === 'table') {
      const parsedTable = this.parseMarkdownPipeTable(region.MarkdownContent);
      if (parsedTable) {
        const ths = parsedTable.Headers.map((h) => `<th>${EscapeHtml(h)}</th>`).join('');
        const trs = parsedTable.Rows.map(
          (row) => `<tr>${row.map((cell) => `<td>${EscapeHtml(cell)}</td>`).join('')}</tr>`,
        ).join('');
        return `<div class="print-region-card"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
      }
    }

    const lines = (region.MarkdownContent || '')
      .split('\n')
      .map((l) => `<p>${EscapeHtml(l)}</p>`)
      .join('');
    return `<div class="print-region-card">${lines}</div>`;
  }

  private parseMarkdownPipeTable(markdown: string): { Headers: string[]; Rows: string[][] } | null {
    const rawLines = (markdown || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('|'));
    if (rawLines.length < 2) {
      return null;
    }
    const splitRow = (line: string): string[] =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
    const headers = splitRow(rawLines[0]);
    if (headers.length === 0) {
      return null;
    }
    const startIdx = /^[-|:\s]+$/.test(rawLines[1]) ? 2 : 1;
    const rows = rawLines.slice(startIdx).map(splitRow);
    return { Headers: headers, Rows: rows };
  }

  /**
   * Parses a `.pptx` PKZIP byte buffer into raw `filePath -> Uint8Array` binary entries
   * so tests and exporters can inspect embedded PNG assets (`ppt/media/image*.png`).
   */
  public InspectPptxArchiveBinaryEntries(pptxBytes: Uint8Array): Map<string, Uint8Array> {
    return SpreadsheetEngine.Instance.ExtractZipArchive(pptxBytes);
  }

  private buildContentTypesXml(slideCount: number, hasPngMedia = false): string {
    const slideOverrides: string[] = [];
    for (let i = 1; i <= slideCount; i++) {
      slideOverrides.push(
        `  <Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      );
      slideOverrides.push(
        `  <Override PartName="/ppt/notesSlides/notesSlide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`,
      );
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>${
    hasPngMedia ? '\n  <Default Extension="png" ContentType="image/png"/>' : ''
  }
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
${slideOverrides.join('\n')}
</Types>`;
  }

  private buildRootRelsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;
  }

  private buildPresentationXml(deck: SlideDeckSpec, slides: SlideSpec[] = deck.Slides): string {
    const sldIds = slides.map(
      (_, idx) => `    <p:sldId id="${256 + idx}" r:id="rIdSlide${idx + 1}"/>`,
    ).join('\n');
    const isFourByThree = deck.AspectRatio === '4:3';
    const cx = isFourByThree ? 9144000 : 12192000;
    const cy = 6858000;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rIdMaster1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
${sldIds}
  </p:sldIdLst>
  <p:sldSz cx="${cx}" cy="${cy}"${isFourByThree ? ' type="screen4x3"' : ' type="screen16x9"'}/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;
  }

  private buildPresentationRelsXml(slideCount: number): string {
    const rels: string[] = [
      `  <Relationship Id="rIdMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
      `  <Relationship Id="rIdTheme1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`,
    ];
    for (let i = 1; i <= slideCount; i++) {
      rels.push(
        `  <Relationship Id="rIdSlide${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`,
      );
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels.join('\n')}
</Relationships>`;
  }

  private buildThemeXml(deck: SlideDeckSpec): string {
    const stripHash = (hex: string, fallback: string): string => {
      const cleaned = (hex || '').replace(/^#/, '').trim();
      return /^[0-9a-fA-F]{6}$/.test(cleaned) ? cleaned.toUpperCase() : fallback;
    };

    const primary = stripHash(deck.Theme.PrimaryColor, '2563EB');
    const accent = stripHash(deck.Theme.AccentColor, '0EA5E9');
    const bg = stripHash(deck.Theme.BackgroundColor, 'FFFFFF');
    const text = stripHash(deck.Theme.TextColor, '0F172A');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${this.escapeXml(deck.Theme.Name)}">
  <a:themeElements>
    <a:clrScheme name="${this.escapeXml(deck.Theme.ThemeID)}">
      <a:dk1><a:srgbClr val="${text}"/></a:dk1>
      <a:lt1><a:srgbClr val="${bg}"/></a:lt1>
      <a:dk2><a:srgbClr val="${primary}"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="${primary}"/></a:accent1>
      <a:accent2><a:srgbClr val="${accent}"/></a:accent2>
      <a:accent3><a:srgbClr val="${primary}"/></a:accent3>
      <a:accent4><a:srgbClr val="${accent}"/></a:accent4>
      <a:accent5><a:srgbClr val="${primary}"/></a:accent5>
      <a:accent6><a:srgbClr val="${accent}"/></a:accent6>
      <a:hlink><a:srgbClr val="${primary}"/></a:hlink>
      <a:folHlink><a:srgbClr val="${accent}"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="MJFonts">
      <a:majorFont><a:latin typeface="${this.escapeXml(deck.Theme.HeadingFont || 'Inter')}"/></a:majorFont>
      <a:minorFont><a:latin typeface="${this.escapeXml(deck.Theme.BodyFont || 'Inter')}"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="MJFormat">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="50000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="80000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="30000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="40000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="60000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>`;
  }

  private buildSlideMasterXml(deck: SlideDeckSpec): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      ${this.buildTextShapeXml(2, 'MasterHeader', 457200, 180000, 11277600, 320000, [
        `${deck.Master.HeaderText || deck.Title} — ${deck.Master.OrganizationName || 'MemberJunction'}`,
      ])}
      ${this.buildTextShapeXml(3, 'MasterFooter', 457200, 6400000, 11277600, 320000, [
        deck.Master.FooterText || 'Confidential',
      ])}
    </p:spTree>
  </p:cSld>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="2147483649" r:id="rIdLayout1"/>
  </p:sldLayoutIdLst>
</p:sldMaster>`;
  }

  private buildSlideMasterRelsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLayout1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rIdTheme1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`;
  }

  private buildSlideLayoutXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             type="obj">
  <p:cSld name="MJ 16:9 Layout">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
    </p:spTree>
  </p:cSld>
</p:sldLayout>`;
  }

  private buildSlideLayoutRelsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;
  }

  private buildSlideXml(
    slide: SlideSpec,
    slideNumber: number,
    totalSlides: number,
    deck: SlideDeckSpec,
    mediaContext?: {
      allocateImage: (bytes: Uint8Array) => string;
      rasterizedImagesByBlockId?: ReadonlyMap<string, Uint8Array>;
      blockResultsByBlockId?: ReadonlyMap<string, DocumentBlockExecutionResult>;
    },
  ): string {
    const shapes: string[] = [];
    let nextShapeId = 2;
    const isFourByThree = deck.AspectRatio === '4:3';
    const slideCx = isFourByThree ? 9144000 : 12192000;
    const marginX = 609600;
    const contentW = slideCx - marginX * 2;

    // 1. Title & Subtitle Shape
    const headerLines = [slide.Title];
    if (slide.Subtitle) {
      headerLines.push(slide.Subtitle);
    }
    shapes.push(
      this.buildTextShapeXml(nextShapeId++, 'SlideTitle', marginX, 457200, contentW, 1143000, headerLines),
    );

    // 2. Slide Regions (RichText, Callouts, BigNumbers, Quotes, Frozen MJ Data Tables, Charts/Whiteboards)
    const regionCount = Math.max(slide.Regions.length, 1);
    const regionWidth = Math.floor(contentW / regionCount);

    slide.Regions.forEach((region, rIdx) => {
      const x = marginX + rIdx * regionWidth;
      const y = 1752600;
      const w = Math.max(regionWidth - 152400, 457200);
      const h = 4419600;

      const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
      if (block) {
        if (IsVisualDiagramOrChartBlock(block) && mediaContext) {
          const customBytes = mediaContext.rasterizedImagesByBlockId?.get(block.BlockID);
          const liveResult = mediaContext.blockResultsByBlockId?.get(block.BlockID);
          const pngBytes =
            customBytes && customBytes.byteLength > 0
              ? customBytes
              : RasterizeBlockDiagramToPng(
                  block,
                  {
                    Primary: deck.Theme?.PrimaryColor,
                    Accent: deck.Theme?.AccentColor,
                  },
                  liveResult,
                );
          const relId = mediaContext.allocateImage(pngBytes);
          const imgHeight = block.FrozenSnapshot && block.FrozenSnapshot.Columns.length > 0 ? Math.floor(h * 0.52) : h;
          shapes.push(
            this.buildPictureXml(nextShapeId++, block.Title || region.Label, relId, x, y, w, imgHeight),
          );
          if (block.FrozenSnapshot && block.FrozenSnapshot.Columns.length > 0) {
            shapes.push(
              this.buildBlockRegionXml(
                nextShapeId++,
                block,
                region,
                x,
                y + imgHeight + 91440,
                w,
                Math.max(h - imgHeight - 91440, 457200),
              ),
            );
          }
          return;
        }
        shapes.push(this.buildBlockRegionXml(nextShapeId++, block, region, x, y, w, h));
        return;
      }

      if (region.Kind === 'image' && region.ImageUrl && mediaContext) {
        const pngMatch = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/i.exec(region.ImageUrl.trim());
        if (pngMatch) {
          const rawStr = typeof atob === 'function' ? atob(pngMatch[1]) : Buffer.from(pngMatch[1], 'base64').toString('binary');
          const bytes = new Uint8Array(rawStr.length);
          for (let i = 0; i < rawStr.length; i++) {
            bytes[i] = rawStr.charCodeAt(i);
          }
          const relId = mediaContext.allocateImage(bytes);
          shapes.push(this.buildPictureXml(nextShapeId++, region.ImageAlt || region.Label, relId, x, y, w, h));
          return;
        }
      }

      if (region.Kind === 'big-number') {
        const kpiLines = [
          region.BigNumberValue || '',
          region.BigNumberLabel || '',
          region.BigNumberDelta || '',
        ].filter((l) => l.length > 0);
        shapes.push(this.buildTextShapeXml(nextShapeId++, `Region_${region.RegionID}`, x, y, w, h, kpiLines));
        return;
      }

      if (region.Kind === 'quote') {
        const quoteLines = [
          region.MarkdownContent || '',
          region.QuoteAttribution ? `— ${region.QuoteAttribution}` : '',
        ].filter((l) => l.length > 0);
        shapes.push(this.buildTextShapeXml(nextShapeId++, `Region_${region.RegionID}`, x, y, w, h, quoteLines));
        return;
      }

      const textLines = (region.MarkdownContent || '')
        .split('\n')
        .map((line) => line.replace(/^#{1,6}\s+/, '').replace(/^[-*+]\s+/, '• ').trim())
        .filter((line) => line.length > 0);

      shapes.push(
        this.buildTextShapeXml(
          nextShapeId++,
          `Region_${region.RegionID}`,
          x,
          y,
          w,
          h,
          textLines.length > 0 ? textLines : [region.Label],
        ),
      );
    });

    // 3. Footer / Slide Number Shape
    if (deck.Master.ShowSlideNumbers) {
      shapes.push(
        this.buildTextShapeXml(
          nextShapeId++,
          'SlideFooterNumber',
          marginX,
          6324600,
          contentW,
          381000,
          [`${deck.Master.FooterText || deck.Title} · Slide ${slideNumber} / ${totalSlides}`],
        ),
      );
    }

    const showAttr = slide.Hidden ? ' show="0"' : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"${showAttr}>
  <p:cSld name="${this.escapeXml(slide.Title)}">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
${shapes.join('\n')}
    </p:spTree>
  </p:cSld>
</p:sld>`;
  }

  private buildBlockRegionXml(
    shapeId: number,
    block: DocumentBlockSpec,
    region: SlideRegionSpec,
    x: number,
    y: number,
    w: number,
    h: number,
  ): string {
    if (block.FrozenSnapshot && block.FrozenSnapshot.Columns.length > 0) {
      const cols = block.FrozenSnapshot.Columns;
      const rows = block.FrozenSnapshot.Rows;
      const colWidth = Math.max(1, Math.floor(w / cols.length));

      const gridCols = cols.map(() => `            <a:gridCol w="${colWidth}"/>`).join('\n');
      const headerCells = cols
        .map(
          (col) => `            <a:tc>
              <a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${this.escapeXml(col.DisplayName || col.Name)}</a:t></a:r></a:p></a:txBody>
              <a:tcPr/>
            </a:tc>`,
        )
        .join('\n');

      const dataRowsXml = rows
        .map((row) => {
          const cells = cols
            .map(
              (col) => `            <a:tc>
              <a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${this.escapeXml(String(row[col.Name] ?? ''))}</a:t></a:r></a:p></a:txBody>
              <a:tcPr/>
            </a:tc>`,
            )
            .join('\n');
          return `          <a:tr h="370840">\n${cells}\n          </a:tr>`;
        })
        .join('\n');

      return `      <p:graphicFrame>
        <p:nvGraphicFramePr>
          <p:cNvPr id="${shapeId}" name="${this.escapeXml(block.Title || region.Label)}"/>
          <p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>
          <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></p:xfrm>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
            <a:tbl>
              <a:tblPr firstRow="1" bandRow="1"/>
              <a:tblGrid>
${gridCols}
              </a:tblGrid>
              <a:tr h="370840">
${headerCells}
              </a:tr>
${dataRowsXml}
            </a:tbl>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>`;
    }

    const summaryLines = [
      `[MJ ${block.Kind} Block: ${block.Title || region.Label}]`,
      block.ArtifactType ? `Embedded OLE Artifact Type: ${block.ArtifactType}` : '',
      block.ArtifactID ? `Artifact ID: ${block.ArtifactID}` : '',
      block.EntityName ? `Entity: ${block.EntityName}` : '',
      block.QueryName ? `Query: ${block.QueryName}` : '',
      `Mode: ${block.Mode}`,
    ].filter((l) => l.length > 0);

    return this.buildTextShapeXml(shapeId, `Block_${block.BlockID}`, x, y, w, h, summaryLines);
  }

  private buildTextShapeXml(
    id: number,
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    paragraphs: string[],
  ): string {
    const pXml = paragraphs
      .map(
        (text) =>
          `          <a:p><a:r><a:t>${this.escapeXml(text)}</a:t></a:r></a:p>`,
      )
      .join('\n');

    return `      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="${id}" name="${this.escapeXml(name)}"/>
          <p:cNvSpPr txBox="1"/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
        <p:txBody>
          <a:bodyPr wrap="square"/>
          <a:lstStyle/>
${pXml}
        </p:txBody>
      </p:sp>`;
  }

  private buildPictureXml(
    id: number,
    name: string,
    relId: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): string {
    return `      <p:pic>
        <p:nvPicPr>
          <p:cNvPr id="${id}" name="${this.escapeXml(name)}"/>
          <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
          <p:nvPr/>
        </p:nvPicPr>
        <p:blipFill>
          <a:blip r:embed="${this.escapeXml(relId)}"/>
          <a:stretch><a:fillRect/></a:stretch>
        </p:blipFill>
        <p:spPr>
          <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </p:spPr>
      </p:pic>`;
  }

  private buildSlideRelsXml(slideNumber: number, imageRefs: ReadonlyArray<SlideMediaImageRef> = []): string {
    const imageRelLines = imageRefs
      .map(
        (img) =>
          `  <Relationship Id="${this.escapeXml(img.RelId)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${this.escapeXml(img.MediaFileName)}"/>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLayout1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rIdNotes1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${slideNumber}.xml"/>${
    imageRelLines ? `\n${imageRelLines}` : ''
  }
</Relationships>`;
  }

  private buildNotesSlideXml(slide: SlideSpec, slideNumber: number): string {
    const notesLines = (slide.SpeakerNotes || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
         xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
         xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="Notes Slide ${slideNumber}">
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
${this.buildTextShapeXml(2, 'SpeakerNotesBody', 685800, 4572000, 5486400, 3657600, notesLines.length > 0 ? notesLines : [''])}
    </p:spTree>
  </p:cSld>
</p:notes>`;
  }

  private buildNotesSlideRelsXml(slideNumber: number): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdSlide1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${slideNumber}.xml"/>
</Relationships>`;
  }

  private escapeXml(value: string): string {
    return (value ?? '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, () => '&amp;')
      .replace(/</g, () => '&lt;')
      .replace(/>/g, () => '&gt;')
      .replace(/"/g, () => '&quot;')
      .replace(/'/g, () => '&apos;');
  }

  /**
   * Packs a map of `path -> utf8Content` into a valid uncompressed PKZIP archive (`Uint8Array`).
   */
  private packZipArchive(entries: ReadonlyMap<string, string | Uint8Array>): Uint8Array {
    const encoder = new TextEncoder();
    const localHeadersAndData: Uint8Array[] = [];
    const centralHeaders: Uint8Array[] = [];
    let localOffset = 0;

    entries.forEach((content, filePath) => {
      const nameBytes = encoder.encode(filePath);
      const dataBytes = content instanceof Uint8Array ? content : encoder.encode(content);
      const crc = this.computeCrc32(dataBytes);

      const localHeader = new Uint8Array(30 + nameBytes.byteLength);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true); // Local file header signature
      localView.setUint16(4, 20, true); // Version needed to extract (2.0)
      localView.setUint16(6, 0, true); // General purpose bit flag
      localView.setUint16(8, 0, true); // Compression method (0 = STORE)
      localView.setUint16(10, 0, true); // Last mod file time
      localView.setUint16(12, 0x5421, true); // Last mod file date
      localView.setUint32(14, crc, true); // CRC-32
      localView.setUint32(18, dataBytes.byteLength, true); // Compressed size
      localView.setUint32(22, dataBytes.byteLength, true); // Uncompressed size
      localView.setUint16(26, nameBytes.byteLength, true); // File name length
      localView.setUint16(28, 0, true); // Extra field length
      localHeader.set(nameBytes, 30);

      localHeadersAndData.push(localHeader, dataBytes);

      const centralHeader = new Uint8Array(46 + nameBytes.byteLength);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true); // Central directory file header signature
      centralView.setUint16(4, 20, true); // Version made by
      centralView.setUint16(6, 20, true); // Version needed to extract
      centralView.setUint16(8, 0, true); // General purpose bit flag
      centralView.setUint16(10, 0, true); // Compression method (0 = STORE)
      centralView.setUint16(12, 0, true); // Last mod file time
      centralView.setUint16(14, 0x5421, true); // Last mod file date
      centralView.setUint32(16, crc, true); // CRC-32
      centralView.setUint32(20, dataBytes.byteLength, true); // Compressed size
      centralView.setUint32(24, dataBytes.byteLength, true); // Uncompressed size
      centralView.setUint16(28, nameBytes.byteLength, true); // File name length
      centralView.setUint16(30, 0, true); // Extra field length
      centralView.setUint16(32, 0, true); // File comment length
      centralView.setUint16(34, 0, true); // Disk number start
      centralView.setUint16(36, 0, true); // Internal file attributes
      centralView.setUint32(38, 0, true); // External file attributes
      centralView.setUint32(42, localOffset, true); // Relative offset of local header
      centralHeader.set(nameBytes, 46);

      centralHeaders.push(centralHeader);
      localOffset += localHeader.byteLength + dataBytes.byteLength;
    });

    const centralDirSize = centralHeaders.reduce((sum, arr) => sum + arr.byteLength, 0);
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    eocdView.setUint32(0, 0x06054b50, true); // End of central directory signature
    eocdView.setUint16(4, 0, true); // Number of this disk
    eocdView.setUint16(6, 0, true); // Disk where central directory starts
    eocdView.setUint16(8, entries.size, true); // Number of central directory records on this disk
    eocdView.setUint16(10, entries.size, true); // Total number of central directory records
    eocdView.setUint32(12, centralDirSize, true); // Size of central directory
    eocdView.setUint32(16, localOffset, true); // Offset of start of central directory
    eocdView.setUint16(20, 0, true); // Comment length

    const totalLength = localOffset + centralDirSize + eocd.byteLength;
    const output = new Uint8Array(totalLength);
    let cursor = 0;

    for (const chunk of localHeadersAndData) {
      output.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    for (const chunk of centralHeaders) {
      output.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    output.set(eocd, cursor);
    return output;
  }

  private computeCrc32(bytes: Uint8Array): number {
    if (!SlideDeckExportService.crcTable) {
      const table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
      }
      SlideDeckExportService.crcTable = table;
    }
    const table = SlideDeckExportService.crcTable;
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.byteLength; i++) {
      crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private triggerBlobDownload(blob: Blob, fileName: string): void {
    if (
      typeof document === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}
