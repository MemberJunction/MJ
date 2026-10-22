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
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
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
export class TimelineComponent<T = any> extends BaseAngularComponent implements OnInit, OnDestroy, AfterViewInit {
  // ============================================================================
  // INPUTS - DATA
  // ============================================================================

  /**
   * Array of timeline groups to display.
   * Each group defines a data source and display configuration.
   */
  @Input()
  get Groups(): TimelineGroup<T>[] {
    return this._groups;
  }
  set Groups(value: TimelineGroup<T>[]) {
    const prevGroups = this._groups;
    this._groups = value || [];
    const hasGroups = this._groups.length > 0;

    // Check if groups actually changed (different date field, label, or data)
    const groupsChanged = this.didGroupsChange(prevGroups, this._groups);

    // Defer the FIRST load until the view is ready (ngAfterViewInit). When this component is
    // dynamic-mounted, the host sets `groups` via setInput BEFORE the view initializes; running the
    // first refresh here would render nothing (ViewChildren/DOM not ready) yet still set `_hasLoaded`,
    // so ngAfterViewInit's real refresh would be skipped and the timeline would show "No events"
    // until something forced a re-refresh (e.g. changing the date field). Only refresh from the setter
    // once the view is ready.
    if (this.AllowLoad && hasGroups && this._viewReady) {
      if (!this._hasLoaded) {
        // First load
        this.Refresh();
      } else if (groupsChanged) {
        // Groups changed after initial load - force refresh
        this.Refresh(true);
      }
    }
  }

  /** @deprecated Use {@link Groups}. */
  get groups(): TimelineGroup<T>[] {
    return this.Groups;
  }
  /** @deprecated Use {@link Groups}. */
  @Input() set groups(value: TimelineGroup<T>[]) {
    this.Groups = value;
  }
  private _groups: TimelineGroup<T>[] = [];
  /** True once ngAfterViewInit has run — the view is ready to render refreshed events. */
  private _viewReady = false;

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
  get AllowLoad(): boolean {
    return this._allowLoad;
  }
  set AllowLoad(value: boolean) {
    const wasDisabled = !this._allowLoad;
    this._allowLoad = value;
    // When allowLoad becomes true and we have groups, trigger refresh
    if (value && wasDisabled && this._groups.length > 0) {
      this.Refresh(this._hasLoaded);
    }
  }

