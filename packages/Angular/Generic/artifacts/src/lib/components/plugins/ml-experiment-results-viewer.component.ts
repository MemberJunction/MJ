import { Component, OnInit, ChangeDetectorRef, Output, EventEmitter, inject } from '@angular/core';
import { DataSnapshot } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent, ArtifactViewerTab, NavigationRequest } from '../base-artifact-viewer.component';
import { createMarkdownSnapshot } from '../../snapshot-helpers';

/**
 * A single feature-importance entry for the winning model.
 */
interface MLFeatureImportance {
  /** Display name of the feature */
  feature?: string;
  name?: string;
  /** Importance weight (0..1 or any positive scale — bars are normalized to the max) */
  importance?: number;
  weight?: number;
  value?: number;
}

/**
 * A single leaderboard iteration row.
 *
 * Accepts both the **canonical** Core `ModelingPlanSpec.Leaderboard` shape
 * (PascalCase: `Metric`/`ModelID`/`IterationID`, produced by the deterministic
 * `ExperimentOrchestrator`) and the older / LLM-authored lowercase shape. All
 * fields are optional so partial artifacts degrade gracefully.
 */
interface MLLeaderboardEntry {
  // ── Canonical (Core ModelingPlanSpec.Leaderboard entry) ──
  /** The iteration this entry scores (`MJ: Experiment Session Iterations` id). */
  IterationID?: string;
  /** The normalized leaderboard metric value (the Experiment's TargetMetric). */
  Metric?: number;
  /** The trained ML Model record ID for drill-through. */
  ModelID?: string;

  // ── Lowercase / LLM-authored fallbacks + display-only fields ──
  /** Rank (1 = best). If absent, derived from array order. */
  rank?: number;
  /** Algorithm name, e.g. "XGBoost" */
  algorithm?: string;
  algorithmName?: string;
  /** Feature set label, e.g. "engagement", "full", "interpretable" */
  featureSet?: string;
  /** Primary normalized leaderboard score (the Experiment's TargetMetric) */
  score?: number;
  /** Optional secondary metric (e.g. cross-validation score) */
  cvScore?: number;
  /** The trained ML Model record ID for drill-through (lowercase fallback) */
  modelId?: string;
  /** Named metric label for the primary score column header */
  metricName?: string;
}

/**
 * Headline / extra metrics for the winning model card.
 */
interface MLWinningMetric {
  label?: string;
  value?: number | string;
}

/**
 * The reporting-phase block authored by the Model Development Agent.
 */
interface MLExperimentReport {
  name?: string;
  summary?: string;
  markdown?: string;
  /** The winning ML Model record ID (drill-through target) */
  bestModelId?: string;
  bestModelName?: string;
  bestModelVersion?: string;
}

/**
 * The canonical best-model pointer on a `ModelingPlanSpec`-shaped artifact.
 */
interface MLBestModel {
  ID?: string;
  Name?: string;
  Version?: string | number;
}

/**
 * ML Experiment Results artifact content shape.
 *
 * The **canonical** shape is the Core `ModelingPlanSpec` (PascalCase: `Goal`,
 * `Leaderboard`, `BestModel`/`BestModelID`, `Markdown`, …) produced by the
 * deterministic `ExperimentOrchestrator` and the Model Development Agent's
 * reporting phase (content type `application/vnd.mj.ml-experiment-results`).
 *
 * Older / LLM-authored lowercase fields (`goal`, `leaderboard`, `report`, …)
 * are retained as graceful fallbacks. All fields are optional so partial/older
 * artifacts degrade gracefully.
 */
