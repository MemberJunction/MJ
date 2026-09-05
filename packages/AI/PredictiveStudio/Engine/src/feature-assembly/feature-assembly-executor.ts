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

import type { AIPromptParams } from '@memberjunction/ai-core-plus';
import type { ActionFeatureStep, VisionLLMFeatureStep } from '@memberjunction/predictive-studio-core';
import type { AsOfAggregateKind, AsOfWindowSpec } from '@memberjunction/predictive-studio-core';

import { type IFeatureDataAccess, RunViewDataAccess, type SourceRow } from './data-access';
import { type DatedRow, resolveAsOfDate, daysSinceLastActivityAsOf, activityCountAsOf, aggregateAsOf, filterAsOf, filterWindow } from './as-of';
import { LeakageGuardEnforcer } from './leakage-guard';
import { VisionFeatureExtractor, type IVisionPromptRunner } from './vision-llm';
import {
  ActionFeatureExtractor,
  type ActionFeatureTarget,
  type IActionApprovalCheck,
  type IActionRunner,
} from './action-feature';
import { MJActionApprovalCheck, MJActionRunner } from './action-feature-seam';
import { buildVisionPromptResolver, MJVisionPromptRunner } from './vision-llm-seam';
import {
  ForecastFeatureExtractor,
  forecastColumnNames,
  type ForecastFeatureValues,
  type ForecastStep,
  type ForecastTarget,
  type IForecastRunner,
} from './forecast-feature';
import { SidecarForecastRunner } from './forecast-seam';

/**
 * Resolves a {@link VisionLLMFeatureStep}'s `Prompt` (id/name/inline) into the
 * prompt entity the injected runner executes. Supplied by the caller so the
 * executor stays decoupled from `MJ: AI Prompts` loading; tests provide a stub.
 *
 * @param step the vision-llm step whose prompt to resolve
 * @returns the prompt entity to run
 */
export type VisionPromptResolver = (step: VisionLLMFeatureStep) => Promise<AIPromptParams['prompt']> | AIPromptParams['prompt'];

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
  /**
   * The point-in-time aggregate to compute over the surviving (pre-decision) rows — the widened
   * Sonar-ported vocabulary ({@link AsOfAggregateKind}), plus the legacy two-kind spelling kept
   * as aliases (`days_since_last_activity` = `recency`, `activity_count` = `count`).
   */
  Aggregate: AsOfAggregateKind | 'days_since_last_activity' | 'activity_count';
  /** Value column on the dated source for `sum`/`avg`/`min`/`max`/`distinct_count`. */
  Field?: string;
  /** Time window relative to the as-of date; absent = AllTime (today's behavior, unchanged). */
  Window?: AsOfWindowSpec;
  /**
   * Also emit `<OutputColumn>__present` (1 when any row survives the window, else 0) — the
   * `hadData` mask distinguishing a real zero from absence, so a missing-data policy can treat
   * "no rows" differently from "zero activity". Ported from Sonar's `FactorResult.hadData`.
   */
  EmitPresence?: boolean;
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
  /**
   * Optional injected prompt-runner seam for `vision-llm` steps (plan §11). When
   * a pipeline contains a `vision-llm` step, this is REQUIRED — unit tests mock
   * it so the step assembles without a live model. When omitted, vision steps
   * yield null feature values (no model call).
   */
  visionRunner?: IVisionPromptRunner | null;
  /**
   * Forecast seam for `forecast` steps. Omitted ⇒ the real sidecar-backed runner; `null` ⇒
   * forecasting is OFF and every forecast column is null (used by tests and by hosts that have
   * not staged the model weights).
   */
  forecastRunner?: IForecastRunner | null;
  /**
   * Optional resolver turning a `vision-llm` step's `Prompt` reference into the
   * prompt entity the runner executes. Required alongside {@link visionRunner}
   * when vision steps are present.
   */
  visionPromptResolver?: VisionPromptResolver | null;
  /**
   * Optional overrides for `action` steps (code-as-a-feature). Both default to the real MJ Action
   * engine, so an action step works with no wiring; tests inject fakes to assemble with no Action
   * engine and no database.
   */
  actionRunner?: IActionRunner;
  /** @see actionRunner */
  actionApprovals?: IActionApprovalCheck;
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

