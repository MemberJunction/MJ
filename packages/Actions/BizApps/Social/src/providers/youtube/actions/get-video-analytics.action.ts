import { RegisterClass } from '@memberjunction/global';
import { YouTubeBaseAction } from '../youtube-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to get analytics for YouTube videos
 */
@RegisterClass(BaseAction, 'YouTubeGetVideoAnalyticsAction')
export class YouTubeGetVideoAnalyticsAction extends YouTubeBaseAction {
    /**
     * Get analytics for YouTube videos
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
            }

            const initialized = await this.initializeOAuth(companyIntegrationId);
            if (!initialized) {
                throw new Error('Failed to initialize YouTube OAuth connection');
            }

            // Extract parameters
            const videoIds = this.getParamValue(Params, 'VideoIDs');
            const metricsRequested = this.getParamValue(Params, 'Metrics') || ['views', 'likes', 'comments', 'shares'];
            const startDate = this.getParamValue(Params, 'StartDate');
            const endDate = this.getParamValue(Params, 'EndDate');
            const dimensions = this.getParamValue(Params, 'Dimensions');

            // Validate parameters
            if (!videoIds || (Array.isArray(videoIds) && videoIds.length === 0)) {
                throw new Error('VideoIDs parameter is required');
            }

            // Convert single video ID to array
            const videoIdArray = Array.isArray(videoIds) ? videoIds : [videoIds];
            
            // YouTube Data API provides basic statistics
            // For advanced analytics, YouTube Analytics API would be needed
            const videoDetails = await this.getVideoStatistics(videoIdArray, ContextUser);

            // Process analytics for each video
            const analyticsData = videoDetails.map((video: any) => {
                const stats = video.statistics || {};
                const snippet = video.snippet || {};
                
                return {
                    videoId: video.id,
                    title: snippet.title,
                    publishedAt: snippet.publishedAt,
                    metrics: {
                        views: parseInt(stats.viewCount || '0'),
                        likes: parseInt(stats.likeCount || '0'),
                        dislikes: parseInt(stats.dislikeCount || '0'),
                        comments: parseInt(stats.commentCount || '0'),
                        favorites: parseInt(stats.favoriteCount || '0'),
                        // Engagement rate calculation
                        engagementRate: this.calculateEngagementRate(stats),
                        // Like/dislike ratio
                        likeRatio: this.calculateLikeRatio(stats)
                    },
                    // Additional metadata
                    duration: video.contentDetails?.duration,
                    privacyStatus: video.status?.privacyStatus,
                    categoryId: snippet.categoryId,
                    tags: snippet.tags || [],
                    // Thumbnail for reference
                    thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.default?.url
                };
            });

            // Calculate aggregate metrics
            const aggregateMetrics = this.calculateAggregateMetrics(analyticsData);

            // If YouTube Analytics API was available, we could get:
            // - Watch time
            // - Average view duration
            // - Impressions
            // - Click-through rate
            // - Revenue data
            // - Geographic data
            // - Traffic sources
            // - Device types
            // - Audience retention

            // Create summary
            const summary = {
                totalVideos: analyticsData.length,
                dateRange: {
                    start: startDate || 'N/A',
                    end: endDate || 'N/A'
                },
                aggregateMetrics: aggregateMetrics,
                topPerformers: this.getTopPerformers(analyticsData),
                quotaCost: this.getQuotaCost('videos.list') * Math.ceil(videoIdArray.length / 50)
            };

            // Update output parameters
            const outputParams = [...Params];
            const analyticsParam = outputParams.find(p => p.Name === 'Analytics');
            if (analyticsParam) analyticsParam.Value = analyticsData;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved analytics for ${analyticsData.length} videos`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(errorMessage),
                Message: `Failed to get video analytics: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Get video statistics from YouTube Data API
     */
    private async getVideoStatistics(videoIds: string[], contextUser?: any): Promise<any[]> {
        const results: any[] = [];
        
        // YouTube allows up to 50 video IDs per request
        const chunks = this.chunkArray(videoIds, 50);
        
        for (const chunk of chunks) {
            const response = await this.makeYouTubeRequest<any>(
                '/videos',
                'GET',
                undefined,
                {
                    part: 'snippet,statistics,contentDetails,status',
                    id: chunk.join(',')
                },
                contextUser
            );
            
            if (response.items) {
                results.push(...response.items);
            }
        }
        
        return results;
    }

