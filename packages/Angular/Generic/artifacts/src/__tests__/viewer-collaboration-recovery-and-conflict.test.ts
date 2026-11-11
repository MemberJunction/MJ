/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import * as encoding from 'lib0/encoding';
import type { IMetadataProvider } from '@memberjunction/core';
import {
  SlideDeckEngine,
  SpreadsheetEngine,
  type MJArtifactVersionEntity,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
  DocumentCollaborationService,
  MAX_RECONNECT_ATTEMPTS,
  MERGE_CONFLICT_WARNING_MESSAGE,
} from '../lib/services/document-collaboration.service';
import { ArtifactFileService } from '../lib/services/artifact-file.service';
import { DocumentImportExportService } from '../lib/services/document-import-export.service';
import { SlideDeckExportService } from '../lib/services/slide-deck-export.service';
import { MarkdownArtifactViewerComponent } from '../lib/components/plugins/markdown-artifact-viewer.component';
import { SlideDeckArtifactViewerComponent } from '../lib/components/plugins/slide-deck-artifact-viewer.component';
import { SpreadsheetArtifactViewerComponent } from '../lib/components/plugins/spreadsheet-artifact-viewer.component';

class ViewerTestSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;
  public static instances: ViewerTestSocket[] = [];

  public readyState = ViewerTestSocket.CONNECTING;
  public binaryType = 'arraybuffer';
  public url: string;
  public onopen: (() => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    ViewerTestSocket.instances.push(this);
  }

  public send(_data: Uint8Array): void {
    // no-op
  }

  public close(): void {
    this.readyState = ViewerTestSocket.CLOSED;
  }
}

function buildCollabProvider(): IMetadataProvider {
  let ticketCounter = 0;
  const base = Object.create(null) as IMetadataProvider;
  return Object.assign(base, {
    CurrentUser: {
      ID: '11111111-1111-4111-8111-111111111111',
      Name: 'Alice Reviewer',
      Email: 'alice@example.com',
    },
    Entities: [],
    EntityByName: (name: string) => undefined,
    Queries: [],
    ConfigData: { URL: 'https://example.com/graphql' },
    ExecuteGQL: async (query: string) => {
      if (query.includes('MintArtifactCollaborationTicket')) {
        return {
          MintArtifactCollaborationTicket: {
            Success: true,
            Ticket: `viewer-ticket-${++ticketCounter}`,
            WsPath: '/collaboration/yjs',
            CanRead: true,
            CanEdit: true,
          },
        };
      }
      if (query.includes('ResolveArtifactPermissions')) {
        return {
          ResolveArtifactPermissions: {
            ArtifactID: 'art-viewer-1',
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            Source: 'Owner',
          },
        };
      }
      return {};
    },
    GetRunViewProvider: async () => ({
      RunView: async () => ({ Success: true, Results: [], TotalRowCount: 0 }),
      RunViews: async () => [],
    }),
  });
}

function encodeMergeConflictControlFrame(artifactId: string, rejectedHunksCount = 2): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 2);
  encoding.writeVarString(
    encoder,
    JSON.stringify({
      type: 'control',
      action: 'merge-conflict',
      artifactId,
      versionNumber: 5,
      rejectedHunksCount,
      source: 'agent',
      timestamp: '2026-11-11T14:00:00.000Z',
    }),
  );
  return encoding.toUint8Array(encoder);
}

async function exhaustSocketReconnects(): Promise<void> {
  for (let attempt = 0; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
    const sock = ViewerTestSocket.instances[ViewerTestSocket.instances.length - 1];
    expect(sock).toBeDefined();
    sock.readyState = ViewerTestSocket.CLOSED;
    sock.onclose?.({ code: 1006 } as CloseEvent);
    if (attempt < MAX_RECONNECT_ATTEMPTS) {
      await vi.advanceTimersByTimeAsync(31_000);
    }
  }
}

