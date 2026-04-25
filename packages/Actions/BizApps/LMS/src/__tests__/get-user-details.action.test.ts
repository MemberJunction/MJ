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
import { GetLearnWorldsUserDetailsAction } from '../providers/learnworlds/actions/get-user-details.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LearnWorldsUserDetailsFull, UserDetailEnrollment } from '../providers/learnworlds/interfaces';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Helper to build a raw LW API user response matching LWUserDetailsResponse
 */
function createRawApiUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'user-abc-123',
    _id: 'user-abc-123',
    email: 'alice@example.com',
    username: 'alice',
    first_name: 'Alice',
    last_name: 'Smith',
    full_name: 'Alice Smith',
    status: 'active',
    role: 'student',
    created: '2024-01-10T10:00:00Z',
    created_at: '2024-01-10T10:00:00Z',
    last_login: '2024-06-15T08:30:00Z',
    avatar_url: 'https://example.com/avatar.jpg',
    profile_image: 'https://example.com/profile.jpg',
    bio: 'Learning enthusiast',
    description: 'A great learner',
    location: 'New York',
    country: 'US',
    timezone: 'America/New_York',
    language: 'en',
    phone: '+1234567890',
    tags: ['vip', 'beta'],
    custom_fields: { department: 'Engineering' },
    last_activity: '2024-06-20T12:00:00Z',
    certificates_count: 3,
    badges_count: 5,
    points: 1200,
    level: 'Gold',
    email_notifications: true,
    two_factor_enabled: false,
    agreed_to_terms: true,
    marketing_consent: false,
    ...overrides,
  };
}

/**
 * Helper to build a raw LW enrollment data object
 */
function createRawEnrollment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    course_id: 'course-1',
    course: { id: 'course-1', title: 'Intro to TypeScript' },
    course_title: 'Intro to TypeScript',
    enrolled_at: '2024-02-01T09:00:00Z',
    created: '2024-02-01T09:00:00Z',
    active: true,
    completed: false,
    expired: false,
    suspended: false,
    progress: { percentage: 60, completed_units: 6, total_units: 10, time_spent: 3600 },
    completed_at: undefined,
    expires_at: '2025-02-01T09:00:00Z',
    last_accessed_at: '2024-06-18T14:00:00Z',
    time_spent: 3600,
    certificate_url: undefined,
    grade: 85,
    final_grade: undefined,
    ...overrides,
  };
}

