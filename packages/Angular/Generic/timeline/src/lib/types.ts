/**
 * @fileoverview Core type definitions for the MJ Timeline component.
 *
 * This module defines all interfaces, types, and classes used by the timeline.
 * The types are designed to work with both MemberJunction BaseEntity objects
 * and plain JavaScript objects, making the component usable in any Angular application.
 *
 * @module @memberjunction/ng-timeline/types
 */

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Orientation options for the timeline display.
 * - `vertical`: Events displayed top-to-bottom (default)
 * - `horizontal`: Events displayed left-to-right with horizontal scrolling
 */
export type TimelineOrientation = 'vertical' | 'horizontal';

/**
 * Layout options for vertical timeline.
 * - `single`: All events on one side of the axis
 * - `alternating`: Events alternate between left and right sides
 */
export type TimelineLayout = 'single' | 'alternating';

/**
 * Sort order for timeline events.
 * - `asc`: Oldest events first (ascending by date)
 * - `desc`: Newest events first (descending by date)
 */
export type TimelineSortOrder = 'asc' | 'desc';

/**
 * Grouping options for time segments.
 * - `none`: No grouping, flat list of events
 * - `day`: Group by day
 * - `week`: Group by week
 * - `month`: Group by month (default)
 * - `quarter`: Group by quarter
 * - `year`: Group by year
 */
export type TimeSegmentGrouping = 'none' | 'day' | 'week' | 'month' | 'quarter' | 'year';

/**
 * Button style variants for action buttons.
 */
export type ActionVariant = 'primary' | 'secondary' | 'danger' | 'link';

/**
 * Image position options within a card.
 */
export type ImagePosition = 'left' | 'top' | 'none';

/**
 * Image size presets.
 */
export type ImageSize = 'small' | 'medium' | 'large';

// ============================================================================
// FIELD DISPLAY CONFIGURATION
// ============================================================================

/**
 * Configuration for displaying a field within a timeline card.
 * Used for both summary fields (always visible) and expanded fields (visible when expanded).
 *
 * @example
 * ```typescript
 * const field: TimelineDisplayField = {
 *   fieldName: 'AssignedTo',
 *   label: 'Assignee',
 *   icon: 'fa-solid fa-user',
 *   formatter: (value) => value?.toString().toUpperCase() ?? 'Unassigned'
 * };
 * ```
 */
export interface TimelineDisplayField {
  /**
   * The field name to extract from the record.
   * For BaseEntity objects, this is passed to `.Get()`.
   * For plain objects, this is used as a property key.
   */
  fieldName: string;

  /**
   * Display label shown before the value.
   * If not provided, defaults to the fieldName.
   */
  label?: string;

  /**
   * Font Awesome icon class to display before the label.
   * @example 'fa-solid fa-user'
   */
  icon?: string;

  /**
   * Format string for dates/numbers.
   * For dates, uses Angular DatePipe format strings.
   * For numbers, uses Angular DecimalPipe format strings.
   */
  format?: string;

  /**
   * Custom formatter function for complex value transformations.
   * Takes precedence over the `format` property.
   *
   * @param value - The raw field value
   * @returns Formatted string to display
   */
  formatter?: (value: unknown) => string;

  /**
   * If true, only shows the value without the label.
   * @default false
   */
  hideLabel?: boolean;

  /**
   * Additional CSS class(es) to apply to this field's container.
   */
  cssClass?: string;
}

// ============================================================================
// ACTION BUTTON CONFIGURATION
// ============================================================================

/**
 * Configuration for an action button displayed on a timeline card.
 *
 * @example
 * ```typescript
 * const viewAction: TimelineAction = {
 *   id: 'view',
 *   label: 'View Details',
 *   icon: 'fa-solid fa-eye',
 *   variant: 'primary',
 *   tooltip: 'Open the full details view'
 * };
 * ```
 */
export interface TimelineAction {
  /**
   * Unique identifier for this action.
   * Used in event handlers to identify which action was clicked.
   */
  id: string;

  /**
   * Display text for the button.
   */
  label: string;

  /**
   * Font Awesome icon class to display in the button.
   * @example 'fa-solid fa-edit'
   */
  icon?: string;

  /**
   * Visual style variant for the button.
   * - `primary`: Prominent action (filled/solid)
   * - `secondary`: Standard action (outlined)
   * - `danger`: Destructive action (red)
   * - `link`: Text-only button
   * @default 'secondary'
   */
  variant?: ActionVariant;

  /**
   * Tooltip text shown on hover.
   */
  tooltip?: string;

  /**
   * Whether the action is disabled.
   * Disabled actions are visually muted and not clickable.
   * @default false
   */
  disabled?: boolean;

  /**
   * Additional CSS class(es) to apply to the button.
   */
  cssClass?: string;
}

