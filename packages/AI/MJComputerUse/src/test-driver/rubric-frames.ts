import type { ComputerUseResult } from '@memberjunction/computer-use';
import type { RubricSubjectImage } from './rubric-subject.js';

/** How many frames a rubric judge sees by default. */
export const DEFAULT_RUBRIC_FRAMES = 6;

/**
 * The frames a rubric judge sees: the final frame, each checkpoint frame, each step whose
 * judge verdict changed, then evenly spaced steps up to `max`. Ordered by step, one per
 * distinct screenshot.
 */
export function SelectRubricFrames(result: ComputerUseResult, max = DEFAULT_RUBRIC_FRAMES): RubricSubjectImage[] {
    if (max <= 0) return [];
    const steps = result.Steps.filter(step => step.Screenshot);
    const chosen = new Map<number, string>();
    let lastDone: boolean | undefined;
    for (const step of steps) {
        if (step.CheckpointReached) chosen.set(step.StepNumber, step.Screenshot);
        if (step.JudgeVerdict && step.JudgeVerdict.Done !== lastDone) {
            chosen.set(step.StepNumber, step.Screenshot);
            lastDone = step.JudgeVerdict.Done;
        }
    }
    const room = max - 1 - chosen.size;
    if (room > 0 && steps.length > 0) {
        const stride = Math.max(1, Math.ceil(steps.length / room));
        for (let i = 0; i < steps.length && chosen.size < max - 1; i += stride) {
            chosen.set(steps[i].StepNumber, steps[i].Screenshot);
        }
    }
    const seen = new Set<string>();
    const frames: RubricSubjectImage[] = [];
    for (const [stepNumber, screenshot] of [...chosen.entries()].sort((a, b) => a[0] - b[0])) {
        const hash = steps.find(step => step.StepNumber === stepNumber)?.ScreenshotHash || screenshot;
        if (seen.has(hash)) continue;
        seen.add(hash);
        frames.push({ label: `step ${stepNumber}`, mimeType: 'image/png', data: screenshot });
    }
    if (result.FinalScreenshot) {
        const last = frames[frames.length - 1];
        if (last && last.data === result.FinalScreenshot) last.label = `${last.label} (final)`;
        else frames.push({ label: 'final', mimeType: 'image/png', data: result.FinalScreenshot });
    }
    return frames.slice(-max);
}
