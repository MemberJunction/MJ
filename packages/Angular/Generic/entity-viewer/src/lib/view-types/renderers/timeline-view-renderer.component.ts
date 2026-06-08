import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  OnInit,
  ViewEncapsulation,
  inject,
} from '@angular/core';
import { EntityInfo, EntityFieldInfo, EntityFieldTSType } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
  TimelineModule,
  TimelineGroup,
  TimeSegmentGrouping,
  TimelineSortOrder,
  AfterEventClickArgs,
} from '@memberjunction/ng-timeline';
import { TimelineOrientation } from '../../types';
import { IViewRenderer } from '../view-type.contracts';

/**
 * The persisted configuration shape for the Timeline view type.
 *
 * This is the `config` payload the host hands to the renderer on mount and that the
 * renderer emits back (in full) via {@link TimelineViewRendererComponent.configChanged}
 * whenever the user changes any of the timeline chrome controls. The host treats it as an
 * opaque blob — only this renderer (and an eventual prop-sheet) understands its keys — and
 * persists it per `MJ: View Types` row.
 *
 * All fields are optional: on first mount the renderer falls back to sensible defaults
 * (first available date field, vertical orientation, descending sort, monthly segments).
 */
export interface TimelineViewConfig {
  /** The entity date-field used to place records on the timeline (e.g. `__mj_CreatedAt`). */
  dateFieldName?: string;
  /** Vertical (alternating) vs. horizontal (single-row) timeline layout. */
  orientation?: TimelineOrientation;
  /** Newest-first (`desc`) vs. oldest-first (`asc`) event ordering. */
  sortOrder?: TimelineSortOrder;
  /** How events are bucketed into collapsible segments (day/week/month/...). */
  segmentGrouping?: TimeSegmentGrouping;
}

/**
 * TimelineViewRendererComponent
 * -----------------------------
 * The Timeline **view type** as a self-contained {@link IViewRenderer} plug-in. Where the
 * Timeline view used to be hard-wired into the generic `mj-entity-viewer` host (which owned
 * the date-field detection, the record→{@link TimelineGroup} transformation, and the
 * date-field / orientation / sort chrome), this component now OWNS all of it. The host simply
 * dynamic-mounts this renderer when Timeline is the active view type and feeds it the standard
 * renderer inputs (`entity` / `records` / `selectedRecordId` / `filterText` / `config`).
 *
 * It renders a small chrome header row (date-field selector + orientation toggle + sort toggle)
 * above a flex-filling `<mj-timeline>`, exactly reproducing the host's previous timeline chrome
 * and bindings. Because the host only mounts this plug-in when Timeline is active, the chrome
 * always renders — no extra `EffectiveViewMode === 'timeline'` guard is needed.
 *
 * **What was absorbed from the host** (`EntityViewerComponent`): `detectDateFields()`,
 * `sortDateFieldsByPriority()`, `AvailableDateFields`/`HasDateFields`, `configureTimeline()`,
 * `updateTimelineGroups()` (+ `findTitleField`/`findDescriptionField`/`findSubtitleField`),
 * `ToggleTimelineOrientation()`, `ToggleTimelineSortOrder()`, `SetTimelineDateField()`,
 * `SelectedDateFieldDisplayName`, `OnTimelineEventClick()`, and the `TimelineSelectedEventID`
 * composite-key→raw-id derivation.
 *
 * Inputs use the camelCase names mandated by the {@link IViewRenderer} contract (the host binds
 * them by those exact names) rather than MJ's usual PascalCase for public members.
 */
