import { describe, it, expect, beforeEach } from 'vitest';
import { QueryParameterProcessor } from '../queryParameterProcessor.js';
import type { ParameterValidationResult } from '../queryParameterProcessor.js';
import { RunQuerySQLFilterManager } from '@memberjunction/core';

// Helper to build mock MJQueryParameterEntity objects
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

  describe('default value handling (metadata only — not injected)', () => {
    // DefaultValue is informational metadata. The SQL template handles defaults
    // via {% else %} blocks or | default() filters. The processor does NOT inject
    // DefaultValue into the template context.

    it('should NOT inject default values — they are metadata only', () => {
      const defs = [makeParamDef({ Name: 'limit', Type: 'number', DefaultValue: '100' })];
      const result = QueryParameterProcessor.validateParameters({}, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.limit).toBeUndefined();
    });

    it('should succeed when optional param with SQL expression default is absent', () => {
      // GETDATE() is a SQL function — the template handles it via {% else %}
      const defs = [makeParamDef({ Name: 'RefDate', Type: 'date', DefaultValue: 'GETDATE()' })];
      const result = QueryParameterProcessor.validateParameters({}, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.RefDate).toBeUndefined();
    });

    it('should succeed when optional param with SQL IN-list default is absent', () => {
      const defs = [makeParamDef({ Name: 'statuses', Type: 'array', DefaultValue: "('Cancelled', 'Refunded')" })];
      const result = QueryParameterProcessor.validateParameters({}, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.statuses).toBeUndefined();
    });

    it('should still validate and use explicitly provided values', () => {
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
// Tests for ValidationFilters enforcement (the declared @ValidationFilters chain)
// =====================================================================
describe('QueryParameterProcessor.validateParameters ValidationFilters enforcement', () => {
  beforeEach(() => {
    RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
  });

  // Build a single-parameter definition carrying a declared ValidationFilters chain.
  function defWithFilters(
    filters: Array<{ name: string; args?: unknown[] }>,
    overrides: Record<string, unknown> = {}
  ) {
    return [makeParamDef({ Name: 'p', Type: 'string', ValidationFilters: JSON.stringify(filters), ...overrides })];
  }

  describe('required filter', () => {
    it('rejects an empty (present) value', () => {
      const result = QueryParameterProcessor.validateParameters({ p: '' }, defWithFilters([{ name: 'required' }]) as never[]);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toContain("'required'");
    });
    it('accepts a non-empty value', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'x' }, defWithFilters([{ name: 'required' }]) as never[]);
      expect(result.success).toBe(true);
    });
  });

  describe('email filter', () => {
    it('rejects a malformed address', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'not-an-email' }, defWithFilters([{ name: 'email' }]) as never[]);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toContain("'email'");
    });
    it('accepts a well-formed address', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'a@b.co' }, defWithFilters([{ name: 'email' }]) as never[]);
      expect(result.success).toBe(true);
    });
  });

  describe('min filter', () => {
    it('rejects a string shorter than the bound (length semantics)', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'ab' }, defWithFilters([{ name: 'min', args: [3] }]) as never[]);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/minimum/i);
    });
    it('accepts a string at or above the bound', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'abc' }, defWithFilters([{ name: 'min', args: [3] }]) as never[]);
      expect(result.success).toBe(true);
    });
    it('compares numerically when the value is numeric', () => {
      const reject = QueryParameterProcessor.validateParameters(
        { p: 2 },
        [makeParamDef({ Name: 'p', Type: 'number', ValidationFilters: JSON.stringify([{ name: 'min', args: [5] }]) })] as never[]
      );
      expect(reject.success).toBe(false);
      const accept = QueryParameterProcessor.validateParameters(
        { p: 9 },
        [makeParamDef({ Name: 'p', Type: 'number', ValidationFilters: JSON.stringify([{ name: 'min', args: [5] }]) })] as never[]
      );
      expect(accept.success).toBe(true);
    });
    it('rejects when the filter argument is not numeric', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'abc' }, defWithFilters([{ name: 'min', args: ['x'] }]) as never[]);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/numeric argument/i);
    });
  });

  describe('max filter', () => {
    it('rejects a string longer than the bound', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'abcdef' }, defWithFilters([{ name: 'max', args: [3] }]) as never[]);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/maximum/i);
    });
    it('accepts a string at or below the bound', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'ab' }, defWithFilters([{ name: 'max', args: [3] }]) as never[]);
      expect(result.success).toBe(true);
    });
  });

  describe('trim / upper / lower transformation filters', () => {
    it('trim strips surrounding whitespace', () => {
      const result = QueryParameterProcessor.validateParameters({ p: '  hi  ' }, defWithFilters([{ name: 'trim' }]) as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.p).toBe('hi');
    });
    it('upper uppercases', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'hi' }, defWithFilters([{ name: 'upper' }]) as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.p).toBe('HI');
    });
    it('lower lowercases', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'HI' }, defWithFilters([{ name: 'lower' }]) as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.p).toBe('hi');
    });
  });

  describe('number filter', () => {
    it('rejects a non-numeric value', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'abc' }, defWithFilters([{ name: 'number' }]) as never[]);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/not a valid number/i);
    });
    it('converts a numeric string to a number', () => {
      const result = QueryParameterProcessor.validateParameters({ p: '42' }, defWithFilters([{ name: 'number' }]) as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.p).toBe(42);
    });
  });

  describe('date filter', () => {
    it('rejects an invalid date', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'not-a-date' }, defWithFilters([{ name: 'date' }]) as never[]);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/not a valid date/i);
    });
    it('normalizes a valid date to ISO', () => {
      const result = QueryParameterProcessor.validateParameters({ p: '2024-06-15' }, defWithFilters([{ name: 'date' }]) as never[]);
      expect(result.success).toBe(true);
      expect(String(result.validatedParameters.p)).toContain('2024-06-15');
    });
  });

  describe('sqlsafe filter', () => {
    it('rejects a value with SQL metacharacters', () => {
      const result = QueryParameterProcessor.validateParameters({ p: "O'Brien" }, defWithFilters([{ name: 'sqlsafe' }]) as never[]);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/metacharacters/i);
    });
    it('accepts a clean value', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'Obrien' }, defWithFilters([{ name: 'sqlsafe' }]) as never[]);
      expect(result.success).toBe(true);
    });
  });

  describe('sqljoin filter', () => {
    it('rejects when an array element carries SQL metacharacters', () => {
      const result = QueryParameterProcessor.validateParameters(
        { p: ['ok', "x'; DROP TABLE t--"] },
        [makeParamDef({ Name: 'p', Type: 'array', ValidationFilters: JSON.stringify([{ name: 'sqljoin' }]) })] as never[]
      );
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/metacharacters/i);
    });
    it('accepts a clean array', () => {
      const result = QueryParameterProcessor.validateParameters(
        { p: ['a', 'b', 'c'] },
        [makeParamDef({ Name: 'p', Type: 'array', ValidationFilters: JSON.stringify([{ name: 'sqljoin' }]) })] as never[]
      );
      expect(result.success).toBe(true);
    });
    it('rejects a non-array value', () => {
      const result = QueryParameterProcessor.validateParameters(
        { p: 'not-an-array' },
        defWithFilters([{ name: 'sqljoin' }]) as never[]
      );
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/array value/i);
    });
  });

  describe('unknown filter (false-promise guard)', () => {
    it('rejects a declared filter it cannot honor instead of silently no-op-ing', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'anything' }, defWithFilters([{ name: 'definitely-not-real' }]) as never[]);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toContain('unknown validation filter');
    });
  });

  describe('chain ordering and short-circuit', () => {
    it('applies transformation filters BEFORE later validators (ordering)', () => {
      // '  ab  ' trimmed → 'ab' (length 2), then min:3 fails. If min ran on the UNTRIMMED
      // value (length 6) it would pass — so a failure proves trim ran first.
      const result = QueryParameterProcessor.validateParameters({ p: '  ab  ' }, defWithFilters([{ name: 'trim' }, { name: 'min', args: [3] }]) as never[]);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/minimum/i);
    });
    it('passes a valid value through the full ordered chain and keeps the transformed result', () => {
      const result = QueryParameterProcessor.validateParameters({ p: '  ab  ' }, defWithFilters([{ name: 'trim' }, { name: 'min', args: [2] }]) as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.p).toBe('ab');
    });
    it('short-circuits at the FIRST violation (later filters are not evaluated)', () => {
      // min fails first; email is never reached — so exactly one error, and it is the min error.
      const result = QueryParameterProcessor.validateParameters({ p: 'ab' }, defWithFilters([{ name: 'min', args: [3] }, { name: 'email' }]) as never[]);
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/minimum/i);
      expect(result.errors.join(' ')).not.toContain("'email'");
    });
  });

  describe('malformed ValidationFilters JSON is ignored (no crash)', () => {
    it('treats non-array / garbage JSON as no filters and does not throw', () => {
      const result = QueryParameterProcessor.validateParameters({ p: 'x' }, [makeParamDef({ Name: 'p', Type: 'string', ValidationFilters: 'not-json' })] as never[]);
      expect(result.success).toBe(true);
    });
    it('skips malformed chain entries (missing name) but honors valid ones', () => {
      const result = QueryParameterProcessor.validateParameters(
        { p: 'ab' },
        [makeParamDef({ Name: 'p', Type: 'string', ValidationFilters: JSON.stringify([{ nope: true }, { name: 'min', args: [3] }]) })] as never[]
      );
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/minimum/i);
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

// =====================================================================
// Tests for skipUnknownParameterCheck
// =====================================================================
describe('QueryParameterProcessor.validateParameters skipUnknownParameterCheck', () => {
  beforeEach(() => {
    RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
  });

  it('should reject unknown params when skipUnknownParameterCheck is false', () => {
    const defs = [makeParamDef({ Name: 'known', Type: 'string' })];
    const result = QueryParameterProcessor.validateParameters(
      { known: 'ok', extra: 'oops' },
      defs as never[],
      false
    );
    expect(result.success).toBe(false);
    expect(result.errors).toContain("Unknown parameter: 'extra'");
  });

  it('should accept unknown params when skipUnknownParameterCheck is true', () => {
    const defs = [makeParamDef({ Name: 'known', Type: 'string' })];
    const result = QueryParameterProcessor.validateParameters(
      { known: 'ok', extra: 'fine' },
      defs as never[],
      true
    );
    expect(result.success).toBe(true);
    // The extra param is not validated/converted, but no error is raised
    expect(result.errors).toHaveLength(0);
  });

  it('should still validate known params even with skipUnknownParameterCheck', () => {
    const defs = [makeParamDef({ Name: 'count', Type: 'number', IsRequired: true })];
    const result = QueryParameterProcessor.validateParameters(
      { count: 'not-a-number', extra: 'ignored' },
      defs as never[],
      true
    );
    expect(result.success).toBe(false);
    expect(result.errors).toContain("Parameter 'count' must be a number");
    // But the unknown param should not appear in errors
    expect(result.errors).not.toContain("Unknown parameter: 'extra'");
  });
});

// =====================================================================
// Tests for forceTemplateProcessing
// =====================================================================
describe('QueryParameterProcessor.processQueryTemplate forceTemplateProcessing', () => {
  beforeEach(() => {
    RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
  });

  it('should skip templates when UsesTemplate=false and forceTemplateProcessing=false', () => {
    const query = {
      SQL: "SELECT * FROM T {% if x %}WHERE x = '{{ x }}'{% endif %}",
      UsesTemplate: false,
      Parameters: [],
    };
    const result = QueryParameterProcessor.processQueryTemplate(
      query as never,
      { x: 'val' },
      undefined,
      false
    );
    // Templates NOT processed — raw Nunjucks syntax returned
    expect(result.success).toBe(true);
    expect(result.processedSQL).toContain('{%');
  });

  it('should process templates when forceTemplateProcessing=true even with UsesTemplate=false', () => {
    const query = {
      SQL: "SELECT * FROM T {% if x %}WHERE x = '{{ x }}'{% endif %}",
      UsesTemplate: false,
      Parameters: [],
    };
    const result = QueryParameterProcessor.processQueryTemplate(
      query as never,
      { x: 'val' },
      undefined,
      true
    );
    expect(result.success).toBe(true);
    expect(result.processedSQL).not.toContain('{%');
    expect(result.processedSQL).toContain("'val'");
  });

  it('should remove falsy Nunjucks blocks when forceTemplateProcessing=true and no params', () => {
    const query = {
      SQL: "SELECT * FROM T {% if Region %}WHERE Region = '{{ Region }}'{% endif %}",
      UsesTemplate: false,
      Parameters: [],
    };
    const result = QueryParameterProcessor.processQueryTemplate(
      query as never,
      undefined,
      undefined,
      true
    );
    expect(result.success).toBe(true);
    expect(result.processedSQL).not.toContain('{%');
    expect(result.processedSQL).not.toContain('WHERE');
    expect(result.processedSQL).toContain('SELECT * FROM T');
  });

  it('should merge extra params not in query.Parameters into render context', () => {
    // The query defines no parameters, but the caller provides one that
    // exists as a Nunjucks token from a dependency
    const query = {
      SQL: "SELECT * FROM T {% if Region %}WHERE Region = '{{ Region }}'{% endif %}",
      UsesTemplate: false,
      Parameters: [],
    };
    const result = QueryParameterProcessor.processQueryTemplate(
      query as never,
      { Region: 'East' },
      undefined,
      true
    );
    expect(result.success).toBe(true);
    expect(result.processedSQL).toContain("'East'");
    expect(result.processedSQL).not.toContain('{%');
    // The merged param should appear in appliedParameters
    expect(result.appliedParameters).toHaveProperty('Region', 'East');
  });

  it('should not reject unknown params when forceTemplateProcessing=true', () => {
    const query = {
      SQL: 'SELECT 1',
      UsesTemplate: false,
      Parameters: [makeParamDef({ Name: 'known', Type: 'string' })],
    };
    // Pass an extra param that's not in query.Parameters
    const result = QueryParameterProcessor.processQueryTemplate(
      query as never,
      { known: 'ok', depParam: 'from-dependency' },
      undefined,
      true
    );
    expect(result.success).toBe(true);
    // Both params should be in appliedParameters
    expect(result.appliedParameters).toHaveProperty('known', 'ok');
    expect(result.appliedParameters).toHaveProperty('depParam', 'from-dependency');
  });

  it('should prioritize validated params over raw params in merge', () => {
    // When a param is in both query.Parameters definitions and in raw params,
    // the validated (type-converted) version should win
    const query = {
      SQL: "SELECT * FROM T WHERE count > {{ count }}",
      UsesTemplate: false,
      Parameters: [makeParamDef({ Name: 'count', Type: 'number' })],
    };
    const result = QueryParameterProcessor.processQueryTemplate(
      query as never,
      { count: '42' },
      undefined,
      true
    );
    expect(result.success).toBe(true);
    // The validated value should be the number 42, not the string '42'
    expect(result.appliedParameters).toHaveProperty('count', 42);
  });
});
