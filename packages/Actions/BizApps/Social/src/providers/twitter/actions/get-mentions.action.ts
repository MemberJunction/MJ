import { RegisterClass } from '@memberjunction/global';
import { TwitterBaseAction, Tweet } from '../twitter-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/global';
import { SocialPost } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to get mentions (tweets that mention the authenticated user) from Twitter/X
 */
@RegisterClass(BaseAction, 'TwitterGetMentionsAction')
export class TwitterGetMentionsAction extends TwitterBaseAction {
  /**
   * Get mentions from Twitter
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;

    try {
      // Initialize OAuth
      const companyIntegrationId = this.getParamValue(Params, 'CompanyIntegrationID');
      if (!(await this.initializeOAuth(companyIntegrationId))) {
        throw new Error('Failed to initialize OAuth connection');
      }

      // Extract parameters
      const maxResults = this.getParamValue(Params, 'MaxResults') || 100;
      const startTime = this.getParamValue(Params, 'StartTime');
      const endTime = this.getParamValue(Params, 'EndTime');
      const sinceId = this.getParamValue(Params, 'SinceID');
      const untilId = this.getParamValue(Params, 'UntilID');
      const includeRetweets = this.getParamValue(Params, 'IncludeRetweets') !== false; // Default true

      // Get current user info
      const currentUser = await this.getCurrentUser();

      // Build query parameters
      const queryParams: Record<string, any> = {
        'tweet.fields':
          'id,text,created_at,author_id,conversation_id,public_metrics,attachments,entities,referenced_tweets,in_reply_to_user_id',
        'user.fields': 'id,name,username,profile_image_url,description,created_at,verified',
        'media.fields': 'url,preview_image_url,type,width,height',
        expansions: 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id,in_reply_to_user_id',
        max_results: Math.min(maxResults, 100), // API limit per request
      };

      // Add time-based filters if provided
      if (startTime) {
        queryParams['start_time'] = this.formatTwitterDate(startTime);
      }
      if (endTime) {
        queryParams['end_time'] = this.formatTwitterDate(endTime);
      }
      if (sinceId) {
        queryParams['since_id'] = sinceId;
      }
      if (untilId) {
        queryParams['until_id'] = untilId;
      }

      // Get mentions using the mentions timeline endpoint
      const endpoint = `/users/${currentUser.id}/mentions`;

      LogStatus(`Getting mentions for @${currentUser.username}...`);
      const mentions = await this.getPaginatedTweets(endpoint, queryParams, maxResults);

      // Filter out retweets if requested
      let filteredMentions = mentions;
      if (!includeRetweets) {
        filteredMentions = mentions.filter(
          (tweet) => !tweet.referenced_tweets || !tweet.referenced_tweets.some((ref) => ref.type === 'retweeted')
        );
      }

      // Convert to normalized format
      const normalizedPosts: SocialPost[] = filteredMentions.map((tweet) => this.normalizePost(tweet));

      // Group mentions by type
      const mentionTypes = {
        directMentions: 0,
        replies: 0,
        retweets: 0,
        quotes: 0,
      };

      filteredMentions.forEach((tweet) => {
        if (tweet.referenced_tweets) {
          const refTypes = tweet.referenced_tweets.map((ref) => ref.type);
          if (refTypes.includes('replied_to')) {
            mentionTypes.replies++;
          } else if (refTypes.includes('retweeted')) {
            mentionTypes.retweets++;
          } else if (refTypes.includes('quoted')) {
            mentionTypes.quotes++;
          }
        } else {
          mentionTypes.directMentions++;
        }
      });

      // Calculate engagement statistics
      const stats = {
        totalMentions: normalizedPosts.length,
        mentionTypes,
        totalEngagement: 0,
        averageEngagement: 0,
        topMentions: [] as any[],
      };

      // Calculate total engagement
      normalizedPosts.forEach((post) => {
        if (post.analytics) {
          stats.totalEngagement += post.analytics.engagements;
        }
      });

      // Calculate average engagement
      if (normalizedPosts.length > 0) {
        stats.averageEngagement = Math.round(stats.totalEngagement / normalizedPosts.length);
      }

      // Get top 5 mentions by engagement
      stats.topMentions = normalizedPosts
        .filter((post) => post.analytics)
        .sort((a, b) => (b.analytics?.engagements || 0) - (a.analytics?.engagements || 0))
        .slice(0, 5)
        .map((post) => ({
          id: post.id,
          content: post.content.substring(0, 100) + (post.content.length > 100 ? '...' : ''),
          engagement: post.analytics?.engagements,
          author: filteredMentions.find((t) => t.id === post.id)?.author_id,
        }));

      // Update output parameters
      const outputParams = [...Params];
      const postsParam = outputParams.find((p) => p.Name === 'Mentions');
      if (postsParam) postsParam.Value = normalizedPosts;
      const tweetsParam = outputParams.find((p) => p.Name === 'Tweets');
      if (tweetsParam) tweetsParam.Value = filteredMentions;
      const statsParam = outputParams.find((p) => p.Name === 'Statistics');
      if (statsParam) statsParam.Value = stats;

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Successfully retrieved ${normalizedPosts.length} mentions`,
        Params: outputParams,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        Success: false,
        ResultCode: this.getErrorCode(error),
        Message: `Failed to get mentions: ${errorMessage}`,
        Params,
      };
    }
  }

  /**
   * Get error code based on error type
   */
  private getErrorCode(error: any): string {
    if (error instanceof Error) {
      if (error.message.includes('Rate Limit')) return 'RATE_LIMIT';
      if (error.message.includes('Unauthorized')) return 'INVALID_TOKEN';
      if (error.message.includes('Forbidden')) return 'INSUFFICIENT_PERMISSIONS';
    }
    return 'ERROR';
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    return [
      ...this.commonSocialParams,
      {
        Name: 'MaxResults',
        Type: 'Input',
        Value: 100,
      },
      {
        Name: 'StartTime',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'EndTime',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'SinceID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'UntilID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'IncludeRetweets',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'Mentions',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'Tweets',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'Statistics',
        Type: 'Output',
        Value: null,
      },
    ];
  }

  /**
   * Get action description
   */
  public get Description(): string {
    return 'Gets tweets that mention the authenticated user on Twitter/X with engagement statistics and filtering options';
  }
}
