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
const fixed = (Name: string, TSType: AssemblyFieldInfo['TSType'] = 'string'): AssemblyFieldInfo => ({ ...field(Name, TSType), AllowUpdateAPI: false });
/** `Years` with one field redeclared updatable, for the tests of the stable-value rule on a tracked entity. */
const yearsWithUpdatable = (name: string): AssemblyEntityInfo => ({ ...entities.Years, Fields: entities.Years.Fields.map((f) => (f.Name === name ? { ...f, AllowUpdateAPI: true } : f)) });
const entities: Record<string, AssemblyEntityInfo> = {
  // Years has no change history; its key and attribute fields are declared not updatable, so their stored values stand.
  Years: { ID: 'E-Y', Name: 'Years', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), fixed('PersonID'), fixed('EventsAttended', 'number'), fixed('Region'), field('PersonStatusNow')] },
  People: { ID: 'E-PE', Name: 'People', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), field('Status')] },
  Events: { ID: 'E-EV', Name: 'Events', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), fixed('PersonID'), fixed('EventDate', 'Date')] },
  // A tracked child whose amount can be edited.
  Donations: { ID: 'E-DO', Name: 'Donations', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), fixed('PersonID'), fixed('GivenOn', 'Date'), field('Amount', 'number')] },
  // Untracked, with an updatable field: its value on a past day cannot be known.
  Accounts: { ID: 'E-AC', Name: 'Accounts', PrimaryKey: 'ID', TrackRecordChanges: false, Fields: [field('ID'), field('Tier')] },
  // An untracked child whose amount can be edited: its value on a past day cannot be known.
  Pledges: { ID: 'E-PL', Name: 'Pledges', PrimaryKey: 'ID', TrackRecordChanges: false, Fields: [field('ID'), fixed('PersonID'), fixed('PledgedOn', 'Date'), field('Amount', 'number')] },
  // An untracked child that carries its creation time; nothing on it can be edited.
  Signups: { ID: 'E-SU', Name: 'Signups', PrimaryKey: 'ID', TrackRecordChanges: false, Fields: [field('ID'), fixed('PersonID'), fixed('SignedOn', 'Date'), field('__mj_CreatedAt', 'Date')] },
  // A tracked child on which every field can be edited.
  Gifts: { ID: 'E-GI', Name: 'Gifts', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), field('PersonID'), field('GivenOn', 'Date'), field('Amount', 'number')] },
  // A field declared not updatable, on an entity that carries its creation time.
  Badges: { ID: 'E-BA', Name: 'Badges', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), { ...field('Level'), AllowUpdateAPI: false }, field('__mj_CreatedAt', 'Date')] },
  // A tracked entity with an updatable field that also carries its creation time.
  Tiers: { ID: 'E-TI', Name: 'Tiers', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [field('ID'), field('Tier'), field('__mj_CreatedAt', 'Date')] },
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
  readonly RowEntity?: AssemblyEntityInfo;
  readonly CategoryLevels?: ReadonlyMap<string, readonly string[]>;
}

const input = (features: FeatureColumnSpec[], f: Fixture = {}): AsOfAssemblyInput => {
  const data = f.Tables || tables;
  return {
    Context: 'train',
    Unit: f.Unit || unit,
    RowEntity: f.RowEntity || entities.Years,
    Rows: f.Rows || rows,
    Features: features,
    SeriesHistory: f.SeriesHistory || null,
    Read: { mode: 'complete' },
    DataAccess: new TableDataAccess(data),
    History: historyOver(data, f.Changes || changes),
    Metadata: metadata,
    AssembledAt: new Date('2026-10-12T00:00:00Z'),
    ...(f.CategoryLevels ? { CategoryLevels: f.CategoryLevels } : {}),
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
        rc('yc-create-2', 'y2', 'Create', '2022-01-01T00:00:00Z', { ID: 'y2', EventsAttended: 1 }),
      ],
    };
    const features: FeatureColumnSpec[] = [{ name: 'EventsAttended', source: { kind: 'immutable-field', entity: 'Years', field: 'EventsAttended', keyField: null }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } }];
    expect(await new AsOfFeatureAssembler().Assemble(input(features, { Changes: yearChanges, RowEntity: yearsWithUpdatable('EventsAttended') }))).toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'Years', field: 'EventsAttended', changesAfter: 1 } });
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

