import { describe, it, expect } from 'vitest';
import { MongoExternalDataSourceDriver } from '../MongoExternalDataSourceDriver';

// Unit-test the pure read-only pipeline guard — no database connection required.
// (Live aggregation behavior is exercised by the gated integration test.)
class TestableMongoDriver extends MongoExternalDataSourceDriver {
  public assertReadOnly(pipeline: unknown[]) {
    return this.assertReadOnlyPipeline(pipeline);
  }
}

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
});
