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
import { EntityFieldTSType, EntityInfo } from '@memberjunction/core';
import { GetMonthYearLabel } from '@memberjunction/ng-ui-components';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { IViewRenderer, ViewDataRequest } from '../view-type.contracts';
import {
  BuildCalendarItems,
  CALENDAR_WEEK_DAYS,
  CalendarItem,
  CalendarMode,
  CalendarViewConfig,
  DayKey,
  GetMonthWeeks,
  GetVisibleDays,
  GroupItemsByDay,
  ResolveCalendarFields,
  ShiftAnchor,
  StartOfDay,
} from './calendar-placement';

/**
 * CalendarViewRendererComponent
 * -----------------------------
 * The Calendar **view type** ({@link IViewRenderer}): records placed on a day, week (Monday
 * first) or month layout by a start field and an optional end field named in the view's
 * {@link CalendarViewConfig}. Placement is the pure logic in `calendar-placement.ts`; this
 * component only holds the anchor date and binds the result.
 *
 * Like Map, it asks the host for the full record set (`dataRequest({ loadAll: true })`), so it
 * sees up to the host's load-all cap rather than one page. Clicking a record emits
 * `recordSelected` and double-clicking emits `recordOpened`, as the Cards renderer does. A gear
 * button opens the {@link CalendarViewPropSheetComponent} inline, because no host mounts a
 * descriptor's prop sheet yet.
 *
 * Inputs/outputs use the camelCase names the {@link IViewRenderer} contract mandates.
 */
