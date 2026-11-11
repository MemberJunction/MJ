import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject, Observable } from 'rxjs';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { LogError, Metadata, type IMetadataProvider } from '@memberjunction/core';
import { SafeJSONParse } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import {
  ArtifactPermissionEngine,
  DocumentLiveBlockEngine,
  SlideDeckEngine,
  SpreadsheetEngine,
  type DocumentBlockSpec,
  type DocumentBlockKind,
  type ResolvedArtifactPermissions,
  type SlideDeckSpec,
  type SlideSpec,
  type WorkbookSpec,
  type WorksheetSpec,
  type SpreadsheetCellSpec,
  type SpreadsheetNamedRangeSpec,
} from '@memberjunction/core-entities';
import {
  ComputeBoundedSequenceDiff as computeBoundedSequenceDiffFromUtil,
  ComputeLineDiff as computeLineDiffFromUtil,
  type SequenceDiffOp,
} from '../utils/line-diff';

export type { SequenceDiffOp } from '../utils/line-diff';
export type ArtifactEffectivePermissions = ResolvedArtifactPermissions;

/**
 * Extended artifact permission verification result distinguishing explicit server denial
 * (`AccessRevoked === true`) from transient network/GraphQL verification errors
 * (`PermissionVerifyError === true`, which still fails closed as read-only while offering Retry).
 */
export interface VerifiedArtifactPermissions extends ResolvedArtifactPermissions {
  AccessRevoked?: boolean;
  PermissionVerifyError?: boolean;
}

const ANCHORED_COMMENT_MENTION_SOURCE = '(?:^|[\\s([{"\'])@([A-Za-z][A-Za-z0-9_-]*)';

/**
 * Extracts unique `@handle` mentions from comment text while strictly ignoring email addresses
 * (such as `alice@example.com` or `foo.bar@baz.co`) by requiring `@` to appear at start-of-string
 * or immediately after whitespace or opening punctuation (`[\s([{"']`).
 */
