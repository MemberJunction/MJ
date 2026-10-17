import { BaseAgent } from '@memberjunction/ai-agents';
import {
    type AgentConfiguration,
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
    ReadApprovalDecision,
    RequestRegeneration,
} from '../gates.js';
import { BuildRepairBrief } from '../review/critic-input.js';
import { ComposeHumanReviewNotes } from '../review/human-review-notes.js';
import {
    DEFAULT_VIDEO_STUDIO_SETTINGS,
    ResolveVideoStudioSettings,
    type VideoStudioSettings,
} from '../settings.js';
import { StoreFile } from '../storage.js';
import { ValidateVideoGenerationSpecAsync } from '../validate-spec-async.js';

/**
 * Ordered stage sub-agent names under the root `Video Studio` agent.
 */
export const VIDEO_STUDIO_STAGES = [
    'Video Studio - Director',
    'Video Studio - Art Director',
    'Video Studio - Storyboard',
    'Video Studio - Pre-Production',
    'Video Studio - Motion Engineer',
    'Video Studio - Render',
    'Video Studio - Critic',
] as const;

export type VideoStudioStageName = (typeof VIDEO_STUDIO_STAGES)[number];

const STAGE_PROGRESS_PERCENTAGE: Readonly<Record<string, number>> = {
    'Video Studio - Director': 15,
    'Video Studio - Art Director': 30,
    'Video Studio - Storyboard': 45,
    'Video Studio - Pre-Production': 60,
    'Video Studio - Motion Engineer': 75,
    'Video Studio - Render': 90,
    'Video Studio - Critic': 95,
};

