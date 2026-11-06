import { BaseModel, ModelUsage } from "./baseModel";
import type { AIErrorInfo } from "./errorTypes";
import type { MediaInput } from "./baseImage";

/**
 * Base class for all video generation models. Each AI model will have a sub-class implementing the abstract methods in this base class. Not all 
 * sub-classes will support all methods. If a method is not supported an exception will be thrown, use the GetSupportedMethods method to determine
 * what methods are supported by a specific sub-class.
 */
export abstract class BaseVideoGenerator extends BaseModel {
    public abstract CreateAvatarVideo(params: AvatarVideoParams): Promise<VideoResult>;
    public abstract CreateVideoTranslation(params: VideoTranslationParams): Promise<VideoResult>;
    public abstract GetAvatars(): Promise<AvatarInfo[]>;
    public abstract GetSupportedMethods(): Promise<string[]>;

    /**
     * Submit a general video generation request (text-to-video, image-to-video, video-to-video,
     * or continuation). Drivers that do not support general video generation inherit this default
     * implementation, which throws a not-supported error; callers can inspect
     * {@link GetSupportedMethods} before calling.
     *
     * @param _params Parameters describing the video generation request.
     * @returns Initial {@link VideoGenerationJob} status from the provider.
     */
    public async GenerateVideo(_params: VideoGenerationParams): Promise<VideoGenerationJob> {
        throw new Error(`GenerateVideo is not supported by ${this.constructor.name}`);
    }

    /**
     * Poll the current status of a previously submitted video generation job. Drivers that do not
     * support general video generation inherit this default implementation, which throws a
     * not-supported error.
     *
     * @param _jobId Provider job identifier returned by {@link GenerateVideo}.
     * @param _signal Optional signal for cancelling the poll request.
     * @returns Latest {@link VideoGenerationJob} state, including output media and usage once succeeded.
     */
    public async GetVideoGenerationStatus(_jobId: string, _signal?: AbortSignal): Promise<VideoGenerationJob> {
        throw new Error(`GetVideoGenerationStatus is not supported by ${this.constructor.name}`);
    }
}

/**
 * Supported generation modes for {@link VideoGenerationParams.Mode}.
 */
export type VideoGenerationMode = 'TextToVideo' | 'ImageToVideo' | 'VideoToVideo' | 'Continuation';

/**
 * Vendor-neutral quality tier for {@link VideoGenerationParams.Quality}.
 * Drivers map these tiers to provider-specific resolution/model settings.
 */
export type VideoGenerationQuality = 'draft' | 'standard' | 'high';

/**
 * Keyframe image pinned to a timestamp in seconds for {@link VideoGenerationParams.Keyframes}.
 */
export interface VideoKeyframeInput {
    /**
     * Timestamp in seconds within the generated clip where this keyframe applies.
     */
    Seconds: number;

    /**
     * Reference image to anchor the frame at {@link Seconds}.
     */
    Image: MediaInput;
}

/**
 * Parameters for submitting a general video generation job via {@link BaseVideoGenerator.GenerateVideo}.
 */
export interface VideoGenerationParams {
    /**
     * Text prompt describing the scene, motion, and visual style to generate.
     */
    Prompt: string;

    /**
     * Generation mode selecting how input references/video are used.
     */
    Mode: VideoGenerationMode;

    /**
     * Requested output clip duration in seconds.
     */
    DurationSeconds: number;

    /**
     * Aspect ratio in `width:height` form (for example, `'16:9'`, `'9:16'`, `'1:1'`, `'4:5'`).
     */
    AspectRatio: string;

    /**
     * Vendor-neutral quality tier (`'draft' | 'standard' | 'high'`).
     */
    Quality: VideoGenerationQuality;

    /**
     * Optional deterministic seed when supported by the provider.
     */
    Seed?: number;

    /**
     * Optional reference images guiding subject, style, or initial frame.
     */
    ReferenceImages?: MediaInput[];

    /**
     * Optional timestamped keyframe images anchoring motion across the clip.
     */
    Keyframes?: VideoKeyframeInput[];

    /**
     * Optional source video for `'VideoToVideo'` or `'Continuation'` modes.
     */
    SourceVideo?: MediaInput;

    /**
     * Whether synchronized ambient/generated audio is requested with the video clip.
     */
    WantAudio?: boolean;

    /**
     * Optional signal for cancelling the request. The driver is responsible for honoring it: it
     * passes the signal to the provider's SDK or HTTP call, so an aborted request is torn down
     * rather than left running. A driver that stops because the signal fired reports the failure
     * classified as `Cancelled` (see `BuildCancellationErrorInfo`), which is never failed over.
     */
    CancellationToken?: AbortSignal;
}

/**
 * Lifecycle state of a {@link VideoGenerationJob}.
 */
export type VideoGenerationJobStatus = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Cancelled';

/**
 * Generated video payload returned on a succeeded {@link VideoGenerationJob}.
 * Either inline `Data` or a downloadable `URL` is populated.
 */
