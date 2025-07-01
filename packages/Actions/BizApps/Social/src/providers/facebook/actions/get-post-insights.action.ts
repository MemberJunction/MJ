import { RegisterClass } from '@memberjunction/global';
import { FacebookBaseAction, FacebookInsight } from '../facebook-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialMediaErrorCode } from '../../../base/base-social.action';
import { LogStatus, LogError } from '@memberjunction/core';
import axios from 'axios';

/**
 * Retrieves detailed insights and analytics for a specific Facebook post.
 * Provides metrics like reach, impressions, engagement, and more.
 */
@RegisterClass(FacebookBaseAction, 'FacebookGetPostInsightsAction')
export class FacebookGetPostInsightsAction extends FacebookBaseAction {
    /**
     * Get action description
     */
    public get Description(): string {
        return 'Retrieves detailed analytics and insights for a specific Facebook post including reach, impressions, and engagement metrics';
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
                Value: null,
                },
            {
                Name: 'MetricTypes',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'Period',
                Type: 'Input',
                Value: 'lifetime',
                },
            {
                Name: 'IncludeVideoMetrics',
                Type: 'Input',
                Value: true,
                },
            {
                Name: 'IncludeDemographics',
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
            const postId = this.getParamValue(Params, 'PostID');
            
            if (!companyIntegrationId) {
                return {
                Success: false,
                Message: 'CompanyIntegrationID is required',
                ResultCode: 'INVALID_TOKEN'
            };
            }

            if (!postId) {
                return {
                Success: false,
                Message: 'PostID is required',
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
            const metricTypes = this.getParamValue(Params, 'MetricTypes') as string[];
            const period = this.getParamValue(Params, 'Period') as string || 'lifetime';
            const includeVideoMetrics = this.getParamValue(Params, 'IncludeVideoMetrics') !== false;
            const includeDemographics = this.getParamValue(Params, 'IncludeDemographics') !== false;

            LogStatus(`Retrieving insights for Facebook post ${postId}...`);

            // Extract page ID from post ID (format: pageId_postId)
            const pageId = postId.split('_')[0];
            
            // Get page access token
            const pageToken = await this.getPageAccessToken(pageId);

            // Build metrics list
            const metrics = metricTypes && metricTypes.length > 0 
                ? metricTypes 
                : this.getDefaultPostMetrics(includeVideoMetrics);

            // Get post insights
            const insightsResponse = await axios.get(
                `${this.apiBaseUrl}/${postId}/insights`,
                {
                    params: {
                        access_token: pageToken,
                        metric: metrics.join(','),
                        period: period
                    }
                }
            );

            const insights: FacebookInsight[] = insightsResponse.data.data || [];

            // Get additional engagement data
            const engagementResponse = await axios.get(
                `${this.apiBaseUrl}/${postId}`,
                {
                    params: {
                        access_token: pageToken,
                        fields: 'reactions.summary(true).limit(0),comments.summary(true).limit(0),shares,likes.summary(true).limit(0)'
                    }
                }
            );

            const engagementData = engagementResponse.data;

            // Get demographic insights if requested
            let demographics = null;
            if (includeDemographics) {
                demographics = await this.getPostDemographics(postId, pageToken);
            }

            // Get post details for context
            const postDetails = await this.getPost(postId);

            // Process and organize insights
            const processedInsights = this.processInsights(insights);
            
            // Build comprehensive analytics object
            const analytics = {
                postId,
                postDetails: {
                    message: postDetails.message,
                    createdTime: postDetails.created_time,
                    type: postDetails.attachments?.data?.[0]?.type || 'status',
                    permalinkUrl: postDetails.permalink_url
                },
                metrics: processedInsights,
                engagement: {
                    reactions: {
                        total: engagementData.reactions?.summary?.total_count || 0,
                        likes: engagementData.likes?.summary?.total_count || 0
                    },
                    comments: engagementData.comments?.summary?.total_count || 0,
                    shares: engagementData.shares?.count || 0
                },
                demographics,
                period,
                retrievedAt: new Date().toISOString()
            };

            // Calculate engagement rate if we have reach data
            const reach = processedInsights.post_impressions_unique || processedInsights.post_reach;
            if (reach && reach > 0) {
                const totalEngagements = analytics.engagement.reactions.total + 
                                       analytics.engagement.comments + 
                                       analytics.engagement.shares;
                (analytics as any).engagementRate = (totalEngagements / reach) * 100;
            }

            LogStatus(`Successfully retrieved insights for post ${postId}`);

            // Update output parameters
            const outputParams = [...Params];
            // TODO: Set output parameters based on result
            
            return {
                Success: true,
                Message: 'Post insights retrieved successfully',
                ResultCode: 'SUCCESS',
                Params: outputParams
            };

        } catch (error) {
            LogError(`Failed to get Facebook post insights: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            if (this.isAuthError(error)) {
                return this.handleOAuthError(error);
            }

            // Check if it's a permissions error
            if (error instanceof Error && error.message.includes('permissions')) {
                return {
                Success: false,
                Message: 'Insufficient permissions to access post insights. Ensure the page token has insights permissions.',
                ResultCode: 'INSUFFICIENT_PERMISSIONS'
            };
            }

            return {
                Success: false,
                Message: error instanceof Error ? error.message : 'Unknown error occurred',
                ResultCode: 'ERROR'
            };
        }
    }

    /**
     * Get default post metrics based on post type
     */
    private getDefaultPostMetrics(includeVideo: boolean): string[] {
        const metrics = [
            // Reach and impressions
            'post_impressions',
            'post_impressions_unique',
            'post_impressions_paid',
            'post_impressions_paid_unique',
            'post_impressions_fan',
            'post_impressions_fan_unique',
            'post_impressions_organic',
            'post_impressions_organic_unique',
            
            // Engagement
            'post_engaged_users',
            'post_engaged_fan',
            'post_clicks',
            'post_clicks_unique',
            
            // Reactions
            'post_reactions_by_type_total',
            
            // Negative feedback
            'post_negative_feedback',
            'post_negative_feedback_unique',
            
            // Activity
            'post_activity',
            'post_activity_by_action_type'
        ];

        if (includeVideo) {
            metrics.push(
                'post_video_views',
                'post_video_views_unique',
                'post_video_views_10s',
                'post_video_views_10s_unique',
                'post_video_avg_time_watched',
                'post_video_complete_views_30s',
                'post_video_complete_views_30s_unique',
                'post_video_retention_graph',
                'post_video_view_time',
                'post_video_view_time_by_age_bucket_and_gender',
                'post_video_view_time_by_region_id'
            );
        }

        return metrics;
    }

    /**
     * Get demographic insights for a post
     */
    private async getPostDemographics(postId: string, pageToken: string): Promise<any> {
        try {
            const demographicMetrics = [
                'post_impressions_by_age_gender_unique',
                'post_engaged_users_by_age_gender',
                'post_clicks_by_age_gender_unique'
            ];

            const response = await axios.get(
                `${this.apiBaseUrl}/${postId}/insights`,
                {
                    params: {
                        access_token: pageToken,
                        metric: demographicMetrics.join(',')
                    }
                }
            );

            const insights = response.data.data || [];
            const demographics: Record<string, any> = {};

            for (const insight of insights) {
                if (insight.values?.[0]?.value) {
                    demographics[insight.name] = insight.values[0].value;
                }
            }

            return demographics;
        } catch (error) {
            LogError(`Failed to get demographic insights: ${error}`);
            return null;
        }
    }

    /**
     * Process raw insights into a more usable format
     */
    private processInsights(insights: FacebookInsight[]): Record<string, any> {
        const processed: Record<string, any> = {};

        for (const insight of insights) {
            const value = insight.values?.[0]?.value;
            
            if (value !== undefined) {
                // Handle different value types
                if (typeof value === 'object' && !Array.isArray(value)) {
                    // For metrics like reactions_by_type
                    processed[insight.name] = value;
                } else {
                    processed[insight.name] = value;
                }

                // Add metadata
                processed[`${insight.name}_meta`] = {
                    title: insight.title,
                    description: insight.description,
                    period: insight.period
                };
            }
        }

        return processed;
    }


}