// ============================================================================
// CARD CONFIGURATION
// ============================================================================

/**
 * Configuration for how timeline cards are displayed.
 * Can be set at the group level (applies to all events in group) or
 * overridden per-event via `EventConfigFunction`.
 *
 * @example
 * ```typescript
 * const cardConfig: TimelineCardConfig = {
 *   showIcon: true,
 *   showDate: true,
 *   dateFormat: 'MMM d, yyyy h:mm a',
 *   collapsible: true,
 *   defaultExpanded: false,
 *   descriptionMaxLines: 3,
 *   summaryFields: [
 *     { fieldName: 'Status', icon: 'fa-solid fa-circle' },
 *     { fieldName: 'Priority', icon: 'fa-solid fa-flag' }
 *   ],
 *   actions: [
 *     { id: 'view', label: 'View', variant: 'primary' },
 *     { id: 'edit', label: 'Edit', variant: 'secondary' }
 *   ]
 * };
 * ```
 */
export interface TimelineCardConfig {
  // === Header Section ===

  /**
   * Whether to show the icon in the card header.
   * @default true
   */
  showIcon?: boolean;

  /**
   * Whether to show the date in the card header.
   * @default true
   */
  showDate?: boolean;

  /**
   * Whether to show the subtitle below the title.
   * @default true
   */
  showSubtitle?: boolean;

  /**
   * Date format string (Angular DatePipe format).
   * @default 'MMM d, yyyy'
   * @example 'short', 'medium', 'MMM d, yyyy h:mm a'
   */
  dateFormat?: string;

  // === Image Section ===

  /**
   * Field name containing the image URL.
   * If not set, no image is displayed.
   */
  imageField?: string;

  /**
   * Position of the image within the card.
   * - `left`: Image on the left side of the header
   * - `top`: Image above the content (full width)
   * - `none`: No image displayed
   * @default 'left'
   */
  imagePosition?: ImagePosition;

  /**
   * Size preset for the image.
   * - `small`: 48x48px
   * - `medium`: 80x80px
   * - `large`: 120x120px
   * @default 'small'
   */
  imageSize?: ImageSize;

  // === Body Section ===

  /**
   * Field name for the description/body text.
   * If not set, uses the group's DescriptionFieldName.
   */
  descriptionField?: string;

  /**
   * Maximum number of lines to show before truncating.
   * Set to 0 for no limit.
   * @default 3
   */
  descriptionMaxLines?: number;

  /**
   * Whether to render HTML in the description.
   * WARNING: Only enable if content is trusted to prevent XSS.
   * @default false
   */
  allowHtmlDescription?: boolean;

  // === Expansion ===

  /**
   * Whether this card can be expanded/collapsed.
   * @default true
   */
  collapsible?: boolean;

  /**
   * Whether the card starts in expanded state.
   * @default false
   */
  defaultExpanded?: boolean;

  /**
   * Fields to display only when the card is expanded.
   * These appear in the detail section below the description.
   */
  expandedFields?: TimelineDisplayField[];

  /**
   * Fields to always display (even when collapsed).
   * These appear as compact field:value pairs.
   */
  summaryFields?: TimelineDisplayField[];

  // === Actions ===

  /**
   * Action buttons to display at the bottom of the card.
   */
  actions?: TimelineAction[];

  /**
   * If true, actions are only visible on hover/focus.
   * @default false
   */
  actionsOnHover?: boolean;

  // === Styling ===

  /**
   * Additional CSS class(es) to apply to the card container.
   */
  cssClass?: string;

  /**
   * Minimum width for the card.
   * @example '200px', '15rem'
   */
  minWidth?: string;

  /**
   * Maximum width for the card.
   * @default '400px'
   */
  maxWidth?: string;
}

// ============================================================================
// PER-EVENT CONFIGURATION
// ============================================================================

/**
 * Per-event display configuration returned by `EventConfigFunction`.
 * Allows customizing individual events within a group.
 *
 * @example
 * ```typescript
 * group.EventConfigFunction = (record) => ({
 *   icon: record.Priority === 'High' ? 'fa-solid fa-exclamation' : undefined,
 *   color: record.Status === 'Overdue' ? '#f44336' : undefined,
 *   cssClass: record.IsImportant ? 'important-event' : ''
 * });
 * ```
 */
export interface TimelineEventConfig {
  /**
   * Override the icon for this specific event.
   * Font Awesome class string.
   */
  icon?: string;

  /**
   * Override the marker/accent color for this event.
   * Any valid CSS color value.
   */
  color?: string;

  /**
   * Additional CSS class(es) for this event's card.
   */
  cssClass?: string;

  /**
   * Override the actions for this specific event.
   */
  actions?: TimelineAction[];

  /**
   * Override whether this specific event is collapsible.
   */
  collapsible?: boolean;

