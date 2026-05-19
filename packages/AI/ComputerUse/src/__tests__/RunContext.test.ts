import { describe, it, expect } from 'vitest';
import { RunContext } from '../engine/RunContext.js';
import { RunComputerUseParams } from '../types/params.js';
import { StepRecord } from '../types/judge.js';
import { ClickAction, ActionExecutionResult } from '../types/browser.js';
import { ToolCallRecord } from '../types/tools.js';
import { ComputerUseError } from '../types/errors.js';

function createParams(overrides: Partial<RunComputerUseParams> = {}): RunComputerUseParams {
    const params = new RunComputerUseParams();
    params.Goal = overrides.Goal ?? 'test goal';
    params.ScreenshotHistoryDepth = overrides.ScreenshotHistoryDepth ?? 5;
    params.MaxSteps = overrides.MaxSteps ?? 30;
    return params;
}

function createStep(stepNumber: number, overrides: Partial<StepRecord> = {}): StepRecord {
    const step = new StepRecord();
    step.StepNumber = stepNumber;
    step.Url = overrides.Url ?? '';
    step.ControllerReasoning = overrides.ControllerReasoning ?? '';
    step.ActionsRequested = overrides.ActionsRequested ?? [];
    step.ActionResults = overrides.ActionResults ?? [];
    step.ToolCalls = overrides.ToolCalls ?? [];
    step.DurationMs = overrides.DurationMs ?? 100;
    step.Error = overrides.Error;
    return step;
}

