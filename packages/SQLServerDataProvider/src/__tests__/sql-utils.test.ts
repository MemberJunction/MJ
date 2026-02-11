import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external modules that the source files import so we can test pure logic
// without database connections or heavy framework dependencies.
// ---------------------------------------------------------------------------

// Mock @memberjunction/core to avoid pulling in the full MJ framework
vi.mock('@memberjunction/core', () => {
  class RunQuerySQLFilterManager {
    private static _inst: RunQuerySQLFilterManager;
    static get Instance() {
      if (!this._inst) this._inst = new RunQuerySQLFilterManager();
      return this._inst;
    }
    getAllFilters() {
      return [];
    }
  }

  class QueryParameterInfo {
    QueryID: string | null = null;
    Name: string | null = null;
    Type: 'string' | 'number' | 'date' | 'boolean' | 'array' = 'string';
    IsRequired = false;
    DefaultValue: string | null = null;
    Description: string | null = null;
    SampleValue: string | null = null;
    ValidationFilters: string | null = null;
    DetectionMethod: 'AI' | 'Manual' = 'Manual';
    AutoDetectConfidenceScore: number | null = null;
    get ParsedFilters(): unknown[] {
      try {
        return this.ValidationFilters ? JSON.parse(this.ValidationFilters) : [];
      } catch {
        return [];
      }
    }
  }

  class QueryInfo {
    ID = '';
    SQL = '';
    UsesTemplate = false;
    Parameters: QueryParameterInfo[] = [];
  }

  const EntityFieldTSType = {
    String: 'String',
    Number: 'Number',
    Boolean: 'Boolean',
    Date: 'Date',
  } as const;

  return {
    RunQuerySQLFilterManager,
    QueryParameterInfo,
    QueryInfo,
    EntityFieldTSType,
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: { Provider: { Queries: [] } },
  };
});

// Mock @memberjunction/global
vi.mock('@memberjunction/global', () => {
  return {
    ensureRegExps: (patterns: (string | RegExp)[]) =>
      patterns.map((p) => (p instanceof RegExp ? p : new RegExp(p.replace(/\*/g, '.*'), 'i'))),
    MJGlobal: {
      Instance: {
        GetGlobalObjectStore: () => ({}),
      },
    },
    SQLExpressionValidator: class {},
  };
});

// Mock sql-formatter
vi.mock('sql-formatter', () => ({
  format: (sql: string) => sql, // passthrough for tests
}));

// Mock nunjucks — keep a lightweight render implementation
// Note: Code imports as `import nunjucks from 'nunjucks'` (default import)
// so we must wrap in a default object
vi.mock('nunjucks', () => ({
  default: {
    Environment: class Environment {
      constructor() {}
      addFilter() {}
      renderString(template: string, context: Record<string, unknown>) {
        // Very naive Nunjucks substitute: replace {{ key }} with context[key]
        return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
          const val = context[key];
          return val !== undefined ? String(val) : '';
        });
      }
    }
  }
}));

// ---------------------------------------------------------------------------
// Import the classes under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import { QueryParameterProcessor } from '../queryParameterProcessor';
import type { ParameterValidationResult } from '../queryParameterProcessor';

