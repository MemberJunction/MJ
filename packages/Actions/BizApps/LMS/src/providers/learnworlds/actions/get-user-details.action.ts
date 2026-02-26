import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import {
  GetUserDetailsParams,
  GetUserDetailsResult,
  LearnWorldsUserDetailsFull,
  UserDetailEnrollment,
  LWApiUser,
  LWApiEnrollmentStatus,
  LWApiProgressData,
} from '../interfaces';

/**
 * Extended raw user shape returned by the LearnWorlds GET /users/{id} endpoint.
 * Includes fields beyond the basic LWApiUser.
 */
interface LWUserDetailsResponse extends LWApiUser {
  profile_image?: string;
  description?: string;
  country?: string;
  language?: string;
  phone?: string;
  last_activity?: string | number;
  certificates_count?: number;
  badges_count?: number;
  points?: number;
  level?: string;
  email_notifications?: boolean;
  two_factor_enabled?: boolean;
  agreed_to_terms?: boolean;
  marketing_consent?: boolean;
}

/**
 * Raw enrollment shape from the LearnWorlds GET /users/{id}/enrollments endpoint
 */
interface LWEnrollmentData extends LWApiEnrollmentStatus {
  course_id?: string;
  course?: { id?: string; title?: string };
  course_title?: string;
  enrolled_at?: string;
  created?: string;
  progress?: LWApiProgressData;
  completed_at?: string;
  expires_at?: string;
  last_accessed_at?: string;
  time_spent?: number;
  certificate_url?: string;
  grade?: number;
  final_grade?: number;
}

/**
 * Raw enrollments list response
 */
interface LWEnrollmentsListResponse {
  data?: LWEnrollmentData[];
}

/**
 * Raw stats response from the LearnWorlds stats endpoint
 */
interface LWStatsResponse {
  total_time_spent?: number;
  certificates_earned?: number;
  badges_earned?: number;
  points?: number;
}

/**
 * Action to retrieve detailed information about a specific LearnWorlds user
 */
@RegisterClass(BaseAction, 'GetLearnWorldsUserDetailsAction')
export class GetLearnWorldsUserDetailsAction extends LearnWorldsBaseAction {
  /**
   * Description of the action
   */
  public get Description(): string {
    return 'Retrieves comprehensive details about a specific user in LearnWorlds including profile, enrollments, progress, and achievements';
  }

