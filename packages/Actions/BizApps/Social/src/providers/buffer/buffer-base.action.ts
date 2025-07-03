import { RegisterClass } from '@memberjunction/global';
import { BaseSocialMediaAction, SocialPost, SocialAnalytics, MediaFile } from '../../base/base-social.action';
import { UserInfo, LogError, LogStatus } from '@memberjunction/core';
import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';

/**
 * Base class for all Buffer social media actions.
 * Handles Buffer-specific authentication and API interaction patterns.
 */
@RegisterClass(BaseAction, 'BufferBaseAction')
export abstract class BufferBaseAction extends BaseSocialMediaAction {
    protected get platformName(): string {
        return 'Buffer';
    }

    protected get apiBaseUrl(): string {
        return 'https://api.bufferapp.com/1';
    }

    private axiosInstance: AxiosInstance | null = null;

    /**
     * Get axios instance with authentication
     */
    protected getAxiosInstance(): AxiosInstance {
        if (!this.axiosInstance) {
            this.axiosInstance = axios.create({
                baseURL: this.apiBaseUrl,
                timeout: 30000,
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            // Add request interceptor for auth
            this.axiosInstance.interceptors.request.use(
                (config) => {
                    const token = this.getAccessToken();
                    if (token) {
                        config.headers.Authorization = `Bearer ${token}`;
                    }
                    return config;
                },
                (error) => {
                    return Promise.reject(error);
                }
            );

            // Add response interceptor for rate limiting
            this.axiosInstance.interceptors.response.use(
                (response) => {
                    // Log rate limit headers if present
                    const headers = response.headers;
                    const rateLimitInfo = this.parseRateLimitHeaders(headers);
                    if (rateLimitInfo) {
                        LogStatus(`Buffer API - Remaining requests: ${rateLimitInfo.remaining}/${rateLimitInfo.limit}, Reset: ${rateLimitInfo.reset}`);
                    }
                    return response;
                },
                async (error: AxiosError) => {
                    if (error.response?.status === 429) {
                        // Rate limit hit
                        const retryAfter = error.response.headers['retry-after'];
                        await this.handleRateLimit(retryAfter ? parseInt(retryAfter) : 60);
                        // Retry the request
                        return this.axiosInstance!.request(error.config!);
                    }
                    return Promise.reject(error);
                }
            );
        }
        return this.axiosInstance;
    }

    /**
     * Refresh access token using refresh token
     */
    protected async refreshAccessToken(): Promise<void> {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            throw new Error('No refresh token available for Buffer');
        }

        try {
            const response = await axios.post(`${this.apiBaseUrl}/oauth2/token`, {
                client_id: this.getCustomAttribute(1), // Store Buffer client ID in CustomAttribute1
                client_secret: this.getCustomAttribute(2), // Store Buffer client secret in CustomAttribute2
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            });

            const { access_token, expires_in } = response.data;
            
            await this.updateStoredTokens(
                access_token,
                refreshToken, // Buffer doesn't rotate refresh tokens
                expires_in
            );

            LogStatus('Buffer access token refreshed successfully');
        } catch (error) {
            LogError('Failed to refresh Buffer access token:', error);
            throw new Error('Failed to refresh Buffer access token');
        }
    }

    /**
     * Get Buffer profiles for the authenticated user
     */
    protected async getProfiles(): Promise<any[]> {
        try {
            const response = await this.getAxiosInstance().get('/profiles.json');
            return response.data || [];
        } catch (error) {
            LogError('Failed to get Buffer profiles:', error);
            throw error;
        }
    }

    /**
     * Upload media to Buffer
     */
    protected async uploadSingleMedia(file: MediaFile): Promise<string> {
        try {
            const formData = new FormData();
            
            // Convert base64 to buffer if needed
            const buffer = typeof file.data === 'string' 
                ? Buffer.from(file.data, 'base64')
                : file.data;
            
            formData.append('media', buffer, {
                filename: file.filename,
                contentType: file.mimeType
            });

            const response = await this.getAxiosInstance().post('/updates/media/upload.json', formData, {
                headers: {
                    ...formData.getHeaders()
                }
            });

            if (response.data && response.data.media && response.data.media[0]) {
                return response.data.media[0].picture; // URL of uploaded media
            }

            throw new Error('Failed to upload media to Buffer');
        } catch (error) {
            LogError('Buffer media upload failed:', error);
            throw error;
        }
    }

    /**
     * Create a Buffer update (post)
     */
    protected async createUpdate(
        profileIds: string[],
        text: string,
        media?: { link?: string; description?: string; picture?: string }[],
        scheduledAt?: Date,
        options?: {
            shorten?: boolean;
            now?: boolean;
            top?: boolean;
            attachment?: boolean;
        }
    ): Promise<any> {
        const data: any = {
            profile_ids: profileIds,
            text: text,
            shorten: options?.shorten !== false // Default to true
        };

        if (media && media.length > 0) {
            data.media = media;
        }

        if (scheduledAt) {
            data.scheduled_at = Math.floor(scheduledAt.getTime() / 1000); // Unix timestamp
        } else if (options?.now) {
            data.now = true;
        }

        if (options?.top) {
            data.top = true;
        }

        if (options?.attachment !== undefined) {
            data.attachment = options.attachment;
        }

        try {
            const response = await this.getAxiosInstance().post('/updates/create.json', data);
            return response.data;
        } catch (error) {
            LogError('Failed to create Buffer update:', error);
            throw error;
        }
    }

    /**
     * Get updates (posts) from Buffer
     */
    protected async getUpdates(
        profileId: string,
        status: 'pending' | 'sent',
        options?: {
            page?: number;
            count?: number;
            since?: Date;
            utc?: boolean;
        }
    ): Promise<any> {
        const params: any = {
            page: options?.page || 1,
            count: options?.count || 10,
            utc: options?.utc !== false // Default to true
        };

        if (options?.since) {
            params.since = Math.floor(options.since.getTime() / 1000);
        }

        try {
            const response = await this.getAxiosInstance().get(
                `/profiles/${profileId}/updates/${status}.json`,
                { params }
            );
            return response.data;
        } catch (error) {
            LogError(`Failed to get ${status} updates from Buffer:`, error);
            throw error;
        }
    }

    /**
     * Delete a Buffer update
     */
    protected async deleteUpdate(updateId: string): Promise<boolean> {
        try {
            const response = await this.getAxiosInstance().post(`/updates/${updateId}/destroy.json`);
            return response.data.success === true;
        } catch (error) {
            LogError('Failed to delete Buffer update:', error);
            throw error;
        }
    }

    /**
     * Reorder updates in the queue
     */
    protected async reorderUpdates(profileId: string, updateIds: string[], offset?: number): Promise<any> {
        const data: any = {
            order: updateIds
        };

        if (offset !== undefined) {
            data.offset = offset;
        }

        try {
            const response = await this.getAxiosInstance().post(
                `/profiles/${profileId}/updates/reorder.json`,
                data
            );
            return response.data;
        } catch (error) {
            LogError('Failed to reorder Buffer updates:', error);
            throw error;
        }
    }

    /**
     * Get analytics for sent posts
     */
    protected async getAnalytics(updateId: string): Promise<any> {
        try {
            const response = await this.getAxiosInstance().get(`/updates/${updateId}/interactions.json`);
            return response.data;
        } catch (error) {
            LogError('Failed to get Buffer analytics:', error);
            throw error;
        }
    }

    /**
     * Search posts implementation for Buffer
     * Buffer doesn't have a native search API, so we'll fetch posts and filter client-side
     */
    protected async searchPosts(params: {
        query?: string;
        hashtags?: string[];
        startDate?: Date;
        endDate?: Date;
        limit?: number;
        offset?: number;
        profileIds?: string[];
    }): Promise<SocialPost[]> {
        const posts: SocialPost[] = [];
        const profileIds = params.profileIds || [];

        // If no profile IDs provided, get all profiles
        if (profileIds.length === 0) {
            const profiles = await this.getProfiles();
            profileIds.push(...profiles.map(p => p.id));
        }

        // Fetch sent posts from each profile
        for (const profileId of profileIds) {
            try {
                let page = 1;
                let hasMore = true;
                
                while (hasMore && posts.length < (params.limit || 100)) {
                    const result = await this.getUpdates(profileId, 'sent', {
                        page: page,
                        count: 100,
                        since: params.startDate
                    });

                    if (result.updates && result.updates.length > 0) {
                        for (const update of result.updates) {
                            const post = this.normalizePost(update);
                            
                            // Apply filters
                            if (this.matchesSearchCriteria(post, params)) {
                                posts.push(post);
                                
                                if (posts.length >= (params.limit || 100)) {
                                    hasMore = false;
                                    break;
                                }
                            }
                        }
                        
                        page++;
                        hasMore = result.updates.length === 100;
                    } else {
                        hasMore = false;
                    }
                }
            } catch (error) {
                LogError(`Failed to search posts for profile ${profileId}:`, error);
            }
        }

        // Sort by published date descending
        posts.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

        // Apply offset if specified
        if (params.offset) {
            return posts.slice(params.offset, params.offset + (params.limit || 100));
        }

        return posts.slice(0, params.limit || 100);
    }

    /**
     * Check if a post matches search criteria
     */
    private matchesSearchCriteria(post: SocialPost, params: any): boolean {
        // Check date range
        if (params.endDate && post.publishedAt > params.endDate) {
            return false;
        }

        // Check query text
        if (params.query) {
            const query = params.query.toLowerCase();
            const content = post.content.toLowerCase();
            if (!content.includes(query)) {
                return false;
            }
        }

        // Check hashtags
        if (params.hashtags && params.hashtags.length > 0) {
            const postHashtags = this.extractHashtags(post.content);
            const hasMatchingHashtag = params.hashtags.some(tag => 
                postHashtags.includes(tag.toLowerCase().replace('#', ''))
            );
            if (!hasMatchingHashtag) {
                return false;
            }
        }

        return true;
    }

    /**
     * Extract hashtags from post content
     */
    protected extractHashtags(content: string): string[] {
        const regex = /#(\w+)/g;
        const hashtags: string[] = [];
        let match;
        
        while ((match = regex.exec(content)) !== null) {
            hashtags.push(match[1].toLowerCase());
        }
        
        return hashtags;
    }

    /**
     * Normalize Buffer post to common format
     */
    protected normalizePost(bufferPost: any): SocialPost {
        const media: string[] = [];
        
        if (bufferPost.media) {
            if (bufferPost.media.picture) {
                media.push(bufferPost.media.picture);
            }
            if (bufferPost.media.link) {
                media.push(bufferPost.media.link);
            }
        }

        return {
            id: bufferPost.id,
            platform: 'Buffer',
            profileId: bufferPost.profile_id,
            content: bufferPost.text || '',
            mediaUrls: media,
            publishedAt: new Date(bufferPost.sent_at * 1000), // Convert Unix timestamp
            scheduledFor: bufferPost.due_at ? new Date(bufferPost.due_at * 1000) : undefined,
            analytics: bufferPost.statistics ? this.normalizeAnalytics(bufferPost.statistics) : undefined,
            platformSpecificData: {
                profileService: bufferPost.profile_service,
                status: bufferPost.status,
                userId: bufferPost.user_id,
                viaName: bufferPost.via,
                sourceUrl: bufferPost.source_url,
                day: bufferPost.day,
                dueTime: bufferPost.due_time,
                mediaDescription: bufferPost.media?.description,
                mediaTitle: bufferPost.media?.title,
                mediaLink: bufferPost.media?.link
            }
        };
    }

    /**
     * Normalize Buffer analytics to common format
     */
    protected normalizeAnalytics(bufferStats: any): SocialAnalytics {
        return {
            impressions: bufferStats.reach || 0,
            engagements: (bufferStats.clicks || 0) + (bufferStats.favorites || 0) + 
                        (bufferStats.mentions || 0) + (bufferStats.retweets || 0) +
                        (bufferStats.shares || 0) + (bufferStats.comments || 0),
            clicks: bufferStats.clicks || 0,
            shares: bufferStats.shares || bufferStats.retweets || 0,
            comments: bufferStats.comments || bufferStats.mentions || 0,
            likes: bufferStats.favorites || bufferStats.likes || 0,
            reach: bufferStats.reach || 0,
            saves: undefined,
            videoViews: undefined,
            platformMetrics: bufferStats
        };
    }

    /**
     * Map Buffer error to our error codes
     */
    protected mapBufferError(error: any): string {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;

            if (status === 401) {
                return 'INVALID_TOKEN';
            } else if (status === 429) {
                return 'RATE_LIMIT';
            } else if (status === 403) {
                return 'INSUFFICIENT_PERMISSIONS';
            } else if (status === 404) {
                return 'POST_NOT_FOUND';
            } else if (data?.error?.includes('media')) {
                return 'INVALID_MEDIA';
            }
        }

        return 'PLATFORM_ERROR';
    }
}