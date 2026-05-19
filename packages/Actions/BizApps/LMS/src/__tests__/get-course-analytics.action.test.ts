import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies (same pattern as get-bundles.action.test.ts)
vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {
    protected async InternalRunAction(): Promise<unknown> {
      return {};
    }
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
  UserInfo: class UserInfo {},
  Metadata: vi.fn(),
  RunView: vi.fn().mockImplementation(() => ({
    RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
  })),
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {
    CompanyID: string = '';
    APIKey: string | null = null;
    AccessToken: string | null = null;
    ExternalSystemID: string | null = null;
    CustomAttribute1: string | null = null;
  },
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {
    Name: string = '';
    Value: unknown = null;
    Type: string = 'Input';
  },
}));

import { UserInfo } from '@memberjunction/core';
import { GetCourseAnalyticsAction } from '../providers/learnworlds/actions/get-course-analytics.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Creates a raw LW analytics API response with all data populated
 */
function createFullAnalyticsApiResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    success: true,
    data: {
      total_enrollments: 500,
      new_enrollments: 50,
      active_students: 200,
      enrollment_trend: [
        { date: '2024-01-01', value: 10 },
        { date: '2024-01-02', value: 15 },
      ],
      average_progress: 65.5,
      completion_rate: 42.0,
      total_completions: 210,
      in_progress_count: 180,
      not_started_count: 110,
      dropout_rate: 8.5,
      average_time_spent: 3600,
      total_time_spent: 1800000,
      average_session_duration: 1200,
      last_activity_date: '2024-06-20T12:00:00Z',
      daily_active_users: [
        { date: '2024-06-19', value: 30 },
        { date: '2024-06-20', value: 25 },
      ],
      average_quiz_score: 78.3,
      pass_rate: 85.0,
      certificates_issued: 190,
      average_time_to_complete: 7200,
      ...overrides,
    },
  };
}

/**
 * Creates a raw LW revenue API response
 */
function createRevenueApiResponse(): Record<string, unknown> {
  return {
    success: true,
    data: {
      total_revenue: 25000,
      currency: 'USD',
      average_order_value: 50,
      total_orders: 500,
      revenue_trend: [{ date: '2024-01-01', value: 1000 }],
      top_markets: [{ label: 'US', value: 15000 }],
    },
  };
}

/**
 * Creates a raw LW module stats API response
 */
function createModuleStatsApiResponse(): Record<string, unknown> {
  return {
    success: true,
    data: [
      {
        id: 'mod-1',
        title: 'Module 1',
        completion_rate: 80,
        average_progress: 75,
        average_time_spent: 600,
        students_started: 100,
        students_completed: 80,
        lessons: [
          {
            id: 'lesson-1',
            title: 'Lesson 1',
            completion_rate: 90,
            average_time_spent: 300,
            view_count: 150,
          },
        ],
      },
    ],
  };
}

/**
 * Creates a raw LW enrollments API response for user breakdown
 */
function createEnrollmentsApiResponse(progressValues: number[]): Record<string, unknown> {
  return {
    success: true,
    data: progressValues.map((p) => ({ progress_percentage: p })),
  };
}

