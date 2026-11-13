import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { IMetadataProvider, UserInfo, RunViewParams, RunViewResult } from '@memberjunction/core';
import {
  MJArtifactEntity,
  MJArtifactVersionEntity,
  ConversationEngine,
  type ConversationScope,
  SlideDeckEngine,
  SpreadsheetEngine,
  type DocumentBlockSpec,
  type FrozenBlockSnapshot,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ArtifactFileService } from '../services/artifact-file.service';
import { ArtifactIconService } from '../services/artifact-icon.service';
import {
  COLLAB_SECRET_UNCONFIGURED_CODE,
  DocumentCollaborationService,
  MAX_RECONNECT_ATTEMPTS,
} from '../services/document-collaboration.service';
import { DocumentImportExportService } from '../services/document-import-export.service';
import { SlideDeckExportService } from '../services/slide-deck-export.service';
import { ArtifactViewerPanelComponent } from '../components/artifact-viewer-panel.component';
import { MarkdownArtifactViewerComponent } from '../components/plugins/markdown-artifact-viewer.component';
import { SlideDeckArtifactViewerComponent } from '../components/plugins/slide-deck-artifact-viewer.component';
import { SpreadsheetArtifactViewerComponent } from '../components/plugins/spreadsheet-artifact-viewer.component';
import type { MammothModuleShim } from '../components/previews/office-preview.logic';

const SAMPLE_COLLAB_DOC = [
  '# Executive Architecture Brief',
  '',
  'Overview of real-time Yjs synchronization and live blocks.',
  '',
  '## Live Metrics Block',
  '',
  ':::mj-block',
  '{',
  '  "BlockID": "blk-metrics-1",',
  '  "Kind": "EntityView",',
  '  "Mode": "Live",',
  '  "Title": "Active Projects",',
  '  "EntityName": "MJ: Projects"',
  '}',
  ':::',
  '',
  '## Embedded Architecture Whiteboard',
  '',
  ':::mj-block',
  '{',
  '  "BlockID": "blk-wb-1",',
  '  "Kind": "Artifact",',
  '  "Mode": "Live",',
  '  "Title": "System Topology",',
  '  "ArtifactID": "wb-artifact-99",',
  '  "ArtifactType": "Whiteboard",',
  '  "EmbedMode": "Inline"',
  '}',
  ':::',
  '',
  '| Component | Status |',
  '| --- | --- |',
  '| Yjs Room | Ready |',
].join('\n');

describe('DocumentCollaborationService — segmentation, outline, slash menu, diff, and Yjs session', () => {
  const service = new DocumentCollaborationService();

  it('ParseDocumentSegments splits prose blocks and :::mj-block directives accurately', () => {
    const segments = service.ParseDocumentSegments(SAMPLE_COLLAB_DOC);
    expect(segments.length).toBeGreaterThanOrEqual(6);

    const mjBlocks = segments.filter((s) => s.Kind === 'mj-block');
    expect(mjBlocks).toHaveLength(2);
    expect(mjBlocks[0].Descriptor?.Kind).toBe('EntityView');
    expect(mjBlocks[0].Descriptor?.EntityName).toBe('MJ: Projects');
    expect(mjBlocks[1].Descriptor?.Kind).toBe('Artifact');
    expect(mjBlocks[1].Descriptor?.ArtifactType).toBe('Whiteboard');
  });

  it('ExtractOutline returns both hierarchical headings and embedded MJ blocks', () => {
    const outline = service.ExtractOutline(SAMPLE_COLLAB_DOC);
    expect(outline.map((o) => o.Title)).toEqual([
      'Executive Architecture Brief',
      'Live Metrics Block',
      'Active Projects',
      'Embedded Architecture Whiteboard',
      'System Topology',
    ]);
    expect(outline.filter((o) => o.Kind === 'block')).toHaveLength(2);
  });

  it('ComputeWordStats counts words, lines, live blocks, and embedded artifacts', () => {
    const stats = service.ComputeWordStats(SAMPLE_COLLAB_DOC);
    expect(stats.Words).toBeGreaterThan(20);
    expect(stats.Lines).toBeGreaterThan(20);
    expect(stats.LiveBlocks).toBe(1);
    expect(stats.EmbeddedArtifacts).toBe(1);
  });

  it('GetSlashCommands returns all commands and filters by query', () => {
    const all = service.GetSlashCommands('');
    expect(all.length).toBeGreaterThanOrEqual(10);

    const wb = service.GetSlashCommands('/whiteboard');
    expect(wb).toHaveLength(1);
    expect(wb[0].BlockType).toBe('Artifact');

    const liveData = service.GetSlashCommands('Live Data');
    expect(liveData.map((c) => c.BlockType)).toEqual([
      'EntityView',
      'SavedQuery',
      'DashboardPart',
      'InteractiveComponent',
    ]);
  });

  it('ComputeLineDiff produces an exact LCS diff between document revisions', () => {
    const v1 = '# Report\n\nOld paragraph.\nShared footer.';
    const v2 = '# Report\n\nNew paragraph.\nAdded note.\nShared footer.';

    const diff = service.ComputeLineDiff(v1, v2);
    expect(diff.RemovedLines).toBe(1);
    expect(diff.AddedLines).toBe(2);
    expect(diff.UnchangedLines).toBe(3);
  });

  it('DocumentCollaborationSession manages Y.Doc text mutations and handles permission state frames', () => {
    const session = service.CreateSession(
      'art-doc-1',
      '# Hello Yjs',
      { id: 'u-1', name: 'Alice' },
      true,
    );

    const observedContents: string[] = [];
    const sub = session.ContentChanged$.subscribe((text) => observedContents.push(text));

    expect(session.GetContent()).toBe('# Hello Yjs');
    expect(session.CanEdit).toBe(true);

    session.SetContent('# Hello Yjs\n\nAppended paragraph.');
    expect(session.GetContent()).toBe('# Hello Yjs\n\nAppended paragraph.');
    expect(observedContents[observedContents.length - 1]).toBe('# Hello Yjs\n\nAppended paragraph.');

    session.SetContent('# Updated Title\n\nAppended paragraph.');
    expect(session.GetContent()).toBe('# Updated Title\n\nAppended paragraph.');

    // Simulate receiving a server permission-downgrade frame (MSG_PERMISSION_STATE = 3)
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 3);
    encoding.writeVarString(encoder, JSON.stringify({ canRead: true, canEdit: false }));
    session.ApplyBinaryFrame(encoding.toUint8Array(encoder));

    expect(session.CanEdit).toBe(false);
    expect(session.Status).toBe('readonly');

    // Attempted edit while CanEdit === false is ignored
    session.SetContent('# Should Not Apply');
    expect(session.GetContent()).toBe('# Updated Title\n\nAppended paragraph.');

    sub.unsubscribe();
    session.Destroy();
  });
});

describe('DocumentImportExportService — .md, .docx (mammoth + docx), and .pdf conversion', () => {
  const importExport = new DocumentImportExportService();

  it('ImportMarkdown normalizes CRLF line endings while preserving :::mj-block directives', async () => {
    const raw = '# Title\r\n\r\n:::mj-block\r\n{"BlockID":"b1","Kind":"EntityView","Mode":"Live"}\r\n:::';
    const imported = await importExport.ImportMarkdown(raw);
    expect(imported).toBe('# Title\n\n:::mj-block\n{"BlockID":"b1","Kind":"EntityView","Mode":"Live"}\n:::');
  });

  it('ConvertDocxBytesToMarkdown converts DOCX HTML (headings, emphasis, and tables) into GFM Markdown', async () => {
    const mammothShim: MammothModuleShim = {
      convertToHtml: async () => ({
        value:
          '<h1>Quarterly Review</h1><p>This is <strong>bold</strong> and <em>italic</em>.</p>' +
          '<table><tr><th>Region</th><th>Revenue</th></tr><tr><td>North</td><td>$1.2M</td></tr></table>',
        messages: [],
      }),
    };

    const md = await importExport.ConvertDocxBytesToMarkdown(new ArrayBuffer(16), mammothShim);
    expect(md).toContain('# Quarterly Review');
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
    expect(md).toContain('| Region | Revenue |');
    expect(md).toContain('| North | $1.2M |');
  });

  it('ConvertMarkdownToDocxBytes generates a valid .docx binary archive from Markdown and :::mj-block directives', async () => {
    const bytes = await importExport.ConvertMarkdownToDocxBytes(SAMPLE_COLLAB_DOC, 'Strategy Brief');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // DOCX is a ZIP container starting with PK\x03\x04 (0x50, 0x4b, 0x03, 0x04)
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });
});

describe('DocumentCollaborationSession — Wave 3 Spreadsheet Per-Cell / Per-Worksheet CRDT Sync', () => {
  const service = new DocumentCollaborationService();

  it('Syncs per-cell edits and concurrent row insertions without clobbering formulas (Accept #1)', () => {
    const wbA = SpreadsheetEngine.Instance.CreateEmptyWorkbook('FY27 Budget');
    const sheetId = wbA.Worksheets[0].SheetID;
    SpreadsheetEngine.Instance.SetCell(wbA, sheetId, 'B2', { Value: 100 });
    SpreadsheetEngine.Instance.SetCell(wbA, sheetId, 'B3', { Value: 200 });
    SpreadsheetEngine.Instance.SetCell(wbA, sheetId, 'B4', { Value: 300 });
    SpreadsheetEngine.Instance.SetCell(wbA, sheetId, 'B5', { Value: 400 });
    const initialJson = SpreadsheetEngine.Instance.SerializeWorkbook(wbA);

    const sessionA = service.CreateSession(
      'art-sheet-1',
      initialJson,
      { id: 'u-alice', name: 'Alice' },
      true,
    );
    const sessionB = service.CreateSession(
      'art-sheet-1',
      '',
      { id: 'u-bob', name: 'Bob' },
      true,
      true,
    );

    // Sync initial Y.Doc state from room/Session A into Session B
    Y.applyUpdate(sessionB.Doc, Y.encodeStateAsUpdate(sessionA.Doc), 'remote');

    // Client A inserts a row at row 2 and updates worksheet structure
    SpreadsheetEngine.Instance.InsertRows(wbA, sheetId, 2, 1);
    sessionA.UpdateWorksheetStructure(wbA.Worksheets[0], wbA);

    // Client B concurrently writes a formula in C1 summing the original B2:B5 range
    const wbB = SpreadsheetEngine.Instance.ParseWorkbook(initialJson);
    const formulaCell = SpreadsheetEngine.Instance.SetCell(wbB, sheetId, 'C1', {
      Formula: '=SUM(B2:B5)',
    });
    sessionB.UpdateSpreadsheetCell(sheetId, formulaCell, wbB);

    // Exchange Yjs CRDT state updates between Session A and Session B
    const updateA = Y.encodeStateAsUpdate(sessionA.Doc);
    const updateB = Y.encodeStateAsUpdate(sessionB.Doc);
    Y.applyUpdate(sessionA.Doc, updateB, 'remote');
    Y.applyUpdate(sessionB.Doc, updateA, 'remote');

    const convergedA = SpreadsheetEngine.Instance.ParseWorkbook(sessionA.GetContent());
    const convergedB = SpreadsheetEngine.Instance.ParseWorkbook(sessionB.GetContent());
    SpreadsheetEngine.Instance.EvaluateWorkbook(convergedA);
    SpreadsheetEngine.Instance.EvaluateWorkbook(convergedB);

    expect(convergedA.Worksheets[0].Cells['C1']?.Formula).toBe('=SUM(B3:B6)');
    expect(convergedA.Worksheets[0].Cells['C1']?.ComputedValue).toBe(1000);
    expect(convergedB.Worksheets[0].Cells['C1']?.Formula).toBe('=SUM(B3:B6)');
    expect(convergedB.Worksheets[0].Cells['C1']?.ComputedValue).toBe(1000);

    sessionA.Destroy();
    sessionB.Destroy();
  });
});

