/**
 * Pure, dependency-free cron helpers: friendly preset (hourly / daily / weekly /
 * monthly) ↔ 5-field cron expression round-tripping, human-readable descriptions,
 * and a lightweight plausibility check. Originally built for the User Routines
 * editor; general-purpose for any schedule-editing UI.
 *
 * NOT a cron engine: for real validation, is-due checks, and next-occurrence math
 * use `CronExpressionHelper` in `@memberjunction/scheduling-engine` (parser-backed;
 * it can't live here without pulling cron-parser + core into MJGlobal).
 * {@link IsPlausibleCronExpression} is only a UI pre-filter, not validation.
 */

/** Which schedule preset a cron expression corresponds to (or 'advanced' when none). */
export type CronPresetKind = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'advanced';

/** Structured schedule the editor binds to; converted to/from a cron expression. */
export interface CronSchedule {
    /** The preset in effect. 'advanced' means Raw is authoritative. */
    Kind: CronPresetKind;
    /** Minute (0-59). Hourly: minute past each hour. Other presets: minute of the run time. */
    Minute: number;
    /** Hour (0-23) for daily / weekly / monthly presets. */
    Hour: number;
    /** Day of week (0-6, 0 = Sunday) for the weekly preset. */
    DayOfWeek: number;
    /** Day of month (1-31) for the monthly preset. */
    DayOfMonth: number;
    /** Raw cron expression — authoritative when Kind === 'advanced'. */
    Raw: string;
}

/** Weekday display names indexed by cron day-of-week value (0 = Sunday). */
export const CRON_DAY_NAMES: readonly string[] = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

/** A fresh default schedule: daily at 9:00 AM. */
export function DefaultCronSchedule(): CronSchedule {
    return { Kind: 'daily', Minute: 0, Hour: 9, DayOfWeek: 1, DayOfMonth: 1, Raw: '' };
}

/** Builds the cron expression for a structured schedule. */
export function BuildCronExpression(schedule: CronSchedule): string {
    switch (schedule.Kind) {
        case 'hourly':
            return `${schedule.Minute} * * * *`;
        case 'daily':
            return `${schedule.Minute} ${schedule.Hour} * * *`;
        case 'weekly':
            return `${schedule.Minute} ${schedule.Hour} * * ${schedule.DayOfWeek}`;
        case 'monthly':
            return `${schedule.Minute} ${schedule.Hour} ${schedule.DayOfMonth} * *`;
        case 'advanced':
            return schedule.Raw.trim();
    }
}

/**
 * Parses a cron expression back into a structured schedule, detecting the friendly
 * presets the editor can render. Anything that doesn't match a preset shape comes
 * back as 'advanced' with Raw preserved (never lossy).
 */
export function ParseCronExpression(cron: string | null | undefined): CronSchedule {
    const result = DefaultCronSchedule();
    const raw = (cron ?? '').trim();
    result.Raw = raw;
    if (!raw) {
        return result;
    }

    const parts = raw.split(/\s+/);
    if (parts.length !== 5) {
        result.Kind = 'advanced';
        return result;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    if (!isSimpleInt(minute) || month !== '*') {
        result.Kind = 'advanced';
        return result;
    }

    const min = parseInt(minute, 10);
    if (hour === '*' && dayOfMonth === '*' && dayOfWeek === '*') {
        return { ...result, Kind: 'hourly', Minute: min };
    }
    if (isSimpleInt(hour) && dayOfMonth === '*' && dayOfWeek === '*') {
        return { ...result, Kind: 'daily', Minute: min, Hour: parseInt(hour, 10) };
    }
    if (isSimpleInt(hour) && dayOfMonth === '*' && isSimpleInt(dayOfWeek)) {
        const dow = parseInt(dayOfWeek, 10);
        if (dow >= 0 && dow <= 6) {
            return { ...result, Kind: 'weekly', Minute: min, Hour: parseInt(hour, 10), DayOfWeek: dow };
        }
    }
    if (isSimpleInt(hour) && isSimpleInt(dayOfMonth) && dayOfWeek === '*') {
        const dom = parseInt(dayOfMonth, 10);
        if (dom >= 1 && dom <= 31) {
            return { ...result, Kind: 'monthly', Minute: min, Hour: parseInt(hour, 10), DayOfMonth: dom };
        }
    }

    result.Kind = 'advanced';
    return result;
}

/**
 * Human-friendly description of a cron expression. Covers the editor presets plus a
 * couple of common step shapes; anything else falls back to the raw expression so the
 * UI never shows a wrong description.
 */
export function DescribeCronExpression(cron: string | null | undefined): string {
    const raw = (cron ?? '').trim();
    if (!raw) {
        return '';
    }

    // Common step shapes that aren't presets but read well in words
    const everyMinute = /^\*\s+\*\s+\*\s+\*\s+\*$/;
    if (everyMinute.test(raw)) {
        return 'Every minute';
    }
    const minuteStep = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/.exec(raw);
    if (minuteStep) {
        return `Every ${minuteStep[1]} minutes`;
    }
    const hourStep = /^(\d+)\s+\*\/(\d+)\s+\*\s+\*\s+\*$/.exec(raw);
    if (hourStep) {
        return `Every ${hourStep[2]} hours at :${padTwo(parseInt(hourStep[1], 10))}`;
    }

    const schedule = ParseCronExpression(raw);
    switch (schedule.Kind) {
        case 'hourly':
            return schedule.Minute === 0 ? 'Every hour, on the hour' : `Every hour at :${padTwo(schedule.Minute)}`;
        case 'daily':
            return `Daily at ${FormatTimeOfDay(schedule.Hour, schedule.Minute)}`;
        case 'weekly':
            return `Every ${CRON_DAY_NAMES[schedule.DayOfWeek]} at ${FormatTimeOfDay(schedule.Hour, schedule.Minute)}`;
        case 'monthly':
            return `Monthly on the ${Ordinal(schedule.DayOfMonth)} at ${FormatTimeOfDay(schedule.Hour, schedule.Minute)}`;
        case 'advanced':
            return raw;
    }
}

/** Formats an hour/minute pair as a 12-hour clock time (e.g. "9:05 AM"). */
export function FormatTimeOfDay(hour: number, minute: number): string {
    const suffix = hour < 12 ? 'AM' : 'PM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:${padTwo(minute)} ${suffix}`;
}

/** English ordinal for a day-of-month (1 → "1st", 22 → "22nd"). */
export function Ordinal(n: number): string {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) {
        return `${n}th`;
    }
    switch (n % 10) {
        case 1: return `${n}st`;
        case 2: return `${n}nd`;
        case 3: return `${n}rd`;
        default: return `${n}th`;
    }
}

/** Loose sanity check for a raw (advanced) cron expression: 5 or 6 whitespace-separated fields. */
export function IsPlausibleCronExpression(raw: string): boolean {
    const parts = raw.trim().split(/\s+/);
    return parts.length === 5 || parts.length === 6;
}

function isSimpleInt(value: string): boolean {
    return /^\d+$/.test(value);
}

function padTwo(n: number): string {
    return n.toString().padStart(2, '0');
}
