import { describe, it, expect } from 'vitest';
import { Canonicalize } from '@memberjunction/global';
import { SNAPSHOT_MATRIX_FORMAT } from '@memberjunction/predictive-studio-core';
import { SnapshotHash } from '../snapshot-hash';
import {
  SnapshotFiles,
  SnapshotFileFormatError,
  SnapshotNonFiniteCellError,
  type SnapshotContent,
  type SnapshotContentHashInput,
  type SnapshotFileBytes,
} from '../snapshot-serialization';

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
    {
      rowId: 'y1',
      values: [{
        column: 'EventsAttended', source: 'immutable-field', sourceRef: 'Years/y1/EventsAttended',
        sourceVersion: 'created:2026-10-01T00:00:00.000Z', computedAt: '2026-10-01T00:00:00.000Z',
      }],
    },
    {
      rowId: 'y2',
      values: [{
        column: 'EventsAttended', source: 'immutable-field', sourceRef: 'Years/y2/EventsAttended',
        sourceVersion: 'created:2026-10-01T00:00:00.000Z', computedAt: '2026-10-01T00:00:00.000Z',
      }],
    },
  ],
};

/** Decode a JSON Lines file into its non-empty lines. */
function fileLines(bytes: Uint8Array): string[] {
  return new TextDecoder().decode(bytes).split('\n').filter((l) => l.length > 0);
}

/** JSON Lines bytes from lines. */
function toBytes(lines: readonly string[]): Uint8Array {
  return new TextEncoder().encode(lines.map((l) => `${l}\n`).join(''));
}

