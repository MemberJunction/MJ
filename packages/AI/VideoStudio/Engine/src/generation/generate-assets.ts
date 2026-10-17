/**
 * @fileoverview Illustrative image and video asset generation pipeline for Video Studio
 * Pre-Production (`VS-GEN-6`, Plan §3.4, §5.2, §6.2, §13.3).
 *
 * Screens all pending requests in `spec.Assets.Generate` before any spend, resolves brand-kit
 * and approved reference images, invokes `AIImageGenerationRunner` / `AIVideoRunner` under the
 * caller's execution scope, stores output bytes via `StoreFile`, and records full
 * `Provenance: 'Generated'` metadata on `spec.Assets.Approved`.
 *
 * @module @memberjunction/video-studio
 */

import {
    type AIAPIKey,
    type AICredentialScope,
    type MediaInput,
    type VideoKeyframeInput,
} from '@memberjunction/ai';
import {
    AIImageGenerationRunner,
    AIVideoRunner,
    type AIImageGenerationRunParams,
    type AIImageRunResult,
    type AIVideoGenerationRunParams,
    type AIVideoGenerationRunResult,
} from '@memberjunction/ai-prompts';
import { AIEngine } from '@memberjunction/aiengine';
import {
    LogError,
    RunView,
    type IMetadataProvider,
    type IRunViewProvider,
    type UserInfo,
} from '@memberjunction/core';
import { BrandKitEngine } from '@memberjunction/core-entities';
import { EscapeSQLString, IndexByUUID, UUIDsEqual } from '@memberjunction/global';
import { FileStorageEngine } from '@memberjunction/storage';
import type {
    VideoAsset,
    VideoAssetGenerationMetadata,
    VideoAssetGenerationRequest,
    VideoFormat,
    VideoGenerationRequestStatus,
    VideoGenerationSpec,
} from '@memberjunction/video-studio-core';
import { ResolveDeliverableFormats } from '../render/bundle.js';
import {
    DEFAULT_VIDEO_STUDIO_SETTINGS,
    type VideoStudioSettings,
} from '../settings.js';
import { ReadStoredFileWithType, StoreFile } from '../storage.js';
import {
    ResolveGenerationPolicy,
    type ResolvedGenerationPolicy,
} from './generation-policy.js';
import {
    ComposeGenerationPrompt,
    EstimateLoadedGenerationCallCost,
    ResolveRequestedVideoSeconds,
    ScreenGenerationRequest,
    SumRecordedGenerationCost,
    type GenerationBlockCode,
} from './generation-screen.js';

/**
 * Maximum number of reference images passed to a single generation call (`VS-GEN-6`).
 */
export const MAX_GENERATION_REFERENCES = 10;

const IMAGE_FORMAT_TO_MIME: Readonly<Record<string, string>> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
};

const MIME_TO_EXT: Readonly<Record<string, string>> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
};

/**
 * Issue emitted while screening, resolving references, or running a generation request.
 */
export interface GenerationIssue {
    RequestKey: string;
    Code:
        | GenerationBlockCode
        | 'InvalidReferenceSkipped'
        | 'GenerationFailed';
    Severity: 'Warning' | 'Error';
    Message: string;
}

/**
 * Per-request execution summary recorded in the `"Generate Assets"` agent step `OutputData` (no bytes).
 */
export interface GeneratedAssetRequestSummary {
    Key: string;
    Kind: 'Image' | 'Video';
    Status: VideoGenerationRequestStatus;
    BlockedReason?: string;
    ModelID?: string;
    ModelName?: string;
    PromptRunID?: string;
    DurationSeconds?: number;
    Cost?: number;
}

/**
 * Context passed to {@link GenerateRequestedAssets}.
 */
export interface GenerateRequestedAssetsContext {
    ContextUser: UserInfo;
    Provider?: IMetadataProvider;
    StorageAccountID?: string;
    HasStorage?: boolean;
    Settings?: VideoStudioSettings;
    Policy?: ResolvedGenerationPolicy;
    AgentID?: string;
    AgentRunID?: string;
    CompanyID?: string | null;
    CancellationToken?: AbortSignal;
    APIKeys?: AIAPIKey[];
    CredentialScope?: AICredentialScope;
    ImageRunner?: Pick<AIImageGenerationRunner, 'RunImageGeneration'>;
    VideoRunner?: Pick<AIVideoRunner, 'RunGenerateVideo'>;
}

/**
 * Result returned by {@link GenerateRequestedAssets}.
 */
export interface GenerateRequestedAssetsResult {
    Spec: VideoGenerationSpec;
    Issues: GenerationIssue[];
    GeneratedKeys: string[];
    TotalCost: number;
    RequestSummaries: GeneratedAssetRequestSummary[];
}

interface ResolvedReferenceMedia {
    Key: string;
    Data: Buffer;
    MimeType: string;
}

interface PromptRunCostRow {
    ID: string;
    Cost?: number | null;
    TotalCost?: number | null;
}

