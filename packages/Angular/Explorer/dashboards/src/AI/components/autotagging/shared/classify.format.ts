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
