/**
 * The task-graph capability gate, asserted through the HARNESS path rather than the Loop path.
 *
 * `HarnessAgentType extends LoopAgentType` and *intentionally* inherits `DetermineNextStep` — the
 * harness speaks the Loop contract, so the Loop type's parsing, validation and retry-feedback
 * behaviour is correct as-is. A direct consequence, easy to miss because it is invisible at either
 * class on its own: adding `'Tasks'` to the Loop response union hands the primitive to external
 * agent harnesses (Claude Code / Codex / Pi running inside MJ) at the same instant it reaches
 * ordinary Loop agents.
 *
 * That is the design working, not a leak — but it moves the gate from "nice property of one class"
 * to "the thing standing between a sandboxed external CLI and durable server-side work executed
 * under the invoking user". Asserting the gate on `LoopAgentType` alone would not prove it holds
 * here: inheritance could be broken by a later override, and the harness populates its params bag
 * through its own execution path. So it is tested where it actually has to hold.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HarnessAgentType } from '../HarnessAgentType';
import type { AIPromptRunResult, ExecuteAgentParams, TaskGraphSpec } from '@memberjunction/ai-core-plus';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

function mockPromptResult(response: Record<string, unknown>): AIPromptRunResult {
    return {
        success: true,
        result: JSON.stringify(response),
        chatResult: {} as AIPromptRunResult['chatResult'],
    };
}

function paramsWith(enableTaskGraphs: boolean | undefined): ExecuteAgentParams {
    return {
        data: { __agentTypePromptParams: enableTaskGraphs === undefined ? {} : { enableTaskGraphs } },
    } as unknown as ExecuteAgentParams;
}

const spec: TaskGraphSpec = {
    workflowName: 'Harness-emitted graph',
    tasks: [
        { tempId: 'a', name: 'Gather', description: 'gather', kind: 'Agent' as const, configuration: { agentName: 'Query Builder' }, dependsOn: [] },
        { tempId: 'b', name: 'Report', description: 'report', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['a'] },
    ],
};

const emit = (tasks: unknown) => mockPromptResult({ taskComplete: false, nextStep: { type: 'Tasks', tasks } });

describe('HarnessAgentType — inherited task-graph capability gate', () => {
    let agent: HarnessAgentType;

    beforeEach(() => {
        agent = new HarnessAgentType();
    });

    it('inherits DetermineNextStep from LoopAgentType rather than overriding it', () => {
        // The gate lives in the inherited method. If a future change gives the harness its own
        // DetermineNextStep, every assertion below silently starts testing a different code path —
        // so pin the inheritance itself, not just its current behaviour.
        expect(HarnessAgentType.prototype.hasOwnProperty('DetermineNextStep')).toBe(false);
    });

    it('rejects a task graph from a harness agent that has not opted in', async () => {
        const result = await agent.DetermineNextStep(emit(spec), paramsWith(false), {}, {});
        expect(result.step).toBe('Retry');
        expect(result.errorMessage).toMatch(/not enabled/i);
    });

    it('fails CLOSED when the harness params bag never mentions task graphs', async () => {
        // The realistic default. An external CLI harness configured before this capability existed
        // has no `enableTaskGraphs` key at all, and must not acquire durable reach by omission.
        const result = await agent.DetermineNextStep(emit(spec), paramsWith(undefined), {}, {});
        expect(result.step).toBe('Retry');
        expect(result.errorMessage).toMatch(/not enabled/i);
    });

    it('admits a graph once the harness agent is explicitly opted in', async () => {
        const result = await agent.DetermineNextStep(emit(spec), paramsWith(true), {}, {});
        expect(result.step).toBe('Tasks');
        expect(result.taskGraph?.spec.workflowName).toBe('Harness-emitted graph');
    });

    it('applies the same validation to harness emissions as to Loop emissions', async () => {
        const cyclic: TaskGraphSpec = {
            workflowName: 'Cyclic',
            tasks: [
                { tempId: 'a', name: 'A', description: 'a', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['b'] },
                { tempId: 'b', name: 'B', description: 'b', kind: 'Agent' as const, configuration: { agentName: 'Sage' }, dependsOn: ['a'] },
            ],
        };
        const result = await agent.DetermineNextStep(emit(cyclic), paramsWith(true), {}, {});
        expect(result.step).toBe('Retry');
        expect(result.errorMessage).toContain('CycleDetected');
    });
});
