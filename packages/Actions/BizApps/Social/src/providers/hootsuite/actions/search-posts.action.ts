import { RegisterClass } from '@memberjunction/global';
import { HootSuiteBaseAction, HootSuitePost } from '../hootsuite-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { SearchParams, SocialPost } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to search historical posts in HootSuite
 */
@RegisterClass(BaseAction, 'HootSuiteSearchPostsAction')
export class HootSuiteSearchPostsAction extends HootSuiteBaseAction {
    /**
     * Search for posts in HootSuite
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        
        try {
            // Initialize OAuth
            const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
            if (!await this.initializeOAuth(companyIntegrationId)) {
                throw new Error('Failed to initialize OAuth connection');
            }

            // Extract search parameters
            const query = this.getParamValue(Params, 'Query');
            const hashtags = this.getParamValue(Params, 'Hashtags');
            const startDate = this.getParamValue(Params, 'StartDate');
            const endDate = this.getParamValue(Params, 'EndDate');
            const profileId = this.getParamValue(Params, 'ProfileID');
            const postState = this.getParamValue(Params, 'PostState') || 'PUBLISHED';
            const limit = this.getParamValue(Params, 'Limit') || 100;
            const includeAnalytics = this.getParamValue(Params, 'IncludeAnalytics') || false;
            const sortBy = this.getParamValue(Params, 'SortBy') || 'publishedTime';
            const sortOrder = this.getParamValue(Params, 'SortOrder') || 'DESC';

            // Build search parameters
            const searchParams: SearchParams = {
                query: query,
                hashtags: hashtags,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                limit: limit
            };

            // Perform the search
            LogStatus('Searching for posts...');
            const posts = await this.searchPosts(searchParams);

            // Filter by profile if specified
            let filteredPosts = posts;
            if (profileId) {
                filteredPosts = posts.filter(p => 
                    p.profileId.includes(profileId) || 
                    (p.platformSpecificData?.socialProfileIds?.includes(profileId))
                );
            }

            // Sort results
            filteredPosts = this.sortPosts(filteredPosts, sortBy, sortOrder);

            // Limit results
            if (limit && filteredPosts.length > limit) {
                filteredPosts = filteredPosts.slice(0, limit);
            }

            // Optionally include analytics
            if (includeAnalytics) {
                LogStatus('Fetching analytics for posts...');
                filteredPosts = await this.enrichPostsWithAnalytics(filteredPosts);
            }

            // Analyze content patterns
            const contentAnalysis = this.analyzePostContent(filteredPosts);

            // Create summary
            const summary = {
                totalResults: filteredPosts.length,
                dateRange: {
                    start: startDate || 'Not specified',
                    end: endDate || 'Not specified',
                    actualStart: filteredPosts.length > 0 
                        ? filteredPosts[filteredPosts.length - 1].publishedAt.toISOString() 
                        : null,
                    actualEnd: filteredPosts.length > 0 
                        ? filteredPosts[0].publishedAt.toISOString() 
                        : null
                },
                byProfile: this.groupByProfile(filteredPosts),
                byMonth: this.groupByMonth(filteredPosts),
                contentAnalysis: contentAnalysis,
                topHashtags: this.extractTopHashtags(filteredPosts),
                performanceStats: includeAnalytics ? this.calculatePerformanceStats(filteredPosts) : null
            };

            // Update output parameters
            const outputParams = [...Params];
            const postsParam = outputParams.find(p => p.Name === 'Posts');
            if (postsParam) postsParam.Value = filteredPosts;
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) summaryParam.Value = summary;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Found ${filteredPosts.length} posts matching search criteria`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: `Failed to search posts: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Search for posts implementation
     */
    protected async searchPosts(params: SearchParams): Promise<SocialPost[]> {
        const queryParams: any = {
            limit: Math.min(params.limit || 100, 100),
            maxResults: params.limit
        };

        // Add state filter - default to published for historical search
        queryParams.state = 'PUBLISHED';

        // Add date filters
        if (params.startDate) {
            queryParams.publishedAfter = this.formatHootSuiteDate(params.startDate);
        }
        if (params.endDate) {
            queryParams.publishedBefore = this.formatHootSuiteDate(params.endDate);
        }

        // Add text search
        if (params.query) {
            queryParams.text = params.query;
        }

        // Add hashtag search
        if (params.hashtags && params.hashtags.length > 0) {
            // HootSuite API may require hashtags in the text query
            const hashtagQuery = params.hashtags.map(tag => 
                tag.startsWith('#') ? tag : `#${tag}`
            ).join(' ');
            
            queryParams.text = params.query 
                ? `${params.query} ${hashtagQuery}`
                : hashtagQuery;
        }

        // Make paginated request
        const hootSuitePosts = await this.makePaginatedRequest<HootSuitePost>('/messages', queryParams);

        // Convert to common format
        return hootSuitePosts.map(post => this.normalizePost(post));
    }

