import { RegisterClass } from '@memberjunction/global';
import { TikTokBaseAction, TikTokUser } from '../tiktok-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to get analytics for a TikTok account
 */
@RegisterClass(BaseAction, 'GetAccountAnalyticsAction')
export class GetAccountAnalyticsAction extends TikTokBaseAction {
    
    /**
     * Get account-level analytics from TikTok
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
            }
            
            await this.initializeOAuth(companyIntegrationId);
            
            // Extract parameters
            const dateRange = this.getParamValue(Params, 'DateRange') || '30d';
            const includeVideoStats = this.getParamValue(Params, 'IncludeVideoStats') !== false;
            const includeAudienceData = this.getParamValue(Params, 'IncludeAudienceData') !== false;
            
            // Get current user info
            const userInfo = await this.getCurrentUser();
            
            // Get user's videos for aggregate stats
            let videoStats = null;
            if (includeVideoStats) {
                const videos = await this.getUserVideos();
                
                // Calculate video statistics
                videoStats = {
                    totalVideos: videos.length,
                    totalViews: videos.reduce((sum, v) => sum + v.view_count, 0),
                    totalLikes: videos.reduce((sum, v) => sum + v.like_count, 0),
                    totalComments: videos.reduce((sum, v) => sum + v.comment_count, 0),
                    totalShares: videos.reduce((sum, v) => sum + v.share_count, 0),
                    averageViewsPerVideo: videos.length > 0 
                        ? Math.round(videos.reduce((sum, v) => sum + v.view_count, 0) / videos.length)
                        : 0,
                    averageEngagementRate: videos.length > 0
                        ? this.calculateAverageEngagementRate(videos)
                        : 0,
                    topVideos: videos
                        .sort((a, b) => b.view_count - a.view_count)
                        .slice(0, 5)
                        .map(v => ({
                            id: v.id,
                            title: v.title,
                            views: v.view_count,
                            likes: v.like_count,
                            url: v.share_url
                        }))
                };
            }
            
            // Build account analytics
            const accountAnalytics = {
                accountInfo: {
                    userId: userInfo.open_id,
                    username: userInfo.display_name,
                    isVerified: userInfo.is_verified,
                    profileUrl: userInfo.profile_deep_link,
                    avatarUrl: userInfo.avatar_url,
                    bio: userInfo.bio_description
                },
                metrics: {
                    followers: userInfo.follower_count,
                    following: userInfo.following_count,
                    totalLikes: userInfo.likes_count,
                    engagementRate: this.calculateAccountEngagementRate(userInfo, videoStats),
                    growthRate: null // Would need historical data
                },
                videoStats,
                dateRange,
                generatedAt: new Date()
            };
            
            // Build audience data if requested (placeholder - TikTok API limitations)
            let audienceData = null;
            if (includeAudienceData) {
                audienceData = {
                    demographics: {
                        message: 'Detailed audience demographics require TikTok For Business account'
                    },
                    topCountries: [],
                    topCities: [],
                    ageGroups: [],
                    genderSplit: {}
                };
            }
            
            // Create summary
            const summary = {
                accountLevel: {
                    followers: userInfo.follower_count,
                    engagement: accountAnalytics.metrics.engagementRate,
                    verified: userInfo.is_verified
                },
                contentPerformance: videoStats ? {
                    totalContent: videoStats.totalVideos,
                    totalReach: videoStats.totalViews,
                    avgEngagement: videoStats.averageEngagementRate
                } : null,
                recommendations: this.generateRecommendations(accountAnalytics)
            };
            
            // Update output parameters
            const outputParams = [...Params];
            const analyticsParam = outputParams.find(p => p.Name === 'AccountAnalytics');
            if (analyticsParam) analyticsParam.Value = accountAnalytics;
            const audienceParam = outputParams.find(p => p.Name === 'AudienceData');
            if (audienceParam) audienceParam.Value = audienceData;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved analytics for TikTok account @${userInfo.display_name}`,
                Params: outputParams
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.isAuthError(error) ? 'INVALID_TOKEN' : 'ERROR',
                Message: `Failed to get TikTok account analytics: ${errorMessage}`,
                Params
            };
        }
    }
    
    /**
     * Calculate average engagement rate for videos
     */
    private calculateAverageEngagementRate(videos: any[]): number {
        if (videos.length === 0) return 0;
        
        const totalEngagements = videos.reduce((sum, v) => 
            sum + v.like_count + v.comment_count + v.share_count, 0
        );
        const totalViews = videos.reduce((sum, v) => sum + v.view_count, 0);
        
        return totalViews > 0 
            ? parseFloat(((totalEngagements / totalViews) * 100).toFixed(2))
            : 0;
    }
    
    /**
     * Calculate account-level engagement rate
     */
    private calculateAccountEngagementRate(user: TikTokUser, videoStats: any): number {
        if (!videoStats || !user.follower_count) return 0;
        
        const avgEngagementsPerVideo = videoStats.totalVideos > 0
            ? (videoStats.totalLikes + videoStats.totalComments + videoStats.totalShares) / videoStats.totalVideos
            : 0;
            
        return parseFloat(((avgEngagementsPerVideo / user.follower_count) * 100).toFixed(2));
    }
    
    /**
     * Generate recommendations based on analytics
     */
    private generateRecommendations(analytics: any): string[] {
        const recommendations: string[] = [];
        
        // Engagement rate recommendations
        if (analytics.metrics.engagementRate < 1) {
            recommendations.push('Consider improving content quality to boost engagement rate above 1%');
        } else if (analytics.metrics.engagementRate > 5) {
            recommendations.push('Excellent engagement rate! Consider posting more frequently to capitalize on audience interest');
        }
        
        // Follower recommendations
        if (analytics.accountInfo.followers < 1000) {
            recommendations.push('Focus on consistent posting and trending hashtags to grow your follower base');
        }
        
        // Video performance recommendations
        if (analytics.videoStats) {
            if (analytics.videoStats.averageViewsPerVideo < analytics.accountInfo.followers) {
                recommendations.push('Your videos are reaching less than your follower count. Try posting at peak times');
            }
            
            if (analytics.videoStats.totalVideos < 10) {
                recommendations.push('Post more videos to build a stronger content library');
            }
        }
        
        // Verification recommendation
        if (!analytics.accountInfo.isVerified && analytics.accountInfo.followers > 10000) {
            recommendations.push('Consider applying for TikTok verification to build trust with your audience');
        }
        
        return recommendations;
    }
    
    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'DateRange',
                Type: 'Input',
                Value: '30d'
            },
            {
                Name: 'IncludeVideoStats',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'IncludeAudienceData',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'AccountAnalytics',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'AudienceData',
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
     * Metadata about this action
     */
    public get Description(): string {
        return 'Retrieves comprehensive analytics for a TikTok account including followers, engagement rates, and content performance';
    }
}