interface MLExperimentResultsSpec {
  // ── Canonical (Core ModelingPlanSpec) ──
  /** Display name / title of the session (PascalCase). */
  Name?: string;
  /** The modeling goal, plain language (PascalCase). */
  Goal?: string;
  /** Plain-language summary of the results (PascalCase). */
  Summary?: string;
  /** The full results narrative in markdown (PascalCase). */
  Markdown?: string;
  /** Ranked leaderboard of experiment iterations (PascalCase Core shape). */
  Leaderboard?: MLLeaderboardEntry[];
  /** Feature importance for the winning model (PascalCase). */
  FeatureImportance?: MLFeatureImportance[];
  /** The winning model pointer (PascalCase). */
  BestModel?: MLBestModel;
  /** Convenience scalar pointer to the winning model ID (PascalCase). */
  BestModelID?: string;
  /** The normalized target metric name (PascalCase). */
  TargetMetric?: string;

  // ── Lowercase / LLM-authored fallbacks ──
  /** The modeling goal, plain language */
  goal?: string;
  /** Prediction target (e.g. "Renewed") */
  target?: string;
  /** As-of cutoff description (leakage guard) */
  asOf?: string;
  /** Validation strategy description */
  validation?: string;
  /** Budget usage description (e.g. "22 / 25 runs · 58 min") */
  budgetUsed?: string;
  /** The normalized target metric name (column header / headline label) */
  targetMetric?: string;
  /** Ranked leaderboard of experiment iterations */
  leaderboard?: MLLeaderboardEntry[];
  /** Feature importance for the winning model */
  featureImportance?: MLFeatureImportance[];
  /** Convenience pointer to the winning model ID (also resolvable via report/leaderboard) */
  bestModelId?: string;
  /** Extra headline metrics for the winning-model card */
  winningMetrics?: MLWinningMetric[];
  /** The reporting-phase block (markdown, summary, best model) */
  report?: MLExperimentReport;
}

/**
 * Normalized leaderboard row for the template (resolves alias fields + derived rank).
 */
interface NormalizedLeaderboardRow {
  rank: number;
  algorithm: string;
  featureSet: string;
  score: number | null;
  cvScore: number | null;
  modelId: string | null;
  isWinner: boolean;
}

/**
 * Normalized feature-importance bar for the template (resolves alias + percent width).
 */
interface NormalizedFeatureBar {
  feature: string;
  importance: number;
  /** Width percentage relative to the most important feature (0..100) */
  widthPct: number;
}

/**
 * Viewer plugin for **ML Experiment Results** artifacts (Predictive Studio).
 *
 * Renders the experiment goal + headline best metric, a ranked leaderboard of
 * iterations, feature-importance bars for the winning model, and a winning-model
 * card with a drill-through button that issues a {@link NavigationRequest} to open
 * the winning `MJ: ML Models` record in Predictive Studio's "Models" nav item.
 *
 * Falls back to a friendly empty state when the JSON can't be parsed, and exposes
 * the agent-authored markdown report as an additional "Report" tab when present.
 */
@Component({
  standalone: false,
  selector: 'mj-ml-experiment-results-viewer',
  templateUrl: './ml-experiment-results-viewer.component.html',
  styleUrls: ['./ml-experiment-results-viewer.component.css']
})
@RegisterClass(BaseArtifactViewerPluginComponent, 'MLExperimentResultsViewerPlugin')
export class MLExperimentResultsViewerComponent extends BaseArtifactViewerPluginComponent implements OnInit {
  /** Emitted to request app-level navigation (drill-through to the ML Model record). */
  @Output() override navigationRequest = new EventEmitter<NavigationRequest>();

  private cdr = inject(ChangeDetectorRef);

  /** Parsed artifact content. */
  public Spec: MLExperimentResultsSpec | null = null;

  public IsLoading = true;
  public HasError = false;
  public ErrorMessage = '';

  /** Normalized, ranked leaderboard rows for rendering. */
  public LeaderboardRows: NormalizedLeaderboardRow[] = [];

  /** Normalized feature-importance bars for rendering. */
  public FeatureBars: NormalizedFeatureBar[] = [];

  // ─── Lifecycle ───────────────────────────────────────────────────

