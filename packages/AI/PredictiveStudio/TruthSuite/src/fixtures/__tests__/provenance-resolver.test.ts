import { describe, it, expect } from 'vitest';
import type { EntityFieldTSType } from '@memberjunction/core';
import type { FeatureColumnSpec, ValueProvenance, WindowedAggregateSource } from '@memberjunction/predictive-studio-core';
import {
  AsOfFeatureAssembler, WindowedAggregates,
  type AssemblyEntityInfo, type FetchRowsParams, type FetchRowsResult, type IAssemblyMetadata, type IFeatureDataAccess, type SourceRow,
} from '@memberjunction/predictive-studio';
import { ProvenanceResolver, type ProvenanceSources, type ScoredRowBinding } from '../provenance-resolver';

const PERSON = 'PS Test: Person';
const YEAR = 'PS Test: Year';
const EVENT = 'PS Test: Event';
const PERSON_ENTITY_ID = '11111111-1111-1111-1111-111111111111';
const EVENT_ENTITY_ID = '22222222-2222-2222-2222-222222222222';

/** Rows by entity name; filters are ignored (the resolver re-checks what it reads). */
class InMemoryDataAccess implements IFeatureDataAccess {
  constructor(private readonly rows: ReadonlyMap<string, readonly SourceRow[]>) {}
  public async fetchRows(params: FetchRowsParams): Promise<FetchRowsResult> {
    const rows = [...(this.rows.get(params.EntityName) || [])];
    return { Success: true, Rows: rows, TotalRowCount: rows.length };
  }
  public async fetchEmbedding(): Promise<number[] | null> {
    return null;
  }
}

class InMemoryMetadata implements IAssemblyMetadata {
  constructor(private readonly entities: readonly AssemblyEntityInfo[]) {}
  public Entity(name: string): AssemblyEntityInfo | null {
    return this.entities.find((e) => e.Name === name) || null;
  }
}

const field = (name: string, tsType: EntityFieldTSType = 'string') => ({ Name: name, SqlType: 'nvarchar', TSType: tsType, AllowUpdateAPI: false, IsPrimaryKey: name === 'ID', RelatedEntity: null, IsVirtual: false });
const entity = (id: string, name: string, tracked: boolean, fields: readonly string[]): AssemblyEntityInfo =>
  ({ ID: id, Name: name, PrimaryKey: 'ID', TrackRecordChanges: tracked, Fields: fields.map((f) => field(f)) });
const change = (id: string, entityId: string, recordKey: string, type: string, at: string, record: Record<string, string | number>): SourceRow =>
  ({ ID: id, EntityID: entityId, RecordID: `ID|${recordKey}`, Type: type, Status: 'Complete', ChangedAt: new Date(at), FullRecordJSON: JSON.stringify(record) });
const sources = (entities: readonly AssemblyEntityInfo[], rows: Record<string, readonly SourceRow[]>): ProvenanceSources =>
  ({ DataAccess: new InMemoryDataAccess(new Map(Object.entries(rows))), Metadata: new InMemoryMetadata(entities) });
const yearRow = (decision: string, personId = 'p1'): ScoredRowBinding => ({ Entity: YEAR, RowId: 'y1', DecisionDate: new Date(decision), Fields: { ID: 'y1', PersonID: personId } });
const missing = { impute: 'mode', indicator: true, constant: null } as const;

describe('ProvenanceResolver — record-changes', () => {
  const spec: FeatureColumnSpec = { name: 'Status', source: { kind: 'record-changes', entity: PERSON, field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 10, method: 'onehot' }, missing };
  const person = entity(PERSON_ENTITY_ID, PERSON, true, ['ID', 'Status']);
  const changes = [
    change('c1', PERSON_ENTITY_ID, 'p1', 'Create', '2025-01-01T00:00:00.000Z', { ID: 'p1', Status: 'Active' }),
    change('c2', PERSON_ENTITY_ID, 'p1', 'Update', '2025-09-01T00:00:00.000Z', { ID: 'p1', Status: 'Lapsed' }),
  ];
  const src = sources([person], { 'MJ: Record Changes': changes });
  const named = (id: string, at: string): ValueProvenance => ({ column: 'Status', source: 'record-changes', sourceRef: `${PERSON}/p1/Status`, sourceVersion: id, computedAt: at });

  it('resolves the change in effect at the decision day when the value matches it', async () => {
    expect(await ProvenanceResolver.ResolveValueProvenance(src, { Provenance: named('c1', '2025-01-01T00:00:00.000Z'), Cells: ['Active'], Spec: spec, Folded: [], Row: yearRow('2025-06-01T00:00:00.000Z') })).toBe(true);
  });

  it('does not resolve a change made after the decision day, even when the value matches it', async () => {
    expect(await ProvenanceResolver.ResolveValueProvenance(src, { Provenance: named('c2', '2025-09-01T00:00:00.000Z'), Cells: ['Lapsed'], Spec: spec, Folded: [], Row: yearRow('2025-06-01T00:00:00.000Z') })).toBe(false);
  });

  it('does not resolve an earlier change once a later one is in effect at the decision day', async () => {
    expect(await ProvenanceResolver.ResolveValueProvenance(src, { Provenance: named('c1', '2025-01-01T00:00:00.000Z'), Cells: ['Active'], Spec: spec, Folded: [], Row: yearRow('2025-10-01T00:00:00.000Z') })).toBe(false);
  });

  it('does not resolve a reference to another record than the one the row joins to', async () => {
    expect(await ProvenanceResolver.ResolveValueProvenance(src, { Provenance: named('c1', '2025-01-01T00:00:00.000Z'), Cells: ['Active'], Spec: spec, Folded: [], Row: yearRow('2025-06-01T00:00:00.000Z', 'p2') })).toBe(false);
  });
});

