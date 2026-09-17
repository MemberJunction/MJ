import { AfterViewInit, Component, Input, Output, EventEmitter, forwardRef, HostBinding, ElementRef, ViewChild, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import { CalendarDay, WEEK_DAYS, BuildCalendarWeeks, FormatDate, GetMonthYearLabel } from '../calendar/calendar-utils';
import { MJNamedControlBase } from '../a11y/named-control.base';
import { warnIfUnnamed } from '../a11y/unnamed-control-guard';

/**
 * mj-datepicker — Date picker with calendar popup. Replaces `<kendo-datepicker>`.
 *
 * Without an accessible name the date field announces as "edit, blank" and its calendar popup as a
 * generic "Calendar" — so a form with a start date and an end date presents two identical grids
 * (WCAG 2.1 4.1.2). Use {@link MJNamedControlBase.AriaLabelledBy} when a visible label exists,
 * {@link MJNamedControlBase.AriaLabel} when none does; the toggle button and the calendar take
 * their names from the same source. The field is a real `<input>`, so
 * {@link MJNamedControlBase.InputId} IS a valid `<label for>` target.
 *
 * @example
 * ```html
 * <mj-datepicker AriaLabel="Due date" [(ngModel)]="dueDate" [Min]="minDate" />
 * ```
 */
@Component({
  selector: 'mj-datepicker',
  standalone: true,
  imports: [OverlayModule],
  template: `
    <div class="mj-datepicker" #trigger cdkOverlayOrigin #overlayOrigin="cdkOverlayOrigin"
      [class.mj-datepicker--disabled]="IsDisabled">
      <input #dateInput class="mj-input mj-datepicker-input" type="text"
        [attr.id]="InputId || null"
        [attr.aria-label]="AriaLabel || null"
        [attr.aria-labelledby]="AriaLabelledBy || null"
        [attr.aria-describedby]="AriaDescribedBy || null"
        [placeholder]="Placeholder" [disabled]="IsDisabled" [value]="DisplayValue"
        (input)="OnInputChange($event)" (blur)="OnBlur()" (keydown)="OnKeyDown($event)" />
      <!--
        The fixed words live in hidden spans rather than in concatenated strings so the
        AriaLabelledBy path can name the toggle and the calendar from the same visible label that
        names the field: aria-labelledby takes an ID LIST, so the word plus the label's own text is
        composed by the accessibility tree without this component ever seeing that text. The
        calendar's word sits here, outside the overlay, because ids resolve document-wide.
        A hidden node that is DIRECTLY referenced by aria-labelledby is still included in the name
        (accname §4.1), so aria-hidden keeps the word out of the reading order without costing the
        composed name.
      -->
      <span class="mj-datepicker-sr-only" aria-hidden="true" [attr.id]="SecondaryWordId('toggle-word')">Open calendar for</span>
      <span class="mj-datepicker-sr-only" aria-hidden="true" [attr.id]="SecondaryWordId('calendar-word')">Calendar for</span>
      <button type="button" class="mj-datepicker-toggle" tabindex="-1" [disabled]="IsDisabled"
        (click)="Toggle()"
        [attr.aria-labelledby]="ToggleLabelledBy || null"
        [attr.aria-label]="ToggleLabelledBy ? null : ToggleLabel">
        <i class="fa-solid fa-calendar"></i>
      </button>
    </div>
    <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="overlayOrigin"
      [cdkConnectedOverlayOpen]="IsOpen" [cdkConnectedOverlayPositions]="Positions"
      [cdkConnectedOverlayHasBackdrop]="true" cdkConnectedOverlayBackdropClass="mj-dropdown-backdrop"
      (backdropClick)="Close()" (detach)="Close()">
      <div class="mj-calendar" role="grid"
        [attr.aria-labelledby]="CalendarLabelledBy || null"
        [attr.aria-label]="CalendarLabelledBy ? null : CalendarLabel">
        <div class="mj-calendar-header">
          <button type="button" (click)="PreviousMonth()" aria-label="Previous month" class="mj-calendar-nav">
            <i class="fa-solid fa-chevron-left"></i></button>
          <span class="mj-calendar-title">{{ MonthYearLabel }}</span>
          <button type="button" (click)="NextMonth()" aria-label="Next month" class="mj-calendar-nav">
            <i class="fa-solid fa-chevron-right"></i></button>
        </div>
        <div class="mj-calendar-weekdays" role="row">
          @for (day of WeekDays; track day) { <span class="mj-calendar-weekday" role="columnheader">{{ day }}</span> }
        </div>
        @for (week of Weeks; track $index) {
          <div class="mj-calendar-row" role="row">
            @for (day of week; track day.date.getTime()) {
              <button type="button" class="mj-calendar-day" role="gridcell"
                [class.mj-calendar-day--selected]="IsSelectedDay(day)"
                [class.mj-calendar-day--today]="day.isToday"
                [class.mj-calendar-day--other-month]="!day.isCurrentMonth"
                [disabled]="IsOutOfRange(day)" [attr.aria-selected]="IsSelectedDay(day)"
                (click)="SelectDate(day)">{{ day.dayNumber }}</button>
            }
          </div>
        }
        <div class="mj-calendar-footer">
          <button type="button" class="mj-calendar-today" (click)="SelectToday()">Today</button>
        </div>
      </div>
    </ng-template>
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MJDatepickerComponent), multi: true }]
})
export class MJDatepickerComponent extends MJNamedControlBase implements ControlValueAccessor, AfterViewInit, OnDestroy {
  @Input() Min: Date | null = null;
  @Input() Max: Date | null = null;
  @Input() Format = 'MM/dd/yyyy';
  @Input() Placeholder = '';
  /**
   * Host-driven disable. Composed with Angular Forms' `setDisabledState()` into `IsDisabled`
   * (the actual gate) — see `syncDisabled`. A setter, not a bare field, because this input is
   * routinely bound to an expression that changes over the control's lifetime, and the gate has
   * to follow it every time.
   */
  @Input()
  set Disabled(value: boolean) { this.disabledInput = value; this.syncDisabled(); }
  get Disabled(): boolean { return this.disabledInput; }
  @Output() ValueChange = new EventEmitter<Date | null>();
  @ViewChild('trigger') private triggerEl!: ElementRef<HTMLElement>;
  @ViewChild('dateInput') private dateInputEl: ElementRef<HTMLInputElement> | undefined;
  @HostBinding('class.mj-datepicker-host') readonly hostClass = true;
  private cdr = inject(ChangeDetectorRef);

  IsOpen = false; IsDisabled = false; DisplayValue = '';
  Weeks: CalendarDay[][] = []; WeekDays = WEEK_DAYS;
  Positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' }
  ];
  private viewDate = new Date();
  private selectedDate: Date | null = null;
  private onChange: (value: Date | null) => void = () => {};
  private onTouched: () => void = () => {};

  get MonthYearLabel(): string { return GetMonthYearLabel(this.viewDate); }

  /** `aria-labelledby` id list for the toggle button when a VISIBLE label names the field. */
  get ToggleLabelledBy(): string { return this.SecondaryLabelledBy('toggle-word'); }

  /** `aria-label` for the toggle button in the no-visible-label case. */
  get ToggleLabel(): string { return this.SecondaryLabel('Open calendar for', 'Open calendar'); }

  /** `aria-labelledby` id list for the calendar grid when a VISIBLE label names the field. */
  get CalendarLabelledBy(): string { return this.SecondaryLabelledBy('calendar-word'); }

  /** `aria-label` for the calendar grid in the no-visible-label case. */
  get CalendarLabel(): string { return this.SecondaryLabel('Calendar for', 'Calendar'); }

  ngAfterViewInit(): void { warnIfUnnamed(this.dateInputEl?.nativeElement, 'mj-datepicker'); }

  Toggle(): void { if (this.IsDisabled) return; this.IsOpen ? this.Close() : this.Open(); }
  Open(): void {
    if (this.IsDisabled || this.IsOpen) return;
    this.viewDate = this.selectedDate ? new Date(this.selectedDate) : new Date();
    this.Weeks = BuildCalendarWeeks(this.viewDate); this.IsOpen = true; this.cdr.detectChanges();
  }
  Close(): void { if (!this.IsOpen) return; this.IsOpen = false; this.cdr.detectChanges(); }

  /** Backing field for the `Disabled` input. */
  private disabledInput = false;
  /** The forms-driven disabled state, kept SEPARATE so neither source can stomp the other. */
  private formDisabled = false;

  /**
   * Recompute the gate from both of its sources. Called whenever either changes.
   *
   * `IsDisabled` is derived state, and the only thing that assigned it was `setDisabledState()`.
   * The forms-driven half was in fact fine — `setUpControl` also wires `registerOnDisabledChange`,
   * so that hook fires on every `control.disable()`/`enable()`, not just at registration. What had
   * no recompute path at all was the `Disabled` @Input: a plain field, so the gate froze at
   * whatever the first compose produced and every later change to the input was dropped.
   *
   * Closes the calendar directly rather than via `Close()`: this can run from an @Input setter,
   * i.e. DURING the parent's CD pass, where a nested `detectChanges()` trips NG0100.
   */
  private syncDisabled(): void {
    const disabled = this.disabledInput || this.formDisabled;
    if (disabled === this.IsDisabled) return;
    this.IsDisabled = disabled;
    if (disabled) this.IsOpen = false;
    this.cdr.markForCheck();
  }
  PreviousMonth(): void { this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() - 1, 1); this.Weeks = BuildCalendarWeeks(this.viewDate); }
  NextMonth(): void { this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + 1, 1); this.Weeks = BuildCalendarWeeks(this.viewDate); }

  SelectDate(day: CalendarDay): void {
    if (this.IsOutOfRange(day)) return;
    this.selectedDate = day.date; this.DisplayValue = FormatDate(day.date);
    this.onChange(day.date); this.ValueChange.emit(day.date); this.Close();
  }
  SelectToday(): void {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    this.selectedDate = today; this.DisplayValue = FormatDate(today);
    this.onChange(today); this.ValueChange.emit(today); this.Close();
  }
  IsSelectedDay(day: CalendarDay): boolean {
    if (!this.selectedDate) return false;
    return day.date.getFullYear() === this.selectedDate.getFullYear() && day.date.getMonth() === this.selectedDate.getMonth() && day.date.getDate() === this.selectedDate.getDate();
  }
  IsOutOfRange(day: CalendarDay): boolean {
    if (this.Min && day.date < this.Min) return true;
    if (this.Max && day.date > this.Max) return true;
    return false;
  }
  OnInputChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value; this.DisplayValue = value;
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) { this.selectedDate = parsed; this.onChange(parsed); this.ValueChange.emit(parsed); }
  }
  OnBlur(): void { this.onTouched(); }
  OnKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.Close();
    else if (event.key === 'Enter' && !this.IsOpen) this.Open();
  }
  writeValue(value: Date | string | null): void {
    if (value == null) { this.selectedDate = null; this.DisplayValue = ''; }
    else { const d = typeof value === 'string' ? new Date(value) : value; if (!isNaN(d.getTime())) { this.selectedDate = d; this.DisplayValue = FormatDate(d); } }
  }
  registerOnChange(fn: (value: Date | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.formDisabled = isDisabled; this.syncDisabled(); }
  ngOnDestroy(): void { this.Close(); }
}
