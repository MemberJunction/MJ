import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity } from '@memberjunction/core';

// Neutralize class-factory registration, as the package's other entity tests do.
vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual, RegisterClass: () => (target: object) => target };
});

import { MJPredictionUnitEntityServer, VersionedRowGuard } from '../custom/MJPredictionUnitEntityServer.server';
import { MJEvaluationProtocolEntityServer } from '../custom/MJEvaluationProtocolEntityServer.server';
import { MJTrainingSnapshotEntityServer } from '../custom/MJTrainingSnapshotEntityServer.server';
import { MJMLTrainingPipelineEntityServer } from '../custom/MJMLTrainingPipelineEntityServer.server';

describe('GetVersionedRowUpdateProblem', () => {
  it('allows a new row and a saved row with no change', () => {
    expect(VersionedRowGuard.GetVersionedRowUpdateProblem('MJ: Prediction Units', false, ['Name'])).toBeNull();
    expect(VersionedRowGuard.GetVersionedRowUpdateProblem('MJ: Prediction Units', true, [])).toBeNull();
  });
  it('refuses any change to a saved version, naming the fields', () => {
    expect(VersionedRowGuard.GetVersionedRowUpdateProblem('MJ: Prediction Units', true, ['LabelRule', 'LabelWindowDays'])).toBe(
      'MJ: Prediction Units rows are immutable versions; LabelRule, LabelWindowDays cannot be changed on a saved version. Save a new version instead (Version + 1, same LineageRootID).',
    );
  });
});

describe('GetTrainingSnapshotRowProblems', () => {
  it('refuses an incomplete read and a malformed hash', () => {
    const problems = MJTrainingSnapshotEntityServer.GetTrainingSnapshotRowProblems({ ReadComplete: false, ContentHash: 'abc', MatrixSha256: 'a'.repeat(64), RowManifestSha256: 'b'.repeat(64), ProvenanceSha256: 'c'.repeat(64), FeatureSchemaHash: 'd'.repeat(64) });
    expect(problems).toContain('ReadComplete must be true: a snapshot exists only for a complete read');
    expect(problems).toContain('ContentHash must be 64 lower-case hex characters');
  });
});

describe('GetPipelineUnitProtocolProblems', () => {
  const unit = { TaskType: JSON.stringify({ kind: 'count' }), RowEntityID: 'E-ROW', DescribedLabel: 'Target within 31 days' };
  it('refuses a protocol whose primary score family differs from the unit task kind', () => {
    const problems = MJMLTrainingPipelineEntityServer.GetPipelineUnitProtocolProblems(
      { TargetEntityID: 'E-ROW', ProblemType: 'regression', TargetVariable: 'Target within 31 days' },
      unit,
      { PrimaryScore: JSON.stringify({ family: 'continuous', metric: 'rmse' }) },
    );
    expect(problems).toContain('The Evaluation Protocol scores family "continuous" but the Prediction Unit declares task "count"; ranking a count model by a continuous score is refused');
  });
  it('refuses legacy columns that disagree with the unit', () => {
    const problems = MJMLTrainingPipelineEntityServer.GetPipelineUnitProtocolProblems({ TargetEntityID: 'OTHER', ProblemType: 'classification', TargetVariable: 'x' }, unit, null);
    expect(problems).toEqual([
      'TargetEntityID must be the unit\'s row entity (E-ROW) when PredictionUnitID is set',
      'ProblemType must be regression for a count unit',
      'TargetVariable must read "Target within 31 days" (the unit\'s outcome rule)',
    ]);
  });
});

/** A server entity object with only the members the Save override reads, so no database or metadata is needed. */
function newRowOf<T extends object>(ctor: { prototype: T }, members: { IsSaved: boolean; Version: number; ID: string; LineageRootID: string }): T {
  const row = Object.create(ctor.prototype) as T;
  for (const [name, value] of Object.entries(members)) {
    Object.defineProperty(row, name, { value, writable: true, configurable: true });
  }
  return row;
}

describe.each([
  ['MJ: Prediction Units', MJPredictionUnitEntityServer],
  ['MJ: Evaluation Protocols', MJEvaluationProtocolEntityServer],
])('%s Save adopts the lineage root', (_name, ctor) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('sets LineageRootID to ID on a new version-1 row before the base save runs', async () => {
    let rootAtBaseSave = '';
    vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: { LineageRootID: string }) {
      rootAtBaseSave = this.LineageRootID;
      return true;
    });
    const row = newRowOf(ctor, { IsSaved: false, Version: 1, ID: 'ID-1', LineageRootID: 'SOMETHING-ELSE' });
    expect(await row.Save()).toBe(true);
    expect(rootAtBaseSave).toBe('ID-1');
    const blank = newRowOf(ctor, { IsSaved: false, Version: 1, ID: 'ID-2', LineageRootID: '' });
    await blank.Save();
    expect(blank.LineageRootID).toBe('ID-2');
  });
  it('leaves a later version and a saved row alone', async () => {
    vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
    const later = newRowOf(ctor, { IsSaved: false, Version: 2, ID: 'ID-3', LineageRootID: 'ROOT' });
    await later.Save();
    expect(later.LineageRootID).toBe('ROOT');
    const saved = newRowOf(ctor, { IsSaved: true, Version: 1, ID: 'ID-4', LineageRootID: 'ROOT' });
    await saved.Save();
    expect(saved.LineageRootID).toBe('ROOT');
  });
});
