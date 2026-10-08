import { describe, expect, it } from 'vitest';
import type { ComputerUseResult } from '@memberjunction/computer-use';
import { SelectRubricFrames } from '../test-driver/rubric-frames.js';

function run(steps: number, opts: { checkpointAt?: number[]; doneAt?: number; final?: string } = {}): ComputerUseResult {
    return {
        Status: 'Completed',
        Success: true,
        FinalScreenshot: opts.final ?? 'FINAL',
        FinalFrameCapturedAfterActions: opts.final === undefined,
        Steps: Array.from({ length: steps }, (_, i) => ({
            StepNumber: i + 1,
            Screenshot: `S${i + 1}`,
            ScreenshotHash: `h${i + 1}`,
            CheckpointReached: opts.checkpointAt?.includes(i + 1) ? `cp${i + 1}` : undefined,
            JudgeVerdict: i + 1 === opts.doneAt ? { Done: true } : (i % 3 === 0 ? { Done: false } : undefined),
        })),
    } as unknown as ComputerUseResult;
}

describe('SelectRubricFrames', () => {
    it('keeps checkpoint frames, verdict changes, and the final frame, in step order', () => {
        const frames = SelectRubricFrames(run(10, { checkpointAt: [4], doneAt: 10 }), 6);
        expect(frames.map(frame => frame.label)).toEqual(['step 1', 'step 4', 'step 6', 'step 10', 'final']);
        expect(frames[0]).toEqual({ label: 'step 1', mimeType: 'image/png', data: 'S1' });
        expect(frames.at(-1)?.data).toBe('FINAL');
    });

    it('relabels the last step when the final frame is the same image', () => {
        const frames = SelectRubricFrames(run(2, { final: 'S2' }), 6);
        expect(frames.map(frame => frame.label)).toEqual(['step 1', 'step 2 (final)']);
    });

    it('never returns more than max and returns nothing for max 0', () => {
        expect(SelectRubricFrames(run(30, { checkpointAt: [2, 5, 8, 11, 14, 17, 20] }), 4)).toHaveLength(4);
        expect(SelectRubricFrames(run(5), 0)).toEqual([]);
    });
});
