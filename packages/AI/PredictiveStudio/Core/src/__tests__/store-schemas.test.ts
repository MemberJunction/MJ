import { describe, it, expect } from 'vitest';
import { StoreSchemas } from '../store-schemas';
import type { JsonValue } from '../json-value';
import type { SnapshotMatrixHeader } from '../snapshot-format';

const header: SnapshotMatrixHeader = {
  format: 'ps-snapshot-matrix/v1',
  columns: ['Tenure', '__ps_label'],
  labelColumn: '__ps_label',
  featureColumns: [{ name: 'Tenure', sourceColumn: 'Members.Tenure', encoding: { kind: 'numeric', nonNumericValue: 'fail' } }],
  incumbentScoreColumn: null,
  referenceScoreColumn: null,
  sliceColumns: {},
  decision: { action: 'renewal outreach', actorRole: 'membership team', capacityPerPeriod: null, period: 'quarter' },
  featureSchema: [{ Name: 'Tenure', Kind: 'numeric' }],
  preprocessing: [],
};

/** The header as the JSON a stored file line parses to. */
function asJson(h: SnapshotMatrixHeader): JsonValue {
  return JSON.parse(JSON.stringify(h));
}

describe('store schemas', () => {
  it('accepts the matrix header the writer writes and returns it typed', () => {
    const r = StoreSchemas.Validate(StoreSchemas.SnapshotMatrixHeader, asJson(header));
    expect(r.Ok && r.Value).toEqual(header);
  });
  it('refuses a header with an unknown format tag or a feature kind outside FeatureKind, naming the path', () => {
    const json = JSON.parse(JSON.stringify({ ...header, format: 'ps-snapshot-matrix/v0', featureSchema: [{ Name: 'Tenure', Kind: 'text' }] }));
    const r = StoreSchemas.Validate(StoreSchemas.SnapshotMatrixHeader, json);
    expect(r.Ok).toBe(false);
    if (r.Ok) return;
    expect(r.Errors.some((e) => e.startsWith('format:'))).toBe(true);
    expect(r.Errors.some((e) => e.startsWith('featureSchema.0.Kind:'))).toBe(true);
  });
});
