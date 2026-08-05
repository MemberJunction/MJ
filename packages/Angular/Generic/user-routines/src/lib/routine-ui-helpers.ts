/**
 * Pure display / serialization helpers shared by the User Routines components.
 * No Angular or MJ runtime dependencies — unit-testable in isolation.
 */
import type { MJUserRoutineEntity } from '@memberjunction/core-entities';

/** Chip variants aligned with the shared status-token vocabulary. */
export type RoutineChipVariant = 'success' | 'warning' | 'error' | 'info' | 'muted';

/** Maps a routine lifecycle status to a chip variant. */
export function RoutineStatusVariant(status: MJUserRoutineEntity['Status']): RoutineChipVariant {
    switch (status) {
        case 'Active': return 'success';
        case 'Paused': return 'warning';
        case 'Disabled': return 'muted';
        default: return 'muted';
    }
}

/** Maps a run outcome status to a chip variant. */
export function RunStatusVariant(status: string | null | undefined): RoutineChipVariant {
    switch (status) {
        case 'Success': return 'success';
        case 'Failed': return 'error';
        case 'Running': return 'info';
        case 'Skipped': return 'muted';
        default: return 'muted';
    }
}

/** Font Awesome icon class for a routine target type. */
export function TargetTypeIcon(targetType: MJUserRoutineEntity['TargetType']): string {
    switch (targetType) {
        case 'Agent': return 'fa-solid fa-robot';
        case 'Action': return 'fa-solid fa-bolt';
        case 'Prompt': return 'fa-solid fa-comment-dots';
        default: return 'fa-solid fa-circle-question';
    }
}

/**
 * Compact relative-time label ("3m ago", "in 2h", "just now"). Returns an empty
 * string for null input. `now` is injectable for tests.
 */
export function FormatRelativeTime(date: Date | null | undefined, now: Date = new Date()): string {
    if (!date) {
        return '';
    }
    const target = date instanceof Date ? date : new Date(date);
    if (isNaN(target.getTime())) {
        return '';
    }
    const diffMs = target.getTime() - now.getTime();
    const absMs = Math.abs(diffMs);
    const future = diffMs > 0;

    if (absMs < 60_000) {
        return future ? 'in <1m' : 'just now';
    }
    const units: Array<{ ms: number; label: string }> = [
        { ms: 86_400_000 * 365, label: 'y' },
        { ms: 86_400_000 * 30, label: 'mo' },
        { ms: 86_400_000, label: 'd' },
        { ms: 3_600_000, label: 'h' },
        { ms: 60_000, label: 'm' },
    ];
    for (const unit of units) {
        if (absMs >= unit.ms) {
            const count = Math.floor(absMs / unit.ms);
            return future ? `in ${count}${unit.label}` : `${count}${unit.label} ago`;
        }
    }
    return future ? 'in <1m' : 'just now';
}

/** Duration between two timestamps as "4s", "2m 10s", "1h 4m". Empty when incomplete. */
export function FormatDuration(start: Date | null | undefined, end: Date | null | undefined): string {
    if (!start || !end) {
        return '';
    }
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) {
        return '';
    }
    const totalSeconds = Math.round((endMs - startMs) / 1000);
    if (totalSeconds < 60) {
        return `${totalSeconds}s`;
    }
    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) {
        return `${totalMinutes}m ${totalSeconds % 60}s`;
    }
    const hours = Math.floor(totalMinutes / 60);
    return `${hours}h ${totalMinutes % 60}m`;
}

/**
 * Parses the RequestedSkillIDs JSON column into a string array. Tolerant: bad JSON,
 * non-array shapes, and non-string members all collapse to an empty/filtered array.
 */
export function ParseSkillIDs(raw: string | null | undefined): string[] {
    if (!raw || raw.trim().length === 0) {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    } catch {
        return [];
    }
}

/** Serializes a skill ID array to the JSON column value (null when empty). */
export function SerializeSkillIDs(ids: readonly string[]): string | null {
    const clean = ids.filter((id) => id && id.length > 0);
    return clean.length > 0 ? JSON.stringify(clean) : null;
}

/** Validates optional JSON text (StartingPayload). Blank is valid (stored as NULL). */
export function ValidateOptionalJson(text: string | null | undefined): { Valid: boolean; Error?: string } {
    const trimmed = (text ?? '').trim();
    if (trimmed.length === 0) {
        return { Valid: true };
    }
    try {
        JSON.parse(trimmed);
        return { Valid: true };
    } catch (e) {
        return { Valid: false, Error: e instanceof Error ? e.message : 'Invalid JSON' };
    }
}

/** Very light email shape check for external recipients (not RFC-complete on purpose). */
export function IsPlausibleEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Converts a Date to the string an `<input type="datetime-local">` expects
 * ("YYYY-MM-DDTHH:MM", local time). Empty string for null.
 */
export function ToDateTimeLocal(date: Date | null | undefined): string {
    if (!date) {
        return '';
    }
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) {
        return '';
    }
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses a datetime-local string back to a Date (null for blank/invalid). */
export function FromDateTimeLocal(value: string | null | undefined): Date | null {
    const trimmed = (value ?? '').trim();
    if (!trimmed) {
        return null;
    }
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The browser's IANA timezone list via Intl (ES2022), with a small static fallback for
 * older runtimes. The current zone is included by construction on modern browsers.
 */
export function GetTimezoneOptions(): string[] {
    if (typeof Intl.supportedValuesOf === 'function') {
        return Intl.supportedValuesOf('timeZone');
    }
    return [
        'UTC',
        'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
        'Europe/London', 'Europe/Paris', 'Europe/Berlin',
        'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
        'Australia/Sydney'
    ];
}

/** The user's current IANA timezone (falls back to UTC). */
export function GetLocalTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}
