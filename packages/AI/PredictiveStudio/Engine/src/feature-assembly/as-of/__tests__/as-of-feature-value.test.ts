/**
 * B2 attacks on the as-of Feature Value reader (G7.4, F-FP-11, DD-8, DD-11): a pinned pipeline feature, a Human value
 * and a prediction input are read as the row in effect at each decision date, and a row with no eligible value follows
 * the unit's `onUncoveredRow` policy. Every read goes through the in-memory {@link TableDataAccess}, which evaluates
 * the filters the reader writes, so a test sees the rows the database would return.
 */
import { describe, it, expect } from 'vitest';
import type { FeatureColumnSpec, FeatureVersionPin, PredictionFeaturePin, PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { AsOfFeatureAssembler, type AsOfAssemblyInput, type AssemblyRowRef } from '../as-of-assembler';
import { RunViewRecordHistoryReader } from '../record-history';
import type { FetchRowsParams, FetchRowsResult, SourceRow } from '../../data-access';
import type { AssemblyEntityInfo, AssemblyFieldInfo, IAssemblyMetadata } from '../../assembly-metadata';
import { TableDataAccess } from '../../../__tests__/fakes/table-data-access';

const field = (Name: string): AssemblyFieldInfo => ({ Name, SqlType: 'nvarchar', TSType: 'string', AllowUpdateAPI: false, IsPrimaryKey: Name === 'ID', RelatedEntity: null, IsVirtual: false });
const people: AssemblyEntityInfo = { ID: 'E-PE', Name: 'People', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), field('JobTitle')] };
const metadata: IAssemblyMetadata = { Entity: (n) => (n === 'People' ? people : null) };

const unit = (onUncoveredRow: 'refuse' | 'exclude-and-count' = 'refuse'): PredictionUnitSpec => ({
  id: 'U-P', lineageRootId: 'U-P', version: 1, name: 'people unit',
  rows: { kind: 'grain', grainEntity: 'People', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 365, gapDays: 0, outcome: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-01-01' } },
  history: { onUncoveredRow, externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'outreach', actorRole: 'team', capacityPerPeriod: null, period: 'year' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: 'U' },
});

const RP1 = 'RP-1';
const RP2 = 'RP-2';
const pipelinePin = (recordProcessId = RP1, pipelineVersion = 3): FeatureVersionPin =>
  ({ featurePipelineRecordProcessId: recordProcessId, pipelineVersion, promptVersionHash: 'ph-3', aiModelId: 'AIM-1', parametersHash: 'pa-3' });
const titleColumn = (pin: FeatureVersionPin | PredictionFeaturePin | null, featureName = 'JobTitle'): FeatureColumnSpec =>
  ({ name: featureName, source: { kind: 'feature-value', featureName, pin }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } });
const scoreColumn = (pin: PredictionFeaturePin): FeatureColumnSpec =>
  ({ name: 'ChurnRisk', source: { kind: 'feature-value', featureName: 'ChurnRisk', pin }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } });

interface ValueRow {
  readonly ID: string;
  readonly RecordID: string;
  readonly Source: 'Pipeline' | 'Human' | 'Model';
  readonly EffectiveAsOf: string;
  readonly EffectiveTo?: string | null;
  readonly Value: string | number;
  readonly RecordProcessID?: string | null;
  readonly PipelineVersion?: number | null;
  readonly FeatureName?: string;
  readonly Role?: 'Champion' | 'Challenger';
  readonly MLModelScoringBindingID?: string | null;
  readonly MLModelID?: string | null;
  readonly InTraining?: boolean | null;
}

/** One `MJ: Feature Values` row as the database stores it: a Pipeline row carries its pin's version columns. */
const fv = (v: ValueRow): SourceRow => ({
  ID: v.ID, EntityID: people.ID, RecordID: v.RecordID, FeatureName: v.FeatureName || 'JobTitle', Source: v.Source, Role: v.Role || 'Champion',
  RecordProcessID: v.RecordProcessID === undefined ? (v.Source === 'Model' ? null : RP1) : v.RecordProcessID,
  PipelineVersion: v.PipelineVersion === undefined ? (v.Source === 'Pipeline' ? 3 : null) : v.PipelineVersion,
  PromptVersionHash: v.Source === 'Pipeline' ? 'ph-3' : null, AIModelID: v.Source === 'Pipeline' ? 'AIM-1' : null, ParametersHash: v.Source === 'Pipeline' ? 'pa-3' : null,
  EffectiveAsOf: new Date(v.EffectiveAsOf), EffectiveTo: v.EffectiveTo ? new Date(v.EffectiveTo) : null, ComputedAt: new Date(v.EffectiveAsOf),
  ValueText: typeof v.Value === 'string' ? v.Value : null, ValueNumeric: typeof v.Value === 'number' ? v.Value : null, ValueBoolean: null, ValueDate: null,
  MLModelScoringBindingID: v.MLModelScoringBindingID === undefined ? null : v.MLModelScoringBindingID,
  MLModelID: v.MLModelID === undefined ? null : v.MLModelID,
  InTraining: v.InTraining === undefined ? null : v.InTraining,
});

