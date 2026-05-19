import { describe, it, expect } from 'vitest';
import { HeuristicJudge } from '../judge/HeuristicJudge.js';
import { JudgeContext, StepRecord } from '../types/judge.js';
import { ComputerUseError } from '../types/errors.js';

function createContext(overrides: Partial<JudgeContext> = {}): JudgeContext {
    const ctx = new JudgeContext();
    ctx.Goal = overrides.Goal ?? 'test goal';
    ctx.CurrentScreenshot = overrides.CurrentScreenshot ?? '';
    ctx.ScreenshotHistory = overrides.ScreenshotHistory ?? [];
    ctx.StepHistory = overrides.StepHistory ?? [];
    ctx.StepNumber = overrides.StepNumber ?? 1;
    ctx.MaxSteps = overrides.MaxSteps ?? 30;
    ctx.CurrentUrl = overrides.CurrentUrl ?? 'https://example.com';
    return ctx;
}

function createStep(overrides: Partial<StepRecord> = {}): StepRecord {
    const step = new StepRecord();
    step.StepNumber = overrides.StepNumber ?? 1;
    step.Url = overrides.Url ?? '';
    step.ControllerReasoning = overrides.ControllerReasoning ?? '';
    step.ActionsRequested = overrides.ActionsRequested ?? [];
    step.ActionResults = overrides.ActionResults ?? [];
    step.ToolCalls = overrides.ToolCalls ?? [];
    step.Error = overrides.Error;
    step.DurationMs = overrides.DurationMs ?? 100;
    return step;
}