export function ExtractAnchoredCommentMentions(text: string): string[] {
  if (!text) {
    return [];
  }
  const seen = new Set<string>();
  const handles: string[] = [];
  const matcher = new RegExp(ANCHORED_COMMENT_MENTION_SOURCE, 'g');
  for (const match of text.matchAll(matcher)) {
    const handle = match[1];
    if (handle && !seen.has(handle)) {
      seen.add(handle);
      handles.push(handle);
    }
  }
  return handles;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = (hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MSG_CONTROL = 2;
const MSG_PERMISSION_STATE = 3;

const MINT_COLLABORATION_TICKET_MUTATION = `
  mutation MintArtifactCollaborationTicket($artifactId: String!) {
    MintArtifactCollaborationTicket(artifactId: $artifactId) {
      Success
      Ticket
      WsPath
      WsUrl
      ExpiresAt
      CanRead
      CanEdit
      ErrorMessage
    }
  }
`;

const COMMIT_ARTIFACT_INLINE_EDIT_MUTATION = `
  mutation CommitArtifactInlineEdit($artifactId: String!, $content: String!, $saveVersion: Boolean) {
    CommitArtifactInlineEdit(artifactId: $artifactId, content: $content, saveVersion: $saveVersion) {
      Success
      VersionID
      VersionNumber
      ErrorMessage
    }
  }
`;

const EXECUTE_ANCHORED_COMMENT_AGENT_MENTION_MUTATION = `
  mutation ExecuteAnchoredCommentAgentMention(
    $artifactId: String!
    $agentHandle: String!
    $agentMode: String!
    $commentBody: String!
    $anchorQuote: String
    $conversationId: String
  ) {
    ExecuteAnchoredCommentAgentMention(
      artifactId: $artifactId
      agentHandle: $agentHandle
      agentMode: $agentMode
      commentBody: $commentBody
      anchorQuote: $anchorQuote
      conversationId: $conversationId
    ) {
      Success
      AgentHandle
      AgentMode
      ReplyBody
      UpdatedContent
      VersionID
      VersionNumber
      ErrorMessage
    }
  }
`;

const RESOLVE_ARTIFACT_PERMISSIONS_QUERY = `
  query ResolveArtifactPermissions($artifactId: String!) {
    ResolveArtifactPermissions(artifactId: $artifactId) {
      ArtifactID
      CanRead
      CanEdit
      CanDelete
      CanShare
      Source
      Reason
    }
  }
`;

const FREEZE_DOCUMENT_LIVE_BLOCK_MUTATION = `
  mutation FreezeDocumentLiveBlock($specJson: String!, $acknowledgeSecurityWarning: Boolean!, $hostArtifactId: String) {
    FreezeDocumentLiveBlock(
      specJson: $specJson
      acknowledgeSecurityWarning: $acknowledgeSecurityWarning
      hostArtifactId: $hostArtifactId
    ) {
      Success
      ErrorMessage
      UpdatedSpecJSON
    }
  }
`;

const VERIFY_FROZEN_BLOCK_SNAPSHOT_QUERY = `
  query VerifyFrozenBlockSnapshot($specJson: String!) {
    VerifyFrozenBlockSnapshot(specJson: $specJson) {
      Valid
      SnapshotVerified
      ErrorMessage
    }
  }
`;

const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000] as const;

/**
 * Returns `true` strictly when `MintArtifactCollaborationTicket` explicitly reports that the
 * server's collaboration ticket signing secret (`MJ_ARTIFACT_COLLAB_HMAC_SECRET` /
 * `MJ_COLLABORATION_TICKET_SECRET`) is unset, too short, or unconfigured.
 *
 * Transient failures (network errors such as `Failed to fetch`, HTTP 5xx, GraphQL transport
 * errors, MJAPI restarts, or generic server errors) return `false` so exponential-backoff
 * reconnection remains active without locking viewers read-only.
 */
function isCollaborationSecretUnconfiguredMessage(message: string | null | undefined): boolean {
  if (!message) {
    return false;
  }
  const normalized = message.trim();
  if (!normalized) {
    return false;
  }
  return (
    /MJ_ARTIFACT_COLLAB_HMAC_SECRET/i.test(normalized) ||
    /MJ_COLLABORATION_TICKET_SECRET/i.test(normalized) ||
    /collaboration\s+ticket\s+signing\s+secret/i.test(normalized) ||
    /signing\s+secret\b[\s\S]*\b(?:must\s+be\s+configured|not\s+configured|unset|shorter\s+than)/i.test(
      normalized,
    ) ||
    /live\s+collaborative\s+editing\s+is\s+disabled/i.test(normalized) ||
    /\b(?:collab(?:oration)?|hmac|ticket)\b[\s\S]*\b(?:not\s+configured|must\s+be\s+configured|unconfigured)\b/i.test(
      normalized,
    )
  );
}

export interface CollaborationTicketPayload {
  Success: boolean;
  Ticket?: string | null;
  WsPath?: string | null;
  WsUrl?: string | null;
  wsUrl?: string | null;
  ExpiresAt?: string | null;
  CanRead?: boolean | null;
  CanEdit?: boolean | null;
  ErrorMessage?: string | null;
}

export interface ServerArtifactPermissionsPayload {
  ArtifactID?: string | null;
  CanRead?: boolean | null;
  CanEdit?: boolean | null;
  CanDelete?: boolean | null;
  CanShare?: boolean | null;
  Source?: ResolvedArtifactPermissions['Source'] | string | null;
  Reason?: string | null;
}

export interface ServerFreezeLiveBlockPayload {
  Success: boolean;
  ErrorMessage?: string | null;
  UpdatedSpecJSON?: string | null;
  UpdatedBlockSpecJson?: string | null;
}

export interface ServerVerifyFrozenSnapshotPayload {
  Valid?: boolean | null;
  SnapshotVerified?: boolean | null;
  ErrorMessage?: string | null;
}

export interface ServerCommitInlineEditPayload {
  Success: boolean;
  VersionID?: string | null;
  VersionNumber?: number | null;
  ErrorMessage?: string | null;
}

export interface ServerAnchoredCommentAgentMentionPayload {
  Success: boolean;
  AgentHandle?: string | null;
  AgentMode?: string | null;
  ReplyBody?: string | null;
  UpdatedContent?: string | null;
  VersionID?: string | null;
  VersionNumber?: number | null;
  ErrorMessage?: string | null;
}

export interface CollaborationGraphQLResponseMap {
  MintArtifactCollaborationTicket?: CollaborationTicketPayload | null;
  ResolveArtifactPermissions?: ServerArtifactPermissionsPayload | null;
  ResolveArtifactUserPermissions?: ServerArtifactPermissionsPayload | null;
  FreezeDocumentLiveBlock?: ServerFreezeLiveBlockPayload | null;
  VerifyFrozenBlockSnapshot?: ServerVerifyFrozenSnapshotPayload | null;
  CommitArtifactInlineEdit?: ServerCommitInlineEditPayload | null;
  ExecuteAnchoredCommentAgentMention?: ServerAnchoredCommentAgentMentionPayload | null;
}

export interface CollaborationGraphQLProviderLike {
  ExecuteGQL: (
    query: string,
    variables?: Record<string, unknown>,
  ) => Promise<CollaborationGraphQLResponseMap | null | undefined>;
  ConfigData?: {
    URL?: string;
    WSURL?: string;
    MJAPIURL?: string;
  };
}

export interface ResolvedCollaborationEndpoint {
  Mode: 'connect' | 'local' | 'revoked';
  WsUrl: string;
  CanEdit?: boolean;
  HasBackend?: boolean;
  LiveSyncUnavailable?: boolean;
  LiveSyncErrorReason?: string;
}

function isGraphQLCollaborationProvider(
  provider: IMetadataProvider | CollaborationGraphQLProviderLike | null | undefined,
): provider is CollaborationGraphQLProviderLike {
  if (!provider || typeof provider !== 'object') {
    return false;
  }
  if (provider instanceof GraphQLDataProvider) {
    return true;
  }
  return 'ExecuteGQL' in provider && typeof provider.ExecuteGQL === 'function';
}

function resolveDefaultMetadataProvider(explicitProvider?: IMetadataProvider | null): IMetadataProvider | null {
  if (explicitProvider) {
    return explicitProvider;
  }
  return Metadata.Provider ?? null; // global-provider-ok: fallback when Angular caller did not supply a bound provider
}

function decodeBase64ToUint8Array(input: string): Uint8Array | null {
  try {
    const trimmed = input.trim();
    if (!trimmed || !/^[A-Za-z0-9+/=_-]+$/.test(trimmed)) {
      return null;
    }
    const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    if (typeof atob === 'function') {
      const bin = atob(normalized);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
      }
      return out;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Bounded Myers O((M+N)D) sequence diff with common prefix/suffix trimming and
 * linear Patience-style unique-hash-anchor fallback when `(m + n) > maxSequenceSum`
 * or edit distance `D` exceeds `maxEditDistance`.
 */
export function ComputeBoundedSequenceDiff<T>(
  oldItems: readonly T[],
  newItems: readonly T[],
  equals: (a: T, b: T) => boolean,
  keyFn: (item: T) => string,
  maxEditDistance = 2000,
  maxSequenceSum = 10000,
): SequenceDiffOp[] {
  return computeBoundedSequenceDiffFromUtil(
    oldItems,
    newItems,
    equals,
    keyFn,
    maxEditDistance,
    maxSequenceSum,
  );
}

/**
 * Connection status for a collaborative document editing session.
 */
export type CollaborationConnectionStatus = 'connected' | 'connecting' | 'local' | 'readonly' | 'revoked';

/**
 * Active collaborator presence metadata broadcast via Yjs awareness.
 */
export interface CollaboratorPresence {
  ClientID: number;
  UserID: string;
  Name: string;
  Email?: string;
  Color: string;
  ActiveBlockID?: string;
  CanEdit: boolean;
}

/**
 * Item in the Left Table of Contents (TOC) & Block Outline rail.
 */
export interface DocumentOutlineItem {
  ID: string;
  Kind: 'heading' | 'block';
  Level: number;
  Title: string;
  StartLine: number;
  BlockType?: DocumentBlockKind;
  BlockMode?: DocumentBlockSpec['Mode'];
}

/**
 * Rendered segment of a collaborative document (either a Markdown block or a `:::mj-block` directive).
 */
export interface DocumentRenderSegment {
  SegmentID: string;
  Kind: 'markdown' | 'mj-block';
  BlockKind: 'heading' | 'paragraph' | 'callout' | 'code' | 'table' | 'list' | 'mj-block';
  StartLine: number;
  EndLine: number;
  RawMarkdown: string;
  HeadingLevel?: number;
  HeadingText?: string;
  Descriptor?: DocumentBlockSpec;
}

/**
 * Slash command entry available when typing `/` in the Docs editor.
 */
export interface DocumentSlashCommand {
  Command: string;
  Label: string;
  Description: string;
  Category: 'Structure' | 'Live Data' | 'Embedded Artifact';
  Icon: string;
  BlockType?: DocumentBlockKind;
  Snippet?: string;
}

/**
 * Tracked suggestion item in Suggest mode or proposed by an `@mention` agent.
 */
export interface DocumentSuggestionItem {
  SuggestionID: string;
  BlockID: string;
  AuthorName: string;
  AuthorUserID?: string;
  CreatedAt: string;
  OriginalMarkdown: string;
  ProposedMarkdown: string;
  Rationale: string;
  Status: 'Pending' | 'Accepted' | 'Rejected';
}

/**
 * Anchored `DocBlock` comment thread (`MJ: Conversations` + `MJ: Conversation Details`).
 */
export interface DocumentAnchoredThread {
  ConversationID: string;
  AnchorKey: string;
  AnchorLabel: string;
  QuotedText: string;
  Status: 'Open' | 'Resolved';
  AgentMode: 'suggest' | 'edit' | 'comment';
  CreatedAt: string;
  Messages: Array<{
    DetailID: string;
    UserName: string;
    Role: 'User' | 'Agent';
    Message: string;
    CreatedAt: string;
    Mentions: string[];
  }>;
}

/**
 * Single line in a side-by-side / unified version diff.
 */
export interface DocumentDiffLine {
  Type: 'same' | 'added' | 'removed';
  OldLineNumber: number | null;
  NewLineNumber: number | null;
  Content: string;
}

/**
 * Summary and line breakdown of a version diff comparison.
 */
export interface DocumentDiffResult {
  AddedLines: number;
  RemovedLines: number;
  UnchangedLines: number;
  Lines: DocumentDiffLine[];
}

/**
 * Contiguous span in a word-level inline redline diff (`equal`, `delete`, or `insert`).
 */
export interface DocumentWordDiffSpan {
  Type: 'equal' | 'delete' | 'insert';
  Text: string;
  HunkID?: string;
}

/**
 * Granular word/phrase-level tracked edit hunk inside a block, supporting independent
 * Accept / Reject just like Word Track Changes and Google Docs Suggesting Mode.
 */
export interface DocumentWordChangeHunk {
  HunkID: string;
  Kind: 'replace' | 'insert' | 'delete';
  DeletedText: string;
  InsertedText: string;
  ContextBefore: string;
  ContextAfter: string;
  /** Resulting block Markdown if ONLY this hunk is accepted on top of OriginalMarkdown */
  AcceptedMarkdown: string;
  /** Resulting ProposedMarkdown if ONLY this hunk is rejected (reverted to Original) */
  RejectedProposedMarkdown: string;
}

/**
 * Complete word-level redline diff and granular change hunks for a block suggestion.
 */
export interface DocumentWordDiffResult {
  Spans: DocumentWordDiffSpan[];
  Hunks: DocumentWordChangeHunk[];
}

/**
 * Active Yjs collaboration session bound to a single artifact.
 */
export class DocumentCollaborationSession {
  public readonly ArtifactID: string;
  public Doc: Y.Doc;
  public ContentText: Y.Text;
  public readonly Awareness: awarenessProtocol.Awareness;

  private socket: WebSocket | null = null;
  private status: CollaborationConnectionStatus = 'local';
  private transport: 'websocket' | 'local-only';
  private canEdit: boolean;
  private applyingRemote = false;
  private readonly initialSeedContent: string;
  private overrideSeedContent: string | null = null;
  private seededInDoc = false;
  private hasCompletedInitialSync = false;
  private liveSyncUnavailable = false;
  private liveSyncErrorReason = '';
  private lastSyncedRemoteContent = '';
  private hasUnsentLocalEdits = false;
  private docUpdateHandler:
    | ((update: Uint8Array, origin: string | number | symbol | object | null | undefined) => void)
    | null = null;
  private destroyed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectGeneration = 0;
  private configuredWsUrlOverride: string | null = null;
  private configuredProvider: IMetadataProvider | null = null;
  private readonly endpointResolver?: (
    artifactId: string,
    wsUrlOverride?: string | null,
    provider?: IMetadataProvider | null,
  ) => Promise<ResolvedCollaborationEndpoint>;

  private readonly contentChanged$ = new Subject<string>();
  private readonly statusChanged$ = new Subject<CollaborationConnectionStatus>();
  private readonly collaboratorsChanged$ = new Subject<CollaboratorPresence[]>();
  private readonly versionSaved$ = new Subject<{ versionId: string; versionNumber: number }>();
  private readonly liveSyncUnavailable$ = new BehaviorSubject<boolean>(false);

  public get YDoc(): Y.Doc {
    return this.Doc;
  }

  public get Transport(): 'websocket' | 'local-only' {
    return this.transport;
  }

  public get HasCompletedInitialSync(): boolean {
    return this.hasCompletedInitialSync;
  }

  public get LiveSyncUnavailable(): boolean {
    return this.liveSyncUnavailable;
  }

  public get HasPendingReconnect(): boolean {
    return this.reconnectTimer !== null;
  }

  public get LiveSyncErrorReason(): string {
    return this.liveSyncErrorReason;
  }

  public get OnLiveSyncUnavailable$(): Observable<boolean> {
    return this.liveSyncUnavailable$.asObservable();
  }

  /**
   * True only when live sync is not degraded/unavailable, the user has edit permission,
   * AND (either the session is local-only or the initial `syncStep2` handshake from
   * `/collaboration/yjs` has completed).
   */
  public get CanMutateDocument(): boolean {
    return (
      !this.liveSyncUnavailable &&
      this.canEdit &&
      (this.transport === 'local-only' || this.hasCompletedInitialSync)
    );
  }

  public get ContentChanged$(): Observable<string> {
    return this.contentChanged$.asObservable();
  }

  public get RemoteContent$(): Observable<string> {
    return this.contentChanged$.asObservable();
  }

  public get StatusChanged$(): Observable<CollaborationConnectionStatus> {
    return this.statusChanged$.asObservable();
  }

  public get CollaboratorsChanged$(): Observable<CollaboratorPresence[]> {
    return this.collaboratorsChanged$.asObservable();
  }

  public get VersionSaved$(): Observable<{ versionId: string; versionNumber: number }> {
    return this.versionSaved$.asObservable();
  }

  public get Status(): CollaborationConnectionStatus {
    return this.status;
  }

  public get CanEdit(): boolean {
    return this.canEdit;
  }

  public get IsDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Updates the session's client-side edit capability after async permission resolution or `[readonly]` changes.
   */
  public SetCanEdit(canEdit: boolean): void {
    if (this.destroyed || this.status === 'revoked') {
      return;
    }
    this.canEdit = canEdit;
    const currentState = this.Awareness.getLocalState() ?? {};
    const userState =
      (currentState['user'] as {
        userId?: string | number;
        name?: string;
        email?: string;
        color?: string;
        activeBlockId?: string;
        canEdit?: boolean;
      } | undefined) ?? {};
    this.Awareness.setLocalStateField('user', {
      ...userState,
      canEdit,
    });
    if (this.liveSyncUnavailable) {
      this.setStatus('readonly');
    } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.setStatus(canEdit ? 'connected' : 'readonly');
    } else if (this.status !== 'connecting') {
      this.setStatus(canEdit ? 'local' : 'readonly');
    }
  }

  /**
   * Returns the current string content of the shared Yjs `Y.Text('content')` CRDT
   * (or the reconstructed `SlideDeckSpec` / `WorkbookSpec` JSON when the room hosts a deck or workbook).
   */
  public GetContent(): string {
    const slideOrder = this.Doc.getArray<string>('slideOrder');
    if (slideOrder.length > 0) {
      const reconstructed = this.reconstructSlideDeckJsonFromCrdt();
      if (reconstructed) {
        return reconstructed;
      }
    }
    const worksheetsById = this.Doc.getMap<string>('worksheetsById');
    if (worksheetsById.size > 0) {
      const reconstructed = this.reconstructWorkbookJsonFromCrdt();
      if (reconstructed) {
        return reconstructed;
      }
    }
    const yText = this.ContentText.toString();
    const seedFallback = this.overrideSeedContent ?? this.initialSeedContent;
    if (yText.length === 0 && !this.seededInDoc && seedFallback.length > 0) {
      return seedFallback;
    }
    return yText;
  }

  constructor(
    artifactId: string,
    initialContent: string,
    user: { id: string; name: string; email?: string; color?: string },
    canEdit = true,
    deferInitialSeedForRemoteSync = false,
    endpointResolver?: (
      artifactId: string,
      wsUrlOverride?: string | null,
      provider?: IMetadataProvider | null,
    ) => Promise<ResolvedCollaborationEndpoint>,
  ) {
    this.ArtifactID = artifactId;
    this.canEdit = canEdit;
    this.transport = deferInitialSeedForRemoteSync ? 'websocket' : 'local-only';
    this.hasCompletedInitialSync = this.transport === 'local-only';
    this.initialSeedContent = initialContent ?? '';
    this.lastSyncedRemoteContent = this.initialSeedContent;
    this.endpointResolver = endpointResolver;
    this.Doc = new Y.Doc();
    this.ContentText = this.Doc.getText('content');
    if (initialContent && this.transport === 'local-only') {
      this.Doc.transact(() => {
        this.ContentText.insert(0, initialContent);
        this.populateSlideDeckCrdtIfPresentation(initialContent);
        this.populateSpreadsheetCrdtIfWorkbook(initialContent);
      }, 'init');
      this.seededInDoc = true;
    }

    this.Awareness = new awarenessProtocol.Awareness(this.Doc);
    this.Awareness.setLocalStateField('user', {
      userId: user.id,
      name: user.name,
      email: user.email,
      color: user.color ?? 'var(--mj-brand-primary)',
      canEdit,
    });

    this.bindDocObservers(this.Doc);

    this.Awareness.on('change', () => {
      this.collaboratorsChanged$.next(this.GetCollaborators());
    });
  }

  private bindDocObservers(doc: Y.Doc): void {
    const handler = (
      update: Uint8Array,
      origin: string | number | symbol | object | null | undefined,
    ): void => {
      if (doc !== this.Doc) {
        return;
      }
      if (origin === 'remote') {
        if (
          this.ContentText.length > 0 ||
          doc.getArray<string>('slideOrder').length > 0 ||
          doc.getMap<string>('worksheetsById').size > 0
        ) {
          this.seededInDoc = true;
          this.hasCompletedInitialSync = true;
          this.setLiveSyncUnavailable(false);
        }
      } else if (origin !== 'init') {
        const sent = this.sendYjsUpdate(update);
        if (!sent) {
          this.hasUnsentLocalEdits = true;
        }
      }
      this.contentChanged$.next(this.GetContent());
    };
    this.docUpdateHandler = handler;
    doc.on('update', handler);
  }

  private detachDocObservers(doc: Y.Doc): void {
    if (this.docUpdateHandler) {
      doc.off('update', this.docUpdateHandler);
      this.docUpdateHandler = null;
    }
  }

  /**
   * Replaces `YDoc` with a fresh `new Y.Doc()`, applies a server `'room-reset'` payload without
   * destroying `this.Awareness`, preserves any unsent local line edits on top of the reset baseline,
   * rebinds observers, and emits `RemoteContent$` / `ContentChanged$`.
   */
  public ApplyRoomReset(payload: string): void {
    if (this.destroyed) {
      return;
    }
    const unsentLocalSnapshot = this.hasUnsentLocalEdits ? this.GetContent() : null;
    const baseBeforeReset = this.lastSyncedRemoteContent;

    const previousDoc = this.Doc;
    this.detachDocObservers(previousDoc);

    const nextDoc = new Y.Doc();
    this.Doc = nextDoc;
    this.ContentText = nextDoc.getText('content');
    this.seededInDoc = false;
    this.overrideSeedContent = null;

    this.applyingRemote = true;
    try {
      const binaryBytes = decodeBase64ToUint8Array(payload);
      let appliedBinary = false;
      if (binaryBytes && binaryBytes.byteLength > 0) {
        try {
          Y.applyUpdate(nextDoc, binaryBytes, 'remote');
          appliedBinary =
            this.ContentText.length > 0 ||
            nextDoc.getArray<string>('slideOrder').length > 0 ||
            nextDoc.getMap<string>('worksheetsById').size > 0;
        } catch {
          appliedBinary = false;
        }
      }
      if (!appliedBinary && payload.length > 0) {
        nextDoc.transact(() => {
          this.ContentText.insert(0, payload);
          this.populateSlideDeckCrdtIfPresentation(payload);
          this.populateSpreadsheetCrdtIfWorkbook(payload);
        }, 'remote');
      }
      if (
        this.ContentText.length > 0 ||
        nextDoc.getArray<string>('slideOrder').length > 0 ||
        nextDoc.getMap<string>('worksheetsById').size > 0
      ) {
        this.seededInDoc = true;
      }
    } finally {
      this.applyingRemote = false;
    }

    this.hasCompletedInitialSync = true;
    this.setLiveSyncUnavailable(false);
    if (this.status === 'readonly' && this.canEdit) {
      this.status = 'local';
    }
    this.hasUnsentLocalEdits = false;
    const resetBaseline = this.GetContent();
    this.lastSyncedRemoteContent = resetBaseline;

    this.bindDocObservers(nextDoc);

    // Re-apply any unsynced local prose hunks on top of the reset baseline so local edits are never dropped
    if (
      unsentLocalSnapshot !== null &&
      unsentLocalSnapshot !== baseBeforeReset &&
      unsentLocalSnapshot !== resetBaseline &&
      !unsentLocalSnapshot.trim().startsWith('{') &&
      this.canEdit
    ) {
      const replayed = this.replayLocalLineDiffOntoReset(
        baseBeforeReset,
        unsentLocalSnapshot,
        resetBaseline,
      );
      if (replayed !== resetBaseline) {
        this.SetContent(replayed);
      }
    }

    this.statusChanged$.next(this.status);
    this.contentChanged$.next(this.GetContent());
  }

  /**
   * Resets unsent local CRDT items after an out-of-band server commit (`CommitInlineEditOnServer`
   * while the WebSocket is disconnected) so a subsequent reconnect receives the server's state
   * cleanly without duplicating items committed over HTTP.
   */
  public AdoptOutOfBandCommittedContent(committedContent: string): void {
    if (this.destroyed || this.transport !== 'websocket') {
      return;
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }
    const previousDoc = this.Doc;
    this.detachDocObservers(previousDoc);
    const nextDoc = new Y.Doc();
    this.Doc = nextDoc;
    this.ContentText = nextDoc.getText('content');
    this.seededInDoc = false;
    this.overrideSeedContent = committedContent;
    this.lastSyncedRemoteContent = committedContent;
    this.hasUnsentLocalEdits = false;
    this.hasCompletedInitialSync = false;
    this.bindDocObservers(nextDoc);
    this.statusChanged$.next(this.status);
  }

  private replayLocalLineDiffOntoReset(
    baseBeforeReset: string,
    localBeforeReset: string,
    resetBaseline: string,
  ): string {
    const baseLines = baseBeforeReset.replace(/\r\n/g, '\n').split('\n');
    const localLines = localBeforeReset.replace(/\r\n/g, '\n').split('\n');
    const resetLines = resetBaseline.replace(/\r\n/g, '\n').split('\n');
    const ops = computeBoundedSequenceDiffFromUtil(
      baseLines,
      localLines,
      (a, b) => a === b,
      (s) => s,
    );
    const addedLines: string[] = [];
    for (const op of ops) {
      if (op.Kind === 'insert') {
        addedLines.push(localLines[op.NewIndex]);
      }
    }
    if (addedLines.length === 0) {
      return resetBaseline;
    }
    return [...resetLines, ...addedLines].join('\n');
  }

  /**
   * Acquires a single-use collaboration ticket (when `GraphQLDataProvider` is configured)
   * and connects to the MJServer `/collaboration/yjs` WebSocket endpoint with automatic
   * exponential-backoff reconnection on transient disconnects.
   */
  public async Connect(wsUrl?: string | null, provider?: IMetadataProvider | null): Promise<void> {
    if (this.destroyed || typeof WebSocket === 'undefined') {
      if (this.transport === 'local-only') {
        this.ensureLocalSeedIfUnseeded();
      }
      if (!this.destroyed) {
        this.setStatus(this.canEdit ? 'local' : 'readonly');
      }
      return;
    }

    this.configuredWsUrlOverride = wsUrl ?? null;
    this.configuredProvider = provider ?? null;
    const generation = ++this.connectGeneration;

    let targetWsUrl = wsUrl ?? '';
    try {
      if (this.endpointResolver) {
        const resolved = await this.endpointResolver(this.ArtifactID, wsUrl, provider);
        if (this.destroyed || generation !== this.connectGeneration) {
          return;
        }
        if (resolved.Mode === 'revoked') {
          this.canEdit = false;
          this.clearReconnectTimer();
          this.setStatus('revoked');
          return;
        }
        if (resolved.Mode === 'local' || !resolved.WsUrl) {
          if (resolved.LiveSyncUnavailable === true) {
            this.setLiveSyncUnavailable(true, resolved.LiveSyncErrorReason ?? '');
            this.clearReconnectTimer();
            this.setStatus('readonly');
            return;
          }
          this.setLiveSyncUnavailable(false);
          if (resolved.LiveSyncErrorReason) {
            this.liveSyncErrorReason = resolved.LiveSyncErrorReason;
          }
          if (resolved.HasBackend === false && this.transport === 'local-only') {
            this.ensureLocalSeedIfUnseeded();
          }
          this.setStatus(this.canEdit ? 'local' : 'readonly');
          if (
            resolved.HasBackend === true ||
            (resolved.HasBackend !== false && this.transport === 'websocket')
          ) {
            this.scheduleReconnect();
          }
          return;
        }
        if (resolved.CanEdit === false) {
          this.canEdit = false;
        }
        this.setLiveSyncUnavailable(false);
        this.transport = 'websocket';
        targetWsUrl = resolved.WsUrl;
      } else if (!targetWsUrl) {
        if (this.transport === 'local-only') {
          this.ensureLocalSeedIfUnseeded();
        }
        this.setStatus(this.canEdit ? 'local' : 'readonly');
        return;
      } else {
        this.transport = 'websocket';
      }

      if (this.destroyed || generation !== this.connectGeneration) {
        return;
      }

      this.closeActiveSocketWithoutReconnect();

      this.setStatus('connecting');
      const ws = new WebSocket(targetWsUrl);
      ws.binaryType = 'arraybuffer';
      this.socket = ws;

      ws.onopen = () => {
        if (this.destroyed || this.socket !== ws) {
          ws.close();
          return;
        }
        this.reconnectAttempts = 0;
        this.setLiveSyncUnavailable(false);
        this.clearReconnectTimer();
        this.setStatus(this.canEdit ? 'connected' : 'readonly');

        // Standard Yjs state-vector handshake: send sync-step-1 (stateVector).
        // Server responds with sync-step-2 + its own sync-step-1, and ApplyBinaryFrame
        // replies with client sync-step-2 (missing client updates) without full-doc resends.
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.writeSyncStep1(encoder, this.Doc);
        ws.send(encoding.toUint8Array(encoder));

        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(
          awarenessEncoder,
          awarenessProtocol.encodeAwarenessUpdate(this.Awareness, [this.Awareness.clientID]),
        );
        ws.send(encoding.toUint8Array(awarenessEncoder));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (this.destroyed) {
          return;
        }
        if (typeof event.data === 'string') {
          const msg = SafeJSONParse<{ type?: string; action?: string; payload?: string }>(event.data);
          if ((msg?.type === 'room-reset' || msg?.action === 'room-reset') && typeof msg.payload === 'string') {
            this.ApplyRoomReset(msg.payload);
          }
          return;
        }
        if (event.data instanceof ArrayBuffer) {
          this.ApplyBinaryFrame(new Uint8Array(event.data));
        } else if (ArrayBuffer.isView(event.data)) {
          this.ApplyBinaryFrame(
            new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength),
          );
        }
      };

      ws.onclose = (event: CloseEvent) => {
        if (this.socket === ws) {
          this.socket = null;
        }
        if (this.destroyed) {
          return;
        }
        if (event.code === 4403) {
          this.canEdit = false;
          this.clearReconnectTimer();
          this.setStatus('revoked');
          return;
        }
        if (event.code === 4401) {
          this.clearReconnectTimer();
          this.setStatus(this.canEdit ? 'local' : 'readonly');
          return;
        }
        this.setStatus(this.canEdit ? 'local' : 'readonly');
        this.scheduleReconnect();
      };

      ws.onerror = () => {
        if (!this.destroyed && this.status === 'connecting') {
          this.setStatus(this.canEdit ? 'local' : 'readonly');
        }
      };
    } catch (err) {
      LogError(err);
      this.setStatus(this.canEdit ? 'local' : 'readonly');
      if (this.transport === 'websocket') {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Updates the local `Y.Text('content')` value with minimal diff insertion/deletion.
   */
  public SetContent(newMarkdown: string): void {
    if (!this.CanMutateDocument || this.applyingRemote) {
      return;
    }
    const current = this.ContentText.toString();
    if (current === newMarkdown) {
      return;
    }
    this.seededInDoc = true;

    let prefixLen = 0;
    const minLen = Math.min(current.length, newMarkdown.length);
    while (prefixLen < minLen && current[prefixLen] === newMarkdown[prefixLen]) {
      prefixLen++;
    }

    let oldSuffix = current.length;
    let newSuffix = newMarkdown.length;
    while (
      oldSuffix > prefixLen &&
      newSuffix > prefixLen &&
      current[oldSuffix - 1] === newMarkdown[newSuffix - 1]
    ) {
      oldSuffix--;
      newSuffix--;
    }

    const deleteLen = oldSuffix - prefixLen;
    const insertText = newMarkdown.slice(prefixLen, newSuffix);

    this.Doc.transact(() => {
      if (deleteLen > 0) {
        this.ContentText.delete(prefixLen, deleteLen);
      }
      if (insertText.length > 0) {
        this.ContentText.insert(prefixLen, insertText);
      }
      this.populateSlideDeckCrdtIfPresentation(newMarkdown);
      this.populateSpreadsheetCrdtIfWorkbook(newMarkdown);
    }, 'local');
  }

  /**
   * Surgically updates a single slide in `slidesById` (`Y.Map`) and appends its `SlideID` to `slideOrder` (`Y.Array`)
   * if not yet present, enabling conflict-free concurrent multi-slide editing (`Accept #1`).
   */
  public UpdateSlideInDeck(slide: SlideSpec, fullDeckFallback?: SlideDeckSpec): void {
    if (!this.CanMutateDocument || this.applyingRemote) {
      return;
    }
    this.seededInDoc = true;
    this.Doc.transact(() => {
      if (this.Doc.getArray<string>('slideOrder').length === 0 && fullDeckFallback) {
        this.populateSlideDeckCrdtIfPresentation(SlideDeckEngine.Instance.SerializeDeckSpec(fullDeckFallback));
      }
      const slidesById = this.Doc.getMap<string>('slidesById');
      const slideOrder = this.Doc.getArray<string>('slideOrder');
      slidesById.set(slide.SlideID, JSON.stringify(slide));
      const existingOrder = slideOrder.toArray();
      if (!existingOrder.includes(slide.SlideID)) {
        slideOrder.push([slide.SlideID]);
      }
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.syncContentTextFromSlideCrdt();
      }
    }, 'local');
  }

  /**
   * Reorders the presentation deck via the shared `slideOrder` (`Y.Array<string>`) CRDT
   * without overwriting individual slide contents in `slidesById` (`Accept #1`).
   */
  public ReorderSlidesInDeck(orderedSlideIds: string[], fullDeckFallback?: SlideDeckSpec): void {
    if (!this.CanMutateDocument || this.applyingRemote) {
      return;
    }
    this.seededInDoc = true;
    this.Doc.transact(() => {
      if (this.Doc.getArray<string>('slideOrder').length === 0 && fullDeckFallback) {
        this.populateSlideDeckCrdtIfPresentation(SlideDeckEngine.Instance.SerializeDeckSpec(fullDeckFallback));
      }
      const slideOrder = this.Doc.getArray<string>('slideOrder');
      const existing = slideOrder.toArray();
      const nextOrder = [...orderedSlideIds];
      for (const id of existing) {
        if (!nextOrder.includes(id)) {
          nextOrder.push(id);
        }
      }
      slideOrder.delete(0, slideOrder.length);
      slideOrder.insert(0, nextOrder);
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.syncContentTextFromSlideCrdt();
      }
    }, 'local');
  }

  /**
   * Deletes a slide by `slideId` from `slidesById` (`Y.Map`) and `slideOrder` (`Y.Array`).
   */
  public DeleteSlideFromDeck(slideId: string, fullDeckFallback?: SlideDeckSpec): void {
    if (!this.CanMutateDocument || this.applyingRemote) {
      return;
    }
    this.seededInDoc = true;
    this.Doc.transact(() => {
      if (this.Doc.getArray<string>('slideOrder').length === 0 && fullDeckFallback) {
        this.populateSlideDeckCrdtIfPresentation(SlideDeckEngine.Instance.SerializeDeckSpec(fullDeckFallback));
      }
      const slidesById = this.Doc.getMap<string>('slidesById');
      const slideOrder = this.Doc.getArray<string>('slideOrder');
      slidesById.delete(slideId);
      const nextOrder = slideOrder.toArray().filter((id) => id !== slideId);
      slideOrder.delete(0, slideOrder.length);
      slideOrder.insert(0, nextOrder);
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.syncContentTextFromSlideCrdt();
      }
    }, 'local');
  }

  /**
   * Updates deck-level metadata (`Title`, `Subtitle`, `AspectRatio`, `Theme`, `Master`) in `deckMeta` (`Y.Map`)
   * without touching individual slide entries in `slidesById`.
   */
  public UpdateDeckMeta(deck: SlideDeckSpec): void {
    if (!this.CanMutateDocument || this.applyingRemote) {
      return;
    }
    this.seededInDoc = true;
    this.Doc.transact(() => {
      if (this.Doc.getArray<string>('slideOrder').length === 0) {
        this.populateSlideDeckCrdtIfPresentation(SlideDeckEngine.Instance.SerializeDeckSpec(deck));
      }
      const deckMeta = this.Doc.getMap<string>('deckMeta');
      deckMeta.set('DeckID', deck.DeckID);
      deckMeta.set('Title', deck.Title);
      deckMeta.set('Subtitle', deck.Subtitle ?? '');
      deckMeta.set('AspectRatio', deck.AspectRatio);
      deckMeta.set('Theme', JSON.stringify(deck.Theme));
      deckMeta.set('Master', JSON.stringify(deck.Master));
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.syncContentTextFromSlideCrdt();
      }
    }, 'local');
  }

  /**
   * Surgically updates a single spreadsheet cell in `sheetCellsByCoord` (`Y.Map`) keyed by
   * `${sheetId}::${cell.RowID}::${cell.ColumnID}` (`§ 6.2`, `Accept #1`).
   * Concurrent row/column insertions (`worksheetsById`) and formula edits (`sheetCellsByCoord`)
   * touch disjoint Yjs maps and merge cleanly without overwriting one another.
   */
  public UpdateSpreadsheetCell(
    sheetId: string,
    cell: SpreadsheetCellSpec,
    fullWorkbookFallback?: WorkbookSpec,
  ): void {
    if (!this.CanMutateDocument || this.applyingRemote) {
      return;
    }
    this.seededInDoc = true;
    this.Doc.transact(() => {
      if (this.Doc.getMap<string>('worksheetsById').size === 0 && fullWorkbookFallback) {
        this.populateSpreadsheetCrdtIfWorkbook(
          SpreadsheetEngine.Instance.SerializeWorkbook(fullWorkbookFallback),
        );
      }
      const sheetCellsByCoord = this.Doc.getMap<string>('sheetCellsByCoord');
      sheetCellsByCoord.set(`${sheetId}::${cell.RowID}::${cell.ColumnID}`, JSON.stringify(cell));
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.syncContentTextFromSpreadsheetCrdt();
      }
    }, 'local');
  }

  /**
   * Deletes a single spreadsheet cell from `sheetCellsByCoord` (`Y.Map`).
   */
  public DeleteSpreadsheetCell(
    sheetId: string,
    rowId: string,
    colId: string,
    fullWorkbookFallback?: WorkbookSpec,
  ): void {
    if (!this.CanMutateDocument || this.applyingRemote) {
      return;
    }
    this.seededInDoc = true;
    this.Doc.transact(() => {
      if (this.Doc.getMap<string>('worksheetsById').size === 0 && fullWorkbookFallback) {
        this.populateSpreadsheetCrdtIfWorkbook(
          SpreadsheetEngine.Instance.SerializeWorkbook(fullWorkbookFallback),
        );
      }
      const sheetCellsByCoord = this.Doc.getMap<string>('sheetCellsByCoord');
      sheetCellsByCoord.delete(`${sheetId}::${rowId}::${colId}`);
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.syncContentTextFromSpreadsheetCrdt();
      }
    }, 'local');
  }

  /**
   * Surgically updates worksheet structural metadata (`Rows`, `Columns`, `LiveTables`, `Charts`,
   * `EmbeddedArtifacts`, `Sort`, `Filters`, `FrozenRows`, `FrozenColumns`) in `worksheetsById` (`Y.Map`)
   * without touching individual cell entries in `sheetCellsByCoord` (`Accept #1`).
   */
  public UpdateWorksheetStructure(
    sheet: WorksheetSpec,
    fullWorkbookFallback?: WorkbookSpec,
  ): void {
    if (!this.CanMutateDocument || this.applyingRemote) {
      return;
    }
    this.seededInDoc = true;
    this.Doc.transact(() => {
      if (this.Doc.getMap<string>('worksheetsById').size === 0 && fullWorkbookFallback) {
        this.populateSpreadsheetCrdtIfWorkbook(
          SpreadsheetEngine.Instance.SerializeWorkbook(fullWorkbookFallback),
        );
      }
      const worksheetsById = this.Doc.getMap<string>('worksheetsById');
      const sheetOrder = this.Doc.getArray<string>('sheetOrder');
      const wsWithoutCells: WorksheetSpec = {
        ...sheet,
        Cells: {},
      };
      worksheetsById.set(sheet.SheetID, JSON.stringify(wsWithoutCells));
      const existingOrder = sheetOrder.toArray();
      if (!existingOrder.includes(sheet.SheetID)) {
        sheetOrder.push([sheet.SheetID]);
      }
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.syncContentTextFromSpreadsheetCrdt();
      }
    }, 'local');
  }

  /**
   * Updates workbook-level metadata (`Title`, `ActiveSheetID`, `NamedRanges`, and `sheetOrder`)
   * in `workbookMeta` (`Y.Map`) and `sheetOrder` (`Y.Array`).
   */
  public UpdateWorkbookMetadata(workbook: WorkbookSpec): void {
    if (!this.CanMutateDocument || this.applyingRemote) {
      return;
    }
    this.seededInDoc = true;
    this.Doc.transact(() => {
      this.populateSpreadsheetCrdtIfWorkbook(
        SpreadsheetEngine.Instance.SerializeWorkbook(workbook),
      );
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.syncContentTextFromSpreadsheetCrdt();
      }
    }, 'local');
  }

  /**
   * Sends a `save-version` control frame (`MSG_CONTROL = 2`) to the collaboration server
   * to compact the active room into a new immutable `MJ: Artifact Versions` record.
   */
  public RequestSaveVersion(): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.canEdit) {
      return false;
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_CONTROL);
    encoding.writeVarString(encoder, JSON.stringify({ action: 'save-version' }));
    this.socket.send(encoding.toUint8Array(encoder));
    return true;
  }

  /**
   * Broadcasts the user's currently focused block ID to collaborators via Yjs awareness.
   */
  public SetActiveBlock(blockId: string | undefined): void {
    const currentState = this.Awareness.getLocalState() ?? {};
    const userState =
      (currentState['user'] as {
        userId?: string | number;
        name?: string;
        email?: string;
        color?: string;
        activeBlockId?: string;
        canEdit?: boolean;
      } | undefined) ?? {};
    this.Awareness.setLocalStateField('user', {
      ...userState,
      activeBlockId: blockId,
    });
  }

  /**
   * Returns all active collaborators from the Yjs Awareness state map.
   */
  public GetCollaborators(): CollaboratorPresence[] {
    const result: CollaboratorPresence[] = [];
    this.Awareness.getStates().forEach(
      (
        state: {
          user?: {
            userId?: string | number;
            name?: string;
            email?: string;
            color?: string;
            activeBlockId?: string;
            canEdit?: boolean;
          };
        },
        clientId: number,
      ) => {
        const u = state.user;
        if (u && typeof u.name === 'string') {
          result.push({
            ClientID: clientId,
            UserID: String(u.userId ?? clientId),
            Name: u.name,
            Email: typeof u.email === 'string' ? u.email : undefined,
            Color: typeof u.color === 'string' ? u.color : 'var(--mj-brand-primary)',
            ActiveBlockID: typeof u.activeBlockId === 'string' ? u.activeBlockId : undefined,
            CanEdit: u.canEdit !== false,
          });
        }
      },
    );
    return result;
  }

  /**
   * Cleanly cancels any pending reconnect timer, closes the WebSocket, and destroys the Yjs document.
   */
  public Destroy(): void {
    this.destroyed = true;
    this.connectGeneration++;
    this.clearReconnectTimer();
    this.closeActiveSocketWithoutReconnect();
    this.contentChanged$.complete();
    this.statusChanged$.complete();
    this.collaboratorsChanged$.complete();
    this.versionSaved$.complete();
    this.liveSyncUnavailable$.complete();
    this.Awareness.destroy();
    this.Doc.destroy();
  }

  /**
   * Applies an incoming `y-protocols` binary frame (`sync = 0`, `awareness = 1`,
   * `control = 2`, or `permission-status = 3`) from the collaboration server.
   */
  public ApplyBinaryFrame(frame: Uint8Array): void {
    const decoder = decoding.createDecoder(frame);
    const msgType = decoding.readVarUint(decoder);

    if (msgType === MSG_SYNC) {
      const subDecoder = decoding.clone(decoder);
      const syncMsgType = decoding.readVarUint(subDecoder);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      this.applyingRemote = true;
      try {
        syncProtocol.readSyncMessage(decoder, encoder, this.Doc, 'remote');
      } finally {
        this.applyingRemote = false;
      }
      if (encoding.length(encoder) > 1 && this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(encoding.toUint8Array(encoder));
      }
      if (syncMsgType === syncProtocol.messageYjsSyncStep2) {
        this.hasCompletedInitialSync = true;
        this.setLiveSyncUnavailable(false);
        this.overrideSeedContent = null;
        if (
          this.transport === 'local-only' &&
          !this.seededInDoc &&
          this.ContentText.length === 0 &&
          this.initialSeedContent.length > 0 &&
          this.canEdit
        ) {
          this.seededInDoc = true;
          this.Doc.transact(() => {
            this.ContentText.insert(0, this.initialSeedContent);
            this.populateSlideDeckCrdtIfPresentation(this.initialSeedContent);
            this.populateSpreadsheetCrdtIfWorkbook(this.initialSeedContent);
          }, 'local');
        } else if (
          this.ContentText.length > 0 ||
          this.Doc.getArray<string>('slideOrder').length > 0 ||
          this.Doc.getMap<string>('worksheetsById').size > 0
        ) {
          this.seededInDoc = true;
        }
        this.lastSyncedRemoteContent = this.GetContent();
        this.statusChanged$.next(this.status);
      } else if (syncMsgType === syncProtocol.messageYjsUpdate) {
        if (
          this.ContentText.length > 0 ||
          this.Doc.getArray<string>('slideOrder').length > 0 ||
          this.Doc.getMap<string>('worksheetsById').size > 0
        ) {
          this.seededInDoc = true;
        }
        this.lastSyncedRemoteContent = this.GetContent();
      } else if (this.ContentText.length > 0) {
        this.seededInDoc = true;
      }
    } else if (msgType === MSG_AWARENESS) {
      const update = decoding.readVarUint8Array(decoder);
      awarenessProtocol.applyAwarenessUpdate(this.Awareness, update, 'remote');
    } else if (msgType === MSG_CONTROL || msgType === MSG_PERMISSION_STATE) {
      const jsonStr = decoding.readVarString(decoder);
      const parsed = SafeJSONParse<{
        type?: string;
        action?: string;
        payload?: string;
        canEdit?: boolean;
        canRead?: boolean;
        versionId?: string;
        versionNumber?: number;
      }>(jsonStr);
      if (!parsed) {
        return;
      }
      if ((parsed.type === 'room-reset' || parsed.action === 'room-reset') && typeof parsed.payload === 'string') {
        this.ApplyRoomReset(parsed.payload);
        return;
      }
      if (parsed.action === 'version-saved' && typeof parsed.versionNumber === 'number') {
        this.versionSaved$.next({
          versionId: parsed.versionId ?? '',
          versionNumber: parsed.versionNumber,
        });
        return;
      }
      if (parsed.action === 'readonly-rejected') {
        this.canEdit = false;
        this.setStatus('readonly');
      } else if (parsed.canRead === false) {
        this.canEdit = false;
        this.clearReconnectTimer();
        this.setStatus('revoked');
      } else if (parsed.canEdit === false) {
        this.canEdit = false;
        this.setStatus('readonly');
      } else if (parsed.canEdit === true) {
        this.canEdit = true;
        this.setStatus('connected');
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.liveSyncUnavailable) {
      return;
    }
    this.clearReconnectTimer();
    const baseDelay =
      RECONNECT_BACKOFF_MS[Math.min(this.reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1)];
    const jitter = Math.floor(Math.random() * 250);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed && !this.liveSyncUnavailable) {
        void this.Connect(this.configuredWsUrlOverride, this.configuredProvider);
      }
    }, baseDelay + jitter);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setLiveSyncUnavailable(unavailable: boolean, reason = ''): void {
    this.liveSyncUnavailable = unavailable;
    this.liveSyncErrorReason = unavailable ? reason : '';
    if (!this.destroyed && this.liveSyncUnavailable$.value !== unavailable) {
      this.liveSyncUnavailable$.next(unavailable);
    }
  }

  private closeActiveSocketWithoutReconnect(): void {
    if (!this.socket) {
      return;
    }
    const ws = this.socket;
    this.socket = null;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch (err) {
      LogError(err);
    }
  }

  private ensureLocalSeedIfUnseeded(): void {
    if (!this.seededInDoc && this.ContentText.length === 0 && this.initialSeedContent.length > 0) {
      this.seededInDoc = true;
      this.Doc.transact(() => {
        this.ContentText.insert(0, this.initialSeedContent);
        this.populateSlideDeckCrdtIfPresentation(this.initialSeedContent);
        this.populateSpreadsheetCrdtIfWorkbook(this.initialSeedContent);
      }, 'init');
    }
  }

  private populateSlideDeckCrdtIfPresentation(rawContent: string): void {
    const trimmed = (rawContent ?? '').trim();
    if (!trimmed.startsWith('{') || !trimmed.includes('"Slides"')) {
      return;
    }
    const parsed = SafeJSONParse<Partial<SlideDeckSpec>>(trimmed);
    if (!parsed || !Array.isArray(parsed.Slides) || parsed.Slides.length === 0) {
      return;
    }
    const deckMeta = this.Doc.getMap<string>('deckMeta');
    const slidesById = this.Doc.getMap<string>('slidesById');
    const slideOrder = this.Doc.getArray<string>('slideOrder');

    deckMeta.set('DeckID', parsed.DeckID || 'deck-1');
    deckMeta.set('Title', parsed.Title || 'Presentation');
    deckMeta.set('Subtitle', parsed.Subtitle || '');
    deckMeta.set('AspectRatio', parsed.AspectRatio === '4:3' ? '4:3' : '16:9');
    if (parsed.Theme) {
      deckMeta.set('Theme', JSON.stringify(parsed.Theme));
    }
    if (parsed.Master) {
      deckMeta.set('Master', JSON.stringify(parsed.Master));
    }

    const nextIds: string[] = [];
    for (const slide of parsed.Slides) {
      if (slide && typeof slide.SlideID === 'string' && slide.SlideID.trim()) {
        slidesById.set(slide.SlideID, JSON.stringify(slide));
        nextIds.push(slide.SlideID);
      }
    }
    const currentOrder = slideOrder.toArray();
    const sameOrder =
      currentOrder.length === nextIds.length &&
      currentOrder.every((id, idx) => id === nextIds[idx]);
    if (!sameOrder) {
      slideOrder.delete(0, slideOrder.length);
      slideOrder.insert(0, nextIds);
    }
  }

  private reconstructSlideDeckJsonFromCrdt(): string | null {
    const slideOrder = this.Doc.getArray<string>('slideOrder');
    const slidesById = this.Doc.getMap<string>('slidesById');
    const deckMeta = this.Doc.getMap<string>('deckMeta');
    if (slideOrder.length === 0 || slidesById.size === 0) {
      return null;
    }

    const orderedIds = slideOrder.toArray();
    const placedIds = new Set<string>();
    const slides: SlideSpec[] = [];

    for (const id of orderedIds) {
      const rawSlide = slidesById.get(id);
      if (rawSlide && !placedIds.has(id)) {
        const parsedSlide = SafeJSONParse<SlideSpec>(rawSlide);
        if (parsedSlide) {
          slides.push({
            ...parsedSlide,
            SlideNumber: slides.length + 1,
          });
          placedIds.add(id);
        }
      }
    }

    slidesById.forEach((rawSlide, id) => {
      if (!placedIds.has(id)) {
        const parsedSlide = SafeJSONParse<SlideSpec>(rawSlide);
        if (parsedSlide) {
          slides.push({
            ...parsedSlide,
            SlideNumber: slides.length + 1,
          });
          placedIds.add(id);
        }
      }
    });

    if (slides.length === 0) {
      return null;
    }

    let baseDeck: Partial<SlideDeckSpec> = {};
    const currentText = this.ContentText.toString().trim();
    if (currentText.startsWith('{')) {
      baseDeck = SafeJSONParse<Partial<SlideDeckSpec>>(currentText) ?? {};
    }

    let theme = baseDeck.Theme;
    const rawTheme = deckMeta.get('Theme');
    if (rawTheme) {
      theme = SafeJSONParse<SlideDeckSpec['Theme']>(rawTheme) ?? theme;
    }

    let master = baseDeck.Master;
    const rawMaster = deckMeta.get('Master');
    if (rawMaster) {
      master = SafeJSONParse<SlideDeckSpec['Master']>(rawMaster) ?? master;
    }

    const merged: Partial<SlideDeckSpec> = {
      ...baseDeck,
      SchemaVersion: '1.0',
      DeckID: deckMeta.get('DeckID') || baseDeck.DeckID || 'deck-1',
      Title: deckMeta.get('Title') || baseDeck.Title || 'Presentation',
      Subtitle: deckMeta.get('Subtitle') || baseDeck.Subtitle,
      AspectRatio: (deckMeta.get('AspectRatio') as '16:9' | '4:3') || baseDeck.AspectRatio || '16:9',
      Theme: theme,
      Master: master,
      Slides: slides,
      UpdatedAt: baseDeck.UpdatedAt || new Date().toISOString(),
    };

    return JSON.stringify(merged, null, 2);
  }

  private syncContentTextFromSlideCrdt(): void {
    const reconstructed = this.reconstructSlideDeckJsonFromCrdt();
    if (!reconstructed) {
      return;
    }
    const current = this.ContentText.toString();
    if (current !== reconstructed) {
      if (current.length > 0) {
        this.ContentText.delete(0, current.length);
      }
      this.ContentText.insert(0, reconstructed);
    }
  }

  private populateSpreadsheetCrdtIfWorkbook(rawContent: string): void {
    const trimmed = (rawContent ?? '').trim();
    if (!trimmed.startsWith('{') || !trimmed.includes('"Worksheets"')) {
      return;
    }
    const parsed = SafeJSONParse<Partial<WorkbookSpec>>(trimmed);
    if (!parsed || !Array.isArray(parsed.Worksheets) || parsed.Worksheets.length === 0) {
      return;
    }
    const workbookMeta = this.Doc.getMap<string>('workbookMeta');
    const sheetOrder = this.Doc.getArray<string>('sheetOrder');
    const worksheetsById = this.Doc.getMap<string>('worksheetsById');
    const sheetCellsByCoord = this.Doc.getMap<string>('sheetCellsByCoord');

    workbookMeta.set('WorkbookID', parsed.WorkbookID || 'wb-1');
    workbookMeta.set('Title', parsed.Title || 'Workbook');
    workbookMeta.set('ActiveSheetID', parsed.ActiveSheetID || parsed.Worksheets[0].SheetID);
    workbookMeta.set('NamedRanges', JSON.stringify(parsed.NamedRanges ?? []));

    const nextSheetIds: string[] = [];
    const activeCellKeys = new Set<string>();

    for (const ws of parsed.Worksheets) {
      if (!ws || typeof ws.SheetID !== 'string' || !ws.SheetID.trim()) {
        continue;
      }
      nextSheetIds.push(ws.SheetID);
      const wsWithoutCells: WorksheetSpec = {
        ...ws,
        Cells: {},
      };
      worksheetsById.set(ws.SheetID, JSON.stringify(wsWithoutCells));

      for (const cell of Object.values(ws.Cells ?? {})) {
        if (cell && cell.RowID && cell.ColumnID) {
          const coordKey = `${ws.SheetID}::${cell.RowID}::${cell.ColumnID}`;
          activeCellKeys.add(coordKey);
          sheetCellsByCoord.set(coordKey, JSON.stringify(cell));
        }
      }
    }

    const staleCellKeys: string[] = [];
    sheetCellsByCoord.forEach((_val, key) => {
      if (!activeCellKeys.has(key)) {
        staleCellKeys.push(key);
      }
    });
    for (const k of staleCellKeys) {
      sheetCellsByCoord.delete(k);
    }

    const staleSheetIds: string[] = [];
    worksheetsById.forEach((_val, id) => {
      if (!nextSheetIds.includes(id)) {
        staleSheetIds.push(id);
      }
    });
    for (const id of staleSheetIds) {
      worksheetsById.delete(id);
    }

    const currentOrder = sheetOrder.toArray();
    const sameOrder =
      currentOrder.length === nextSheetIds.length &&
      currentOrder.every((id, idx) => id === nextSheetIds[idx]);
    if (!sameOrder) {
      sheetOrder.delete(0, sheetOrder.length);
      sheetOrder.insert(0, nextSheetIds);
    }
  }

  private reconstructWorkbookJsonFromCrdt(): string | null {
    const workbookMeta = this.Doc.getMap<string>('workbookMeta');
    const sheetOrder = this.Doc.getArray<string>('sheetOrder');
    const worksheetsById = this.Doc.getMap<string>('worksheetsById');
    const sheetCellsByCoord = this.Doc.getMap<string>('sheetCellsByCoord');
    if (worksheetsById.size === 0) {
      return null;
    }

    const orderedIds = sheetOrder.toArray();
    const placedIds = new Set<string>();
    const worksheets: WorksheetSpec[] = [];

    const hydrateSheet = (rawSheet: string): WorksheetSpec | null => {
      const ws = SafeJSONParse<WorksheetSpec>(rawSheet);
      if (!ws) {
        return null;
      }
      ws.Cells = ws.Cells ?? {};
      return ws;
    };

    for (const id of orderedIds) {
      const raw = worksheetsById.get(id);
      if (raw && !placedIds.has(id)) {
        const ws = hydrateSheet(raw);
        if (ws) {
          worksheets.push(ws);
          placedIds.add(id);
        }
      }
    }
    worksheetsById.forEach((raw, id) => {
      if (!placedIds.has(id)) {
        const ws = hydrateSheet(raw);
        if (ws) {
          worksheets.push(ws);
          placedIds.add(id);
        }
      }
    });

    if (worksheets.length === 0) {
      return null;
    }

    const sheetMap = new Map<string, WorksheetSpec>();
    for (const ws of worksheets) {
      sheetMap.set(ws.SheetID, ws);
    }

    sheetCellsByCoord.forEach((rawCell, coordKey) => {
      const sep1 = coordKey.indexOf('::');
      if (sep1 < 0) return;
      const sheetId = coordKey.slice(0, sep1);
      const ws = sheetMap.get(sheetId);
      if (!ws) return;
      const cell = SafeJSONParse<SpreadsheetCellSpec>(rawCell);
      if (!cell) {
        return;
      }
      const row = ws.Rows.find((r) => r.RowID === cell.RowID);
      const col = ws.Columns.find((c) => c.ColumnID === cell.ColumnID);
      if (!row || !col) {
        return;
      }
      const addr = `${col.Letter}${row.Index}`;
      cell.Address = addr;
      ws.Cells[addr] = cell;
    });

    let namedRanges: SpreadsheetNamedRangeSpec[] = [];
    const rawNamedRanges = workbookMeta.get('NamedRanges');
    if (rawNamedRanges) {
      namedRanges = SafeJSONParse<SpreadsheetNamedRangeSpec[]>(rawNamedRanges) ?? [];
    }

    const nowIso = new Date().toISOString();
    const wb: WorkbookSpec = {
      WorkbookID: workbookMeta.get('WorkbookID') || 'wb-1',
      Title: workbookMeta.get('Title') || 'Workbook',
      ActiveSheetID: workbookMeta.get('ActiveSheetID') || worksheets[0].SheetID,
      Worksheets: worksheets,
      NamedRanges: namedRanges,
      CreatedAt: nowIso,
      UpdatedAt: nowIso,
    };

    for (const ws of wb.Worksheets) {
      SpreadsheetEngine.Instance.ReindexWorksheetAndResolveFormulas(ws);
    }
    SpreadsheetEngine.Instance.EvaluateWorkbook(wb);
    return SpreadsheetEngine.Instance.SerializeWorkbook(wb);
  }

  private syncContentTextFromSpreadsheetCrdt(): void {
    const reconstructed = this.reconstructWorkbookJsonFromCrdt();
    if (!reconstructed) {
      return;
    }
    const current = this.ContentText.toString();
    if (current !== reconstructed) {
      if (current.length > 0) {
        this.ContentText.delete(0, current.length);
      }
      this.ContentText.insert(0, reconstructed);
    }
  }

  private sendYjsUpdate(update: Uint8Array): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.canEdit) {
      return false;
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.socket.send(encoding.toUint8Array(encoder));
    this.hasUnsentLocalEdits = false;
    return true;
  }

  private setStatus(next: CollaborationConnectionStatus): void {
    this.status = next;
    this.statusChanged$.next(next);
  }
}

