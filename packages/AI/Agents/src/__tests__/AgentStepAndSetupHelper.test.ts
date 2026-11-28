import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
    AgentChatMessage,
    AgentConfiguration,
    AIPromptRunResult,
    BaseAgentNextStep,
    ExecuteAgentParams,
    ExecuteAgentResult,
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { MJAIAgentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { AgentRunWatchdog } from '../agent-run-watchdog';
import { COMPLETE_TASK_TOOL } from '../native-tools/control-tools';
import { BuildAssistantToolCallTurn, type NativeToolResult } from '../native-tools/tool-result-turns';
import { ResolveAgentHelper } from '../helpers/AgentHelperResolver';
import { BaseAgentStepExecutionHelper } from '../helpers/steps/BaseAgentStepExecutionHelper';
import { AgentStepExecutionHelper } from '../helpers/steps/AgentStepExecutionHelper';
import { BaseAgentRunSetupHelper } from '../helpers/setup/BaseAgentRunSetupHelper';
import { AgentRunSetupHelper } from '../helpers/setup/AgentRunSetupHelper';
import { AgentRunFinalizationHelper } from '../helpers/setup/AgentRunFinalizationHelper';
import { CreateMockAgentRunContext } from './helpers/mock-agent-run-context';

@RegisterClass(BaseAgentStepExecutionHelper, 'TestCustomStepExecutionHelper')
class TestCustomStepExecutionHelper extends AgentStepExecutionHelper {
    public readonly CustomTag = 'TestCustomStepExecutionHelper';
}

@RegisterClass(BaseAgentRunSetupHelper, 'TestCustomRunSetupHelper')
class TestCustomRunSetupHelper extends AgentRunSetupHelper {
    public readonly CustomTag = 'TestCustomRunSetupHelper';
}

function makeAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
    return {
        ID: '10000000-0000-4000-8000-000000000300',
        Name: 'SetupStepAgent',
        Status: 'Active',
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

function makeRun(overrides: Partial<MJAIAgentRunEntityExtended> = {}): MJAIAgentRunEntityExtended {
    return {
        ID: '20000000-0000-4000-8000-000000000301',
        AgentID: '10000000-0000-4000-8000-000000000300',
        Status: 'Running',
        Steps: [],
        Save: vi.fn(async () => true),
        ...overrides,
    } as MJAIAgentRunEntityExtended;
}

describe('BaseAgentStepExecutionHelper & BaseAgentRunSetupHelper (s11)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves AgentStepExecutionHelper and AgentRunSetupHelper and rejects metadata overrides for code-only steps/setup seams (S3)', () => {
        const steps = ResolveAgentHelper({
            SeamKey: 'steps',
            BaseClass: BaseAgentStepExecutionHelper,
            DefaultClass: AgentStepExecutionHelper,
        });
        const setup = ResolveAgentHelper({
            SeamKey: 'setup',
            BaseClass: BaseAgentRunSetupHelper,
            DefaultClass: AgentRunSetupHelper,
        });
        expect(steps).toBeInstanceOf(AgentStepExecutionHelper);
        expect(setup).toBeInstanceOf(AgentRunSetupHelper);

        expect(() =>
            ResolveAgentHelper({
                SeamKey: 'steps',
                BaseClass: BaseAgentStepExecutionHelper,
                DefaultClass: AgentStepExecutionHelper,
                DriverClass: 'TestCustomStepExecutionHelper',
            })
        ).toThrow(/code-only/);
        expect(() =>
            ResolveAgentHelper({
                SeamKey: 'setup',
                BaseClass: BaseAgentRunSetupHelper,
                DefaultClass: AgentRunSetupHelper,
                DriverClass: 'TestCustomRunSetupHelper',
            })
        ).toThrow(/code-only/);
    });

    it('ValidateNextStep blocks Actions/Sub-Agent while Plan Mode is unapproved and fails on unknown step keys', async () => {
        const helper = new AgentStepExecutionHelper();
        const ctx = CreateMockAgentRunContext({ PlanModeActive: true, PlanApproved: false });
        const params = makeParams();
        const run = makeRun();
        const stepEntity = { ID: 'step-1' } as MJAIAgentRunStepEntityExtended;

        const blockedActions = await helper.ValidateNextStep(
            ctx,
            params,
            { step: 'Actions', terminate: false, actions: [] },
            {},
            run,
            stepEntity
        );
        expect(blockedActions.step).toBe('Retry');
        expect(blockedActions.errorMessage).toContain('Plan mode is active');
        expect(ctx.GeneralValidationRetryCount).toBe(1);

        const blockedSubAgent = await helper.ValidateNextStep(
            ctx,
            params,
            { step: 'Sub-Agent', terminate: false },
            {},
            run,
            stepEntity
        );
        expect(blockedSubAgent.step).toBe('Retry');
        expect(ctx.GeneralValidationRetryCount).toBe(2);

        const unknownStep = await helper.ValidateNextStep(
            ctx,
            params,
            { step: 'NonExistentCustomStep', terminate: false },
            {},
            run,
            stepEntity
        );
        expect(unknownStep.step).toBe('Failed');
        expect(unknownStep.terminate).toBe(true);
        expect(unknownStep.errorMessage).toContain("Invalid next step 'NonExistentCustomStep'");
    });

    it('ValidatePlanNextStep rejects blank plan text with Retry and accepts non-empty plans', async () => {
        const helper = new AgentStepExecutionHelper();
        const ctx = CreateMockAgentRunContext();
        const params = makeParams();
        const run = makeRun();
        const stepEntity = { ID: 'step-plan' } as MJAIAgentRunStepEntityExtended;

        const emptyPlan = await helper.ValidatePlanNextStep(
            ctx,
            params,
            { step: 'Plan', terminate: false, planDetails: { plan: '   ' } },
            {},
            run,
            stepEntity
        );
        expect(emptyPlan.step).toBe('Retry');
        expect(emptyPlan.errorMessage).toContain('Plan text is required');
        expect(ctx.GeneralValidationRetryCount).toBe(1);

        const validPlan = await helper.ValidatePlanNextStep(
            ctx,
            params,
            { step: 'Plan', terminate: false, planDetails: { plan: '1. Inspect schema\n2. Run query' } },
            {},
            run,
            stepEntity
        );
        expect(validPlan.step).toBe('Plan');
    });

    it('ValidateChatNextStep handles Consult, Success/Failed/Retry remapping, null, and invalid options', async () => {
        const helper = new AgentStepExecutionHelper();
        const validateSpy = vi.fn(async (_p: ExecuteAgentParams, s: BaseAgentNextStep) => s);
        const ctx = CreateMockAgentRunContext({
            Hooks: { ValidateNextStep: validateSpy },
        });
        const run = makeRun();
        const stepEntity = { ID: 'step-chat' } as MJAIAgentRunStepEntityExtended;
        const chatStep: BaseAgentNextStep = { step: 'Chat', terminate: true, message: 'Need input?' };

        expect(await helper.ValidateChatNextStep(ctx, makeParams(), chatStep, {}, run, stepEntity, 'Consult')).toBe(
            chatStep
        );
        expect(await helper.ValidateChatNextStep(ctx, makeParams(), chatStep, {}, run, stepEntity, null)).toBe(chatStep);

        const remappedSuccess = await helper.ValidateChatNextStep(
            ctx,
            makeParams(),
            chatStep,
            {},
            run,
            stepEntity,
            'Success'
        );
        expect(remappedSuccess.step).toBe('Success');

        const remappedRetry = await helper.ValidateChatNextStep(ctx, makeParams(), chatStep, {}, run, stepEntity, 'Retry');
        expect(remappedRetry.step).toBe('Retry');
        expect(remappedRetry.terminate).toBe(false);
        expect(remappedRetry.errorMessage).toContain('Chat was remapped to Retry');

        const invalidOption = await helper.ValidateChatNextStep(
            ctx,
            makeParams(),
            chatStep,
            {},
            run,
            stepEntity,
            'UnexpectedMode' as MJAIAgentEntity['ChatHandlingOption']
        );
        expect(invalidOption.step).toBe('Chat');
    });

    it('IsFatalPromptError flags template, credential, severity=Fatal, and fatal AIErrorType errors while sparing transient ones', () => {
        const helper = new AgentStepExecutionHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.IsFatalPromptError(ctx, { errorMessage: 'Failed to render child prompt' } as AIPromptRunResult)).toBe(
            true
        );
        expect(helper.IsFatalPromptError(ctx, { errorMessage: 'No credentials found for vendor' } as AIPromptRunResult)).toBe(
            true
        );
        expect(helper.IsFatalPromptError(ctx, { errorMessage: 'No suitable model found' } as AIPromptRunResult)).toBe(true);
        expect(
            helper.IsFatalPromptError(ctx, {
                chatResult: { errorInfo: { severity: 'Fatal', errorType: 'Unknown' } },
            } as AIPromptRunResult)
        ).toBe(true);
        expect(
            helper.IsFatalPromptError(ctx, {
                chatResult: { errorInfo: { severity: 'Transient', errorType: 'ContextLengthExceeded' } },
            } as AIPromptRunResult)
        ).toBe(true);
        expect(helper.IsFatalPromptError(ctx, { errorMessage: 'transient 503' } as AIPromptRunResult)).toBe(false);
    });

    it('IsConfigurationError distinguishes config-related property/phrase errors from generic runtime errors', () => {
        const helper = new AgentStepExecutionHelper();
        const ctx = CreateMockAgentRunContext();

        expect(helper.IsConfigurationError(ctx, "Cannot read properties of undefined (reading 'childPrompt')").isConfigError).toBe(
            true
        );
        expect(helper.IsConfigurationError(ctx, "Cannot read properties of null (reading 'systemPrompt')").isConfigError).toBe(
            true
        );
        expect(helper.IsConfigurationError(ctx, 'No prompts configured for agent').isConfigError).toBe(true);
        expect(helper.IsConfigurationError(ctx, 'Agent type not found for ID: xyz').isConfigError).toBe(true);
        expect(
            helper.IsConfigurationError(ctx, 'Failed to render child prompt templates: syntax error').isConfigError
        ).toBe(true);
        expect(helper.IsConfigurationError(ctx, "Cannot read properties of undefined (reading 'rows')").isConfigError).toBe(
            false
        );
    });

    it('NoteHeldCompletionChange appends held-change note, differentiates native complete_task, and leaves Success untouched', () => {
        const helper = new AgentStepExecutionHelper();
        const ctx = CreateMockAgentRunContext();
        const held = { newElements: { foo: 'bar' } };

        const retryStep: BaseAgentNextStep = {
            step: 'Retry',
            terminate: false,
            errorMessage: 'Validation failed',
            payloadChangeRequest: held,
        };
        const out = helper.NoteHeldCompletionChange(ctx, held, retryStep);
        expect(out.payloadChangeRequest).toBeUndefined();
        expect(out.errorMessage).toContain('payloadChangeRequest sent with this completion');

        const nativeRetry: BaseAgentNextStep = {
            step: 'Retry',
            terminate: false,
            payloadToolCallId: 'tc-complete',
            retryInstructions: 'Fix schema',
            payloadChangeRequest: held,
            nativeTurn: {
                toolCalls: [{ id: 'tc-complete', name: COMPLETE_TASK_TOOL, arguments: {} }],
                sendResultsNatively: true,
            },
        };
        const nativeOut = helper.NoteHeldCompletionChange(ctx, held, nativeRetry);
        expect(nativeOut.retryInstructions).toContain('complete_task call');

        const successStep: BaseAgentNextStep = { step: 'Success', terminate: true, payloadChangeRequest: held };
        expect(helper.NoteHeldCompletionChange(ctx, held, successStep)).toBe(successStep);
    });

    it('DeclineTerminalAfterFailedWrite converts terminal step to Retry when an agent tool write fails', () => {
        const helper = new AgentStepExecutionHelper();
        const ctx = CreateMockAgentRunContext({
            NativeToolBindings: new Map([
                [COMPLETE_TASK_TOOL, { kind: 'complete' } as NonNullable<ReturnType<typeof CreateMockAgentRunContext>['NativeToolBindings']> extends Map<string, infer V> ? V : never],
            ]),
        });
        const step: BaseAgentNextStep = {
            step: 'Success',
            terminate: true,
            message: 'All saved',
            payloadToolCallId: 'tc-done',
            agentToolCalls: [{ toolCallId: 'tc-write', name: 'write_memory', input: {} }],
            nativeTurn: {
                toolCalls: [
                    { id: 'tc-write', name: 'write_memory', arguments: {} },
                    { id: 'tc-done', name: COMPLETE_TASK_TOOL, arguments: {} },
                ],
                sendResultsNatively: true,
            },
        };
        const results: NativeToolResult[] = [
            { toolCallId: 'tc-write', toolName: 'write_memory', content: 'write failed', isError: true },
        ];

        const declined = helper.DeclineTerminalAfterFailedWrite(ctx, step, results);
        expect(declined.step).toBe('Retry');
        expect(declined.terminate).toBe(false);
        expect(results).toHaveLength(2);
        expect(results[1].toolCallId).toBe('tc-done');
        expect(results[1].isError).toBe(true);

        // Clean results keep Success unchanged
        const okResults: NativeToolResult[] = [
            { toolCallId: 'tc-write', toolName: 'write_memory', content: 'saved', isError: false },
        ];
        expect(helper.DeclineTerminalAfterFailedWrite(ctx, step, okResults)).toBe(step);
    });

    it('AnswerNativeRetryTurn inserts error results for unanswered calls and returns false when none apply', () => {
        const helper = new AgentStepExecutionHelper();
        const insertSpy = vi.fn();
        const ctx = CreateMockAgentRunContext({
            Hooks: { InsertToolResultsAfterCallTurn: insertSpy },
        });
        const assistantTurn = BuildAssistantToolCallTurn({
            text: 'calling',
            toolCalls: [{ id: 'tc-1', name: 'run_query', arguments: {} }],
            sendResultsNatively: true,
        }) as AgentChatMessage;
        const params = makeParams({ conversationMessages: [assistantTurn] });

        const step: BaseAgentNextStep = {
            step: 'Retry',
            terminate: false,
            nativeTurn: {
                toolCalls: [{ id: 'tc-1', name: 'run_query', arguments: {} }],
                sendResultsNatively: true,
            },
        };

        expect(helper.AnswerNativeRetryTurn(ctx, params, step, 'Plan mode active')).toBe(true);
        expect(insertSpy).toHaveBeenCalledTimes(1);

        expect(helper.AnswerNativeRetryTurn(ctx, params, { step: 'Retry', terminate: false }, 'No native turn')).toBe(false);
    });

    it('ExecutePlanStep creates Plan step, raises feedback request, and returns terminating Chat step', async () => {
        const helper = new AgentStepExecutionHelper();
        const createStep = vi.fn(async () => ({ ID: 'step-plan-1' } as MJAIAgentRunStepEntityExtended));
        const raiseFeedback = vi.fn(async () => undefined);
        const ctx = CreateMockAgentRunContext({
            Hooks: {
                CreateStepEntity: createStep,
                RaiseFeedbackRequest: raiseFeedback,
                BuildPlanApprovalForm: (text) => ({ questions: [{ id: 'approve', label: text, type: { type: 'buttongroup', options: [] } }] }),
            },
        });

        const result = await helper.ExecutePlanStep(ctx, makeParams(), {
            step: 'Plan',
            terminate: false,
            planDetails: { plan: 'Step 1: Analyze\nStep 2: Apply' },
            previousPayload: { a: 1 },
            newPayload: { a: 2 },
        });

        expect(createStep).toHaveBeenCalledTimes(1);
        expect(raiseFeedback).toHaveBeenCalledTimes(1);
        expect(result.step).toBe('Chat');
        expect(result.terminate).toBe(true);
        expect(result.message).toContain('review the proposed plan');
        expect(result.newPayload).toEqual({ a: 2 });
    });

    it('ResolveChildPayloadArtifactTypeID respects explicit override, Never mode, and DefaultArtifactTypeID fallback', () => {
        const helper = new AgentStepExecutionHelper();
        const ctx = CreateMockAgentRunContext();

        const baseRes = { success: true, agentRun: makeRun() } as ExecuteAgentResult;
        expect(
            helper.ResolveChildPayloadArtifactTypeID(
                ctx,
                { ...baseRes, payloadArtifactTypeID: 'explicit-type' },
                makeAgent({ ArtifactCreationMode: 'Never', DefaultArtifactTypeID: 'default-type' })
            )
        ).toBe('explicit-type');

        expect(
            helper.ResolveChildPayloadArtifactTypeID(
                ctx,
                baseRes,
                makeAgent({ ArtifactCreationMode: 'Never', DefaultArtifactTypeID: 'default-type' })
            )
        ).toBeUndefined();

        expect(
            helper.ResolveChildPayloadArtifactTypeID(
                ctx,
                baseRes,
                makeAgent({ ArtifactCreationMode: 'Always', DefaultArtifactTypeID: 'default-type' })
            )
        ).toBe('default-type');
    });

    it('ExecuteNextStep enforces tree budget, handles initial step & PreProcessNextStep, and throws on unsupported step', async () => {
        const helper = new AgentStepExecutionHelper();
        const budgetCtx = CreateMockAgentRunContext({
            Hooks: { CheckTreeBudgetLimit: () => ({ exceeded: true, reason: 'Cost cap reached' }) },
        });
        const budgeted = await helper.ExecuteNextStep(
            budgetCtx,
            makeParams(),
            {} as AgentConfiguration,
            { step: 'Actions', terminate: false },
            1
        );
        expect(budgeted.step).toBe('Failed');
        expect(budgeted.terminate).toBe(true);
        expect(budgeted.errorMessage).toBe('Cost cap reached');

        // Initial step (previousDecision === null) falls back to ExecutePromptStep when DetermineInitialStep returns null
        const execPrompt = vi.fn(async (): Promise<BaseAgentNextStep> => ({ step: 'Success', terminate: true }));
        const initCtx = CreateMockAgentRunContext({
            AgentTypeInstance: {
                DetermineInitialStep: vi.fn(async () => null),
                DescribeExecutionRouting: vi.fn(() => null),
                PreProcessNextStep: vi.fn(async () => null),
            } as NonNullable<ReturnType<typeof CreateMockAgentRunContext>['AgentTypeInstance']>,
            Hooks: { ExecutePromptStep: execPrompt },
        });
        const initialOut = await helper.ExecuteNextStep(initCtx, makeParams(), {} as AgentConfiguration, null, 0);
        expect(execPrompt).toHaveBeenCalledTimes(1);
        expect(initialOut.step).toBe('Success');

        // Unsupported step throws
        await expect(
            helper.ExecuteNextStep(
                initCtx,
                makeParams(),
                {} as AgentConfiguration,
                { step: 'TotallyUnknownStep', terminate: false },
                1
            )
        ).rejects.toThrow(/Unsupported next step/);
    });

    it('ExecuteAgentInternal aborts on AbortSignal and terminates on consecutive failed steps & unproductive retries', async () => {
        const helper = new AgentStepExecutionHelper();
        const controller = new AbortController();
        controller.abort('cancelled mid-loop');
        const abortCtx = CreateMockAgentRunContext();

        await expect(
            helper.ExecuteAgentInternal(abortCtx, makeParams({ cancellationToken: controller.signal }), {} as AgentConfiguration)
        ).rejects.toThrow(/Cancelled during execution/);

        // Consecutive failed steps safety net
        const failCtx = CreateMockAgentRunContext({
            MaxConsecutiveFailedSteps: 2,
            Hooks: {
                ExecuteNextStep: vi.fn(async () => ({ step: 'Failed' as const, terminate: false, errorMessage: 'boom' })),
            },
        });
        const failRes = await helper.ExecuteAgentInternal(failCtx, makeParams(), {} as AgentConfiguration);
        expect(failRes.stepCount).toBe(2);
        expect(failRes.finalStep.step).toBe('Failed');
        expect(failRes.finalStep.terminate).toBe(true);
        expect(failRes.finalStep.errorMessage).toContain('2 consecutive failed steps');

        // Consecutive unproductive retries safety net
        const retryCtx = CreateMockAgentRunContext({
            MaxConsecutiveUnproductiveRetries: 2,
            Hooks: {
                ExecuteNextStep: vi.fn(async () => ({
                    step: 'Retry' as const,
                    terminate: false,
                    errorMessage: 'JSON parse failed',
                })),
            },
        });
        const retryRes = await helper.ExecuteAgentInternal(retryCtx, makeParams(), {} as AgentConfiguration);
        expect(retryRes.stepCount).toBe(2);
        expect(retryRes.finalStep.step).toBe('Failed');
        expect(retryRes.finalStep.terminate).toBe(true);
        expect(retryRes.finalStep.errorMessage).toContain('2 consecutive unproductive retries');
    });

    it('DeriveRunOutcome and CancellationReasonForAbort map run statuses and abort prefixes accurately', () => {
        const setup = new AgentRunSetupHelper();
        expect(setup.DeriveRunOutcome(CreateMockAgentRunContext({ AgentRun: makeRun({ Status: 'Cancelled' }) }))).toBe(
            'cancelled'
        );
        expect(setup.DeriveRunOutcome(CreateMockAgentRunContext({ AgentRun: makeRun({ Status: 'Failed' }) }))).toBe(
            'failure'
        );
        expect(setup.DeriveRunOutcome(CreateMockAgentRunContext({ AgentRun: makeRun({ Status: 'AwaitingFeedback' }) }))).toBe(
            'success'
        );
        expect(setup.DeriveRunOutcome(CreateMockAgentRunContext({ AgentRun: makeRun({ Status: 'Completed' }) }))).toBe(
            'success'
        );

        expect(
            AgentRunFinalizationHelper.CancellationReasonForAbort(
                AgentRunWatchdog.UserCancelAbortReason,
                'Agent execution exceeded maxExecutionTimeMs'
            )
        ).toBe('User Request');
        expect(
            AgentRunFinalizationHelper.CancellationReasonForAbort(
                'Agent execution exceeded maxExecutionTimeMs: over',
                'Agent execution exceeded maxExecutionTimeMs'
            )
        ).toBe('Timeout');
        expect(
            AgentRunFinalizationHelper.CancellationReasonForAbort(
                'Agent execution stalled with no progress signal: 15m',
                'Agent execution exceeded maxExecutionTimeMs',
                'Agent execution stalled with no progress signal'
            )
        ).toBe('Timeout');
        expect(
            AgentRunFinalizationHelper.CancellationReasonForAbort('shutdown', 'Agent execution exceeded maxExecutionTimeMs')
        ).toBe('System');
    });

    it('ValidateAgent returns null for Active agents and fails inactive agents while updating AgentRun', async () => {
        const setup = new AgentRunSetupHelper();
        const activeCtx = CreateMockAgentRunContext();
        expect(await setup.ValidateAgent(activeCtx, makeAgent({ Status: 'Active' }))).toBeNull();

        const disabledCtx = CreateMockAgentRunContext();
        const res = await setup.ValidateAgent(disabledCtx, makeAgent({ Name: 'DisabledAgent', Status: 'Disabled' }));
        expect(res?.success).toBe(false);
        expect(disabledCtx.AgentRun?.Status).toBe('Failed');
        expect(disabledCtx.AgentRun?.FinalStep).toBe('Failed');
        expect(disabledCtx.AgentRun?.ErrorMessage).toContain('not active');
    });

    it('ClearRunBoundState resets scope, audience, branches, and tool managers', () => {
        const setup = new AgentRunSetupHelper();
        const ctx = CreateMockAgentRunContext({
            RunScope: { PrimaryScopeEntityName: 'Accounts', PrimaryScopeRecordID: '1', SecondaryScopes: null },
            AudienceReaders: [],
            AudienceSource: { Mode: 'ScopeCommonReach' },
            ConversationBranches: [{ ID: 'b1' } as NonNullable<ReturnType<typeof CreateMockAgentRunContext>['ConversationBranches']>[number]],
        });
        const spilloverSpy = vi.spyOn(ctx.ActionSpilloverManager, 'Clear');
        const convSpy = vi.spyOn(ctx.ConversationToolManager, 'Clear');

        setup.ClearRunBoundState(ctx);
        expect(ctx.RunScope).toBeUndefined();
        expect(ctx.AudienceReaders).toBeUndefined();
        expect(ctx.AudienceSource).toBeUndefined();
        expect(ctx.ConversationBranches).toEqual([]);
        expect(spilloverSpy).toHaveBeenCalledTimes(1);
        expect(convSpy).toHaveBeenCalledTimes(1);
    });

    it('AreArtifactToolsEnabled evaluates workspace flag, runtime override, merged params, and raw/malformed JSON', () => {
        const setup = new AgentRunSetupHelper();
        const ctx = CreateMockAgentRunContext();

        vi.spyOn(ctx.ArtifactToolManager, 'IsWorkspaceEnabled').mockReturnValue(false);
        expect(setup.AreArtifactToolsEnabled(ctx, makeParams())).toBe(false);

        vi.spyOn(ctx.ArtifactToolManager, 'IsWorkspaceEnabled').mockReturnValue(true);
        expect(
            setup.AreArtifactToolsEnabled(
                ctx,
                makeParams({ data: { __agentTypePromptParams: { includeArtifactToolsDocs: false } } })
            )
        ).toBe(false);

        ctx.AgentTypePromptParams = { includeArtifactToolsDocs: false };
        expect(setup.AreArtifactToolsEnabled(ctx, makeParams())).toBe(false);

        ctx.AgentTypePromptParams = undefined;
        expect(
            setup.AreArtifactToolsEnabled(
                ctx,
                makeParams({ agent: makeAgent({ AgentTypePromptParams: '{"includeArtifactToolsDocs":false}' }) })
            )
        ).toBe(false);
        expect(
            setup.AreArtifactToolsEnabled(
                ctx,
                makeParams({ agent: makeAgent({ AgentTypePromptParams: '{bad-json' }) })
            )
        ).toBe(true);
    });

    it('ValidateRunChain detects circular chains and AssertLastRunIdIsUUID rejects malformed IDs', async () => {
        const setup = new AgentRunSetupHelper();
        const runId = '30000000-0000-4000-8000-000000000301';
        const ctx = CreateMockAgentRunContext({ AgentRun: makeRun({ ID: runId }) });

        expect(() => setup.AssertLastRunIdIsUUID(ctx, runId)).not.toThrow();
        expect(() => setup.AssertLastRunIdIsUUID(ctx, 'not-a-uuid')).toThrow(/UUID/i);

        // Direct self-cycle
        await expect(setup.ValidateRunChain(ctx, runId)).rejects.toThrow(/Circular reference/);

        // Acyclic 1-hop chain using preloadedLastRun
        await expect(
            setup.ValidateRunChain(ctx, '30000000-0000-4000-8000-000000000302', undefined, { LastRunID: null })
        ).resolves.toBeUndefined();
    });

    it('CreateFailureResult, CreateCancelledResult, and FinalizeAgentRun persist terminal run state accurately', async () => {
        const setup = new AgentRunSetupHelper();

        const failRun = makeRun();
        const failCtx = CreateMockAgentRunContext({ AgentRun: failRun });
        const failOut = await setup.CreateFailureResult(failCtx, 'Fatal crash');
        expect(failOut.success).toBe(false);
        expect(failRun.Status).toBe('Failed');
        expect(failRun.ErrorMessage).toBe('Fatal crash');

        const cancelController = new AbortController();
        cancelController.abort(AgentRunWatchdog.UserCancelAbortReason);
        const cancelRun = makeRun();
        const cancelCtx = CreateMockAgentRunContext({
            AgentRun: cancelRun,
            RunAbortController: cancelController,
        });
        const cancelOut = await setup.CreateCancelledResult(cancelCtx, 'Stopped by user');
        expect(cancelOut.success).toBe(false);
        expect(cancelRun.Status).toBe('Cancelled');
        expect(cancelRun.CancellationReason).toBe('User Request');

        // FinalizeAgentRun sets AwaitingFeedback for Chat, Paused when AwaitingWorkflowTaskID is set, Completed for Success
        const chatRun = makeRun();
        const chatCtx = CreateMockAgentRunContext({ AgentRun: chatRun });
        const chatOut = await setup.FinalizeAgentRun(chatCtx, { step: 'Chat', terminate: true, message: 'Question?' }, { k: 1 });
        expect(chatOut.success).toBe(true);
        expect(chatRun.Status).toBe('AwaitingFeedback');
        expect(chatRun.FinalStep).toBe('Chat');

        const pausedRun = makeRun();
        const pausedCtx = CreateMockAgentRunContext({ AgentRun: pausedRun, AwaitingWorkflowTaskID: 'wf-task-1' });
        await setup.FinalizeAgentRun(pausedCtx, { step: 'Success', terminate: true, message: 'Workflow started' });
        expect(pausedRun.Status).toBe('Paused');
    });

    it('PreloadAgentData skips when disabled or shared audience, and EndRun resolves cooperative pause waiters', async () => {
        const setup = new AgentRunSetupHelper();
        const logStatus = vi.fn();
        const ctx = CreateMockAgentRunContext({
            Hooks: { LogStatus: logStatus, RunAudienceAddsReader: () => true },
        });

        await setup.PreloadAgentData(ctx, makeParams({ disableDataPreloading: true }));
        expect(logStatus).toHaveBeenCalledWith(expect.stringContaining('Data preloading disabled'), true, expect.anything());

        await setup.PreloadAgentData(ctx, makeParams());
        expect(logStatus).toHaveBeenCalledWith(expect.stringContaining('Data preloading skipped'), false, expect.anything());

        const waiter = vi.fn();
        const finalizeRun = vi.fn(async () => undefined);
        const endCtx = CreateMockAgentRunContext({
            CooperativePauseState: {
                Requested: true,
                Reason: 'user pause',
                Waiters: [waiter],
            },
            Hooks: { FinalizeRun: finalizeRun },
        });
        await setup.EndRun(endCtx, makeParams());
        expect(waiter).toHaveBeenCalledWith(null);
        expect(endCtx.CooperativePauseState).toBeNull();
        expect(finalizeRun).toHaveBeenCalledWith('success');
    });

    it('C-R1-3: resets all per-run state across sequential ExecuteRun() calls while preserving caller hierarchy inputs', async () => {
        const setup = new AgentRunSetupHelper();
        const { AIAgentPermissionHelper } = await import('@memberjunction/ai-engine-base');
        const permSpy = vi.spyOn(AIAgentPermissionHelper, 'HasPermission').mockResolvedValue(true);

        try {
            const runCtx = CreateMockAgentRunContext({
                Depth: 2,
                AgentHierarchy: ['RootAgent', 'ParentAgent'],
                ParentStepCounts: [1, 3],
                Hooks: {
                    ExecuteAgentInternal: vi.fn(async () => ({
                        finalStep: { step: 'Success' as const, terminate: true, message: 'done' },
                        stepCount: 1,
                    })),
                    FinalizeAgentRun: vi.fn(async () => ({
                        success: true,
                        agentRun: makeRun({ Status: 'Completed' }),
                    })),
                },
            });

            // Simulate Run 1 polluting every mutable per-run field
            runCtx.ExecutionCounts.set('act-1', 5);
            runCtx.FileOutputs.push({ fileId: 'f1', fileName: 'out.pdf', mimeType: 'application/pdf', sizeBytes: 12 });
            runCtx.FeedbackRequestId = 'feedback-run-1';
            runCtx.ActivatedSkillIDs = ['skill-1'];
            runCtx.ConversationSkillIDs = ['skill-conv-1'];
            runCtx.SkillInvocations = [{ SkillID: 'skill-1', SkillName: 'S1', ActivationType: 'requested' } as never];
            runCtx.SubAgentRuns.push({ success: true, agentRun: makeRun() });
            runCtx.InjectedMemory = { notes: [{} as never], examples: [{} as never] };
            runCtx.InjectedRAG = { formattedContext: 'rag-1', chunks: [], totalDurationMs: 1 } as never;
            runCtx.HeldDecisions = { requests: [], heldAtStep: 1 } as never;
            runCtx.HeldCompletionChanges = [{} as never];
            runCtx.LastNativeTurnAppended = { sendResultsNatively: true } as never;
            runCtx.PendingAgentToolResults = { results: [] };
            runCtx.NativeToolBindings = new Map();
            runCtx.ConversationToolTurn = { turn: 3, count: 2 };
            runCtx.AgentTypePromptParams = { custom: 1 };
            runCtx.AwaitingWorkflowTaskID = 'wf-1';
            runCtx.ResolvedHandoffTarget = { agent: makeAgent() } as never;
            runCtx.LastSubAgentArtifactDirective = { mode: 'create' } as never;
            runCtx.LastSubAgentPayloadArtifactTypeID = 'art-type-1';
            runCtx.OpenSubAgentConsults.set('run-c1', { childRunId: 'run-c1', subAgentId: 'sa1', subAgentName: 'SA', round: 1, question: 'q' });
            runCtx.SubAgentConsultRounds.set('sa1', 2);
            runCtx.LoggedConsultUnsupportedAgentType = true;
            runCtx.RealtimeInFlightTurns.set('user', { id: 't1', open: true });
            runCtx.RealtimePersistQueues.set('user', Promise.resolve());

            const run2Observed: Record<string, unknown> = {};
            runCtx.Hooks.ExecuteAgentInternal = vi.fn(async () => {
                run2Observed.executionCountsSize = runCtx.ExecutionCounts.size;
                run2Observed.fileOutputsLen = runCtx.FileOutputs.length;
                run2Observed.feedbackRequestId = runCtx.FeedbackRequestId;
                run2Observed.activatedSkills = [...runCtx.ActivatedSkillIDs];
                run2Observed.convSkills = [...runCtx.ConversationSkillIDs];
                run2Observed.skillInvocations = [...runCtx.SkillInvocations];
                run2Observed.subAgentRunsLen = runCtx.SubAgentRuns.length;
                run2Observed.injectedMemoryNotes = runCtx.InjectedMemory.notes.length;
                run2Observed.injectedRag = runCtx.InjectedRAG;
                run2Observed.heldDecisions = runCtx.HeldDecisions;
                run2Observed.heldCompletionChanges = runCtx.HeldCompletionChanges.length;
                run2Observed.lastNativeTurn = runCtx.LastNativeTurnAppended;
                run2Observed.pendingAgentTools = runCtx.PendingAgentToolResults;
                run2Observed.nativeToolBindings = runCtx.NativeToolBindings;
                run2Observed.convToolTurn = runCtx.ConversationToolTurn;
                run2Observed.agentTypePromptParams = runCtx.AgentTypePromptParams;
                run2Observed.awaitingWorkflowTaskId = runCtx.AwaitingWorkflowTaskID;
                run2Observed.resolvedHandoffTarget = runCtx.ResolvedHandoffTarget;
                run2Observed.lastSubAgentArtifactDirective = runCtx.LastSubAgentArtifactDirective;
                run2Observed.lastSubAgentPayloadArtifactTypeID = runCtx.LastSubAgentPayloadArtifactTypeID;
                run2Observed.openConsultsSize = runCtx.OpenSubAgentConsults.size;
                run2Observed.consultRoundsSize = runCtx.SubAgentConsultRounds.size;
                run2Observed.loggedConsultUnsupported = runCtx.LoggedConsultUnsupportedAgentType;
                run2Observed.realtimeTurnsSize = runCtx.RealtimeInFlightTurns.size;
                run2Observed.realtimeQueuesSize = runCtx.RealtimePersistQueues.size;
                // Caller hierarchy inputs MUST remain preserved
                run2Observed.depth = runCtx.Depth;
                run2Observed.hierarchy = [...runCtx.AgentHierarchy];
                run2Observed.parentStepCounts = [...runCtx.ParentStepCounts];
                return { finalStep: { step: 'Success' as const, terminate: true, message: 'run2' }, stepCount: 1 };
            });

            await setup.ExecuteRun(runCtx, makeParams({ contextUser: { ID: 'u1', Email: 'u1@test.com' } as never }));

            expect(run2Observed.executionCountsSize).toBe(0);
            expect(run2Observed.fileOutputsLen).toBe(0);
            expect(run2Observed.feedbackRequestId).toBeUndefined();
            expect(run2Observed.activatedSkills).toEqual([]);
            expect(run2Observed.convSkills).toEqual([]);
            expect(run2Observed.skillInvocations).toEqual([]);
            expect(run2Observed.subAgentRunsLen).toBe(0);
            expect(run2Observed.injectedMemoryNotes).toBe(0);
            expect(run2Observed.injectedRag).toBeNull();
            expect(run2Observed.heldDecisions).toBeUndefined();
            expect(run2Observed.heldCompletionChanges).toBe(0);
            expect(run2Observed.lastNativeTurn).toBeUndefined();
            expect(run2Observed.pendingAgentTools).toBeUndefined();
            expect(run2Observed.nativeToolBindings).toBeUndefined();
            expect(run2Observed.convToolTurn).toBeUndefined();
            expect(run2Observed.agentTypePromptParams).toBeUndefined();
            expect(run2Observed.awaitingWorkflowTaskId).toBeNull();
            expect(run2Observed.resolvedHandoffTarget).toBeNull();
            expect(run2Observed.lastSubAgentArtifactDirective).toBeUndefined();
            expect(run2Observed.lastSubAgentPayloadArtifactTypeID).toBeUndefined();
            expect(run2Observed.openConsultsSize).toBe(0);
            expect(run2Observed.consultRoundsSize).toBe(0);
            expect(run2Observed.loggedConsultUnsupported).toBe(false);
            expect(run2Observed.realtimeTurnsSize).toBe(0);
            expect(run2Observed.realtimeQueuesSize).toBe(0);
            expect(run2Observed.depth).toBe(2);
            expect(run2Observed.hierarchy).toEqual(['RootAgent', 'ParentAgent']);
            expect(run2Observed.parentStepCounts).toEqual([1, 3]);
        } finally {
            permSpy.mockRestore();
        }
    });

    it('C-R1-4: routes Flow agents with Custom steps to inRun automatically, rejects explicit dispatch clearly, and validates Decision+Custom flows without UnsupportedStepType', async () => {
        const { AIEngine } = await import('@memberjunction/aiengine');
        const { CompileAndValidateFlowAgent, ResolveFlowExecutionMode } = await import('../agent-types/flow-graph-executor');
        const flowAgentId = '40000000-0000-4000-8000-000000000001';
        const customStepId = '40000000-0000-4000-8000-000000000010';
        const decisionStepId = '40000000-0000-4000-8000-000000000011';
        const endYesStepId = '40000000-0000-4000-8000-000000000012';
        const endNoStepId = '40000000-0000-4000-8000-000000000013';

        const steps = [
            {
                ID: customStepId,
                AgentID: flowAgentId,
                Name: 'Compliance Gate',
                StepType: 'Custom',
                StartingStep: true,
                Status: 'Active',
                Configuration: JSON.stringify({ stepType: 'ApprovalGate' }),
            },
            {
                ID: decisionStepId,
                AgentID: flowAgentId,
                Name: 'Risk Check',
                StepType: 'Decision',
                StartingStep: false,
                Status: 'Active',
                Configuration: JSON.stringify({
                    key: 'risk',
                    questions: {
                        approved: {
                            kind: 'Choice',
                            instructions: 'Is risk acceptable?',
                            options: [
                                { value: 'yes', description: 'Low risk' },
                                { value: 'no', description: 'High risk' },
                            ],
                        },
                    },
                }),
            },
            {
                ID: endYesStepId,
                AgentID: flowAgentId,
                Name: 'Finish Yes',
                StepType: 'Custom',
                StartingStep: false,
                Status: 'Active',
                Configuration: JSON.stringify({ stepType: 'ApprovalGate' }),
            },
            {
                ID: endNoStepId,
                AgentID: flowAgentId,
                Name: 'Finish No',
                StepType: 'Custom',
                StartingStep: false,
                Status: 'Active',
                Configuration: JSON.stringify({ stepType: 'ApprovalGate' }),
            },
        ];
        const paths = [
            { ID: 'p1', OriginStepID: customStepId, DestinationStepID: decisionStepId, Condition: null, Priority: 0 },
            { ID: 'p2', OriginStepID: decisionStepId, DestinationStepID: endYesStepId, Condition: "decisions.risk.approved.value === 'yes'", Priority: 0 },
            { ID: 'p3', OriginStepID: decisionStepId, DestinationStepID: endNoStepId, Condition: "decisions.risk.approved.value === 'no'", Priority: 1 },
        ];

        const getStepsSpy = vi.spyOn(AIEngine.Instance, 'GetAgentSteps').mockReturnValue(steps as never);
        const getPathsSpy = vi
            .spyOn(AIEngine.Instance, 'GetPathsFromStep')
            .mockImplementation((stepId: string) => paths.filter((p) => p.OriginStepID === stepId) as never);
        const agentsSpy = vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([]);
        const promptsSpy = vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue([]);

        try {
            // Default top-level run auto-selects 'inRun' because active Custom step exists
            const autoMode = ResolveFlowExecutionMode(flowAgentId, false, undefined);
            expect(autoMode.Mode).toBe('inRun');
            expect(autoMode.Reason).toMatch(/custom step/i);

            // Explicit 'dispatch' selects dispatch and CompileAndValidateFlowAgent fails loudly instructing 'inRun'
            const explicitDispatch = ResolveFlowExecutionMode(flowAgentId, false, 'dispatch');
            expect(explicitDispatch.Mode).toBe('dispatch');
            const dispatchRes = CompileAndValidateFlowAgent(flowAgentId, 'Regulated Flow', undefined, undefined, {
                AllowCustomStepPlaceholders: false,
            });
            expect('ErrorMessage' in dispatchRes).toBe(true);
            if ('ErrorMessage' in dispatchRes) {
                expect(dispatchRes.ErrorMessage).toMatch(/executionMode = 'inRun'/);
            }

            // In-run pre-flight Decision validation substitutes Custom placeholders and succeeds cleanly
            const inRunRes = CompileAndValidateFlowAgent(flowAgentId, 'Regulated Flow', undefined, undefined, {
                AllowCustomStepPlaceholders: true,
            });
            expect('Spec' in inRunRes).toBe(true);
        } finally {
            promptsSpy.mockRestore();
            agentsSpy.mockRestore();
            getPathsSpy.mockRestore();
            getStepsSpy.mockRestore();
        }
    });

    it('C-R1-7b: falls back to result.errorMessage when result.agentRun.ErrorMessage is absent across all sub-agent error sites', async () => {
        const { AgentStepDispatcher } = await import('../AgentStepDispatcher');
        const { AgentParallelSubAgentHelper } = await import('../helpers/subagents/AgentParallelSubAgentHelper');
        const { AgentRelatedSubAgentAndTaskGraphHelper } = await import('../helpers/subagents/AgentRelatedSubAgentAndTaskGraphHelper');

        const dispatcher = new AgentStepDispatcher();
        const md = dispatcher.FormatSubAgentResultAsMarkdown('ChildWorker', {
            success: false,
            errorMessage: 'Top-level child error',
            agentRun: { Status: 'Failed' } as MJAIAgentRunEntityExtended,
        });
        expect(md).toContain('**Error:** Top-level child error');

        const parallelHelper = new AgentParallelSubAgentHelper();
        const parallelMd = parallelHelper.BuildParallelSubAgentSummary([
            {
                request: { name: 'WorkerA', message: 'go' },
                result: {
                    success: false,
                    errorMessage: 'Parallel worker error',
                    agentRun: { Status: 'Failed' } as MJAIAgentRunEntityExtended,
                },
                subAgentEntity: makeAgent({ Name: 'WorkerA' }),
                upstreamPaths: [],
            },
        ]);
        expect(parallelMd).toContain('* Error: Parallel worker error');

        const finalizeStepSpy = vi.fn(async () => undefined);
        const pCtx = CreateMockAgentRunContext({ Hooks: { FinalizeStepEntity: finalizeStepSpy } });
        await parallelHelper.RecordParallelStepCompletion(
            pCtx,
            {
                request: { name: 'WorkerA', message: 'go' },
                result: {
                    success: false,
                    errorMessage: 'Parallel step error',
                    agentRun: { Status: 'Failed' } as MJAIAgentRunEntityExtended,
                },
                subAgentEntity: makeAgent({ Name: 'WorkerA' }),
                stepEntity: {} as MJAIAgentRunStepEntityExtended,
                upstreamPaths: [],
            },
            {}
        );
        expect(finalizeStepSpy).toHaveBeenCalledWith(
            expect.anything(),
            false,
            'Parallel step error',
            expect.objectContaining({
                subAgentResult: expect.objectContaining({ errorMessage: 'Parallel step error' }),
            })
        );

        // Related sub-agent path propagates result.errorMessage
        const relFinalizeSpy = vi.fn(async () => undefined);
        const relCtx = CreateMockAgentRunContext({
            Hooks: {
                CreateStepEntity: vi.fn(async () => ({ ID: 'step-rel' } as MJAIAgentRunStepEntityExtended)),
                FinalizeStepEntity: relFinalizeSpy,
                ExecuteSubAgent: vi.fn(async () => ({
                    success: false,
                    errorMessage: 'Related sub-agent direct error',
                    agentRun: { Status: 'Failed' } as MJAIAgentRunEntityExtended,
                })),
            },
        });
        const relatedHelper = new AgentRelatedSubAgentAndTaskGraphHelper();
        const relOut = await relatedHelper.ExecuteRelatedSubAgentStep(
            relCtx,
            { IsSubAgentConsultActive: () => false } as never,
            makeParams(),
            { step: 'Sub-Agent', terminate: false, subAgent: { name: 'RelWorker', message: 'help' } },
            makeAgent({ Name: 'RelWorker' }),
            { SubAgentID: 'sa-rel', SubAgentInputMapping: null, SubAgentOutputMapping: null } as never
        );
        expect(relOut.errorMessage).toBe('Related sub-agent direct error');
        expect(relFinalizeSpy).toHaveBeenCalledWith(
            expect.anything(),
            false,
            'Related sub-agent direct error',
            expect.objectContaining({
                subAgentResult: expect.objectContaining({ errorMessage: 'Related sub-agent direct error' }),
            })
        );
    });
});
