import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { GetUserEnrollmentsParams, GetUserEnrollmentsResult, FormattedEnrollment, EnrollmentsSummary } from '../interfaces';

/**
 * Raw API shape for a single enrollment from LearnWorlds
 */
interface LWApiEnrollmentData {
  id?: string;
  course_id?: string;
  enrolled_at?: string;
  created_at?: string;
  starts_at?: string;
  expires_at?: string;
  status?: string;
  progress_percentage?: number;
  completed_units?: number;
  total_units?: number;
  completed_lessons?: number;
  total_lessons?: number;
  last_accessed_at?: string;
  total_time_spent?: number;
  grade?: number;
  certificate_eligible?: boolean;
  certificate_issued_at?: string;
  completed_at?: string;
}

/**
 * Raw API shape for course details looked up per enrollment
 */
interface LWApiCourseBasic {
  id?: string;
  title?: string;
  short_description?: string;
  description?: string;
  image_url?: string;
  level?: string;
  duration?: number;
  instructor_name?: string;
  certificate_enabled?: boolean;
}

/**
 * Action to retrieve all course enrollments for a specific user
 */
@RegisterClass(BaseAction, 'GetUserEnrollmentsAction')
export class GetUserEnrollmentsAction extends LearnWorldsBaseAction {
  /**
   * Metadata about this action
   */
  public get Description(): string {
    return 'Retrieves all course enrollments for a specific LearnWorlds user with detailed progress information';
  }

  /**
   * Typed public method for direct (non-framework) callers.
   * Sets company context, fetches enrollments, and returns a strongly-typed result.
   * Throws on error.
   */
  public async GetUserEnrollments(params: GetUserEnrollmentsParams, contextUser: UserInfo): Promise<GetUserEnrollmentsResult> {
    this.SetCompanyContext(params.CompanyID);

    const {
      UserID: userId,
      Status: status,
      IncludeExpired: includeExpired = false,
      IncludeCourseDetails: includeCourseDetails = true,
      SortBy: sortBy = 'enrolled_at',
      SortOrder: sortOrder = 'desc',
      MaxResults: maxResults = 100,
    } = params;

    if (!userId) {
      throw new Error('UserID is required');
    }

    const queryParams = this.buildEnrollmentQueryParams(status, includeExpired, sortBy, sortOrder, maxResults);

    const enrollmentsData = await this.makeLearnWorldsPaginatedRequest<LWApiEnrollmentData>(`users/${userId}/enrollments`, queryParams, contextUser);

    const enrollments = enrollmentsData || [];
    const formattedEnrollments = await this.formatEnrollments(enrollments, includeCourseDetails, contextUser);

    const summary = this.calculateEnrollmentSummary(userId, formattedEnrollments);

    return {
      Enrollments: formattedEnrollments,
      TotalCount: formattedEnrollments.length,
      Summary: summary,
    };
  }

  /**
   * Framework entry-point – thin wrapper around the typed public method.
   */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const typedParams = this.extractGetUserEnrollmentsParams(Params);
      const result = await this.GetUserEnrollments(typedParams, ContextUser);

