/**
 * @module feature-pipelines/feature-pipeline-engine
 *
 * **FeaturePipelineEngine** — the discovery + monitoring cache for Feature
 * Pipelines (Predictive Studio SP6, `plans/predictive-studio.md` §5.4).
 *
 * ## What a Feature Pipeline is (the "category route")
 *
 * A Feature Pipeline has **no dedicated entity / table**. It IS an
 * `MJ: Record Processes` row whose `WorkType` is `Infer` / `Action` / `Agent`
 * (with a write-back `OutputMapping`), **categorized** into the seeded
 * `"Feature Pipeline"` `MJ: Record Process Categories` row. The run path already
 * exists — `PredictiveStudio.RunFeaturePipeline` (a Remote Operation) and its
 * sibling Action both delegate to the Record Set Processing substrate's
 * `RecordProcessExecutor`. This engine makes those categorized rows
 * **first-class, discoverable, and monitorable** for the Model Development Agent
 * and the Knowledge Hub UI, without inventing a parallel registry.
 *
 * ## Why a BaseEngine (the canonical MJ reactive-cache pattern)
 *
 * Following `InteractiveFormsEngine` / `ComponentMetadataEngine`: the dataset is
 * tiny (the feature-pipeline Record Processes plus their recent `MJ: Process Runs`
 * headers — no big columns), so we cache it and get **reactivity for free**:
 *
 *   - The `Configs` array passed to `Load()` tells BaseEngine which entities to
 *     subscribe to. A save / delete / remote-invalidate on a matching
 *     `MJ: Record Processes` or `MJ: Process Runs` row automatically refreshes the
 *     in-memory array (in place when possible) — **no manual invalidation code**.
 *   - Each cached property exposes a lazy `BehaviorSubject` via
 *     `ObserveProperty(...)`; the convenience getters {@link Pipelines$} /
 *     {@link Runs$} wrap it for Angular `async`-pipe consumption.
 *   - Lazy-load: every entry point calls `await FeaturePipelineEngine.Instance.Config(false, user, provider)`.
 *     BaseEngine's `Config` is a no-op when already loaded, so the call is cheap
 *     to sprinkle everywhere — the first caller pays, everyone else gets cache hits,
 *     and users who never open the surface pay nothing.
 *
 * ## Provider threading
 *
 * Multi-provider safe: callers pass the active `IMetadataProvider` to `Config`,
 * and `GetProviderInstance` resolves a per-provider engine instance (the standard
 * BaseEngine convention). All reads operate on the strongly-typed cached entities;
 * the freshness computation is a pure function over already-loaded rows.
 */

