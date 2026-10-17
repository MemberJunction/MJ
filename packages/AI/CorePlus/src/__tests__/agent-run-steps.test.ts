import { describe, it, expect } from 'vitest';
import type { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import { UUIDMap } from '@memberjunction/global';
import {
    InitAgentRunStep,
    FinalizeAgentRunStep,
    ResolvePayloadAtStart,
    ApplyResolvedPayloadAtStart,
    ResolvePayloadAtEnd,
    ApplyResolvedPayloadAtEnd,
} from '../agent-run-steps';

/** A minimal mutable stand-in — the helpers only assign/read plain fields, so no BaseEntity machinery is needed. */
function fakeStep(): MJAIAgentRunStepEntity {
    return {} as unknown as MJAIAgentRunStepEntity;
}

const UUID = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

describe('initAgentRunStep', () => {
    it('populates the core started fields', () => {
        const step = fakeStep();
        InitAgentRunStep(step, { AgentRunID: 'run-1', StepNumber: 3, StepType: 'Prompt', StepName: 'Prompt: Controller' });

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
        InitAgentRunStep(valid, { AgentRunID: 'r', StepNumber: 1, StepType: 'Prompt', StepName: 'x', TargetID: UUID });
        expect(valid.TargetID).toBe(UUID);

        const invalid = fakeStep();
        InitAgentRunStep(invalid, { AgentRunID: 'r', StepNumber: 1, StepType: 'Prompt', StepName: 'x', TargetID: 'not-a-uuid' });
        expect(invalid.TargetID).toBeUndefined(); // ignored, left unset
    });

    it('sets ParentID + TargetLogID when provided (child/nested step)', () => {
        const step = fakeStep();
        InitAgentRunStep(step, {
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
        InitAgentRunStep(without, { AgentRunID: 'r', StepNumber: 1, StepType: 'Tool', StepName: 'x' });
        expect(without.InputData).toBeUndefined();
        expect(without.PayloadAtStart).toBeUndefined();
        expect(without.PayloadAtEnd).toBeUndefined();

        const withData = fakeStep();
        InitAgentRunStep(withData, {
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

    it('sets PayloadAtStartSourceStepID and PayloadAtEndSourceStepID when provided', () => {
        const step = fakeStep();
        InitAgentRunStep(step, {
            AgentRunID: 'r',
            StepNumber: 2,
            StepType: 'Prompt',
            StepName: 'x',
            PayloadAtStartSourceStepID: UUID,
            PayloadAtEndSourceStepID: UUID,
        });
        expect(step.PayloadAtStartSourceStepID).toBe(UUID);
        expect(step.PayloadAtEndSourceStepID).toBe(UUID);
    });

    it('leaves PayloadAtStartSourceStepID and PayloadAtEndSourceStepID unset when null or undefined', () => {
        const omitted = fakeStep();
        InitAgentRunStep(omitted, { AgentRunID: 'r', StepNumber: 2, StepType: 'Prompt', StepName: 'x' });
        expect(omitted.PayloadAtStartSourceStepID).toBeUndefined();
        expect(omitted.PayloadAtEndSourceStepID).toBeUndefined();

        const explicitNull = fakeStep();
        InitAgentRunStep(explicitNull, {
            AgentRunID: 'r',
            StepNumber: 2,
            StepType: 'Prompt',
            StepName: 'x',
            PayloadAtStartSourceStepID: null,
            PayloadAtEndSourceStepID: null,
        });
        expect(explicitNull.PayloadAtStartSourceStepID).toBeUndefined();
        expect(explicitNull.PayloadAtEndSourceStepID).toBeUndefined();
    });
});

describe('finalizeAgentRunStep', () => {
    function startedStep(): MJAIAgentRunStepEntity {
        const step = fakeStep();
        InitAgentRunStep(step, { AgentRunID: 'r', StepNumber: 1, StepType: 'Prompt', StepName: 'x' });
        return step;
    }

    it('marks success → Completed', () => {
        const step = startedStep();
        FinalizeAgentRunStep(step, { success: true });
        expect(step.Status).toBe('Completed');
        expect(step.Success).toBe(true);
        expect(step.CompletedAt).toBeInstanceOf(Date);
        expect(step.ErrorMessage).toBeNull();
    });

    it('marks failure → Failed and records the error message', () => {
        const step = startedStep();
        FinalizeAgentRunStep(step, { success: false, errorMessage: 'model offline' });
        expect(step.Status).toBe('Failed');
        expect(step.Success).toBe(false);
        expect(step.ErrorMessage).toBe('model offline');
    });

    it('coerces an empty error message to null', () => {
        const step = startedStep();
        FinalizeAgentRunStep(step, { success: false, errorMessage: '' });
        expect(step.ErrorMessage).toBeNull();
    });

    it('stamps a late TargetLogID (prompt run id captured after execution)', () => {
        const step = startedStep();
        FinalizeAgentRunStep(step, { success: true, targetLogID: 'promptrun-9' });
        expect(step.TargetLogID).toBe('promptrun-9');
    });

    it('wraps outputData in a standard {success, durationMs, errorMessage} context envelope', () => {
        const step = startedStep();
        FinalizeAgentRunStep(step, { success: true, outputData: { foo: 'bar' } });
        const parsed = JSON.parse(step.OutputData as string);
        expect(parsed.foo).toBe('bar');
        expect(parsed.context.success).toBe(true);
        expect(typeof parsed.context.durationMs).toBe('number');
        expect(parsed.context.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('leaves OutputData unset when no outputData is supplied', () => {
        const step = startedStep();
        FinalizeAgentRunStep(step, { success: true });
        expect(step.OutputData).toBeUndefined();
    });
});

describe('ResolvePayloadAtStart', () => {
    const SOURCE_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
    const MISSING_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f';
    const stepsById = new UUIDMap<Pick<MJAIAgentRunStepEntity, 'PayloadAtEnd'>>([[SOURCE_ID, { PayloadAtEnd: '{"p":1}' }]]);

    it('returns the stored PayloadAtStart even when a pointer is also set', () => {
        const step = { PayloadAtStart: '{"p":0}', PayloadAtStartSourceStepID: SOURCE_ID };
        expect(ResolvePayloadAtStart(step, stepsById)).toBe('{"p":0}');
    });

    it("returns the source step's PayloadAtEnd when PayloadAtStart is null", () => {
        const step = { PayloadAtStart: null, PayloadAtStartSourceStepID: SOURCE_ID };
        expect(ResolvePayloadAtStart(step, stepsById)).toBe('{"p":1}');
    });

    it('returns null when the pointer names a step that is not in the map', () => {
        const step = { PayloadAtStart: null, PayloadAtStartSourceStepID: MISSING_ID };
        expect(ResolvePayloadAtStart(step, stepsById)).toBeNull();
    });

    it('returns null when there is no stored start and no pointer', () => {
        const step = { PayloadAtStart: null, PayloadAtStartSourceStepID: null };
        expect(ResolvePayloadAtStart(step, stepsById)).toBeNull();
    });

    it('resolves a pointer whose letter case differs from the map key', () => {
        const step = { PayloadAtStart: null, PayloadAtStartSourceStepID: SOURCE_ID.toUpperCase() };
        expect(ResolvePayloadAtStart(step, stepsById)).toBe('{"p":1}');
    });
});

describe('ApplyResolvedPayloadAtStart', () => {
    type StepRow = Pick<MJAIAgentRunStepEntity, 'ID' | 'PayloadAtStart' | 'PayloadAtStartSourceStepID' | 'PayloadAtEnd'>;
    // Uppercase, as SQL Server returns uniqueidentifier values.
    const STEP_1 = 'D4E5F6A7-B8C9-4D0E-8F1A-3B4C5D6E7F80';
    const STEP_2 = 'E5F6A7B8-C9D0-4E1F-9A2B-4C5D6E7F8091';
    const STEP_3 = 'F6A7B8C9-D0E1-4F2A-8B3C-5D6E7F8091A2';
    const MISSING_ID = '0718293A-4B5C-4D6E-9F80-91A2B3C4D5E6';

    it('fills only rows whose start is null and whose pointer resolves', () => {
        const steps: StepRow[] = [
            { ID: STEP_1, PayloadAtStart: null, PayloadAtStartSourceStepID: null, PayloadAtEnd: '{"n":1}' },
            { ID: STEP_2, PayloadAtStart: null, PayloadAtStartSourceStepID: STEP_1, PayloadAtEnd: '{"n":2}' },
            { ID: STEP_3, PayloadAtStart: null, PayloadAtStartSourceStepID: STEP_2, PayloadAtEnd: '{"n":3}' },
        ];
        ApplyResolvedPayloadAtStart(steps);
        expect(steps.map((s) => s.PayloadAtStart)).toEqual([null, '{"n":1}', '{"n":2}']);
    });

    it('leaves a stored PayloadAtStart untouched', () => {
        const steps: StepRow[] = [
            { ID: STEP_1, PayloadAtStart: null, PayloadAtStartSourceStepID: null, PayloadAtEnd: '{"n":1}' },
            { ID: STEP_2, PayloadAtStart: '{"stored":true}', PayloadAtStartSourceStepID: STEP_1, PayloadAtEnd: '{"n":2}' },
        ];
        ApplyResolvedPayloadAtStart(steps);
        expect(steps[1].PayloadAtStart).toBe('{"stored":true}');
    });

    it('leaves PayloadAtStart null when the pointer does not resolve', () => {
        const steps: StepRow[] = [
            { ID: STEP_1, PayloadAtStart: null, PayloadAtStartSourceStepID: null, PayloadAtEnd: '{"n":1}' },
            { ID: STEP_2, PayloadAtStart: null, PayloadAtStartSourceStepID: MISSING_ID, PayloadAtEnd: '{"n":2}' },
        ];
        ApplyResolvedPayloadAtStart(steps);
        expect(steps[1].PayloadAtStart).toBeNull();
    });

    it('resolves a pointer to a row that comes later in the array', () => {
        const steps: StepRow[] = [
            { ID: STEP_2, PayloadAtStart: null, PayloadAtStartSourceStepID: STEP_1, PayloadAtEnd: '{"n":2}' },
            { ID: STEP_1, PayloadAtStart: null, PayloadAtStartSourceStepID: null, PayloadAtEnd: '{"n":1}' },
        ];
        ApplyResolvedPayloadAtStart(steps);
        expect(steps[0].PayloadAtStart).toBe('{"n":1}');
    });
});

describe('ResolvePayloadAtEnd & ApplyResolvedPayloadAtEnd', () => {
    type StepRow = Pick<MJAIAgentRunStepEntity, 'ID' | 'PayloadAtEnd' | 'PayloadAtEndSourceStepID'>;
    const STEP_1 = 'D4E5F6A7-B8C9-4D0E-8F1A-3B4C5D6E7F80';
    const STEP_2 = 'E5F6A7B8-C9D0-4E1F-9A2B-4C5D6E7F8091';
    const STEP_3 = 'F6A7B8C9-D0E1-4F2A-8B3C-5D6E7F8091A2';
    const MISSING_ID = '0718293A-4B5C-4D6E-9F80-91A2B3C4D5E6';

    it('ResolvePayloadAtEnd returns stored PayloadAtEnd or source step PayloadAtEnd', () => {
        const stepsById = new UUIDMap<Pick<MJAIAgentRunStepEntity, 'PayloadAtEnd'>>([
            [STEP_1, { PayloadAtEnd: '{"end":1}' }],
        ]);
        expect(ResolvePayloadAtEnd({ PayloadAtEnd: '{"own":1}', PayloadAtEndSourceStepID: STEP_1 }, stepsById)).toBe('{"own":1}');
        expect(ResolvePayloadAtEnd({ PayloadAtEnd: null, PayloadAtEndSourceStepID: STEP_1.toLowerCase() }, stepsById)).toBe('{"end":1}');
        expect(ResolvePayloadAtEnd({ PayloadAtEnd: null, PayloadAtEndSourceStepID: MISSING_ID }, stepsById)).toBeNull();
        expect(ResolvePayloadAtEnd({ PayloadAtEnd: null, PayloadAtEndSourceStepID: null }, stepsById)).toBeNull();
    });

    it('ApplyResolvedPayloadAtEnd fills only rows whose end is null and whose pointer resolves', () => {
        const steps: StepRow[] = [
            { ID: STEP_1, PayloadAtEnd: '{"n":1}', PayloadAtEndSourceStepID: null },
            { ID: STEP_2, PayloadAtEnd: null, PayloadAtEndSourceStepID: STEP_1 },
            { ID: STEP_3, PayloadAtEnd: null, PayloadAtEndSourceStepID: STEP_1 },
        ];
        ApplyResolvedPayloadAtEnd(steps);
        expect(steps.map((s) => s.PayloadAtEnd)).toEqual(['{"n":1}', '{"n":1}', '{"n":1}']);
    });
});

