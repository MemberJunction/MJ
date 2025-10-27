import { RegisterClass } from '@memberjunction/global';
import { InstagramBaseAction } from '../instagram-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/global';
import { MediaFile } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Creates an Instagram Story with images or videos.
 * Stories are temporary content that disappears after 24 hours.
 * Supports stickers, links, and interactive elements.
 */
@RegisterClass(BaseAction, 'Instagram - Create Story')
export class InstagramCreateStoryAction extends InstagramBaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const companyIntegrationId = this.getParamValue(params.Params, 'CompanyIntegrationID');
      const mediaFile = this.getParamValue(params.Params, 'MediaFile') as MediaFile;
      const stickerType = this.getParamValue(params.Params, 'StickerType');
      const stickerData = this.getParamValue(params.Params, 'StickerData');
      const linkUrl = this.getParamValue(params.Params, 'LinkUrl');
      const linkText = this.getParamValue(params.Params, 'LinkText');
      const mentionedUsers = this.getParamValue(params.Params, 'MentionedUsers') as string[];
      const hashtags = this.getParamValue(params.Params, 'Hashtags') as string[];

      // Initialize OAuth
      if (!(await this.initializeOAuth(companyIntegrationId))) {
        return {
          Success: false,
          Message: 'Failed to initialize Instagram authentication',
          ResultCode: 'AUTH_FAILED',
        };
      }

      // Validate inputs
      if (!mediaFile) {
        return {
          Success: false,
          Message: 'MediaFile is required for stories',
          ResultCode: 'MISSING_MEDIA',
        };
      }

      // Validate media type and duration
      const validation = this.validateStoryMedia(mediaFile);
      if (!validation.isValid) {
        return {
          Success: false,
          Message: validation.message,
          ResultCode: 'INVALID_MEDIA',
        };
      }

      // Check if account can add links (requires 10k+ followers or verified)
      let canAddLink = false;
      if (linkUrl) {
        canAddLink = await this.checkLinkEligibility();
        if (!canAddLink) {
          LogError('Account not eligible for story links. Requires 10k+ followers or verification.');
        }
      }

      // Create story media container
      const storyParams: any = {
        media_type: 'STORIES',
        access_token: this.getAccessToken(),
      };

      // Add media URL
      if (mediaFile.mimeType.startsWith('image/')) {
        storyParams.image_url = await this.uploadStoryMediaToCDN(mediaFile);
      } else if (mediaFile.mimeType.startsWith('video/')) {
        storyParams.video_url = await this.uploadStoryMediaToCDN(mediaFile);
      }

      // Add stickers if specified
      if (stickerType && stickerData) {
        storyParams.sticker = this.formatSticker(stickerType, stickerData);
      }

      // Add mentions
      if (mentionedUsers && mentionedUsers.length > 0) {
        storyParams.user_tags = mentionedUsers.map((username, index) => ({
          username,
          x: 0.5, // Center horizontally
          y: 0.1 + index * 0.1, // Stack vertically
        }));
      }

      // Add hashtags
      if (hashtags && hashtags.length > 0) {
        storyParams.hashtags = hashtags.map((tag, index) => ({
          hashtag: tag.startsWith('#') ? tag : `#${tag}`,
          x: 0.5,
          y: 0.8 - index * 0.1,
        }));
      }

      // Create the story container
      const containerResponse = await this.makeInstagramRequest<{ id: string }>(
        `${this.instagramBusinessAccountId}/media`,
        'POST',
        storyParams
      );

      // Wait for processing
      await this.waitForMediaContainer(containerResponse.id);

      // Publish the story
      const publishParams: any = {
        creation_id: containerResponse.id,
        access_token: this.getAccessToken(),
      };

      // Add link if eligible and provided
      if (linkUrl && canAddLink) {
        publishParams.link = {
          url: linkUrl,
          text: linkText || 'See More',
        };
      }

      const publishResponse = await this.makeInstagramRequest<{ id: string }>(
        `${this.instagramBusinessAccountId}/media_publish`,
        'POST',
        publishParams
      );

      // Get story details
      const storyDetails = await this.getStoryDetails(publishResponse.id);

      // Store result in output params
      const outputParams = [...params.Params];
      outputParams.push({
        Name: 'StoryID',
        Type: 'Output',
        Value: publishResponse.id,
      });
      outputParams.push({
        Name: 'MediaType',
        Type: 'Output',
        Value: mediaFile.mimeType.startsWith('image/') ? 'IMAGE' : 'VIDEO',
      });
      outputParams.push({
        Name: 'ExpiresAt',
        Type: 'Output',
        Value: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      outputParams.push({
        Name: 'StoryData',
        Type: 'Output',
        Value: JSON.stringify({
          features: {
            hasSticker: !!stickerType,
            hasLink: linkUrl && canAddLink,
            hasMentions: mentionedUsers && mentionedUsers.length > 0,
            hasHashtags: hashtags && hashtags.length > 0,
          },
          insights: storyDetails.insights || {},
        }),
      });

      return {
        Success: true,
        Message: 'Instagram story created successfully',
        ResultCode: 'SUCCESS',
        Params: outputParams,
      };
    } catch (error: any) {
      LogError('Failed to create Instagram story', error);

      if (error.code === 'RATE_LIMIT') {
        return {
          Success: false,
          Message: 'Instagram API rate limit exceeded. Please try again later.',
          ResultCode: 'RATE_LIMIT',
        };
      }

      if (error.code === 'INVALID_MEDIA') {
        return {
          Success: false,
          Message: error.message,
          ResultCode: 'INVALID_MEDIA',
        };
      }

      return {
        Success: false,
        Message: `Failed to create story: ${error.message}`,
        ResultCode: 'ERROR',
      };
    }
  }

  /**
   * Validate story media requirements
   */
  private validateStoryMedia(mediaFile: MediaFile): { isValid: boolean; message?: string } {
    // Check file size (max 30MB for images, 100MB for videos)
    const maxSize = mediaFile.mimeType.startsWith('image/') ? 30 * 1024 * 1024 : 100 * 1024 * 1024;
    if (mediaFile.size > maxSize) {
      return {
        isValid: false,
        message: `File size exceeds limit. Max ${maxSize / (1024 * 1024)}MB`,
      };
    }

    // Check media type
    const supportedTypes = ['image/jpeg', 'image/png', 'video/mp4', 'video/mov'];
    if (!supportedTypes.includes(mediaFile.mimeType)) {
      return {
        isValid: false,
        message: `Unsupported media type. Supported: ${supportedTypes.join(', ')}`,
      };
    }

    // For videos, check duration (max 60 seconds for stories)
    // In a real implementation, you'd extract video metadata

    return { isValid: true };
  }

  /**
   * Check if account is eligible for story links
   */
  private async checkLinkEligibility(): Promise<boolean> {
    try {
      const accountInfo = await this.makeInstagramRequest<any>(this.instagramBusinessAccountId, 'GET', null, {
        fields: 'followers_count,is_verified',
        access_token: this.getAccessToken(),
      });

      return accountInfo.is_verified || accountInfo.followers_count >= 10000;
    } catch (error) {
      LogError('Failed to check link eligibility', error);
      return false;
    }
  }

  /**
   * Format sticker data based on type
   */
  private formatSticker(type: string, data: any): any {
    switch (type) {
      case 'location':
        return {
          type: 'location',
          location_id: data.locationId,
          x: data.x || 0.5,
          y: data.y || 0.5,
          width: data.width || 0.5,
          height: data.height || 0.1,
          rotation: data.rotation || 0,
        };

      case 'poll':
        return {
          type: 'poll',
          question: data.question,
          options: data.options || ['Yes', 'No'],
          x: data.x || 0.5,
          y: data.y || 0.5,
        };

      case 'question':
        return {
          type: 'question',
          question: data.question,
          text_color: data.textColor || '#FFFFFF',
          background_color: data.backgroundColor || '#000000',
          x: data.x || 0.5,
          y: data.y || 0.5,
        };

      case 'music':
        return {
          type: 'music',
          audio_asset_id: data.audioAssetId,
          display_type: data.displayType || 'default',
          x: data.x || 0.5,
          y: data.y || 0.5,
        };

      case 'countdown':
        return {
          type: 'countdown',
          end_time: data.endTime,
          text: data.text || 'Countdown',
          text_color: data.textColor || '#FFFFFF',
          x: data.x || 0.5,
          y: data.y || 0.5,
        };

      default:
        return null;
    }
  }

  /**
   * Get story details after publishing
   */
  private async getStoryDetails(storyId: string): Promise<any> {
    try {
      const response = await this.makeInstagramRequest(storyId, 'GET', null, {
        fields: 'id,media_type,permalink,timestamp',
        access_token: this.getAccessToken(),
      });

      // Try to get initial insights (may not be immediately available)
      try {
        const insights = await this.getInsights(storyId, ['impressions', 'reach', 'exits', 'replies'], 'lifetime');
        response.insights = this.parseStoryInsights(insights);
      } catch (insightError) {
        // Insights might not be available immediately
        response.insights = null;
      }

      return response;
    } catch (error) {
      LogError('Failed to get story details', error);
      return { id: storyId };
    }
  }

  /**
   * Parse story-specific insights
   */
  private parseStoryInsights(insights: any[]): any {
    const parsed: any = {};

    insights.forEach((metric) => {
      if (metric.values && metric.values.length > 0) {
        parsed[metric.name] = metric.values[0].value || 0;
      }
    });

    return parsed;
  }

  /**
   * Upload story media to CDN (placeholder implementation)
   */
  private async uploadStoryMediaToCDN(file: MediaFile): Promise<string> {
    // In a real implementation, this would upload to a CDN
    // For now, throw an error indicating this needs implementation
    throw new Error('Media CDN upload not implemented. Instagram requires media to be hosted at a public URL.');
  }

  /**
   * Define the parameters for this action
   */
  public get Params(): ActionParam[] {
    return [
      ...this.commonSocialParams,
      {
        Name: 'MediaFile',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'StickerType',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'StickerData',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'LinkUrl',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'LinkText',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'MentionedUsers',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Hashtags',
        Type: 'Input',
        Value: null,
      },
    ];
  }

  /**
   * Get the description for this action
   */
  public get Description(): string {
    return 'Creates an Instagram Story with support for stickers, links, mentions, and interactive elements. Stories disappear after 24 hours.';
  }
}
