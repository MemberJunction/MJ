/**
 * Runs the data quality phase: takes measurements, keeps them resumable in
 * `state.phases.dataQuality`, and derives findings into `state.dataQuality`.
 *
 * The orchestrator calls three entry points:
 * 1. {@link DataQualityRunner.RunMeasurementPass} after relationship discovery: corrects row
 *    counts, probes tables, and probes the relationships known so far.
 * 2. {@link DataQualityRunner.RunRelationshipPass} after descriptions: probes the relationships the
 *    model proposed during the description loop, so pruning sees their orphan rates.
 * 3. {@link DataQualityRunner.DeriveAndStore} after pruning: the final findings.
 *
 * Nothing here throws for a database problem: a failed probe is recorded with a value-free reason
 * and the phase becomes `partial`.
 */

import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import type { DataQualityConfig } from '../types/config.js';
import type {
  ColumnMeasure,
  DataQualityFinding,
  DataQualityPhase,
  DataQualitySeverity,
  RelationshipProbeResult,
  TableQualityProbeResult,
} from '../types/data-quality.js';
import type { DatabaseDocumentation, TableDefinition } from '../types/state.js';
import { ResolveDataQualityConfig, type ResolvedDataQualityConfig } from './DataQualityConfig.js';
import { CreateRuleContext, DeriveFindings, DeriveTableFindings, ExactRowCount, type RuleContext } from './DataQualityRules.js';
import { FetchExactDistribution, ProbeRelationships, ProbeTable } from './ProbeExecutor.js';
import { DuplicateCountIsApproximate, PlanRelationshipProbes, PlanTableProbe, type PlannedRelationshipProbe } from './ProbePlanner.js';
import { FindTable } from './Relationships.js';

/** How often (in tables) the measurement pass saves state, so an interrupted run resumes close to where it stopped. */
const CHECKPOINT_INTERVAL = 25;
/** Most spellings fetched for a column whose probe found variants. */
const EXACT_DISTRIBUTION_LIMIT = 200;

export interface DataQualityRunnerOptions {
  Driver: BaseAutoDocDriver;
  OnProgress?: (message: string, data?: Record<string, unknown>) => void;
  /** `--skip-data-quality`: take no new measurements and derive no findings. */
  SkipRequested?: boolean;
  /** Saves state; called at checkpoints. */
  Save?: () => Promise<void>;
  /** The clock, for FutureDate. Defaults to now. */
  Now?: () => Date;
}

export class DataQualityRunner {
  private readonly config: ResolvedDataQualityConfig;
  private readonly options: DataQualityRunnerOptions;

  constructor(config: DataQualityConfig | undefined, options: DataQualityRunnerOptions) {
    this.config = ResolveDataQualityConfig(config);
    this.options = options;
  }

  /** The resolved configuration this runner uses. */
  public get Config(): ResolvedDataQualityConfig {
    return this.config;
  }

  /** False when the run opted out (config or flag), or an earlier run that produced this state did. */
  public IsActive(state: DatabaseDocumentation): boolean {
    if (!this.config.Enabled || this.options.SkipRequested) return false;
    return state.phases.dataQuality?.Status !== 'skipped';
  }

  /** Correct row counts, probe tables and the relationships known so far. */
  public async RunMeasurementPass(state: DatabaseDocumentation): Promise<void> {
    if (!this.config.Enabled || this.options.SkipRequested) {
      if (!state.phases.dataQuality) {
        state.phases.dataQuality = this.newPhase(state, 'skipped');
        this.progress('Data quality skipped', { reason: this.config.Enabled ? 'skip-data-quality flag' : 'analysis.dataQuality.enabled is false' });
      } else {
        this.progress('Data quality: no new measurements (skipped for this run)');
      }
      return;
    }
    const existing = state.phases.dataQuality;
    if (existing?.Status === 'skipped') {
      this.progress('Data quality: skipped by the run that produced this state');
      return;
    }

    const phase = existing ?? this.newPhase(state, 'completed');
    phase.Status = 'completed';
    phase.ProbesEnabled = this.config.Probes;
    phase.TotalTables = countTables(state);
    state.phases.dataQuality = phase;
    NormalizeNullPercentages(state);
    CorrectRowCounts(state);

    if (!this.config.Probes) {
      phase.CompletedAt = new Date().toISOString();
      this.progress('Data quality: probes off, statistics and catalog checks only');
      return;
    }

    const context = this.context(state);
    const started = Date.now();
    const deadline = this.config.MaxPhaseDurationMs > 0 ? started + this.config.MaxPhaseDurationMs : Number.POSITIVE_INFINITY;
    const work = this.tablesToProbe(context, phase);
    let done = 0;
    for (const item of work) {
      done++;
      const key = `${item.SchemaName}.${item.Table.name}`;
      if (Date.now() > deadline) {
        phase.TableProbes[key] = skippedProbe('the phase reached maxPhaseDurationMs');
        continue;
      }
      const estimate = ExactRowCount(item.Table) ?? item.Table.rowCount;
      if (this.config.MaxRowsForProbe > 0 && estimate > this.config.MaxRowsForProbe) {
        phase.TableProbes[key] = skippedProbe('rows above maxRowsForProbe');
        continue;
      }
      this.progress(`Data quality: probing [${done}/${work.length}] ${key}`);
      phase.TableProbes[key] = await this.probeTable(context, item.SchemaName, item.Table);
      if (done % CHECKPOINT_INTERVAL === 0) {
        this.updateCounts(phase);
        await this.options.Save?.();
      }
    }
    CorrectRowCounts(state);

    await this.probeRelationships(context, phase, deadline);
    phase.ProbeDurationMs += Date.now() - started;
    this.updateCounts(phase);
    phase.CompletedAt = new Date().toISOString();
    this.progress('Data quality measurement pass complete', {
      tablesProbed: phase.TablesProbed,
      tablesSkipped: phase.TablesSkipped,
      tablesFailed: phase.TablesFailed,
      relationshipsProbed: phase.RelationshipsProbed,
      durationMs: Date.now() - started,
    });
  }

