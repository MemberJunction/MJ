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
import { GetUserEnrollmentsAction } from '../providers/learnworlds/actions/get-user-enrollments.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { FormattedEnrollment, EnrollmentsSummary } from '../providers/learnworlds/interfaces';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Helper to build a raw LW API enrollment object matching the LWApiEnrollmentData interface
 */
function createRawApiEnrollment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'enrollment-1',
    course_id: 'course-1',
    enrolled_at: '2024-06-15T10:00:00Z',
    starts_at: '2024-06-15T10:00:00Z',
    expires_at: '2025-06-15T10:00:00Z',
    status: 'active',
    progress_percentage: 50,
    completed_units: 5,
    total_units: 10,
    completed_lessons: 3,
    total_lessons: 6,
    last_accessed_at: '2024-07-01T08:00:00Z',
    total_time_spent: 7200,
    grade: 85,
    certificate_eligible: true,
    certificate_issued_at: undefined,
    completed_at: undefined,
    ...overrides,
  };
}

/**
 * Helper to build a raw LW API course details object
 */
function createRawApiCourse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'course-1',
    title: 'Intro to Testing',
    short_description: 'Learn testing basics',
    description: 'A comprehensive course on testing.',
    image_url: 'https://example.com/course.jpg',
    level: 'beginner',
    duration: 3600,
    instructor_name: 'Jane Doe',
    certificate_enabled: true,
    ...overrides,
  };
}

