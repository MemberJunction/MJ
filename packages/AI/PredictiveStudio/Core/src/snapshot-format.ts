/**
 * @module snapshot-format
 *
 * The persisted shapes of the Training Snapshot files the engine writes and the trainer reads: the matrix header
 * (line 1 of the matrix file), the matrix cell, the provenance line, and the reserved column names. The row-manifest
 * line is `SnapshotRowKey` (assembly contract). Their zod schemas are `StoreSchemas.*`.
 */
import type { ColumnEncoding, SnapshotRowKey, ValueProvenance } from './assembly-contract';
import type { DecisionSpec } from './prediction-unit';
import type { FeatureSchemaEntry, PreprocessingOp } from './sidecar-contract';

/** The matrix file's format tag, the header's first check. */
export const SNAPSHOT_MATRIX_FORMAT = 'ps-snapshot-matrix/v1';
/** The unit's incumbent heuristic evaluated per row, read by the trainer's `heuristic:<name>` baseline. */
export const INCUMBENT_SCORE_COLUMN = '__ps_incumbent_score';
/**
 * Reserved for test fixtures that plant a reference score (the leakage audit's implausible-gain rule); the product
 * never writes it.
 */
export const REFERENCE_SCORE_COLUMN = '__ps_reference_score';
/** `__ps_slice:<field>` holds the protocol's slice subgroup values as strings. */
export const SLICE_COLUMN_PREFIX = '__ps_slice:';

/** One matrix cell. */
export type SnapshotCell = string | number | boolean | null;

/** One feature column as the matrix header carries it: its name, the source column it came from and its full encoding. */
export interface SnapshotFeatureColumnHeader {
  readonly name: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly sourceColumn: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly encoding: ColumnEncoding;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** Line 1 of the matrix file: everything the trainer needs to read the rows that follow. */
export interface SnapshotMatrixHeader {
  readonly format: typeof SNAPSHOT_MATRIX_FORMAT;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** Every column, in row-cell order. */
  readonly columns: readonly string[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly labelColumn: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly featureColumns: readonly SnapshotFeatureColumnHeader[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly incumbentScoreColumn: typeof INCUMBENT_SCORE_COLUMN | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly referenceScoreColumn: typeof REFERENCE_SCORE_COLUMN | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** Slice field → its `__ps_slice:<field>` column. */
  readonly sliceColumns: Readonly<Record<string, string>>;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly decision: DecisionSpec;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  /** The sidecar feature schema: the run's `FeaturesUsed` and the model's `FeatureSchema` record it. */
  readonly featureSchema: readonly FeatureSchemaEntry[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly preprocessing: readonly PreprocessingOp[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** One line of the snapshot provenance file: the per-value provenance of one matrix row. */
export interface RowProvenance {
  readonly rowId: SnapshotRowKey['rowId'];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly values: readonly ValueProvenance[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}
