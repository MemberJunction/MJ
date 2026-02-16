/**
 * @fileoverview Event interfaces for the MJ Timeline component.
 *
 * This module defines all event argument interfaces following the BeforeX/AfterX pattern.
 * BeforeX events include a `cancel` property that can be set to `true` to prevent
 * the default behavior. AfterX events include a `success` property indicating completion.
 *
 * @module @memberjunction/ng-timeline/events
 */

import { MJTimelineEvent, TimelineAction, TimelineSegment } from './types';
import { TimelineGroup } from './timeline-group';

// ============================================================================
// BASE EVENT INTERFACES
// ============================================================================

/**
 * Base interface for all "Before" event arguments.
 * Handlers can set `cancel = true` to prevent the default behavior.
 *
 * @example
 * ```typescript
 * onBeforeClick(args: BeforeEventClickArgs) {
 *   if (!this.userHasPermission()) {
 *     args.cancel = true;  // Prevents the click action
 *   }
 * }
 * ```
 */
export interface BeforeEventArgs {
  /**
   * Set to `true` to cancel the default behavior.
   * Default value is `false`.
   */
  cancel: boolean;
}

/**
 * Base interface for all "After" event arguments.
 * Indicates whether the operation completed successfully.
 */
export interface AfterEventArgs {
  /**
   * Whether the operation completed successfully.
   * Will be `false` if an error occurred during the operation.
   */
  success: boolean;

  /**
   * Error message if the operation failed.
   * Only populated when `success` is `false`.
   */
  errorMessage?: string;
}

// ============================================================================
// TIMELINE EVENT INTERACTIONS
// ============================================================================

/**
 * Base interface for event-related arguments.
 * Contains common properties for all timeline event interactions.
 *
 * @typeParam T - The type of the source record (defaults to `any`)
 */
export interface TimelineEventArgs<T = any> {
  /**
   * The timeline event being interacted with.
   */
  event: MJTimelineEvent<T>;

  /**
   * The source group this event belongs to.
   */
  group: TimelineGroup<T>;

  /**
   * Index of this event within the flattened events array.
   */
  index: number;

  /**
   * The original DOM event, if applicable.
   * May be undefined for programmatic triggers.
   */
  domEvent?: Event;
}

// ============================================================================
// CLICK EVENTS
// ============================================================================

/**
 * Arguments for the `beforeEventClick` event.
 * Emitted before a timeline event card is clicked.
 *
 * @typeParam T - The type of the source record
 *
 * @example
 * ```typescript
 * onBeforeClick(args: BeforeEventClickArgs<MJTaskEntity>) {
 *   // Prevent click on archived items
 *   if (args.event.entity.Status === 'Archived') {
 *     args.cancel = true;
 *     this.showToast('Archived items cannot be opened');
 *   }
 * }
 * ```
 */
export interface BeforeEventClickArgs<T = any>
  extends BeforeEventArgs, TimelineEventArgs<T> {}

/**
 * Arguments for the `afterEventClick` event.
 * Emitted after a timeline event card click is processed.
 *
 * @typeParam T - The type of the source record
 */
export interface AfterEventClickArgs<T = any>
  extends AfterEventArgs, TimelineEventArgs<T> {}

// ============================================================================
// EXPAND EVENTS
// ============================================================================

/**
 * Arguments for the `beforeEventExpand` event.
 * Emitted before a timeline event card is expanded.
 *
 * @typeParam T - The type of the source record
 *
 * @example
 * ```typescript
 * onBeforeExpand(args: BeforeEventExpandArgs<MJTaskEntity>) {
 *   // Require permission to view details
 *   if (!this.canViewDetails(args.event.entity)) {
 *     args.cancel = true;
 *     this.promptLogin();
 *   }
 * }
 * ```
 */
export interface BeforeEventExpandArgs<T = any>
  extends BeforeEventArgs, TimelineEventArgs<T> {}

/**
 * Arguments for the `afterEventExpand` event.
 * Emitted after a timeline event card is expanded.
 *
 * @typeParam T - The type of the source record
 */
export interface AfterEventExpandArgs<T = any>
  extends AfterEventArgs, TimelineEventArgs<T> {}

// ============================================================================
// COLLAPSE EVENTS
// ============================================================================

/**
 * Arguments for the `beforeEventCollapse` event.
 * Emitted before a timeline event card is collapsed.
 *
 * @typeParam T - The type of the source record
 */
export interface BeforeEventCollapseArgs<T = any>
  extends BeforeEventArgs, TimelineEventArgs<T> {}

/**
 * Arguments for the `afterEventCollapse` event.
 * Emitted after a timeline event card is collapsed.
 *
 * @typeParam T - The type of the source record
 */
export interface AfterEventCollapseArgs<T = any>
  extends AfterEventArgs, TimelineEventArgs<T> {}

