import { describe, it, expect } from 'vitest';
import type { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import { initAgentRunStep, finalizeAgentRunStep } from '../agent-run-steps';

/** A minimal mutable stand-in — the helpers only assign/read plain fields, so no BaseEntity machinery is needed. */
function fakeStep(): MJAIAgentRunStepEntity {
    return {} as unknown as MJAIAgentRunStepEntity;
}

const UUID = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

describe('initAgentRunStep', () => {
    it('populates the core started fields', () => {
        const step = fakeStep();
        initAgentRunStep(step, { AgentRunID: 'run-1', StepNumber: 3, StepType: 'Prompt', StepName: 'Prompt: Controller' });

        expect(step.AgentRunID).toBe('run-1');
        expect(step.StepNumber).toBe(3);
        expect(step.StepType).toBe('Prompt');
        expect(step.StepName).toBe('Prompt: Controller');
        expect(step.Status).toBe('Running');
        expect(step.StartedAt).toBeInstanceOf(Date);
        // Unprovided optionals default to null (not left undefined).
        expect(step.TargetLogID).toBeNull();
        expect(step.ParentID).toBeNull();
    });

    it('stamps TargetID only when it is a valid UUID', () => {
        const valid = fakeStep();
        initAgentRunStep(valid, { AgentRunID: 'r', StepNumber: 1, StepType: 'Prompt', StepName: 'x', TargetID: UUID });
        expect(valid.TargetID).toBe(UUID);

        const invalid = fakeStep();
        initAgentRunStep(invalid, { AgentRunID: 'r', StepNumber: 1, StepType: 'Prompt', StepName: 'x', TargetID: 'not-a-uuid' });
        expect(invalid.TargetID).toBeUndefined(); // ignored, left unset
    });

    it('sets ParentID + TargetLogID when provided (child/nested step)', () => {
        const step = fakeStep();
        initAgentRunStep(step, {
            AgentRunID: 'r',
            StepNumber: 2,
            StepType: 'Prompt',
            StepName: 'child',
            ParentID: 'parent-step-1',
            TargetLogID: 'promptrun-1',
        });
        expect(step.ParentID).toBe('parent-step-1');
        expect(step.TargetLogID).toBe('promptrun-1');
    });

    it('sets payload/input fields only when provided', () => {
        const without = fakeStep();
        initAgentRunStep(without, { AgentRunID: 'r', StepNumber: 1, StepType: 'Tool', StepName: 'x' });
        expect(without.InputData).toBeUndefined();
        expect(without.PayloadAtStart).toBeUndefined();
        expect(without.PayloadAtEnd).toBeUndefined();

        const withData = fakeStep();
        initAgentRunStep(withData, {
            AgentRunID: 'r',
            StepNumber: 1,
            StepType: 'Tool',
            StepName: 'x',
            InputData: '{"a":1}',
            PayloadAtStart: '{"p":0}',
            PayloadAtEnd: '{"p":1}',
        });
        expect(withData.InputData).toBe('{"a":1}');
        expect(withData.PayloadAtStart).toBe('{"p":0}');
        expect(withData.PayloadAtEnd).toBe('{"p":1}');
    });
});

describe('finalizeAgentRunStep', () => {
    function startedStep(): MJAIAgentRunStepEntity {
        const step = fakeStep();
        initAgentRunStep(step, { AgentRunID: 'r', StepNumber: 1, StepType: 'Prompt', StepName: 'x' });
        return step;
    }

    it('marks success → Completed', () => {
        const step = startedStep();
        finalizeAgentRunStep(step, { success: true });
        expect(step.Status).toBe('Completed');
        expect(step.Success).toBe(true);
        expect(step.CompletedAt).toBeInstanceOf(Date);
        expect(step.ErrorMessage).toBeNull();
    });

    it('marks failure → Failed and records the error message', () => {
        const step = startedStep();
        finalizeAgentRunStep(step, { success: false, errorMessage: 'model offline' });
        expect(step.Status).toBe('Failed');
        expect(step.Success).toBe(false);
        expect(step.ErrorMessage).toBe('model offline');
    });

    it('coerces an empty error message to null', () => {
        const step = startedStep();
        finalizeAgentRunStep(step, { success: false, errorMessage: '' });
        expect(step.ErrorMessage).toBeNull();
    });

    it('stamps a late TargetLogID (prompt run id captured after execution)', () => {
        const step = startedStep();
        finalizeAgentRunStep(step, { success: true, targetLogID: 'promptrun-9' });
        expect(step.TargetLogID).toBe('promptrun-9');
    });

    it('wraps outputData in a standard {success, durationMs, errorMessage} context envelope', () => {
        const step = startedStep();
        finalizeAgentRunStep(step, { success: true, outputData: { foo: 'bar' } });
        const parsed = JSON.parse(step.OutputData as string);
        expect(parsed.foo).toBe('bar');
        expect(parsed.context.success).toBe(true);
        expect(typeof parsed.context.durationMs).toBe('number');
        expect(parsed.context.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('leaves OutputData unset when no outputData is supplied', () => {
        const step = startedStep();
        finalizeAgentRunStep(step, { success: true });
        expect(step.OutputData).toBeUndefined();
    });
});
