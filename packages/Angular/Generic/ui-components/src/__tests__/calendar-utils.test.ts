import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BuildCalendarWeeks,
  FormatDate,
  FormatDateTime,
  GetMonthYearLabel,
  WEEK_DAYS,
  MONTH_NAMES,
  CalendarDay
} from '../lib/calendar/calendar-utils';

describe('calendar-utils', () => {
  describe('WEEK_DAYS', () => {
    it('should contain 7 day abbreviations starting with Sunday', () => {
      expect(WEEK_DAYS).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
      expect(WEEK_DAYS).toHaveLength(7);
    });
  });

  describe('MONTH_NAMES', () => {
    it('should contain 12 month names starting with January', () => {
      expect(MONTH_NAMES).toHaveLength(12);
      expect(MONTH_NAMES[0]).toBe('January');
      expect(MONTH_NAMES[11]).toBe('December');
    });
  });

  describe('BuildCalendarWeeks', () => {
    it('should return an array of weeks, each with 7 days', () => {
      const weeks = BuildCalendarWeeks(new Date(2024, 0, 15)); // Jan 2024
      expect(weeks.length).toBeGreaterThanOrEqual(4);
      expect(weeks.length).toBeLessThanOrEqual(6);
      for (const week of weeks) {
        expect(week).toHaveLength(7);
      }
    });

    it('should generate correct grid for January 2024 (starts on Monday)', () => {
      // Jan 1, 2024 is a Monday => grid starts on Sunday Dec 31, 2023
      const weeks = BuildCalendarWeeks(new Date(2024, 0, 1));
      const firstDay = weeks[0][0];
      expect(firstDay.date.getDay()).toBe(0); // first cell is always a Sunday
      expect(firstDay.dayNumber).toBe(31); // Dec 31
      expect(firstDay.isCurrentMonth).toBe(false);

      // Second cell should be Jan 1
      const jan1 = weeks[0][1];
      expect(jan1.dayNumber).toBe(1);
      expect(jan1.isCurrentMonth).toBe(true);

      // All current-month days should have dayNumber 1-31
      const currentMonthDays = weeks.flat().filter(d => d.isCurrentMonth);
      expect(currentMonthDays).toHaveLength(31);
      expect(currentMonthDays[0].dayNumber).toBe(1);
      expect(currentMonthDays[currentMonthDays.length - 1].dayNumber).toBe(31);
    });

    it('should generate correct grid for February 2024 (leap year, starts on Thursday)', () => {
      // Feb 1, 2024 is a Thursday => grid starts on Sunday Jan 28
      const weeks = BuildCalendarWeeks(new Date(2024, 1, 1));
      const firstDay = weeks[0][0];
      expect(firstDay.date.getDay()).toBe(0); // Sunday
      expect(firstDay.isCurrentMonth).toBe(false);

      const currentMonthDays = weeks.flat().filter(d => d.isCurrentMonth);
      expect(currentMonthDays).toHaveLength(29); // leap year
    });

    it('should generate correct grid for February 2023 (non-leap year)', () => {
      const weeks = BuildCalendarWeeks(new Date(2023, 1, 1));
      const currentMonthDays = weeks.flat().filter(d => d.isCurrentMonth);
      expect(currentMonthDays).toHaveLength(28);
    });

    it('should handle month starting on Sunday (September 2024)', () => {
      // Sep 1, 2024 is a Sunday => grid starts exactly on Sep 1
      const weeks = BuildCalendarWeeks(new Date(2024, 8, 1));
      const firstDay = weeks[0][0];
      expect(firstDay.dayNumber).toBe(1);
      expect(firstDay.isCurrentMonth).toBe(true);
      expect(firstDay.date.getDay()).toBe(0); // Sunday
    });

    it('should handle month starting on Saturday (June 2024)', () => {
      // Jun 1, 2024 is a Saturday => grid starts on Sunday May 26
      const weeks = BuildCalendarWeeks(new Date(2024, 5, 1));
      const firstDay = weeks[0][0];
      expect(firstDay.isCurrentMonth).toBe(false);
      expect(firstDay.date.getDay()).toBe(0); // Sunday

      // Saturday (index 6) of first week should be June 1
      const sat = weeks[0][6];
      expect(sat.dayNumber).toBe(1);
      expect(sat.isCurrentMonth).toBe(true);
    });

    it('should handle December boundary correctly (December 2024)', () => {
      const weeks = BuildCalendarWeeks(new Date(2024, 11, 1));
      const currentMonthDays = weeks.flat().filter(d => d.isCurrentMonth);
      expect(currentMonthDays).toHaveLength(31);
      expect(currentMonthDays[currentMonthDays.length - 1].dayNumber).toBe(31);

      // Non-current-month trailing days should be January of next year
      const lastWeek = weeks[weeks.length - 1];
      const trailingDays = lastWeek.filter(d => !d.isCurrentMonth);
      for (const d of trailingDays) {
        expect(d.date.getMonth()).toBe(0); // January
        expect(d.date.getFullYear()).toBe(2025);
      }
    });

    it('should handle year transition (January 2025)', () => {
      const weeks = BuildCalendarWeeks(new Date(2025, 0, 1));
      // Leading non-current-month days should be December 2024
      const leadingDays = weeks[0].filter(d => !d.isCurrentMonth);
      for (const d of leadingDays) {
        expect(d.date.getMonth()).toBe(11); // December
        expect(d.date.getFullYear()).toBe(2024);
      }
    });

    it('should mark today correctly', () => {
      const today = new Date();
      const weeks = BuildCalendarWeeks(today);
      const todayCell = weeks.flat().find(d =>
        d.date.getFullYear() === today.getFullYear() &&
        d.date.getMonth() === today.getMonth() &&
        d.date.getDate() === today.getDate()
      );
      expect(todayCell).toBeDefined();
      expect(todayCell!.isToday).toBe(true);

      // Other days in same month should not be today
      const otherDays = weeks.flat().filter(d =>
        d.isCurrentMonth && d.dayNumber !== today.getDate()
      );
      for (const d of otherDays) {
        expect(d.isToday).toBe(false);
      }
    });

    it('should not mark today when viewing a different month', () => {
      // View a month far in the past
      const weeks = BuildCalendarWeeks(new Date(2000, 0, 1));
      const anyToday = weeks.flat().some(d => d.isToday);
      expect(anyToday).toBe(false);
    });

    it('should set hours to 0 for all date objects', () => {
      const weeks = BuildCalendarWeeks(new Date(2024, 5, 15));
      for (const week of weeks) {
        for (const day of week) {
          expect(day.date.getHours()).toBe(0);
          expect(day.date.getMinutes()).toBe(0);
          expect(day.date.getSeconds()).toBe(0);
          expect(day.date.getMilliseconds()).toBe(0);
        }
      }
    });

    it('should always start each week on Sunday (day 0)', () => {
      const weeks = BuildCalendarWeeks(new Date(2024, 3, 1)); // April 2024
      for (const week of weeks) {
        expect(week[0].date.getDay()).toBe(0); // Sunday
        expect(week[6].date.getDay()).toBe(6); // Saturday
      }
    });
  });

  describe('FormatDate', () => {
    it('should format a date as MM/DD/YYYY', () => {
      expect(FormatDate(new Date(2024, 0, 15))).toBe('01/15/2024');
    });

    it('should pad single-digit month and day with leading zeros', () => {
      expect(FormatDate(new Date(2024, 2, 5))).toBe('03/05/2024');
    });

    it('should not pad double-digit month and day', () => {
      expect(FormatDate(new Date(2024, 11, 25))).toBe('12/25/2024');
    });

    it('should handle first day of year', () => {
      expect(FormatDate(new Date(2024, 0, 1))).toBe('01/01/2024');
    });

    it('should handle last day of year', () => {
      expect(FormatDate(new Date(2024, 11, 31))).toBe('12/31/2024');
    });

    it('should handle leap day', () => {
      expect(FormatDate(new Date(2024, 1, 29))).toBe('02/29/2024');
    });
  });

  describe('FormatDateTime', () => {
    it('should format date and time as MM/DD/YYYY HH:MM', () => {
      const date = new Date(2024, 0, 15, 14, 30);
      expect(FormatDateTime(date)).toBe('01/15/2024 14:30');
    });

    it('should pad hours and minutes with leading zeros', () => {
      const date = new Date(2024, 5, 3, 8, 5);
      expect(FormatDateTime(date)).toBe('06/03/2024 08:05');
    });

    it('should handle midnight (00:00)', () => {
      const date = new Date(2024, 0, 1, 0, 0);
      expect(FormatDateTime(date)).toBe('01/01/2024 00:00');
    });

    it('should handle end of day (23:59)', () => {
      const date = new Date(2024, 11, 31, 23, 59);
      expect(FormatDateTime(date)).toBe('12/31/2024 23:59');
    });
  });

  describe('GetMonthYearLabel', () => {
    it('should return "January 2024" for Jan 2024', () => {
      expect(GetMonthYearLabel(new Date(2024, 0, 1))).toBe('January 2024');
    });

    it('should return correct label for every month', () => {
      for (let m = 0; m < 12; m++) {
        const label = GetMonthYearLabel(new Date(2024, m, 1));
        expect(label).toBe(`${MONTH_NAMES[m]} 2024`);
      }
    });

    it('should include the correct year', () => {
      expect(GetMonthYearLabel(new Date(2000, 6, 15))).toBe('July 2000');
      expect(GetMonthYearLabel(new Date(1999, 11, 31))).toBe('December 1999');
    });

    it('should work regardless of the day of month', () => {
      expect(GetMonthYearLabel(new Date(2024, 3, 1))).toBe('April 2024');
      expect(GetMonthYearLabel(new Date(2024, 3, 15))).toBe('April 2024');
      expect(GetMonthYearLabel(new Date(2024, 3, 30))).toBe('April 2024');
    });
  });
});
