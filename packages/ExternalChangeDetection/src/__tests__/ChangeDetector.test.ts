/**
 * Unit tests for the ExternalChangeDetection package.
 * Tests: FieldChange, ChangeDetectionItem, ChangeDetectionResult,
 * DoValuesDiffer logic, and SQL query generation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@memberjunction/core', () => {
  class FakeCompositeKey {
    KeyValuePairs: { FieldName: string; Value: unknown }[];
    constructor(pairs?: { FieldName: string; Value: unknown }[]) {
      this.KeyValuePairs = pairs ?? [];
    }
    ToConcatenatedString() {
      return this.KeyValuePairs.map(p => `${p.FieldName}|${p.Value}`).join('||');
    }
    Equals(other: FakeCompositeKey) {
      return this.ToConcatenatedString() === other.ToConcatenatedString();
    }
    EqualsKey(kvps: { FieldName: string; Value: unknown }[]) {
      const otherStr = kvps.map(p => `${p.FieldName}|${p.Value}`).join('||');
      return this.ToConcatenatedString() === otherStr;
    }
    LoadFromSingleKeyValuePair(fieldName: string, value: string) {
      this.KeyValuePairs = [{ FieldName: fieldName, Value: value }];
    }
    LoadFromConcatenatedString(str: string) {
      this.KeyValuePairs = str.split('||').map(s => {
        const [f, v] = s.split('|');
        return { FieldName: f, Value: v };
      });
    }
    static DefaultValueDelimiter = '|';
    static DefaultFieldDelimiter = '||';
  }
  const EntityFieldTSType = {
    Boolean: 'boolean',
    Date: 'Date',
    Number: 'number',
    String: 'string',
  };
  return {
    BaseEngine: class {
      Load = vi.fn();
      ProviderToUse = {};
      ContextUser = {};
      TryThrowIfNotLoaded() {}
      static getInstance() { return new this(); }
    },
    BaseEnginePropertyConfig: class {},
    BaseEntity: class {
      Fields: unknown[] = [];
      GetAll() { return {}; }
      InnerLoad = vi.fn().mockResolvedValue(true);
      LoadFromData = vi.fn();
      Save = vi.fn().mockResolvedValue(true);
      Delete = vi.fn().mockResolvedValue(true);
      LatestResult: { CompleteMessage: string } | null = null;
    },
    CompositeKey: FakeCompositeKey,
    ConsoleColor: { gray: 'gray', cyan: 'cyan', crimson: 'crimson', green: 'green', red: 'red' },
    EntityField: class {},
    EntityFieldInfo: class {},
    EntityFieldTSType,
    EntityInfo: class {
      static UpdatedAtFieldName = '__mj_UpdatedAt';
      static CreatedAtFieldName = '__mj_CreatedAt';
    },
    IMetadataProvider: class {},
    KeyValuePair: class {},
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: class {
      Entities = [];
      GetEntityObject = vi.fn();
      EntityByID = vi.fn();
      static Provider = {};
    },
    RunView: class {
      RunView = vi.fn();
    },
    UpdateCurrentConsoleLine: vi.fn(),
    UpdateCurrentConsoleProgress: vi.fn(),
    UserInfo: class {},
    RegisterForStartup: () => (target: unknown) => target,
  };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJRecordChangeEntity: class {
    ID = 'rc-1';
    EntityID = '';
    RecordID = '';
    Source = '';
    Type = '';
    Status = '';
    ChangedAt = new Date();
    ChangesJSON = '';
    ChangesDescription = '';
    FullRecordJSON = '';
    UserID = '';
    ErrorLog = '';
    ReplayRunID = '';
    Save = vi.fn().mockResolvedValue(true);
  },
  MJRecordChangeReplayRunEntity: class {
    ID = 'run-1';
    StartedAt: Date | null = null;
    EndedAt: Date | null = null;
    Status = '';
    UserID = '';
    Save = vi.fn().mockResolvedValue(true);
  },
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
  SQLServerDataProvider: class {
    MJCoreSchemaName = '__mj';
    ExecuteSQL = vi.fn().mockResolvedValue([]);
    CreateUserDescriptionOfChanges = vi.fn().mockReturnValue('Updated fields');
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  FieldChange,
  ChangeDetectionItem,
  ChangeDetectionResult,
  ExternalChangeDetectorEngine,
} from '../ChangeDetector';

// Real EntityFieldTSType values used directly to avoid mock interception issues.
// These must match the values in @memberjunction/core entityInfo.ts.
const TSType = {
  Boolean: 'boolean',
  Date: 'Date',
  Number: 'number',
  String: 'string',
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FieldChange', () => {
  it('should be instantiable with properties', () => {
    const fc = new FieldChange();
    fc.FieldName = 'Name';
    fc.OldValue = 'Alice';
    fc.NewValue = 'Bob';
    expect(fc.FieldName).toBe('Name');
  });
});

describe('ChangeDetectionItem', () => {
  it('should be instantiable with default values', () => {
    const item = new ChangeDetectionItem();
    expect(item.LegacyKey).toBe(false);
    expect(item.Changes).toBeUndefined();
  });

  it('should accept Create type', () => {
    const item = new ChangeDetectionItem();
    item.Type = 'Create';
    expect(item.Type).toBe('Create');
  });
});

describe('ChangeDetectionResult', () => {
  it('should be instantiable', () => {
    const result = new ChangeDetectionResult();
    result.Success = true;
    result.Changes = [];
    expect(result.Success).toBe(true);
  });
});

describe('ExternalChangeDetectorEngine - buildDetectionParams uses correct PK', () => {
  it('should build detection params with entity-specific PK column, not "ID"', () => {
    const engine = new ExternalChangeDetectorEngine();

    // Initialize dialect (needed by buildDetectionParams -> getPrimaryKeyString)
    (engine as unknown as Record<string, unknown>)['_dialect'] = {
      ConcatOperator: () => '+',
      CastToText: (expr: string) => `CAST(${expr} AS NVARCHAR(MAX))`,
      QuoteIdentifier: (id: string) => `[${id}]`,
    };

    // Simulate an EntityInfo with PK = TicketId (not the default "ID")
    // This is what the fix ensures: _EligibleEntities contains EntityInfo objects
    // where PrimaryKeys reflects the actual entity, not the "MJ: Entities" table.
    const entityInfo = {
      ID: 'entity-1',
      Name: 'Event Tickets',
      SchemaName: 'ym',
      BaseView: 'vwEventTickets',
      PrimaryKeys: [{ Name: 'TicketId', IsPrimaryKey: true }],
    };

    // Also set up EligibleEntities so validateEntityEligibility passes
    (engine as unknown as Record<string, unknown[]>)['_EligibleEntities'] = [entityInfo];
    (engine as unknown as Record<string, string[]>)['_IneligibleEntities'] = [];

    // Call the private buildDetectionParams method
    const params = (engine as unknown as Record<string, Function>)['buildDetectionParams'](entityInfo);

    // All three query param sets should reference TicketId, NOT ID
    expect(params.creation.PrimaryKeyJoin).toContain('[TicketId]');
    expect(params.creation.PrimaryKeyJoin).not.toContain('[ID]');

    expect(params.update.PrimaryKeyJoin).toContain('[TicketId]');
    expect(params.update.PrimaryKeyOrderBy).toBe('ot.[TicketId]');

    expect(params.deletion.PrimaryKeyJoin).toContain('[TicketId]');
    expect(params.deletion.PrimaryKeyIsNull).toBe('ot.[TicketId] IS NULL');
  });

  it('should handle composite primary keys correctly', () => {
    const engine = new ExternalChangeDetectorEngine();

    (engine as unknown as Record<string, unknown>)['_dialect'] = {
      ConcatOperator: () => '+',
      CastToText: (expr: string) => `CAST(${expr} AS NVARCHAR(MAX))`,
      QuoteIdentifier: (id: string) => `[${id}]`,
    };

    const entityInfo = {
      ID: 'entity-2',
      Name: 'Person Attributes',
      SchemaName: 'dbo',
      BaseView: 'vwPersonAttributes',
      PrimaryKeys: [
        { Name: 'PersonID', IsPrimaryKey: true },
        { Name: 'Name', IsPrimaryKey: true },
      ],
    };

    (engine as unknown as Record<string, unknown[]>)['_EligibleEntities'] = [entityInfo];
    (engine as unknown as Record<string, string[]>)['_IneligibleEntities'] = [];

    const params = (engine as unknown as Record<string, Function>)['buildDetectionParams'](entityInfo);

    // Should contain both PK fields
    expect(params.creation.PrimaryKeyJoin).toContain('[PersonID]');
    expect(params.creation.PrimaryKeyJoin).toContain('[Name]');
    expect(params.update.PrimaryKeyOrderBy).toBe('ot.[PersonID], ot.[Name]');
    expect(params.deletion.PrimaryKeyIsNull).toBe('ot.[PersonID] IS NULL AND ot.[Name] IS NULL');
  });
});

describe('ExternalChangeDetectorEngine - getPrimaryKeyString uses correct PK field', () => {
  it('should generate SQL with the entity-specific PK column, not "ID"', () => {
    const engine = new ExternalChangeDetectorEngine();

    // Initialize dialect (needed by getPrimaryKeyString)
    (engine as unknown as Record<string, unknown>)['_dialect'] = {
      ConcatOperator: () => '+',
      CastToText: (expr: string) => `CAST(${expr} AS NVARCHAR(MAX))`,
      QuoteIdentifier: (id: string) => `[${id}]`,
    };

    // EntityInfo with PK = TicketId (not ID)
    const entityInfo = {
      PrimaryKeys: [{ Name: 'TicketId', IsPrimaryKey: true }],
    };

    const result = (engine as unknown as Record<string, Function>)['getPrimaryKeyString'](entityInfo, 'ot');

    // Should reference [TicketId], NOT [ID]
    expect(result).toContain('[TicketId]');
    expect(result).not.toContain('[ID]');
    expect(result).toBe("'TicketId|' + CAST([ot].[TicketId] AS NVARCHAR(MAX))");
  });
});

describe('ExternalChangeDetectorEngine - DoValuesDiffer', () => {
  let engine: ExternalChangeDetectorEngine;

  beforeEach(() => {
    engine = new ExternalChangeDetectorEngine();
  });

  // Access protected method via bracket notation for testing.
  // DoValuesDiffer(tsType, value1, value2) takes the TSType string directly.
  const callDoValuesDiffer = (
    eng: ExternalChangeDetectorEngine,
    tsType: string,
    v1: unknown,
    v2: unknown
  ) => {
    return (eng as unknown as Record<string, Function>)['DoValuesDiffer'](tsType, v1, v2);
  };

  it('should detect boolean differences', () => {
    const result = callDoValuesDiffer(engine, TSType.Boolean, true, false);
    expect(result.differ).toBe(true);
    expect(result.castValue1).toBe(true);
    expect(result.castValue2).toBe(false);
  });

  it('should convert string booleans', () => {
    // CastToBoolean properly parses string representations:
    // 'true' → true, 'false' → false (not treated as truthy string)
    const result = callDoValuesDiffer(engine, TSType.Boolean, 'true', 'false');
    expect(result.differ).toBe(true);
    expect(result.castValue1).toBe(true);
    expect(result.castValue2).toBe(false);
  });

  it('should detect equal booleans', () => {
    const result = callDoValuesDiffer(engine, TSType.Boolean, true, true);
    expect(result.differ).toBe(false);
  });

  it('should detect number differences', () => {
    const result = callDoValuesDiffer(engine, TSType.Number, 10, 20);
    expect(result.differ).toBe(true);
  });

  it('should convert string numbers', () => {
    const result = callDoValuesDiffer(engine, TSType.Number, '10', 10);
    expect(result.differ).toBe(false);
  });

  it('should detect string differences', () => {
    const result = callDoValuesDiffer(engine, TSType.String, 'hello', 'world');
    expect(result.differ).toBe(true);
  });

  it('should detect equal strings', () => {
    const result = callDoValuesDiffer(engine, TSType.String, 'same', 'same');
    expect(result.differ).toBe(false);
  });

  it('should detect date differences', () => {
    const d1 = new Date('2024-01-01');
    const d2 = new Date('2024-06-01');
    const result = callDoValuesDiffer(engine, TSType.Date, d1, d2);
    expect(result.differ).toBe(true);
  });

  it('should detect equal dates', () => {
    const d1 = new Date('2024-01-01T00:00:00Z');
    const d2 = new Date('2024-01-01T00:00:00Z');
    const result = callDoValuesDiffer(engine, TSType.Date, d1, d2);
    expect(result.differ).toBe(false);
  });
});