  /** Probe relationships added since the measurement pass (keys the model proposed). */
  public async RunRelationshipPass(state: DatabaseDocumentation): Promise<void> {
    const phase = state.phases.dataQuality;
    if (!this.IsActive(state) || !phase || !this.config.Probes) return;
    const started = Date.now();
    const before = phase.RelationshipsProbed + phase.RelationshipsFailed;
    await this.probeRelationships(this.context(state), phase, Number.POSITIVE_INFINITY);
    phase.ProbeDurationMs += Date.now() - started;
    this.updateCounts(phase);
    const added = phase.RelationshipsProbed + phase.RelationshipsFailed - before;
    if (added > 0) this.progress('Data quality: probed relationships proposed during descriptions', { relationships: added });
  }

  /** Derive the findings from the current state and store them. Returns them. */
  public DeriveAndStore(state: DatabaseDocumentation): DataQualityFinding[] {
    const phase = state.phases.dataQuality;
    if (!this.IsActive(state) || !phase) return state.dataQuality ?? [];
    const findings = DeriveFindings(this.context(state));
    state.dataQuality = findings;
    phase.FindingsDerivedAt = new Date().toISOString();
    phase.FindingCounts = CountBySeverity(findings);
    this.progress('Data quality findings', { findings: findings.length, ...phase.FindingCounts });
    return findings;
  }

  /** Findings for one table, from the current state, for the description prompt. Empty when the phase is off. */
  public TableFindings(state: DatabaseDocumentation, schemaName: string, table: TableDefinition): DataQualityFinding[] {
    if (!this.IsActive(state) || !state.phases.dataQuality) return [];
    return DeriveTableFindings(this.context(state), schemaName, table);
  }

  // ─────────────────────────────────────────────────────────────────────────

  private context(state: DatabaseDocumentation): RuleContext {
    return CreateRuleContext(state, this.config, this.options.Now?.() ?? new Date());
  }

  private progress(message: string, data?: Record<string, unknown>): void {
    this.options.OnProgress?.(message, data);
  }

  private newPhase(state: DatabaseDocumentation, status: DataQualityPhase['Status']): DataQualityPhase {
    return {
      Status: status,
      StartedAt: new Date().toISOString(),
      ProbesEnabled: this.config.Probes,
      TotalTables: countTables(state),
      TablesProbed: 0,
      TablesSkipped: 0,
      TablesFailed: 0,
      RelationshipsProbed: 0,
      RelationshipsFailed: 0,
      ProbeDurationMs: 0,
      TableProbes: {},
      RelationshipProbes: {},
    };
  }

  /** Tables that need a probe: never probed, failed, skipped, or missing a measure a now-enabled check needs. */
  private tablesToProbe(context: RuleContext, phase: DataQualityPhase): Array<{ SchemaName: string; Table: TableDefinition }> {
    const out: Array<{ SchemaName: string; Table: TableDefinition }> = [];
    for (const schema of context.State.schemas) {
      for (const table of schema.tables) {
        const spec = PlanTableProbe(context, schema.name, table);
        if (!spec) continue;
        const previous = phase.TableProbes[`${schema.name}.${table.name}`];
        if (previous && (previous.Outcome === 'ok' || previous.Outcome === 'partial')) {
          const have = new Set(previous.Measures);
          const needed = spec.Columns.flatMap((c) => c.Measures);
          const duplicatesNeeded = spec.CountDuplicateRows && previous.DuplicateRows === undefined;
          if (needed.every((m) => have.has(m)) && !duplicatesNeeded) continue;
        }
        out.push({ SchemaName: schema.name, Table: table });
      }
    }
    return out;
  }

