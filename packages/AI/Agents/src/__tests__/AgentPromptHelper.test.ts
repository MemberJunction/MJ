import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AIPromptParams,
    type AgentChatMessage,
    type AgentDecisionRequest,
    type AgentDecisionResult,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { ChatMessage } from '@memberjunction/ai';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIAgentNoteEntity, MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { COMPLETE_TASK_TOOL } from '../native-tools/control-tools';
import { RUNTIME_STATE_TAG } from '../constants';
import { AgentNativeToolsAndPrefixCacheHelper } from '../helpers/prompt/AgentNativeToolsAndPrefixCacheHelper';
import { AgentPromptHelper } from '../helpers/prompt/AgentPromptHelper';
import { BaseAgentPromptHelper } from '../helpers/prompt/BaseAgentPromptHelper';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

@RegisterClass(BaseAgentPromptHelper, 'TestCustomPromptHelper')
class TestCustomPromptHelper extends AgentPromptHelper {
    public readonly CustomTag = 'TestCustomPromptHelper';
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    return {
        ID: '10000000-0000-4000-8000-000000000010',
        Name: 'PromptTestAgent',
        AllowMemoryWrite: true,
        ArtifactCreationMode: 'Always',
        ...overrides,
    } as MJAIAgentEntityExtended;
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: makeAgent(),
        conversationMessages: [],
        ...overrides,
    } as ExecuteAgentParams;
}

