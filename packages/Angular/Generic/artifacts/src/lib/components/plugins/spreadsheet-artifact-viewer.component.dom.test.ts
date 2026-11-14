import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import type { IMetadataProvider } from '@memberjunction/core';
import { MJArtifactVersionEntity, SpreadsheetEngine } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { SpreadsheetArtifactViewerComponent } from './spreadsheet-artifact-viewer.component';
import { ArtifactAgentPresenceBarComponent } from '../presence/artifact-agent-presence-bar.component';
import { MjContextMenuComponent } from '../context-menu/mj-context-menu.component';

@Component({
  standalone: true,
  selector: 'mj-artifact-type-plugin-viewer',
  template: '<div data-testid="sheet-plugin-viewer-stub"></div>',
})
class SheetPluginViewerStubComponent {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() artifactVersion: unknown;
  @Input() artifactTypeName = '';
  @Input() ArtifactTypeName = '';
  @Input() readonly = true;
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
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

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

    // 2. Drag splitter upward by 90px -> persists PreferredObjectsPaneHeightPx = 360 in workbook & SourceJsonText
    splitter!.dispatchEvent(new MouseEvent('mousedown', { clientY: 500, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 410 }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientY: 410 }));
    f.detectChanges();
    expect(f.componentInstance.Workbook.PreferredObjectsPaneHeightPx).toBe(360);
    expect(f.componentInstance.ResolvedObjectsPaneHeightPx).toBe(360);
    const stripEl = query(f, '[data-testid="sheets-objects-strip"]') as HTMLElement | null;
    expect(stripEl?.style.height).toBe('360px');
    expect(SpreadsheetEngine.Instance.ParseWorkbook(f.componentInstance.SourceJsonText).PreferredObjectsPaneHeightPx).toBe(360);

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
      ],
      declarations: [SpreadsheetArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        artifactVersion: ver,
        readonly: true,
      },
    });
    const runViewSpy = vi.fn();
    const partialProvider: Partial<IMetadataProvider> = {
      Entities: [],
      RunView: runViewSpy,
    };
    f.componentInstance.Provider = partialProvider as IMetadataProvider;
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
});
