import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { FeatureColumnSpec, PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { AsOfFeatureAssembler, type AsOfAssemblyInput, type AssemblyRowRef } from '../as-of-assembler';
import { RecordHistory, type IRecordHistoryReader, type RecordChangeRow } from '../record-history';
import { SeriesFeatures, type SeriesHistory } from '../series-features';
import type { SourceRow } from '../../data-access';
import type { AssemblyEntityInfo, AssemblyFieldInfo, IAssemblyMetadata } from '../../assembly-metadata';
import { TableDataAccess } from '../../../__tests__/fakes/table-data-access';

const rows: AssemblyRowRef[] = [
  { RowId: 'y1', EntityKey: 'y1', DecisionDate: new Date('2022-12-01T00:00:00Z'), Period: null },
  { RowId: 'y2', EntityKey: 'y2', DecisionDate: new Date('2023-12-01T00:00:00Z'), Period: null },
];

const tables: Record<string, SourceRow[]> = {
  Years: [
    { ID: 'y1', PersonID: 'P1', EventsAttended: 3, Region: 'EU', PersonStatusNow: 'Lapsed' },
    { ID: 'y2', PersonID: 'P1', EventsAttended: 1, Region: 'R7', PersonStatusNow: 'Lapsed' },
  ],
  People: [{ ID: 'P1', Status: 'Lapsed' }],
  Events: [
    { ID: 'e1', PersonID: 'P1', EventDate: '2022-06-01' },
    { ID: 'e2', PersonID: 'P1', EventDate: '2023-06-01' },
    { ID: 'e3', PersonID: 'P1', EventDate: '2024-01-01' },
  ],
};

const rc = (id: string, key: string, type: RecordChangeRow['Type'], at: string, full: Record<string, string | number>, changed: string[] = []): RecordChangeRow =>
  ({ ID: id, RecordID: `ID|${key}`, Type: type, Source: 'Internal', ChangedAt: new Date(at), ChangesJSON: JSON.stringify(Object.fromEntries(changed.map((f) => [f, { field: f, oldValue: null, newValue: full[f] }]))), FullRecordJSON: JSON.stringify(full) });

const changes: Record<string, RecordChangeRow[]> = {
  People: [
    rc('rc-create', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }),
    rc('rc-update', 'P1', 'Update', '2023-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }, ['Status']),
  ],
};

const field = (Name: string, TSType: AssemblyFieldInfo['TSType'] = 'string'): AssemblyFieldInfo => ({ Name, SqlType: 'nvarchar', TSType, AllowUpdateAPI: true, IsPrimaryKey: Name === 'ID', RelatedEntity: null, IsVirtual: false });
const entities: Record<string, AssemblyEntityInfo> = {
  Years: { ID: 'E-Y', Name: 'Years', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), field('PersonID'), field('EventsAttended', 'number'), field('Region'), field('PersonStatusNow')] },
  People: { ID: 'E-PE', Name: 'People', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), field('Status')] },
  Events: { ID: 'E-EV', Name: 'Events', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), field('PersonID'), field('EventDate', 'Date')] },
};
const metadata: IAssemblyMetadata = { Entity: (n) => entities[n] || null };

const unit: PredictionUnitSpec = {
  id: 'U-W', lineageRootId: 'U-W', version: 1, name: 'yearly renewal unit',
  rows: { kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'column', column: 'DecisionDate' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 365, gapDays: 0, outcome: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2026-01-01' } },
  history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'outreach', actorRole: 'team', capacityPerPeriod: null, period: 'year' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: 'U' },
};

/** A history reader over the in-memory tables: the change rows of the entity plus the current rows of the keys. */
const historyOver = (data: Record<string, SourceRow[]>, rowChanges: Record<string, RecordChangeRow[]>): IRecordHistoryReader => ({
  Load: async (entity, keys, fields, policy, now) => {
    const wanted = new Set(keys.map((k) => k.toLowerCase()));
    const current = new Map((data[entity.Name] || [])
      .filter((r) => wanted.has(String(r[entity.PrimaryKey]).toLowerCase()))
      .map((r) => [String(r[entity.PrimaryKey]).toLowerCase(), r] as const));
    return RecordHistory.BuildEntityHistory(entity.Name, rowChanges[entity.Name] ?? [], current, fields, policy, now);
  },
});

