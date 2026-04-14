import { MJGlobal } from '@memberjunction/global';
import { BaseArtifactToolLibrary, ArtifactToolResult } from './artifact-tools/BaseArtifactToolLibrary';
import { DataSnapshotToolLibrary } from './artifact-tools/DataSnapshotToolLibrary';
import { JSONToolLibrary } from './artifact-tools/JSONToolLibrary';
import { TextToolLibrary } from './artifact-tools/TextToolLibrary';

/**
 * An input artifact provided to an agent run.
 */
export interface InputArtifact {
  name: string;
  typeName: string;
  content: string | Buffer;
  /** MIME type of the artifact content (e.g., 'application/pdf').
   *  Populated for file-backed artifacts from ArtifactVersion.MimeType. */
  mimeType?: string;
  /** Optional: class name from ArtifactType.ToolLibraryClass metadata.
   *  When set, used for plugin-based resolution via ClassFactory. */
  toolLibraryClass?: string;
}

/**
 * A single artifact tool invocation requested by the LLM.
 */
export interface ArtifactToolCall {
  /** Alpha-sequence artifact ID assigned at run start (A, B, ... Z, AA, AB, etc.) */
  artifactId: string;
  /** Tool name from the documented tool list */
  tool: string;
  /** Tool-specific input parameters */
  input: Record<string, unknown>;
}

interface ArtifactEntry {
  alphaId: string;
  name: string;
  typeName: string;
  mimeType?: string;
  content: string | Buffer;
  library: BaseArtifactToolLibrary;
}

interface StoredToolResult {
  artifactId: string;
  tool: string;
  input: Record<string, unknown>;
  result: ArtifactToolResult;
}

export interface ArtifactToolSnapshot {
  artifacts: Array<{ alphaId: string; name: string; typeName: string }>;
  resultCount: number;
}

/**
 * Manages artifact tools for a single agent run.
 *
 * Follows the ScratchpadManager pattern:
 * - Instantiated once per run
 * - Holds references to input artifacts with alpha IDs
 * - Generates manifest + tool documentation for prompt injection
 * - Executes tool calls and stores results for next turn
 * - Serializable for persistence
 */
export class ArtifactToolManager {
  private artifacts: Map<string, ArtifactEntry> = new Map();
  private toolResults: StoredToolResult[] = [];
  private nextAlphaIndex = 0;

  // ─── LIFECYCLE ───

  /** Initialize with input artifacts, assigning alpha IDs */
  Initialize(inputArtifacts: InputArtifact[]): void {
    this.Clear();
    for (const artifact of inputArtifacts) {
      const alphaId = this.NextAlphaId();
      this.artifacts.set(alphaId, {
        alphaId,
        name: artifact.name,
        typeName: artifact.typeName,
        mimeType: artifact.mimeType,
        content: artifact.content,
        library: this.ResolveLibrary(artifact.typeName, artifact.toolLibraryClass),
      });
    }
  }

  /** Register a mid-run artifact and return its alpha ID */
  RegisterArtifact(artifact: InputArtifact): string {
    const alphaId = this.NextAlphaId();
    this.artifacts.set(alphaId, {
      alphaId,
      name: artifact.name,
      typeName: artifact.typeName,
      mimeType: artifact.mimeType,
      content: artifact.content,
      library: this.ResolveLibrary(artifact.typeName, artifact.toolLibraryClass),
    });
    return alphaId;
  }

  /** Reset all state */
  Clear(): void {
    this.artifacts.clear();
    this.toolResults = [];
    this.nextAlphaIndex = 0;
  }

  /** Whether any artifacts are available */
  HasArtifacts(): boolean {
    return this.artifacts.size > 0;
  }

  // ─── PROMPT INJECTION ───

