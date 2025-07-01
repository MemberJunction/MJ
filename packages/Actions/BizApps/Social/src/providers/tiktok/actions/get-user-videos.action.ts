import { RegisterClass } from '@memberjunction/global';
import { TikTokBaseAction, TikTokVideo } from '../tiktok-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialPost } from '../../../base/base-social.action';

/**
 * Action to get videos from a TikTok user account
 */
@RegisterClass(TikTokBaseAction, 'GetUserVideosAction')
export class GetUserVideosAction extends TikTokBaseAction {
    
    /**
     * Get user videos from TikTok
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
            const userId = this.getParamValue(Params, 'UserID') || this.getCustomAttribute(1);
            const maxVideos = this.getParamValue(Params, 'MaxVideos') || 20;
            const includeAnalytics = this.getParamValue(Params, 'IncludeAnalytics') !== false;
            
            // Get user videos
            const response = await this.makeTikTokRequest<any>(
                '/v2/video/list/',
                'GET',
                undefined,
                {
                    fields: 'id,share_url,title,description,duration,cover_image_url,share_count,view_count,like_count,comment_count,create_time',
                    max_count: Math.min(maxVideos, 100) // TikTok limit
                }
            );
            
            const videos: TikTokVideo[] = response.data?.videos || [];
            
            // Convert to social posts format
            const socialPosts: SocialPost[] = videos.map(video => this.normalizePost(video));
            
            // Calculate summary statistics
            const summary = {
                totalVideos: videos.length,
                totalViews: videos.reduce((sum, v) => sum + v.view_count, 0),
                totalLikes: videos.reduce((sum, v) => sum + v.like_count, 0),
                totalComments: videos.reduce((sum, v) => sum + v.comment_count, 0),
                totalShares: videos.reduce((sum, v) => sum + v.share_count, 0),
                averageViews: videos.length > 0 ? Math.round(videos.reduce((sum, v) => sum + v.view_count, 0) / videos.length) : 0,
                averageLikes: videos.length > 0 ? Math.round(videos.reduce((sum, v) => sum + v.like_count, 0) / videos.length) : 0,
                dateRange: videos.length > 0 ? {
                    oldest: new Date(Math.min(...videos.map(v => v.create_time)) * 1000),
                    newest: new Date(Math.max(...videos.map(v => v.create_time)) * 1000)
                } : null
            };
            
            // Update output parameters
            const outputParams = [...Params];
            const videosParam = outputParams.find(p => p.Name === 'Videos');
            if (videosParam) videosParam.Value = socialPosts;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;
            const rawDataParam = outputParams.find(p => p.Name === 'RawData');
            if (rawDataParam) rawDataParam.Value = videos;
            
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved ${videos.length} videos from TikTok user`,
                Params: outputParams
            };
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: this.isAuthError(error) ? 'INVALID_TOKEN' : 'ERROR',
                Message: `Failed to get TikTok user videos: ${errorMessage}`,
                Params
            };
        }
    }
    
    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'UserID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'MaxVideos',
                Type: 'Input',
                Value: 20
            },
            {
                Name: 'IncludeAnalytics',
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
                Name: 'RawData',
                Type: 'Output',
                Value: null
            }
        ];
    }
    
    /**
     * Metadata about this action
     */
    public get Description(): string {
        return 'Retrieves videos from a TikTok user account with analytics and metadata';
    }
}