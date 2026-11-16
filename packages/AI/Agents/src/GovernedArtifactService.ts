import { createHash } from 'node:crypto';
import {
  BaseSingleton,
  CleanAndParseJSON,
  EscapeSQLString,
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
  ArtifactSynthesisEngine,
  BuildArtifactVersionConfigurationWithPreview,
  MJArtifactEntity,
  MJArtifactTypeEntity,
  MJArtifactVersionEntity,
  MJCollectionArtifactEntity,
  MJEnvironmentEntityExtended,
  MJFileEntity,
  SlideDeckEngine,
  SpreadsheetEngine,
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
import { DataSnapshotToolLibrary } from './artifact-tools/DataSnapshotToolLibrary';
import { DocumentToolLibrary } from './artifact-tools/DocumentToolLibrary';
import { JSONToolLibrary } from './artifact-tools/JSONToolLibrary';
import { SlideDeckToolLibrary } from './artifact-tools/SlideDeckToolLibrary';
import { SpreadsheetToolLibrary } from './artifact-tools/SpreadsheetToolLibrary';
import { TextToolLibrary } from './artifact-tools/TextToolLibrary';
import { WhiteboardToolLibrary } from './artifact-tools/WhiteboardToolLibrary';

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
  collectionId?: string;
  environmentId?: string;
  agentRunId?: string;
  agentName?: string;
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

  private readonly artifactLocks = new Map<string, Promise<void>>();

  protected constructor() {
    super();
  }

  private async withArtifactLock<T>(artifactId: string, fn: () => Promise<T>): Promise<T> {
    const key = NormalizeUUID(artifactId) || (artifactId ?? '').trim().toLowerCase();
    const prev = this.artifactLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = prev.then(() => current, () => current);
    this.artifactLocks.set(key, chain);

    try {
      await prev;
      return await fn();
    } finally {
      release();
      if (this.artifactLocks.get(key) === chain) {
        this.artifactLocks.delete(key);
      }
    }
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
    const colRes = await rv.RunView<{ ID: string; OwnerID?: string | null; EnvironmentID?: string | null }>(
      {
        EntityName: 'MJ: Collections',
        ExtraFilter: `ID='${EscapeSQLString(trimmedId)}'`,
        Fields: ['ID', 'OwnerID', 'EnvironmentID'],
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
    if (UUIDsEqual(collectionRow.OwnerID, contextUser.ID)) {
      return { allowed: true, environmentId: collectionRow.EnvironmentID ?? null };
    }

    const permRes = await rv.RunView<{ CanRead?: boolean; CanEdit?: boolean }>(
      {
        EntityName: 'MJ: Collection Permissions',
        ExtraFilter: `CollectionID='${EscapeSQLString(trimmedId)}' AND UserID='${EscapeSQLString(contextUser.ID)}'`,
        Fields: ['CanRead', 'CanEdit'],
        MaxRows: 10,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      },
      contextUser,
    );
    const rows = permRes.Success && permRes.Results ? permRes.Results : [];
    const hasPerm = required === 'edit' ? rows.some((r) => Boolean(r.CanEdit)) : rows.some((r) => Boolean(r.CanRead));
    if (!hasPerm) {
      return {
        allowed: false,
        reason: `Permission denied: user lacks ${required === 'edit' ? 'Edit' : 'Read'} access to collection '${trimmedId}'.`,
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
    versionEntity.Content = built.content;
    versionEntity.ContentHash = createHash('sha256').update(built.content, 'utf8').digest('hex');
    versionEntity.ContentSizeBytes = Buffer.byteLength(built.content, 'utf8');
    versionEntity.Comments = params.agentName ? `Created by ${params.agentName}` : 'Created via GovernedArtifactService';

    const baseConfig = JSON.stringify({
      agentRunId: params.agentRunId ?? null,
      agentName: params.agentName ?? null,
    });
    const enrichedConfig = BuildArtifactVersionConfigurationWithPreview(
      baseConfig,
      built.content,
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
        content: built.content,
        configuration: versionEntity.Configuration ?? undefined,
      };
    } finally {
      if (!params.agentRunId) {
        await this.EmitAgentPresence({
          artifactId: artifactEntity.ID,
          phase: 'exit',
          contextUser: params.contextUser,
          agentRunId: params.agentRunId,
          agentName: params.agentName,
        });
      }
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
      if (workingEmitted && !params.agentRunId) {
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
    params: MutateGovernedArtifactParams,
    uploadedFileId: string | null,
    xlsxSizeBytes: number | null,
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
      versionEntity.Configuration = finalContentStr;
      return;
    }

    versionEntity.ContentMode = 'Text';
    versionEntity.FileID = null;
    versionEntity.MimeType = state.mimeType ?? null;
    versionEntity.Content = finalContentStr;
    versionEntity.ContentSizeBytes = Buffer.byteLength(finalContentStr, 'utf8');
    let existingConfig: ArtifactToolArgs = {};
    if (state.configuration) {
      const parsedConfig = CleanAndParseJSON<ArtifactJsonValue>(state.configuration);
      if (parsedConfig && typeof parsedConfig === 'object' && !Array.isArray(parsedConfig)) {
        existingConfig = parsedConfig;
      }
    }
    const mergedConfig = JSON.stringify({
      ...existingConfig,
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
    let workingContent: string | Buffer = state.content;
    let workingXlsxBytes = state.originalXlsxBytes;
    let latestXlsxBase64: string | undefined;
    let lastLocation: ArtifactAgentTargetLocation | undefined;
    let lastToolName = ops[0].tool;
    let lastToolInput: ArtifactToolArgs = this.sanitizeToolInput(ops[ops.length - 1]?.input);
    const warnings: string[] = [];
    const stepResults: Array<{ tool: string; data: ArtifactToolResult['data'] }> = [];
    let workingEmitted = false;

    try {
      for (const op of ops) {
        const toolInput = this.sanitizeToolInput(op.input);
        lastToolName = op.tool;
        lastToolInput = toolInput;
        lastLocation = ExtractAgentTargetLocation(op.tool, toolInput, workingContent, state.typeName);
        await this.EmitAgentPresence({
          artifactId: state.artifactId,
          phase: 'working',
          contextUser: params.contextUser,
          agentRunId: params.agentRunId,
          agentName: params.agentName,
          toolName: op.tool,
          actionSummary: FormatAgentActionSummary(op.tool, toolInput, lastLocation),
          location: lastLocation,
        });
        workingEmitted = true;

        const res = await lib.InvokeTool(op.tool, toolInput, workingContent, toolContext);
        if (!res.success) {
          return {
            success: false,
            artifactId: state.artifactId,
            errorMessage: res.errorMessage || `Tool '${op.tool}' failed.`,
          };
        }

        const rawData: ArtifactToolArgs =
          res.data !== null && typeof res.data === 'object' && !Array.isArray(res.data)
            ? (res.data as ArtifactToolArgs)
            : {};
        if (typeof rawData.updatedContent === 'string') {
          workingContent = rawData.updatedContent;
          if (typeof rawData.xlsxBase64 === 'string') {
            latestXlsxBase64 = rawData.xlsxBase64;
          }
        }
        lastLocation =
          ExtractAgentTargetLocation(op.tool, toolInput, workingContent, state.typeName, rawData) ?? lastLocation;

        const sanitized: ArtifactToolArgs = {};
        for (const [k, v] of Object.entries(rawData)) {
          if (k === 'updatedContent' || k === 'xlsxBase64') continue;
          sanitized[k] = v;
        }
        stepResults.push({ tool: op.tool, data: sanitized });
      }

      let finalContentStr = Buffer.isBuffer(workingContent) ? '' : String(workingContent);
      if (!finalContentStr || finalContentStr === previousContentStr) {
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

      const liveHook = GetArtifactLiveMutationHook();
      let hookOutcome: ArtifactLiveMutationHookResult | undefined = undefined;
      if (liveHook) {
        const hookResult = await liveHook({
          artifactId: state.artifactId,
          alphaId: 'A',
          versionId: state.versionId,
          versionNumber: state.versionNumber + 1,
          previousContent: previousContentStr,
          updatedContent: finalContentStr,
          xlsxBase64: latestXlsxBase64,
          tool: lastToolName,
          contextUser: params.contextUser,
          agentRunId: params.agentRunId,
          agentName: params.agentName,
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
      const rv = RunView.FromMetadataProvider(params.provider);
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
        params.contextUser,
      );
      if (verCheck.Success && verCheck.Results?.length) {
        const currentDbVersion = verCheck.Results[0].VersionNumber ?? 1;
        if (currentDbVersion > state.dbVersionNumber) {
          return {
            success: false,
            artifactId: state.artifactId,
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
            artifactId: state.artifactId,
            errorMessage: 'Failed to materialize updated .xlsx bytes for File-mode artifact.',
          };
        }
        const upload = await this.uploadXlsxBuffer(params, state.name, latestXlsxBase64);
        uploadedFileId = upload.fileId;
        xlsxSizeBytes = upload.sizeBytes;
        if (!uploadedFileId) {
          return {
            success: false,
            artifactId: state.artifactId,
            errorMessage: 'Failed to upload updated .xlsx binary to FileStorageEngine; refusing to downgrade File-mode artifact.',
          };
        }
      }

      const nextVersionNumber = Math.max(state.versionNumber, state.dbVersionNumber) + 1;
      const versionEntity = await params.provider.GetEntityObject<MJArtifactVersionEntity>(
        'MJ: Artifact Versions',
        params.contextUser,
      );
      versionEntity.NewRecord();
      versionEntity.ArtifactID = state.artifactId;
      versionEntity.VersionNumber = nextVersionNumber;
      versionEntity.Name = state.name;
      versionEntity.UserID = params.contextUser.ID;
      versionEntity.Comments = params.agentName
        ? `Edited by ${params.agentName} via '${lastToolName}'`
        : `Updated via '${lastToolName}'`;
      this.applyVersionPayload(
        versionEntity,
        state,
        finalContentStr,
        lastToolName,
        params,
        uploadedFileId,
        xlsxSizeBytes,
      );

      if (!(await versionEntity.Save())) {
        return {
          success: false,
          artifactId: state.artifactId,
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
          await this.safeRollbackHook(hookOutcome.rollback, savedVersionId);
          return {
            success: false,
            artifactId: state.artifactId,
            errorMessage: `Live room commit failed for artifact '${state.artifactId}': ${
              commitErr instanceof Error ? commitErr.message : String(commitErr)
            }`,
          };
        }

        if (commitRes && typeof commitRes === 'object' && commitRes.applied === false) {
          const savedVersionId = versionEntity.ID;
          await this.safeDeleteVersionEntity(versionEntity);
          await this.safeRollbackHook(commitRes.rollback ?? hookOutcome.rollback, savedVersionId);
          return {
            success: false,
            artifactId: state.artifactId,
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
            if (rematerialized.xlsxBase64) {
              workingXlsxBytes = rematerialized.xlsxBytes;
              latestXlsxBase64 = rematerialized.xlsxBase64;
              const reupload = await this.uploadXlsxBuffer(params, state.name, rematerialized.xlsxBase64);
              if (reupload.fileId) {
                updatedFileId = reupload.fileId;
                updatedSizeBytes = reupload.sizeBytes;
              } else {
                warnings.push('Live room merged content after save, but re-uploading merged .xlsx binary failed.');
              }
            }
          }
          this.applyVersionPayload(
            versionEntity,
            state,
            finalContentStr,
            lastToolName,
            params,
            updatedFileId,
            updatedSizeBytes,
          );
          if (!(await versionEntity.Save())) {
            warnings.push(
              versionEntity.LatestResult?.CompleteMessage ||
                'Failed to re-save version record with post-commit merged content.',
            );
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
            PreviousContent: previousContentStr,
            ToolName: lastToolName,
            User: params.contextUser,
            SaveVersion: false,
            AlreadyAppliedToRoom: Boolean(liveHook),
          },
        });
      } catch {
        // Never fail mutation if UI subscriber throws
      }

      this.RecordTouchedArtifact(params.agentRunId, {
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
        contextUser: params.contextUser,
        agentRunId: params.agentRunId,
        agentName: params.agentName,
        toolName: lastToolName,
        actionSummary: FormatAgentActionSummary(lastToolName, lastToolInput, lastLocation),
        location: lastLocation,
      });

      return {
        success: true,
        artifactId: state.artifactId,
        versionId: versionEntity.ID,
        versionNumber: nextVersionNumber,
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
      if (workingEmitted && !params.agentRunId) {
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

    const candidateIds: string[] = [];
    const seen = new Set<string>();
    const rv = RunView.FromMetadataProvider(params.provider);

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
          MaxRows: maxResults * 2,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        params.contextUser,
      );
      const versionIds = Array.from(
        new Set(
          (colArtRes.Success && colArtRes.Results ? colArtRes.Results : [])
            .map((r) => (r.ArtifactVersionID ?? '').trim())
            .filter(Boolean),
        ),
      );
      if (versionIds.length > 0) {
        const verInList = versionIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
        const verLookup = await rv.RunView<{ ArtifactID?: string | null }>(
          {
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ID IN (${verInList})`,
            Fields: ['ArtifactID'],
            MaxRows: maxResults * 2,
            SkipTotalRowCount: true,
            ResultType: 'simple',
          },
          params.contextUser,
        );
        for (const row of verLookup.Success && verLookup.Results ? verLookup.Results : []) {
          const id = (row.ArtifactID ?? '').trim();
          const norm = NormalizeUUID(id);
          if (id && !seen.has(norm)) {
            seen.add(norm);
            candidateIds.push(id);
          }
        }
      }
    } else {
      const safeUserId = EscapeSQLString(params.contextUser.ID);
      const sharedArtifactIds: string[] = [];
      try {
        const permRes = await rv.RunView<{ ArtifactID?: string | null }>(
          {
            EntityName: 'MJ: Artifact Permissions',
            ExtraFilter: `UserID='${safeUserId}' AND CanRead=1`,
            Fields: ['ArtifactID'],
            MaxRows: maxResults * 4,
            SkipTotalRowCount: true,
            ResultType: 'simple',
          },
          params.contextUser,
        );
        if (permRes.Success && permRes.Results?.length) {
          for (const row of permRes.Results) {
            const aid = (row.ArtifactID ?? '').trim();
            if (aid && IsValidUUID(aid)) {
              sharedArtifactIds.push(aid);
            }
          }
        }
      } catch {
        // Proceed with owned artifacts if permissions query fails
      }

      const accessFilter =
        sharedArtifactIds.length > 0
          ? `(UserID='${safeUserId}' OR ID IN (${Array.from(new Set(sharedArtifactIds))
              .map((id) => `'${EscapeSQLString(id)}'`)
              .join(',')}))`
          : `UserID='${safeUserId}'`;

      const filters = [accessFilter];
      if (search) {
        filters.push(`Name LIKE '%${EscapeSQLString(this.escapeSqlLike(search))}%'`);
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
          filters.push(
            `Type IN (${Array.from(new Set(matchedTypeNames))
              .map((n) => `'${EscapeSQLString(n)}'`)
              .join(',')})`,
          );
        } else {
          const escapedLike = EscapeSQLString(this.escapeSqlLike(typeFilter));
          if (canonicalName.toLowerCase() !== typeFilter) {
            filters.push(`(Type LIKE '%${escapedLike}%' OR Type='${EscapeSQLString(canonicalName)}')`);
          } else {
            filters.push(`Type LIKE '%${escapedLike}%'`);
          }
        }
      }

      const artRes = await rv.RunView<{ ID: string }>(
        {
          EntityName: 'MJ: Artifacts',
          ExtraFilter: filters.join(' AND '),
          OrderBy: '__mj_UpdatedAt DESC',
          Fields: ['ID'],
          MaxRows: maxResults * 2,
          SkipTotalRowCount: true,
          ResultType: 'simple',
        },
        params.contextUser,
      );
      for (const row of artRes.Success && artRes.Results ? artRes.Results : []) {
        const id = (row.ID ?? '').trim();
        const norm = NormalizeUUID(id);
        if (id && !seen.has(norm)) {
          seen.add(norm);
          candidateIds.push(id);
        }
      }
    }

    const items: WorkspaceArtifactListItem[] = [];
    for (const artId of candidateIds) {
      if (items.length >= maxResults) break;
      const loaded = await this.LoadReadableArtifactState(params.provider, params.contextUser, artId, {
        skipBinaryDownload: true,
      });
      if (!loaded.state) continue;
      const st = loaded.state;
      const stTypeLower = st.typeName.toLowerCase();
      if (typeFilter && !stTypeLower.includes(typeFilter) && stTypeLower !== normalizedTypeFilter) continue;
      if (search && !st.name.toLowerCase().includes(search)) continue;

      const digest = ArtifactSynthesisEngine.Instance.ExtractSourceDigest(
        {
          ArtifactID: st.artifactId,
          Name: st.name,
          ArtifactType: st.typeName,
          VersionNumber: st.versionNumber,
          ContentMode: st.contentMode,
          Content: Buffer.isBuffer(st.content) ? null : st.content,
          Configuration: st.configuration ?? null,
          Description: st.description ?? null,
          MimeType: st.mimeType ?? null,
        },
        1200,
      );

      items.push({
        artifactId: st.artifactId,
        versionId: st.versionId,
        versionNumber: st.versionNumber,
        name: st.name,
        typeName: st.typeName,
        driverClass: st.driverClass,
        canEdit: st.permissions.CanEdit,
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
    if (lower.includes('data') || lower.includes('snapshot')) {
      return new DataSnapshotToolLibrary();
    }
    if (lower.includes('json')) {
      return new JSONToolLibrary();
    }
    if (lower.includes('pdf')) {
      const lib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, 'PDFToolLibrary');
      if (lib) return lib;
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
    if (lower.includes('word') || lower.includes('docx') || lower.includes('document')) {
      const lib = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactToolLibrary>(BaseArtifactToolLibrary, 'DocxToolLibrary');
      if (lib) return lib;
    }
    return new TextToolLibrary();
  }
}
