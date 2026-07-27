/**
 * Record-open style — how Explorer treats records opened from within apps.
 *
 * - 'records' (DEFAULT): records are a GLOBAL surface. Opening a record keeps
 *   you in the app you're standing in (assigned there, no Home reassignment),
 *   always opens as its own tab (re-open focuses the existing one), and the
 *   shell renders a persistent count-badged "Records" pill in the header nav
 *   plus a record-only tab strip while a record is being viewed. The
 *   invariant: any open record is at most 2 clicks away from anywhere — the
 *   pill resumes the last-viewed record (1 click), the strip reaches the rest.
 * - 'classic': the previous behavior — record opens are reassigned to the
 *   Home app (which surfaces them as dynamic nav items) and multi-tab UI is
 *   the Golden Layout header. Downstream escape hatch, not the product
 *   direction.
 *
 * The value is resolved from the `Shell.RecordOpen.Style` instance config by
 * the shell (see ShellComponent.chromeFlags) and pushed here so that
 * NavigationService — which runs in this package, below the shell — forks on
 * the same value. Module-level state (not a service) because the style is a
 * per-deployment constant, not per-component state.
 */
export type RecordOpenStyle = 'records' | 'classic';

/**
 * The workspace tab resourceType identifying entity-record tabs — the tabs
 * the records-style model routes into the separate records layout region.
 * ALWAYS compare through this constant: a typo'd literal would silently leak
 * record tabs into the wrong layout with no compile error.
 */
export const RECORDS_RESOURCE_TYPE = 'Records';

/** True when a workspace tab's configuration marks it as an entity-record tab */
export function IsRecordsTabConfiguration(configuration: Record<string, unknown> | undefined | null): boolean {
  return configuration?.['resourceType'] === RECORDS_RESOURCE_TYPE;
}

let currentStyle: RecordOpenStyle = 'records';

/** Set by the shell once instance config resolves. Idempotent. */
export function SetRecordOpenStyle(style: RecordOpenStyle): void {
  currentStyle = style;
}

/** The deployment's record-open style ('records' unless configured 'classic') */
export function GetRecordOpenStyle(): RecordOpenStyle {
  return currentStyle;
}

/** True when records-as-tabs is active (the 'records' style) */
export function IsRecordTabsStyle(): boolean {
  return currentStyle === 'records';
}
