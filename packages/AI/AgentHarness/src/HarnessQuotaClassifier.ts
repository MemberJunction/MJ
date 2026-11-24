/**
 * @fileoverview Quota and rate-limit error classification + reset-time parsing for local CLI
 * harness adapters (Claude Code, Antigravity, Codex, Gemini CLI).
 *
 * Used by {@link HarnessAgentBase} to detect subscription/rate-limit exhaustion mid-run,
 * place the exhausted account slot into cooldown, and seamlessly fail over to another healthy
 * slot in {@link HarnessAccountPoolService}.
 *
 * @module @memberjunction/ai-agent-harness
 */

/** Default cooldown duration applied when a quota/rate-limit error contains no parseable reset time (15 minutes). */
export const DEFAULT_HARNESS_QUOTA_COOLDOWN_MS = 15 * 60 * 1000;

/** Minimum cooldown floor applied when a parsed reset timestamp is already in the past or near-immediate (30 seconds). */
export const DEFAULT_MIN_HARNESS_QUOTA_COOLDOWN_MS = 30 * 1000;

/** Maximum cooldown cap applied to guard against wildly misparsed future timestamps (24 hours). */
export const DEFAULT_MAX_HARNESS_QUOTA_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Result of classifying a harness error message or exception for subscription/rate-limit exhaustion. */
export interface HarnessQuotaClassification {
    /** True when the error indicates rate-limit, quota, capacity, or subscription exhaustion. */
    isQuotaError: boolean;
    /** Concise single-line human-readable summary suitable for persisting to `lastCooldownReason`. */
    reason: string;
    /** ISO-8601 timestamp until which the affected slot should remain in cooldown (set when `isQuotaError` is true). */
    cooldownUntilIso?: string;
    /** Computed cooldown duration in milliseconds (set when `isQuotaError` is true). */
    cooldownMs?: number;
    /** Identifier of the classifier pattern that matched (set when `isQuotaError` is true). */
    matchedPattern?: string;
    /** Parsed reset timestamp ISO string when explicitly extracted from the vendor error message. */
    parsedResetAtIso?: string;
}

/** Optional overrides controlling cooldown defaults and clock injection for deterministic tests. */
export interface ClassifyHarnessQuotaErrorOptions {
    /** Default cooldown duration in ms when no reset timestamp can be parsed. Defaults to 15 minutes. */
    defaultCooldownMs?: number;
    /** Current wall-clock timestamp in ms. Defaults to `Date.now()`. */
    nowMs?: number;
    /** Minimum cooldown floor in ms when a parsed reset time is too small or in the past. Defaults to 30 seconds. */
    minCooldownMs?: number;
    /** Maximum cooldown ceiling in ms. Defaults to 24 hours. */
    maxCooldownMs?: number;
}

interface QuotaPatternRule {
    id: string;
    regex: RegExp;
}