import {
  BaseEngine,
  type BaseEnginePropertyConfig,
  type IMetadataProvider,
  type UserInfo,
} from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import type { MJRecordProcessEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import type { Observable } from 'rxjs';

import {
  FEATURE_PIPELINE_CATEGORY_NAME,
  type FeaturePipelineSummary,
  type FeaturePipelineRunStatus,
} from './types';

/**
 * Discovery + monitoring engine for Feature Pipelines. Singleton per provider;
 * never construct directly — use {@link Instance} (default provider) or
 * `BaseEngine.GetProviderInstance(provider, FeaturePipelineEngine)`.
 */
export class FeaturePipelineEngine extends BaseEngine<FeaturePipelineEngine> {
  /** Standard singleton accessor for the default provider. */
  public static get Instance(): FeaturePipelineEngine {
    return super.getInstance<FeaturePipelineEngine>();
  }

  /** All `MJ: Record Processes` rows (cached); narrowed to feature pipelines by {@link Pipelines}. */
  private _recordProcesses: MJRecordProcessEntity[] = [];

  /** Recent `MJ: Process Runs` headers (cached) used to derive last-run / freshness. */
  private _processRuns: MJProcessRunEntity[] = [];

  /**
   * Lazy-load the Record Process + recent Process Run caches. Safe to call from
   * every entry point — a no-op when already loaded (unless `forceRefresh`).
   *
   * We deliberately cache **all** `MJ: Record Processes` (a small, metadata-style
   * table) rather than server-side filtering to the category, because the
   * category id isn't known until the seeded row is loaded and because the full
   * set is tiny; {@link Pipelines} narrows in memory by the category name. Process
   * Runs are capped to the most recent rows (the audit headers carry no large
   * columns) so freshness is cheap to compute.
   *
   * @param forceRefresh re-run the underlying RunViews even if already loaded
   * @param contextUser the context user (required server-side for audit/security)
   * @param provider the metadata provider to scope this load to (multi-provider safe)
   */
  public async Config(
    forceRefresh?: boolean,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<void> {
    const configs: Partial<BaseEnginePropertyConfig>[] = [
      {
        Type: 'entity',
        EntityName: 'MJ: Record Processes',
        PropertyName: '_recordProcesses',
        OrderBy: 'Name',
        CacheLocal: true,
      },
      {
        Type: 'entity',
        EntityName: 'MJ: Process Runs',
        PropertyName: '_processRuns',
        // Newest first so {@link latestRunForPipeline} can take the first match.
        OrderBy: '__mj_CreatedAt DESC',
        CacheLocal: true,
      },
    ];
    await this.Load(configs, provider, forceRefresh, contextUser);
  }

  // ─── Read-side accessors ────────────────────────────────────────────────

  /**
   * The feature-pipeline Record Processes — every cached `MJ: Record Processes`
   * row whose `Category` is the seeded {@link FEATURE_PIPELINE_CATEGORY_NAME}.
   * Matched on the denormalized `Category` view field (case-insensitive) so no
   * separate category lookup is needed.
   */
  public get Pipelines(): MJRecordProcessEntity[] {
    return (this._recordProcesses ?? []).filter((rp) => this.isFeaturePipeline(rp));
  }

  /** All cached Process Run headers (newest first; all entities — callers filter). */
  public get Runs(): MJProcessRunEntity[] {
    return this._processRuns ?? [];
  }

  /**
   * RxJS Observable of the feature-pipeline Record Processes. Emits the current
   * filtered array on subscribe (BehaviorSubject semantics) and re-emits on every
   * save / delete / remote-invalidate affecting `MJ: Record Processes`.
   *
   * NOTE: `ObserveProperty` emits the raw `_recordProcesses` array; Angular
   * consumers should `map(rows => rows.filter(...))` or simply read {@link Pipelines}
   * inside the subscription. We expose a `map`-friendly stream so callers stay
   * reactive while still seeing only feature pipelines.
   */
  public get Pipelines$(): Observable<MJRecordProcessEntity[]> {
    return this.ObserveProperty<MJRecordProcessEntity>('_recordProcesses');
  }

  /** RxJS Observable of the Process Run headers — same reactivity contract as {@link Pipelines$}. */
  public get Runs$(): Observable<MJProcessRunEntity[]> {
    return this.ObserveProperty<MJProcessRunEntity>('_processRuns');
  }

  // ─── Convenience queries ────────────────────────────────────────────────

  /** Find a feature pipeline by its `MJ: Record Processes` id. O(N) — N is small. */
  public FindPipelineByID(id: string): MJRecordProcessEntity | undefined {
    if (!id) return undefined;
    const norm = NormalizeUUID(id);
    return this.Pipelines.find((p) => NormalizeUUID(p.ID) === norm);
  }

  /**
   * The most recent `MJ: Process Runs` header for a given feature pipeline, or
   * `undefined` if it has never run. Relies on the `__mj_CreatedAt DESC` order
   * applied in {@link Config} (first match = newest).
   *
   * @param recordProcessID the feature pipeline's `MJ: Record Processes` id
   */
  public LatestRunForPipeline(recordProcessID: string): MJProcessRunEntity | undefined {
    return this.latestRunForPipeline(this.Runs, recordProcessID);
  }

  /**
   * Build the UI-/agent-facing summary for every feature pipeline: identity,
   * target entity, the write-back output attribute, and last-run / freshness
   * derived from the cached Process Run headers. Pure projection over the loaded
   * caches — call after {@link Config}.
   */
  public GetPipelineSummaries(): FeaturePipelineSummary[] {
    return FeaturePipelineEngine.BuildSummaries(this.Pipelines, this.Runs);
  }

  /**
   * Pure, side-effect-free builder used by {@link GetPipelineSummaries} and by
   * unit tests (which inject in-memory arrays — no live DB, no BaseEngine load).
   * Separating the projection from the cache mirrors `InteractiveFormsEngine`'s
   * split of loading vs. querying.
   *
   * @param pipelines the feature-pipeline Record Processes
   * @param runs the Process Run headers (any order; newest-wins is computed here)
   */
  public static BuildSummaries(
    pipelines: ReadonlyArray<MJRecordProcessEntity>,
    runs: ReadonlyArray<MJProcessRunEntity>,
  ): FeaturePipelineSummary[] {
    return pipelines.map((p) => FeaturePipelineEngine.buildSummary(p, runs));
  }

  // ─── Internal helpers ───────────────────────────────────────────────────

  /** Whether a Record Process belongs to the seeded Feature Pipeline category. */
  private isFeaturePipeline(rp: MJRecordProcessEntity): boolean {
    const category = (rp.Category ?? '').trim().toLowerCase();
    return category === FEATURE_PIPELINE_CATEGORY_NAME.toLowerCase();
  }

  /** Newest run for a pipeline from an already-ordered (newest-first) array. */
  private latestRunForPipeline(
    runs: ReadonlyArray<MJProcessRunEntity>,
    recordProcessID: string,
  ): MJProcessRunEntity | undefined {
    if (!recordProcessID) return undefined;
    const norm = NormalizeUUID(recordProcessID);
    return runs.find((r) => r.RecordProcessID != null && NormalizeUUID(r.RecordProcessID) === norm);
  }

  /**
   * Project one pipeline + the run set into a {@link FeaturePipelineSummary}.
   * Static so it can be reused by {@link BuildSummaries} without an instance.
   */
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

  /** Newest run for a pipeline id, scanning by `StartTime`/`__mj_CreatedAt` regardless of input order. */
  private static newestRun(
    runs: ReadonlyArray<MJProcessRunEntity>,
    recordProcessID: string,
  ): MJProcessRunEntity | undefined {
    let best: MJProcessRunEntity | undefined;
    let bestTime = -Infinity;
    for (const r of runs) {
      if (r.RecordProcessID == null || !UUIDsEqual(r.RecordProcessID, recordProcessID)) continue;
      const t = FeaturePipelineEngine.runSortTime(r);
      if (t > bestTime) {
        bestTime = t;
        best = r;
      }
    }
    return best;
  }

  /** Sort key for "most recent run": prefer StartTime, then EndTime, then createdAt. */
  private static runSortTime(r: MJProcessRunEntity): number {
    const candidate = r.StartTime ?? r.EndTime ?? r.__mj_CreatedAt;
    return candidate ? new Date(candidate).getTime() : -Infinity;
  }

  /**
   * Normalize a `MJ: Process Runs` status into the small {@link FeaturePipelineRunStatus}
   * union the UI renders. `undefined` run → `'Never'`.
   */
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
   * Best-effort human-readable "what attribute does this pipeline write" derived
   * from the Record Process `OutputMapping` JSON. The mapping shape is opaque to
   * this engine (it's owned by the Record Set Processing substrate), so we probe
   * the common shapes — a top-level `field` / `fields` / `targetField`, or an
   * array of field names — and fall back to `null` when we can't tell. Never
   * throws on malformed JSON.
   *
   * @param outputMapping the raw `OutputMapping` JSON string, or null
   */
  private static deriveOutputAttribute(outputMapping: string | null): string | null {
    if (!outputMapping) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(outputMapping);
    } catch {
      return null;
    }
    return FeaturePipelineEngine.extractFieldNames(parsed);
  }

  /** Extract a comma-joined field-name string from a parsed OutputMapping payload. */
  private static extractFieldNames(parsed: unknown): string | null {
    if (parsed == null || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;

    // Shape A: { field: 'X' } or { targetField: 'X' }
    const single = obj['field'] ?? obj['targetField'] ?? obj['attribute'];
    if (typeof single === 'string' && single.trim()) return single.trim();

    // Shape B: { fields: { 'X': ..., 'Y': ... } } or { fields: ['X','Y'] }
    const fields = obj['fields'];
    const names = FeaturePipelineEngine.fieldNamesFrom(fields);
    if (names.length > 0) return names.join(', ');

    return null;
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
