import { RegisterClass } from '@memberjunction/global';
import { YouTubeBaseAction } from '../youtube-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialPost } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to get videos from a YouTube channel
 */
@RegisterClass(BaseAction, 'YouTubeGetChannelVideosAction')
export class YouTubeGetChannelVideosAction extends YouTubeBaseAction {
    /**
     * Get videos from a YouTube channel
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
            const maxResults = this.getParamValue(Params, 'MaxResults') || 50;
            const orderBy = this.getParamValue(Params, 'OrderBy') || 'date';
            const publishedAfter = this.getParamValue(Params, 'PublishedAfter');
            const publishedBefore = this.getParamValue(Params, 'PublishedBefore');
            const includePrivate = this.getParamValue(Params, 'IncludePrivate') || false;
            const videoType = this.getParamValue(Params, 'VideoType') || 'any';
            const videoDuration = this.getParamValue(Params, 'VideoDuration') || 'any';
            const pageToken = this.getParamValue(Params, 'PageToken');

            // If no channel ID provided, get the authenticated user's channel
            let actualChannelId = channelId;
            if (!actualChannelId) {
                const channelResponse = await this.makeYouTubeRequest<any>(
                    '/channels',
                    'GET',
                    undefined,
                    {
                        part: 'id,snippet',
                        mine: true
                    },
                    ContextUser
                );

                if (!channelResponse.items || channelResponse.items.length === 0) {
                    throw new Error('No channel found for authenticated user');
                }
                actualChannelId = channelResponse.items[0].id;
            }

            // Build search parameters
            const searchParams: any = {
                part: 'id,snippet',
                channelId: actualChannelId,
                type: 'video',
                maxResults: Math.min(maxResults, 50), // YouTube max is 50
                order: orderBy
            };

            // Add date filters
            if (publishedAfter) {
                searchParams.publishedAfter = this.formatDate(publishedAfter);
            }
            if (publishedBefore) {
                searchParams.publishedBefore = this.formatDate(publishedBefore);
            }

            // Add video type filter
            if (videoType !== 'any') {
                searchParams.videoType = videoType; // 'episode' or 'movie'
            }

            // Add duration filter
            if (videoDuration !== 'any') {
                searchParams.videoDuration = videoDuration; // 'short', 'medium', 'long'
            }

            // Add pagination token
            if (pageToken) {
                searchParams.pageToken = pageToken;
            }

            // Search for videos
            const searchResponse = await this.makeYouTubeRequest<any>(
                '/search',
                'GET',
                undefined,
                searchParams,
                ContextUser
            );

            // Extract video IDs
            const videoIds = searchResponse.items.map((item: any) => item.id.videoId);

            if (videoIds.length === 0) {
                // No videos found
                const outputParams = [...Params];
                const videosParam = outputParams.find(p => p.Name === 'Videos');
                if (videosParam) videosParam.Value = [];
                const summaryParam = outputParams.find(p => p.Name === 'Summary');
                if (summaryParam) summaryParam.Value = { totalVideos: 0, channelId: actualChannelId };

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Message: 'No videos found for the specified criteria',
                    Params: outputParams
                };
            }

            // Get detailed video information
            const videosResponse = await this.makeYouTubeRequest<any>(
                '/videos',
                'GET',
                undefined,
                {
                    part: 'snippet,contentDetails,statistics,status',
                    id: videoIds.join(',')
                },
                ContextUser
            );

            // Filter out private videos if not requested
            let videos = videosResponse.items;
            if (!includePrivate) {
                videos = videos.filter((v: any) => v.status.privacyStatus !== 'private');
            }

            // Convert to social posts
            const socialPosts: SocialPost[] = videos.map((video: any) => this.normalizePost(video));

            // Calculate summary statistics
            const summary = {
                totalVideos: videos.length,
                channelId: actualChannelId,
                totalViews: videos.reduce((sum: number, v: any) => sum + parseInt(v.statistics.viewCount || '0'), 0),
                totalLikes: videos.reduce((sum: number, v: any) => sum + parseInt(v.statistics.likeCount || '0'), 0),
                totalComments: videos.reduce((sum: number, v: any) => sum + parseInt(v.statistics.commentCount || '0'), 0),
                averageViews: Math.round(videos.reduce((sum: number, v: any) => sum + parseInt(v.statistics.viewCount || '0'), 0) / videos.length),
                dateRange: {
                    oldest: videos.length > 0 ? videos[videos.length - 1].snippet.publishedAt : null,
                    newest: videos.length > 0 ? videos[0].snippet.publishedAt : null
                },
                privacyBreakdown: this.groupByPrivacy(videos),
                nextPageToken: searchResponse.nextPageToken,
                prevPageToken: searchResponse.prevPageToken,
                quotaCost: this.getQuotaCost('search.list') + this.getQuotaCost('videos.list')
            };

            // Update output parameters
            const outputParams = [...Params];
            const videosParam = outputParams.find(p => p.Name === 'Videos');
            if (videosParam) videosParam.Value = socialPosts;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const nextPageTokenParam = outputParams.find(p => p.Name === 'NextPageToken');
            if (nextPageTokenParam) nextPageTokenParam.Value = searchResponse.nextPageToken;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved ${videos.length} videos from channel`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(errorMessage),
                Message: `Failed to get channel videos: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Group videos by privacy status
     */
    private groupByPrivacy(videos: any[]): Record<string, number> {
        return videos.reduce((acc, video) => {
            const privacy = video.status.privacyStatus;
            acc[privacy] = (acc[privacy] || 0) + 1;
            return acc;
        }, {});
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
                Name: 'MaxResults',
                Type: 'Input',
                Value: 50
            },
            {
                Name: 'OrderBy',
                Type: 'Input',
                Value: 'date'
            },
            {
                Name: 'PublishedAfter',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PublishedBefore',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludePrivate',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'VideoType',
                Type: 'Input',
                Value: 'any'
            },
            {
                Name: 'VideoDuration',
                Type: 'Input',
                Value: 'any'
            },
            {
                Name: 'PageToken',
                Type: 'Input',
                Value: null
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
        return 'Gets videos from a YouTube channel with filtering and pagination support';
    }
}