import { Component, OnInit, ChangeDetectorRef, Output, EventEmitter, inject } from '@angular/core';
import { DataSnapshot } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent, ArtifactViewerTab, NavigationRequest } from '../base-artifact-viewer.component';
import { CreateMarkdownSnapshot } from '../../snapshot-helpers';
import { LeaderboardRows, type LeaderboardEntryInput, type NormalizedLeaderboardRow } from './ml-leaderboard-rows';

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
  Leaderboard?: LeaderboardEntryInput[];
  /** Feature importance for the winning model (PascalCase). */
  FeatureImportance?: MLFeatureImportance[];
  /** The winning model pointer (PascalCase). */
  BestModel?: MLBestModel;
  /** Convenience scalar pointer to the winning model ID (PascalCase). */
  BestModelID?: string;
  /** The normalized target metric name (PascalCase). */
  TargetMetric?: string;
  /**
   * The training run's stored gate outcome: `model` ships the trained finalist, `keep-simple-baseline` ships a simple
   * baseline, `no-signal` ships nothing. Absent or null when the run was never evaluated under an Evaluation Protocol.
   */
  GateOutcome?: 'model' | 'keep-simple-baseline' | 'no-signal' | null;
  /** The stored gate decision's reason, in words. */
  GateReason?: string;

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
  leaderboard?: LeaderboardEntryInput[];
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
  public LeaderboardRows: readonly NormalizedLeaderboardRow[] = [];

  /** The score column's label, from the rows' own metric (see {@link LeaderboardRows.ScoreColumnLabel}). */
  public ScoreColumnLabel = 'Score';

  /** The rows state different metrics, so each score cell names its own. */
  public ShowRowMetric = false;

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

      this.LeaderboardRows = LeaderboardRows.NormalizeLeaderboardRows(this.Spec.Leaderboard || this.Spec.leaderboard || []);
      this.ScoreColumnLabel = LeaderboardRows.ScoreColumnLabel(this.LeaderboardRows, this.TargetMetricLabel);
      this.ShowRowMetric = LeaderboardRows.RowsDisagreeOnMetric(this.LeaderboardRows);
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
    return (this.Spec !== null && this.Spec !== undefined);
  }

  public override GetCurrentStateSnapshot(): DataSnapshot | null {
    // The richest portable representation is the agent-authored markdown report.
    return CreateMarkdownSnapshot(this.WinningMarkdown ?? this.getRawContent(), this.getDisplayTitle());
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

  /** The hero's label: the winning row's own metric (a search's inner-fold metric), else the artifact's target metric. */
  public get HeadlineMetricLabel(): string {
    return this.WinningRow?.MetricName || this.TargetMetricLabel;
  }

  public get TargetMetricLabel(): string {
    return this.Spec?.TargetMetric ?? this.Spec?.targetMetric ?? this.firstMetricName() ?? 'Score';
  }

  /**
   * Whether the leaderboard's marked row shipped: only when the stored outcome is `model`. A finalist the gate did not
   * ship, or one with no stored outcome, is never crowned the winner.
   */
  public get FinalistShipped(): boolean {
    return this.Spec?.GateOutcome === 'model';
  }

  /** The side card's title: the winning model, or what the gate decided instead. */
  public get OutcomeCardTitle(): string {
    switch (this.Spec?.GateOutcome) {
      case 'no-signal': return 'No model shipped';
      case 'keep-simple-baseline': return 'Kept a simple baseline';
      case 'model': return 'Winning Model';
      default: return 'Not evaluated';
    }
  }

  /** The stored gate decision's reason; empty when the artifact carries none. */
  public get GateReason(): string {
    return this.Spec?.GateReason || '';
  }

  /**
   * The "optimistic" tag's tooltip. "Best of several tries" only when the search had more than one candidate and the
   * gate shipped the finalist; a lone candidate was never selected, and a finalist the gate did not ship is not the winner.
   */
  public get OptimisticNote(): string {
    const candidates = this.LeaderboardRows.length;
    if (candidates < 2) return "The only candidate's inner-CV score on the development rows.";
    if (this.FinalistShipped) return "The winner's inner-CV score is optimistic: it was the best of several tries.";
    return `The finalist's inner-CV score, chosen among ${candidates} candidates; the gate did not ship it.`;
  }

  /** Whether a row is shown as the winner: the row the artifact marks, and only when it shipped. */
  public IsCrowned(row: NormalizedLeaderboardRow): boolean {
    return row.IsWinner && this.FinalistShipped;
  }

  /** The winning row (the one the artifact marks, which need not be rank 1), else the top row. */
  public get WinningRow(): NormalizedLeaderboardRow | null {
    return this.LeaderboardRows.find(r => r.IsWinner) ?? this.LeaderboardRows[0] ?? null;  // no winner: the top row, whose score may be null
  }

  /** Headline best score (the winning row's primary score), formatted. */
  public get HeadlineScore(): string | null {
    const score = this.WinningRow?.Score;
    return (score !== null && score !== undefined) ? this.FormatScore(score) : null;
  }

  /** The shipped model's name; for a finalist that did not ship, only a named model record (none for no-signal). */
  public get WinningAlgorithm(): string {
    const named = this.Spec?.BestModel?.Name || this.Spec?.report?.bestModelName;
    if (!this.FinalistShipped) return named || '';
    return named || this.WinningRow?.Algorithm || 'Winning model';
  }

  /**
   * The outcome card's subtitle, following the stored outcome: the shipped finalist's feature set and version; for a kept
   * baseline, that the shipped model is not the leaderboard's finalist (whose feature set it does not use); nothing when
   * the gate shipped nothing.
   */
  public get WinningModelSubtitle(): string {
    switch (this.Spec?.GateOutcome) {
      case 'keep-simple-baseline': return "A simple baseline, not the search's finalist";
      case 'model': return this.shippedFinalistSubtitle();
      default: return '';
    }
  }

  /** The "optimistic" tag's text: only a finalist chosen among several candidates is optimistic by selection. */
  public get OptimisticTagText(): string {
    return this.LeaderboardRows.length < 2 ? 'only candidate' : 'optimistic';
  }

  /** Extra headline metrics for the winning-model card. */
  public get WinningMetrics(): MLWinningMetric[] {
    const provided = this.Spec?.winningMetrics ?? [];
    if (provided.length > 0) {
      return provided;
    }
    // Synthesize a single metric from the headline score when nothing explicit was provided, only for a shipped finalist.
    if (!this.FinalistShipped) {
      return [];
    }
    const row = this.WinningRow;
    if (row?.Score !== null && row?.Score !== undefined) {
      return [{ label: row.MetricName || this.firstMetricName() || 'Score', value: this.FormatScore(row.Score) }];
    }
    return [];
  }

  public get WinningMarkdown(): string | null {
    return this.Spec?.Markdown ?? this.Spec?.report?.markdown ?? null;
  }

  /** Whether we have a resolvable model ID to drill through to. */
  public get HasDrillThroughTarget(): boolean {
    return this.resolveBestModelId() !== null;
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
    if (!row.ModelID) {
      return;
    }
    this.navigationRequest.emit({
      appName: 'Predictive Studio',
      navItemName: 'Models',
      queryParams: { modelId: row.ModelID }
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  /** A shipped finalist's subtitle: its leaderboard feature set and the model's version, whichever are known. */
  private shippedFinalistSubtitle(): string {
    const parts: string[] = [];
    if (this.WinningRow?.FeatureSet) {
      parts.push(this.WinningRow.FeatureSet);
    }
    const version = this.Spec?.BestModel?.Version ?? this.Spec?.report?.bestModelVersion;
    if ((version !== null && version !== undefined) && `${version}`.trim()) {
      parts.push(`${version}`);
    }
    return parts.join(' · ');
  }

  /**
   * Resolve the winning model ID. Priority (canonical PascalCase first):
   * BestModel.ID → BestModelID → report block → lowercase field → top leaderboard row.
   */
  private resolveBestModelId(): string | null {
    return this.Spec?.BestModel?.ID
      ?? this.Spec?.BestModelID
      ?? this.Spec?.report?.bestModelId
      ?? this.Spec?.bestModelId
      ?? this.WinningRow?.ModelID
      ?? null;
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
  public FormatScore(value: number | null): string {
    if ((value === null || value === undefined)) {
      return '—';
    }
    // Scores in [0,1] (AUC/F1) look best at 3 decimals; larger metrics (RMSE) at 2.
    const decimals = Math.abs(value) < 1 ? 3 : 2;
    return value.toFixed(decimals);
  }

  /** Format an importance weight for the small bar label. */
  public FormatImportance(value: number): string {
    if (!Number.isFinite(value)) {
      return '';
    }
    // Show .31 style for sub-1 weights, otherwise 2 decimals.
    return Math.abs(value) < 1 ? value.toFixed(2).replace(/^0/, '') : value.toFixed(2);
  }
}
