import { describe, it, expect } from 'vitest';
import {
    ComputerUseError,
    ClickAction,
    TypeAction,
    ScrollAction,
    WaitAction,
    NavigateAction,
    GoBackAction,
    GoForwardAction,
    RefreshAction,
    BoundingBox,
    ActionExecutionResult,
    ToolCallRecord,
    JsonSchema,
    JsonSchemaProperty,
    JudgeContext,
    JudgeVerdict,
    StepRecord,
    ControllerPromptRequest,
    ControllerPromptResponse,
    ToolCallRequest,
    ToolDefinition,
    RunComputerUseParams,
} from '../index.js';

describe('@memberjunction/computer-use — public API exports', () => {
    it('should export ComputerUseError', () => {
        expect(ComputerUseError).toBeDefined();
        const err = new ComputerUseError('LLMError', 'test');
        expect(err.Category).toBe('LLMError');
    });

    it('should export all browser action classes', () => {
        expect(new ClickAction().Type).toBe('Click');
        expect(new TypeAction().Type).toBe('Type');
        expect(new ScrollAction().Type).toBe('Scroll');
        expect(new WaitAction().Type).toBe('Wait');
        expect(new NavigateAction().Type).toBe('Navigate');
        expect(new GoBackAction().Type).toBe('GoBack');
        expect(new GoForwardAction().Type).toBe('GoForward');
        expect(new RefreshAction().Type).toBe('Refresh');
    });

    it('should export BoundingBox', () => {
        const box = new BoundingBox();
        box.XMin = 10;
        box.YMin = 20;
        box.XMax = 100;
        box.YMax = 200;
        expect(box.XMin).toBe(10);
    });

    it('should export ActionExecutionResult', () => {
        const action = new ClickAction();
        const result = new ActionExecutionResult(action);
        expect(result.Success).toBe(false);
        expect(result.Action).toBe(action);
    });

    it('should export ToolCallRecord', () => {
        const record = new ToolCallRecord();
        expect(record.ToolName).toBe('');
        expect(record.Success).toBe(false);
    });

    it('should export JsonSchema and JsonSchemaProperty', () => {
        const schema = new JsonSchema();
        expect(schema.Type).toBe('object');

        const prop = new JsonSchemaProperty();
        prop.Type = 'string';
        prop.Description = 'test';
        expect(prop.toJSON()).toEqual({ type: 'string', description: 'test' });
    });

    it('should export JudgeContext and JudgeVerdict', () => {
        const ctx = new JudgeContext();
        expect(ctx.Goal).toBe('');

        const verdict = new JudgeVerdict();
        expect(verdict.Done).toBe(false);
        expect(verdict.Confidence).toBe(0);
    });

    it('should export StepRecord', () => {
        const step = new StepRecord();
        expect(step.StepNumber).toBe(0);
        expect(step.ActionsRequested).toEqual([]);
    });

    it('should export controller prompt types', () => {
        const req = new ControllerPromptRequest();
        expect(req.Goal).toBe('');

        const res = new ControllerPromptResponse();
        expect(res.Actions).toEqual([]);

        const toolReq = new ToolCallRequest();
        expect(toolReq.ToolName).toBe('');

        const toolDef = new ToolDefinition();
        expect(toolDef.Name).toBe('');
    });

    it('should export RunComputerUseParams with sensible defaults', () => {
        const params = new RunComputerUseParams();
        expect(params.Goal).toBe('');
        expect(params.MaxSteps).toBe(30);
        expect(params.ScreenshotHistoryDepth).toBe(20);
        expect(params.Headless).toBe(true);
        expect(params.ScreenshotDelayMs).toBe(500);
    });
});
