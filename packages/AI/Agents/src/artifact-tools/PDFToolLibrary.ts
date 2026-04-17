/**
 * @fileoverview Artifact tool library for PDF content.
 *
 * Parses a PDF Buffer and exposes tools for extracting text,
 * searching pages, and reading metadata.
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, type ArtifactToolDefinition, type ArtifactToolResult } from '@memberjunction/ai-core-plus';

// ---------------------------------------------------------------------------
// Minimal pdfjs type shims (no `any`)
// ---------------------------------------------------------------------------

interface PDFPageProxy {
  getTextContent(): Promise<{ items: Array<{ str: string }> }>;
}

interface PDFDocProxy {
  numPages: number;
  getPage(n: number): Promise<PDFPageProxy>;
  getMetadata(): Promise<{ info: Record<string, unknown> }>;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// PDFToolLibrary
// ---------------------------------------------------------------------------

@RegisterClass(BaseArtifactToolLibrary, 'PDFToolLibrary')
export class PDFToolLibrary extends BaseArtifactToolLibrary {
  // -----------------------------------------------------------------------
  // GetToolList
  // -----------------------------------------------------------------------

  public GetToolList(): ArtifactToolDefinition[] {
    return [
      {
        name: 'get_page_count',
        description: 'Returns the total number of pages in the PDF.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_text',
        description: 'Extracts text from a range of pages. Defaults to all pages.',
        inputSchema: {
          type: 'object',
          properties: {
            startPage: { type: 'number', description: '1-based start page (inclusive)' },
            endPage: { type: 'number', description: '1-based end page (inclusive)' },
          },
          required: [],
        },
      },
      {
        name: 'search_text',
        description: 'Searches all pages for text matching a query (case-insensitive).',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search string' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_metadata',
        description: 'Returns PDF metadata (title, author, subject, creator, creationDate, pageCount).',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_full',
        description: 'Returns all text from all pages concatenated.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
    ];
  }

  // -----------------------------------------------------------------------
  // InvokeTool — dispatcher
  // -----------------------------------------------------------------------

  public async InvokeTool(toolName: string, input: Record<string, unknown>, artifactContent: string | Buffer): Promise<ArtifactToolResult> {
    const buffer = this.toBuffer(artifactContent);

    let pdfDoc: PDFDocProxy;
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      pdfDoc = (await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise) as unknown as PDFDocProxy;
    } catch (err: unknown) {
      return this.errorResult(`Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      switch (toolName) {
        case 'get_page_count':
          return this.handleGetPageCount(pdfDoc);
        case 'get_text':
          return await this.handleGetText(pdfDoc, input);
        case 'search_text':
          return await this.handleSearchText(pdfDoc, input);
        case 'get_metadata':
          return this.handleGetMetadata(pdfDoc);
        case 'get_full':
          return await this.handleGetFull(pdfDoc);
        default:
          return this.errorResult(`Unknown tool: "${toolName}".`);
      }
    } finally {
      pdfDoc.destroy();
    }
  }

  // -----------------------------------------------------------------------
  // Tool handlers
  // -----------------------------------------------------------------------

  private handleGetPageCount(pdfDoc: PDFDocProxy): ArtifactToolResult {
    return this.successResult({ pageCount: pdfDoc.numPages });
  }

  private async handleGetText(pdfDoc: PDFDocProxy, input: Record<string, unknown>): Promise<ArtifactToolResult> {
    const startPage = (input.startPage as number | undefined) ?? 1;
    const endPage = (input.endPage as number | undefined) ?? pdfDoc.numPages;

    const clampedStart = Math.max(1, Math.min(startPage, pdfDoc.numPages));
    const clampedEnd = Math.max(clampedStart, Math.min(endPage, pdfDoc.numPages));

    const pages: Array<{ page: number; text: string }> = [];
    for (let i = clampedStart; i <= clampedEnd; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str).join(' ');
      pages.push({ page: i, text });
    }

    return this.successResult(pages);
  }

  private async handleSearchText(pdfDoc: PDFDocProxy, input: Record<string, unknown>): Promise<ArtifactToolResult> {
    const query = input.query as string;
    if (!query) {
      return this.errorResult('Missing required parameter: "query".');
    }

    const lowerQuery = query.toLowerCase();
    const matches: Array<{ page: number; text: string }> = [];

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str).join(' ');
      if (text.toLowerCase().includes(lowerQuery)) {
        matches.push({ page: i, text });
      }
    }

    return this.successResult({ matches });
  }

  private async handleGetMetadata(pdfDoc: PDFDocProxy): Promise<ArtifactToolResult> {
    const meta = await pdfDoc.getMetadata();
    const info = meta.info as Record<string, unknown>;
    return this.successResult({
      title: info['Title'] ?? null,
      author: info['Author'] ?? null,
      subject: info['Subject'] ?? null,
      creator: info['Creator'] ?? null,
      creationDate: info['CreationDate'] ?? null,
      pageCount: pdfDoc.numPages,
    });
  }

  private async handleGetFull(pdfDoc: PDFDocProxy): Promise<ArtifactToolResult> {
    const allText: string[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      allText.push(content.items.map((item) => item.str).join(' '));
    }
    return this.successResult({ text: allText.join('\n') });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private toBuffer(content: string | Buffer): Buffer {
    return typeof content === 'string' ? Buffer.from(content, 'base64') : content;
  }

  private successResult(data: unknown): ArtifactToolResult {
    return { success: true, data };
  }

  private errorResult(errorMessage: string): ArtifactToolResult {
    return { success: false, data: null, errorMessage };
  }
}
