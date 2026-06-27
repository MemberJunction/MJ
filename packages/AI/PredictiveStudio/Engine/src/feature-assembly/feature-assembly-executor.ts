/**
 * @module feature-assembly/feature-assembly-executor
 *
 * The **FeatureAssembly executor** — Predictive Studio's correctness backbone
 * (plan §6). It turns `(record set, frozen FeatureStep DAG) → feature matrix`,
 * and is the **single code path used in all three contexts** — training,
 * scheduled/materialized scoring, and on-demand/interactive scoring — so the
 * features produced are identical and train/serve skew is impossible by
 * construction (§6.1). The only difference between contexts is an
 * {@link AssemblyContext} enum tag for telemetry; the assembly logic is the same.
 *
 * ## The raw-vs-preprocessing split (§6.2 — the anti-skew design)
 *
 * The TS executor assembles the **raw** feature matrix from MJ data and **emits
 * the preprocessing recipe** for the Python sidecar to *fit then apply*. It does
 * **not** fit impute/standardize/onehot/bin itself:
 *
 * - **Data-assembly step kinds** (`select`, `embedding`, `llm-derived`,
 *   `flow-agent`) → produce raw column values in the matrix.
 * - **Preprocessing step kinds** (`impute`, `standardize`, `onehot`, `bin`) →
 *   translate into ordered {@link PreprocessingOp}[] returned for the sidecar;
 *   they do NOT transform values in TS.
 *
 * The sidecar fits these once on training data and replays the frozen params at
 * scoring, guaranteeing identical preprocessing at train and at score.
 *
 * ## As-of and leakage
 *
 * Time-relative features are assembled as of each record's decision date
 * (see `./as-of`), and deny-listed fields/sources are filtered out before any
 * column is produced (see `./leakage-guard`).
 */

import type {
  FeatureStepGraph,
  FeatureStep,
  SourceBinding,
  AsOfStrategy,
  LeakageGuard,
  FeatureSchemaEntry,
  PreprocessingOp,
  MatrixData,
  FeatureKind,
} from '@memberjunction/predictive-studio-core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';

import { type IFeatureDataAccess, RunViewDataAccess, type SourceRow } from './data-access';
import { type DatedRow, resolveAsOfDate, daysSinceLastActivityAsOf, activityCountAsOf } from './as-of';
import { LeakageGuardEnforcer } from './leakage-guard';

/**
 * Which of the three contexts the executor is running in. The value is purely a
 * telemetry/diagnostics tag — the assembly logic is identical in all three so
 * that features never differ between train and score (§6.1).
 */
export type AssemblyContext = 'train' | 'materialize' | 'on-demand';

/**
 * A dated source supplying time-relative ("as-of") features for the target
 * records. Each row carries the record it belongs to (via `ForeignKeyField`)
 * and a date column used for point-in-time filtering.
 */
export interface DatedSourceSpec {
  /** Entity to read the dated rows from (e.g. an Activities entity). */
  EntityName: string;
  /** Column on the dated rows that references the target record's primary key. */
  ForeignKeyField: string;
  /** Date column on the dated rows used for as-of filtering. */
  DateField: string;
  /**
   * Which as-of features to emit from this dated source. Each entry names the
   * output column and the aggregate kind to compute as-of the decision date.
   */
  Features: DatedFeatureSpec[];
}

/** One as-of feature derived from a {@link DatedSourceSpec}. */
export interface DatedFeatureSpec {
  /** Output column name in the matrix (e.g. `days_since_last_activity_asof`). */
  OutputColumn: string;
  /** The point-in-time aggregate to compute over the surviving (pre-decision) rows. */
  Aggregate: 'days_since_last_activity' | 'activity_count';
}

/**
 * Descriptor for the target record set. Either the records are passed inline
 * (`records`) — used by on-demand scoring and tests — or a `source` descriptor
 * tells the executor how to fetch them (used by train / materialize over a
 * full population).
 */
export interface RecordSetDescriptor {
  /** Entity to read target records from. */
  EntityName: string;
  /** Optional filter narrowing the population. */
  ExtraFilter?: string;
  /** Optional ordering. */
  OrderBy?: string;
  /** Optional row cap. */
  MaxRows?: number;
}

/**
 * Parameters for a FeatureAssembly run.
 */
