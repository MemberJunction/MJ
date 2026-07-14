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
  hasSection,
  routeHomeNavigate,
} from '../predictive-studio.nav';
import { buildStudioAgentContext, resolvePSRecord, buildPSNotFoundError } from '../predictive-studio-agent-context';
import { validateStringParam } from '../../shared/agent-tool-validation';

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
    <mj-page-header-interior [Title]="activeLabel" [Subtitle]="activeSubtitle">
    </mj-page-header-interior>
    <mj-page-body-interior [Flex]="true" [Padding]="false">
      @if (isLoading) {
        <mj-loading text="Loading Studio…" size="medium"></mj-loading>
      } @else if (loadError) {
        <div class="ps-load-error" data-testid="ps-load-error" role="alert">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div class="ps-load-error-text">
            <strong>Couldn't load {{ sectionTitle }}</strong>
            <span class="ps-load-error-detail">{{ loadError }}</span>
          </div>
          <button mjButton variant="secondary" size="sm" (click)="retryLoad()"><i class="fa-solid fa-rotate-right"></i> Try again</button>
        </div>
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

          <section class="ps-content" [class.fill]="activeSection === 'pipelines'" [attr.data-testid]="'ps-panel-' + activeSection">
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
                    (pendingMessageConsumed)="onChatPendingMessageConsumed()">
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
      /* Fill mode (pipelines): the section stops page-scrolling so the panel's inner
         columns (canvas / inspector) can each own their scrollbar. */
      .ps-content.fill { overflow: hidden; display: flex; flex-direction: column; padding-bottom: 14px; }
      .ps-content.fill > * { flex: 1; min-height: 0; display: flex; flex-direction: column; }
      .ps-copilot { width: 420px; max-width: 42vw; flex: none; border-left: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); display: flex; flex-direction: column; min-height: 0; }
      .ps-copilot-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--mj-border-default); }
      .ps-copilot-title { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--mj-text-primary); }
      .ps-copilot-title i { color: var(--mj-brand-primary); }
      .ps-copilot-close { background: transparent; border: none; cursor: pointer; padding: 6px 8px; border-radius: 6px; color: var(--mj-text-muted); }
      .ps-copilot-close:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-secondary); }
      .ps-copilot-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .ps-copilot-body mj-conversation-chat-area { flex: 1; min-height: 0; display: block; }
      .ps-copilot-empty { display: flex; align-items: center; justify-content: center; flex: 1; }
      .ps-load-error { display: flex; align-items: center; gap: 14px; max-width: 620px; margin: 32px auto; padding: 18px 20px; border: 1px solid var(--mj-status-error-border); background: var(--mj-status-error-bg); border-radius: var(--mj-radius-lg); }
      .ps-load-error > i { font-size: 24px; color: var(--mj-status-error); }
      .ps-load-error-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      .ps-load-error-text strong { color: var(--mj-text-primary); }
      .ps-load-error-detail { color: var(--mj-text-secondary); font-size: var(--mj-text-sm); word-break: break-word; }
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

  /** Deep agent context for the Studio door (build/run workbench counts + active section). */
  protected override extraAgentContext(): Record<string, unknown> {
    return buildStudioAgentContext({
      ActiveSection: this.activeSection,
      ActiveSectionLabel: this.activeLabel,
      SectionLabels: this.sections.map((s) => s.label),
      PublishedModelCount: this.engine.PublishedModels.length,
      RunningSessionCount: this.engine.RunningSessions.length,
      PipelineCount: this.engine.Pipelines.length,
      AlgorithmCount: this.engine.Algorithms.length,
      ExperimentCount: this.engine.Experiments.length,
      TrainingRunCount: this.engine.TrainingRuns.length,
      ChatOpen: this.chatOpen,
    });
  }

  /**
   * 🔒 Read/navigate-only agent tools for the Studio door: switch the active section, or open the docked
   * Model Dev Agent co-pilot. NO build/train/publish tool is exposed — model creation runs through the
   * co-pilot conversation (the approve-gated builder), never a fire-and-forget agent tool.
   */
  protected override registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'SwitchStudioSection',
        Description:
          'Switch the Studio workbench to a section. Pass the section key or label (see SectionLabels): Overview, Training Pipelines, Algorithm Catalog, Experiments, or Compare Runs.',
        ParameterSchema: { type: 'object', properties: { section: { type: 'string', description: 'The section key or label to switch to' } } },
        Handler: async (params: Record<string, unknown>) => {
          const check = validateStringParam(params['section'], 'section');
          if (!check.ok) return check.result;
          const candidates = this.sections.map((s) => ({ ID: s.key, Name: s.label }));
          const match = resolvePSRecord(check.value, candidates);
          if (!match) return { Success: false, ErrorMessage: buildPSNotFoundError(check.value, candidates, 'section') };
          this.selectSection(match.ID as PSPanelKey);
          return { Success: true, Data: { activeSection: match.Name } };
        },
      },
      {
        Name: 'OpenModelDevAgentCopilot',
        Description:
          'Open the docked Model Development Agent co-pilot in the Studio (does not send a message — the user drives the conversation). Use when the user wants to design/build a new prediction.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.openCopilot();
          return { Success: true, Data: { chatOpen: true } };
        },
      },
    ]);
  }

  // ── left-nav ─────────────────────────────────────────────────────
  public get groups(): string[] { return sectionGroups(this.sections); }
  public itemsForGroup(group: string): PSSection[] { return sectionsInGroup(this.sections, group); }
  public get activeLabel(): string { return sectionLabel(this.sections, this.activeSection); }

  /** Section-specific subtitle for the interior header (so every section doesn't repeat one generic line). */
  public get activeSubtitle(): string {
    const map: Record<string, string> = {
      home: 'Start a new prediction from your data, a template, or the agent.',
      pipelines: 'Assemble features and train from the algorithm catalog.',
      catalog: 'Browse algorithms with a fit guide for your use case.',
      experiments: 'Run and track model experiments.',
      compare: 'Compare runs on the honest holdout score.',
    };
    return map[this.activeSection] ?? '';
  }

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
    this.publishAgentContext();
    this.cdrLocal.detectChanges();
  }

  /** Open the docked co-pilot (clean chat) — used by the read-only `OpenModelDevAgentCopilot` agent tool. */
  public openCopilot(): void {
    this.pendingPrompt = null;
    this.chatOpen = true;
    void this.ensureModelDevAgentResolved();
    this.publishAgentContext();
    this.cdrLocal.detectChanges();
  }

  public closeChat(): void {
    this.chatOpen = false;
    this.pendingPrompt = null;
    this.publishAgentContext();
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
