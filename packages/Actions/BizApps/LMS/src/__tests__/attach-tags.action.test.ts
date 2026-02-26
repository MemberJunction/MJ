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
import { AttachTagsAction } from '../providers/learnworlds/actions/attach-tags.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

describe('AttachTagsAction', () => {
  let action: AttachTagsAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new AttachTagsAction();
    contextUser = createMockContextUser();
  });

  describe('AttachTags() typed method', () => {
    it('should attach tags successfully', async () => {
      // Mock the API request to return the attached tags
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        tags: ['vip', 'premium'],
      } as never);

      const result = await action.AttachTags({ CompanyID: 'comp-1', UserID: 'user-123', Tags: ['vip', 'premium'] }, contextUser);

      expect(result.Success).toBe(true);
      expect(result.UserID).toBe('user-123');
      expect(result.Tags).toEqual(['vip', 'premium']);
    });

    it('should use params.Tags as fallback when response.tags is undefined', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({} as never);

      const result = await action.AttachTags({ CompanyID: 'comp-1', UserID: 'user-123', Tags: ['new-tag'] }, contextUser);

      expect(result.Success).toBe(true);
      expect(result.Tags).toEqual(['new-tag']);
    });

    it('should throw when UserID is missing', async () => {
      await expect(action.AttachTags({ CompanyID: 'comp-1', UserID: '', Tags: ['tag1'] }, contextUser)).rejects.toThrow('UserID is required');
    });

    it('should throw when Tags array is empty', async () => {
      await expect(action.AttachTags({ CompanyID: 'comp-1', UserID: 'user-123', Tags: [] }, contextUser)).rejects.toThrow('At least one tag is required');
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when AttachTags succeeds', async () => {
      vi.spyOn(action, 'AttachTags').mockResolvedValue({
        Success: true,
        UserID: 'user-123',
        Tags: ['vip', 'premium'],
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-123' },
          { Name: 'Tags', Type: 'Input', Value: ['vip', 'premium'] },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully attached 2 tag(s)');
      expect(result.Message).toContain('user-123');
    });

    it('should return error result when AttachTags throws', async () => {
      vi.spyOn(action, 'AttachTags').mockRejectedValue(new Error('UserID is required'));

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: '' },
          { Name: 'Tags', Type: 'Input', Value: ['tag1'] },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Error attaching tags');
      expect(result.Message).toContain('UserID is required');
    });
  });
});
