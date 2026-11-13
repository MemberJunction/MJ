import { createHash } from 'node:crypto';
import { EscapeSQLString, GetGlobalObjectStore, IsValidUUID, MJEventType, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { IMetadataProvider, IRunViewProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  ArtifactPermissionEngine,
  MJArtifactVersionEntity,
  MJFileEntity,
  SpreadsheetEngine,
  XlsxOpenXmlAdapter,
} from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { UserCache } from '@memberjunction/generic-database-provider';
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
  /** Content snapshot prior to this tool mutation, used as the 3-way merge base against live rooms (`R8-2d`). */
  previousContent?: string;
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
  /** Whether room commit should be deferred until MJ: Artifact Versions persistence succeeds (`R9-5`). */
  deferCommit?: boolean;
}

/**
 * Optional reconciliation outcome returned by {@link ArtifactLiveMutationHook} when merging an agent
 * mutation into a live Yjs room or persisted working state (`R8-2d`).
 */
export interface ArtifactLiveMutationHookResult {
  applied?: boolean;
  mergedContent?: string;
  hadConflict?: boolean;
  rejectedHunksCount?: number;
  rejectedAgentHunks?: Array<{
    BaseLines: string[];
    LiveLines: string[];
    RejectedAgentLines: string[];
  }>;
  /** Optional commit callback executed after version persistence succeeds (`R9-5`). */
  commit?: (persisted?: { versionId?: string; versionNumber?: number }) => Promise<ArtifactLiveMutationHookResult | void>;
  /** Optional rollback callback executed if version persistence fails (`R9-5`). */
  rollback?: (rolledBackVersionId?: string) => Promise<void> | void;
}

/**
 * Callback registered by collaboration hosts (e.g. `ArtifactCollaborationServer`) to broadcast
 * and reconcile live agent mutations against connected Yjs rooms (`A4`, `R8-2d`).
 */
export type ArtifactLiveMutationHook = (
  event: ArtifactLiveMutationEvent,
) => void | ArtifactLiveMutationHookResult | Promise<void | ArtifactLiveMutationHookResult>;

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

interface ArtifactToolLibraryWithRevisionHash extends BaseArtifactToolLibrary {
  ComputeRevisionHash?(content: string): string;
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
  configuration?: string;
  comments?: string;
  dirty?: boolean;
  mimeType?: string;
  content: string | Buffer;
  library: ArtifactToolLibraryWithRevisionHash;
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

