import { createHash } from 'node:crypto';
import {
  BaseSingleton,
  CleanAndParseJSON,
  EscapeSQLString,
  GetGlobalObjectStore,
  IndexByUUID,
  IsValidUUID,
  MJEventType,
  MJGlobal,
  MJLruCache,
  NormalizeUUID,
  UUIDsEqual,
} from '@memberjunction/global';
import { IMetadataProvider, LogError, RunView, UserInfo } from '@memberjunction/core';
import {
  ArtifactMetadataEngine,
  ArtifactPermissionEngine,
  ArtifactPreviewSnapshot,
  ArtifactSynthesisEngine,
  BuildArtifactPreviewSnapshot,
  BuildArtifactVersionConfigurationWithPreview,
  DocumentBlockExecutionResult,
  DocumentLiveBlockEngine,
  MJArtifactEntity,
  MJArtifactTypeEntity,
  MJArtifactVersionEntity,
  MJCollectionArtifactEntity,
  MJConversationDetailEntity,
  MJConversationEntity,
  MJEnvironmentEntityExtended,
  MJFileEntity,
  ParseArtifactVersionConfiguration,
  ParseRangeAddress,
  SlideDeckEngine,
  SlideDeckSpec,
  SpreadsheetEngine,
  ValidateArtifactContentMutationAgainstLocks,
  WorkbookSpec,
  XlsxOpenXmlAdapter,
} from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';
import {
  ArtifactJsonValue,
  ArtifactToolArgs,
  ArtifactToolDefinition,
  ArtifactToolExecutionContext,
  ArtifactToolResult,
  BaseArtifactToolLibrary,
  GovernedRunArtifactSummary,
} from '@memberjunction/ai-core-plus';
import {
  ARTIFACT_LIVE_MUTATION_EVENT_CODE,
  ArtifactAgentPresencePhase,
  ArtifactAgentTargetLocation,
  ArtifactLiveMutationHookResult,
  ExtractAgentTargetLocation,
  FormatAgentActionSummary,
  GetArtifactAgentPresenceHook,
  GetArtifactLiveContentReaderHook,
  GetArtifactLiveMutationHook,
  MUTATING_ARTIFACT_TOOL_NAMES,
  ResolvePresenceDomain,
} from './artifact-presence-locator';
import { CSVToolLibrary } from './artifact-tools/CSVToolLibrary';
import { DataSnapshotToolLibrary } from './artifact-tools/DataSnapshotToolLibrary';
import { DocumentToolLibrary } from './artifact-tools/DocumentToolLibrary';
import { DocxToolLibrary } from './artifact-tools/DocxToolLibrary';
import { JSONToolLibrary } from './artifact-tools/JSONToolLibrary';
import { PDFToolLibrary } from './artifact-tools/PDFToolLibrary';
import { SearchResultSetToolLibrary } from './artifact-tools/SearchResultSetToolLibrary';
import { SlideDeckToolLibrary } from './artifact-tools/SlideDeckToolLibrary';
import { SpreadsheetToolLibrary } from './artifact-tools/SpreadsheetToolLibrary';
import { TextToolLibrary } from './artifact-tools/TextToolLibrary';
import { WhiteboardToolLibrary } from './artifact-tools/WhiteboardToolLibrary';

const GOVERNED_ARTIFACT_LOCKS_STORE_KEY = '___MJ_GOVERNED_ARTIFACT_LOCKS___';

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MARKDOWN_MIME_TYPE = 'text/markdown';
const PRESENTATION_MIME_TYPE = 'application/vnd.mj.presentation+json';
const SPREADSHEET_JSON_MIME_TYPE = 'application/vnd.mj.spreadsheet+json';

/**
 * Spreadsheet tools that alter workbook structure, sheet order, or sheet layout rather than
 * cell values/formulas. Refused on `File`-mode `.xlsx` workbooks because `PatchXlsxBytes`
 * preserves non-`<sheetData>` OpenXML parts in-place instead of regenerating `workbook.xml`
 * or worksheet layout XML.
 */
export const STRUCTURAL_SPREADSHEET_TOOLS: ReadonlySet<string> = new Set([
  'insert_rows',
  'delete_rows',
  'insert_columns',
  'delete_columns',
  'add_sheet',
  'delete_sheet',
  'rename_sheet',
  'duplicate_sheet',
  'reorder_sheets',
  'set_sheet_layout',
  'merge_cells',
  'unmerge_cells',
]);

/** Formats the shared refusal message for structural spreadsheet tools on `File`-mode `.xlsx` workbooks. */
export function FormatFileModeStructuralToolError(toolName: string): string {
  return `Structural spreadsheet tool "${toolName}" is not supported on File-mode .xlsx workbooks to preserve OpenXML fidelity. Only cell value/formula updates (e.g. write_cells) are allowed on uploaded .xlsx files.`;
}

/**
 * Merges two {@link GovernedRunArtifactSummary} records for the same artifact, keeping the
 * higher `VersionNumber` snapshot while preserving `Operation: 'created'` if either entry
 * created the artifact during the run.
 */
export function MergeTouchedArtifactSummary(
  existing: GovernedRunArtifactSummary | undefined,
  incoming: GovernedRunArtifactSummary,
): GovernedRunArtifactSummary {
  if (!existing) {
    return { ...incoming };
  }
  const winner = incoming.VersionNumber >= existing.VersionNumber ? incoming : existing;
  const other = winner === incoming ? existing : incoming;
  return {
    ...other,
    ...winner,
    DriverClass: winner.DriverClass ?? other.DriverClass,
    Operation:
      existing.Operation === 'created' || incoming.Operation === 'created'
        ? 'created'
        : winner.Operation,
  };
}

export interface ArtifactToolLibraryWithRevisionHash extends BaseArtifactToolLibrary {
  ComputeRevisionHash?(content: string): string;
}

/**
 * Merges tool libraries from an artifact type's inheritance chain (leaf-first).
 */
