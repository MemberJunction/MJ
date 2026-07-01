import { describe, it, expect } from 'vitest';
import type { UserInfo, BaseEntity } from '@memberjunction/core';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';

import { upsertScoringBinding, recordScoringRun } from '../scoring-binding';
import type { IEntityFactory } from '../../training';

/**
 * Tests for the ML Model Scoring Binding helper (plan §4.6). The binding ties a
 * model to the Record Process that scores it (+ target/column + mode + monitoring
 * fields) so scoring is lineage-tracked. NO live DB — the entity-creation seam is
 * an in-memory fake exposing exactly the typed fields the helper writes.
 */

interface FakeSaveResult {
  CompleteMessage: string;
}

class FakeBinding {
  public ID = 'binding-1';
  public MLModelID = '';
  public RecordProcessID = '';
  public TargetEntityID: string | null = null;
  public TargetColumn: string | null = null;
  public Mode: 'Materialized' | 'OnDemand' | 'Scheduled' = 'OnDemand';
  public MaterializedResultID: string | null = null;
  public LastScoredAt: Date | null = null;
  public LastRowCount: number | null = null;
  public LatestResult: FakeSaveResult | null = null;
  public SaveCallCount = 0;
  public LoadedId: string | null = null;
  private saveOk: boolean;

  constructor(saveOk = true) {
    this.saveOk = saveOk;
  }

  public failNextSaveWith(message: string): void {
    this.saveOk = false;
    this.LatestResult = { CompleteMessage: message };
  }

  public async Load(id: string): Promise<boolean> {
    this.LoadedId = id;
    this.ID = id;
    return true;
  }

  public async Save(): Promise<boolean> {
    this.SaveCallCount++;
    if (!this.saveOk) {
      return false;
    }
    this.LatestResult = { CompleteMessage: '' };
    return true;
  }
}

class FakeEntityFactory implements IEntityFactory {
  public readonly Bindings: FakeBinding[] = [];
  constructor(private readonly factory: () => FakeBinding = () => new FakeBinding()) {}
  async getEntityObject<T extends BaseEntity>(entityName: string, _u?: UserInfo): Promise<T> {
    if (entityName !== 'MJ: ML Model Scoring Bindings') {
      throw new Error(`unexpected entity ${entityName}`);
    }
    const b = this.factory();
    this.Bindings.push(b);
    return b as unknown as T;
  }
}

describe('upsertScoringBinding — create', () => {
  it('creates a new OnDemand binding tying model → record process', async () => {
    const factory = new FakeEntityFactory();
    const binding = (await upsertScoringBinding(
      {
        mlModelId: 'model-1',
        recordProcessId: 'rp-1',
        targetEntityId: 'ent-members',
        targetColumn: 'RenewalScore',
        mode: 'OnDemand',
      },
      factory,
    )) as unknown as FakeBinding;

    expect(binding.MLModelID).toBe('model-1');
    expect(binding.RecordProcessID).toBe('rp-1');
    expect(binding.TargetEntityID).toBe('ent-members');
    expect(binding.TargetColumn).toBe('RenewalScore');
    expect(binding.Mode).toBe('OnDemand');
    expect(binding.SaveCallCount).toBe(1);
    expect(binding.LoadedId).toBeNull(); // create path — never loaded
  });

  it('defaults Mode to OnDemand when omitted', async () => {
    const factory = new FakeEntityFactory();
    const binding = (await upsertScoringBinding({ mlModelId: 'm', recordProcessId: 'rp' }, factory)) as unknown as FakeBinding;
    expect(binding.Mode).toBe('OnDemand');
  });

  it('supports the Scheduled mode for the scheduled scoring path', async () => {
    const factory = new FakeEntityFactory();
    const binding = (await upsertScoringBinding({ mlModelId: 'm', recordProcessId: 'rp', mode: 'Scheduled' }, factory)) as unknown as FakeBinding;
    expect(binding.Mode).toBe('Scheduled');
  });
});

describe('upsertScoringBinding — update', () => {
  it('loads the existing binding by id before updating', async () => {
    const factory = new FakeEntityFactory();
    const binding = (await upsertScoringBinding(
      { bindingId: 'existing-7', mlModelId: 'm', recordProcessId: 'rp', lastRowCount: 42 },
      factory,
    )) as unknown as FakeBinding;
    expect(binding.LoadedId).toBe('existing-7');
    expect(binding.LastRowCount).toBe(42);
  });

  it('throws the CompleteMessage when Save fails', async () => {
    const factory = new FakeEntityFactory(() => {
      const b = new FakeBinding();
      b.failNextSaveWith('FK violation on MLModelID');
      return b;
    });
    await expect(upsertScoringBinding({ mlModelId: 'm', recordProcessId: 'rp' }, factory)).rejects.toThrow(/FK violation on MLModelID/);
  });
});

describe('recordScoringRun — monitoring stamp', () => {
  it('stamps LastScoredAt + LastRowCount after a run', async () => {
    const factory = new FakeEntityFactory();
    const before = Date.now();
    const binding = (await recordScoringRun('b-1', { mlModelId: 'm', recordProcessId: 'rp', mode: 'Scheduled' }, 137, factory)) as unknown as FakeBinding;
    expect(binding.LastRowCount).toBe(137);
    expect(binding.Mode).toBe('Scheduled');
    expect(binding.LastScoredAt).toBeInstanceOf(Date);
    expect(binding.LastScoredAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(binding.LoadedId).toBe('b-1');
  });
});
