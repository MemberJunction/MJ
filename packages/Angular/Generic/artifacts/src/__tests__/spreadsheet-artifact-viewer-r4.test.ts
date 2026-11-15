/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { getTestBed, TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  SpreadsheetEngine,
  type MJArtifactVersionEntity,
  type SpreadsheetCellSpec,
  type WorkbookSpec,
} from '@memberjunction/core-entities';
import { SpreadsheetArtifactViewerComponent } from '../lib/components/plugins/spreadsheet-artifact-viewer.component';
import {
  BuildSheetsContextMenu,
  type SheetsWorksheetTabContextTarget,
} from '../lib/components/plugins/context-menus/sheets-context-menu.helper';
import type { ContextMenuActionItem, ContextMenuItem } from '../lib/components/context-menu/context-menu.types';
import type { SheetsContextMenuCommand } from '../lib/components/plugins/context-menus/sheets-context-menu.helper';
import { ArtifactFileService } from '../lib/services/artifact-file.service';
import {
  DocumentCollaborationService,
  type DocumentCollaborationSession,
} from '../lib/services/document-collaboration.service';

const OWNER_USER_ID = '11111111-1111-4111-8111-111111111111';
const LOCKER_USER_ID = '22222222-2222-4222-8222-222222222222';
const EDITOR_USER_ID = '33333333-3333-4333-8333-333333333333';

