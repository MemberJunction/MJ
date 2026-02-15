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
    Boolean: 'Boolean',
    Date: 'Date',
    Number: 'Number',
    String: 'String',
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
import { EntityFieldTSType } from '@memberjunction/core';

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

describe('ExternalChangeDetectorEngine - DoValuesDiffer', () => {
  let engine: ExternalChangeDetectorEngine;

  beforeEach(() => {
    engine = new ExternalChangeDetectorEngine();
  });

  // Access protected method via bracket notation for testing
  const callDoValuesDiffer = (
    eng: ExternalChangeDetectorEngine,
    tsType: string,
    v1: unknown,
    v2: unknown
  ) => {
    const field = {
      EntityFieldInfo: { TSType: tsType },
    };
    return (eng as Record<string, Function>)['DoValuesDiffer'](field, v1, v2);
  };

  it('should detect boolean differences', () => {
    const result = callDoValuesDiffer(engine, EntityFieldTSType.Boolean, true, false);
    expect(result.differ).toBe(true);
    expect(result.castValue1).toBe(true);
    expect(result.castValue2).toBe(false);
  });

  it('should convert string booleans', () => {
    const result = callDoValuesDiffer(engine, EntityFieldTSType.Boolean, 'true', 'false');
    expect(result.differ).toBe(true);
    expect(result.castValue1).toBe(true);
    expect(result.castValue2).toBe(false);
  });

  it('should detect equal booleans', () => {
    const result = callDoValuesDiffer(engine, EntityFieldTSType.Boolean, true, true);
    expect(result.differ).toBe(false);
  });

  it('should detect number differences', () => {
    const result = callDoValuesDiffer(engine, EntityFieldTSType.Number, 10, 20);
    expect(result.differ).toBe(true);
  });

  it('should convert string numbers', () => {
    const result = callDoValuesDiffer(engine, EntityFieldTSType.Number, '10', 10);
    expect(result.differ).toBe(false);
  });

  it('should detect string differences', () => {
    const result = callDoValuesDiffer(engine, EntityFieldTSType.String, 'hello', 'world');
    expect(result.differ).toBe(true);
  });

  it('should detect equal strings', () => {
    const result = callDoValuesDiffer(engine, EntityFieldTSType.String, 'same', 'same');
    expect(result.differ).toBe(false);
  });

  it('should detect date differences', () => {
    const d1 = new Date('2024-01-01');
    const d2 = new Date('2024-06-01');
    const result = callDoValuesDiffer(engine, EntityFieldTSType.Date, d1, d2);
    expect(result.differ).toBe(true);
  });

  it('should detect equal dates', () => {
    const d1 = new Date('2024-01-01T00:00:00Z');
    const d2 = new Date('2024-01-01T00:00:00Z');
    const result = callDoValuesDiffer(engine, EntityFieldTSType.Date, d1, d2);
    expect(result.differ).toBe(false);
  });
});
