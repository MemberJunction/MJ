import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { LogError, Metadata, type IMetadataProvider } from '@memberjunction/core';
import { SafeJSONParse } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import {
  DocumentLiveBlockEngine,
  SlideDeckEngine,
  SpreadsheetEngine,
  type DocumentBlockSpec,
  type DocumentBlockKind,
  type SlideDeckSpec,
  type SlideSpec,
  type WorkbookSpec,
  type WorksheetSpec,
  type SpreadsheetCellSpec,
  type SpreadsheetNamedRangeSpec,
} from '@memberjunction/core-entities';

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
      ExpiresAt
      CanRead
      CanEdit
      ErrorMessage
    }
  }
`;

const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;
const MAX_RECONNECT_ATTEMPTS = 8;

export interface CollaborationTicketPayload {
  Success: boolean;
  Ticket?: string | null;
  WsPath?: string | null;
  ExpiresAt?: string | null;
  CanRead?: boolean | null;
  CanEdit?: boolean | null;
  ErrorMessage?: string | null;
}

export interface CollaborationGraphQLProviderLike {
  ExecuteGQL: (
    query: string,
    variables?: Record<string, string>,
  ) => Promise<{ MintArtifactCollaborationTicket?: CollaborationTicketPayload | null } | null | undefined>;
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
}

export interface SequenceDiffOp {
  Kind: 'equal' | 'delete' | 'insert';
  OldIndex: number;
  NewIndex: number;
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
  return Metadata.Provider ?? null;
}

/**
 * Bounded Myers O((M+N)D) sequence diff with common prefix/suffix trimming and
 * linear Patience-style unique-hash-anchor fallback when (m + n) > maxSequenceSum
 * or edit distance D exceeds maxEditDistance.
 */
export function ComputeBoundedSequenceDiff<T>(
  oldItems: readonly T[],
  newItems: readonly T[],
  equals: (a: T, b: T) => boolean,
  keyFn: (item: T) => string,
  maxEditDistance = 2000,
  maxSequenceSum = 10000,
): SequenceDiffOp[] {
  const m = oldItems.length;
  const n = newItems.length;

  let prefixLen = 0;
  const minLen = Math.min(m, n);
  while (prefixLen < minLen && equals(oldItems[prefixLen], newItems[prefixLen])) {
    prefixLen++;
  }

  let oldEnd = m;
  let newEnd = n;
  while (
    oldEnd > prefixLen &&
    newEnd > prefixLen &&
    equals(oldItems[oldEnd - 1], newItems[newEnd - 1])
  ) {
    oldEnd--;
    newEnd--;
  }

  const ops: SequenceDiffOp[] = [];
  for (let i = 0; i < prefixLen; i++) {
    ops.push({ Kind: 'equal', OldIndex: i, NewIndex: i });
  }

  const midM = oldEnd - prefixLen;
  const midN = newEnd - prefixLen;

  if (midM === 0 && midN > 0) {
    for (let j = prefixLen; j < newEnd; j++) {
      ops.push({ Kind: 'insert', OldIndex: -1, NewIndex: j });
    }
  } else if (midN === 0 && midM > 0) {
    for (let i = prefixLen; i < oldEnd; i++) {
      ops.push({ Kind: 'delete', OldIndex: i, NewIndex: -1 });
    }
  } else if (midM > 0 && midN > 0) {
    let midOps: SequenceDiffOp[] | null = null;
    if (midM + midN <= maxSequenceSum) {
      midOps = runBoundedMyersSlice(
        oldItems,
        prefixLen,
        midM,
        newItems,
        prefixLen,
        midN,
        equals,
        maxEditDistance,
      );
    }
    if (midOps) {
      for (const op of midOps) {
        ops.push(op);
      }
    } else {
      appendLinearHashAnchorOps(ops, oldItems, prefixLen, oldEnd, newItems, prefixLen, newEnd, equals, keyFn);
    }
  }

  const suffixCount = m - oldEnd;
  for (let s = 0; s < suffixCount; s++) {
    ops.push({ Kind: 'equal', OldIndex: oldEnd + s, NewIndex: newEnd + s });
  }

  return ops;
}

function runBoundedMyersSlice<T>(
  oldItems: readonly T[],
  oldOffset: number,
  M: number,
  newItems: readonly T[],
  newOffset: number,
  N: number,
  equals: (a: T, b: T) => boolean,
  maxEditDistance: number,
): SequenceDiffOp[] | null {
  const maxD = Math.min(M + N, maxEditDistance);
  const offset = maxD + 1;
  const v = new Int32Array(2 * maxD + 3);
  v.fill(-1);
  v[offset + 1] = 0;

  // M <= maxSequenceSum <= 32767 so Int16Array safely stores -1..M with minimal heap footprint
  const traces: Int16Array[] = [];

  for (let d = 0; d <= maxD; d++) {
    const snap = new Int16Array(d + 1);
    snap.fill(-1);

    for (let k = -d; k <= d; k += 2) {
      const canMoveDown =
        k !== d &&
        v[offset + k + 1] >= 0 &&
        v[offset + k + 1] <= M &&
        v[offset + k + 1] - k <= N;
      const canMoveRight =
        k !== -d &&
        v[offset + k - 1] >= 0 &&
        v[offset + k - 1] + 1 <= M &&
        v[offset + k - 1] + 1 - k <= N;

      if (!canMoveDown && !canMoveRight) {
        v[offset + k] = -1;
        snap[(k + d) >> 1] = -1;
        continue;
      }

      let x: number;
      if (canMoveDown && (!canMoveRight || v[offset + k - 1] < v[offset + k + 1])) {
        x = v[offset + k + 1];
      } else {
        x = v[offset + k - 1] + 1;
      }

      let y = x - k;
      while (x < M && y < N && equals(oldItems[oldOffset + x], newItems[newOffset + y])) {
        x++;
        y++;
      }

      v[offset + k] = x;
      snap[(k + d) >> 1] = x;

      if (x === M && y === N) {
        return backtrackMyersSlice(traces, d, M, N, oldOffset, newOffset);
      }
    }

    traces.push(snap);
  }

  return null;
}

function backtrackMyersSlice(
  traces: readonly Int16Array[],
  finalD: number,
  M: number,
  N: number,
  oldOffset: number,
  newOffset: number,
): SequenceDiffOp[] {
  const revOps: SequenceDiffOp[] = [];
  let x = M;
  let y = N;

  for (let d = finalD; d > 0; d--) {
    const k = x - y;
    const prevSnap = traces[d - 1];
    const vPrevMinus = k !== -d ? prevSnap[(k + d - 2) >> 1] : -1;
    const vPrevPlus = k !== d ? prevSnap[(k + d) >> 1] : -1;

    const canFromDown =
      vPrevPlus >= 0 && vPrevPlus <= M && vPrevPlus - k <= N;
    const canFromRight =
      vPrevMinus >= 0 && vPrevMinus + 1 <= M && vPrevMinus + 1 - k <= N;

    let prevK: number;
    let xStart: number;
    if (canFromDown && (!canFromRight || vPrevMinus < vPrevPlus)) {
      prevK = k + 1;
      xStart = vPrevPlus;
    } else {
      prevK = k - 1;
      xStart = vPrevMinus + 1;
    }

    const yStart = xStart - k;
    while (x > xStart && y > yStart) {
      x--;
      y--;
      revOps.push({ Kind: 'equal', OldIndex: oldOffset + x, NewIndex: newOffset + y });
    }

    if (prevK === k + 1) {
      y = yStart - 1;
      x = xStart;
      revOps.push({ Kind: 'insert', OldIndex: -1, NewIndex: newOffset + y });
    } else {
      x = xStart - 1;
      y = yStart;
      revOps.push({ Kind: 'delete', OldIndex: oldOffset + x, NewIndex: -1 });
    }
  }

  while (x > 0 && y > 0) {
    x--;
    y--;
    revOps.push({ Kind: 'equal', OldIndex: oldOffset + x, NewIndex: newOffset + y });
  }

  revOps.reverse();
  return revOps;
}

function appendLinearHashAnchorOps<T>(
  out: SequenceDiffOp[],
  oldItems: readonly T[],
  oldStart: number,
  oldEnd: number,
  newItems: readonly T[],
  newStart: number,
  newEnd: number,
  equals: (a: T, b: T) => boolean,
  keyFn: (item: T) => string,
): void {
  const oldUnique = new Map<string, number>();
  for (let i = oldStart; i < oldEnd; i++) {
    const key = keyFn(oldItems[i]);
    oldUnique.set(key, oldUnique.has(key) ? -1 : i);
  }

  const newUnique = new Map<string, number>();
  for (let j = newStart; j < newEnd; j++) {
    const key = keyFn(newItems[j]);
    newUnique.set(key, newUnique.has(key) ? -1 : j);
  }

  const candidates: Array<{ oldIdx: number; newIdx: number }> = [];
  for (let j = newStart; j < newEnd; j++) {
    const key = keyFn(newItems[j]);
    if (newUnique.get(key) === j) {
      const oi = oldUnique.get(key);
      if (oi !== undefined && oi >= 0 && equals(oldItems[oi], newItems[j])) {
        candidates.push({ oldIdx: oi, newIdx: j });
      }
    }
  }

  const anchors = extractMonotonicAnchors(candidates);

  let curOld = oldStart;
  let curNew = newStart;

  for (let a = 0; a <= anchors.length; a++) {
    const targetOld = a < anchors.length ? anchors[a].oldIdx : oldEnd;
    const targetNew = a < anchors.length ? anchors[a].newIdx : newEnd;

    let gOldStart = curOld;
    let gNewStart = curNew;
    while (
      gOldStart < targetOld &&
      gNewStart < targetNew &&
      equals(oldItems[gOldStart], newItems[gNewStart])
    ) {
      out.push({ Kind: 'equal', OldIndex: gOldStart, NewIndex: gNewStart });
      gOldStart++;
      gNewStart++;
    }

    let gOldEnd = targetOld;
    let gNewEnd = targetNew;
    while (
      gOldEnd > gOldStart &&
      gNewEnd > gNewStart &&
      equals(oldItems[gOldEnd - 1], newItems[gNewEnd - 1])
    ) {
      gOldEnd--;
      gNewEnd--;
    }

    const gapM = gOldEnd - gOldStart;
    const gapN = gNewEnd - gNewStart;
    if (gapM > 0 && gapN > 0 && gapM + gapN <= 256) {
      const localOps = runBoundedMyersSlice(
        oldItems,
        gOldStart,
        gapM,
        newItems,
        gNewStart,
        gapN,
        equals,
        128,
      );
      if (localOps) {
        for (const op of localOps) {
          out.push(op);
        }
      } else {
        for (let i = gOldStart; i < gOldEnd; i++) {
          out.push({ Kind: 'delete', OldIndex: i, NewIndex: -1 });
        }
        for (let j = gNewStart; j < gNewEnd; j++) {
          out.push({ Kind: 'insert', OldIndex: -1, NewIndex: j });
        }
      }
    } else {
      for (let i = gOldStart; i < gOldEnd; i++) {
        out.push({ Kind: 'delete', OldIndex: i, NewIndex: -1 });
      }
      for (let j = gNewStart; j < gNewEnd; j++) {
        out.push({ Kind: 'insert', OldIndex: -1, NewIndex: j });
      }
    }

    const gapSuffixLen = targetOld - gOldEnd;
    for (let s = 0; s < gapSuffixLen; s++) {
      out.push({ Kind: 'equal', OldIndex: gOldEnd + s, NewIndex: gNewEnd + s });
    }

    if (a < anchors.length) {
      out.push({ Kind: 'equal', OldIndex: targetOld, NewIndex: targetNew });
      curOld = targetOld + 1;
      curNew = targetNew + 1;
    }
  }
}

function extractMonotonicAnchors(
  candidates: ReadonlyArray<{ oldIdx: number; newIdx: number }>,
): Array<{ oldIdx: number; newIdx: number }> {
  const count = candidates.length;
  if (count === 0) {
    return [];
  }
  const tailIndices = new Int32Array(count);
  const prevIndices = new Int32Array(count);
  prevIndices.fill(-1);

  let length = 0;
  for (let i = 0; i < count; i++) {
    const val = candidates[i].oldIdx;
    let lo = 0;
    let hi = length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (candidates[tailIndices[mid]].oldIdx < val) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo > 0) {
      prevIndices[i] = tailIndices[lo - 1];
    }
    tailIndices[lo] = i;
    if (lo === length) {
      length++;
    }
  }

  const chosen: Array<{ oldIdx: number; newIdx: number }> = new Array(length);
  let k = tailIndices[length - 1];
  for (let pos = length - 1; pos >= 0; pos--) {
    chosen[pos] = candidates[k];
    k = prevIndices[k];
  }
  return chosen;
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
  AgentMode: 'suggest' | 'edit';
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
  public readonly Doc: Y.Doc;
  public readonly ContentText: Y.Text;
  public readonly Awareness: awarenessProtocol.Awareness;

  private socket: WebSocket | null = null;
  private status: CollaborationConnectionStatus = 'local';
  private canEdit: boolean;
  private applyingRemote = false;
  private readonly initialSeedContent: string;
  private seededInDoc = false;
  private destroyed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectGeneration = 0;
  private hasConnectedBefore = false;
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

  public get ContentChanged$(): Observable<string> {
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
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
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
    if (yText.length === 0 && !this.seededInDoc && this.initialSeedContent.length > 0) {
      return this.initialSeedContent;
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
    this.initialSeedContent = initialContent ?? '';
    this.endpointResolver = endpointResolver;
    this.Doc = new Y.Doc();
    this.ContentText = this.Doc.getText('content');
    if (initialContent && !deferInitialSeedForRemoteSync) {
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

    this.Doc.on('update', (update: Uint8Array, origin: string | number | symbol | object | null | undefined) => {
      if (origin !== 'remote') {
        this.sendYjsUpdate(update);
      }
      this.contentChanged$.next(this.GetContent());
    });

    this.Awareness.on('change', () => {
      this.collaboratorsChanged$.next(this.GetCollaborators());
    });
  }

  /**
   * Acquires a single-use collaboration ticket (when `GraphQLDataProvider` is configured)
   * and connects to the MJServer `/collaboration/yjs` WebSocket endpoint with automatic
   * exponential-backoff reconnection on transient disconnects.
   */
  public async Connect(wsUrl?: string | null, provider?: IMetadataProvider | null): Promise<void> {
    if (this.destroyed || typeof WebSocket === 'undefined') {
      this.ensureLocalSeedIfUnseeded();
      if (!this.destroyed) {
        this.setStatus(this.canEdit ? 'local' : 'readonly');
      }
      return;
    }

    this.configuredWsUrlOverride = wsUrl ?? null;
    this.configuredProvider = provider ?? null;
    const generation = ++this.connectGeneration;

    let targetWsUrl = wsUrl ?? '';
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
      if (resolved.CanEdit === false) {
        this.canEdit = false;
      }
      if (resolved.Mode === 'local' || !resolved.WsUrl) {
        this.ensureLocalSeedIfUnseeded();
        this.setStatus(this.canEdit ? 'local' : 'readonly');
        return;
      }
      targetWsUrl = resolved.WsUrl;
    } else if (!targetWsUrl) {
      this.ensureLocalSeedIfUnseeded();
      this.setStatus(this.canEdit ? 'local' : 'readonly');
      return;
    }

    if (this.destroyed || generation !== this.connectGeneration) {
      return;
    }

    this.closeActiveSocketWithoutReconnect();

    try {
      this.setStatus('connecting');
      const ws = new WebSocket(targetWsUrl);
      ws.binaryType = 'arraybuffer';
      this.socket = ws;

      ws.onopen = () => {
        if (this.destroyed || this.socket !== ws) {
          ws.close();
          return;
        }
        const isReconnect = this.hasConnectedBefore;
        this.hasConnectedBefore = true;
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
        this.setStatus(this.canEdit ? 'connected' : 'readonly');

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.writeSyncStep1(encoder, this.Doc);
        ws.send(encoding.toUint8Array(encoder));

        // Flush any offline local Y.Doc mutations accumulated while disconnected
        if (isReconnect && this.canEdit && this.seededInDoc) {
          const fullStateUpdate = Y.encodeStateAsUpdate(this.Doc);
          if (fullStateUpdate.byteLength > 2) {
            const updateEncoder = encoding.createEncoder();
            encoding.writeVarUint(updateEncoder, MSG_SYNC);
            syncProtocol.writeUpdate(updateEncoder, fullStateUpdate);
            ws.send(encoding.toUint8Array(updateEncoder));
          }
        }

        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(
          awarenessEncoder,
          awarenessProtocol.encodeAwarenessUpdate(this.Awareness, [this.Doc.clientID]),
        );
        ws.send(encoding.toUint8Array(awarenessEncoder));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (this.destroyed || !(event.data instanceof ArrayBuffer)) {
          return;
        }
        this.ApplyBinaryFrame(new Uint8Array(event.data));
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
          this.ensureLocalSeedIfUnseeded();
          this.setStatus(this.canEdit ? 'local' : 'readonly');
          return;
        }
        this.ensureLocalSeedIfUnseeded();
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
      this.ensureLocalSeedIfUnseeded();
      this.setStatus(this.canEdit ? 'local' : 'readonly');
    }
  }

  /**
   * Updates the local `Y.Text('content')` value with minimal diff insertion/deletion.
   */
  public SetContent(newMarkdown: string): void {
    if (!this.canEdit || this.applyingRemote) {
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
    if (!this.canEdit || this.applyingRemote) {
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
    if (!this.canEdit || this.applyingRemote) {
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
    if (!this.canEdit || this.applyingRemote) {
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
    if (!this.canEdit || this.applyingRemote) {
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
    if (!this.canEdit || this.applyingRemote) {
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
    if (!this.canEdit || this.applyingRemote) {
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
    if (!this.canEdit || this.applyingRemote) {
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
    if (!this.canEdit || this.applyingRemote) {
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
      // If we deferred initial seed for remote sync and server SyncStep2 was empty, seed once
      if (
        syncMsgType === syncProtocol.messageYjsSyncStep2 &&
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
      } else if (this.ContentText.length > 0) {
        this.seededInDoc = true;
      }
    } else if (msgType === MSG_AWARENESS) {
      const update = decoding.readVarUint8Array(decoder);
      awarenessProtocol.applyAwarenessUpdate(this.Awareness, update, 'remote');
    } else if (msgType === MSG_CONTROL || msgType === MSG_PERMISSION_STATE) {
      const jsonStr = decoding.readVarString(decoder);
      const parsed = SafeJSONParse<{
        action?: string;
        canEdit?: boolean;
        canRead?: boolean;
        versionId?: string;
        versionNumber?: number;
      }>(jsonStr);
      if (!parsed) {
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
    if (this.destroyed || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return;
    }
    this.clearReconnectTimer();
    const baseDelay =
      RECONNECT_BACKOFF_MS[Math.min(this.reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1)];
    const jitter = Math.floor(Math.random() * 250);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) {
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

  private sendYjsUpdate(update: Uint8Array): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.canEdit) {
      return;
    }
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    this.socket.send(encoding.toUint8Array(encoder));
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
      return { Mode: 'local', WsUrl: '' };
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
      return directUrl ? { Mode: 'connect', WsUrl: directUrl } : { Mode: 'local', WsUrl: '' };
    }

    const provider = resolveDefaultMetadataProvider(providerOverride);
    if (isGraphQLCollaborationProvider(provider)) {
      try {
        const gqlRes = await provider.ExecuteGQL(MINT_COLLABORATION_TICKET_MUTATION, {
          artifactId,
        });
        const ticketData = gqlRes?.MintArtifactCollaborationTicket;
        if (!ticketData) {
          return { Mode: 'local', WsUrl: '' };
        }
        if (ticketData.CanRead === false) {
          return { Mode: 'revoked', WsUrl: '', CanEdit: false };
        }
        if (!ticketData.Success || !ticketData.Ticket) {
          return {
            Mode: 'local',
            WsUrl: '',
            CanEdit: typeof ticketData.CanEdit === 'boolean' ? ticketData.CanEdit : undefined,
          };
        }
        const wsUrl = this.ResolveCollaborationWebSocketUrl(
          artifactId,
          trimmedOverride || null,
          ticketData.Ticket,
          ticketData.WsPath ?? '/collaboration/yjs',
          providerOverride,
        );
        if (!wsUrl) {
          return {
            Mode: 'local',
            WsUrl: '',
            CanEdit: typeof ticketData.CanEdit === 'boolean' ? ticketData.CanEdit : undefined,
          };
        }
        return {
          Mode: 'connect',
          WsUrl: wsUrl,
          CanEdit: typeof ticketData.CanEdit === 'boolean' ? ticketData.CanEdit : undefined,
        };
      } catch (err) {
        LogError(err);
        return { Mode: 'local', WsUrl: '' };
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
        ? { Mode: 'connect', WsUrl: fallbackOverrideUrl }
        : { Mode: 'local', WsUrl: '' };
    }

    return { Mode: 'local', WsUrl: '' };
  }

  /**
   * Resolves the WebSocket URL for `/collaboration/yjs` from `GraphQLDataProvider`'s configured
   * GraphQL endpoint origin (`new URL(gqlUrl, window.location.origin).origin.replace(/^http/, 'ws')`)
   * plus `WsPath` (`'/collaboration/yjs'`) and encoded `artifactId` + `ticket` query parameters.
   */
  public ResolveCollaborationWebSocketUrl(
    artifactId: string,
    baseUrlOverride?: string | null,
    ticket?: string | null,
    wsPath?: string | null,
    providerOverride?: IMetadataProvider | null,
  ): string {
    const fallbackRelativeBase =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';

    const trimmedOverride = baseUrlOverride?.trim() || '';
    if (trimmedOverride && trimmedOverride.includes('?') && !ticket) {
      try {
        const parsed = new URL(trimmedOverride, fallbackRelativeBase);
        const wsProto = parsed.protocol.replace(/^http/i, 'ws');
        parsed.protocol = wsProto;
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

    if (!endpointUrl) {
      return '';
    }

    try {
      const parsedEndpoint = new URL(endpointUrl, fallbackRelativeBase);
      const wsOrigin = parsedEndpoint.origin.replace(/^http/i, 'ws');
      const rawPath = wsPath && wsPath.trim() ? wsPath.trim() : '/collaboration/yjs';
      const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
      const query = ticket
        ? `?artifactId=${encodeURIComponent(artifactId)}&ticket=${encodeURIComponent(ticket)}`
        : `?artifactId=${encodeURIComponent(artifactId)}`;
      return `${wsOrigin}${normalizedPath}${query}`;
    } catch (err) {
      LogError(err);
      return '';
    }
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
    const oldLines = (oldContent ?? '').replace(/\r\n/g, '\n').split('\n');
    const newLines = (newContent ?? '').replace(/\r\n/g, '\n').split('\n');

    const ops = ComputeBoundedSequenceDiff(
      oldLines,
      newLines,
      (a, b) => a === b,
      (line) => line,
    );

    const diffLines: DocumentDiffLine[] = [];
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    for (const op of ops) {
      if (op.Kind === 'equal') {
        diffLines.push({
          Type: 'same',
          OldLineNumber: op.OldIndex + 1,
          NewLineNumber: op.NewIndex + 1,
          Content: oldLines[op.OldIndex],
        });
        unchanged++;
      } else if (op.Kind === 'delete') {
        diffLines.push({
          Type: 'removed',
          OldLineNumber: op.OldIndex + 1,
          NewLineNumber: null,
          Content: oldLines[op.OldIndex],
        });
        removed++;
      } else {
        diffLines.push({
          Type: 'added',
          OldLineNumber: null,
          NewLineNumber: op.NewIndex + 1,
          Content: newLines[op.NewIndex],
        });
        added++;
      }
    }

    return {
      AddedLines: added,
      RemovedLines: removed,
      UnchangedLines: unchanged,
      Lines: diffLines,
    };
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