  /** Markdown manifest: artifact IDs, names, types */
  ToManifestString(): string {
    if (this.artifacts.size === 0) return '';

    const lines: string[] = ['## Available Artifacts\n'];
    for (const entry of this.artifacts.values()) {
      const sizeSuffix = Buffer.isBuffer(entry.content)
        ? ` (${(entry.content.length / 1024).toFixed(0)} KB)`
        : typeof entry.content === 'string' && entry.content.length > 0
          ? ` (${(entry.content.length / 1024).toFixed(0)} KB)`
          : '';
      const mimeNote = entry.mimeType ? ` [${entry.mimeType}]` : '';
      lines.push(`**${entry.alphaId}** — ${entry.typeName}: "${entry.name}"${mimeNote}${sizeSuffix}`);
    }
    lines.push('');
    lines.push('Use the artifact tools below to explore content.');
    lines.push('IMPORTANT: Always use the single-letter artifact ID (A, B, C, etc.) as the `artifactId` value — NOT the artifact name.');
    return lines.join('\n');
  }

  /** Markdown tool documentation grouped by artifact type */
  GetToolDocumentation(): string {
    if (this.artifacts.size === 0) return '';

    // Collect unique type → library pairs
    const typeLibraries = new Map<string, BaseArtifactToolLibrary>();
    for (const entry of this.artifacts.values()) {
      if (!typeLibraries.has(entry.typeName)) {
        typeLibraries.set(entry.typeName, entry.library);
      }
    }

    const sections: string[] = [];
    for (const [typeName, library] of typeLibraries) {
      const tools = library.GetToolList();
      if (tools.length === 0) continue;

      sections.push(`## ${typeName} Artifact Tools`);
      for (const tool of tools) {
        const params = Object.keys((tool.inputSchema.properties as Record<string, unknown>) || {}).join(', ');
        sections.push(`- **${tool.name}**(artifactId${params ? ', ' + params : ''}) — ${tool.description}`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Max characters for the tool results section injected into the prompt.
   * Prevents context overflow when tool results contain large datasets.
   * Results are truncated from oldest first, with a summary of what was dropped.
   */
  private static readonly MAX_RESULTS_CHARS = 50_000;

  /**
   * Max characters for a single tool result's data section.
   * Individual results that exceed this are truncated with a note,
   * preventing one huge result from consuming the entire budget.
   */
  private static readonly MAX_SINGLE_RESULT_CHARS = 15_000;

  /** Markdown results from previous turns */
  GetPendingResults(): string {
    if (this.toolResults.length === 0) return '';

    const header = [
      '## Artifact Tool Results',
      '',
      'These are results from your previous artifact tool calls. **Use these results to answer the user — do NOT re-call the same tools.**',
      ''
    ].join('\n');

    // Render each result, capping individual results that are disproportionately large
    const rendered: Array<{ text: string; index: number }> = [];
    for (let i = 0; i < this.toolResults.length; i++) {
      const stored = this.toolResults[i];
      const lines: string[] = [];
      lines.push(`### Result ${i + 1}: ${stored.artifactId}.${stored.tool}(${JSON.stringify(stored.input)})`);
      if (stored.result.success) {
        let data = typeof stored.result.data === 'string' ? stored.result.data : JSON.stringify(stored.result.data, null, 2);
        if (data.length > ArtifactToolManager.MAX_SINGLE_RESULT_CHARS) {
          data = data.slice(0, ArtifactToolManager.MAX_SINGLE_RESULT_CHARS)
            + `\n... (truncated — ${data.length} chars total. Use more specific tool calls to narrow results.)`;
        }
        lines.push('```json');
        lines.push(data);
        lines.push('```');
      } else {
        lines.push(`**Error:** ${stored.result.errorMessage}`);
      }
      lines.push('');
      rendered.push({ text: lines.join('\n'), index: i });
    }

    // Check total size and truncate oldest results if over limit
    let totalChars = header.length;
    const included: string[] = [];
    let droppedCount = 0;

    // Include results from newest to oldest so most recent are preserved
    for (let i = rendered.length - 1; i >= 0; i--) {
      if (totalChars + rendered[i].text.length > ArtifactToolManager.MAX_RESULTS_CHARS && included.length > 0) {
        droppedCount = i + 1;
        break;
      }
      totalChars += rendered[i].text.length;
      included.unshift(rendered[i].text);
    }

    const parts = [header];
    if (droppedCount > 0) {
      parts.push(`> **Note:** ${droppedCount} earlier result(s) truncated to fit context window. Use artifact tools to re-query if needed.\n`);
    }
    parts.push(...included);

    return parts.join('\n');
  }

  /** One-line summary for compact contexts */
  GetSummary(): string {
    if (this.artifacts.size === 0) return '';
    const count = this.artifacts.size;
    return `${count} artifact${count !== 1 ? 's' : ''} available (${Array.from(this.artifacts.values())
      .map((a) => a.alphaId)
      .join(', ')})`;
  }

  // ─── TOOL EXECUTION ───

  /** Execute tool calls from LLM response */
  async ExecuteToolCalls(calls: ArtifactToolCall[]): Promise<void> {
    const promises = calls.map(async (call) => {
      // Try exact alpha ID first, then fallback to name match
      let entry = this.artifacts.get(call.artifactId);
      if (!entry) {
        // LLMs sometimes use the artifact name instead of the alpha ID
        for (const e of this.artifacts.values()) {
          if (e.name.toLowerCase() === call.artifactId.toLowerCase() || e.name.toLowerCase().replace(/\s+/g, '_') === call.artifactId.toLowerCase()) {
            entry = e;
            break;
          }
        }
      }
      if (!entry && this.artifacts.size === 1) {
        // If there's only one artifact, use it regardless of what ID was passed
        entry = this.artifacts.values().next().value;
      }
      if (!entry) {
        this.toolResults.push({
          artifactId: call.artifactId,
          tool: call.tool,
          input: call.input,
          result: {
            success: false,
            data: null,
            errorMessage: `Unknown artifact ID: ${call.artifactId}. Use the alpha ID (A, B, C, etc.) from the manifest.`,
          },
        });
        return;
      }

      const result = await entry.library.InvokeTool(call.tool, call.input, entry.content);
      this.toolResults.push({
        artifactId: call.artifactId,
        tool: call.tool,
        input: call.input,
        result,
      });
    });

    await Promise.all(promises);
  }

  // ─── SERIALIZATION ───

  /** Snapshot for persistence */
  ToJSON(): ArtifactToolSnapshot {
    return {
      artifacts: Array.from(this.artifacts.values()).map((a) => ({
        alphaId: a.alphaId,
        name: a.name,
        typeName: a.typeName,
      })),
      resultCount: this.toolResults.length,
    };
  }

  // ─── PRIVATE ───

  /** Generate next alpha-sequence ID: A, B, ... Z, AA, AB, ... */
  private NextAlphaId(): string {
    const index = this.nextAlphaIndex++;
    if (index < 26) {
      return String.fromCharCode(65 + index); // A-Z
    }
    // AA, AB, AC, ...
    const first = Math.floor((index - 26) / 26);
    const second = (index - 26) % 26;
    return String.fromCharCode(65 + first) + String.fromCharCode(65 + second);
  }

  /** Resolve a tool library for an artifact type.
   *  Priority: toolLibraryClass from metadata → ClassFactory → name-based fallback */
  private ResolveLibrary(typeName: string, toolLibraryClass?: string): BaseArtifactToolLibrary {
    // Try metadata-driven resolution via ClassFactory
    if (toolLibraryClass) {
      const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, toolLibraryClass);
      if (instance) return instance;
    }

    // Fallback: name-based resolution for types without ToolLibraryClass metadata
    const lower = typeName.toLowerCase();
    if (lower.includes('data') || lower.includes('snapshot')) {
      return new DataSnapshotToolLibrary();
    }
    if (lower.includes('json')) {
      return new JSONToolLibrary();
    }
    // File-based types: try ClassFactory for dynamically registered libraries
    // (PDFToolLibrary, ExcelToolLibrary, DocxToolLibrary are registered by CoreActions)
    if (lower.includes('pdf')) {
      const lib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, 'PDFToolLibrary');
      if (lib) return lib;
    }
    if (lower.includes('excel') || lower.includes('xlsx') || lower.includes('spreadsheet')) {
      const lib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, 'ExcelToolLibrary');
      if (lib) return lib;
    }
    if (lower.includes('word') || lower.includes('docx') || lower.includes('document')) {
      const lib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, 'DocxToolLibrary');
      if (lib) return lib;
    }
    return new TextToolLibrary();
  }
}
