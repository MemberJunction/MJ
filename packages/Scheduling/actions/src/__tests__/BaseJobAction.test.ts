import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock function so vi.mock factory can reference it
const { mockParseExpression } = vi.hoisted(() => ({
  mockParseExpression: vi.fn(),
}));

vi.mock('cron-parser', () => ({
  default: { parseExpression: mockParseExpression },
  parseExpression: mockParseExpression,
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: Function) => {},
}));

vi.mock('@memberjunction/actions', () => ({
  BaseAction: class {},
}));

vi.mock('@memberjunction/actions-base', () => ({
  // ActionResultSimple is just a type
}));

vi.mock('@memberjunction/core', () => ({
  Metadata: class {},
  UserInfo: class {},
  RunView: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJScheduledJobEntity: class {},
}));

import { BaseJobAction } from '../BaseJobAction';

/**
 * Concrete subclass to test the protected methods of BaseJobAction
 */
class TestJobAction extends BaseJobAction {
  // Expose protected methods for testing
  public testValidateCronExpression(cronExpression: string) {
    return this.validateCronExpression(cronExpression);
  }

  public testIsValidStatus(status: string) {
    return this.isValidStatus(status);
  }

  public testBuildJobFilter(filters: {
    status?: string;
    jobTypeId?: string;
    isActive?: boolean;
    createdAfter?: Date;
    createdBefore?: Date;
  }) {
    return this.buildJobFilter(filters);
  }

  public testGetParamValue(params: { Params: Array<{ Name: string; Value: string; Type?: string }> }, name: string) {
    return this.getParamValue(params as Parameters<typeof this.getParamValue>[0], name);
  }

  public testGetNumericParam(params: { Params: Array<{ Name: string; Value: string; Type?: string }> }, name: string, defaultValue: number) {
    return this.getNumericParam(params as Parameters<typeof this.getNumericParam>[0], name, defaultValue);
  }

  public testGetBooleanParam(params: { Params: Array<{ Name: string; Value: string; Type?: string }> }, name: string, defaultValue: boolean) {
    return this.getBooleanParam(params as Parameters<typeof this.getBooleanParam>[0], name, defaultValue);
  }

  public testGetDateParam(params: { Params: Array<{ Name: string; Value: string; Type?: string }> }, name: string) {
    return this.getDateParam(params as Parameters<typeof this.getDateParam>[0], name);
  }

  public testAddOutputParam(params: { Params: Array<{ Name: string; Value: unknown; Type?: string }> }, name: string, value: unknown) {
    return this.addOutputParam(params as Parameters<typeof this.addOutputParam>[0], name, value);
  }
}

