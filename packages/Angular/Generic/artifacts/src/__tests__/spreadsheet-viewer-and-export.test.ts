/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { Injector, runInInjectionContext, ChangeDetectorRef } from '@angular/core';
import type { EntityInfo, EntityUserPermissionInfo, IMetadataProvider, IRunViewProvider } from '@memberjunction/core';
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

  interface SavedRecordStub {
    ID: string;
    Role?: string;
    ArtifactID?: string;
    ArtifactVersionID?: string;
    VersionNumber?: number;
    Name?: string;
    Content?: string;
    NewRecord: () => void;
    Load: () => Promise<boolean>;
    Save: () => Promise<boolean>;
  }

  function stubEntity<T extends object>(fields: Partial<T>): T {
    return Object.assign(Object.create(null) as T, fields);
  }

  const SHEET_ARTIFACT_ID = '11111111-1111-4111-8111-111111111111';
  const SHEET_VERSION_ID = '22222222-2222-4222-8222-222222222222';
  const SHEET_ENV_ID = '33333333-3333-4333-8333-333333333333';
  const WB_TYPE_ID = '44444444-4444-4444-8444-444444444444';
  const EXISTING_VER_3_ID = '55555555-5555-4555-8555-555555555555';

  function createMockSheetsProvider(ownerId = '11111111-2222-4333-8444-555555555555') {
    const savedConversations: SavedRecordStub[] = [];
    const savedDetails: SavedRecordStub[] = [];
    const savedArtifacts: SavedRecordStub[] = [];
    const savedVersions: SavedRecordStub[] = [];
    let seq = 0;

    const user = {
      ID: ownerId,
      Name: 'Dana Analyst',
      Email: 'dana@memberjunction.org',
      IsActive: true,
    };

    const provider = stubEntity<IMetadataProvider & IRunViewProvider>({
      CurrentUser: stubEntity<IMetadataProvider['CurrentUser']>(user),
      Entities: [
        stubEntity<IMetadataProvider['Entities'][number]>({
          ID: '66666666-6666-4666-8666-666666666666',
          Name: 'MJ: Artifacts',
          DisplayNameOrName: 'MJ: Artifacts',
          FieldLevelSecurityApplies: false,
          GetUserPermisions: () => stubEntity<EntityUserPermissionInfo>({ CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false }),
          Fields: [],
        }),
      ],
      EntityByName: (name: string) =>
        name === 'MJ: Artifacts'
          ? stubEntity<EntityInfo>({
              ID: '66666666-6666-4666-8666-666666666666',
              Name: 'MJ: Artifacts',
            })
          : undefined,
      RunView: async <T>(params: { EntityName: string }) => {
        if (params.EntityName === 'MJ: Artifacts') {
          return {
            Success: true,
            Results: [Object.assign(Object.create(null), { ID: SHEET_ARTIFACT_ID, UserID: ownerId, EnvironmentID: SHEET_ENV_ID })] as T[],
            TotalRowCount: 1,
            RowCount: 1,
            UserViewRunID: '',
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        if (params.EntityName === 'MJ: Artifact Types') {
          return {
            Success: true,
            Results: [Object.assign(Object.create(null), { ID: WB_TYPE_ID, Name: 'Whiteboard' })] as T[],
            TotalRowCount: 1,
            RowCount: 1,
            UserViewRunID: '',
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        if (params.EntityName === 'MJ: Artifact Versions') {
          return {
            Success: true,
            Results: [Object.assign(Object.create(null), { ID: EXISTING_VER_3_ID, VersionNumber: 3 })] as T[],
            TotalRowCount: 1,
            RowCount: 1,
            UserViewRunID: '',
            ExecutionTime: 1,
            ErrorMessage: '',
          };
        }
        return {
          Success: true,
          Results: [] as T[],
          TotalRowCount: 0,
          RowCount: 0,
          UserViewRunID: '',
          ExecutionTime: 1,
          ErrorMessage: '',
        };
      },
      GetEntityObject: async (entityName: string) => {
        const rec: SavedRecordStub = {
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
    });

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
    component.artifactVersion = stubEntity<MJArtifactVersionEntity>({
      ID: 'ver-protected-1',
      ArtifactID: 'art-protected-1',
      VersionNumber: 1,
      Name: 'Protected Sheet',
      Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
    });
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

    component.artifactVersion = stubEntity<MJArtifactVersionEntity>({
      ID: SHEET_VERSION_ID,
      ArtifactID: SHEET_ARTIFACT_ID,
      VersionNumber: 1,
      Name: 'FY27 Revenue Model',
      Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
    });
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
    const badFile = new File([], 'third-party-complex.xlsx');
    Object.defineProperty(badFile, 'arrayBuffer', {
      value: async () => invalidXlsxBytes.buffer,
    });
    const fileInputEvent = new Event('change');
    Object.defineProperty(fileInputEvent, 'target', {
      value: { files: [badFile], value: 'third-party-complex.xlsx' },
    });
    await component.OnImportFileSelected(fileInputEvent);
    expect(component.FallbackXlsxBytes).toBe(invalidXlsxBytes.buffer);
    expect(component.StatusBannerMessage).toContain('Showing read-only Excel preview');
    expect(component.CanEdit).toBe(false);

    component.ngOnDestroy();
  });
});
