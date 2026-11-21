/**
 * Calendar view type — placement logic (pure functions, no Angular).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { BuildCalendarWeeks } from '@memberjunction/ng-ui-components';
import {
  BuildCalendarItem,
  BuildCalendarItems,
  CALENDAR_WEEK_DAYS,
  CalendarField,
  CalendarItem,
  DayKey,
  GetMonthWeeks,
  GetVisibleDays,
  GroupItemsByDay,
  ResolveCalendarFields,
  ShiftAnchor,
  StartOfWeek,
} from '../lib/view-types/renderers/calendar-placement';

const START: CalendarField = { Name: 'StartsAt', DateOnly: false };
const END: CalendarField = { Name: 'EndsAt', DateOnly: false };
const START_DAY: CalendarField = { Name: 'StartDate', DateOnly: true };
const END_DAY: CalendarField = { Name: 'EndDate', DateOnly: true };

/** The local calendar days (yyyymmdd) an item lands on within the given layout. */
function placedDays(item: CalendarItem, days: Date[]): number[] {
  const byDay = GroupItemsByDay([item], days);
  return [...byDay.entries()].filter(([, list]) => list.length > 0).map(([key]) => key);
}

function makeEntity(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000009-0000-0000-0000-000000000009',
    Name: 'Meetings',
    Status: 'Active',
    BaseTable: 'Meeting',
    BaseView: 'vwMeetings',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
      { ID: 'F2', Name: 'Title', Type: 'nvarchar', Length: 100, AllowsNull: false, IsNameField: true, Sequence: 1 },
      { ID: 'F3', Name: 'StartsAt', Type: 'datetimeoffset', AllowsNull: false, DefaultInView: true, Sequence: 3 },
      { ID: 'F4', Name: 'EndsAt', Type: 'datetimeoffset', AllowsNull: true, DefaultInView: true, Sequence: 4 },
      { ID: 'F5', Name: 'DueDate', Type: 'date', AllowsNull: true, DefaultInView: false, Sequence: 2 },
      { ID: 'F6', Name: '__mj_CreatedAt', Type: 'datetimeoffset', AllowsNull: false, DefaultInView: true, Sequence: 0 },
    ],
  });
}

describe('BuildCalendarItem', () => {
  it('places a record by its start and end fields', () => {
    const record = { StartsAt: new Date(2026, 10, 16, 10, 0), EndsAt: new Date(2026, 10, 18, 12, 0) };
    const item = BuildCalendarItem(record, START, END)!;
    const week = GetVisibleDays('week', new Date(2026, 10, 16));
    expect(item.Record).toBe(record);
    expect(placedDays(item, week)).toEqual([20261116, 20261117, 20261118]);
  });

  it('puts a record on its start day when there is no end field', () => {
    const item = BuildCalendarItem({ StartsAt: new Date(2026, 10, 16, 10, 0), EndsAt: new Date(2026, 10, 18) }, START, null)!;
    expect(placedDays(item, GetVisibleDays('week', new Date(2026, 10, 16)))).toEqual([20261116]);
  });

  it('puts a record on its start day when its end is empty or before its start', () => {
    const week = GetVisibleDays('week', new Date(2026, 10, 16));
    const empty = BuildCalendarItem({ StartsAt: new Date(2026, 10, 17, 9, 0), EndsAt: null }, START, END)!;
    const backwards = BuildCalendarItem({ StartsAt: new Date(2026, 10, 17, 9, 0), EndsAt: new Date(2026, 10, 16) }, START, END)!;
    expect(placedDays(empty, week)).toEqual([20261117]);
    expect(placedDays(backwards, week)).toEqual([20261117]);
  });

  it('treats a timestamp end as exclusive, so a midnight end stays off the next day', () => {
    const item = BuildCalendarItem({ StartsAt: new Date(2026, 10, 16, 22, 0), EndsAt: new Date(2026, 10, 17, 0, 0) }, START, END)!;
    expect(placedDays(item, GetVisibleDays('week', new Date(2026, 10, 16)))).toEqual([20261116]);
  });

  it('treats a date-only end as inclusive', () => {
    const item = BuildCalendarItem({ StartDate: '2026-11-16', EndDate: '2026-11-17' }, START_DAY, END_DAY)!;
    expect(placedDays(item, GetVisibleDays('week', new Date(2026, 10, 16)))).toEqual([20261116, 20261117]);
    expect(item.AllDay).toBe(true);
  });

  it('leaves out records with no valid start', () => {
    const items = BuildCalendarItems([{ StartsAt: null }, { StartsAt: 'not a date' }, { StartsAt: new Date(2026, 10, 16) }], START, null);
    expect(items).toHaveLength(1);
    expect(BuildCalendarItems([{ StartsAt: new Date() }], null, null)).toEqual([]);
  });
});