describe('BaseJobAction', () => {
  let action: TestJobAction;

  beforeEach(() => {
    action = new TestJobAction();
    vi.clearAllMocks();
  });

  describe('validateCronExpression', () => {
    it('should return invalid for empty string', () => {
      const result = action.testValidateCronExpression('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cron expression cannot be empty');
    });

    it('should return invalid for whitespace-only string', () => {
      const result = action.testValidateCronExpression('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cron expression cannot be empty');
    });

    it('should return valid for a well-formed cron expression', () => {
      mockParseExpression.mockReturnValue({});
      const result = action.testValidateCronExpression('0 0 * * *');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid when cron-parser throws', () => {
      mockParseExpression.mockImplementation(() => {
        throw new Error('Bad cron');
      });
      const result = action.testValidateCronExpression('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid cron expression');
      expect(result.error).toContain('Bad cron');
    });
  });

  describe('isValidStatus', () => {
    it('should accept valid statuses', () => {
      expect(action.testIsValidStatus('Active')).toBe(true);
      expect(action.testIsValidStatus('Disabled')).toBe(true);
      expect(action.testIsValidStatus('Expired')).toBe(true);
      expect(action.testIsValidStatus('Paused')).toBe(true);
      expect(action.testIsValidStatus('Pending')).toBe(true);
    });

    it('should reject invalid statuses', () => {
      expect(action.testIsValidStatus('active')).toBe(false);
      expect(action.testIsValidStatus('ACTIVE')).toBe(false);
      expect(action.testIsValidStatus('Running')).toBe(false);
      expect(action.testIsValidStatus('')).toBe(false);
    });
  });

  describe('buildJobFilter', () => {
    it('should return empty string when no filters provided', () => {
      const result = action.testBuildJobFilter({});
      expect(result).toBe('');
    });

    it('should build filter with status', () => {
      const result = action.testBuildJobFilter({ status: 'Active' });
      expect(result).toBe("Status = 'Active'");
    });

    it('should build filter with jobTypeId', () => {
      const result = action.testBuildJobFilter({ jobTypeId: 'type-123' });
      expect(result).toBe("JobTypeID = 'type-123'");
    });

    it('should combine multiple filters with AND', () => {
      const result = action.testBuildJobFilter({ status: 'Active', jobTypeId: 'type-123' });
      expect(result).toContain("Status = 'Active'");
      expect(result).toContain("JobTypeID = 'type-123'");
      expect(result).toContain(' AND ');
    });

    it('should include date filters', () => {
      const after = new Date('2025-01-01T00:00:00Z');
      const result = action.testBuildJobFilter({ createdAfter: after });
      expect(result).toContain("__mj_CreatedAt >= '2025-01-01T00:00:00.000Z'");
    });
  });

  describe('getParamValue', () => {
    it('should return the value for a matching parameter name', () => {
      const params = { Params: [{ Name: 'JobID', Value: '123' }] };
      expect(action.testGetParamValue(params, 'JobID')).toBe('123');
    });

    it('should be case-insensitive', () => {
      const params = { Params: [{ Name: 'JobID', Value: '123' }] };
      expect(action.testGetParamValue(params, 'jobid')).toBe('123');
    });

    it('should return undefined when parameter not found', () => {
      const params = { Params: [{ Name: 'Other', Value: 'val' }] };
      expect(action.testGetParamValue(params, 'JobID')).toBeUndefined();
    });
  });

  describe('getNumericParam', () => {
    it('should return numeric value when valid', () => {
      const params = { Params: [{ Name: 'Limit', Value: '42' }] };
      expect(action.testGetNumericParam(params, 'Limit', 10)).toBe(42);
    });

    it('should return default when parameter missing', () => {
      const params = { Params: [] as { Name: string; Value: string }[] };
      expect(action.testGetNumericParam(params, 'Limit', 10)).toBe(10);
    });

    it('should return default when value is not a number', () => {
      const params = { Params: [{ Name: 'Limit', Value: 'abc' }] };
      expect(action.testGetNumericParam(params, 'Limit', 10)).toBe(10);
    });
  });

  describe('getBooleanParam', () => {
    it('should return true for "true" string', () => {
      const params = { Params: [{ Name: 'IsActive', Value: 'true' }] };
      expect(action.testGetBooleanParam(params, 'IsActive', false)).toBe(true);
    });

    it('should return true for "1" string', () => {
      const params = { Params: [{ Name: 'IsActive', Value: '1' }] };
      expect(action.testGetBooleanParam(params, 'IsActive', false)).toBe(true);
    });

    it('should return true for "yes" string', () => {
      const params = { Params: [{ Name: 'IsActive', Value: 'yes' }] };
      expect(action.testGetBooleanParam(params, 'IsActive', false)).toBe(true);
    });

    it('should return false for "false" string', () => {
      const params = { Params: [{ Name: 'IsActive', Value: 'false' }] };
      expect(action.testGetBooleanParam(params, 'IsActive', true)).toBe(false);
    });

    it('should return default when parameter missing', () => {
      const params = { Params: [] as { Name: string; Value: string }[] };
      expect(action.testGetBooleanParam(params, 'IsActive', true)).toBe(true);
    });
  });

  describe('getDateParam', () => {
    it('should parse a valid date string', () => {
      const params = { Params: [{ Name: 'StartDate', Value: '2025-06-15' }] };
      const result = action.testGetDateParam(params, 'StartDate');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2025);
    });

    it('should return undefined for invalid date', () => {
      const params = { Params: [{ Name: 'StartDate', Value: 'not-a-date' }] };
      expect(action.testGetDateParam(params, 'StartDate')).toBeUndefined();
    });

    it('should return undefined when parameter missing', () => {
      const params = { Params: [] as { Name: string; Value: string }[] };
      expect(action.testGetDateParam(params, 'StartDate')).toBeUndefined();
    });
  });

  describe('addOutputParam', () => {
    it('should add an output parameter to the params array', () => {
      const params = { Params: [] as { Name: string; Value: unknown; Type?: string }[] };
      action.testAddOutputParam(params, 'JobID', 'new-id-123');
      expect(params.Params).toHaveLength(1);
      expect(params.Params[0].Name).toBe('JobID');
      expect(params.Params[0].Value).toBe('new-id-123');
      expect(params.Params[0].Type).toBe('Output');
    });
  });
});
