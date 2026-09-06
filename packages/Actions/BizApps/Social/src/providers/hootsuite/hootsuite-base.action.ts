import { RegisterClass } from '@memberjunction/global';
import { BaseSocialMediaAction, MediaFile, SocialPost, SearchParams } from '../../base/base-social.action';
import { HttpClient, HttpError, HttpPost, HttpPut } from '@memberjunction/network-utils';
import { ActionParam } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

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
     * HTTP client for making requests
     */
    private _httpClient: HttpClient | null = null;

    /**
     * Get or create the HTTP client. `OnRequest` / `OnResponse` / `OnRetry` replace what were
     * axios-era interceptors: bearer-token injection, rate-limit logging, and 429 back-off + retry.
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
                        return { ...config, Headers: { ...config.Headers, Authorization: `Bearer ${token}` } };
                    }
                    return config;
                },
                OnResponse: (response) => {
                    // Log rate limit info
                    const rateLimitInfo = this.parseRateLimitHeaders(response.Headers);
                    if (rateLimitInfo) {
                        LogStatus(`HootSuite Rate Limit - Remaining: ${rateLimitInfo.remaining}/${rateLimitInfo.limit}, Reset: ${rateLimitInfo.reset}`);
                    }
                },
                OnRetry: async (error) => {
                    if (error.Status === 429) {
                        // Rate limit exceeded
                        const retryAfter = error.Headers['retry-after'];
                        const waitTime = retryAfter ? parseInt(retryAfter) : 60;
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
     * Refresh the access token using the refresh token
     */
    protected async refreshAccessToken(): Promise<void> {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            throw new Error('No refresh token available for HootSuite');
        }

        try {
            const response = await HttpPost<HootSuiteTokenResponse>('https://platform.hootsuite.com/oauth2/token', {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: this.getCustomAttribute(2), // Client ID stored in CustomAttribute2
                client_secret: this.getCustomAttribute(3) // Client Secret stored in CustomAttribute3
            }, {
                Headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const { access_token, refresh_token: newRefreshToken, expires_in } = response.Data;

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
            const uploadRequest = await this.httpClient.Post<HootSuiteMediaUpload>('/media', {
                mimeType: file.mimeType,
                sizeBytes: file.size
            });

            const { uploadUrl, mediaId } = uploadRequest.Data;

            // Upload the file to the provided URL
            const fileData = typeof file.data === 'string' 
                ? Buffer.from(file.data, 'base64') 
                : file.data;

            await HttpPut(uploadUrl, fileData, {
                Headers: {
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
                const response = await this.httpClient.Get<HootSuiteMediaStatus>(`/media/${mediaId}`);
                const { state } = response.Data;

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
            const response = await this.httpClient.Get<HootSuiteResponse<HootSuiteProfile[]>>('/socialProfiles');
            return response.Data.data || [];
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

            const response = await this.httpClient.Get<HootSuiteResponse<T[]>>(endpoint, { Query: queryParams });
            const data = response.Data;

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
    protected handleHootSuiteError(error: HttpError): never {
        if (error.Status) {
            const status = error.Status;
            const data = error.Data;
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
        } else if (error.IsTimeout) {
            throw new Error('Network Error: No response from HootSuite');
        } else {
            throw new Error(`Request Error: ${error.message}`);
        }
    }
}

/**
 * HootSuite-specific interfaces
 */
/**
 * HootSuite's REST envelope: the payload sits under `data`, with cursor paging under `cursor`.
 */
export interface HootSuiteResponse<T> {
    data: T;
    /** Opaque continuation token for the next page, absent on the last page. */
    cursor?: string;
    errors?: Array<{ code?: string; message?: string }>;
}

/** Response from the OAuth2 token endpoint. */
export interface HootSuiteTokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
}

/** Response from `POST /media`, which returns a pre-signed URL to PUT the bytes to. */
export interface HootSuiteMediaUpload {
    uploadUrl: string;
    mediaId: string;
    uploadUrlDurationSeconds?: number;
}

/** Response from `GET /media/{id}` while an upload is being processed. */
export interface HootSuiteMediaStatus {
    id?: string;
    state: 'READY' | 'PROCESSING' | 'FAILED';
    downloadUrl?: string;
}

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