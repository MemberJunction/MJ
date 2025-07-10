import { RegisterClass } from '@memberjunction/global';
import { YouTubeBaseAction } from '../youtube-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { MediaFile } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to upload a video to YouTube
 */
@RegisterClass(BaseAction, 'YouTubeUploadVideoAction')
export class YouTubeUploadVideoAction extends YouTubeBaseAction {
    /**
     * Upload video to YouTube
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
            }

            const initialized = await this.initializeOAuth(companyIntegrationId);
            if (!initialized) {
                throw new Error('Failed to initialize YouTube OAuth connection');
            }

            // Extract parameters
            const title = this.getParamValue(Params, 'Title');
            const description = this.getParamValue(Params, 'Description');
            const tags = this.getParamValue(Params, 'Tags');
            const categoryId = this.getParamValue(Params, 'CategoryID');
            const privacyStatus = this.getParamValue(Params, 'PrivacyStatus') || 'private';
            const videoFile = this.getParamValue(Params, 'VideoFile');
            const thumbnailFile = this.getParamValue(Params, 'ThumbnailFile');
            const notifySubscribers = this.getParamValue(Params, 'NotifySubscribers') ?? true;
            const publishAt = this.getParamValue(Params, 'PublishAt');

            // Validate required parameters
            if (!title) {
                throw new Error('Title is required for video upload');
            }
            if (!videoFile) {
                throw new Error('VideoFile is required');
            }

            // Validate video file
            const video: MediaFile = {
                filename: videoFile.filename || 'video.mp4',
                mimeType: videoFile.mimeType || 'video/mp4',
                data: videoFile.data,
                size: videoFile.size || (videoFile.data.length || 0)
            };
            this.validateVideoFile(video);

            // Prepare video metadata
            const videoMetadata: any = {
                snippet: {
                    title: title,
                    description: description || '',
                    tags: tags || [],
                    categoryId: categoryId || '22' // Default to People & Blogs
                },
                status: {
                    privacyStatus: privacyStatus,
                    selfDeclaredMadeForKids: false,
                    notifySubscribers: notifySubscribers
                }
            };

            // Handle scheduled publishing
            if (publishAt && privacyStatus === 'private') {
                videoMetadata.status.publishAt = this.formatDate(publishAt);
            }

            // Upload video
            const uploadResponse = await this.makeYouTubeRequest<any>(
                '/videos',
                'POST',
                videoMetadata,
                {
                    part: 'snippet,status',
                    uploadType: 'media'
                },
                ContextUser
            );

            const videoId = uploadResponse.id;

            // Upload the actual video data using resumable upload
            const videoUrl = await this.uploadVideo(video, {
                title: title,
                description: description,
                tags: tags,
                categoryId: categoryId,
                privacyStatus: privacyStatus
            });

            // Upload thumbnail if provided
            if (thumbnailFile) {
                try {
                    await this.uploadThumbnail(videoId, thumbnailFile);
                } catch (error) {
                    // Log thumbnail upload failure but don't fail the entire operation
                    console.error('Failed to upload thumbnail:', error);
                }
            }

            // Get the uploaded video details
            const videoDetails = await this.makeYouTubeRequest<any>(
                '/videos',
                'GET',
                undefined,
                {
                    part: 'snippet,status,statistics,contentDetails',
                    id: videoId
                },
                ContextUser
            );

            const uploadedVideo = videoDetails.items[0];

            // Prepare result
            const result = {
                videoId: uploadedVideo.id,
                videoUrl: `https://www.youtube.com/watch?v=${uploadedVideo.id}`,
                title: uploadedVideo.snippet.title,
                description: uploadedVideo.snippet.description,
                tags: uploadedVideo.snippet.tags,
                categoryId: uploadedVideo.snippet.categoryId,
                channelId: uploadedVideo.snippet.channelId,
                publishedAt: uploadedVideo.snippet.publishedAt,
                privacyStatus: uploadedVideo.status.privacyStatus,
                publishAt: uploadedVideo.status.publishAt,
                duration: uploadedVideo.contentDetails.duration,
                thumbnails: uploadedVideo.snippet.thumbnails,
                quotaCost: this.getQuotaCost('videos.insert')
            };

            // Update output parameters
            const outputParams = [...Params];
            const videoDetailsParam = outputParams.find(p => p.Name === 'VideoDetails');
            if (videoDetailsParam) videoDetailsParam.Value = result;
            const videoIdParam = outputParams.find(p => p.Name === 'VideoID');
            if (videoIdParam) videoIdParam.Value = videoId;
            const videoUrlParam = outputParams.find(p => p.Name === 'VideoURL');
            if (videoUrlParam) videoUrlParam.Value = result.videoUrl;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Video uploaded successfully: ${result.videoUrl}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(errorMessage),
                Message: `Failed to upload video: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Upload thumbnail for a video
     */
    private async uploadThumbnail(videoId: string, thumbnailFile: any): Promise<void> {
        const thumbnail: MediaFile = {
            filename: thumbnailFile.filename || 'thumbnail.jpg',
            mimeType: thumbnailFile.mimeType || 'image/jpeg',
            data: thumbnailFile.data,
            size: thumbnailFile.size || (thumbnailFile.data.length || 0)
        };

        // Validate thumbnail
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/bmp'].includes(thumbnail.mimeType)) {
            throw new Error('Invalid thumbnail format. Supported formats: JPEG, PNG, GIF, BMP');
        }

        const maxSize = 2 * 1024 * 1024; // 2MB
        if (thumbnail.size > maxSize) {
            throw new Error(`Thumbnail too large. Maximum size is 2MB`);
        }

        await this.makeYouTubeRequest(
            '/thumbnails/set',
            'POST',
            thumbnail.data,
            {
                videoId: videoId
            }
        );
    }

    /**
     * Get error code from error message
     */
    private getErrorCode(message: string): string {
        if (message.includes('quota')) return 'QUOTA_EXCEEDED';
        if (message.includes('401') || message.includes('unauthorized')) return 'INVALID_TOKEN';
        if (message.includes('403') || message.includes('forbidden')) return 'INSUFFICIENT_PERMISSIONS';
        if (message.includes('404')) return 'NOT_FOUND';
        if (message.includes('rate limit')) return 'RATE_LIMIT';
        return 'ERROR';
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.commonSocialParams;
        const specificParams: ActionParam[] = [
            {
                Name: 'Title',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Description',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Tags',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CategoryID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PrivacyStatus',
                Type: 'Input',
                Value: 'private'
            },
            {
                Name: 'VideoFile',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ThumbnailFile',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'NotifySubscribers',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'PublishAt',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'VideoDetails',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'VideoID',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'VideoURL',
                Type: 'Output',
                Value: null
            }
        ];
        return [...baseParams, ...specificParams];
    }

    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Uploads a video to YouTube with metadata, thumbnail, and scheduling options';
    }
}