interface Fixture {
  readonly Rows?: readonly AssemblyRowRef[];
  readonly Tables?: Record<string, SourceRow[]>;
  readonly Changes?: Record<string, RecordChangeRow[]>;
  readonly Unit?: PredictionUnitSpec;
  readonly SeriesHistory?: SeriesHistory;
}

const input = (features: FeatureColumnSpec[], f: Fixture = {}): AsOfAssemblyInput => {
  const data = f.Tables || tables;
  return {
    Context: 'train',
    Unit: f.Unit || unit,
    RowEntity: entities.Years,
    Rows: f.Rows || rows,
    Features: features,
    SeriesHistory: f.SeriesHistory || null,
    Read: { mode: 'complete' },
    DataAccess: new TableDataAccess(data),
    History: historyOver(data, f.Changes || changes),
    Metadata: metadata,
    AssembledAt: new Date('2026-10-12T00:00:00Z'),
  };
};

describe('AsOfFeatureAssembler', () => {
  it('replays an in-place field as of each decision date with provenance naming the change row', async () => {
    const features: FeatureColumnSpec[] = [{ name: 'Status', source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } }];
    const out = await new AsOfFeatureAssembler().Assemble(input(features));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values[0])).toEqual(['Active', 'Lapsed']);
    expect(out.Rows[0].Provenance[0]).toMatchObject({ column: 'Status', source: 'record-changes', sourceRef: 'People/p1/Status', sourceVersion: 'rc-create' });
  });
  it('refuses an updatable field with no change history, naming it (PersonStatusNow)', async () => {
    const features: FeatureColumnSpec[] = [{ name: 'PersonStatusNow', source: { kind: 'record-changes', entity: 'Years', field: 'PersonStatusNow', keyField: null }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } }];
    expect(await new AsOfFeatureAssembler().Assemble(input(features))).toEqual({ Status: 'refused', Refusal: { kind: 'decision-date-before-change-history', entity: 'Years', field: 'PersonStatusNow', historyStart: null, rowsAffected: 2 } });
  });
  it('stops on a text value in a numeric column, naming the column, and never writes 0.0', async () => {
    const features: FeatureColumnSpec[] = [{ name: 'Region', source: { kind: 'immutable-field', entity: 'Years', field: 'Region', keyField: null }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } }];
    expect(await new AsOfFeatureAssembler().Assemble(input(features))).toEqual({ Status: 'refused', Refusal: { kind: 'non-numeric-in-numeric-column', column: 'Region', sampleValue: 'EU' } });
  });
  it('emits an imputer with a missing indicator for every column, and one-hot for categoricals', async () => {
    const features: FeatureColumnSpec[] = [
      { name: 'EventsAttended', source: { kind: 'immutable-field', entity: 'Years', field: 'EventsAttended', keyField: null }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } },
      { name: 'Region', source: { kind: 'immutable-field', entity: 'Years', field: 'Region', keyField: null }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } },
    ];
    const out = await new AsOfFeatureAssembler().Assemble(input(features));
    expect(out.Status === 'assembled' && out.Preprocessing).toEqual([
      { op: 'impute', col: 'EventsAttended', strategy: 'median', indicator: true },
      { op: 'impute', col: 'Region', strategy: 'mode', indicator: true },
      { op: 'onehot', col: 'Region' },
    ]);
  });

  it('reads the latest pinned, effective-dated Feature Value on or before the decision day', async () => {
    const fv = (ID: string, EffectiveAsOf: string | null, PipelineVersion: number, ValueNumeric: number): SourceRow => ({
      ID, EntityID: 'E-Y', FeatureName: 'Engagement', RecordProcessID: 'RP-1', RecordID: 'ID|y1', EffectiveAsOf: EffectiveAsOf === null ? null : new Date(EffectiveAsOf),
      ComputedAt: new Date('2024-08-01T00:00:00Z'), PipelineVersion, PromptVersionHash: null, AIModelID: null, ParametersHash: null, ValueNumeric, ValueText: null, ValueBoolean: null, ValueDate: null,
    });
    const data: Record<string, SourceRow[]> = {
      ...tables,
      'MJ: Feature Values': [
        fv('fv-jan', '2024-01-01T00:00:00Z', 2, 10),
        fv('fv-jun', '2024-06-01T00:00:00Z', 2, 20),
        fv('fv-undated', null, 2, 99),
        fv('fv-old-pipeline', '2024-02-01T00:00:00Z', 1, 77),
      ],
    };
    const features: FeatureColumnSpec[] = [{ name: 'Engagement', source: { kind: 'feature-value', featureName: 'Engagement', pin: { featurePipelineRecordProcessId: 'RP-1', pipelineVersion: 2, promptVersionHash: null, aiModelId: null, parametersHash: null } }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } }];
    const at = async (decision: string) => new AsOfFeatureAssembler().Assemble(input(features, { Tables: data, Rows: [{ RowId: 'y1', EntityKey: 'y1', DecisionDate: new Date(decision), Period: null }] }));

    const march = await at('2024-03-01T00:00:00Z');
    const july = await at('2024-07-01T00:00:00Z');
    expect(march.Status === 'assembled' && march.Rows[0].Values).toEqual([10]);
    expect(march.Status === 'assembled' && march.Rows[0].Provenance[0]).toMatchObject({ source: 'feature-value', sourceRef: 'MJ: Feature Values/fv-jan', sourceVersion: 'RP-1@2' });
    expect(july.Status === 'assembled' && july.Rows[0].Values).toEqual([20]);
    expect(july.Status === 'assembled' && july.ColumnProvenance).toEqual([{ column: 'Engagement', source: 'feature-value', sourceRef: 'feature-value.Engagement', sourceVersion: 'RP-1@2' }]);
  });
  it('refuses an immutable field that Record Changes show changed after a decision day, naming the field and the count', async () => {
    const yearChanges: Record<string, RecordChangeRow[]> = {
      Years: [
        rc('yc-create', 'y1', 'Create', '2022-01-01T00:00:00Z', { ID: 'y1', EventsAttended: 2 }),
        rc('yc-update', 'y1', 'Update', '2023-01-01T00:00:00Z', { ID: 'y1', EventsAttended: 3 }, ['EventsAttended']),
      ],
    };
    const features: FeatureColumnSpec[] = [{ name: 'EventsAttended', source: { kind: 'immutable-field', entity: 'Years', field: 'EventsAttended', keyField: null }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } }];
    expect(await new AsOfFeatureAssembler().Assemble(input(features, { Changes: yearChanges }))).toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'Years', field: 'EventsAttended', changesAfter: 1 } });
  });
  it('refuses a Feature Value source with no version pin', async () => {
    const features: FeatureColumnSpec[] = [{ name: 'Engagement', source: { kind: 'feature-value', featureName: 'Engagement', pin: null }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } }];
    expect(await new AsOfFeatureAssembler().Assemble(input(features))).toEqual({ Status: 'refused', Refusal: { kind: 'unpinned-feature-version', featureName: 'Engagement' } });
  });
  it('refuses a key-field value with no row in the keyed entity as a truncated read', async () => {
    const data: Record<string, SourceRow[]> = { ...tables, Years: [tables.Years[0], { ...tables.Years[1], PersonID: 'P9' }] };
    const features: FeatureColumnSpec[] = [{ name: 'Status', source: { kind: 'immutable-field', entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } }];
    expect(await new AsOfFeatureAssembler().Assemble(input(features, { Tables: data, Changes: {} }))).toEqual({ Status: 'refused', Refusal: { kind: 'truncated-read', entity: 'People', rowsExpected: 2, rowsRead: 1 } });
  });
  it('refuses a source entity that is not registered, naming it', async () => {
    const features: FeatureColumnSpec[] = [{ name: 'Status', source: { kind: 'record-changes', entity: 'Nowhere', field: 'Status', keyField: null }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } }];
    expect(await new AsOfFeatureAssembler().Assemble(input(features))).toEqual({ Status: 'refused', Refusal: { kind: 'unresolved-column', entity: 'Nowhere', field: 'Status' } });
  });
  it('reads a windowed aggregate and a series lag as of each decision date, versioned by the rows they read', async () => {
    const temporal: PredictionUnitSpec['temporal'] = { timeColumn: 'DecisionDate', horizonPeriods: 1, lags: [1], rollingWindows: [], period: 'year', seasonality: null };
    const series = SeriesFeatures.BuildSeriesHistory([
      { EntityKey: 'P1', Period: new Date('2021-01-01T00:00:00Z'), Value: 5, RowId: 'y0' },
      { EntityKey: 'P1', Period: new Date('2022-01-01T00:00:00Z'), Value: 7, RowId: 'y1' },
    ], temporal);
    const personRows: AssemblyRowRef[] = rows.map((r) => ({ ...r, EntityKey: 'P1' }));
    const features: FeatureColumnSpec[] = [
      { name: 'EventsToDate', source: { kind: 'windowed-aggregate', childEntity: 'Events', foreignKey: 'PersonID', ownerKeyField: null, dateField: 'EventDate', endDateField: null, voidedAtField: null, aggregate: 'count', valueField: null, windowDays: null, filter: [] }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } },
      { name: 'LastYear', source: { kind: 'series', feature: { kind: 'lag', index: 0 } }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } },
    ];
    const out = await new AsOfFeatureAssembler().Assemble(input(features, { Rows: personRows, Unit: { ...unit, temporal }, SeriesHistory: series }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values)).toEqual([[1, 5], [2, 7]]);
    // Events has no __mj_UpdatedAt, so an aggregate's version hashes the IDs of the rows it read.
    const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
    expect(out.Rows[1].Provenance[0]).toMatchObject({ source: 'windowed-aggregate', sourceRef: 'Events?PersonID=p1&as-of=2023-12-01&aggregate=count', sourceVersion: sha('e1\ne2') });
    expect(out.Rows[1].Provenance[1]).toMatchObject({ source: 'series', sourceRef: 'Years/label/y1', sourceVersion: 'labelVersion:1' });
  });
});

