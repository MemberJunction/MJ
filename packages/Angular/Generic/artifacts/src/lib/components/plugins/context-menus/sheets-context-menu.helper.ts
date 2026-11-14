import type {
  SpreadsheetCellFormatType,
  SpreadsheetCellStyleSpec,
  SpreadsheetChartSpec,
  SpreadsheetChartType,
  SpreadsheetLiveTableSpec,
} from '@memberjunction/core-entities';
import { FormatMenuShortcut } from '../../context-menu/context-menu-position.util';
import type {
  ContextMenuCommandBase,
  ContextMenuItem,
  ContextMenuSwatchOption,
} from '../../context-menu/context-menu.types';

export type SheetsHorizontalAlign = NonNullable<SpreadsheetCellStyleSpec['HorizontalAlign']>;
export type SheetsLiveTableMode = SpreadsheetLiveTableSpec['Mode'];
export type SheetsChartPlacement = NonNullable<SpreadsheetChartSpec['Placement']>;

export type SheetsClipboardMode = 'copy' | 'cut';

export interface SheetsClipboardCellEntry {
  readonly RowOffset: number;
  readonly ColOffset: number;
  readonly Value: string | number | boolean | null;
  readonly Formula?: string;
  readonly Format?: SpreadsheetCellFormatType;
  readonly Bold?: boolean;
  readonly Italic?: boolean;
  readonly HorizontalAlign?: SheetsHorizontalAlign;
  readonly TextColor?: string;
  readonly BackgroundColor?: string;
}

export interface SheetsClipboardSnapshot {
  readonly Mode: SheetsClipboardMode;
  readonly SourceSheetID: string;
  readonly SourceRangeA1: string;
  readonly RowCount: number;
  readonly ColCount: number;
  readonly Cells: ReadonlyArray<SheetsClipboardCellEntry>;
}

export type SheetsCopySpecialKind = 'values' | 'formula' | 'csv' | 'markdown' | 'live-block';
export type SheetsPasteKind = 'all' | 'values' | 'formatting';
export type SheetsClearKind = 'contents' | 'formatting' | 'all';
export type SheetsSwatchTarget = 'fill' | 'text';

export type SheetsContextMenuCommand =
  | (ContextMenuCommandBase & { readonly Type: 'cut' })
  | (ContextMenuCommandBase & { readonly Type: 'copy' })
  | (ContextMenuCommandBase & { readonly Type: 'copy-special'; readonly Kind: SheetsCopySpecialKind })
  | (ContextMenuCommandBase & { readonly Type: 'paste'; readonly Kind: SheetsPasteKind })
  | (ContextMenuCommandBase & { readonly Type: 'insert-rows'; readonly Position: 'above' | 'below'; readonly Count: number; readonly AtRowIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'delete-rows'; readonly StartRowIndex: number; readonly Count: number })
  | (ContextMenuCommandBase & { readonly Type: 'insert-cols'; readonly Position: 'left' | 'right'; readonly Count: number; readonly AtColIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'delete-cols'; readonly StartColIndex: number; readonly Count: number })
  | (ContextMenuCommandBase & { readonly Type: 'clear-range'; readonly Kind: SheetsClearKind; readonly RangeA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'set-number-format'; readonly Format: SpreadsheetCellFormatType; readonly RangeA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'toggle-bold'; readonly RangeA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'toggle-italic'; readonly RangeA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'set-align'; readonly Align: SheetsHorizontalAlign; readonly RangeA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'set-color'; readonly Target: SheetsSwatchTarget; readonly CssColor: string | null; readonly RangeA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'create-chart-from-selection'; readonly RangeA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'open-range-comments'; readonly RangeA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'add-range-comment'; readonly RangeA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'refresh-mj-formula'; readonly AddressA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'inspect-mj-formula'; readonly AddressA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'select-spill-range'; readonly RangeA1: string })
  | (ContextMenuCommandBase & { readonly Type: 'select-row'; readonly RowIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'set-row-height'; readonly StartRowIndex: number; readonly EndRowIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'auto-fit-row-height'; readonly StartRowIndex: number; readonly EndRowIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'freeze-up-to-row'; readonly RowIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'hide-rows'; readonly StartRowIndex: number; readonly EndRowIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'unhide-adjacent-rows'; readonly StartRowIndex: number; readonly EndRowIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'select-col'; readonly ColIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'sort-col'; readonly ColumnLetter: string; readonly Direction: 'asc' | 'desc' })
  | (ContextMenuCommandBase & { readonly Type: 'set-col-width'; readonly StartColIndex: number; readonly EndColIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'auto-fit-col-width'; readonly StartColIndex: number; readonly EndColIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'freeze-up-to-col'; readonly ColIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'hide-cols'; readonly StartColIndex: number; readonly EndColIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'unhide-adjacent-cols'; readonly StartColIndex: number; readonly EndColIndex: number })
  | (ContextMenuCommandBase & { readonly Type: 'rename-sheet'; readonly SheetID: string })
  | (ContextMenuCommandBase & { readonly Type: 'duplicate-sheet'; readonly SheetID: string })
  | (ContextMenuCommandBase & { readonly Type: 'insert-sheet' })
  | (ContextMenuCommandBase & { readonly Type: 'move-sheet'; readonly SheetID: string; readonly Direction: 'left' | 'right' })
  | (ContextMenuCommandBase & { readonly Type: 'unhide-all-in-sheet'; readonly SheetID: string })
  | (ContextMenuCommandBase & { readonly Type: 'export-sheet-csv'; readonly SheetID: string; readonly Mode: 'copy' | 'download' })
  | (ContextMenuCommandBase & { readonly Type: 'export-workbook-xlsx' })
  | (ContextMenuCommandBase & { readonly Type: 'delete-sheet'; readonly SheetID: string })
  | (ContextMenuCommandBase & { readonly Type: 'open-chart-editor'; readonly ChartID: string })
  | (ContextMenuCommandBase & { readonly Type: 'set-chart-type'; readonly ChartID: string; readonly ChartType: SpreadsheetChartType })
  | (ContextMenuCommandBase & { readonly Type: 'toggle-chart-placement'; readonly ChartID: string })
  | (ContextMenuCommandBase & { readonly Type: 'reset-chart-size'; readonly ChartID: string })
  | (ContextMenuCommandBase & { readonly Type: 'bring-chart-to-front'; readonly ChartID: string })
  | (ContextMenuCommandBase & { readonly Type: 'select-chart-source-range'; readonly ChartID: string })
  | (ContextMenuCommandBase & { readonly Type: 'duplicate-chart'; readonly ChartID: string })
  | (ContextMenuCommandBase & { readonly Type: 'copy-chart-slide-block'; readonly ChartID: string })
  | (ContextMenuCommandBase & { readonly Type: 'delete-chart'; readonly ChartID: string })
  | (ContextMenuCommandBase & { readonly Type: 'refresh-live-table'; readonly TableID: string })
  | (ContextMenuCommandBase & { readonly Type: 'select-live-table-range'; readonly TableID: string })
  | (ContextMenuCommandBase & { readonly Type: 'toggle-live-table-mode'; readonly TableID: string })
  | (ContextMenuCommandBase & { readonly Type: 'open-live-table-editor'; readonly TableID: string })
  | (ContextMenuCommandBase & { readonly Type: 'copy-live-table-block'; readonly TableID: string })
  | (ContextMenuCommandBase & { readonly Type: 'delete-live-table'; readonly TableID: string })
  | (ContextMenuCommandBase & { readonly Type: 'open-embedded-artifact'; readonly EmbedID: string })
  | (ContextMenuCommandBase & { readonly Type: 'select-embedded-anchor'; readonly EmbedID: string })
  | (ContextMenuCommandBase & { readonly Type: 'refresh-embedded-artifact'; readonly EmbedID: string })
  | (ContextMenuCommandBase & { readonly Type: 'delete-embedded-artifact'; readonly EmbedID: string });

