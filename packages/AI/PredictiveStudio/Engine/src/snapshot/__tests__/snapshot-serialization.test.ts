import { describe, it, expect } from 'vitest';
import { Canonicalize } from '@memberjunction/global';
import { SnapshotHash } from '../snapshot-hash';
import { SNAPSHOT_MATRIX_FORMAT } from '@memberjunction/predictive-studio-core';
import { SnapshotFiles, SnapshotFileFormatError, type SnapshotContent, type SnapshotContentHashInput } from '../snapshot-serialization';

const content: SnapshotContent = {
  Header: {
    format: 'ps-snapshot-matrix/v1',
    columns: ['EventsAttended', 'Region', '__ps_label', '__ps_incumbent_score', '__ps_slice:Region'],
    labelColumn: '__ps_label',
    featureColumns: [
      { name: 'EventsAttended', sourceColumn: 'Years.EventsAttended', encoding: { kind: 'numeric', nonNumericValue: 'fail' } },
      { name: 'Region', sourceColumn: 'Years.Region', encoding: { kind: 'categorical', cardinalityCap: 20, method: 'onehot' } },
    ],
    incumbentScoreColumn: '__ps_incumbent_score',
    referenceScoreColumn: null,
    sliceColumns: { Region: '__ps_slice:Region' },
    decision: { action: 'renewal outreach', actorRole: 'membership team', capacityPerPeriod: 150, period: 'month' },
    featureSchema: [{ Name: 'EventsAttended', Kind: 'numeric' }, { Name: 'Region', Kind: 'categorical' }],
    preprocessing: [{ op: 'impute', col: 'EventsAttended', strategy: 'median', indicator: true }],
  },
  Rows: [[3, 'EU', '1', 1, 'EU'], [null, 'R7', '0', null, 'R7']],
  Manifest: [
    { rowId: 'y1', entityKey: 'y1', decisionDate: '2022-12-01', groupKey: 'p1', period: null, role: 'development' },
    { rowId: 'y2', entityKey: 'y2', decisionDate: '2023-12-01', groupKey: 'p1', period: null, role: 'locked-holdout' },
  ],
  Provenance: [
    { rowId: 'y1', values: [{ column: 'EventsAttended', source: 'immutable-field', sourceRef: 'Years/y1/EventsAttended', sourceVersion: 'created:2026-10-01T00:00:00.000Z', computedAt: '2026-10-01T00:00:00.000Z' }] },
    { rowId: 'y2', values: [{ column: 'EventsAttended', source: 'immutable-field', sourceRef: 'Years/y2/EventsAttended', sourceVersion: 'created:2026-10-01T00:00:00.000Z', computedAt: '2026-10-01T00:00:00.000Z' }] },
  ],
};

/** Decode a JSON Lines file into its non-empty lines. */
function fileLines(bytes: Uint8Array): string[] {
  return new TextDecoder().decode(bytes).split('\n').filter((l) => l.length > 0);
}

/** Re-encode JSON Lines after replacing one 0-based line. */
function replaceLine(bytes: Uint8Array, index: number, line: string): Uint8Array {
  const lines = fileLines(bytes);
  lines[index] = line;
  return new TextEncoder().encode(lines.map((l) => `${l}\n`).join(''));
}

/** The thrown error, so a test can assert its fields. */
function thrownBy(fn: () => void): Error | null {
  try {
    fn();
  } catch (e) {
    return e instanceof Error ? e : null;
  }
  return null;
}

