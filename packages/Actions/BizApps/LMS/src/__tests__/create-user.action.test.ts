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

import { CreateUserAction } from '../providers/learnworlds/actions/create-user.action';
import { UserInfo } from '@memberjunction/core';
import { CreateUserParams } from '../providers/learnworlds/interfaces';

/** Helper to build a mock UserInfo */
function mockContextUser(): UserInfo {
  return { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/** Helper to build a mock LW create-user response */
function mockLWCreateUserResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'lw-user-123',
    email: 'newuser@example.com',
    username: 'newuser',
    first_name: 'New',
    last_name: 'User',
    role: 'student',
    is_active: true,
    tags: [],
    custom_fields: {},
    created_at: '2024-06-15T10:00:00Z',
    login_url: 'https://school.learnworlds.com/login/lw-user-123',
    reset_password_url: 'https://school.learnworlds.com/reset/lw-user-123',
    ...overrides,
  };
}

describe('CreateUserAction', () => {
  let action: CreateUserAction;
  const contextUser = mockContextUser();

  beforeEach(() => {
    action = new CreateUserAction();
    vi.restoreAllMocks();
  });

  describe('CreateUser() typed method', () => {
    it('should create user successfully', async () => {
      const apiResponse = mockLWCreateUserResponse();
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockResolvedValue(
        apiResponse,
      );

      const params: CreateUserParams = {
        CompanyID: 'comp-1',
        Email: 'newuser@example.com',
        FirstName: 'New',
        LastName: 'User',
      };

      const result = await action.CreateUser(params, contextUser);

      expect(result.UserDetails.id).toBe('lw-user-123');
      expect(result.UserDetails.email).toBe('newuser@example.com');
      expect(result.UserDetails.fullName).toBe('New User');
      expect(result.UserDetails.role).toBe('student');
      expect(result.UserDetails.status).toBe('active');
      expect(result.Summary.userId).toBe('lw-user-123');
      expect(result.Summary.email).toBe('newuser@example.com');
      expect(result.Summary.welcomeEmailSent).toBe(true);
      expect(result.EnrollmentResults).toEqual([]);
    });

    it('should throw when email is missing', async () => {
      const params: CreateUserParams = {
        CompanyID: 'comp-1',
        Email: '',
      };

      await expect(action.CreateUser(params, contextUser)).rejects.toThrow('Email is required');
    });

    it('should handle enrollment in courses', async () => {
      const createResponse = mockLWCreateUserResponse();
      const enrollResponse = { id: 'enrollment-1' };

      const requestSpy = vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest');
      // First call: create user; Second call: enroll in course
      requestSpy.mockResolvedValueOnce(createResponse).mockResolvedValueOnce(enrollResponse);

      const params: CreateUserParams = {
        CompanyID: 'comp-1',
        Email: 'newuser@example.com',
        EnrollInCourses: ['course-abc'],
      };

      const result = await action.CreateUser(params, contextUser);

      expect(result.EnrollmentResults).toHaveLength(1);
      expect(result.EnrollmentResults[0].courseId).toBe('course-abc');
      expect(result.EnrollmentResults[0].success).toBe(true);
      expect(result.EnrollmentResults[0].enrollmentId).toBe('enrollment-1');
      expect(result.Summary.coursesEnrolled).toBe(1);
      expect(result.Summary.totalCoursesRequested).toBe(1);
    });

    it('should handle enrollment failure gracefully', async () => {
      const createResponse = mockLWCreateUserResponse();

      const requestSpy = vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest');
      // First call: create user succeeds; Second call: enrollment fails
      requestSpy.mockResolvedValueOnce(createResponse).mockRejectedValueOnce(new Error('Course not found'));

      const params: CreateUserParams = {
        CompanyID: 'comp-1',
        Email: 'newuser@example.com',
        EnrollInCourses: 'course-xyz',
      };

      const result = await action.CreateUser(params, contextUser);

      expect(result.EnrollmentResults).toHaveLength(1);
      expect(result.EnrollmentResults[0].success).toBe(false);
      expect(result.EnrollmentResults[0].error).toBe('Course not found');
      expect(result.Summary.coursesEnrolled).toBe(0);
      expect(result.Summary.totalCoursesRequested).toBe(1);
    });

    it('should pass optional fields to the API', async () => {
      const apiResponse = mockLWCreateUserResponse({ role: 'instructor', tags: ['vip', 'beta'] });

      const requestSpy = vi
        .spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest')
        .mockResolvedValue(apiResponse);

      const params: CreateUserParams = {
        CompanyID: 'comp-1',
        Email: 'instructor@example.com',
        Username: 'instructor1',
        Password: 'secret123',
        FirstName: 'Jane',
        LastName: 'Doe',
        Role: 'instructor',
        IsActive: true,
        SendWelcomeEmail: false,
        Tags: 'vip,beta',
        CustomFields: { department: 'Engineering' },
      };

      await action.CreateUser(params, contextUser);

      // Verify the API was called with the correct body
      expect(requestSpy).toHaveBeenCalledTimes(1);
      const callArgs = requestSpy.mock.calls[0];
      expect(callArgs[0]).toBe('users');
      expect(callArgs[1]).toBe('POST');
      const body = callArgs[2] as Record<string, unknown>;
      expect(body.email).toBe('instructor@example.com');
      expect(body.username).toBe('instructor1');
      expect(body.password).toBe('secret123');
      expect(body.first_name).toBe('Jane');
      expect(body.last_name).toBe('Doe');
      expect(body.role).toBe('instructor');
      expect(body.tags).toEqual(['vip', 'beta']);
      expect(body.custom_fields).toEqual({ department: 'Engineering' });
    });

    it('should handle tags as an array', async () => {
      const apiResponse = mockLWCreateUserResponse({ tags: ['alpha', 'omega'] });

      const requestSpy = vi
        .spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest')
        .mockResolvedValue(apiResponse);

      const params: CreateUserParams = {
        CompanyID: 'comp-1',
        Email: 'arrayuser@example.com',
        Tags: ['alpha', 'omega'],
      };

      await action.CreateUser(params, contextUser);

      const body = requestSpy.mock.calls[0][2] as Record<string, unknown>;
      expect(body.tags).toEqual(['alpha', 'omega']);
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success ActionResultSimple', async () => {
      const apiResponse = mockLWCreateUserResponse();
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockResolvedValue(
        apiResponse,
      );

      const runParams = {
        Params: [
          { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
          { Name: 'Email', Value: 'newuser@example.com', Type: 'Input' as const },
          { Name: 'FirstName', Value: 'New', Type: 'Input' as const },
          { Name: 'LastName', Value: 'User', Type: 'Input' as const },
        ],
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      const result = await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully created user');
      expect(result.Message).toContain('newuser@example.com');
    });

    it('should return error on failure', async () => {
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockRejectedValue(
        new Error('API connection failed'),
      );

      const runParams = {
        Params: [
          { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
          { Name: 'Email', Value: 'fail@example.com', Type: 'Input' as const },
        ],
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      const result = await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('API connection failed');
    });

    it('should set output params on success', async () => {
      const apiResponse = mockLWCreateUserResponse();
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockResolvedValue(
        apiResponse,
      );

      const params = [
        { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
        { Name: 'Email', Value: 'newuser@example.com', Type: 'Input' as const },
      ];

      const runParams = {
        Params: params,
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      // Output params should have been added
      const userDetailsParam = params.find((p) => p.Name === 'UserDetails');
      const summaryParam = params.find((p) => p.Name === 'Summary');
      const enrollmentResultsParam = params.find((p) => p.Name === 'EnrollmentResults');

      expect(userDetailsParam).toBeDefined();
      expect(summaryParam).toBeDefined();
      expect(enrollmentResultsParam).toBeDefined();
    });
  });
});
