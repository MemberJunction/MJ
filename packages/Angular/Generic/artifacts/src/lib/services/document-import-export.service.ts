import { Injectable } from '@angular/core';
import type * as DocxModule from 'docx';
import type TurndownService from 'turndown';
import {
  DocumentLiveBlockEngine,
  ValidateFrozenBlockSnapshot,
  type DocumentBlockExecutionResult,
  type DocumentBlockSpec,
} from '@memberjunction/core-entities';
import { ConvertDocxToHtml, type MammothModuleShim } from '../components/previews/office-preview.logic';
import { IsVisualDiagramOrChartBlock, RasterizeBlockDiagramToPng } from '../utils/diagram-png-encoder';
import { StripDocRecordLinksToPlainText } from '../utils/doc-record-link.util';
import { PrintHtmlInSandboxedIframe, SanitizeHtmlForSandboxedFrame } from '../utils/html-sandbox.util';

/** Options controlling optional `.docx` visual rasterization, live block rows, and snapshot verification (`§ 3.4`). */
export interface DocxExportOptions {
  /** Optional caller override supplying custom PNG bytes for an embedded chart or Whiteboard block. */
  RasterizeBlockToPng?: (block: DocumentBlockSpec) => Promise<Uint8Array | null>;
  /** Optional live execution results keyed by `BlockID` so Live blocks include current tabular data in DOCX exports. */
  LiveBlockResults?: ReadonlyMap<string, DocumentBlockExecutionResult>;
  /** Optional verifier callback returning whether a frozen block's snapshot signature/hash is verified. */
  VerifyFrozenSnapshot?: (block: DocumentBlockSpec) => boolean;
}

// dynamic-import: docx (~250KB OOXML archive builder) is deferred until .docx export is invoked to avoid eager bundle cost (Rule 8 #3)
let docxModulePromise: Promise<typeof DocxModule> | null = null;
function loadDocxModule(): Promise<typeof DocxModule> {
  if (!docxModulePromise) {
    docxModulePromise = import('docx').catch((err) => {
      docxModulePromise = null;
      throw err;
    });
  }
  return docxModulePromise;
}

type TurndownServiceConstructor = typeof TurndownService;

// dynamic-import: turndown (HTML-to-Markdown parser) is deferred until .docx/HTML import is invoked to avoid eager bundle cost (Rule 8 #3)
let turndownServicePromise: Promise<TurndownServiceConstructor> | null = null;
function loadTurndownService(): Promise<TurndownServiceConstructor> {
  if (!turndownServicePromise) {
    turndownServicePromise = import('turndown')
      .then((mod) => (typeof mod === 'function' ? mod : mod.default))
      .catch((err) => {
        turndownServicePromise = null;
        throw err;
      });
  }
  return turndownServicePromise;
}

// dynamic-import: mammoth is a heavy Office parser deferred until DOCX import/preview is invoked (Rule 8 #3)
let mammothModulePromise: Promise<MammothModuleShim> | null = null;
function loadMammothModule(): Promise<MammothModuleShim> {
  if (!mammothModulePromise) {
    mammothModulePromise = import('mammoth')
      .then((mod) => ({
        convertToHtml: (input) => mod.convertToHtml(input),
      }))
      .catch((err) => {
        mammothModulePromise = null;
        throw err;
      });
  }
  return mammothModulePromise;
}

/**
 * Sanitizes a printable HTML fragment using the shared DOMPurify sandbox sanitizer and additionally
 * removes `<link>` and `<form>` tags before printing inside a sandboxed iframe.
 */
function sanitizePrintableHtmlFragment(rawHtml: string): string {
  return SanitizeHtmlForSandboxedFrame(rawHtml ?? '', {
    AdditionalForbidTags: ['link', 'form'],
  });
}

