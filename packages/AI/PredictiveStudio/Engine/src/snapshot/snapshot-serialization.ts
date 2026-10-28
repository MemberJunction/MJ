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

/**
 * The inputs of a Training Snapshot's content hash (the `ContentHash` column). The provenance file's hash is stored on
 * the snapshot and verified when the files are read back, but it is not an input here (see
 * `SnapshotFiles.ComputeSnapshotContentHash`).
 */
export interface SnapshotContentHashInput {
  readonly MatrixSha256: string;
  readonly RowManifestSha256: string;
  readonly FeatureSchemaHash: string;
  readonly PredictionUnitID: string;
  readonly LabelVersion: number;
  readonly FeatureSpecVersion: number;
  readonly EvaluationProtocolID: string | null;
  /** The data cutoff day, `YYYY-MM-DD`. */
  readonly DataCutoff: string;
}

/** One parsed JSON line and its 1-based line number in the file. */
interface SnapshotJsonLine {
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

/**
 * A numeric cell that is NaN or infinite. JSON has no such number (it would be written as `null`, silently turning a
 * computation error into a missing value), so the writer refuses it and names the row and column.
 */
export class SnapshotNonFiniteCellError extends Error {
  constructor(public readonly RowID: string, public readonly Column: string, public readonly Value: number) {
    super(`Snapshot row ${RowID}, column ${Column}: ${String(Value)} is not a finite number`);
    this.name = 'SnapshotNonFiniteCellError';
  }
}

/** A calendar day, `YYYY-MM-DD`. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** The Training Snapshot file format: serialize, parse and fingerprint, as static members on one owner class. */
export class SnapshotFiles {
  /**
   * The content as the three files' bytes. Refuses content whose rows, manifest and provenance do not align, a row
   * whose width differs from the header's columns, and a NaN or infinite numeric cell.
   */
  public static SerializeSnapshotFiles(c: SnapshotContent): SnapshotFileBytes {
    if (c.Rows.length !== c.Manifest.length || c.Provenance.length !== c.Manifest.length) {
      throw new Error(
        `Snapshot rows (${c.Rows.length}), manifest (${c.Manifest.length}) and provenance (${c.Provenance.length})`
          + ' must align',
      );
    }
    c.Rows.forEach((r, i) => {
      if (r.length !== c.Header.columns.length) {
        throw new Error(`Snapshot row ${i} has ${r.length} cells; the header lists ${c.Header.columns.length} columns`);
      }
      SnapshotFiles.refuseNonFinite(r, c.Manifest[i].rowId, c.Header.columns);
    });
    return {
      Matrix: SnapshotFiles.lines([Canonicalize(c.Header), ...c.Rows.map((r) => Canonicalize(r))]),
      Manifest: SnapshotFiles.lines(c.Manifest.map((m) => Canonicalize(m))),
      Provenance: SnapshotFiles.lines(c.Provenance.map((p) => Canonicalize(p))),
    };
  }

  /**
   * The three files back to content. Every line is checked with its store schema — a stored file is text that a hash
   * check proves unchanged, not well-formed — and so is the structure across the files: every matrix row is as wide
   * as the header's columns, the matrix rows, manifest lines and provenance lines are equally many, and provenance
   * line i carries manifest line i's rowId. A violation throws `SnapshotFileFormatError` naming the file and line.
   */
  public static ParseSnapshotFiles(matrix: Uint8Array, manifest: Uint8Array, provenance: Uint8Array): SnapshotContent {
    const [headerLine, ...rowLines] = SnapshotFiles.jsonLines('matrix', matrix);
    if (headerLine === undefined) throw new SnapshotFileFormatError('matrix', 1, ['the matrix file has no header line']);
    const header = SnapshotFiles.check('matrix', headerLine, StoreSchemas.SnapshotMatrixHeader);
    const rows = rowLines.map((r) => SnapshotFiles.checkRow(r, header.columns.length));
    const keys = SnapshotFiles.ParseManifestLines(manifest);
    const provenanceLines = SnapshotFiles.jsonLines('provenance', provenance);
    const lineage = provenanceLines.map((p) => SnapshotFiles.check('provenance', p, StoreSchemas.RowProvenance));
    SnapshotFiles.refuseCountMismatch(rows.length, keys.length, lineage.length);
    lineage.forEach((p, i) => {
      const expected = keys[i].rowId;
      if (p.rowId !== expected) {
        const problem = `rowId "${p.rowId}" is not manifest line ${i + 1}'s rowId "${expected}"`;
        throw new SnapshotFileFormatError('provenance', i + 1, [problem]);
      }
    });
    return { Header: header, Rows: rows, Manifest: keys, Provenance: lineage };
  }

  /** The manifest file's rows, each checked with `StoreSchemas.SnapshotRowKey` (also read alone, without the matrix). */
  public static ParseManifestLines(manifest: Uint8Array): SnapshotRowKey[] {
    return SnapshotFiles.jsonLines('manifest', manifest)
      .map((m) => SnapshotFiles.check('manifest', m, StoreSchemas.SnapshotRowKey));
  }

