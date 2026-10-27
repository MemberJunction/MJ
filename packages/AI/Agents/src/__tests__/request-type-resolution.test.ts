/**
 * Tests for BaseAgent.resolveRequestTypeId — the Chat-step lookup that picks the
 * `MJ: AI Agent Request Types` row ("Approval" vs "Information") for a new agent request.
 *
 * The lookup must come from the AI engine's cached request types (AIEngineBase caches the table
 * during Config and exposes GetAgentRequestTypeByName), not from a private per-run RunView, so the
 * actions, the cockpit and the agent runner all resolve a type through one source.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AIEngine } from '@memberjunction/aiengine';
import type { AgentResponseForm, BaseAgentNextStep } from '@memberjunction/ai-core-plus';
import { BaseAgent } from '../base-agent';

const ctx = { ID: 'u1', Name: 'Tester' } as never;

interface RequestTypeHarness {
    resolveRequestTypeId(previousDecision: BaseAgentNextStep, contextUser?: unknown): Promise<string | null>;
}

interface FakeEngine {
    Config: ReturnType<typeof vi.fn>;
    GetAgentRequestTypeByName: ReturnType<typeof vi.fn>;
    AgentRequestTypes: Array<{ ID: string; Name: string }>;
}

function fakeEngine(types: Array<{ ID: string; Name: string }>): FakeEngine {
    const engine: FakeEngine = {
        Config: vi.fn().mockResolvedValue(undefined),
        GetAgentRequestTypeByName: vi.fn((name: string) =>
            types.find((t) => t.Name.toLowerCase() === name.trim().toLowerCase())
        ),
        AgentRequestTypes: types,
    };
    vi.spyOn(AIEngine, 'Instance', 'get').mockReturnValue(engine as unknown as AIEngine);
    return engine;
}

function approvalForm(): AgentResponseForm {
    return {
        questions: [
            {
                id: 'q1',
                label: 'Approve this?',
                type: {
                    type: 'buttongroup',
                    options: [
                        { label: 'Approve', value: 'approve' },
                        { label: 'Reject', value: 'reject' },
                    ],
                },
            },
        ],
    } as unknown as AgentResponseForm;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('BaseAgent.resolveRequestTypeId', () => {
    it('resolves "Information" through the engine cache when there is no response form', async () => {
        const engine = fakeEngine([{ ID: 'RT-INFO', Name: 'Information' }, { ID: 'RT-APPR', Name: 'Approval' }]);
        const agent = new BaseAgent() as unknown as RequestTypeHarness;

        const id = await agent.resolveRequestTypeId({ step: 'Chat' } as BaseAgentNextStep, ctx);

        expect(id).toBe('RT-INFO');
        expect(engine.Config).toHaveBeenCalledWith(false, ctx);
        expect(engine.GetAgentRequestTypeByName).toHaveBeenCalledWith('Information');
    });

    it('resolves "Approval" for a two-button approve/reject form', async () => {
        const engine = fakeEngine([{ ID: 'RT-INFO', Name: 'Information' }, { ID: 'RT-APPR', Name: 'Approval' }]);
        const agent = new BaseAgent() as unknown as RequestTypeHarness;

        const id = await agent.resolveRequestTypeId({ step: 'Chat', responseForm: approvalForm() } as BaseAgentNextStep, ctx);

        expect(id).toBe('RT-APPR');
        expect(engine.GetAgentRequestTypeByName).toHaveBeenCalledWith('Approval');
    });

    it('returns null when the engine has no matching request type', async () => {
        fakeEngine([]);
        const agent = new BaseAgent() as unknown as RequestTypeHarness;

        const id = await agent.resolveRequestTypeId({ step: 'Chat' } as BaseAgentNextStep, ctx);

        expect(id).toBeNull();
    });

    it('returns null instead of throwing when the engine cannot be configured', async () => {
        const engine = fakeEngine([{ ID: 'RT-INFO', Name: 'Information' }]);
        engine.Config.mockRejectedValue(new Error('metadata unavailable'));
        const agent = new BaseAgent() as unknown as RequestTypeHarness;

        const id = await agent.resolveRequestTypeId({ step: 'Chat' } as BaseAgentNextStep, ctx);

        expect(id).toBeNull();
    });
});