// ============================================================================
// HOVER EVENTS
// ============================================================================

/**
 * Arguments for the `beforeEventHover` event.
 * Emitted before hover state changes on a timeline event card.
 *
 * @typeParam T - The type of the source record
 *
 * @example
 * ```typescript
 * onBeforeHover(args: BeforeEventHoverArgs<MJTaskEntity>) {
 *   if (args.hoverState === 'enter') {
 *     // Could cancel hover effects
 *     // args.cancel = true;
 *   }
 * }
 * ```
 */
export interface BeforeEventHoverArgs<T = any>
  extends BeforeEventArgs, TimelineEventArgs<T> {
  /**
   * The hover state change type.
   * - `enter`: Mouse entering the card
   * - `leave`: Mouse leaving the card
   */
  hoverState: 'enter' | 'leave';
}

/**
 * Arguments for the `afterEventHover` event.
 * Emitted after hover state changes on a timeline event card.
 *
 * @typeParam T - The type of the source record
 */
export interface AfterEventHoverArgs<T = any>
  extends AfterEventArgs, TimelineEventArgs<T> {
  /**
   * The hover state that was applied.
   */
  hoverState: 'enter' | 'leave';
}

// ============================================================================
// ACTION CLICK EVENTS
// ============================================================================

/**
 * Arguments for the `beforeActionClick` event.
 * Emitted before an action button is clicked.
 *
 * @typeParam T - The type of the source record
 *
 * @example
 * ```typescript
 * onBeforeAction(args: BeforeActionClickArgs<MJTaskEntity>) {
 *   if (args.action.id === 'delete') {
 *     // Show confirmation before allowing delete
 *     if (!this.confirmDelete(args.event.entity)) {
 *       args.cancel = true;
 *     }
 *   }
 * }
 * ```
 */
export interface BeforeActionClickArgs<T = any>
  extends BeforeEventArgs, TimelineEventArgs<T> {
  /**
   * The action that was clicked.
   */
  action: TimelineAction;
}

/**
 * Arguments for the `afterActionClick` event.
 * Emitted after an action button click is processed.
 *
 * @typeParam T - The type of the source record
 *
 * @example
 * ```typescript
 * onAfterAction(args: AfterActionClickArgs<MJTaskEntity>) {
 *   switch (args.action.id) {
 *     case 'view':
 *       this.router.navigate(['/tasks', args.event.entity.ID]);
 *       break;
 *     case 'edit':
 *       this.openEditDialog(args.event.entity);
 *       break;
 *   }
 * }
 * ```
 */
export interface AfterActionClickArgs<T = any>
  extends AfterEventArgs, TimelineEventArgs<T> {
  /**
   * The action that was clicked.
   */
  action: TimelineAction;
}

// ============================================================================
// TIME SEGMENT EVENTS
// ============================================================================

/**
 * Base interface for time segment event arguments.
 */
export interface TimeSegmentEventArgs {
  /**
   * The segment being interacted with.
   */
  segment: TimelineSegment;

  /**
   * The segment's display label.
   */
  label: string;

  /**
   * Start date of the segment.
   */
  startDate: Date;

  /**
   * End date of the segment.
   */
  endDate: Date;

  /**
   * Number of events in the segment.
   */
  eventCount: number;
}

/**
 * Arguments for the `beforeSegmentExpand` event.
 * Emitted before a time segment is expanded.
 *
 * @example
 * ```typescript
 * onBeforeSegmentExpand(args: BeforeSegmentExpandArgs) {
 *   // Could cancel expansion of certain segments
 *   if (args.eventCount > 100) {
 *     args.cancel = true;
 *     this.showToast('Too many events. Please filter first.');
 *   }
 * }
 * ```
 */
export interface BeforeSegmentExpandArgs
  extends BeforeEventArgs, TimeSegmentEventArgs {}

/**
 * Arguments for the `afterSegmentExpand` event.
 * Emitted after a time segment is expanded.
 */
export interface AfterSegmentExpandArgs
  extends AfterEventArgs, TimeSegmentEventArgs {}

/**
 * Arguments for the `beforeSegmentCollapse` event.
 * Emitted before a time segment is collapsed.
 */
export interface BeforeSegmentCollapseArgs
  extends BeforeEventArgs, TimeSegmentEventArgs {}

/**
 * Arguments for the `afterSegmentCollapse` event.
 * Emitted after a time segment is collapsed.
 */
export interface AfterSegmentCollapseArgs
  extends AfterEventArgs, TimeSegmentEventArgs {}

// ============================================================================
// DATA LOADING EVENTS
// ============================================================================

/**
 * Arguments for the `beforeLoad` event.
 * Emitted before data loading begins.
 *
 * @example
 * ```typescript
 * onBeforeLoad(args: BeforeLoadArgs) {
 *   if (this.isOffline) {
 *     args.cancel = true;
 *     this.showOfflineMessage();
 *   }
 * }
 * ```
 */