describe('AgentPromptHelper (Slice s9)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves default AgentPromptHelper and supports @RegisterClass keyed replacement override', () => {
        const defaultHelper = ResolveAgentHelper({
            SeamKey: 'prompt',
            BaseClass: BaseAgentPromptHelper,
            DefaultClass: AgentPromptHelper,
        });
        expect(defaultHelper).toBeInstanceOf(AgentPromptHelper);

        const customHelper = ResolveAgentHelper({
            SeamKey: 'prompt',
            BaseClass: BaseAgentPromptHelper,
            DefaultClass: AgentPromptHelper,
            DriverClass: 'TestCustomPromptHelper',
        });
        expect(customHelper).toBeInstanceOf(TestCustomPromptHelper);
    });

    it('classifies all seven memory note scope combinations accurately', () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext();

        const makeNote = (overrides: Partial<MJAIAgentNoteEntity>): MJAIAgentNoteEntity =>
            ({
                AgentID: null,
                UserID: null,
                CompanyID: null,
                PrimaryScopeEntityID: null,
                PrimaryScopeRecordID: null,
                ...overrides,
            }) as MJAIAgentNoteEntity;

        expect(helper.DetermineNoteScope(ctx, makeNote({}))).toBe('global');
        expect(helper.DetermineNoteScope(ctx, makeNote({ AgentID: 'a1' }))).toBe('agent-only');
        expect(helper.DetermineNoteScope(ctx, makeNote({ UserID: 'u1' }))).toBe('user-only');
        expect(helper.DetermineNoteScope(ctx, makeNote({ CompanyID: 'c1' }))).toBe('company-only');
        expect(
            helper.DetermineNoteScope(ctx, makeNote({ AgentID: 'a1', CompanyID: 'c1', PrimaryScopeEntityID: 'e1' }))
        ).toBe('company');
        expect(
            helper.DetermineNoteScope(ctx, makeNote({ AgentID: 'a1', UserID: 'u1', PrimaryScopeRecordID: 'r1' }))
        ).toBe('user');
        expect(helper.DetermineNoteScope(ctx, makeNote({ AgentID: 'a1', UserID: 'u1' }))).toBe('combined');
    });

    it('MemoryObservability returns undefined for null run and tracks step creation on active runs', () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.MemoryObservability(ctx, null)).toBeUndefined();

        const run = { ID: 'run-obs-1', Steps: [] as MJAIAgentRunStepEntityExtended[] } as MJAIAgentRunEntityExtended;
        const obs = helper.MemoryObservability(ctx, run);
        expect(obs?.agentRunID).toBe('run-obs-1');
        expect(obs?.stepNumber).toBe(1);
        obs?.OnStepCreated({ ID: 'step-mem-1' } as MJAIAgentRunStepEntityExtended);
        expect(run.Steps).toHaveLength(1);
    });

    it('enforces DecisionsEnabled master switch and FinishIfSettings / FinishIfActs / GateEndsRun modes', () => {
        const helper = new AgentPromptHelper();
        const onCtx = CreateMockAgentRunContext({
            AgentTypePromptParams: { decisionsEnabled: true, finishIfMode: 'on', finishIfThreshold: 0.9 },
            Hooks: { DecisionsEnabled: (p) => helper.DecisionsEnabled(onCtx, p) },
        });

        expect(helper.DecisionsEnabled(onCtx, { decisionsEnabled: true })).toBe(true);
        expect(helper.DecisionsEnabled(onCtx, { decisionsEnabled: false })).toBe(false);
        expect(helper.DecisionsEnabled(onCtx, undefined)).toBe(false);

        const settings = helper.FinishIfSettings(onCtx);
        expect(settings.Enabled).toBe(true);
        expect(settings.Mode).toBe('on');
        expect(settings.Threshold).toBe(0.9);
        expect(helper.FinishIfActs(onCtx)).toBe(true);
        expect(helper.GateEndsRun(onCtx, { Passed: true, Probabilities: {}, Reason: 'ok' }, makeParams())).toBe(true);
        expect(helper.GateEndsRun(onCtx, { Passed: false, Probabilities: {}, Reason: 'no' }, makeParams())).toBe(false);

        // Shadow mode never ends the run even when gate passes, and invalid threshold falls back to default
        const shadowCtx = CreateMockAgentRunContext({
            AgentTypePromptParams: { decisionsEnabled: true, finishIfMode: 'shadow', finishIfThreshold: 5 },
            Hooks: { DecisionsEnabled: (p) => helper.DecisionsEnabled(shadowCtx, p) },
        });
        expect(helper.FinishIfSettings(shadowCtx).Enabled).toBe(true);
        expect(helper.FinishIfSettings(shadowCtx).Threshold).toBeLessThanOrEqual(1);
        expect(helper.FinishIfActs(shadowCtx)).toBe(false);
        expect(helper.GateEndsRun(shadowCtx, { Passed: true, Probabilities: {}, Reason: 'ok' }, makeParams())).toBe(false);
    });

    it('memoizes MessageFingerprint for unchanged ChatMessage instances and invalidates on mutation', () => {
        const msg: ChatMessage = { role: 'user', content: 'Hello world' };
        const fp1 = AgentNativeToolsAndPrefixCacheHelper.MessageFingerprint(msg);
        const fp2 = AgentNativeToolsAndPrefixCacheHelper.MessageFingerprint(msg);
        expect(fp1).toBe(fp2);

        msg.content = 'Updated content';
        const fp3 = AgentNativeToolsAndPrefixCacheHelper.MessageFingerprint(msg);
        expect(fp3).not.toBe(fp1);

        msg.role = 'assistant';
        const fp4 = AgentNativeToolsAndPrefixCacheHelper.MessageFingerprint(msg);
        expect(fp4).not.toBe(fp3);
    });

    it('skips memory writes when AllowMemoryWrite is false or audience adds a reader and records skipped step', async () => {
        const helper = new AgentPromptHelper();
        const createStep = vi.fn(async () => ({ ID: 'step-skip' } as MJAIAgentRunStepEntityExtended));
        const ctx = CreateMockAgentRunContext({
            PromptTurnCount: 2,
            Hooks: {
                RunAudienceAddsReader: () => true,
                CreateStepEntity: createStep,
            },
        });
        const disabledParams = makeParams({ agent: makeAgent({ AllowMemoryWrite: false }) });
        const enabledParams = makeParams({ agent: makeAgent({ AllowMemoryWrite: true }) });

        const disabledSkip = helper.MemoryWriteSkip(ctx, disabledParams);
        expect(disabledSkip?.Reason).toBe('AllowMemoryWrite=false');
        expect(helper.MemoryWriteSkip(ctx, enabledParams)?.Reason).toBe('shared conversation');

        await helper.ProcessMemoryWritesForTurn(ctx, [{ note: 'Remember X', type: 'Fact' }], disabledParams);
        expect(createStep).toHaveBeenCalledTimes(1);
        expect(disabledParams.conversationMessages).toHaveLength(1);
        expect(String(disabledParams.conversationMessages[0].content)).toContain('NOT saved');
    });

    it('IsArtifactSupportEnabled honors ArtifactCreationMode and existing workspace artifacts', () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.IsArtifactSupportEnabled(ctx, makeAgent({ ArtifactCreationMode: 'Always' }))).toBe(true);
        expect(helper.IsArtifactSupportEnabled(ctx, makeAgent({ ArtifactCreationMode: 'Never', ParentID: null }))).toBe(
            false
        );

        vi.spyOn(ctx.ArtifactToolManager, 'HasArtifacts').mockReturnValue(true);
        expect(helper.IsArtifactSupportEnabled(ctx, makeAgent({ ArtifactCreationMode: 'Never', ParentID: null }))).toBe(
            true
        );
    });

    it('RunConversationToolFromTool rejects unknown tool names and enforces per-turn call cap', async () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext({ PromptTurnCount: 1 });

        const unknown = await helper.RunConversationToolFromTool(ctx, 'not_a_real_tool', {});
        expect(unknown.IsError).toBe(true);
        expect(unknown.Content).toContain('is not a conversation tool');

        vi.spyOn(ctx.ConversationToolManager, 'ExecuteSingleToolCall').mockResolvedValue({
            tool: 'searchConversation',
            input: {},
            result: { success: true, data: { messages: [] } },
            durationMs: 1,
        });

        // Exhaust the per-turn cap by advancing count right past limit
        ctx.ConversationToolTurn = { turn: 1, count: 100 };
        const capped = await helper.RunConversationToolFromTool(ctx, 'searchConversation', {});
        expect(capped.IsError).toBe(true);
        expect(capped.Content).toContain('per-turn cap');
    });

    it('ExecuteNativeArtifactTool taints run and wraps untrusted artifact content, and surfaces failures as IsError', async () => {
        const helper = new AgentPromptHelper();
        const recordTaint = vi.fn();
        const ctx = CreateMockAgentRunContext({
            PromptTurnCount: 4,
            Hooks: { RecordTaintedSource: recordTaint },
        });

        vi.spyOn(ctx.ArtifactToolManager, 'ExecuteSingleToolCall').mockResolvedValueOnce({
            artifactId: 'art-1',
            tool: 'read_section',
            input: {},
            result: { success: true, data: { text: 'external body' } },
            durationMs: 5,
            trustLevel: 'Untrusted',
            sourceName: 'upload:doc.pdf',
        });

        const ok = await helper.ExecuteNativeArtifactTool(ctx, {
            artifactId: 'art-1',
            tool: 'read_section',
            input: {},
        });
        expect(ok.IsError).toBe(false);
        expect(recordTaint).toHaveBeenCalledWith(4, 'upload:doc.pdf', 'Untrusted');
        expect(ok.Content).toContain('external body');

        vi.spyOn(ctx.ArtifactToolManager, 'ExecuteSingleToolCall').mockResolvedValueOnce({
            artifactId: 'art-2',
            tool: 'read_section',
            input: {},
            result: { success: false, errorMessage: 'Section not found' },
            durationMs: 2,
        });
        const err = await helper.ExecuteNativeArtifactTool(ctx, {
            artifactId: 'art-2',
            tool: 'read_section',
            input: {},
        });
        expect(err.IsError).toBe(true);
        expect(err.Content).toBe('Section not found');
    });

    it('ResolveToolChoiceForTurn and IsFinalPermittedIteration force terminal choice on final iteration', () => {
        const helper = new AgentPromptHelper();
        const makeIterCtx = (iterations: number, terminal: 'text' | 'tool') => {
            const c = CreateMockAgentRunContext({
                AgentRun: {
                    ID: 'run-1',
                    TotalPromptIterations: iterations,
                } as MJAIAgentRunEntityExtended,
                Hooks: {
                    IsFinalPermittedIteration: (p) => helper.IsFinalPermittedIteration(c, p),
                    GetNativeControlConfig: () => ({
                        NativeOnly: true,
                        DualChannel: false,
                        EmitJsonEnvelope: false,
                        SendToolResultsNatively: true,
                        Terminal: terminal,
                        PayloadChangeTool: false,
                        AskUser: false,
                        CompactToolArguments: false,
                    }),
                },
            });
            return c;
        };

        const params = makeParams({ agent: makeAgent({ MaxIterationsPerRun: 5 }) });
        expect(helper.ResolveToolChoiceForTurn(makeIterCtx(2, 'tool'), params)).toBe('auto');
        expect(helper.ResolveToolChoiceForTurn(makeIterCtx(5, 'text'), params)).toBe('none');
        expect(helper.ResolveToolChoiceForTurn(makeIterCtx(5, 'tool'), params)).toEqual({ name: COMPLETE_TASK_TOOL });
    });

    it('AppendNativeAssistantTurn appends once and deduplicates repeated calls for the same nativeTurn', () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext();
        const params = makeParams();
        const nativeTurn = {
            text: 'Calling tool',
            toolCalls: [{ id: 'tc-1', name: 'search', arguments: {} }],
            sendResultsNatively: true,
        };
        const step: BaseAgentNextStep = { step: 'Actions', terminate: false, nativeTurn };

        helper.AppendNativeAssistantTurn(ctx, params, step);
        helper.AppendNativeAssistantTurn(ctx, params, step);
        expect(params.conversationMessages).toHaveLength(1);
        expect(params.conversationMessages[0].role).toBe('assistant');
    });

    it('DropReasoningBehindChangedHistory strips stale reasoning after an earlier message mutates', () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext({
            NativeToolBindings: new Map(),
            Hooks: {
                DriverRequiresStableReasoningPrefix: () => true,
            },
        });
        const msg0: AgentChatMessage = { role: 'user', content: 'Initial request' };
        const msg1: AgentChatMessage = {
            role: 'assistant',
            content: 'Calling tool',
            reasoning: 'secret chain of thought',
            toolCalls: [{ id: 'c1', name: 'search', arguments: {} }],
        };
        const params = makeParams({ conversationMessages: [msg0, msg1] });
        const promptParams = new AIPromptParams();

        // Turn 1 records baseline fingerprints
        const firstOut = helper.DropReasoningBehindChangedHistory(ctx, params, [msg0, msg1], promptParams);
        expect((firstOut[1] as AgentChatMessage).reasoning).toBe('secret chain of thought');

        // Mutate earlier message -> reasoning on subsequent tool-call turn must be dropped
        const mutatedMsg0: AgentChatMessage = { role: 'user', content: 'Compacted request' };
        params.conversationMessages[0] = mutatedMsg0;
        const secondOut = helper.DropReasoningBehindChangedHistory(ctx, params, [mutatedMsg0, msg1], promptParams);
        expect((secondOut[1] as AgentChatMessage).reasoning).toBeUndefined();
        expect((params.conversationMessages[1] as AgentChatMessage).reasoning).toBeUndefined();
    });

    it('RestoreTurn1VolatileStateIfNeeded records Turn 1 index and restores dropped volatile state in append-only mode', () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                RunHasVolatileStateMessage: (p) => helper.RunHasVolatileStateMessage(ctx, p),
            },
        });
        const params = makeParams({
            conversationMessages: [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi' },
            ],
        });

        helper.RestoreTurn1VolatileStateIfNeeded(ctx, params, true);
        expect(ctx.Turn1InsertionIndex).toBe(2);

        const volatileMsg: AgentChatMessage = {
            role: 'user',
            content: '<runtime-state>now</runtime-state>',
            metadata: { volatileState: true, turnAdded: 1 },
        };
        ctx.LastVolatileStateMessage = volatileMsg;
        params.conversationMessages.push({ role: 'user', content: 'Follow up' });

        helper.RestoreTurn1VolatileStateIfNeeded(ctx, params, true);
        expect(params.conversationMessages[2]).toBe(volatileMsg);
        expect(helper.RunHasVolatileStateMessage(ctx, params)).toBe(true);
    });

    it('ShouldUseAppendOnlyTrailingState honors explicit trailingStateMode overrides and model capabilities', () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ResolveAppendOnlyState: (m, v) => helper.ResolveAppendOnlyState(ctx, m, v),
                ResolvePrefixPromptCache: () => true,
            },
        });

        const appendParams = new AIPromptParams();
        appendParams.data = { __agentTypePromptParams: { trailingStateMode: 'appendOnly' } };
        expect(helper.ShouldUseAppendOnlyTrailingState(ctx, appendParams)).toBe(true);

        const replaceParams = new AIPromptParams();
        replaceParams.data = { __agentTypePromptParams: { trailingStateMode: 'replace' } };
        expect(helper.ShouldUseAppendOnlyTrailingState(ctx, replaceParams)).toBe(false);

        ctx.ResolvedTrailingStateMode = true;
        expect(helper.ShouldUseAppendOnlyTrailingState(ctx, new AIPromptParams())).toBe(true);
    });

    it('ResolveRuntimeStateDelivery classifies embedded, trailing, unsupported, and unknown templates with caching', async () => {
        const helper = new AgentPromptHelper();
        let templateText: string | null = null;
        const loadTemplate = vi.fn(async () => templateText);
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                LoadPromptTemplateText: loadTemplate,
                VolatileTemplateMarkers: () => helper.VolatileTemplateMarkers(ctx),
                TemplateTextEmbedsVolatileState: (t) => helper.TemplateTextEmbedsVolatileState(ctx, t),
            },
        });
        const prompt = { ID: 'p1', TemplateID: 't1' } as MJAIPromptEntityExtended;
        const user = { ID: 'u1' } as UserInfo;

        expect(await helper.ResolveRuntimeStateDelivery(ctx, prompt, user)).toBe('unknown');

        templateText = `System instructions with <${RUNTIME_STATE_TAG}> pointer`;
        expect(await helper.ResolveRuntimeStateDelivery(ctx, prompt, user)).toBe('trailing');
        // Second call hits cache
        expect(await helper.ResolveRuntimeStateDelivery(ctx, prompt, user)).toBe('trailing');

        templateText = 'System instructions with no pointer at all';
        expect(await helper.ResolveRuntimeStateDelivery(ctx, prompt, user)).toBe('unsupported');

        const firstMarker = helper.VolatileTemplateMarkers(ctx)[0];
        templateText = `Legacy template embedding ${firstMarker}`;
        expect(await helper.ResolveRuntimeStateDelivery(ctx, prompt, user)).toBe('embedded');
    });

    it('BuildVolatileStateMessage skips embedded/unsupported prompts and builds trailing volatile message otherwise', async () => {
        const helper = new AgentPromptHelper();
        let mode: 'trailing' | 'embedded' | 'unsupported' = 'embedded';
        const ctx = CreateMockAgentRunContext({
            PromptTurnCount: 3,
            Hooks: {
                ResolveRuntimeStateDelivery: async () => mode,
                ResolveRelocatedSpecialization: async () => null,
                ResolveFragmentDateTime: async () => null,
                ReadScratchpadFromTemplateData: () => null,
            },
        });
        const params = makeParams();
        const promptParams = new AIPromptParams();
        promptParams.data = { __agentTypePromptParams: { includePayloadInPrompt: true } };
        const agentType = { ID: 'at-1', Name: 'Loop' } as MJAIAgentTypeEntity;

        expect(await helper.BuildVolatileStateMessage(ctx, params, promptParams, { count: 1 }, undefined, agentType)).toBeNull();

        mode = 'unsupported';
        expect(await helper.BuildVolatileStateMessage(ctx, params, promptParams, { count: 1 }, undefined, agentType)).toBeNull();

        mode = 'trailing';
        const msg = await helper.BuildVolatileStateMessage(ctx, params, promptParams, { count: 1 }, undefined, agentType);
        expect(msg).not.toBeNull();
        expect(msg?.role).toBe('user');
        expect(msg?.metadata?.volatileState).toBe(true);
        expect(msg?.metadata?.turnAdded).toBe(3);
    });

    it('handles decision state resolution, per-turn call budgeting, and bounded concurrency worker isolation', async () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.ResolveDecisionState(ctx, undefined, {})).toEqual({
            Error: 'Either state or forEachItemIn is required',
        });
        expect(helper.ResolveDecisionState(ctx, 'plain state text', {})).toEqual({ State: 'plain state text' });
        expect(helper.ResolveDecisionState(ctx, 'payload.user.name', { user: { name: 'Ada' } })).toEqual({ State: 'Ada' });
        expect(helper.ResolveDecisionState(ctx, 'payload.missing', { user: {} })).toEqual({
            Error: 'Path "payload.missing" not found in payload',
        });

        const requests: AgentDecisionRequest[] = [
            { id: 'd1', state: 's1', questions: { q1: { question: 'ok?' } } },
            { id: 'd2', forEachItemIn: 'payload.items', questions: { q2: { question: 'item?' } } },
            { id: 'd3', state: 's3', questions: { q3: { question: 'final?' } } },
        ];
        const allowances = helper.AllotDecisionCalls(
            ctx,
            requests,
            { items: ['a', 'b', 'c'] },
            undefined,
            3,
            makeParams()
        );
        expect(allowances).toEqual([
            { Wanted: 1, Allowed: 1 },
            { Wanted: 3, Allowed: 2 },
            { Wanted: 1, Allowed: 0 },
        ]);

        expect(helper.OverBudgetDecisionResult(ctx, requests[2], 2, 0).error).toContain('budget is 0');
        expect(helper.OverBudgetDecisionResult(ctx, requests[2], 2, 3).error).toContain('at most 3 decision calls');

        const concurrentResults = await helper.RunWithConcurrencyLimit(
            ctx,
            [1, 2, 3],
            2,
            async (n) => {
                if (n === 2) throw new Error('worker boom');
                return n * 10;
            },
            (err) => (err instanceof Error ? -1 : -2)
        );
        expect(concurrentResults).toEqual([10, -1, 30]);
    });

    it('holds decisions on terminal-eligible steps, runs or skips held decisions, and rejects malformed non-array input', async () => {
        const helper = new AgentPromptHelper();
        const injectDecisionResults = vi.fn();
        const execDecisions = vi.fn(async (): Promise<AgentDecisionResult[]> => [{ id: 'd1', success: true, answers: {} }]);
        const ctx = CreateMockAgentRunContext({
            AgentTypePromptParams: { decisionsEnabled: true, finishIfMode: 'on' },
            Hooks: {
                DecisionsEnabled: (p) => helper.DecisionsEnabled(ctx, p),
                InjectDecisionResultsMessage: injectDecisionResults,
                ExecuteDecisionRequestsAsSteps: execDecisions,
                GetRequestedSubAgents: (s) => (s.subAgent ? [s.subAgent] : []),
                DeriveRunOutcome: () => 'cancelled',
            },
        });
        const params = makeParams();
        const promptParams = { decisionsEnabled: true };

        // Non-array decisions rejected gracefully
        await helper.ProcessTurnDecisions(
            ctx,
            'not-an-array' as AgentDecisionRequest[] & string,
            { step: 'Retry', terminate: false },
            {},
            promptParams,
            params
        );
        expect(injectDecisionResults).toHaveBeenCalledWith(
            params,
            expect.arrayContaining([expect.objectContaining({ success: false })])
        );

        // Held when Sub-Agent has terminateAfter=true
        const reqs: AgentDecisionRequest[] = [{ id: 'd1', state: 'x', questions: {} }];
        await helper.ProcessTurnDecisions(
            ctx,
            reqs,
            {
                step: 'Sub-Agent',
                terminate: false,
                subAgent: { id: 'sa-1', name: 'Sub', message: 'go', terminateAfter: true },
            },
            {},
            promptParams,
            params
        );
        expect(ctx.HeldDecisions?.Requests).toEqual(reqs);
        expect(execDecisions).not.toHaveBeenCalled();

        // RunHeldDecisions clears and executes
        await helper.RunHeldDecisions(ctx, params);
        expect(ctx.HeldDecisions).toBeUndefined();
        expect(execDecisions).toHaveBeenCalledTimes(1);

        // SkipHeldDecisions clears without running & RunEndForHeldDecisions reflects cancelled outcome
        ctx.HeldDecisions = { Requests: reqs, Payload: {}, PromptParams: promptParams, Reason: 'terminateAfter' };
        expect(helper.RunEndForHeldDecisions(ctx)).toContain('cancelled');
        helper.SkipHeldDecisions(ctx, params, helper.RunEndForHeldDecisions(ctx));
        expect(ctx.HeldDecisions).toBeUndefined();
    });

    it('FinishAfterActions skips when actions fail or emit AIDirectives, and FinishIfValidationRefusal restores retry counts', async () => {
        const helper = new AgentPromptHelper();
        const ctx = CreateMockAgentRunContext({
            AgentTypePromptParams: { decisionsEnabled: true, finishIfMode: 'on', finishIfThreshold: 0.8 },
            GeneralValidationRetryCount: 2,
            ValidationRetryCount: 1,
            Hooks: {
                DecisionsEnabled: (p) => helper.DecisionsEnabled(ctx, p),
                ValidateSuccessNextStep: async () => {
                    ctx.GeneralValidationRetryCount++;
                    ctx.ValidationRetryCount++;
                    return { step: 'Retry', terminate: false, errorMessage: 'Missing required summary field' };
                },
            },
        });
        const params = makeParams();
        const decision: BaseAgentNextStep = {
            step: 'Actions',
            terminate: false,
            finishIf: {
                message: 'All done',
                questions: [{ id: 'done', question: 'Complete?', require: 'yes' }],
            },
        };

        // Failed action skips finishIf
        expect(
            await helper.FinishAfterActions(
                ctx,
                params,
                decision,
                [{ success: false, result: { Success: false, Params: [] } }],
                [],
                {},
                'p1',
                true
            )
        ).toBeUndefined();

        // Action with AIDirectives skips finishIf
        expect(
            await helper.FinishAfterActions(
                ctx,
                params,
                decision,
                [{ success: true, result: { Success: true, Params: [] } }],
                [
                    {
                        actionName: 'Search',
                        success: true,
                        params: [],
                        resultCode: 'OK',
                        message: 'ok',
                        aiDirectives: [{ type: 'info', content: 'Check next page' }],
                    },
                ],
                {},
                'p1',
                true
            )
        ).toBeUndefined();

        // FinishIfValidationRefusal refuses without mutating retry counters
        const refusal = await helper.FinishIfValidationRefusal(
            ctx,
            params,
            { step: 'Success', terminate: true },
            {},
            { ID: 'step-check' } as MJAIAgentRunStepEntityExtended
        );
        expect(refusal).toContain('Missing required summary field');
        expect(ctx.GeneralValidationRetryCount).toBe(2);
        expect(ctx.ValidationRetryCount).toBe(1);
    });

    it('BoundDecisionDiscovery aborts promptly when ExecuteParams.cancellationToken aborts mid-discovery', async () => {
        const helper = new AgentPromptHelper();
        const controller = new AbortController();
        const ctx = CreateMockAgentRunContext({
            ExecuteParams: makeParams({ cancellationToken: controller.signal }),
        });

        const discoveryPromise = helper.BoundDecisionDiscovery(ctx, async (signal) => {
            return await new Promise((resolve) => {
                signal.addEventListener('abort', () => {
                    // Intentionally hang past abort to confirm race resolves immediately from abort listener
                });
                void resolve;
            });
        });

        controller.abort('user cancelled run');
        const outcome = await discoveryPromise;
        expect(outcome.Succeeded).toBe(false);
        expect(outcome.Injected).toBe(false);
        expect(outcome.Reason).toContain('cancelled');
    });
});