export interface FeatureAssemblyParams {
  /** Entity whose records are the training/scoring units (e.g. `Members`). */
  targetEntityName: string;
  /** Inline records to assemble (preferred for on-demand/tests). */
  records?: SourceRow[];
  /** OR a descriptor telling the executor how to fetch the target records. */
  recordSet?: RecordSetDescriptor;
  /** Ordered source bindings the pipeline draws features from (§4.2/§5.5). */
  sources: SourceBinding[];
  /** The frozen FeatureStep DAG (§5/§6). */
  steps: FeatureStepGraph;
  /** Point-in-time assembly strategy (§6.3). */
  asOf: AsOfStrategy;
  /** Leakage protection (§6.4). */
  leakageGuard: LeakageGuard;
  /** Dated sources supplying as-of features (optional). */
  datedSources?: DatedSourceSpec[];
  /** The label column to carry through (train context). Omitted at score time. */
  targetVariable?: string;
  /** Per-record label-event date (required for as-of `offset` mode). Keyed by record primary key. */
  labelEventDates?: Record<string, Date>;
  /** Primary-key field name on the target entity (defaults to `ID`). */
  primaryKeyField?: string;
  /** Telemetry tag (train / materialize / on-demand). Logic is identical regardless. */
  context?: AssemblyContext;
  /** Request user — REQUIRED on the server for isolation/audit. */
  contextUser?: UserInfo;
  /** Optional provider for multi-provider correctness. */
  provider?: IMetadataProvider;
  /**
   * Optional data-access override — the seam that makes the executor unit-testable
   * without a DB. When omitted, a {@link RunViewDataAccess} is used.
   */
  dataAccess?: IFeatureDataAccess;
}

/**
 * The output of a FeatureAssembly run.
 */
export interface FeatureAssemblyResult {
  /** The assembled RAW feature matrix (columns + row-major values). */
  matrix: MatrixData;
  /** Ordered feature schema (the inference input contract) — aligns with `matrix.columns`. */
  featureSchema: FeatureSchemaEntry[];
  /** Ordered preprocessing recipe for the sidecar to FIT + APPLY (NOT applied here). */
  preprocessing: PreprocessingOp[];
  /** ISO timestamp the assembly ran (diagnostics). */
  assembledAsOf?: string;
}

/**
 * The FeatureAssembly executor. Stateless per call; construct once and reuse.
 */
export class FeatureAssemblyExecutor {
  /**
   * Assemble the raw feature matrix + schema + preprocessing recipe for the
   * given record set and frozen step graph. This is the single code path for
   * train / materialize / on-demand.
   *
   * @param params the assembly parameters
   * @returns the matrix, feature schema, and preprocessing ops
   */
  public async assemble(params: FeatureAssemblyParams): Promise<FeatureAssemblyResult> {
    const dataAccess = params.dataAccess ?? new RunViewDataAccess(params.contextUser, params.provider);
    const guard = new LeakageGuardEnforcer(params.leakageGuard);
    const pkField = params.primaryKeyField ?? 'ID';

    // 1. Resolve the target records (inline or fetched).
    const records = await this.resolveRecords(params, dataAccess);

    // 2. Partition steps: data-assembly produce columns; preprocessing → ops.
    const { dataSteps, preprocessing } = this.partitionSteps(params.steps, guard);

    // 3. Build the ordered RAW column plan (schema) from the data-assembly steps.
    const columnPlan = await this.buildColumnPlan(dataSteps, params, guard, dataAccess);

    // 4. Pre-index dated sources by record for as-of features.
    const datedIndex = await this.indexDatedSources(params, dataAccess, pkField, guard);

    // 5. Produce the matrix rows.
    const matrix = await this.buildMatrix(records, columnPlan, datedIndex, params, dataAccess, pkField);

    return {
      matrix,
      featureSchema: columnPlan.schema,
      preprocessing,
      assembledAsOf: new Date().toISOString(),
    };
  }

  /**
   * Resolve target records: prefer inline `records`, else fetch via the
   * `recordSet` descriptor through the data-access seam.
   */
  private async resolveRecords(params: FeatureAssemblyParams, dataAccess: IFeatureDataAccess): Promise<SourceRow[]> {
    if (params.records) {
      return params.records;
    }
    if (!params.recordSet) {
      throw new Error('FeatureAssembly requires either `records` or a `recordSet` descriptor.');
    }
    const res = await dataAccess.fetchRows({
      EntityName: params.recordSet.EntityName,
      ExtraFilter: params.recordSet.ExtraFilter,
      OrderBy: params.recordSet.OrderBy,
      MaxRows: params.recordSet.MaxRows,
    });
    if (!res.Success) {
      throw new Error(`Failed to fetch target records: ${res.ErrorMessage ?? 'unknown error'}`);
    }
    return res.Rows;
  }