export class CompositeArtifactToolLibrary extends BaseArtifactToolLibrary {
  constructor(private readonly chain: BaseArtifactToolLibrary[]) {
    super();
  }

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
    input: ArtifactToolArgs,
    artifactContent: string | Buffer,
    context?: ArtifactToolExecutionContext,
  ): Promise<ArtifactToolResult> {
    for (const lib of this.chain) {
      if (lib.GetToolList().some((t) => t.name === toolName)) {
        return lib.InvokeTool(toolName, input, artifactContent, context);
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

  protected getSubclassToolList(): ArtifactToolDefinition[] {
    return [];
  }

  protected async invokeSubclassTool(): Promise<ArtifactToolResult> {
    return { success: false, data: null, errorMessage: 'CompositeArtifactToolLibrary does not dispatch via invokeSubclassTool.' };
  }
}

export interface LoadedGovernedArtifactState {
  artifactId: string;
  ownerUserId?: string;
  name: string;
  description?: string;
  typeName: string;
  typeEntity?: MJArtifactTypeEntity | null;
  driverClass?: string;
  toolLibraryClass?: string;
  environmentId?: string | null;
  versionId?: string;
  versionNumber: number;
  dbVersionNumber: number;
  contentMode: 'File' | 'Text';
  content: string | Buffer;
  configuration?: string;
  mimeType?: string;
  originalXlsxBytes?: Uint8Array;
  permissions: Awaited<ReturnType<typeof ArtifactPermissionEngine.Instance.ResolvePermissions>>;
  liveRoomHydrated: boolean;
}

export interface CreateGovernedArtifactParams {
  provider: IMetadataProvider;
  contextUser: UserInfo;
  title: string;
  artifactType: string;
  description?: string;
  content?: string | ArtifactToolArgs;
  sheetNames?: string[];
  initialOperations?: ArtifactMutationOperation[];
  collectionId?: string;
  environmentId?: string;
  agentRunId?: string;
  agentName?: string;
  additionalConfig?: ArtifactToolArgs;
  comments?: string;
}

export interface RefreshAndSnapshotArtifactParams {
  provider: IMetadataProvider;
  contextUser: UserInfo;
  artifactId: string;
  freezeRefreshedBlocks?: boolean;
  forceSaveIfUnchanged?: boolean;
  forceRefreshFrozen?: boolean;
  versionComments?: string;
  agentRunId?: string;
  agentName?: string;
}

export interface RefreshAndSnapshotArtifactOutcome {
  success: boolean;
  resultCode: 'SUCCESS' | 'NO_CHANGES' | 'PERMISSION_DENIED' | 'ARTIFACT_NOT_FOUND' | 'VERSION_NOT_FOUND' | 'FAILED';
  message: string;
  changed: boolean;
  artifactId: string;
  versionId?: string;
  previousVersionId?: string;
  newVersionId?: string;
  previousVersionNumber?: number;
  versionNumber?: number;
  newVersionNumber?: number;
  artifactName?: string;
  artifactTypeName?: string;
  driverClass?: string;
  diffSummary?: string;
  signedFrozenBlocksCount?: number;
  highlightLines?: string[];
  errorMessage?: string;
}

export interface CreateGovernedArtifactOutcome {
  success: boolean;
  artifactId?: string;
  versionId?: string;
  versionNumber?: number;
  name?: string;
  typeName?: string;
  driverClass?: string;
  toolLibraryClass?: string;
  mimeType?: string;
  contentMode?: 'File' | 'Text';
  content?: string;
  configuration?: string;
  results?: Array<{ tool: string; data: ArtifactToolResult['data'] }>;
  errorMessage?: string;
}

export interface InspectGovernedArtifactParams {
  provider: IMetadataProvider;
  contextUser: UserInfo;
  artifactId: string;
  tool?: string;
  input?: ArtifactToolArgs;
  agentRunId?: string;
  agentName?: string;
}

export interface InspectGovernedArtifactOutcome {
  success: boolean;
  artifactId?: string;
  versionId?: string;
  versionNumber?: number;
  name?: string;
  typeName?: string;
  driverClass?: string;
  canEdit?: boolean;
  liveRoomHydrated?: boolean;
  data?: ArtifactToolResult['data'];
  errorMessage?: string;
}

export interface ArtifactMutationOperation {
  tool: string;
  input?: ArtifactToolArgs;
}

export interface MutateGovernedArtifactParams {
  provider: IMetadataProvider;
  contextUser: UserInfo;
  artifactId: string;
  tool?: string;
  input?: ArtifactToolArgs;
  operations?: ArtifactMutationOperation[];
  agentRunId?: string;
  agentName?: string;
}

export interface MutateGovernedArtifactOutcome {
  success: boolean;
  artifactId?: string;
  versionId?: string;
  versionNumber?: number;
  name?: string;
  typeName?: string;
  driverClass?: string;
  results?: Array<{ tool: string; data: ArtifactToolResult['data'] }>;
  warnings?: string[];
  errorMessage?: string;
}

export interface ListWorkspaceArtifactsParams {
  provider: IMetadataProvider;
  contextUser: UserInfo;
  collectionId?: string;
  typeFilter?: string;
  search?: string;
  maxResults?: number;
  offset?: number;
}

export interface WorkspaceArtifactListItem {
  artifactId: string;
  versionId?: string;
  versionNumber?: number;
  name: string;
  typeName: string;
  typeEntity?: MJArtifactTypeEntity | null;
  driverClass?: string;
  canEdit: boolean;
  sections: string[];
  embeddedCharts: ReturnType<typeof ArtifactSynthesisEngine.Instance.ExtractSourceDigest>['EmbeddedCharts'];
  summaryPreview: string;
}

export interface EmitPresenceParams {
  artifactId: string;
  phase: ArtifactAgentPresencePhase;
  contextUser: UserInfo;
  agentRunId?: string;
  agentName?: string;
  toolName?: string;
  actionSummary?: string;
  location?: ArtifactAgentTargetLocation;
}

function parseConfigurationRecord(raw?: string | null): ArtifactToolArgs {
  if (!raw) {
    return {};
  }
  const parsed = CleanAndParseJSON<ArtifactJsonValue>(raw);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed;
  }
  return {};
}

/**
 * Merges an existing version's `Configuration` JSON, updated workbook/content configuration JSON,
 * and incremental `configurationPatch` keys (e.g. `suggestions`, `comments`) so `File`-mode
 * artifact saves never drop existing review metadata.
 */
export function BuildMergedFileVersionConfiguration(params: {
  existingConfiguration?: string | null;
  contentConfigurationJson?: string | null;
  configurationPatch?: ArtifactToolArgs;
}): string {
  const existingObj = parseConfigurationRecord(params.existingConfiguration);
  const contentObj = parseConfigurationRecord(params.contentConfigurationJson);
  const patchObj: ArtifactToolArgs =
    params.configurationPatch && typeof params.configurationPatch === 'object' && !Array.isArray(params.configurationPatch)
      ? params.configurationPatch
      : {};

  if (
    Object.keys(existingObj).length === 0 &&
    Object.keys(patchObj).length === 0 &&
    typeof params.contentConfigurationJson === 'string' &&
    params.contentConfigurationJson.length > 0
  ) {
    return params.contentConfigurationJson;
  }

  return JSON.stringify({
    ...existingObj,
    ...contentObj,
    ...patchObj,
  });
}

/**
 * Shared server-side governed artifact service unifying native `BaseAgent` / `ArtifactToolManager`
 * tools and reusable `CoreActions`. Handles permission enforcement, live Yjs room hydration and
 * reconciliation, server-emitted agent presence awareness, and run-scoped touched artifact tracking.
 */
export class GovernedArtifactService extends BaseSingleton<GovernedArtifactService> {
  private readonly runTouchedArtifacts = new MJLruCache<string, GovernedRunArtifactSummary[]>({
    maxSize: 500,
    ttlMs: 2 * 60 * 60 * 1000,
  });

  protected constructor() {
    super();
  }

  private getSharedArtifactLocks(): Map<string, Promise<void>> {
    const store = GetGlobalObjectStore();
    const existing = store[GOVERNED_ARTIFACT_LOCKS_STORE_KEY];
    if (existing instanceof Map) {
      return existing as Map<string, Promise<void>>;
    }
    const created = new Map<string, Promise<void>>();
    store[GOVERNED_ARTIFACT_LOCKS_STORE_KEY] = created;
    return created;
  }

  /**
   * Acquires the process-wide per-artifact mutex stored in `GetGlobalObjectStore()` so
   * `ArtifactToolManager`, `GovernedArtifactService`, and CoreActions serialize writes
   * to the same `ArtifactID`.
   */
  public async WithArtifactLock<T>(artifactId: string, fn: () => Promise<T>): Promise<T> {
    const locks = this.getSharedArtifactLocks();
    const key = NormalizeUUID(artifactId) || (artifactId ?? '').trim().toLowerCase();
    const prev = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = prev.then(() => current, () => current);
    locks.set(key, chain);

    try {
      await prev;
      return await fn();
    } finally {
      release();
      if (locks.get(key) === chain) {
        locks.delete(key);
      }
    }
  }

  private async withArtifactLock<T>(artifactId: string, fn: () => Promise<T>): Promise<T> {
    return this.WithArtifactLock(artifactId, fn);
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

  private escapeSqlLike(term: string): string {
    return term.replace(/[\[%_]/g, (ch) => `[${ch}]`);
  }

  public static get Instance(): GovernedArtifactService {
    return super.getInstance<GovernedArtifactService>();
  }

  public IsMutatingTool(toolName: string): boolean {
    return MUTATING_ARTIFACT_TOOL_NAMES.has(toolName);
  }

  /**
   * Maps user/agent aliases (`'spreadsheet'`, `'sheets'`, `'document'`, `'markdown'`, `'slides'`,
   * `'presentation'`, etc.) onto canonical `MJ: Artifact Types` names.
   */
  public NormalizeArtifactTypeName(rawType: string | undefined): string {
    const cleaned = (rawType ?? '').trim();
    const lower = cleaned.toLowerCase();
    if (
      lower === 'spreadsheet' ||
      lower === 'sheet' ||
      lower === 'sheets' ||
      lower === 'excel' ||
      lower === 'xlsx' ||
      lower === 'excel spreadsheet'
    ) {
      return 'Excel Spreadsheet';
    }
    if (
      lower === 'document' ||
      lower === 'doc' ||
      lower === 'docs' ||
      lower === 'markdown' ||
      lower === 'md' ||
      lower === 'markdown document'
    ) {
      return 'Markdown Document';
    }
    if (
      lower === 'presentation' ||
      lower === 'slides' ||
      lower === 'slide' ||
      lower === 'deck' ||
      lower === 'slide deck'
    ) {
      return 'Presentation';
    }
    return cleaned || 'Markdown Document';
  }

  /**
   * Records a touched artifact against an active `agentRunId` so `BaseAgent`, `AgentRunner`, and
   * realtime delegation can surface collaborative artifacts even when the final payload is empty.
   */
  public RecordTouchedArtifact(
    agentRunId: string | undefined,
    summary: GovernedRunArtifactSummary,
  ): void {
    const key = (agentRunId ?? '').trim().toLowerCase();
    if (!key || !summary.ArtifactID) return;
    const existing = this.runTouchedArtifacts.Get(key) ?? [];
    const targetLower = summary.ArtifactID.trim().toLowerCase();
    const idx = existing.findIndex((item) => item.ArtifactID.trim().toLowerCase() === targetLower);
    const next = [...existing];
    if (idx >= 0) {
      next[idx] = MergeTouchedArtifactSummary(next[idx], summary);
    } else {
      next.push({ ...summary });
    }
    this.runTouchedArtifacts.Set(key, next);
  }

  public PeekTouchedArtifacts(agentRunId: string | undefined): GovernedRunArtifactSummary[] {
    const key = (agentRunId ?? '').trim().toLowerCase();
    if (!key) return [];
    return [...(this.runTouchedArtifacts.Get(key) ?? [])];
  }

  public ConsumeTouchedArtifacts(agentRunId: string | undefined): GovernedRunArtifactSummary[] {
    const key = (agentRunId ?? '').trim().toLowerCase();
    if (!key) return [];
    const items = [...(this.runTouchedArtifacts.Get(key) ?? [])];
    this.runTouchedArtifacts.Delete(key);
    return items;
  }

  /**
   * Best-effort emission of server-owned Yjs agent awareness into the live collaboration room.
   */
  public async EmitAgentPresence(params: EmitPresenceParams): Promise<void> {
    const hook = GetArtifactAgentPresenceHook();
    if (!hook || !params.artifactId) return;

    const agentName = (params.agentName ?? '').trim() || 'MJ Agent';
    const runKey = (params.agentRunId ?? '').trim();
    const presenceKey = runKey || `action:${agentName.toLowerCase()}:${params.contextUser.ID}`;
    const actingName =
      (params.contextUser.Name ?? '').trim() ||
      [params.contextUser.FirstName, params.contextUser.LastName].filter(Boolean).join(' ').trim() ||
      params.contextUser.Email ||
      'User';

    try {
      await hook({
        ArtifactID: params.artifactId,
        Phase: params.phase,
        AgentPresenceKey: presenceKey,
        AgentRunID: runKey || undefined,
        AgentName: agentName,
        ActingForUserID: params.contextUser.ID,
        ActingForUserName: actingName,
        ActingForUserEmail: params.contextUser.Email ?? undefined,
        ToolName: params.toolName,
        ActionSummary: params.actionSummary,
        Location: params.location,
        TimestampMs: Date.now(),
      });
    } catch (err) {
      LogError(
        `GovernedArtifactService: agent presence hook failed for '${params.artifactId}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Resolves a tool library (single or inheritance chain) for an artifact type.
   */
  public ResolveLibrary(typeName: string, toolLibraryClass?: string): ArtifactToolLibraryWithRevisionHash {
    const chain = this.resolveLibraryChain(typeName);
    if (chain.length > 1) {
      return new CompositeArtifactToolLibrary(chain);
    }
    if (chain.length === 1) {
      return chain[0] as ArtifactToolLibraryWithRevisionHash;
    }
    return this.resolveLeafLibrary(typeName, toolLibraryClass);
  }

  public async ResolveArtifactType(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    rawTypeName: string,
  ): Promise<MJArtifactTypeEntity | null> {
    const normalizedName = this.NormalizeArtifactTypeName(rawTypeName);
    try {
      await ArtifactMetadataEngine.Instance.Config(false, contextUser, provider);
      const cached =
        ArtifactMetadataEngine.Instance.FindArtifactType(normalizedName) ??
        ArtifactMetadataEngine.Instance.FindArtifactType(rawTypeName);
      if (cached) return cached;
    } catch {
      // Fall back to direct RunView query
    }

    const rv = RunView.FromMetadataProvider(provider);
    const res = await rv.RunView<MJArtifactTypeEntity>(
      {
        EntityName: 'MJ: Artifact Types',
        ExtraFilter: `Name='${EscapeSQLString(normalizedName)}' AND IsEnabled=1`,
        MaxRows: 1,
        ResultType: 'entity_object',
      },
      contextUser,
    );
    return res.Success && res.Results?.length ? res.Results[0] : null;
  }

  public async CheckCollectionPermission(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    collectionId: string,
    required: 'read' | 'edit',
  ): Promise<{ allowed: boolean; environmentId?: string | null; reason?: string }> {
    const trimmedId = (collectionId ?? '').trim();
    if (!IsValidUUID(trimmedId)) {
      return { allowed: false, reason: `Invalid collectionId '${collectionId}'.` };
    }
    const rv = RunView.FromMetadataProvider(provider);
    const colRes = await rv.RunView<{ ID: string; EnvironmentID?: string | null }>(
      {
        EntityName: 'MJ: Collections',
        ExtraFilter: `ID='${EscapeSQLString(trimmedId)}'`,
        Fields: ['ID', 'EnvironmentID'],
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!colRes.Success || !colRes.Results?.length) {
      return { allowed: false, reason: `Collection '${trimmedId}' was not found.` };
    }
    const collectionRow = colRes.Results[0];
    const resolved = await ArtifactPermissionEngine.Instance.ResolveCollectionAncestryPermissions(
      provider,
      trimmedId,
      contextUser,
    );
    const normalizedRequired = (required ?? 'read').trim().toLowerCase();
    const allowed = normalizedRequired === 'edit' ? resolved.CanEdit : resolved.CanRead;
    if (!allowed) {
      const reason =
        resolved.Source === 'Denied' && resolved.Reason && /not found|permission denied|invalid|must be valid/i.test(resolved.Reason)
          ? resolved.Reason
          : `Permission denied: user lacks ${normalizedRequired === 'edit' ? 'Edit' : 'Read'} access to collection '${trimmedId}'.`;
      return {
        allowed: false,
        reason,
      };
    }
    return { allowed: true, environmentId: collectionRow.EnvironmentID ?? null };
  }

  public async DownloadArtifactFileContent(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    fileId: string,
  ): Promise<Buffer | null> {
    const trimmedFileId = (fileId ?? '').trim();
    if (!IsValidUUID(trimmedFileId)) {
      return null;
    }
    try {
      await FileStorageEngine.Instance.Config(false, contextUser, provider);
      const rv = RunView.FromMetadataProvider(provider);
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
        contextUser,
      );
      if (!fileResult.Success || !fileResult.Results?.length) {
        return null;
      }
      const resolved = await FileStorageEngine.Instance.ResolveFileObject(
        fileResult.Results[0],
        contextUser,
        'Read',
        provider,
      );
      if (!resolved) {
        return null;
      }
      const rawContent: Buffer | Uint8Array | string = await resolved.Driver.GetObject({ fullPath: resolved.ObjectKey });
      if (Buffer.isBuffer(rawContent)) return rawContent;
      if (rawContent instanceof Uint8Array) return Buffer.from(rawContent);
      if (typeof rawContent === 'string') return Buffer.from(rawContent);
      return null;
    } catch (err) {
      LogError(
        `GovernedArtifactService: failed to download FileID '${trimmedFileId}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  /**
   * Loads a readable governed artifact from DB, preferring uncompacted live Yjs room content
   * whenever a collaboration room is currently active.
   */
  public async LoadReadableArtifactState(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    artifactId: string,
    options?: {
      skipBinaryDownload?: boolean;
      failOnMissingFileContent?: boolean;
      fallbackTypeName?: string;
      skipTypeEntityResolution?: boolean;
    },
  ): Promise<{ state?: LoadedGovernedArtifactState; errorMessage?: string }> {
    const trimmedId = (artifactId ?? '').trim();
    if (!IsValidUUID(trimmedId)) {
      return { errorMessage: `Invalid artifact identifier '${artifactId}'.` };
    }

    const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, trimmedId, contextUser);
    if (!perms.CanRead) {
      return { errorMessage: `Permission denied: user does not have Read access to artifact '${trimmedId}'.` };
    }

    const rv = RunView.FromMetadataProvider(provider);
    const artRes = await rv.RunView<{
      ID: string;
      UserID?: string | null;
      Name?: string | null;
      Description?: string | null;
      EnvironmentID?: string | null;
      Type?: string | null;
    }>(
      {
        EntityName: 'MJ: Artifacts',
        ExtraFilter: `ID='${EscapeSQLString(trimmedId)}'`,
        Fields: ['ID', 'UserID', 'Name', 'Description', 'EnvironmentID', 'Type'],
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!artRes.Success || !artRes.Results?.length) {
      return { errorMessage: `Artifact '${trimmedId}' was not found.` };
    }
    const artRow = artRes.Results[0];
    const typeName = (artRow.Type ?? options?.fallbackTypeName ?? 'Markdown Document').trim();
    const typeEntity = options?.skipTypeEntityResolution
      ? null
      : await this.ResolveArtifactType(provider, contextUser, typeName);

    const verRes = await rv.RunView<{
      ID: string;
      VersionNumber?: number | null;
      Name?: string | null;
      ContentMode?: MJArtifactVersionEntity['ContentMode'] | null;
      Content?: string | null;
      Configuration?: string | null;
      FileID?: string | null;
      MimeType?: string | null;
    }>(
      {
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID='${EscapeSQLString(trimmedId)}'`,
        OrderBy: 'VersionNumber DESC',
        Fields: ['ID', 'VersionNumber', 'Name', 'ContentMode', 'Content', 'Configuration', 'FileID', 'MimeType'],
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      },
      contextUser,
    );
    if (options?.failOnMissingFileContent && (!verRes.Success || !verRes.Results?.length)) {
      return {
        errorMessage: verRes.ErrorMessage || `No persisted versions found for artifact '${trimmedId}'.`,
      };
    }
    const ver = verRes.Success && verRes.Results?.length ? verRes.Results[0] : undefined;
    const latestFileId = (ver?.FileID ?? '').trim();

    let content: string | Buffer = ver?.Content ?? (ver?.Configuration ?? '');
    let contentMode: 'File' | 'Text' = ver?.ContentMode === 'File' || Boolean(latestFileId) ? 'File' : 'Text';
    let originalXlsxBytes: Uint8Array | undefined;
    let liveRoomHydrated = false;
    const dbVersionNumber = ver?.VersionNumber ?? 1;
    let versionNumber = dbVersionNumber;
    let versionId = ver?.ID;

    // 1. Prefer uncompacted live Yjs collaboration room snapshot if active
    const liveReader = GetArtifactLiveContentReaderHook();
    if (liveReader) {
      try {
        const liveSnap = await liveReader(trimmedId, contextUser);
        if (liveSnap && typeof liveSnap.Content === 'string') {
          content = liveSnap.Content;
          liveRoomHydrated = true;
          if (typeof liveSnap.VersionNumber === 'number') {
            versionNumber = liveSnap.VersionNumber;
          }
          if (liveSnap.VersionID) {
            versionId = liveSnap.VersionID;
          }
        }
      } catch (err) {
        LogError(
          `GovernedArtifactService: live room reader failed for '${trimmedId}': ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (options?.failOnMissingFileContent && !latestFileId && ver?.ContentMode === 'File') {
      return {
        errorMessage: `Latest version v${versionNumber} of artifact '${trimmedId}' has ContentMode='File' without a FileID.`,
      };
    }

    // 2. If File-mode .xlsx is needed (or not hydrated from live room), download and hydrate binary bytes
    if (latestFileId && !options?.skipBinaryDownload) {
      const downloaded = await this.DownloadArtifactFileContent(provider, contextUser, latestFileId);
      if (downloaded && downloaded.byteLength > 0) {
        const isZip = downloaded.length > 4 && downloaded[0] === 0x50 && downloaded[1] === 0x4b;
        const toolLib = (typeEntity?.ToolLibraryClass ?? '').trim();
        const typeLower = typeName.toLowerCase();
        const isSpreadsheet =
          toolLib === 'SpreadsheetToolLibrary' ||
          typeEntity?.DriverClass === 'SpreadsheetArtifactViewerPlugin' ||
          typeLower.includes('excel') ||
          typeLower.includes('spreadsheet');
        if (isSpreadsheet && isZip) {
          originalXlsxBytes = new Uint8Array(downloaded);
          if (!liveRoomHydrated) {
            const imported = SpreadsheetEngine.Instance.ImportFromXlsxBytes(
              originalXlsxBytes,
              ver?.Configuration ?? undefined,
            );
            SpreadsheetEngine.Instance.EvaluateWorkbook(imported);
            content = SpreadsheetEngine.Instance.SerializeWorkbook(imported);
          }
        } else if (!liveRoomHydrated) {
          content = downloaded;
        }
      } else if (options?.failOnMissingFileContent) {
        return {
          errorMessage: `Failed to download file content for FileID '${latestFileId}' while reloading artifact '${trimmedId}'.`,
        };
      } else if (!liveRoomHydrated && !content) {
        contentMode = 'Text';
      }
    } else if (
      options?.failOnMissingFileContent &&
      !liveRoomHydrated &&
      typeof ver?.Content !== 'string' &&
      typeof ver?.Configuration !== 'string'
    ) {
      return {
        errorMessage: `Latest version v${versionNumber} of artifact '${trimmedId}' has no loadable content.`,
      };
    }

    return {
      state: {
        artifactId: artRow.ID,
        ownerUserId: artRow.UserID ?? undefined,
        name: (ver?.Name ?? artRow.Name ?? 'Untitled Artifact').trim(),
        description: artRow.Description ?? undefined,
        typeName,
        typeEntity,
        driverClass: typeEntity?.DriverClass ?? undefined,
        toolLibraryClass: typeEntity?.ToolLibraryClass ?? undefined,
        environmentId: artRow.EnvironmentID ?? null,
        versionId,
        versionNumber,
        dbVersionNumber,
        contentMode,
        content,
        configuration: ver?.Configuration ?? undefined,
        mimeType: ver?.MimeType ?? typeEntity?.ContentType ?? undefined,
        originalXlsxBytes,
        permissions: perms,
        liveRoomHydrated,
      },
    };
  }

  public BuildInitialContent(
    normalizedTypeName: string,
    title: string,
    providedContent?: string | ArtifactToolArgs,
    sheetNames?: string[],
  ): { content: string; mimeType: string } {
    if (normalizedTypeName === 'Excel Spreadsheet') {
      if (typeof providedContent === 'string' && providedContent.trim()) {
        const parsed = SpreadsheetEngine.Instance.ParseWorkbook(providedContent);
        SpreadsheetEngine.Instance.EvaluateWorkbook(parsed);
        return {
          content: SpreadsheetEngine.Instance.SerializeWorkbook(parsed),
          mimeType: SPREADSHEET_JSON_MIME_TYPE,
        };
      }
      if (providedContent && typeof providedContent === 'object') {
        const parsed = SpreadsheetEngine.Instance.ParseWorkbook(JSON.stringify(providedContent));
        SpreadsheetEngine.Instance.EvaluateWorkbook(parsed);
        return {
          content: SpreadsheetEngine.Instance.SerializeWorkbook(parsed),
          mimeType: SPREADSHEET_JSON_MIME_TYPE,
        };
      }
      const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook(title, sheetNames);
      SpreadsheetEngine.Instance.EvaluateWorkbook(wb);
      return {
        content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
        mimeType: SPREADSHEET_JSON_MIME_TYPE,
      };
    }

    if (normalizedTypeName === 'Presentation') {
      if (typeof providedContent === 'string' && providedContent.trim()) {
        return { content: providedContent, mimeType: PRESENTATION_MIME_TYPE };
      }
      if (providedContent && typeof providedContent === 'object') {
        return { content: JSON.stringify(providedContent, null, 2), mimeType: PRESENTATION_MIME_TYPE };
      }
      const deck = SlideDeckEngine.Instance.CreateDefaultDeck(title);
      return { content: JSON.stringify(deck, null, 2), mimeType: PRESENTATION_MIME_TYPE };
    }

    const mdContent =
      typeof providedContent === 'string' && providedContent.trim().length > 0
        ? providedContent
        : providedContent && typeof providedContent === 'object'
          ? JSON.stringify(providedContent, null, 2)
          : `# ${title}\n\n`;
    return { content: mdContent, mimeType: MARKDOWN_MIME_TYPE };
  }

  /**
   * Creates and persists a new governed artifact + version 1 (`MJ: Artifacts`, `MJ: Artifact Versions`),
   * optionally linking into a collection and recording/emitting run metadata and live presence.
   */
  public async CreateGovernedArtifact(params: CreateGovernedArtifactParams): Promise<CreateGovernedArtifactOutcome> {
    const normalizedTypeName = this.NormalizeArtifactTypeName(params.artifactType);
    const title = (params.title ?? '').trim() || `Untitled ${normalizedTypeName}`;
    const collectionId = (params.collectionId ?? '').trim();

    let collectionEnvId: string | null = null;
    if (collectionId) {
      const colCheck = await this.CheckCollectionPermission(params.provider, params.contextUser, collectionId, 'edit');
      if (!colCheck.allowed) {
        return { success: false, errorMessage: colCheck.reason || 'Permission denied: cannot link artifact to collection.' };
      }
      collectionEnvId = colCheck.environmentId ?? null;
    }

    const artifactType = await this.ResolveArtifactType(params.provider, params.contextUser, normalizedTypeName);
    if (!artifactType) {
      return {
        success: false,
        errorMessage: `Artifact type '${normalizedTypeName}' was not found or is disabled.`,
      };
    }

    const built = this.BuildInitialContent(artifactType.Name, title, params.content, params.sheetNames);
    let finalContent = built.content;
    let initialConfigPatch: ArtifactToolArgs | undefined;
    const initialResults: Array<{ tool: string; data: ArtifactToolResult['data'] }> = [];

    if (params.initialOperations && params.initialOperations.length > 100) {
      return {
        success: false,
        errorMessage: `initialOperations exceeds the maximum allowed 100 operations per request (received ${params.initialOperations.length}).`,
      };
    }

    if (params.initialOperations && params.initialOperations.length > 0) {
      const lib = this.ResolveLibrary(artifactType.Name, artifactType.ToolLibraryClass ?? undefined);
      const execOutcome = await this.executeToolOperations({
        ops: params.initialOperations,
        initialContent: built.content,
        lib,
        toolContext: {
          contextUser: params.contextUser,
          actorUserId: params.contextUser.ID,
          ownerUserId: params.contextUser.ID,
          isEditor: true,
          provider: params.provider,
          agentRunId: params.agentRunId,
          agentName: params.agentName,
        },
        artifactTypeName: artifactType.Name,
      });
      if (execOutcome.success === false) {
        return {
          success: false,
          errorMessage: execOutcome.errorMessage,
        };
      }
      finalContent = Buffer.isBuffer(execOutcome.workingContent)
        ? execOutcome.workingContent.toString('utf8')
        : String(execOutcome.workingContent ?? built.content);
      initialConfigPatch = execOutcome.latestConfigurationPatch;
      initialResults.push(...execOutcome.stepResults);
    }

    const targetEnvId =
      (params.environmentId && IsValidUUID(params.environmentId) ? params.environmentId : null) ||
      collectionEnvId ||
      MJEnvironmentEntityExtended.DefaultEnvironmentID;

    const artifactEntity = await params.provider.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', params.contextUser);
    artifactEntity.NewRecord();
    artifactEntity.Name = title;
    artifactEntity.Description = (params.description ?? '').trim() || `Created by ${params.agentName || 'agent'}`;
    artifactEntity.TypeID = artifactType.ID;
    artifactEntity.EnvironmentID = targetEnvId;
    artifactEntity.UserID = params.contextUser.ID;

    if (!(await artifactEntity.Save())) {
      return {
        success: false,
        errorMessage: artifactEntity.LatestResult?.CompleteMessage || 'Failed to save MJ: Artifacts record.',
      };
    }

    const versionEntity = await params.provider.GetEntityObject<MJArtifactVersionEntity>(
      'MJ: Artifact Versions',
      params.contextUser,
    );
    versionEntity.NewRecord();
    versionEntity.ArtifactID = artifactEntity.ID;
    versionEntity.VersionNumber = 1;
    versionEntity.Name = title;
    versionEntity.Description = artifactEntity.Description;
    versionEntity.UserID = params.contextUser.ID;
    versionEntity.ContentMode = 'Text';
    versionEntity.MimeType = built.mimeType;
    versionEntity.Content = finalContent;
    versionEntity.ContentHash = createHash('sha256').update(finalContent, 'utf8').digest('hex');
    versionEntity.ContentSizeBytes = Buffer.byteLength(finalContent, 'utf8');
    versionEntity.Comments =
      (params.comments ?? '').trim() ||
      (params.agentName ? `Created by ${params.agentName}` : 'Created via GovernedArtifactService');

    const baseConfig = JSON.stringify({
      ...(params.additionalConfig ?? {}),
      ...(initialConfigPatch ?? {}),
      agentRunId: params.agentRunId ?? null,
      agentName: params.agentName ?? null,
    });
    const enrichedConfig = BuildArtifactVersionConfigurationWithPreview(
      baseConfig,
      finalContent,
      artifactType.DriverClass ?? null,
      title,
      {
        ArtifactType: artifactType,
        AllArtifactTypes: ArtifactMetadataEngine.Instance.ArtifactTypes ?? [],
      },
    );
    if (enrichedConfig) {
      versionEntity.Configuration = enrichedConfig;
    }

    if (!(await versionEntity.Save())) {
      await artifactEntity.Delete();
      return {
        success: false,
        errorMessage: versionEntity.LatestResult?.CompleteMessage || 'Failed to save MJ: Artifact Versions v1.',
      };
    }

    if (collectionId) {
      const link = await params.provider.GetEntityObject<MJCollectionArtifactEntity>(
        'MJ: Collection Artifacts',
        params.contextUser,
      );
      link.NewRecord();
      link.CollectionID = collectionId;
      link.ArtifactVersionID = versionEntity.ID;
      if (!(await link.Save())) {
        await versionEntity.Delete();
        await artifactEntity.Delete();
        return {
          success: false,
          errorMessage: link.LatestResult?.CompleteMessage || 'Failed to link artifact to collection.',
        };
      }
    }

    const driverClass = artifactType.DriverClass ?? undefined;
    this.RecordTouchedArtifact(params.agentRunId, {
      ArtifactID: artifactEntity.ID,
      ArtifactVersionID: versionEntity.ID,
      VersionNumber: 1,
      Name: title,
      ArtifactTypeName: artifactType.Name,
      DriverClass: driverClass,
      Operation: 'created',
    });

    try {
      await this.EmitAgentPresence({
        artifactId: artifactEntity.ID,
        phase: 'enter',
        contextUser: params.contextUser,
        agentRunId: params.agentRunId,
        agentName: params.agentName,
        toolName: 'create_artifact',
        actionSummary: `Created "${title}"`,
        location: { Domain: ResolvePresenceDomain(artifactType.Name) },
      });

      return {
        success: true,
        artifactId: artifactEntity.ID,
        versionId: versionEntity.ID,
        versionNumber: 1,
        name: title,
        typeName: artifactType.Name,
        driverClass,
        toolLibraryClass: artifactType.ToolLibraryClass ?? undefined,
        mimeType: built.mimeType,
        contentMode: 'Text',
        content: finalContent,
        configuration: versionEntity.Configuration ?? undefined,
        ...(initialResults.length > 0 ? { results: initialResults } : {}),
      };
    } finally {
      await this.EmitAgentPresence({
        artifactId: artifactEntity.ID,
        phase: 'exit',
        contextUser: params.contextUser,
        agentRunId: params.agentRunId,
        agentName: params.agentName,
      });
    }
  }

  /**
   * Read-only inspection of a governed artifact, supporting optional read-only tool invocation
   * (e.g. `get_sheet_summary`, `get_outline`, `read_range`, `search`) with permission checks
   * and live Yjs room hydration.
   */
  public async InspectGovernedArtifact(params: InspectGovernedArtifactParams): Promise<InspectGovernedArtifactOutcome> {
    const loaded = await this.LoadReadableArtifactState(params.provider, params.contextUser, params.artifactId);
    if (!loaded.state) {
      return { success: false, errorMessage: loaded.errorMessage };
    }
    const state = loaded.state;
    const requestedTool = (params.tool ?? '').trim();
    if (requestedTool && this.IsMutatingTool(requestedTool)) {
      return {
        success: false,
        errorMessage: `InspectGovernedArtifact refuses mutating tool '${requestedTool}'. Use MutateGovernedArtifact instead.`,
      };
    }

    const toolInput = this.sanitizeToolInput(params.input);
    const domain = ResolvePresenceDomain(state.typeName);
    const location = ExtractAgentTargetLocation(requestedTool || 'inspect', toolInput, state.content, state.typeName);
    let workingEmitted = false;

    try {
      await this.EmitAgentPresence({
        artifactId: state.artifactId,
        phase: 'working',
        contextUser: params.contextUser,
        agentRunId: params.agentRunId,
        agentName: params.agentName,
        toolName: requestedTool || 'inspect',
        actionSummary: requestedTool ? FormatAgentActionSummary(requestedTool, toolInput, location) : `Inspecting "${state.name}"`,
        location: location ?? { Domain: domain },
      });
      workingEmitted = true;

      let data: ArtifactToolResult['data'];
      if (requestedTool) {
        const lib = this.ResolveLibrary(state.typeName, state.toolLibraryClass);
        const toolContext: ArtifactToolExecutionContext = {
          contextUser: params.contextUser,
          actorUserId: params.contextUser.ID,
          ownerUserId: state.ownerUserId,
          isEditor: state.permissions.CanEdit,
          provider: params.provider,
          artifactId: state.artifactId,
          agentRunId: params.agentRunId,
          agentName: params.agentName,
        };
        const res = await lib.InvokeTool(requestedTool, toolInput, state.content, toolContext);
        if (!res.success) {
          return {
            success: false,
            artifactId: state.artifactId,
            errorMessage: res.errorMessage || `Inspection tool '${requestedTool}' failed.`,
          };
        }
        if (res.data !== null && typeof res.data === 'object' && !Array.isArray(res.data)) {
          const dataObj = res.data as ArtifactToolArgs;
          if (dataObj.updatedContent !== undefined || dataObj.xlsxBase64 !== undefined) {
            return {
              success: false,
              artifactId: state.artifactId,
              errorMessage: `InspectGovernedArtifact blocked tool '${requestedTool}' because it attempted to return mutated artifact content.`,
            };
          }
        }
        data = res.data;
      } else {
        const lib = this.ResolveLibrary(state.typeName, state.toolLibraryClass);
        const digest = ArtifactSynthesisEngine.Instance.ExtractSourceDigest(
          {
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
          2000,
        );
        data = {
          availableTools: lib.GetToolList().map((t) => t.name),
          sections: digest.Sections,
          embeddedCharts: digest.EmbeddedCharts,
          summaryPreview: digest.SummaryText,
        };
      }

      await this.EmitAgentPresence({
        artifactId: state.artifactId,
        phase: 'settled',
        contextUser: params.contextUser,
        agentRunId: params.agentRunId,
        agentName: params.agentName,
        toolName: requestedTool || 'inspect',
        actionSummary: `Inspected "${state.name}"`,
        location: location ?? { Domain: domain },
      });

      return {
        success: true,
        artifactId: state.artifactId,
        versionId: state.versionId,
        versionNumber: state.versionNumber,
        name: state.name,
        typeName: state.typeName,
        driverClass: state.driverClass,
        canEdit: state.permissions.CanEdit,
        liveRoomHydrated: state.liveRoomHydrated,
        data,
      };
    } catch (err) {
      return {
        success: false,
        artifactId: state.artifactId,
        errorMessage: `InspectGovernedArtifact error: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      if (workingEmitted) {
        await this.EmitAgentPresence({
          artifactId: state.artifactId,
          phase: 'exit',
          contextUser: params.contextUser,
          agentRunId: params.agentRunId,
          agentName: params.agentName,
        });
      }
    }
  }

  /**
   * Executes one or more governed artifact mutation tools via an action/direct path, reconciling with
   * live Yjs collaboration rooms, persisting a new version, and emitting real-time presence awareness.
   */
  public async MutateGovernedArtifact(params: MutateGovernedArtifactParams): Promise<MutateGovernedArtifactOutcome> {
    return this.withArtifactLock(params.artifactId, () => this.mutateGovernedArtifactLocked(params));
  }

  private async safeRollbackHook(
    rollbackFn: ArtifactLiveMutationHookResult['rollback'] | undefined,
    versionId: string | undefined,
  ): Promise<void> {
    if (!rollbackFn) return;
    try {
      await rollbackFn(versionId);
    } catch (err) {
      LogError(
        `GovernedArtifactService: live hook rollback failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async safeDeleteVersionEntity(versionEntity: MJArtifactVersionEntity): Promise<void> {
    try {
      await versionEntity.Delete();
    } catch (err) {
      LogError(
        `GovernedArtifactService: failed to delete rolled-back version entity '${versionEntity.ID}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Deletes an uploaded `MJ: Files` row (and backing storage object when supported) if no
   * `MJ: Artifact Versions` record references it. Best-effort cleanup for aborted/rolled-back writes.
   */
  public async DeleteUnreferencedArtifactFile(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    fileId: string | null | undefined,
  ): Promise<void> {
    const trimmedFileId = (fileId ?? '').trim();
    if (!IsValidUUID(trimmedFileId)) {
      return;
    }
    try {
      const rv = RunView.FromMetadataProvider(provider);
      const refRes = await rv.RunView<{ ID: string }>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `FileID='${EscapeSQLString(trimmedFileId)}'`,
          Fields: ['ID'],
          MaxRows: 1,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        contextUser,
      );
      if (!refRes.Success || (refRes.Results?.length ?? 0) > 0) {
        return;
      }

      const fileEntity = await provider.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
      if (await fileEntity.Load(trimmedFileId)) {
        const deleted = await fileEntity.Delete();
        if (!deleted) {
          LogError(
            `GovernedArtifactService: failed to delete unreferenced MJ: Files record '${trimmedFileId}': ${
              fileEntity.LatestResult?.CompleteMessage || 'Delete() returned false'
            }`,
          );
        }
      }
    } catch (err) {
      LogError(
        `GovernedArtifactService: exception deleting unreferenced MJ: Files record '${trimmedFileId}': ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private materializeXlsxForContent(
    contentStr: string,
    workingXlsxBytes: Uint8Array | undefined,
  ): { xlsxBytes?: Uint8Array; xlsxBase64?: string } {
    try {
      const parsedWorkbook = SpreadsheetEngine.Instance.ParseWorkbook(contentStr);
      const patched = workingXlsxBytes
        ? XlsxOpenXmlAdapter.Instance.PatchXlsxBytes(workingXlsxBytes, parsedWorkbook)
        : SpreadsheetEngine.Instance.ExportToXlsxBytes(parsedWorkbook);
      return {
        xlsxBytes: patched,
        xlsxBase64: Buffer.from(patched).toString('base64'),
      };
    } catch {
      return {};
    }
  }

  private async uploadXlsxBuffer(
    params: { provider: IMetadataProvider; contextUser: UserInfo },
    artifactName: string,
    xlsxBase64: string,
  ): Promise<{ fileId: string | null; sizeBytes: number }> {
    const xlsxBuf = Buffer.from(xlsxBase64, 'base64');
    let uploadedFileId: string | null = null;
    try {
      await FileStorageEngine.Instance.Config(false, params.contextUser, params.provider);
      if (FileStorageEngine.Instance.HasStorageAccounts) {
        const safeFileName = artifactName.toLowerCase().endsWith('.xlsx')
          ? artifactName
          : `${artifactName || 'workbook'}.xlsx`;
        const uploadRes = await FileStorageEngine.Instance.UploadFile({
          content: xlsxBuf,
          fileName: safeFileName,
          mimeType: XLSX_MIME_TYPE,
          contextUser: params.contextUser,
          provider: params.provider,
        });
        uploadedFileId = uploadRes.FileID;
      }
    } catch {
      uploadedFileId = null;
    }
    return { fileId: uploadedFileId, sizeBytes: xlsxBuf.byteLength };
  }

  private applyVersionPayload(
    versionEntity: MJArtifactVersionEntity,
    state: LoadedGovernedArtifactState,
    finalContentStr: string,
    lastToolName: string,
    params: Pick<MutateGovernedArtifactParams, 'agentRunId' | 'agentName'>,
    uploadedFileId: string | null,
    xlsxSizeBytes: number | null,
    configurationPatch?: ArtifactToolArgs,
  ): void {
    versionEntity.ContentHash = createHash('sha256').update(finalContentStr, 'utf8').digest('hex');

    if (uploadedFileId) {
      const safeFileName = state.name.toLowerCase().endsWith('.xlsx')
        ? state.name
        : `${state.name || 'workbook'}.xlsx`;
      versionEntity.ContentMode = 'File';
      versionEntity.FileID = uploadedFileId;
      versionEntity.MimeType = XLSX_MIME_TYPE;
      versionEntity.FileName = safeFileName;
      versionEntity.ContentSizeBytes = xlsxSizeBytes;
      versionEntity.Content = null;
      versionEntity.Configuration = BuildMergedFileVersionConfiguration({
        existingConfiguration: versionEntity.Configuration ?? state.configuration,
        contentConfigurationJson: finalContentStr,
        configurationPatch,
      });
      return;
    }

    versionEntity.ContentMode = 'Text';
    versionEntity.FileID = null;
    versionEntity.MimeType = state.mimeType ?? null;
    versionEntity.Content = finalContentStr;
    versionEntity.ContentSizeBytes = Buffer.byteLength(finalContentStr, 'utf8');
    const existingConfig = parseConfigurationRecord(state.configuration);
    const mergedConfig = JSON.stringify({
      ...existingConfig,
      ...(configurationPatch ?? {}),
      agentRunId: params.agentRunId ?? null,
      agentName: params.agentName ?? null,
      lastTool: lastToolName,
    });
    const enrichedConfig = BuildArtifactVersionConfigurationWithPreview(
      mergedConfig,
      finalContentStr,
      state.driverClass ?? null,
      state.name,
      {
        ArtifactType: state.typeEntity ?? undefined,
        AllArtifactTypes: ArtifactMetadataEngine.Instance.ArtifactTypes ?? [],
      },
    );
    versionEntity.Configuration = enrichedConfig ?? mergedConfig;
  }

  private async mutateGovernedArtifactLocked(params: MutateGovernedArtifactParams): Promise<MutateGovernedArtifactOutcome> {
    const loaded = await this.LoadReadableArtifactState(params.provider, params.contextUser, params.artifactId);
    if (!loaded.state) {
      return { success: false, errorMessage: loaded.errorMessage };
    }
    const state = loaded.state;

    if (!state.permissions.CanEdit) {
      return {
        success: false,
        artifactId: state.artifactId,
        errorMessage: `Permission denied: user lacks Edit access to artifact '${state.artifactId}'.`,
      };
    }

    const ops: ArtifactMutationOperation[] =
      params.operations && params.operations.length > 0
        ? params.operations
        : params.tool
          ? [{ tool: params.tool, input: params.input }]
          : [];
    if (ops.length === 0) {
      return { success: false, errorMessage: 'MutateGovernedArtifact requires either tool or operations.' };
    }

    if (state.contentMode === 'File' || Boolean(state.originalXlsxBytes)) {
      const refusedOp = ops.find((op) => STRUCTURAL_SPREADSHEET_TOOLS.has(op.tool));
      if (refusedOp) {
        return {
          success: false,
          artifactId: state.artifactId,
          errorMessage: FormatFileModeStructuralToolError(refusedOp.tool),
        };
      }
    }

    const lib = this.ResolveLibrary(state.typeName, state.toolLibraryClass);
    const toolContext: ArtifactToolExecutionContext = {
      contextUser: params.contextUser,
      actorUserId: params.contextUser.ID,
      ownerUserId: state.ownerUserId,
      isEditor: state.permissions.CanEdit,
      provider: params.provider,
      artifactId: state.artifactId,
      agentRunId: params.agentRunId,
      agentName: params.agentName,
    };

    const previousContentStr = Buffer.isBuffer(state.content) ? undefined : String(state.content ?? '');
    let workingXlsxBytes = state.originalXlsxBytes;
    const warnings: string[] = [];
    let workingEmitted = false;

    try {
      const execOutcome = await this.executeToolOperations({
        ops,
        initialContent: state.content,
        lib,
        toolContext,
        artifactTypeName: state.typeName,
        emitPresenceArtifactId: state.artifactId,
        onWorkingEmitted: () => {
          workingEmitted = true;
        },
      });
      if (execOutcome.success === false) {
        return {
          success: false,
          artifactId: state.artifactId,
          errorMessage: execOutcome.errorMessage,
        };
      }
      const {
        workingContent,
        latestXlsxBase64: execXlsxBase64,
        lastLocation,
        lastToolName,
        lastToolInput,
        latestConfigurationPatch,
        stepResults,
        appliedComments,
      } = execOutcome;
      let latestXlsxBase64 = execXlsxBase64;

      const isUntouchedBinaryBuffer = Buffer.isBuffer(workingContent) && workingContent === state.content;
      let finalContentStr = Buffer.isBuffer(workingContent) ? '' : String(workingContent ?? '');
      const hasContentChange =
        workingContent !== undefined &&
        workingContent !== null &&
        !isUntouchedBinaryBuffer &&
        (Buffer.isBuffer(workingContent) || finalContentStr !== previousContentStr);
      if (!hasContentChange && !latestConfigurationPatch) {
        return {
          success: true,
          artifactId: state.artifactId,
          versionId: state.versionId,
          versionNumber: state.versionNumber,
          name: state.name,
          typeName: state.typeName,
          driverClass: state.driverClass,
          results: stepResults,
        };
      }

      if (workingXlsxBytes || state.contentMode === 'File') {
        const materialized = this.materializeXlsxForContent(finalContentStr, workingXlsxBytes);
        if (materialized.xlsxBytes) {
          workingXlsxBytes = materialized.xlsxBytes;
          latestXlsxBase64 = materialized.xlsxBase64;
        } else {
          latestXlsxBase64 = undefined;
        }
      }

      const persisted = await this.persistLoadedArtifactMutation({
        provider: params.provider,
        contextUser: params.contextUser,
        state,
        previousContentStr,
        finalContentStr,
        workingXlsxBytes,
        latestXlsxBase64,
        lastToolName,
        lastToolInput,
        lastLocation,
        comments: params.agentName
          ? `Edited by ${params.agentName} via '${lastToolName}'`
          : `Updated via '${lastToolName}'`,
        configurationPatch: latestConfigurationPatch,
        agentRunId: params.agentRunId,
        agentName: params.agentName,
      });
      if (!persisted.success) {
        await this.rollbackAppliedCommentOps(params.provider, params.contextUser, appliedComments);
        return {
          success: false,
          artifactId: state.artifactId,
          errorMessage: persisted.errorMessage,
        };
      }

      return {
        success: true,
        artifactId: state.artifactId,
        versionId: persisted.versionId,
        versionNumber: persisted.versionNumber,
        name: state.name,
        typeName: state.typeName,
        driverClass: state.driverClass,
        results: stepResults,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    } catch (err) {
      return {
        success: false,
        artifactId: state.artifactId,
        errorMessage: `MutateGovernedArtifact error: ${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      if (workingEmitted) {
        await this.EmitAgentPresence({
          artifactId: state.artifactId,
          phase: 'exit',
          contextUser: params.contextUser,
          agentRunId: params.agentRunId,
          agentName: params.agentName,
        });
      }
    }
  }

  private async rollbackAppliedCommentOps(
    provider: IMetadataProvider,
    contextUser: UserInfo,
    appliedComments: ReadonlyArray<{ kind: 'thread' | 'reply'; threadId?: string; commentId?: string }>
  ): Promise<void> {
    for (let i = appliedComments.length - 1; i >= 0; i--) {
      const entry = appliedComments[i];
      try {
        if (entry.commentId && IsValidUUID(entry.commentId)) {
          const detail = await provider.GetEntityObject<MJConversationDetailEntity>(
            'MJ: Conversation Details',
            contextUser
          );
          if (detail && (await detail.Load(entry.commentId))) {
            await detail.Delete();
          }
        }
        if (entry.kind === 'thread' && entry.threadId && IsValidUUID(entry.threadId)) {
          const conv = await provider.GetEntityObject<MJConversationEntity>(
            'MJ: Conversations',
            contextUser
          );
          if (conv && (await conv.Load(entry.threadId))) {
            await conv.Delete();
          }
        }
      } catch (rollbackErr) {
        LogError(
          `GovernedArtifactService: comment rollback error: ${
            rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)
          }`
        );
      }
    }
  }

  private async executeToolOperations(input: {
    ops: ArtifactMutationOperation[];
    initialContent: string | Buffer;
    lib: BaseArtifactToolLibrary;
    toolContext: ArtifactToolExecutionContext;
    artifactTypeName: string;
    emitPresenceArtifactId?: string;
    onWorkingEmitted?: () => void;
  }): Promise<
    | {
        success: true;
        workingContent: string | Buffer;
        latestXlsxBase64?: string;
        lastLocation?: ArtifactAgentTargetLocation;
        lastToolName: string;
        lastToolInput: ArtifactToolArgs;
        latestConfigurationPatch?: ArtifactToolArgs;
        stepResults: Array<{ tool: string; data: ArtifactToolResult['data'] }>;
        appliedComments: Array<{ kind: 'thread' | 'reply'; threadId?: string; commentId?: string }>;
      }
    | { success: false; errorMessage: string }
  > {
    let workingContent: string | Buffer = input.initialContent;
    let latestXlsxBase64: string | undefined;
    let lastLocation: ArtifactAgentTargetLocation | undefined;
    let lastToolName = input.ops[0]?.tool ?? '';
    let lastToolInput: ArtifactToolArgs = this.sanitizeToolInput(input.ops[input.ops.length - 1]?.input);
    let latestConfigurationPatch: ArtifactToolArgs | undefined;
    const stepResults: Array<{ tool: string; data: ArtifactToolResult['data'] }> = [];
    const appliedComments: Array<{ kind: 'thread' | 'reply'; threadId?: string; commentId?: string }> = [];

    for (const op of input.ops) {
      const toolName = (op.tool ?? '').trim();
      if (!toolName) {
        await this.rollbackAppliedCommentOps(input.toolContext.provider!, input.toolContext.contextUser!, appliedComments);
        return { success: false, errorMessage: 'Each operation requires a non-empty tool name.' };
      }
      const toolInput = this.sanitizeToolInput(op.input);
      lastToolName = toolName;
      lastToolInput = toolInput;
      lastLocation = ExtractAgentTargetLocation(toolName, toolInput, workingContent, input.artifactTypeName);
      if (input.emitPresenceArtifactId && input.toolContext.contextUser) {
        await this.EmitAgentPresence({
          artifactId: input.emitPresenceArtifactId,
          phase: 'working',
          contextUser: input.toolContext.contextUser,
          agentRunId: input.toolContext.agentRunId,
          agentName: input.toolContext.agentName,
          toolName,
          actionSummary: FormatAgentActionSummary(toolName, toolInput, lastLocation),
          location: lastLocation,
        });
        input.onWorkingEmitted?.();
      }

      const res = await input.lib.InvokeTool(toolName, toolInput, workingContent, input.toolContext);
      if (!res.success) {
        if (input.toolContext.provider && input.toolContext.contextUser) {
          await this.rollbackAppliedCommentOps(input.toolContext.provider, input.toolContext.contextUser, appliedComments);
        }
        return {
          success: false,
          errorMessage: res.errorMessage || `Tool '${toolName}' failed.`,
        };
      }

      const rawData: ArtifactToolArgs =
        res.data !== null && typeof res.data === 'object' && !Array.isArray(res.data)
          ? (res.data as ArtifactToolArgs)
          : {};
      if (toolName === 'add_comment' && typeof rawData.threadId === 'string') {
        appliedComments.push({
          kind: 'thread',
          threadId: rawData.threadId,
          commentId: typeof rawData.commentId === 'string' ? rawData.commentId : undefined,
        });
      } else if (toolName === 'reply_comment' && typeof rawData.commentId === 'string') {
        appliedComments.push({
          kind: 'reply',
          commentId: rawData.commentId,
        });
      }
      if (typeof rawData.updatedContent === 'string') {
        workingContent = rawData.updatedContent;
        if (typeof rawData.xlsxBase64 === 'string') {
          latestXlsxBase64 = rawData.xlsxBase64;
        }
      }
      if (
        rawData.configurationPatch !== null &&
        typeof rawData.configurationPatch === 'object' &&
        !Array.isArray(rawData.configurationPatch)
      ) {
        latestConfigurationPatch = {
          ...(latestConfigurationPatch ?? {}),
          ...(rawData.configurationPatch as ArtifactToolArgs),
        };
      }
      lastLocation =
        ExtractAgentTargetLocation(toolName, toolInput, workingContent, input.artifactTypeName, rawData) ?? lastLocation;

      const sanitized: ArtifactToolArgs = {};
      for (const [k, v] of Object.entries(rawData)) {
        if (k === 'updatedContent' || k === 'xlsxBase64') continue;
        sanitized[k] = v;
      }
      stepResults.push({ tool: toolName, data: sanitized });
    }

    return {
      success: true,
      workingContent,
      latestXlsxBase64,
      lastLocation,
      lastToolName,
      lastToolInput,
      latestConfigurationPatch,
      stepResults,
      appliedComments,
    };
  }

  private async persistLoadedArtifactMutation(input: {
    provider: IMetadataProvider;
    contextUser: UserInfo;
    state: LoadedGovernedArtifactState;
    previousContentStr?: string;
    finalContentStr: string;
    workingXlsxBytes?: Uint8Array;
    latestXlsxBase64?: string;
    lastToolName: string;
    lastToolInput: ArtifactToolArgs;
    lastLocation?: ArtifactAgentTargetLocation;
    comments: string;
    configurationPatch?: ArtifactToolArgs;
    agentRunId?: string;
    agentName?: string;
  }): Promise<{ success: boolean; versionId?: string; versionNumber?: number; errorMessage?: string }> {
    const { state } = input;
    let finalContentStr = input.finalContentStr;
    let workingXlsxBytes = input.workingXlsxBytes;
    let latestXlsxBase64 = input.latestXlsxBase64;

    const liveHook = GetArtifactLiveMutationHook();
    let hookOutcome: ArtifactLiveMutationHookResult | undefined = undefined;
    if (liveHook) {
      const hookResult = await liveHook({
        artifactId: state.artifactId,
        alphaId: 'A',
        versionId: state.versionId,
        versionNumber: state.versionNumber + 1,
        previousContent: input.previousContentStr,
        updatedContent: finalContentStr,
        xlsxBase64: latestXlsxBase64,
        configurationPatch: input.configurationPatch,
        tool: input.lastToolName,
        contextUser: input.contextUser,
        agentRunId: input.agentRunId,
        agentName: input.agentName,
        deferCommit: true,
      });
      if (hookResult && typeof hookResult === 'object') {
        hookOutcome = hookResult;
        if (typeof hookResult.mergedContent === 'string' && hookResult.mergedContent !== finalContentStr) {
          finalContentStr = hookResult.mergedContent;
          if (workingXlsxBytes || state.contentMode === 'File') {
            const rematerialized = this.materializeXlsxForContent(finalContentStr, workingXlsxBytes);
            if (rematerialized.xlsxBytes) {
              workingXlsxBytes = rematerialized.xlsxBytes;
              latestXlsxBase64 = rematerialized.xlsxBase64;
            } else {
              latestXlsxBase64 = undefined;
            }
          }
        }
      }
    }

    // Re-check latest DB version number before persisting to catch out-of-band concurrent edits
    const rv = RunView.FromMetadataProvider(input.provider);
    const verCheck = await rv.RunView<{ ID: string; VersionNumber?: number | null }>(
      {
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID='${EscapeSQLString(state.artifactId)}'`,
        OrderBy: 'VersionNumber DESC',
        Fields: ['ID', 'VersionNumber'],
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      },
      input.contextUser,
    );
    if (verCheck.Success && verCheck.Results?.length) {
      const currentDbVersion = verCheck.Results[0].VersionNumber ?? 1;
      if (currentDbVersion > state.dbVersionNumber) {
        return {
          success: false,
          errorMessage: `Concurrent modification detected on artifact '${state.artifactId}': expected version ${state.dbVersionNumber}, found version ${currentDbVersion}. Please re-inspect and retry.`,
        };
      }
    }

    let uploadedFileId: string | null = null;
    let xlsxSizeBytes: number | null = null;
    if (state.contentMode === 'File') {
      if (!latestXlsxBase64) {
        return {
          success: false,
          errorMessage: 'Failed to materialize updated .xlsx bytes for File-mode artifact.',
        };
      }
      const upload = await this.uploadXlsxBuffer(input, state.name, latestXlsxBase64);
      uploadedFileId = upload.fileId;
      xlsxSizeBytes = upload.sizeBytes;
      if (!uploadedFileId) {
        return {
          success: false,
          errorMessage: 'Failed to upload updated .xlsx binary to FileStorageEngine; refusing to downgrade File-mode artifact.',
        };
      }
    }

    const nextVersionNumber = Math.max(state.versionNumber, state.dbVersionNumber) + 1;
    const versionEntity = await input.provider.GetEntityObject<MJArtifactVersionEntity>(
      'MJ: Artifact Versions',
      input.contextUser,
    );
    versionEntity.NewRecord();
    versionEntity.ArtifactID = state.artifactId;
    versionEntity.VersionNumber = nextVersionNumber;
    versionEntity.Name = state.name;
    versionEntity.UserID = input.contextUser.ID;
    versionEntity.Comments = input.comments;
    this.applyVersionPayload(
      versionEntity,
      state,
      finalContentStr,
      input.lastToolName,
      { agentRunId: input.agentRunId, agentName: input.agentName },
      uploadedFileId,
      xlsxSizeBytes,
      input.configurationPatch,
    );

    if (!(await versionEntity.Save())) {
      await this.DeleteUnreferencedArtifactFile(input.provider, input.contextUser, uploadedFileId);
      return {
        success: false,
        errorMessage: versionEntity.LatestResult?.CompleteMessage || 'Failed to save new MJ: Artifact Versions record.',
      };
    }

    if (hookOutcome?.commit) {
      let commitRes: Awaited<ReturnType<NonNullable<ArtifactLiveMutationHookResult['commit']>>>;
      try {
        commitRes = await hookOutcome.commit({
          versionId: versionEntity.ID,
          versionNumber: nextVersionNumber,
        });
      } catch (commitErr) {
        const savedVersionId = versionEntity.ID;
        await this.safeDeleteVersionEntity(versionEntity);
        await this.DeleteUnreferencedArtifactFile(input.provider, input.contextUser, uploadedFileId);
        await this.safeRollbackHook(hookOutcome.rollback, savedVersionId);
        return {
          success: false,
          errorMessage: `Live room commit failed for artifact '${state.artifactId}': ${
            commitErr instanceof Error ? commitErr.message : String(commitErr)
          }`,
        };
      }

      if (commitRes && typeof commitRes === 'object' && commitRes.applied === false) {
        const savedVersionId = versionEntity.ID;
        await this.safeDeleteVersionEntity(versionEntity);
        await this.DeleteUnreferencedArtifactFile(input.provider, input.contextUser, uploadedFileId);
        await this.safeRollbackHook(commitRes.rollback ?? hookOutcome.rollback, savedVersionId);
        return {
          success: false,
          errorMessage: `Live room commit rejected mutation for artifact '${state.artifactId}' (applied=false).`,
        };
      }

      if (
        commitRes &&
        typeof commitRes === 'object' &&
        typeof commitRes.mergedContent === 'string' &&
        commitRes.mergedContent !== finalContentStr
      ) {
        finalContentStr = commitRes.mergedContent;
        let updatedFileId = uploadedFileId;
        let updatedSizeBytes = xlsxSizeBytes;
        if (state.contentMode === 'File') {
          const rematerialized = this.materializeXlsxForContent(finalContentStr, workingXlsxBytes);
          if (!rematerialized.xlsxBase64) {
            const savedVersionId = versionEntity.ID;
            await this.safeDeleteVersionEntity(versionEntity);
            await this.DeleteUnreferencedArtifactFile(input.provider, input.contextUser, uploadedFileId);
            await this.safeRollbackHook(commitRes.rollback ?? hookOutcome.rollback, savedVersionId);
            return {
              success: false,
              errorMessage: 'Failed to rematerialize merged .xlsx binary after live room commit.',
            };
          }
          workingXlsxBytes = rematerialized.xlsxBytes;
          latestXlsxBase64 = rematerialized.xlsxBase64;
          const reupload = await this.uploadXlsxBuffer(input, state.name, rematerialized.xlsxBase64);
          if (!reupload.fileId) {
            const savedVersionId = versionEntity.ID;
            await this.safeDeleteVersionEntity(versionEntity);
            await this.DeleteUnreferencedArtifactFile(input.provider, input.contextUser, uploadedFileId);
            await this.safeRollbackHook(commitRes.rollback ?? hookOutcome.rollback, savedVersionId);
            return {
              success: false,
              errorMessage: 'Live room merged content after save, but re-uploading merged .xlsx binary failed.',
            };
          }
          updatedFileId = reupload.fileId;
          updatedSizeBytes = reupload.sizeBytes;
        }
        this.applyVersionPayload(
          versionEntity,
          state,
          finalContentStr,
          input.lastToolName,
          { agentRunId: input.agentRunId, agentName: input.agentName },
          updatedFileId,
          updatedSizeBytes,
          input.configurationPatch,
        );
        if (!(await versionEntity.Save())) {
          const errMsg =
            versionEntity.LatestResult?.CompleteMessage ||
            'Failed to re-save version record with post-commit merged content.';
          const savedVersionId = versionEntity.ID;
          await this.safeDeleteVersionEntity(versionEntity);
          if (updatedFileId && updatedFileId !== uploadedFileId) {
            await this.DeleteUnreferencedArtifactFile(input.provider, input.contextUser, updatedFileId);
          }
          await this.DeleteUnreferencedArtifactFile(input.provider, input.contextUser, uploadedFileId);
          await this.safeRollbackHook(commitRes.rollback ?? hookOutcome.rollback, savedVersionId);
          return {
            success: false,
            errorMessage: errMsg,
          };
        }
        if (uploadedFileId && updatedFileId && uploadedFileId !== updatedFileId) {
          await this.DeleteUnreferencedArtifactFile(input.provider, input.contextUser, uploadedFileId);
        }
      }
    }

    try {
      MJGlobal.Instance.RaiseEvent({
        component: this,
        event: MJEventType.ComponentEvent,
        eventCode: ARTIFACT_LIVE_MUTATION_EVENT_CODE,
        args: {
          ArtifactID: state.artifactId,
          NewContent: finalContentStr,
          PreviousContent: input.previousContentStr,
          ToolName: input.lastToolName,
          User: input.contextUser,
          SaveVersion: false,
          AlreadyAppliedToRoom: Boolean(liveHook),
        },
      });
    } catch {
      // Never fail mutation if UI subscriber throws
    }

    this.RecordTouchedArtifact(input.agentRunId, {
      ArtifactID: state.artifactId,
      ArtifactVersionID: versionEntity.ID,
      VersionNumber: nextVersionNumber,
      Name: state.name,
      ArtifactTypeName: state.typeName,
      DriverClass: state.driverClass,
      Operation: 'mutated',
    });

    await this.EmitAgentPresence({
      artifactId: state.artifactId,
      phase: 'settled',
      contextUser: input.contextUser,
      agentRunId: input.agentRunId,
      agentName: input.agentName,
      toolName: input.lastToolName,
      actionSummary: FormatAgentActionSummary(input.lastToolName, input.lastToolInput, input.lastLocation),
      location: input.lastLocation,
    });

    return {
      success: true,
      versionId: versionEntity.ID,
      versionNumber: nextVersionNumber,
    };
  }

  /**
   * Refreshes a governed artifact's live blocks/formulas (`LiveTables`, `=MJ.*`, slide/doc blocks) under
   * the per-artifact lock, reconciling live Yjs collaboration rooms and preserving `.xlsx` `File`-mode binaries.
   * Shared by both `RefreshAndSnapshotArtifactAction` (`CoreActions`) and `ArtifactToolManager` workspace tools.
   */
  public async RefreshAndSnapshotArtifact(
    params: RefreshAndSnapshotArtifactParams,
  ): Promise<RefreshAndSnapshotArtifactOutcome> {
    const trimmedId = (params.artifactId ?? '').trim();
    if (!IsValidUUID(trimmedId)) {
      return {
        success: false,
        resultCode: 'ARTIFACT_NOT_FOUND',
        message: `Invalid artifactId '${params.artifactId}'.`,
        changed: false,
        artifactId: trimmedId,
        errorMessage: `Invalid artifactId '${params.artifactId}'.`,
      };
    }
    return this.WithArtifactLock(trimmedId, () => this.refreshAndSnapshotArtifactLocked(params, trimmedId));
  }

  private async refreshAndSnapshotArtifactLocked(
    params: RefreshAndSnapshotArtifactParams,
    artifactId: string,
  ): Promise<RefreshAndSnapshotArtifactOutcome> {
    const loaded = await this.LoadReadableArtifactState(params.provider, params.contextUser, artifactId, {
      failOnMissingFileContent: true,
    });
    if (!loaded.state) {
      const errMsg = loaded.errorMessage || `Artifact '${artifactId}' could not be loaded.`;
      const lower = errMsg.toLowerCase();
      const code: RefreshAndSnapshotArtifactOutcome['resultCode'] = lower.includes('not found')
        ? 'ARTIFACT_NOT_FOUND'
        : lower.includes('version')
          ? 'VERSION_NOT_FOUND'
          : 'PERMISSION_DENIED';
      return {
        success: false,
        resultCode: code,
        message: errMsg,
        changed: false,
        artifactId,
        errorMessage: errMsg,
      };
    }

    const state = loaded.state;
    if (!state.permissions.CanEdit) {
      const deniedMsg = `Permission denied: user lacks Edit access to artifact '${state.artifactId}'.`;
      return {
        success: false,
        resultCode: 'PERMISSION_DENIED',
        message: deniedMsg,
        changed: false,
        artifactId: state.artifactId,
        errorMessage: deniedMsg,
      };
    }

    if (!state.versionId) {
      const noVerMsg = `No artifact versions exist for artifact '${state.artifactId}'.`;
      return {
        success: false,
        resultCode: 'VERSION_NOT_FOUND',
        message: noVerMsg,
        changed: false,
        artifactId: state.artifactId,
        errorMessage: noVerMsg,
      };
    }

    const freezeBlocks = Boolean(params.freezeRefreshedBlocks);
    const forceRefreshFrozen = Boolean(params.forceRefreshFrozen);
    const forceSaveIfUnchanged = Boolean(params.forceSaveIfUnchanged);
    const driverClass = state.driverClass ?? '';
    const rawContent = Buffer.isBuffer(state.content) ? '' : String(state.content ?? '');
    const prevConfig = ParseArtifactVersionConfiguration(state.configuration) ?? {};
    const domain = ResolvePresenceDomain(state.typeName);
    let workingEmitted = false;

    try {
      await this.EmitAgentPresence({
        artifactId: state.artifactId,
        phase: 'working',
        contextUser: params.contextUser,
        agentRunId: params.agentRunId,
        agentName: params.agentName,
        toolName: 'refresh_and_snapshot_artifact',
        actionSummary: freezeBlocks
          ? `Refreshing & freezing "${state.name}"`
          : `Refreshing live data in "${state.name}"`,
        location: { Domain: domain },
      });
      workingEmitted = true;

      const refreshResult = await this.computeRefreshedArtifactPayload({
        artifactId: state.artifactId,
        rawContent,
        rawConfiguration: state.configuration ?? null,
        driverClass,
        title: state.name,
        freezeBlocks,
        forceRefreshFrozen,
        contextUser: params.contextUser,
        provider: params.provider,
      });

      if (refreshResult.updatedContent !== rawContent) {
        const isArtifactOwner =
          state.permissions.Source === 'Owner' ||
          Boolean(state.ownerUserId && UUIDsEqual(state.ownerUserId, params.contextUser.ID));
        const lockCheck = ValidateArtifactContentMutationAgainstLocks(
          rawContent,
          refreshResult.updatedContent,
          params.contextUser.ID,
          isArtifactOwner
        );
        if (!lockCheck.Allowed) {
          const deniedMsg = lockCheck.Reason ?? 'Write rejected: refreshed content modifies a locked region.';
          return {
            success: false,
            resultCode: 'PERMISSION_DENIED',
            message: deniedMsg,
            changed: false,
            artifactId: state.artifactId,
            errorMessage: deniedMsg,
          };
        }
      }

      const prevDigestHash =
        typeof prevConfig['livingReportDigest'] === 'string'
          ? prevConfig['livingReportDigest']
          : this.computeBaselineDigestForComparison(rawContent, driverClass, state.configuration ?? null, state.name);
      const changed = refreshResult.digestHash !== prevDigestHash;

      if (!changed && !forceSaveIfUnchanged) {
        return {
          success: true,
          resultCode: 'NO_CHANGES',
          message: `No changes detected for '${state.name}' (v${state.versionNumber}).`,
          changed: false,
          artifactId: state.artifactId,
          versionId: state.versionId,
          previousVersionId: state.versionId,
          newVersionId: state.versionId,
          previousVersionNumber: state.versionNumber,
          versionNumber: state.versionNumber,
          newVersionNumber: state.versionNumber,
          artifactName: state.name,
          artifactTypeName: state.typeName,
          driverClass,
          diffSummary: 'No changes detected.',
          signedFrozenBlocksCount: refreshResult.signedFrozenBlocksCount,
          highlightLines: refreshResult.highlightLines,
        };
      }

      const nextVersionNumber = Math.max(state.versionNumber, state.dbVersionNumber) + 1;
      const prevLines = this.extractPreviousHighlightLines(prevConfig);
      const diffSummary = this.computeRefreshDiffSummary(
        state.name,
        state.versionNumber,
        nextVersionNumber,
        prevLines,
        refreshResult.highlightLines,
      );

      let workingXlsxBytes = state.originalXlsxBytes;
      let latestXlsxBase64: string | undefined;
      if (workingXlsxBytes || state.contentMode === 'File') {
        const materialized = this.materializeXlsxForContent(refreshResult.updatedContent, workingXlsxBytes);
        if (materialized.xlsxBytes) {
          workingXlsxBytes = materialized.xlsxBytes;
          latestXlsxBase64 = materialized.xlsxBase64;
        }
      }

      const configurationPatch: ArtifactToolArgs = {
        livingReportDigest: refreshResult.digestHash,
        livingReportHighlightLines: refreshResult.highlightLines,
        livingReportRefreshedAt: new Date().toISOString(),
      };
      const comments =
        (params.versionComments ?? '').trim() ||
        `Scheduled refresh from v${state.versionNumber}: ${diffSummary}`;

      const persistRes = await this.persistLoadedArtifactMutation({
        provider: params.provider,
        contextUser: params.contextUser,
        state,
        previousContentStr: rawContent,
        finalContentStr: refreshResult.updatedContent,
        workingXlsxBytes,
        latestXlsxBase64,
        lastToolName: 'refresh_and_snapshot_artifact',
        lastToolInput: {
          freezeRefreshedBlocks: freezeBlocks,
          forceRefreshFrozen,
          forceSaveIfUnchanged,
        },
        lastLocation: { Domain: domain },
        comments,
        configurationPatch,
        agentRunId: params.agentRunId,
        agentName: params.agentName,
      });

      if (!persistRes.success || !persistRes.versionId) {
        const failMsg = persistRes.errorMessage || `Failed to save refreshed artifact version v${nextVersionNumber}.`;
        return {
          success: false,
          resultCode: 'FAILED',
          message: failMsg,
          changed,
          artifactId: state.artifactId,
          previousVersionId: state.versionId,
          previousVersionNumber: state.versionNumber,
          artifactName: state.name,
          artifactTypeName: state.typeName,
          driverClass,
          errorMessage: failMsg,
        };
      }

      return {
        success: true,
        resultCode: 'SUCCESS',
        message: `Refreshed '${state.name}' to v${persistRes.versionNumber}: ${diffSummary}`,
        changed,
        artifactId: state.artifactId,
        versionId: persistRes.versionId,
        previousVersionId: state.versionId,
        newVersionId: persistRes.versionId,
        previousVersionNumber: state.versionNumber,
        versionNumber: persistRes.versionNumber,
        newVersionNumber: persistRes.versionNumber,
        artifactName: state.name,
        artifactTypeName: state.typeName,
        driverClass,
        diffSummary,
        signedFrozenBlocksCount: refreshResult.signedFrozenBlocksCount,
        highlightLines: refreshResult.highlightLines,
      };
    } catch (err) {
      const msg = `RefreshAndSnapshotArtifact error: ${err instanceof Error ? err.message : String(err)}`;
      return {
        success: false,
        resultCode: 'FAILED',
        message: msg,
        changed: false,
        artifactId: state.artifactId,
        errorMessage: msg,
      };
    } finally {
      if (workingEmitted) {
        await this.EmitAgentPresence({
          artifactId: state.artifactId,
          phase: 'exit',
          contextUser: params.contextUser,
          agentRunId: params.agentRunId,
          agentName: params.agentName,
        });
      }
    }
  }

  /**
   * Refreshes an in-memory artifact payload (Spreadsheet, SlideDeck, or Markdown Document),
   * optionally freezes blocks/tables, and returns the updated payload, configuration, and diff digest.
   */
  public async RefreshArtifactPayloadInMemory(input: {
    artifactId: string;
    content: string;
    configuration?: string | null;
    artifactTypeName?: string;
    driverClass?: string;
    contextUser: UserInfo;
    provider: IMetadataProvider;
    freezeRefreshedBlocks?: boolean;
    forceRefreshFrozen?: boolean;
    title?: string;
  }): Promise<{
    changed: boolean;
    updatedContent: string;
    updatedConfiguration: string;
    diffSummary: string;
    signedFrozenBlocksCount: number;
    highlightLines: string[];
  }> {
    const driverClass = input.driverClass ?? '';
    const title = input.title ?? input.artifactTypeName ?? 'Artifact';
    const freezeBlocks = input.freezeRefreshedBlocks === true;
    const forceRefreshFrozen = input.forceRefreshFrozen === true;
    const prevConfig = ParseArtifactVersionConfiguration(input.configuration ?? null) ?? {};
    const prevDigestHash =
      typeof prevConfig['livingReportDigest'] === 'string'
        ? prevConfig['livingReportDigest']
        : this.computeBaselineDigestForComparison(
            input.content,
            driverClass,
            input.configuration ?? null,
            title,
          );
    const refreshed = await this.computeRefreshedArtifactPayload({
      rawContent: input.content,
      rawConfiguration: input.configuration ?? null,
      driverClass,
      title,
      freezeBlocks,
      forceRefreshFrozen,
      contextUser: input.contextUser,
      provider: input.provider,
    });
    const changed = refreshed.digestHash !== prevDigestHash || refreshed.signedFrozenBlocksCount > 0;
    const prevLines = this.extractPreviousHighlightLines(prevConfig);
    const diffSummary = changed
      ? this.computeRefreshDiffSummary(title, 1, 2, prevLines, refreshed.highlightLines)
      : `All live blocks matched prior snapshot; no changes.`;
    const mergedCfg = JSON.stringify({
      ...prevConfig,
      livingReportDigest: refreshed.digestHash,
      livingReportHighlightLines: refreshed.highlightLines,
      livingReportRefreshedAt: new Date().toISOString(),
    });
    const updatedConfiguration =
      BuildArtifactVersionConfigurationWithPreview(mergedCfg, refreshed.updatedContent, driverClass || undefined, title) ?? '{}';

    return {
      changed,
      updatedContent: refreshed.updatedContent,
      updatedConfiguration,
      diffSummary,
      signedFrozenBlocksCount: refreshed.signedFrozenBlocksCount,
      highlightLines: refreshed.highlightLines,
    };
  }

  private computeFullPayloadDigestHash(payload: string): string {
    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  private canonicalizeWorkbookForDigest(wb: WorkbookSpec): string {
    const serialized = SpreadsheetEngine.Instance.SerializeWorkbook(wb, { preserveTimestamps: true });
    try {
      const parsed = JSON.parse(serialized) as {
        UpdatedAt?: string;
        Worksheets?: Array<{
          UpdatedAt?: string;
          LiveTables?: Array<{ LastRefreshedAt?: string }>;
        }>;
      };
      if (parsed && typeof parsed === 'object') {
        parsed.UpdatedAt = '';
        if (Array.isArray(parsed.Worksheets)) {
          for (const ws of parsed.Worksheets) {
            if (ws && typeof ws === 'object') {
              ws.UpdatedAt = '';
              if (Array.isArray(ws.LiveTables)) {
                for (const tbl of ws.LiveTables) {
                  if (tbl && typeof tbl === 'object') {
                    tbl.LastRefreshedAt = '';
                  }
                }
              }
            }
          }
        }
        return JSON.stringify(parsed);
      }
    } catch {
      // Fall back to preserveTimestamps serialization
    }
    return serialized;
  }

  private buildSpreadsheetCellDigestEntries(wb: WorkbookSpec): string[] {
    const fullCellEntries: string[] = [];
    for (const ws of wb.Worksheets) {
      const sortedCells = Object.values(ws.Cells).sort((a, b) => a.Address.localeCompare(b.Address));
      for (const c of sortedCells) {
        fullCellEntries.push(`${ws.Name}!${c.Address}=${String(c.ComputedValue ?? c.RawValue ?? '')}`);
      }
    }
    return fullCellEntries;
  }

  private canonicalizeDeckForDigest(deck: SlideDeckSpec): string {
    const serialized = SlideDeckEngine.Instance.SerializeDeckSpec(deck);
    try {
      const parsed = JSON.parse(serialized) as {
        UpdatedAt?: string;
        Slides?: Array<{ UpdatedAt?: string }>;
      };
      if (parsed && typeof parsed === 'object') {
        parsed.UpdatedAt = '';
        if (Array.isArray(parsed.Slides)) {
          for (const slide of parsed.Slides) {
            if (slide && typeof slide === 'object') {
              slide.UpdatedAt = '';
            }
          }
        }
        return JSON.stringify(parsed);
      }
    } catch {
      // Fall back to serialized deck JSON
    }
    return serialized;
  }

  private buildDeckDigestParts(
    deck: SlideDeckSpec,
    liveResults?: Record<string, DocumentBlockExecutionResult>,
  ): { fullDeckDigestParts: string[]; highlightLines: string[] } {
    const fullDeckDigestParts: string[] = [];
    const highlightLines: string[] = [];
    for (const s of deck.Slides) {
      const regionSummaries = s.Regions.map((r) => r.MarkdownContent ?? '');
      fullDeckDigestParts.push(`Slide[${s.SlideID}|${s.Title}]: ${regionSummaries.join(' | ')}`);
      highlightLines.push(
        `Slide[${s.Title}]: ${regionSummaries.map((m) => m.slice(0, 80)).join(' | ')}`,
      );
    }
    if (liveResults) {
      for (const [blockId, res] of Object.entries(liveResults).sort(([a], [b]) => a.localeCompare(b))) {
        // fls-guard: hashed internally for digest calculation only; never emitted to highlightLines or callers (`B7`).
        const rowsJson = JSON.stringify(res.Rows);
        fullDeckDigestParts.push(`Block[${blockId}]: rows=${res.TotalRowCount}, all=${rowsJson}`);
      }
    }
    return { fullDeckDigestParts, highlightLines };
  }

  private computeBaselineDigestForComparison(
    rawContent: string,
    driverClass: string,
    rawConfiguration: string | null,
    title: string,
  ): string {
    const isSheet =
      driverClass === 'SpreadsheetArtifactViewerPlugin' ||
      (rawContent.trim().startsWith('{') && rawContent.includes('"Worksheets"'));
    if (isSheet) {
      try {
        const wb = SpreadsheetEngine.Instance.ParseWorkbook(rawContent, rawConfiguration);
        const fullCellEntries = this.buildSpreadsheetCellDigestEntries(wb);
        return this.computeFullPayloadDigestHash(
          JSON.stringify({ updatedContent: this.canonicalizeWorkbookForDigest(wb), fullCellEntries }),
        );
      } catch {
        return this.computeFullPayloadDigestHash(rawContent);
      }
    }
    const isDeck =
      driverClass === 'SlideDeckArtifactViewerPlugin' ||
      (rawContent.trim().startsWith('{') && rawContent.includes('"Slides"'));
    if (isDeck) {
      try {
        const deck = SlideDeckEngine.Instance.ParseDeckSpec(rawContent, title);
        const { fullDeckDigestParts } = this.buildDeckDigestParts(deck);
        return this.computeFullPayloadDigestHash(
          JSON.stringify({ updatedContent: this.canonicalizeDeckForDigest(deck), fullDeckDigestParts }),
        );
      } catch {
        return this.computeFullPayloadDigestHash(rawContent);
      }
    }
    try {
      const segments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(rawContent);
      const fullDigestParts: string[] = [];
      for (const seg of segments) {
        if (seg.Type === 'markdown') {
          fullDigestParts.push(seg.RawText);
        } else if (seg.BlockSpec) {
          const snap = seg.BlockSpec.FrozenSnapshot;
          if (seg.BlockSpec.Mode === 'Frozen' && snap) {
            // fls-guard: hashed internally for digest calculation only; never returned to caller
            const snapRowsJson = JSON.stringify(snap.Rows);
            fullDigestParts.push(`FrozenBlock[${seg.BlockSpec.BlockID}]: rows=${snap.TotalRowCount}, all=${snapRowsJson}`);
          } else {
            fullDigestParts.push(seg.RawText);
          }
        }
      }
      return this.computeFullPayloadDigestHash(
        JSON.stringify({ updatedContent: rawContent, fullDigestParts }),
      );
    } catch {
      return this.computeFullPayloadDigestHash(rawContent);
    }
  }

  private async computeRefreshedArtifactPayload(input: {
    artifactId?: string;
    rawContent: string;
    rawConfiguration: string | null;
    driverClass: string;
    title: string;
    freezeBlocks: boolean;
    forceRefreshFrozen: boolean;
    contextUser: UserInfo;
    provider: IMetadataProvider;
  }): Promise<{
    updatedContent: string;
    digestHash: string;
    highlightLines: string[];
    signedFrozenBlocksCount: number;
  }> {
    const isSheet =
      input.driverClass === 'SpreadsheetArtifactViewerPlugin' ||
      (input.rawContent.trim().startsWith('{') && input.rawContent.includes('"Worksheets"'));
    if (isSheet) {
      const engine = SpreadsheetEngine.Instance;
      const wb = engine.ParseWorkbook(input.rawContent, input.rawConfiguration);
      const tableResults = await engine.RefreshLiveTables(wb, input.contextUser, input.provider, {
        ForceRefreshFrozen: input.freezeBlocks || input.forceRefreshFrozen,
      });
      await engine.EvaluateMjCustomFunctions(wb, input.contextUser, input.provider, {
        BypassCache: true,
      });
      engine.EvaluateWorkbook(wb);

      let signedFrozenBlocksCount = 0;
      if (input.freezeBlocks) {
        for (const ws of wb.Worksheets) {
          for (const tbl of ws.LiveTables) {
            const tblRes = tableResults[tbl.TableID];
            if (tblRes && tblRes.Success && !tblRes.AccessDenied) {
              engine.FreezeLiveTable(
                wb,
                ws.Name,
                tbl.TableID,
                tblRes,
                input.contextUser,
                true,
                undefined,
                input.artifactId
              );
              signedFrozenBlocksCount++;
            }
          }
        }
      }

      // fls-guard: fullCellEntries hashed for digest ONLY; highlightLines use persisted sheet structure & static non-=MJ cells (`B7`).
      const fullCellEntries = this.buildSpreadsheetCellDigestEntries(wb);
      const highlightLines: string[] = [];
      for (const ws of wb.Worksheets) {
        highlightLines.push(`Sheet[${ws.Name}]: liveTables=${ws.LiveTables.length}`);
        const liveCellCoords = new Set<string>();
        for (const tbl of ws.LiveTables) {
          const anchor = ParseRangeAddress(tbl.AnchorCell || 'A1', 10_000, 512);
          if (!anchor) continue;
          const rowCount = (tbl.LastRowCount ?? 0) + (tbl.IncludeHeaders !== false ? 1 : 0);
          const colCount = Math.max(tbl.LastColumnCount ?? 0, 1);
          for (let r = anchor.startRow; r < anchor.startRow + rowCount; r++) {
            for (let c = anchor.startCol; c < anchor.startCol + colCount; c++) {
              liveCellCoords.add(`${r}:${c}`);
            }
          }
        }
        const sortedCells = Object.values(ws.Cells).sort((a, b) => a.Address.localeCompare(b.Address));
        for (const cell of sortedCells) {
          if (highlightLines.length >= 80) break;
          if (cell.Formula && /^\s*=\s*MJ\./i.test(cell.Formula)) continue;
          const pos = ParseRangeAddress(cell.Address, 10_000, 512);
          if (pos && liveCellCoords.has(`${pos.startRow}:${pos.startCol}`)) continue;
          highlightLines.push(`${ws.Name}!${cell.Address}=${String(cell.RawValue ?? '')}`);
        }
      }
      const updatedContent = engine.SerializeWorkbook(wb, { preserveTimestamps: true });
      const canonicalContent = this.canonicalizeWorkbookForDigest(wb);
      return {
        updatedContent,
        digestHash: this.computeFullPayloadDigestHash(
          JSON.stringify({ updatedContent: canonicalContent, fullCellEntries }),
        ),
        highlightLines: highlightLines.slice(0, 80),
        signedFrozenBlocksCount,
      };
    }

    const isDeck =
      input.driverClass === 'SlideDeckArtifactViewerPlugin' ||
      (input.rawContent.trim().startsWith('{') && input.rawContent.includes('"Slides"'));
    if (isDeck) {
      const slideEngine = SlideDeckEngine.Instance;
      let deck = slideEngine.ParseDeckSpec(input.rawContent, input.title);
      const liveResults = await slideEngine.ExecuteDeckLiveBlocks(deck, input.provider, input.contextUser);
      let signedFrozenBlocksCount = 0;
      if (input.freezeBlocks) {
        const resultsMap = new Map<string, DocumentBlockExecutionResult>(Object.entries(liveResults));
        const secret = DocumentLiveBlockEngine.Instance.ResolveSigningSecret() ?? undefined;
        deck = slideEngine.FreezeDeckLiveBlocksForPresentation(deck, resultsMap, input.contextUser, {
          SigningSecret: secret,
          ArtifactID: input.artifactId,
        });
        signedFrozenBlocksCount = resultsMap.size;
      }

      const { fullDeckDigestParts, highlightLines } = this.buildDeckDigestParts(deck, liveResults);
      const updatedContent = slideEngine.SerializeDeckSpec(deck);
      const canonicalDeckContent = this.canonicalizeDeckForDigest(deck);
      return {
        updatedContent,
        digestHash: this.computeFullPayloadDigestHash(
          JSON.stringify({ updatedContent: canonicalDeckContent, fullDeckDigestParts }),
        ),
        highlightLines: highlightLines.slice(0, 80),
        signedFrozenBlocksCount,
      };
    }

    // Markdown Document with :::mj-block directives
    const docEngine = DocumentLiveBlockEngine.Instance;
    const segments = docEngine.ParseMarkdownDirectives(input.rawContent);
    const rebuiltParts: string[] = [];
    const highlightLines: string[] = [];
    const fullDigestParts: string[] = [];
    let signedFrozenBlocksCount = 0;

    for (const seg of segments) {
      if (seg.Type === 'markdown') {
        rebuiltParts.push(seg.RawText);
        fullDigestParts.push(seg.RawText);
        const textSample = seg.RawText.split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 10);
        highlightLines.push(...textSample);
        continue;
      }
      if (seg.BlockSpec) {
        const isFrozen = seg.BlockSpec.Mode === 'Frozen';
        if (isFrozen && !input.freezeBlocks && !input.forceRefreshFrozen && seg.BlockSpec.FrozenSnapshot) {
          const snap = seg.BlockSpec.FrozenSnapshot;
          // fls-guard: hashed internally for digest calculation only; never emitted to highlightLines or callers (`B7`).
          const snapRowsJson = JSON.stringify(snap.Rows);
          fullDigestParts.push(`FrozenBlock[${seg.BlockSpec.BlockID}]: rows=${snap.TotalRowCount}, all=${snapRowsJson}`);
          highlightLines.push(
            `Block[${seg.BlockSpec.Title || seg.BlockSpec.BlockID}]: mode=${seg.BlockSpec.Mode}`,
          );
          rebuiltParts.push(seg.RawText);
          continue;
        }

        const res = await docEngine.ExecuteBlock(seg.BlockSpec, input.contextUser, input.provider);
        // fls-guard: hashed internally for digest calculation only; never emitted to highlightLines or callers (`B7`).
        const resRowsJson = JSON.stringify(res.Rows);
        fullDigestParts.push(`Block[${seg.BlockSpec.BlockID}]: rows=${res.TotalRowCount}, all=${resRowsJson}`);
        highlightLines.push(
          `Block[${seg.BlockSpec.Title || seg.BlockSpec.BlockID}]: mode=${seg.BlockSpec.Mode}`,
        );
        if (input.freezeBlocks) {
          const frozen = await docEngine.FreezeBlock(
            seg.BlockSpec,
            input.contextUser,
            true,
            input.provider,
            undefined,
            input.artifactId
          );
          if (frozen.Success && frozen.UpdatedSpec) {
            signedFrozenBlocksCount++;
            rebuiltParts.push(docEngine.SerializeBlockToMarkdownDirective(frozen.UpdatedSpec));
            continue;
          }
        }
      }
      rebuiltParts.push(seg.RawText);
    }

    const updatedContent = input.freezeBlocks ? rebuiltParts.join('\n') : input.rawContent;
    return {
      updatedContent,
      digestHash: this.computeFullPayloadDigestHash(JSON.stringify({ updatedContent, fullDigestParts })),
      highlightLines: highlightLines.slice(0, 80),
      signedFrozenBlocksCount,
    };
  }

  private extractPreviousHighlightLines(prevConfig: NonNullable<ReturnType<typeof ParseArtifactVersionConfiguration>>): string[] {
    const stored = prevConfig['livingReportHighlightLines'];
    if (Array.isArray(stored)) {
      return stored.filter((v): v is string => typeof v === 'string');
    }
    const snap: ArtifactPreviewSnapshot | undefined = prevConfig.previewSnapshot;
    if (snap && snap.Kind === 'doc') {
      return [snap.Heading, snap.Excerpt].filter(Boolean);
    }
    return [];
  }

  private computeRefreshDiffSummary(
    artifactName: string,
    prevVersionNumber: number,
    nextVersionNumber: number,
    prevLines: string[],
    nextLines: string[],
  ): string {
    const prevSet = new Set(prevLines);
    const added = nextLines.filter((l) => !prevSet.has(l));
    const nextSet = new Set(nextLines);
    const removed = prevLines.filter((l) => !nextSet.has(l));

    if (added.length === 0 && removed.length === 0) {
      return `Saved '${artifactName}' v${nextVersionNumber} (from v${prevVersionNumber}).`;
    }
    const highlights = added.slice(0, 3).map((l) => `- ${l}`).join('\n');
    return `Updated '${artifactName}' from v${prevVersionNumber} to v${nextVersionNumber} (${added.length} added/changed, ${removed.length} removed)${highlights ? `:\n${highlights}` : '.'}`;
  }

  /**
   * Lists readable governed artifacts in a collection or owned/shared with the current user.
   */
  public async ListWorkspaceArtifacts(
    params: ListWorkspaceArtifactsParams,
  ): Promise<{ success: boolean; artifacts: WorkspaceArtifactListItem[]; errorMessage?: string }> {
    const collectionId = (params.collectionId ?? '').trim();
    const typeFilter = (params.typeFilter ?? '').trim().toLowerCase();
    const normalizedTypeFilter = typeFilter ? this.NormalizeArtifactTypeName(params.typeFilter).toLowerCase() : '';
    const search = (params.search ?? '').trim().toLowerCase();
    const maxResults = Math.min(Math.max(params.maxResults ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);

    try {
      await ArtifactMetadataEngine.Instance.Config(false, params.contextUser, params.provider);
    } catch {
      // Proceed even if metadata engine warmup falls back to raw fields
    }

    const rv = RunView.FromMetadataProvider(params.provider);
    const sqlFilters: string[] = [];

    if (collectionId) {
      const colCheck = await this.CheckCollectionPermission(params.provider, params.contextUser, collectionId, 'read');
      if (!colCheck.allowed) {
        return { success: false, artifacts: [], errorMessage: colCheck.reason };
      }
      const colArtRes = await rv.RunView<{ ArtifactVersionID?: string | null }>(
        {
          EntityName: 'MJ: Collection Artifacts',
          ExtraFilter: `CollectionID='${EscapeSQLString(collectionId)}'`,
          Fields: ['ArtifactVersionID'],
          MaxRows: 500,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        params.contextUser,
      );
      const versionIds = Array.from(
        new Set(
          (colArtRes.Success && colArtRes.Results ? colArtRes.Results : [])
            .map((r) => (r.ArtifactVersionID ?? '').trim())
            .filter((id) => IsValidUUID(id)),
        ),
      );
      if (versionIds.length === 0) {
        return { success: true, artifacts: [] };
      }
      const verInList = versionIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
      const verLookup = await rv.RunView<{ ArtifactID?: string | null }>(
        {
          EntityName: 'MJ: Artifact Versions',
          ExtraFilter: `ID IN (${verInList})`,
          Fields: ['ArtifactID'],
          MaxRows: 500,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        params.contextUser,
      );
      const colArtifactIds = Array.from(
        new Set(
          (verLookup.Success && verLookup.Results ? verLookup.Results : [])
            .map((r) => (r.ArtifactID ?? '').trim())
            .filter((id) => IsValidUUID(id)),
        ),
      );
      if (colArtifactIds.length === 0) {
        return { success: true, artifacts: [] };
      }
      sqlFilters.push(`ID IN (${colArtifactIds.map((id) => `'${EscapeSQLString(id)}'`).join(',')})`);
    } else {
      const readableIds = await ArtifactPermissionEngine.Instance.BuildReadableArtifactIdSet(
        params.provider,
        params.contextUser,
      );
      if (readableIds.size === 0) {
        return { success: true, artifacts: [] };
      }
      sqlFilters.push(`ID IN (${Array.from(readableIds).map((id) => `'${EscapeSQLString(id)}'`).join(',')})`);
    }

    if (search) {
      sqlFilters.push(`Name LIKE '%${EscapeSQLString(this.escapeSqlLike(search))}%'`);
    }
    if (typeFilter) {
      const canonicalName = this.NormalizeArtifactTypeName(params.typeFilter);
      const types = ArtifactMetadataEngine.Instance.ArtifactTypes ?? [];
      const matchedTypeNames = types
        .filter(
          (t) =>
            t.Name.toLowerCase().includes(typeFilter) ||
            t.Name.toLowerCase() === normalizedTypeFilter,
        )
        .map((t) => t.Name);
      if (matchedTypeNames.length > 0) {
        sqlFilters.push(
          `Type IN (${Array.from(new Set(matchedTypeNames))
            .map((n) => `'${EscapeSQLString(n)}'`)
            .join(',')})`,
        );
      } else {
        const escapedLike = EscapeSQLString(this.escapeSqlLike(typeFilter));
        if (canonicalName.toLowerCase() !== typeFilter) {
          sqlFilters.push(`(Type LIKE '%${escapedLike}%' OR Type='${EscapeSQLString(canonicalName)}')`);
        } else {
          sqlFilters.push(`Type LIKE '%${escapedLike}%'`);
        }
      }
    }

    const fetchLimit = Math.min(Math.max((offset + maxResults) * 2, maxResults), 500);
    const artRes = await rv.RunView<{
      ID: string;
      Name?: string | null;
      Description?: string | null;
      Type?: string | null;
      TypeID?: string | null;
      UserID?: string | null;
    }>(
      {
        EntityName: 'MJ: Artifacts',
        ExtraFilter: sqlFilters.join(' AND '),
        OrderBy: '__mj_UpdatedAt DESC',
        Fields: ['ID', 'Name', 'Description', 'Type', 'TypeID', 'UserID'],
        MaxRows: fetchLimit,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      },
      params.contextUser,
    );

    const candidateArts: Array<{
      ID: string;
      Name?: string | null;
      Description?: string | null;
      Type?: string | null;
      TypeID?: string | null;
      UserID?: string | null;
    }> = [];
    const seen = new Set<string>();
    for (const row of artRes.Success && artRes.Results ? artRes.Results : []) {
      const id = (row.ID ?? '').trim();
      const norm = NormalizeUUID(id);
      if (id && !seen.has(norm)) {
        seen.add(norm);
        candidateArts.push(row);
      }
    }
    if (candidateArts.length === 0) {
      return { success: true, artifacts: [] };
    }

    // Batch-load versions for all matching artifacts instead of N+1 LoadReadableArtifactState queries
    const artIdInList = candidateArts.map((a) => `'${EscapeSQLString(a.ID)}'`).join(',');
    const batchVerRes = await rv.RunView<{
      ID: string;
      ArtifactID: string;
      VersionNumber?: number | null;
      Name?: string | null;
      ContentMode?: string | null;
      Content?: string | null;
      Configuration?: string | null;
      MimeType?: string | null;
    }>(
      {
        EntityName: 'MJ: Artifact Versions',
        ExtraFilter: `ArtifactID IN (${artIdInList})`,
        OrderBy: 'VersionNumber DESC',
        Fields: ['ID', 'ArtifactID', 'VersionNumber', 'Name', 'ContentMode', 'Content', 'Configuration', 'MimeType'],
        MaxRows: candidateArts.length * 10,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      },
      params.contextUser,
    );
    const latestVersionByArtId = new Map<
      string,
      {
        ID: string;
        VersionNumber?: number | null;
        Name?: string | null;
        ContentMode?: string | null;
        Content?: string | null;
        Configuration?: string | null;
        MimeType?: string | null;
      }
    >();
    for (const v of batchVerRes.Success && batchVerRes.Results ? batchVerRes.Results : []) {
      const normArt = NormalizeUUID(v.ArtifactID);
      const existing = latestVersionByArtId.get(normArt);
      if (!existing || (v.VersionNumber ?? 0) > (existing.VersionNumber ?? 0)) {
        latestVersionByArtId.set(normArt, v);
      }
    }

    const items: WorkspaceArtifactListItem[] = [];
    let matchedCount = 0;
    const liveReader = GetArtifactLiveContentReaderHook();
    for (const art of candidateArts) {
      if (items.length >= maxResults) break;

      const artName = (art.Name ?? 'Untitled Artifact').trim();
      const typeEntity = art.Type
        ? ArtifactMetadataEngine.Instance.FindArtifactType(art.Type)
        : undefined;
      const typeName = (art.Type ?? typeEntity?.Name ?? 'Document').trim();
      const stTypeLower = typeName.toLowerCase();
      if (typeFilter && !stTypeLower.includes(typeFilter) && stTypeLower !== normalizedTypeFilter) continue;
      if (search && !artName.toLowerCase().includes(search)) continue;

      const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
        params.provider,
        art.ID,
        params.contextUser,
      );
      if (!perms.CanRead) continue;

      matchedCount++;
      if (matchedCount <= offset) continue;

      const ver = latestVersionByArtId.get(NormalizeUUID(art.ID));
      let contentStr: string | null = ver?.Content ?? null;
      if (ver?.ContentMode === 'File' && ver?.Configuration) {
        contentStr = ver.Configuration;
      }
      if (liveReader) {
        try {
          const liveSnap = await liveReader(art.ID, params.contextUser);
          if (liveSnap && typeof liveSnap.Content === 'string') {
            contentStr = liveSnap.Content;
          }
        } catch {
          // Non-fatal fallback to DB snapshot
        }
      }

      const displayName = (ver?.Name ?? artName).trim();
      const digest = ArtifactSynthesisEngine.Instance.ExtractSourceDigest(
        {
          ArtifactID: art.ID,
          Name: displayName,
          ArtifactType: typeName,
          VersionNumber: ver?.VersionNumber ?? 1,
          ContentMode: ver?.ContentMode === 'File' ? 'File' : 'Text',
          Content: contentStr,
          Configuration: ver?.Configuration ?? null,
          Description: art.Description ?? null,
          MimeType: ver?.MimeType ?? typeEntity?.ContentType ?? null,
        },
        1200,
      );

      items.push({
        artifactId: art.ID,
        versionId: ver?.ID,
        versionNumber: ver?.VersionNumber ?? undefined,
        name: displayName,
        typeName,
        typeEntity: typeEntity ?? undefined,
        driverClass: typeEntity?.DriverClass ?? undefined,
        canEdit: perms.CanEdit,
        sections: digest.Sections,
        embeddedCharts: digest.EmbeddedCharts,
        summaryPreview: digest.SummaryText.slice(0, 400),
      });
    }

    return { success: true, artifacts: items };
  }

  private resolveLibraryChain(typeName: string): BaseArtifactToolLibrary[] {
    const engine = ArtifactMetadataEngine.Instance;
    if (!engine.ArtifactTypes?.length) return [];

    const typesById = IndexByUUID(engine.ArtifactTypes);
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
      current = current.ParentID ? typesById.Get(current.ParentID) : undefined;
    }
    return chain;
  }

  private resolveLeafLibrary(typeName: string, toolLibraryClass?: string): ArtifactToolLibraryWithRevisionHash {
    if (toolLibraryClass) {
      const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
        BaseArtifactToolLibrary,
        toolLibraryClass,
      );
      if (instance) return instance;
    }

    const lower = (typeName ?? '').toLowerCase();
    // Order specific extensions & domain types ahead of generic substrings ('data', 'document')
    if (lower.includes('search')) {
      return new SearchResultSetToolLibrary();
    }
    if (lower.includes('csv')) {
      return new CSVToolLibrary();
    }
    if (lower.includes('pdf')) {
      const lib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, 'PDFToolLibrary');
      return lib ?? new PDFToolLibrary();
    }
    if (lower.includes('word') || lower.includes('docx')) {
      const lib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, 'DocxToolLibrary');
      return lib ?? new DocxToolLibrary();
    }
    if (lower.includes('excel') || lower.includes('xlsx') || lower.includes('spreadsheet') || lower.includes('sheet')) {
      const sheetLib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
        BaseArtifactToolLibrary,
        'SpreadsheetToolLibrary',
      );
      return sheetLib ?? new SpreadsheetToolLibrary();
    }
    if (lower.includes('presentation') || lower.includes('slide') || lower.includes('deck')) {
      const slideLib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
        BaseArtifactToolLibrary,
        'SlideDeckToolLibrary',
      );
      return slideLib ?? new SlideDeckToolLibrary();
    }
    if (lower.includes('whiteboard')) {
      const wbLib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
        BaseArtifactToolLibrary,
        'WhiteboardToolLibrary',
      );
      return wbLib ?? new WhiteboardToolLibrary();
    }
    if (lower.includes('markdown')) {
      const docLib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
        BaseArtifactToolLibrary,
        'DocumentToolLibrary',
      );
      return docLib ?? new DocumentToolLibrary();
    }
    if (lower.includes('json')) {
      return new JSONToolLibrary();
    }
    if (lower.includes('data') || lower.includes('snapshot')) {
      return new DataSnapshotToolLibrary();
    }
    if (lower.includes('document')) {
      const docLib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(
        BaseArtifactToolLibrary,
        'DocumentToolLibrary',
      );
      return docLib ?? new DocumentToolLibrary();
    }
    return new TextToolLibrary();
  }
}
