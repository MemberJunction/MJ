import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
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
  Category: 'Structure' | 'Live Data' | 'OLE Artifact';
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
  ) {
    this.ArtifactID = artifactId;
    this.canEdit = canEdit;
    this.initialSeedContent = initialContent ?? '';
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

    this.Doc.on('update', (update: Uint8Array, origin: unknown) => {
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
   * Connects to the MJServer `/collaboration/yjs` WebSocket endpoint when available.
   */
  public Connect(wsUrl: string): void {
    if (typeof WebSocket === 'undefined' || !wsUrl) {
      this.setStatus(this.canEdit ? 'local' : 'readonly');
      return;
    }

    try {
      this.setStatus('connecting');
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      this.socket = ws;

      ws.onopen = () => {
        this.setStatus(this.canEdit ? 'connected' : 'readonly');
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.writeSyncStep1(encoder, this.Doc);
        ws.send(encoding.toUint8Array(encoder));

        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(
          awarenessEncoder,
          awarenessProtocol.encodeAwarenessUpdate(this.Awareness, [this.Doc.clientID]),
        );
        ws.send(encoding.toUint8Array(awarenessEncoder));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (!(event.data instanceof ArrayBuffer)) {
          return;
        }
        this.ApplyBinaryFrame(new Uint8Array(event.data));
      };

      ws.onclose = (event: CloseEvent) => {
        this.socket = null;
        if (event.code === 4403) {
          this.canEdit = false;
          this.setStatus('revoked');
        } else {
          this.setStatus(this.canEdit ? 'local' : 'readonly');
        }
      };

      ws.onerror = () => {
        this.setStatus(this.canEdit ? 'local' : 'readonly');
      };
    } catch {
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
    const userState = (currentState['user'] as Record<string, unknown> | undefined) ?? {};
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
    this.Awareness.getStates().forEach((state: Record<string, unknown>, clientId: number) => {
      const u = state['user'] as Record<string, unknown> | undefined;
      if (u && typeof u['name'] === 'string') {
        result.push({
          ClientID: clientId,
          UserID: String(u['userId'] ?? clientId),
          Name: u['name'],
          Email: typeof u['email'] === 'string' ? u['email'] : undefined,
          Color: typeof u['color'] === 'string' ? u['color'] : 'var(--mj-brand-primary)',
          ActiveBlockID: typeof u['activeBlockId'] === 'string' ? u['activeBlockId'] : undefined,
          CanEdit: u['canEdit'] !== false,
        });
      }
    });
    return result;
  }

  /**
   * Cleanly closes the WebSocket and destroys the Yjs document.
   */
  public Destroy(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore close error
      }
      this.socket = null;
    }
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
      try {
        const parsed = JSON.parse(jsonStr) as {
          action?: string;
          canEdit?: boolean;
          canRead?: boolean;
          versionId?: string;
          versionNumber?: number;
        };
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
          this.setStatus('revoked');
        } else if (parsed.canEdit === false) {
          this.canEdit = false;
          this.setStatus('readonly');
        } else if (parsed.canEdit === true) {
          this.canEdit = true;
          this.setStatus('connected');
        }
      } catch {
        // Ignore malformed frame
      }
    }
  }

  private populateSlideDeckCrdtIfPresentation(rawContent: string): void {
    const trimmed = (rawContent ?? '').trim();
    if (!trimmed.startsWith('{') || !trimmed.includes('"Slides"')) {
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as Partial<SlideDeckSpec>;
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
    } catch {
      // Ignore non-deck content
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
        try {
          const parsedSlide = JSON.parse(rawSlide) as SlideSpec;
          slides.push({
            ...parsedSlide,
            SlideNumber: slides.length + 1,
          });
          placedIds.add(id);
        } catch {
          // Ignore malformed slide entry
        }
      }
    }

    slidesById.forEach((rawSlide, id) => {
      if (!placedIds.has(id)) {
        try {
          const parsedSlide = JSON.parse(rawSlide) as SlideSpec;
          slides.push({
            ...parsedSlide,
            SlideNumber: slides.length + 1,
          });
          placedIds.add(id);
        } catch {
          // Ignore malformed slide entry
        }
      }
    });

    if (slides.length === 0) {
      return null;
    }

    let baseDeck: Partial<SlideDeckSpec> = {};
    const currentText = this.ContentText.toString().trim();
    if (currentText.startsWith('{')) {
      try {
        baseDeck = JSON.parse(currentText) as Partial<SlideDeckSpec>;
      } catch {
        baseDeck = {};
      }
    }

    let theme = baseDeck.Theme;
    const rawTheme = deckMeta.get('Theme');
    if (rawTheme) {
      try {
        theme = JSON.parse(rawTheme) as SlideDeckSpec['Theme'];
      } catch {
        // Keep baseDeck.Theme
      }
    }

    let master = baseDeck.Master;
    const rawMaster = deckMeta.get('Master');
    if (rawMaster) {
      try {
        master = JSON.parse(rawMaster) as SlideDeckSpec['Master'];
      } catch {
        // Keep baseDeck.Master
      }
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
    try {
      const parsed = JSON.parse(trimmed) as Partial<WorkbookSpec>;
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
    } catch {
      // Ignore non-workbook content
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
      try {
        const ws = JSON.parse(rawSheet) as WorksheetSpec;
        ws.Cells = ws.Cells ?? {};
        return ws;
      } catch {
        return null;
      }
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
      try {
        const cell = JSON.parse(rawCell) as SpreadsheetCellSpec;
        const row = ws.Rows.find((r) => r.RowID === cell.RowID);
        const col = ws.Columns.find((c) => c.ColumnID === cell.ColumnID);
        if (!row || !col) {
          return;
        }
        const addr = `${col.Letter}${row.Index}`;
        cell.Address = addr;
        ws.Cells[addr] = cell;
      } catch {
        // Ignore malformed cell entry
      }
    });

    let namedRanges: SpreadsheetNamedRangeSpec[] = [];
    const rawNamedRanges = workbookMeta.get('NamedRanges');
    if (rawNamedRanges) {
      try {
        namedRanges = JSON.parse(rawNamedRanges) as SpreadsheetNamedRangeSpec[];
      } catch {
        namedRanges = [];
      }
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
      Label: 'Live MJ Entity View',
      Description: 'Embed a live, viewer-scoped (RLS/FLS) MemberJunction Entity View',
      Category: 'Live Data',
      Icon: 'fa-table-list',
      BlockType: 'EntityView',
    },
    {
      Command: '/saved-query',
      Label: 'Live MJ Saved Query',
      Description: 'Embed a parameterized Saved Query with live refresh or frozen snapshot',
      Category: 'Live Data',
      Icon: 'fa-database',
      BlockType: 'SavedQuery',
    },
    {
      Command: '/dashboard',
      Label: 'MJ Dashboard Part',
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
      Label: 'Inline Whiteboard (OLE Canvas)',
      Description: 'Embed an interactive Whiteboard canvas with inline editing & delegate permissions',
      Category: 'OLE Artifact',
      Icon: 'fa-chalkboard',
      BlockType: 'Artifact',
    },
    {
      Command: '/artifact',
      Label: 'Embed Existing MJ Artifact (OLE)',
      Description: 'Embed any MJ Artifact by ID with version pinning and inline plugin rendering',
      Category: 'OLE Artifact',
      Icon: 'fa-cube',
      BlockType: 'Artifact',
    },
  ];

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
    );
  }

  /**
   * Resolves the WebSocket URL for `/collaboration/yjs?artifactId=<id>` from the current browser origin or API URL.
   */
  public ResolveCollaborationWebSocketUrl(artifactId: string, baseUrlOverride?: string): string {
    if (baseUrlOverride) {
      const wsBase = baseUrlOverride.replace(/^http/i, 'ws').replace(/\/graphql\/?$/i, '');
      try {
        const parsed = new URL(wsBase);
        if (!parsed.pathname || parsed.pathname === '/') {
          parsed.pathname = '/collaboration/yjs';
        }
        if (!parsed.searchParams.has('artifactId')) {
          parsed.searchParams.set('artifactId', artifactId);
        }
        return parsed.toString();
      } catch {
        const sep = wsBase.includes('?') ? '&' : '?';
        const path = wsBase.includes('/collaboration/yjs') ? wsBase : `${wsBase.replace(/\/$/, '')}/collaboration/yjs`;
        return `${path}${sep}artifactId=${encodeURIComponent(artifactId)}`;
      }
    }
    if (typeof window !== 'undefined' && window.location) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/collaboration/yjs?artifactId=${encodeURIComponent(artifactId)}`;
    }
    return '';
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
   * Computes a deterministic line-by-line LCS diff between two document versions.
   */
  public ComputeLineDiff(oldContent: string, newContent: string): DocumentDiffResult {
    const oldLines = (oldContent ?? '').replace(/\r\n/g, '\n').split('\n');
    const newLines = (newContent ?? '').replace(/\r\n/g, '\n').split('\n');

    const m = oldLines.length;
    const n = newLines.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (oldLines[i] === newLines[j]) {
          dp[i][j] = 1 + dp[i + 1][j + 1];
        } else {
          dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    const diffLines: DocumentDiffLine[] = [];
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (oldLines[i] === newLines[j]) {
        diffLines.push({
          Type: 'same',
          OldLineNumber: i + 1,
          NewLineNumber: j + 1,
          Content: oldLines[i],
        });
        unchanged++;
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        diffLines.push({
          Type: 'removed',
          OldLineNumber: i + 1,
          NewLineNumber: null,
          Content: oldLines[i],
        });
        removed++;
        i++;
      } else {
        diffLines.push({
          Type: 'added',
          OldLineNumber: null,
          NewLineNumber: j + 1,
          Content: newLines[j],
        });
        added++;
        j++;
      }
    }

    while (i < m) {
      diffLines.push({
        Type: 'removed',
        OldLineNumber: i + 1,
        NewLineNumber: null,
        Content: oldLines[i],
      });
      removed++;
      i++;
    }

    while (j < n) {
      diffLines.push({
        Type: 'added',
        OldLineNumber: null,
        NewLineNumber: j + 1,
        Content: newLines[j],
      });
      added++;
      j++;
    }

    return {
      AddedLines: added,
      RemovedLines: removed,
      UnchangedLines: unchanged,
      Lines: diffLines,
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