export interface BeforeLoadArgs extends BeforeEventArgs {
  /**
   * The groups that will be loaded.
   */
  groups: TimelineGroup[];

  /**
   * Whether this is an incremental load (virtual scroll)
   * or a full refresh.
   */
  isIncremental: boolean;

  /**
   * For incremental loads, the current offset.
   */
  offset?: number;

  /**
   * For incremental loads, the batch size.
   */
  batchSize?: number;
}

/**
 * Arguments for the `afterLoad` event.
 * Emitted after data loading completes.
 *
 * @example
 * ```typescript
 * onAfterLoad(args: AfterLoadArgs) {
 *   console.log(`Loaded ${args.totalEvents} events in ${args.loadTimeMs}ms`);
 *   if (args.hasMore) {
 *     console.log('More events available');
 *   }
 * }
 * ```
 */
export interface AfterLoadArgs extends AfterEventArgs {
  /**
   * Total number of events loaded in this operation.
   */
  eventsLoaded: number;

  /**
   * Total number of events now displayed.
   */
  totalEvents: number;

  /**
   * Time taken to load the data (milliseconds).
   */
  loadTimeMs: number;

  /**
   * Whether more events are available to load.
   */
  hasMore: boolean;
}

// ============================================================================
// KEYBOARD NAVIGATION EVENTS
// ============================================================================

/**
 * Arguments for keyboard navigation events.
 *
 * @typeParam T - The type of the source record
 */
export interface KeyboardNavigationArgs<T = any> {
  /**
   * The currently focused event (if any).
   */
  currentEvent?: MJTimelineEvent<T>;

  /**
   * The event that will receive focus (if any).
   */
  targetEvent?: MJTimelineEvent<T>;

  /**
   * The key that was pressed.
   */
  key: string;

  /**
   * The original keyboard event.
   */
  domEvent: KeyboardEvent;
}

/**
 * Arguments for the `beforeKeyboardNavigate` event.
 * Emitted before keyboard navigation moves focus.
 *
 * @typeParam T - The type of the source record
 */
export interface BeforeKeyboardNavigateArgs<T = any>
  extends BeforeEventArgs, KeyboardNavigationArgs<T> {}

/**
 * Arguments for the `afterKeyboardNavigate` event.
 * Emitted after keyboard navigation moves focus.
 *
 * @typeParam T - The type of the source record
 */
export interface AfterKeyboardNavigateArgs<T = any>
  extends AfterEventArgs, KeyboardNavigationArgs<T> {}

// ============================================================================
// SCROLL EVENTS
// ============================================================================

/**
 * Arguments for scroll-related events.
 */
export interface ScrollEventArgs {
  /**
   * Current scroll position (pixels from top).
   */
  scrollTop: number;

  /**
   * Total scrollable height.
   */
  scrollHeight: number;

  /**
   * Visible viewport height.
   */
  clientHeight: number;

  /**
   * Distance from bottom (pixels).
   */
  distanceFromBottom: number;
}

/**
 * Arguments for the `beforeScrollLoadMore` event.
 * Emitted before virtual scroll triggers loading more data.
 */
export interface BeforeScrollLoadMoreArgs
  extends BeforeEventArgs, ScrollEventArgs {}

/**
 * Arguments for the `afterScrollLoadMore` event.
 * Emitted after virtual scroll load completes.
 */
export interface AfterScrollLoadMoreArgs
  extends AfterEventArgs, ScrollEventArgs {
  /**
   * Number of new events loaded.
   */
  eventsLoaded: number;
}

// ============================================================================
// UTILITY TYPE FOR EVENT EMITTER MAP
// ============================================================================

/**
 * Union type of all BeforeX event argument types.
 * Useful for generic event handling.
 */
export type AnyBeforeEventArgs<T = any> =
  | BeforeEventClickArgs<T>
  | BeforeEventExpandArgs<T>
  | BeforeEventCollapseArgs<T>
  | BeforeEventHoverArgs<T>
  | BeforeActionClickArgs<T>
  | BeforeSegmentExpandArgs
  | BeforeSegmentCollapseArgs
  | BeforeLoadArgs
  | BeforeKeyboardNavigateArgs<T>
  | BeforeScrollLoadMoreArgs;

/**
 * Union type of all AfterX event argument types.
 * Useful for generic event handling.
 */
export type AnyAfterEventArgs<T = any> =
  | AfterEventClickArgs<T>
  | AfterEventExpandArgs<T>
  | AfterEventCollapseArgs<T>
  | AfterEventHoverArgs<T>
  | AfterActionClickArgs<T>
  | AfterSegmentExpandArgs
  | AfterSegmentCollapseArgs
  | AfterLoadArgs
  | AfterKeyboardNavigateArgs<T>
  | AfterScrollLoadMoreArgs;
