import { createHash } from 'node:crypto';
import { EscapeSQLString, GetGlobalObjectStore, MJEventType, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  ArtifactPermissionEngine,
  MJArtifactVersionEntity,
  SpreadsheetEngine,
  XlsxOpenXmlAdapter,
} from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { BaseArtifactToolLibrary, ArtifactToolDefinition, ArtifactToolResult, NativeFileInput, InputArtifact } from '@memberjunction/ai-core-plus';
import { DataSnapshotToolLibrary } from './artifact-tools/DataSnapshotToolLibrary';
import { JSONToolLibrary } from './artifact-tools/JSONToolLibrary';
import { TextToolLibrary } from './artifact-tools/TextToolLibrary';

// Re-export so existing consumers that import { InputArtifact } from
// './ArtifactToolManager' continue to compile. The canonical declaration
// now lives in @memberjunction/ai-core-plus alongside ExecuteAgentParams.
export type { InputArtifact };

const ARTIFACT_LIVE_MUTATION_HOOK_KEY = '___MJ_ARTIFACT_LIVE_MUTATION_HOOK___';
const ARTIFACT_LIVE_MUTATION_EVENT_CODE = 'ArtifactCollaboration.LiveContentMutation';
const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Payload emitted whenever an agent artifact mutation tool updates an artifact's content (`A4`).
 */
export interface ArtifactLiveMutationEvent {
  /** Underlying `MJ: Artifacts` primary key UUID. */
  artifactId: string;
  /** Run-scoped alpha identifier (`"A"`, `"B"`, ...). */
  alphaId: string;
  /** Newly persisted `MJ: Artifact Versions` primary key UUID, if persisted. */
  versionId?: string;
  /** Newly persisted sequential `VersionNumber`, if persisted. */
  versionNumber?: number;
  /** Updated serialized artifact content (`Markdown`, `SlideDeckSpec` JSON, `WorkbookSpec` JSON, etc.). */
  updatedContent: string;
  /** Optional base64-encoded `.xlsx` binary when produced by `SpreadsheetToolLibrary`. */
  xlsxBase64?: string;
  /** Name of the artifact mutation tool that produced the update. */
  tool: string;
  /** User context under which the agent tool executed. */
  contextUser?: UserInfo;
  /** Active `MJ: AI Agent Runs` ID, if available. */
  agentRunId?: string;
  /** Display name of the agent performing the mutation (`D5`). */
  agentName?: string;
}

/**
 * Callback registered by collaboration hosts (e.g. `ArtifactCollaborationServer`) to broadcast
 * live agent mutations to connected Yjs rooms (`A4`).
 */
export type ArtifactLiveMutationHook = (event: ArtifactLiveMutationEvent) => void | Promise<void>;

/**
 * Registers (or clears when `null`) the process-wide {@link ArtifactLiveMutationHook}
 * backed by `GetGlobalObjectStore()['___MJ_ARTIFACT_LIVE_MUTATION_HOOK___']` (`A4`).
 */
export function SetArtifactLiveMutationHook(hook: ArtifactLiveMutationHook | null): void {
  const store = GetGlobalObjectStore();
  if (!store) return;
  if (hook) {
    store[ARTIFACT_LIVE_MUTATION_HOOK_KEY] = hook;
  } else {
    delete store[ARTIFACT_LIVE_MUTATION_HOOK_KEY];
  }
}

/**
 * Retrieves the currently registered process-wide {@link ArtifactLiveMutationHook}, if any (`A4`).
 */
export function GetArtifactLiveMutationHook(): ArtifactLiveMutationHook | null {
  const store = GetGlobalObjectStore();
  const candidate = store?.[ARTIFACT_LIVE_MUTATION_HOOK_KEY];
  return typeof candidate === 'function' ? (candidate as ArtifactLiveMutationHook) : null;
}

/**
 * Optional persistence and execution context passed to {@link ArtifactToolManager.Initialize} (`A4`).
 */
