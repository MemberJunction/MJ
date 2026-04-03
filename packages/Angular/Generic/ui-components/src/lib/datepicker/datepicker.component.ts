import { Component, Input, Output, EventEmitter, forwardRef, HostBinding, ElementRef, ViewChild, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';
import { CalendarDay, WEEK_DAYS, BuildCalendarWeeks, FormatDate, GetMonthYearLabel } from '../calendar/calendar-utils';

/**
 * mj-datepicker — Date picker with calendar popup. Replaces `<kendo-datepicker>`.
 */
@Component({
  selector: 'mj-datepicker',
  standalone: true,
  imports: [OverlayModule],
  template: `
    <div class="mj-datepicker" #trigger cdkOverlayOrigin #overlayOrigin="cdkOverlayOrigin"
      [class.mj-datepicker--disabled]="IsDisabled">
      <input #dateInput class="mj-input mj-datepicker-input" type="text"
        [placeholder]="Placeholder" [disabled]="IsDisabled" [value]="DisplayValue"
        (input)="OnInputChange($event)" (blur)="OnBlur()" (keydown)="OnKeyDown($event)" />
      <button type="button" class="mj-datepicker-toggle" tabindex="-1" [disabled]="IsDisabled"
        (click)="Toggle()" aria-label="Open calendar">
        <i class="fa-solid fa-calendar"></i>
      </button>
    </div>
    <ng-template cdkConnectedOverlay [cdkConnectedOverlayOrigin]="overlayOrigin"
      [cdkConnectedOverlayOpen]="IsOpen" [cdkConnectedOverlayPositions]="Positions"
      [cdkConnectedOverlayHasBackdrop]="true" cdkConnectedOverlayBackdropClass="mj-dropdown-backdrop"
      (backdropClick)="Close()" (detach)="Close()">
      <div class="mj-calendar" role="grid" aria-label="Calendar">
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
export class MJDatepickerComponent implements ControlValueAccessor, OnDestroy {
  @Input() Min: Date | null = null;
  @Input() Max: Date | null = null;
  @Input() Format = 'MM/dd/yyyy';
  @Input() Placeholder = '';
  @Input() Disabled = false;
  @Output() ValueChange = new EventEmitter<Date | null>();
  @ViewChild('trigger') private triggerEl!: ElementRef<HTMLElement>;
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

  Toggle(): void { if (this.IsDisabled) return; this.IsOpen ? this.Close() : this.Open(); }
  Open(): void {
    if (this.IsDisabled || this.IsOpen) return;
    this.viewDate = this.selectedDate ? new Date(this.selectedDate) : new Date();
    this.Weeks = BuildCalendarWeeks(this.viewDate); this.IsOpen = true; this.cdr.detectChanges();
  }
  Close(): void { if (!this.IsOpen) return; this.IsOpen = false; this.cdr.detectChanges(); }
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
  setDisabledState(isDisabled: boolean): void { this.IsDisabled = isDisabled || this.Disabled; }
  ngOnDestroy(): void { this.Close(); }
}
