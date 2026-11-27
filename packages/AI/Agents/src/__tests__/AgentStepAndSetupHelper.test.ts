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

    it('resolves AgentStepExecutionHelper and AgentRunSetupHelper and supports @RegisterClass replacement overrides', () => {
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

        const customSteps = ResolveAgentHelper({
            SeamKey: 'steps',
            BaseClass: BaseAgentStepExecutionHelper,
            DefaultClass: AgentStepExecutionHelper,
            DriverClass: 'TestCustomStepExecutionHelper',
        });
        const customSetup = ResolveAgentHelper({
            SeamKey: 'setup',
            BaseClass: BaseAgentRunSetupHelper,
            DefaultClass: AgentRunSetupHelper,
            DriverClass: 'TestCustomRunSetupHelper',
        });
        expect(customSteps).toBeInstanceOf(TestCustomStepExecutionHelper);
        expect(customSetup).toBeInstanceOf(TestCustomRunSetupHelper);
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
});
