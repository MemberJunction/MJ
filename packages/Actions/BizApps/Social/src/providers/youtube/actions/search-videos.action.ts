import { RegisterClass } from '@memberjunction/global';
import { YouTubeBaseAction } from '../youtube-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialPost, SearchParams } from '../../../base/base-social.action';

/**
 * Action to search for YouTube videos including historical content
 */
@RegisterClass(YouTubeBaseAction, 'YouTubeSearchVideosAction')
export class YouTubeSearchVideosAction extends YouTubeBaseAction {
    /**
     * Search for YouTube videos
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
            const query = this.getParamValue(Params, 'Query');
            const channelId = this.getParamValue(Params, 'ChannelID');
            const startDate = this.getParamValue(Params, 'StartDate');
            const endDate = this.getParamValue(Params, 'EndDate');
            const videoDuration = this.getParamValue(Params, 'VideoDuration');
            const videoType = this.getParamValue(Params, 'VideoType');
            const orderBy = this.getParamValue(Params, 'OrderBy') || 'relevance';
            const maxResults = this.getParamValue(Params, 'MaxResults') || 50;
            const location = this.getParamValue(Params, 'Location');
            const locationRadius = this.getParamValue(Params, 'LocationRadius');
            const language = this.getParamValue(Params, 'Language');
            const safeSearch = this.getParamValue(Params, 'SafeSearch') || 'moderate';
            const videoCaption = this.getParamValue(Params, 'VideoCaption');
            const videoDefinition = this.getParamValue(Params, 'VideoDefinition');
            const videoDimension = this.getParamValue(Params, 'VideoDimension');
            const videoLicense = this.getParamValue(Params, 'VideoLicense');
            const pageToken = this.getParamValue(Params, 'PageToken');
            const includeHistorical = this.getParamValue(Params, 'IncludeHistorical') ?? true;

            // Build search parameters
            const searchParams: SearchParams = {
                query: query,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                limit: maxResults
            };

            // If searching within own channel, use channel ID from integration
            const actualChannelId = channelId || (includeHistorical ? this.getCustomAttribute(1) : null);

            // Perform search
            let allVideos: SocialPost[] = [];
            let nextPageToken = pageToken;
            let totalResults = 0;
            let pagesSearched = 0;
            const maxPages = includeHistorical ? 10 : 1; // Search up to 10 pages for historical data

            do {
                const searchResponse = await this.searchYouTubeVideos({
                    ...searchParams,
                    channelId: actualChannelId,
                    videoDuration,
                    videoType,
                    orderBy,
                    location,
                    locationRadius,
                    language,
                    safeSearch,
                    videoCaption,
                    videoDefinition,
                    videoDimension,
                    videoLicense,
                    pageToken: nextPageToken
                }, ContextUser);

                if (searchResponse.videos && searchResponse.videos.length > 0) {
                    allVideos.push(...searchResponse.videos);
                    totalResults = searchResponse.totalResults || allVideos.length;
                }

                nextPageToken = searchResponse.nextPageToken;
                pagesSearched++;

                // Continue searching if we haven't reached the limit and there are more pages
            } while (
                includeHistorical && 
                nextPageToken && 
                allVideos.length < maxResults && 
                pagesSearched < maxPages
            );

            // Trim to max results
            if (allVideos.length > maxResults) {
                allVideos = allVideos.slice(0, maxResults);
            }

            // Group videos by various criteria for analytics
            const analytics = this.analyzeSearchResults(allVideos);

            // Create summary
            const summary = {
                totalResults: totalResults,
                videosReturned: allVideos.length,
                pagesSearched: pagesSearched,
                searchCriteria: {
                    query: query,
                    channelId: actualChannelId,
                    dateRange: {
                        start: startDate || 'Any',
                        end: endDate || 'Any'
                    },
                    filters: {
                        duration: videoDuration || 'Any',
                        type: videoType || 'Any',
                        definition: videoDefinition || 'Any',
                        caption: videoCaption || 'Any'
                    }
                },
                analytics: analytics,
                nextPageToken: nextPageToken,
                hasMore: !!nextPageToken,
                quotaCost: this.getQuotaCost('search.list') * pagesSearched + 
                          this.getQuotaCost('videos.list') * Math.ceil(allVideos.length / 50)
            };

            // Update output parameters
            const outputParams = [...Params];
            const videosParam = outputParams.find(p => p.Name === 'Videos');
            if (videosParam) videosParam.Value = allVideos;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const nextPageTokenParam = outputParams.find(p => p.Name === 'NextPageToken');
            if (nextPageTokenParam) nextPageTokenParam.Value = nextPageToken;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${allVideos.length} videos${totalResults > allVideos.length ? ` out of ${totalResults} total results` : ''}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(errorMessage),
                Message: `Failed to search videos: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Search YouTube videos with detailed parameters
     */
    private async searchYouTubeVideos(params: any, contextUser?: any): Promise<any> {
        const searchParams: any = {
            part: 'id,snippet',
            type: 'video',
            maxResults: Math.min(params.limit || 50, 50),
            order: params.orderBy || 'relevance'
        };

        // Add search query
        if (params.query) {
            searchParams.q = params.query;
        }

        // Add channel filter
        if (params.channelId) {
            searchParams.channelId = params.channelId;
        }

        // Add date filters for historical search
        if (params.startDate) {
            searchParams.publishedAfter = this.formatDate(params.startDate);
        }
        if (params.endDate) {
            searchParams.publishedBefore = this.formatDate(params.endDate);
        }

        // Add video duration filter
        if (params.videoDuration) {
            searchParams.videoDuration = params.videoDuration; // short, medium, long
        }

        // Add video type filter
        if (params.videoType) {
            searchParams.videoType = params.videoType; // movie, episode
        }

        // Add location-based search
        if (params.location && params.locationRadius) {
            searchParams.location = params.location; // lat,lng
            searchParams.locationRadius = params.locationRadius; // e.g., "10km"
        }

        // Add language filter
        if (params.language) {
            searchParams.relevanceLanguage = params.language;
        }

        // Add safe search
        if (params.safeSearch) {
            searchParams.safeSearch = params.safeSearch; // none, moderate, strict
        }

        // Add caption filter
        if (params.videoCaption) {
            searchParams.videoCaption = params.videoCaption; // closedCaption, none
        }

        // Add video quality filters
        if (params.videoDefinition) {
            searchParams.videoDefinition = params.videoDefinition; // high, standard
        }
        if (params.videoDimension) {
            searchParams.videoDimension = params.videoDimension; // 2d, 3d
        }
        if (params.videoLicense) {
            searchParams.videoLicense = params.videoLicense; // creativeCommon, youtube
        }

        // Add pagination
        if (params.pageToken) {
            searchParams.pageToken = params.pageToken;
        }

        // Perform search
        const searchResponse = await this.makeYouTubeRequest<any>(
            '/search',
            'GET',
            undefined,
            searchParams,
            contextUser
        );

        // Get detailed video information
        const videos: SocialPost[] = [];
        if (searchResponse.items && searchResponse.items.length > 0) {
            const videoIds = searchResponse.items.map((item: any) => item.id.videoId).join(',');
            
            const videosResponse = await this.makeYouTubeRequest<any>(
                '/videos',
                'GET',
                undefined,
                {
                    part: 'snippet,statistics,status,contentDetails',
                    id: videoIds
                },
                contextUser
            );

            if (videosResponse.items) {
                for (const video of videosResponse.items) {
                    videos.push(this.normalizePost(video));
                }
            }
        }

        return {
            videos: videos,
            totalResults: searchResponse.pageInfo?.totalResults,
            nextPageToken: searchResponse.nextPageToken,
            prevPageToken: searchResponse.prevPageToken
        };
    }