      this.setOutputParam(Params, 'Enrollments', result.Enrollments);
      this.setOutputParam(Params, 'TotalCount', result.TotalCount);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult(`Retrieved ${result.TotalCount} enrollments for user`, Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error occurred';
      return this.buildErrorResult('ERROR', `Error retrieving enrollments: ${msg}`, Params);
    }
  }

  /**
   * Extract typed params from framework ActionParam[]
   */
  private extractGetUserEnrollmentsParams(params: ActionParam[]): GetUserEnrollmentsParams {
    return {
      CompanyID: this.getRequiredStringParam(params, 'CompanyID'),
      UserID: this.getRequiredStringParam(params, 'UserID'),
      Status: this.getOptionalStringParam(params, 'Status'),
      IncludeExpired: this.getOptionalBooleanParam(params, 'IncludeExpired', false),
      IncludeCourseDetails: this.getOptionalBooleanParam(params, 'IncludeCourseDetails', true),
      SortBy: this.getOptionalStringParam(params, 'SortBy') || 'enrolled_at',
      SortOrder: (this.getOptionalStringParam(params, 'SortOrder') || 'desc') as 'asc' | 'desc',
      MaxResults: this.getOptionalNumberParam(params, 'MaxResults', LearnWorldsBaseAction.LW_MAX_PAGE_SIZE),
    };
  }

  /**
   * Build query parameters for the enrollments API request
   */
  private buildEnrollmentQueryParams(
    status: string | undefined,
    includeExpired: boolean,
    sortBy: string,
    sortOrder: string,
    maxResults: number,
  ): Record<string, string | number | boolean> {
    const queryParams: Record<string, string | number | boolean> = {
      limit: Math.min(maxResults, LearnWorldsBaseAction.LW_MAX_PAGE_SIZE),
      sort: sortBy,
      order: sortOrder,
    };

    if (status) {
      queryParams.status = status;
    }

    if (!includeExpired) {
      queryParams.hide_expired = true;
    }

    return queryParams;
  }

  /**
   * Format all raw enrollments into typed FormattedEnrollment[].
   * When course details are requested, fetches all unique courses in parallel
   * and attaches results from a lookup map.
   */
  private async formatEnrollments(enrollments: LWApiEnrollmentData[], includeCourseDetails: boolean, contextUser: UserInfo): Promise<FormattedEnrollment[]> {
    // Build a course details map in one batch to avoid per-item API calls
    const courseDetailsMap = includeCourseDetails
      ? await this.fetchCourseDetailsBatch(enrollments, contextUser)
      : new Map<string, FormattedEnrollment['course']>();

    return enrollments.map((enrollment) => {
      const formatted = this.formatSingleEnrollment(enrollment);
      if (includeCourseDetails && enrollment.course_id) {
        formatted.course = courseDetailsMap.get(enrollment.course_id);
      }
      return formatted;
    });
  }

  /**
   * Fetch course details for all unique course IDs in parallel and return a lookup map.
   */
  private async fetchCourseDetailsBatch(enrollments: LWApiEnrollmentData[], contextUser: UserInfo): Promise<Map<string, FormattedEnrollment['course']>> {
    const uniqueCourseIds = [...new Set(enrollments.map((e) => e.course_id).filter((id): id is string => !!id))];

    const results = await Promise.all(uniqueCourseIds.map((courseId) => this.fetchCourseDetailsForEnrollment(courseId, contextUser)));

    const map = new Map<string, FormattedEnrollment['course']>();
    uniqueCourseIds.forEach((courseId, index) => {
      map.set(courseId, results[index]);
    });
    return map;
  }

  /**
   * Format a single raw enrollment to a FormattedEnrollment
   */
  private formatSingleEnrollment(enrollment: LWApiEnrollmentData): FormattedEnrollment {
    return {
      id: enrollment.id || '',
      courseId: enrollment.course_id || '',
      enrolledAt: enrollment.enrolled_at || enrollment.created_at,
      startsAt: enrollment.starts_at,
      expiresAt: enrollment.expires_at,
      status: enrollment.status || 'active',
      progress: {
        percentage: enrollment.progress_percentage || 0,
        completedUnits: enrollment.completed_units || 0,
        totalUnits: enrollment.total_units || 0,
        completedLessons: enrollment.completed_lessons || 0,
        totalLessons: enrollment.total_lessons || 0,
        lastAccessedAt: enrollment.last_accessed_at,
        totalTimeSpent: enrollment.total_time_spent || 0,
        totalTimeSpentText: this.formatDuration(enrollment.total_time_spent || 0),
      },
      grade: enrollment.grade,
      certificateEligible: enrollment.certificate_eligible || false,
      certificateIssuedAt: enrollment.certificate_issued_at,
      completedAt: enrollment.completed_at,
    };
  }

  /**
   * Fetch course details for a given enrollment's course ID
   */
  private async fetchCourseDetailsForEnrollment(courseId: string, contextUser: UserInfo): Promise<FormattedEnrollment['course']> {
    try {
      const course = await this.makeLearnWorldsRequest<LWApiCourseBasic>(`courses/${courseId}`, 'GET', undefined, contextUser);
      return {
        id: course.id || courseId,
        title: course.title || '',
        description: course.short_description || course.description,
        imageUrl: course.image_url,
        level: course.level,
        duration: course.duration,
        durationText: this.formatDuration(course.duration || 0),
        instructorName: course.instructor_name,
        certificateEnabled: course.certificate_enabled || false,
      };
    } catch (error) {
      console.warn(`Failed to get course details for ${courseId}:`, error);
      return undefined;
    }
  }

  /**
   * Calculate summary statistics from formatted enrollments
   */
  private calculateEnrollmentSummary(userId: string, formattedEnrollments: FormattedEnrollment[]): EnrollmentsSummary {
    const totalEnrollments = formattedEnrollments.length;
    const activeEnrollments = formattedEnrollments.filter((e) => e.status === 'active').length;
    const completedEnrollments = formattedEnrollments.filter((e) => e.progress.percentage >= 100 || e.completedAt).length;
    const expiredEnrollments = formattedEnrollments.filter((e) => e.status === 'expired').length;
    const averageProgress = totalEnrollments > 0 ? formattedEnrollments.reduce((sum, e) => sum + e.progress.percentage, 0) / totalEnrollments : 0;
    const totalTimeSpent = formattedEnrollments.reduce((sum, e) => sum + (e.progress.totalTimeSpent || 0), 0);
    const certificatesEarned = formattedEnrollments.filter((e) => e.certificateIssuedAt).length;

    return {
      userId,
      totalEnrollments,
      activeEnrollments,
      completedEnrollments,
      expiredEnrollments,
      inProgressEnrollments: activeEnrollments - completedEnrollments,
      averageProgressPercentage: Math.round(averageProgress * 100) / 100,
      totalTimeSpent,
      totalTimeSpentText: this.formatDuration(totalTimeSpent),
      certificatesEarned,
      enrollmentsByStatus: {
        active: activeEnrollments,
        completed: completedEnrollments,
        expired: expiredEnrollments,
      },
    };
  }

  /**
   * Define the parameters this action expects
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
        Name: 'Status',
        Type: 'Input',
        Value: null,
      },
      {
        Name: 'IncludeExpired',
        Type: 'Input',
        Value: false,
      },
      {
        Name: 'IncludeCourseDetails',
        Type: 'Input',
        Value: true,
      },
      {
        Name: 'SortBy',
        Type: 'Input',
        Value: 'enrolled_at',
      },
      {
        Name: 'SortOrder',
        Type: 'Input',
        Value: 'desc',
      },
      {
        Name: 'MaxResults',
        Type: 'Input',
        Value: 100,
      },
      {
        Name: 'Enrollments',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'TotalCount',
        Type: 'Output',
        Value: null,
      },
      {
        Name: 'Summary',
        Type: 'Output',
        Value: null,
      },
    ];
    return [...baseParams, ...specificParams];
  }
}
