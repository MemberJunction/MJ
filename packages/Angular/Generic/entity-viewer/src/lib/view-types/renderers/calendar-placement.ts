import { EntityFieldInfo, EntityFieldTSType, EntityInfo, IsDateOnlySQLType } from '@memberjunction/core';
import { BuildCalendarWeeks, WEEK_DAYS } from '@memberjunction/ng-ui-components';

/**
 * Calendar view type — placement logic.
 *
 * Pure functions (no Angular) that turn plain record rows into items on calendar days. The
 * renderer only binds what these return. Weeks start on Monday (ISO 8601), the rule the
 * bound-data-access plan fixes for v1. Days are local-time midnights: a timestamp field is an
 * instant shown in the viewer's zone; a SQL `date` field is a calendar day and stays on that
 * day in every zone.
 */

/** The three calendar layouts. */
export type CalendarMode = 'day' | 'week' | 'month';

/**
 * The persisted configuration for the Calendar view type. Keys are camelCase, like every other
 * view type's opaque config blob (Timeline's `dateFieldName`, Map's `renderMode`, the grid's
 * `gridState`), since the host stores them side by side in `DisplayState.viewTypeConfigs`.
 */
export interface CalendarViewConfig {
  /** The date field a record starts on. Defaults to the entity's first date field. */
  startFieldName?: string; // case-violation-ok-legacy-back-compat: persisted view-type config keys are camelCase in every view type (DisplayState.viewTypeConfigs)
  /** Optional date field a record ends on; with it a record spans its days. */
  endFieldName?: string; // case-violation-ok-legacy-back-compat: persisted view-type config keys are camelCase in every view type (DisplayState.viewTypeConfigs)
  /** The layout the view opens in. Defaults to `'month'`. */
  mode?: CalendarMode; // case-violation-ok-legacy-back-compat: persisted view-type config keys are camelCase in every view type (DisplayState.viewTypeConfigs)
}

/** A date field resolved for placement: its name and whether it holds a calendar day. */
export interface CalendarField {
  Name: string;
  DateOnly: boolean;
}

/** A record resolved to the days it covers. */
export interface CalendarItem {
  /** The raw row, emitted as-is on select/open. */
  Record: Record<string, unknown>;
  /** The start: an instant, or local midnight of the stored day for a date-only field. */
  Start: Date;
  /** Local midnight of the first day the item sits on. */
  FirstDay: Date;
  /** Local midnight of the last day the item sits on (inclusive). */
  LastDay: Date;
  /** True when the start field is date-only, so the item has no time of day. */
  AllDay: boolean;
}

/** Day-of-week labels in Monday-first order, from the shared datepicker labels. */
export const CALENDAR_WEEK_DAYS: string[] = [...WEEK_DAYS.slice(1), WEEK_DAYS[0]];

/** Local midnight of `date`'s day. */
export function StartOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** `date`'s day moved by `days` (DST-safe: works on the calendar fields, not milliseconds). */
export function AddDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Local midnight of the Monday that starts `date`'s week. */
export function StartOfWeek(date: Date): Date {
  return AddDays(date, -((date.getDay() + 6) % 7));
}

