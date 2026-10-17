import { BaseAgent } from '@memberjunction/ai-agents';
import type {
    AgentConfiguration,
    BaseAgentNextStep,
    ExecuteAgentParams,
    MJAIAgentRunStepEntityExtended,
} from '@memberjunction/ai-core-plus';
import { RunView, type IMetadataProvider, type IRunViewProvider, type UserInfo } from '@memberjunction/core';
import { VideoStudioEngine } from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID, IsValidUUID, RegisterClass, UUIDSet } from '@memberjunction/global';
import {
    CreateMJChartKit,
    type VideoAsset,
    type VideoAssetGenerationRequest,
    type VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import {
    CaptureDataSnapshot,
    LoadDataSnapshotValues,
    type DataSnapshotIssue,
} from '../data/data-snapshot.js';
import { GenerateRequestedAssets } from '../generation/generate-assets.js';
import { RunNarrationPipeline } from '../narration/narration-pipeline.js';
import type {
    FilmDurationBounds,
    NarrationIssue,
} from '../narration/narration-timeline.js';
import { SanitizeStageKey } from '../render/bundle.js';
import { ResolveVideoStudioSettings } from '../settings.js';

const NEVER_INVENT_ESCALATION_NOTE =
    'Ask the caller to supply the missing data, parameter, or asset. Never fill in a placeholder or invent the value.';

const MIME_TO_EXTENSION: Readonly<Record<string, string>> = {
    'image/svg+xml': 'svg',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/ogg': 'ogg',
    'font/woff2': 'woff2',
    'application/font-woff2': 'woff2',
    'font/woff': 'woff',
    'application/font-woff': 'woff',
    'font/ttf': 'ttf',
    'application/x-font-ttf': 'ttf',
    'application/font-sfnt': 'ttf',
    'font/otf': 'otf',
    'application/x-font-opentype': 'otf',
    'application/json': 'json',
};

const KNOWN_FILE_EXTENSIONS = new Set<string>([
    'svg',
    'png',
    'jpg',
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
]);

interface StoredFileMetadataRow {
    ID: string;
    ContentType?: string | null;
    Name?: string | null;
}

interface StoredArtifactVersionMetadataRow {
    ID: string;
    FileID?: string | null;
    MimeType?: string | null;
    Name?: string | null;
}

function cloneSpec<T>(value: T): T {
    if (value === undefined || value === null) {
        return {} as T;
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

function mapMimeToExtension(rawMime: string | null | undefined): string | undefined {
    const normalized = (rawMime ?? '').trim().toLowerCase().split(';')[0].trim();
    if (!normalized) {
        return undefined;
    }
    return MIME_TO_EXTENSION[normalized];
}

function extractExtensionFromFileName(rawName: string | null | undefined): string | undefined {
    const trimmed = (rawName ?? '').trim();
    const match = trimmed.match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/);
    if (!match) {
        return undefined;
    }
    const lower = match[1].toLowerCase();
    const normalized = lower === 'jpeg' ? 'jpg' : lower;
    return KNOWN_FILE_EXTENSIONS.has(normalized) ? normalized : undefined;
}

function extractAssetIdHexPrefix(asset: VideoAsset): string {
    const rawId = (asset.FileID?.trim() || asset.ArtifactVersionID?.trim() || '');
    return rawId.replace(/[^a-fA-F0-9]/g, '').toLowerCase().slice(0, 8);
}

function allocateUniqueStagedPath(
    folder: 'assets' | 'audio',
    stem: string,
    ext: string,
    usedPaths: Set<string>,
): string {
    const basePath = `${folder}/${stem}.${ext}`;
    if (!usedPaths.has(basePath)) {
        usedPaths.add(basePath);
        return basePath;
    }
    let suffix = 2;
    while (usedPaths.has(`${folder}/${stem}-${suffix}.${ext}`)) {
        suffix += 1;
    }
    const uniquePath = `${folder}/${stem}-${suffix}.${ext}`;
    usedPaths.add(uniquePath);
    return uniquePath;
}

async function resolveAssetExtensionsFromStorage(
    approvedAssets: readonly VideoAsset[],
    contextUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<Map<VideoAsset, string>> {
    const result = new Map<VideoAsset, string>();
    if (approvedAssets.length === 0) {
        return result;
    }

    const rv = new RunView(provider as unknown as IRunViewProvider);
    const avIds = new UUIDSet();
    const fileIds = new UUIDSet();

    for (const asset of approvedAssets) {
        const fileId = asset.FileID?.trim();
        const avId = asset.ArtifactVersionID?.trim();
        const isGeneratedWithMeta =
            asset.Provenance === 'Generated' && asset.Generation !== undefined;
        if (!fileId && !avId) {
            throw new Error(
                `Cannot stage asset "${asset.Key}": asset has neither FileID nor ArtifactVersionID.`,
            );
        }
        if (fileId) {
            if (!IsValidUUID(fileId)) {
                if (isGeneratedWithMeta) {
                    continue;
                }
                throw new Error(
                    `Cannot stage asset "${asset.Key}": FileID "${fileId}" is not a valid UUID.`,
                );
            }
            fileIds.Add(fileId);
        }
        if (avId) {
            if (!IsValidUUID(avId)) {
                throw new Error(
                    `Cannot stage asset "${asset.Key}": ArtifactVersionID "${avId}" is not a valid UUID.`,
                );
            }
            avIds.Add(avId);
        }
    }

    let avRows: StoredArtifactVersionMetadataRow[] = [];
    if (avIds.Size > 0) {
        const avFilter = [...avIds].map((id) => `'${EscapeSQLString(id)}'`).join(', ');
        const avView = await rv.RunView<StoredArtifactVersionMetadataRow>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: `ID IN (${avFilter})`,
                Fields: ['ID', 'FileID', 'MimeType', 'Name'],
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!avView.Success) {
            throw new Error(
                `Failed to load MJ: Artifact Versions for asset staging: ${avView.ErrorMessage ?? 'RunView failed'}`,
            );
        }
        avRows = avView.Results ?? [];
        for (const row of avRows) {
            const linkedFileId = row.FileID?.trim();
            if (linkedFileId && IsValidUUID(linkedFileId)) {
                fileIds.Add(linkedFileId);
            }
        }
    }

    let fileRows: StoredFileMetadataRow[] = [];
    if (fileIds.Size > 0) {
        const fileFilter = [...fileIds].map((id) => `'${EscapeSQLString(id)}'`).join(', ');
        const fileView = await rv.RunView<StoredFileMetadataRow>(
            {
                EntityName: 'MJ: Files',
                ExtraFilter: `ID IN (${fileFilter})`,
                Fields: ['ID', 'ContentType', 'Name'],
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!fileView.Success) {
            throw new Error(
                `Failed to load MJ: Files for asset staging: ${fileView.ErrorMessage ?? 'RunView failed'}`,
            );
        }
        fileRows = fileView.Results ?? [];
    }

    const avByID = IndexByUUID(avRows);
    const fileByID = IndexByUUID(fileRows);

    for (const asset of approvedAssets) {
        const fileId = asset.FileID?.trim();
        const avId = asset.ArtifactVersionID?.trim();
        const isGeneratedWithMeta =
            asset.Provenance === 'Generated' && asset.Generation !== undefined;
        const avRow = avId && IsValidUUID(avId) ? avByID.Get(avId) : undefined;
        const effectiveFileId = fileId || avRow?.FileID?.trim() || undefined;
        const fileRow =
            effectiveFileId && IsValidUUID(effectiveFileId)
                ? fileByID.Get(effectiveFileId)
                : undefined;

        if (!fileRow && !avRow && isGeneratedWithMeta) {
            result.set(asset, asset.Kind === 'Video' ? 'mp4' : 'png');
            continue;
        }

        if (fileId && !fileRow) {
            throw new Error(
                `Cannot stage asset "${asset.Key}": MJ: Files record "${fileId}" was not found.`,
            );
        }
        if (!fileId && avId && !avRow) {
            throw new Error(
                `Cannot stage asset "${asset.Key}": MJ: Artifact Versions record "${avId}" was not found.`,
            );
        }

        const ext =
            mapMimeToExtension(fileRow?.ContentType) ??
            mapMimeToExtension(avRow?.MimeType) ??
            extractExtensionFromFileName(fileRow?.Name) ??
            extractExtensionFromFileName(avRow?.Name);

        if (!ext) {
            const reportedMime = (fileRow?.ContentType ?? avRow?.MimeType ?? '').trim() || 'none';
            const reportedName = (fileRow?.Name ?? avRow?.Name ?? '').trim() || 'none';
            throw new Error(
                `Cannot stage asset "${asset.Key}": stored file has unrecognized ContentType "${reportedMime}" and file Name "${reportedName}" has no supported extension.`,
            );
        }

        result.set(asset, ext);
    }

    return result;
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

function formatBlockedGenerationMessage(
    requests: readonly VideoAssetGenerationRequest[],
): string {
    const lines: string[] = [
        'Pre-Production paused during "Generate Assets": one or more generation requests are not Generated.',
    ];
    let hasGenerationFailed = false;
    for (const req of requests) {
        if (!req || req.Status === 'Generated') {
            continue;
        }
        const status = req.Status ?? 'Pending';
        const reason = req.BlockedReason ?? 'Skipped because another request in the pass was blocked.';
        if (reason.startsWith('GenerationFailed:')) {
            hasGenerationFailed = true;
        }
        lines.push(`- ${req.Key} [${status}]: ${reason}`);
    }
    if (hasGenerationFailed) {
        lines.push(
            'Call Pre-Production again to retry requests that failed with GenerationFailed, or ask the caller for a replacement asset.',
        );
    }
    lines.push(NEVER_INVENT_ESCALATION_NOTE);
    return lines.join('\n');
}

/**
 * Deterministic sub-agent for the `Video Studio - Pre-Production` stage (`DriverClass = 'VideoStudioPreProductionAgent'`).
 *
 * Executes up to four tool steps without invoking an LLM prompt loop:
 * 1. `"Data Snapshot"` — captures live data bindings via {@link CaptureDataSnapshot} (skipped when `DataBindings` is empty)
 * 2. `"Generate Assets"` — screens and synthesizes `Assets.Generate` requests via {@link GenerateRequestedAssets} (skipped when `Assets.Generate` is empty)
 * 3. `"Narration"` — synthesizes TTS clips, re-times beats, and builds VTT captions via {@link RunNarrationPipeline}
 * 4. `"Stage Assets"` — assigns deterministic bundle-relative `StagedPath` values to approved assets and narration lines
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

            // Step 2: Generate Assets (skipped when spec.Assets.Generate is empty)
            const generateRequests = Array.isArray(workingSpec.Assets?.Generate)
                ? workingSpec.Assets.Generate
                : [];
            if (generateRequests.length > 0) {
                currentStep = await startStep('Generate Assets', {
                    RequestCount: generateRequests.length,
                    RequestKeys: generateRequests.map((r) => r.Key),
                });

                const settings = ResolveVideoStudioSettings(params.configurationId);
                const genResult = await GenerateRequestedAssets(workingSpec, {
                    ContextUser: contextUser,
                    Provider: this.ProviderToUse,
                    StorageAccountID: storageAccountId,
                    Settings: settings,
                    AgentID: params.agent?.ID,
                    AgentRunID: this.AgentRun?.ID,
                    CompanyID: workingSpec.CompanyID ?? null,
                    CancellationToken: params.cancellationToken,
                    APIKeys: params.apiKeys,
                    CredentialScope: params.CredentialScope,
                });

                workingSpec.Assets = genResult.Spec.Assets;
                const updatedRequests = Array.isArray(workingSpec.Assets?.Generate)
                    ? workingSpec.Assets.Generate
                    : [];
                const allGenerated = updatedRequests.every((r) => r && r.Status === 'Generated');

                await finishStep(currentStep, true, {
                    Requests: genResult.RequestSummaries.map((s) => ({
                        Key: s.Key,
                        Kind: s.Kind,
                        Status: s.Status,
                        BlockedReason: s.BlockedReason,
                        ModelID: s.ModelID,
                        ModelName: s.ModelName,
                        DurationSeconds: s.DurationSeconds,
                        Cost: s.Cost,
                    })),
                    TotalCost: genResult.TotalCost,
                });
                currentStep = null;

                // If any request is not Generated afterwards, skip Narration and Stage Assets
                // and return Success with the merged payload so paid assets and statuses reach the root.
                if (!allGenerated) {
                    const blockedMessage = formatBlockedGenerationMessage(updatedRequests);
                    return {
                        finalStep: {
                            step: 'Success',
                            terminate: true,
                            newPayload: workingSpec as unknown as P,
                            previousPayload: params.payload as P,
                            message: blockedMessage,
                        },
                        stepCount,
                    };
                }
            }

            // Pre-check approved asset staging extensions before Narration synthesis (refuse bad input before TTS spend)
            const approvedAssets = Array.isArray(workingSpec.Assets?.Approved)
                ? workingSpec.Assets.Approved
                : [];
            currentStepLabel = 'Stage Assets';
            const resolvedExtensions = await resolveAssetExtensionsFromStorage(
                approvedAssets,
                contextUser,
                this.ProviderToUse,
            );

            // Step 3: Narration
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

            const filmBounds = await this.resolveFilmBounds(workingSpec, contextUser);
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

            // Step 4: Stage Assets
            const scriptLines = Array.isArray(workingSpec.Audio?.Narration?.Script)
                ? workingSpec.Audio.Narration.Script
                : [];

            currentStep = await startStep('Stage Assets', {
                ApprovedAssetCount: approvedAssets.length,
                NarrationLineCount: scriptLines.length,
            });

            const usedAssetPaths = new Set<string>();
            for (const asset of approvedAssets) {
                const sanitized = SanitizeStageKey(asset.Key);
                const idPrefix = extractAssetIdHexPrefix(asset);
                const stem = idPrefix ? `${sanitized}-${idPrefix}` : sanitized;
                const ext = resolvedExtensions.get(asset)!;
                asset.StagedPath = allocateUniqueStagedPath('assets', stem, ext, usedAssetPaths);
            }

            const usedAudioPaths = new Set<string>();
            for (const line of scriptLines) {
                const sanitized = SanitizeStageKey(line.Key);
                line.StagedPath = allocateUniqueStagedPath('audio', sanitized, 'mp3', usedAudioPaths);
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

    private async resolveFilmBounds(
        spec: VideoGenerationSpec,
        contextUser: UserInfo,
    ): Promise<FilmDurationBounds | undefined> {
        const archetypeName = spec.Archetype?.Name?.trim();
        if (!archetypeName) {
            return undefined;
        }
        await VideoStudioEngine.Instance.Config(false, contextUser, this.ProviderToUse);
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
