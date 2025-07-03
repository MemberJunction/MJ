import { RegisterClass } from '@memberjunction/global';
import { TikTokBaseAction } from '../tiktok-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialAnalytics } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to get analytics for specific TikTok videos
 */
@RegisterClass(BaseAction, 'GetVideoAnalyticsAction')
export class GetVideoAnalyticsAction extends TikTokBaseAction {
    
    /**
     * Get analytics for TikTok videos
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
            const videoIds = this.getParamValue(Params, 'VideoIDs');
            const dateRange = this.getParamValue(Params, 'DateRange');
            const metrics = this.getParamValue(Params, 'Metrics') || ['views', 'likes', 'comments', 'shares'];
            
            if (!videoIds || !Array.isArray(videoIds) || videoIds.length === 0) {
                throw new Error('VideoIDs array is required');
            }
            
            // Get analytics for each video
            const analyticsResults: any[] = [];
            const errors: any[] = [];
            
            for (const videoId of videoIds) {
                try {
                    // TikTok API endpoint for video analytics
                    const response = await this.makeTikTokRequest<any>(
                        `/v2/video/data/`,
                        'POST',
                        {
                            video_id: videoId,
                            fields: metrics.join(',')
                        }
                    );
                    
                    const videoData = response.data;
                    
                    // Normalize analytics
                    const analytics: SocialAnalytics = this.normalizeAnalytics(videoData);
                    
                    analyticsResults.push({
                        videoId,
                        analytics,
                        title: videoData.title,
                        publishedAt: new Date(videoData.create_time * 1000),
                        url: videoData.share_url,
                        performanceScore: this.calculatePerformanceScore(analytics),
                        rawData: videoData
                    });
                    
                } catch (error) {
                    errors.push({
                        videoId,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
            
            // Calculate aggregate metrics
            const aggregateMetrics = this.calculateAggregateMetrics(analyticsResults);
            
            // Create summary
            const summary = {
                totalVideosAnalyzed: analyticsResults.length,
                failedVideos: errors.length,
                dateRange: dateRange || 'all-time',
                aggregateMetrics,
                topPerformingVideo: analyticsResults.length > 0 
                    ? analyticsResults.reduce((best, current) => 
                        current.performanceScore > best.performanceScore ? current : best
                    ) : null,
                errors: errors.length > 0 ? errors : undefined
            };
            
            // Update output parameters
            const outputParams = [...Params];
            const analyticsParam = outputParams.find(p => p.Name === 'Analytics');
            if (analyticsParam) analyticsParam.Value = analyticsResults;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            
            const message = errors.length > 0
                ? `Retrieved analytics for ${analyticsResults.length} videos with ${errors.length} failures`
                : `Successfully retrieved analytics for ${analyticsResults.length} videos`;
            
            return {
                Success: true,
                ResultCode: errors.length > 0 ? 'PARTIAL_SUCCESS' : 'SUCCESS',
                Message: message,
                Params: outputParams
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.isAuthError(error) ? 'INVALID_TOKEN' : 'ERROR',
                Message: `Failed to get TikTok video analytics: ${errorMessage}`,
                Params
            };
        }
    }
    
    /**
     * Calculate performance score for a video
     */
    private calculatePerformanceScore(analytics: SocialAnalytics): number {
        // Simple scoring algorithm - can be customized
        const viewWeight = 1;
        const likeWeight = 10;
        const commentWeight = 20;
        const shareWeight = 30;
        
        return (
            (analytics.videoViews || 0) * viewWeight +
            analytics.likes * likeWeight +
            analytics.comments * commentWeight +
            analytics.shares * shareWeight
        );
    }
    
    /**
     * Calculate aggregate metrics across all videos
     */
    private calculateAggregateMetrics(analyticsResults: any[]): any {
        if (analyticsResults.length === 0) {
            return null;
        }
        
        const totals = analyticsResults.reduce((acc, result) => ({
            views: acc.views + (result.analytics.videoViews || 0),
            likes: acc.likes + result.analytics.likes,
            comments: acc.comments + result.analytics.comments,
            shares: acc.shares + result.analytics.shares,
            engagements: acc.engagements + result.analytics.engagements
        }), {
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            engagements: 0
        });
        
        const count = analyticsResults.length;
        
        return {
            total: totals,
            average: {
                views: Math.round(totals.views / count),
                likes: Math.round(totals.likes / count),
                comments: Math.round(totals.comments / count),
                shares: Math.round(totals.shares / count),
                engagements: Math.round(totals.engagements / count)
            },
            engagementRate: totals.views > 0 
                ? ((totals.engagements / totals.views) * 100).toFixed(2) + '%'
                : '0%'
        };
    }
    
    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'VideoIDs',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DateRange',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Metrics',
                Type: 'Input',
                Value: ['views', 'likes', 'comments', 'shares']
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
     * Metadata about this action
     */
    public get Description(): string {
        return 'Retrieves detailed analytics for specific TikTok videos including views, likes, comments, and shares';
    }
}