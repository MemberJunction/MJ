import { describe, expect, it, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import {
    LoadVideoStudioAgent,
    VIDEO_STUDIO_STAGES,
    VideoStudioAgent,
} from '../agents/video-studio-agent.js';

interface TestHarness {
    agent: VideoStudioAgent;
    agentEntity: MJAIAgentEntityExtended;
    agentRun: MJAIAgentRunEntityExtended;
    contextUser: UserInfo;
    createdSteps: Array<{ stepType: string; stepName: string }>;
    finalizedSteps: Array<{
        stepEntity: MJAIAgentRunStepEntityExtended | null;
        success: boolean;
        errorMessage?: string;
    }>;
    invokeValidateWithTracking: () => Promise<ReturnType<VideoStudioAgent['validateAgent']>>;
}

function createHarness(
    hierarchy: string[],
    agentName = 'Video Studio',
): TestHarness {
    const agent = new VideoStudioAgent();
    const agentEntity = {
        ID: '637A678A-0BF8-49DD-BA9E-B2FB97577BD1',
        Name: agentName,
        Status: 'Active',
        StartingPayloadValidation: null,
        StartingPayloadValidationMode: 'Fail',
    } as unknown as MJAIAgentEntityExtended;

    const agentRun = {
        ID: '11111111-2222-3333-4444-555555555555',
        Status: 'Running',
        Success: null,
        ErrorMessage: null,
        FinalStep: null,
        Save: vi.fn().mockResolvedValue(true),
    } as unknown as MJAIAgentRunEntityExtended;

    const contextUser = {
        ID: '00000000-0000-0000-0000-000000000001',
        Name: 'System',
    } as unknown as UserInfo;

    const createdSteps: Array<{ stepType: string; stepName: string }> = [];
    const finalizedSteps: Array<{
        stepEntity: MJAIAgentRunStepEntityExtended | null;
        success: boolean;
        errorMessage?: string;
    }> = [];

    const internal = agent as unknown as {
        _agentRun: MJAIAgentRunEntityExtended;
        _agentHierarchy: string[];
        createStepEntity: (opts: {
            stepType: string;
            stepName: string;
            contextUser?: UserInfo;
        }) => Promise<MJAIAgentRunStepEntityExtended | null>;
        finalizeStepEntity: (
            stepEntity: MJAIAgentRunStepEntityExtended | null,
            success: boolean,
            errorMessage?: string,
        ) => Promise<void>;
        validateAgentWithTracking: (
            a: MJAIAgentEntityExtended,
            u?: UserInfo,
        ) => Promise<ReturnType<VideoStudioAgent['validateAgent']>>;
    };

    internal._agentRun = agentRun;
    internal._agentHierarchy = [...hierarchy];
    internal.createStepEntity = vi.fn(async (opts) => {
        createdSteps.push({ stepType: opts.stepType, stepName: opts.stepName });
        return {
            ID: '99999999-8888-7777-6666-555555555555',
            StepType: opts.stepType,
            StepName: opts.stepName,
        } as unknown as MJAIAgentRunStepEntityExtended;
    });
    internal.finalizeStepEntity = vi.fn(async (stepEntity, success, errorMessage) => {
        finalizedSteps.push({ stepEntity, success, errorMessage });
    });

    return {
        agent,
        agentEntity,
        agentRun,
        contextUser,
        createdSteps,
        finalizedSteps,
        invokeValidateWithTracking: () =>
            internal.validateAgentWithTracking(agentEntity, contextUser),
    };
}

describe('VideoStudioAgent cycle guard (VS-INV-2)', () => {
    it('registers VideoStudioAgent on BaseAgent with MJGlobal and exposes VIDEO_STUDIO_STAGES', () => {
        LoadVideoStudioAgent();
        const reg = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseAgent,
            'VideoStudioAgent',
        );
        expect(reg?.SubClass).toBe(VideoStudioAgent);
        expect(VIDEO_STUDIO_STAGES).toHaveLength(7);
    });

    it('fails validation and writes a failed Validation step when Video Studio is in the ancestor hierarchy', async () => {
        // initializeAgentRun sets _agentHierarchy = [...parentAgentHierarchy, agent.Name]
        const parentHierarchy = [
            'Video Studio',
            'Video Studio - Director',
            'Research Agent',
            'Research Report Writer',
        ];
        const harness = createHarness([...parentHierarchy, 'Video Studio']);

        const result = await harness.invokeValidateWithTracking();

        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        const expectedMessage =
            'Video Studio is already running higher in this call chain (Video Studio → Video Studio - Director → Research Agent → Research Report Writer → Video Studio). A production cannot start another production.';
        expect(harness.agentRun.ErrorMessage).toBe(expectedMessage);
        expect(harness.agentRun.Status).toBe('Failed');
        expect(harness.agentRun.Success).toBe(false);
        expect(harness.agentRun.FinalStep).toBe('Failed');

        expect(harness.createdSteps).toEqual([
            { stepType: 'Validation', stepName: 'Agent Validation' },
        ]);
        expect(harness.finalizedSteps).toHaveLength(1);
        expect(harness.finalizedSteps[0].success).toBe(false);
        expect(harness.finalizedSteps[0].errorMessage).toBe(expectedMessage);
    });

    it('matches ancestor names case-insensitively and trimmed', async () => {
        const harness = createHarness([
            '  video studio  ',
            'Video Studio - Director',
            'Research Agent',
            'Research Report Writer',
            'Video Studio',
        ]);

        const result = await harness.invokeValidateWithTracking();

        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(harness.agentRun.ErrorMessage).toContain(
            'Video Studio is already running higher in this call chain',
        );
        expect(harness.finalizedSteps[0]?.success).toBe(false);
    });

    it('passes validation when called from Query Builder', async () => {
        const harness = createHarness(['Query Builder', 'Video Studio']);

        const result = await harness.invokeValidateWithTracking();

        expect(result).toBeNull();
        expect(harness.agentRun.Status).toBe('Running');
        expect(harness.agentRun.ErrorMessage).toBeNull();
        expect(harness.createdSteps).toEqual([
            { stepType: 'Validation', stepName: 'Agent Validation' },
        ]);
        expect(harness.finalizedSteps).toHaveLength(1);
        expect(harness.finalizedSteps[0].success).toBe(true);
    });

    it('passes validation on a root run (only Video Studio in _agentHierarchy)', async () => {
        const harness = createHarness(['Video Studio']);

        const result = await harness.invokeValidateWithTracking();

        expect(result).toBeNull();
        expect(harness.agentRun.Status).toBe('Running');
        expect(harness.agentRun.ErrorMessage).toBeNull();
        expect(harness.finalizedSteps).toHaveLength(1);
        expect(harness.finalizedSteps[0].success).toBe(true);
    });

    it('refuses a task-graph-dispatched run whose reconstructed parentAgentHierarchy contains Video Studio (VS-INV-2b)', async () => {
        // TaskGraphAgentRunner walks ParentRunID across sub-agent and task-graph hops and passes
        // parentAgentHierarchy (root-first) to AgentRunner.RunAgent, which BaseAgent turns into
        // _agentHierarchy = [...parentAgentHierarchy, agent.Name].
        const parentAgentHierarchy = [
            'Video Studio',
            'Video Studio - Director',
            'Research Agent',
            'Report Writer',
        ];
        const harness = createHarness([
            ...parentAgentHierarchy,
            'Video Studio',
        ]);

        const result = await harness.invokeValidateWithTracking();

        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(harness.agentRun.Status).toBe('Failed');
        expect(harness.agentRun.ErrorMessage).toBe(
            'Video Studio is already running higher in this call chain (Video Studio → Video Studio - Director → Research Agent → Report Writer → Video Studio). A production cannot start another production.',
        );
        expect(harness.finalizedSteps).toHaveLength(1);
        expect(harness.finalizedSteps[0].success).toBe(false);
    });
});

