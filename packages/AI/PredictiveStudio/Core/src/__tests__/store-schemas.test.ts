import { describe, it, expect } from 'vitest';
import { StoreSchemas } from '../store-schemas';
import { JsonParse, type JsonValue } from '../json-value';
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

/** A value as the JSON a stored file line parses to. */
function asJson(value: object): JsonValue {
  const parsed = JsonParse.ParseJsonText(JSON.stringify(value), 'test value');
  if (parsed.Ok === false) throw new Error(parsed.Errors.join('; '));
  return parsed.Value;
}

describe('store schemas', () => {
  it('accepts the matrix header the writer writes and returns it typed', () => {
    const r = StoreSchemas.Validate(StoreSchemas.SnapshotMatrixHeader, asJson(header));
    expect(r.Ok && r.Value).toEqual(header);
  });
  it('refuses a header with an unknown format tag or a feature kind outside FeatureKind, naming the path', () => {
    const json = asJson({ ...header, format: 'ps-snapshot-matrix/v0', featureSchema: [{ Name: 'Tenure', Kind: 'text' }] });
    const r = StoreSchemas.Validate(StoreSchemas.SnapshotMatrixHeader, json);
    expect(r.Ok).toBe(false);
    if (r.Ok) return;
    expect(r.Errors.some((e) => e.startsWith('format:'))).toBe(true);
    expect(r.Errors.some((e) => e.startsWith('featureSchema.0.Kind:'))).toBe(true);
  });
  it('refuses an unknown key on a stored line, so a misspelt field fails loudly instead of being dropped', () => {
    const op = asJson({ op: 'impute', col: 'Tenure', strategy: 'median', indicatr: true });
    const r = StoreSchemas.Validate(StoreSchemas.PreprocessingOp, op);
    expect(r.Ok).toBe(false);
    const inHeader = StoreSchemas.Validate(StoreSchemas.SnapshotMatrixHeader, asJson({ ...header, preprocessing: [{ op: 'impute', extra: 1 }] }));
    expect(inHeader.Ok).toBe(false);
  });
});
