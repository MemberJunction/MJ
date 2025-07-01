import { RegisterClass } from '@memberjunction/global';
import { YouTubeBaseAction } from '../youtube-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to get analytics for a YouTube channel
 */
@RegisterClass(YouTubeBaseAction, 'YouTubeGetChannelAnalyticsAction')
export class YouTubeGetChannelAnalyticsAction extends YouTubeBaseAction {
    /**
     * Get analytics for a YouTube channel
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
            const channelId = this.getParamValue(Params, 'ChannelID') || this.getCustomAttribute(1);
            const dateRange = this.getParamValue(Params, 'DateRange') || 'last30Days';
            const startDate = this.getParamValue(Params, 'StartDate');
            const endDate = this.getParamValue(Params, 'EndDate');
            const includeVideos = this.getParamValue(Params, 'IncludeVideos') ?? true;
            const videoLimit = this.getParamValue(Params, 'VideoLimit') || 50;

            // If no channel ID provided, get the authenticated user's channel
            let actualChannelId = channelId;
            if (!actualChannelId) {
                const channelResponse = await this.makeYouTubeRequest<any>(
                    '/channels',
                    'GET',
                    undefined,
                    {
                        part: 'id,snippet,statistics,contentDetails,brandingSettings',
                        mine: true
                    },
                    ContextUser
                );

                if (!channelResponse.items || channelResponse.items.length === 0) {
                    throw new Error('No channel found for authenticated user');
                }
                actualChannelId = channelResponse.items[0].id;
            } else {
                // Get channel details for specified channel
                const channelResponse = await this.makeYouTubeRequest<any>(
                    '/channels',
                    'GET',
                    undefined,
                    {
                        part: 'snippet,statistics,contentDetails,brandingSettings',
                        id: actualChannelId
                    },
                    ContextUser
                );

                if (!channelResponse.items || channelResponse.items.length === 0) {
                    throw new Error(`Channel not found: ${actualChannelId}`);
                }
            }

            // Get channel details
            const channelData = await this.getChannelDetails(actualChannelId, ContextUser);
            const channel = channelData.items[0];

            // Calculate date range
            const { start, end } = this.calculateDateRange(dateRange, startDate, endDate);

            // Get videos for the date range if requested
            let videos: any[] = [];
            let videoAnalytics: any = {};
            
            if (includeVideos) {
                videos = await this.getChannelVideosForDateRange(actualChannelId, start, end, videoLimit, ContextUser);
                if (videos.length > 0) {
                    videoAnalytics = await this.aggregateVideoAnalytics(videos);
                }
            }

            // Prepare channel analytics
            const channelAnalytics = {
                channelId: channel.id,
                channelTitle: channel.snippet.title,
                channelDescription: channel.snippet.description,
                channelUrl: `https://www.youtube.com/channel/${channel.id}`,
                customUrl: channel.snippet.customUrl,
                country: channel.snippet.country,
                publishedAt: channel.snippet.publishedAt,
                thumbnails: channel.snippet.thumbnails,
                
                // Overall statistics
                statistics: {
                    viewCount: parseInt(channel.statistics.viewCount || '0'),
                    subscriberCount: parseInt(channel.statistics.subscriberCount || '0'),
                    videoCount: parseInt(channel.statistics.videoCount || '0'),
                    // Note: hiddenSubscriberCount indicates if subscriber count is public
                    subscribersHidden: channel.statistics.hiddenSubscriberCount
                },

                // Date range specific analytics
                dateRangeAnalytics: {
                    dateRange: {
                        start: start.toISOString(),
                        end: end.toISOString(),
                        days: Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
                    },
                    videosPublished: videos.length,
                    totalViews: videoAnalytics.totalViews || 0,
                    totalLikes: videoAnalytics.totalLikes || 0,
                    totalComments: videoAnalytics.totalComments || 0,
                    averageViewsPerVideo: videoAnalytics.averageViews || 0,
                    topPerformingVideos: videoAnalytics.topVideos || []
                },

                // Growth metrics (if we had historical data)
                growth: {
                    note: 'Growth metrics require YouTube Analytics API access',
                    subscriberGrowth: 'N/A',
                    viewGrowth: 'N/A'
                },

                // Content details
                contentDetails: {
                    relatedPlaylists: channel.contentDetails.relatedPlaylists,
                    uploadPlaylistId: channel.contentDetails.relatedPlaylists.uploads
                },

                // Branding
                branding: {
                    keywords: channel.brandingSettings?.channel?.keywords,
                    unsubscribedTrailer: channel.brandingSettings?.channel?.unsubscribedTrailer,
                    featuredChannelsUrls: channel.brandingSettings?.channel?.featuredChannelsUrls
                },

                quotaCost: this.getQuotaCost('channels.list') + 
                          (videos.length > 0 ? this.getQuotaCost('search.list') + this.getQuotaCost('videos.list') : 0)
            };

            // Prepare summary
            const summary = {
                channelHealth: this.calculateChannelHealth(channel, videoAnalytics),
                recommendations: this.generateRecommendations(channel, videoAnalytics),
                performanceIndicators: {
                    engagementRate: this.calculateEngagementRate(channel.statistics, videoAnalytics),
                    averageViewsPerSubscriber: this.calculateViewsPerSubscriber(channel.statistics),
                    uploadFrequency: this.calculateUploadFrequency(videos, start, end)
                }
            };

            // Update output parameters
            const outputParams = [...Params];
            const analyticsParam = outputParams.find(p => p.Name === 'Analytics');
            if (analyticsParam) analyticsParam.Value = channelAnalytics;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const videosParam = outputParams.find(p => p.Name === 'Videos');
            if (videosParam) videosParam.Value = videos;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved analytics for channel: ${channel.snippet.title}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(errorMessage),
                Message: `Failed to get channel analytics: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Get channel details
     */
    private async getChannelDetails(channelId: string, contextUser?: any): Promise<any> {
        return await this.makeYouTubeRequest(
            '/channels',
            'GET',
            undefined,
            {
                part: 'snippet,statistics,contentDetails,brandingSettings',
                id: channelId
            },
            contextUser
        );
    }