describe('ProvenanceResolver — immutable-field created:<instant>', () => {
  const spec: FeatureColumnSpec = { name: 'JoinYear', source: { kind: 'immutable-field', entity: PERSON, field: 'JoinYear', keyField: 'PersonID' }, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing };
  const person = entity(PERSON_ENTITY_ID, PERSON, false, ['ID', 'JoinYear', '__mj_CreatedAt']);
  const created = '2024-03-01T10:00:00.000Z';
  const src = sources([person], { [PERSON]: [{ ID: 'p1', JoinYear: 2024, __mj_CreatedAt: created }] });
  const p = (version: string, at: string): ValueProvenance => ({ column: 'JoinYear', source: 'immutable-field', sourceRef: `${PERSON}/p1/JoinYear`, sourceVersion: version, computedAt: at });

  it('resolves when the version and computed-at equal the record\'s __mj_CreatedAt', async () => {
    expect(await ProvenanceResolver.ResolveValueProvenance(src, { Provenance: p(`created:${created}`, created), Cells: [2024], Spec: spec, Folded: [], Row: yearRow('2025-06-01T00:00:00.000Z') })).toBe(true);
  });

  it('does not resolve when the version names another creation instant', async () => {
    const other = '2024-03-02T10:00:00.000Z';
    expect(await ProvenanceResolver.ResolveValueProvenance(src, { Provenance: p(`created:${other}`, other), Cells: [2024], Spec: spec, Folded: [], Row: yearRow('2025-06-01T00:00:00.000Z') })).toBe(false);
  });

  it('does not resolve when the cell differs from the stored value', async () => {
    expect(await ProvenanceResolver.ResolveValueProvenance(src, { Provenance: p(`created:${created}`, created), Cells: [2025], Spec: spec, Folded: [], Row: yearRow('2025-06-01T00:00:00.000Z') })).toBe(false);
  });
});

describe('ProvenanceResolver — windowed aggregate over a tracked child', () => {
  const source: WindowedAggregateSource = { kind: 'windowed-aggregate', childEntity: EVENT, foreignKey: 'PersonID', ownerKeyField: 'PersonID', dateField: 'EventDate', endDateField: null, voidedAtField: null, aggregate: 'sum', valueField: 'Points', windowDays: 365, filter: [] };
  const spec: FeatureColumnSpec = { name: 'points_y', source, encoding: { kind: 'numeric', nonNumericValue: 'fail' }, missing };
  const event = entity(EVENT_ENTITY_ID, EVENT, true, ['ID', 'PersonID', 'EventDate', 'Points', '__mj_CreatedAt']);
  const e1: SourceRow = { ID: 'e1', PersonID: 'p1', EventDate: '2025-03-01', Points: 3, __mj_CreatedAt: '2025-03-01T00:00:00.000Z' };
  // Stored as created before the decision day, but its Create row is after it: the later of the two decides.
  const e2: SourceRow = { ID: 'e2', PersonID: 'p1', EventDate: '2025-05-01', Points: 5, __mj_CreatedAt: '2025-05-01T00:00:00.000Z' };
  const changes = [
    change('c1', EVENT_ENTITY_ID, 'e1', 'Create', '2025-03-01T00:00:00.000Z', { ID: 'e1' }),
    change('c2', EVENT_ENTITY_ID, 'e2', 'Create', '2025-07-01T00:00:00.000Z', { ID: 'e2' }),
  ];
  const src = sources([event], { [EVENT]: [e1, e2], 'MJ: Record Changes': changes });
  const versionOf = (rows: readonly SourceRow[]): string =>
    AsOfFeatureAssembler.ContributorsVersion(WindowedAggregates.ComputeWindowedAggregate(WindowedAggregates.BuildChildRowIndex(rows, source, 'ID'), 'p1', new Date('2025-06-01T00:00:00.000Z'), source).Contributors);
  const p = (version: string, day = '2025-06-01'): ValueProvenance =>
    ({ column: 'points_y', source: 'windowed-aggregate', sourceRef: `${EVENT}?PersonID=p1&as-of=${day}&aggregate=sum`, sourceVersion: version, computedAt: '2025-06-02T00:00:00.000Z' });

  it('drops a child row whose Create row is after the decision day although its __mj_CreatedAt is before it', async () => {
    expect(await ProvenanceResolver.ResolveValueProvenance(src, { Provenance: p(versionOf([e1])), Cells: [3], Spec: spec, Folded: [], Row: yearRow('2025-06-01T00:00:00.000Z') })).toBe(true);
  });

  it('does not resolve a value that counted the late-entered child row', async () => {
    expect(await ProvenanceResolver.ResolveValueProvenance(src, { Provenance: p(versionOf([e1, e2])), Cells: [8], Spec: spec, Folded: [], Row: yearRow('2025-06-01T00:00:00.000Z') })).toBe(false);
  });

  it('does not resolve a reference whose as-of day is not the row\'s decision day', async () => {
    expect(await ProvenanceResolver.ResolveValueProvenance(src, { Provenance: p(versionOf([e1]), '2025-06-02'), Cells: [3], Spec: spec, Folded: [], Row: yearRow('2025-06-01T00:00:00.000Z') })).toBe(false);
  });

  it('does not resolve a reference whose owner is not the row\'s owner', async () => {
    expect(await ProvenanceResolver.ResolveValueProvenance(src, { Provenance: p(versionOf([e1])), Cells: [3], Spec: spec, Folded: [], Row: yearRow('2025-06-01T00:00:00.000Z', 'p2') })).toBe(false);
  });
});