  private async probeTable(context: RuleContext, schemaName: string, table: TableDefinition): Promise<TableQualityProbeResult> {
    const spec = PlanTableProbe(context, schemaName, table);
    const started = Date.now();
    const measures: ColumnMeasure[] = [...new Set(spec?.Columns.flatMap((c) => c.Measures) ?? [])];
    if (!spec) {
      return { ProbedAt: new Date().toISOString(), Outcome: 'ok', Measures: [], Columns: {}, DurationMs: 0 };
    }
    const outcome = await ProbeTable(this.options.Driver, context.Dialect, spec, {
      TimeoutMs: this.config.ProbeTimeoutMs,
      ColumnBatchSize: this.config.ColumnBatchSize,
    });
    if (outcome.Ok !== true) {
      return {
        ProbedAt: new Date().toISOString(),
        Outcome: outcome.Reason === 'probe exceeded its timeout' ? 'skipped' : 'failed',
        Reason: outcome.Reason,
        Measures: measures,
        Columns: {},
        DurationMs: Date.now() - started,
      };
    }
    for (const [column, reason] of Object.entries(outcome.FailedColumns)) {
      (outcome.Columns[column] ??= {}).Failed = reason;
    }
    // SQL Server's default collation folds case in GROUP BY, so the sampled distribution hides
    // the spellings a value list must fold. Fetch them exactly, only where the probe found variants.
    for (const [column, measured] of Object.entries(outcome.Columns)) {
      if ((measured.VariantSpellings ?? 0) > 0) {
        measured.ExactDistribution = await FetchExactDistribution(
          this.options.Driver,
          context.Dialect,
          schemaName,
          table.name,
          column,
          EXACT_DISTRIBUTION_LIMIT,
          this.config.ProbeTimeoutMs,
        );
        ApplyExactDistribution(table, column, measured.ExactDistribution);
      }
    }
    const anyFailed = Object.keys(outcome.FailedColumns).length > 0;
    return {
      ProbedAt: new Date().toISOString(),
      Outcome: anyFailed ? 'partial' : 'ok',
      RowCount: outcome.RowCount,
      Measures: measures,
      Columns: outcome.Columns,
      ...(outcome.DuplicateRows !== undefined
        ? { DuplicateRows: outcome.DuplicateRows, DuplicateRowsApproximate: DuplicateCountIsApproximate(table, spec) }
        : {}),
      DurationMs: Date.now() - started,
    };
  }

  private async probeRelationships(context: RuleContext, phase: DataQualityPhase, deadline: number): Promise<void> {
    const planned = PlanRelationshipProbes(context, (key) => phase.RelationshipProbes[key]?.Outcome === 'ok');
    if (planned.length === 0) return;
    const cap = this.config.MaxRowsForProbe;
    // Group by child table: one statement probes several of its relationships.
    const byChild = new Map<string, PlannedRelationshipProbe[]>();
    for (const p of planned) {
      const childKey = `${p.Spec.Child.Schema}.${p.Spec.Child.Table}`;
      const list = byChild.get(childKey) ?? [];
      list.push(p);
      byChild.set(childKey, list);
    }
    let done = 0;
    for (const [childKey, group] of byChild) {
      for (let start = 0; start < group.length; start += this.config.RelationshipBatchSize) {
        const batch = group.slice(start, start + this.config.RelationshipBatchSize);
        const runnable = batch.filter((p) => {
          const tooBig = cap > 0 && (rowsOf(context, p.Spec.Child) > cap || rowsOf(context, p.Spec.Parent) > cap);
          if (tooBig || Date.now() > deadline) {
            phase.RelationshipProbes[p.Key] = failedRelationship(p, tooBig ? 'rows above maxRowsForProbe' : 'the phase reached maxPhaseDurationMs');
            return false;
          }
          return true;
        });
        if (runnable.length === 0) continue;
        done += runnable.length;
        this.progress(`Data quality: orphan probe [${done}/${planned.length}] ${childKey}`);
        const started = Date.now();
        const outcomes = await ProbeRelationships(
          this.options.Driver,
          context.Dialect,
          runnable.map((p) => p.Spec),
          this.config.ProbeTimeoutMs,
        );
        const each = Math.round((Date.now() - started) / runnable.length);
        runnable.forEach((p, i) => {
          const outcome = outcomes[i];
          const base = {
            ProbedAt: new Date().toISOString(),
            Child: p.Spec.Child,
            Parent: p.Spec.Parent,
            ConstraintName: p.Relationship.ConstraintName,
            Origin: p.Origin,
            DurationMs: each,
          };
          phase.RelationshipProbes[p.Key] =
            outcome.Ok === true
              ? {
                  ...base,
                  Outcome: 'ok',
                  CheckedRows: outcome.CheckedRows,
                  OrphanRows: outcome.OrphanRows,
                  ...(outcome.ParentRows !== undefined ? { ParentRows: outcome.ParentRows } : {}),
                  ...(outcome.UnreferencedParentRows !== undefined ? { UnreferencedParentRows: outcome.UnreferencedParentRows } : {}),
                }
              : { ...base, Outcome: 'failed', Reason: outcome.Reason };
        });
      }
    }
  }

