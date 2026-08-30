import { RegisterClass } from "@memberjunction/global";
import { AvatarInfo, AvatarVideoParams, BaseVideoGenerator, VideoResult, ErrorAnalyzer } from "@memberjunction/ai";
import { HttpGet, HttpPost } from "@memberjunction/network-utils";


/** Response from HeyGen's `POST /v2/video/generate`. */
interface HeyGenGenerateResponse {
    data: { video_id: string };
}

/** Response from HeyGen's `GET /v2/avatars`. */
interface HeyGenAvatarsResponse {
    data: {
        avatars: Array<{
            avatar_id: string;
            avatar_name: string;
            gender: string;
            preview_image_url: string;
            preview_video_url: string;
        }>;
    };
}

@RegisterClass(BaseVideoGenerator, "HeyGenVideoGenerator")
export class HeyGenVideoGenerator extends BaseVideoGenerator {
    private _generateUrl: string = "https://api.heygen.com/v2/video/generate";
    private _avatarsUrl: string = "https://api.heygen.com/v2/avatars";

    constructor(apiKey: string) {
        super(apiKey);
    }

    public async CreateAvatarVideo(params: AvatarVideoParams): Promise<VideoResult> {
        const videoResult = new VideoResult();
        try {
            const response = await HttpPost<HeyGenGenerateResponse>(
                this._generateUrl, {
                    video_inputs: [
                        {
                            character: {
                                type: 'avatar',
                                avatar_id: params.avatarId,
                                scale: params.scale,
                                avatar_style: params.avatarStyle,
                                offset: {x: params.offsetX, y: params.offsetY},
                            },
                            voice: {
                                type: 'audio',
                                audio_asset_id: params.audioAssetId,
                            },
                            background: {
                                type: 'image',
                                image_asset_id: params.imageAssetId,
                            },
                        },
                    ],
                    dimension: {
                        width: params.outputWidth,
                        height: params.outputHeight,
                    }
                },
                {
                    Headers: { Accept: 'application/json', 'X-Api-Key': this.apiKey }
                }
            );

            videoResult.videoId = response.Data.data.video_id;
            videoResult.success = true;
        } catch (error) {
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'HeyGen');
            videoResult.success = false;
            videoResult.errorMessage = error?.message || 'Unknown error occurred';
            console.error('HeyGen CreateAvatarVideo error:', error, errorInfo);
        }
        return videoResult;
    }

    public async CreateVideoTranslation(params: any): Promise<VideoResult> {
        throw new Error("Method not implemented.");
    }

    public async GetAvatars(): Promise<AvatarInfo[]> {
        const result: AvatarInfo[] = [];
        try {
            const response = await HttpGet<HeyGenAvatarsResponse>(this._avatarsUrl, {
                Headers: { Accept: 'application/json', 'X-Api-Key': this.apiKey }
            });
            for (const avatar of response.Data.data.avatars) {
                const avatarInfo = new AvatarInfo();
                avatarInfo.id = avatar.avatar_id;
                avatarInfo.name = avatar.avatar_name;
                avatarInfo.gender = avatar.gender
                avatarInfo.previewImageUrl = avatar.preview_image_url;
                avatarInfo.previewVideoUrl = avatar.preview_video_url;
                result.push(avatarInfo);
            }
        } catch (error) {
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'HeyGen');
            console.error('HeyGen GetAvatars error:', errorInfo);
        }   
        return result;
    }

    public async GetSupportedMethods(): Promise<string[]> {
        return ["CreateAvatarVideo", "CreateVideoTranslation", "GetAvatars"];
    }
}