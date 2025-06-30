import { RegisterClass } from '@memberjunction/global';
import { BaseSocialMediaAction, MediaFile, SocialPost, SearchParams, SocialAnalytics } from '../../base/base-social.action';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { ActionParam } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';

/**
 * Base class for all LinkedIn actions.
 * Handles LinkedIn-specific authentication, API interactions, and rate limiting.
 * Uses LinkedIn Marketing Developer Platform API v2.
 */
@RegisterClass(BaseSocialMediaAction, 'LinkedInBaseAction')
export abstract class LinkedInBaseAction extends BaseSocialMediaAction {
    protected get platformName(): string {
        return 'LinkedIn';
    }

    protected get apiBaseUrl(): string {
        return 'https://api.linkedin.com/v2';
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
                    'Accept': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0' // LinkedIn specific header
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
                        LogStatus(`LinkedIn Rate Limit - Remaining: ${rateLimitInfo.remaining}/${rateLimitInfo.limit}, Reset: ${rateLimitInfo.reset}`);
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
            throw new Error('No refresh token available for LinkedIn');
        }

        try {
            const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', 
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: this.getCustomAttribute(2) || '', // Client ID stored in CustomAttribute2
                    client_secret: this.getCustomAttribute(3) || '' // Client Secret stored in CustomAttribute3
                }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;

            // Update stored tokens
            await this.updateStoredTokens(
                access_token,
                newRefreshToken || refreshToken,
                expires_in
            );

