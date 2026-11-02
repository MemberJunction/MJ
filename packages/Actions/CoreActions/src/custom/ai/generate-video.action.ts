import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import {
    MediaInput,
    VideoKeyframeInput,
    VideoGenerationMode,
    VideoGenerationQuality,
} from "@memberjunction/ai";
import { MJAIModelEntityExtended, MediaOutput } from "@memberjunction/ai-core-plus";
import { AIEngineBase } from "@memberjunction/ai-engine-base";
import {
    AIMediaRunOptions,
    AIVideoGenerationRunParams,
    AIVideoGenerationRunResult,
    AIVideoRunner,
} from "@memberjunction/ai-prompts";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import { JSONParamHelper } from "../utilities/json-param-helper";
import {
    BuildImageGenerationAPIKeys,
    ImageGenerationKeySource,
    InferenceKeySources,
} from "./generate-image.action";

const VALID_MODES: readonly VideoGenerationMode[] = [
    'TextToVideo',
    'ImageToVideo',
    'Continuation',
    'VideoToVideo',
];

const VALID_QUALITIES: readonly VideoGenerationQuality[] = [
    'draft',
    'standard',
    'high',
];

const ASPECT_RATIO_PATTERN = /^[1-9]\d*:[1-9]\d*$/;

/** Keyframe parameter item before its `FileID` is resolved from storage. */
interface KeyframeFileSpec {
    Seconds: number;
    FileID: string;
}

/** Validated action inputs before storage reads or runner execution. */
interface ValidatedVideoActionInputs {
    Prompt: string;
    Mode: VideoGenerationMode;
    DurationSeconds: number;
    AspectRatio: string;
    Quality: VideoGenerationQuality;
    WantAudio: boolean;
    ReferenceImageFileIDs?: string[];
    KeyframeSpecs?: KeyframeFileSpec[];
    SourceVideoFileID?: string;
    Model?: string;
}

/** Resolved reference media buffers ready to pass to `AIVideoRunner`. */
interface LoadedVideoReferences {
    ReferenceImages?: MediaInput[];
    Keyframes?: VideoKeyframeInput[];
    SourceVideo?: MediaInput;
}

/** Provenance metadata recorded on the stored file description, `MediaOutput.metadata`, and the `Provenance` output parameter. */
export interface GeneratedVideoProvenance {
    Provenance: 'Generated';
    ModelID: string;
    ModelName: string;
    PromptRunID?: string;
    JobID?: string;
    Prompt: string;
    DurationSeconds: number;
    C2PA?: boolean;
    Cost?: number;
}

class InvalidVideoActionParamsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidVideoActionParamsError';
    }
}

/**
 * Action that generates a single raw AI video clip via {@link AIVideoRunner} with no multi-shot
 * composition, captions, narration, or audio mixing (for composed multi-shot productions, use
 * Video Studio).
 *
 * Reads reference images, keyframes, and source videos from `MJ: Files` as the calling user
 * (D20 data boundary), executes `AIVideoRunner.RunGenerateVideo`, stores the resulting clip
 * via `saveToMJStorage` with provenance metadata, and falls back to inline base64 delivery
 * (`VIDEO_GENERATED_INLINE`) if storage fails so a paid clip is never dropped.
 */
