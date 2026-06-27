import { ChangeDetectorRef, Component, ViewEncapsulation, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { PredictiveStudioEngine } from './engine/predictive-studio.engine';
import { PSPanelKey } from './predictive-studio.types';

interface NavItem {
  key: PSPanelKey;
  label: string;
  icon: string;
  group: string;
}

/**
 * AI Agent ID for the Model Development Agent that powers the embedded copilot chat. The agent is
 * seeded via metadata (see plans/predictive-studio.md §9). Until the seed lands in the target
 * environment, this stays null and the chat falls back to default-agent resolution (app-scoped →
 * global). Wire the seeded ID here when available.
 *
 * TODO(PS-AGENT-6): replace with the seeded Model Development Agent ID once the agent metadata is
 * pushed, OR resolve it dynamically from the application's default agent.
 */
const MODEL_DEV_AGENT_ID: string | null = null;

/**
 * Predictive Studio — the world-class, lazy-loaded MJ Explorer dashboard for feature engineering,
 * predictive modeling, agent-driven model development, and scoring.
 *
 * Chrome: page-layout + page-header; an internal left-nav switches between six panels (Home, Algorithm
 * Catalog, Pipeline Builder, Experiments, Model Registry, Compare Runs). A docked, toggleable copilot
 * chat (the Model Development Agent via @memberjunction/ng-conversations) is available across ALL panels.
 *
 * Data comes from {@link PredictiveStudioEngine} (BaseEngine, cached PS reference entities) — never an
 * Angular service. Follows the canonical BaseDashboard lifecycle (initDashboard + loadData; the base
 * calls NotifyLoadComplete after loadData).
 */
@RegisterClass(BaseDashboard, 'PredictiveStudioDashboard')
@Component({
  standalone: false,
  selector: 'mj-predictive-studio-dashboard',
  templateUrl: './predictive-studio-dashboard.component.html',
  styleUrls: ['./predictive-studio.shared.scss', './predictive-studio-dashboard.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class PredictiveStudioDashboardComponent extends BaseDashboard {
  private cdr = inject(ChangeDetectorRef);

  public engine = PredictiveStudioEngine.Instance;
  public isLoading = true;
  public activePanel: PSPanelKey = 'home';
  public chatOpen = false;

  public readonly navItems: NavItem[] = [
    { key: 'home', label: 'Home', icon: 'fa-solid fa-gauge-high', group: 'Build' },
    { key: 'pipelines', label: 'Training Pipelines', icon: 'fa-solid fa-diagram-project', group: 'Build' },
    { key: 'catalog', label: 'Algorithm Catalog', icon: 'fa-solid fa-shapes', group: 'Build' },
    { key: 'experiments', label: 'Experiments', icon: 'fa-solid fa-flask', group: 'Run' },
    { key: 'registry', label: 'Model Registry', icon: 'fa-solid fa-cubes', group: 'Run' },
    { key: 'compare', label: 'Compare Runs', icon: 'fa-solid fa-chart-column', group: 'Run' },
  ];

  // ---- BaseDashboard lifecycle ----

  protected initDashboard(): void {
    const params = this.GetQueryParams();
    const panel = params['panel'] as PSPanelKey | undefined;
    if (panel && this.navItems.some((n) => n.key === panel)) {
      this.activePanel = panel;
    }
  }

  protected async loadData(): Promise<void> {
    this.isLoading = true;
    try {
      const provider = this.ProviderToUse;
      await this.engine.Config(false, provider?.CurrentUser ?? undefined, provider);
    } catch (e) {
      this.Error.emit(e instanceof Error ? e : new Error(String(e)));
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /** React to deep-link / back-forward panel changes after initial mount. */
  protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
    const panel = params['panel'] as PSPanelKey | undefined;
    if (panel && panel !== this.activePanel && this.navItems.some((n) => n.key === panel)) {
      this.activePanel = panel;
      this.cdr.detectChanges();
    }
  }

  // ---- Navigation ----

  public selectPanel(key: PSPanelKey): void {
    if (this.activePanel === key) return;
    this.activePanel = key;
    this.UpdateQueryParams({ panel: key });
  }

  public get groups(): string[] {
    return [...new Set(this.navItems.map((n) => n.group))];
  }

  public itemsForGroup(group: string): NavItem[] {
    return this.navItems.filter((n) => n.group === group);
  }

  public get activeLabel(): string {
    return this.navItems.find((n) => n.key === this.activePanel)?.label ?? 'Home';
  }

  public get activeIcon(): string {
    return this.navItems.find((n) => n.key === this.activePanel)?.icon ?? 'fa-solid fa-wand-magic-sparkles';
  }

  // ---- Copilot chat ----

  public toggleChat(): void {
    this.chatOpen = !this.chatOpen;
  }

  public openChat(): void {
    this.chatOpen = true;
  }

  public get currentUser(): UserInfo | null {
    return this.ProviderToUse?.CurrentUser ?? null;
  }

  public get chatEnvironmentId(): string {
    return (this.Data?.Configuration?.['environmentId'] as string | undefined) || MJEnvironmentEntityExtended.DefaultEnvironmentID;
  }

  public get applicationId(): string | null {
    return (this.Data?.Configuration?.applicationId as string | undefined) ?? null;
  }

  public get modelDevAgentId(): string | null {
    return MODEL_DEV_AGENT_ID;
  }

  /** App context passed to the agent so it can act on the current panel. */
  public get chatAppContext(): Record<string, unknown> {
    return {
      app: 'Predictive Studio',
      activePanel: this.activePanel,
      publishedModels: this.engine.Models.filter((m) => m.Status === 'Published').length,
      runningSessions: this.engine.Sessions.filter((s) => s.Status === 'Running').length,
    };
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return 'Predictive Studio';
  }

  override async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-wand-magic-sparkles';
  }
}

/** Tree-shaking prevention — called from public-api.ts so the @RegisterClass survives bundling. */
export function LoadPredictiveStudioDashboard(): void {
  // intentionally empty
}