describe('AsOfFeatureAssembler current-value reads', () => {
  const categorical = (name: string, entity: string, keyField: string | null = null, cardinalityCap = 50): FeatureColumnSpec =>
    ({ name, source: { kind: 'immutable-field', entity, field: name, keyField }, encoding: { kind: 'categorical', cardinalityCap, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } });

  it('refuses a current read of an updatable field on an entity that does not track changes', async () => {
    const data: Record<string, SourceRow[]> = { ...tables, Accounts: [{ ID: 'y1', Tier: 'A' }, { ID: 'y2', Tier: 'B' }] };
    expect(await new AsOfFeatureAssembler().Assemble(input([categorical('Tier', 'Accounts')], { Tables: data }))).toEqual({ Status: 'refused', Refusal: { kind: 'decision-date-before-change-history', entity: 'Accounts', field: 'Tier', historyStart: null, rowsAffected: 2 } });
  });
  it('reads a record created after the decision day as missing, never its stored value', async () => {
    const data: Record<string, SourceRow[]> = {
      ...tables,
      Badges: [{ ID: 'y1', Level: 'Gold', __mj_CreatedAt: new Date('2022-06-01T00:00:00Z') }, { ID: 'y2', Level: 'Silver', __mj_CreatedAt: new Date('2024-01-01T00:00:00Z') }],
    };
    const out = await new AsOfFeatureAssembler().Assemble(input([categorical('Level', 'Badges')], { Tables: data }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values[0])).toEqual(['Gold', null]);
    expect(out.Rows[0].Provenance[0]).toMatchObject({ sourceRef: 'Badges/y1/Level', sourceVersion: 'created:2022-06-01T00:00:00.000Z' });
    expect(out.Rows[1].Provenance[0]).toMatchObject({ sourceRef: 'Badges/y2/Level', sourceVersion: 'created-after-decision' });
  });
  it('refuses a join through a key field that changed after a decision day', async () => {
    const yearChanges: Record<string, RecordChangeRow[]> = {
      ...changes,
      Years: [
        rc('yc-create', 'y1', 'Create', '2022-01-01T00:00:00Z', { ID: 'y1', PersonID: 'P0' }),
        rc('yc-update', 'y1', 'Update', '2023-01-01T00:00:00Z', { ID: 'y1', PersonID: 'P1' }, ['PersonID']),
        rc('yc-create-2', 'y2', 'Create', '2022-01-01T00:00:00Z', { ID: 'y2', PersonID: 'P1' }),
      ],
    };
    const features: FeatureColumnSpec[] = [{ name: 'Status', source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } }];
    expect(await new AsOfFeatureAssembler().Assemble(input(features, { Changes: yearChanges, RowEntity: yearsWithUpdatable('PersonID') }))).toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'Years', field: 'PersonID', changesAfter: 1 } });
  });
  it('reads a windowed aggregate of a row with no owner key as missing, not the orphan rows', async () => {
    const data: Record<string, SourceRow[]> = {
      ...tables,
      Years: [tables.Years[0], { ...tables.Years[1], PersonID: null }],
      Events: [...tables.Events, { ID: 'e-orphan', PersonID: null, EventDate: '2020-01-01' }],
    };
    const features: FeatureColumnSpec[] = [{ name: 'EventsToDate', source: { kind: 'windowed-aggregate', childEntity: 'Events', foreignKey: 'PersonID', ownerKeyField: 'PersonID', dateField: 'EventDate', endDateField: null, voidedAtField: null, aggregate: 'count', valueField: null, windowDays: null, filter: [] }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } }];
    const out = await new AsOfFeatureAssembler().Assemble(input(features, { Tables: data }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values[0])).toEqual([1, null]);
    expect(out.Rows[1].Provenance[0]).toMatchObject({ source: 'windowed-aggregate', sourceRef: 'none' });
  });
  it('folds the least frequent levels beyond the cardinality cap into __other and records the fold', async () => {
    const regions = ['EU', 'R7', 'EU', 'US'];
    const data: Record<string, SourceRow[]> = { ...tables, Years: regions.map((Region, i) => ({ ID: `y${i + 1}`, PersonID: 'P1', Region })) };
    const fourRows: AssemblyRowRef[] = regions.map((_, i) => ({ RowId: `y${i + 1}`, EntityKey: `y${i + 1}`, DecisionDate: new Date('2023-12-01T00:00:00Z'), Period: null }));
    const out = await new AsOfFeatureAssembler().Assemble(input([categorical('Region', 'Years', null, 2)], { Tables: data, Rows: fourRows }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values[0])).toEqual(['EU', 'R7', 'EU', '__other']);
    expect(out.ColumnProvenance[0].categoryFold).toEqual({ kept: ['EU', 'R7'], folded: ['US'] });
    expect(out.CategoryLevels.get('Region')).toEqual(['EU', 'R7']);
  });
  it('folds with the levels training kept when they are given, without recounting', async () => {
    const regions = ['EU', 'R7', 'EU', 'US'];
    const data: Record<string, SourceRow[]> = { ...tables, Years: regions.map((Region, i) => ({ ID: `y${i + 1}`, PersonID: 'P1', Region })) };
    const fourRows: AssemblyRowRef[] = regions.map((_, i) => ({ RowId: `y${i + 1}`, EntityKey: `y${i + 1}`, DecisionDate: new Date('2023-12-01T00:00:00Z'), Period: null }));
    const trained = new Map<string, readonly string[]>([['Region', ['R7', 'US']]]);
    const out = await new AsOfFeatureAssembler().Assemble(input([categorical('Region', 'Years', null, 2)], { Tables: data, Rows: fourRows, CategoryLevels: trained }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values[0])).toEqual(['__other', 'R7', '__other', 'US']);
    expect(out.CategoryLevels.get('Region')).toEqual(['R7', 'US']);
    expect(out.ColumnProvenance[0].categoryFold).toEqual({ kept: ['R7', 'US'], folded: ['EU'] });
  });
  it('resolves the join key of a unit row created after its decision day as missing', async () => {
    const years: AssemblyEntityInfo = { ...entities.Years, Fields: [...entities.Years.Fields, field('__mj_CreatedAt', 'Date')] };
    const data: Record<string, SourceRow[]> = {
      ...tables,
      Years: [{ ...tables.Years[0], __mj_CreatedAt: new Date('2022-01-01T00:00:00Z') }, { ...tables.Years[1], __mj_CreatedAt: new Date('2024-02-01T00:00:00Z') }],
    };
    const features: FeatureColumnSpec[] = [{ name: 'Status', source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } }];
    const out = await new AsOfFeatureAssembler().Assemble(input(features, { Tables: data, RowEntity: years }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values[0])).toEqual(['Active', null]);
    expect(out.Rows[1].Provenance[0]).toMatchObject({ source: 'record-changes', sourceRef: 'none', sourceVersion: 'created-after-decision' });
  });
  it('fails on a categorical method the assembly cannot emit, naming it', async () => {
    const hashed: FeatureColumnSpec = { ...categorical('Region', 'Years'), encoding: { kind: 'categorical', cardinalityCap: 50, method: 'hashed' } };
    await expect(new AsOfFeatureAssembler().Assemble(input([hashed]))).rejects.toThrow(/hashed/);
  });
  it('refuses a pin that names neither a pipeline version nor a prompt version', async () => {
    const features: FeatureColumnSpec[] = [{ name: 'Engagement', source: { kind: 'feature-value', featureName: 'Engagement', pin: { featurePipelineRecordProcessId: 'RP-1', pipelineVersion: null, promptVersionHash: null, aiModelId: null, parametersHash: null } }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } }];
    expect(await new AsOfFeatureAssembler().Assemble(input(features))).toEqual({ Status: 'refused', Refusal: { kind: 'unpinned-feature-version', featureName: 'Engagement' } });
  });
  it('counts every uncovered field of an excluded row and reports coverage per entity and field', async () => {
    const replayed = (name: string): FeatureColumnSpec => ({ name, source: { kind: 'record-changes', entity: 'Years', field: name, keyField: null }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } });
    const out = await new AsOfFeatureAssembler().Assemble(input([replayed('PersonStatusNow'), replayed('Region')], { Unit: { ...unit, history: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' } } }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect([...out.ExcludedRowIds]).toEqual(['y1', 'y2']);
    expect(out.UncoveredRowsExcluded).toEqual([{ entity: 'Years', field: 'PersonStatusNow', rows: 2 }, { entity: 'Years', field: 'Region', rows: 2 }]);
    expect(out.Coverage.map((c) => [c.entity, c.field])).toEqual([['Years', 'PersonStatusNow'], ['Years', 'Region']]);
  });
});

describe('AsOfFeatureAssembler stable values, scoring levels and pins', () => {
  const statusOf = (kind: 'immutable-field' | 'record-changes'): FeatureColumnSpec =>
    ({ name: 'Status', source: { kind, entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } });
  const region: FeatureColumnSpec = { name: 'Region', source: { kind: 'immutable-field', entity: 'Years', field: 'Region', keyField: null }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } };
  const engagement = (pipelineVersion: number): FeatureColumnSpec =>
    ({ name: 'Engagement', source: { kind: 'feature-value', featureName: 'Engagement', pin: { featurePipelineRecordProcessId: 'RP-1', pipelineVersion, promptVersionHash: null, aiModelId: null, parametersHash: null } }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } });

  it('refuses a current read of a tracked field whose history starts after the decision day', async () => {
    const late: Record<string, RecordChangeRow[]> = { People: [rc('rc-snapshot', 'P1', 'Snapshot', '2026-10-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    expect(await new AsOfFeatureAssembler().Assemble(input([statusOf('immutable-field')], { Changes: late }))).toEqual({ Status: 'refused', Refusal: { kind: 'decision-date-before-change-history', entity: 'People', field: 'Status', historyStart: '2026-10-01T00:00:00.000Z', rowsAffected: 2 } });
  });
  it('refuses a child row whose aggregated value was edited after the owner row\'s decision day', async () => {
    const data: Record<string, SourceRow[]> = { ...tables, Donations: [{ ID: 'd1', PersonID: 'P1', GivenOn: '2022-06-01', Amount: 20 }] };
    const edits: Record<string, RecordChangeRow[]> = {
      ...changes,
      Donations: [
        rc('dc-create', 'd1', 'Create', '2022-06-01T00:00:00Z', { ID: 'd1', Amount: 10 }),
        rc('dc-update', 'd1', 'Update', '2023-01-01T00:00:00Z', { ID: 'd1', Amount: 20 }, ['Amount']),
      ],
    };
    const features: FeatureColumnSpec[] = [{ name: 'GivenToDate', source: { kind: 'windowed-aggregate', childEntity: 'Donations', foreignKey: 'PersonID', ownerKeyField: 'PersonID', dateField: 'GivenOn', endDateField: null, voidedAtField: null, aggregate: 'sum', valueField: 'Amount', windowDays: null, filter: [] }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } }];
    expect(await new AsOfFeatureAssembler().Assemble(input(features, { Tables: data, Changes: edits }))).toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'Donations', field: 'Amount', changesAfter: 1 } });
  });
  it('reads a replayed field through a null join key as missing, not as an uncovered row', async () => {
    const data: Record<string, SourceRow[]> = { ...tables, Years: [tables.Years[0], { ...tables.Years[1], PersonID: null }] };
    const out = await new AsOfFeatureAssembler().Assemble(input([statusOf('record-changes')], { Tables: data }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values[0])).toEqual(['Active', null]);
    expect(out.Rows[1].Provenance[0]).toMatchObject({ source: 'record-changes', sourceRef: 'none' });
  });
  it('fails a scoring assembly whose categorical column has no levels from training, naming it', async () => {
    await expect(new AsOfFeatureAssembler().Assemble({ ...input([region]), Context: 'score' })).rejects.toThrow(/Region/);
  });
  it('fails on a stored categorical value equal to the fold level, naming the column', async () => {
    const data: Record<string, SourceRow[]> = { ...tables, Years: [tables.Years[0], { ...tables.Years[1], Region: '__other' }] };
    await expect(new AsOfFeatureAssembler().Assemble(input([region], { Tables: data }))).rejects.toThrow(/Region.*__other|__other.*Region/);
  });
  it('honours pipeline version 0 in the read and the version string', async () => {
    const fv = (ID: string, PipelineVersion: number, ValueNumeric: number): SourceRow => ({
      ID, EntityID: 'E-Y', FeatureName: 'Engagement', RecordProcessID: 'RP-1', RecordID: 'ID|y1', EffectiveAsOf: new Date('2022-01-01T00:00:00Z'), ComputedAt: new Date('2022-01-02T00:00:00Z'),
      PipelineVersion, PromptVersionHash: null, AIModelID: null, ParametersHash: null, ValueNumeric, ValueText: null, ValueBoolean: null, ValueDate: null,
    });
    const data: Record<string, SourceRow[]> = { ...tables, 'MJ: Feature Values': [fv('fv-v0', 0, 5), fv('fv-v2', 2, 9)] };
    const out = await new AsOfFeatureAssembler().Assemble(input([engagement(0)], { Tables: data, Rows: [rows[0]] }));
    expect(out.Status === 'assembled' && out.Rows[0].Values).toEqual([5]);
    expect(out.Status === 'assembled' && out.Rows[0].Provenance[0]).toMatchObject({ sourceRef: 'MJ: Feature Values/fv-v0', sourceVersion: 'RP-1@0' });
  });
  it('refuses a pin with a fractional pipeline version', async () => {
    expect(await new AsOfFeatureAssembler().Assemble(input([engagement(1.5)]))).toEqual({ Status: 'refused', Refusal: { kind: 'unpinned-feature-version', featureName: 'Engagement' } });
  });
});

