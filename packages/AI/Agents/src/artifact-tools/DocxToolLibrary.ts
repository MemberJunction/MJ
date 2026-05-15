/**
 * @fileoverview Artifact tool library for DOCX content.
 *
 * Parses a DOCX Buffer and exposes tools for extracting text,
 * HTML, searching, reading lines, and splitting into sections.
 */
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactToolLibrary, type ArtifactToolDefinition, type ArtifactToolResult } from '@memberjunction/ai-core-plus';

interface MammothModule {
  default: {
    extractRawText(opts: { buffer: Buffer }): Promise<{ value: string }>;
    convertToHtml(opts: { buffer: Buffer }): Promise<{ value: string; messages: unknown[] }>;
  };
}

interface TextMatch {
  lineNumber: number;
  text: string;
}

interface Section {
  index: number;
  preview: string;
}

@RegisterClass(BaseArtifactToolLibrary, 'DocxToolLibrary')
export class DocxToolLibrary extends BaseArtifactToolLibrary {
  protected GetSubclassToolList(): ArtifactToolDefinition[] {
    return [
      {
        name: 'get_text',
        description: 'Extracts raw text from the DOCX and returns it with character and word counts.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_html',
        description: 'Converts the DOCX to HTML, useful for understanding document structure.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'search_text',
        description: 'Regex search on the extracted text. Returns matching lines with line numbers.',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern to search for' },
            flags: { type: 'string', description: 'Regex flags (default: "g")' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'get_lines',
        description: 'Returns a range of lines from the extracted text (0-based start).',
        inputSchema: {
          type: 'object',
          properties: {
            start: { type: 'number', description: 'Zero-based start line index' },
            count: { type: 'number', description: 'Number of lines to return' },
          },
          required: ['start', 'count'],
        },
      },
      {
        name: 'get_sections',
        description: 'Splits text by double newlines into logical sections, each with a 200-char preview.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
    ];
  }

  protected async InvokeSubclassTool(toolName: string, input: Record<string, unknown>, artifactContent: string | Buffer): Promise<ArtifactToolResult> {
    let extractedText: string;
    try {
      const buffer = this.toBuffer(artifactContent);
      const mammoth = await this.loadMammoth();
      const result = await mammoth.default.extractRawText({ buffer });
      extractedText = result.value;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return this.errorResult(`Failed to parse DOCX: ${message}`);
    }

    switch (toolName) {
      case 'get_text':
        return this.handleGetText(extractedText);
      case 'get_html':
        return this.handleGetHtml(artifactContent);
      case 'search_text':
        return this.handleSearchText(extractedText, input);
      case 'get_lines':
        return this.handleGetLines(extractedText, input);
      case 'get_sections':
        return this.handleGetSections(extractedText);
      default:
        return this.errorResult(`Unknown tool: "${toolName}".`);
    }
  }

  private handleGetText(text: string): ArtifactToolResult {
    return this.successResult({
      text,
      characterCount: text.length,
      wordCount: text.length > 0 ? text.split(/\s+/).filter((w) => w.length > 0).length : 0,
    });
  }

  private async handleGetHtml(artifactContent: string | Buffer): Promise<ArtifactToolResult> {
    try {
      const buffer = this.toBuffer(artifactContent);
      const mammoth = await this.loadMammoth();
      const result = await mammoth.default.convertToHtml({ buffer });
      return this.successResult({ html: result.value });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return this.errorResult(`Failed to convert DOCX to HTML: ${message}`);
    }
  }

  private handleSearchText(text: string, input: Record<string, unknown>): ArtifactToolResult {
    const pattern = input.pattern as string;
    const flags = (input.flags as string) ?? 'g';

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, flags);
    } catch {
      return this.errorResult(`Invalid regex pattern: "${pattern}".`);
    }

    const lines = text.split('\n');
    const matches: TextMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matches.push({ lineNumber: i, text: lines[i] });
      }
      regex.lastIndex = 0;
    }

    return this.successResult({ matches });
  }

  private handleGetLines(text: string, input: Record<string, unknown>): ArtifactToolResult {
    const start = input.start as number;
    const count = input.count as number;
    const lines = text.split('\n');

    if (start < 0 || start >= lines.length) {
      return this.errorResult(`Start index ${start} is out of range (0–${lines.length - 1}).`);
    }

    const sliced = lines.slice(start, start + count);
    return this.successResult({ lines: sliced, start, count: sliced.length });
  }

  private handleGetSections(text: string): ArtifactToolResult {
    const parts = text.split(/\n\s*\n/).filter((s) => s.trim().length > 0);
    const sections: Section[] = parts.map((section, index) => ({
      index,
      preview: section.substring(0, 200),
    }));
    return this.successResult({ sections });
  }

  private toBuffer(content: string | Buffer): Buffer {
    return Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
  }

  private async loadMammoth(): Promise<MammothModule> {
    return import('mammoth') as Promise<MammothModule>;
  }

  private successResult(data: unknown): ArtifactToolResult {
    return { success: true, data };
  }

  private errorResult(errorMessage: string): ArtifactToolResult {
    return { success: false, data: null, errorMessage };
  }
}
