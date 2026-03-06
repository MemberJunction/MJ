/**
 * @fileoverview TimelineGroup class for configuring timeline data sources.
 *
 * The TimelineGroup class defines how data is loaded and displayed in the timeline.
 * It supports both MemberJunction BaseEntity objects and plain JavaScript objects,
 * making it usable in any Angular application.
 *
 * @module @memberjunction/ng-timeline/timeline-group
 */

import {
  TimelineCardConfig,
  TimelineEventConfig,
  DEFAULT_CARD_CONFIG
} from './types';

// ============================================================================
// HELPER FUNCTION - FIELD VALUE ACCESS
// ============================================================================

/**
 * Extracts a field value from a record, supporting both BaseEntity and plain objects.
 *
 * For BaseEntity objects (detected by presence of `.Get()` method), uses the `.Get()` method.
 * For plain JavaScript objects, uses standard bracket notation.
 *
 * @param record - The source record (BaseEntity or plain object)
 * @param fieldName - The name of the field to extract
 * @returns The field value, or undefined if not found
 *
 * @example
 * ```typescript
 * // Works with BaseEntity
 * const entity = await md.GetEntityObject<MJTaskEntity>('Tasks');
 * const name = getFieldValue(entity, 'Name');  // Uses entity.Get('Name')
 *
 * // Works with plain objects
 * const obj = { name: 'My Task', status: 'Open' };
 * const name = getFieldValue(obj, 'name');  // Uses obj['name']
 * ```
 */
export function getFieldValue(record: any, fieldName: string): unknown {
  if (record == null) {
    return undefined;
  }

  // Check if this is a BaseEntity (has .Get() method)
  if (typeof record.Get === 'function') {
    return record.Get(fieldName);
  }

  // Plain object - use bracket notation
  return record[fieldName];
}

/**
 * Extracts an ID from a record, trying common ID field names.
 *
 * @param record - The source record
 * @param idFieldName - Optional explicit ID field name
 * @returns The record ID as a string, or a generated fallback ID
 */