  /**
   * Partition the frozen step graph into data-assembly steps (produce raw
   * columns) and preprocessing steps (emit ordered {@link PreprocessingOp}[] for
   * the sidecar). This is the anti-skew split (§6.2): TS NEVER fits or applies
   * impute/standardize/onehot/bin — it only declares them for the sidecar.
   */
  private partitionSteps(graph: FeatureStepGraph, guard: LeakageGuardEnforcer): { dataSteps: FeatureStep[]; preprocessing: PreprocessingOp[] } {
    const dataSteps: FeatureStep[] = [];
    const preprocessing: PreprocessingOp[] = [];

    for (const step of graph.Steps) {
      switch (step.Kind) {
        case 'select':
        case 'embedding':
        case 'llm-derived':
        case 'flow-agent':
          dataSteps.push(step);
          break;
        case 'impute':
        case 'standardize':
        case 'onehot':
        case 'bin': {
          const op = this.toPreprocessingOp(step, guard);
          if (op) {
            preprocessing.push(op);
          }
          break;
        }
        default: {
          const exhaustive: never = step;
          throw new Error(`Unsupported FeatureStep kind: ${String((exhaustive as FeatureStep).Kind)}`);
        }
      }
    }
    return { dataSteps, preprocessing };
  }

  /**
   * Translate a preprocessing step into a sidecar {@link PreprocessingOp}.
   * Deny-listed columns are dropped (defense in depth — they should already be
   * excluded from the matrix). Returns `null` when the op targets only
   * deny-listed columns.
   */
  private toPreprocessingOp(step: FeatureStep, guard: LeakageGuardEnforcer): PreprocessingOp | null {
    switch (step.Kind) {
      case 'impute':
        if (!guard.isFieldAllowed(step.Column)) {
          return null;
        }
        return { op: 'impute', col: step.Column, strategy: step.Strategy, fillValue: step.FillValue };
      case 'standardize': {
        const cols = guard.partitionColumns(step.Columns).allowed;
        return cols.length > 0 ? { op: 'standardize', cols } : null;
      }
      case 'onehot':
        if (!guard.isFieldAllowed(step.Column)) {
          return null;
        }
        return { op: 'onehot', col: step.Column };
      case 'bin':
        if (!guard.isFieldAllowed(step.Column)) {
          return null;
        }
        // Bin count travels in the recipe; the sidecar fits the edges.
        return { op: 'bin', col: step.Column, strategy: 'constant', fillValue: step.Bins };
      default:
        return null;
    }
  }

  /**
   * Build the ordered RAW-column plan from the data-assembly steps. Produces the
   * `FeatureSchemaEntry[]` (ordered) and the column-emitter list the matrix
   * builder replays per record. Deny-listed columns are excluded here, before
   * any value is produced (§6.4).
   */
  private async buildColumnPlan(
    dataSteps: FeatureStep[],
    params: FeatureAssemblyParams,
    guard: LeakageGuardEnforcer,
    _dataAccess: IFeatureDataAccess,
  ): Promise<ColumnPlan> {
    const schema: FeatureSchemaEntry[] = [];
    const emitters: ColumnEmitter[] = [];

    for (const step of dataSteps) {
      switch (step.Kind) {
        case 'select':
          this.planSelectColumns(step.Columns, guard, schema, emitters);
          break;
        case 'embedding':
          this.planEmbeddingColumns(step, guard, schema, emitters);
          break;
        case 'llm-derived':
          // §5.3/§6.5: read the PERSISTED, version-pinned attribute — never recompute inline.
          // The persisted feature column name is the pipeline ref by convention; resolved
          // per-record from the target row (the upstream Feature Pipeline wrote it back).
          this.planLLMDerivedColumns(step, guard, schema, emitters);
          break;
        case 'flow-agent':
          // INTEGRATION SEAM (§5.4): resolve from a persisted attribute when present;
          // otherwise leave a clearly-commented per-record agent-invocation point.
          this.planFlowAgentColumns(step, guard, schema, emitters);
          break;
        default:
          break;
      }
    }

    // Add as-of feature columns from dated sources (computed in the matrix builder).
    for (const ds of params.datedSources ?? []) {
      for (const f of ds.Features) {
        if (!guard.isFieldAllowed(f.OutputColumn)) {
          continue;
        }
        schema.push({ Name: f.OutputColumn, Kind: 'numeric' });
        // The actual value is computed in buildMatrix from the dated index; placeholder emitter.
        emitters.push({ column: f.OutputColumn, kind: 'as-of', datedSource: ds, datedFeature: f });
      }
    }

    return { schema, emitters };
  }

