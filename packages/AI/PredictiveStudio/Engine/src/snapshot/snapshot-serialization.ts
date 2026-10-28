/**
 * @module snapshot/snapshot-serialization
 *
 * The three Training Snapshot files, as UTF-8 JSON Lines:
 * - `matrix.jsonl` — line 1 is the header the trainer reads: the format tag, every column in row order, the label
 *   column, each feature column's source column and full `ColumnEncoding`, the optional incumbent-score,
 *   reference-score and slice columns, the unit's `DecisionSpec`, and the sidecar feature schema and preprocessing
 *   recipe; then one JSON array per manifest row.
 * - `manifest.jsonl` — one `SnapshotRowKey` per row, in the same order: matrix row i is manifest line i.
 * - `provenance.jsonl` — one `RowProvenance` (`{ rowId, values }`) per row, in the same order.
 *
 * The persisted shapes, reserved column names and their schemas are Core's (`snapshot-format`, `StoreSchemas`); this
 * module writes, reads and fingerprints the bytes. Every line is written through MJ's `Canonicalize` from
 * `@memberjunction/global` (keys sorted at every depth, no whitespace), so identical content produces byte-identical
 * files whatever order its keys were built in, and the file hashes identify the content.
 */
import { Canonicalize, NormalizeUUID } from '@memberjunction/global';
import { JsonParse, StoreSchemas, type JsonValue, type StoreSchema } from '@memberjunction/predictive-studio-core';
import type {
  RowProvenance,
  SnapshotCell,
  SnapshotFeatureColumn,
  SnapshotMatrixHeader,
  SnapshotRowKey,
} from '@memberjunction/predictive-studio-core';
import { SnapshotHash } from './snapshot-hash';

/** A Training Snapshot's content: the header, the rows, and the aligned manifest and provenance lines. */
export interface SnapshotContent {
  readonly Header: SnapshotMatrixHeader;
  readonly Rows: readonly (readonly SnapshotCell[])[];
  readonly Manifest: readonly SnapshotRowKey[];
  readonly Provenance: readonly RowProvenance[];
}

/** The three snapshot files' bytes. */
export interface SnapshotFileBytes {
  readonly Matrix: Uint8Array;
  readonly Manifest: Uint8Array;
  readonly Provenance: Uint8Array;
}

/** The inputs of a Training Snapshot's content hash (the `ContentHash` column). */
export interface SnapshotContentHashInput {
  readonly MatrixSha256: string;
  readonly RowManifestSha256: string;
  readonly ProvenanceSha256: string;
  readonly FeatureSchemaHash: string;
  readonly PredictionUnitID: string;
  readonly LabelVersion: number;
  readonly FeatureSpecVersion: number;
  readonly EvaluationProtocolID: string | null;
  readonly DataCutoff: string;
}

/** One parsed JSON line and its 1-based line number in the file. */
export interface SnapshotJsonLine {
  readonly Line: number;
  readonly Value: JsonValue;
}

