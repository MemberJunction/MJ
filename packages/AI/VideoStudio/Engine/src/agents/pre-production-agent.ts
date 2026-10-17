import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import { VideoStudioEngine } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import {
    CreateMJChartKit,
    type VideoAsset,
    type VideoAssetKind,
    type VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import {
    CaptureDataSnapshot,
    LoadDataSnapshotValues,
    type DataSnapshotIssue,
} from '../data/data-snapshot.js';
import { RunNarrationPipeline } from '../narration/narration-pipeline.js';
import type {
    FilmDurationBounds,
    NarrationIssue,
} from '../narration/narration-timeline.js';
import { SanitizeStageKey } from '../render/bundle.js';

const NEVER_INVENT_ESCALATION_NOTE =
    'Ask the caller to supply the missing data, parameter, or asset. Never fill in a placeholder or invent the value.';

function cloneSpec<T>(value: T): T {
    if (value === undefined || value === null) {
        return {} as T;
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

function inferAssetExtension(asset: VideoAsset): string {
    const rawAsset = asset as VideoAsset & { MimeType?: string };
    const mime = (rawAsset.MimeType ?? '').trim().toLowerCase();
    if (mime) {
        if (mime === 'image/png') return 'png';
        if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
        if (mime === 'image/svg+xml') return 'svg';
        if (mime === 'image/webp') return 'webp';
        if (mime === 'image/gif') return 'gif';
        if (mime === 'video/mp4') return 'mp4';
        if (mime === 'video/webm') return 'webm';
        if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'mp3';
        if (mime === 'audio/wav' || mime === 'audio/x-wav') return 'wav';
        if (mime === 'audio/ogg') return 'ogg';
        if (mime === 'font/woff2' || mime === 'application/font-woff2') return 'woff2';
        if (mime === 'font/woff' || mime === 'application/font-woff') return 'woff';
        if (mime === 'font/ttf' || mime === 'application/x-font-ttf') return 'ttf';
        if (mime === 'font/otf' || mime === 'application/x-font-opentype') return 'otf';
        if (mime === 'application/json') return 'json';
    }

    const sourceMatch = (asset.Source ?? '').trim().match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/);
    if (sourceMatch) {
        const ext = sourceMatch[1].toLowerCase();
        if (
            [
                'png',
                'jpg',
                'jpeg',
                'svg',
                'webp',
                'gif',
                'mp4',
                'webm',
                'mp3',
                'wav',
                'ogg',
                'woff2',
                'woff',
                'ttf',
                'otf',
                'json',
            ].includes(ext)
        ) {
            return ext === 'jpeg' ? 'jpg' : ext;
        }
    }

    const kindMap: Record<VideoAssetKind, string> = {
        Logo: 'png',
        LogoMark: 'png',
        Image: 'png',
        Screenshot: 'png',
        Video: 'mp4',
        Music: 'mp3',
        SoundEffect: 'mp3',
        Font: 'woff2',
        Other: 'bin',
    };
    return kindMap[asset.Kind] ?? 'bin';
}

function formatPreProductionFailureMessage(
    stageLabel: string,
    issues: ReadonlyArray<DataSnapshotIssue | NarrationIssue>,
    thrownError?: unknown,
): string {
    const lines: string[] = [`Video Studio Pre-Production failed during "${stageLabel}".`];
    for (const issue of issues) {
        const keyInfo =
            'BindingKey' in issue && issue.BindingKey
                ? ` (binding: ${issue.BindingKey})`
                : 'LineKey' in issue && issue.LineKey
                  ? ` (line: ${issue.LineKey})`
                  : '';
        lines.push(`- [${issue.Severity}] ${issue.Code}${keyInfo}: ${issue.Message}`);
    }
    if (thrownError !== undefined) {
        const errText = thrownError instanceof Error ? thrownError.message : String(thrownError);
        lines.push(`- [Error] Exception: ${errText}`);
    }
    lines.push(NEVER_INVENT_ESCALATION_NOTE);
    return lines.join('\n');
}

/**
 * Deterministic sub-agent for the `Video Studio - Pre-Production` stage (`DriverClass = 'VideoStudioPreProductionAgent'`).
 *
 * Executes three tool steps without invoking an LLM prompt loop:
 * 1. `"Data Snapshot"` — captures live data bindings via {@link CaptureDataSnapshot} (skipped when `DataBindings` is empty)
 * 2. `"Narration"` — synthesizes TTS clips, re-times beats, and builds VTT captions via {@link RunNarrationPipeline}
 * 3. `"Stage Assets"` — assigns deterministic bundle-relative `StagedPath` values to approved assets and narration lines
 */
@RegisterClass(BaseAgent, 'VideoStudioPreProductionAgent')
export class VideoStudioPreProductionAgent extends BaseAgent {
    protected override async executeAgentInternal<P = VideoGenerationSpec>(
        params: ExecuteAgentParams<P>,
        _config: AgentConfiguration,
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        const incomingPayload = (params.payload ?? ({} as P)) as unknown as VideoGenerationSpec;
        const workingSpec = cloneSpec(incomingPayload);
        const contextUser = params.contextUser as UserInfo;
        const storageAccountId = this.ResolvedStorageAccountId ?? undefined;

        let stepCount = 0;
        let currentStep: MJAIAgentRunStepEntityExtended | null = null;
        let currentStepLabel = 'Initialization';

        const startStep = async (
            stepName: string,
            inputData: Record<string, unknown>,
        ): Promise<MJAIAgentRunStepEntityExtended | null> => {
            stepCount += 1;
            currentStepLabel = stepName;
            const stepParams = {
                agentRunId: this.AgentRun?.ID ?? '',
                stepNumber: stepCount,
                stepType: 'Tool' as const,
                stepName,
                inputData,
                contextUser,
            };
            try {
                return await this.createStepEntity(stepParams);
            } catch {
                return null;
            }
        };

        const finishStep = async (
            step: MJAIAgentRunStepEntityExtended | null,
            success: boolean,
            outputData?: Record<string, unknown>,
            errorMessage?: string,
        ): Promise<void> => {
            if (!step) {
                return;
            }
            try {
                await this.finalizeStepEntity(step, success, errorMessage, outputData);
            } catch {
                // Ignore step persistence errors when running in unit tests without a backing DB
            }
        };

        const failRun = (message: string): { finalStep: BaseAgentNextStep<P>; stepCount: number } => ({
            finalStep: {
                step: 'Failed',
                terminate: true,
                newPayload: params.payload as P,
                previousPayload: params.payload as P,
                message,
            },
            stepCount,
        });

        try {
            let snapshotValues: Record<string, unknown> = {};
            const bindings = Array.isArray(workingSpec.DataBindings) ? workingSpec.DataBindings : [];

            // Step 1: Data Snapshot (skipped when spec.DataBindings is empty)
            if (bindings.length > 0) {
                currentStep = await startStep('Data Snapshot', {
                    BindingCount: bindings.length,
                    BindingKeys: bindings.map((b) => b.Key),
                });

                const snapshotResult = await CaptureDataSnapshot(
                    bindings,
                    workingSpec.DataSnapshot?.Inline,
                    {
                        ContextUser: contextUser,
                        Provider: this.ProviderToUse,
                        StorageAccountID: storageAccountId,
                    },
                );

                const hasSnapshotErrors = snapshotResult.Issues.some(
                    (issue) => issue.Severity === 'Error',
                );
                if (hasSnapshotErrors) {
                    const message = formatPreProductionFailureMessage(
                        'Data Snapshot',
                        snapshotResult.Issues,
                    );
                    await finishStep(
                        currentStep,
                        false,
                        { Issues: snapshotResult.Issues },
                        message,
                    );
                    currentStep = null;
                    return failRun(message);
                }

                workingSpec.DataSnapshot = snapshotResult.Snapshot;
                snapshotValues = snapshotResult.Values;

                await finishStep(currentStep, true, {
                    AsOf: snapshotResult.Snapshot.AsOf,
                    FileID: snapshotResult.Snapshot.FileID,
                    Issues: snapshotResult.Issues,
                });
                currentStep = null;
            } else if (workingSpec.DataSnapshot) {
                snapshotValues = await LoadDataSnapshotValues(workingSpec.DataSnapshot, {
                    ContextUser: contextUser,
                    Provider: this.ProviderToUse,
                });
            }

            // Step 2: Narration
            currentStep = await startStep('Narration', {
                LineCount: workingSpec.Audio?.Narration?.Script?.length ?? 0,
                VoiceID: workingSpec.Audio?.Narration?.VoiceID ?? null,
                Provider: workingSpec.Audio?.Narration?.Provider ?? null,
            });

            const chartKit = CreateMJChartKit();
            const bindingText: Record<string, string> = {};
            for (const binding of bindings) {
                if (binding.Shape === 'Scalar') {
                    const rawVal = snapshotValues[binding.Key];
                    if (typeof rawVal === 'number' || typeof rawVal === 'string') {
                        bindingText[binding.Key] = chartKit.FormatValue(rawVal, binding.Format);
                    } else if (rawVal !== undefined && rawVal !== null) {
                        bindingText[binding.Key] = String(rawVal);
                    }
                }
            }
            for (const [key, rawVal] of Object.entries(snapshotValues)) {
                if (
                    !(key in bindingText) &&
                    (typeof rawVal === 'string' ||
                        typeof rawVal === 'number' ||
                        typeof rawVal === 'boolean')
                ) {
                    bindingText[key] = String(rawVal);
                }
            }

            const filmBounds = this.resolveFilmBounds(workingSpec);
            const narrationResult = await RunNarrationPipeline(workingSpec, {
                ContextUser: contextUser,
                Provider: this.ProviderToUse,
                StorageAccountID: storageAccountId,
                BindingText: bindingText,
                FilmBounds: filmBounds,
                AgentID: params.agent?.ID,
                AgentRunID: this.AgentRun?.ID,
                CancellationToken: params.cancellationToken,
            });

            const hasNarrationFailure = narrationResult.Issues.some(
                (issue) => issue.Severity === 'Error' || issue.Code === 'ClipNotStored',
            );
            if (hasNarrationFailure) {
                const message = formatPreProductionFailureMessage(
                    'Narration',
                    narrationResult.Issues,
                );
                await finishStep(
                    currentStep,
                    false,
                    { Issues: narrationResult.Issues },
                    message,
                );
                currentStep = null;
                return failRun(message);
            }

            workingSpec.Audio = narrationResult.Spec.Audio ?? { Cues: [], Captions: 'Burned' };
            workingSpec.Beats = narrationResult.Spec.Beats;
            if (workingSpec.Film && narrationResult.Spec.Film) {
                workingSpec.Film.DurationSeconds = narrationResult.Spec.Film.DurationSeconds;
            }
            if (narrationResult.CaptionsFileID) {
                const existingRenderMeta = workingSpec.Output?.RenderMetadata ?? {
                    Renderer: 'HyperFrames' as const,
                    RendererVersion: workingSpec.Render?.RendererVersion ?? '',
                    Seed: workingSpec.Render?.Seed ?? 1,
                    Fps: workingSpec.Render?.Fps ?? 30,
                    DurationByFormat: {},
                    RenderedAt: '',
                };
                workingSpec.Output = {
                    ...(workingSpec.Output ?? {}),
                    Videos: workingSpec.Output?.Videos ?? {},
                    RenderMetadata: existingRenderMeta,
                    CaptionsFileID: narrationResult.CaptionsFileID,
                };
            }

            await finishStep(currentStep, true, {
                FilmDurationSeconds: workingSpec.Film?.DurationSeconds,
                CaptionsFileID: narrationResult.CaptionsFileID ?? null,
                Issues: narrationResult.Issues,
            });
            currentStep = null;

            // Step 3: Stage Assets
            const approvedAssets = Array.isArray(workingSpec.Assets?.Approved)
                ? workingSpec.Assets.Approved
                : [];
            const scriptLines = Array.isArray(workingSpec.Audio?.Narration?.Script)
                ? workingSpec.Audio.Narration.Script
                : [];

            currentStep = await startStep('Stage Assets', {
                ApprovedAssetCount: approvedAssets.length,
                NarrationLineCount: scriptLines.length,
            });

            for (const asset of approvedAssets) {
                const sanitized = SanitizeStageKey(asset.Key);
                const ext = inferAssetExtension(asset);
                asset.StagedPath = `assets/${sanitized}.${ext}`;
            }

            for (const line of scriptLines) {
                const sanitized = SanitizeStageKey(line.Key);
                line.StagedPath = `audio/${sanitized}.mp3`;
            }

            await finishStep(currentStep, true, {
                StagedAssets: approvedAssets.map((a) => ({ Key: a.Key, StagedPath: a.StagedPath })),
                StagedNarrationLines: scriptLines.map((l) => ({
                    Key: l.Key,
                    StagedPath: l.StagedPath,
                })),
            });
            currentStep = null;

            return {
                finalStep: {
                    step: 'Success',
                    terminate: true,
                    newPayload: workingSpec as unknown as P,
                    previousPayload: params.payload as P,
                    message:
                        'Pre-production completed: data snapshot captured, narration synthesized, and assets staged.',
                },
                stepCount,
            };
        } catch (err) {
            const message = formatPreProductionFailureMessage(currentStepLabel, [], err);
            if (currentStep) {
                await finishStep(currentStep, false, undefined, message);
                currentStep = null;
            }
            return failRun(message);
        }
    }

    private resolveFilmBounds(spec: VideoGenerationSpec): FilmDurationBounds | undefined {
        const archetypeName = spec.Archetype?.Name?.trim();
        if (!archetypeName) {
            return undefined;
        }
        try {
            const archetype = VideoStudioEngine.Instance.GetArchetypeByName(
                archetypeName,
                spec.CompanyID ?? null,
            );
            if (!archetype) {
                return undefined;
            }
            const min = archetype.MinDurationSeconds;
            const max = archetype.MaxDurationSeconds;
            if (typeof min === 'number' && typeof max === 'number' && max > 0) {
                return {
                    MinSeconds: min,
                    MaxSeconds: max,
                };
            }
        } catch {
            // VideoStudioEngine may not be configured in isolated unit tests
        }
        return undefined;
    }
}

/**
 * Tree-shaking guard to ensure `VideoStudioPreProductionAgent` is registered with `MJGlobal`.
 */
export function LoadVideoStudioPreProductionAgent(): void {
    if (false as boolean) {
        const _keep: unknown = VideoStudioPreProductionAgent;
    }
}
