import { ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSPanelKey } from '../predictive-studio.types';
import { PS_AGENT_STARTER_PROMPT } from './ps-agent-starter-prompt';

export { PS_AGENT_STARTER_PROMPT } from './ps-agent-starter-prompt';
import {
  PSActivityFeedItem,
  PSHomeKpis,
  PSModelEventSource,
  PSProcessRunRow,
  buildActivityFeed,
  computeHomeKpis,
  deriveModelEvents,
} from '../predictive-studio.view-models';

/**
 * Home panel — the action-forward landing: a hero "Build a predictive model" band with three entry
 * paths, a vertical recent-activity timeline, and a side rail of weekly KPIs. Fully live:
 *
 * - **KPIs** (published count, active experiments, best holdout AUC, scored-this-week) come from the
 *   cached models/sessions + recent ML scoring runs loaded on demand, via {@link computeHomeKpis}.
 * - **Recent activity** merges recent ML scoring process runs and recent model promotions/archives
 *   into one reverse-chronological feed via {@link buildActivityFeed}.
 *
 * Recent scoring runs are loaded once on init (cheap, capped) — `MJ: Process Runs` isn't bulk-cached
 * because it grows unbounded. 100% entity-agnostic.
 *
 * **"Ask the agent" entry path.** The hero CTA and the agent entry-path card emit {@link askAgent} with a
 * starter prompt string. The host resource (the Studio door's `PSStudioResourceComponent`) reveals the
 * docked Model Development Agent chat seeded with that prompt. The prompt is a deliberately entity-agnostic template
 * ({@link PS_AGENT_STARTER_PROMPT}) — it never names a specific entity/target, so Predictive Studio stays
 * 100% domain-neutral and the agent leads the user through choosing what to predict.
 */
