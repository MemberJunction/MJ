import { describe, it, expect } from 'vitest';
import { isPageChangingAction, evaluateBatchStop, DEFAULT_MAX_ACTIONS_PER_BATCH } from '../engine/batch-control.js';

describe('isPageChangingAction (CU-B5)', () => {
    it('flags navigation actions', () => {
        for (const t of ['Navigate', 'GoBack', 'GoForward', 'Refresh'] as const) {
            expect(isPageChangingAction(t)).toBe(true);
        }
    });
    it('does not flag in-page actions', () => {
        for (const t of ['Click', 'Type', 'Scroll', 'Wait', 'ClickElement', 'Keypress'] as const) {
            expect(isPageChangingAction(t)).toBe(false);
        }
    });
});

describe('evaluateBatchStop (CU-B5)', () => {
    const base = { actionType: 'Click' as const, success: true, urlChanged: false, executedCount: 1, maxActions: 4 };

    it('continues on a clean in-page action under the cap', () => {
        expect(evaluateBatchStop(base)).toBeNull();
    });

    it('stops on a failed action (compounding-damage fix), even if nothing else fired', () => {
        expect(evaluateBatchStop({ ...base, success: false })).toBe('action-failed');
    });

    it('stops when the URL changed mid-batch', () => {
        expect(evaluateBatchStop({ ...base, urlChanged: true })).toBe('url-changed');
    });

    it('stops after a page-changing action type', () => {
        expect(evaluateBatchStop({ ...base, actionType: 'Navigate' })).toBe('page-changing-action');
    });

    it('stops when the per-step cap is reached', () => {
        expect(evaluateBatchStop({ ...base, executedCount: 4, maxActions: 4 })).toBe('max-actions');
    });

    it('precedence: a failed navigation reports as action-failed, not page-changing', () => {
        expect(evaluateBatchStop({ ...base, actionType: 'Navigate', success: false })).toBe('action-failed');
    });

    it('exposes a sane default cap', () => {
        expect(DEFAULT_MAX_ACTIONS_PER_BATCH).toBe(4);
    });
});
