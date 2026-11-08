import { Injectable } from '@angular/core';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
  BorderStyle,
} from 'docx';
import TurndownService from 'turndown';
import { DocumentLiveBlockEngine } from '@memberjunction/core-entities';
import { ConvertDocxToHtml, EscapeHtml, type MammothModuleShim } from '../components/previews/office-preview.logic';

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
    // dynamic-import: mammoth is a heavy Office parser deferred until DOCX import/preview is invoked (Rule 8 #3)
    const mammothModule = mammothOverride ?? ((await import('mammoth')) as unknown as MammothModuleShim);
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
  public ConvertHtmlToMarkdown(html: string): string {
    const turndown = new TurndownService({
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
            (cell.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|'),
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
  public async ConvertMarkdownToDocxBytes(markdown: string, title = 'Document'): Promise<Uint8Array> {
    const children: Array<Paragraph | DocxTable> = [];
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const parsedSegments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(markdown);
    const blockByStartLine = new Map(
      parsedSegments.filter((s) => s.Type === 'mj-block' && s.BlockSpec).map((s) => [s.StartLine, s]),
    );

    let lineIdx = 0;
    while (lineIdx < lines.length) {
      const oneBasedLine = lineIdx + 1;
      const blockSeg = blockByStartLine.get(oneBasedLine);
      if (blockSeg && blockSeg.BlockSpec) {
        const block = blockSeg.BlockSpec;
        const modeText =
          block.Mode === 'Frozen'
            ? `Frozen snapshot (${block.FrozenSnapshot?.FrozenAt ?? 'recorded'})`
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
        if (block.FrozenSnapshot && block.FrozenSnapshot.Columns.length > 0) {
          const colNames = block.FrozenSnapshot.Columns.map((c) => c.Name);
          children.push(this.buildDocxTable(colNames, block.FrozenSnapshot.Rows));
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

      // Heading
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(trimmed);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        children.push(
          new Paragraph({
            text,
            heading: this.mapHeadingLevel(level),
            spacing: { before: 200, after: 100 },
          }),
        );
        lineIdx++;
        continue;
      }

      // Markdown table
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const tableLines: string[] = [];
        while (lineIdx < lines.length && lines[lineIdx].trim().startsWith('|')) {
          tableLines.push(lines[lineIdx].trim());
          lineIdx++;
        }
        const parsedTable = this.parseMarkdownTableLines(tableLines);
        if (parsedTable.headers.length > 0) {
          children.push(this.buildDocxTableFromCells(parsedTable.headers, parsedTable.rows));
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
            children: this.parseInlineTextRuns(`${checkbox}${bulletMatch[2]}`),
            bullet: { level: 0 },
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
            children: [new TextRun({ text: quoteText, italics: true })],
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
          children: this.parseInlineTextRuns(trimmed),
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

    const buffer = await Packer.toBuffer(doc);
    return new Uint8Array(buffer);
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
  public async DownloadDocxFile(markdown: string, fileName = 'document.docx', title = 'Document'): Promise<void> {
    const normalizedName = fileName.endsWith('.docx') ? fileName : `${fileName}.docx`;
    const bytes = await this.ConvertMarkdownToDocxBytes(markdown, title);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    this.triggerBlobDownload(blob, normalizedName);
  }

  /**
   * Opens a styled print / PDF export window for the document.
   */
  public ExportPrintablePdf(
    renderedHtml: string,
    title: string,
    orientation: 'portrait' | 'landscape' = 'portrait',
  ): void {
    if (typeof window === 'undefined') {
      return;
    }
    const printWin = window.open('', '_blank', 'width=960,height=720');
    if (!printWin) {
      return;
    }
    const safeTitle = EscapeHtml(title || 'Document');
    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    @page { size: A4 ${orientation}; margin: 18mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.65; font-size: 13px; }
    h1, h2, h3, h4 { margin-top: 1.4em; margin-bottom: 0.45em; font-weight: 700; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid rgba(0, 0, 0, 0.25); padding: 6px 10px; text-align: left; }
    th { background: rgba(0, 0, 0, 0.05); font-weight: 600; }
    pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: rgba(0, 0, 0, 0.05); border-radius: 4px; }
    pre { padding: 10px 12px; overflow-x: auto; }
    blockquote { border-left: 3px solid rgba(0, 0, 0, 0.4); margin: 10px 0; padding: 6px 12px; background: rgba(0, 0, 0, 0.03); }
  </style>
</head>
<body>
  ${renderedHtml}
</body>
</html>`);
    printWin.document.close();
    printWin.focus();
    printWin.print();
  }

  private mapHeadingLevel(level: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
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

  private parseInlineTextRuns(text: string): TextRun[] {
    const runs: TextRun[] = [];
    const tokenRegex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
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
        runs.push(new TextRun({ text: match[4], font: 'Courier New' }));
      }
      lastIndex = tokenRegex.lastIndex;
    }
    if (lastIndex < text.length) {
      runs.push(new TextRun({ text: text.slice(lastIndex) }));
    }
    return runs.length > 0 ? runs : [new TextRun({ text })];
  }

  private parseMarkdownTableLines(lines: string[]): { headers: string[]; rows: string[][] } {
    const parseRow = (line: string): string[] =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());

    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }
    const headers = parseRow(lines[0]);
    const bodyStart = lines.length > 1 && /^[\s|:-]+$/.test(lines[1]) ? 2 : 1;
    const rows = lines.slice(bodyStart).map(parseRow);
    return { headers, rows };
  }

  private buildDocxTable(columns: string[], rows: Array<Record<string, unknown>>): DocxTable {
    const cellMatrix = rows.map((r) => columns.map((col) => (r[col] == null ? '' : String(r[col]))));
    return this.buildDocxTableFromCells(columns, cellMatrix);
  }

  private buildDocxTableFromCells(headers: string[], rows: string[][]): DocxTable {
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
                children: [new Paragraph({ text: r[idx] ?? '' })],
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