export function getRecordId(record: any, idFieldName?: string): string {
  if (record == null) {
    return `generated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Try explicit field name first
  if (idFieldName) {
    const id = getFieldValue(record, idFieldName);
    if (id != null) {
      return String(id);
    }
  }

  // Try common ID field names
  const commonIdFields = ['ID', 'id', 'Id', '_id', 'uuid', 'UUID'];
  for (const field of commonIdFields) {
    const id = getFieldValue(record, field);
    if (id != null) {
      return String(id);
    }
  }

  // Fallback: generate a unique ID
  return `generated-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// TIMELINE GROUP CLASS
// ============================================================================

/**
 * Configures a data source for the timeline component.
 *
 * TimelineGroup defines how records are loaded, which fields to display,
 * and how they should be styled. Multiple groups can be used to display
 * different types of events on the same timeline.
 *
 * @typeParam T - The type of the source records. Defaults to `any` for maximum
 *                flexibility. MemberJunction users can specify BaseEntity subclasses
 *                for full type safety.
 *
 * @example Basic usage with plain objects
 * ```typescript
 * interface MyEvent {
 *   id: string;
 *   title: string;
 *   eventDate: Date;
 *   description: string;
 * }
 *
 * const group = new TimelineGroup<MyEvent>();
 * group.DataSourceType = 'array';
 * group.EntityObjects = myEventsArray;
 * group.TitleFieldName = 'title';
 * group.DateFieldName = 'eventDate';
 * group.DescriptionFieldName = 'description';
 * ```
 *
 * @example MemberJunction usage with BaseEntity
 * ```typescript
 * import { MJTaskEntity } from '@memberjunction/core-entities';
 *
 * const group = new TimelineGroup<MJTaskEntity>();
 * group.EntityName = 'Tasks';
 * group.DataSourceType = 'entity';
 * group.Filter = "Status = 'Open'";
 * group.TitleFieldName = 'Name';
 * group.DateFieldName = 'DueDate';
 * ```
 *
 * @example With full configuration
 * ```typescript
 * const group = new TimelineGroup<MJTaskEntity>();
 * group.EntityName = 'Tasks';
 * group.TitleFieldName = 'Name';
 * group.DateFieldName = 'CompletedAt';
 * group.SubtitleFieldName = 'Category';
 * group.DescriptionFieldName = 'Description';
 * group.DisplayIcon = 'fa-solid fa-check-circle';
 * group.DisplayColor = '#4caf50';
 * group.GroupLabel = 'Completed Tasks';
 *
 * group.CardConfig = {
 *   collapsible: true,
 *   defaultExpanded: false,
 *   summaryFields: [
 *     { fieldName: 'AssignedTo', label: 'Assignee', icon: 'fa-solid fa-user' },
 *     { fieldName: 'Priority', icon: 'fa-solid fa-flag' }
 *   ],
 *   actions: [
 *     { id: 'view', label: 'View', variant: 'primary' },
 *     { id: 'edit', label: 'Edit', variant: 'secondary' }
 *   ]
 * };
 *
 * group.EventConfigFunction = (task) => ({
 *   icon: task.Priority === 'High' ? 'fa-solid fa-exclamation' : undefined,
 *   color: task.Status === 'Overdue' ? '#f44336' : undefined
 * });
 * ```
 */
export class TimelineGroup<T = any> {
  // ============================================================================
  // DATA SOURCE CONFIGURATION
  // ============================================================================

  /**
   * The MemberJunction entity name for this group.
   * Required when `DataSourceType` is `'entity'`.
   *
   * @example 'Tasks', 'MJ: AI Agents', 'Users'
   */
  EntityName?: string;

  /**
   * How data is provided to the timeline.
   * - `'array'`: Data is provided via the `EntityObjects` array (works with any object type)
   * - `'entity'`: Data is loaded using MemberJunction's RunView (requires MJ core)
   *
   * @default 'entity'
   */
  DataSourceType: 'array' | 'entity' = 'entity';

  /**
   * SQL WHERE clause filter for entity queries.
   * Only used when `DataSourceType` is `'entity'`.
   *
   * @example "Status = 'Open' AND Priority = 'High'"
   */
  Filter?: string;

  /**
   * Pre-loaded data array.
   * Used when `DataSourceType` is `'array'`, or populated after loading when using `'entity'`.
   */
  EntityObjects: T[] = [];

  /**
   * SQL ORDER BY clause for entity queries.
   * Only used when `DataSourceType` is `'entity'`.
   *
   * @example 'CreatedAt DESC', 'Priority ASC, DueDate DESC'
   */
  OrderBy?: string;

  /**
   * Maximum number of records to load per batch.
   * Used for virtual scrolling.
   *
   * @default undefined (uses component's virtualScroll.batchSize)
   */
  MaxRecords?: number;

  // ============================================================================
  // FIELD MAPPINGS
  // ============================================================================

  /**
   * Field name for the event title.
   * This is the primary text displayed on each timeline card.
   *
   * @required
   */
  TitleFieldName!: string;

  /**
   * Field name for the event date.
   * Used for chronological ordering and date display.
   *
   * @required
   */
  DateFieldName!: string;

  /**
   * Field name for the subtitle.
   * Displayed below the title in smaller text.
   */
  SubtitleFieldName?: string;

  /**
   * Field name for the description/body text.
   * Displayed in the card body when expanded.
   */
  DescriptionFieldName?: string;

  /**
   * Field name containing an image URL.
   * When set, displays an image in the card.
   */
  ImageFieldName?: string;

  /**
   * Field name for the unique record ID.
   * Defaults to 'ID' or 'id' if not specified.
   */
  IdFieldName?: string;

  // ============================================================================
  // GROUP-LEVEL DISPLAY
  // ============================================================================

  /**
   * Icon display mode.
   * - `'standard'`: Uses a default icon based on the group index
   * - `'custom'`: Uses the icon specified in `DisplayIcon`
   *
   * @default 'standard'
   */
  DisplayIconMode: 'standard' | 'custom' = 'standard';

  /**
   * Custom icon class (Font Awesome).
   * Only used when `DisplayIconMode` is `'custom'`.
   *
   * @example 'fa-solid fa-check', 'fa-regular fa-calendar'
   */
  DisplayIcon?: string;

  /**
   * Color assignment mode.
   * - `'auto'`: System assigns colors based on group index
   * - `'manual'`: Uses the color specified in `DisplayColor`
   *
   * @default 'auto'
   */
  DisplayColorMode: 'auto' | 'manual' = 'auto';

  /**
   * Custom color for this group's markers and accents.
   * Only used when `DisplayColorMode` is `'manual'`.
   * Any valid CSS color value.
   *
   * @example '#4caf50', 'rgb(66, 135, 245)', 'var(--primary-color)'
   */
  DisplayColor?: string;

  /**
   * Human-readable label for this group.
   * Used in legends, headers, or when distinguishing multiple groups.
   *
   * @example 'Completed Tasks', 'System Events', 'User Activities'
   */
  GroupLabel?: string;

  // ============================================================================
  // CARD CONFIGURATION
  // ============================================================================

  /**
   * Card display configuration for this group.
   * Defines how event cards are rendered.
   * If not set, uses the component's `defaultCardConfig`.
   */
  CardConfig?: TimelineCardConfig;

  // ============================================================================
  // CUSTOM FUNCTIONS
  // ============================================================================

  /**
   * Custom function to generate the event summary/description.
   * Takes precedence over `DescriptionFieldName`.
   *
   * @param record - The source record
   * @returns HTML string or plain text to display
   *
   * @example
   * ```typescript
   * group.SummaryFunction = (task) => {
   *   return `<strong>${task.Status}</strong>: ${task.Description}`;
   * };
   * ```
   */
  SummaryFunction?: (record: T) => string;

  /**
   * Custom function to configure individual events.
   * Allows per-event customization of icons, colors, and actions.
   *
   * @param record - The source record
   * @returns Configuration overrides for this event
   *
   * @example
   * ```typescript
   * group.EventConfigFunction = (task) => ({
   *   icon: task.Priority === 'High' ? 'fa-solid fa-exclamation' : undefined,
   *   color: task.IsOverdue ? '#f44336' : undefined,
   *   actions: task.CanEdit ? [{ id: 'edit', label: 'Edit' }] : []
   * });
   * ```
   */
  EventConfigFunction?: (record: T) => TimelineEventConfig;

  // ============================================================================
  // METHODS
  // ============================================================================

  /**
   * Gets the effective card configuration, merging with defaults.
   *
   * @returns The merged card configuration
   */
  getEffectiveCardConfig(): TimelineCardConfig {
    return {
      ...DEFAULT_CARD_CONFIG,
      ...this.CardConfig
    };
  }

  /**
   * Extracts a field value from a record in this group.
   *
   * @param record - The source record
   * @param fieldName - The field name to extract
   * @returns The field value
   */
  getValue(record: T, fieldName: string): unknown {
    return getFieldValue(record, fieldName);
  }

  /**
   * Gets the ID of a record in this group.
   *
   * @param record - The source record
   * @returns The record ID
   */
  getId(record: T): string {
    return getRecordId(record, this.IdFieldName);
  }

  /**
   * Gets the title from a record.
   *
   * @param record - The source record
   * @returns The title string
   */
  getTitle(record: T): string {
    const value = this.getValue(record, this.TitleFieldName);
    return value != null ? String(value) : '';
  }

  /**
   * Gets the date from a record.
   *
   * @param record - The source record
   * @returns The date object
   */
  getDate(record: T): Date {
    const value = this.getValue(record, this.DateFieldName);
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value);
    }
    return new Date();
  }

  /**
   * Gets the subtitle from a record.
   *
   * @param record - The source record
   * @returns The subtitle string, or undefined
   */
  getSubtitle(record: T): string | undefined {
    if (!this.SubtitleFieldName) {
      return undefined;
    }
    const value = this.getValue(record, this.SubtitleFieldName);
    return value != null ? String(value) : undefined;
  }

  /**
   * Gets the description from a record.
   *
   * @param record - The source record
   * @returns The description string, or undefined
   */
  getDescription(record: T): string | undefined {
    // Use custom summary function if provided
    if (this.SummaryFunction) {
      return this.SummaryFunction(record);
    }

    // Use description field
    if (this.DescriptionFieldName) {
      const value = this.getValue(record, this.DescriptionFieldName);
      return value != null ? String(value) : undefined;
    }

    return undefined;
  }

  /**
   * Gets the image URL from a record.
   *
   * @param record - The source record
   * @returns The image URL, or undefined
   */
  getImageUrl(record: T): string | undefined {
    const fieldName = this.CardConfig?.imageField || this.ImageFieldName;
    if (!fieldName) {
      return undefined;
    }
    const value = this.getValue(record, fieldName);
    return value != null ? String(value) : undefined;
  }

  /**
   * Gets the event configuration for a specific record.
   *
   * @param record - The source record
   * @returns The event configuration (from EventConfigFunction or defaults)
   */
  getEventConfig(record: T): TimelineEventConfig {
    if (this.EventConfigFunction) {
      return this.EventConfigFunction(record);
    }
    return {};
  }

  // ============================================================================
  // STATIC FACTORY METHODS
  // ============================================================================

  /**
   * Creates a TimelineGroup from MemberJunction RunViewParams.
   *
   * This is a convenience method for MemberJunction applications.
   * It loads data immediately and returns a configured group.
   *
   * **Note**: This method requires `@memberjunction/core` to be available.
   * It will throw an error if used in non-MJ applications.
   *
   * @param params - RunView parameters for loading data
   * @returns A configured TimelineGroup with loaded data
   *
   * @example
   * ```typescript
   * const group = await TimelineGroup.FromView<MJTaskEntity>({
   *   EntityName: 'Tasks',
   *   ExtraFilter: "Status = 'Open'",
   *   OrderBy: 'DueDate DESC'
   * });
   * group.TitleFieldName = 'Name';
   * group.DateFieldName = 'DueDate';
   * ```
   */
  public static async FromView<T = any>(params: {
    EntityName?: string;
    ExtraFilter?: string;
    OrderBy?: string;
    MaxRows?: number;
    [key: string]: unknown;
  }): Promise<TimelineGroup<T>> {
    const group = new TimelineGroup<T>();

    try {
      // Dynamically import MJ core to avoid hard dependency
      const { RunView } = await import('@memberjunction/core');

      const rv = new RunView();
      const viewParams = {
        ...params,
        ResultType: 'entity_object' as const
      };

      const result = await rv.RunView(viewParams);

      if (result?.Success) {
        group.EntityName = params.EntityName;
        group.EntityObjects = result.Results as T[];
        group.DataSourceType = 'array'; // Already loaded
        group.Filter = params.ExtraFilter;
        group.OrderBy = params.OrderBy;
      }
    } catch (error) {
      console.warn(
        'TimelineGroup.FromView requires @memberjunction/core. ' +
        'Use DataSourceType="array" with EntityObjects for non-MJ applications.',
        error
      );
    }

    return group;
  }

  /**
   * Creates a TimelineGroup from a plain array of objects.
   *
   * This is a convenience method that sets up the group for array-based data.
   *
   * @param data - Array of objects to display
   * @param config - Configuration for field mappings
   * @returns A configured TimelineGroup
   *
   * @example
   * ```typescript
   * const group = TimelineGroup.FromArray(myEvents, {
   *   titleField: 'name',
   *   dateField: 'eventDate',
   *   descriptionField: 'details'
   * });
   * ```
   */
  public static FromArray<T = any>(
    data: T[],
    config: {
      titleField: string;
      dateField: string;
      subtitleField?: string;
      descriptionField?: string;
      imageField?: string;
      idField?: string;
      groupLabel?: string;
      icon?: string;
      color?: string;
    }
  ): TimelineGroup<T> {
    const group = new TimelineGroup<T>();

    group.DataSourceType = 'array';
    group.EntityObjects = data;
    group.TitleFieldName = config.titleField;
    group.DateFieldName = config.dateField;
    group.SubtitleFieldName = config.subtitleField;
    group.DescriptionFieldName = config.descriptionField;
    group.ImageFieldName = config.imageField;
    group.IdFieldName = config.idField;
    group.GroupLabel = config.groupLabel;

    if (config.icon) {
      group.DisplayIconMode = 'custom';
      group.DisplayIcon = config.icon;
    }

    if (config.color) {
      group.DisplayColorMode = 'manual';
      group.DisplayColor = config.color;
    }

    return group;
  }
}
