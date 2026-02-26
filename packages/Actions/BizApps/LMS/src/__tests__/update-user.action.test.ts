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

import { UpdateUserAction } from '../providers/learnworlds/actions/update-user.action';
import { UserInfo } from '@memberjunction/core';
import { UpdateUserParams, LWApiUser } from '../providers/learnworlds/interfaces';

/** Helper to build a mock UserInfo */
function mockContextUser(): UserInfo {
  return { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/** Helper to build a mock LW API user response */
function mockLWApiUserResponse(overrides: Partial<LWApiUser> = {}): LWApiUser {
  return {
    id: 'lw-user-1',
    email: 'updated@example.com',
    username: 'updateduser',
    first_name: 'Updated',
    last_name: 'User',
    full_name: 'Updated User',
    status: 'active',
    role: 'student',
    is_active: true,
    created: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    tags: ['tag1'],
    custom_fields: { level: 'senior' },
    ...overrides,
  };
}

describe('UpdateUserAction', () => {
  let action: UpdateUserAction;
  const contextUser = mockContextUser();

  beforeEach(() => {
    action = new UpdateUserAction();
    vi.restoreAllMocks();
  });

  describe('UpdateUser() typed method', () => {
    it('should update user successfully', async () => {
      const apiResponse = mockLWApiUserResponse();
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockResolvedValue(
        apiResponse,
      );

      const params: UpdateUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        Email: 'updated@example.com',
        FirstName: 'Updated',
      };

      const result = await action.UpdateUser(params, contextUser);

      expect(result.UserDetails.id).toBe('lw-user-1');
      expect(result.UserDetails.email).toBe('updated@example.com');
      expect(result.UserDetails.firstName).toBe('Updated');
      expect(result.UserDetails.status).toBe('active');
      expect(result.Summary.userId).toBe('lw-user-1');
      expect(result.Summary.email).toBe('updated@example.com');
    });

    it('should only send non-undefined fields', async () => {
      const apiResponse = mockLWApiUserResponse();
      const requestSpy = vi
        .spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest')
        .mockResolvedValue(apiResponse);

      const params: UpdateUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        FirstName: 'OnlyFirst',
        // Email, Username, Password, LastName, Role, IsActive, Tags, CustomFields all undefined
      };

      await action.UpdateUser(params, contextUser);

      expect(requestSpy).toHaveBeenCalledTimes(1);
      const body = requestSpy.mock.calls[0][2] as Record<string, unknown>;
      expect(body.first_name).toBe('OnlyFirst');
      // These should NOT be in the body
      expect(body.email).toBeUndefined();
      expect(body.username).toBeUndefined();
      expect(body.password).toBeUndefined();
      expect(body.last_name).toBeUndefined();
      expect(body.role).toBeUndefined();
      expect(body.is_active).toBeUndefined();
      expect(body.tags).toBeUndefined();
      expect(body.custom_fields).toBeUndefined();
    });

    it('should track fields updated in summary', async () => {
      const apiResponse = mockLWApiUserResponse();
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockResolvedValue(
        apiResponse,
      );

      const params: UpdateUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        Email: 'new@example.com',
        FirstName: 'Jane',
        LastName: 'Smith',
        Role: 'instructor',
      };

      const result = await action.UpdateUser(params, contextUser);

      expect(result.Summary.fieldsUpdated).toContain('Email');
      expect(result.Summary.fieldsUpdated).toContain('FirstName');
      expect(result.Summary.fieldsUpdated).toContain('LastName');
      expect(result.Summary.fieldsUpdated).toContain('Role');
      expect(result.Summary.fieldsUpdated).toHaveLength(4);
    });

    it('should throw when UserID missing', async () => {
      // buildUpdateBody needs at least one field to not throw "No fields"
      // but the caller needs UserID - let's verify the API call uses UserID
      const apiResponse = mockLWApiUserResponse();
      const requestSpy = vi
        .spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest')
        .mockResolvedValue(apiResponse);

      const params: UpdateUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        Email: 'new@example.com',
      };

      await action.UpdateUser(params, contextUser);

      // Verify the endpoint included the UserID
      expect(requestSpy.mock.calls[0][0]).toBe('users/lw-user-1');
      expect(requestSpy.mock.calls[0][1]).toBe('PUT');
    });

    it('should throw when no fields provided to update', async () => {
      const params: UpdateUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        // No updatable fields provided
      };

      await expect(action.UpdateUser(params, contextUser)).rejects.toThrow('No fields provided to update');
    });

    it('should map all update fields correctly to the API body', async () => {
      const apiResponse = mockLWApiUserResponse();
      const requestSpy = vi
        .spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest')
        .mockResolvedValue(apiResponse);

      const params: UpdateUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        Email: 'all@example.com',
        Username: 'allfields',
        Password: 'newpass',
        FirstName: 'All',
        LastName: 'Fields',
        Role: 'admin',
        IsActive: false,
        Tags: ['new-tag', 'another-tag'],
        CustomFields: { department: 'Sales', region: 'NA' },
      };

      await action.UpdateUser(params, contextUser);

      const body = requestSpy.mock.calls[0][2] as Record<string, unknown>;
      expect(body.email).toBe('all@example.com');
      expect(body.username).toBe('allfields');
      expect(body.password).toBe('newpass');
      expect(body.first_name).toBe('All');
      expect(body.last_name).toBe('Fields');
      expect(body.role).toBe('admin');
      expect(body.is_active).toBe(false);
      expect(body.tags).toEqual(['new-tag', 'another-tag']);
      expect(body.custom_fields).toEqual({ department: 'Sales', region: 'NA' });
    });

    it('should handle API user response with _id instead of id', async () => {
      const apiResponse = mockLWApiUserResponse({ id: undefined, _id: 'mongo-id-123' });
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockResolvedValue(
        apiResponse,
      );

      const params: UpdateUserParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-1',
        Email: 'mongo@example.com',
      };

      const result = await action.UpdateUser(params, contextUser);

      expect(result.UserDetails.id).toBe('mongo-id-123');
    });
  });

  describe('InternalRunAction()', () => {
    it('should work via framework path', async () => {
      const apiResponse = mockLWApiUserResponse();
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockResolvedValue(
        apiResponse,
      );

      const runParams = {
        Params: [
          { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
          { Name: 'UserID', Value: 'lw-user-1', Type: 'Input' as const },
          { Name: 'Email', Value: 'updated@example.com', Type: 'Input' as const },
          { Name: 'FirstName', Value: 'Updated', Type: 'Input' as const },
        ],
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      const result = await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully updated user');
      expect(result.Message).toContain('updated@example.com');
      expect(result.Message).toContain('field(s) updated');
    });

    it('should return validation error when UserID is missing', async () => {
      const runParams = {
        Params: [
          { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
          // No UserID
          { Name: 'Email', Value: 'new@example.com', Type: 'Input' as const },
        ],
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      const result = await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain("'UserID'");
    });

    it('should return error when API call fails', async () => {
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockRejectedValue(
        new Error('Server unavailable'),
      );

      const runParams = {
        Params: [
          { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
          { Name: 'UserID', Value: 'lw-user-1', Type: 'Input' as const },
          { Name: 'Email', Value: 'fail@example.com', Type: 'Input' as const },
        ],
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      const result = await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Server unavailable');
    });

    it('should set output params on success', async () => {
      const apiResponse = mockLWApiUserResponse();
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockResolvedValue(
        apiResponse,
      );

      const params = [
        { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
        { Name: 'UserID', Value: 'lw-user-1', Type: 'Input' as const },
        { Name: 'FirstName', Value: 'Updated', Type: 'Input' as const },
      ];

      const runParams = {
        Params: params,
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      const userDetailsParam = params.find((p) => p.Name === 'UserDetails');
      const summaryParam = params.find((p) => p.Name === 'Summary');

      expect(userDetailsParam).toBeDefined();
      expect(summaryParam).toBeDefined();
    });
  });
});