    /**
     * Enrich posts with analytics data
     */
    private async enrichPostsWithAnalytics(posts: SocialPost[]): Promise<SocialPost[]> {
        const enrichedPosts: SocialPost[] = [];

        for (const post of posts) {
            try {
                const response = await this.axiosInstance.get(`/analytics/posts/${post.id}`);
                const analytics = response.data;
                
                enrichedPosts.push({
                    ...post,
                    analytics: this.normalizeAnalytics(analytics.metrics)
                });
            } catch (error) {
                // If analytics fail, include post without analytics
                LogStatus(`Could not get analytics for post ${post.id}`);
                enrichedPosts.push(post);
            }
        }

        return enrichedPosts;
    }

    /**
     * Sort posts by specified criteria
     */
    private sortPosts(posts: SocialPost[], sortBy: string, sortOrder: string): SocialPost[] {
        return posts.sort((a, b) => {
            let compareValue = 0;

            switch (sortBy) {
                case 'publishedTime':
                    compareValue = a.publishedAt.getTime() - b.publishedAt.getTime();
                    break;
                case 'engagements':
                    compareValue = (a.analytics?.engagements || 0) - (b.analytics?.engagements || 0);
                    break;
                case 'impressions':
                    compareValue = (a.analytics?.impressions || 0) - (b.analytics?.impressions || 0);
                    break;
                default:
                    compareValue = a.publishedAt.getTime() - b.publishedAt.getTime();
            }

            return sortOrder === 'DESC' ? -compareValue : compareValue;
        });
    }

    /**
     * Analyze post content patterns
     */
    private analyzePostContent(posts: SocialPost[]): any {
        const totalPosts = posts.length;
        if (totalPosts === 0) return null;

        const contentLengths = posts.map(p => p.content.length);
        const avgLength = contentLengths.reduce((a, b) => a + b, 0) / totalPosts;

        const withMedia = posts.filter(p => p.mediaUrls && p.mediaUrls.length > 0).length;
        const withHashtags = posts.filter(p => p.content.includes('#')).length;
        const withLinks = posts.filter(p => 
            p.content.includes('http://') || p.content.includes('https://')
        ).length;

        return {
            averageLength: Math.round(avgLength),
            minLength: Math.min(...contentLengths),
            maxLength: Math.max(...contentLengths),
            withMedia: withMedia,
            withMediaPercentage: (withMedia / totalPosts) * 100,
            withHashtags: withHashtags,
            withHashtagsPercentage: (withHashtags / totalPosts) * 100,
            withLinks: withLinks,
            withLinksPercentage: (withLinks / totalPosts) * 100
        };
    }

    /**
     * Extract top hashtags from posts
     */
    private extractTopHashtags(posts: SocialPost[]): Array<{ hashtag: string; count: number }> {
        const hashtagCounts: Record<string, number> = {};

        posts.forEach(post => {
            const hashtags = post.content.match(/#\w+/g) || [];
            hashtags.forEach(tag => {
                const normalized = tag.toLowerCase();
                hashtagCounts[normalized] = (hashtagCounts[normalized] || 0) + 1;
            });
        });

        return Object.entries(hashtagCounts)
            .map(([hashtag, count]) => ({ hashtag, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
    }

    /**
     * Calculate performance statistics
     */
    private calculatePerformanceStats(posts: SocialPost[]): any {
        const postsWithAnalytics = posts.filter(p => p.analytics);
        if (postsWithAnalytics.length === 0) return null;

        const totalEngagements = postsWithAnalytics.reduce((sum, p) => 
            sum + (p.analytics?.engagements || 0), 0
        );
        const totalImpressions = postsWithAnalytics.reduce((sum, p) => 
            sum + (p.analytics?.impressions || 0), 0
        );

        const avgEngagements = totalEngagements / postsWithAnalytics.length;
        const avgImpressions = totalImpressions / postsWithAnalytics.length;
        const engagementRate = totalImpressions > 0 
            ? (totalEngagements / totalImpressions) * 100 
            : 0;

        return {
            postsAnalyzed: postsWithAnalytics.length,
            averageEngagements: Math.round(avgEngagements),
            averageImpressions: Math.round(avgImpressions),
            totalEngagements: totalEngagements,
            totalImpressions: totalImpressions,
            engagementRate: engagementRate.toFixed(2)
        };
    }

    /**
     * Group posts by profile
     */
    private groupByProfile(posts: SocialPost[]): Record<string, number> {
        const groups: Record<string, number> = {};
        
        posts.forEach(post => {
            const profiles = post.platformSpecificData?.socialProfileIds || [post.profileId];
            profiles.forEach((profileId: string) => {
                groups[profileId] = (groups[profileId] || 0) + 1;
            });
        });

        return groups;
    }

    /**
     * Group posts by month
     */
    private groupByMonth(posts: SocialPost[]): Record<string, number> {
        const groups: Record<string, number> = {};
        
        posts.forEach(post => {
            const monthKey = post.publishedAt.toISOString().substring(0, 7);
            groups[monthKey] = (groups[monthKey] || 0) + 1;
        });

        return groups;
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
                Name: 'PostState',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'Limit',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeAnalytics',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SortBy',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SortOrder',
                Type: 'Input',
                Value: null
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
     * Get action description
     */
    public get Description(): string {
        return 'Searches historical posts in HootSuite with support for text queries, hashtags, date ranges, and content analysis';
    }
}