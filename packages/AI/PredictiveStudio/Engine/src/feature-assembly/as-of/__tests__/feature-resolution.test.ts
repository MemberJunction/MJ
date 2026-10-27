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

describe('ResolveFeatureColumns — forecast units', () => {
  const t3: AssemblyEntityInfo = { ID: 'E-T', Name: 'T3', PrimaryKey: 'ID', TrackRecordChanges: true, Fields: [f('ID', 'string', false, 'uniqueidentifier'), f('T', 'Date'), f('LagTarget', 'number'), f('SamePeriodTarget', 'number'), f('Target', 'number')] };
  const md: IAssemblyMetadata = { Entity: (n) => (n === 'T3' ? t3 : null) };
  it('refuses a same-period column by name and accepts a column declared one period back', () => {
    const refused = FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 's', Kind: 'select', Columns: ['SamePeriodTarget'] }] }, forecastUnit, t3, md, { denyFields: [], denySources: [] });
    expect(refused).toEqual({ Status: 'refused', Refusal: { kind: 'future-period-lag', column: 'SamePeriodTarget', lag: 0, horizonPeriods: 1 } });
    const accepted = FeatureResolver.ResolveFeatureColumns({ Steps: [{ Id: 's', Kind: 'select', Columns: ['LagTarget'], PeriodOffsets: { LagTarget: 1 } }] }, forecastUnit, t3, md, { denyFields: [], denySources: [] });
    expect(accepted.Status).toBe('resolved');
  });
});
