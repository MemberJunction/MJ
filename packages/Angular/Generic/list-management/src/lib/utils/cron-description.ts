const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Describes the common shapes of a five-field cron expression in words: "Daily at 2:00 am",
 * "Every hour at :15", "Mondays at 6:30 am", "Weekdays at 8:00 am". Anything else comes back as
 * the expression itself, so the description is never wrong, only sometimes technical.
 */
export function DescribeCron(cron: string | null | undefined): string {
  const fields = cron?.trim().split(/\s+/) ?? [];
  if (fields.length !== 5) return cron?.trim() || 'No schedule';
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  if (!isNumber(minute) || dayOfMonth !== '*' || month !== '*') return cron!.trim();

  if (hour === '*' && dayOfWeek === '*') return `Every hour at :${minute.padStart(2, '0')}`;
  if (!isNumber(hour)) return cron!.trim();

  const time = FormatClockTime(Number(hour), Number(minute));
  if (dayOfWeek === '*') return `Daily at ${time}`;
  if (dayOfWeek === '1-5') return `Weekdays at ${time}`;
  if (isNumber(dayOfWeek) && Number(dayOfWeek) <= 7) return `${WEEKDAYS[Number(dayOfWeek) % 7]}s at ${time}`;
  return cron!.trim();
}

/** 0–23 hours and 0–59 minutes as "2:00 am" / "8:30 pm". */
export function FormatClockTime(hour: number, minute: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function isNumber(field: string): boolean {
  return /^\d+$/.test(field);
}
