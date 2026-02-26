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
  ActionResultSimple: class ActionResultSimple {
    Success: boolean = false;
    ResultCode: string = '';
    Message: string = '';
    Params?: Array<{ Name: string; Value: unknown; Type: string }>;
  },
  RunActionParams: class RunActionParams {
    Params: Array<{ Name: string; Value: unknown; Type: string }> = [];
    ContextUser: unknown = {};
    Action: unknown = {};
    Filters: unknown[] = [];
  },
}));

import { EnrollUserAction } from '../providers/learnworlds/actions/enroll-user.action';
import { UserInfo } from '@memberjunction/core';
import { EnrollUserParams } from '../providers/learnworlds/interfaces';

/** Helper to build a mock UserInfo */
function mockContextUser(): UserInfo {
  return { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/** Helper to build a mock LW enrollment response */
function mockLWEnrollmentResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    success: true,
    data: {
      id: 'enrollment-abc',
      user_id: 'lw-user-1',
      course_id: 'course-1',
      enrolled_at: '2024-06-15T10:00:00Z',
      status: 'active',
      price: 0,
      progress_percentage: 0,
      completed_units: 0,
      total_units: 10,
      ...((overrides.data as Record<string, unknown>) || {}),
    },
    ...(overrides.success !== undefined ? { success: overrides.success } : {}),
  };
}

/** Helper to build a mock LW course response */
function mockLWCourseResponse(title: string = 'Intro to Testing'): Record<string, unknown> {
  return {
    success: true,
    data: { title },
  };
}

/** Helper to build a mock LW user lookup response */
function mockLWUserResponse(email: string = 'student@example.com'): Record<string, unknown> {
  return {
    success: true,
    data: { email, username: 'student1' },
  };
}

describe('EnrollUserAction', () => {
  let action: EnrollUserAction;
  const contextUser = mockContextUser();

  beforeEach(() => {
    action = new EnrollUserAction();
    vi.restoreAllMocks();
  });

  describe('EnrollUser() typed method', () => {
    it('should enroll user in course', async () => {
      const requestSpy = vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest');
      requestSpy
        .mockResolvedValueOnce(mockLWEnrollmentResponse()) // enrollment
        .mockResolvedValueOnce(mockLWCourseResponse()) // course title lookup
        .mockResolvedValueOnce(mockLWUserResponse()); // user name lookup

      const params: EnrollUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        CourseID: 'course-1',
      };

      const result = await action.EnrollUser(params, contextUser);

      expect(result.EnrollmentDetails.id).toBe('enrollment-abc');
      expect(result.EnrollmentDetails.userId).toBe('lw-user-1');
      expect(result.EnrollmentDetails.courseId).toBe('course-1');
      expect(result.EnrollmentDetails.status).toBe('active');
      expect(result.Summary.courseTitle).toBe('Intro to Testing');
      expect(result.Summary.userName).toBe('student@example.com');
      expect(result.Summary.notificationSent).toBe(true);

      // Verify first call used the per-course endpoint
      expect(requestSpy.mock.calls[0][0]).toBe('courses/course-1/enrollments');
      expect(requestSpy.mock.calls[0][1]).toBe('POST');
    });

    it('should enroll user in bundle (ProductType: bundle)', async () => {
      const requestSpy = vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest');
      requestSpy
        .mockResolvedValueOnce(mockLWEnrollmentResponse())
        .mockResolvedValueOnce(mockLWCourseResponse('Bundle Course'))
        .mockResolvedValueOnce(mockLWUserResponse());

      const params: EnrollUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        CourseID: 'bundle-1',
        ProductType: 'bundle',
        Price: 49.99,
      };

      const result = await action.EnrollUser(params, contextUser);

      expect(result.EnrollmentDetails.id).toBe('enrollment-abc');

      // Verify the bundle endpoint was used
      expect(requestSpy.mock.calls[0][0]).toBe('enrollments');
      const body = requestSpy.mock.calls[0][2] as Record<string, unknown>;
      expect(body.product_type).toBe('bundle');
      expect(body.product_id).toBe('bundle-1');
      expect(body.price).toBe(49.99);
    });

    it('should throw when UserID missing', async () => {
      const params: EnrollUserParams = {
        CompanyID: 'comp-1',
        UserID: '',
        CourseID: 'course-1',
      };

      await expect(action.EnrollUser(params, contextUser)).rejects.toThrow('UserID is required');
    });

    it('should throw when CourseID missing', async () => {
      const params: EnrollUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        CourseID: '',
      };

      await expect(action.EnrollUser(params, contextUser)).rejects.toThrow('CourseID is required');
    });

    it('should throw when enrollment API returns success: false', async () => {
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockResolvedValueOnce({
        success: false,
        message: 'User already enrolled',
      });

      const params: EnrollUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        CourseID: 'course-1',
      };

      await expect(action.EnrollUser(params, contextUser)).rejects.toThrow('User already enrolled');
    });

    it('should use defaults for optional fields', async () => {
      const requestSpy = vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest');
      requestSpy.mockResolvedValueOnce(mockLWEnrollmentResponse()).mockResolvedValueOnce(mockLWCourseResponse()).mockResolvedValueOnce(mockLWUserResponse());

      const params: EnrollUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        CourseID: 'course-1',
      };

      await action.EnrollUser(params, contextUser);

      const body = requestSpy.mock.calls[0][2] as Record<string, unknown>;
      expect(body.price).toBe(0);
      expect(body.justification).toBe('API Enrollment');
      expect(body.notify_user).toBe(true);
    });

    it('should fall back to defaults when course/user lookups fail', async () => {
      const requestSpy = vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest');
      requestSpy
        .mockResolvedValueOnce(mockLWEnrollmentResponse()) // enrollment succeeds
        .mockRejectedValueOnce(new Error('Course not found')) // course lookup fails
        .mockRejectedValueOnce(new Error('User not found')); // user lookup fails

      const params: EnrollUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        CourseID: 'course-1',
      };

      const result = await action.EnrollUser(params, contextUser);

      expect(result.Summary.courseTitle).toBe('Unknown Course');
      expect(result.Summary.userName).toBe('Unknown User');
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success', async () => {
      const requestSpy = vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest');
      requestSpy.mockResolvedValueOnce(mockLWEnrollmentResponse()).mockResolvedValueOnce(mockLWCourseResponse()).mockResolvedValueOnce(mockLWUserResponse());

      const runParams = {
        Params: [
          { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
          { Name: 'UserID', Value: 'lw-user-1', Type: 'Input' as const },
          { Name: 'CourseID', Value: 'course-1', Type: 'Input' as const },
        ],
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      const result = await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully enrolled user');
    });

    it('should return error on failure', async () => {
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockRejectedValue(
        new Error('API timeout'),
      );

      const runParams = {
        Params: [
          { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
          { Name: 'UserID', Value: 'lw-user-1', Type: 'Input' as const },
          { Name: 'CourseID', Value: 'course-1', Type: 'Input' as const },
        ],
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      const result = await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('API timeout');
    });
  });
});
