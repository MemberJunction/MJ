/**
 * The scoring gates' pure steps (Task M5.10): `ScoringLineage.Join` and `Complete` (G5.3/G5.4's single-join lineage
 * rule) over in-memory rows, and `EmptyColumnRuntime.Empty` (G5.5's all-null column injection).
 */
import { describe, it, expect } from 'vitest';
import type { ScoringAssembly } from '@memberjunction/predictive-studio';
import { ScoringLineage, type LineageModelRow, type LineageRunRow, type LineageValueRow } from '../ps-gate-scoring-lineage';
import { EmptyColumnRuntime } from '../ps-gate-scoring';

const MODEL = 'A0000000-0000-4000-8000-00000000000A';
const RUN = 'B0000000-0000-4000-8000-00000000000B';
const HASH = 'ab'.repeat(32);
const AS_OF = '2026-11-18T00:00:00.000Z';

function value(over: Partial<LineageValueRow> = {}): LineageValueRow {
  return { ID: 'FV1', RecordID: 'r1', MLModelID: MODEL, MLScoringRunID: RUN, EffectiveAsOf: new Date(AS_OF), ...over };
}
const run: LineageRunRow = { ID: RUN, ModelID: MODEL, ArtifactSha256: HASH, AsOfDate: new Date(AS_OF) };
const model: LineageModelRow = { ID: MODEL, ArtifactSha256: HASH.toUpperCase() };

describe('ScoringLineage.Join and Complete', () => {
  it('a row that names its run and model, whose hash and as-of agree, is complete (IDs and hashes compared case-insensitively)', () => {
    const [row] = ScoringLineage.Join([value({ MLModelID: MODEL.toLowerCase(), MLScoringRunID: RUN.toLowerCase() })], [run], [model]);
    expect([row.Run?.ID, row.Model?.ID, ScoringLineage.Complete(row), ScoringLineage.Lacks(row)]).toEqual([RUN, MODEL, true, 'complete']);
  });

  it('a run written without its artifact hash leaves every row incomplete (G5.3\'s mutation)', () => {
    const [row] = ScoringLineage.Join([value()], [{ ...run, ArtifactSha256: null }], [model]);
    expect([ScoringLineage.Complete(row), ScoringLineage.Lacks(row)]).toEqual([false, `run hash null ≠ model hash ${HASH.toUpperCase()}`]);
  });

  it('an EffectiveAsOf that is not the run\'s AsOfDate is incomplete (G5.4\'s mutation), and the same instant as ISO text is complete', () => {
    const [late] = ScoringLineage.Join([value({ EffectiveAsOf: new Date('2026-11-18T13:14:15.000Z') })], [run], [model]);
    const [text] = ScoringLineage.Join([value()], [{ ...run, AsOfDate: new Date('2026-11-18T00:00:00+00:00') }], [model]);
    expect([ScoringLineage.Complete(late), ScoringLineage.Complete(text)]).toEqual([false, true]);
  });

  it('a row whose run or model does not resolve, or names no model, or whose run is another model\'s, is incomplete', () => {
    const rows = ScoringLineage.Join([value(), value({ MLModelID: null }), value({ MLScoringRunID: 'C0000000-0000-4000-8000-00000000000C' })], [{ ...run, ModelID: 'D0000000-0000-4000-8000-00000000000D' }], []);
    expect(rows.map((r) => ScoringLineage.Complete(r))).toEqual([false, false, false]);
    expect(rows.map((r) => ScoringLineage.Lacks(r))).toEqual([
      'model unresolved, run of another model',
      'no MLModelID, model unresolved',
      'run unresolved, model unresolved',
    ]);
  });
});

describe('EmptyColumnRuntime.Empty', () => {
  const assembled: ScoringAssembly = {
    Status: 'assembled', Matrix: { columns: ['IncomeK', 'Plan'], rows: [[10, 'Gold'], [20, 'Silver']] }, Columns: [], HashColumns: null, RowIDs: ['a', 'b'],
  };

  it('sets the named column null on every row and leaves the others and the input untouched', () => {
    const out = EmptyColumnRuntime.Empty(assembled, 'IncomeK');
    expect(out.Found).toBe(true);
    expect(out.Assembly.Status === 'assembled' ? out.Assembly.Matrix.rows : null).toEqual([[null, 'Gold'], [null, 'Silver']]);
    expect(assembled.Status === 'assembled' ? assembled.Matrix.rows : null).toEqual([[10, 'Gold'], [20, 'Silver']]);
  });

  it('reports a missing column and an assembly that did not assemble as not found, unchanged', () => {
    expect(EmptyColumnRuntime.Empty(assembled, 'Region')).toEqual({ Assembly: assembled, Found: false });
    const refused: ScoringAssembly = { Status: 'missing-columns', Columns: ['IncomeK'] };
    expect(EmptyColumnRuntime.Empty(refused, 'IncomeK')).toEqual({ Assembly: refused, Found: false });
  });
});