describe('GetLearnWorldsUserDetailsAction', () => {
  let action: GetLearnWorldsUserDetailsAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new GetLearnWorldsUserDetailsAction();
    contextUser = createMockContextUser();
  });

  describe('GetUserDetails() typed method', () => {
    it('should get user details with enrollments and stats', async () => {
      const rawUser = createRawApiUser();
      const rawEnrollmentCompleted = createRawEnrollment({
        course_id: 'course-2',
        course_title: 'Advanced Node.js',
        active: false,
        completed: true,
        progress: { percentage: 100, completed_units: 20, total_units: 20, time_spent: 7200 },
        completed_at: '2024-05-10T16:00:00Z',
        last_accessed_at: '2024-05-10T16:00:00Z',
        time_spent: 7200,
        certificate_url: 'https://example.com/cert/node',
        grade: 95,
      });
      const rawEnrollmentActive = createRawEnrollment();

      const makeRequestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest');
      // First call: user details
      makeRequestSpy.mockResolvedValueOnce(rawUser as never);
      // Second call: enrollments
      makeRequestSpy.mockResolvedValueOnce({ data: [rawEnrollmentActive, rawEnrollmentCompleted] } as never);
      // Third call: stats
      makeRequestSpy.mockResolvedValueOnce({
        total_time_spent: 15000,
        certificates_earned: 4,
        badges_earned: 7,
        points: 1500,
      } as never);

      const result = await action.GetUserDetails(
        { CompanyID: 'comp-1', UserID: 'user-abc-123', IncludeEnrollments: true, IncludeStats: true },
        contextUser,
      );

      expect(result.UserDetails).toBeDefined();
      expect(result.UserDetails.id).toBe('user-abc-123');
      expect(result.UserDetails.email).toBe('alice@example.com');
      expect(result.UserDetails.username).toBe('alice');
      expect(result.UserDetails.firstName).toBe('Alice');
      expect(result.UserDetails.lastName).toBe('Smith');
      expect(result.UserDetails.fullName).toBe('Alice Smith');
      expect(result.UserDetails.status).toBe('active');
      expect(result.UserDetails.role).toBe('student');
      expect(result.UserDetails.language).toBe('en');
      expect(result.UserDetails.phone).toBe('+1234567890');
      expect(result.UserDetails.tags).toEqual(['vip', 'beta']);
      expect(result.UserDetails.customFields).toEqual({ department: 'Engineering' });
      expect(result.UserDetails.totalCertificates).toBe(4); // overridden by stats
      expect(result.UserDetails.totalBadges).toBe(7); // overridden by stats
      expect(result.UserDetails.points).toBe(1500); // overridden by stats
      expect(result.UserDetails.level).toBe('Gold');
      expect(result.UserDetails.emailNotifications).toBe(true);
      expect(result.UserDetails.twoFactorEnabled).toBe(false);
      expect(result.UserDetails.agreedToTerms).toBe(true);
      expect(result.UserDetails.marketingConsent).toBe(false);

      // Enrollments should be populated
      expect(result.UserDetails.enrollments).toBeDefined();
      expect(result.UserDetails.enrollments).toHaveLength(2);

      // Stats overridden by stats endpoint
      expect(result.UserDetails.totalTimeSpent).toBe(15000);

      // Summary should be present
      expect(result.Summary).toBeDefined();
      expect(result.Summary.userId).toBe('user-abc-123');
      expect(result.Summary.displayName).toBe('Alice Smith');
      expect(result.Summary.status).toBe('active');
      expect(result.Summary.role).toBe('student');
    });

    it('should get user details without enrollments when IncludeEnrollments is false', async () => {
      const rawUser = createRawApiUser();

      const makeRequestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest');
      // First call: user details
      makeRequestSpy.mockResolvedValueOnce(rawUser as never);
      // Second call: stats (enrollments skipped)
      makeRequestSpy.mockResolvedValueOnce({ total_time_spent: 5000 } as never);

      const result = await action.GetUserDetails(
        { CompanyID: 'comp-1', UserID: 'user-abc-123', IncludeEnrollments: false, IncludeStats: true },
        contextUser,
      );

      expect(result.UserDetails.enrollments).toBeUndefined();
      // Stats should still load
      expect(result.UserDetails.totalTimeSpent).toBe(5000);
      // Only 2 API calls: user + stats (no enrollments)
      expect(makeRequestSpy).toHaveBeenCalledTimes(2);
    });

    it('should get user details without stats when IncludeStats is false', async () => {
      const rawUser = createRawApiUser();
      const rawEnrollment = createRawEnrollment();

      const makeRequestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest');
      // First call: user details
      makeRequestSpy.mockResolvedValueOnce(rawUser as never);
      // Second call: enrollments
      makeRequestSpy.mockResolvedValueOnce({ data: [rawEnrollment] } as never);

      const result = await action.GetUserDetails(
        { CompanyID: 'comp-1', UserID: 'user-abc-123', IncludeEnrollments: true, IncludeStats: false },
        contextUser,
      );

      expect(result.UserDetails.enrollments).toHaveLength(1);
      // Only 2 API calls: user + enrollments (no stats)
      expect(makeRequestSpy).toHaveBeenCalledTimes(2);
    });

    it('should throw error when UserID is missing', async () => {
      await expect(
        action.GetUserDetails({ CompanyID: 'comp-1', UserID: '' }, contextUser),
      ).rejects.toThrow('UserID parameter is required');
    });

    it('should calculate enrollment stats correctly', async () => {
      const rawUser = createRawApiUser();
      const completedEnrollment = createRawEnrollment({
        course_id: 'c1',
        course_title: 'Course 1',
        active: false,
        completed: true,
        progress: { percentage: 100, completed_units: 10, total_units: 10, time_spent: 5000 },
        time_spent: 5000,
      });
      const inProgressEnrollment = createRawEnrollment({
        course_id: 'c2',
        course_title: 'Course 2',
        active: true,
        completed: false,
        progress: { percentage: 50, completed_units: 5, total_units: 10, time_spent: 2500 },
        time_spent: 2500,
      });
      const notStartedEnrollment = createRawEnrollment({
        course_id: 'c3',
        course_title: 'Course 3',
        active: true,
        completed: false,
        progress: { percentage: 0, completed_units: 0, total_units: 10, time_spent: 0 },
        time_spent: 0,
      });
      const expiredEnrollment = createRawEnrollment({
        course_id: 'c4',
        course_title: 'Course 4',
        active: false,
        completed: false,
        expired: true,
        progress: { percentage: 30, completed_units: 3, total_units: 10, time_spent: 1200 },
        time_spent: 1200,
      });

      const makeRequestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest');
      makeRequestSpy.mockResolvedValueOnce(rawUser as never);
      makeRequestSpy.mockResolvedValueOnce({
        data: [completedEnrollment, inProgressEnrollment, notStartedEnrollment, expiredEnrollment],
      } as never);
      // Stats endpoint (won't override enrollment-computed stats except totalTimeSpent)
      makeRequestSpy.mockResolvedValueOnce({} as never);

      const result = await action.GetUserDetails(
        { CompanyID: 'comp-1', UserID: 'user-abc-123' },
        contextUser,
      );

      // totalCourses = 4
      expect(result.UserDetails.totalCourses).toBe(4);
      // completedCourses: only status === 'completed' => 1
      expect(result.UserDetails.completedCourses).toBe(1);
      // inProgressCourses: status === 'active' && progress > 0 && progress < 100 => 1
      expect(result.UserDetails.inProgressCourses).toBe(1);
      // notStartedCourses: status === 'active' && progress === 0 => 1
      expect(result.UserDetails.notStartedCourses).toBe(1);
      // totalTimeSpent: sum of all enrollments (5000 + 2500 + 0 + 1200) = 8700
      expect(result.UserDetails.totalTimeSpent).toBe(8700);
      // averageCompletionRate: active+completed enrollments => c1(100)+c2(50)+c3(0) => 150/3 = 50
      expect(result.UserDetails.averageCompletionRate).toBe(50);
    });

    it('should log warning and continue when stats endpoint fails', async () => {
      const rawUser = createRawApiUser();
      const rawEnrollment = createRawEnrollment();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const makeRequestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest');
      makeRequestSpy.mockResolvedValueOnce(rawUser as never);
      makeRequestSpy.mockResolvedValueOnce({ data: [rawEnrollment] } as never);
      makeRequestSpy.mockRejectedValueOnce(new Error('Stats API unavailable') as never);

      const result = await action.GetUserDetails(
        { CompanyID: 'comp-1', UserID: 'user-abc-123', IncludeEnrollments: true, IncludeStats: true },
        contextUser,
      );

      // Should still succeed despite stats failure
      expect(result.UserDetails).toBeDefined();
      expect(result.UserDetails.email).toBe('alice@example.com');
      expect(result.UserDetails.enrollments).toHaveLength(1);

      // Should have logged the warning
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stats endpoint unavailable for user user-abc-123'),
        expect.stringContaining('Stats API unavailable'),
      );

      warnSpy.mockRestore();
    });

    it('should merge stats data correctly via extractStatistics', async () => {
      const rawUser = createRawApiUser({ certificates_count: 2, badges_count: 3, points: 100 });

      const makeRequestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest');
      makeRequestSpy.mockResolvedValueOnce(rawUser as never);
      // Stats response should override the user-level fields
      makeRequestSpy.mockResolvedValueOnce({
        total_time_spent: 99999,
        certificates_earned: 10,
        badges_earned: 20,
        points: 5000,
      } as never);

      const result = await action.GetUserDetails(
        { CompanyID: 'comp-1', UserID: 'user-abc-123', IncludeEnrollments: false, IncludeStats: true },
        contextUser,
      );

      // Stats endpoint values should override initial mapUserDetails values
      expect(result.UserDetails.totalTimeSpent).toBe(99999);
      expect(result.UserDetails.totalCertificates).toBe(10);
      expect(result.UserDetails.totalBadges).toBe(20);
      expect(result.UserDetails.points).toBe(5000);
    });

    it('should build summary structure with correct shape', async () => {
      const rawUser = createRawApiUser();
      const enrollment = createRawEnrollment({
        last_accessed_at: '2024-06-18T14:00:00Z',
      });

      const makeRequestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest');
      makeRequestSpy.mockResolvedValueOnce(rawUser as never);
      makeRequestSpy.mockResolvedValueOnce({ data: [enrollment] } as never);
      makeRequestSpy.mockResolvedValueOnce({} as never);

      const result = await action.GetUserDetails(
        { CompanyID: 'comp-1', UserID: 'user-abc-123' },
        contextUser,
      );

      const summary = result.Summary;
      expect(summary.userId).toBe('user-abc-123');
      expect(summary.displayName).toBe('Alice Smith');
      expect(summary.status).toBe('active');
      expect(summary.role).toBe('student');

      // learningProgress section
      const learningProgress = summary.learningProgress as Record<string, unknown>;
      expect(learningProgress).toBeDefined();
      expect(learningProgress.totalCourses).toBeDefined();
      expect(learningProgress.completedCourses).toBeDefined();
      expect(learningProgress.inProgressCourses).toBeDefined();
      expect(learningProgress.notStartedCourses).toBeDefined();
      expect(learningProgress.averageCompletionRate).toBeDefined();
      expect(learningProgress.totalTimeSpent).toBeDefined();

      // achievements section
      const achievements = summary.achievements as Record<string, unknown>;
      expect(achievements).toBeDefined();
      expect(achievements.certificates).toBeDefined();
      expect(achievements.badges).toBeDefined();
      expect(achievements.points).toBeDefined();
      expect(achievements.level).toBe('Gold');

      // engagement section
      const engagement = summary.engagement as Record<string, unknown>;
      expect(engagement).toBeDefined();
      expect(typeof engagement.accountAge).toBe('number');
      expect(engagement.lastLoginDaysAgo).not.toBeNull();
      expect(engagement.lastActivityDaysAgo).not.toBeNull();

      // recentActivity section
      const recentActivity = summary.recentActivity as Array<Record<string, unknown>>;
      expect(recentActivity).toBeDefined();
      expect(Array.isArray(recentActivity)).toBe(true);
      expect(recentActivity.length).toBeGreaterThanOrEqual(1);
      expect(recentActivity[0].courseTitle).toBeDefined();
      expect(recentActivity[0].progress).toBeDefined();
      expect(recentActivity[0].lastAccessed).toBeDefined();
    });

    it('should default IncludeEnrollments and IncludeStats to true', async () => {
      const rawUser = createRawApiUser();

      const makeRequestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest');
      makeRequestSpy.mockResolvedValueOnce(rawUser as never);
      makeRequestSpy.mockResolvedValueOnce({ data: [] } as never); // enrollments
      makeRequestSpy.mockResolvedValueOnce({} as never); // stats

      await action.GetUserDetails({ CompanyID: 'comp-1', UserID: 'user-abc-123' }, contextUser);

      // Should have made 3 calls: user + enrollments + stats
      expect(makeRequestSpy).toHaveBeenCalledTimes(3);
    });

    it('should use _id fallback when id is not present', async () => {
      const rawUser = createRawApiUser({ id: undefined, _id: 'alt-user-id' });

      const makeRequestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest');
      makeRequestSpy.mockResolvedValueOnce(rawUser as never);
      makeRequestSpy.mockResolvedValueOnce({} as never); // stats

      const result = await action.GetUserDetails(
        { CompanyID: 'comp-1', UserID: 'alt-user-id', IncludeEnrollments: false, IncludeStats: true },
        contextUser,
      );

      expect(result.UserDetails.id).toBe('alt-user-id');
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when GetUserDetails succeeds', async () => {
      const mockDetails: LearnWorldsUserDetailsFull = {
        id: 'user-abc-123',
        email: 'alice@example.com',
        username: 'alice',
        firstName: 'Alice',
        lastName: 'Smith',
        fullName: 'Alice Smith',
        status: 'active',
        role: 'student',
        createdAt: new Date('2024-01-10T10:00:00Z'),
        lastLoginAt: new Date('2024-06-15T08:30:00Z'),
        totalCourses: 2,
        completedCourses: 1,
        inProgressCourses: 1,
        notStartedCourses: 0,
        totalTimeSpent: 5000,
        averageCompletionRate: 75,
        totalCertificates: 1,
        totalBadges: 2,
        points: 500,
      };

      vi.spyOn(action, 'GetUserDetails').mockResolvedValue({
        UserDetails: mockDetails,
        Summary: { userId: 'user-abc-123', displayName: 'Alice Smith' },
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-abc-123' },
          { Name: 'IncludeEnrollments', Type: 'Input', Value: true },
          { Name: 'IncludeStats', Type: 'Input', Value: true },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully retrieved details for user alice@example.com');
    });

    it('should return error result when GetUserDetails throws', async () => {
      vi.spyOn(action, 'GetUserDetails').mockRejectedValue(new Error('User not found in LearnWorlds'));

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'nonexistent-user' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('User not found in LearnWorlds');
    });

    it('should return error when ContextUser is missing', async () => {
      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-abc-123' },
        ],
        ContextUser: undefined,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Context user is required');
    });
  });
});
