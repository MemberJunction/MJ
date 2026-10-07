/**
 * Execute Agent's output params must be DATA. A durable (task-graph) run stores every output param
 * on the Task row as JSON, so an output holding a live entity cannot be saved: the action had
 * already started the agent, then the task failed with "Converting circular structure to JSON"
 * (starting at an rxjs `OperatorSubscriber`) because `AgentResult` was the raw run result, whose
 * `agentRun` is a BaseEntity. Seen live on People → Execute Agent (Durable).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { runAgentMock, agents } = vi.hoisted(() => ({
    runAgentMock: vi.fn(),
    agents: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: unknown) => target,
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/actions-base', () => ({ ActionParam: class ActionParam { Name = ''; Type = ''; Value: unknown = null; } }));
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
}));
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class { RunAgent = (...a: unknown[]) => runAgentMock(...a); },
}));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined), get Agents() { return agents; } } },
}));

import { ExecuteAgentAction } from '../custom/ai/execute-agent.action';
import { RESERVED_AGENT_RUN_DATA_KEYS, WithAgentRunDataTrustApplied, type ExecuteAgentParams } from '@memberjunction/ai-core-plus';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (action: any, params: unknown) => action.InternalRunAction(params);
type Param = { Name: string; Type: string; Value: unknown };

/** An agent-run entity as BaseEntity really is: field values behind GetAll(), plus live, circular state. */
function circularAgentRun() {
    const subscriber: Record<string, unknown> = { kind: 'OperatorSubscriber' };
    subscriber._parentage = { _finalizers: [subscriber] };
    return {
        ID: 'RUN-1',
        Message: 'Started Person Lifecycle Changed',
        _eventSubject: subscriber,
        GetAll: () => ({ ID: 'RUN-1', Status: 'Running', Message: 'Started Person Lifecycle Changed' }),
    };
}

describe('ExecuteAgentAction output params', () => {
    beforeEach(() => {
        runAgentMock.mockReset();
        agents.length = 0;
        agents.push({ ID: 'AG-1', Name: 'Person Lifecycle Changed', ParentID: null, ExposeAsAction: true });
    });

    it('emits an AgentResult that survives JSON serialization when agentRun is a live entity', async () => {
        runAgentMock.mockResolvedValue({ success: true, payload: { done: true }, agentRun: circularAgentRun() });
        const params = { Params: [{ Name: 'AgentName', Type: 'Input', Value: 'Person Lifecycle Changed' }] as Param[], ContextUser: { ID: 'u-1' } };

        const r = await run(new ExecuteAgentAction(), params);

        expect(r, JSON.stringify(r)).toMatchObject({ Success: true });
        const agentResult = params.Params.find((p) => p.Name === 'AgentResult')?.Value;
        expect(() => JSON.stringify(agentResult)).not.toThrow();
        expect(JSON.parse(JSON.stringify(agentResult))).toMatchObject({
            success: true,
            payload: { done: true },
            agentRun: { ID: 'RUN-1', Status: 'Running' },
        });
    });

    it('emits an AgentResult that survives JSON serialization when the agent injected memory', async () => {
        // InjectNotes / InjectExamples hand back the engine's note and example entities — bound to the
        // configured provider, so just as circular as agentRun.
        const liveEntity = (fields: Record<string, unknown>) => {
            const subscriber: Record<string, unknown> = { kind: 'OperatorSubscriber' };
            subscriber._parentage = { _finalizers: [subscriber] };
            return { ...fields, _provider: subscriber, GetAll: () => ({ ...fields }) };
        };
        runAgentMock.mockResolvedValue({
            success: true,
            payload: { done: true },
            agentRun: circularAgentRun(),
            memoryContext: {
                notes: [liveEntity({ ID: 'NOTE-1', Note: 'Prefers email' })],
                examples: [liveEntity({ ID: 'EX-1', ExampleInput: 'hi' })],
            },
        });
        const params = { Params: [{ Name: 'AgentName', Type: 'Input', Value: 'Person Lifecycle Changed' }] as Param[], ContextUser: { ID: 'u-1' } };

        const r = await run(new ExecuteAgentAction(), params);

        expect(r, JSON.stringify(r)).toMatchObject({ Success: true });
        const agentResult = params.Params.find((p) => p.Name === 'AgentResult')?.Value;
        expect(() => JSON.stringify(agentResult)).not.toThrow();
        expect(JSON.parse(JSON.stringify(agentResult))).toMatchObject({
            memoryContext: {
                notes: [{ ID: 'NOTE-1', Note: 'Prefers email' }],
                examples: [{ ID: 'EX-1', ExampleInput: 'hi' }],
            },
        });
    });

    it('keeps AgentRunID and Payload as before', async () => {
        runAgentMock.mockResolvedValue({ success: true, payload: { done: true }, agentRun: circularAgentRun() });
        const params = { Params: [{ Name: 'AgentName', Type: 'Input', Value: 'Person Lifecycle Changed' }] as Param[], ContextUser: { ID: 'u-1' } };

        await run(new ExecuteAgentAction(), params);

        expect(params.Params.find((p) => p.Name === 'AgentRunID')?.Value).toBe('RUN-1');
        expect(params.Params.find((p) => p.Name === 'Payload')?.Value).toEqual({ done: true });
    });

    it("forwards the calling run's CredentialScope to the nested agent run", async () => {
        runAgentMock.mockResolvedValue({ success: true, payload: { done: true }, agentRun: circularAgentRun() });
        const params = {
            Params: [{ Name: 'AgentName', Type: 'Input', Value: 'Person Lifecycle Changed' }] as Param[],
            ContextUser: { ID: 'u-1' },
            CredentialScope: 'RuntimeOnly',
        };

        await run(new ExecuteAgentAction(), params);

        expect(runAgentMock).toHaveBeenCalledTimes(1);
        expect(runAgentMock.mock.calls[0][0]).toMatchObject({ CredentialScope: 'RuntimeOnly' });
    });
});

