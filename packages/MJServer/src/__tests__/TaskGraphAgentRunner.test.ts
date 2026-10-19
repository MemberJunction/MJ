/**
 * Tests for `TaskGraphAgentRunner`.
 *
 * Verifies that when a task node in a durable task graph executes a specialist agent
 * (such as Query Builder or Research Report Writer) and finishes with a payload,
 * the runner resolves the originating `ConversationDetailID` and persists artifacts
 * via `AgentRunner.ProcessAgentArtifacts`.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        Instance: { Users: [] },
        Users: [],
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJTaskEntity: class {},
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIAgentEntityExtended: class {},
    MJAIAgentRunEntityExtended: class {},
}));
vi.mock('@memberjunction/ai', () => ({ ChatMessageRole: { user: 'user' } }));

const { runAgent, processAgentArtifacts, canUserRunAgent, mockEngineAgents } = vi.hoisted(() => ({
    runAgent: vi.fn(),
    processAgentArtifacts: vi.fn(),
    canUserRunAgent: vi.fn().mockResolvedValue(true),
    mockEngineAgents: [{ ID: 'qb-agent' }, { ID: 'writer-agent' }] as Array<{ ID: string }>,
}));
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgent = runAgent;
        ProcessAgentArtifacts = processAgentArtifacts;
    },
}));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Agents: mockEngineAgents,
                CanUserRunAgent: canUserRunAgent,
            };
        },
    },
}));

import { TaskGraphAgentRunner } from '../services/TaskGraphAgentRunner';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

describe('TaskGraphAgentRunner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        canUserRunAgent.mockResolvedValue(true);
        runAgent.mockResolvedValue({
            success: true,
            payload: { queryName: 'Top Users', sql: 'SELECT TOP 10 * FROM Users' },
            agentRun: { ID: 'step-run-1', Message: 'Built Top Users query' },
        });
        processAgentArtifacts.mockResolvedValue(undefined);
    });

    it('resolves ConversationDetailID from the submitting parent run and persists specialist agent artifacts', async () => {
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                if (entityName === 'MJ: AI Agents') {
                    return { ID: 'qb-agent', Name: 'Query Builder', Load: vi.fn().mockResolvedValue(true) };
                }
                if (entityName === 'MJ: AI Agent Runs') {
                    return {
                        ID: 'parent-run-1',
                        ConversationID: 'conv-1',
                        ConversationDetailID: 'origin-detail-1',
                        Load: vi.fn().mockResolvedValue(true),
                    };
                }
                return { Load: vi.fn().mockResolvedValue(false) };
            }),
        } as unknown as IMetadataProvider;

        const runner = new TaskGraphAgentRunner();
        const outcome = await runner.RunAgentForTask({
            TaskID: 'task-step-1',
            AgentID: 'qb-agent',
            SubmittingAgentRunID: 'parent-run-1',
            InputPayload: { goal: 'Top 10 users' },
            DependencyOutputs: new Map(),
            Provider: provider,
            ContextUser: { ID: 'user-1' } as UserInfo,
        });

        expect(outcome.Success).toBe(true);
        expect(outcome.AgentRunID).toBe('step-run-1');
        expect(runAgent).toHaveBeenCalledTimes(1);
        expect(runAgent.mock.calls[0][0].inputArtifacts).toEqual([]);
        expect(processAgentArtifacts).toHaveBeenCalledTimes(1);
        expect(processAgentArtifacts.mock.calls[0][0].artifactDirective?.behavior).toBe('create-new');
        expect(processAgentArtifacts.mock.calls[0][1]).toBe('origin-detail-1');
    });

    it('falls back to resolving ConversationDetailID from the task hierarchy when SubmittingAgentRunID has none', async () => {
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                if (entityName === 'MJ: AI Agents') {
                    return { ID: 'writer-agent', Name: 'Research Report Writer', Load: vi.fn().mockResolvedValue(true) };
                }
                if (entityName === 'MJ: Tasks') {
                    return {
                        ID: 'task-step-2',
                        ConversationDetailID: 'task-detail-2',
                        ParentID: 'parent-task-1',
                        Load: vi.fn().mockResolvedValue(true),
                    };
                }
                return { Load: vi.fn().mockResolvedValue(false) };
            }),
        } as unknown as IMetadataProvider;

        const runner = new TaskGraphAgentRunner();
        const outcome = await runner.RunAgentForTask({
            TaskID: 'task-step-2',
            AgentID: 'writer-agent',
            SubmittingAgentRunID: null,
            InputPayload: { topic: 'Executive summary' },
            DependencyOutputs: new Map(),
            Provider: provider,
            ContextUser: { ID: 'user-1' } as UserInfo,
        });

        expect(outcome.Success).toBe(true);
        expect(processAgentArtifacts).toHaveBeenCalledTimes(1);
        expect(processAgentArtifacts.mock.calls[0][0].artifactDirective?.behavior).toBe('create-new');
        expect(processAgentArtifacts.mock.calls[0][1]).toBe('task-detail-2');
    });

    it('refuses execution when the acting user lacks run permission on the target agent', async () => {
        canUserRunAgent.mockResolvedValue(false);
        const provider = {
            GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
                if (entityName === 'MJ: AI Agents') {
                    return { ID: 'restricted-agent', Name: 'Restricted Agent', Load: vi.fn().mockResolvedValue(true) };
                }
                return { Load: vi.fn().mockResolvedValue(false) };
            }),
        } as unknown as IMetadataProvider;

        const runner = new TaskGraphAgentRunner();
        const outcome = await runner.RunAgentForTask({
            TaskID: 'task-step-restricted',
            AgentID: 'restricted-agent',
            SubmittingAgentRunID: null,
            InputPayload: {},
            DependencyOutputs: new Map(),
            Provider: provider,
            ContextUser: { ID: 'user-no-perm' } as UserInfo,
        });

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toContain('User does not have permission to run agent "Restricted Agent"');
        expect(runAgent).not.toHaveBeenCalled();
    });
});
