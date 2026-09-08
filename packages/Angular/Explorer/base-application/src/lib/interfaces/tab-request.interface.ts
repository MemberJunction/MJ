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
   * "only one temp tab at a time" rule); record tabs under the records-style
   * record-open model live in their own layout region, so opening one must
   * leave the nav tab's temp status untouched — otherwise the pinned nav tab
   * forces the main tab bar visible on every nav page forever after.
   */
  PreservePinState?: boolean;

  /** Tab-specific configuration */
  Configuration?: Record<string, unknown>;
}
