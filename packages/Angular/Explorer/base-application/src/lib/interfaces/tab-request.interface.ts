/**
 * Request to open a new tab
 */
export interface TabRequest {
  /** ID of the application this tab belongs to */
  ApplicationId: string;

  /** Display title for the tab */
  Title: string;

  /** Route to load in the tab (optional if ResourceType is provided) */
  Route?: string;

  /** Resource type for resource-based tabs */
  ResourceType?: string;

  /** Resource type ID for matching existing tabs (legacy) */
  ResourceTypeId?: string;

  /** Resource record ID for matching existing tabs */
  ResourceRecordId?: string;

  /** Whether this tab should be pinned (permanent) */
  IsPinned?: boolean;

  /**
   * When true, opening this tab must NOT mutate other tabs' pin state.
   * OpenTabForced normally pins all existing temporary tabs (the classic
   * "only one temp tab at a time" rule).
   *
   * Record opens no longer need this: `TempScope: 'records'` scopes both the
   * consumption pool and the pin cascade to the records region, which leaves
   * the nav tab's temp status untouched while still enforcing one temp tab
   * per region. (A pinned nav tab forces the main tab bar visible on every
   * nav page forever after, which is what the blunt opt-out was avoiding.)
   * It remains for callers that genuinely want no cascade at all.
   */
  PreservePinState?: boolean;

  /**
   * Which "single temporary tab" pool this request participates in, for both
   * consumption (OpenTab) and the pin cascade (OpenTabForced). Defaults to
   * `'main'`, the classic single-pool behavior.
   *
   * `'records'` targets the records region: a plain record open consumes the
   * region's temporary record tab and leaves nav tabs alone, and vice versa.
   * The two pools are disjoint, which is what lets records get preview-tab
   * behavior without a nav click ever replacing an open record.
   */
  TempScope?: 'main' | 'records';

  /** Tab-specific configuration */
  Configuration?: Record<string, unknown>;
}
