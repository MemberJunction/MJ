import { RegisterClass } from '@memberjunction/global';
import { FacebookBaseAction, FacebookPost } from '../facebook-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialPost, SearchParams, SocialMediaErrorCode } from '../../../base/base-social.action';
import { LogStatus, LogError } from '@memberjunction/core';
import axios from 'axios';

/**
 * Searches for historical posts on Facebook pages.
 * Provides powerful search capabilities including date ranges, keywords, and content types.
 */
@RegisterClass(FacebookBaseAction, 'FacebookSearchPostsAction')
export class FacebookSearchPostsAction extends FacebookBaseAction {
    /**
     * Get action description
     */
    public get Description(): string {
        return 'Searches for historical posts on Facebook pages with filters for date ranges, keywords, hashtags, and content types';
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'PageIDs',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'Query',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'Hashtags',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'StartDate',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'EndDate',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'PostTypes',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'MinEngagements',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'IncludeMetrics',
                Type: 'Input',
                Value: true,
                },
            {
                Name: 'Limit',
                Type: 'Input',
                Value: 100,
                },
            {
                Name: 'SortBy',
                Type: 'Input',
                Value: 'created_time',
                },
            {
                Name: 'SortOrder',
                Type: 'Input',
                Value: 'DESC',
                }
        ];
    }

    /**
     * Execute the action
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Validate required parameters
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            
            if (!companyIntegrationId) {
                return {
                Success: false,
                Message: 'CompanyIntegrationID is required',
                ResultCode: 'INVALID_TOKEN'
            };
            }

            // Initialize OAuth
            if (!await this.initializeOAuth(companyIntegrationId)) {
                return {
                Success: false,
                Message: 'Failed to initialize Facebook OAuth connection',
                ResultCode: 'INVALID_TOKEN'
            };
            }

            // Get parameters
            const pageIds = this.getParamValue(Params, 'PageIDs') as string[];
            const query = this.getParamValue(Params, 'Query') as string;
            const hashtags = this.getParamValue(Params, 'Hashtags') as string[];
            const startDate = this.getParamValue(Params, 'StartDate') as string;
            const endDate = this.getParamValue(Params, 'EndDate') as string;
            const postTypes = this.getParamValue(Params, 'PostTypes') as string[];
            const minEngagements = this.getParamValue(Params, 'MinEngagements') as number;
            const includeMetrics = this.getParamValue(Params, 'IncludeMetrics') !== false;
            const limit = this.getParamValue(Params, 'Limit') as number || 100;
            const sortBy = this.getParamValue(Params, 'SortBy') as string || 'created_time';
            const sortOrder = this.getParamValue(Params, 'SortOrder') as string || 'DESC';

            // Build search parameters
            const searchParams: SearchParams = {
                query,
                hashtags,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                limit
            };

            LogStatus('Starting Facebook post search...');

            // Get pages to search
            let pagesToSearch = pageIds;
            if (!pagesToSearch || pagesToSearch.length === 0) {
                // Get all accessible pages
                const userPages = await this.getUserPages();
                pagesToSearch = userPages.map(p => p.id);
                LogStatus(`Searching across ${pagesToSearch.length} accessible pages`);
            }

            // Search posts from each page
            const allPosts: FacebookPost[] = [];
            for (const pageId of pagesToSearch) {
                try {
                    const posts = await this.searchPagePosts(
                        pageId,
                        searchParams,
                        postTypes,
                        includeMetrics
                    );
                    allPosts.push(...posts);
                    LogStatus(`Found ${posts.length} posts from page ${pageId}`);
                } catch (error) {
                    LogError(`Failed to search page ${pageId}: ${error}`);
                    // Continue with other pages
                }
            }

            // Filter by minimum engagements if specified
            let filteredPosts = allPosts;
            if (minEngagements && minEngagements > 0) {
                filteredPosts = allPosts.filter(post => {
                    const engagements = this.calculateEngagements(post);
                    return engagements >= minEngagements;
                });
                LogStatus(`Filtered to ${filteredPosts.length} posts with at least ${minEngagements} engagements`);
            }

            // Sort posts
            const sortedPosts = this.sortPosts(filteredPosts, sortBy, sortOrder);

            // Limit results
            const limitedPosts = sortedPosts.slice(0, limit);

            // Normalize posts to common format
            const normalizedPosts = limitedPosts.map(post => this.normalizePost(post));

            // Calculate search summary
            const summary = this.calculateSearchSummary(normalizedPosts, searchParams);

            LogStatus(`Search completed. Found ${normalizedPosts.length} matching posts`);

            // Update output parameters
            const outputParams = [...Params];
            // TODO: Set output parameters based on result
            
            return {
                Success: true,
                Message: `Found ${normalizedPosts.length} posts matching search criteria`,
                ResultCode: 'SUCCESS',
                Params: outputParams
            };

        } catch (error) {
            LogError(`Failed to search Facebook posts: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            if (this.isAuthError(error)) {
                return this.handleOAuthError(error);
            }

            return {
                Success: false,
                Message: error instanceof Error ? error.message : 'Unknown error occurred',
                ResultCode: 'ERROR'
            };
        }
    }

    /**
     * Search posts from a specific page
     */
    private async searchPagePosts(
        pageId: string,
        searchParams: SearchParams,
        postTypes: string[] | null,
        includeMetrics: boolean
    ): Promise<FacebookPost[]> {
        const pageToken = await this.getPageAccessToken(pageId);
        
        // Build fields parameter
        const fields = includeMetrics 
            ? this.getPostFields() 
            : 'id,message,created_time,updated_time,from,story,permalink_url,attachments';

        // Build API parameters
        const apiParams: any = {
            access_token: pageToken,
            fields,
            limit: 100 // Get max per request, we'll filter later
        };

        // Add date range
        if (searchParams.startDate) {
            apiParams.since = Math.floor(searchParams.startDate.getTime() / 1000);
        }
        if (searchParams.endDate) {
            apiParams.until = Math.floor(searchParams.endDate.getTime() / 1000);
        }

        // Get all posts in date range
        const allPosts = await this.getPaginatedResults<FacebookPost>(
            `${this.apiBaseUrl}/${pageId}/posts`,
            apiParams,
            searchParams.limit ? searchParams.limit * 2 : undefined // Get extra to account for filtering
        );

        // Filter posts based on search criteria
        let filteredPosts = allPosts;

        // Filter by content/query
        if (searchParams.query) {
            const queryLower = searchParams.query.toLowerCase();
            filteredPosts = filteredPosts.filter(post => {
                const message = (post.message || '').toLowerCase();
                const story = (post.story || '').toLowerCase();
                return message.includes(queryLower) || story.includes(queryLower);
            });
        }

        // Filter by hashtags
        if (searchParams.hashtags && searchParams.hashtags.length > 0) {
            const hashtagsToFind = searchParams.hashtags.map(tag => 
                tag.startsWith('#') ? tag.toLowerCase() : `#${tag}`.toLowerCase()
            );
            
            filteredPosts = filteredPosts.filter(post => {
                const content = (post.message || '').toLowerCase();
                return hashtagsToFind.some(hashtag => content.includes(hashtag));
            });
        }

        // Filter by post types
        if (postTypes && postTypes.length > 0) {
            filteredPosts = filteredPosts.filter(post => {
                const postType = this.getPostType(post);
                return postTypes.includes(postType);
            });
        }

        return filteredPosts;
    }

    /**
     * Implement the abstract searchPosts method
     */
    protected async searchPosts(params: SearchParams): Promise<SocialPost[]> {
        // This is called by the base class, but we implement our own search logic
        // in RunAction, so we'll just throw an error here
        throw new Error('Use FacebookSearchPostsAction.RunAction instead');
    }

    /**
     * Get post type from Facebook post
     */
    private getPostType(post: FacebookPost): string {
        if (post.attachments?.data?.[0]?.type) {
            return post.attachments.data[0].type.toLowerCase();
        }
        return 'status';
    }

    /**
     * Calculate total engagements for a post
     */
    private calculateEngagements(post: FacebookPost): number {
        const reactions = post.reactions?.summary?.total_count || 0;
        const comments = post.comments?.summary?.total_count || 0;
        const shares = post.shares?.count || 0;
        
        return reactions + comments + shares;
    }

    /**
     * Sort posts by specified criteria
     */
    private sortPosts(posts: FacebookPost[], sortBy: string, sortOrder: string): FacebookPost[] {
        const sorted = [...posts].sort((a, b) => {
            let aValue: number;
            let bValue: number;

            switch (sortBy) {
                case 'engagement':
                    aValue = this.calculateEngagements(a);
                    bValue = this.calculateEngagements(b);
                    break;
                case 'reach':
                    aValue = this.getPostReach(a);
                    bValue = this.getPostReach(b);
                    break;
                case 'created_time':
                default:
                    aValue = new Date(a.created_time).getTime();
                    bValue = new Date(b.created_time).getTime();
                    break;
            }

            return sortOrder === 'DESC' ? bValue - aValue : aValue - bValue;
        });

        return sorted;
    }

    /**
     * Get post reach from insights
     */
    private getPostReach(post: FacebookPost): number {
        if (post.insights?.data) {
            const reachInsight = post.insights.data.find(i => 
                i.name === 'post_impressions_unique' || i.name === 'post_reach'
            );
            return reachInsight?.values?.[0]?.value || 0;
        }
        return 0;
    }

    /**
     * Calculate search summary statistics
     */
    private calculateSearchSummary(posts: SocialPost[], searchParams: SearchParams): any {
        if (posts.length === 0) {
            return {
                totalPosts: 0,
                dateRange: null,
                topHashtags: [],
                postTypes: {},
                engagementStats: null
            };
        }

        // Date range
        const dates = posts.map(p => p.publishedAt.getTime());
        const dateRange = {
            earliest: new Date(Math.min(...dates)),
            latest: new Date(Math.max(...dates))
        };

        // Extract hashtags
        const hashtagCounts: Record<string, number> = {};
        posts.forEach(post => {
            const hashtags = post.content.match(/#\w+/g) || [];
            hashtags.forEach(tag => {
                hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
            });
        });

        // Top hashtags
        const topHashtags = Object.entries(hashtagCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([tag, count]) => ({ tag, count }));

        // Post types
        const postTypes: Record<string, number> = {};
        posts.forEach(post => {
            const type = post.platformSpecificData.postType || 'status';
            postTypes[type] = (postTypes[type] || 0) + 1;
        });

        // Engagement statistics
        const engagements = posts.map(p => p.analytics?.engagements || 0);
        const totalEngagements = engagements.reduce((sum, e) => sum + e, 0);
        const avgEngagements = totalEngagements / posts.length;
        const maxEngagements = Math.max(...engagements);

        return {
            totalPosts: posts.length,
            dateRange,
            topHashtags,
            postTypes,
            engagementStats: {
                total: totalEngagements,
                average: Math.round(avgEngagements),
                max: maxEngagements,
                distribution: this.getEngagementDistribution(engagements)
            }
        };
    }

    /**
     * Get engagement distribution
     */
    private getEngagementDistribution(engagements: number[]): Record<string, number> {
        const distribution = {
            '0-10': 0,
            '11-50': 0,
            '51-100': 0,
            '101-500': 0,
            '501-1000': 0,
            '1000+': 0
        };

        engagements.forEach(e => {
            if (e <= 10) distribution['0-10']++;
            else if (e <= 50) distribution['11-50']++;
            else if (e <= 100) distribution['51-100']++;
            else if (e <= 500) distribution['101-500']++;
            else if (e <= 1000) distribution['501-1000']++;
            else distribution['1000+']++;
        });

        return distribution;
    }


}