  /** @deprecated Use {@link AllowLoad}. */
  get allowLoad(): boolean {
    return this.AllowLoad;
  }
  /** @deprecated Use {@link AllowLoad}. */
  @Input() set allowLoad(value: boolean) {
    this.AllowLoad = value;
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
  get Orientation(): TimelineOrientation {
    return this._orientation;
  }
  set Orientation(value: TimelineOrientation) {
    if (this._orientation !== value) {
      this._orientation = value;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link Orientation}. */
  get orientation(): TimelineOrientation {
    return this.Orientation;
  }
  /** @deprecated Use {@link Orientation}. */
  @Input() set orientation(value: TimelineOrientation) {
    this.Orientation = value;
  }
  private _orientation: TimelineOrientation = 'vertical';

  /**
   * Layout mode for vertical timeline.
   * - `single`: All cards on one side
   * - `alternating`: Cards alternate sides
   * @default 'single'
   */
  @Input()
  get Layout(): TimelineLayout {
    return this._layout;
  }
  set Layout(value: TimelineLayout) {
    if (this._layout !== value) {
      this._layout = value;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link Layout}. */
  get layout(): TimelineLayout {
    return this.Layout;
  }
  /** @deprecated Use {@link Layout}. */
  @Input() set layout(value: TimelineLayout) {
    this.Layout = value;
  }
  private _layout: TimelineLayout = 'single';

  /**
   * Sort order for events.
   * - `desc`: Newest first
   * - `asc`: Oldest first
   * @default 'desc'
   */
  @Input()
  get SortOrder(): TimelineSortOrder {
    return this._sortOrder;
  }
  set SortOrder(value: TimelineSortOrder) {
    if (this._sortOrder !== value) {
      this._sortOrder = value;
      // Re-process events when sort order changes - force refresh since data already loaded
      if (this._initialized) {
        this.Refresh(true);
      }
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link SortOrder}. */
  get sortOrder(): TimelineSortOrder {
    return this.SortOrder;
  }
  /** @deprecated Use {@link SortOrder}. */
  @Input() set sortOrder(value: TimelineSortOrder) {
    this.SortOrder = value;
  }
  private _sortOrder: TimelineSortOrder = 'desc';

  /**
   * How to group events into time segments.
   * @default 'month'
   */
  @Input()
  get SegmentGrouping(): TimeSegmentGrouping {
    return this._segmentGrouping;
  }
  set SegmentGrouping(value: TimeSegmentGrouping) {
    if (this._segmentGrouping !== value) {
      this._segmentGrouping = value;
      // Re-segment events when grouping changes - force refresh since data already loaded
      if (this._initialized) {
        this.Refresh(true);
      }
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link SegmentGrouping}. */
  get segmentGrouping(): TimeSegmentGrouping {
    return this.SegmentGrouping;
  }
  /** @deprecated Use {@link SegmentGrouping}. */
  @Input() set segmentGrouping(value: TimeSegmentGrouping) {
    this.SegmentGrouping = value;
  }
  private _segmentGrouping: TimeSegmentGrouping = 'month';

  // ============================================================================
  // INPUTS - CARD DEFAULTS
  // ============================================================================

  /**
   * Default card configuration applied to all groups.
   * Individual groups can override these settings.
   */
  @Input() DefaultCardConfig: TimelineCardConfig = { ...DEFAULT_CARD_CONFIG };

  /** @deprecated Use {@link DefaultCardConfig}. */
  @Input() set defaultCardConfig(value: TimelineCardConfig) {
    this.DefaultCardConfig = value;
  }
  /** @deprecated Use {@link DefaultCardConfig}. */
  get defaultCardConfig(): TimelineCardConfig {
    return this.DefaultCardConfig;
  }

  // ============================================================================
  // INPUTS - VIRTUAL SCROLLING
  // ============================================================================

  /**
   * Virtual scrolling configuration.
   */
  @Input() VirtualScroll: VirtualScrollConfig = { ...DEFAULT_VIRTUAL_SCROLL_CONFIG };

  /** @deprecated Use {@link VirtualScroll}. */
  @Input() set virtualScroll(value: VirtualScrollConfig) {
    this.VirtualScroll = value;
  }
  /** @deprecated Use {@link VirtualScroll}. */
  get virtualScroll(): VirtualScrollConfig {
    return this.VirtualScroll;
  }

  // ============================================================================
  // INPUTS - SEGMENTS
  // ============================================================================

  /**
   * Whether time segments can be collapsed.
   * @default true
   */
  @Input() segmentsCollapsible = true;  // case-violation-ok-legacy-back-compat: untyped member on a generic class — the alias cannot name its type

  /**
   * Whether segments start expanded.
   * @default true
   */
  @Input() segmentsDefaultExpanded = true;  // case-violation-ok-legacy-back-compat: untyped member on a generic class — the alias cannot name its type

  // ============================================================================
  // INPUTS - EMPTY & LOADING STATES
  // ============================================================================

  /**
   * Message shown when no events exist.
   * @default 'No events to display'
   */
  @Input() emptyMessage = 'No events to display';  // case-violation-ok-legacy-back-compat: untyped member on a generic class — the alias cannot name its type

  /**
   * Icon shown with empty message.
   * @default 'fa-regular fa-calendar-xmark'
   */
  @Input() emptyIcon = 'fa-regular fa-calendar-xmark';  // case-violation-ok-legacy-back-compat: untyped member on a generic class — the alias cannot name its type

  /**
   * Message shown while loading.
   * @default 'Loading timeline...'
   */
  @Input() loadingMessage = 'Loading timeline...';  // case-violation-ok-legacy-back-compat: untyped member on a generic class — the alias cannot name its type

  // ============================================================================
  // INPUTS - ACCESSIBILITY
  // ============================================================================

  /**
   * ARIA label for the timeline container.
   * @default 'Timeline'
   */
  @Input() ariaLabel = 'Timeline';  // case-violation-ok-legacy-back-compat: untyped member on a generic class — the alias cannot name its type

  /**
   * Enable keyboard navigation.
   * @default true
   */
  @Input() enableKeyboardNavigation = true;  // case-violation-ok-legacy-back-compat: untyped member on a generic class — the alias cannot name its type

  /**
   * ID of the currently selected event.
   * When set, the corresponding event will be highlighted with the focused style.
   */
  @Input()
  get SelectedEventId(): string | null {
    return this._selectedEventId;
  }
  set SelectedEventId(value: string | null) {
    const changed = this._selectedEventId !== value;
    this._selectedEventId = value;
    if (changed) {
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link SelectedEventId}. */
  get selectedEventId(): string | null {
    return this.SelectedEventId;
  }
  /** @deprecated Use {@link SelectedEventId}. */
  @Input() set selectedEventId(value: string | null) {
    this.SelectedEventId = value;
  }
  private _selectedEventId: string | null = null;

  // ============================================================================
  // OUTPUTS - BEFORE EVENTS (with cancel support)
  // ============================================================================

  /** Emitted before an event card is clicked. Set `cancel = true` to prevent. */
  @Output() BeforeEventClick = new EventEmitter<BeforeEventClickArgs<T>>();

  /**
   * @deprecated Use {@link BeforeEventClick}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeEventClick) keeps working. Must stay AFTER BeforeEventClick: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeEventClick = this.BeforeEventClick;

  /** Emitted before an event card expands. Set `cancel = true` to prevent. */
  @Output() BeforeEventExpand = new EventEmitter<BeforeEventExpandArgs<T>>();

  /**
   * @deprecated Use {@link BeforeEventExpand}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeEventExpand) keeps working. Must stay AFTER BeforeEventExpand: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeEventExpand = this.BeforeEventExpand;

  /** Emitted before an event card collapses. Set `cancel = true` to prevent. */
  @Output() BeforeEventCollapse = new EventEmitter<BeforeEventCollapseArgs<T>>();

  /**
   * @deprecated Use {@link BeforeEventCollapse}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeEventCollapse) keeps working. Must stay AFTER BeforeEventCollapse: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeEventCollapse = this.BeforeEventCollapse;

  /** Emitted before hover state changes. Set `cancel = true` to prevent. */
  @Output() BeforeEventHover = new EventEmitter<BeforeEventHoverArgs<T>>();

  /**
   * @deprecated Use {@link BeforeEventHover}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeEventHover) keeps working. Must stay AFTER BeforeEventHover: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeEventHover = this.BeforeEventHover;

  /** Emitted before an action button is clicked. Set `cancel = true` to prevent. */
  @Output() BeforeActionClick = new EventEmitter<BeforeActionClickArgs<T>>();

  /**
   * @deprecated Use {@link BeforeActionClick}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeActionClick) keeps working. Must stay AFTER BeforeActionClick: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeActionClick = this.BeforeActionClick;

  /** Emitted before a time segment expands. Set `cancel = true` to prevent. */
  @Output() BeforeSegmentExpand = new EventEmitter<BeforeSegmentExpandArgs>();

  /**
   * @deprecated Use {@link BeforeSegmentExpand}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeSegmentExpand) keeps working. Must stay AFTER BeforeSegmentExpand: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeSegmentExpand = this.BeforeSegmentExpand;

  /** Emitted before a time segment collapses. Set `cancel = true` to prevent. */
  @Output() BeforeSegmentCollapse = new EventEmitter<BeforeSegmentCollapseArgs>();

  /**
   * @deprecated Use {@link BeforeSegmentCollapse}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeSegmentCollapse) keeps working. Must stay AFTER BeforeSegmentCollapse: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeSegmentCollapse = this.BeforeSegmentCollapse;

  /** Emitted before data loading begins. Set `cancel = true` to prevent. */
  @Output() BeforeLoad = new EventEmitter<BeforeLoadArgs>();

  /**
   * @deprecated Use {@link BeforeLoad}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeLoad) keeps working. Must stay AFTER BeforeLoad: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeLoad = this.BeforeLoad;

  // ============================================================================
  // OUTPUTS - AFTER EVENTS
  // ============================================================================

  /** Emitted after an event card is clicked. */
  @Output() AfterEventClick = new EventEmitter<AfterEventClickArgs<T>>();

  /**
   * @deprecated Use {@link AfterEventClick}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterEventClick) keeps working. Must stay AFTER AfterEventClick: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterEventClick = this.AfterEventClick;

  /** Emitted after an event card expands. */
  @Output() AfterEventExpand = new EventEmitter<AfterEventExpandArgs<T>>();

  /**
   * @deprecated Use {@link AfterEventExpand}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterEventExpand) keeps working. Must stay AFTER AfterEventExpand: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterEventExpand = this.AfterEventExpand;

  /** Emitted after an event card collapses. */
  @Output() AfterEventCollapse = new EventEmitter<AfterEventCollapseArgs<T>>();

  /**
   * @deprecated Use {@link AfterEventCollapse}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterEventCollapse) keeps working. Must stay AFTER AfterEventCollapse: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterEventCollapse = this.AfterEventCollapse;

  /** Emitted after hover state changes. */
  @Output() AfterEventHover = new EventEmitter<AfterEventHoverArgs<T>>();

  /**
   * @deprecated Use {@link AfterEventHover}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterEventHover) keeps working. Must stay AFTER AfterEventHover: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterEventHover = this.AfterEventHover;

  /** Emitted after an action button is clicked. */
  @Output() AfterActionClick = new EventEmitter<AfterActionClickArgs<T>>();

  /**
   * @deprecated Use {@link AfterActionClick}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterActionClick) keeps working. Must stay AFTER AfterActionClick: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterActionClick = this.AfterActionClick;

  /** Emitted after a time segment expands. */
  @Output() AfterSegmentExpand = new EventEmitter<AfterSegmentExpandArgs>();

  /**
   * @deprecated Use {@link AfterSegmentExpand}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterSegmentExpand) keeps working. Must stay AFTER AfterSegmentExpand: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterSegmentExpand = this.AfterSegmentExpand;

  /** Emitted after a time segment collapses. */
  @Output() AfterSegmentCollapse = new EventEmitter<AfterSegmentCollapseArgs>();

  /**
   * @deprecated Use {@link AfterSegmentCollapse}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterSegmentCollapse) keeps working. Must stay AFTER AfterSegmentCollapse: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterSegmentCollapse = this.AfterSegmentCollapse;

  /** Emitted after data loading completes. */
  @Output() AfterLoad = new EventEmitter<AfterLoadArgs>();

  /**
   * @deprecated Use {@link AfterLoad}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterLoad) keeps working. Must stay AFTER AfterLoad: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterLoad = this.AfterLoad;

  // ============================================================================
  // CONTENT CHILDREN - OPTIONAL TEMPLATES
  // ============================================================================

  /** Custom template for entire card. Context: { event, group } */
  @ContentChild('cardTemplate') CardTemplate?: TemplateRef<{ event: MJTimelineEvent<T>; group: TimelineGroup<T> }>;

  /** @deprecated Use {@link CardTemplate}. */
  get cardTemplate(): TemplateRef<{ event: MJTimelineEvent<T>; group: TimelineGroup<T> }> | undefined {
    return this.CardTemplate;
  }
  /** @deprecated Use {@link CardTemplate}. */
  set cardTemplate(value: TemplateRef<{ event: MJTimelineEvent<T>; group: TimelineGroup<T> }> | undefined) {
    this.CardTemplate = value;
  }

  /** Custom template for card header. Context: { event } */
  @ContentChild('headerTemplate') HeaderTemplate?: TemplateRef<{ event: MJTimelineEvent<T> }>;

  /** @deprecated Use {@link HeaderTemplate}. */
  get headerTemplate(): TemplateRef<{ event: MJTimelineEvent<T> }> | undefined {
    return this.HeaderTemplate;
  }
  /** @deprecated Use {@link HeaderTemplate}. */
  set headerTemplate(value: TemplateRef<{ event: MJTimelineEvent<T> }> | undefined) {
    this.HeaderTemplate = value;
  }

  /** Custom template for card body. Context: { event } */
  @ContentChild('bodyTemplate') BodyTemplate?: TemplateRef<{ event: MJTimelineEvent<T> }>;

  /** @deprecated Use {@link BodyTemplate}. */
  get bodyTemplate(): TemplateRef<{ event: MJTimelineEvent<T> }> | undefined {
    return this.BodyTemplate;
  }
  /** @deprecated Use {@link BodyTemplate}. */
  set bodyTemplate(value: TemplateRef<{ event: MJTimelineEvent<T> }> | undefined) {
    this.BodyTemplate = value;
  }

  /** Custom template for card actions. Context: { event, actions } */
  @ContentChild('actionsTemplate') ActionsTemplate?: TemplateRef<{ event: MJTimelineEvent<T>; actions: TimelineAction[] }>;

  /** @deprecated Use {@link ActionsTemplate}. */
  get actionsTemplate(): TemplateRef<{ event: MJTimelineEvent<T>; actions: TimelineAction[] }> | undefined {
    return this.ActionsTemplate;
  }
  /** @deprecated Use {@link ActionsTemplate}. */
  set actionsTemplate(value: TemplateRef<{ event: MJTimelineEvent<T>; actions: TimelineAction[] }> | undefined) {
    this.ActionsTemplate = value;
  }

  /** Custom template for segment header. Context: { segment } */
  @ContentChild('segmentHeaderTemplate') SegmentHeaderTemplate?: TemplateRef<{ segment: TimelineSegment }>;

  /** @deprecated Use {@link SegmentHeaderTemplate}. */
  get segmentHeaderTemplate(): TemplateRef<{ segment: TimelineSegment }> | undefined {
    return this.SegmentHeaderTemplate;
  }
  /** @deprecated Use {@link SegmentHeaderTemplate}. */
  set segmentHeaderTemplate(value: TemplateRef<{ segment: TimelineSegment }> | undefined) {
    this.SegmentHeaderTemplate = value;
  }

  /** Custom template for empty state. */
  @ContentChild('emptyTemplate') EmptyTemplate?: TemplateRef<void>;

  /** @deprecated Use {@link EmptyTemplate}. */
  get emptyTemplate(): TemplateRef<void> | undefined {
    return this.EmptyTemplate;
  }
  /** @deprecated Use {@link EmptyTemplate}. */
  set emptyTemplate(value: TemplateRef<void> | undefined) {
    this.EmptyTemplate = value;
  }

  /** Custom template for loading state. */
  @ContentChild('loadingTemplate') LoadingTemplate?: TemplateRef<void>;

  /** @deprecated Use {@link LoadingTemplate}. */
  get loadingTemplate(): TemplateRef<void> | undefined {
    return this.LoadingTemplate;
  }
  /** @deprecated Use {@link LoadingTemplate}. */
  set loadingTemplate(value: TemplateRef<void> | undefined) {
    this.LoadingTemplate = value;
  }

  // ============================================================================
  // VIEW CHILDREN
  // ============================================================================

  @ViewChild('scrollContainer') ScrollContainer?: ElementRef<HTMLElement>;

  /** @deprecated Use {@link ScrollContainer}. */
  get scrollContainer(): ElementRef<HTMLElement> | undefined {
    return this.ScrollContainer;
  }
  /** @deprecated Use {@link ScrollContainer}. */
  set scrollContainer(value: ElementRef<HTMLElement> | undefined) {
    this.ScrollContainer = value;
  }

  // ============================================================================
  // PUBLIC PROPERTIES
  // ============================================================================

  /** Current time segments with events. */
  Segments: TimelineSegment[] = [];

  /** @deprecated Use {@link Segments}. */
  get segments(): TimelineSegment[] {
    return this.Segments;
  }
  /** @deprecated Use {@link Segments}. */
  set segments(value: TimelineSegment[]) {
    this.Segments = value;
  }

  /** All flattened events (for non-segmented display). */
  AllEvents: MJTimelineEvent<T>[] = [];

  /** @deprecated Use {@link AllEvents}. */
  get allEvents(): MJTimelineEvent<T>[] {
    return this.AllEvents;
  }
  /** @deprecated Use {@link AllEvents}. */
  set allEvents(value: MJTimelineEvent<T>[]) {
    this.AllEvents = value;
  }

  /** Virtual scroll state. */
  ScrollState: VirtualScrollState = { ...DEFAULT_VIRTUAL_SCROLL_STATE };

  /** @deprecated Use {@link ScrollState}. */
  get scrollState(): VirtualScrollState {
    return this.ScrollState;
  }
  /** @deprecated Use {@link ScrollState}. */
  set scrollState(value: VirtualScrollState) {
    this.ScrollState = value;
  }

  /** Whether initial load is complete. */
  IsInitialized = false;

  /** @deprecated Use {@link IsInitialized}. */
  get isInitialized() {
    return this.IsInitialized;
  }
  /** @deprecated Use {@link IsInitialized}. */
  set isInitialized(value) {
    this.IsInitialized = value;
  }

  /** Whether currently loading data. */
  isLoading = false;

  /** Index of currently focused event (for keyboard navigation). */
  FocusedEventIndex = -1;

  /** @deprecated Use {@link FocusedEventIndex}. */
  get focusedEventIndex() {
    return this.FocusedEventIndex;
  }
  /** @deprecated Use {@link FocusedEventIndex}. */
  set focusedEventIndex(value) {
    this.FocusedEventIndex = value;
  }

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
  ) {
        super();}

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
    // The view is now ready — first loads triggered by the `groups`/`allowLoad` setters were deferred
    // to here so refreshed events actually render (see the `groups` setter).
    this._viewReady = true;
    if (this.AllowLoad && !this._hasLoaded && this._groups.length > 0) {
      this.Refresh();
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
  async Refresh(force: boolean = false): Promise<void> {
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
    this.BeforeLoad.emit(beforeArgs);

    if (beforeArgs.cancel) {
      return;
    }

    this.isLoading = true;
    this.cdr.markForCheck();

    try {
      // Clear existing data
      this.AllEvents = [];
      this.Segments = [];
      this.ScrollState = { ...DEFAULT_VIRTUAL_SCROLL_STATE };

      // Load data from all groups
      await this.loadAllGroups();

      // Group into segments
      this.buildSegments();

      this._hasLoaded = true;
      this.IsInitialized = true;

      // Emit after event
      const afterArgs: AfterLoadArgs = {
        success: true,
        eventsLoaded: this.AllEvents.length,
        totalEvents: this.AllEvents.length,
        loadTimeMs: Date.now() - startTime,
        hasMore: this.ScrollState.hasMore
      };
      this.AfterLoad.emit(afterArgs);
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
      this.AfterLoad.emit(afterArgs);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link Refresh}. */
  async refresh(force: boolean = false): Promise<void> {
    return this.Refresh(force);
  }

  /**
   * Loads more events (for virtual scrolling).
   */
  async LoadMore(): Promise<void> {
    if (!this.VirtualScroll.enabled || this.ScrollState.isLoading || !this.ScrollState.hasMore) {
      return;
    }

    const startTime = Date.now();

    // Emit before event
    const beforeArgs: BeforeLoadArgs = {
      cancel: false,
      groups: this._groups,
      isIncremental: true,
      offset: this.ScrollState.loadedCount,
      batchSize: this.VirtualScroll.batchSize
    };
    this.BeforeLoad.emit(beforeArgs);

    if (beforeArgs.cancel) {
      return;
    }

    this.ScrollState.isLoading = true;
    this.cdr.markForCheck();

    try {
      const previousCount = this.AllEvents.length;

      // Load next batch from all groups
      await this.loadNextBatch();

      // Rebuild segments with new data
      this.buildSegments();

      const newCount = this.AllEvents.length - previousCount;

      // Emit after event
      const afterArgs: AfterLoadArgs = {
        success: true,
        eventsLoaded: newCount,
        totalEvents: this.AllEvents.length,
        loadTimeMs: Date.now() - startTime,
        hasMore: this.ScrollState.hasMore
      };
      this.AfterLoad.emit(afterArgs);
    } catch (error) {
      console.error('Timeline: Error loading more data', error);
    } finally {
      this.ScrollState.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link LoadMore}. */
  async loadMore(): Promise<void> {
    return this.LoadMore();
  }

  /**
   * Expands all event cards.
   */
  ExpandAllEvents(): void {
    for (const event of this.AllEvents) {
      if (!event.isExpanded) {
        this.setEventExpanded(event, true);
      }
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ExpandAllEvents}. */
  expandAllEvents(): void {
    return this.ExpandAllEvents();
  }

  /**
   * Collapses all event cards.
   */
  CollapseAllEvents(): void {
    for (const event of this.AllEvents) {
      if (event.isExpanded) {
        this.setEventExpanded(event, false);
      }
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link CollapseAllEvents}. */
  collapseAllEvents(): void {
    return this.CollapseAllEvents();
  }

  /**
   * Expands all time segments.
   */
  ExpandAllSegments(): void {
    for (const segment of this.Segments) {
      if (!segment.isExpanded) {
        this.setSegmentExpanded(segment, true);
      }
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link ExpandAllSegments}. */
  expandAllSegments(): void {
    return this.ExpandAllSegments();
  }

  /**
   * Collapses all time segments.
   */
  CollapseAllSegments(): void {
    for (const segment of this.Segments) {
      if (segment.isExpanded) {
        this.setSegmentExpanded(segment, false);
      }
    }
    this.cdr.markForCheck();
  }

  /** @deprecated Use {@link CollapseAllSegments}. */
  collapseAllSegments(): void {
    return this.CollapseAllSegments();
  }

  /**
   * Expands a specific event by ID.
   */
  ExpandEvent(eventId: string): void {
    const event = this.GetEvent(eventId);
    if (event && !event.isExpanded) {
      this.setEventExpanded(event, true);
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link ExpandEvent}. */
  expandEvent(eventId: string): void {
    return this.ExpandEvent(eventId);
  }

  /**
   * Collapses a specific event by ID.
   */
  CollapseEvent(eventId: string): void {
    const event = this.GetEvent(eventId);
    if (event && event.isExpanded) {
      this.setEventExpanded(event, false);
      this.cdr.markForCheck();
    }
  }

  /** @deprecated Use {@link CollapseEvent}. */
  collapseEvent(eventId: string): void {
    return this.CollapseEvent(eventId);
  }

  /**
   * Scrolls to a specific event.
   */
  ScrollToEvent(eventId: string, behavior: ScrollBehavior = 'smooth'): void {
    const element = this.elementRef.nativeElement.querySelector(`[data-event-id="${eventId}"]`);
    if (element) {
      element.scrollIntoView({ behavior, block: 'center' });
    }
  }

  /** @deprecated Use {@link ScrollToEvent}. */
  scrollToEvent(eventId: string, behavior: ScrollBehavior = 'smooth'): void {
    return this.ScrollToEvent(eventId, behavior);
  }

  /**
   * Scrolls to a specific date.
   */
  ScrollToDate(date: Date, behavior: ScrollBehavior = 'smooth'): void {
    // Find the segment containing this date
    const segment = this.Segments.find(s =>
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

  /** @deprecated Use {@link ScrollToDate}. */
  scrollToDate(date: Date, behavior: ScrollBehavior = 'smooth'): void {
    return this.ScrollToDate(date, behavior);
  }

  /**
   * Gets an event by ID.
   */
  GetEvent(eventId: string): MJTimelineEvent<T> | undefined {
    return this.AllEvents.find(e => e.id === eventId);
  }

  /** @deprecated Use {@link GetEvent}. */
  getEvent(eventId: string): MJTimelineEvent<T> | undefined {
    return this.GetEvent(eventId);
  }

  /**
   * Gets all events (flattened).
   */
  GetAllEvents(): MJTimelineEvent<T>[] {
    return [...this.AllEvents];
  }

  /** @deprecated Use {@link GetAllEvents}. */
  getAllEvents(): MJTimelineEvent<T>[] {
    return this.GetAllEvents();
  }

  // ============================================================================
  // EVENT HANDLERS (Template bindings)
  // ============================================================================

  /**
   * Handles click on an event card.
   */
  OnEventClick(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    const group = this._groups[event.groupIndex];

    // Emit before event
    const beforeArgs: BeforeEventClickArgs<T> = {
      cancel: false,
      event,
      group,
      index,
      domEvent
    };
    this.BeforeEventClick.emit(beforeArgs);

    if (beforeArgs.cancel) {
      return;
    }

    // Default behavior: toggle expand/collapse if collapsible
    const cardConfig = this.GetEffectiveCardConfig(event);
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
    this.AfterEventClick.emit(afterArgs);
  }

  /** @deprecated Use {@link OnEventClick}. */
  onEventClick(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    return this.OnEventClick(event, index, domEvent);
  }

  /**
   * Handles expand/collapse toggle on an event.
   */
  OnToggleExpand(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    domEvent.stopPropagation();
    this.toggleEventExpanded(event, index, domEvent);
  }

  /** @deprecated Use {@link OnToggleExpand}. */
  onToggleExpand(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    return this.OnToggleExpand(event, index, domEvent);
  }

  /**
   * Handles mouse enter on an event card.
   */
  OnEventMouseEnter(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    const group = this._groups[event.groupIndex];

    const beforeArgs: BeforeEventHoverArgs<T> = {
      cancel: false,
      event,
      group,
      index,
      domEvent,
      hoverState: 'enter'
    };
    this.BeforeEventHover.emit(beforeArgs);

    if (!beforeArgs.cancel) {
      const afterArgs: AfterEventHoverArgs<T> = {
        success: true,
        event,
        group,
        index,
        domEvent,
        hoverState: 'enter'
      };
      this.AfterEventHover.emit(afterArgs);
    }
  }

  /** @deprecated Use {@link OnEventMouseEnter}. */
  onEventMouseEnter(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    return this.OnEventMouseEnter(event, index, domEvent);
  }

  /**
   * Handles mouse leave on an event card.
   */
  OnEventMouseLeave(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    const group = this._groups[event.groupIndex];

    const beforeArgs: BeforeEventHoverArgs<T> = {
      cancel: false,
      event,
      group,
      index,
      domEvent,
      hoverState: 'leave'
    };
    this.BeforeEventHover.emit(beforeArgs);

    if (!beforeArgs.cancel) {
      const afterArgs: AfterEventHoverArgs<T> = {
        success: true,
        event,
        group,
        index,
        domEvent,
        hoverState: 'leave'
      };
      this.AfterEventHover.emit(afterArgs);
    }
  }

  /** @deprecated Use {@link OnEventMouseLeave}. */
  onEventMouseLeave(event: MJTimelineEvent<T>, index: number, domEvent: Event): void {
    return this.OnEventMouseLeave(event, index, domEvent);
  }

  /**
   * Handles action button click.
   */
  OnActionClick(event: MJTimelineEvent<T>, action: TimelineAction, index: number, domEvent: Event): void {
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
    this.BeforeActionClick.emit(beforeArgs);

    if (!beforeArgs.cancel) {
      const afterArgs: AfterActionClickArgs<T> = {
        success: true,
        event,
        group,
        index,
        domEvent,
        action
      };
      this.AfterActionClick.emit(afterArgs);
    }
  }

  /** @deprecated Use {@link OnActionClick}. */
  onActionClick(event: MJTimelineEvent<T>, action: TimelineAction, index: number, domEvent: Event): void {
    return this.OnActionClick(event, action, index, domEvent);
  }

  /**
   * Handles segment header click.
   */
  OnSegmentClick(segment: TimelineSegment): void {
    if (!this.segmentsCollapsible) {
      return;
    }

    if (segment.isExpanded) {
      this.collapseSegment(segment);
    } else {
      this.expandSegment(segment);
    }
  }

  /** @deprecated Use {@link OnSegmentClick}. */
  onSegmentClick(segment: TimelineSegment): void {
    return this.OnSegmentClick(segment);
  }

  /**
   * Handles scroll events for virtual scrolling.
   */
  OnScroll(event: Event): void {
    this._scroll$.next(event);
  }

  /** @deprecated Use {@link OnScroll}. */
  onScroll(event: Event): void {
    return this.OnScroll(event);
  }

  /**
   * Handles keyboard navigation.
   */
  OnKeyDown(event: KeyboardEvent): void {
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

  /** @deprecated Use {@link OnKeyDown}. */
  onKeyDown(event: KeyboardEvent): void {
    return this.OnKeyDown(event);
  }

  // ============================================================================
  // TEMPLATE HELPERS
  // ============================================================================

  /**
   * Gets the effective card config for an event.
   */
  GetEffectiveCardConfig(event: MJTimelineEvent<T>): TimelineCardConfig {
    const group = this._groups[event.groupIndex];
    return {
      ...this.DefaultCardConfig,
      ...group?.CardConfig,
      ...this.mapEventConfigToCardConfig(event.config)
    };
  }

  /** @deprecated Use {@link GetEffectiveCardConfig}. */
  getEffectiveCardConfig(event: MJTimelineEvent<T>): TimelineCardConfig {
    return this.GetEffectiveCardConfig(event);
  }

  /**
   * Gets the color for a group/event.
   */
  GetColor(event: MJTimelineEvent<T>): string {
    if (event.config?.color) {
      return event.config.color;
    }

    const group = this._groups[event.groupIndex];
    if (group?.DisplayColorMode === 'manual' && group.DisplayColor) {
      return group.DisplayColor;
    }

    return AUTO_COLORS[event.groupIndex % AUTO_COLORS.length];
  }

  /** @deprecated Use {@link GetColor}. */
  getColor(event: MJTimelineEvent<T>): string {
    return this.GetColor(event);
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
  GetActions(event: MJTimelineEvent<T>): TimelineAction[] {
    if (event.config?.actions) {
      return event.config.actions;
    }

    const cardConfig = this.GetEffectiveCardConfig(event);
    return cardConfig.actions || [];
  }

  /** @deprecated Use {@link GetActions}. */
  getActions(event: MJTimelineEvent<T>): TimelineAction[] {
    return this.GetActions(event);
  }

  /**
   * Formats a date for display.
   */
  formatDate(date: Date, format?: string): string {
    const fmt = format || this.DefaultCardConfig.dateFormat || 'MMM d, yyyy';
    return this.formatDateInternal(date, fmt);
  }

  /**
   * Gets the value of a display field from an event.
   */
  GetFieldValue(event: MJTimelineEvent<T>, field: TimelineDisplayField): string {
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

  /** @deprecated Use {@link GetFieldValue}. */
  getFieldValue(event: MJTimelineEvent<T>, field: TimelineDisplayField): string {
    return this.GetFieldValue(event, field);
  }

  /**
   * Track by function for ngFor.
   */
  TrackByEventId(_index: number, event: MJTimelineEvent<T>): string {
    return event.id;
  }

  /** @deprecated Use {@link TrackByEventId}. */
  trackByEventId(_index: number, event: MJTimelineEvent<T>): string {
    return this.TrackByEventId(_index, event);
  }

  /**
   * Track by function for segments.
   */
  TrackBySegmentLabel(_index: number, segment: TimelineSegment): string {
    return segment.label;
  }

  /** @deprecated Use {@link TrackBySegmentLabel}. */
  trackBySegmentLabel(_index: number, segment: TimelineSegment): string {
    return this.TrackBySegmentLabel(_index, segment);
  }

  /**
   * Gets the global index of an event in the allEvents array.
   */
  GetGlobalIndex(event: MJTimelineEvent<T>): number {
    return this.AllEvents.indexOf(event);
  }

  /** @deprecated Use {@link GetGlobalIndex}. */
  getGlobalIndex(event: MJTimelineEvent<T>): number {
    return this.GetGlobalIndex(event);
  }

  /**
   * Checks if an event is currently selected/focused.
   * An event is selected if either:
   * - Its ID matches the selectedEventId input
   * - Its global index matches the focusedEventIndex (keyboard navigation)
   */
  IsEventSelected(event: MJTimelineEvent<T>, globalIndex: number): boolean {
    // Check selectedEventId from parent first (takes priority)
    if (this.SelectedEventId && event.id === this.SelectedEventId) {
      return true;
    }
    // Fall back to keyboard navigation focus
    return this.FocusedEventIndex === globalIndex;
  }

  /** @deprecated Use {@link IsEventSelected}. */
  isEventSelected(event: MJTimelineEvent<T>, globalIndex: number): boolean {
    return this.IsEventSelected(event, globalIndex);
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
    this.ScrollState.loadedCount = this.AllEvents.length;
    this.ScrollState.hasMore = false; // TODO: Implement proper pagination detection
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
      this.AllEvents.push(event);
    }
  }

  /**
   * Loads data from MemberJunction entity.
   */
  private async loadFromEntity(group: TimelineGroup<T>): Promise<T[]> {
    try {
      const { RunView } = await import('@memberjunction/core');
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);

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
    this.AllEvents.sort((a, b) => {
      const diff = a.date.getTime() - b.date.getTime();
      return this.SortOrder === 'asc' ? diff : -diff;
    });
  }

  // ============================================================================
  // PRIVATE METHODS - SEGMENTATION
  // ============================================================================

  /**
   * Builds time segments from events.
   */
  private buildSegments(): void {
    if (this.SegmentGrouping === 'none') {
      this.Segments = [];
      return;
    }

    const segmentMap = new Map<string, TimelineSegment>();

    for (const event of this.AllEvents) {
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
    this.Segments = Array.from(segmentMap.values());
    this.Segments.sort((a, b) => {
      const diff = a.startDate.getTime() - b.startDate.getTime();
      return this.SortOrder === 'asc' ? diff : -diff;
    });
  }

  /**
   * Gets segment information for a date.
   */
  private getSegmentInfo(date: Date): { label: string; startDate: Date; endDate: Date } {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    switch (this.SegmentGrouping) {
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
    this.BeforeEventExpand.emit(beforeArgs);

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
    this.AfterEventExpand.emit(afterArgs);
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
    this.BeforeEventCollapse.emit(beforeArgs);

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
    this.AfterEventCollapse.emit(afterArgs);
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
    this.BeforeSegmentExpand.emit(beforeArgs);

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
    this.AfterSegmentExpand.emit(afterArgs);
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
    this.BeforeSegmentCollapse.emit(beforeArgs);

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
    this.AfterSegmentCollapse.emit(afterArgs);
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
    if (this.AllEvents.length === 0) return;

    this.FocusedEventIndex = Math.min(
      this.FocusedEventIndex + 1,
      this.AllEvents.length - 1
    );
    this.scrollToFocusedEvent();
  }

  private focusPreviousEvent(): void {
    if (this.AllEvents.length === 0) return;

    this.FocusedEventIndex = Math.max(this.FocusedEventIndex - 1, 0);
    this.scrollToFocusedEvent();
  }

  private focusFirstEvent(): void {
    if (this.AllEvents.length === 0) return;

    this.FocusedEventIndex = 0;
    this.scrollToFocusedEvent();
  }

  private focusLastEvent(): void {
    if (this.AllEvents.length === 0) return;

    this.FocusedEventIndex = this.AllEvents.length - 1;
    this.scrollToFocusedEvent();
  }

  private activateFocusedEvent(): void {
    if (this.FocusedEventIndex >= 0 && this.FocusedEventIndex < this.AllEvents.length) {
      const event = this.AllEvents[this.FocusedEventIndex];
      this.toggleEventExpanded(event, this.FocusedEventIndex);
    }
  }

  private collapseFocusedEvent(): void {
    if (this.FocusedEventIndex >= 0 && this.FocusedEventIndex < this.AllEvents.length) {
      const event = this.AllEvents[this.FocusedEventIndex];
      if (event.isExpanded) {
        this.collapseEventInternal(event, this.FocusedEventIndex);
      }
    }
  }

  private scrollToFocusedEvent(): void {
    if (this.FocusedEventIndex >= 0 && this.FocusedEventIndex < this.AllEvents.length) {
      const event = this.AllEvents[this.FocusedEventIndex];
      this.ScrollToEvent(event.id, 'smooth');
    }
    this.cdr.markForCheck();
  }

  // ============================================================================
  // PRIVATE METHODS - VIRTUAL SCROLLING
  // ============================================================================

  private setupIntersectionObserver(): void {
    if (!this.VirtualScroll.enabled) return;

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      const sentinel = this.elementRef.nativeElement.querySelector('.mj-timeline-scroll-sentinel');
      if (!sentinel) return;

      this._intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting && !this.ScrollState.isLoading && this.ScrollState.hasMore) {
            this.ngZone.run(() => this.LoadMore());
          }
        },
        {
          root: this.ScrollContainer?.nativeElement,
          threshold: 0,
          rootMargin: `${this.VirtualScroll.loadThreshold}px`
        }
      );

      this._intersectionObserver.observe(sentinel);
    });
  }

  private onScrollCheck(): void {
    if (!this.ScrollContainer?.nativeElement || !this.VirtualScroll.enabled) {
      return;
    }

    const el = this.ScrollContainer.nativeElement;
    this.ScrollState.scrollOffset = el.scrollTop;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < this.VirtualScroll.loadThreshold && this.ScrollState.hasMore) {
      this.LoadMore();
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
