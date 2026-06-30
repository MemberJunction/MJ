import { Component, EventEmitter, Input, OnInit, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { UUIDsEqual } from '@memberjunction/global';
import { MJMLAlgorithmEntity, MJMLAlgorithmUseCaseEntity } from '@memberjunction/core-entities';
import { PredictiveStudioEngine, RecommendationLevel, RECOMMENDATION_RANK } from '../engine/predictive-studio.engine';

interface AlgoCardVM {
  algo: MJMLAlgorithmEntity;
  icon: string;
  problemTypes: string[];
  bestLevel: RecommendationLevel | null;
}

const ALGO_ICONS: Record<string, string> = {
  xgboost: 'fa-solid fa-bolt',
  lightgbm: 'fa-solid fa-feather',
  logistic_regression: 'fa-solid fa-wave-square',
  random_forest: 'fa-solid fa-tree',
  ridge: 'fa-solid fa-ruler',
  linear_regression: 'fa-solid fa-ruler',
  mlp: 'fa-solid fa-network-wired',
};

const USE_CASE_ICONS: Record<string, string> = {
  binary: 'fa-solid fa-circle-half-stroke',
  regression: 'fa-solid fa-arrow-trend-up',
  interpret: 'fa-solid fa-magnifying-glass-chart',
  tuning: 'fa-solid fa-sliders',
  large: 'fa-solid fa-gauge-high',
  embedding: 'fa-solid fa-vector-square',
  small: 'fa-solid fa-compress',
};

/**
 * Algorithm Catalog panel (mockup algorithms-2): a card gallery of the fixed algorithm catalog plus
 * a "Guide me" scenario picker. Selecting use-case chips highlights and re-sorts the algorithm cards
 * by each algorithm's best RecommendationLevel across the chosen scenarios — driven entirely by the
 * cached MJ: ML Algorithm Use Case Rankings matrix.
 */
@Component({
  standalone: true,
  selector: 'ps-catalog',
  imports: [CommonModule, MJButtonDirective],
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../predictive-studio.shared.scss', './ps-catalog.component.scss'],
  template: `
    <div class="ps-panel ps-catalog" data-testid="ps-catalog-panel">
      <!-- Guide me scenario picker -->
      <div class="ps-card guide-card">
        <div class="ps-card-body">
          <div class="guide-head">
            <i class="fa-solid fa-compass" style="color: var(--mj-brand-primary)"></i>
            <div>
              <h3>Guide me — what does your problem look like?</h3>
              <div class="ps-muted ps-small">
                Tap the scenarios that describe your data and goals. We'll highlight the algorithms that fit
                and pull the best matches to the front. Pick one or several.
              </div>
            </div>
          </div>
          <div class="chips-row">
            <div class="chips" data-testid="ps-catalog-scenarios">
              @for (uc of useCases; track uc.ID) {
                <button class="chip" [class.on]="isSelected(uc.ID)" data-testid="ps-catalog-scenario-chip" (click)="toggleUseCase(uc.ID)">
                  <i [class]="useCaseIcon(uc)"></i> {{ uc.Name }}
                </button>
              }
            </div>
            @if (selectedUseCaseIds.length > 0) {
              <button class="clearx" (click)="clearScenarios()"><i class="fa-solid fa-xmark"></i> Clear</button>
            }
          </div>
          @if (selectedUseCaseIds.length > 0) {
            <div class="ps-callout info reco-banner" data-testid="ps-catalog-reco-banner">
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              @if (recommendation.primaries.length > 0) {
                <div>For <strong>{{ recommendation.scenarioLabel }}</strong>, your top pick(s):
                  <strong>{{ recommendation.primaries.join(' & ') }}</strong>. Stronger fits are pulled to the front.</div>
              } @else {
                <div>For <strong>{{ recommendation.scenarioLabel }}</strong>, no single primary stands out —
                  review the strong fits at the top.</div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Card gallery -->
      @if (cards.length === 0) {
        <div class="ps-card"><div class="ps-card-body ps-muted">No algorithms in the catalog yet.</div></div>
      } @else {
        <div class="gallery" data-testid="ps-catalog-gallery">
          @for (card of cards; track card.algo.ID) {
            <div class="acard" data-testid="ps-catalog-card"
              [class.hit]="card.bestLevel === 'Primary'"
              [class.dim]="card.bestLevel && rank(card.bestLevel) <= 1">
              @if (card.bestLevel === 'Primary') {
                <div class="ribbon"><span class="ps-lvl ps-lvl-Primary">Primary</span></div>
              }
              <div class="ah">
                <div class="ic"><i [class]="card.icon"></i></div>
                <div class="title">
                  <div class="nm">{{ card.algo.Name }}</div>
                  <div class="ps-mono key">{{ card.algo.DriverClass }}</div>
                </div>
              </div>
              <div class="ab">
                @if (card.algo.Description) {
                  <div class="ps-muted ps-small">{{ card.algo.Description }}</div>
                }
                <div class="kv-title">Problem types</div>
                <div class="meta-row">
                  @for (pt of card.problemTypes; track pt) {
                    <span class="ps-tag">{{ pt }}</span>
                  }
                </div>
                <div class="meta-row">
                  @if (card.algo.SupportsFeatureImportance) {
                    <span class="ps-badge green"><i class="fa-solid fa-chart-column"></i> Feature importance</span>
                  } @else {
                    <span class="ps-badge red"><i class="fa-solid fa-ban"></i> No importance</span>
                  }
                </div>
              </div>
              <div class="af">
                @if (card.bestLevel) {
                  <span class="ps-lvl" [class]="'ps-lvl-' + card.bestLevel">{{ levelLabel(card.bestLevel) }}</span>
                }
                <span class="ps-spacer"></span>
                <button mjButton variant="secondary" size="sm" data-testid="ps-catalog-details"
                  [class.on]="detailId === card.algo.ID" (click)="toggleDetail(card.algo.ID)">
                  <i class="fa-solid fa-circle-info"></i> Details
                </button>
                <button mjButton variant="primary" size="sm" data-testid="ps-catalog-use"
                  (click)="useAlgorithm(card.algo)">
                  <i class="fa-solid fa-diagram-project"></i> Use
                </button>
              </div>
              @if (detailId === card.algo.ID) {
                <div class="adetail" data-testid="ps-catalog-detail">
                  @if (card.algo.Description) {
                    <p class="ps-small adetail-desc">{{ card.algo.Description }}</p>
                  }
                  <div class="dkv"><span class="dk">Problem types</span><span class="dv">{{ card.problemTypes.join(', ') || '—' }}</span></div>
                  <div class="dkv"><span class="dk">Driver class</span><span class="dv ps-mono">{{ card.algo.DriverClass }}</span></div>
                  @if (hyperparams(card.algo).length > 0) {
                    <div class="dk" style="margin-top:8px">Default hyperparameters</div>
                    <div class="hp-list">
                      @for (hp of hyperparams(card.algo); track hp.k) {
                        <div class="hp"><span class="ps-mono">{{ hp.k }}</span><span class="ps-mono ps-muted">{{ hp.v }}</span></div>
                      }
                    </div>
                  } @else {
                    <div class="ps-small ps-muted" style="margin-top:6px">Sensible defaults are applied at training time.</div>
                  }
                  <div class="adetail-foot">
                    <button mjButton variant="primary" size="sm" (click)="useAlgorithm(card.algo)">
                      <i class="fa-solid fa-diagram-project"></i> Use this algorithm
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PSCatalogComponent implements OnInit {
  @Input() engine!: PredictiveStudioEngine;

  /** Emitted with a starter prompt to open + seed the Model Development Agent chat. */
  @Output() askAgent = new EventEmitter<string>();

  public selectedUseCaseIds: string[] = [];
  public cards: AlgoCardVM[] = [];
  /** The algorithm whose inline detail panel is expanded (null = none). */
  public detailId: string | null = null;

  ngOnInit(): void {
    this.rebuildCards();
  }

  public get useCases(): MJMLAlgorithmUseCaseEntity[] {
    return this.engine?.UseCases ?? [];
  }

  public useCaseIcon(uc: MJMLAlgorithmUseCaseEntity): string {
    const name = (uc.Name || '').toLowerCase();
    if (name.includes('binary')) return USE_CASE_ICONS['binary'];
    if (name.includes('regression')) return USE_CASE_ICONS['regression'];
    if (name.includes('interpret')) return USE_CASE_ICONS['interpret'];
    if (name.includes('tuning') || name.includes('minimal')) return USE_CASE_ICONS['tuning'];
    if (name.includes('large') || name.includes('wide') || name.includes('speed')) return USE_CASE_ICONS['large'];
    if (name.includes('embedding') || name.includes('llm')) return USE_CASE_ICONS['embedding'];
    if (name.includes('small')) return USE_CASE_ICONS['small'];
    return 'fa-solid fa-circle-dot';
  }

  public isSelected(id: string): boolean {
    return this.selectedUseCaseIds.some((s) => UUIDsEqual(s, id));
  }

  public toggleUseCase(id: string): void {
    if (this.isSelected(id)) {
      this.selectedUseCaseIds = this.selectedUseCaseIds.filter((s) => !UUIDsEqual(s, id));
    } else {
      this.selectedUseCaseIds = [...this.selectedUseCaseIds, id];
    }
    this.rebuildCards();
  }

  public clearScenarios(): void {
    this.selectedUseCaseIds = [];
    this.rebuildCards();
  }

  // ---- algorithm card actions ----

  /** Toggle the inline detail panel for an algorithm card. */
  public toggleDetail(id: string): void {
    this.detailId = this.detailId === id ? null : id;
  }

  /** Seed the Model Development Agent to build a model with the chosen algorithm. */
  public useAlgorithm(algo: MJMLAlgorithmEntity): void {
    this.askAgent.emit(
      `Help me build a predictive model using the ${algo.Name} algorithm. ` +
        `Walk me through choosing the entity, the outcome to predict, and the features to assemble.`,
    );
  }

  /** Parse an algorithm's `DefaultHyperparameters` JSON into a small key/value list (≤8 rows). */
  public hyperparams(algo: MJMLAlgorithmEntity): { k: string; v: string }[] {
    const raw = algo.DefaultHyperparameters;
    if (!raw) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return [];
      }
      return Object.entries(parsed as Record<string, unknown>)
        .map(([k, v]) => ({ k, v: String(v) }))
        .slice(0, 8);
    } catch {
      return [];
    }
  }

  public rank(level: RecommendationLevel): number {
    return RECOMMENDATION_RANK[level];
  }

  public levelLabel(level: RecommendationLevel): string {
    switch (level) {
      case 'Primary': return 'Primary fit';
      case 'Strong': return 'Strong fit';
      case 'Viable': return 'Viable';
      case 'Weak': return 'Weak fit';
      case 'NotRecommended': return 'N/A';
    }
  }

  /**
   * Structured recommendation data for the "Guide me" banner — rendered with plain template
   * interpolation + `<strong>` markup (no `[innerHTML]`). `scenarioLabel` is the human-readable
   * scenario name(s); `primaries` is the list of Primary-fit algorithm names.
   */
  public get recommendation(): { scenarioLabel: string; primaries: string[] } {
    const levels = this.engine.BestLevelsForScenarios(this.selectedUseCaseIds);
    const primaries = this.engine.Algorithms.filter((a) => levels.get(a.ID) === 'Primary').map((a) => a.Name);
    const scenarioLabel =
      this.selectedUseCaseIds.length === 1
        ? this.useCases.find((u) => UUIDsEqual(u.ID, this.selectedUseCaseIds[0]))?.Name ?? 'your scenario'
        : `${this.selectedUseCaseIds.length} scenarios`;
    return { scenarioLabel, primaries };
  }

  private rebuildCards(): void {
    const levels = this.engine.BestLevelsForScenarios(this.selectedUseCaseIds);
    const cards: AlgoCardVM[] = this.engine.Algorithms.map((algo) => ({
      algo,
      icon: ALGO_ICONS[algo.DriverClass] ?? 'fa-solid fa-shapes',
      problemTypes: (algo.ProblemTypes || '').split(',').map((p) => p.trim()).filter((p) => p.length > 0),
      bestLevel: levels.get(algo.ID) ?? null,
    }));
    if (this.selectedUseCaseIds.length > 0) {
      cards.sort((a, b) => {
        const ra = a.bestLevel ? RECOMMENDATION_RANK[a.bestLevel] : -1;
        const rb = b.bestLevel ? RECOMMENDATION_RANK[b.bestLevel] : -1;
        return rb - ra;
      });
    }
    this.cards = cards;
  }
}
