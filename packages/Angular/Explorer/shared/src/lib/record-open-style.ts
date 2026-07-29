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
 * Tab-configuration key marking a record tab the user has promoted ("docked")
 * out of the records region into the MAIN workspace layout ("Move to
 * Workspace"). Persisted with the tab configuration. ALWAYS read through
 * IsRecordDockedToWorkspace.
 */
export const RECORD_DOCKED_TO_WORKSPACE_KEY = 'recordDockedToWorkspace';

/** True when a record tab has been promoted into the main workspace layout */
export function IsRecordDockedToWorkspace(configuration: Record<string, unknown> | undefined | null): boolean {
  return configuration?.[RECORD_DOCKED_TO_WORKSPACE_KEY] === true;
}

/**
 * True when a tab LIVES in the records region: it is a record tab that has
 * NOT been docked to the workspace. This is the REGION-MEMBERSHIP predicate —
 * layout routing, region visibility, the Records pill, and the shell's
 * app-flip guard all fork on it. Record IDENTITY checks (open dedup,
 * record→record origin capture, SwitchToApp's "never land on a record"
 * filter) must keep using IsRecordsTabConfiguration: a docked record is
 * still a record, it just lives in the main layout.
 */
export function IsRecordsRegionTab(configuration: Record<string, unknown> | undefined | null): boolean {
  return IsRecordsTabConfiguration(configuration) && !IsRecordDockedToWorkspace(configuration);
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
  /** Display title of the source tab at capture (what the user saw) */
  sourceNavLabel?: string;
  /**
   * Canonical nav-item identity of the source tab (its configuration
   * `navItemName`). Titles MUTATE — dashboards rename their tab as the user
   * drills (Data Explorer sets it to the selected entity) — so identity
   * checks and nav re-resolution use THIS; the label is display-only.
   * Absent for dynamic nav items, which never get navItemName stamped.
   */
  sourceNavItemName?: string;
  /** The exact workspace tab the user was on — highest-fidelity return target */
  sourceTabId?: string;
  /**
   * Display label for NON-TAB origins (overlays, dialogs, agent actions —
   * e.g. 'Conversation', 'Search'). When present, the crumb renders this
   * label instead of "App › Page". Surfaces that aren't workspace tabs MUST
   * set this (via NavigationOptions.recordSource) instead of letting
   * captureSourceContext blame whatever tab sits behind the overlay.
   */
  sourceLabel?: string;
  /** Query params to apply when returning via the app + nav-label fallback */
  sourceQueryParams?: Record<string, string>;
  /**
   * Set when the record was opened from INSIDE another record (Matt's
   * record→record call, 2026-07-28: the crumb points at the PARENT record).
   * Identity — not the tab id — is what the return path verifies and, when
   * the parent's tab has been closed, re-opens.
   */
  sourceRecordEntity?: string;
  sourceRecordId?: string;
}

/** True when the origin has somewhere to GO back to (crumb is clickable) */
export function RecordSourceHasReturnTarget(origin: RecordSourceContext | null): boolean {
  return !!(origin && (origin.sourceTabId || origin.sourceAppId));
}

/**
 * Extract the source context from a record tab's configuration. Returns null
 * when there is no usable origin (no sourceAppId), so callers can gate the
 * crumb UI on a single truthiness check.
 */
export function GetRecordSourceContext(configuration: Record<string, unknown> | undefined | null): RecordSourceContext | null {
  const readString = (key: string): string | undefined => {
    const value = configuration?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };
  const appId = readString('sourceAppId');
  const label = readString('sourceLabel');
  if (!appId && !label) {
    return null;
  }
  const context: RecordSourceContext = {
    sourceAppId: appId,
    sourceAppName: readString('sourceAppName'),
    sourceNavLabel: readString('sourceNavLabel'),
    sourceNavItemName: readString('sourceNavItemName'),
    sourceTabId: readString('sourceTabId'),
    sourceLabel: label,
    sourceRecordEntity: readString('sourceRecordEntity'),
    sourceRecordId: readString('sourceRecordId')
  };
  const rawParams = configuration?.['sourceQueryParams'];
  if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawParams as Record<string, unknown>)) {
      if (typeof value === 'string') {
        params[key] = value;
      }
    }
    if (Object.keys(params).length > 0) {
      context.sourceQueryParams = params;
    }
  }
  return context;
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
