import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import * as Y from 'yjs';
import {
  SlideDeckEngine,
  SpreadsheetEngine,
  UserInfoEngine,
} from '@memberjunction/core-entities';
import {
  DocumentCollaborationService,
  DocumentCollaborationSession,
} from '../lib/services/document-collaboration.service';
import { ArtifactIconService } from '../lib/services/artifact-icon.service';
import {
  DEFAULT_PINNED_SHEETS_TOOLBAR_ACTIONS,
  SHEETS_TOOLBAR_PINS_SETTING_KEY,
  SpreadsheetArtifactViewerComponent,
} from '../lib/components/plugins/spreadsheet-artifact-viewer.component';
import {
  DEFAULT_PINNED_SLIDES_TOOLBAR_ACTIONS,
  SLIDES_TOOLBAR_PINS_SETTING_KEY,
  SlideDeckArtifactViewerComponent,
} from '../lib/components/plugins/slide-deck-artifact-viewer.component';
import { MarkdownArtifactViewerComponent } from '../lib/components/plugins/markdown-artifact-viewer.component';
import { DocumentImportExportService } from '../lib/services/document-import-export.service';
import { ElementRef, NgZone, Renderer2 } from '@angular/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { SlideDeckExportService } from '../lib/services/slide-deck-export.service';

function createMockCdr(): ChangeDetectorRef {
  return {
    markForCheck: vi.fn(),
    detectChanges: vi.fn(),
    detach: vi.fn(),
    reattach: vi.fn(),
    checkNoChanges: vi.fn(),
  } as unknown as ChangeDetectorRef;
}

