import { Component, EventEmitter, Input, OnInit, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { UUIDsEqual } from '@memberjunction/global';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';

/** A training pipeline row, projected live from `MJ: ML Training Pipelines` + its trained models. */
interface PipelineRowVM {
  id: string;
  name: string;
  description: string;
  status: string;
  version: number;
  problemType: string;
  targetVariable: string;
  /** How many `MJ: ML Models` were produced from this pipeline. */
  modelCount: number;
}

/** Entity-agnostic starter prompt that seeds the Model Development Agent to build a pipeline. */
const PS_PIPELINES_STARTER_PROMPT =
  'Help me build a training pipeline. I will tell you what I want to predict and on which entity; ' +
  'you assemble the features (guarding against leakage), pick an algorithm, and train a versioned model.';

/**
 * Training Pipelines panel — a LIVE view of `MJ: ML Training Pipelines` (no mock data). A training
 * pipeline assembles features, picks an algorithm, and trains versioned models; they are authored
 * conversationally via the Model Development Agent, so this panel lists what exists and routes the
 * user to the agent to create or refine one. Fully entity-agnostic — everything shown comes from the
 * pipeline records and their trained models, never any hardcoded business entity.
 */
@Component({
  standalone: true,
  selector: 'ps-pipelines',
  imports: [CommonModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-pipelines.component.scss'],
  template: `
    <div class="ps-panel ps-pipelines" data-testid="ps-pipelines-panel">
      @if (pipelines.length === 0) {
        <div class="ps-empty" data-testid="ps-pipelines-empty">
          <span class="ps-empty-ico"><i class="fa-solid fa-diagram-project"></i></span>
          <h3>No training pipelines yet</h3>
          <p>
            A training pipeline assembles features from your data, picks an algorithm, and trains a
            versioned model. The fastest way to build one is to describe your goal to the Model
            Development Agent — it designs the pipeline, guards against target leakage, and trains for you.
          </p>
          <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-ask-agent"
            (click)="askAgent.emit(starterPrompt)">
            <i class="fa-solid fa-robot"></i> Ask the agent to build one
          </button>
        </div>
      } @else {
        <div class="pl-head">
          <span class="ps-badge gray">{{ pipelines.length }}</span>
          <span class="ps-muted ps-small">training pipeline{{ pipelines.length === 1 ? '' : 's' }}</span>
          <span class="ps-spacer"></span>
          <button mjButton variant="primary" size="sm" data-testid="ps-pipelines-build"
            (click)="askAgent.emit(starterPrompt)">
            <i class="fa-solid fa-robot"></i> Build with agent
          </button>
        </div>

        <div class="pl-grid" data-testid="ps-pipelines-grid">
          @for (p of pipelines; track p.id) {
            <div class="ps-card pl-card" data-testid="ps-pipelines-card">
              <div class="ps-card-head">
                <i class="fa-solid fa-diagram-project pl-ico"></i>
                <h3>{{ p.name }}</h3>
                <span class="ps-spacer"></span>
                <span class="ps-badge" [class]="statusClass(p.status)">{{ p.status }}</span>
              </div>
              <div class="ps-card-body">
                <div class="pl-meta">
                  @if (p.problemType) { <span class="ps-tag">{{ p.problemType }}</span> }
                  @if (p.targetVariable) { <span class="ps-tag">predicts {{ p.targetVariable }}</span> }
                  <span class="ps-tag ps-mono">v{{ p.version }}</span>
                </div>
                @if (p.description) { <p class="ps-muted ps-small pl-desc">{{ p.description }}</p> }
                <div class="ps-divider"></div>
                <div class="pl-foot">
                  <span class="ps-small ps-muted">
                    <i class="fa-solid fa-cube"></i>
                    {{ p.modelCount }} model{{ p.modelCount === 1 ? '' : 's' }} trained
                  </span>
                  <span class="ps-spacer"></span>
                  <button mjButton variant="secondary" size="sm" data-testid="ps-pipelines-refine"
                    (click)="refine(p)">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Refine with agent
                  </button>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PSPipelinesComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;

  /** Emitted with a starter prompt to open + seed the Model Development Agent chat. */
  @Output() askAgent = new EventEmitter<string>();

  public readonly starterPrompt = PS_PIPELINES_STARTER_PROMPT;
  public pipelines: PipelineRowVM[] = [];

  ngOnInit(): void {
    this.build();
  }

  /** Project the cached `MJ: ML Training Pipelines` (+ their model counts) into row view-models. */
  private build(): void {
    const models = this.engine?.Models ?? [];
    this.pipelines = (this.engine?.Pipelines ?? []).map((p) => ({
      id: p.ID,
      name: p.Name,
      description: p.Description ?? '',
      status: p.Status ?? 'Draft',
      version: p.Version ?? 1,
      problemType: p.ProblemType ?? '',
      targetVariable: p.TargetVariable ?? '',
      modelCount: models.filter((m) => UUIDsEqual(m.PipelineID, p.ID)).length,
    }));
  }

  /** Status → `ps-badge` color modifier. */
  public statusClass(status: string): string {
    switch (status) {
      case 'Active':
        return 'green';
      case 'Draft':
        return 'amber';
      case 'Disabled':
        return 'gray';
      default:
        return 'gray';
    }
  }

  /** Seed the agent to train another model from an existing pipeline. */
  public refine(p: PipelineRowVM): void {
    const predicts = p.targetVariable ? ` (predicts ${p.targetVariable})` : '';
    this.askAgent.emit(
      `Help me train another model from the "${p.name}" training pipeline${predicts}. ` +
        `Suggest improvements to the features or algorithm to raise holdout performance.`,
    );
  }
}
