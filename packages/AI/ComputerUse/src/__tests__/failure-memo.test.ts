import { describe, it, expect } from 'vitest';
import { buildFailureMemo, DEFAULT_FAILURE_MEMO_MAX_CHARS } from '../engine/failure-memo.js';

describe('buildFailureMemo', () => {
    it('states the terminal status and reason', () => {
        const memo = buildFailureMemo({ status: 'Failed', failureReason: 'LoopDetected', finalUrl: 'http://x/app/data' });
        expect(memo).toContain('Failed (LoopDetected)');
        expect(memo).toContain('/app/data');
    });

    it('includes judge reason + distinct feedback', () => {
        const memo = buildFailureMemo({
            status: 'MaxStepsReached',
            judgeReason: 'the record was never saved',
            judgeFeedback: 'click Save, not Cancel',
        });
        expect(memo).toContain('the record was never saved');
        expect(memo).toContain('click Save, not Cancel');
    });

    it('does not duplicate feedback identical to the reason', () => {
        const memo = buildFailureMemo({ status: 'Failed', judgeReason: 'same', judgeFeedback: 'same' });
        expect(memo.match(/same/g)).toHaveLength(1);
    });

    it('surfaces loop evidence as "avoid repeating"', () => {
        const memo = buildFailureMemo({ status: 'Failed', loopEvidence: 'visited /app/switcher 4×' });
        expect(memo).toContain('Avoid repeating: visited /app/switcher 4×');
    });

    it('renders a deduped recent-path trail excluding the final URL', () => {
        const memo = buildFailureMemo({
            status: 'Failed',
            finalUrl: 'http://x/app/data',
            recentUrls: ['http://x/app/home', 'http://x/app/home', 'http://x/app/switcher', 'http://x/app/data'],
        });
        expect(memo).toContain('Recent path: /app/home → /app/switcher');
        expect(memo).not.toContain('/app/data →');   // final excluded from the trail
    });

    it('bounds the memo to the char cap', () => {
        const memo = buildFailureMemo({
            status: 'Failed',
            judgeReason: 'x'.repeat(2000),
        }, 120);
        expect(memo.length).toBeLessThanOrEqual(120);
        expect(memo.endsWith('…')).toBe(true);
    });

    it('uses the default cap when unspecified', () => {
        const memo = buildFailureMemo({ status: 'Failed', judgeReason: 'y'.repeat(5000) });
        expect(memo.length).toBeLessThanOrEqual(DEFAULT_FAILURE_MEMO_MAX_CHARS);
    });
});