const row = (id: string, decision: string): AssemblyRowRef => ({ RowID: id, EntityKey: id, DecisionDate: new Date(decision), Period: null });

const input = (features: FeatureColumnSpec[], rows: AssemblyRowRef[], tables: Record<string, SourceRow[]>, u: PredictionUnitSpec = unit(), access?: TableDataAccess): AsOfAssemblyInput => {
  const dataAccess = access || new TableDataAccess({ People: rows.map((r) => ({ ID: r.RowID, JobTitle: `today ${r.RowID}` })), 'MJ: Record Changes': [], ...tables });
  return {
    Context: 'train', Unit: u, RowEntity: people, Rows: rows, Features: features, SeriesHistory: null, Read: { mode: 'complete' },
    DataAccess: dataAccess, History: new RunViewRecordHistoryReader(dataAccess, { mode: 'complete' }), Metadata: metadata,
    AssembledAt: new Date('2026-10-12T00:00:00Z'),
  };
};

const assembled = async (i: AsOfAssemblyInput) => {
  const out = await new AsOfFeatureAssembler().Assemble(i);
  if (out.Status !== 'assembled') throw new Error(`expected an assembled matrix, got ${JSON.stringify(out)}`);
  return out;
};
const valuesOf = (out: Awaited<ReturnType<typeof assembled>>): Record<string, string | number | null> =>
  Object.fromEntries(out.Rows.map((r) => [r.RowID, r.Values[0]]));

describe('B2 attack 1 — G7.4: a planted dated job-title history is read as of each decision date', () => {
  it('reads the planted value at the decision date for 100% of rows and today\'s value for 0', async () => {
    // 40 people; each holds title A from 2022-01-01, title B from its change date; half decide before, half after the change.
    // Version 2 of the pipeline holds each person's title today; the snapshot column must never carry it.
    const n = 40;
    const rows: AssemblyRowRef[] = [];
    const values: SourceRow[] = [];
    const planted: Record<string, string> = {};
    for (let i = 0; i < n; i++) {
      const id = `p${i}`;
      const change = `2023-0${1 + (i % 9)}-15T00:00:00Z`;
      values.push(fv({ ID: `${id}-a`, RecordID: id, Source: 'Pipeline', EffectiveAsOf: '2022-01-01T00:00:00Z', EffectiveTo: change, Value: `A${i}` }));
      values.push(fv({ ID: `${id}-b`, RecordID: id, Source: 'Pipeline', EffectiveAsOf: change, Value: `B${i}` }));
      // Another version of the same pipeline, carrying today's title: the pin (version 3) must keep it out.
      values.push(fv({ ID: `${id}-v2`, RecordID: id, Source: 'Pipeline', EffectiveAsOf: '2022-02-01T00:00:00Z', Value: `today ${id}`, PipelineVersion: 2 }));
      const before = i % 2 === 0;
      const decision = before ? '2022-12-31T00:00:00Z' : '2024-06-01T00:00:00Z';
      rows.push(row(id, decision));
      planted[id] = before ? `A${i}` : `B${i}`;
    }
    const out = await assembled(input([titleColumn(pipelinePin())], rows, { 'MJ: Feature Values': values }));
    const got = valuesOf(out);
    const matchesPlanted = rows.filter((r) => got[r.RowID] === planted[r.RowID]).length;
    const matchesToday = rows.filter((r) => got[r.RowID] === `today ${r.RowID}`).length;
    expect({ matchesPlanted, matchesToday }).toEqual({ matchesPlanted: n, matchesToday: 0 });
  });
});

describe('B2 attack 2 — EffectiveAsOf at, a day before and a day after the decision date (≤)', () => {
  it('reads the value effective on the decision date and the day before, never the day after', async () => {
    const decision = '2024-03-10T00:00:00Z';
    const at = (effective: string) => [fv({ ID: 'v-old', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: '2020-01-01T00:00:00Z', EffectiveTo: effective, Value: 'old' }),
      fv({ ID: 'v-new', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: effective, Value: 'new' })];
    const read = async (effective: string) => valuesOf(await assembled(input([titleColumn(pipelinePin())], [row('p1', decision)], { 'MJ: Feature Values': at(effective) }))).p1;
    expect(await read('2024-03-10T00:00:00Z')).toBe('new');
    expect(await read('2024-03-09T00:00:00Z')).toBe('new');
    expect(await read('2024-03-11T00:00:00Z')).toBe('old');
  });
});

