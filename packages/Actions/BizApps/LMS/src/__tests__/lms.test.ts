import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
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

import { BaseLMSAction } from '../base/base-lms.action';
import { LearnWorldsBaseAction } from '../providers/learnworlds/learnworlds-base.action';

// Concrete subclass for testing BaseLMSAction
class TestLMSAction extends BaseLMSAction {
  protected lmsProvider = 'TestLMS';
  protected integrationName = 'TestLMS';

  protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
    return { Success: true, ResultCode: 'SUCCESS' };
  }
}

describe('BaseLMSAction', () => {
  let action: TestLMSAction;

  beforeEach(() => {
    action = new TestLMSAction();
  });

  describe('calculateProgressPercentage', () => {
    it('should calculate percentage correctly', () => {
      expect(action['calculateProgressPercentage'](75, 100)).toBe(75);
      expect(action['calculateProgressPercentage'](1, 3)).toBe(33);
    });

    it('should return 0 when total is 0', () => {
      expect(action['calculateProgressPercentage'](0, 0)).toBe(0);
    });

    it('should return 100 when all completed', () => {
      expect(action['calculateProgressPercentage'](50, 50)).toBe(100);
    });
  });

  describe('formatDuration', () => {
    it('should format seconds only', () => {
      expect(action['formatDuration'](30)).toBe('30s');
    });

    it('should format minutes and seconds', () => {
      expect(action['formatDuration'](90)).toBe('1m 30s');
    });

    it('should format hours, minutes, and seconds', () => {
      expect(action['formatDuration'](3661)).toBe('1h 1m 1s');
    });
  });

  describe('mapEnrollmentStatus', () => {
    it('should map active statuses', () => {
      expect(action['mapEnrollmentStatus']('active')).toBe('active');
    });

    it('should map completed statuses', () => {
      expect(action['mapEnrollmentStatus']('completed')).toBe('completed');
      expect(action['mapEnrollmentStatus']('finished')).toBe('completed');
    });

    it('should map expired statuses', () => {
      expect(action['mapEnrollmentStatus']('expired')).toBe('expired');
    });

    it('should map suspended statuses', () => {
      expect(action['mapEnrollmentStatus']('suspended')).toBe('suspended');
      expect(action['mapEnrollmentStatus']('paused')).toBe('suspended');
      expect(action['mapEnrollmentStatus']('inactive')).toBe('suspended');
    });

    it('should return unknown for unrecognized statuses', () => {
      expect(action['mapEnrollmentStatus']('pending')).toBe('unknown');
      expect(action['mapEnrollmentStatus']('review')).toBe('unknown');
    });
  });

  describe('formatLMSDate', () => {
    it('should format date as ISO string', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      expect(action['formatLMSDate'](date)).toBe('2024-06-15T10:30:00.000Z');
    });
  });

  describe('parseLMSDate', () => {
    it('should parse ISO date string', () => {
      const result = action['parseLMSDate']('2024-06-15T10:30:00Z');
      expect(result.toISOString()).toBe('2024-06-15T10:30:00.000Z');
    });
  });

  describe('buildLMSErrorMessage', () => {
    it('should build error message without system error', () => {
      expect(action['buildLMSErrorMessage']('GetCourse', 'Not found')).toBe('LMS operation failed: GetCourse. Not found');
    });

    it('should include system error details', () => {
      const result = action['buildLMSErrorMessage']('GetCourse', 'Failed', new Error('timeout'));
      expect(result).toContain('System error: timeout');
    });
  });

  describe('getCommonLMSParams', () => {
    it('should return CompanyID param', () => {
      const params = action['getCommonLMSParams']();
      expect(params).toHaveLength(1);
      expect(params[0].Name).toBe('CompanyID');
    });
  });

  describe('getCredentialFromEnv', () => {
    it('should build correct env key', () => {
      process.env['BIZAPPS_TESTLMS_COMP1_API_KEY'] = 'key123';
      expect(action['getCredentialFromEnv']('COMP1', 'API_KEY')).toBe('key123');
      delete process.env['BIZAPPS_TESTLMS_COMP1_API_KEY'];
    });

    it('should return undefined for missing env var', () => {
      const result = action['getCredentialFromEnv']('COMP1', 'MISSING_KEY');
      expect(result).toBeUndefined();
    });
  });

  describe('getParamValue', () => {
    it('should find param by name', () => {
      const params = [{ Name: 'CourseID', Value: 'c1', Type: 'Input' as const }];
      expect(action['getParamValue'](params, 'CourseID')).toBe('c1');
    });

    it('should return undefined for missing param', () => {
      expect(action['getParamValue']([], 'Missing')).toBeUndefined();
    });
  });

  describe('setOutputParam', () => {
    it('should create param if it does not exist', () => {
      const params: { Name: string; Type: string; Value: unknown }[] = [];
      action['setOutputParam'](params, 'Result', 42);
      expect(params).toHaveLength(1);
      expect(params[0].Name).toBe('Result');
      expect(params[0].Value).toBe(42);
      expect(params[0].Type).toBe('Output');
    });

    it('should update existing param value', () => {
      const params = [{ Name: 'Result', Type: 'Output', Value: 'old' }];
      action['setOutputParam'](params, 'Result', 'new');
      expect(params).toHaveLength(1);
      expect(params[0].Value).toBe('new');
    });
  });

  describe('buildSuccessResult', () => {
    it('should return a success ActionResultSimple', () => {
      const result = action['buildSuccessResult']('All good');
      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toBe('All good');
    });
  });

  describe('buildErrorResult', () => {
    it('should return an error ActionResultSimple', () => {
      const result = action['buildErrorResult']('FAIL', 'Bad things');
      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('FAIL');
      expect(result.Message).toBe('Bad things');
    });
  });
});

