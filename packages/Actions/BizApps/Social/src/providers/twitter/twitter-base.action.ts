import { RegisterClass } from '@memberjunction/global';
import { BaseSocialMediaAction, MediaFile, SocialPost, SearchParams, SocialAnalytics } from '../../base/base-social.action';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { ActionParam } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/global';
import FormData from 'form-data';
import { BaseAction } from '@memberjunction/actions';

/**
 * Base class for all Twitter/X actions.
 * Handles Twitter-specific authentication, API interactions, and rate limiting.
 * Uses Twitter API v2 with OAuth 2.0.
 */
@RegisterClass(BaseAction, 'TwitterBaseAction')
export abstract class TwitterBaseAction extends BaseSocialMediaAction {
  protected get platformName(): string {
    return 'Twitter';
  }

  protected get apiBaseUrl(): string {
    return 'https://api.twitter.com/2';
  }

  /**
   * Upload endpoint for media
   */
  protected get uploadApiUrl(): string {
    return 'https://upload.twitter.com/1.1';
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
          Accept: 'application/json',
        },
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
            LogStatus(`Twitter Rate Limit - Remaining: ${rateLimitInfo.remaining}/${rateLimitInfo.limit}, Reset: ${rateLimitInfo.reset}`);
          }
          return response;
        },
        async (error: AxiosError) => {
          if (error.response?.status === 429) {
            // Rate limit exceeded
            const resetTime = error.response.headers['x-rate-limit-reset'];
            const waitTime = resetTime ? Math.max(0, parseInt(resetTime) - Math.floor(Date.now() / 1000)) : 60;
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
      throw new Error('No refresh token available for Twitter');
    }

    try {
      const clientId = this.getCustomAttribute(2) || ''; // Client ID stored in CustomAttribute2
      const clientSecret = this.getCustomAttribute(3) || ''; // Client Secret stored in CustomAttribute3

      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const response = await axios.post(
        'https://api.twitter.com/2/oauth2/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basicAuth}`,
          },
        }
      );

      const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;

      // Update stored tokens
      await this.updateStoredTokens(access_token, newRefreshToken || refreshToken, expires_in);

      LogStatus('Twitter access token refreshed successfully');
    } catch (error) {
      LogError(`Failed to refresh Twitter access token: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get the authenticated user's info
   */
  protected async getCurrentUser(): Promise<TwitterUser> {
    try {
      const response = await this.axiosInstance.get('/users/me', {
        params: {
          'user.fields': 'id,name,username,profile_image_url,description,created_at,verified',
        },
      });
      return response.data.data;
    } catch (error) {
      LogError(`Failed to get current user: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Upload media to Twitter
   */
  protected async uploadSingleMedia(file: MediaFile): Promise<string> {
    try {
      const fileData = typeof file.data === 'string' ? Buffer.from(file.data, 'base64') : file.data;

      // Step 1: Initialize upload
      const initResponse = await axios.post(
        `${this.uploadApiUrl}/media/upload.json`,
        new URLSearchParams({
          command: 'INIT',
          total_bytes: fileData.length.toString(),
          media_type: file.mimeType,
          media_category: this.getMediaCategory(file.mimeType),
        }).toString(),
        {
          headers: {
            Authorization: `Bearer ${this.getAccessToken()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const mediaId = initResponse.data.media_id_string;

      // Step 2: Upload chunks (for large files, Twitter requires chunking)
      const chunkSize = 5 * 1024 * 1024; // 5MB chunks
      let segmentIndex = 0;

      for (let offset = 0; offset < fileData.length; offset += chunkSize) {
        const chunk = fileData.slice(offset, Math.min(offset + chunkSize, fileData.length));

        const formData = new FormData();
        formData.append('command', 'APPEND');
        formData.append('media_id', mediaId);
        formData.append('segment_index', segmentIndex.toString());
        formData.append('media', chunk, {
          filename: file.filename,
          contentType: file.mimeType,
        });

        await axios.post(`${this.uploadApiUrl}/media/upload.json`, formData, {
          headers: {
            Authorization: `Bearer ${this.getAccessToken()}`,
            ...formData.getHeaders(),
          },
        });

        segmentIndex++;
      }

      // Step 3: Finalize upload
      await axios.post(
        `${this.uploadApiUrl}/media/upload.json`,
        new URLSearchParams({
          command: 'FINALIZE',
          media_id: mediaId,
        }).toString(),
        {
          headers: {
            Authorization: `Bearer ${this.getAccessToken()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      // Step 4: Check processing status (for videos)
      if (file.mimeType.startsWith('video/')) {
        await this.waitForMediaProcessing(mediaId);
      }

      return mediaId;
    } catch (error) {
      LogError(`Failed to upload media to Twitter: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Wait for media processing to complete (for videos)
   */
  private async waitForMediaProcessing(mediaId: string, maxWaitTime: number = 60000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const response = await axios.get(`${this.uploadApiUrl}/media/upload.json`, {
        params: {
          command: 'STATUS',
          media_id: mediaId,
        },
        headers: {
          Authorization: `Bearer ${this.getAccessToken()}`,
        },
      });

      const { processing_info } = response.data;

      if (!processing_info) {
        // Processing complete
        return;
      }

      if (processing_info.state === 'succeeded') {
        return;
      }

      if (processing_info.state === 'failed') {
        throw new Error(`Media processing failed: ${processing_info.error?.message || 'Unknown error'}`);
      }

      // Wait before checking again
      const checkAfterSecs = processing_info.check_after_secs || 1;
      await new Promise((resolve) => setTimeout(resolve, checkAfterSecs * 1000));
    }

    throw new Error('Media processing timeout');
  }

  /**
   * Get media category based on MIME type
   */
  private getMediaCategory(mimeType: string): string {
    if (mimeType.startsWith('image/gif')) {
      return 'tweet_gif';
    } else if (mimeType.startsWith('image/')) {
      return 'tweet_image';
    } else if (mimeType.startsWith('video/')) {
      return 'tweet_video';
    }
    return 'tweet_image';
  }

  /**
   * Validate media file meets Twitter requirements
   */
  protected validateMediaFile(file: MediaFile): void {
    const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];

    if (!supportedTypes.includes(file.mimeType)) {
      throw new Error(`Unsupported media type: ${file.mimeType}. Supported types: ${supportedTypes.join(', ')}`);
    }

    // Twitter media size limits
    let maxSize: number;
    if (file.mimeType === 'image/gif') {
      maxSize = 15 * 1024 * 1024; // 15MB for GIFs
    } else if (file.mimeType.startsWith('image/')) {
      maxSize = 5 * 1024 * 1024; // 5MB for images
    } else if (file.mimeType.startsWith('video/')) {
      maxSize = 512 * 1024 * 1024; // 512MB for videos
    } else {
      maxSize = 5 * 1024 * 1024; // Default 5MB
    }

    if (file.size > maxSize) {
      throw new Error(`File size exceeds limit. Max: ${maxSize / 1024 / 1024}MB, Got: ${file.size / 1024 / 1024}MB`);
    }
  }

  /**
   * Create a tweet
   */
  protected async createTweet(tweetData: CreateTweetData): Promise<Tweet> {
    try {
      const response = await this.axiosInstance.post('/tweets', tweetData);
      return response.data.data;
    } catch (error) {
      this.handleTwitterError(error as AxiosError);
    }
  }

  /**
   * Delete a tweet
   */
  protected async deleteTweet(tweetId: string): Promise<void> {
    try {
      await this.axiosInstance.delete(`/tweets/${tweetId}`);
    } catch (error) {
      this.handleTwitterError(error as AxiosError);
    }
  }

  /**
   * Get tweets with specified parameters
   */
  protected async getTweets(endpoint: string, params: Record<string, any> = {}): Promise<Tweet[]> {
    try {
      const defaultParams = {
        'tweet.fields': 'id,text,created_at,author_id,conversation_id,public_metrics,attachments,entities,referenced_tweets',
        'user.fields': 'id,name,username,profile_image_url',
        'media.fields': 'url,preview_image_url,type,width,height',
        expansions: 'author_id,attachments.media_keys,referenced_tweets.id',
        max_results: 100,
      };

      const response = await this.axiosInstance.get(endpoint, {
        params: { ...defaultParams, ...params },
      });

      return response.data.data || [];
    } catch (error) {
      LogError(`Failed to get tweets: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get paginated tweets
   */
  protected async getPaginatedTweets(endpoint: string, params: Record<string, any> = {}, maxResults?: number): Promise<Tweet[]> {
    const tweets: Tweet[] = [];
    let paginationToken: string | undefined;
    const limit = params.max_results || 100;

    while (true) {
      const response = await this.axiosInstance.get(endpoint, {
        params: {
          ...params,
          max_results: limit,
          ...(paginationToken && { pagination_token: paginationToken }),
        },
      });

      if (response.data.data && Array.isArray(response.data.data)) {
        tweets.push(...response.data.data);
      }

      // Check if we've reached max results
      if (maxResults && tweets.length >= maxResults) {
        return tweets.slice(0, maxResults);
      }

      // Check for more pages
      paginationToken = response.data.meta?.next_token;
      if (!paginationToken) {
        break;
      }
    }

    return tweets;
  }

  /**
   * Convert Twitter tweet to common format
   */
  protected normalizePost(tweet: Tweet): SocialPost {
    return {
      id: tweet.id,
      platform: 'Twitter',
      profileId: tweet.author_id || '',
      content: tweet.text,
      mediaUrls: tweet.attachments?.media_keys || [],
      publishedAt: new Date(tweet.created_at),
      analytics: tweet.public_metrics
        ? {
            impressions: tweet.public_metrics.impression_count || 0,
            engagements:
              (tweet.public_metrics.retweet_count || 0) +
              (tweet.public_metrics.reply_count || 0) +
              (tweet.public_metrics.like_count || 0) +
              (tweet.public_metrics.quote_count || 0),
            clicks: 0, // Not available in public metrics
            shares: tweet.public_metrics.retweet_count || 0,
            comments: tweet.public_metrics.reply_count || 0,
            likes: tweet.public_metrics.like_count || 0,
            reach: tweet.public_metrics.impression_count || 0,
            platformMetrics: tweet.public_metrics,
          }
        : undefined,
      platformSpecificData: {
        conversationId: tweet.conversation_id,
        referencedTweets: tweet.referenced_tweets,
        entities: tweet.entities,
      },
    };
  }

  /**
   * Normalize Twitter analytics to common format
   */
  protected normalizeAnalytics(twitterMetrics: TwitterMetrics): SocialAnalytics {
    return {
      impressions: twitterMetrics.impression_count || 0,
      engagements: twitterMetrics.engagement_count || 0,
      clicks: twitterMetrics.url_link_clicks || 0,
      shares: twitterMetrics.retweet_count || 0,
      comments: twitterMetrics.reply_count || 0,
      likes: twitterMetrics.like_count || 0,
      reach: twitterMetrics.impression_count || 0,
      videoViews: twitterMetrics.video_view_count,
      platformMetrics: twitterMetrics,
    };
  }

  /**
   * Search for tweets - implemented in search action
   */
  protected async searchPosts(params: SearchParams): Promise<SocialPost[]> {
    // This is implemented in the search-tweets.action.ts
    throw new Error('Search posts is implemented in TwitterSearchTweetsAction');
  }

  /**
   * Handle Twitter-specific errors
   */
  protected handleTwitterError(error: AxiosError): never {
    if (error.response) {
      const { status, data } = error.response;
      const errorData = data as any;

      switch (status) {
        case 400:
          throw new Error(`Bad Request: ${errorData.detail || errorData.message || 'Invalid request parameters'}`);
        case 401:
          throw new Error('Unauthorized: Invalid or expired access token');
        case 403:
          throw new Error('Forbidden: Insufficient permissions. Ensure the app has required Twitter scopes.');
        case 404:
          throw new Error('Not Found: Resource does not exist');
        case 429:
          throw new Error('Rate Limit Exceeded: Too many requests');
        case 500:
          throw new Error('Internal Server Error: Twitter service error');
        case 503:
          throw new Error('Service Unavailable: Twitter service temporarily unavailable');
        default:
          throw new Error(`Twitter API Error (${status}): ${errorData.detail || errorData.message || 'Unknown error'}`);
      }
    } else if (error.request) {
      throw new Error('Network Error: No response from Twitter');
    } else {
      throw new Error(`Request Error: ${error.message}`);
    }
  }

  /**
   * Parse Twitter-specific rate limit headers
   */
  protected parseRateLimitHeaders(headers: any): { remaining: number; reset: Date; limit: number } | null {
    const remaining = headers['x-rate-limit-remaining'];
    const reset = headers['x-rate-limit-reset'];
    const limit = headers['x-rate-limit-limit'];

    if (remaining !== undefined && reset && limit) {
      return {
        remaining: parseInt(remaining),
        reset: new Date(parseInt(reset) * 1000), // Unix timestamp to Date
        limit: parseInt(limit),
      };
    }

    return null;
  }

  /**
   * Build search query with operators
   */
  protected buildSearchQuery(params: SearchParams): string {
    const parts: string[] = [];

    if (params.query) {
      parts.push(params.query);
    }

    if (params.hashtags && params.hashtags.length > 0) {
      const hashtagQuery = params.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' OR ');
      parts.push(`(${hashtagQuery})`);
    }

    return parts.join(' ');
  }

  /**
   * Format date for Twitter API (RFC 3339)
   */
  protected formatTwitterDate(date: Date | string): string {
    if (typeof date === 'string') {
      date = new Date(date);
    }
    return date.toISOString();
  }
}

/**
 * Twitter-specific interfaces
 */
export interface TwitterUser {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  description?: string;
  created_at: string;
  verified?: boolean;
}

export interface CreateTweetData {
  text: string;
  media?: {
    media_ids: string[];
  };
  poll?: {
    options: string[];
    duration_minutes: number;
  };
  reply?: {
    in_reply_to_tweet_id: string;
  };
  quote_tweet_id?: string;
}

export interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author_id?: string;
  conversation_id?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    bookmark_count: number;
    impression_count: number;
  };
  attachments?: {
    media_keys?: string[];
    poll_ids?: string[];
  };
  entities?: {
    hashtags?: Array<{ start: number; end: number; tag: string }>;
    mentions?: Array<{ start: number; end: number; username: string }>;
    urls?: Array<{ start: number; end: number; url: string; expanded_url: string }>;
  };
  referenced_tweets?: Array<{
    type: 'retweeted' | 'quoted' | 'replied_to';
    id: string;
  }>;
}

export interface TwitterMetrics {
  impression_count: number;
  engagement_count: number;
  retweet_count: number;
  reply_count: number;
  like_count: number;
  quote_count: number;
  bookmark_count: number;
  url_link_clicks: number;
  user_profile_clicks: number;
  video_view_count?: number;
}

export interface TwitterSearchParams {
  query: string;
  start_time?: string;
  end_time?: string;
  max_results?: number;
  next_token?: string;
  since_id?: string;
  until_id?: string;
  sort_order?: 'recency' | 'relevancy';
}
