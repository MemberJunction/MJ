/**
 * @fileoverview Resolves when `<mj-entity-data-grid>` offers Open in Excel and which workbook source
 * (`View` or `Entity`) it sends to `ExcelAddinClient`.
 *
 * Kept out of the component so the rule is unit-testable in isolation:
 * - When a saved `MJ: User Views` record backs the grid, the workbook opens `{ Kind: 'View', ID }`.
 * - When the grid shows an unscoped entity (such as Data Explorer's `(Default)` view, with no parent
 *   `ExtraFilter` and no ad-hoc `AlternateBaseView`), the workbook opens `{ Kind: 'Entity', ID }`.
 * - Scoped subgrids (for example a related-records grid on a form with `ExtraFilter`) have no standalone
 *   saved view or unscoped entity to bind, so they keep the static snapshot export only.
 */
import type { RunViewParams } from '@memberjunction/core';
import type { ExcelWorkbookSourceRequest } from '@memberjunction/excel-addin';

/** Inputs that decide whether an entity grid can open a live workbook in Excel. */
export interface GridExcelSourceOptions {
    ShowButton: boolean;
    AddinEnabled: boolean;
    SavedViewID?: string | null;
    EntityID?: string | null;
    ExtraFilter?: RunViewParams['ExtraFilter'] | null;
    AlternateBaseView?: string | null;
}

/**
 * Resolves the workbook source request for the current grid state, or `null` when Open in Excel does
 * not apply.
 */
export function ResolveGridExcelSource(options: GridExcelSourceOptions): ExcelWorkbookSourceRequest | null {
    if (!options.ShowButton || !options.AddinEnabled) {
        return null;
    }
    const savedViewID = options.SavedViewID?.trim() ?? '';
    if (savedViewID.length > 0) {
        return { Kind: 'View', ID: savedViewID };
    }
    const hasExtraFilter = hasNonEmptyExtraFilter(options.ExtraFilter);
    const hasAlternateBaseView = (options.AlternateBaseView?.trim().length ?? 0) > 0;
    if (hasExtraFilter || hasAlternateBaseView) {
        return null;
    }
    const entityID = options.EntityID?.trim() ?? '';
    if (entityID.length > 0) {
        return { Kind: 'Entity', ID: entityID };
    }
    return null;
}

function hasNonEmptyExtraFilter(extraFilter: RunViewParams['ExtraFilter'] | null | undefined): boolean {
    if (!extraFilter) {
        return false;
    }
    if (typeof extraFilter === 'string') {
        return extraFilter.trim().length > 0;
    }
    return (
        (extraFilter.default?.trim().length ?? 0) > 0 ||
        (extraFilter.sqlserver?.trim().length ?? 0) > 0 ||
        (extraFilter.postgresql?.trim().length ?? 0) > 0
    );
}

/**
 * True when the grid should offer Open in Excel for a saved view ID specifically.
 */
export function CanOpenViewInExcel(showButton: boolean, savedViewID: string | null | undefined, addinEnabled: boolean): boolean {
    return ResolveGridExcelSource({ ShowButton: showButton, SavedViewID: savedViewID, AddinEnabled: addinEnabled }) !== null;
}

/** Tooltip when opening a saved view in Excel. */
export const OPEN_VIEW_IN_EXCEL_TOOLTIP =
    'Download a workbook that loads this saved view in Excel and refreshes it live from MemberJunction. ' +
    'Unsaved changes to the view aren\'t included.';

/** Tooltip when opening an unscoped entity's default dataset in Excel. */
export const OPEN_ENTITY_IN_EXCEL_TOOLTIP =
    'Download a workbook that connects to this entity in Excel and refreshes its records live from MemberJunction.';

/** Returns the tooltip matching the resolved workbook source (`View` vs `Entity`). */
export function ExcelSourceTooltip(source: ExcelWorkbookSourceRequest | null): string {
    if (source?.Kind === 'Entity') {
        return OPEN_ENTITY_IN_EXCEL_TOOLTIP;
    }
    return OPEN_VIEW_IN_EXCEL_TOOLTIP;
}

/** Returns the concise subtitle shown under "Open in Excel" inside the unified toolbar menu. */
export function ExcelSourceMenuDescription(source: ExcelWorkbookSourceRequest | null): string {
    if (source?.Kind === 'Entity') {
        return 'Connected workbook — sign in & refresh entity records live';
    }
    return 'Connected workbook — sign in & refresh this saved view live';
}
