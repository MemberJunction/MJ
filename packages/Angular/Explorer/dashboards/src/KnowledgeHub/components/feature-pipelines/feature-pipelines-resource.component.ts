/**
 * @fileoverview Knowledge Hub — Feature Pipelines dashboard tab.
 *
 * Full-page resource component listing the **Feature Pipelines** (Predictive
 * Studio SP6 / `plans/predictive-studio.md` §5.4). A Feature Pipeline has no
 * dedicated entity: it IS an `MJ: Record Processes` row categorized into the
 * seeded "Feature Pipeline" category (Infer / Action / Agent + a write-back
 * `OutputMapping`). This surface makes them first-class + discoverable +
 * monitorable inside Knowledge Hub:
 *
 *   - lists the feature-pipeline Record Processes (from {@link FeaturePipelineEngine}),
 *   - shows each one's target entity, written attribute, and last-run / freshness,
 *   - offers **Run** (invokes the existing `PredictiveStudio.RunFeaturePipeline`
 *     Remote Operation via the provider's `RouteOperation` seam — the same
 *     hardened Record Set Processing run path), and
 *   - an **authoring** entry that opens the reusable `mj-record-process-editor`
 *     (from `@memberjunction/ng-record-process-studio`) in a dialog — we do NOT
 *     rebuild the authoring surface.
 *
 * Registered as `BaseResourceComponent` driver `FeaturePipelinesResource`; wired
 * into the Knowledge Hub application's nav via metadata (`DriverClass`).
 */

