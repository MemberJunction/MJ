import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { GetUsersParams, GetUsersResult, UsersSummary, LearnWorldsUser, LWApiUser } from '../interfaces';

/**
 * Action to retrieve users from LearnWorlds LMS
 */
@RegisterClass(BaseAction, 'GetLearnWorldsUsersAction')
export class GetLearnWorldsUsersAction extends LearnWorldsBaseAction {
  /**
   * Description of the action
   */
  public get Description(): string {
    return 'Retrieves users (students, instructors, admins) from LearnWorlds LMS with filtering and search options';
  }

  /**
   * Typed public method for direct (non-framework) callers.
   * Throws on failure.
   */
  public async GetUsers(params: GetUsersParams, contextUser: UserInfo): Promise<GetUsersResult> {
    this.SetCompanyContext(params.CompanyID);

    // Build query parameters
    const queryParams: Record<string, string | number | boolean> = {};

    if (params.SearchText) {
      queryParams.search = params.SearchText;
    }
    if (params.Role) {
      queryParams.role = params.Role;
    }
    if (params.Status) {
      queryParams.status = params.Status;
    }
    if (params.Tags) {
      queryParams.tags = params.Tags;
    }
    if (params.CreatedAfter) {
      queryParams.created_after = this.formatLearnWorldsDate(new Date(params.CreatedAfter));
    }
    if (params.CreatedBefore) {
      queryParams.created_before = this.formatLearnWorldsDate(new Date(params.CreatedBefore));
    }

    // Sorting
    const sortBy = params.SortBy || 'created';
    const sortOrder = params.SortOrder || 'desc';
    queryParams.sort = `${sortOrder === 'asc' ? '' : '-'}${sortBy}`;

    // Include course stats
    if (params.IncludeCourseStats) {
      queryParams.include = 'course_stats';
    }

    // Limit for pagination
    const maxResults = params.MaxResults || 100;
    queryParams.limit = Math.min(maxResults, 100); // LearnWorlds max is usually 100

    // Make the API request
    const users = await this.makeLearnWorldsPaginatedRequest<LWApiUser>('users', queryParams, contextUser);

    // Map to our interface
    const mappedUsers: LearnWorldsUser[] = users.map((user) => this.mapLearnWorldsUser(user));

    // Calculate summary
    const summary = this.calculateUserSummary(mappedUsers);

    return {
      Users: mappedUsers,
      TotalCount: mappedUsers.length,
      Summary: summary,
    };
  }

  /**
   * Framework entry point -- delegates to the typed public method.
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      if (!ContextUser) {
        return this.buildErrorResult('ERROR', 'Context user is required for LearnWorlds API calls', Params);
      }

      const typedParams = this.extractGetUsersParams(Params);
      const result = await this.GetUsers(typedParams, ContextUser);

      this.setOutputParam(Params, 'Users', result.Users);
      this.setOutputParam(Params, 'TotalCount', result.TotalCount);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult(`Successfully retrieved ${result.TotalCount} users from LearnWorlds`, Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', msg, Params);
    }
  }

  /**
   * Extract typed params from the generic ActionParam array
   */
  private extractGetUsersParams(params: ActionParam[]): GetUsersParams {
    return {
      CompanyID: this.getRequiredStringParam(params, 'CompanyID'),
      SearchText: this.getOptionalStringParam(params, 'SearchText'),
      Role: this.getOptionalStringParam(params, 'Role'),
      Status: this.getOptionalStringParam(params, 'Status'),
      Tags: this.getOptionalStringParam(params, 'Tags'),
      CreatedAfter: this.getOptionalStringParam(params, 'CreatedAfter'),
      CreatedBefore: this.getOptionalStringParam(params, 'CreatedBefore'),
      SortBy: this.getOptionalStringParam(params, 'SortBy') || 'created',
      SortOrder: (this.getOptionalStringParam(params, 'SortOrder') || 'desc') as 'asc' | 'desc',
      IncludeCourseStats: this.getOptionalBooleanParam(params, 'IncludeCourseStats', false),
      MaxResults: this.getOptionalNumberParam(params, 'MaxResults', LearnWorldsBaseAction.LW_MAX_PAGE_SIZE),
    };
  }

