/**
 * @fileoverview Artifact tool library for DOCX content.
 *
 * Parses a DOCX Buffer and exposes tools for extracting text,
 * HTML, searching, reading lines, and splitting into sections.
 */
import { RegisterClass } from '@memberjunction/global';
import {
  BaseArtifactToolLibrary,
  type ArtifactToolArgs,
  type ArtifactToolDefinition,
  type ArtifactToolResult,
} from '@memberjunction/ai-core-plus';
import { CompileSafeToolRegex, DecodeBinaryArtifactContent } from './artifact-tool-helpers';
import { ExecuteSafeRegexBatchWithRecovery } from './node-vm-safe-regex';

interface MammothMessage {
  type: string;
  message: string;
}

interface MammothModule {
  default: {
    extractRawText(opts: { buffer: Buffer }): Promise<{ value: string }>;
    convertToHtml(opts: { buffer: Buffer }): Promise<{ value: string; messages: MammothMessage[] }>;
  };
}

let mammothModulePromise: Promise<MammothModule> | null = null;

function getMammothModule(): Promise<MammothModule> {
  if (!mammothModulePromise) {
    // Genuine bundle-size deferral + optional peer dependency: mammoth is only loaded when a DOCX artifact tool runs.
    mammothModulePromise = import('mammoth') as Promise<MammothModule>;
  }
  return mammothModulePromise;
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
  protected getSubclassToolList(): ArtifactToolDefinition[] {
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

  protected async invokeSubclassTool(toolName: string, input: ArtifactToolArgs, artifactContent: string | Buffer): Promise<ArtifactToolResult> {
    if (toolName === 'get_html') {
      return this.handleGetHtml(artifactContent);
    }

    if (
      toolName !== 'get_text' &&
      toolName !== 'search_text' &&
      toolName !== 'get_lines' &&
      toolName !== 'get_sections'
    ) {
      return this.errorResult(`Unknown tool: "${toolName}".`);
    }

    let extractedText: string;
    try {
      const buffer = DecodeBinaryArtifactContent(artifactContent);
      const mammoth = await getMammothModule();
      const result = await mammoth.default.extractRawText({ buffer });
      extractedText = result.value;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.errorResult(`Failed to parse DOCX: ${message}`);
    }

    switch (toolName) {
      case 'get_text':
        return this.handleGetText(extractedText);
      case 'search_text':
        return this.handleSearchText(extractedText, input);
      case 'get_lines':
        return this.handleGetLines(extractedText, input);
      case 'get_sections':
        return this.handleGetSections(extractedText);
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
      const buffer = DecodeBinaryArtifactContent(artifactContent);
      const mammoth = await getMammothModule();
      const result = await mammoth.default.convertToHtml({ buffer });
      return this.successResult({ html: result.value });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.errorResult(`Failed to convert DOCX to HTML: ${message}`);
    }
  }

  private handleSearchText(text: string, input: ArtifactToolArgs): ArtifactToolResult {
    const pattern = typeof input.pattern === 'string' ? input.pattern : String(input.pattern ?? '');
    const flags = typeof input.flags === 'string' ? input.flags : 'i';

    const compiled = CompileSafeToolRegex(pattern, flags);
    if (!compiled.Regex) {
      return this.errorResult(compiled.ErrorMessage ?? `Invalid or unsafe regex pattern: "${pattern}".`);
    }

    const lines = text.split('\n');
    const batchResult = ExecuteSafeRegexBatchWithRecovery(compiled.Regex, lines, performance.now() + 1500);
    const matches: TextMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (batchResult.Matches[i]) {
        matches.push({ lineNumber: i, text: lines[i] });
      }
    }

    return this.successResult({
      matches,
      ...(batchResult.BudgetExpired || batchResult.TimedOut.some(Boolean)
        ? { partial: true, budgetExpired: batchResult.BudgetExpired }
        : {}),
    });
  }

  private handleGetLines(text: string, input: ArtifactToolArgs): ArtifactToolResult {
    const start = Number(input.start);
    const count = Number(input.count);
    const lines = text.split('\n');

    if (!Number.isFinite(start) || start < 0 || start >= lines.length) {
      return this.errorResult(`Start index ${start} is out of range (0–${lines.length - 1}).`);
    }
    const safeCount = Number.isFinite(count) && count >= 0 ? count : 0;

    const sliced = lines.slice(start, start + safeCount);
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

  private successResult(data: ArtifactToolResult['data']): ArtifactToolResult {
    return { success: true, data };
  }

  private errorResult(errorMessage: string): ArtifactToolResult {
    return { success: false, data: null, errorMessage };
  }
}