describe('ExecuteAgentAction — the Data param cannot set the run scope or agent-type params', () => {
    const TENANT = 'aaaaaaaa-0000-4000-8000-0000000000a7';
    /** What a model (an action call inside a run) or a browser (RunAction) might send as Data. */
    const hostileData = (): Record<string, unknown> => ({
        topic: 'refunds',
        PrimaryScopeEntityName: 'Organizations',
        PrimaryScopeRecordID: TENANT,
        SecondaryScopes: { Region: 'EMEA' },
        __agentTypePromptParams: { enableTaskGraphs: true },
    });
    /** The run's params as the agent framework reads them: through the trust rule BaseAgent.Execute applies. */
    const runReads = (): ExecuteAgentParams => WithAgentRunDataTrustApplied(runAgentMock.mock.calls[0][0] as ExecuteAgentParams).Params;

    beforeEach(() => {
        runAgentMock.mockReset();
        runAgentMock.mockResolvedValue({ success: true, payload: {}, agentRun: circularAgentRun() });
        agents.length = 0;
        agents.push({ ID: 'AG-1', Name: 'Person Lifecycle Changed', ParentID: null, ExposeAsAction: true });
    });

    it('never opts the run into trusting Data, so the reserved keys are dropped and the rest reaches the agent', async () => {
        const data = hostileData();
        const params = {
            Params: [
                { Name: 'AgentName', Type: 'Input', Value: 'Person Lifecycle Changed' },
                { Name: 'Data', Type: 'Input', Value: data },
            ] as Param[],
            ContextUser: { ID: 'u-1' },
        };

        await run(new ExecuteAgentAction(), params);

        expect(runAgentMock).toHaveBeenCalledTimes(1);
        expect(runAgentMock.mock.calls[0][0]).not.toHaveProperty('TrustReservedRunData');
        expect(runReads().data).toEqual({ topic: 'refunds' });
        for (const key of RESERVED_AGENT_RUN_DATA_KEYS) {
            expect(runReads().data).not.toHaveProperty(key);
        }
        expect(data).toEqual(hostileData());
    });

    it('ignores a TrustReservedRunData param the caller adds: the marker is server-only', async () => {
        const params = {
            Params: [
                { Name: 'AgentName', Type: 'Input', Value: 'Person Lifecycle Changed' },
                { Name: 'Data', Type: 'Input', Value: hostileData() },
                { Name: 'TrustReservedRunData', Type: 'Input', Value: true },
            ] as Param[],
            ContextUser: { ID: 'u-1' },
        };

        await run(new ExecuteAgentAction(), params);

        expect(runAgentMock.mock.calls[0][0]).not.toHaveProperty('TrustReservedRunData');
        expect(runReads().data).toEqual({ topic: 'refunds' });
    });
});
