import { BaseOAuthAction } from '@memberjunction/actions';
import { ActionParam } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/global';

/**
 * Common interfaces for social media actions
 */
export interface SocialPost {
  id: string;
  platform: string;
  profileId: string;
  content: string;
  mediaUrls: string[];
  publishedAt: Date;
  scheduledFor?: Date;
  analytics?: SocialAnalytics;
  platformSpecificData: Record<string, any>;
}

export interface SocialAnalytics {
  impressions: number;
  engagements: number;
  clicks: number;
  shares: number;
  comments: number;
  likes: number;
  reach: number;
  saves?: number;
  videoViews?: number;
  platformMetrics: Record<string, any>;
}

export interface SearchParams {
  query?: string;
  hashtags?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface MediaFile {
  filename: string;
  mimeType: string;
  data: Buffer | string; // Base64 or buffer
  size: number;
}

export enum SocialMediaErrorCode {
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  PLATFORM_ERROR = 'PLATFORM_ERROR',
  INVALID_MEDIA = 'INVALID_MEDIA',
  POST_NOT_FOUND = 'POST_NOT_FOUND',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
}

/**
 * Base class for all social media actions.
 * Provides common functionality for authentication, media handling,
 * analytics normalization, and rate limiting.
 */
export abstract class BaseSocialMediaAction extends BaseOAuthAction {
  /**
   * Common parameters for all social media actions
   */
  protected get commonSocialParams(): ActionParam[] {
    return [
      ...this.oauthParams,
      {
        Name: 'ProfileID',
        Type: 'Input',
        Value: null,
      },
    ];
  }

  /**
   * Get the platform name (e.g., 'Twitter', 'LinkedIn')
   */
  protected abstract get platformName(): string;

  /**
   * Get the API base URL for the platform
   */
  protected abstract get apiBaseUrl(): string;

  /**
   * Normalize platform-specific analytics to common format
   */
  protected normalizeAnalytics(platformData: any): SocialAnalytics {
    // Default implementation - override in platform-specific classes
    return {
      impressions: platformData.impressions || 0,
      engagements: platformData.engagements || 0,
      clicks: platformData.clicks || 0,
      shares: platformData.shares || 0,
      comments: platformData.comments || 0,
      likes: platformData.likes || 0,
      reach: platformData.reach || 0,
      saves: platformData.saves,
      videoViews: platformData.videoViews,
      platformMetrics: platformData,
    };
  }

  /**
   * Upload media files to the platform
   */
  protected async uploadMedia(files: MediaFile[]): Promise<string[]> {
    const uploadedUrls: string[] = [];

    for (const file of files) {
      // Validate file
      this.validateMediaFile(file);

      // Upload file (platform-specific implementation)
      const url = await this.uploadSingleMedia(file);
      uploadedUrls.push(url);
    }

    return uploadedUrls;
  }

  /**
   * Platform-specific media upload implementation
   */
  protected abstract uploadSingleMedia(file: MediaFile): Promise<string>;

  /**
   * Validate media file meets platform requirements
   */
  protected validateMediaFile(file: MediaFile): void {
    const maxSizes: Record<string, number> = {
      'image/jpeg': 5 * 1024 * 1024, // 5MB
      'image/png': 5 * 1024 * 1024, // 5MB
      'image/gif': 15 * 1024 * 1024, // 15MB
      'video/mp4': 512 * 1024 * 1024, // 512MB
    };

    const maxSize = maxSizes[file.mimeType];
    if (!maxSize) {
      throw new Error(`Unsupported media type: ${file.mimeType}`);
    }

    if (file.size > maxSize) {
      throw new Error(`File size exceeds limit. Max ${maxSize} bytes, got ${file.size} bytes`);
    }
  }

  /**
   * Handle rate limiting with exponential backoff
   */
  protected async handleRateLimit(retryAfter?: number): Promise<void> {
    const waitTime = retryAfter || 60; // Default to 60 seconds
    LogStatus(`Rate limit hit. Waiting ${waitTime} seconds...`);

    await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
  }

  /**
   * Search for posts on the platform
   */
  protected abstract searchPosts(params: SearchParams): Promise<SocialPost[]>;

  /**
   * Convert platform-specific post data to common format
   */
  protected abstract normalizePost(platformPost: any): SocialPost;

  /**
   * Parse rate limit headers from API response
   */
  protected parseRateLimitHeaders(headers: any): {
    remaining: number;
    reset: Date;
    limit: number;
  } | null {
    // Common header patterns across platforms
    const remaining = headers['x-rate-limit-remaining'] || headers['x-ratelimit-remaining'] || headers['rate-limit-remaining'];

    const reset = headers['x-rate-limit-reset'] || headers['x-ratelimit-reset'] || headers['rate-limit-reset'];

    const limit = headers['x-rate-limit-limit'] || headers['x-ratelimit-limit'] || headers['rate-limit-limit'];

    if (remaining !== undefined && reset && limit) {
      return {
        remaining: parseInt(remaining),
        reset: new Date(parseInt(reset) * 1000), // Usually Unix timestamp
        limit: parseInt(limit),
      };
    }

    return null;
  }

  /**
   * Build common API headers including authentication
   */
  protected buildHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('No access token available');
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...additionalHeaders,
    };
  }

  /**
   * Format date for API requests (ISO 8601)
   */
  protected formatDate(date: Date | string): string {
    if (typeof date === 'string') {
      date = new Date(date);
    }
    return date.toISOString();
  }

  /**
   * Parse date from API response
   */
  protected parseDate(dateString: string): Date {
    return new Date(dateString);
  }

  /**
   * Get profile ID from parameters or default from integration
   */
  protected getProfileId(params: any): string {
    return params.ProfileID || this.getCustomAttribute(1) || '';
  }

  /**
   * Log API request for debugging
   */
  protected logApiRequest(method: string, url: string, data?: any): void {
    LogStatus(`${this.platformName} API Request: ${method} ${url}`);
    if (data) {
      LogStatus(`Request Data: ${JSON.stringify(data, null, 2)}`);
    }
  }

  /**
   * Log API response for debugging
   */
  protected logApiResponse(response: any): void {
    LogStatus(`${this.platformName} API Response: ${JSON.stringify(response, null, 2)}`);
  }

  /**
   * Helper to get parameter value from params array
   */
  protected getParamValue(params: ActionParam[], paramName: string): any {
    const param = params.find((p) => p.Name === paramName);
    return param?.Value;
  }
}
