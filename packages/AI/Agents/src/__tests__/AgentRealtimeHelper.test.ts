import { describe, expect, it, vi } from 'vitest';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { ExecuteAgentParams, ExecuteAgentResult, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { AgentRealtimeHelper } from '../helpers/realtime/AgentRealtimeHelper';
import { BaseAgentRealtimeHelper } from '../helpers/realtime/BaseAgentRealtimeHelper';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

describe('AgentRealtimeHelper (Slice s4)', () => {
    it('resolves default AgentRealtimeHelper via ClassFactory', () => {
        const helper = ResolveAgentHelper({
            SeamKey: 'realtime',
            BaseClass: BaseAgentRealtimeHelper,
            DefaultClass: AgentRealtimeHelper,
        });
        expect(helper).toBeInstanceOf(AgentRealtimeHelper);
    });

    it('parses JSON request text and falls back to raw text when arguments are non-JSON', () => {
        const helper = new AgentRealtimeHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.ParseDelegateRequestText(ctx, JSON.stringify({ request: 'Summarize Q4 pipeline' }))).toBe(
            'Summarize Q4 pipeline'
        );
        expect(helper.ParseDelegateRequestText(ctx, 'plain text request')).toBe('plain text request');
        expect(helper.ParseDelegateRequestText(ctx, JSON.stringify({ other: 123 }))).toBe('{"other":123}');
    });

    it('returns a clear failure DelegatedResult when no target agent resolves', async () => {
        const helper = new AgentRealtimeHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ResolveRealtimeTargetAgent: () => null,
            },
        });
        const params = {
            agent: { ID: 'agent-1', Name: 'VoiceCoAgent' } as MJAIAgentEntityExtended,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams;

        const res = await helper.DelegateRealtimeToTarget(ctx, params, {}, {
            CallID: 'call-1',
            Arguments: JSON.stringify({ request: 'hello' }),
        });
        expect(res.Success).toBe(false);
        expect(res.CallID).toBe('call-1');
        expect(res.Output).toContain('No target agent is configured');
    });

    it('routes ExecuteRealtimeTool to available agent actions and rejects unavailable tools', async () => {
        const helper = new AgentRealtimeHelper();
        const actionEntity = { ID: 'act-1', Name: 'LookupOrder' } as MJActionEntityExtended;
        const execSpy = vi.fn(async (): Promise<ActionResult> => ({
            Success: true,
            Message: 'Order #42 is shipped',
            Params: [],
        }));
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetEffectiveActionsForValidation: () => [actionEntity],
                ExecuteSingleAction: execSpy,
            },
        });
        const params = {
            agent: { ID: 'agent-1', Name: 'VoiceCoAgent' } as MJAIAgentEntityExtended,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams;

        const missing = await helper.ExecuteRealtimeTool(ctx, params, {
            CallID: 'c-missing',
            ToolName: 'UnknownTool',
            Arguments: '{}',
        });
        expect(missing.Success).toBe(false);
        expect(missing.Output).toContain('not available');

        const ok = await helper.ExecuteRealtimeTool(ctx, params, {
            CallID: 'c-ok',
            ToolName: 'LookupOrder',
            Arguments: JSON.stringify({ orderId: 42 }),
        });
        expect(ok.Success).toBe(true);
        expect(ok.Output).toBe('Order #42 is shipped');
        expect(execSpy).toHaveBeenCalledTimes(1);
    });

    it('rejects StartBridgeRealtimeSession when SessionAudienceRefusal returns a reason', async () => {
        const helper = new AgentRealtimeHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                SessionAudienceRefusal: () => 'Audience adds reader; realtime refused',
            },
        });
        const params = {
            agent: { ID: 'agent-1', Name: 'VoiceCoAgent' } as MJAIAgentEntityExtended,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams;

        await expect(helper.StartBridgeRealtimeSession(ctx, params)).rejects.toThrow('Audience adds reader');
    });

    it('finalizes realtime runs via FinalizeAgentRun on success and CreateFailureResult on error', async () => {
        const helper = new AgentRealtimeHelper();
        const finalizeSpy = vi.fn(async () => ({ success: true }) as ExecuteAgentResult);
        const failSpy = vi.fn(async () => ({ success: false }) as ExecuteAgentResult);
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                FinalizeAgentRun: finalizeSpy,
                CreateFailureResult: failSpy,
            },
        });
        const params = {
            agent: { ID: 'agent-1', Name: 'VoiceCoAgent' } as MJAIAgentEntityExtended,
            conversationMessages: [],
        } as unknown as ExecuteAgentParams;

        const ok = await helper.FinalizeRealtimeRun(ctx, params, {
            Success: true,
            TranscriptTurnCount: 3,
            FinalUsage: { InputTokens: 100, OutputTokens: 50 },
        });
        expect(ok.success).toBe(true);
        expect(finalizeSpy).toHaveBeenCalledTimes(1);

        const bad = await helper.FinalizeRealtimeRun(ctx, params, {
            Success: false,
            ErrorMessage: 'Socket closed',
            TranscriptTurnCount: 0,
            FinalUsage: { InputTokens: 0, OutputTokens: 0 },
        });
        expect(bad.success).toBe(false);
        expect(failSpy).toHaveBeenCalledWith('Socket closed', undefined);
    });
});