  /**
   * Map a raw LearnWorlds API user to our typed interface
   */
  private mapLearnWorldsUser(lwUser: LWApiUser): LearnWorldsUser {
    return {
      id: lwUser.id || lwUser._id || '',
      email: lwUser.email,
      username: lwUser.username || lwUser.email,
      firstName: lwUser.first_name,
      lastName: lwUser.last_name,
      fullName: lwUser.full_name || `${lwUser.first_name || ''} ${lwUser.last_name || ''}`.trim(),
      status: this.mapUserStatus(lwUser.status || 'active'),
      role: lwUser.role || 'student',
      createdAt: this.parseLearnWorldsDate(lwUser.created || lwUser.created_at || ''),
      lastLoginAt: lwUser.last_login ? this.parseLearnWorldsDate(lwUser.last_login) : undefined,
      tags: lwUser.tags || [],
      customFields: lwUser.custom_fields || {},
      totalCourses: lwUser.course_stats?.total || 0,
      completedCourses: lwUser.course_stats?.completed || 0,
      inProgressCourses: lwUser.course_stats?.in_progress || 0,
      totalTimeSpent: lwUser.course_stats?.total_time_spent || 0,
      avatarUrl: lwUser.avatar_url,
      bio: lwUser.bio,
      location: lwUser.location,
      timezone: lwUser.timezone,
    };
  }

  /**
   * Calculate summary statistics from the mapped user list
   */
  private calculateUserSummary(users: LearnWorldsUser[]): UsersSummary {
    const usersByRole: Record<string, number> = {};
    let totalTimeSpent = 0;

    users.forEach((user) => {
      usersByRole[user.role] = (usersByRole[user.role] || 0) + 1;
      totalTimeSpent += user.totalTimeSpent || 0;
    });

    let averageCoursesPerUser = 0;
    if (users.length > 0) {
      const totalCourses = users.reduce((sum, u) => sum + (u.totalCourses || 0), 0);
      averageCoursesPerUser = totalCourses / users.length;
    }

    // Find most active users (by completed courses)
    const mostActiveUsers: Array<{ id: string; name: string; completedCourses?: number }> = users
      .filter((u) => u.completedCourses && u.completedCourses > 0)
      .sort((a, b) => (b.completedCourses || 0) - (a.completedCourses || 0))
      .slice(0, 5)
      .map((u) => ({
        id: u.id,
        name: u.fullName || u.email,
        completedCourses: u.completedCourses,
      }));

    // Find recent signups (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSignups: Array<{ id: string; name: string; signupDate: Date }> = users
      .filter((u) => u.createdAt > thirtyDaysAgo)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map((u) => ({
        id: u.id,
        name: u.fullName || u.email,
        signupDate: u.createdAt,
      }));

    return {
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.status === 'active').length,
      inactiveUsers: users.filter((u) => u.status === 'inactive').length,
      suspendedUsers: users.filter((u) => u.status === 'suspended').length,
      usersByRole,
      averageCoursesPerUser,
      totalTimeSpent,
      mostActiveUsers,
      recentSignups,
    };
  }

  /**
   * Define the parameters for this action
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();

    const specificParams: ActionParam[] = [
      {
        Name: 'SearchText',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Role',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Status',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'Tags',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'CreatedAfter',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'CreatedBefore',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'SortBy',
        Type: 'Input',
        Value: 'created',
      },
      {
        Name: 'SortOrder',
        Type: 'Input',
        Value: 'desc',
      },
      {
        Name: 'IncludeCourseStats',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'MaxResults',
        Type: 'Input',
        Value: 100,
      },
    ];

    return [...baseParams, ...specificParams];
  }
}
