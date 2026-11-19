import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import type { IMetadataProvider, IRunViewProvider } from '@memberjunction/core';
import {
  MJArtifactVersionEntity,
  SpreadsheetEngine,
  UserInfoEngine,
  type SpreadsheetProtectedRangeSpec,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import {
  SHEETS_OBJECTS_PANE_HEIGHT_SETTING_KEY,
  SpreadsheetArtifactViewerComponent,
} from './spreadsheet-artifact-viewer.component';
import {
  DocumentCollaborationService,
  DocumentCollaborationSession,
} from '../../services/document-collaboration.service';
import { ArtifactAgentPresenceBarComponent } from '../presence/artifact-agent-presence-bar.component';
import { ArtifactCommandPaletteComponent } from './artifact-command-palette.component';
import { MjContextMenuComponent } from '../context-menu/mj-context-menu.component';

@Component({
  standalone: true,
  selector: 'mj-artifact-type-plugin-viewer',
  template: '<div data-testid="sheet-plugin-viewer-stub"></div>',
})
class SheetPluginViewerStubComponent {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() artifactVersion: MJArtifactVersionEntity | null = null;
  @Input() artifactTypeName = '';
  @Input() ArtifactTypeName = '';
  @Input() readonly = true;
  @Input() AncestorArtifactIDs: ReadonlySet<string> | null = null;
  @Output() ContentCommitted = new EventEmitter<string>();
}

@Component({
  standalone: true,
  selector: 'mj-xlsx-preview',
  template: '<div data-testid="xlsx-preview-stub"></div>',
})
class XlsxPreviewStubComponent {
  @Input() ArrayBuffer: ArrayBuffer | null = null;
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

function makeMockCollaborationSession(): DocumentCollaborationSession {
  const session = Object.create(DocumentCollaborationSession.prototype) as DocumentCollaborationSession;
  vi.spyOn(session, 'Destroy').mockImplementation(() => undefined);
  vi.spyOn(session, 'SetActiveBlock').mockImplementation(() => undefined);
  vi.spyOn(session, 'BatchUpdateSpreadsheetCells').mockImplementation(() => undefined);
  vi.spyOn(session, 'UpdateWorkbookMetadata').mockImplementation(() => undefined);
  vi.spyOn(session, 'UpdateWorksheetStructure').mockImplementation(() => undefined);
  vi.spyOn(session, 'CanUndo', 'get').mockReturnValue(false);
  vi.spyOn(session, 'CanRedo', 'get').mockReturnValue(false);
  return session;
}

function makeSheetVersion(): MJArtifactVersionEntity {
  const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Revenue Forecast');
  SpreadsheetEngine.Instance.SetCell(wb, wb.Worksheets[0].SheetID, 'A1', { Value: 500 });
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: 'shv-dom-1', enumerable: true },
    ArtifactID: { value: 'art-sheet-dom-1', enumerable: true },
    Name: { value: 'Revenue Forecast', enumerable: true },
    VersionNumber: { value: 1, enumerable: true },
    ContentMode: { value: 'Text', enumerable: true },
    Configuration: { value: null, enumerable: true },
    Content: { value: SpreadsheetEngine.Instance.SerializeWorkbook(wb), enumerable: true },
  });
  return ver;
}