/** A snapshot file line that is not what the writer writes; names the file and the 1-based line. */
export class SnapshotFileFormatError extends Error {
  constructor(public readonly File: string, public readonly Line: number, public readonly Problems: readonly string[]) {
    super(`Snapshot ${File} file, line ${Line}: ${Problems.join('; ')}`);
    this.name = 'SnapshotFileFormatError';
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The Training Snapshot file format: serialize, parse and fingerprint, as static members on one owner class. */
export class SnapshotFiles {
  /**
   * The content as the three files' bytes. Refuses content whose rows, manifest and provenance do not align, or a row
   * whose width differs from the header's columns.
   */
  public static SerializeSnapshotFiles(c: SnapshotContent): SnapshotFileBytes {
    if (c.Rows.length !== c.Manifest.length || c.Provenance.length !== c.Manifest.length) {
      throw new Error(`Snapshot rows (${c.Rows.length}), manifest (${c.Manifest.length}) and provenance (${c.Provenance.length}) must align`);
    }
    c.Rows.forEach((r, i) => {
      if (r.length !== c.Header.columns.length) throw new Error(`Snapshot row ${i} has ${r.length} cells; the header lists ${c.Header.columns.length} columns`);
    });
    return {
      Matrix: SnapshotFiles.lines([Canonicalize(c.Header), ...c.Rows.map((r) => Canonicalize(r))]),
      Manifest: SnapshotFiles.lines(c.Manifest.map((m) => Canonicalize(m))),
      Provenance: SnapshotFiles.lines(c.Provenance.map((p) => Canonicalize(p))),
    };
  }

  /**
   * The three files back to content. Every line is checked with its store schema — a stored file is text that a hash
   * check proves unchanged, not well-formed — and a malformed line throws `SnapshotFileFormatError` naming the file
   * and the line.
   */
  public static ParseSnapshotFiles(matrix: Uint8Array, manifest: Uint8Array, provenance: Uint8Array): SnapshotContent {
    const [header, ...rows] = SnapshotFiles.jsonLines('matrix', matrix);
    if (header === undefined) throw new SnapshotFileFormatError('matrix', 1, ['the matrix file has no header line']);
    return {
      Header: SnapshotFiles.check('matrix', header, StoreSchemas.SnapshotMatrixHeader),
      Rows: rows.map((r) => SnapshotFiles.check('matrix', r, StoreSchemas.SnapshotRow)),
      Manifest: SnapshotFiles.ParseManifestLines(manifest),
      Provenance: SnapshotFiles.jsonLines('provenance', provenance).map((p) => SnapshotFiles.check('provenance', p, StoreSchemas.RowProvenance)),
    };
  }

  /** The manifest file's rows, each checked with `StoreSchemas.SnapshotRowKey` (also read alone, without the matrix). */
  public static ParseManifestLines(manifest: Uint8Array): SnapshotRowKey[] {
    return SnapshotFiles.jsonLines('manifest', manifest).map((m) => SnapshotFiles.check('manifest', m, StoreSchemas.SnapshotRowKey));
  }

  /** SHA-256 of the canonical JSON of each feature column's name, encoding kind and source column, in column order. */
  public static ComputeFeatureSchemaHash(columns: readonly SnapshotFeatureColumn[]): string {
    return SnapshotHash.Sha256Hex(Canonicalize(columns.map((c) => ({ name: c.name, encoding: c.encoding, sourceColumn: c.sourceColumn }))));
  }

  /**
   * The snapshot's content hash: SHA-256 of the canonical JSON of the three file hashes (matrix, row manifest,
   * provenance), the feature schema hash, PredictionUnitID, LabelVersion, FeatureSpecVersion, EvaluationProtocolID
   * and DataCutoff. The matrix file holds the header, so the encodings, incumbent and slice columns and decision spec
   * are covered through its hash. The provenance file is included, so the same rows recomputed from different source
   * versions or at a different time are a different snapshot. IDs are normalized, so the hash does not depend on the
   * database's UUID casing.
   */
  public static ComputeSnapshotContentHash(x: SnapshotContentHashInput): string {
    return SnapshotHash.Sha256Hex(Canonicalize({
      matrixSha256: x.MatrixSha256,
      rowManifestSha256: x.RowManifestSha256,
      provenanceSha256: x.ProvenanceSha256,
      featureSchemaHash: x.FeatureSchemaHash,
      predictionUnitId: NormalizeUUID(x.PredictionUnitID),
      labelVersion: x.LabelVersion,
      featureSpecVersion: x.FeatureSpecVersion,
      evaluationProtocolId: x.EvaluationProtocolID === null ? null : NormalizeUUID(x.EvaluationProtocolID),
      dataCutoff: x.DataCutoff,
    }));
  }

  /** JSON Lines bytes: one item per line, each line terminated by `\n`. */
  protected static lines(items: readonly string[]): Uint8Array {
    return encoder.encode(items.map((l) => `${l}\n`).join(''));
  }

  /**
   * JSON Lines → parsed JSON values with their 1-based line numbers. Only the final line terminator is dropped, so a
   * blank line inside the file is refused (it is not JSON) and every reported line number is the file's own.
   */
  protected static jsonLines(file: string, bytes: Uint8Array): SnapshotJsonLine[] {
    const text = decoder.decode(bytes);
    const lines = text.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines.map((line, i) => {
      const json = JsonParse.ParseJsonText(line, `${file} line ${i + 1}`);
      if (json.Ok === false) throw new SnapshotFileFormatError(file, i + 1, json.Errors);
      return { Line: i + 1, Value: json.Value };
    });
  }

  /** One line checked by its store schema; a mismatch throws `SnapshotFileFormatError` naming the file and line. */
  protected static check<T>(file: string, line: SnapshotJsonLine, schema: StoreSchema<T>): T {
    const checked = StoreSchemas.Validate(schema, line.Value);
    if (checked.Ok === false) throw new SnapshotFileFormatError(file, line.Line, checked.Errors);
    return checked.Value;
  }
}