    /**
     * Calculate engagement rate
     */
    private calculateEngagementRate(stats: any): number {
        const views = parseInt(stats.viewCount || '0');
        if (views === 0) return 0;
        
        const engagements = parseInt(stats.likeCount || '0') + 
                           parseInt(stats.dislikeCount || '0') + 
                           parseInt(stats.commentCount || '0');
        
        return Math.round((engagements / views) * 10000) / 100; // Percentage with 2 decimals
    }

    /**
     * Calculate like ratio
     */
    private calculateLikeRatio(stats: any): number {
        const likes = parseInt(stats.likeCount || '0');
        const dislikes = parseInt(stats.dislikeCount || '0');
        const total = likes + dislikes;
        
        if (total === 0) return 0;
        return Math.round((likes / total) * 10000) / 100; // Percentage with 2 decimals
    }

    /**
     * Calculate aggregate metrics across all videos
     */
    private calculateAggregateMetrics(analyticsData: any[]): any {
        const totals = analyticsData.reduce((acc, video) => {
            acc.views += video.metrics.views;
            acc.likes += video.metrics.likes;
            acc.dislikes += video.metrics.dislikes;
            acc.comments += video.metrics.comments;
            acc.favorites += video.metrics.favorites;
            return acc;
        }, { views: 0, likes: 0, dislikes: 0, comments: 0, favorites: 0 });

        const avgEngagement = analyticsData.reduce((sum, v) => sum + v.metrics.engagementRate, 0) / analyticsData.length;
        const avgLikeRatio = analyticsData.reduce((sum, v) => sum + v.metrics.likeRatio, 0) / analyticsData.length;

        return {
            total: totals,
            average: {
                views: Math.round(totals.views / analyticsData.length),
                likes: Math.round(totals.likes / analyticsData.length),
                dislikes: Math.round(totals.dislikes / analyticsData.length),
                comments: Math.round(totals.comments / analyticsData.length),
                engagementRate: Math.round(avgEngagement * 100) / 100,
                likeRatio: Math.round(avgLikeRatio * 100) / 100
            }
        };
    }

    /**
     * Get top performing videos
     */
    private getTopPerformers(analyticsData: any[]): any {
        return {
            byViews: [...analyticsData].sort((a, b) => b.metrics.views - a.metrics.views).slice(0, 5),
            byEngagement: [...analyticsData].sort((a, b) => b.metrics.engagementRate - a.metrics.engagementRate).slice(0, 5),
            byLikes: [...analyticsData].sort((a, b) => b.metrics.likes - a.metrics.likes).slice(0, 5)
        };
    }

    /**
     * Chunk array into smaller arrays
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Get error code from error message
     */
    private getErrorCode(message: string): string {
        if (message.includes('quota')) return 'QUOTA_EXCEEDED';
        if (message.includes('401') || message.includes('unauthorized')) return 'INVALID_TOKEN';
        if (message.includes('403') || message.includes('forbidden')) return 'INSUFFICIENT_PERMISSIONS';
        if (message.includes('404')) return 'NOT_FOUND';
        if (message.includes('rate limit')) return 'RATE_LIMIT';
        return 'ERROR';
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.commonSocialParams;
        const specificParams: ActionParam[] = [
            {
                Name: 'VideoIDs',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Metrics',
                Type: 'Input',
                Value: ['views', 'likes', 'comments', 'shares']
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
                Name: 'Dimensions',
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
        return [...baseParams, ...specificParams];
    }

    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Gets analytics data for YouTube videos including views, engagement, and performance metrics';
    }
}