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

/**
 * Where the user was standing when a record was opened — captured by
 * NavigationService.OpenEntityRecord into the record tab's configuration.
 * Powers the origin crumb in the records region ("← App › Page"), which takes
 * the user straight back to that page. Origin is PROVENANCE, not location:
 * records are a global surface with no canonical parent, so this trail is a
 * convenience affordance ("return to where I came from"), never an ancestry
 * claim. All fields optional because capture is best-effort (e.g. no active
 * app at open time, or the source tab has since been closed).
 */
export interface RecordSourceContext {
  sourceAppId?: string;
  sourceAppName?: string;
  sourceNavLabel?: string;
  /** The exact workspace tab the user was on — highest-fidelity return target */
  sourceTabId?: string;
}

/**
 * Extract the source context from a record tab's configuration. Returns null
 * when there is no usable origin (no sourceAppId), so callers can gate the
 * crumb UI on a single truthiness check.
 */
export function GetRecordSourceContext(configuration: Record<string, unknown> | undefined | null): RecordSourceContext | null {
  const appId = configuration?.['sourceAppId'];
  if (typeof appId !== 'string' || appId.length === 0) {
    return null;
  }
  const readString = (key: string): string | undefined => {
    const value = configuration?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };
  return {
    sourceAppId: appId,
    sourceAppName: readString('sourceAppName'),
    sourceNavLabel: readString('sourceNavLabel'),
    sourceTabId: readString('sourceTabId')
  };
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