  /** Plan plain `select` columns (raw passthrough from the target row). */
  private planSelectColumns(columns: string[], guard: LeakageGuardEnforcer, schema: FeatureSchemaEntry[], emitters: ColumnEmitter[]): void {
    for (const col of guard.partitionColumns(columns).allowed) {
      schema.push({ Name: col, Kind: 'numeric' });
      emitters.push({ column: col, kind: 'select', sourceColumn: col });
    }
  }

  /** Plan embedding columns: one numeric feature per dimension (`emb_0..emb_{n-1}`). */
  private planEmbeddingColumns(
    step: Extract<FeatureStep, { Kind: 'embedding' }>,
    guard: LeakageGuardEnforcer,
    schema: FeatureSchemaEntry[],
    emitters: ColumnEmitter[],
  ): void {
    for (let i = 0; i < step.Dims; i++) {
      const name = `emb_${i}`;
      if (!guard.isFieldAllowed(name)) {
        continue;
      }
      schema.push({ Name: name, Kind: 'embedding' });
      emitters.push({
        column: name,
        kind: 'embedding',
        embeddingEntity: step.Entity,
        embeddingModelRef: step.EmbeddingModelRef,
        embeddingDim: i,
        embeddingTotalDims: step.Dims,
      });
    }
  }

  /** Plan an llm-derived column read from a persisted, version-pinned attribute. */
  private planLLMDerivedColumns(
    step: Extract<FeatureStep, { Kind: 'llm-derived' }>,
    guard: LeakageGuardEnforcer,
    schema: FeatureSchemaEntry[],
    emitters: ColumnEmitter[],
  ): void {
    const col = step.FeaturePipelineRef;
    if (!guard.isFieldAllowed(col)) {
      return;
    }
    schema.push({ Name: col, Kind: 'llm-derived' });
    // Read the persisted attribute off the target row by its pipeline-ref column name.
    emitters.push({ column: col, kind: 'select', sourceColumn: col });
  }

  /** Plan flow-agent output columns (resolved from persisted attributes for now). */
  private planFlowAgentColumns(
    step: Extract<FeatureStep, { Kind: 'flow-agent' }>,
    guard: LeakageGuardEnforcer,
    schema: FeatureSchemaEntry[],
    emitters: ColumnEmitter[],
  ): void {
    for (const outName of Object.keys(step.OutputMapping)) {
      if (!guard.isFieldAllowed(outName)) {
        continue;
      }
      schema.push({ Name: outName, Kind: 'numeric' });
      // INTEGRATION SEAM (§5.4): for now resolve from a persisted attribute of the
      // same name on the target row. When the live Flow Agent runtime is wired,
      // this emitter would invoke the MJ agent (`step.FlowAgentRef`) per record
      // using `step.InputMapping` and read `step.OutputMapping[outName]` from its
      // output. Persisted-first keeps assembly deterministic (anti-skew, §6.5) and
      // does not block the build on the live agent runtime.
      emitters.push({ column: outName, kind: 'select', sourceColumn: outName });
    }
  }

  /**
   * Build an index of dated rows grouped by target-record primary key, for as-of
   * feature computation. Filtered through the source deny-list.
   */
  private async indexDatedSources(
    params: FeatureAssemblyParams,
    dataAccess: IFeatureDataAccess,
    pkField: string,
    guard: LeakageGuardEnforcer,
  ): Promise<DatedIndex> {
    const index: DatedIndex = new Map();
    for (const ds of params.datedSources ?? []) {
      if (!guard.isSourceAllowed(ds.EntityName)) {
        continue;
      }
      const res = await dataAccess.fetchRows({ EntityName: ds.EntityName });
      if (!res.Success) {
        throw new Error(`Failed to fetch dated source '${ds.EntityName}': ${res.ErrorMessage ?? 'unknown error'}`);
      }
      const bySource = new Map<string, DatedRow[]>();
      for (const row of res.Rows) {
        const fk = row[ds.ForeignKeyField];
        const dateVal = row[ds.DateField];
        if (fk == null || dateVal == null) {
          continue;
        }
        const date = new Date(dateVal as string | number);
        if (Number.isNaN(date.getTime())) {
          continue;
        }
        const key = String(fk);
        const list = bySource.get(key) ?? [];
        list.push({ Date: date, Row: row });
        bySource.set(key, list);
      }
      index.set(ds.EntityName, bySource);
    }
    return index;
  }

