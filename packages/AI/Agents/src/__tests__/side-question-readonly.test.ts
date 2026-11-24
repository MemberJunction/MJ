import { describe, it, expect, vi, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { BaseAgentNextStep, ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import { BaseAgent } from '../base-agent';
import { AgentRunner } from '../AgentRunner';

function fakeActionEntity(
    name: string,
    configObject: Record<string, unknown> | null = null
): MJActionEntityExtended {
    return {
        ID: `act-${name.toLowerCase().replace(/\s+/g, '-')}`,
        Name: name,
        Params: { Items: [] },
        Config_Object: configObject,
    } as Partial<MJActionEntityExtended> as MJActionEntityExtended;
}

describe('Side Questions — ReadOnlyMode Action Guard, Client Tools & Sub-Agent Propagation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('evaluates Config_Object.isReadOnly, disallowWhenTainted, Verb, and linear name fallback in IsActionAllowedInReadOnlyMode', () => {
        const agent = new BaseAgent();
        const isAllowed = Reflect.get(agent, 'IsActionAllowedInReadOnlyMode') as (
            actionEntity: MJActionEntityExtended,
            params?: ExecuteAgentParams
        ) => boolean;

        // 1. Explicit Config_Object.isReadOnly takes highest precedence
        expect(isAllowed.call(agent, fakeActionEntity('Delete Cache Preview', { isReadOnly: true }))).toBe(true);
        expect(isAllowed.call(agent, fakeActionEntity('Get Secret Token', { isReadOnly: false }))).toBe(false);

        // 2. disallowWhenTainted blocks
        expect(isAllowed.call(agent, fakeActionEntity('Send Email', { disallowWhenTainted: true }))).toBe(false);

        // 3. Integration Verb metadata respected before name fallback
        expect(isAllowed.call(agent, fakeActionEntity('Custom CRM Op', { Verb: 'List' }))).toBe(true);
        expect(isAllowed.call(agent, fakeActionEntity('Custom CRM Op', { Verb: 'Upsert' }))).toBe(false);

        // 4. Linear name fallback
        expect(isAllowed.call(agent, fakeActionEntity('Delete HubSpot Contact'))).toBe(false);
        expect(isAllowed.call(agent, fakeActionEntity('HubSpot Create Contact'))).toBe(false);
        expect(isAllowed.call(agent, fakeActionEntity('Execute MCP Tool'))).toBe(false);
        expect(isAllowed.call(agent, fakeActionEntity('Get Records'))).toBe(true);
    });

    it('blocks mutating actions in checkSideQuestionReadOnlyAction while allowing reads and non-side-question turns', () => {
        const agent = new BaseAgent();
        const checkFn = Reflect.get(agent, 'checkSideQuestionReadOnlyAction') as (
            params: ExecuteAgentParams,
            action: { name: string; params: Record<string, unknown> },
            actionEntity: MJActionEntityExtended,
            contextUser?: UserInfo
        ) => { Success: boolean; ResultCode?: string; Message?: string } | null;

        const roParams = {
            agent: { ID: 'a-1', Name: 'Sage' } as MJAIAgentEntityExtended,
            conversationMessages: [],
            SideQuestionContext: {
                ParentConversationID: 'conv-1',
                ParentBranchID: null,
                ReadOnlyMode: true,
                ActiveRunsSnapshot: '',
            },
        } as Partial<ExecuteAgentParams> as ExecuteAgentParams;

        const emailBlocked = checkFn.call(
            agent,
            roParams,
            { name: 'Send Email', params: {} },
            fakeActionEntity('Send Email', { disallowWhenTainted: true })
        );
        expect(emailBlocked?.Success).toBe(false);
        expect(emailBlocked?.Message).toContain('read-only mode');

        const deleteBlocked = checkFn.call(
            agent,
            roParams,
            { name: 'Delete HubSpot Contact', params: {} },
            fakeActionEntity('Delete HubSpot Contact')
        );
        expect(deleteBlocked?.Success).toBe(false);

        const searchAllowed = checkFn.call(
            agent,
            roParams,
            { name: 'Get Records', params: {} },
            fakeActionEntity('Get Records')
        );
        expect(searchAllowed).toBeNull();

        const normalParams = {
            agent: { ID: 'a-1', Name: 'Sage' } as MJAIAgentEntityExtended,
            conversationMessages: [],
        } as Partial<ExecuteAgentParams> as ExecuteAgentParams;
        expect(
            checkFn.call(agent, normalParams, { name: 'Send Email', params: {} }, fakeActionEntity('Send Email', { disallowWhenTainted: true }))
        ).toBeNull();
    });

    it('withholds client tools and mutating catalog actions in promptWithholding and refuses client tools in ReadOnlyMode', () => {
        const agent = new BaseAgent();
        const promptWithholding = Reflect.get(agent, 'promptWithholding') as (
            params: ExecuteAgentParams
        ) => { TaskGraphs: boolean; Handoff: boolean; CallerContext: boolean; ClientTools: boolean; ReadOnlyMode: boolean };
        const clientToolsRefusal = Reflect.get(agent, 'clientToolsRefusal') as (
            params: ExecuteAgentParams,
            prev: BaseAgentNextStep
        ) => BaseAgentNextStep | null;

        const roParams = {
            agent: { ID: 'a-1', Name: 'Sage' } as MJAIAgentEntityExtended,
            conversationMessages: [],
            SideQuestionContext: {
                ParentConversationID: 'conv-1',
                ParentBranchID: null,
                ReadOnlyMode: true,
                ActiveRunsSnapshot: '',
            },
        } as Partial<ExecuteAgentParams> as ExecuteAgentParams;

        const withheld = promptWithholding.call(agent, roParams);
        expect(withheld.TaskGraphs).toBe(true);
        expect(withheld.Handoff).toBe(true);
        expect(withheld.ClientTools).toBe(true);
        expect(withheld.ReadOnlyMode).toBe(true);

        const refusal = clientToolsRefusal.call(agent, roParams, {
            step: 'Clients',
            terminate: false,
            previousPayload: {},
            newPayload: {},
        } as Partial<BaseAgentNextStep> as BaseAgentNextStep);
        expect(refusal?.step).toBe('Failed');
        expect(refusal?.errorMessage).toContain('read-only Side Question');
    });

    it('propagates SideQuestionContext into child ExecuteAgentParams with ActiveRunsSnapshot cleared to avoid duplication', async () => {
        const agent = new BaseAgent();
        const captured: ExecuteAgentParams[] = [];

        const spy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockImplementation(async (childParams) => {
            captured.push(childParams);
            return {
                success: true,
                agentRun: { ID: 'child-run-1', Status: 'Completed' },
            } as never;
        });

        Reflect.set(agent, '_artifactToolManager', { ExportInputArtifacts: () => undefined });
        Reflect.set(agent, 'resolveSubAgentConfiguration', () => ({}));
        Reflect.set(agent, 'prepareSubAgentMessages', async () => [{ role: 'user', content: 'Inspect status' }]);
        Reflect.set(agent, 'activeSkillIDsForRun', () => []);
        Reflect.set(agent, 'ensureTreeBudget', () => ({}));
        Reflect.set(agent, 'subAgentTaint', () => ({}));
        Reflect.set(agent, 'absorbSubAgentTaint', () => undefined);

        const sqCtx = {
            ParentConversationID: 'conv-1',
            ParentBranchID: 'branch-1',
            ReadOnlyMode: true as const,
            ActiveRunsSnapshot: 'Sage [Running]',
        };

        const runSub = Reflect.get(agent, 'ExecuteSubAgent') as (
            params: ExecuteAgentParams,
            req: Record<string, unknown>,
            subAgent: MJAIAgentEntityExtended,
            step: Record<string, unknown>
        ) => Promise<unknown>;

        await runSub.call(
            agent,
            {
                agent: { ID: 'sage-id', Name: 'Sage' } as MJAIAgentEntityExtended,
                conversationMessages: [],
                SideQuestionContext: sqCtx,
                data: {},
            } as Partial<ExecuteAgentParams> as ExecuteAgentParams,
            { id: 'sub-1', name: 'Research Agent', message: 'Check it', terminateAfter: false },
            { ID: 'sub-1', Name: 'Research Agent' } as MJAIAgentEntityExtended,
            { ID: 'step-1', StepNumber: 1, InputData: null }
        );

        expect(spy).toHaveBeenCalledTimes(1);
        expect(captured[0].SideQuestionContext).toEqual({
            ParentConversationID: 'conv-1',
            ParentBranchID: 'branch-1',
            ReadOnlyMode: true,
            ActiveRunsSnapshot: null,
        });
    });
});
