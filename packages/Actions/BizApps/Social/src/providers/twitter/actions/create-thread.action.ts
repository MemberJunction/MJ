import { RegisterClass } from '@memberjunction/global';
import { TwitterBaseAction, CreateTweetData, Tweet } from '../twitter-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { MediaFile, SocialPost } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to create a thread (series of connected tweets) on Twitter/X
 */
@RegisterClass(BaseAction, 'TwitterCreateThreadAction')
export class TwitterCreateThreadAction extends TwitterBaseAction {
    /**
     * Create a thread on Twitter
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
            const tweets = this.getParamValue(Params, 'Tweets');
            const mediaFilesByTweet = this.getParamValue(Params, 'MediaFilesByTweet');
            const includeNumbers = this.getParamValue(Params, 'IncludeNumbers') !== false; // Default true
            const numberFormat = this.getParamValue(Params, 'NumberFormat') || '{n}/{total}'; // Default format

            // Validate required parameters
            if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
                throw new Error('Tweets array is required and must not be empty');
            }

            if (tweets.length < 2) {
                throw new Error('A thread must contain at least 2 tweets');
            }

            if (tweets.length > 25) {
                throw new Error('Twitter threads are limited to 25 tweets');
            }

            // Prepare tweets with numbering if requested
            const preparedTweets = includeNumbers 
                ? this.addThreadNumbers(tweets, numberFormat)
                : tweets;

            // Validate all tweet lengths
            for (let i = 0; i < preparedTweets.length; i++) {
                if (preparedTweets[i].length > 280) {
                    throw new Error(`Tweet ${i + 1} exceeds Twitter's 280 character limit (current: ${preparedTweets[i].length} characters)`);
                }
            }

            const createdTweets: Tweet[] = [];
            const createdPosts: SocialPost[] = [];
            let previousTweetId: string | undefined;

            try {
                // Create tweets in sequence
                for (let i = 0; i < preparedTweets.length; i++) {
                    LogStatus(`Creating tweet ${i + 1} of ${preparedTweets.length}...`);

                    const tweetData: CreateTweetData = {
                        text: preparedTweets[i]
                    };

                    // Reply to previous tweet in thread
                    if (previousTweetId) {
                        tweetData.reply = {
                            in_reply_to_tweet_id: previousTweetId
                        };
                    }

                    // Add media if provided for this tweet
                    if (mediaFilesByTweet && mediaFilesByTweet[i]) {
                        const mediaFiles = mediaFilesByTweet[i];
                        if (Array.isArray(mediaFiles) && mediaFiles.length > 0) {
                            if (mediaFiles.length > 4) {
                                throw new Error(`Tweet ${i + 1}: Twitter supports a maximum of 4 media items per tweet`);
                            }

                            LogStatus(`Uploading ${mediaFiles.length} media files for tweet ${i + 1}...`);
                            const mediaIds = await this.uploadMedia(mediaFiles as MediaFile[]);
                            
                            tweetData.media = {
                                media_ids: mediaIds
                            };
                        }
                    }

                    // Create the tweet
                    const tweet = await this.createTweet(tweetData);
                    createdTweets.push(tweet);
                    createdPosts.push(this.normalizePost(tweet));
                    previousTweetId = tweet.id;

                    // Small delay between tweets to avoid rate limiting
                    if (i < preparedTweets.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
                    }
                }

                // Get user info for URLs
                const user = await this.getCurrentUser();

                // Build thread URL (link to first tweet)
                const threadUrl = `https://twitter.com/${user.username}/status/${createdTweets[0].id}`;

                // Update output parameters
                const outputParams = [...Params];
                const postsParam = outputParams.find(p => p.Name === 'CreatedPosts');
                if (postsParam) postsParam.Value = createdPosts;
                const tweetIdsParam = outputParams.find(p => p.Name === 'TweetIDs');
                if (tweetIdsParam) tweetIdsParam.Value = createdTweets.map(t => t.id);
                const threadUrlParam = outputParams.find(p => p.Name === 'ThreadURL');
                if (threadUrlParam) threadUrlParam.Value = threadUrl;

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: `Successfully created thread with ${createdTweets.length} tweets`,
                    Params: outputParams
                };

            } catch (error) {
                // If thread creation fails partway through, note which tweets were created
                if (createdTweets.length > 0) {
                    LogError(`Thread creation failed after creating ${createdTweets.length} tweets. Tweet IDs: ${createdTweets.map(t => t.id).join(', ')}`);
                }
                throw error;
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(error),
                Message: `Failed to create thread: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Add thread numbers to tweets
     */
    private addThreadNumbers(tweets: string[], format: string): string[] {
        const total = tweets.length;
        
        return tweets.map((tweet, index) => {
            const number = index + 1;
            const threadNumber = format
                .replace('{n}', number.toString())
                .replace('{total}', total.toString());
            
            // Add number to beginning of tweet with a space
            return `${threadNumber} ${tweet}`;
        });
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
                Name: 'Tweets',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MediaFilesByTweet',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeNumbers',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'NumberFormat',
                Type: 'Input',
                Value: '{n}/{total}'
            },
            {
                Name: 'CreatedPosts',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'TweetIDs',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'ThreadURL',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Creates a thread (series of connected tweets) on Twitter/X with optional media attachments and automatic numbering';
    }
}