  /**
   * Build the matrix rows: for each target record, emit one value per planned
   * column (in schema order), then append the target variable when present.
   */
  private async buildMatrix(
    records: SourceRow[],
    plan: ColumnPlan,
    datedIndex: DatedIndex,
    params: FeatureAssemblyParams,
    dataAccess: IFeatureDataAccess,
    pkField: string,
  ): Promise<MatrixData> {
    const columns = plan.schema.map((s) => s.Name);
    if (params.targetVariable) {
      columns.push(params.targetVariable);
    }

    const rows: Array<Array<string | number | boolean | null>> = [];
    for (const record of records) {
      const recordId = String(record[pkField] ?? '');
      const asOfDate = resolveAsOfDate(params.asOf, record, params.labelEventDates?.[recordId] ?? null);

      const rowValues: Array<string | number | boolean | null> = [];
      for (const emitter of plan.emitters) {
        rowValues.push(await this.emitValue(emitter, record, recordId, asOfDate, datedIndex, dataAccess));
      }
      if (params.targetVariable) {
        rowValues.push(normalizeValue(record[params.targetVariable]));
      }
      rows.push(rowValues);
    }
    return { columns, rows };
  }

  /** Produce the value for a single planned column on a single record. */
  private async emitValue(
    emitter: ColumnEmitter,
    record: SourceRow,
    recordId: string,
    asOfDate: Date | null,
    datedIndex: DatedIndex,
    dataAccess: IFeatureDataAccess,
  ): Promise<string | number | boolean | null> {
    switch (emitter.kind) {
      case 'select':
        return normalizeValue(record[emitter.sourceColumn]);
      case 'embedding': {
        const vector = await dataAccess.fetchEmbedding(emitter.embeddingEntity, recordId, emitter.embeddingModelRef, emitter.embeddingTotalDims);
        // No persisted vector → zero-fill (never regenerate inline; §6.5).
        return vector && emitter.embeddingDim < vector.length ? vector[emitter.embeddingDim] : 0;
      }
      case 'as-of':
        return this.emitAsOfValue(emitter, recordId, asOfDate, datedIndex);
      default:
        return null;
    }
  }

  /** Compute an as-of aggregate for one record from the dated index. */
  private emitAsOfValue(emitter: Extract<ColumnEmitter, { kind: 'as-of' }>, recordId: string, asOfDate: Date | null, datedIndex: DatedIndex): number | null {
    const bySource = datedIndex.get(emitter.datedSource.EntityName);
    const datedRows = bySource?.get(recordId) ?? [];
    switch (emitter.datedFeature.Aggregate) {
      case 'days_since_last_activity':
        return daysSinceLastActivityAsOf(datedRows, asOfDate);
      case 'activity_count':
        return activityCountAsOf(datedRows, asOfDate);
      default:
        return null;
    }
  }
}

/** Internal — the ordered schema + per-column emitters produced by planning. */
interface ColumnPlan {
  schema: FeatureSchemaEntry[];
  emitters: ColumnEmitter[];
}

/** Internal — a per-record value producer for one matrix column. */
type ColumnEmitter =
  | { column: string; kind: 'select'; sourceColumn: string }
  | {
      column: string;
      kind: 'embedding';
      embeddingEntity: string;
      embeddingModelRef: string;
      embeddingDim: number;
      embeddingTotalDims: number;
    }
  | {
      column: string;
      kind: 'as-of';
      datedSource: DatedSourceSpec;
      datedFeature: DatedFeatureSpec;
    };

/** Internal — dated rows indexed by source entity → record PK → rows. */
type DatedIndex = Map<string, Map<string, DatedRow[]>>;

/** Coerce a loose source value into a matrix cell value. */
function normalizeValue(value: unknown): string | number | boolean | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

// Re-export the feature-kind type so consumers don't reach into core for it here.
export type { FeatureKind };
