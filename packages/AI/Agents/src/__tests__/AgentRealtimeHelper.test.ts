/**
 * Dedicated interface-level unit tests for Slice s4 (`BaseAgentRealtimeHelper` / `AgentRealtimeHelper`
 * & `AgentRealtimePersistenceHelper`).
 * Exercises bridge prep, audience refusal, model resolution failure, target delegation with AbortSignal
 * & progress callbacks, tool execution, transcript serialization, usage checkpointing, recording
 * finalization, run finalization, and `@RegisterClass` replacement-helper compliance.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { BaseRealtimeModel } from '@memberjunction/ai';
import type {
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIPromptRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJConversationDetailEntityExtended } from '@memberjunction/core-entities';
import { AgentRunner } from '../AgentRunner';
import { AgentHelperCache, ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import type { AgentRunContext } from '../helpers/AgentRunContext';
import { AgentRealtimeHelper } from '../helpers/realtime/AgentRealtimeHelper';
import { BaseAgentRealtimeHelper } from '../helpers/realtime/BaseAgentRealtimeHelper';
import type { RealtimeRecordingController } from '../realtime/realtime-recording-capture';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
    const partial: Partial<UserInfo> = { ID: 'u-rt-1', Name: 'Voice User', ...overrides };
    return partial as UserInfo;
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    const partial: Partial<MJAIAgentEntityExtended> = {
        ID: '11111111-1111-4111-8111-111111111111',
        Name: 'VoiceCoAgent',
        ...overrides,
    };
    return partial as MJAIAgentEntityExtended;
}

function makeParams(overrides: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: makeAgent(),
        conversationMessages: [],
        contextUser: makeUser(),
        ...overrides,
    };
}

function makeActionResult(overrides: Partial<ActionResult> = {}): ActionResult {
    const partial: Partial<ActionResult> = {
        Success: true,
        Message: 'ok',
        Params: [],
        ...overrides,
    };
    return partial as ActionResult;
}

function makeConversationDetailStub(
    id: string,
    saveOk: boolean = true,
    loadOk: boolean = true
): MJConversationDetailEntityExtended {
    const partial: Partial<MJConversationDetailEntityExtended> = {
        ID: id,
        NewRecord: vi.fn(),
        MarkServerAuthoredReply: vi.fn(),
        Load: vi.fn(async () => loadOk),
        Save: vi.fn(async () => saveOk),
    };
    return partial as MJConversationDetailEntityExtended;
}

@RegisterClass(BaseAgentRealtimeHelper, 'TestCustomRealtimeHelper')
class TestCustomRealtimeHelper extends AgentRealtimeHelper {
    public override ParseDelegateRequestText(_ctx: AgentRunContext, argumentsJson: string): string {
        return `custom:${argumentsJson}`;
    }
}

describe('AgentRealtimeHelper (Slice s4)', () => {
    const helper = new AgentRealtimeHelper();

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves default AgentRealtimeHelper and throws on unimplemented BaseAgentRealtimeHelper token methods', () => {
        const resolved = ResolveAgentHelper({
            SeamKey: 'realtime',
            BaseClass: BaseAgentRealtimeHelper,
            DefaultClass: AgentRealtimeHelper,
        });
        expect(resolved).toBeInstanceOf(AgentRealtimeHelper);

        const baseToken = new BaseAgentRealtimeHelper();
        const ctx = CreateMockAgentRunContext();
        expect(() => baseToken.ParseDelegateRequestText(ctx, '{}')).toThrow(/must be implemented/);
        expect(() => baseToken.ResolveRealtimeTargetAgent(ctx, makeParams())).toThrow(/must be implemented/);
        expect(() => baseToken.BuildBridgePrepInput(ctx, makeParams())).toThrow(/must be implemented/);
    });

    it('supports custom @RegisterClass(BaseAgentRealtimeHelper) replacement override via ResolveAgentHelper and AgentHelperCache', () => {
        expect(TestCustomRealtimeHelper).toBeDefined();
        const resolved = ResolveAgentHelper({
            SeamKey: 'realtime',
            BaseClass: BaseAgentRealtimeHelper,
            DefaultClass: AgentRealtimeHelper,
            DriverClass: 'TestCustomRealtimeHelper',
        });
        expect(resolved).toBeInstanceOf(TestCustomRealtimeHelper);
        expect(resolved.ParseDelegateRequestText(CreateMockAgentRunContext(), 'ping')).toBe('custom:ping');

        const cache = new AgentHelperCache();
        cache.ResetForRun([{ seam: 'realtime', driverClass: 'TestCustomRealtimeHelper' }]);
        expect(
            cache.GetOrResolve({
                SeamKey: 'realtime',
                BaseClass: BaseAgentRealtimeHelper,
                DefaultClass: AgentRealtimeHelper,
            })
        ).toBeInstanceOf(TestCustomRealtimeHelper);
    });

    it('parses delegate JSON request text and falls back to raw text on non-JSON or missing request key', () => {
        const ctx = CreateMockAgentRunContext();

        expect(helper.ParseDelegateRequestText(ctx, JSON.stringify({ request: 'Summarize Q4 pipeline' }))).toBe(
            'Summarize Q4 pipeline'
        );
        expect(helper.ParseDelegateRequestText(ctx, 'plain text request')).toBe('plain text request');
        expect(helper.ParseDelegateRequestText(ctx, JSON.stringify({ other: 123 }))).toBe('{"other":123}');
        expect(helper.ParseDelegateRequestText(ctx, JSON.stringify({ request: 42 }))).toBe('{"request":42}');
        expect(helper.ParseDelegateRequestText(ctx, '')).toBe('');
    });

    it('resolves target agent case-insensitively by UUID from AIEngine and returns null when missing', () => {
        const targetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const target = makeAgent({ ID: targetId, Name: 'PlannerAgent' });
        vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([target]);

        const ctx = CreateMockAgentRunContext();
        expect(helper.ResolveRealtimeTargetAgent(ctx, makeParams())).toBeNull();
        expect(helper.ResolveRealtimeTargetAgent(ctx, makeParams({ data: { targetAgentID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } }))).toBeNull();
        expect(helper.ResolveRealtimeTargetAgent(ctx, makeParams({ data: { targetAgentID: targetId.toUpperCase() } }))).toBe(target);
    });

    it('builds BridgePrepInput normalizing fields, filtering non-string SelfNames, and forwarding run scope & skills', () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                RunScopeFor: () => ({ PrimaryScopeEntityName: 'Accounts', PrimaryScopeRecordID: 'acc-1' }),
                ActiveSkillIDsForRun: () => ['sk-1', 'sk-2'],
            },
        });
        const params = makeParams({
            data: {
                realtimeModelID: '  model-1  ',
                realtimeVoice: '  alloy  ',
                targetAgentID: '  target-1  ',
                realtimeMeetingMode: true,
                realtimeSelfNames: ['Sage', 42, 'Assistant'],
                realtimeAvatarDelivery: 'room',
                realtimePhoneCall: true,
                applicationId: '  app-9  ',
                agentSessionId: 'sess-1',
            },
        });

        const input = helper.BuildBridgePrepInput(ctx, params);
        expect(input.PreferredModelID).toBe('model-1');
        expect(input.TargetAgentID).toBe('target-1');
        expect(input.DisableAutoResponse).toBe(true);
        expect(input.SelfNames).toEqual(['Sage', 'Assistant']);
        expect(input.AvatarDelivery).toBe('room');
        expect(input.PhoneCall).toBe(true);
        expect(input.ServerSide).toBe(true);
        expect(input.ApplicationID).toBe('app-9');
        expect(input.AgentSessionID).toBe('sess-1');
        expect(input.ActiveSkillIDs).toEqual(['sk-1', 'sk-2']);
        expect(input.RunScope).toEqual({ PrimaryScopeEntityName: 'Accounts', PrimaryScopeRecordID: 'acc-1' });
    });

    it('rejects StartBridgeRealtimeSession immediately when SessionAudienceRefusal returns a reason', async () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                SessionAudienceRefusal: () => 'Audience adds reader; realtime refused',
            },
        });

        await expect(helper.StartBridgeRealtimeSession(ctx, makeParams())).rejects.toThrow('Audience adds reader');
    });

    it('returns failure result from ExecuteRealtimeSession when no Realtime model resolves', async () => {
        const failSpy = vi.fn(async (): Promise<ExecuteAgentResult> => ({ success: false } as ExecuteAgentResult));
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ResolveRealtimeModel: vi.fn(async () => null),
                CreateFailureResult: failSpy,
            },
        });

        const res = await helper.ExecuteRealtimeSession(ctx, makeParams(), { success: true });
        expect(res.success).toBe(false);
        expect(ctx.Hooks.LogError).toHaveBeenCalledWith(expect.stringContaining('no usable Realtime model'), expect.anything());
        expect(failSpy).toHaveBeenCalledTimes(1);
    });

    it('contains errors thrown by BuildRealtimeSessionDeps inside ExecuteRealtimeSession', async () => {
        const failSpy = vi.fn(async () => ({ success: false }) as ExecuteAgentResult);
        const promptRunStub: Partial<MJAIPromptRunEntityExtended> = {
            NewRecord: vi.fn(),
            Save: vi.fn(async () => true),
        };
        const provider: Partial<IMetadataProvider> = {
            GetEntityObject: vi.fn(async () => promptRunStub) as IMetadataProvider['GetEntityObject'],
        };
        const ctx = CreateMockAgentRunContext({
            ActiveProvider: provider as IMetadataProvider,
            Hooks: {
                ResolveRealtimeModel: vi.fn(async () => ({
                    model: {} as BaseRealtimeModel,
                    modelID: 'm-1',
                    vendorID: 'v-1',
                    apiName: 'gpt-realtime',
                })),
                BuildRealtimeSessionDeps: vi.fn(async () => {
                    throw new Error('bridge startup boom');
                }),
                CreateFailureResult: failSpy,
            },
        });

        const res = await helper.ExecuteRealtimeSession(ctx, makeParams(), { success: true });
        expect(res.success).toBe(false);
        expect(failSpy).toHaveBeenCalledWith('bridge startup boom', expect.anything());
        expect(ctx.Hooks.LogError).toHaveBeenCalledWith(expect.stringContaining('bridge startup boom'), expect.anything());
    });

    it('returns failure DelegatedResult when no target agent resolves', async () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: { ResolveRealtimeTargetAgent: () => null },
        });

        const res = await helper.DelegateRealtimeToTarget(ctx, makeParams(), { success: true }, {
            CallID: 'call-1',
            Arguments: JSON.stringify({ request: 'hello' }),
            AbortSignal: new AbortController().signal,
        });
        expect(res.Success).toBe(false);
        expect(res.CallID).toBe('call-1');
        expect(res.Output).toContain('No target agent is configured');
    });

    it('delegates to target agent forwarding AbortSignal and combined progress callbacks (isolating throwing listener)', async () => {
        const target = makeAgent({ ID: 'target-1', Name: 'TargetPlanner' });
        const abortController = new AbortController();
        const outerProgress = vi.fn();
        const runAgentSpy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockImplementation(async (runParams) => {
            expect(runParams.cancellationToken).toBe(abortController.signal);
            runParams.onProgress?.({ step: 'prompt_execution', message: 'step 1' });
            return {
                success: true,
                agentRun: { ID: 'child-run-1', Message: 'All done!' },
            } as ExecuteAgentResult;
        });

        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ResolveRealtimeTargetAgent: () => target,
                ParseDelegateRequestText: (raw) => helper.ParseDelegateRequestText(ctx, raw),
            },
        });

        const res = await helper.DelegateRealtimeToTarget(
            ctx,
            makeParams({ onProgress: outerProgress }),
            { success: true },
            {
                CallID: 'call-ok',
                Arguments: JSON.stringify({ request: 'Draft memo' }),
                AbortSignal: abortController.signal,
                OnProgress: () => {
                    throw new Error('inner listener crashed');
                },
            }
        );

        expect(runAgentSpy).toHaveBeenCalledTimes(1);
        expect(outerProgress).toHaveBeenCalledTimes(1);
        expect(res).toEqual({
            CallID: 'call-ok',
            Success: true,
            Output: 'All done!',
            RunID: 'child-run-1',
        });
    });

    it('returns failure DelegatedResult when target agent fails or throws (e.g. aborted mid-run)', async () => {
        const target = makeAgent({ ID: 'target-2', Name: 'TargetWorker' });
        const ctx = CreateMockAgentRunContext({
            Hooks: { ResolveRealtimeTargetAgent: () => target },
        });

        vi.spyOn(AgentRunner.prototype, 'RunAgent').mockResolvedValueOnce({
            success: false,
            agentRun: { ID: 'child-fail', ErrorMessage: 'Insufficient credits' },
        } as ExecuteAgentResult);

        const failed = await helper.DelegateRealtimeToTarget(ctx, makeParams(), { success: true }, {
            CallID: 'c-fail',
            Arguments: '{"request":"work"}',
            AbortSignal: new AbortController().signal,
        });
        expect(failed.Success).toBe(false);
        expect(failed.Output).toBe('Insufficient credits');
        expect(failed.RunID).toBe('child-fail');

        vi.spyOn(AgentRunner.prototype, 'RunAgent').mockRejectedValueOnce(new Error('Aborted by caller'));
        const thrown = await helper.DelegateRealtimeToTarget(ctx, makeParams(), { success: true }, {
            CallID: 'c-abort',
            Arguments: '{"request":"work"}',
            AbortSignal: new AbortController().signal,
        });
        expect(thrown.Success).toBe(false);
        expect(thrown.Output).toBe('Delegation failed: Aborted by caller');
    });

    it('routes ExecuteRealtimeTool to available actions, rejects unknown tools, tolerates malformed JSON args, and contains throws', async () => {
        const actionEntity = { ID: 'act-1', Name: 'LookupOrder' } as MJActionEntityExtended;
        const execSpy = vi.fn<AgentRunContext['Hooks']['ExecuteSingleAction']>(async () =>
            makeActionResult({
                Success: true,
                Message: 'Order #42 is shipped',
                Params: [],
            })
        );
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                GetEffectiveActionsForValidation: () => [actionEntity],
                ExecuteSingleAction: execSpy,
            },
        });
        const params = makeParams();

        const missing = await helper.ExecuteRealtimeTool(ctx, params, { CallID: 'c-missing', ToolName: 'UnknownTool', Arguments: '{}' });
        expect(missing.Success).toBe(false);
        expect(missing.Output).toContain('not available');

        const ok = await helper.ExecuteRealtimeTool(ctx, params, {
            CallID: 'c-ok',
            ToolName: 'LookupOrder',
            Arguments: JSON.stringify({ orderId: 42 }),
        });
        expect(ok.Success).toBe(true);
        expect(ok.Output).toBe('Order #42 is shipped');

        // Malformed JSON and JSON array fall back to empty params {}
        execSpy.mockResolvedValueOnce(makeActionResult({ Success: true, Message: '', Params: [] }));
        const malformed = await helper.ExecuteRealtimeTool(ctx, params, { CallID: 'c-badjson', ToolName: 'LookupOrder', Arguments: '[1,2,3]' });
        expect(malformed.Success).toBe(true);
        expect(malformed.Output).toBe('Tool completed.');
        expect(execSpy.mock.calls[1]?.[1].params).toEqual({});

        // Thrown exception from action is contained
        execSpy.mockRejectedValueOnce(new Error('SQL offline'));
        const errored = await helper.ExecuteRealtimeTool(ctx, params, { CallID: 'c-err', ToolName: 'LookupOrder', Arguments: '{}' });
        expect(errored.Success).toBe(false);
        expect(errored.Output).toBe('Tool execution failed: SQL offline');
    });

    it('resolves effective realtime config merging agent type defaults with agent overrides', () => {
        const typeId = '22222222-2222-4222-8222-222222222222';
        vi.spyOn(AIEngine.Instance, 'AgentTypes', 'get').mockReturnValue([
            {
                ID: typeId,
                DefaultConfiguration: JSON.stringify({
                    realtime: { narration: { paceMs: 1200 }, voice: { default: { voice: 'shimmer' } } },
                }),
            } as (typeof AIEngine.Instance.AgentTypes)[number],
        ]);
        const ctx = CreateMockAgentRunContext();

        const merged = helper.ResolveRealtimeEffectiveConfig(
            ctx,
            makeAgent({
                TypeID: typeId,
                TypeConfiguration: JSON.stringify({ realtime: { voice: { default: { voice: 'verse' } } } }),
            })
        );
        expect(merged.realtime?.voice?.default?.voice).toBe('verse');
        expect(merged.realtime?.narration?.paceMs).toBe(1200);

        // Missing TypeID falls back cleanly
        expect(helper.ResolveRealtimeEffectiveConfig(ctx, makeAgent({ TypeID: undefined, TypeConfiguration: null }))).toBeDefined();
    });

    it('builds RealtimeSessionRunnerDeps propagating cancellationToken as AbortSignal and wiring callbacks', async () => {
        const abortController = new AbortController();
        const delegateSpy = vi.fn(async () => ({ CallID: 'c1', Success: true, Output: 'ok' }));
        const persistSpy = vi.fn(async () => 'detail-1');
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                ResolveRealtimeEffectiveConfig: () => ({}),
                ResolveRealtimeTargetAgent: () => makeAgent({ Name: 'SalesAgent' }),
                DelegateRealtimeToTarget: delegateSpy,
                PersistRealtimeTranscript: persistSpy,
            },
        });
        const params = makeParams({ cancellationToken: abortController.signal });

        const deps = await helper.BuildRealtimeSessionDeps(
            ctx,
            params,
            { success: true },
            { model: {} as BaseRealtimeModel, apiName: 'gpt-realtime-1' },
            null
        );

        expect(deps.AbortSignal).toBe(abortController.signal);
        expect(deps.SessionParams.Model).toBe('gpt-realtime-1');
        expect(deps.SessionParams.SystemPrompt).toContain('SalesAgent');

        await deps.DelegateToTarget({ CallID: 'c1', Arguments: '{}', AbortSignal: abortController.signal });
        expect(delegateSpy).toHaveBeenCalledTimes(1);
        await deps.PersistTranscript({ Role: 'user', Text: 'hello', IsFinal: true });
        expect(persistSpy).toHaveBeenCalledTimes(1);
    });

    it('persists non-final then final realtime transcripts in order, deduplicates open partials, and ignores blank/unlinked turns', async () => {
        const detail = makeConversationDetailStub('cd-1');
        const provider: Partial<IMetadataProvider> = {
            GetEntityObject: vi.fn(async () => detail) as IMetadataProvider['GetEntityObject'],
        };
        const ctx = CreateMockAgentRunContext({ ActiveProvider: provider as IMetadataProvider });

        // Blank text or missing conversationId returns null
        expect(await helper.PersistRealtimeTranscript(ctx, makeParams({ data: { conversationId: 'conv-1' } }), { Role: 'user', Text: '   ', IsFinal: false })).toBeNull();
        expect(await helper.PersistRealtimeTranscript(ctx, makeParams(), { Role: 'user', Text: 'hi', IsFinal: true })).toBeNull();

        const params = makeParams({ data: { conversationId: 'conv-1' }, agentSessionID: 'as-1' });

        // First partial creates row
        const partialId = await helper.PersistRealtimeTranscript(ctx, params, { Role: 'user', Text: 'Hel', IsFinal: false });
        expect(partialId).toBe('cd-1');
        expect(detail.Status).toBe('In-Progress');

        // Second partial while open is suppressed
        const dupPartial = await helper.PersistRealtimeTranscript(ctx, params, { Role: 'user', Text: 'Hello', IsFinal: false });
        expect(dupPartial).toBeNull();

        // Final loads and updates existing row
        const finalId = await helper.PersistRealtimeTranscript(ctx, params, { Role: 'user', Text: 'Hello world', IsFinal: true });
        expect(finalId).toBeNull(); // updated existing, not newly created
        expect(detail.Load).toHaveBeenCalledWith('cd-1');
        expect(detail.Status).toBe('Complete');
        expect(detail.Message).toBe('Hello world');

        await helper.FlushRealtimeTranscriptQueues(ctx);
    });

    it('serializes concurrent PersistRealtimeTranscript calls per role and logs errors when Save fails', async () => {
        const failingDetail = makeConversationDetailStub('cd-fail', false, false);
        const provider: Partial<IMetadataProvider> = {
            GetEntityObject: vi.fn(async () => failingDetail) as IMetadataProvider['GetEntityObject'],
        };
        const ctx = CreateMockAgentRunContext({ ActiveProvider: provider as IMetadataProvider });
        const params = makeParams({ data: { conversationId: 'conv-2' } });

        const p1 = helper.PersistRealtimeTranscript(ctx, params, { Role: 'assistant', Text: 'First', IsFinal: false });
        const p2 = helper.PersistRealtimeTranscript(ctx, params, { Role: 'assistant', Text: 'Second', IsFinal: true });
        const [r1, r2] = await Promise.all([p1, p2]);

        expect(r1).toBeNull();
        expect(r2).toBe('cd-fail');
        expect(ctx.Hooks.LogError).toHaveBeenCalledTimes(2);
    });

    it('checkpoints incremental usage on promptRun and handles null promptRun or failed saves gracefully', async () => {
        const ctx = CreateMockAgentRunContext();
        await expect(helper.CheckpointRealtimeUsage(ctx, null, { InputTokens: 10, OutputTokens: 5 })).resolves.toBeUndefined();

        const promptRun: Partial<MJAIPromptRunEntityExtended> = {
            Save: vi.fn(async () => true),
        };
        await helper.CheckpointRealtimeUsage(ctx, promptRun as MJAIPromptRunEntityExtended, {
            InputTokens: 120,
            OutputTokens: 45,
            InputTokenDetails: { AudioTokens: 100, TextTokens: 20 },
        });
        expect(promptRun.TokensPrompt).toBe(120);
        expect(promptRun.TokensCompletion).toBe(45);
        expect(promptRun.TokensUsed).toBe(165);
        expect(JSON.parse(promptRun.Result!).realtimeUsageDetails.input).toEqual({ AudioTokens: 100, TextTokens: 20 });

        const failingRun: Partial<MJAIPromptRunEntityExtended> = {
            Save: vi.fn(async () => false),
        };
        await helper.CheckpointRealtimeUsage(ctx, failingRun as MJAIPromptRunEntityExtended, { InputTokens: 1, OutputTokens: 1 });
        expect(ctx.Hooks.LogError).toHaveBeenCalledWith(expect.stringContaining('Failed to checkpoint realtime usage'), expect.anything());
    });

    it('finalizes realtime recording safely when inactive, missing metadata, or empty WAV, and finalizes runs on success/failure', async () => {
        const finalizeSpy = vi.fn(async () => ({ success: true }) as ExecuteAgentResult);
        const failSpy = vi.fn(async () => ({ success: false }) as ExecuteAgentResult);
        const stopSpy = vi.fn();
        const encodeSpy = vi.fn(() => null);
        const fakeController: Partial<RealtimeRecordingController> = {
            Stop: stopSpy,
            EncodeWav: encodeSpy,
        };
        const ctx = CreateMockAgentRunContext({
            RealtimeRecording: fakeController as RealtimeRecordingController,
            RealtimeRecordingAccountId: 'storage-1',
            Hooks: {
                FinalizeAgentRun: finalizeSpy,
                CreateFailureResult: failSpy,
            },
        });
        const params = makeParams({ agentSessionID: 'sess-1' });

        await helper.FinalizeRealtimeRecording(ctx, params);
        expect(stopSpy).toHaveBeenCalledTimes(1);
        expect(encodeSpy).toHaveBeenCalledTimes(1);
        expect(ctx.RealtimeRecording).toBeNull();
        expect(ctx.RealtimeRecordingAccountId).toBeNull();

        // Second call when RealtimeRecording is null is a no-op
        await helper.FinalizeRealtimeRecording(ctx, params);
        expect(stopSpy).toHaveBeenCalledTimes(1);

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
        expect(failSpy).toHaveBeenCalledWith('Socket closed', params.contextUser);

        // Missing ErrorMessage uses default message
        await helper.FinalizeRealtimeRun(ctx, params, {
            Success: false,
            TranscriptTurnCount: 0,
            FinalUsage: { InputTokens: 0, OutputTokens: 0 },
        });
        expect(failSpy).toHaveBeenLastCalledWith('Realtime session ended with an error.', params.contextUser);
    });
});