import {
  Component,
  ChangeDetectorRef,
  OnDestroy,
  AfterViewInit,
  inject,
} from '@angular/core';
import { Subject, takeUntil } from 'rxjs';
import type { RemoteOpResult, IRemoteOperationProvider } from '@memberjunction/core';
import {
  ResourceData,
  MJRecordProcessEntity,
  type PredictiveStudioRunFeaturePipelineInput,
  type PredictiveStudioRunFeaturePipelineOutput,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';

import {
  FeaturePipelineEngine,
  type FeaturePipelineSummary,
  type FeaturePipelineRunStatus,
} from './feature-pipeline.engine';

/** Stable operation key of the Run Feature Pipeline Remote Operation. */
const RUN_FEATURE_PIPELINE_OP = 'PredictiveStudio.RunFeaturePipeline';

@RegisterClass(BaseResourceComponent, 'FeaturePipelinesResource')
@Component({
  standalone: false,
  selector: 'app-feature-pipelines-resource',
  templateUrl: './feature-pipelines-resource.component.html',
  styleUrls: ['./feature-pipelines-resource.component.scss'],
})
export class FeaturePipelinesResourceComponent
  extends BaseResourceComponent
  implements AfterViewInit, OnDestroy
{
  private cdr = inject(ChangeDetectorRef);
  protected override navigationService = inject(NavigationService);
  protected override destroy$ = new Subject<void>();

  // ================================================================
  // Resource overrides
  // ================================================================

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Feature Pipelines';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-diagram-project';
  }

  // ================================================================
  // State
  // ================================================================

  /** True while the engine is loading its caches. */
  public IsLoading = true;

  /** All feature-pipeline summaries (unfiltered). */
  public AllPipelines: FeaturePipelineSummary[] = [];

  /** Pipelines after the search filter is applied (what the cards render). */
  public FilteredPipelines: FeaturePipelineSummary[] = [];

  /** Free-text search over name / target entity / output attribute. */
  public SearchQuery = '';

  /** Ids of pipelines with a Run currently in flight (disables their Run button). */
  public RunningIDs = new Set<string>();

  /** Authoring dialog state. */
  public ShowEditor = false;

  /** Record Process id being authored, or null for a new draft. */
  public EditingPipelineID: string | null = null;

  // ================================================================
  // Computed
  // ================================================================

  /** Count of pipelines whose underlying Record Process is Active. */
  public get ActiveCount(): number {
    return this.AllPipelines.filter((p) => p.Status === 'Active').length;
  }

  /** Count of pipelines that have never run. */
  public get NeverRunCount(): number {
    return this.AllPipelines.filter((p) => p.LastRunStatus === 'Never').length;
  }

  /** Count of pipelines whose most recent run failed. */
  public get FailedCount(): number {
    return this.AllPipelines.filter((p) => p.LastRunStatus === 'Failed').length;
  }

  // ================================================================
  // Lifecycle
  // ================================================================

  async ngAfterViewInit(): Promise<void> {
    await this.loadData();
    this.subscribeToEngine();
    this.emitAgentContext();
    this.registerAgentTools();
    this.NotifyLoadComplete();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ================================================================
  // Public Methods — Toolbar
  // ================================================================

  /** Reload the engine caches from the server. */
  public async Refresh(): Promise<void> {
    await this.loadData(true);
  }

  /** Apply the search filter (called on every keystroke). */
  public OnSearchChanged(): void {
    this.applyFilter();
    this.cdr.detectChanges();
  }

  /** Open the authoring editor for a brand-new feature pipeline draft. */
  public OnNewPipeline(): void {
    this.EditingPipelineID = null;
    this.ShowEditor = true;
    this.cdr.detectChanges();
  }

  // ================================================================
  // Public Methods — Card Actions
  // ================================================================

  /** Open the authoring editor for an existing feature pipeline. */
  public OnEditPipeline(pipeline: FeaturePipelineSummary): void {
    this.EditingPipelineID = pipeline.ID;
    this.ShowEditor = true;
    this.cdr.detectChanges();
  }

  /**
   * Run a feature pipeline on demand by invoking the
   * `PredictiveStudio.RunFeaturePipeline` Remote Operation through the active
   * provider. The op delegates to the Record Set Processing substrate — the same
   * batching/resume/audit path the rest of the platform uses.
   */
  public async OnRunPipeline(pipeline: FeaturePipelineSummary): Promise<void> {
    if (this.RunningIDs.has(pipeline.ID)) return;

    this.RunningIDs.add(pipeline.ID);
    this.cdr.detectChanges();

    try {
      const input: PredictiveStudioRunFeaturePipelineInput = { featurePipelineID: pipeline.ID };
      // RouteOperation lives on IRemoteOperationProvider, which every concrete
      // provider (the browser's GraphQLDataProvider here) implements via ProviderBase.
      // The narrowing cast is the documented "power-tool seam" entry point.
      const opProvider = this.ProviderToUse as unknown as IRemoteOperationProvider;
      const result = await opProvider.RouteOperation<
        PredictiveStudioRunFeaturePipelineInput,
        PredictiveStudioRunFeaturePipelineOutput
      >(RUN_FEATURE_PIPELINE_OP, input, { provider: this.ProviderToUse });

      this.notifyRunResult(pipeline, result);
    } catch (error) {
      MJNotificationService.Instance.CreateSimpleNotification(
        `Failed to run "${pipeline.Name}": ${error instanceof Error ? error.message : String(error)}`,
        'error',
        5000,
      );
    } finally {
      this.RunningIDs.delete(pipeline.ID);
      // Refresh so the card reflects the new run / freshness.
      await this.loadData(true);
    }
  }

  /** Whether a given pipeline currently has a Run in flight. */
  public IsRunning(pipelineID: string): boolean {
    return this.RunningIDs.has(pipelineID);
  }

  // ================================================================
  // Public Methods — Authoring Dialog
  // ================================================================

  /** Called when the editor saves — refresh and close. */
  public async OnEditorSaved(_record: MJRecordProcessEntity): Promise<void> {
    this.ShowEditor = false;
    this.EditingPipelineID = null;
    await this.loadData(true);
  }

  /** Called when the editor is cancelled — just close. */
  public OnEditorCancelled(): void {
    this.ShowEditor = false;
    this.EditingPipelineID = null;
    this.cdr.detectChanges();
  }

  // ================================================================
  // Public Methods — Display Helpers
  // ================================================================

  /** Font Awesome icon for a pipeline's work type. */
  public WorkTypeIcon(workType: FeaturePipelineSummary['WorkType']): string {
    switch (workType) {
      case 'Infer':
        return 'fa-solid fa-wand-magic-sparkles';
      case 'Agent':
        return 'fa-solid fa-robot';
      case 'Action':
        return 'fa-solid fa-bolt';
      case 'FieldRules':
        return 'fa-solid fa-list-check';
    }
  }

  /** CSS modifier class for a run-status pill. */
  public RunStatusClass(status: FeaturePipelineRunStatus): string {
    return `status--${status.toLowerCase()}`;
  }

  /** Human-readable label for a run status. */
  public RunStatusLabel(status: FeaturePipelineRunStatus): string {
    return status === 'Never' ? 'Never run' : status;
  }

  /** Relative "x ago" string for the last-run timestamp. */
  public TimeAgo(date: Date | null): string {
    if (!date) return 'Never';
    const diffMs = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  // ================================================================
  // Private Methods
  // ================================================================

  /** The engine instance scoped to the active provider (multi-provider safe). */
  private get engine(): FeaturePipelineEngine {
    return <FeaturePipelineEngine>(
      FeaturePipelineEngine.GetProviderInstance(this.ProviderToUse, FeaturePipelineEngine)
    );
  }

  private async loadData(forceRefresh = false): Promise<void> {
    this.IsLoading = true;
    this.cdr.detectChanges();
    try {
      const p = this.ProviderToUse;
      await this.engine.Config(forceRefresh, p.CurrentUser, p);
      this.AllPipelines = this.engine.GetSummaries();
      this.applyFilter();
    } catch (error) {
      console.error('[FeaturePipelinesResource] Error loading data:', error);
      this.AllPipelines = [];
      this.FilteredPipelines = [];
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Re-derive the summaries whenever the engine's cached Record Processes or
   * Process Runs change (save / delete / remote-invalidate elsewhere) — reactivity
   * for free from the BaseEngine streams.
   */
  private subscribeToEngine(): void {
    this.engine.Pipelines$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.AllPipelines = this.engine.GetSummaries();
      this.applyFilter();
      this.emitAgentContext();
      this.cdr.detectChanges();
    });
  }

  private applyFilter(): void {
    const q = this.SearchQuery.trim().toLowerCase();
    if (!q) {
      this.FilteredPipelines = this.AllPipelines;
      return;
    }
    this.FilteredPipelines = this.AllPipelines.filter(
      (p) =>
        p.Name.toLowerCase().includes(q) ||
        p.TargetEntity.toLowerCase().includes(q) ||
        (p.OutputAttribute ?? '').toLowerCase().includes(q),
    );
  }

  private notifyRunResult(
    pipeline: FeaturePipelineSummary,
    result: RemoteOpResult<PredictiveStudioRunFeaturePipelineOutput>,
  ): void {
    if (result.Success && result.Output) {
      const out = result.Output;
      MJNotificationService.Instance.CreateSimpleNotification(
        `"${pipeline.Name}" finished: ${out.written} written, ${out.processed} processed, ${out.error} error(s).`,
        out.error > 0 ? 'warning' : 'success',
        5000,
      );
    } else {
      MJNotificationService.Instance.CreateSimpleNotification(
        `"${pipeline.Name}" did not complete: ${result.ErrorMessage ?? 'unknown error'}`,
        'error',
        5000,
      );
    }
  }

  // ---- Agent context + client tools (required for every dashboard) ----

  private emitAgentContext(): void {
    this.navigationService.SetAgentContext(this, {
      PipelineCount: this.AllPipelines.length,
      ActiveCount: this.ActiveCount,
      NeverRunCount: this.NeverRunCount,
      FailedCount: this.FailedCount,
      SearchQuery: this.SearchQuery,
      Pipelines: this.AllPipelines.map((p) => ({
        Name: p.Name,
        TargetEntity: p.TargetEntity,
        OutputAttribute: p.OutputAttribute,
        LastRunStatus: p.LastRunStatus,
      })),
    });
  }

  private registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'RunFeaturePipeline',
        Description:
          'Run a Feature Pipeline on demand by its name. Derives + persists feature values back to the target entity.',
        ParameterSchema: {
          type: 'object',
          properties: { name: { type: 'string', description: 'The feature pipeline name' } },
          required: ['name'],
        },
        Handler: async (params: Record<string, unknown>) => {
          const name = String(params['name'] ?? '').toLowerCase();
          const match = this.AllPipelines.find((p) => p.Name.toLowerCase() === name);
          if (!match) return { Success: false, ErrorMessage: `No feature pipeline named "${params['name']}"` };
          await this.OnRunPipeline(match);
          return { Success: true };
        },
      },
      {
        Name: 'SearchFeaturePipelines',
        Description: 'Filter the feature pipeline list by a search term (name / target entity / attribute).',
        ParameterSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
        Handler: async (params: Record<string, unknown>) => {
          this.SearchQuery = String(params['query'] ?? '');
          this.OnSearchChanged();
          return { Success: true };
        },
      },
    ]);
  }
}

/** Tree-shaking prevention — keeps the component in the bundle. */
export function LoadFeaturePipelinesResource(): void {
  // Prevents tree-shaking of the component.
}