export interface ArtifactToolManagerOptions {
  /** Execution user context used to persist `MJ: Artifact Versions` on mutating tool calls. */
  contextUser?: UserInfo;
  /** Metadata/entity provider used to query and save `MJ: Artifact Versions`. */
  provider?: IMetadataProvider;
  /** Lazy accessor for the active agent run (resolved after Phase 1 initialization). */
  getAgentRun?: () => { ID?: string; Agent?: string | null } | null | undefined;
  /** Explicit `MJ: AI Agent Runs` ID for D5 version attribution. */
  agentRunId?: string;
  /** Explicit agent display name for D5 version attribution (`"Edited by <agentName>"`). */
  agentName?: string;
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
  artifactId?: string;
  versionId?: string;
  versionNumber?: number;
  baseVersionNumber?: number;
  currentVersionNumber?: number;
  agentRunVersionId?: string;
  agentRunVersionEntity?: MJArtifactVersionEntity;
  contentMode?: 'File' | 'Text';
  originalXlsxBytes?: Uint8Array;
  description?: string;
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
  artifacts: Array<{ alphaId: string; name: string; typeName: string; artifactId?: string; versionNumber?: number }>;
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
  private artifactLocks: Map<string, Promise<void>> = new Map();
  private nextAlphaIndex = 0;
  private contextUser?: UserInfo;
  private provider?: IMetadataProvider;
  private getAgentRun?: () => { ID?: string; Agent?: string | null } | null | undefined;
  private agentRunId?: string;
  private agentName?: string;

  private static readonly MUTATING_TOOL_NAMES: ReadonlySet<string> = new Set([
    // DocumentToolLibrary
    'insert_block_after',
    'replace_block',
    'delete_block',
    'upsert_table',
    'insert_live_block',
    'embed_artifact_block',
    'propose_suggestion',
    'replace_section',
    'insert_section',
    'delete_section',
    // SpreadsheetToolLibrary
    'write_cells',
    'set_cells',
    'insert_rows',
    'delete_rows',
    'insert_columns',
    'delete_columns',
    'add_sheet',
    'rename_sheet',
    'delete_sheet',
    'upsert_live_table',
    'upsert_chart',
    'embed_artifact',
    'sort_and_filter',
    // SlideDeckToolLibrary
    'add_slide',
    'update_slide',
    'delete_slide',
    'reorder_slides',
    'upsert_slide_element',
    'update_slide_region',
    'delete_slide_element',
    'update_speaker_notes',
    'apply_theme',
    'generate_deck_from_markdown',
    // WhiteboardToolLibrary
    'upsert_nodes',
    'UpsertNodes',
    'connect_nodes',
    'ConnectNodes',
    'add_sticky_notes',
    'AddStickyNotes',
    'delete_elements',
    'DeleteElements',
    'auto_layout',
    'AutoLayout',
  ]);

  // ─── LIFECYCLE ───

  /** Sets or updates the agent run attribution context (`D5`). */
  SetAgentRunContext(agentRunId: string, agentName?: string): void {
    this.agentRunId = agentRunId;
    if (agentName !== undefined) {
      this.agentName = agentName;
    }
  }

  /** Initialize with input artifacts, assigning alpha IDs and optional persistence context (`A4`) */
  Initialize(inputArtifacts: InputArtifact[], options?: ArtifactToolManagerOptions): void {
    this.Clear();
    this.contextUser = options?.contextUser;
    this.provider = options?.provider;
    this.getAgentRun = options?.getAgentRun;
    this.agentRunId = options?.agentRunId;
    this.agentName = options?.agentName;
    for (const artifact of inputArtifacts) {
      const alphaId = this.nextAlphaId();
      const isXlsxBinary =
        Buffer.isBuffer(artifact.content) &&
        artifact.content.length > 4 &&
        artifact.content[0] === 0x50 &&
        artifact.content[1] === 0x4b;
      this.artifacts.set(alphaId, {
        alphaId,
        name: artifact.name,
        typeName: artifact.typeName,
        artifactId: artifact.artifactId,
        versionId: artifact.versionId,
        versionNumber: artifact.versionNumber,
        baseVersionNumber: artifact.versionNumber,
        currentVersionNumber: artifact.versionNumber,
        contentMode: isXlsxBinary ? 'File' : undefined,
        originalXlsxBytes: isXlsxBinary ? new Uint8Array(artifact.content as Buffer) : undefined,
        description: artifact.description,
        mimeType: artifact.mimeType,
        content: artifact.content,
        library: this.resolveLibrary(artifact.typeName, artifact.toolLibraryClass),
        annotation: artifact.annotation,
        deliveryMode: artifact.deliveryMode,
        forceToolsOnly: artifact.forceToolsOnly,
      });
    }
  }

