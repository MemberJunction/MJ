/**
 * Unit tests for AgentAuditService, ExecutionLogger metrics, and AgentService stdout suppression
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const mocks = vi.hoisted(() => ({
    runEntity: {} as Record<string, unknown>,
    promptRunEntity: {} as Record<string, unknown>,
    promptRunLoaded: false,
    runViewResults: [] as Array<Record<string, unknown>>,
    agentRunnerResult: {} as Record<string, unknown>,
    agentRunnerProgressToEmit: [] as Array<{ step: string; message: string; metadata?: Record<string, unknown> }>,
    agentRow: { ID: 'agent-1', Name: 'Skip' } as Record<string, unknown>,
}));

vi.mock('../lib/mj-provider', () => ({
    InitializeMJProvider: vi.fn(async () => ({})),
    CloseMJProvider: vi.fn(async () => undefined),
    FlushStdout: vi.fn(async () => undefined),
}));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        Users: [{ ID: 'user-1', Name: 'Admin', Email: 'admin@memberjunction.org', IsActive: true, UserRoles: [] }],
    },
}));

vi.mock('@memberjunction/core', () => ({
    UserInfo: class {},
    Metadata: class {
        async GetEntityObject(entityName: string) {
            if (entityName === 'MJ: AI Agent Runs') {
                return {
                    ...mocks.runEntity,
                    Load: vi.fn(async () => true),
                };
            }
            if (entityName === 'MJ: AI Prompt Runs') {
                return {
                    ...mocks.promptRunEntity,
                    Load: vi.fn(async () => mocks.promptRunLoaded),
                };
            }
            return { Load: vi.fn(async () => false) };
        }
    },
    RunView: class {
        async RunView(params: { EntityName: string }) {
            if (params.EntityName === 'MJ: AI Agents') {
                return { Success: true, Results: [mocks.agentRow] };
            }
            if (params.EntityName === 'MJ: AI Agent Run Steps') {
                return { Success: true, Results: mocks.runViewResults };
            }
            return { Success: true, Results: [] };
        }
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJAIAgentRunEntity: class {},
    MJAIAgentRunStepEntity: class {},
    MJAIPromptRunEntity: class {},
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
    MJAIAgentEntityExtended: class {},
}));

vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        async RunAgent(params: { onProgress?: (p: { step: string; message: string; metadata?: Record<string, unknown> }) => void }) {
            for (const p of mocks.agentRunnerProgressToEmit) {
                params.onProgress?.(p);
            }
            return mocks.agentRunnerResult;
        }
    },
}));

import { AgentAuditService } from '../services/AgentAuditService';
import { AgentService } from '../services/AgentService';

describe('AgentAuditService', () => {
    beforeEach(() => {
        mocks.promptRunLoaded = false;
        mocks.promptRunEntity = {};
        mocks.runViewResults = [];
    });

    it('populates totalCost, real estimatedCost, tokensUsed, actionsUsed, and stepSuccess on RunSummary', async () => {
        mocks.runEntity = {
            ID: 'run-1',
            Agent: 'Query Agent',
            AgentID: 'agent-1',
            Status: 'Completed',
            StartedAt: '2026-11-25T10:00:00.000Z',
            CompletedAt: '2026-11-25T10:00:05.000Z',
            TotalTokensUsed: 5766,
            TotalCost: 0.00544,
            TotalCostRollup: 0.00544,
        };
        mocks.runViewResults = [
            {
                ID: 'step-1',
                StepNumber: 1,
                StepName: 'Loop Iteration 1',
                StepType: 'Prompt',
                Status: 'Completed',
                StartedAt: '2026-11-25T10:00:00.000Z',
                CompletedAt: '2026-11-25T10:00:02.000Z',
            },
            {
                ID: 'step-2',
                StepNumber: 2,
                StepName: 'Execute Action: Run Ad-hoc Query',
                StepType: 'Actions',
                Status: 'Completed',
                InputData: JSON.stringify({ actionName: 'Run Ad-hoc Query', actionParams: { Sql: 'SELECT 1' } }),
                StartedAt: '2026-11-25T10:00:02.000Z',
                CompletedAt: '2026-11-25T10:00:03.000Z',
            },
            {
                ID: 'step-3',
                StepNumber: 3,
                StepName: 'Execute Action: Run Ad-hoc Query',
                StepType: 'Actions',
                Status: 'Completed',
                InputData: JSON.stringify({ actionName: 'Run Ad-hoc Query', actionParams: { Sql: 'SELECT 2' } }),
                StartedAt: '2026-11-25T10:00:03.000Z',
                CompletedAt: '2026-11-25T10:00:04.000Z',
            },
        ];

        const service = new AgentAuditService();
        const summary = await service.GetRunSummary('run-1', { includeStepList: true, maxTokens: 5000 });

        expect(summary.totalTokens).toBe(5766);
        expect(summary.tokensUsed).toBe(5766);
        expect(summary.totalCost).toBeCloseTo(0.00544, 6);
        expect(summary.estimatedCost).toBeCloseTo(0.00544, 6);
        expect(summary.actionsUsed).toEqual(['Run Ad-hoc Query']);
        expect(summary.stepSuccess).toBe(true);
    });

    it('loads MJAIPromptRunEntity via TargetLogID when detailLevel is full on a Prompt step', async () => {
        const longSystemPrompt = 'You are an expert SQL analyst. ' + 'x'.repeat(4000);
        mocks.runViewResults = [
            {
                ID: 'step-1',
                StepNumber: 1,
                StepName: 'Loop Iteration 1',
                StepType: 'Prompt',
                Status: 'Completed',
                TargetLogID: 'prompt-run-1',
                InputData: JSON.stringify({ stepCount: 1 }),
                OutputData: JSON.stringify({ message: 'done' }),
                StartedAt: '2026-11-25T10:00:00.000Z',
                CompletedAt: '2026-11-25T10:00:02.000Z',
            },
        ];
        mocks.promptRunLoaded = true;
        mocks.promptRunEntity = {
            Model: 'claude-sonnet-4-5',
            Vendor: 'Anthropic',
            Messages: JSON.stringify([
                { role: 'system', content: longSystemPrompt },
                { role: 'user', content: 'List tables' },
            ]),
            TokensPrompt: 2100,
            TokensCompletion: 150,
            TokensUsed: 2250,
            TotalCost: 0.0042,
        };

        const service = new AgentAuditService();
        const detail = await service.GetStepDetail('run-1', 1, { detailLevel: 'full', maxTokens: 5000 });

        expect(detail.promptRun).toBeDefined();
        expect(detail.promptRun?.model).toBe('claude-sonnet-4-5');
        expect(detail.promptRun?.vendor).toBe('Anthropic');
        expect(detail.promptRun?.systemPrompt).toBe(longSystemPrompt);
        expect(detail.promptRun?.messages).toContain('List tables');
        expect(detail.inputTokens).toBe(2100);
        expect(detail.outputTokens).toBe(150);
        expect(detail.cost).toBeCloseTo(0.0042, 6);
    });
});

describe('AgentService execution logging and stdout suppression', () => {
    let tempDir: string;
    let originalCwd: string;

    beforeEach(() => {
        originalCwd = process.cwd();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicli-exec-test-'));
        process.chdir(tempDir);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('suppresses progress stdout when SuppressProgress is true and records aiModelCalls + toolsUsed', async () => {
        mocks.agentRunnerProgressToEmit = [
            { step: 'prompt_execution', message: 'Thinking...', metadata: { stepCount: 1 } },
            { step: 'action_execution', message: 'Running action', metadata: { stepCount: 2 } },
            { step: 'finalization', message: 'Done', metadata: { stepCount: 3 } },
        ];
        mocks.agentRunnerResult = {
            success: true,
            agentRun: {
                ID: 'run-exec-1',
                Message: 'All done',
                TotalTokensUsed: 1200,
                TotalPromptIterations: 2,
                Steps: [
                    { StepType: 'Prompt', StepName: 'Prompt 1', InputData: '{}' },
                    { StepType: 'Prompt', StepName: 'Prompt 2', InputData: '{}' },
                    {
                        StepType: 'Actions',
                        StepName: 'Execute Action: Run Ad-hoc Query',
                        InputData: JSON.stringify({ actionName: 'Run Ad-hoc Query' }),
                    },
                ],
            },
        };

        const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        const service = new AgentService();
        const result = await service.ExecuteAgent('Skip', 'Hello', { SuppressProgress: true });

        expect(result.success).toBe(true);
        expect(stdoutSpy).not.toHaveBeenCalled();

        const summaryPath = result.logFilePath!.replace('_execution.log', '_summary.json');
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
            aiModelCalls: number;
            toolsUsed: string[];
        };
        expect(summary.aiModelCalls).toBe(2);
        expect(summary.toolsUsed).toEqual(['Run Ad-hoc Query']);
    });
});