export interface SheetsCellContextTarget {
  readonly Kind: 'cell';
  readonly SheetID: string;
  readonly AnchorA1: string;
  readonly RangeA1: string;
  readonly StartRow: number;
  readonly EndRow: number;
  readonly StartCol: number;
  readonly EndCol: number;
  readonly TotalRows: number;
  readonly TotalCols: number;
  readonly HasFormula: boolean;
  readonly HasMjFormula: boolean;
  readonly SpilledFromA1: string | null;
  readonly SpillRangeA1: string | null;
  readonly IntersectsLiveOrChartBlock: boolean;
  readonly CurrentFormat: SpreadsheetCellFormatType;
  readonly IsBold: boolean;
  readonly IsItalic: boolean;
  readonly HorizontalAlign: SheetsHorizontalAlign;
  readonly TextColor: string | null;
  readonly BackgroundColor: string | null;
  readonly ProtectedReason: string | null;
  readonly RangeThreadCount: number;
}

export interface SheetsRowHeaderContextTarget {
  readonly Kind: 'row-header';
  readonly SheetID: string;
  readonly StartRow: number;
  readonly EndRow: number;
  readonly TotalRows: number;
  readonly TotalCols: number;
  readonly CurrentFrozenRows: number;
  readonly HasAdjacentHiddenRows: boolean;
  readonly ProtectedReason: string | null;
  readonly RangeThreadCount: number;
}

export interface SheetsColumnHeaderContextTarget {
  readonly Kind: 'col-header';
  readonly SheetID: string;
  readonly StartCol: number;
  readonly EndCol: number;
  readonly StartColLetter: string;
  readonly EndColLetter: string;
  readonly TotalRows: number;
  readonly TotalCols: number;
  readonly CurrentFrozenColumns: number;
  readonly CurrentFormat: SpreadsheetCellFormatType;
  readonly HasAdjacentHiddenCols: boolean;
  readonly ProtectedReason: string | null;
  readonly RangeThreadCount: number;
}

export interface SheetsWorksheetTabContextTarget {
  readonly Kind: 'worksheet-tab';
  readonly SheetID: string;
  readonly SheetName: string;
  readonly SheetIndex: number;
  readonly TotalSheets: number;
  readonly RowCount: number;
  readonly ColCount: number;
  readonly HiddenRowCount: number;
  readonly HiddenColCount: number;
}

export interface SheetsChartContextTarget {
  readonly Kind: 'chart';
  readonly SheetID: string;
  readonly ChartID: string;
  readonly Title: string;
  readonly ChartType: SpreadsheetChartType;
  readonly Placement: SheetsChartPlacement;
  readonly DataRangeA1: string;
  readonly HasCustomSize: boolean;
  readonly FloatingChartCount: number;
}

export interface SheetsLiveTableContextTarget {
  readonly Kind: 'live-table';
  readonly SheetID: string;
  readonly TableID: string;
  readonly Title: string;
  readonly Mode: SheetsLiveTableMode;
  readonly RangeA1: string;
}

export interface SheetsEmbeddedArtifactContextTarget {
  readonly Kind: 'embedded-artifact';
  readonly SheetID: string;
  readonly EmbedID: string;
  readonly Title: string;
  readonly ArtifactType: string;
  readonly AnchorCellA1: string;
  readonly HasSourceArtifactID: boolean;
}

export type SheetsContextMenuTarget =
  | SheetsCellContextTarget
  | SheetsRowHeaderContextTarget
  | SheetsColumnHeaderContextTarget
  | SheetsWorksheetTabContextTarget
  | SheetsChartContextTarget
  | SheetsLiveTableContextTarget
  | SheetsEmbeddedArtifactContextTarget;

export interface SheetsContextMenuSnapshot {
  readonly Target: SheetsContextMenuTarget;
  readonly CanEdit: boolean;
  readonly CanComment: boolean;
  readonly HasClipboardData: boolean;
  readonly ClipboardSourceRangeA1: string | null;
  readonly IsMac?: boolean;
}

export interface SheetsColorSwatchToken {
  readonly ID: string;
  readonly Label: string;
  readonly CssColor: string;
  readonly IsClear?: boolean;
}

export const SHEETS_FILL_COLOR_SWATCHES: ReadonlyArray<SheetsColorSwatchToken> = [
  { ID: 'clear', Label: 'No Fill', CssColor: 'transparent', IsClear: true },
  { ID: 'surface-sunken', Label: 'Soft Gray', CssColor: 'var(--mj-bg-surface-sunken)' },
  { ID: 'brand-subtle', Label: 'Brand Tint', CssColor: 'color-mix(in srgb, var(--mj-brand-primary) 16%, var(--mj-bg-surface))' },
  { ID: 'success-subtle', Label: 'Success Tint', CssColor: 'color-mix(in srgb, var(--mj-status-success) 16%, var(--mj-bg-surface))' },
  { ID: 'warning-subtle', Label: 'Warning Tint', CssColor: 'color-mix(in srgb, var(--mj-status-warning) 18%, var(--mj-bg-surface))' },
  { ID: 'error-subtle', Label: 'Error Tint', CssColor: 'color-mix(in srgb, var(--mj-status-error) 16%, var(--mj-bg-surface))' },
  { ID: 'info-subtle', Label: 'Info Tint', CssColor: 'color-mix(in srgb, var(--mj-status-info) 16%, var(--mj-bg-surface))' },
];

export const SHEETS_TEXT_COLOR_SWATCHES: ReadonlyArray<SheetsColorSwatchToken> = [
  { ID: 'clear', Label: 'Default Text', CssColor: 'var(--mj-text-primary)', IsClear: true },
  { ID: 'muted', Label: 'Secondary Text', CssColor: 'var(--mj-text-secondary)' },
  { ID: 'brand', Label: 'Brand Accent', CssColor: 'var(--mj-brand-primary)' },
  { ID: 'success', Label: 'Success Text', CssColor: 'var(--mj-status-success)' },
  { ID: 'warning', Label: 'Warning Text', CssColor: 'var(--mj-status-warning)' },
  { ID: 'error', Label: 'Error Text', CssColor: 'var(--mj-status-error)' },
  { ID: 'info', Label: 'Info Text', CssColor: 'var(--mj-status-info)' },
];

const NUMBER_FORMAT_OPTIONS: ReadonlyArray<{
  readonly Format: SpreadsheetCellFormatType;
  readonly Label: string;
}> = [
  { Format: 'general', Label: 'General' },
  { Format: 'number', Label: 'Number (1,234.56)' },
  { Format: 'currency', Label: 'Currency ($1,234.56)' },
  { Format: 'percent', Label: 'Percent (12.3%)' },
  { Format: 'integer', Label: 'Integer (1,234)' },
  { Format: 'date', Label: 'Date (YYYY-MM-DD)' },
  { Format: 'datetime', Label: 'Date & Time' },
  { Format: 'text', Label: 'Plain Text' },
];