  /**
   * Typed public method for direct (non-framework) callers.
   * Throws on failure.
   */
  public async GetUserDetails(params: GetUserDetailsParams, contextUser: UserInfo): Promise<GetUserDetailsResult> {
    this.SetCompanyContext(params.CompanyID);

    if (!params.UserID) {
      throw new Error('UserID parameter is required');
    }

    const includeEnrollments = params.IncludeEnrollments ?? true;
    const includeStats = params.IncludeStats ?? true;

    // Fetch the user from the API
    const userResponse = await this.makeLearnWorldsRequest<LWUserDetailsResponse>(`users/${params.UserID}`, 'GET', undefined, contextUser);

    // Map basic user details
    const userDetails = this.mapUserDetails(userResponse);

    // Get enrollments if requested
    if (includeEnrollments) {
      await this.loadEnrollments(userDetails, params.UserID, contextUser);
    }

    // Get additional stats if requested
    if (includeStats) {
      await this.loadStats(userDetails, params.UserID, contextUser);
    }

    // Build summary
    const summary = this.createUserSummary(userDetails);

    return {
      UserDetails: userDetails,
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

      const typedParams = this.extractGetUserDetailsParams(Params);
      const result = await this.GetUserDetails(typedParams, ContextUser);

      this.setOutputParam(Params, 'UserDetails', result.UserDetails);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult(`Successfully retrieved details for user ${result.UserDetails.email}`, Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', msg, Params);
    }
  }

  /**
   * Extract typed params from the generic ActionParam array
   */
  private extractGetUserDetailsParams(params: ActionParam[]): GetUserDetailsParams {
    return {
      CompanyID: this.getParamValue(params, 'CompanyID') as string,
      UserID: this.getParamValue(params, 'UserID') as string,
      IncludeEnrollments: (this.getParamValue(params, 'IncludeEnrollments') as boolean | undefined) ?? true,
      IncludeStats: (this.getParamValue(params, 'IncludeStats') as boolean | undefined) ?? true,
    };
  }

  /**
   * Map LearnWorlds user data to detailed interface
   */
  private mapUserDetails(lwUser: LWUserDetailsResponse): LearnWorldsUserDetailsFull {
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
      avatarUrl: lwUser.avatar_url || lwUser.profile_image,
      bio: lwUser.bio || lwUser.description,
      location: lwUser.location || lwUser.country,
      timezone: lwUser.timezone,
      language: lwUser.language || 'en',
      phone: lwUser.phone,
      tags: lwUser.tags || [],
      customFields: lwUser.custom_fields || {},

      // Initialize statistics (overwritten by enrollment / stats loading)
      totalCourses: 0,
      completedCourses: 0,
      inProgressCourses: 0,
      notStartedCourses: 0,
      totalTimeSpent: 0,
      averageCompletionRate: 0,
      lastActivityDate: lwUser.last_activity ? this.parseLearnWorldsDate(lwUser.last_activity) : undefined,

      // Achievement data
      totalCertificates: lwUser.certificates_count || 0,
      totalBadges: lwUser.badges_count || 0,
      points: lwUser.points || 0,
      level: lwUser.level,

      // Account settings
      emailNotifications: lwUser.email_notifications,
      twoFactorEnabled: lwUser.two_factor_enabled,
      agreedToTerms: lwUser.agreed_to_terms,
      marketingConsent: lwUser.marketing_consent,
    };
  }

  /**
   * Fetch and attach enrollment data to userDetails.
   */
  private async loadEnrollments(userDetails: LearnWorldsUserDetailsFull, userId: string, contextUser: UserInfo): Promise<void> {
    const enrollmentsResponse = await this.makeLearnWorldsRequest<LWEnrollmentsListResponse>(`users/${userId}/enrollments`, 'GET', undefined, contextUser);

    if (enrollmentsResponse.data) {
      userDetails.enrollments = enrollmentsResponse.data.map((e) => this.mapEnrollment(e));
      this.calculateEnrollmentStats(userDetails);
    }
  }

  /**
   * Fetch and merge additional stats into userDetails.
   */
  private async loadStats(userDetails: LearnWorldsUserDetailsFull, userId: string, contextUser: UserInfo): Promise<void> {
    try {
      const statsResponse = await this.makeLearnWorldsRequest<LWStatsResponse>(`users/${userId}/stats`, 'GET', undefined, contextUser);

      if (statsResponse) {
        this.mergeStatistics(userDetails, statsResponse);
      }
    } catch {
      // Stats endpoint might not be available for all plans
    }
  }

  /**
   * Map raw enrollment data to our typed UserDetailEnrollment
   */
  private mapEnrollment(enrollment: LWEnrollmentData): UserDetailEnrollment {
    const progress = this.calculateProgress(enrollment.progress || {});

    return {
      courseId: enrollment.course_id || enrollment.course?.id || '',
      courseTitle: enrollment.course_title || enrollment.course?.title || 'Unknown Course',
      enrolledAt: this.parseLearnWorldsDate(enrollment.enrolled_at || enrollment.created || ''),
      status: this.mapLearnWorldsEnrollmentStatus(enrollment),
      progress: progress.percentage,
      completedAt: enrollment.completed_at ? this.parseLearnWorldsDate(enrollment.completed_at) : undefined,
      expiresAt: enrollment.expires_at ? this.parseLearnWorldsDate(enrollment.expires_at) : undefined,
      lastAccessedAt: enrollment.last_accessed_at ? this.parseLearnWorldsDate(enrollment.last_accessed_at) : undefined,
      timeSpent: progress.timeSpent || enrollment.time_spent || 0,
      certificateUrl: enrollment.certificate_url,
      grade: enrollment.grade || enrollment.final_grade,
    };
  }

