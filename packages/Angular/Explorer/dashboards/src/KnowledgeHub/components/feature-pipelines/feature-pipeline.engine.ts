import {
  BaseEngine,
  BaseEnginePropertyConfig,
  IMetadataProvider,
  Metadata,
  UserInfo,
} from '@memberjunction/core';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { MJRecordProcessEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import { FeaturePipelineRunResults, type FeaturePipelineRunResult } from '@memberjunction/record-set-processor-base';
import type { Observable } from 'rxjs';

/**
 * Name of the seeded `MJ: Record Process Categories` row that marks a Record
 * Process as a Feature Pipeline. Authored in
 * `metadata/record-process-categories/.record-process-categories.json` and pushed
 * with `mj sync`. Mirrors `FEATURE_PIPELINE_CATEGORY_NAME` in the server-side
 * `@memberjunction/predictive-studio` engine — kept in sync by value (the two
 * packages don't share a dependency, so the constant is intentionally duplicated
 * rather than re-exported across the package boundary).
 */
export const FEATURE_PIPELINE_CATEGORY_NAME = 'Feature Pipeline';

/** Normalized last-run status for a Feature Pipeline, derived from the most recent Process Run. */
export type FeaturePipelineRunStatus = 'Never' | 'Running' | 'Completed' | 'Failed' | 'Cancelled';

/** A pipeline's newest dry run, shown beside its last real run. A dry run writes nothing, so it is never the pipeline's last run. */
export interface FeaturePipelineDryRunSummary {
  /** The dry run's `MJ: Process Runs` ID. */
  ProcessRunID: string;
  /** When the dry run started (falling back to its end time), or null. */
  RunAt: Date | null;
  /** Records the dry run computed (the result's `Previewed`; the run row's success count for a run without a result). */
  Previewed: number;
  /** Records the dry run handed to the processor (the result's `Attempted`; the run row's processed count for a run without a result). */
  Attempted: number;
  /** Records that errored in the dry run. */
  Errors: number;
}

/**
 * What a pipeline's most recent real run did with the records it processed, from its result (`ResultSummary`) and its
 * run row. The four counts add up: every processed record was written, left unchanged, or failed.
 */
export interface FeaturePipelineRunOutcome {
  /** Records whose Feature Values or write-back the run changed (the result's `Upserted`). */
  Written: number;
  /**
   * Records already up to date: computed with nothing to change (`Unchanged`) or skipped, on their watermark or by the
   * processor (`Skipped`). A record skipped on its watermark was never handed to the processor, so it is not in the
   * result's `Attempted`; it still holds what the pipeline wrote.
   */
  Unchanged: number;
  /** Records that failed, of any kind (the run row's `ErrorCount`). */
  Failed: number;
  /** Records the run processed (the run row's `ProcessedItems`): attempted plus skipped on their watermark. */
  Total: number;
}

/**
 * UI-facing summary of one Feature Pipeline: what it is, the entity it writes to,
 * the attribute it produces, and last-run / freshness. Built purely from the
 * cached Record Process + Process Run entities by {@link FeaturePipelineEngine.GetSummaries}.
 */
export interface FeaturePipelineSummary {
  /** The underlying `MJ: Record Processes` id (also the `RunFeaturePipeline` `featurePipelineID`). */
  ID: string;
  /** Display name (the Record Process name). */
  Name: string;
  /** Optional description. */
  Description: string | null;
  /** Record Process lifecycle status. */
  Status: 'Active' | 'Disabled' | 'Draft';
  /**
   * The per-record work the pipeline performs. Derived from the entity's `WorkType` so it tracks
   * the CodeGen-generated union (sourced from the `CK_RecordProcess_WorkType` CHECK constraint) and
   * never drifts as work types are added (e.g. `'ML Model'`).
   */
  WorkType: MJRecordProcessEntity['WorkType'];
  /** Id of the target entity whose records the pipeline derives features for. */
  TargetEntityID: string;
  /** Display name of the target entity. */
  TargetEntity: string;
  /** Best-effort attribute written back, parsed from the Record Process `OutputMapping`. */
  OutputAttribute: string | null;
  /** Whether the pipeline can be run on demand (the Run button is enabled). */
  OnDemandEnabled: boolean;
  /** Whether the pipeline runs on a cron schedule. */
  ScheduleEnabled: boolean;
  /** Timestamp of the most recent real (not dry) run (start time, falling back to end time), or null. */
  LastRunAt: Date | null;
  /** Normalized status of the most recent real run. */
  LastRunStatus: FeaturePipelineRunStatus;
  /** Id of the most recent real `MJ: Process Runs` row, or null. */
  LastRunProcessRunID: string | null;
  /** Records processed in the most recent real run, from its run row, or null. */
  LastRunProcessed: number | null;
  /** Records that succeeded in the most recent real run, from its run row, or null. A run row counts a record as succeeded whether or not its values changed. */
  LastRunSuccess: number | null;
  /** Records that errored in the most recent real run, or null. */
  LastRunErrors: number | null;
  /** The most recent real run's Feature Pipeline result, parsed from its `ResultSummary`; null for a run without one. */
  LastRunResult: FeaturePipelineRunResult | null;
  /** What the most recent real run did with its records ({@link FeaturePipelineRunOutcome}), or null for a run without a result. */
  LastRunOutcome: FeaturePipelineRunOutcome | null;
  /** {@link LastRunOutcome} as the card's last-run line ({@link FeaturePipelineEngine.DescribeRunOutcome}), or null without a result. */
  LastRunOutcomeText: string | null;
  /** The most recent real run's error message when it did not complete (a refused or failed run), else null. */
  LastRunErrorMessage: string | null;
  /** The newest dry run when it is newer than the most recent real run (or the pipeline has no real run); else null. */
  LatestDryRun: FeaturePipelineDryRunSummary | null;
  /**
   * The pipeline type ('LLM' or 'Decision' or custom). Defaults to 'LLM' when unset. The two built-in
   * names are given in their canonical case whatever case the spec uses, as the processor matches them.
   */
  PipelineType: string;
}

/** The one DataFeatureSpec property the summary reads from a Record Process `Configuration`. */
interface ConfigurationPipelineType {
  PipelineType?: string | null;
}

/** The built-in pipeline type names, by their lower-case form. */
const BUILT_IN_PIPELINE_TYPES: Record<string, string> = { llm: 'LLM', decision: 'Decision' };

/**
 * **FeaturePipelineEngine** (Knowledge Hub, Angular) — the discovery + monitoring
 * cache for Feature Pipelines (Predictive Studio SP6).
 *
 * A Feature Pipeline has no dedicated entity: it IS an `MJ: Record Processes` row
 * categorized into the seeded {@link FEATURE_PIPELINE_CATEGORY_NAME} category. This
 * engine caches those rows (plus the recent `MJ: Process Runs` headers) so the KH
 * UI can list "what feature pipelines exist, what entity each writes to, and when
 * each last ran" — reactively, via the canonical MJ BaseEngine pattern (`Config()`
 * declaring `BaseEnginePropertyConfig[]`, lazy-loaded, `ObserveProperty`
 * reactivity for free).
 *
 * The freshness/projection logic is a pure static function ({@link BuildSummaries})
 * so it can be exercised without a provider, and it intentionally mirrors the
 * server-side `@memberjunction/predictive-studio` engine of the same name (the two
 * don't share a dependency).
 */
export class FeaturePipelineEngine extends BaseEngine<FeaturePipelineEngine> {
  /** Singleton accessor for the default provider — never `new` this directly. */
  public static get Instance(): FeaturePipelineEngine {
    return super.getInstance<FeaturePipelineEngine>();
  }

  private _recordProcesses: MJRecordProcessEntity[] = [];
  private _processRuns: MJProcessRunEntity[] = [];

  /**
   * Lazy-load the Record Process + recent Process Run caches. Safe to call from
   * every entry point — a no-op when already loaded (unless `forceRefresh`).
   * Process Runs are ordered newest-first so the most recent run per pipeline is
   * the first match.
   */
  public async Config(
    forceRefresh?: boolean,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<void> {
    const c: Partial<BaseEnginePropertyConfig>[] = [
      { Type: 'entity', EntityName: 'MJ: Record Processes', PropertyName: '_recordProcesses', OrderBy: 'Name' },
      { Type: 'entity', EntityName: 'MJ: Process Runs', PropertyName: '_processRuns', OrderBy: '__mj_CreatedAt DESC' },
    ];
    await super.Load(c, provider ?? Metadata.Provider, forceRefresh, contextUser);
  }

  // ---- Cached arrays (sync getters; observe via the streams for reactive UI) ----

  /** Every cached Record Process categorized as a Feature Pipeline. */
  public get Pipelines(): MJRecordProcessEntity[] {
    return (this._recordProcesses ?? []).filter((rp) => FeaturePipelineEngine.isFeaturePipeline(rp));
  }

  /** All cached Process Run headers (newest first; all entities — callers filter). */
  public get Runs(): MJProcessRunEntity[] {
    return this._processRuns ?? [];
  }

  /** Reactive stream of the raw Record Processes — re-emits on any save/delete/remote-invalidate. */
  public get Pipelines$(): Observable<MJRecordProcessEntity[]> {
    return this.ObserveProperty<MJRecordProcessEntity>('_recordProcesses');
  }

  /** Reactive stream of the Process Run headers. */
  public get Runs$(): Observable<MJProcessRunEntity[]> {
    return this.ObserveProperty<MJProcessRunEntity>('_processRuns');
  }

  // ---- Projection ----

  /** Build the UI summaries for every feature pipeline from the loaded caches. */
  public GetSummaries(): FeaturePipelineSummary[] {
    return FeaturePipelineEngine.BuildSummaries(this.Pipelines, this.Runs);
  }

  /**
   * Pure, side-effect-free summary builder — used by {@link GetSummaries} and by
   * unit tests (which pass in-memory arrays, no provider).
   */
  public static BuildSummaries(
    pipelines: ReadonlyArray<MJRecordProcessEntity>,
    runs: ReadonlyArray<MJProcessRunEntity>,
  ): FeaturePipelineSummary[] {
    return pipelines.map((p) => FeaturePipelineEngine.buildSummary(p, runs));
  }

  // ---- Internal helpers ----

  /** Whether a Record Process belongs to the seeded Feature Pipeline category. */
  private static isFeaturePipeline(rp: MJRecordProcessEntity): boolean {
    return (rp.Category ?? '').trim().toLowerCase() === FEATURE_PIPELINE_CATEGORY_NAME.toLowerCase();
  }

  /** Project one pipeline + the run set into a {@link FeaturePipelineSummary}. */
  private static buildSummary(
    p: MJRecordProcessEntity,
    runs: ReadonlyArray<MJProcessRunEntity>,
  ): FeaturePipelineSummary {
    const latest = FeaturePipelineEngine.newestRun(runs, p.ID, false);
    const result = FeaturePipelineEngine.parseRunResult(latest);
    const outcome = latest && result ? FeaturePipelineEngine.RunOutcomeOf(latest, result) : null;
    return {
      ID: p.ID,
      Name: p.Name,
      Description: p.Description ?? null,
      Status: p.Status,
      WorkType: p.WorkType,
      TargetEntityID: p.EntityID,
      TargetEntity: p.Entity,
      OutputAttribute: FeaturePipelineEngine.deriveOutputAttribute(p.OutputMapping),
      OnDemandEnabled: p.OnDemandEnabled,
      ScheduleEnabled: p.ScheduleEnabled,
      LastRunAt: latest?.StartTime ?? latest?.EndTime ?? null,
      LastRunStatus: FeaturePipelineEngine.mapRunStatus(latest),
      LastRunProcessRunID: latest?.ID ?? null,
      LastRunProcessed: latest?.ProcessedItems ?? null,
      LastRunSuccess: latest?.SuccessCount ?? null,
      LastRunErrors: latest?.ErrorCount ?? null,
      LastRunResult: result,
      LastRunOutcome: outcome,
      LastRunOutcomeText: outcome && latest ? FeaturePipelineEngine.DescribeRunOutcome(outcome, latest.Status) : null,
      LastRunErrorMessage: latest && latest.Status !== 'Completed' ? latest.ErrorMessage || null : null,
      LatestDryRun: FeaturePipelineEngine.buildDryRunNote(FeaturePipelineEngine.newestRun(runs, p.ID, true), latest),
      PipelineType: FeaturePipelineEngine.derivePipelineType(p.Configuration),
    };
  }

  /**
   * What a real run did with its records: its result's write counts, its run row's failures and total. Every processed
   * record is counted once: the run row's `ProcessedItems` is the result's `Upserted + Unchanged + Skipped` plus the
   * failures.
   * @param run - the run row
   * @param result - the run's Feature Pipeline result
   */
  public static RunOutcomeOf(run: MJProcessRunEntity, result: FeaturePipelineRunResult): FeaturePipelineRunOutcome {
    return {
      Written: result.Upserted,
      Unchanged: result.Unchanged + result.Skipped,
      Failed: run.ErrorCount || 0,
      Total: run.ProcessedItems || 0,
    };
  }

  /**
   * The card's last-run line for a run outcome. A completed run with no failure and nothing to write says every record
   * is up to date ("5 of 5 up to date (5 unchanged)"); any other run lists what it did ("1 written, 1 unchanged of 2",
   * "2 written, 1 failed of 3"), so a run that did not complete is never called up to date. A run that processed no
   * record says so.
   * @param outcome - the run's outcome
   * @param status - the run row's status
   */
  public static DescribeRunOutcome(outcome: FeaturePipelineRunOutcome, status: MJProcessRunEntity['Status']): string {
    if (outcome.Total === 0) {
      return 'no records processed';
    }
    if (status === 'Completed' && outcome.Written === 0 && outcome.Failed === 0) {
      return `${outcome.Unchanged} of ${outcome.Total} up to date (${outcome.Unchanged} unchanged)`;
    }
    const parts: Array<[number, string]> = [[outcome.Written, 'written'], [outcome.Unchanged, 'unchanged'], [outcome.Failed, 'failed']];
    const shown = parts.filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`);
    return `${shown.length > 0 ? shown.join(', ') : '0 written'} of ${outcome.Total}`;
  }

  /** When a run happened: its start time, else its end time, else its creation time (as epoch milliseconds; -Infinity when it has none). */
  private static runTime(run: MJProcessRunEntity): number {
    const candidate = run.StartTime || run.EndTime || run.__mj_CreatedAt;
    return candidate ? new Date(candidate).getTime() : -Infinity;
  }

  /**
   * Newest run for a pipeline id, scanning by StartTime/EndTime/createdAt regardless of input order. `dryRun` picks the
   * dry runs or the real ones; a run row that does not say it was a dry run is a real one.
   */
  private static newestRun(
    runs: ReadonlyArray<MJProcessRunEntity>,
    recordProcessID: string,
    dryRun: boolean,
  ): MJProcessRunEntity | undefined {
    let best: MJProcessRunEntity | undefined;
    let bestTime = -Infinity;
    for (const r of runs) {
      if (r.RecordProcessID == null || !UUIDsEqual(r.RecordProcessID, recordProcessID)) continue;
      if ((r.DryRun === true) !== dryRun) continue;
      const t = FeaturePipelineEngine.runTime(r);
      if (t > bestTime) {
        bestTime = t;
        best = r;
      }
    }
    return best;
  }

  /** The run's `ResultSummary` as a Feature Pipeline result, or null for a run without one. */
  private static parseRunResult(run: MJProcessRunEntity | undefined): FeaturePipelineRunResult | null {
    return FeaturePipelineRunResults.Parse(run?.ResultSummary);
  }

  /** The dry-run note for a pipeline: its newest dry run when that is newer than the last real run, else null. */
  private static buildDryRunNote(
    dry: MJProcessRunEntity | undefined,
    lastReal: MJProcessRunEntity | undefined,
  ): FeaturePipelineDryRunSummary | null {
    if (!dry) return null;
    if (lastReal && FeaturePipelineEngine.runTime(dry) <= FeaturePipelineEngine.runTime(lastReal)) return null;
    const result = FeaturePipelineEngine.parseRunResult(dry);
    return {
      ProcessRunID: dry.ID,
      RunAt: dry.StartTime || dry.EndTime || null,
      Previewed: result ? result.Previewed : dry.SuccessCount || 0,
      Attempted: result ? result.Attempted : dry.ProcessedItems || 0,
      Errors: dry.ErrorCount || 0,
    };
  }

  /** Normalize a Process Run status into the small union the UI renders. `undefined` → `'Never'`. */
  private static mapRunStatus(run: MJProcessRunEntity | undefined): FeaturePipelineRunStatus {
    if (!run) return 'Never';
    switch (run.Status) {
      case 'Completed':
        return 'Completed';
      case 'Failed':
        return 'Failed';
      case 'Cancelled':
        return 'Cancelled';
      case 'Running':
      case 'Pending':
      case 'Paused':
        return 'Running';
      default:
        return 'Never';
    }
  }

  /**
   * Best-effort attribute the pipeline writes, parsed from the Record Process
   * `OutputMapping` JSON. Probes the common shapes (`field` / `targetField` /
   * `attribute`, or a `fields` array / object) and returns null otherwise. Never
   * throws on malformed JSON.
   */
  private static deriveOutputAttribute(outputMapping: string | null): string | null {
    if (!outputMapping) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(outputMapping);
    } catch {
      return null;
    }
    if (parsed == null || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;

    const single = obj['field'] ?? obj['targetField'] ?? obj['attribute'];
    if (typeof single === 'string' && single.trim()) return single.trim();

    const names = FeaturePipelineEngine.fieldNamesFrom(obj['fields']);
    return names.length > 0 ? names.join(', ') : null;
  }

  /** Collect field names from either an object map or an array of names. */
  private static fieldNamesFrom(fields: unknown): string[] {
    if (Array.isArray(fields)) {
      return fields.filter((f): f is string => typeof f === 'string' && f.trim().length > 0);
    }
    if (fields != null && typeof fields === 'object') {
      return Object.keys(fields as Record<string, unknown>);
    }
    return [];
  }

  /**
   * Best-effort pipeline type derived from the Record Process `Configuration` JSON
   * (which serializes `DataFeatureSpec`). Returns 'LLM' when unset, empty, or unparseable, and a built-in
   * name ('decision') in its canonical case ('Decision').
   */
  private static derivePipelineType(config: string | null): string {
    const parsed = config ? SafeJSONParse<ConfigurationPipelineType>(config) : null;
    const typeName = parsed && typeof parsed === 'object' && typeof parsed.PipelineType === 'string' ? parsed.PipelineType.trim() : '';
    if (typeName.length === 0) {
      return 'LLM';
    }
    return BUILT_IN_PIPELINE_TYPES[typeName.toLowerCase()] ?? typeName;
  }
}

