import { describe, it, expect } from 'vitest';
import {
    selectCheckpointFrame,
    ReplayFrame,
    latchVisualFromVerdict,
    countMetCheckpoints,
    CheckpointLatch,
} from '../engine/verdict.js';
import { JudgeVerdict } from '../types/judge.js';
import { RunCheckpoint } from '../types/params.js';
import { GoalPostcondition } from '../types/trace.js';

/**
 * A replayed tour judged its still-pending visual criteria against ONE end-state
 * frame. Every section of a multi-section tour is visible at a different point in
 * the trajectory, so that frame can show at most the last one — an 11-section tour
 * whose every step replayed correctly scored 0/11, and the tour was reported
 * incomplete. The frames are already captured per step; the fix is to judge each
 * checkpoint against the frame where that checkpoint was actually on screen.
 */

function urlCheckpoint(name: string, pattern: string): RunCheckpoint {
    const cp = new RunCheckpoint();
    cp.Name = name;
    cp.VisualCriteria = [`${name} rendered`];
    cp.Assertions = [Object.assign(new GoalPostcondition(), { Kind: 'url' as const, UrlPattern: pattern })];
    return cp;
}
function frame(stepNumber: number, url: string): ReplayFrame {
    return { stepNumber, url, screenshot: `shot-${stepNumber}` };
}

const TRAJECTORY: ReplayFrame[] = [
    frame(1, 'http://localhost:4200/app/home/Home'),
    frame(2, 'http://localhost:4200/app/admin/Users'),
    frame(3, 'http://localhost:4200/app/admin/Roles'),
    frame(4, 'http://localhost:4200/app/admin/Roles'),
    frame(5, 'http://localhost:4200/app/monitoring/Diagnostics'),
];

describe('selectCheckpointFrame', () => {
    it('picks the frame captured where the checkpoint was on screen', () => {
        const picked = selectCheckpointFrame(urlCheckpoint('Users grid', '/app/admin/Users'), TRAJECTORY);
        expect(picked?.stepNumber).toBe(2);
    });

    it('does not collapse a mid-trajectory checkpoint onto the final frame', () => {
        const picked = selectCheckpointFrame(urlCheckpoint('Users grid', '/app/admin/Users'), TRAJECTORY);
        expect(picked?.url).not.toBe(TRAJECTORY[TRAJECTORY.length - 1].url);
    });

    it('prefers the LAST matching frame — the most settled view of that section', () => {
        const picked = selectCheckpointFrame(urlCheckpoint('Roles grid', '/app/admin/Roles'), TRAJECTORY);
        expect(picked?.stepNumber).toBe(4);
    });

    it('returns undefined when the checkpoint names no URL — the caller falls back to the end state', () => {
        const cp = new RunCheckpoint();
        cp.Name = 'chart rendered';
        cp.VisualCriteria = ['the chart has bars'];
        expect(selectCheckpointFrame(cp, TRAJECTORY)).toBeUndefined();
    });

    it('returns undefined when the trajectory never reached the checkpoint', () => {
        expect(selectCheckpointFrame(urlCheckpoint('GraphQL Console', '/app/dev/GraphQL'), TRAJECTORY)).toBeUndefined();
    });

    it('applies volatile-param normalization when matching', () => {
        const frames = [frame(1, 'http://localhost:4200/app/admin/Users?nonce=abc123')];
        const picked = selectCheckpointFrame(urlCheckpoint('Users grid', '/app/admin/Users'), frames, ['nonce']);
        expect(picked?.stepNumber).toBe(1);
    });
});

describe('latchVisualFromVerdict — scoped to the section that was actually judged', () => {
    /**
     * The scalar fallback (a verdict with no per-criterion breakdown) latches every
     * pending checkpoint, on the premise that the judge was asked about ALL pending
     * criteria at once. Judging each section against its own frame breaks that
     * premise: a "yes" about the Users grid would silently confirm ten sections the
     * judge never saw. When a call is scoped to one checkpoint, so is its verdict.
     */
    function pendingVisual(name: string): RunCheckpoint {
        const cp = new RunCheckpoint();
        cp.Name = name;
        cp.VisualCriteria = [`${name} rendered`];
        return cp;
    }
    function doneVerdict(): JudgeVerdict {
        return Object.assign(new JudgeVerdict(), { Done: true, Reason: 'looks right', Confidence: 0.9 });
    }

    it('latches ONLY the named checkpoint on a scalar verdict', () => {
        const checkpoints = [pendingVisual('home'), pendingVisual('data')];
        const latches = new Map<string, CheckpointLatch>();

        latchVisualFromVerdict(checkpoints, latches, doneVerdict(), 1, 'home');

        expect(latches.get('home')?.visualMet).toBe(true);
        expect(countMetCheckpoints(checkpoints, latches)).toBe(1);   // 'data' was never shown to the judge
    });

    it('still latches every pending checkpoint when the call was not scoped', () => {
        const checkpoints = [pendingVisual('home'), pendingVisual('data')];
        const latches = new Map<string, CheckpointLatch>();

        latchVisualFromVerdict(checkpoints, latches, doneVerdict(), 1);

        expect(countMetCheckpoints(checkpoints, latches)).toBe(2);
    });
});
