import { createHash } from 'node:crypto';
import { CleanAndParseJSON, EscapeSQLString, GetGlobalObjectStore, IndexByUUID, IsValidUUID, MJEventType, MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { CompositeKey, IMetadataProvider, IRunViewProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import type { ActionOutputTrustLevel } from '@memberjunction/actions-base';
import {
  ArtifactMetadataEngine,
  ArtifactPermissionEngine,
  ArtifactSynthesisEngine,
  ArtifactSynthesisSourceDigest,
  ArtifactSynthesisSourceInput,
  BuildArtifactVersionConfigurationWithPreview,
  MJArtifactVersionEntity,
  MJFileEntity,
  SpreadsheetEngine,
  XlsxOpenXmlAdapter,
} from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import { UserCache } from '@memberjunction/generic-database-provider';
import { AIEngine } from '@memberjunction/aiengine';
import { AIRerankerRunner } from '@memberjunction/ai-reranker';
import {
  ArtifactJsonValue,
  ArtifactToolArgs,
  ArtifactToolExecutionContext,
  ArtifactToolResult,
  BaseArtifactToolLibrary,
  GovernedRunArtifactSummary,
  InputArtifact,
  JsonSchemaSubset,
  NativeFileInput,
  ValidateJsonAgainstSchemaSubset,
} from '@memberjunction/ai-core-plus';
import {
  ARTIFACT_LIVE_MUTATION_EVENT_CODE,
  ArtifactLiveMutationEvent,
  ArtifactLiveMutationHook,
  ArtifactLiveMutationHookResult,
  ExtractAgentTargetLocation,
  FormatAgentActionSummary,
  GetArtifactLiveContentReaderHook,
  GetArtifactLiveMutationHook,
  MUTATING_ARTIFACT_TOOL_NAMES,
  ResolvePresenceDomain,
  SetArtifactLiveMutationHook,
} from './artifact-presence-locator';
import { DecodeBinaryArtifactContent } from './artifact-tools/artifact-tool-helpers';
import { GetPdfJsModule } from './artifact-tools/PDFToolLibrary';
import {
  type ArtifactMutationOperation,
  ArtifactToolLibraryWithRevisionHash,
  BuildMergedFileVersionConfiguration,
  FormatFileModeStructuralToolError,
  GovernedArtifactService,
  MergeTouchedArtifactSummary,
  STRUCTURAL_SPREADSHEET_TOOLS,
} from './GovernedArtifactService';

// Re-export within @memberjunction/ai-agents so existing callers continue to resolve
// InputArtifact and live-mutation hooks from ArtifactToolManager.
export type { InputArtifact, ArtifactLiveMutationEvent, ArtifactLiveMutationHookResult, ArtifactLiveMutationHook };
export { SetArtifactLiveMutationHook, GetArtifactLiveMutationHook };

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GLOBAL_KEY_TRUSTED_AGENT_DRAFT = '__MJ_TRUSTED_AGENT_DRAFT_VERSION_ENTITIES__';
const MAX_INITIAL_OPERATIONS = 100;

/**
 * Active external-data taint metadata reported by the owning agent run so newly created or
 * synthesized workspace artifacts inherit the run's trust boundary.
 */
export interface ActiveRunTaint {
  TrustLevel: Exclude<ActionOutputTrustLevel, 'Trusted'>;
  SourceName: string;
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
  /** Whether always-on artifact workspace tools are exposed even when no artifacts are attached yet. */
  workspaceEnabled?: boolean;
  /** Returns the owning run's active external-data taint boundary, if any. */
  getRunTaint?: () => ActiveRunTaint | undefined;
  /** Out-of-band server flag confirming the human user acknowledged the RLS/FLS snapshot freeze warning (`B7`). */
  allowFreezeFromUserConfirmation?: boolean;
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
  input: ArtifactToolArgs;
}

interface ArtifactEntry {
  alphaId: string;
  name: string;
  typeName: string;
  driverClass?: string;
  toolLibraryClass?: string;
  artifactId?: string;
  ownerUserId?: string;
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
  trustLevel?: ActionOutputTrustLevel;
  sourceName?: string;
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
  uploadedFileId?: string | null;
  supersededFileId?: string | null;
  rollbackSnapshot?: PersistVersionRollbackSnapshot;
}

export interface StoredToolResult {
  artifactId: string;
  tool: string;
  input: ArtifactToolArgs;
  result: ArtifactToolResult;
  /** When the invocation completed (UTC) */
  timestamp: Date;
  /** How long the invocation took, in milliseconds */
  durationMs: number;
  /** Output trust classification inherited from the underlying artifact, when set */
  trustLevel?: ActionOutputTrustLevel;
  /** Provenance label inherited from the underlying artifact (e.g. `'action:Web Search'`) */
  sourceName?: string;
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
  private nextAlphaIndex = 0;
  private contextUser?: UserInfo;
  private provider?: IMetadataProvider;
  private getAgentRun?: () => { ID?: string; Agent?: string | null } | null | undefined;
  private getRunTaint?: () => ActiveRunTaint | undefined;
  private agentRunId?: string;
  private agentName?: string;
  private workspaceEnabled = false;
  private allowFreezeFromUserConfirmation = false;
  private touchedArtifacts: Map<string, GovernedRunArtifactSummary> = new Map();
  private enteredPresenceArtifactIds: Set<string> = new Set();

  private static readonly MUTATING_TOOL_NAMES: ReadonlySet<string> = MUTATING_ARTIFACT_TOOL_NAMES;

  private static readonly STRUCTURAL_SPREADSHEET_TOOLS: ReadonlySet<string> = STRUCTURAL_SPREADSHEET_TOOLS;

  // ─── LIFECYCLE ───

  /** Sets or updates the agent run attribution context (`D5`). */
  SetAgentRunContext(agentRunId: string, agentName?: string): void {
    this.agentRunId = agentRunId;
    if (agentName !== undefined) {
      this.agentName = agentName;
    }
  }

  /** Sets or updates the run-level external-data taint provider for newly created artifacts. */
  SetRunTaintProvider(provider?: () => ActiveRunTaint | undefined): void {
    this.getRunTaint = provider;
  }

  /** Initialize with input artifacts, assigning alpha IDs and optional persistence context (`A4`) */
  Initialize(inputArtifacts: InputArtifact[], options?: ArtifactToolManagerOptions): void {
    this.Clear();
    this.contextUser = options?.contextUser;
    this.provider = options?.provider;
    this.getAgentRun = options?.getAgentRun;
    if (options?.getRunTaint !== undefined) {
      this.getRunTaint = options.getRunTaint;
    }
    this.agentRunId = options?.agentRunId;
    this.agentName = options?.agentName;
    this.workspaceEnabled = options?.workspaceEnabled ?? Boolean(options?.contextUser || inputArtifacts.length > 0);
    this.allowFreezeFromUserConfirmation = options?.allowFreezeFromUserConfirmation === true;
    for (const artifact of inputArtifacts) {
      this.RegisterArtifact(artifact);
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
    const typeEntity = ArtifactMetadataEngine.Instance.FindArtifactType(artifact.typeName);
    this.artifacts.set(alphaId, {
      alphaId,
      name: artifact.name,
      typeName: artifact.typeName,
      driverClass: typeEntity?.DriverClass ?? undefined,
      toolLibraryClass: artifact.toolLibraryClass ?? typeEntity?.ToolLibraryClass ?? undefined,
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
      trustLevel: artifact.trustLevel,
      sourceName: artifact.sourceName,
    });
    return alphaId;
  }

  private parseIdentifierRef(idOrAlpha: string | undefined | null) {
    if (typeof idOrAlpha !== 'string') return undefined;
    const trimmed = idOrAlpha.trim();
    if (!trimmed) return undefined;
    const normalizedAlpha = trimmed.replace(/^artifact\s+/i, '').trim().toUpperCase();
    return {
      trimmed,
      byAlpha: this.artifacts.get(normalizedAlpha),
      isUuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed),
    };
  }

  /**
   * Resolves a manifest alpha ID (e.g. `"A"`, `"B"`), an artifact UUID, or a version UUID
   * to the underlying `MJ: Artifacts` record UUID (`artifactId`).
   * Allows agents to reference either `"A"` or the full UUID in `artifactDirective.targetArtifactId`.
   */
  ResolveArtifactUuid(idOrAlpha: string | undefined | null): string | undefined {
    const parsed = this.parseIdentifierRef(idOrAlpha);
    if (!parsed) return undefined;

    // 1. Direct alpha ID lookup (case-insensitive, e.g. 'A', 'B', 'AA', or 'Artifact B')
    if (parsed.byAlpha?.artifactId) {
      return parsed.byAlpha.artifactId;
    }

    // 2. Match by artifactId or versionId UUID
    for (const entry of this.artifacts.values()) {
      if (entry.artifactId && (UUIDsEqual(entry.artifactId, parsed.trimmed) || (entry.versionId && UUIDsEqual(entry.versionId, parsed.trimmed)))) {
        return entry.artifactId;
      }
    }

    // 3. Pass through well-formed UUIDs so callers can pass an explicit artifact UUID directly
    return parsed.isUuid ? parsed.trimmed : undefined;
  }

  /**
   * Resolves a manifest alpha ID (e.g. `"E"`, `"Artifact E"`) or version UUID
   * to the underlying `MJ: Artifact Versions` record UUID (`versionId`).
   */
  ResolveArtifactVersionUuid(idOrAlpha: string | undefined | null): string | undefined {
    const parsed = this.parseIdentifierRef(idOrAlpha);
    if (!parsed) return undefined;

    // 1. Direct alpha ID lookup: map session short ID to its tracked ArtifactVersion UUID
    if (parsed.byAlpha) {
      return parsed.byAlpha.versionId ?? undefined;
    }

    // 2. Match by tracked versionId UUID
    for (const entry of this.artifacts.values()) {
      if (entry.versionId && UUIDsEqual(entry.versionId, parsed.trimmed)) {
        return entry.versionId;
      }
    }

    // 3. Pass through well-formed UUIDs so callers can pass an explicit version UUID directly
    return parsed.isUuid ? parsed.trimmed : undefined;
  }

  /** Reset all state */
  Clear(): void {
    this.artifacts.clear();
    this.toolResults = [];
    this.nextAlphaIndex = 0;
    this.contextUser = undefined;
    this.provider = undefined;
    this.getAgentRun = undefined;
    this.getRunTaint = undefined;
    this.agentRunId = undefined;
    this.agentName = undefined;
    this.workspaceEnabled = false;
    this.touchedArtifacts.clear();
    this.enteredPresenceArtifactIds.clear();
  }

  /** Whether any artifacts are attached/registered in the session */
  HasArtifacts(): boolean {
    return this.artifacts.size > 0;
  }

  /** Whether artifact workspace tools (including `create_artifact`, `open_artifact`, etc.) are available */
  IsWorkspaceEnabled(): boolean {
    return this.artifacts.size > 0 || this.workspaceEnabled;
  }

  /** Returns deduplicated summaries of all governed artifacts created or mutated during this run. */
  GetTouchedArtifacts(): GovernedRunArtifactSummary[] {
    const merged = new Map<string, GovernedRunArtifactSummary>();
    for (const [key, item] of this.touchedArtifacts.entries()) {
      merged.set(key, { ...item });
    }
    const runId = this.agentRunId ?? this.getAgentRun?.()?.ID;
    for (const item of GovernedArtifactService.Instance.PeekTouchedArtifacts(runId)) {
      const key = item.ArtifactID.trim().toLowerCase();
      merged.set(key, MergeTouchedArtifactSummary(merged.get(key), item));
    }
    return Array.from(merged.values());
  }

  /** Records a sub-agent or service touched artifact into this manager's run summary set. */
  AbsorbTouchedArtifacts(items?: GovernedRunArtifactSummary[]): void {
    if (!items?.length) return;
    for (const item of items) {
      if (!item.ArtifactID) continue;
      this.recordTouchedArtifactSummary(item);
    }
  }

  /** Exports current artifacts merged with any caller seeds so sub-agents see artifacts created earlier in the run. */
  ExportInputArtifacts(seed?: InputArtifact[]): InputArtifact[] | undefined {
    const out: InputArtifact[] = [];
    const seen = new Set<string>();
    for (const entry of this.artifacts.values()) {
      const key = (entry.artifactId ?? entry.alphaId).toLowerCase();
      seen.add(key);
      out.push({
        name: entry.name,
        typeName: entry.typeName,
        content: entry.content,
        mimeType: entry.mimeType,
        description: entry.description,
        artifactId: entry.artifactId,
        versionId: entry.versionId,
        versionNumber: entry.currentVersionNumber ?? entry.versionNumber,
        toolLibraryClass: entry.toolLibraryClass,
        annotation: entry.annotation,
        deliveryMode: entry.deliveryMode,
        forceToolsOnly: entry.forceToolsOnly,
        ...(entry.trustLevel ? { trustLevel: entry.trustLevel } : {}),
        ...(entry.sourceName ? { sourceName: entry.sourceName } : {}),
      });
    }
    if (seed?.length) {
      for (const s of seed) {
        const key = (s.artifactId ?? s.name).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(s);
        }
      }
    }
    return out.length > 0 ? out : undefined;
  }

  /** Emits `'exit'` awareness on every artifact this run entered so remote viewers clear active badges cleanly. */
  async NotifyRunCompleted(): Promise<void> {
    if (!this.contextUser) {
      this.enteredPresenceArtifactIds.clear();
      return;
    }
    const activeRunId = this.agentRunId ?? this.getAgentRun?.()?.ID;
    const activeAgentName = this.agentName ?? this.getAgentRun?.()?.Agent ?? undefined;
    const allIds = new Set<string>(this.enteredPresenceArtifactIds);
    for (const touched of GovernedArtifactService.Instance.PeekTouchedArtifacts(activeRunId)) {
      if (touched.ArtifactID) {
        allIds.add(touched.ArtifactID);
      }
    }
    this.enteredPresenceArtifactIds.clear();
    if (allIds.size === 0) return;

    await Promise.all(
      Array.from(allIds).map((artifactId) =>
        GovernedArtifactService.Instance.EmitAgentPresence({
          artifactId,
          phase: 'exit',
          contextUser: this.contextUser!,
          agentRunId: activeRunId,
          agentName: activeAgentName,
        }),
      ),
    );
  }

  private recordTouchedArtifactSummary(summary: GovernedRunArtifactSummary): void {
    if (!summary.ArtifactID) return;
    const key = summary.ArtifactID.trim().toLowerCase();
    const prev = this.touchedArtifacts.get(key);
    this.touchedArtifacts.set(key, MergeTouchedArtifactSummary(prev, summary));
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

  /** Extract all text from a PDF buffer using memoized pdfjs-dist. Returns null on failure. */
  private async extractPdfText(buffer: Buffer): Promise<string | null> {
    try {
      const pdfjsLib = await GetPdfJsModule();
      const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      try {
        const pages: string[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i);
          const tc = await page.getTextContent();
          pages.push(tc.items.map((item) => item.str ?? '').join(' '));
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
    const lines: string[] = [];
    if (this.artifacts.size === 0) {
      if (!this.workspaceEnabled) return '';
      lines.push('## Available Artifacts\n');
      lines.push('No artifacts are currently attached to this conversation turn. Use `create_artifact` to create a new governed Spreadsheet, Markdown Document, or Presentation, `list_workspace_artifacts` to discover existing workspace artifacts, or `open_artifact` to load an artifact by UUID into this session.\n');
    } else {
      lines.push('## Available Artifacts\n');
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

        const shape = this.describeContentShape(entry.content);
        if (shape) {
          lines.push(`    > Shape: ${shape}`);
        }

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
    }

    if (opts?.nativeTools) {
      lines.push('IMPORTANT: For per-artifact tools, pass the single-letter artifact ID (A, B, C, etc.) as `artifactId` on `artifact_tool` (for workspace-wide tools such as `create_artifact`, `open_artifact`, or `list_workspace_artifacts`, `artifactId` may be omitted).');
      return lines.join('\n');
    }
    lines.push('IMPORTANT: For per-artifact tools, pass the single-letter artifact ID (A, B, C, etc.) as `artifactId` in `artifactToolCalls` (for workspace-wide tools such as `create_artifact`, `open_artifact`, or `list_workspace_artifacts`, pass `artifactId: "workspace"`).');
    if (this.artifacts.size > 0) {
      lines.push('Artifact tools persist and version your edits directly — do NOT write artifact contents or tool state into `payload`/`payloadChangeRequest`, and do NOT emit `artifactDirective` (`version-source`) for artifacts you edited via artifact tools. Reserve `artifactDirective.targetArtifactId` (UUID or single-letter ID) only when persisting a standalone JSON `payload` deliverable.');
    }
    return lines.join('\n');
  }

  /**
   * Distinct artifact tool names available across all input artifacts and workspace tools.
   */
  public GetAvailableToolNames(): string[] {
    const names = new Set<string>();
    for (const entry of this.artifacts.values()) {
      for (const tool of entry.library.GetToolList()) {
        names.add(tool.name);
      }
    }
    if (this.IsWorkspaceEnabled()) {
      names.add('create_artifact');
      names.add('open_artifact');
      names.add('list_workspace_artifacts');
      names.add('create_synthesized_artifact');
      names.add('refresh_and_snapshot_artifact');
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
          const obj = parsed as ArtifactToolArgs;
          const base = `JSON object; keys: ${Object.keys(obj).slice(0, 20).join(', ')}.`;
          const extras: string[] = [];
          if (typeof obj.title === 'string' && obj.title.trim()) {
            extras.push(`Title: "${obj.title.trim().slice(0, 120)}".`);
          }
          if (Array.isArray(obj.tables) && obj.tables.length > 0) {
            const tableSummaries = obj.tables.slice(0, 8).map((item) => {
              const t = item !== null && typeof item === 'object' && !Array.isArray(item) ? (item as ArtifactToolArgs) : undefined;
              const tName = typeof t?.name === 'string' ? t.name : (typeof t?.id === 'string' ? t.id : 'table');
              const meta = t?.metadata !== null && typeof t?.metadata === 'object' && !Array.isArray(t?.metadata)
                ? (t.metadata as ArtifactToolArgs)
                : undefined;
              const tRows = Array.isArray(t?.rows)
                ? t.rows.length
                : (typeof meta?.rowCount === 'number' ? meta.rowCount : 0);
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

  /** Markdown tool documentation grouped by artifact type and workspace capabilities */
  GetToolDocumentation(): string {
    if (!this.IsWorkspaceEnabled()) return '';

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
        const schemaProps = tool.inputSchema.properties;
        const propObj = schemaProps !== null && typeof schemaProps === 'object' && !Array.isArray(schemaProps)
          ? (schemaProps as ArtifactToolArgs)
          : {};
        const params = Object.keys(propObj).join(', ');
        sections.push(`- **${tool.name}**(artifactId${params ? ', ' + params : ''}) — ${tool.description}`);
      }
      sections.push(
        `- **reload_artifact**(artifactId) — Reloads the latest persisted version of the artifact from the database to recover after a concurrent modification conflict.`,
      );
      sections.push('');
    }

    sections.push('## Workspace & Cross-Artifact Tools');
    sections.push(
      '- **create_artifact**(title, artifactType, description?, content?, sheetNames?, initialOperations?, collectionId?) — Creates and persists a new governed artifact (`"Excel Spreadsheet"`, `"Markdown Document"`, or `"Presentation"`), optionally applying an array of initial `{ tool, input }` domain operations atomically before saving v1 (or registers it in this session with its alpha ID `A`, `B`, ... so you can call domain tools like `upsert_live_table`, `write_cells`, `insert_block_after`, `add_slide`), and streams live edits to connected viewers.',
    );
    sections.push(
      '- **open_artifact**(artifactId) — Opens an existing governed artifact by UUID (checking Read permission and hydrating from any active live collaboration room), registers it in this session, and returns its alpha ID plus available domain tools.',
    );
    sections.push(
      '- **list_workspace_artifacts**(collectionId?, typeFilter?, search?) — Lists readable artifacts in the current workspace (and optionally inside a Collection) along with summaries and Spreadsheet ChartID/range references.',
    );
    sections.push(
      '- **create_synthesized_artifact**(title, targetKind, goal?, sourceArtifactIds?, content?, description?, collectionId?, linkChartsAndRanges?) — Creates and persists a new synthesized governed artifact (`targetKind`: `"presentation"` | `"document"` | `"spreadsheet"`) from multiple source artifacts while enforcing permissions and stripping unauthorized references.',
    );
    sections.push(
      '- **refresh_and_snapshot_artifact**(targetArtifactId, mode?, versionComment?, skipIfUnchanged?, forceRefreshFrozen?) — Refreshes live blocks and `=MJ.*` formulas under Edit permissions (`mode`: `"live_refresh"`; block freezing is disabled for agents and requires a direct human action in the UI), reconciles live collaboration state, preserves `.xlsx` File-mode binaries, and persists a new version when changed.',
    );
    sections.push('');

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
   * Serializes async operations per artifact through the process-wide `GovernedArtifactService` lock
   * backed by `GetGlobalObjectStore()` so parallel calls, sub-agents, and CoreActions never race.
   */
  private async withArtifactLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    return GovernedArtifactService.Instance.WithArtifactLock(lockKey, fn);
  }

  private resolveExistingArtifactEntry(rawArtifactId: string): ArtifactEntry | undefined {
    const trimmed = (rawArtifactId ?? '').trim();
    if (!trimmed || trimmed.toLowerCase() === 'default' || trimmed === '*') {
      return this.artifacts.size === 1 ? this.artifacts.values().next().value : undefined;
    }

    const direct = this.artifacts.get(trimmed);
    if (direct) return direct;

    const lower = trimmed.toLowerCase();
    const isUuid = IsValidUUID(trimmed);
    for (const e of this.artifacts.values()) {
      if (e.alphaId.toLowerCase() === lower || `artifact ${e.alphaId.toLowerCase()}` === lower) {
        return e;
      }
      if (isUuid && e.artifactId && UUIDsEqual(e.artifactId, trimmed)) {
        return e;
      }
      if (e.name.toLowerCase() === lower || e.name.toLowerCase().replace(/\s+/g, '_') === lower) {
        return e;
      }
    }
    return undefined;
  }

  private sanitizeToolInput(input?: ArtifactToolArgs): ArtifactToolArgs {
    if (!input) return {};
    const sanitized: ArtifactToolArgs = {};
    for (const [k, v] of Object.entries(input)) {
      if (k === '_actorUserId' || k === '_ownerUserId' || k === '_isEditor') continue;
      sanitized[k] = v;
    }
    return sanitized;
  }

  private async resolveEntryOwnerUserId(entry: ArtifactEntry): Promise<string | undefined> {
    if (entry.ownerUserId !== undefined) {
      return entry.ownerUserId;
    }
    if (!entry.artifactId || !this.provider || !this.contextUser || !IsValidUUID(entry.artifactId)) {
      return undefined;
    }
    try {
      const rv = RunView.FromMetadataProvider(this.provider);
      const artRes = await rv.RunView<{ ID: string; UserID?: string | null }>(
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: `ID='${EscapeSQLString(entry.artifactId)}'`,
          Fields: ['ID', 'UserID'],
          MaxRows: 1,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        this.contextUser,
      );
      if (artRes.Success && artRes.Results?.length) {
        const owner = (artRes.Results[0].UserID ?? '').trim();
        if (owner) {
          entry.ownerUserId = owner;
        }
      }
    } catch {
      // Best-effort owner resolution; leave undefined if mock/provider omits UserID
    }
    return entry.ownerUserId;
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

    if (call.tool === 'create_artifact') {
      return this.handleCreateArtifactTool(call, startedAt);
    }
    if (call.tool === 'open_artifact') {
      return this.handleOpenArtifactTool(call, startedAt);
    }
    if (call.tool === 'list_workspace_artifacts') {
      return this.handleListWorkspaceArtifactsTool(call, startedAt);
    }
    if (call.tool === 'create_synthesized_artifact') {
      return this.handleCreateSynthesizedArtifactTool(call, startedAt);
    }
    if (call.tool === 'refresh_and_snapshot_artifact') {
      return this.handleRefreshAndSnapshotArtifactTool(call, startedAt);
    }

    const entry = this.resolveExistingArtifactEntry(call.artifactId);
    if (!entry) {
      const stored: StoredToolResult = {
        artifactId: call.artifactId,
        tool: call.tool,
        input: call.input,
        result: {
          success: false,
          data: null,
          errorMessage: `Unknown artifact ID: ${call.artifactId}. Use open_artifact or pass an alpha ID (A, B, C, etc.) from the manifest.`,
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
      const sanitizedInput = this.sanitizeToolInput(call.input);
      const toolDef = targetEntry.library.GetToolList().find((def) => def.name === call.tool);
      if (toolDef?.inputSchema) {
        const schemaErrors = ValidateJsonAgainstSchemaSubset(
          sanitizedInput,
          toolDef.inputSchema as JsonSchemaSubset,
          '$'
        );
        if (schemaErrors.length > 0) {
          const validationStored: StoredToolResult = {
            artifactId: call.artifactId,
            tool: call.tool,
            input: sanitizedInput,
            result: {
              success: false,
              data: { validationErrors: schemaErrors },
              errorMessage: `Invalid parameters for tool '${call.tool}': ${schemaErrors.join('; ')}`,
            },
            timestamp: new Date(),
            durationMs: Date.now() - startedAt,
          };
          this.toolResults.push(validationStored);
          return validationStored;
        }
      }
      let resolvedPerms:
        | Awaited<ReturnType<typeof ArtifactPermissionEngine.Instance.ResolvePermissions>>
        | undefined;

      // 1. Permission check before any tool execution (Blocker 2, Lower #4 fail-closed on missing context)
      if (targetEntry.artifactId) {
        if (!this.contextUser || !this.provider) {
          const missingCtxStored = this.withEntryTrust(targetEntry, {
            artifactId: call.artifactId,
            tool: call.tool,
            input: sanitizedInput,
            result: {
              success: false,
              data: null,
              errorMessage: 'Permission denied: authenticated contextUser and provider are required to access a persisted artifact.',
            },
            timestamp: new Date(),
            durationMs: Date.now() - startedAt,
          });
          this.toolResults.push(missingCtxStored);
          return missingCtxStored;
        }
        resolvedPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
          this.provider,
          targetEntry.artifactId,
          this.contextUser,
        );
        if (isMutatingTool && !resolvedPerms.CanEdit) {
          const deniedStored = this.withEntryTrust(targetEntry, {
            artifactId: call.artifactId,
            tool: call.tool,
            input: sanitizedInput,
            result: {
              success: false,
              data: null,
              errorMessage: 'Permission denied: user does not have edit access to this artifact',
            },
            timestamp: new Date(),
            durationMs: Date.now() - startedAt,
          });
          this.toolResults.push(deniedStored);
          return deniedStored;
        }
        if (!isMutatingTool && !resolvedPerms.CanRead) {
          const deniedStored = this.withEntryTrust(targetEntry, {
            artifactId: call.artifactId,
            tool: call.tool,
            input: sanitizedInput,
            result: {
              success: false,
              data: null,
              errorMessage: 'Permission denied: user does not have read access to this artifact',
            },
            timestamp: new Date(),
            durationMs: Date.now() - startedAt,
          });
          this.toolResults.push(deniedStored);
          return deniedStored;
        }
      }

      // 1b. Handle universal reload_artifact recovery tool (Round 3 Item 9)
      if (call.tool === 'reload_artifact') {
        const reloadResult = await this.reloadArtifactFromDatabase(targetEntry);
        const reloadStored = this.withEntryTrust(targetEntry, {
          artifactId: call.artifactId,
          tool: call.tool,
          input: call.input,
          result: reloadResult,
          timestamp: new Date(),
          durationMs: Date.now() - startedAt,
        });
        this.toolResults.push(reloadStored);
        return reloadStored;
      }

      // 2. Real DB concurrency pre-check before mutating in-memory session state
      if (isMutatingTool && targetEntry.artifactId && this.contextUser && this.provider) {
        const conflictError = await this.checkConcurrentDatabaseModification(targetEntry);
        if (conflictError) {
          const conflictStored = this.withEntryTrust(targetEntry, {
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
          });
          this.toolResults.push(conflictStored);
          return conflictStored;
        }
      }

      // 2b. Refuse structural mutations on File-mode .xlsx workbooks to preserve OpenXML fidelity (Round 3 Item 12)
      if (
        (targetEntry.contentMode === 'File' || Boolean(targetEntry.originalXlsxBytes)) &&
        ArtifactToolManager.STRUCTURAL_SPREADSHEET_TOOLS.has(call.tool)
      ) {
        const refusedStored = this.withEntryTrust(targetEntry, {
          artifactId: call.artifactId,
          tool: call.tool,
          input: call.input,
          result: {
            success: false,
            data: null,
            errorMessage: FormatFileModeStructuralToolError(call.tool),
          },
          timestamp: new Date(),
          durationMs: Date.now() - startedAt,
        });
        this.toolResults.push(refusedStored);
        return refusedStored;
      }

      const presenceArtifactId = targetEntry.artifactId;
      const activeRunIdForCall = this.agentRunId ?? this.getAgentRun?.()?.ID;
      const activeAgentNameForCall = this.agentName ?? this.getAgentRun?.()?.Agent ?? undefined;
      const preLocation = ExtractAgentTargetLocation(call.tool, sanitizedInput, targetEntry.content, targetEntry.typeName);
      let presenceEmittedWorking = false;
      let settledContent: string | Buffer = targetEntry.content;
      let settledData: ArtifactToolArgs | undefined;
      if (presenceArtifactId && this.contextUser) {
        this.enteredPresenceArtifactIds.add(presenceArtifactId);
        presenceEmittedWorking = true;
        await GovernedArtifactService.Instance.EmitAgentPresence({
          artifactId: presenceArtifactId,
          phase: 'working',
          contextUser: this.contextUser,
          agentRunId: activeRunIdForCall,
          agentName: activeAgentNameForCall,
          toolName: call.tool,
          actionSummary: FormatAgentActionSummary(call.tool, sanitizedInput, preLocation),
          location: preLocation ?? { Domain: ResolvePresenceDomain(targetEntry.typeName) },
        });
      }

      try {
      const ownerUserId = await this.resolveEntryOwnerUserId(targetEntry);
      // Wrap InvokeTool so any exception inside a handler becomes a structured
      // error result instead of propagating up to the agent loop.
      const toolContext: ArtifactToolExecutionContext = {
        contextUser: this.contextUser,
        actorUserId: this.contextUser?.ID,
        ownerUserId,
        isEditor: resolvedPerms?.CanEdit,
        provider: this.provider,
        artifactId: targetEntry.artifactId,
        agentRunId: activeRunIdForCall,
        agentName: activeAgentNameForCall,
        resolveArtifactId: (idOrAlpha: string) => this.ResolveArtifactUuid(idOrAlpha),
        resolveVersionId: (idOrAlpha: string) => this.ResolveArtifactVersionUuid(idOrAlpha),
      };
      let result: ArtifactToolResult;
      try {
        result = await targetEntry.library.InvokeTool(call.tool, sanitizedInput, targetEntry.content, toolContext);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result = {
          success: false,
          data: null,
          errorMessage: `Tool "${call.tool}" on artifact ${targetEntry.alphaId} threw: ${msg}. The artifact content may be malformed for this tool — try a different tool or a different artifact.`,
        };
      }

      let storedResult: ArtifactToolResult = result;
      const resultObj =
        result.success && result.data !== null && typeof result.data === 'object' && !Array.isArray(result.data)
          ? (result.data as ArtifactToolArgs)
          : undefined;
      const rawConfigurationPatch =
        resultObj &&
        resultObj.configurationPatch !== null &&
        typeof resultObj.configurationPatch === 'object' &&
        !Array.isArray(resultObj.configurationPatch)
          ? (resultObj.configurationPatch as ArtifactToolArgs)
          : undefined;
      const hasContentMutation = Boolean(resultObj && resultObj.updatedContent !== undefined);
      const hasConfigPatchMutation = Boolean(rawConfigurationPatch);

      if (resultObj && (hasContentMutation || hasConfigPatchMutation)) {
        if (resolvedPerms && !resolvedPerms.CanEdit) {
          const deniedMutation = this.withEntryTrust(targetEntry, {
            artifactId: call.artifactId,
            tool: call.tool,
            input: sanitizedInput,
            result: {
              success: false,
              data: null,
              errorMessage: 'Permission denied: user does not have edit access to this artifact',
            },
            timestamp: new Date(),
            durationMs: Date.now() - startedAt,
          });
          this.toolResults.push(deniedMutation);
          return deniedMutation;
        }
        if (!isMutatingTool && targetEntry.artifactId && this.contextUser && this.provider) {
          const lateConflict = await this.checkConcurrentDatabaseModification(targetEntry);
          if (lateConflict) {
            const conflictStored = this.withEntryTrust(targetEntry, {
              artifactId: call.artifactId,
              tool: call.tool,
              input: sanitizedInput,
              result: {
                success: false,
                data: null,
                errorMessage: lateConflict,
              },
              timestamp: new Date(),
              durationMs: Date.now() - startedAt,
            });
            this.toolResults.push(conflictStored);
            return conflictStored;
          }
        }
      }
      if (resultObj && (typeof resultObj.updatedContent === 'string' || hasConfigPatchMutation)) {
        const rawData = resultObj;
        const rawUpdatedContent = typeof rawData.updatedContent === 'string' ? rawData.updatedContent : undefined;
        const hasUpdatedContentString = rawUpdatedContent !== undefined;
        const fallbackExistingStr =
          typeof targetEntry.content === 'string'
            ? targetEntry.content
            : typeof targetEntry.configuration === 'string'
              ? targetEntry.configuration
              : '';
        const updatedContent = rawUpdatedContent ?? fallbackExistingStr;
        let xlsxBase64 = typeof rawData.xlsxBase64 === 'string' ? rawData.xlsxBase64 : undefined;

        const previousContent = targetEntry.content;
        const previousContentStr = typeof previousContent === 'string' ? previousContent : undefined;
        const previousOriginalXlsxBytes = targetEntry.originalXlsxBytes;

        // If the spreadsheet started from an uploaded .xlsx binary, patch the original ZIP bytes in-place (fail closed on error)
        if (targetEntry.originalXlsxBytes) {
          if (!hasUpdatedContentString && !xlsxBase64) {
            // Config-patch-only mutation (e.g. suggestion/comment): preserve existing .xlsx binary bytes intact.
            xlsxBase64 = Buffer.from(targetEntry.originalXlsxBytes).toString('base64');
          } else if (hasUpdatedContentString) {
            try {
              const parsedWorkbook = await SpreadsheetEngine.Instance.ParseWorkbookIsolated(updatedContent, undefined, {
                SkipEvaluate: true,
              });
              const patchedBytes = await XlsxOpenXmlAdapter.Instance.PatchXlsxBytesIsolated(
                targetEntry.originalXlsxBytes,
                parsedWorkbook,
              );
              targetEntry.originalXlsxBytes = patchedBytes;
              xlsxBase64 = Buffer.from(patchedBytes).toString('base64');
            } catch (patchErr) {
              const failedPatch = this.withEntryTrust(targetEntry, {
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
              });
              this.toolResults.push(failedPatch);
              return failedPatch;
            }
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
              configurationPatch: rawConfigurationPatch,
              tool: call.tool,
              contextUser: this.contextUser,
              agentRunId: activeAgentRunId,
              agentName: activeAgentName,
              deferCommit: willPersist,
            });
          } catch (hookErr) {
            const hookMsg = hookErr instanceof Error ? hookErr.message : String(hookErr);
            LogError(
              `ArtifactToolManager: live mutation hook failed for artifact '${targetEntry.artifactId}': ${hookMsg}`,
            );
            if (willPersist) {
              targetEntry.originalXlsxBytes = previousOriginalXlsxBytes;
              const failedHookStored = this.withEntryTrust(targetEntry, {
                artifactId: call.artifactId,
                tool: call.tool,
                input: call.input,
                result: {
                  success: false,
                  data: null,
                  errorMessage: `Live collaboration room hook failed before save: ${hookMsg}`,
                },
                timestamp: new Date(),
                durationMs: Date.now() - startedAt,
              });
              this.toolResults.push(failedHookStored);
              return failedHookStored;
            }
          }
        }

        let effectiveContent =
          hookResult && typeof hookResult === 'object' && typeof hookResult.mergedContent === 'string'
            ? hookResult.mergedContent
            : updatedContent;

        if (effectiveContent !== updatedContent && previousOriginalXlsxBytes) {
          try {
            const mergedWorkbook = await SpreadsheetEngine.Instance.ParseWorkbookIsolated(effectiveContent, undefined, {
              SkipEvaluate: true,
            });
            const mergedBytes = await XlsxOpenXmlAdapter.Instance.PatchXlsxBytesIsolated(previousOriginalXlsxBytes, mergedWorkbook);
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
        if (hasUpdatedContentString || !Buffer.isBuffer(previousContent)) {
          targetEntry.content = effectiveContent;
        }
        if (hasConfigPatchMutation && (!targetEntry.artifactId || !this.contextUser || !this.provider)) {
          targetEntry.configuration = BuildMergedFileVersionConfiguration({
            existingConfiguration: targetEntry.configuration,
            contentConfigurationJson: hasUpdatedContentString ? effectiveContent : undefined,
            configurationPatch: rawConfigurationPatch,
          });
        }

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
            rawConfigurationPatch,
          );
          if (!persistOutcome.persisted) {
            targetEntry.content = previousContent;
            targetEntry.originalXlsxBytes = previousOriginalXlsxBytes;
            const failedStored = this.withEntryTrust(targetEntry, {
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
            });
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
                  if (persistOutcome.uploadedFileId) {
                    await this.deleteUnreferencedArtifactFile(persistOutcome.uploadedFileId);
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
                  const failedStored = this.withEntryTrust(targetEntry, {
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
                  });
                  this.toolResults.push(failedStored);
                  return failedStored;
                }
                if (typeof commitOutcome.mergedContent === 'string' && commitOutcome.mergedContent !== effectiveContent) {
                  effectiveContent = commitOutcome.mergedContent;
                  targetEntry.content = effectiveContent;
                  if (previousOriginalXlsxBytes) {
                    try {
                      const mergedWorkbook = await SpreadsheetEngine.Instance.ParseWorkbookIsolated(effectiveContent, undefined, {
              SkipEvaluate: true,
            });
                      const mergedBytes = await XlsxOpenXmlAdapter.Instance.PatchXlsxBytesIsolated(previousOriginalXlsxBytes, mergedWorkbook);
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
                    rawConfigurationPatch,
                  );
                  if (!rePersistOutcome.persisted) {
                    const failMsg = rePersistOutcome.errorMessage ?? 'Failed to persist merged artifact version after concurrent edit reconciliation';
                    LogError(`ArtifactToolManager: ${failMsg}`);
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
                    if (rePersistOutcome.uploadedFileId) {
                      await this.deleteUnreferencedArtifactFile(rePersistOutcome.uploadedFileId);
                    }
                    if (persistOutcome.uploadedFileId) {
                      await this.deleteUnreferencedArtifactFile(persistOutcome.uploadedFileId);
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
                    targetEntry.originalXlsxBytes = previousOriginalXlsxBytes;
                    const failedStored = this.withEntryTrust(targetEntry, {
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
                    });
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
              if (persistOutcome.uploadedFileId) {
                await this.deleteUnreferencedArtifactFile(persistOutcome.uploadedFileId);
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
              const failedStored = this.withEntryTrust(targetEntry, {
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
              });
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
                  rawConfigurationPatch,
                );
                if (!rePersistOutcome.persisted) {
                  const failMsg = rePersistOutcome.errorMessage ?? 'Failed to persist merged artifact version after concurrent edit reconciliation';
                  LogError(`ArtifactToolManager: ${failMsg}`);
                  if (rePersistOutcome.uploadedFileId) {
                    await this.deleteUnreferencedArtifactFile(rePersistOutcome.uploadedFileId);
                  }
                  if (hookResult.rollback) {
                    try {
                      await hookResult.rollback(targetEntry.versionId);
                    } catch {
                      // Non-fatal
                    }
                  }
                  targetEntry.content = previousContent;
                  targetEntry.originalXlsxBytes = previousOriginalXlsxBytes;
                  const failedStored = this.withEntryTrust(targetEntry, {
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
                  });
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
        const sanitizedData: ArtifactToolArgs = {};
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

        if (targetEntry.artifactId) {
          const touchedSummary: GovernedRunArtifactSummary = {
            ArtifactID: targetEntry.artifactId,
            ArtifactVersionID: targetEntry.versionId ?? '',
            VersionNumber: targetEntry.versionNumber ?? 1,
            Name: targetEntry.name,
            ArtifactTypeName: targetEntry.typeName,
            DriverClass: targetEntry.driverClass,
            Operation: 'mutated',
          };
          this.recordTouchedArtifactSummary(touchedSummary);
          GovernedArtifactService.Instance.RecordTouchedArtifact(activeRunIdForCall, touchedSummary);
        }

        settledContent = effectiveContent;
        settledData = rawData;
      } else if (result.success) {
        if (resultObj && resultObj['rlsCheckRequired'] === true) {
          storedResult = await this.handleFollowSourceLinkRuntime(resultObj, activeRunIdForCall);
        } else if (resultObj && resultObj['requested'] === 'rerank') {
          storedResult = await this.handleRerankRuntime(targetEntry, resultObj, activeRunIdForCall);
        }
        settledContent = targetEntry.content;
        settledData =
          storedResult.data !== null && typeof storedResult.data === 'object' && !Array.isArray(storedResult.data)
            ? (storedResult.data as ArtifactToolArgs)
            : undefined;
      }

      const stored = this.withEntryTrust(targetEntry, {
        artifactId: call.artifactId,
        tool: call.tool,
        input: sanitizedInput,
        result: storedResult,
        timestamp: new Date(),
        durationMs: Date.now() - startedAt,
      });
      this.toolResults.push(stored);
      return stored;
      } finally {
        if (presenceEmittedWorking && presenceArtifactId && this.contextUser) {
          const postLocation =
            ExtractAgentTargetLocation(call.tool, sanitizedInput, settledContent, targetEntry.typeName, settledData) ??
            preLocation;
          await GovernedArtifactService.Instance.EmitAgentPresence({
            artifactId: presenceArtifactId,
            phase: 'settled',
            contextUser: this.contextUser,
            agentRunId: activeRunIdForCall,
            agentName: activeAgentNameForCall,
            toolName: call.tool,
            actionSummary: FormatAgentActionSummary(call.tool, sanitizedInput, postLocation),
            location: postLocation ?? { Domain: ResolvePresenceDomain(targetEntry.typeName) },
          }).catch(() => undefined);
        }
      }
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
        Configuration?: string | null;
      }>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ArtifactID='${EscapeSQLString(entry.artifactId)}'`,
          OrderBy: 'VersionNumber DESC',
          Fields: ['ID', 'VersionNumber', 'ContentMode', 'FileID', 'Configuration'],
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
      if (!entry.configuration && typeof latestRow.Configuration === 'string') {
        entry.configuration = latestRow.Configuration;
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
      const loaded = await GovernedArtifactService.Instance.LoadReadableArtifactState(
        this.provider,
        this.contextUser,
        entry.artifactId,
        {
          failOnMissingFileContent: true,
          fallbackTypeName: entry.typeName,
          skipTypeEntityResolution: true,
        },
      );
      if (!loaded.state) {
        return {
          success: false,
          data: null,
          errorMessage: loaded.errorMessage || `Failed to reload artifact '${entry.artifactId}'.`,
        };
      }
      const state = loaded.state;
      const libClassName = entry.library.constructor.name;
      const isBinaryLibrary =
        libClassName === 'DocxToolLibrary' ||
        libClassName === 'PDFToolLibrary' ||
        libClassName === 'ExcelToolLibrary' ||
        libClassName === 'GenericBinaryToolLibrary';

      let nextEntryContent: string | Buffer = state.content;
      if (isBinaryLibrary && typeof state.content === 'string') {
        nextEntryContent = DecodeBinaryArtifactContent(state.content);
      } else if (!isBinaryLibrary && !Buffer.isBuffer(entry.content) && Buffer.isBuffer(state.content)) {
        nextEntryContent = state.content.toString('utf-8');
      }

      // Commit reloaded state only after storage download & parsing succeeded
      entry.ownerUserId = state.ownerUserId ?? entry.ownerUserId;
      entry.versionId = state.versionId;
      entry.versionNumber = state.versionNumber;
      entry.baseVersionNumber = state.versionNumber;
      entry.currentVersionNumber = state.versionNumber;
      entry.agentRunVersionId = undefined;
      entry.agentRunVersionEntity = undefined;
      if (state.name && state.name !== 'Untitled Artifact') {
        entry.name = state.name;
      }
      if (state.mimeType) {
        entry.mimeType = state.mimeType;
      }
      entry.contentMode = state.contentMode;
      entry.originalXlsxBytes = state.originalXlsxBytes;
      entry.configuration = state.configuration;
      entry.content = nextEntryContent;

      return {
        success: true,
        data: {
          artifactId: entry.artifactId,
          alphaId: entry.alphaId,
          versionId: state.versionId,
          versionNumber: state.versionNumber,
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
    configurationPatch?: ArtifactToolArgs,
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
      if (!updatedContent.trim()) {
        effectiveXlsxBase64 = Buffer.from(entry.originalXlsxBytes).toString('base64');
      } else {
        try {
          const workbook = await SpreadsheetEngine.Instance.ParseWorkbookIsolated(updatedContent, undefined, {
            SkipEvaluate: true,
          });
          const bytes = await XlsxOpenXmlAdapter.Instance.PatchXlsxBytesIsolated(entry.originalXlsxBytes, workbook);
          entry.originalXlsxBytes = bytes;
          effectiveXlsxBase64 = Buffer.from(bytes).toString('base64');
        } catch (err) {
          return {
            persisted: false,
            errorMessage: `Failed to patch .xlsx binary for File-mode artifact: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }
    }

    let uploadedFileId: string | null = null;
    let xlsxSizeBytes: number | null = null;
    if (effectiveXlsxBase64) {
      const xlsxBuf = Buffer.from(effectiveXlsxBase64, 'base64');
      xlsxSizeBytes = xlsxBuf.byteLength;
      try {
        await FileStorageEngine.Instance.Config(false, this.contextUser, this.provider);
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
        versionEntity.Configuration = BuildMergedFileVersionConfiguration({
          existingConfiguration: versionEntity.Configuration ?? entry.configuration,
          contentConfigurationJson: updatedContent,
          configurationPatch,
        });
        entry.configuration = versionEntity.Configuration;
        entry.contentMode = 'File';
      } else {
        const resolvedTypeEntity = ArtifactMetadataEngine.Instance.FindArtifactType(entry.typeName);
        versionEntity.ContentMode = 'Text';
        versionEntity.FileID = null;
        versionEntity.MimeType = entry.mimeType ?? resolvedTypeEntity?.ContentType ?? null;
        versionEntity.Content = updatedContent;
        versionEntity.ContentSizeBytes = Buffer.byteLength(updatedContent, 'utf8');
        if (effectiveXlsxBase64) {
          versionEntity.Configuration = BuildMergedFileVersionConfiguration({
            existingConfiguration: versionEntity.Configuration ?? entry.configuration,
            contentConfigurationJson: updatedContent,
            configurationPatch,
          });
          entry.configuration = versionEntity.Configuration;
        } else {
          let existingConfig: ArtifactToolArgs = {};
          if (entry.configuration) {
            const parsedConfig = CleanAndParseJSON<ArtifactJsonValue>(entry.configuration);
            if (parsedConfig && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig)) {
              existingConfig = parsedConfig;
            }
          }
          const mergedConfigObj: ArtifactToolArgs = {
            ...existingConfig,
            ...(configurationPatch ?? {}),
            ...(activeAgentRunId || activeAgentName
              ? {
                  agentRunId: activeAgentRunId ?? null,
                  agentName: activeAgentName ?? null,
                  lastTool: toolName,
                }
              : {}),
          };
          const mergedJson = JSON.stringify(mergedConfigObj);
          const enrichedConfig = BuildArtifactVersionConfigurationWithPreview(
            mergedJson,
            updatedContent,
            entry.driverClass ?? resolvedTypeEntity?.DriverClass ?? null,
            entry.name,
            {
              ArtifactType: resolvedTypeEntity ?? undefined,
              AllArtifactTypes: ArtifactMetadataEngine.Instance.ArtifactTypes ?? [],
            },
          );
          if (Object.keys(mergedConfigObj).length > 0 || enrichedConfig) {
            versionEntity.Configuration = enrichedConfig ?? mergedJson;
            entry.configuration = versionEntity.Configuration;
          } else if (attributionConfig) {
            versionEntity.Configuration = attributionConfig;
            entry.configuration = attributionConfig;
          }
        }
        entry.contentMode = 'Text';
      }

      this.markTrustedAgentDraftVersionSave(versionEntity);

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
          uploadedFileId,
          supersededFileId,
          rollbackSnapshot,
        };
      }

      await this.deleteUnreferencedArtifactFile(uploadedFileId);

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
      await this.deleteUnreferencedArtifactFile(uploadedFileId);
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

  /** Marks an already-saved in-run draft version so `MJArtifactVersionEntityServer.Save` accepts sequential draft updates (`B3`). */
  private markTrustedAgentDraftVersionSave(versionEntity: MJArtifactVersionEntity): void {
    if (!versionEntity.IsSaved) {
      return;
    }
    const store = GetGlobalObjectStore();
    if (!store) {
      return;
    }
    let draftSet = store[GLOBAL_KEY_TRUSTED_AGENT_DRAFT] as WeakSet<object> | undefined;
    if (!(draftSet instanceof WeakSet)) {
      draftSet = new WeakSet<object>();
      store[GLOBAL_KEY_TRUSTED_AGENT_DRAFT] = draftSet;
    }
    draftSet.add(versionEntity);
  }

  /** Saves a rollback write and logs any failure; returns whether it saved. */
  private async saveRollbackEntity(
    entry: ArtifactEntry,
    versionEntity: MJArtifactVersionEntity,
    action: string,
  ): Promise<boolean> {
    try {
      this.markTrustedAgentDraftVersionSave(versionEntity);

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
    let parsed: ArtifactToolArgs;
    try {
      const raw = JSON.parse(contentJson) as ArtifactJsonValue;
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return contentJson;
      }
      parsed = raw;
    } catch {
      return contentJson;
    }

    const tables = parsed['tables'];
    if (!Array.isArray(tables)) {
      return contentJson;
    }

    let modified = false;
    for (const table of tables) {
      if (table === null || typeof table !== 'object' || Array.isArray(table)) {
        continue;
      }
      const tbl = table as ArtifactToolArgs;
      const rows = tbl['rows'];
      if (!Array.isArray(rows) || rows.length <= maxRowsPerTable) {
        continue;
      }

      const existingMeta = tbl['metadata'];
      const metadata: ArtifactToolArgs =
        existingMeta !== null && typeof existingMeta === 'object' && !Array.isArray(existingMeta)
          ? (existingMeta as ArtifactToolArgs)
          : {};
      metadata['totalRowCount'] = rows.length;
      metadata['truncatedForStorage'] = true;
      tbl['metadata'] = metadata;
      tbl['rows'] = rows.slice(0, maxRowsPerTable);
      modified = true;
    }

    return modified ? JSON.stringify(parsed) : contentJson;
  }

  // ─── CROSS-ARTIFACT & SYNTHESIS TOOLS ───

  private recordToolResult(
    call: ArtifactToolCall,
    startedAt: number,
    result: ArtifactToolResult,
    trust?: Pick<ArtifactEntry, 'trustLevel' | 'sourceName'>,
  ): StoredToolResult {
    const stored = this.withEntryTrust(trust, {
      artifactId: call.artifactId,
      tool: call.tool,
      input: call.input,
      result,
      timestamp: new Date(),
      durationMs: Date.now() - startedAt,
    });
    this.toolResults.push(stored);
    return stored;
  }

  private parseInitialOperationsInput(
    input: ArtifactToolArgs,
  ): { operations?: ArtifactMutationOperation[]; errorMessage?: string } {
    let rawOps =
      input['initialOperations'] ??
      input['InitialOperations'] ??
      input['operations'] ??
      input['Operations'];
    if (rawOps === undefined || rawOps === null) {
      return {};
    }
    if (typeof rawOps === 'string') {
      const trimmed = rawOps.trim();
      if (!trimmed) {
        return {};
      }
      try {
        rawOps = JSON.parse(trimmed) as ArtifactJsonValue;
      } catch (err) {
        return {
          errorMessage: `initialOperations is not valid JSON (${err instanceof Error ? err.message : String(err)}). Expected an array of { tool, input? } items.`,
        };
      }
    }
    if (!Array.isArray(rawOps)) {
      return {
        errorMessage: 'initialOperations must be an array of { tool: string, input?: object } items.',
      };
    }
    if (rawOps.length > MAX_INITIAL_OPERATIONS) {
      return {
        errorMessage: `initialOperations exceeds the maximum allowed ${MAX_INITIAL_OPERATIONS} operations per request.`,
      };
    }

    const ops: ArtifactMutationOperation[] = [];
    for (let i = 0; i < rawOps.length; i++) {
      const entry = rawOps[i];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return { errorMessage: `initialOperations[${i}] must be an object with required string field 'tool'.` };
      }
      const record = entry as Record<string, ArtifactJsonValue | undefined>;
      const rawToolName = record['tool'] ?? record['Tool'];
      if (typeof rawToolName !== 'string' || !rawToolName.trim()) {
        return { errorMessage: `initialOperations[${i}] is missing required non-empty string field 'tool'.` };
      }
      let opInput = record['input'] ?? record['Input'];
      if (typeof opInput === 'string') {
        const trimmedInput = opInput.trim();
        if (trimmedInput) {
          try {
            opInput = JSON.parse(trimmedInput) as ArtifactJsonValue;
          } catch (err) {
            return {
              errorMessage: `initialOperations[${i}].input is not valid JSON (${err instanceof Error ? err.message : String(err)}).`,
            };
          }
        } else {
          opInput = undefined;
        }
      }
      if (opInput !== undefined && opInput !== null && (typeof opInput !== 'object' || Array.isArray(opInput))) {
        return { errorMessage: `initialOperations[${i}].input must be an object.` };
      }
      ops.push({
        tool: rawToolName.trim(),
        input: opInput ? (opInput as ArtifactToolArgs) : undefined,
      });
    }
    return { operations: ops.length > 0 ? ops : undefined };
  }

  private async handleCreateArtifactTool(
    call: ArtifactToolCall,
    startedAt: number,
  ): Promise<StoredToolResult> {
    const input = call.input ?? {};
    const pickStr = (...keys: string[]): string | undefined => {
      for (const k of keys) {
        const v = input[k];
        if (typeof v === 'string' && v.trim()) {
          return v.trim();
        }
      }
      return undefined;
    };
    const rawType =
      pickStr('artifactType', 'ArtifactType', 'type', 'Type', 'targetKind', 'TargetKind') ?? 'Markdown Document';
    const normalizedTypeName = GovernedArtifactService.Instance.NormalizeArtifactTypeName(rawType);
    const title = pickStr('title', 'Title') ?? `Untitled ${normalizedTypeName}`;
    const description = pickStr('description', 'Description');
    const collectionId = pickStr('collectionId', 'CollectionID');
    const rawSheetNames = input['sheetNames'] ?? input['SheetNames'];
    const sheetNames = Array.isArray(rawSheetNames)
      ? rawSheetNames.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : undefined;
    const rawContent = input['content'] ?? input['Content'];
    const providedContent =
      typeof rawContent === 'string' || (rawContent !== null && typeof rawContent === 'object' && !Array.isArray(rawContent))
        ? (rawContent as string | ArtifactToolArgs)
        : undefined;

    const parsedInitOps = this.parseInitialOperationsInput(input);
    if (parsedInitOps.errorMessage) {
      return this.recordToolResult(call, startedAt, {
        success: false,
        data: null,
        errorMessage: parsedInitOps.errorMessage,
      });
    }

    const activeRunId = this.agentRunId ?? this.getAgentRun?.()?.ID;
    const activeAgentName = this.agentName ?? this.getAgentRun?.()?.Agent ?? undefined;
    const inheritedTrust = this.resolveCreationTrust();

    if (this.provider && this.contextUser) {
      const outcome = await GovernedArtifactService.Instance.CreateGovernedArtifact({
        provider: this.provider,
        contextUser: this.contextUser,
        title,
        artifactType: rawType,
        description,
        content: providedContent,
        sheetNames,
        initialOperations: parsedInitOps.operations,
        collectionId,
        agentRunId: activeRunId,
        agentName: activeAgentName,
      });
      if (!outcome.success || !outcome.artifactId) {
        return this.recordToolResult(call, startedAt, {
          success: false,
          data: null,
          errorMessage: outcome.errorMessage || 'Failed to create governed artifact.',
        });
      }

      const alphaId = this.RegisterArtifact({
        name: outcome.name ?? title,
        typeName: outcome.typeName ?? normalizedTypeName,
        artifactId: outcome.artifactId,
        versionId: outcome.versionId,
        versionNumber: outcome.versionNumber ?? 1,
        description,
        mimeType: outcome.mimeType,
        toolLibraryClass: outcome.toolLibraryClass,
        content: outcome.content ?? '',
        ...inheritedTrust,
      });
      const registeredEntry = this.artifacts.get(alphaId);
      if (registeredEntry) {
        registeredEntry.driverClass = outcome.driverClass;
        registeredEntry.configuration = outcome.configuration;
        registeredEntry.ownerUserId = this.contextUser.ID;
      }

      const touchedSummary: GovernedRunArtifactSummary = {
        ArtifactID: outcome.artifactId,
        ArtifactVersionID: outcome.versionId ?? '',
        VersionNumber: outcome.versionNumber ?? 1,
        Name: outcome.name ?? title,
        ArtifactTypeName: outcome.typeName ?? normalizedTypeName,
        DriverClass: outcome.driverClass,
        Operation: 'created',
      };
      this.recordTouchedArtifactSummary(touchedSummary);
      this.enteredPresenceArtifactIds.add(outcome.artifactId);

      const availableTools = registeredEntry?.library.GetToolList().map((t) => t.name) ?? [];
      return this.recordToolResult(
        call,
        startedAt,
        {
          success: true,
          data: {
            alphaId,
            artifactId: outcome.artifactId,
            versionId: outcome.versionId,
            versionNumber: outcome.versionNumber ?? 1,
            title: outcome.name ?? title,
            artifactTypeName: outcome.typeName ?? normalizedTypeName,
            driverClass: outcome.driverClass,
            persisted: true,
            ...(outcome.results?.length
              ? {
                  initialOperationResults: outcome.results.map((r) => ({
                    tool: r.tool,
                    data: r.data ?? null,
                  })),
                }
              : {}),
            availableTools,
          },
        },
        inheritedTrust,
      );
    }

    // In-memory test fallback when no database provider/user is bound
    const built = await GovernedArtifactService.Instance.BuildInitialContentIsolated(
      normalizedTypeName,
      title,
      providedContent,
      sheetNames,
    );
    const alphaId = this.RegisterArtifact({
      name: title,
      typeName: normalizedTypeName,
      versionNumber: 1,
      description,
      mimeType: built.mimeType,
      content: built.content,
      ...inheritedTrust,
    });
    const registeredEntry = this.artifacts.get(alphaId);
    const initialResults: Array<{ tool: string; data: ArtifactToolResult['data'] }> = [];
    if (parsedInitOps.operations && registeredEntry) {
      let workingContent: string | Buffer = registeredEntry.content;
      for (const op of parsedInitOps.operations) {
        const opRes = await registeredEntry.library.InvokeTool(
          op.tool,
          op.input ?? {},
          workingContent,
          { artifactId: alphaId },
        );
        if (!opRes.success) {
          this.artifacts.delete(alphaId);
          return this.recordToolResult(call, startedAt, {
            success: false,
            data: null,
            errorMessage: `Initial operation '${op.tool}' failed: ${opRes.errorMessage || 'Unknown error'}`,
          });
        }
        const dataObj =
          opRes.data && typeof opRes.data === 'object' && !Array.isArray(opRes.data)
            ? (opRes.data as ArtifactToolArgs)
            : undefined;
        if (typeof dataObj?.updatedContent === 'string') {
          workingContent = dataObj.updatedContent;
        }
        initialResults.push({ tool: op.tool, data: opRes.data });
      }
      registeredEntry.content = workingContent;
    }
    const availableTools = registeredEntry?.library.GetToolList().map((t) => t.name) ?? [];
    return this.recordToolResult(
      call,
      startedAt,
      {
        success: true,
        data: {
          alphaId,
          artifactId: alphaId,
          versionNumber: 1,
          title,
          artifactTypeName: normalizedTypeName,
          persisted: false,
          ...(initialResults.length > 0
            ? {
                initialOperationResults: initialResults.map((r) => ({
                  tool: r.tool,
                  data: r.data ?? null,
                })),
              }
            : {}),
          availableTools,
        },
      },
      inheritedTrust,
    );
  }

  private async handleOpenArtifactTool(
    call: ArtifactToolCall,
    startedAt: number,
  ): Promise<StoredToolResult> {
    const input = call.input ?? {};
    const requestedId =
      typeof input['artifactId'] === 'string' && input['artifactId'].trim()
        ? input['artifactId'].trim()
        : (call.artifactId ?? '').trim();
    if (!requestedId) {
      return this.recordToolResult(call, startedAt, {
        success: false,
        data: null,
        errorMessage: 'open_artifact requires an artifactId UUID.',
      });
    }

    if (!this.provider || !this.contextUser) {
      for (const entry of this.artifacts.values()) {
        if (entry.artifactId && UUIDsEqual(entry.artifactId, requestedId)) {
          return this.recordToolResult(call, startedAt, {
            success: true,
            data: {
              alphaId: entry.alphaId,
              artifactId: entry.artifactId,
              versionId: entry.versionId,
              versionNumber: entry.currentVersionNumber ?? entry.versionNumber,
              name: entry.name,
              typeName: entry.typeName,
              availableTools: entry.library.GetToolList().map((t) => t.name),
            },
          });
        }
      }
      return this.recordToolResult(call, startedAt, {
        success: false,
        data: null,
        errorMessage: 'Cannot open external artifact without contextUser and provider.',
      });
    }

    const loaded = await GovernedArtifactService.Instance.LoadReadableArtifactState(
      this.provider,
      this.contextUser,
      requestedId,
    );
    if (!loaded.state) {
      return this.recordToolResult(call, startedAt, {
        success: false,
        data: null,
        errorMessage: loaded.errorMessage || `Failed to open artifact '${requestedId}'.`,
      });
    }
    const state = loaded.state;

    let matchedEntry: ArtifactEntry | undefined;
    for (const entry of this.artifacts.values()) {
      if (entry.artifactId && UUIDsEqual(entry.artifactId, state.artifactId)) {
        matchedEntry = entry;
        break;
      }
    }

    if (matchedEntry) {
      matchedEntry.ownerUserId = state.ownerUserId;
      matchedEntry.versionId = state.versionId;
      matchedEntry.versionNumber = state.versionNumber;
      matchedEntry.baseVersionNumber = state.versionNumber;
      matchedEntry.currentVersionNumber = state.versionNumber;
      matchedEntry.contentMode = state.contentMode;
      matchedEntry.originalXlsxBytes = state.originalXlsxBytes;
      matchedEntry.content = state.content;
      matchedEntry.configuration = state.configuration;
      matchedEntry.driverClass = state.driverClass;
      matchedEntry.toolLibraryClass = state.toolLibraryClass;
    } else {
      const alphaId = this.RegisterArtifact({
        name: state.name,
        typeName: state.typeName,
        artifactId: state.artifactId,
        versionId: state.versionId,
        versionNumber: state.versionNumber,
        description: state.description,
        mimeType: state.mimeType,
        toolLibraryClass: state.toolLibraryClass,
        content: state.content,
      });
      matchedEntry = this.artifacts.get(alphaId);
      if (matchedEntry) {
        matchedEntry.ownerUserId = state.ownerUserId;
        matchedEntry.contentMode = state.contentMode;
        matchedEntry.originalXlsxBytes = state.originalXlsxBytes;
        matchedEntry.configuration = state.configuration;
        matchedEntry.driverClass = state.driverClass;
      }
    }

    const activeRunId = this.agentRunId ?? this.getAgentRun?.()?.ID;
    const activeAgentName = this.agentName ?? this.getAgentRun?.()?.Agent ?? undefined;
    this.enteredPresenceArtifactIds.add(state.artifactId);
    await GovernedArtifactService.Instance.EmitAgentPresence({
      artifactId: state.artifactId,
      phase: 'enter',
      contextUser: this.contextUser,
      agentRunId: activeRunId,
      agentName: activeAgentName,
      toolName: 'open_artifact',
      actionSummary: `Opened "${state.name}"`,
      location: { Domain: ResolvePresenceDomain(state.typeName) },
    });

    return this.recordToolResult(call, startedAt, {
      success: true,
      data: {
        alphaId: matchedEntry?.alphaId,
        artifactId: state.artifactId,
        versionId: state.versionId,
        versionNumber: state.versionNumber,
        name: state.name,
        typeName: state.typeName,
        driverClass: state.driverClass,
        canEdit: state.permissions.CanEdit,
        liveRoomHydrated: state.liveRoomHydrated,
        availableTools: matchedEntry?.library.GetToolList().map((t) => t.name) ?? [],
      },
    });
  }

  private async checkCollectionPermission(
    collectionId: string,
    required: 'read' | 'edit',
  ): Promise<{ allowed: boolean; environmentId?: string | null; reason?: string }> {
    if (!this.provider || !this.contextUser) {
      return IsValidUUID(collectionId.trim())
        ? { allowed: true }
        : { allowed: false, reason: `Invalid collectionId UUID '${collectionId}'.` };
    }
    return GovernedArtifactService.Instance.CheckCollectionPermission(
      this.provider,
      this.contextUser,
      collectionId,
      required,
    );
  }

  private entryToSynthesisSourceInput(entry: ArtifactEntry): ArtifactSynthesisSourceInput {
    return {
      ArtifactID: entry.artifactId || entry.alphaId,
      Name: entry.name,
      ArtifactType: entry.typeName,
      VersionNumber: entry.currentVersionNumber ?? entry.versionNumber,
      ContentMode: entry.contentMode,
      Content: Buffer.isBuffer(entry.content) ? null : String(entry.content ?? ''),
      Configuration: entry.configuration ?? null,
      Description: entry.description ?? null,
      MimeType: entry.mimeType ?? null,
    };
  }

  private async loadExternalReadableArtifact(
    artifactId: string,
  ): Promise<{ source?: ArtifactSynthesisSourceInput; environmentId?: string | null; errorMessage?: string }> {
    if (!this.provider || !this.contextUser) {
      return { errorMessage: `Unknown source artifact '${artifactId}' (no database provider available).` };
    }

    const loaded = await GovernedArtifactService.Instance.LoadReadableArtifactState(
      this.provider,
      this.contextUser,
      artifactId,
    );
    if (!loaded.state) {
      return { errorMessage: loaded.errorMessage || `Source artifact '${artifactId}' was not found.` };
    }

    const state = loaded.state;
    return {
      environmentId: state.environmentId ?? null,
      source: {
        ArtifactID: state.artifactId,
        Name: state.name,
        ArtifactType: state.typeName,
        VersionNumber: state.versionNumber,
        ContentMode: state.contentMode,
        Content: Buffer.isBuffer(state.content) ? null : state.content,
        Configuration: state.configuration ?? null,
        Description: state.description ?? null,
        MimeType: state.mimeType ?? null,
      },
    };
  }

  private async handleListWorkspaceArtifactsTool(
    call: ArtifactToolCall,
    startedAt: number,
  ): Promise<StoredToolResult> {
    const input = call.input ?? {};
    const rawTypeFilter = typeof input['typeFilter'] === 'string' ? input['typeFilter'].trim() : '';
    const typeFilter = rawTypeFilter.toLowerCase();
    const normalizedTypeFilter = typeFilter
      ? GovernedArtifactService.Instance.NormalizeArtifactTypeName(rawTypeFilter).toLowerCase()
      : '';
    const rawSearch = typeof input['search'] === 'string' ? input['search'].trim() : '';
    const search = rawSearch.toLowerCase();
    const collectionId = typeof input['collectionId'] === 'string' ? input['collectionId'].trim() : '';
    const maxResults =
      typeof input['maxResults'] === 'number' && Number.isFinite(input['maxResults'])
        ? Math.min(Math.max(Math.trunc(input['maxResults']), 1), 100)
        : 25;

    const items: Array<{
      alphaId?: string;
      artifactId?: string;
      name: string;
      typeName: string;
      versionNumber?: number;
      sections: string[];
      embeddedCharts: ArtifactSynthesisSourceDigest['EmbeddedCharts'];
      summaryPreview: string;
    }> = [];
    const seenArtifactIds = new Set<string>();
    const includedEntries: ArtifactEntry[] = [];

    for (const entry of this.artifacts.values()) {
      if (entry.artifactId && this.contextUser && this.provider) {
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
          this.provider,
          entry.artifactId,
          this.contextUser,
        );
        if (!perms.CanRead) continue;
      }
      const entryTypeLower = entry.typeName.toLowerCase();
      if (typeFilter && !entryTypeLower.includes(typeFilter) && entryTypeLower !== normalizedTypeFilter) continue;
      if (search && !entry.name.toLowerCase().includes(search)) continue;

      const digest = ArtifactSynthesisEngine.Instance.ExtractSourceDigest(
        this.entryToSynthesisSourceInput(entry),
        1200,
      );
      if (entry.artifactId) {
        seenArtifactIds.add(NormalizeUUID(entry.artifactId));
      }
      includedEntries.push(entry);
      items.push({
        alphaId: entry.alphaId,
        artifactId: entry.artifactId,
        name: entry.name,
        typeName: entry.typeName,
        versionNumber: entry.currentVersionNumber ?? entry.versionNumber,
        sections: digest.Sections,
        embeddedCharts: digest.EmbeddedCharts,
        summaryPreview: digest.SummaryText.slice(0, 400),
      });
    }

    if (this.provider && this.contextUser) {
      const dbResult = await GovernedArtifactService.Instance.ListWorkspaceArtifacts({
        provider: this.provider,
        contextUser: this.contextUser,
        collectionId: collectionId || undefined,
        typeFilter: rawTypeFilter || undefined,
        search: rawSearch || undefined,
        maxResults,
      });
      if (!dbResult.success) {
        return this.recordToolResult(call, startedAt, {
          success: false,
          data: null,
          errorMessage: dbResult.errorMessage || 'Permission denied reading workspace artifacts.',
        });
      }
      for (const dbItem of dbResult.artifacts) {
        if (items.length >= maxResults) break;
        const normId = NormalizeUUID(dbItem.artifactId);
        if (seenArtifactIds.has(normId)) continue;
        seenArtifactIds.add(normId);
        items.push({
          artifactId: dbItem.artifactId,
          name: dbItem.name,
          typeName: dbItem.typeName,
          versionNumber: dbItem.versionNumber,
          sections: dbItem.sections,
          embeddedCharts: dbItem.embeddedCharts,
          summaryPreview: dbItem.summaryPreview,
        });
      }
    }

    return this.recordToolResult(
      call,
      startedAt,
      {
        success: true,
        data: {
          count: items.length,
          artifacts: items,
        },
      },
      this.mergeEntriesTrust(includedEntries),
    );
  }

  private async handleCreateSynthesizedArtifactTool(
    call: ArtifactToolCall,
    startedAt: number,
  ): Promise<StoredToolResult> {
    const input = call.input ?? {};
    const targetKind = ArtifactSynthesisEngine.Instance.NormalizeTargetKind(
      typeof input['targetKind'] === 'string' ? input['targetKind'] : 'presentation',
    );
    const title =
      typeof input['title'] === 'string' && input['title'].trim()
        ? input['title'].trim()
        : `Synthesized ${targetKind === 'presentation' ? 'Presentation' : targetKind === 'spreadsheet' ? 'Spreadsheet' : 'Document'}`;
    const goal = typeof input['goal'] === 'string' ? input['goal'].trim() : '';
    const customDescription =
      typeof input['description'] === 'string' && input['description'].trim()
        ? input['description'].trim()
        : '';
    const linkChartsAndRanges = input['linkChartsAndRanges'] !== false;
    const collectionId = typeof input['collectionId'] === 'string' ? input['collectionId'].trim() : '';

    if (collectionId) {
      const colCheck = await this.checkCollectionPermission(collectionId, 'edit');
      if (!colCheck.allowed) {
        return this.recordToolResult(call, startedAt, {
          success: false,
          data: null,
          errorMessage: colCheck.reason || 'Permission denied: cannot link artifact into collection.',
        });
      }
    }

    const requestedIdsRaw = Array.isArray(input['sourceArtifactIds'])
      ? input['sourceArtifactIds'].filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : typeof input['sourceArtifactIds'] === 'string' && input['sourceArtifactIds'].trim().length > 0
        ? [input['sourceArtifactIds'].trim()]
        : [];

    const sourceInputs: ArtifactSynthesisSourceInput[] = [];
    const seenIds = new Set<string>();
    const includedEntries: ArtifactEntry[] = [];
    let resolvedEnvironmentId: string | null = null;

    if (requestedIdsRaw.length > 0) {
      const entriesByArtifactId = IndexByUUID(
        Array.from(this.artifacts.values()).filter((e): e is ArtifactEntry & { artifactId: string } => Boolean(e.artifactId)),
        (e) => e.artifactId,
      );
      for (const rawRef of requestedIdsRaw) {
        const ref = rawRef.trim();
        const byAlpha = this.artifacts.get(ref) ?? this.artifacts.get(ref.toUpperCase());
        const matchedEntry = byAlpha ?? entriesByArtifactId.Get(ref);

        if (matchedEntry) {
          if (matchedEntry.artifactId && this.contextUser && this.provider) {
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
              this.provider,
              matchedEntry.artifactId,
              this.contextUser,
            );
            if (!perms.CanRead) {
              return this.recordToolResult(call, startedAt, {
                success: false,
                data: null,
                errorMessage: `Permission denied: user lacks Read access to source artifact '${matchedEntry.name}'.`,
              });
            }
          }
          const srcInput = this.entryToSynthesisSourceInput(matchedEntry);
          const dedupKey = srcInput.ArtifactID.toLowerCase();
          if (!seenIds.has(dedupKey)) {
            seenIds.add(dedupKey);
            sourceInputs.push(srcInput);
            includedEntries.push(matchedEntry);
          }
        } else {
          const loaded = await this.loadExternalReadableArtifact(ref);
          if (!loaded.source) {
            return this.recordToolResult(call, startedAt, {
              success: false,
              data: null,
              errorMessage: loaded.errorMessage || `Unable to access source artifact '${ref}'.`,
            });
          }
          if (!resolvedEnvironmentId && loaded.environmentId) {
            resolvedEnvironmentId = loaded.environmentId;
          }
          const dedupKey = loaded.source.ArtifactID.toLowerCase();
          if (!seenIds.has(dedupKey)) {
            seenIds.add(dedupKey);
            sourceInputs.push(loaded.source);
          }
        }
      }
    } else {
      for (const entry of this.artifacts.values()) {
        if (entry.artifactId && this.contextUser && this.provider) {
          const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            this.provider,
            entry.artifactId,
            this.contextUser,
          );
          if (!perms.CanRead) continue;
        }
        const srcInput = this.entryToSynthesisSourceInput(entry);
        const dedupKey = srcInput.ArtifactID.toLowerCase();
        if (!seenIds.has(dedupKey)) {
          seenIds.add(dedupKey);
          sourceInputs.push(srcInput);
          includedEntries.push(entry);
        }
      }
    }

    const inheritedTrust = this.resolveCreationTrust(includedEntries);
    const digests: ReturnType<typeof ArtifactSynthesisEngine.Instance.ExtractSourceDigest>[] = [];
    for (let i = 0; i < sourceInputs.length; i += 4) {
      const batch = await Promise.all(
        sourceInputs.slice(i, i + 4).map((s) => ArtifactSynthesisEngine.Instance.ExtractSourceDigestIsolated(s)),
      );
      digests.push(...batch);
    }
    const allowedIds = digests.map((d) => d.ArtifactID);
    const availableCharts = digests.flatMap((d) => d.EmbeddedCharts);

    const rawContentInput = input['content'];
    const rawContentStr =
      typeof rawContentInput === 'string'
        ? rawContentInput.trim()
        : rawContentInput && typeof rawContentInput === 'object'
          ? JSON.stringify(rawContentInput)
          : '';

    if (!rawContentStr && digests.length === 0) {
      return this.recordToolResult(call, startedAt, {
        success: false,
        data: null,
        errorMessage: 'No authorized source artifacts or content were provided for synthesis.',
      });
    }

    const normalized = rawContentStr
      ? await ArtifactSynthesisEngine.Instance.NormalizeSynthesizedOutputIsolated({
          TargetKind: targetKind,
          RawOutput: rawContentStr,
          FallbackTitle: title,
          AllowedSourceArtifactIds: allowedIds,
          AvailableChartRefs: availableCharts,
        })
      : ArtifactSynthesisEngine.Instance.BuildDeterministicFallbackSynthesis(
          digests,
          targetKind,
          title,
          goal,
          linkChartsAndRanges,
        );

    const finalDescription = customDescription || normalized.Description;
    let persistedArtifactId: string | undefined;
    let persistedVersionId: string | undefined;
    let persistedDriverClass: string | undefined;
    let persisted = false;

    if (this.provider && this.contextUser) {
      if (!resolvedEnvironmentId && digests[0]?.ArtifactID && IsValidUUID(digests[0].ArtifactID)) {
        const srcCheck = await this.loadExternalReadableArtifact(digests[0].ArtifactID);
        resolvedEnvironmentId = srcCheck.environmentId ?? null;
      }

      const activeRunId = this.agentRunId ?? this.getAgentRun?.()?.ID;
      const activeAgentName = this.agentName ?? this.getAgentRun?.()?.Agent ?? undefined;
      const synthComments = activeAgentName
        ? `Synthesized by ${activeAgentName} from ${digests.length} artifact(s)`
        : `Synthesized via create_synthesized_artifact from ${digests.length} artifact(s)`;

      const outcome = await GovernedArtifactService.Instance.CreateGovernedArtifact({
        provider: this.provider,
        contextUser: this.contextUser,
        title: normalized.Title,
        artifactType: normalized.ArtifactTypeName,
        description: finalDescription,
        content: normalized.Content,
        collectionId,
        environmentId: resolvedEnvironmentId ?? undefined,
        agentRunId: activeRunId,
        agentName: activeAgentName,
        additionalConfig: { synthesizedFromArtifactIds: allowedIds },
        comments: synthComments,
      });
      if (!outcome.success || !outcome.artifactId) {
        return this.recordToolResult(call, startedAt, {
          success: false,
          data: null,
          errorMessage: outcome.errorMessage || 'Failed to create synthesized artifact.',
        });
      }

      persistedArtifactId = outcome.artifactId;
      persistedVersionId = outcome.versionId;
      persistedDriverClass = outcome.driverClass;
      persisted = true;
    }

    const newAlphaId = this.RegisterArtifact({
      name: normalized.Title,
      typeName: normalized.ArtifactTypeName,
      artifactId: persistedArtifactId,
      versionId: persistedVersionId,
      versionNumber: 1,
      description: finalDescription,
      content: normalized.Content,
      ...inheritedTrust,
    });
    if (persistedDriverClass) {
      const registeredEntry = this.artifacts.get(newAlphaId);
      if (registeredEntry) {
        registeredEntry.driverClass = persistedDriverClass;
      }
    }
    if (persistedArtifactId) {
      const synthRunId = this.agentRunId ?? this.getAgentRun?.()?.ID;
      const synthType = ArtifactMetadataEngine.Instance.FindArtifactType(normalized.ArtifactTypeName);
      const summary: GovernedRunArtifactSummary = {
        ArtifactID: persistedArtifactId,
        ArtifactVersionID: persistedVersionId ?? '',
        VersionNumber: 1,
        Name: normalized.Title,
        ArtifactTypeName: normalized.ArtifactTypeName,
        DriverClass: persistedDriverClass ?? synthType?.DriverClass ?? undefined,
        Operation: 'synthesized',
      };
      this.recordTouchedArtifactSummary(summary);
      GovernedArtifactService.Instance.RecordTouchedArtifact(synthRunId, summary);
    }

    return this.recordToolResult(
      call,
      startedAt,
      {
        success: true,
        data: {
          alphaId: newAlphaId,
          artifactId: persistedArtifactId ?? newAlphaId,
          versionId: persistedVersionId,
          versionNumber: 1,
          title: normalized.Title,
          artifactTypeName: normalized.ArtifactTypeName,
          targetKind: normalized.TargetKind,
          linkedChartCount: normalized.LinkedChartCount,
          sourceCount: digests.length,
          persisted,
          warnings: normalized.Warnings,
        },
      },
      inheritedTrust,
    );
  }

  private async handleRefreshAndSnapshotArtifactTool(
    call: ArtifactToolCall,
    startedAt: number,
  ): Promise<StoredToolResult> {
    if (!this.provider || !this.contextUser) {
      return this.recordToolResult(call, startedAt, {
        success: false,
        data: null,
        errorMessage: 'refresh_and_snapshot_artifact requires provider and contextUser.',
      });
    }
    const input = call.input ?? {};
    const targetRef =
      typeof input['targetArtifactId'] === 'string' && input['targetArtifactId'].trim()
        ? input['targetArtifactId'].trim()
        : typeof input['artifactId'] === 'string' && input['artifactId'].trim()
          ? input['artifactId'].trim()
          : (call.artifactId ?? '').trim();

    let resolvedArtifactId = targetRef;
    if (!IsValidUUID(resolvedArtifactId)) {
      const matchedEntry = this.resolveExistingArtifactEntry(targetRef);
      if (matchedEntry?.artifactId && IsValidUUID(matchedEntry.artifactId)) {
        resolvedArtifactId = matchedEntry.artifactId;
      }
    }
    if (!IsValidUUID(resolvedArtifactId)) {
      return this.recordToolResult(call, startedAt, {
        success: false,
        data: null,
        errorMessage: `refresh_and_snapshot_artifact requires a valid targetArtifactId (UUID or loaded artifact alpha ID), received '${targetRef}'.`,
      });
    }

    const modeRaw = typeof input['mode'] === 'string' ? input['mode'].trim().toLowerCase() : 'live_refresh';
    const freezeRefreshedBlocks =
      modeRaw === 'freeze_all_blocks' || input['freezeRefreshedBlocks'] === true;
    if (freezeRefreshedBlocks && !this.allowFreezeFromUserConfirmation) {
      return this.recordToolResult(call, startedAt, {
        success: false,
        data: null,
        errorMessage:
          'Permission denied: agents cannot freeze live artifact blocks without explicit out-of-band user confirmation of the RLS/FLS snapshot security warning.',
      });
    }
    const skipIfUnchanged = input['skipIfUnchanged'] !== false;
    const forceRefreshFrozen = input['forceRefreshFrozen'] === true;
    const versionComments =
      typeof input['versionComment'] === 'string'
        ? input['versionComment'].trim()
        : typeof input['versionComments'] === 'string'
          ? input['versionComments'].trim()
          : undefined;

    const activeRunId = this.agentRunId ?? this.getAgentRun?.()?.ID;
    const activeAgentName = this.agentName ?? this.getAgentRun?.()?.Agent ?? undefined;

    const outcome = await GovernedArtifactService.Instance.RefreshAndSnapshotArtifact({
      provider: this.provider,
      contextUser: this.contextUser,
      artifactId: resolvedArtifactId,
      freezeRefreshedBlocks,
      forceSaveIfUnchanged: !skipIfUnchanged,
      forceRefreshFrozen,
      versionComments,
      agentRunId: activeRunId,
      agentName: activeAgentName,
    });

    if (!outcome.success) {
      return this.recordToolResult(call, startedAt, {
        success: false,
        data: null,
        errorMessage: outcome.errorMessage || outcome.message,
      });
    }

    // Keep loaded session entry synchronized if open in this ArtifactToolManager
    const openEntry = this.resolveExistingArtifactEntry(resolvedArtifactId);
    if (openEntry && outcome.changed && this.contextUser && this.provider) {
      await this.reloadArtifactFromDatabase(openEntry);
    }

    if (outcome.changed && outcome.versionId) {
      const touchedSummary: GovernedRunArtifactSummary = {
        ArtifactID: outcome.artifactId,
        ArtifactVersionID: outcome.versionId,
        VersionNumber: outcome.versionNumber ?? 1,
        Name: outcome.artifactName ?? 'Artifact',
        ArtifactTypeName: outcome.artifactTypeName ?? 'Document',
        DriverClass: outcome.driverClass,
        Operation: 'mutated',
      };
      this.recordTouchedArtifactSummary(touchedSummary);
      GovernedArtifactService.Instance.RecordTouchedArtifact(activeRunId, touchedSummary);
    }

    return this.recordToolResult(call, startedAt, {
      success: true,
      data: {
        changed: outcome.changed,
        resultCode: outcome.resultCode,
        artifactId: outcome.artifactId,
        versionId: outcome.versionId ?? null,
        versionNumber: outcome.versionNumber ?? null,
        diffSummary: outcome.diffSummary ?? outcome.message,
        signedFrozenBlocksCount: outcome.signedFrozenBlocksCount ?? 0,
      },
    });
  }

  private async handleFollowSourceLinkRuntime(
    rawData: ArtifactToolArgs,
    activeRunId: string | undefined,
  ): Promise<ArtifactToolResult> {
    const entityName = typeof rawData['entityName'] === 'string' ? rawData['entityName'].trim() : '';
    const recordId = typeof rawData['recordId'] === 'string' ? rawData['recordId'].trim() : '';
    if (!entityName || !recordId) {
      return {
        success: false,
        data: null,
        errorMessage: 'follow_source_link result is missing entityName or recordId.',
      };
    }

    if (!this.provider || !this.contextUser) {
      return {
        success: true,
        data: {
          ...rawData,
          rlsVerified: false,
        },
      };
    }

    try {
      const rv = RunView.FromMetadataProvider(this.provider);
      const entityInfo =
        typeof this.provider.EntityByName === 'function' ? this.provider.EntityByName(entityName) : undefined;
      let idCondition: string;
      if (entityInfo && Array.isArray(entityInfo.PrimaryKeys) && entityInfo.PrimaryKeys.length > 0) {
        idCondition = CompositeKey.FromURLSegment(entityInfo, recordId).ToWhereClause();
      } else {
        const pkFieldName = entityInfo?.FirstPrimaryKey?.Name?.trim() || 'ID'; // first-pk-ok: fallback when provider/mock lacks EntityInfo.PrimaryKeys[]
        const quotedPk = /^[A-Za-z_][A-Za-z0-9_]*$/.test(pkFieldName) ? pkFieldName : `[${pkFieldName}]`;
        idCondition = `${quotedPk}='${EscapeSQLString(recordId)}'`;
      }
      const res = await rv.RunView<{ [field: string]: ArtifactJsonValue }>(
        {
          EntityName: entityName,
          ExtraFilter: idCondition,
          MaxRows: 1,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        this.contextUser,
      );
      if (!res.Success) {
        return {
          success: false,
          data: null,
          errorMessage: `RLS verification failed for ${entityName}.${recordId}: ${res.ErrorMessage || 'query error'}`,
        };
      }
      if (!res.Results || res.Results.length === 0) {
        return {
          success: false,
          data: null,
          errorMessage: `Access denied or record not found for ${entityName} (${recordId}).`,
        };
      }

      const recordPayload = res.Results[0];
      const serializedRecord = JSON.stringify(recordPayload, null, 2);
      const registeredAlphaId = this.RegisterArtifact({
        name: `${entityName}: ${recordId.slice(0, 8)}`,
        typeName: 'JSON',
        content: serializedRecord,
        description: `Source record ${entityName} (${recordId}) opened via follow_source_link${activeRunId ? ` [run ${activeRunId}]` : ''}`,
      });

      return {
        success: true,
        data: {
          rowId: rawData['rowId'] ?? null,
          entityName,
          recordId,
          rlsVerified: true,
          registeredAlphaId,
          record: recordPayload,
        },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        errorMessage: `follow_source_link failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async handleRerankRuntime(
    entry: ArtifactEntry,
    rawData: ArtifactToolArgs,
    activeRunId: string | undefined,
  ): Promise<ArtifactToolResult> {
    if (!this.contextUser) {
      return {
        success: true,
        data: {
          ...rawData,
          reranked: false,
          note: 'Rerank deferred: no ContextUser is configured in ArtifactToolManager.',
        },
      };
    }

    const rawContent = typeof entry.content === 'string' ? entry.content : '';
    const parsedSpec = CleanAndParseJSON<{
      Query?: string;
      Reranker?: string | null;
      Results?: Array<{
        AlphaID: string;
        Title?: string;
        Snippet?: string;
        Chunk?: string;
        Score: number;
      }>;
    }>(rawContent);
    const results = Array.isArray(parsedSpec?.Results) ? parsedSpec.Results : [];
    if (results.length === 0) {
      return {
        success: true,
        data: { ...rawData, reranked: false, count: 0 },
      };
    }

    const queryText = (parsedSpec?.Query ?? '').trim() || entry.name;
    const documents = results.map((r, idx) => ({
      id: r.AlphaID || String(idx),
      text: (r.Chunk ?? r.Snippet ?? r.Title ?? '').slice(0, 4000),
      metadata: { alphaId: r.AlphaID },
    }));

    const rerankerName = typeof rawData['rerankerName'] === 'string' ? rawData['rerankerName'].trim() : '';
    let resolvedModelId: string | undefined;
    let resolvedPromptId: string | undefined;
    if (rerankerName) {
      if (IsValidUUID(rerankerName)) {
        const byModelId = AIEngine.Instance.ModelsByID?.get(NormalizeUUID(rerankerName));
        if (byModelId) {
          resolvedModelId = byModelId.ID;
        } else {
          const byPromptId = (AIEngine.Instance.Prompts ?? []).find((p) => UUIDsEqual(p.ID, rerankerName));
          if (byPromptId) {
            resolvedPromptId = byPromptId.ID;
          }
        }
      } else {
        const targetLower = rerankerName.toLowerCase();
        const models = AIEngine.Instance.Models ?? [];
        const matchedModel =
          models.find(
            (m) =>
              (m.Name?.trim().toLowerCase() === targetLower || m.APIName?.trim().toLowerCase() === targetLower) &&
              (m.AIModelType?.trim().toLowerCase() === 'reranker' || targetLower.includes('rerank')),
          ) ??
          models.find(
            (m) => m.Name?.trim().toLowerCase() === targetLower || m.APIName?.trim().toLowerCase() === targetLower,
          );
        if (matchedModel) {
          resolvedModelId = matchedModel.ID;
        } else {
          const matchedPrompt = (AIEngine.Instance.Prompts ?? []).find(
            (p) => p.Name?.trim().toLowerCase() === targetLower,
          );
          if (matchedPrompt) {
            resolvedPromptId = matchedPrompt.ID;
          }
        }
      }
    }
    const runner = new AIRerankerRunner();
    const rerankOutcome = await runner.RunRerank({
      query: queryText,
      documents,
      topK: documents.length,
      ContextUser: this.contextUser,
      AgentRunID: activeRunId,
      ...(resolvedModelId ? { ModelID: resolvedModelId } : {}),
      ...(resolvedPromptId ? { PromptID: resolvedPromptId } : {}),
      ...(rerankerName ? { options: { rerankerName } } : {}),
    });

    if (!rerankOutcome.Success || !rerankOutcome.Response?.results) {
      return {
        success: false,
        data: null,
        errorMessage: rerankOutcome.ErrorMessage || `Reranker '${rerankerName || 'default'}' failed to rank results.`,
      };
    }

    const scoreById = new Map<string, number>();
    const rankOrder: string[] = [];
    for (const item of rerankOutcome.Response.results) {
      const id = item.id;
      if (!scoreById.has(id)) {
        scoreById.set(id, item.relevanceScore);
        rankOrder.push(id);
      }
    }

    const byAlpha = new Map(results.map((r) => [r.AlphaID, r]));
    const reordered: typeof results = [];
    for (const id of rankOrder) {
      const row = byAlpha.get(id);
      if (row) {
        reordered.push({ ...row, Score: scoreById.get(id) ?? row.Score });
        byAlpha.delete(id);
      }
    }
    for (const leftover of byAlpha.values()) {
      reordered.push(leftover);
    }

    entry.content = JSON.stringify({
      ...parsedSpec,
      Reranker: rerankOutcome.ModelName ?? (rerankerName || parsedSpec?.Reranker || null),
      Results: reordered,
    });

    return {
      success: true,
      data: {
        reranked: true,
        rerankerName: rerankOutcome.ModelName ?? rerankerName,
        promptRunId: rerankOutcome.PromptRunID ?? null,
        newOrder: reordered.map((r) => r.AlphaID),
        count: reordered.length,
      },
    };
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

  private resolveLibrary(typeName: string, toolLibraryClass?: string): ArtifactToolLibraryWithRevisionHash {
    return GovernedArtifactService.Instance.ResolveLibrary(typeName, toolLibraryClass);
  }

  /**
   * Resolves the highest-severity trust boundary across source artifacts so cross-artifact tools
   * (`list_workspace_artifacts`, `create_synthesized_artifact`) preserve taint instead of laundering
   * `'Untrusted'` / `'SemiTrusted'` data into `'Trusted'` outputs.
   */
  private mergeEntriesTrust(entries: Iterable<ArtifactEntry>): {
    trustLevel?: ArtifactEntry['trustLevel'];
    sourceName?: string;
  } {
    let highest: ArtifactEntry['trustLevel'] | undefined;
    let sourceName: string | undefined;
    for (const entry of entries) {
      if (entry.trustLevel === 'Untrusted') {
        return {
          trustLevel: 'Untrusted',
          ...(entry.sourceName
            ? { sourceName: entry.sourceName }
            : entry.name
              ? { sourceName: `artifact:${entry.name}` }
              : {}),
        };
      }
      if (entry.trustLevel === 'SemiTrusted' && highest == null) {
        highest = 'SemiTrusted';
        sourceName = entry.sourceName ?? (entry.name ? `artifact:${entry.name}` : undefined);
      }
    }
    if (!highest) {
      return {};
    }
    return {
      trustLevel: highest,
      ...(sourceName ? { sourceName } : {}),
    };
  }

  private resolveCreationTrust(sourceEntries?: Iterable<ArtifactEntry>): {
    trustLevel?: ArtifactEntry['trustLevel'];
    sourceName?: string;
  } {
    const fromEntries = sourceEntries ? this.mergeEntriesTrust(sourceEntries) : {};
    const runTaint = this.getRunTaint?.();
    if (!runTaint || fromEntries.trustLevel === 'Untrusted') {
      return fromEntries;
    }
    if (runTaint.TrustLevel === 'Untrusted') {
      return { trustLevel: 'Untrusted', sourceName: runTaint.SourceName };
    }
    return fromEntries.trustLevel === 'SemiTrusted'
      ? fromEntries
      : { trustLevel: 'SemiTrusted', sourceName: runTaint.SourceName };
  }

  private withEntryTrust(
    entry: Pick<ArtifactEntry, 'trustLevel' | 'sourceName'> | undefined,
    stored: StoredToolResult,
  ): StoredToolResult {
    if (entry?.trustLevel) {
      stored.trustLevel = entry.trustLevel;
    }
    if (entry?.sourceName) {
      stored.sourceName = entry.sourceName;
    }
    return stored;
  }
}
