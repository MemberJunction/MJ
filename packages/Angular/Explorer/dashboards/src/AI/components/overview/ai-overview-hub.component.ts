import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

/**
 * Represents a single stat badge displayed inside a navigation card.
 */
interface CardStat {
  Label: string;
  Value: number;
}

/**
 * Represents a navigation card on the Overview Hub grid.
 */
interface NavigationCard {
  Key: string;
  Title: string;
  Description: string;
  Icon: string;
  ColorClass: string;
  Stats: CardStat[];
  NavItemLabel: string;
}

/**
 * AI Overview Hub — the default landing page for the AI Administration application.
 * Displays quick stats and navigation cards using only in-memory data from AIEngineBase.
 */
@RegisterClass(BaseResourceComponent, 'AIMonitorResource')
@Component({
  standalone: false,
  selector: 'app-ai-overview-hub',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overview-hub">
      <!-- Hero Section -->
      <div class="hero-section">
        <div class="hero-content">
          <div class="hero-title-row">
            <i class="fa-solid fa-robot hero-icon"></i>
            <h1 class="hero-title">AI Administration</h1>
          </div>
          <p class="hero-subtitle">
            Manage agents, models, prompts, and system configuration for your AI platform.
          </p>
        </div>
      </div>

      <!-- Quick Stats Strip -->
      <div class="stats-strip">
        <div class="stat-pill">
          <i class="fa-solid fa-robot"></i>
          <span class="stat-value">{{ ActiveAgentCount }}</span>
          <span class="stat-label">Active Agents</span>
        </div>
        <div class="stat-pill">
          <i class="fa-solid fa-microchip"></i>
          <span class="stat-value">{{ ModelCount }}</span>
          <span class="stat-label">Models</span>
        </div>
        <div class="stat-pill">
          <i class="fa-solid fa-message-lines"></i>
          <span class="stat-value">{{ PromptCount }}</span>
          <span class="stat-label">Prompts</span>
        </div>
        <div class="stat-pill">
          <i class="fa-solid fa-building"></i>
          <span class="stat-value">{{ VendorCount }}</span>
          <span class="stat-label">Vendors</span>
        </div>
      </div>

      <!-- Navigation Cards Grid -->
      <div class="cards-grid">
        @for (card of Cards; track card.Key) {
          <div class="nav-card" [class]="card.ColorClass" (click)="NavigateToTab(card.NavItemLabel)">
            <div class="card-header">
              <div class="card-icon-circle" [class]="card.ColorClass + '-icon'">
                <i [class]="card.Icon"></i>
              </div>
              <i class="fa-solid fa-arrow-right card-arrow"></i>
            </div>
            <h3 class="card-title">{{ card.Title }}</h3>
            <p class="card-description">{{ card.Description }}</p>
            <div class="card-stats">
              @for (stat of card.Stats; track stat.Label) {
                <span class="card-stat-badge">
                  <span class="card-stat-value">{{ stat.Value }}</span>
                  {{ stat.Label }}
                </span>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
      background: var(--mj-bg-page);
    }

    .overview-hub {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    /* Hero Section */
    .hero-section {
      margin-bottom: 24px;
    }

    .hero-title-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .hero-icon {
      font-size: 28px;
      color: var(--mj-brand-primary);
    }

    .hero-title {
      font-size: 28px;
      font-weight: 700;
      color: var(--mj-text-primary);
      margin: 0;
    }

    .hero-subtitle {
      font-size: 15px;
      color: var(--mj-text-muted);
      margin: 0;
      line-height: 1.5;
    }

    /* Stats Strip */
    .stats-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 32px;
    }

    .stat-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 24px;
      font-size: 13px;
      color: var(--mj-text-secondary);
    }

    .stat-pill i {
      color: var(--mj-brand-primary);
      font-size: 14px;
    }

    .stat-value {
      font-weight: 700;
      color: var(--mj-text-primary);
    }

    .stat-label {
      color: var(--mj-text-muted);
    }

    /* Cards Grid */
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
    }

    .nav-card {
      position: relative;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: 12px;
      padding: 24px;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      overflow: hidden;
    }

    .nav-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
    }

    .nav-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
    }

    .nav-card:hover .card-arrow {
      transform: translateX(4px);
    }

    /* Card color variants - top border */
    .card-analytics::before { background: var(--mj-brand-primary); }
    .card-agents::before { background: var(--mj-status-success); }
    .card-prompts::before { background: var(--mj-brand-primary); }
    .card-models::before { background: var(--mj-color-violet-500, #8b5cf6); }
    .card-requests::before { background: var(--mj-status-warning); }
    .card-config::before { background: var(--mj-text-muted); }

    /* Card icon circles */
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .card-icon-circle {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .card-analytics-icon {
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
    }

    .card-agents-icon {
      background: color-mix(in srgb, var(--mj-status-success) 12%, var(--mj-bg-surface));
      color: var(--mj-status-success);
    }

    .card-prompts-icon {
      background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
      color: var(--mj-brand-primary);
    }

    .card-models-icon {
      background: color-mix(in srgb, var(--mj-color-violet-500, #8b5cf6) 12%, var(--mj-bg-surface));
      color: var(--mj-color-violet-500, #8b5cf6);
    }

    .card-requests-icon {
      background: color-mix(in srgb, var(--mj-status-warning) 12%, var(--mj-bg-surface));
      color: var(--mj-status-warning);
    }

    .card-config-icon {
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-muted);
    }

    .card-arrow {
      color: var(--mj-text-muted);
      font-size: 14px;
      transition: transform 0.2s ease;
    }

    .card-title {
      font-size: 17px;
      font-weight: 600;
      color: var(--mj-text-primary);
      margin: 0 0 8px 0;
    }

    .card-description {
      font-size: 13px;
      color: var(--mj-text-muted);
      line-height: 1.5;
      margin: 0 0 16px 0;
    }

    .card-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .card-stat-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: var(--mj-bg-surface-sunken);
      border-radius: 12px;
      font-size: 12px;
      color: var(--mj-text-secondary);
    }

    .card-stat-value {
      font-weight: 700;
      color: var(--mj-text-primary);
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .cards-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 640px) {
      .cards-grid {
        grid-template-columns: 1fr;
      }

      .overview-hub {
        padding: 20px 16px;
      }

      .hero-title {
        font-size: 22px;
      }

      .stats-strip {
        gap: 8px;
      }
    }
  `]
})
export class AIOverviewHubComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);

  ActiveAgentCount = 0;
  ModelCount = 0;
  PromptCount = 0;
  VendorCount = 0;
  Cards: NavigationCard[] = [];

  override async ngOnInit(): Promise<void> {
    super.ngOnInit();
    this.LoadStats();
    this.BuildCards();
    this.NotifyLoadComplete();
    this.cdr.markForCheck();
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'AI Overview';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-grid-2';
  }

  /**
   * Reads counts from the in-memory AIEngineBase singleton.
   * No database queries are made.
   */
  private LoadStats(): void {
    const engine = AIEngineBase.Instance;
    this.ActiveAgentCount = engine.Agents.filter(a => a.Status === 'Active').length;
    this.ModelCount = engine.Models.length;
    this.PromptCount = engine.Prompts.length;
    this.VendorCount = engine.Vendors.length;
  }

  /**
   * Constructs the navigation card definitions with live stat data.
   */
  private BuildCards(): void {
    const engine = AIEngineBase.Instance;

    this.Cards = [
      {
        Key: 'analytics',
        Title: 'Analytics',
        Description: 'View execution metrics, cost trends, error rates, and usage patterns across your AI operations.',
        Icon: 'fa-solid fa-chart-line',
        ColorClass: 'card-analytics',
        NavItemLabel: 'Analytics',
        Stats: [
          { Label: 'Agents', Value: engine.Agents.length },
          { Label: 'Models', Value: engine.Models.length }
        ]
      },
      {
        Key: 'agents',
        Title: 'Agents',
        Description: 'Configure and manage AI agents, their capabilities, prompts, and execution parameters.',
        Icon: 'fa-solid fa-robot',
        ColorClass: 'card-agents',
        NavItemLabel: 'Agents',
        Stats: [
          { Label: 'Active', Value: engine.Agents.filter(a => a.Status === 'Active').length },
          { Label: 'Types', Value: engine.AgentTypes.length }
        ]
      },
      {
        Key: 'prompts',
        Title: 'Prompts',
        Description: 'Manage prompt templates, categories, and model priority assignments.',
        Icon: 'fa-solid fa-message-lines',
        ColorClass: 'card-prompts',
        NavItemLabel: 'Prompts',
        Stats: [
          { Label: 'Total', Value: engine.Prompts.length },
          { Label: 'Categories', Value: engine.PromptCategories.length }
        ]
      },
      {
        Key: 'models',
        Title: 'Models',
        Description: 'Browse AI models, configure vendor integrations, and manage model capabilities.',
        Icon: 'fa-solid fa-microchip',
        ColorClass: 'card-models',
        NavItemLabel: 'Models',
        Stats: [
          { Label: 'Models', Value: engine.Models.length },
          { Label: 'Vendors', Value: engine.Vendors.length }
        ]
      },
      {
        Key: 'requests',
        Title: 'Agent Requests',
        Description: 'Monitor and manage incoming agent requests, approvals, and execution queues.',
        Icon: 'fa-solid fa-inbox',
        ColorClass: 'card-requests',
        NavItemLabel: 'Agent Requests',
        Stats: [
          { Label: 'Agents', Value: engine.Agents.filter(a => a.Status === 'Active').length },
          { Label: 'Types', Value: engine.AgentTypes.length }
        ]
      },
      {
        Key: 'config',
        Title: 'Configuration',
        Description: 'System-level AI settings, configuration parameters, and platform defaults.',
        Icon: 'fa-solid fa-gear',
        ColorClass: 'card-config',
        NavItemLabel: 'Configuration',
        Stats: [
          { Label: 'Configs', Value: engine.Configurations.length },
          { Label: 'Params', Value: engine.ConfigurationParams.length }
        ]
      }
    ];
  }

  /**
   * Navigate to another tab in the current AI application by its nav item label.
   */
  NavigateToTab(navItemLabel: string): void {
    this.navigationService.OpenNavItemByName(navItemLabel);
  }
}

/** Tree-shaking prevention */
export function LoadAIOverviewHub(): void { /* intentionally empty */ }
