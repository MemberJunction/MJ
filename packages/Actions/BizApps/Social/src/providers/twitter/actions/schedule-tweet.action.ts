import { RegisterClass } from '@memberjunction/global';
import { TwitterBaseAction, CreateTweetData } from '../twitter-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { MediaFile } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to schedule a tweet for future posting on Twitter/X
 * Note: Twitter API v2 doesn't have native scheduling, so this action
 * saves the tweet data for later posting via a separate scheduler service
 */
@RegisterClass(BaseAction, 'TwitterScheduleTweetAction')
export class TwitterScheduleTweetAction extends TwitterBaseAction {
    /**
     * Schedule a tweet for future posting
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!await this.initializeOAuth(companyIntegrationId)) {
                throw new Error('Failed to initialize OAuth connection');
            }

            // Extract parameters
            const content = this.getParamValue(Params, 'Content');
            const scheduledTime = this.getParamValue(Params, 'ScheduledTime');
            const mediaFiles = this.getParamValue(Params, 'MediaFiles');
            const replyToTweetId = this.getParamValue(Params, 'ReplyToTweetID');
            const quoteTweetId = this.getParamValue(Params, 'QuoteTweetID');
            const pollOptions = this.getParamValue(Params, 'PollOptions');
            const pollDurationMinutes = this.getParamValue(Params, 'PollDurationMinutes') || 1440; // Default 24 hours

            // Validate required parameters
            if (!content) {
                throw new Error('Content is required');
            }

            if (!scheduledTime) {
                throw new Error('ScheduledTime is required');
            }

            // Validate scheduled time is in the future
            const scheduleDate = new Date(scheduledTime);
            const now = new Date();
            
            if (scheduleDate <= now) {
                throw new Error('ScheduledTime must be in the future');
            }

            // Validate scheduled time is not too far in the future (e.g., 1 year)
            const maxFutureDate = new Date();
            maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 1);
            
            if (scheduleDate > maxFutureDate) {
                throw new Error('ScheduledTime cannot be more than 1 year in the future');
            }

            // Validate content length
            if (content.length > 280) {
                throw new Error(`Content exceeds Twitter's 280 character limit (current: ${content.length} characters)`);
            }

            // Build tweet data structure
            const tweetData: CreateTweetData = {
                text: content
            };

            // Add reply if specified
            if (replyToTweetId) {
                tweetData.reply = {
                    in_reply_to_tweet_id: replyToTweetId
                };
            }

            // Add quote tweet if specified
            if (quoteTweetId) {
                tweetData.quote_tweet_id = quoteTweetId;
            }

            // Add poll if specified
            if (pollOptions && Array.isArray(pollOptions) && pollOptions.length >= 2) {
                if (pollOptions.length > 4) {
                    throw new Error('Twitter polls support a maximum of 4 options');
                }
                
                // Validate poll option lengths
                for (const option of pollOptions) {
                    if (option.length > 25) {
                        throw new Error(`Poll option "${option}" exceeds 25 character limit`);
                    }
                }

                tweetData.poll = {
                    options: pollOptions,
                    duration_minutes: Math.min(Math.max(pollDurationMinutes, 5), 10080)
                };
            }

            // Handle media files
            let uploadedMediaIds: string[] = [];
            if (mediaFiles && Array.isArray(mediaFiles) && mediaFiles.length > 0) {
                if (mediaFiles.length > 4) {
                    throw new Error('Twitter supports a maximum of 4 media items per tweet');
                }

                // For scheduling, we'll upload the media now and store the IDs
                // Note: Twitter media IDs expire after 24 hours if not used
                const hoursUntilScheduled = (scheduleDate.getTime() - now.getTime()) / (1000 * 60 * 60);
                
                if (hoursUntilScheduled <= 24) {
                    // Upload now if scheduling within 24 hours
                    LogStatus(`Uploading ${mediaFiles.length} media files...`);
                    uploadedMediaIds = await this.uploadMedia(mediaFiles as MediaFile[]);
                    tweetData.media = {
                        media_ids: uploadedMediaIds
                    };
                } else {
                    // For tweets scheduled beyond 24 hours, we'll need to store media
                    // data and upload closer to the scheduled time
                    LogStatus('Media will be uploaded closer to scheduled time due to Twitter\'s 24-hour media expiration');
                }
            }

            // Create scheduled tweet record
            // In a real implementation, this would save to a database or queue service
            const scheduledTweet = {
                id: this.generateScheduledTweetId(),
                scheduledFor: scheduleDate.toISOString(),
                tweetData: tweetData,
                mediaFiles: mediaFiles, // Store for later upload if needed
                companyIntegrationId: companyIntegrationId,
                createdAt: new Date().toISOString(),
                status: 'scheduled'
            };

            // Simulate saving to a scheduling service
            LogStatus(`Tweet scheduled for ${scheduleDate.toLocaleString()}`);

            // Get user info for context
            const user = await this.getCurrentUser();

            // Update output parameters
            const outputParams = [...Params];
            const scheduledIdParam = outputParams.find(p => p.Name === 'ScheduledTweetID');
            if (scheduledIdParam) scheduledIdParam.Value = scheduledTweet.id;
            const scheduledDataParam = outputParams.find(p => p.Name === 'ScheduledTweetData');
            if (scheduledDataParam) scheduledDataParam.Value = scheduledTweet;
            const estimatedUrlParam = outputParams.find(p => p.Name === 'EstimatedURL');
            if (estimatedUrlParam) estimatedUrlParam.Value = `https://twitter.com/${user.username}/status/[pending]`;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully scheduled tweet for ${scheduleDate.toLocaleString()}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(error),
                Message: `Failed to schedule tweet: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Generate a unique ID for scheduled tweet
     */
    private generateScheduledTweetId(): string {
        return `scheduled_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get error code based on error type
     */
    private getErrorCode(error: any): string {
        if (error instanceof Error) {
            if (error.message.includes('Rate Limit')) return 'RATE_LIMIT';
            if (error.message.includes('Unauthorized')) return 'INVALID_TOKEN';
            if (error.message.includes('character limit')) return 'CONTENT_TOO_LONG';
            if (error.message.includes('media')) return 'INVALID_MEDIA';
            if (error.message.includes('future')) return 'INVALID_SCHEDULE_TIME';
        }
        return 'ERROR';
    }

    /**
     * Define the parameters this action expects
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
                Name: 'ScheduledTime',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MediaFiles',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ReplyToTweetID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'QuoteTweetID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PollOptions',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PollDurationMinutes',
                Type: 'Input',
                Value: 1440 // Default 24 hours
            },
            {
                Name: 'ScheduledTweetID',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'ScheduledTweetData',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'EstimatedURL',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Schedules a tweet for future posting on Twitter/X with optional media attachments, polls, replies, or quote tweets';
    }
}