describe('snapshot files', () => {
  it('canonical JSON (the shared Canonicalize) sorts keys at every depth, as the content hash requires', () => {
    expect(Canonicalize({ b: 1, a: { d: [2, { z: null, y: true }], c: 'x' } })).toBe('{"a":{"c":"x","d":[2,{"y":true,"z":null}]},"b":1}');
  });
  it('serializes deterministically, byte-identically whatever the key insertion order, and round-trips', () => {
    const a = SnapshotFiles.SerializeSnapshotFiles(content);
    const b = SnapshotFiles.SerializeSnapshotFiles(content);
    expect(SnapshotHash.Sha256Hex(a.Matrix)).toBe(SnapshotHash.Sha256Hex(b.Matrix));
    expect(SnapshotFiles.ParseSnapshotFiles(a.Matrix, a.Manifest, a.Provenance)).toEqual(content);
    const reordered: SnapshotContent = {
      Provenance: content.Provenance.map((p) => ({ values: p.values.map((v) => ({ computedAt: v.computedAt, sourceVersion: v.sourceVersion, sourceRef: v.sourceRef, source: v.source, column: v.column })), rowId: p.rowId })),
      Manifest: content.Manifest.map((m) => ({ role: m.role, period: m.period, groupKey: m.groupKey, decisionDate: m.decisionDate, entityKey: m.entityKey, rowId: m.rowId })),
      Rows: content.Rows,
      Header: {
        preprocessing: content.Header.preprocessing,
        featureSchema: content.Header.featureSchema.map((f) => ({ Kind: f.Kind, Name: f.Name })),
        decision: { period: 'month', capacityPerPeriod: 150, actorRole: 'membership team', action: 'renewal outreach' },
        sliceColumns: content.Header.sliceColumns,
        referenceScoreColumn: null,
        incumbentScoreColumn: '__ps_incumbent_score',
        featureColumns: content.Header.featureColumns.map((f) => ({ encoding: f.encoding, sourceColumn: f.sourceColumn, name: f.name })),
        labelColumn: '__ps_label',
        columns: content.Header.columns,
        format: 'ps-snapshot-matrix/v1',
      },
    };
    const c = SnapshotFiles.SerializeSnapshotFiles(reordered);
    expect(new TextDecoder().decode(c.Matrix)).toBe(new TextDecoder().decode(a.Matrix));
    expect(new TextDecoder().decode(c.Manifest)).toBe(new TextDecoder().decode(a.Manifest));
    expect(new TextDecoder().decode(c.Provenance)).toBe(new TextDecoder().decode(a.Provenance));
  });
  it('writes the header the trainer reads as line 1 and one row per manifest line, in manifest order', () => {
    const files = SnapshotFiles.SerializeSnapshotFiles(content);
    const matrixLines = fileLines(files.Matrix);
    const header = JSON.parse(matrixLines[0]);
    expect(header.format).toBe(SNAPSHOT_MATRIX_FORMAT);
    expect(header.featureColumns[1].encoding).toEqual({ kind: 'categorical', cardinalityCap: 20, method: 'onehot' });
    expect(matrixLines).toHaveLength(1 + content.Manifest.length);
    expect(fileLines(files.Manifest).map((l) => JSON.parse(l).rowId)).toEqual(['y1', 'y2']);
  });
  it('refuses rows whose width differs from the header columns', () => {
    expect(() => SnapshotFiles.SerializeSnapshotFiles({ ...content, Rows: [[3, 'EU', '1'], [null, 'R7', '0']] })).toThrow('row 0 has 3 cells; the header lists 5 columns');
  });
  it('fingerprints the three files and the versions, and changes when any of them changes', () => {
    const files = SnapshotFiles.SerializeSnapshotFiles(content);
    const base: SnapshotContentHashInput = {
      MatrixSha256: SnapshotHash.Sha256Hex(files.Matrix),
      RowManifestSha256: SnapshotHash.Sha256Hex(files.Manifest),
      ProvenanceSha256: SnapshotHash.Sha256Hex(files.Provenance),
      FeatureSchemaHash: SnapshotFiles.ComputeFeatureSchemaHash([{ name: 'EventsAttended', encoding: 'numeric', sourceColumn: 'Years.EventsAttended' }]),
      PredictionUnitID: 'U1',
      LabelVersion: 1,
      FeatureSpecVersion: 3,
      EvaluationProtocolID: null,
      DataCutoff: '2026-01-01',
    };
    const h = SnapshotFiles.ComputeSnapshotContentHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(SnapshotFiles.ComputeSnapshotContentHash({ ...base, LabelVersion: 2 })).not.toBe(h);
    expect(SnapshotFiles.ComputeSnapshotContentHash({ ...base, ProvenanceSha256: SnapshotHash.Sha256Hex('other provenance') })).not.toBe(h);
    expect(SnapshotFiles.ComputeSnapshotContentHash({ ...base })).toBe(h);
  });
  it('refuses a manifest line of the wrong shape, naming the file and line', () => {
    const files = SnapshotFiles.SerializeSnapshotFiles(content);
    const corrupt = replaceLine(files.Manifest, 1, fileLines(files.Manifest)[1].replace('"locked-holdout"', '"holdout"'));
    const err = thrownBy(() => SnapshotFiles.ParseSnapshotFiles(files.Matrix, corrupt, files.Provenance));
    expect(err).toBeInstanceOf(SnapshotFileFormatError);
    expect(err instanceof SnapshotFileFormatError && { File: err.File, Line: err.Line }).toEqual({ File: 'manifest', Line: 2 });
  });
  it('refuses a header whose encoding is not a ColumnEncoding', () => {
    const files = SnapshotFiles.SerializeSnapshotFiles(content);
    const header = JSON.parse(fileLines(files.Matrix)[0]);
    header.featureColumns[0].encoding = { kind: 'text' };
    const corrupt = replaceLine(files.Matrix, 0, JSON.stringify(header));
    const err = thrownBy(() => SnapshotFiles.ParseSnapshotFiles(corrupt, files.Manifest, files.Provenance));
    expect(err).toBeInstanceOf(SnapshotFileFormatError);
    expect(err instanceof SnapshotFileFormatError && { File: err.File, Line: err.Line }).toEqual({ File: 'matrix', Line: 1 });
  });
});
