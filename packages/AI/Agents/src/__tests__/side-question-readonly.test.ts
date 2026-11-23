import { describe, it, expect, vi, afterEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import { BaseAgent } from '../base-agent';
import { AgentRunner } from '../AgentRunner';

function fakeActionEntity(name: string, disallowWhenTainted = false): MJActionEntityExtended {
    return {
        ID: `act-${name.toLowerCase().replace(/\s+/g, '-')}`,
        Name: name,
        Params: { Items: [] },
        Config_Object: disallowWhenTainted ? { disallowWhenTainted: true } : null,
    } as unknown as MJActionEntityExtended;
}

describe('Side Questions — ReadOnlyMode Action Guard & Sub-Agent Propagation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('blocks disallowWhenTainted and mutating action names during ReadOnlyMode while allowing read actions', () => {
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
        } as unknown as ExecuteAgentParams;

        // 1. Metadata-tagged disallowWhenTainted action blocked
        const emailBlocked = checkFn.call(
            agent,
            roParams,
            { name: 'Send Email', params: {} },
            fakeActionEntity('Send Email', true)
        );
        expect(emailBlocked?.Success).toBe(false);
        expect(emailBlocked?.Message).toContain('read-only mode');

        // 2. Untagged mutating action name blocked
        const deleteBlocked = checkFn.call(
            agent,
            roParams,
            { name: 'Delete HubSpot Contact', params: {} },
            fakeActionEntity('Delete HubSpot Contact', false)
        );
        expect(deleteBlocked?.Success).toBe(false);

        // 3. Read/search action allowed
        const searchAllowed = checkFn.call(
            agent,
            roParams,
            { name: 'Get Records', params: {} },
            fakeActionEntity('Get Records', false)
        );
        expect(searchAllowed).toBeNull();

        // 4. Same mutating action allowed when NOT in SideQuestionContext
        const normalParams = {
            agent: { ID: 'a-1', Name: 'Sage' } as MJAIAgentEntityExtended,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams;
        expect(
            checkFn.call(agent, normalParams, { name: 'Send Email', params: {} }, fakeActionEntity('Send Email', true))
        ).toBeNull();
    });

    it('propagates SideQuestionContext into child ExecuteAgentParams when ExecuteSubAgent runs', async () => {
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
            } as unknown as ExecuteAgentParams,
            { id: 'sub-1', name: 'Research Agent', message: 'Check it', terminateAfter: false },
            { ID: 'sub-1', Name: 'Research Agent' } as MJAIAgentEntityExtended,
            { ID: 'step-1', StepNumber: 1, InputData: null }
        );

        expect(spy).toHaveBeenCalledTimes(1);
        expect(captured[0].SideQuestionContext).toEqual(sqCtx);
    });
});