const CHART_TYPE_OPTIONS: ReadonlyArray<{
  readonly Type: SpreadsheetChartType;
  readonly Label: string;
  readonly Icon: string;
}> = [
  { Type: 'bar', Label: 'Bar Chart', Icon: 'fa-solid fa-chart-column' },
  { Type: 'line', Label: 'Line Chart', Icon: 'fa-solid fa-chart-line' },
  { Type: 'area', Label: 'Area Chart', Icon: 'fa-solid fa-chart-area' },
  { Type: 'pie', Label: 'Pie Chart', Icon: 'fa-solid fa-chart-pie' },
];

function buildNumberFormatChildren(
  currentFormat: SpreadsheetCellFormatType,
  rangeA1: string,
  disabled: boolean,
  disabledReason?: string
): ContextMenuItem<SheetsContextMenuCommand>[] {
  return NUMBER_FORMAT_OPTIONS.map((opt) => ({
    Kind: 'action',
    ID: `sheets-fmt-${opt.Format}`,
    Label: opt.Label,
    Role: 'menuitemradio',
    Checked: currentFormat === opt.Format,
    Disabled: disabled,
    DisabledReason: disabledReason,
    Command: {
      Type: 'set-number-format',
      Format: opt.Format,
      RangeA1: rangeA1,
    },
  }));
}

function buildSwatchOptions(
  target: SheetsSwatchTarget,
  rangeA1: string,
  swatches: ReadonlyArray<SheetsColorSwatchToken>,
  currentColor: string | null
): ContextMenuSwatchOption<SheetsContextMenuCommand>[] {
  return swatches.map((swatch) => ({
    Label: swatch.Label,
    PreviewCssColor: swatch.CssColor,
    IsClearSwatch: swatch.IsClear,
    Selected: swatch.IsClear ? !currentColor : currentColor === swatch.CssColor,
    Command: {
      Type: 'set-color',
      Target: target,
      CssColor: swatch.IsClear ? null : swatch.CssColor,
      RangeA1: rangeA1,
    },
  }));
}

function buildCommentItems(
  rangeA1: string,
  threadCount: number,
  canComment: boolean
): ContextMenuItem<SheetsContextMenuCommand>[] {
  const items: ContextMenuItem<SheetsContextMenuCommand>[] = [];
  if (threadCount > 0) {
    items.push({
      Kind: 'action',
      ID: 'sheets-view-comments',
      Label: threadCount === 1 ? 'View Comment Thread' : 'View Comment Threads',
      Icon: 'fa-regular fa-comments',
      BadgeText: String(threadCount),
      Command: { Type: 'open-range-comments', RangeA1: rangeA1 },
    });
  }
  if (canComment) {
    items.push({
      Kind: 'action',
      ID: 'sheets-add-comment',
      Label: `Add Comment on ${rangeA1}`,
      Icon: 'fa-regular fa-comment-dots',
      Command: { Type: 'add-range-comment', RangeA1: rangeA1 },
    });
  }
  return items;
}