describe('GetUserEnrollmentsAction', () => {
  let action: GetUserEnrollmentsAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new GetUserEnrollmentsAction();
    contextUser = createMockContextUser();
  });

  describe('GetUserEnrollments() typed method', () => {
    it('should get enrollments successfully with enrollment data', async () => {
      const rawEnrollment = createRawApiEnrollment();
      const rawCourse = createRawApiCourse();

      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawEnrollment] as never);
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue(rawCourse as never);

      const result = await action.GetUserEnrollments({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      expect(result.TotalCount).toBe(1);
      expect(result.Enrollments).toHaveLength(1);

      const enrollment: FormattedEnrollment = result.Enrollments[0];
      expect(enrollment.id).toBe('enrollment-1');
      expect(enrollment.courseId).toBe('course-1');
      expect(enrollment.enrolledAt).toBe('2024-06-15T10:00:00Z');
      expect(enrollment.status).toBe('active');
      expect(enrollment.progress.percentage).toBe(50);
      expect(enrollment.progress.completedUnits).toBe(5);
      expect(enrollment.progress.totalUnits).toBe(10);
      expect(enrollment.progress.completedLessons).toBe(3);
      expect(enrollment.progress.totalLessons).toBe(6);
      expect(enrollment.progress.totalTimeSpent).toBe(7200);
      expect(enrollment.grade).toBe(85);
      expect(enrollment.certificateEligible).toBe(true);

      // Summary should be populated
      const summary: EnrollmentsSummary = result.Summary;
      expect(summary.userId).toBe('user-1');
      expect(summary.totalEnrollments).toBe(1);
      expect(summary.activeEnrollments).toBe(1);
    });

    it('should map enrollment statuses correctly in the summary', async () => {
      const activeEnrollment = createRawApiEnrollment({ id: 'e-1', course_id: 'c-1', status: 'active', progress_percentage: 30 });
      const completedEnrollment = createRawApiEnrollment({
        id: 'e-2',
        course_id: 'c-2',
        status: 'completed',
        progress_percentage: 100,
        completed_at: '2024-07-10T12:00:00Z',
        certificate_issued_at: '2024-07-11T00:00:00Z',
      });
      const expiredEnrollment = createRawApiEnrollment({ id: 'e-3', course_id: 'c-3', status: 'expired', progress_percentage: 20 });
      const suspendedEnrollment = createRawApiEnrollment({ id: 'e-4', course_id: 'c-4', status: 'suspended', progress_percentage: 10 });

      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(
        [activeEnrollment, completedEnrollment, expiredEnrollment, suspendedEnrollment] as never,
      );
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue(createRawApiCourse() as never);

      const result = await action.GetUserEnrollments(
        { CompanyID: 'comp-1', UserID: 'user-1', IncludeCourseDetails: true },
        contextUser,
      );

      expect(result.TotalCount).toBe(4);

      const summary = result.Summary;
      expect(summary.activeEnrollments).toBe(1);
      // completedEnrollments counts either progress >= 100 or completedAt non-null
      expect(summary.completedEnrollments).toBe(1);
      expect(summary.expiredEnrollments).toBe(1);
      expect(summary.enrollmentsByStatus.active).toBe(1);
      expect(summary.enrollmentsByStatus.completed).toBe(1);
      expect(summary.enrollmentsByStatus.expired).toBe(1);
      expect(summary.certificatesEarned).toBe(1);
      // averageProgress = (30 + 100 + 20 + 10) / 4 = 40
      expect(summary.averageProgressPercentage).toBe(40);
    });

    it('should include course details when IncludeCourseDetails is true', async () => {
      const rawEnrollment = createRawApiEnrollment();
      const rawCourse = createRawApiCourse();

      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawEnrollment] as never);
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue(rawCourse as never);

      const result = await action.GetUserEnrollments(
        { CompanyID: 'comp-1', UserID: 'user-1', IncludeCourseDetails: true },
        contextUser,
      );

      const enrollment = result.Enrollments[0];
      expect(enrollment.course).toBeDefined();
      expect(enrollment.course!.id).toBe('course-1');
      expect(enrollment.course!.title).toBe('Intro to Testing');
      expect(enrollment.course!.description).toBe('Learn testing basics');
      expect(enrollment.course!.imageUrl).toBe('https://example.com/course.jpg');
      expect(enrollment.course!.level).toBe('beginner');
      expect(enrollment.course!.duration).toBe(3600);
      expect(enrollment.course!.instructorName).toBe('Jane Doe');
      expect(enrollment.course!.certificateEnabled).toBe(true);
    });

    it('should exclude course details when IncludeCourseDetails is false', async () => {
      const rawEnrollment = createRawApiEnrollment();

      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawEnrollment] as never);
      const requestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest');

      const result = await action.GetUserEnrollments(
        { CompanyID: 'comp-1', UserID: 'user-1', IncludeCourseDetails: false },
        contextUser,
      );

      expect(result.Enrollments[0].course).toBeUndefined();
      // Should not call the course detail endpoint when IncludeCourseDetails is false
      expect(requestSpy).not.toHaveBeenCalled();
    });

    it('should handle empty enrollments', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      const result = await action.GetUserEnrollments({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      expect(result.TotalCount).toBe(0);
      expect(result.Enrollments).toEqual([]);
      expect(result.Summary.totalEnrollments).toBe(0);
      expect(result.Summary.activeEnrollments).toBe(0);
      expect(result.Summary.completedEnrollments).toBe(0);
      expect(result.Summary.expiredEnrollments).toBe(0);
      expect(result.Summary.averageProgressPercentage).toBe(0);
      expect(result.Summary.certificatesEarned).toBe(0);
    });

    it('should propagate errors from the API call', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockRejectedValue(new Error('Network timeout') as never);

      await expect(action.GetUserEnrollments({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser)).rejects.toThrow('Network timeout');
    });

    it('should throw when UserID is missing', async () => {
      await expect(
        action.GetUserEnrollments({ CompanyID: 'comp-1', UserID: '' }, contextUser),
      ).rejects.toThrow('UserID is required');
    });

    it('should default status to active when raw enrollment has no status', async () => {
      const rawEnrollment = createRawApiEnrollment({ status: undefined });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawEnrollment] as never);
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue(createRawApiCourse() as never);

      const result = await action.GetUserEnrollments({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      expect(result.Enrollments[0].status).toBe('active');
    });

    it('should use created_at as fallback for enrolledAt when enrolled_at is missing', async () => {
      const rawEnrollment = createRawApiEnrollment({ enrolled_at: undefined, created_at: '2024-05-01T00:00:00Z' });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawEnrollment] as never);
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue(createRawApiCourse() as never);

      const result = await action.GetUserEnrollments({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      expect(result.Enrollments[0].enrolledAt).toBe('2024-05-01T00:00:00Z');
    });

    it('should default progress fields to 0 when missing from the raw data', async () => {
      const rawEnrollment = createRawApiEnrollment({
        progress_percentage: undefined,
        completed_units: undefined,
        total_units: undefined,
        completed_lessons: undefined,
        total_lessons: undefined,
        total_time_spent: undefined,
      });
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([rawEnrollment] as never);
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue(createRawApiCourse() as never);

      const result = await action.GetUserEnrollments({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      const progress = result.Enrollments[0].progress;
      expect(progress.percentage).toBe(0);
      expect(progress.completedUnits).toBe(0);
      expect(progress.totalUnits).toBe(0);
      expect(progress.completedLessons).toBe(0);
      expect(progress.totalLessons).toBe(0);
      expect(progress.totalTimeSpent).toBe(0);
    });

    it('should calculate inProgressEnrollments correctly in summary', async () => {
      const enrollments = [
        createRawApiEnrollment({ id: 'e-1', course_id: 'c-1', status: 'active', progress_percentage: 50 }),
        createRawApiEnrollment({ id: 'e-2', course_id: 'c-2', status: 'active', progress_percentage: 100, completed_at: '2024-08-01T00:00:00Z' }),
        createRawApiEnrollment({ id: 'e-3', course_id: 'c-3', status: 'expired', progress_percentage: 10 }),
      ];

      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue(enrollments as never);
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue(createRawApiCourse() as never);

      const result = await action.GetUserEnrollments({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser);

      // total=3, completed=1, expired=1 => inProgress = max(0, 3 - 1 - 1) = 1
      expect(result.Summary.inProgressEnrollments).toBe(1);
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when GetUserEnrollments succeeds', async () => {
      const mockEnrollments: FormattedEnrollment[] = [
        {
          id: 'enrollment-1',
          courseId: 'course-1',
          enrolledAt: '2024-06-15T10:00:00Z',
          status: 'active',
          progress: {
            percentage: 50,
            completedUnits: 5,
            totalUnits: 10,
            completedLessons: 3,
            totalLessons: 6,
            totalTimeSpent: 7200,
            totalTimeSpentText: '2h 0m 0s',
          },
          certificateEligible: false,
        },
      ];

      const mockSummary: EnrollmentsSummary = {
        userId: 'user-1',
        totalEnrollments: 1,
        activeEnrollments: 1,
        completedEnrollments: 0,
        expiredEnrollments: 0,
        inProgressEnrollments: 1,
        averageProgressPercentage: 50,
        totalTimeSpent: 7200,
        totalTimeSpentText: '2h 0m 0s',
        certificatesEarned: 0,
        enrollmentsByStatus: { active: 1, completed: 0, expired: 0 },
      };

      vi.spyOn(action, 'GetUserEnrollments').mockResolvedValue({
        Enrollments: mockEnrollments,
        TotalCount: 1,
        Summary: mockSummary,
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-1' },
          { Name: 'Status', Type: 'Input', Value: undefined },
          { Name: 'IncludeExpired', Type: 'Input', Value: false },
          { Name: 'IncludeCourseDetails', Type: 'Input', Value: true },
          { Name: 'SortBy', Type: 'Input', Value: undefined },
          { Name: 'SortOrder', Type: 'Input', Value: undefined },
          { Name: 'MaxResults', Type: 'Input', Value: undefined },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Retrieved 1 enrollments for user');
    });

    it('should return error result when GetUserEnrollments throws', async () => {
      vi.spyOn(action, 'GetUserEnrollments').mockRejectedValue(new Error('API connection failed'));

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-1' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Error retrieving enrollments');
      expect(result.Message).toContain('API connection failed');
    });
  });
});
