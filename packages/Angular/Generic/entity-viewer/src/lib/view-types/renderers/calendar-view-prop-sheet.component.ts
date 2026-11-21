import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { EntityFieldInfo, EntityInfo } from '@memberjunction/core';
import { IViewPropSheet } from '../view-type.contracts';
import { CalendarMode, CalendarViewConfig, GetCalendarDateFields, ResolveCalendarFields } from './calendar-placement';

/**
 * CalendarViewPropSheetComponent
 * ------------------------------
 * The Calendar view type's configuration sheet ({@link IViewPropSheet}): the start field, the
 * optional end field, and the layout the view opens in. Emits the full config on every change.
 *
 * Inputs/outputs use the camelCase names the {@link IViewPropSheet} contract mandates.
 */
@Component({
  standalone: false,
  selector: 'mj-calendar-view-prop-sheet',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="calendar-prop-sheet">
      <label class="calendar-prop-row">
        <span>Starts on</span>
        <select class="mj-input" (change)="Patch({ startFieldName: $any($event.target).value })">
          @for (field of DateFields; track field.Name) {
            <option [value]="field.Name" [selected]="field.Name === StartFieldName">{{ field.DisplayNameOrName }}</option>
          }
        </select>
      </label>

      <label class="calendar-prop-row">
        <span>Ends on</span>
        <select class="mj-input" (change)="Patch({ endFieldName: $any($event.target).value || undefined })">
          <option value="" [selected]="!EndFieldName">(none: one day)</option>
          @for (field of DateFields; track field.Name) {
            @if (field.Name !== StartFieldName) {
              <option [value]="field.Name" [selected]="field.Name === EndFieldName">{{ field.DisplayNameOrName }}</option>
            }
          }
        </select>
      </label>

      <label class="calendar-prop-row">
        <span>Opens in</span>
        <select class="mj-input" (change)="Patch({ mode: $any($event.target).value })">
          <option value="day" [selected]="Mode === 'day'">Day</option>
          <option value="week" [selected]="Mode === 'week'">Week</option>
          <option value="month" [selected]="Mode === 'month'">Month</option>
        </select>
      </label>
    </div>
  `,
  styles: [`
    .calendar-prop-sheet { display: flex; flex-wrap: wrap; gap: 12px; padding: 12px; }
    .calendar-prop-row { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--mj-text-secondary); min-width: 160px; }
  `],
})
export class CalendarViewPropSheetComponent implements IViewPropSheet<CalendarViewConfig> {
  private _entity: EntityInfo | null = null;
  /** The entity whose date fields are offered. */
  @Input()
  set entity(value: EntityInfo | null) {
    this._entity = value;
    this.DateFields = GetCalendarDateFields(value);
  }
  get entity(): EntityInfo | null {
    return this._entity;
  }

  /** The current configuration. */
  @Input() config: CalendarViewConfig = {};

  /** Emitted with the full updated configuration on every change. */
  @Output() configChange = new EventEmitter<CalendarViewConfig>();

  /** The entity's date fields, in the order the calendar falls back through them. */
  public DateFields: EntityFieldInfo[] = [];

  /** The effective start field (the configured one, or the default the calendar uses). */
  get StartFieldName(): string {
    return ResolveCalendarFields(this._entity, this.config ?? {}).Start?.Name ?? '';
  }

  /** The effective end field, or '' for none. */
  get EndFieldName(): string {
    return ResolveCalendarFields(this._entity, this.config ?? {}).End?.Name ?? '';
  }

  /** The layout the view opens in. */
  get Mode(): CalendarMode {
    return this.config?.mode ?? 'month';
  }

  /** Apply a partial change and emit the full config. */
  Patch(change: Partial<CalendarViewConfig>): void {
    this.config = { ...this.config, ...change };
    this.configChange.emit(this.config);
  }
}
