import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { FeatureColumnSpec, PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { AsOfFeatureAssembler, type AsOfAssemblyInput, type AssemblyRowRef } from '../as-of-assembler';
import { RunViewRecordHistoryReader, type IRecordHistoryReader, type RecordChangeRow } from '../record-history';
import { SeriesFeatures, type SeriesHistory } from '../series-features';
import type { SourceRow } from '../../data-access';
import type { AssemblyEntityInfo, AssemblyFieldInfo, IAssemblyMetadata } from '../../assembly-metadata';
import { TableDataAccess } from '../../../__tests__/fakes/table-data-access';

const rows: AssemblyRowRef[] = [
  { RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2022-12-01T00:00:00Z'), Period: null },
  { RowID: 'y2', EntityKey: 'y2', DecisionDate: new Date('2023-12-01T00:00:00Z'), Period: null },
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

/** The fixture's change rows as `MJ: Record Changes` rows of the entity they belong to, as the production reader reads them. */
const recordChangeRows = (rowChanges: Record<string, RecordChangeRow[]>): SourceRow[] =>
  Object.entries(rowChanges).flatMap(([name, list]) => list.map((c) => ({ ...c, EntityID: entities[name].ID, Status: 'Complete' })));

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
  const dataAccess = new TableDataAccess({ ...(f.Tables || tables), 'MJ: Record Changes': recordChangeRows(f.Changes || changes) });
  return {
    Context: 'train',
    Unit: f.Unit || unit,
    RowEntity: f.RowEntity || entities.Years,
    Rows: f.Rows || rows,
    Features: features,
    SeriesHistory: f.SeriesHistory || null,
    Read: { mode: 'complete' },
    DataAccess: dataAccess,
    History: new RunViewRecordHistoryReader(dataAccess, { mode: 'complete' }),
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
    const at = async (decision: string) => new AsOfFeatureAssembler().Assemble(input(features, { Tables: data, Rows: [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date(decision), Period: null }] }));

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
      { EntityKey: 'P1', Period: new Date('2021-01-01T00:00:00Z'), Value: 5, RowID: 'y0', WindowEnd: new Date('2021-12-31T00:00:00Z') },
      { EntityKey: 'P1', Period: new Date('2022-01-01T00:00:00Z'), Value: 7, RowID: 'y1', WindowEnd: new Date('2022-12-31T00:00:00Z') },
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
    const fourRows: AssemblyRowRef[] = regions.map((_, i) => ({ RowID: `y${i + 1}`, EntityKey: `y${i + 1}`, DecisionDate: new Date('2023-12-01T00:00:00Z'), Period: null }));
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
    const fourRows: AssemblyRowRef[] = regions.map((_, i) => ({ RowID: `y${i + 1}`, EntityKey: `y${i + 1}`, DecisionDate: new Date('2023-12-01T00:00:00Z'), Period: null }));
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
    expect([...out.ExcludedRowIDs]).toEqual(['y1', 'y2']);
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
    expect(out.ExcludedRowIDs.size).toBe(0);
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
    expect([...out.ExcludedRowIDs]).toEqual(['y1', 'y2']);
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
      expect([...out.ExcludedRowIDs]).toEqual(['y2']);
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
    const counting: IRecordHistoryReader = {
      Load: (entity, keys, fields, policy, now) => { loads.push(`${entity.Name}|${fields.join(',')}`); return base.History.Load(entity, keys, fields, policy, now); },
      LoadDeletedChildren: (entity, foreignKeyField, ownerKeys) => base.History.LoadDeletedChildren(entity, foreignKeyField, ownerKeys),
    };
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
    expect([...out.ExcludedRowIDs]).toEqual(['y1', 'y2']);
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

describe('AsOfFeatureAssembler — a decision day on or after the assembly day reads stored values', () => {
  // The fixture assembles on 2026-10-12.
  const today = new Date('2026-10-12T00:00:00Z');
  const yesterday = new Date('2026-10-11T00:00:00Z');
  const tier = (kind: 'immutable-field' | 'record-changes'): FeatureColumnSpec =>
    ({ name: `Tier-${kind}`, source: { kind, entity: 'Accounts', field: 'Tier', keyField: null }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } });
  const accounts = { ...tables, Accounts: [{ ID: 'a1', Tier: 'Gold' }] };
  const accountRow = (decision: Date): AssemblyRowRef[] => [{ RowID: 'a1', EntityKey: 'a1', DecisionDate: decision, Period: null }];

  it("reads an untracked entity's updatable field as covered for a row decided today, directly and replayed", async () => {
    const out = await new AsOfFeatureAssembler().Assemble(input([tier('record-changes'), tier('immutable-field')], { Tables: accounts, RowEntity: entities.Accounts, Rows: accountRow(today) }));
    if (out.Status !== 'assembled') throw new Error(JSON.stringify(out));
    expect(out.Rows.map((r) => r.Values)).toEqual([['Gold', 'Gold']]);
    expect([out.UncoveredRowsExcluded, out.Rows[0].Provenance[0].sourceVersion]).toEqual([[], 'stored-on-decision-day']);
  });

  it('still refuses the same field for a row decided yesterday', async () => {
    for (const kind of ['record-changes', 'immutable-field'] as const) {
      expect(await new AsOfFeatureAssembler().Assemble(input([tier(kind)], { Tables: accounts, RowEntity: entities.Accounts, Rows: accountRow(yesterday) })))
        .toEqual({ Status: 'refused', Refusal: { kind: 'decision-date-before-change-history', entity: 'Accounts', field: 'Tier', historyStart: null, rowsAffected: 1 } });
    }
  });

  it('keeps the rule for a tracked entity changed after a past decision day, and reads the stored value for a row decided today', async () => {
    const status: FeatureColumnSpec = { name: 'Status', source: { kind: 'immutable-field', entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } };
    const past: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2022-12-01T00:00:00Z'), Period: null }];
    expect(await new AsOfFeatureAssembler().Assemble(input([status], { Rows: past }))).toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'People', field: 'Status', changesAfter: 1 } });
    const now: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: today, Period: null }];
    const out = await new AsOfFeatureAssembler().Assemble(input([status], { Rows: now }));
    expect(out.Status === 'assembled' ? out.Rows.map((r) => r.Values[0]) : out).toEqual(['Lapsed']);
    // A tracked entity with no change history: a past day is refused, today reads the stored value.
    const tierOf: FeatureColumnSpec = { name: 'Tier', source: { kind: 'immutable-field', entity: 'Tiers', field: 'Tier', keyField: null }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } };
    const tiers = { ...tables, Tiers: [{ ID: 't1', Tier: 'Gold', __mj_CreatedAt: '2025-01-01T00:00:00Z' }] };
    const tierRow = (decision: Date): AssemblyRowRef[] => [{ RowID: 't1', EntityKey: 't1', DecisionDate: decision, Period: null }];
    expect((await new AsOfFeatureAssembler().Assemble(input([tierOf], { Tables: tiers, RowEntity: entities.Tiers, Rows: tierRow(yesterday) }))).Status).toBe('refused');
    const fresh = await new AsOfFeatureAssembler().Assemble(input([tierOf], { Tables: tiers, RowEntity: entities.Tiers, Rows: tierRow(today) }));
    expect(fresh.Status === 'assembled' ? fresh.Rows.map((r) => r.Values[0]) : fresh).toEqual(['Gold']);
  });

  it('replays the history for a row decided after the assembly day when the history covers that day (stored value only when uncovered)', async () => {
    const status: FeatureColumnSpec = { name: 'Status', source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } };
    // The lapse is dated after the decision day, which is after the assembly day: the history says Active on that day.
    const dated = { People: [rc('rc-create', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }), rc('rc-lapse', 'P1', 'Update', '2027-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }, ['Status'])] };
    const later: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2026-12-01T00:00:00Z'), Period: null }];
    const out = await new AsOfFeatureAssembler().Assemble(input([status], { Rows: later, Changes: dated }));
    if (out.Status !== 'assembled') throw new Error(JSON.stringify(out));
    expect([out.Rows[0].Values[0], out.Rows[0].Provenance[0].sourceVersion]).toEqual(['Active', 'rc-create']);
  });

  it('reads a tracked updatable field directly by the same rule as replay: a covering history with a later update refuses, an uncovered one reads the stored value', async () => {
    const status: FeatureColumnSpec = { name: 'Status', source: { kind: 'immutable-field', entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } };
    // The history covers 2026-12-01 (created 2021) and lapses 2027-01-01, after that decision day: the stored Lapsed is not the value then.
    const dated = { People: [rc('rc-create', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }), rc('rc-lapse', 'P1', 'Update', '2027-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }, ['Status'])] };
    const later: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2026-12-01T00:00:00Z'), Period: null }];
    expect(await new AsOfFeatureAssembler().Assemble(input([status], { Rows: later, Changes: dated })))
      .toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'People', field: 'Status', changesAfter: 1 } });
    // No history at all for the record: uncovered, so a row decided after the assembly day reads the stored value.
    const out = await new AsOfFeatureAssembler().Assemble(input([status], { Rows: later, Changes: { People: [] } }));
    expect(out.Status === 'assembled' ? out.Rows.map((r) => r.Values[0]) : out).toEqual(['Lapsed']);
  });

  const later: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2026-12-01T00:00:00Z'), Period: null }];
  const replayedStatus: FeatureColumnSpec = { name: 'Status', source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } };
  const excludeAndCountUnit: PredictionUnitSpec = { ...unit, history: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' } };

  it('replays a history that reaches a later decision day but is ineligible (an External Create) as uncovered, never the stored value', async () => {
    const external: RecordChangeRow = { ...rc('rc-ext', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }), Source: 'External' };
    const dated = { People: [external, rc('rc-lapse', 'P1', 'Update', '2027-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }, ['Status'])] };
    const out = await new AsOfFeatureAssembler().Assemble(input([replayedStatus], { Rows: later, Changes: dated }));
    expect(out.Status).toBe('refused');
    const counted = await new AsOfFeatureAssembler().Assemble(input([replayedStatus], { Rows: later, Changes: dated, Unit: excludeAndCountUnit }));
    expect(counted.Status === 'assembled' ? [counted.Rows.length, counted.UncoveredRowsExcluded.length] : counted).toEqual([0, 1]);
  });

  it('replays a history whose replay does not match the stored row (a continuity mismatch) as uncovered, never the stored value', async () => {
    const data = { ...tables, People: [{ ID: 'P1', Status: 'Expired' }] };
    const out = await new AsOfFeatureAssembler().Assemble(input([replayedStatus], { Rows: later, Tables: data, Unit: excludeAndCountUnit }));
    expect(out.Status === 'assembled' ? [out.Rows.length, out.UncoveredRowsExcluded.length] : out).toEqual([0, 1]);
  });

  it('judges a join key read for a later decision day by the replay rule: a covering history with a later update refuses, no history reads the stored key', async () => {
    const moved = { ...changes, Years: [rc('yc-create', 'y1', 'Create', '2021-01-01T00:00:00Z', { ID: 'y1', PersonID: 'P0' }), rc('yc-move', 'y1', 'Update', '2027-01-01T00:00:00Z', { ID: 'y1', PersonID: 'P1' }, ['PersonID'])] };
    expect(await new AsOfFeatureAssembler().Assemble(input([replayedStatus], { Rows: later, Changes: moved, RowEntity: yearsWithUpdatable('PersonID') })))
      .toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'Years', field: 'PersonID', changesAfter: 1 } });
    const unmoved = await new AsOfFeatureAssembler().Assemble(input([replayedStatus], { Rows: later, RowEntity: yearsWithUpdatable('PersonID') }));
    expect(unmoved.Status === 'assembled' ? unmoved.Rows.map((r) => r.Values[0]) : unmoved).toEqual(['Lapsed']);
  });

  it("judges a tracked child row's value for a later decision day by the replay rule: a covering history with a later edit refuses, no history reads the stored value", async () => {
    const data = { ...tables, Donations: [{ ID: 'd1', PersonID: 'P1', GivenOn: '2025-06-01', Amount: 20 }] };
    const sum: FeatureColumnSpec = { name: 'GivenToDate', source: { kind: 'windowed-aggregate', childEntity: 'Donations', foreignKey: 'PersonID', ownerKeyField: 'PersonID', dateField: 'GivenOn', endDateField: null, voidedAtField: null, aggregate: 'sum', valueField: 'Amount', windowDays: null, filter: [] }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } };
    const edited = { ...changes, Donations: [rc('dc-create', 'd1', 'Create', '2025-06-01T00:00:00Z', { ID: 'd1', Amount: 10 }), rc('dc-edit', 'd1', 'Update', '2027-01-01T00:00:00Z', { ID: 'd1', Amount: 20 }, ['Amount'])] };
    expect(await new AsOfFeatureAssembler().Assemble(input([sum], { Rows: later, Tables: data, Changes: edited })))
      .toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'Donations', field: 'Amount', changesAfter: 1 } });
    const unedited = await new AsOfFeatureAssembler().Assemble(input([sum], { Rows: later, Tables: data }));
    expect(unedited.Status === 'assembled' ? unedited.Rows.map((r) => r.Values[0]) : unedited).toEqual([20]);
  });

  it("covers an untracked child's updatable field in an aggregate for owners decided today", async () => {
    const pledges = { ...tables, Pledges: [{ ID: 'pl1', PersonID: 'P1', PledgedOn: '2022-06-01', Amount: 5 }, { ID: 'pl2', PersonID: 'P1', PledgedOn: '2026-10-01', Amount: 7 }] };
    const sum: FeatureColumnSpec = { name: 'Pledged', source: { kind: 'windowed-aggregate', childEntity: 'Pledges', foreignKey: 'PersonID', ownerKeyField: 'PersonID', dateField: 'PledgedOn', endDateField: null, voidedAtField: null, aggregate: 'sum', valueField: 'Amount', windowDays: null, filter: [] }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } };
    const now: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: today, Period: null }];
    const out = await new AsOfFeatureAssembler().Assemble(input([sum], { Tables: pledges, Rows: now }));
    expect(out.Status === 'assembled' ? out.Rows.map((r) => r.Values[0]) : out).toEqual([12]);
  });
});