  /**
   * Calculate enrollment statistics and attach to userDetails
   */
  private calculateEnrollmentStats(userDetails: LearnWorldsUserDetailsFull): void {
    if (!userDetails.enrollments) return;

    userDetails.totalCourses = userDetails.enrollments.length;
    userDetails.completedCourses = userDetails.enrollments.filter((e) => e.status === 'completed').length;
    userDetails.inProgressCourses = userDetails.enrollments.filter((e) => e.status === 'active' && e.progress > 0 && e.progress < 100).length;
    userDetails.notStartedCourses = userDetails.enrollments.filter((e) => e.status === 'active' && e.progress === 0).length;

    // Calculate total time spent
    userDetails.totalTimeSpent = userDetails.enrollments.reduce((sum, e) => sum + e.timeSpent, 0);

    // Calculate average completion rate
    const activeEnrollments = userDetails.enrollments.filter((e) => e.status === 'active' || e.status === 'completed');
    if (activeEnrollments.length > 0) {
      const totalProgress = activeEnrollments.reduce((sum, e) => sum + e.progress, 0);
      userDetails.averageCompletionRate = Math.round(totalProgress / activeEnrollments.length);
    }
  }

  /**
   * Merge additional statistics from the stats endpoint
   */
  private mergeStatistics(userDetails: LearnWorldsUserDetailsFull, stats: LWStatsResponse): void {
    if (stats.total_time_spent) {
      userDetails.totalTimeSpent = stats.total_time_spent;
    }
    if (stats.certificates_earned !== undefined) {
      userDetails.totalCertificates = stats.certificates_earned;
    }
    if (stats.badges_earned !== undefined) {
      userDetails.totalBadges = stats.badges_earned;
    }
    if (stats.points !== undefined) {
      userDetails.points = stats.points;
    }
  }

  /**
   * Create a summary of user information
   */
  private createUserSummary(userDetails: LearnWorldsUserDetailsFull): Record<string, unknown> {
    const recentActivity = userDetails.enrollments
      ? userDetails.enrollments
          .filter((e) => e.lastAccessedAt)
          .sort((a, b) => (b.lastAccessedAt?.getTime() || 0) - (a.lastAccessedAt?.getTime() || 0))
          .slice(0, 5)
          .map((e) => ({
            courseTitle: e.courseTitle,
            progress: e.progress,
            lastAccessed: e.lastAccessedAt,
          }))
      : [];

    return {
      userId: userDetails.id,
      displayName: userDetails.fullName || userDetails.email,
      status: userDetails.status,
      role: userDetails.role,
      learningProgress: {
        totalCourses: userDetails.totalCourses,
        completedCourses: userDetails.completedCourses,
        inProgressCourses: userDetails.inProgressCourses,
        notStartedCourses: userDetails.notStartedCourses,
        averageCompletionRate: userDetails.averageCompletionRate,
        totalTimeSpent: this.formatDuration(userDetails.totalTimeSpent),
      },
      achievements: {
        certificates: userDetails.totalCertificates,
        badges: userDetails.totalBadges,
        points: userDetails.points,
        level: userDetails.level,
      },
      engagement: {
        accountAge: Math.floor((new Date().getTime() - userDetails.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
        lastLoginDaysAgo: userDetails.lastLoginAt ? Math.floor((new Date().getTime() - userDetails.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24)) : null,
        lastActivityDaysAgo: userDetails.lastActivityDate
          ? Math.floor((new Date().getTime() - userDetails.lastActivityDate.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      },
      recentActivity,
    };
  }

  /**
   * Define the parameters for this action
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();

    const specificParams: ActionParam[] = [
      {
        Name: 'UserID',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'IncludeEnrollments',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'IncludeStats',
        Type: 'Input',
        Value: true,
      },
    ];

    return [...baseParams, ...specificParams];
  }
}