describe('AsOfFeatureAssembler record creation, uncovered reasons, counts and coverage', () => {
  const excludeAndCount: PredictionUnitSpec = { ...unit, history: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' } };
  const statusOf = (kind: 'immutable-field' | 'record-changes', keyField: string | null = 'PersonID'): FeatureColumnSpec =>
    ({ name: 'Status', source: { kind, entity: 'People', field: 'Status', keyField }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } });
  const givenToDate = (childEntity: string, dateField: string): FeatureColumnSpec =>
    ({ name: 'GivenToDate', source: { kind: 'windowed-aggregate', childEntity, foreignKey: 'PersonID', ownerKeyField: 'PersonID', dateField, endDateField: null, voidedAtField: null, aggregate: 'sum', valueField: 'Amount', windowDays: null, filter: [] }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } });

  it('resolves the join key of a unit row whose Create row is dated after its decision day as missing, not as uncovered', async () => {
    const yearChanges: Record<string, RecordChangeRow[]> = {
      ...changes,
      Years: [
        rc('yc-create', 'y1', 'Create', '2022-01-01T00:00:00Z', { ID: 'y1', PersonID: 'P1' }),
        rc('yc-create-2', 'y2', 'Create', '2024-02-01T00:00:00Z', { ID: 'y2', PersonID: 'P1' }),
      ],
    };
    const out = await new AsOfFeatureAssembler().Assemble(input([statusOf('record-changes')], { Changes: yearChanges, RowEntity: yearsWithUpdatable('PersonID') }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values[0])).toEqual(['Active', null]);
    expect(out.Rows[1].Provenance[0]).toMatchObject({ source: 'record-changes', sourceRef: 'none', sourceVersion: 'created-after-decision' });
    expect(out.ExcludedRowIds.size).toBe(0);
  });
  it('reads a record whose Create row is dated after the decision day as missing, for a current read and a replay', async () => {
    const late: Record<string, RecordChangeRow[]> = { People: [rc('rc-late-create', 'P1', 'Create', '2023-06-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    for (const kind of ['immutable-field', 'record-changes'] as const) {
      const out = await new AsOfFeatureAssembler().Assemble(input([statusOf(kind)], { Changes: late }));
      expect(out.Status).toBe('assembled');
      if (out.Status !== 'assembled') return;
      expect(out.Rows.map((r) => r.Values[0])).toEqual([null, 'Lapsed']);
      expect(out.Rows[0].Provenance[0]).toMatchObject({ source: kind, sourceVersion: 'created-after-decision' });
      expect(out.Rows[1].Provenance[0]).toMatchObject({ source: kind, sourceRef: 'People/p1/Status' });
    }
  });
  it('excludes and counts a current read whose history does not match the stored value, instead of refusing it', async () => {
    const mismatched: Record<string, RecordChangeRow[]> = { People: [rc('rc-create', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' })] };
    const out = await new AsOfFeatureAssembler().Assemble(input([statusOf('immutable-field')], { Changes: mismatched, Unit: excludeAndCount }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect([...out.ExcludedRowIds]).toEqual(['y1', 'y2']);
    expect(out.UncoveredRowsExcluded).toEqual([{ entity: 'People', field: 'Status', rows: 2 }]);
    expect(out.Coverage.filter((c) => c.entity === 'People').map((c) => [c.entity, c.field, c.continuity.recordsMismatched])).toEqual([['People', 'Status', 1]]);
  });
  it('counts the unit rows a field changed after, not the changes', async () => {
    const twice: Record<string, RecordChangeRow[]> = {
      People: [
        rc('rc-create', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }),
        rc('rc-update-1', 'P1', 'Update', '2023-01-01T00:00:00Z', { ID: 'P1', Status: 'Dormant' }, ['Status']),
        rc('rc-update-2', 'P1', 'Update', '2023-06-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }, ['Status']),
      ],
    };
    expect(await new AsOfFeatureAssembler().Assemble(input([statusOf('immutable-field')], { Changes: twice }))).toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'People', field: 'Status', changesAfter: 1 } });
  });
  it('refuses a tracked child row whose history starts after the earliest decision day, even when it contributes to no earlier row', async () => {
    const data: Record<string, SourceRow[]> = { ...tables, Donations: [{ ID: 'd1', PersonID: 'P1', GivenOn: '2023-03-01', Amount: 20 }] };
    const late: Record<string, RecordChangeRow[]> = { ...changes, Donations: [rc('dc-snapshot', 'd1', 'Snapshot', '2023-06-01T00:00:00Z', { ID: 'd1', Amount: 20 })] };
    expect(await new AsOfFeatureAssembler().Assemble(input([givenToDate('Donations', 'GivenOn')], { Tables: data, Changes: late }))).toEqual({ Status: 'refused', Refusal: { kind: 'decision-date-before-change-history', entity: 'Donations', field: 'Amount', historyStart: '2023-06-01T00:00:00.000Z', rowsAffected: 1 } });
  });
  it('refuses an updatable field of an untracked child entity even when no child row contributes', async () => {
    const data: Record<string, SourceRow[]> = { ...tables, Pledges: [{ ID: 'pl1', PersonID: 'P9', PledgedOn: '2022-06-01', Amount: 5 }] };
    expect(await new AsOfFeatureAssembler().Assemble(input([givenToDate('Pledges', 'PledgedOn')], { Tables: data }))).toEqual({ Status: 'refused', Refusal: { kind: 'decision-date-before-change-history', entity: 'Pledges', field: 'Amount', historyStart: null, rowsAffected: 2 } });
  });

  describe('coverage of one entity and field read through two joins', () => {
    const years: AssemblyEntityInfo = { ...entities.Years, Fields: [...entities.Years.Fields, fixed('SponsorID')] };
    const sponsored: Record<string, SourceRow[]> = {
      ...tables,
      Years: [{ ...tables.Years[0], SponsorID: 'P1' }, { ...tables.Years[1], SponsorID: 'P2' }],
      People: [...tables.People, { ID: 'P2', Status: 'Lapsed' }],
    };
    const through = (keyField: string): FeatureColumnSpec => ({ ...statusOf('record-changes', keyField), name: `StatusVia${keyField}` });

    it('merges to the later history start and adds the replayed counts', async () => {
      const withP2: Record<string, RecordChangeRow[]> = { People: [...changes.People, rc('rc-create-p2', 'P2', 'Create', '2023-06-01T00:00:00Z', { ID: 'P2', Status: 'Lapsed' })] };
      const out = await new AsOfFeatureAssembler().Assemble(input([through('PersonID'), through('SponsorID')], { Tables: sponsored, Changes: withP2, RowEntity: years }));
      expect(out.Status).toBe('assembled');
      if (out.Status !== 'assembled') return;
      expect(out.Rows.map((r) => r.Values)).toEqual([['Active', 'Active'], ['Lapsed', 'Lapsed']]);
      expect(out.Coverage.filter((c) => c.entity === 'People')).toEqual([expect.objectContaining({ entity: 'People', field: 'Status', historyStart: '2023-06-01T00:00:00.000Z', continuity: expect.objectContaining({ recordsReplayed: 3, recordsMismatched: 0 }) })]);
    });
    it('merges to no history start when any join reads a record without one', async () => {
      const out = await new AsOfFeatureAssembler().Assemble(input([through('PersonID'), through('SponsorID')], { Tables: sponsored, RowEntity: years, Unit: excludeAndCount }));
      expect(out.Status).toBe('assembled');
      if (out.Status !== 'assembled') return;
      expect([...out.ExcludedRowIds]).toEqual(['y2']);
      expect(out.Coverage.filter((c) => c.entity === 'People')).toEqual([expect.objectContaining({ entity: 'People', field: 'Status', historyStart: null, continuity: expect.objectContaining({ recordsReplayed: 2 }) })]);
    });
  });
});

describe('AsOfFeatureAssembler history loads, late-entered child rows and creation on every current read', () => {
  const statusVia = (name: string, keyField: string): FeatureColumnSpec =>
    ({ name, source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } });
  const countOf = (childEntity: string, dateField: string): FeatureColumnSpec =>
    ({ name: 'ToDate', source: { kind: 'windowed-aggregate', childEntity, foreignKey: 'PersonID', ownerKeyField: 'PersonID', dateField, endDateField: null, voidedAtField: null, aggregate: 'count', valueField: null, windowDays: null, filter: [] }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } });
  const region: FeatureColumnSpec = { name: 'Region', source: { kind: 'immutable-field', entity: 'Years', field: 'Region', keyField: null }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } };
  /** Years rows with their own Create rows: y2 was created after its decision day. */
  const yearCreates: Record<string, RecordChangeRow[]> = {
    ...changes,
    Years: [
      rc('yc-create', 'y1', 'Create', '2022-01-01T00:00:00Z', { ID: 'y1', PersonID: 'P1', Region: 'EU' }),
      rc('yc-create-2', 'y2', 'Create', '2024-02-01T00:00:00Z', { ID: 'y2', PersonID: 'P1', Region: 'R7' }),
    ],
  };

  it('loads the history of one entity, field and key set once for every feature that reads it', async () => {
    const base = input([statusVia('StatusA', 'PersonID'), statusVia('StatusB', 'PersonID')]);
    const loads: string[] = [];
    const counting: IRecordHistoryReader = { Load: (entity, keys, fields, policy, now) => { loads.push(`${entity.Name}|${fields.join(',')}`); return base.History.Load(entity, keys, fields, policy, now); } };
    const out = await new AsOfFeatureAssembler().Assemble({ ...base, History: counting });
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values)).toEqual([['Active', 'Active'], ['Lapsed', 'Lapsed']]);
    expect(loads.filter((l) => l === 'People|Status')).toHaveLength(1);
    expect(out.Coverage.filter((c) => c.entity === 'People')).toEqual([expect.objectContaining({ field: 'Status', continuity: expect.objectContaining({ recordsReplayed: 1 }) })]);
  });
  it('drops a tracked child row created after the owner row\'s decision day from that owner\'s window, and records the drop', async () => {
    const personRows: AssemblyRowRef[] = rows.map((r) => ({ ...r, EntityKey: 'P1' }));
    const eventCreates: Record<string, RecordChangeRow[]> = {
      ...changes,
      Events: [
        rc('ec-1', 'e1', 'Create', '2022-06-01T00:00:00Z', { ID: 'e1', PersonID: 'P1', EventDate: '2022-06-01' }),
        rc('ec-2', 'e2', 'Create', '2023-12-15T00:00:00Z', { ID: 'e2', PersonID: 'P1', EventDate: '2023-06-01' }),
        rc('ec-3', 'e3', 'Create', '2024-01-01T00:00:00Z', { ID: 'e3', PersonID: 'P1', EventDate: '2024-01-01' }),
      ],
    };
    const out = await new AsOfFeatureAssembler().Assemble(input([{ ...countOf('Events', 'EventDate'), source: { ...countOf('Events', 'EventDate').source, ownerKeyField: null } as FeatureColumnSpec['source'] }], { Rows: personRows, Changes: eventCreates }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    // e2 is dated inside y2's window but was entered two weeks after y2's decision day: it did not exist then.
    expect(out.Rows.map((r) => r.Values[0])).toEqual([1, 1]);
    expect(out.ColumnProvenance[0]).toMatchObject({ sourceVersion: 'window:all;aggregate:count', lateEnteredDropped: 1 });
  });
  it('drops an untracked child row whose __mj_CreatedAt is after the owner row\'s decision day', async () => {
    const data: Record<string, SourceRow[]> = {
      ...tables,
      Signups: [
        { ID: 's1', PersonID: 'P1', SignedOn: '2022-06-01', __mj_CreatedAt: new Date('2022-06-01T00:00:00Z') },
        { ID: 's2', PersonID: 'P1', SignedOn: '2023-06-01', __mj_CreatedAt: new Date('2024-01-01T00:00:00Z') },
      ],
    };
    const out = await new AsOfFeatureAssembler().Assemble(input([countOf('Signups', 'SignedOn')], { Tables: data }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values[0])).toEqual([1, 1]);
    expect(out.ColumnProvenance[0]).toMatchObject({ sourceVersion: 'window:all;aggregate:count', lateEnteredDropped: 1 });
  });
  it('reads an immutable field of a tracked entity whose record was created after the decision day as missing', async () => {
    const out = await new AsOfFeatureAssembler().Assemble(input([region], { Changes: yearCreates }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values[0])).toEqual(['EU', null]);
    expect(out.Rows[1].Provenance[0]).toMatchObject({ source: 'immutable-field', sourceRef: 'Years/y2/Region', sourceVersion: 'created-after-decision' });
  });
  it('resolves a fixed join key of a tracked unit row created after its decision day as missing', async () => {
    const out = await new AsOfFeatureAssembler().Assemble(input([statusVia('Status', 'PersonID')], { Changes: yearCreates }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => r.Values[0])).toEqual(['Active', null]);
    expect(out.Rows[1].Provenance[0]).toMatchObject({ sourceRef: 'none', sourceVersion: 'created-after-decision' });
  });
  it('refuses a child field changed after a decision day even when an earlier child field is excluded', async () => {
    const data: Record<string, SourceRow[]> = { ...tables, Gifts: [{ ID: 'g1', PersonID: 'P1', GivenOn: '2022-06-01', Amount: 20 }] };
    const gifts: Record<string, RecordChangeRow[]> = {
      ...changes,
      Gifts: [
        // The owner key's history says P0 while the row says P1 (a change that bypassed Record Changes); the amount was edited later.
        rc('gc-create', 'g1', 'Create', '2022-06-01T00:00:00Z', { ID: 'g1', PersonID: 'P0', GivenOn: '2022-06-01', Amount: 10 }),
        rc('gc-update', 'g1', 'Update', '2023-01-01T00:00:00Z', { ID: 'g1', PersonID: 'P0', GivenOn: '2022-06-01', Amount: 20 }, ['Amount']),
      ],
    };
    const sum: FeatureColumnSpec = { ...countOf('Gifts', 'GivenOn'), source: { ...countOf('Gifts', 'GivenOn').source, aggregate: 'sum', valueField: 'Amount' } as FeatureColumnSpec['source'] };
    expect(await new AsOfFeatureAssembler().Assemble(input([sum], { Tables: data, Changes: gifts }))).toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'Gifts', field: 'Amount', changesAfter: 1 } });
  });
});

