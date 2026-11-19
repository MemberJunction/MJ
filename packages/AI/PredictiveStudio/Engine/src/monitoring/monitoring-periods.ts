/**
 * @module monitoring/monitoring-periods
 *
 * `MonitoringPeriods` — the calendar of a monitoring job (UTC): the period containing a day (weeks start on Monday,
 * months on the 1st, quarters on January, April, July and October 1st), the last complete period before a day, and a
 * period's closing day for the label-window rule. Pure.
 */
import { UtcDay } from '@memberjunction/predictive-studio-core';

import type { MonitoringPeriod, PeriodGrain } from './monitoring-seams';

/** The monitoring calendar. */
export class MonitoringPeriods {
  private static readonly MS_PER_DAY = 86_400_000;

  /** The period of `grain` containing the UTC day of `day`. */
  public static Containing(day: Date, grain: PeriodGrain): MonitoringPeriod {
    const d = MonitoringPeriods.utcDay(day);
    if (grain === 'week') {
      const back = (d.getUTCDay() + 6) % 7;
      const start = UtcDay.AddUtcDays(d, -back);
      return { Start: start, End: UtcDay.AddUtcDays(start, 7), Grain: grain };
    }
    const months = grain === 'month' ? 1 : 3;
    const firstMonth = grain === 'month' ? d.getUTCMonth() : Math.floor(d.getUTCMonth() / 3) * 3;
    const start = new Date(Date.UTC(d.getUTCFullYear(), firstMonth, 1));
    return { Start: start, End: new Date(Date.UTC(d.getUTCFullYear(), firstMonth + months, 1)), Grain: grain };
  }

  /** The last period of `grain` that ended on or before the UTC day of `now` (the one before the period containing it). */
  public static LastComplete(now: Date, grain: PeriodGrain): MonitoringPeriod {
    const current = MonitoringPeriods.Containing(now, grain);
    return MonitoringPeriods.Containing(UtcDay.AddUtcDays(current.Start, -1), grain);
  }

  /**
   * The period of `grain` starting on `start`.
   *
   * @throws Error when `start` is not the first day of a period of that grain
   */
  public static Starting(start: Date, grain: PeriodGrain): MonitoringPeriod {
    const p = MonitoringPeriods.Containing(start, grain);
    if (p.Start.getTime() !== MonitoringPeriods.utcDay(start).getTime()) {
      throw new Error(`${UtcDay.UtcDayIso(start)} is not the first day of a ${grain} (that ${grain} starts ${UtcDay.UtcDayIso(p.Start)})`);
    }
    return p;
  }

  /** The period's last day (the decision day whose label window closes last). */
  public static LastDay(period: MonitoringPeriod): Date {
    return new Date(period.End.getTime() - MonitoringPeriods.MS_PER_DAY);
  }

  private static utcDay(day: Date): Date {
    const d = UtcDay.ToUtcDay(day);
    if (d === null) throw new Error(`MonitoringPeriods: '${String(day)}' is not a valid date`);
    return d;
  }
}