describe('GetCourseAnalyticsAction', () => {
  let action: GetCourseAnalyticsAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new GetCourseAnalyticsAction();
    contextUser = createMockContextUser();
  });

  describe('GetCourseAnalytics() typed method', () => {
    it('should return analytics with all data', async () => {
      const analyticsResponse = createFullAnalyticsApiResponse();
      const revenueResponse = createRevenueApiResponse();
      const moduleStatsResponse = createModuleStatsApiResponse();

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(analyticsResponse as never) // core analytics
        .mockResolvedValueOnce(revenueResponse as never) // revenue
        .mockResolvedValueOnce(moduleStatsResponse as never); // module stats

      const result = await action.GetCourseAnalytics(
        { CompanyID: 'comp-1', CourseID: 'course-1', IncludeRevenue: true, IncludeModuleStats: true },
        contextUser,
      );

      // Verify core analytics
      expect(result.CourseAnalytics.courseId).toBe('course-1');
      expect(result.CourseAnalytics.enrollment.totalEnrollments).toBe(500);
      expect(result.CourseAnalytics.enrollment.newEnrollments).toBe(50);
      expect(result.CourseAnalytics.enrollment.activeStudents).toBe(200);
      expect(result.CourseAnalytics.progress.averageProgressPercentage).toBe(65.5);
      expect(result.CourseAnalytics.progress.completionRate).toBe(42.0);
      expect(result.CourseAnalytics.progress.totalCompletions).toBe(210);
      expect(result.CourseAnalytics.engagement.averageTimeSpent).toBe(3600);
      expect(result.CourseAnalytics.performance.averageQuizScore).toBe(78.3);
      expect(result.CourseAnalytics.performance.certificatesIssued).toBe(190);

      // Verify revenue
      expect(result.CourseAnalytics.revenue).toBeDefined();
      expect(result.CourseAnalytics.revenue!.totalRevenue).toBe(25000);
      expect(result.CourseAnalytics.revenue!.currency).toBe('USD');
      expect(result.CourseAnalytics.revenue!.totalOrders).toBe(500);

      // Verify module stats
      expect(result.CourseAnalytics.moduleStats).toBeDefined();
      expect(result.CourseAnalytics.moduleStats).toHaveLength(1);
      expect(result.CourseAnalytics.moduleStats![0].moduleId).toBe('mod-1');
      expect(result.CourseAnalytics.moduleStats![0].moduleTitle).toBe('Module 1');
      expect(result.CourseAnalytics.moduleStats![0].lessons).toHaveLength(1);

      // Verify summary
      expect(result.Summary.courseId).toBe('course-1');
      expect(result.Summary.keyMetrics.totalEnrollments).toBe(500);
      expect(result.Summary.keyMetrics.completionRate).toBe(42.0);
    });

    it('should return analytics with only base data (no revenue or module breakdown)', async () => {
      const analyticsResponse = createFullAnalyticsApiResponse();

      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValueOnce(analyticsResponse as never);

      const result = await action.GetCourseAnalytics(
        { CompanyID: 'comp-1', CourseID: 'course-1', IncludeRevenue: false, IncludeModuleStats: false },
        contextUser,
      );

      expect(result.CourseAnalytics.courseId).toBe('course-1');
      expect(result.CourseAnalytics.enrollment.totalEnrollments).toBe(500);
      expect(result.CourseAnalytics.revenue).toBeUndefined();
      expect(result.CourseAnalytics.moduleStats).toBeUndefined();
    });

    it('should throw error when CourseID is missing', async () => {
      await expect(
        action.GetCourseAnalytics({ CompanyID: 'comp-1', CourseID: '' }, contextUser),
      ).rejects.toThrow('CourseID is required');
    });

    it('should handle empty enrollment data in user breakdown', async () => {
      const analyticsResponse = createFullAnalyticsApiResponse();
      const enrollmentsResponse = createEnrollmentsApiResponse([]);

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(analyticsResponse as never) // core analytics
        .mockResolvedValueOnce(enrollmentsResponse as never); // enrollments (for user breakdown)

      const result = await action.GetCourseAnalytics(
        {
          CompanyID: 'comp-1',
          CourseID: 'course-1',
          IncludeUserBreakdown: true,
          IncludeRevenue: false,
          IncludeModuleStats: false,
        },
        contextUser,
      );

      expect(result.CourseAnalytics.userBreakdown).toBeDefined();
      expect(result.CourseAnalytics.userBreakdown!.total).toBe(0);
      expect(result.CourseAnalytics.userBreakdown!.percentageDistribution.notStarted).toBe('0.0');
    });

    it('should propagate errors from makeLearnWorldsRequest', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockRejectedValue(new Error('Network error'));

      await expect(
        action.GetCourseAnalytics({ CompanyID: 'comp-1', CourseID: 'course-1' }, contextUser),
      ).rejects.toThrow('Network error');
    });

    it('should compute user breakdown buckets correctly', async () => {
      const analyticsResponse = createFullAnalyticsApiResponse();
      // progress values: 0, 10, 30, 60, 80, 100
      const enrollmentsResponse = createEnrollmentsApiResponse([0, 10, 30, 60, 80, 100]);

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(analyticsResponse as never)
        .mockResolvedValueOnce(enrollmentsResponse as never);

      const result = await action.GetCourseAnalytics(
        {
          CompanyID: 'comp-1',
          CourseID: 'course-1',
          IncludeUserBreakdown: true,
          IncludeRevenue: false,
          IncludeModuleStats: false,
        },
        contextUser,
      );

      const breakdown = result.CourseAnalytics.userBreakdown!;
      expect(breakdown.total).toBe(6);
      expect(breakdown.progressDistribution.notStarted).toBe(1);
      expect(breakdown.progressDistribution.under25).toBe(1);
      expect(breakdown.progressDistribution.between25And50).toBe(1);
      expect(breakdown.progressDistribution.between50And75).toBe(1);
      expect(breakdown.progressDistribution.between75And99).toBe(1);
      expect(breakdown.progressDistribution.completed).toBe(1);
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when GetCourseAnalytics succeeds', async () => {
      vi.spyOn(action, 'GetCourseAnalytics').mockResolvedValue({
        CourseAnalytics: {
          courseId: 'course-1',
          period: { from: 'all-time', to: 'current' },
          enrollment: { totalEnrollments: 100, newEnrollments: 10, activeStudents: 50, enrollmentTrend: [] },
          progress: { averageProgressPercentage: 60, completionRate: 40, totalCompletions: 40, inProgressCount: 30, notStartedCount: 30, dropoutRate: 5 },
          engagement: { averageTimeSpent: 1800, averageTimeSpentText: '30m 0s', totalTimeSpent: 180000, totalTimeSpentText: '50h 0m 0s', averageSessionDuration: 600, dailyActiveUsers: [] },
          performance: { averageQuizScore: 75, passRate: 80, certificatesIssued: 35, averageTimeToComplete: 3600, averageTimeToCompleteText: '1h 0m 0s' },
        },
        Summary: {
          courseId: 'course-1',
          period: { from: 'all-time', to: 'current' },
          keyMetrics: { totalEnrollments: 100, completionRate: 40, averageProgress: 60, activeStudents: 50, averageTimeSpent: '30m 0s', certificatesIssued: 35 },
          trends: { enrollmentGrowth: 'stable', engagementTrend: 'stable', completionTrend: 'stable' },
        },
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'CourseID', Type: 'Input', Value: 'course-1' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Course analytics retrieved successfully');
    });

    it('should return error result when GetCourseAnalytics throws', async () => {
      vi.spyOn(action, 'GetCourseAnalytics').mockRejectedValue(new Error('Analytics API unavailable'));

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'CourseID', Type: 'Input', Value: 'course-1' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Error retrieving course analytics');
      expect(result.Message).toContain('Analytics API unavailable');
    });
  });
});