function cloneSpec<T>(value: T): T {
    if (value === undefined || value === null) {
        return {} as T;
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

function detectImageMimeType(bytes: Buffer, fallbackMime?: string | null): string {
    const cleaned = (fallbackMime ?? '').trim().toLowerCase().split(';')[0].trim();
    if (cleaned.startsWith('image/')) {
        return cleaned === 'image/jpg' ? 'image/jpeg' : cleaned;
    }
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47
    ) {
        return 'image/png';
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }
    if (
        bytes.length >= 12 &&
        bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
        return 'image/webp';
    }
    if (bytes.length >= 6 && bytes.subarray(0, 3).toString('ascii') === 'GIF') {
        return 'image/gif';
    }
    return 'image/png';
}

async function resolveHasStorage(ctx: GenerateRequestedAssetsContext): Promise<boolean> {
    if (typeof ctx.HasStorage === 'boolean') {
        return ctx.HasStorage;
    }
    if (ctx.StorageAccountID?.trim()) {
        return true;
    }
    try {
        await FileStorageEngine.Instance.Config(false, ctx.ContextUser, ctx.Provider);
        return Boolean(FileStorageEngine.Instance.HasStorageAccounts);
    } catch {
        return Boolean(FileStorageEngine.Instance.HasStorageAccounts);
    }
}

async function resolvePromptRunCost(
    promptRunId: string | undefined,
    directCost: number | undefined,
    contextUser: UserInfo,
    provider?: IMetadataProvider,
): Promise<number | undefined> {
    if (typeof directCost === 'number' && Number.isFinite(directCost) && directCost >= 0) {
        return directCost;
    }
    const trimmedId = promptRunId?.trim();
    if (!trimmedId) {
        return undefined;
    }

    try {
        const rv = new RunView(provider as unknown as IRunViewProvider);
        const view = await rv.RunView<PromptRunCostRow>(
            {
                EntityName: 'MJ: AI Prompt Runs',
                ExtraFilter: `ID = '${EscapeSQLString(trimmedId)}'`,
                Fields: ['ID', 'Cost'],
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!view.Success || (view.Results?.length ?? 0) === 0) {
            return undefined;
        }
        const row = view.Results[0];
        const costVal = row.Cost ?? row.TotalCost;
        if (typeof costVal === 'number' && Number.isFinite(costVal) && costVal >= 0) {
            return costVal;
        }
    } catch (err) {
        LogError(
            `Failed to query MJ: AI Prompt Runs for cost of PromptRunID "${trimmedId}": ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    return undefined;
}

/**
 * Estimates the worst-case cost in USD of a single image (`units = 1`, `usageKind = 'Images'`)
 * or video (`units = durationSeconds`, `usageKind = 'Seconds'`) generation call by resolving
 * the carrier prompt (`AIVideoRunner.GENERATIVE_PROMPT_NAME` or
 * `AIImageGenerationRunner.DEFAULT_PROMPT_NAME`) and pricing every Active/Preview bound
 * `PromptModel` via `AIEngineBase.Instance.CalculateModelCost` (`VS-GEN-6`).
 *
 * Fails closed by throwing when the carrier prompt or its `PromptModels` are missing, or when
 * any bound candidate has no valid price (since `NextBestModel` failover can reach any bound
 * candidate). Returns the maximum cost across all bound candidates.
 */
export async function EstimateGenerationCallCost(
    kind: 'Image' | 'Video',
    durationSeconds: number,
    ctx: Pick<GenerateRequestedAssetsContext, 'ContextUser' | 'Provider'>,
): Promise<number> {
    if (!AIEngine.Instance.Loaded) {
        await AIEngine.Instance.Config(false, ctx.ContextUser, ctx.Provider);
    }
    return EstimateLoadedGenerationCallCost(kind, durationSeconds);
}

function resolveRequestAspectRatio(
    request: VideoAssetGenerationRequest,
    spec: Partial<VideoGenerationSpec>,
): VideoFormat {
    if (request.Format) {
        return request.Format;
    }
    if (Array.isArray(spec.Film?.Formats) && spec.Film.Formats.length > 0 && spec.Film.Formats[0]) {
        return spec.Film.Formats[0];
    }
    const deliverableFormats = ResolveDeliverableFormats(spec);
    return deliverableFormats[0] ?? '16:9';
}

function buildSourceString(modelName?: string, modelId?: string): string {
    const label = modelName?.trim() || modelId?.trim() || 'unknown';
    return `Generated by ${label}`;
}

function buildUsageString(request: VideoAssetGenerationRequest): string {
    const purpose = (request.Purpose ?? '').trim();
    if (request.Kind === 'Video' && request.WantAudio !== true) {
        return purpose.length > 0 ? `${purpose} Play muted.` : 'Play muted.';
    }
    return purpose;
}

function buildStoreDescription(params: {
    modelName?: string;
    modelId?: string;
    promptRunId?: string;
    jobId?: string;
    c2pa?: boolean;
}): string {
    const modelLabel = params.modelName?.trim() || params.modelId?.trim() || 'unknown';
    return `AI-generated by ${modelLabel}; AI Prompt Run ${params.promptRunId ?? 'none'}; job ${params.jobId ?? 'none'}; C2PA ${params.c2pa ? 'yes' : 'no'}`;
}

function isFlaggedBrandKitAsset(
    policy: ResolvedGenerationPolicy,
    candidate: { Key?: string; FileID?: string; Name?: string; ID?: string },
): boolean {
    const refs = Array.isArray(policy.ReferenceAssets) ? policy.ReferenceAssets : [];
    const candidateFileId = candidate.FileID?.trim();
    const rawKey = (candidate.Key ?? candidate.Name ?? '').trim();
    const strippedName = rawKey.startsWith('brand:') ? rawKey.slice('brand:'.length).trim() : rawKey;
    const candidateId = candidate.ID?.trim();

    return refs.some((ka) => {
        if (!ka || ka.IsGenerationReference === false) {
            return false;
        }
        const kaFileId = ka.FileID?.trim();
        if (candidateFileId && kaFileId && UUIDsEqual(candidateFileId, kaFileId)) {
            return true;
        }
        const kaName = ka.Name?.trim();
        if (strippedName && kaName && strippedName.toLowerCase() === kaName.toLowerCase()) {
            return true;
        }
        const kaId = ka.ID?.trim();
        if (candidateId && kaId && UUIDsEqual(candidateId, kaId)) {
            return true;
        }
        if (rawKey && kaId && UUIDsEqual(rawKey, kaId)) {
            return true;
        }
        return false;
    });
}

function isKnownUnflaggedBrandKitAsset(
    spec: Partial<VideoGenerationSpec>,
    policy: ResolvedGenerationPolicy,
    candidate: { Key?: string; FileID?: string },
): boolean {
    const rawKey = (candidate.Key ?? '').trim();
    if (rawKey.startsWith('brand:')) {
        return !isFlaggedBrandKitAsset(policy, candidate);
    }
    const brandKitId = spec.BrandKitID?.trim();
    if (!brandKitId) {
        return false;
    }
    const allKitAssets = BrandKitEngine.Instance.GetAssets(brandKitId) ?? [];
    const candidateFileId = candidate.FileID?.trim();
    const matchedKitAsset = allKitAssets.find((ka) => {
        if (!ka) {
            return false;
        }
        if (candidateFileId && ka.FileID && UUIDsEqual(candidateFileId, ka.FileID)) {
            return true;
        }
        const kaName = ka.Name?.trim();
        if (rawKey && kaName && rawKey.toLowerCase() === kaName.toLowerCase()) {
            return true;
        }
        if (rawKey && ka.ID && UUIDsEqual(rawKey, ka.ID)) {
            return true;
        }
        return false;
    });
    if (!matchedKitAsset) {
        return false;
    }
    return matchedKitAsset.IsGenerationReference !== true && !isFlaggedBrandKitAsset(policy, candidate);
}

/**
 * Resolves reference images for a generation request (`VS-GEN-6`):
 * - Approved assets named in `request.ReferenceKeys` (`Provenance !== 'Generated'`, `Kind === 'Image'`),
 *   enforcing the `IsGenerationReference` gate on any brand-kit asset.
 * - Plus `policy.ReferenceAssets` (`IsGenerationReference === true`, `AssetType === 'Image'`), when
 *   the request is an image or explicitly requests references.
 * - Capped at {@link MAX_GENERATION_REFERENCES} (10) and read via {@link ReadStoredFileWithType}.
 */
async function resolveReferencesForRequest(
    request: VideoAssetGenerationRequest,
    spec: VideoGenerationSpec,
    policy: ResolvedGenerationPolicy,
    ctx: GenerateRequestedAssetsContext,
    issues: GenerationIssue[],
): Promise<ResolvedReferenceMedia[]> {
    const approvedAssets = Array.isArray(spec.Assets?.Approved) ? spec.Assets.Approved : [];
    const requestedKeys = Array.isArray(request.ReferenceKeys)
        ? request.ReferenceKeys.map((k) => k?.trim()).filter((k): k is string => Boolean(k))
        : [];

    // Video requests with empty ReferenceKeys have no references (Case 3: TextToVideo).
    if (request.Kind === 'Video' && requestedKeys.length === 0) {
        return [];
    }

    const candidates: Array<{ Key: string; FileID: string }> = [];
    const seenFileIds = new Set<string>();
    const seenKeys = new Set<string>();

    const addCandidate = (key: string, fileId: string): void => {
        const normFileId = fileId.trim().toLowerCase();
        const normKey = key.trim();
        if (!normFileId || !normKey) {
            return;
        }
        if (seenFileIds.has(normFileId) || seenKeys.has(normKey)) {
            return;
        }
        if (candidates.length >= MAX_GENERATION_REFERENCES) {
            return;
        }
        seenFileIds.add(normFileId);
        seenKeys.add(normKey);
        candidates.push({ Key: normKey, FileID: fileId.trim() });
    };

    const flaggedKitRefs = (policy.ReferenceAssets ?? []).filter(
        (ka) => ka && ka.IsGenerationReference !== false,
    );
    const flaggedKitById = IndexByUUID(flaggedKitRefs, (ka) => ka.ID);
    const flaggedKitByName = new Map(
        flaggedKitRefs
            .filter((ka) => Boolean(ka.Name?.trim()))
            .map((ka) => [ka.Name.trim().toLowerCase(), ka]),
    );
    const approvedByFileId = IndexByUUID(
        approvedAssets.filter((a) => Boolean(a && a.FileID?.trim())),
        (a) => a.FileID,
    );

    for (const refKey of requestedKeys) {
        const approvedMatch = approvedAssets.find((a) => a && a.Key?.trim() === refKey);
        if (approvedMatch) {
            if (approvedMatch.Provenance === 'Generated') {
                issues.push({
                    RequestKey: request.Key,
                    Code: 'InvalidReferenceSkipped',
                    Severity: 'Warning',
                    Message: `Reference "${refKey}" has Provenance="Generated" and cannot be used as a reference; skipping.`,
                });
                continue;
            }
            if (approvedMatch.Kind !== 'Image') {
                issues.push({
                    RequestKey: request.Key,
                    Code: 'InvalidReferenceSkipped',
                    Severity: 'Warning',
                    Message: `Reference "${refKey}" has Kind="${approvedMatch.Kind}" (only Image assets may be sent as ReferenceImages); skipping.`,
                });
                continue;
            }
            if (
                approvedMatch.Provenance === 'BrandKit' ||
                isKnownUnflaggedBrandKitAsset(spec, policy, {
                    Key: approvedMatch.Key,
                    FileID: approvedMatch.FileID,
                })
            ) {
                if (
                    !isFlaggedBrandKitAsset(policy, {
                        Key: approvedMatch.Key,
                        FileID: approvedMatch.FileID,
                    })
                ) {
                    issues.push({
                        RequestKey: request.Key,
                        Code: 'InvalidReferenceSkipped',
                        Severity: 'Warning',
                        Message: `Brand-kit asset "${refKey}" has IsGenerationReference=false and is never sent to a generator; skipping.`,
                    });
                    continue;
                }
            }
            if (approvedMatch.FileID?.trim()) {
                addCandidate(refKey, approvedMatch.FileID.trim());
            }
            continue;
        }

        // Check if refKey names a flagged kit asset directly
        const strippedName = refKey.startsWith('brand:') ? refKey.slice('brand:'.length).trim() : refKey;
        const kitRefMatch =
            flaggedKitByName.get(strippedName.toLowerCase()) ?? flaggedKitById.Get(refKey);
        if (kitRefMatch && kitRefMatch.FileID?.trim()) {
            const assetType = (kitRefMatch.AssetType ?? 'Image').trim();
            if (assetType === 'Image') {
                addCandidate(refKey, kitRefMatch.FileID.trim());
            }
            continue;
        }

        issues.push({
            RequestKey: request.Key,
            Code: 'InvalidReferenceSkipped',
            Severity: 'Warning',
            Message: `Reference "${refKey}" is not an approved Image or a flagged brand-kit generation reference; skipping.`,
        });
    }

    // Include policy.ReferenceAssets (keeping only Image and at most 10) when references are requested or for Image requests with a kit policy
    if (requestedKeys.length > 0 && Array.isArray(policy.ReferenceAssets)) {
        for (const ka of policy.ReferenceAssets) {
            if (!ka || ka.IsGenerationReference === false || !ka.FileID?.trim()) {
                continue;
            }
            const assetType = (ka.AssetType ?? 'Image').trim();
            if (assetType !== 'Image') {
                continue;
            }
            const matchingApproved = approvedByFileId.Get(ka.FileID);
            const keyLabel =
                matchingApproved?.Key?.trim() ||
                (ka.Name?.trim() ? `brand:${ka.Name.trim()}` : ka.ID?.trim() || ka.FileID.trim());
            addCandidate(keyLabel, ka.FileID.trim());
        }
    }

    const resolved: ResolvedReferenceMedia[] = [];
    for (const candidate of candidates.slice(0, MAX_GENERATION_REFERENCES)) {
        try {
            const stored = await ReadStoredFileWithType(
                candidate.FileID,
                ctx.ContextUser,
                ctx.Provider,
            );
            const mimeType = detectImageMimeType(stored.Bytes, stored.ContentType);
            resolved.push({
                Key: candidate.Key,
                Data: stored.Bytes,
                MimeType: mimeType,
            });
        } catch (err) {
            issues.push({
                RequestKey: request.Key,
                Code: 'InvalidReferenceSkipped',
                Severity: 'Warning',
                Message: `Failed to read reference "${candidate.Key}" (${candidate.FileID}): ${err instanceof Error ? err.message : String(err)}; skipping.`,
            });
        }
    }

    return resolved;
}

async function resolveKeyframesForRequest(
    request: VideoAssetGenerationRequest,
    spec: VideoGenerationSpec,
    policy: ResolvedGenerationPolicy,
    ctx: GenerateRequestedAssetsContext,
): Promise<{ Keyframes: VideoKeyframeInput[]; KeyframeKeys: string[] }> {
    const rawKeyframes = Array.isArray(request.Keyframes) ? request.Keyframes : [];
    const approvedAssets = Array.isArray(spec.Assets?.Approved) ? spec.Assets.Approved : [];

    const keyframes: VideoKeyframeInput[] = [];
    const keyframeKeys: string[] = [];

    const flaggedKitRefs = (policy.ReferenceAssets ?? []).filter(
        (ka) => ka && ka.IsGenerationReference !== false,
    );
    const flaggedKitById = IndexByUUID(flaggedKitRefs, (ka) => ka.ID);
    const flaggedKitByName = new Map(
        flaggedKitRefs
            .filter((ka) => Boolean(ka.Name?.trim()))
            .map((ka) => [ka.Name.trim().toLowerCase(), ka]),
    );

    for (const kf of rawKeyframes) {
        const assetKey = kf.AssetKey?.trim();
        if (!assetKey) {
            throw new Error(`Keyframe at ${kf.Seconds}s has an empty AssetKey.`);
        }

        const approvedMatch = approvedAssets.find((a) => a && a.Key?.trim() === assetKey);
        if (approvedMatch && approvedMatch.FileID?.trim()) {
            if (approvedMatch.Kind !== 'Image') {
                throw new Error(
                    `Keyframe asset "${assetKey}" in Assets.Approved has Kind="${approvedMatch.Kind}" (must be "Image").`,
                );
            }
            if (
                approvedMatch.Provenance === 'BrandKit' ||
                isKnownUnflaggedBrandKitAsset(spec, policy, {
                    Key: approvedMatch.Key,
                    FileID: approvedMatch.FileID,
                })
            ) {
                if (
                    !isFlaggedBrandKitAsset(policy, {
                        Key: approvedMatch.Key,
                        FileID: approvedMatch.FileID,
                    })
                ) {
                    throw new Error(
                        `Keyframe asset "${assetKey}" is a brand-kit asset with IsGenerationReference=false and cannot be sent to a generator.`,
                    );
                }
            }
            const stored = await ReadStoredFileWithType(
                approvedMatch.FileID.trim(),
                ctx.ContextUser,
                ctx.Provider,
            );
            const mimeType = detectImageMimeType(stored.Bytes, stored.ContentType);
            keyframes.push({
                Seconds: kf.Seconds,
                Image: { Data: stored.Bytes, MimeType: mimeType },
            });
            keyframeKeys.push(assetKey);
            continue;
        }

        const strippedName = assetKey.startsWith('brand:')
            ? assetKey.slice('brand:'.length).trim()
            : assetKey;
        const kitMatch =
            flaggedKitByName.get(strippedName.toLowerCase()) ?? flaggedKitById.Get(assetKey);
        if (kitMatch && kitMatch.FileID?.trim()) {
            const stored = await ReadStoredFileWithType(
                kitMatch.FileID.trim(),
                ctx.ContextUser,
                ctx.Provider,
            );
            const mimeType = detectImageMimeType(stored.Bytes, stored.ContentType);
            keyframes.push({
                Seconds: kf.Seconds,
                Image: { Data: stored.Bytes, MimeType: mimeType },
            });
            keyframeKeys.push(assetKey);
            continue;
        }

        throw new Error(
            `Keyframe asset "${assetKey}" was not found in Assets.Approved or brand-kit generation references.`,
        );
    }

    return { Keyframes: keyframes, KeyframeKeys: keyframeKeys };
}

async function extractGeneratedImageBuffer(
    imageResult: AIImageRunResult,
    cancellationToken?: AbortSignal,
): Promise<{
    Bytes: Buffer;
    MimeType: string;
}> {
    const firstImage = imageResult.ImageResult?.images?.[0];
    if (!firstImage) {
        throw new Error('Image generation returned no images.');
    }

    let bytes: Buffer | undefined;
    if (Buffer.isBuffer(firstImage.data) && firstImage.data.length > 0) {
        bytes = firstImage.data;
    } else if (typeof firstImage.base64 === 'string' && firstImage.base64.trim().length > 0) {
        bytes = Buffer.from(firstImage.base64.trim(), 'base64');
    } else if (typeof firstImage.url === 'string' && firstImage.url.trim().length > 0) {
        const response = await fetch(firstImage.url.trim(), {
            ...(cancellationToken ? { signal: cancellationToken } : {}),
        });
        if (!response.ok) {
            throw new Error(
                `Failed to fetch generated image URL (${response.status} ${response.statusText}).`,
            );
        }
        bytes = Buffer.from(await response.arrayBuffer());
    }

    if (!bytes || bytes.length === 0) {
        throw new Error('Image generation returned empty image bytes.');
    }

    const fmtLower = (firstImage.format ?? 'png').toLowerCase();
    const mimeType = IMAGE_FORMAT_TO_MIME[fmtLower] ?? detectImageMimeType(bytes);

    return {
        Bytes: bytes,
        MimeType: mimeType,
    };
}

function upsertApprovedAsset(approved: VideoAsset[], asset: VideoAsset): void {
    const existingIdx = approved.findIndex((a) => a && a.Key === asset.Key);
    if (existingIdx >= 0) {
        approved[existingIdx] = asset;
    } else {
        approved.push(asset);
    }
}

function markMatchingRequirementsSatisfied(
    spec: VideoGenerationSpec,
    assetKey: string,
): void {
    const required = Array.isArray(spec.Assets?.Required) ? spec.Assets.Required : [];
    for (const req of required) {
        if (
            req &&
            (req.Key === assetKey || req.SatisfiedByAssetKey === assetKey) &&
            req.AllowGenerated === true
        ) {
            req.SatisfiedByAssetKey = assetKey;
        }
    }
}

async function runAndStoreImageAsset(params: {
    assetKey: string;
    prompt: string;
    usage: string;
    aspectRatio: VideoFormat;
    references: readonly ResolvedReferenceMedia[];
    ctx: GenerateRequestedAssetsContext;
    imageRunner: Pick<AIImageGenerationRunner, 'RunImageGeneration'>;
}): Promise<{
    Asset: VideoAsset;
    Bytes: Buffer;
    MimeType: string;
    Cost?: number;
    ModelID: string;
    ModelName?: string;
    PromptRunID: string;
}> {
    const { assetKey, prompt, usage, aspectRatio, references, ctx, imageRunner } = params;

    const refInputs: MediaInput[] = references.map((r) => ({
        Data: r.Data,
        MimeType: r.MimeType,
    }));

    const runParams: AIImageGenerationRunParams = {
        prompt,
        aspectRatio,
        ...(refInputs.length > 0 ? { ReferenceImages: refInputs } : {}),
        ContextUser: ctx.ContextUser,
        ...(ctx.APIKeys ? { APIKeys: ctx.APIKeys } : {}),
        ...(ctx.CredentialScope ? { CredentialScope: ctx.CredentialScope } : {}),
        ...(ctx.AgentID ? { AgentID: ctx.AgentID } : {}),
        ...(ctx.AgentRunID ? { AgentRunID: ctx.AgentRunID } : {}),
        ...(ctx.CancellationToken ? { CancellationToken: ctx.CancellationToken } : {}),
    };

    const runResult = await imageRunner.RunImageGeneration(runParams);
    if (!runResult.Success) {
        throw new Error(runResult.ErrorMessage || 'AIImageGenerationRunner failed.');
    }

    const extracted = await extractGeneratedImageBuffer(runResult, ctx.CancellationToken);
    const ext = MIME_TO_EXT[extracted.MimeType] ?? 'png';
    const modelId = runResult.ModelID?.trim() || 'unknown';
    const modelName = runResult.ModelName?.trim() || undefined;
    const promptRunId = runResult.PromptRunID?.trim() || '';

    const fileId = await StoreFile({
        Content: extracted.Bytes,
        FileName: `generated-${assetKey}.${ext}`,
        MimeType: extracted.MimeType,
        Description: buildStoreDescription({
            modelName,
            modelId,
            promptRunId: promptRunId || undefined,
        }),
        ContextUser: ctx.ContextUser,
        StorageAccountID: ctx.StorageAccountID,
        Provider: ctx.Provider,
    });
    if (!fileId) {
        throw new Error(`StoreFile returned undefined for generated-${assetKey}.${ext}.`);
    }

    const cost = await resolvePromptRunCost(
        promptRunId || undefined,
        undefined,
        ctx.ContextUser,
        ctx.Provider,
    );

    const generationMeta: VideoAssetGenerationMetadata = {
        ModelID: modelId,
        PromptRunID: promptRunId,
        Prompt: prompt,
        ReferenceKeys: references.map((r) => r.Key),
        ...(cost !== undefined ? { Cost: cost } : {}),
    };

    const asset: VideoAsset = {
        Key: assetKey,
        Kind: 'Image',
        FileID: fileId,
        Source: buildSourceString(modelName, modelId),
        Provenance: 'Generated',
        Usage: usage,
        MustUse: false,
        Generation: generationMeta,
    };

    return {
        Asset: asset,
        Bytes: extracted.Bytes,
        MimeType: extracted.MimeType,
        Cost: cost,
        ModelID: modelId,
        ModelName: modelName,
        PromptRunID: promptRunId,
    };
}

/**
 * Screens and executes pending requests in `spec.Assets.Generate` (`VS-GEN-6`):
 * 1. **Screen first:** Evaluates all non-`Generated` requests in spec order before any runner call.
 *    If any request is blocked, marks the blocked request(s) `Blocked` with
 *    `BlockedReason = '<Code>: <Reason>'`, leaves the remaining non-generated requests `Pending`,
 *    and returns without invoking either runner.
 * 2. **Per-request execution:** Estimates the call cost from `MJ: AI Model Costs` via `AIEngine.Instance`
 *    and checks `spendSoFar + estimatedCost > MaxGenerationCostPerRun` before each runner invocation,
 *    builds the prompt and filtered reference list, invokes `AIImageGenerationRunner` / `AIVideoRunner`,
 *    stores bytes via `StoreFile`, and records the `Generated` asset on `spec.Assets.Approved`.
 */
export async function GenerateRequestedAssets(
    spec: VideoGenerationSpec,
    ctx: GenerateRequestedAssetsContext,
): Promise<GenerateRequestedAssetsResult> {
    const workingSpec = cloneSpec(spec);
    const requests = Array.isArray(workingSpec.Assets?.Generate)
        ? workingSpec.Assets.Generate
        : [];
    const issues: GenerationIssue[] = [];
    const generatedKeys: string[] = [];
    const requestSummaries: GeneratedAssetRequestSummary[] = [];

    if (requests.length === 0) {
        return {
            Spec: workingSpec,
            Issues: issues,
            GeneratedKeys: generatedKeys,
            TotalCost: 0,
            RequestSummaries: requestSummaries,
        };
    }

    if (!workingSpec.Assets) {
        workingSpec.Assets = {
            Approved: [],
            Required: [],
            Generate: requests,
            NeverInvent: [],
        };
    }
    if (!Array.isArray(workingSpec.Assets.Approved)) {
        workingSpec.Assets.Approved = [];
    }

    const settings = ctx.Settings ?? DEFAULT_VIDEO_STUDIO_SETTINGS;
    const companyId = ctx.CompanyID !== undefined ? ctx.CompanyID : (workingSpec.CompanyID ?? null);
    const policy = ctx.Policy ?? ResolveGenerationPolicy(workingSpec, companyId);
    const hasStorage = await resolveHasStorage(ctx);

    const hasUncostedGeneratedAsset = workingSpec.Assets.Approved.some(
        (asset) =>
            asset &&
            asset.Provenance === 'Generated' &&
            (asset.Kind === 'Image' || asset.Kind === 'Video') &&
            !(
                typeof asset.Generation?.Cost === 'number' &&
                Number.isFinite(asset.Generation.Cost) &&
                asset.Generation.Cost >= 0
            ),
    );
    if (hasUncostedGeneratedAsset && !AIEngine.Instance.Loaded) {
        await AIEngine.Instance.Config(false, ctx.ContextUser, ctx.Provider);
    }

    let spendSoFar = SumRecordedGenerationCost(workingSpec);
    let passVideoSeconds = 0;
    let anyBlockedInPreScreen = false;

    // Step 1: Screen all non-Generated requests FIRST before any spend.
    for (const request of requests) {
        if (!request || !request.Key?.trim()) {
            continue;
        }
        const existingApproved = workingSpec.Assets.Approved.find(
            (a) => a && a.Key === request.Key && Boolean(a.FileID?.trim()),
        );
        if (request.Status === 'Generated' && existingApproved) {
            continue;
        }

        const screenResult = ScreenGenerationRequest(
            request,
            workingSpec,
            policy,
            settings,
            spendSoFar,
            hasStorage,
            passVideoSeconds,
        );

        if (!screenResult.Allowed) {
            const blockedReason = `${screenResult.Code}: ${screenResult.Reason}`;
            request.Status = 'Blocked';
            request.BlockedReason = blockedReason;
            anyBlockedInPreScreen = true;
            issues.push({
                RequestKey: request.Key,
                Code: screenResult.Code!,
                Severity: 'Error',
                Message: blockedReason,
            });
        } else {
            request.Status = 'Pending';
            delete request.BlockedReason;
            if (request.Kind === 'Video') {
                passVideoSeconds += ResolveRequestedVideoSeconds(request);
            }
        }
    }

    if (anyBlockedInPreScreen) {
        for (const request of requests) {
            if (!request || !request.Key?.trim()) {
                continue;
            }
            requestSummaries.push({
                Key: request.Key,
                Kind: request.Kind,
                Status: request.Status ?? 'Pending',
                BlockedReason: request.BlockedReason,
            });
        }
        return {
            Spec: workingSpec,
            Issues: issues,
            GeneratedKeys: generatedKeys,
            TotalCost: 0,
            RequestSummaries: requestSummaries,
        };
    }

    const imageRunner = ctx.ImageRunner ?? new AIImageGenerationRunner();
    const videoRunner = ctx.VideoRunner ?? new AIVideoRunner();
    let passSpend = 0;

    const maxCostCap =
        typeof policy.MaxGenerationCostPerRun === 'number' &&
        Number.isFinite(policy.MaxGenerationCostPerRun)
            ? policy.MaxGenerationCostPerRun
            : undefined;

    const wouldExceedSpendCap = (estimatedCallCost: number): boolean => {
        if (maxCostCap === undefined) {
            return false;
        }
        return spendSoFar >= maxCostCap || spendSoFar + estimatedCallCost > maxCostCap;
    };

    const blockRemainingWithSpendCap = (
        startIndex: number,
        estimatedCallCost: number,
        currentRequestStillCost?: number,
    ): void => {
        const capVal = maxCostCap ?? 0;
        const projected = spendSoFar + estimatedCallCost;
        const spendReason =
            spendSoFar >= capVal
                ? `SpendCapReached: Generation spend so far ($${spendSoFar.toFixed(2)}) has reached or exceeded MaxGenerationCostPerRun ($${capVal.toFixed(2)}).`
                : `SpendCapReached: Generation spend so far ($${spendSoFar.toFixed(2)}) plus estimated call cost ($${estimatedCallCost.toFixed(2)} = $${projected.toFixed(2)}) exceeds MaxGenerationCostPerRun ($${capVal.toFixed(2)}).`;
        for (let j = startIndex; j < requests.length; j += 1) {
            const rem = requests[j];
            if (!rem || !rem.Key?.trim() || rem.Status === 'Generated') {
                continue;
            }
            rem.Status = 'Blocked';
            rem.BlockedReason = spendReason;
            issues.push({
                RequestKey: rem.Key,
                Code: 'SpendCapReached',
                Severity: 'Error',
                Message: spendReason,
            });
            requestSummaries.push({
                Key: rem.Key,
                Kind: rem.Kind,
                Status: 'Blocked',
                BlockedReason: spendReason,
                ...(j === startIndex && currentRequestStillCost !== undefined
                    ? { Cost: currentRequestStillCost }
                    : {}),
            });
        }
    };

    // Step 2: Execute each Pending request in spec order.
    for (let i = 0; i < requests.length; i += 1) {
        const request = requests[i];
        if (!request || !request.Key?.trim()) {
            continue;
        }

        const existingApproved = workingSpec.Assets.Approved.find(
            (a) => a && a.Key === request.Key && Boolean(a.FileID?.trim()),
        );
        if (request.Status === 'Generated' && existingApproved) {
            requestSummaries.push({
                Key: request.Key,
                Kind: request.Kind,
                Status: 'Generated',
                ModelID: existingApproved.Generation?.ModelID,
                PromptRunID: existingApproved.Generation?.PromptRunID,
                DurationSeconds: existingApproved.Generation?.DurationSeconds,
                Cost: existingApproved.Generation?.Cost,
            });
            continue;
        }

        // Check if spendSoFar has already reached MaxGenerationCostPerRun before starting this request
        if (maxCostCap !== undefined && spendSoFar >= maxCostCap) {
            blockRemainingWithSpendCap(i, 0);
            break;
        }

        const aspectRatio = resolveRequestAspectRatio(request, workingSpec);
        const composedPrompt = ComposeGenerationPrompt(request, policy);
        const usage = buildUsageString(request);

        if (request.Kind === 'Image') {
            let estimatedImageCost: number;
            try {
                estimatedImageCost = await EstimateGenerationCallCost('Image', 1, ctx);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                const failedReason = `GenerationFailed: ${errMsg}`;
                request.Status = 'Blocked';
                request.BlockedReason = failedReason;
                issues.push({
                    RequestKey: request.Key,
                    Code: 'GenerationFailed',
                    Severity: 'Error',
                    Message: failedReason,
                });
                requestSummaries.push({
                    Key: request.Key,
                    Kind: 'Image',
                    Status: 'Blocked',
                    BlockedReason: failedReason,
                });
                continue;
            }

            if (wouldExceedSpendCap(estimatedImageCost)) {
                blockRemainingWithSpendCap(i, estimatedImageCost);
                break;
            }

            const resolvedRefs = await resolveReferencesForRequest(
                request,
                workingSpec,
                policy,
                ctx,
                issues,
            );
            try {
                const imgOutcome = await runAndStoreImageAsset({
                    assetKey: request.Key,
                    prompt: composedPrompt,
                    usage,
                    aspectRatio,
                    references: resolvedRefs,
                    ctx,
                    imageRunner,
                });

                upsertApprovedAsset(workingSpec.Assets.Approved, imgOutcome.Asset);
                markMatchingRequirementsSatisfied(workingSpec, request.Key);
                request.Status = 'Generated';
                delete request.BlockedReason;

                if (typeof imgOutcome.Cost === 'number') {
                    spendSoFar += imgOutcome.Cost;
                    passSpend += imgOutcome.Cost;
                } else {
                    spendSoFar += estimatedImageCost;
                }
                generatedKeys.push(request.Key);
                requestSummaries.push({
                    Key: request.Key,
                    Kind: 'Image',
                    Status: 'Generated',
                    ModelID: imgOutcome.ModelID,
                    ModelName: imgOutcome.ModelName,
                    PromptRunID: imgOutcome.PromptRunID,
                    Cost: imgOutcome.Cost,
                });
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                const failedReason = `GenerationFailed: ${errMsg}`;
                request.Status = 'Blocked';
                request.BlockedReason = failedReason;
                issues.push({
                    RequestKey: request.Key,
                    Code: 'GenerationFailed',
                    Severity: 'Error',
                    Message: failedReason,
                });
                requestSummaries.push({
                    Key: request.Key,
                    Kind: 'Image',
                    Status: 'Blocked',
                    BlockedReason: failedReason,
                });
            }
            continue;
        }

        // Video generation: three cases
        const durationSeconds = ResolveRequestedVideoSeconds(request);
        const hasExplicitKeyframes =
            Array.isArray(request.Keyframes) && request.Keyframes.length > 0;
        let videoMode: 'TextToVideo' | 'ImageToVideo' = 'TextToVideo';
        let videoKeyframes: VideoKeyframeInput[] | undefined;
        let recordedReferenceKeys: string[] = [];
        let stillCost: number | undefined;
        let estimatedVideoCost: number | undefined;

        if (hasExplicitKeyframes) {
            try {
                const resolvedKf = await resolveKeyframesForRequest(
                    request,
                    workingSpec,
                    policy,
                    ctx,
                );
                videoMode = 'ImageToVideo';
                videoKeyframes = resolvedKf.Keyframes;
                recordedReferenceKeys = resolvedKf.KeyframeKeys;
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                const failedReason = `GenerationFailed: ${errMsg}`;
                request.Status = 'Blocked';
                request.BlockedReason = failedReason;
                issues.push({
                    RequestKey: request.Key,
                    Code: 'GenerationFailed',
                    Severity: 'Error',
                    Message: failedReason,
                });
                requestSummaries.push({
                    Key: request.Key,
                    Kind: 'Video',
                    Status: 'Blocked',
                    BlockedReason: failedReason,
                });
                continue;
            }
        } else {
            const resolvedRefs = await resolveReferencesForRequest(
                request,
                workingSpec,
                policy,
                ctx,
                issues,
            );
            if (resolvedRefs.length > 0) {
                // Case 2: Pre-price both the anchor still and the video clip before spending on <key>-still
                let estimatedStillCost: number;
                try {
                    estimatedStillCost = await EstimateGenerationCallCost('Image', 1, ctx);
                    estimatedVideoCost = await EstimateGenerationCallCost('Video', durationSeconds, ctx);
                } catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    const failedReason = `GenerationFailed: ${errMsg}`;
                    request.Status = 'Blocked';
                    request.BlockedReason = failedReason;
                    issues.push({
                        RequestKey: request.Key,
                        Code: 'GenerationFailed',
                        Severity: 'Error',
                        Message: failedReason,
                    });
                    requestSummaries.push({
                        Key: request.Key,
                        Kind: 'Video',
                        Status: 'Blocked',
                        BlockedReason: failedReason,
                    });
                    continue;
                }

                const combinedCase2EstimatedCost = estimatedStillCost + estimatedVideoCost;
                if (wouldExceedSpendCap(combinedCase2EstimatedCost)) {
                    blockRemainingWithSpendCap(i, combinedCase2EstimatedCost);
                    break;
                }

                const stillKey = `${request.Key}-still`;
                try {
                    const stillOutcome = await runAndStoreImageAsset({
                        assetKey: stillKey,
                        prompt: composedPrompt,
                        usage: request.Purpose ?? '',
                        aspectRatio,
                        references: resolvedRefs,
                        ctx,
                        imageRunner,
                    });

                    upsertApprovedAsset(workingSpec.Assets.Approved, stillOutcome.Asset);
                    if (typeof stillOutcome.Cost === 'number') {
                        spendSoFar += stillOutcome.Cost;
                        passSpend += stillOutcome.Cost;
                        stillCost = stillOutcome.Cost;
                    } else {
                        spendSoFar += estimatedStillCost;
                    }
                    generatedKeys.push(stillKey);

                    videoMode = 'ImageToVideo';
                    videoKeyframes = [
                        {
                            Seconds: 0,
                            Image: {
                                Data: stillOutcome.Bytes,
                                MimeType: stillOutcome.MimeType,
                            },
                        },
                    ];
                    recordedReferenceKeys = [stillKey];
                } catch (err) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    const failedReason = `GenerationFailed: ${errMsg}`;
                    request.Status = 'Blocked';
                    request.BlockedReason = failedReason;
                    issues.push({
                        RequestKey: request.Key,
                        Code: 'GenerationFailed',
                        Severity: 'Error',
                        Message: failedReason,
                    });
                    requestSummaries.push({
                        Key: request.Key,
                        Kind: 'Video',
                        Status: 'Blocked',
                        BlockedReason: failedReason,
                    });
                    continue;
                }
            }
        }

        // Pre-call spend estimate for the video generation call itself (if not already priced in Case 2)
        if (estimatedVideoCost === undefined) {
            try {
                estimatedVideoCost = await EstimateGenerationCallCost('Video', durationSeconds, ctx);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                const failedReason = `GenerationFailed: ${errMsg}`;
                request.Status = 'Blocked';
                request.BlockedReason = failedReason;
                issues.push({
                    RequestKey: request.Key,
                    Code: 'GenerationFailed',
                    Severity: 'Error',
                    Message: failedReason,
                });
                requestSummaries.push({
                    Key: request.Key,
                    Kind: 'Video',
                    Status: 'Blocked',
                    BlockedReason: failedReason,
                    Cost: stillCost,
                });
                continue;
            }
        }

        if (wouldExceedSpendCap(estimatedVideoCost)) {
            blockRemainingWithSpendCap(i, estimatedVideoCost, stillCost);
            break;
        }

        const videoRunParams: AIVideoGenerationRunParams = {
            Prompt: composedPrompt,
            Mode: videoMode,
            DurationSeconds: durationSeconds,
            AspectRatio: aspectRatio,
            Quality: settings.GenerationQuality,
            WantAudio: request.WantAudio === true,
            ...(videoKeyframes && videoKeyframes.length > 0 ? { Keyframes: videoKeyframes } : {}),
            ContextUser: ctx.ContextUser,
            ...(ctx.APIKeys ? { APIKeys: ctx.APIKeys } : {}),
            ...(ctx.CredentialScope ? { CredentialScope: ctx.CredentialScope } : {}),
            ...(ctx.AgentID ? { AgentID: ctx.AgentID } : {}),
            ...(ctx.AgentRunID ? { AgentRunID: ctx.AgentRunID } : {}),
            ...(ctx.CancellationToken ? { CancellationToken: ctx.CancellationToken } : {}),
        };

        try {
            const videoResult: AIVideoGenerationRunResult =
                await videoRunner.RunGenerateVideo(videoRunParams);
            if (!videoResult.Success || !videoResult.Video?.Data?.length) {
                throw new Error(
                    videoResult.ErrorMessage || 'AIVideoRunner returned no video bytes.',
                );
            }

            const videoMime =
                videoResult.Video.MimeType?.trim().toLowerCase() || 'video/mp4';
            const ext = MIME_TO_EXT[videoMime] ?? 'mp4';
            const modelId = videoResult.ModelID?.trim() || 'unknown';
            const modelName = videoResult.ModelName?.trim() || undefined;
            const promptRunId = videoResult.PromptRunID?.trim() || '';

            const fileId = await StoreFile({
                Content: videoResult.Video.Data,
                FileName: `generated-${request.Key}.${ext}`,
                MimeType: videoMime,
                Description: buildStoreDescription({
                    modelName,
                    modelId,
                    promptRunId: promptRunId || undefined,
                    jobId: videoResult.JobID,
                    c2pa: videoResult.C2PA,
                }),
                ContextUser: ctx.ContextUser,
                StorageAccountID: ctx.StorageAccountID,
                Provider: ctx.Provider,
            });
            if (!fileId) {
                throw new Error(`StoreFile returned undefined for generated-${request.Key}.${ext}.`);
            }

            const resolvedDuration =
                typeof videoResult.Video.DurationSeconds === 'number' &&
                videoResult.Video.DurationSeconds > 0
                    ? videoResult.Video.DurationSeconds
                    : durationSeconds;

            const videoCost = await resolvePromptRunCost(
                promptRunId || undefined,
                videoResult.Cost,
                ctx.ContextUser,
                ctx.Provider,
            );

            const generationMeta: VideoAssetGenerationMetadata = {
                ModelID: modelId,
                PromptRunID: promptRunId,
                Prompt: composedPrompt,
                ReferenceKeys: recordedReferenceKeys,
                DurationSeconds: resolvedDuration,
                ...(videoCost !== undefined ? { Cost: videoCost } : {}),
                ...(videoResult.C2PA !== undefined ? { C2PA: videoResult.C2PA } : {}),
            };

            const videoAsset: VideoAsset = {
                Key: request.Key,
                Kind: 'Video',
                FileID: fileId,
                Source: buildSourceString(modelName, modelId),
                Provenance: 'Generated',
                Usage: usage,
                MustUse: false,
                Generation: generationMeta,
            };

            upsertApprovedAsset(workingSpec.Assets.Approved, videoAsset);
            markMatchingRequirementsSatisfied(workingSpec, request.Key);
            request.Status = 'Generated';
            delete request.BlockedReason;

            if (typeof videoCost === 'number') {
                spendSoFar += videoCost;
                passSpend += videoCost;
            } else {
                spendSoFar += estimatedVideoCost;
            }
            generatedKeys.push(request.Key);

            const totalRequestCost =
                videoCost !== undefined || stillCost !== undefined
                    ? (videoCost ?? 0) + (stillCost ?? 0)
                    : undefined;

            requestSummaries.push({
                Key: request.Key,
                Kind: 'Video',
                Status: 'Generated',
                ModelID: modelId,
                ModelName: modelName,
                PromptRunID: promptRunId || undefined,
                DurationSeconds: resolvedDuration,
                Cost: totalRequestCost,
            });
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const failedReason = `GenerationFailed: ${errMsg}`;
            request.Status = 'Blocked';
            request.BlockedReason = failedReason;
            issues.push({
                RequestKey: request.Key,
                Code: 'GenerationFailed',
                Severity: 'Error',
                Message: failedReason,
            });
            requestSummaries.push({
                Key: request.Key,
                Kind: 'Video',
                Status: 'Blocked',
                BlockedReason: failedReason,
                Cost: stillCost,
            });
        }
    }

    return {
        Spec: workingSpec,
        Issues: issues,
        GeneratedKeys: generatedKeys,
        TotalCost: passSpend,
        RequestSummaries: requestSummaries,
    };
}