describe('B2 attack 3 — a Human value in effect wins over an earlier pinned pipeline value (DD-8)', () => {
  it('reads a Human row effective after the pipeline row and before the decision date, and ignores one effective after it', async () => {
    const values = [
      fv({ ID: 'pipe', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: '2023-01-01T00:00:00Z', Value: 'Analyst' }),
      fv({ ID: 'human-before', RecordID: 'p1', Source: 'Human', EffectiveAsOf: '2023-06-01T00:00:00Z', EffectiveTo: '2024-09-01T00:00:00Z', Value: 'Senior Analyst' }),
      fv({ ID: 'human-after', RecordID: 'p1', Source: 'Human', EffectiveAsOf: '2024-09-01T00:00:00Z', Value: 'Director' }),
    ];
    const out = await assembled(input([titleColumn(pipelinePin())], [row('p1', '2024-01-01T00:00:00Z')], { 'MJ: Feature Values': values }));
    expect(out.Rows[0].Values[0]).toBe('Senior Analyst');
    expect(out.Rows[0].Provenance[0]).toMatchObject({ source: 'feature-value', sourceRef: 'MJ: Feature Values/human-before' });
  });
  it('a pipeline value effective after the Human value wins again (greatest EffectiveAsOf)', async () => {
    const values = [
      fv({ ID: 'human', RecordID: 'p1', Source: 'Human', EffectiveAsOf: '2023-06-01T00:00:00Z', Value: 'Senior Analyst' }),
      fv({ ID: 'pipe-later', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: '2023-09-01T00:00:00Z', Value: 'Manager' }),
    ];
    const out = await assembled(input([titleColumn(pipelinePin())], [row('p1', '2024-01-01T00:00:00Z')], { 'MJ: Feature Values': values }));
    expect(out.Rows[0].Values[0]).toBe('Manager');
  });
});

describe('B2 attack 3 (closed rows) — a row closed before the decision day ends is not in effect', () => {
  it('a Human value retired before the decision date gives way to the pipeline value in effect (B1 closes, never deletes)', async () => {
    const values = [
      fv({ ID: 'pipe', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: '2023-01-01T00:00:00Z', Value: 'Analyst' }),
      fv({ ID: 'human-retired', RecordID: 'p1', Source: 'Human', EffectiveAsOf: '2023-06-01T00:00:00Z', EffectiveTo: '2023-09-01T00:00:00Z', Value: 'Senior Analyst' }),
    ];
    const out = await assembled(input([titleColumn(pipelinePin())], [row('p1', '2024-01-01T00:00:00Z'), row('p1', '2023-07-01T00:00:00Z')], { 'MJ: Feature Values': values }));
    expect(out.Rows.map((r) => r.Values[0])).toEqual(['Analyst', 'Senior Analyst']);
  });
  it('never reads a history-only row (written closed, EffectiveTo = EffectiveAsOf)', async () => {
    const values = [
      fv({ ID: 'pipe', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: '2023-01-01T00:00:00Z', Value: 'Analyst' }),
      fv({ ID: 'history-only', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: '2023-06-01T00:00:00Z', EffectiveTo: '2023-06-01T00:00:00Z', Value: 'superseded decision' }),
    ];
    const out = await assembled(input([titleColumn(pipelinePin())], [row('p1', '2024-01-01T00:00:00Z')], { 'MJ: Feature Values': values }));
    expect(out.Rows[0].Values[0]).toBe('Analyst');
  });
});

