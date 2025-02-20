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
    success: boolean;
    /**
     * When success == false, this will contain the error message
     */
    errorMessage?: string;
    /**
     * Platform-specific video ID for the generated video when success == true
     */
    videoId: string 
}

export class AvatarInfo {
    name: string;
    description: string;
    gender: string;
    previewImageUrl: string;
    previewVideoUrl: string;
}

export class VideoTranslationParams {
    // to be done
}

export class AvatarVideoParams {
    /**
     * Title of the video for storage in the provider's history
     */
    title: string;
    /**
     * Generate captions for the video if true, otherwise do not generate captions
     */
    caption?: boolean;

    /**
     * Width of the requested video such as 1280 for 1280 pixels
     */
    outputWidth: number;
    /**
     * Height of the requested video such as 720 for 720 pixels
     */
    outputHeight: number;

    avatarId: string;
}