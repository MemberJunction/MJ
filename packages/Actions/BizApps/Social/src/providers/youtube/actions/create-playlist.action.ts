import { RegisterClass } from '@memberjunction/global';
import { YouTubeBaseAction } from '../youtube-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to create a playlist on YouTube
 */
@RegisterClass(YouTubeBaseAction, 'YouTubeCreatePlaylistAction')
export class YouTubeCreatePlaylistAction extends YouTubeBaseAction {
    /**
     * Create a playlist on YouTube
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
            const title = this.getParamValue(Params, 'Title');
            const description = this.getParamValue(Params, 'Description');
            const privacyStatus = this.getParamValue(Params, 'PrivacyStatus') || 'private';
            const tags = this.getParamValue(Params, 'Tags');
            const defaultLanguage = this.getParamValue(Params, 'DefaultLanguage');
            const videoIds = this.getParamValue(Params, 'VideoIDs');

            // Validate required parameters
            if (!title) {
                throw new Error('Title is required for playlist creation');
            }

            // Create playlist
            const playlistData = {
                snippet: {
                    title: title,
                    description: description || '',
                    tags: tags || [],
                    defaultLanguage: defaultLanguage || 'en'
                },
                status: {
                    privacyStatus: privacyStatus
                }
            };

            const playlistResponse = await this.makeYouTubeRequest<any>(
                '/playlists',
                'POST',
                playlistData,
                {
                    part: 'snippet,status'
                },
                ContextUser
            );

            const playlistId = playlistResponse.id;

            // Add videos to playlist if provided
            let addedVideos: any[] = [];
            if (videoIds && videoIds.length > 0) {
                addedVideos = await this.addVideosToPlaylist(playlistId, videoIds, ContextUser);
            }

            // Get full playlist details
            const playlistDetails = await this.makeYouTubeRequest<any>(
                '/playlists',
                'GET',
                undefined,
                {
                    part: 'snippet,status,contentDetails',
                    id: playlistId
                },
                ContextUser
            );

            const playlist = playlistDetails.items[0];

            // Prepare result
            const result = {
                playlistId: playlist.id,
                playlistUrl: `https://www.youtube.com/playlist?list=${playlist.id}`,
                title: playlist.snippet.title,
                description: playlist.snippet.description,
                tags: playlist.snippet.tags,
                privacyStatus: playlist.status.privacyStatus,
                itemCount: playlist.contentDetails.itemCount,
                channelId: playlist.snippet.channelId,
                channelTitle: playlist.snippet.channelTitle,
                publishedAt: playlist.snippet.publishedAt,
                thumbnails: playlist.snippet.thumbnails,
                videosAdded: addedVideos.length,
                videoDetails: addedVideos,
                quotaCost: this.getQuotaCost('playlists.insert') + (addedVideos.length * this.getQuotaCost('playlistItems.insert'))
            };

            // Update output parameters
            const outputParams = [...Params];
            const playlistDetailsParam = outputParams.find(p => p.Name === 'PlaylistDetails');
            if (playlistDetailsParam) playlistDetailsParam.Value = result;
            const playlistIdParam = outputParams.find(p => p.Name === 'PlaylistID');
            if (playlistIdParam) playlistIdParam.Value = playlistId;
            const playlistUrlParam = outputParams.find(p => p.Name === 'PlaylistURL');
            if (playlistUrlParam) playlistUrlParam.Value = result.playlistUrl;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Playlist created successfully with ${addedVideos.length} videos: ${result.playlistUrl}`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.getErrorCode(errorMessage),
                Message: `Failed to create playlist: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Add videos to a playlist
     */
    private async addVideosToPlaylist(playlistId: string, videoIds: string[], contextUser?: any): Promise<any[]> {
        const addedVideos: any[] = [];
        
        for (let i = 0; i < videoIds.length; i++) {
            const videoId = videoIds[i];
            
            try {
                const playlistItem = {
                    snippet: {
                        playlistId: playlistId,
                        position: i,
                        resourceId: {
                            kind: 'youtube#video',
                            videoId: videoId
                        }
                    }
                };

                const response = await this.makeYouTubeRequest<any>(
                    '/playlistItems',
                    'POST',
                    playlistItem,
                    {
                        part: 'snippet'
                    },
                    contextUser
                );

                addedVideos.push({
                    videoId: videoId,
                    position: response.snippet.position,
                    addedAt: response.snippet.publishedAt,
                    playlistItemId: response.id
                });
            } catch (error) {
                // Log error but continue adding other videos
                console.error(`Failed to add video ${videoId} to playlist:`, error);
                addedVideos.push({
                    videoId: videoId,
                    position: i,
                    error: error.message
                });
            }
        }
        
        return addedVideos;
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
                Name: 'Title',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Description',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PrivacyStatus',
                Type: 'Input',
                Value: 'private'
            },
            {
                Name: 'Tags',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DefaultLanguage',
                Type: 'Input',
                Value: 'en'
            },
            {
                Name: 'VideoIDs',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'PlaylistDetails',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'PlaylistID',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'PlaylistURL',
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
        return 'Creates a YouTube playlist and optionally adds videos to it';
    }
}