describe('B2 attack 4 — a decision date before the first effective value follows onUncoveredRow', () => {
  const values = [fv({ ID: 'v1', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: '2023-01-01T00:00:00Z', Value: 'Analyst' })];
  const rows = [row('p1', '2022-06-01T00:00:00Z'), row('p2', '2024-06-01T00:00:00Z'), row('p1b', '2022-01-01T00:00:00Z')];
  const tables = { 'MJ: Feature Values': [...values, fv({ ID: 'v2', RecordID: 'p2', Source: 'Pipeline', EffectiveAsOf: '2023-01-01T00:00:00Z', Value: 'Clerk' })] };

  it('refuses decision-date-before-feature-history under refuse, counting the rows', async () => {
    expect(await new AsOfFeatureAssembler().Assemble(input([titleColumn(pipelinePin())], rows, tables, unit('refuse'))))
      .toEqual({ Status: 'refused', Refusal: { kind: 'decision-date-before-feature-history', featureName: 'JobTitle', rowsAffected: 2 } });
  });
  it('excludes and counts the rows under exclude-and-count, never reading today\'s value', async () => {
    const out = await assembled(input([titleColumn(pipelinePin())], rows, tables, unit('exclude-and-count')));
    expect([...out.ExcludedRowIDs].sort()).toEqual(['p1', 'p1b']);
    expect(out.Rows.map((r) => [r.RowID, r.Values[0]])).toEqual([['p2', 'Clerk']]);
    expect(out.UncoveredRowsExcluded).toEqual([{ entity: 'MJ: Feature Values', field: 'JobTitle', rows: 2 }]);
  });
});

describe('B2 attack 6 — a prediction input reads the as-of Model row and never a leaking one (DD-11)', () => {
  const pin: PredictionFeaturePin = { mlModelScoringBindingId: 'B-1', mlModelId: 'M-UP' };
  const model = (v: Omit<ValueRow, 'Source'>): SourceRow => fv({ ...v, Source: 'Model', FeatureName: 'ChurnRisk', MLModelScoringBindingID: v.MLModelScoringBindingID === undefined ? 'B-1' : v.MLModelScoringBindingID, MLModelID: v.MLModelID === undefined ? 'M-UP' : v.MLModelID });
  const lineage = {
    'MJ: ML Model Scoring Bindings': [{ ID: 'B-1', TargetEntityID: people.ID, FeatureName: 'ChurnRisk', MLTrainingPipelineID: 'TP-UP', Status: 'Active' }],
    'MJ: ML Models': [{ ID: 'M-UP', TrainingSnapshotID: 'TS-UP', PipelineID: 'TP-UP', Status: 'Published' }],
    'MJ: ML Training Snapshots': [{ ID: 'TS-UP', DataCutoff: new Date('2023-01-01T00:00:00Z') }],
  };

  it('reads, between two as-of dates, the earlier prediction', async () => {
    const values = [model({ ID: 'm-jan', RecordID: 'p1', EffectiveAsOf: '2024-01-01T00:00:00Z', Value: 0.2 }), model({ ID: 'm-jul', RecordID: 'p1', EffectiveAsOf: '2024-07-01T00:00:00Z', Value: 0.9 })];
    const out = await assembled(input([scoreColumn(pin)], [row('p1', '2024-04-01T00:00:00Z')], { ...lineage, 'MJ: Feature Values': values }));
    expect(out.Rows[0].Values[0]).toBe(0.2);
    expect(out.Rows[0].Provenance[0]).toMatchObject({ sourceRef: 'MJ: Feature Values/m-jan', sourceVersion: 'B-1@M-UP' });
  });
  it('never reads an InTraining = 1 row', async () => {
    const values = [model({ ID: 'm-old', RecordID: 'p1', EffectiveAsOf: '2023-06-01T00:00:00Z', Value: 0.1 }), model({ ID: 'm-in-training', RecordID: 'p1', EffectiveAsOf: '2024-01-01T00:00:00Z', Value: 0.8, InTraining: true })];
    const out = await assembled(input([scoreColumn(pin)], [row('p1', '2024-04-01T00:00:00Z')], { ...lineage, 'MJ: Feature Values': values }));
    expect(out.Rows[0].Values[0]).toBe(0.1);
  });
  it('gives a decision date before the pinned model\'s DataCutoff no eligible value (refuse, or exclude and count)', async () => {
    const values = [model({ ID: 'm-early', RecordID: 'p1', EffectiveAsOf: '2022-01-01T00:00:00Z', Value: 0.3 })];
    const tables = { ...lineage, 'MJ: Feature Values': values };
    expect(await new AsOfFeatureAssembler().Assemble(input([scoreColumn(pin)], [row('p1', '2022-06-01T00:00:00Z')], tables, unit('refuse'))))
      .toEqual({ Status: 'refused', Refusal: { kind: 'decision-date-before-feature-history', featureName: 'ChurnRisk', rowsAffected: 1 } });
    const out = await assembled(input([scoreColumn(pin)], [row('p1', '2022-06-01T00:00:00Z')], tables, unit('exclude-and-count')));
    expect([...out.ExcludedRowIDs]).toEqual(['p1']);
  });
  it('reads only the pinned binding and model, never another model of the binding', async () => {
    const values = [model({ ID: 'm-retrained', RecordID: 'p1', EffectiveAsOf: '2024-02-01T00:00:00Z', Value: 0.7, MLModelID: 'M-NEW' }), model({ ID: 'm-pinned', RecordID: 'p1', EffectiveAsOf: '2024-01-01T00:00:00Z', Value: 0.4 })];
    const out = await assembled(input([scoreColumn(pin)], [row('p1', '2024-04-01T00:00:00Z')], { ...lineage, 'MJ: Feature Values': values }));
    expect(out.Rows[0].Values[0]).toBe(0.4);
  });
  it('a user without the binding\'s view authorization reads no rows, so the feature has no eligible value (onUncoveredRow)', async () => {
    /** PR 4's row filter on `MJ: Feature Values` for a caller without the binding's ViewAuthorizationID: no Model rows come back. */
    class NoBindingAccess extends TableDataAccess {
      public override async fetchRows(p: FetchRowsParams): Promise<FetchRowsResult> {
        const res = await super.fetchRows(p);
        return p.EntityName !== 'MJ: Feature Values' ? res : { ...res, Rows: res.Rows.filter((r) => r.Source !== 'Model'), TotalRowCount: res.Rows.filter((r) => r.Source !== 'Model').length };
      }
      public override async CountRows(p: { readonly EntityName: string; readonly ExtraFilter?: string }) {
        const res = await super.CountRows(p);
        if (p.EntityName !== 'MJ: Feature Values' || !res.Success) return res;
        const rows = await this.fetchRows({ EntityName: p.EntityName, ExtraFilter: p.ExtraFilter });
        return { Success: true as const, Count: rows.Rows.length };
      }
    }
    const values = [model({ ID: 'm-jan', RecordID: 'p1', EffectiveAsOf: '2024-01-01T00:00:00Z', Value: 0.2 })];
    const tables = { People: [{ ID: 'p1', JobTitle: 'today p1' }], 'MJ: Record Changes': [], ...lineage, 'MJ: Feature Values': values };
    const rows = [row('p1', '2024-04-01T00:00:00Z')];
    expect(await new AsOfFeatureAssembler().Assemble(input([scoreColumn(pin)], rows, {}, unit('refuse'), new NoBindingAccess(tables))))
      .toEqual({ Status: 'refused', Refusal: { kind: 'decision-date-before-feature-history', featureName: 'ChurnRisk', rowsAffected: 1 } });
  });
});