describe('AsOfFeatureAssembler.ToFeatureAssemblyResult', () => {
  it('appends the label column for training and none for scoring', async () => {
    const features: FeatureColumnSpec[] = [
      { name: 'EventsAttended', source: { kind: 'immutable-field', entity: 'Years', field: 'EventsAttended', keyField: null }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } },
      { name: 'Region', source: { kind: 'immutable-field', entity: 'Years', field: 'Region', keyField: null }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } },
    ];
    const out = await new AsOfFeatureAssembler().Assemble(input(features));
    if (out.Status !== 'assembled') throw new Error(`expected an assembled matrix, got ${out.Refusal.kind}`);
    const train = AsOfFeatureAssembler.ToFeatureAssemblyResult(out, new Map<string, string | number>([['y1', 0], ['y2', '1']]), '__ps_label');
    expect(train.matrix).toEqual({ columns: ['EventsAttended', 'Region', '__ps_label'], rows: [[3, 'EU', 0], [1, 'R7', '1']] });
    expect(train.featureSchema).toEqual([{ Name: 'EventsAttended', Kind: 'numeric' }, { Name: 'Region', Kind: 'categorical' }]);
    expect(train.preprocessing).toEqual(out.Preprocessing);
    const score = AsOfFeatureAssembler.ToFeatureAssemblyResult(out, null, '__ps_label');
    expect(score.matrix).toEqual({ columns: ['EventsAttended', 'Region'], rows: [[3, 'EU'], [1, 'R7']] });
  });
});
