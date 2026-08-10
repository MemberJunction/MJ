/**
 * Executing the controller's actions for one step: whether the batch may
 * continue after each action, and how to distill a failure into one actionable
 * prompt line. Pure — no browser.
 */

import type { BrowserAction } from '../types/browser.js';

/** Default cap on actions executed per step before the batch stops. */
export const DEFAULT_MAX_ACTIONS_PER_BATCH = 4;

/** Why a batch stopped before running every queued action. */
export type BatchStopReason = 'action-failed' | 'url-changed' | 'page-changing-action' | 'max-actions';

/**
 * Action types that change the page/route. Nothing queued after one of these
 * should run in the same batch — the DOM the later actions targeted is gone.
 */
export function isPageChangingAction(type: BrowserAction['Type']): boolean {
    return type === 'Navigate' || type === 'GoBack' || type === 'GoForward' || type === 'Refresh';
}

/**
 * After executing one action, decide whether to stop the rest of the batch.
 * Returns the reason, or null to continue. A failed action stops first so queued
 * actions can't fire into the wrong place.
 */
export function evaluateBatchStop(params: {
    actionType: BrowserAction['Type'];
    success: boolean;
    urlChanged: boolean;
    executedCount: number;
    maxActions: number;
}): BatchStopReason | null {
    if (!params.success) {
        return 'action-failed';
    }
    if (params.urlChanged) {
        return 'url-changed';
    }
    if (isPageChangingAction(params.actionType)) {
        return 'page-changing-action';
    }
    if (params.executedCount >= params.maxActions) {
        return 'max-actions';
    }
    return null;
}

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
 * Collapse a raw browser-action error into one actionable line, dropping
 * Playwright's multi-line call log. Returns the headline alone when nothing
 * intercepted, or the headline plus a named-blocker recovery hint when it did —
 * an undistilled timeout reads as "the element isn't there" and the controller
 * retries the identical click.
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