/** Re-encode JSON Lines after replacing one 0-based line. */
function replaceLine(bytes: Uint8Array, index: number, line: string): Uint8Array {
  const lines = fileLines(bytes);
  lines[index] = line;
  return toBytes(lines);
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

/** The file and line a parse refusal names, or null when the parse did not throw a `SnapshotFileFormatError`. */
function refusalOf(files: SnapshotFileBytes): { File: string; Line: number } | null {
  const err = thrownBy(() => SnapshotFiles.ParseSnapshotFiles(files.Matrix, files.Manifest, files.Provenance));
  return err instanceof SnapshotFileFormatError ? { File: err.File, Line: err.Line } : null;
}

/** The stored file-hash columns of a serialized snapshot, as the Training Snapshot row records them. */
function storedFileHashes(files: SnapshotFileBytes): { MatrixSha256: string; RowManifestSha256: string; ProvenanceSha256: string } {
  return {
    MatrixSha256: SnapshotHash.Sha256Hex(files.Matrix),
    RowManifestSha256: SnapshotHash.Sha256Hex(files.Manifest),
    ProvenanceSha256: SnapshotHash.Sha256Hex(files.Provenance),
  };
}

const identity = {
  FeatureSchemaHash: SnapshotFiles.ComputeFeatureSchemaHash([{ name: 'EventsAttended', encoding: 'numeric', sourceColumn: 'Years.EventsAttended' }]),
  PredictionUnitID: 'U1',
  LabelVersion: 1,
  FeatureSpecVersion: 3,
  EvaluationProtocolID: null,
  DataCutoff: '2026-01-01',
};

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
      Provenance: content.Provenance.map((p) => ({
        values: p.values.map((v) => ({ computedAt: v.computedAt, sourceVersion: v.sourceVersion, sourceRef: v.sourceRef, source: v.source, column: v.column })),
        rowId: p.rowId,
      })),
      Manifest: content.Manifest.map((m) => ({
        role: m.role, period: m.period, groupKey: m.groupKey, decisionDate: m.decisionDate, entityKey: m.entityKey, rowId: m.rowId,
      })),
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
    const header = SnapshotFiles.ParseSnapshotFiles(toBytes(matrixLines.slice(0, 1)), toBytes([]), toBytes([])).Header;
    expect(header.format).toBe(SNAPSHOT_MATRIX_FORMAT);
    expect(header.featureColumns[1]?.encoding).toEqual({ kind: 'categorical', cardinalityCap: 20, method: 'onehot' });
    expect(matrixLines).toHaveLength(1 + content.Manifest.length);
    expect(SnapshotFiles.ParseManifestLines(files.Manifest).map((m) => m.rowId)).toEqual(['y1', 'y2']);
  });
  it('refuses rows whose width differs from the header columns', () => {
    expect(() => SnapshotFiles.SerializeSnapshotFiles({ ...content, Rows: [[3, 'EU', '1'], [null, 'R7', '0']] }))
      .toThrow('row 0 has 3 cells; the header lists 5 columns');
  });
  it('refuses a NaN or infinite cell, naming the row id and column, rather than writing null', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const err = thrownBy(() => SnapshotFiles.SerializeSnapshotFiles({ ...content, Rows: [content.Rows[0] ?? [], [bad, 'R7', '0', null, 'R7']] }));
      expect(err).toBeInstanceOf(SnapshotNonFiniteCellError);
      expect(err instanceof SnapshotNonFiniteCellError && { RowID: err.RowID, Column: err.Column }).toEqual({ RowID: 'y2', Column: 'EventsAttended' });
    }
  });
  it('fingerprints the matrix, manifest and versions, and changes when any of them changes', () => {
    const base: SnapshotContentHashInput = { ...storedFileHashes(SnapshotFiles.SerializeSnapshotFiles(content)), ...identity };
    const h = SnapshotFiles.ComputeSnapshotContentHash(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(SnapshotFiles.ComputeSnapshotContentHash({ ...base, LabelVersion: 2 })).not.toBe(h);
    expect(SnapshotFiles.ComputeSnapshotContentHash({ ...base, RowManifestSha256: SnapshotHash.Sha256Hex('other') })).not.toBe(h);
    expect(SnapshotFiles.ComputeSnapshotContentHash({ ...base })).toBe(h);
  });
  it('gives identical data one content hash although its provenance was computed at a different time', () => {
    const later: SnapshotContent = {
      ...content,
      Provenance: content.Provenance.map((p) => ({ ...p, values: p.values.map((v) => ({ ...v, computedAt: '2026-11-01T00:00:00.000Z' })) })),
    };
    const first = storedFileHashes(SnapshotFiles.SerializeSnapshotFiles(content));
    const second = storedFileHashes(SnapshotFiles.SerializeSnapshotFiles(later));
    expect(second.ProvenanceSha256).not.toBe(first.ProvenanceSha256);
    const firstInput: SnapshotContentHashInput = { ...first, ...identity };
    const secondInput: SnapshotContentHashInput = { ...second, ...identity };
    expect(SnapshotFiles.ComputeSnapshotContentHash(secondInput)).toBe(SnapshotFiles.ComputeSnapshotContentHash(firstInput));
  });
  it('refuses a DataCutoff that is not YYYY-MM-DD', () => {
    const base: SnapshotContentHashInput = { ...storedFileHashes(SnapshotFiles.SerializeSnapshotFiles(content)), ...identity };
    for (const cutoff of ['2026-1-1', '2026-01-01T00:00:00Z', '']) {
      expect(() => SnapshotFiles.ComputeSnapshotContentHash({ ...base, DataCutoff: cutoff })).toThrow('DataCutoff');
    }
  });
  it('refuses a manifest line of the wrong shape, naming the file and line', () => {
    const files = SnapshotFiles.SerializeSnapshotFiles(content);
    const corrupt = replaceLine(files.Manifest, 1, (fileLines(files.Manifest)[1] ?? '').replace('"locked-holdout"', '"holdout"'));
    expect(refusalOf({ ...files, Manifest: corrupt })).toEqual({ File: 'manifest', Line: 2 });
  });
  it('refuses a header whose encoding is not a ColumnEncoding', () => {
    const files = SnapshotFiles.SerializeSnapshotFiles(content);
    const [first, second] = content.Header.featureColumns;
    const badHeader = Canonicalize({ ...content.Header, featureColumns: [{ ...first, encoding: { kind: 'text' } }, second] });
    expect(refusalOf({ ...files, Matrix: replaceLine(files.Matrix, 0, badHeader) })).toEqual({ File: 'matrix', Line: 1 });
  });
  it('refuses a stored matrix row whose width differs from the header columns', () => {
    const files = SnapshotFiles.SerializeSnapshotFiles(content);
    expect(refusalOf({ ...files, Matrix: replaceLine(files.Matrix, 2, Canonicalize([null, 'R7', '0'])) })).toEqual({ File: 'matrix', Line: 3 });
  });
  it('refuses matrix, manifest and provenance files whose line counts differ, naming the first unmatched line', () => {
    const files = SnapshotFiles.SerializeSnapshotFiles(content);
    const oneManifest = toBytes(fileLines(files.Manifest).slice(0, 1));
    const oneProvenance = toBytes(fileLines(files.Provenance).slice(0, 1));
    expect(refusalOf({ ...files, Manifest: oneManifest, Provenance: oneProvenance })).toEqual({ File: 'matrix', Line: 3 });
    expect(refusalOf({ ...files, Matrix: toBytes(fileLines(files.Matrix).slice(0, 2)) })).toEqual({ File: 'manifest', Line: 2 });
    expect(refusalOf({ ...files, Provenance: oneProvenance })).toEqual({ File: 'manifest', Line: 2 });
  });
  it('refuses a provenance line whose rowId is not the manifest row at the same position', () => {
    const files = SnapshotFiles.SerializeSnapshotFiles(content);
    const swapped = toBytes([...fileLines(files.Provenance)].reverse());
    expect(refusalOf({ ...files, Provenance: swapped })).toEqual({ File: 'provenance', Line: 1 });
  });
});

