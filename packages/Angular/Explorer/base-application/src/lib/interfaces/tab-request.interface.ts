/**
 * Request to open a new tab
 */
export interface TabRequest {
  /** ID of the application this tab belongs to */
  ApplicationId: string;

  /** Display title for the tab */
  Title: string;

  /** Route to load in the tab */
  Route: string;

  /** Resource type ID for matching existing tabs */
  ResourceTypeId?: string;

  /** Resource record ID for matching existing tabs */
  ResourceRecordId?: string;

  /** Tab-specific configuration */
  Configuration?: Record<string, unknown>;
}
