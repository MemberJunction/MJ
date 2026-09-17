import { describe, it, expect, vi } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks — same shape as entityDocumentConfig.test.ts         */
/* ------------------------------------------------------------------ */

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  class MockBaseSingleton<T> {
    private static _instances = new Map<string, unknown>();
    static getInstance<U>(): U {
      const key = this.name;
      if (!MockBaseSingleton._instances.has(key)) {
        MockBaseSingleton._instances.set(key, new (this as unknown as new () => U)());
      }
      return MockBaseSingleton._instances.get(key) as U;
    }
  }

  return {
    ...actual,
    RegisterClass: () => (_target: unknown) => {},
    RequiresSubclass: () => (_target: unknown) => {},
    OptionalKeyedSpecialization: () => (_target: unknown) => {},
    MJGlobal: { Instance: { ClassFactory: { GetRegistration: vi.fn() } } },
    BaseSingleton: MockBaseSingleton,
  };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: class { Entities = []; },
    RunView: class {},
    ValidationResult: class { Errors: unknown[] = []; get Success() { return this.Errors.length === 0; } },
  };
});

vi.mock('@memberjunction/core-entities', () => ({}));
vi.mock('@memberjunction/ai', () => ({}));
vi.mock('@memberjunction/ai-vectordb', () => ({
  VectorDBBase: class { constructor(_k: string) {} },
}));
vi.mock('@memberjunction/ai-vectors', () => ({
  VectorBase: class { CurrentUser: unknown; },
}));
vi.mock('@memberjunction/aiengine', () => ({
  AIEngine: { Instance: { Config: vi.fn() } },
}));
vi.mock('@memberjunction/templates', () => ({
  TemplateEngineServer: { Instance: { Config: vi.fn(), Templates: [], SetupNunjucks: vi.fn() } },
}));
vi.mock('@memberjunction/templates-base-types', () => ({}));

import { EntityVectorSyncer } from '../models/entityVectorSync';

/**
 * `__mj_recordID` — the record id stamped on every vectorized row and persisted to
 * `MJ: Entity Record Documents.RecordID` — must identify the record for ANY entity. It used
 * to read `record[FirstPrimaryKey.Name]`, which silently truncated a composite key to its
 * first column, so two `(OrderID, LineNo)` rows sharing an OrderID collapsed onto one
 * Entity Record Document. It is now the compact CompositeKey URL segment built from the
 * entity's real primary key(s), which `CompositeKey.FromURLSegment` reads back losslessly.
 */

class TestableSyncer extends EntityVectorSyncer {
  public recordIDFor(entity: EntityInfo, record: Record<string, unknown>): string {
    return this.BuildRecordID(entity, record);
  }
}

function fakeEntity(primaryKeys: string[]): EntityInfo {
  const pks = primaryKeys.map((n) => ({ Name: n }));
  return { Name: 'Test', PrimaryKeys: pks, FirstPrimaryKey: pks[0] } as unknown as EntityInfo;
}

describe('EntityVectorSyncer.BuildRecordID', () => {
  const syncer = new TestableSyncer();

  it('is the bare value for a single-column key, whatever the column is called', () => {
    expect(syncer.recordIDFor(fakeEntity(['individual_id']), { individual_id: 42, Name: 'x' })).toBe('42');
  });

  it('is unchanged from the raw value for the common ID-keyed case (back-compat with stored RecordIDs)', () => {
    const id = 'AB6D4F3E-1C2B-4D5E-8F90-123456789ABC';
    expect(syncer.recordIDFor(fakeEntity(['ID']), { ID: id })).toBe(id);
  });

  it('carries every column of a composite key so distinct rows get distinct ids', () => {
    const entity = fakeEntity(['OrderID', 'LineNo']);
    const a = syncer.recordIDFor(entity, { OrderID: 11055, LineNo: 3 });
    const b = syncer.recordIDFor(entity, { OrderID: 11055, LineNo: 4 });
    expect(a).toBe('OrderID|11055||LineNo|3');
    expect(b).toBe('OrderID|11055||LineNo|4');
    expect(a).not.toBe(b);
  });
});
