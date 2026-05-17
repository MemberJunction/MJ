import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { ArtifactMetadataEngine } from '@memberjunction/core-entities';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult, NativeFileInput, InputArtifact } from '@memberjunction/ai-core-plus';
import { DataSnapshotToolLibrary } from './artifact-tools/DataSnapshotToolLibrary';
import { JSONToolLibrary } from './artifact-tools/JSONToolLibrary';
import { TextToolLibrary } from './artifact-tools/TextToolLibrary';

// Re-export so existing consumers that import { InputArtifact } from
// './ArtifactToolManager' continue to compile. The canonical declaration
// now lives in @memberjunction/ai-core-plus alongside ExecuteAgentParams.
export type { InputArtifact };

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
  annotation?: string;
  deliveryMode?: 'Inline' | 'ToolsOnly';
  forceToolsOnly?: boolean;
}

/**
 * Merges tool libraries from an artifact type's inheritance chain.
 *
 * Given a chain ordered leaf-first (most-specific at index 0), tool lookups
 * scan front-to-back, so a child type's tool with the same name as a parent
 * type's tool wins. `GetToolList()` deduplicates by tool name.
 *
 * Used transparently by ArtifactToolManager — callers continue to see a
 * single BaseArtifactToolLibrary.
 */
class CompositeArtifactToolLibrary extends BaseArtifactToolLibrary {
  constructor(private readonly chain: BaseArtifactToolLibrary[]) {
    super();
  }

  // Composite wraps a chain of real libraries and fully overrides the public
  // dispatchers — the abstract Subclass methods below are required to make the
  // class concrete but are never reached.
  public override GetToolList(): ArtifactToolDefinition[] {
    const seen = new Set<string>();
    const merged: ArtifactToolDefinition[] = [];
    for (const lib of this.chain) {
      for (const tool of lib.GetToolList()) {
        if (seen.has(tool.name)) continue;
        seen.add(tool.name);
        merged.push(tool);
      }
    }
    return merged;
  }

  public override async InvokeTool(
    toolName: string,
    input: Record<string, unknown>,
    artifactContent: string | Buffer,
  ): Promise<ArtifactToolResult> {
    // Dispatch to the first library (leaf-first) that declares this tool.
    for (const lib of this.chain) {
      if (lib.GetToolList().some((t) => t.name === toolName)) {
        return lib.InvokeTool(toolName, input, artifactContent);
      }
    }
    return {
      success: false,
      data: null,
      errorMessage: `Tool "${toolName}" is not defined by any library in this artifact type's chain.`,
    };
  }

  // Required by the abstract base but never invoked — GetToolList / InvokeTool
  // are fully overridden above.
  protected getSubclassToolList(): ArtifactToolDefinition[] {
    return [];
  }
  protected async invokeSubclassTool(): Promise<ArtifactToolResult> {
    return { success: false, data: null, errorMessage: 'CompositeArtifactToolLibrary does not dispatch via invokeSubclassTool.' };
  }
}

export interface StoredToolResult {
  artifactId: string;
  tool: string;
  input: Record<string, unknown>;
  result: ArtifactToolResult;
  /** When the invocation completed (UTC) */
  timestamp: Date;
  /** How long the invocation took, in milliseconds */
  durationMs: number;
}

export interface ArtifactToolSnapshot {
  artifacts: Array<{ alphaId: string; name: string; typeName: string }>;
  resultCount: number;
}

/**
 * A single tool invocation, projected from the internal result store.
 * Used for audit / training-data / debugging.
 */
export interface ArtifactAccessLogEntry {
  artifactId: string;
  tool: string;
  input: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
  durationMs: number;
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
        annotation: artifact.annotation,
        deliveryMode: artifact.deliveryMode,
        forceToolsOnly: artifact.forceToolsOnly,
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

  /**
   * Returns artifact content formatted as NativeFileInput candidates for the
   * AIPromptRunner. Only artifacts with a known MIME type and string/Buffer
   * content are included. The runner will check each against the driver's
   * FileCapabilities before actually attaching them.
   *
   * For each candidate, eagerly extracts text content so the Prompts package
   * can fall back to a plain-text injection when the driver doesn't support
   * native file input (e.g., Cerebras, older OpenAI-compat providers).
   */
  async GetNativeFileInputCandidates(): Promise<NativeFileInput[]> {
    const candidates: NativeFileInput[] = [];
    for (const entry of this.artifacts.values()) {
      if (!entry.mimeType) continue;
      // Skip artifacts the agent is supposed to reach via tools. Including
      // them here would duplicate-deliver: AIPromptRunner.injectNativeFileInputs
      // would either inject the bytes as a file_url block OR fall back to
      // embedding the full extracted text — both paths leak content the
      // routing layer already decided not to inline.
      const effectiveMode: 'Inline' | 'ToolsOnly' = entry.forceToolsOnly
        ? 'ToolsOnly'
        : (entry.deliveryMode ?? 'ToolsOnly');
      if (effectiveMode === 'ToolsOnly') continue;
      const contentBuffer = typeof entry.content === 'string'
        ? Buffer.from(entry.content)
        : entry.content;
      const base64 = contentBuffer.toString('base64');
      const textContent = await this.extractTextFallback(entry.mimeType, contentBuffer, entry.content);
      candidates.push({
        Name: entry.name,
        MimeType: entry.mimeType,
        Base64Content: base64,
        SizeBytes: contentBuffer.length,
        ...(textContent ? { TextContent: textContent } : {}),
      });
    }
    return candidates;
  }

