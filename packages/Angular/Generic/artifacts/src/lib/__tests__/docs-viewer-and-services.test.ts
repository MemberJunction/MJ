import { describe, expect, it, vi } from 'vitest';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import type { IMetadataProvider } from '@memberjunction/core';
import { SpreadsheetEngine } from '@memberjunction/core-entities';
import { DocumentCollaborationService } from '../services/document-collaboration.service';
import { DocumentImportExportService } from '../services/document-import-export.service';
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
    const mockGraphQlProvider = {
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
    } as unknown as IMetadataProvider;

    const resolved = await service.ResolveCollaborationEndpoint('art-uuid-42', null, mockGraphQlProvider);
    expect(executeGqlCalls).toHaveLength(1);
    expect(executeGqlCalls[0].query).toContain('MintArtifactCollaborationTicket');
    expect(executeGqlCalls[0].variables).toEqual({ artifactId: 'art-uuid-42' });
    expect(resolved.Mode).toBe('connect');
    expect(resolved.WsUrl).toBe(
      'wss://mjapi.corp.example:4443/collaboration/yjs?artifactId=art-uuid-42&ticket=tok_single_use_987',
    );
    expect(resolved.CanEdit).toBe(true);
  });

  it('stays cleanly in local mode when no GraphQLDataProvider or wsUrl override is configured (A3)', async () => {
    const plainProvider = { Entities: [] } as unknown as IMetadataProvider;
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

    (globalThis as unknown as { WebSocket: typeof FakeWebSocket }).WebSocket = FakeWebSocket;
    let ticketCounter = 0;
    const mockGraphQlProvider = {
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
    } as unknown as IMetadataProvider;

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
      (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
      vi.useRealTimers();
    }
  });

  it('ComputeLineDiff handles two 20,000-line documents in < 100ms via prefix/suffix + bounded Myers/anchor diff (E4)', () => {
    const linesA: string[] = [];
    const linesB: string[] = [];
    for (let i = 0; i < 20000; i++) {
      linesA.push(`Section ${i}: Shared specification line ${i}`);
      linesB.push(i === 10000 ? `Section ${i}: Modified specification line ${i}` : `Section ${i}: Shared specification line ${i}`);
    }
    const t0 = performance.now();
    const diff = service.ComputeLineDiff(linesA.join('\n'), linesB.join('\n'));
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(100);
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

