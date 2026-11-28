/**
 * Dedicated interface-level unit tests for Slice s2 (`BaseAgentPayloadHelper` / `AgentPayloadHelper`).
 * Exercises media placeholder interception/resolution, starting & final payload validation,
 * payload feedback checks, held completion drafts, `LastStepPayload`, and replacement-helper registration
 * directly against a mock `AgentRunContext`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import type { ActionParam, MJActionEntityExtended } from '@memberjunction/actions-base';
import type {
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import type { AIDecisionRunResult } from '@memberjunction/ai-prompts';
import { AgentDecisionService } from '../AgentDecisionService';
import { PayloadWarningType, type PayloadAnalysisResult } from '../PayloadChangeAnalyzer';
import { AgentHelperCache, ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import type { AgentRunContext } from '../helpers/AgentRunContext';
import { AgentPayloadHelper } from '../helpers/payload/AgentPayloadHelper';
import { BaseAgentPayloadHelper } from '../helpers/payload/BaseAgentPayloadHelper';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

function makeUser(overrides: Partial<UserInfo> = {}): UserInfo {
    const partial: Partial<UserInfo> = { ID: 'u-1', Name: 'Payload Tester', ...overrides };
    return partial as UserInfo;
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    const partial: Partial<MJAIAgentEntityExtended> = {
        ID: 'a-1',
        Name: 'PayloadAgent',
        ...overrides,
    };
    return partial as MJAIAgentEntityExtended;
}

function makeParams<P = Record<string, unknown>>(
    overrides: Partial<ExecuteAgentParams<unknown, P>> = {}
): ExecuteAgentParams<unknown, P> {
    return {
        agent: makeAgent(),
        conversationMessages: [],
        contextUser: makeUser(),
        ...overrides,
    };
}

function makeStepEntity(overrides: Partial<MJAIAgentRunStepEntityExtended> = {}): MJAIAgentRunStepEntityExtended {
    const partial: Partial<MJAIAgentRunStepEntityExtended> = {
        ID: 'step-1',
        StepNumber: 1,
        ...overrides,
    };
    return partial as MJAIAgentRunStepEntityExtended;
}

function makeActionWithMediaParam(paramName: string): MJActionEntityExtended {
    const paramRow = { Name: paramName, ValueType: 'MediaOutput' } as MJActionEntityExtended['Params']['Items'][number];
    const paramsCollection: Partial<MJActionEntityExtended['Params']> = { Items: [paramRow] };
    const partial: Partial<MJActionEntityExtended> = {
        Name: 'GenerateMedia',
        Params: paramsCollection as MJActionEntityExtended['Params'],
    };
    return partial as MJActionEntityExtended;
}

@RegisterClass(BaseAgentPayloadHelper, 'TestCustomPayloadHelper')
class TestCustomPayloadHelper extends AgentPayloadHelper {
    public override SerializePayloadAtStart(_ctx: AgentRunContext, payload: unknown): string | null {
        return payload ? `custom:${JSON.stringify(payload)}` : null;
    }
}

describe('Slice s2 — BaseAgentPayloadHelper & AgentPayloadHelper', () => {
    const helper = new AgentPayloadHelper();

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves AgentPayloadHelper via ClassFactory and throws on unimplemented BaseAgentPayloadHelper token methods', () => {
        const resolved = ResolveAgentHelper({
            SeamKey: 'payload',
            BaseClass: BaseAgentPayloadHelper,
            DefaultClass: AgentPayloadHelper,
        });
        expect(resolved).toBeInstanceOf(AgentPayloadHelper);

        const baseToken = new BaseAgentPayloadHelper();
        const ctx = CreateMockAgentRunContext();
        expect(() => baseToken.SerializePayloadAtStart(ctx, {})).toThrow(/must be implemented/);
        expect(() => baseToken.DetectFileOutputs(ctx, [])).toThrow(/must be implemented/);
        expect(() => baseToken.ResolveMediaPlaceholdersInString(ctx, 'hi')).toThrow(/must be implemented/);
    });

    it('supports custom @RegisterClass(BaseAgentPayloadHelper) replacement override via ResolveAgentHelper and AgentHelperCache', () => {
        expect(TestCustomPayloadHelper).toBeDefined();
        const resolved = ResolveAgentHelper({
            SeamKey: 'payload',
            BaseClass: BaseAgentPayloadHelper,
            DefaultClass: AgentPayloadHelper,
            DriverClass: 'TestCustomPayloadHelper',
        });
        expect(resolved).toBeInstanceOf(TestCustomPayloadHelper);
        expect(resolved.SerializePayloadAtStart(CreateMockAgentRunContext(), { ok: true })).toBe('custom:{"ok":true}');

        const cache = new AgentHelperCache();
        cache.ResetForRun([{ seam: 'payload', driverClass: 'TestCustomPayloadHelper' }]);
        const fromCache = cache.GetOrResolve({
            SeamKey: 'payload',
            BaseClass: BaseAgentPayloadHelper,
            DefaultClass: AgentPayloadHelper,
        });
        expect(fromCache).toBeInstanceOf(TestCustomPayloadHelper);
    });

    it('promotes MediaOutputs and detects FileOutputRef parameters while ignoring nulls and plain values', () => {
        const ctx = CreateMockAgentRunContext();
        helper.PromoteMediaOutputs(ctx, []);
        expect(ctx.MediaOutputs).toHaveLength(0);
        expect(ctx.Hooks.LogStatus).not.toHaveBeenCalled();

        helper.PromoteMediaOutputs(ctx, [{ modality: 'Image', mimeType: 'image/png', data: 'abc' }]);
        expect(ctx.MediaOutputs).toHaveLength(1);
        expect(ctx.Hooks.LogStatus).toHaveBeenCalledTimes(1);

        const detected = helper.DetectFileOutputs(ctx, [
            { Name: 'Empty', Type: 'Output', Value: null },
            { Name: 'Plain', Type: 'Output', Value: 'hello world' },
            {
                Name: 'Report',
                Type: 'Output',
                Value: {
                    __mj_file_output: true,
                    fileId: 'file-1',
                    fileName: 'report.pdf',
                    mimeType: 'application/pdf',
                    sizeBytes: 2048,
                },
            },
        ]);
        expect(detected).toHaveLength(1);
        expect(detected[0].fileName).toBe('report.pdf');
    });

    it('intercepts MediaOutput array items with large data or fileId while leaving Input and small params untouched', () => {
        const ctx = CreateMockAgentRunContext();
        const largeBase64 = 'A'.repeat(AgentPayloadHelper.LARGE_BINARY_THRESHOLD + 50);
        const actionEntity = makeActionWithMediaParam('Images');

        const params: ActionParam[] = [
            { Name: 'InputBlob', Type: 'Input', Value: largeBase64 },
            {
                Name: 'Images',
                Type: 'Output',
                Value: [
                    { modality: 'Image', mimeType: 'image/png', data: largeBase64 },
                    { modality: 'Image', mimeType: 'image/jpeg', fileId: 'file-99' },
                ],
            },
            { Name: 'SmallText', Type: 'Output', Value: 'ok' },
        ];

        const sanitized = helper.InterceptLargeBinaryContent(ctx, params, actionEntity);
        expect(sanitized[0].Value).toBe(largeBase64);
        expect(sanitized[2].Value).toBe('ok');
        expect(ctx.MediaOutputs).toHaveLength(2);
        const ref0 = ctx.MediaOutputs[0].refId!;
        const ref1 = ctx.MediaOutputs[1].refId!;
        expect(JSON.stringify(sanitized[1].Value)).toContain(`\${media:${ref0}}`);
        expect(JSON.stringify(sanitized[1].Value)).toContain(`\${media:${ref1}}`);
        expect(helper.InterceptLargeBinaryContent(ctx, [])).toEqual([]);
    });

    it('intercepts raw large base64 Output/Both strings while keeping non-base64 large prose untouched', () => {
        const ctx = CreateMockAgentRunContext();
        const largeBase64 = 'B'.repeat(AgentPayloadHelper.LARGE_BINARY_THRESHOLD + 10);
        const largeProse = 'Hello world! '.repeat(AgentPayloadHelper.LARGE_BINARY_THRESHOLD);

        const sanitized = helper.InterceptLargeBinaryContent(ctx, [
            { Name: 'RawBinary', Type: 'Both', Value: largeBase64 },
            { Name: 'LargeDocument', Type: 'Output', Value: largeProse },
        ]);

        expect(ctx.MediaOutputs).toHaveLength(1);
        expect(sanitized[0].Value).toBe(`\${media:${ctx.MediaOutputs[0].refId}}`);
        expect(sanitized[1].Value).toBe(largeProse);
    });

    it('resolves media placeholders recursively for data URIs, fileIds, unknown refs, primitives, and empty registries', () => {
        const emptyCtx = CreateMockAgentRunContext();
        const rawPayload = { a: '${media:missing-1}', b: 123, c: null as string | null };
        expect(helper.ResolveMediaPlaceholdersInPayload(emptyCtx, rawPayload)).toBe(rawPayload);
        expect(helper.ResolveMediaPlaceholdersInString(emptyCtx, '')).toBe('');

        const ctx = CreateMockAgentRunContext({
            MediaOutputs: [
                { modality: 'Image', mimeType: 'image/png', data: 'QUJD', refId: 'media-1' },
                { modality: 'Audio', mimeType: 'audio/wav', fileId: 'file-audio-1', refId: 'media-2' },
            ],
        });

        const resolved = helper.ResolveMediaPlaceholdersInPayload(ctx, {
            nested: ['${media:media-1}', '${media:media-2}', '${media:unknown-9}'],
            count: 7,
            flag: true,
            nothing: undefined as string | undefined,
            nil: null as string | null,
        });

        expect(resolved.nested[0]).toBe('data:image/png;base64,QUJD');
        expect(resolved.nested[1]).toBe('file-audio-1');
        expect(resolved.nested[2]).toBe('${media:unknown-9}');
        expect(resolved.count).toBe(7);
        expect(resolved.flag).toBe(true);
        expect(resolved.nothing).toBeUndefined();
        expect(resolved.nil).toBeNull();
        expect(ctx.Hooks.LogStatus).toHaveBeenCalledWith(expect.stringContaining('unknown-9'), true);
    });

    it('passes valid starting payloads, skips undefined payload/schema, and tolerates malformed starting schema JSON', async () => {
        const ctx = CreateMockAgentRunContext();
        const schema = JSON.stringify({ customerId: 'string' });

        expect(await helper.HandleStartingPayloadValidation(ctx, makeParams({ payload: { customerId: 'c1' } }))).toBeNull();
        expect(
            await helper.HandleStartingPayloadValidation(
                ctx,
                makeParams({ agent: makeAgent({ StartingPayloadValidation: schema }), payload: undefined })
            )
        ).toBeNull();

        const valid = await helper.HandleStartingPayloadValidation(
            ctx,
            makeParams({ agent: makeAgent({ StartingPayloadValidation: schema }), payload: { customerId: 'c1' } })
        );
        expect(valid).toBeNull();

        const malformed = await helper.HandleStartingPayloadValidation(
            ctx,
            makeParams({ agent: makeAgent({ StartingPayloadValidation: '{bad-json' }), payload: { customerId: 'c1' } })
        );
        expect(malformed).toBeNull();
        expect(ctx.Hooks.LogError).toHaveBeenCalledTimes(1);
    });

    it('enforces StartingPayloadValidation failures in Fail and Warn modes', async () => {
        const ctx = CreateMockAgentRunContext();
        const schema = JSON.stringify({ customerId: 'string' });

        const failResult = await helper.HandleStartingPayloadValidation(
            ctx,
            makeParams({
                agent: makeAgent({
                    Name: 'StrictAgent',
                    StartingPayloadValidation: schema,
                    StartingPayloadValidationMode: 'Fail',
                }),
                payload: { wrongField: 123 },
            })
        );
        expect(failResult).not.toBeNull();
        expect(failResult?.success).toBe(false);
        expect(ctx.AgentRun?.Status).toBe('Failed');
        expect(ctx.AgentRun?.FinalStep).toBe('Failed');

        const warnResult = await helper.HandleStartingPayloadValidation(
            ctx,
            makeParams({
                agent: makeAgent({
                    Name: 'WarnAgent',
                    StartingPayloadValidation: schema,
                    StartingPayloadValidationMode: 'Warn',
                }),
                payload: { wrongField: 123 },
            })
        );
        expect(warnResult).toBeNull();
        expect(ctx.Hooks.LogStatus).toHaveBeenCalledWith(expect.stringContaining('WARNING'), false, expect.anything());
    });

    it('enforces minimum execution requirements in ValidateSuccessNextStep and preserves nativeTurn metadata', async () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                CheckMinimumExecutionRequirements: vi.fn(async () => ["Action 'Audit' requires 1 execution(s)"]),
            },
        });
        const nextStep: BaseAgentNextStep = {
            step: 'Success',
            terminate: true,
            payloadToolCallId: 'call-77',
            nativeTurn: {
                text: 'done',
                toolCalls: [],
                sendResultsNatively: true,
            },
        };

        const out = await helper.ValidateSuccessNextStep(ctx, makeParams(), nextStep, { ok: true }, ctx.AgentRun!, makeStepEntity());
        expect(out.step).toBe('Retry');
        expect(out.terminate).toBe(false);
        expect(out.errorMessage).toContain("Action 'Audit' requires 1 execution(s)");
        expect(out.payloadToolCallId).toBe('call-77');
        expect(ctx.GeneralValidationRetryCount).toBe(1);
    });

    it('validates final payload pass, malformed schema fallback, and missing PayloadScope failure routing', async () => {
        const queueSpy = vi.fn();
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                QueueStepSave: queueSpy,
                HandleFinalPayloadValidationFailure: (p, s, pl, mode, errs, run, curStep) =>
                    helper.HandleFinalPayloadValidationFailure(ctx, p, s, pl, mode, errs, run, curStep),
            },
        });
        const stepEntity = makeStepEntity();
        const successStep: BaseAgentNextStep<{ report?: { title: string } }> = { step: 'Success', terminate: true };

        // Pass case with PayloadScope
        const passParams = makeParams({
            agent: makeAgent({
                FinalPayloadValidation: JSON.stringify({ title: 'string' }),
                PayloadScope: '/report',
            }),
        });
        const passed = await helper.ValidateSuccessNextStep(
            ctx,
            passParams,
            successStep,
            { report: { title: 'Q4' } },
            ctx.AgentRun!,
            stepEntity
        );
        expect(passed.step).toBe('Success');
        expect(stepEntity.FinalPayloadValidationResult).toBe('Pass');
        expect(queueSpy).toHaveBeenCalledTimes(1);

        // Missing PayloadScope routes to failure handler
        const missingScopeParams = makeParams({
            agent: makeAgent({
                FinalPayloadValidation: JSON.stringify({ title: 'string' }),
                FinalPayloadValidationMode: 'Fail',
                PayloadScope: '/missingSection',
            }),
        });
        const missingRes = await helper.ValidateSuccessNextStep(
            ctx,
            missingScopeParams,
            successStep,
            { report: { title: 'Q4' } },
            ctx.AgentRun!,
            makeStepEntity()
        );
        expect(missingRes.step).toBe('Failed');
        expect(missingRes.message).toContain("PayloadScope '/missingSection' not found");

        // Malformed FinalPayloadValidation JSON logs error and allows nextStep through
        const badSchemaParams = makeParams({
            agent: makeAgent({ FinalPayloadValidation: '{{{invalid' }),
        });
        const badRes = await helper.ValidateSuccessNextStep(
            ctx,
            badSchemaParams,
            successStep,
            { report: { title: 'Q4' } },
            ctx.AgentRun!,
            makeStepEntity()
        );
        expect(badRes.step).toBe('Success');
        expect(ctx.Hooks.LogError).toHaveBeenCalled();
    });

    it('handles HandleFinalPayloadValidationFailure across Retry cap, Fail, Warn, and unknown default modes', async () => {
        const ctx = CreateMockAgentRunContext();
        const params = makeParams({
            agent: makeAgent({ FinalPayloadValidationMaxRetries: 2 }),
        });
        const baseStep: BaseAgentNextStep = { step: 'Success', terminate: true };

        // Retry 1 of 2
        const r1 = await helper.HandleFinalPayloadValidationFailure(ctx, params, baseStep, {}, 'Retry', ['missing title'], ctx.AgentRun!, makeStepEntity());
        expect(r1.step).toBe('Retry');
        expect(r1.terminate).toBe(false);
        expect(ctx.ValidationRetryCount).toBe(1);

        // Retry 2 of 2 hits cap -> Failed
        const r2 = await helper.HandleFinalPayloadValidationFailure(ctx, params, baseStep, {}, 'Retry', ['missing title'], ctx.AgentRun!, makeStepEntity());
        expect(r2.step).toBe('Failed');
        expect(r2.terminate).toBe(true);
        expect(r2.message).toContain('Max validation retries (2) exceeded');

        // Fail mode
        const failStep = makeStepEntity();
        const failed = await helper.HandleFinalPayloadValidationFailure(ctx, params, baseStep, {}, 'Fail', ['bad type'], ctx.AgentRun!, failStep);
        expect(failed.step).toBe('Failed');
        expect(failStep.FinalPayloadValidationResult).toBe('Fail');

        // Warn mode preserves Success step
        const warnStep = makeStepEntity();
        const warned = await helper.HandleFinalPayloadValidationFailure(ctx, params, baseStep, {}, 'Warn', ['minor'], ctx.AgentRun!, warnStep);
        expect(warned.step).toBe('Success');
        expect(warnStep.FinalPayloadValidationResult).toBe('Warn');

        // Unknown mode defaults to Retry
        const defRes = await helper.HandleFinalPayloadValidationFailure(ctx, params, baseStep, {}, 'CustomMode', ['oops'], ctx.AgentRun!, makeStepEntity());
        expect(defRes.step).toBe('Retry');
    });

    it('recovers cleanly when QueueStepSave throws inside HandleFinalPayloadValidationFailure', async () => {
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                QueueStepSave: () => {
                    throw new Error('queue overflow');
                },
            },
        });
        const baseStep: BaseAgentNextStep = { step: 'Success', terminate: true };

        const failOut = await helper.HandleFinalPayloadValidationFailure(ctx, makeParams(), baseStep, {}, 'Fail', ['err'], ctx.AgentRun!, makeStepEntity());
        expect(failOut.step).toBe('Failed');
        expect(failOut.terminate).toBe(true);
        expect(ctx.Hooks.LogError).toHaveBeenCalledTimes(1);

        const warnOut = await helper.HandleFinalPayloadValidationFailure(ctx, makeParams(), baseStep, {}, 'Warn', ['err'], ctx.AgentRun!, makeStepEntity());
        expect(warnOut.step).toBe('Success');
    });

    it('serializes payloads, produces key-order-independent StableJSON, and identifies completion changes', () => {
        const ctx = CreateMockAgentRunContext();
        expect(helper.SerializePayloadAtStart(ctx, null)).toBeNull();
        expect(helper.SerializePayloadAtEnd(ctx, undefined)).toBeNull();
        expect(helper.SerializePayloadAtStart(ctx, { a: 1 })).toBe('{"a":1}');
        expect(helper.SerializePayloadAtEnd(ctx, { b: 2 })).toBe('{"b":2}');

        expect(AgentPayloadHelper.StableJSON({ z: 1, a: { d: 4, c: 3 } })).toBe(
            AgentPayloadHelper.StableJSON({ a: { c: 3, d: 4 }, z: 1 })
        );

        expect(AgentPayloadHelper.CarriesCompletionChange({ step: 'Success', terminate: true, payloadChangeRequest: { newElements: { x: 1 } } })).toBe(true);
        expect(AgentPayloadHelper.CarriesCompletionChange({ step: 'Success', terminate: true })).toBe(false);
        expect(AgentPayloadHelper.CarriesCompletionChange({ step: 'Retry', terminate: false, payloadChangeRequest: { newElements: { x: 1 } } })).toBe(false);
    });

    it('skips CheckPayloadChangesWhenOn when decisions are off, requiresFeedback is false, or step terminates the run', async () => {
        const ctx = CreateMockAgentRunContext();
        const createSpy = vi.spyOn(ctx.Hooks, 'CreateStepEntity');
        const promptResult = { success: true, result: '{}' } as AIPromptRunResult;

        expect(helper.IsPayloadFeedbackCheckOn(ctx, { payloadFeedbackCheck: true })).toBe(false);

        await helper.CheckPayloadChangesWhenOn(ctx, { requiresFeedback: true, analysis: undefined }, { step: 'Retry', terminate: false }, promptResult, { payloadFeedbackCheck: true }, makeParams());
        expect(createSpy).not.toHaveBeenCalled();

        ctx.Hooks.DecisionsEnabled = () => true;
        expect(helper.IsPayloadFeedbackCheckOn(ctx, { payloadFeedbackCheck: true })).toBe(true);
        expect(helper.IsPayloadFeedbackCheckOn(ctx, { payloadFeedbackCheck: false })).toBe(false);

        await helper.CheckPayloadChangesWhenOn(ctx, { requiresFeedback: false, analysis: undefined }, { step: 'Retry', terminate: false }, promptResult, { payloadFeedbackCheck: true }, makeParams());
        await helper.CheckPayloadChangesWhenOn(ctx, { requiresFeedback: true, analysis: undefined }, { step: 'Success', terminate: true }, promptResult, { payloadFeedbackCheck: true }, makeParams());
        await helper.CheckPayloadChangesWhenOn(ctx, { requiresFeedback: true, analysis: undefined }, { step: 'Chat', terminate: false }, promptResult, { payloadFeedbackCheck: true }, makeParams());
        expect(createSpy).not.toHaveBeenCalled();
    });

    it('executes CheckPayloadChangesWhenOn with AbortSignal propagation, injects unintended-change warning, and contains errors', async () => {
        const abortController = new AbortController();
        const askSpy = vi.fn(async (args: Parameters<AgentDecisionService['Ask']>[0]): Promise<AIDecisionRunResult> => {
            expect(args.CancellationToken).toBeDefined();
            const firstKey = Object.keys(args.Questions)[0];
            return {
                success: true,
                Answers: { [firstKey]: { Kind: 'Likelihood', Probability: 0.1 } },
            };
        });
        const decisionService: Partial<AgentDecisionService> = { Ask: askSpy };
        const stepEntity = makeStepEntity();
        const finalizeSpy = vi.fn(async () => undefined);
        const ctx = CreateMockAgentRunContext({
            AgentDecisionService: decisionService as AgentDecisionService,
            Hooks: {
                DecisionsEnabled: () => true,
                CreateStepEntity: vi.fn(async () => stepEntity),
                FinalizeStepEntity: finalizeSpy,
            },
        });
        const params = makeParams({ cancellationToken: abortController.signal });
        const analysis: PayloadAnalysisResult = {
            warnings: [
                {
                    type: PayloadWarningType.KeyRemoval,
                    severity: 'critical',
                    path: 'customer.email',
                    message: 'Email removed',
                    requiresFeedback: true,
                    details: { removedKeys: ['email'] },
                },
            ],
            criticalWarnings: [],
            summary: {
                totalWarnings: 1,
                warningsByType: {
                    [PayloadWarningType.ContentTruncation]: 0,
                    [PayloadWarningType.KeyRemoval]: 1,
                    [PayloadWarningType.TypeChange]: 0,
                    [PayloadWarningType.PatternAnomaly]: 0,
                    [PayloadWarningType.UnintendedOverwrite]: 0,
                },
                suspiciousChanges: 1,
            },
            requiresFeedback: true,
        };

        await helper.CheckPayloadChangesWhenOn(
            ctx,
            { requiresFeedback: true, analysis },
            { step: 'Retry', terminate: false, reasoning: 'Updating record' },
            { success: true, result: JSON.stringify({ reasoning: 'Updating record', message: 'Working' }) } as AIPromptRunResult,
            { payloadFeedbackCheck: true },
            params
        );

        expect(askSpy).toHaveBeenCalledTimes(1);
        expect(finalizeSpy).toHaveBeenCalledTimes(1);
        expect(params.conversationMessages.length).toBeGreaterThanOrEqual(1);
        expect(String(params.conversationMessages[0].content)).toContain('customer.email');

        // Pre-aborted CancellationToken skips AgentDecisionService.Ask immediately
        abortController.abort();
        await helper.CheckPayloadChangesWhenOn(
            ctx,
            { requiresFeedback: true, analysis },
            { step: 'Retry', terminate: false },
            { success: true, result: '{}' } as AIPromptRunResult,
            { payloadFeedbackCheck: true },
            params
        );
        expect(askSpy).toHaveBeenCalledTimes(1);

        // Error containment when AgentDecisionService throws
        const freshParams = makeParams();
        askSpy.mockRejectedValueOnce(new Error('decision model offline'));
        await expect(
            helper.CheckPayloadChangesWhenOn(
                ctx,
                { requiresFeedback: true, analysis },
                { step: 'Retry', terminate: false },
                { success: true, result: '{}' } as AIPromptRunResult,
                { payloadFeedbackCheck: true },
                freshParams
            )
        ).resolves.toBeUndefined();
    });

    it('applies turn payload changes with PayloadSelfWritePaths and create-new reset and summarizes results', () => {
        const ctx = CreateMockAgentRunContext({ PromptTurnCount: 1 });
        const restrictedParams = makeParams({
            agent: makeAgent({ PayloadSelfWritePaths: JSON.stringify(['allowed.*']) }),
        });

        const step: BaseAgentNextStep<Record<string, unknown>> = {
            step: 'Retry',
            terminate: false,
            payloadChangeRequest: {
                newElements: { allowed: { ok: true }, forbidden: 'nope' },
            },
        };
        const res = helper.ApplyTurnPayloadChange(ctx, restrictedParams, step, { existing: 1 }, false);
        const summary = helper.BuildPayloadChangeResultSummary(ctx, res);
        expect(summary.payloadValidation?.selfWriteViolations?.deniedOperations.length).toBeGreaterThan(0);

        const resetStep: BaseAgentNextStep<Record<string, unknown>> = {
            step: 'Success',
            terminate: true,
            artifactDirective: { behavior: 'create-new' },
            payloadChangeRequest: { newElements: { fresh: 1 } },
        };
        const resetRes = helper.ApplyTurnPayloadChange(ctx, makeParams(), resetStep, { stale: 99 }, true);
        expect(resetRes.result).toEqual({ fresh: 1 });
        expect(helper.GetDefaultPayloadSelfWritePaths(ctx)).toBeUndefined();
    });

    it('holds completion drafts on refused completion, deduplicates identical changes, replays, and clears on commit', () => {
        const ctx = CreateMockAgentRunContext();
        const params = makeParams({ agent: makeAgent({ Name: 'DraftAgent' }) });
        const completionStep: BaseAgentNextStep<{ summary?: string; count?: number }> = {
            step: 'Success',
            terminate: true,
            payloadChangeRequest: { newElements: { summary: 'v1', count: 1 } },
        };

        const draft = helper.BuildCompletionDraft(ctx, params, completionStep, {}, false);
        expect(draft.payload).toEqual({ summary: 'v1', count: 1 });
        expect(draft.summary).toBeDefined();

        // Refused completion holds the change without committing
        helper.UpdateHeldCompletionChanges(ctx, completionStep, false, false);
        expect(ctx.HeldCompletionChanges).toHaveLength(1);

        // Key-order equivalent change is recognized as already held and not duplicated
        expect(helper.IsHeldCompletionChange(ctx, { newElements: { count: 1, summary: 'v1' } })).toBe(true);
        helper.UpdateHeldCompletionChanges(
            ctx,
            { step: 'Success', terminate: true, payloadChangeRequest: { newElements: { count: 1, summary: 'v1' } } },
            false,
            false
        );
        expect(ctx.HeldCompletionChanges).toHaveLength(1);

        // Next turn sees held changes applied and skips re-applying identical held change in draft
        expect(helper.WithHeldCompletionChanges(ctx, params, {})).toEqual({ summary: 'v1', count: 1 });
        const redraft = helper.BuildCompletionDraft(ctx, params, completionStep, {}, false);
        expect(redraft.summary).toBeUndefined();
        expect(redraft.payload).toEqual({ summary: 'v1', count: 1 });

        // Committed completion clears held list
        helper.UpdateHeldCompletionChanges(ctx, completionStep, true, false);
        expect(ctx.HeldCompletionChanges).toHaveLength(0);
    });

    it('resolves turn payload across no-draft, accepted Success draft, and refused draft branches', () => {
        const ctx = CreateMockAgentRunContext();
        const committed = { v: 1 };
        const draft = { payload: { v: 2 } };

        expect(helper.ResolveTurnPayload(ctx, { step: 'Retry', terminate: false }, committed, undefined)).toEqual({
            payload: committed,
            committedDraft: false,
        });
        expect(
            helper.ResolveTurnPayload(ctx, { step: 'Retry', terminate: false, newPayload: { v: 3 } }, committed, undefined)
        ).toEqual({
            payload: { v: 3 },
            committedDraft: false,
        });
        expect(helper.ResolveTurnPayload(ctx, { step: 'Success', terminate: true }, committed, draft)).toEqual({
            payload: { v: 2 },
            committedDraft: true,
        });
        expect(
            helper.ResolveTurnPayload(ctx, { step: 'Retry', terminate: false, newPayload: draft.payload }, committed, draft)
        ).toEqual({
            payload: committed,
            committedDraft: false,
        });
        expect(
            helper.ResolveTurnPayload(ctx, { step: 'Retry', terminate: false, newPayload: { v: 9 } }, committed, draft)
        ).toEqual({
            payload: { v: 9 },
            committedDraft: false,
        });
    });

    it('resolves LastStepPayload across empty lists, out-of-order steps, 1-hop pointers, and broken pointers', () => {
        const step1Id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        const step2Id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        const missingId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

        expect(AgentPayloadHelper.LastStepPayload(null)).toBeNull();
        expect(AgentPayloadHelper.LastStepPayload([])).toBeNull();

        expect(
            AgentPayloadHelper.LastStepPayload([
                { ID: step2Id, StepNumber: 2, PayloadAtEnd: null, PayloadAtEndSourceStepID: step1Id },
                { ID: step1Id, StepNumber: 1, PayloadAtEnd: '{"ok":true}', PayloadAtEndSourceStepID: null },
            ])
        ).toBe('{"ok":true}');

        expect(
            AgentPayloadHelper.LastStepPayload([
                { ID: step2Id, StepNumber: 2, PayloadAtEnd: null, PayloadAtEndSourceStepID: missingId },
            ])
        ).toBeNull();
    });
});
