/**
 * Action-failure distillation for the controller prompt (CU-A4) — pure.
 *
 * Playwright appends a multi-line `Call log:` to every actionability timeout.
 * Rendered verbatim into the step summary it costs ~15 prompt lines per failed
 * action and buries the one fact the controller can act on: that the element was
 * found and something was covering it. An undistilled "Timeout 8000ms exceeded"
 * reads as "the element isn't there", so the controller retries the identical
 * click and burns the budget on a click that can never land.
 *
 * This keeps the headline, and when the log names a pointer-events interceptor it
 * replaces the log with the named blocker plus the recovery that actually works.
 *
 * App-agnostic: blocker descriptions come from the runtime log, never from a list
 * of known selectors here.
 */

/**
 * Matches Playwright's interception lines, both shapes it emits:
 *   - <div class="x">…</div> intercepts pointer events
 *   - <div class="y"></div> from <div class="z">…</div> subtree intercepts pointer events
 * The first tag is the actual blocker in both, so a single capture serves both.
 */
const INTERCEPTION_PATTERN = /-\s*(<[^>]+>)[^\n]*intercepts pointer events/g;

/** Angular's per-component attributes carry no meaning for the controller. */
const ANGULAR_SCOPE_ATTRIBUTE = /\s*_ng(content|host)-[a-z0-9-]+=(""|"[^"]*")/g;

const MAX_BLOCKER_LENGTH = 90;

/** Reduce a logged open tag to a compact, meaningful identifier. */
function condenseTag(tag: string): string {
    const cleaned = tag.replace(ANGULAR_SCOPE_ATTRIBUTE, '');
    return cleaned.length > MAX_BLOCKER_LENGTH ? `${cleaned.slice(0, MAX_BLOCKER_LENGTH)}…>` : cleaned;
}

/**
 * Collapse a raw browser-action error into one actionable line for the prompt.
 *
 * Returns the first line alone when nothing intercepted (the call log adds no
 * decision-relevant information), or the first line plus a named-blocker recovery
 * hint when it did. Input that is already a single line passes through unchanged.
 */
export function distillActionError(message: string | undefined): string {
    if (!message) {
        return 'unknown';
    }
    const headline = message.split('\n')[0].trim();
    const blockers = [...message.matchAll(INTERCEPTION_PATTERN)].map(match => condenseTag(match[1]));
    if (blockers.length === 0) {
        return headline;
    }

    // Successive retries can report different blockers as the page settles; list
    // each once, in the order Playwright saw them.
    const unique = [...new Set(blockers)];
    const subject = unique.length > 1 ? `${unique.join(' then ')} were` : `${unique[0]} was`;
    return `${headline} The element WAS found, but ${subject} covering it at the click point, so the click could not land. ` +
        `Repeating this exact click will fail the same way. Dismiss whatever is covering it first (press Escape, or click the covering element itself), or reach the target a different way.`;
}
