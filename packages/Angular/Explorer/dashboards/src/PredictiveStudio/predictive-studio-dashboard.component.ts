import { ChangeDetectorRef, Component, ViewEncapsulation, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseDashboard } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { UserInfo, LogError } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { PredictiveStudioEngine } from './engine/predictive-studio.engine';
import { PSPanelKey } from './predictive-studio.types';

/**
 * Display name of the Model Development Agent that powers the embedded copilot chat. The agent ID is
 * resolved at runtime from the AIEngineBase agent cache by this name (see {@link resolveModelDevAgentId})
 * rather than hardcoding a UUID — keeping the dashboard correct across environments where the agent is
 * (re)seeded with a different ID.
 */
const MODEL_DEV_AGENT_NAME = 'Model Development Agent';

interface NavItem {
  key: PSPanelKey;
  label: string;
  icon: string;
  group: string;
}

/**
 * @deprecated Superseded by the six top-nav section resources in `./resources/` (PredictiveStudio
 * Home/Pipelines/Catalog/Experiments/Registry/Compare). Predictive Studio is now a multi-Nav-Item app
 * (the canonical MJ shape — mirrors AI Administration) rather than this single monolithic left-nav
 * dashboard. Kept declared for backward compatibility but no longer referenced by any Nav Item.
 *
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

  /**
   * Provider-scoped Predictive Studio engine. Resolved in {@link loadData} via
   * {@link PredictiveStudioEngine.GetProviderInstance} so a multi-provider client (or an embedded
   * non-default provider) reads the right server's PS reference data — never the process-global
   * singleton. The panel host is gated behind {@link isLoading}, so this is assigned before any
   * panel renders.
   */
  public engine: PredictiveStudioEngine = PredictiveStudioEngine.Instance;
  public isLoading = true;
  public activePanel: PSPanelKey = 'home';
  public chatOpen = false;
  /** Starter prompt seeded into the copilot chat input when a panel CTA opens it (null = no seed). */
  public pendingChatMessage: string | null = null;

  /** Resolved at runtime from the agent cache by name; null until resolved (chat falls back to default-agent routing). */
  private _modelDevAgentId: string | null = null;

  public readonly navItems: NavItem[] = [
    { key: 'home', label: 'Home', icon: 'fa-solid fa-gauge-high', group: 'Build' },
    { key: 'pipelines', label: 'Training Pipelines', icon: 'fa-solid fa-diagram-project', group: 'Build' },
    { key: 'catalog', label: 'Algorithm Catalog', icon: 'fa-solid fa-shapes', group: 'Build' },
    { key: 'experiments', label: 'Experiments', icon: 'fa-solid fa-flask', group: 'Run' },
    { key: 'registry', label: 'Model Registry', icon: 'fa-solid fa-cubes', group: 'Run' },
    { key: 'production', label: 'Models in Production', icon: 'fa-solid fa-satellite-dish', group: 'Run' },
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
      // Provider-scoped engine (multi-provider correctness) — not the process-global singleton.
      this.engine = <PredictiveStudioEngine>PredictiveStudioEngine.GetProviderInstance(provider, PredictiveStudioEngine);
      await this.engine.Config(false, provider.CurrentUser ?? undefined, provider);
      await this.resolveModelDevAgentId();
    } catch (e) {
      this.Error.emit(e instanceof Error ? e : new Error(String(e)));
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Resolve the Model Development Agent's ID at runtime from the AIEngineBase agent cache (loaded on
   * app boot) by {@link MODEL_DEV_AGENT_NAME} — instead of pinning a literal UUID that breaks when the
   * agent is (re)seeded with a different ID across environments. Leaves the ID null (chat then falls
   * back to default-agent routing) if the agent isn't found.
   */
  private async resolveModelDevAgentId(): Promise<void> {
    try {
      await AIEngineBase.Instance.Config(false);
      const agent = AIEngineBase.Instance.Agents?.find(
        (a) => a.Name?.trim().toLowerCase() === MODEL_DEV_AGENT_NAME.toLowerCase(),
      );
      this._modelDevAgentId = agent?.ID ?? null;
      if (!agent) {
        LogError(`PredictiveStudioDashboard: '${MODEL_DEV_AGENT_NAME}' not found in AIEngineBase cache — chat will use default-agent routing.`);
      }
    } catch (err) {
      LogError(`PredictiveStudioDashboard.resolveModelDevAgentId: ${err instanceof Error ? err.message : String(err)}`);
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

  /**
   * Open the copilot, optionally seeding the chat input with a starter prompt (from a panel's
   * "Ask the agent" / "Use" CTA). The prompt flows to `mj-conversation-chat-area`'s `pendingMessage`.
   */
  public openChat(prompt?: string): void {
    // Always assign (clearing any prior seed) so a plain reopen doesn't re-inject a stale "Use" prompt.
    this.pendingChatMessage = prompt ?? null;
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
    return this._modelDevAgentId;
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
