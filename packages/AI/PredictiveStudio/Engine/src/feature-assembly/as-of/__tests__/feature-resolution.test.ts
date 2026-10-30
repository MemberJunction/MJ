import { describe, it, expect } from 'vitest';
import type { FeatureStepGraph, PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { FeatureResolver } from '../feature-resolution';
import type { AssemblyEntityInfo, IAssemblyMetadata } from '../../assembly-metadata';

const f = (Name: string, TSType: 'string' | 'number' | 'Date' | 'boolean', AllowUpdateAPI = false, SqlType = 'nvarchar', RelatedEntity: string | null = null) =>
  ({ Name, SqlType, TSType, AllowUpdateAPI, IsPrimaryKey: Name === 'ID', RelatedEntity, IsVirtual: false });
const years: AssemblyEntityInfo = { ID: 'E-Y', Name: 'Years', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [
  f('ID', 'string', false, 'uniqueidentifier'), f('PersonID', 'string', false, 'uniqueidentifier', 'People'), f('StartDate', 'Date'),
  f('EventsAttended', 'number'), f('Region', 'string'), f('AutoRenew', 'boolean'), f('PersonStatusNow', 'string', true),
] };
const people: AssemblyEntityInfo = { ID: 'E-P', Name: 'People', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [f('ID', 'string', false, 'uniqueidentifier'), f('Status', 'string', true)] };
const metadata: IAssemblyMetadata = { Entity: (n) => ({ Years: years, People: people }[n] ?? null) };
const unitSpec: PredictionUnitSpec = {
  id: 'U', lineageRootId: 'U', version: 1, name: 'world renewal',
  rows: { kind: 'grain', grainEntity: 'Years', decisionDate: { kind: 'column-offset', column: 'StartDate', offsetDays: 334 }, filter: [] },
  label: { rule: { kind: 'column', column: 'Renewed' }, windowDays: 31, gapDays: 0, outcome: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2027-02-01' } },
  history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' },
  groupKey: null, temporal: null,
  decision: { action: 'a', actorRole: 'r', capacityPerPeriod: null, period: 'year' },
  incumbent: { kind: 'none' }, authoredBy: { kind: 'human', userId: 'U' },
};
const forecastUnit: PredictionUnitSpec = {
  ...unitSpec,
  rows: { kind: 'grain', grainEntity: 'T3', decisionDate: { kind: 'column', column: 'T' }, filter: [] },
  label: { ...unitSpec.label, rule: { kind: 'column', column: 'Target' }, windowDays: 28, outcome: { kind: 'forecast', valueKind: 'continuous' } },
  temporal: { timeColumn: 'T', horizonPeriods: 1, lags: [1, 12], rollingWindows: [], period: 'month', seasonality: 12 },
};

describe('ResolveFeatureColumns', () => {
  it('types each select column from its field and picks the dated source from AllowUpdateAPI', () => {
    const steps: FeatureStepGraph = { Steps: [
      { Id: 's', Kind: 'select', Columns: ['EventsAttended', 'Region', 'AutoRenew', 'StartDate', 'PersonID', 'PersonStatusNow'] },
      { Id: 'p', Kind: 'select', Entity: 'People', KeyField: 'PersonID', Columns: ['Status'] },
    ] };
    const r = FeatureResolver.ResolveFeatureColumns(steps, unitSpec, years, metadata, { denyFields: [], denySources: [] });
    expect(r.Status).toBe('resolved');
    if (r.Status !== 'resolved') return;
    const byName = new Map(r.Columns.map((c) => [c.name, c]));
    expect(byName.get('EventsAttended')).toMatchObject({ source: { kind: 'immutable-field', entity: 'Years', field: 'EventsAttended', keyField: null }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing: { impute: 'median', indicator: true } });
    expect(byName.get('Region')?.encoding).toEqual({ kind: 'categorical', cardinalityCap: 50, method: 'onehot' });
    expect(byName.get('AutoRenew')?.encoding).toEqual({ kind: 'boolean' });
    expect(byName.get('StartDate')?.encoding).toEqual({ kind: 'date-parts', parts: ['days-since-decision'] });
    expect(byName.get('PersonID')?.encoding).toEqual({ kind: 'categorical', cardinalityCap: 50, method: 'onehot' });
    expect(byName.get('PersonStatusNow')?.source).toEqual({ kind: 'record-changes', entity: 'Years', field: 'PersonStatusNow', keyField: null });
    expect(byName.get('Status')?.source).toEqual({ kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' });
  });
  it('lets a declared encoding override the field type (a text column bound as numeric is then refused at assembly)', () => {
    const r = FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 's', Kind: 'select', Columns: ['Region'], Encodings: { Region: 'numeric' } }] }, unitSpec, years, metadata, { denyFields: [], denySources: [] });
    expect(r.Status === 'resolved' && r.Columns[0].encoding).toEqual({ kind: 'numeric', nonNumericValue: 'fail' });
  });
  it('refuses a preprocessing step on a column no feature produces and an unknown column', () => {
    expect(FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 'i', Kind: 'impute', Column: 'TenureDays', Strategy: 'mean' }] }, unitSpec, years, metadata, { denyFields: [], denySources: [] }))
      .toEqual({ Status: 'refused', Refusal: { kind: 'unresolved-column', entity: 'Years', field: 'TenureDays' } });
    expect(FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 's', Kind: 'select', Columns: ['Nope'] }] }, unitSpec, years, metadata, { denyFields: [], denySources: [] }))
      .toEqual({ Status: 'refused', Refusal: { kind: 'unresolved-column', entity: 'Years', field: 'Nope' } });
  });
  it('refuses a constant fill on a numeric column unless the fill is a finite number, naming the column', () => {
    const resolve = (FillValue: string | number | undefined) => FeatureResolver.ResolveFeatureColumns({ Steps: [
      { Id: 's', Kind: 'select', Columns: ['EventsAttended'] },
      { Id: 'i', Kind: 'impute', Column: 'EventsAttended', Strategy: 'constant', FillValue },
    ] }, unitSpec, years, metadata, { denyFields: [], denySources: [] });
    expect(resolve(undefined)).toEqual({ Status: 'refused', Refusal: { kind: 'non-numeric-in-numeric-column', column: 'EventsAttended', sampleValue: '' } });
    expect(resolve('n/a')).toEqual({ Status: 'refused', Refusal: { kind: 'non-numeric-in-numeric-column', column: 'EventsAttended', sampleValue: 'n/a' } });
    expect(resolve(Number.NaN)).toEqual({ Status: 'refused', Refusal: { kind: 'non-numeric-in-numeric-column', column: 'EventsAttended', sampleValue: 'NaN' } });
    const ok = resolve(0);
    expect(ok.Status === 'resolved' && ok.Columns[0].missing).toEqual({ impute: 'constant', indicator: true, constant: 0 });
  });
  it('refuses a standardize, one-hot or bin step on a column no feature produces', () => {
    const refusedFor = (step: FeatureStepGraph['Steps'][number]) => FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 's', Kind: 'select', Columns: ['EventsAttended'] }, step] }, unitSpec, years, metadata, { denyFields: [], denySources: [] });
    const refusal = { Status: 'refused', Refusal: { kind: 'unresolved-column', entity: 'Years', field: 'TenureDays' } };
    expect(refusedFor({ Id: 'z', Kind: 'standardize', Columns: ['EventsAttended', 'TenureDays'] })).toEqual(refusal);
    expect(refusedFor({ Id: 'o', Kind: 'onehot', Column: 'TenureDays' })).toEqual(refusal);
    expect(refusedFor({ Id: 'b', Kind: 'bin', Column: 'TenureDays', Bins: 10 })).toEqual(refusal);
  });
  it('refuses llm-derived features without a version pin and steps with no as-of semantics', () => {
    expect(FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 'l', Kind: 'llm-derived', FeaturePipelineRef: 'fp', Columns: ['Sentiment'] }] }, unitSpec, years, metadata, { denyFields: [], denySources: [] }))
      .toEqual({ Status: 'refused', Refusal: { kind: 'unpinned-feature-version', featureName: 'Sentiment' } });
    expect(FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 'e', Kind: 'embedding', Entity: 'Years', EmbeddingModelRef: 'm', Dims: 4 }] }, unitSpec, years, metadata, { denyFields: [], denySources: [] }))
      .toEqual({ Status: 'refused', Refusal: { kind: 'unsupported-step-kind', stepId: 'e', stepKind: 'embedding' } });
  });
  it('drops deny-listed fields before they become columns', () => {
    const r = FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 's', Kind: 'select', Columns: ['EventsAttended', 'PersonStatusNow'] }] }, unitSpec, years, metadata, { denyFields: ['PersonStatusNow'], denySources: [] });
    expect(r.Status === 'resolved' && r.Columns.map((c) => c.name)).toEqual(['EventsAttended']);
  });
});

