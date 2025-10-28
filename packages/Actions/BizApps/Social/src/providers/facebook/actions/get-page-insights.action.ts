import { RegisterClass } from '@memberjunction/global';
import { FacebookBaseAction, FacebookInsight } from '../facebook-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialMediaErrorCode } from '../../../base/base-social.action';
import { LogStatus, LogError } from '@memberjunction/core';
import axios from 'axios';
import { BaseAction } from '@memberjunction/actions';

/**
 * Retrieves comprehensive analytics and insights for a Facebook page.
 * Provides metrics like page views, likes, engagement, demographics, and more.
 */
@RegisterClass(BaseAction, 'FacebookGetPageInsightsAction')
export class FacebookGetPageInsightsAction extends FacebookBaseAction {
    /**
     * Get action description
     */
    public get Description(): string {
        return 'Retrieves comprehensive analytics for a Facebook page including views, engagement, demographics, and performance metrics';
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
                Name: 'MetricTypes',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'Period',
                Type: 'Input',
                Value: 'day',
                },
            {
                Name: 'StartDate',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'EndDate',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'IncludeDemographics',
                Type: 'Input',
                Value: true,
                },
            {
                Name: 'IncludeVideoMetrics',
                Type: 'Input',
                Value: true,
                },
            {
                Name: 'CompareWithPrevious',
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
            const metricTypes = this.getParamValue(Params, 'MetricTypes') as string[];
            const period = this.getParamValue(Params, 'Period') as string || 'day';
            const startDate = this.getParamValue(Params, 'StartDate') as string;
            const endDate = this.getParamValue(Params, 'EndDate') as string;
            const includeDemographics = this.getParamValue(Params, 'IncludeDemographics') !== false;
            const includeVideoMetrics = this.getParamValue(Params, 'IncludeVideoMetrics') !== false;
            const compareWithPrevious = this.getParamValue(Params, 'CompareWithPrevious') as boolean;

            LogStatus(`Retrieving insights for Facebook page ${pageId}...`);

            // Get page access token
            const pageToken = await this.getPageAccessToken(pageId);

            // Build metrics list
            const metrics = metricTypes && metricTypes.length > 0 
                ? metricTypes 
                : this.getDefaultPageMetrics(includeDemographics, includeVideoMetrics);

            // Build date range parameters
            const dateParams: any = {};
            if (startDate && endDate) {
                dateParams.since = new Date(startDate).toISOString();
                dateParams.until = new Date(endDate).toISOString();
            } else if (period !== 'lifetime') {
                // Default to last 30 days if no date range specified
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - 30);
                dateParams.since = start.toISOString();
                dateParams.until = end.toISOString();
            }

            // Get page insights
            const insightsResponse = await axios.get(
                `${this.apiBaseUrl}/${pageId}/insights`,
                {
                    params: {
                        access_token: pageToken,
                        metric: metrics.join(','),
                        period: period,
                        ...dateParams
                    }
                }
            );

            const insights: FacebookInsight[] = insightsResponse.data.data || [];

            // Get page info for context
            const pageInfoResponse = await axios.get(
                `${this.apiBaseUrl}/${pageId}`,
                {
                    params: {
                        access_token: pageToken,
                        fields: 'id,name,category,fan_count,followers_count,about,cover,picture'
                    }
                }
            );

            const pageInfo = pageInfoResponse.data;

            // Process insights into categories
            const processedInsights = this.categorizeInsights(insights);

            // Get comparison data if requested
            let comparison = null;
            if (compareWithPrevious && startDate && endDate) {
                comparison = await this.getComparisonData(
                    pageId,
                    pageToken,
                    metrics,
                    period,
                    new Date(startDate),
                    new Date(endDate)
                );
            }

            // Calculate summary metrics
            const summary = this.calculateSummaryMetrics(processedInsights, pageInfo);

            LogStatus(`Successfully retrieved insights for page ${pageId}`);

