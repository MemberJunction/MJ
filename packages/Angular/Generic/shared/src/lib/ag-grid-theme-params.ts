/**
 * Shared AG Grid theme parameters mapping the `--mj-*` design-token contract onto
 * AG Grid's theming API, so every MJ grid follows light/dark and the org brand
 * overlay identically. Consumers pass this to AG Grid's theme builder:
 *
 * ```typescript
 * import { themeAlpine, type Theme } from 'ag-grid-community';
 * import { MJ_AG_GRID_THEME_PARAMS } from '@memberjunction/ng-shared-generic';
 *
 * public GridTheme: Theme = themeAlpine.withParams(MJ_AG_GRID_THEME_PARAMS);
 * ```
 *
 * Kept as a plain `as const` object (no ag-grid import) so this package carries no
 * grid dependency; `withParams` accepts it structurally. One definition prevents the
 * per-grid copies of this block from drifting.
 */
export const MJ_AG_GRID_THEME_PARAMS = {
  backgroundColor: 'var(--mj-bg-surface)',
  foregroundColor: 'var(--mj-text-primary)',
  textColor: 'var(--mj-text-primary)',
  borderColor: 'var(--mj-border-default)',
  chromeBackgroundColor: 'var(--mj-bg-surface-card)',
  headerBackgroundColor: 'var(--mj-bg-surface-card)',
  headerTextColor: 'var(--mj-text-secondary)',
  cellTextColor: 'var(--mj-text-primary)',
  subtleTextColor: 'var(--mj-text-muted)',
  dataBackgroundColor: 'var(--mj-bg-surface)',
  oddRowBackgroundColor: 'var(--mj-bg-surface-card)',
  rowHoverColor: 'var(--mj-bg-surface-hover, color-mix(in srgb, var(--mj-brand-primary) 5%, var(--mj-bg-surface)))',
  selectedRowBackgroundColor: 'color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface))',
  accentColor: 'var(--mj-brand-primary)',
  borderRadius: 'var(--mj-radius-sm)',
  browserColorScheme: 'inherit',
} as const;
