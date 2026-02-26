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
import { DetachTagsAction } from '../providers/learnworlds/actions/detach-tags.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

describe('DetachTagsAction', () => {
  let action: DetachTagsAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new DetachTagsAction();
    contextUser = createMockContextUser();
  });

  describe('DetachTags() typed method', () => {
    it('should detach tags successfully', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({
        tags: ['remaining-tag'],
      } as never);

      const result = await action.DetachTags({ CompanyID: 'comp-1', UserID: 'user-456', Tags: ['old-tag'] }, contextUser);

      expect(result.Success).toBe(true);
      expect(result.UserID).toBe('user-456');
      expect(result.Tags).toEqual(['remaining-tag']);
    });

    it('should use params.Tags as fallback when response.tags is undefined', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsRequest').mockResolvedValue({} as never);

      const result = await action.DetachTags({ CompanyID: 'comp-1', UserID: 'user-456', Tags: ['tag-to-remove'] }, contextUser);

      expect(result.Success).toBe(true);
      expect(result.Tags).toEqual(['tag-to-remove']);
    });

    it('should throw when UserID is missing', async () => {
      await expect(action.DetachTags({ CompanyID: 'comp-1', UserID: '', Tags: ['tag1'] }, contextUser)).rejects.toThrow('UserID is required');
    });

    it('should throw when Tags array is empty', async () => {
      await expect(action.DetachTags({ CompanyID: 'comp-1', UserID: 'user-456', Tags: [] }, contextUser)).rejects.toThrow('At least one tag is required');
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when DetachTags succeeds', async () => {
      vi.spyOn(action, 'DetachTags').mockResolvedValue({
        Success: true,
        UserID: 'user-456',
        Tags: ['removed-tag'],
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'user-456' },
          { Name: 'Tags', Type: 'Input', Value: ['removed-tag'] },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Successfully detached 1 tag(s)');
      expect(result.Message).toContain('user-456');
    });

    it('should return error result when DetachTags throws', async () => {
      vi.spyOn(action, 'DetachTags').mockRejectedValue(new Error('UserID is required'));

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
      expect(result.Message).toContain('Error detaching tags');
      expect(result.Message).toContain('UserID is required');
    });
  });
});
