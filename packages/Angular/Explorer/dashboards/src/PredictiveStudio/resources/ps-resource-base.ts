import { ChangeDetectorRef, Directive, inject } from '@angular/core';
import { LogError } from '@memberjunction/core';
import { ResourceData } from '@memberjunction/core-entities';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';

/**
 * Shared base for every Predictive Studio section resource.
 *
 * Predictive Studio was refactored from one monolithic left-nav dashboard into six top-nav Nav Items
 * (the canonical MJ app shape — mirrors AI Administration). Each section is its own
 * `BaseResourceComponent` registered under a distinct `DriverClass` and hosting the matching standalone
 * panel (`ps-home`, `ps-pipelines`, …). Because the panels all take `@Input() engine:
 * PredictiveStudioEngine`, every section resource has identical data-loading and lifecycle needs — this
 * base captures that once so the concrete wrappers stay thin (single panel binding, single
 * `DriverClass`, single icon/title).
 *
 * Responsibilities owned here:
 * - **Self-load the engine.** Each section resolves a provider-scoped {@link PredictiveStudioEngine} via
 *   `GetProviderInstance` (multi-provider correctness — never the process-global singleton) and runs
 *   `Config`. The monolith loaded the engine once for all six panels; standalone sections each load it,
 *   but `Config(false, …)` is a cached no-op after the first section warms it, so the cost is paid once.
 * - **Signal load completion.** Calls {@link NotifyLoadComplete} after the engine resolves (or fails),
 *   so direct-URL navigation to any section clears the shell loading screen. Failures still notify —
 *   the panel renders its representative sample data when the live arrays are empty.
 * - **Agent context.** Reports a small section snapshot to the AI agent (chat + realtime co-agent) via
 *   `SetAgentContext`. No mutating client tools are exposed — Predictive Studio's writes happen through
 *   its own dialogs/agent, not via surface tools.
 *
 * The docked per-section copilot from the monolith is intentionally gone: MJ's global chat now owns the
 * Model Development Agent conversation, so sections don't embed their own chat.
 *
 * @template TKey the agent-context `Section` discriminator string for this resource.
 */
@Directive()
export abstract class PSResourceBase extends BaseResourceComponent {
  protected readonly cdr = inject(ChangeDetectorRef);

  /**
   * Provider-scoped Predictive Studio engine. Resolved in {@link loadSection} via
   * {@link PredictiveStudioEngine.GetProviderInstance} so a multi-provider client (or an embedded
   * non-default provider) reads the right server's PS reference data. Bound into the hosted panel's
   * `[engine]` input once loading completes.
   */
  public engine: PredictiveStudioEngine = PredictiveStudioEngine.Instance;

  /** True until the engine resolves; gates the panel host so `[engine]` is never bound before it's ready. */
  public isLoading = true;

  /** Stable section identifier for agent context + (subclass) titling. */
  protected abstract readonly SectionKey: string;

  /** Human-readable section label used in chrome + agent context. */
  protected abstract readonly SectionLabel: string;

  ngOnInit(): void {
    super.ngOnInit();
    void this.loadSection();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  /**
   * Resolve the provider-scoped engine, then notify the shell. Always calls {@link NotifyLoadComplete}
   * — even on failure — so the loading screen can never hang on a direct-URL section load.
   */
  protected async loadSection(): Promise<void> {
    this.isLoading = true;
    try {
      const provider = this.ProviderToUse;
      this.engine = <PredictiveStudioEngine>(
        PredictiveStudioEngine.GetProviderInstance(provider, PredictiveStudioEngine)
      );
      await this.engine.Config(false, provider.CurrentUser ?? undefined, provider);
      this.publishAgentContext();
    } catch (err) {
      LogError(
        `Predictive Studio (${this.SectionKey}) failed to load engine: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
      this.NotifyLoadComplete();
    }
  }

  /**
   * Report the section's state to the AI agent (async chat + realtime co-agent share this snapshot).
   * Subclasses may override {@link extraAgentContext} to add section-specific fields. No client tools
   * are registered — Predictive Studio surfaces are read/navigate-only to the agent; model creation,
   * training, and promotion run through PS's own dialogs and the Model Development Agent.
   */
  protected publishAgentContext(): void {
    this.navigationService.SetAgentContext(this, {
      App: 'Predictive Studio',
      Section: this.SectionKey,
      SectionLabel: this.SectionLabel,
      PublishedModels: this.engine.Models.filter((m) => m.Status === 'Published').length,
      RunningSessions: this.engine.Sessions.filter((s) => s.Status === 'Running').length,
      ...this.extraAgentContext(),
    });
  }

  /** Hook for subclasses to contribute section-specific agent-context fields. Default: none. */
  protected extraAgentContext(): Record<string, unknown> {
    return {};
  }

  async GetResourceDisplayName(_data: ResourceData): Promise<string> {
    return this.SectionLabel;
  }

  override async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return this.SectionIcon;
  }

  /** Font Awesome icon for the section (chrome + shell tab). */
  protected abstract readonly SectionIcon: string;
}