describe('ResolveFeatureColumns — deny lists and windowed aggregates', () => {
  const orders: AssemblyEntityInfo = { ID: 'E-O', Name: 'Orders', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [
    f('ID', 'string', false, 'uniqueidentifier'), f('PersonID', 'string', false, 'uniqueidentifier', 'People'), f('OrderDate', 'Date'), f('Amount', 'number'),
  ] };
  const md: IAssemblyMetadata = { Entity: (n) => ({ Years: years, People: people, Orders: orders }[n] ?? null) };
  const spend: FeatureStepGraph['Steps'][number] = {
    Id: 'w', Kind: 'windowed-aggregate', FeatureName: 'SpendLastYear', ChildEntity: 'Orders', ForeignKey: 'PersonID', OwnerKeyField: 'PersonID',
    DateField: 'OrderDate', Aggregate: 'sum', ValueField: 'Amount', WindowDays: 365,
  };
  it('drops a preprocessing step on a deny-listed column instead of refusing the pipeline', () => {
    const r = FeatureResolver.ResolveFeatureColumns({ Steps: [
      { Id: 's', Kind: 'select', Columns: ['EventsAttended', 'Region'] },
      { Id: 'i', Kind: 'impute', Column: 'EventsAttended', Strategy: 'mean' },
      { Id: 'z', Kind: 'standardize', Columns: ['EventsAttended'] },
      { Id: 'o', Kind: 'onehot', Column: 'EventsAttended' },
      { Id: 'b', Kind: 'bin', Column: 'EventsAttended', Bins: 4 },
    ] }, unitSpec, years, md, { denyFields: [' eventsattended '], denySources: [] });
    expect(r.Status).toBe('resolved');
    if (r.Status !== 'resolved') return;
    expect(r.Columns.map((c) => c.name)).toEqual(['Region']);
    expect(r.ExplicitOps).toEqual([]);
  });
  it('maps a windowed aggregate onto a numeric column spec', () => {
    const r = FeatureResolver.ResolveFeatureColumns({ Steps: [spend] }, unitSpec, years, md, { denyFields: [], denySources: [] });
    expect(r).toEqual({ Status: 'resolved', ExplicitOps: [], Columns: [{
      name: 'SpendLastYear',
      source: { kind: 'windowed-aggregate', childEntity: 'Orders', foreignKey: 'PersonID', ownerKeyField: 'PersonID', dateField: 'OrderDate', endDateField: null, voidedAtField: null, aggregate: 'sum', valueField: 'Amount', windowDays: 365, filter: [] },
      encoding: { kind: 'numeric', nonNumericValue: 'fail' },
      missing: { impute: 'median', indicator: true, constant: null },
    }] });
  });
  it('skips a windowed aggregate over a deny-listed child entity or with a deny-listed feature name', () => {
    const bySource = FeatureResolver.ResolveFeatureColumns({ Steps: [spend] }, unitSpec, years, md, { denyFields: [], denySources: ['orders'] });
    expect(bySource).toEqual({ Status: 'resolved', Columns: [], ExplicitOps: [] });
    const byName = FeatureResolver.ResolveFeatureColumns({ Steps: [spend] }, unitSpec, years, md, { denyFields: ['SpendLastYear'], denySources: [] });
    expect(byName).toEqual({ Status: 'resolved', Columns: [], ExplicitOps: [] });
  });
  it('refuses a windowed aggregate whose owner key field is not on the unit row', () => {
    const r = FeatureResolver.ResolveFeatureColumns({ Steps: [{ ...spend, OwnerKeyField: 'MemberID' }] }, unitSpec, years, md, { denyFields: [], denySources: [] });
    expect(r).toEqual({ Status: 'refused', Refusal: { kind: 'unresolved-column', entity: 'Years', field: 'MemberID' } });
  });
  it('refuses a distinct, sum or mean aggregate that names no value field', () => {
    for (const aggregate of ['distinct', 'sum', 'mean'] as const) {
      const r = FeatureResolver.ResolveFeatureColumns({ Steps: [{ ...spend, Aggregate: aggregate, ValueField: undefined }] }, unitSpec, years, md, { denyFields: [], denySources: [] });
      expect(r).toEqual({ Status: 'refused', Refusal: { kind: 'unresolved-column', entity: 'Orders', field: 'valueField' } });
    }
  });
});