/** A number unique to a local calendar day (yyyymmdd), used to key days in maps. */
export function DayKey(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/**
 * Parses a field value into a Date. A date-only value arrives as UTC midnight (or a bare
 * `yyyy-mm-dd` string, which JavaScript also reads as UTC); its UTC calendar day becomes local
 * midnight, so it never shifts a day west of Greenwich. Returns null for empty or invalid values.
 */
export function ToCalendarDate(value: unknown, dateOnly: boolean): Date | null {
  if (value == null || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null;
  if (!date || isNaN(date.getTime())) {
    return null;
  }
  return dateOnly ? new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) : date;
}

/**
 * True for a date field a calendar can place records by. MJ's `__mj_CreatedAt` / `__mj_UpdatedAt`
 * stamps don't count: every entity has them, so counting them would offer Calendar everywhere and
 * open it on "created at". Nor does a `time` column: it maps to a Date but holds no day.
 */
export function IsCalendarDateField(field: EntityFieldInfo): boolean {
  const type = (field.Type ?? '').trim().toLowerCase();
  const isTimeOnly = type === 'time' || type.startsWith('time with');
  return field.TSType === EntityFieldTSType.Date && !isTimeOnly && !field.Name.toLowerCase().startsWith('__mj_');
}

/** The entity's date fields: `DefaultInView` ones first, each group by Sequence (Timeline's order). */
export function GetCalendarDateFields(entity: EntityInfo | null): EntityFieldInfo[] {
  const dateFields = entity?.Fields.filter(IsCalendarDateField) ?? [];
  const bySequence = (a: EntityFieldInfo, b: EntityFieldInfo) => a.Sequence - b.Sequence;
  return [...dateFields.filter((f) => f.DefaultInView).sort(bySequence), ...dateFields.filter((f) => !f.DefaultInView).sort(bySequence)];
}

/**
 * Resolves the configured start and end fields against the entity. A start that is missing or
 * not a date field falls back to the first date field; an end that is missing, not a date field,
 * or the same as the start is dropped (records then sit on their start).
 */
export function ResolveCalendarFields(entity: EntityInfo | null, config: CalendarViewConfig): { Start: CalendarField | null; End: CalendarField | null } {
  const dateFields = GetCalendarDateFields(entity);
  const find = (name?: string) => (name ? dateFields.find((f) => f.Name.toLowerCase() === name.toLowerCase()) : undefined);
  const start = find(config.startFieldName) ?? dateFields[0];
  const end = find(config.endFieldName);
  const toField = (f: EntityFieldInfo | undefined): CalendarField | null => (f ? { Name: f.Name, DateOnly: IsDateOnlySQLType(f.Type) } : null);
  return { Start: toField(start), End: end && end !== start ? toField(end) : null };
}

/**
 * Places one record. Returns null when it has no valid start. With no end (no end field, an
 * empty value, or an end before the start) it sits on its start day. A date-only end is
 * inclusive; a timestamp end is exclusive, so a meeting ending at midnight stays off the next day.
 */
export function BuildCalendarItem(record: Record<string, unknown>, start: CalendarField, end: CalendarField | null): CalendarItem | null {
  const startDate = ToCalendarDate(record[start.Name], start.DateOnly);
  if (!startDate) {
    return null;
  }
  const firstDay = StartOfDay(startDate);
  const endDate = end ? ToCalendarDate(record[end.Name], end.DateOnly) : null;
  let lastDay = firstDay;
  if (end && endDate && endDate.getTime() > startDate.getTime()) {
    lastDay = end.DateOnly ? StartOfDay(endDate) : StartOfDay(new Date(endDate.getTime() - 1));
  }
  return { Record: record, Start: startDate, FirstDay: firstDay, LastDay: lastDay, AllDay: start.DateOnly };
}

/** Places every record that has a valid start; records without one are left out. */
export function BuildCalendarItems(records: Record<string, unknown>[], start: CalendarField | null, end: CalendarField | null): CalendarItem[] {
  if (!start) {
    return [];
  }
  const items: CalendarItem[] = [];
  for (const record of records) {
    const item = BuildCalendarItem(record, start, end);
    if (item) {
      items.push(item);
    }
  }
  return items;
}

/** The month grid's weeks (Monday-first) around `anchor`, from the shared `BuildCalendarWeeks`. */
export function GetMonthWeeks(anchor: Date): Date[][] {
  return BuildCalendarWeeks(anchor, 1).map((week) => week.map((day) => day.date));
}

/** The days a layout shows: one day, the Monday-to-Sunday week, or the month grid. */
export function GetVisibleDays(mode: CalendarMode, anchor: Date): Date[] {
  if (mode === 'day') {
    return [StartOfDay(anchor)];
  }
  if (mode === 'week') {
    const monday = StartOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => AddDays(monday, i));
  }
  return GetMonthWeeks(anchor).flat();
}

/**
 * Groups items onto the given days (keyed by {@link DayKey}). A spanning item lands on every
 * visible day it covers; each day's items are ordered by start. Work per item is bounded by the
 * visible range, so a long span costs no more than the days on screen.
 */
export function GroupItemsByDay(items: CalendarItem[], days: Date[]): Map<number, CalendarItem[]> {
  const byDay = new Map<number, CalendarItem[]>(days.map((d) => [DayKey(d), []]));
  if (days.length === 0) {
    return byDay;
  }
  const rangeFirst = days[0];
  const rangeLast = days[days.length - 1];
  for (const item of items) {
    if (item.LastDay < rangeFirst || item.FirstDay > rangeLast) {
      continue;
    }
    const last = item.LastDay < rangeLast ? item.LastDay : rangeLast;
    for (let day = item.FirstDay > rangeFirst ? item.FirstDay : rangeFirst; day <= last; day = AddDays(day, 1)) {
      byDay.get(DayKey(day))?.push(item);
    }
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.Start.getTime() - b.Start.getTime());
  }
  return byDay;
}

/** Moves the anchor one layout back (-1) or forward (1): a day, a week, or a month. */
export function ShiftAnchor(mode: CalendarMode, anchor: Date, step: -1 | 1): Date {
  if (mode === 'month') {
    return new Date(anchor.getFullYear(), anchor.getMonth() + step, 1);
  }
  return AddDays(anchor, mode === 'week' ? 7 * step : step);
}