            return {
                Success: true,
                Message: 'Page insights retrieved successfully',
                ResultCode: 'SUCCESS',
                Params
            };

        } catch (error) {
            LogError(`Failed to get Facebook page insights: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
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
     * Get default page metrics based on options
     */
    private getDefaultPageMetrics(includeDemographics: boolean, includeVideo: boolean): string[] {
        const metrics = [
            // Page Views
            'page_views_total',
            'page_views_logged_in_unique',
            'page_views_by_site_logged_in_unique',
            
            // Page Likes
            'page_fan_adds',
            'page_fan_removes',
            'page_fan_adds_unique',
            'page_fans',
            
            // Engagement
            'page_engaged_users',
            'page_post_engagements',
            'page_consumptions',
            'page_consumptions_unique',
            'page_places_checkin_total',
            
            // Impressions
            'page_impressions',
            'page_impressions_unique',
            'page_impressions_paid',
            'page_impressions_paid_unique',
            'page_impressions_organic',
            'page_impressions_organic_unique',
            
            // Posts
            'page_posts_impressions',
            'page_posts_impressions_unique',
            
            // Actions
            'page_actions_post_reactions_total',
            'page_actions_post_reactions_like_total',
            'page_actions_post_reactions_love_total',
            'page_actions_post_reactions_wow_total',
            'page_actions_post_reactions_haha_total',
            'page_actions_post_reactions_sorry_total',
            'page_actions_post_reactions_anger_total',
            
            // CTA Clicks
            'page_total_actions',
            'page_cta_clicks_logged_in_total',
            
            // Messages
            'page_messages_total_messaging_connections',
            'page_messages_new_conversations',
            
            // Negative Feedback
            'page_negative_feedback',
            'page_negative_feedback_unique'
        ];

        if (includeDemographics) {
            metrics.push(
                'page_fans_gender_age',
                'page_fans_country',
                'page_fans_city',
                'page_fans_locale',
                'page_impressions_by_age_gender_unique',
                'page_engaged_users_by_age_gender'
            );
        }

        if (includeVideo) {
            metrics.push(
                'page_video_views',
                'page_video_views_paid',
                'page_video_views_organic',
                'page_video_views_autoplayed',
                'page_video_views_click_to_play',
                'page_video_views_unique',
                'page_video_repeat_views',
                'page_video_complete_views_30s',
                'page_video_complete_views_30s_paid',
                'page_video_complete_views_30s_organic',
                'page_video_views_10s',
                'page_video_views_10s_paid',
                'page_video_views_10s_organic'
            );
        }

        return metrics;
    }

    /**
     * Categorize insights by type for better organization
     */
    private categorizeInsights(insights: FacebookInsight[]): Record<string, any> {
        const categories: Record<string, any> = {
            pageViews: {},
            engagement: {},
            likes: {},
            impressions: {},
            posts: {},
            reactions: {},
            demographics: {},
            video: {},
            messages: {},
            negativeFeedback: {}
        };

        for (const insight of insights) {
            const name = insight.name;
            const value = insight.values?.[0]?.value;

            if (name.includes('page_views')) {
                categories.pageViews[name] = value;
            } else if (name.includes('engaged') || name.includes('engagement')) {
                categories.engagement[name] = value;
            } else if (name.includes('fan') || name === 'page_fans') {
                categories.likes[name] = value;
            } else if (name.includes('impressions')) {
                categories.impressions[name] = value;
            } else if (name.includes('posts')) {
                categories.posts[name] = value;
            } else if (name.includes('reactions')) {
                categories.reactions[name] = value;
            } else if (name.includes('gender') || name.includes('country') || name.includes('city') || name.includes('locale')) {
                categories.demographics[name] = value;
            } else if (name.includes('video')) {
                categories.video[name] = value;
            } else if (name.includes('messages')) {
                categories.messages[name] = value;
            } else if (name.includes('negative')) {
                categories.negativeFeedback[name] = value;
            }
        }

        return categories;
    }

    /**
     * Calculate summary metrics
     */
    private calculateSummaryMetrics(insights: Record<string, any>, pageInfo: any): any {
        const summary: any = {
            totalFans: pageInfo.fan_count || 0,
            totalFollowers: pageInfo.followers_count || 0,
            totalPageViews: insights.pageViews.page_views_total || 0,
            totalEngagements: insights.engagement.page_engaged_users || 0,
            totalImpressions: insights.impressions.page_impressions || 0,
            netNewFans: (insights.likes.page_fan_adds || 0) - (insights.likes.page_fan_removes || 0)
        };

        // Calculate engagement rate if we have the data
        if (summary.totalImpressions > 0) {
            summary.engagementRate = (summary.totalEngagements / summary.totalImpressions) * 100;
        }

        // Add reaction breakdown
        const reactions = insights.reactions;
        if (reactions) {
            summary.reactionBreakdown = {
                total: reactions.page_actions_post_reactions_total || 0,
                like: reactions.page_actions_post_reactions_like_total || 0,
                love: reactions.page_actions_post_reactions_love_total || 0,
                wow: reactions.page_actions_post_reactions_wow_total || 0,
                haha: reactions.page_actions_post_reactions_haha_total || 0,
                sorry: reactions.page_actions_post_reactions_sorry_total || 0,
                anger: reactions.page_actions_post_reactions_anger_total || 0
            };
        }

        return summary;
    }

    /**
     * Get comparison data for previous period
     */
    private async getComparisonData(
        pageId: string,
        pageToken: string,
        metrics: string[],
        period: string,
        startDate: Date,
        endDate: Date
    ): Promise<any> {
        try {
            const duration = endDate.getTime() - startDate.getTime();
            const previousStart = new Date(startDate.getTime() - duration);
            const previousEnd = new Date(startDate.getTime());

            const response = await axios.get(
                `${this.apiBaseUrl}/${pageId}/insights`,
                {
                    params: {
                        access_token: pageToken,
                        metric: metrics.join(','),
                        period: period,
                        since: previousStart.toISOString(),
                        until: previousEnd.toISOString()
                    }
                }
            );

            const previousInsights = response.data.data || [];
            const processedPrevious = this.categorizeInsights(previousInsights);

            return {
                period: {
                    start: previousStart.toISOString(),
                    end: previousEnd.toISOString()
                },
                insights: processedPrevious
            };
        } catch (error) {
            LogError(`Failed to get comparison data: ${error}`);
            return null;
        }
    }


}