describe('DocumentCollaborationService — ticket-authenticated URL resolution, reconnect backoff & bounded diff (A3, E4, CodeQL)', () => {
  const service = new DocumentCollaborationService();
  const importExport = new DocumentImportExportService();

  it('acquires a single-use ticket via MintArtifactCollaborationTicket and derives cross-port WS origin from ConfigData.URL (A3)', async () => {
    const executeGqlCalls: Array<{ query: string; variables?: Record<string, string> }> = [];
    const mockGraphQlProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      ConfigData: {
        URL: 'https://mjapi.corp.example:4443/graphql',
      },
      ExecuteGQL: async (query: string, variables?: Record<string, string>) => {
        executeGqlCalls.push({ query, variables });
        return {
          MintArtifactCollaborationTicket: {
            Success: true,
            Ticket: 'tok_single_use_987',
            WsPath: '/collaboration/yjs',
            ExpiresAt: '2026-11-09T23:59:59Z',
            CanRead: true,
            CanEdit: true,
          },
        };
      },
    });

    const resolved = await service.ResolveCollaborationEndpoint('art-uuid-42', null, mockGraphQlProvider);
    expect(executeGqlCalls).toHaveLength(1);
    expect(executeGqlCalls[0].query).toContain('MintArtifactCollaborationTicket');
    expect(executeGqlCalls[0].query).toContain('ErrorCode');
    expect(executeGqlCalls[0].variables).toEqual({ artifactId: 'art-uuid-42' });
    expect(resolved.Mode).toBe('connect');
    expect(resolved.WsUrl).toBe(
      'wss://mjapi.corp.example:4443/collaboration/yjs?artifactId=art-uuid-42&ticket=tok_single_use_987',
    );
    expect(resolved.CanEdit).toBe(true);
  });

  it('stays cleanly in local mode when no GraphQLDataProvider or wsUrl override is configured (A3)', async () => {
    const plainProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      Entities: [],
      EntityByName: (name: string) =>
        name === 'MJ: Artifacts' ? { ID: 'artifacts-entity-id', Name: 'MJ: Artifacts' } : undefined,
    });
    const resolved = await service.ResolveCollaborationEndpoint('art-local-1', null, plainProvider);
    expect(resolved.Mode).toBe('local');
    expect(resolved.WsUrl).toBe('');
  });

  it('reconnects with fresh single-use tickets after transient close, resyncs offline Y.Doc edits, and stops cleanly on Destroy() (A3)', async () => {
    vi.useFakeTimers();
    const originalWebSocket = globalThis.WebSocket;

    interface MockSocketInstance {
      url: string;
      readyState: number;
      binaryType: string;
      sentFrames: Uint8Array[];
      onopen: (() => void) | null;
      onmessage: ((evt: MessageEvent) => void) | null;
      onclose: ((evt: CloseEvent) => void) | null;
      onerror: (() => void) | null;
      close: () => void;
    }

    const createdSockets: MockSocketInstance[] = [];
    class FakeWebSocket {
      public static readonly CONNECTING = 0;
      public static readonly OPEN = 1;
      public static readonly CLOSING = 2;
      public static readonly CLOSED = 3;

      public url: string;
      public readyState = FakeWebSocket.CONNECTING;
      public binaryType = 'blob';
      public sentFrames: Uint8Array[] = [];
      public onopen: (() => void) | null = null;
      public onmessage: ((evt: MessageEvent) => void) | null = null;
      public onclose: ((evt: CloseEvent) => void) | null = null;
      public onerror: (() => void) | null = null;

      constructor(url: string) {
        this.url = url;
        createdSockets.push(this);
      }

      public send(data: Uint8Array): void {
        this.sentFrames.push(data);
      }

      public close(): void {
        this.readyState = FakeWebSocket.CLOSED;
      }
    }

    Reflect.set(globalThis, 'WebSocket', FakeWebSocket);
    let ticketCounter = 0;
    const mockGraphQlProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      ConfigData: { URL: 'http://localhost:4000/graphql' },
      ExecuteGQL: async () => ({
        MintArtifactCollaborationTicket: {
          Success: true,
          Ticket: `ticket-${++ticketCounter}`,
          WsPath: '/collaboration/yjs',
          CanRead: true,
          CanEdit: true,
        },
      }),
    });

    try {
      const session = service.CreateSession('art-reconnect-1', '# Initial', { id: 'u1', name: 'Alice' }, true, true);
      await session.Connect(null, mockGraphQlProvider);

      expect(createdSockets).toHaveLength(1);
      expect(createdSockets[0].url).toContain('ticket=ticket-1');
      createdSockets[0].readyState = FakeWebSocket.OPEN;
      createdSockets[0].onopen?.();
      expect(session.Status).toBe('connected');

      // Server has seeded "# Initial" in its room Y.Doc and sends SyncStep2
      const serverDoc = new Y.Doc();
      serverDoc.getText('content').insert(0, '# Initial');
      const step2Encoder = encoding.createEncoder();
      encoding.writeVarUint(step2Encoder, 0);
      syncProtocol.writeSyncStep2(step2Encoder, serverDoc);
      createdSockets[0].onmessage?.({ data: encoding.toUint8Array(step2Encoder).buffer } as MessageEvent);

      // Transient network drop (code 1006) — does NOT locally re-seed Y.Text
      createdSockets[0].readyState = FakeWebSocket.CLOSED;
      createdSockets[0].onclose?.({ code: 1006 } as CloseEvent);
      expect(session.Status).toBe('local');
      expect(session.Transport).toBe('websocket');
      expect(session.YDoc.getText('content').toString()).toBe('# Initial');

      // User makes an offline edit while disconnected
      session.SetContent('# Initial\n\nOffline paragraph added.');

      // Advance timer past 1000ms + jitter (< 1500ms) -> mints fresh ticket-2 and reconnects
      await vi.advanceTimersByTimeAsync(1500);
      expect(createdSockets).toHaveLength(2);
      expect(createdSockets[1].url).toContain('ticket=ticket-2');

      createdSockets[1].readyState = FakeWebSocket.OPEN;
      createdSockets[1].onopen?.();
      expect(session.Status).toBe('connected');
      // On open, sends ONLY syncStep1 + awareness (2 frames), NOT a blind full Y.encodeStateAsUpdate resend
      expect(createdSockets[1].sentFrames).toHaveLength(2);

      // When server sends its syncStep1, client replies with syncStep2 containing the offline edit
      const serverStep1Encoder = encoding.createEncoder();
      encoding.writeVarUint(serverStep1Encoder, 0);
      syncProtocol.writeSyncStep1(serverStep1Encoder, serverDoc);
      createdSockets[1].onmessage?.({ data: encoding.toUint8Array(serverStep1Encoder).buffer } as MessageEvent);
      expect(createdSockets[1].sentFrames.length).toBeGreaterThanOrEqual(3);

      // Apply the client's syncStep2 reply to serverDoc -> serverDoc now has the offline paragraph without duplication!
      const replyDecoder = decoding.createDecoder(createdSockets[1].sentFrames[2]);
      decoding.readVarUint(replyDecoder); // MSG_SYNC
      const dummyEncoder = encoding.createEncoder();
      syncProtocol.readSyncMessage(replyDecoder, dummyEncoder, serverDoc, 'client');
      expect(serverDoc.getText('content').toString()).toBe('# Initial\n\nOffline paragraph added.');

      // Destroy stops future reconnect timers and closes socket cleanly
      session.Destroy();
      expect(session.IsDestroyed).toBe(true);
      await vi.advanceTimersByTimeAsync(20000);
      expect(createdSockets).toHaveLength(2);
    } finally {
      Reflect.set(globalThis, 'WebSocket', originalWebSocket);
      vi.useRealTimers();
    }
  });

  it('ComputeLineDiff handles two 20,000-line documents in < 2500ms via prefix/suffix + bounded Myers/anchor diff (E4)', () => {
    const linesA: string[] = [];
    const linesB: string[] = [];
    for (let i = 0; i < 20000; i++) {
      linesA.push(`Section ${i}: Shared specification line ${i}`);
      linesB.push(i === 10000 ? `Section ${i}: Modified specification line ${i}` : `Section ${i}: Shared specification line ${i}`);
    }
    const t0 = performance.now();
    const diff = service.ComputeLineDiff(linesA.join('\n'), linesB.join('\n'));
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(2500);
    expect(diff.AddedLines).toBe(1);
    expect(diff.RemovedLines).toBe(1);
    expect(diff.UnchangedLines).toBe(19999);
  });

  it('ConvertHtmlToMarkdown escapes both backslashes and pipe characters in GFM table cells (CodeQL)', async () => {
    const md = await importExport.ConvertHtmlToMarkdown(
      '<table><tr><th>Path</th><th>Expr</th></tr><tr><td>C:\\\\Users\\\\Docs</td><td>A | B</td></tr></table>',
    );
    expect(md).toContain('C:\\\\\\\\Users\\\\\\\\Docs');
    expect(md).toContain('A \\| B');
  });
});

