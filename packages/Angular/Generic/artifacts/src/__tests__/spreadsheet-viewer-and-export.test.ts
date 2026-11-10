/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, ChangeDetectorRef } from '@angular/core';
import type { IMetadataProvider } from '@memberjunction/core';
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

  function createMockSheetsProvider(ownerId = '11111111-2222-4333-8444-555555555555') {
    const savedConversations: Array<Record<string, unknown>> = [];
    const savedDetails: Array<Record<string, unknown>> = [];
    const savedArtifacts: Array<Record<string, unknown>> = [];
    const savedVersions: Array<Record<string, unknown>> = [];
    let seq = 0;

    const user = {
      ID: ownerId,
      Name: 'Dana Analyst',
      Email: 'dana@memberjunction.org',
      IsActive: true,
    };

    const provider = {
      CurrentUser: user,
      Entities: [
        {
          ID: 'ent-artifacts-id',
          Name: 'MJ: Artifacts',
          DisplayNameOrName: 'MJ: Artifacts',
          FieldLevelSecurityApplies: false,
          GetUserPermisions: () => ({ CanRead: true }),
          Fields: [{ Name: 'ID', IsPrimaryKey: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' }],
        },
      ],
      EntityByName: (name: string) =>
        name === 'MJ: Artifacts' ? { ID: 'ent-artifacts-id', Name: 'MJ: Artifacts' } : undefined,
      RunView: async (params: { EntityName: string }) => {
        if (params.EntityName === 'MJ: Artifacts') {
          return {
            Success: true,
            Results: [{ ID: 'art-sheet-1', UserID: ownerId, EnvironmentID: 'env-sheet-1' }],
            TotalRowCount: 1,
          };
        }
        if (params.EntityName === 'MJ: Artifact Types') {
          return {
            Success: true,
            Results: [{ ID: 'type-wb-id', Name: 'Whiteboard' }],
            TotalRowCount: 1,
          };
        }
        if (params.EntityName === 'MJ: Artifact Versions') {
          return {
            Success: true,
            Results: [{ ID: 'ver-existing-3', VersionNumber: 3 }],
            TotalRowCount: 1,
          };
        }
        return { Success: true, Results: [], TotalRowCount: 0 };
      },
      GetEntityObject: async (entityName: string) => {
        const rec: Record<string, unknown> = {
          ID: `77777777-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
          NewRecord: () => undefined,
          Load: async () => true,
          Save: async () => {
            if (entityName === 'MJ: Conversations') savedConversations.push({ ...rec });
            if (entityName === 'MJ: Conversation Details') savedDetails.push({ ...rec });
            if (entityName === 'MJ: Artifacts') savedArtifacts.push({ ...rec });
            if (entityName === 'MJ: Artifact Versions') savedVersions.push({ ...rec });
            return true;
          },
        };
        return rec;
      },
    } as unknown as IMetadataProvider;

    return { provider, savedConversations, savedDetails, savedArtifacts, savedVersions };
  }

  it('registers SpreadsheetArtifactViewerComponent under BaseArtifactViewerPluginComponent as SpreadsheetArtifactViewerPlugin', async () => {
    expect(SpreadsheetArtifactViewerComponent).toBeDefined();
    const reg = await MJGlobal.Instance.ClassFactory.GetRegistrationAsync(
      BaseArtifactViewerPluginComponent,
      'SpreadsheetArtifactViewerPlugin',
    );
    expect(reg?.SubClass).toBe(SpreadsheetArtifactViewerComponent);
  });

  it('fails closed (CanEdit=false, CanComment=false) when ArtifactID is set without resolved permissions (B3)', async () => {
    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: ArtifactFileService, useValue: null },
      ],
    });
    const component = runInInjectionContext(injector, () => new SpreadsheetArtifactViewerComponent());
    const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Protected Sheet');
    component.artifactVersion = {
      ID: 'ver-protected-1',
      ArtifactID: 'art-protected-1',
      VersionNumber: 1,
      Name: 'Protected Sheet',
      Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
    } as unknown as MJArtifactVersionEntity;
    component.readonly = false;

    await component.ngOnInit();
    expect(component.Permissions).toBeNull();
    expect(component.CanEdit).toBe(false);
    expect(component.CanComment).toBe(false);
    component.ngOnDestroy();
  });

  it('supports cell & formula authoring, formatting, row/column insertion, range charts, real User comments (A1), child Whiteboards (A6), MAX(VersionNumber) saves (B5), and .xlsx fallback (E6)', async () => {
    const injector = Injector.create({
      providers: [
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => {}, detectChanges: () => {} } },
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: ArtifactFileService, useValue: null },
      ],
    });

    const { provider, savedConversations, savedDetails, savedArtifacts, savedVersions } =
      createMockSheetsProvider();
    const component = runInInjectionContext(
      injector,
      () => new SpreadsheetArtifactViewerComponent(),
    );
    component.Provider = provider;

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
    expect(component.CanEdit).toBe(true);
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

    // 4. Create an anchored SheetRange comment with @SheetsAgent mention -> saves ONLY User row, zero fake cell mutation (A1)
    component.SelectedRange = 'C5';
    component.SelectCell(5, 3);
    component.NewCommentText = '@SheetsAgent please review =ROUND(B5*1.12, 2)';
    await component.CreateAnchoredSheetRangeComment();
    expect(component.AnchoredThreads).toHaveLength(1);
    expect(component.AnchoredThreads[0].Messages).toHaveLength(1);
    expect(component.AnchoredThreads[0].Messages[0].Role).toBe('User');
    expect(component.ActiveSheet.Cells['C5']).toBeUndefined();
    expect(savedConversations).toHaveLength(1);
    expect(savedDetails).toHaveLength(1);
    expect(savedDetails[0].Role).toBe('User');

    // 5. Add an embedded Whiteboard -> creates real MJArtifactEntity + MJArtifactVersionEntity BEFORE pushing embedSpec (A6)
    await component.AddEmbeddedWhiteboardOnSheet();
    expect(savedArtifacts).toHaveLength(1);
    expect(component.ActiveSheet.EmbeddedArtifacts).toHaveLength(1);
    expect(component.ActiveSheet.EmbeddedArtifacts![0].ArtifactID).toBe(savedArtifacts[0].ID);
    expect(component.ActiveSheet.EmbeddedArtifacts![0].ArtifactVersionID).toBe(savedVersions[0].ID);

    // 6. Export .xlsx and .csv and verify round-trip (Accept #4)
    const xlsxBytes = component.ExportWorkbookAsXlsx();
    expect(xlsxBytes[0]).toBe(0x50);
    expect(xlsxBytes[1]).toBe(0x4b);
    const reimported = SpreadsheetEngine.Instance.ImportFromXlsxBytes(xlsxBytes);
    expect(reimported.Worksheets[0].Cells['B5']?.Formula).toBe('=SUM(B3:B4)');
    expect(reimported.Worksheets[0].Cells['B5']?.ComputedValue).toBe(400000);

    const csvText = component.ExportActiveSheetAsCsv();
    expect(csvText).toContain('Enterprise');
    expect(csvText).toContain('400000');

    // 7. SaveNewArtifactVersion queries MAX(VersionNumber)=3 -> saves v4 and resets IsSavingVersion (B5)
    await component.SaveNewArtifactVersion();
    expect(component.IsSavingVersion).toBe(false);
    expect(component.LastSavedVersionNumber).toBe(4);

    // 8. Binary .xlsx read-only fallback when ImportFromXlsxBytes throws on invalid third-party archive (E6)
    const invalidXlsxBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const badFile = {
      name: 'third-party-complex.xlsx',
      arrayBuffer: async () => invalidXlsxBytes.buffer,
    } as unknown as File;
    await component.OnImportFileSelected({
      target: { files: [badFile], value: 'third-party-complex.xlsx' },
    } as unknown as Event);
    expect(component.FallbackXlsxBytes).toBe(invalidXlsxBytes.buffer);
    expect(component.StatusBannerMessage).toContain('Showing read-only Excel preview');
    expect(component.CanEdit).toBe(false);

    component.ngOnDestroy();
  });
});
