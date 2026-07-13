/**
 * @fileoverview Pure formatting/mapping helpers for the Classify (autotagging) sub-app.
 * Extracted from the former monolith so host + tabs share one implementation (DRY).
 * All functions are stateless — no `this`, no DI — so they're safe to import anywhere.
 */
import { RunDetailRow } from './classify.types';

/** Locale-formatted integer (e.g. 12345 → "12,345"). */
export function formatNumber(n: number): string {
    return n.toLocaleString();
}

/**
 * Derive a human-meaningful display name for a content item.
 *
 * Entity-sourced content items now carry a real per-record `Name` (the source
 * entity's name field — e.g. "GPT-4"), so we prefer `Name` directly. Only when a
 * Name is missing (or is a generic source-name placeholder) do we fall back to
 * the first meaningful line of the LLM-generated `Description` to keep rows
 * distinguishable, then to a placeholder.
 *
 * Pure/stateless — safe to call from any render site.
 */
export function deriveDisplayName(item: { Name?: string | null; Description?: string | null }): string {
    const name = item?.Name?.trim();
    if (name) {
        return name.length > DISPLAY_NAME_MAX_LEN
            ? `${name.slice(0, DISPLAY_NAME_MAX_LEN).trimEnd()}…`
            : name;
    }

    const fromDescription = firstMeaningfulLine(item?.Description);
    if (fromDescription) return fromDescription;

    return '(Untitled)';
}

/** Max length of a derived display name before it is truncated with an ellipsis. */
const DISPLAY_NAME_MAX_LEN = 80;

/**
 * Returns the first non-empty, markdown-stripped line of a description, clamped
 * to DISPLAY_NAME_MAX_LEN characters. Returns null when nothing meaningful remains.
 */
function firstMeaningfulLine(description: string | null | undefined): string | null {
    if (!description) return null;

    for (const rawLine of description.split(/\r?\n/)) {
        const cleaned = stripMarkdown(rawLine);
        if (cleaned.length === 0) continue;
        return cleaned.length > DISPLAY_NAME_MAX_LEN
            ? `${cleaned.slice(0, DISPLAY_NAME_MAX_LEN).trimEnd()}…`
            : cleaned;
    }
    return null;
}