function buildCellOrRangeMenu(
  target: SheetsCellContextTarget,
  ctx: SheetsContextMenuSnapshot
): ContextMenuItem<SheetsContextMenuCommand>[] {
  const items: ContextMenuItem<SheetsContextMenuCommand>[] = [];
  const rowCount = Math.max(1, target.EndRow - target.StartRow + 1);
  const colCount = Math.max(1, target.EndCol - target.StartCol + 1);
  const isProtected = Boolean(target.ProtectedReason);
  const protectedReason = target.ProtectedReason ?? undefined;
  const rowPlural = rowCount === 1 ? 'Row' : `${rowCount} Rows`;
  const colPlural = colCount === 1 ? 'Column' : `${colCount} Columns`;
  const isMac = ctx.IsMac;

  items.push({
    Kind: 'header',
    ID: 'sheets-cell-header',
    Label: rowCount === 1 && colCount === 1
      ? `Cell ${target.AnchorA1}`
      : `Selection ${target.RangeA1} (${rowCount}×${colCount})`,
    Icon: 'fa-solid fa-table-cells',
  });

  if (ctx.CanEdit) {
    items.push({
      Kind: 'action',
      ID: 'sheets-cut',
      Label: 'Cut',
      Icon: 'fa-solid fa-scissors',
      Shortcut: FormatMenuShortcut('⌘X', 'Ctrl+X', isMac),
      Disabled: isProtected,
      DisabledReason: protectedReason,
      Command: { Type: 'cut' },
    });
  }

  items.push({
    Kind: 'action',
    ID: 'sheets-copy',
    Label: 'Copy',
    Icon: 'fa-regular fa-copy',
    Shortcut: FormatMenuShortcut('⌘C', 'Ctrl+C', isMac),
    Command: { Type: 'copy' },
  });

  const copySpecialChildren: ContextMenuItem<SheetsContextMenuCommand>[] = [
    {
      Kind: 'action',
      ID: 'sheets-copy-values',
      Label: 'Copy Values',
      Icon: 'fa-solid fa-font',
      Command: { Type: 'copy-special', Kind: 'values' },
    },
    {
      Kind: 'action',
      ID: 'sheets-copy-formula',
      Label: 'Copy Formula',
      Icon: 'fa-solid fa-square-root-variable',
      Disabled: !target.HasFormula,
      DisabledReason: !target.HasFormula ? 'Active cell does not contain a formula' : undefined,
      Command: { Type: 'copy-special', Kind: 'formula' },
    },
    {
      Kind: 'action',
      ID: 'sheets-copy-csv',
      Label: 'Copy as CSV',
      Icon: 'fa-solid fa-file-csv',
      Command: { Type: 'copy-special', Kind: 'csv' },
    },
    {
      Kind: 'action',
      ID: 'sheets-copy-markdown',
      Label: 'Copy as Markdown Table',
      Icon: 'fa-brands fa-markdown',
      Command: { Type: 'copy-special', Kind: 'markdown' },
    },
  ];
  if (target.IntersectsLiveOrChartBlock) {
    copySpecialChildren.push({
      Kind: 'action',
      ID: 'sheets-copy-live-block',
      Label: 'Copy Live Block JSON',
      Icon: 'fa-solid fa-code',
      Command: { Type: 'copy-special', Kind: 'live-block' },
    });
  }

  items.push({
    Kind: 'submenu',
    ID: 'sheets-copy-special',
    Label: 'Copy Special',
    Icon: 'fa-regular fa-clone',
    Children: copySpecialChildren,
  });

  if (ctx.CanEdit) {
    const pasteDisabledReason = isProtected
      ? protectedReason
      : !ctx.HasClipboardData
        ? 'Clipboard buffer is empty'
        : undefined;

    items.push({
      Kind: 'action',
      ID: 'sheets-paste',
      Label: 'Paste',
      Icon: 'fa-regular fa-clipboard',
      Shortcut: FormatMenuShortcut('⌘V', 'Ctrl+V', isMac),
      Disabled: isProtected,
      DisabledReason: protectedReason,
      Command: { Type: 'paste', Kind: 'all' },
    });

    items.push({
      Kind: 'submenu',
      ID: 'sheets-paste-special',
      Label: 'Paste Special',
      Icon: 'fa-solid fa-paste',
      Disabled: isProtected || !ctx.HasClipboardData,
      DisabledReason: pasteDisabledReason,
      Children: [
        {
          Kind: 'action',
          ID: 'sheets-paste-values',
          Label: 'Paste Values Only',
          Icon: 'fa-solid fa-arrow-down-1-9',
          Disabled: isProtected || !ctx.HasClipboardData,
          DisabledReason: pasteDisabledReason,
          Command: { Type: 'paste', Kind: 'values' },
        },
        {
          Kind: 'action',
          ID: 'sheets-paste-formatting',
          Label: 'Paste Formatting Only',
          Icon: 'fa-solid fa-paintbrush',
          Disabled: isProtected || !ctx.HasClipboardData,
          DisabledReason: pasteDisabledReason,
          Command: { Type: 'paste', Kind: 'formatting' },
        },
      ],
    });

    items.push({ Kind: 'separator', ID: 'sheets-sep-structure' });

    items.push(
      {
        Kind: 'action',
        ID: 'sheets-insert-row-above',
        Label: `Insert ${rowPlural} Above`,
        Icon: 'fa-solid fa-arrow-up',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'insert-rows', Position: 'above', Count: rowCount, AtRowIndex: target.StartRow },
      },
      {
        Kind: 'action',
        ID: 'sheets-insert-row-below',
        Label: `Insert ${rowPlural} Below`,
        Icon: 'fa-solid fa-arrow-down',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'insert-rows', Position: 'below', Count: rowCount, AtRowIndex: target.EndRow },
      },
      {
        Kind: 'action',
        ID: 'sheets-insert-col-left',
        Label: `Insert ${colPlural} Left`,
        Icon: 'fa-solid fa-arrow-left',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'insert-cols', Position: 'left', Count: colCount, AtColIndex: target.StartCol },
      },
      {
        Kind: 'action',
        ID: 'sheets-insert-col-right',
        Label: `Insert ${colPlural} Right`,
        Icon: 'fa-solid fa-arrow-right',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'insert-cols', Position: 'right', Count: colCount, AtColIndex: target.EndCol },
      },
      {
        Kind: 'action',
        ID: 'sheets-delete-rows',
        Label: `Delete ${rowPlural}`,
        Icon: 'fa-regular fa-trash-can',
        Destructive: true,
        Disabled: isProtected || target.TotalRows <= rowCount,
        DisabledReason: isProtected
          ? protectedReason
          : target.TotalRows <= rowCount
            ? 'Sheet must keep at least one row'
            : undefined,
        Command: { Type: 'delete-rows', StartRowIndex: target.StartRow, Count: rowCount },
      },
      {
        Kind: 'action',
        ID: 'sheets-delete-cols',
        Label: `Delete ${colPlural}`,
        Icon: 'fa-regular fa-trash-can',
        Destructive: true,
        Disabled: isProtected || target.TotalCols <= colCount,
        DisabledReason: isProtected
          ? protectedReason
          : target.TotalCols <= colCount
            ? 'Sheet must keep at least one column'
            : undefined,
        Command: { Type: 'delete-cols', StartColIndex: target.StartCol, Count: colCount },
      },
      {
        Kind: 'submenu',
        ID: 'sheets-clear-submenu',
        Label: 'Clear',
        Icon: 'fa-solid fa-eraser',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Children: [
          {
            Kind: 'action',
            ID: 'sheets-clear-contents',
            Label: 'Clear Contents',
            Icon: 'fa-solid fa-eraser',
            Disabled: isProtected,
            DisabledReason: protectedReason,
            Command: { Type: 'clear-range', Kind: 'contents', RangeA1: target.RangeA1 },
          },
          {
            Kind: 'action',
            ID: 'sheets-clear-formatting',
            Label: 'Clear Formatting',
            Icon: 'fa-solid fa-remove-format',
            Disabled: isProtected,
            DisabledReason: protectedReason,
            Command: { Type: 'clear-range', Kind: 'formatting', RangeA1: target.RangeA1 },
          },
          {
            Kind: 'action',
            ID: 'sheets-clear-all',
            Label: 'Clear All',
            Icon: 'fa-solid fa-broom',
            Destructive: true,
            Disabled: isProtected,
            DisabledReason: protectedReason,
            Command: { Type: 'clear-range', Kind: 'all', RangeA1: target.RangeA1 },
          },
        ],
      }
    );

    items.push({ Kind: 'separator', ID: 'sheets-sep-formatting' });

    items.push(
      {
        Kind: 'submenu',
        ID: 'sheets-number-format',
        Label: 'Number Format',
        Icon: 'fa-solid fa-hashtag',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Children: buildNumberFormatChildren(target.CurrentFormat, target.RangeA1, isProtected, protectedReason),
      },
      {
        Kind: 'action',
        ID: 'sheets-toggle-bold',
        Label: 'Bold',
        Icon: 'fa-solid fa-bold',
        Shortcut: FormatMenuShortcut('⌘B', 'Ctrl+B', isMac),
        Role: 'menuitemcheckbox',
        Checked: target.IsBold,
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'toggle-bold', RangeA1: target.RangeA1 },
      },
      {
        Kind: 'action',
        ID: 'sheets-toggle-italic',
        Label: 'Italic',
        Icon: 'fa-solid fa-italic',
        Shortcut: FormatMenuShortcut('⌘I', 'Ctrl+I', isMac),
        Role: 'menuitemcheckbox',
        Checked: target.IsItalic,
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'toggle-italic', RangeA1: target.RangeA1 },
      },
      {
        Kind: 'submenu',
        ID: 'sheets-alignment',
        Label: 'Alignment',
        Icon: 'fa-solid fa-align-left',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Children: [
          {
            Kind: 'action',
            ID: 'sheets-align-left',
            Label: 'Align Left',
            Icon: 'fa-solid fa-align-left',
            Role: 'menuitemradio',
            Checked: target.HorizontalAlign === 'left',
            Disabled: isProtected,
            DisabledReason: protectedReason,
            Command: { Type: 'set-align', Align: 'left', RangeA1: target.RangeA1 },
          },
          {
            Kind: 'action',
            ID: 'sheets-align-center',
            Label: 'Align Center',
            Icon: 'fa-solid fa-align-center',
            Role: 'menuitemradio',
            Checked: target.HorizontalAlign === 'center',
            Disabled: isProtected,
            DisabledReason: protectedReason,
            Command: { Type: 'set-align', Align: 'center', RangeA1: target.RangeA1 },
          },
          {
            Kind: 'action',
            ID: 'sheets-align-right',
            Label: 'Align Right',
            Icon: 'fa-solid fa-align-right',
            Role: 'menuitemradio',
            Checked: target.HorizontalAlign === 'right',
            Disabled: isProtected,
            DisabledReason: protectedReason,
            Command: { Type: 'set-align', Align: 'right', RangeA1: target.RangeA1 },
          },
        ],
      },
      {
        Kind: 'swatch-row',
        ID: 'sheets-fill-color',
        Label: 'Fill Color',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Swatches: buildSwatchOptions('fill', target.RangeA1, SHEETS_FILL_COLOR_SWATCHES, target.BackgroundColor),
      },
      {
        Kind: 'swatch-row',
        ID: 'sheets-text-color',
        Label: 'Text Color',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Swatches: buildSwatchOptions('text', target.RangeA1, SHEETS_TEXT_COLOR_SWATCHES, target.TextColor),
      }
    );

    items.push({ Kind: 'separator', ID: 'sheets-sep-viz' });
    items.push({
      Kind: 'action',
      ID: 'sheets-create-chart',
      Label: 'Create Chart from Selection',
      Icon: 'fa-solid fa-chart-column',
      Command: { Type: 'create-chart-from-selection', RangeA1: target.RangeA1 },
    });
  }

  if (target.HasMjFormula || target.SpilledFromA1) {
    items.push({ Kind: 'separator', ID: 'sheets-sep-mj-formula' });
    if (target.HasMjFormula) {
      items.push({
        Kind: 'action',
        ID: 'sheets-refresh-mj-formula',
        Label: 'Refresh =MJ.* Formula',
        Icon: 'fa-solid fa-arrows-rotate',
        Command: { Type: 'refresh-mj-formula', AddressA1: target.AnchorA1 },
      });
      items.push({
        Kind: 'action',
        ID: 'sheets-inspect-mj-formula',
        Label: 'Inspect Formula Source',
        Icon: 'fa-solid fa-magnifying-glass-chart',
        Command: { Type: 'inspect-mj-formula', AddressA1: target.AnchorA1 },
      });
    }
    if (target.SpilledFromA1 && target.SpillRangeA1) {
      items.push({
        Kind: 'action',
        ID: 'sheets-select-spill-range',
        Label: `Select Spill Range (${target.SpillRangeA1})`,
        Icon: 'fa-solid fa-expand',
        Command: { Type: 'select-spill-range', RangeA1: target.SpillRangeA1 },
      });
    }
  }

  const commentItems = buildCommentItems(target.RangeA1, target.RangeThreadCount, ctx.CanComment);
  if (commentItems.length > 0) {
    items.push({ Kind: 'separator', ID: 'sheets-sep-comments' });
    items.push(...commentItems);
  }

  if (!ctx.CanEdit) {
    items.push({ Kind: 'separator', ID: 'sheets-sep-viewer-export' });
    items.push({
      Kind: 'action',
      ID: 'sheets-viewer-export-csv',
      Label: 'Export Sheet as CSV',
      Icon: 'fa-solid fa-file-csv',
      Command: { Type: 'export-sheet-csv', SheetID: target.SheetID, Mode: 'download' },
    });
    items.push({
      Kind: 'action',
      ID: 'sheets-viewer-export-xlsx',
      Label: 'Export Workbook (.xlsx)',
      Icon: 'fa-solid fa-file-excel',
      Command: { Type: 'export-workbook-xlsx' },
    });
  }

  return items;
}

