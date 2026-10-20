import * as d3 from 'd3';

/** One day in milliseconds: the width at or above which a series is treated as daily buckets. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True when the series is daily buckets. The caller's bucket width wins when it is given: it is the
 * only way to classify a series with a single point, since there is no gap between points to measure.
 * Without it, the gap between the first two points decides.
 */
export function IsDailyBucketSeries(timestamps: readonly Date[], bucketSizeMs?: number | null): boolean {
  if (bucketSizeMs != null) {
    return bucketSizeMs >= DAY_MS;
  }
  if (timestamps.length < 2) {
    return false;
  }
  return timestamps[1].getTime() - timestamps[0].getTime() >= DAY_MS;
}

/**
 * The x scale for a series. Daily buckets are UTC days (AIUsageDaily's DayBucket), so the scale is
 * UTC: its ticks land on UTC midnights, exactly on the bucket boundaries. A local scale ticks at
 * LOCAL midnights, which east of UTC are the previous UTC day — labelled in UTC they read one day
 * early. Sub-daily buckets keep a local scale, since hours are read on the viewer's clock.
 */
export function CreateTimeScale(daily: boolean): d3.ScaleTime<number, number> {
  return daily ? d3.scaleUtc() : d3.scaleTime();
}

/**
 * The x-axis tick label for a series, chosen from its span. Daily buckets are labelled with their
 * UTC date, matching {@link CreateTimeScale}; everything else is labelled on the local clock.
 */
export function AxisTickFormat(timestamps: readonly Date[], daily: boolean): (date: Date) => string {
  if (daily) {
    return d3.utcFormat('%m/%d');
  }
  if (timestamps.length < 2) {
    return d3.timeFormat('%H:%M');
  }
  const hours = (timestamps[timestamps.length - 1].getTime() - timestamps[0].getTime()) / (60 * 60 * 1000);
  if (hours <= 24) {
    return d3.timeFormat('%H:%M');
  }
  if (hours <= 24 * 7) {
    return d3.timeFormat('%a %H:%M');
  }
  if (hours <= 24 * 30) {
    return d3.timeFormat('%m/%d');
  }
  return d3.timeFormat('%m/%d/%y');
}

/** The tooltip's "when" line: a UTC date for a daily bucket, a local date and time otherwise. */
export function TooltipTimeFormat(daily: boolean): (date: Date) => string {
  return daily ? d3.utcFormat('%a %b %d, %Y') : d3.timeFormat('%a %b %d, %H:%M');
}
