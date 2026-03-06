import { describe, it, expect, beforeEach } from 'vitest';
import { QueryParameterProcessor } from '../queryParameterProcessor.js';
import type { ParameterValidationResult } from '../queryParameterProcessor.js';
import { RunQuerySQLFilterManager } from '@memberjunction/core';

// Helper to build mock QueryParameterInfo objects
function makeParamDef(overrides: Record<string, unknown> = {}) {
  return {
    QueryID: 'q1',
    Name: 'param1',
    Type: 'string' as const,
    IsRequired: false,
    DefaultValue: null as string | null,
    Description: null,
    SampleValue: null,
    ValidationFilters: null as string | null,
    DetectionMethod: 'Manual' as const,
    AutoDetectConfidenceScore: null,
    get ParsedFilters(): unknown[] {
      try {
        return this.ValidationFilters ? JSON.parse(this.ValidationFilters) : [];
      } catch {
        return [];
      }
    },
    ...overrides,
  };
}

// =====================================================================
// Tests for QueryParameterProcessor.validateParameters
// =====================================================================
describe('QueryParameterProcessor.validateParameters', () => {
  beforeEach(() => {
    // Reset to default SQL Server platform before each test
    RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
  });

  describe('required parameter handling', () => {
    it('should fail when a required parameter is missing', () => {
      const defs = [makeParamDef({ Name: 'userId', Type: 'string', IsRequired: true })];
      const result: ParameterValidationResult = QueryParameterProcessor.validateParameters(undefined, defs as never[]);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Required parameter 'userId' is missing");
    });

    it('should fail when a required parameter is an empty string', () => {
      const defs = [makeParamDef({ Name: 'userId', Type: 'string', IsRequired: true })];
      const result = QueryParameterProcessor.validateParameters({ userId: '' }, defs as never[]);
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should succeed when a required parameter is provided', () => {
      const defs = [makeParamDef({ Name: 'userId', Type: 'string', IsRequired: true })];
      const result = QueryParameterProcessor.validateParameters({ userId: 'abc' }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.userId).toBe('abc');
    });
  });

  describe('string type conversion', () => {
    it('should convert numbers to strings when type is string', () => {
      const defs = [makeParamDef({ Name: 'label', Type: 'string' })];
      const result = QueryParameterProcessor.validateParameters({ label: 42 }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.label).toBe('42');
    });
  });

  describe('number type conversion', () => {
    it('should convert numeric strings to numbers', () => {
      const defs = [makeParamDef({ Name: 'count', Type: 'number' })];
      const result = QueryParameterProcessor.validateParameters({ count: '10' }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.count).toBe(10);
    });

    it('should fail for non-numeric strings', () => {
      const defs = [makeParamDef({ Name: 'count', Type: 'number' })];
      const result = QueryParameterProcessor.validateParameters({ count: 'abc' }, defs as never[]);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Parameter 'count' must be a number");
    });
  });

  describe('boolean type conversion - SQL Server (default)', () => {
    it('should convert true boolean to 1 (SQL Server bit)', () => {
      const defs = [makeParamDef({ Name: 'isActive', Type: 'boolean' })];
      const result = QueryParameterProcessor.validateParameters({ isActive: true }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.isActive).toBe(1);
    });

    it('should convert false boolean to 0 (SQL Server bit)', () => {
      const defs = [makeParamDef({ Name: 'isActive', Type: 'boolean' })];
      const result = QueryParameterProcessor.validateParameters({ isActive: false }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.isActive).toBe(0);
    });

    it('should convert string "true" to 1', () => {
      const defs = [makeParamDef({ Name: 'isActive', Type: 'boolean' })];
      const result = QueryParameterProcessor.validateParameters({ isActive: 'true' }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.isActive).toBe(1);
    });

    it('should convert string "false" to 0', () => {
      const defs = [makeParamDef({ Name: 'isActive', Type: 'boolean' })];
      const result = QueryParameterProcessor.validateParameters({ isActive: 'false' }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.isActive).toBe(0);
    });
  });

  describe('boolean type conversion - PostgreSQL', () => {
    beforeEach(() => {
      RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');
    });

    it('should keep true as boolean true for PostgreSQL', () => {
      const defs = [makeParamDef({ Name: 'isActive', Type: 'boolean' })];
      const result = QueryParameterProcessor.validateParameters({ isActive: true }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.isActive).toBe(true);
    });

    it('should keep false as boolean false for PostgreSQL', () => {
      const defs = [makeParamDef({ Name: 'isActive', Type: 'boolean' })];
      const result = QueryParameterProcessor.validateParameters({ isActive: false }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.isActive).toBe(false);
    });

    it('should convert string "true" to boolean true for PostgreSQL', () => {
      const defs = [makeParamDef({ Name: 'isActive', Type: 'boolean' })];
      const result = QueryParameterProcessor.validateParameters({ isActive: 'true' }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.isActive).toBe(true);
    });

    it('should convert string "false" to boolean false for PostgreSQL', () => {
      const defs = [makeParamDef({ Name: 'isActive', Type: 'boolean' })];
      const result = QueryParameterProcessor.validateParameters({ isActive: 'false' }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.isActive).toBe(false);
    });
  });

  describe('date type conversion', () => {
    it('should convert valid date string to ISO format', () => {
      const defs = [makeParamDef({ Name: 'startDate', Type: 'date' })];
      const result = QueryParameterProcessor.validateParameters({ startDate: '2025-06-15' }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.startDate).toContain('2025-06-15');
    });

    it('should accept Date objects and convert to ISO string', () => {
      const defs = [makeParamDef({ Name: 'startDate', Type: 'date' })];
      const d = new Date('2025-01-01T00:00:00Z');
      const result = QueryParameterProcessor.validateParameters({ startDate: d }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.startDate).toBe(d.toISOString());
    });

    it('should fail for invalid date strings', () => {
      const defs = [makeParamDef({ Name: 'startDate', Type: 'date' })];
      const result = QueryParameterProcessor.validateParameters({ startDate: 'not-a-date' }, defs as never[]);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Parameter 'startDate' must be a valid date");
    });
  });

  describe('array type conversion', () => {
    it('should accept array values as-is', () => {
      const defs = [makeParamDef({ Name: 'tags', Type: 'array' })];
      const arr = ['a', 'b'];
      const result = QueryParameterProcessor.validateParameters({ tags: arr }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.tags).toEqual(['a', 'b']);
    });

    it('should parse JSON array strings', () => {
      const defs = [makeParamDef({ Name: 'tags', Type: 'array' })];
      const result = QueryParameterProcessor.validateParameters({ tags: '["x","y"]' }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.tags).toEqual(['x', 'y']);
    });

    it('should fail for invalid JSON array strings', () => {
      const defs = [makeParamDef({ Name: 'tags', Type: 'array' })];
      const result = QueryParameterProcessor.validateParameters({ tags: 'not-json' }, defs as never[]);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Parameter 'tags' must be a valid JSON array");
    });

    it('should fail for non-array non-string values', () => {
      const defs = [makeParamDef({ Name: 'tags', Type: 'array' })];
      const result = QueryParameterProcessor.validateParameters({ tags: 123 }, defs as never[]);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Parameter 'tags' must be an array");
    });
  });

  describe('default value handling', () => {
    it('should apply default value when parameter is not provided', () => {
      const defs = [makeParamDef({ Name: 'limit', Type: 'number', DefaultValue: '100' })];
      const result = QueryParameterProcessor.validateParameters({}, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.limit).toBe(100);
    });

    it('should apply string default value', () => {
      const defs = [makeParamDef({ Name: 'status', Type: 'string', DefaultValue: 'active' })];
      const result = QueryParameterProcessor.validateParameters({}, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.status).toBe('active');
    });

    it('should apply boolean default value (SQL Server)', () => {
      const defs = [makeParamDef({ Name: 'flag', Type: 'boolean', DefaultValue: 'true' })];
      const result = QueryParameterProcessor.validateParameters({}, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.flag).toBe(1);
    });

    it('should apply boolean default value (PostgreSQL)', () => {
      RunQuerySQLFilterManager.Instance.SetPlatform('postgresql');
      const defs = [makeParamDef({ Name: 'flag', Type: 'boolean', DefaultValue: 'true' })];
      const result = QueryParameterProcessor.validateParameters({}, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.flag).toBe(true);
    });

    it('should prefer provided value over default', () => {
      const defs = [makeParamDef({ Name: 'limit', Type: 'number', DefaultValue: '100' })];
      const result = QueryParameterProcessor.validateParameters({ limit: 50 }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.limit).toBe(50);
    });
  });

  describe('unknown parameters', () => {
    it('should report unknown parameters', () => {
      const defs = [makeParamDef({ Name: 'a', Type: 'string' }), makeParamDef({ Name: 'b', Type: 'number' })];
      const result = QueryParameterProcessor.validateParameters(
        { a: 'hello', b: 5, c: 'extra' },
        defs as never[]
      );
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Unknown parameter: 'c'");
    });

    it('should accept valid parameters only', () => {
      const defs = [makeParamDef({ Name: 'a', Type: 'string' }), makeParamDef({ Name: 'b', Type: 'number' })];
      const result = QueryParameterProcessor.validateParameters({ a: 'hello', b: 5 }, defs as never[]);
      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined parameters with optional defs', () => {
      const defs = [makeParamDef({ Name: 'opt', Type: 'string', IsRequired: false })];
      const result = QueryParameterProcessor.validateParameters(undefined, defs as never[]);
      expect(result.success).toBe(true);
    });

    it('should handle unknown params with no defs', () => {
      const result = QueryParameterProcessor.validateParameters({ a: 1 }, []);
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Unknown parameter: 'a'");
    });

    it('should succeed for empty params and empty defs', () => {
      const result = QueryParameterProcessor.validateParameters(undefined, []);
      expect(result.success).toBe(true);
    });
  });
});