describe('Round 4 Punch List (#6779237352) — SlideDeckExportService, Docs C1 @mentions, and Sheets C2 Server Freeze', () => {
  it('SlideDeckExportService.BuildPrintableDeckHtml preserves quoted CSS font-family names inside <style> while blocking </style>', () => {
    const exportService = new SlideDeckExportService();
    const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Board Review');
    deck.Theme = {
      ...deck.Theme,
      HeadingFont: `'Playfair Display', "Plus Jakarta Sans", Georgia, serif`,
      BodyFont: `'Inter', system-ui, sans-serif`,
    };

    const html = exportService.BuildPrintableDeckHtml(deck, new Map());
    expect(html).toContain(`font-family: 'Playfair Display', "Plus Jakarta Sans", Georgia, serif;`);
    expect(html).toContain(`font-family: 'Inter', system-ui, sans-serif;`);
    expect(html).not.toContain('&#39;Playfair Display&#39;');
    expect(html).not.toContain('&quot;Plus Jakarta Sans&quot;');

    const maliciousDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Breakout Check');
    maliciousDeck.Theme = {
      ...maliciousDeck.Theme,
      BodyFont: `'Inter'</style><script>alert(1)</script>`,
    };
    const safeHtml = exportService.BuildPrintableDeckHtml(maliciousDeck, new Map());
    expect(safeHtml).not.toContain('<script>');
  });

  it('MarkdownArtifactViewerComponent (C1): ignores emails, omits fake quotes when unselected, and stays non-destructive on failed @mention', async () => {
    const collabService = new DocumentCollaborationService();
    const dispatchCalls: Array<{
      artifactId: string;
      agentHandle: string;
      agentMode: 'comment' | 'suggest' | 'edit';
      commentBody: string;
      anchorQuote?: string;
    }> = [];
    vi.spyOn(collabService, 'DispatchAnchoredCommentAgentMention').mockImplementation(
      async (artifactId, agentHandle, agentMode, commentBody, anchorQuote) => {
        dispatchCalls.push({ artifactId, agentHandle, agentMode, commentBody, anchorQuote });
        return {
          HandledByServer: true,
          Success: false,
          ErrorMessage: 'Server agent run failed',
        };
      },
    );

    const notifications: string[] = [];
    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
        {
          provide: MJNotificationService,
          useValue: {
            CreateSimpleNotification: (msg: string) => notifications.push(msg),
          },
        },
      ],
    });

    const viewer = runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());
    const initialMarkdown =
      '# Executive Summary\n\nThis paragraph is over one hundred and twenty characters long so we can verify OpenAnchorCommentForSegment never slices RawMarkdown when no text is selected.';
    viewer.OnMarkdownChanged(initialMarkdown, true);
    const firstSeg = viewer.DocumentSegments[0];
    expect(firstSeg).toBeDefined();

    // 1. OpenAnchorCommentForSegment without selection -> SelectedAnchorQuote is empty (not sliced RawMarkdown)
    viewer.OpenAnchorCommentForSegment(firstSeg);
    expect(viewer.SelectedAnchorQuote).toBe('');

    // Explicit user selection -> exact selected quote is preserved
    viewer.OpenAnchorCommentForSegment(firstSeg, 'Executive Summary');
    expect(viewer.SelectedAnchorQuote).toBe('Executive Summary');

    // Attach persisted artifact version + mock persistence hook so server @mention path is exercised
    const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
    Object.defineProperties(ver, {
      ID: { value: '11111111-1111-4111-8111-111111111111', enumerable: true },
      ArtifactID: { value: '22222222-2222-4222-8222-222222222222', enumerable: true },
      VersionNumber: { value: 1, enumerable: true },
      Content: { value: initialMarkdown, enumerable: true },
    });
    viewer.artifactVersion = ver;
    Reflect.set(viewer, 'persistAnchoredThreadToServer', async () => true);

    // 2. Email addresses in comments NEVER trigger @mention dispatch
    viewer.SelectedAnchorQuote = '';
    viewer.NewCommentAgentMode = 'edit';
    viewer.NewCommentText = 'Please loop in alice@example.com and foo.bar@baz.co for review.';
    await viewer.PostAnchoredComment();
    expect(dispatchCalls).toHaveLength(0);
    expect(viewer.AnchoredThreads[0].Messages[0].Mentions).toEqual([]);
    expect(viewer.MarkdownContent).toBe(initialMarkdown);

    // 3. Real @DocsAgent mention when server returns Success=false does NOT append fake Role:'Agent' or mutate markdown
    viewer.SelectedAnchorQuote = '';
    viewer.NewCommentAgentMode = 'edit';
    viewer.NewCommentText = 'Hey @DocsAgent tighten the executive summary.';
    await viewer.PostAnchoredComment();

    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0].agentHandle).toBe('DocsAgent');
    expect(dispatchCalls[0].anchorQuote).toBeUndefined();
    expect(viewer.AnchoredThreads[0].Messages).toHaveLength(1);
    expect(viewer.AnchoredThreads[0].Messages[0].Role).toBe('User');
    expect(viewer.MarkdownContent).toBe(initialMarkdown);
    expect(notifications).toContain('Server agent run failed');
    viewer.ngOnDestroy();
  });

  it('SpreadsheetArtifactViewerComponent (C2): routes ConfirmFreezeLiveTable through server FreezeLiveBlock and passes preSignedSnapshot as 7th argument', async () => {
    const collabService = new DocumentCollaborationService();
    const signedSnapshot: FrozenBlockSnapshot = {
      FrozenAt: '2026-11-10T20:00:00.000Z',
      FrozenByUserID: '33333333-3333-4333-8333-333333333333',
      FrozenByUserName: 'Dana Analyst',
      Columns: [{ Name: 'Name', DisplayName: 'Name' }],
      Rows: [{ Name: 'Governed Row 1' }],
      TotalRowCount: 1,
      SecurityWarningAcknowledged: true,
      SnapshotContentHash: 'hmac-v1:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    };

    const freezeSpy = vi
      .spyOn(collabService, 'FreezeLiveBlock')
      .mockImplementation(async (block: DocumentBlockSpec) => {
        const updatedSpec: DocumentBlockSpec = {
          ...block,
          Mode: 'Frozen',
          FrozenSnapshot: signedSnapshot,
        };
        return {
          HandledByServer: true,
          Success: true,
          UpdatedSpec: updatedSpec,
        };
      });
    vi.spyOn(collabService, 'IsFrozenSnapshotVerified').mockReturnValue(true);

    const engineFreezeSpy = vi.spyOn(SpreadsheetEngine.Instance, 'FreezeLiveTable');

    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: ArtifactFileService, useValue: null },
        { provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } },
      ],
    });

    const sheetViewer = runInInjectionContext(injector, () => new SpreadsheetArtifactViewerComponent());
    const mockUser = Object.create(null) as UserInfo;
    Object.assign(mockUser, {
      ID: '33333333-3333-4333-8333-333333333333',
      Name: 'Dana Analyst',
      Email: 'dana@example.com',
    });
    const mockProvider = Object.create(null) as IMetadataProvider;
    Object.assign(mockProvider, {
      CurrentUser: mockUser,
      Entities: [],
      EntityByName: (name: string) =>
        name === 'MJ: Artifacts' ? { ID: 'artifacts-entity-id', Name: 'MJ: Artifacts' } : undefined,
    });
    sheetViewer.Provider = mockProvider;

    const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
    Object.defineProperties(ver, {
      ID: { value: '44444444-4444-4444-8444-444444444444', enumerable: true },
      ArtifactID: { value: '55555555-5555-4555-8555-555555555555', enumerable: true },
      VersionNumber: { value: 1, enumerable: true },
    });
    sheetViewer.artifactVersion = ver;

    const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Governed Sheet');
    const liveTable = {
      TableID: 'tbl-live-1',
      Title: 'Active Accounts',
      SourceType: 'EntityView' as const,
      EntityName: 'Accounts',
      ExtraFilter: "Status = 'Active'",
      MaxRows: 50,
      AnchorCell: 'A1',
      Mode: 'Live' as const,
    };
    wb.Worksheets[0].LiveTables.push(liveTable);
    sheetViewer.Workbook = wb;

    sheetViewer.PromptFreezeLiveTable(wb.Worksheets[0].LiveTables[0]);
    sheetViewer.FreezeConfirmedChecked = true;
    await sheetViewer.ConfirmFreezeLiveTable();

    expect(freezeSpy).toHaveBeenCalledTimes(1);
    expect(freezeSpy.mock.calls[0][0]).toMatchObject({
      BlockID: 'tbl-live-1',
      Kind: 'EntityView',
      DisplayMode: 'table',
      Mode: 'Live',
      EntityName: 'Accounts',
      ExtraFilter: "Status = 'Active'",
      MaxRows: 50,
    });
    expect(freezeSpy.mock.calls[0][1]).toBe(true);
    expect(freezeSpy.mock.calls[0][2]).toBe('55555555-5555-4555-8555-555555555555');

    expect(engineFreezeSpy).toHaveBeenCalledTimes(1);
    expect(engineFreezeSpy.mock.calls[0][6]).toEqual(signedSnapshot);
    expect(wb.Worksheets[0].LiveTables[0].Mode).toBe('Frozen');
    expect(wb.Worksheets[0].LiveTables[0].FrozenSnapshot).toEqual(signedSnapshot);
    expect(sheetViewer.IsLiveTableSnapshotVerified(wb.Worksheets[0].LiveTables[0])).toBe(true);

    engineFreezeSpy.mockRestore();
    sheetViewer.ngOnDestroy();
  });

  it('R5-6 (Suggest mode): splices ProposedReplacement in place of anchorQuote inside a multi-sentence paragraph and preserves surrounding sentences on AcceptSuggestion', async () => {
    const collabService = new DocumentCollaborationService();
    vi.spyOn(collabService, 'DispatchAnchoredCommentAgentMention').mockResolvedValue({
      HandledByServer: true,
      Success: true,
      ReplyBody: 'Refined the middle phrase.',
      UpdatedContent: 'Improved phrase.',
    });

    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
        { provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } },
      ],
    });

    const viewer = runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());
    viewer.HasEditPermission = true;
    const paragraph = 'First sentence. Target phrase here. Third sentence.';
    viewer.OnMarkdownChanged(paragraph, true);

    const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
    Object.defineProperties(ver, {
      ID: { value: '11111111-1111-4111-8111-111111111112', enumerable: true },
      ArtifactID: { value: '22222222-2222-4222-8222-222222222223', enumerable: true },
      VersionNumber: { value: 1, enumerable: true },
      Content: { value: paragraph, enumerable: true },
    });
    viewer.artifactVersion = ver;
    Reflect.set(viewer, 'persistAnchoredThreadToServer', async () => true);

    const seg = viewer.DocumentSegments[0];
    viewer.OpenAnchorCommentForSegment(seg, 'Target phrase here.');
    expect(viewer.SelectedAnchorQuote).toBe('Target phrase here.');

    viewer.NewCommentAgentMode = 'suggest';
    viewer.NewCommentText = '@DocsAgent improve this phrase';
    await viewer.PostAnchoredComment();

    expect(viewer.Suggestions).toHaveLength(1);
    expect(viewer.Suggestions[0].OriginalMarkdown).toBe(
      'First sentence. Target phrase here. Third sentence.',
    );
    expect(viewer.Suggestions[0].ProposedMarkdown).toBe(
      'First sentence. Improved phrase. Third sentence.',
    );

    viewer.AcceptSuggestion(viewer.Suggestions[0]);
    expect(viewer.MarkdownContent).toBe('First sentence. Improved phrase. Third sentence.');
    viewer.ngOnDestroy();
  });

  it('R5-6 (Edit mode): does not clobber concurrent local edits in Y.Text / MarkdownContent on live WebSocket sessions and merges concurrent edits on non-WS sessions', async () => {
    const originalWebSocket = globalThis.WebSocket;
    class LiveFakeWebSocket {
      public static readonly CONNECTING = 0;
      public static readonly OPEN = 1;
      public static readonly CLOSING = 2;
      public static readonly CLOSED = 3;
      public static instances: LiveFakeWebSocket[] = [];

      public url: string;
      public readyState = LiveFakeWebSocket.CONNECTING;
      public binaryType = 'blob';
      public sentFrames: Uint8Array[] = [];
      public onopen: (() => void) | null = null;
      public onmessage: ((evt: MessageEvent) => void) | null = null;
      public onclose: ((evt: CloseEvent) => void) | null = null;
      public onerror: (() => void) | null = null;

      constructor(url: string) {
        this.url = url;
        LiveFakeWebSocket.instances.push(this);
      }

      public send(data: Uint8Array): void {
        this.sentFrames.push(data);
      }

      public close(): void {
        this.readyState = LiveFakeWebSocket.CLOSED;
      }
    }

    Reflect.set(globalThis, 'WebSocket', LiveFakeWebSocket);
    try {
      const collabService = new DocumentCollaborationService();
      let resolveMention: (val: {
        HandledByServer: boolean;
        Success: boolean;
        ReplyBody: string;
        UpdatedContent: string;
        VersionNumber: number;
      }) => void = () => {};
      vi.spyOn(collabService, 'DispatchAnchoredCommentAgentMention').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveMention = resolve;
          }),
      );

      const injector = Injector.create({
        providers: [
          { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
          { provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } },
        ],
      });

      const viewer = runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());
      const initialDoc = 'First sentence. Target phrase here. Third sentence.';
      const mockUser = Object.create(null) as UserInfo;
      Object.assign(mockUser, { ID: 'u-editor-1', Name: 'Alice Editor', Email: 'alice@example.com' });
      const wsProvider = Object.create(null) as IMetadataProvider;
      Object.assign(wsProvider, {
        CurrentUser: mockUser,
        Entities: [],
        EntityByName: (name: string) =>
          name === 'MJ: Artifacts' ? { ID: 'artifacts-entity-id', Name: 'MJ: Artifacts' } : undefined,
        ConfigData: { URL: 'http://localhost:4000/graphql' },
        ExecuteGQL: async () => ({
          MintArtifactCollaborationTicket: {
            Success: true,
            Ticket: 'tkt_live_edit_1',
            WsPath: '/collaboration/yjs',
            CanRead: true,
            CanEdit: true,
          },
        }),
      });
      viewer.Provider = wsProvider;
      viewer.readonly = false;
      viewer.HasEditPermission = true;
      viewer.ViewMode = 'edit';
      viewer.OnMarkdownChanged(initialDoc, true);

      const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
      Object.defineProperties(ver, {
        ID: { value: '66666666-6666-4666-8666-666666666661', enumerable: true },
        ArtifactID: { value: '77777777-7777-4777-8777-777777777771', enumerable: true },
        VersionNumber: { value: 1, enumerable: true },
        Content: { value: initialDoc, enumerable: true },
      });
      viewer.artifactVersion = ver;
      Reflect.set(viewer, 'persistAnchoredThreadToServer', async () => true);
      Reflect.apply(
        Reflect.get(viewer, 'setupCollaborationSession') as () => void,
        viewer,
        [],
      );

      // Flush async ticket resolution so WebSocket opens and completes SyncStep2
      await new Promise((r) => setTimeout(r, 0));
      expect(viewer.CollaborationSession?.Transport).toBe('websocket');
      expect(LiveFakeWebSocket.instances).toHaveLength(1);
      const ws = LiveFakeWebSocket.instances[0];
      ws.readyState = LiveFakeWebSocket.OPEN;
      ws.onopen?.();

      const serverDoc = new Y.Doc();
      serverDoc.getText('content').insert(0, initialDoc);
      const step2Enc = encoding.createEncoder();
      encoding.writeVarUint(step2Enc, 0);
      syncProtocol.writeSyncStep2(step2Enc, serverDoc);
      ws.onmessage?.({ data: encoding.toUint8Array(step2Enc).buffer } as MessageEvent);
      expect(viewer.CollaborationSession?.HasCompletedInitialSync).toBe(true);

      // Start @mention in edit mode
      viewer.OpenAnchorCommentForSegment(viewer.DocumentSegments[0], 'Target phrase here.');
      viewer.NewCommentAgentMode = 'edit';
      viewer.NewCommentText = '@DocsAgent improve phrase';
      const mentionPromise = viewer.PostAnchoredComment();
      await new Promise((r) => setTimeout(r, 0));

      // User types a concurrent edit locally BEFORE the HTTP @mention resolves!
      const withConcurrentUserTyping =
        'First sentence. Target phrase here. Third sentence. User typed concurrently!';
      viewer.OnMarkdownChanged(withConcurrentUserTyping, false);
      expect(viewer.CollaborationSession?.YDoc.getText('content').toString()).toBe(
        withConcurrentUserTyping,
      );

      // Propagate client's concurrent Yjs update to serverDoc (as happens over the live WS)
      const clientFrame = ws.sentFrames[ws.sentFrames.length - 1];
      const clientDec = decoding.createDecoder(clientFrame);
      decoding.readVarUint(clientDec);
      const replyEnc = encoding.createEncoder();
      syncProtocol.readSyncMessage(clientDec, replyEnc, serverDoc, 'client');

      const onMdSpy = vi.spyOn(viewer, 'OnMarkdownChanged');

      // Now HTTP @mention resolves with server's snapshot (which did NOT yet contain or could differ from client snapshot)
      resolveMention?.({
        HandledByServer: true,
        Success: true,
        ReplyBody: 'Updated target phrase.',
        UpdatedContent: 'First sentence. Improved phrase. Third sentence.',
        VersionNumber: 2,
      });
      await mentionPromise;

      // Crucial assertion: HTTP resolution MUST NOT call OnMarkdownChanged(..., true) to overwrite concurrent local typing!
      expect(onMdSpy).not.toHaveBeenCalled();
      expect(viewer.MarkdownContent).toBe(withConcurrentUserTyping);
      expect(viewer.CollaborationSession?.YDoc.getText('content').toString()).toBe(
        withConcurrentUserTyping,
      );

      // When server broadcasts its Yjs surgical delta (replacing 'Target phrase here.' -> 'Improved phrase.'),
      // both edits merge cleanly without losing the user's concurrent typing!
      let serverDelta: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
      serverDoc.on('update', (u: Uint8Array) => {
        serverDelta = u;
      });
      const yText = serverDoc.getText('content');
      const targetIdx = yText.toString().indexOf('Target phrase here.');
      serverDoc.transact(() => {
        yText.delete(targetIdx, 'Target phrase here.'.length);
        yText.insert(targetIdx, 'Improved phrase.');
      }, 'server-mention');

      const updateFrameEnc = encoding.createEncoder();
      encoding.writeVarUint(updateFrameEnc, 0);
      syncProtocol.writeUpdate(updateFrameEnc, serverDelta);
      ws.onmessage?.({ data: encoding.toUint8Array(updateFrameEnc).buffer } as MessageEvent);

      expect(viewer.MarkdownContent).toBe(
        'First sentence. Improved phrase. Third sentence. User typed concurrently!',
      );
      viewer.ngOnDestroy();

      // Also verify non-WebSocket (local-only) concurrent edit merges instead of blindly overwriting
      const localViewer = runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());
      let resolveLocalMention: (val: {
        HandledByServer: boolean;
        Success: boolean;
        ReplyBody: string;
        UpdatedContent: string;
      }) => void = () => {};
      vi.spyOn(collabService, 'DispatchAnchoredCommentAgentMention').mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLocalMention = resolve;
          }),
      );
      localViewer.readonly = false;
      localViewer.HasEditPermission = true;
      localViewer.ViewMode = 'edit';
      localViewer.OnMarkdownChanged(initialDoc, true);
      localViewer.artifactVersion = ver;
      Reflect.set(localViewer, 'persistAnchoredThreadToServer', async () => true);

      localViewer.OpenAnchorCommentForSegment(localViewer.DocumentSegments[0], 'Target phrase here.');
      localViewer.NewCommentAgentMode = 'edit';
      localViewer.NewCommentText = '@DocsAgent improve phrase';
      const localPromise = localViewer.PostAnchoredComment();
      await new Promise((r) => setTimeout(r, 0));

      // Concurrent edit while non-WS HTTP mention is in flight
      localViewer.OnMarkdownChanged(
        'First sentence. Target phrase here. Third sentence. Local note added.',
        false,
      );
      resolveLocalMention?.({
        HandledByServer: true,
        Success: true,
        ReplyBody: 'Applied replacement.',
        UpdatedContent: 'First sentence. Improved phrase. Third sentence.',
      });
      await localPromise;

      expect(localViewer.MarkdownContent).toBe(
        'First sentence. Improved phrase. Third sentence. Local note added.',
      );
      localViewer.ngOnDestroy();
    } finally {
      Reflect.set(globalThis, 'WebSocket', originalWebSocket);
    }
  });

  it('R5-7 & R6-8 (Viewers): sets LiveSyncUnavailable === true across Markdown, SlideDeck, and Spreadsheet viewers strictly when collaboration secret is unconfigured', async () => {
    const scenarios: Array<{
      name: string;
      executeGql: (query: string) => Promise<Record<string, object | undefined>>;
    }> = [
      {
        name: 'missing HMAC secret throw',
        executeGql: async (query: string) => {
          if (query.includes('ResolveArtifactPermissions')) {
            return {
              ResolveArtifactPermissions: {
                ArtifactID: '88888888-8888-4888-8888-888888888888',
                CanRead: true,
                CanEdit: true,
                CanDelete: false,
                CanShare: false,
                Source: 'Owner',
              },
            };
          }
          throw new Error('MJ_ARTIFACT_COLLAB_HMAC_SECRET is not configured');
        },
      },
      {
        name: 'Success=false with explicit signing secret unconfigured payload',
        executeGql: async (query: string) => {
          if (query.includes('ResolveArtifactPermissions')) {
            return {
              ResolveArtifactPermissions: {
                ArtifactID: '88888888-8888-4888-8888-888888888888',
                CanRead: true,
                CanEdit: true,
                CanDelete: false,
                CanShare: false,
                Source: 'Owner',
              },
            };
          }
          return {
            MintArtifactCollaborationTicket: {
              Success: false,
              CanRead: true,
              CanEdit: true,
              ErrorMessage:
                'Collaboration ticket signing secret (MJ_ARTIFACT_COLLAB_HMAC_SECRET, >= 32 bytes) must be configured before issuing WebSocket collaboration tickets.',
            },
          };
        },
      },
    ];

    for (const scenario of scenarios) {
      const collabService = new DocumentCollaborationService();
      const detectChangesSpy = vi.fn();
      const injector = Injector.create({
        providers: [
          {
            provide: ChangeDetectorRef,
            useValue: { markForCheck: () => {}, detectChanges: detectChangesSpy },
          },
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
          { provide: SlideDeckExportService, useValue: new SlideDeckExportService() },
          { provide: ArtifactFileService, useValue: null },
          { provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } },
        ],
      });

      const mockUser = Object.create(null) as UserInfo;
      Object.assign(mockUser, {
        ID: '99999999-9999-4999-8999-999999999999',
        Name: 'Alice',
        Email: 'alice@example.com',
      });
      const provider = Object.create(null) as IMetadataProvider;
      Object.assign(provider, {
        CurrentUser: mockUser,
        Entities: [],
        EntityByName: (name: string) =>
          name === 'MJ: Artifacts' ? { ID: 'artifacts-entity-id', Name: 'MJ: Artifacts' } : undefined,
        RunView: async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0 }),
        ConfigData: { URL: 'https://example.com/graphql' },
        ExecuteGQL: scenario.executeGql,
      });

      // 1. MarkdownArtifactViewerComponent
      const mdViewer = runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());
      mdViewer.Provider = provider;
      mdViewer.readonly = false;
      mdViewer.HasEditPermission = true;
      const mdVer = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
      Object.defineProperties(mdVer, {
        ID: { value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', enumerable: true },
        ArtifactID: { value: '88888888-8888-4888-8888-888888888888', enumerable: true },
        VersionNumber: { value: 1, enumerable: true },
        Content: { value: '# Live Sync Check', enumerable: true },
      });
      mdViewer.artifactVersion = mdVer;
      Reflect.apply(
        Reflect.get(mdViewer, 'setupCollaborationSession') as () => void,
        mdViewer,
        [],
      );
      await new Promise((r) => setTimeout(r, 0));
      expect(mdViewer.CollaborationSession?.LiveSyncUnavailable, scenario.name).toBe(true);
      expect(mdViewer.CollaborationSession?.HasPendingReconnect, scenario.name).toBe(false);
      expect(mdViewer.LiveSyncUnavailable, scenario.name).toBe(true);
      expect(mdViewer.CanUserEdit, scenario.name).toBe(false);
      mdViewer.ngOnDestroy();

      // 2. SlideDeckArtifactViewerComponent
      const deckViewer = runInInjectionContext(
        injector,
        () => new SlideDeckArtifactViewerComponent(),
      );
      deckViewer.Provider = provider;
      deckViewer.readonly = false;
      const deckJson = SlideDeckEngine.Instance.SerializeDeckSpec(
        SlideDeckEngine.Instance.CreateDefaultDeck('Sync Banner Deck'),
      );
      Reflect.apply(
        Reflect.get(deckViewer, 'setupCollaborationSession') as (
          id: string,
          content: string,
        ) => void,
        deckViewer,
        ['88888888-8888-4888-8888-888888888888', deckJson],
      );
      await new Promise((r) => setTimeout(r, 0));
      expect(deckViewer.CollaborationSession?.LiveSyncUnavailable, scenario.name).toBe(true);
      expect(deckViewer.CollaborationSession?.HasPendingReconnect, scenario.name).toBe(false);
      expect(deckViewer.LiveSyncUnavailable, scenario.name).toBe(true);
      expect(deckViewer.IsEditable, scenario.name).toBe(false);
      deckViewer.ngOnDestroy();

      // 3. SpreadsheetArtifactViewerComponent
      const sheetViewer = runInInjectionContext(
        injector,
        () => new SpreadsheetArtifactViewerComponent(),
      );
      sheetViewer.Provider = provider;
      sheetViewer.readonly = false;
      const wbVer = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
      Object.defineProperties(wbVer, {
        ID: { value: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', enumerable: true },
        ArtifactID: { value: '88888888-8888-4888-8888-888888888888', enumerable: true },
        VersionNumber: { value: 1, enumerable: true },
        Name: { value: 'Sync Banner Sheet', enumerable: true },
        Configuration: { value: null, enumerable: true },
        ContentMode: { value: 'Inline', enumerable: true },
        Content: {
          value: SpreadsheetEngine.Instance.SerializeWorkbook(
            SpreadsheetEngine.Instance.CreateEmptyWorkbook('Sync Banner Sheet'),
          ),
          enumerable: true,
        },
      });
      sheetViewer.artifactVersion = wbVer;
      await (
        Reflect.get(sheetViewer, 'initializeWorkbookSession') as () => Promise<void>
      ).call(sheetViewer);
      await new Promise((r) => setTimeout(r, 0));
      expect(sheetViewer.CollaborationSession?.LiveSyncUnavailable, scenario.name).toBe(true);
      expect(sheetViewer.CollaborationSession?.HasPendingReconnect, scenario.name).toBe(false);
      expect(sheetViewer.LiveSyncUnavailable, scenario.name).toBe(true);
      expect(sheetViewer.CanEdit, scenario.name).toBe(false);
      expect(detectChangesSpy).toHaveBeenCalled();
      sheetViewer.ngOnDestroy();
    }
  });

  it('R6-8 (Viewers): transient ticket mint failures (Failed to fetch, 503, Internal server error) keep LiveSyncUnavailable === false across all 3 viewers and recover editability on next backoff retry', async () => {
    vi.useFakeTimers();
    const originalWebSocket = Reflect.get(globalThis, 'WebSocket');

    class FakeRecoverableSocket {
      public static readonly CONNECTING = 0;
      public static readonly OPEN = 1;
      public static readonly CLOSING = 2;
      public static readonly CLOSED = 3;

      public static instances: FakeRecoverableSocket[] = [];
      public readonly url: string;
      public readyState = FakeRecoverableSocket.CONNECTING;
      public binaryType = 'blob';
      public onopen: (() => void) | null = null;
      public onmessage: ((evt: MessageEvent) => void) | null = null;
      public onclose: ((evt: CloseEvent) => void) | null = null;
      public onerror: (() => void) | null = null;

      constructor(url: string) {
        this.url = url;
        FakeRecoverableSocket.instances.push(this);
      }

      public send(_data: Uint8Array): void {
        // no-op
      }

      public close(): void {
        this.readyState = FakeRecoverableSocket.CLOSED;
      }
    }

    Reflect.set(globalThis, 'WebSocket', FakeRecoverableSocket);

    const deliverInitialSyncFrame = (sock: FakeRecoverableSocket, content: string): void => {
      sock.readyState = FakeRecoverableSocket.OPEN;
      sock.onopen?.();
      const serverDoc = new Y.Doc();
      serverDoc.getText('content').insert(0, content);
      const step2Encoder = encoding.createEncoder();
      encoding.writeVarUint(step2Encoder, 0);
      syncProtocol.writeSyncStep2(step2Encoder, serverDoc);
      sock.onmessage?.({ data: encoding.toUint8Array(step2Encoder).buffer } as MessageEvent);
    };

    try {
      const transientFailures: Array<{
        name: string;
        failTicket: () => Promise<Record<string, object>>;
      }> = [
        {
          name: 'Failed to fetch',
          failTicket: async () => {
            throw new TypeError('Failed to fetch');
          },
        },
        {
          name: '503 Service Unavailable',
          failTicket: async () => {
            throw new Error('503 Service Unavailable');
          },
        },
        {
          name: 'Internal server error payload',
          failTicket: async () => ({
            MintArtifactCollaborationTicket: {
              Success: false,
              ErrorMessage: 'Internal server error',
            },
          }),
        },
      ];

      for (const scenario of transientFailures) {
        const collabService = new DocumentCollaborationService();
        const injector = Injector.create({
          providers: [
            {
              provide: ChangeDetectorRef,
              useValue: { markForCheck: () => {}, detectChanges: () => {} },
            },
            { provide: DocumentCollaborationService, useValue: collabService },
            { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
            { provide: SlideDeckExportService, useValue: new SlideDeckExportService() },
            { provide: ArtifactFileService, useValue: null },
            { provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } },
          ],
        });

        const mockUser = Object.create(null) as UserInfo;
        Object.assign(mockUser, {
          ID: '99999999-9999-4999-8999-999999999999',
          Name: 'Alice',
          Email: 'alice@example.com',
        });

        const makeRecoveringProvider = (): IMetadataProvider => {
          let mintAttempts = 0;
          const prov = Object.create(null) as IMetadataProvider;
          return Object.assign(prov, {
            CurrentUser: mockUser,
            Entities: [],
            EntityByName: (name: string) =>
              name === 'MJ: Artifacts' ? { ID: 'artifacts-entity-id', Name: 'MJ: Artifacts' } : undefined,
            RunView: async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0 }),
            ConfigData: { URL: 'https://example.com/graphql' },
            ExecuteGQL: async (query: string) => {
              if (query.includes('ResolveArtifactPermissions')) {
                return {
                  ResolveArtifactPermissions: {
                    ArtifactID: '88888888-8888-4888-8888-888888888888',
                    CanRead: true,
                    CanEdit: true,
                    CanDelete: false,
                    CanShare: false,
                    Source: 'Owner',
                  },
                };
              }
              mintAttempts++;
              if (mintAttempts === 1) {
                return scenario.failTicket();
              }
              return {
                MintArtifactCollaborationTicket: {
                  Success: true,
                  Ticket: `tkt-ok-${mintAttempts}`,
                  WsPath: '/collaboration/yjs',
                  CanRead: true,
                  CanEdit: true,
                },
              };
            },
          });
        };

        // 1. MarkdownArtifactViewerComponent
        FakeRecoverableSocket.instances = [];
        const mdViewer = runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());
        mdViewer.Provider = makeRecoveringProvider();
        mdViewer.readonly = false;
        const mdVer = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
        Object.defineProperties(mdVer, {
          ID: { value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', enumerable: true },
          ArtifactID: { value: '88888888-8888-4888-8888-888888888888', enumerable: true },
          VersionNumber: { value: 1, enumerable: true },
          Content: { value: '# Resilient Markdown', enumerable: true },
        });
        mdViewer.artifactVersion = mdVer;
        mdViewer.ngOnInit();
        await vi.advanceTimersByTimeAsync(0);

        expect(mdViewer.LiveSyncUnavailable, `md/${scenario.name}`).toBe(false);
        expect(mdViewer.CollaborationSession?.HasPendingReconnect, `md/${scenario.name}`).toBe(true);
        expect(mdViewer.HasEditPermission, `md/${scenario.name}`).toBe(true);

        await vi.advanceTimersByTimeAsync(1500);
        expect(FakeRecoverableSocket.instances, `md/${scenario.name}`).toHaveLength(1);
        deliverInitialSyncFrame(FakeRecoverableSocket.instances[0], '# Resilient Markdown');
        expect(mdViewer.LiveSyncUnavailable, `md/${scenario.name}`).toBe(false);
        expect(mdViewer.CollaborationSession?.LiveSyncErrorReason, `md/${scenario.name}`).toBe('');
        expect(mdViewer.CanUserEdit, `md/${scenario.name}`).toBe(true);
        mdViewer.ngOnDestroy();

        // 2. SlideDeckArtifactViewerComponent
        FakeRecoverableSocket.instances = [];
        const deckViewer = runInInjectionContext(
          injector,
          () => new SlideDeckArtifactViewerComponent(),
        );
        deckViewer.Provider = makeRecoveringProvider();
        deckViewer.readonly = false;
        const deckJson = SlideDeckEngine.Instance.SerializeDeckSpec(
          SlideDeckEngine.Instance.CreateDefaultDeck('Resilient Deck'),
        );
        const deckVer = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
        Object.defineProperties(deckVer, {
          ID: { value: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', enumerable: true },
          ArtifactID: { value: '88888888-8888-4888-8888-888888888888', enumerable: true },
          VersionNumber: { value: 1, enumerable: true },
          Name: { value: 'Resilient Deck', enumerable: true },
          Content: { value: deckJson, enumerable: true },
        });
        deckViewer.artifactVersion = deckVer;
        deckViewer.ngOnInit();
        await vi.advanceTimersByTimeAsync(0);

        expect(deckViewer.LiveSyncUnavailable, `deck/${scenario.name}`).toBe(false);
        expect(deckViewer.CollaborationSession?.HasPendingReconnect, `deck/${scenario.name}`).toBe(true);

        await vi.advanceTimersByTimeAsync(1500);
        expect(FakeRecoverableSocket.instances, `deck/${scenario.name}`).toHaveLength(1);
        deliverInitialSyncFrame(FakeRecoverableSocket.instances[0], deckJson);
        expect(deckViewer.LiveSyncUnavailable, `deck/${scenario.name}`).toBe(false);
        expect(deckViewer.CollaborationSession?.LiveSyncErrorReason, `deck/${scenario.name}`).toBe('');
        expect(deckViewer.IsEditable, `deck/${scenario.name}`).toBe(true);
        deckViewer.ngOnDestroy();

        // 3. SpreadsheetArtifactViewerComponent
        FakeRecoverableSocket.instances = [];
        const sheetViewer = runInInjectionContext(
          injector,
          () => new SpreadsheetArtifactViewerComponent(),
        );
        sheetViewer.Provider = makeRecoveringProvider();
        sheetViewer.readonly = false;
        const wbJson = SpreadsheetEngine.Instance.SerializeWorkbook(
          SpreadsheetEngine.Instance.CreateEmptyWorkbook('Resilient Sheet'),
        );
        const wbVer = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
        Object.defineProperties(wbVer, {
          ID: { value: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', enumerable: true },
          ArtifactID: { value: '88888888-8888-4888-8888-888888888888', enumerable: true },
          VersionNumber: { value: 1, enumerable: true },
          Name: { value: 'Resilient Sheet', enumerable: true },
          Configuration: { value: null, enumerable: true },
          ContentMode: { value: 'Inline', enumerable: true },
          Content: { value: wbJson, enumerable: true },
        });
        sheetViewer.artifactVersion = wbVer;
        await (
          Reflect.get(sheetViewer, 'initializeWorkbookSession') as () => Promise<void>
        ).call(sheetViewer);
        await vi.advanceTimersByTimeAsync(0);

        expect(sheetViewer.LiveSyncUnavailable, `sheet/${scenario.name}`).toBe(false);
        expect(sheetViewer.CollaborationSession?.HasPendingReconnect, `sheet/${scenario.name}`).toBe(true);

        await vi.advanceTimersByTimeAsync(1500);
        expect(FakeRecoverableSocket.instances, `sheet/${scenario.name}`).toHaveLength(1);
        deliverInitialSyncFrame(FakeRecoverableSocket.instances[0], wbJson);
        expect(sheetViewer.LiveSyncUnavailable, `sheet/${scenario.name}`).toBe(false);
        expect(sheetViewer.CollaborationSession?.LiveSyncErrorReason, `sheet/${scenario.name}`).toBe('');
        expect(sheetViewer.CanEdit, `sheet/${scenario.name}`).toBe(true);
        sheetViewer.ngOnDestroy();
      }
    } finally {
      Reflect.set(globalThis, 'WebSocket', originalWebSocket);
      vi.useRealTimers();
    }
  });

  it('R7: ErrorCode COLLAB_SECRET_UNCONFIGURED sets LiveSyncUnavailable === true even with generic ErrorMessage, while unrelated "ticket ... not configured" errors keep LiveSyncUnavailable === false', async () => {
    const collabService = new DocumentCollaborationService();

    // 1. Structured ErrorCode === 'COLLAB_SECRET_UNCONFIGURED' with generic ErrorMessage -> LiveSyncUnavailable === true
    const structuredUnconfiguredProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => ({
        MintArtifactCollaborationTicket: {
          Success: false,
          CanRead: true,
          CanEdit: true,
          ErrorCode: COLLAB_SECRET_UNCONFIGURED_CODE,
          ErrorMessage: 'Live collaboration disabled',
        },
      }),
    });

    const unconfiguredSession = collabService.CreateSession(
      'art-structured-secret-code',
      '# Quarterly Plan',
      { id: 'u1', name: 'Alice' },
      true,
      true,
    );
    await unconfiguredSession.Connect(null, structuredUnconfiguredProvider);
    expect(unconfiguredSession.LiveSyncUnavailable).toBe(true);
    expect(unconfiguredSession.HasPendingReconnect).toBe(false);
    expect(unconfiguredSession.Status).toBe('readonly');
    expect(unconfiguredSession.CanMutateDocument).toBe(false);
    unconfiguredSession.Destroy();

    // 2. Unrelated error mentioning "ticket ... not configured" (no ErrorCode) -> LiveSyncUnavailable === false
    const jiraTicketUnconfiguredProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => ({
        MintArtifactCollaborationTicket: {
          Success: false,
          CanRead: true,
          CanEdit: true,
          ErrorMessage: 'Jira ticket integration is not configured',
        },
      }),
    });

    const jiraErrorSession = collabService.CreateSession(
      'art-jira-ticket-msg',
      '# Quarterly Plan',
      { id: 'u1', name: 'Alice' },
      true,
      true,
    );
    await jiraErrorSession.Connect(null, jiraTicketUnconfiguredProvider);
    expect(jiraErrorSession.LiveSyncUnavailable).toBe(false);
    expect(jiraErrorSession.CanEdit).toBe(true);
    expect(jiraErrorSession.Status).toBe('local');
    expect(jiraErrorSession.HasPendingReconnect).toBe(true);
    jiraErrorSession.Destroy();

    // 3. Thrown unrelated error mentioning "ticket ... not configured" -> LiveSyncUnavailable === false
    const thrownSupportTicketProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => {
        throw new Error('Support ticket webhook is not configured');
      },
    });

    const thrownTicketSession = collabService.CreateSession(
      'art-thrown-support-ticket',
      '# Quarterly Plan',
      { id: 'u1', name: 'Alice' },
      true,
      true,
    );
    await thrownTicketSession.Connect(null, thrownSupportTicketProvider);
    expect(thrownTicketSession.LiveSyncUnavailable).toBe(false);
    expect(thrownTicketSession.HasPendingReconnect).toBe(true);
    thrownTicketSession.Destroy();
  });

  it('R7: caps automatic reconnects at MAX_RECONNECT_ATTEMPTS with zero infinite retry loop, keeps LiveSyncUnavailable === false, and recovers on explicit Retry()', async () => {
    vi.useFakeTimers();
    const originalWebSocket = Reflect.get(globalThis, 'WebSocket');

    class BoundedRetrySocket {
      public static readonly CONNECTING = 0;
      public static readonly OPEN = 1;
      public static readonly CLOSING = 2;
      public static readonly CLOSED = 3;

      public static instances: BoundedRetrySocket[] = [];
      public readonly url: string;
      public readyState = BoundedRetrySocket.CONNECTING;
      public binaryType = 'blob';
      public onopen: (() => void) | null = null;
      public onmessage: ((evt: MessageEvent) => void) | null = null;
      public onclose: ((evt: CloseEvent) => void) | null = null;
      public onerror: (() => void) | null = null;

      constructor(url: string) {
        this.url = url;
        BoundedRetrySocket.instances.push(this);
      }

      public send(_data: Uint8Array): void {
        // no-op
      }

      public close(): void {
        this.readyState = BoundedRetrySocket.CLOSED;
      }
    }

    Reflect.set(globalThis, 'WebSocket', BoundedRetrySocket);
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    try {
      const collabService = new DocumentCollaborationService();
      let ticketMintCalls = 0;
      let serverHealthy = false;

      const provider = Object.assign(Object.create(null) as IMetadataProvider, {
        ConfigData: { URL: 'https://example.com/graphql' },
        ExecuteGQL: async () => {
          ticketMintCalls++;
          if (!serverHealthy) {
            return {
              MintArtifactCollaborationTicket: {
                Success: false,
                ErrorMessage: '503 Service Temporarily Unavailable',
              },
            };
          }
          return {
            MintArtifactCollaborationTicket: {
              Success: true,
              Ticket: `tkt-recovered-${ticketMintCalls}`,
              WsPath: '/collaboration/yjs',
              CanRead: true,
              CanEdit: true,
            },
          };
        },
      });

      const session = collabService.CreateSession(
        'art-bounded-retry-1',
        '# Bounded Retry Doc',
        { id: 'u1', name: 'Alice' },
        true,
        true,
      );

      // Initial Connect (attempt 0) fails -> schedules retry 1
      await session.Connect(null, provider);
      expect(ticketMintCalls).toBe(1);
      expect(session.HasPendingReconnect).toBe(true);
      expect(session.LiveSyncUnavailable).toBe(false);

      // Step through all MAX_RECONNECT_ATTEMPTS (10) scheduled exponential-backoff retries (capped at 30s)
      const backoffSchedule = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
      for (let i = 1; i <= MAX_RECONNECT_ATTEMPTS; i++) {
        const expectedBackoffMs = backoffSchedule[Math.min(i - 1, backoffSchedule.length - 1)];
        await vi.advanceTimersByTimeAsync(expectedBackoffMs - 1);
        expect(ticketMintCalls).toBe(i);
        await vi.advanceTimersByTimeAsync(1);
        expect(ticketMintCalls).toBe(1 + i);
      }

      // After MAX_RECONNECT_ATTEMPTS consecutive failures, no further timers are scheduled!
      expect(session.ReconnectAttempts).toBe(MAX_RECONNECT_ATTEMPTS);
      expect(session.HasPendingReconnect).toBe(false);
      expect(session.IsReconnectExhausted).toBe(true);
      expect(session.Status).toBe('error');
      expect(session.LiveSyncUnavailable).toBe(false);

      // Advancing time by 10 full minutes produces ZERO extra ticket mint calls (no infinite loop)
      await vi.advanceTimersByTimeAsync(600_000);
      expect(ticketMintCalls).toBe(1 + MAX_RECONNECT_ATTEMPTS);
      expect(session.HasPendingReconnect).toBe(false);

      // Explicit Retry() resets ReconnectAttempts = 0 and reconnects once server recovers
      serverHealthy = true;
      await session.Retry();
      expect(ticketMintCalls).toBe(2 + MAX_RECONNECT_ATTEMPTS);
      expect(BoundedRetrySocket.instances).toHaveLength(1);

      const sock = BoundedRetrySocket.instances[0];
      sock.readyState = BoundedRetrySocket.OPEN;
      sock.onopen?.();
      const serverDoc = new Y.Doc();
      serverDoc.getText('content').insert(0, '# Bounded Retry Doc');
      const step2Enc = encoding.createEncoder();
      encoding.writeVarUint(step2Enc, 0);
      syncProtocol.writeSyncStep2(step2Enc, serverDoc);
      sock.onmessage?.({ data: encoding.toUint8Array(step2Enc).buffer } as MessageEvent);

      expect(session.Status).toBe('connected');
      expect(session.HasCompletedInitialSync).toBe(true);
      expect(session.ReconnectAttempts).toBe(0);
      expect(session.IsReconnectExhausted).toBe(false);
      expect(session.LiveSyncUnavailable).toBe(false);

      session.Destroy();
    } finally {
      randomSpy.mockRestore();
      Reflect.set(globalThis, 'WebSocket', originalWebSocket);
      vi.useRealTimers();
    }
  });

  it('R10-8: RestoreArtifactVersion returns Supported=false on older-MJAPI schema absence and Supported=true on runtime/permission error', async () => {
    const collabService = new DocumentCollaborationService();

    // 1. Older MJAPI GraphQL schema without RestoreArtifactVersion mutation (throws schema error)
    const olderMjapiProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => {
        throw new Error('Cannot query field "RestoreArtifactVersion" on type "Mutation"');
      },
    });

    const schemaRes = await collabService.RestoreArtifactVersion(
      'art-1',
      'ver-1',
      olderMjapiProvider,
    );
    expect(schemaRes.Supported).toBe(false);
    expect(schemaRes.Success).toBe(false);

    // 1b. Schema absence surfaced via returned GraphQL error
    const gqlErrProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => ({
        errors: [{ message: 'Unknown field "RestoreArtifactVersion" on type "Mutation".' }],
      }),
    });

    const gqlErrRes = await collabService.RestoreArtifactVersion(
      'art-1',
      'ver-1',
      gqlErrProvider,
    );
    expect(gqlErrRes.Supported).toBe(false);
    expect(gqlErrRes.Success).toBe(false);

    // 2. Permission / runtime error on modern MJAPI server (returns Supported=true)
    const runtimeErrProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => {
        throw new Error('User does not have permission to restore versions for this artifact.');
      },
    });

    const runtimeRes = await collabService.RestoreArtifactVersion(
      'art-1',
      'ver-1',
      runtimeErrProvider,
    );
    expect(runtimeRes.Supported).toBe(true);
    expect(runtimeRes.Success).toBe(false);
    expect(runtimeRes.ErrorMessage).toContain('permission');

    // 3. Successful restore on modern MJAPI server
    const successProvider = Object.assign(Object.create(null) as IMetadataProvider, {
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async () => ({
        RestoreArtifactVersion: {
          Success: true,
          VersionID: 'ver-restored-9',
          VersionNumber: 9,
        },
      }),
    });

    const successRes = await collabService.RestoreArtifactVersion(
      'art-1',
      'ver-1',
      successProvider,
    );
    expect(successRes.Supported).toBe(true);
    expect(successRes.Success).toBe(true);
    expect(successRes.VersionID).toBe('ver-restored-9');
    expect(successRes.VersionNumber).toBe(9);
  });

  it('R11-7: OnRestoreComparedVersion fallback preserves conversation scope, lightweight fields, and loads full content only for restored version when Load fails', async () => {
    const notifications: Array<{ message: string; type: string }> = [];
    const notificationService = Object.create(MJNotificationService.prototype) as MJNotificationService;
    notificationService.CreateSimpleNotification = (
      message: string,
      style?: 'none' | 'success' | 'error' | 'warning' | 'info',
    ) => {
      notifications.push({ message, type: style ?? 'none' });
    };

    const cdr = Object.create(ChangeDetectorRef.prototype) as ChangeDetectorRef;
    cdr.markForCheck = vi.fn();
    cdr.detectChanges = vi.fn();

    const sanitizer = Object.create(DomSanitizer.prototype) as DomSanitizer;
    sanitizer.sanitize = vi.fn();
    sanitizer.bypassSecurityTrustHtml = (html: string) => html;

    const artifactIconService = Object.create(ArtifactIconService.prototype) as ArtifactIconService;
    artifactIconService.getArtifactIcon = () => 'fa-file';

    const artifactFileService = Object.create(ArtifactFileService.prototype) as ArtifactFileService;

    const collabService = new DocumentCollaborationService();

    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: cdr },
        { provide: MJNotificationService, useValue: notificationService },
        { provide: DomSanitizer, useValue: sanitizer },
        { provide: ArtifactIconService, useValue: artifactIconService },
        { provide: ArtifactFileService, useValue: artifactFileService },
        { provide: DocumentCollaborationService, useValue: collabService },
      ],
    });

    const panel = runInInjectionContext(
      injector,
      () =>
        new ArtifactViewerPanelComponent(
          cdr,
          notificationService,
          sanitizer,
          artifactIconService,
          artifactFileService,
        ),
    );

    const mockUser = Object.create(null) as UserInfo;
    Object.assign(mockUser, {
      ID: 'u-reviewer-1',
      Name: 'Bob Reviewer',
      Email: 'bob@example.com',
    });

    const conversationId = '11111111-1111-1111-1111-111111111111';
    const branchId = '22222222-2222-2222-2222-222222222222';
    const scope: ConversationScope = {
      ConversationID: conversationId,
      BranchID: branchId,
      Branches: [
        {
          ID: branchId,
          ConversationID: conversationId,
          ParentBranchID: null,
          ForkFromSequence: 2,
          Name: null,
        },
      ],
    };

    const artifactId = 'art-test-1';
    const restoredVersionId = 'ver-restored-3';
    const restoredVersionNumber = 3;

    // Track all RunViews batches executed by fallback
    const executedBatches: RunViewParams[][] = [];

    const mockProvider = Object.create(null) as IMetadataProvider;
    Object.assign(mockProvider, {
      CurrentUser: mockUser,
      Entities: [],
      EntityByName: (name: string) =>
        name === 'MJ: Artifacts' ? { ID: 'artifacts-entity-id', Name: 'MJ: Artifacts' } : undefined,
      ConfigData: { URL: 'https://example.com/graphql' },
      ExecuteGQL: async (query: string) => {
        if (query.includes('RestoreArtifactVersion')) {
          return {
            RestoreArtifactVersion: {
              Success: true,
              VersionID: restoredVersionId,
              VersionNumber: restoredVersionNumber,
            },
          };
        }
        return {};
      },
      GetEntityObject: async (entityName: string) => {
        if (entityName === 'MJ: Artifact Versions') {
          const entity = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
          entity.Load = async () => false; // Load fails! triggers fallback
          return entity;
        }
        return Object.create(null);
      },
      RunViews: async (queries: RunViewParams[]): Promise<RunViewResult[]> => {
        executedBatches.push(queries);
        return queries.map((q) => {
          // Scoped version list query (lightweight fields, no Content)
          if (q.Fields && q.Fields.includes('VersionNumber') && !q.MaxRows) {
            const v2Scoped = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
            Object.defineProperties(v2Scoped, {
              ID: { value: 'ver-2', enumerable: true },
              ArtifactID: { value: artifactId, enumerable: true },
              VersionNumber: { value: 2, enumerable: true },
              Name: { value: 'Version 2', enumerable: true },
              Description: { value: 'v2 in scope', enumerable: true },
            });
            const v1Scoped = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
            Object.defineProperties(v1Scoped, {
              ID: { value: 'ver-1', enumerable: true },
              ArtifactID: { value: artifactId, enumerable: true },
              VersionNumber: { value: 1, enumerable: true },
              Name: { value: 'Version 1', enumerable: true },
              Description: { value: 'v1 in scope', enumerable: true },
            });
            return {
              Success: true,
              Results: [v2Scoped, v1Scoped],
              RowCount: 2,
              TotalRowCount: 2,
              ExecutionTime: 1,
              ErrorMessage: '',
            };
          }
          // ID-only query for all versions of artifact
          if (q.Fields && q.Fields.length === 1 && q.Fields[0] === 'ID') {
            const v1Id = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
            Object.defineProperties(v1Id, { ID: { value: 'ver-1', enumerable: true } });
            const v2Id = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
            Object.defineProperties(v2Id, { ID: { value: 'ver-2', enumerable: true } });
            const v999Id = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
            Object.defineProperties(v999Id, { ID: { value: 'ver-out-of-scope-999', enumerable: true } });
            return {
              Success: true,
              Results: [v1Id, v2Id, v999Id],
              RowCount: 3,
              TotalRowCount: 3,
              ExecutionTime: 1,
              ErrorMessage: '',
            };
          }
          // Single restored version query (full entity with Content and Configuration)
          if (q.MaxRows === 1 && q.ResultType === 'entity_object') {
            const singleEntity = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
            Object.defineProperties(singleEntity, {
              ID: { value: restoredVersionId, enumerable: true },
              ArtifactID: { value: artifactId, enumerable: true },
              VersionNumber: { value: restoredVersionNumber, enumerable: true },
              Name: { value: 'Restored Version 3', enumerable: true },
              Description: { value: 'Restored from v1', enumerable: true },
              Content: { value: '# Restored Markdown Full Content v3', enumerable: true },
              Configuration: { value: JSON.stringify({ theme: 'dark' }), enumerable: true },
            });
            return {
              Success: true,
              Results: [singleEntity],
              RowCount: 1,
              TotalRowCount: 1,
              ExecutionTime: 1,
              ErrorMessage: '',
            };
          }
          return {
            Success: true,
            Results: [],
            RowCount: 0,
            TotalRowCount: 0,
            ExecutionTime: 0,
            ErrorMessage: '',
          };
        });
      },
    });

    panel.Provider = mockProvider;
    panel.CurrentUser = mockUser;
    panel.canEdit = true;
    panel.Scope = scope;
    panel.ViewContext = 'conversation';
    const artifactEntity = Object.create(MJArtifactEntity.prototype) as MJArtifactEntity;
    Object.defineProperties(artifactEntity, {
      ID: { value: artifactId, enumerable: true },
      Name: { value: 'Scoped Test Artifact', enumerable: true },
    });
    panel.Artifact = artifactEntity;

    const v1Initial = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
    Object.defineProperties(v1Initial, {
      ID: { value: 'ver-1', enumerable: true },
      ArtifactID: { value: artifactId, enumerable: true },
      VersionNumber: { value: 1, enumerable: true },
      Name: { value: 'v1 Initial', enumerable: true },
      Content: { value: '# v1 initial content', enumerable: true },
    });
    panel.AllVersions = [v1Initial];

    // Trigger restore of version 1
    await panel.OnRestoreComparedVersion(1);

    // 1. Verify executed fallback query batch
    expect(executedBatches).toHaveLength(1);
    const batch = executedBatches[0];
    expect(batch).toHaveLength(3);

    const [scopedListQuery, allIdsQuery, singleVerQuery] = batch;

    // (a) Scoped list query has conversation scope filter, simple result type, and lightweight fields without Content
    expect(scopedListQuery.EntityName).toBe('MJ: Artifact Versions');
    expect(scopedListQuery.ResultType).toBe('simple');
    expect(scopedListQuery.ExtraFilter).toBe(
      ConversationEngine.ArtifactVersionScopeFilter(scope, artifactId),
    );
    expect(scopedListQuery.Fields).toBeDefined();
    expect(scopedListQuery.Fields).not.toContain('Content');

    // (b) ID query for maintaining artifactVersionIds
    expect(allIdsQuery.EntityName).toBe('MJ: Artifact Versions');
    expect(allIdsQuery.Fields).toEqual(['ID']);
    expect(allIdsQuery.ResultType).toBe('simple');

    // (c) Single restored version query has entity_object, MaxRows 1, and filters for restored version ID
    expect(singleVerQuery.EntityName).toBe('MJ: Artifact Versions');
    expect(singleVerQuery.MaxRows).toBe(1);
    expect(singleVerQuery.ResultType).toBe('entity_object');
    expect(singleVerQuery.ExtraFilter).toContain(restoredVersionId);

    // 2. Verify panel state
    // Does NOT leak out-of-scope version 'ver-out-of-scope-999' into AllVersions
    const allVersionIds = panel.AllVersions.map((v) => v.ID);
    expect(allVersionIds).not.toContain('ver-out-of-scope-999');

    // Prepends restored version to AllVersions and keeps scoped versions
    expect(panel.AllVersions[0].ID).toBe(restoredVersionId);
    expect(panel.AllVersions[0].VersionNumber).toBe(restoredVersionNumber);
    expect(allVersionIds).toEqual([restoredVersionId, 'ver-2', 'ver-1']);

    // Loads full Content only for the single restored version
    expect(panel.artifactVersion).toBeDefined();
    expect(panel.artifactVersion?.ID).toBe(restoredVersionId);
    expect(panel.artifactVersion?.Content).toBe('# Restored Markdown Full Content v3');
    expect(panel.SelectedVersionNumber).toBe(restoredVersionNumber);

    // Success notification shown
    expect(
      notifications.some(
        (n) => n.type === 'success' && n.message.includes('Restored v1 as new version v3'),
      ),
    ).toBe(true);
  });
});

