/**
 * The push field loop leaves out a field whose `@env:VAR?optional` variable is not set,
 * still pushes the rest of the record, and warns once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RecordData, BatchContext, SyncResolutionCollector } from '../lib/sync-engine';
import type { FlattenedRecord } from '../lib/record-dependency-analyzer';
import type { PushOptions } from '../services/PushService';
import type { BaseEntity, UserInfo, EntityInfo } from '@memberjunction/core';
import { OptionalEnvMissingError } from '../lib/env-reference';

/** Minimal entity with BaseEntity's dirty tracking. */
class MockBaseEntity {
  public data: Record<string, unknown>;
  private original: Record<string, unknown>;
  public PrimaryKeys = [{ Name: 'ID' }];
  public Fields = [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Description' }];

  constructor(initialData: Record<string, unknown> = {}) {
    this.data = { ...initialData };
    this.original = { ...initialData };
  }

  get Dirty(): boolean {
    return Object.keys(this.GetChangesSinceLastSave()).length > 0;
  }

  Get(fieldName: string): unknown {
    return this.data[fieldName];
  }

  Set(fieldName: string, value: unknown): void {
    this.data[fieldName] = value;
  }

  GetFieldByName(fieldName: string) {
    return { Name: fieldName, OldValue: this.original[fieldName], EntityFieldInfo: { Type: 'nvarchar' } };
  }

  GetChangesSinceLastSave(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(this.data)) {
      if (this.original[k] !== v) changes[k] = v;
    }
    return changes;
  }

  NewRecord(): void {
    this.data = { ID: crypto.randomUUID() };
    this.original = {};
  }

  GetAll(): Record<string, unknown> {
    return { ...this.data };
  }

  async Save(): Promise<boolean> {
    return true;
  }
}

let mockEntityInstance: MockBaseEntity;
vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockMetadata {
    public async GetEntityObject(): Promise<MockBaseEntity> {
      return mockEntityInstance;
    }
    public EntityByName(): EntityInfo | null {
      return {
        Name: 'TestEntity',
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Description' }],
      } as unknown as EntityInfo;
    }
  }
  return { ...actual, Metadata: MockMetadata };
});

import { PushService } from '../services/PushService';
import { SyncEngine } from '../lib/sync-engine';

class TestablePushService extends PushService {
  public async process(flattenedRecord: FlattenedRecord, options: PushOptions, warnings: string[]) {
    const batchContext: BatchContext = new Map();
    return this.processFlattenedRecord(flattenedRecord, '/dummy/dir', options, batchContext, {
      onLog: () => undefined,
      onWarn: (message: string) => warnings.push(message),
    });
  }
}

function flatten(record: RecordData): FlattenedRecord {
  return {
    id: 'rec-1',
    record,
    entityName: 'TestEntity',
    depth: 0,
    path: 'test/path.json',
    dependencies: new Set(),
    originalIndex: 0,
    graphId: 'graph-1',
  };
}

describe('push leaves out an @env:VAR?optional field whose variable is not set', () => {
  let service: TestablePushService;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    syncEngine = {
      getEntityInfo: vi.fn().mockReturnValue({
        Name: 'TestEntity',
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [{ Name: 'ID' }, { Name: 'Name' }, { Name: 'Description' }],
      }),
      processFieldValue: vi.fn().mockImplementation(async (value: unknown) => {
        if (value === '@env:MJ_PUSH_OPT_TEST?optional') {
          throw new OptionalEnvMissingError('MJ_PUSH_OPT_TEST');
        }
        return value;
      }),
      loadEntity: vi.fn(),
      calculateChecksumWithFileContent: vi.fn().mockResolvedValue('sha256-x'),
      setMetadataEngine: vi.fn(),
      buildDefaults: vi.fn().mockResolvedValue({}),
    } as unknown as SyncEngine;
    service = new TestablePushService(syncEngine, {} as UserInfo);
    mockEntityInstance = new MockBaseEntity({ ID: '1', Name: 'Old Name', Description: 'Kept in DB' });
    vi.mocked(syncEngine.loadEntity).mockResolvedValue(mockEntityInstance as unknown as BaseEntity);
  });

  it('keeps the database value, sets the other fields, and warns once', async () => {
    const record: RecordData = {
      primaryKey: { ID: '1' },
      fields: { Name: 'New Name', Description: '@env:MJ_PUSH_OPT_TEST?optional' },
    };
    const warnings: string[] = [];

    const result = await service.process(flatten(record), { dryRun: true }, warnings);

    expect(result.status).toBe('updated');
    expect(mockEntityInstance.data.Description).toBe('Kept in DB');
    expect(mockEntityInstance.data.Name).toBe('New Name');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('TestEntity.Description was not pushed: optional variable MJ_PUSH_OPT_TEST is not set');
    expect(result.warnings).toEqual(['TestEntity.Description was not pushed: optional variable MJ_PUSH_OPT_TEST is not set']);
  });

  it('is unchanged when the optional field is the only difference', async () => {
    const record: RecordData = {
      primaryKey: { ID: '1' },
      fields: { Name: 'Old Name', Description: '@env:MJ_PUSH_OPT_TEST?optional' },
    };

    const result = await service.process(flatten(record), { dryRun: true }, []);

    expect(result.status).toBe('unchanged');
  });
});

describe('setCompositionField with @env:VAR?optional', () => {
  let service: PushService;
  let syncEngine: SyncEngine;

  beforeEach(() => {
    vi.stubEnv('MJ_PUSH_OPT_TEST', undefined);
    syncEngine = {
      processFieldValue: vi.fn().mockImplementation(async (value: unknown) => {
        if (value === '@env:MJ_PUSH_OPT_TEST?optional') {
          throw new OptionalEnvMissingError('MJ_PUSH_OPT_TEST');
        }
        if (value === 'boom') {
          throw new Error('value processing failed');
        }
        return value;
      }),
      setMetadataEngine: vi.fn(),
    } as unknown as SyncEngine;
    service = new PushService(syncEngine, {} as UserInfo);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function childTarget(): { Set: ReturnType<typeof vi.fn>; EntityInfo: { Name: string } } {
    return { Set: vi.fn(), EntityInfo: { Name: 'MJ: Child' } };
  }

  async function setField(target: ReturnType<typeof childTarget>, rawValue: unknown): Promise<void> {
    const collector: SyncResolutionCollector = { notes: [], fieldPrefix: 'fields' };
    await service['setCompositionField'](
      target as unknown as BaseEntity,
      'Secret',
      rawValue,
      '/dummy/dir',
      new Map(),
      collector,
      undefined,
      {} as BaseEntity
    );
  }

  it('leaves the field out and warns when the optional variable is not set', async () => {
    const target = childTarget();

    await setField(target, '@env:MJ_PUSH_OPT_TEST?optional');

    expect(target.Set).not.toHaveBeenCalled();
    expect(service['warnings']).toContain('MJ: Child.Secret was not pushed: optional variable MJ_PUSH_OPT_TEST is not set');
  });

  it('rethrows any other error from value processing', async () => {
    const target = childTarget();

    await expect(setField(target, 'boom')).rejects.toThrow('value processing failed');
    expect(target.Set).not.toHaveBeenCalled();
  });
});
