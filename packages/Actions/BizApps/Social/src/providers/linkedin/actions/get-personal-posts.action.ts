import { RegisterClass } from '@memberjunction/global';
import { LinkedInBaseAction } from '../linkedin-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { SocialPost } from '../../../base/base-social.action';

/**
 * Action to get posts from a LinkedIn personal profile
 */
@RegisterClass(LinkedInBaseAction, 'LinkedInGetPersonalPostsAction')
export class LinkedInGetPersonalPostsAction extends LinkedInBaseAction {
    /**
     * Get posts from the authenticated user's LinkedIn profile
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
            const count = this.getParamValue(Params, 'Count') || 50;
            const startIndex = this.getParamValue(Params, 'StartIndex') || 0;
            const includeAnalytics = this.getParamValue(Params, 'IncludeAnalytics') === true;

            // Get current user URN
            const userUrn = await this.getCurrentUserUrn();
            LogStatus(`Fetching posts for user: ${userUrn}`);

            // Get posts
            const shares = await this.getShares(userUrn, count, startIndex);

            // Convert to common format
            const posts: SocialPost[] = [];
            for (const share of shares) {
                const post = this.normalizePost(share);
                
                // Personal posts have limited analytics access
                if (includeAnalytics) {
                    try {
                        // Note: Personal share analytics are limited compared to organization analytics
                        const analytics = await this.getPersonalPostAnalytics(share.id);
                        if (analytics) {
                            post.analytics = this.normalizeAnalytics(analytics);
                        }
                    } catch (error) {
                        LogError(`Failed to get analytics for post ${share.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                    }
                }
                
                posts.push(post);
            }

            LogStatus(`Retrieved ${posts.length} personal posts`);

            // Update output parameters
            const outputParams = [...Params];
            const postsParam = outputParams.find(p => p.Name === 'Posts');
            if (postsParam) postsParam.Value = posts;
            const totalCountParam = outputParams.find(p => p.Name === 'TotalCount');
            if (totalCountParam) totalCountParam.Value = posts.length;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully retrieved ${posts.length} personal posts`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Failed to get personal posts: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Get analytics for a personal post
     * Note: LinkedIn provides limited analytics for personal posts
     */
    private async getPersonalPostAnalytics(shareId: string): Promise<any> {
        try {
            // LinkedIn v2 API has limited personal analytics
            // We can get basic engagement data from the share itself
            const response = await this.axiosInstance.get(`/ugcPosts/${shareId}`);
            
            if (response.data) {
                // Extract available metrics from the post data
                return {
                    totalShareStatistics: {
                        impressionCount: 0, // Not available for personal posts
                        clickCount: 0, // Not available for personal posts
                        engagement: 0, // Not available for personal posts
                        likeCount: response.data.likesSummary?.totalLikes || 0,
                        commentCount: response.data.commentsSummary?.totalComments || 0,
                        shareCount: 0, // Not available in this endpoint
                        uniqueImpressionsCount: 0 // Not available for personal posts
                    }
                };
            }

            return null;
        } catch (error) {
            LogError(`Failed to get personal post analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'Count',
                Type: 'Input',
                Value: 50
            },
            {
                Name: 'StartIndex',
                Type: 'Input',
                Value: 0
            },
            {
                Name: 'IncludeAnalytics',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'Posts',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'TotalCount',
                Type: 'Output',
                Value: null
            }
        ];
    }

    /**
     * Get action description
     */
    public get Description(): string {
        return 'Retrieves posts from the authenticated user\'s LinkedIn personal profile with limited analytics data';
    }
}