/**
 * Service handling bidirectional document import and export for MJ Docs (§ 4.4):
 * - `.md` (Markdown with lossless `:::mj-block` directives)
 * - `.docx` (Microsoft Word via `mammoth` + `turndown` on import, `docx` on export)
 * - `.pdf` (Printable A4/Letter layout with rendered live blocks and embedded artifacts)
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentImportExportService {
  /**
   * Imports a `.md` file or raw string while preserving all `:::mj-block` directives.
   *
   * @param source File object or raw Markdown string
   * @returns Normalized Markdown content
   */
  public async ImportMarkdown(source: File | string): Promise<string> {
    const raw = typeof source === 'string' ? source : await source.text();
    return raw.replace(/\r\n/g, '\n');
  }

  /**
   * Converts `.docx` binary bytes to clean Markdown using `mammoth` (DOCX -> HTML)
   * followed by `turndown` (HTML -> Markdown), including custom table conversion rules.
   *
   * @param arrayBuffer Raw `.docx` bytes
   * @param mammothOverride Optional mammoth shim for deterministic testing
   * @returns Converted Markdown string
   */
  public async ConvertDocxBytesToMarkdown(
    arrayBuffer: ArrayBuffer,
    mammothOverride?: MammothModuleShim,
  ): Promise<string> {
    const mammothModule = mammothOverride ?? (await loadMammothModule());
    const html = await ConvertDocxToHtml(arrayBuffer, mammothModule);
    return this.ConvertHtmlToMarkdown(html);
  }

  /**
   * Converts sanitized or raw HTML into GFM-compatible Markdown, preserving headings,
   * lists, emphasis, code blocks, blockquotes, and HTML tables.
   *
   * @param html HTML string to convert
   * @returns Markdown string
   */
  public async ConvertHtmlToMarkdown(html: string): Promise<string> {
    const TurndownCtor = await loadTurndownService();
    const turndown = new TurndownCtor({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**',
    });

    turndown.addRule('htmlTable', {
      filter: 'table',
      replacement: (_content: string, node: Node): string => {
        const tableEl = node as HTMLElement;
        const rows = Array.from(tableEl.querySelectorAll('tr'));
        if (rows.length === 0) {
          return '';
        }
        const matrix: string[][] = rows.map((tr) =>
          Array.from(tr.querySelectorAll('th, td')).map((cell) =>
            (cell.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/\\/g, '\\\\').replace(/\|/g, '\\|'),
          ),
        );
        const colCount = Math.max(...matrix.map((r) => r.length), 1);
        const normalizeRow = (r: string[]): string => {
          const padded = [...r];
          while (padded.length < colCount) {
            padded.push('');
          }
          return `| ${padded.join(' | ')} |`;
        };
        const headerLine = normalizeRow(matrix[0]);
        const dividerLine = `| ${Array(colCount).fill('---').join(' | ')} |`;
        const bodyLines = matrix.slice(1).map(normalizeRow);
        return `\n\n${[headerLine, dividerLine, ...bodyLines].join('\n')}\n\n`;
      },
    });

    return turndown.turndown(html).trim();
  }

  /**
   * Imports a `.docx` file selected by the user and returns its Markdown representation.
   *
   * @param file Browser `File` object for a `.docx` document
   * @returns Markdown string
   */
  public async ImportDocxFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    return this.ConvertDocxBytesToMarkdown(buffer);
  }

  /**
   * Exports a Markdown document (including `:::mj-block` directives) into a `.docx`
   * binary buffer using the `docx` library.
   *
   * @param markdown Document Markdown content
   * @param title Document display title
   * @returns `Uint8Array` containing the `.docx` archive bytes
   */
  public async ConvertMarkdownToDocxBytes(
    markdown: string,
    title = 'Document',
    options?: DocxExportOptions,
  ): Promise<Uint8Array> {
    const docx = await loadDocxModule();
    const { Document: DocxDocument, ImageRun, Packer, Paragraph, TextRun } = docx;
    const children: Array<DocxModule.Paragraph | DocxModule.Table> = [];
    const normalizedMarkdown = StripDocRecordLinksToPlainText((markdown ?? '').replace(/\r\n?/g, '\n'));
    const lines = normalizedMarkdown.split('\n');
    const parsedSegments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(normalizedMarkdown);
    const blockByStartLine = new Map(
      parsedSegments.filter((s) => s.Type === 'mj-block' && s.BlockSpec).map((s) => [s.StartLine, s]),
    );

    let lineIdx = 0;
    while (lineIdx < lines.length) {
      const oneBasedLine = lineIdx + 1;
      const blockSeg = blockByStartLine.get(oneBasedLine);
      if (blockSeg && blockSeg.BlockSpec) {
        const block = blockSeg.BlockSpec;
        const isFrozen = block.Mode === 'Frozen';
        const isFrozenVerified = isFrozen
          ? (options?.VerifyFrozenSnapshot
              ? options.VerifyFrozenSnapshot(block)
              : (ValidateFrozenBlockSnapshot(block.FrozenSnapshot).Valid &&
                  Boolean(block.FrozenSnapshot?.SnapshotContentHash?.startsWith('hmac-sha256:'))))
          : false;
        const frozenAttribution =
          isFrozenVerified && (block.FrozenSnapshot?.FrozenByUserName || block.FrozenSnapshot?.FrozenByUserID)
            ? ` by ${block.FrozenSnapshot?.FrozenByUserName || block.FrozenSnapshot?.FrozenByUserID}`
            : '';
        const modeText = isFrozen
          ? isFrozenVerified
            ? `Frozen snapshot (${block.FrozenSnapshot?.FrozenAt ?? 'recorded'}${frozenAttribution})`
            : `Frozen snapshot (${block.FrozenSnapshot?.FrozenAt ?? 'recorded'}) — Unverified Snapshot (signature missing or invalid)`
          : 'Live MJ Block';
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `[MJ ${block.Kind} Block: ${block.Title ?? block.EntityName ?? block.QueryName ?? block.ArtifactType ?? block.BlockID}] (${modeText})`,
                bold: true,
              }),
            ],
            spacing: { before: 160, after: 80 },
          }),
        );
        if (IsVisualDiagramOrChartBlock(block)) {
          let pngBytes = (await options?.RasterizeBlockToPng?.(block)) ?? null;
          if (!pngBytes || pngBytes.byteLength === 0) {
            pngBytes = RasterizeBlockDiagramToPng(block);
          }
          if (pngBytes && pngBytes.byteLength > 0 && ImageRun) {
            children.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    type: 'png',
                    data: pngBytes,
                    transformation: { width: 520, height: 260 },
                  }),
                ],
                spacing: { before: 80, after: 120 },
              }),
            );
          }
        }
        const liveExecResult = !isFrozen ? options?.LiveBlockResults?.get(block.BlockID) : undefined;
        if (block.FrozenSnapshot && block.FrozenSnapshot.Columns.length > 0) {
          const colNames = block.FrozenSnapshot.Columns.map((c) => c.Name);
          children.push(this.buildDocxTable(docx, colNames, block.FrozenSnapshot.Rows));
        } else if (
          liveExecResult?.Success &&
          liveExecResult.Columns.length > 0 &&
          liveExecResult.Rows.length > 0
        ) {
          const colNames = liveExecResult.Columns.map((c) => c.Name);
          children.push(this.buildDocxTable(docx, colNames, liveExecResult.Rows));
        }
        lineIdx = blockSeg.EndLine;
        continue;
      }

      const line = lines[lineIdx];
      const trimmed = line.trim();

      if (trimmed.length === 0) {
        lineIdx++;
        continue;
      }

      // Horizontal rule
      if (/^(?:[-*_]\s*){3,}$/.test(trimmed)) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: '────────────────────────────────────────', color: '999999' })],
            spacing: { before: 120, after: 120 },
          }),
        );
        lineIdx++;
        continue;
      }

      // Heading
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        children.push(
          new Paragraph({
            children: this.parseInlineTextRuns(docx, text),
            heading: this.mapHeadingLevel(docx, level),
            spacing: { before: 200, after: 100 },
          }),
        );
        lineIdx++;
        continue;
      }

      // Markdown table
      if (
        trimmed.startsWith('|') &&
        trimmed.includes('|', 1) &&
        (trimmed.endsWith('|') ||
          (lineIdx + 1 < lines.length &&
            this.isMarkdownTableSeparatorLine(lines[lineIdx + 1].trim())))
      ) {
        const tableLines: string[] = [];
        while (lineIdx < lines.length && lines[lineIdx].trim().startsWith('|')) {
          tableLines.push(lines[lineIdx].trim());
          lineIdx++;
        }
        const parsedTable = this.parseMarkdownTableLines(tableLines);
        if (parsedTable.headers.length > 0) {
          children.push(this.buildDocxTableFromCells(docx, parsedTable.headers, parsedTable.rows));
        }
        continue;
      }

      // Fenced code block
      if (trimmed.startsWith('```')) {
        const codeLines: string[] = [];
        lineIdx++;
        while (lineIdx < lines.length && !lines[lineIdx].trim().startsWith('```')) {
          codeLines.push(lines[lineIdx]);
          lineIdx++;
        }
        if (lineIdx < lines.length) {
          lineIdx++; // skip closing fence
        }
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: codeLines.join('\n'),
                font: 'Courier New',
                size: 20,
              }),
            ],
            spacing: { before: 120, after: 120 },
          }),
        );
        continue;
      }

      // Bullet / task list
      const bulletMatch = /^[-*+]\s+(?:\[([ xX])\]\s+)?(.+)$/.exec(trimmed);
      if (bulletMatch) {
        const checkbox = bulletMatch[1] !== undefined ? (bulletMatch[1].toLowerCase() === 'x' ? '☑ ' : '☐ ') : '';
        children.push(
          new Paragraph({
            children: this.parseInlineTextRuns(docx, `${checkbox}${bulletMatch[2]}`),
            bullet: { level: 0 },
          }),
        );
        lineIdx++;
        continue;
      }

      // Ordered list
      const orderedMatch = /^(\d+)\.\s+(.+)$/.exec(trimmed);
      if (orderedMatch) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${orderedMatch[1]}. `, bold: true }),
              ...this.parseInlineTextRuns(docx, orderedMatch[2]),
            ],
            indent: { left: 360 },
            spacing: { after: 60 },
          }),
        );
        lineIdx++;
        continue;
      }

      // Blockquote / callout
      if (trimmed.startsWith('>')) {
        const quoteText = trimmed.replace(/^>\s*/, '');
        children.push(
          new Paragraph({
            children: this.parseInlineTextRuns(docx, quoteText),
            indent: { left: 480 },
            spacing: { before: 80, after: 80 },
          }),
        );
        lineIdx++;
        continue;
      }

      // Standard paragraph
      children.push(
        new Paragraph({
          children: this.parseInlineTextRuns(docx, trimmed),
          spacing: { after: 120 },
        }),
      );
      lineIdx++;
    }

    const doc = new DocxDocument({
      title,
      sections: [
        {
          properties: {},
          children: children.length > 0 ? children : [new Paragraph({ text: '' })],
        },
      ],
    });

    return new Uint8Array(await Packer.toArrayBuffer(doc));
  }

  /**
   * Triggers a browser download of the Markdown document as a `.md` file.
   */
  public DownloadMarkdownFile(markdown: string, fileName = 'document.md'): void {
    const normalizedName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    this.triggerBlobDownload(blob, normalizedName);
  }

  /**
   * Generates a `.docx` file from the Markdown document and triggers a browser download.
   */
  public async DownloadDocxFile(
    markdown: string,
    fileName = 'document.docx',
    title = 'Document',
    options?: DocxExportOptions,
  ): Promise<void> {
    const normalizedName = fileName.endsWith('.docx') ? fileName : `${fileName}.docx`;
    const bytes = await this.ConvertMarkdownToDocxBytes(markdown, title, options);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    this.triggerBlobDownload(blob, normalizedName);
  }

  /**
   * Prints a sanitized HTML document inside an isolated `<iframe sandbox="allow-modals">`
   * with strict CSP metadata and escaped title (P0-19).
   */
  public ExportPrintablePdf(
    renderedHtml: string,
    title: string,
    orientation: 'portrait' | 'landscape' = 'portrait',
  ): void {
    if (typeof document === 'undefined') {
      return;
    }
    const safeOrientation: 'landscape' | 'portrait' = orientation === 'landscape' ? 'landscape' : 'portrait';
    const sanitizedBody = sanitizePrintableHtmlFragment(renderedHtml);
    const trustedPrintCss = [
      `@page { size: A4 ${safeOrientation}; margin: 18mm; }`,
      'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.65; font-size: 13px; color: #111; }',
      'h1, h2, h3, h4 { margin-top: 1.4em; margin-bottom: 0.45em; font-weight: 700; }',
      'table { border-collapse: collapse; width: 100%; margin: 12px 0; }',
      'th, td { border: 1px solid rgba(0, 0, 0, 0.25); padding: 6px 10px; text-align: left; }',
      'th { background: rgba(0, 0, 0, 0.05); font-weight: 600; }',
      'pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: rgba(0, 0, 0, 0.05); border-radius: 4px; }',
      'pre { padding: 10px 12px; overflow-x: auto; }',
      'blockquote { border-left: 3px solid rgba(0, 0, 0, 0.4); margin: 10px 0; padding: 6px 12px; background: rgba(0, 0, 0, 0.03); }',
    ].join('\n');

    PrintHtmlInSandboxedIframe(sanitizedBody, {
      Title: title || 'Document',
      TrustedPrintCss: trustedPrintCss,
      DocumentRef: document,
    });
  }

  private mapHeadingLevel(
    docx: typeof DocxModule,
    level: number,
  ): (typeof DocxModule.HeadingLevel)[keyof typeof DocxModule.HeadingLevel] {
    const { HeadingLevel } = docx;
    switch (level) {
      case 1:
        return HeadingLevel.HEADING_1;
      case 2:
        return HeadingLevel.HEADING_2;
      case 3:
        return HeadingLevel.HEADING_3;
      case 4:
        return HeadingLevel.HEADING_4;
      case 5:
        return HeadingLevel.HEADING_5;
      default:
        return HeadingLevel.HEADING_6;
    }
  }

  private parseInlineTextRuns(
    docx: typeof DocxModule,
    text: string,
  ): Array<DocxModule.TextRun | DocxModule.ExternalHyperlink> {
    const { TextRun, ExternalHyperlink } = docx;
    const runs: Array<DocxModule.TextRun | DocxModule.ExternalHyperlink> = [];
    const tokenRegex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
      }
      if (match[2] !== undefined) {
        runs.push(new TextRun({ text: match[2], bold: true }));
      } else if (match[3] !== undefined) {
        runs.push(new TextRun({ text: match[3], italics: true }));
      } else if (match[4] !== undefined) {
        runs.push(new TextRun({ text: match[4], strike: true }));
      } else if (match[5] !== undefined) {
        runs.push(new TextRun({ text: match[5], font: 'Courier New' }));
      } else if (match[6] !== undefined && match[7] !== undefined && ExternalHyperlink) {
        runs.push(
          new ExternalHyperlink({
            link: match[7],
            children: [new TextRun({ text: match[6], style: 'Hyperlink' })],
          }),
        );
      } else if (match[6] !== undefined) {
        runs.push(new TextRun({ text: match[6] }));
      }
      lastIndex = tokenRegex.lastIndex;
    }
    if (lastIndex < text.length) {
      runs.push(new TextRun({ text: text.slice(lastIndex) }));
    }
    return runs.length > 0 ? runs : [new TextRun({ text })];
  }

  private isMarkdownTableSeparatorLine(line: string): boolean {
    const cells = this.splitEscapedPipeRow(line);
    return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
  }

  private splitEscapedPipeRow(line: string): string[] {
    let trimmed = line.trim();
    if (trimmed.startsWith('|')) {
      trimmed = trimmed.slice(1);
    }
    if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) {
      trimmed = trimmed.slice(0, -1);
    }
    const cells: string[] = [];
    let current = '';
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (ch === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
        current += '|';
        i++;
        continue;
      }
      if (ch === '|') {
        cells.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  }

  private parseMarkdownTableLines(lines: string[]): { headers: string[]; rows: string[][] } {
    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }
    const headers = this.splitEscapedPipeRow(lines[0]);
    const bodyStart = lines.length > 1 && this.isMarkdownTableSeparatorLine(lines[1]) ? 2 : 1;
    const rows = lines.slice(bodyStart).map((line) => this.splitEscapedPipeRow(line));
    return { headers, rows };
  }

  private buildDocxTable(
    docx: typeof DocxModule,
    columns: string[],
    rows: NonNullable<DocumentBlockSpec['FrozenSnapshot']>['Rows'],
  ): DocxModule.Table {
    const cellMatrix = rows.map((r) => columns.map((col) => (r[col] == null ? '' : String(r[col]))));
    return this.buildDocxTableFromCells(docx, columns, cellMatrix);
  }

  private buildDocxTableFromCells(
    docx: typeof DocxModule,
    headers: string[],
    rows: string[][],
  ): DocxModule.Table {
    const {
      Table: DocxTable,
      TableRow: DocxTableRow,
      TableCell: DocxTableCell,
      Paragraph,
      TextRun,
      WidthType,
      BorderStyle,
    } = docx;

    const headerRow = new DocxTableRow({
      children: headers.map(
        (h) =>
          new DocxTableCell({
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
          }),
      ),
    });

    const dataRows = rows.map(
      (r) =>
        new DocxTableRow({
          children: headers.map(
            (_, idx) =>
              new DocxTableCell({
                children: [new Paragraph({ children: this.parseInlineTextRuns(docx, r[idx] ?? '') })],
              }),
          ),
        }),
    );

    return new DocxTable({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 1 },
        left: { style: BorderStyle.SINGLE, size: 1 },
        right: { style: BorderStyle.SINGLE, size: 1 },
      },
      rows: [headerRow, ...dataRows],
    });
  }

  private triggerBlobDownload(blob: Blob, fileName: string): void {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
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
