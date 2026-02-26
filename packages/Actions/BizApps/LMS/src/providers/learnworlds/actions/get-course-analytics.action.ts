import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import { GetCourseAnalyticsParams, GetCourseAnalyticsResult, CourseAnalyticsData } from '../interfaces';

// ----------------------------------------------------------------
// File-local interfaces for raw LearnWorlds API shapes
// ----------------------------------------------------------------

/** Raw analytics payload from the LearnWorlds analytics endpoint */
interface LWRawAnalyticsData {
  total_enrollments?: number;
  new_enrollments?: number;
  active_students?: number;
  enrollment_trend?: unknown[];
  average_progress?: number;
  completion_rate?: number;
  total_completions?: number;
  in_progress_count?: number;
  not_started_count?: number;
  dropout_rate?: number;
  average_time_spent?: number;
  total_time_spent?: number;
  average_session_duration?: number;
  last_activity_date?: string;
  daily_active_users?: unknown[];
  average_quiz_score?: number;
  pass_rate?: number;
  certificates_issued?: number;
  average_time_to_complete?: number;
}

/** Wrapper for the analytics API response */
interface LWAnalyticsApiResponse {
  success?: boolean;
  message?: string;
  data?: LWRawAnalyticsData;
}

/** Raw revenue data from the LearnWorlds revenue endpoint */
interface LWRawRevenueData {
  total_revenue?: number;
  currency?: string;
  average_order_value?: number;
  total_orders?: number;
  revenue_trend?: unknown[];
  top_markets?: unknown[];
}

/** Wrapper for the revenue API response */
interface LWRevenueApiResponse {
  success?: boolean;
  data?: LWRawRevenueData;
}

/** Raw module stats from the LearnWorlds module analytics endpoint */
interface LWRawModuleStat {
  id?: string;
  title?: string;
  completion_rate?: number;
  average_progress?: number;
  average_time_spent?: number;
  students_started?: number;
  students_completed?: number;
  lessons?: LWRawLessonStat[];
}

/** Raw lesson stat nested inside a module */
interface LWRawLessonStat {
  id?: string;
  title?: string;
  completion_rate?: number;
  average_time_spent?: number;
  view_count?: number;
}

/** Wrapper for the module analytics response */
interface LWModuleStatsApiResponse {
  success?: boolean;
  data?: LWRawModuleStat[] | { data?: LWRawModuleStat[] };
}

/** Raw enrollment from the enrollments endpoint (for user breakdown) */
interface LWRawEnrollmentForBreakdown {
  progress_percentage?: number;
}

/** Wrapper for the enrollments response */
interface LWEnrollmentsApiResponse {
  success?: boolean;
  data?: LWRawEnrollmentForBreakdown[] | { data?: LWRawEnrollmentForBreakdown[] };
}

/** Formatted module stat (returned inside CourseAnalyticsData.moduleStats) */
interface FormattedModuleStat {
  moduleId: string;
  moduleTitle: string;
  completionRate: number;
  averageProgress: number;
  averageTimeSpent: number;
  averageTimeSpentText: string;
  studentsStarted: number;
  studentsCompleted: number;
  lessons: FormattedLessonStat[];
}

/** Formatted lesson stat nested inside a module */
interface FormattedLessonStat {
  lessonId: string;
  lessonTitle: string;
  completionRate: number;
  averageTimeSpent: number;
  viewCount: number;
}

/** Progress distribution buckets for user breakdown */
interface ProgressBuckets {
  notStarted: number;
  under25: number;
  between25And50: number;
  between50And75: number;
  between75And99: number;
  completed: number;
}

/** User breakdown result shape */
interface UserBreakdownResult {
  total: number;
  progressDistribution: ProgressBuckets;
  percentageDistribution: Record<string, string>;
}

/** Trend data point (used for growth / engagement calculations) */
interface TrendDataPoint {
  value?: number;
}

/** Summary produced alongside the analytics payload */
interface CourseAnalyticsSummary {
  courseId: string;
  period: { from: string; to: string };
  keyMetrics: {
    totalEnrollments: number;
    completionRate: number;
    averageProgress: number;
    activeStudents: number;
    averageTimeSpent: string;
    certificatesIssued: number;
  };
  trends: {
    enrollmentGrowth: string;
    engagementTrend: string;
    completionTrend: string;
  };
}

/**
 * Action to retrieve comprehensive analytics for a LearnWorlds course
 */
@RegisterClass(BaseAction, 'GetCourseAnalyticsAction')
export class GetCourseAnalyticsAction extends LearnWorldsBaseAction {
  // ----------------------------------------------------------------
  // Typed public method – can be called directly from code
  // ----------------------------------------------------------------