            LogStatus('LinkedIn access token refreshed successfully');
        } catch (error) {
            LogError(`Failed to refresh LinkedIn access token: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Get the authenticated user's profile URN
     */
    protected async getCurrentUserUrn(): Promise<string> {
        try {
            const response = await this.axiosInstance.get('/me');
            return `urn:li:person:${response.data.id}`;
        } catch (error) {
            LogError(`Failed to get current user URN: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Get organizations the user has admin access to
     */
    protected async getAdminOrganizations(): Promise<LinkedInOrganization[]> {
        try {
            const response = await this.axiosInstance.get('/organizationalEntityAcls', {
                params: {
                    q: 'roleAssignee',
                    role: 'ADMINISTRATOR',
                    projection: '(elements*(*,organizationalTarget~(localizedName)))'
                }
            });

            const organizations: LinkedInOrganization[] = [];
            if (response.data.elements) {
                for (const element of response.data.elements) {
                    if (element.organizationalTarget) {
                        organizations.push({
                            urn: element.organizationalTarget,
                            name: element['organizationalTarget~']?.localizedName || 'Unknown',
                            id: element.organizationalTarget.split(':').pop() || ''
                        });
                    }
                }
            }

            return organizations;
        } catch (error) {
            LogError(`Failed to get admin organizations: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Upload media to LinkedIn
     */
    protected async uploadSingleMedia(file: MediaFile): Promise<string> {
        try {
            // Step 1: Register upload
            const registerResponse = await this.axiosInstance.post('/assets?action=registerUpload', {
                registerUploadRequest: {
                    recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                    owner: await this.getCurrentUserUrn(),
                    serviceRelationships: [{
                        relationshipType: 'OWNER',
                        identifier: 'urn:li:userGeneratedContent'
                    }]
                }
            });

            const uploadUrl = registerResponse.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
            const asset = registerResponse.data.value.asset;

            // Step 2: Upload the file
            const fileData = typeof file.data === 'string' 
                ? Buffer.from(file.data, 'base64') 
                : file.data;

            await axios.put(uploadUrl, fileData, {
                headers: {
                    'Authorization': `Bearer ${this.getAccessToken()}`,
                    'Content-Type': file.mimeType
                }
            });

            // Return the asset URN
            return asset;
        } catch (error) {
            LogError(`Failed to upload media to LinkedIn: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Validate media file meets LinkedIn requirements
     */
    protected validateMediaFile(file: MediaFile): void {
        const supportedTypes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp'
        ];

        if (!supportedTypes.includes(file.mimeType)) {
            throw new Error(`Unsupported media type: ${file.mimeType}. Supported types: ${supportedTypes.join(', ')}`);
        }

        // LinkedIn image size limits
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            throw new Error(`File size exceeds limit. Max: ${maxSize / 1024 / 1024}MB, Got: ${file.size / 1024 / 1024}MB`);
        }
    }

    /**
     * Create a share (post) on LinkedIn
     */
    protected async createShare(shareData: LinkedInShareData): Promise<string> {
        try {
            const response = await this.axiosInstance.post('/ugcPosts', shareData);
            return response.data.id;
        } catch (error) {
            this.handleLinkedInError(error as AxiosError);
        }
    }

    /**
     * Get shares for a specific author (person or organization)
     */
    protected async getShares(authorUrn: string, count: number = 50, start: number = 0): Promise<LinkedInShare[]> {
        try {
            const response = await this.axiosInstance.get('/ugcPosts', {
                params: {
                    q: 'authors',
                    authors: `List(${authorUrn})`,
                    count: count,
                    start: start
                }
            });

            return response.data.elements || [];
        } catch (error) {
            LogError(`Failed to get shares: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }

    /**
     * Convert LinkedIn share to common format
     */
    protected normalizePost(linkedInShare: LinkedInShare): SocialPost {
        const publishedAt = new Date(linkedInShare.firstPublishedAt || linkedInShare.created.time);
        
        // Extract media URLs
        const mediaUrls: string[] = [];
        if (linkedInShare.specificContent?.['com.linkedin.ugc.ShareContent']?.media) {
            for (const media of linkedInShare.specificContent['com.linkedin.ugc.ShareContent'].media) {
                if (media.media) {
                    mediaUrls.push(media.media);
                }
            }
        }

        return {
            id: linkedInShare.id,
            platform: 'LinkedIn',
            profileId: linkedInShare.author,
            content: linkedInShare.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || '',
            mediaUrls: mediaUrls,
            publishedAt: publishedAt,
            platformSpecificData: {
                lifecycleState: linkedInShare.lifecycleState,
                visibility: linkedInShare.visibility,
                distribution: linkedInShare.distribution
            }
        };
    }

    /**
     * Normalize LinkedIn analytics to common format
     */
    protected normalizeAnalytics(linkedInAnalytics: LinkedInAnalytics): SocialAnalytics {
        return {
            impressions: linkedInAnalytics.totalShareStatistics?.impressionCount || 0,
            engagements: linkedInAnalytics.totalShareStatistics?.engagement || 0,
            clicks: linkedInAnalytics.totalShareStatistics?.clickCount || 0,
            shares: linkedInAnalytics.totalShareStatistics?.shareCount || 0,
            comments: linkedInAnalytics.totalShareStatistics?.commentCount || 0,
            likes: linkedInAnalytics.totalShareStatistics?.likeCount || 0,
            reach: linkedInAnalytics.totalShareStatistics?.uniqueImpressionsCount || 0,
            platformMetrics: linkedInAnalytics
        };
    }

    /**
     * Search for posts - implemented in search action
     */
    protected async searchPosts(params: SearchParams): Promise<SocialPost[]> {
        // This is implemented in the search-posts.action.ts
        throw new Error('Search posts is implemented in LinkedInSearchPostsAction');
    }

    /**
     * Handle LinkedIn-specific errors
     */
    protected handleLinkedInError(error: AxiosError): never {
        if (error.response) {
            const { status, data } = error.response;
            const errorData = data as any;

            switch (status) {
                case 400:
                    throw new Error(`Bad Request: ${errorData.message || 'Invalid request parameters'}`);
                case 401:
                    throw new Error('Unauthorized: Invalid or expired access token');
                case 403:
                    throw new Error('Forbidden: Insufficient permissions. Ensure the app has required LinkedIn scopes.');
                case 404:
                    throw new Error('Not Found: Resource does not exist');
                case 422:
                    throw new Error(`Unprocessable Entity: ${errorData.message || 'Invalid data provided'}`);
                case 429:
                    throw new Error('Rate Limit Exceeded: Too many requests');
                case 500:
                    throw new Error('Internal Server Error: LinkedIn service error');
                default:
                    throw new Error(`LinkedIn API Error (${status}): ${errorData.message || 'Unknown error'}`);
            }
        } else if (error.request) {
            throw new Error('Network Error: No response from LinkedIn');
        } else {
            throw new Error(`Request Error: ${error.message}`);
        }
    }

    /**
     * Parse LinkedIn-specific rate limit headers
     */
    protected parseRateLimitHeaders(headers: any): { remaining: number; reset: Date; limit: number; } | null {
        // LinkedIn uses different header names
        const appRemaining = headers['x-app-rate-limit-remaining'];
        const appLimit = headers['x-app-rate-limit-limit'];
        const memberRemaining = headers['x-member-rate-limit-remaining'];
        const memberLimit = headers['x-member-rate-limit-limit'];
        
        // Use the more restrictive limit
        const remaining = Math.min(
            appRemaining ? parseInt(appRemaining) : Infinity,
            memberRemaining ? parseInt(memberRemaining) : Infinity
        );
        
        const limit = Math.min(
            appLimit ? parseInt(appLimit) : Infinity,
            memberLimit ? parseInt(memberLimit) : Infinity
        );

        if (remaining !== Infinity && limit !== Infinity) {
            // LinkedIn resets rate limits at the top of each hour
            const now = new Date();
            const reset = new Date(now);
            reset.setHours(reset.getHours() + 1, 0, 0, 0);

            return { remaining, reset, limit };
        }

        return null;
    }
}

/**
 * LinkedIn-specific interfaces
 */
export interface LinkedInOrganization {
    urn: string;
    name: string;
    id: string;
}

export interface LinkedInShareData {
    author: string; // URN of the author (person or organization)
    lifecycleState: 'PUBLISHED' | 'DRAFT';
    specificContent: {
        'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
                text: string;
            };
            shareMediaCategory: 'NONE' | 'ARTICLE' | 'IMAGE' | 'VIDEO' | 'RICH';
            media?: Array<{
                status: 'READY';
                media: string; // Asset URN
                title?: {
                    text: string;
                };
                description?: {
                    text: string;
                };
            }>;
        };
    };
    visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' | 'CONNECTIONS' | 'LOGGED_IN' | 'CONTAINER';
    };
    distribution?: {
        linkedInDistributionTarget?: {
            visibleToGuest?: boolean;
        };
    };
}

export interface LinkedInShare {
    id: string;
    author: string;
    created: {
        actor: string;
        time: number;
    };
    firstPublishedAt?: number;
    lastModified?: {
        actor: string;
        time: number;
    };
    lifecycleState: string;
    specificContent: {
        'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
                text: string;
            };
            shareMediaCategory: string;
            media?: Array<{
                media: string;
                title?: {
                    text: string;
                };
            }>;
        };
    };
    visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': string;
    };
    distribution?: any;
}

export interface LinkedInAnalytics {
    totalShareStatistics?: {
        impressionCount: number;
        clickCount: number;
        engagement: number;
        likeCount: number;
        commentCount: number;
        shareCount: number;
        uniqueImpressionsCount: number;
    };
    timeRange?: {
        start: number;
        end: number;
    };
}

export interface LinkedInArticle {
    author: string;
    publishedAt: number;
    coverImage?: string;
    title: string;
    description?: string;
    content: string;
    visibility: string;
}