function buildRowHeaderMenu(
  target: SheetsRowHeaderContextTarget,
  ctx: SheetsContextMenuSnapshot
): ContextMenuItem<SheetsContextMenuCommand>[] {
  const rowCount = Math.max(1, target.EndRow - target.StartRow + 1);
  const rowPlural = rowCount === 1 ? 'Row' : `${rowCount} Rows`;
  const rowRangeA1 = `A${target.StartRow}:${columnIndexToLetterSafe(target.TotalCols)}${target.EndRow}`;
  const isProtected = Boolean(target.ProtectedReason);
  const protectedReason = target.ProtectedReason ?? undefined;
  const isFrozenAtTarget = target.CurrentFrozenRows === target.EndRow;

  const items: ContextMenuItem<SheetsContextMenuCommand>[] = [
    {
      Kind: 'header',
      ID: 'sheets-row-header-summary',
      Label: rowCount === 1
        ? `Row ${target.StartRow}`
        : `Rows ${target.StartRow}–${target.EndRow} (${rowCount})`,
      Icon: 'fa-solid fa-arrows-up-down',
    },
    {
      Kind: 'action',
      ID: 'sheets-select-row',
      Label: rowCount === 1 ? `Select Row ${target.StartRow}` : `Select Rows ${target.StartRow}–${target.EndRow}`,
      Icon: 'fa-solid fa-arrow-pointer',
      Command: { Type: 'select-row', RowIndex: target.StartRow },
    },
    {
      Kind: 'action',
      ID: 'sheets-copy',
      Label: `Copy ${rowPlural}`,
      Icon: 'fa-regular fa-copy',
      Shortcut: FormatMenuShortcut('⌘C', 'Ctrl+C', ctx.IsMac),
      Command: { Type: 'copy' },
    },
    {
      Kind: 'submenu',
      ID: 'sheets-row-copy-special',
      Label: 'Copy As',
      Icon: 'fa-regular fa-clone',
      Children: [
        {
          Kind: 'action',
          ID: 'sheets-row-copy-csv',
          Label: 'Copy as CSV',
          Icon: 'fa-solid fa-file-csv',
          Command: { Type: 'copy-special', Kind: 'csv' },
        },
        {
          Kind: 'action',
          ID: 'sheets-row-copy-markdown',
          Label: 'Copy as Markdown Table',
          Icon: 'fa-brands fa-markdown',
          Command: { Type: 'copy-special', Kind: 'markdown' },
        },
      ],
    },
  ];

  if (ctx.CanEdit) {
    items.push(
      { Kind: 'separator', ID: 'sheets-row-sep-edit' },
      {
        Kind: 'action',
        ID: 'sheets-row-insert-above',
        Label: `Insert ${rowPlural} Above`,
        Icon: 'fa-solid fa-arrow-up',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'insert-rows', Position: 'above', Count: rowCount, AtRowIndex: target.StartRow },
      },
      {
        Kind: 'action',
        ID: 'sheets-row-insert-below',
        Label: `Insert ${rowPlural} Below`,
        Icon: 'fa-solid fa-arrow-down',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'insert-rows', Position: 'below', Count: rowCount, AtRowIndex: target.EndRow },
      },
      {
        Kind: 'action',
        ID: 'sheets-row-delete',
        Label: `Delete ${rowPlural}`,
        Icon: 'fa-regular fa-trash-can',
        Destructive: true,
        Disabled: isProtected || target.TotalRows <= rowCount,
        DisabledReason: isProtected
          ? protectedReason
          : target.TotalRows <= rowCount
            ? 'Sheet must keep at least one row'
            : undefined,
        Command: { Type: 'delete-rows', StartRowIndex: target.StartRow, Count: rowCount },
      },
      {
        Kind: 'action',
        ID: 'sheets-row-clear',
        Label: `Clear ${rowPlural} Contents`,
        Icon: 'fa-solid fa-eraser',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'clear-range', Kind: 'contents', RangeA1: rowRangeA1 },
      },
      { Kind: 'separator', ID: 'sheets-row-sep-layout' },
      {
        Kind: 'action',
        ID: 'sheets-row-set-height',
        Label: 'Set Row Height...',
        Icon: 'fa-solid fa-up-down',
        Command: { Type: 'set-row-height', StartRowIndex: target.StartRow, EndRowIndex: target.EndRow },
      },
      {
        Kind: 'action',
        ID: 'sheets-row-autofit-height',
        Label: 'Auto-Fit Row Height',
        Icon: 'fa-solid fa-text-height',
        Command: { Type: 'auto-fit-row-height', StartRowIndex: target.StartRow, EndRowIndex: target.EndRow },
      },
      {
        Kind: 'action',
        ID: 'sheets-row-freeze',
        Label: isFrozenAtTarget ? 'Unfreeze Rows' : `Freeze Up To Row ${target.EndRow}`,
        Icon: 'fa-solid fa-thumbtack',
        Role: 'menuitemcheckbox',
        Checked: isFrozenAtTarget,
        Command: { Type: 'freeze-up-to-row', RowIndex: isFrozenAtTarget ? 0 : target.EndRow },
      },
      {
        Kind: 'action',
        ID: 'sheets-row-hide',
        Label: `Hide ${rowPlural}`,
        Icon: 'fa-regular fa-eye-slash',
        Disabled: target.TotalRows <= rowCount,
        DisabledReason: target.TotalRows <= rowCount ? 'Cannot hide every row in the sheet' : undefined,
        Command: { Type: 'hide-rows', StartRowIndex: target.StartRow, EndRowIndex: target.EndRow },
      }
    );

    if (target.HasAdjacentHiddenRows) {
      items.push({
        Kind: 'action',
        ID: 'sheets-row-unhide-adjacent',
        Label: 'Unhide Adjacent Rows',
        Icon: 'fa-regular fa-eye',
        Command: { Type: 'unhide-adjacent-rows', StartRowIndex: target.StartRow, EndRowIndex: target.EndRow },
      });
    }
  }

  const commentItems = buildCommentItems(rowRangeA1, target.RangeThreadCount, ctx.CanComment);
  if (commentItems.length > 0) {
    items.push({ Kind: 'separator', ID: 'sheets-row-sep-comments' });
    items.push(...commentItems);
  }

  return items;
}

