import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies (same pattern as onboard-learner.action.test.ts)
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
import { GetLearnWorldsBulkDataAction } from '../providers/learnworlds/actions/get-bulk-data.action';
import { GetLearnWorldsUsersAction } from '../providers/learnworlds/actions/get-users.action';
import { GetLearnWorldsCoursesAction } from '../providers/learnworlds/actions/get-courses.action';
import { GetBundlesAction } from '../providers/learnworlds/actions/get-bundles.action';
import { GetUserEnrollmentsAction } from '../providers/learnworlds/actions/get-user-enrollments.action';
import { GetCertificatesAction } from '../providers/learnworlds/actions/get-certificates.action';
import { GetLearnWorldsUserProgressAction } from '../providers/learnworlds/actions/get-user-progress.action';
import { GetQuizResultsAction } from '../providers/learnworlds/actions/get-quiz-results.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { GetUsersResult } from '../providers/learnworlds/interfaces/user.types';
import { GetCoursesResult, GetUserProgressResult } from '../providers/learnworlds/interfaces/course.types';
import { GetBundlesResult } from '../providers/learnworlds/interfaces/bundle.types';
import { GetUserEnrollmentsResult } from '../providers/learnworlds/interfaces/enrollment.types';
import { GetCertificatesResult } from '../providers/learnworlds/interfaces/certificate.types';
import { GetQuizResultsResult } from '../providers/learnworlds/interfaces/quiz.types';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Helper to build a mock GetUsersResult
 */
function createMockUsersResult(): GetUsersResult {
  return {
    Users: [
      {
        id: 'user-1',
        email: 'alice@example.com',
        username: 'alice',
        status: 'active' as const,
        role: 'student',
        createdAt: new Date('2024-01-01'),
      },
      {
        id: 'user-2',
        email: 'bob@example.com',
        username: 'bob',
        status: 'active' as const,
        role: 'student',
        createdAt: new Date('2024-02-01'),
      },
    ],
    TotalCount: 2,
    Summary: {
      totalUsers: 2,
      activeUsers: 2,
      inactiveUsers: 0,
      suspendedUsers: 0,
      usersByRole: { student: 2 },
      averageCoursesPerUser: 0,
      totalTimeSpent: 0,
      mostActiveUsers: [],
      recentSignups: [],
    },
  };
}

/**
 * Helper to build a mock GetCoursesResult
 */
function createMockCoursesResult(): GetCoursesResult {
  return {
    Courses: [
      {
        id: 'course-1',
        title: 'Intro to Testing',
        status: 'published' as const,
        visibility: 'public' as const,
        isActive: true,
        isFree: true,
        totalUnits: 10,
        totalLessons: 8,
        totalQuizzes: 2,
        totalAssignments: 0,
        totalEnrollments: 50,
        activeEnrollments: 30,
        completionRate: 60,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
        requiresApproval: false,
        hasPrerequisites: false,
        certificateAvailable: true,
      },
    ],
    TotalCount: 1,
    Summary: {
      totalCourses: 1,
      publishedCourses: 1,
      draftCourses: 0,
      freeCourses: 1,
      paidCourses: 0,
      categoryCounts: {},
      levelCounts: {},
      languageCounts: {},
      enrollmentStats: { totalEnrollments: 50, averageEnrollmentsPerCourse: 50, mostPopularCourses: [] },
      priceStats: { averagePrice: 0, minPrice: 0, maxPrice: 0, currency: 'USD' },
    },
  };
}

/**
 * Helper to build a mock GetBundlesResult
 */
function createMockBundlesResult(): GetBundlesResult {
  return {
    Bundles: [
      {
        id: 'bundle-1',
        title: 'Starter Bundle',
        courses: ['course-1'],
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-06-01T00:00:00Z',
        totalCourses: 1,
        totalEnrollments: 10,
      },
    ],
    TotalCount: 1,
  };
}

/**
 * Helper to build a mock GetUserEnrollmentsResult
 */
