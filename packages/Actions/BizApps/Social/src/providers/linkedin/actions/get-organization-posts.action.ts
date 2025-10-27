import { RegisterClass } from '@memberjunction/global';
import { LinkedInBaseAction } from '../linkedin-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/global';
import { SocialPost } from '../../../base/base-social.action';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to get posts from a LinkedIn organization page
 */
@RegisterClass(BaseAction, 'LinkedInGetOrganizationPostsAction')
export class LinkedInGetOrganizationPostsAction extends LinkedInBaseAction {
  /**
   * Get posts from a LinkedIn organization page
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
      const organizationId = this.getParamValue(Params, 'OrganizationID');
      const count = this.getParamValue(Params, 'Count') || 50;
      const startIndex = this.getParamValue(Params, 'StartIndex') || 0;
      const includeAnalytics = this.getParamValue(Params, 'IncludeAnalytics') === true;

      // Determine organization URN
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

      // Get posts
      LogStatus(`Fetching posts for organization...`);
      const shares = await this.getShares(organizationUrn, count, startIndex);

      // Convert to common format
      const posts: SocialPost[] = [];
      for (const share of shares) {
        const post = this.normalizePost(share);

        // Optionally fetch analytics
        if (includeAnalytics) {
          try {
            const analytics = await this.getPostAnalytics(share.id, organizationUrn);
            post.analytics = this.normalizeAnalytics(analytics);
          } catch (error) {
            LogError(`Failed to get analytics for post ${share.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        posts.push(post);
      }

      LogStatus(`Retrieved ${posts.length} posts`);

      // Update output parameters
      const outputParams = [...Params];
      const postsParam = outputParams.find((p) => p.Name === 'Posts');
      if (postsParam) postsParam.Value = posts;
      const totalCountParam = outputParams.find((p) => p.Name === 'TotalCount');
      if (totalCountParam) totalCountParam.Value = posts.length;

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Successfully retrieved ${posts.length} organization posts`,
        Params: outputParams,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        Success: false,
        ResultCode: 'ERROR',
        Message: `Failed to get organization posts: ${errorMessage}`,
        Params,
      };
    }
  }

  /**
   * Get analytics for a specific post
   */
  private async getPostAnalytics(shareId: string, organizationUrn: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get('/organizationalEntityShareStatistics', {
        params: {
          q: 'organizationalEntity',
          organizationalEntity: organizationUrn,
          shares: `List(${shareId})`,
        },
      });

      if (response.data.elements && response.data.elements.length > 0) {
        return response.data.elements[0];
      }

      return null;
    } catch (error) {
      LogError(`Failed to get post analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    return [
      ...this.commonSocialParams,
      {
        Name: 'OrganizationID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Count',
        Type: 'Input',
        Value: 50,
      },
      {
        Name: 'StartIndex',
        Type: 'Input',
        Value: 0,
      },
      {
        Name: 'IncludeAnalytics',
        Type: 'Input',
        Value: false,
      },
      {
        Name: 'Posts',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'TotalCount',
        Type: 'Output',
        Value: null,
      },
    ];
  }

  /**
   * Get action description
   */
  public get Description(): string {
    return 'Retrieves posts from a LinkedIn organization page with optional analytics data';
  }
}