function buildColumnHeaderMenu(
  target: SheetsColumnHeaderContextTarget,
  ctx: SheetsContextMenuSnapshot
): ContextMenuItem<SheetsContextMenuCommand>[] {
  const colCount = Math.max(1, target.EndCol - target.StartCol + 1);
  const colPlural = colCount === 1 ? 'Column' : `${colCount} Columns`;
  const colRangeA1 = `${target.StartColLetter}1:${target.EndColLetter}${target.TotalRows}`;
  const isProtected = Boolean(target.ProtectedReason);
  const protectedReason = target.ProtectedReason ?? undefined;
  const isFrozenAtTarget = target.CurrentFrozenColumns === target.EndCol;

  const items: ContextMenuItem<SheetsContextMenuCommand>[] = [
    {
      Kind: 'header',
      ID: 'sheets-col-header-summary',
      Label: colCount === 1
        ? `Column ${target.StartColLetter}`
        : `Columns ${target.StartColLetter}–${target.EndColLetter} (${colCount})`,
      Icon: 'fa-solid fa-arrows-left-right',
    },
    {
      Kind: 'action',
      ID: 'sheets-select-col',
      Label: colCount === 1
        ? `Select Column ${target.StartColLetter}`
        : `Select Columns ${target.StartColLetter}–${target.EndColLetter}`,
      Icon: 'fa-solid fa-arrow-pointer',
      Command: { Type: 'select-col', ColIndex: target.StartCol },
    },
    {
      Kind: 'action',
      ID: 'sheets-copy',
      Label: `Copy ${colPlural}`,
      Icon: 'fa-regular fa-copy',
      Shortcut: FormatMenuShortcut('⌘C', 'Ctrl+C', ctx.IsMac),
      Command: { Type: 'copy' },
    },
    {
      Kind: 'submenu',
      ID: 'sheets-col-copy-special',
      Label: 'Copy As',
      Icon: 'fa-regular fa-clone',
      Children: [
        {
          Kind: 'action',
          ID: 'sheets-col-copy-csv',
          Label: 'Copy as CSV',
          Icon: 'fa-solid fa-file-csv',
          Command: { Type: 'copy-special', Kind: 'csv' },
        },
        {
          Kind: 'action',
          ID: 'sheets-col-copy-markdown',
          Label: 'Copy as Markdown Table',
          Icon: 'fa-brands fa-markdown',
          Command: { Type: 'copy-special', Kind: 'markdown' },
        },
      ],
    },
  ];

  if (ctx.CanEdit) {
    items.push(
      { Kind: 'separator', ID: 'sheets-col-sep-edit' },
      {
        Kind: 'action',
        ID: 'sheets-col-insert-left',
        Label: `Insert ${colPlural} Left`,
        Icon: 'fa-solid fa-arrow-left',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'insert-cols', Position: 'left', Count: colCount, AtColIndex: target.StartCol },
      },
      {
        Kind: 'action',
        ID: 'sheets-col-insert-right',
        Label: `Insert ${colPlural} Right`,
        Icon: 'fa-solid fa-arrow-right',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'insert-cols', Position: 'right', Count: colCount, AtColIndex: target.EndCol },
      },
      {
        Kind: 'action',
        ID: 'sheets-col-delete',
        Label: `Delete ${colPlural}`,
        Icon: 'fa-regular fa-trash-can',
        Destructive: true,
        Disabled: isProtected || target.TotalCols <= colCount,
        DisabledReason: isProtected
          ? protectedReason
          : target.TotalCols <= colCount
            ? 'Sheet must keep at least one column'
            : undefined,
        Command: { Type: 'delete-cols', StartColIndex: target.StartCol, Count: colCount },
      },
      {
        Kind: 'action',
        ID: 'sheets-col-clear',
        Label: `Clear ${colPlural} Contents`,
        Icon: 'fa-solid fa-eraser',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'clear-range', Kind: 'contents', RangeA1: colRangeA1 },
      },
      { Kind: 'separator', ID: 'sheets-col-sep-sort-format' },
      {
        Kind: 'action',
        ID: 'sheets-col-sort-asc',
        Label: `Sort Sheet by ${target.StartColLetter} (A → Z)`,
        Icon: 'fa-solid fa-arrow-down-a-z',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'sort-col', ColumnLetter: target.StartColLetter, Direction: 'asc' },
      },
      {
        Kind: 'action',
        ID: 'sheets-col-sort-desc',
        Label: `Sort Sheet by ${target.StartColLetter} (Z → A)`,
        Icon: 'fa-solid fa-arrow-down-z-a',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Command: { Type: 'sort-col', ColumnLetter: target.StartColLetter, Direction: 'desc' },
      },
      {
        Kind: 'submenu',
        ID: 'sheets-col-number-format',
        Label: 'Number Format',
        Icon: 'fa-solid fa-hashtag',
        Disabled: isProtected,
        DisabledReason: protectedReason,
        Children: buildNumberFormatChildren(target.CurrentFormat, colRangeA1, isProtected, protectedReason),
      },
      { Kind: 'separator', ID: 'sheets-col-sep-layout' },
      {
        Kind: 'action',
        ID: 'sheets-col-set-width',
        Label: 'Set Column Width...',
        Icon: 'fa-solid fa-left-right',
        Command: { Type: 'set-col-width', StartColIndex: target.StartCol, EndColIndex: target.EndCol },
      },
      {
        Kind: 'action',
        ID: 'sheets-col-autofit-width',
        Label: 'Auto-Fit Column Width',
        Icon: 'fa-solid fa-text-width',
        Command: { Type: 'auto-fit-col-width', StartColIndex: target.StartCol, EndColIndex: target.EndCol },
      },
      {
        Kind: 'action',
        ID: 'sheets-col-freeze',
        Label: isFrozenAtTarget ? 'Unfreeze Columns' : `Freeze Up To Column ${target.EndColLetter}`,
        Icon: 'fa-solid fa-thumbtack',
        Role: 'menuitemcheckbox',
        Checked: isFrozenAtTarget,
        Command: { Type: 'freeze-up-to-col', ColIndex: isFrozenAtTarget ? 0 : target.EndCol },
      },
      {
        Kind: 'action',
        ID: 'sheets-col-hide',
        Label: `Hide ${colPlural}`,
        Icon: 'fa-regular fa-eye-slash',
        Disabled: target.TotalCols <= colCount,
        DisabledReason: target.TotalCols <= colCount ? 'Cannot hide every column in the sheet' : undefined,
        Command: { Type: 'hide-cols', StartColIndex: target.StartCol, EndColIndex: target.EndCol },
      }
    );

    if (target.HasAdjacentHiddenCols) {
      items.push({
        Kind: 'action',
        ID: 'sheets-col-unhide-adjacent',
        Label: 'Unhide Adjacent Columns',
        Icon: 'fa-regular fa-eye',
        Command: { Type: 'unhide-adjacent-cols', StartColIndex: target.StartCol, EndColIndex: target.EndCol },
      });
    }
  }

  const commentItems = buildCommentItems(colRangeA1, target.RangeThreadCount, ctx.CanComment);
  if (commentItems.length > 0) {
    items.push({ Kind: 'separator', ID: 'sheets-col-sep-comments' });
    items.push(...commentItems);
  }

  return items;
}

