import { RegisterClass } from '@memberjunction/global';
import { LinkedInBaseAction, LinkedInAnalytics } from '../linkedin-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/global';
import { SocialAnalytics } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to get analytics for a LinkedIn post
 */
@RegisterClass(BaseAction, 'LinkedInGetPostAnalyticsAction')
export class LinkedInGetPostAnalyticsAction extends LinkedInBaseAction {
  /**
   * Get analytics for a specific LinkedIn post
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
      const postId = this.getParamValue(Params, 'PostID');
      const authorType = this.getParamValue(Params, 'AuthorType') || 'organization'; // 'personal' or 'organization'
      const organizationId = this.getParamValue(Params, 'OrganizationID');
      const timeRange = this.getParamValue(Params, 'TimeRange'); // Optional: {start: Date, end: Date}

      // Validate required parameters
      if (!postId) {
        throw new Error('PostID is required');
      }

      let analytics: LinkedInAnalytics | null = null;

      if (authorType === 'organization') {
        // Get organization analytics
        let organizationUrn: string;
        if (!organizationId) {
          // Get first admin organization if not specified
          const orgs = await this.getAdminOrganizations();
          if (orgs.length === 0) {
            throw new Error('No organizations found. Please specify OrganizationID.');
          }
          organizationUrn = orgs[0].urn;
          LogStatus(`Using organization: ${orgs[0].name}`);
        } else {
          organizationUrn = `urn:li:organization:${organizationId}`;
        }

        analytics = await this.getOrganizationPostAnalytics(postId, organizationUrn, timeRange);
      } else {
        // Get personal post analytics (limited)
        analytics = await this.getPersonalPostAnalytics(postId);
      }

      if (!analytics) {
        throw new Error('No analytics data available for this post');
      }

      // Normalize analytics
      const normalizedAnalytics = this.normalizeAnalytics(analytics);

      // Update output parameters
      const outputParams = [...Params];
      const analyticsParam = outputParams.find((p) => p.Name === 'Analytics');
      if (analyticsParam) analyticsParam.Value = normalizedAnalytics;
      const rawAnalyticsParam = outputParams.find((p) => p.Name === 'RawAnalytics');
      if (rawAnalyticsParam) rawAnalyticsParam.Value = analytics;

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Successfully retrieved analytics for post ${postId}`,
        Params: outputParams,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        Success: false,
        ResultCode: 'ERROR',
        Message: `Failed to get post analytics: ${errorMessage}`,
        Params,
      };
    }
  }

  /**
   * Get analytics for an organization post
   */
  private async getOrganizationPostAnalytics(shareId: string, organizationUrn: string, timeRange?: any): Promise<LinkedInAnalytics> {
    try {
      const params: any = {
        q: 'organizationalEntity',
        organizationalEntity: organizationUrn,
        shares: `List(${shareId})`,
      };

      // Add time range if specified
      if (timeRange) {
        if (timeRange.start) {
          params.timeIntervals = `List((start:${new Date(timeRange.start).getTime()},end:${new Date(timeRange.end || Date.now()).getTime()}))`;
        }
      }

      const response = await this.axiosInstance.get('/organizationalEntityShareStatistics', { params });

      if (response.data.elements && response.data.elements.length > 0) {
        const stats = response.data.elements[0];
        return {
          totalShareStatistics: stats.totalShareStatistics || {},
          timeRange: timeRange
            ? {
                start: new Date(timeRange.start).getTime(),
                end: new Date(timeRange.end || Date.now()).getTime(),
              }
            : undefined,
        };
      }

      throw new Error('No analytics data found');
    } catch (error) {
      LogError(`Failed to get organization post analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get analytics for a personal post (limited data available)
   */
  private async getPersonalPostAnalytics(shareId: string): Promise<LinkedInAnalytics> {
    try {
      // For personal posts, we need to fetch the post itself to get basic engagement metrics
      const response = await this.axiosInstance.get(`/ugcPosts/${shareId}`);

      if (response.data) {
        // Extract available metrics from the post data
        return {
          totalShareStatistics: {
            impressionCount: 0, // Not available for personal posts
            clickCount: 0, // Not available for personal posts
            engagement: response.data.likesSummary?.totalLikes || 0 + response.data.commentsSummary?.totalComments || 0,
            likeCount: response.data.likesSummary?.totalLikes || 0,
            commentCount: response.data.commentsSummary?.totalComments || 0,
            shareCount: 0, // Not directly available
            uniqueImpressionsCount: 0, // Not available for personal posts
          },
        };
      }

      throw new Error('Post not found');
    } catch (error) {
      LogError(`Failed to get personal post analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    return [
      ...this.commonSocialParams,
      {
        Name: 'PostID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'AuthorType',
        Type: 'Input',
        Value: 'organization', // 'personal' or 'organization'
      },
      {
        Name: 'OrganizationID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'TimeRange',
        Type: 'Input',
        Value: null, // Optional: {start: Date, end: Date}
      },
      {
        Name: 'Analytics',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'RawAnalytics',
        Type: 'Output',
        Value: null,
      },
    ];
  }

  /**
   * Get action description
   */
  public get Description(): string {
    return 'Retrieves detailed analytics for a LinkedIn post (organization posts have more detailed analytics than personal posts)';
  }
}