describe('LearnWorldsBaseAction', () => {
  class TestLearnWorldsAction extends LearnWorldsBaseAction {
    protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
      return { Success: true, ResultCode: 'SUCCESS' };
    }
  }

  let action: TestLearnWorldsAction;

  beforeEach(() => {
    action = new TestLearnWorldsAction();
  });

  describe('parseLearnWorldsDate', () => {
    it('should parse ISO date string', () => {
      const result = action['parseLearnWorldsDate']('2024-06-15T10:30:00Z');
      expect(result.toISOString()).toBe('2024-06-15T10:30:00.000Z');
    });

    it('should parse unix timestamp (seconds)', () => {
      const result = action['parseLearnWorldsDate'](1718444400);
      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(1718444400000);
    });
  });

  describe('formatLearnWorldsDate', () => {
    it('should format date as ISO string', () => {
      const date = new Date('2024-06-15T10:30:00Z');
      expect(action['formatLearnWorldsDate'](date)).toBe('2024-06-15T10:30:00.000Z');
    });
  });

  describe('mapUserStatus', () => {
    it('should map active status', () => {
      expect(action['mapUserStatus']('active')).toBe('active');
    });

    it('should map inactive status', () => {
      expect(action['mapUserStatus']('inactive')).toBe('inactive');
    });

    it('should map suspended/blocked statuses', () => {
      expect(action['mapUserStatus']('suspended')).toBe('suspended');
      expect(action['mapUserStatus']('blocked')).toBe('suspended');
    });

    it('should return inactive for unknown statuses', () => {
      expect(action['mapUserStatus']('unknown')).toBe('inactive');
    });
  });

  describe('mapLearnWorldsEnrollmentStatus', () => {
    it('should return completed when completed is true', () => {
      expect(action['mapLearnWorldsEnrollmentStatus']({ completed: true, active: true })).toBe('completed');
    });

    it('should return expired when expired is true', () => {
      expect(action['mapLearnWorldsEnrollmentStatus']({ expired: true, active: true })).toBe('expired');
    });

    it('should return suspended when suspended is true', () => {
      expect(action['mapLearnWorldsEnrollmentStatus']({ suspended: true, active: false })).toBe('suspended');
    });

    it('should return suspended when not active', () => {
      expect(action['mapLearnWorldsEnrollmentStatus']({ active: false })).toBe('suspended');
    });

    it('should return active when active and not completed/expired/suspended', () => {
      expect(action['mapLearnWorldsEnrollmentStatus']({ active: true })).toBe('active');
    });
  });

  describe('calculateProgress', () => {
    it('should extract progress data', () => {
      const result = action['calculateProgress']({
        percentage: 75,
        completed_units: 15,
        total_units: 20,
        time_spent: 3600,
      });
      expect(result.percentage).toBe(75);
      expect(result.completedUnits).toBe(15);
      expect(result.totalUnits).toBe(20);
      expect(result.timeSpent).toBe(3600);
    });

    it('should default missing values to 0', () => {
      const result = action['calculateProgress']({});
      expect(result.percentage).toBe(0);
      expect(result.completedUnits).toBe(0);
      expect(result.totalUnits).toBe(0);
      expect(result.timeSpent).toBe(0);
    });
  });

  describe('SetCompanyContext', () => {
    it('should set params with CompanyID', () => {
      action.SetCompanyContext('comp-123');
      expect(action['params']).toHaveLength(1);
      expect(action['params'][0].Name).toBe('CompanyID');
      expect(action['params'][0].Value).toBe('comp-123');
    });
  });

  describe('FindUserByEmail', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 'u1',
        email: 'test@example.com',
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        status: 'active',
        role: 'student',
        created: '2024-01-01T00:00:00Z',
        tags: ['tag1'],
      };

      action.SetCompanyContext('comp-123');
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([mockUser] as never);

      const mockCtx = { ID: 'ctx-user' } as unknown as (typeof import('@memberjunction/core'))['UserInfo'];
      const result = await action.FindUserByEmail('test@example.com', mockCtx as never);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('u1');
      expect(result!.email).toBe('test@example.com');
    });

    it('should return null when not found', async () => {
      action.SetCompanyContext('comp-123');
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockResolvedValue([] as never);

      const mockCtx = { ID: 'ctx-user' } as unknown as (typeof import('@memberjunction/core'))['UserInfo'];
      const result = await action.FindUserByEmail('nobody@example.com', mockCtx as never);

      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      action.SetCompanyContext('comp-123');
      vi.spyOn(action as never, 'makeLearnWorldsPaginatedRequest').mockRejectedValue(new Error('API error') as never);

      const mockCtx = { ID: 'ctx-user' } as unknown as (typeof import('@memberjunction/core'))['UserInfo'];
      const result = await action.FindUserByEmail('test@example.com', mockCtx as never);

      expect(result).toBeNull();
    });
  });
});
