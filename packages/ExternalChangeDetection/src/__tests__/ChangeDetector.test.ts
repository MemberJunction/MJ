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

// Mock encryption engine for buildEntityFromRow decryption tests.
// IsEncrypted uses the real prefix check; Decrypt strips a known sentinel so
// the tests can assert exactly which values went through decryption.
const mockEncryptionEngine = {
  Config: vi.fn().mockResolvedValue(undefined),
  IsEncrypted: vi.fn((value: unknown, marker?: string): boolean => {
    return typeof value === 'string' && value.startsWith(marker ?? '$ENC$');
  }),
  Decrypt: vi.fn().mockImplementation(async (value: string): Promise<string> => {
    // Strip the $ENC$ prefix and return a deterministic plaintext.
    // e.g. '$ENC$blob:SECRET' → 'SECRET'
    if (typeof value === 'string' && value.startsWith('$ENC$')) {
      const colonIdx = value.lastIndexOf(':');
      return colonIdx > 4 ? value.substring(colonIdx + 1) : 'DECRYPTED';
    }
    return value;
  }),
  GetKeyByID: vi.fn().mockReturnValue({ Marker: '$ENC$' }),
};

vi.mock('@memberjunction/encryption', () => ({
  EncryptionEngine: {
    get Instance() { return mockEncryptionEngine; },
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

// ---------------------------------------------------------------------------
// buildEntityFromRow — decryption of Encrypt=1 fields
//
// Regression for https://github.com/MemberJunction/MJ/issues/2367
//
// Detection queries run via RunQuery, which does NOT call PostProcessRows, so
// encrypted fields are returned as raw $ENC$... strings from the database.
// If we load those values straight into a BaseEntity and call Save(), the
// provider's EncryptFieldValuesForSave guard (IsEncrypted check) does prevent
// MJ's own re-encryption — but any application-level Save() override that
// applies its own encryption will re-encrypt the already-$ENC$ string, and
// MJ's layer will then wrap that again, producing $ENC$(app_enc($ENC$(...))).
// Decrypting in buildEntityFromRow means Save() sees plaintext and the normal
// encrypt-once path runs — identical to a regular Load/Save cycle.
// ---------------------------------------------------------------------------
describe('ExternalChangeDetectorEngine - buildEntityFromRow', () => {
  type RowPayload = Record<string, unknown>;

  const makeEngine = () => {
    const engine = new ExternalChangeDetectorEngine();
    // ContextUser is referenced inside buildEntityFromRow → GetEntityObject
    (engine as unknown as { ContextUser: unknown }).ContextUser = {};
    return engine;
  };

  const callBuildEntityFromRow = async (
    engine: ExternalChangeDetectorEngine,
    md: unknown,
    entity: unknown,
    row: RowPayload
  ): Promise<{ loadedRow: RowPayload; record: unknown }> => {
    let loadedRow: RowPayload = {};
    const record = {
      LoadFromData: vi.fn().mockImplementation((data: RowPayload) => {
        loadedRow = data;
      }),
    };
    (md as { GetEntityObject: ReturnType<typeof vi.fn> }).GetEntityObject = vi
      .fn()
      .mockResolvedValue(record);

    await (engine as unknown as Record<string, Function>)['buildEntityFromRow'](md, entity, row);
    return { loadedRow, record };
  };

  beforeEach(() => {
    mockEncryptionEngine.Decrypt.mockClear();
    mockEncryptionEngine.IsEncrypted.mockClear();
    mockEncryptionEngine.Config.mockClear();
    mockEncryptionEngine.GetKeyByID.mockClear();
  });

  it('should decrypt $ENC$ values on encrypted fields before loading into the entity', async () => {
    const engine = makeEngine();
    const entity = {
      ID: 'ent-credentials',
      Name: 'Credentials',
      Fields: [
        { Name: 'ID', Encrypt: false, EncryptionKeyID: null },
        { Name: 'Name', Encrypt: false, EncryptionKeyID: null },
        { Name: 'APIKey', Encrypt: true, EncryptionKeyID: 'key-1' },
      ],
    };

    const row: RowPayload = {
      ID: 'cred-1',
      Name: 'GitHub Token',
      APIKey: '$ENC$blob:gh_pat_top_secret',
      __ecd_UpdatedAt: '2026-04-13T00:00:00Z',
    };

    const { loadedRow } = await callBuildEntityFromRow(engine, {}, entity, row);

    // Plaintext makes it into the entity — Save() will re-encrypt cleanly.
    expect(loadedRow.APIKey).toBe('gh_pat_top_secret');
    expect(loadedRow.__ecd_UpdatedAt).toBeUndefined(); // __ecd_ columns stripped
    expect(mockEncryptionEngine.Decrypt).toHaveBeenCalledTimes(1);
    expect(mockEncryptionEngine.Decrypt).toHaveBeenCalledWith(
      '$ENC$blob:gh_pat_top_secret',
      expect.anything()
    );
  });

  it('should skip plaintext values on encrypted fields (idempotent)', async () => {
    const engine = makeEngine();
    const entity = {
      ID: 'ent-credentials',
      Name: 'Credentials',
      Fields: [
        { Name: 'APIKey', Encrypt: true, EncryptionKeyID: 'key-1' },
      ],
    };

    const { loadedRow } = await callBuildEntityFromRow(engine, {}, entity, {
      APIKey: 'already-plaintext',
    });

    expect(loadedRow.APIKey).toBe('already-plaintext');
    expect(mockEncryptionEngine.Decrypt).not.toHaveBeenCalled();
  });

  it('should be a no-op for entities with no encrypted fields', async () => {
    const engine = makeEngine();
    const entity = {
      ID: 'ent-users',
      Name: 'Users',
      Fields: [
        { Name: 'ID', Encrypt: false, EncryptionKeyID: null },
        { Name: 'Email', Encrypt: false, EncryptionKeyID: null },
      ],
    };

    const { loadedRow } = await callBuildEntityFromRow(engine, {}, entity, {
      ID: 'u-1',
      Email: 'alice@example.com',
    });

    expect(loadedRow.Email).toBe('alice@example.com');
    expect(mockEncryptionEngine.Config).not.toHaveBeenCalled();
    expect(mockEncryptionEngine.Decrypt).not.toHaveBeenCalled();
  });

  it('should leave value as $ENC$ if decryption fails (no crash, no corruption)', async () => {
    mockEncryptionEngine.Decrypt.mockRejectedValueOnce(new Error('bad key'));

    const engine = makeEngine();
    const entity = {
      ID: 'ent-credentials',
      Name: 'Credentials',
      Fields: [
        { Name: 'APIKey', Encrypt: true, EncryptionKeyID: 'key-1' },
      ],
    };

    const { loadedRow } = await callBuildEntityFromRow(engine, {}, entity, {
      APIKey: '$ENC$blob:unrecoverable',
    });

    // Save() will then see the $ENC$ prefix and EncryptFieldValuesForSave
    // will skip re-encryption via its IsEncrypted guard. DB value is preserved
    // rather than corrupted.
    expect(loadedRow.APIKey).toBe('$ENC$blob:unrecoverable');
  });

  it('should skip fields marked Encrypt=1 but with no EncryptionKeyID configured', async () => {
    const engine = makeEngine();
    const entity = {
      ID: 'ent-weird',
      Name: 'Misconfigured',
      Fields: [
        // Metadata says encrypt but no key — can't decrypt, can't encrypt either.
        { Name: 'Mystery', Encrypt: true, EncryptionKeyID: null },
      ],
    };

    const { loadedRow } = await callBuildEntityFromRow(engine, {}, entity, {
      Mystery: '$ENC$blob:unknown',
    });

    expect(loadedRow.Mystery).toBe('$ENC$blob:unknown');
    expect(mockEncryptionEngine.Decrypt).not.toHaveBeenCalled();
  });
});
