import { RegisterClass } from '@memberjunction/global';
import { BaseSocialMediaAction, MediaFile, SocialPost, SearchParams, SocialAnalytics } from '../../base/base-social.action';
import { HttpClient, HttpError, HttpGet, HttpPost, IsHttpError } from '@memberjunction/network-utils';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

/**
 * The Graph API's standard collection envelope: a `data` array plus cursor-based `paging`.
 * Nearly every list endpoint (`/me/accounts`, `/{page}/posts`, `/{post}/comments`) returns this.
 */
export interface FacebookPagedResponse<T> {
    data: T[];
    paging?: {
        next?: string;
        previous?: string;
        cursors?: { before?: string; after?: string };
    };
}

/**
 * The `/{post-id}?fields=reactions.summary(true),comments.summary(true),shares` shape used to
 * read a post's engagement counters in one call.
 */
export interface FacebookPostEngagement {
    reactions?: { summary?: { total_count?: number } };
    likes?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
    shares?: { count?: number };
}

/** Response from a Graph API write that returns only the new object's id. */
export interface FacebookIdResponse {
    id: string;
    post_id?: string;
}

/** Response from the `oauth/access_token` token-exchange endpoint. */
export interface FacebookTokenResponse {
    access_token: string;
    token_type?: string;
    expires_in?: number;
}

/** The Facebook Graph API error envelope this class inspects for rate-limit signals. */
interface FacebookErrorPayload {
    error?: {
        code?: number;
        error_subcode?: number;
        message?: string;
        type?: string;
    };
}

/**
 * Base class for all Facebook actions.
 * Handles Facebook-specific authentication, API interactions, and rate limiting.
 * Uses Facebook Graph API v18.0 with OAuth 2.0.
 */
@RegisterClass(BaseAction, 'FacebookBaseAction')
export abstract class FacebookBaseAction extends BaseSocialMediaAction {
    /**
     * Internal method that must be implemented by derived action classes
     */
    protected abstract InternalRunAction(params: RunActionParams): Promise<ActionResultSimple>;
    protected get platformName(): string {
        return 'Facebook';
    }

    protected get apiBaseUrl(): string {
        return 'https://graph.facebook.com/v18.0';
    }

    /**
     * API version for cleaner URL building
     */
    protected get apiVersion(): string {
        return 'v18.0';
    }

    /**
     * HTTP client for making requests
     */
    private _httpClient: HttpClient | null = null;

    /**
     * Get or create the HTTP client. `OnRequest` / `OnResponse` / `OnRetry` replace what were
     * axios-era interceptors: token injection, rate-limit logging, and 429 back-off + retry.
     */
    protected get httpClient(): HttpClient {
        if (!this._httpClient) {
            this._httpClient = new HttpClient({
                BaseURL: this.apiBaseUrl,
                Timeout: 30000,
                Headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                OnRequest: (config) => {
                    const token = this.getAccessToken();
                    if (token) {
                        // Facebook uses access_token as query parameter
                        return {
                            ...config,
                            Query: {
                                ...config.Query,
                                access_token: token
                            }
                        };
                    }
                    return config;
                },
                OnResponse: (response) => {
                    // Log rate limit info if available
                    const rateLimitInfo = this.parseRateLimitHeaders(response.Headers);
                    if (rateLimitInfo) {
                        LogStatus(`Facebook Rate Limit - Remaining: ${rateLimitInfo.remaining}/${rateLimitInfo.limit}`);
                    }
                },
                OnRetry: async (error) => {
                    if (error.Status === 429 || this.isFacebookRateLimitError(error)) {
                        // Rate limit exceeded - Facebook returns various codes
                        const waitTime = this.extractRateLimitWaitTime(error) || 60;
                        await this.handleRateLimit(waitTime);
                        return true;
                    }
                    return false;
                }
            });
        }
        return this._httpClient;
    }

    /**
     * Check if error is a Facebook rate limit error
     */
    private isFacebookRateLimitError(error: HttpError): boolean {
        const errorData = error.Data as FacebookErrorPayload | undefined;
        const errorCode = errorData?.error?.code;
        const errorSubcode = errorData?.error?.error_subcode;
        
        // Facebook rate limit error codes
        return errorCode === 4 || // Application request limit reached
               errorCode === 17 || // User request limit reached
               errorCode === 32 || // Page request limit reached
               errorCode === 613 || // Calls to stream have exceeded the rate limit
               errorSubcode === 2446079; // Reduce the amount of data you're asking for
    }