    /**
     * Get videos for a date range
     */
    private async getChannelVideosForDateRange(
        channelId: string, 
        startDate: Date, 
        endDate: Date, 
        limit: number,
        contextUser?: any
    ): Promise<any[]> {
        const searchResponse = await this.makeYouTubeRequest<any>(
            '/search',
            'GET',
            undefined,
            {
                part: 'id',
                channelId: channelId,
                type: 'video',
                publishedAfter: startDate.toISOString(),
                publishedBefore: endDate.toISOString(),
                maxResults: Math.min(limit, 50),
                order: 'date'
            },
            contextUser
        );

        if (!searchResponse.items || searchResponse.items.length === 0) {
            return [];
        }

        const videoIds = searchResponse.items.map((item: any) => item.id.videoId).join(',');
        
        const videosResponse = await this.makeYouTubeRequest<any>(
            '/videos',
            'GET',
            undefined,
            {
                part: 'snippet,statistics,contentDetails',
                id: videoIds
            },
            contextUser
        );

        return videosResponse.items || [];
    }

    /**
     * Aggregate video analytics
     */
    private aggregateVideoAnalytics(videos: any[]): any {
        let totalViews = 0;
        let totalLikes = 0;
        let totalComments = 0;
        let totalDislikes = 0;

        for (const video of videos) {
            const stats = video.statistics || {};
            totalViews += parseInt(stats.viewCount || '0');
            totalLikes += parseInt(stats.likeCount || '0');
            totalComments += parseInt(stats.commentCount || '0');
            totalDislikes += parseInt(stats.dislikeCount || '0');
        }

        const topVideos = [...videos]
            .sort((a, b) => parseInt(b.statistics?.viewCount || '0') - parseInt(a.statistics?.viewCount || '0'))
            .slice(0, 5)
            .map(v => ({
                id: v.id,
                title: v.snippet.title,
                views: parseInt(v.statistics?.viewCount || '0'),
                likes: parseInt(v.statistics?.likeCount || '0'),
                comments: parseInt(v.statistics?.commentCount || '0'),
                publishedAt: v.snippet.publishedAt,
                url: `https://www.youtube.com/watch?v=${v.id}`
            }));

        return {
            totalViews,
            totalLikes,
            totalComments,
            totalDislikes,
            averageViews: videos.length > 0 ? Math.round(totalViews / videos.length) : 0,
            averageLikes: videos.length > 0 ? Math.round(totalLikes / videos.length) : 0,
            topVideos
        };
    }

