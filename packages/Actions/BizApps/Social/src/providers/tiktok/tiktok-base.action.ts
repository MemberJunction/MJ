import { RegisterClass } from '@memberjunction/global';
import { BaseSocialMediaAction, SocialPost, SocialAnalytics, MediaFile } from '../../base/base-social.action';
import { LogError, LogStatus } from '@memberjunction/core';
import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * TikTok video information
 */
export interface TikTokVideo {
    id: string;
    share_url: string;
    title: string;
    description: string;
    duration: number;
    cover_image_url: string;
    share_count: number;
    view_count: number;
    like_count: number;
    comment_count: number;
    create_time: number;
}

/**
 * TikTok user information
 */
export interface TikTokUser {
    open_id: string;
    union_id: string;
    avatar_url: string;
    display_name: string;
    bio_description: string;
    profile_deep_link: string;
    is_verified: boolean;
    follower_count: number;
    following_count: number;
    likes_count: number;
}

/**
 * Base class for all TikTok social media actions.
 * Handles TikTok-specific authentication and API interaction patterns.
 */
@RegisterClass(BaseAction, 'TikTokBaseAction')
export abstract class TikTokBaseAction extends BaseSocialMediaAction {
    
    protected get platformName(): string {
        return 'TikTok';
    }
    
    protected get apiBaseUrl(): string {
        return 'https://open-api.tiktok.com';
    }
    
    private axiosInstance: AxiosInstance | null = null;
    