  private updateCounts(phase: DataQualityPhase): void {
    const tables = Object.values(phase.TableProbes);
    phase.TablesProbed = tables.filter((t) => t.Outcome === 'ok' || t.Outcome === 'partial').length;
    phase.TablesSkipped = tables.filter((t) => t.Outcome === 'skipped').length;
    phase.TablesFailed = tables.filter((t) => t.Outcome === 'failed').length;
    const relationships = Object.values(phase.RelationshipProbes);
    phase.RelationshipsProbed = relationships.filter((r) => r.Outcome === 'ok').length;
    phase.RelationshipsFailed = relationships.filter((r) => r.Outcome === 'failed').length;
    const incomplete = phase.TablesSkipped + phase.TablesFailed + phase.RelationshipsFailed > 0 || tables.some((t) => t.Outcome === 'partial');
    phase.Status = incomplete ? 'partial' : 'completed';
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function countTables(state: DatabaseDocumentation): number {
  return state.schemas.reduce((n, s) => n + s.tables.length, 0);
}

function skippedProbe(reason: string): TableQualityProbeResult {
  return { ProbedAt: new Date().toISOString(), Outcome: 'skipped', Reason: reason, Measures: [], Columns: {}, DurationMs: 0 };
}

function failedRelationship(p: PlannedRelationshipProbe, reason: string): RelationshipProbeResult {
  return {
    ProbedAt: new Date().toISOString(),
    Child: p.Spec.Child,
    Parent: p.Spec.Parent,
    ConstraintName: p.Relationship.ConstraintName,
    Origin: p.Origin,
    Outcome: 'failed',
    Reason: reason,
    DurationMs: 0,
  };
}

function rowsOf(context: RuleContext, side: { Schema: string; Table: string }): number {
  const table = FindTable(context.State.schemas, side.Schema, side.Table);
  if (!table) return 0;
  return ExactRowCount(table, context.State.phases.dataQuality?.TableProbes[`${side.Schema}.${side.Table}`]) ?? table.rowCount;
}

/** Findings per severity. */
export function CountBySeverity(findings: DataQualityFinding[]): Record<DataQualitySeverity, number> {
  const counts: Record<DataQualitySeverity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.Severity]++;
  return counts;
}

/**
 * Recompute every column's null percentage (0–100) from its counts. Older state files, and
 * columns whose statistics came from the discovery cache, could hold a 0–1 fraction instead.
 */
export function NormalizeNullPercentages(state: DatabaseDocumentation): void {
  for (const schema of state.schemas) {
    for (const table of schema.tables) {
      for (const column of table.columns) {
        const s = column.statistics;
        if (!s) continue;
        s.nullPercentage = s.totalRows > 0 ? (s.nullCount / s.totalRows) * 100 : 0;
      }
    }
  }
}

/**
 * Replace each table's catalog row estimate with the exact count, when one is known, keeping the
 * estimate in `rowCountEstimate` when the two differ.
 */
export function CorrectRowCounts(state: DatabaseDocumentation): void {
  for (const schema of state.schemas) {
    for (const table of schema.tables) {
      const probe = state.phases.dataQuality?.TableProbes[`${schema.name}.${table.name}`];
      const exact = ExactRowCount(table, probe?.RowCount !== undefined ? probe : undefined);
      const current = Number(table.rowCount);
      if (exact === undefined || exact === current) continue;
      if (table.rowCountEstimate === undefined) table.rowCountEstimate = Number.isFinite(current) ? current : 0;
      table.rowCount = exact;
    }
  }
}

/**
 * Replace a column's sampled value distribution with the exact one, so value lists and the prompt
 * see every spelling. On SQL Server the sampled distribution comes from a case-insensitive
 * `GROUP BY` and shows only one spelling of each value.
 */
export function ApplyExactDistribution(
  table: TableDefinition,
  columnName: string,
  distribution: Array<{ Value: string; Frequency: number }> | undefined,
): void {
  const column = table.columns.find((c) => c.name === columnName);
  if (!column?.statistics || !distribution || distribution.length === 0) return;
  column.statistics.valueDistribution = distribution.map((d) => ({ value: d.Value, frequency: d.Frequency }));
  if (column.possibleValues) column.possibleValues = distribution.map((d) => d.Value);
}
