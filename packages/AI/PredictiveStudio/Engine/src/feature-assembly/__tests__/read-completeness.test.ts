import { describe, it, expect } from 'vitest';
import type { FeatureStepGraph, LeakageGuard } from '@memberjunction/predictive-studio-core';

import { FeatureAssemblyExecutor, type DatedSourceSpec } from '../feature-assembly-executor';
import { ReadCapExceededError } from '../read-cap-error';
import type { IFeatureDataAccess, FetchRowsParams, FetchRowsResult, SourceRow } from '../data-access';

/**
 * Read completeness (gate W1 → S7.5, findings F-L3-1 / F-PIT-4). The data-access fake behaves like RunView:
 * it serves at most MaxRows rows and reports the database match count in TotalRowCount.
 */
class CappedDataAccess implements IFeatureDataAccess {
  public readonly Params: FetchRowsParams[] = [];
  constructor(private readonly rowsByEntity: Record<string, SourceRow[]>) {}
  async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    this.Params.push(params);
    const all = this.rowsByEntity[params.EntityName] || [];
    const served = params.MaxRows !== undefined ? all.slice(0, params.MaxRows) : all;
    return { Success: true, Rows: served, TotalRowCount: all.length };
  }
  async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

const STEPS: FeatureStepGraph = { Steps: [{ Id: 's1', Kind: 'select', Columns: ['tenure'] }] };
const GUARD: LeakageGuard = { DenyFields: [], SingleFeatureDominanceThreshold: 0.6 };

function members(n: number): SourceRow[] {
  return Array.from({ length: n }, (_v, i) => ({ ID: `m${i}`, tenure: i, Renewed: i % 2 }));
}

function assemble(dataAccess: IFeatureDataAccess, maxRows: number | undefined, datedSources?: DatedSourceSpec[]) {
  return new FeatureAssemblyExecutor().assemble({
    targetEntityName: 'Members',
    recordSet: { EntityName: 'Members', MaxRows: maxRows },
    sources: [{ Kind: 'Entity', Ref: 'Members' }],
    steps: STEPS,
    asOf: { Mode: 'none' },
    leakageGuard: GUARD,
    datedSources,
    targetVariable: 'Renewed',
    context: 'train',
    dataAccess,
  });
}

describe('FeatureAssembly — read every labelled row or fail naming the cap', () => {
  it('assembles every row when no MaxRows is set (16,776 of 16,776)', async () => {
    const access = new CappedDataAccess({ Members: members(16776) });
    const result = await assemble(access, undefined);
    expect(result.matrix.rows).toHaveLength(16776);
    expect(access.Params[0].MaxRows).toBeUndefined();
  });

  it('fails naming the cap when an explicit MaxRows cuts the read short', async () => {
    const access = new CappedDataAccess({ Members: members(1200) });
    await expect(assemble(access, 1000)).rejects.toThrow("FeatureAssembly read 1000 of 1200 rows of 'Members' because MaxRows=1000.");
    await expect(assemble(access, 1000)).rejects.toMatchObject({ EntityName: 'Members', MaxRows: 1000, RowsRead: 1000, RowsMatched: 1200 });
    await expect(assemble(access, 1000)).rejects.toBeInstanceOf(ReadCapExceededError);
  });

  it('accepts an explicit MaxRows that covers every matching row', async () => {
    const access = new CappedDataAccess({ Members: members(800) });
    const result = await assemble(access, 1000);
    expect(result.matrix.rows).toHaveLength(800);
  });
});

describe('FeatureAssembly — dated sources are read in full (F-PIT-4 cap half)', () => {
  it('reads every row of a dated source (no MaxRows on the dated-source read)', async () => {
    const activities: SourceRow[] = Array.from({ length: 2500 }, (_v, i) => ({
      ID: `a${i}`, MemberID: `m${i % 10}`, ActivityDate: '2024-01-15T00:00:00Z',
    }));
    const access = new CappedDataAccess({ Members: members(10), Activities: activities });
    await assemble(access, undefined, [
      { EntityName: 'Activities', ForeignKeyField: 'MemberID', DateField: 'ActivityDate', Features: [{ OutputColumn: 'activity_count_asof', Aggregate: 'activity_count' }] },
    ]);
    const datedRead = access.Params.find((p) => p.EntityName === 'Activities');
    expect(datedRead).toBeDefined();
    expect(datedRead?.MaxRows).toBeUndefined();
  });
});
