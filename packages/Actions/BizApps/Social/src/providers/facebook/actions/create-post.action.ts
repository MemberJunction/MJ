import { RegisterClass } from '@memberjunction/global';
import { FacebookBaseAction, CreatePostData } from '../facebook-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { MediaFile, SocialMediaErrorCode } from '../../../base/base-social.action';
import { LogStatus, LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

/**
 * Creates a new post on a Facebook page.
 * Supports text, links, images, videos, and scheduling.
 */
@RegisterClass(BaseAction, 'FacebookCreatePostAction') 
export class FacebookCreatePostAction extends FacebookBaseAction {
    /**
     * Get action description
     */
    public get Description(): string {
        return 'Creates a new post on a Facebook page with optional media attachments and scheduling';
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'PageID',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'Content',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'Link',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'MediaFiles',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'ScheduledTime',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'Tags',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'PlaceID',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'Privacy',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'Published',
                Type: 'Input',
                Value: true,
                }
        ];
    }

    /**
     * Execute the action
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Validate required parameters
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            const pageId = this.getParamValue(Params, 'PageID');
            
            if (!companyIntegrationId) {
                return {
                Success: false,
                Message: 'CompanyIntegrationID is required',
                ResultCode: 'INVALID_TOKEN'
            };
            }

            if (!pageId) {
                return {
                Success: false,
                Message: 'PageID is required',
                ResultCode: 'MISSING_REQUIRED_PARAM'
            };
            }

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId)) {
                return {
                Success: false,
                Message: 'Failed to initialize Facebook OAuth connection',
                ResultCode: 'INVALID_TOKEN'
            };
            }

            // Get parameters
            const content = this.getParamValue(Params, 'Content') as string;
            const link = this.getParamValue(Params, 'Link') as string;
            const mediaFiles = this.getParamValue(Params, 'MediaFiles') as MediaFile[];
            const scheduledTime = this.getParamValue(Params, 'ScheduledTime') as string;
            const tags = this.getParamValue(Params, 'Tags') as string[];
            const placeId = this.getParamValue(Params, 'PlaceID') as string;
            const privacy = this.getParamValue(Params, 'Privacy') as string;
            const published = this.getParamValue(Params, 'Published') !== false;

            // Validate that we have some content
            if (!content && !link && (!mediaFiles || mediaFiles.length === 0)) {
                return {
                Success: false,
                Message: 'At least one of Content, Link, or MediaFiles is required',
                ResultCode: 'MISSING_CONTENT'
            };
            }

            // Build post data
            const postData: CreatePostData = {};

            if (content) {
                postData.message = content;
            }

            if (link) {
                postData.link = link;
            }

            if (placeId) {
                postData.place = placeId;
            }

            if (tags && tags.length > 0) {
                postData.tags = tags;
            }

            if (privacy) {
                postData.privacy = {
                    value: privacy as 'EVERYONE' | 'ALL_FRIENDS' | 'FRIENDS_OF_FRIENDS' | 'SELF'
                };
            }

            postData.published = published;

            // Handle scheduling
            if (scheduledTime) {
                const scheduledDate = new Date(scheduledTime);
                const now = new Date();
                const minScheduleTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now
                const maxScheduleTime = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // 6 months from now

                if (scheduledDate < minScheduleTime) {
                    return {
                Success: false,
                Message: 'Scheduled time must be at least 10 minutes in the future',
                ResultCode: 'INVALID_SCHEDULE_TIME'
            };
                }

                if (scheduledDate > maxScheduleTime) {
                    return {
                Success: false,
                Message: 'Scheduled time cannot be more than 6 months in the future',
                ResultCode: 'INVALID_SCHEDULE_TIME'
            };
                }

                postData.scheduled_publish_time = Math.floor(scheduledDate.getTime() / 1000);
                postData.published = false; // Must be unpublished when scheduling
            }

            // Handle media uploads
            if (mediaFiles && mediaFiles.length > 0) {
                LogStatus(`Uploading ${mediaFiles.length} media files to Facebook...`);
                
                const mediaIds: string[] = [];
                for (const file of mediaFiles) {
                    try {
                        const mediaId = await this.uploadMediaToPage(pageId, file);
                        mediaIds.push(mediaId);
                        LogStatus(`Uploaded media: ${file.filename}`);
                    } catch (error) {
                        LogError(`Failed to upload media ${file.filename}: ${error}`);
                        return {
                Success: false,
                Message: `Failed to upload media: ${error instanceof Error ? error.message : 'Unknown error'}`,
                ResultCode: 'INVALID_MEDIA'
            };
                    }
                }

                // Attach media to post
                postData.attached_media = mediaIds.map(id => ({ media_fbid: id }));
            }

            // Create the post
            LogStatus('Creating Facebook post...');
            const post = await this.createPost(pageId, postData);

            LogStatus(`Facebook post created successfully: ${post.id}`);

            // Return normalized post data
            const normalizedPost = this.normalizePost(post);

            // Update output parameters
            const outputParams = [...Params];
            // TODO: Set output parameters based on result
            
            return {
                Success: true,
                Message: scheduledTime ? 'Post scheduled successfully' : 'Post created successfully',
                ResultCode: 'SUCCESS',
                Params: outputParams
            };

        } catch (error) {
            LogError(`Failed to create Facebook post: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            if (this.isAuthError(error)) {
                return this.handleOAuthError(error);
            }

            return {
                Success: false,
                Message: error instanceof Error ? error.message : 'Unknown error occurred',
                ResultCode: 'ERROR'
            };
        }
    }


}