describe('Round 8 Viewer Collaboration Recovery (R8-10) & Merge Conflict Handling (R8-2)', () => {
  it('MarkdownArtifactViewerComponent surfaces "Live sync disconnected" on error, RetryLiveCollaboration() invokes Retry(), and MergeConflict$ shows warning toast once', async () => {
    vi.useFakeTimers();
    const prevWebSocket = globalThis.WebSocket;
    ViewerTestSocket.instances = [];
    Reflect.set(globalThis, 'WebSocket', ViewerTestSocket);

    const toastSpy = vi.fn();
    const mockNotifier = Object.assign(
      Object.create(MJNotificationService.prototype) as MJNotificationService,
      { CreateSimpleNotification: toastSpy },
    );
    const collabService = new DocumentCollaborationService();
    collabService.SetNotificationSink(mockNotifier);
    const retrySpy = vi.spyOn(collabService, 'Retry');

    try {
      const injector = Injector.create({
        providers: [
          {
            provide: ChangeDetectorRef,
            useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() },
          },
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
          { provide: MJNotificationService, useValue: mockNotifier },
        ],
      });

      const provider = buildCollabProvider();
      const component = runInInjectionContext(
        injector,
        () => new MarkdownArtifactViewerComponent(),
      );
      component.Provider = provider;
      component.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
        ID: 'ver-doc-r8',
        ArtifactID: 'art-doc-r8',
        VersionNumber: 1,
        Name: 'Executive Brief',
        Content: '# Executive Brief\n\nLive collaborative content.',
      });
      component.readonly = false;

      component.ngOnInit();
      await vi.advanceTimersByTimeAsync(20);

      await exhaustSocketReconnects();
      expect(component.CollaborationStatus).toBe('error');
      expect(component.GetCollaborationStatusLabel()).toBe('Live sync disconnected');
      expect(component.GetCollaborationStatusLabel()).not.toBe('Ready · Collaborative');

      // Clicking Retry triggers RetryLiveCollaboration() -> collabService.Retry('art-doc-r8')
      component.RetryLiveCollaboration();
      expect(retrySpy).toHaveBeenCalledWith('art-doc-r8');
      await vi.advanceTimersByTimeAsync(20);

      const reconnectedSocket = ViewerTestSocket.instances[ViewerTestSocket.instances.length - 1];
      reconnectedSocket.readyState = ViewerTestSocket.OPEN;
      reconnectedSocket.onopen?.();
      expect(component.CollaborationStatus).toBe('connected');
      expect(component.GetCollaborationStatusLabel()).toBe('Live Sync');

      // Incoming merge-conflict frame updates StatusBannerMessage and fires single warning toast
      component.CollaborationSession?.ApplyBinaryFrame(
        encodeMergeConflictControlFrame('art-doc-r8', 2),
      );
      expect(component.StatusBannerMessage).toBe(MERGE_CONFLICT_WARNING_MESSAGE);
      expect(toastSpy).toHaveBeenCalledTimes(1);
      expect(toastSpy).toHaveBeenCalledWith(MERGE_CONFLICT_WARNING_MESSAGE, 'warning', 5000);

      component.ngOnDestroy();
    } finally {
      collabService.ngOnDestroy();
      Reflect.set(globalThis, 'WebSocket', prevWebSocket);
      vi.useRealTimers();
    }
  });

  it('SlideDeckArtifactViewerComponent surfaces "Live sync disconnected" on error, RetryLiveCollaboration() invokes Retry(), and MergeConflict$ shows warning toast once', async () => {
    vi.useFakeTimers();
    const prevWebSocket = globalThis.WebSocket;
    ViewerTestSocket.instances = [];
    Reflect.set(globalThis, 'WebSocket', ViewerTestSocket);

    const toastSpy = vi.fn();
    const mockNotifier = Object.assign(
      Object.create(MJNotificationService.prototype) as MJNotificationService,
      { CreateSimpleNotification: toastSpy },
    );
    const collabService = new DocumentCollaborationService();
    collabService.SetNotificationSink(mockNotifier);
    const retrySpy = vi.spyOn(collabService, 'Retry');

    try {
      const injector = Injector.create({
        providers: [
          {
            provide: ChangeDetectorRef,
            useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() },
          },
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: SlideDeckExportService, useValue: new SlideDeckExportService() },
          { provide: MJNotificationService, useValue: mockNotifier },
        ],
      });

      const provider = buildCollabProvider();
      const component = runInInjectionContext(
        injector,
        () => new SlideDeckArtifactViewerComponent(),
      );
      component.Provider = provider;
      const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Q4 Strategy', 'art-slides-r8');
      component.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
        ID: 'ver-slides-r8',
        ArtifactID: 'art-slides-r8',
        VersionNumber: 1,
        Name: 'Q4 Strategy',
        Content: SlideDeckEngine.Instance.SerializeDeckSpec(deck),
      });
      component.readonly = false;

      component.ngOnInit();
      await vi.advanceTimersByTimeAsync(20);

      await exhaustSocketReconnects();
      expect(component.ConnectionStatus).toBe('error');
      expect(component.GetCollaborationStatusLabel()).toBe('Live sync disconnected');
      expect(component.GetCollaborationStatusLabel()).not.toBe('Saved Locally');

      component.RetryLiveCollaboration();
      expect(retrySpy).toHaveBeenCalledWith('art-slides-r8');
      await vi.advanceTimersByTimeAsync(20);

      const reconnectedSocket = ViewerTestSocket.instances[ViewerTestSocket.instances.length - 1];
      reconnectedSocket.readyState = ViewerTestSocket.OPEN;
      reconnectedSocket.onopen?.();
      expect(component.ConnectionStatus).toBe('connected');
      expect(component.GetCollaborationStatusLabel()).toBe('Live Sync');

      const conflictFrame = encodeMergeConflictControlFrame('art-slides-r8', 1);
      reconnectedSocket.onmessage?.({ data: conflictFrame.buffer } as MessageEvent);
      expect(component.StatusBannerMessage).toBe(MERGE_CONFLICT_WARNING_MESSAGE);
      expect(toastSpy).toHaveBeenCalledTimes(1);
      expect(toastSpy).toHaveBeenCalledWith(MERGE_CONFLICT_WARNING_MESSAGE, 'warning', 5000);

      component.ngOnDestroy();
    } finally {
      collabService.ngOnDestroy();
      Reflect.set(globalThis, 'WebSocket', prevWebSocket);
      vi.useRealTimers();
    }
  });

  it('SpreadsheetArtifactViewerComponent surfaces "Live sync disconnected" on error, RetryLiveCollaboration() invokes Retry(), and MergeConflict$ shows warning toast once', async () => {
    vi.useFakeTimers();
    const prevWebSocket = globalThis.WebSocket;
    ViewerTestSocket.instances = [];
    Reflect.set(globalThis, 'WebSocket', ViewerTestSocket);

    const toastSpy = vi.fn();
    const mockNotifier = Object.assign(
      Object.create(MJNotificationService.prototype) as MJNotificationService,
      { CreateSimpleNotification: toastSpy },
    );
    const collabService = new DocumentCollaborationService();
    collabService.SetNotificationSink(mockNotifier);
    const retrySpy = vi.spyOn(collabService, 'Retry');

    try {
      const injector = Injector.create({
        providers: [
          {
            provide: ChangeDetectorRef,
            useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() },
          },
          { provide: DocumentCollaborationService, useValue: collabService },
          { provide: ArtifactFileService, useValue: null },
          { provide: MJNotificationService, useValue: mockNotifier },
        ],
      });

      const provider = buildCollabProvider();
      const component = runInInjectionContext(
        injector,
        () => new SpreadsheetArtifactViewerComponent(),
      );
      component.Provider = provider;
      const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('FY27 Plan');
      component.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
        ID: 'ver-sheets-r8',
        ArtifactID: 'art-sheets-r8',
        VersionNumber: 1,
        Name: 'FY27 Plan',
        Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
      });
      component.readonly = false;

      await component.ngOnInit();
      await vi.advanceTimersByTimeAsync(20);

      await exhaustSocketReconnects();
      expect(component.ConnectionStatus).toBe('error');
      expect(component.GetCollaborationStatusLabel()).toBe('Live sync disconnected');
      expect(component.GetCollaborationStatusLabel()).not.toBe('Saved Locally');

      component.RetryLiveCollaboration();
      expect(retrySpy).toHaveBeenCalledWith('art-sheets-r8');
      await vi.advanceTimersByTimeAsync(20);

      const reconnectedSocket = ViewerTestSocket.instances[ViewerTestSocket.instances.length - 1];
      reconnectedSocket.readyState = ViewerTestSocket.OPEN;
      reconnectedSocket.onopen?.();
      expect(component.ConnectionStatus).toBe('connected');
      expect(component.GetCollaborationStatusLabel()).toBe('Live Sync');

      component.CollaborationSession?.ApplyBinaryFrame(
        encodeMergeConflictControlFrame('art-sheets-r8', 4),
      );
      expect(component.StatusBannerMessage).toBe(MERGE_CONFLICT_WARNING_MESSAGE);
      expect(toastSpy).toHaveBeenCalledTimes(1);
      expect(toastSpy).toHaveBeenCalledWith(MERGE_CONFLICT_WARNING_MESSAGE, 'warning', 5000);

      component.ngOnDestroy();
    } finally {
      collabService.ngOnDestroy();
      Reflect.set(globalThis, 'WebSocket', prevWebSocket);
      vi.useRealTimers();
    }
  });

  it('R9-11: RetryLiveCollaboration never falls back to artifactVersion.ID or dummy IDs when session is null', () => {
    const collabService = new DocumentCollaborationService();
    const retrySpy = vi.spyOn(collabService, 'Retry').mockResolvedValue(true);

    const injector = Injector.create({
      providers: [
        {
          provide: ChangeDetectorRef,
          useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() },
        },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: DocumentImportExportService, useValue: new DocumentImportExportService() },
        { provide: SlideDeckExportService, useValue: new SlideDeckExportService() },
        { provide: ArtifactFileService, useValue: null },
        {
          provide: MJNotificationService,
          useValue: Object.assign(Object.create(MJNotificationService.prototype) as MJNotificationService, {
            CreateSimpleNotification: vi.fn(),
          }),
        },
      ],
    });

    // 1. MarkdownArtifactViewerComponent
    const mdViewer = runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());
    mdViewer.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
      ID: 'ver-wrong-999',
      ArtifactID: 'art-real-123',
    });
    mdViewer.RetryLiveCollaboration();
    expect(retrySpy).toHaveBeenCalledWith('art-real-123');
    retrySpy.mockClear();

    mdViewer.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
      ID: 'ver-wrong-999',
      ArtifactID: '',
    });
    mdViewer.RetryLiveCollaboration();
    expect(retrySpy).not.toHaveBeenCalled();

    // 2. SlideDeckArtifactViewerComponent
    const slideViewer = runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    slideViewer.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
      ID: 'ver-wrong-999',
      ArtifactID: 'art-real-123',
    });
    slideViewer.RetryLiveCollaboration();
    expect(retrySpy).toHaveBeenCalledWith('art-real-123');
    retrySpy.mockClear();

    slideViewer.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
      ID: 'ver-wrong-999',
      ArtifactID: '',
    });
    slideViewer.RetryLiveCollaboration();
    expect(retrySpy).not.toHaveBeenCalled();

    // 3. SpreadsheetArtifactViewerComponent
    const sheetViewer = runInInjectionContext(injector, () => new SpreadsheetArtifactViewerComponent());
    sheetViewer.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
      ID: 'ver-wrong-999',
      ArtifactID: 'art-real-123',
    });
    sheetViewer.RetryLiveCollaboration();
    expect(retrySpy).toHaveBeenCalledWith('art-real-123');
    retrySpy.mockClear();

    sheetViewer.artifactVersion = Object.assign(Object.create(null) as MJArtifactVersionEntity, {
      ID: 'ver-wrong-999',
      ArtifactID: '',
    });
    sheetViewer.RetryLiveCollaboration();
    expect(retrySpy).not.toHaveBeenCalled();

    collabService.ngOnDestroy();
  });
});