    /**
     * Calculate date range
     */
    private calculateDateRange(
        dateRange: string, 
        startDate?: string, 
        endDate?: string
    ): { start: Date; end: Date } {
        const end = endDate ? new Date(endDate) : new Date();
        let start: Date;

        if (startDate) {
            start = new Date(startDate);
        } else {
            switch (dateRange) {
                case 'last7Days':
                    start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'last30Days':
                    start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
                    break;
                case 'last90Days':
                    start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
                    break;
                case 'lastYear':
                    start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
            }
        }

        return { start, end };
    }

    /**
     * Calculate channel health score
     */
    private calculateChannelHealth(channel: any, videoAnalytics: any): any {
        const stats = channel.statistics;
        const subscribers = parseInt(stats.subscriberCount || '0');
        const views = parseInt(stats.viewCount || '0');
        const videos = parseInt(stats.videoCount || '0');

        // Simple health score based on engagement
        let score = 0;
        let factors: string[] = [];

        // Subscriber to view ratio
        if (subscribers > 0 && views > subscribers * 100) {
            score += 25;
            factors.push('Good view-to-subscriber ratio');
        }

        // Video count
        if (videos > 50) {
            score += 25;
            factors.push('Active content creation');
        }

        // Recent engagement
        if (videoAnalytics.averageViews > subscribers * 0.1) {
            score += 25;
            factors.push('Strong recent engagement');
        }

        // Upload consistency
        if (videoAnalytics.topVideos?.length >= 3) {
            score += 25;
            factors.push('Consistent uploads');
        }

        return {
            score: Math.min(score, 100),
            rating: score >= 75 ? 'Excellent' : score >= 50 ? 'Good' : score >= 25 ? 'Fair' : 'Needs Improvement',
            factors
        };
    }

    /**
     * Generate recommendations
     */
    private generateRecommendations(channel: any, videoAnalytics: any): string[] {
        const recommendations: string[] = [];
        const stats = channel.statistics;
        const subscribers = parseInt(stats.subscriberCount || '0');

        if (videoAnalytics.averageViews < subscribers * 0.05) {
            recommendations.push('Consider improving video titles and thumbnails to increase click-through rate');
        }

        if (videoAnalytics.topVideos?.length < 3) {
            recommendations.push('Increase upload frequency to maintain audience engagement');
        }

        if (!channel.brandingSettings?.channel?.keywords) {
            recommendations.push('Add channel keywords to improve discoverability');
        }

        if (!channel.snippet.customUrl) {
            recommendations.push('Claim a custom URL for easier channel sharing');
        }

        return recommendations;
    }

    /**
     * Calculate engagement rate
     */
    private calculateEngagementRate(stats: any, videoAnalytics: any): number {
        const views = videoAnalytics.totalViews || parseInt(stats.viewCount || '0');
        const engagements = (videoAnalytics.totalLikes || 0) + (videoAnalytics.totalComments || 0);
        
        return views > 0 ? Math.round((engagements / views) * 10000) / 100 : 0;
    }

    /**
     * Calculate views per subscriber
     */
    private calculateViewsPerSubscriber(stats: any): number {
        const views = parseInt(stats.viewCount || '0');
        const subscribers = parseInt(stats.subscriberCount || '0');
        
        return subscribers > 0 ? Math.round((views / subscribers) * 100) / 100 : 0;
    }

    /**
     * Calculate upload frequency
     */
    private calculateUploadFrequency(videos: any[], start: Date, end: Date): string {
        const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const videosPerDay = videos.length / days;
        
        if (videosPerDay >= 1) return `${Math.round(videosPerDay * 10) / 10} videos/day`;
        if (videosPerDay >= 1/7) return `${Math.round(videosPerDay * 7 * 10) / 10} videos/week`;
        return `${Math.round(videosPerDay * 30 * 10) / 10} videos/month`;
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
                Name: 'ChannelID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DateRange',
                Type: 'Input',
                Value: 'last30Days'
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
                Name: 'IncludeVideos',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'VideoLimit',
                Type: 'Input',
                Value: 50
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
            },
            {
                Name: 'Videos',
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
        return 'Gets comprehensive analytics for a YouTube channel including statistics, growth metrics, and performance indicators';
    }
}