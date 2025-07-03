import { RegisterClass } from '@memberjunction/global';
import { TwitterBaseAction, CreateTweetData } from '../twitter-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { MediaFile } from '../../../base/base-social.action';

/**
 * Action to create a tweet on Twitter/X
 */
@RegisterClass(BaseAction, 'TwitterCreateTweetAction')
export class TwitterCreateTweetAction extends TwitterBaseAction {
    /**
     * Create a tweet on Twitter
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
            const mediaFiles = this.getParamValue(Params, 'MediaFiles');
            const replyToTweetId = this.getParamValue(Params, 'ReplyToTweetID');
            const quoteTweetId = this.getParamValue(Params, 'QuoteTweetID');
            const pollOptions = this.getParamValue(Params, 'PollOptions');
            const pollDurationMinutes = this.getParamValue(Params, 'PollDurationMinutes') || 1440; // Default 24 hours

            // Validate required parameters
            if (!content) {
                throw new Error('Content is required');
            }

            // Validate content length (Twitter's limit is 280 characters)
            if (content.length > 280) {
                throw new Error(`Content exceeds Twitter's 280 character limit (current: ${content.length} characters)`);
            }

            // Build tweet data
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
                
                // Validate poll option lengths (max 25 characters each)
                for (const option of pollOptions) {
                    if (option.length > 25) {
                        throw new Error(`Poll option "${option}" exceeds 25 character limit`);
                    }
                }

                tweetData.poll = {
                    options: pollOptions,
                    duration_minutes: Math.min(Math.max(pollDurationMinutes, 5), 10080) // Min 5 minutes, max 7 days
                };
            }

            // Upload media if provided
            if (mediaFiles && Array.isArray(mediaFiles) && mediaFiles.length > 0) {
                if (mediaFiles.length > 4) {
                    throw new Error('Twitter supports a maximum of 4 media items per tweet');
                }

                LogStatus(`Uploading ${mediaFiles.length} media files...`);
                const mediaIds = await this.uploadMedia(mediaFiles as MediaFile[]);
                
                tweetData.media = {
                    media_ids: mediaIds
                };
            }

            // Create the tweet
            LogStatus('Creating tweet...');
            const tweet = await this.createTweet(tweetData);

            // Normalize the created tweet
            const normalizedPost = this.normalizePost(tweet);

            // Get user info for additional context
            const user = await this.getCurrentUser();

            // Update output parameters
            const outputParams = [...Params];
            const postParam = outputParams.find(p => p.Name === 'CreatedPost');
            if (postParam) postParam.Value = normalizedPost;
            const tweetIdParam = outputParams.find(p => p.Name === 'TweetID');
            if (tweetIdParam) tweetIdParam.Value = tweet.id;
            const tweetUrlParam = outputParams.find(p => p.Name === 'TweetURL');
            if (tweetUrlParam) tweetUrlParam.Value = `https://twitter.com/${user.username}/status/${tweet.id}`;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully created tweet (ID: ${tweet.id})`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(error),
                Message: `Failed to create tweet: ${errorMessage}`,
                Params
            };
        }
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
                Name: 'CreatedPost',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'TweetID',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'TweetURL',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Creates a tweet on Twitter/X with optional media attachments, polls, replies, or quote tweets';
    }
}