import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { LogError, UserInfo } from '@memberjunction/core';
import { MJConversationEntity, MJEnvironmentEntityExtended } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';
import { PSPanelKey } from '../predictive-studio.types';
import {
  STUDIO_SECTIONS,
  PSSection,
  sectionGroups,
  sectionsInGroup,
  sectionLabel,
  sectionIcon,
  hasSection,
  routeHomeNavigate,
} from '../predictive-studio.nav';

/** Predictive Studio application ID (from `metadata/applications/.predictive-studio-application.json`). */
const PREDICTIVE_STUDIO_APP_ID = '299C9272-8D38-40CA-85D4-0980F2C9FAD1';
const MODEL_DEV_AGENT_NAME = 'Model Development Agent';

/**
 * **Studio** — the analyst workbench door (one of Predictive Studio's three consolidated nav items,
 * alongside `Predictions` and `Models`). Hosts the build/run section panels (`ps-home`, `ps-pipelines`,
 * `ps-catalog`, `ps-experiments`, `ps-compare`) behind an internal left-nav grouped by lifecycle
 * (Overview · Build · Run), so the outer app nav stays quiet while analysts get all the depth one click
 * in. The active section round-trips through the `section` query param (deep links + back/forward). A
 * single docked **Model Development Agent** copilot is shared by every section's "Ask the agent" CTA —
 * wired with the full conversation lifecycle (`isNewConversation` → `conversationCreated`) so the first
 * message actually creates + sends. Cross-door navigation (to a Models section) routes via the nav
 * service; see {@link routeHomeNavigate}.
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioStudioResource')
@Component({
  standalone: false,
  selector: 'mj-ps-studio-resource',
  template: `
    <mj-page-header-interior [Title]="activeLabel"
      Subtitle="Assemble features, train from the algorithm catalog, and run experiments">
    </mj-page-header-interior>
    <mj-page-body-interior>
      @if (isLoading) {
        <mj-loading text="Loading Studio…" size="medium"></mj-loading>
      } @else {
        <div class="ps-studio-host" [class.chat-open]="chatOpen" data-testid="ps-studio-shell">
          <aside class="ps-leftnav">
            @for (group of groups; track group) {
              @if (group) { <div class="ps-nav-group">{{ group }}</div> }
              @for (item of itemsForGroup(group); track item.key) {
                <button class="ps-nav-item" [class.active]="activeSection === item.key"
                  [attr.data-testid]="'ps-nav-' + item.key" (click)="selectSection(item.key)">
                  <i [class]="item.icon"></i> <span>{{ item.label }}</span>
                </button>
              }
            }
          </aside>

          <section class="ps-content" [attr.data-testid]="'ps-panel-' + activeSection">
            @switch (activeSection) {
              @case ('home') { <ps-home [engine]="engine" [provider]="ProviderToUse" [currentUser]="ProviderToUse.CurrentUser" (navigate)="mapNavigate($event)" (askAgent)="onAskAgent($event)"></ps-home> }
              @case ('pipelines') { <ps-pipelines [engine]="engine" [provider]="ProviderToUse" [currentUser]="ProviderToUse.CurrentUser" (askAgent)="onAskAgent($event)"></ps-pipelines> }
              @case ('catalog') { <ps-catalog [engine]="engine" (askAgent)="onAskAgent($event)"></ps-catalog> }
              @case ('experiments') { <ps-experiments [engine]="engine" [provider]="ProviderToUse" [currentUser]="ProviderToUse.CurrentUser"></ps-experiments> }
              @case ('compare') { <ps-compare [engine]="engine"></ps-compare> }
            }
          </section>

          @if (chatOpen) {
            <aside class="ps-copilot" data-testid="ps-studio-copilot">
              <div class="ps-copilot-head">
                <div class="ps-copilot-title"><i class="fa-solid fa-robot"></i> Model Dev Agent</div>
                <button class="ps-copilot-close" (click)="closeChat()" aria-label="Close agent chat"><i class="fa-solid fa-xmark"></i></button>
              </div>
              <div class="ps-copilot-body">
                @if (currentUser) {
                  <mj-conversation-chat-area
                    [Provider]="Provider" [environmentId]="chatEnvironmentId" [currentUser]="currentUser"
                    [conversation]="chatConversation" [conversationId]="chatConversationId" [isNewConversation]="chatIsNewConversation"
                    [suppressNewConversationEmptyState]="true" [allowMentions]="false" [overlayMode]="true"
                    [showExportButton]="false" [showShareButton]="false" [showArtifactIndicator]="false"
                    [showAgentPicker]="false" [showAgentModePicker]="false"
                    [defaultAgentId]="modelDevAgentId" [pendingMessage]="pendingPrompt"
                    [applicationScope]="'Application'" [applicationId]="applicationId" [appContext]="chatAppContext"
                    (conversationCreated)="onChatConversationCreated($event)"
                    (pendingMessageConsumed)="onChatPendingMessageConsumed()"
                    emptyStateGreeting="Describe a prediction goal and I'll design the pipeline.">
                  </mj-conversation-chat-area>
                } @else { <div class="ps-copilot-empty"><mj-loading text="Connecting…" size="small"></mj-loading></div> }
              </div>
            </aside>
          }
        </div>
      }
    </mj-page-body-interior>
  `,
  styles: [
    `
      :host { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
      .ps-studio-host { display: flex; flex: 1; min-height: 0; overflow: hidden; }
      .ps-leftnav { width: 210px; flex: none; border-right: 1px solid var(--mj-border-default); background: var(--mj-bg-surface-card); overflow-y: auto; padding: 10px 8px; display: flex; flex-direction: column; gap: 2px; }
      .ps-nav-group { font-size: var(--mj-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--mj-text-muted); padding: 12px 10px 4px; }
      .ps-nav-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border: none; background: transparent; border-radius: var(--mj-radius-md); cursor: pointer; color: var(--mj-text-secondary); font-size: var(--mj-text-sm); font-weight: 500; transition: background .12s, color .12s; }
      .ps-nav-item i { width: 18px; text-align: center; color: var(--mj-text-muted); }
      .ps-nav-item:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-primary); }
      .ps-nav-item.active { background: color-mix(in srgb, var(--mj-brand-primary) 12%, transparent); color: var(--mj-brand-primary); font-weight: 600; }
      .ps-nav-item.active i { color: var(--mj-brand-primary); }
      .ps-content { flex: 1; min-width: 0; overflow-y: auto; padding: 8px 14px 24px; }
      .ps-copilot { width: 420px; max-width: 42vw; flex: none; border-left: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); display: flex; flex-direction: column; min-height: 0; }
      .ps-copilot-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--mj-border-default); }
      .ps-copilot-title { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--mj-text-primary); }
      .ps-copilot-title i { color: var(--mj-brand-primary); }
      .ps-copilot-close { background: transparent; border: none; cursor: pointer; padding: 6px 8px; border-radius: 6px; color: var(--mj-text-muted); }
      .ps-copilot-close:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-secondary); }
      .ps-copilot-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .ps-copilot-body mj-conversation-chat-area { flex: 1; min-height: 0; display: block; }
      .ps-copilot-empty { display: flex; align-items: center; justify-content: center; flex: 1; }
      @media (max-width: 1100px) { .ps-studio-host.chat-open .ps-content, .ps-studio-host.chat-open .ps-leftnav { display: none; } .ps-copilot { width: 100%; max-width: none; border-left: none; } }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSStudioResourceComponent extends PSResourceBase {
  protected readonly SectionKey = 'studio';
  protected readonly SectionLabel = 'Studio';
  protected readonly SectionIcon = 'fa-solid fa-flask-vial';

  private readonly cdrLocal = inject(ChangeDetectorRef);

  /** The active workbench section (which panel renders). Round-trips through the `section` query param. */
  public activeSection: PSPanelKey = 'home';
  public readonly sections: readonly PSSection[] = STUDIO_SECTIONS;

  // ── docked Model Dev Agent copilot ───────────────────────────────
  public chatOpen = false;
  public pendingPrompt: string | null = null;
  private _modelDevAgentId: string | null = null;
  /** Conversation lifecycle (see {@link onChatConversationCreated}) — without it the first send no-ops. */
  public chatConversation: MJConversationEntity | null = null;
  public chatConversationId: string | null = null;
  public chatIsNewConversation = true;

  override ngOnInit(): void {
    super.ngOnInit();
    const initial = this.GetQueryParams()['section'] as PSPanelKey | undefined;
    if (initial && hasSection(this.sections, initial)) this.activeSection = initial;
  }

  /** React to deep-link / back-forward `section` changes after the initial mount. */
  protected override OnQueryParamsChanged(params: Record<string, string>, _source: 'popstate' | 'deeplink'): void {
    const next = params['section'] as PSPanelKey | undefined;
    if (next && next !== this.activeSection && hasSection(this.sections, next)) {
      this.activeSection = next;
      this.cdrLocal.detectChanges();
    }
  }

  protected override extraAgentContext(): Record<string, unknown> {
    return { ActiveSection: sectionLabel(this.sections, this.activeSection) };
  }

  // ── left-nav ─────────────────────────────────────────────────────
  public get groups(): string[] { return sectionGroups(this.sections); }
  public itemsForGroup(group: string): PSSection[] { return sectionsInGroup(this.sections, group); }
  public get activeLabel(): string { return sectionLabel(this.sections, this.activeSection); }
  public get activeIcon(): string { return sectionIcon(this.sections, this.activeSection); }

  public selectSection(key: PSPanelKey): void {
    if (this.activeSection === key) return;
    this.activeSection = key;
    this.UpdateQueryParams({ section: key });
    this.publishAgentContext();
    this.cdrLocal.detectChanges();
  }

  /** The Overview panel's in-app navigation: switch section in-place, or cross to the Models door. */
  public mapNavigate(key: PSPanelKey): void {
    const target = routeHomeNavigate(key);
    if (target.kind === 'section') {
      this.selectSection(target.key);
    } else if (target.kind === 'app') {
      void this.navigationService.SwitchToApp(PREDICTIVE_STUDIO_APP_ID, target.navLabel, { section: target.section });
    }
  }

  // ── copilot ──────────────────────────────────────────────────────
  public get currentUser(): UserInfo | null { return this.ProviderToUse.CurrentUser ?? null; }
  public get chatEnvironmentId(): string {
    return (this.Data?.Configuration?.['environmentId'] as string | undefined) || MJEnvironmentEntityExtended.DefaultEnvironmentID;
  }
  public get applicationId(): string | null { return (this.Data?.Configuration?.['applicationId'] as string | undefined) ?? null; }
  public get modelDevAgentId(): string | null { return this._modelDevAgentId; }
  public get chatAppContext(): Record<string, unknown> {
    return { app: 'Predictive Studio', section: this.activeSection, publishedModels: this.engine.Models.filter((m) => m.Status === 'Published').length };
  }

  public onAskAgent(starterPrompt: string): void {
    this.pendingPrompt = starterPrompt;
    this.chatOpen = true;
    void this.ensureModelDevAgentResolved();
    this.cdrLocal.detectChanges();
  }

  public closeChat(): void {
    this.chatOpen = false;
    this.pendingPrompt = null;
    this.cdrLocal.detectChanges();
  }

  /** Chat-area created its backing conversation on the first send — capture it + leave new-mode so the thread renders. */
  public onChatConversationCreated(event: { conversation: MJConversationEntity; pendingMessage?: string }): void {
    this.pendingPrompt = event.pendingMessage ?? null;
    this.chatConversation = event.conversation;
    this.chatConversationId = event.conversation.ID;
    this.chatIsNewConversation = false;
    this.cdrLocal.detectChanges();
  }

  /** Chat-area delivered the seeded prompt — clear the buffer so a re-render doesn't resend it. */
  public onChatPendingMessageConsumed(): void {
    this.pendingPrompt = null;
    this.cdrLocal.detectChanges();
  }

  private async ensureModelDevAgentResolved(): Promise<void> {
    if (this._modelDevAgentId) return;
    try {
      await AIEngineBase.Instance.Config(false, this.ProviderToUse.CurrentUser ?? undefined);
      this._modelDevAgentId =
        AIEngineBase.Instance.Agents?.find((a) => a.Name?.trim().toLowerCase() === MODEL_DEV_AGENT_NAME.toLowerCase())?.ID ?? null;
      if (!this._modelDevAgentId) LogError(`PSStudioResource: '${MODEL_DEV_AGENT_NAME}' not found — chat uses default-agent routing.`);
      this.cdrLocal.detectChanges();
    } catch (err) {
      LogError(`PSStudioResource.ensureModelDevAgentResolved: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Tree-shaking prevention — called from the subpath module so the @RegisterClass survives bundling. */
export function LoadPSStudioResource(): void {
  // intentionally empty
}
