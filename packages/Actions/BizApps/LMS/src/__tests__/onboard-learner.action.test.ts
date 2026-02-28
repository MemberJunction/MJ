import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies (same pattern as lms.test.ts)
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
import { OnboardLearnerAction } from '../providers/learnworlds/actions/onboard-learner.action';
import { CreateUserAction } from '../providers/learnworlds/actions/create-user.action';
import { EnrollUserAction } from '../providers/learnworlds/actions/enroll-user.action';
import { SSOLoginAction } from '../providers/learnworlds/actions/sso-login.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { CreateUserResult } from '../providers/learnworlds/interfaces/user.types';
import { EnrollUserResult } from '../providers/learnworlds/interfaces/enrollment.types';
import { SSOLoginResult } from '../providers/learnworlds/interfaces/sso.types';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Helper to build a mock CreateUserResult
 */
function createMockCreateUserResult(overrides: Partial<{ id: string; loginUrl: string }> = {}): CreateUserResult {
  return {
    UserDetails: {
      id: overrides.id ?? 'new-user-id',
      email: 'learner@example.com',
      fullName: 'New Learner',
      role: 'student',
      status: 'active',
      tags: [],
      customFields: {},
      loginUrl: overrides.loginUrl ?? 'https://school.com/login/abc',
    },
    EnrollmentResults: [],
    Summary: {
      userId: overrides.id ?? 'new-user-id',
      email: 'learner@example.com',
      fullName: 'New Learner',
      role: 'student',
      status: 'active',
      welcomeEmailSent: false,
      coursesEnrolled: 0,
      totalCoursesRequested: 0,
    },
  };
}

/**
 * Helper to build a mock EnrollUserResult
 */
function createMockEnrollResult(enrollmentId: string): EnrollUserResult {
  return {
    EnrollmentDetails: {
      id: enrollmentId,
      userId: 'new-user-id',
      courseId: 'course-1',
      enrolledAt: '2024-06-15T10:00:00Z',
      status: 'active',
      price: 0,
      progress: { percentage: 0, completedUnits: 0, totalUnits: 10 },
      certificateEligible: false,
    },
    Summary: {
      enrollmentId,
      userId: 'new-user-id',
      userName: 'learner@example.com',
      courseId: 'course-1',
      courseTitle: 'Intro Course',
      enrolledAt: '2024-06-15T10:00:00Z',
      status: 'active',
      price: 0,
      notificationSent: false,
    },
  };
}

/**
 * Helper to build a mock SSOLoginResult
 */
function createMockSSOResult(): SSOLoginResult {
  return {
    LoginURL: 'https://school.com/sso/xyz',
    LearnWorldsUserID: 'lw-user-id',
  };
}

