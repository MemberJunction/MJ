import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import type { UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import type {
    CheckIssue,
    RenderProgress,
    VideoFormat,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import { LoadDataSnapshotValues } from '../data/data-snapshot.js';
import {
    BuildCheckRequest,
    BuildRenderBundle,
    CheckProductionRules,
    FrameSizeFor,
    ResolveDeliverableFormats,
    StillPointsFor,
} from '../render/bundle.js';
import { ReadVideoStudioOutputSettings } from '../render/render-settings.js';
import { VideoRenderEngine } from '../render/video-render-engine.js';
import { ResolveVideoStudioSettings } from '../settings.js';
import { StoreEphemeralFile, StoreFile } from '../storage.js';

/**
 * Exact error message emitted when `StoreFile` returns `undefined` (no storage account resolved).
 */
export const NO_STORAGE_ACCOUNT_ERROR_MESSAGE =
    "No file storage account resolved for Video Studio. Set Default Storage Account on the 'Content Creation' category.";

function formatMegabytesOneDecimal(bytes: number): string {
    return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Formats a {@link CheckIssue} as `[Category] Code: Message @ File:Line` (omitting `@ File:Line` when absent).
 */
export function FormatCheckIssue(issue: CheckIssue): string {
    const base = `[${issue.Category}] ${issue.Code}: ${issue.Message}`;
    if (issue.File) {
        const loc = typeof issue.Line === 'number' ? `${issue.File}:${issue.Line}` : issue.File;
        return `${base} @ ${loc}`;
    }
    return base;
}

function formatCheckFailureMessage(format: VideoFormat, issues: readonly CheckIssue[]): string {
    const topIssues = issues.slice(0, 10).map(FormatCheckIssue);
    const lines = [
        `Pre-render checks failed for format ${format} (${issues.length} issue(s)):`,
        ...topIssues.map((line) => `- ${line}`),
    ];
    return lines.join('\n');
}

/**
 * Deterministic sub-agent for the `Video Studio - Render` stage (`DriverClass = 'VideoStudioRenderAgent'`).
 *
 * Executes four steps per deliverable format through {@link VideoRenderEngine.Instance.Driver}:
 * 1. `'Validation'` step `"Check <fmt>"` — merges {@link CheckProductionRules} with `driver.Check`
 * 2. `'Tool'` step `"Stills <fmt>"` — captures representative stills via `driver.CaptureStills`
 * 3. `'Tool'` step `"Contact sheets <fmt>"` — builds tiled grids + transition strip via `driver.BuildContactSheet` and stores PNGs via {@link StoreFile}
 * 4. `'Tool'` step `"Render <fmt>"` — renders MP4 via `driver.Render`, verifies audio presence, and stores MP4 via {@link StoreFile} (or inline up to `InlineMaxBytes`)
 */
@RegisterClass(BaseAgent, 'VideoStudioRenderAgent')
export class VideoStudioRenderAgent extends BaseAgent {
    protected override async executeAgentInternal<P = VideoGenerationSpec>(
        params: ExecuteAgentParams<P>,
        _config: AgentConfiguration,
    ): Promise<{ finalStep: BaseAgentNextStep<P>; stepCount: number }> {
        const incomingPayload = (params.payload ?? ({} as P)) as unknown as VideoGenerationSpec;
        const workingSpec = structuredClone(incomingPayload);
        const contextUser = params.contextUser as UserInfo;
        const storageAccountId = this.ResolvedStorageAccountId ?? undefined;
        const configId = params.configurationId ?? this.AgentRun?.ConfigurationID ?? null;
        const settings = ResolveVideoStudioSettings(configId);
        const outputSettings = ReadVideoStudioOutputSettings();
        const driver = VideoRenderEngine.Instance.Driver;

        let stepCount = 0;
        let currentStep: MJAIAgentRunStepEntityExtended | null = null;

        const startStep = async (
            stepType: 'Validation' | 'Tool',
            stepName: string,
            inputData: Record<string, unknown>,
        ): Promise<MJAIAgentRunStepEntityExtended | null> => {
            stepCount += 1;
            const stepParams = {
                agentRunId: this.AgentRun?.ID ?? '',
                stepNumber: stepCount,
                stepType,
                stepName,
                inputData,
                contextUser,
            };
            return await this.createStepEntity(stepParams);
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
            await this.finalizeStepEntity(step, success, errorMessage, outputData);
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
            const beats = Array.isArray(workingSpec.Beats) ? workingSpec.Beats : [];
            const lastBeatEndSeconds =
                beats.length > 0 ? beats[beats.length - 1].EndSeconds : undefined;
            if (typeof lastBeatEndSeconds !== 'number' || !(lastBeatEndSeconds > 0)) {
                return failRun('No beats to render');
            }
            const durationSeconds = lastBeatEndSeconds;

            const values = workingSpec.DataSnapshot
                ? await LoadDataSnapshotValues(workingSpec.DataSnapshot, {
                      ContextUser: contextUser,
                      Provider: this.ProviderToUse,
                  })
                : {};

            const formats: VideoFormat[] = ResolveDeliverableFormats(workingSpec);

            const quality = workingSpec.Render?.Quality ?? settings.RenderQuality;
            const fps =
                typeof workingSpec.Render?.Fps === 'number' && workingSpec.Render.Fps > 0
                    ? workingSpec.Render.Fps
                    : settings.Fps;

            const contactSheetFileIDs: Partial<Record<VideoFormat, string[]>> = {
                ...(workingSpec.Output?.ContactSheetFileIDs ?? {}),
            };
            workingSpec.Output = {
                Videos: { ...(workingSpec.Output?.Videos ?? {}) },
                ContactSheetFileIDs: contactSheetFileIDs,
                ...(workingSpec.Output?.PosterFileID
                    ? { PosterFileID: workingSpec.Output.PosterFileID }
                    : {}),
                ...(workingSpec.Output?.CaptionsFileID
                    ? { CaptionsFileID: workingSpec.Output.CaptionsFileID }
                    : {}),
                ...(workingSpec.Output?.Source ? { Source: workingSpec.Output.Source } : {}),
                RenderMetadata: workingSpec.Output?.RenderMetadata ?? {
                    Renderer: 'HyperFrames',
                    RendererVersion: workingSpec.Render?.RendererVersion ?? '',
                    Seed: workingSpec.Render?.Seed ?? 1,
                    Fps: fps,
                    DurationByFormat: {},
                    RenderedAt: '',
                },
            };

            const allSheetFileIDs: string[] = [];
            const durationByFormat: Partial<Record<VideoFormat, number>> = {};
            let lastRendererVersion = workingSpec.Render?.RendererVersion ?? '';
            let posterStoredForFirstFormat = false;

            for (const fmt of formats) {
                const fmtSlug = fmt.replace(':', 'x');
                const { Width, Height } = FrameSizeFor(fmt, quality);

                // Step 1: Validation step "Check <fmt>"
                currentStep = await startStep('Validation', `Check ${fmt}`, {
                    Format: fmt,
                    Width,
                    Height,
                });

                const bundle = await BuildRenderBundle(workingSpec, fmt, {
                    ContextUser: contextUser,
                    Provider: this.ProviderToUse,
                    Values: values,
                });

                const productionIssues = CheckProductionRules(workingSpec, settings);
                const checkRequest = BuildCheckRequest(workingSpec, fmt, bundle, values);
                const workerCheckResult = await driver.Check(
                    checkRequest,
                    params.cancellationToken,
                );
                const mergedIssues: CheckIssue[] = [
                    ...productionIssues,
                    ...(workerCheckResult.Issues ?? []),
                ];
                const hasErrorIssues = mergedIssues.some((issue) => issue.Severity === 'Error');

                if (hasErrorIssues || workerCheckResult.BlockRender) {
                    const errorIssues = mergedIssues.filter((i) => i.Severity === 'Error');
                    const issuesToReport = errorIssues.length > 0 ? errorIssues : mergedIssues;
                    const message = formatCheckFailureMessage(fmt, issuesToReport);
                    await finishStep(
                        currentStep,
                        false,
                        { Issues: mergedIssues, BlockRender: true },
                        message,
                    );
                    currentStep = null;
                    return failRun(message);
                }

                await finishStep(currentStep, true, {
                    Issues: mergedIssues,
                    BlockRender: false,
                });
                currentStep = null;

                // Step 2: Tool step "Stills <fmt>"
                const points = StillPointsFor(workingSpec);
                currentStep = await startStep('Tool', `Stills ${fmt}`, {
                    Format: fmt,
                    Width,
                    Height,
                    PointCount: points.length,
                });

                const stillsResult = await driver.CaptureStills(
                    {
                        Bundle: bundle,
                        Width,
                        Height,
                        Points: points,
                    },
                    params.cancellationToken,
                );
                if (stillsResult.RendererVersion) {
                    lastRendererVersion = stillsResult.RendererVersion;
                }

                // Store first format's Poster still as poster.png when Deliverables.Poster is enabled
                if (!posterStoredForFirstFormat && workingSpec.Deliverables?.Poster) {
                    const posterStill =
                        stillsResult.Stills.find((s) => s.Role === 'Poster') ??
                        stillsResult.Stills[stillsResult.Stills.length - 1];
                    if (posterStill) {
                        const posterBytes = Buffer.from(posterStill.ImageBase64, 'base64');
                        const posterMime = posterStill.MimeType || 'image/png';
                        const storedPosterFileId =
                            (await StoreFile({
                                Content: posterBytes,
                                FileName: 'poster.png',
                                MimeType: posterMime,
                                Description: `Poster frame (${fmt})`,
                                ContextUser: contextUser,
                                Provider: this.ProviderToUse,
                                StorageAccountID: storageAccountId,
                            })) ?? StoreEphemeralFile(posterBytes, posterMime, 'poster.png');
                        workingSpec.Output.PosterFileID = storedPosterFileId;
                        posterStoredForFirstFormat = true;
                    }
                }

                await finishStep(currentStep, true, {
                    Format: fmt,
                    StillCount: stillsResult.Stills.length,
                    PosterFileID: workingSpec.Output.PosterFileID ?? null,
                });
                currentStep = null;

                // Step 3: Tool step "Contact sheets <fmt>"
                currentStep = await startStep('Tool', `Contact sheets ${fmt}`, {
                    Format: fmt,
                    StillCount: stillsResult.Stills.length,
                });

                const sheetResult = await driver.BuildContactSheet(
                    {
                        Format: fmt,
                        Stills: stillsResult.Stills,
                        IncludeTransitionStrip: true,
                    },
                    params.cancellationToken,
                );

                // Order grids first and TransitionStrip last
                const gridSheets = sheetResult.Sheets.filter((s) => s.Kind === 'Grid');
                const stripSheets = sheetResult.Sheets.filter((s) => s.Kind !== 'Grid');
                const orderedSheets = [...gridSheets, ...stripSheets];

                const formatSheetFileIDs: string[] = [];
                for (let idx = 0; idx < orderedSheets.length; idx++) {
                    const sheet = orderedSheets[idx];
                    const sheetBytes = Buffer.from(sheet.ImageBase64, 'base64');
                    const sheetFileName = `contact-sheet-${fmtSlug}-${idx + 1}.png`;
                    const sheetMime = sheet.MimeType || 'image/png';
                    const storedSheetFileId =
                        (await StoreFile({
                            Content: sheetBytes,
                            FileName: sheetFileName,
                            MimeType: sheetMime,
                            Description: `Contact sheet ${idx + 1} (${fmt}, ${sheet.Kind})`,
                            ContextUser: contextUser,
                            Provider: this.ProviderToUse,
                            StorageAccountID: storageAccountId,
                        })) ?? StoreEphemeralFile(sheetBytes, sheetMime, sheetFileName);
                    formatSheetFileIDs.push(storedSheetFileId);
                    allSheetFileIDs.push(storedSheetFileId);
                }

                contactSheetFileIDs[fmt] = formatSheetFileIDs;
                workingSpec.Output.ContactSheetFileIDs = contactSheetFileIDs;

                await finishStep(currentStep, true, {
                    Format: fmt,
                    ContactSheetFileIDs: formatSheetFileIDs,
                });
                currentStep = null;

                // Step 4: Tool step "Render <fmt>"
                currentStep = await startStep('Tool', `Render ${fmt}`, {
                    Format: fmt,
                    Width,
                    Height,
                    Fps: fps,
                    DurationSeconds: durationSeconds,
                    Quality: quality,
                });

                const relayProgress = (p: RenderProgress): void => {
                    try {
                        params.onProgress?.({
                            step: 'subagent_execution',
                            message: `${fmt} ${p.Phase} ${p.Percent}%`,
                        });
                    } catch {
                        // Never let caller progress callbacks abort the render
                    }
                };

                const renderResult = await driver.Render(
                    {
                        Bundle: bundle,
                        Width,
                        Height,
                        Fps: fps,
                        DurationSeconds: durationSeconds,
                        Quality: quality,
                    },
                    relayProgress,
                    params.cancellationToken,
                );

                if (renderResult.RendererVersion) {
                    lastRendererVersion = renderResult.RendererVersion;
                }

                const narrationEnabled = workingSpec.Audio?.Narration?.Enabled !== false;
                const expectsAudio =
                    (narrationEnabled && (workingSpec.Audio?.Narration?.Script?.length ?? 0) > 0) ||
                    Boolean(workingSpec.Audio?.Music?.AssetKey?.trim());

                if (expectsAudio && !renderResult.HasAudio) {
                    const audioIssue: CheckIssue = {
                        Code: 'MissingRenderedAudioTrack',
                        Category: 'Audio',
                        Severity: 'Error',
                        Message: `Rendered MP4 for format ${fmt} reported HasAudio=false while narration or music audio is configured on the spec.`,
                    };
                    const message = formatCheckFailureMessage(fmt, [audioIssue]);
                    await finishStep(
                        currentStep,
                        false,
                        { Issues: [audioIssue] },
                        message,
                    );
                    currentStep = null;
                    return failRun(message);
                }

                const videoBytes = Buffer.from(renderResult.Video);
                const storedVideoFileId = await StoreFile({
                    Content: videoBytes,
                    FileName: `video-${fmtSlug}.mp4`,
                    MimeType: renderResult.MimeType || 'video/mp4',
                    Description: `Rendered MP4 (${fmt})`,
                    ContextUser: contextUser,
                    Provider: this.ProviderToUse,
                    StorageAccountID: storageAccountId,
                });
                if (!storedVideoFileId) {
                    if (
                        outputSettings.InlineMaxBytes > 0 &&
                        videoBytes.byteLength <= outputSettings.InlineMaxBytes
                    ) {
                        workingSpec.Output.Videos[fmt] = {
                            Format: fmt,
                            InlineBase64: videoBytes.toString('base64'),
                            MimeType: renderResult.MimeType || 'video/mp4',
                            Width: renderResult.Width,
                            Height: renderResult.Height,
                            DurationSeconds: renderResult.DurationSeconds,
                            FileSizeBytes: videoBytes.byteLength,
                        };
                        durationByFormat[fmt] = renderResult.DurationSeconds;

                        await finishStep(currentStep, true, {
                            Stored: 'Inline',
                            Bytes: videoBytes.byteLength,
                        });
                        currentStep = null;
                        continue;
                    }

                    const sizeMb = formatMegabytesOneDecimal(videoBytes.byteLength);
                    const capMb = formatMegabytesOneDecimal(outputSettings.InlineMaxBytes);
                    const oversizedMessage = `The rendered ${fmt} video is ${sizeMb} MB and could not be stored in MJStorage. Inline storage is limited to ${capMb} MB. Set Default Storage Account on the 'Content Creation' agent category or on the Video Studio agent.`;
                    await finishStep(currentStep, false, undefined, oversizedMessage);
                    currentStep = null;
                    return failRun(oversizedMessage);
                }

                workingSpec.Output.Videos[fmt] = {
                    Format: fmt,
                    FileID: storedVideoFileId,
                    MimeType: renderResult.MimeType || 'video/mp4',
                    Width: renderResult.Width,
                    Height: renderResult.Height,
                    DurationSeconds: renderResult.DurationSeconds,
                    FileSizeBytes: videoBytes.byteLength,
                };
                durationByFormat[fmt] = renderResult.DurationSeconds;

                await finishStep(currentStep, true, {
                    Format: fmt,
                    FileID: storedVideoFileId,
                    DurationSeconds: renderResult.DurationSeconds,
                    FileSizeBytes: videoBytes.byteLength,
                    RendererVersion: renderResult.RendererVersion,
                });
                currentStep = null;
            }

            const nowIso = new Date().toISOString();
            workingSpec.Output.RenderMetadata = {
                Renderer: 'HyperFrames',
                RendererVersion: lastRendererVersion,
                Seed: workingSpec.Render?.Seed ?? 1,
                Fps: fps,
                DurationByFormat: durationByFormat,
                RenderedAt: nowIso,
            };
            if (workingSpec.Render && lastRendererVersion) {
                workingSpec.Render.RendererVersion = lastRendererVersion;
            }

            if (!workingSpec.Review) {
                workingSpec.Review = { Gates: [], Rounds: [] };
            }
            if (!Array.isArray(workingSpec.Review.Gates)) {
                workingSpec.Review.Gates = [];
            }

            const g3EvidenceRefs = [
                ...allSheetFileIDs,
                ...formats.map((f) => `check:${f}:passed`),
            ];
            const existingG3 = workingSpec.Review.Gates.find((g) => g.Gate === 'G3');
            if (existingG3) {
                existingG3.Status = 'Passed';
                existingG3.EvidenceRefs = g3EvidenceRefs;
                existingG3.Timestamp = nowIso;
            } else {
                workingSpec.Review.Gates.push({
                    Gate: 'G3',
                    Status: 'Passed',
                    EvidenceRefs: g3EvidenceRefs,
                    Timestamp: nowIso,
                });
            }

            return {
                finalStep: {
                    step: 'Success',
                    terminate: true,
                    newPayload: workingSpec as unknown as P,
                    previousPayload: params.payload as P,
                    message: `Rendered ${formats.length} format(s) (${formats.join(', ')}) and recorded G3 evidence.`,
                },
                stepCount,
            };
        } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            if (currentStep) {
                await finishStep(currentStep, false, undefined, errMessage);
                currentStep = null;
            }
            return failRun(errMessage);
        }
    }
}

/**
 * Tree-shaking guard to ensure `VideoStudioRenderAgent` is registered with `MJGlobal`.
 */
export function LoadVideoStudioRenderAgent(): void {
    if (false as boolean) {
        const _keep: unknown = VideoStudioRenderAgent;
    }
}
