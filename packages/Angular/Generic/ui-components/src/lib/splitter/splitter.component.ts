/**
 * MJ Splitter — wraps angular-split for resizable split layouts.
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
 * Sizing: `<as-split direction="horizontal">` with `<as-split-area [size]="30">` for a
 * percentage pane, or `[size]="*"` for a pane that fills the remaining space.
 * - size values are numbers (percentages), not strings
 */

// Re-export angular-split module for consumers
export { AngularSplitModule } from 'angular-split';
