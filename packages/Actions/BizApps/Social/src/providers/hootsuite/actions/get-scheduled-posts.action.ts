import { RegisterClass } from '@memberjunction/global';
import { HootSuiteBaseAction, HootSuitePost } from '../hootsuite-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/global';
import { SocialPost } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve scheduled posts from HootSuite
 */
@RegisterClass(BaseAction, 'HootSuiteGetScheduledPostsAction')
export class HootSuiteGetScheduledPostsAction extends HootSuiteBaseAction {
  /**
   * Get scheduled posts from HootSuite
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
      const profileId = this.getParamValue(Params, 'ProfileID');
      const startDate = this.getParamValue(Params, 'StartDate');
      const endDate = this.getParamValue(Params, 'EndDate');
      const limit = this.getParamValue(Params, 'Limit') || 100;
      const includeAnalytics = this.getParamValue(Params, 'IncludeAnalytics') || false;

      // Build query parameters
      const queryParams: any = {
        state: 'SCHEDULED',
        limit: Math.min(limit, 100),
        maxResults: limit,
      };

      if (profileId) {
        queryParams.socialProfileIds = profileId;
      }

      if (startDate) {
        queryParams.scheduledAfter = this.formatHootSuiteDate(startDate);
      }

      if (endDate) {
        queryParams.scheduledBefore = this.formatHootSuiteDate(endDate);
      }

      // Get scheduled posts
      const posts = await this.makePaginatedRequest<HootSuitePost>('/messages', queryParams);

      // Convert to common format
      const normalizedPosts: SocialPost[] = await Promise.all(
        posts.map(async (post) => {
          const normalized = this.normalizePost(post);

          // Optionally include analytics
          if (includeAnalytics && post.state === 'PUBLISHED') {
            try {
              const analytics = await this.getPostAnalytics(post.id);
              normalized.analytics = this.normalizeAnalytics(analytics);
            } catch (error) {
              LogStatus(`Failed to get analytics for post ${post.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }

          return normalized;
        })
      );

      // Create summary
      const summary = {
        totalPosts: normalizedPosts.length,
        byProfile: this.groupByProfile(posts),
        byDate: this.groupByDate(normalizedPosts),
        dateRange: {
          start: startDate || 'Not specified',
          end: endDate || 'Not specified',
        },
      };

      // Update output parameters
      const outputParams = [...Params];
      const postsParam = outputParams.find((p) => p.Name === 'ScheduledPosts');
      if (postsParam) postsParam.Value = normalizedPosts;
      const summaryParam = outputParams.find((p) => p.Name === 'Summary');
      if (summaryParam) summaryParam.Value = summary;

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Retrieved ${normalizedPosts.length} scheduled posts`,
        Params: outputParams,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        Success: false,
        ResultCode: 'ERROR',
        Message: `Failed to get scheduled posts: ${errorMessage}`,
        Params,
      };
    }
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
        socialProfileIds: hootsuitePost.socialProfileIds,
      },
    };
  }

  /**
   * Get analytics for a specific post
   */
  private async getPostAnalytics(postId: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/analytics/posts/${postId}`);
      return response.data;
    } catch (error) {
      // Analytics might not be available for all posts
      return null;
    }
  }

  /**
   * Group posts by profile
   */
  private groupByProfile(posts: HootSuitePost[]): Record<string, number> {
    const groups: Record<string, number> = {};

    posts.forEach((post) => {
      post.socialProfileIds.forEach((profileId) => {
        groups[profileId] = (groups[profileId] || 0) + 1;
      });
    });

    return groups;
  }

  /**
   * Group posts by scheduled date
   */
  private groupByDate(posts: SocialPost[]): Record<string, number> {
    const groups: Record<string, number> = {};

    posts.forEach((post) => {
      if (post.scheduledFor) {
        const dateKey = post.scheduledFor.toISOString().split('T')[0];
        groups[dateKey] = (groups[dateKey] || 0) + 1;
      }
    });

    return groups;
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    return [
      ...this.commonSocialParams,
      {
        Name: 'StartDate',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'EndDate',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Limit',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'IncludeAnalytics',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'ScheduledPosts',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'Summary',
        Type: 'Output',
        Value: null,
      },
    ];
  }

  /**
   * Get action description
   */
  public get Description(): string {
    return 'Retrieves scheduled posts from HootSuite with optional date filtering and analytics';
  }
}
