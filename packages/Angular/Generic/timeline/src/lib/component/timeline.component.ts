/**
 * @fileoverview MJ Timeline Component - A flexible, responsive timeline for Angular.
 *
 * This component displays chronological data in a timeline format with support for:
 * - Multiple data sources (MemberJunction entities or plain objects)
 * - Virtual scrolling for large datasets
 * - Collapsible time segments
 * - Rich event system with BeforeX/AfterX pattern
 * - Full keyboard navigation and accessibility
 * - Responsive design for all screen sizes
 *
 * @module @memberjunction/ng-timeline
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  ContentChild,
  TemplateRef,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  NgZone
} from '@angular/core';

import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';

import {
  TimelineOrientation,
  TimelineLayout,
  TimelineSortOrder,
  TimeSegmentGrouping,
  TimelineCardConfig,
  TimelineEventConfig,
  VirtualScrollConfig,
  VirtualScrollState,
  MJTimelineEvent,
  TimelineSegment,
  TimelineAction,
  TimelineDisplayField,
  DEFAULT_CARD_CONFIG,
  DEFAULT_VIRTUAL_SCROLL_CONFIG,
  DEFAULT_VIRTUAL_SCROLL_STATE
} from '../types';

import { TimelineGroup, getFieldValue } from '../timeline-group';

import {
  BeforeEventClickArgs,
  AfterEventClickArgs,
  BeforeEventExpandArgs,
  AfterEventExpandArgs,
  BeforeEventCollapseArgs,
  AfterEventCollapseArgs,
  BeforeEventHoverArgs,
  AfterEventHoverArgs,
  BeforeActionClickArgs,
  AfterActionClickArgs,
  BeforeSegmentExpandArgs,
  AfterSegmentExpandArgs,
  BeforeSegmentCollapseArgs,
  AfterSegmentCollapseArgs,
  BeforeLoadArgs,
  AfterLoadArgs
} from '../events';

// ============================================================================
// AUTO-ASSIGNED COLORS FOR GROUPS
// ============================================================================

const AUTO_COLORS = [
  '#1976d2', // Blue
  '#388e3c', // Green
  '#f57c00', // Orange
  '#7b1fa2', // Purple
  '#c2185b', // Pink
  '#00796b', // Teal
  '#5d4037', // Brown
  '#455a64', // Blue Grey
  '#d32f2f', // Red
  '#0097a7'  // Cyan
];

const DEFAULT_ICONS = [
  'fa-solid fa-circle',
  'fa-solid fa-square',
  'fa-solid fa-diamond',
  'fa-solid fa-star',
  'fa-solid fa-heart'
];

// ============================================================================
// TIMELINE COMPONENT
// ============================================================================

/**
 * MJ Timeline Component - Displays chronological data in a rich, interactive timeline.
 *
 * The timeline component supports multiple data groups, virtual scrolling for large
 * datasets, collapsible time segments, and a comprehensive event system that allows
 * container components to intercept and modify behavior.
 *
 * @example Basic usage
 * ```html
 * <mj-timeline [groups]="myGroups"></mj-timeline>
 * ```
 *
 * @example Full configuration
 * ```html
 * <mj-timeline
 *   [groups]="groups"
 *   orientation="vertical"
 *   layout="alternating"
 *   sortOrder="desc"
 *   segmentGrouping="month"
 *   [segmentsCollapsible]="true"
 *   [virtualScroll]="{ enabled: true, batchSize: 25 }"
 *   (beforeEventClick)="onBeforeClick($event)"
 *   (afterActionClick)="onAction($event)">
 *
 *   <ng-template #emptyTemplate>
 *     <div class="custom-empty">No events found</div>
 *   </ng-template>
 *
 * </mj-timeline>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-timeline',
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class TimelineComponent<T = any> implements OnInit, OnDestroy, AfterViewInit {
  // ============================================================================
  // INPUTS - DATA
  // ============================================================================

  /**
   * Array of timeline groups to display.
   * Each group defines a data source and display configuration.
   */
  @Input()
  get groups(): TimelineGroup<T>[] {
    return this._groups;
  }
  set groups(value: TimelineGroup<T>[]) {
    const prevGroups = this._groups;
    this._groups = value || [];
    const hasGroups = this._groups.length > 0;

    // Check if groups actually changed (different date field, label, or data)
    const groupsChanged = this.didGroupsChange(prevGroups, this._groups);

    if (this.allowLoad && hasGroups) {
      if (!this._hasLoaded) {
        // First load
        this.refresh();
      } else if (groupsChanged) {
        // Groups changed after initial load - force refresh
        this.refresh(true);
      }
    }
  }
  private _groups: TimelineGroup<T>[] = [];

  /**
   * Check if timeline groups have meaningfully changed
   */
  private didGroupsChange(prev: TimelineGroup<T>[], next: TimelineGroup<T>[]): boolean {
    if (prev.length !== next.length) return true;
    for (let i = 0; i < prev.length; i++) {
      const p = prev[i];
      const n = next[i];
      if (p.DateFieldName !== n.DateFieldName ||
          p.GroupLabel !== n.GroupLabel ||
          p.EntityObjects !== n.EntityObjects) {
        return true;
      }
    }
    return false;
  }

  /**
   * Controls whether data loading is allowed.
   * Set to false to defer loading until ready.
   * @default true
   */
  @Input()
  get allowLoad(): boolean {
    return this._allowLoad;
  }
  set allowLoad(value: boolean) {
    const wasDisabled = !this._allowLoad;
    this._allowLoad = value;
    // When allowLoad becomes true and we have groups, trigger refresh
    if (value && wasDisabled && this._groups.length > 0) {
      this.refresh(this._hasLoaded);
    }
  }
  private _allowLoad = true;

  // ============================================================================
  // INPUTS - LAYOUT (using setters for reactive updates)
  // ============================================================================

  /**
   * Timeline orientation.
   * - `vertical`: Events displayed top-to-bottom
   * - `horizontal`: Events displayed left-to-right
   * @default 'vertical'
   */
  @Input()
  get orientation(): TimelineOrientation {
    return this._orientation;
  }
  set orientation(value: TimelineOrientation) {
    if (this._orientation !== value) {
      this._orientation = value;
      this.cdr.markForCheck();
    }
  }
  private _orientation: TimelineOrientation = 'vertical';

  /**
   * Layout mode for vertical timeline.
   * - `single`: All cards on one side
   * - `alternating`: Cards alternate sides
   * @default 'single'
   */
  @Input()
  get layout(): TimelineLayout {
    return this._layout;
  }
  set layout(value: TimelineLayout) {
    if (this._layout !== value) {
      this._layout = value;
      this.cdr.markForCheck();
    }
  }
  private _layout: TimelineLayout = 'single';

  /**
   * Sort order for events.
   * - `desc`: Newest first
   * - `asc`: Oldest first
   * @default 'desc'
   */
  @Input()
  get sortOrder(): TimelineSortOrder {
    return this._sortOrder;
  }
  set sortOrder(value: TimelineSortOrder) {
    if (this._sortOrder !== value) {
      this._sortOrder = value;
      // Re-process events when sort order changes - force refresh since data already loaded
      if (this._initialized) {
        this.refresh(true);
      }
      this.cdr.markForCheck();
    }
  }
  private _sortOrder: TimelineSortOrder = 'desc';

  /**
   * How to group events into time segments.
   * @default 'month'
   */
  @Input()
  get segmentGrouping(): TimeSegmentGrouping {
    return this._segmentGrouping;
  }
  set segmentGrouping(value: TimeSegmentGrouping) {
    if (this._segmentGrouping !== value) {
      this._segmentGrouping = value;
      // Re-segment events when grouping changes - force refresh since data already loaded
      if (this._initialized) {
        this.refresh(true);
      }
      this.cdr.markForCheck();
    }
  }
  private _segmentGrouping: TimeSegmentGrouping = 'month';

  // ============================================================================
  // INPUTS - CARD DEFAULTS
  // ============================================================================

  /**
   * Default card configuration applied to all groups.
   * Individual groups can override these settings.
   */
  @Input() defaultCardConfig: TimelineCardConfig = { ...DEFAULT_CARD_CONFIG };

  // ============================================================================
  // INPUTS - VIRTUAL SCROLLING
  // ============================================================================

  /**
   * Virtual scrolling configuration.
   */
  @Input() virtualScroll: VirtualScrollConfig = { ...DEFAULT_VIRTUAL_SCROLL_CONFIG };

  // ============================================================================
  // INPUTS - SEGMENTS
  // ============================================================================

  /**
   * Whether time segments can be collapsed.
   * @default true
   */
  @Input() segmentsCollapsible = true;

  /**
   * Whether segments start expanded.
   * @default true
   */
  @Input() segmentsDefaultExpanded = true;

  // ============================================================================
  // INPUTS - EMPTY & LOADING STATES
  // ============================================================================

  /**
   * Message shown when no events exist.
   * @default 'No events to display'
   */
  @Input() emptyMessage = 'No events to display';

  /**
   * Icon shown with empty message.
   * @default 'fa-regular fa-calendar-xmark'
   */
  @Input() emptyIcon = 'fa-regular fa-calendar-xmark';

  /**
   * Message shown while loading.
   * @default 'Loading timeline...'
   */
  @Input() loadingMessage = 'Loading timeline...';

  // ============================================================================
  // INPUTS - ACCESSIBILITY
  // ============================================================================

  /**
   * ARIA label for the timeline container.
   * @default 'Timeline'
   */
  @Input() ariaLabel = 'Timeline';

  /**
   * Enable keyboard navigation.
   * @default true
   */
  @Input() enableKeyboardNavigation = true;

  /**
   * ID of the currently selected event.
   * When set, the corresponding event will be highlighted with the focused style.
   */
  @Input()
  get selectedEventId(): string | null {
    return this._selectedEventId;
  }
  set selectedEventId(value: string | null) {
    const changed = this._selectedEventId !== value;
    this._selectedEventId = value;
    if (changed) {
      this.cdr.markForCheck();
    }
  }
  private _selectedEventId: string | null = null;

  // ============================================================================
  // OUTPUTS - BEFORE EVENTS (with cancel support)
  // ============================================================================

  /** Emitted before an event card is clicked. Set `cancel = true` to prevent. */
  @Output() beforeEventClick = new EventEmitter<BeforeEventClickArgs<T>>();

  /** Emitted before an event card expands. Set `cancel = true` to prevent. */
  @Output() beforeEventExpand = new EventEmitter<BeforeEventExpandArgs<T>>();

  /** Emitted before an event card collapses. Set `cancel = true` to prevent. */
  @Output() beforeEventCollapse = new EventEmitter<BeforeEventCollapseArgs<T>>();

  /** Emitted before hover state changes. Set `cancel = true` to prevent. */
  @Output() beforeEventHover = new EventEmitter<BeforeEventHoverArgs<T>>();

  /** Emitted before an action button is clicked. Set `cancel = true` to prevent. */
  @Output() beforeActionClick = new EventEmitter<BeforeActionClickArgs<T>>();

  /** Emitted before a time segment expands. Set `cancel = true` to prevent. */
  @Output() beforeSegmentExpand = new EventEmitter<BeforeSegmentExpandArgs>();

  /** Emitted before a time segment collapses. Set `cancel = true` to prevent. */
  @Output() beforeSegmentCollapse = new EventEmitter<BeforeSegmentCollapseArgs>();

  /** Emitted before data loading begins. Set `cancel = true` to prevent. */
  @Output() beforeLoad = new EventEmitter<BeforeLoadArgs>();

  // ============================================================================
  // OUTPUTS - AFTER EVENTS
  // ============================================================================

  /** Emitted after an event card is clicked. */
  @Output() afterEventClick = new EventEmitter<AfterEventClickArgs<T>>();

  /** Emitted after an event card expands. */
  @Output() afterEventExpand = new EventEmitter<AfterEventExpandArgs<T>>();

  /** Emitted after an event card collapses. */
  @Output() afterEventCollapse = new EventEmitter<AfterEventCollapseArgs<T>>();

  /** Emitted after hover state changes. */
  @Output() afterEventHover = new EventEmitter<AfterEventHoverArgs<T>>();

  /** Emitted after an action button is clicked. */
  @Output() afterActionClick = new EventEmitter<AfterActionClickArgs<T>>();

  /** Emitted after a time segment expands. */
  @Output() afterSegmentExpand = new EventEmitter<AfterSegmentExpandArgs>();

  /** Emitted after a time segment collapses. */
  @Output() afterSegmentCollapse = new EventEmitter<AfterSegmentCollapseArgs>();

  /** Emitted after data loading completes. */
  @Output() afterLoad = new EventEmitter<AfterLoadArgs>();

  // ============================================================================
  // CONTENT CHILDREN - OPTIONAL TEMPLATES
  // ============================================================================

  /** Custom template for entire card. Context: { event, group } */
  @ContentChild('cardTemplate') cardTemplate?: TemplateRef<{ event: MJTimelineEvent<T>; group: TimelineGroup<T> }>;

  /** Custom template for card header. Context: { event } */
  @ContentChild('headerTemplate') headerTemplate?: TemplateRef<{ event: MJTimelineEvent<T> }>;

  /** Custom template for card body. Context: { event } */
  @ContentChild('bodyTemplate') bodyTemplate?: TemplateRef<{ event: MJTimelineEvent<T> }>;

  /** Custom template for card actions. Context: { event, actions } */
  @ContentChild('actionsTemplate') actionsTemplate?: TemplateRef<{ event: MJTimelineEvent<T>; actions: TimelineAction[] }>;

  /** Custom template for segment header. Context: { segment } */
  @ContentChild('segmentHeaderTemplate') segmentHeaderTemplate?: TemplateRef<{ segment: TimelineSegment }>;

  /** Custom template for empty state. */
  @ContentChild('emptyTemplate') emptyTemplate?: TemplateRef<void>;

  /** Custom template for loading state. */
  @ContentChild('loadingTemplate') loadingTemplate?: TemplateRef<void>;

  // ============================================================================
  // VIEW CHILDREN
  // ============================================================================

  @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLElement>;

  // ============================================================================
  // PUBLIC PROPERTIES
  // ============================================================================

  /** Current time segments with events. */
  segments: TimelineSegment[] = [];

  /** All flattened events (for non-segmented display). */
  allEvents: MJTimelineEvent<T>[] = [];

  /** Virtual scroll state. */
  scrollState: VirtualScrollState = { ...DEFAULT_VIRTUAL_SCROLL_STATE };

  /** Whether initial load is complete. */
  isInitialized = false;

  /** Whether currently loading data. */
  isLoading = false;

  /** Index of currently focused event (for keyboard navigation). */
  focusedEventIndex = -1;

  // ============================================================================
  // PRIVATE PROPERTIES
  // ============================================================================

  private _initialized = false;
  private _hasLoaded = false;
  private _destroy$ = new Subject<void>();
  private _scroll$ = new Subject<Event>();
  private _intersectionObserver?: IntersectionObserver;

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor(
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef,
    private ngZone: NgZone
  ) {}

  // ============================================================================
  // LIFECYCLE HOOKS
  // ============================================================================

  ngOnInit(): void {
    this._initialized = true;

    // Set up scroll listener for virtual scrolling
    this._scroll$
      .pipe(
        debounceTime(100),
        takeUntil(this._destroy$)
      )
      .subscribe(() => this.onScrollCheck());
  }

  ngAfterViewInit(): void {
    if (this.allowLoad && !this._hasLoaded) {
      this.refresh();
    }

    // Set up intersection observer for virtual scroll trigger
    this.setupIntersectionObserver();
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();

    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect();
    }
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Refreshes all data from the configured groups.
   * Clears existing data and reloads from sources.
   */
  async refresh(force: boolean = false): Promise<void> {
    // Prevent concurrent refresh calls - if already refreshing, exit immediately
    if (this.isLoading || (this._hasLoaded && !force)) {
      return;
    }

    const startTime = Date.now();

    // Emit before event
    const beforeArgs: BeforeLoadArgs = {
      cancel: false,
      groups: this._groups,
      isIncremental: false
    };
    this.beforeLoad.emit(beforeArgs);

    if (beforeArgs.cancel) {
      return;
    }

    this.isLoading = true;
    this.cdr.markForCheck();

    try {
      // Clear existing data
      this.allEvents = [];
      this.segments = [];
      this.scrollState = { ...DEFAULT_VIRTUAL_SCROLL_STATE };

      // Load data from all groups
      await this.loadAllGroups();

      // Group into segments
      this.buildSegments();

      this._hasLoaded = true;
      this.isInitialized = true;

      // Emit after event
      const afterArgs: AfterLoadArgs = {
        success: true,
        eventsLoaded: this.allEvents.length,
        totalEvents: this.allEvents.length,
        loadTimeMs: Date.now() - startTime,
        hasMore: this.scrollState.hasMore
      };
      this.afterLoad.emit(afterArgs);
    } catch (error) {
      console.error('Timeline: Error loading data', error);

      const afterArgs: AfterLoadArgs = {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        eventsLoaded: 0,
        totalEvents: 0,
        loadTimeMs: Date.now() - startTime,
        hasMore: false
      };
      this.afterLoad.emit(afterArgs);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Loads more events (for virtual scrolling).
   */
  async loadMore(): Promise<void> {
    if (!this.virtualScroll.enabled || this.scrollState.isLoading || !this.scrollState.hasMore) {
      return;
    }

    const startTime = Date.now();

    // Emit before event
    const beforeArgs: BeforeLoadArgs = {
      cancel: false,
      groups: this._groups,
      isIncremental: true,
      offset: this.scrollState.loadedCount,
      batchSize: this.virtualScroll.batchSize
    };
    this.beforeLoad.emit(beforeArgs);

    if (beforeArgs.cancel) {
      return;
    }

    this.scrollState.isLoading = true;
    this.cdr.markForCheck();

    try {
      const previousCount = this.allEvents.length;

      // Load next batch from all groups
      await this.loadNextBatch();

      // Rebuild segments with new data
      this.buildSegments();

      const newCount = this.allEvents.length - previousCount;

      // Emit after event
      const afterArgs: AfterLoadArgs = {
        success: true,
        eventsLoaded: newCount,
        totalEvents: this.allEvents.length,
        loadTimeMs: Date.now() - startTime,
        hasMore: this.scrollState.hasMore
      };
      this.afterLoad.emit(afterArgs);
    } catch (error) {
      console.error('Timeline: Error loading more data', error);
    } finally {
      this.scrollState.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Expands all event cards.
   */
  expandAllEvents(): void {
    for (const event of this.allEvents) {
      if (!event.isExpanded) {
        this.setEventExpanded(event, true);
      }
    }
    this.cdr.markForCheck();
  }

  /**
   * Collapses all event cards.
   */
  collapseAllEvents(): void {
    for (const event of this.allEvents) {
      if (event.isExpanded) {
        this.setEventExpanded(event, false);
      }
    }
    this.cdr.markForCheck();
  }

  /**
   * Expands all time segments.
   */
  expandAllSegments(): void {
    for (const segment of this.segments) {
      if (!segment.isExpanded) {
        this.setSegmentExpanded(segment, true);
      }
    }
    this.cdr.markForCheck();
  }

  /**
   * Collapses all time segments.
   */
  collapseAllSegments(): void {
    for (const segment of this.segments) {
      if (segment.isExpanded) {
        this.setSegmentExpanded(segment, false);
      }
    }
    this.cdr.markForCheck();
  }

  /**
   * Expands a specific event by ID.
   */
  expandEvent(eventId: string): void {
    const event = this.getEvent(eventId);
    if (event && !event.isExpanded) {
      this.setEventExpanded(event, true);
      this.cdr.markForCheck();
    }
  }

  /**
   * Collapses a specific event by ID.
   */
  collapseEvent(eventId: string): void {
    const event = this.getEvent(eventId);
    if (event && event.isExpanded) {
      this.setEventExpanded(event, false);
      this.cdr.markForCheck();
    }
  }

  /**
   * Scrolls to a specific event.
   */
  scrollToEvent(eventId: string, behavior: ScrollBehavior = 'smooth'): void {
    const element = this.elementRef.nativeElement.querySelector(`[data-event-id="${eventId}"]`);
    if (element) {
      element.scrollIntoView({ behavior, block: 'center' });
    }
  }

  /**
   * Scrolls to a specific date.
   */
  scrollToDate(date: Date, behavior: ScrollBehavior = 'smooth'): void {
    // Find the segment containing this date
    const segment = this.segments.find(s =>
      date >= s.startDate && date < s.endDate
    );

    if (segment) {
      const element = this.elementRef.nativeElement.querySelector(
        `[data-segment-label="${segment.label}"]`
      );
      if (element) {
        element.scrollIntoView({ behavior, block: 'start' });
      }
    }
  }

  /**
   * Gets an event by ID.
   */
  getEvent(eventId: string): MJTimelineEvent<T> | undefined {
    return this.allEvents.find(e => e.id === eventId);
  }

  /**
   * Gets all events (flattened).
   */
  getAllEvents(): MJTimelineEvent<T>[] {
    return [...this.allEvents];
  }

  // ============================================================================
  // EVENT HANDLERS (Template bindings)
  // ============================================================================

  /**
   * Handles click on an event card.
   */
  onEventClick(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    const group = this._groups[event.groupIndex];

    // Emit before event
    const beforeArgs: BeforeEventClickArgs<T> = {
      cancel: false,
      event,
      group,
      index,
      domEvent
    };
    this.beforeEventClick.emit(beforeArgs);

    if (beforeArgs.cancel) {
      return;
    }

    // Default behavior: toggle expand/collapse if collapsible
    const cardConfig = this.getEffectiveCardConfig(event);
    if (cardConfig.collapsible) {
      this.toggleEventExpanded(event, index, domEvent);
    }

    // Emit after event
    const afterArgs: AfterEventClickArgs<T> = {
      success: true,
      event,
      group,
      index,
      domEvent
    };
    this.afterEventClick.emit(afterArgs);
  }

  /**
   * Handles expand/collapse toggle on an event.
   */
  onToggleExpand(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    domEvent.stopPropagation();
    this.toggleEventExpanded(event, index, domEvent);
  }

  /**
   * Handles mouse enter on an event card.
   */
  onEventMouseEnter(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    const group = this._groups[event.groupIndex];

    const beforeArgs: BeforeEventHoverArgs<T> = {
      cancel: false,
      event,
      group,
      index,
      domEvent,
      hoverState: 'enter'
    };
    this.beforeEventHover.emit(beforeArgs);

    if (!beforeArgs.cancel) {
      const afterArgs: AfterEventHoverArgs<T> = {
        success: true,
        event,
        group,
        index,
        domEvent,
        hoverState: 'enter'
      };
      this.afterEventHover.emit(afterArgs);
    }
  }

  /**
   * Handles mouse leave on an event card.
   */
  onEventMouseLeave(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    const group = this._groups[event.groupIndex];

    const beforeArgs: BeforeEventHoverArgs<T> = {
      cancel: false,
      event,
      group,
      index,
      domEvent,
      hoverState: 'leave'
    };
    this.beforeEventHover.emit(beforeArgs);

    if (!beforeArgs.cancel) {
      const afterArgs: AfterEventHoverArgs<T> = {
        success: true,
        event,
        group,
        index,
        domEvent,
        hoverState: 'leave'
      };
      this.afterEventHover.emit(afterArgs);
    }
  }

  /**
   * Handles action button click.
   */
  onActionClick(event: MJTimelineEvent<T>, action: TimelineAction, index: number, domEvent: Event): void {
    domEvent.stopPropagation();

    if (action.disabled) {
      return;
    }

    const group = this._groups[event.groupIndex];

    const beforeArgs: BeforeActionClickArgs<T> = {
      cancel: false,
      event,
      group,
      index,
      domEvent,
      action
    };
    this.beforeActionClick.emit(beforeArgs);

    if (!beforeArgs.cancel) {
      const afterArgs: AfterActionClickArgs<T> = {
        success: true,
        event,
        group,
        index,
        domEvent,
        action
      };
      this.afterActionClick.emit(afterArgs);
    }
  }

  /**
   * Handles segment header click.
   */
  onSegmentClick(segment: TimelineSegment): void {
    if (!this.segmentsCollapsible) {
      return;
    }

    if (segment.isExpanded) {
      this.collapseSegment(segment);
    } else {
      this.expandSegment(segment);
    }
  }

  /**
   * Handles scroll events for virtual scrolling.
   */
  onScroll(event: Event): void {
    this._scroll$.next(event);
  }

  /**
   * Handles keyboard navigation.
   */
  onKeyDown(event: KeyboardEvent): void {
    if (!this.enableKeyboardNavigation) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        this.focusNextEvent();
        break;

      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        this.focusPreviousEvent();
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        this.activateFocusedEvent();
        break;

      case 'Escape':
        event.preventDefault();
        this.collapseFocusedEvent();
        break;

      case 'Home':
        event.preventDefault();
        this.focusFirstEvent();
        break;

      case 'End':
        event.preventDefault();
        this.focusLastEvent();
        break;
    }
  }

  // ============================================================================
  // TEMPLATE HELPERS
  // ============================================================================

  /**
   * Gets the effective card config for an event.
   */
  getEffectiveCardConfig(event: MJTimelineEvent<T>): TimelineCardConfig {
    const group = this._groups[event.groupIndex];
    return {
      ...this.defaultCardConfig,
      ...group?.CardConfig,
      ...this.mapEventConfigToCardConfig(event.config)
    };
  }

  /**
   * Gets the color for a group/event.
   */
  getColor(event: MJTimelineEvent<T>): string {
    if (event.config?.color) {
      return event.config.color;
    }

    const group = this._groups[event.groupIndex];
    if (group?.DisplayColorMode === 'manual' && group.DisplayColor) {
      return group.DisplayColor;
    }

    return AUTO_COLORS[event.groupIndex % AUTO_COLORS.length];
  }

  /**
   * Gets the icon for a group/event.
   */
  getIcon(event: MJTimelineEvent<T>): string {
    if (event.config?.icon) {
      return event.config.icon;
    }

    const group = this._groups[event.groupIndex];
    if (group?.DisplayIconMode === 'custom' && group.DisplayIcon) {
      return group.DisplayIcon;
    }

    return DEFAULT_ICONS[event.groupIndex % DEFAULT_ICONS.length];
  }

  /**
   * Gets the actions for an event.
   */
  getActions(event: MJTimelineEvent<T>): TimelineAction[] {
    if (event.config?.actions) {
      return event.config.actions;
    }

    const cardConfig = this.getEffectiveCardConfig(event);
    return cardConfig.actions || [];
  }

  /**
   * Formats a date for display.
   */
  formatDate(date: Date, format?: string): string {
    const fmt = format || this.defaultCardConfig.dateFormat || 'MMM d, yyyy';
    return this.formatDateInternal(date, fmt);
  }

  /**
   * Gets the value of a display field from an event.
   */
  getFieldValue(event: MJTimelineEvent<T>, field: TimelineDisplayField): string {
    const value = getFieldValue(event.entity, field.fieldName);

    if (field.formatter) {
      return field.formatter(value);
    }

    if (value == null) {
      return '';
    }

    if (field.format && value instanceof Date) {
      return this.formatDateInternal(value, field.format);
    }

    return String(value);
  }

  /**
   * Track by function for ngFor.
   */
  trackByEventId(_index: number, event: MJTimelineEvent<T>): string {
    return event.id;
  }

  /**
   * Track by function for segments.
   */
  trackBySegmentLabel(_index: number, segment: TimelineSegment): string {
    return segment.label;
  }

  /**
   * Gets the global index of an event in the allEvents array.
   */
  getGlobalIndex(event: MJTimelineEvent<T>): number {
    return this.allEvents.indexOf(event);
  }

  /**
   * Checks if an event is currently selected/focused.
   * An event is selected if either:
   * - Its ID matches the selectedEventId input
   * - Its global index matches the focusedEventIndex (keyboard navigation)
   */
  isEventSelected(event: MJTimelineEvent<T>, globalIndex: number): boolean {
    // Check selectedEventId from parent first (takes priority)
    if (this.selectedEventId && event.id === this.selectedEventId) {
      return true;
    }
    // Fall back to keyboard navigation focus
    return this.focusedEventIndex === globalIndex;
  }

  // ============================================================================
  // PRIVATE METHODS - DATA LOADING
  // ============================================================================

  /**
   * Loads data from all groups.
   */
  private async loadAllGroups(): Promise<void> {
    for (let groupIndex = 0; groupIndex < this._groups.length; groupIndex++) {
      const group = this._groups[groupIndex];
      await this.loadGroup(group, groupIndex);
    }

    // Sort all events by date
    this.sortEvents();

    // Update scroll state
    this.scrollState.loadedCount = this.allEvents.length;
    this.scrollState.hasMore = false; // TODO: Implement proper pagination detection
  }

  /**
   * Loads data from a single group.
   */
  private async loadGroup(group: TimelineGroup<T>, groupIndex: number): Promise<void> {
    let records: T[] = [];

    if (group.DataSourceType === 'array') {
      records = group.EntityObjects || [];
    } else if (group.DataSourceType === 'entity' && group.EntityName) {
      records = await this.loadFromEntity(group);
    }

    // Convert records to timeline events
    for (const record of records) {
      const event = this.createTimelineEvent(record, group, groupIndex);
      this.allEvents.push(event);
    }
  }

  /**
   * Loads data from MemberJunction entity.
   */
  private async loadFromEntity(group: TimelineGroup<T>): Promise<T[]> {
    try {
      const { RunView } = await import('@memberjunction/core');
      const rv = new RunView();

      const result = await rv.RunView({
        EntityName: group.EntityName,
        ExtraFilter: group.Filter,
        OrderBy: group.OrderBy,
        MaxRows: group.MaxRecords,
        ResultType: 'entity_object'
      });

      if (result?.Success) {
        return result.Results as T[];
      }
    } catch (error) {
      console.warn('Timeline: Could not load from entity. Is @memberjunction/core available?', error);
    }

    return [];
  }

  /**
   * Loads the next batch for virtual scrolling.
   */
  private async loadNextBatch(): Promise<void> {
    // TODO: Implement proper batch loading with offset/limit
    // For now, this is a placeholder
  }

  /**
   * Creates a timeline event from a source record.
   */
  private createTimelineEvent(record: T, group: TimelineGroup<T>, groupIndex: number): MJTimelineEvent<T> {
    const cardConfig = group.getEffectiveCardConfig();

    return {
      id: group.getId(record),
      entity: record,
      title: group.getTitle(record),
      date: group.getDate(record),
      subtitle: group.getSubtitle(record),
      description: group.getDescription(record),
      imageUrl: group.getImageUrl(record),
      config: group.getEventConfig(record),
      groupIndex,
      isExpanded: cardConfig.defaultExpanded ?? false
    };
  }

  /**
   * Sorts events by date according to sortOrder.
   */
  private sortEvents(): void {
    this.allEvents.sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();
      return this.sortOrder === 'asc' ? diff : -diff;
    });
  }

  // ============================================================================
  // PRIVATE METHODS - SEGMENTATION
  // ============================================================================

  /**
   * Builds time segments from events.
   */
  private buildSegments(): void {
    if (this.segmentGrouping === 'none') {
      this.segments = [];
      return;
    }

    const segmentMap = new Map<string, TimelineSegment>();

    for (const event of this.allEvents) {
      const { label, startDate, endDate } = this.getSegmentInfo(event.date);

      if (!segmentMap.has(label)) {
        segmentMap.set(label, {
          label,
          startDate,
          endDate,
          events: [],
          isExpanded: this.segmentsDefaultExpanded,
          eventCount: 0
        });
      }

      const segment = segmentMap.get(label)!;
      segment.events.push(event);
      segment.eventCount++;
    }

    // Convert to array and sort
    this.segments = Array.from(segmentMap.values());
    this.segments.sort((a, b) => {
      const diff = a.startDate.getTime() - b.startDate.getTime();
      return this.sortOrder === 'asc' ? diff : -diff;
    });
  }

  /**
   * Gets segment information for a date.
   */
  private getSegmentInfo(date: Date): { label: string; startDate: Date; endDate: Date } {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    switch (this.segmentGrouping) {
      case 'day':
        return {
          label: this.formatDateInternal(date, 'MMMM d, yyyy'),
          startDate: new Date(year, month, day),
          endDate: new Date(year, month, day + 1)
        };

      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(day - date.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        return {
          label: `Week of ${this.formatDateInternal(weekStart, 'MMM d, yyyy')}`,
          startDate: weekStart,
          endDate: weekEnd
        };

      case 'month':
        return {
          label: this.formatDateInternal(new Date(year, month, 1), 'MMMM yyyy'),
          startDate: new Date(year, month, 1),
          endDate: new Date(year, month + 1, 1)
        };

      case 'quarter':
        const quarter = Math.floor(month / 3);
        return {
          label: `Q${quarter + 1} ${year}`,
          startDate: new Date(year, quarter * 3, 1),
          endDate: new Date(year, (quarter + 1) * 3, 1)
        };

      case 'year':
        return {
          label: String(year),
          startDate: new Date(year, 0, 1),
          endDate: new Date(year + 1, 0, 1)
        };

      default:
        return {
          label: this.formatDateInternal(date, 'MMMM yyyy'),
          startDate: new Date(year, month, 1),
          endDate: new Date(year, month + 1, 1)
        };
    }
  }

  // ============================================================================
  // PRIVATE METHODS - EXPAND/COLLAPSE
  // ============================================================================

  /**
   * Toggles event expanded state.
   */
  private toggleEventExpanded(event: MJTimelineEvent<T>, index: number, domEvent?: Event): void {
    if (event.isExpanded) {
      this.collapseEventInternal(event, index, domEvent);
    } else {
      this.expandEventInternal(event, index, domEvent);
    }
  }

  /**
   * Sets event expanded state.
   */
  private setEventExpanded(event: MJTimelineEvent<T>, expanded: boolean): void {
    event.isExpanded = expanded;
  }

  /**
   * Expands an event with events.
   */
  private expandEventInternal(event: MJTimelineEvent<T>, index: number, domEvent?: Event): void {
    const group = this._groups[event.groupIndex];

    const beforeArgs: BeforeEventExpandArgs<T> = {
      cancel: false,
      event,
      group,
      index,
      domEvent
    };
    this.beforeEventExpand.emit(beforeArgs);

    if (beforeArgs.cancel) {
      return;
    }

    event.isExpanded = true;
    this.cdr.markForCheck();

    const afterArgs: AfterEventExpandArgs<T> = {
      success: true,
      event,
      group,
      index,
      domEvent
    };
    this.afterEventExpand.emit(afterArgs);
  }

  /**
   * Collapses an event with events.
   */
  private collapseEventInternal(event: MJTimelineEvent<T>, index: number, domEvent?: Event): void {
    const group = this._groups[event.groupIndex];

    const beforeArgs: BeforeEventCollapseArgs<T> = {
      cancel: false,
      event,
      group,
      index,
      domEvent
    };
    this.beforeEventCollapse.emit(beforeArgs);

    if (beforeArgs.cancel) {
      return;
    }

    event.isExpanded = false;
    this.cdr.markForCheck();

    const afterArgs: AfterEventCollapseArgs<T> = {
      success: true,
      event,
      group,
      index,
      domEvent
    };
    this.afterEventCollapse.emit(afterArgs);
  }

  /**
   * Expands a segment.
   */
  private expandSegment(segment: TimelineSegment): void {
    const beforeArgs: BeforeSegmentExpandArgs = {
      cancel: false,
      segment,
      label: segment.label,
      startDate: segment.startDate,
      endDate: segment.endDate,
      eventCount: segment.eventCount
    };
    this.beforeSegmentExpand.emit(beforeArgs);

    if (beforeArgs.cancel) {
      return;
    }

    segment.isExpanded = true;
    this.cdr.markForCheck();

    const afterArgs: AfterSegmentExpandArgs = {
      success: true,
      segment,
      label: segment.label,
      startDate: segment.startDate,
      endDate: segment.endDate,
      eventCount: segment.eventCount
    };
    this.afterSegmentExpand.emit(afterArgs);
  }

  /**
   * Collapses a segment.
   */
  private collapseSegment(segment: TimelineSegment): void {
    const beforeArgs: BeforeSegmentCollapseArgs = {
      cancel: false,
      segment,
      label: segment.label,
      startDate: segment.startDate,
      endDate: segment.endDate,
      eventCount: segment.eventCount
    };
    this.beforeSegmentCollapse.emit(beforeArgs);

    if (beforeArgs.cancel) {
      return;
    }

    segment.isExpanded = false;
    this.cdr.markForCheck();

    const afterArgs: AfterSegmentCollapseArgs = {
      success: true,
      segment,
      label: segment.label,
      startDate: segment.startDate,
      endDate: segment.endDate,
      eventCount: segment.eventCount
    };
    this.afterSegmentCollapse.emit(afterArgs);
  }

  /**
   * Sets segment expanded state without events.
   */
  private setSegmentExpanded(segment: TimelineSegment, expanded: boolean): void {
    segment.isExpanded = expanded;
  }

  // ============================================================================
  // PRIVATE METHODS - KEYBOARD NAVIGATION
  // ============================================================================

  private focusNextEvent(): void {
    if (this.allEvents.length === 0) return;

    this.focusedEventIndex = Math.min(
      this.focusedEventIndex + 1,
      this.allEvents.length - 1
    );
    this.scrollToFocusedEvent();
  }

  private focusPreviousEvent(): void {
    if (this.allEvents.length === 0) return;

    this.focusedEventIndex = Math.max(this.focusedEventIndex - 1, 0);
    this.scrollToFocusedEvent();
  }

  private focusFirstEvent(): void {
    if (this.allEvents.length === 0) return;

    this.focusedEventIndex = 0;
    this.scrollToFocusedEvent();
  }

  private focusLastEvent(): void {
    if (this.allEvents.length === 0) return;

    this.focusedEventIndex = this.allEvents.length - 1;
    this.scrollToFocusedEvent();
  }

  private activateFocusedEvent(): void {
    if (this.focusedEventIndex >= 0 && this.focusedEventIndex < this.allEvents.length) {
      const event = this.allEvents[this.focusedEventIndex];
      this.toggleEventExpanded(event, this.focusedEventIndex);
    }
  }

  private collapseFocusedEvent(): void {
    if (this.focusedEventIndex >= 0 && this.focusedEventIndex < this.allEvents.length) {
      const event = this.allEvents[this.focusedEventIndex];
      if (event.isExpanded) {
        this.collapseEventInternal(event, this.focusedEventIndex);
      }
    }
  }

  private scrollToFocusedEvent(): void {
    if (this.focusedEventIndex >= 0 && this.focusedEventIndex < this.allEvents.length) {
      const event = this.allEvents[this.focusedEventIndex];
      this.scrollToEvent(event.id, 'smooth');
    }
    this.cdr.markForCheck();
  }

  // ============================================================================
  // PRIVATE METHODS - VIRTUAL SCROLLING
  // ============================================================================

  private setupIntersectionObserver(): void {
    if (!this.virtualScroll.enabled) return;

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      const sentinel = this.elementRef.nativeElement.querySelector('.mj-timeline-scroll-sentinel');
      if (!sentinel) return;

      this._intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting && !this.scrollState.isLoading && this.scrollState.hasMore) {
            this.ngZone.run(() => this.loadMore());
          }
        },
        {
          root: this.scrollContainer?.nativeElement,
          threshold: 0,
          rootMargin: `${this.virtualScroll.loadThreshold}px`
        }
      );

      this._intersectionObserver.observe(sentinel);
    });
  }

  private onScrollCheck(): void {
    if (!this.scrollContainer?.nativeElement || !this.virtualScroll.enabled) {
      return;
    }

    const el = this.scrollContainer.nativeElement;
    this.scrollState.scrollOffset = el.scrollTop;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < this.virtualScroll.loadThreshold && this.scrollState.hasMore) {
      this.loadMore();
    }
  }

  // ============================================================================
  // PRIVATE METHODS - UTILITIES
  // ============================================================================

  /**
   * Maps event config to card config properties.
   */
  private mapEventConfigToCardConfig(config: TimelineEventConfig = {}): Partial<TimelineCardConfig> {
    return {
      collapsible: config.collapsible,
      defaultExpanded: config.defaultExpanded,
      actions: config.actions
    };
  }

  /**
   * Simple date formatter (replaces Angular DatePipe for standalone use).
   * Uses placeholder tokens to avoid replacement conflicts.
   */
  private formatDateInternal(date: Date, format: string): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();

    // Use placeholder tokens to avoid conflicts (e.g., 'May' containing 'M')
    // Replace longer patterns first with placeholders, then substitute values
    let result = format;

    // Replace patterns with unique placeholders first
    result = result.replace(/yyyy/g, '{{YEAR}}');
    result = result.replace(/MMMM/g, '{{MONTH_FULL}}');
    result = result.replace(/MMM/g, '{{MONTH_SHORT}}');
    result = result.replace(/MM/g, '{{MONTH_PAD}}');
    result = result.replace(/dd/g, '{{DAY_PAD}}');
    result = result.replace(/d/g, '{{DAY}}');
    result = result.replace(/HH/g, '{{HOUR_24}}');
    result = result.replace(/hh/g, '{{HOUR_12_PAD}}');
    result = result.replace(/h/g, '{{HOUR_12}}');
    result = result.replace(/mm/g, '{{MIN}}');
    result = result.replace(/a/g, '{{AMPM}}');

    // Now substitute the actual values
    result = result.replace(/\{\{YEAR\}\}/g, String(year));
    result = result.replace(/\{\{MONTH_FULL\}\}/g, months[month]);
    result = result.replace(/\{\{MONTH_SHORT\}\}/g, monthsShort[month]);
    result = result.replace(/\{\{MONTH_PAD\}\}/g, String(month + 1).padStart(2, '0'));
    result = result.replace(/\{\{DAY_PAD\}\}/g, String(day).padStart(2, '0'));
    result = result.replace(/\{\{DAY\}\}/g, String(day));
    result = result.replace(/\{\{HOUR_24\}\}/g, String(hours).padStart(2, '0'));
    result = result.replace(/\{\{HOUR_12_PAD\}\}/g, String(hours % 12 || 12).padStart(2, '0'));
    result = result.replace(/\{\{HOUR_12\}\}/g, String(hours % 12 || 12));
    result = result.replace(/\{\{MIN\}\}/g, String(minutes).padStart(2, '0'));
    result = result.replace(/\{\{AMPM\}\}/g, hours >= 12 ? 'PM' : 'AM');

    return result;
  }
}
