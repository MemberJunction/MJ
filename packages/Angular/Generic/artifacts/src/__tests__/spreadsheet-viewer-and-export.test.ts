/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, ChangeDetectorRef } from '@angular/core';
import { MJGlobal } from '@memberjunction/global';
import {
  SpreadsheetEngine,
  type MJArtifactVersionEntity,
} from '@memberjunction/core-entities';
import { BaseArtifactViewerPluginComponent } from '../lib/components/base-artifact-viewer.component';
import { SpreadsheetArtifactViewerComponent } from '../lib/components/plugins/spreadsheet-artifact-viewer.component';
import { DocumentCollaborationService } from '../lib/services/document-collaboration.service';
import { ArtifactFileService } from '../lib/services/artifact-file.service';

describe('Wave 3 Sheets: SpreadsheetArtifactViewerComponent & Collaborative Workbook Operations', () => {
  let collabService: DocumentCollaborationService;

  beforeEach(() => {
    collabService = new DocumentCollaborationService();
  });

  it('registers SpreadsheetArtifactViewerComponent under BaseArtifactViewerPluginComponent as SpreadsheetArtifactViewerPlugin', async () => {
    expect(SpreadsheetArtifactViewerComponent).toBeDefined();
    const reg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(
      BaseArtifactViewerPluginComponent,
      'SpreadsheetArtifactViewerPlugin',
    );
    expect(reg?.SubClass).toBe(SpreadsheetArtifactViewerComponent);
  });

  it('supports cell & formula authoring, formatting, row/column insertion, multi-tab management, range charts, @SheetsAgent comments, and .xlsx/.csv round-trip', async () => {
    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: ArtifactFileService, useValue: null },
      ],
    });

    const component = runInInjectionContext(
      injector,
      () => new SpreadsheetArtifactViewerComponent(),
    );

    const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('FY27 Revenue Model');
    const sheetId = wb.Worksheets[0].SheetID;
    SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'A1', {
      Value: 'Segment',
      Style: { Bold: true },
    });
    SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'B1', {
      Value: 'ARR',
      Style: { Bold: true },
    });
    SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'A2', { Value: 'Enterprise' });
    SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'B2', {
      Value: 250000,
      Style: { FormatType: 'currency' },
    });
    SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'A3', { Value: 'Mid-Market' });
    SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'B3', {
      Value: 150000,
      Style: { FormatType: 'currency' },
    });

    component.artifactVersion = {
      ID: 'ver-sheet-1',
      ArtifactID: 'art-sheet-1',
      VersionNumber: 1,
      Name: 'FY27 Revenue Model',
      Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
    } as unknown as MJArtifactVersionEntity;
    component.readonly = false;

    await component.ngOnInit();
    expect(component.Workbook.Title).toBe('FY27 Revenue Model');
    expect(component.HasDisplayContent).toBe(true);
    expect(component.SupportsInlineEdit).toBe(true);
    expect(component.GetCurrentStateSnapshot()?.title).toContain('FY27 Revenue Model');

    // 1. Select B4 and write a SUM formula via formula bar
    component.SelectCell(4, 2);
    expect(component.ActiveCellAddress).toBe('B4');
    component.FormulaBarInput = '=SUM(B2:B3)';
    component.CommitFormulaBarInput();
    expect(component.ActiveSheet.Cells['B4']?.ComputedValue).toBe(400000);
    component.ApplyActiveCellFormat('currency');
    expect(component.ActiveSheet.Cells['B4']?.DisplayValue).toBe('$400,000.00');

    // 2. Insert a row at row 2 -> formula in B4 shifts to B5 (=SUM(B3:B4))
    component.SelectCell(2, 2);
    component.InsertRowAtActive();
    expect(component.ActiveSheet.Cells['B5']?.Formula).toBe('=SUM(B3:B4)');
    expect(component.ActiveSheet.Cells['B5']?.ComputedValue).toBe(400000);

    // 3. Add a Range Chart over A1:B5
    component.SelectedRange = 'A1:B5';
    component.AddRangeChartFromSelection();
    expect(component.ActiveSheet.Charts).toHaveLength(1);
    const dataset = component.GetChartDataset(component.ActiveSheet.Charts[0]);
    expect(dataset).not.toBeNull();

    // 4. Create an anchored SheetRange comment with @SheetsAgent instruction (Accept #3)
    component.SelectedRange = 'C5';
    component.SelectCell(5, 3);
    component.NewCommentText = '@SheetsAgent please write =ROUND(B5*1.12, 2) here';
    await component.CreateAnchoredSheetRangeComment();
    expect(component.AnchoredThreads).toHaveLength(1);
    expect(component.AnchoredThreads[0].Messages).toHaveLength(2);
    expect(component.ActiveSheet.Cells['C5']?.ComputedValue).toBe(448000);

    // 5. Export .xlsx and .csv and verify round-trip (Accept #4)
    const xlsxBytes = component.ExportWorkbookAsXlsx();
    expect(xlsxBytes[0]).toBe(0x50);
    expect(xlsxBytes[1]).toBe(0x4b);
    const reimported = SpreadsheetEngine.Instance.ImportFromXlsxBytes(xlsxBytes);
    expect(reimported.Worksheets[0].Cells['B5']?.Formula).toBe('=SUM(B3:B4)');
    expect(reimported.Worksheets[0].Cells['B5']?.ComputedValue).toBe(400000);

    const csvText = component.ExportActiveSheetAsCsv();
    expect(csvText).toContain('Enterprise');
    expect(csvText).toContain('400000');

    // 6. Add a second worksheet tab and switch to Diff view
    component.AddNewWorksheetTab();
    expect(component.Workbook.Worksheets).toHaveLength(2);
    component.SetWorkspaceMode('diff');
    expect(component.DiffResult.AddedLines).toBeGreaterThan(0);

    component.ngOnDestroy();
  });
});