  /**
   * Best-effort text extraction for fallback when the driver doesn't support
   * native file input. Returns null if extraction fails or isn't applicable
   * (e.g., images, audio).
   */
  private async extractTextFallback(mimeType: string, buffer: Buffer, rawContent: string | Buffer): Promise<string | null> {
    const mime = mimeType.toLowerCase();

    // Text-based content — decode directly
    if (mime.startsWith('text/') || mime === 'application/json') {
      return typeof rawContent === 'string' ? rawContent : buffer.toString('utf-8');
    }

    // PDF — use pdfjs-dist (already a dependency of this package)
    if (mime === 'application/pdf') {
      return this.extractPdfText(buffer);
    }

    // Office documents — not supported for text extraction yet
    // (would need mammoth for docx, xlsx-parse for xlsx, etc.)
    return null;
  }

  /** Extract all text from a PDF buffer using pdfjs-dist. Returns null on failure. */
  private async extractPdfText(buffer: Buffer): Promise<string | null> {
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdfDoc = await (pdfjsLib as { getDocument: (opts: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str: string }> }> }>; destroy: () => void }> } }).getDocument({ data: new Uint8Array(buffer) }).promise;
      try {
        const pages: string[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const tc = await page.getTextContent();
          pages.push(tc.items.map((item: { str: string }) => item.str).join(' '));
        }
        return pages.join('\n\n');
      } finally {
        pdfDoc.destroy();
      }
    } catch {
      return null;
    }
  }

  // ─── PROMPT INJECTION ───

  /**
   * Markdown manifest: artifact IDs, names, types, optional routing
   * annotations, plus modality-mismatch warnings when the active driver
   * can't process a media artifact's MIME. The warning is what stops
   * non-vision models from pretending to see image artifacts based on
   * pattern-matched few-shot examples.
   *
   * @param opts.supportedMimeTypes Driver-declared file capabilities. When
   *        provided, any artifact whose MIME doesn't match (and isn't a
   *        text-based type the agent reaches via tools) gets a per-entry
   *        warning telling the agent the model can't process the artifact.
   *        Pass `undefined` to disable the check (legacy callers).
   */
  ToManifestString(opts?: { supportedMimeTypes?: ReadonlyArray<string> | null }): string {
    if (this.artifacts.size === 0) return '';

    const lines: string[] = ['## Available Artifacts\n'];
    const supportedMimes = opts?.supportedMimeTypes ?? null;
    for (const entry of this.artifacts.values()) {
      const sizeSuffix = Buffer.isBuffer(entry.content)
        ? ` (${(entry.content.length / 1024).toFixed(0)} KB)`
        : typeof entry.content === 'string' && entry.content.length > 0
          ? ` (${(entry.content.length / 1024).toFixed(0)} KB)`
          : '';
      const mimeNote = entry.mimeType ? ` [${entry.mimeType}]` : '';
      lines.push(`**${entry.alphaId}** — ${entry.typeName}: "${entry.name}"${mimeNote}${sizeSuffix}`);

      // Modality-mismatch warning: when the driver can't process the
      // artifact's media type, tell the agent explicitly so it doesn't
      // hallucinate a description from few-shot examples or pretend the
      // base64 it gets from get_full means something visual to it.
      const mismatch = this.modalityMismatchMessage(entry.mimeType, supportedMimes);
      if (mismatch) {
        lines.push(`    > ⚠ ${mismatch}`);
      }
      if (entry.annotation) {
        const annotation = entry.annotation.length > ArtifactToolManager.MAX_MANIFEST_PREVIEW_CHARS_PER_ARTIFACT
          ? entry.annotation.slice(0, ArtifactToolManager.MAX_MANIFEST_PREVIEW_CHARS_PER_ARTIFACT) + '...[truncated]'
          : entry.annotation;
        lines.push(`    > Note: ${annotation}`);
      }
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
   * Returns a per-artifact warning when the active driver can't process the
   * artifact's media type. Only fires for media MIMEs (image/audio/video) —
   * text-y MIMEs (json/text/csv/xml/etc.) are reached via tools and don't
   * need modality support from the driver itself, so this stays quiet.
   */
  private modalityMismatchMessage(
    mimeType: string | undefined,
    supportedMimes: ReadonlyArray<string> | null,
  ): string | null {
    if (!mimeType) return null;
    const lower = mimeType.toLowerCase();
    const isMediaModality = lower.startsWith('image/') || lower.startsWith('audio/') || lower.startsWith('video/');
    if (!isMediaModality) return null;

    if (!supportedMimes || supportedMimes.length === 0) {
      const modality = lower.split('/')[0];
      return `The current model cannot process ${modality} content. ` +
        `Calling get_full will return the raw base64 bytes — you cannot interpret those visually. ` +
        `Tell the user the active model does not support ${modality} input rather than guessing what the file contains.`;
    }
    const supported = supportedMimes.some((pattern) => {
      const p = pattern.toLowerCase();
      if (p.endsWith('/*')) return lower.startsWith(p.slice(0, -1));
      return lower === p;
    });
    if (supported) return null;

    const modality = lower.split('/')[0];
    return `The current model cannot process ${modality} content (${lower}). ` +
      `Calling get_full will return the raw base64 bytes — you cannot interpret those visually. ` +
      `Tell the user the active model does not support ${modality} input rather than guessing what the file contains.`;
  }

  /**
   * Per-artifact cap on manifest extras (annotations, future preview content).
   * Keeps any one artifact entry from dominating the manifest in a long
   * conversation. The LLM sees a `...[truncated]` marker when the cap fires.
   */
  private static readonly MAX_MANIFEST_PREVIEW_CHARS_PER_ARTIFACT = 1_000;

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
      '',
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
          data =
            data.slice(0, ArtifactToolManager.MAX_SINGLE_RESULT_CHARS) +
            `\n... (truncated — ${data.length} chars total. Use more specific tool calls to narrow results.)`;
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

  /**
   * Execute a single tool call and return its stored result. Also pushes the
   * result into the manager's internal result store for back-compat consumers
   * that read `toolResults` after a batch (e.g. `GetPendingResults`).
   *
   * Exposed publicly so the agent runtime can wrap each call in its own
   * AIAgentRunStep (StepType='Tool'). For bulk-dispatch use, see
   * {@link ExecuteToolCalls}.
   */
  async ExecuteSingleToolCall(call: ArtifactToolCall): Promise<StoredToolResult> {
    const startedAt = Date.now();
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
      const stored: StoredToolResult = {
        artifactId: call.artifactId,
        tool: call.tool,
        input: call.input,
        result: {
          success: false,
          data: null,
          errorMessage: `Unknown artifact ID: ${call.artifactId}. Use the alpha ID (A, B, C, etc.) from the manifest.`,
        },
        timestamp: new Date(),
        durationMs: Date.now() - startedAt,
      };
      this.toolResults.push(stored);
      return stored;
    }

    // Wrap InvokeTool so any exception inside a handler becomes a structured
    // error result instead of propagating up to the agent loop. Without this,
    // a single malformed artifact (e.g. a table missing `rows`) crashes the
    // entire run via `executePromptStep`'s catch → isConfigurationError.
    let result: ArtifactToolResult;
    try {
      result = await entry.library.InvokeTool(call.tool, call.input, entry.content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result = {
        success: false,
        data: null,
        errorMessage: `Tool "${call.tool}" on artifact ${entry.alphaId} threw: ${msg}. The artifact content may be malformed for this tool — try a different tool or a different artifact.`,
      };
    }
    const stored: StoredToolResult = {
      artifactId: call.artifactId,
      tool: call.tool,
      input: call.input,
      result,
      timestamp: new Date(),
      durationMs: Date.now() - startedAt,
    };
    this.toolResults.push(stored);
    return stored;
  }

  /**
   * Execute a batch of tool calls in parallel. Each call's result is stored
   * internally and accessible via {@link GetFullToolResults} or the
   * markdown-rendered {@link GetPendingResults}. Returns void to preserve
   * the original contract.
   */
  async ExecuteToolCalls(calls: ArtifactToolCall[]): Promise<void> {
    await Promise.all(calls.map((c) => this.ExecuteSingleToolCall(c)));
  }

  /**
   * Returns the full stored results from this run's tool invocations —
   * including the raw `data` payload that {@link GetAccessLog} omits.
   * Used by the agent runtime to populate per-call AIAgentRunStep OutputData
   * with full audit fidelity (no LLM-context truncation).
   */
  GetFullToolResults(): readonly StoredToolResult[] {
    return this.toolResults;
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

  // ─── AUDIT ───

  /**
   * Access log for this run — one entry per tool invocation, in call order.
   * Useful for audit trails, training data capture, and debugging.
   * Projected from the internal result store (no parallel state).
   */
  GetAccessLog(): ArtifactAccessLogEntry[] {
    return this.toolResults.map((r) => ({
      artifactId: r.artifactId,
      tool: r.tool,
      input: r.input,
      success: r.result.success,
      errorMessage: r.result.errorMessage,
      timestamp: r.timestamp,
      durationMs: r.durationMs,
    }));
  }

  // ─── STATIC HELPERS ───

  /**
   * Determines whether artifact content should be externalized to MJStorage
   * instead of being stored inline.
   */
  static ShouldExternalizeContent(contentLength: number, options?: { maxInlineChars?: number }): { shouldExternalize: boolean; reason: string } {
    const maxInlineChars = options?.maxInlineChars ?? 50_000;
    if (contentLength <= maxInlineChars) {
      return { shouldExternalize: false, reason: 'Content within inline limit' };
    }
    return {
      shouldExternalize: true,
      reason: 'Content exceeds ' + maxInlineChars + ' chars (' + contentLength + ' actual). Row data should be stored in MJStorage.',
    };
  }

  /**
   * Builds a truncated inline preview of a tables-based content JSON by keeping
   * only the first `maxRowsPerTable` rows per table and attaching truncation metadata.
   */
  static BuildInlinePreview(contentJson: string, maxRowsPerTable: number = 30): string {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(contentJson);
    } catch {
      return contentJson;
    }

    const tables = parsed['tables'];
    if (!Array.isArray(tables)) {
      return contentJson;
    }

    let modified = false;
    for (const table of tables) {
      const rows = (table as Record<string, unknown>)['rows'];
      if (!Array.isArray(rows) || rows.length <= maxRowsPerTable) {
        continue;
      }

      const tbl = table as Record<string, unknown>;
      if (!tbl['metadata']) {
        tbl['metadata'] = {};
      }
      const metadata = tbl['metadata'] as Record<string, unknown>;
      metadata['totalRowCount'] = rows.length;
      metadata['truncatedForStorage'] = true;
      tbl['rows'] = rows.slice(0, maxRowsPerTable);
      modified = true;
    }

    return modified ? JSON.stringify(parsed) : contentJson;
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

  /**
   * Resolve a tool library for an artifact type, walking the ParentID chain
   * of `MJ: Artifact Types` to collect libraries from the leaf type and all
   * ancestors. Child libraries override parent libraries for same-named tools.
   *
   * Resolution order:
   *  1. If the metadata engine is loaded, walk `typeName → parent → ...` via
   *     `ArtifactMetadataEngine`, instantiating each level's `ToolLibraryClass`
   *     via ClassFactory. Returns a CompositeArtifactToolLibrary.
   *  2. If the engine isn't loaded or the type isn't found, resolve the single
   *     leaf library using the `toolLibraryClass` hint plus name-based fallback.
   *
   * The engine is expected to be configured by AgentRunner before Initialize
   * is called, so path (1) is the normal case.
   */
  private ResolveLibrary(typeName: string, toolLibraryClass?: string): BaseArtifactToolLibrary {
    const chain = this.ResolveLibraryChain(typeName);
    if (chain.length > 1) return new CompositeArtifactToolLibrary(chain);
    if (chain.length === 1) return chain[0];
    // Engine didn't yield anything — fall back to a single leaf library.
    return this.ResolveLeafLibrary(typeName, toolLibraryClass);
  }

  /**
   * Walk the ParentID chain for `typeName` in ArtifactMetadataEngine,
   * instantiating each level's ToolLibraryClass via ClassFactory.
   * Returns the chain leaf-first. Levels without a ToolLibraryClass are
   * skipped. Returns [] if the engine isn't loaded or the type isn't found.
   */
  private ResolveLibraryChain(typeName: string): BaseArtifactToolLibrary[] {
    const engine = ArtifactMetadataEngine.Instance;
    if (!engine.ArtifactTypes?.length) return [];

    const chain: BaseArtifactToolLibrary[] = [];
    const visited = new Set<string>();
    let current = engine.FindArtifactType(typeName);
    while (current && !visited.has(current.ID)) {
      visited.add(current.ID);
      const className = current.ToolLibraryClass;
      if (className) {
        const lib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, className);
        if (lib) chain.push(lib);
      }
      current = current.ParentID
        ? engine.ArtifactTypes.find((t) => UUIDsEqual(t.ID, current!.ParentID!))
        : undefined;
    }
    return chain;
  }

  /**
   * Single-library fallback when the metadata engine isn't available.
   * Uses the provided `toolLibraryClass` hint first, then name-based heuristics.
   */
  private ResolveLeafLibrary(typeName: string, toolLibraryClass?: string): BaseArtifactToolLibrary {
    if (toolLibraryClass) {
      const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, toolLibraryClass);
      if (instance) return instance;
    }

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