const QUOTA_ERROR_PATTERNS: readonly QuotaPatternRule[] = [
    { id: 'rate_limit_error', regex: /\brate[_\s-]?limit(?:_error|ed|s)?\b/i },
    { id: 'overloaded_error', regex: /\boverloaded[_\s-]?error\b/i },
    { id: 'http_429', regex: /(?:http(?:\/[\d.]+)?\s+|status(?:\s+code)?[:=\s]+|error[:=\s]+|code[:=\s]+|\()429\b|\b429\s+(?:too\s+many\s+requests|rate\s+limit|resource[_\s-]?exhausted|quota)/i },
    { id: 'bare_429_prefix', regex: /^\s*429\b/i },
    { id: 'too_many_requests', regex: /\btoo\s+many\s+requests\b/i },
    { id: 'hit_your_limit', regex: /\b(?:you(?:'ve|\s+have)?\s+)?hit\s+(?:your|the)\s+(?:\w+\s+){0,3}limit\b/i },
    { id: 'reached_limit', regex: /\breached\s+(?:your|the)\s+(?:\w+\s+){0,3}(?:limit|quota)\b/i },
    { id: 'usage_limit', regex: /\b(?:usage|plan|subscription|hourly|daily|weekly|monthly|session|spending|credit|quota)\s+limit\b/i },
    { id: 'limit_reached_or_exceeded', regex: /\b(?:usage|rate|quota|plan|session|request|api)\s+limit\s+(?:reached|exceeded)\b/i },
    { id: 'quota_exceeded', regex: /\b(?:quota\s+exceeded|exceeded\s+(?:your\s+)?(?:current\s+)?quota|out\s+of\s+quota|insufficient[_\s-]?quota)\b/i },
    { id: 'resource_exhausted', regex: /\bresource[_\s-]?exhausted\b/i },
    { id: 'resets_at_or_in', regex: /\b(?:limit\s+)?resets?\s+(?:at|in|on)\b/i },
    { id: 'try_again_in', regex: /\b(?:try\s+again|retry)\s+(?:in|after)\s+\d+/i },
    { id: 'capacity_exhausted', regex: /\b(?:capacity\s+exhausted|exhausted\s+your\s+capacity|no\s+capacity\s+available|temporarily\s+overloaded|server\s+is\s+overloaded)\b/i },
];

const MAX_REASON_LENGTH = 240;

/**
 * Classifies an error string or `Error` object from a CLI harness turn to determine whether
 * the failure was caused by subscription/quota/rate-limit exhaustion, and parses any advertised
 * reset timestamp or retry duration into a concrete `cooldownUntilIso`.
 */
export function ClassifyHarnessQuotaError(
    textOrError: string | Error | null | undefined,
    options: ClassifyHarnessQuotaErrorOptions = {},
): HarnessQuotaClassification {
    const rawText = extractErrorText(textOrError);
    if (!rawText) {
        return { isQuotaError: false, reason: '' };
    }

    let matchedRule: QuotaPatternRule | undefined;
    for (const rule of QUOTA_ERROR_PATTERNS) {
        if (rule.regex.test(rawText)) {
            matchedRule = rule;
            break;
        }
    }

    if (!matchedRule) {
        return { isQuotaError: false, reason: '' };
    }

    const nowMs = resolveFinitePositive(options.nowMs, Date.now());
    const defaultCooldownMs = resolveFinitePositive(
        options.defaultCooldownMs,
        DEFAULT_HARNESS_QUOTA_COOLDOWN_MS,
    );
    const minCooldownMs = resolveFinitePositive(
        options.minCooldownMs,
        DEFAULT_MIN_HARNESS_QUOTA_COOLDOWN_MS,
    );
    const maxCooldownMs = Math.max(
        minCooldownMs,
        resolveFinitePositive(options.maxCooldownMs, DEFAULT_MAX_HARNESS_QUOTA_COOLDOWN_MS),
    );

    const parsedResetMs = parseResetTimestampMs(rawText, nowMs);
    let cooldownMs: number;
    let parsedResetAtIso: string | undefined;

    if (parsedResetMs !== null) {
        parsedResetAtIso = new Date(parsedResetMs).toISOString();
        const deltaMs = parsedResetMs - nowMs;
        cooldownMs = clampNumber(deltaMs, minCooldownMs, maxCooldownMs);
    } else {
        cooldownMs = clampNumber(defaultCooldownMs, minCooldownMs, maxCooldownMs);
    }

    const cooldownUntilIso = new Date(nowMs + cooldownMs).toISOString();
    const reason = buildConciseReason(rawText);

    return {
        isQuotaError: true,
        reason,
        cooldownUntilIso,
        cooldownMs,
        matchedPattern: matchedRule.id,
        parsedResetAtIso,
    };
}

function extractErrorText(textOrError: string | Error | null | undefined): string {
    if (textOrError == null) {
        return '';
    }
    if (typeof textOrError === 'string') {
        return textOrError.trim();
    }
    return (textOrError.message ?? String(textOrError)).trim();
}

function buildConciseReason(rawText: string): string {
    const lines = rawText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    const preferred =
        lines.find((line) => QUOTA_ERROR_PATTERNS.some((rule) => rule.regex.test(line))) ??
        lines[0] ??
        rawText;
    return preferred.length > MAX_REASON_LENGTH
        ? `${preferred.slice(0, MAX_REASON_LENGTH - 3)}...`
        : preferred;
}

function resolveFinitePositive(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Collapses runs of horizontal whitespace (`' '`, `'\t'`) into a single space while preserving
 * line breaks and capping length, ensuring all downstream timestamp matchers run in strict O(n).
 */
function normalizeForTimestampParsing(raw: string): string {
    const capped = raw.length > 4096 ? raw.slice(0, 4096) : raw;
    let out = '';
    let prevWasSpace = false;
    for (let i = 0; i < capped.length; i++) {
        const ch = capped[i];
        if (ch === ' ' || ch === '\t' || ch === '\r') {
            if (!prevWasSpace) {
                out += ' ';
                prevWasSpace = true;
            }
        } else {
            out += ch;
            prevWasSpace = false;
        }
    }
    return out;
}

/**
 * Attempts to extract a reset timestamp (in epoch ms) from common vendor quota error messages:
 * - Relative durations: `"try again in 45 minutes"`, `"resets in 2h 30m"`, `"Retry-After: 120"`
 * - ISO-8601 timestamps: `"resets at 2026-11-24T15:30:00Z"`
 * - Date strings: `"resets at Nov 24, 2026 15:00 UTC"`
 * - Clock times: `"resets at 5pm UTC"`, `"resets at 3:30 PM"`, `"resets 14:00"`
 */
function parseResetTimestampMs(rawText: string, nowMs: number): number | null {
    const text = normalizeForTimestampParsing(rawText);

    // 1. Explicit ISO-8601 timestamp (e.g., 2026-11-24T15:00:00Z or 2026-11-24T15:00:00-06:00)
    const isoMatch = text.match(
        /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2}))\b/i,
    );
    if (isoMatch) {
        const parsed = Date.parse(isoMatch[1]);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    // 2. Relative duration phrases: "try again in 2h 15m", "resets in 45 minutes", "retry after 90s"
    const relativeLeadMatch = text.match(
        /\b(?:try again in|retry[- ]after[:=]?|resets? in|available in|wait) ([^\n.,;]{1,80})/i,
    );
    if (relativeLeadMatch) {
        const durationMs = parseRelativeDurationMs(relativeLeadMatch[1]);
        if (durationMs !== null) {
            return nowMs + durationMs;
        }
    }

    // 3. Bare `Retry-After: <seconds>` header syntax
    const retryAfterSecMatch = text.match(/\bretry[- ]after ?[:=] ?(\d{1,7})\b/i);
    if (retryAfterSecMatch) {
        const secs = Number(retryAfterSecMatch[1]);
        if (Number.isFinite(secs) && secs > 0) {
            return nowMs + secs * 1000;
        }
    }

    // 4. Full date phrase after "resets at / resets on / until / available at"
    const datePhraseMatch = text.match(
        /\b(?:resets? (?:at|on)|available (?:at|on)|until) ([A-Z][a-z]{2,8} \d{1,2},? \d{4}(?: \d{1,2}:\d{2}(?::\d{2})?(?: ?(?:AM|PM))?)?(?: ?(?:UTC|GMT|Z))?)/i,
    );
    if (datePhraseMatch) {
        const parsed = Date.parse(datePhraseMatch[1]);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    // 5. Clock time after "resets (at)" or "until": e.g. "resets at 5pm UTC", "resets 3:30 PM", "resets at 14:00 UTC"
    const clockMatch = text.match(
        /\b(?:resets?(?: at)?|until|available at) (\d{1,2})(?::(\d{2}))?(?: ?(am|pm))?(?: ?\(?([A-Z]{1,5})\)?)?/i,
    );
    if (clockMatch) {
        const hourRaw = Number(clockMatch[1]);
        const minute = clockMatch[2] ? Number(clockMatch[2]) : 0;
        const meridiem = clockMatch[3]?.toLowerCase();
        const tz = clockMatch[4]?.toUpperCase();

        // Only treat bare numbers as clock times when either :MM or am/pm or UTC/GMT/Z is present
        if (clockMatch[2] || meridiem || tz === 'UTC' || tz === 'GMT' || tz === 'Z') {
            let hour = hourRaw;
            if (meridiem === 'pm' && hour >= 1 && hour <= 11) {
                hour += 12;
            } else if (meridiem === 'am' && hour === 12) {
                hour = 0;
            }

            if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                const useUtc = tz === 'UTC' || tz === 'GMT' || tz === 'Z';
                const candidate = new Date(nowMs);
                if (useUtc) {
                    candidate.setUTCHours(hour, minute, 0, 0);
                    if (candidate.getTime() <= nowMs) {
                        candidate.setUTCDate(candidate.getUTCDate() + 1);
                    }
                } else {
                    candidate.setHours(hour, minute, 0, 0);
                    if (candidate.getTime() <= nowMs) {
                        candidate.setDate(candidate.getDate() + 1);
                    }
                }
                return candidate.getTime();
            }
        }
    }

    return null;
}

function parseRelativeDurationMs(fragment: string): number | null {
    const bounded = fragment.slice(0, 120);
    const unitRegex = /\b(\d{1,6}(?:\.\d{1,2})?) ?(ms|milliseconds?|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)\b/gi;
    let totalMs = 0;
    let matchedAny = false;
    let match: RegExpExecArray | null;

    while ((match = unitRegex.exec(bounded)) !== null) {
        const amount = Number(match[1]);
        const unit = match[2].toLowerCase();
        if (!Number.isFinite(amount) || amount <= 0) {
            continue;
        }
        matchedAny = true;
        if (unit === 'ms' || unit.startsWith('millisecond')) {
            totalMs += amount;
        } else if (unit === 's' || unit.startsWith('sec')) {
            totalMs += amount * 1000;
        } else if (unit === 'm' || unit.startsWith('min')) {
            totalMs += amount * 60 * 1000;
        } else if (unit === 'h' || unit.startsWith('hr') || unit.startsWith('hour')) {
            totalMs += amount * 60 * 60 * 1000;
        } else if (unit === 'd' || unit.startsWith('day')) {
            totalMs += amount * 24 * 60 * 60 * 1000;
        }
    }

    if (matchedAny && totalMs > 0) {
        return Math.round(totalMs);
    }

    // Bare integer seconds directly following "retry after 60"
    const bareSec = bounded.trim().match(/^(\d{1,7})(?: |$)/);
    if (bareSec) {
        const secs = Number(bareSec[1]);
        if (Number.isFinite(secs) && secs > 0) {
            return secs * 1000;
        }
    }

    return null;
}