  /**
   * Get course performance analytics.
   * Throws on any error.
   */
  public async GetCourseAnalytics(params: GetCourseAnalyticsParams, contextUser: UserInfo): Promise<GetCourseAnalyticsResult> {
    this.SetCompanyContext(params.CompanyID);

    const {
      CourseID: courseId,
      DateFrom: dateFrom,
      DateTo: dateTo,
      IncludeUserBreakdown: includeUserBreakdown = false,
      IncludeModuleStats: includeModuleStatsRaw,
      IncludeRevenue: includeRevenueRaw,
    } = params;

    const includeModuleStats = includeModuleStatsRaw !== false;
    const includeRevenue = includeRevenueRaw !== false;

    if (!courseId) {
      throw new Error('CourseID is required');
    }

    // Build date query string
    const queryString = this.buildDateQueryString(dateFrom, dateTo);

    // Fetch core analytics
    const analyticsData = await this.fetchCoreAnalytics(courseId, queryString, contextUser);

    // Build the typed analytics object
    const analytics = this.buildBaseAnalytics(courseId, dateFrom, dateTo, analyticsData);

    // Optionally fetch revenue data
    if (includeRevenue) {
      analytics.revenue = await this.fetchRevenueData(courseId, queryString, contextUser);
    }

    // Optionally fetch module stats
    if (includeModuleStats) {
      analytics.moduleStats = await this.fetchModuleStats(courseId, contextUser);
    }

    // Optionally fetch user breakdown
    if (includeUserBreakdown) {
      analytics.userBreakdown = await this.fetchUserBreakdown(courseId, contextUser);
    }

    // Build summary
    const summary = this.buildAnalyticsSummary(courseId, analytics);

    return {
      CourseAnalytics: analytics,
      Summary: summary as unknown as Record<string, unknown>,
    };
  }

  // ----------------------------------------------------------------
  // Framework wrapper – thin delegation to the public method
  // ----------------------------------------------------------------

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const typedParams = this.extractCourseAnalyticsParams(Params);
      const result = await this.GetCourseAnalytics(typedParams, ContextUser);

