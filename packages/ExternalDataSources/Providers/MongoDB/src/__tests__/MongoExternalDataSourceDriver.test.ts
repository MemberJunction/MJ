import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { EntityInfo } from '@memberjunction/core';
import { MongoExternalDataSourceDriver } from '../MongoExternalDataSourceDriver';

// Unit-test the pure read-only pipeline guard — no database connection required.
// (Live aggregation behavior is exercised by the gated integration test.)
class TestableMongoDriver extends MongoExternalDataSourceDriver {
  public assertReadOnly(pipeline: unknown[]) {
    return this.assertReadOnlyPipeline(pipeline);
  }
}

const fakeSource = () => ({ ID: 'x', Name: 'mongo', ConnectionConfig: '{}' } as unknown as MJExternalDataSourceEntity);

describe('MongoExternalDataSourceDriver — read-only pipeline guard', () => {
  const d = new TestableMongoDriver();

  it('allows read-only aggregation stages', () => {
    expect(() => d.assertReadOnly([
      { $match: { status: 'active' } },
      { $group: { _id: '$region', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ])).not.toThrow();
  });

  it('rejects a $out write stage', () => {
    expect(() => d.assertReadOnly([{ $match: {} }, { $out: 'results' }])).toThrow(/forbidden write stage '\$out'/);
  });

  it('rejects a $merge write stage', () => {
    expect(() => d.assertReadOnly([{ $merge: { into: 'results' } }])).toThrow(/forbidden write stage '\$merge'/);
  });

  it('tolerates non-object stages without throwing', () => {
    expect(() => d.assertReadOnly([null as unknown as object, 'weird' as unknown as object])).not.toThrow();
  });

  it('rejects a write stage nested inside $facet / $lookup / $unionWith sub-pipelines (deep walk)', () => {
    expect(() => d.assertReadOnly([{ $facet: { a: [{ $match: {} }, { $out: 'evil' }] } }])).toThrow(/forbidden write stage '\$out'/);
    expect(() => d.assertReadOnly([{ $lookup: { from: 'x', pipeline: [{ $merge: { into: 'evil' } }], as: 'j' } }])).toThrow(/forbidden write stage '\$merge'/);
    expect(() => d.assertReadOnly([{ $unionWith: { coll: 'x', pipeline: [{ $out: 'evil' }] } }])).toThrow(/forbidden write stage '\$out'/);
  });

  it('still allows a legitimate nested read-only sub-pipeline', () => {
    expect(() => d.assertReadOnly([{ $lookup: { from: 'x', pipeline: [{ $match: { active: true } }], as: 'j' } }])).not.toThrow();
  });
});

describe('MongoExternalDataSourceDriver — native query param guard', () => {
  const d = new TestableMongoDriver();

  it('fails loud (does not silently drop) when bound parameters are supplied — before connecting', async () => {
    const res = await d.RunNativeQuery(
      fakeSource(),
      '{"collection":"c","pipeline":[]}',
      [{ name: 'p', value: 1 }],
    );
    expect(res.success).toBe(false);
    expect(res.errorMessage).toMatch(/do not support bound parameters/i);
  });

  it('does not trip the guard when no params are supplied (guard is param-only)', async () => {
    // No params → passes the guard and proceeds to connect (which fails offline); the point is the
    // failure is NOT the param-guard message.
    const res = await d.RunNativeQuery(fakeSource(), '{"collection":"c","pipeline":[]}', undefined);
    expect(res.errorMessage ?? '').not.toMatch(/do not support bound parameters/i);
  });
});

describe('MongoExternalDataSourceDriver — object-name resolution', () => {
  const d = new TestableMongoDriver();
  const entity = (o: { ExternalObjectName?: string; BaseTable?: string; Name?: string; SchemaName?: string }) =>
    ({ ExternalObjectName: o.ExternalObjectName, BaseTable: o.BaseTable, Name: o.Name ?? 'Orders', SchemaName: o.SchemaName }) as unknown as EntityInfo;

  // REGRESSION GUARD: MongoDB uses objectName as a LITERAL collection name (db.collection(objectName)).
  // Entity.SchemaName is NOT NULL DEFAULT 'dbo', so every Mongo entity carries a non-empty SchemaName.
  // The base ResolveObjectName must NOT schema-qualify (that override is SQL-only) — otherwise a Mongo
  // read would target db.collection('dbo.orders'), a non-existent collection, and silently return nothing.
  it('returns the bare collection name even when the entity has a SchemaName', () => {
    expect(d.ResolveObjectName(entity({ ExternalObjectName: 'orders', BaseTable: 'orders', SchemaName: 'dbo' }))).toBe('orders');
  });
  it('does not prepend a non-default schema for Mongo (unlike the SQL drivers)', () => {
    expect(d.ResolveObjectName(entity({ ExternalObjectName: 'orders', SchemaName: 'salesdb' }))).toBe('orders');
  });
  it('falls back to BaseTable then Name when ExternalObjectName is unset', () => {
    expect(d.ResolveObjectName(entity({ BaseTable: 'events', SchemaName: 'dbo' }))).toBe('events');
  });
});
