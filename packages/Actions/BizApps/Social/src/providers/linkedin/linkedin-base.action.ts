import { RegisterClass } from '@memberjunction/global';
import { BaseSocialMediaAction, MediaFile, SocialPost, SearchParams, SocialAnalytics } from '../../base/base-social.action';
import { HttpClient, HttpError, HttpPost, HttpPut } from '@memberjunction/network-utils';
import { ActionParam } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

/**
 * Base class for all LinkedIn actions.
 * Handles LinkedIn-specific authentication, API interactions, and rate limiting.
 * Uses LinkedIn Marketing Developer Platform API v2.
 */
@RegisterClass(BaseAction, 'LinkedInBaseAction')
export abstract class LinkedInBaseAction extends BaseSocialMediaAction {
    protected get platformName(): string {
        return 'LinkedIn';
    }

    protected get apiBaseUrl(): string {
        return 'https://api.linkedin.com/v2';
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
                    'Accept': 'application/json',
                    'X-Restli-Protocol-Version': '2.0.0' // LinkedIn specific header
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
                        LogStatus(`LinkedIn Rate Limit - Remaining: ${rateLimitInfo.remaining}/${rateLimitInfo.limit}, Reset: ${rateLimitInfo.reset}`);
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
            throw new Error('No refresh token available for LinkedIn');
        }

        try {
            const response = await HttpPost<LinkedInTokenResponse>('https://www.linkedin.com/oauth/v2/accessToken', 
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: this.getCustomAttribute(2) || '', // Client ID stored in CustomAttribute2
                    client_secret: this.getCustomAttribute(3) || '' // Client Secret stored in CustomAttribute3
                }).toString(),
                {
                    Headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            const { access_token, refresh_token: newRefreshToken, expires_in } = response.Data;

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
            const response = await this.httpClient.Get<LinkedInProfile>('/me');
            return `urn:li:person:${response.Data.id}`;
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
            const response = await this.httpClient.Get<LinkedInCollectionResponse<LinkedInOrganizationAcl>>('/organizationalEntityAcls', {
                Query: {
                    q: 'roleAssignee',
                    role: 'ADMINISTRATOR',
                    projection: '(elements*(*,organizationalTarget~(localizedName)))'
                }
            });

            const organizations: LinkedInOrganization[] = [];
            if (response.Data.elements) {
                for (const element of response.Data.elements) {
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
            const registerResponse = await this.httpClient.Post<LinkedInRegisterUploadResponse>('/assets?action=registerUpload', {
                registerUploadRequest: {
                    recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
                    owner: await this.getCurrentUserUrn(),
                    serviceRelationships: [{
                        relationshipType: 'OWNER',
                        identifier: 'urn:li:userGeneratedContent'
                    }]
                }
            });

            const uploadUrl = registerResponse.Data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
            const asset = registerResponse.Data.value.asset;

            // Step 2: Upload the file
            const fileData = typeof file.data === 'string' 
                ? Buffer.from(file.data, 'base64') 
                : file.data;

            await HttpPut(uploadUrl, fileData, {
                Headers: {
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
            const response = await this.httpClient.Post<{ id: string }>('/ugcPosts', shareData);
            return response.Data.id;
        } catch (error) {
            this.handleLinkedInError(error as HttpError);
        }
    }

    /**
     * Get shares for a specific author (person or organization)
     */
    protected async getShares(authorUrn: string, count: number = 50, start: number = 0): Promise<LinkedInShare[]> {
        try {
            const response = await this.httpClient.Get<LinkedInCollectionResponse<LinkedInShare>>('/ugcPosts', {
                Query: {
                    q: 'authors',
                    authors: `List(${authorUrn})`,
                    count: count,
                    start: start
                }
            });

            return response.Data.elements || [];
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
    protected handleLinkedInError(error: HttpError): never {
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
        } else if (error.IsTimeout) {
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
/**
 * LinkedIn's collection envelope: results under `elements`, with `paging` metadata.
 * Used by `/organizationalEntityAcls`, `/ugcPosts`, `/organizationalEntity*Statistics`, etc.
 */
export interface LinkedInCollectionResponse<T> {
    elements: T[];
    paging?: { start?: number; count?: number; total?: number };
}

/** A localized string field, e.g. `firstName.localized.en_US`. */
export interface LinkedInLocalizedString {
    localized?: Record<string, string>;
    preferredLocale?: { country?: string; language?: string };
}

/** The authenticated member's profile from `/me`. */
export interface LinkedInProfile {
    id: string;
    firstName?: LinkedInLocalizedString;
    lastName?: LinkedInLocalizedString;
    headline?: LinkedInLocalizedString;
    publicProfileUrl?: string;
    followerCount?: number;
}

/** Response from the OAuth2 token endpoint. */
export interface LinkedInTokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
}

/** Response from `POST /assets?action=registerUpload`. */
export interface LinkedInRegisterUploadResponse {
    value: {
        asset: string;
        mediaArtifact?: string;
        uploadMechanism: {
            'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
                uploadUrl: string;
                headers?: Record<string, string>;
            };
        };
    };
}

/** An ACL row from `/organizationalEntityAcls`, naming an organization the member administers. */
export interface LinkedInOrganizationAcl {
    organizationalTarget: string;
    role?: string;
    state?: string;
}

/** An element of `/organizationalEntityFollowerStatistics`. */
export interface LinkedInFollowerStatistics {
    followerCounts?: {
        organicFollowerCount?: number;
        paidFollowerCount?: number;
    };
    followerGains?: {
        organicFollowerGains?: number;
        paidFollowerGains?: number;
    };
    organizationalEntity?: string;
    /**
     * Demographic breakdowns, present only when the statistics are requested without a
     * time-bound (LinkedIn returns lifetime demographics or time-series gains, not both).
     */
    followerCountsByFunction?: Array<Record<string, unknown>>;
    followerCountsBySeniority?: Array<Record<string, unknown>>;
    followerCountsByIndustry?: Array<Record<string, unknown>>;
    followerCountsByRegion?: Array<Record<string, unknown>>;
    followerCountsByCountry?: Array<Record<string, unknown>>;
}

/** Engagement summaries returned alongside a UGC post. */
export interface LinkedInPostSummary {
    likesSummary?: { totalLikes?: number };
    commentsSummary?: { totalComments?: number };
}

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