describe('AsOfFeatureAssembler — a stored value changed after the decision by a change row of any type', () => {
  const sourced = (row: RecordChangeRow, source: RecordChangeRow['Source']): RecordChangeRow => ({ ...row, Source: source });
  const one: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2022-12-01T00:00:00Z'), Period: null }];
  const data: Record<string, SourceRow[]> = { Years: [{ ID: 'y1', PersonID: 'P1' }], People: [{ ID: 'P1', Status: 'Lapsed' }] };
  const stored: FeatureColumnSpec = { name: 'Status', source: { kind: 'immutable-field', entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } };

  it('refuses when an external Create row after the decision carries a new value of the field (history started by a Snapshot)', async () => {
    const out = await new AsOfFeatureAssembler().Assemble(input([stored], { Rows: one, Tables: data, Changes: { People: [
      rc('s0', 'P1', 'Snapshot', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }),
      sourced(rc('c1', 'P1', 'Create', '2023-06-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }), 'External'),
    ] } }));
    expect(out).toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'People', field: 'Status', changesAfter: 1 } });
  });

  it('refuses when a later Snapshot row carries a new value of the field', async () => {
    const out = await new AsOfFeatureAssembler().Assemble(input([stored], { Rows: one, Tables: data, Changes: { People: [
      rc('c0', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }),
      rc('s1', 'P1', 'Snapshot', '2023-06-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }),
    ] } }));
    expect(out.Status === 'refused' ? out.Refusal.kind : out.Status).toBe('select-changes-after-decision-date');
  });

  it('refuses when the record was deleted and re-created after the decision', async () => {
    const out = await new AsOfFeatureAssembler().Assemble(input([stored], { Rows: one, Tables: data, Changes: { People: [
      rc('c0', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }),
      rc('d1', 'P1', 'Delete', '2023-06-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }),
      rc('c2', 'P1', 'Create', '2023-07-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }),
    ] } }));
    expect(out.Status === 'refused' ? out.Refusal.kind : out.Status).toBe('select-changes-after-decision-date');
  });

  it('assembles a row whose parent was hard-deleted after the decision date, and excludes it under exclude-and-count when deleted before', async () => {
    const deletedAfter = { People: [rc('c0', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }), rc('d1', 'P1', 'Delete', '2025-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const withoutP1 = { ...data, People: data.People.filter((p) => p.ID !== 'P1') };
    // The replayed read of the parent's field: the path the history reader serves (a stored read of a gone record has no stored value).
    const replayed: FeatureColumnSpec = { ...stored, source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' } };
    const out = await new AsOfFeatureAssembler().Assemble(input([replayed], { Rows: one, Tables: withoutP1, Changes: deletedAfter }));
    expect(out.Status === 'assembled' && out.Rows[0].Values).toEqual(['Lapsed']);
    const deletedBefore = { People: [deletedAfter.People[0], rc('d1', 'P1', 'Delete', '2022-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const excluded = await new AsOfFeatureAssembler().Assemble(input([replayed], { Rows: one, Tables: withoutP1, Changes: deletedBefore, Unit: { ...unit, history: { ...unit.history, onUncoveredRow: 'exclude-and-count' } } }));
    expect(excluded.Status === 'assembled' && excluded.UncoveredRowsExcluded).toEqual([{ entity: 'People', field: 'Status', rows: 1 }]);
  });

  it('reads a stored field of a parent hard-deleted after the decision date from its Delete row, and excludes it when deleted before', async () => {
    const deletedAfter = { People: [rc('c0', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }), rc('d1', 'P1', 'Delete', '2025-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const withoutP1 = { ...data, People: data.People.filter((p) => p.ID !== 'P1') };
    const out = await new AsOfFeatureAssembler().Assemble(input([stored], { Rows: one, Tables: withoutP1, Changes: deletedAfter }));
    expect(out.Status === 'assembled' && out.Rows[0].Values).toEqual(['Lapsed']);
    expect(out.Status === 'assembled' && out.Rows[0].Provenance[0]).toMatchObject({ source: 'immutable-field', sourceRef: 'People/p1/Status', sourceVersion: 'd1', computedAt: '2025-01-01T00:00:00.000Z' });
    const deletedBefore = { People: [deletedAfter.People[0], rc('d1', 'P1', 'Delete', '2022-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const excluded = await new AsOfFeatureAssembler().Assemble(input([stored], { Rows: one, Tables: withoutP1, Changes: deletedBefore, Unit: { ...unit, history: { ...unit.history, onUncoveredRow: 'exclude-and-count' } } }));
    expect(excluded.Status === 'assembled' && excluded.UncoveredRowsExcluded).toEqual([{ entity: 'People', field: 'Status', rows: 1 }]);
  });

  it('refuses a stored read of a parent with no row and no Delete in its history as a truncated read', async () => {
    const withoutP1 = { ...data, People: data.People.filter((p) => p.ID !== 'P1') };
    const out = await new AsOfFeatureAssembler().Assemble(input([stored], { Rows: one, Tables: withoutP1, Changes: { People: [rc('c0', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] } }));
    expect(out).toEqual({ Status: 'refused', Refusal: { kind: 'truncated-read', entity: 'People', rowsExpected: 1, rowsRead: 0 } });
  });

  it('makes a row decided on the assembly day uncovered (deleted) when its parent was hard-deleted before it', async () => {
    const replayed: FeatureColumnSpec = { ...stored, source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' } };
    const onAssemblyDay: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2026-10-12T00:00:00Z'), Period: null }];
    const withoutP1 = { ...data, People: data.People.filter((p) => p.ID !== 'P1') };
    const deleted = { People: [rc('c0', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }), rc('d1', 'P1', 'Delete', '2025-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const counting: PredictionUnitSpec = { ...unit, history: { ...unit.history, onUncoveredRow: 'exclude-and-count' } };
    for (const feature of [replayed, stored]) {
      const out = await new AsOfFeatureAssembler().Assemble(input([feature], { Rows: onAssemblyDay, Tables: withoutP1, Changes: deleted, Unit: counting }));
      expect(out.Status === 'assembled' ? out.UncoveredRowsExcluded : out).toEqual([{ entity: 'People', field: 'Status', rows: 1 }]);
    }
  });

  it('reads a virtual field of a hard-deleted parent on the assembly day from its Delete row while it stood, and uncovers it once deleted', async () => {
    const withVirtual: AssemblyEntityInfo = { ...entities.People, Fields: [...entities.People.Fields, { ...field('RegionName'), IsVirtual: true }] };
    const virtual: FeatureColumnSpec = { ...stored, name: 'RegionName', source: { kind: 'record-changes', entity: 'People', field: 'RegionName', keyField: 'PersonID' } };
    const onAssemblyDay: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2026-10-12T00:00:00Z'), Period: null }];
    const withoutP1 = { ...data, People: data.People.filter((p) => p.ID !== 'P1') };
    const deletedOn = (at: string) => ({ People: [rc('c0', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed', RegionName: 'North' }), rc('d1', 'P1', 'Delete', at, { ID: 'P1', Status: 'Lapsed', RegionName: 'North' })] });
    const assemble = (deleteAt: string) => new AsOfFeatureAssembler().Assemble({
      ...input([virtual], { Rows: onAssemblyDay, Tables: withoutP1, Changes: deletedOn(deleteAt), Unit: { ...unit, history: { ...unit.history, onUncoveredRow: 'exclude-and-count' } } }),
      Metadata: { Entity: (n) => (n === 'People' ? withVirtual : metadata.Entity(n)) },
    });
    const held = await assemble('2026-10-20T00:00:00Z');
    expect(held.Status === 'assembled' ? held.Rows[0].Values : held).toEqual(['North']);
    expect(held.Status === 'assembled' && held.Rows[0].Provenance[0]).toMatchObject({ source: 'record-changes', sourceRef: 'People/p1/RegionName', sourceVersion: 'd1', computedAt: '2026-10-20T00:00:00.000Z' });
    // The history read only explains the missing row; nothing replays a virtual field, so it records no coverage.
    expect(held.Status === 'assembled' && held.Coverage.filter((c) => c.entity === 'People')).toEqual([]);
    const deleted = await assemble('2025-01-01T00:00:00Z');
    expect(deleted.Status === 'assembled' ? deleted.UncoveredRowsExcluded : deleted).toEqual([{ entity: 'People', field: 'RegionName', rows: 1 }]);
  });

  it('uncovers a row on the assembly day whose hard-deleted parent has a history of only Update and Delete rows', async () => {
    const replayed: FeatureColumnSpec = { ...stored, source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' } };
    const onAssemblyDay: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2026-10-12T00:00:00Z'), Period: null }];
    const withoutP1 = { ...data, People: data.People.filter((p) => p.ID !== 'P1') };
    const noCreate = { People: [rc('u0', 'P1', 'Update', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }, ['Status']), rc('d1', 'P1', 'Delete', '2025-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const out = await new AsOfFeatureAssembler().Assemble(input([replayed], { Rows: onAssemblyDay, Tables: withoutP1, Changes: noCreate, Unit: { ...unit, history: { ...unit.history, onUncoveredRow: 'exclude-and-count' } } }));
    expect(out.Status === 'assembled' ? out.UncoveredRowsExcluded : out).toEqual([{ entity: 'People', field: 'Status', rows: 1 }]);
  });
  it('uncovers a row on the assembly day whose parent has a current row but an unanchored history ending in a Delete', async () => {
    // The Delete in force reads as deleted before the stored-value read: the current row does not make it covered.
    const replayed: FeatureColumnSpec = { ...stored, source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' } };
    const onAssemblyDay: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2026-10-12T00:00:00Z'), Period: null }];
    const noCreate = { People: [rc('u0', 'P1', 'Update', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }, ['Status']), rc('d1', 'P1', 'Delete', '2022-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const out = await new AsOfFeatureAssembler().Assemble(input([replayed], { Rows: onAssemblyDay, Tables: data, Changes: noCreate, Unit: { ...unit, history: { ...unit.history, onUncoveredRow: 'exclude-and-count' } } }));
    expect(out.Status === 'assembled' ? out.UncoveredRowsExcluded : out).toEqual([{ entity: 'People', field: 'Status', rows: 1 }]);
  });
  it('excludes, under exclude-and-count, a stored read of a parent whose only history is an Update and a Delete before the decision date', async () => {
    const past: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2023-06-01T00:00:00Z'), Period: null }];
    const withoutP1 = { ...data, People: data.People.filter((p) => p.ID !== 'P1') };
    const noCreate = { People: [rc('u0', 'P1', 'Update', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }, ['Status']), rc('d1', 'P1', 'Delete', '2022-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const out = await new AsOfFeatureAssembler().Assemble(input([stored], { Rows: past, Tables: withoutP1, Changes: noCreate, Unit: { ...unit, history: { ...unit.history, onUncoveredRow: 'exclude-and-count' } } }));
    expect(out.Status === 'assembled' ? out.UncoveredRowsExcluded : out).toEqual([{ entity: 'People', field: 'Status', rows: 1 }]);
  });
  it('refuses, under refuse, a replayed parent hard-deleted with a value no change row produced: its Delete row fails continuity', async () => {
    const replayed: FeatureColumnSpec = { ...stored, source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' } };
    const past: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2023-12-01T00:00:00Z'), Period: null }];
    const withoutP1 = { ...data, People: data.People.filter((p) => p.ID !== 'P1') };
    const moved = { People: [rc('c0', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }), rc('d1', 'P1', 'Delete', '2024-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const out = await new AsOfFeatureAssembler().Assemble(input([replayed], { Rows: past, Tables: withoutP1, Changes: moved }));
    expect(out).toEqual({ Status: 'refused', Refusal: { kind: 'decision-date-before-change-history', entity: 'People', field: 'Status', historyStart: '2021-01-01T00:00:00.000Z', rowsAffected: 1 } });
  });

  it('excludes, on both readers, a row decided inside a re-created parent\'s deleted interval instead of reading it as created after the decision', async () => {
    const past: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2020-06-01T00:00:00Z'), Period: null }];
    const recreated = { People: [rc('d1', 'P1', 'Delete', '2020-01-01T00:00:00Z', { ID: 'P1', Status: 'Active' }), rc('c2', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const replayed: FeatureColumnSpec = { ...stored, source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' } };
    const policy = { ...unit, history: { ...unit.history, onUncoveredRow: 'exclude-and-count' as const } };
    for (const spec of [stored, replayed]) {
      const out = await new AsOfFeatureAssembler().Assemble(input([spec], { Rows: past, Tables: data, Changes: recreated, Unit: policy }));
      expect(out.Status === 'assembled' ? out.UncoveredRowsExcluded : out, spec.source.kind).toEqual([{ entity: 'People', field: 'Status', rows: 1 }]);
    }
  });
  it('ignores a stored creation date later than an earlier change row: it dates a re-creation, so a row decided before it is excluded, not created after the decision', async () => {
    const withCreatedAt: AssemblyEntityInfo = { ...entities.People, Fields: [...entities.People.Fields, field('__mj_CreatedAt', 'Date')] };
    const early: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2019-06-01T00:00:00Z'), Period: null }];
    const recreated = { People: [rc('d1', 'P1', 'Delete', '2020-07-01T00:00:00Z', { ID: 'P1', Status: 'Active' }), rc('c2', 'P1', 'Create', '2021-07-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const current = { ...data, People: [{ ID: 'P1', Status: 'Lapsed', __mj_CreatedAt: '2021-07-01T00:00:00.000Z' }] };
    const replayed: FeatureColumnSpec = { ...stored, source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' } };
    const out = await new AsOfFeatureAssembler().Assemble({
      ...input([replayed], { Rows: early, Tables: current, Changes: recreated, Unit: { ...unit, history: { ...unit.history, onUncoveredRow: 'exclude-and-count' } } }),
      Metadata: { Entity: (n) => (n === 'People' ? withCreatedAt : metadata.Entity(n)) },
    });
    expect(out.Status === 'assembled' ? out.UncoveredRowsExcluded : out).toEqual([{ entity: 'People', field: 'Status', rows: 1 }]);
  });
  it('excludes, for a field declared not updatable, an assembly-day row whose parent has a current row and a Delete in force', async () => {
    const notUpdatable: AssemblyEntityInfo = { ...entities.People, Fields: entities.People.Fields.map((f) => (f.Name === 'Status' ? { ...f, AllowUpdateAPI: false } : f)) };
    const onAssemblyDay: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2026-10-12T00:00:00Z'), Period: null }];
    const deletedInForce = { People: [rc('u0', 'P1', 'Update', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }, ['Status']), rc('d1', 'P1', 'Delete', '2022-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' })] };
    const out = await new AsOfFeatureAssembler().Assemble({
      ...input([stored], { Rows: onAssemblyDay, Tables: data, Changes: deletedInForce, Unit: { ...unit, history: { ...unit.history, onUncoveredRow: 'exclude-and-count' } } }),
      Metadata: { Entity: (n) => (n === 'People' ? notUpdatable : metadata.Entity(n)) },
    });
    expect(out.Status === 'assembled' ? out.UncoveredRowsExcluded : out).toEqual([{ entity: 'People', field: 'Status', rows: 1 }]);
  });
  it('excludes, under exclude-and-count, a stored read whose history does not reach a past decision day, as the replay reader does, and refuses it under refuse', async () => {
    const past: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2021-06-01T00:00:00Z'), Period: null }];
    const unanchored = { People: [rc('u0', 'P1', 'Update', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }, ['Status'])] };
    const excluded = await new AsOfFeatureAssembler().Assemble(input([stored], { Rows: past, Tables: data, Changes: unanchored, Unit: { ...unit, history: { ...unit.history, onUncoveredRow: 'exclude-and-count' } } }));
    expect(excluded.Status === 'assembled' ? excluded.UncoveredRowsExcluded : excluded).toEqual([{ entity: 'People', field: 'Status', rows: 1 }]);
    const refused = await new AsOfFeatureAssembler().Assemble(input([stored], { Rows: past, Tables: data, Changes: unanchored }));
    expect(refused).toEqual({ Status: 'refused', Refusal: { kind: 'decision-date-before-change-history', entity: 'People', field: 'Status', historyStart: null, rowsAffected: 1 } });
  });

  it('keeps the stored value when a later Snapshot or Create row carries the same value of the field', async () => {
    const out = await new AsOfFeatureAssembler().Assemble(input([stored], { Rows: one, Tables: data, Changes: { People: [
      rc('s0', 'P1', 'Snapshot', '2021-01-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }),
      rc('s1', 'P1', 'Snapshot', '2023-06-01T00:00:00Z', { ID: 'P1', Status: 'Lapsed' }),
    ] } }));
    expect(out.Status === 'assembled' && out.Rows[0].Values).toEqual(['Lapsed']);
  });
});

describe('AsOfFeatureAssembler — child rows are judged at each unit row\'s own decision instant', () => {
  it('makes only the later row uncovered when an external row on a child arrives between the two rows\' decision days', async () => {
    const two: AssemblyRowRef[] = [
      { RowID: 'y1', EntityKey: 'P1', DecisionDate: new Date('2022-01-01T00:00:00Z'), Period: null },
      { RowID: 'y2', EntityKey: 'P1', DecisionDate: new Date('2024-01-01T00:00:00Z'), Period: null },
    ];
    const data: Record<string, SourceRow[]> = { Years: [{ ID: 'y1', PersonID: 'P1' }, { ID: 'y2', PersonID: 'P1' }], Gifts: [{ ID: 'g1', PersonID: 'P1', GivenOn: '2021-06-01', Amount: 10 }] };
    const g1 = { ID: 'g1', PersonID: 'P1', GivenOn: '2021-06-01', Amount: 10 };
    const sum: FeatureColumnSpec = { name: 'Given', source: { kind: 'windowed-aggregate', childEntity: 'Gifts', foreignKey: 'PersonID', ownerKeyField: null, dateField: 'GivenOn', endDateField: null, voidedAtField: null, aggregate: 'sum', valueField: 'Amount', windowDays: null, filter: [] }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } };
    const counting: PredictionUnitSpec = { ...unit, history: { onUncoveredRow: 'exclude-and-count', externalSourceRows: 'ineligible' } };
    const out = await new AsOfFeatureAssembler().Assemble(input([sum], { Rows: two, Tables: data, Unit: counting, Changes: { Gifts: [
      rc('gc', 'g1', 'Create', '2021-06-01T00:00:00Z', g1),
      { ...rc('gx', 'g1', 'Snapshot', '2023-01-01T00:00:00Z', g1), Source: 'External' },
    ] } }));
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows.map((r) => [r.RowID, r.Values[0]])).toEqual([['y1', 10]]);
    expect(out.UncoveredRowsExcluded).toEqual([{ entity: 'Gifts', field: 'PersonID', rows: 1 }]);
  });
});

describe('AsOfFeatureAssembler — a windowed aggregate over hard-deleted child rows', () => {
  const owners: AssemblyRowRef[] = [
    { RowID: 'y1', EntityKey: 'P1', DecisionDate: new Date('2022-12-01T00:00:00Z'), Period: null },
    { RowID: 'y2', EntityKey: 'P1', DecisionDate: new Date('2024-06-01T00:00:00Z'), Period: null },
  ];
  const count: FeatureColumnSpec = { name: 'EventsToDate', source: { kind: 'windowed-aggregate', childEntity: 'Events', foreignKey: 'PersonID', ownerKeyField: null, dateField: 'EventDate', endDateField: null, voidedAtField: null, aggregate: 'count', valueField: null, windowDays: null, filter: [] }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true, constant: null } };
  const e1 = { ID: 'e1', PersonID: 'P1', EventDate: '2021-09-01' };
  const e2 = { ID: 'e2', PersonID: 'P1', EventDate: '2022-03-01' };
  const data: Record<string, SourceRow[]> = { Years: [{ ID: 'y1', PersonID: 'P1' }, { ID: 'y2', PersonID: 'P1' }], Events: [e1] };
  const history = (extra: RecordChangeRow[] = []): Record<string, RecordChangeRow[]> => ({
    Events: [
      rc('ec-1', 'e1', 'Create', '2021-09-01T00:00:00Z', e1),
      // e2 existed from March 2022 and was hard-deleted in March 2023: it has no current row.
      rc('ec-2', 'e2', 'Create', '2022-03-01T00:00:00Z', e2),
      rc('ed-2', 'e2', 'Delete', '2023-03-01T00:00:00Z', e2),
      ...extra,
    ],
  });
  const sha = (text: string): string => createHash('sha256').update(text).digest('hex');

  for (const onUncoveredRow of ['refuse', 'exclude-and-count'] as const) {
    it(`counts a child hard-deleted after the owner's decision day as it stood, and leaves it out after its Delete (${onUncoveredRow})`, async () => {
      const policy: PredictionUnitSpec = { ...unit, history: { onUncoveredRow, externalSourceRows: 'ineligible' } };
      const out = await new AsOfFeatureAssembler().Assemble(input([count], { Rows: owners, Tables: data, Changes: history(), Unit: policy }));
      expect(out.Status).toBe('assembled');
      if (out.Status !== 'assembled') return;
      expect(out.Rows.map((r) => [r.RowID, r.Values[0]])).toEqual([['y1', 2], ['y2', 1]]);
      expect(out.UncoveredRowsExcluded).toEqual([]);
      expect(out.Rows[0].Provenance[0]).toMatchObject({ sourceRef: 'Events?PersonID=p1&as-of=2022-12-01&aggregate=count', sourceVersion: sha('e1\ne2') });
      expect(out.ColumnProvenance[0]).toMatchObject({ lateEnteredDropped: 0 });
      expect(out.Coverage.filter((c) => c.entity === 'Events' && c.field === 'PersonID')).toEqual([
        expect.objectContaining({ historyStart: '2022-03-01T00:00:00.000Z', continuity: expect.objectContaining({ recordsReplayed: 2, recordsMismatched: 0 }) }),
      ]);
    });
  }
  it('loads only hard-deleted children that an owner of the batch held, so another owner\'s deleted child changes nothing', async () => {
    const other = { ID: 'e9', PersonID: 'P9', EventDate: '2020-01-01' };
    const base = await new AsOfFeatureAssembler().Assemble(input([count], { Rows: owners, Tables: data, Changes: history() }));
    const withOther = await new AsOfFeatureAssembler().Assemble(input([count], { Rows: owners, Tables: data, Changes: history([
      rc('ec-9', 'e9', 'Create', '2019-01-01T00:00:00Z', other), rc('ed-9', 'e9', 'Delete', '2023-01-01T00:00:00Z', { ...other, EventDate: '2020-02-02' }),
    ]) }));
    expect(JSON.stringify(withOther)).toBe(JSON.stringify(base));
  });
  it('judges a hard-deleted child re-owned away from the batch\'s owner after the decision day, as a present child is judged', async () => {
    // Gifts declares its owner key updatable: g2 belonged to P1 on y1's decision day, moved to P9, then was hard-deleted.
    const gifts: FeatureColumnSpec = { ...count, name: 'Given', source: { ...count.source, childEntity: 'Gifts', dateField: 'GivenOn' } as FeatureColumnSpec['source'] };
    const g1 = { ID: 'g1', PersonID: 'P1', GivenOn: '2021-09-01', Amount: 10 };
    const g2 = { ID: 'g2', PersonID: 'P1', GivenOn: '2022-03-01', Amount: 20 };
    const out = await new AsOfFeatureAssembler().Assemble(input([gifts], { Rows: owners, Tables: { ...data, Gifts: [g1] }, Changes: { Gifts: [
      rc('gc-1', 'g1', 'Create', '2021-09-01T00:00:00Z', g1),
      rc('gc-2', 'g2', 'Create', '2022-03-01T00:00:00Z', g2),
      rc('gu-2', 'g2', 'Update', '2023-01-01T00:00:00Z', { ...g2, PersonID: 'P9' }, ['PersonID']),
      rc('gd-2', 'g2', 'Delete', '2023-03-01T00:00:00Z', { ...g2, PersonID: 'P9' }),
    ] } }));
    expect(out).toEqual({ Status: 'refused', Refusal: { kind: 'select-changes-after-decision-date', entity: 'Gifts', field: 'PersonID', changesAfter: 1 } });
  });
});

describe('AsOfFeatureAssembler — an invalid timestamp in a record\'s history', () => {
  it('returns the typed refusal instead of throwing', async () => {
    const one: AssemblyRowRef[] = [{ RowID: 'y1', EntityKey: 'y1', DecisionDate: new Date('2022-12-01T00:00:00Z'), Period: null }];
    const bad = '2025-99-99T00:00';
    const replayed: FeatureColumnSpec = { name: 'Status', source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } };
    const out = await new AsOfFeatureAssembler().Assemble(input([replayed], { Rows: one, Tables: { Years: [{ ID: 'y1', PersonID: 'P1' }], People: [{ ID: 'P1', Status: bad }] }, Changes: { People: [
      rc('c0', 'P1', 'Create', '2021-01-01T00:00:00Z', { ID: 'P1', Status: bad }),
    ] } }));
    expect(out).toEqual({ Status: 'refused', Refusal: { kind: 'invalid-date-in-history', entity: 'People', field: 'Status', value: bad } });
  });
});

describe('replay reader — creation rule', () => {
  const tier: FeatureColumnSpec = { name: 'Tier', source: { kind: 'record-changes', entity: 'Tiers', field: 'Tier', keyField: null }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } };
  const lateRow: AssemblyRowRef[] = [{ RowID: 'y2', EntityKey: 'y2', DecisionDate: new Date('2023-12-01T00:00:00Z'), Period: null }];
  const tiersWith = (createdAt: Date | null): Record<string, SourceRow[]> => ({ ...tables, Tiers: [{ ID: 'y2', Tier: 'Silver', ...(createdAt ? { __mj_CreatedAt: createdAt } : {}) }] });
  const snapshotStart: Record<string, RecordChangeRow[]> = { ...changes, Tiers: [rc('ts-2', 'y2', 'Snapshot', '2024-02-01T00:00:00Z', { ID: 'y2', Tier: 'Silver' })] };
  const createStart: Record<string, RecordChangeRow[]> = { ...changes, Tiers: [rc('tc-2', 'y2', 'Create', '2022-01-01T00:00:00Z', { ID: 'y2', Tier: 'Silver' })] };

  /** Records every field list the assembly reads by key, so a test sees which reads were issued. */
  class SpyDataAccess extends TableDataAccess {
    public readonly FieldReads: (readonly string[] | undefined)[] = [];
    public override async fetchRows(p: Parameters<TableDataAccess['fetchRows']>[0]): ReturnType<TableDataAccess['fetchRows']> {
      if (p.EntityName === 'Tiers') this.FieldReads.push(p.Fields);
      return super.fetchRows(p);
    }
    public get CreatedAtReads(): number { return this.FieldReads.filter((f) => f?.includes('__mj_CreatedAt')).length; }
  }
  const assemble = (data: Record<string, SourceRow[]>, rowChanges: Record<string, RecordChangeRow[]>, tiers: AssemblyEntityInfo = entities.Tiers) => {
    const spy = new SpyDataAccess({ ...data, 'MJ: Record Changes': recordChangeRows(rowChanges) });
    const base = input([tier], { Tables: data, Changes: rowChanges, Rows: lateRow });
    const withTiers: IAssemblyMetadata = { Entity: (n) => (n === 'Tiers' ? tiers : metadata.Entity(n)) };
    return new AsOfFeatureAssembler().Assemble({ ...base, DataAccess: spy, History: new RunViewRecordHistoryReader(spy, { mode: 'complete' }), Metadata: withTiers }).then((out) => ({ out, spy }));
  };

  it('reads a record whose history starts with a Snapshot as missing when its __mj_CreatedAt is after the decision', async () => {
    const { out } = await assemble(tiersWith(new Date('2024-01-01T00:00:00Z')), snapshotStart);
    expect(out.Status).toBe('assembled');
    if (out.Status !== 'assembled') return;
    expect(out.Rows[0].Values[0]).toBeNull();
    expect(out.Rows[0].Provenance[0]).toMatchObject({ sourceRef: 'Tiers/y2/Tier', sourceVersion: 'created-after-decision' });
  });
  it('stays uncovered when the record was created before the decision, so the refusal is unchanged', async () => {
    const { out } = await assemble(tiersWith(new Date('2023-01-01T00:00:00Z')), snapshotStart);
    expect(out).toMatchObject({ Status: 'refused', Refusal: { kind: 'decision-date-before-change-history', entity: 'Tiers', field: 'Tier' } });
  });
  it('stays uncovered and issues no __mj_CreatedAt read for an entity without the column', async () => {
    const noColumn: AssemblyEntityInfo = { ...entities.Tiers, Fields: entities.Tiers.Fields.filter((f) => f.Name !== '__mj_CreatedAt') };
    const { out, spy } = await assemble(tiersWith(null), snapshotStart, noColumn);
    expect(out).toMatchObject({ Status: 'refused', Refusal: { kind: 'decision-date-before-change-history' } });
    expect(spy.CreatedAtReads).toBe(0);
  });
  it('issues no __mj_CreatedAt read for a history that starts with a Create row', async () => {
    const { out, spy } = await assemble(tiersWith(new Date('2022-01-01T00:00:00Z')), createStart);
    expect(out.Status).toBe('assembled');
    expect(spy.CreatedAtReads).toBe(0);
  });
  it('stays uncovered when the record lists __mj_CreatedAt but stores null there: no creation instant is invented', async () => {
    const storedNull: Record<string, SourceRow[]> = { ...tables, Tiers: [{ ID: 'y2', Tier: 'Silver', __mj_CreatedAt: null }] };
    const { out, spy } = await assemble(storedNull, snapshotStart);
    expect(out).toMatchObject({ Status: 'refused', Refusal: { kind: 'decision-date-before-change-history', entity: 'Tiers', field: 'Tier' } });
    expect(spy.CreatedAtReads).toBe(1);
  });

  it('reads the __mj_CreatedAt of a hard-deleted record from its Delete row, so one created after the decision reads as missing', async () => {
    const deleted: Record<string, RecordChangeRow[]> = { ...changes, Tiers: [
      rc('ts-2', 'y2', 'Snapshot', '2024-02-01T00:00:00Z', { ID: 'y2', Tier: 'Silver', __mj_CreatedAt: '2024-01-01T00:00:00.000Z' }),
      rc('td-2', 'y2', 'Delete', '2025-01-01T00:00:00Z', { ID: 'y2', Tier: 'Silver', __mj_CreatedAt: '2024-01-01T00:00:00.000Z' }),
    ] };
    const { out } = await assemble({ ...tables, Tiers: [] }, deleted);
    expect(out.Status === 'assembled' ? out.Rows[0].Provenance[0] : out).toMatchObject({ sourceRef: 'Tiers/y2/Tier', sourceVersion: 'created-after-decision' });
  });

  /** A store whose key collation is case-sensitive: an `IN` list matches a key only in its stored spelling. */
  class CaseSensitiveDataAccess extends SpyDataAccess {
    public override async fetchRows(p: Parameters<TableDataAccess['fetchRows']>[0]): ReturnType<TableDataAccess['fetchRows']> {
      const res = await super.fetchRows(p);
      const list = p.EntityName === 'Tiers' && p.ExtraFilter ? /^\[ID\] IN \((.*)\)$/.exec(p.ExtraFilter) : null;
      if (list === null || !res.Success) return res;
      const spellings = new Set([...list[1].matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]));
      return { ...res, Rows: res.Rows.filter((r) => spellings.has(String(r.ID))) };
    }
  }

  it('reads __mj_CreatedAt by the key as stored, so a mixed-case key is found on a case-sensitive collation', async () => {
    const mixedRow: AssemblyRowRef[] = [{ RowID: 'Y2', EntityKey: 'Y2', DecisionDate: new Date('2023-12-01T00:00:00Z'), Period: null }];
    const data: Record<string, SourceRow[]> = { ...tables, Tiers: [{ ID: 'Y2', Tier: 'Silver', __mj_CreatedAt: new Date('2024-01-01T00:00:00Z') }] };
    const history: Record<string, RecordChangeRow[]> = { ...changes, Tiers: [rc('ts-2', 'Y2', 'Snapshot', '2024-02-01T00:00:00Z', { ID: 'Y2', Tier: 'Silver' })] };
    const spy = new CaseSensitiveDataAccess({ ...data, 'MJ: Record Changes': recordChangeRows(history) });
    const base = input([tier], { Tables: data, Changes: history, Rows: mixedRow });
    const withTiers: IAssemblyMetadata = { Entity: (n) => (n === 'Tiers' ? entities.Tiers : metadata.Entity(n)) };
    const out = await new AsOfFeatureAssembler().Assemble({ ...base, DataAccess: spy, History: new RunViewRecordHistoryReader(spy, { mode: 'complete' }), Metadata: withTiers });
    expect(out.Status === 'refused' ? out.Refusal : null).toBeNull();
    if (out.Status !== 'assembled') return;
    expect(out.Rows[0].Provenance[0]).toMatchObject({ sourceRef: 'Tiers/y2/Tier', sourceVersion: 'created-after-decision' });
  });
});
