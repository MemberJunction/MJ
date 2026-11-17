/**
 * @fileoverview Artifact tool library for PDF content.
 *
 * Parses a PDF Buffer and exposes tools for extracting text,
 * searching pages, and reading metadata.
 */
import { RegisterClass } from '@memberjunction/global';
import {
  BaseArtifactToolLibrary,
  type ArtifactJsonValue,
  type ArtifactToolArgs,
  type ArtifactToolDefinition,
  type ArtifactToolResult,
} from '@memberjunction/ai-core-plus';
import { DecodeBinaryArtifactContent } from './artifact-tool-helpers';

// ---------------------------------------------------------------------------
// Minimal pdfjs type shims (no `any` / `unknown`)
// ---------------------------------------------------------------------------

interface PDFTextItem {
  str?: string;
}

interface PDFPageProxy {
  getTextContent(): Promise<{ items: PDFTextItem[] }>;
}

interface PDFMetadataInfo {
  Title?: string;
  Author?: string;
  Subject?: string;
  Creator?: string;
  CreationDate?: string;
  [key: string]: ArtifactJsonValue | undefined;
}

interface PDFDocProxy {
  numPages: number;
  getPage(n: number): Promise<PDFPageProxy>;
  getMetadata(): Promise<{ info: object }>;
  destroy(): void;
}

interface PdfJsModule {
  getDocument(opts: { data: Uint8Array }): { promise: Promise<PDFDocProxy> };
}

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

export function GetPdfJsModule(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    // Genuine bundle-size deferral + optional peer dependency: pdfjs-dist is heavy and only loaded for PDF artifacts.
    pdfJsModulePromise = import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJsModule>;
  }
  return pdfJsModulePromise;
}

function getPdfJsModule(): Promise<PdfJsModule> {
  return GetPdfJsModule();
}

// ---------------------------------------------------------------------------
// PDFToolLibrary
// ---------------------------------------------------------------------------

@RegisterClass(BaseArtifactToolLibrary, 'PDFToolLibrary')
export class PDFToolLibrary extends BaseArtifactToolLibrary {
  // -----------------------------------------------------------------------
  // getSubclassToolList
  // -----------------------------------------------------------------------

  protected getSubclassToolList(): ArtifactToolDefinition[] {
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
    ];
  }

  // PDF overrides the default `get_full` description because the override returns
  // extracted plain text rather than the base64-encoded PDF bytes.
  protected getFullToolDefinition(): ArtifactToolDefinition {
    return {
      name: 'get_full',
      description: 'Returns all text from every page concatenated. Use get_text for page-range slices or search_text to locate content first.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    };
  }

  // PDF overrides the default `get_full` impl: extracted text is far more useful
  // than the raw binary the base class would return.
  protected async getFull(artifactContent: string | Buffer): Promise<ArtifactToolResult> {
    const pdfDoc = await this.loadDocument(artifactContent);
    if ('error' in pdfDoc) return pdfDoc.error;
    try {
      return await this.handlegetFull(pdfDoc.doc);
    } finally {
      pdfDoc.doc.destroy();
    }
  }

  // -----------------------------------------------------------------------
  // invokeSubclassTool — dispatcher
  // -----------------------------------------------------------------------

  protected async invokeSubclassTool(toolName: string, input: ArtifactToolArgs, artifactContent: string | Buffer): Promise<ArtifactToolResult> {
    const loaded = await this.loadDocument(artifactContent);
    if ('error' in loaded) return loaded.error;
    const pdfDoc = loaded.doc;

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
        default:
          return this.errorResult(`Unknown tool: "${toolName}".`);
      }
    } finally {
      pdfDoc.destroy();
    }
  }

  private async loadDocument(artifactContent: string | Buffer): Promise<{ doc: PDFDocProxy } | { error: ArtifactToolResult }> {
    const buffer = DecodeBinaryArtifactContent(artifactContent);
    try {
      const pdfjsLib = await getPdfJsModule();
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      return { doc };
    } catch (err) {
      return { error: this.errorResult(`Failed to parse PDF: ${err instanceof Error ? err.message : String(err)}`) };
    }
  }

  // -----------------------------------------------------------------------
  // Tool handlers
  // -----------------------------------------------------------------------

  private handleGetPageCount(pdfDoc: PDFDocProxy): ArtifactToolResult {
    return this.successResult({ pageCount: pdfDoc.numPages });
  }

  private async handleGetText(pdfDoc: PDFDocProxy, input: ArtifactToolArgs): Promise<ArtifactToolResult> {
    if (!Number.isFinite(pdfDoc.numPages) || pdfDoc.numPages <= 0) {
      return this.successResult([]);
    }

    const rawStart = input.startPage !== undefined ? Number(input.startPage) : 1;
    const rawEnd = input.endPage !== undefined ? Number(input.endPage) : pdfDoc.numPages;
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) {
      return this.errorResult('Invalid page range: "startPage" and "endPage" must be finite numbers.');
    }

    const clampedStart = Math.max(1, Math.min(Math.trunc(rawStart), pdfDoc.numPages));
    const clampedEnd = Math.max(clampedStart, Math.min(Math.trunc(rawEnd), pdfDoc.numPages));

    const pages: Array<{ page: number; text: string }> = [];
    for (let i = clampedStart; i <= clampedEnd; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str ?? '').join(' ');
      pages.push({ page: i, text });
    }

    return this.successResult(pages);
  }

  private async handleSearchText(pdfDoc: PDFDocProxy, input: ArtifactToolArgs): Promise<ArtifactToolResult> {
    const query = typeof input.query === 'string' ? input.query : String(input.query ?? '');
    if (!query) {
      return this.errorResult('Missing required parameter: "query".');
    }

    const lowerQuery = query.toLowerCase();
    const matches: Array<{ page: number; text: string }> = [];

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str ?? '').join(' ');
      if (text.toLowerCase().includes(lowerQuery)) {
        matches.push({ page: i, text });
      }
    }

    return this.successResult({ matches });
  }

  private async handleGetMetadata(pdfDoc: PDFDocProxy): Promise<ArtifactToolResult> {
    const meta = await pdfDoc.getMetadata();
    const info = (meta.info ?? {}) as PDFMetadataInfo;
    return this.successResult({
      title: info.Title ?? null,
      author: info.Author ?? null,
      subject: info.Subject ?? null,
      creator: info.Creator ?? null,
      creationDate: info.CreationDate ?? null,
      pageCount: pdfDoc.numPages,
    });
  }

  private async handlegetFull(pdfDoc: PDFDocProxy): Promise<ArtifactToolResult> {
    const allText: string[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const content = await page.getTextContent();
      allText.push(content.items.map((item) => item.str ?? '').join(' '));
    }
    return this.successResult({ text: allText.join('\n') });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private successResult(data: ArtifactToolResult['data']): ArtifactToolResult {
    return { success: true, data };
  }

  private errorResult(errorMessage: string): ArtifactToolResult {
    return { success: false, data: null, errorMessage };
  }
}
