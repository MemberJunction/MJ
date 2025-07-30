import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialPost } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to search historical posts in Buffer across profiles and date ranges
 */
@RegisterClass(BaseAction, 'BufferSearchPostsAction')
export class BufferSearchPostsAction extends BufferBaseAction {
    /**
     * Search for posts in Buffer
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Get parameters
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            const query = this.getParamValue(Params, 'Query');
            const profileIds = this.getParamValue(Params, 'ProfileIDs');
            const hashtags = this.getParamValue(Params, 'Hashtags');
            const startDate = this.getParamValue(Params, 'StartDate');
            const endDate = this.getParamValue(Params, 'EndDate');
            const limit = this.getParamValue(Params, 'Limit') || 100;
            const offset = this.getParamValue(Params, 'Offset') || 0;
            const includeAnalytics = this.getParamValue(Params, 'IncludeAnalytics') !== false;

            // Validate required parameters
            if (!companyIntegrationId) {
                throw new Error('CompanyIntegrationID is required');
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

            // Search posts
            const searchParams = {
                query,
                hashtags,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                limit,
                offset,
                profileIds
            };

            const posts = await this.searchPosts(searchParams);

            // Optionally fetch analytics for each post
            if (includeAnalytics) {
                for (const post of posts) {
                    try {
                        const analytics = await this.getAnalytics(post.id);
                        post.analytics = this.normalizeAnalytics(analytics);
                    } catch (error) {
                        // Log but don't fail if analytics fetch fails
                        console.warn(`Failed to fetch analytics for post ${post.id}:`, error);
                    }
                }
            }

            // Create search statistics
            const statistics = this.generateSearchStatistics(posts, searchParams);

            // Create summary
            const summary = {
                totalResults: posts.length,
                searchCriteria: {
                    query: query || null,
                    hashtags: hashtags || [],
                    dateRange: {
                        start: startDate || null,
                        end: endDate || null
                    },
                    profileIds: profileIds || [],
                    limit,
                    offset
                },
                statistics,
                topPerformingPost: this.findTopPerformingPost(posts),
                dateRange: {
                    earliest: posts.length > 0 ? posts[posts.length - 1].publishedAt : null,
                    latest: posts.length > 0 ? posts[0].publishedAt : null
                }
            };

            // Update output parameters
            const outputParams = [...Params];
            const postsParam = outputParams.find(p => p.Name === 'Posts');
            if (postsParam) postsParam.Value = posts;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${posts.length} posts matching search criteria`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            const resultCode = this.mapBufferError(error);
            
            return {
                Success: false,
                ResultCode: resultCode,
                Message: `Failed to search posts: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Generate statistics from search results
     */
    private generateSearchStatistics(posts: SocialPost[], searchParams: any): any {
        const stats = {
            postsByProfile: {} as Record<string, number>,
            postsByMonth: {} as Record<string, number>,
            postsByDayOfWeek: {} as Record<string, number>,
            postsByHour: {} as Record<string, number>,
            averageEngagements: 0,
            totalEngagements: 0,
            postsWithMedia: 0,
            hashtagFrequency: {} as Record<string, number>
        };

        let totalEngagements = 0;
        let postsWithEngagementData = 0;

        for (const post of posts) {
            // Count by profile
            stats.postsByProfile[post.profileId] = (stats.postsByProfile[post.profileId] || 0) + 1;

            // Count by month
            const month = post.publishedAt.toISOString().substring(0, 7); // YYYY-MM
            stats.postsByMonth[month] = (stats.postsByMonth[month] || 0) + 1;

            // Count by day of week
            const dayOfWeek = post.publishedAt.toLocaleDateString('en-US', { weekday: 'long' });
            stats.postsByDayOfWeek[dayOfWeek] = (stats.postsByDayOfWeek[dayOfWeek] || 0) + 1;

            // Count by hour
            const hour = post.publishedAt.getHours();
            stats.postsByHour[hour] = (stats.postsByHour[hour] || 0) + 1;

            // Count posts with media
            if (post.mediaUrls && post.mediaUrls.length > 0) {
                stats.postsWithMedia++;
            }

            // Calculate engagements
            if (post.analytics) {
                totalEngagements += post.analytics.engagements;
                postsWithEngagementData++;
            }

            // Extract and count hashtags
            const hashtags = this.extractHashtags(post.content);
            for (const hashtag of hashtags) {
                stats.hashtagFrequency[hashtag] = (stats.hashtagFrequency[hashtag] || 0) + 1;
            }
        }

        // Calculate averages
        stats.totalEngagements = totalEngagements;
        stats.averageEngagements = postsWithEngagementData > 0 ? 
            totalEngagements / postsWithEngagementData : 0;

        return stats;
    }


    /**
     * Find the top performing post by engagements
     */
    private findTopPerformingPost(posts: SocialPost[]): SocialPost | null {
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
                Name: 'Query',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'ProfileIDs',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Hashtags',
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
                Name: 'Limit',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'Offset',
                Type: 'Input',
                Value: 0
            },
            {
                Name: 'IncludeAnalytics',
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
        return 'Searches historical posts in Buffer across profiles with support for date ranges, hashtags, and content queries';
    }
}