function createMockEnrollmentsResult(): GetUserEnrollmentsResult {
  return {
    Enrollments: [
      {
        id: 'enr-1',
        courseId: 'course-1',
        enrolledAt: '2024-03-01T00:00:00Z',
        status: 'active',
        progress: {
          percentage: 50,
          completedUnits: 5,
          totalUnits: 10,
          completedLessons: 4,
          totalLessons: 8,
          totalTimeSpent: 3600,
          totalTimeSpentText: '1h 0m 0s',
        },
        certificateEligible: false,
      },
    ],
    TotalCount: 1,
    Summary: {
      userId: 'user-1',
      totalEnrollments: 1,
      activeEnrollments: 1,
      completedEnrollments: 0,
      expiredEnrollments: 0,
      inProgressEnrollments: 1,
      averageProgressPercentage: 50,
      totalTimeSpent: 3600,
      totalTimeSpentText: '1h 0m 0s',
      certificatesEarned: 0,
      enrollmentsByStatus: { active: 1, completed: 0, expired: 0 },
    },
  };
}

/**
 * Helper to build a mock GetCertificatesResult
 */
function createMockCertificatesResult(): GetCertificatesResult {
  return {
    Certificates: [
      {
        id: 'cert-1',
        userId: 'user-1',
        courseId: 'course-1',
        certificateNumber: 'CERT-001',
        issuedAt: '2024-06-01T00:00:00Z',
        status: 'active',
        completionPercentage: 100,
        verification: { url: undefined, code: undefined, qrCode: undefined },
      },
    ],
    TotalCount: 1,
    Summary: {
      totalCertificates: 1,
      activeCertificates: 1,
      expiredCertificates: 0,
      dateRange: { from: 'all-time', to: 'current' },
      filterType: 'user',
      groupedData: null,
    },
  };
}

/**
 * Helper to build a mock GetQuizResultsResult
 */
function createMockQuizResultsResult(): GetQuizResultsResult {
  return {
    QuizResults: [
      {
        id: 'qr-1',
        userId: 'user-1',
        courseId: 'course-1',
        quizId: 'quiz-1',
        attemptNumber: 1,
        score: 85,
        maxScore: 100,
        percentage: 85,
        passed: true,
        passingScore: 70,
        completedAt: '2024-05-15T10:00:00Z',
        duration: 1800,
        durationText: '30m 0s',
      },
    ],
    TotalCount: 1,
    Summary: {
      totalResults: 1,
      passedResults: 1,
      failedResults: 0,
      passRate: '100.0',
      averageScore: '85.0',
      averageDuration: 1800,
      averageDurationText: '30m 0s',
      dateRange: { from: 'all-time', to: 'current' },
      filterType: 'all',
      quizBreakdown: null,
    },
  };
}

/**
 * Helper to build a mock GetUserProgressResult
 */
function createMockProgressResult(userId: string): GetUserProgressResult {
  return {
    UserProgress: {
      userId,
      userEmail: `${userId}@example.com`,
      totalCourses: 1,
      coursesCompleted: 0,
      coursesInProgress: 1,
      coursesNotStarted: 0,
      overallProgressPercentage: 50,
      totalTimeSpent: 3600,
      totalCertificatesEarned: 0,
      courses: [
        {
          courseId: 'course-1',
          courseTitle: 'Intro to Testing',
          enrollmentId: 'enr-1',
          enrolledAt: new Date('2024-03-01'),
          progressPercentage: 50,
          completedUnits: 5,
          totalUnits: 10,
          completedLessons: 4,
          totalLessons: 8,
          totalTimeSpent: 3600,
          averageSessionTime: 600,
          status: 'in_progress',
          certificateEarned: false,
        },
      ],
    },
    Summary: {
      overview: {
        totalCourses: 1,
        completedCourses: 0,
        inProgressCourses: 1,
        notStartedCourses: 0,
        overallProgress: '50%',
        certificatesEarned: 0,
        totalLearningTime: '1h 0m',
      },
      performance: {
        averageQuizScore: 'N/A',
        averageCourseProgress: '50%',
        completionRate: '0%',
      },
      currentFocus: [],
      recentActivity: [],
      achievements: { totalCertificates: 0, coursesWithCertificates: [] },
    },
  };
}