      this.setOutputParam(Params, 'CourseAnalytics', result.CourseAnalytics);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult('Course analytics retrieved successfully', Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return this.buildErrorResult('ERROR', `Error retrieving course analytics: ${msg}`, Params);
    }
  }

  // ----------------------------------------------------------------
  // Private helpers – parameter extraction
  // ----------------------------------------------------------------

  private extractCourseAnalyticsParams(params: ActionParam[]): GetCourseAnalyticsParams {
    return {
      CompanyID: this.getParamValue(params, 'CompanyID') as string,
      CourseID: this.getParamValue(params, 'CourseID') as string,
      DateFrom: this.getParamValue(params, 'DateFrom') as string | undefined,
      DateTo: this.getParamValue(params, 'DateTo') as string | undefined,
      IncludeUserBreakdown: this.getParamValue(params, 'IncludeUserBreakdown') as boolean | undefined,
      IncludeModuleStats: this.getParamValue(params, 'IncludeModuleStats') as boolean | undefined,
      IncludeRevenue: this.getParamValue(params, 'IncludeRevenue') as boolean | undefined,
    };
  }

  // ----------------------------------------------------------------
  // Private helpers – API calls
  // ----------------------------------------------------------------

  private buildDateQueryString(dateFrom?: string, dateTo?: string): string {
    const queryParams: Record<string, string> = {};
    if (dateFrom) {
      queryParams.date_from = new Date(dateFrom).toISOString().split('T')[0];
    }
    if (dateTo) {
      queryParams.date_to = new Date(dateTo).toISOString().split('T')[0];
    }
    const keys = Object.keys(queryParams);
    if (keys.length === 0) return '';
    return '?' + new URLSearchParams(queryParams).toString();
  }

  private async fetchCoreAnalytics(courseId: string, queryString: string, contextUser: UserInfo): Promise<LWRawAnalyticsData> {
    const response = await this.makeLearnWorldsRequest<LWAnalyticsApiResponse>(`/courses/${courseId}/analytics${queryString}`, 'GET', null, contextUser);

    if (response.success === false) {
      throw new Error(response.message || 'Failed to retrieve analytics');
    }

    return response.data || {};
  }

  private async fetchRevenueData(courseId: string, queryString: string, contextUser: UserInfo): Promise<CourseAnalyticsData['revenue']> {
    const response = await this.makeLearnWorldsRequest<LWRevenueApiResponse>(`/courses/${courseId}/revenue${queryString}`, 'GET', null, contextUser);

    if (response.success !== false && response.data) {
      return {
        totalRevenue: response.data.total_revenue || 0,
        currency: response.data.currency || 'USD',
        averageOrderValue: response.data.average_order_value || 0,
        totalOrders: response.data.total_orders || 0,
        revenueTrend: response.data.revenue_trend || [],
        topMarkets: response.data.top_markets || [],
      };
    }

    return undefined;
  }

  private async fetchModuleStats(courseId: string, contextUser: UserInfo): Promise<unknown[] | undefined> {
    const response = await this.makeLearnWorldsRequest<LWModuleStatsApiResponse>(`/courses/${courseId}/modules/analytics`, 'GET', null, contextUser);

    if (response.success !== false && response.data) {
      const rawModules = Array.isArray(response.data) ? response.data : response.data.data;
      if (rawModules) {
        return this.formatModuleStats(rawModules);
      }
    }

    return undefined;
  }

  private async fetchUserBreakdown(courseId: string, contextUser: UserInfo): Promise<Record<string, unknown> | undefined> {
    const enrollmentQs = '?' + new URLSearchParams({ limit: '1000', include: 'progress' }).toString();
    const response = await this.makeLearnWorldsRequest<LWEnrollmentsApiResponse>(`/courses/${courseId}/enrollments${enrollmentQs}`, 'GET', null, contextUser);

    if (response.success !== false && response.data) {
      const enrollments = Array.isArray(response.data) ? response.data : response.data.data;
      if (enrollments) {
        return this.calculateUserBreakdown(enrollments) as unknown as Record<string, unknown>;
      }
    }

    return undefined;
  }

  // ----------------------------------------------------------------
  // Private helpers – data building
  // ----------------------------------------------------------------

  private buildBaseAnalytics(courseId: string, dateFrom: string | undefined, dateTo: string | undefined, data: LWRawAnalyticsData): CourseAnalyticsData {
    return {
      courseId,
      period: {
        from: dateFrom || 'all-time',
        to: dateTo || 'current',
      },
      enrollment: {
        totalEnrollments: data.total_enrollments || 0,
        newEnrollments: data.new_enrollments || 0,
        activeStudents: data.active_students || 0,
        enrollmentTrend: data.enrollment_trend || [],
      },
      progress: {
        averageProgressPercentage: data.average_progress || 0,
        completionRate: data.completion_rate || 0,
        totalCompletions: data.total_completions || 0,
        inProgressCount: data.in_progress_count || 0,
        notStartedCount: data.not_started_count || 0,
        dropoutRate: data.dropout_rate || 0,
      },
      engagement: {
        averageTimeSpent: data.average_time_spent || 0,
        averageTimeSpentText: this.formatDuration(data.average_time_spent || 0),
        totalTimeSpent: data.total_time_spent || 0,
        totalTimeSpentText: this.formatDuration(data.total_time_spent || 0),
        averageSessionDuration: data.average_session_duration || 0,
        lastActivityDate: data.last_activity_date,
        dailyActiveUsers: data.daily_active_users || [],
      },
      performance: {
        averageQuizScore: data.average_quiz_score || 0,
        passRate: data.pass_rate || 0,
        certificatesIssued: data.certificates_issued || 0,
        averageTimeToComplete: data.average_time_to_complete || 0,
        averageTimeToCompleteText: this.formatDuration(data.average_time_to_complete || 0),
      },
    };
  }

  // ----------------------------------------------------------------
  // Private helpers – module stats formatting
  // ----------------------------------------------------------------

  private formatModuleStats(modules: LWRawModuleStat[]): FormattedModuleStat[] {
    return modules.map((module) => ({
      moduleId: module.id || '',
      moduleTitle: module.title || '',
      completionRate: module.completion_rate || 0,
      averageProgress: module.average_progress || 0,
      averageTimeSpent: module.average_time_spent || 0,
      averageTimeSpentText: this.formatDuration(module.average_time_spent || 0),
      studentsStarted: module.students_started || 0,
      studentsCompleted: module.students_completed || 0,
      lessons: (module.lessons || []).map((lesson) => ({
        lessonId: lesson.id || '',
        lessonTitle: lesson.title || '',
        completionRate: lesson.completion_rate || 0,
        averageTimeSpent: lesson.average_time_spent || 0,
        viewCount: lesson.view_count || 0,
      })),
    }));
  }

  // ----------------------------------------------------------------
  // Private helpers – user breakdown
  // ----------------------------------------------------------------

  private calculateUserBreakdown(enrollments: LWRawEnrollmentForBreakdown[]): UserBreakdownResult {
    const buckets: ProgressBuckets = {
      notStarted: 0,
      under25: 0,
      between25And50: 0,
      between50And75: 0,
      between75And99: 0,
      completed: 0,
    };

    for (const enrollment of enrollments) {
      const progress = enrollment.progress_percentage || 0;
      if (progress === 0) buckets.notStarted++;
      else if (progress < 25) buckets.under25++;
      else if (progress < 50) buckets.between25And50++;
      else if (progress < 75) buckets.between50And75++;
      else if (progress < 100) buckets.between75And99++;
      else buckets.completed++;
    }

    const total = enrollments.length;
    const pct = (count: number): string => (total > 0 ? ((count / total) * 100).toFixed(1) : '0.0');

    return {
      total,
      progressDistribution: buckets,
      percentageDistribution: {
        notStarted: pct(buckets.notStarted),
        under25: pct(buckets.under25),
        between25And50: pct(buckets.between25And50),
        between50And75: pct(buckets.between50And75),
        between75And99: pct(buckets.between75And99),
        completed: pct(buckets.completed),
      },
    };
  }

  // ----------------------------------------------------------------
  // Private helpers – trend calculations
  // ----------------------------------------------------------------

  private calculateGrowthRate(trend: unknown[]): string {
    const typedTrend = trend as TrendDataPoint[];
    if (!typedTrend || typedTrend.length < 2) return 'insufficient-data';

    const recent = typedTrend[typedTrend.length - 1]?.value || 0;
    const previous = typedTrend[typedTrend.length - 2]?.value || 0;

    if (previous === 0) return 'new';

    const growthRate = ((recent - previous) / previous) * 100;
    if (growthRate > 10) return 'high-growth';
    if (growthRate > 0) return 'growing';
    if (growthRate === 0) return 'stable';
    return 'declining';
  }

  private calculateEngagementTrend(dailyActiveUsers: unknown[]): string {
    const typedDau = dailyActiveUsers as TrendDataPoint[];
    if (!typedDau || typedDau.length < 7) return 'insufficient-data';

    const recentAvg = typedDau.slice(-7).reduce((sum, day) => sum + (day.value || 0), 0) / 7;
    const previousAvg = typedDau.slice(-14, -7).reduce((sum, day) => sum + (day.value || 0), 0) / 7;

    if (previousAvg === 0) return 'new';

    const change = ((recentAvg - previousAvg) / previousAvg) * 100;
    if (change > 5) return 'increasing';
    if (change < -5) return 'decreasing';
    return 'stable';
  }

  // ----------------------------------------------------------------
  // Private helpers – summary
  // ----------------------------------------------------------------

  private buildAnalyticsSummary(courseId: string, analytics: CourseAnalyticsData): CourseAnalyticsSummary {
    return {
      courseId,
      period: analytics.period,
      keyMetrics: {
        totalEnrollments: analytics.enrollment.totalEnrollments,
        completionRate: analytics.progress.completionRate,
        averageProgress: analytics.progress.averageProgressPercentage,
        activeStudents: analytics.enrollment.activeStudents,
        averageTimeSpent: analytics.engagement.averageTimeSpentText,
        certificatesIssued: analytics.performance.certificatesIssued,
      },
      trends: {
        enrollmentGrowth: this.calculateGrowthRate(analytics.enrollment.enrollmentTrend),
        engagementTrend: this.calculateEngagementTrend(analytics.engagement.dailyActiveUsers),
        completionTrend: 'stable', // Would calculate from historical data
      },
    };
  }

  // ----------------------------------------------------------------
  // Params & Description metadata
  // ----------------------------------------------------------------

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();
    const specificParams: ActionParam[] = [
      { Name: 'CourseID', Type: 'Input', Value: null },
      { Name: 'DateFrom', Type: 'Input', Value: null },
      { Name: 'DateTo', Type: 'Input', Value: null },
      { Name: 'IncludeUserBreakdown', Type: 'Input', Value: false },
      { Name: 'IncludeModuleStats', Type: 'Input', Value: true },
      { Name: 'IncludeRevenue', Type: 'Input', Value: true },
      { Name: 'CourseAnalytics', Type: 'Output', Value: null },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
    return [...baseParams, ...specificParams];
  }

  /**
   * Metadata about this action
   */
  public get Description(): string {
    return 'Retrieves comprehensive analytics and performance metrics for a LearnWorlds course';
  }
}