  /** Register a mid-run artifact and return its alpha ID */
  RegisterArtifact(artifact: InputArtifact): string {
    const alphaId = this.nextAlphaId();
    const isXlsxBinary =
      Buffer.isBuffer(artifact.content) &&
      artifact.content.length > 4 &&
      artifact.content[0] === 0x50 &&
      artifact.content[1] === 0x4b;
    this.artifacts.set(alphaId, {
      alphaId,
      name: artifact.name,
      typeName: artifact.typeName,
      artifactId: artifact.artifactId,
      versionId: artifact.versionId,
      versionNumber: artifact.versionNumber,
      baseVersionNumber: artifact.versionNumber,
      currentVersionNumber: artifact.versionNumber,
      contentMode: isXlsxBinary ? 'File' : undefined,
      originalXlsxBytes: isXlsxBinary ? new Uint8Array(artifact.content as Buffer) : undefined,
      description: artifact.description,
      mimeType: artifact.mimeType,
      content: artifact.content,
      library: this.resolveLibrary(artifact.typeName, artifact.toolLibraryClass),
    });
    return alphaId;
  }

  /**
   * Resolves a manifest alpha ID (e.g. `"A"`, `"B"`), an artifact UUID, or a version UUID
   * to the underlying `MJ: Artifacts` record UUID (`artifactId`).
   * Allows agents to reference either `"A"` or the full UUID in `artifactDirective.targetArtifactId`.
   */
  ResolveArtifactUuid(idOrAlpha: string | undefined | null): string | undefined {
    if (typeof idOrAlpha !== 'string') return undefined;
    const trimmed = idOrAlpha.trim();
    if (!trimmed) return undefined;

    // 1. Direct alpha ID lookup (case-insensitive, e.g. 'A', 'B', 'AA', or 'Artifact B')
    const normalizedAlpha = trimmed.replace(/^artifact\s+/i, '').trim().toUpperCase();
    const byAlpha = this.artifacts.get(normalizedAlpha);
    if (byAlpha?.artifactId) {
      return byAlpha.artifactId;
    }

    // 2. Match by artifactId or versionId UUID
    for (const entry of this.artifacts.values()) {
      if (entry.artifactId && (UUIDsEqual(entry.artifactId, trimmed) || (entry.versionId && UUIDsEqual(entry.versionId, trimmed)))) {
        return entry.artifactId;
      }
    }

    // 3. Pass through well-formed UUIDs so callers can pass an explicit artifact UUID directly
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return trimmed;
    }
    return undefined;
  }

  /** Reset all state */
  Clear(): void {
    this.artifacts.clear();
    this.toolResults = [];
    this.artifactLocks.clear();
    this.nextAlphaIndex = 0;
    this.contextUser = undefined;
    this.provider = undefined;
    this.getAgentRun = undefined;
    this.agentRunId = undefined;
    this.agentName = undefined;
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
  ToManifestString(opts?: { supportedMimeTypes?: ReadonlyArray<string> | null; nativeTools?: boolean }): string {
    if (this.artifacts.size === 0) return '';

    const lines: string[] = ['## Available Artifacts\n'];
    const supportedMimes = opts?.supportedMimeTypes ?? null;
    for (const entry of this.artifacts.values()) {
      const sizeSuffix = Buffer.isBuffer(entry.content)
        ? ` (${(entry.content.length / 1024).toFixed(0)} KB)`
        : typeof entry.content === 'string' && entry.content.length > 0
          ? ` (${(entry.content.length / 1024).toFixed(0)} KB)`
          : '';
      const versionNote = entry.versionNumber != null ? ` (v${entry.versionNumber})` : '';
      const idNote = entry.artifactId ? ` [artifactId: ${entry.artifactId}]` : '';
      const mimeNote = entry.mimeType ? ` [${entry.mimeType}]` : '';
      lines.push(`**${entry.alphaId}** — ${entry.typeName}: "${entry.name}"${versionNote}${idNote}${mimeNote}${sizeSuffix}`);

      if (entry.description) {
        const desc = entry.description.length > 240 ? entry.description.slice(0, 240) + '…' : entry.description;
        lines.push(`    > Description: ${desc}`);
      }

      // Surface the content SHAPE so the agent paths correctly (e.g. knows it's a top-level JSON
      // array, not a `content`-wrapped object) instead of guessing and failing on the first tool call.
      const shape = this.describeContentShape(entry.content);
      if (shape) {
        lines.push(`    > Shape: ${shape}`);
      }

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
    lines.push('These artifacts are ALREADY available to you server-side. Read them directly with the');
    lines.push('artifact tools below (e.g. `get_full`), or use one as a pipeline source (e.g. `get_full`');
    lines.push('then `where`/`select`/`distinct`). NEVER ask the user to paste, provide, upload, or "send"');
    lines.push('an artifact\'s content, and do NOT request a data snapshot to obtain it — you already have it.');
    if (opts?.nativeTools) {
      // Native-only mode: artifact tools are called through the `artifact_tool` tool, and there is no artifactDirective.
      lines.push('IMPORTANT: Always use the single-letter artifact ID (A, B, C, etc.) as the `artifactId` argument of `artifact_tool` — NOT the artifact name.');
      return lines.join('\n');
    }
    lines.push('IMPORTANT: Always use the single-letter artifact ID (A, B, C, etc.) as the `artifactId` value in `artifactToolCalls` — NOT the artifact name.');
    lines.push('When setting `artifactDirective.targetArtifactId` (with `behavior: "version-source"`), you may use either the artifact\'s `artifactId` UUID or its single-letter ID (A, B, C, etc.).');
    return lines.join('\n');
  }

  /**
   * Distinct artifact tool names available across all input artifacts. Used to register
   * artifact tools into a pipeline's tool registry (one invocable per name; the target
   * artifact is selected at call time via an `artifactId` param).
   */
  public GetAvailableToolNames(): string[] {
    const names = new Set<string>();
    for (const entry of this.artifacts.values()) {
      for (const tool of entry.library.GetToolList()) {
        names.add(tool.name);
      }
    }
    return [...names];
  }

  /**
   * Compact, agent-facing description of an artifact's content structure for the manifest.
   * For JSON: whether it's an array (+ length + item fields) or an object (+ keys, plus title/table/row
   * summary for Data artifacts) — so the agent paths against the REAL shape rather than guessing a
   * `content` wrapper. For text: line count + a short start preview. Returns null for binary / empty content.
   */
  private describeContentShape(content: string | Buffer): string | null {
    if (Buffer.isBuffer(content)) {
      return null;
    }
    const s = content.trim();
    if (s.length === 0) {
      return null;
    }
    if ((s.startsWith('{') || s.startsWith('[')) && s.length < 2_000_000) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          const firstObj = parsed.find((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
          const keys = firstObj ? Object.keys(firstObj).slice(0, 12).join(', ') : '';
          return (
            `JSON array of ${parsed.length} item(s)${keys ? `; item fields: ${keys}` : ''}. ` +
            `The artifact IS this array. Easiest: read it with get_full and pipe through the operators ` +
            `(get_full → where → select → distinct). There is no "content" wrapper to path into.`
          );
        }
        if (parsed !== null && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>;
          const base = `JSON object; keys: ${Object.keys(obj).slice(0, 20).join(', ')}.`;
          const extras: string[] = [];
          if (typeof obj.title === 'string' && obj.title.trim()) {
            extras.push(`Title: "${obj.title.trim().slice(0, 120)}".`);
          }
          if (Array.isArray(obj.tables) && obj.tables.length > 0) {
            const tableSummaries = (obj.tables as Array<Record<string, unknown>>).slice(0, 8).map((t) => {
              const tName = typeof t?.name === 'string' ? t.name : (typeof t?.id === 'string' ? t.id : 'table');
              const tRows = Array.isArray(t?.rows)
                ? t.rows.length
                : (typeof (t?.metadata as Record<string, unknown> | undefined)?.rowCount === 'number'
                  ? ((t.metadata as Record<string, unknown>).rowCount as number)
                  : 0);
              return `"${tName}" (${tRows} rows)`;
            });
            extras.push(`Tables (${obj.tables.length}): ${tableSummaries.join(', ')}.`);
          } else if (Array.isArray(obj.rows)) {
            const colCount = Array.isArray(obj.columns) ? `, ${obj.columns.length} columns` : '';
            extras.push(`Single table (${obj.rows.length} rows${colCount}).`);
          }
          return extras.length > 0 ? `${base} ${extras.join(' ')}` : base;
        }
        return `JSON ${typeof parsed} value.`;
      } catch {
        /* not valid JSON — fall through to text preview */
      }
    }
    const preview = s.replace(/\s+/g, ' ').slice(0, 120);
    return `text, ${s.split('\n').length} line(s); starts: "${preview}${s.length > 120 ? '…' : ''}"`;
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
   * Serializes async operations per artifact so parallel tool calls on the same
   * artifact never race for version numbers or overwrite each other's mutations.
   */
  private async withArtifactLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.artifactLocks.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.then(() => current);
    this.artifactLocks.set(lockKey, chained);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.artifactLocks.get(lockKey) === chained) {
        this.artifactLocks.delete(lockKey);
      }
    }
  }

  /**
   * Alias for {@link ExecuteSingleToolCall} supporting single-call dispatch.
   */
  async ExecuteToolCall(call: ArtifactToolCall): Promise<StoredToolResult> {
    return this.ExecuteSingleToolCall(call);
  }

  /**
   * Execute a single tool call and return its stored result. The result is
   * also retained in the manager's internal store, so {@link ToJSON} reflects
   * the resultCount and bulk callers can be sure every dispatch is recorded.
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

    const targetEntry = entry;
    const lockKey = targetEntry.artifactId ?? targetEntry.alphaId;

    return this.withArtifactLock(lockKey, async () => {
      const isMutatingTool = ArtifactToolManager.MUTATING_TOOL_NAMES.has(call.tool);

      // 1. Permission check before any tool execution (Blocker 2)
      if (targetEntry.artifactId && this.contextUser && this.provider) {
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
          this.provider,
          targetEntry.artifactId,
          this.contextUser,
        );
        if (isMutatingTool && !perms.CanEdit) {
          const deniedStored: StoredToolResult = {
            artifactId: call.artifactId,
            tool: call.tool,
            input: call.input,
            result: {
              success: false,
              data: null,
              errorMessage: 'Permission denied: user does not have edit access to this artifact',
            },
            timestamp: new Date(),
            durationMs: Date.now() - startedAt,
          };
          this.toolResults.push(deniedStored);
          return deniedStored;
        }
        if (!isMutatingTool && !perms.CanRead) {
          const deniedStored: StoredToolResult = {
            artifactId: call.artifactId,
            tool: call.tool,
            input: call.input,
            result: {
              success: false,
              data: null,
              errorMessage: 'Permission denied: user does not have read access to this artifact',
            },
            timestamp: new Date(),
            durationMs: Date.now() - startedAt,
          };
          this.toolResults.push(deniedStored);
          return deniedStored;
        }
      }

      // 2. Real DB concurrency pre-check before mutating in-memory session state
      if (isMutatingTool && targetEntry.artifactId && this.contextUser && this.provider) {
        const conflictError = await this.checkConcurrentDatabaseModification(targetEntry);
        if (conflictError) {
          const conflictStored: StoredToolResult = {
            artifactId: call.artifactId,
            tool: call.tool,
            input: call.input,
            result: {
              success: false,
              data: null,
              errorMessage: conflictError,
            },
            timestamp: new Date(),
            durationMs: Date.now() - startedAt,
          };
          this.toolResults.push(conflictStored);
          return conflictStored;
        }
      }

      // Wrap InvokeTool so any exception inside a handler becomes a structured
      // error result instead of propagating up to the agent loop.
      let result: ArtifactToolResult;
      try {
        result = await targetEntry.library.InvokeTool(call.tool, call.input, targetEntry.content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result = {
          success: false,
          data: null,
          errorMessage: `Tool "${call.tool}" on artifact ${targetEntry.alphaId} threw: ${msg}. The artifact content may be malformed for this tool — try a different tool or a different artifact.`,
        };
      }

      let storedResult: ArtifactToolResult = result;
      if (
        result.success &&
        result.data !== null &&
        typeof result.data === 'object' &&
        !Array.isArray(result.data) &&
        typeof (result.data as Record<string, unknown>).updatedContent === 'string'
      ) {
        const rawData = result.data as Record<string, unknown>;
        const updatedContent = rawData.updatedContent as string;
        let xlsxBase64 = typeof rawData.xlsxBase64 === 'string' ? rawData.xlsxBase64 : undefined;

        const previousContent = targetEntry.content;
        const previousOriginalXlsxBytes = targetEntry.originalXlsxBytes;

        // If the spreadsheet started from an uploaded .xlsx binary, patch the original ZIP bytes in-place
        if (targetEntry.originalXlsxBytes) {
          try {
            const parsedWorkbook = SpreadsheetEngine.Instance.ParseWorkbook(updatedContent);
            const patchedBytes = XlsxOpenXmlAdapter.Instance.PatchXlsxBytes(
              targetEntry.originalXlsxBytes,
              parsedWorkbook,
            );
            targetEntry.originalXlsxBytes = patchedBytes;
            xlsxBase64 = Buffer.from(patchedBytes).toString('base64');
          } catch {
            // Keep xlsxBase64 returned by tool library if updatedContent is not a WorkbookSpec
          }
        }

        // 1. Update in-memory entry.content so sequential tool calls see the new content & revisionHash
        targetEntry.content = updatedContent;

        // 2. Persist a single MJ: Artifact Versions record per agent run when artifactId, contextUser, and provider are available
        let persisted = false;
        if (targetEntry.artifactId && this.contextUser && this.provider) {
          const persistOutcome = await this.persistArtifactVersionMutation(
            targetEntry,
            updatedContent,
            xlsxBase64,
            call.tool,
          );
          if (!persistOutcome.persisted) {
            // Roll back in-memory session state on concurrency conflict or File-mode upload failure
            targetEntry.content = previousContent;
            targetEntry.originalXlsxBytes = previousOriginalXlsxBytes;
            const failedStored: StoredToolResult = {
              artifactId: call.artifactId,
              tool: call.tool,
              input: call.input,
              result: {
                success: false,
                data: null,
                errorMessage: persistOutcome.errorMessage ?? 'Failed to persist artifact version mutation',
              },
              timestamp: new Date(),
              durationMs: Date.now() - startedAt,
            };
            this.toolResults.push(failedStored);
            return failedStored;
          }
          persisted = true;
        }

        // 3. Notify live Yjs collaboration rooms via registered hook and MJGlobal event
        const hook = GetArtifactLiveMutationHook();
        const activeAgentRunId = this.agentRunId ?? this.getAgentRun?.()?.ID;
        const activeAgentName = this.agentName ?? this.getAgentRun?.()?.Agent ?? undefined;
        if (hook && targetEntry.artifactId) {
          try {
            await hook({
              artifactId: targetEntry.artifactId,
              alphaId: targetEntry.alphaId,
              versionId: targetEntry.versionId,
              versionNumber: targetEntry.versionNumber,
              updatedContent,
              xlsxBase64,
              tool: call.tool,
              contextUser: this.contextUser,
              agentRunId: activeAgentRunId,
              agentName: activeAgentName,
            });
          } catch (hookErr) {
            LogError(`ArtifactToolManager: live mutation hook failed for artifact '${targetEntry.artifactId}': ${(hookErr as Error).message}`);
          }
        }
        if (targetEntry.artifactId && this.contextUser) {
          try {
            MJGlobal.Instance.RaiseEvent({
              component: this,
              event: MJEventType.ComponentEvent,
              eventCode: ARTIFACT_LIVE_MUTATION_EVENT_CODE,
              args: {
                ArtifactID: targetEntry.artifactId,
                NewContent: updatedContent,
                PreviousContent: previousContent,
                ToolName: call.tool,
                User: this.contextUser,
                SaveVersion: false,
              },
            });
          } catch {
            // Never fail tool execution if event subscribers throw
          }
        }

        // 4. Sanitize the LLM-facing copy of result.data without mutating rawData returned by library.InvokeTool
        const sanitizedData: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rawData)) {
          if (k === 'updatedContent' || k === 'xlsxBase64') continue;
          sanitizedData[k] = v;
        }
        sanitizedData.persisted = persisted;
        if (targetEntry.versionNumber !== undefined) {
          sanitizedData.versionNumber = targetEntry.versionNumber;
        }
        storedResult = {
          ...result,
          data: sanitizedData,
        };
      }

      const stored: StoredToolResult = {
        artifactId: call.artifactId,
        tool: call.tool,
        input: call.input,
        result: storedResult,
        timestamp: new Date(),
        durationMs: Date.now() - startedAt,
      };
      this.toolResults.push(stored);
      return stored;
    });
  }

  /**
   * Queries `MJ: Artifact Versions` to verify no human/external writer saved a newer version
   * (`VersionNumber > entry.currentVersionNumber` with `ID !== entry.agentRunVersionId`).
   */
  private async checkConcurrentDatabaseModification(entry: ArtifactEntry): Promise<string | null> {
    if (!entry.artifactId || !this.contextUser || !this.provider) {
      return null;
    }
    try {
      const rv = RunView.FromMetadataProvider(this.provider);
      const latestRes = await rv.RunView<{
        ID: string;
        VersionNumber: number;
        ContentMode?: 'File' | 'Text' | null;
        FileID?: string | null;
      }>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${EscapeSQLString(entry.artifactId)}'`,
          OrderBy: 'VersionNumber DESC',
          Fields: ['ID', 'VersionNumber', 'ContentMode', 'FileID'],
          MaxRows: 1,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        this.contextUser,
      );
      if (!latestRes.Success || !latestRes.Results?.length) {
        return null;
      }
      const latestRow = latestRes.Results[0];
      if (!entry.contentMode && (latestRow.ContentMode === 'File' || latestRow.ContentMode === 'Text')) {
        entry.contentMode = latestRow.ContentMode;
      }
      const expectedVersion = entry.currentVersionNumber ?? entry.versionNumber ?? 0;
      if (
        latestRow.VersionNumber > expectedVersion &&
        (!entry.agentRunVersionId || !UUIDsEqual(latestRow.ID, entry.agentRunVersionId))
      ) {
        return `Artifact was modified concurrently (v${latestRow.VersionNumber} > v${expectedVersion}); reload required before mutating`;
      }
    } catch {
      // Proceed if RunView is unavailable in minimal test stubs
    }
    return null;
  }

  /**
   * Persists or updates a single `MJ: Artifact Versions` record per agent run for an artifact (`A4`, `D5`),
   * enforcing concurrency checks against human edits and fail-closed `ContentMode === 'File'` storage semantics.
   */
  private async persistArtifactVersionMutation(
    entry: ArtifactEntry,
    updatedContent: string,
    xlsxBase64: string | undefined,
    toolName: string,
  ): Promise<{ persisted: boolean; errorMessage?: string }> {
    if (!entry.artifactId || !this.contextUser || !this.provider) {
      return { persisted: false };
    }

    const conflictBeforeSave = await this.checkConcurrentDatabaseModification(entry);
    if (conflictBeforeSave) {
      return { persisted: false, errorMessage: conflictBeforeSave };
    }

    const contentHash = createHash('sha256').update(updatedContent, 'utf8').digest('hex');
    const isFileMode = entry.contentMode === 'File';

    // Ensure .xlsx bytes exist when operating on a File-mode spreadsheet
    let effectiveXlsxBase64 = xlsxBase64;
    if (!effectiveXlsxBase64 && isFileMode) {
      try {
        const workbook = SpreadsheetEngine.Instance.ParseWorkbook(updatedContent);
        const bytes = entry.originalXlsxBytes
          ? XlsxOpenXmlAdapter.Instance.PatchXlsxBytes(entry.originalXlsxBytes, workbook)
          : SpreadsheetEngine.Instance.ExportToXlsxBytes(workbook);
        entry.originalXlsxBytes = bytes;
        effectiveXlsxBase64 = Buffer.from(bytes).toString('base64');
      } catch (err) {
        return {
          persisted: false,
          errorMessage: `Failed to generate .xlsx binary for File-mode artifact: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    let uploadedFileId: string | null = null;
    let xlsxSizeBytes: number | null = null;
    if (effectiveXlsxBase64) {
      const xlsxBuf = Buffer.from(effectiveXlsxBase64, 'base64');
      xlsxSizeBytes = xlsxBuf.byteLength;
      try {
        await FileStorageEngine.Instance.Config(false, this.contextUser);
        if (FileStorageEngine.Instance.HasStorageAccounts) {
          const safeFileName = entry.name.toLowerCase().endsWith('.xlsx') ? entry.name : `${entry.name || 'workbook'}.xlsx`;
          const uploadRes = await FileStorageEngine.Instance.UploadFile({
            content: xlsxBuf,
            fileName: safeFileName,
            mimeType: XLSX_MIME_TYPE,
            contextUser: this.contextUser,
            provider: this.provider,
          });
          uploadedFileId = uploadRes.FileID;
        }
      } catch {
        uploadedFileId = null;
      }
    }

    // Fail closed if the artifact is in File mode and the .xlsx upload did not succeed
    if (isFileMode && !uploadedFileId) {
      return {
        persisted: false,
        errorMessage:
          'Failed to upload updated .xlsx binary to FileStorageEngine for File-mode artifact; refusing to downgrade ContentMode to Text',
      };
    }

    const activeAgentRunId = this.agentRunId ?? this.getAgentRun?.()?.ID;
    const activeAgentName = this.agentName ?? this.getAgentRun?.()?.Agent ?? undefined;
    const attributionConfig =
      activeAgentRunId || activeAgentName
        ? JSON.stringify({
            agentRunId: activeAgentRunId ?? null,
            agentName: activeAgentName ?? null,
            lastTool: toolName,
          })
        : null;

    try {
      let versionEntity = entry.agentRunVersionEntity;
      const isReuse = Boolean(versionEntity && entry.agentRunVersionId);
      const targetVersionNumber = isReuse
        ? (entry.currentVersionNumber ?? entry.versionNumber ?? 1)
        : (entry.currentVersionNumber ?? entry.versionNumber ?? 0) + 1;

      if (!versionEntity) {
        versionEntity = await this.provider.GetEntityObject<MJArtifactVersionEntity>(
          'MJ: Artifact Versions',
          this.contextUser,
        );
        versionEntity.NewRecord();
        versionEntity.ArtifactID = entry.artifactId;
        versionEntity.VersionNumber = targetVersionNumber;
        versionEntity.UserID = this.contextUser.ID;
      }

      versionEntity.Name = activeAgentName ? `Edited by ${activeAgentName}` : entry.name;
      versionEntity.Comments = activeAgentName
        ? `Edited by ${activeAgentName} via '${toolName}'`
        : `Updated via agent tool '${toolName}'`;
      versionEntity.ContentHash = contentHash;

      if (uploadedFileId) {
        const safeFileName = entry.name.toLowerCase().endsWith('.xlsx') ? entry.name : `${entry.name || 'workbook'}.xlsx`;
        versionEntity.ContentMode = 'File';
        versionEntity.FileID = uploadedFileId;
        versionEntity.MimeType = XLSX_MIME_TYPE;
        versionEntity.FileName = safeFileName;
        versionEntity.ContentSizeBytes = xlsxSizeBytes;
        versionEntity.Content = null;
        versionEntity.Configuration = updatedContent;
        entry.contentMode = 'File';
      } else {
        versionEntity.ContentMode = 'Text';
        versionEntity.FileID = null;
        versionEntity.Content = updatedContent;
        if (effectiveXlsxBase64) {
          versionEntity.Configuration = updatedContent;
        } else if (attributionConfig) {
          versionEntity.Configuration = attributionConfig;
        }
        entry.contentMode = 'Text';
      }

      const saved = await versionEntity.Save();
      if (saved) {
        entry.versionId = versionEntity.ID;
        entry.versionNumber = targetVersionNumber;
        entry.currentVersionNumber = targetVersionNumber;
        entry.agentRunVersionId = versionEntity.ID;
        entry.agentRunVersionEntity = versionEntity;
        return { persisted: true };
      }

      // If Save() returned false, check whether a concurrent human version was saved in the meantime
      const postSaveConflict = await this.checkConcurrentDatabaseModification(entry);
      if (postSaveConflict) {
        return { persisted: false, errorMessage: postSaveConflict };
      }
      return { persisted: false, errorMessage: `Failed to save MJ: Artifact Versions record for '${entry.artifactId}'` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(`ArtifactToolManager: failed to persist version for artifact '${entry.artifactId}': ${msg}`);
      return { persisted: false, errorMessage: msg };
    }
  }

  /**
   * Execute a batch of tool calls in parallel. Each call's StoredToolResult is
   * also returned by {@link ExecuteSingleToolCall} for callers that wrap each
   * invocation in its own AIAgentRunStep. Returns void to preserve the
   * original contract.
   */
  async ExecuteToolCalls(calls: ArtifactToolCall[]): Promise<void> {
    await Promise.all(calls.map((c) => this.ExecuteSingleToolCall(c)));
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
  private nextAlphaId(): string {
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
  private resolveLibrary(typeName: string, toolLibraryClass?: string): BaseArtifactToolLibrary {
    const chain = this.resolveLibraryChain(typeName);
    if (chain.length > 1) return new CompositeArtifactToolLibrary(chain);
    if (chain.length === 1) return chain[0];
    // Engine didn't yield anything — fall back to a single leaf library.
    return this.resolveLeafLibrary(typeName, toolLibraryClass);
  }

  /**
   * Walk the ParentID chain for `typeName` in ArtifactMetadataEngine,
   * instantiating each level's ToolLibraryClass via ClassFactory.
   * Returns the chain leaf-first. Levels without a ToolLibraryClass are
   * skipped. Returns [] if the engine isn't loaded or the type isn't found.
   */
  private resolveLibraryChain(typeName: string): BaseArtifactToolLibrary[] {
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
  private resolveLeafLibrary(typeName: string, toolLibraryClass?: string): BaseArtifactToolLibrary {
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
      const sheetLib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, 'SpreadsheetToolLibrary');
      if (sheetLib) return sheetLib;
      const excelLib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, 'ExcelToolLibrary');
      if (excelLib) return excelLib;
    }
    if (lower.includes('word') || lower.includes('docx') || lower.includes('document')) {
      const lib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, 'DocxToolLibrary');
      if (lib) return lib;
    }
    return new TextToolLibrary();
  }
}
