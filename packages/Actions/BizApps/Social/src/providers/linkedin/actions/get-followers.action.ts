import { RegisterClass } from '@memberjunction/global';
import { LinkedInBaseAction } from '../linkedin-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogStatus, LogError } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to get follower statistics for LinkedIn profiles and organizations
 */
@RegisterClass(BaseAction, 'LinkedInGetFollowersAction')
export class LinkedInGetFollowersAction extends LinkedInBaseAction {
  /**
   * Get follower statistics for personal profile or organization
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
      const entityType = this.getParamValue(Params, 'EntityType') || 'organization'; // 'personal' or 'organization'
      const organizationId = this.getParamValue(Params, 'OrganizationID');
      const includeGrowth = this.getParamValue(Params, 'IncludeGrowth') === true;
      const timeRange = this.getParamValue(Params, 'TimeRange'); // Optional: {start: Date, end: Date}

      let followerData: any = {};

      if (entityType === 'organization') {
        // Get organization follower statistics
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

        followerData = await this.getOrganizationFollowers(organizationUrn, includeGrowth, timeRange);
      } else {
        // Get personal profile follower statistics
        const userUrn = await this.getCurrentUserUrn();
        followerData = await this.getPersonalFollowers(userUrn);
      }

      // Update output parameters
      const outputParams = [...Params];
      const followersParam = outputParams.find((p) => p.Name === 'FollowerCount');
      if (followersParam) followersParam.Value = followerData.followerCount || 0;
      const statsParam = outputParams.find((p) => p.Name === 'FollowerStatistics');
      if (statsParam) statsParam.Value = followerData;

      return {
        Success: true,
        ResultCode: 'SUCCESS',
        Message: `Successfully retrieved follower statistics`,
        Params: outputParams,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      return {
        Success: false,
        ResultCode: 'ERROR',
        Message: `Failed to get followers: ${errorMessage}`,
        Params,
      };
    }
  }

  /**
   * Get organization follower statistics
   */
  private async getOrganizationFollowers(organizationUrn: string, includeGrowth: boolean, timeRange?: any): Promise<any> {
    try {
      const params: any = {
        q: 'organizationalEntity',
        organizationalEntity: organizationUrn,
      };

      // Add time range if specified for growth metrics
      if (includeGrowth && timeRange) {
        params.timeIntervals = `List((start:${new Date(timeRange.start).getTime()},end:${new Date(timeRange.end || Date.now()).getTime()}))`;
      }

      // Get follower statistics
      const response = await this.axiosInstance.get('/organizationalEntityFollowerStatistics', { params });

      const stats = response.data.elements?.[0] || {};

      const result: any = {
        followerCount: stats.followerCounts?.organicFollowerCount || 0,
        paidFollowerCount: stats.followerCounts?.paidFollowerCount || 0,
        totalFollowerCount: (stats.followerCounts?.organicFollowerCount || 0) + (stats.followerCounts?.paidFollowerCount || 0),
      };

      // Add growth metrics if requested
      if (includeGrowth && stats.followerGains) {
        result.followerGrowth = {
          organicGains: stats.followerGains.organicFollowerGains || 0,
          paidGains: stats.followerGains.paidFollowerGains || 0,
          totalGains: (stats.followerGains.organicFollowerGains || 0) + (stats.followerGains.paidFollowerGains || 0),
          timeRange: timeRange,
        };
      }

      // Get demographics if available
      try {
        const demographicsResponse = await this.axiosInstance.get('/organizationalEntityFollowerStatistics', {
          params: {
            q: 'organizationalEntity',
            organizationalEntity: organizationUrn,
            projection:
              '(followerCountsByAssociationType,followerCountsByFunction,followerCountsBySeniority,followerCountsByIndustry,followerCountsByRegion,followerCountsByCountry)',
          },
        });

        if (demographicsResponse.data.elements?.[0]) {
          const demographics = demographicsResponse.data.elements[0];
          result.demographics = {
            byFunction: demographics.followerCountsByFunction || [],
            bySeniority: demographics.followerCountsBySeniority || [],
            byIndustry: demographics.followerCountsByIndustry || [],
            byRegion: demographics.followerCountsByRegion || [],
            byCountry: demographics.followerCountsByCountry || [],
          };
        }
      } catch (error) {
        LogError(`Failed to get follower demographics: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      return result;
    } catch (error) {
      LogError(`Failed to get organization followers: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get personal profile follower statistics
   * Note: LinkedIn provides limited follower data for personal profiles
   */
  private async getPersonalFollowers(userUrn: string): Promise<any> {
    try {
      // Get basic profile information including follower count
      const response = await this.axiosInstance.get('/me', {
        params: {
          projection: '(id,firstName,lastName,headline,publicProfileUrl,followerCount)',
        },
      });

      return {
        followerCount: response.data.followerCount || 0,
        profileInfo: {
          name: `${response.data.firstName?.localized?.en_US || ''} ${response.data.lastName?.localized?.en_US || ''}`.trim(),
          headline: response.data.headline?.localized?.en_US || '',
          profileUrl: response.data.publicProfileUrl || '',
        },
        note: 'LinkedIn API provides limited follower statistics for personal profiles',
      };
    } catch (error) {
      LogError(`Failed to get personal followers: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Fallback: return basic info
      return {
        followerCount: 0,
        note: 'Unable to retrieve follower count for personal profile',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    return [
      ...this.commonSocialParams,
      {
        Name: 'EntityType',
        Type: 'Input',
        Value: 'organization', // 'personal' or 'organization'
      },
      {
        Name: 'OrganizationID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'IncludeGrowth',
        Type: 'Input',
        Value: false,
      },
      {
        Name: 'TimeRange',
        Type: 'Input',
        Value: null, // Optional: {start: Date, end: Date}
      },
      {
        Name: 'FollowerCount',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'FollowerStatistics',
        Type: 'Output',
        Value: null,
      },
    ];
  }

  /**
   * Get action description
   */
  public get Description(): string {
    return 'Retrieves follower statistics for LinkedIn personal profiles or organization pages, including demographics and growth metrics where available';
  }
}
