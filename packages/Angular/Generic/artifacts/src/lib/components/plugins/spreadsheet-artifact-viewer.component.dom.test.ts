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
      declarations: [SpreadsheetArtifactViewerComponent],
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
      declarations: [SpreadsheetArtifactViewerComponent],
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
      declarations: [SpreadsheetArtifactViewerComponent],
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
      declarations: [SpreadsheetArtifactViewerComponent],
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
      declarations: [SpreadsheetArtifactViewerComponent],
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
});
