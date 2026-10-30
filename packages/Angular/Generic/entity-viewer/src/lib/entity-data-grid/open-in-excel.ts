/**
 * @fileoverview When the view grid offers Open in Excel.
 *
 * Kept out of the component so the rule is testable on its own: the workbook names a SAVED view by
 * ID, so a dynamic view (an entity plus ad-hoc filters) has nothing to name and never offers it.
 */

/**
 * True when the grid should show Open in Excel: the host allows the button, a saved view is loaded,
 * and the MemberJunction host serves the Excel add-in.
 */
export function CanOpenViewInExcel(showButton: boolean, savedViewID: string | null | undefined, addinEnabled: boolean): boolean {
    return showButton && addinEnabled && typeof savedViewID === 'string' && savedViewID.trim().length > 0;
}

/** The tooltip on the view grid's Open in Excel button. */
export const OPEN_VIEW_IN_EXCEL_TOOLTIP =
    'Download a workbook that loads this saved view in Excel and refreshes it from MemberJunction. ' +
    'Unsaved changes to the view aren\'t included.';
