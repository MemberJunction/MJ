/**
 * @module store-schemas
 *
 * Zod schemas of the stores Predictive Studio writes and reads back: the snapshot matrix header and rows, the
 * manifest and provenance lines, the stored class balance, and the decision spec, encodings, feature schema and
 * preprocessing the snapshot header carries. A stored file is text that a hash check proves unchanged, not well-formed, so every line read back is
 * checked by one of these schemas rather than cast. Each schema is annotated with its TypeScript type, so the compiler
 * refuses a schema that does not fit the type it checks.
 */
import { z } from 'zod';
import type { ClassBalanceEntry, ColumnEncoding, DatedSource, SnapshotRowKey, ValueProvenance } from './assembly-contract';
import type { DecisionSpec } from './prediction-unit';
import type { FeatureKind, FeatureSchemaEntry, PreprocessingOp } from './sidecar-contract';
import { JsonParse, type JsonValue, type ParseResult } from './json-value';
import {
  INCUMBENT_SCORE_COLUMN,
  REFERENCE_SCORE_COLUMN,
  SNAPSHOT_MATRIX_FORMAT,
  type RowProvenance,
  type SnapshotCell,
  type SnapshotFeatureColumnHeader,
  type SnapshotMatrixHeader,
} from './snapshot-format';

/** Every `DatedSource` kind; `satisfies` makes the compiler refuse a value that is not one. */
const SOURCE_KINDS = ['record-changes', 'immutable-field', 'feature-value', 'windowed-aggregate', 'series'] as const satisfies readonly DatedSource['kind'][];

/** Every `FeatureKind`; `satisfies` makes the compiler refuse a value that is not one. */
const FEATURE_KINDS = ['numeric', 'categorical', 'embedding', 'llm-derived', 'decision-derived'] as const satisfies readonly FeatureKind[];

/** A schema of one stored shape, annotated with the type it checks. */
export type StoreSchema<T> = z.ZodType<T>;

/** The store schemas, as static members on one owner class so callers write `StoreSchemas.SnapshotRowKey`. */
export class StoreSchemas {
  /** One line of the snapshot row manifest. */
  /**
   * One stored value checked by its schema: the typed value, or one problem per mismatch (`<path>: <message>`).
   * Callers outside this package validate through here, so they need no zod dependency of their own.
   */
  public static Validate<T>(schema: StoreSchema<T>, value: JsonValue): ParseResult<T> {
    const parsed = schema.safeParse(value);
    if (parsed.success) return JsonParse.ParseOk(parsed.data);
    return JsonParse.ParseFail<T>(...parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`));
  }

  public static readonly SnapshotRowKey: z.ZodType<SnapshotRowKey> = z.object({
    rowId: z.string(),
    entityKey: z.string(),
    decisionDate: z.string(),
    groupKey: z.string().nullable(),
    period: z.string().nullable(),
    role: z.enum(['development', 'locked-holdout']),
  });

  /** The provenance of one value: which dated source it came from, at which version, computed when. */
  public static readonly ValueProvenance: z.ZodType<ValueProvenance> = z.object({
    column: z.string(),
    source: z.enum(SOURCE_KINDS),
    sourceRef: z.string(),
    sourceVersion: z.string(),
    computedAt: z.string(),
  });

  /** One line of the snapshot provenance file. */
  public static readonly RowProvenance: z.ZodType<RowProvenance> = z.object({
    rowId: z.string(),
    values: z.array(StoreSchemas.ValueProvenance),
  });

  /** The stored class balance: rows per label value. */
  public static readonly ClassBalance: z.ZodType<ClassBalanceEntry[]> = z.array(
    z.object({ label: z.string(), rows: z.number().int().nonnegative() }),
  );

  /** The decision the unit's prediction informs, as the snapshot header carries it. */
  public static readonly DecisionSpec: z.ZodType<DecisionSpec> = z.object({
    action: z.string(),
    actorRole: z.string(),
    capacityPerPeriod: z.number().nonnegative().nullable(),
    period: z.enum(['day', 'week', 'month', 'quarter', 'year']),
  });

  /** A feature column's full encoding. */
  public static readonly ColumnEncoding: z.ZodType<ColumnEncoding> = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('numeric'), nonNumericValue: z.literal('fail') }),
    z.object({ kind: z.literal('categorical'), cardinalityCap: z.number().int().positive(), method: z.enum(['onehot', 'hashed', 'target-in-fold']) }),
    z.object({ kind: z.literal('date-parts'), parts: z.array(z.enum(['year', 'month', 'dow', 'days-since-decision'])) }),
    z.object({ kind: z.literal('boolean') }),
    z.object({ kind: z.literal('identifier'), policy: z.literal('exclude') }),
  ]);

  /** One entry of the sidecar feature schema. */
  public static readonly FeatureSchemaEntry: z.ZodType<FeatureSchemaEntry> = z.object({
    Name: z.string(),
    Kind: z.enum(FEATURE_KINDS),
  });

  /** One step of the train-time preprocessing recipe. */
  public static readonly PreprocessingOp: z.ZodType<PreprocessingOp> = z.object({
    op: z.string(),
    col: z.string().optional(),
    cols: z.array(z.string()).optional(),
    strategy: z.enum(['mean', 'median', 'mode', 'constant']).optional(),
    fillValue: z.union([z.string(), z.number()]).optional(),
    bins: z.number().int().positive().optional(),
    indicator: z.boolean().optional(),
  });

  /** One feature column of the matrix header. */
  public static readonly SnapshotFeatureColumnHeader: z.ZodType<SnapshotFeatureColumnHeader> = z.object({
    name: z.string(),
    sourceColumn: z.string(),
    encoding: StoreSchemas.ColumnEncoding,
  });

  /** Line 1 of the matrix file. */
  public static readonly SnapshotMatrixHeader: z.ZodType<SnapshotMatrixHeader> = z.object({
    format: z.literal(SNAPSHOT_MATRIX_FORMAT),
    columns: z.array(z.string()),
    labelColumn: z.string(),
    featureColumns: z.array(StoreSchemas.SnapshotFeatureColumnHeader),
    incumbentScoreColumn: z.literal(INCUMBENT_SCORE_COLUMN).nullable(),
    referenceScoreColumn: z.literal(REFERENCE_SCORE_COLUMN).nullable(),
    sliceColumns: z.record(z.string()),
    decision: StoreSchemas.DecisionSpec,
    featureSchema: z.array(StoreSchemas.FeatureSchemaEntry),
    preprocessing: z.array(StoreSchemas.PreprocessingOp),
  });

  /** One matrix row after the header: a JSON array of cells. */
  public static readonly SnapshotRow: z.ZodType<SnapshotCell[]> = z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]));
}
