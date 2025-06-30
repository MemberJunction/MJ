import { RegisterClass } from '@memberjunction/global';
import { InstagramBaseAction } from '../instagram-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/core';
import { SocialPost } from '../../../base/base-social.action';

/**
 * Retrieves posts from an Instagram Business account.
 * Returns feed posts, carousels, reels, and IGTV videos with basic metrics.
 */
@RegisterClass(InstagramBaseAction, 'Instagram - Get Business Posts')
export class InstagramGetBusinessPostsAction extends InstagramBaseAction {
    
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const companyIntegrationId = this.getParamValue(params.Params, 'CompanyIntegrationID');
            const limit = this.getParamValue(params.Params, 'Limit') || 25;
            const mediaType = this.getParamValue(params.Params, 'MediaType');
            const includeMetrics = this.getParamValue(params.Params, 'IncludeMetrics') !== false;
            const afterCursor = this.getParamValue(params.Params, 'AfterCursor');
            const startDate = this.getParamValue(params.Params, 'StartDate');
            const endDate = this.getParamValue(params.Params, 'EndDate');

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId)) {
                return {
                    Success: false,
                    Message: 'Failed to initialize Instagram authentication',
                    ResultCode: 'AUTH_FAILED'
                };
            }

            // Build fields parameter
            let fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
            if (includeMetrics) {
                fields += ',like_count,comments_count,impressions,reach,saved,video_views';
            }

            // Build query parameters
            const queryParams: any = {
                fields,
                access_token: this.getAccessToken(),
                limit: Math.min(limit, 100) // Instagram max is 100 per request
            };

            if (afterCursor) {
                queryParams.after = afterCursor;
            }

            // Add date filtering if provided
            if (startDate) {
                queryParams.since = Math.floor(new Date(startDate).getTime() / 1000);
            }
            if (endDate) {
                queryParams.until = Math.floor(new Date(endDate).getTime() / 1000);
            }

            // Fetch posts
            const response = await this.makeInstagramRequest<{
                data: any[];
                paging?: {
                    cursors: {
                        before: string;
                        after: string;
                    };
                    next?: string;
                    previous?: string;
                };
            }>(
                `${this.instagramBusinessAccountId}/media`,
                'GET',
                null,
                queryParams
            );

            // Filter by media type if specified
            let posts = response.data || [];
            if (mediaType) {
                posts = posts.filter(post => post.media_type === mediaType);
            }

            // Transform to common format
            const normalizedPosts: SocialPost[] = posts.map(post => this.normalizePost(post));

            // Get additional insights if requested and available
            if (includeMetrics && posts.length > 0) {
                await this.enrichPostsWithInsights(normalizedPosts);
            }

            // Store result in output params
            const outputParams = [...params.Params];
            outputParams.push({
                Name: 'ResultData',
                Type: 'Output',
                Value: JSON.stringify({
                    posts: normalizedPosts,
                    paging: {
                        hasNext: !!response.paging?.next,
                        hasPrevious: !!response.paging?.previous,
                        afterCursor: response.paging?.cursors?.after,
                        beforeCursor: response.paging?.cursors?.before
                    },
                    summary: {
                        totalPosts: normalizedPosts.length,
                        mediaTypes: this.summarizeMediaTypes(posts),
                        dateRange: this.getDateRange(normalizedPosts)
                    }
                })
            });

            return {
                Success: true,
                Message: `Retrieved ${normalizedPosts.length} Instagram posts`,
                ResultCode: 'SUCCESS',
                Params: outputParams
            };

        } catch (error: any) {
            LogError('Failed to retrieve Instagram business posts', error);
            
            if (error.code === 'RATE_LIMIT') {
                return {
                    Success: false,
                    Message: 'Instagram API rate limit exceeded. Please try again later.',
                    ResultCode: 'RATE_LIMIT'
                };
            }

            if (error.code === 'INSUFFICIENT_PERMISSIONS') {
                return {
                    Success: false,
                    Message: 'Insufficient permissions to access Instagram business posts',
                    ResultCode: 'INSUFFICIENT_PERMISSIONS'
                };
            }

            return {
                Success: false,
                Message: `Failed to retrieve Instagram posts: ${error.message}`,
                ResultCode: 'ERROR'
            };
        }
    }

    /**
     * Enrich posts with additional insights data
     */
    private async enrichPostsWithInsights(posts: SocialPost[]): Promise<void> {
        // Instagram allows batch insights requests
        const postIds = posts.map(p => p.id);
        const batchSize = 50; // Instagram's batch limit

        for (let i = 0; i < postIds.length; i += batchSize) {
            const batch = postIds.slice(i, i + batchSize);
            
            try {
                // Get insights for this batch
                const metrics = ['impressions', 'reach', 'engagement', 'saved', 'video_views'];
                const insightsPromises = batch.map(postId => 
                    this.getInsights(postId, metrics, 'lifetime')
                );

                const insightsResults = await Promise.allSettled(insightsPromises);

                // Map insights back to posts
                insightsResults.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value) {
                        const postIndex = i + index;
                        const post = posts[postIndex];
                        
                        // Parse insights data
                        result.value.forEach((metric: any) => {
                            const value = metric.values?.[0]?.value || 0;
                            
                            switch (metric.name) {
                                case 'impressions':
                                    post.analytics!.impressions = value;
                                    break;
                                case 'reach':
                                    post.analytics!.reach = value;
                                    break;
                                case 'engagement':
                                    post.analytics!.engagements = value;
                                    break;
                                case 'saved':
                                    post.analytics!.saves = value;
                                    break;
                                case 'video_views':
                                    post.analytics!.videoViews = value;
                                    break;
                            }
                        });
                    }
                });
            } catch (error) {
                // Log but don't fail the whole operation
                LogError(`Failed to get insights for batch starting at ${i}`, error);
            }
        }
    }

    /**
     * Summarize media types in the response
     */
    private summarizeMediaTypes(posts: any[]): Record<string, number> {
        const summary: Record<string, number> = {
            IMAGE: 0,
            VIDEO: 0,
            CAROUSEL_ALBUM: 0
        };

        posts.forEach(post => {
            if (summary[post.media_type] !== undefined) {
                summary[post.media_type]++;
            }
        });

        return summary;
    }

    /**
     * Get date range of posts
     */
    private getDateRange(posts: SocialPost[]): { earliest: Date | null; latest: Date | null } {
        if (posts.length === 0) {
            return { earliest: null, latest: null };
        }

        const dates = posts.map(p => p.publishedAt.getTime());
        return {
            earliest: new Date(Math.min(...dates)),
            latest: new Date(Math.max(...dates))
        };
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'Limit',
                Type: 'Input',
                Value: 25
            },
            {
                Name: 'MediaType',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeMetrics',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'AfterCursor',
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
            }
        ];
    }

    /**
     * Get the description for this action
     */
    public get Description(): string {
        return 'Retrieves posts from an Instagram Business account with optional metrics and filtering.';
    }
}