describe('RunContext', () => {
    describe('constructor', () => {
        it('should store Params immutably', () => {
            const params = createParams({ Goal: 'my goal' });
            const ctx = new RunContext(params);
            expect(ctx.Params).toBe(params);
            expect(ctx.Params.Goal).toBe('my goal');
        });

        it('should initialize with empty state', () => {
            const ctx = new RunContext(createParams());
            expect(ctx.CurrentUrl).toBe('');
            expect(ctx.StepHistory).toEqual([]);
            expect(ctx.LastJudgeFeedback).toBeUndefined();
            expect(ctx.StepCount).toBe(0);
            expect(ctx.CurrentScreenshot).toBe('');
            expect(ctx.ScreenshotHistory).toEqual([]);
        });

        it('should record start time', () => {
            const before = performance.now();
            const ctx = new RunContext(createParams());
            const after = performance.now();
            expect(ctx.StartTime).toBeGreaterThanOrEqual(before);
            expect(ctx.StartTime).toBeLessThanOrEqual(after);
        });
    });

    describe('screenshot ring buffer', () => {
        it('should add and retrieve screenshots', () => {
            const ctx = new RunContext(createParams({ ScreenshotHistoryDepth: 5 }));
            ctx.AddScreenshot('screenshot_1');
            ctx.AddScreenshot('screenshot_2');

            expect(ctx.CurrentScreenshot).toBe('screenshot_2');
            expect(ctx.ScreenshotHistory).toEqual(['screenshot_1', 'screenshot_2']);
        });

        it('should evict oldest screenshot when buffer is full', () => {
            const ctx = new RunContext(createParams({ ScreenshotHistoryDepth: 3 }));
            ctx.AddScreenshot('a');
            ctx.AddScreenshot('b');
            ctx.AddScreenshot('c');
            // Buffer is now full [a, b, c]
            ctx.AddScreenshot('d');
            // Should evict 'a': [b, c, d]

            expect(ctx.ScreenshotHistory).toEqual(['b', 'c', 'd']);
            expect(ctx.CurrentScreenshot).toBe('d');
        });

        it('should maintain max size through many additions', () => {
            const ctx = new RunContext(createParams({ ScreenshotHistoryDepth: 2 }));
            ctx.AddScreenshot('1');
            ctx.AddScreenshot('2');
            ctx.AddScreenshot('3');
            ctx.AddScreenshot('4');
            ctx.AddScreenshot('5');

            expect(ctx.ScreenshotHistory).toHaveLength(2);
            expect(ctx.ScreenshotHistory).toEqual(['4', '5']);
        });

        it('should return empty string as CurrentScreenshot when no screenshots added', () => {
            const ctx = new RunContext(createParams());
            expect(ctx.CurrentScreenshot).toBe('');
        });

        it('should return a copy of the buffer from ScreenshotHistory', () => {
            const ctx = new RunContext(createParams());
            ctx.AddScreenshot('test');

            const history = ctx.ScreenshotHistory;
            history.push('mutated');

            // Original buffer should not be affected
            expect(ctx.ScreenshotHistory).toEqual(['test']);
        });

        it('should handle buffer size of 1', () => {
            const ctx = new RunContext(createParams({ ScreenshotHistoryDepth: 1 }));
            ctx.AddScreenshot('first');
            expect(ctx.ScreenshotHistory).toEqual(['first']);

            ctx.AddScreenshot('second');
            expect(ctx.ScreenshotHistory).toEqual(['second']);
            expect(ctx.CurrentScreenshot).toBe('second');
        });
    });

    describe('step history', () => {
        it('should add steps and track count', () => {
            const ctx = new RunContext(createParams());
            ctx.AddStep(createStep(1));
            ctx.AddStep(createStep(2));

            expect(ctx.StepCount).toBe(2);
            expect(ctx.StepHistory).toHaveLength(2);
            expect(ctx.StepHistory[0].StepNumber).toBe(1);
            expect(ctx.StepHistory[1].StepNumber).toBe(2);
        });

        it('should start with StepCount 0', () => {
            const ctx = new RunContext(createParams());
            expect(ctx.StepCount).toBe(0);
        });
    });

    describe('LastJudgeFeedback', () => {
        it('should be settable and gettable', () => {
            const ctx = new RunContext(createParams());
            expect(ctx.LastJudgeFeedback).toBeUndefined();

            ctx.LastJudgeFeedback = 'Try a different approach';
            expect(ctx.LastJudgeFeedback).toBe('Try a different approach');
        });

        it('should be clearable by setting to undefined', () => {
            const ctx = new RunContext(createParams());
            ctx.LastJudgeFeedback = 'feedback';
            ctx.LastJudgeFeedback = undefined;
            expect(ctx.LastJudgeFeedback).toBeUndefined();
        });
    });

    describe('CurrentUrl', () => {
        it('should be settable and gettable', () => {
            const ctx = new RunContext(createParams());
            ctx.CurrentUrl = 'https://example.com/page';
            expect(ctx.CurrentUrl).toBe('https://example.com/page');
        });
    });

    describe('ElapsedMs', () => {
        it('should return a positive duration', () => {
            const ctx = new RunContext(createParams());
            expect(ctx.ElapsedMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe('BuildStepSummary', () => {
        it('should return empty string with no steps', () => {
            const ctx = new RunContext(createParams());
            expect(ctx.BuildStepSummary()).toBe('');
        });

        it('should include step number and reasoning', () => {
            const ctx = new RunContext(createParams());
            ctx.AddStep(createStep(1, { ControllerReasoning: 'Click the login button' }));

            const summary = ctx.BuildStepSummary();
            expect(summary).toContain('Step 1');
            expect(summary).toContain('Click the login button');
        });

        it('should include action types and results', () => {
            const click = new ClickAction();
            click.X = 100;
            click.Y = 200;

            const actionResult = new ActionExecutionResult(click);
            actionResult.Success = true;

            const step = createStep(1, {
                ActionsRequested: [click],
                ActionResults: [actionResult],
            });

            const ctx = new RunContext(createParams());
            ctx.AddStep(step);

            const summary = ctx.BuildStepSummary();
            expect(summary).toContain('Click');
            expect(summary).toContain('OK');
        });

        it('should include failed action results', () => {
            const click = new ClickAction();
            const failResult = new ActionExecutionResult(click);
            failResult.Success = false;
            failResult.Error = 'element not visible';

            const step = createStep(1, {
                ActionsRequested: [click],
                ActionResults: [failResult],
            });

            const ctx = new RunContext(createParams());
            ctx.AddStep(step);

            const summary = ctx.BuildStepSummary();
            expect(summary).toContain('FAIL');
            expect(summary).toContain('element not visible');
        });

        it('should include tool call results', () => {
            const toolCall = new ToolCallRecord();
            toolCall.ToolName = 'search_db';
            toolCall.Success = true;
            toolCall.Result = 'found 5 records';

            const step = createStep(1, { ToolCalls: [toolCall] });

            const ctx = new RunContext(createParams());
            ctx.AddStep(step);

            const summary = ctx.BuildStepSummary();
            expect(summary).toContain('Tool search_db');
            expect(summary).toContain('found 5 records');
        });

        it('should include failed tool calls', () => {
            const toolCall = new ToolCallRecord();
            toolCall.ToolName = 'broken_tool';
            toolCall.Success = false;
            toolCall.Error = 'connection refused';

            const step = createStep(1, { ToolCalls: [toolCall] });

            const ctx = new RunContext(createParams());
            ctx.AddStep(step);

            const summary = ctx.BuildStepSummary();
            expect(summary).toContain('FAIL');
            expect(summary).toContain('connection refused');
        });

        it('should include step errors', () => {
            const err = new ComputerUseError('BrowserCrash', 'browser process terminated');
            const step = createStep(1, { Error: err });

            const ctx = new RunContext(createParams());
            ctx.AddStep(step);

            const summary = ctx.BuildStepSummary();
            expect(summary).toContain('ERROR');
            expect(summary).toContain('browser process terminated');
        });

        it('should truncate long tool results', () => {
            const toolCall = new ToolCallRecord();
            toolCall.ToolName = 'big_result';
            toolCall.Success = true;
            toolCall.Result = 'x'.repeat(2000);

            const step = createStep(1, { ToolCalls: [toolCall] });

            const ctx = new RunContext(createParams());
            ctx.AddStep(step);

            const summary = ctx.BuildStepSummary();
            expect(summary).toContain('[truncated]');
            // Should not contain the full 2000 chars
            expect(summary.length).toBeLessThan(2000);
        });

        it('should handle null tool result', () => {
            const toolCall = new ToolCallRecord();
            toolCall.ToolName = 'null_result';
            toolCall.Success = true;
            toolCall.Result = null;

            const step = createStep(1, { ToolCalls: [toolCall] });

            const ctx = new RunContext(createParams());
            ctx.AddStep(step);

            const summary = ctx.BuildStepSummary();
            expect(summary).toContain('OK (no data)');
        });

        it('should format multiple steps separated by newlines', () => {
            const ctx = new RunContext(createParams());
            ctx.AddStep(createStep(1, { ControllerReasoning: 'First step' }));
            ctx.AddStep(createStep(2, { ControllerReasoning: 'Second step' }));

            const summary = ctx.BuildStepSummary();
            const lines = summary.split('\n');
            expect(lines).toHaveLength(2);
            expect(lines[0]).toContain('Step 1');
            expect(lines[1]).toContain('Step 2');
        });

        it('should show "No reasoning" when ControllerReasoning is empty', () => {
            const ctx = new RunContext(createParams());
            ctx.AddStep(createStep(1, { ControllerReasoning: '' }));

            const summary = ctx.BuildStepSummary();
            expect(summary).toContain('No reasoning');
        });
    });
});
