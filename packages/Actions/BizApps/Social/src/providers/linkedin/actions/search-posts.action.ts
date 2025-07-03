import { RegisterClass } from '@memberjunction/global';
import { LinkedInBaseAction, LinkedInShare } from '../linkedin-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { SocialPost, SearchParams } from '../../../base/base-social.action';

/**
 * Action to search for historical posts on LinkedIn
 */
@RegisterClass(BaseAction, 'LinkedInSearchPostsAction')
export class LinkedInSearchPostsAction extends LinkedInBaseAction {
    /**
     * Search for posts on LinkedIn with various filters
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
            const query = this.getParamValue(Params, 'Query');
            const hashtags = this.getParamValue(Params, 'Hashtags');
            const startDate = this.getParamValue(Params, 'StartDate');
            const endDate = this.getParamValue(Params, 'EndDate');
            const authorType = this.getParamValue(Params, 'AuthorType') || 'all'; // 'personal', 'organization', 'all'
            const organizationId = this.getParamValue(Params, 'OrganizationID');
            const limit = this.getParamValue(Params, 'Limit') || 100;
            const offset = this.getParamValue(Params, 'Offset') || 0;
            const includeAnalytics = this.getParamValue(Params, 'IncludeAnalytics') === true;

            // Build search parameters
            const searchParams: SearchParams = {
                query: query,
                hashtags: hashtags,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                limit: limit,
                offset: offset
            };

            // Perform the search
            const posts = await this.searchPostsImplementation(
                searchParams,
                authorType,
                organizationId,
                includeAnalytics
            );

            LogStatus(`Found ${posts.length} posts matching search criteria`);

            // Update output parameters
            const outputParams = [...Params];
            const postsParam = outputParams.find(p => p.Name === 'Posts');
            if (postsParam) postsParam.Value = posts;
            const totalCountParam = outputParams.find(p => p.Name === 'TotalCount');
            if (totalCountParam) totalCountParam.Value = posts.length;

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Successfully found ${posts.length} posts`,
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
     * Implementation of post search
     */
    private async searchPostsImplementation(
        params: SearchParams,
        authorType: string,
        organizationId?: string,
        includeAnalytics: boolean = false
    ): Promise<SocialPost[]> {
        const allPosts: SocialPost[] = [];
        const authorsToSearch: string[] = [];

        // Determine which authors to search
        if (authorType === 'personal' || authorType === 'all') {
            const userUrn = await this.getCurrentUserUrn();
            authorsToSearch.push(userUrn);
        }

        if (authorType === 'organization' || authorType === 'all') {
            if (organizationId) {
                authorsToSearch.push(`urn:li:organization:${organizationId}`);
            } else {
                // Get all admin organizations
                const orgs = await this.getAdminOrganizations();
                authorsToSearch.push(...orgs.map(org => org.urn));
            }
        }

        // Search posts for each author
        for (const authorUrn of authorsToSearch) {
            LogStatus(`Searching posts for author: ${authorUrn}`);
            
            // Get all posts for the author (LinkedIn doesn't support direct content search)
            const shares = await this.getAllSharesForAuthor(authorUrn, params.limit || 100);
            
            // Filter posts based on search criteria
            for (const share of shares) {
                if (this.matchesSearchCriteria(share, params)) {
                    const post = this.normalizePost(share);
                    
                    // Optionally fetch analytics
                    if (includeAnalytics && authorUrn.includes('organization')) {
                        try {
                            const analytics = await this.getPostAnalyticsForSearch(share.id, authorUrn);
                            if (analytics) {
                                post.analytics = this.normalizeAnalytics(analytics);
                            }
                        } catch (error) {
                            LogError(`Failed to get analytics for post ${share.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        }
                    }
                    
                    allPosts.push(post);
                }
            }
        }

        // Sort by date (newest first)
        allPosts.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

        // Apply offset and limit
        const startIndex = params.offset || 0;
        const endIndex = startIndex + (params.limit || 100);
        
        return allPosts.slice(startIndex, endIndex);
    }

    /**
     * Get all shares for an author with pagination
     */
    private async getAllSharesForAuthor(authorUrn: string, maxResults: number): Promise<LinkedInShare[]> {
        const allShares: LinkedInShare[] = [];
        let start = 0;
        const count = 50; // LinkedIn's typical page size

        while (allShares.length < maxResults) {
            try {
                const shares = await this.getShares(authorUrn, count, start);
                
                if (shares.length === 0) {
                    break; // No more results
                }

                allShares.push(...shares);
                start += count;

                // Check if we've hit the API limit
                if (shares.length < count) {
                    break; // Last page
                }
            } catch (error) {
                LogError(`Error fetching shares at offset ${start}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                break;
            }
        }

        return allShares.slice(0, maxResults);
    }

    /**
     * Check if a share matches the search criteria
     */
    private matchesSearchCriteria(share: LinkedInShare, params: SearchParams): boolean {
        const content = share.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || '';
        const publishedDate = new Date(share.firstPublishedAt || share.created.time);

        // Check date range
        if (params.startDate && publishedDate < params.startDate) {
            return false;
        }
        if (params.endDate && publishedDate > params.endDate) {
            return false;
        }

        // Check query (case-insensitive)
        if (params.query) {
            const query = params.query.toLowerCase();
            if (!content.toLowerCase().includes(query)) {
                return false;
            }
        }

        // Check hashtags
        if (params.hashtags && params.hashtags.length > 0) {
            const contentLower = content.toLowerCase();
            const hasAllHashtags = params.hashtags.every(hashtag => {
                const normalizedHashtag = hashtag.toLowerCase().startsWith('#') 
                    ? hashtag.toLowerCase() 
                    : `#${hashtag.toLowerCase()}`;
                return contentLower.includes(normalizedHashtag);
            });
            
            if (!hasAllHashtags) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get analytics for a post during search
     */
    private async getPostAnalyticsForSearch(shareId: string, organizationUrn: string): Promise<any> {
        try {
            const response = await this.axiosInstance.get('/organizationalEntityShareStatistics', {
                params: {
                    q: 'organizationalEntity',
                    organizationalEntity: organizationUrn,
                    shares: `List(${shareId})`
                }
            });

            if (response.data.elements && response.data.elements.length > 0) {
                return response.data.elements[0];
            }

            return null;
        } catch (error) {
            // Silently fail for individual analytics requests during search
            return null;
        }
    }

    /**
     * Override base searchPosts method
     */
    protected async searchPosts(params: SearchParams): Promise<SocialPost[]> {
        return this.searchPostsImplementation(params, 'all');
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
                Value: null // Array of hashtags
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
                Name: 'AuthorType',
                Type: 'Input',
                Value: 'all' // 'personal', 'organization', 'all'
            },
            {
                Name: 'OrganizationID',
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
        return 'Searches for historical LinkedIn posts with support for content search, hashtags, date ranges, and author filtering. Retrieves posts from personal profiles and organization pages.';
    }
}