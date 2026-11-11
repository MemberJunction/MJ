import { RegisterClass } from '@memberjunction/global';
import { InstagramBaseAction } from '../instagram-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

/**
 * Validates a request to schedule an Instagram post, then refuses it with `NOT_SUPPORTED`: Instagram's Graph API has
 * no scheduling endpoint and this action stores nothing for a later publish (#3790). It used to report SUCCESS with a
 * made-up scheduling ID while nothing was stored or sent.
 */
@RegisterClass(BaseAction, 'Instagram - Schedule Post')
export class InstagramSchedulePostAction extends InstagramBaseAction {
    
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const companyIntegrationId = this.getParamValue(params.Params, 'CompanyIntegrationID');
            const mediaUrls = this.getParamValue(params.Params, 'MediaUrls') as string[];
            const scheduledTime = this.getParamValue(params.Params, 'ScheduledTime');

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId, params)) {
                return {
                    Success: false,
                    Message: 'Failed to initialize Instagram authentication',
                    ResultCode: 'AUTH_FAILED'
                };
            }

            // Validate inputs
            if (!scheduledTime) {
                return {
                    Success: false,
                    Message: 'ScheduledTime is required',
                    ResultCode: 'MISSING_PARAMS'
                };
            }

            if (!mediaUrls || mediaUrls.length === 0) {
                return {
                    Success: false,
                    Message: 'At least one media URL is required',
                    ResultCode: 'MISSING_MEDIA'
                };
            }

            // Validate scheduled time
            const scheduleDate = new Date(scheduledTime);
            const now = new Date();
            
            if (scheduleDate <= now) {
                return {
                    Success: false,
                    Message: 'Scheduled time must be in the future',
                    ResultCode: 'INVALID_SCHEDULE_TIME'
                };
            }

            // Instagram requires scheduling at least 10 minutes in the future
            const minScheduleTime = new Date(now.getTime() + 10 * 60 * 1000);
            if (scheduleDate < minScheduleTime) {
                return {
                    Success: false,
                    Message: 'Posts must be scheduled at least 10 minutes in the future',
                    ResultCode: 'SCHEDULE_TOO_SOON'
                };
            }

            // Instagram limits scheduling to 75 days in the future
            const maxScheduleTime = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000);
            if (scheduleDate > maxScheduleTime) {
                return {
                    Success: false,
                    Message: 'Posts cannot be scheduled more than 75 days in the future',
                    ResultCode: 'SCHEDULE_TOO_FAR'
                };
            }

            // Instagram's Graph API has no scheduling endpoint, and this action stores nothing for a later
            // publish. It used to return SUCCESS with a made-up scheduling ID (#3790); it now says so.
            return {
                Success: false,
                Message:
                    'Instagram has no scheduling API, and this action does not store posts for later publishing, so the post was not scheduled. ' +
                    'Publish it at the chosen time with the "Instagram - Create Post" action, or schedule it in Meta Business Suite.',
                ResultCode: 'NOT_SUPPORTED',
                Params: params.Params
            };

        } catch (error: any) {
            LogError('Failed to schedule Instagram post', error);
            
            if (error.code === 'RATE_LIMIT') {
                return {
                    Success: false,
                    Message: 'Instagram API rate limit exceeded. Please try again later.',
                    ResultCode: 'RATE_LIMIT'
                };
            }

            return {
                Success: false,
                Message: `Failed to schedule post: ${error.message}`,
                ResultCode: 'ERROR'
            };
        }
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
                Value: null
            },
            {
                Name: 'MediaUrls',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ScheduledTime',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PostType',
                Type: 'Input',
                Value: 'FEED'
            },
            {
                Name: 'LocationID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'TaggedUsers',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'FirstComment',
                Type: 'Input',
                Value: null
            }
        ];
    }

    /**
     * Get the description for this action
     */
    public get Description(): string {
        return 'Schedules an Instagram post for future publication. Returns scheduling data that can be used with Creator Studio or custom scheduling solutions.';
    }
}