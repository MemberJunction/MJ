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

  /** Tab-specific configuration */
  Configuration?: Record<string, unknown>;
}