/** Strip leading markdown markers (#, *, -, >, backticks) and collapse whitespace. */
function stripMarkdown(line: string): string {
    return line
        .replace(/^[#>\s]*/g, '')      // leading heading / blockquote markers + space
        .replace(/^[-*+]\s+/, '')      // leading bullet markers
        .replace(/[`*_~]/g, '')        // inline emphasis / code markers
        .replace(/\s+/g, ' ')          // collapse runs of whitespace
        .trim();
}

/** Compact token count (e.g. 1500 → "2K", 2_400_000 → "2.4M"). */
export function formatTokenCount(tokens: number): string {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
    return String(tokens);
}

/** Weight (0.0–1.0) as a percentage string (e.g. 0.42 → "42%"). */
export function formatWeight(weight: number): string {
    return `${Math.round(weight * 100)}%`;
}

/** Font size in rem for a tag chip based on weight (0.0–1.0), clamped to 0.7–1.0rem. */
export function tagFontSize(weight: number): string {
    const min = 0.7;
    const max = 1.0;
    return `${min + (max - min) * Math.min(1, Math.max(0, weight))}rem`;
}

/** Short date (e.g. "Mar 5"). Returns '' on parse failure. */
export function formatShortDate(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return '';
    }
}

/** Date + time (e.g. "Mar 5, 2:05 PM"). Echoes the input on parse failure. */
export function formatDate(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch {
        return dateStr;
    }
}

/** Human-friendly elapsed duration between two ISO timestamps; open-ended if `end` is null. */
export function computeDuration(start: string | null, end: string | null): string {
    if (!start) return '—';
    const s = new Date(start);
    const e = end ? new Date(end) : new Date();
    const ms = e.getTime() - s.getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.round((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
}

/** Normalize a raw run status to one of the canonical display labels. */
export function displayStatus(status: string): string {
    const lower = status.toLowerCase();
    if (lower === 'complete' || lower === 'completed' || lower === 'done') return 'Complete';
    if (lower === 'error' || lower === 'failed') return 'Failed';
    if (lower === 'running' || lower === 'processing') return 'Running';
    return status;
}

/** Font Awesome icon class for a content source type name. */
export function getSourceTypeIcon(typeName: string): string {
    const iconMap: Record<string, string> = {
        'Web': 'fa-solid fa-globe', 'Web Crawler': 'fa-solid fa-globe',
        'API': 'fa-solid fa-plug', 'Database': 'fa-solid fa-database',
        'File': 'fa-solid fa-file-alt', 'Email': 'fa-solid fa-envelope',
        'RSS': 'fa-solid fa-rss', 'RSS Feed': 'fa-solid fa-rss',
        'CMS': 'fa-solid fa-newspaper', 'PDF': 'fa-solid fa-file-pdf'
    };
    return iconMap[typeName] ?? 'fa-solid fa-folder';
}

/** Map raw `MJ: Content Process Run Details` rows to typed RunDetailRow view models. */
export function mapRunDetailRecords(records: Record<string, unknown>[]): RunDetailRow[] {
    return records.map(d => {
        const status = String(d['Status'] || 'Pending');
        const statusLower = status.toLowerCase();
        const isFailed = statusLower === 'failed' || statusLower === 'error';
        const isRunning = statusLower === 'running' || statusLower === 'processing';
        const startTime = d['StartTime'] ? new Date(String(d['StartTime'])) : null;
        const endTime = d['EndTime'] ? new Date(String(d['EndTime'])) : null;
        const durationMs = startTime && endTime ? endTime.getTime() - startTime.getTime() : 0;
        const durationStr = durationMs > 60000 ? `${Math.round(durationMs / 60000)}m` : `${Math.round(durationMs / 1000)}s`;

        return {
            SourceName: String(d['ContentSource'] || 'Unknown'),
            SourceType: String(d['ContentSourceType'] || ''),
            Status: displayStatus(status),
            StatusClass: isFailed ? 'failed' : isRunning ? 'running' : 'complete',
            ItemsProcessed: Number(d['ItemsProcessed'] || 0),
            ItemsTagged: Number(d['ItemsTagged'] || 0),
            ItemsVectorized: Number(d['ItemsVectorized'] || 0),
            ErrorCount: Number(d['ErrorCount'] || 0),
            TotalTokens: Number(d['TotalTokensUsed'] || 0),
            TotalCost: Number(d['TotalCost'] || 0),
            Duration: durationStr,
        };
    });
}

// ================================================================
// Cron-to-Human-Readable Utility
// ================================================================

/**
 * Converts a 5-part or 6-part cron expression to a human-readable English string.
 *
 * Handles common patterns:
 *   `0 * * * *`      -> "Every hour"
 *   `0 2 * * *`      -> "Daily at 2:00 AM"
 *   `0 2 * * 1`      -> "Weekly on Monday at 2:00 AM"
 *   `star/15 * * * *` -> "Every 15 minutes"  (where star = asterisk)
 *   `0 0 1 * *`      -> "Monthly on day 1 at 12:00 AM"
 *
 * Falls back to returning the raw cron string for unrecognized patterns.
 *
 * @param cron A cron expression string (5 or 6 parts)
 * @returns A human-readable description or the raw cron if unrecognized
 */
export function CronToHumanReadable(cron: string): string {
    if (!cron) return 'No schedule';

    const parts = cron.trim().split(/\s+/);
    const p = parseCronParts(parts);
    if (!p) return cron;

    return formatCronParts(p) ?? cron;
}

/** Internal cron field tuple */
interface CronFields {
    Minute: string;
    Hour: string;
    DayOfMonth: string;
    Month: string;
    DayOfWeek: string;
}

/**
 * Parses 5-part or 6-part cron expressions into normalized fields.
 * 6-part expressions have a leading seconds field that is discarded.
 */
function parseCronParts(parts: string[]): CronFields | null {
    if (parts.length === 5) {
        return { Minute: parts[0], Hour: parts[1], DayOfMonth: parts[2], Month: parts[3], DayOfWeek: parts[4] };
    }
    if (parts.length === 6) {
        return { Minute: parts[1], Hour: parts[2], DayOfMonth: parts[3], Month: parts[4], DayOfWeek: parts[5] };
    }
    return null;
}

/**
 * Attempts to map parsed cron fields to a human-readable string.
 * Returns null when the pattern is not recognized.
 */
function formatCronParts(p: CronFields): string | null {
    // Every N minutes: */N * * * *
    if (p.Minute.startsWith('*/') && p.Hour === '*' && p.DayOfMonth === '*' && p.Month === '*' && p.DayOfWeek === '*') {
        const interval = parseInt(p.Minute.slice(2), 10);
        if (interval === 1) return 'Every minute';
        return `Every ${interval} minutes`;
    }

    // Every hour at minute M: M * * * *
    if (!p.Minute.includes('*') && !p.Minute.includes('/') && p.Hour === '*' && p.DayOfMonth === '*' && p.Month === '*' && p.DayOfWeek === '*') {
        return 'Every hour';
    }

    // Every N hours: 0 */N * * *
    if (!p.Minute.includes('*') && !p.Minute.includes('/') && p.Hour.startsWith('*/') && p.DayOfMonth === '*') {
        const interval = parseInt(p.Hour.slice(2), 10);
        if (interval === 1) return 'Every hour';
        return `Every ${interval} hours`;
    }

    // Specific hour + minute with wildcard or specific day fields
    if (!p.Minute.includes('*') && !p.Minute.includes('/') &&
        !p.Hour.includes('*') && !p.Hour.includes('/') &&
        p.Month === '*') {

        const hour = parseInt(p.Hour, 10);
        const minute = parseInt(p.Minute, 10);
        const timeStr = formatTimeOfDay(hour, minute);

        // Weekly: specific day of week
        if (p.DayOfWeek !== '*' && p.DayOfMonth === '*') {
            const dayName = dayOfWeekToName(p.DayOfWeek);
            return `Weekly on ${dayName} at ${timeStr}`;
        }

        // Monthly: specific day of month
        if (p.DayOfMonth !== '*' && p.DayOfWeek === '*') {
            return `Monthly on day ${p.DayOfMonth} at ${timeStr}`;
        }

        // Daily
        if (p.DayOfMonth === '*' && p.DayOfWeek === '*') {
            return `Daily at ${timeStr}`;
        }
    }

    return null;
}

/** Formats hour and minute to 12-hour AM/PM time string */
function formatTimeOfDay(hour: number, minute: number): string {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const m = minute.toString().padStart(2, '0');
    return `${h}:${m} ${ampm}`;
}

/** Maps day-of-week cron values (0-7 or SUN-SAT) to English names */
function dayOfWeekToName(dow: string): string {
    const names: Record<string, string> = {
        '0': 'Sunday', '1': 'Monday', '2': 'Tuesday',
        '3': 'Wednesday', '4': 'Thursday', '5': 'Friday',
        '6': 'Saturday', '7': 'Sunday',
        'SUN': 'Sunday', 'MON': 'Monday', 'TUE': 'Tuesday',
        'WED': 'Wednesday', 'THU': 'Thursday', 'FRI': 'Friday',
        'SAT': 'Saturday',
    };
    return names[dow.toUpperCase()] ?? dow;
}
