import { RegisterClass } from '@memberjunction/global';
import { HootSuiteBaseAction, HootSuiteAnalytics } from '../hootsuite-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { SocialAnalytics } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve analytics data from HootSuite
 */
@RegisterClass(BaseAction, 'HootSuiteGetAnalyticsAction')
export class HootSuiteGetAnalyticsAction extends HootSuiteBaseAction {
    /**
     * Get analytics data from HootSuite
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
            const postId = this.getParamValue(Params, 'PostID');
            const profileId = this.getParamValue(Params, 'ProfileID');
            const startDate = this.getParamValue(Params, 'StartDate');
            const endDate = this.getParamValue(Params, 'EndDate');
            const metricsType = this.getParamValue(Params, 'MetricsType') || 'all';
            const aggregateByProfile = this.getParamValue(Params, 'AggregateByProfile') || false;

            // Determine what analytics to fetch
            let analyticsData: any;
            
            if (postId) {
                // Get analytics for specific post
                analyticsData = await this.getPostAnalytics(postId, startDate, endDate);
            } else if (profileId) {
                // Get analytics for specific profile
                analyticsData = await this.getProfileAnalytics(profileId, startDate, endDate, metricsType);
            } else {
                // Get analytics for all profiles
                analyticsData = await this.getAllProfilesAnalytics(startDate, endDate, metricsType, aggregateByProfile);
            }

            // Normalize analytics
            const normalizedAnalytics = this.processAnalyticsData(analyticsData, metricsType);

            // Create summary
            const summary = {
                period: {
                    start: startDate || 'Not specified',
                    end: endDate || 'Not specified'
                },
                metricsType: metricsType,
                totalMetrics: this.calculateTotalMetrics(normalizedAnalytics),
                topPerformingPosts: this.getTopPerformingPosts(normalizedAnalytics),
                engagementRate: this.calculateEngagementRate(normalizedAnalytics)
            };

            // Update output parameters
            const outputParams = [...Params];
            const analyticsParam = outputParams.find(p => p.Name === 'Analytics');
            if (analyticsParam) analyticsParam.Value = normalizedAnalytics;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: 'Successfully retrieved analytics data',
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Failed to get analytics: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Get analytics for a specific post
     */
    private async getPostAnalytics(postId: string, startDate?: string, endDate?: string): Promise<HootSuiteAnalytics> {
        const params: any = {};
        if (startDate) params.startTime = this.formatHootSuiteDate(startDate);
        if (endDate) params.endTime = this.formatHootSuiteDate(endDate);

        const response = await this.axiosInstance.get(`/analytics/posts/${postId}`, { params });
        return response.data;
    }

    /**
     * Get analytics for a specific profile
     */
    private async getProfileAnalytics(
        profileId: string, 
        startDate?: string, 
        endDate?: string,
        metricsType?: string
    ): Promise<any> {
        const params: any = {
            socialProfileIds: profileId
        };
        
        if (startDate) params.startTime = this.formatHootSuiteDate(startDate);
        if (endDate) params.endTime = this.formatHootSuiteDate(endDate);
        if (metricsType && metricsType !== 'all') params.metrics = this.getMetricsList(metricsType);

        const response = await this.axiosInstance.get('/analytics/profiles', { params });
        return response.data;
    }

    /**
     * Get analytics for all profiles
     */
    private async getAllProfilesAnalytics(
        startDate?: string,
        endDate?: string,
        metricsType?: string,
        aggregateByProfile?: boolean
    ): Promise<any> {
        // First get all profiles
        const profiles = await this.getSocialProfiles();
        
        if (profiles.length === 0) {
            return { data: [] };
        }

        const params: any = {
            socialProfileIds: profiles.map(p => p.id).join(',')
        };
        
        if (startDate) params.startTime = this.formatHootSuiteDate(startDate);
        if (endDate) params.endTime = this.formatHootSuiteDate(endDate);
        if (metricsType && metricsType !== 'all') params.metrics = this.getMetricsList(metricsType);
        if (aggregateByProfile) params.groupBy = 'socialProfile';

        const response = await this.axiosInstance.get('/analytics/profiles', { params });
        return response.data;
    }

    /**
     * Get list of metrics based on type
     */
    private getMetricsList(metricsType: string): string {
        const metricsMap: Record<string, string[]> = {
            'engagement': ['likes', 'comments', 'shares', 'engagements'],
            'reach': ['impressions', 'reach'],
            'clicks': ['clicks', 'linkClicks'],
            'all': ['likes', 'comments', 'shares', 'clicks', 'impressions', 'engagements', 'reach']
        };

        return (metricsMap[metricsType] || metricsMap['all']).join(',');
    }

    /**
     * Process and normalize analytics data
     */
    private processAnalyticsData(data: any, metricsType: string): SocialAnalytics[] {
        if (!data || !data.data) return [];

        const results: SocialAnalytics[] = [];

        if (Array.isArray(data.data)) {
            data.data.forEach((item: any) => {
                results.push(this.normalizeAnalytics(item.metrics));
            });
        } else if (data.metrics) {
            results.push(this.normalizeAnalytics(data.metrics));
        }

        return results;
    }

    /**
     * Calculate total metrics across all data
     */
    private calculateTotalMetrics(analytics: SocialAnalytics[]): SocialAnalytics {
        return analytics.reduce((total, current) => ({
            impressions: total.impressions + current.impressions,
            engagements: total.engagements + current.engagements,
            clicks: total.clicks + current.clicks,
            shares: total.shares + current.shares,
            comments: total.comments + current.comments,
            likes: total.likes + current.likes,
            reach: total.reach + current.reach,
            saves: (total.saves || 0) + (current.saves || 0),
            videoViews: (total.videoViews || 0) + (current.videoViews || 0),
            platformMetrics: {}
        }), {
            impressions: 0,
            engagements: 0,
            clicks: 0,
            shares: 0,
            comments: 0,
            likes: 0,
            reach: 0,
            saves: 0,
            videoViews: 0,
            platformMetrics: {}
        });
    }

    /**
     * Get top performing posts based on engagement
     */
    private getTopPerformingPosts(analytics: SocialAnalytics[]): SocialAnalytics[] {
        return analytics
            .sort((a, b) => b.engagements - a.engagements)
            .slice(0, 5);
    }

    /**
     * Calculate average engagement rate
     */
    private calculateEngagementRate(analytics: SocialAnalytics[]): number {
        const total = this.calculateTotalMetrics(analytics);
        if (total.impressions === 0) return 0;
        
        return (total.engagements / total.impressions) * 100;
    }

    /**
     * Define the parameters this action expects
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
                Name: 'MetricsType',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'AggregateByProfile',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Analytics',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Summary',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Retrieves analytics data from HootSuite for posts, profiles, or overall account performance';
    }
}