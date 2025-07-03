import { RegisterClass } from '@memberjunction/global';
import { TwitterBaseAction, Tweet } from '../twitter-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { SocialPost } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to get timeline tweets (home timeline or user timeline) from Twitter/X
 */
@RegisterClass(BaseAction, 'TwitterGetTimelineAction')
export class TwitterGetTimelineAction extends TwitterBaseAction {
    /**
     * Get timeline tweets from Twitter
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
            const timelineType = this.getParamValue(Params, 'TimelineType') || 'home'; // 'home' or 'user'
            const userId = this.getParamValue(Params, 'UserID');
            const username = this.getParamValue(Params, 'Username');
            const maxResults = this.getParamValue(Params, 'MaxResults') || 100;
            const excludeReplies = this.getParamValue(Params, 'ExcludeReplies') === true;
            const excludeRetweets = this.getParamValue(Params, 'ExcludeRetweets') === true;
            const startTime = this.getParamValue(Params, 'StartTime');
            const endTime = this.getParamValue(Params, 'EndTime');
            const sinceId = this.getParamValue(Params, 'SinceID');
            const untilId = this.getParamValue(Params, 'UntilID');

            let tweets: Tweet[] = [];
            let endpoint: string;
            const queryParams: Record<string, any> = {
                'tweet.fields': 'id,text,created_at,author_id,conversation_id,public_metrics,attachments,entities,referenced_tweets',
                'user.fields': 'id,name,username,profile_image_url,description,created_at,verified',
                'media.fields': 'url,preview_image_url,type,width,height',
                'expansions': 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id',
                'max_results': Math.min(maxResults, 100) // API limit per request
            };

            if (timelineType === 'home') {
                // Get home timeline (requires user context)
                const currentUser = await this.getCurrentUser();
                endpoint = `/users/${currentUser.id}/timelines/reverse_chronological`;
                
                // Home timeline specific parameters
                if (excludeReplies) {
                    queryParams['exclude'] = queryParams['exclude'] ? `${queryParams['exclude']},replies` : 'replies';
                }
                if (excludeRetweets) {
                    queryParams['exclude'] = queryParams['exclude'] ? `${queryParams['exclude']},retweets` : 'retweets';
                }
            } else {
                // Get user timeline
                let targetUserId: string;
                
                if (userId) {
                    targetUserId = userId;
                } else if (username) {
                    // Look up user by username
                    const userResponse = await this.axiosInstance.get(`/users/by/username/${username}`, {
                        params: { 'user.fields': 'id' }
                    });
                    targetUserId = userResponse.data.data.id;
                } else {
                    // Default to authenticated user
                    const currentUser = await this.getCurrentUser();
                    targetUserId = currentUser.id;
                }

                endpoint = `/users/${targetUserId}/tweets`;
                
                // User timeline specific parameters
                if (excludeReplies) {
                    queryParams['exclude'] = queryParams['exclude'] ? `${queryParams['exclude']},replies` : 'replies';
                }
                if (excludeRetweets) {
                    queryParams['exclude'] = queryParams['exclude'] ? `${queryParams['exclude']},retweets` : 'retweets';
                }
            }

            // Add time-based filters if provided
            if (startTime) {
                queryParams['start_time'] = this.formatTwitterDate(startTime);
            }
            if (endTime) {
                queryParams['end_time'] = this.formatTwitterDate(endTime);
            }
            if (sinceId) {
                queryParams['since_id'] = sinceId;
            }
            if (untilId) {
                queryParams['until_id'] = untilId;
            }

            // Get paginated tweets
            LogStatus(`Getting ${timelineType} timeline tweets...`);
            tweets = await this.getPaginatedTweets(endpoint, queryParams, maxResults);

            // Convert to normalized format
            const normalizedPosts: SocialPost[] = tweets.map(tweet => this.normalizePost(tweet));

            // Calculate summary statistics
            const stats = {
                totalTweets: normalizedPosts.length,
                totalLikes: 0,
                totalRetweets: 0,
                totalReplies: 0,
                totalImpressions: 0
            };

            normalizedPosts.forEach(post => {
                if (post.analytics) {
                    stats.totalLikes += post.analytics.likes;
                    stats.totalRetweets += post.analytics.shares;
                    stats.totalReplies += post.analytics.comments;
                    stats.totalImpressions += post.analytics.impressions;
                }
            });

            // Update output parameters
            const outputParams = [...Params];
            const postsParam = outputParams.find(p => p.Name === 'Posts');
            if (postsParam) postsParam.Value = normalizedPosts;
            const tweetsParam = outputParams.find(p => p.Name === 'Tweets');
            if (tweetsParam) tweetsParam.Value = tweets;
            const statsParam = outputParams.find(p => p.Name === 'Statistics');
            if (statsParam) statsParam.Value = stats;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved ${normalizedPosts.length} tweets from ${timelineType} timeline`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(error),
                Message: `Failed to get timeline: ${errorMessage}`,
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
            if (error.message.includes('Not Found')) return 'USER_NOT_FOUND';
            if (error.message.includes('Forbidden')) return 'INSUFFICIENT_PERMISSIONS';
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
                Name: 'TimelineType',
                Type: 'Input',
                Value: 'home' // 'home' or 'user'
            },
            {
                Name: 'UserID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Username',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'ExcludeReplies',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'ExcludeRetweets',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'StartTime',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'EndTime',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SinceID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'UntilID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Posts',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Tweets',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Statistics',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Gets timeline tweets from Twitter/X including home timeline or a specific user\'s timeline with filtering options';
    }
}