    /**
     * Extract wait time from Facebook rate limit error
     */
    private extractRateLimitWaitTime(error: HttpError): number | null {
        const errorData = error.Data as FacebookErrorPayload | undefined;
        const headers = error.Headers;
        
        // Check headers first
        if (headers?.['x-app-usage'] || headers?.['x-page-usage'] || headers?.['x-ad-account-usage']) {
            // Parse usage headers to determine wait time
            const usage = JSON.parse(headers['x-app-usage'] || headers['x-page-usage'] || headers['x-ad-account-usage']);
            if (usage.call_count > 90) {
                return 300; // Wait 5 minutes if over 90% usage
            }
        }
        
        // Check error message for wait time
        const message = errorData?.error?.message;
        if (message && message.includes('Please retry your request later')) {
            return 300; // Default to 5 minutes
        }
        
        return null;
    }

    /**
     * Refresh the access token using the refresh token
     * Note: Facebook uses long-lived tokens that last 60 days
     */
    protected async refreshAccessToken(): Promise<void> {
        try {
            const currentToken = this.getAccessToken();
            if (!currentToken) {
                throw new Error('No access token available for Facebook');
            }

            const clientId = this.getCustomAttribute(2) || ''; // App ID stored in CustomAttribute2
            const clientSecret = this.getCustomAttribute(3) || ''; // App Secret stored in CustomAttribute3

            // Exchange short-lived token for long-lived token
            const response = await HttpGet<FacebookTokenResponse>(`${this.apiBaseUrl}/oauth/access_token`, {
                Query: {
                    grant_type: 'fb_exchange_token',
                    client_id: clientId,
                    client_secret: clientSecret,
                    fb_exchange_token: currentToken
                }
            });

            const { access_token, expires_in } = response.Data;

            // Update stored tokens
            await this.updateStoredTokens(
                access_token,
                undefined, // Facebook doesn't use refresh tokens
                expires_in || 5184000 // Default to 60 days if not specified
            );

            LogStatus('Facebook access token refreshed successfully');
        } catch (error) {
            LogError(`Failed to refresh Facebook access token: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Get the authenticated user's pages
     */
    protected async getUserPages(): Promise<FacebookPage[]> {
        try {
            const response = await this.httpClient.Get<FacebookPagedResponse<FacebookPage>>('/me/accounts', {
                Query: {
                    fields: 'id,name,access_token,category,picture'
                }
            });
            return response.Data.data || [];
        } catch (error) {
            LogError(`Failed to get user pages: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Get page access token for a specific page
     */
    protected async getPageAccessToken(pageId: string): Promise<string> {
        const pages = await this.getUserPages();
        const page = pages.find(p => p.id === pageId);
        
        if (!page) {
            throw new Error(`Page ${pageId} not found or user doesn't have access`);
        }
        
        return page.access_token;
    }

    /**
     * Upload media to Facebook
     */
    protected async uploadSingleMedia(file: MediaFile): Promise<string> {
        try {
            const fileData = typeof file.data === 'string' 
                ? Buffer.from(file.data, 'base64') 
                : file.data;

            const formData = new FormData();
            formData.append('source', new Blob([new Uint8Array(fileData)], { type: file.mimeType }), file.filename);

            const isVideo = file.mimeType.startsWith('video/');
            const endpoint = isVideo ? '/me/videos' : '/me/photos';

            const response = await this.httpClient.Post<FacebookIdResponse>(endpoint, formData, {
                                Query: {
                    published: 'false' // Upload as unpublished for later use
                }
            });

            return response.Data.id;
        } catch (error) {
            LogError(`Failed to upload media to Facebook: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Upload media to a specific page
     */
    protected async uploadMediaToPage(pageId: string, file: MediaFile): Promise<string> {
        try {
            const fileData = typeof file.data === 'string' 
                ? Buffer.from(file.data, 'base64') 
                : file.data;

            const pageToken = await this.getPageAccessToken(pageId);
            const formData = new FormData();
            formData.append('source', new Blob([new Uint8Array(fileData)], { type: file.mimeType }), file.filename);

            const isVideo = file.mimeType.startsWith('video/');
            const endpoint = `/${pageId}/${isVideo ? 'videos' : 'photos'}`;

            const response = await HttpPost<FacebookIdResponse>(`${this.apiBaseUrl}${endpoint}`, formData, {
                                Query: {
                    access_token: pageToken,
                    published: 'false' // Upload as unpublished for later use
                }
            });

            return response.Data.id;
        } catch (error) {
            LogError(`Failed to upload media to Facebook page: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Validate media file meets Facebook requirements
     */
    protected validateMediaFile(file: MediaFile): void {
        const supportedImageTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/bmp',
            'image/tiff'
        ];

        const supportedVideoTypes = [
            'video/mp4',
            'video/quicktime',
            'video/x-matroska',
            'video/webm'
        ];

        const supportedTypes = [...supportedImageTypes, ...supportedVideoTypes];

        if (!supportedTypes.includes(file.mimeType)) {
            throw new Error(`Unsupported media type: ${file.mimeType}. Supported types: ${supportedTypes.join(', ')}`);
        }

        // Facebook media size limits
        let maxSize: number;
        if (supportedImageTypes.includes(file.mimeType)) {
            maxSize = 4 * 1024 * 1024; // 4MB for images
        } else if (supportedVideoTypes.includes(file.mimeType)) {
            maxSize = 10 * 1024 * 1024 * 1024; // 10GB for videos
        } else {
            maxSize = 4 * 1024 * 1024; // Default 4MB
        }

        if (file.size > maxSize) {
            throw new Error(`File size exceeds limit. Max: ${maxSize / 1024 / 1024}MB, Got: ${file.size / 1024 / 1024}MB`);
        }
    }

    /**
     * Create a post on Facebook
     */
    protected async createPost(pageId: string, postData: CreatePostData): Promise<FacebookPost> {
        try {
            const pageToken = await this.getPageAccessToken(pageId);
            
            const response = await HttpPost<FacebookIdResponse>(
                `${this.apiBaseUrl}/${pageId}/feed`,
                postData,
                {
                    Query: {
                        access_token: pageToken
                    }
                }
            );
            
            // Get the full post data
            return await this.getPost(response.Data.id);
        } catch (error) {
            this.handleFacebookError(error as HttpError);
        }
    }

    /**
     * Get a specific post
     */
    protected async getPost(postId: string): Promise<FacebookPost> {
        try {
            const response = await this.httpClient.Get<FacebookPost>(`/${postId}`, {
                Query: {
                    fields: this.getPostFields()
                }
            });
            return response.Data;
        } catch (error) {
            LogError(`Failed to get post: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Get posts from a page
     */
    protected async getPagePosts(pageId: string, params: GetPagePostsParams = {}): Promise<FacebookPost[]> {
        try {
            const pageToken = await this.getPageAccessToken(pageId);
            
            const response = await HttpGet<FacebookPagedResponse<FacebookPost>>(`${this.apiBaseUrl}/${pageId}/posts`, {
                Query: {
                    access_token: pageToken,
                    fields: this.getPostFields(),
                    limit: params.limit || 100,
                    since: params.since ? Math.floor(params.since.getTime() / 1000) : undefined,
                    until: params.until ? Math.floor(params.until.getTime() / 1000) : undefined,
                    ...params
                }
            });

            return response.Data.data || [];
        } catch (error) {
            LogError(`Failed to get page posts: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Get paginated results from Facebook
     */
    protected async getPaginatedResults<T>(url: string, params: Record<string, any> = {}, maxResults?: number): Promise<T[]> {
        const results: T[] = [];
        let nextUrl: string | null = url;
        const limit = params.limit || 100;

        while (nextUrl) {
            const response = await HttpGet<FacebookPagedResponse<T>>(nextUrl, {
                Query: nextUrl === url ? { ...params, limit } : {}
            });

            if (response.Data.data && Array.isArray(response.Data.data)) {
                results.push(...response.Data.data);
            }

            // Check if we've reached max results
            if (maxResults && results.length >= maxResults) {
                return results.slice(0, maxResults);
            }

            // Get next page URL
            nextUrl = response.Data.paging?.next || null;
        }

        return results;
    }

    /**
     * Get default fields for post queries
     */
    protected getPostFields(): string {
        return 'id,message,created_time,updated_time,from,story,permalink_url,attachments,shares,reactions.summary(true),comments.summary(true),insights.metric(post_impressions,post_impressions_unique,post_engaged_users,post_clicks,post_reactions_by_type_total)';
    }

    /**
     * Convert Facebook post to common format
     */
    protected normalizePost(fbPost: FacebookPost): SocialPost {
        const mediaUrls: string[] = [];
        
        // Extract media URLs from attachments
        if (fbPost.attachments?.data) {
            for (const attachment of fbPost.attachments.data) {
                if (attachment.media?.image?.src) {
                    mediaUrls.push(attachment.media.image.src);
                } else if (attachment.media?.source) {
                    mediaUrls.push(attachment.media.source);
                }
            }
        }

        return {
            id: fbPost.id,
            platform: 'Facebook',
            profileId: fbPost.from?.id || '',
            content: fbPost.message || fbPost.story || '',
            mediaUrls,
            publishedAt: new Date(fbPost.created_time),
            analytics: this.extractPostAnalytics(fbPost),
            platformSpecificData: {
                permalinkUrl: fbPost.permalink_url,
                story: fbPost.story,
                attachments: fbPost.attachments,
                postType: fbPost.attachments?.data?.[0]?.type || 'status'
            }
        };
    }

    /**
     * Extract analytics from Facebook post
     */
    private extractPostAnalytics(fbPost: FacebookPost): SocialAnalytics | undefined {
        const insights = fbPost.insights?.data;
        const reactions = fbPost.reactions?.summary?.total_count || 0;
        const comments = fbPost.comments?.summary?.total_count || 0;
        const shares = fbPost.shares?.count || 0;

        // Extract metrics from insights
        let impressions = 0;
        let reach = 0;
        let engagements = 0;
        let clicks = 0;

        if (insights) {
            for (const insight of insights) {
                switch (insight.name) {
                    case 'post_impressions':
                        impressions = insight.values?.[0]?.value || 0;
                        break;
                    case 'post_impressions_unique':
                        reach = insight.values?.[0]?.value || 0;
                        break;
                    case 'post_engaged_users':
                        engagements = insight.values?.[0]?.value || 0;
                        break;
                    case 'post_clicks':
                        clicks = insight.values?.[0]?.value || 0;
                        break;
                }
            }
        }

        return {
            impressions,
            reach,
            engagements: engagements || (reactions + comments + shares),
            clicks,
            shares,
            comments,
            likes: reactions,
            platformMetrics: {
                reactions,
                comments,
                shares,
                insights
            }
        };
    }

    /**
     * Normalize Facebook analytics to common format
     */
    protected normalizeAnalytics(fbMetrics: any): SocialAnalytics {
        return {
            impressions: fbMetrics.impressions || 0,
            engagements: fbMetrics.engaged_users || 0,
            clicks: fbMetrics.clicks || 0,
            shares: fbMetrics.shares || 0,
            comments: fbMetrics.comments || 0,
            likes: fbMetrics.reactions || fbMetrics.likes || 0,
            reach: fbMetrics.reach || 0,
            saves: fbMetrics.saves,
            videoViews: fbMetrics.video_views,
            platformMetrics: fbMetrics
        };
    }

    /**
     * Search for posts - implemented in search action
     */
    protected async searchPosts(params: SearchParams): Promise<SocialPost[]> {
        // This is implemented in the search-posts.action.ts
        throw new Error('Search posts is implemented in FacebookSearchPostsAction');
    }

    /**
     * Handle Facebook-specific errors
     */
    protected handleFacebookError(error: HttpError): never {
        if (error.Status) {
            const status = error.Status;
            const errorData = error.Data as { error?: Record<string, unknown>; message?: string } | undefined;
            const fbError = errorData?.error;

            if (fbError) {
                const code = fbError.code;
                const message = fbError.message;
                const type = fbError.type;
                const subcode = fbError.error_subcode;

                // Map Facebook error codes to user-friendly messages
                switch (code) {
                    case 1:
                        throw new Error(`API Unknown Error: ${message}`);
                    case 2:
                        throw new Error(`API Service Error: ${message}`);
                    case 4:
                        throw new Error('Application request limit reached. Please try again later.');
                    case 10:
                        throw new Error('Permission denied. Ensure the app has required Facebook permissions.');
                    case 17:
                        throw new Error('User request limit reached. Please try again later.');
                    case 32:
                        throw new Error('Page request limit reached. Please try again later.');
                    case 100:
                        throw new Error(`Invalid Parameter: ${message}`);
                    case 190:
                        throw new Error('Access token has expired. Please re-authenticate.');
                    case 200:
                    case 210:
                    case 220:
                        throw new Error(`Permission Error: ${message}`);
                    case 368:
                        throw new Error('Temporarily blocked from posting. Please try again later.');
                    case 506:
                        throw new Error('Duplicate post. This content has already been posted.');
                    default:
                        throw new Error(`Facebook API Error (${code}): ${message}`);
                }
            }

            // Generic HTTP errors
            switch (status) {
                case 400:
                    throw new Error(`Bad Request: ${errorData.message || 'Invalid request parameters'}`);
                case 401:
                    throw new Error('Unauthorized: Invalid or expired access token');
                case 403:
                    throw new Error('Forbidden: Insufficient permissions');
                case 404:
                    throw new Error('Not Found: Resource does not exist');
                case 500:
                    throw new Error('Internal Server Error: Facebook service error');
                case 503:
                    throw new Error('Service Unavailable: Facebook service temporarily unavailable');
                default:
                    throw new Error(`Facebook API Error (${status}): ${errorData.message || 'Unknown error'}`);
            }
        } else if (error.IsTimeout) {
            throw new Error('Network Error: No response from Facebook');
        } else {
            throw new Error(`Request Error: ${error.message}`);
        }
    }

    /**
     * Parse Facebook-specific rate limit headers
     */
    protected parseRateLimitHeaders(headers: any): { remaining: number; reset: Date; limit: number; } | null {
        // Facebook uses different headers for rate limiting
        const appUsage = headers['x-app-usage'];
        const pageUsage = headers['x-page-usage'];
        const adAccountUsage = headers['x-ad-account-usage'];

        if (appUsage || pageUsage || adAccountUsage) {
            try {
                const usage = JSON.parse(appUsage || pageUsage || adAccountUsage);
                const callCount = usage.call_count || 0;
                const totalTime = usage.total_time || 0;
                const totalCPUTime = usage.total_cputime || 0;

                // Facebook rate limits are percentage-based
                return {
                    remaining: Math.max(0, 100 - callCount),
                    reset: new Date(Date.now() + 3600000), // Reset in 1 hour
                    limit: 100
                };
            } catch (error) {
                LogError(`Failed to parse Facebook rate limit headers: ${error}`);
            }
        }

        return null;
    }
}

/**
 * Facebook-specific interfaces
 */
export interface FacebookPage {
    id: string;
    name: string;
    access_token: string;
    category: string;
    picture?: {
        data: {
            url: string;
        };
    };
}

export interface CreatePostData {
    message?: string;
    link?: string;
    place?: string;
    tags?: string[];
    privacy?: {
        value: 'EVERYONE' | 'ALL_FRIENDS' | 'FRIENDS_OF_FRIENDS' | 'SELF';
    };
    attached_media?: Array<{ media_fbid: string }>;
    scheduled_publish_time?: number; // Unix timestamp
    published?: boolean;
    backdated_time?: number;
    backdated_time_granularity?: 'year' | 'month' | 'day' | 'hour' | 'minute';
}

export interface FacebookPost {
    id: string;
    message?: string;
    story?: string;
    created_time: string;
    updated_time: string;
    from?: {
        id: string;
        name: string;
    };
    permalink_url?: string;
    attachments?: {
        data: Array<{
            type: string;
            title?: string;
            description?: string;
            url?: string;
            media?: {
                image?: {
                    src: string;
                    width: number;
                    height: number;
                };
                source?: string;
            };
        }>;
    };
    shares?: {
        count: number;
    };
    reactions?: {
        summary: {
            total_count: number;
        };
    };
    comments?: {
        summary: {
            total_count: number;
        };
    };
    insights?: {
        data: Array<{
            name: string;
            values: Array<{
                value: number;
            }>;
        }>;
    };
}

export interface GetPagePostsParams {
    since?: Date;
    until?: Date;
    limit?: number;
    published?: boolean;
}

export interface FacebookInsight {
    name: string;
    period: string;
    values: Array<{
        value: number | Record<string, number>;
        end_time?: string;
    }>;
    title?: string;
    description?: string;
}

export interface FacebookComment {
    id: string;
    message: string;
    created_time: string;
    from: {
        id: string;
        name: string;
    };
    like_count: number;
    comment_count?: number;
    parent?: {
        id: string;
    };
}

export interface FacebookAlbum {
    id: string;
    name: string;
    description?: string;
    link: string;
    cover_photo?: {
        id: string;
    };
    count: number;
    created_time: string;
}