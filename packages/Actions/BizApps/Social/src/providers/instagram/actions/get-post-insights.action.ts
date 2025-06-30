import { RegisterClass } from '@memberjunction/global';
import { InstagramBaseAction } from '../instagram-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/core';

/**
 * Retrieves detailed insights and analytics for a specific Instagram post.
 * Available metrics vary by post type (feed, reels, stories).
 */
@RegisterClass(InstagramBaseAction, 'Instagram - Get Post Insights')
export class InstagramGetPostInsightsAction extends InstagramBaseAction {
    
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const companyIntegrationId = this.getParamValue(params.Params, 'CompanyIntegrationID');
            const postId = this.getParamValue(params.Params, 'PostID');
            const metricTypes = this.getParamValue(params.Params, 'MetricTypes') as string[];
            const period = this.getParamValue(params.Params, 'Period') || 'lifetime';

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId)) {
                return {
                    Success: false,
                    Message: 'Failed to initialize Instagram authentication',
                    ResultCode: 'AUTH_FAILED'
                };
            }

            // Validate inputs
            if (!postId) {
                return {
                    Success: false,
                    Message: 'PostID is required',
                    ResultCode: 'MISSING_PARAMS'
                };
            }

            // First, get the post details to determine its type
            const postDetails = await this.getPostDetails(postId);
            if (!postDetails) {
                return {
                    Success: false,
                    Message: 'Post not found or access denied',
                    ResultCode: 'POST_NOT_FOUND'
                };
            }

            // Determine available metrics based on post type
            const availableMetrics = this.getAvailableMetrics(postDetails.media_type);
            const requestedMetrics = metricTypes && metricTypes.length > 0 
                ? metricTypes.filter(m => availableMetrics.includes(m))
                : availableMetrics;

            if (requestedMetrics.length === 0) {
                return {
                    Success: false,
                    Message: 'No valid metrics specified for this post type',
                    ResultCode: 'INVALID_METRICS'
                };
            }

            // Get insights
            const insights = await this.getInsights(postId, requestedMetrics, period as any);

            // Parse and structure the insights data
            const parsedInsights = this.parseInsightsData(insights);

            // Calculate engagement rate
            const engagementRate = this.calculateEngagementRate(parsedInsights, postDetails);

            // Store result in output params
            const outputParams = [...params.Params];
            outputParams.push({
                Name: 'ResultData',
                Type: 'Output',
                Value: JSON.stringify({
                    postId,
                    postType: postDetails.media_type,
                    permalink: postDetails.permalink,
                    publishedAt: postDetails.timestamp,
                    metrics: parsedInsights,
                    summary: {
                        engagementRate,
                        totalEngagements: this.calculateTotalEngagements(parsedInsights),
                        performanceScore: this.calculatePerformanceScore(parsedInsights)
                    },
                    period,
                    dataCollectedAt: new Date().toISOString()
                })
            });

            return {
                Success: true,
                Message: 'Successfully retrieved post insights',
                ResultCode: 'SUCCESS',
                Params: outputParams
            };

        } catch (error: any) {
            LogError('Failed to retrieve Instagram post insights', error);
            
            if (error.code === 'RATE_LIMIT') {
                return {
                    Success: false,
                    Message: 'Instagram API rate limit exceeded. Please try again later.',
                    ResultCode: 'RATE_LIMIT'
                };
            }

            if (error.code === 'POST_NOT_FOUND') {
                return {
                    Success: false,
                    Message: 'Instagram post not found or access denied',
                    ResultCode: 'POST_NOT_FOUND'
                };
            }

            return {
                Success: false,
                Message: `Failed to retrieve post insights: ${error.message}`,
                ResultCode: 'ERROR'
            };
        }
    }

    /**
     * Get post details including media type
     */
    private async getPostDetails(postId: string): Promise<any> {
        try {
            const response = await this.makeInstagramRequest(
                postId,
                'GET',
                null,
                {
                    fields: 'id,media_type,permalink,timestamp,caption,like_count,comments_count',
                    access_token: this.getAccessToken()
                }
            );
            return response;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get available metrics based on post type
     */
    private getAvailableMetrics(mediaType: string): string[] {
        const baseMetrics = ['impressions', 'reach', 'engagement'];

        switch (mediaType) {
            case 'IMAGE':
            case 'CAROUSEL_ALBUM':
                return [...baseMetrics, 'saved', 'shares'];
            
            case 'VIDEO':
            case 'REELS':
                return [...baseMetrics, 'saved', 'shares', 'video_views', 'avg_watch_time', 'completion_rate'];
            
            case 'STORY':
                return ['impressions', 'reach', 'exits', 'replies', 'taps_forward', 'taps_back'];
            
            default:
                return baseMetrics;
        }
    }

    /**
     * Parse insights data into a structured format
     */
    private parseInsightsData(insights: any[]): Record<string, any> {
        const parsed: Record<string, any> = {};

        insights.forEach(metric => {
            const name = metric.name;
            const values = metric.values || [];
            
            if (values.length > 0) {
                // For lifetime metrics, there's usually only one value
                const primaryValue = values[0];
                
                parsed[name] = {
                    value: primaryValue.value || 0,
                    title: metric.title,
                    description: metric.description,
                    period: metric.period
                };

                // For time series data (like daily metrics)
                if (values.length > 1) {
                    parsed[name].timeSeries = values.map((v: any) => ({
                        value: v.value,
                        endTime: v.end_time
                    }));
                }
            }
        });

        return parsed;
    }

    /**
     * Calculate engagement rate
     */
    private calculateEngagementRate(insights: Record<string, any>, postDetails: any): number {
        const reach = insights.reach?.value || postDetails.reach || 0;
        const engagement = insights.engagement?.value || 0;
        
        if (reach === 0) return 0;
        
        return Number(((engagement / reach) * 100).toFixed(2));
    }

    /**
     * Calculate total engagements
     */
    private calculateTotalEngagements(insights: Record<string, any>): number {
        const engagement = insights.engagement?.value || 0;
        const saves = insights.saved?.value || 0;
        const shares = insights.shares?.value || 0;
        
        return engagement + saves + shares;
    }

    /**
     * Calculate a performance score (0-100)
     */
    private calculatePerformanceScore(insights: Record<string, any>): number {
        // Simple scoring algorithm based on key metrics
        let score = 0;
        let factors = 0;

        // Engagement rate factor
        const reach = insights.reach?.value || 0;
        const engagement = insights.engagement?.value || 0;
        if (reach > 0) {
            const engagementRate = (engagement / reach) * 100;
            score += Math.min(engagementRate * 10, 30); // Max 30 points
            factors++;
        }

        // Reach factor (compared to impressions)
        const impressions = insights.impressions?.value || 0;
        if (impressions > 0) {
            const reachRate = (reach / impressions) * 100;
            score += Math.min(reachRate, 20); // Max 20 points
            factors++;
        }

        // Saves factor
        const saves = insights.saved?.value || 0;
        if (reach > 0) {
            const saveRate = (saves / reach) * 100;
            score += Math.min(saveRate * 20, 25); // Max 25 points
            factors++;
        }

        // Video completion rate (for videos)
        const completionRate = insights.completion_rate?.value || 0;
        if (completionRate > 0) {
            score += Math.min(completionRate, 25); // Max 25 points
            factors++;
        }

        // Normalize score
        if (factors === 0) return 0;
        
        return Math.round(Math.min(score, 100));
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'PostID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MetricTypes',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Period',
                Type: 'Input',
                Value: 'lifetime'
            }
        ];
    }

    /**
     * Get the description for this action
     */
    public get Description(): string {
        return 'Retrieves detailed analytics and insights for a specific Instagram post including impressions, reach, engagement, and more.';
    }
}