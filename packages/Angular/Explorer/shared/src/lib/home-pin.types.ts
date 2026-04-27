/**
 * A pinned item on the Home dashboard.
 * Stored as JSON array in UserSettings key 'HomeApp.PinnedItems'.
 */
export interface HomeAppPinnedItem {
  /** Client-generated UUID */
  Id: string;

  /** User-editable display name (defaults to tab title at pin time) */
  DisplayName: string;

  /** Optional user-editable subtitle */
  Description?: string;

  /** FA icon class override. Null = auto-resolve from entity/app metadata */
  Icon?: string;

  /** Hex color override. Null = derive from source app's Color */
  Color?: string;

  /** MJ resource type: "Dashboards", "User Views", "Reports", "Queries", "Records", "Custom" */
  ResourceType: string;

  /** Source app ID (null = orphan / Home context) */
  ApplicationID?: string;

  /** Source app name for display badge ("AI", "CRM", etc.) */
  ApplicationName?: string;

  /** Full TabConfiguration blob - everything needed to re-open the resource */
  Configuration: Record<string, unknown>;

  /** Base64 JPEG thumbnail screenshot (~5-15KB at 0.2x scale). Null = use icon fallback */
  Thumbnail?: string;

  /** Display order within group (0-based) */
  Sequence: number;

  /** Optional group name for organizing pins. Null = ungrouped (shown first) */
  Group?: string;

  /** ISO timestamp of when this was pinned */
  PinnedAt: string;
}

/**
 * Configuration shape for pins with ResourceType === 'Actions'.
 * Stored inside HomeAppPinnedItem.Configuration as a plain object.
 */
export interface ActionPinConfiguration {
  /** ID of the MJ Action to execute */
  actionId: string;
  /** Action name at pin time — kept for display in case the Action is renamed */
  actionName: string;
  /** Parameter values baked into the pin — passed every time the pin is invoked */
  presetParams: Record<string, string>;
  /** Names of ActionParams to prompt the user for when the pin is clicked */
  runtimeParamNames: string[];
  /** Hex accent color (e.g. '#4F46E5') used for the pin card background gradient */
  accentColor?: string;
  /** User's custom title (also stored on HomeAppPinnedItem.DisplayName for consistency) */
  displayName?: string;
}

/**
 * Input for creating a new pin (ID, Sequence, and PinnedAt are auto-generated)
 */
export type HomeAppPinInput = Omit<HomeAppPinnedItem, 'Id' | 'Sequence' | 'PinnedAt'>;

/**
 * Fields that can be updated on an existing pin
 */
export type HomeAppPinUpdate = Partial<Pick<HomeAppPinnedItem, 'DisplayName' | 'Description' | 'Icon' | 'Color' | 'Group' | 'Thumbnail'>>;
