import { RegisterClass } from '@memberjunction/global';
import { InstagramBaseAction } from '../instagram-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/core';
import { MediaFile } from '../../../base/base-social.action';

/**
 * Creates a new Instagram post (feed post, carousel, or reel).
 * Supports images and videos with captions, hashtags, and location tagging.
 */
@RegisterClass(InstagramBaseAction, 'Instagram - Create Post')
export class InstagramCreatePostAction extends InstagramBaseAction {
    
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const companyIntegrationId = this.getParamValue(params.Params, 'CompanyIntegrationID');
            const content = this.getParamValue(params.Params, 'Content');
            const mediaFiles = this.getParamValue(params.Params, 'MediaFiles') as MediaFile[];
            const postType = this.getParamValue(params.Params, 'PostType') || 'FEED';
            const locationId = this.getParamValue(params.Params, 'LocationID');
            const taggedUsers = this.getParamValue(params.Params, 'TaggedUsers') as string[];
            const scheduledTime = this.getParamValue(params.Params, 'ScheduledTime');

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId)) {
                return {
                    Success: false,
                    Message: 'Failed to initialize Instagram authentication',
                    ResultCode: 'AUTH_FAILED'
                };
            }

            // Validate inputs
            if (!mediaFiles || mediaFiles.length === 0) {
                return {
                    Success: false,
                    Message: 'At least one media file is required for Instagram posts',
                    ResultCode: 'MISSING_MEDIA'
                };
            }

            // Instagram has specific requirements for different post types
            if (postType === 'CAROUSEL' && mediaFiles.length < 2) {
                return {
                    Success: false,
                    Message: 'Carousel posts require at least 2 media files',
                    ResultCode: 'INVALID_CAROUSEL'
                };
            }

            if (postType === 'REELS' && (!mediaFiles[0].mimeType.startsWith('video/') || mediaFiles.length > 1)) {
                return {
                    Success: false,
                    Message: 'Reels require exactly one video file',
                    ResultCode: 'INVALID_REEL'
                };
            }

            // Handle scheduled posts differently
            if (scheduledTime) {
                const scheduleDate = new Date(scheduledTime);
                if (scheduleDate <= new Date()) {
                    return {
                        Success: false,
                        Message: 'Scheduled time must be in the future',
                        ResultCode: 'INVALID_SCHEDULE_TIME'
                    };
                }
                
                // Instagram requires Facebook Creator Studio for scheduling
                return {
                    Success: false,
                    Message: 'Instagram post scheduling requires Facebook Creator Studio integration',
                    ResultCode: 'SCHEDULING_NOT_SUPPORTED'
                };
            }

            let postId: string;

            if (postType === 'CAROUSEL') {
                postId = await this.createCarouselPost(mediaFiles, content, locationId, taggedUsers);
            } else if (postType === 'REELS') {
                postId = await this.createReelPost(mediaFiles[0], content, locationId, taggedUsers);
            } else {
                postId = await this.createFeedPost(mediaFiles[0], content, locationId, taggedUsers);
            }

            // Store result in output params
            const outputParams = [...params.Params];
            outputParams.push({
                Name: 'PostID',
                Type: 'Output',
                Value: postId
            });
            outputParams.push({
                Name: 'Permalink',
                Type: 'Output',
                Value: `https://www.instagram.com/p/${postId}/`
            });
            outputParams.push({
                Name: 'PostType',
                Type: 'Output',
                Value: postType
            });

            return {
                Success: true,
                Message: `Instagram ${postType.toLowerCase()} created successfully`,
                ResultCode: 'SUCCESS',
                Params: outputParams
            };

        } catch (error: any) {
            LogError('Failed to create Instagram post', error);
            
            if (error.code === 'RATE_LIMIT') {
                return {
                    Success: false,
                    Message: 'Instagram API rate limit exceeded. Please try again later.',
                    ResultCode: 'RATE_LIMIT'
                };
            }

            if (error.code === 'INVALID_MEDIA') {
                return {
                    Success: false,
                    Message: error.message,
                    ResultCode: 'INVALID_MEDIA'
                };
            }

            return {
                Success: false,
                Message: `Failed to create Instagram post: ${error.message}`,
                ResultCode: 'ERROR'
            };
        }
    }

    /**
     * Create a standard feed post (single image or video)
     */
    private async createFeedPost(
        mediaFile: MediaFile,
        caption: string,
        locationId?: string,
        taggedUsers?: string[]
    ): Promise<string> {
        // Add metadata to media file
        (mediaFile as any).metadata = { caption };

        // Upload media and get container ID
        const containerId = await this.uploadSingleMedia(mediaFile);

        // Wait for media to be processed
        await this.waitForMediaContainer(containerId);

        // Add additional parameters if provided
        const publishParams: any = {
            creation_id: containerId,
            access_token: this.getAccessToken()
        };

        if (locationId) {
            publishParams.location_id = locationId;
        }

        if (taggedUsers && taggedUsers.length > 0) {
            publishParams.user_tags = taggedUsers.map(userId => ({
                username: userId,
                x: 0.5, // Center of image
                y: 0.5
            }));
        }

        // Publish the post
        const response = await this.makeInstagramRequest<{ id: string }>(
            `${this.instagramBusinessAccountId}/media_publish`,
            'POST',
            publishParams
        );

        return response.id;
    }

    /**
     * Create a carousel post (multiple images/videos)
     */
    private async createCarouselPost(
        mediaFiles: MediaFile[],
        caption: string,
        locationId?: string,
        taggedUsers?: string[]
    ): Promise<string> {
        // Upload all media items as carousel items
        const containerIds: string[] = [];
        
        for (const file of mediaFiles.slice(0, 10)) { // Instagram allows max 10 items
            file.filename = `carousel_${file.filename}`; // Mark as carousel item
            const containerId = await this.uploadSingleMedia(file);
            containerIds.push(containerId);
        }

        // Wait for all media to be processed
        await Promise.all(containerIds.map(id => this.waitForMediaContainer(id)));

        // Create carousel container
        const carouselParams: any = {
            media_type: 'CAROUSEL',
            children: containerIds,
            caption: caption,
            access_token: this.getAccessToken()
        };

        if (locationId) {
            carouselParams.location_id = locationId;
        }

        const carouselResponse = await this.makeInstagramRequest<{ id: string }>(
            `${this.instagramBusinessAccountId}/media`,
            'POST',
            carouselParams
        );

        // Wait for carousel container to be ready
        await this.waitForMediaContainer(carouselResponse.id);

        // Publish the carousel
        const publishResponse = await this.makeInstagramRequest<{ id: string }>(
            `${this.instagramBusinessAccountId}/media_publish`,
            'POST',
            {
                creation_id: carouselResponse.id,
                access_token: this.getAccessToken()
            }
        );

        return publishResponse.id;
    }

    /**
     * Create a Reel post
     */
    private async createReelPost(
        videoFile: MediaFile,
        caption: string,
        locationId?: string,
        taggedUsers?: string[]
    ): Promise<string> {
        // Validate video duration (Reels must be 90 seconds or less)
        // In production, you'd check the actual video duration
        
        // Add metadata
        (videoFile as any).metadata = { 
            caption,
            media_type: 'REELS'
        };

        // Upload video
        const containerId = await this.uploadSingleMedia(videoFile);

        // Wait for video to be processed (videos take longer)
        await this.waitForMediaContainer(containerId, 300000); // 5 minute timeout for videos

        // Publish the reel
        const publishParams: any = {
            creation_id: containerId,
            access_token: this.getAccessToken()
        };

        if (locationId) {
            publishParams.location_id = locationId;
        }

        const response = await this.makeInstagramRequest<{ id: string }>(
            `${this.instagramBusinessAccountId}/media_publish`,
            'POST',
            publishParams
        );

        return response.id;
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'Content',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'MediaFiles',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'PostType',
                Type: 'Input',
                Value: 'FEED',
            },
            {
                Name: 'LocationID',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'TaggedUsers',
                Type: 'Input',
                Value: null,
            },
            {
                Name: 'ScheduledTime',
                Type: 'Input',
                Value: null,
            }
        ];
    }

    /**
     * Get the description for this action
     */
    public get Description(): string {
        return 'Creates a new Instagram post with images or videos. Supports feed posts, carousels, and reels.';
    }
}