@Component({
  standalone: true,
  selector: 'mj-timeline-view-renderer',
  encapsulation: ViewEncapsulation.None,
  imports: [TimelineModule],
  template: `
    <!-- Chrome row: date-field selector + orientation toggle + sort toggle.
         Always rendered — this plug-in only mounts when Timeline is the active view. -->
    <div class="timeline-view-chrome">
      <!-- Date Field Selector -->
      <div class="timeline-date-selector">
        <i class="fa-solid fa-calendar-days"></i>
        @if (AvailableDateFields.length === 1) {
          <span class="date-field-label">{{ SelectedDateFieldDisplayName }}</span>
        } @else if (AvailableDateFields.length > 1) {
          <select
            class="date-field-select"
            [value]="SelectedTimelineDateField"
            (change)="SetTimelineDateField($any($event.target).value)">
            @for (field of AvailableDateFields; track field.Name) {
              <option [value]="field.Name">{{ field.DisplayNameOrName }}</option>
            }
          </select>
        }
      </div>

      <!-- Orientation Toggle -->
      <div class="timeline-orientation-toggle">
        <button
          class="toggle-btn"
          (click)="ToggleTimelineOrientation()"
          [title]="TimelineOrientationState === 'vertical' ? 'Switch to Horizontal' : 'Switch to Vertical'">
          <i [class]="TimelineOrientationState === 'vertical' ? 'fa-solid fa-ellipsis-vertical' : 'fa-solid fa-ellipsis'"></i>
        </button>
      </div>

      <!-- Sort Order Toggle -->
      <div class="timeline-sort-toggle">
        <button
          class="toggle-btn"
          (click)="ToggleTimelineSortOrder()"
          [title]="TimelineSortOrderState === 'desc' ? 'Showing Newest First (click for Oldest First)' : 'Showing Oldest First (click for Newest First)'">
          <i [class]="TimelineSortOrderState === 'desc' ? 'fa-solid fa-arrow-down-wide-short' : 'fa-solid fa-arrow-up-wide-short'"></i>
        </button>
      </div>
    </div>

    @if (HasDateFields) {
      <mj-timeline
        [groups]="TimelineGroups"
        [orientation]="TimelineOrientationState"
        [layout]="TimelineOrientationState === 'vertical' ? 'alternating' : 'single'"
        [sortOrder]="TimelineSortOrderState"
        [segmentGrouping]="TimelineSegmentGrouping"
        [segmentsCollapsible]="true"
        [segmentsDefaultExpanded]="true"
        [selectedEventId]="TimelineSelectedEventID"
        (afterEventClick)="OnTimelineEventClick($event)">
      </mj-timeline>
    } @else {
      <div class="timeline-view-empty">
        <i class="fa-solid fa-calendar-xmark"></i>
        <span>This entity has no date fields to plot on a timeline.</span>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .timeline-view-chrome {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 12px;
        flex: 0 0 auto;
      }

      .timeline-view-renderer mj-timeline,
      :host mj-timeline {
        flex: 1 1 auto;
        min-height: 0;
      }

      /* Timeline Date Field Selector */
      .timeline-date-selector {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--mj-text-secondary);
      }

      .timeline-date-selector i {
        color: var(--mj-text-disabled);
      }

      .date-field-label {
        color: var(--mj-text-secondary);
        font-weight: 500;
      }

      .date-field-select {
        padding: 4px 8px;
        border: 1px solid var(--mj-border-default);
        border-radius: 4px;
        font-size: 13px;
        background: var(--mj-bg-surface);
        color: var(--mj-text-secondary);
        cursor: pointer;
        outline: none;
        transition: border-color 0.15s ease;
      }

      .date-field-select:hover {
        border-color: var(--mj-border-strong);
      }

      .date-field-select:focus {
        border-color: var(--mj-brand-primary);
      }

      /* Orientation / Sort toggles */
      .timeline-orientation-toggle,
      .timeline-sort-toggle {
        display: flex;
        background: var(--mj-bg-surface-card);
        border-radius: 6px;
        padding: 2px;
      }

      .toggle-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--mj-text-muted);
        transition: all 0.15s ease;
      }

      .toggle-btn:hover {
        color: var(--mj-text-secondary);
      }

      .toggle-btn.active {
        background: var(--mj-bg-surface);
        color: var(--mj-brand-primary);
        box-shadow: 0 1px 3px color-mix(in srgb, var(--mj-text-primary) 10%, transparent);
      }

      .timeline-view-empty {
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        color: var(--mj-text-muted);
        padding: 32px;
        text-align: center;
      }

      .timeline-view-empty i {
        font-size: 32px;
        opacity: 0.6;
      }
    `,
  ],
})
export class TimelineViewRendererComponent
  extends BaseAngularComponent
  implements IViewRenderer<TimelineViewConfig>, OnInit
{
  // ========================================
  // IViewRenderer inputs (camelCase per the host contract)
  // ========================================

  private _entity: EntityInfo | null = null;
  /** The entity whose records are being rendered. Re-detects date fields + rebuilds groups on change. */
  @Input()
  set entity(value: EntityInfo | null) {
    const changed = value?.ID !== this._entity?.ID;
    this._entity = value;
    if (changed) {
      this.detectDateFields();
      this.cdr.detectChanges();
    }
  }
  get entity(): EntityInfo | null {
    return this._entity;
  }

  private _records: Record<string, unknown>[] = [];
  /** The records to render (already loaded/filtered by the host). Rebuilds groups on change. */
  @Input()
  set records(value: Record<string, unknown>[]) {
    this._records = value ?? [];
    this.updateTimelineGroups();
    this.cdr.detectChanges();
  }
  get records(): Record<string, unknown>[] {
    return this._records;
  }

  /** Primary-key string of the currently selected record, if any (composite-key encoded). */
  @Input() selectedRecordId: string | null = null;

  /** Active filter text — accepted for contract uniformity; the host pre-filters `records`. */
  @Input() filterText: string | null = null;

  private _config: TimelineViewConfig = {};
  /**
   * This view's persisted configuration. Seeding the chrome controls from it is deferred to
   * {@link applyConfigToState}, called both here (for late updates) and in {@link ngOnInit}
   * (for the initial mount, where the host sets `config` via `setInput` before init runs).
   */
  @Input()
  set config(value: TimelineViewConfig) {
    this._config = value ?? {};
    if (this._initialized) {
      this.applyConfigToState();
      this.cdr.detectChanges();
    }
  }
  get config(): TimelineViewConfig {
    return this._config;
  }

  // ========================================
  // IViewRenderer outputs
  // ========================================

  /** Emitted when a timeline event is clicked — payload is the RAW record object. */
  @Output() recordSelected = new EventEmitter<unknown>();

  /** Emitted when a record should be opened — payload is the RAW record object. */
  @Output() recordOpened = new EventEmitter<unknown>();

  /** Emitted (with the FULL updated config) whenever the user changes a chrome control. */
  @Output() configChanged = new EventEmitter<TimelineViewConfig>();

  // ========================================
  // RENDER STATE (absorbed from the host)
  // ========================================

  /** Whether the current entity has any date fields available for timeline view. */
  public HasDateFields = false;

  /** Available date fields from the entity, sorted by priority. */
  public AvailableDateFields: EntityFieldInfo[] = [];

  /** The currently selected date field name for the timeline. */
  public SelectedTimelineDateField: string | null = null;

  /** The built timeline groups handed to `<mj-timeline>`. */
  public TimelineGroups: TimelineGroup<Record<string, unknown>>[] = [];

  /**
   * Timeline sort order. Named `…State` (not `TimelineSortOrder`) to avoid colliding with the
   * imported {@link TimelineSortOrder} type symbol used in the template / signatures.
   */
  public TimelineSortOrderState: TimelineSortOrder = 'desc';

  /** Timeline segment grouping (day/week/month/...). */
  public TimelineSegmentGrouping: TimeSegmentGrouping = 'month';

  /**
   * Timeline orientation. Named `…State` to avoid colliding with the imported
   * {@link TimelineOrientation} type symbol.
   */
  public TimelineOrientationState: TimelineOrientation = 'vertical';

  private _initialized = false;
  private cdr = inject(ChangeDetectorRef);

  // ========================================
  // LIFECYCLE
  // ========================================

  ngOnInit(): void {
    // The host sets entity/records/config via setInput BEFORE ngOnInit, so detection may have
    // already run. Apply the seeded config now (controls + defaults), then (re)build groups.
    this._initialized = true;
    this.applyConfigToState();
    this.detectDateFields();
    this.cdr.detectChanges();
  }

  // ========================================
  // COMPUTED
  // ========================================

  /** Display name of the currently selected timeline date field. */
  get SelectedDateFieldDisplayName(): string {
    if (!this.SelectedTimelineDateField) {
      return '';
    }
    const field = this.AvailableDateFields.find((f) => f.Name === this.SelectedTimelineDateField);
    return field?.DisplayNameOrName || this.SelectedTimelineDateField;
  }

  /**
   * The raw ID value derived from {@link selectedRecordId} for timeline selection. The host
   * passes the selection in composite-key format (`ID|abc-123` or `ID=abc-123`), but the
   * timeline stores just the raw ID value — so strip the field-name prefix.
   */
  get TimelineSelectedEventID(): string | null {
    if (!this.selectedRecordId) {
      return null;
    }
    if (this.selectedRecordId.includes('|')) {
      const parts = this.selectedRecordId.split('|');
      return parts.length > 1 ? parts[1] : this.selectedRecordId;
    }
    if (this.selectedRecordId.includes('=')) {
      const parts = this.selectedRecordId.split('=');
      return parts.length > 1 ? parts[1] : this.selectedRecordId;
    }
    return this.selectedRecordId;
  }

  // ========================================
  // CHROME ACTIONS (absorbed from the host)
  // ========================================

  /** Toggle timeline orientation between vertical and horizontal, then persist via config. */
  ToggleTimelineOrientation(): void {
    this.TimelineOrientationState = this.TimelineOrientationState === 'vertical' ? 'horizontal' : 'vertical';
    this.emitConfigChange();
    this.cdr.detectChanges();
  }

  /** Toggle timeline sort order between newest-first (desc) and oldest-first (asc), then persist. */
  ToggleTimelineSortOrder(): void {
    this.TimelineSortOrderState = this.TimelineSortOrderState === 'desc' ? 'asc' : 'desc';
    this.emitConfigChange();
    this.cdr.detectChanges();
  }

  /** Change the date field used for the timeline, rebuild groups, then persist via config. */
  SetTimelineDateField(fieldName: string): void {
    if (this.AvailableDateFields.some((f) => f.Name === fieldName)) {
      this.SelectedTimelineDateField = fieldName;
      this.updateTimelineGroups();
      this.emitConfigChange();
      this.cdr.detectChanges();
    }
  }

  // ========================================
  // TIMELINE EVENT → RECORD MAPPING
  // ========================================

  /**
   * Handle a timeline event click. Maps the {@link AfterEventClickArgs} to the underlying raw
   * record (`event.event.entity`) and emits it on {@link recordSelected}. The host's dynamic
   * handler builds the composite key from the raw record, so we emit the record object as-is.
   */
  OnTimelineEventClick(event: AfterEventClickArgs): void {
    const record = event.event.entity as Record<string, unknown> | undefined;
    if (record) {
      this.recordSelected.emit(record);
    }
  }

  // ========================================
  // CONFIG <-> STATE
  // ========================================

  /**
   * Seed the chrome control state from {@link config}, applying sensible defaults where the
   * config is silent (vertical orientation, descending sort, monthly segments). The selected
   * date field is resolved against the currently-available date fields in {@link detectDateFields}.
   */
  private applyConfigToState(): void {
    const c = this._config;
    this.TimelineOrientationState = c.orientation ?? 'vertical';
    this.TimelineSortOrderState = c.sortOrder ?? 'desc';
    this.TimelineSegmentGrouping = c.segmentGrouping ?? 'month';
  }

  /** Emit the FULL current config object so the host can persist the change. */
  private emitConfigChange(): void {
    this._config = {
      dateFieldName: this.SelectedTimelineDateField ?? undefined,
      orientation: this.TimelineOrientationState,
      sortOrder: this.TimelineSortOrderState,
      segmentGrouping: this.TimelineSegmentGrouping,
    };
    this.configChanged.emit(this._config);
  }

  // ========================================
  // DATE-FIELD DETECTION (absorbed from the host)
  // ========================================

  /**
   * Detect the entity's date fields and configure the timeline. Resolves the selected date
   * field (preferring the configured one, falling back to the highest-priority available field)
   * and rebuilds the groups. No-ops to an empty state when the entity has no date fields.
   */
  private detectDateFields(): void {
    if (!this._entity) {
      this.HasDateFields = false;
      this.AvailableDateFields = [];
      this.TimelineGroups = [];
      return;
    }

    const dateFields = this._entity.Fields.filter((f) => f.TSType === EntityFieldTSType.Date);
    if (dateFields.length === 0) {
      this.HasDateFields = false;
      this.AvailableDateFields = [];
      this.TimelineGroups = [];
      return;
    }

    this.AvailableDateFields = this.sortDateFieldsByPriority(dateFields);
    this.HasDateFields = true;
    this.SelectedTimelineDateField = this.getEffectiveTimelineDateField();
    this.updateTimelineGroups();
  }

  /**
   * Sort date fields by priority: `DefaultInView` fields first (by Sequence), then the rest
   * (by Sequence).
   */
  private sortDateFieldsByPriority(dateFields: EntityFieldInfo[]): EntityFieldInfo[] {
    const defaultInView = dateFields.filter((f) => f.DefaultInView).sort((a, b) => a.Sequence - b.Sequence);
    const others = dateFields.filter((f) => !f.DefaultInView).sort((a, b) => a.Sequence - b.Sequence);
    return [...defaultInView, ...others];
  }

  /**
   * Resolve which date field to use: the configured `dateFieldName` when it's still a valid
   * available field, otherwise the first (highest-priority) available date field.
   */
  private getEffectiveTimelineDateField(): string {
    if (this._config.dateFieldName) {
      const configField = this.AvailableDateFields.find((f) => f.Name === this._config.dateFieldName);
      if (configField) {
        return configField.Name;
      }
    }
    return this.AvailableDateFields[0].Name;
  }

  // ========================================
  // GROUP BUILDING (absorbed from the host)
  // ========================================

  /**
   * Build the single {@link TimelineGroup} for the current entity + records + selected date
   * field, mirroring the host's previous `updateTimelineGroups()`. No-ops to an empty state
   * when there is no entity or no selected date field.
   */
  private updateTimelineGroups(): void {
    if (!this._entity || !this.SelectedTimelineDateField) {
      this.TimelineGroups = [];
      return;
    }

    const titleField = this.findTitleField();

    const group = new TimelineGroup<Record<string, unknown>>();
    group.DataSourceType = 'array';
    group.EntityObjects = this._records;
    group.TitleFieldName = titleField;
    group.DateFieldName = this.SelectedTimelineDateField;
    group.IdFieldName = 'ID';
    group.GroupLabel = this._entity.Name;

    const descField = this.findDescriptionField();
    if (descField) {
      group.DescriptionFieldName = descField;
    }

    const subtitleField = this.findSubtitleField(titleField);
    if (subtitleField) {
      group.SubtitleFieldName = subtitleField;
    }

    group.CardConfig = {
      collapsible: true,
      defaultExpanded: false,
      showDate: true,
      dateFormat: 'MMM d, yyyy h:mm a',
    };

    this.TimelineGroups = [group];
  }

  /**
   * Find the best field to use as the event title: the entity's NameField, then a
   * `DefaultInView` string field matching a common name pattern, then the first string field.
   */
  private findTitleField(): string {
    if (!this._entity) {
      return 'ID';
    }
    if (this._entity.NameField) {
      return this._entity.NameField.Name;
    }

    const stringFields = this._entity.Fields.filter(
      (f) => f.TSType === EntityFieldTSType.String && f.DefaultInView && !f.Name.startsWith('__mj_'),
    ).sort((a, b) => a.Sequence - b.Sequence);

    const namePatterns = ['name', 'title', 'subject', 'label'];
    for (const pattern of namePatterns) {
      const match = stringFields.find((f) => f.Name.toLowerCase().includes(pattern));
      if (match) {
        return match.Name;
      }
    }

    return stringFields.length > 0 ? stringFields[0].Name : 'ID';
  }

  /** Find a suitable description field by common naming pattern, or null. */
  private findDescriptionField(): string | null {
    if (!this._entity) {
      return null;
    }
    const descPatterns = ['description', 'notes', 'summary', 'content', 'body', 'details'];
    const textFields = this._entity.Fields.filter(
      (f) => f.TSType === EntityFieldTSType.String && !f.Name.startsWith('__mj_'),
    );
    for (const pattern of descPatterns) {
      const match = textFields.find((f) => f.Name.toLowerCase().includes(pattern));
      if (match) {
        return match.Name;
      }
    }
    return null;
  }

  /**
   * Find a suitable subtitle field (different from the title): a `DefaultInView` string field
   * matching a classification pattern (status/type/category/...), else the first other string
   * field, else null.
   */
  private findSubtitleField(excludeField: string): string | null {
    if (!this._entity) {
      return null;
    }
    const patterns = ['status', 'type', 'category', 'state', 'priority'];
    const fields = this._entity.Fields.filter(
      (f) =>
        f.TSType === EntityFieldTSType.String &&
        f.DefaultInView &&
        f.Name !== excludeField &&
        !f.Name.startsWith('__mj_'),
    ).sort((a, b) => a.Sequence - b.Sequence);

    for (const pattern of patterns) {
      const match = fields.find((f) => f.Name.toLowerCase().includes(pattern));
      if (match) {
        return match.Name;
      }
    }

    const firstOther = fields.find((f) => f.Name !== excludeField);
    return firstOther?.Name || null;
  }
}

/**
 * Tree-shaking guard. Force-references the component class so bundlers don't drop this module
 * when it's only mounted dynamically via the view-type descriptor's `RendererComponent`.
 */
export function LoadTimelineViewRenderer(): void {
  // no-op; presence prevents tree-shaking of the dynamically-mounted renderer
  void TimelineViewRendererComponent;
}
