import { RegisterClass } from '@memberjunction/global';
import { InstagramBaseAction } from '../instagram-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/core';

/**
 * Retrieves account-level insights for an Instagram Business account.
 * Includes follower demographics, reach, impressions, and profile activity.
 */
@RegisterClass(InstagramBaseAction, 'Instagram - Get Account Insights')
export class InstagramGetAccountInsightsAction extends InstagramBaseAction {
    
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const companyIntegrationId = this.getParamValue(params.Params, 'CompanyIntegrationID');
            const period = this.getParamValue(params.Params, 'Period') || 'day';
            const startDate = this.getParamValue(params.Params, 'StartDate');
            const endDate = this.getParamValue(params.Params, 'EndDate');
            const includeDemographics = this.getParamValue(params.Params, 'IncludeDemographics') !== false;

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId)) {
                return {
                    Success: false,
                    Message: 'Failed to initialize Instagram authentication',
                    ResultCode: 'AUTH_FAILED'
                };
            }

            // Define metrics based on period
            const metrics = this.getAccountMetrics(period);

            // Get account insights
            const insights = await this.getInsights(
                this.instagramBusinessAccountId,
                metrics,
                period as any
            );

            // Parse insights data
            const parsedInsights = this.parseAccountInsights(insights);

            // Get account info
            const accountInfo = await this.getAccountInfo();

            // Get demographics if requested
            let demographics = null;
            if (includeDemographics) {
                demographics = await this.getAccountDemographics();
            }

            // Get content performance summary
            const contentSummary = await this.getContentPerformanceSummary(startDate, endDate);

            // Calculate growth metrics
            const growthMetrics = this.calculateGrowthMetrics(parsedInsights, accountInfo);

            // Store result in output params
            const outputParams = [...params.Params];
            outputParams.push({
                Name: 'ResultData',
                Type: 'Output',
                Value: JSON.stringify({
                    account: {
                        id: this.instagramBusinessAccountId,
                        username: accountInfo.username,
                        name: accountInfo.name,
                        biography: accountInfo.biography,
                        followersCount: accountInfo.followers_count,
                        followsCount: accountInfo.follows_count,
                        mediaCount: accountInfo.media_count,
                        profilePictureUrl: accountInfo.profile_picture_url,
                        websiteUrl: accountInfo.website
                    },
                    insights: parsedInsights,
                    demographics,
                    growth: growthMetrics,
                    contentPerformance: contentSummary,
                    period,
                    dataCollectedAt: new Date().toISOString()
                })
            });

            return {
                Success: true,
                Message: 'Successfully retrieved Instagram account insights',
                ResultCode: 'SUCCESS',
                Params: outputParams
            };

        } catch (error: any) {
            LogError('Failed to retrieve Instagram account insights', error);
            
            if (error.code === 'RATE_LIMIT') {
                return {
                    Success: false,
                    Message: 'Instagram API rate limit exceeded. Please try again later.',
                    ResultCode: 'RATE_LIMIT'
                };
            }

            if (error.code === 'INSUFFICIENT_PERMISSIONS') {
                return {
                    Success: false,
                    Message: 'Insufficient permissions to access Instagram account insights',
                    ResultCode: 'INSUFFICIENT_PERMISSIONS'
                };
            }

            return {
                Success: false,
                Message: `Failed to retrieve account insights: ${error.message}`,
                ResultCode: 'ERROR'
            };
        }
    }

    /**
     * Get appropriate metrics based on period
     */
    private getAccountMetrics(period: string): string[] {
        const baseMetrics = [
            'impressions',
            'reach',
            'profile_views',
            'website_clicks'
        ];

        if (period === 'day') {
            return [
                ...baseMetrics,
                'follower_count',
                'email_contacts',
                'phone_call_clicks',
                'text_message_clicks',
                'get_directions_clicks'
            ];
        } else if (period === 'week' || period === 'days_28') {
            return [
                ...baseMetrics,
                'accounts_engaged'
            ];
        }

        return baseMetrics;
    }

    /**
     * Get account information
     */
    private async getAccountInfo(): Promise<any> {
        const response = await this.makeInstagramRequest(
            this.instagramBusinessAccountId,
            'GET',
            null,
            {
                fields: 'username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website',
                access_token: this.getAccessToken()
            }
        );

        return response;
    }

    /**
     * Get account demographics
     */
    private async getAccountDemographics(): Promise<any> {
        try {
            // Get follower demographics
            const demographicMetrics = [
                'audience_city',
                'audience_country',
                'audience_gender_age',
                'audience_locale',
                'online_followers'
            ];

            const demographics = await this.getInsights(
                this.instagramBusinessAccountId,
                demographicMetrics,
                'lifetime'
            );

            // Parse demographic data
            const parsed: any = {
                locations: {
                    cities: {},
                    countries: {}
                },
                genderAge: {},
                languages: {},
                onlineHours: {}
            };

            demographics.forEach((metric: any) => {
                const value = metric.values?.[0]?.value;
                
                switch (metric.name) {
                    case 'audience_city':
                        parsed.locations.cities = value || {};
                        break;
                    case 'audience_country':
                        parsed.locations.countries = value || {};
                        break;
                    case 'audience_gender_age':
                        parsed.genderAge = this.parseGenderAge(value || {});
                        break;
                    case 'audience_locale':
                        parsed.languages = value || {};
                        break;
                    case 'online_followers':
                        parsed.onlineHours = this.parseOnlineHours(value || {});
                        break;
                }
            });

            return parsed;
        } catch (error) {
            LogError('Failed to get demographics', error);
            return null;
        }
    }

    /**
     * Parse gender/age demographics
     */
    private parseGenderAge(data: any): any {
        const parsed: any = {
            male: {},
            female: {},
            unknown: {}
        };

        Object.keys(data).forEach(key => {
            const [gender, ageRange] = key.split('.');
            if (parsed[gender]) {
                parsed[gender][ageRange] = data[key];
            }
        });

        return parsed;
    }

    /**
     * Parse online hours data
     */
    private parseOnlineHours(data: any): any {
        const parsed: any = {};
        
        Object.keys(data).forEach(hour => {
            parsed[hour] = {
                count: data[hour],
                hour: parseInt(hour),
                label: `${hour}:00`
            };
        });

        return parsed;
    }

    /**
     * Get content performance summary
     */
    private async getContentPerformanceSummary(startDate?: string, endDate?: string): Promise<any> {
        try {
            // Get recent posts
            const queryParams: any = {
                fields: 'id,media_type,like_count,comments_count,timestamp',
                access_token: this.getAccessToken(),
                limit: 50
            };

            if (startDate) {
                queryParams.since = Math.floor(new Date(startDate).getTime() / 1000);
            }
            if (endDate) {
                queryParams.until = Math.floor(new Date(endDate).getTime() / 1000);
            }

            const response = await this.makeInstagramRequest<{ data: any[] }>(
                `${this.instagramBusinessAccountId}/media`,
                'GET',
                null,
                queryParams
            );

            const posts = response.data || [];

            // Calculate performance metrics
            const summary = {
                totalPosts: posts.length,
                avgLikes: 0,
                avgComments: 0,
                totalEngagements: 0,
                topPerformingPost: null as any,
                mediaTypeBreakdown: {
                    IMAGE: 0,
                    VIDEO: 0,
                    CAROUSEL_ALBUM: 0,
                    REELS: 0
                }
            };

            if (posts.length > 0) {
                let totalLikes = 0;
                let totalComments = 0;
                let topPost = posts[0];

                posts.forEach(post => {
                    totalLikes += post.like_count || 0;
                    totalComments += post.comments_count || 0;
                    
                    // Track media types
                    if (summary.mediaTypeBreakdown[post.media_type] !== undefined) {
                        summary.mediaTypeBreakdown[post.media_type]++;
                    }

                    // Find top performing post
                    const engagement = (post.like_count || 0) + (post.comments_count || 0);
                    const topEngagement = (topPost.like_count || 0) + (topPost.comments_count || 0);
                    if (engagement > topEngagement) {
                        topPost = post;
                    }
                });

                summary.avgLikes = Math.round(totalLikes / posts.length);
                summary.avgComments = Math.round(totalComments / posts.length);
                summary.totalEngagements = totalLikes + totalComments;
                summary.topPerformingPost = {
                    id: topPost.id,
                    likes: topPost.like_count,
                    comments: topPost.comments_count,
                    engagement: (topPost.like_count || 0) + (topPost.comments_count || 0),
                    publishedAt: topPost.timestamp
                };
            }

            return summary;
        } catch (error) {
            LogError('Failed to get content performance', error);
            return null;
        }
    }

    /**
     * Parse account insights
     */
    private parseAccountInsights(insights: any[]): Record<string, any> {
        const parsed: Record<string, any> = {};

        insights.forEach(metric => {
            const name = metric.name;
            const values = metric.values || [];
            
            if (values.length > 0) {
                parsed[name] = {
                    value: values[0].value || 0,
                    title: metric.title,
                    description: metric.description,
                    period: metric.period
                };

                // For time series data
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
     * Calculate growth metrics
     */
    private calculateGrowthMetrics(insights: any, accountInfo: any): any {
        const growth: any = {
            followersGrowth: 0,
            followersGrowthRate: 0,
            reachGrowth: 0,
            impressionsGrowth: 0,
            engagementRate: 0
        };

        // Calculate follower growth if we have time series data
        const followerData = insights.follower_count;
        if (followerData?.timeSeries && followerData.timeSeries.length > 1) {
            const firstValue = followerData.timeSeries[0].value;
            const lastValue = followerData.timeSeries[followerData.timeSeries.length - 1].value;
            growth.followersGrowth = lastValue - firstValue;
            
            if (firstValue > 0) {
                growth.followersGrowthRate = ((lastValue - firstValue) / firstValue) * 100;
            }
        }

        // Calculate engagement rate
        const reach = insights.reach?.value || 0;
        const profileViews = insights.profile_views?.value || 0;
        const websiteClicks = insights.website_clicks?.value || 0;
        
        if (reach > 0) {
            const totalEngagements = profileViews + websiteClicks;
            growth.engagementRate = (totalEngagements / reach) * 100;
        }

        return growth;
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'Period',
                Type: 'Input',
                Value: 'day'
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
                Name: 'IncludeDemographics',
                Type: 'Input',
                Value: true
            }
        ];
    }

    /**
     * Get the description for this action
     */
    public get Description(): string {
        return 'Retrieves comprehensive account-level insights including follower demographics, reach, impressions, and growth metrics.';
    }
}