describe('GetLearnWorldsBulkDataAction', () => {
  let action: GetLearnWorldsBulkDataAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new GetLearnWorldsBulkDataAction();
    contextUser = createMockContextUser();
    vi.restoreAllMocks();
  });

  describe('GetBulkData() typed method', () => {
    it('should fetch all data types when no Include flags are set (default all)', async () => {
      vi.spyOn(GetLearnWorldsUsersAction.prototype, 'GetUsers').mockResolvedValue(createMockUsersResult());
      vi.spyOn(GetLearnWorldsCoursesAction.prototype, 'GetCourses').mockResolvedValue(createMockCoursesResult());
      vi.spyOn(GetBundlesAction.prototype, 'GetBundles').mockResolvedValue(createMockBundlesResult());
      vi.spyOn(GetUserEnrollmentsAction.prototype, 'GetUserEnrollments').mockResolvedValue(createMockEnrollmentsResult());
      vi.spyOn(GetLearnWorldsUserProgressAction.prototype, 'GetUserProgress').mockImplementation(async (params) =>
        createMockProgressResult(params.UserID),
      );
      vi.spyOn(GetCertificatesAction.prototype, 'GetCertificates').mockResolvedValue(createMockCertificatesResult());
      vi.spyOn(GetQuizResultsAction.prototype, 'GetQuizResults').mockResolvedValue(createMockQuizResultsResult());

      const result = await action.GetBulkData({ CompanyID: 'comp-1' }, contextUser);

      expect(result.users).toHaveLength(2);
      expect(result.courses).toHaveLength(1);
      expect(result.bundles).toHaveLength(1);
      expect(result.enrollments).toBeDefined();
      expect(result.progress).toHaveLength(2);
      expect(result.certificates).toHaveLength(1);
      expect(result.quizResults).toHaveLength(1);
      expect(result.companyId).toBe('comp-1');
      expect(result.syncedAt).toBeDefined();
      expect(result.totalApiCalls).toBeGreaterThanOrEqual(0);
      expect(result.errors).toEqual([]);
    });

    it('should only fetch users and courses when selectively requested', async () => {
      vi.spyOn(GetLearnWorldsUsersAction.prototype, 'GetUsers').mockResolvedValue(createMockUsersResult());
      vi.spyOn(GetLearnWorldsCoursesAction.prototype, 'GetCourses').mockResolvedValue(createMockCoursesResult());

      const result = await action.GetBulkData(
        {
          CompanyID: 'comp-1',
          IncludeUsers: true,
          IncludeCourses: true,
          IncludeBundles: false,
          IncludeEnrollments: false,
          IncludeProgress: false,
          IncludeCertificates: false,
          IncludeQuizResults: false,
        },
        contextUser,
      );

      expect(result.users).toHaveLength(2);
      expect(result.courses).toHaveLength(1);
      expect(result.bundles).toBeUndefined();
      expect(result.enrollments).toBeUndefined();
      expect(result.progress).toBeUndefined();
      expect(result.certificates).toBeUndefined();
      expect(result.quizResults).toBeUndefined();
      expect(result.errors).toEqual([]);
    });

    it('should collect errors on partial failure without aborting', async () => {
      vi.spyOn(GetLearnWorldsUsersAction.prototype, 'GetUsers').mockResolvedValue(createMockUsersResult());
      vi.spyOn(GetLearnWorldsCoursesAction.prototype, 'GetCourses').mockRejectedValue(new Error('Courses API unavailable'));
      vi.spyOn(GetBundlesAction.prototype, 'GetBundles').mockResolvedValue(createMockBundlesResult());
      vi.spyOn(GetUserEnrollmentsAction.prototype, 'GetUserEnrollments').mockResolvedValue(createMockEnrollmentsResult());
      vi.spyOn(GetLearnWorldsUserProgressAction.prototype, 'GetUserProgress').mockImplementation(async (params) =>
        createMockProgressResult(params.UserID),
      );
      vi.spyOn(GetCertificatesAction.prototype, 'GetCertificates').mockResolvedValue(createMockCertificatesResult());
      vi.spyOn(GetQuizResultsAction.prototype, 'GetQuizResults').mockResolvedValue(createMockQuizResultsResult());

      const result = await action.GetBulkData({ CompanyID: 'comp-1' }, contextUser);

      expect(result.users).toHaveLength(2);
      expect(result.courses).toEqual([]);
      expect(result.bundles).toHaveLength(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].entity).toBe('course');
      expect(result.errors[0].message).toContain('Courses API unavailable');
      expect(result.errors[0].operation).toBe('read');
    });

    it('should collect all errors when all fetches fail', async () => {
      vi.spyOn(GetLearnWorldsUsersAction.prototype, 'GetUsers').mockRejectedValue(new Error('Users API down'));
      vi.spyOn(GetLearnWorldsCoursesAction.prototype, 'GetCourses').mockRejectedValue(new Error('Courses API down'));
      vi.spyOn(GetBundlesAction.prototype, 'GetBundles').mockRejectedValue(new Error('Bundles API down'));
      vi.spyOn(GetCertificatesAction.prototype, 'GetCertificates').mockRejectedValue(new Error('Certificates API down'));
      vi.spyOn(GetQuizResultsAction.prototype, 'GetQuizResults').mockRejectedValue(new Error('Quiz API down'));

      const result = await action.GetBulkData({ CompanyID: 'comp-1' }, contextUser);

      // Users failed, so enrollments and progress won't have users to iterate over
      expect(result.users).toEqual([]);
      expect(result.courses).toEqual([]);
      expect(result.bundles).toEqual([]);
      expect(result.enrollments).toBeDefined();
      expect(result.progress).toBeDefined();
      expect(result.certificates).toEqual([]);
      expect(result.quizResults).toEqual([]);
      // At minimum: user + course + bundle + certificate + quizResult errors
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
    });

    it('should return empty arrays when no data exists', async () => {
      const emptyUsersResult: GetUsersResult = {
        Users: [],
        TotalCount: 0,
        Summary: {
          totalUsers: 0,
          activeUsers: 0,
          inactiveUsers: 0,
          suspendedUsers: 0,
          usersByRole: {},
          averageCoursesPerUser: 0,
          totalTimeSpent: 0,
          mostActiveUsers: [],
          recentSignups: [],
        },
      };
      const emptyCoursesResult: GetCoursesResult = {
        Courses: [],
        TotalCount: 0,
        Summary: {
          totalCourses: 0,
          publishedCourses: 0,
          draftCourses: 0,
          freeCourses: 0,
          paidCourses: 0,
          categoryCounts: {},
          levelCounts: {},
          languageCounts: {},
          enrollmentStats: { totalEnrollments: 0, averageEnrollmentsPerCourse: 0, mostPopularCourses: [] },
          priceStats: { averagePrice: 0, minPrice: 0, maxPrice: 0, currency: 'USD' },
        },
      };
      const emptyBundlesResult: GetBundlesResult = { Bundles: [], TotalCount: 0 };
      const emptyCertsResult: GetCertificatesResult = {
        Certificates: [],
        TotalCount: 0,
        Summary: {
          totalCertificates: 0,
          activeCertificates: 0,
          expiredCertificates: 0,
          dateRange: { from: 'all-time', to: 'current' },
          filterType: 'user',
          groupedData: null,
        },
      };
      const emptyQuizResult: GetQuizResultsResult = {
        QuizResults: [],
        TotalCount: 0,
        Summary: {
          totalResults: 0,
          passedResults: 0,
          failedResults: 0,
          passRate: 0,
          averageScore: '0',
          averageDuration: 0,
          averageDurationText: '0s',
          dateRange: { from: 'all-time', to: 'current' },
          filterType: 'all',
          quizBreakdown: null,
        },
      };

      vi.spyOn(GetLearnWorldsUsersAction.prototype, 'GetUsers').mockResolvedValue(emptyUsersResult);
      vi.spyOn(GetLearnWorldsCoursesAction.prototype, 'GetCourses').mockResolvedValue(emptyCoursesResult);
      vi.spyOn(GetBundlesAction.prototype, 'GetBundles').mockResolvedValue(emptyBundlesResult);
      // No users → progress won't be called per-user, so no mock needed (returns empty)
      vi.spyOn(GetCertificatesAction.prototype, 'GetCertificates').mockResolvedValue(emptyCertsResult);
      vi.spyOn(GetQuizResultsAction.prototype, 'GetQuizResults').mockResolvedValue(emptyQuizResult);

      const result = await action.GetBulkData({ CompanyID: 'comp-1' }, contextUser);

      expect(result.users).toEqual([]);
      expect(result.courses).toEqual([]);
      expect(result.bundles).toEqual([]);
      expect(result.enrollments).toEqual([]);
      expect(result.progress).toEqual([]);
      expect(result.certificates).toEqual([]);
      expect(result.quizResults).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should fetch users for enrollments even if IncludeUsers is false but IncludeEnrollments is true', async () => {
      vi.spyOn(GetLearnWorldsUsersAction.prototype, 'GetUsers').mockResolvedValue(createMockUsersResult());
      vi.spyOn(GetUserEnrollmentsAction.prototype, 'GetUserEnrollments').mockResolvedValue(createMockEnrollmentsResult());

      const result = await action.GetBulkData(
        {
          CompanyID: 'comp-1',
          IncludeUsers: false,
          IncludeCourses: false,
          IncludeBundles: false,
          IncludeEnrollments: true,
          IncludeProgress: false,
          IncludeCertificates: false,
          IncludeQuizResults: false,
        },
        contextUser,
      );

      // Users were fetched (needed for enrollments) but not included in output
      expect(result.users).toBeUndefined();
      expect(result.enrollments).toBeDefined();
      expect(result.enrollments!.length).toBeGreaterThan(0);
    });

    it('should fetch users for progress even if IncludeUsers is false but IncludeProgress is true', async () => {
      vi.spyOn(GetLearnWorldsUsersAction.prototype, 'GetUsers').mockResolvedValue(createMockUsersResult());
      vi.spyOn(GetLearnWorldsUserProgressAction.prototype, 'GetUserProgress').mockImplementation(async (params) =>
        createMockProgressResult(params.UserID),
      );

      const result = await action.GetBulkData(
        {
          CompanyID: 'comp-1',
          IncludeUsers: false,
          IncludeCourses: false,
          IncludeBundles: false,
          IncludeEnrollments: false,
          IncludeProgress: true,
          IncludeCertificates: false,
          IncludeQuizResults: false,
        },
        contextUser,
      );

      // Users were fetched (needed for progress) but not included in output
      expect(result.users).toBeUndefined();
      expect(result.progress).toBeDefined();
      expect(result.progress!.length).toBe(2);
      expect(result.progress![0].userId).toBe('user-1');
      expect(result.progress![1].userId).toBe('user-2');
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when GetBulkData succeeds', async () => {
      vi.spyOn(action, 'GetBulkData').mockResolvedValue({
        users: [{ id: 'u1', email: 'a@b.com', username: 'a', status: 'active', role: 'student', createdAt: new Date() }],
        courses: [],
        syncedAt: new Date().toISOString(),
        companyId: 'comp-1',
        totalApiCalls: 2,
        errors: [],
      });

      const runParams: RunActionParams = {
        Params: [{ Name: 'CompanyID', Type: 'Input', Value: 'comp-1' }],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Bulk data retrieval complete');
    });

    it('should return PARTIAL_FAILURE when there are errors', async () => {
      vi.spyOn(action, 'GetBulkData').mockResolvedValue({
        users: [],
        courses: [],
        syncedAt: new Date().toISOString(),
        companyId: 'comp-1',
        totalApiCalls: 3,
        errors: [
          { entity: 'course', entityId: '', operation: 'read', message: 'Courses API down', timestamp: new Date().toISOString() },
        ],
      });

      const runParams: RunActionParams = {
        Params: [{ Name: 'CompanyID', Type: 'Input', Value: 'comp-1' }],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('PARTIAL_FAILURE');
      expect(result.Message).toContain('partially succeeded');
      expect(result.Message).toContain('1 error(s)');
    });

    it('should return VALIDATION_ERROR when CompanyID is missing', async () => {
      const runParams: RunActionParams = {
        Params: [{ Name: 'CompanyID', Type: 'Input', Value: undefined }],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('VALIDATION_ERROR');
      expect(result.Message).toContain('CompanyID is required');
    });

    it('should return ERROR when GetBulkData throws', async () => {
      vi.spyOn(action, 'GetBulkData').mockRejectedValue(new Error('Unexpected system failure'));

      const runParams: RunActionParams = {
        Params: [{ Name: 'CompanyID', Type: 'Input', Value: 'comp-1' }],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Error during bulk data retrieval');
      expect(result.Message).toContain('Unexpected system failure');
    });
  });
});
