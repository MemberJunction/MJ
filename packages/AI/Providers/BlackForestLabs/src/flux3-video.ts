import {
    AIErrorInfo,
    AvatarInfo,
    AvatarVideoParams,
    BaseVideoGenerator,
    BuildCancellationErrorInfo,
    ErrorAnalyzer,
    IsRequestAborted,
    MediaInput,
    ModelUsage,
    VideoGenerationJob,
    VideoGenerationParams,
    VideoKeyframeInput,
    VideoResult,
    VideoTranslationParams,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { HasC2PAManifest } from './c2pa.js';

/**
 * Aspect ratios supported by BFL's `POST /v1/flux-3-video` endpoint.
 */
export type FLUX3VideoAspectRatio =
    | '21:9'
    | '2:1'
    | '16:9'
    | '4:3'
    | '1:1'
    | '3:4'
    | '9:16'
    | '9:21';

/**
 * Resolution tiers supported by BFL's `POST /v1/flux-3-video` endpoint.
 */
export type FLUX3VideoResolution = 'hd' | 'fhd' | 'qhd' | 'uhd';

/**
 * Delivered pixel dimensions (width × height) for all 8 aspect ratios × 4 resolution tiers
 * documented on https://docs.bfl.ai/flux_3/flux3_video.md.
 */
export const FLUX3_VIDEO_DIMENSIONS: Readonly<
    Record<FLUX3VideoAspectRatio, Readonly<Record<FLUX3VideoResolution, { readonly width: number; readonly height: number }>>>
> = {
    '21:9': {
        hd: { width: 1440, height: 608 },
        fhd: { width: 2176, height: 928 },
        qhd: { width: 2912, height: 1248 },
        uhd: { width: 4352, height: 1856 },
    },
    '2:1': {
        hd: { width: 1344, height: 672 },
        fhd: { width: 2016, height: 1024 },
        qhd: { width: 2720, height: 1376 },
        uhd: { width: 4032, height: 2048 },
    },
    '16:9': {
        hd: { width: 1280, height: 704 },
        fhd: { width: 1920, height: 1088 },
        qhd: { width: 2560, height: 1440 },
        uhd: { width: 3840, height: 2176 },
    },
    '4:3': {
        hd: { width: 1088, height: 800 },
        fhd: { width: 1632, height: 1216 },
        qhd: { width: 2176, height: 1632 },
        uhd: { width: 3264, height: 2432 },
    },
    '1:1': {
        hd: { width: 960, height: 960 },
        fhd: { width: 1440, height: 1440 },
        qhd: { width: 1920, height: 1920 },
        uhd: { width: 2880, height: 2880 },
    },
    '3:4': {
        hd: { width: 800, height: 1088 },
        fhd: { width: 1216, height: 1632 },
        qhd: { width: 1632, height: 2176 },
        uhd: { width: 2432, height: 3264 },
    },
    '9:16': {
        hd: { width: 704, height: 1280 },
        fhd: { width: 1088, height: 1920 },
        qhd: { width: 1440, height: 2560 },
        uhd: { width: 2176, height: 3840 },
    },
    '9:21': {
        hd: { width: 608, height: 1440 },
        fhd: { width: 928, height: 2176 },
        qhd: { width: 1248, height: 2912 },
        uhd: { width: 1856, height: 4352 },
    },
};

interface BFLVideoSubmitResponse {
    id: string;
    polling_url?: string;
    cost?: number | null;
}

type BFLVideoTaskStatus =
    | 'Pending'
    | 'Reasoning'
    | 'Generating'
    | 'Ready'
    | 'Error'
    | 'Request Moderated'
    | 'Content Moderated'
    | 'No Card Generated'
    | 'Task not found';

interface BFLVideoPollResponse {
    id: string;
    status: BFLVideoTaskStatus;
    result?: {
        sample?: string;
    } | null;
    progress?: number | null;
    details?: Record<string, unknown> | null;
    cost?: number | null;
}

interface RememberedJobMetadata {
    durationSeconds: number;
    width: number;
    height: number;
    submitCost?: number | null;
}

interface ValidationOutcome {
    valid: boolean;
    errorMessage?: string;
    body?: Record<string, unknown>;
    durationSeconds?: number;
    width?: number;
    height?: number;
}

interface KeyframesOutcome {
    valid: boolean;
    errorMessage?: string;
    keyframes?: Array<[number, string]> | string[];
}

type HttpStatusError = Error & { status?: number };

/**
 * Black Forest Labs FLUX 3 Video generator (`POST /v1/flux-3-video`).
 *
 * Supports text-to-video (`t2v`), image-to-video (`i2v`), and video continuation (`v2v`).
 * Refuses `VideoToVideo` editing (which is a separate BFL tool at `/v1/flux-tools/video-edit-v1`)
 * and validates all parameters before issuing any network request.
 */
@RegisterClass(BaseVideoGenerator, 'FLUX3VideoGenerator')
export class FLUX3VideoGenerator extends BaseVideoGenerator {
    private readonly _baseUrl: string;
    private readonly _submittedJobs = new Map<string, RememberedJobMetadata>();

    constructor(apiKey: string, baseUrl?: string) {
        super(apiKey);
        this._baseUrl = baseUrl || 'https://api.bfl.ai/v1';
    }

    /**
     * Submits a FLUX 3 video generation request to `POST {baseUrl}/flux-3-video`.
     */
    public override async GenerateVideo(params: VideoGenerationParams): Promise<VideoGenerationJob> {
        if (params.CancellationToken?.aborted) {
            return {
                JobID: '',
                Status: 'Cancelled',
                ErrorMessage: 'Operation cancelled',
                ErrorInfo: BuildCancellationErrorInfo({
                    signal: params.CancellationToken,
                    provider: 'Black Forest Labs',
                }),
            };
        }

        const validationResult = this.validateAndBuildBody(params);
        if (!validationResult.valid) {
            const msg = validationResult.errorMessage || 'Invalid FLUX 3 video generation request';
            return {
                JobID: '',
                Status: 'Failed',
                ErrorMessage: msg,
                ErrorInfo: this.buildInvalidRequestErrorInfo(msg),
            };
        }

        try {
            const response = await fetch(`${this._baseUrl}/flux-3-video`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-key': this.apiKey,
                },
                body: JSON.stringify(validationResult.body),
                signal: params.CancellationToken,
            });

            if (!response.ok) {
                const errorText = await response.text();
                const httpError: HttpStatusError = new Error(`BFL API error (${response.status}): ${errorText}`);
                httpError.status = response.status;
                throw httpError;
            }

            const submitData = (await response.json()) as BFLVideoSubmitResponse;
            const pollingUrl = this.resolvePollingUrl(submitData);

            this._submittedJobs.set(pollingUrl, {
                durationSeconds: validationResult.durationSeconds ?? 0,
                width: validationResult.width ?? 0,
                height: validationResult.height ?? 0,
                submitCost: submitData.cost,
            });

            return {
                JobID: pollingUrl,
                Status: 'Pending',
            };
        } catch (error) {
            if (IsRequestAborted(error, params.CancellationToken)) {
                return {
                    JobID: '',
                    Status: 'Cancelled',
                    ErrorMessage: 'Operation cancelled',
                    ErrorInfo: BuildCancellationErrorInfo({
                        error,
                        signal: params.CancellationToken,
                        provider: 'Black Forest Labs',
                    }),
                };
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                JobID: '',
                Status: 'Failed',
                ErrorMessage: errorMessage,
                ErrorInfo: ErrorAnalyzer.AnalyzeError(error, 'Black Forest Labs'),
            };
        }
    }

    /**
     * Polls a submitted FLUX 3 video job via its `polling_url` (`jobId`).
     * Refuses any `jobId` that is not an `https://` URL on a `.bfl.ai` host before making any network request.
     */
    public override async GetVideoGenerationStatus(
        jobId: string,
        signal?: AbortSignal,
    ): Promise<VideoGenerationJob> {
        if (signal?.aborted) {
            return {
                JobID: jobId,
                Status: 'Cancelled',
                ErrorMessage: 'Operation cancelled',
                ErrorInfo: BuildCancellationErrorInfo({
                    signal,
                    provider: 'Black Forest Labs',
                }),
            };
        }

        if (!this.isValidBflPollingUrl(jobId)) {
            const message = `Refusing to poll non-BFL or non-HTTPS URL: ${jobId}`;
            return {
                JobID: jobId,
                Status: 'Failed',
                ErrorMessage: message,
                ErrorInfo: this.buildInvalidRequestErrorInfo(message),
            };
        }

        try {
            const response = await fetch(jobId, {
                method: 'GET',
                headers: {
                    'x-key': this.apiKey,
                },
                signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                const httpError: HttpStatusError = new Error(`BFL poll error (${response.status}): ${errorText}`);
                httpError.status = response.status;
                throw httpError;
            }

            const pollResult = (await response.json()) as BFLVideoPollResponse;

            if (pollResult.status === 'Pending') {
                return {
                    JobID: jobId,
                    Status: 'Pending',
                };
            }

            if (pollResult.status === 'Reasoning' || pollResult.status === 'Generating') {
                return {
                    JobID: jobId,
                    Status: 'Running',
                };
            }

            if (
                pollResult.status === 'Request Moderated' ||
                pollResult.status === 'Content Moderated' ||
                pollResult.status === 'No Card Generated' ||
                pollResult.status === 'Error' ||
                pollResult.status === 'Task not found'
            ) {
                const failureMessage = this.formatFailureStatus(pollResult.status, pollResult.details);
                this._submittedJobs.delete(jobId);
                return {
                    JobID: jobId,
                    Status: 'Failed',
                    ErrorMessage: failureMessage,
                    ErrorInfo: ErrorAnalyzer.AnalyzeError(new Error(failureMessage), 'Black Forest Labs'),
                };
            }

            if (pollResult.status === 'Ready') {
                const sampleUrl = pollResult.result?.sample;
                if (!sampleUrl || !this.isHttpsUrl(sampleUrl)) {
                    const msg = `BFL video task Ready without a valid HTTPS sample URL: ${sampleUrl ?? 'missing'}`;
                    this._submittedJobs.delete(jobId);
                    return {
                        JobID: jobId,
                        Status: 'Failed',
                        ErrorMessage: msg,
                        ErrorInfo: ErrorAnalyzer.AnalyzeError(new Error(msg), 'Black Forest Labs'),
                    };
                }

                // Download from delivery URL without sending the BFL API key
                const downloadResponse = await fetch(sampleUrl, { signal });
                if (!downloadResponse.ok) {
                    const dlError: HttpStatusError = new Error(
                        `Failed to download video from delivery URL (${downloadResponse.status})`,
                    );
                    dlError.status = downloadResponse.status;
                    throw dlError;
                }

                const arrayBuffer = await downloadResponse.arrayBuffer();
                const videoBuffer = Buffer.from(arrayBuffer);
                const contentTypeHeader = downloadResponse.headers?.get('content-type');
                const mimeType = contentTypeHeader
                    ? contentTypeHeader.split(';')[0].trim() || 'video/mp4'
                    : 'video/mp4';

                const remembered = this._submittedJobs.get(jobId);
                this._submittedJobs.delete(jobId);

                const durationSeconds = remembered?.durationSeconds ?? 0;
                const width = remembered?.width ?? 0;
                const height = remembered?.height ?? 0;

                const usage = ModelUsage.ForMedia('Seconds', 0, durationSeconds);
                const credits = pollResult.cost ?? remembered?.submitCost ?? null;
                if (credits != null) {
                    usage.cost = credits / 100;
                    usage.costCurrency = 'USD';
                }

                return {
                    JobID: jobId,
                    Status: 'Succeeded',
                    Video: {
                        Data: videoBuffer,
                        URL: sampleUrl,
                        MimeType: mimeType,
                        DurationSeconds: durationSeconds,
                        Width: width,
                        Height: height,
                    },
                    Usage: usage,
                    Provenance: {
                        C2PA: HasC2PAManifest(videoBuffer),
                    },
                };
            }

            const unknownStatusMsg = `Unexpected BFL task status: ${String(pollResult.status)}`;
            return {
                JobID: jobId,
                Status: 'Failed',
                ErrorMessage: unknownStatusMsg,
                ErrorInfo: ErrorAnalyzer.AnalyzeError(new Error(unknownStatusMsg), 'Black Forest Labs'),
            };
        } catch (error) {
            if (IsRequestAborted(error, signal)) {
                return {
                    JobID: jobId,
                    Status: 'Cancelled',
                    ErrorMessage: 'Operation cancelled',
                    ErrorInfo: BuildCancellationErrorInfo({
                        error,
                        signal,
                        provider: 'Black Forest Labs',
                    }),
                };
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                JobID: jobId,
                Status: 'Failed',
                ErrorMessage: errorMessage,
                ErrorInfo: ErrorAnalyzer.AnalyzeError(error, 'Black Forest Labs'),
            };
        }
    }

    public async CreateAvatarVideo(_params: AvatarVideoParams): Promise<VideoResult> {
        return {
            success: false,
            videoId: '',
            errorMessage: 'CreateAvatarVideo is not supported by FLUX3VideoGenerator',
        };
    }

    public async CreateVideoTranslation(_params: VideoTranslationParams): Promise<VideoResult> {
        return {
            success: false,
            videoId: '',
            errorMessage: 'CreateVideoTranslation is not supported by FLUX3VideoGenerator',
        };
    }

    public async GetAvatars(): Promise<AvatarInfo[]> {
        return [];
    }

    public async GetSupportedMethods(): Promise<string[]> {
        return ['GenerateVideo', 'GetVideoGenerationStatus'];
    }

    private validateAndBuildBody(params: VideoGenerationParams): ValidationOutcome {
        if (!params.Prompt || !params.Prompt.trim()) {
            return { valid: false, errorMessage: 'Prompt is required for FLUX 3 video generation.' };
        }

        if (params.Mode === 'VideoToVideo') {
            return {
                valid: false,
                errorMessage:
                    'VideoToVideo mode is not supported by FLUX 3 Video (v2v on /v1/flux-3-video is video continuation; video editing is a separate tool at /v1/flux-tools/video-edit-v1).',
            };
        }

        if (
            params.Mode !== 'TextToVideo' &&
            params.Mode !== 'ImageToVideo' &&
            params.Mode !== 'Continuation'
        ) {
            return {
                valid: false,
                errorMessage: `Unsupported video generation mode: ${String(params.Mode)}`,
            };
        }

        if (!Number.isFinite(params.DurationSeconds)) {
            return {
                valid: false,
                errorMessage: `DurationSeconds must be a finite number, got: ${String(params.DurationSeconds)}`,
            };
        }

        const duration = Math.round(params.DurationSeconds);
        const maxDuration = params.Mode === 'Continuation' ? 15 : 20;
        if (duration < 5 || duration > maxDuration) {
            return {
                valid: false,
                errorMessage: `Duration ${duration}s is outside the allowed range (5-${maxDuration}s) for mode ${params.Mode}.`,
            };
        }

        if (!this.isSupportedAspectRatio(params.AspectRatio)) {
            return {
                valid: false,
                errorMessage: `Unsupported aspect ratio "${params.AspectRatio}" for FLUX 3 Video. Allowed: ${Object.keys(FLUX3_VIDEO_DIMENSIONS).join(', ')}.`,
            };
        }

        const { resolution, draft } = this.mapQualityTier(params.Quality);
        const dimensions = FLUX3_VIDEO_DIMENSIONS[params.AspectRatio][resolution];

        const body: Record<string, unknown> = {
            prompt: params.Prompt,
            aspect_ratio: params.AspectRatio,
            duration,
            resolution,
            generate_audio: params.WantAudio === true,
        };
        if (draft) {
            body.draft = true;
        }

        if (params.Mode === 'TextToVideo') {
            if (
                (params.ReferenceImages && params.ReferenceImages.length > 0) ||
                (params.Keyframes && params.Keyframes.length > 0)
            ) {
                return {
                    valid: false,
                    errorMessage:
                        'FLUX 3 TextToVideo (t2v) does not accept ReferenceImages or Keyframes; use ImageToVideo (i2v) instead.',
                };
            }
            body.mode = 't2v';
        } else if (params.Mode === 'ImageToVideo') {
            body.mode = 'i2v';
            const keyframesResult = this.buildKeyframesPayload(params.Keyframes, params.ReferenceImages, duration);
            if (!keyframesResult.valid) {
                return { valid: false, errorMessage: keyframesResult.errorMessage };
            }
            body.keyframes = keyframesResult.keyframes;
        } else {
            // Continuation -> v2v
            if (!params.SourceVideo) {
                return {
                    valid: false,
                    errorMessage: 'Continuation mode (v2v) requires SourceVideo.',
                };
            }
            const encodedVideo = this.encodeMediaInput(params.SourceVideo);
            if (!encodedVideo) {
                return {
                    valid: false,
                    errorMessage: 'SourceVideo must contain non-empty Data or URL.',
                };
            }
            body.mode = 'v2v';
            body.start_video = encodedVideo;
        }

        return {
            valid: true,
            body,
            durationSeconds: duration,
            width: dimensions.width,
            height: dimensions.height,
        };
    }

    private buildKeyframesPayload(
        keyframes: VideoKeyframeInput[] | undefined,
        referenceImages: MediaInput[] | undefined,
        durationSeconds: number,
    ): KeyframesOutcome {
        if (keyframes && keyframes.length > 0) {
            if (keyframes.length > 10) {
                return {
                    valid: false,
                    errorMessage: `FLUX 3 Video i2v supports at most 10 keyframes (got ${keyframes.length}).`,
                };
            }
            const pairs: Array<[number, string]> = [];
            for (const kf of keyframes) {
                if (!Number.isFinite(kf.Seconds) || kf.Seconds < 0 || kf.Seconds > durationSeconds) {
                    return {
                        valid: false,
                        errorMessage: `Keyframe timestamp ${String(kf.Seconds)}s is outside [0, ${durationSeconds}].`,
                    };
                }
                const encoded = this.encodeMediaInput(kf.Image);
                if (!encoded) {
                    return {
                        valid: false,
                        errorMessage: 'Each keyframe Image must contain non-empty Data or URL.',
                    };
                }
                pairs.push([kf.Seconds, encoded]);
            }
            return { valid: true, keyframes: pairs };
        }

        if (referenceImages && referenceImages.length > 0) {
            if (referenceImages.length > 10) {
                return {
                    valid: false,
                    errorMessage: `FLUX 3 Video i2v supports at most 10 reference images (got ${referenceImages.length}).`,
                };
            }
            const list: string[] = [];
            for (const img of referenceImages) {
                const encoded = this.encodeMediaInput(img);
                if (!encoded) {
                    return {
                        valid: false,
                        errorMessage: 'Each ReferenceImage must contain non-empty Data or URL.',
                    };
                }
                list.push(encoded);
            }
            return { valid: true, keyframes: list };
        }

        return {
            valid: false,
            errorMessage: 'ImageToVideo mode (i2v) requires at least 1 item in Keyframes or ReferenceImages.',
        };
    }

    private encodeMediaInput(input: MediaInput | undefined): string | null {
        if (!input) {
            return null;
        }
        if ('URL' in input) {
            const url = input.URL?.trim();
            return url ? url : null;
        }
        if ('Data' in input) {
            if (Buffer.isBuffer(input.Data)) {
                return input.Data.length > 0 ? input.Data.toString('base64') : null;
            }
            if (typeof input.Data === 'string') {
                const trimmed = input.Data.trim();
                return trimmed ? trimmed : null;
            }
        }
        return null;
    }

    private isSupportedAspectRatio(ratio: string): ratio is FLUX3VideoAspectRatio {
        return Object.prototype.hasOwnProperty.call(FLUX3_VIDEO_DIMENSIONS, ratio);
    }

    private mapQualityTier(quality: VideoGenerationParams['Quality']): {
        resolution: FLUX3VideoResolution;
        draft: boolean;
    } {
        if (quality === 'draft') {
            return { resolution: 'hd', draft: true };
        }
        if (quality === 'high') {
            return { resolution: 'qhd', draft: false };
        }
        return { resolution: 'fhd', draft: false };
    }

    private resolvePollingUrl(submitData: BFLVideoSubmitResponse): string {
        const candidate = submitData.polling_url || `${this._baseUrl}/get_result?id=${submitData.id}`;
        if (!this.isValidBflPollingUrl(candidate)) {
            throw new Error(`Refusing to accept non-BFL or non-HTTPS polling_url: ${candidate}`);
        }
        return candidate;
    }

    private isValidBflPollingUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.toLowerCase();
            return parsed.protocol === 'https:' && (host === 'bfl.ai' || host.endsWith('.bfl.ai'));
        } catch {
            return false;
        }
    }

    private isHttpsUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    private formatFailureStatus(
        status: string,
        details?: Record<string, unknown> | null,
    ): string {
        const reasons = details?.['Moderation Reasons'];
        if (Array.isArray(reasons) && reasons.length > 0) {
            return `Video generation failed with status: ${status} (${reasons.map(String).join(', ')})`;
        }
        if (typeof reasons === 'string' && reasons.trim().length > 0) {
            return `Video generation failed with status: ${status} (${reasons.trim()})`;
        }
        return `Video generation failed with status: ${status}`;
    }

    private buildInvalidRequestErrorInfo(message: string): AIErrorInfo {
        return {
            errorType: 'InvalidRequest',
            severity: 'Fatal',
            canFailover: false,
            error: new Error(message),
            context: {
                provider: 'Black Forest Labs',
            },
        };
    }
}