/**
 * Service providing real-time Yjs document sessions, block segmentation, TOC outline extraction,
 * `/` slash command registry, Suggest mode diffing, and anchored `DocBlock` comment management.
 */
@Injectable({
  providedIn: 'root',
})
export class DocumentCollaborationService {
  private readonly frozenSnapshotVerificationCache = new Map<string, boolean>();
  private readonly inFlightFrozenVerifications = new Map<string, Promise<boolean>>();
  private readonly slashCommands: ReadonlyArray<DocumentSlashCommand> = [
    {
      Command: '/heading-1',
      Label: 'Heading 1',
      Description: 'Large top-level section heading (#)',
      Category: 'Structure',
      Icon: 'fa-heading',
      Snippet: '# Section Title\n',
    },
    {
      Command: '/heading-2',
      Label: 'Heading 2',
      Description: 'Medium subsection heading (##)',
      Category: 'Structure',
      Icon: 'fa-heading',
      Snippet: '## Subsection Title\n',
    },
    {
      Command: '/heading-3',
      Label: 'Heading 3',
      Description: 'Compact topic heading (###)',
      Category: 'Structure',
      Icon: 'fa-heading',
      Snippet: '### Topic Heading\n',
    },
    {
      Command: '/table',
      Label: 'Table',
      Description: 'Insert a Markdown data table with headers',
      Category: 'Structure',
      Icon: 'fa-table',
      Snippet: '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Value 1 | Value 2 | Value 3 |\n',
    },
    {
      Command: '/callout',
      Label: 'Callout Box',
      Description: 'Highlighted note, tip, or warning callout block',
      Category: 'Structure',
      Icon: 'fa-circle-info',
      Snippet: '> [!NOTE]\n> Important context or decision takeaway for collaborators.\n',
    },
    {
      Command: '/task-list',
      Label: 'Task Checklist',
      Description: 'Actionable checklist with completion checkboxes',
      Category: 'Structure',
      Icon: 'fa-list-check',
      Snippet: '- [ ] First action item\n- [ ] Second action item\n',
    },
    {
      Command: '/code',
      Label: 'Code Block',
      Description: 'Syntax-highlighted fenced code snippet',
      Category: 'Structure',
      Icon: 'fa-code',
      Snippet: '```typescript\n// Code snippet\n```\n',
    },
    {
      Command: '/entity-view',
      Label: 'Live View',
      Description: 'Embed a live MemberJunction View (Default View or Saved View)',
      Category: 'Live Data',
      Icon: 'fa-table-list',
      BlockType: 'EntityView',
    },
    {
      Command: '/saved-query',
      Label: 'Live Query',
      Description: 'Embed a parameterized MemberJunction Query with live refresh or snapshot',
      Category: 'Live Data',
      Icon: 'fa-database',
      BlockType: 'SavedQuery',
    },
    {
      Command: '/dashboard',
      Label: 'Dashboard Part',
      Description: 'Embed an interactive MemberJunction dashboard KPI or chart part',
      Category: 'Live Data',
      Icon: 'fa-chart-pie',
      BlockType: 'DashboardPart',
    },
    {
      Command: '/component',
      Label: 'Interactive Component',
      Description: 'Embed a registered MemberJunction interactive component spec',
      Category: 'Live Data',
      Icon: 'fa-puzzle-piece',
      BlockType: 'InteractiveComponent',
    },
    {
      Command: '/whiteboard',
      Label: 'Inline Whiteboard',
      Description: 'Embed an interactive Whiteboard canvas with inline editing',
      Category: 'Embedded Artifact',
      Icon: 'fa-chalkboard',
      BlockType: 'Artifact',
    },
    {
      Command: '/artifact',
      Label: 'Embed Existing Artifact',
      Description: 'Embed any MemberJunction Artifact with version pinning and inline rendering',
      Category: 'Embedded Artifact',
      Icon: 'fa-cube',
      BlockType: 'Artifact',
    },
  ];