  /**
   * Override whether this specific event starts expanded.
   */
  defaultExpanded?: boolean;
}

// ============================================================================
// VIRTUAL SCROLLING
// ============================================================================

/**
 * Configuration for virtual scrolling behavior.
 *
 * @example
 * ```typescript
 * const scrollConfig: VirtualScrollConfig = {
 *   enabled: true,
 *   batchSize: 25,
 *   loadThreshold: 300,
 *   showLoadingIndicator: true,
 *   loadingMessage: 'Loading more events...'
 * };
 * ```
 */
export interface VirtualScrollConfig {
  /**
   * Whether virtual scrolling is enabled.
   * When disabled, all events load at once.
   * @default true
   */
  enabled: boolean;

  /**
   * Number of events to load per batch.
   * @default 20
   */
  batchSize: number;

  /**
   * Distance from bottom (in pixels) at which to trigger loading more.
   * @default 200
   */
  loadThreshold: number;

  /**
   * Whether to show a loading indicator while fetching.
   * @default true
   */
  showLoadingIndicator: boolean;

  /**
   * Custom message to display while loading.
   * @default 'Loading more events...'
   */
  loadingMessage?: string;
}

/**
 * Runtime state for virtual scrolling.
 * Exposed as a public property on the component for monitoring.
 */
export interface VirtualScrollState {
  /**
   * Total number of events available (if known).
   * May be undefined if total is unknown.
   */
  totalCount?: number;

  /**
   * Number of events currently loaded and displayed.
   */
  loadedCount: number;

  /**
   * Whether more events are available to load.
   */
  hasMore: boolean;

  /**
   * Whether a load operation is currently in progress.
   */
  isLoading: boolean;

  /**
   * Current scroll position offset.
   */
  scrollOffset: number;
}

// ============================================================================
// TIMELINE EVENT (Internal Representation)
// ============================================================================

/**
 * Internal representation of a timeline event.
 * Created by mapping source records to this structure.
 *
 * @typeParam T - The type of the source record (defaults to `any`)
 */
export interface MJTimelineEvent<T = any> {
  /**
   * Unique identifier for this event.
   * Extracted from the source record using IdFieldName.
   */
  id: string;

  /**
   * Reference to the original source record.
   * Can be a BaseEntity or plain object.
   */
  entity: T;

  /**
   * Event title extracted from TitleFieldName.
   */
  title: string;

  /**
   * Event date extracted from DateFieldName.
   */
  date: Date;

  /**
   * Optional subtitle extracted from SubtitleFieldName.
   */
  subtitle?: string;

  /**
   * Event description/body text.
   */
  description?: string;

  /**
   * Image URL if configured.
   */
  imageUrl?: string;

  /**
   * Display configuration for this event.
   * Merged from group defaults and per-event overrides.
   */
  config: TimelineEventConfig;

  /**
   * Index of the parent group in the groups array.
   */
  groupIndex: number;

  /**
   * Current expansion state.
   */
  isExpanded: boolean;
}

// ============================================================================
// TIME SEGMENT
// ============================================================================

/**
 * Represents a collapsible time segment (e.g., "December 2025").
 * Contains a collection of events within the time period.
 */
export interface TimelineSegment {
  /**
   * Human-readable label for the segment.
   * @example "December 2025", "Week of Nov 25", "Q4 2025"
   */
  label: string;

  /**
   * Start date of this segment (inclusive).
   */
  startDate: Date;

  /**
   * End date of this segment (exclusive).
   */
  endDate: Date;

  /**
   * Events within this time segment.
   */
  events: MJTimelineEvent[];

  /**
   * Current expansion state of the segment.
   */
  isExpanded: boolean;

  /**
   * Total count of events (for display when collapsed).
   */
  eventCount: number;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

/**
 * Default card configuration applied when not overridden.
 */
export const DEFAULT_CARD_CONFIG: TimelineCardConfig = {
  showIcon: true,
  showDate: true,
  showSubtitle: true,
  dateFormat: 'MMM d, yyyy',
  imagePosition: 'left',
  imageSize: 'small',
  descriptionMaxLines: 3,
  allowHtmlDescription: false,
  collapsible: true,
  defaultExpanded: false,
  actionsOnHover: false,
  maxWidth: '400px'
};

/**
 * Default virtual scroll configuration.
 */
export const DEFAULT_VIRTUAL_SCROLL_CONFIG: VirtualScrollConfig = {
  enabled: true,
  batchSize: 20,
  loadThreshold: 200,
  showLoadingIndicator: true,
  loadingMessage: 'Loading more events...'
};

/**
 * Default virtual scroll state.
 */
export const DEFAULT_VIRTUAL_SCROLL_STATE: VirtualScrollState = {
  loadedCount: 0,
  hasMore: false,
  isLoading: false,
  scrollOffset: 0
};