@Component({
  standalone: false,
  selector: 'mj-calendar-view-renderer',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="calendar-view">
    @if (HasDateFields) {
      <div class="calendar-view-chrome">
        <button mjButton Variant="outline" Size="sm" type="button" title="Previous" AriaLabel="Previous" (click)="Previous()">
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
        </button>
        <button mjButton Variant="outline" Size="sm" type="button" (click)="Today()">Today</button>
        <button mjButton Variant="outline" Size="sm" type="button" title="Next" AriaLabel="Next" (click)="Next()">
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
        <span class="calendar-view-title">{{ Title }}</span>
        <mj-view-toggle [Options]="ModeOptions" [ActiveKey]="Mode" (KeyChange)="SetMode($event)"></mj-view-toggle>
        <button mjButton Variant="icon" Size="sm" type="button" title="Calendar settings" AriaLabel="Calendar settings" [Toggleable]="true" [(Selected)]="ShowSettings">
          <i class="fa-solid fa-gear" aria-hidden="true"></i>
        </button>
      </div>

      @if (ShowSettings) {
        <mj-calendar-view-prop-sheet [entity]="entity" [config]="config" (configChange)="OnSettingsChange($event)"></mj-calendar-view-prop-sheet>
      }

      @if (Mode === 'month') {
        <div class="calendar-month">
          @for (label of WeekDayLabels; track label) {
            <div class="calendar-weekday">{{ label }}</div>
          }
          @for (week of MonthWeeks; track $index) {
            @for (day of week; track day.getTime()) {
              <div class="calendar-cell" [class.is-other-month]="day.getMonth() !== Anchor.getMonth()" [class.is-today]="IsToday(day)">
                <div class="calendar-day-number">{{ day.getDate() }}</div>
                @for (item of ItemsFor(day).slice(0, MaxItemsPerCell); track $index) {
                  <ng-container *ngTemplateOutlet="itemChip; context: { $implicit: item, day: day }"></ng-container>
                }
                @if (ItemsFor(day).length > MaxItemsPerCell) {
                  <button type="button" class="calendar-more" (click)="GoToDay(day)">+{{ ItemsFor(day).length - MaxItemsPerCell }} more</button>
                }
              </div>
            }
          }
        </div>
      } @else {
        <div class="calendar-columns">
          @for (day of VisibleDays; track day.getTime()) {
            <div class="calendar-column" [class.is-today]="IsToday(day)">
              <div class="calendar-column-header">{{ DayHeader(day) }}</div>
              @for (item of ItemsFor(day); track $index) {
                <ng-container *ngTemplateOutlet="itemChip; context: { $implicit: item, day: day }"></ng-container>
              } @empty {
                <div class="calendar-column-empty">No records</div>
              }
            </div>
          }
        </div>
      }
    } @else {
      <mj-empty-state
        class="calendar-view-empty-fill"
        Variant="warning"
        Icon="fa-solid fa-calendar-xmark"
        Title="This entity has no date fields to place on a calendar." />
    }
    </div>

    <ng-template #itemChip let-item let-day="day">
      <button type="button" class="calendar-item" [class.is-continued]="!IsFirstDay(item, day)"
              [title]="ItemLabel(item)" (click)="OnItemClick(item)" (dblclick)="OnItemOpen(item)">
        @if (ItemTime(item, day); as time) {
          <span class="calendar-item-time">{{ time }}</span>
        }
        <span class="calendar-item-label">{{ ItemLabel(item) }}</span>
      </button>
    </ng-template>
  `,
  styles: [
    `
      /* The host forces display:block on the renderer element, so the flex column lives on a wrapper. */
      .calendar-view {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }
      .calendar-view-chrome {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        flex: 0 0 auto;
      }
      .calendar-view-title {
        flex: 1 1 auto;
        font-size: 15px;
        font-weight: 600;
        color: var(--mj-text-primary);
      }
      .calendar-month {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        grid-template-rows: auto; /* the weekday header row */
        grid-auto-rows: minmax(96px, auto);
        border-top: 1px solid var(--mj-border-default);
        border-left: 1px solid var(--mj-border-default);
      }
      .calendar-weekday {
        padding: 4px 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--mj-text-muted);
        background: var(--mj-bg-surface-card);
        border-right: 1px solid var(--mj-border-default);
        border-bottom: 1px solid var(--mj-border-default);
      }
      .calendar-cell,
      .calendar-column {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px;
        min-width: 0;
        background: var(--mj-bg-surface);
        border-right: 1px solid var(--mj-border-default);
        border-bottom: 1px solid var(--mj-border-default);
      }
      .calendar-cell.is-other-month {
        background: var(--mj-bg-surface-sunken);
      }
      .calendar-cell.is-other-month .calendar-day-number {
        color: var(--mj-text-disabled);
      }
      .calendar-day-number {
        font-size: 12px;
        color: var(--mj-text-secondary);
      }
      .is-today .calendar-day-number,
      .is-today .calendar-column-header {
        color: var(--mj-brand-primary);
        font-weight: 700;
      }
      .calendar-columns {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        border-top: 1px solid var(--mj-border-default);
        border-left: 1px solid var(--mj-border-default);
      }
      .calendar-column-header {
        padding: 4px;
        font-size: 13px;
        font-weight: 600;
        color: var(--mj-text-secondary);
      }
      .calendar-column-empty {
        padding: 4px;
        font-size: 12px;
        color: var(--mj-text-disabled);
      }
      .calendar-item {
        display: flex;
        gap: 6px;
        align-items: baseline;
        width: 100%;
        padding: 2px 6px;
        border: none;
        border-left: 3px solid var(--mj-brand-primary);
        border-radius: 4px;
        background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
        color: var(--mj-text-primary);
        font-size: 12px;
        text-align: left;
        cursor: pointer;
      }
      .calendar-item:hover {
        background: color-mix(in srgb, var(--mj-brand-primary) 18%, var(--mj-bg-surface));
      }
      .calendar-item.is-continued {
        border-left-style: dashed;
      }
      .calendar-item-time {
        flex: 0 0 auto;
        color: var(--mj-text-muted);
      }
      .calendar-item-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .calendar-more {
        border: none;
        background: transparent;
        color: var(--mj-text-link);
        font-size: 12px;
        text-align: left;
        cursor: pointer;
        padding: 0 6px;
      }
      .calendar-view-empty-fill {
        flex: 1 1 auto;
      }
    `,
  ],
})
export class CalendarViewRendererComponent
  extends BaseAngularComponent
  implements IViewRenderer<CalendarViewConfig>, OnInit
{
  private _entity: EntityInfo | null = null;
  /** The entity whose records are placed. */
  @Input()
  set entity(value: EntityInfo | null) {
    this._entity = value;
    this.rebuild();
  }
  get entity(): EntityInfo | null {
    return this._entity;
  }

  private _records: Record<string, unknown>[] = [];
  /** The records to place (loaded/filtered by the host). */
  @Input()
  set records(value: Record<string, unknown>[]) {
    this._records = value ?? [];
    this.rebuild();
  }
  get records(): Record<string, unknown>[] {
    return this._records;
  }

  /** Primary-key string of the selected record. Accepted for contract uniformity. */
  @Input() selectedRecordId: string | null = null;

  /** Active filter text. Accepted for contract uniformity; the host pre-filters `records`. */
  @Input() filterText: string | null = null;

  private _config: CalendarViewConfig = {};
  /** The persisted view config: start/end fields and the layout the view opens in. */
  @Input()
  set config(value: CalendarViewConfig) {
    this._config = value ?? {};
    this.Mode = this._config.mode ?? 'month';
    this.rebuild();
  }
  get config(): CalendarViewConfig {
    return this._config;
  }

  /** Emitted on a record click with the raw record. */
  @Output() recordSelected = new EventEmitter<unknown>();
  /** Emitted on a record double-click with the raw record (a navigation request). */
  @Output() recordOpened = new EventEmitter<unknown>();
  /** Emitted with the full config when the layout or the settings change. */
  @Output() configChanged = new EventEmitter<CalendarViewConfig>();
  /** Asks the host for the full record set on init. */
  @Output() dataRequest = new EventEmitter<ViewDataRequest>();

  /** The current layout. */
  public Mode: CalendarMode = 'month';
  /** A date inside the period on screen. */
  public Anchor: Date = StartOfDay(new Date());
  /** Whether the inline settings sheet is open. */
  public ShowSettings = false;
  /** Whether the entity has any date field. */
  public HasDateFields = false;
  /** Month cells shown before "+N more". */
  public readonly MaxItemsPerCell = 3;
  /** Monday-first weekday labels. */
  public readonly WeekDayLabels = CALENDAR_WEEK_DAYS;
  /** The layout switch options. */
  public readonly ModeOptions = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];
  /** The month grid's weeks. */
  public MonthWeeks: Date[][] = [];
  /** The days of the day/week layout. */
  public VisibleDays: Date[] = [];

  private items: CalendarItem[] = [];
  private itemsByDay = new Map<number, CalendarItem[]>();
  private titleFieldName: string | null = null;
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.dataRequest.emit({ loadAll: true });
  }

  /** The header label for the period on screen. */
  get Title(): string {
    if (this.Mode === 'month') {
      return GetMonthYearLabel(this.Anchor);
    }
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    if (this.Mode === 'day') {
      return this.Anchor.toLocaleDateString(undefined, { weekday: 'long', ...options });
    }
    const days = this.VisibleDays;
    return `${days[0].toLocaleDateString(undefined, options)} – ${days[6].toLocaleDateString(undefined, options)}`;
  }

  Previous(): void {
    this.moveTo(ShiftAnchor(this.Mode, this.Anchor, -1));
  }

  Next(): void {
    this.moveTo(ShiftAnchor(this.Mode, this.Anchor, 1));
  }

  Today(): void {
    this.moveTo(StartOfDay(new Date()));
  }

  /** Switch layout (a `ModeOptions` key) and persist it as the view's mode. */
  SetMode(key: string): void {
    const mode: CalendarMode = key === 'day' || key === 'week' ? key : 'month';
    this.Mode = mode;
    this._config = { ...this._config, mode };
    this.configChanged.emit(this._config);
    this.layout();
  }

  /** Open the day layout on `day` (from a month cell's "+N more"). */
  GoToDay(day: Date): void {
    this.Anchor = day;
    this.SetMode('day');
  }

  /** Apply and persist a change from the settings sheet. */
  OnSettingsChange(config: CalendarViewConfig): void {
    this.config = config;
    this.configChanged.emit(this._config);
  }

  ItemsFor(day: Date): CalendarItem[] {
    return this.itemsByDay.get(DayKey(day)) ?? [];
  }

  IsToday(day: Date): boolean {
    return DayKey(day) === DayKey(new Date());
  }

  IsFirstDay(item: CalendarItem, day: Date): boolean {
    return DayKey(item.FirstDay) === DayKey(day);
  }

  /** The record's display title. */
  ItemLabel(item: CalendarItem): string {
    const value = this.titleFieldName ? item.Record[this.titleFieldName] : null;
    return value != null && value !== '' ? String(value) : '(untitled)';
  }

  /** The start time, on the item's first day only; empty for a date-only start. */
  ItemTime(item: CalendarItem, day: Date): string {
    if (item.AllDay || !this.IsFirstDay(item, day)) {
      return '';
    }
    return item.Start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  DayHeader(day: Date): string {
    return day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  OnItemClick(item: CalendarItem): void {
    this.recordSelected.emit(item.Record);
  }

  OnItemOpen(item: CalendarItem): void {
    this.recordOpened.emit(item.Record);
  }

  private moveTo(anchor: Date): void {
    this.Anchor = anchor;
    this.layout();
  }

  /** Re-resolve fields and re-place every record (entity, records or config changed). */
  private rebuild(): void {
    const fields = ResolveCalendarFields(this._entity, this._config);
    this.HasDateFields = fields.Start != null;
    this.titleFieldName = this.findTitleField();
    this.items = BuildCalendarItems(this._records, fields.Start, fields.End);
    this.layout();
  }

  /** Recompute the days on screen and the items on each. */
  private layout(): void {
    this.MonthWeeks = this.Mode === 'month' ? GetMonthWeeks(this.Anchor) : [];
    this.VisibleDays = GetVisibleDays(this.Mode, this.Anchor);
    this.itemsByDay = GroupItemsByDay(this.items, this.VisibleDays);
    this.cdr.markForCheck();
  }

  /** The entity's name field, else its first visible text field. */
  private findTitleField(): string | null {
    const entity = this._entity;
    if (!entity) {
      return null;
    }
    if (entity.NameField) {
      return entity.NameField.Name;
    }
    const text = entity.Fields
      .filter((f) => f.TSType === EntityFieldTSType.String && f.DefaultInView && !f.Name.startsWith('__mj_'))
      .sort((a, b) => a.Sequence - b.Sequence);
    return text[0]?.Name ?? null;
  }
}

/** Tree-shaking guard for the dynamically mounted renderer. */
export function LoadCalendarViewRenderer(): void {
  void CalendarViewRendererComponent;
}