describe('AsOfFeatureAssembler creation from the stored column, and the late-entered drop count', () => {
  const read = (name: string, entity: string): FeatureColumnSpec =>
    ({ name, source: { kind: 'immutable-field', entity, field: name, keyField: null }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } });
  const excludeAndCount: PredictionUnitSpec = { ...unit, history: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' } };

  it('reads a tracked record whose history starts with a Snapshot after the decision day as missing when its __mj_CreatedAt is after it too', async () => {
    const data: Record<string, SourceRow[]> = {
      ...tables,
      Tiers: [{ ID: 'y1', Tier: 'Gold', __mj_CreatedAt: new Date('2022-06-01T00:00:00Z') }, { ID: 'y2', Tier: 'Silver', __mj_CreatedAt: new Date('2024-01-01T00:00:00Z') }],
    };
    const tierChanges: Record<string, RecordChangeRow[]> = {
      ...changes,
      Tiers: [rc('ts-1', 'y1', 'Snapshot', '2022-07-01T00:00:00Z', { ID: 'y1', Tier: 'Gold' }), rc('ts-2', 'y2', 'Snapshot', '2024-02-01T00:00:00Z', { ID: 'y2', Tier: 'Silver' })],
    };
    const out = await new AsOfFeatureAssembler().Assemble(input([read('Tier', 'Tiers')], { Tables: data, Changes: tierChanges }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    // y2 did not exist on its decision day (2023-12-01): missing, not a history gap that refuses the assembly.
    expect(out.Rows.map((r) => r.Values[0])).toEqual(['Gold', null]);
    expect(out.Rows[1].Provenance[0]).toMatchObject({ sourceRef: 'Tiers/y2/Tier', sourceVersion: 'created-after-decision' });
  });
  it('takes the later of the Create row and __mj_CreatedAt as the creation instant', async () => {
    const data: Record<string, SourceRow[]> = {
      ...tables,
      Badges: [{ ID: 'y1', Level: 'Gold', __mj_CreatedAt: new Date('2023-01-01T00:00:00Z') }, { ID: 'y2', Level: 'Silver', __mj_CreatedAt: new Date('2022-01-01T00:00:00Z') }],
    };
    const badgeChanges: Record<string, RecordChangeRow[]> = {
      ...changes,
      Badges: [rc('bc-1', 'y1', 'Create', '2022-01-01T00:00:00Z', { ID: 'y1', Level: 'Gold' }), rc('bc-2', 'y2', 'Create', '2022-01-01T00:00:00Z', { ID: 'y2', Level: 'Silver' })],
    };
    const out = await new AsOfFeatureAssembler().Assemble(input([read('Level', 'Badges')], { Tables: data, Changes: badgeChanges }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    // y1's column says it was created after its decision day (2022-12-01), though its Create row is earlier.
    expect(out.Rows.map((r) => r.Values[0])).toEqual([null, 'Silver']);
    expect(out.Rows[0].Provenance[0]).toMatchObject({ sourceVersion: 'created-after-decision' });
    expect(out.Rows[1].Provenance[0]).toMatchObject({ sourceVersion: 'created:2022-01-01T00:00:00.000Z' });
  });
  it('reports a zero drop count on an aggregate column that dropped nothing, and none on one whose rows are all uncovered', async () => {
    const count: FeatureColumnSpec = {
      name: 'Given', source: { kind: 'windowed-aggregate', childEntity: 'Gifts', foreignKey: 'PersonID', ownerKeyField: 'PersonID', dateField: 'GivenOn', endDateField: null, voidedAtField: null, aggregate: 'count', valueField: null, windowDays: null, filter: [] },
      encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null },
    };
    const data: Record<string, SourceRow[]> = { ...tables, Gifts: [{ ID: 'g1', PersonID: 'P1', GivenOn: '2022-06-01', Amount: 20 }] };
    const giftHistory = (personId: string): Record<string, RecordChangeRow[]> =>
      ({ ...changes, Gifts: [rc('gc-1', 'g1', 'Create', '2022-06-01T00:00:00Z', { ID: 'g1', PersonID: personId, GivenOn: '2022-06-01', Amount: 20 })] });
    const clean = await new AsOfFeatureAssembler().Assemble(input([count], { Tables: data, Changes: giftHistory('P1') }));
    expect(clean.Status === 'assembled' && clean.ColumnProvenance[0]).toMatchObject({ sourceVersion: 'window:all;aggregate:count', lateEnteredDropped: 0 });
    // The owner key's history says P0 while the row says P1: every unit row is uncovered, so no window was read.
    const out = await new AsOfFeatureAssembler().Assemble(input([count], { Tables: data, Changes: giftHistory('P0'), Unit: excludeAndCount }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect([...out.ExcludedRowIds]).toEqual(['y1', 'y2']);
    expect(out.ColumnProvenance[0].lateEnteredDropped).toBeUndefined();
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