    /**
     * Analyze search results for insights
     */
    private analyzeSearchResults(videos: SocialPost[]): any {
        if (videos.length === 0) {
            return {
                videoCount: 0,
                dateRange: null,
                performance: null,
                categories: {},
                channels: {}
            };
        }

        // Sort by date to find range
        const sortedByDate = [...videos].sort((a, b) => 
            a.publishedAt.getTime() - b.publishedAt.getTime()
        );

        // Calculate performance metrics
        let totalViews = 0;
        let totalLikes = 0;
        let totalComments = 0;
        const categories: Record<string, number> = {};
        const channels: Record<string, { count: number; name: string }> = {};

        for (const video of videos) {
            const platformData = video.platformSpecificData;
            const analytics = video.analytics;

            if (analytics) {
                totalViews += analytics.videoViews || 0;
                totalLikes += analytics.likes || 0;
                totalComments += analytics.comments || 0;
            }

            // Count by category
            const categoryId = platformData.categoryId;
            categories[categoryId] = (categories[categoryId] || 0) + 1;

            // Count by channel
            const channelId = video.profileId;
            if (!channels[channelId]) {
                channels[channelId] = {
                    count: 0,
                    name: platformData.channelTitle || channelId
                };
            }
            channels[channelId].count++;
        }

        return {
            videoCount: videos.length,
            dateRange: {
                oldest: sortedByDate[0].publishedAt,
                newest: sortedByDate[sortedByDate.length - 1].publishedAt,
                spanDays: Math.ceil(
                    (sortedByDate[sortedByDate.length - 1].publishedAt.getTime() - 
                     sortedByDate[0].publishedAt.getTime()) / (1000 * 60 * 60 * 24)
                )
            },
            performance: {
                totalViews: totalViews,
                totalLikes: totalLikes,
                totalComments: totalComments,
                averageViews: Math.round(totalViews / videos.length),
                averageLikes: Math.round(totalLikes / videos.length),
                averageComments: Math.round(totalComments / videos.length),
                topVideos: [...videos]
                    .sort((a, b) => (b.analytics?.videoViews || 0) - (a.analytics?.videoViews || 0))
                    .slice(0, 5)
                    .map(v => ({
                        id: v.id,
                        title: v.platformSpecificData.title,
                        views: v.analytics?.videoViews || 0,
                        url: v.mediaUrls[0]
                    }))
            },
            categories: categories,
            channels: channels,
            durationBreakdown: this.analyzeDurations(videos),
            privacyBreakdown: this.analyzePrivacy(videos)
        };
    }

