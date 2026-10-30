/**
 * @module utc-day
 *
 * Day arithmetic in UTC: every decision date, window end, cutoff and carve date is a UTC midnight, so a day never
 * depends on the host's time zone. Browser-safe (no node imports).
 */

/** Milliseconds in one UTC day. */
export const MS_PER_DAY = 86_400_000;

/** A cell value as a row read returns it. */
export type CellValue = string | number | boolean | Date | null | undefined;

/** UTC-day conversion and arithmetic (static members on one owner class). */
export class UtcDay {
  /**
   * The UTC day a value denotes: a `yyyy-mm-dd…` string by its date part (a time and zone after it are ignored, as
   * the reference builder reads them), a Date by its UTC date. Null for any other value, for a string without such a
   * date part, and for a date part that names no calendar day (`2024-02-30`, `2024-13-01`), which is never rolled
   * over into another day.
   */
  public static ToUtcDay(value: CellValue): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }
    if (typeof value !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (m === null) return null;
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  }

  /** `day` plus `days` whole days (negative moves back). */
  public static AddUtcDays(day: Date, days: number): Date {
    return new Date(day.getTime() + days * MS_PER_DAY);
  }

  /** The `yyyy-mm-dd` form of a UTC day. */
  public static UtcDayIso(day: Date): string {
    return day.toISOString().slice(0, 10);
  }
}