// =====================================================================
// Tests for QueryParameterProcessor.processQueryTemplate
// =====================================================================
describe('QueryParameterProcessor.processQueryTemplate', () => {
  beforeEach(() => {
    RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
  });

  it('should return SQL as-is when UsesTemplate is false', () => {
    const query = {
      SQL: 'SELECT * FROM Users',
      UsesTemplate: false,
      Parameters: [],
    };
    const result = QueryParameterProcessor.processQueryTemplate(query as never, undefined);
    expect(result.success).toBe(true);
    expect(result.processedSQL).toBe('SELECT * FROM Users');
  });

  it('should process template with valid parameters', () => {
    const query = {
      SQL: "SELECT * FROM Users WHERE Status = '{{ status }}'",
      UsesTemplate: true,
      Parameters: [makeParamDef({ Name: 'status', Type: 'string', IsRequired: true })],
    };
    const result = QueryParameterProcessor.processQueryTemplate(query as never, { status: 'Active' });
    expect(result.success).toBe(true);
    expect(result.processedSQL).toBe("SELECT * FROM Users WHERE Status = 'Active'");
  });

  it('should fail when required parameter is missing', () => {
    const query = {
      SQL: "SELECT * FROM Users WHERE ID = '{{ id }}'",
      UsesTemplate: true,
      Parameters: [makeParamDef({ Name: 'id', Type: 'string', IsRequired: true })],
    };
    const result = QueryParameterProcessor.processQueryTemplate(query as never, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Parameter validation failed');
  });

  it('should use sqlOverride when provided', () => {
    const query = {
      SQL: 'SELECT 1 -- original',
      UsesTemplate: false,
      Parameters: [],
    };
    const result = QueryParameterProcessor.processQueryTemplate(query as never, undefined, 'SELECT 2 -- override');
    expect(result.success).toBe(true);
    expect(result.processedSQL).toBe('SELECT 2 -- override');
  });
});