  /**
   * Returns true when either an explicit WebSocket override URL or a `GraphQLDataProvider`
   * capable of minting single-use collaboration tickets is available.
   */
  public HasCollaborationBackend(
    providerOverride?: IMetadataProvider | null,
    baseUrlOverride?: string | null,
  ): boolean {
    if (baseUrlOverride && baseUrlOverride.trim().length > 0) {
      return true;
    }
    const provider = resolveDefaultMetadataProvider(providerOverride);
    return isGraphQLCollaborationProvider(provider);
  }

  /**
   * Creates a new Yjs collaboration session for the given artifact.
   */
  public CreateSession(
    artifactId: string,
    initialContent: string,
    user: { id: string; name: string; email?: string; color?: string },
    canEdit = true,
    deferInitialSeedForRemoteSync = false,
  ): DocumentCollaborationSession {
    return new DocumentCollaborationSession(
      artifactId,
      initialContent,
      user,
      canEdit,
      deferInitialSeedForRemoteSync,
      (artId, wsOverride, provOverride) =>
        this.ResolveCollaborationEndpoint(artId, wsOverride, provOverride),
    );
  }

  /**
   * Acquires a single-use collaboration ticket via `GraphQLDataProvider.ExecuteGQL` (unless an
   * explicit test `wsUrl` with query parameters is supplied directly) and resolves the
   * authenticated WebSocket URL.
   */
  public async ResolveCollaborationEndpoint(
    artifactId: string,
    baseUrlOverride?: string | null,
    providerOverride?: IMetadataProvider | null,
  ): Promise<ResolvedCollaborationEndpoint> {
    if (!artifactId || !artifactId.trim()) {
      return { Mode: 'local', WsUrl: '', HasBackend: false };
    }

    const trimmedOverride = baseUrlOverride?.trim() || '';
    if (trimmedOverride && trimmedOverride.includes('?')) {
      const directUrl = this.ResolveCollaborationWebSocketUrl(
        artifactId,
        trimmedOverride,
        null,
        null,
        providerOverride,
      );
      return directUrl
        ? { Mode: 'connect', WsUrl: directUrl, HasBackend: true }
        : { Mode: 'local', WsUrl: '', HasBackend: true };
    }

    const provider = resolveDefaultMetadataProvider(providerOverride);
    if (isGraphQLCollaborationProvider(provider)) {
      try {
        const gqlRes = await provider.ExecuteGQL(MINT_COLLABORATION_TICKET_MUTATION, {
          artifactId,
        });
        const ticketData = gqlRes?.MintArtifactCollaborationTicket;
        if (!ticketData) {
          return {
            Mode: 'local',
            WsUrl: '',
            HasBackend: true,
            LiveSyncUnavailable: false,
            LiveSyncErrorReason: 'Collaboration ticket payload missing.',
          };
        }
        if (ticketData.CanRead === false) {
          return { Mode: 'revoked', WsUrl: '', CanEdit: false, HasBackend: true };
        }
        if (!ticketData.Success || !ticketData.Ticket) {
          const errorMessage = ticketData.ErrorMessage || '';
          const secretUnconfigured = isCollaborationSecretUnconfiguredMessage(errorMessage);
          return {
            Mode: 'local',
            WsUrl: '',
            CanEdit:
              secretUnconfigured && typeof ticketData.CanEdit === 'boolean'
                ? ticketData.CanEdit
                : undefined,
            HasBackend: true,
            LiveSyncUnavailable: secretUnconfigured,
            LiveSyncErrorReason:
              errorMessage ||
              (secretUnconfigured
                ? 'Collaboration ticket signing secret is not configured.'
                : 'Temporary collaboration ticket error.'),
          };
        }
        const explicitTicketWsUrl = (ticketData.wsUrl ?? ticketData.WsUrl ?? '').trim();
        const fallbackTicketWsPath = (ticketData.WsPath ?? '/collaboration/yjs').trim() || '/collaboration/yjs';
        const rawTicketWs = explicitTicketWsUrl || fallbackTicketWsPath;
        const wsUrl = this.ResolveCollaborationWebSocketUrl(
          artifactId,
          trimmedOverride || null,
          ticketData.Ticket,
          rawTicketWs,
          providerOverride,
          fallbackTicketWsPath,
        );
        if (!wsUrl) {
          return {
            Mode: 'local',
            WsUrl: '',
            CanEdit: typeof ticketData.CanEdit === 'boolean' ? ticketData.CanEdit : undefined,
            HasBackend: true,
            LiveSyncUnavailable: false,
            LiveSyncErrorReason: 'Unable to resolve collaboration WebSocket URL.',
          };
        }
        return {
          Mode: 'connect',
          WsUrl: wsUrl,
          CanEdit: typeof ticketData.CanEdit === 'boolean' ? ticketData.CanEdit : undefined,
          HasBackend: true,
        };
      } catch (err) {
        LogError(err);
        const reason = err instanceof Error ? err.message : String(err);
        const secretUnconfigured = isCollaborationSecretUnconfiguredMessage(reason);
        return {
          Mode: 'local',
          WsUrl: '',
          HasBackend: true,
          LiveSyncUnavailable: secretUnconfigured,
          LiveSyncErrorReason: reason,
        };
      }
    }

    if (trimmedOverride) {
      const fallbackOverrideUrl = this.ResolveCollaborationWebSocketUrl(
        artifactId,
        trimmedOverride,
        null,
        null,
        providerOverride,
      );
      return fallbackOverrideUrl
        ? { Mode: 'connect', WsUrl: fallbackOverrideUrl, HasBackend: true }
        : { Mode: 'local', WsUrl: '', HasBackend: true };
    }

    return { Mode: 'local', WsUrl: '', HasBackend: false };
  }

