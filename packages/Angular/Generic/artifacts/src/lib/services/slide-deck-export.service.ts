import { Injectable } from '@angular/core';
import {
  SlideDeckEngine,
  type SlideDeckSpec,
  type SlideSpec,
  type SlideRegionSpec,
  type DocumentBlockExecutionResult,
  type DocumentBlockSpec,
} from '@memberjunction/core-entities';
import { EscapeHtml } from '../components/previews/office-preview.logic';

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
  ): PptxExportPackage {
    const frozenDeck = SlideDeckEngine.Instance.FreezeDeckLiveBlocksForPresentation(
      deck,
      blockResultsByBlockId,
      user,
    );

    let frozenBlockCount = 0;
    for (const slide of frozenDeck.Slides) {
      for (const region of slide.Regions) {
        const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
        if (block && block.Mode === 'Frozen' && block.FrozenSnapshot) {
          frozenBlockCount++;
        }
      }
    }

    const entries = new Map<string, string>();
    const slides = frozenDeck.Slides;

    entries.set('[Content_Types].xml', this.buildContentTypesXml(slides.length));
    entries.set('_rels/.rels', this.buildRootRelsXml());
    entries.set('ppt/presentation.xml', this.buildPresentationXml(frozenDeck));
    entries.set('ppt/_rels/presentation.xml.rels', this.buildPresentationRelsXml(slides.length));
    entries.set('ppt/theme/theme1.xml', this.buildThemeXml(frozenDeck));
    entries.set('ppt/slideMasters/slideMaster1.xml', this.buildSlideMasterXml(frozenDeck));
    entries.set('ppt/slideMasters/_rels/slideMaster1.xml.rels', this.buildSlideMasterRelsXml());
    entries.set('ppt/slideLayouts/slideLayout1.xml', this.buildSlideLayoutXml());
    entries.set('ppt/slideLayouts/_rels/slideLayout1.xml.rels', this.buildSlideLayoutRelsXml());

    slides.forEach((slide, index) => {
      const slideNum = index + 1;
      entries.set(
        `ppt/slides/slide${slideNum}.xml`,
        this.buildSlideXml(slide, slideNum, slides.length, frozenDeck),
      );
      entries.set(`ppt/slides/_rels/slide${slideNum}.xml.rels`, this.buildSlideRelsXml(slideNum));
      entries.set(
        `ppt/notesSlides/notesSlide${slideNum}.xml`,
        this.buildNotesSlideXml(slide, slideNum),
      );
      entries.set(
        `ppt/notesSlides/_rels/notesSlide${slideNum}.xml.rels`,
        this.buildNotesSlideRelsXml(slideNum),
      );
    });

    const bytes = this.packZipArchive(entries);
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
  ): PptxExportPackage {
    const pkg = this.ExportToPptxPackage(deck, blockResultsByBlockId, user);
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
   * Parses a `.pptx` PKZIP byte buffer generated by {@link ExportToPptxPackage} into a map of
   * `filePath -> utf8XmlString` for deterministic inspection in unit and E2E tests.
   */
  public InspectPptxArchiveEntries(pptxBytes: Uint8Array): Map<string, string> {
    const entries = new Map<string, string>();
    const view = new DataView(pptxBytes.buffer, pptxBytes.byteOffset, pptxBytes.byteLength);
    const decoder = new TextDecoder('utf-8');

    let offset = 0;
    while (offset + 30 <= pptxBytes.byteLength) {
      const signature = view.getUint32(offset, true);
      if (signature !== 0x04034b50) {
        break;
      }
      const compressedSize = view.getUint32(offset + 18, true);
      const fileNameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const nameStart = offset + 30;
      const nameBytes = pptxBytes.subarray(nameStart, nameStart + fileNameLen);
      const fileName = decoder.decode(nameBytes);

      const dataStart = nameStart + fileNameLen + extraLen;
      const dataBytes = pptxBytes.subarray(dataStart, dataStart + compressedSize);
      entries.set(fileName, decoder.decode(dataBytes));

      offset = dataStart + compressedSize;
    }

    return entries;
  }

  /**
   * Builds a 16:9 widescreen printable HTML document for `.pdf` export (`§ 5.3`).
   */
  public BuildPrintableDeckHtml(
    deck: SlideDeckSpec,
    blockResultsByBlockId: ReadonlyMap<string, DocumentBlockExecutionResult>,
    includeSpeakerNotes = true,
    user?: { ID: string; Name: string } | null,
  ): string {
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
    const total = frozenDeck.Slides.length;

    const slideSections = frozenDeck.Slides.filter((s) => !s.Hidden).map((slide, idx) => {
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

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${EscapeHtml(frozenDeck.Title)}</title>
  <style>
    @page { size: 16in 9in; margin: 0; }
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
    }
  </style>
</head>
<body>
${slideSections.join('\n')}
</body>
</html>`;
  }

  /**
   * Keeps valid single/double quotes for CSS font-family declarations intact inside `<style>`
   * (where HTML entities like `&#39;` are not decoded) while guaranteeing `<`, `>`, and `</style`
   * can never appear.
   */
  private sanitizeStyleDeclarationValue(value: string): string {
    return (value || '').replace(/<\/style/gi, '').replace(/[<>]/g, '');
  }

  /**
   * Opens a browser print window for 16:9 PDF export of the presentation.
   */
  public ExportPrintablePdf(
    deck: SlideDeckSpec,
    blockResultsByBlockId: ReadonlyMap<string, DocumentBlockExecutionResult>,
    includeSpeakerNotes = true,
    user?: { ID: string; Name: string } | null,
  ): string {
    const html = this.BuildPrintableDeckHtml(deck, blockResultsByBlockId, includeSpeakerNotes, user);
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      const printWin = window.open('', '_blank', 'width=1280,height=720');
      if (printWin) {
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        printWin.print();
      }
    }
    return html;
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
        return `<div class="print-region-card">
          <h4>${EscapeHtml(block.Title || region.Label)} (Frozen Snapshot)</h4>
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

    const lines = (region.MarkdownContent || '')
      .split('\n')
      .map((l) => `<p>${EscapeHtml(l)}</p>`)
      .join('');
    return `<div class="print-region-card">${lines}</div>`;
  }

  private buildContentTypesXml(slideCount: number): string {
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
  <Default Extension="xml" ContentType="application/xml"/>
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

  private buildPresentationXml(deck: SlideDeckSpec): string {
    const sldIds = deck.Slides.map(
      (_, idx) => `    <p:sldId id="${256 + idx}" r:id="rIdSlide${idx + 1}"/>`,
    ).join('\n');

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
  <p:sldSz cx="12192000" cy="6858000"/>
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
    <a:fmtScheme name="MJFormat"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme>
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
  ): string {
    const shapes: string[] = [];
    let nextShapeId = 2;

    // 1. Title & Subtitle Shape
    const headerLines = [slide.Title];
    if (slide.Subtitle) {
      headerLines.push(slide.Subtitle);
    }
    shapes.push(
      this.buildTextShapeXml(nextShapeId++, 'SlideTitle', 609600, 457200, 10972800, 1143000, headerLines),
    );

    // 2. Slide Regions (RichText, Callouts, BigNumbers, Quotes, Frozen MJ Data Tables, OLE Whiteboards)
    const regionCount = Math.max(slide.Regions.length, 1);
    const regionWidth = Math.floor(10972800 / regionCount);

    slide.Regions.forEach((region, rIdx) => {
      const x = 609600 + rIdx * regionWidth;
      const y = 1752600;
      const w = regionWidth - 152400;
      const h = 4419600;

      const block = SlideDeckEngine.Instance.ExtractRegionBlockSpec(region);
      if (block) {
        shapes.push(this.buildBlockRegionXml(nextShapeId++, block, region, x, y, w, h));
        return;
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
          609600,
          6324600,
          10972800,
          381000,
          [`${deck.Master.FooterText || deck.Title} · Slide ${slideNumber} / ${totalSlides}`],
        ),
      );
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
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
      const colWidth = Math.max(Math.floor(w / cols.length), 914400);

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

  private buildSlideRelsXml(slideNumber: number): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLayout1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rIdNotes1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${slideNumber}.xml"/>
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
      .replace(/&/g, () => '&amp;')
      .replace(/</g, () => '&lt;')
      .replace(/>/g, () => '&gt;')
      .replace(/"/g, () => '&quot;')
      .replace(/'/g, () => '&apos;');
  }

  /**
   * Packs a map of `path -> utf8Content` into a valid uncompressed PKZIP archive (`Uint8Array`).
   */
  private packZipArchive(entries: ReadonlyMap<string, string>): Uint8Array {
    const encoder = new TextEncoder();
    const localHeadersAndData: Uint8Array[] = [];
    const centralHeaders: Uint8Array[] = [];
    let localOffset = 0;

    entries.forEach((content, filePath) => {
      const nameBytes = encoder.encode(filePath);
      const dataBytes = encoder.encode(content);
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