    /**
     * Initialize axios instance with interceptors
     */
    protected getAxiosInstance(): AxiosInstance {
        if (!this.axiosInstance) {
            this.axiosInstance = axios.create({
                baseURL: this.apiBaseUrl,
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            // Request interceptor for logging
            this.axiosInstance.interceptors.request.use(
                (config) => {
                    this.logApiRequest(config.method?.toUpperCase() || 'GET', config.url || '', config.data);
                    return config;
                },
                (error) => {
                    LogError(`TikTok API Request Error: ${error.message}`);
                    return Promise.reject(error);
                }
            );
            
            // Response interceptor for logging and error handling
            this.axiosInstance.interceptors.response.use(
                (response) => {
                    this.logApiResponse(response.data);
                    return response;
                },
                async (error: AxiosError) => {
                    if (error.response?.status === 429) {
                        // Rate limit hit
                        const retryAfter = error.response.headers['retry-after'];
                        await this.handleRateLimit(retryAfter ? parseInt(retryAfter) : undefined);
                        
                        // Retry the request
                        return this.axiosInstance?.request(error.config!);
                    }
                    
                    LogError(`TikTok API Response Error: ${error.message}`);
                    return Promise.reject(error);
                }
            );
        }
        
        return this.axiosInstance;
    }
    
    /**
     * Make authenticated TikTok API request
     */
    protected async makeTikTokRequest<T>(
        endpoint: string,
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
        data?: any,
        params?: any
    ): Promise<T> {
        const token = this.getAccessToken();
        if (!token) {
            throw new Error('No access token available for TikTok');
        }
        
        const axios = this.getAxiosInstance();
        
        try {
            const response = await axios.request<T>({
                method,
                url: endpoint,
                data,
                params,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            return response.data;
        } catch (error) {
            if (error instanceof AxiosError) {
                if (error.response?.status === 401) {
                    // Token might be expired, try to refresh
                    await this.refreshAccessToken();
                    
                    // Retry with new token
                    const newToken = this.getAccessToken();
                    const retryResponse = await axios.request<T>({
                        method,
                        url: endpoint,
                        data,
                        params,
                        headers: {
                            'Authorization': `Bearer ${newToken}`
                        }
                    });
                    
                    return retryResponse.data;
                }
                
                const errorMessage = error.response?.data?.error?.message || error.message;
                throw new Error(`TikTok API error: ${errorMessage}`);
            }
            throw error;
        }
    }
    
    /**
     * Refresh TikTok access token
     */
    protected async refreshAccessToken(): Promise<void> {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            throw new Error('No refresh token available for TikTok');
        }
        
        try {
            const response = await axios.post(`${this.apiBaseUrl}/oauth/refresh_token/`, {
                client_key: this.getCustomAttribute(2), // Store client key in CustomAttribute2
                grant_type: 'refresh_token',
                refresh_token: refreshToken
            });
            
            const { access_token, refresh_token: newRefreshToken, expires_in } = response.data.data;
            
            // Update stored tokens
            await this.updateStoredTokens(access_token, newRefreshToken, expires_in);
            
            LogStatus('TikTok access token refreshed successfully');
        } catch (error) {
            LogError(`Failed to refresh TikTok access token: ${error}`);
            throw new Error('Failed to refresh TikTok access token');
        }
    }
    
    /**
     * Upload media to TikTok (requires special approval)
     */
    protected async uploadSingleMedia(file: MediaFile): Promise<string> {
        // TikTok video upload requires special approval
        // This is a placeholder implementation
        throw new Error('TikTok video upload requires special API approval. Please use TikTok Creator Studio for video uploads.');
    }
    
    /**
     * Search posts (videos) - TikTok only allows searching user's own videos
     */
    protected async searchPosts(params: any): Promise<SocialPost[]> {
        // TikTok doesn't provide a general search API for security/privacy reasons
        // We can only search within a user's own videos
        const videos = await this.getUserVideos();
        
        let filtered = videos;
        
        // Apply filters if provided
        if (params.query) {
            const query = params.query.toLowerCase();
            filtered = filtered.filter(video => 
                video.title.toLowerCase().includes(query) ||
                video.description.toLowerCase().includes(query)
            );
        }
        
        if (params.hashtags && params.hashtags.length > 0) {
            filtered = filtered.filter(video => {
                const videoHashtags = this.extractHashtags(video.description);
                return params.hashtags.some((tag: string) => 
                    videoHashtags.includes(tag.toLowerCase())
                );
            });
        }
        
        if (params.startDate) {
            const startTime = new Date(params.startDate).getTime() / 1000;
            filtered = filtered.filter(video => video.create_time >= startTime);
        }
        
        if (params.endDate) {
            const endTime = new Date(params.endDate).getTime() / 1000;
            filtered = filtered.filter(video => video.create_time <= endTime);
        }
        
        // Apply limit and offset
        if (params.offset) {
            filtered = filtered.slice(params.offset);
        }
        
        if (params.limit) {
            filtered = filtered.slice(0, params.limit);
        }
        
        return filtered.map(video => this.normalizePost(video));
    }
    
    /**
     * Get user's videos
     */
    protected async getUserVideos(): Promise<TikTokVideo[]> {
        const response = await this.makeTikTokRequest<any>(
            '/v2/video/list/',
            'GET',
            undefined,
            {
                fields: 'id,share_url,title,description,duration,cover_image_url,share_count,view_count,like_count,comment_count,create_time'
            }
        );
        
        return response.data?.videos || [];
    }
    
    /**
     * Convert TikTok video to common post format
     */
    protected normalizePost(video: TikTokVideo): SocialPost {
        return {
            id: video.id,
            platform: this.platformName,
            profileId: this.getCustomAttribute(1) || '', // Store user ID in CustomAttribute1
            content: video.description || video.title,
            mediaUrls: [video.cover_image_url],
            publishedAt: new Date(video.create_time * 1000),
            analytics: {
                impressions: video.view_count,
                engagements: video.like_count + video.comment_count + video.share_count,
                clicks: 0, // Not available in TikTok API
                shares: video.share_count,
                comments: video.comment_count,
                likes: video.like_count,
                reach: video.view_count,
                videoViews: video.view_count,
                platformMetrics: {
                    duration: video.duration,
                    shareUrl: video.share_url
                }
            },
            platformSpecificData: {
                ...video,
                videoUrl: video.share_url
            }
        };
    }
    
    /**
     * Normalize TikTok analytics to common format
     */
    protected normalizeAnalytics(platformData: any): SocialAnalytics {
        return {
            impressions: platformData.view_count || 0,
            engagements: (platformData.like_count || 0) + (platformData.comment_count || 0) + (platformData.share_count || 0),
            clicks: 0, // Not available in TikTok API
            shares: platformData.share_count || 0,
            comments: platformData.comment_count || 0,
            likes: platformData.like_count || 0,
            reach: platformData.view_count || 0,
            videoViews: platformData.view_count || 0,
            platformMetrics: platformData
        };
    }
    
    /**
     * Extract hashtags from video description
     */
    protected extractHashtags(description: string): string[] {
        const hashtagRegex = /#(\w+)/g;
        const matches = description.match(hashtagRegex) || [];
        return matches.map(tag => tag.substring(1).toLowerCase());
    }
    
    /**
     * Get current user info
     */
    protected async getCurrentUser(): Promise<TikTokUser> {
        const response = await this.makeTikTokRequest<any>(
            '/v2/user/info/',
            'GET',
            undefined,
            {
                fields: 'open_id,union_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count'
            }
        );
        
        return response.data?.user;
    }
    
    /**
     * Validate TikTok-specific media requirements
     */
    protected validateMediaFile(file: MediaFile): void {
        const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
        
        if (!allowedTypes.includes(file.mimeType)) {
            throw new Error(`TikTok only supports video files. Got: ${file.mimeType}`);
        }
        
        // Max file size: 287.6 MB
        const maxSize = 287.6 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new Error(`File size exceeds TikTok limit of 287.6 MB. Got: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
        }
    }
}