function buildWorksheetTabMenu(
  target: SheetsWorksheetTabContextTarget,
  ctx: SheetsContextMenuSnapshot
): ContextMenuItem<SheetsContextMenuCommand>[] {
  const items: ContextMenuItem<SheetsContextMenuCommand>[] = [
    {
      Kind: 'header',
      ID: 'sheets-tab-summary',
      Label: `${target.SheetName} (${target.RowCount} rows × ${target.ColCount} cols)`,
      Icon: 'fa-solid fa-table',
    },
  ];

  if (ctx.CanEdit) {
    items.push(
      {
        Kind: 'action',
        ID: 'sheets-tab-rename',
        Label: 'Rename Sheet',
        Icon: 'fa-solid fa-pen',
        Shortcut: 'DblClick',
        Command: { Type: 'rename-sheet', SheetID: target.SheetID },
      },
      {
        Kind: 'action',
        ID: 'sheets-tab-duplicate',
        Label: 'Duplicate Sheet',
        Icon: 'fa-regular fa-copy',
        Command: { Type: 'duplicate-sheet', SheetID: target.SheetID },
      },
      {
        Kind: 'action',
        ID: 'sheets-tab-insert',
        Label: 'Insert New Sheet',
        Icon: 'fa-solid fa-plus',
        Command: { Type: 'insert-sheet' },
      },
      { Kind: 'separator', ID: 'sheets-tab-sep-move' },
      {
        Kind: 'action',
        ID: 'sheets-tab-move-left',
        Label: 'Move Sheet Left',
        Icon: 'fa-solid fa-chevron-left',
        Disabled: target.SheetIndex <= 0,
        DisabledReason: target.SheetIndex <= 0 ? 'Already the first worksheet' : undefined,
        Command: { Type: 'move-sheet', SheetID: target.SheetID, Direction: 'left' },
      },
      {
        Kind: 'action',
        ID: 'sheets-tab-move-right',
        Label: 'Move Sheet Right',
        Icon: 'fa-solid fa-chevron-right',
        Disabled: target.SheetIndex >= target.TotalSheets - 1,
        DisabledReason: target.SheetIndex >= target.TotalSheets - 1 ? 'Already the last worksheet' : undefined,
        Command: { Type: 'move-sheet', SheetID: target.SheetID, Direction: 'right' },
      }
    );

    if (target.HiddenRowCount > 0 || target.HiddenColCount > 0) {
      items.push({
        Kind: 'action',
        ID: 'sheets-tab-unhide-all',
        Label: `Unhide All (${target.HiddenRowCount} rows, ${target.HiddenColCount} cols)`,
        Icon: 'fa-regular fa-eye',
        Command: { Type: 'unhide-all-in-sheet', SheetID: target.SheetID },
      });
    }

    items.push({ Kind: 'separator', ID: 'sheets-tab-sep-export' });
  }

  items.push(
    {
      Kind: 'action',
      ID: 'sheets-tab-copy-csv',
      Label: 'Copy Sheet as CSV',
      Icon: 'fa-regular fa-copy',
      Command: { Type: 'export-sheet-csv', SheetID: target.SheetID, Mode: 'copy' },
    },
    {
      Kind: 'action',
      ID: 'sheets-tab-download-csv',
      Label: 'Export Sheet CSV',
      Icon: 'fa-solid fa-file-csv',
      Command: { Type: 'export-sheet-csv', SheetID: target.SheetID, Mode: 'download' },
    }
  );

  if (ctx.CanEdit) {
    items.push(
      { Kind: 'separator', ID: 'sheets-tab-sep-delete' },
      {
        Kind: 'action',
        ID: 'sheets-tab-delete',
        Label: 'Delete Sheet',
        Icon: 'fa-regular fa-trash-can',
        Destructive: true,
        Disabled: target.TotalSheets <= 1,
        DisabledReason: target.TotalSheets <= 1 ? 'Workbook must contain at least one worksheet' : undefined,
        Command: { Type: 'delete-sheet', SheetID: target.SheetID },
      }
    );
  }

  return items;
}