function cloneSpec<T>(value: T): T {
    if (value === undefined || value === null) {
        return {} as T;
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

function isValidInteractionMode(value: unknown): value is VideoInteractionMode {
    return (
        typeof value === 'string' &&
        (VIDEO_INTERACTION_MODES as readonly string[]).includes(value)
    );
}

function resolveCanonicalStage(name: string | undefined | null): VideoStudioStageName | null {
    if (!name) {
        return null;
    }
    const trimmed = name.trim();
    const lower = trimmed.toLowerCase();
    const strippedLower = trimmed.replace(/^video\s+studio\s*-\s*/i, '').trim().toLowerCase();
    for (const stage of VIDEO_STUDIO_STAGES) {
        if (lower === stage.toLowerCase()) {
            return stage;
        }
        const suffixLower = stage.replace('Video Studio - ', '').toLowerCase();
        if (strippedLower === suffixLower && /^video\s+studio\s*-\s*/i.test(trimmed)) {
            return stage;
        }
    }
    return null;
}

function isVideoStudioStageName(name: string | undefined | null): boolean {
    if (!name) {
        return false;
    }
    return resolveCanonicalStage(name) !== null || /^video\s+studio\s*-\s*/i.test(name.trim());
}

function normalizeStageKey(stageName: string): string {
    const canonical = resolveCanonicalStage(stageName);
    if (canonical) {
        return canonical.replace('Video Studio - ', '');
    }
    return (stageName ?? '')
        .trim()
        .replace(/^video\s+studio\s*-\s*/i, '')
        .trim();
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

        if (hasCycle) {
            const lastEntry = this.AgentHierarchy[this.AgentHierarchy.length - 1];
            const chainEntries =
                lastEntry && lastEntry.trim().toLowerCase() === normalizedSelf
                    ? [...this.AgentHierarchy]
                    : [...this.AgentHierarchy, agentName];
            const chain = chainEntries.join(' → ');
            const errorMessage = `${agentName} is already running higher in this call chain (${chain}). A production cannot start another production.`;

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

        return null;
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

    protected override async executeAgentInternal<P = any>(
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

        return super.executeAgentInternal(nextParams, config);
    }

    protected override async executeNextStep<P = any>(
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
            const canonicalStage = resolveCanonicalStage(stageName);
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
        const canonicalStage = resolveCanonicalStage(stageName) ?? stageName.trim();
        const cloned = cloneSpec(payload ?? {});

        this.syncDeliverableFormats(cloned);
        this.restoreCallerInteraction(cloned);

        if (stageSucceeded) {
            ClearStaleEvidence(canonicalStage, cloned);
        }

        const effectiveMode = this.resolveEffectiveInteractionMode(cloned);
        const gates = EvaluateGates(cloned, {
            Settings: this._currentSettings,
            BrandKitInScope: this._brandKitInScope,
            EffectiveInteractionMode: effectiveMode,
            InitialRoundCount: this._initialRoundCount,
        });
        cloned.Review = {
            ...(cloned.Review ?? { Rounds: [] }),
            Gates: gates,
            Rounds: Array.isArray(cloned.Review?.Rounds) ? cloned.Review.Rounds : [],
        };

        if (stageSucceeded && canonicalStage === 'Video Studio - Critic') {
            const rounds = cloned.Review.Rounds;
            const newestRound = rounds.length > 0 ? rounds[rounds.length - 1] : undefined;
            if (newestRound && Array.isArray(newestRound.Defects)) {
                const handledKeys = new Set<string>();
                for (const defect of newestRound.Defects) {
                    const assetKey = defect?.AssetKey?.trim();
                    if (defect && defect.Status === 'Open' && assetKey && !handledKeys.has(assetKey)) {
                        const isGenerated = (cloned.Assets?.Approved ?? []).some(
                            (a) => a?.Key === assetKey && a.Provenance === 'Generated',
                        );
                        if (isGenerated) {
                            handledKeys.add(assetKey);
                            const regen = RequestRegeneration(
                                cloned,
                                assetKey,
                                this._currentSettings.MaxRegenerations,
                            );
                            if (regen.Allowed && regen.Spec.Assets) {
                                cloned.Assets = regen.Spec.Assets;
                            }
                        }
                    }
                }
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
                cloned.Review.HumanReviewNotes = ComposeHumanReviewNotes(cloned);
            }
        }

        cloned.Status = DeriveStatus(cloned, gates);

        const progressText = DescribeStageProgress(canonicalStage, cloned);
        const formattedMessage = this.formatHierarchicalMessage(progressText);
        try {
            params.onProgress?.({
                step: 'subagent_execution',
                message: formattedMessage,
                percentage: STAGE_PROGRESS_PERCENTAGE[canonicalStage] ?? 50,
                metadata: {
                    VideoStudioStatus: cloned.Status,
                    Gates: gates,
                },
                displayMode: 'live',
            });
        } catch {
            // Swallow progress callback errors so a UI listener cannot abort the production loop
        }

        return cloned;
    }

    protected override async validateNextStep<P>(
        params: ExecuteAgentParams,
        nextStep: BaseAgentNextStep<P>,
        currentPayload: P,
        agentRun: MJAIAgentRunEntityExtended,
        currentStep: MJAIAgentRunStepEntityExtended,
    ): Promise<BaseAgentNextStep<P>> {
        if (nextStep.step === 'ForEach' && isVideoStudioStageName(nextStep.forEach?.subAgent?.name)) {
            const msg = 'Call stages with a Sub-Agent step, one at a time';
            return {
                ...nextStep,
                step: 'Retry',
                terminate: false,
                retryInstructions: msg,
                errorMessage: msg,
            };
        }
        if (nextStep.step === 'While' && isVideoStudioStageName(nextStep.while?.subAgent?.name)) {
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

        const requestedList =
            Array.isArray(baseResult.subAgents) && baseResult.subAgents.length > 0
                ? baseResult.subAgents
                : baseResult.subAgent
                  ? [baseResult.subAgent]
                  : [];

        const stageRequests = requestedList.filter((req) => isVideoStudioStageName(req?.name));
        if (stageRequests.length > 1) {
            const names = stageRequests.map((r) => r.name).join(', ');
            const msg = `Only one Video Studio stage sub-agent may run at a time (requested: ${names}). Invoke stages sequentially.`;
            return {
                ...baseResult,
                step: 'Retry',
                retryInstructions: msg,
                errorMessage: msg,
            };
        }

        if (stageRequests.length === 0) {
            return baseResult;
        }

        const hasStepFinishIf =
            (baseResult.finishIf !== undefined && baseResult.finishIf !== null) ||
            (nextStep.finishIf !== undefined && nextStep.finishIf !== null);
        if (hasStepFinishIf || stageRequests.some((req) => req?.terminateAfter === true)) {
            const msg = 'Stages never end the run; finish with Success';
            return {
                ...baseResult,
                step: 'Retry',
                terminate: false,
                retryInstructions: msg,
                errorMessage: msg,
            };
        }

        const stageReq = stageRequests[0];
        const stageName = resolveCanonicalStage(stageReq.name) ?? stageReq.name;
        const normalizedStage = normalizeStageKey(stageName);

        const spec = cloneSpec((currentPayload ?? params.payload ?? {}) as Partial<VideoGenerationSpec>);
        this.syncDeliverableFormats(spec);
        this.restoreCallerInteraction(spec);

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

        // Gate G2 Plan checkpoint before Pre-Production spend
        if (normalizedStage === 'Pre-Production') {
            const g1 = gates.find((g) => g.Gate === 'G1');
            const g2 = gates.find((g) => g.Gate === 'G2');
            if (g1?.Status === 'Passed' && g2?.Status === 'Pending' && g2?.Notes === 'AwaitingApproval') {
                const pausedGates = gates.map((g): GateRecord =>
                    g.Gate === 'G2'
                        ? { ...g, Status: 'Blocked', Notes: 'AwaitingApproval' }
                        : g,
                );
                spec.Review.Gates = pausedGates;
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
        }

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

        // Pre-Render async/structural spec validation (VS-SPEC-2b)
        if (normalizedStage === 'Render') {
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

            if (!validationResult.Valid) {
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
        }

        // Populate stage-specific prompt templateParameters (VS-AGT-1)
        const stageTemplateParams = this.buildStageTemplateParameters(normalizedStage, spec);
        if (Object.keys(stageTemplateParams).length > 0) {
            if (baseResult.subAgent && isVideoStudioStageName(baseResult.subAgent.name)) {
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
                    isVideoStudioStageName(entry?.name)
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

        const spec = cloneSpec(
            (baseResult.newPayload ?? currentPayload ?? params.payload ?? {}) as Partial<VideoGenerationSpec>,
        );
        this.syncDeliverableFormats(spec);
        this.restoreCallerInteraction(spec);

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

        const terminalFailure = FindIntegrityOrGateCriterionFailure(spec, {
            Settings: this._currentSettings,
            BrandKitInScope: this._brandKitInScope,
            EffectiveInteractionMode: effectiveMode,
            InitialRoundCount: this._initialRoundCount,
        });
        if (terminalFailure) {
            spec.Status = DeriveStatus(spec, gates);
            return {
                ...baseResult,
                step: 'Failed',
                terminate: true,
                errorMessage: terminalFailure,
                previousPayload: currentPayload,
                newPayload: spec as unknown as P,
            };
        }

        // Gate G4 Plan checkpoint under ApproveStoryboardAndRoughCut
        const g1 = gates.find((g) => g.Gate === 'G1');
        const g2 = gates.find((g) => g.Gate === 'G2');
        const g3 = gates.find((g) => g.Gate === 'G3');
        const g4 = gates.find((g) => g.Gate === 'G4');

        if (
            g1?.Status === 'Passed' &&
            g2?.Status === 'Passed' &&
            g3?.Status === 'Passed' &&
            g4?.Status === 'Pending' &&
            g4?.Notes === 'AwaitingApproval'
        ) {
            const pausedGates = gates.map((g): GateRecord =>
                g.Gate === 'G4'
                    ? { ...g, Status: 'Blocked', Notes: 'AwaitingApproval' }
                    : g,
            );
            spec.Review.Gates = pausedGates;
            spec.Status = DeriveStatus(spec, pausedGates);
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

        const nonPassing = gates.filter((g) => g.Status !== 'Passed');
        if (nonPassing.length > 0) {
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

        spec.Status = 'Delivered';
        spec.Review.HumanReviewNotes = ComposeHumanReviewNotes(spec);
        const provenance = BuildGenerationProvenanceSummary(spec);
        if (spec.Output) {
            if (provenance !== undefined) {
                spec.Output.GenerationProvenance = provenance;
            } else {
                delete spec.Output.GenerationProvenance;
            }
        }

        const archetypeName = spec.Archetype?.Name?.trim() || 'Video Production';
        const oneSentence = spec.Film?.OneSentence ?? '';
        const artifactDirective: BaseAgentNextStep<P>['artifactDirective'] = this._startedWithBrief
            ? { behavior: 'version-source' }
            : {
                  behavior: 'create-new',
                  name: `${archetypeName}: ${oneSentence}`.slice(0, 120),
                  description: spec.Film?.Purpose,
              };

        return {
            ...baseResult,
            step: 'Success',
            previousPayload: currentPayload,
            newPayload: spec as unknown as P,
            artifactDirective,
        };
    }

    // -----------------------------------------------------------------------
    // Private / Protected Helpers
    // -----------------------------------------------------------------------

    private async warmEngines(params: ExecuteAgentParams): Promise<void> {
        await VideoStudioEngine.Instance.Config(false, params.contextUser, this.ProviderToUse);
        await BrandKitEngine.Instance.Config(false, params.contextUser, this.ProviderToUse);
    }

    private buildSeededPayload(
        params: ExecuteAgentParams,
        settings: VideoStudioSettings,
    ): Partial<VideoGenerationSpec> {
        this.captureCallerMode(params);
        const seeded = cloneSpec((params.payload ?? {}) as Partial<VideoGenerationSpec>);
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

        // Brand Kit seeding
        this.seedBrandKit(seeded, companyId);

        // Interaction mode: the driver never writes Interaction.Mode; preserve only caller-supplied Interaction.Mode
        this.restoreCallerInteraction(seeded);

        this.syncDeliverableFormats(seeded);

        // Resume from a paused G2 or G4 approval gate
        this.applyApprovalResume(params, seeded);

        return seeded;
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
        this._brandKitInScope = true;
        let kit: MJBrandKitEntity | null = null;

        const engine = BrandKitEngine.Instance;
        if (seeded.BrandKitID?.trim()) {
            const allKits = Array.isArray(engine.BrandKits) ? engine.BrandKits : [];
            kit = allKits.find((k) => UUIDsEqual(k.ID, seeded.BrandKitID)) ?? null;
            if (!kit) {
                this._brandKitInScope = false;
                return;
            }
        } else {
            kit = engine.GetDefaultKit(companyId) ?? null;
        }

        if (!kit) {
            return;
        }

        if (!seeded.BrandKitID) {
            seeded.BrandKitID = kit.ID;
        }

        this._brandKitInScope =
            !kit.CompanyID || Boolean(companyId && UUIDsEqual(kit.CompanyID, companyId));

        // 1. Seed Brand Kit assets into Assets.Approved
        const kitAssets = engine.GetAssets(kit.ID) ?? [];
        const approvedList = seeded.Assets!.Approved;
        const existingFileIds = new UUIDSet(
            approvedList.map((a) => a.FileID).filter((id): id is string => Boolean(id)),
        );
        for (const asset of kitAssets) {
            if (!asset || !asset.FileID) {
                continue;
            }
            if (existingFileIds.Has(asset.FileID)) {
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

        // 2. Merge NeverInventObject entries
        const kitNeverInvent = kit.NeverInventObject;
        if (Array.isArray(kitNeverInvent)) {
            const existingSet = new Set(seeded.Assets!.NeverInvent);
            for (const item of kitNeverInvent) {
                if (typeof item === 'string' && item.trim() && !existingSet.has(item.trim())) {
                    seeded.Assets!.NeverInvent.push(item.trim());
                    existingSet.add(item.trim());
                }
            }
        }

        // 3. Default VoiceID / Provider on Audio.Narration when empty
        const voiceObj = kit.VoiceObject;
        if (voiceObj && typeof voiceObj === 'object') {
            const defaultVoiceId = (voiceObj.VoiceID ?? '').trim();
            const defaultProvider = (voiceObj.Provider ?? '').trim();
            if (defaultVoiceId || defaultProvider) {
                if (!seeded.Audio) {
                    seeded.Audio = { Cues: [], Captions: 'None' };
                }
                if (!seeded.Audio.Narration) {
                    seeded.Audio.Narration = {
                        VoiceID: defaultVoiceId,
                        Provider: defaultProvider,
                        Script: [],
                    };
                } else {
                    if (!seeded.Audio.Narration.VoiceID?.trim() && defaultVoiceId) {
                        seeded.Audio.Narration.VoiceID = defaultVoiceId;
                    }
                    if (!seeded.Audio.Narration.Provider?.trim() && defaultProvider) {
                        seeded.Audio.Narration.Provider = defaultProvider;
                    }
                }
            }
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
            const rv = new RunView(this.ProviderToUse as unknown as IRunViewProvider);
            const escapedId = EscapeSQLString(conversationId);
            const res = await rv.RunView<{
                ID: string;
                MimeType?: string | null;
                FileName?: string | null;
                FileID?: string | null;
                InlineData?: string | null;
                ArtifactVersionID?: string | null;
            }>(
                {
                    EntityName: 'MJ: Conversation Detail Attachments',
                    ExtraFilter: `ConversationDetailID IN (SELECT ID FROM __mj.vwConversationDetails WHERE ConversationID = '${escapedId}') AND (MimeType LIKE 'image/%' OR MimeType LIKE 'video/%')`,
                    Fields: ['ID', 'MimeType', 'FileName', 'FileID', 'InlineData', 'ArtifactVersionID'],
                    ResultType: 'simple',
                },
                params.contextUser,
            );

            if (!res?.Success || !Array.isArray(res.Results)) {
                if (res && !res.Success) {
                    LogError(
                        `VideoStudioAgent: failed to query conversation attachments for conversation "${conversationId}": ${res.ErrorMessage ?? 'Unknown error'}`,
                    );
                }
                return;
            }

            if (!seeded.Assets) {
                seeded.Assets = { Approved: [], Required: [], NeverInvent: [] };
            }
            const approvedList = seeded.Assets.Approved;
            const existingFileIds = new UUIDSet(
                approvedList.map((a) => a.FileID).filter((id): id is string => Boolean(id)),
            );
            const existingArtifactVersionIds = new UUIDSet(
                approvedList
                    .map((a) => a.ArtifactVersionID)
                    .filter((id): id is string => Boolean(id)),
            );
            const existingSources = new Set(
                approvedList
                    .map((a) => a.Source?.trim().toLowerCase())
                    .filter((s): s is string => Boolean(s)),
            );

            for (const row of res.Results) {
                const rowId = row?.ID?.trim();
                if (!row || !rowId) {
                    continue;
                }
                try {
                    const attachmentSource = `Conversation attachment ${rowId}`;
                    let fileId = row.FileID?.trim() || undefined;
                    const artifactVersionId = row.ArtifactVersionID?.trim() || undefined;

                    if (fileId && existingFileIds.Has(fileId)) {
                        continue;
                    }
                    if (artifactVersionId && existingArtifactVersionIds.Has(artifactVersionId)) {
                        continue;
                    }
                    if (existingSources.has(attachmentSource.toLowerCase())) {
                        continue;
                    }

                    if (!fileId && !artifactVersionId) {
                        const rawInline = row.InlineData?.trim() ?? '';
                        if (!rawInline) {
                            continue;
                        }
                        const base64Payload = rawInline.includes(',')
                            ? rawInline.slice(rawInline.indexOf(',') + 1)
                            : rawInline;
                        const content = Buffer.from(base64Payload, 'base64');
                        const fileName = row.FileName?.trim() || rowId;
                        const mimeType = row.MimeType?.trim() || 'image/png';
                        const storedFileId = await StoreFile({
                            Content: content,
                            FileName: fileName,
                            MimeType: mimeType,
                            Description: 'Conversation attachment',
                            ContextUser: params.contextUser,
                            Provider: this.ProviderToUse,
                        });
                        if (!storedFileId) {
                            LogError(
                                `VideoStudioAgent: StoreFile returned no FileID for inline conversation attachment "${rowId}".`,
                            );
                            continue;
                        }
                        fileId = storedFileId;
                        if (existingFileIds.Has(fileId)) {
                            continue;
                        }
                    }

                    const kind: VideoAssetKind = (row.MimeType ?? '')
                        .toLowerCase()
                        .startsWith('video/')
                        ? 'Video'
                        : 'Image';

                    const baseKey = `attachment:${row.FileName?.trim() || rowId}`;
                    let uniqueKey = baseKey;
                    let suffix = 2;
                    while (approvedList.some((a) => a.Key === uniqueKey)) {
                        uniqueKey = `${baseKey}:${suffix}`;
                        suffix++;
                    }

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
                        existingFileIds.Add(fileId);
                    }
                    if (artifactVersionId) {
                        existingArtifactVersionIds.Add(artifactVersionId);
                    }
                    existingSources.add(attachmentSource.toLowerCase());
                } catch (rowErr) {
                    const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
                    LogError(
                        `VideoStudioAgent: failed to intake conversation attachment "${rowId}": ${msg}`,
                    );
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(
                `VideoStudioAgent: unexpected error during conversation attachment intake: ${msg}`,
            );
        }
    }

    private captureCallerMode(params: ExecuteAgentParams): void {
        const callerInteraction = (params?.payload as Partial<VideoGenerationSpec> | undefined)
            ?.Interaction;
        const rawCallerMode = callerInteraction?.Mode;
        const isBelowRoot =
            Boolean(params?.parentRun) ||
            (Array.isArray(this.AgentHierarchy) && this.AgentHierarchy.length > 1);

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
        } else if (
            this._currentSettings.Formats === 'First' ||
            !Array.isArray(spec.Deliverables.Formats) ||
            spec.Deliverables.Formats.length === 0
        ) {
            spec.Deliverables.Formats = targetFormats;
        }
    }

    private buildNormalizedSpecForValidation(
        spec: Partial<VideoGenerationSpec>,
        stage: VideoGenerationSpec['Status'],
        effectiveMode: VideoInteractionMode = 'Autonomous',
    ): VideoGenerationSpec {
        const cloned = cloneSpec(spec) as VideoGenerationSpec;
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