function installJsdomStubs(): void {
  if (typeof window === 'undefined') return;
  if (!window.matchMedia) {
    const emptyMediaQuery: MediaQueryList = {
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    };
    window.matchMedia = () => emptyMediaQuery;
  }
  if (!('ResizeObserver' in window)) {
    class ResizeObserverStub {
      public observe(): void {}
      public unobserve(): void {}
      public disconnect(): void {}
    }
    Object.defineProperty(window, 'ResizeObserver', {
      value: ResizeObserverStub,
      configurable: true,
    });
  }
  if (!('IntersectionObserver' in window)) {
    class IntersectionObserverStub {
      public readonly root = null;
      public readonly rootMargin = '';
      public readonly thresholds: ReadonlyArray<number> = [];
      public observe(): void {}
      public unobserve(): void {}
      public disconnect(): void {}
      public takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    Object.defineProperty(window, 'IntersectionObserver', {
      value: IntersectionObserverStub,
      configurable: true,
    });
  }
}

function findActionItem(
  items: ReadonlyArray<ContextMenuItem<SheetsContextMenuCommand>>,
  id: string,
): ContextMenuActionItem<SheetsContextMenuCommand> | undefined {
  for (const item of items) {
    if (item.Kind === 'action' && item.ID === id) {
      return item;
    }
  }
  return undefined;
}

function createProviderWithUser(userId: string, userName: string, ownerId: string): IMetadataProvider {
  const user: Pick<UserInfo, 'ID' | 'Name' | 'Email' | 'IsActive'> = {
    ID: userId,
    Name: userName,
    Email: `${userName.toLowerCase().replace(/\s+/g, '.')}@memberjunction.org`,
    IsActive: true,
  };
  const artifactsEntityMeta = {
    ID: 'ent-artifacts-id',
    Name: 'MJ: Artifacts',
    DisplayNameOrName: 'MJ: Artifacts',
    FieldLevelSecurityApplies: false,
    GetUserPermisions: () => ({ CanRead: true }),
    Fields: [{ Name: 'ID', IsPrimaryKey: true, DefaultInView: true, IsBinaryFieldType: false, TSType: 'string' }],
  };
  const providerStub: {
    CurrentUser: Pick<UserInfo, 'ID' | 'Name' | 'Email' | 'IsActive'>;
    Entities: Array<typeof artifactsEntityMeta>;
    EntityByName: (name: string) => typeof artifactsEntityMeta | undefined;
    RunView: (params: { EntityName: string }) => Promise<{
      Success: boolean;
      Results: Array<{ ID: string; UserID: string; EnvironmentID: string }>;
      TotalRowCount: number;
    }>;
  } = {
    CurrentUser: user,
    Entities: [artifactsEntityMeta],
    EntityByName: (name: string) => (name === 'MJ: Artifacts' ? artifactsEntityMeta : undefined),
    RunView: async (params: { EntityName: string }) => {
      if (params.EntityName === 'MJ: Artifacts') {
        return {
          Success: true,
          Results: [{ ID: 'art-r4-1', UserID: ownerId, EnvironmentID: 'env-1' }],
          TotalRowCount: 1,
        };
      }
      return { Success: true, Results: [], TotalRowCount: 0 };
    },
  };
  return providerStub as IMetadataProvider;
}

function createArtifactVersionStub(wb: WorkbookSpec): MJArtifactVersionEntity {
  const versionStub: Pick<MJArtifactVersionEntity, 'ID' | 'ArtifactID' | 'VersionNumber' | 'Name' | 'Content'> = {
    ID: 'ver-r4-1',
    ArtifactID: 'art-r4-1',
    VersionNumber: 1,
    Name: wb.Title,
    Content: SpreadsheetEngine.Instance.SerializeWorkbook(wb),
  };
  return versionStub as MJArtifactVersionEntity;
}

describe('SpreadsheetArtifactViewerComponent — R4 Style Resets, Row/Col Yjs Sync, and ProtectedRange Delete Guards', () => {
  let collabService: DocumentCollaborationService;
  let fixture: ComponentFixture<SpreadsheetArtifactViewerComponent>;
  let component: SpreadsheetArtifactViewerComponent;

  beforeAll(() => {
    installJsdomStubs();
    const tb = getTestBed();
    if (!tb.platform) {
      tb.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    }
  });

  beforeEach(() => {
    collabService = new DocumentCollaborationService();
    TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule],
      declarations: [SpreadsheetArtifactViewerComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DocumentCollaborationService, useValue: collabService },
        { provide: ArtifactFileService, useValue: null },
      ],
    });
    fixture = TestBed.createComponent(SpreadsheetArtifactViewerComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture?.destroy();
    collabService.ngOnDestroy();
    vi.restoreAllMocks();
  });

  async function initComponentWithWorkbook(
    wb: WorkbookSpec,
    options: {
      userId?: string;
      userName?: string;
      ownerId?: string;
      permissionsSource?: 'Owner' | 'Shared';
    } = {},
  ): Promise<DocumentCollaborationSession> {
    const userId = options.userId ?? OWNER_USER_ID;
    const userName = options.userName ?? 'Owner User';
    const ownerId = options.ownerId ?? OWNER_USER_ID;
    const source = options.permissionsSource ?? 'Owner';

    vi.spyOn(collabService, 'ResolvePermissionsFromServer').mockResolvedValue({
      CanRead: true,
      CanEdit: true,
      CanComment: true,
      CanShare: source === 'Owner',
      Source: source,
    });

    component.Provider = createProviderWithUser(userId, userName, ownerId);
    component.readonly = false;
    component.artifactVersion = createArtifactVersionStub(wb);

    // First detectChanges triggers Angular ngOnInit -> initializeWorkbookSession()
    fixture.detectChanges();
    await vi.waitFor(() => {
      expect(component.CanEdit).toBe(true);
      expect(component.CollaborationSession).not.toBeNull();
    });
    fixture.detectChanges();
    return component.CollaborationSession!;
  }

  describe('1. Style reset no-ops fixed (DOM + model + Yjs sync)', () => {
    it('removes TextColor/BackgroundColor on Default swatch, clears all styles on Clear Formatting, and clears destination style on unstyled Paste All', async () => {
      const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Style Reset Test');
      const sheetId = wb.Worksheets[0].SheetID;

      SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'A2', { Value: 'Plain' });
      SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'B2', {
        Value: 1234.5,
        Style: {
          Bold: true,
          Italic: true,
          FormatType: 'currency',
          NumberFormatPattern: '$#,##0.00',
          TextColor: 'rgb(239, 68, 68)',
          BackgroundColor: 'rgb(254, 243, 199)',
        },
      });
      SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'C2', {
        Value: 42,
        Style: {
          Bold: true,
          TextColor: 'rgb(59, 130, 246)',
          BackgroundColor: 'rgb(219, 234, 254)',
        },
      });
      SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'D2', {
        Value: 'ColorOnly',
        Style: {
          TextColor: 'rgb(16, 185, 129)',
        },
      });

      const session = await initComponentWithWorkbook(wb);
      const sheetCellsByCoord = session.Doc.getMap<string>('sheetCellsByCoord');

      const tdB2Before = fixture.nativeElement.querySelector('[data-testid="sheet-cell-B2"]') as HTMLTableCellElement;
      expect(tdB2Before).not.toBeNull();
      expect(tdB2Before.classList.contains('is-bold')).toBe(true);
      expect(tdB2Before.classList.contains('is-italic')).toBe(true);
      expect(tdB2Before.style.color).toBe('rgb(239, 68, 68)');
      expect(tdB2Before.style.backgroundColor).toBe('rgb(254, 243, 199)');
      expect(tdB2Before.textContent).toContain('$1,234.50');

      // 1a. Default Text & No Fill swatches remove TextColor / BackgroundColor while keeping Bold/Italic/FormatType
      component.OnContextMenuCommand({
        Type: 'set-color',
        Target: 'text',
        CssColor: null,
        RangeA1: 'B2',
      });
      component.OnContextMenuCommand({
        Type: 'set-color',
        Target: 'fill',
        CssColor: null,
        RangeA1: 'B2',
      });
      fixture.detectChanges();

      const cellB2AfterSwatch = component.ActiveSheet.Cells['B2'];
      expect(cellB2AfterSwatch?.Style?.TextColor).toBeUndefined();
      expect(cellB2AfterSwatch?.Style?.BackgroundColor).toBeUndefined();
      expect('TextColor' in (cellB2AfterSwatch?.Style ?? {})).toBe(false);
      expect('BackgroundColor' in (cellB2AfterSwatch?.Style ?? {})).toBe(false);
      expect(cellB2AfterSwatch?.Style?.Bold).toBe(true);
      expect(cellB2AfterSwatch?.Style?.FormatType).toBe('currency');

      const tdB2AfterSwatch = fixture.nativeElement.querySelector('[data-testid="sheet-cell-B2"]') as HTMLTableCellElement;
      expect(tdB2AfterSwatch.style.color).toBe('');
      expect(tdB2AfterSwatch.style.backgroundColor).toBe('');
      expect(tdB2AfterSwatch.classList.contains('is-bold')).toBe(true);

      // Resetting the sole style property on D2 clears Style cleanly
      component.OnContextMenuCommand({
        Type: 'set-color',
        Target: 'text',
        CssColor: null,
        RangeA1: 'D2',
      });
      fixture.detectChanges();
      expect(component.ActiveSheet.Cells['D2']?.Style).toBeUndefined();
      const tdD2After = fixture.nativeElement.querySelector('[data-testid="sheet-cell-D2"]') as HTMLTableCellElement;
      expect(tdD2After.style.color).toBe('');

      // 1b. Clear Formatting removes all Style properties and updates DOM + Yjs
      component.OnContextMenuCommand({
        Type: 'clear-range',
        Kind: 'formatting',
        RangeA1: 'B2',
      });
      fixture.detectChanges();

      const cellB2Cleared = component.ActiveSheet.Cells['B2'];
      expect(cellB2Cleared?.Style).toBeUndefined();
      expect(cellB2Cleared?.RawValue).toBe(1234.5);
      expect(cellB2Cleared?.DisplayValue).toBe('1234.5');

      const tdB2Cleared = fixture.nativeElement.querySelector('[data-testid="sheet-cell-B2"]') as HTMLTableCellElement;
      expect(tdB2Cleared.classList.contains('is-bold')).toBe(false);
      expect(tdB2Cleared.classList.contains('is-italic')).toBe(false);
      expect(tdB2Cleared.style.color).toBe('');
      expect(tdB2Cleared.style.backgroundColor).toBe('');
      expect(tdB2Cleared.textContent).toContain('1234.5');

      const yjsB2Raw = sheetCellsByCoord.get(`${sheetId}::${cellB2Cleared!.RowID}::${cellB2Cleared!.ColumnID}`);
      expect(yjsB2Raw).toBeDefined();
      const yjsB2 = JSON.parse(yjsB2Raw!) as SpreadsheetCellSpec;
      expect(yjsB2.Style).toBeUndefined();

      // 1c. Pasting unstyled cell A2 ('Plain') via Paste All clears destination style on C2
      component.SelectCell(2, 1);
      component.OnContextMenuCommand({ Type: 'copy' });
      component.SelectCell(2, 3);
      await component.OnContextMenuCommand({ Type: 'paste', Kind: 'all' });
      await Promise.resolve();
      fixture.detectChanges();

      const cellC2Pasted = component.ActiveSheet.Cells['C2'];
      expect(cellC2Pasted?.RawValue).toBe('Plain');
      expect(cellC2Pasted?.Style).toBeUndefined();

      const tdC2Pasted = fixture.nativeElement.querySelector('[data-testid="sheet-cell-C2"]') as HTMLTableCellElement;
      expect(tdC2Pasted.classList.contains('is-bold')).toBe(false);
      expect(tdC2Pasted.style.color).toBe('');
      expect(tdC2Pasted.style.backgroundColor).toBe('');
      expect(tdC2Pasted.textContent).toContain('Plain');
    });

    it('does not strip existing.Style on a protected cell when Default swatch or Clear Formatting is attempted by non-owner', async () => {
      const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Protected Style Test');
      const sheetId = wb.Worksheets[0].SheetID;
      SpreadsheetEngine.Instance.SetCell(wb, sheetId, 'B2', {
        Value: 500,
        Style: { Bold: true, TextColor: 'rgb(239, 68, 68)' },
      });
      SpreadsheetEngine.Instance.AddProtectedRange(wb, sheetId, {
        RangeID: 'prot-style-1',
        Range: 'B2:B2',
        LockedByUserID: LOCKER_USER_ID,
        AllowEditors: false,
        Description: 'Locked by Alice',
      });

      await initComponentWithWorkbook(wb, {
        userId: EDITOR_USER_ID,
        userName: 'Non-Owner Editor',
        ownerId: OWNER_USER_ID,
        permissionsSource: 'Shared',
      });

      component.OnContextMenuCommand({
        Type: 'set-color',
        Target: 'text',
        CssColor: null,
        RangeA1: 'B2',
      });
      expect(component.ActiveSheet.Cells['B2']?.Style?.TextColor).toBe('rgb(239, 68, 68)');
      expect(component.StatusBannerMessage).toContain('protected');

      component.OnContextMenuCommand({
        Type: 'clear-range',
        Kind: 'formatting',
        RangeA1: 'B2',
      });
      expect(component.ActiveSheet.Cells['B2']?.Style?.Bold).toBe(true);
      expect(component.ActiveSheet.Cells['B2']?.Style?.TextColor).toBe('rgb(239, 68, 68)');
    });
  });

  describe('2. Row/Col insert/delete Yjs cell diff synchronization', () => {
    it('syncs shifted formulas, cross-sheet refs, and deleted cell removals to Yjs sheetCellsByCoord on row/col insert & delete', async () => {
      const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Structural Yjs Sync');
      const sheet1 = wb.Worksheets[0];
      const sheet2 = SpreadsheetEngine.Instance.AddWorksheet(wb, 'Summary');

      SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'A1', { Value: 'Item' });
      SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'B1', { Value: 'Amount' });
      SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'B2', { Value: 100 });
      SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'B3', { Value: 250 });
      SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'B4', { Formula: '=SUM(B2:B3)' });
      SpreadsheetEngine.Instance.SetCell(wb, sheet2.SheetID, 'A1', { Formula: `='${sheet1.Name}'!B4` });

      const origB2RowId = sheet1.Cells['B2']!.RowID;
      const origB3RowId = sheet1.Cells['B3']!.RowID;
      const origB4RowId = sheet1.Cells['B4']!.RowID;
      const origColBId = sheet1.Cells['B2']!.ColumnID;
      const sheet2A1RowId = sheet2.Cells['A1']!.RowID;
      const sheet2A1ColId = sheet2.Cells['A1']!.ColumnID;

      const session = await initComponentWithWorkbook(wb);
      const sheetCellsByCoord = session.Doc.getMap<string>('sheetCellsByCoord');

      // 1. Insert 1 row above row 2 -> B2..B4 shift to B3..B5; Sheet2!A1 updates to B5
      component.OnContextMenuCommand({
        Type: 'insert-rows',
        Position: 'above',
        Count: 1,
        AtRowIndex: 2,
      });

      const yjsAfterInsertRowB5 = JSON.parse(
        sheetCellsByCoord.get(`${sheet1.SheetID}::${origB4RowId}::${origColBId}`)!,
      ) as SpreadsheetCellSpec;
      expect(yjsAfterInsertRowB5.Address).toBe('B5');
      expect(yjsAfterInsertRowB5.Formula).toBe('=SUM(B3:B4)');
      expect(yjsAfterInsertRowB5.ComputedValue).toBe(350);

      const yjsAfterInsertRowB3 = JSON.parse(
        sheetCellsByCoord.get(`${sheet1.SheetID}::${origB2RowId}::${origColBId}`)!,
      ) as SpreadsheetCellSpec;
      expect(yjsAfterInsertRowB3.Address).toBe('B3');

      const yjsSheet2AfterInsertRow = JSON.parse(
        sheetCellsByCoord.get(`${sheet2.SheetID}::${sheet2A1RowId}::${sheet2A1ColId}`)!,
      ) as SpreadsheetCellSpec;
      expect(yjsSheet2AfterInsertRow.Formula).toContain('B5');

      // 2. Delete row 3 (which holds origB2RowId=100; origB3RowId=250 shifts up to B3!)
      component.OnContextMenuCommand({
        Type: 'delete-rows',
        StartRowIndex: 3,
        Count: 1,
      });

      // Deleted row cell MUST be removed from sheetCellsByCoord even though B3 is now occupied by origB3RowId
      expect(sheetCellsByCoord.has(`${sheet1.SheetID}::${origB2RowId}::${origColBId}`)).toBe(false);

      const yjsB3AfterDelete = JSON.parse(
        sheetCellsByCoord.get(`${sheet1.SheetID}::${origB3RowId}::${origColBId}`)!,
      ) as SpreadsheetCellSpec;
      expect(yjsB3AfterDelete.Address).toBe('B3');
      expect(yjsB3AfterDelete.RawValue).toBe(250);

      const yjsB4AfterDelete = JSON.parse(
        sheetCellsByCoord.get(`${sheet1.SheetID}::${origB4RowId}::${origColBId}`)!,
      ) as SpreadsheetCellSpec;
      expect(yjsB4AfterDelete.Address).toBe('B4');
      expect(yjsB4AfterDelete.ComputedValue).toBe(250);

      // 3. Insert 1 column left of col B -> col B shifts to col C
      component.OnContextMenuCommand({
        Type: 'insert-cols',
        Position: 'left',
        Count: 1,
        AtColIndex: 2,
      });

      const yjsC4AfterColInsert = JSON.parse(
        sheetCellsByCoord.get(`${sheet1.SheetID}::${origB4RowId}::${origColBId}`)!,
      ) as SpreadsheetCellSpec;
      expect(yjsC4AfterColInsert.Address).toBe('C4');
      expect(yjsC4AfterColInsert.Formula).toBe('=SUM(C3:C3)');

      // 4. Delete column C (col 3) -> removes origColBId cells from sheetCellsByCoord
      component.OnContextMenuCommand({
        Type: 'delete-cols',
        StartColIndex: 3,
        Count: 1,
      });
      expect(sheetCellsByCoord.has(`${sheet1.SheetID}::${origB4RowId}::${origColBId}`)).toBe(false);
      expect(sheetCellsByCoord.has(`${sheet1.SheetID}::${origB3RowId}::${origColBId}`)).toBe(false);
    });
  });

  describe('3. ProtectedRanges guards on sheet/row/col delete & context menu', () => {
    it('blocks non-owner deletion of sheets, rows, and cols intersecting ProtectedRanges, disables tab delete in UI & context menu, and allows artifact owner', async () => {
      const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Protected Deletes');
      const sheet1 = wb.Worksheets[0];
      const sheet2 = SpreadsheetEngine.Instance.AddWorksheet(wb, 'Unprotected Sheet');

      SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'A1', { Value: 'Open' });
      SpreadsheetEngine.Instance.SetCell(wb, sheet1.SheetID, 'B3', { Value: 'Locked Value' });
      SpreadsheetEngine.Instance.AddProtectedRange(wb, sheet1.SheetID, {
        RangeID: 'prot-range-1',
        Range: 'B3:C4',
        LockedByUserID: LOCKER_USER_ID,
        AllowEditors: false,
        Description: 'Finance locked range',
      });

      await initComponentWithWorkbook(wb, {
        userId: EDITOR_USER_ID,
        userName: 'Non-Owner Editor',
        ownerId: OWNER_USER_ID,
        permissionsSource: 'Shared',
      });
      const liveSheet1 = component.Workbook.Worksheets[0];
      const liveSheet2 = component.Workbook.Worksheets[1];

      // Tab close button in DOM must be disabled for sheet1 and enabled for sheet2
      const tabDeleteBtn1 = fixture.nativeElement.querySelector(
        `[data-testid="sheet-delete-tab-${liveSheet1.SheetID}"]`,
      ) as HTMLButtonElement;
      const tabDeleteBtn2 = fixture.nativeElement.querySelector(
        `[data-testid="sheet-delete-tab-${liveSheet2.SheetID}"]`,
      ) as HTMLButtonElement;
      expect(tabDeleteBtn1).not.toBeNull();
      expect(tabDeleteBtn1.disabled).toBe(true);
      expect(tabDeleteBtn1.title).toContain('Finance locked range');
      expect(tabDeleteBtn2).not.toBeNull();
      expect(tabDeleteBtn2.disabled).toBe(false);

      // Context menu helper disables sheets-tab-delete when ProtectedReason is present
      component.OnWorksheetTabContextMenu(new MouseEvent('contextmenu'), liveSheet1);
      const tabDeleteMenuItem = findActionItem(component.ContextMenuItems, 'sheets-tab-delete');
      expect(tabDeleteMenuItem?.Disabled).toBe(true);
      expect(tabDeleteMenuItem?.DisabledReason).toContain('Finance locked range');

      const directTarget: SheetsWorksheetTabContextTarget = {
        Kind: 'worksheet-tab',
        SheetID: liveSheet1.SheetID,
        SheetName: liveSheet1.Name,
        SheetIndex: 0,
        TotalSheets: 2,
        RowCount: liveSheet1.Rows.length,
        ColCount: liveSheet1.Columns.length,
        HiddenRowCount: 0,
        HiddenColCount: 0,
        ProtectedReason: 'Finance locked range',
      };
      const builtMenu = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: true,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: directTarget,
      });
      const builtDelete = findActionItem(builtMenu, 'sheets-tab-delete');
      expect(builtDelete?.Disabled).toBe(true);
      expect(builtDelete?.DisabledReason).toBe('Finance locked range');

      // Direct DeleteWorksheetTab & context-menu deleteWorksheetById are blocked for non-owner
      component.DeleteWorksheetTab(liveSheet1.SheetID, new MouseEvent('click'));
      expect(component.Workbook.Worksheets.map((w) => w.SheetID)).toEqual([liveSheet1.SheetID, liveSheet2.SheetID]);
      expect(component.StatusBannerMessage).toContain('Finance locked range');

      component.OnContextMenuCommand({ Type: 'delete-sheet', SheetID: liveSheet1.SheetID });
      expect(component.Workbook.Worksheets.map((w) => w.SheetID)).toEqual([liveSheet1.SheetID, liveSheet2.SheetID]);

      // deleteRowsAt on protected row 3 is blocked
      const initialRowCount = liveSheet1.Rows.length;
      component.OnContextMenuCommand({ Type: 'delete-rows', StartRowIndex: 3, Count: 1 });
      expect(liveSheet1.Rows.length).toBe(initialRowCount);
      expect(liveSheet1.Cells['B3']?.RawValue).toBe('Locked Value');

      // deleteColsAt on protected col B (2) is blocked
      const initialColCount = liveSheet1.Columns.length;
      component.OnContextMenuCommand({ Type: 'delete-cols', StartColIndex: 2, Count: 1 });
      expect(liveSheet1.Columns.length).toBe(initialColCount);
      expect(liveSheet1.Cells['B3']?.RawValue).toBe('Locked Value');

      // Deleting unprotected row 1 and unprotected col A (1) succeeds for non-owner
      component.OnContextMenuCommand({ Type: 'delete-rows', StartRowIndex: 1, Count: 1 });
      expect(liveSheet1.Rows.length).toBe(initialRowCount - 1);
      // B3 shifted to B2 and ProtectedRanges shifted to B2:C3
      expect(liveSheet1.Cells['B2']?.RawValue).toBe('Locked Value');

      component.OnContextMenuCommand({ Type: 'delete-cols', StartColIndex: 1, Count: 1 });
      expect(liveSheet1.Columns.length).toBe(initialColCount - 1);
      // B2 shifted to A2
      expect(liveSheet1.Cells['A2']?.RawValue).toBe('Locked Value');

      // Artifact owner (case-insensitive GUID match via UUIDsEqual) CAN delete protected rows, cols, and sheets
      component.Provider = createProviderWithUser(
        OWNER_USER_ID.toUpperCase(),
        'Owner Uppercase',
        OWNER_USER_ID.toLowerCase(),
      );
      component.Permissions = {
        CanRead: true,
        CanEdit: true,
        CanComment: true,
        CanShare: true,
        Source: 'Owner',
      };
      fixture.detectChanges();

      const ownerTabDeleteBtn1 = fixture.nativeElement.querySelector(
        `[data-testid="sheet-delete-tab-${liveSheet1.SheetID}"]`,
      ) as HTMLButtonElement;
      expect(ownerTabDeleteBtn1.disabled).toBe(false);

      component.OnContextMenuCommand({ Type: 'delete-rows', StartRowIndex: 2, Count: 1 });
      expect(liveSheet1.Cells['A2']).toBeUndefined();

      component.DeleteWorksheetTab(liveSheet1.SheetID, new MouseEvent('click'));
      expect(component.Workbook.Worksheets.map((w) => w.SheetID)).toEqual([liveSheet2.SheetID]);
    });
  });
});