@Component({
  standalone: true,
  selector: 'ps-home',
  imports: [CommonModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-home.component.scss'],
  template: `
    <div class="ps-panel ps-home" data-testid="ps-home-panel">
      <!-- Hero -->
      <div class="hero" data-testid="ps-home-hero">
        <h2>Build a predictive model</h2>
        <div class="sub">
          Train a model on your own data, start from a proven template, or let the Model Dev Agent
          design the pipeline for you.
        </div>
        <div class="hero-stats">
          <div class="s"><div class="n">{{ kpis.publishedCount }}</div><div class="l">Published</div></div>
          <div class="s"><div class="n">{{ kpis.activeExperiments }}</div><div class="l">Active Experiments</div></div>
          <div class="s"><div class="n">{{ kpis.bestHoldout }}</div><div class="l">Best Holdout AUC</div></div>
          <div class="s"><div class="n">{{ kpis.scoredThisWeek }}</div><div class="l">Scored this week</div></div>
        </div>
        <div class="hero-actions">
          <button mjButton variant="secondary" size="sm" (click)="navigate.emit('pipelines')">
            <i class="fa-solid fa-diagram-project"></i> New Training Pipeline
          </button>
          <button class="hero-ghost" (click)="onAskAgent()">
            <i class="fa-solid fa-robot"></i> Ask the Model Dev Agent
          </button>
        </div>
      </div>

      <!-- Entry paths -->
      <div class="paths" data-testid="ps-home-paths">
        <div class="path" data-testid="ps-home-path-data" (click)="navigate.emit('pipelines')">
          <div class="ic"><i class="fa-solid fa-table-cells-large"></i></div>
          <h4>Start from data</h4>
          <p>Point Studio at any entity's records, pick the target you want to predict, and we'll profile features automatically.</p>
          <button mjButton variant="primary" size="sm"><i class="fa-solid fa-arrow-right-to-bracket"></i> Choose dataset</button>
        </div>
        <div class="path" data-testid="ps-home-path-template" (click)="navigate.emit('catalog')">
          <div class="ic green"><i class="fa-solid fa-layer-group"></i></div>
          <h4>Use a template</h4>
          <p>Browse the algorithm catalog with a use-case guide that ranks each algorithm for your scenario.</p>
          <button mjButton variant="secondary" size="sm"><i class="fa-solid fa-clone"></i> Browse catalog</button>
        </div>
        <div class="path" data-testid="ps-home-path-agent" (click)="onAskAgent()">
          <div class="ic purple"><i class="fa-solid fa-robot"></i></div>
          <h4>Ask the agent</h4>
          <p>Describe the goal in plain English. The agent proposes algorithms, features, and a budget.</p>
          <button mjButton variant="secondary" size="sm"><i class="fa-solid fa-comment-dots"></i> Open agent</button>
        </div>
      </div>

      <!-- Lower: timeline + side rail -->
      <div class="lower">
        <div class="ps-card">
          <div class="ps-card-head">
            <i class="fa-solid fa-clock-rotate-left" style="color: var(--mj-brand-primary)"></i>
            <h3>Recent Activity</h3>
            <span class="ps-spacer"></span>
          </div>
          <div class="ps-card-body">
            @if (activity.length > 0) {
              <div class="feed">
                @for (item of activity; track item.title + item.when) {
                  <div class="fitem">
                    <div class="ev" [class]="item.kind"><i [class]="item.icon"></i></div>
                    <div>
                      <div class="ftitle">{{ item.title }}</div>
                      <div class="ps-muted ps-small">{{ item.detail }}</div>
                      <div class="when">{{ item.when }}</div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="ps-empty" style="padding:32px 16px">
                <span class="ps-empty-ico"><i class="fa-solid fa-clock-rotate-left"></i></span>
                <p>No activity yet. Promote a model or run a scoring batch and it'll show up here.</p>
              </div>
            }
          </div>
        </div>

        <div class="ps-col">
          <div class="ps-card">
            <div class="ps-card-head">
              <i class="fa-solid fa-gauge-high" style="color: var(--mj-brand-primary)"></i>
              <h3>This Week</h3>
            </div>
            <div class="ps-card-body">
              <div class="mini-kpi"><div class="ps-muted ps-small">Records scored</div><div class="v">{{ kpis.scoredThisWeek }}</div></div>
              <div class="mini-kpi"><div class="ps-muted ps-small">Best holdout AUC</div><div class="v">{{ kpis.bestHoldout }}</div></div>
              <div class="mini-kpi"><div class="ps-muted ps-small">Experiment runs</div><div class="v">{{ kpis.experimentRuns }}</div></div>
              <div class="mini-kpi"><div class="ps-muted ps-small">Published models</div><div class="v">{{ kpis.publishedCount }}</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PSHomeComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;
  /** Provider to load recent scoring runs through (multi-provider correctness). */
  @Input() provider: IMetadataProvider | null = null;
  /** Acting user for the on-demand scoring-runs load. */
  @Input() currentUser: UserInfo | null = null;
  @Output() navigate = new EventEmitter<PSPanelKey>();
  /**
   * Emitted when the user clicks an "Ask the agent" entry path. The payload is the starter prompt to seed
   * the Model Development Agent chat with — the entity-agnostic {@link PS_AGENT_STARTER_PROMPT} by default.
   */
  @Output() askAgent = new EventEmitter<string>();

  private cdr = inject(ChangeDetectorRef);

  /** Entry-path handler — emits {@link askAgent} with the default entity-agnostic starter prompt. */
  public onAskAgent(): void {
    this.askAgent.emit(PS_AGENT_STARTER_PROMPT);
  }

  /** Derived KPI strip. Starts from the synchronously-available counts, refined once runs load. */
  public kpis: PSHomeKpis = { publishedCount: 0, activeExperiments: 0, bestHoldout: '—', scoredThisWeek: '0', experimentRuns: 0 };
  /** Recent-activity timeline. */
  public activity: PSActivityFeedItem[] = [];

  /** Cached recent scoring runs (loaded on demand). */
  private scoringRuns: PSProcessRunRow[] = [];

  async ngOnInit(): Promise<void> {
    // Render immediately from cached data, then refine with the on-demand scoring-run load.
    this.rebuild();
    await this.loadScoringRuns();
    this.rebuild();
    this.cdr.detectChanges();
  }

  /** Load the recent ML scoring runs once (cheap, capped) for the KPI + activity feed. */
  private async loadScoringRuns(): Promise<void> {
    if (!this.provider) return;
    try {
      this.scoringRuns = await this.engine.LoadRecentScoringRuns(this.provider, this.currentUser ?? undefined, {
        sinceDays: 7,
        maxRows: 50,
      });
    } catch {
      this.scoringRuns = [];
    }
  }

  /** Recompute the KPI strip + activity feed from the current cached data + scoring runs. */
  private rebuild(): void {
    const models = this.engine?.Models ?? [];
    const runningSessions = this.engine?.RunningSessions.length ?? 0;
    const experimentRuns = this.engine?.Iterations.length ?? 0;

    this.kpis = computeHomeKpis(models, runningSessions, this.scoringRuns, experimentRuns);

    const eventSources: PSModelEventSource[] = models.map((m) => ({
      Name: this.engine.ModelDisplayName(m),
      Algorithm: this.engine.AlgorithmName(m.AlgorithmID),
      Status: m.Status,
      Metrics: m.Metrics,
      HoldoutMetrics: m.HoldoutMetrics,
      UpdatedAt: m.__mj_UpdatedAt,
    }));
    this.activity = buildActivityFeed(this.scoringRuns, deriveModelEvents(eventSources), new Date(), 6);
  }
}
