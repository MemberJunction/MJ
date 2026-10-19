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

const runAgent = vi.fn().mockResolvedValue({
    success: true,
    payload: { queryName: 'Top Users', sql: 'SELECT TOP 10 * FROM Users' },
    agentRun: { ID: 'step-run-1', Message: 'Built Top Users query' },
});
const processAgentArtifacts = vi.fn().mockResolvedValue(undefined);
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgent = runAgent;
        ProcessAgentArtifacts = processAgentArtifacts;
    },
}));

import { TaskGraphAgentRunner } from '../services/TaskGraphAgentRunner';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

describe('TaskGraphAgentRunner', () => {
    beforeEach(() => vi.clearAllMocks());

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
        expect(processAgentArtifacts).toHaveBeenCalledTimes(1);
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
        expect(processAgentArtifacts.mock.calls[0][1]).toBe('task-detail-2');
    });
});