/**
 * Batch size for the `FK IN (...)` scoping filter on a dated source. Small enough that the
 * generated predicate stays well inside SQL Server's expression limits, large enough that a
 * 100k-record population is a few hundred reads rather than 100k.
 */
const DATED_SOURCE_ID_BATCH = 250;

/**
 * Row ceiling for an unbounded target-record read. Reaching it is treated as truncation rather
 * than trusted as the complete population (see {@link FeatureAssemblyExecutor.resolveRecords}).
 */
const TARGET_RECORD_ROW_CAP = 250000;

/**
 * Row ceiling requested per dated-source batch. Hitting it exactly is treated as truncation
 * (see {@link fetchDatedRowsForTargets}) rather than trusted as a complete read.
 */
const DATED_SOURCE_ROW_CAP = 50000;

/** The distinct primary keys of the target records, as strings. */
function collectTargetIds(records: SourceRow[], pkField: string): string[] {
  const ids = new Set<string>();
  for (const record of records) {
    const raw = record[pkField];
    if (raw != null) ids.add(String(raw));
  }
  return [...ids];
}

/** SQL string literal, single quotes escaped. */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Fetch the dated rows belonging to the target records.
 *
 * Two things this must not do, both of which it previously did:
 *
 * 1. **Fetch the entire dated entity.** An unfiltered read of an activity/transaction table is
 *    unbounded work that grows with the tenant, not with the population being assembled.
 * 2. **Accept a truncated read.** The fetch carried no `MaxRows`, so it inherited RunView's
 *    default page size. Every dated row past that page simply did not exist as far as assembly
 *    was concerned, and each affected record's as-of aggregates silently became `0` — not null,
 *    not an error, but a fabricated zero indistinguishable from "no activity". A model trained on
 *    that learns from mostly-invented data and still reports a plausible-looking metric. Observed
 *    directly: a 13,528-row activity table read back 1,000 rows, leaving 86% of records with a
 *    fabricated `count = 0` and collapsing holdout AUC toward chance.
 *
 * So: scope by foreign key in batches, and if a batch comes back at the cap — where a complete
 * read and a truncated one are indistinguishable — halve it and retry rather than guessing,
 * failing loudly only when a single record's own history cannot fit.
 */
async function fetchDatedRowsForTargets(
  dataAccess: IFeatureDataAccess,
  ds: DatedSourceSpec,
  targetIds: string[],
): Promise<SourceRow[]> {
  if (targetIds.length === 0) return [];
  const out: SourceRow[] = [];
  for (let i = 0; i < targetIds.length; i += DATED_SOURCE_ID_BATCH) {
    out.push(...(await fetchDatedBatch(dataAccess, ds, targetIds.slice(i, i + DATED_SOURCE_ID_BATCH))));
  }
  return out;
}

/**
 * Fetch one batch, halving and retrying when the read comes back at the cap.
 *
 * A fixed batch size cannot be right for every source: the same 250 records are a few hundred rows
 * in a sparse activity table and tens of thousands in a dense one (two years of weekly history is
 * ~300 rows per record, so 250 records is ~75,000 — over the cap on its own). Splitting adapts to
 * whatever the data turns out to be, while preserving the property that matters: a read that MIGHT
 * be truncated is never accepted, because a truncated read silently becomes as-of aggregates of 0.
 *
 * The recursion bottoms out at a single record. If one record's own history exceeds the cap, the
 * read genuinely cannot be split further through this seam, and that fails loudly.
 */