  /** SHA-256 of the canonical JSON of each feature column's name, encoding kind and source column, in column order. */
  public static ComputeFeatureSchemaHash(columns: readonly SnapshotFeatureColumn[]): string {
    const entries = columns.map((c) => ({ name: c.name, encoding: c.encoding, sourceColumn: c.sourceColumn }));
    return SnapshotHash.Sha256Hex(Canonicalize(entries));
  }

  /**
   * The snapshot's content hash: SHA-256 of the canonical JSON of the matrix and row-manifest file hashes, the feature
   * schema hash, PredictionUnitID, LabelVersion, FeatureSpecVersion, EvaluationProtocolID and DataCutoff. The matrix
   * file holds the header, so the encodings, incumbent and slice columns and decision spec are covered through its
   * hash.
   *
   * The provenance file is deliberately outside the hash: it records when each value was computed (aggregates, series
   * and missing values carry the assembly time), so including it would give identical data a new hash on every
   * assembly, and identical data must resolve to one snapshot. Its own hash is stored and verified on read.
   *
   * IDs are normalized, so the hash does not depend on the database's UUID casing. `DataCutoff` must be a
   * `YYYY-MM-DD` day; any other spelling of the same cutoff would hash differently, so it is refused.
   */
  public static ComputeSnapshotContentHash(x: SnapshotContentHashInput): string {
    if (!DAY.test(x.DataCutoff)) throw new Error(`Snapshot DataCutoff "${x.DataCutoff}" must be a YYYY-MM-DD day`);
    return SnapshotHash.Sha256Hex(Canonicalize({
      matrixSha256: x.MatrixSha256,
      rowManifestSha256: x.RowManifestSha256,
      featureSchemaHash: x.FeatureSchemaHash,
      predictionUnitId: NormalizeUUID(x.PredictionUnitID),
      labelVersion: x.LabelVersion,
      featureSpecVersion: x.FeatureSpecVersion,
      evaluationProtocolId: x.EvaluationProtocolID === null ? null : NormalizeUUID(x.EvaluationProtocolID),
      dataCutoff: x.DataCutoff,
    }));
  }

  /** A NaN or infinite numeric cell throws `SnapshotNonFiniteCellError` naming the row id and column. */
  private static refuseNonFinite(row: readonly SnapshotCell[], rowID: string, columns: readonly string[]): void {
    row.forEach((cell, j) => {
      if (typeof cell === 'number' && !Number.isFinite(cell)) throw new SnapshotNonFiniteCellError(rowID, columns[j], cell);
    });
  }

  /**
   * Matrix row i is manifest line i is provenance line i, so the three counts must agree. The refusal names the first
   * line that has no partner: in the longer file when it has extra lines, in the manifest when it is the longer one.
   */
  private static refuseCountMismatch(rows: number, manifest: number, provenance: number): void {
    const problem = [`the matrix has ${rows} rows, the manifest ${manifest} lines and the provenance ${provenance} lines`];
    if (rows > manifest) throw new SnapshotFileFormatError('matrix', manifest + 2, problem);
    if (rows < manifest) throw new SnapshotFileFormatError('manifest', rows + 1, problem);
    if (provenance > manifest) throw new SnapshotFileFormatError('provenance', manifest + 1, problem);
    if (provenance < manifest) throw new SnapshotFileFormatError('manifest', provenance + 1, problem);
  }

  /** JSON Lines bytes: one item per line, each line terminated by `\n`. */
  private static lines(items: readonly string[]): Uint8Array {
    return encoder.encode(items.map((l) => `${l}\n`).join(''));
  }

  /**
   * JSON Lines → parsed JSON values with their 1-based line numbers. Only the final line terminator is dropped, so a
   * blank line inside the file is refused (it is not JSON) and every reported line number is the file's own.
   */
  private static jsonLines(file: string, bytes: Uint8Array): SnapshotJsonLine[] {
    const lines = decoder.decode(bytes).split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines.map((line, i) => {
      const json = JsonParse.ParseJsonText(line, `${file} line ${i + 1}`);
      if (json.Ok === false) throw new SnapshotFileFormatError(file, i + 1, json.Errors);
      return { Line: i + 1, Value: json.Value };
    });
  }

  /** One matrix row line: a schema-checked array exactly as wide as the header's columns. */
  private static checkRow(line: SnapshotJsonLine, width: number): SnapshotCell[] {
    const row = SnapshotFiles.check('matrix', line, StoreSchemas.SnapshotRow);
    if (row.length !== width) {
      const problem = `the row has ${row.length} cells; the header lists ${width} columns`;
      throw new SnapshotFileFormatError('matrix', line.Line, [problem]);
    }
    return row;
  }

  /** One line checked by its store schema; a mismatch throws `SnapshotFileFormatError` naming the file and line. */
  private static check<T>(file: string, line: SnapshotJsonLine, schema: StoreSchema<T>): T {
    const checked = StoreSchemas.Validate(schema, line.Value);
    if (checked.Ok === false) throw new SnapshotFileFormatError(file, line.Line, checked.Errors);
    return checked.Value;
  }
}