  ngOnInit(): void {
    try {
      this.Spec = this.parseJsonContent<MLExperimentResultsSpec>();
      if (!this.Spec) {
        this.HasError = true;
        this.ErrorMessage = 'Could not parse the ML Experiment Results content as JSON.';
        return;
      }

      this.LeaderboardRows = this.buildLeaderboardRows(this.Spec.Leaderboard ?? this.Spec.leaderboard ?? []);
      this.FeatureBars = this.buildFeatureBars(this.Spec.FeatureImportance ?? this.Spec.featureImportance ?? []);
    } catch (error) {
      this.HasError = true;
      this.ErrorMessage = error instanceof Error ? error.message : 'Failed to load experiment results.';
    } finally {
      this.IsLoading = false;
      this.cdr.detectChanges();
    }
  }

  // ─── Base-class contract ─────────────────────────────────────────

  public override get hasDisplayContent(): boolean {
    return this.Spec != null;
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    // The richest portable representation is the agent-authored markdown report.
    return createMarkdownSnapshot(this.WinningMarkdown ?? this.getRawContent(), this.getDisplayTitle());
  }

  /**
   * Expose the agent-authored markdown report as an additional "Report" tab
   * so users can read the full narrative alongside the rich visual display.
   */
  public GetAdditionalTabs(): ArtifactViewerTab[] {
    const markdown = this.Spec?.Markdown ?? this.Spec?.report?.markdown;
    if (!markdown) {
      return [];
    }
    return [
      {
        label: 'Report',
        icon: 'fa-file-lines',
        contentType: 'markdown',
        content: markdown
      }
    ];
  }

  // ─── Display getters ─────────────────────────────────────────────

  public get Goal(): string {
    return this.Spec?.Goal ?? this.Spec?.goal ?? this.Spec?.Summary ?? this.Spec?.report?.summary ?? '';
  }

  public get Summary(): string {
    return this.Spec?.Summary ?? this.Spec?.report?.summary ?? '';
  }

  public get TargetMetricLabel(): string {
    return this.Spec?.TargetMetric ?? this.Spec?.targetMetric ?? this.firstMetricName() ?? 'Score';
  }

  /** The winning row (rank 1) if any. */
  public get WinningRow(): NormalizedLeaderboardRow | null {
    return this.LeaderboardRows.find(r => r.isWinner) ?? this.LeaderboardRows[0] ?? null;
  }

  /** Headline best score (the winning row's primary score), formatted. */
  public get HeadlineScore(): string | null {
    const score = this.WinningRow?.score;
    return score != null ? this.formatScore(score) : null;
  }

  public get WinningAlgorithm(): string {
    return this.Spec?.BestModel?.Name ?? this.Spec?.report?.bestModelName ?? this.WinningRow?.algorithm ?? 'Winning model';
  }

  public get WinningModelSubtitle(): string {
    const parts: string[] = [];
    if (this.WinningRow?.featureSet) {
      parts.push(this.WinningRow.featureSet);
    }
    const version = this.Spec?.BestModel?.Version ?? this.Spec?.report?.bestModelVersion;
    if (version != null && `${version}`.trim()) {
      parts.push(`${version}`);
    }
    return parts.join(' · ');
  }

  /** Extra headline metrics for the winning-model card. */
  public get WinningMetrics(): MLWinningMetric[] {
    const provided = this.Spec?.winningMetrics ?? [];
    if (provided.length > 0) {
      return provided;
    }
    // Synthesize a single metric from the headline score when nothing explicit was provided.
    const row = this.WinningRow;
    if (row?.score != null) {
      return [{ label: this.firstMetricName() ?? 'Score', value: this.formatScore(row.score) }];
    }
    return [];
  }

  public get WinningMarkdown(): string | null {
    return this.Spec?.Markdown ?? this.Spec?.report?.markdown ?? null;
  }

  /** Whether we have a resolvable model ID to drill through to. */
  public get HasDrillThroughTarget(): boolean {
    return this.resolveBestModelId() != null;
  }

  public get LeaderboardSize(): number {
    return this.LeaderboardRows.length;
  }

  // ─── Actions ─────────────────────────────────────────────────────