export interface GeneratedVideo {
    /**
     * Inline binary video data (`Buffer`) or base64-encoded string when returned directly.
     */
    Data?: Buffer | string;

    /**
     * Provider URL where the generated video can be downloaded when not returned inline.
     */
    URL?: string;

    /**
     * MIME type of the generated video (for example, `'video/mp4'`).
     */
    MimeType: string;

    /**
     * Actual duration of the generated video in seconds.
     */
    DurationSeconds: number;

    /**
     * Output video width in pixels.
     */
    Width: number;

    /**
     * Output video height in pixels.
     */
    Height: number;
}

/**
 * Content provenance metadata reported for a generated video.
 */
export interface VideoGenerationProvenance {
    /**
     * True when the provider embeds C2PA content credentials in the generated file.
     */
    C2PA: boolean;
}

/**
 * Status and result envelope returned by {@link BaseVideoGenerator.GenerateVideo} and
 * {@link BaseVideoGenerator.GetVideoGenerationStatus}.
 */
export interface VideoGenerationJob {
    /**
     * Provider-assigned job identifier used to poll status via {@link BaseVideoGenerator.GetVideoGenerationStatus}.
     */
    JobID: string;

    /**
     * Current lifecycle state of the video generation job.
     */
    Status: VideoGenerationJobStatus;

    /**
     * Generated video output, populated when `Status === 'Succeeded'`.
     */
    Video?: GeneratedVideo;

    /**
     * Usage reported for the generation request (typically `ModelUsage.ForMedia('Seconds', 0, seconds)`).
     */
    Usage?: ModelUsage;

    /**
     * Provenance metadata for the generated video clip, when reported by the provider.
     */
    Provenance?: VideoGenerationProvenance;

    /**
     * Structured failure classification from `ErrorAnalyzer` when `Status` is `'Failed'` or `'Cancelled'`.
     */
    ErrorInfo?: AIErrorInfo;

    /**
     * Human-readable error message when `Status` is `'Failed'` or `'Cancelled'`.
     */
    ErrorMessage?: string;
}

export class VideoResult {
    success: boolean;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    /**
     * When success == false, this will contain the error message
     */
    errorMessage?: string;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member
    /**
     * Platform-specific video ID for the generated video when success == true
     */
    videoId: string  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply

    /**
     * Usage for the request, when the provider reported it: normally the video's length as
     * `ModelUsage.ForMedia('Seconds', 0, seconds)`, which per-second video pricing prices. Left
     * undefined when the length is not known, as it is not for a provider that only accepts a render
     * job (HeyGen's `CreateAvatarVideo` returns the job's ID before the video exists).
     */
    usage?: ModelUsage;  // case-violation-ok-legacy-back-compat: named as SpeechResult.usage and the other fields here are, since drivers fill this class as an object literal

    /**
     * How a failure is classified, when the request failed: `ErrorAnalyzer`'s reading of the error,
     * with its HTTP status. See `SpeechResult.errorInfo`, which this mirrors. Undefined on success,
     * and from a driver that reports only `errorMessage`.
     */
    errorInfo?: AIErrorInfo;  // case-violation-ok-legacy-back-compat: named as BaseResult.errorInfo, which the failover loop reads
}

export class AvatarInfo {
    id: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    name: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    gender: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    description: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    previewImageUrl: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    previewVideoUrl: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
}

export class VideoTranslationParams {
    /**
     * Optional signal for cancelling the request. The driver is responsible for honoring it: it
     * passes the signal to the provider's SDK or HTTP call, so an aborted request is torn down
     * rather than left running. A driver that stops because the signal fired reports the failure
     * classified as `Cancelled` (see `BuildCancellationErrorInfo`), which is never failed over.
     */
    CancellationToken?: AbortSignal;
}

export class AvatarVideoParams {
    /**
     * Title of the video for storage in the provider's history
     */
    title: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    /**
     * Generate captions for the video if true, otherwise do not generate captions
     */
    caption?: boolean;  // case-violation-ok-legacy-back-compat: an accessor cannot be optional, so a stub would turn this into a required member

    /**
     * Width of the requested video such as 1280 for 1280 pixels
     */
    outputWidth: number;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    /**
     * Height of the requested video such as 720 for 720 pixels
     */
    outputHeight: number;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply

    avatarId: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply

    scale: number;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    offsetX: number;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    offsetY: number;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    audioAssetId: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    imageAssetId: string;  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    avatarStyle: string; // 'circle' etc. — case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply

    /**
     * Optional signal for cancelling the request. The driver is responsible for honoring it: it
     * passes the signal to the provider's SDK or HTTP call, so an aborted request is torn down
     * rather than left running. A driver that stops because the signal fired reports the failure
     * classified as `Cancelled` (see `BuildCancellationErrorInfo`), which is never failed over.
     */
    CancellationToken?: AbortSignal;
}