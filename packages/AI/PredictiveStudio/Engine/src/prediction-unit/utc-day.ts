/** Day arithmetic in UTC: every decision date, window end and cutoff is a UTC midnight. */
export const MS_PER_DAY = 86_400_000;

export type CellValue = string | number | boolean | Date | null | undefined;

/** UTC-day conversion and arithmetic (static members on one owner class). */
export class UtcDay {
  /** The UTC day a value denotes: `yyyy-mm-dd…` strings by their date part (as the reference builder reads them), Dates by their UTC date. */
  public static ToUtcDay(value: CellValue): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    }
    if (typeof value === 'string') {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
      if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
    return null;
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
