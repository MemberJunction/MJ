import { describe, it, expect } from 'vitest';
import {
  BuildSheetsContextMenu,
  SHEETS_FILL_COLOR_SWATCHES,
  SHEETS_TEXT_COLOR_SWATCHES,
  type SheetsCellContextTarget,
  type SheetsChartContextTarget,
  type SheetsColumnHeaderContextTarget,
  type SheetsContextMenuCommand,
  type SheetsContextMenuSnapshot,
  type SheetsEmbeddedArtifactContextTarget,
  type SheetsLiveTableContextTarget,
  type SheetsRowHeaderContextTarget,
  type SheetsWorksheetTabContextTarget,
} from './sheets-context-menu.helper';
import type {
  ContextMenuActionItem,
  ContextMenuItem,
  ContextMenuSubmenuItem,
  ContextMenuSwatchRowItem,
} from '../../context-menu/context-menu.types';

function findAction(
  items: ReadonlyArray<ContextMenuItem<SheetsContextMenuCommand>>,
  id: string
): ContextMenuActionItem<SheetsContextMenuCommand> | undefined {
  for (const item of items) {
    if (item.Kind === 'action' && item.ID === id) return item;
    if (item.Kind === 'submenu') {
      const nested = findAction(item.Children, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

function findSubmenu(
  items: ReadonlyArray<ContextMenuItem<SheetsContextMenuCommand>>,
  id: string
): ContextMenuSubmenuItem<SheetsContextMenuCommand> | undefined {
  for (const item of items) {
    if (item.Kind === 'submenu') {
      if (item.ID === id) return item;
      const nested = findSubmenu(item.Children, id);
      if (nested) return nested;
    }
  }
  return undefined;
}

function findSwatchRow(
  items: ReadonlyArray<ContextMenuItem<SheetsContextMenuCommand>>,
  id: string
): ContextMenuSwatchRowItem<SheetsContextMenuCommand> | undefined {
  for (const item of items) {
    if (item.Kind === 'swatch-row' && item.ID === id) return item;
  }
  return undefined;
}

function makeCellTarget(overrides: Partial<SheetsCellContextTarget> = {}): SheetsCellContextTarget {
  return {
    Kind: 'cell',
    SheetID: 'sheet-1',
    AnchorA1: 'B2',
    RangeA1: 'B2',
    StartRow: 2,
    EndRow: 2,
    StartCol: 2,
    EndCol: 2,
    TotalRows: 20,
    TotalCols: 10,
    HasFormula: false,
    HasMjFormula: false,
    SpilledFromA1: null,
    SpillRangeA1: null,
    IntersectsLiveOrChartBlock: false,
    CurrentFormat: 'general',
    IsBold: false,
    IsItalic: false,
    HorizontalAlign: 'left',
    TextColor: null,
    BackgroundColor: null,
    ProtectedReason: null,
    RangeThreadCount: 0,
    ...overrides,
  };
}

describe('BuildSheetsContextMenu', () => {
  describe('Zone 4a — Cell & Multi-Range Selection', () => {
    it('builds full edit menu for multi-cell selection with pluralized insert/delete and Mac/Win shortcuts', () => {
      const ctx: SheetsContextMenuSnapshot = {
        CanEdit: true,
        CanComment: true,
        HasClipboardData: true,
        ClipboardSourceRangeA1: 'A1:B2',
        IsMac: true,
        Target: makeCellTarget({
          AnchorA1: 'C3',
          RangeA1: 'B2:D4',
          StartRow: 2,
          EndRow: 4,
          StartCol: 2,
          EndCol: 4,
          HasFormula: true,
          CurrentFormat: 'currency',
          IsBold: true,
          HorizontalAlign: 'right',
          RangeThreadCount: 2,
        }),
      };

      const items = BuildSheetsContextMenu(ctx);
      expect(items[0]).toMatchObject({
        Kind: 'header',
        Label: 'Selection B2:D4 (3×3)',
      });

      const cut = findAction(items, 'sheets-cut');
      expect(cut?.Shortcut).toBe('⌘X');
      expect(cut?.Disabled).toBe(false);

      const copyFormula = findAction(items, 'sheets-copy-formula');
      expect(copyFormula?.Disabled).toBe(false);

      const pasteValues = findAction(items, 'sheets-paste-values');
      expect(pasteValues?.Disabled).toBe(false);
      expect(pasteValues?.Command).toEqual({ Type: 'paste', Kind: 'values' });

      const pasteFormatting = findAction(items, 'sheets-paste-formatting');
      expect(pasteFormatting?.Command).toEqual({ Type: 'paste', Kind: 'formatting' });

      expect(findAction(items, 'sheets-insert-row-above')?.Label).toBe('Insert 3 Rows Above');
      expect(findAction(items, 'sheets-insert-col-right')?.Label).toBe('Insert 3 Columns Right');
      expect(findAction(items, 'sheets-delete-rows')?.Destructive).toBe(true);

      const currencyFmt = findAction(items, 'sheets-fmt-currency');
      expect(currencyFmt?.Role).toBe('menuitemradio');
      expect(currencyFmt?.Checked).toBe(true);

      const bold = findAction(items, 'sheets-toggle-bold');
      expect(bold?.Role).toBe('menuitemcheckbox');
      expect(bold?.Checked).toBe(true);
      expect(bold?.Shortcut).toBe('⌘B');

      const alignRight = findAction(items, 'sheets-align-right');
      expect(alignRight?.Checked).toBe(true);

      const viewComments = findAction(items, 'sheets-view-comments');
      expect(viewComments?.BadgeText).toBe('2');

      expect(findAction(items, 'sheets-create-chart')?.Command).toEqual({
        Type: 'create-chart-from-selection',
        RangeA1: 'B2:D4',
      });
    });

    it('includes contextual =MJ.* formula, spill range, and live block JSON actions when applicable', () => {
      const ctx: SheetsContextMenuSnapshot = {
        CanEdit: true,
        CanComment: true,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        IsMac: false,
        Target: makeCellTarget({
          AnchorA1: 'A2',
          RangeA1: 'A2',
          HasFormula: true,
          HasMjFormula: true,
          SpilledFromA1: 'A2',
          SpillRangeA1: 'A2:D12',
          IntersectsLiveOrChartBlock: true,
        }),
      };

      const items = BuildSheetsContextMenu(ctx);
      expect(findAction(items, 'sheets-copy')?.Shortcut).toBe('Ctrl+C');
      expect(findAction(items, 'sheets-copy-live-block')?.Command).toEqual({
        Type: 'copy-special',
        Kind: 'live-block',
      });
      expect(findAction(items, 'sheets-refresh-mj-formula')?.Command).toEqual({
        Type: 'refresh-mj-formula',
        AddressA1: 'A2',
      });
      expect(findAction(items, 'sheets-inspect-mj-formula')).toBeDefined();
      expect(findAction(items, 'sheets-select-spill-range')?.Command).toEqual({
        Type: 'select-spill-range',
        RangeA1: 'A2:D12',
      });
    });

    it('disables mutating commands with DisabledReason when selection overlaps a protected range', () => {
      const ctx: SheetsContextMenuSnapshot = {
        CanEdit: true,
        CanComment: true,
        HasClipboardData: true,
        ClipboardSourceRangeA1: 'A1',
        Target: makeCellTarget({
          ProtectedReason: 'Locked by Finance Admin',
        }),
      };

      const items = BuildSheetsContextMenu(ctx);
      expect(findAction(items, 'sheets-cut')?.Disabled).toBe(true);
      expect(findAction(items, 'sheets-cut')?.DisabledReason).toBe('Locked by Finance Admin');
      expect(findAction(items, 'sheets-paste')?.Disabled).toBe(true);
      expect(findSubmenu(items, 'sheets-paste-special')?.Disabled).toBe(true);
      expect(findAction(items, 'sheets-insert-row-above')?.Disabled).toBe(true);
      expect(findSubmenu(items, 'sheets-clear-submenu')?.Disabled).toBe(true);
      expect(findAction(items, 'sheets-toggle-bold')?.Disabled).toBe(true);
      expect(findSwatchRow(items, 'sheets-fill-color')?.Disabled).toBe(true);
      // Copy & comments remain enabled
      expect(findAction(items, 'sheets-copy')?.Disabled).toBeFalsy();
      expect(findAction(items, 'sheets-add-comment')?.Disabled).toBeFalsy();
    });

    it('uses only semantic --mj-* CSS variables (zero raw hex/rgb/hsl) in color swatch rows', () => {
      const allSwatches = [...SHEETS_FILL_COLOR_SWATCHES, ...SHEETS_TEXT_COLOR_SWATCHES];
      for (const swatch of allSwatches) {
        expect(swatch.CssColor).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(swatch.CssColor).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/i);
        if (swatch.CssColor !== 'transparent') {
          expect(swatch.CssColor).toContain('--mj-');
        }
      }

      const items = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: false,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: makeCellTarget({
          BackgroundColor: SHEETS_FILL_COLOR_SWATCHES[2].CssColor,
          TextColor: null,
        }),
      });

      const fillRow = findSwatchRow(items, 'sheets-fill-color');
      expect(fillRow?.Swatches[0].IsClearSwatch).toBe(true);
      expect(fillRow?.Swatches[2].Selected).toBe(true);

      const textRow = findSwatchRow(items, 'sheets-text-color');
      expect(textRow?.Swatches[0].IsClearSwatch).toBe(true);
      expect(textRow?.Swatches[0].Selected).toBe(true);
    });
  });

  describe('Zone 4b & 4c — Row & Column Headers', () => {
    it('builds row header menu with height, freeze toggle, hide, and unhide adjacent rows', () => {
      const target: SheetsRowHeaderContextTarget = {
        Kind: 'row-header',
        SheetID: 'sheet-1',
        StartRow: 3,
        EndRow: 3,
        TotalRows: 10,
        TotalCols: 5,
        CurrentFrozenRows: 3,
        HasAdjacentHiddenRows: true,
        ProtectedReason: null,
        RangeThreadCount: 0,
      };
      const items = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: true,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: target,
      });

      expect(findAction(items, 'sheets-select-row')?.Command).toEqual({
        Type: 'select-row',
        RowIndex: 3,
        StartRow: 3,
        EndRow: 3,
      });
      const freeze = findAction(items, 'sheets-row-freeze');
      expect(freeze?.Checked).toBe(true);
      expect(freeze?.Label).toBe('Unfreeze Rows');
      expect(freeze?.Command).toEqual({ Type: 'freeze-up-to-row', RowIndex: 0 });
      expect(findAction(items, 'sheets-row-set-height')).toBeDefined();
      expect(findAction(items, 'sheets-row-autofit-height')).toBeDefined();
      expect(findAction(items, 'sheets-row-hide')).toBeDefined();
      expect(findAction(items, 'sheets-row-unhide-adjacent')).toBeDefined();
    });

    it('builds column header menu with A->Z / Z->A sort, number format, width, freeze, and unhide', () => {
      const target: SheetsColumnHeaderContextTarget = {
        Kind: 'col-header',
        SheetID: 'sheet-1',
        StartCol: 2,
        EndCol: 2,
        StartColLetter: 'B',
        EndColLetter: 'B',
        TotalRows: 15,
        TotalCols: 6,
        CurrentFrozenColumns: 1,
        CurrentFormat: 'percent',
        HasAdjacentHiddenCols: true,
        ProtectedReason: null,
        RangeThreadCount: 1,
      };
      const items = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: true,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: target,
      });

      expect(findAction(items, 'sheets-col-sort-asc')?.Command).toEqual({
        Type: 'sort-col',
        ColumnLetter: 'B',
        Direction: 'asc',
      });
      expect(findAction(items, 'sheets-col-sort-desc')?.Command).toEqual({
        Type: 'sort-col',
        ColumnLetter: 'B',
        Direction: 'desc',
      });
      expect(findAction(items, 'sheets-fmt-percent')?.Checked).toBe(true);
      expect(findAction(items, 'sheets-col-freeze')?.Command).toEqual({
        Type: 'freeze-up-to-col',
        ColIndex: 2,
      });
      expect(findAction(items, 'sheets-col-autofit-width')).toBeDefined();
      expect(findAction(items, 'sheets-col-unhide-adjacent')).toBeDefined();
      expect(findAction(items, 'sheets-view-comments')?.BadgeText).toBe('1');
    });
  });

  describe('Zone 4d — Worksheet Tabs', () => {
    it('guards last worksheet deletion and first/last tab move directions', () => {
      const singleTab: SheetsWorksheetTabContextTarget = {
        Kind: 'worksheet-tab',
        SheetID: 's1',
        SheetName: 'Summary',
        SheetIndex: 0,
        TotalSheets: 1,
        RowCount: 50,
        ColCount: 8,
        HiddenRowCount: 2,
        HiddenColCount: 1,
      };

      const items = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: true,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: singleTab,
      });

      expect(items[0]).toMatchObject({
        Kind: 'header',
        Label: 'Summary (50 rows × 8 cols)',
      });
      expect(findAction(items, 'sheets-tab-rename')?.Shortcut).toBe('DblClick');
      expect(findAction(items, 'sheets-tab-move-left')?.Disabled).toBe(true);
      expect(findAction(items, 'sheets-tab-move-right')?.Disabled).toBe(true);
      expect(findAction(items, 'sheets-tab-unhide-all')?.Label).toContain('2 rows, 1 cols');
      const del = findAction(items, 'sheets-tab-delete');
      expect(del?.Destructive).toBe(true);
      expect(del?.Disabled).toBe(true);
      expect(del?.DisabledReason).toContain('at least one worksheet');
    });
  });

  describe('Zone 4e — Range Charts (sheet/dock), Live Tables & Embedded Artifacts', () => {
    it('uses sheet/dock Placement for floating and docked charts and shows Reset Size / Bring to Front only when applicable', () => {
      const floatingChart: SheetsChartContextTarget = {
        Kind: 'chart',
        SheetID: 's1',
        ChartID: 'c1',
        Title: 'Revenue Trend',
        ChartType: 'line',
        Placement: 'sheet',
        DataRangeA1: 'A1:B12',
        HasCustomSize: true,
        FloatingChartCount: 2,
      };

      const floatingItems = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: true,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: floatingChart,
      });

      expect(floatingItems[0]).toMatchObject({ Label: 'Revenue Trend (On Sheet)' });
      expect(findAction(floatingItems, 'sheets-chart-type-line')?.Checked).toBe(true);
      expect(findAction(floatingItems, 'sheets-chart-toggle-placement')?.Label).toBe('Dock Chart to Sidebar');
      expect(findAction(floatingItems, 'sheets-chart-reset-size')).toBeDefined();
      expect(findAction(floatingItems, 'sheets-chart-bring-front')).toBeDefined();
      expect(findAction(floatingItems, 'sheets-chart-copy-slide-block')).toBeDefined();

      const dockedItems = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: true,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: {
          ...floatingChart,
          Placement: 'dock',
          HasCustomSize: false,
          FloatingChartCount: 1,
        },
      });

      expect(dockedItems[0]).toMatchObject({ Label: 'Revenue Trend (Docked)' });
      expect(findAction(dockedItems, 'sheets-chart-toggle-placement')?.Label).toBe('Float Chart on Sheet');
      expect(findAction(dockedItems, 'sheets-chart-reset-size')).toBeUndefined();
      expect(findAction(dockedItems, 'sheets-chart-bring-front')).toBeUndefined();
    });

    it('builds live table and embedded OLE artifact menus', () => {
      const liveTarget: SheetsLiveTableContextTarget = {
        Kind: 'live-table',
        SheetID: 's1',
        TableID: 'lt1',
        Title: 'Active Users',
        Mode: 'Live',
        RangeA1: 'A1:D25',
      };
      const liveItems = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: false,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: liveTarget,
      });
      expect(findAction(liveItems, 'sheets-live-table-refresh')).toBeDefined();
      expect(findAction(liveItems, 'sheets-live-table-toggle-mode')?.Label).toBe('Freeze Snapshot');
      expect(findAction(liveItems, 'sheets-live-table-delete')?.Destructive).toBe(true);

      const embedTarget: SheetsEmbeddedArtifactContextTarget = {
        Kind: 'embedded-artifact',
        SheetID: 's1',
        EmbedID: 'emb1',
        Title: 'Architecture Diagram',
        ArtifactType: 'Whiteboard',
        AnchorCellA1: 'G4',
        HasSourceArtifactID: true,
      };
      const embedItems = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: false,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: embedTarget,
      });
      expect(findAction(embedItems, 'sheets-embed-open-source')).toBeDefined();
      expect(findAction(embedItems, 'sheets-embed-select-anchor')?.Label).toBe('Select Anchor Cell (G4)');
      expect(findAction(embedItems, 'sheets-embed-delete')?.Destructive).toBe(true);
    });
  });

  describe('Zone 4f — Read-Only Viewer Mode', () => {
    it('omits all mutating actions on cells while retaining copy, comments, spill, and export', () => {
      const items = BuildSheetsContextMenu({
        CanEdit: false,
        CanComment: true,
        HasClipboardData: true,
        ClipboardSourceRangeA1: 'A1',
        Target: makeCellTarget({
          HasFormula: true,
          HasMjFormula: true,
          SpilledFromA1: 'B2',
          SpillRangeA1: 'B2:D6',
          RangeThreadCount: 1,
        }),
      });

      expect(findAction(items, 'sheets-cut')).toBeUndefined();
      expect(findAction(items, 'sheets-paste')).toBeUndefined();
      expect(findSubmenu(items, 'sheets-paste-special')).toBeUndefined();
      expect(findAction(items, 'sheets-insert-row-above')).toBeUndefined();
      expect(findAction(items, 'sheets-delete-rows')).toBeUndefined();
      expect(findSubmenu(items, 'sheets-clear-submenu')).toBeUndefined();
      expect(findSubmenu(items, 'sheets-number-format')).toBeUndefined();
      expect(findAction(items, 'sheets-toggle-bold')).toBeUndefined();
      expect(findSwatchRow(items, 'sheets-fill-color')).toBeUndefined();
      expect(findAction(items, 'sheets-create-chart')).toBeUndefined();

      expect(findAction(items, 'sheets-copy')).toBeDefined();
      expect(findAction(items, 'sheets-copy-values')).toBeDefined();
      expect(findAction(items, 'sheets-copy-formula')).toBeDefined();
      expect(findAction(items, 'sheets-copy-csv')).toBeDefined();
      expect(findAction(items, 'sheets-copy-markdown')).toBeDefined();
      expect(findAction(items, 'sheets-refresh-mj-formula')).toBeDefined();
      expect(findAction(items, 'sheets-select-spill-range')).toBeDefined();
      expect(findAction(items, 'sheets-view-comments')).toBeDefined();
      expect(findAction(items, 'sheets-add-comment')).toBeDefined();
      expect(findAction(items, 'sheets-viewer-export-csv')).toBeDefined();
      expect(findAction(items, 'sheets-viewer-export-xlsx')).toBeDefined();
    });

    it('omits mutating actions on charts and live tables while retaining read-only inspection & copy', () => {
      const chartItems = BuildSheetsContextMenu({
        CanEdit: false,
        CanComment: false,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: {
          Kind: 'chart',
          SheetID: 's1',
          ChartID: 'c1',
          Title: 'Metrics',
          ChartType: 'bar',
          Placement: 'dock',
          DataRangeA1: 'A1:C5',
          HasCustomSize: false,
          FloatingChartCount: 0,
        },
      });
      expect(findAction(chartItems, 'sheets-chart-edit')).toBeUndefined();
      expect(findSubmenu(chartItems, 'sheets-chart-type')).toBeUndefined();
      expect(findAction(chartItems, 'sheets-chart-toggle-placement')).toBeUndefined();
      expect(findAction(chartItems, 'sheets-chart-delete')).toBeUndefined();
      expect(findAction(chartItems, 'sheets-chart-select-source')).toBeDefined();
      expect(findAction(chartItems, 'sheets-chart-copy-slide-block')).toBeDefined();

      const liveItems = BuildSheetsContextMenu({
        CanEdit: false,
        CanComment: false,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: {
          Kind: 'live-table',
          SheetID: 's1',
          TableID: 'lt1',
          Title: 'Orders',
          Mode: 'Live',
          RangeA1: 'A1:E10',
        },
      });
      expect(findAction(liveItems, 'sheets-live-table-refresh')).toBeUndefined();
      expect(findAction(liveItems, 'sheets-live-table-select-range')).toBeDefined();
      expect(findAction(liveItems, 'sheets-live-table-copy-block')).toBeDefined();
      expect(findAction(liveItems, 'sheets-live-table-toggle-mode')).toBeUndefined();
      expect(findAction(liveItems, 'sheets-live-table-delete')).toBeUndefined();
    });

    it('hides sheets-live-table-refresh on Frozen live tables even when CanEdit is true', () => {
      const frozenItems = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: true,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: {
          Kind: 'live-table',
          SheetID: 's1',
          TableID: 'lt-frozen',
          Title: 'Snapshot Table',
          Mode: 'Frozen',
          RangeA1: 'A1:C5',
        },
      });
      expect(findAction(frozenItems, 'sheets-live-table-refresh')).toBeUndefined();
      expect(findAction(frozenItems, 'sheets-live-table-edit')).toBeDefined();
      expect(findAction(frozenItems, 'sheets-live-table-toggle-mode')).toBeDefined();
    });

    it('carries StartCol/EndCol on select-col and disables hiding last remaining visible row/col', () => {
      const colItems = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: true,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: {
          Kind: 'col-header',
          SheetID: 's1',
          StartCol: 2,
          EndCol: 4,
          StartColLetter: 'B',
          EndColLetter: 'D',
          TotalRows: 10,
          TotalCols: 6,
          VisibleCols: 3,
          VisibleColsInRange: 3,
          CurrentFrozenColumns: 0,
          HasAdjacentHiddenCols: false,
          ProtectedReason: null,
          RangeThreadCount: 0,
        },
      });
      expect(findAction(colItems, 'sheets-select-col')?.Command).toEqual({
        Type: 'select-col',
        ColIndex: 2,
        StartCol: 2,
        EndCol: 4,
      });
      expect(findAction(colItems, 'sheets-col-hide')?.Disabled).toBe(true);

      const rowItems = BuildSheetsContextMenu({
        CanEdit: true,
        CanComment: true,
        HasClipboardData: false,
        ClipboardSourceRangeA1: null,
        Target: {
          Kind: 'row-header',
          SheetID: 's1',
          StartRow: 1,
          EndRow: 5,
          TotalRows: 10,
          TotalCols: 5,
          VisibleRows: 5,
          VisibleRowsInRange: 5,
          CurrentFrozenRows: 0,
          HasAdjacentHiddenRows: false,
          ProtectedReason: null,
          RangeThreadCount: 0,
        },
      });
      expect(findAction(rowItems, 'sheets-row-hide')?.Disabled).toBe(true);
    });
  });
});
