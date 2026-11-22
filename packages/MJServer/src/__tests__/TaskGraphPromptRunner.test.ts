/**
 * Tests for `TaskGraphPromptRunner`:
 * - Authoritative `CostUsd` and `TokensUsed` propagation on both successful and failed paid runs.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { AIPromptParams, AIPromptRunResult, MJAIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';
import type { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { TaskPromptRunParams } from '@memberjunction/task-graph';

type PromptTestResultValue = Record<string, string | number | boolean> | string;

const {
    executePrompt,
    mockEngineConfig,
    mockPrompts,
    mockLogError,
} = vi.hoisted(() => ({
    executePrompt: vi.fn<(params: AIPromptParams) => Promise<AIPromptRunResult<PromptTestResultValue>>>(),
    mockEngineConfig: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    mockPrompts: [{ ID: 'prompt-1', Name: 'SummarizeStep' }] as Array<Partial<AIPromptParams['prompt']>>,
    mockLogError: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: (...args: Parameters<typeof actual.LogError>) => mockLogError(...args),
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: mockEngineConfig,
                Prompts: mockPrompts,
            };
        },
    },
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    AIPromptRunner: class {
        public ExecutePrompt: AIPromptRunner['ExecutePrompt'] = executePrompt as AIPromptRunner['ExecutePrompt'];
    },
}));

import { TaskGraphPromptRunner } from '../services/TaskGraphPromptRunner';

function makePromptRunResult(
    overrides: Partial<Omit<AIPromptRunResult<PromptTestResultValue>, 'promptRun'>> & {
        promptRun?: Partial<MJAIPromptRunEntityExtended>;
    },
): AIPromptRunResult<PromptTestResultValue> {
    return overrides as Partial<AIPromptRunResult<PromptTestResultValue>> as AIPromptRunResult<PromptTestResultValue>;
}

function makeParams(overrides: Partial<TaskPromptRunParams> = {}): TaskPromptRunParams {
    return {
        TaskID: 'task-prompt-1',
        PromptID: 'prompt-1',
        InputPayload: { topic: 'quarterly report' },
        DependencyOutputs: new Map(),
        Provider: {} as Partial<IMetadataProvider> as IMetadataProvider,
        ContextUser: { ID: 'user-1' } as Partial<UserInfo> as UserInfo,
        ...overrides,
    };
}

describe('CR-PRODUCTION-WORKFLOW-USAGE: TaskGraphPromptRunner cost and token propagation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('propagates authoritative CostUsd and TokensUsed from promptRun on successful execution', async () => {
        executePrompt.mockResolvedValue(makePromptRunResult({
            success: true,
            result: { summary: 'Done' },
            promptRun: {
                ID: 'pr-success-1',
                TotalCost: 0.125,
                Cost: 0.1,
                TokensUsedRollup: 1450,
                TokensUsed: 1200,
            },
            cost: 0.1,
            tokensUsed: 1200,
        }));

        const runner = new TaskGraphPromptRunner();
        const outcome = await runner.RunPromptForTask(makeParams());

        expect(outcome.Success).toBe(true);
        expect(outcome.PromptRunID).toBe('pr-success-1');
        expect(outcome.CostUsd).toBeCloseTo(0.125, 6);
        expect(outcome.TokensUsed).toBe(1450);
    });

    it('propagates authoritative CostUsd and TokensUsed on paid prompt failure', async () => {
        executePrompt.mockResolvedValue(makePromptRunResult({
            success: false,
            errorMessage: 'Validation failed after retry',
            promptRun: {
                ID: 'pr-fail-1',
                TotalCost: 0.085,
                TokensUsed: 940,
            },
            cost: 0.085,
            tokensUsed: 940,
        }));

        const runner = new TaskGraphPromptRunner();
        const outcome = await runner.RunPromptForTask(makeParams());

        expect(outcome.Success).toBe(false);
        expect(outcome.PromptRunID).toBe('pr-fail-1');
        expect(outcome.ErrorMessage).toContain('Validation failed');
        expect(outcome.CostUsd).toBeCloseTo(0.085, 6);
        expect(outcome.TokensUsed).toBe(940);
    });

    it('falls back to combinedCost / combinedTokensUsed when promptRun fields are null', async () => {
        executePrompt.mockResolvedValue(makePromptRunResult({
            success: true,
            result: '{"ok":true}',
            promptRun: {
                ID: 'pr-parallel-1',
                TotalCost: null,
                TokensUsedRollup: null,
            },
            combinedCost: 0.22,
            combinedTokensUsed: 2200,
        }));

        const runner = new TaskGraphPromptRunner();
        const outcome = await runner.RunPromptForTask(makeParams());

        expect(outcome.Success).toBe(true);
        expect(outcome.PromptRunID).toBe('pr-parallel-1');
        expect(outcome.CostUsd).toBeCloseTo(0.22, 6);
        expect(outcome.TokensUsed).toBe(2200);
    });
});
