import { describe, it, expect } from 'vitest';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type { EntityInfo } from '@memberjunction/core';
import type { ExternalSeekAfter } from '@memberjunction/external-data-sources';
import { MongoExternalDataSourceDriver } from '../MongoExternalDataSourceDriver';

// Unit-test the pure read-only pipeline guard — no database connection required.
// (Live aggregation behavior is exercised by the gated integration test.)
class TestableMongoDriver extends MongoExternalDataSourceDriver {
  public assertReadOnly(pipeline: unknown[]) {
    return this.assertReadOnlyPipeline(pipeline);
  }
  public seek(seek: ExternalSeekAfter) {
    return this.buildSeekFilter(seek);
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

describe('MongoExternalDataSourceDriver — seekAfter (structured keyset resume → Mongo filter)', () => {
  const d = new TestableMongoDriver();

  it('single key → { k: { $gt: v } }', () => {
    expect(d.seek({ Keys: [{ Field: 'seq', Value: 101 }] })).toEqual({ seq: { $gt: 101 } });
  });
  it('composite key → $or of prefix-equal AND component-after', () => {
    expect(d.seek({ Keys: [{ Field: 'tenant', Value: 'T1' }, { Field: 'seq', Value: 50 }] })).toEqual({
      $or: [{ $and: [{ tenant: { $gt: 'T1' } }] }, { $and: [{ tenant: 'T1' }, { seq: { $gt: 50 } }] }],
    });
  });
  it('coerces a hex string _id key to an ObjectId so the seek matches BSON ids', () => {
    const filter = d.seek({ Keys: [{ Field: '_id', Value: '507f1f77bcf86cd799439011' }] }) as { _id: { $gt: { toHexString(): string } } };
    expect(filter._id.$gt.toHexString()).toBe('507f1f77bcf86cd799439011');
  });
  it('exact watermark + key → later watermark, or same watermark with a later key (ISO → Date)', () => {
    const w = new Date('2026-10-26T01:00:00.000Z');
    expect(d.seek({ Watermark: { Field: 'updatedAt', Value: '2026-10-26T01:00:00.000Z' }, Keys: [{ Field: 'seq', Value: 9 }] })).toEqual({
      $or: [{ updatedAt: { $gt: w } }, { $and: [{ updatedAt: w }, { seq: { $gt: 9 } }] }],
    });
  });
  it('truncated range → >= upper, or inside the range with a later key; no keys → >= upper', () => {
    const lower = new Date('2026-10-26T01:00:00.123Z');
    const upper = new Date('2026-10-26T01:00:00.124Z');
    const wm = { Field: 'updatedAt', Value: '2026-10-26T01:00:00.123Z', ExclusiveUpper: '2026-10-26T01:00:00.124Z' };
    expect(d.seek({ Watermark: wm, Keys: [{ Field: 'seq', Value: 9 }] })).toEqual({
      $or: [{ updatedAt: { $gte: upper } }, { $and: [{ updatedAt: { $gte: lower, $lt: upper } }, { seq: { $gt: 9 } }] }],
    });
    expect(d.seek({ Watermark: wm, Keys: [] })).toEqual({ updatedAt: { $gte: upper } });
  });
  it('within-range seek → only docs inside the range (after the key when one is given)', () => {
    const lower = new Date('2026-10-26T01:00:00.123Z');
    const upper = new Date('2026-10-26T01:00:00.124Z');
    const wm = { Field: 'updatedAt', Value: '2026-10-26T01:00:00.123Z', ExclusiveUpper: '2026-10-26T01:00:00.124Z', WithinRange: true };
    expect(d.seek({ Watermark: wm, Keys: [] })).toEqual({ updatedAt: { $gte: lower, $lt: upper } });
    expect(d.seek({ Watermark: wm, Keys: [{ Field: 'seq', Value: 9 }] })).toEqual({
      $and: [{ updatedAt: { $gte: lower, $lt: upper } }, { seq: { $gt: 9 } }],
    });
    expect(() => d.seek({ Watermark: { Field: 'updatedAt', Value: 'x', WithinRange: true }, Keys: [] })).toThrow(/WithinRange requires ExclusiveUpper/);
  });
  it('NULL watermark (BSON sorts null first) → finish the null run by key, then every non-null doc', () => {
    expect(d.seek({ Watermark: { Field: 'updatedAt', Value: null }, Keys: [{ Field: 'seq', Value: 9 }] })).toEqual({
      $or: [{ $and: [{ updatedAt: null }, { seq: { $gt: 9 } }] }, { updatedAt: { $ne: null } }],
    });
  });
  it('refuses a seek that cannot resume', () => {
    expect(() => d.seek({ Keys: [] })).toThrow(/at least one key/);
  });
});