describe('HeuristicJudge', () => {
    describe('Type', () => {
        it('should return "Heuristic" as its type', () => {
            const judge = new HeuristicJudge();
            expect(judge.Type).toBe('Heuristic');
        });
    });

    describe('Evaluate — inconclusive', () => {
        it('should return inconclusive when no issues are detected', async () => {
            const judge = new HeuristicJudge();
            const ctx = createContext({
                CurrentScreenshot: 'screenshot_A',
                ScreenshotHistory: ['screenshot_B', 'screenshot_C'],
                StepHistory: [
                    createStep({ Url: 'https://a.com' }),
                    createStep({ Url: 'https://b.com' }),
                ],
            });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Done).toBe(false);
            expect(verdict.Confidence).toBe(0);
            expect(verdict.Reason).toContain('inconclusive');
        });

        it('should return inconclusive with empty context', async () => {
            const judge = new HeuristicJudge();
            const ctx = createContext();

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Done).toBe(false);
            expect(verdict.Confidence).toBe(0);
        });
    });

    describe('detectStuckState — via Evaluate', () => {
        it('should detect stuck state when N consecutive screenshots are identical (default threshold 3)', async () => {
            const judge = new HeuristicJudge();
            // ScreenshotHistory + CurrentScreenshot need to have 3 identical at the tail
            const ctx = createContext({
                ScreenshotHistory: ['same_screenshot', 'same_screenshot'],
                CurrentScreenshot: 'same_screenshot',
            });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Done).toBe(false);
            expect(verdict.Confidence).toBe(0.8);
            expect(verdict.Reason).toContain('stuck');
            expect(verdict.Feedback).toBeTruthy();
        });

        it('should not detect stuck state when screenshots differ', async () => {
            const judge = new HeuristicJudge();
            const ctx = createContext({
                ScreenshotHistory: ['screenshot_1', 'screenshot_2'],
                CurrentScreenshot: 'screenshot_3',
            });

            const verdict = await judge.Evaluate(ctx);
            // Should be inconclusive, not stuck
            expect(verdict.Confidence).toBe(0);
        });

        it('should not detect stuck state when fewer than threshold screenshots exist', async () => {
            const judge = new HeuristicJudge();
            const ctx = createContext({
                ScreenshotHistory: ['same'],
                CurrentScreenshot: 'same',
            });

            // Only 2 identical, but threshold is 3
            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0);
        });

        it('should respect custom stagnation threshold', async () => {
            const judge = new HeuristicJudge(2); // threshold of 2
            const ctx = createContext({
                ScreenshotHistory: ['same'],
                CurrentScreenshot: 'same',
            });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0.8);
            expect(verdict.Reason).toContain('stuck');
        });

        it('should ignore empty screenshots in stuck detection', async () => {
            const judge = new HeuristicJudge();
            const ctx = createContext({
                ScreenshotHistory: ['', '', ''],
                CurrentScreenshot: '',
            });

            // Empty strings are filtered out
            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0); // inconclusive, not stuck
        });

        it('should detect stuck state with all identical among many different screenshots', async () => {
            const judge = new HeuristicJudge(3);
            const ctx = createContext({
                ScreenshotHistory: ['a', 'b', 'c', 'stuck', 'stuck'],
                CurrentScreenshot: 'stuck',
            });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0.8);
        });

        it('should NOT detect stuck when only the last 2 of 3 needed are identical', async () => {
            const judge = new HeuristicJudge(3);
            const ctx = createContext({
                ScreenshotHistory: ['different', 'same'],
                CurrentScreenshot: 'same',
            });

            const verdict = await judge.Evaluate(ctx);
            // last 3 are ['different', 'same', 'same'] — not all identical
            expect(verdict.Confidence).toBe(0);
        });
    });

    describe('detectNavigationLoop — via Evaluate', () => {
        it('should detect length-2 navigation loop (A-B-A-B)', async () => {
            const judge = new HeuristicJudge();
            const steps = [
                createStep({ Url: 'https://a.com' }),
                createStep({ Url: 'https://b.com' }),
                createStep({ Url: 'https://a.com' }),
                createStep({ Url: 'https://b.com' }),
            ];
            const ctx = createContext({ StepHistory: steps });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0.7);
            expect(verdict.Reason).toContain('loop');
        });

        it('should detect length-3 navigation loop (A-B-C-A-B-C)', async () => {
            const judge = new HeuristicJudge();
            const steps = [
                createStep({ Url: 'https://a.com' }),
                createStep({ Url: 'https://b.com' }),
                createStep({ Url: 'https://c.com' }),
                createStep({ Url: 'https://a.com' }),
                createStep({ Url: 'https://b.com' }),
                createStep({ Url: 'https://c.com' }),
            ];
            const ctx = createContext({ StepHistory: steps });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0.6);
            expect(verdict.Reason).toContain('loop');
        });

        it('should not detect loop with fewer than 4 steps', async () => {
            const judge = new HeuristicJudge();
            const steps = [
                createStep({ Url: 'https://a.com' }),
                createStep({ Url: 'https://b.com' }),
                createStep({ Url: 'https://a.com' }),
            ];
            const ctx = createContext({ StepHistory: steps });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0); // inconclusive
        });

        it('should not detect loop when URLs do not repeat', async () => {
            const judge = new HeuristicJudge();
            const steps = [
                createStep({ Url: 'https://a.com' }),
                createStep({ Url: 'https://b.com' }),
                createStep({ Url: 'https://c.com' }),
                createStep({ Url: 'https://d.com' }),
            ];
            const ctx = createContext({ StepHistory: steps });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0);
        });

        it('should ignore steps with empty URLs in loop detection', async () => {
            const judge = new HeuristicJudge();
            const steps = [
                createStep({ Url: '' }),
                createStep({ Url: '' }),
                createStep({ Url: '' }),
                createStep({ Url: '' }),
            ];
            const ctx = createContext({ StepHistory: steps });

            // Empty URLs are filtered out, so fewer than MIN_STEPS_FOR_LOOP_DETECTION
            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0);
        });
    });

    describe('detectRepeatedErrors — via Evaluate', () => {
        it('should detect repeated errors at default threshold (3)', async () => {
            const judge = new HeuristicJudge();
            const err = new ComputerUseError('ElementNotFound', 'Button not found');
            const steps = [
                createStep({ Error: err }),
                createStep({ Error: err }),
                createStep({ Error: err }),
            ];
            const ctx = createContext({ StepHistory: steps });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0.8);
            expect(verdict.Reason).toContain('consecutive step errors');
            expect(verdict.Feedback).toContain('different strategy');
        });

        it('should not trigger when errors are below threshold', async () => {
            const judge = new HeuristicJudge();
            const err = new ComputerUseError('ElementNotFound', 'Not found');
            const steps = [
                createStep({ Error: err }),
                createStep({ Error: err }),
            ];
            const ctx = createContext({ StepHistory: steps });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0);
        });

        it('should only consider the most recent N steps', async () => {
            const judge = new HeuristicJudge(undefined, 3);
            const err = new ComputerUseError('LLMError', 'timeout');
            const steps = [
                createStep({ Error: err }),
                createStep({}), // no error — breaks the streak if in the window
                createStep({ Error: err }),
                createStep({ Error: err }),
                createStep({ Error: err }),
            ];
            const ctx = createContext({ StepHistory: steps });

            // Last 3 steps all have errors
            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0.8);
        });

        it('should not trigger when a non-error step is in the recent window', async () => {
            const judge = new HeuristicJudge(undefined, 3);
            const err = new ComputerUseError('LLMError', 'timeout');
            const steps = [
                createStep({ Error: err }),
                createStep({ Error: err }),
                createStep({}), // no error
            ];
            const ctx = createContext({ StepHistory: steps });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0);
        });

        it('should respect custom error threshold', async () => {
            const judge = new HeuristicJudge(3, 2); // error threshold = 2
            const err = new ComputerUseError('NavigationTimeout', 'timed out');
            const steps = [
                createStep({ Error: err }),
                createStep({ Error: err }),
            ];
            const ctx = createContext({ StepHistory: steps });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Confidence).toBe(0.8);
        });

        it('should include error messages in the verdict reason', async () => {
            const judge = new HeuristicJudge(3, 2);
            const steps = [
                createStep({ Error: new ComputerUseError('BrowserCrash', 'crashed!') }),
                createStep({ Error: new ComputerUseError('NavigationTimeout', 'timed out') }),
            ];
            const ctx = createContext({ StepHistory: steps });

            const verdict = await judge.Evaluate(ctx);
            expect(verdict.Reason).toContain('crashed!');
            expect(verdict.Reason).toContain('timed out');
        });
    });

    describe('priority ordering', () => {
        it('should prioritize stuck detection over loop detection', async () => {
            const judge = new HeuristicJudge(3, 3);
            const err = new ComputerUseError('LLMError', 'err');
            const steps = [
                createStep({ Url: 'https://a.com', Error: err }),
                createStep({ Url: 'https://b.com', Error: err }),
                createStep({ Url: 'https://a.com', Error: err }),
                createStep({ Url: 'https://b.com', Error: err }),
            ];
            const ctx = createContext({
                StepHistory: steps,
                ScreenshotHistory: ['same', 'same'],
                CurrentScreenshot: 'same',
            });

            const verdict = await judge.Evaluate(ctx);
            // Stuck detection runs first
            expect(verdict.Reason).toContain('stuck');
        });

        it('should prioritize loop detection over error detection', async () => {
            // Need: no stuck state, but loop AND errors both present
            const judge = new HeuristicJudge(5, 4); // high thresholds for stuck/errors
            const err = new ComputerUseError('LLMError', 'err');
            const steps = [
                createStep({ Url: 'https://a.com', Error: err }),
                createStep({ Url: 'https://b.com', Error: err }),
                createStep({ Url: 'https://a.com', Error: err }),
                createStep({ Url: 'https://b.com', Error: err }),
            ];
            const ctx = createContext({
                StepHistory: steps,
                ScreenshotHistory: ['different1', 'different2'],
                CurrentScreenshot: 'different3',
            });

            const verdict = await judge.Evaluate(ctx);
            // Loop detection runs before error detection
            expect(verdict.Reason).toContain('loop');
        });
    });
});