  /**
   * Resolves the WebSocket URL for `/collaboration/yjs`:
   * 1. If `wsPath` (`ticketPayload.wsUrl` / `WsUrl`) is a real configured public URL (or matches local dev
   *    when `window.location.hostname` is also loopback), uses that URL directly and appends `artifactId` + `ticket`.
   * 2. Whenever `ticket.WsUrl` is empty/undefined OR points to `localhost`/`127.0.0.1` while `window.location.hostname`
   *    is NOT `localhost`/`127.0.0.1`, derives the WebSocket URL from the active GraphQL endpoint URL
   *    (`GraphQLDataProvider` config URL -> `http(s)` replaced with `ws(s)` + reverse-proxy prefix + collaboration WS path).
   */
  public ResolveCollaborationWebSocketUrl(
    artifactId: string,
    baseUrlOverride?: string | null,
    ticket?: string | null,
    wsPath?: string | null,
    providerOverride?: IMetadataProvider | null,
    fallbackWsSubPath?: string | null,
  ): string {
    const fallbackRelativeBase =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const browserHostname =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname.trim()
        : '';

    const trimmedOverride = baseUrlOverride?.trim() || '';
    if (trimmedOverride && trimmedOverride.includes('?') && !ticket) {
      try {
        const parsed = new URL(trimmedOverride, fallbackRelativeBase);
        parsed.protocol = parsed.protocol.replace(/^http/i, 'ws');
        if (!parsed.pathname || parsed.pathname === '/') {
          parsed.pathname = wsPath?.trim() || '/collaboration/yjs';
        }
        if (!parsed.searchParams.has('artifactId')) {
          parsed.searchParams.set('artifactId', artifactId);
        }
        return parsed.toString();
      } catch (err) {
        LogError(err);
        return '';
      }
    }

    let rawPathOrUrl = wsPath && wsPath.trim() ? wsPath.trim() : '';
    if (/^(wss?|https?):\/\//i.test(rawPathOrUrl)) {
      try {
        const parsedWs = new URL(rawPathOrUrl);
        const isLoopbackTicketOnRemoteOrigin =
          isLoopbackHostname(parsedWs.hostname) &&
          browserHostname.length > 0 &&
          !isLoopbackHostname(browserHostname);
        if (!isLoopbackTicketOnRemoteOrigin) {
          parsedWs.protocol = parsedWs.protocol.replace(/^http/i, 'ws');
          if (!parsedWs.searchParams.has('artifactId')) {
            parsedWs.searchParams.set('artifactId', artifactId);
          }
          if (ticket && !parsedWs.searchParams.has('ticket')) {
            parsedWs.searchParams.set('ticket', ticket);
          }
          return parsedWs.toString();
        }
        // Ignore loopback ticket.WsUrl on remote browser origins; preserve path and derive from GraphQL URL below
        rawPathOrUrl = (fallbackWsSubPath && fallbackWsSubPath.trim()) || parsedWs.pathname || '/collaboration/yjs';
      } catch (err) {
        LogError(err);
        return '';
      }
    }

    let endpointUrl = trimmedOverride;
    if (!endpointUrl) {
      const provider = resolveDefaultMetadataProvider(providerOverride);
      if (isGraphQLCollaborationProvider(provider) && provider.ConfigData) {
        endpointUrl =
          provider.ConfigData.URL ||
          provider.ConfigData.MJAPIURL ||
          provider.ConfigData.WSURL ||
          '';
      }
    }
    if (!endpointUrl && browserHostname.length > 0 && !isLoopbackHostname(browserHostname)) {
      endpointUrl = fallbackRelativeBase;
    }

    if (!endpointUrl) {
      return '';
    }

    try {
      const parsedEndpoint = new URL(endpointUrl, fallbackRelativeBase);
      const wsOrigin = parsedEndpoint.origin.replace(/^http/i, 'ws');
      // Strip only a trailing /graphql segment while preserving any reverse-proxy prefix (e.g. /api-prefix)
      const basePath = parsedEndpoint.pathname
        .replace(/\/graphql\/?$/i, '')
        .replace(/\/+$/, '');
      const targetSubPath = rawPathOrUrl || '/collaboration/yjs';
      const normalizedSubPath = targetSubPath.startsWith('/') ? targetSubPath : `/${targetSubPath}`;
      const combinedPath =
        basePath &&
        normalizedSubPath !== basePath &&
        !normalizedSubPath.startsWith(`${basePath}/`)
          ? `${basePath}${normalizedSubPath}`
          : normalizedSubPath;
      const query = ticket
        ? `?artifactId=${encodeURIComponent(artifactId)}&ticket=${encodeURIComponent(ticket)}`
        : `?artifactId=${encodeURIComponent(artifactId)}`;
      return `${wsOrigin}${combinedPath}${query}`;
    } catch (err) {
      LogError(err);
      return '';
    }
  }