describe('OnboardLearnerAction', () => {
  let action: OnboardLearnerAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new OnboardLearnerAction();
    contextUser = createMockContextUser();
  });

  describe('OnboardLearner() typed method', () => {
    it('should onboard a new learner (create user + enroll + SSO)', async () => {
      // Step 1: User not found by email => create new user
      vi.spyOn(action, 'FindUserByEmail').mockResolvedValue(null);
      vi.spyOn(CreateUserAction.prototype, 'CreateUser').mockResolvedValue(createMockCreateUserResult());

      // Step 2: Enroll in one course
      vi.spyOn(EnrollUserAction.prototype, 'EnrollUser').mockResolvedValue(createMockEnrollResult('enr-001'));

      // Step 3: Generate SSO URL
      vi.spyOn(SSOLoginAction.prototype, 'GenerateSSOUrl').mockResolvedValue(createMockSSOResult());
      // SetCompanyContext is called on the SSO action instance; mock it to be a no-op
      vi.spyOn(SSOLoginAction.prototype, 'SetCompanyContext').mockImplementation(() => {});

      const result = await action.OnboardLearner(
        {
          CompanyID: 'comp-1',
          Email: 'learner@example.com',
          FirstName: 'New',
          LastName: 'Learner',
          CourseIDs: ['course-1'],
        },
        contextUser,
      );

      expect(result.Success).toBe(true);
      expect(result.IsNewUser).toBe(true);
      expect(result.LearnWorldsUserId).toBe('new-user-id');
      expect(result.LoginURL).toBe('https://school.com/sso/xyz');
      expect(result.Enrollments).toHaveLength(1);
      expect(result.Enrollments[0].success).toBe(true);
      expect(result.Enrollments[0].enrollmentId).toBe('enr-001');
      expect(result.Errors).toEqual([]);
    });

    it('should onboard an existing learner (find user + enroll + SSO)', async () => {
      // Step 1: User found by email
      vi.spyOn(action, 'FindUserByEmail').mockResolvedValue({
        id: 'existing-user-id',
        email: 'learner@example.com',
        username: 'learner',
        status: 'active',
        role: 'student',
        createdAt: new Date('2024-01-01'),
      });

      // Step 2: Enroll in one course
      vi.spyOn(EnrollUserAction.prototype, 'EnrollUser').mockResolvedValue(createMockEnrollResult('enr-002'));

      // Step 3: Generate SSO URL
      vi.spyOn(SSOLoginAction.prototype, 'GenerateSSOUrl').mockResolvedValue(createMockSSOResult());
      vi.spyOn(SSOLoginAction.prototype, 'SetCompanyContext').mockImplementation(() => {});

      const result = await action.OnboardLearner(
        {
          CompanyID: 'comp-1',
          Email: 'learner@example.com',
          CourseIDs: ['course-1'],
        },
        contextUser,
      );

      expect(result.Success).toBe(true);
      expect(result.IsNewUser).toBe(false);
      expect(result.LearnWorldsUserId).toBe('existing-user-id');
      expect(result.LoginURL).toBe('https://school.com/sso/xyz');
      expect(result.Enrollments).toHaveLength(1);
      expect(result.Enrollments[0].success).toBe(true);
      expect(result.Errors).toEqual([]);
    });

    it('should handle enrollment failures as partial success', async () => {
      // User found
      vi.spyOn(action, 'FindUserByEmail').mockResolvedValue({
        id: 'user-id',
        email: 'learner@example.com',
        username: 'learner',
        status: 'active',
        role: 'student',
        createdAt: new Date('2024-01-01'),
      });

      // First enrollment succeeds, second fails
      vi.spyOn(EnrollUserAction.prototype, 'EnrollUser')
        .mockResolvedValueOnce(createMockEnrollResult('enr-ok'))
        .mockRejectedValueOnce(new Error('Course not found'));

      // SSO succeeds
      vi.spyOn(SSOLoginAction.prototype, 'GenerateSSOUrl').mockResolvedValue(createMockSSOResult());
      vi.spyOn(SSOLoginAction.prototype, 'SetCompanyContext').mockImplementation(() => {});

      const result = await action.OnboardLearner(
        {
          CompanyID: 'comp-1',
          Email: 'learner@example.com',
          CourseIDs: ['course-1', 'course-bad'],
        },
        contextUser,
      );

      // Not all enrollments failed, so overall Success is true
      expect(result.Success).toBe(true);
      expect(result.Enrollments).toHaveLength(2);
      expect(result.Enrollments[0].success).toBe(true);
      expect(result.Enrollments[1].success).toBe(false);
      expect(result.Enrollments[1].error).toContain('Course not found');
      expect(result.Errors).toHaveLength(1);
      expect(result.Errors[0]).toContain('Enrollment failed for course course-bad');
    });

    it('should handle all enrollments failing (Success is false)', async () => {
      vi.spyOn(action, 'FindUserByEmail').mockResolvedValue({
        id: 'user-id',
        email: 'learner@example.com',
        username: 'learner',
        status: 'active',
        role: 'student',
        createdAt: new Date('2024-01-01'),
      });

      vi.spyOn(EnrollUserAction.prototype, 'EnrollUser').mockRejectedValue(new Error('Server error'));

      vi.spyOn(SSOLoginAction.prototype, 'GenerateSSOUrl').mockResolvedValue(createMockSSOResult());
      vi.spyOn(SSOLoginAction.prototype, 'SetCompanyContext').mockImplementation(() => {});

      const result = await action.OnboardLearner(
        {
          CompanyID: 'comp-1',
          Email: 'learner@example.com',
          CourseIDs: ['course-1'],
        },
        contextUser,
      );

      // All enrollments failed
      expect(result.Success).toBe(false);
      expect(result.Enrollments).toHaveLength(1);
      expect(result.Enrollments[0].success).toBe(false);
      expect(result.Errors).toHaveLength(1);
    });

    it('should handle SSO failure with fallback URL from user creation', async () => {
      // New user created with a loginUrl fallback
      vi.spyOn(action, 'FindUserByEmail').mockResolvedValue(null);
      vi.spyOn(CreateUserAction.prototype, 'CreateUser').mockResolvedValue(createMockCreateUserResult({ loginUrl: 'https://school.com/fallback-login' }));

      // No enrollments
      // SSO fails
      vi.spyOn(SSOLoginAction.prototype, 'GenerateSSOUrl').mockRejectedValue(new Error('SSO service unavailable'));
      vi.spyOn(SSOLoginAction.prototype, 'SetCompanyContext').mockImplementation(() => {});

      const result = await action.OnboardLearner(
        {
          CompanyID: 'comp-1',
          Email: 'learner@example.com',
        },
        contextUser,
      );

      expect(result.Success).toBe(true);
      expect(result.IsNewUser).toBe(true);
      // Falls back to the loginUrl from user creation
      expect(result.LoginURL).toBe('https://school.com/fallback-login');
      expect(result.Enrollments).toEqual([]);
      expect(result.Errors).toEqual([]);
    });

    it('should handle SSO failure with no fallback for existing users', async () => {
      // Existing user (no loginUrl fallback)
      vi.spyOn(action, 'FindUserByEmail').mockResolvedValue({
        id: 'existing-id',
        email: 'learner@example.com',
        username: 'learner',
        status: 'active',
        role: 'student',
        createdAt: new Date('2024-01-01'),
      });

      // SSO fails
      vi.spyOn(SSOLoginAction.prototype, 'GenerateSSOUrl').mockRejectedValue(new Error('SSO service unavailable'));
      vi.spyOn(SSOLoginAction.prototype, 'SetCompanyContext').mockImplementation(() => {});

      const result = await action.OnboardLearner(
        {
          CompanyID: 'comp-1',
          Email: 'learner@example.com',
        },
        contextUser,
      );

      expect(result.Success).toBe(true);
      // No fallback available for existing users
      expect(result.LoginURL).toBeUndefined();
    });

    it('should enroll in both courses and bundles', async () => {
      vi.spyOn(action, 'FindUserByEmail').mockResolvedValue({
        id: 'user-id',
        email: 'learner@example.com',
        username: 'learner',
        status: 'active',
        role: 'student',
        createdAt: new Date('2024-01-01'),
      });

      vi.spyOn(EnrollUserAction.prototype, 'EnrollUser').mockResolvedValue(createMockEnrollResult('enr-multi'));

      vi.spyOn(SSOLoginAction.prototype, 'GenerateSSOUrl').mockResolvedValue(createMockSSOResult());
      vi.spyOn(SSOLoginAction.prototype, 'SetCompanyContext').mockImplementation(() => {});

      const result = await action.OnboardLearner(
        {
          CompanyID: 'comp-1',
          Email: 'learner@example.com',
          CourseIDs: ['course-1'],
          BundleIDs: ['bundle-1'],
        },
        contextUser,
      );

      expect(result.Success).toBe(true);
      expect(result.Enrollments).toHaveLength(2);
      expect(result.Enrollments[0].productType).toBe('course');
      expect(result.Enrollments[1].productType).toBe('bundle');
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when OnboardLearner succeeds', async () => {
      vi.spyOn(action, 'OnboardLearner').mockResolvedValue({
        Success: true,
        LoginURL: 'https://school.com/sso/xyz',
        LearnWorldsUserId: 'lw-user-1',
        IsNewUser: true,
        Enrollments: [{ productId: 'course-1', productType: 'course', success: true, enrollmentId: 'enr-1' }],
        Errors: [],
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'Email', Type: 'Input', Value: 'learner@example.com' },
          { Name: 'CourseIDs', Type: 'Input', Value: ['course-1'] },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Onboarding complete');
      expect(result.Message).toContain('new user created');
      expect(result.Message).toContain('1/1 enrollment(s) succeeded');
    });

    it('should return PARTIAL_FAILURE when some enrollments fail', async () => {
      vi.spyOn(action, 'OnboardLearner').mockResolvedValue({
        Success: false,
        LoginURL: 'https://school.com/sso/xyz',
        LearnWorldsUserId: 'lw-user-1',
        IsNewUser: false,
        Enrollments: [{ productId: 'course-1', productType: 'course', success: false, error: 'Course not found' }],
        Errors: ['Course not found'],
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'Email', Type: 'Input', Value: 'learner@example.com' },
          { Name: 'CourseIDs', Type: 'Input', Value: ['course-1'] },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('PARTIAL_FAILURE');
      expect(result.Message).toContain('Onboarding partially failed');
      expect(result.Message).toContain('existing user found');
      expect(result.Message).toContain('0/1 enrollment(s) succeeded');
    });

    it('should return error when email is missing', async () => {
      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'Email', Type: 'Input', Value: undefined },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain("'Email'");
    });

    it('should return ERROR when OnboardLearner throws', async () => {
      vi.spyOn(action, 'OnboardLearner').mockRejectedValue(new Error('User creation succeeded but no user ID was returned'));

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'Email', Type: 'Input', Value: 'learner@example.com' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Error during onboarding');
      expect(result.Message).toContain('no user ID was returned');
    });
  });
});
