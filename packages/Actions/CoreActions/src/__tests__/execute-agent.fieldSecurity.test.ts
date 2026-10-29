/**
 * Execute Agent's `AgentResult` is delivered to the caller, so it is projected for the caller.
 *
 * The notes and examples in `memoryContext` come from the AI engine's cache, which is loaded as
 * the system user: they are full-width entity objects whatever user the action runs for. Without
 * a projection, a field the caller may not read reaches them through `AgentResult`, and through
 * the action log's `ResultParams`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmployeeEntityInfo, BuildUser, INTERN_ROLE_ID, HR_ROLE_ID, LoadEmployeeFor, SALARY, EMPLOYEE_ENTITY_ID } from './fieldSecurityFixture';

const { runAgentMock, agents } = vi.hoisted(() => ({
    runAgentMock: vi.fn(),
    agents: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: unknown) => target,
}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/actions-base', () => ({ ActionParam: class ActionParam { Name = ''; Type = ''; Value: unknown = null; } }));
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class { RunAgent = (...a: unknown[]) => runAgentMock(...a); },
}));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined), get Agents() { return agents; } } },
}));

import { ExecuteAgentAction } from '../custom/ai/execute-agent.action';
import type { IMetadataProvider } from '@memberjunction/core';

type Param = { Name: string; Type: string; Value: unknown };
const run = (action: ExecuteAgentAction, params: unknown) =>
    (action as unknown as { InternalRunAction(p: unknown): Promise<unknown> }).InternalRunAction(params);

const entityInfo = EmployeeEntityInfo();
const provider = {
    Entities: [entityInfo],
    EntityByID: (id: string) => (id === EMPLOYEE_ENTITY_ID ? entityInfo : undefined),
} as unknown as IMetadataProvider;

/** Runs the action for `caller`, with the agent returning system-identity (engine-cached) memory. */
async function agentResultFor(caller: ReturnType<typeof BuildUser>): Promise<string> {
    const cachedNote = await LoadEmployeeFor(entityInfo, null);
    const cachedExample = await LoadEmployeeFor(entityInfo, null);
    const agentRun = await LoadEmployeeFor(entityInfo, null);
    runAgentMock.mockResolvedValue({
        success: true,
        payload: {},
        agentRun,
        memoryContext: { notes: [cachedNote], examples: [cachedExample] },
    });
    const params = {
        Params: [{ Name: 'AgentName', Type: 'Input', Value: 'Helper' }] as Param[],
        ContextUser: caller,
        Provider: provider,
    };
    await run(new ExecuteAgentAction(), params);
    return JSON.stringify(params.Params.find((p) => p.Name === 'AgentResult')?.Value);
}

describe('ExecuteAgentAction AgentResult field security', () => {
    beforeEach(() => {
        runAgentMock.mockReset();
        agents.length = 0;
        agents.push({ ID: 'AG-1', Name: 'Helper', ParentID: null, ExposeAsAction: true });
    });

    it('omits a field the caller may not read from engine-cached notes, examples and the run record', async () => {
        const json = await agentResultFor(BuildUser([INTERN_ROLE_ID], 'intern-1'));
        expect(json).not.toContain(String(SALARY));
        expect(json).not.toContain('Salary');
        const parsed = JSON.parse(json);
        expect(parsed.memoryContext.notes[0]).toMatchObject({ ID: expect.any(String), Name: 'Ada' });
        expect(parsed.memoryContext.examples[0]).toMatchObject({ Name: 'Ada' });
        expect(parsed.agentRun).toMatchObject({ Name: 'Ada' });
    });

    it('keeps the full row for a caller who may read every field', async () => {
        const json = await agentResultFor(BuildUser([HR_ROLE_ID], 'hr-1'));
        expect(JSON.parse(json).memoryContext.notes[0].Salary).toBe(SALARY);
    });
});