  /**
   * Resolves effective permissions (`CanRead`, `CanEdit`, `CanDelete`, `CanShare`) for `artifactId`
   * on the server via `ResolveArtifactPermissions` so server-registered delegates (such as
   * `bizapps-collaboration` space items) are evaluated on the server, falling back to
   * `ArtifactPermissionEngine.Instance.ResolvePermissions` when no GraphQL endpoint is available in tests.
   *
   * Distinguishes an explicit server denial (`AccessRevoked: true`, `PermissionVerifyError: false`)
   * from a transient GraphQL/network error (`PermissionVerifyError: true`, `AccessRevoked: false`)
   * while maintaining fail-closed read-only safety in both cases.
   */
  public async ResolvePermissionsFromServer(
    artifactId: string,
    providerOverride?: IMetadataProvider | null,
  ): Promise<VerifiedArtifactPermissions | null> {
    if (!artifactId || !artifactId.trim()) {
      return null;
    }
    const provider = resolveDefaultMetadataProvider(providerOverride);
    if (!provider) {
      return null;
    }

    if (isGraphQLCollaborationProvider(provider)) {
      try {
        const gqlRes = await provider.ExecuteGQL(RESOLVE_ARTIFACT_PERMISSIONS_QUERY, {
          artifactId,
        });
        const serverPerms =
          gqlRes?.ResolveArtifactPermissions ?? gqlRes?.ResolveArtifactUserPermissions;
        if (serverPerms && typeof serverPerms === 'object') {
          const canRead = Boolean(serverPerms.CanRead);
          const rawSource = serverPerms.Source;
          const validSource: ResolvedArtifactPermissions['Source'] =
            rawSource === 'Owner' ||
            rawSource === 'Delegate' ||
            rawSource === 'ArtifactPermission' ||
            rawSource === 'CollectionPermission' ||
            rawSource === 'Denied'
              ? rawSource
              : canRead
                ? 'Delegate'
                : 'Denied';
          return {
            ArtifactID: serverPerms.ArtifactID || artifactId,
            CanRead: canRead,
            CanEdit: Boolean(serverPerms.CanEdit),
            CanDelete: Boolean(serverPerms.CanDelete),
            CanShare: Boolean(serverPerms.CanShare),
            Source: validSource,
            Reason: serverPerms.Reason || '',
            AccessRevoked: !canRead,
            PermissionVerifyError: false,
          };
        }
      } catch (err) {
        LogError(err);
      }
      // Fail closed when a GraphQL collaboration provider is configured and permission verification fails transiently
      return {
        ArtifactID: artifactId,
        CanRead: false,
        CanEdit: false,
        CanDelete: false,
        CanShare: false,
        Source: 'Denied',
        Reason: 'Failed to verify artifact permissions on server.',
        AccessRevoked: false,
        PermissionVerifyError: true,
      };
    }

    const currentUser = provider.CurrentUser;
    if (!currentUser) {
      return null;
    }
    try {
      const localPerms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
        provider,
        artifactId,
        currentUser,
      );
      return {
        ...localPerms,
        AccessRevoked: !localPerms.CanRead,
        PermissionVerifyError: false,
      };
    } catch (err) {
      LogError(err);
      return null;
    }
  }

  /**
   * Alias for {@link FreezeLiveBlockOnServer} used by Document, Slide Deck, and Spreadsheet viewers.
   */
  public async FreezeLiveBlock(
    spec: DocumentBlockSpec,
    acknowledgeSecurityWarning: boolean,
    hostArtifactId?: string | null,
    providerOverride?: IMetadataProvider | null,
  ): Promise<{ Success: boolean; UpdatedSpec?: DocumentBlockSpec; ErrorMessage?: string }> {
    return this.FreezeLiveBlockOnServer(
      spec,
      acknowledgeSecurityWarning,
      hostArtifactId,
      providerOverride,
    );
  }

  /**
   * Freezes a live MJ block strictly via the server `FreezeDocumentLiveBlock` GraphQL mutation so the snapshot
   * receives a server-signed `hmac-sha256:...` `SnapshotContentHash`. Never falls back to client-side signing.
   */
  public async FreezeLiveBlockOnServer(
    spec: DocumentBlockSpec,
    acknowledgeSecurityWarning: boolean,
    hostArtifactId?: string | null,
    providerOverride?: IMetadataProvider | null,
  ): Promise<{ Success: boolean; UpdatedSpec?: DocumentBlockSpec; ErrorMessage?: string }> {
    const provider = resolveDefaultMetadataProvider(providerOverride);
    if (isGraphQLCollaborationProvider(provider)) {
      try {
        const gqlRes = await provider.ExecuteGQL(FREEZE_DOCUMENT_LIVE_BLOCK_MUTATION, {
          specJson: JSON.stringify(spec),
          acknowledgeSecurityWarning,
          hostArtifactId: hostArtifactId ?? '',
        });
        const freezePayload = gqlRes?.FreezeDocumentLiveBlock;
        if (freezePayload) {
          if (!freezePayload.Success) {
            return {
              Success: false,
              ErrorMessage: freezePayload.ErrorMessage || 'Failed to freeze live block on server.',
            };
          }
          const rawJson = freezePayload.UpdatedSpecJSON ?? freezePayload.UpdatedBlockSpecJson;
          const parsedSpec = rawJson ? SafeJSONParse<DocumentBlockSpec>(rawJson) : null;
          if (parsedSpec) {
            this.recordFrozenSnapshotVerification(parsedSpec, true);
            return { Success: true, UpdatedSpec: parsedSpec };
          }
        }
        return {
          Success: false,
          ErrorMessage: 'Server did not return a frozen block payload.',
        };
      } catch (err) {
        LogError(err);
        return {
          Success: false,
          ErrorMessage: err instanceof Error ? err.message : 'Failed to freeze live block on server.',
        };
      }
    }

    const user = provider?.CurrentUser;
    if (!provider || !user) {
      return {
        Success: false,
        ErrorMessage: 'Metadata provider or user context unavailable.',
      };
    }
    try {
      const localRes = await DocumentLiveBlockEngine.Instance.FreezeBlock(
        spec,
        user,
        acknowledgeSecurityWarning,
        provider,
      );
      if (localRes.Success && localRes.UpdatedSpec) {
        this.recordFrozenSnapshotVerification(localRes.UpdatedSpec, true);
      }
      return localRes;
    } catch (err) {
      return {
        Success: false,
        ErrorMessage:
          err instanceof Error
            ? err.message
            : 'Server collaboration endpoint is required to freeze live blocks.',
      };
    }
  }

  private computeFrozenVerificationCacheKey(
    block: DocumentBlockSpec & { SourceType?: string; SourceID?: string },
  ): string {
    const snap = block.FrozenSnapshot;
    if (!snap) {
      return '';
    }
    const resolvedSourceType = block.SourceType ?? block.Kind ?? '';
    const resolvedSourceId =
      block.SourceID ??
      block.ViewID ??
      block.QueryID ??
      block.ArtifactID ??
      block.DashboardID ??
      block.ComponentID ??
      block.EntityName ??
      block.QueryName ??
      '';
    return JSON.stringify({
      BlockID: block.BlockID,
      SourceType: resolvedSourceType,
      SourceID: resolvedSourceId,
      FrozenAt: snap.FrozenAt,
      FrozenByUserID: snap.FrozenByUserID,
      FrozenByUserName: snap.FrozenByUserName,
      Columns: snap.Columns,
      Rows: snap.Rows,
      TotalRowCount: snap.TotalRowCount,
      ArtifactContentSnapshot: snap.ArtifactContentSnapshot ?? '',
      ArtifactTypeSnapshot: snap.ArtifactTypeSnapshot ?? '',
      SecurityWarningAcknowledged: snap.SecurityWarningAcknowledged,
      SnapshotContentHash: snap.SnapshotContentHash ?? '',
    });
  }

  private recordFrozenSnapshotVerification(block: DocumentBlockSpec, verified: boolean): void {
    const key = this.computeFrozenVerificationCacheKey(block);
    if (key) {
      this.frozenSnapshotVerificationCache.set(key, verified);
    }
  }

  /**
   * Returns true ONLY when a frozen block's `FrozenSnapshot` has been verified by the server
   * (`VerifyFrozenSnapshotOnServer` or `FreezeLiveBlockOnServer`, or an explicit server execution result).
   * Never uses client-side secrets or format-only regex matching (`Blocker 1`).
   */
  public IsFrozenSnapshotVerified(
    block: DocumentBlockSpec | null | undefined,
    cachedExecutionResult?: {
      FrozenMetadata?: { SnapshotVerified?: boolean };
      FrozenSnapshot?: { SnapshotVerified?: boolean };
    } | null,
  ): boolean {
    if (!block || block.Mode !== 'Frozen' || !block.FrozenSnapshot) {
      return false;
    }
    if (cachedExecutionResult?.FrozenSnapshot?.SnapshotVerified === true) {
      return true;
    }
    if (cachedExecutionResult?.FrozenSnapshot?.SnapshotVerified === false) {
      return false;
    }
    if (cachedExecutionResult?.FrozenMetadata?.SnapshotVerified === true) {
      return true;
    }
    if (cachedExecutionResult?.FrozenMetadata?.SnapshotVerified === false) {
      return false;
    }
    const snap = block.FrozenSnapshot;
    if (
      snap.SecurityWarningAcknowledged !== true ||
      typeof snap.SnapshotContentHash !== 'string' ||
      snap.SnapshotContentHash.trim().length === 0
    ) {
      return false;
    }
    const key = this.computeFrozenVerificationCacheKey(block);
    return key ? this.frozenSnapshotVerificationCache.get(key) === true : false;
  }

  /**
   * Verifies a frozen snapshot strictly on the server via `VerifyFrozenBlockSnapshot`, returning
   * cached verification results immediately and deduplicating concurrent in-flight GraphQL requests
   * for the same `cacheKey` so rapid editor re-parses emit zero redundant network calls (`E3`).
   */
  public async VerifyFrozenSnapshotOnServer(
    block: DocumentBlockSpec,
    providerOverride?: IMetadataProvider | null,
  ): Promise<boolean> {
    if (!block || block.Mode !== 'Frozen' || !block.FrozenSnapshot) {
      return false;
    }
    const snap = block.FrozenSnapshot;
    if (
      snap.SecurityWarningAcknowledged !== true ||
      typeof snap.SnapshotContentHash !== 'string' ||
      snap.SnapshotContentHash.trim().length === 0
    ) {
      this.recordFrozenSnapshotVerification(block, false);
      return false;
    }
    const cacheKey = this.computeFrozenVerificationCacheKey(block);
    if (cacheKey) {
      const cached = this.frozenSnapshotVerificationCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }
      const inFlight = this.inFlightFrozenVerifications.get(cacheKey);
      if (inFlight) {
        return inFlight;
      }
    }

    const provider = resolveDefaultMetadataProvider(providerOverride);
    if (isGraphQLCollaborationProvider(provider)) {
      const runVerification = async (): Promise<boolean> => {
        try {
          const gqlRes = await provider.ExecuteGQL(VERIFY_FROZEN_BLOCK_SNAPSHOT_QUERY, {
            specJson: JSON.stringify(block),
          });
          const verifyPayload = gqlRes?.VerifyFrozenBlockSnapshot;
          if (verifyPayload && typeof verifyPayload.SnapshotVerified === 'boolean') {
            this.recordFrozenSnapshotVerification(block, verifyPayload.SnapshotVerified);
            return verifyPayload.SnapshotVerified;
          }
        } catch (err) {
          LogError(err);
        } finally {
          if (cacheKey) {
            this.inFlightFrozenVerifications.delete(cacheKey);
          }
        }
        this.recordFrozenSnapshotVerification(block, false);
        return false;
      };

      const promise = runVerification();
      if (cacheKey) {
        this.inFlightFrozenVerifications.set(cacheKey, promise);
      }
      return promise;
    }
    return this.IsFrozenSnapshotVerified(block);
  }

  /**
   * Commits an artifact content save through the server collaboration room (`CommitArtifactInlineEdit`)
   * when a GraphQL provider is active so the live Yjs room and working state stay synchronized with the saved version.
   */
  public async CommitInlineEditOnServer(
    artifactId: string,
    content: string,
    saveVersion = true,
    providerOverride?: IMetadataProvider | null,
  ): Promise<{
    HandledByServer: boolean;
    Success: boolean;
    VersionID?: string;
    VersionNumber?: number;
    ErrorMessage?: string;
  }> {
    const provider = resolveDefaultMetadataProvider(providerOverride);
    if (!isGraphQLCollaborationProvider(provider)) {
      return { HandledByServer: false, Success: false };
    }
    try {
      const gqlRes = await provider.ExecuteGQL(COMMIT_ARTIFACT_INLINE_EDIT_MUTATION, {
        artifactId,
        content,
        saveVersion,
      });
      const payload = gqlRes?.CommitArtifactInlineEdit;
      if (!payload) {
        return {
          HandledByServer: true,
          Success: false,
          ErrorMessage: 'Server did not return CommitArtifactInlineEdit response.',
        };
      }
      return {
        HandledByServer: true,
        Success: Boolean(payload.Success),
        VersionID: payload.VersionID ?? undefined,
        VersionNumber: typeof payload.VersionNumber === 'number' ? payload.VersionNumber : undefined,
        ErrorMessage: payload.ErrorMessage ?? undefined,
      };
    } catch (err) {
      LogError(err);
      return {
        HandledByServer: true,
        Success: false,
        ErrorMessage: err instanceof Error ? err.message : 'Failed to commit artifact edit on server.',
      };
    }
  }

  /**
   * Dispatches an `@mention` in an anchored comment thread to the server (`ExecuteAnchoredCommentAgentMention`),
   * enforcing `ArtifactPermissionEngine` (`CanEdit` for `'edit'`, `CanRead` for `'comment'`/`'suggest'`).
   */
  public async ExecuteAnchoredCommentAgentMention(
    artifactId: string,
    agentHandle: string,
    agentMode: 'comment' | 'suggest' | 'edit',
    commentBody: string,
    anchorQuote?: string,
    providerOverride?: IMetadataProvider | null,
    conversationId?: string,
  ): Promise<{
    HandledByServer: boolean;
    Success: boolean;
    ReplyBody?: string;
    UpdatedContent?: string;
    VersionID?: string;
    VersionNumber?: number;
    ErrorMessage?: string;
  }> {
    const provider = resolveDefaultMetadataProvider(providerOverride);
    if (!isGraphQLCollaborationProvider(provider)) {
      return { HandledByServer: false, Success: false };
    }
    try {
      const gqlRes = await provider.ExecuteGQL(EXECUTE_ANCHORED_COMMENT_AGENT_MENTION_MUTATION, {
        artifactId,
        agentHandle,
        agentMode,
        commentBody,
        anchorQuote: anchorQuote ?? null,
        conversationId: conversationId ?? null,
      });
      const payload = gqlRes?.ExecuteAnchoredCommentAgentMention;
      if (!payload) {
        return {
          HandledByServer: true,
          Success: false,
          ErrorMessage: 'Server did not return ExecuteAnchoredCommentAgentMention response.',
        };
      }
      return {
        HandledByServer: true,
        Success: Boolean(payload.Success),
        ReplyBody: payload.ReplyBody ?? undefined,
        UpdatedContent: payload.UpdatedContent ?? undefined,
        VersionID: payload.VersionID ?? undefined,
        VersionNumber: typeof payload.VersionNumber === 'number' ? payload.VersionNumber : undefined,
        ErrorMessage: payload.ErrorMessage ?? undefined,
      };
    } catch (err) {
      LogError(err);
      return {
        HandledByServer: true,
        Success: false,
        ErrorMessage:
          err instanceof Error ? err.message : 'Failed to execute anchored comment agent mention.',
      };
    }
  }

  /**
   * Alias for {@link ExecuteAnchoredCommentAgentMention} exposing `ReplyMessage` alongside `ReplyBody`.
   */
  public async DispatchAnchoredCommentAgentMention(
    artifactId: string,
    agentHandle: string,
    agentMode: 'comment' | 'suggest' | 'edit',
    commentBody: string,
    anchorQuote?: string,
    providerOverride?: IMetadataProvider | null,
    conversationId?: string,
  ): Promise<{
    HandledByServer: boolean;
    Success: boolean;
    ReplyBody?: string;
    ReplyMessage?: string;
    UpdatedContent?: string;
    VersionID?: string;
    VersionNumber?: number;
    ErrorMessage?: string;
  }> {
    const res = await this.ExecuteAnchoredCommentAgentMention(
      artifactId,
      agentHandle,
      agentMode,
      commentBody,
      anchorQuote,
      providerOverride,
      conversationId,
    );
    return {
      ...res,
      ReplyMessage: res.ReplyBody,
    };
  }

  /**
   * Returns `/slash` commands filtered by an optional query string.
   */
  public GetSlashCommands(query = ''): DocumentSlashCommand[] {
    const trimmed = query.trim().toLowerCase().replace(/^\//, '');
    if (!trimmed) {
      return [...this.slashCommands];
    }
    return this.slashCommands.filter(
      (cmd) =>
        cmd.Command.toLowerCase().includes(trimmed) ||
        cmd.Label.toLowerCase().includes(trimmed) ||
        cmd.Description.toLowerCase().includes(trimmed) ||
        cmd.Category.toLowerCase().includes(trimmed),
    );
  }

  /**
   * Segments a Markdown document into discrete blocks and `:::mj-block` directives
   * so each block can be rendered, edited, anchored with `DocBlock` comments, or toggled inline.
   */
  public ParseDocumentSegments(markdown: string): DocumentRenderSegment[] {
    const normalized = (markdown ?? '').replace(/\r\n/g, '\n');
    const rawSegments = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(normalized);
    const segments: DocumentRenderSegment[] = [];

    for (const rawSeg of rawSegments) {
      if (rawSeg.Type === 'mj-block' && rawSeg.BlockSpec) {
        segments.push({
          SegmentID: rawSeg.BlockSpec.BlockID,
          Kind: 'mj-block',
          BlockKind: 'mj-block',
          StartLine: rawSeg.StartLine,
          EndLine: rawSeg.EndLine,
          RawMarkdown: rawSeg.RawText,
          Descriptor: rawSeg.BlockSpec,
        });
      } else {
        const trimmed = rawSeg.RawText.trim();
        if (trimmed.length > 0) {
          segments.push(
            ...this.splitProseIntoLogicalBlocks(rawSeg.RawText, rawSeg.StartLine, rawSeg.EndLine),
          );
        }
      }
    }

    return segments;
  }

  /**
   * Extracts the Table of Contents (headings + embedded MJ blocks) from the Markdown document.
   */
  public ExtractOutline(markdown: string): DocumentOutlineItem[] {
    const segments = this.ParseDocumentSegments(markdown);
    const items: DocumentOutlineItem[] = [];

    for (const seg of segments) {
      if (seg.Kind === 'mj-block' && seg.Descriptor) {
        const desc = seg.Descriptor;
        items.push({
          ID: desc.BlockID,
          Kind: 'block',
          Level: 2,
          Title: desc.Title ?? desc.EntityName ?? desc.QueryName ?? desc.ArtifactType ?? desc.Kind,
          StartLine: seg.StartLine,
          BlockType: desc.Kind,
          BlockMode: desc.Mode,
        });
      } else if (seg.BlockKind === 'heading' && seg.HeadingText) {
        items.push({
          ID: seg.SegmentID,
          Kind: 'heading',
          Level: seg.HeadingLevel ?? 1,
          Title: seg.HeadingText,
          StartLine: seg.StartLine,
        });
      }
    }

    return items;
  }

  /**
   * Computes live word, character, line, and embedded block counts for the document status bar.
   */
  public ComputeWordStats(markdown: string): {
    Words: number;
    Characters: number;
    Lines: number;
    LiveBlocks: number;
    EmbeddedArtifacts: number;
  } {
    const normalized = (markdown ?? '').replace(/\r\n/g, '\n');
    const parsed = DocumentLiveBlockEngine.Instance.ParseMarkdownDirectives(normalized);
    const blockSegs = parsed.filter((d) => d.Type === 'mj-block' && d.BlockSpec);
    const words = normalized
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0).length;
    const lines = normalized.length === 0 ? 0 : normalized.split('\n').length;
    const liveBlocks = blockSegs.filter((d) => d.BlockSpec?.Kind !== 'Artifact').length;
    const embeddedArtifacts = blockSegs.filter((d) => d.BlockSpec?.Kind === 'Artifact').length;

    return {
      Words: normalized.trim().length === 0 ? 0 : words,
      Characters: normalized.length,
      Lines: lines,
      LiveBlocks: liveBlocks,
      EmbeddedArtifacts: embeddedArtifacts,
    };
  }

  /**
   * Computes a deterministic line-by-line diff between two document versions using
   * common prefix/suffix trimming, bounded Myers O((M+N)D), and linear unique-anchor fallback.
   */
  public ComputeLineDiff(oldContent: string, newContent: string): DocumentDiffResult {
    return computeLineDiffFromUtil(oldContent, newContent);
  }

  /**
   * Computes a Word / Google-Docs-style token-level redline diff and granular word/phrase change hunks
   * between an original block and a proposed block using bounded Myers + prefix/suffix trimming.
   */
  public ComputeWordLevelDiff(oldContent: string, newContent: string): DocumentWordDiffResult {
    const tokenize = (text: string): string[] =>
      (text ?? '').replace(/\r\n/g, '\n').match(/[A-Za-z0-9_]+|\s+|[^\sA-Za-z0-9_]+/g) ?? [];

    const oldTokens = tokenize(oldContent);
    const newTokens = tokenize(newContent);

    const seqOps = ComputeBoundedSequenceDiff(
      oldTokens,
      newTokens,
      (a, b) => a === b,
      (tok) => tok,
    );

    const rawOps: Array<{ Type: 'equal' | 'delete' | 'insert'; Text: string }> = seqOps.map((op) => {
      if (op.Kind === 'equal') {
        return { Type: 'equal', Text: oldTokens[op.OldIndex] };
      }
      if (op.Kind === 'delete') {
        return { Type: 'delete', Text: oldTokens[op.OldIndex] };
      }
      return { Type: 'insert', Text: newTokens[op.NewIndex] };
    });

    // Coalesce consecutive operations of the same type
    const coalesced: DocumentWordDiffSpan[] = [];
    for (const op of rawOps) {
      const prev = coalesced[coalesced.length - 1];
      if (prev && prev.Type === op.Type) {
        prev.Text += op.Text;
      } else {
        coalesced.push({ Type: op.Type, Text: op.Text });
      }
    }

    // Group adjacent non-equal spans (including single whitespace bridges inside a phrase edit) into granular Hunks
    interface HunkGroup {
      HunkID: string;
      StartIdx: number;
      EndIdx: number;
      DeletedText: string;
      InsertedText: string;
    }

    const groups: HunkGroup[] = [];
    let idx = 0;
    let hunkCounter = 1;
    while (idx < coalesced.length) {
      if (coalesced[idx].Type === 'equal') {
        idx++;
        continue;
      }
      const startIdx = idx;
      let endIdx = idx;
      let deletedText = '';
      let insertedText = '';

      while (endIdx < coalesced.length) {
        const span = coalesced[endIdx];
        if (span.Type === 'delete') {
          deletedText += span.Text;
          endIdx++;
          continue;
        }
        if (span.Type === 'insert') {
          insertedText += span.Text;
          endIdx++;
          continue;
        }
        // If an 'equal' span is purely horizontal whitespace between two edits, absorb it into the phrase hunk
        if (
          span.Type === 'equal' &&
          /^[ \t]+$/.test(span.Text) &&
          endIdx + 1 < coalesced.length &&
          coalesced[endIdx + 1].Type !== 'equal'
        ) {
          deletedText += span.Text;
          insertedText += span.Text;
          endIdx++;
          continue;
        }
        break;
      }

      const hunkId = `hunk-${hunkCounter++}`;
      for (let k = startIdx; k < endIdx; k++) {
        if (coalesced[k].Type !== 'equal') {
          coalesced[k].HunkID = hunkId;
        }
      }
      groups.push({
        HunkID: hunkId,
        StartIdx: startIdx,
        EndIdx: endIdx,
        DeletedText: deletedText,
        InsertedText: insertedText,
      });
      idx = endIdx;
    }

    const hunks: DocumentWordChangeHunk[] = groups
      .filter((g) => g.DeletedText.trim() !== g.InsertedText.trim())
      .map((g) => {
        const delTrim = g.DeletedText.trim();
        const insTrim = g.InsertedText.trim();
        const kind: DocumentWordChangeHunk['Kind'] =
          delTrim && insTrim ? 'replace' : insTrim ? 'insert' : 'delete';

        // Reconstruct text before and after this hunk
        let beforeText = '';
        for (let k = 0; k < g.StartIdx; k++) {
          if (coalesced[k].Type !== 'insert') {
            beforeText += coalesced[k].Text;
          }
        }
        let afterText = '';
        for (let k = g.EndIdx; k < coalesced.length; k++) {
          if (coalesced[k].Type !== 'insert') {
            afterText += coalesced[k].Text;
          }
        }

        // AcceptedMarkdown: apply ONLY this hunk to oldContent
        let acceptedMd = '';
        for (let k = 0; k < coalesced.length; k++) {
          const inCurrentHunk = k >= g.StartIdx && k < g.EndIdx;
          const s = coalesced[k];
          if (inCurrentHunk) {
            if (s.Type === 'equal' || s.Type === 'insert') {
              acceptedMd += s.Text;
            }
          } else {
            if (s.Type === 'equal' || s.Type === 'delete') {
              acceptedMd += s.Text;
            }
          }
        }

        // RejectedProposedMarkdown: revert ONLY this hunk in newContent back to oldContent
        let rejectedProposedMd = '';
        for (let k = 0; k < coalesced.length; k++) {
          const inCurrentHunk = k >= g.StartIdx && k < g.EndIdx;
          const s = coalesced[k];
          if (inCurrentHunk) {
            if (s.Type === 'equal' || s.Type === 'delete') {
              rejectedProposedMd += s.Text;
            }
          } else {
            if (s.Type === 'equal' || s.Type === 'insert') {
              rejectedProposedMd += s.Text;
            }
          }
        }

        return {
          HunkID: g.HunkID,
          Kind: kind,
          DeletedText: delTrim || g.DeletedText,
          InsertedText: insTrim || g.InsertedText,
          ContextBefore: beforeText.slice(-36).replace(/^\S*\s/, ''),
          ContextAfter: afterText.slice(0, 36).replace(/\s\S*$/, ''),
          AcceptedMarkdown: acceptedMd,
          RejectedProposedMarkdown: rejectedProposedMd,
        };
      });

    return {
      Spans: coalesced,
      Hunks: hunks,
    };
  }

  private splitProseIntoLogicalBlocks(raw: string, baseStartLine: number, _endLine: number): DocumentRenderSegment[] {
    const lines = raw.split('\n');
    const result: DocumentRenderSegment[] = [];
    let idx = 0;

    while (idx < lines.length) {
      while (idx < lines.length && lines[idx].trim().length === 0) {
        idx++;
      }
      if (idx >= lines.length) {
        break;
      }

      const blockStartIdx = idx;
      const firstLine = lines[idx].trim();

      // Heading block
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(firstLine);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        const slug = text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const startLine = baseStartLine + blockStartIdx;
        result.push({
          SegmentID: `heading-${startLine}-${slug || 'section'}`,
          Kind: 'markdown',
          BlockKind: 'heading',
          StartLine: startLine,
          EndLine: startLine,
          RawMarkdown: lines[idx],
          HeadingLevel: level,
          HeadingText: text,
        });
        idx++;
        continue;
      }

      // Fenced code block
      if (firstLine.startsWith('```')) {
        const codeLines = [lines[idx]];
        idx++;
        while (idx < lines.length && !lines[idx].trim().startsWith('```')) {
          codeLines.push(lines[idx]);
          idx++;
        }
        if (idx < lines.length) {
          codeLines.push(lines[idx]);
          idx++;
        }
        const startLine = baseStartLine + blockStartIdx;
        result.push({
          SegmentID: `code-${startLine}`,
          Kind: 'markdown',
          BlockKind: 'code',
          StartLine: startLine,
          EndLine: baseStartLine + idx - 1,
          RawMarkdown: codeLines.join('\n'),
        });
        continue;
      }

      // Paragraph / table / callout / list until blank line or next heading
      const chunkLines: string[] = [];
      while (
        idx < lines.length &&
        lines[idx].trim().length > 0 &&
        !/^#{1,6}\s+/.test(lines[idx].trim()) &&
        !lines[idx].trim().startsWith('```')
      ) {
        chunkLines.push(lines[idx]);
        idx++;
      }

      const chunkRaw = chunkLines.join('\n');
      const startLine = baseStartLine + blockStartIdx;
      const endLine = baseStartLine + idx - 1;
      let blockKind: DocumentRenderSegment['BlockKind'] = 'paragraph';
      if (firstLine.startsWith('>')) {
        blockKind = 'callout';
      } else if (firstLine.startsWith('|')) {
        blockKind = 'table';
      } else if (/^[-*+]\s+/.test(firstLine) || /^\d+\.\s+/.test(firstLine)) {
        blockKind = 'list';
      }

      result.push({
        SegmentID: `${blockKind}-${startLine}`,
        Kind: 'markdown',
        BlockKind: blockKind,
        StartLine: startLine,
        EndLine: endLine,
        RawMarkdown: chunkRaw,
      });
    }

    return result;
  }
}