describe('multi-day spans across boundaries', () => {
  it('splits a Saturday-to-Tuesday span across two Monday-first weeks', () => {
    const item = BuildCalendarItem({ StartsAt: new Date(2026, 10, 21, 9, 0), EndsAt: new Date(2026, 10, 24, 17, 0) }, START, END)!;
    expect(placedDays(item, GetVisibleDays('week', new Date(2026, 10, 16)))).toEqual([20261121, 20261122]);
    expect(placedDays(item, GetVisibleDays('week', new Date(2026, 10, 23)))).toEqual([20261123, 20261124]);
  });

  it('spans a month boundary in both months\' grids, clipped to what each grid shows', () => {
    const item = BuildCalendarItem({ StartDate: '2026-10-30', EndDate: '2026-11-02' }, START_DAY, END_DAY)!;
    // October 2026's grid ends on Sunday Nov 1; November's starts on Monday Oct 26.
    expect(placedDays(item, GetVisibleDays('month', new Date(2026, 9, 15)))).toEqual([20261030, 20261031, 20261101]);
    expect(placedDays(item, GetVisibleDays('month', new Date(2026, 10, 15)))).toEqual([20261030, 20261031, 20261101, 20261102]);
  });

  it('orders a day\'s items by start', () => {
    const late = BuildCalendarItem({ StartsAt: new Date(2026, 10, 16, 15, 0) }, START, null)!;
    const early = BuildCalendarItem({ StartsAt: new Date(2026, 10, 16, 8, 0) }, START, null)!;
    const byDay = GroupItemsByDay([late, early], GetVisibleDays('day', new Date(2026, 10, 16)));
    expect(byDay.get(20261116)).toEqual([early, late]);
  });
});

describe('date-only fields in a zone west of UTC', () => {
  const originalTZ = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'America/Los_Angeles';
  });
  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it('keeps a date-only value on its stored day (UTC midnight is the previous evening locally)', () => {
    expect(new Date('2026-11-20T00:00:00.000Z').getDate()).toBe(19); // the zone really is west of UTC
    const fromIso = BuildCalendarItem({ StartDate: '2026-11-20T00:00:00.000Z' }, START_DAY, null)!;
    const fromBare = BuildCalendarItem({ StartDate: '2026-11-20' }, START_DAY, null)!;
    const fromDate = BuildCalendarItem({ StartDate: new Date(Date.UTC(2026, 10, 20)) }, START_DAY, null)!;
    for (const item of [fromIso, fromBare, fromDate]) {
      expect(DayKey(item.FirstDay)).toBe(20261120);
      expect(DayKey(item.LastDay)).toBe(20261120);
    }
  });

  it('still shows a timestamp at its local instant', () => {
    const item = BuildCalendarItem({ StartsAt: '2026-11-20T00:00:00.000Z' }, START, null)!;
    expect(DayKey(item.FirstDay)).toBe(20261119);
  });
});

describe('weeks and the month grid', () => {
  it('starts a week on Monday', () => {
    expect(DayKey(StartOfWeek(new Date(2026, 10, 22)))).toBe(20261116); // Sunday → previous Monday
    expect(DayKey(StartOfWeek(new Date(2026, 10, 16)))).toBe(20261116); // Monday → itself
    const week = GetVisibleDays('week', new Date(2026, 10, 19));
    expect(week.map((d) => d.getDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(CALENDAR_WEEK_DAYS).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  });

  it('builds the month grid from BuildCalendarWeeks, Monday first', () => {
    const anchor = new Date(2026, 10, 15);
    const weeks = GetMonthWeeks(anchor);
    expect(weeks).toEqual(BuildCalendarWeeks(anchor, 1).map((w) => w.map((d) => d.date)));
    expect(weeks.every((w) => w.length === 7 && w[0].getDay() === 1)).toBe(true);
    expect(DayKey(weeks[0][0])).toBe(20261026);
  });

  it('moves by a day, a week, or a month without overflowing short months', () => {
    expect(DayKey(ShiftAnchor('day', new Date(2026, 10, 30), 1))).toBe(20261201);
    expect(DayKey(ShiftAnchor('week', new Date(2026, 10, 16), -1))).toBe(20261109);
    expect(DayKey(ShiftAnchor('month', new Date(2026, 0, 31), 1))).toBe(20260201);
  });
});

describe('ResolveCalendarFields', () => {
  it('defaults the start to the first date field (DefaultInView first, never an __mj_ stamp) and has no end', () => {
    const fields = ResolveCalendarFields(makeEntity(), {});
    expect(fields.Start).toEqual({ Name: 'StartsAt', DateOnly: false });
    expect(fields.End).toBeNull();
  });

  it('uses the configured fields, and knows a SQL date field is date-only', () => {
    const fields = ResolveCalendarFields(makeEntity(), { startFieldName: 'duedate', endFieldName: 'EndsAt' });
    expect(fields.Start).toEqual({ Name: 'DueDate', DateOnly: true });
    expect(fields.End).toEqual({ Name: 'EndsAt', DateOnly: false });
  });

  it('ignores a configured __mj_ stamp and falls back to the entity\'s own date field', () => {
    expect(ResolveCalendarFields(makeEntity(), { startFieldName: '__mj_CreatedAt' }).Start).toEqual({ Name: 'StartsAt', DateOnly: false });
  });

  it('drops an end that is not a date field or is the start itself', () => {
    expect(ResolveCalendarFields(makeEntity(), { endFieldName: 'Title' }).End).toBeNull();
    expect(ResolveCalendarFields(makeEntity(), { startFieldName: 'EndsAt', endFieldName: 'EndsAt' }).End).toBeNull();
  });

  it('has no start for an entity without date fields', () => {
    expect(ResolveCalendarFields(null, {}).Start).toBeNull();
  });
});
