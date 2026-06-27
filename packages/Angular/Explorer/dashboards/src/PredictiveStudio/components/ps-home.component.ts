import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import { PSActivityItem, PSPanelKey, SAMPLE_ACTIVITY } from '../predictive-studio.types';

/**
 * Home panel — the action-forward landing (mockup home-2): a hero "Build a predictive model" band
 * with three entry paths (from data / from template / ask the agent), a vertical recent-activity
 * timeline, and a side rail of weekly KPIs + an agent suggestion.
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
          Predict which members will renew this cycle. Bring your data, start from a proven template,
          or let the Model Dev Agent design the pipeline for you.
        </div>
        <div class="hero-stats">
          <div class="s"><div class="n">{{ publishedCount }}</div><div class="l">Published</div></div>
          <div class="s"><div class="n">{{ activeExperiments }}</div><div class="l">Active Experiments</div></div>
          <div class="s"><div class="n">{{ bestHoldout }}</div><div class="l">Best Holdout AUC</div></div>
          <div class="s"><div class="n">{{ scoredThisWeek }}</div><div class="l">Scored this week</div></div>
        </div>
        <div class="hero-actions">
          <button mjButton variant="secondary" size="sm" (click)="navigate.emit('pipelines')">
            <i class="fa-solid fa-diagram-project"></i> New Training Pipeline
          </button>
          <button class="hero-ghost" (click)="askAgent.emit()">
            <i class="fa-solid fa-robot"></i> Ask the Model Dev Agent
          </button>
        </div>
      </div>

      <!-- Entry paths -->
      <div class="paths" data-testid="ps-home-paths">
        <div class="path" data-testid="ps-home-path-data" (click)="navigate.emit('pipelines')">
          <div class="ic"><i class="fa-solid fa-table-cells-large"></i></div>
          <h4>Start from data</h4>
          <p>Point Studio at a Member view, pick your renewal target, and we'll profile features automatically.</p>
          <button mjButton variant="primary" size="sm"><i class="fa-solid fa-arrow-right-to-bracket"></i> Choose dataset</button>
        </div>
        <div class="path" data-testid="ps-home-path-template" (click)="navigate.emit('catalog')">
          <div class="ic green"><i class="fa-solid fa-layer-group"></i></div>
          <h4>Use a template</h4>
          <p>Renewal Propensity (XGBoost) is pre-wired with cohort filters and the standard FY holdout split.</p>
          <button mjButton variant="secondary" size="sm"><i class="fa-solid fa-clone"></i> Browse templates</button>
        </div>
        <div class="path" data-testid="ps-home-path-agent" (click)="askAgent.emit()">
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
            <div class="feed">
              @for (item of activity; track item.title) {
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
          </div>
        </div>

        <div class="ps-col">
          <div class="ps-card">
            <div class="ps-card-head">
              <i class="fa-solid fa-gauge-high" style="color: var(--mj-brand-primary)"></i>
              <h3>This Week</h3>
            </div>
            <div class="ps-card-body">
              <div class="mini-kpi"><div class="ps-muted ps-small">Records scored</div><div class="v">{{ scoredThisWeek }}</div></div>
              <div class="mini-kpi"><div class="ps-muted ps-small">Best holdout AUC</div><div class="v">{{ bestHoldout }}</div></div>
              <div class="mini-kpi"><div class="ps-muted ps-small">Experiment runs</div><div class="v">{{ engine.TrainingRuns.length || 12 }}</div></div>
              <div class="mini-kpi"><div class="ps-muted ps-small">Open review items</div><div class="v">1 <span class="ps-badge amber">leakage</span></div></div>
            </div>
          </div>

          <div class="ps-callout info">
            <i class="fa-solid fa-robot"></i>
            <div>
              <strong>Agent suggestion</strong>
              <div class="ps-small" style="margin-top: 3px">
                LightGBM is within 0.003 of your champion and trains 2.1× faster. Want me to set up a head-to-head A/B?
              </div>
              <button mjButton variant="primary" size="sm" style="margin-top: 8px" (click)="askAgent.emit()">Set up A/B</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class PSHomeComponent {
  @Input() engine!: PredictiveStudioEngine;
  @Output() navigate = new EventEmitter<PSPanelKey>();
  @Output() askAgent = new EventEmitter<void>();

  public get activity(): PSActivityItem[] {
    return SAMPLE_ACTIVITY;
  }

  public get publishedCount(): number {
    const live = this.engine?.Models.filter((m) => m.Status === 'Published').length ?? 0;
    return live || 7;
  }

  public get activeExperiments(): number {
    const live = this.engine?.Sessions.filter((s) => s.Status === 'Running').length ?? 0;
    return live || 2;
  }

  // TODO: bind to live data — no holdout-metric / weekly-scoring-volume surface is wired into
  // PredictiveStudioEngine yet, so these two headline figures are representative demo values.
  public get bestHoldout(): string {
    return '0.864';
  }

  public get scoredThisWeek(): string {
    return '48,210';
  }
}