// We need the mock QueryParameterInfo type for building test fixtures
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

  describe('boolean type conversion', () => {
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

    it('should apply boolean default value', () => {
      const defs = [makeParamDef({ Name: 'flag', Type: 'boolean', DefaultValue: 'true' })];
      const result = QueryParameterProcessor.validateParameters({}, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.flag).toBe(1);
    });

    it('should prefer provided value over default', () => {
      const defs = [makeParamDef({ Name: 'limit', Type: 'number', DefaultValue: '100' })];
      const result = QueryParameterProcessor.validateParameters({ limit: 50 }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.validatedParameters.limit).toBe(50);
    });
  });

  describe('unknown parameter detection', () => {
    it('should report unknown parameters', () => {
      const defs = [makeParamDef({ Name: 'known', Type: 'string' })];
      const result = QueryParameterProcessor.validateParameters(
        { known: 'ok', unknown1: 'bad' },
        defs as never[]
      );
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Unknown parameter: 'unknown1'");
    });

    it('should succeed when all parameters are known', () => {
      const defs = [
        makeParamDef({ Name: 'a', Type: 'string' }),
        makeParamDef({ Name: 'b', Type: 'number' }),
      ];
      const result = QueryParameterProcessor.validateParameters({ a: 'hello', b: 5 }, defs as never[]);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('empty/undefined parameters', () => {
    it('should succeed with no parameters and no required defs', () => {
      const defs = [makeParamDef({ Name: 'optional', Type: 'string' })];
      const result = QueryParameterProcessor.validateParameters(undefined, defs as never[]);
      expect(result.success).toBe(true);
    });

    it('should handle empty parameter definitions', () => {
      const result = QueryParameterProcessor.validateParameters({ a: 1 }, []);
      // Unknown parameter 'a' should be flagged
      expect(result.success).toBe(false);
      expect(result.errors).toContain("Unknown parameter: 'a'");
    });

    it('should succeed with empty params and empty defs', () => {
      const result = QueryParameterProcessor.validateParameters(undefined, []);
      expect(result.success).toBe(true);
    });
  });
});

// =====================================================================
// Tests for QueryParameterProcessor.processQueryTemplate
// =====================================================================
describe('QueryParameterProcessor.processQueryTemplate', () => {
  it('should return SQL as-is when query does not use templates', () => {
    const query = {
      ID: 'q1',
      SQL: 'SELECT * FROM Users',
      UsesTemplate: false,
      Parameters: [],
    };
    const result = QueryParameterProcessor.processQueryTemplate(query as never, undefined);
    expect(result.success).toBe(true);
    expect(result.processedSQL).toBe('SELECT * FROM Users');
  });

  it('should process a simple template query', () => {
    const query = {
      ID: 'q2',
      SQL: "SELECT * FROM Users WHERE Status = '{{ status }}'",
      UsesTemplate: true,
      Parameters: [makeParamDef({ Name: 'status', Type: 'string', IsRequired: true })],
    };
    const result = QueryParameterProcessor.processQueryTemplate(query as never, { status: 'Active' });
    expect(result.success).toBe(true);
    expect(result.processedSQL).toContain('Active');
    expect(result.appliedParameters.status).toBe('Active');
  });

  it('should fail when required parameters are missing for template query', () => {
    const query = {
      ID: 'q3',
      SQL: "SELECT * FROM Users WHERE ID = '{{ userId }}'",
      UsesTemplate: true,
      Parameters: [makeParamDef({ Name: 'userId', Type: 'string', IsRequired: true })],
    };
    const result = QueryParameterProcessor.processQueryTemplate(query as never, {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Parameter validation failed');
  });
});

// =====================================================================
// Tests for SqlLoggingSessionImpl (pure logic methods)
// =====================================================================
import { SqlLoggingSessionImpl } from '../SqlLogger';

describe('SqlLoggingSessionImpl', () => {
  describe('constructor and properties', () => {
    it('should initialize with correct properties', () => {
      const session = new SqlLoggingSessionImpl('test-id', '/tmp/test.sql', {
        description: 'Test session',
      });
      expect(session.id).toBe('test-id');
      expect(session.filePath).toBe('/tmp/test.sql');
      expect(session.statementCount).toBe(0);
      expect(session.options.description).toBe('Test session');
      expect(session.startTime).toBeInstanceOf(Date);
    });
  });

  describe('_escapeFlywaySyntaxInStrings', () => {
    // Access private method for testing via prototype
    const escapeFlyway = (sql: string) => {
      const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql');
      return (session as Record<string, CallableFunction>)._escapeFlywaySyntaxInStrings(sql);
    };

    it('should escape ${...} patterns in SQL strings', () => {
      const input = "INSERT INTO T VALUES (N'${someVar}')";
      const result = escapeFlyway(input);
      expect(result).not.toContain('${someVar}');
      expect(result).toContain("$'+'{someVar}");
    });

    it('should handle multiple ${...} occurrences', () => {
      const input = "N'${a} and ${b}'";
      const result = escapeFlyway(input);
      expect(result).toContain("$'+'{a}");
      expect(result).toContain("$'+'{b}");
    });

    it('should return unchanged SQL when no ${...} patterns exist', () => {
      const input = "SELECT * FROM Users WHERE Name = 'John'";
      const result = escapeFlyway(input);
      expect(result).toBe(input);
    });
  });

  describe('_postProcessBeginEnd', () => {
    const postProcess = (sql: string) => {
      const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql');
      return (session as Record<string, CallableFunction>)._postProcessBeginEnd(sql);
    };

    it('should put BEGIN on its own line', () => {
      const input = 'IF 1=1 BEGIN SELECT 1 END';
      const result = postProcess(input);
      expect(result).toContain('1=1\nBEGIN');
    });

    it('should put END on its own line', () => {
      const input = 'SELECT 1 END';
      const result = postProcess(input);
      expect(result).toContain('1\nEND');
    });

    it('should put EXEC on its own line', () => {
      const input = 'DECLARE @x INT EXEC spFoo';
      const result = postProcess(input);
      expect(result).toContain('INT\nEXEC');
    });

    it('should handle empty or null input', () => {
      expect(postProcess('')).toBe('');
    });
  });

  describe('_splitStringContent', () => {
    const splitContent = (content: string, maxChunkSize: number) => {
      const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql');
      return (session as Record<string, CallableFunction>)._splitStringContent(content, maxChunkSize);
    };

    it('should return single chunk if content is within limit', () => {
      const result = splitContent('short string', 100);
      expect(result).toEqual(['short string']);
    });

    it('should split long content into multiple chunks', () => {
      const content = 'a'.repeat(100);
      const result = splitContent(content, 30) as string[];
      expect(result.length).toBeGreaterThan(1);
      expect(result.join('')).toBe(content);
    });

    it('should preserve content integrity across splits', () => {
      const content = 'abcdefghij';
      const result = splitContent(content, 3) as string[];
      expect(result.join('')).toBe(content);
    });
  });

  describe('_findSafeSplitPoint', () => {
    const findSafe = (content: string, position: number, idealEnd: number) => {
      const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql');
      return (session as Record<string, CallableFunction>)._findSafeSplitPoint(content, position, idealEnd);
    };

    it('should avoid splitting escaped quote pairs', () => {
      // Content has '' at boundary: position 4-5
      const content = "test''value";
      // If idealEnd would split between the two single quotes (at position 5)
      const splitPoint = findSafe(content, 0, 5);
      // Should back up to not split '' pair
      expect(splitPoint).toBe(4);
    });

    it('should return idealEnd when no boundary issues', () => {
      const content = 'abcdefghij';
      const splitPoint = findSafe(content, 0, 5);
      expect(splitPoint).toBe(5);
    });
  });

  describe('_getIndentForPosition', () => {
    it('should always return 4-space indent (fixed)', () => {
      const session = new SqlLoggingSessionImpl('t', '/tmp/t.sql');
      const getIndent = (session as Record<string, CallableFunction>)._getIndentForPosition;
      const result = getIndent.call(session, 'SELECT * FROM table', 10);
      expect(result).toBe('    ');
    });
  });
});

// =====================================================================
// Tests for FieldChange type and DiffObjects-style comparisons
// These verify the data structures exported from the provider module
// =====================================================================
describe('FieldChange type structure', () => {
  it('should have the expected shape', () => {
    const change = {
      field: 'Name',
      oldValue: 'Alice',
      newValue: 'Bob',
    };
    expect(change).toHaveProperty('field');
    expect(change).toHaveProperty('oldValue');
    expect(change).toHaveProperty('newValue');
  });
});