@RegisterClass(BaseAction, "Generate Video")
export class GenerateVideoAction extends BaseFileHandlerAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const rawPrompt = this.getParamValue(params, 'prompt');
            if (rawPrompt === undefined || rawPrompt === null || typeof rawPrompt !== 'string' || rawPrompt.trim().length === 0) {
                return {
                    Success: false,
                    Message: "Prompt parameter is required",
                    ResultCode: "MISSING_PROMPT",
                };
            }

            let inputs: ValidatedVideoActionInputs;
            try {
                inputs = this.validateInputs(params, rawPrompt);
            } catch (err) {
                if (err instanceof InvalidVideoActionParamsError) {
                    return {
                        Success: false,
                        Message: err.message,
                        ResultCode: "INVALID_PARAMS",
                    };
                }
                throw err;
            }

            let pinnedModel: MJAIModelEntityExtended | undefined;
            let runOptions: AIMediaRunOptions;
            try {
                const prepared = await this.prepareVideoRun(params, inputs.Model);
                pinnedModel = prepared.PinnedModel;
                runOptions = prepared.RunOptions;
            } catch (err) {
                if (err instanceof InvalidVideoActionParamsError) {
                    return {
                        Success: false,
                        Message: err.message,
                        ResultCode: "INVALID_PARAMS",
                    };
                }
                throw err;
            }

            let references: LoadedVideoReferences;
            try {
                references = await this.loadReferences(params, inputs);
            } catch (err) {
                return {
                    Success: false,
                    Message: `Reference file is not readable: ${err instanceof Error ? err.message : String(err)}`,
                    ResultCode: "REFERENCE_NOT_READABLE",
                };
            }

            const runParams: AIVideoGenerationRunParams = {
                ...runOptions,
                Prompt: inputs.Prompt,
                Mode: inputs.Mode,
                DurationSeconds: inputs.DurationSeconds,
                AspectRatio: inputs.AspectRatio,
                Quality: inputs.Quality,
                WantAudio: inputs.WantAudio,
                ...(references.ReferenceImages ? { ReferenceImages: references.ReferenceImages } : {}),
                ...(references.Keyframes ? { Keyframes: references.Keyframes } : {}),
                ...(references.SourceVideo ? { SourceVideo: references.SourceVideo } : {}),
            };

            const runResult = await new AIVideoRunner().RunGenerateVideo(runParams);
            if (!runResult.Success || !runResult.Video) {
                return {
                    Success: false,
                    Message: `Video generation failed: ${runResult.ErrorMessage || 'Unknown error'}`,
                    ResultCode: "GENERATION_FAILED",
                };
            }

            return await this.storeAndFormatResult(params, inputs.Prompt, runResult, pinnedModel);
        } catch (error) {
            return {
                Success: false,
                Message: `Generate video failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "ACTION_FAILED",
            };
        }
    }

    /** Validates all scalar and JSON parameters before any storage access or model spend. */
    private validateInputs(params: RunActionParams, prompt: string): ValidatedVideoActionInputs {
        const mode = this.parseMode(this.getParamValue(params, 'mode'));
        const durationSeconds = this.parseDurationSeconds(this.getParamValue(params, 'durationseconds'));
        const aspectRatio = this.parseAspectRatio(this.getParamValue(params, 'aspectratio'));
        const quality = this.parseQuality(this.getParamValue(params, 'quality'));
        const wantAudio = this.parseWantAudio(this.getParamValue(params, 'wantaudio'));
        const referenceImageFileIDs = this.parseReferenceImageFileIDs(params);
        const keyframeSpecs = this.parseKeyframes(params);
        const sourceVideoFileID = this.parseOptionalStringParam(this.getParamValue(params, 'sourcevideofileid'), 'SourceVideoFileID');
        const model = this.parseOptionalStringParam(this.getParamValue(params, 'model'), 'Model');

        return {
            Prompt: prompt,
            Mode: mode,
            DurationSeconds: durationSeconds,
            AspectRatio: aspectRatio,
            Quality: quality,
            WantAudio: wantAudio,
            ReferenceImageFileIDs: referenceImageFileIDs,
            KeyframeSpecs: keyframeSpecs,
            SourceVideoFileID: sourceVideoFileID,
            Model: model,
        };
    }

    private parseMode(raw: unknown): VideoGenerationMode {
        if (raw === undefined || raw === null || raw === '') {
            return 'TextToVideo';
        }
        if (typeof raw === 'string' && (VALID_MODES as readonly string[]).includes(raw)) {
            return raw as VideoGenerationMode;
        }
        throw new InvalidVideoActionParamsError(
            `Invalid Mode '${String(raw)}'. Expected one of: ${VALID_MODES.join(', ')}`
        );
    }

    private parseDurationSeconds(raw: unknown): number {
        if (raw === undefined || raw === null || raw === '') {
            return 5;
        }
        if (typeof raw === 'boolean' || (typeof raw === 'string' && raw.trim().length === 0)) {
            throw new InvalidVideoActionParamsError(`Invalid DurationSeconds '${String(raw)}': must be a positive number`);
        }
        const num = Number(raw);
        if (!Number.isFinite(num) || num <= 0) {
            throw new InvalidVideoActionParamsError(`Invalid DurationSeconds '${String(raw)}': must be a positive number`);
        }
        return num;
    }

    private parseAspectRatio(raw: unknown): string {
        if (raw === undefined || raw === null || raw === '') {
            return '16:9';
        }
        if (typeof raw === 'string' && ASPECT_RATIO_PATTERN.test(raw.trim())) {
            return raw.trim();
        }
        throw new InvalidVideoActionParamsError(`Invalid AspectRatio '${String(raw)}': expected W:H format such as '16:9'`);
    }

    private parseQuality(raw: unknown): VideoGenerationQuality {
        if (raw === undefined || raw === null || raw === '') {
            return 'standard';
        }
        if (typeof raw === 'string' && (VALID_QUALITIES as readonly string[]).includes(raw)) {
            return raw as VideoGenerationQuality;
        }
        throw new InvalidVideoActionParamsError(
            `Invalid Quality '${String(raw)}'. Expected one of: ${VALID_QUALITIES.join(', ')}`
        );
    }

    private parseWantAudio(raw: unknown): boolean {
        if (raw === undefined || raw === null || raw === '') {
            return false;
        }
        if (typeof raw === 'boolean') {
            return raw;
        }
        if (typeof raw === 'string') {
            const normalized = raw.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1') return true;
            if (normalized === 'false' || normalized === '0') return false;
        }
        throw new InvalidVideoActionParamsError(`Invalid WantAudio '${String(raw)}': expected a boolean`);
    }

    private parseReferenceImageFileIDs(params: RunActionParams): string[] | undefined {
        let raw: unknown;
        try {
            raw = JSONParamHelper.GetJSONParam(params, 'ReferenceImageFileIDs');
        } catch (err) {
            throw new InvalidVideoActionParamsError(
                `Invalid ReferenceImageFileIDs JSON: ${err instanceof Error ? err.message : String(err)}`
            );
        }
        if (raw === undefined || raw === null || raw === '') {
            return undefined;
        }
        let parsed: unknown = raw;
        if (typeof raw === 'string') {
            try {
                parsed = JSON.parse(raw);
            } catch (err) {
                throw new InvalidVideoActionParamsError(
                    `Invalid ReferenceImageFileIDs JSON: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        }
        if (!Array.isArray(parsed)) {
            throw new InvalidVideoActionParamsError('ReferenceImageFileIDs must be an array of file ID strings');
        }
        const ids: string[] = [];
        for (const item of parsed) {
            if (typeof item !== 'string' || item.trim().length === 0) {
                throw new InvalidVideoActionParamsError('Every entry in ReferenceImageFileIDs must be a non-empty file ID string');
            }
            ids.push(item.trim());
        }
        return ids.length > 0 ? ids : undefined;
    }

    private parseKeyframes(params: RunActionParams): KeyframeFileSpec[] | undefined {
        let raw: unknown;
        try {
            raw = JSONParamHelper.GetJSONParam(params, 'Keyframes');
        } catch (err) {
            throw new InvalidVideoActionParamsError(
                `Invalid Keyframes JSON: ${err instanceof Error ? err.message : String(err)}`
            );
        }
        if (raw === undefined || raw === null || raw === '') {
            return undefined;
        }
        let parsed: unknown = raw;
        if (typeof raw === 'string') {
            try {
                parsed = JSON.parse(raw);
            } catch (err) {
                throw new InvalidVideoActionParamsError(
                    `Invalid Keyframes JSON: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        }
        if (!Array.isArray(parsed)) {
            throw new InvalidVideoActionParamsError('Keyframes must be a JSON array of { Seconds, FileID } objects');
        }
        const specs: KeyframeFileSpec[] = [];
        for (const item of parsed) {
            if (typeof item !== 'object' || item === null) {
                throw new InvalidVideoActionParamsError('Each Keyframes entry must be an object with Seconds and FileID');
            }
            const record = item as Record<string, unknown>;
            const seconds = record.Seconds;
            const fileId = record.FileID;
            if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
                throw new InvalidVideoActionParamsError('Each Keyframes entry must have a finite Seconds >= 0');
            }
            if (typeof fileId !== 'string' || fileId.trim().length === 0) {
                throw new InvalidVideoActionParamsError('Each Keyframes entry must have a non-empty FileID string');
            }
            specs.push({ Seconds: seconds, FileID: fileId.trim() });
        }
        return specs.length > 0 ? specs : undefined;
    }

    private parseOptionalStringParam(raw: unknown, paramName: string): string | undefined {
        if (raw === undefined || raw === null || raw === '') {
            return undefined;
        }
        if (typeof raw !== 'string' || raw.trim().length === 0) {
            throw new InvalidVideoActionParamsError(`Invalid ${paramName}: must be a non-empty string`);
        }
        return raw.trim();
    }

    /** Resolves active Video models, optional model pin, API keys, CredentialScope, and AgentID. */
    private async prepareVideoRun(
        params: RunActionParams,
        modelName?: string
    ): Promise<{ PinnedModel?: MJAIModelEntityExtended; RunOptions: AIMediaRunOptions }> {
        await AIEngineBase.Instance.Config(false, params.ContextUser);
        const videoModels = this.activeVideoModels(Boolean(modelName));
        const pinned = modelName ? this.findNamedModel(videoModels, modelName) : undefined;
        const sources = pinned ? this.pinnedKeySources(pinned) : videoModels.flatMap(m => InferenceKeySources(m));

        const runOptions: AIMediaRunOptions = {
            ContextUser: params.ContextUser,
            APIKeys: BuildImageGenerationAPIKeys(sources, params.RuntimeAPIKeyResolver, params.CredentialScope),
        };
        if (params.CredentialScope) {
            runOptions.CredentialScope = params.CredentialScope;
        }
        if (pinned) {
            runOptions.ModelID = pinned.ID;
        }
        const agentId = this.contextAgentID(params);
        if (agentId) {
            runOptions.AgentID = agentId;
        }
        return { PinnedModel: pinned, RunOptions: runOptions };
    }

    /** Active Video models sorted by PowerRank descending. */
    private activeVideoModels(hasNamedModel: boolean): MJAIModelEntityExtended[] {
        const models = AIEngineBase.Instance.Models.filter(
            m => m.AIModelType?.trim().toLowerCase() === 'video' && m.IsActive
        );
        if (models.length === 0 && !hasNamedModel) {
            throw new Error('No active video models found');
        }
        return [...models].sort((a, b) => (b.PowerRank || 0) - (a.PowerRank || 0));
    }

    /** Finds a named Video model by Name or APIName (case-insensitive); unknown model is INVALID_PARAMS. */
    private findNamedModel(models: MJAIModelEntityExtended[], modelName: string): MJAIModelEntityExtended {
        const wanted = modelName.toLowerCase();
        const found = models.find(
            m => m.Name.toLowerCase() === wanted || (m.APIName && m.APIName.toLowerCase() === wanted)
        );
        if (!found) {
            throw new InvalidVideoActionParamsError(`Video model '${modelName}' not found`);
        }
        return found;
    }

    /** The named model's key sources. A named model with no active inference provider cannot run. */
    private pinnedKeySources(model: MJAIModelEntityExtended): ImageGenerationKeySource[] {
        const sources = InferenceKeySources(model);
        if (sources.length === 0) {
            throw new Error(`No active inference provider found for model '${model.Name}'`);
        }
        return sources;
    }

    /** The calling agent's ID, which BaseAgent stamps on the action's context. */
    private contextAgentID(params: RunActionParams): string | undefined {
        const context = params.Context as Record<string, unknown> | undefined;
        const agentId = context?.AgentID;
        return typeof agentId === 'string' && agentId.trim().length > 0 ? agentId : undefined;
    }

    /** Loads reference images, keyframes, and source video from MJ Storage as the calling user. */
    private async loadReferences(
        params: RunActionParams,
        inputs: ValidatedVideoActionInputs
    ): Promise<LoadedVideoReferences> {
        const result: LoadedVideoReferences = {};

        if (inputs.ReferenceImageFileIDs && inputs.ReferenceImageFileIDs.length > 0) {
            const images: MediaInput[] = [];
            for (const fileId of inputs.ReferenceImageFileIDs) {
                images.push(await this.loadMediaInput(fileId, params, 'image/png'));
            }
            result.ReferenceImages = images;
        }

        if (inputs.KeyframeSpecs && inputs.KeyframeSpecs.length > 0) {
            const keyframes: VideoKeyframeInput[] = [];
            for (const spec of inputs.KeyframeSpecs) {
                const image = await this.loadMediaInput(spec.FileID, params, 'image/png');
                keyframes.push({ Seconds: spec.Seconds, Image: image });
            }
            result.Keyframes = keyframes;
        }

        if (inputs.SourceVideoFileID) {
            result.SourceVideo = await this.loadMediaInput(inputs.SourceVideoFileID, params, 'video/mp4');
        }

        return result;
    }

    private async loadMediaInput(fileId: string, params: RunActionParams, defaultMimeType: string): Promise<MediaInput> {
        const loaded = await this.loadFromMJStorage(fileId, params);
        const data = Buffer.isBuffer(loaded.content) ? loaded.content : Buffer.from(loaded.content);
        return {
            Data: data,
            MimeType: loaded.mimeType || defaultMimeType,
        };
    }

    /**
     * Stores the generated video clip via `saveToMJStorage` with provenance description, or falls
     * back to inline base64 delivery (`VIDEO_GENERATED_INLINE`) if storage fails.
     */
    private async storeAndFormatResult(
        params: RunActionParams,
        prompt: string,
        runResult: AIVideoGenerationRunResult,
        pinnedModel?: MJAIModelEntityExtended
    ): Promise<ActionResultSimple> {
        const video = runResult.Video!;
        const modelName = runResult.ModelName ?? pinnedModel?.Name ?? '';
        const modelId = runResult.ModelID ?? pinnedModel?.ID ?? '';
        const safeJobId = (runResult.JobID || 'clip').replace(/[^A-Za-z0-9._-]/g, '_');
        const fileName = `generated-video-${safeJobId}.mp4`;
        const description = `AI-generated video: ${modelName}, AI Prompt Run ${runResult.PromptRunID ?? ''}`.trim();

        const provenance: GeneratedVideoProvenance = {
            Provenance: 'Generated',
            ModelID: modelId,
            ModelName: modelName,
            PromptRunID: runResult.PromptRunID,
            JobID: runResult.JobID,
            Prompt: prompt,
            DurationSeconds: video.DurationSeconds,
            C2PA: runResult.C2PA,
            Cost: runResult.Cost,
        };

        try {
            const fileId = await this.saveToMJStorage(
                video.Data,
                fileName,
                video.MimeType,
                params,
                undefined,
                undefined,
                description
            );

            const mediaItem: MediaOutput = {
                modality: 'Video',
                mimeType: video.MimeType,
                fileId,
                width: video.Width,
                height: video.Height,
                durationSeconds: video.DurationSeconds,
                label: fileName,
                metadata: provenance as unknown as Record<string, unknown>,
            };

            params.Params.push({ Name: 'FileID', Type: 'Output', Value: fileId });
            this.pushCommonOutputs(params, mediaItem, video.DurationSeconds, modelName, runResult, provenance);

            return {
                Success: true,
                ResultCode: 'VIDEO_GENERATED',
                Message: JSON.stringify(
                    {
                        message: 'Successfully generated and stored video clip',
                        fileId,
                        model: modelName,
                        durationSeconds: video.DurationSeconds,
                        promptRunId: runResult.PromptRunID,
                    },
                    null,
                    2
                ),
            };
        } catch (storageError) {
            const storageReason = storageError instanceof Error ? storageError.message : String(storageError);
            const mediaItem: MediaOutput = {
                modality: 'Video',
                mimeType: video.MimeType,
                data: video.Data.toString('base64'),
                width: video.Width,
                height: video.Height,
                durationSeconds: video.DurationSeconds,
                label: fileName,
                metadata: provenance as unknown as Record<string, unknown>,
            };

            this.pushCommonOutputs(params, mediaItem, video.DurationSeconds, modelName, runResult, provenance);

            return {
                Success: true,
                ResultCode: 'VIDEO_GENERATED_INLINE',
                Message: JSON.stringify(
                    {
                        message: `Video generated; storage failed (${storageReason}) so clip is returned inline in Videos output parameter`,
                        inline: true,
                        storageError: storageReason,
                        model: modelName,
                        durationSeconds: video.DurationSeconds,
                        promptRunId: runResult.PromptRunID,
                    },
                    null,
                    2
                ),
            };
        }
    }

    private pushCommonOutputs(
        params: RunActionParams,
        mediaItem: MediaOutput,
        durationSeconds: number,
        modelName: string,
        runResult: AIVideoGenerationRunResult,
        provenance: GeneratedVideoProvenance
    ): void {
        params.Params.push({ Name: 'Videos', Type: 'Output', Value: [mediaItem] });
        params.Params.push({ Name: 'DurationSeconds', Type: 'Output', Value: durationSeconds });
        params.Params.push({ Name: 'ModelUsed', Type: 'Output', Value: modelName });
        params.Params.push({ Name: 'PromptRunID', Type: 'Output', Value: runResult.PromptRunID });
        if (runResult.Cost !== undefined) {
            params.Params.push({ Name: 'Cost', Type: 'Output', Value: runResult.Cost });
        }
        params.Params.push({ Name: 'Provenance', Type: 'Output', Value: provenance });
    }
}