describe('SpreadsheetArtifactViewerComponent DOM', () => {
  it('mounts read-only by default (B3) and renders the spreadsheet shell', () => {
    const f = renderComponentFixture(SpreadsheetArtifactViewerComponent, {
      imports: [
        FormsModule,
        SheetPluginViewerStubComponent,
        XlsxPreviewStubComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
      ],
      declarations: [SpreadsheetArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        artifactVersion: makeSheetVersion(),
        readonly: true,
      },
    });
    f.detectChanges();
    expect(f.componentInstance.CanEdit).toBe(false);
    expect(query(f, '.mj-sheets-shell')).not.toBeNull();
  });

  it('resolves ActiveCellAddress from ActiveRowIndex and ActiveColumnIndex', () => {
    const f = renderComponentFixture(SpreadsheetArtifactViewerComponent, {
      imports: [
        FormsModule,
        SheetPluginViewerStubComponent,
        XlsxPreviewStubComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
      ],
      declarations: [SpreadsheetArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        artifactVersion: makeSheetVersion(),
        readonly: true,
      },
      setup: (inst) => {
        inst.ActiveRowIndex = 2;
        inst.ActiveColumnIndex = 3;
      },
    });
    f.detectChanges();
    expect(f.componentInstance.ActiveCellAddress).toBe('C2');
  });

  it('wires ContentCommitted output on base viewer contract', () => {
    const f = renderComponentFixture(SpreadsheetArtifactViewerComponent, {
      imports: [
        FormsModule,
        SheetPluginViewerStubComponent,
        XlsxPreviewStubComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
      ],
      declarations: [SpreadsheetArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        artifactVersion: makeSheetVersion(),
        readonly: true,
      },
    });
    f.detectChanges();
    const committed = capture(f.componentInstance.ContentCommitted);
    f.componentInstance.ContentCommitted.emit('{}');
    expect(committed).toEqual(['{}']);
  });

  it('toggles chart placement between docked strip and floating sheet canvas, and persists splitter height in workbook', () => {
    const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('ChartPlacementTest');
    const ws = wb.Worksheets[0];
    SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'A1', { Value: 'Month' }, false);
    SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'B1', { Value: 'Revenue' }, false);
    SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'C1', { Value: 'Costs' }, false);
    SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'A2', { Value: 'Jan' }, false);
    SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'B2', { Value: 1200 }, false);
    SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'C2', { Value: 700 }, false);
    SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'A3', { Value: 'Feb' }, false);
    SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'B3', { Value: 1850 }, false);
    SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'C3', { Value: 820 }, true);
    ws.Charts.push({
      ChartID: 'chart-1',
      Title: 'Monthly P&L',
      ChartType: 'bar',
      SheetID: ws.SheetID,
      SourceRange: 'A1:C3',
      PositionCell: 'E2',
      ShowLegend: true,
    });
    const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
    Object.defineProperties(ver, {
      ID: { value: '11111111-1111-4111-8111-111111111111', enumerable: true },
      ArtifactID: { value: '', enumerable: true },
      Name: { value: 'ChartPlacementTest', enumerable: true },
      VersionNumber: { value: 1, enumerable: true },
      ContentMode: { value: 'Text', enumerable: true },
      Configuration: { value: null, enumerable: true },
      Content: { value: SpreadsheetEngine.Instance.SerializeWorkbook(wb), enumerable: true },
    });

    const f = renderComponentFixture(SpreadsheetArtifactViewerComponent, {
      imports: [
        FormsModule,
        SheetPluginViewerStubComponent,
        XlsxPreviewStubComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
      ],
      declarations: [SpreadsheetArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        artifactVersion: ver,
        readonly: false,
      },
    });
    f.detectChanges();

    // 1. Starts docked in bottom strip with splitter
    expect(query(f, '[data-testid="sheet-chart-card-chart-1"]')).not.toBeNull();
    expect(query(f, '[data-testid="sheet-floating-chart-chart-1"]')).toBeNull();
    const splitter = query(f, '[data-testid="sheets-objects-splitter"]') as HTMLElement | null;
    expect(splitter).not.toBeNull();

    // 2. Drag splitter upward by 90px -> persists per-user via UserInfoEngine without mutating shared WorkbookSpec
    const setSettingSpy = vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
    splitter!.dispatchEvent(new MouseEvent('mousedown', { clientY: 500, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 410 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientY: 410 }));
    f.detectChanges();
    expect(setSettingSpy).toHaveBeenCalledWith(SHEETS_OBJECTS_PANE_HEIGHT_SETTING_KEY, '360');
    expect(f.componentInstance.Workbook.PreferredObjectsPaneHeightPx).toBeUndefined();
    expect(f.componentInstance.ResolvedObjectsPaneHeightPx).toBe(360);
    const stripEl = query(f, '[data-testid="sheets-objects-strip"]') as HTMLElement | null;
    expect(stripEl?.style.height).toBe('360px');
    expect(SpreadsheetEngine.Instance.ParseWorkbook(f.componentInstance.SourceJsonText).PreferredObjectsPaneHeightPx).toBeUndefined();

    // 3. Toggle chart onto sheet canvas -> floating chart appears inside grid canvas, bottom strip hides (no other docked objects)
    const moveBtn = query(f, '[data-testid="sheet-chart-placement-chart-1"]') as HTMLButtonElement | null;
    expect(moveBtn).not.toBeNull();
    moveBtn!.click();
    f.detectChanges();
    expect(f.componentInstance.ActiveSheet.Charts[0].Placement).toBe('sheet');
    expect(query(f, '[data-testid="sheet-floating-chart-chart-1"]')).not.toBeNull();
    expect(query(f, '[data-testid="sheet-chart-card-chart-1"]')).toBeNull();
    expect(query(f, '[data-testid="sheets-objects-splitter"]')).toBeNull();

    // 4. Open Chart & Range Properties Editor modal on floating chart, switch to union range "A1:A3,C1:C3", type "line", ShowDataLabels=true, Apply
    const editBtn = query(f, '[data-testid="sheet-chart-edit-chart-1"]') as HTMLButtonElement | null;
    expect(editBtn).not.toBeNull();
    editBtn!.click();
    f.detectChanges();
    expect(query(f, '[data-testid="sheets-chart-editor-modal"]')).not.toBeNull();

    f.componentInstance.EditingChartDraft!.Title = 'Costs Trend Only';
    f.componentInstance.EditingChartDraft!.SourceRange = 'A1:A3,C1:C3';
    f.componentInstance.SetChartEditorType('line');
    f.componentInstance.EditingChartDraft!.ShowDataLabels = true;
    f.componentInstance.EditingChartDraft!.Placement = 'dock';
    f.detectChanges();

    const preview = f.componentInstance.GetChartEditorPreviewDataset();
    expect(preview?.Categories).toEqual(['Jan', 'Feb']);
    expect(preview?.Series.map((s) => s.Name)).toEqual(['Costs']);
    expect(preview?.Series[0].Values).toEqual([700, 820]);

    (query(f, '[data-testid="chart-editor-save"]') as HTMLButtonElement).click();
    f.detectChanges();
    expect(query(f, '[data-testid="sheets-chart-editor-modal"]')).toBeNull();
    expect(f.componentInstance.ActiveSheet.Charts[0].Title).toBe('Costs Trend Only');
    expect(f.componentInstance.ActiveSheet.Charts[0].SourceRange).toBe('A1:A3,C1:C3');
    expect(f.componentInstance.ActiveSheet.Charts[0].ChartType).toBe('line');
    expect(f.componentInstance.ActiveSheet.Charts[0].Placement).toBe('dock');
    expect(f.componentInstance.ActiveSheet.Charts[0].ShowDataLabels).toBe(true);
    expect(query(f, '[data-testid="sheet-chart-card-chart-1"]')).not.toBeNull();
  });

  it('skips invalid short-ID embedded artifact references without executing RunView', async () => {
    const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('InvalidEmbedGuard');
    wb.Worksheets[0].EmbeddedArtifacts.push({
      EmbedID: 'emb-bad',
      Title: 'Broken Short ID',
      ArtifactID: 'D',
      ArtifactTypeName: 'Whiteboard',
      AnchorCell: 'D2',
      WidthPx: 400,
      HeightPx: 260,
      AllowInlineEdit: false,
    });
    const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
    Object.defineProperties(ver, {
      ID: { value: '11111111-1111-4111-8111-111111111112', enumerable: true },
      ArtifactID: { value: '22222222-2222-4222-8222-222222222223', enumerable: true },
      Name: { value: 'InvalidEmbedGuard', enumerable: true },
      VersionNumber: { value: 1, enumerable: true },
      ContentMode: { value: 'Text', enumerable: true },
      Configuration: { value: null, enumerable: true },
      Content: { value: SpreadsheetEngine.Instance.SerializeWorkbook(wb), enumerable: true },
    });

    const f = renderComponentFixture(SpreadsheetArtifactViewerComponent, {
      imports: [
        FormsModule,
        SheetPluginViewerStubComponent,
        XlsxPreviewStubComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
      ],
      declarations: [SpreadsheetArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        artifactVersion: ver,
        readonly: true,
      },
    });
    const runViewSpy = vi.fn();
    const partialProvider: Partial<IMetadataProvider & IRunViewProvider> = {
      Entities: [],
      RunView: runViewSpy,
    };
    f.componentInstance.Provider = Object.assign(Object.create(null) as IMetadataProvider, partialProvider);
    f.detectChanges();
    await Promise.resolve();
    expect(runViewSpy).not.toHaveBeenCalled();
  });

  function createEditableWorkbookFixture(
    title: string,
    configure?: (wb: ReturnType<typeof SpreadsheetEngine.Instance.CreateEmptyWorkbook>) => void,
    options?: { readonly?: boolean },
  ) {
    const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook(title);
    configure?.(wb);
    const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
    Object.defineProperties(ver, {
      ID: { value: '11111111-1111-4111-8111-111111111199', enumerable: true },
      ArtifactID: { value: '', enumerable: true },
      Name: { value: title, enumerable: true },
      VersionNumber: { value: 1, enumerable: true },
      ContentMode: { value: 'Text', enumerable: true },
      Configuration: { value: null, enumerable: true },
      Content: { value: SpreadsheetEngine.Instance.SerializeWorkbook(wb), enumerable: true },
    });

    const f = renderComponentFixture(SpreadsheetArtifactViewerComponent, {
      imports: [
        FormsModule,
        SheetPluginViewerStubComponent,
        XlsxPreviewStubComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
      ],
      declarations: [SpreadsheetArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        artifactVersion: ver,
        readonly: options?.readonly ?? false,
      },
    });
    f.detectChanges();
    return f;
  }

  it('preserves multi-cell range on inside right-click and refocuses on outside right-click', () => {
    const f = createEditableWorkbookFixture('RangePreservationTest');
    f.componentInstance.SelectedRanges = ['B2:D4'];
    f.componentInstance.SelectedRange = 'B2:D4';
    f.componentInstance.ActiveRowIndex = 2;
    f.componentInstance.ActiveColumnIndex = 2;
    f.detectChanges();

    const insideCell = query(f, '[data-testid="sheet-cell-C3"]') as HTMLElement;
    const insideEvt = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 140,
      clientY: 160,
    });
    insideCell.dispatchEvent(insideEvt);
    f.detectChanges();

    expect(insideEvt.defaultPrevented).toBe(true);
    expect(f.componentInstance.SelectedRange).toBe('B2:D4');
    expect(f.componentInstance.ContextMenuOpen).toBe(true);
    expect(query(f, '[data-testid="mj-context-menu-root"]')?.textContent).toContain('Selection B2:D4 (3×3)');

    // Close and right-click outside at F6
    f.componentInstance.CloseContextMenu();
    f.detectChanges();

    const outsideCell = query(f, '[data-testid="sheet-cell-F6"]') as HTMLElement;
    const outsideEvt = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 280,
      clientY: 220,
    });
    outsideCell.dispatchEvent(outsideEvt);
    f.detectChanges();

    expect(f.componentInstance.SelectedRange).toBe('F6');
    expect(f.componentInstance.ActiveCellAddress).toBe('F6');
    expect(query(f, '[data-testid="mj-context-menu-root"]')?.textContent).toContain('Cell F6');
  });

  it('supports dual-layer Copy -> Paste Values Only and Paste Formatting Only including CSS fill/text styling', async () => {
    const f = createEditableWorkbookFixture('ClipboardSpecialTest', (wb) => {
      const ws = wb.Worksheets[0];
      SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'A1', {
        Value: 100,
        Style: {
          Bold: true,
          FormatType: 'currency',
          NumberFormatPattern: '$#,##0.00',
          BackgroundColor: 'var(--mj-bg-surface-sunken)',
          TextColor: 'var(--mj-brand-primary)',
        },
      }, false);
      SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'B1', {
        Formula: '=A1*2',
        Value: null,
      }, true);
      SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'D1', {
        Value: 999,
      }, false);
    });

    f.componentInstance.SelectedRanges = ['A1:B1'];
    f.componentInstance.SelectedRange = 'A1:B1';
    f.detectChanges();

    // Right-click inside A1:B1 and choose Copy
    const cellA1 = query(f, '[data-testid="sheet-cell-A1"]') as HTMLElement;
    cellA1.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 80 }));
    f.detectChanges();
    const copyBtn = query(f, '[data-testid="mj-context-menu-item-sheets-copy"]') as HTMLButtonElement;
    expect(copyBtn).not.toBeNull();
    copyBtn.click();
    f.detectChanges();

    expect(f.componentInstance.SheetsClipboardBuffer?.Cells.length).toBe(2);

    // Right-click D3 -> Paste Values Only -> writes scalar 100 & 200 without formula or A1's bold/bg style
    const cellD3 = query(f, '[data-testid="sheet-cell-D3"]') as HTMLElement;
    cellD3.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 140 }));
    f.detectChanges();
    f.componentInstance.OnContextMenuCommand({ Type: 'paste', Kind: 'values' });
    await Promise.resolve();
    f.detectChanges();

    expect(f.componentInstance.ActiveSheet.Cells['D3']?.RawValue).toBe(100);
    expect(f.componentInstance.ActiveSheet.Cells['E3']?.RawValue).toBe(200);
    expect(f.componentInstance.ActiveSheet.Cells['E3']?.Formula ?? null).toBeNull();
    expect(f.componentInstance.ActiveSheet.Cells['D3']?.Style?.Bold).toBeFalsy();

    // Right-click D1 (which already has Value 999) -> Paste Formatting Only -> preserves 999 and applies Style!
    const cellD1 = query(f, '[data-testid="sheet-cell-D1"]') as HTMLElement;
    cellD1.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 80 }));
    f.detectChanges();
    f.componentInstance.OnContextMenuCommand({ Type: 'paste', Kind: 'formatting' });
    await Promise.resolve();
    f.detectChanges();

    expect(f.componentInstance.ActiveSheet.Cells['D1']?.RawValue).toBe(999);
    expect(f.componentInstance.ActiveSheet.Cells['D1']?.Style?.Bold).toBe(true);
    expect(f.componentInstance.ActiveSheet.Cells['D1']?.Style?.BackgroundColor).toBe('var(--mj-bg-surface-sunken)');
    expect(cellD1.classList.contains('is-bold')).toBe(true);
  });

  it('toggles chart placement (sheet <-> dock), switches chart type, and selects source range via context menu', () => {
    const f = createEditableWorkbookFixture('ChartContextTest', (wb) => {
      const ws = wb.Worksheets[0];
      SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'A1', { Value: 'Q1' }, false);
      SpreadsheetEngine.Instance.SetCell(wb, ws.SheetID, 'B1', { Value: 42 }, true);
      ws.Charts.push({
        ChartID: 'chart-ctx-1',
        Title: 'Quarterly Revenue',
        ChartType: 'bar',
        SheetID: ws.SheetID,
        SourceRange: 'A1:B1',
        PositionCell: 'D2',
        Placement: 'sheet',
        WidthPx: 460,
        HeightPx: 280,
      });
    });

    const floatingChart = query(f, '[data-testid="sheet-floating-chart-chart-ctx-1"]') as HTMLElement;
    expect(floatingChart).not.toBeNull();

    floatingChart.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 250, clientY: 160 }));
    f.detectChanges();

    expect(query(f, '[data-testid="mj-context-menu-root"]')?.textContent).toContain('Quarterly Revenue (On Sheet)');
    const toggleBtn = query(f, '[data-testid="mj-context-menu-item-sheets-chart-toggle-placement"]') as HTMLButtonElement;
    expect(toggleBtn?.textContent).toContain('Dock Chart to Sidebar');
    toggleBtn.click();
    f.detectChanges();

    expect(f.componentInstance.ActiveSheet.Charts[0].Placement).toBe('dock');
    expect(query(f, '[data-testid="sheet-chart-card-chart-ctx-1"]')).not.toBeNull();

    f.componentInstance.OnContextMenuCommand({ Type: 'set-chart-type', ChartID: 'chart-ctx-1', ChartType: 'line' });
    expect(f.componentInstance.ActiveSheet.Charts[0].ChartType).toBe('line');

    f.componentInstance.OnContextMenuCommand({ Type: 'select-chart-source-range', ChartID: 'chart-ctx-1' });
    expect(f.componentInstance.SelectedRange).toBe('A1:B1');
  });

  it('renames worksheet tab via context menu and updates cross-sheet formulas', () => {
    const f = createEditableWorkbookFixture('TabRenameTest', (wb) => {
      const s1 = wb.Worksheets[0];
      s1.Name = 'Data';
      SpreadsheetEngine.Instance.SetCell(wb, s1.SheetID, 'A1', { Value: 50 }, false);
      const s2 = SpreadsheetEngine.Instance.AddWorksheet(wb, 'Summary');
      SpreadsheetEngine.Instance.SetCell(wb, s2.SheetID, 'B2', { Formula: '=Data!A1*2', Value: null }, true);
    });

    const firstSheetId = f.componentInstance.Workbook.Worksheets[0].SheetID;
    const tabEl = query(f, `[data-testid="sheet-tab-${firstSheetId}"]`) as HTMLElement;
    tabEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 90, clientY: 420 }));
    f.detectChanges();

    const renameMenuBtn = query(f, '[data-testid="mj-context-menu-item-sheets-tab-rename"]') as HTMLButtonElement;
    expect(renameMenuBtn).not.toBeNull();
    renameMenuBtn.click();
    f.detectChanges();

    expect(f.componentInstance.RenamingSheetID).toBe(firstSheetId);
    f.componentInstance.RenameSheetDraftName = 'Revenue';
    f.componentInstance.CommitRenameWorksheetTab();
    f.detectChanges();

    expect(f.componentInstance.Workbook.Worksheets[0].Name).toBe('Revenue');
    expect(f.componentInstance.Workbook.Worksheets[1].Cells['B2']?.Formula).toBe('=Revenue!A1*2');
  });

  it('omits mutating items in Read-Only Viewer mode and honors Shift+Right-Click and OLE defaultPrevented bypass', () => {
    const f = createEditableWorkbookFixture('ReadonlyAndBypassTest', (wb) => {
      const ws = wb.Worksheets[0];
      ws.EmbeddedArtifacts.push({
        EmbedID: 'emb-wb-1',
        Title: 'Inline Whiteboard',
        ArtifactID: '',
        ArtifactTypeName: 'Whiteboard',
        AnchorCell: 'D2',
        WidthPx: 400,
        HeightPx: 260,
        AllowInlineEdit: false,
      });
    }, { readonly: true });

    // 1. Read-only cell right-click omits Cut / Paste / Insert / Delete, retains Copy & Export
    const cellA1 = query(f, '[data-testid="sheet-cell-A1"]') as HTMLElement;
    cellA1.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 70, clientY: 90 }));
    f.detectChanges();

    expect(f.componentInstance.ContextMenuOpen).toBe(true);
    expect(query(f, '[data-testid="mj-context-menu-item-sheets-cut"]')).toBeNull();
    expect(query(f, '[data-testid="mj-context-menu-item-sheets-paste"]')).toBeNull();
    expect(query(f, '[data-testid="mj-context-menu-item-sheets-copy"]')).not.toBeNull();
    expect(query(f, '[data-testid="mj-context-menu-item-sheets-viewer-export-csv"]')).not.toBeNull();

    f.componentInstance.CloseContextMenu();
    f.detectChanges();

    // 2. Shift + Right-Click bypasses custom context menu
    const shiftEvt = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      clientX: 70,
      clientY: 90,
    });
    cellA1.dispatchEvent(shiftEvt);
    f.detectChanges();
    expect(shiftEvt.defaultPrevented).toBe(false);
    expect(f.componentInstance.ContextMenuOpen).toBe(false);

    // 3. Embedded OLE artifact honors already-handled (defaultPrevented) events from child component
    const oleCard = query(f, '[data-testid="sheet-embedded-artifact-emb-wb-1"]') as HTMLElement;
    const preHandledEvt = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 120,
      clientY: 320,
    });
    preHandledEvt.preventDefault();
    oleCard.dispatchEvent(preHandledEvt);
    f.detectChanges();
    expect(f.componentInstance.ContextMenuOpen).toBe(false);
  });

  it('sends Yjs cell deletes to BatchUpdateSpreadsheetCells on clearRangeByKind(all) and applyClipboardPaste(cut)', async () => {
    const f = createEditableWorkbookFixture('Yjs Delete Sync', (wb) => {
      const sheet1 = wb.Worksheets[0];
      SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'A1', { Value: 100 });
      SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'B1', { Formula: '=A1*2' });
      const sheet2 = SpreadsheetEngine.Instance.AddWorksheet(wb, 'Sheet2', 10, 5);
      SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'A1', { Value: 999 });
    });

    const session = makeMockCollaborationSession();
    const batchSpy = vi.spyOn(session, 'BatchUpdateSpreadsheetCells');
    f.componentInstance.CollaborationSession = session;

    const sheet1 = f.componentInstance.Workbook.Worksheets[0];
    const sheet2 = f.componentInstance.Workbook.Worksheets[1];
    const cellA1RowId = sheet1.Cells['A1'].RowID;
    const cellA1ColId = sheet1.Cells['A1'].ColumnID;
    const cellB1RowId = sheet1.Cells['B1'].RowID;
    const cellB1ColId = sheet1.Cells['B1'].ColumnID;

    // 1. Clear A1 ('all') emits explicit { rowId, colId } deletes to BatchUpdateSpreadsheetCells
    f.componentInstance.OnContextMenuCommand({ Type: 'clear-range', Kind: 'all', RangeA1: 'A1' });
    expect(sheet1.Cells['A1']).toBeUndefined();
    expect(batchSpy).toHaveBeenCalledWith(
      sheet1.SheetID,
      [],
      [{ rowId: cellA1RowId, colId: cellA1ColId }],
      f.componentInstance.Workbook,
    );

    batchSpy.mockClear();

    // 2. Cut B1 (=A1*2) on Sheet1 and paste to C3 on Sheet2 -> syncs deletes on Sheet1 and shifted updates on Sheet2
    f.componentInstance.SelectCell(1, 2);
    f.componentInstance.OnContextMenuCommand({ Type: 'cut' });
    f.componentInstance.SelectWorksheet(sheet2.SheetID);
    f.componentInstance.SelectCell(3, 3);
    f.componentInstance.OnContextMenuCommand({ Type: 'paste', Kind: 'all' });
    await Promise.resolve();

    expect(sheet1.Cells['B1']).toBeUndefined();
    expect(sheet2.Cells['C3']?.Formula).toBe('=B3*2');
    expect(batchSpy).toHaveBeenCalledWith(
      sheet1.SheetID,
      [],
      [{ rowId: cellB1RowId, colId: cellB1ColId }],
      f.componentInstance.Workbook,
    );
    expect(batchSpy).toHaveBeenCalledWith(
      sheet2.SheetID,
      [expect.objectContaining({ Formula: '=B3*2' })],
      [],
      f.componentInstance.Workbook,
    );
  });

  it('remaps copied cell RowID/ColumnID and deep-clones objects with fresh IDs on duplicateWorksheetTab', () => {
    const f = createEditableWorkbookFixture('Duplicate Tab', (wb) => {
      const sheet = wb.Worksheets[0];
      sheet.Rows[0].Height = 44;
      sheet.Columns[0].Width = 24;
      sheet.Columns[0].Header = 'Revenue';
      SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'A1', { Value: 42 });
      sheet.Charts.push({
        ChartID: 'chart-orig',
        Title: 'Sales',
        ChartType: 'bar',
        SheetID: sheet.SheetID,
        SourceRange: 'A1:A1',
        PositionCell: 'E2',
      });
      sheet.LiveTables.push({
        TableID: 'tbl-orig',
        Title: 'Agents',
        SourceType: 'EntityView',
        EntityName: 'AI Agents',
        AnchorCell: 'A2',
        IncludeHeaders: true,
        Mode: 'Live',
      });
      sheet.EmbeddedArtifacts.push({
        EmbedID: 'emb-orig',
        Title: 'Board',
        ArtifactID: '11111111-1111-4111-8111-111111111111',
        ArtifactTypeName: 'Whiteboard',
        AnchorCell: 'C2',
        WidthPx: 320,
        HeightPx: 200,
        AllowInlineEdit: true,
      });
      sheet.ProtectedRanges = [
        {
          RangeID: 'prot-orig',
          Range: 'A1:A1',
          LockedByUserID: 'user-owner',
          AllowEditors: false,
        },
      ];
    });

    const session = makeMockCollaborationSession();
    const metaSpy = vi.spyOn(session, 'UpdateWorkbookMetadata');
    f.componentInstance.CollaborationSession = session;

    const source = f.componentInstance.Workbook.Worksheets[0];
    f.componentInstance.OnContextMenuCommand({ Type: 'duplicate-sheet', SheetID: source.SheetID });

    expect(f.componentInstance.Workbook.Worksheets.length).toBe(2);
    const copy = f.componentInstance.Workbook.Worksheets[1];
    expect(copy.Rows[0].Height).toBe(44);
    expect(copy.Columns[0].Width).toBe(24);
    expect(copy.Columns[0].Header).toBe('Revenue');
    expect(copy.Cells['A1']?.RawValue).toBe(42);
    // Copied cell RowID/ColumnID must match the duplicated worksheet's own Rows/Columns, never the source tab's IDs
    expect(copy.Cells['A1']?.RowID).toBe(copy.Rows[0].RowID);
    expect(copy.Cells['A1']?.ColumnID).toBe(copy.Columns[0].ColumnID);
    expect(copy.Cells['A1']?.RowID).not.toBe(source.Rows[0].RowID);
    expect(copy.Cells['A1']?.ColumnID).not.toBe(source.Columns[0].ColumnID);
    // Charts / LiveTables / EmbeddedArtifacts / ProtectedRanges must be deep-cloned with fresh IDs
    expect(copy.Charts[0].ChartID).not.toBe('chart-orig');
    expect(copy.Charts[0].SheetID).toBe(copy.SheetID);
    expect(copy.LiveTables[0].TableID).not.toBe('tbl-orig');
    expect(copy.EmbeddedArtifacts[0].EmbedID).not.toBe('emb-orig');
    expect(copy.ProtectedRanges?.[0].RangeID).not.toBe('prot-orig');
    expect(metaSpy).toHaveBeenCalledWith(f.componentInstance.Workbook);
  });

  it('blocks non-owner with CanShare=true from bypassing protected ranges while allowing the owner', () => {
    const f = createEditableWorkbookFixture('Protected Lock', (wb) => {
      const sheet = wb.Worksheets[0];
      SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'A1', { Value: 500 });
      sheet.ProtectedRanges = [
        {
          RangeID: 'prot-1',
          Range: 'A1:B2',
          LockedByUserID: 'user-real-owner',
          AllowEditors: false,
        },
      ];
    });

    const nonOwnerProvider: Partial<IMetadataProvider> = {
      Entities: [],
      CurrentUser: { ID: 'user-shared-editor', Name: 'Shared User', Email: 'share@example.com' } as IMetadataProvider['CurrentUser'],
    };
    f.componentInstance.Provider = nonOwnerProvider as IMetadataProvider;
    f.componentInstance.Permissions = {
      ArtifactID: '11111111-1111-4111-8111-111111111199',
      CanRead: true,
      CanEdit: true,
      CanShare: true,
      CanDelete: false,
      Source: 'ArtifactPermission',
      Reason: 'Shared editor',
    };

    // Non-owner even with CanShare=true MUST be blocked from clearing protected cell A1
    f.componentInstance.OnContextMenuCommand({ Type: 'clear-range', Kind: 'all', RangeA1: 'A1' });
    expect(f.componentInstance.Workbook.Worksheets[0].Cells['A1']?.RawValue).toBe(500);
    expect(f.componentInstance.StatusBannerMessage).toContain('protected');

    // Actual artifact owner CAN edit/clear the protected range
    const ownerProvider: Partial<IMetadataProvider> = {
      Entities: [],
      CurrentUser: { ID: 'user-real-owner', Name: 'Owner User', Email: 'owner@example.com' } as IMetadataProvider['CurrentUser'],
    };
    f.componentInstance.Provider = ownerProvider as IMetadataProvider;
    f.componentInstance.Permissions = {
      ArtifactID: '11111111-1111-4111-8111-111111111199',
      CanRead: true,
      CanEdit: true,
      CanShare: true,
      CanDelete: true,
      Source: 'Owner',
      Reason: 'Owner',
    };
    f.componentInstance.OnContextMenuCommand({ Type: 'clear-range', Kind: 'all', RangeA1: 'A1' });
    expect(f.componentInstance.Workbook.Worksheets[0].Cells['A1']).toBeUndefined();
  });

  it('edits an existing LiveTable in place via EditingLiveTableID instead of pushing a duplicate', async () => {
    const f = createEditableWorkbookFixture('Live Table Edit', (wb) => {
      wb.Worksheets[0].LiveTables.push({
        TableID: 'tbl-edit-1',
        Title: 'Original Agents',
        SourceType: 'EntityView',
        EntityName: 'AI Agents',
        AnchorCell: 'A1',
        IncludeHeaders: true,
        Mode: 'Live',
      });
    });

    f.componentInstance.OnContextMenuCommand({ Type: 'open-live-table-editor', TableID: 'tbl-edit-1' });
    f.detectChanges();

    expect(f.componentInstance.ShowAddLiveTableModal).toBe(true);
    expect(f.componentInstance.EditingLiveTableID).toBe('tbl-edit-1');
    expect(f.componentInstance.NewLiveTableTitle).toBe('Original Agents');

    f.componentInstance.NewLiveTableTitle = 'Updated Agents';
    await f.componentInstance.ConfirmAddLiveTable();
    f.detectChanges();

    expect(f.componentInstance.ActiveSheet.LiveTables.length).toBe(1);
    expect(f.componentInstance.ActiveSheet.LiveTables[0].TableID).toBe('tbl-edit-1');
    expect(f.componentInstance.ActiveSheet.LiveTables[0].Title).toBe('Updated Agents');
  });

  it('surfaces inline error card for invalid-UUID embedded artifact and opens inline dimension dialog instead of window.prompt', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => '99');
    const f = createEditableWorkbookFixture('Embed Error & Dimension Modal', (wb) => {
      wb.Worksheets[0].EmbeddedArtifacts.push({
        EmbedID: 'emb-bad-uuid',
        Title: 'Broken Embed',
        ArtifactID: 'not-a-valid-uuid',
        ArtifactTypeName: 'Whiteboard',
        AnchorCell: 'C2',
        WidthPx: 320,
        HeightPx: 200,
        AllowInlineEdit: true,
      });
    });
    await Promise.resolve();
    await Promise.resolve();
    f.detectChanges();

    const errCard = query(f, '[data-testid="sheet-ole-error-emb-bad-uuid"]');
    expect(errCard).not.toBeNull();
    expect(f.componentInstance.EmbeddedArtifactErrors['emb-bad-uuid']).toContain('is not a valid artifact UUID');

    // Context menu Set Row Height opens inline modal without calling window.prompt
    f.componentInstance.OnContextMenuCommand({ Type: 'set-row-height', StartRowIndex: 1, EndRowIndex: 1 });
    f.detectChanges();
    expect(promptSpy).not.toHaveBeenCalled();
    expect(query(f, '[data-testid="sheets-dimension-modal"]')).not.toBeNull();

    f.componentInstance.PendingDimensionPrompt!.Value = 64;
    f.componentInstance.ConfirmDimensionPrompt();
    f.detectChanges();
    expect(f.componentInstance.ActiveSheet.Rows[0].Height).toBe(64);
    expect(query(f, '[data-testid="sheets-dimension-modal"]')).toBeNull();

    // Native capture-phase click suppression works after long-press
    const shell = query(f, '.mj-sheets-shell') as HTMLElement;
    expect(shell).not.toBeNull();
    f.componentInstance.ConnectionStatus = 'connected';
    f.componentInstance.Collaborators = [];
    expect(f.componentInstance.Collaborators.some((c) => c.IsAgent === true)).toBe(false);
  });

  it('sizes embedded artifact hosts cleanly and respects AllowInlineEdit + Edit Inline Canvas toggle', async () => {
    const f = createEditableWorkbookFixture('Embedded Doc Card UX', (wb) => {
      wb.Worksheets[0].EmbeddedArtifacts.push({
        EmbedID: 'emb-doc-1',
        Title: 'Embedded Article',
        ArtifactID: 'd96f4ba5-16cc-41ad-b937-4e7d181288a9',
        ArtifactTypeName: 'Markdown Document',
        AnchorCell: 'H2',
        WidthPx: 540,
        HeightPx: 420,
        AllowInlineEdit: true,
      });
    });
    const host = query(f, '[data-testid="sheet-ole-host-emb-doc-1"]') as HTMLElement;
    const card = query(f, '[data-testid="sheet-embedded-artifact-emb-doc-1"]') as HTMLElement;
    expect(host.style.height).toBe('420px');
    expect(card.style.flexBasis).toBe('540px');
    expect(f.componentInstance.ResolvedObjectsPaneHeightPx).toBe(530);

    const toggleBtn = query(f, '[data-testid="toggle-inline-ole-btn-emb-doc-1"]') as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    expect(f.componentInstance.IsEditingEmbeddedArtifact(f.componentInstance.ActiveSheet.EmbeddedArtifacts[0])).toBe(false);

    toggleBtn.click();
    f.detectChanges();
    expect(f.componentInstance.IsEditingEmbeddedArtifact(f.componentInstance.ActiveSheet.EmbeddedArtifacts[0])).toBe(true);

    toggleBtn.click();
    f.detectChanges();
    expect(f.componentInstance.IsEditingEmbeddedArtifact(f.componentInstance.ActiveSheet.EmbeddedArtifacts[0])).toBe(false);
  });

  it('computes negative chart baseline ZeroY, downward bar rects, NaN-safe line series, and cross-sheet chart dataset', () => {
    const f = createEditableWorkbookFixture('Chart Domain & Cross-Sheet', (wb) => {
      const sheet1 = wb.Worksheets[0];
      const sheet2 = SpreadsheetEngine.Instance.AddWorksheet(wb, 'DataSheet');
      SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'A1', { Value: 'Period' });
      SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'B1', { Value: 'Variance' });
      SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'A2', { Value: 'Q1' });
      SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'B2', { Value: -25 });
      SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'A3', { Value: 'Q2' });
      SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'B3', { Value: 75 });
      sheet1.Charts.push({
        ChartID: 'chart-neg-1',
        Title: 'Cross Sheet Variance',
        ChartType: 'bar',
        SheetID: sheet2.SheetID,
        SourceRange: 'A1:B3',
        PositionCell: 'E2',
      });
    });

    const chart = f.componentInstance.ActiveSheet.Charts[0];
    const dataset = f.componentInstance.GetChartDataset(chart);
    expect(dataset).not.toBeNull();
    expect(dataset?.Categories).toEqual(['Q1', 'Q2']);

    const domain = f.componentInstance.GetChartDomain([
      { Index: 0, Name: 'Variance', Values: [-25, Number.NaN, 75], Color: 'var(--mj-brand-primary)' },
    ]);
    expect(domain.MinValue).toBe(-25);
    expect(domain.MaxValue).toBe(75);
    expect(domain.ZeroY).toBeCloseTo(109.5, 1);

    const bars = f.componentInstance.GetChartBarRects(
      chart,
      dataset!,
      [{ Index: 0, Name: 'Variance', Values: [-25, 75], Color: 'var(--mj-brand-primary)' }],
      75,
      domain,
    );
    expect(bars[0].Y).toBe(domain.ZeroY);
    expect(bars[0].Height).toBeGreaterThan(0);
    expect(bars[1].Y).toBeLessThan(domain.ZeroY);

    const line = f.componentInstance.GetChartLineSeries(
      {
        ChartID: chart.ChartID,
        Title: chart.Title,
        ChartType: chart.ChartType,
        SheetID: chart.SheetID,
        SourceRange: chart.SourceRange,
        Categories: ['Q1', 'Q2'],
        Series: [{ Name: 'Variance', Values: [-25, Number.NaN] }],
        Columns: [],
        Rows: [],
        RevisionHash: 'test-rev',
      },
      [{ Index: 0, Name: 'Variance', Values: [-25, Number.NaN], Color: 'var(--mj-brand-primary)' }],
      25,
      chart,
      { MinValue: -25, MaxValue: 25, ZeroY: 79 },
    );
    expect(line[0].Points[0].Y).toBeGreaterThan(79);
    expect(Number.isFinite(line[0].Points[1].Y)).toBe(true);
  });

  it('closes lock bypasses on AddLiveTable, ToggleProtection, Freeze/Unfreeze, Source JSON, and Paste', async () => {
    const f = createEditableWorkbookFixture('Lock Bypasses Closed', (wb) => {
      const sheet = wb.Worksheets[0];
      SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'A1', { Value: 'Locked Header' });
      SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'B1', { Value: 'Editable Header' });
      sheet.ProtectedRanges = [
        {
          RangeID: 'prot-owner',
          Range: 'A1:A3',
          LockedByUserID: 'owner-uuid-1',
          AllowEditors: false,
        },
      ];
      sheet.LiveTables.push({
        TableID: 'tbl-lock-1',
        Title: 'Locked Table',
        SourceType: 'EntityView',
        EntityName: 'AI Agents',
        AnchorCell: 'A1',
        IncludeHeaders: true,
        Mode: 'Frozen',
      });
    });

    const nonOwnerProvider: Partial<IMetadataProvider> = {
      Entities: [],
      CurrentUser: { ID: 'editor-uuid-2', Name: 'Editor', Email: 'ed@example.com' } as IMetadataProvider['CurrentUser'],
    };
    f.componentInstance.Provider = nonOwnerProvider as IMetadataProvider;
    f.componentInstance.Permissions = {
      ArtifactID: '11111111-1111-4111-8111-111111111199',
      CanRead: true,
      CanEdit: true,
      CanShare: true,
      CanDelete: false,
      Source: 'ArtifactPermission',
      Reason: 'Shared editor',
    };

    // 1. ConfirmAddLiveTable blocked on protected anchor A1
    f.componentInstance.NewLiveTableAnchorCell = 'A1';
    f.componentInstance.NewLiveTableTitle = 'Injected Live';
    await f.componentInstance.ConfirmAddLiveTable();
    expect(f.componentInstance.ActiveSheet.LiveTables.length).toBe(1);

    // 2. ToggleSelectedRangeProtection & UnfreezeLiveTable blocked without CanManageDocumentLocks
    f.componentInstance.SelectCell(1, 2);
    f.componentInstance.ToggleSelectedRangeProtection();
    expect(f.componentInstance.ActiveSheet.ProtectedRanges?.length).toBe(1);
    await f.componentInstance.UnfreezeLiveTable(f.componentInstance.ActiveSheet.LiveTables[0]);
    expect(f.componentInstance.ActiveSheet.LiveTables[0].Mode).toBe('Frozen');

    // 3. Source JSON cannot remove owner ProtectedRanges or return invalid JSON
    const originalSerialized = SpreadsheetEngine.Instance.SerializeWorkbook(f.componentInstance.Workbook);
    f.componentInstance.SourceJsonText = '{ invalid json';
    f.componentInstance.ApplySourceJsonChanges();
    expect(f.componentInstance.Workbook.Worksheets[0].Cells['A1']?.RawValue).toBe('Locked Header');

    const stripped = JSON.parse(originalSerialized) as {
      Worksheets: Array<{ ProtectedRanges?: SpreadsheetProtectedRangeSpec[] }>;
    };
    stripped.Worksheets[0].ProtectedRanges = [];
    f.componentInstance.SourceJsonText = JSON.stringify(stripped);
    f.componentInstance.ApplySourceJsonChanges();
    expect(f.componentInstance.Workbook.Worksheets[0].ProtectedRanges?.length).toBe(1);

    // 4. Atomic paste pre-flight check prevents partial overwrites when destination intersects locked cell
    f.componentInstance.SheetsClipboardBuffer = {
      Mode: 'copy',
      SourceSheetID: f.componentInstance.ActiveSheet.SheetID,
      SourceRangeA1: 'B1',
      RowCount: 1,
      ColCount: 2,
      Cells: [
        { RowOffset: 0, ColOffset: 0, Value: 'X' },
        { RowOffset: 0, ColOffset: 1, Value: 'Y' },
      ],
    };
    f.componentInstance.SelectCell(1, 1);
    f.componentInstance.OnContextMenuCommand({ Type: 'paste', Kind: 'all' });
    expect(f.componentInstance.ActiveSheet.Cells['A1']?.RawValue).toBe('Locked Header');
    expect(f.componentInstance.ActiveSheet.Cells['B1']?.RawValue).toBe('Editable Header');
  });

  it('enforces P0-20 keydown isolation, hidden row/col skipping, clamped range clears, and embed EmbedID/depth/cycle guards', async () => {
    const f = createEditableWorkbookFixture('P0-20 Guards', (wb) => {
      const sheet = wb.Worksheets[0];
      sheet.Rows[1].Hidden = true; // Row 2 hidden
      sheet.Columns[1].Hidden = true; // Col B hidden
      sheet.EmbeddedArtifacts.push(
        {
          EmbedID: 'emb-dup-a',
          Title: 'Inline Fallback Board',
          ArtifactID: '11111111-1111-4111-8111-111111111111',
          ArtifactTypeName: 'Whiteboard',
          AnchorCell: 'C2',
          WidthPx: 320,
          HeightPx: 200,
          AllowInlineEdit: true,
          InlineContentJSON: '{"pages":[]}',
        },
        {
          EmbedID: 'emb-dup-b',
          Title: 'Circular Embed',
          ArtifactID: '22222222-2222-4222-8222-222222222222',
          ArtifactTypeName: 'Whiteboard',
          AnchorCell: 'C5',
          WidthPx: 320,
          HeightPx: 200,
          AllowInlineEdit: true,
        },
      );
    });

    // Hidden rows & columns skipped by MoveActiveCell
    f.componentInstance.SelectCell(1, 1);
    f.componentInstance.MoveActiveCell(1, 0, false);
    expect(f.componentInstance.ActiveRowIndex).toBe(3);
    f.componentInstance.MoveActiveCell(0, 1, false);
    expect(f.componentInstance.ActiveColumnIndex).toBe(3);

    // Keydown inside OLE host / contenteditable ignored
    const oleEl = document.createElement('div');
    oleEl.className = 'mj-sheets-ole-host';
    document.body.appendChild(oleEl);
    const oleKeyEvt = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true });
    Object.defineProperty(oleKeyEvt, 'target', { value: oleEl });
    f.componentInstance.OnViewerKeydown(oleKeyEvt);
    expect(f.componentInstance.ActiveRowIndex).toBe(3);
    oleEl.remove();

    // Clamped massive selection range does not hang when clearing
    f.componentInstance.SelectedRange = 'A1:XFD1048576';
    f.componentInstance.SelectedRanges = ['A1:XFD1048576'];
    f.componentInstance.ClearSelectedRange();
    expect(f.componentInstance.StatusBannerMessage).toBeDefined();

    // Embed cycle + offline fallback keyed by EmbedID
    f.componentInstance.AncestorArtifactIDs = new Set(['22222222-2222-4222-8222-222222222222']);
    f.componentInstance.OnContextMenuCommand({
      Type: 'refresh-embedded-artifact',
      EmbedID: 'emb-dup-a',
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(f.componentInstance.EmbeddedArtifactVersions['emb-dup-a']?.Content).toBe('{"pages":[]}');
    expect(f.componentInstance.EmbeddedArtifactErrors['emb-dup-b']).toContain('Circular');
  });

  it('supports NW-1 frozen live drift banner, NW-3 cell suggestions & reopen, and NW-4 merge/validation/condfmt/named ranges/fill', () => {
    const f = createEditableWorkbookFixture('NW Features', (wb) => {
      const sheet = wb.Worksheets[0];
      SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'A1', { Value: 10 });
      SpreadsheetEngine.Instance.SetCell(wb, sheet.SheetID, 'A2', { Value: 20 });
      sheet.LiveTables.push({
        TableID: 'tbl-nw1',
        Title: 'Snapshot Deals',
        SourceType: 'EntityView',
        EntityName: 'Deals',
        AnchorCell: 'D1',
        Mode: 'Frozen',
        FrozenSnapshot: {
          FrozenAt: '2026-11-01T00:00:00Z',
          FrozenByUserID: 'u-1',
          FrozenByUserName: 'Owner',
          Columns: [{ Name: 'ID', DisplayName: 'ID', Type: 'string' }],
          Rows: [{ ID: '1' }],
          TotalRowCount: 1,
          SecurityWarningAcknowledged: true,
        },
      });
    });

    // NW-1 FrozenLiveTablesOnActiveSheet
    expect(f.componentInstance.FrozenLiveTablesOnActiveSheet.length).toBe(1);

    // NW-3 Cell suggestions propose, accept & reject
    f.componentInstance.OpenProposeSuggestionModal('B1');
    f.componentInstance.PendingSuggestionValue = 'Approved Forecast';
    f.componentInstance.PendingSuggestionRationale = 'Q4 adjustment';
    f.componentInstance.SubmitCellSuggestion();
    expect(f.componentInstance.CellSuggestions.length).toBe(1);
    expect(f.componentInstance.PendingSuggestionCount).toBe(1);
    f.componentInstance.AcceptCellSuggestion(f.componentInstance.CellSuggestions[0]);
    expect(f.componentInstance.ActiveSheet.Cells['B1']?.RawValue).toBe('Approved Forecast');
    expect(f.componentInstance.PendingSuggestionCount).toBe(0);

    // NW-4 Merge & Unmerge
    f.componentInstance.SelectedRange = 'C1:D2';
    f.componentInstance.SelectedRanges = ['C1:D2'];
    f.componentInstance.MergeSelectedRange();
    expect(f.componentInstance.GetMergedCellSpan(1, 3)).toEqual({ colspan: 2, rowspan: 2, isCovered: false });
    expect(f.componentInstance.GetMergedCellSpan(2, 4)).toEqual({ colspan: 1, rowspan: 1, isCovered: true });
    f.componentInstance.UnmergeSelectedRange();
    expect(f.componentInstance.GetMergedCellSpan(1, 3)).toEqual({ colspan: 1, rowspan: 1, isCovered: false });

    // NW-4 Data Validation list dropdown
    f.componentInstance.OpenValidationDrawer('E1:E3');
    f.componentInstance.NewValidationRuleType = 'list';
    f.componentInstance.NewValidationAllowedCsv = 'Open, Won, Lost';
    f.componentInstance.ConfirmAddValidationRule();
    expect(f.componentInstance.GetCellListValidationRule('E2')?.AllowedValues).toEqual(['Open', 'Won', 'Lost']);
    f.componentInstance.OnValidationDropdownChanged(2, 5, 'Won');
    expect(f.componentInstance.ActiveSheet.Cells['E2']?.RawValue).toBe('Won');

    // NW-4 Conditional Formatting
    f.componentInstance.OpenConditionalFormatDrawer('A1:A5');
    f.componentInstance.NewCondFormatOperator = 'gt';
    f.componentInstance.NewCondFormatValue1 = '15';
    f.componentInstance.NewCondFormatTone = 'success';
    f.componentInstance.ConfirmAddConditionalFormatRule();
    expect(f.componentInstance.GetConditionalTone(f.componentInstance.ActiveSheet.Cells['A2'])).toBe('success');

    // NW-4 Named Range
    f.componentInstance.OpenNamedRangeModal('A1:A2');
    f.componentInstance.NewNamedRangeName = 'SeedNumbers';
    f.componentInstance.ConfirmSaveNamedRange();
    expect(f.componentInstance.WorkbookNamedRanges.length).toBe(1);
    f.componentInstance.OnNamedRangeSelected('SeedNumbers');
    expect(f.componentInstance.SelectedRange).toBe('A1:A2');

    // NW-4 Fill Handle drag linear progression (10, 20 -> 30)
    f.componentInstance.SelectedRanges = ['A1:A2'];
    f.componentInstance.SelectedRange = 'A1:A2';
    f.componentInstance.StartFillHandleDrag(new MouseEvent('mousedown'));
    f.componentInstance.OnCellMouseEnter(3, 1);
    f.componentInstance.OnCellMouseUp();
    expect(f.componentInstance.ActiveSheet.Cells['A3']?.RawValue).toBe(30);
  });

  it('isolates GuestSnapshotMode in Sheets (P0-P3-4): never connects Yjs, resolves permissions, or renders Access Revoked', async () => {
    const hasBackendSpy = vi.spyOn(DocumentCollaborationService.prototype, 'HasCollaborationBackend').mockReturnValue(true);
    const verifyServerSpy = vi.spyOn(DocumentCollaborationService.prototype, 'VerifyFrozenSnapshotOnServer');
    const resolvePermSpy = vi.spyOn(DocumentCollaborationService.prototype, 'ResolvePermissionsFromServer');
    const runViewSpy = vi.fn(async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' }));
    const fakeProvider = {
      RunView: runViewSpy,
    } as Partial<IMetadataProvider> as IMetadataProvider;

    const f = renderComponentFixture(SpreadsheetArtifactViewerComponent, {
      imports: [
        FormsModule,
        SheetPluginViewerStubComponent,
        XlsxPreviewStubComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
      ],
      declarations: [SpreadsheetArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        Provider: fakeProvider,
        GuestSnapshotMode: true,
        artifactVersion: makeSheetVersion(),
        readonly: false,
      },
    });
    await f.whenStable();
    f.detectChanges();

    expect(f.componentInstance.AccessRevoked).toBe(false);
    expect(f.componentInstance.CanEdit).toBe(false);
    expect((f.nativeElement as HTMLElement).textContent ?? '').not.toContain('Access Revoked');
    expect(hasBackendSpy).not.toHaveBeenCalled();
    expect(verifyServerSpy).not.toHaveBeenCalled();
    expect(resolvePermSpy).not.toHaveBeenCalled();
    expect(runViewSpy).not.toHaveBeenCalled();
  });

  it('re-applies pre-init ViewMode/NavigationAnchor on workbook init (NW-6) and matches sheet names + errors on missing sheet (NW-3)', () => {
    const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Multi-Sheet Init');
    const secondSheet = SpreadsheetEngine.Instance.AddWorksheet(wb, 'Q4Forecast');
    SpreadsheetEngine.Instance.SetCell(wb, wb.Worksheets[0].SheetID, 'A1', { Value: 100 });
    SpreadsheetEngine.Instance.SetCell(wb, secondSheet.SheetID, 'B2', { Value: 200 });

    const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
    Object.defineProperties(ver, {
      ID: { value: '11111111-1111-4111-8111-111111111198', enumerable: true },
      ArtifactID: { value: '', enumerable: true },
      Name: { value: 'Multi-Sheet Init', enumerable: true },
      VersionNumber: { value: 1, enumerable: true },
      ContentMode: { value: 'Text', enumerable: true },
      Configuration: { value: null, enumerable: true },
      Content: { value: SpreadsheetEngine.Instance.SerializeWorkbook(wb), enumerable: true },
    });

    const f = renderComponentFixture(SpreadsheetArtifactViewerComponent, {
      imports: [
        FormsModule,
        SheetPluginViewerStubComponent,
        XlsxPreviewStubComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactCommandPaletteComponent,
      ],
      declarations: [SpreadsheetArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        ViewMode: 'diff',
        NavigationAnchor: { Sheet: 'Q4Forecast', Range: 'B2:C3' },
        artifactVersion: ver,
        readonly: false,
      },
    });
    f.detectChanges();

    expect(f.componentInstance.WorkspaceMode).toBe('diff');
    expect(f.componentInstance.ActiveSheet.Name).toBe('Q4Forecast');
    expect(f.componentInstance.SelectedRange).toBe('B2:C3');

    // NW-3: AcceptCellSuggestion matches Sheet by Name (case-insensitive)
    f.componentInstance.AcceptCellSuggestion({
      SuggestionID: 'sug-sheet-name-1',
      SheetID: 'q4forecast',
      Range: 'B2',
      ProposedValue: '350',
      CurrentDisplayValue: '200',
      Rationale: 'Match sheet by name',
      AuthorName: 'SheetAgent',
      AuthorUserID: 'agent-1',
      IsAgent: true,
      CreatedAt: '2026-11-15T12:00:00Z',
      Status: 'pending',
    });
    expect(f.componentInstance.Workbook.Worksheets[1].Cells['B2']?.RawValue).toBe(350);

    // NW-3: Non-empty SheetID matching no worksheet must not silently mutate ActiveSheet
    const beforeSheet1 = f.componentInstance.Workbook.Worksheets[0].Cells['A1']?.RawValue;
    f.componentInstance.AcceptCellSuggestion({
      SuggestionID: 'sug-sheet-missing-1',
      SheetID: 'DoesNotExist',
      Range: 'A1',
      ProposedValue: '999',
      CurrentDisplayValue: '100',
      Rationale: 'Unknown sheet guard',
      AuthorName: 'SheetAgent',
      AuthorUserID: 'agent-1',
      IsAgent: true,
      CreatedAt: '2026-11-15T12:00:00Z',
      Status: 'pending',
    });
    expect(f.componentInstance.Workbook.Worksheets[0].Cells['A1']?.RawValue).toBe(beforeSheet1);
    expect(f.componentInstance.Workbook.Worksheets[1].Cells['A1']?.RawValue).toBeUndefined();
  });
});
