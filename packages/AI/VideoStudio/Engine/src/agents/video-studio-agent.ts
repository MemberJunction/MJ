import { BaseAgent } from '@memberjunction/ai-agents';
import {
    type AgentConfiguration,
    type AgentSubAgentRequest,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ExecuteAgentResult,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import {
    LogError,
    RunView,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import {
    BrandKitEngine,
    VideoStudioEngine,
    type MJBrandKitEntity,
    type MJVideoArchetypeEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, RegisterClass, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
    BuildGenerationProvenanceSummary,
    ValidateVideoGenerationSpec,
    VIDEO_INTERACTION_MODES,
    VIDEO_STUDIO_SPEC_VERSION,
    type GateRecord,
    type VideoAssetKind,
    type VideoFormat,
    type VideoGenerationSpec,
    type VideoInteractionMode,
} from '@memberjunction/video-studio-core';
import {
    CheckStagePrerequisite,
    ClearStaleEvidence,
    DeriveStatus,
    DescribeStageProgress,
    DescribeStoryboardForApproval,
    EvaluateGates,
    FindIntegrityOrGateCriterionFailure,
    GENERATED_ASSET_INTEGRITY_CRITERION_KEY,
    IsVideoStudioStageName,
    NormalizeStageName,
    ReadApprovalDecision,
    RequestRegeneration,
    ResolveCanonicalStage,
    VIDEO_STUDIO_STAGES,
    type VideoStudioStageName,
} from '../gates.js';
import { BuildRepairBrief } from '../review/critic-input.js';
import { ComposeHumanReviewNotes } from '../review/human-review-notes.js';
import {
    DEFAULT_VIDEO_STUDIO_SETTINGS,
    ResolveVideoStudioSettings,
    type VideoStudioSettings,
} from '../settings.js';
import { INLINE_EPHEMERAL_FILE_PREFIX, StoreFile } from '../storage.js';
import { ValidateVideoGenerationSpecAsync } from '../validate-spec-async.js';

export { VIDEO_STUDIO_STAGES, type VideoStudioStageName };

/**
 * Sentinel value placed in `Output.Videos[*].InlineBase64` inside the root `Video Studio`
 * loop payload (`_CURRENT_PAYLOAD`) so inline MP4 base64 is not sent to LLM prompts during
 * the loop and is restored on terminal exit (`Delivered`, `G4` `Plan`, `Failed`).
 */
export const INLINE_VIDEO_BASE64_SENTINEL = '[inline-mp4]' as const;

const STAGE_PROGRESS_PERCENTAGE: Readonly<Record<string, number>> = {
    'Video Studio - Director': 15,
    'Video Studio - Art Director': 30,
    'Video Studio - Storyboard': 45,
    'Video Studio - Pre-Production': 60,
    'Video Studio - Motion Engineer': 75,
    'Video Studio - Render': 90,
    'Video Studio - Critic': 95,
};

interface ConversationAttachmentRow {
    ID: string;
    MimeType?: string | null;
    FileName?: string | null;
    FileID?: string | null;
    InlineData?: string | null;
    ArtifactVersionID?: string | null;
}

interface AttachmentDedupeSets {
    ExistingFileIds: UUIDSet;
    ExistingArtifactVersionIds: UUIDSet;
    ExistingSources: Set<string>;
}

function isValidInteractionMode(value: unknown): value is VideoInteractionMode {
    return (
        typeof value === 'string' &&
        (VIDEO_INTERACTION_MODES as readonly string[]).includes(value)
    );
}

/**
 * Custom driver for the root `Video Studio` agent (`DriverClass = 'VideoStudioAgent'`).
 *
 * Enforces:
 * - Production call-chain cycle guard (`validateAgent`)
 * - Deterministic seeding of `VideoGenerationSpec`, settings, brand kit, and approval resume (`executeAgentInternal`)
 * - Stage evidence clearing, gate evaluation (`G1`–`G6`), status derivation, and progress reporting (`executeNextStep` / `ApplyStageResult`)
 * - Sequential stage execution, prerequisite gating, `G2` / `G4` `Plan` pauses, async pre-render validation, and prompt template injection (`validateSubAgentNextStep`)
 * - Final delivery verification across `G1`–`G6` (`validateSuccessNextStep`)
 */
@RegisterClass(BaseAgent, 'VideoStudioAgent')
export class VideoStudioAgent extends BaseAgent {
    protected _currentSettings: VideoStudioSettings = { ...DEFAULT_VIDEO_STUDIO_SETTINGS };
    protected _brandKitInScope: boolean = true;
    private _callerPayloadMode: VideoInteractionMode | null = null;
    private _callerMode: VideoInteractionMode | null = null;
    private _startedWithBrief: boolean = false;
    private _initialRoundCount: number = 0;
    private _inlineVideoBase64ByFormat: Partial<Record<VideoFormat, string>> = {};

    protected override async validateAgent(
        agent: MJAIAgentEntityExtended,
    ): Promise<ExecuteAgentResult | null> {
        const baseResult = await super.validateAgent(agent);
        if (baseResult) {
            return baseResult;
        }

        const agentName = (agent.Name ?? 'Video Studio').trim() || 'Video Studio';
        const normalizedSelf = agentName.toLowerCase();
        const parentHierarchy = this.AgentHierarchy.slice(0, -1);
        const hasCycle = parentHierarchy.some(
            (ancestor) => ancestor.trim().toLowerCase() === normalizedSelf,
        );
        if (!hasCycle) {
            return null;
        }

        const lastEntry = this.AgentHierarchy[this.AgentHierarchy.length - 1];
        const chainEntries =
            lastEntry && lastEntry.trim().toLowerCase() === normalizedSelf
                ? [...this.AgentHierarchy]
                : [...this.AgentHierarchy, agentName];
        const errorMessage = `${agentName} is already running higher in this call chain (${chainEntries.join(' → ')}). A production cannot start another production.`;

        const run = this.AgentRun;
        if (run) {
            run.ErrorMessage = errorMessage;
            run.Status = 'Failed';
            run.Success = false;
            run.FinalStep = 'Failed';
        }
        return {
            success: false,
            agentRun: run!,
        };
    }

    /**
     * Disables base Plan Mode so `Video Studio` can invoke `Director`, `Art Director`, and
     * `Storyboard` before pausing specifically at Gate `G2` (`ApproveStoryboard`) or `G4`.
     */
    protected override async resolvePlanModeGate(
        _params: ExecuteAgentParams,
    ): Promise<{ active: boolean; approved: boolean }> {
        return { active: false, approved: false };
    }

    protected override async executeAgentInternal<P>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        const configId = params.configurationId ?? this.AgentRun?.ConfigurationID ?? null;
        this._currentSettings = ResolveVideoStudioSettings(configId);

        await this.warmEngines(params);

        const seeded = this.buildSeededPayload(params, this._currentSettings);
        await this.intakeConversationAttachments(params, seeded);
        const nextParams: ExecuteAgentParams<P> = {
            ...params,
            payload: seeded as unknown as P,
        };

        const outcome = await super.executeAgentInternal(nextParams, config);
        const isTerminalExit =
            outcome.finalStep?.step === 'Success' || outcome.finalStep?.step === 'Failed';
        this.finalizePayloadInlineAndEphemeralOutputs(outcome.finalStep?.newPayload, isTerminalExit);
        this.finalizePayloadInlineAndEphemeralOutputs(this.AgentRun?.FinalPayloadObject, isTerminalExit);
        return outcome;
    }

    protected override async executeNextStep<P>(
        params: ExecuteAgentParams,
        config: AgentConfiguration,
        previousDecision: BaseAgentNextStep<P> | null,
        stepCount: number = 0,
    ): Promise<BaseAgentNextStep<P>> {
        const result = await super.executeNextStep(params, config, previousDecision, stepCount);

        if (previousDecision?.step === 'Sub-Agent') {
            const stageName =
                previousDecision.subAgent?.name ??
                previousDecision.subAgents?.[0]?.name ??
                '';
            const canonicalStage = ResolveCanonicalStage(stageName);
            if (canonicalStage) {
                const candidatePayload = (result.newPayload ?? params.payload ?? {}) as Partial<VideoGenerationSpec>;
                const stageSucceeded = result.step !== 'Failed';
                const updatedPayload = this.ApplyStageResult(
                    params,
                    canonicalStage,
                    candidatePayload,
                    stageSucceeded,
                );
                if (this.AgentRun) {
                    this.AgentRun.FinalPayloadObject = updatedPayload;
                }
                return {
                    ...result,
                    newPayload: updatedPayload as unknown as P,
                };
            }
        }

        return result;
    }

    /**
     * Applies post-stage invariants after a Video Studio stage sub-agent finishes:
     * clears stale downstream evidence (when the stage succeeded), evaluates `G1`–`G6`,
     * derives `Status`, and emits a single live progress update.
     */
    protected ApplyStageResult(
        params: ExecuteAgentParams,
        stageName: string,
        payload: Partial<VideoGenerationSpec>,
        stageSucceeded: boolean = true,
    ): Partial<VideoGenerationSpec> {
        const canonicalStage = ResolveCanonicalStage(stageName) ?? stageName.trim();
        const cloned = structuredClone(payload ?? {});

        this.syncArchetypeId(cloned);
        this.syncDeliverableFormats(cloned);
        this.restoreCallerInteraction(cloned);

        if (stageSucceeded) {
            ClearStaleEvidence(canonicalStage, cloned);
            if (!cloned.Output?.Videos || Object.keys(cloned.Output.Videos).length === 0) {
                this._inlineVideoBase64ByFormat = {};
            }
        }
        this.stripInlineVideoBase64(cloned);

        const gates = this.evaluateAndAssignGates(cloned);
        if (stageSucceeded && canonicalStage === 'Video Studio - Critic') {
            this.applyCriticRoundSideEffects(cloned, gates);
        }

        cloned.Status = DeriveStatus(cloned, gates);
        this.emitStageProgress(params, canonicalStage, cloned, gates);

        return cloned;
    }

    protected override async validateNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
    ): Promise<BaseAgentNextStep<P>> {
        if (nextStep.step === 'ForEach' && IsVideoStudioStageName(nextStep.forEach?.subAgent?.name)) {
            const msg = 'Call stages with a Sub-Agent step, one at a time';
            return {
                ...nextStep,
                step: 'Retry',
                terminate: false,
                retryInstructions: msg,
                errorMessage: msg,
            };
        }
        if (nextStep.step === 'While' && IsVideoStudioStageName(nextStep.while?.subAgent?.name)) {
            const msg = 'Call stages with a Sub-Agent step, one at a time';
            return {
                ...nextStep,
                step: 'Retry',
                terminate: false,
                retryInstructions: msg,
                errorMessage: msg,
            };
        }
        const isClientToolsStep = nextStep.step === ('ClientTools' as typeof nextStep.step);
        const normalizedStep =
            isClientToolsStep && (nextStep.terminate === true || nextStep.terminateAfterExecution === true)
                ? { ...nextStep, terminate: false, terminateAfterExecution: false }
                : nextStep;
        const result = await super.validateNextStep(
            params,
            normalizedStep,
            currentPayload,
            agentRun,
            currentStep,
        );
        if (
            result.step === ('ClientTools' as typeof result.step) &&
            (result.terminate === true || result.terminateAfterExecution === true)
        ) {
            return { ...result, terminate: false, terminateAfterExecution: false };
        }
        return result;
    }

    protected override async validateSubAgentNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
    ): Promise<BaseAgentNextStep<P>> {
        const baseResult = await super.validateSubAgentNextStep(
            params,
            nextStep,
            currentPayload,
            agentRun,
            currentStep,
        );
        if (baseResult.step === 'Retry') {
            return baseResult;
        }

        const stageRequests = this.extractRequestedStages(baseResult);
        if (stageRequests.length === 0) {
            return baseResult;
        }
        const constraintRetry = this.validateStageSequenceConstraints(baseResult, nextStep, stageRequests);
        if (constraintRetry) {
            return constraintRetry;
        }

        const stageName = ResolveCanonicalStage(stageRequests[0].name) ?? stageRequests[0].name;
        const normalizedStage = NormalizeStageName(stageName);
        const { spec, gates, effectiveMode } = this.prepareSpecAndGates(currentPayload ?? params.payload);

        const g2Pause = this.checkG2PlanCheckpoint(normalizedStage, spec, gates, currentPayload);
        if (g2Pause) {
            return g2Pause;
        }

        const prereqRetry = this.checkStagePrerequisites(baseResult, stageName, spec, gates);
        if (prereqRetry) {
            return prereqRetry;
        }

        if (normalizedStage === 'Render') {
            const renderRetry = await this.validatePreRenderSpec(params, spec, effectiveMode, baseResult);
            if (renderRetry) {
                return renderRetry;
            }
        }

        this.injectStageTemplateParameters(baseResult, normalizedStage, spec);
        return baseResult;
    }

    protected override async validateSuccessNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
    ): Promise<BaseAgentNextStep<P>> {
        const baseResult = await super.validateSuccessNextStep(
            params,
            nextStep,
            currentPayload,
            agentRun,
            currentStep,
        );
        if (baseResult.step === 'Retry') {
            return baseResult;
        }

        const { spec, gates, effectiveMode } = this.prepareSpecAndGates(
            baseResult.newPayload ?? currentPayload ?? params.payload,
        );

        const terminalFailure = FindIntegrityOrGateCriterionFailure(spec, {
            Settings: this._currentSettings,
            BrandKitInScope: this._brandKitInScope,
            EffectiveInteractionMode: effectiveMode,
            InitialRoundCount: this._initialRoundCount,
        });
        if (terminalFailure) {
            spec.Status = DeriveStatus(spec, gates);
            this.restoreInlineVideoBase64(spec);
            this.clearEphemeralOutputFileIds(spec);
            return {
                ...baseResult,
                step: 'Failed',
                terminate: true,
                errorMessage: terminalFailure,
                previousPayload: currentPayload,
                newPayload: spec as unknown as P,
            };
        }

        const g4Pause = this.checkG4PlanCheckpoint(spec, gates, currentPayload);
        if (g4Pause) {
            return g4Pause;
        }

        const nonPassing = gates.filter((g) => g.Status !== 'Passed');
        if (nonPassing.length > 0) {
            return this.buildNonPassingGatesRetry(baseResult, spec, gates, nonPassing, currentPayload);
        }

        return this.finalizeDeliveredStep(baseResult, spec, currentPayload);
    }

    // -----------------------------------------------------------------------
    // Private / Protected Helpers
    // -----------------------------------------------------------------------

    private finalizePayloadInlineAndEphemeralOutputs(
        payloadObj: unknown,
        isTerminalExit: boolean,
    ): void {
        if (!payloadObj || typeof payloadObj !== 'object') {
            return;
        }
        const spec = payloadObj as Partial<VideoGenerationSpec>;
        this.restoreInlineVideoBase64(spec);
        if (isTerminalExit) {
            this.clearEphemeralOutputFileIds(spec);
        }
    }

    private evaluateAndAssignGates(spec: Partial<VideoGenerationSpec>): GateRecord[] {
        const effectiveMode = this.resolveEffectiveInteractionMode(spec);
        const gates = EvaluateGates(spec, {
            Settings: this._currentSettings,
            BrandKitInScope: this._brandKitInScope,
            EffectiveInteractionMode: effectiveMode,
            InitialRoundCount: this._initialRoundCount,
        });
        spec.Review = {
            ...(spec.Review ?? { Rounds: [] }),
            Gates: gates,
            Rounds: Array.isArray(spec.Review?.Rounds) ? spec.Review.Rounds : [],
        };
        return gates;
    }

    private prepareSpecAndGates(rawPayload: unknown): {
        spec: Partial<VideoGenerationSpec>;
        gates: GateRecord[];
        effectiveMode: VideoInteractionMode;
    } {
        const spec = structuredClone((rawPayload ?? {}) as Partial<VideoGenerationSpec>);
        this.syncDeliverableFormats(spec);
        this.restoreCallerInteraction(spec);
        const effectiveMode = this.resolveEffectiveInteractionMode(spec);
        const gates = this.evaluateAndAssignGates(spec);
        return { spec, gates, effectiveMode };
    }

    private applyCriticRoundSideEffects(
        spec: Partial<VideoGenerationSpec>,
        gates: ReadonlyArray<GateRecord>,
    ): void {
        const rounds = spec.Review?.Rounds ?? [];
        const newestRound = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;
        if (newestRound) {
            this.requestGeneratedAssetRegenerations(spec, newestRound);
        }

        const g5 = gates.find((g) => g.Gate === 'G5');
        if (g5?.Status === 'Passed') {
            if (newestRound && Array.isArray(newestRound.Defects)) {
                for (const defect of newestRound.Defects) {
                    if (
                        defect &&
                        defect.Status === 'Open' &&
                        defect.Criterion !== GENERATED_ASSET_INTEGRITY_CRITERION_KEY
                    ) {
                        defect.Status = 'Deferred';
                    }
                }
            }
            if (spec.Review) {
                spec.Review.HumanReviewNotes = ComposeHumanReviewNotes(spec);
            }
        }
    }

    private requestGeneratedAssetRegenerations(
        spec: Partial<VideoGenerationSpec>,
        round: VideoGenerationSpec['Review']['Rounds'][number],
    ): void {
        if (!Array.isArray(round.Defects)) {
            return;
        }
        const handledKeys = new Set<string>();
        for (const defect of round.Defects) {
            const assetKey = defect?.AssetKey?.trim();
            if (!defect || defect.Status !== 'Open' || !assetKey || handledKeys.has(assetKey)) {
                continue;
            }
            const isGenerated = (spec.Assets?.Approved ?? []).some(
                (a) => a?.Key === assetKey && a.Provenance === 'Generated',
            );
            if (!isGenerated) {
                continue;
            }
            handledKeys.add(assetKey);
            const regen = RequestRegeneration(
                spec,
                assetKey,
                this._currentSettings.MaxRegenerations,
            );
            if (regen.Allowed && regen.Spec.Assets) {
                spec.Assets = regen.Spec.Assets;
            }
        }
    }

    private emitStageProgress(
        params: ExecuteAgentParams,
        canonicalStage: string,
        spec: Partial<VideoGenerationSpec>,
        gates: ReadonlyArray<GateRecord>,
    ): void {
        const progressText = DescribeStageProgress(canonicalStage, spec);
        const formattedMessage = this.formatHierarchicalMessage(progressText);
        try {
            params.onProgress?.({
                step: 'subagent_execution',
                message: formattedMessage,
                percentage: STAGE_PROGRESS_PERCENTAGE[canonicalStage] ?? 50,
                metadata: {
                    VideoStudioStatus: spec.Status,
                    Gates: gates,
                },
                displayMode: 'live',
            });
        } catch {
            // Swallow progress callback errors so a UI listener cannot abort the production loop
        }
    }

    private extractRequestedStages<P>(
        stepResult: BaseAgentNextStep<P>,
    ): Array<AgentSubAgentRequest<P>> {
        const requestedList =
            Array.isArray(stepResult.subAgents) && stepResult.subAgents.length > 0
                ? stepResult.subAgents
                : stepResult.subAgent
                  ? [stepResult.subAgent]
                  : [];
        return requestedList.filter((req) => IsVideoStudioStageName(req?.name));
    }

    private validateStageSequenceConstraints<P>(
        baseResult: BaseAgentNextStep<P>,
        nextStep: BaseAgentNextStep<P>,
        stageRequests: ReadonlyArray<AgentSubAgentRequest<P>>,
    ): BaseAgentNextStep<P> | null {
        if (stageRequests.length > 1) {
            const names = stageRequests.map((r) => r.name).join(', ');
            const msg = `Only one Video Studio stage sub-agent may run at a time (requested: ${names}). Invoke stages sequentially.`;
            return { ...baseResult, step: 'Retry', retryInstructions: msg, errorMessage: msg };
        }
        if (this.hasForbiddenStageTermination(baseResult, nextStep, stageRequests)) {
            const msg = 'Stages never end the run; finish with Success';
            return { ...baseResult, step: 'Retry', terminate: false, retryInstructions: msg, errorMessage: msg };
        }
        return null;
    }

    private hasForbiddenStageTermination<P>(
        baseResult: BaseAgentNextStep<P>,
        nextStep: BaseAgentNextStep<P>,
        stageRequests: ReadonlyArray<AgentSubAgentRequest<P>>,
    ): boolean {
        const hasStepFinishIf =
            (baseResult.finishIf !== undefined && baseResult.finishIf !== null) ||
            (nextStep.finishIf !== undefined && nextStep.finishIf !== null);
        return hasStepFinishIf || stageRequests.some((req) => req?.terminateAfter === true);
    }

    private checkStagePrerequisites<P>(
        baseResult: BaseAgentNextStep<P>,
        stageName: string,
        spec: Partial<VideoGenerationSpec>,
        gates: ReadonlyArray<GateRecord>,
    ): BaseAgentNextStep<P> | null {
        const refusal = CheckStagePrerequisite(
            stageName,
            spec,
            gates,
            this._currentSettings,
            this._initialRoundCount,
        );
        if (refusal) {
            return {
                ...baseResult,
                step: 'Retry',
                retryInstructions: refusal,
                errorMessage: refusal,
                newPayload: spec as unknown as P,
            };
        }
        return null;
    }

    private checkG2PlanCheckpoint<P>(
        normalizedStage: string,
        spec: Partial<VideoGenerationSpec>,
        gates: ReadonlyArray<GateRecord>,
        currentPayload: P,
    ): BaseAgentNextStep<P> | null {
        if (normalizedStage !== 'Pre-Production') {
            return null;
        }
        const g1 = gates.find((g) => g.Gate === 'G1');
        const g2 = gates.find((g) => g.Gate === 'G2');
        if (g1?.Status !== 'Passed' || g2?.Status !== 'Pending' || g2?.Notes !== 'AwaitingApproval') {
            return null;
        }
        const pausedGates = gates.map((g): GateRecord =>
            g.Gate === 'G2' ? { ...g, Status: 'Blocked', Notes: 'AwaitingApproval' } : g,
        );
        spec.Review!.Gates = pausedGates;
        spec.Status = DeriveStatus(spec, pausedGates);
        return {
            step: 'Plan' as BaseAgentNextStep<P>['step'],
            terminate: false,
            planDetails: {
                plan: DescribeStoryboardForApproval(spec),
            },
            message:
                "Storyboard ready for approval. Reply starting with 'Approve' to continue, or say what to change.",
            previousPayload: currentPayload,
            newPayload: spec as unknown as P,
        };
    }

    private async validatePreRenderSpec<P>(
        params: ExecuteAgentParams,
        spec: Partial<VideoGenerationSpec>,
        effectiveMode: VideoInteractionMode,
        baseResult: BaseAgentNextStep<P>,
    ): Promise<BaseAgentNextStep<P> | null> {
        const candidateForRender = this.buildNormalizedSpecForValidation(
            spec,
            'Composed',
            effectiveMode,
        );
        const validationResult = params.contextUser
            ? await ValidateVideoGenerationSpecAsync(
                  candidateForRender,
                  'Composed',
                  params.contextUser,
                  { MaxGeneratedVideoSeconds: this._currentSettings.MaxGeneratedVideoSeconds },
              )
            : ValidateVideoGenerationSpec(candidateForRender, 'Composed', {
                  MaxGeneratedVideoSeconds: this._currentSettings.MaxGeneratedVideoSeconds,
              });

        if (validationResult.Valid) {
            return null;
        }
        const errSummary = validationResult.Errors.map(
            (e) => `${e.Code} (${e.Path}): ${e.Message}`,
        ).join('; ');
        const msg = `G3 (Stills): spec validation failed before Render: ${errSummary}`;
        return {
            ...baseResult,
            step: 'Retry',
            retryInstructions: msg,
            errorMessage: msg,
            newPayload: spec as unknown as P,
        };
    }

    private injectStageTemplateParameters<P>(
        baseResult: BaseAgentNextStep<P>,
        normalizedStage: string,
        spec: Partial<VideoGenerationSpec>,
    ): void {
        const stageTemplateParams = this.buildStageTemplateParameters(normalizedStage, spec);
        if (Object.keys(stageTemplateParams).length === 0) {
            return;
        }
        if (baseResult.subAgent && IsVideoStudioStageName(baseResult.subAgent.name)) {
            baseResult.subAgent = {
                ...baseResult.subAgent,
                templateParameters: {
                    ...(baseResult.subAgent.templateParameters ?? {}),
                    ...stageTemplateParams,
                },
            };
        }
        if (Array.isArray(baseResult.subAgents)) {
            baseResult.subAgents = baseResult.subAgents.map((entry) =>
                IsVideoStudioStageName(entry?.name)
                    ? {
                          ...entry,
                          templateParameters: {
                              ...(entry.templateParameters ?? {}),
                              ...stageTemplateParams,
                          },
                      }
                    : entry,
            );
        }
    }

    private checkG4PlanCheckpoint<P>(
        spec: Partial<VideoGenerationSpec>,
        gates: ReadonlyArray<GateRecord>,
        currentPayload: P,
    ): BaseAgentNextStep<P> | null {
        const g1 = gates.find((g) => g.Gate === 'G1');
        const g2 = gates.find((g) => g.Gate === 'G2');
        const g3 = gates.find((g) => g.Gate === 'G3');
        const g4 = gates.find((g) => g.Gate === 'G4');

        if (
            g1?.Status !== 'Passed' ||
            g2?.Status !== 'Passed' ||
            g3?.Status !== 'Passed' ||
            g4?.Status !== 'Pending' ||
            g4?.Notes !== 'AwaitingApproval'
        ) {
            return null;
        }

        const pausedGates = gates.map((g): GateRecord =>
            g.Gate === 'G4' ? { ...g, Status: 'Blocked', Notes: 'AwaitingApproval' } : g,
        );
        spec.Review!.Gates = pausedGates;
        spec.Status = DeriveStatus(spec, pausedGates);
        this.restoreInlineVideoBase64(spec);
        return {
            step: 'Plan' as BaseAgentNextStep<P>['step'],
            terminate: false,
            planDetails: {
                plan: this.describeRoughCutForApproval(spec),
            },
            message:
                "Rough cut ready for approval. Reply starting with 'Approve' to deliver, or say what to change.",
            previousPayload: currentPayload,
            newPayload: spec as unknown as P,
        };
    }

    private buildNonPassingGatesRetry<P>(
        baseResult: BaseAgentNextStep<P>,
        spec: Partial<VideoGenerationSpec>,
        gates: ReadonlyArray<GateRecord>,
        nonPassing: ReadonlyArray<GateRecord>,
        currentPayload: P,
    ): BaseAgentNextStep<P> {
        spec.Status = DeriveStatus(spec, gates);
        const primary =
            nonPassing.find((g) => g.Status === 'Failed' || g.Status === 'Blocked') ??
            nonPassing[0];
        const summary = nonPassing
            .map((g) => `${g.Gate} (${g.Status}): ${g.Notes ?? 'requirements not met'}`)
            .join('; ');
        const msg = `Cannot deliver Video Studio production because gate ${primary.Gate} has not passed (${primary.Notes ?? primary.Status}). Non-passing gates: ${summary}`;
        return {
            ...baseResult,
            step: 'Retry',
            retryInstructions: msg,
            errorMessage: msg,
            previousPayload: currentPayload,
            newPayload: spec as unknown as P,
        };
    }

    private finalizeDeliveredStep<P>(
        baseResult: BaseAgentNextStep<P>,
        spec: Partial<VideoGenerationSpec>,
        currentPayload: P,
    ): BaseAgentNextStep<P> {
        spec.Status = 'Delivered';
        this.restoreInlineVideoBase64(spec);
        if (spec.Review) {
            spec.Review.HumanReviewNotes = ComposeHumanReviewNotes(spec);
        }
        this.clearEphemeralOutputFileIds(spec);
        const provenance = BuildGenerationProvenanceSummary(spec);
        if (spec.Output) {
            if (provenance !== undefined) {
                spec.Output.GenerationProvenance = provenance;
            } else {
                delete spec.Output.GenerationProvenance;
            }
        }

        const isSubAgentRun = this.AgentHierarchy.length > 1;
        if (isSubAgentRun) {
            this.populateSubAgentFileOutputs(spec);
        }
        const artifactDirective = this.buildDeliveryArtifactDirective<P>(spec, isSubAgentRun);

        return {
            ...baseResult,
            step: 'Success',
            previousPayload: currentPayload,
            newPayload: spec as unknown as P,
            ...(artifactDirective ? { artifactDirective } : {}),
        };
    }

    private populateSubAgentFileOutputs(spec: Partial<VideoGenerationSpec>): void {
        const videos = spec.Output?.Videos ?? {};
        for (const [fmt, entry] of Object.entries(videos)) {
            if (entry?.FileID && !this.FileOutputs.some((f) => f.fileId === entry.FileID)) {
                this.FileOutputs.push({
                    fileName: `video-${fmt.replace(':', 'x')}.mp4`,
                    mimeType: entry.MimeType ?? 'video/mp4',
                    fileId: entry.FileID,
                    sizeBytes: entry.FileSizeBytes,
                    visibility: 'System Only',
                });
            }
        }
    }

    private buildDeliveryArtifactDirective<P>(
        spec: Partial<VideoGenerationSpec>,
        isSubAgentRun: boolean,
    ): BaseAgentNextStep<P>['artifactDirective'] {
        if (isSubAgentRun) {
            return undefined;
        }
        if (this._startedWithBrief) {
            return { behavior: 'version-source' };
        }
        const archetypeName = spec.Archetype?.Name?.trim() || 'Video Production';
        const oneSentence = spec.Film?.OneSentence ?? '';
        return {
            behavior: 'create-new',
            name: `${archetypeName}: ${oneSentence}`.slice(0, 120),
            description: spec.Film?.Purpose,
        };
    }

    private stripInlineVideoBase64(spec: Partial<VideoGenerationSpec>): void {
        const videos = spec.Output?.Videos;
        if (!videos || typeof videos !== 'object') {
            return;
        }
        for (const [fmt, video] of Object.entries(videos)) {
            if (
                video &&
                typeof video.InlineBase64 === 'string' &&
                video.InlineBase64.trim().length > 0 &&
                video.InlineBase64 !== INLINE_VIDEO_BASE64_SENTINEL
            ) {
                this._inlineVideoBase64ByFormat[fmt as VideoFormat] = video.InlineBase64;
                video.InlineBase64 = INLINE_VIDEO_BASE64_SENTINEL;
            }
        }
    }

    private restoreInlineVideoBase64(spec: Partial<VideoGenerationSpec>): void {
        const videos = spec.Output?.Videos;
        if (!videos || typeof videos !== 'object') {
            return;
        }
        for (const [fmt, video] of Object.entries(videos)) {
            if (video && video.InlineBase64 === INLINE_VIDEO_BASE64_SENTINEL) {
                const raw = this._inlineVideoBase64ByFormat[fmt as VideoFormat];
                if (raw) {
                    video.InlineBase64 = raw;
                }
            }
        }
    }

    private clearEphemeralOutputFileIds(spec: Partial<VideoGenerationSpec>): void {
        const output = spec.Output;
        if (!output || typeof output !== 'object') {
            return;
        }
        if (
            typeof output.PosterFileID === 'string' &&
            output.PosterFileID.trim().startsWith(INLINE_EPHEMERAL_FILE_PREFIX)
        ) {
            delete output.PosterFileID;
        }
        if (output.ContactSheetFileIDs && typeof output.ContactSheetFileIDs === 'object') {
            const sheetMap = output.ContactSheetFileIDs as Partial<Record<VideoFormat, string[]>>;
            for (const [fmt, ids] of Object.entries(sheetMap)) {
                if (!Array.isArray(ids)) {
                    continue;
                }
                const persistedIds = ids.filter(
                    (id) =>
                        typeof id === 'string' &&
                        id.trim().length > 0 &&
                        !id.trim().startsWith(INLINE_EPHEMERAL_FILE_PREFIX),
                );
                if (persistedIds.length > 0) {
                    sheetMap[fmt as VideoFormat] = persistedIds;
                } else {
                    delete sheetMap[fmt as VideoFormat];
                }
            }
            if (Object.keys(sheetMap).length === 0) {
                delete output.ContactSheetFileIDs;
            }
        }
    }

    private async warmEngines(params: ExecuteAgentParams): Promise<void> {
        await VideoStudioEngine.Instance.Config(false, params.contextUser, this.ProviderToUse);
        await BrandKitEngine.Instance.Config(false, params.contextUser, this.ProviderToUse);
    }

    private buildSeededPayload(
        params: ExecuteAgentParams,
        settings: VideoStudioSettings,
    ): Partial<VideoGenerationSpec> {
        this._inlineVideoBase64ByFormat = {};
        this.captureCallerMode(params);
        const seeded = structuredClone((params.payload ?? {}) as Partial<VideoGenerationSpec>);
        this.stripInlineVideoBase64(seeded);
        this._startedWithBrief = Boolean(seeded.Film?.OneSentence?.trim());

        seeded.SpecVersion = VIDEO_STUDIO_SPEC_VERSION;
        seeded.Status = 'Briefing';

        seeded.Review = {
            Gates: Array.isArray(seeded.Review?.Gates) ? [...seeded.Review.Gates] : [],
            Rounds: Array.isArray(seeded.Review?.Rounds) ? [...seeded.Review.Rounds] : [],
            ...(seeded.Review?.Scores ? { Scores: seeded.Review.Scores } : {}),
            ...(seeded.Review?.HumanReviewNotes !== undefined
                ? { HumanReviewNotes: seeded.Review.HumanReviewNotes }
                : {}),
        };

        this._initialRoundCount = seeded.Review.Rounds.length;

        seeded.Assets = {
            Approved: Array.isArray(seeded.Assets?.Approved) ? [...seeded.Assets.Approved] : [],
            Required: Array.isArray(seeded.Assets?.Required) ? [...seeded.Assets.Required] : [],
            NeverInvent: Array.isArray(seeded.Assets?.NeverInvent) ? [...seeded.Assets.NeverInvent] : [],
            ...(seeded.Assets?.Generate !== undefined ? { Generate: seeded.Assets.Generate } : {}),
        };

        seeded.Render = {
            Renderer: 'HyperFrames',
            Fps:
                typeof seeded.Render?.Fps === 'number' && seeded.Render.Fps > 0
                    ? seeded.Render.Fps
                    : settings.Fps,
            Quality: seeded.Render?.Quality ?? settings.RenderQuality,
            Seed: typeof seeded.Render?.Seed === 'number' ? seeded.Render.Seed : 1,
            RendererVersion: seeded.Render?.RendererVersion ?? '',
        };

        const companyId = this.resolveCompanyId(params, seeded);
        if (companyId && !seeded.CompanyID) {
            seeded.CompanyID = companyId;
        }

        this.seedAudioPreferencesFromContext(params, seeded);
        this.seedBrandKit(seeded, companyId);
        this.restoreCallerInteraction(seeded);
        this.syncDeliverableFormats(seeded);
        this.applyApprovalResume(params, seeded);

        return seeded;
    }

    private seedAudioPreferencesFromContext(
        params: ExecuteAgentParams,
        seeded: Partial<VideoGenerationSpec>,
    ): void {
        const dataObj = params.data as Record<string, unknown> | undefined;
        const appCtx =
            (dataObj?.AppContext as Record<string, unknown> | undefined) ??
            (dataObj?.appContext as Record<string, unknown> | undefined) ??
            dataObj;
        const vsCtx = (appCtx?.VideoStudio as Record<string, unknown> | undefined) ?? appCtx;
        if (!vsCtx || typeof vsCtx !== 'object') {
            return;
        }

        const rawNarrationEnabled = vsCtx.NarrationEnabled;
        const rawCaptionsMode = vsCtx.CaptionsMode;

        if (typeof rawNarrationEnabled === 'boolean') {
            if (!seeded.Audio) {
                seeded.Audio = {
                    Cues: [],
                    Captions: rawNarrationEnabled ? 'Burned' : 'None',
                };
            }
            if (!seeded.Audio.Narration) {
                seeded.Audio.Narration = {
                    Enabled: rawNarrationEnabled,
                    VoiceID: '',
                    Provider: '',
                    Script: [],
                };
            } else if (seeded.Audio.Narration.Enabled === undefined) {
                seeded.Audio.Narration.Enabled = rawNarrationEnabled;
            }
            if (!rawNarrationEnabled) {
                seeded.Audio.Narration.Script = [];
                if (rawCaptionsMode === undefined) {
                    seeded.Audio.Captions = 'None';
                }
            }
        }

        if (
            rawCaptionsMode === 'None' ||
            rawCaptionsMode === 'Burned' ||
            rawCaptionsMode === 'Sidecar'
        ) {
            if (!seeded.Audio) {
                seeded.Audio = { Cues: [], Captions: rawCaptionsMode };
            } else {
                seeded.Audio.Captions = rawCaptionsMode;
            }
        }
    }

    private resolveCompanyId(
        params: ExecuteAgentParams,
        spec: Partial<VideoGenerationSpec>,
    ): string | null {
        const fromSpec = typeof spec.CompanyID === 'string' && spec.CompanyID.trim() ? spec.CompanyID.trim() : null;
        if (fromSpec) {
            return fromSpec;
        }
        if (typeof params.companyId === 'string' && params.companyId.trim()) {
            return params.companyId.trim();
        }
        const dataObj = params.data as Record<string, unknown> | undefined;
        if (typeof dataObj?.CompanyID === 'string' && dataObj.CompanyID.trim()) {
            return dataObj.CompanyID.trim();
        }
        if (typeof dataObj?.companyId === 'string' && dataObj.companyId.trim()) {
            return dataObj.companyId.trim();
        }
        return null;
    }

    private seedBrandKit(
        seeded: Partial<VideoGenerationSpec>,
        companyId: string | null,
    ): void {
        const kit = this.resolveBrandKitForSpec(seeded, companyId);
        if (!kit) {
            return;
        }
        if (!seeded.BrandKitID) {
            seeded.BrandKitID = kit.ID;
        }
        this._brandKitInScope =
            !kit.CompanyID || Boolean(companyId && UUIDsEqual(kit.CompanyID, companyId));

        this.seedBrandKitAssets(seeded, kit);
        this.seedBrandKitNeverInvent(seeded, kit);
        this.seedBrandKitVoiceDefaults(seeded, kit);
    }

    private resolveBrandKitForSpec(
        seeded: Partial<VideoGenerationSpec>,
        companyId: string | null,
    ): MJBrandKitEntity | null {
        this._brandKitInScope = true;
        const engine = BrandKitEngine.Instance;
        if (seeded.BrandKitID?.trim()) {
            const allKits = Array.isArray(engine.BrandKits) ? engine.BrandKits : [];
            const kit = allKits.find((k) => UUIDsEqual(k.ID, seeded.BrandKitID)) ?? null;
            if (!kit) {
                this._brandKitInScope = false;
            }
            return kit;
        }
        return engine.GetDefaultKit(companyId) ?? null;
    }

    private seedBrandKitAssets(
        seeded: Partial<VideoGenerationSpec>,
        kit: MJBrandKitEntity,
    ): void {
        const kitAssets = BrandKitEngine.Instance.GetAssets(kit.ID) ?? [];
        const approvedList = seeded.Assets!.Approved;
        const existingFileIds = new UUIDSet(
            approvedList.map((a) => a.FileID).filter((id): id is string => Boolean(id)),
        );
        for (const asset of kitAssets) {
            if (!asset || !asset.FileID || existingFileIds.Has(asset.FileID)) {
                continue;
            }
            const baseKey = `brand:${(asset.Name ?? 'asset').trim()}`;
            let uniqueKey = baseKey;
            let suffix = 2;
            while (approvedList.some((a) => a.Key === uniqueKey)) {
                uniqueKey = `${baseKey}:${suffix}`;
                suffix++;
            }
            approvedList.push({
                Key: uniqueKey,
                Kind: (asset.AssetType ?? 'Other') as VideoAssetKind,
                FileID: asset.FileID,
                Source: kit.Name || 'BrandKit',
                Provenance: 'BrandKit',
                Usage: asset.Usage ?? '',
                MustUse: false,
            });
            existingFileIds.Add(asset.FileID);
        }
    }

    private seedBrandKitNeverInvent(
        seeded: Partial<VideoGenerationSpec>,
        kit: MJBrandKitEntity,
    ): void {
        const kitNeverInvent = kit.NeverInventObject;
        if (!Array.isArray(kitNeverInvent)) {
            return;
        }
        const existingSet = new Set(seeded.Assets!.NeverInvent);
        for (const item of kitNeverInvent) {
            if (typeof item === 'string' && item.trim() && !existingSet.has(item.trim())) {
                seeded.Assets!.NeverInvent.push(item.trim());
                existingSet.add(item.trim());
            }
        }
    }

    private seedBrandKitVoiceDefaults(
        seeded: Partial<VideoGenerationSpec>,
        kit: MJBrandKitEntity,
    ): void {
        if (seeded.Audio?.Narration?.Enabled === false) {
            return;
        }
        const voiceObj = kit.VoiceObject;
        if (!voiceObj || typeof voiceObj !== 'object') {
            return;
        }
        const defaultVoiceId = (voiceObj.VoiceID ?? '').trim();
        const defaultProvider = (voiceObj.Provider ?? '').trim();
        if (!defaultVoiceId && !defaultProvider) {
            return;
        }
        if (!seeded.Audio) {
            seeded.Audio = { Cues: [], Captions: 'None' };
        }
        if (!seeded.Audio.Narration) {
            seeded.Audio.Narration = {
                VoiceID: defaultVoiceId,
                Provider: defaultProvider,
                Script: [],
            };
            return;
        }
        if (!seeded.Audio.Narration.VoiceID?.trim() && defaultVoiceId) {
            seeded.Audio.Narration.VoiceID = defaultVoiceId;
        }
        if (!seeded.Audio.Narration.Provider?.trim() && defaultProvider) {
            seeded.Audio.Narration.Provider = defaultProvider;
        }
    }

    private async intakeConversationAttachments(
        params: ExecuteAgentParams,
        seeded: Partial<VideoGenerationSpec>,
    ): Promise<void> {
        const conversationId =
            typeof params.conversationId === 'string' ? params.conversationId.trim() : '';
        if (!conversationId) {
            return;
        }

        try {
            const rows = await this.fetchConversationAttachmentRows(conversationId, params.contextUser);
            if (rows.length === 0) {
                return;
            }
            if (!seeded.Assets) {
                seeded.Assets = { Approved: [], Required: [], NeverInvent: [] };
            }
            const dedupeSets = this.buildAttachmentDedupeSets(seeded.Assets.Approved);
            for (const row of rows) {
                await this.intakeSingleAttachmentRow(row, params, seeded.Assets.Approved, dedupeSets);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(
                `VideoStudioAgent: unexpected error during conversation attachment intake: ${msg}`,
            );
        }
    }

    private async fetchConversationAttachmentRows(
        conversationId: string,
        contextUser?: UserInfo,
    ): Promise<ConversationAttachmentRow[]> {
        const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
        const escapedId = EscapeSQLString(conversationId);
        const res = await rv.RunView<ConversationAttachmentRow>(
            {
                EntityName: 'MJ: Conversation Detail Attachments',
                ExtraFilter: `ConversationDetailID IN (SELECT ID FROM __mj.vwConversationDetails WHERE ConversationID = '${escapedId}') AND (MimeType LIKE 'image/%' OR MimeType LIKE 'video/%')`,
                Fields: ['ID', 'MimeType', 'FileName', 'FileID', 'InlineData', 'ArtifactVersionID'],
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!res?.Success || !Array.isArray(res.Results)) {
            if (res && !res.Success) {
                LogError(
                    `VideoStudioAgent: failed to query conversation attachments for conversation "${conversationId}": ${res.ErrorMessage ?? 'Unknown error'}`,
                );
            }
            return [];
        }
        return res.Results;
    }

    private buildAttachmentDedupeSets(
        approvedList: VideoGenerationSpec['Assets']['Approved'],
    ): AttachmentDedupeSets {
        return {
            ExistingFileIds: new UUIDSet(
                approvedList.map((a) => a.FileID).filter((id): id is string => Boolean(id)),
            ),
            ExistingArtifactVersionIds: new UUIDSet(
                approvedList
                    .map((a) => a.ArtifactVersionID)
                    .filter((id): id is string => Boolean(id)),
            ),
            ExistingSources: new Set(
                approvedList
                    .map((a) => a.Source?.trim().toLowerCase())
                    .filter((s): s is string => Boolean(s)),
            ),
        };
    }

    private async intakeSingleAttachmentRow(
        row: ConversationAttachmentRow,
        params: ExecuteAgentParams,
        approvedList: VideoGenerationSpec['Assets']['Approved'],
        dedupeSets: AttachmentDedupeSets,
    ): Promise<void> {
        const rowId = row?.ID?.trim();
        if (!row || !rowId) {
            return;
        }
        try {
            const attachmentSource = `Conversation attachment ${rowId}`;
            let fileId = row.FileID?.trim() || undefined;
            const artifactVersionId = row.ArtifactVersionID?.trim() || undefined;

            if (
                (fileId && dedupeSets.ExistingFileIds.Has(fileId)) ||
                (artifactVersionId && dedupeSets.ExistingArtifactVersionIds.Has(artifactVersionId)) ||
                dedupeSets.ExistingSources.has(attachmentSource.toLowerCase())
            ) {
                return;
            }

            if (!fileId && !artifactVersionId) {
                fileId = await this.storeInlineAttachmentRow(row, rowId, params.contextUser);
                if (!fileId || dedupeSets.ExistingFileIds.Has(fileId)) {
                    return;
                }
            }

            const kind: VideoAssetKind = (row.MimeType ?? '').toLowerCase().startsWith('video/')
                ? 'Video'
                : 'Image';
            const uniqueKey = this.buildUniqueAttachmentKey(approvedList, row.FileName?.trim() || rowId);

            approvedList.push({
                Key: uniqueKey,
                Kind: kind,
                ...(fileId ? { FileID: fileId } : {}),
                ...(artifactVersionId ? { ArtifactVersionID: artifactVersionId } : {}),
                Source: attachmentSource,
                Provenance: 'Supplied',
                Usage: 'User-supplied reference',
                MustUse: false,
            });

            if (fileId) {
                dedupeSets.ExistingFileIds.Add(fileId);
            }
            if (artifactVersionId) {
                dedupeSets.ExistingArtifactVersionIds.Add(artifactVersionId);
            }
            dedupeSets.ExistingSources.add(attachmentSource.toLowerCase());
        } catch (rowErr) {
            const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
            LogError(`VideoStudioAgent: failed to intake conversation attachment "${rowId}": ${msg}`);
        }
    }

    private async storeInlineAttachmentRow(
        row: ConversationAttachmentRow,
        rowId: string,
        contextUser?: UserInfo,
    ): Promise<string | undefined> {
        const rawInline = row.InlineData?.trim() ?? '';
        if (!rawInline) {
            return undefined;
        }
        const base64Payload = rawInline.includes(',')
            ? rawInline.slice(rawInline.indexOf(',') + 1)
            : rawInline;
        const storedFileId = await StoreFile({
            Content: Buffer.from(base64Payload, 'base64'),
            FileName: row.FileName?.trim() || rowId,
            MimeType: row.MimeType?.trim() || 'image/png',
            Description: 'Conversation attachment',
            ContextUser: contextUser,
            Provider: this.ProviderToUse,
        });
        if (!storedFileId) {
            LogError(
                `VideoStudioAgent: StoreFile returned no FileID for inline conversation attachment "${rowId}".`,
            );
            return undefined;
        }
        return storedFileId;
    }

    private buildUniqueAttachmentKey(
        approvedList: ReadonlyArray<{ Key: string }>,
        nameOrId: string,
    ): string {
        const baseKey = `attachment:${nameOrId}`;
        let uniqueKey = baseKey;
        let suffix = 2;
        while (approvedList.some((a) => a.Key === uniqueKey)) {
            uniqueKey = `${baseKey}:${suffix}`;
            suffix++;
        }
        return uniqueKey;
    }

    private captureCallerMode(params: ExecuteAgentParams): void {
        const callerInteraction = (params?.payload as Partial<VideoGenerationSpec> | undefined)
            ?.Interaction;
        const rawCallerMode = callerInteraction?.Mode;
        const isBelowRoot =
            Boolean(params?.parentRun) ||
            this.AgentHierarchy.length > 1;

        if (isValidInteractionMode(rawCallerMode)) {
            this._callerPayloadMode = rawCallerMode;
            this._callerMode = rawCallerMode;
        } else if (params?.planMode === true) {
            this._callerPayloadMode = null;
            this._callerMode = 'ApproveStoryboard';
        } else if (isBelowRoot) {
            this._callerPayloadMode = null;
            this._callerMode = 'Autonomous';
        } else {
            this._callerPayloadMode = null;
            this._callerMode = null;
        }
    }

    private restoreCallerInteraction(spec: Partial<VideoGenerationSpec>): void {
        if (this._callerPayloadMode) {
            spec.Interaction = {
                Mode: this._callerPayloadMode,
                MaxRepairRounds: this._currentSettings.MaxRepairRounds,
            };
        } else {
            delete spec.Interaction;
        }
    }

    private resolveEffectiveInteractionMode(
        spec: Partial<VideoGenerationSpec>,
    ): VideoInteractionMode {
        if (this._callerMode) {
            return this._callerMode;
        }
        return (
            this.lookupArchetypeDefaultMode(spec.Archetype?.Name, spec.CompanyID ?? null) ??
            'Autonomous'
        );
    }

    private lookupArchetypeDefaultMode(
        archetypeName: string | undefined | null,
        companyId: string | null,
    ): VideoInteractionMode | null {
        if (!archetypeName?.trim()) {
            return null;
        }
        const archetype = VideoStudioEngine.Instance.GetArchetypeByName(
            archetypeName.trim(),
            companyId,
        );
        const mode = archetype?.DefaultInteractionMode;
        if (isValidInteractionMode(mode)) {
            return mode;
        }
        return null;
    }

    private applyApprovalResume(
        params: ExecuteAgentParams,
        seeded: Partial<VideoGenerationSpec>,
    ): void {
        const gates = seeded.Review?.Gates;
        if (!Array.isArray(gates) || gates.length === 0) {
            return;
        }

        const awaitingGate = gates.find(
            (g) => (g?.Gate === 'G2' || g?.Gate === 'G4') && g.Notes === 'AwaitingApproval',
        );
        if (!awaitingGate) {
            return;
        }

        const messages = Array.isArray(params.conversationMessages)
            ? params.conversationMessages
            : [];
        let lastUserContent: string | null = null;
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg?.role === 'user') {
                lastUserContent =
                    typeof msg.content === 'string'
                        ? msg.content
                        : JSON.stringify(msg.content ?? '');
                break;
            }
        }

        const decision = ReadApprovalDecision(lastUserContent);
        if (decision === 'Approve') {
            awaitingGate.Status = 'Passed';
            awaitingGate.Notes = 'Approved';
            awaitingGate.EvidenceRefs = [`approval:${params.lastRunId ?? 'conversation'}`];
            awaitingGate.Timestamp = new Date().toISOString();
        } else if (decision === 'Reject') {
            awaitingGate.Status = 'Pending';
            delete awaitingGate.Notes;
        }
    }

    private syncArchetypeId(spec: Partial<VideoGenerationSpec>): void {
        const archetypeName = spec.Archetype?.Name?.trim();
        if (!archetypeName || spec.Archetype?.ArchetypeID?.trim()) {
            return;
        }
        const matched = VideoStudioEngine.Instance.GetArchetypeByName(
            archetypeName,
            spec.CompanyID ?? null,
        );
        if (matched?.ID) {
            spec.Archetype!.ArchetypeID = matched.ID;
        }
    }

    private syncDeliverableFormats(spec: Partial<VideoGenerationSpec>): void {
        const filmFormats = Array.isArray(spec.Film?.Formats) ? spec.Film.Formats : [];
        if (filmFormats.length === 0) {
            return;
        }
        const targetFormats: VideoFormat[] =
            this._currentSettings.Formats === 'First' ? [filmFormats[0]] : [...filmFormats];

        if (!spec.Deliverables) {
            spec.Deliverables = {
                Formats: targetFormats,
                Poster: true,
                ContactSheets: true,
                Source: true,
                Captions: true,
            };
        } else {
            if (
                this._currentSettings.Formats === 'First' ||
                !Array.isArray(spec.Deliverables.Formats) ||
                spec.Deliverables.Formats.length === 0
            ) {
                spec.Deliverables.Formats = targetFormats;
            }
            if (spec.Deliverables.Poster === undefined) {
                spec.Deliverables.Poster = true;
            }
            if (spec.Deliverables.ContactSheets === undefined) {
                spec.Deliverables.ContactSheets = true;
            }
            if (spec.Deliverables.Source === undefined) {
                spec.Deliverables.Source = true;
            }
            if (spec.Deliverables.Captions === undefined) {
                spec.Deliverables.Captions = true;
            }
        }
    }

    private buildNormalizedSpecForValidation(
        spec: Partial<VideoGenerationSpec>,
        stage: VideoGenerationSpec['Status'],
        effectiveMode: VideoInteractionMode = 'Autonomous',
    ): VideoGenerationSpec {
        const cloned = structuredClone(spec) as VideoGenerationSpec;
        cloned.Status = stage;
        cloned.Interaction = {
            Mode: effectiveMode,
            MaxRepairRounds: this._currentSettings.MaxRepairRounds,
        };
        if (cloned.Render && cloned.Render.Renderer === 'HyperFrames' && !cloned.Render.RendererVersion?.trim()) {
            cloned.Render.RendererVersion = '0.0.0';
        }
        return cloned;
    }

    private buildStageTemplateParameters(
        normalizedStage: string,
        spec: Partial<VideoGenerationSpec>,
    ): Record<string, string> {
        const companyId = spec.CompanyID ?? null;

        if (normalizedStage === 'Director') {
            return {
                archetypeCatalog: this.formatArchetypeCatalog(companyId),
            };
        }

        if (normalizedStage === 'Art Director') {
            return {
                brandKitStyle: this.formatBrandKitStyle(spec.BrandKitID ?? null, companyId),
            };
        }

        if (normalizedStage === 'Storyboard') {
            return {
                archetypeGuidance: this.formatArchetypeGuidance(spec.Archetype?.Name ?? null, companyId),
            };
        }

        if (normalizedStage === 'Motion Engineer') {
            const repairBrief = BuildRepairBrief(spec);
            if (repairBrief.length > 0) {
                return {
                    repairBrief,
                };
            }
            return {};
        }

        return {};
    }

    private formatArchetypeCatalog(companyId: string | null): string {
        const archetypes: MJVideoArchetypeEntity[] =
            VideoStudioEngine.Instance.GetArchetypesForCompany(companyId) ?? [];
        if (archetypes.length === 0) {
            return 'No active video archetypes found in catalog.';
        }
        return archetypes
            .map((a) => {
                const min = a.MinDurationSeconds;
                const max = a.MaxDurationSeconds;
                const range =
                    typeof min === 'number' && typeof max === 'number'
                        ? `${min}s–${max}s`
                        : typeof min === 'number'
                          ? `${min}s+`
                          : typeof max === 'number'
                            ? `up to ${max}s`
                            : 'flexible duration';
                return `- **${a.Name}** (${a.Category ?? 'General'}, ${range}): ${a.Description ?? ''}`;
            })
            .join('\n');
    }

    private formatBrandKitStyle(brandKitId: string | null, companyId: string | null): string {
        const engine = BrandKitEngine.Instance;
        let kit: MJBrandKitEntity | null = null;
        if (brandKitId) {
            kit = (engine.BrandKits ?? []).find((k) => UUIDsEqual(k.ID, brandKitId)) ?? null;
        }
        if (!kit) {
            kit = engine.GetDefaultKit(companyId) ?? null;
        }
        if (!kit) {
            return 'No Brand Kit configured for this production.';
        }
        const sections: string[] = [`### Brand Kit: ${kit.Name}`];
        if (kit.StyleObject) {
            sections.push('#### Style', '```json', JSON.stringify(kit.StyleObject, null, 2), '```');
        }
        if (kit.VoiceObject) {
            sections.push('#### Voice', '```json', JSON.stringify(kit.VoiceObject, null, 2), '```');
        }
        if (kit.GenerationPolicyObject) {
            sections.push(
                '#### GenerationPolicy',
                '```json',
                JSON.stringify(kit.GenerationPolicyObject, null, 2),
                '```',
            );
        }
        return sections.join('\n');
    }

    private formatArchetypeGuidance(
        archetypeName: string | null,
        companyId: string | null,
    ): string {
        if (!archetypeName?.trim()) {
            return 'No archetype selected.';
        }
        const archetype = VideoStudioEngine.Instance.GetArchetypeByName(
            archetypeName.trim(),
            companyId,
        );
        if (!archetype) {
            return `Archetype "${archetypeName}" not found in catalog.`;
        }
        const sections: string[] = [`### Archetype: ${archetype.Name}`];
        if (archetype.BeatTemplateObject) {
            sections.push(
                '#### BeatTemplate',
                '```json',
                JSON.stringify(archetype.BeatTemplateObject, null, 2),
                '```',
            );
        }
        if (archetype.PacingObject) {
            sections.push(
                '#### Pacing',
                '```json',
                JSON.stringify(archetype.PacingObject, null, 2),
                '```',
            );
        }
        if (archetype.Guidance) {
            sections.push('#### Guidance', archetype.Guidance);
        }
        return sections.join('\n');
    }

    private describeRoughCutForApproval(spec: Partial<VideoGenerationSpec>): string {
        const formats = Object.keys(spec.Output?.Videos ?? {});
        const rounds = spec.Review?.Rounds ?? [];
        const latestRound = rounds[rounds.length - 1];
        const lines: string[] = [
            '## Rough Cut Review',
            '',
            `- **Film:** ${spec.Film?.OneSentence ?? '(not specified)'}`,
            `- **Rendered Formats:** ${formats.join(', ') || 'none'}`,
            `- **Latest Critic Summary:** ${latestRound?.Summary ?? 'Clean pass.'}`,
        ];
        return lines.join('\n');
    }
}

/**
 * Tree-shaking guard to ensure `VideoStudioAgent` is registered with `MJGlobal`.
 */
export function LoadVideoStudioAgent(): void {
    if (false as boolean) {
        const _keep: unknown = VideoStudioAgent;
    }
}
