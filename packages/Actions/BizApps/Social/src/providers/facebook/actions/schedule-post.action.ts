import { RegisterClass } from '@memberjunction/global';
import { FacebookBaseAction, CreatePostData } from '../facebook-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { MediaFile, SocialMediaErrorCode } from '../../../base/base-social.action';
import { LogStatus, LogError } from '@memberjunction/core';
import axios from 'axios';

/**
 * Schedules a post to be published on a Facebook page at a future time.
 * Posts can be scheduled from 10 minutes to 6 months in the future.
 */
@RegisterClass(FacebookBaseAction, 'FacebookSchedulePostAction')
export class FacebookSchedulePostAction extends FacebookBaseAction {
    /**
     * Get action description
     */
    public get Description(): string {
        return 'Schedules a post to be published on a Facebook page at a specified future time (10 minutes to 6 months in advance)';
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
                Name: 'ScheduledTime',
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
                Name: 'TargetingRestrictions',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'AllowReschedule',
                Type: 'Input',
                Value: false,
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
            const scheduledTime = this.getParamValue(Params, 'ScheduledTime');
            
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

            if (!scheduledTime) {
                return {
                Success: false,
                Message: 'ScheduledTime is required',
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

            // Validate scheduled time
            const scheduledDate = new Date(scheduledTime);
            const now = new Date();
            const minScheduleTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes from now
            const maxScheduleTime = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000); // 6 months from now

            if (isNaN(scheduledDate.getTime())) {
                return {
                Success: false,
                Message: 'Invalid scheduled time format. Use ISO 8601 format.',
                ResultCode: 'INVALID_SCHEDULE_TIME'
            };
            }

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

            // Get parameters
            const content = this.getParamValue(Params, 'Content') as string;
            const link = this.getParamValue(Params, 'Link') as string;
            const mediaFiles = this.getParamValue(Params, 'MediaFiles') as MediaFile[];
            const tags = this.getParamValue(Params, 'Tags') as string[];
            const placeId = this.getParamValue(Params, 'PlaceID') as string;
            const targetingRestrictions = this.getParamValue(Params, 'TargetingRestrictions') as any;
            const allowReschedule = this.getParamValue(Params, 'AllowReschedule') as boolean;

            // Validate that we have some content
            if (!content && !link && (!mediaFiles || mediaFiles.length === 0)) {
                return {
                Success: false,
                Message: 'At least one of Content, Link, or MediaFiles is required',
                ResultCode: 'MISSING_CONTENT'
            };
            }

            // Check for scheduling conflicts if requested
            if (!allowReschedule) {
                const hasConflict = await this.checkSchedulingConflict(pageId, scheduledDate);
                if (hasConflict) {
                    return {
                Success: false,
                Message: 'Another post is already scheduled within 5 minutes of this time',
                ResultCode: 'SCHEDULE_CONFLICT'
            };
                }
            }

            // Build post data
            const postData: CreatePostData = {
                scheduled_publish_time: Math.floor(scheduledDate.getTime() / 1000),
                published: false // Must be false for scheduled posts
            };

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

            if (targetingRestrictions) {
                (postData as any).targeting = targetingRestrictions;
            }

            // Handle media uploads
            if (mediaFiles && mediaFiles.length > 0) {
                LogStatus(`Uploading ${mediaFiles.length} media files for scheduled post...`);
                
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

            // Create the scheduled post
            LogStatus(`Scheduling Facebook post for ${scheduledDate.toISOString()}...`);
            const post = await this.createPost(pageId, postData);

            // Get the scheduled post details
            const scheduledPost = await this.getScheduledPost(pageId, post.id);

            LogStatus(`Facebook post scheduled successfully: ${post.id}`);

            return {
                Success: true,
                Message: `Post scheduled for ${scheduledDate.toISOString()}`,
                ResultCode: 'SUCCESS',
                Params
            };

        } catch (error) {
            LogError(`Failed to schedule Facebook post: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
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

    /**
     * Check if there's a scheduling conflict within 5 minutes
     */
    private async checkSchedulingConflict(pageId: string, scheduledTime: Date): Promise<boolean> {
        try {
            const pageToken = await this.getPageAccessToken(pageId);
            const fiveMinutesBefore = new Date(scheduledTime.getTime() - 5 * 60 * 1000);
            const fiveMinutesAfter = new Date(scheduledTime.getTime() + 5 * 60 * 1000);

            // Get scheduled posts in the time window
            const response = await axios.get(`${this.apiBaseUrl}/${pageId}/scheduled_posts`, {
                params: {
                    access_token: pageToken,
                    since: Math.floor(fiveMinutesBefore.getTime() / 1000),
                    until: Math.floor(fiveMinutesAfter.getTime() / 1000),
                    limit: 10
                }
            });

            const scheduledPosts = response.data.data || [];
            return scheduledPosts.length > 0;
        } catch (error) {
            LogError(`Failed to check scheduling conflicts: ${error}`);
            return false; // Don't block on error
        }
    }

    /**
     * Get details of a scheduled post
     */
    private async getScheduledPost(pageId: string, postId: string): Promise<any> {
        try {
            const pageToken = await this.getPageAccessToken(pageId);
            
            const response = await axios.get(`${this.apiBaseUrl}/${postId}`, {
                params: {
                    access_token: pageToken,
                    fields: 'id,message,scheduled_publish_time,is_published'
                }
            });

            return response.data;
        } catch (error) {
            LogError(`Failed to get scheduled post details: ${error}`);
            return null;
        }
    }


}