describe('MarkdownArtifactViewerComponent — Flow-First Continuous Block Transitions (Horizon 1)', () => {
  function createEditableDocsViewer(initialMarkdown: string): MarkdownArtifactViewerComponent {
    const collabService = new DocumentCollaborationService();
    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
        {
          provide: MJNotificationService,
          useValue: {
            CreateSimpleNotification: () => {},
          },
        },
      ],
    });
    const viewer = runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());
    viewer.readonly = false;
    viewer.HasEditPermission = true;
    viewer.ViewMode = 'edit';
    viewer.OnMarkdownChanged(initialMarkdown, true);
    return viewer;
  }

  function makeMockEditableElement(
    text: string,
    selectionStart = text.length,
    selectionEnd = selectionStart,
  ): HTMLElement {
    return {
      textContent: text,
      selectionStart,
      selectionEnd,
      focus: () => {},
      contains: () => false,
    } as unknown as HTMLElement;
  }

  function makeKeyEvent(
    key: string,
    target: HTMLElement,
    mods: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {},
  ): { event: KeyboardEvent; prevented: () => boolean } {
    let defaultPrevented = false;
    const event = {
      key,
      shiftKey: Boolean(mods.shiftKey),
      metaKey: Boolean(mods.metaKey),
      ctrlKey: Boolean(mods.ctrlKey),
      altKey: Boolean(mods.altKey),
      target,
      preventDefault: () => {
        defaultPrevented = true;
      },
    } as unknown as KeyboardEvent;
    return { event, prevented: () => defaultPrevented };
  }

  it('pressing Enter at the end of a heading commits the heading and creates a focused draft paragraph below', () => {
    const viewer = createEditableDocsViewer('# Quarterly Executive Summary');
    expect(viewer.DocumentSegments).toHaveLength(1);
    expect(viewer.DocumentSegments[0].BlockKind).toBe('heading');

    const headingEl = makeMockEditableElement('Quarterly Executive Summary Updated');
    const { event, prevented } = makeKeyEvent('Enter', headingEl);
    viewer.OnEditableBlockKeydown(viewer.DocumentSegments[0], event);

    expect(prevented()).toBe(true);
    expect(viewer.MarkdownContent).toBe('# Quarterly Executive Summary Updated');
    expect(viewer.DocumentSegments).toHaveLength(2);
    expect(viewer.DocumentSegments[0].BlockKind).toBe('heading');
    expect(viewer.DocumentSegments[1].BlockKind).toBe('paragraph');
    expect(viewer.DocumentSegments[1].RawMarkdown).toBe('');
    expect(viewer.SelectedAnchorKey).toBe(viewer.DocumentSegments[1].SegmentID);
  });

  it('pressing Enter mid-heading or mid-paragraph splits the block at the caret into two blocks', () => {
    const viewer = createEditableDocsViewer('# Product Strategy Overview\n\nFirst sentence. Second sentence.');
    expect(viewer.DocumentSegments).toHaveLength(2);

    // 1. Split heading at offset 7 ("Product" | " Strategy Overview")
    const headingEl = makeMockEditableElement('Product Strategy Overview', 7, 7);
    const headingKey = makeKeyEvent('Enter', headingEl);
    viewer.OnEditableBlockKeydown(viewer.DocumentSegments[0], headingKey.event);

    expect(headingKey.prevented()).toBe(true);
    expect(viewer.DocumentSegments).toHaveLength(3);
    expect(viewer.DocumentSegments[0].RawMarkdown).toBe('# Product');
    expect(viewer.DocumentSegments[1].BlockKind).toBe('paragraph');
    expect(viewer.DocumentSegments[1].RawMarkdown).toBe('Strategy Overview');

    // 2. Split second paragraph ("First sentence." | " Second sentence.") at offset 15
    const paraSeg = viewer.DocumentSegments[2];
    const paraEl = makeMockEditableElement('First sentence. Second sentence.', 15, 15);
    const paraKey = makeKeyEvent('Enter', paraEl);
    viewer.OnEditableBlockKeydown(paraSeg, paraKey.event);

    expect(paraKey.prevented()).toBe(true);
    expect(viewer.DocumentSegments).toHaveLength(4);
    expect(viewer.DocumentSegments[2].RawMarkdown).toBe('First sentence.');
    expect(viewer.DocumentSegments[3].RawMarkdown).toBe('Second sentence.');
    expect(viewer.SelectedAnchorKey).toBe(viewer.DocumentSegments[3].SegmentID);
  });

  it('auto-converts paragraph blocks in place when typing Markdown prefixes (# , - , 1. , [] , > )', () => {
    const viewer = createEditableDocsViewer('Initial paragraph');

    // 1. Turn paragraph into H2 heading via "## "
    const para0 = viewer.DocumentSegments[0];
    viewer.OnEditableBlockInput(para0, {
      target: makeMockEditableElement('## Key Milestones'),
    } as unknown as Event);
    expect(viewer.DocumentSegments[0].BlockKind).toBe('heading');
    expect(viewer.DocumentSegments[0].HeadingLevel).toBe(2);
    expect(viewer.DocumentSegments[0].HeadingText).toBe('Key Milestones');

    // 2. Append trailing paragraph and turn into bullet list via "- "
    viewer.AppendOrFocusTrailingParagraph();
    expect(viewer.DocumentSegments).toHaveLength(2);
    viewer.OnEditableBlockInput(viewer.DocumentSegments[1], {
      target: makeMockEditableElement('- Ship fluid block flow'),
    } as unknown as Event);
    expect(viewer.DocumentSegments[1].BlockKind).toBe('list');
    expect(viewer.GetParsedListItems(viewer.DocumentSegments[1])).toEqual([
      {
        Index: 0,
        IsTask: false,
        Checked: false,
        Text: 'Ship fluid block flow',
      },
    ]);

    // 3. Append trailing paragraph and turn into task checklist via "[] "
    viewer.AppendOrFocusTrailingParagraph();
    viewer.OnEditableBlockInput(viewer.DocumentSegments[2], {
      target: makeMockEditableElement('[] Verify smoke tests'),
    } as unknown as Event);
    expect(viewer.DocumentSegments[2].BlockKind).toBe('list');
    expect(viewer.GetParsedListItems(viewer.DocumentSegments[2])[0].IsTask).toBe(true);
    expect(viewer.GetParsedListItems(viewer.DocumentSegments[2])[0].Text).toBe('Verify smoke tests');

    // 4. Append trailing paragraph and turn into callout via "> "
    viewer.AppendOrFocusTrailingParagraph();
    viewer.OnEditableBlockInput(viewer.DocumentSegments[3], {
      target: makeMockEditableElement('> Important rollout note'),
    } as unknown as Event);
    expect(viewer.DocumentSegments[3].BlockKind).toBe('callout');
    expect(viewer.GetParsedCallout(viewer.DocumentSegments[3])).toEqual({
      CalloutType: 'NOTE',
      BodyText: 'Important rollout note',
    });
  });

  it('inserts clean empty list items on Enter and exits the list into a paragraph when pressing Enter on an empty item', () => {
    const viewer = createEditableDocsViewer('- First bullet');
    expect(viewer.DocumentSegments).toHaveLength(1);
    expect(viewer.DocumentSegments[0].BlockKind).toBe('list');

    // 1. Press Enter at end of "First bullet" -> adds empty 2nd bullet (not "New item")
    const item0El = makeMockEditableElement('First bullet');
    const enter1 = makeKeyEvent('Enter', item0El);
    viewer.OnListItemKeydown(viewer.DocumentSegments[0], 0, enter1.event);
    expect(enter1.prevented()).toBe(true);
    const itemsAfterFirstEnter = viewer.GetParsedListItems(viewer.DocumentSegments[0]);
    expect(itemsAfterFirstEnter).toHaveLength(2);
    expect(itemsAfterFirstEnter[0].Text).toBe('First bullet');
    expect(itemsAfterFirstEnter[1].Text).toBe('');

    // 2. Press Enter on the empty 2nd bullet -> removes empty bullet and creates paragraph block below list
    const item1El = makeMockEditableElement('');
    const enter2 = makeKeyEvent('Enter', item1El);
    viewer.OnListItemKeydown(viewer.DocumentSegments[0], 1, enter2.event);
    expect(enter2.prevented()).toBe(true);
    expect(viewer.DocumentSegments).toHaveLength(2);
    expect(viewer.GetParsedListItems(viewer.DocumentSegments[0])).toHaveLength(1);
    expect(viewer.DocumentSegments[1].BlockKind).toBe('paragraph');
    expect(viewer.DocumentSegments[1].RawMarkdown).toBe('');
    expect(viewer.SelectedAnchorKey).toBe(viewer.DocumentSegments[1].SegmentID);
  });

  it('supports Backspace at offset 0 to demote headings, delete empty paragraphs, and merge paragraphs across blocks', () => {
    const viewer = createEditableDocsViewer('# Section Header\n\nFirst part.\n\nSecond part.');
    expect(viewer.DocumentSegments).toHaveLength(3);

    // 1. Backspace at offset 0 of "Second part." merges it into "First part."
    const thirdSeg = viewer.DocumentSegments[2];
    const thirdEl = makeMockEditableElement('Second part.', 0, 0);
    const bsMerge = makeKeyEvent('Backspace', thirdEl);
    viewer.OnEditableBlockKeydown(thirdSeg, bsMerge.event);
    expect(bsMerge.prevented()).toBe(true);
    expect(viewer.DocumentSegments).toHaveLength(2);
    expect(viewer.DocumentSegments[1].RawMarkdown).toBe('First part. Second part.');

    // 2. Backspace at offset 0 of "# Section Header" demotes it in-place to a paragraph
    const firstSeg = viewer.DocumentSegments[0];
    const firstEl = makeMockEditableElement('Section Header', 0, 0);
    const bsDemote = makeKeyEvent('Backspace', firstEl);
    viewer.OnEditableBlockKeydown(firstSeg, bsDemote.event);
    expect(bsDemote.prevented()).toBe(true);
    expect(viewer.DocumentSegments[0].BlockKind).toBe('paragraph');
    expect(viewer.DocumentSegments[0].RawMarkdown).toBe('Section Header');

    // 3. Append empty trailing paragraph, then Backspace at offset 0 removes it and focuses previous block
    viewer.AppendOrFocusTrailingParagraph();
    expect(viewer.DocumentSegments).toHaveLength(3);
    const draftSeg = viewer.DocumentSegments[2];
    const draftEl = makeMockEditableElement('', 0, 0);
    const bsDeleteEmpty = makeKeyEvent('Backspace', draftEl);
    viewer.OnEditableBlockKeydown(draftSeg, bsDeleteEmpty.event);
    expect(bsDeleteEmpty.prevented()).toBe(true);
    expect(viewer.DocumentSegments).toHaveLength(2);
    expect(viewer.SelectedAnchorKey).toBe(viewer.DocumentSegments[1].SegmentID);
  });

  it('navigates across adjacent blocks with ArrowDown at block end and ArrowUp at block start', () => {
    const viewer = createEditableDocsViewer('# Title\n\nBody paragraph one.\n\nBody paragraph two.');
    expect(viewer.DocumentSegments).toHaveLength(3);

    // ArrowDown at end of Title moves selection to Body paragraph one
    const titleEl = makeMockEditableElement('Title', 5, 5);
    const downEvt = makeKeyEvent('ArrowDown', titleEl);
    viewer.OnEditableBlockKeydown(viewer.DocumentSegments[0], downEvt.event);
    expect(downEvt.prevented()).toBe(true);
    expect(viewer.SelectedAnchorKey).toBe(viewer.DocumentSegments[1].SegmentID);

    // ArrowUp at start (offset 0) of Body paragraph two moves selection back to Body paragraph one
    const para2El = makeMockEditableElement('Body paragraph two.', 0, 0);
    const upEvt = makeKeyEvent('ArrowUp', para2El);
    viewer.OnEditableBlockKeydown(viewer.DocumentSegments[2], upEvt.event);
    expect(upEvt.prevented()).toBe(true);
    expect(viewer.SelectedAnchorKey).toBe(viewer.DocumentSegments[1].SegmentID);
  });

  it('automatically transitions persisted documents from Read (preview) to Write (edit) mode once permissions and collaboration sync resolve, and supports double-clicking any block in Read mode to enter Write mode', async () => {
    const collabService = new DocumentCollaborationService();
    vi.spyOn(collabService, 'ResolvePermissionsFromServer').mockResolvedValue({
      ArtifactID: '99999999-9999-4999-8999-999999999991',
      CanRead: true,
      CanEdit: true,
      CanDelete: true,
      CanShare: true,
      Source: 'Owner',
      Reason: 'Artifact owner',
    });

    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
        { provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } },
      ],
    });

    const viewer = runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());
    const mockUser = Object.create(null) as UserInfo;
    Object.assign(mockUser, {
      ID: '11111111-2222-4333-8444-555555555555',
      Name: 'Alice Author',
      Email: 'alice@example.com',
    });
    const mockProvider = Object.create(null) as IMetadataProvider;
    Object.assign(mockProvider, {
      CurrentUser: mockUser,
      Entities: [],
      EntityByName: () => undefined,
    });
    viewer.Provider = mockProvider;
    viewer.readonly = false;

    const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
    Object.defineProperties(ver, {
      ID: { value: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1', enumerable: true },
      ArtifactID: { value: '99999999-9999-4999-8999-999999999991', enumerable: true },
      VersionNumber: { value: 1, enumerable: true },
      Content: { value: '# Persisted Document\n\nReady to edit.', enumerable: true },
    });
    viewer.artifactVersion = ver;
    viewer.ngOnInit();

    await new Promise((r) => setTimeout(r, 0));
    expect(viewer.HasEditPermission).toBe(true);
    expect(viewer.CanUserEdit).toBe(true);
    expect(viewer.ViewMode).toBe('edit');
    expect(viewer.IsInteractiveCanvasMode).toBe(true);

    // Explicitly switch to Read ('preview') mode, then double-click a block to jump back to Write ('edit') mode
    viewer.SetViewMode('preview');
    expect(viewer.ViewMode).toBe('preview');
    viewer.OnPreviewBlockDoubleClick(viewer.DocumentSegments[1]);
    expect(viewer.ViewMode).toBe('edit');
    expect(viewer.SelectedAnchorKey).toBe(viewer.DocumentSegments[1].SegmentID);
    viewer.ngOnDestroy();
  });

  it('defaults to Simple Note Mode (EditingStyle === "simple"), supports switching to Advanced Block Mode ("blocks"), and always inserts new sections/blocks BELOW the active segment', () => {
    const viewer = createEditableDocsViewer('# Amith Demo\n\nFirst section body.\n\n## Key Notes\n\nSecond section body.');
    expect(viewer.EditingStyle).toBe('simple');
    expect(viewer.IsSimpleNoteMode).toBe(true);
    expect(viewer.DocumentSegments).toHaveLength(4);

    // Focus the first heading ("# Amith Demo") and press Enter even with caret at offset 0 -> creates paragraph BELOW (index 1), never above
    const firstSeg = viewer.DocumentSegments[0];
    viewer.OnSegmentFocusIn(firstSeg);
    const headingAtZero = makeMockEditableElement('Amith Demo', 0, 0);
    const enterAtZero = makeKeyEvent('Enter', headingAtZero);
    viewer.OnEditableBlockKeydown(firstSeg, enterAtZero.event);
    expect(enterAtZero.prevented()).toBe(true);
    expect(viewer.DocumentSegments[0].BlockKind).toBe('heading');
    expect(viewer.DocumentSegments[0].RawMarkdown).toBe('# Amith Demo');
    expect(viewer.DocumentSegments[1].BlockKind).toBe('paragraph');
    expect(viewer.DocumentSegments[1].RawMarkdown).toBe('');

    // Focus "## Key Notes" (now index 3) and click "+ Section" (InsertSectionHeadingBelow) -> inserts new H2 BELOW "## Key Notes", never above
    const keyNotesSeg = viewer.DocumentSegments.find((s) => s.RawMarkdown.includes('## Key Notes'))!;
    const keyNotesIdx = viewer.DocumentSegments.findIndex((s) => s.SegmentID === keyNotesSeg.SegmentID);
    viewer.OnSegmentFocusIn(keyNotesSeg);
    viewer.InsertSectionHeadingBelow(2);
    expect(viewer.DocumentSegments[keyNotesIdx].RawMarkdown).toBe('## Key Notes');
    expect(viewer.DocumentSegments[keyNotesIdx + 1].BlockKind).toBe('heading');
    expect(viewer.DocumentSegments[keyNotesIdx + 1].HeadingLevel).toBe(2);

    // Toggle to Advanced Block Studio mode and back
    viewer.SetEditingStyle('blocks');
    expect(viewer.EditingStyle).toBe('blocks');
    expect(viewer.IsSimpleNoteMode).toBe(false);
    viewer.SetEditingStyle('simple');
    expect(viewer.IsSimpleNoteMode).toBe(true);
  });
});