describe('Horizon 1 Ergonomics & Cross-Artifact Features', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('P0.3 — Y.UndoManager in DocumentCollaborationSession', () => {
    it('undoes and redoes local prose edits while isolating remote edits', () => {
      const session = new DocumentCollaborationSession(
        'art-doc-1',
        'Initial baseline',
        { id: 'u1', name: 'Alice' },
        true,
        false,
      );

      expect(session.CanUndo).toBe(false);
      expect(session.CanRedo).toBe(false);

      session.SetContent('Initial baseline\nLocal addition');
      expect(session.GetContent()).toContain('Local addition');
      expect(session.CanUndo).toBe(true);

      // Simulate a remote peer edit
      const remoteDoc = new Y.Doc();
      Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(session.YDoc));
      remoteDoc.transact(() => {
        remoteDoc.getText('content').insert(remoteDoc.getText('content').length, '\nRemote peer edit');
      }, 'remote');
      Y.applyUpdate(session.YDoc, Y.encodeStateAsUpdate(remoteDoc), 'remote');
      expect(session.GetContent()).toContain('Remote peer edit');

      // Local Undo should revert ONLY local addition, keeping remote edit
      expect(session.Undo()).toBe(true);
      expect(session.GetContent()).not.toContain('Local addition');
      expect(session.GetContent()).toContain('Remote peer edit');
      expect(session.CanRedo).toBe(true);

      // Redo restores local addition
      expect(session.Redo()).toBe(true);
      expect(session.GetContent()).toContain('Local addition');

      session.Destroy();
      remoteDoc.destroy();
    });

    it('re-initializes undo stack cleanly on ApplyRoomReset', () => {
      const session = new DocumentCollaborationSession(
        'art-doc-2',
        'Line 1',
        { id: 'u1', name: 'Alice' },
        true,
        false,
      );
      session.SetContent('Line 1\nLine 2');
      expect(session.CanUndo).toBe(true);

      session.ApplyRoomReset('Fresh baseline');
      const postReset = session.GetContent();
      expect(postReset).toContain('Fresh baseline');

      session.SetContent(`${postReset}\nEdited after reset`);
      expect(session.CanUndo).toBe(true);
      expect(session.Undo()).toBe(true);
      expect(session.GetContent()).toBe('Fresh baseline');

      session.Destroy();
    });
  });

  describe('P0.4 & P0.3 — Sheets Keyboard Navigation, TSV Paste & Atomic Batch Undo', () => {
    function createSheetsComponent(): SpreadsheetArtifactViewerComponent {
      const injector = Injector.create({
        providers: [
          { provide: ChangeDetectorRef, useValue: createMockCdr() },
          { provide: DocumentCollaborationService, useValue: new DocumentCollaborationService() },
        ],
      });
      return runInInjectionContext(injector, () => new SpreadsheetArtifactViewerComponent());
    }

    it('navigates cells with arrows, Shift+Arrow range expansion, and Tab wrapping', () => {
      const comp = createSheetsComponent();
      comp.Workbook = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Test');
      comp.ActiveRowIndex = 1;
      comp.ActiveColumnIndex = 1;
      comp.SelectedRange = 'A1';
      comp.SelectedRanges = ['A1'];

      comp.MoveActiveCell(0, 1, false);
      expect(comp.ActiveCellAddress).toBe('B1');
      expect(comp.SelectedRange).toBe('B1');

      // Shift+ArrowDown expands from B1 to B1:B2
      comp.MoveActiveCell(1, 0, true);
      expect(comp.ActiveCellAddress).toBe('B2');
      expect(comp.SelectedRange).toBe('B1:B2');

      // Shift+ArrowRight expands to B1:C2
      comp.MoveActiveCell(0, 1, true);
      expect(comp.SelectedRange).toBe('B1:C2');

      comp.ngOnDestroy();
    });

    it('pastes rectangular TSV in a single atomic undoable batch and clears selected range', () => {
      const comp = createSheetsComponent();
      comp.Permissions = {
        ArtifactID: 'art-sheet-1',
        CanRead: true,
        CanEdit: true,
        CanDelete: true,
        CanShare: false,
        Source: 'Owner',
        Reason: 'Test owner permissions',
      };
      comp.readonly = false;
      comp.Workbook = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Test');
      const serialized = SpreadsheetEngine.Instance.SerializeWorkbook(comp.Workbook);
      comp.CollaborationSession = new DocumentCollaborationSession(
        'art-sheet-1',
        serialized,
        { id: 'u1', name: 'Alice' },
        true,
        false,
      );
      comp.ActiveRowIndex = 1;
      comp.ActiveColumnIndex = 1;

      comp.ApplyTsvPasteAtActiveCell('Item\tQty\nWidget\t42');
      expect(comp.ActiveSheet.Cells['A1']?.RawValue).toBe('Item');
      expect(comp.ActiveSheet.Cells['B1']?.RawValue).toBe('Qty');
      expect(comp.ActiveSheet.Cells['A2']?.RawValue).toBe('Widget');
      expect(comp.ActiveSheet.Cells['B2']?.RawValue).toBe(42);
      expect(comp.SelectedRange).toBe('A1:B2');
      expect(comp.CanUndo).toBe(true);

      // Single Undo reverts entire rectangular paste
      expect(comp.CollaborationSession.Undo()).toBe(true);
      const afterUndo = SpreadsheetEngine.Instance.ParseWorkbook(comp.CollaborationSession.GetContent());
      expect(afterUndo.Worksheets[0].Cells['B2']).toBeUndefined();

      // Re-apply and test ClearSelectedRange
      expect(comp.CollaborationSession.Redo()).toBe(true);
      comp.Workbook = SpreadsheetEngine.Instance.ParseWorkbook(comp.CollaborationSession.GetContent());
      comp.SelectedRanges = ['A1:B2'];
      comp.SelectedRange = 'A1:B2';
      comp.ClearSelectedRange();
      expect(comp.ActiveSheet.Cells['A1']).toBeUndefined();
      expect(comp.ActiveSheet.Cells['B2']).toBeUndefined();

      comp.ngOnDestroy();
    });
  });

  describe('P1.1 & Progressive Disclosure — Slides Filmstrip Drag-Reorder & Toolbar Pins', () => {
    function createSlidesComponent(): SlideDeckArtifactViewerComponent {
      const injector = Injector.create({
        providers: [
          { provide: ChangeDetectorRef, useValue: createMockCdr() },
          { provide: DocumentCollaborationService, useValue: new DocumentCollaborationService() },
          { provide: SlideDeckExportService, useValue: {} as SlideDeckExportService },
        ],
      });
      return runInInjectionContext(injector, () => new SlideDeckArtifactViewerComponent());
    }

    it('reorders slides on filmstrip drag-drop and supports Reset/Pin via UserInfoEngine', () => {
      const comp = createSlidesComponent();
      comp.ResolvedPermissions = {
        ArtifactID: 'art-deck-1',
        CanRead: true,
        CanEdit: true,
        CanDelete: true,
        CanShare: false,
        Source: 'Owner',
        Reason: 'Test owner permissions',
      };
      comp.readonly = false;
      const deck = SlideDeckEngine.Instance.CreateDefaultDeck('Deck');
      const { Deck: d2 } = SlideDeckEngine.Instance.AddSlide(deck, { Title: 'Slide 2' });
      const { Deck: d3 } = SlideDeckEngine.Instance.AddSlide(d2, { Title: 'Slide 3' });
      comp.Deck = d3;

      const s1 = comp.Deck.Slides[0].SlideID;
      const s3 = comp.Deck.Slides[2].SlideID;

      const fakeEvt = {
        preventDefault: vi.fn(),
        dataTransfer: { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: () => s1 },
      } as unknown as DragEvent;

      comp.OnSlideDragStart(s1, fakeEvt);
      comp.OnSlideDrop(s3, fakeEvt);
      expect(comp.Deck.Slides[2].SlideID).toBe(s1);

      const getSettingSpy = vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
      const setSettingSpy = vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => {});

      expect(comp.PinnedToolbarActions).toEqual([...DEFAULT_PINNED_SLIDES_TOOLBAR_ACTIONS]);
      // Unpin 'add-slide' and pin 'presenter'
      comp.TogglePinToolbarAction('add-slide');
      comp.TogglePinToolbarAction('presenter');
      expect(comp.PinnedToolbarActions).toContain('presenter');
      expect(comp.PinnedToolbarActions).not.toContain('add-slide');
      expect(setSettingSpy).toHaveBeenCalledWith(
        SLIDES_TOOLBAR_PINS_SETTING_KEY,
        expect.stringContaining('presenter'),
      );

      comp.ResetToolbarPreferences();
      expect(comp.PinnedToolbarActions).toEqual([...DEFAULT_PINNED_SLIDES_TOOLBAR_ACTIONS]);

      // Slides Cmd+K command palette opens cleanly and exposes layouts, themes & present actions
      comp.OpenCommandPalette();
      expect(comp.ShowCommandPalette).toBe(true);
      expect(comp.SlidesCommandPaletteItems.some((c) => c.Id === 'layout:KpiStrip')).toBe(true);
      expect(comp.SlidesCommandPaletteItems.some((c) => c.Id === 'theme:executive-slate')).toBe(true);
      comp.ExecuteSlidePaletteCommand('layout:KpiStrip');
      expect(comp.ActiveSlide.Layout).toBe('KpiStrip');

      getSettingSpy.mockRestore();
      setSettingSpy.mockRestore();
      comp.ngOnDestroy();
    });

    it('persists Sheets toolbar pins via UserInfoEngine and enforces MaxPinnedToolbarActions', () => {
      const injector = Injector.create({
        providers: [
          { provide: ChangeDetectorRef, useValue: createMockCdr() },
          { provide: DocumentCollaborationService, useValue: new DocumentCollaborationService() },
        ],
      });
      const comp = runInInjectionContext(injector, () => new SpreadsheetArtifactViewerComponent());

      vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
      const setSettingSpy = vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => {});

      expect(comp.PinnedToolbarActions).toEqual([...DEFAULT_PINNED_SHEETS_TOOLBAR_ACTIONS]);
      // Starts with 2 calm defaults; fill up to MaxPinnedToolbarActions (4), then verify 5th is capped
      comp.TogglePinToolbarAction('bold');
      comp.TogglePinToolbarAction('freeze-header');
      expect(comp.PinnedToolbarActions.length).toBe(comp.MaxPinnedToolbarActions);
      comp.TogglePinToolbarAction('export-xlsx');
      expect(comp.PinnedToolbarActions.length).toBe(comp.MaxPinnedToolbarActions);
      expect(comp.PinnedToolbarActions).not.toContain('export-xlsx');

      comp.TogglePinToolbarAction('add-chart');
      comp.TogglePinToolbarAction('export-xlsx');
      expect(comp.PinnedToolbarActions).toContain('export-xlsx');
      expect(setSettingSpy).toHaveBeenCalledWith(
        SHEETS_TOOLBAR_PINS_SETTING_KEY,
        expect.stringContaining('export-xlsx'),
      );

      // Sheets Cmd+K command palette opens cleanly and exposes Freeze/Protect actions
      comp.OpenCommandPalette();
      expect(comp.ShowCommandPalette).toBe(true);
      expect(comp.SheetsCommandPaletteItems.some((c) => c.Id === 'freeze-top-row')).toBe(true);
      expect(comp.SheetsCommandPaletteItems.some((c) => c.Id === 'toggle-protect')).toBe(true);

      comp.ngOnDestroy();
    });
  });

  describe('P1.2 — Cross-Artifact Sheet Chart & Range Slash Commands & Docs Insert Actions', () => {
    it('exposes /sheet-chart and /sheet-range slash commands and opens picker from OpenSlashBlockInsert', () => {
      const service = new DocumentCollaborationService();
      const cmds = service.GetSlashCommands('sheet');
      expect(cmds.some((c) => c.Command === '/sheet-chart')).toBe(true);
      expect(cmds.some((c) => c.Command === '/sheet-range')).toBe(true);

      const injector = Injector.create({
        providers: [
          { provide: ChangeDetectorRef, useValue: createMockCdr() },
          { provide: ElementRef, useValue: { nativeElement: null } },
          { provide: NgZone, useValue: { run: (fn: () => void) => fn() } },
          { provide: Renderer2, useValue: {} },
          { provide: DocumentCollaborationService, useValue: service },
          { provide: DocumentImportExportService, useValue: {} },
          { provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } },
        ],
      });
      const docsViewer = runInInjectionContext(injector, () => new MarkdownArtifactViewerComponent());

      // Fails closed when read-only
      docsViewer.readonly = true;
      docsViewer.OpenSlashBlockInsert('/sheet-chart');
      expect(docsViewer.PendingBlockInsertType).toBeNull();

      // Opens Sheet Chart & Sheet Range pickers with preselected spreadsheet defaults when editable
      docsViewer.readonly = false;
      docsViewer.HasEditPermission = true;
      docsViewer.OpenSlashBlockInsert('/sheet-chart');
      expect(docsViewer.PendingBlockInsertType).toBe('Artifact');
      expect(docsViewer.NewBlockArtifactTypeName).toBe('Spreadsheet');
      expect(docsViewer.NewBlockSheetMode).toBe('chart');

      docsViewer.OpenSlashBlockInsert('/sheet-range');
      expect(docsViewer.PendingBlockInsertType).toBe('Artifact');
      expect(docsViewer.NewBlockSheetMode).toBe('range');
      expect(docsViewer.NewBlockSheetRange).toBe('A1:D8');

      docsViewer.ngOnDestroy();
    });
  });

  describe('Multi-step Undo & ArtifactIconService FA6 Free normalization', () => {
    it('splits undo steps on StopUndoCapture so multiple sequential block edits undo one by one', () => {
      const service = new DocumentCollaborationService();
      const session = service.CreateSession('multi-undo-doc', 'Block A\n\nBlock B', { id: 'u1', name: 'Alice' }, true, false);
      session.SetContent('Block A edited\n\nBlock B');
      session.StopUndoCapture();
      session.SetContent('Block A edited\n\nBlock B edited');

      expect(session.CanUndo).toBe(true);
      expect(session.Undo()).toBe(true);
      expect(session.GetContent()).toBe('Block A edited\n\nBlock B');
      expect(session.CanUndo).toBe(true);
      expect(session.Undo()).toBe(true);
      expect(session.GetContent()).toBe('Block A\n\nBlock B');
      session.Destroy();
    });

    it('normalizes bare and Pro-only spreadsheet icon tokens to fa-solid Font Awesome 6 Free classes', () => {
      const iconService = new ArtifactIconService();
      expect(iconService.NormalizeMetadataIcon('fa-file-excel')).toBe('fa-solid fa-file-excel');
      expect(iconService.NormalizeMetadataIcon('fa-file-spreadsheet')).toBe('fa-solid fa-file-excel');
      expect(iconService.NormalizeMetadataIcon('fa-solid fa-file-lines')).toBe('fa-solid fa-file-lines');
    });
  });
});
