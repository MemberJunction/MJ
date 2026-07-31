/**
 * Failure memo for non-blind retries (CU-B6, part 3).
 *
 * MJ's retries re-run blind with an identical prompt (today: ~32% attempt-2
 * pass rate). Reflexion (arXiv:2303.11366) shows a verbal summary of what failed,
 * fed into the next attempt, materially lifts retry success. On any non-passing
 * terminal status the engine emits a compact memo; the driver's retry policy
 * feeds it back as `PreviousAttemptSummary` so attempt 2 is meaningfully
 * different from attempt 1 ("previous attempt failed because X; avoid Y").
 *
 * Pure and app-agnostic — the caller supplies the facts; this shapes + bounds
 * the memo. Production/consumption is per-test scope (this plan); WHEN a retry
 * is scheduled is the sibling plan's retry policy.
 */

/** The facts a failure memo is distilled from — supplied by the engine at terminal. */
export interface FailureMemoInput {
    /** Terminal status (e.g. 'MaxStepsReached', 'Failed', 'Impossible', 'TimeBudgetExceeded'). */
    status: string;
    /** Machine failure reason when known (e.g. 'LoopDetected', 'AuthDetour'). */
    failureReason?: string;
    /** URL the run ended on. */
    finalUrl?: string;
    /** The last few distinct URLs visited (most recent last). */
    recentUrls?: string[];
    /** The final judge verdict's reason, when judged. */
    judgeReason?: string;
    /** The final judge verdict's actionable feedback, when any. */
    judgeFeedback?: string;
    /** Engine loop evidence (repeated states) — approaches to avoid on retry. */
    loopEvidence?: string;
}

/** Default cap so the memo stays within the next attempt's prompt budget. */
export const DEFAULT_FAILURE_MEMO_MAX_CHARS = 500;

/**
 * Build a compact, structured memo of why an attempt failed. Returns '' when
 * there is nothing useful to say (e.g. a clean pass — callers only emit it on
 * non-passing terminals). Always bounded to `maxChars`.
 */
export function buildFailureMemo(input: FailureMemoInput, maxChars: number = DEFAULT_FAILURE_MEMO_MAX_CHARS): string {
    const parts: string[] = [];

    const reason = input.failureReason ? `${input.status} (${input.failureReason})` : input.status;
    parts.push(`Previous attempt ended: ${reason}.`);

    const path = shortUrl(input.finalUrl);
    if (path) {
        parts.push(`Ended on ${path}.`);
    }
    if (input.judgeReason?.trim()) {
        parts.push(`Judge: ${input.judgeReason.trim()}`);
    }
    if (input.judgeFeedback?.trim() && input.judgeFeedback.trim() !== input.judgeReason?.trim()) {
        parts.push(`Feedback: ${input.judgeFeedback.trim()}`);
    }
    if (input.loopEvidence?.trim()) {
        parts.push(`Avoid repeating: ${input.loopEvidence.trim()}`);
    }
    const trail = dedupeTrail(input.recentUrls, input.finalUrl);
    if (trail) {
        parts.push(`Recent path: ${trail}.`);
    }

    return truncate(parts.join(' '), maxChars);
}

// ─── Internals ─────────────────────────────────────────────

/** Path + query of a URL (origin dropped for brevity); '' on empty/unparseable. */
function shortUrl(url: string | undefined): string {
    if (!url) {
        return '';
    }
    try {
        const u = new URL(url);
        return `${u.pathname}${u.search}`;
    } catch {
        return url;
    }
}

/** A compact "a → b → c" trail of the recent distinct paths (excludes the final, already stated). */
function dedupeTrail(urls: string[] | undefined, finalUrl: string | undefined): string {
    if (!urls || urls.length === 0) {
        return '';
    }
    const finalPath = shortUrl(finalUrl);
    const paths: string[] = [];
    for (const u of urls) {
        const p = shortUrl(u);
        if (p && p !== finalPath && paths[paths.length - 1] !== p) {
            paths.push(p);
        }
    }
    return paths.slice(-4).join(' → ');
}

function truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
        return text;
    }
    return text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}
