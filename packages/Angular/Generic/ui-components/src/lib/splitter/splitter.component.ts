/**
 * MJ Splitter — wraps angular-split for resizable split layouts.
 * Replaces `<kendo-splitter>` and `<kendo-splitter-pane>`.
 *
 * Re-exports angular-split's AngularSplitModule so consumers only
 * need to import from @memberjunction/ng-ui-components.
 *
 * Usage:
 * ```html
 * <as-split direction="horizontal">
 *   <as-split-area [size]="30">Left</as-split-area>
 *   <as-split-area [size]="70">Right</as-split-area>
 * </as-split>
 * ```
 *
 * Migration from Kendo:
 * - `<kendo-splitter orientation="horizontal">` → `<as-split direction="horizontal">`
 * - `<kendo-splitter-pane [size]="'30%'">` → `<as-split-area [size]="30">`
 * - `<kendo-splitter-pane>` (no size = fill) → `<as-split-area [size]="*">`
 * - size values are numbers (percentages), not strings
 */

// Re-export angular-split module for consumers
export { AngularSplitModule } from 'angular-split';
