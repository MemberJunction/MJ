import { RegisterClass } from '@memberjunction/global';
import { TwitterBaseAction, Tweet, TwitterMetrics } from '../twitter-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { SocialAnalytics } from '../../../base/base-social.action';

/**
 * Action to get analytics for tweets or user account from Twitter/X
 */
@RegisterClass(BaseAction, 'TwitterGetAnalyticsAction')
export class TwitterGetAnalyticsAction extends TwitterBaseAction {
    /**
     * Get analytics from Twitter
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
            const analyticsType = this.getParamValue(Params, 'AnalyticsType') || 'account'; // 'account' or 'tweets'
            const tweetIds = this.getParamValue(Params, 'TweetIDs');
            const startDate = this.getParamValue(Params, 'StartDate');
            const endDate = this.getParamValue(Params, 'EndDate');
            const granularity = this.getParamValue(Params, 'Granularity') || 'day'; // 'hour', 'day', 'total'

            if (analyticsType === 'tweets') {
                // Get analytics for specific tweets
                if (!tweetIds || !Array.isArray(tweetIds) || tweetIds.length === 0) {
                    throw new Error('TweetIDs array is required for tweet analytics');
                }

                return await this.getTweetAnalytics(Params, tweetIds);
            } else {
                // Get account-level analytics
                return await this.getAccountAnalytics(Params, startDate, endDate, granularity);
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(error),
                Message: `Failed to get analytics: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Get analytics for specific tweets
     */
    private async getTweetAnalytics(params: ActionParam[], tweetIds: string[]): Promise<ActionResultSimple> {
        try {
            LogStatus(`Getting analytics for ${tweetIds.length} tweets...`);

            // Twitter API v2 requires organic metrics scope for detailed analytics
            // We'll get public metrics for each tweet
            const tweetAnalytics: any[] = [];
            
            // Process in batches of 100 (API limit)
            const batchSize = 100;
            for (let i = 0; i < tweetIds.length; i += batchSize) {
                const batch = tweetIds.slice(i, i + batchSize);
                const ids = batch.join(',');

                const response = await this.axiosInstance.get('/tweets', {
                    params: {
                        'ids': ids,
                        'tweet.fields': 'id,text,created_at,public_metrics,organic_metrics,promoted_metrics',
                        'expansions': 'author_id',
                        'user.fields': 'id,username'
                    }
                });

                if (response.data.data) {
                    for (const tweet of response.data.data) {
                        const metrics: TwitterMetrics = {
                            impression_count: 0,
                            engagement_count: 0,
                            retweet_count: 0,
                            reply_count: 0,
                            like_count: 0,
                            quote_count: 0,
                            bookmark_count: 0,
                            url_link_clicks: 0,
                            user_profile_clicks: 0
                        };

                        // Combine public and organic metrics if available
                        if (tweet.public_metrics) {
                            Object.assign(metrics, tweet.public_metrics);
                        }
                        if (tweet.organic_metrics) {
                            Object.assign(metrics, tweet.organic_metrics);
                        }

                        // Calculate engagement count
                        metrics.engagement_count = 
                            metrics.retweet_count + 
                            metrics.reply_count + 
                            metrics.like_count + 
                            metrics.quote_count +
                            metrics.url_link_clicks +
                            metrics.user_profile_clicks;

                        const normalizedAnalytics = this.normalizeAnalytics(metrics);

                        tweetAnalytics.push({
                            tweetId: tweet.id,
                            text: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
                            createdAt: tweet.created_at,
                            metrics: normalizedAnalytics,
                            engagementRate: metrics.impression_count > 0 
                                ? ((metrics.engagement_count / metrics.impression_count) * 100).toFixed(2) + '%'
                                : '0%'
                        });
                    }
                }
            }

            // Calculate aggregate metrics
            const aggregateMetrics = this.calculateAggregateMetrics(tweetAnalytics);

            // Update output parameters
            const outputParams = [...params];
            const analyticsParam = outputParams.find(p => p.Name === 'Analytics');
            if (analyticsParam) analyticsParam.Value = tweetAnalytics;
            const aggregateParam = outputParams.find(p => p.Name === 'AggregateMetrics');
            if (aggregateParam) aggregateParam.Value = aggregateMetrics;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved analytics for ${tweetAnalytics.length} tweets`,
                Params: outputParams
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Get account-level analytics
     */
    private async getAccountAnalytics(
        params: ActionParam[], 
        startDate?: string, 
        endDate?: string, 
        granularity?: string
    ): Promise<ActionResultSimple> {
        try {
            // Get current user
            const currentUser = await this.getCurrentUser();
            
            LogStatus(`Getting account analytics for @${currentUser.username}...`);

            // For account analytics, we'll analyze recent tweets performance
            const queryParams: Record<string, any> = {
                'tweet.fields': 'id,text,created_at,public_metrics,organic_metrics',
                'max_results': 100
            };

            if (startDate) {
                queryParams['start_time'] = this.formatTwitterDate(startDate);
            }
            if (endDate) {
                queryParams['end_time'] = this.formatTwitterDate(endDate);
            }

            // Get user's tweets
            const tweets = await this.getPaginatedTweets(
                `/users/${currentUser.id}/tweets`, 
                queryParams, 
                200 // Get up to 200 tweets for analysis
            );

            // Calculate time-based analytics
            const timeBasedAnalytics = this.calculateTimeBasedAnalytics(tweets, granularity || 'day');

            // Calculate overall metrics
            const overallMetrics = {
                totalTweets: tweets.length,
                totalImpressions: 0,
                totalEngagements: 0,
                totalLikes: 0,
                totalRetweets: 0,
                totalReplies: 0,
                totalQuotes: 0,
                averageEngagementRate: 0,
                topPerformingTweets: [] as any[]
            };

            tweets.forEach(tweet => {
                if (tweet.public_metrics) {
                    overallMetrics.totalImpressions += tweet.public_metrics.impression_count || 0;
                    overallMetrics.totalLikes += tweet.public_metrics.like_count || 0;
                    overallMetrics.totalRetweets += tweet.public_metrics.retweet_count || 0;
                    overallMetrics.totalReplies += tweet.public_metrics.reply_count || 0;
                    overallMetrics.totalQuotes += tweet.public_metrics.quote_count || 0;
                    
                    const engagement = 
                        (tweet.public_metrics.like_count || 0) +
                        (tweet.public_metrics.retweet_count || 0) +
                        (tweet.public_metrics.reply_count || 0) +
                        (tweet.public_metrics.quote_count || 0);
                    
                    overallMetrics.totalEngagements += engagement;
                }
            });

            // Calculate average engagement rate
            if (overallMetrics.totalImpressions > 0) {
                overallMetrics.averageEngagementRate = 
                    parseFloat(((overallMetrics.totalEngagements / overallMetrics.totalImpressions) * 100).toFixed(2));
            }

            // Get top performing tweets
            overallMetrics.topPerformingTweets = tweets
                .filter(t => t.public_metrics)
                .sort((a, b) => {
                    const aEngagement = this.calculateTweetEngagement(a.public_metrics!);
                    const bEngagement = this.calculateTweetEngagement(b.public_metrics!);
                    return bEngagement - aEngagement;
                })
                .slice(0, 5)
                .map(tweet => ({
                    id: tweet.id,
                    text: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
                    createdAt: tweet.created_at,
                    metrics: tweet.public_metrics,
                    engagement: this.calculateTweetEngagement(tweet.public_metrics!)
                }));

            // Update output parameters
            const outputParams = [...params];
            const overallParam = outputParams.find(p => p.Name === 'OverallMetrics');
            if (overallParam) overallParam.Value = overallMetrics;
            const timeBasedParam = outputParams.find(p => p.Name === 'TimeBasedAnalytics');
            if (timeBasedParam) timeBasedParam.Value = timeBasedAnalytics;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved account analytics for ${tweets.length} tweets`,
                Params: outputParams
            };

        } catch (error) {
            throw error;
        }
    }

    /**
     * Calculate aggregate metrics from tweet analytics
     */
    private calculateAggregateMetrics(tweetAnalytics: any[]): any {
        const aggregate = {
            totalImpressions: 0,
            totalEngagements: 0,
            totalLikes: 0,
            totalRetweets: 0,
            totalReplies: 0,
            averageEngagementRate: 0,
            bestPerformingTweet: null as any,
            worstPerformingTweet: null as any
        };

        let bestEngagement = -1;
        let worstEngagement = Infinity;

        tweetAnalytics.forEach(analytics => {
            const metrics = analytics.metrics;
            aggregate.totalImpressions += metrics.impressions;
            aggregate.totalEngagements += metrics.engagements;
            aggregate.totalLikes += metrics.likes;
            aggregate.totalRetweets += metrics.shares;
            aggregate.totalReplies += metrics.comments;

            if (metrics.engagements > bestEngagement) {
                bestEngagement = metrics.engagements;
                aggregate.bestPerformingTweet = analytics;
            }
            if (metrics.engagements < worstEngagement) {
                worstEngagement = metrics.engagements;
                aggregate.worstPerformingTweet = analytics;
            }
        });

        if (aggregate.totalImpressions > 0) {
            aggregate.averageEngagementRate = 
                parseFloat(((aggregate.totalEngagements / aggregate.totalImpressions) * 100).toFixed(2));
        }

        return aggregate;
    }

    /**
     * Calculate time-based analytics
     */
    private calculateTimeBasedAnalytics(tweets: Tweet[], granularity: string): any[] {
        const buckets: Map<string, any> = new Map();

        tweets.forEach(tweet => {
            const date = new Date(tweet.created_at);
            let bucketKey: string;

            switch (granularity) {
                case 'hour':
                    bucketKey = `${date.toISOString().slice(0, 13)}:00:00Z`;
                    break;
                case 'day':
                    bucketKey = date.toISOString().slice(0, 10);
                    break;
                case 'total':
                    bucketKey = 'total';
                    break;
                default:
                    bucketKey = date.toISOString().slice(0, 10);
            }

            if (!buckets.has(bucketKey)) {
                buckets.set(bucketKey, {
                    period: bucketKey,
                    tweets: 0,
                    impressions: 0,
                    engagements: 0,
                    likes: 0,
                    retweets: 0,
                    replies: 0
                });
            }

            const bucket = buckets.get(bucketKey)!;
            bucket.tweets++;

            if (tweet.public_metrics) {
                bucket.impressions += tweet.public_metrics.impression_count || 0;
                bucket.likes += tweet.public_metrics.like_count || 0;
                bucket.retweets += tweet.public_metrics.retweet_count || 0;
                bucket.replies += tweet.public_metrics.reply_count || 0;
                bucket.engagements += this.calculateTweetEngagement(tweet.public_metrics);
            }
        });

        return Array.from(buckets.values()).sort((a, b) => 
            a.period.localeCompare(b.period)
        );
    }

    /**
     * Calculate tweet engagement from public metrics
     */
    private calculateTweetEngagement(metrics: any): number {
        return (metrics.like_count || 0) +
               (metrics.retweet_count || 0) +
               (metrics.reply_count || 0) +
               (metrics.quote_count || 0);
    }

    /**
     * Get error code based on error type
     */
    private getErrorCode(error: any): string {
        if (error instanceof Error) {
            if (error.message.includes('Rate Limit')) return 'RATE_LIMIT';
            if (error.message.includes('Unauthorized')) return 'INVALID_TOKEN';
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
                Name: 'AnalyticsType',
                Type: 'Input',
                Value: 'account' // 'account' or 'tweets'
            },
            {
                Name: 'TweetIDs',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'StartDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'EndDate',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Granularity',
                Type: 'Input',
                Value: 'day' // 'hour', 'day', 'total'
            },
            {
                Name: 'Analytics',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'AggregateMetrics',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'OverallMetrics',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'TimeBasedAnalytics',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Gets analytics data from Twitter/X for specific tweets or account-level metrics with time-based analysis';
    }
}