function buildChartMenu(
  target: SheetsChartContextTarget,
  ctx: SheetsContextMenuSnapshot
): ContextMenuItem<SheetsContextMenuCommand>[] {
  const placementLabel = target.Placement === 'dock' ? 'Docked' : 'On Sheet';
  const items: ContextMenuItem<SheetsContextMenuCommand>[] = [
    {
      Kind: 'header',
      ID: 'sheets-chart-header',
      Label: `${target.Title || 'Range Chart'} (${placementLabel})`,
      Icon: 'fa-solid fa-chart-column',
    },
  ];

  if (ctx.CanEdit) {
    items.push(
      {
        Kind: 'action',
        ID: 'sheets-chart-edit',
        Label: 'Edit Chart...',
        Icon: 'fa-solid fa-sliders',
        Command: { Type: 'open-chart-editor', ChartID: target.ChartID },
      },
      {
        Kind: 'submenu',
        ID: 'sheets-chart-type',
        Label: 'Chart Type',
        Icon: 'fa-solid fa-chart-pie',
        Children: CHART_TYPE_OPTIONS.map((opt) => ({
          Kind: 'action',
          ID: `sheets-chart-type-${opt.Type}`,
          Label: opt.Label,
          Icon: opt.Icon,
          Role: 'menuitemradio',
          Checked: target.ChartType === opt.Type,
          Command: { Type: 'set-chart-type', ChartID: target.ChartID, ChartType: opt.Type },
        })),
      },
      {
        Kind: 'action',
        ID: 'sheets-chart-toggle-placement',
        Label: target.Placement === 'sheet' ? 'Dock Chart to Sidebar' : 'Float Chart on Sheet',
        Icon: target.Placement === 'sheet' ? 'fa-solid fa-sidebar' : 'fa-regular fa-window-restore',
        Command: { Type: 'toggle-chart-placement', ChartID: target.ChartID },
      }
    );

    if (target.Placement === 'sheet' && target.HasCustomSize) {
      items.push({
        Kind: 'action',
        ID: 'sheets-chart-reset-size',
        Label: 'Reset Chart Size',
        Icon: 'fa-solid fa-compress',
        Command: { Type: 'reset-chart-size', ChartID: target.ChartID },
      });
    }

    if (target.Placement === 'sheet' && target.FloatingChartCount > 1) {
      items.push({
        Kind: 'action',
        ID: 'sheets-chart-bring-front',
        Label: 'Bring to Front',
        Icon: 'fa-solid fa-layer-group',
        Command: { Type: 'bring-chart-to-front', ChartID: target.ChartID },
      });
    }

    items.push({ Kind: 'separator', ID: 'sheets-chart-sep-data' });
  }

  items.push(
    {
      Kind: 'action',
      ID: 'sheets-chart-select-source',
      Label: `Select Source Range (${target.DataRangeA1})`,
      Icon: 'fa-solid fa-table-cells',
      Command: { Type: 'select-chart-source-range', ChartID: target.ChartID },
    },
    {
      Kind: 'action',
      ID: 'sheets-chart-copy-slide-block',
      Label: 'Copy Slide Chart Block JSON',
      Icon: 'fa-solid fa-code',
      Command: { Type: 'copy-chart-slide-block', ChartID: target.ChartID },
    }
  );

  if (ctx.CanEdit) {
    items.push(
      {
        Kind: 'action',
        ID: 'sheets-chart-duplicate',
        Label: 'Duplicate Chart',
        Icon: 'fa-regular fa-copy',
        Command: { Type: 'duplicate-chart', ChartID: target.ChartID },
      },
      { Kind: 'separator', ID: 'sheets-chart-sep-delete' },
      {
        Kind: 'action',
        ID: 'sheets-chart-delete',
        Label: 'Delete Chart',
        Icon: 'fa-regular fa-trash-can',
        Destructive: true,
        Command: { Type: 'delete-chart', ChartID: target.ChartID },
      }
    );
  }

  return items;
}

function buildLiveTableMenu(
  target: SheetsLiveTableContextTarget,
  ctx: SheetsContextMenuSnapshot
): ContextMenuItem<SheetsContextMenuCommand>[] {
  const items: ContextMenuItem<SheetsContextMenuCommand>[] = [
    {
      Kind: 'header',
      ID: 'sheets-live-table-header',
      Label: `${target.Title || 'Live Table'} (${target.Mode})`,
      Icon: 'fa-solid fa-database',
    },
    {
      Kind: 'action',
      ID: 'sheets-live-table-refresh',
      Label: 'Refresh Live Data',
      Icon: 'fa-solid fa-arrows-rotate',
      Command: { Type: 'refresh-live-table', TableID: target.TableID },
    },
    {
      Kind: 'action',
      ID: 'sheets-live-table-select-range',
      Label: `Select Table Range (${target.RangeA1})`,
      Icon: 'fa-solid fa-table-cells',
      Command: { Type: 'select-live-table-range', TableID: target.TableID },
    },
    {
      Kind: 'action',
      ID: 'sheets-live-table-copy-block',
      Label: 'Copy Live Block JSON',
      Icon: 'fa-solid fa-code',
      Command: { Type: 'copy-live-table-block', TableID: target.TableID },
    },
  ];

  if (ctx.CanEdit) {
    items.push(
      { Kind: 'separator', ID: 'sheets-live-table-sep-edit' },
      {
        Kind: 'action',
        ID: 'sheets-live-table-toggle-mode',
        Label: target.Mode === 'Live' ? 'Freeze Snapshot' : 'Reconnect as Live',
        Icon: target.Mode === 'Live' ? 'fa-solid fa-snowflake' : 'fa-solid fa-bolt',
        Command: { Type: 'toggle-live-table-mode', TableID: target.TableID },
      },
      {
        Kind: 'action',
        ID: 'sheets-live-table-edit',
        Label: 'Configure Live Table...',
        Icon: 'fa-solid fa-sliders',
        Command: { Type: 'open-live-table-editor', TableID: target.TableID },
      },
      { Kind: 'separator', ID: 'sheets-live-table-sep-delete' },
      {
        Kind: 'action',
        ID: 'sheets-live-table-delete',
        Label: 'Remove Live Table',
        Icon: 'fa-regular fa-trash-can',
        Destructive: true,
        Command: { Type: 'delete-live-table', TableID: target.TableID },
      }
    );
  }

  return items;
}

function buildEmbeddedArtifactMenu(
  target: SheetsEmbeddedArtifactContextTarget,
  ctx: SheetsContextMenuSnapshot
): ContextMenuItem<SheetsContextMenuCommand>[] {
  const items: ContextMenuItem<SheetsContextMenuCommand>[] = [
    {
      Kind: 'header',
      ID: 'sheets-embed-header',
      Label: `${target.Title || target.ArtifactType} (${target.AnchorCellA1})`,
      Icon: 'fa-solid fa-puzzle-piece',
    },
  ];

  if (target.HasSourceArtifactID) {
    items.push({
      Kind: 'action',
      ID: 'sheets-embed-open-source',
      Label: 'Open Source Artifact',
      Icon: 'fa-solid fa-arrow-up-right-from-square',
      Command: { Type: 'open-embedded-artifact', EmbedID: target.EmbedID },
    });
  }

  items.push({
    Kind: 'action',
    ID: 'sheets-embed-select-anchor',
    Label: `Select Anchor Cell (${target.AnchorCellA1})`,
    Icon: 'fa-solid fa-crosshairs',
    Command: { Type: 'select-embedded-anchor', EmbedID: target.EmbedID },
  });

  if (ctx.CanEdit) {
    items.push(
      { Kind: 'separator', ID: 'sheets-embed-sep-edit' },
      {
        Kind: 'action',
        ID: 'sheets-embed-refresh',
        Label: 'Refresh Embed Preview',
        Icon: 'fa-solid fa-arrows-rotate',
        Command: { Type: 'refresh-embedded-artifact', EmbedID: target.EmbedID },
      },
      {
        Kind: 'action',
        ID: 'sheets-embed-delete',
        Label: 'Remove Embedded Artifact',
        Icon: 'fa-regular fa-trash-can',
        Destructive: true,
        Command: { Type: 'delete-embedded-artifact', EmbedID: target.EmbedID },
      }
    );
  }

  return items;
}

function columnIndexToLetterSafe(colIndex: number): string {
  let n = Math.max(1, Math.floor(colIndex));
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result || 'A';
}

export function BuildSheetsContextMenu(
  ctx: SheetsContextMenuSnapshot
): ContextMenuItem<SheetsContextMenuCommand>[] {
  switch (ctx.Target.Kind) {
    case 'cell':
      return buildCellOrRangeMenu(ctx.Target, ctx);
    case 'row-header':
      return buildRowHeaderMenu(ctx.Target, ctx);
    case 'col-header':
      return buildColumnHeaderMenu(ctx.Target, ctx);
    case 'worksheet-tab':
      return buildWorksheetTabMenu(ctx.Target, ctx);
    case 'chart':
      return buildChartMenu(ctx.Target, ctx);
    case 'live-table':
      return buildLiveTableMenu(ctx.Target, ctx);
    case 'embedded-artifact':
      return buildEmbeddedArtifactMenu(ctx.Target, ctx);
  }
}
