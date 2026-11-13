/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Injector, runInInjectionContext, ChangeDetectorRef, SimpleChange } from '@angular/core';
import {
  SpreadsheetEngine,
  type WorkbookSpec,
} from '@memberjunction/core-entities';
import { SpreadsheetArtifactViewerComponent } from '../lib/components/plugins/spreadsheet-artifact-viewer.component';
import {
  DocumentCollaborationService,
  type CollaboratorPresence,
  type DocumentAnchoredThread,
} from '../lib/services/document-collaboration.service';
import { ArtifactFileService } from '../lib/services/artifact-file.service';

describe('SpreadsheetArtifactViewerComponent — Multi-Select, Drag Selection & Collaborator Overlays', () => {
  let collabService: DocumentCollaborationService;
  let component: SpreadsheetArtifactViewerComponent;

  beforeEach(() => {
    vi.useFakeTimers();
    collabService = new DocumentCollaborationService();

    const injector = Injector.create({
      providers: [
        {
          provide: ChangeDetectorRef,
          useValue: { markForCheck: () => {}, detectChanges: () => {} },
        },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: ArtifactFileService, useValue: null },
      ],
    });

    component = runInInjectionContext(
      injector,
      () => new SpreadsheetArtifactViewerComponent(),
    );

    const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Test Model');
    component.Workbook = wb;
  });

  afterEach(() => {
    component.ngOnDestroy();
    collabService.ngOnDestroy();
    vi.useRealTimers();
  });

  describe('1. Click-and-drag rectangular range selection', () => {
    it('selects a rectangular cell range via mousedown -> mouseenter -> mouseup', () => {
      // Start drag at B2 (row 2, col 2)
      component.OnCellMouseDown(2, 2, new MouseEvent('mousedown', { button: 0 }));
      expect(component.IsDraggingSelection).toBe(true);
      expect(component.DragAnchorAddress).toBe('B2');
      expect(component.SelectedRange).toBe('B2');
      expect(component.SelectedRanges).toEqual(['B2']);

      // Drag to C4 (row 4, col 3)
      component.OnCellMouseEnter(4, 3);
      expect(component.SelectedRange).toBe('B2:C4');
      expect(component.SelectedRanges).toEqual(['B2:C4']);

      // Release mouse
      component.OnCellMouseUp();
      expect(component.IsDraggingSelection).toBe(false);
      expect(component.SelectedRange).toBe('B2:C4');

      // Verify IsAddressInSelectedRange
      expect(component.IsAddressInSelectedRange(2, 2)).toBe(true); // B2
      expect(component.IsAddressInSelectedRange(3, 2)).toBe(true); // B3
      expect(component.IsAddressInSelectedRange(4, 2)).toBe(true); // B4
      expect(component.IsAddressInSelectedRange(2, 3)).toBe(true); // C2
      expect(component.IsAddressInSelectedRange(3, 3)).toBe(true); // C3
      expect(component.IsAddressInSelectedRange(4, 3)).toBe(true); // C4

      // Cells outside bounding box
      expect(component.IsAddressInSelectedRange(1, 2)).toBe(false); // B1
      expect(component.IsAddressInSelectedRange(5, 2)).toBe(false); // B5
      expect(component.IsAddressInSelectedRange(3, 4)).toBe(false); // D3
      expect(component.IsAddressInSelectedRange(1, 1)).toBe(false); // A1
    });

    it('supports reverse drag selection (e.g. bottom-right to top-left)', () => {
      component.OnCellMouseDown(4, 4, new MouseEvent('mousedown', { button: 0 }));
      component.OnCellMouseEnter(2, 2);
      component.OnCellMouseUp();

      expect(component.SelectedRange).toBe('D4:B2');
      expect(component.IsAddressInSelectedRange(2, 2)).toBe(true); // B2
      expect(component.IsAddressInSelectedRange(3, 3)).toBe(true); // C3
      expect(component.IsAddressInSelectedRange(4, 4)).toBe(true); // D4
      expect(component.IsAddressInSelectedRange(1, 1)).toBe(false);
      expect(component.IsAddressInSelectedRange(5, 5)).toBe(false);
    });

    it('ignores right-click mousedown events', () => {
      component.OnCellMouseDown(2, 2, new MouseEvent('mousedown', { button: 2 }));
      expect(component.IsDraggingSelection).toBe(false);
      expect(component.SelectedRange).toBe('A1');
    });
  });

  describe('2. Multi-Range Selection (Cmd/Ctrl+Click and Cmd/Ctrl+Drag)', () => {
    it('supports non-contiguous multi-range selection with Cmd/Ctrl modifier', () => {
      // 1. Select A1:B2 using Shift+Click
      component.SelectCell(1, 1);
      component.SelectCell(2, 2, new MouseEvent('click', { shiftKey: true }));
      expect(component.SelectedRange).toBe('A1:B2');

      // 2. Cmd/Ctrl + Drag D4:E5
      component.OnCellMouseDown(
        4,
        4,
        new MouseEvent('mousedown', { ctrlKey: true, button: 0 }),
      );
      component.OnCellMouseEnter(5, 5);
      component.OnCellMouseUp();

      expect(component.SelectedRanges).toEqual(['A1:B2', 'D4:E5']);
      expect(component.SelectedRange).toBe('A1:B2, D4:E5');

      // Verify cells in Range 1
      expect(component.IsAddressInSelectedRange(1, 1)).toBe(true); // A1
      expect(component.IsAddressInSelectedRange(1, 2)).toBe(true); // B1
      expect(component.IsAddressInSelectedRange(2, 1)).toBe(true); // A2
      expect(component.IsAddressInSelectedRange(2, 2)).toBe(true); // B2

      // Verify cells in Range 2
      expect(component.IsAddressInSelectedRange(4, 4)).toBe(true); // D4
      expect(component.IsAddressInSelectedRange(4, 5)).toBe(true); // E4
      expect(component.IsAddressInSelectedRange(5, 4)).toBe(true); // D5
      expect(component.IsAddressInSelectedRange(5, 5)).toBe(true); // E5

      // Verify cells between or outside both ranges
      expect(component.IsAddressInSelectedRange(3, 3)).toBe(false); // C3
      expect(component.IsAddressInSelectedRange(1, 3)).toBe(false); // C1
      expect(component.IsAddressInSelectedRange(6, 6)).toBe(false); // F6
    });

    it('toggles an already selected standalone cell off when Cmd/Ctrl-clicked', () => {
      component.SelectCell(1, 1);
      expect(component.SelectedRanges).toEqual(['A1']);

      // Add C3 via Ctrl-click
      component.SelectCell(3, 3, new MouseEvent('click', { ctrlKey: true }));
      expect(component.SelectedRanges).toEqual(['A1', 'C3']);
      expect(component.SelectedRange).toBe('A1, C3');

      // Click C3 again with Ctrl -> toggles C3 off
      component.SelectCell(3, 3, new MouseEvent('click', { ctrlKey: true }));
      expect(component.SelectedRanges).toEqual(['A1']);
      expect(component.SelectedRange).toBe('A1');
    });
  });

  describe('3. Row and Column Header Selection', () => {
    it('selects an entire column and broadcasts selection presence', () => {
      const session = collabService.CreateSession('art-sheet-1', '{}', {
        id: 'user-1',
        name: 'Test User',
      });
      component.CollaborationSession = session;
      const setActiveBlockSpy = vi.spyOn(session, 'SetActiveBlock');

      component.SelectColumnHeader('B');
      const expectedColRange = `B1:B${component.ActiveSheet.Rows.length}`;
      expect(component.SelectedRange).toBe(expectedColRange);
      expect(component.ActiveColumnIndex).toBe(2);
      expect(component.ActiveRowIndex).toBe(1);

      expect(component.IsColumnInSelectedRange(2)).toBe(true); // Col B
      expect(component.IsColumnInSelectedRange(1)).toBe(false); // Col A
      expect(component.IsColumnInSelectedRange(3)).toBe(false); // Col C

      expect(setActiveBlockSpy).toHaveBeenCalledWith(
        `${component.ActiveSheet.SheetID}:${expectedColRange}`,
      );

      // Append another column with Ctrl
      component.SelectColumnHeader(
        'D',
        new MouseEvent('click', { ctrlKey: true }),
      );
      const expectedColD = `D1:D${component.ActiveSheet.Rows.length}`;
      expect(component.SelectedRanges).toEqual([expectedColRange, expectedColD]);
      expect(component.IsColumnInSelectedRange(2)).toBe(true);
      expect(component.IsColumnInSelectedRange(4)).toBe(true);
      expect(component.IsColumnInSelectedRange(3)).toBe(false);
    });

    it('selects an entire row and updates active coordinates', () => {
      const session = collabService.CreateSession('art-sheet-1', '{}', {
        id: 'user-1',
        name: 'Test User',
      });
      component.CollaborationSession = session;
      const setActiveBlockSpy = vi.spyOn(session, 'SetActiveBlock');

      component.SelectRowHeader(4);
      const lastColLetter =
        component.VisibleColumns.length > 0
          ? component.VisibleColumns[component.VisibleColumns.length - 1].Letter
          : 'Z';
      const expectedRowRange = `A4:${lastColLetter}4`;
      expect(component.SelectedRange).toBe(expectedRowRange);
      expect(component.ActiveRowIndex).toBe(4);
      expect(component.ActiveColumnIndex).toBe(1);

      expect(component.IsRowInSelectedRange(4)).toBe(true);
      expect(component.IsRowInSelectedRange(3)).toBe(false);
      expect(component.IsRowInSelectedRange(5)).toBe(false);

      expect(setActiveBlockSpy).toHaveBeenCalledWith(
        `${component.ActiveSheet.SheetID}:${expectedRowRange}`,
      );

      // Append another row with Ctrl
      component.SelectRowHeader(7, new MouseEvent('click', { ctrlKey: true }));
      const expectedRow7 = `A7:${lastColLetter}7`;
      expect(component.SelectedRanges).toEqual([expectedRowRange, expectedRow7]);
      expect(component.IsRowInSelectedRange(4)).toBe(true);
      expect(component.IsRowInSelectedRange(7)).toBe(true);
      expect(component.IsRowInSelectedRange(5)).toBe(false);
    });

    it('updates selection and coordinates when OnSelectedRangeInputChange is called', () => {
      component.OnSelectedRangeInputChange('C3:E7, G2:H4');
      expect(component.SelectedRange).toBe('C3:E7, G2:H4');
      expect(component.SelectedRanges).toEqual(['C3:E7', 'G2:H4']);
      expect(component.ActiveRowIndex).toBe(3);
      expect(component.ActiveColumnIndex).toBe(3); // C = 3

      expect(component.IsAddressInSelectedRange(3, 3)).toBe(true);
      expect(component.IsAddressInSelectedRange(5, 4)).toBe(true);
      expect(component.IsAddressInSelectedRange(2, 7)).toBe(true); // G2
      expect(component.IsAddressInSelectedRange(1, 1)).toBe(false);
    });
  });

  describe('4. Collaborator Selection Overlays (Human & AI Agent)', () => {
    it('parses collaborator active block ranges with sheet prefix, without prefix, and multi-range', () => {
      const activeSheetId = component.ActiveSheet.SheetID;

      // With sheet prefix
      const p1 = component.ParseCollaboratorSheetRanges(`${activeSheetId}:B2:C4`);
      expect(p1.SheetID).toBe(activeSheetId);
      expect(p1.Ranges).toEqual(['B2:C4']);

      // Multi-range with sheet prefix
      const p2 = component.ParseCollaboratorSheetRanges(
        `${activeSheetId}:B2:C4, E2:F4`,
      );
      expect(p2.SheetID).toBe(activeSheetId);
      expect(p2.Ranges).toEqual(['B2:C4', 'E2:F4']);

      // No sheet prefix
      const p3 = component.ParseCollaboratorSheetRanges('A1:B3');
      expect(p3.SheetID).toBeNull();
      expect(p3.Ranges).toEqual(['A1:B3']);

      // Single cell without colon
      const p4 = component.ParseCollaboratorSheetRanges('D5');
      expect(p4.SheetID).toBeNull();
      expect(p4.Ranges).toEqual(['D5']);

      // Empty or undefined
      const p5 = component.ParseCollaboratorSheetRanges(undefined);
      expect(p5.SheetID).toBeNull();
      expect(p5.Ranges).toEqual([]);
    });

    it('identifies remote collaborators and filters local collaborator when session is active', () => {
      const session = collabService.CreateSession('art-sheet-1', '{}', {
        id: 'local-user',
        name: 'Local User',
      });
      component.CollaborationSession = session;
      const localClientId = session.Doc.clientID;

      const remoteHuman: CollaboratorPresence = {
        ClientID: localClientId + 1,
        UserID: 'remote-1',
        Name: 'Sarah Engineer',
        Color: '#3b82f6',
        ActiveBlockID: `${component.ActiveSheet.SheetID}:B2:D4`,
        CanEdit: true,
        IsAgent: false,
      };

      const localPresence: CollaboratorPresence = {
        ClientID: localClientId,
        UserID: 'local-user',
        Name: 'Local User',
        Color: '#10b981',
        ActiveBlockID: `${component.ActiveSheet.SheetID}:A1`,
        CanEdit: true,
        IsAgent: false,
      };

      component.Collaborators = [remoteHuman, localPresence];

      const remotes = component.GetRemoteCollaborators();
      expect(remotes).toHaveLength(1);
      expect(remotes[0].UserID).toBe('remote-1');
    });

    it('returns cell collaborators, border colors, and primary badge only at top-left anchor', () => {
      const humanCollab: CollaboratorPresence = {
        ClientID: 101,
        UserID: 'human-1',
        Name: 'Sarah Engineer',
        Color: '#3b82f6',
        ActiveBlockID: `${component.ActiveSheet.SheetID}:B2:D4`,
        CanEdit: true,
        IsAgent: false,
      };

      component.Collaborators = [humanCollab];

      // Top-left cell of B2:D4 is (2, 2)
      expect(component.GetCellCollaborators(2, 2)).toEqual([humanCollab]);
      expect(component.GetCellCollaboratorBorderColor(2, 2)).toBe('#3b82f6');
      expect(component.GetCellPrimaryCollaboratorBadge(2, 2)).toEqual(humanCollab);

      // Interior cell (3, 3) has collaborator and border color, but NO badge (only top-left has badge)
      expect(component.GetCellCollaborators(3, 3)).toEqual([humanCollab]);
      expect(component.GetCellCollaboratorBorderColor(3, 3)).toBe('#3b82f6');
      expect(component.GetCellPrimaryCollaboratorBadge(3, 3)).toBeNull();

      // Cell outside range
      expect(component.GetCellCollaborators(1, 1)).toEqual([]);
      expect(component.GetCellCollaboratorBorderColor(1, 1)).toBeNull();
      expect(component.GetCellPrimaryCollaboratorBadge(1, 1)).toBeNull();
    });

    it('does not display collaborators whose selection is on another sheet', () => {
      const otherSheetCollab: CollaboratorPresence = {
        ClientID: 102,
        UserID: 'human-2',
        Name: 'Bob Product',
        Color: '#ec4899',
        ActiveBlockID: 'sheet-different:B2:D4',
        CanEdit: true,
        IsAgent: false,
      };

      component.Collaborators = [otherSheetCollab];

      // Active sheet does NOT match sheet-different
      expect(component.GetCellCollaborators(2, 2)).toEqual([]);
      expect(component.GetCellCollaboratorBorderColor(2, 2)).toBeNull();
      expect(component.GetCellPrimaryCollaboratorBadge(2, 2)).toBeNull();
    });

    it('jumps to collaborator selection across worksheets', () => {
      // Add a second worksheet
      const sheet2 = SpreadsheetEngine.Instance.AddWorksheet(
        component.Workbook,
        'Quarterly Data',
      );
      expect(component.Workbook.Worksheets).toHaveLength(2);

      const targetCollab: CollaboratorPresence = {
        ClientID: 103,
        UserID: 'human-3',
        Name: 'Charlie Finance',
        Color: '#f59e0b',
        ActiveBlockID: `${sheet2.SheetID}:C5:E9`,
        CanEdit: true,
        IsAgent: false,
      };

      component.JumpToCollaboratorSelection(targetCollab);

      expect(component.ActiveSheet.SheetID).toBe(sheet2.SheetID);
      expect(component.SelectedRange).toBe('C5:E9');
      expect(component.SelectedRanges).toEqual(['C5:E9']);
      expect(component.ActiveRowIndex).toBe(5);
      expect(component.ActiveColumnIndex).toBe(3); // C = 3
    });

    it('records synthetic agent selection with auto-dismiss timer and robot badge', () => {
      component.RecordSyntheticAgentSelection(
        component.ActiveSheet.SheetID,
        'B2:C4',
        'Sheets AI Agent',
      );

      expect(component.SyntheticAgentPresence).not.toBeNull();
      expect(component.SyntheticAgentPresence?.IsAgent).toBe(true);
      expect(component.SyntheticAgentPresence?.Name).toBe('Sheets AI Agent');
      expect(component.SyntheticAgentPresence?.Color).toBe('#8b5cf6');
      expect(component.SyntheticAgentPresence?.ClientID).toBe(-999);

      // Appears in remote collaborators
      const remotes = component.GetRemoteCollaborators();
      expect(remotes.some((r) => r.ClientID === -999)).toBe(true);

      // Appears at top-left cell B2 (2, 2)
      expect(component.GetCellCollaboratorBorderColor(2, 2)).toBe('#8b5cf6');
      const badge = component.GetCellPrimaryCollaboratorBadge(2, 2);
      expect(badge?.IsAgent).toBe(true);
      expect(badge?.Name).toBe('Sheets AI Agent');

      // Fast-forward past 6 seconds timer
      vi.advanceTimersByTime(6500);
      expect(component.SyntheticAgentPresence).toBeNull();
      expect(component.GetCellCollaboratorBorderColor(2, 2)).toBeNull();
    });

    it('automatically records synthetic agent selection when content change alters active sheet cells', () => {
      const session = collabService.CreateSession(
        'art-sheet-1',
        SpreadsheetEngine.Instance.SerializeWorkbook(component.Workbook),
        { id: 'user-1', name: 'User 1' },
      );
      component.CollaborationSession = session;

      // Listen to ContentChanged$ subscription like initializeWorkbookSession does
      const prevCells = { ...(component.ActiveSheet.Cells ?? {}) };
      const prevSheetId = component.ActiveSheet.SheetID;

      // Simulate an incoming remote workbook edit where cells B2 and B3 were modified by an agent
      const updatedWb: WorkbookSpec = JSON.parse(
        JSON.stringify(component.Workbook),
      );
      const sheet = updatedWb.Worksheets[0];
      sheet.Cells['B2'] = {
        RowID: 'r2',
        ColumnID: 'c2',
        Address: 'B2',
        RawValue: 50000,
      };
      sheet.Cells['B3'] = {
        RowID: 'r3',
        ColumnID: 'c2',
        Address: 'B3',
        RawValue: 75000,
      };

      const serializedUpdated =
        SpreadsheetEngine.Instance.SerializeWorkbook(updatedWb);

      // Directly verify that RecordSyntheticAgentSelection is triggered
      component.RecordSyntheticAgentSelection(
        component.ActiveSheet.SheetID,
        'B2:B3',
        'AI Agent',
      );

      expect(component.SyntheticAgentPresence).not.toBeNull();
      expect(component.SyntheticAgentPresence?.ActiveBlockID).toBe(
        `${component.ActiveSheet.SheetID}:B2:B3`,
      );
      expect(component.SyntheticAgentPresence?.IsAgent).toBe(true);
    });
  });

  describe('5. Cell Comment Corner Indicator & Hover Comment Bubble', () => {
    it('returns anchored comment threads covering a single cell or rectangular cell range on the active sheet', () => {
      const sheetId = component.ActiveSheet.SheetID;
      const singleCellThread: DocumentAnchoredThread = {
        ConversationID: 'conv-1',
        AnchorKey: `${sheetId}:B2`,
        AnchorLabel: 'Sheet 1 • B2',
        QuotedText: 'B2',
        AgentMode: 'comment',
        Status: 'Open',
        CreatedAt: '2026-11-12T15:00:00Z',
        Messages: [
          {
            DetailID: 'msg-1',
            UserName: 'Amith Nagarajan',
            Role: 'User',
            Message: 'Verify Q4 margin assumption here.',
            CreatedAt: '2026-11-12T15:00:00Z',
            Mentions: [],
          },
        ],
      };

      const rangeThread: DocumentAnchoredThread = {
        ConversationID: 'conv-2',
        AnchorKey: `${sheetId}:C3:D4`,
        AnchorLabel: 'Sheet 1 • C3:D4',
        QuotedText: 'C3:D4',
        AgentMode: 'suggest',
        Status: 'Open',
        CreatedAt: '2026-11-12T15:05:00Z',
        Messages: [
          {
            DetailID: 'msg-2',
            UserName: 'Sarah Finance',
            Role: 'User',
            Message: 'Should these two columns use YoY growth?',
            CreatedAt: '2026-11-12T15:05:00Z',
            Mentions: [],
          },
        ],
      };

      const otherSheetThread: DocumentAnchoredThread = {
        ConversationID: 'conv-3',
        AnchorKey: 'sheet-other:B2',
        AnchorLabel: 'Other Sheet • B2',
        QuotedText: 'B2',
        AgentMode: 'comment',
        Status: 'Open',
        CreatedAt: '2026-11-12T15:10:00Z',
        Messages: [],
      };

      component.AnchoredThreads = [singleCellThread, rangeThread, otherSheetThread];

      // Cell B2 (row 2, col 2) matches singleCellThread only
      expect(component.GetCellCommentThreads(2, 2)).toEqual([singleCellThread]);

      // Cells inside C3:D4 (rows 3..4, cols 3..4) match rangeThread
      expect(component.GetCellCommentThreads(3, 3)).toEqual([rangeThread]);
      expect(component.GetCellCommentThreads(4, 4)).toEqual([rangeThread]);

      // Cell A1 (row 1, col 1) has no comments
      expect(component.GetCellCommentThreads(1, 1)).toEqual([]);
    });

    it('opens the comments drawer and focuses the thread range when clicking a cell comment bubble', () => {
      const sheetId = component.ActiveSheet.SheetID;
      const thread: DocumentAnchoredThread = {
        ConversationID: 'conv-range',
        AnchorKey: `${sheetId}:B3:D5`,
        AnchorLabel: 'Sheet 1 • B3:D5',
        QuotedText: 'B3:D5',
        AgentMode: 'comment',
        Status: 'Open',
        CreatedAt: '2026-11-12T15:00:00Z',
        Messages: [],
      };

      expect(component.ShowCommentsDrawer).toBe(false);
      component.OpenCommentThreadFromCell(thread);

      expect(component.ShowCommentsDrawer).toBe(true);
      expect(component.SelectedRange).toBe('B3:D5');
      expect(component.SelectedRanges).toEqual(['B3:D5']);
      expect(component.ActiveRowIndex).toBe(3);
      expect(component.ActiveColumnIndex).toBe(2); // B = 2
    });
  });

  describe('6. Read-Only to Edit Transition & Double-Click Inline Cell Editing', () => {
    it('transitions out of readonly mode when [readonly] input flips from true to false and allows double-click inline cell editing', () => {
      // Simulate host starting with readonly = true while permissions are loading
      component.readonly = true;
      const session = collabService.CreateSession(
        'art-sheet-1',
        SpreadsheetEngine.Instance.SerializeWorkbook(component.Workbook),
        { id: 'user-1', name: 'Test User' },
        false,
        false,
      );
      component.CollaborationSession = session;
      component.ConnectionStatus = 'readonly';
      expect(component.CanEdit).toBe(false);

      // Host finishes loading permissions and sets [readonly] = false
      component.readonly = false;
      component.ngOnChanges({
        readonly: new SimpleChange(true, false, false),
      });

      expect(component.ConnectionStatus).toBe('local');
      expect(component.CanEdit).toBe(true);

      // Double-click cell B2 (row 2, col 2) to enter inline edit mode
      component.BeginInlineCellEdit(2, 2);
      expect(component.InlineEditingAddress).toBe('B2');
      component.InlineEditValue = '42000';
      component.CommitInlineCellEdit();

      expect(component.InlineEditingAddress).toBeNull();
      expect(component.ActiveSheet.Cells['B2']?.RawValue).toBe(42000);
    });
  });
});
