import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Action to get sent (published) posts from Buffer
 */
@RegisterClass(BaseAction, 'BufferGetSentPostsAction')
export class BufferGetSentPostsAction extends BufferBaseAction {
    /**
     * Get sent posts from Buffer
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Get parameters
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            const profileId = this.getParamValue(Params, 'ProfileID');
            const page = this.getParamValue(Params, 'Page') || 1;
            const count = this.getParamValue(Params, 'Count') || 10;
            const since = this.getParamValue(Params, 'Since');
            const useUTC = this.getParamValue(Params, 'UseUTC') !== false;

            // Validate required parameters
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
            }

            if (!profileId) {
                throw new Error('ProfileID is required');
            }

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId)) {
                return {
                    Success: false,
                    ResultCode: 'INVALID_TOKEN',
                    Message: 'Failed to initialize Buffer OAuth connection',
                    Params
                };
            }

            // Get sent posts
            const result = await this.getUpdates(profileId, 'sent', {
                page,
                count,
                since: since ? new Date(since) : undefined,
                utc: useUTC
            });

            // Format posts
            const posts = result.updates || [];
            const formattedPosts = posts.map((update: any) => this.normalizePost(update));

            // Create summary
            const summary = {
                totalPosts: formattedPosts.length,
                page: page,
                hasMore: posts.length === count,
                profileId: profileId,
                dateRange: {
                    earliest: formattedPosts.length > 0 ? 
                        formattedPosts[formattedPosts.length - 1].publishedAt : null,
                    latest: formattedPosts.length > 0 ? 
                        formattedPosts[0].publishedAt : null
                },
                postsByDay: this.groupPostsByDay(formattedPosts),
                totalEngagements: this.calculateTotalEngagements(formattedPosts),
                topPerformingPost: this.findTopPerformingPost(formattedPosts)
            };

            // Update output parameters
            const outputParams = [...Params];
            const postsParam = outputParams.find(p => p.Name === 'Posts');
            if (postsParam) postsParam.Value = formattedPosts;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved ${formattedPosts.length} sent posts from Buffer`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            const resultCode = this.mapBufferError(error);
            
            return {
                Success: false,
                ResultCode: resultCode,
                Message: `Failed to get sent posts: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Group posts by published day
     */
    private groupPostsByDay(posts: any[]): Record<string, number> {
        return posts.reduce((acc, post) => {
            if (post.publishedAt) {
                const day = post.publishedAt.toISOString().split('T')[0];
                acc[day] = (acc[day] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);
    }

    /**
     * Calculate total engagements across all posts
     */
    private calculateTotalEngagements(posts: any[]): number {
        return posts.reduce((total, post) => {
            if (post.analytics) {
                return total + post.analytics.engagements;
            }
            return total;
        }, 0);
    }

    /**
     * Find the top performing post by engagements
     */
    private findTopPerformingPost(posts: any[]): any {
        if (posts.length === 0) return null;

        return posts.reduce((top, post) => {
            if (!top || (post.analytics?.engagements || 0) > (top.analytics?.engagements || 0)) {
                return post;
            }
            return top;
        }, posts[0]);
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'ProfileID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Page',
                Type: 'Input',
                Value: 1
            },
            {
                Name: 'Count',
                Type: 'Input',
                Value: 10
            },
            {
                Name: 'Since',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'UseUTC',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'Posts',
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
        return 'Retrieves sent (published) posts from Buffer for a specific social media profile with analytics data';
    }
}