describe('B2 attack 8 — two Record Processes emitting one FeatureName on one entity (F-010)', () => {
  it('a model pinned to the first reads only the first\'s pipeline and Human values', async () => {
    const values = [
      fv({ ID: 'rp1-pipe', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: '2023-01-01T00:00:00Z', Value: 'first pipeline' }),
      fv({ ID: 'rp2-pipe', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: '2023-06-01T00:00:00Z', Value: 'second pipeline', RecordProcessID: RP2 }),
      fv({ ID: 'rp2-human', RecordID: 'p1', Source: 'Human', EffectiveAsOf: '2023-09-01T00:00:00Z', Value: 'second human', RecordProcessID: RP2 }),
      fv({ ID: 'rp1-human', RecordID: 'p2', Source: 'Human', EffectiveAsOf: '2023-03-01T00:00:00Z', Value: 'first human' }),
      fv({ ID: 'rp2-pipe-p2', RecordID: 'p2', Source: 'Pipeline', EffectiveAsOf: '2023-08-01T00:00:00Z', Value: 'second pipeline p2', RecordProcessID: RP2 }),
    ];
    const out = await assembled(input([titleColumn(pipelinePin(RP1))], [row('p1', '2024-01-01T00:00:00Z'), row('p2', '2024-01-01T00:00:00Z')], { 'MJ: Feature Values': values }));
    expect(valuesOf(out)).toEqual({ p1: 'first pipeline', p2: 'first human' });
  });
  it('never reads a Challenger (shadow) row of the pinned version', async () => {
    const values = [
      fv({ ID: 'champ', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: '2023-01-01T00:00:00Z', Value: 'champion' }),
      fv({ ID: 'shadow', RecordID: 'p1', Source: 'Pipeline', EffectiveAsOf: '2023-06-01T00:00:00Z', Value: 'challenger', Role: 'Challenger' }),
    ];
    const out = await assembled(input([titleColumn(pipelinePin(RP1))], [row('p1', '2024-01-01T00:00:00Z')], { 'MJ: Feature Values': values }));
    expect(out.Rows[0].Values[0]).toBe('champion');
  });
});
