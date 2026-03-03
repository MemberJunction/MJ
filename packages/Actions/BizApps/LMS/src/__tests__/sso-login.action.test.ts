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

import { SSOLoginAction } from '../providers/learnworlds/actions/sso-login.action';
import { UserInfo } from '@memberjunction/core';
import { SSOLoginParams } from '../providers/learnworlds/interfaces';

/** Helper to build a mock UserInfo */
function mockContextUser(): UserInfo {
  return { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

describe('SSOLoginAction', () => {
  let action: SSOLoginAction;
  const contextUser = mockContextUser();

  beforeEach(() => {
    action = new SSOLoginAction();
    vi.restoreAllMocks();
  });

  describe('GenerateSSOUrl() typed method', () => {
    it('should generate SSO URL with email', async () => {
      const requestSpy = vi
        .spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest')
        .mockResolvedValue({
          url: 'https://school.learnworlds.com/sso?token=abc123',
          user_id: 'lw-user-42',
        });

      const params: SSOLoginParams = {
        CompanyID: 'comp-1',
        Email: 'student@example.com',
      };

      const result = await action.GenerateSSOUrl(params, contextUser);

      expect(result.LoginURL).toBe('https://school.learnworlds.com/sso?token=abc123');
      expect(result.LearnWorldsUserID).toBe('lw-user-42');

      // Verify the request body contained the email
      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(requestSpy.mock.calls[0][0]).toBe('sso');
      expect(requestSpy.mock.calls[0][1]).toBe('POST');
      const body = requestSpy.mock.calls[0][2] as Record<string, unknown>;
      expect(body.email).toBe('student@example.com');
      expect(body.user_id).toBeUndefined();
    });

    it('should generate SSO URL with userId', async () => {
      const requestSpy = vi
        .spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest')
        .mockResolvedValue({
          url: 'https://school.learnworlds.com/sso?token=def456',
          user_id: 'lw-user-99',
        });

      const params: SSOLoginParams = {
        CompanyID: 'comp-1',
        UserID: 'lw-user-99',
      };

      const result = await action.GenerateSSOUrl(params, contextUser);

      expect(result.LoginURL).toBe('https://school.learnworlds.com/sso?token=def456');
      expect(result.LearnWorldsUserID).toBe('lw-user-99');

      const body = requestSpy.mock.calls[0][2] as Record<string, unknown>;
      expect(body.user_id).toBe('lw-user-99');
      expect(body.email).toBeUndefined();
    });

    it('should throw when neither email nor userId provided', async () => {
      const params: SSOLoginParams = {
        CompanyID: 'comp-1',
      };

      await expect(action.GenerateSSOUrl(params, contextUser)).rejects.toThrow('Either Email or UserID is required for SSO login');
    });

    it('should include RedirectTo in the request body when provided', async () => {
      const requestSpy = vi
        .spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest')
        .mockResolvedValue({
          url: 'https://school.learnworlds.com/sso?token=xyz',
        });

      const params: SSOLoginParams = {
        CompanyID: 'comp-1',
        Email: 'student@example.com',
        RedirectTo: '/courses/my-course',
      };

      await action.GenerateSSOUrl(params, contextUser);

      const body = requestSpy.mock.calls[0][2] as Record<string, unknown>;
      expect(body.redirect_to).toBe('/courses/my-course');
    });

    it('should prefer email over userId when both are provided', async () => {
      const requestSpy = vi
        .spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest')
        .mockResolvedValue({
          url: 'https://school.learnworlds.com/sso?token=both',
        });

      const params: SSOLoginParams = {
        CompanyID: 'comp-1',
        Email: 'both@example.com',
        UserID: 'lw-user-both',
      };

      await action.GenerateSSOUrl(params, contextUser);

      // Email should be set, and since the code checks `if (params.Email)` first,
      // user_id should NOT be set (it's in the else-if branch)
      const body = requestSpy.mock.calls[0][2] as Record<string, unknown>;
      expect(body.email).toBe('both@example.com');
      expect(body.user_id).toBeUndefined();
    });

    it('should propagate API errors', async () => {
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockRejectedValue(
        new Error('LearnWorlds API error: 401 Unauthorized'),
      );

      const params: SSOLoginParams = {
        CompanyID: 'comp-1',
        Email: 'student@example.com',
      };

      await expect(action.GenerateSSOUrl(params, contextUser)).rejects.toThrow('LearnWorlds API error: 401 Unauthorized');
    });
  });

  describe('InternalRunAction()', () => {
    it('should work via framework path', async () => {
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockResolvedValue({
        url: 'https://school.learnworlds.com/sso?token=framework',
        user_id: 'lw-user-fw',
      });

      const runParams = {
        Params: [
          { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
          { Name: 'Email', Value: 'student@example.com', Type: 'Input' as const },
        ],
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      const result = await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('SSO URL generated successfully');
    });

    it('should set output params on success', async () => {
      vi.spyOn(action as unknown as { makeLearnWorldsRequest: (...args: unknown[]) => Promise<unknown> }, 'makeLearnWorldsRequest').mockResolvedValue({
        url: 'https://school.learnworlds.com/sso?token=output',
        user_id: 'lw-user-out',
      });

      const params = [
        { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
        { Name: 'Email', Value: 'student@example.com', Type: 'Input' as const },
      ];

      const runParams = {
        Params: params,
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      const loginUrlParam = params.find((p) => p.Name === 'LoginURL');
      const userIdParam = params.find((p) => p.Name === 'LearnWorldsUserID');
      expect(loginUrlParam).toBeDefined();
      expect(loginUrlParam?.Value).toBe('https://school.learnworlds.com/sso?token=output');
      expect(userIdParam).toBeDefined();
      expect(userIdParam?.Value).toBe('lw-user-out');
    });

    it('should return error when validation fails', async () => {
      const runParams = {
        Params: [
          { Name: 'CompanyID', Value: 'comp-1', Type: 'Input' as const },
          // Neither Email nor UserID provided
        ],
        ContextUser: contextUser,
        Action: {},
        Filters: [],
      };

      const result = await action['InternalRunAction'](runParams as unknown as Parameters<(typeof action)['InternalRunAction']>[0]);

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Either Email or UserID is required');
    });
  });
});