  public ComputeRevisionHash?(content: string): string | undefined {
    for (const lib of this.chain) {
      const candidate = lib as ArtifactToolLibraryWithRevisionHash;
      if (typeof candidate.ComputeRevisionHash === 'function') {
        return candidate.ComputeRevisionHash(content);
      }
    }
    return undefined;
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

interface PersistVersionRollbackSnapshot {
  hadExistingAgentRunVersion: boolean;
  entryVersionId?: string;
  entryVersionNumber?: number;
  entryCurrentVersionNumber?: number;
  entryAgentRunVersionId?: string;
  entryAgentRunVersionEntity?: MJArtifactVersionEntity;
  entryContentMode?: ArtifactEntry['contentMode'];
  entryContent?: string | Buffer;
  entryConfiguration?: string;
  entryName?: string;
  entryDescription?: string;
  entryComments?: string;
  entryDirty?: boolean;
  entityName?: string | null;
  entityComments?: string | null;
  entityContent?: string | null;
  entityConfiguration?: string | null;
  entityContentHash?: string | null;
  entityContentSizeBytes?: number | null;
  entityContentMode?: MJArtifactVersionEntity['ContentMode'] | null;
  entityFileID?: string | null;
  entityMimeType?: string | null;
  entityFileName?: string | null;
}

interface PersistMutationOutcome {
  persisted: boolean;
  errorMessage?: string;
  versionEntity?: MJArtifactVersionEntity;
  supersededFileId?: string | null;
  rollbackSnapshot?: PersistVersionRollbackSnapshot;
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

  private static readonly STRUCTURAL_SPREADSHEET_TOOLS: ReadonlySet<string> = new Set([
    'insert_rows',
    'delete_rows',
    'insert_columns',
    'delete_columns',
    'add_sheet',
    'delete_sheet',
    'rename_sheet',
    'merge_cells',
    'unmerge_cells',
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
    if (this.artifacts.size > 0) {
      names.add('reload_artifact');
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
      sections.push(
        `- **reload_artifact**(artifactId) — Reloads the latest persisted version of the artifact from the database to recover after a concurrent modification conflict.`,
      );
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

      // 1b. Handle universal reload_artifact recovery tool (Round 3 Item 9)
      if (call.tool === 'reload_artifact') {
        const reloadResult = await this.reloadArtifactFromDatabase(targetEntry);
        const reloadStored: StoredToolResult = {
          artifactId: call.artifactId,
          tool: call.tool,
          input: call.input,
          result: reloadResult,
          timestamp: new Date(),
          durationMs: Date.now() - startedAt,
        };
        this.toolResults.push(reloadStored);
        return reloadStored;
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

      // 2b. Refuse structural mutations on File-mode .xlsx workbooks to preserve OpenXML fidelity (Round 3 Item 12)
      if (
        (targetEntry.contentMode === 'File' || Boolean(targetEntry.originalXlsxBytes)) &&
        ArtifactToolManager.STRUCTURAL_SPREADSHEET_TOOLS.has(call.tool)
      ) {
        const refusedStored: StoredToolResult = {
          artifactId: call.artifactId,
          tool: call.tool,
          input: call.input,
          result: {
            success: false,
            data: null,
            errorMessage: `Structural spreadsheet tool "${call.tool}" is not supported on File-mode .xlsx workbooks to preserve OpenXML fidelity. Only cell value/formula updates (e.g. write_cells) are allowed on uploaded .xlsx files.`,
          },
          timestamp: new Date(),
          durationMs: Date.now() - startedAt,
        };
        this.toolResults.push(refusedStored);
        return refusedStored;
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
        const previousContentStr = typeof previousContent === 'string' ? previousContent : undefined;
        const previousOriginalXlsxBytes = targetEntry.originalXlsxBytes;

        // If the spreadsheet started from an uploaded .xlsx binary, patch the original ZIP bytes in-place (fail closed on error)
        if (targetEntry.originalXlsxBytes) {
          try {
            const parsedWorkbook = SpreadsheetEngine.Instance.ParseWorkbook(updatedContent);
            const patchedBytes = XlsxOpenXmlAdapter.Instance.PatchXlsxBytes(
              targetEntry.originalXlsxBytes,
              parsedWorkbook,
            );
            targetEntry.originalXlsxBytes = patchedBytes;
            xlsxBase64 = Buffer.from(patchedBytes).toString('base64');
          } catch (patchErr) {
            const failedPatch: StoredToolResult = {
              artifactId: call.artifactId,
              tool: call.tool,
              input: call.input,
              result: {
                success: false,
                data: null,
                errorMessage: `Failed to patch File-mode .xlsx binary in-place: ${patchErr instanceof Error ? patchErr.message : String(patchErr)}`,
              },
              timestamp: new Date(),
              durationMs: Date.now() - startedAt,
            };
            this.toolResults.push(failedPatch);
            return failedPatch;
          }
        }

        // 1. Reconcile against live Yjs collaboration room via registered hook BEFORE persisting Version
        //    so persisted MJ: Artifact Versions and targetEntry.content never diverge from the live room (`R8-2d`).
        const hook = GetArtifactLiveMutationHook();
        const activeAgentRunId = this.agentRunId ?? this.getAgentRun?.()?.ID;
        const activeAgentName = this.agentName ?? this.getAgentRun?.()?.Agent ?? undefined;
        let hookResult: ArtifactLiveMutationHookResult | void = undefined;
        let hookInvokedBeforePersist = false;

        const willPersist = Boolean(targetEntry.artifactId && this.contextUser && this.provider);
        const prospectiveVersionNumber = willPersist
          ? targetEntry.agentRunVersionEntity && targetEntry.agentRunVersionId
            ? (targetEntry.currentVersionNumber ?? targetEntry.versionNumber ?? 1)
            : (targetEntry.currentVersionNumber ?? targetEntry.versionNumber ?? 0) + 1
          : targetEntry.versionNumber;

        if (hook && targetEntry.artifactId) {
          hookInvokedBeforePersist = true;
          try {
            hookResult = await hook({
              artifactId: targetEntry.artifactId,
              alphaId: targetEntry.alphaId,
              versionId: targetEntry.agentRunVersionId ?? targetEntry.versionId,
              versionNumber: prospectiveVersionNumber,
              previousContent: previousContentStr,
              updatedContent,
              xlsxBase64,
              tool: call.tool,
              contextUser: this.contextUser,
              agentRunId: activeAgentRunId,
              agentName: activeAgentName,
              deferCommit: willPersist,
            });
          } catch (hookErr) {
            LogError(
              `ArtifactToolManager: live mutation hook failed for artifact '${targetEntry.artifactId}': ${
                hookErr instanceof Error ? hookErr.message : String(hookErr)
              }`,
            );
          }
        }

        let effectiveContent =
          hookResult && typeof hookResult === 'object' && typeof hookResult.mergedContent === 'string'
            ? hookResult.mergedContent
            : updatedContent;

        if (effectiveContent !== updatedContent && previousOriginalXlsxBytes) {
          try {
            const mergedWorkbook = SpreadsheetEngine.Instance.ParseWorkbook(effectiveContent);
            const mergedBytes = XlsxOpenXmlAdapter.Instance.PatchXlsxBytes(previousOriginalXlsxBytes, mergedWorkbook);
            targetEntry.originalXlsxBytes = mergedBytes;
            xlsxBase64 = Buffer.from(mergedBytes).toString('base64');
          } catch (repatchErr) {
            LogError(
              `ArtifactToolManager: failed re-patching xlsx bytes after live merge for artifact '${targetEntry.artifactId}': ${
                repatchErr instanceof Error ? repatchErr.message : String(repatchErr)
              }`,
            );
          }
        }

        // 2. Update in-memory entry.content so sequential tool calls see the reconciled content & revisionHash
        targetEntry.content = effectiveContent;

        // 3. Persist a single MJ: Artifact Versions record per agent run when artifactId, contextUser, and provider are available
        let persisted = false;
        let commitWarning: string | null = null;
        if (targetEntry.artifactId && this.contextUser && this.provider) {
          const persistOutcome = await this.persistArtifactVersionMutation(
            targetEntry,
            effectiveContent,
            xlsxBase64,
            call.tool,
            previousContentStr,
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
          if (hookResult && typeof hookResult === 'object') {
            try {
              const commitOutcome = await hookResult.commit?.({
                versionId: targetEntry.versionId,
                versionNumber: targetEntry.versionNumber,
              });
              if (commitOutcome && typeof commitOutcome === 'object') {
                const preCommitRollback = hookResult.rollback;
                hookResult = commitOutcome;
                if (commitOutcome.applied === false) {
                  const warnMsg = `Deferred mutation was not applied to active room for artifact '${targetEntry.artifactId}'`;
                  LogError(`ArtifactToolManager: ${warnMsg}`);
                  commitWarning = warnMsg;
                  const rolledBackVersionId = persistOutcome.versionEntity?.ID ?? undefined;
                  let shouldRollbackRoom = true;
                  if (persistOutcome.versionEntity && persistOutcome.rollbackSnapshot) {
                    shouldRollbackRoom = await this.rollbackPersistedArtifactVersionMutation(
                      targetEntry,
                      persistOutcome.versionEntity,
                      persistOutcome.rollbackSnapshot,
                      { previousContentStr }
                    );
                  }
                  const rollbackToRun = commitOutcome.rollback ?? preCommitRollback;
                  if (shouldRollbackRoom && rollbackToRun) {
                    try {
                      await rollbackToRun(rolledBackVersionId);
                    } catch (rbErr) {
                      LogError(
                        `ArtifactToolManager: exception in hookResult.rollback for artifact '${targetEntry.artifactId}': ${
                          rbErr instanceof Error ? rbErr.message : String(rbErr)
                        }`,
                      );
                    }
                  }
                  targetEntry.content = previousContent;
                  if (previousOriginalXlsxBytes) {
                    targetEntry.originalXlsxBytes = previousOriginalXlsxBytes;
                  }
                  const failedStored: StoredToolResult = {
                    artifactId: call.artifactId,
                    tool: call.tool,
                    input: call.input,
                    result: {
                      success: false,
                      data: null,
                      errorMessage: warnMsg,
                    },
                    timestamp: new Date(),
                    durationMs: Date.now() - startedAt,
                  };
                  this.toolResults.push(failedStored);
                  return failedStored;
                }
                if (typeof commitOutcome.mergedContent === 'string' && commitOutcome.mergedContent !== effectiveContent) {
                  effectiveContent = commitOutcome.mergedContent;
                  targetEntry.content = effectiveContent;
                  if (previousOriginalXlsxBytes) {
                    try {
                      const mergedWorkbook = SpreadsheetEngine.Instance.ParseWorkbook(effectiveContent);
                      const mergedBytes = XlsxOpenXmlAdapter.Instance.PatchXlsxBytes(previousOriginalXlsxBytes, mergedWorkbook);
                      targetEntry.originalXlsxBytes = mergedBytes;
                      xlsxBase64 = Buffer.from(mergedBytes).toString('base64');
                    } catch (repatchErr) {
                      LogError(
                        `ArtifactToolManager: failed re-patching xlsx bytes after live merge for artifact '${targetEntry.artifactId}': ${
                          repatchErr instanceof Error ? repatchErr.message : String(repatchErr)
                        }`,
                      );
                    }
                  }
                  const rePersistOutcome = await this.persistArtifactVersionMutation(
                    targetEntry,
                    effectiveContent,
                    xlsxBase64,
                    call.tool,
                    previousContentStr,
                  );
                  if (!rePersistOutcome.persisted) {
                    const failMsg = rePersistOutcome.errorMessage ?? 'Failed to persist merged artifact version after concurrent edit reconciliation';
                    LogError(`ArtifactToolManager: ${failMsg}`);
                    const failedStored: StoredToolResult = {
                      artifactId: call.artifactId,
                      tool: call.tool,
                      input: call.input,
                      result: {
                        success: false,
                        data: null,
                        errorMessage: failMsg,
                      },
                      timestamp: new Date(),
                      durationMs: Date.now() - startedAt,
                    };
                    this.toolResults.push(failedStored);
                    return failedStored;
                  }
                  if (rePersistOutcome.supersededFileId) {
                    await this.deleteUnreferencedArtifactFile(rePersistOutcome.supersededFileId);
                  }
                }
              }
            } catch (commitErr) {
              const errMsg = `ArtifactToolManager: commit hook failed for artifact '${targetEntry.artifactId}': ${
                commitErr instanceof Error ? commitErr.message : String(commitErr)
              }`;
              LogError(errMsg);
              const rolledBackVersionId = persistOutcome.versionEntity?.ID ?? undefined;
              let shouldRollbackRoom = true;
              if (persistOutcome.versionEntity && persistOutcome.rollbackSnapshot) {
                shouldRollbackRoom = await this.rollbackPersistedArtifactVersionMutation(
                  targetEntry,
                  persistOutcome.versionEntity,
                  persistOutcome.rollbackSnapshot,
                  { previousContentStr }
                );
              }
              if (shouldRollbackRoom && hookResult && typeof hookResult === 'object' && hookResult.rollback) {
                try {
                  await hookResult.rollback(rolledBackVersionId);
                } catch (rbErr) {
                  LogError(
                    `ArtifactToolManager: exception in hookResult.rollback for artifact '${targetEntry.artifactId}': ${
                      rbErr instanceof Error ? rbErr.message : String(rbErr)
                    }`,
                  );
                }
              }
              targetEntry.content = previousContent;
              if (previousOriginalXlsxBytes) {
                targetEntry.originalXlsxBytes = previousOriginalXlsxBytes;
              }
              const failedStored: StoredToolResult = {
                artifactId: call.artifactId,
                tool: call.tool,
                input: call.input,
                result: {
                  success: false,
                  data: null,
                  errorMessage: errMsg,
                },
                timestamp: new Date(),
                durationMs: Date.now() - startedAt,
              };
              this.toolResults.push(failedStored);
              return failedStored;
            }
          }
          if (persistOutcome.supersededFileId) {
            await this.deleteUnreferencedArtifactFile(persistOutcome.supersededFileId);
          }
        }

        // 3b. For File-mode artifacts (where storage upload succeeded first), invoke hook after persist and reconcile if needed
        if (hook && targetEntry.artifactId && !hookInvokedBeforePersist) {
          try {
            hookResult = await hook({
              artifactId: targetEntry.artifactId,
              alphaId: targetEntry.alphaId,
              versionId: targetEntry.versionId,
              versionNumber: targetEntry.versionNumber,
              previousContent: previousContentStr,
              updatedContent: effectiveContent,
              xlsxBase64,
              tool: call.tool,
              contextUser: this.contextUser,
              agentRunId: activeAgentRunId,
              agentName: activeAgentName,
            });
            if (
              hookResult &&
              typeof hookResult === 'object' &&
              typeof hookResult.mergedContent === 'string' &&
              hookResult.mergedContent !== effectiveContent
            ) {
              effectiveContent = hookResult.mergedContent;
              targetEntry.content = effectiveContent;
              if (this.contextUser && this.provider) {
                const rePersistOutcome = await this.persistArtifactVersionMutation(
                  targetEntry,
                  effectiveContent,
                  xlsxBase64,
                  call.tool,
                  previousContentStr,
                );
                if (!rePersistOutcome.persisted) {
                  const failMsg = rePersistOutcome.errorMessage ?? 'Failed to persist merged artifact version after concurrent edit reconciliation';
                  LogError(`ArtifactToolManager: ${failMsg}`);
                  const failedStored: StoredToolResult = {
                    artifactId: call.artifactId,
                    tool: call.tool,
                    input: call.input,
                    result: {
                      success: false,
                      data: null,
                      errorMessage: failMsg,
                    },
                    timestamp: new Date(),
                    durationMs: Date.now() - startedAt,
                  };
                  this.toolResults.push(failedStored);
                  return failedStored;
                }
                if (rePersistOutcome.supersededFileId) {
                  await this.deleteUnreferencedArtifactFile(rePersistOutcome.supersededFileId);
                }
              }
            }
          } catch (hookErr) {
            LogError(
              `ArtifactToolManager: live mutation hook failed for artifact '${targetEntry.artifactId}': ${
                hookErr instanceof Error ? hookErr.message : String(hookErr)
              }`,
            );
          }
        }

        const alreadyAppliedToRoom = Boolean(hookResult && typeof hookResult === 'object');
        if (targetEntry.artifactId && this.contextUser) {
          try {
            MJGlobal.Instance.RaiseEvent({
              component: this,
              event: MJEventType.ComponentEvent,
              eventCode: ARTIFACT_LIVE_MUTATION_EVENT_CODE,
              args: {
                ArtifactID: targetEntry.artifactId,
                NewContent: effectiveContent,
                PreviousContent: previousContent,
                ToolName: call.tool,
                User: this.contextUser,
                SaveVersion: false,
                ...(alreadyAppliedToRoom ? { AlreadyAppliedToRoom: true } : {}),
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
        if (commitWarning) {
          const existingWarnings = Array.isArray(sanitizedData.warnings)
            ? sanitizedData.warnings.filter((w): w is string => typeof w === 'string')
            : [];
          sanitizedData.warnings = [...existingWarnings, commitWarning];
        }
        if (
          effectiveContent !== updatedContent &&
          'revisionHash' in sanitizedData
        ) {
          const recomputed = targetEntry.library.ComputeRevisionHash?.(effectiveContent);
          if (typeof recomputed === 'string') {
            sanitizedData.revisionHash = recomputed;
          }
        }
        const rejectedCount =
          hookResult && typeof hookResult === 'object'
            ? (hookResult.rejectedHunksCount ?? hookResult.rejectedAgentHunks?.length ?? 0)
            : 0;
        if (rejectedCount > 0) {
          const rejectedLinesPreview: string[] = [];
          if (hookResult && typeof hookResult === 'object' && Array.isArray(hookResult.rejectedAgentHunks)) {
            for (const hunk of hookResult.rejectedAgentHunks) {
              if (Array.isArray(hunk.RejectedAgentLines)) {
                for (const line of hunk.RejectedAgentLines) {
                  const trimmed = line.trim();
                  if (trimmed.length > 0 && rejectedLinesPreview.length < 3) {
                    rejectedLinesPreview.push(trimmed);
                  }
                }
              }
              if (rejectedLinesPreview.length >= 3) {
                break;
              }
            }
          }
          const previewSuffix =
            rejectedLinesPreview.length > 0
              ? ` (rejected: ${rejectedLinesPreview.map((l) => `"${l}"`).join(', ')})`
              : '';
          const conflictWarning = `${rejectedCount} edit${rejectedCount === 1 ? '' : 's'} not applied because of concurrent edits${previewSuffix}`;
          sanitizedData.rejectedEditsCount = rejectedCount;
          sanitizedData.conflictWarning = conflictWarning;
          if (rejectedLinesPreview.length > 0) {
            sanitizedData.rejectedLinesPreview = rejectedLinesPreview;
          }
          const existingWarnings = Array.isArray(sanitizedData.warnings)
            ? sanitizedData.warnings.filter((w): w is string => typeof w === 'string')
            : [];
          sanitizedData.warnings = [...existingWarnings, conflictWarning];
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
      if (!latestRes.Success) {
        return `Failed to verify artifact concurrency before mutation: ${latestRes.ErrorMessage || 'RunView failed'}`;
      }
      if (!latestRes.Results?.length) {
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
        return `Artifact was modified concurrently (v${latestRow.VersionNumber} > v${expectedVersion}); call reload_artifact before mutating`;
      }
    } catch (err) {
      if (this.provider) {
        const runViewProvider: Partial<IRunViewProvider> = this.provider;
        if (runViewProvider.RunView) {
          return `Failed to verify artifact concurrency before mutation: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    }
    return null;
  }

  /**
   * Downloads binary content for a file-backed artifact version (`FileID`) from `FileStorageEngine`
   * using the same `MJ: Files` -> `ResolveFileObject` -> `Driver.GetObject` pipeline as `AgentRunner.DownloadArtifactFileContent`.
   */
  private async downloadArtifactFileContent(fileId: string): Promise<Buffer | null> {
    if (!this.contextUser || !this.provider) {
      return null;
    }
    const trimmedFileId = (fileId ?? '').trim();
    if (!IsValidUUID(trimmedFileId)) {
      LogError(`ArtifactToolManager: refusing to read artifact file content — '${fileId}' is not a valid UUID`);
      return null;
    }
    try {
      await FileStorageEngine.Instance.Config(false, this.contextUser, this.provider);
      const rv = RunView.FromMetadataProvider(this.provider);
      const fileResult = await rv.RunView<{
        ID: string;
        Name: string;
        ContentType: string;
        ProviderID: string;
        ProviderKey: string;
      }>(
        {
          EntityName: 'MJ: Files',
          ExtraFilter: `ID = '${EscapeSQLString(trimmedFileId)}'`,
          Fields: ['ID', 'Name', 'ContentType', 'ProviderID', 'ProviderKey'],
          ResultType: 'simple',
        },
        this.contextUser,
      );
      if (!fileResult.Success || !fileResult.Results?.length) {
        LogError(`ArtifactToolManager: file not found in MJ: Files for FileID '${trimmedFileId}'`);
        return null;
      }
      const resolved = await FileStorageEngine.Instance.ResolveFileObject(
        fileResult.Results[0],
        this.contextUser,
        'Read',
        this.provider,
      );
      if (!resolved) {
        LogError(
          `ArtifactToolManager: no FileStorageAccount resolved for ProviderID '${fileResult.Results[0].ProviderID}'`,
        );
        return null;
      }
      const rawContent: Buffer | Uint8Array | string = await resolved.Driver.GetObject({ fullPath: resolved.ObjectKey });
      if (Buffer.isBuffer(rawContent)) {
        return rawContent;
      }
      if (rawContent instanceof Uint8Array) {
        return Buffer.from(rawContent);
      }
      if (typeof rawContent === 'string') {
        return Buffer.from(rawContent);
      }
      return null;
    } catch (err) {
      LogError(
        `ArtifactToolManager: failed to download file content for FileID '${trimmedFileId}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Reloads the latest persisted `MJ: Artifact Versions` record from the database into the in-memory
   * session entry so an agent run can recover after a concurrent modification conflict (`Round 3 Item 9`, `E9`).
   * Re-downloads `FileID` binary bytes when set and fails closed without advancing baseline version numbers on error.
   */
  private async reloadArtifactFromDatabase(entry: ArtifactEntry): Promise<ArtifactToolResult> {
    if (!entry.artifactId || !this.contextUser || !this.provider) {
      return {
        success: false,
        data: null,
        errorMessage: 'Cannot reload artifact without artifactId, contextUser, and provider.',
      };
    }
    try {
      const rv = RunView.FromMetadataProvider(this.provider);
      const latestRes = await rv.RunView<{
        ID: string;
        VersionNumber: number;
        Name?: string | null;
        Content?: string | null;
        Configuration?: string | null;
        ContentMode?: 'File' | 'Text' | null;
        FileID?: string | null;
        MimeType?: string | null;
      }>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${EscapeSQLString(entry.artifactId)}'`,
          OrderBy: 'VersionNumber DESC',
          Fields: ['ID', 'VersionNumber', 'Name', 'Content', 'Configuration', 'ContentMode', 'FileID', 'MimeType'],
          MaxRows: 1,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        this.contextUser,
      );
      if (!latestRes.Success || !latestRes.Results?.length) {
        return {
          success: false,
          data: null,
          errorMessage: latestRes.ErrorMessage || `No persisted versions found for artifact '${entry.artifactId}'.`,
        };
      }
      const latest = latestRes.Results[0];
      const latestFileId = (latest.FileID ?? '').trim();

      let nextEntryContent: string | Buffer;
      let nextOriginalXlsxBytes: Uint8Array | undefined;

      if (latestFileId) {
        const downloadedBytes = await this.downloadArtifactFileContent(latestFileId);
        if (!downloadedBytes || downloadedBytes.byteLength === 0) {
          return {
            success: false,
            data: null,
            errorMessage: `Failed to download file content for FileID '${latestFileId}' while reloading artifact '${entry.artifactId}'.`,
          };
        }

        const isZipArchive =
          downloadedBytes.length > 4 && downloadedBytes[0] === 0x50 && downloadedBytes[1] === 0x4b;
        const effectiveMime = (latest.MimeType ?? entry.mimeType ?? '').toLowerCase();
        const libClassName = entry.library.constructor.name;
        const isBinaryLibrary =
          libClassName === 'DocxToolLibrary' ||
          libClassName === 'PDFToolLibrary' ||
          libClassName === 'ExcelToolLibrary' ||
          libClassName === 'GenericBinaryToolLibrary';

        if (libClassName === 'SpreadsheetToolLibrary' && isZipArchive) {
          nextOriginalXlsxBytes = new Uint8Array(downloadedBytes);
          const importedWorkbook = SpreadsheetEngine.Instance.ImportFromXlsxBytes(
            nextOriginalXlsxBytes,
            latest.Configuration ?? undefined,
          );
          SpreadsheetEngine.Instance.EvaluateWorkbook(importedWorkbook);
          nextEntryContent = SpreadsheetEngine.Instance.SerializeWorkbook(importedWorkbook);
        } else if (isBinaryLibrary || Buffer.isBuffer(entry.content)) {
          if (isZipArchive && effectiveMime === XLSX_MIME_TYPE) {
            nextOriginalXlsxBytes = new Uint8Array(downloadedBytes);
          }
          nextEntryContent = downloadedBytes;
        } else {
          if (isZipArchive && effectiveMime === XLSX_MIME_TYPE) {
            nextOriginalXlsxBytes = new Uint8Array(downloadedBytes);
            const importedWorkbook = SpreadsheetEngine.Instance.ImportFromXlsxBytes(
              nextOriginalXlsxBytes,
              latest.Configuration ?? undefined,
            );
            SpreadsheetEngine.Instance.EvaluateWorkbook(importedWorkbook);
            nextEntryContent = SpreadsheetEngine.Instance.SerializeWorkbook(importedWorkbook);
          } else {
            nextEntryContent = downloadedBytes.toString('utf-8');
          }
        }
      } else {
        if (latest.ContentMode === 'File') {
          return {
            success: false,
            data: null,
            errorMessage: `Latest version v${latest.VersionNumber} of artifact '${entry.artifactId}' has ContentMode='File' without a FileID.`,
          };
        }
        const textCandidate = latest.Content ?? latest.Configuration;
        if (typeof textCandidate !== 'string') {
          return {
            success: false,
            data: null,
            errorMessage: `Latest version v${latest.VersionNumber} of artifact '${entry.artifactId}' has no loadable content.`,
          };
        }
        nextEntryContent = textCandidate;
        nextOriginalXlsxBytes = undefined;
      }

      // Commit reloaded state only after storage download & parsing succeeded
      entry.versionId = latest.ID;
      entry.versionNumber = latest.VersionNumber;
      entry.baseVersionNumber = latest.VersionNumber;
      entry.currentVersionNumber = latest.VersionNumber;
      entry.agentRunVersionId = undefined;
      entry.agentRunVersionEntity = undefined;
      if (latest.Name) {
        entry.name = latest.Name;
      }
      if (latest.MimeType) {
        entry.mimeType = latest.MimeType;
      }
      if (latest.ContentMode === 'File' || latest.ContentMode === 'Text') {
        entry.contentMode = latest.ContentMode;
      } else if (latestFileId) {
        entry.contentMode = 'File';
      }
      entry.originalXlsxBytes = nextOriginalXlsxBytes;
      entry.content = nextEntryContent;

      return {
        success: true,
        data: {
          artifactId: entry.artifactId,
          alphaId: entry.alphaId,
          versionId: latest.ID,
          versionNumber: latest.VersionNumber,
          reloaded: true,
        },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        errorMessage: `Failed to reload artifact '${entry.artifactId}': ${err instanceof Error ? err.message : String(err)}`,
      };
    }
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
    previousContentStr?: string,
  ): Promise<PersistMutationOutcome> {
    if (!entry.artifactId || !this.contextUser || !this.provider) {
      return { persisted: false };
    }

    const conflictBeforeSave = await this.checkConcurrentDatabaseModification(entry);
    if (conflictBeforeSave) {
      LogError(`ArtifactToolManager: concurrent modification detected before save for artifact '${entry.artifactId}': ${conflictBeforeSave}`);
      return { persisted: false, errorMessage: conflictBeforeSave };
    }

    const contentHash = createHash('sha256').update(updatedContent, 'utf8').digest('hex');
    const isFileMode = entry.contentMode === 'File';

    // Ensure .xlsx bytes exist when operating on a File-mode spreadsheet
    let effectiveXlsxBase64 = xlsxBase64;
    if (!effectiveXlsxBase64 && isFileMode) {
      if (!entry.originalXlsxBytes) {
        return {
          persisted: false,
          errorMessage:
            'Failed to upload updated .xlsx binary to FileStorageEngine for File-mode artifact; refusing to downgrade ContentMode to Text',
        };
      }
      try {
        const workbook = SpreadsheetEngine.Instance.ParseWorkbook(updatedContent);
        const bytes = XlsxOpenXmlAdapter.Instance.PatchXlsxBytes(entry.originalXlsxBytes, workbook);
        entry.originalXlsxBytes = bytes;
        effectiveXlsxBase64 = Buffer.from(bytes).toString('base64');
      } catch (err) {
        return {
          persisted: false,
          errorMessage: `Failed to patch .xlsx binary for File-mode artifact: ${err instanceof Error ? err.message : String(err)}`,
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
      const previousReusedFileId = isReuse && versionEntity ? versionEntity.FileID : null;
      const targetVersionNumber = isReuse
        ? (entry.currentVersionNumber ?? entry.versionNumber ?? 1)
        : (entry.currentVersionNumber ?? entry.versionNumber ?? 0) + 1;

      const rollbackSnapshot: PersistVersionRollbackSnapshot = {
        hadExistingAgentRunVersion: isReuse,
        entryVersionId: entry.versionId,
        entryVersionNumber: entry.versionNumber,
        entryCurrentVersionNumber: entry.currentVersionNumber,
        entryAgentRunVersionId: entry.agentRunVersionId,
        entryAgentRunVersionEntity: entry.agentRunVersionEntity,
        entryContentMode: entry.contentMode,
        entryContent: entry.content,
        entryConfiguration: entry.configuration,
        entryName: entry.name,
        entryDescription: entry.description,
        entryComments: entry.comments,
        entryDirty: entry.dirty,
        entityName: versionEntity ? versionEntity.Name : null,
        entityComments: versionEntity ? versionEntity.Comments : null,
        entityContent: versionEntity ? versionEntity.Content : null,
        entityConfiguration: versionEntity ? versionEntity.Configuration : null,
        entityContentHash: versionEntity ? versionEntity.ContentHash : null,
        entityContentSizeBytes: versionEntity ? versionEntity.ContentSizeBytes : null,
        entityContentMode: versionEntity ? versionEntity.ContentMode : null,
        entityFileID: versionEntity ? versionEntity.FileID : null,
        entityMimeType: versionEntity ? versionEntity.MimeType : null,
        entityFileName: versionEntity ? versionEntity.FileName : null,
      };

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

      versionEntity.Name = entry.name;
      const runNote = activeAgentRunId ? ` (agentRunId: ${activeAgentRunId})` : '';
      versionEntity.Comments = activeAgentName
        ? `Edited by ${activeAgentName} via '${toolName}'${runNote}`
        : `Updated via agent tool '${toolName}'${runNote}`;
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

        const supersededFileId =
          previousReusedFileId && uploadedFileId && !UUIDsEqual(previousReusedFileId, uploadedFileId)
            ? previousReusedFileId
            : null;

        return {
          persisted: true,
          versionEntity,
          supersededFileId,
          rollbackSnapshot,
        };
      }

      // If Save() returned false, check whether a concurrent human version was saved in the meantime
      const postSaveConflict = await this.checkConcurrentDatabaseModification(entry);
      if (postSaveConflict) {
        LogError(`ArtifactToolManager: concurrent modification detected after save for artifact '${entry.artifactId}': ${postSaveConflict}`);
        return { persisted: false, errorMessage: postSaveConflict };
      }
      const saveErrMsg = `Failed to save MJ: Artifact Versions record for '${entry.artifactId}'`;
      LogError(`ArtifactToolManager: ${saveErrMsg}`);
      return { persisted: false, errorMessage: saveErrMsg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(`ArtifactToolManager: failed to persist version for artifact '${entry.artifactId}': ${msg}`);
      return { persisted: false, errorMessage: msg };
    }
  }

  /**
   * Rolls back a persisted version record and reverts manager entry state when a deferred commit fails.
   */
  private async rollbackPersistedArtifactVersionMutation(
    entry: ArtifactEntry,
    entityOrOutcome: MJArtifactVersionEntity | PersistMutationOutcome,
    snapshotOrPreviousContent?: PersistVersionRollbackSnapshot | string,
    options?: { previousContentStr?: string },
  ): Promise<boolean> {
    let versionEntity: MJArtifactVersionEntity | undefined;
    let snapshot: PersistVersionRollbackSnapshot | undefined;
    let previousContentStr: string | undefined;

    if (entityOrOutcome && 'persisted' in entityOrOutcome) {
      versionEntity = entityOrOutcome.versionEntity;
      snapshot = entityOrOutcome.rollbackSnapshot;
      previousContentStr = typeof snapshotOrPreviousContent === 'string' ? snapshotOrPreviousContent : undefined;
    } else {
      versionEntity = entityOrOutcome as MJArtifactVersionEntity;
      snapshot = snapshotOrPreviousContent as PersistVersionRollbackSnapshot;
      previousContentStr = options?.previousContentStr;
    }

    if (!snapshot) {
      return false;
    }

    entry.versionId = snapshot.entryVersionId;
    entry.versionNumber = snapshot.entryVersionNumber;
    entry.currentVersionNumber = snapshot.entryCurrentVersionNumber;
    entry.agentRunVersionId = snapshot.entryAgentRunVersionId;
    entry.agentRunVersionEntity = snapshot.entryAgentRunVersionEntity;
    entry.contentMode = snapshot.entryContentMode;
    if (snapshot.entryContent !== undefined) {
      entry.content = snapshot.entryContent;
    }
    if (snapshot.entryConfiguration !== undefined) {
      entry.configuration = snapshot.entryConfiguration;
    }
    if (snapshot.entryName !== undefined) {
      entry.name = snapshot.entryName;
    }
    if (snapshot.entryDescription !== undefined) {
      entry.description = snapshot.entryDescription;
    }
    if (snapshot.entryComments !== undefined) {
      entry.comments = snapshot.entryComments;
    }
    if (snapshot.entryDirty !== undefined) {
      entry.dirty = snapshot.entryDirty;
    }

    if (!versionEntity) {
      return false;
    }

    const newerVersionExists = await this.hasNewerArtifactVersion(entry, versionEntity);
    // The rollback undoes this call's own write, so it runs as the system user: the agent's user may have
    // lost Edit or Delete during the call (`R15-2`), and the write is scoped to the one row we created or
    // reused. It never touches any other version.
    const rollbackEntity = await this.loadVersionForRollback(versionEntity);

    if (snapshot.hadExistingAgentRunVersion) {
      // A reused agent-run row held this run's earlier content before the failed call overwrote it. Put
      // it back even when a newer version exists: that newer version is a separate row, and leaving the
      // reused row changed would keep an edit the agent was told failed (`R15-4`).
      await this.revertReusedAgentRunVersion(entry, rollbackEntity, snapshot);
      return !newerVersionExists;
    }

    if (newerVersionExists) {
      // Someone saved or restored after the agent's version. Keep it as history and leave the room where
      // that newer version put it.
      return false;
    }

    await this.deleteOrRevertNewAgentVersion(entry, rollbackEntity, previousContentStr ?? '');
    return true;
  }

  /** True when the artifact has a version numbered above `versionEntity` (someone saved after the agent). */
  private async hasNewerArtifactVersion(entry: ArtifactEntry, versionEntity: MJArtifactVersionEntity): Promise<boolean> {
    if (!this.provider || !entry.artifactId || versionEntity.VersionNumber == null) {
      return false;
    }
    try {
      const rv = RunView.FromMetadataProvider(this.provider);
      const newerCheck = await rv.RunView<{ ID: string; VersionNumber: number }>(
        {
          EntityName: 'MJ: Artifact Versions',
          Fields: ['ID', 'VersionNumber'],
          ExtraFilter: `ArtifactID = '${EscapeSQLString(entry.artifactId)}' AND VersionNumber > ${versionEntity.VersionNumber}`,
          OrderBy: 'VersionNumber DESC',
          MaxRows: 1,
          ResultType: 'simple',
        },
        this.contextUser,
      );
      if (!newerCheck.Success) {
        LogError(
          `ArtifactToolManager: could not check for versions newer than '${versionEntity.ID}' before rollback: ${newerCheck.ErrorMessage}`,
        );
        return false;
      }
      return (newerCheck.Results?.[0]?.VersionNumber ?? 0) > (versionEntity.VersionNumber ?? 0);
    } catch (err) {
      LogError(
        `ArtifactToolManager: exception checking for newer versions before rollback of '${versionEntity.ID}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  /**
   * The version row to undo, loaded as the server system user so the undo is not refused by the agent
   * user's (possibly revoked) Edit/Delete rights. Falls back to the caller's own entity, with a log, when
   * no provider or system user is available or the load fails.
   */
  private async loadVersionForRollback(versionEntity: MJArtifactVersionEntity): Promise<MJArtifactVersionEntity> {
    const systemUser = UserCache.Instance.GetSystemUser();
    if (!this.provider || !systemUser || !versionEntity.ID) {
      return versionEntity;
    }
    try {
      const systemEntity = await this.provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', systemUser);
      if (await systemEntity.Load(versionEntity.ID)) {
        return systemEntity;
      }
      LogError(
        `ArtifactToolManager: could not load version '${versionEntity.ID}' as the system user for rollback: ${
          systemEntity.LatestResult?.CompleteMessage ?? 'not found'
        }`,
      );
    } catch (err) {
      LogError(
        `ArtifactToolManager: exception loading version '${versionEntity.ID}' as the system user for rollback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return versionEntity;
  }

  /** Deletes the version row this call created; if that fails, puts the previous content back into it. */
  private async deleteOrRevertNewAgentVersion(
    entry: ArtifactEntry,
    versionEntity: MJArtifactVersionEntity,
    previousContent: string,
  ): Promise<void> {
    const uploadedFileId = versionEntity.FileID;
    let deleted = false;
    try {
      deleted = await versionEntity.Delete();
      if (!deleted) {
        LogError(
          `ArtifactToolManager: failed to delete rolled-back version '${versionEntity.ID}' for artifact '${entry.artifactId}' (${
            versionEntity.LatestResult?.CompleteMessage ?? 'unknown error'
          }); restoring previous content instead`,
        );
      }
    } catch (delErr) {
      LogError(
        `ArtifactToolManager: exception deleting rolled-back version '${versionEntity.ID}' for artifact '${entry.artifactId}': ${
          delErr instanceof Error ? delErr.message : String(delErr)
        }`,
      );
    }

    if (!deleted) {
      versionEntity.Content = previousContent;
      versionEntity.ContentHash = createHash('sha256').update(previousContent, 'utf8').digest('hex');
      versionEntity.ContentSizeBytes = Buffer.byteLength(previousContent, 'utf8');
      await this.saveRollbackEntity(entry, versionEntity, 'restore previous content on');
    }

    if (uploadedFileId) {
      await this.deleteUnreferencedArtifactFile(uploadedFileId);
    }
  }

  /** Puts a reused agent-run version row back to the field values it had before this call. */
  private async revertReusedAgentRunVersion(
    entry: ArtifactEntry,
    versionEntity: MJArtifactVersionEntity,
    snapshot: PersistVersionRollbackSnapshot,
  ): Promise<void> {
    const failedUploadFileId = versionEntity.FileID;
    versionEntity.Name = snapshot.entityName ?? '';
    versionEntity.Comments = snapshot.entityComments ?? null;
    versionEntity.Content = snapshot.entityContent ?? null;
    versionEntity.Configuration = snapshot.entityConfiguration ?? null;
    versionEntity.ContentHash = snapshot.entityContentHash ?? null;
    versionEntity.ContentSizeBytes = snapshot.entityContentSizeBytes ?? null;
    versionEntity.ContentMode = snapshot.entityContentMode ?? 'Text';
    versionEntity.FileID = snapshot.entityFileID ?? null;
    versionEntity.MimeType = snapshot.entityMimeType ?? null;
    versionEntity.FileName = snapshot.entityFileName ?? null;

    const reverted = await this.saveRollbackEntity(entry, versionEntity, 'revert reused');
    if (reverted && failedUploadFileId && !UUIDsEqual(failedUploadFileId, snapshot.entityFileID)) {
      await this.deleteUnreferencedArtifactFile(failedUploadFileId);
    }
  }

  /** Saves a rollback write and logs any failure; returns whether it saved. */
  private async saveRollbackEntity(
    entry: ArtifactEntry,
    versionEntity: MJArtifactVersionEntity,
    action: string,
  ): Promise<boolean> {
    try {
      const saved = await versionEntity.Save();
      if (!saved) {
        LogError(
          `ArtifactToolManager: failed to ${action} version '${versionEntity.ID}' for artifact '${entry.artifactId}' during rollback: ${
            versionEntity.LatestResult?.CompleteMessage ?? 'unknown error'
          }`,
        );
      }
      return saved;
    } catch (err) {
      LogError(
        `ArtifactToolManager: exception trying to ${action} version '${versionEntity.ID}' for artifact '${entry.artifactId}' during rollback: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  /**
   * Safely deletes an unreferenced file record from storage after verifying no MJ: Artifact Versions reference it.
   */
  private async deleteUnreferencedArtifactFile(fileId: string): Promise<void> {
    if (!this.provider || !this.contextUser) {
      return;
    }
    const trimmedFileId = (fileId ?? '').trim();
    if (!IsValidUUID(trimmedFileId)) {
      LogError(`ArtifactToolManager: refusing to delete artifact file — '${fileId}' is not a valid UUID`);
      return;
    }
    try {
      const rv = RunView.FromMetadataProvider(this.provider);
      const refParams = {
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `FileID = '${EscapeSQLString(trimmedFileId)}'`,
        Fields: ['ID'],
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'simple' as const,
      };
      const refRes = await rv.RunView<{ ID: string }>(refParams, this.contextUser);
      if (!refRes.Success) {
        LogError(
          `ArtifactToolManager: failed checking MJ: Artifact Versions references before deleting FileID '${trimmedFileId}': ${
            refRes.ErrorMessage || 'RunView failed'
          }`,
        );
        return;
      }
      if ((refRes.Results?.length ?? 0) > 0) {
        return;
      }

      const oldFile = await this.provider.GetEntityObject<MJFileEntity>('MJ: Files', this.contextUser);
      if (await oldFile.Load(trimmedFileId)) {
        const deleted = await oldFile.Delete();
        if (!deleted) {
          LogError(
            `ArtifactToolManager: failed to delete superseded MJ: Files record '${trimmedFileId}': ${
              oldFile.LatestResult?.CompleteMessage || 'Delete() returned false'
            }`,
          );
        }
      }
    } catch (err) {
      LogError(
        `ArtifactToolManager: exception deleting superseded MJ: Files record '${trimmedFileId}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
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
        artifactId: a.artifactId,
        versionNumber: a.versionNumber,
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