async function fetchDatedBatch(
  dataAccess: IFeatureDataAccess,
  ds: DatedSourceSpec,
  batch: string[],
): Promise<SourceRow[]> {
  const res = await dataAccess.fetchRows({
    EntityName: ds.EntityName,
    ExtraFilter: `${ds.ForeignKeyField} IN (${batch.map(sqlLiteral).join(',')})`,
    MaxRows: DATED_SOURCE_ROW_CAP,
  });
  if (!res.Success) {
    throw new Error(`Failed to fetch dated source '${ds.EntityName}': ${res.ErrorMessage ?? 'unknown error'}`);
  }
  if (res.Rows.length < DATED_SOURCE_ROW_CAP) {
    return res.Rows;
  }
  if (batch.length === 1) {
    throw new Error(
      `Dated source '${ds.EntityName}' returned ${res.Rows.length} rows for a SINGLE target record, hitting the ` +
        `${DATED_SOURCE_ROW_CAP}-row read cap, so the read may be truncated and cannot be split further. A ` +
        `truncated read would silently turn missing history into as-of aggregates of 0 — indistinguishable from ` +
        `genuine inactivity. Narrow the dated source with a filter or a shorter window.`,
    );
  }
  const mid = Math.ceil(batch.length / 2);
  return [
    ...(await fetchDatedBatch(dataAccess, ds, batch.slice(0, mid))),
    ...(await fetchDatedBatch(dataAccess, ds, batch.slice(mid))),
  ];
}

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
    let records = await this.resolveRecords(params, dataAccess);

    // 2. Partition steps: data-assembly produce columns; preprocessing → ops.
    const { dataSteps, preprocessing } = this.partitionSteps(params.steps, guard);

    // 3. Build the ordered RAW column plan (schema) from the data-assembly steps.
    const columnPlan = await this.buildColumnPlan(dataSteps, params, guard, dataAccess);

    // 3a. ANTI-SKEW (the train/serve parity guarantee). On-demand/scheduled scoring receives its
    //     target records from an upstream scope that may have loaded them with a NARROW field
    //     projection — dropping virtual/denormalized columns (e.g. a `MembershipType` value-list field
    //     joined into the entity view but absent from the base table). The model trained on those
    //     columns, so missing them at score time silently degrades every prediction toward a constant.
    //     Re-read ONLY the absent required columns from the SAME entity view the training path reads,
    //     then HARD-FAIL if any are still missing. This is the single seam where skew could enter, so
    //     it's the single seam we close — symmetrically, for train / materialize / on-demand alike.
    records = await this.hydrateMissingFeatureColumns(records, columnPlan, params, dataAccess, pkField);
    this.assertRequiredColumnsPresent(records, columnPlan, params);

    // 4. Pre-index dated sources by record for as-of features.
    const datedIndex = await this.indexDatedSources(records, params, dataAccess, pkField, guard);

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
    // A caller-supplied MaxRows is a deliberate sample and is honored as-is. NO MaxRows means
    // "the whole population" — but leaving it undefined inherits RunView's default page size, so
    // the population was quietly halved (observed: 2,000 members, 1,000 assembled) and the model
    // trained on whatever the first page happened to contain, reporting metrics as if it had seen
    // everything. Request an explicit ceiling and treat reaching it as truncation.
    const explicitCap = params.recordSet.MaxRows;
    const res = await dataAccess.fetchRows({
      EntityName: params.recordSet.EntityName,
      ExtraFilter: params.recordSet.ExtraFilter,
      OrderBy: params.recordSet.OrderBy,
      MaxRows: explicitCap ?? TARGET_RECORD_ROW_CAP,
    });
    if (!res.Success) {
      throw new Error(`Failed to fetch target records: ${res.ErrorMessage ?? 'unknown error'}`);
    }
    if (explicitCap === undefined && res.Rows.length >= TARGET_RECORD_ROW_CAP) {
      throw new Error(
        `Target record set '${params.recordSet.EntityName}' returned ${res.Rows.length} rows, hitting the ` +
          `${TARGET_RECORD_ROW_CAP}-row read cap, so the population may be truncated. Training on a silently ` +
          `truncated population reports metrics for a sample while claiming the whole. Narrow the record set ` +
          `with a filter, or set an explicit MaxRows to declare the sample deliberate.`,
      );
    }
    return res.Rows;
  }

  /**
   * The RAW columns that must be present on every record because the matrix reads them
   * directly off the row (the `select`-emitter source columns — which also cover the
   * `llm-derived` / `flow-agent` persisted-attribute reads — plus the train-time target
   * variable). Embedding / as-of / vision values are fetched or computed, not row-read, so
   * they are deliberately excluded.
   */
  private requiredRowColumns(plan: ColumnPlan, params: FeatureAssemblyParams): string[] {
    const cols = new Set<string>();
    for (const e of plan.emitters) {
      if (e.kind === 'select') {
        cols.add(e.sourceColumn);
      }
    }
    if (params.targetVariable) {
      cols.add(params.targetVariable);
    }
    // AsOfStrategy 'column' mode reads its cutoff date off each record — a narrow
    // scope projection that drops it fails every record at resolveAsOfDate, so it
    // must be hydrated (and asserted) exactly like a feature column.
    if (params.asOf?.Mode === 'column' && params.asOf.Column) {
      cols.add(params.asOf.Column);
    }
    return [...cols];
  }

  /**
   * Fill in any required raw column the resolved records are MISSING, by re-reading just those
   * columns from the same entity view the training path reads (`dataAccess.fetchRows`), keyed by
   * primary key. Columns already present are left untouched — so a complete record set (training,
   * a full `entity_object` load, unit-test fixtures) incurs no second read and no blob tax; only
   * the on-demand narrow-projection case pays for the re-read, and only for the dropped columns.
   * Returns a new row array when anything was hydrated (non-mutating), else the original array.
   */
  private async hydrateMissingFeatureColumns(
    records: SourceRow[],
    plan: ColumnPlan,
    params: FeatureAssemblyParams,
    dataAccess: IFeatureDataAccess,
    pkField: string,
  ): Promise<SourceRow[]> {
    if (records.length === 0) {
      return records;
    }
    const required = this.requiredRowColumns(plan, params);
    const missing = required.filter((col) => records.some((r) => !(col in r)));
    if (missing.length === 0) {
      return records;
    }
    const ids = records.map((r) => String(r[pkField] ?? '')).filter((id) => id.length > 0);
    if (ids.length === 0) {
      return records; // no keys to re-read by — the guardrail will surface the absent columns
    }
    const inList = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
    const res = await dataAccess.fetchRows({
      EntityName: params.targetEntityName,
      ExtraFilter: `${pkField} IN (${inList})`,
      Fields: [pkField, ...missing],
      MaxRows: ids.length,
    });
    if (!res.Success) {
      return records; // re-read failed — let the guardrail throw with a precise, actionable message
    }
    const byId = new Map(res.Rows.map((row) => [String(row[pkField] ?? ''), row]));
    return records.map((r) => {
      const fresh = byId.get(String(r[pkField] ?? ''));
      if (!fresh) {
        return r;
      }
      const merged: SourceRow = { ...r };
      for (const col of missing) {
        if (col in fresh) {
          merged[col] = fresh[col];
        }
      }
      return merged;
    });
  }

  /**
   * HARD FAIL when a required raw feature column is absent from the records after hydration. A
   * model executing without a column it was trained on would silently produce degenerate (often
   * constant) predictions — the most dangerous class of train/serve skew, because it looks like it
   * succeeded. We refuse to assemble: the caller (e.g. {@link MLModelInferenceProcessor}) catches
   * this and marks the run **Failed** with this message, which bubbles to the run history + UI. This
   * also guards TRAINING — a pipeline declaring a column the entity view doesn't expose fails loudly
   * up front rather than producing a no-signal model.
   */
  private assertRequiredColumnsPresent(records: SourceRow[], plan: ColumnPlan, params: FeatureAssemblyParams): void {
    if (records.length === 0) {
      return;
    }
    const required = this.requiredRowColumns(plan, params);
    const absent = required.filter((col) => records.some((r) => !(col in r)));
    if (absent.length > 0) {
      throw new Error(
        `FeatureAssembly: required feature column(s) [${absent.join(', ')}] are absent from the ` +
          `assembly input for entity '${params.targetEntityName}'. The model was trained on these ` +
          `columns but they were not available at score time — most often a narrow field projection ` +
          `that dropped a virtual/denormalized column. Scoring is refused to avoid silently producing ` +
          `degenerate predictions.`,
      );
    }
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
        case 'vision-llm':
        case 'action':
        case 'forecast':
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
        // Bin count travels in the recipe via the dedicated `bins` field; the
        // sidecar's `_fit_bin` reads `op.get("bins")` and fits the edges.
        return { op: 'bin', col: step.Column, bins: step.Bins };
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
        case 'vision-llm':
          // §11/§5.6: per-row, stateless vision extraction → one RAW feature column.
          this.planVisionLLMColumn(step, guard, schema, emitters);
          break;
        case 'forecast':
          // A time-series foundation model as a feature extractor: four RAW numeric columns
          // (p50/p10/p90/slope) from the record's own history, cut at the as-of date.
          this.planForecastColumns(step, guard, schema, emitters);
          break;
        case 'action':
          // Donation item 8: code as a feature — one RAW numeric column, computed by running an
          // approved MJ Action once per record.
          this.planActionColumn(step, guard, schema, emitters);
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
        if (f.EmitPresence) {
          const presenceColumn = `${f.OutputColumn}__present`;
          // Typed `presence`, not `numeric`: a mask's 0 means "we never knew", where a numeric 0
          // means "we measured zero". Downstream — the rubric's MissingDataPolicy, the materializer's
          // binding Meaning, the story tagger — all have to be able to tell those apart.
          schema.push({ Name: presenceColumn, Kind: 'presence' });
          emitters.push({ column: presenceColumn, kind: 'as-of', datedSource: ds, datedFeature: f, presence: true });
        }
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
   * Plan a `vision-llm` column (plan §11/§5.6). Produces one RAW feature column
   * named by the step's `Output.FeatureName`. The feature is derived from the
   * row's OWN image, so the leakage guard ALLOWS it (it's a property of the
   * record, not a future-label proxy); the output name is still passed through
   * the guard so an operator can deny-list a specific vision feature if it proves
   * leaky post-train.
   */
  private planVisionLLMColumn(
    step: Extract<FeatureStep, { Kind: 'vision-llm' }>,
    guard: LeakageGuardEnforcer,
    schema: FeatureSchemaEntry[],
    emitters: ColumnEmitter[],
  ): void {
    const col = step.Output.FeatureName;
    if (!guard.isFieldAllowed(col)) {
      return;
    }
    // Scalar → numeric matrix column; category → categorical (raw label, typically
    // one-hot encoded by a downstream preprocessing step).
    schema.push({ Name: col, Kind: step.Output.Kind === 'scalar' ? 'numeric' : 'categorical' });
    emitters.push({ column: col, kind: 'vision-llm', step });
  }

  /**
   * Plan an `action` column. Always numeric — an Action-backed feature contributes a number or
   * nothing, and "nothing" stays null so the missing-data policy handles it rather than a hard 0.
   *
   * The output name goes through the leakage guard like any other, so an operator can deny-list a
   * code feature that turns out to reach forward in time.
   */
  /**
   * Plan the four columns a `forecast` step emits. Marked `Kind: 'forecast'` rather than
   * `'numeric'` so the component materializer can type them as Forecast inputs — a numeric kind
   * would say nothing about where the value came from.
   */
  private planForecastColumns(
    step: ForecastStep,
    guard: LeakageGuardEnforcer,
    schema: FeatureSchemaEntry[],
    emitters: ColumnEmitter[],
  ): void {
    if (!guard.isSourceAllowed(step.SourceEntity)) {
      return;
    }
    for (const [index, col] of forecastColumnNames(step).entries()) {
      if (!guard.isFieldAllowed(col)) continue;
      schema.push({ Name: col, Kind: 'forecast' });
      emitters.push({ column: col, kind: 'forecast', step, part: index });
    }
  }

  private planActionColumn(
    step: Extract<FeatureStep, { Kind: 'action' }>,
    guard: LeakageGuardEnforcer,
    schema: FeatureSchemaEntry[],
    emitters: ColumnEmitter[],
  ): void {
    const col = step.FeatureName;
    if (!guard.isFieldAllowed(col)) {
      return;
    }
    schema.push({ Name: col, Kind: 'numeric' });
    emitters.push({ column: col, kind: 'action', step });
  }

  /**
   * Build an index of dated rows grouped by target-record primary key, for as-of
   * feature computation. Filtered through the source deny-list.
   */
  private async indexDatedSources(
    records: SourceRow[],
    params: FeatureAssemblyParams,
    dataAccess: IFeatureDataAccess,
    pkField: string,
    guard: LeakageGuardEnforcer,
  ): Promise<DatedIndex> {
    const index: DatedIndex = new Map();
    const targetIds = collectTargetIds(records, pkField);
    for (const ds of params.datedSources ?? []) {
      if (!guard.isSourceAllowed(ds.EntityName)) {
        continue;
      }
      const rows = await fetchDatedRowsForTargets(dataAccess, ds, targetIds);
      const bySource = new Map<string, DatedRow[]>();
      for (const row of rows) {
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

    // Vision extraction context — built once, only when a vision runner is wired.
    const vision = this.buildVisionContext(params);
    // Action features run BEFORE the row loop: one bounded fan-out per step over the whole
    // population, rather than a serial call per record inside the emitter loop.
    const actionValues = await this.runActionFeatures(plan, records, params, pkField);
    const forecastValues = await this.runForecastFeatures(plan, records, params, pkField, datedIndex);

    const rows: Array<Array<string | number | boolean | null>> = [];
    for (const record of records) {
      const recordId = String(record[pkField] ?? '');
      const asOfDate = resolveAsOfDate(params.asOf, record, params.labelEventDates?.[recordId] ?? null);

      const rowValues: Array<string | number | boolean | null> = [];
      for (const emitter of plan.emitters) {
        rowValues.push(await this.emitValue(emitter, record, recordId, asOfDate, datedIndex, dataAccess, vision, actionValues, forecastValues));
      }
      if (params.targetVariable) {
        rowValues.push(normalizeValue(record[params.targetVariable]));
      }
      rows.push(rowValues);
    }
    return { columns, rows };
  }

  /**
   * Build the vision-extraction context (extractor + prompt resolver) once per
   * assembly when a `visionRunner` is supplied. Returns `null` when no runner is
   * wired — vision emitters then yield null (no model call).
   */
  private buildVisionContext(params: FeatureAssemblyParams): VisionContext | null {
    // Tri-state, like the story runner: `undefined` ⇒ the real runner, an injected value ⇒ that one,
    // an explicit `null` ⇒ vision is off for this assembly.
    if (params.visionRunner === null) {
      return null;
    }
    const resolver =
      params.visionPromptResolver === null
        ? undefined
        : (params.visionPromptResolver ?? buildVisionPromptResolver(params.contextUser, params.provider));
    return {
      extractor: new VisionFeatureExtractor(params.visionRunner ?? new MJVisionPromptRunner(), params.contextUser),
      resolver,
      promptCache: new Map<string, AIPromptParams['prompt']>(),
    };
  }

  /**
   * Run every `action` step across the population, once, before the row loop.
   *
   * A configuration failure (unapproved Action, missing Action, bad params) PROPAGATES and fails
   * the assembly. That is deliberate: it is wrong for every record, and degrading to nulls would
   * train a model on a feature that silently is not there.
   */

  /**
   * Run every `forecast` step over the whole population, one batched sidecar call per step.
   *
   * Batched because the model costs seconds per series on CPU: a per-row call over a few thousand
   * records would be hours, which is the difference between a usable feature and an unusable one.
   */
  private async runForecastFeatures(
    plan: { emitters: ColumnEmitter[] },
    records: SourceRow[],
    params: FeatureAssemblyParams,
    pkField: string,
    datedIndex: DatedIndex,
  ): Promise<Map<string, Map<string, ForecastFeatureValues>>> {
    const byStep = new Map<string, Map<string, ForecastFeatureValues>>();
    // One emitter per COLUMN, but one call per STEP — dedupe by step id.
    const steps = new Map<string, ForecastStep>();
    for (const e of plan.emitters) {
      if (e.kind === 'forecast') steps.set(e.step.Id, e.step);
    }
    // `null` is an explicit "forecasting is off"; `undefined` means "use the real runner".
    if (steps.size === 0 || params.forecastRunner === null) {
      return byStep;
    }
    const extractor = new ForecastFeatureExtractor(
      params.forecastRunner ?? SidecarForecastRunner.Instance,
      params.contextUser,
    );
    for (const step of steps.values()) {
      const bySource = datedIndex.get(step.SourceEntity);
      const targets: ForecastTarget[] = records.map((record) => {
        const recordId = String(record[pkField] ?? '');
        return {
          recordId,
          asOf: resolveAsOfDate(params.asOf, record, params.labelEventDates?.[recordId] ?? null),
          rows: bySource?.get(recordId) ?? [],
        };
      });
      byStep.set(step.Id, await extractor.extract(step, targets));
    }
    return byStep;
  }

  private async runActionFeatures(
    plan: { emitters: ColumnEmitter[] },
    records: SourceRow[],
    params: FeatureAssemblyParams,
    pkField: string,
  ): Promise<Map<string, Map<string, number | null>>> {
    const steps = plan.emitters.filter((e): e is Extract<ColumnEmitter, { kind: 'action' }> => e.kind === 'action');
    const byStep = new Map<string, Map<string, number | null>>();
    if (steps.length === 0) {
      return byStep;
    }
    const extractor = new ActionFeatureExtractor(
      params.actionRunner ?? new MJActionRunner(),
      params.actionApprovals ?? new MJActionApprovalCheck(),
      params.contextUser,
    );
    const targets: ActionFeatureTarget[] = records.map((record) => {
      const recordId = String(record[pkField] ?? '');
      return { recordId, asOf: resolveAsOfDate(params.asOf, record, params.labelEventDates?.[recordId] ?? null) };
    });
    for (const emitter of steps) {
      byStep.set(emitter.step.Id, await extractor.extract(emitter.step, targets));
    }
    return byStep;
  }

  /** Produce the value for a single planned column on a single record. */
  private async emitValue(
    emitter: ColumnEmitter,
    record: SourceRow,
    recordId: string,
    asOfDate: Date | null,
    datedIndex: DatedIndex,
    dataAccess: IFeatureDataAccess,
    vision: VisionContext | null,
    actionValues: Map<string, Map<string, number | null>>,
    forecastValues: Map<string, Map<string, ForecastFeatureValues>>,
  ): Promise<string | number | boolean | null> {
    switch (emitter.kind) {
      case 'select':
        return normalizeValue(record[emitter.sourceColumn]);
      case 'vision-llm':
        return this.emitVisionValue(emitter.step, record, vision);
      case 'action':
        // Precomputed above; a record with no entry had no value, which stays null.
        return actionValues.get(emitter.step.Id)?.get(recordId) ?? null;
      case 'forecast': {
        // Precomputed in one batched sidecar call; a record whose series was too short to forecast
        // has no entry, and null is the honest answer rather than an invented band.
        const values = forecastValues.get(emitter.step.Id)?.get(recordId);
        if (!values) return null;
        return [values.P50, values.P10, values.P90, values.Slope][emitter.part] ?? null;
      }
      case 'embedding': {
        const vector = await dataAccess.fetchEmbedding(emitter.embeddingEntity, recordId, emitter.embeddingModelRef, emitter.embeddingTotalDims);
        // No persisted vector → zero-fill (never regenerate inline; §6.5).
        return vector && emitter.embeddingDim < vector.length ? vector[emitter.embeddingDim] : 0;
      }
      case 'as-of':
        return this.emitAsOfValue(emitter, record, recordId, asOfDate, datedIndex);
      default:
        return null;
    }
  }

  /**
   * Compute an as-of aggregate (or its presence mask) for one record from the dated index. The
   * rows are as-of filtered FIRST (the leakage boundary), then windowed, then aggregated — the
   * widened Sonar-ported vocabulary; the legacy two-kind spelling stays as aliases so existing
   * pipelines assemble byte-identically.
   */
  private emitAsOfValue(
    emitter: Extract<ColumnEmitter, { kind: 'as-of' }>,
    record: SourceRow,
    recordId: string,
    asOfDate: Date | null,
    datedIndex: DatedIndex,
  ): number | null {
    const bySource = datedIndex.get(emitter.datedSource.EntityName);
    const surviving = filterAsOf(bySource?.get(recordId) ?? [], asOfDate);
    const spec = emitter.datedFeature;
    if (emitter.presence) {
      return filterWindow(surviving, spec.Window ?? null, asOfDate, record).length > 0 ? 1 : 0;
    }
    switch (spec.Aggregate) {
      case 'days_since_last_activity': // legacy alias of 'recency'
        return spec.Window
          ? aggregateAsOf(surviving, 'recency', spec.Field, spec.Window, asOfDate, record)
          : daysSinceLastActivityAsOf(surviving, asOfDate);
      case 'activity_count': // legacy alias of 'count'
        return spec.Window
          ? aggregateAsOf(surviving, 'count', spec.Field, spec.Window, asOfDate, record)
          : activityCountAsOf(surviving, asOfDate);
      default:
        return aggregateAsOf(surviving, spec.Aggregate, spec.Field, spec.Window ?? null, asOfDate, record);
    }
  }

  /**
   * Emit a `vision-llm` feature value for one record (plan §11). Resolves the
   * step's prompt (memoized per step) and runs the per-row extractor over the
   * row's OWN image.
   *
   * The runner and resolver now DEFAULT to the real ones, so a vision step works with no wiring.
   * They were caller-injected with no default and nobody ever supplied them, which meant every
   * vision feature quietly evaluated to null for every record — a model trained on one looked
   * completely normal. A step whose prompt cannot be resolved now throws
   * (`VisionPromptConfigError`) rather than nulling the column, for the same reason.
   */
  private async emitVisionValue(
    step: VisionLLMFeatureStep,
    record: SourceRow,
    vision: VisionContext | null,
  ): Promise<string | number | null> {
    if (!vision || !vision.resolver) {
      // Vision was explicitly turned off for this assembly (`visionRunner: null`). Every other
      // path now has a real runner by default, so this is a deliberate opt-out, not the accident
      // it used to be — the step still yields null rather than failing the whole matrix.
      return null;
    }
    const prompt = await this.resolveVisionPrompt(step, vision);
    const { value } = await vision.extractor.extract(step, record, prompt);
    return value;
  }

  /** Resolve (and memoize) the prompt entity for a vision step via the injected resolver. */
  private async resolveVisionPrompt(step: VisionLLMFeatureStep, vision: VisionContext): Promise<AIPromptParams['prompt']> {
    const cached = vision.promptCache.get(step.Id);
    if (cached) {
      return cached;
    }
    const resolved = await vision.resolver!(step);
    vision.promptCache.set(step.Id, resolved);
    return resolved;
  }
}

/** Internal — per-assembly vision-extraction context (built once when a runner is wired). */
interface VisionContext {
  extractor: VisionFeatureExtractor;
  resolver?: VisionPromptResolver;
  promptCache: Map<string, AIPromptParams['prompt']>;
}

/** Internal — the ordered schema + per-column emitters produced by planning. */
interface ColumnPlan {
  schema: FeatureSchemaEntry[];
  emitters: ColumnEmitter[];
}

/** Internal — a per-record value producer for one matrix column. */
type ColumnEmitter =
  | { column: string; kind: 'select'; sourceColumn: string }
  | { column: string; kind: 'vision-llm'; step: VisionLLMFeatureStep }
  | { column: string; kind: 'action'; step: ActionFeatureStep }
  // `part` indexes forecastColumnNames(): 0=p50, 1=p10, 2=p90, 3=slope.
  | { column: string; kind: 'forecast'; step: ForecastStep; part: number }
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
      /** When set, emit the presence mask (1 = any row survived the window) instead of the value. */
      presence?: boolean;
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
