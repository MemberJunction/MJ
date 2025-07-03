import { RegisterClass } from '@memberjunction/global';
import { BaseSocialMediaAction, MediaFile, SocialPost, SearchParams } from '../../base/base-social.action';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { ActionParam } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';

/**
 * Base class for all HootSuite actions.
 * Handles HootSuite-specific authentication, API interactions, and rate limiting.
 */
@RegisterClass(BaseAction, 'HootSuiteBaseAction')
export abstract class HootSuiteBaseAction extends BaseSocialMediaAction {
    protected get platformName(): string {
        return 'HootSuite';
    }

    protected get apiBaseUrl(): string {
        return 'https://platform.hootsuite.com/v1';
    }

    /**
     * Axios instance for making HTTP requests
     */
    private _axiosInstance: AxiosInstance | null = null;

    /**
     * Get or create axios instance with interceptors
     */
    protected get axiosInstance(): AxiosInstance {
        if (!this._axiosInstance) {
            this._axiosInstance = axios.create({
                baseURL: this.apiBaseUrl,
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            // Add request interceptor for auth
            this._axiosInstance.interceptors.request.use(
                (config) => {
                    const token = this.getAccessToken();
                    if (token) {
                        config.headers.Authorization = `Bearer ${token}`;
                    }
                    return config;
                },
                (error) => Promise.reject(error)
            );

            // Add response interceptor for rate limit handling
            this._axiosInstance.interceptors.response.use(
                (response) => {
                    // Log rate limit info
                    const rateLimitInfo = this.parseRateLimitHeaders(response.headers);
                    if (rateLimitInfo) {
                        LogStatus(`HootSuite Rate Limit - Remaining: ${rateLimitInfo.remaining}/${rateLimitInfo.limit}, Reset: ${rateLimitInfo.reset}`);
                    }
                    return response;
                },
                async (error: AxiosError) => {
                    if (error.response?.status === 429) {
                        // Rate limit exceeded
                        const retryAfter = error.response.headers['retry-after'];
                        const waitTime = retryAfter ? parseInt(retryAfter) : 60;
                        await this.handleRateLimit(waitTime);
                        
                        // Retry the request
                        return this._axiosInstance!.request(error.config!);
                    }
                    return Promise.reject(error);
                }
            );
        }
        return this._axiosInstance;
    }

    /**
     * Refresh the access token using the refresh token
     */
    protected async refreshAccessToken(): Promise<void> {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            throw new Error('No refresh token available for HootSuite');
        }

        try {
            const response = await axios.post('https://platform.hootsuite.com/oauth2/token', {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: this.getCustomAttribute(2), // Client ID stored in CustomAttribute2
                client_secret: this.getCustomAttribute(3) // Client Secret stored in CustomAttribute3
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;

            // Update stored tokens
            await this.updateStoredTokens(
                access_token,
                newRefreshToken || refreshToken,
                expires_in
            );

            LogStatus('HootSuite access token refreshed successfully');
        } catch (error) {
            LogError(`Failed to refresh HootSuite access token: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Upload media to HootSuite
     */
    protected async uploadSingleMedia(file: MediaFile): Promise<string> {
        try {
            // First, request an upload URL
            const uploadRequest = await this.axiosInstance.post('/media', {
                mimeType: file.mimeType,
                sizeBytes: file.size
            });

            const { uploadUrl, mediaId } = uploadRequest.data;

            // Upload the file to the provided URL
            const fileData = typeof file.data === 'string' 
                ? Buffer.from(file.data, 'base64') 
                : file.data;

            await axios.put(uploadUrl, fileData, {
                headers: {
                    'Content-Type': file.mimeType,
                    'Content-Length': file.size.toString()
                }
            });

            // Wait for processing
            await this.waitForMediaProcessing(mediaId);

            return mediaId;
        } catch (error) {
            LogError(`Failed to upload media to HootSuite: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Wait for media to finish processing
     */
    private async waitForMediaProcessing(mediaId: string, maxAttempts: number = 30): Promise<void> {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await this.axiosInstance.get(`/media/${mediaId}`);
                const { state } = response.data;

                if (state === 'READY') {
                    return;
                } else if (state === 'FAILED') {
                    throw new Error('Media processing failed');
                }

                // Wait 2 seconds before next check
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                if (i === maxAttempts - 1) {
                    throw new Error(`Media processing timeout for ${mediaId}`);
                }
            }
        }
    }

    /**
     * Get social profiles for the authenticated user
     */
    protected async getSocialProfiles(): Promise<HootSuiteProfile[]> {
        try {
            const response = await this.axiosInstance.get('/socialProfiles');
            return response.data.data || [];
        } catch (error) {
            LogError(`Failed to get social profiles: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Make a paginated request to HootSuite API
     */
    protected async makePaginatedRequest<T>(
        endpoint: string,
        params: Record<string, any> = {}
    ): Promise<T[]> {
        const results: T[] = [];
        let cursor: string | null = null;
        const limit = params.limit || 50;

        do {
            const queryParams: any = { ...params, limit };
            if (cursor) {
                queryParams.cursor = cursor;
            }

            const response = await this.axiosInstance.get(endpoint, { params: queryParams });
            const data = response.data;

            if (data.data && Array.isArray(data.data)) {
                results.push(...data.data);
            }

            cursor = data.cursor || null;

            // Check if we've reached the desired number of results
            if (params.maxResults && results.length >= params.maxResults) {
                return results.slice(0, params.maxResults);
            }

        } while (cursor);

        return results;
    }

    /**
     * Format date for HootSuite API (ISO 8601)
     */
    protected formatHootSuiteDate(date: Date | string): string {
        if (typeof date === 'string') {
            date = new Date(date);
        }
        return date.toISOString();
    }

    /**
     * Parse HootSuite date string
     */
    protected parseHootSuiteDate(dateString: string): Date {
        return new Date(dateString);
    }

    /**
     * Convert HootSuite post to common format
     */
    protected normalizePost(hootsuitePost: HootSuitePost): SocialPost {
        return {
            id: hootsuitePost.id,
            platform: 'HootSuite',
            profileId: hootsuitePost.socialProfileIds.join(','), // Multiple profiles possible
            content: hootsuitePost.text,
            mediaUrls: hootsuitePost.mediaIds || [],
            publishedAt: this.parseHootSuiteDate(hootsuitePost.createdTime),
            scheduledFor: hootsuitePost.scheduledTime ? this.parseHootSuiteDate(hootsuitePost.scheduledTime) : undefined,
            platformSpecificData: {
                state: hootsuitePost.state,
                tags: hootsuitePost.tags,
                location: hootsuitePost.location,
                socialProfileIds: hootsuitePost.socialProfileIds
            }
        };
    }

    /**
     * Search for posts - implemented in search action
     */
    protected async searchPosts(params: SearchParams): Promise<SocialPost[]> {
        // This is implemented in the search-posts.action.ts
        throw new Error('Search posts is implemented in HootSuiteSearchPostsAction');
    }

    /**
     * Handle HootSuite-specific errors
     */
    protected handleHootSuiteError(error: AxiosError): never {
        if (error.response) {
            const { status, data } = error.response;
            const errorData = data as any;

            switch (status) {
                case 400:
                    throw new Error(`Bad Request: ${errorData.message || 'Invalid request parameters'}`);
                case 401:
                    throw new Error('Unauthorized: Invalid or expired access token');
                case 403:
                    throw new Error('Forbidden: Insufficient permissions');
                case 404:
                    throw new Error('Not Found: Resource does not exist');
                case 429:
                    throw new Error('Rate Limit Exceeded: Too many requests');
                case 500:
                    throw new Error('Internal Server Error: HootSuite service error');
                default:
                    throw new Error(`HootSuite API Error (${status}): ${errorData.message || 'Unknown error'}`);
            }
        } else if (error.request) {
            throw new Error('Network Error: No response from HootSuite');
        } else {
            throw new Error(`Request Error: ${error.message}`);
        }
    }
}

/**
 * HootSuite-specific interfaces
 */
export interface HootSuiteProfile {
    id: string;
    socialNetworkId: string;
    socialNetworkUserId: string;
    avatarUrl: string;
    displayName: string;
    type: string;
    ownerId: string;
}

export interface HootSuitePost {
    id: string;
    socialProfileIds: string[];
    text: string;
    scheduledTime?: string;
    createdTime: string;
    state: 'SCHEDULED' | 'PUBLISHED' | 'FAILED' | 'DRAFT';
    mediaIds?: string[];
    tags?: string[];
    location?: {
        latitude: number;
        longitude: number;
    };
}

export interface HootSuiteAnalytics {
    postId: string;
    metrics: {
        likes: number;
        comments: number;
        shares: number;
        clicks: number;
        impressions: number;
        engagements: number;
        reach: number;
    };
    period: {
        start: string;
        end: string;
    };
}