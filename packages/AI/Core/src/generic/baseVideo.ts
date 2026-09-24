import { BaseModel } from "./baseModel";

/**
 * Base class for all video generation models. Each AI model will have a sub-class implementing the abstract methods in this base class. Not all 
 * sub-classes will support all methods. If a method is not supported an exception will be thrown, use the GetSupportedMethods method to determine
 * what methods are supported by a specific sub-class.
 */
export abstract class BaseVideoGenerator extends BaseModel {
    public abstract CreateAvatarVideo(params: AvatarVideoParams): Promise<VideoResult>;
    public abstract CreateVideoTranslation(params: VideoTranslationParams): Promise<VideoResult>;
    public abstract GetAvatars(): Promise<AvatarInfo[]>;
    public abstract GetSupportedMethods(): Promise<string[]>
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
    // to be done
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
}