  /**
   * Drill through to the winning ML Model record in Predictive Studio.
   * Matches the §9.4 contract: NavigationRequest to the 'Models' nav item.
   */
  public OnDrillThroughToModel(): void {
    const modelId = this.resolveBestModelId();
    if (!modelId) {
      return;
    }
    this.navigationRequest.emit({
      appName: 'Predictive Studio',
      navItemName: 'Models',
      queryParams: { modelId }
    });
  }

  /**
   * Drill through to a specific leaderboard row's model, when that row carries a modelId.
   */
  public OnOpenRowModel(row: NormalizedLeaderboardRow): void {
    if (!row.modelId) {
      return;
    }
    this.navigationRequest.emit({
      appName: 'Predictive Studio',
      navItemName: 'Models',
      queryParams: { modelId: row.modelId }
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  /**
   * Resolve the winning model ID. Priority (canonical PascalCase first):
   * BestModel.ID → BestModelID → report block → lowercase field → top leaderboard row.
   */
  private resolveBestModelId(): string | null {
    return this.Spec?.BestModel?.ID
      ?? this.Spec?.BestModelID
      ?? this.Spec?.report?.bestModelId
      ?? this.Spec?.bestModelId
      ?? this.WinningRow?.modelId
      ?? null;
  }

  /** Build normalized, ranked leaderboard rows from raw entries. */
  private buildLeaderboardRows(entries: MLLeaderboardEntry[]): NormalizedLeaderboardRow[] {
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    const rows = entries.map((e, index) => ({
      // Canonical `Leaderboard` is already best-first; derive rank from order.
      rank: e.rank ?? index + 1,
      algorithm: e.algorithm ?? e.algorithmName ?? 'Unknown',
      featureSet: e.featureSet ?? '',
      // Canonical: `Metric`; fallback: lowercase `score`.
      score: this.firstDefined(e.Metric ?? e.score),
      cvScore: this.firstDefined(e.cvScore),
      // Canonical: `ModelID`; fallback: lowercase `modelId`.
      modelId: e.ModelID ?? e.modelId ?? null,
      isWinner: false
    }));

    // Sort by explicit rank ascending (rank 1 is best).
    rows.sort((a, b) => a.rank - b.rank);
    if (rows.length > 0) {
      rows[0].isWinner = true;
    }
    return rows;
  }

  /** Build normalized feature-importance bars (widths relative to the max). */
  private buildFeatureBars(entries: MLFeatureImportance[]): NormalizedFeatureBar[] {
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    const resolved = entries.map(e => ({
      feature: e.feature ?? e.name ?? 'Feature',
      importance: this.firstDefined(e.importance ?? e.weight ?? e.value) ?? 0
    }));

    const max = resolved.reduce((m, r) => Math.max(m, r.importance), 0);
    // Sort descending by importance for a clean ranked bar chart.
    resolved.sort((a, b) => b.importance - a.importance);

    return resolved.map(r => ({
      feature: r.feature,
      importance: r.importance,
      widthPct: max > 0 ? Math.max(2, Math.round((r.importance / max) * 100)) : 0
    }));
  }

  /** First metric name found on the leaderboard, for column/label fallback. */
  private firstMetricName(): string | null {
    const entry = (this.Spec?.Leaderboard ?? this.Spec?.leaderboard)?.[0];
    return entry?.metricName ?? null;
  }

  /** Return the value if it's a finite number, else null. */
  private firstDefined(value: number | undefined | null): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  /** Format a numeric score for display (3 decimals, trimmed). */
  public formatScore(value: number | null): string {
    if (value == null) {
      return '—';
    }
    // Scores in [0,1] (AUC/F1) look best at 3 decimals; larger metrics (RMSE) at 2.
    const decimals = Math.abs(value) < 1 ? 3 : 2;
    return value.toFixed(decimals);
  }

  /** Format an importance weight for the small bar label. */
  public formatImportance(value: number): string {
    if (!Number.isFinite(value)) {
      return '';
    }
    // Show .31 style for sub-1 weights, otherwise 2 decimals.
    return Math.abs(value) < 1 ? value.toFixed(2).replace(/^0/, '') : value.toFixed(2);
  }
}
