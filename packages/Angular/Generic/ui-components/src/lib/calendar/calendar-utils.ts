/**
 * Shared calendar utilities for mj-datepicker and mj-datetime-picker.
 */

export interface CalendarDay {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * The weeks (rows of 7 days) covering `viewDate`'s month, padded with days from the
 * neighbouring months. `weekStartsOn` is the first column's weekday (0 = Sunday, the
 * datepicker's default; 1 = Monday, ISO 8601).
 */
export function BuildCalendarWeeks(viewDate: Date, weekStartsOn: 0 | 1 = 0): CalendarDay[][] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startDate = new Date(year, month, 1);
  startDate.setDate(startDate.getDate() - ((startDate.getDay() - weekStartsOn + 7) % 7));
  const weeks: CalendarDay[][] = [];
  const current = new Date(startDate);
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(current); date.setHours(0, 0, 0, 0);
      week.push({ date, dayNumber: date.getDate(), isCurrentMonth: date.getMonth() === month, isToday: date.getTime() === today.getTime() });
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
    if (current.getMonth() !== month && current.getDay() === weekStartsOn) break;
  }
  return weeks;
}

export function FormatDate(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

export function FormatDateTime(date: Date): string {
  return `${FormatDate(date)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function GetMonthYearLabel(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}
