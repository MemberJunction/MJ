import {
  BaseEngine,
  BaseEnginePropertyConfig,
  IMetadataProvider,
  Metadata,
  UserInfo,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJRecordProcessEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
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
  /** The per-record work the pipeline performs. */
  WorkType: 'Action' | 'Agent' | 'FieldRules' | 'Infer';
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
  /** Timestamp of the most recent run (start time, falling back to end time), or null. */
  LastRunAt: Date | null;
  /** Normalized status of the most recent run. */
  LastRunStatus: FeaturePipelineRunStatus;
  /** Id of the most recent `MJ: Process Runs` row, or null. */
  LastRunProcessRunID: string | null;
  /** Records processed in the most recent run, or null. */
  LastRunProcessed: number | null;
  /** Records whose features were written in the most recent run, or null. */
  LastRunSuccess: number | null;
  /** Records that errored in the most recent run, or null. */
  LastRunErrors: number | null;
}

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

  private _RecordProcesses: MJRecordProcessEntity[] = [];
  private _ProcessRuns: MJProcessRunEntity[] = [];

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
      { Type: 'entity', EntityName: 'MJ: Record Processes', PropertyName: '_RecordProcesses', OrderBy: 'Name' },
      { Type: 'entity', EntityName: 'MJ: Process Runs', PropertyName: '_ProcessRuns', OrderBy: '__mj_CreatedAt DESC' },
    ];
    await super.Load(c, provider ?? Metadata.Provider, forceRefresh, contextUser);
  }

  // ---- Cached arrays (sync getters; observe via the streams for reactive UI) ----

  /** Every cached Record Process categorized as a Feature Pipeline. */
  public get Pipelines(): MJRecordProcessEntity[] {
    return (this._RecordProcesses ?? []).filter((rp) => FeaturePipelineEngine.isFeaturePipeline(rp));
  }

  /** All cached Process Run headers (newest first; all entities — callers filter). */
  public get Runs(): MJProcessRunEntity[] {
    return this._ProcessRuns ?? [];
  }

  /** Reactive stream of the raw Record Processes — re-emits on any save/delete/remote-invalidate. */
  public get Pipelines$(): Observable<MJRecordProcessEntity[]> {
    return this.ObserveProperty<MJRecordProcessEntity>('_RecordProcesses');
  }

  /** Reactive stream of the Process Run headers. */
  public get Runs$(): Observable<MJProcessRunEntity[]> {
    return this.ObserveProperty<MJProcessRunEntity>('_ProcessRuns');
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
    const latest = FeaturePipelineEngine.newestRun(runs, p.ID);
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
    };
  }

  /** Newest run for a pipeline id, scanning by StartTime/EndTime/createdAt regardless of input order. */
  private static newestRun(
    runs: ReadonlyArray<MJProcessRunEntity>,
    recordProcessID: string,
  ): MJProcessRunEntity | undefined {
    let best: MJProcessRunEntity | undefined;
    let bestTime = -Infinity;
    for (const r of runs) {
      if (r.RecordProcessID == null || !UUIDsEqual(r.RecordProcessID, recordProcessID)) continue;
      const candidate = r.StartTime ?? r.EndTime ?? r.__mj_CreatedAt;
      const t = candidate ? new Date(candidate).getTime() : -Infinity;
      if (t > bestTime) {
        bestTime = t;
        best = r;
      }
    }
    return best;
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
}