describe('ResolveFeatureColumns — forecast units', () => {
  const t3: AssemblyEntityInfo = { ID: 'E-T', Name: 'T3', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [f('ID', 'string', false, 'uniqueidentifier'), f('T', 'Date'), f('LagTarget', 'number'), f('SamePeriodTarget', 'number'), f('Target', 'number')] };
  const md: IAssemblyMetadata = { Entity: (n) => (n === 'T3' ? t3 : null) };
  it('refuses a same-period column by name and accepts a column declared one period back', () => {
    const refused = FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 's', Kind: 'select', Columns: ['SamePeriodTarget'] }] }, forecastUnit, t3, md, { denyFields: [], denySources: [] });
    expect(refused).toEqual({ Status: 'refused', Refusal: { kind: 'future-period-lag', column: 'SamePeriodTarget', lag: 0, horizonPeriods: 1 } });
    const accepted = FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 's', Kind: 'select', Columns: ['LagTarget'], PeriodOffsets: { LagTarget: 1 } }] }, forecastUnit, t3, md, { denyFields: [], denySources: [] });
    expect(accepted.Status).toBe('resolved');
  });
  it('refuses a column declared fewer periods back than the horizon', () => {
    const horizonTwo: PredictionUnitSpec = { ...forecastUnit, temporal: { timeColumn: 'T', horizonPeriods: 2, lags: [2, 12], rollingWindows: [], period: 'month', seasonality: 12 } };
    const r = FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 's', Kind: 'select', Columns: ['LagTarget'], PeriodOffsets: { LagTarget: 1 } }] }, horizonTwo, t3, md, { denyFields: [], denySources: [] });
    expect(r).toEqual({ Status: 'refused', Refusal: { kind: 'future-period-lag', column: 'LagTarget', lag: 1, horizonPeriods: 2 } });
  });
  it('refuses a series step whose index is outside the Temporal Spec', () => {
    const r = FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 'l', Kind: 'series', FeatureName: 'Lag5', Feature: { kind: 'lag', index: 5 } }] }, forecastUnit, t3, md, { denyFields: [], denySources: [] });
    expect(r).toEqual({ Status: 'refused', Refusal: { kind: 'unresolved-column', entity: 'T3', field: 'TemporalSpec.lag[5]' } });
  });
});
