import { RegisterClass } from '@memberjunction/global';
import { FacebookBaseAction, GetPagePostsParams } from '../facebook-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { SocialMediaErrorCode } from '../../../base/base-social.action';
import { LogStatus, LogError } from '@memberjunction/core';

/**
 * Retrieves posts from a Facebook page with optional date filtering.
 * Includes post content, media, and basic engagement metrics.
 */
@RegisterClass(BaseAction, 'FacebookGetPagePostsAction')
export class FacebookGetPagePostsAction extends FacebookBaseAction {
    /**
     * Get action description
     */
    public get Description(): string {
        return 'Retrieves posts from a Facebook page with optional date range filtering and pagination';
    }

    /**
     * Define the parameters for this action
     */
    public get Params(): ActionParam[] {
        return [
            ...this.commonSocialParams,
            {
                Name: 'PageID',
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
                Name: 'Limit',
                Type: 'Input',
                Value: 100,
                },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: null,
                },
            {
                Name: 'IncludeUnpublished',
                Type: 'Input',
                Value: false,
                },
            {
                Name: 'IncludeInsights',
                Type: 'Input',
                Value: true,
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
            const pageId = this.getParamValue(Params, 'PageID');
            
            if (!companyIntegrationId) {
                return {
                Success: false,
                Message: 'CompanyIntegrationID is required',
                ResultCode: 'INVALID_TOKEN'
            };
            }

            if (!pageId) {
                return {
                Success: false,
                Message: 'PageID is required',
                ResultCode: 'MISSING_REQUIRED_PARAM'
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
            const startDate = this.getParamValue(Params, 'StartDate') as string;
            const endDate = this.getParamValue(Params, 'EndDate') as string;
            const limit = this.getParamValue(Params, 'Limit') as number || 100;
            const maxResults = this.getParamValue(Params, 'MaxResults') as number;
            const includeUnpublished = this.getParamValue(Params, 'IncludeUnpublished') as boolean;
            const includeInsights = this.getParamValue(Params, 'IncludeInsights') as boolean;

            // Build query parameters
            const queryParams: GetPagePostsParams = {
                limit: Math.min(limit, 100), // Facebook max is 100 per request
                published: includeUnpublished ? undefined : true
            };

            if (startDate) {
                queryParams.since = new Date(startDate);
            }

            if (endDate) {
                queryParams.until = new Date(endDate);
            }

            LogStatus(`Retrieving posts from Facebook page ${pageId}...`);

            // Get posts with pagination support
            let allPosts = await this.getPagePosts(pageId, queryParams);

            // If we need more posts and have a maxResults, use pagination
            if (maxResults && allPosts.length < maxResults && allPosts.length === queryParams.limit) {
                LogStatus(`Fetching additional pages of posts...`);
                
                const pageToken = await this.getPageAccessToken(pageId);
                const fields = includeInsights ? this.getPostFields() : this.getPostFieldsWithoutInsights();
                
                allPosts = await this.getPaginatedResults(
                    `${this.apiBaseUrl}/${pageId}/posts`,
                    {
                        access_token: pageToken,
                        fields,
                        ...queryParams,
                        since: queryParams.since ? Math.floor(queryParams.since.getTime() / 1000) : undefined,
                        until: queryParams.until ? Math.floor(queryParams.until.getTime() / 1000) : undefined
                    },
                    maxResults
                );
            }

            // Limit results if maxResults specified
            if (maxResults && allPosts.length > maxResults) {
                allPosts = allPosts.slice(0, maxResults);
            }

            LogStatus(`Retrieved ${allPosts.length} posts from Facebook page`);

            // Normalize posts to common format
            const normalizedPosts = allPosts.map(post => this.normalizePost(post));

            // Calculate summary statistics
            const summary = {
                totalPosts: normalizedPosts.length,
                dateRange: {
                    earliest: normalizedPosts.length > 0 
                        ? normalizedPosts[normalizedPosts.length - 1].publishedAt 
                        : null,
                    latest: normalizedPosts.length > 0 
                        ? normalizedPosts[0].publishedAt 
                        : null
                },
                postTypes: this.categorizePostTypes(allPosts),
                totalEngagements: normalizedPosts.reduce((sum, post) => 
                    sum + (post.analytics?.engagements || 0), 0
                ),
                totalImpressions: normalizedPosts.reduce((sum, post) => 
                    sum + (post.analytics?.impressions || 0), 0
                )
            };

            // Update output parameters
            const outputParams = [...Params];
            // TODO: Set output parameters based on result
            
            return {
                Success: true,
                Message: `Successfully retrieved ${normalizedPosts.length} posts`,
                ResultCode: 'SUCCESS',
                Params: outputParams
            };

        } catch (error) {
            LogError(`Failed to get Facebook page posts: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
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
     * Get post fields without insights (for faster queries or when insights not available)
     */
    private getPostFieldsWithoutInsights(): string {
        return 'id,message,created_time,updated_time,from,story,permalink_url,attachments,shares,reactions.summary(true),comments.summary(true)';
    }

    /**
     * Categorize posts by type based on attachments
     */
    private categorizePostTypes(posts: any[]): Record<string, number> {
        const types: Record<string, number> = {
            status: 0,
            photo: 0,
            video: 0,
            link: 0,
            event: 0,
            offer: 0,
            album: 0
        };

        for (const post of posts) {
            if (post.attachments?.data?.[0]?.type) {
                const type = post.attachments.data[0].type.toLowerCase();
                if (type in types) {
                    types[type]++;
                } else {
                    types.status++;
                }
            } else {
                types.status++;
            }
        }

        return types;
    }


}