    /**
     * Analyze video durations
     */
    private analyzeDurations(videos: SocialPost[]): any {
        const durations = { short: 0, medium: 0, long: 0 };
        
        for (const video of videos) {
            const duration = video.platformSpecificData.duration;
            if (duration) {
                const seconds = this.parseDuration(duration);
                if (seconds < 240) durations.short++; // < 4 minutes
                else if (seconds < 1200) durations.medium++; // 4-20 minutes
                else durations.long++; // > 20 minutes
            }
        }
        
        return durations;
    }

    /**
     * Analyze privacy status
     */
    private analyzePrivacy(videos: SocialPost[]): any {
        const privacy = { public: 0, unlisted: 0, private: 0 };
        
        for (const video of videos) {
            const status = video.platformSpecificData.privacyStatus || 'public';
            privacy[status]++;
        }
        
        return privacy;
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
                Name: 'Query',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ChannelID',
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
                Name: 'VideoDuration',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'VideoType',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'OrderBy',
                Type: 'Input',
                Value: 'relevance'
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 50
            },
            {
                Name: 'Location',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'LocationRadius',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Language',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SafeSearch',
                Type: 'Input',
                Value: 'moderate'
            },
            {
                Name: 'VideoCaption',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'VideoDefinition',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'VideoDimension',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'VideoLicense',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PageToken',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeHistorical',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'Videos',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Summary',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'NextPageToken',
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
        return 'Searches YouTube videos with comprehensive filtering options including historical content retrieval with date ranges';
    }
}