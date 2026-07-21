/**
 * Multi-action batch control (CU-B5) — pure decisions, no browser.
 *
 * The controller may emit several actions in one step (fill → Tab → fill →
 * Enter). Running them blindly is unsafe: a failed Click used to let the queued
 * Type fire into whatever had focus, and an action that navigates mid-batch
 * leaves the rest aimed at a page that no longer exists. This module decides,
 * after each executed action, whether the remaining queued actions should still
 * run — so the engine can stop the batch and report exactly what executed.
 *
 * Pure so the stop precedence + the page-changing-action classification are
 * unit-testable without a live page.
 */

import type { BrowserAction } from '../types/browser.js';

/** Default cap on actions executed per step before the batch stops (CU-B5). */
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
 * After executing one action in a batch, decide whether to STOP the rest.
 * Returns the reason, or null to continue. Order encodes precedence:
 * 1. `action-failed`         — a failed action must not let queued actions fire
 *                              into the wrong place (the compounding-damage bug).
 * 2. `url-changed`           — the route changed mid-batch; later actions are stale.
 * 3. `page-changing-action`  — the action itself navigates (even if the URL read
 *                              hasn't updated yet); terminate the sequence.
 * 4. `max-actions`           — the per-step cap was reached.
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
