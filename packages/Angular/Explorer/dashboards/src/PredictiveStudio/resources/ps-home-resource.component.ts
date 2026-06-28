import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { LogError, UserInfo } from '@memberjunction/core';
import { MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';
import { PSPanelKey } from '../predictive-studio.types';

/**
 * Predictive Studio application ID (from `metadata/applications/.predictive-studio-application.json`).
 * Used to switch top-nav sections when the Home panel's hero/entry-path buttons emit a `navigate` event
 * — the panel was authored to drive an in-dashboard left-nav, and here we translate that intent into a
 * top-nav `SwitchToApp(appId, <section Label>)`.
 */
const PREDICTIVE_STUDIO_APP_ID = '299C9272-8D38-40CA-85D4-0980F2C9FAD1';

/**
 * Display name of the Model Development Agent that powers the seeded "Ask the agent" chat. The agent ID is
 * resolved at runtime from the AIEngineBase agent cache by this name (see {@link resolveModelDevAgentId})
 * rather than hardcoding a UUID — keeping the section correct across environments where the agent is
 * (re)seeded with a different ID. Matches the name the deprecated monolith shell used.
 */
const MODEL_DEV_AGENT_NAME = 'Model Development Agent';

/**
 * Maps a Home-panel {@link PSPanelKey} navigation intent to the destination section's Nav Item `Label`
 * (must match the Labels in `.predictive-studio-application.json` `DefaultNavItems`). `home` is omitted
 * — navigating home from home is a no-op.
 */
const PANEL_KEY_TO_NAV_LABEL: Partial<Record<PSPanelKey, string>> = {
  pipelines: 'Training Pipelines',
  catalog: 'Algorithm Catalog',
  experiments: 'Experiments',
  registry: 'Model Registry',
  compare: 'Compare Runs',
};

/**
 * Home section resource — hosts the {@link PSHomeComponent} (`ps-home`) action-forward landing.
 *
 * Registered as `BaseResourceComponent::PredictiveStudioHomeResource`, the `isDefault` Nav Item of the
 * Predictive Studio app. The hosted panel emits two outputs that this wrapper translates:
 * - `navigate(PSPanelKey)` → switch to the matching top-nav section via {@link mapNavigate}.
 * - `askAgent(starterPrompt)` → reveal a docked **Model Development Agent** chat seeded with the prompt
 *   (see {@link onAskAgent}). This is the cleanest achievable "one-click entry" given the current
 *   conversational-UX stack: MJ's **global** docked overlay cannot be opened programmatically pre-targeted
 *   to a specific agent with a seed message (its `ConversationBridge` deep-link carries only a
 *   `conversationId` — no `defaultAgentId`, no seed text). So rather than wait on that plumbing, the
 *   section embeds the supported `<mj-conversation-chat-area>` seam directly — the exact pattern the
 *   monolith shell used — adding the one thing the monolith didn't: a `[pendingMessage]` seed that
 *   auto-sends the starter prompt, dropping the user straight into a working conversation.
 *
 *   To open the *global* overlay (not an embedded copilot) seeded this way, `ChatAgentsOverlayComponent`
 *   + `ConversationDeepLink`/`ConversationBridgeService` would need additive `defaultAgentId` + seed-text
 *   support. That's a generic-package change deferred out of this section-level work.
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioHomeResource')
@Component({
  standalone: false,
  selector: 'mj-ps-home-resource',
  template: `
    <mj-page-header-interior
      Title="Predictive Studio"
      Subtitle="Build a predictive model — from your data, a proven template, or the Model Dev Agent">
    </mj-page-header-interior>
    <mj-page-body-interior>
      @if (!isLoading) {
        <div class="ps-home-host" [class.chat-open]="chatOpen">
          <div class="ps-home-main">
            <ps-home
              [engine]="engine"
              [provider]="ProviderToUse"
              [currentUser]="ProviderToUse.CurrentUser"
              (navigate)="mapNavigate($event)"
              (askAgent)="onAskAgent($event)">
            </ps-home>
          </div>

          @if (chatOpen) {
            <aside class="ps-home-copilot" data-testid="ps-home-copilot">
              <div class="ps-home-copilot-head">
                <div class="ps-home-copilot-title"><i class="fa-solid fa-robot"></i> Model Dev Agent</div>
                <button class="ps-home-copilot-close" (click)="closeChat()" aria-label="Close agent chat">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div class="ps-home-copilot-body">
                @if (currentUser) {
                  <mj-conversation-chat-area
                    [Provider]="Provider"
                    [environmentId]="chatEnvironmentId"
                    [currentUser]="currentUser"
                    [suppressNewConversationEmptyState]="true"
                    [allowMentions]="false"
                    [overlayMode]="true"
                    [showExportButton]="false"
                    [showShareButton]="false"
                    [showArtifactIndicator]="false"
                    [showAgentPicker]="false"
                    [showAgentModePicker]="false"
                    [defaultAgentId]="modelDevAgentId"
                    [pendingMessage]="pendingPrompt"
                    [applicationScope]="'Application'"
                    [applicationId]="applicationId"
                    [appContext]="chatAppContext"
                    emptyStateGreeting="Describe a prediction goal and I'll design the pipeline.">
                  </mj-conversation-chat-area>
                } @else {
                  <div class="ps-home-copilot-empty"><mj-loading text="Connecting…" size="small"></mj-loading></div>
                }
              </div>
            </aside>
          }
        </div>
      } @else {
        <mj-loading text="Loading Predictive Studio..." size="medium"></mj-loading>
      }
    </mj-page-body-interior>
  `,
  styles: [
    `
      :host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
      .ps-home-host { display: flex; flex: 1; min-height: 0; overflow: hidden; }
      .ps-home-main { flex: 1; min-width: 0; overflow-y: auto; padding: 4px 4px 24px; }
      .ps-home-copilot {
        width: 420px; max-width: 42vw; flex: none;
        border-left: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface);
        display: flex; flex-direction: column; min-height: 0;
      }
      .ps-home-copilot-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 14px; border-bottom: 1px solid var(--mj-border-default);
      }
      .ps-home-copilot-title { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--mj-text-primary); }
      .ps-home-copilot-title i { color: var(--mj-brand-primary); }
      .ps-home-copilot-close {
        background: transparent; border: none; cursor: pointer; padding: 6px 8px; border-radius: 6px;
        color: var(--mj-text-muted); transition: background .12s, color .12s;
      }
      .ps-home-copilot-close:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-secondary); }
      .ps-home-copilot-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .ps-home-copilot-body mj-conversation-chat-area { flex: 1; min-height: 0; display: block; }
      .ps-home-copilot-empty { display: flex; align-items: center; justify-content: center; flex: 1; }
      @media (max-width: 1100px) {
        .ps-home-host.chat-open .ps-home-main { display: none; }
        .ps-home-copilot { width: 100%; max-width: none; border-left: none; }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSHomeResourceComponent extends PSResourceBase {
  protected readonly SectionKey = 'home';
  protected readonly SectionLabel = 'Home';
  protected readonly SectionIcon = 'fa-solid fa-gauge-high';

  private readonly cdrLocal = inject(ChangeDetectorRef);

  /** Whether the docked Model Dev Agent chat is revealed. Toggled by the Home panel's "Ask the agent" CTAs. */
  public chatOpen = false;

  /**
   * Starter prompt seeded into the chat (auto-sent via the chat area's `[pendingMessage]`). Set when the
   * user clicks an "Ask the agent" entry path; null until then.
   */
  public pendingPrompt: string | null = null;

  /** Resolved at runtime from the agent cache by name; null until resolved (chat falls back to default-agent routing). */
  private _modelDevAgentId: string | null = null;

  /** The Model Development Agent's ID for `[defaultAgentId]`, or null while resolving / if not found. */
  public get modelDevAgentId(): string | null {
    return this._modelDevAgentId;
  }

  /** Acting user for the chat area (its `currentUser` is a required input). */
  public get currentUser(): UserInfo | null {
    return this.ProviderToUse.CurrentUser ?? null;
  }

  /** Environment the conversation lives in — from resource config, else the default environment. */
  public get chatEnvironmentId(): string {
    return (
      (this.Data?.Configuration?.['environmentId'] as string | undefined) ||
      MJEnvironmentEntityExtended.DefaultEnvironmentID
    );
  }

  /** Application scope for the conversation (so it's filed under Predictive Studio), or null if unset. */
  public get applicationId(): string | null {
    return (this.Data?.Configuration?.['applicationId'] as string | undefined) ?? null;
  }

  /** Live state passed to the agent so it can act on the current section. */
  public get chatAppContext(): Record<string, unknown> {
    return {
      app: 'Predictive Studio',
      section: 'home',
      publishedModels: this.engine.Models.filter((m) => m.Status === 'Published').length,
      runningSessions: this.engine.Sessions.filter((s) => s.Status === 'Running').length,
    };
  }

  /** Translate the panel's in-dashboard navigation intent into a top-nav section switch. */
  public mapNavigate(key: PSPanelKey): void {
    const label = PANEL_KEY_TO_NAV_LABEL[key];
    if (label) {
      void this.navigationService.SwitchToApp(PREDICTIVE_STUDIO_APP_ID, label);
    }
  }

  /**
   * "Ask the agent" entry path. Reveals the docked Model Development Agent chat and seeds it with the
   * supplied starter prompt (auto-sent by the chat area). The agent ID is resolved lazily on first open.
   *
   * @param starterPrompt the entity-agnostic prompt to seed (from the Home panel).
   */
  public onAskAgent(starterPrompt: string): void {
    this.pendingPrompt = starterPrompt;
    this.chatOpen = true;
    void this.ensureModelDevAgentResolved();
    this.cdrLocal.detectChanges();
  }

  /** Close the docked chat and clear the seed so re-opening starts a fresh seeded conversation. */
  public closeChat(): void {
    this.chatOpen = false;
    this.pendingPrompt = null;
    this.cdrLocal.detectChanges();
  }

  /**
   * Resolve the Model Development Agent's ID from the AIEngineBase agent cache (loaded on app boot) by
   * {@link MODEL_DEV_AGENT_NAME}. No-op once resolved. On a miss the chat still works — the chat area
   * falls back to its default-agent routing — but we log so the misconfiguration is visible.
   */
  private async ensureModelDevAgentResolved(): Promise<void> {
    if (this._modelDevAgentId) return;
    try {
      await AIEngineBase.Instance.Config(false, this.ProviderToUse.CurrentUser ?? undefined);
      const agent = AIEngineBase.Instance.Agents?.find(
        (a) => a.Name?.trim().toLowerCase() === MODEL_DEV_AGENT_NAME.toLowerCase(),
      );
      this._modelDevAgentId = agent?.ID ?? null;
      if (!this._modelDevAgentId) {
        LogError(
          `PSHomeResource: '${MODEL_DEV_AGENT_NAME}' not found in AIEngineBase cache — chat will use default-agent routing.`,
        );
      }
      this.cdrLocal.detectChanges();
    } catch (err) {
      LogError(`PSHomeResource.ensureModelDevAgentResolved: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Tree-shaking prevention — called from the subpath module so the @RegisterClass survives bundling. */
export function LoadPSHomeResource(): void {
  // intentionally empty
}
