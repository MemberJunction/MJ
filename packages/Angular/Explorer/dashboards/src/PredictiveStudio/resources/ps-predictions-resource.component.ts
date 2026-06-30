import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { LogError, RunView, UserInfo } from '@memberjunction/core';
import { MJConversationEntity, MJEnvironmentEntityExtended, MJMLModelEntity, MJProcessRunDetailEntity } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { trustDots, trustEvidenceLine } from '@memberjunction/predictive-studio-core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';
import { buildBusinessCatalog, type BusinessPredictionCard } from '../business-predictions.view-models';
import { parseAtRiskRows, topGlobalDrivers, type AtRiskRow } from '../at-risk.view-models';

const PREDICTIVE_STUDIO_APP_ID = '299C9272-8D38-40CA-85D4-0980F2C9FAD1';
const MODEL_DEV_AGENT_NAME = 'Model Development Agent';

/**
 * **Predictions** — the business-user home for Predictive Studio (`option-b-refined` mockup). Reframes
 * published ML models as plain-language "predictions" in a catalog, each with a trust badge; opening one
 * goes to a workspace whose trust verdict GATES the actions (a Poor/unmeasured prediction can't be acted
 * on). "+ New prediction" opens the Model Development Agent (the deterministic builder) as a docked
 * co-pilot. Zero ML jargon — the analyst surfaces stay under the other nav items as "Advanced".
 */
@RegisterClass(BaseResourceComponent, 'PredictiveStudioPredictionsResource')
@Component({
  standalone: false,
  selector: 'mj-ps-predictions-resource',
  template: `
    <mj-page-header-interior
      [Title]="view === 'workspace' ? (selected?.title ?? 'Prediction') : 'Predictions'"
      [Subtitle]="view === 'workspace' ? 'Who to focus on, how much to trust it, and what to do next' : 'Ready-to-use predictions for your members'">
      <div actions>
        @if (view === 'catalog') {
          <button mjButton variant="primary" size="sm" data-testid="ps-new-prediction" (click)="newPrediction()">
            <i class="fa-solid fa-plus"></i> New prediction
          </button>
        }
      </div>
    </mj-page-header-interior>
    <mj-page-body-interior>
      @if (isLoading) {
        <mj-loading text="Loading your predictions…" size="medium"></mj-loading>
      } @else {
        <div class="ps-biz-host" [class.chat-open]="chatOpen">
          <div class="ps-biz-main">
            <!-- ───────── CATALOG ───────── -->
            @if (view === 'catalog') {
              @if (cards.length === 0) {
                <div class="ps-biz-empty" data-testid="ps-predictions-empty">
                  <i class="fa-solid fa-wand-magic-sparkles"></i>
                  <h3>No predictions yet</h3>
                  <p class="muted">Ask the Model Dev Agent to build your first one.</p>
                  <button mjButton variant="primary" size="md" (click)="newPrediction()"><i class="fa-solid fa-plus"></i> New prediction</button>
                </div>
              } @else {
                <div class="ps-biz-grid" data-testid="ps-predictions-grid">
                  @for (c of cards; track c.modelId) {
                    <div class="ps-biz-card" [class.blocked]="!c.canOpen" data-testid="ps-prediction-card">
                      <div class="ps-biz-card-top">
                        <span class="ps-trust-badge" [class]="'trust-' + c.trust.grade.toLowerCase()" data-testid="ps-trust-badge">
                          <i class="fa-solid fa-shield-halved"></i> {{ c.canOpen ? c.trust.grade : 'Not ready' }}
                        </span>
                      </div>
                      <h3 class="ps-biz-card-title">{{ c.title }}</h3>
                      <p class="ps-biz-card-line">{{ c.canOpen ? c.trust.oneLiner : c.blockedReason }}</p>
                      <div class="ps-biz-card-foot">
                        @if (c.canOpen) {
                          <button mjButton variant="secondary" size="sm" data-testid="ps-open-prediction" (click)="open(c)">Open <i class="fa-solid fa-arrow-right"></i></button>
                        } @else {
                          <button mjButton variant="secondary" size="sm" [disabled]="true" data-testid="ps-open-blocked"><i class="fa-solid fa-lock"></i> Needs an analyst</button>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            }

            <!-- ───────── WORKSPACE (trust gate) ───────── -->
            @if (view === 'workspace' && selected) {
              <nav class="ps-biz-crumb">
                <a (click)="backToCatalog()" data-testid="ps-crumb-home">Predictions</a>
                <i class="fa-solid fa-chevron-right"></i> <span>{{ selected.title }}</span>
              </nav>

              <div class="ps-trust-banner" [class]="'trust-' + selected.trust.grade.toLowerCase()" data-testid="ps-trust-banner">
                <div class="ps-trust-dots">
                  @for (d of [1,2,3,4,5]; track d) { <i class="fa-solid fa-star" [class.on]="d <= dots(selected)"></i> }
                </div>
                <div class="ps-trust-text">
                  <div class="ps-trust-grade">{{ selected.canOpen ? 'You can rely on this — ' + selected.trust.grade : 'Not reliable yet' }}</div>
                  <div class="ps-trust-line">{{ selected.trust.oneLiner }}</div>
                  <div class="ps-trust-explain muted">{{ selected.trust.explanation }}</div>
                  <div class="ps-trust-evidence muted">{{ evidence() }}</div>
                </div>
              </div>

              <div class="ps-biz-workspace-body" data-testid="ps-workspace-body">
                @if (selected.canOpen) {
                  @if (drivers.length > 0) {
                    <div class="ps-drivers" data-testid="ps-drivers">
                      <i class="fa-solid fa-lightbulb"></i> <strong>What's driving this:</strong>
                      @for (d of drivers; track d) { <span class="ps-driver-chip">{{ d }}</span> }
                    </div>
                  }
                  @if (atRiskLoading) {
                    <mj-loading text="Loading who's at risk…" size="small"></mj-loading>
                  } @else if (atRiskRows.length > 0) {
                    <div class="ps-atrisk" data-testid="ps-atrisk-list" #atriskList>
                      <div class="ps-atrisk-head"><span>Member</span><span class="ps-atrisk-rcol">Likelihood</span></div>
                      @for (r of atRiskRows.slice(0, 50); track r.recordId) {
                        <div class="ps-atrisk-row" data-testid="ps-atrisk-row">
                          <span class="ps-atrisk-id mono">{{ r.recordId }}</span>
                          <span class="ps-atrisk-bar"><span class="ps-atrisk-fill" [class]="'risk-' + r.band" [style.width.%]="r.riskPct"></span></span>
                          <span class="ps-atrisk-pct" [class]="'risk-' + r.band">{{ r.riskPct }}%</span>
                        </div>
                      }
                      <div class="ps-atrisk-foot muted">{{ atRiskRows.length > 50 ? 'Showing top 50 of ' + atRiskRows.length : atRiskRows.length + ' members' }} · highest first</div>
                    </div>
                  } @else {
                    <div class="ps-atrisk-empty muted" data-testid="ps-atrisk-empty">No results yet — run this prediction from <strong>Models in Production</strong> to see who's at risk.</div>
                  }
                }
                <div class="ps-action-bar" [class.locked]="!selected.canOpen" data-testid="ps-action-bar">
                  @if (selected.canOpen) {
                    <button mjButton variant="primary" size="sm" data-testid="ps-act-review" (click)="scrollToList()"><i class="fa-solid fa-list-check"></i> Review the call list</button>
                    <button mjButton variant="secondary" size="sm" data-testid="ps-act-save" (click)="askAgentTo('Save these renewal-risk scores onto the member records so my team can use them.')"><i class="fa-solid fa-floppy-disk"></i> Save scores to records</button>
                    <button mjButton variant="secondary" size="sm" data-testid="ps-act-list" (click)="askAgentTo('Put these at-risk members into a list called &quot;At-Risk Renewals&quot; for outreach.')"><i class="fa-solid fa-paper-plane"></i> Send to a list</button>
                    <button mjButton variant="secondary" size="sm" data-testid="ps-act-export" [disabled]="atRiskRows.length === 0" (click)="exportList()"><i class="fa-solid fa-file-export"></i> Share / export</button>
                  } @else {
                    <div class="ps-action-locked"><i class="fa-solid fa-lock"></i> {{ selected.trust.gateReason }}</div>
                  }
                </div>
              </div>
            }
          </div>

          @if (chatOpen) {
            <aside class="ps-biz-copilot" data-testid="ps-predictions-copilot">
              <div class="ps-biz-copilot-head">
                <div class="ps-biz-copilot-title"><i class="fa-solid fa-robot"></i> New prediction</div>
                <button class="ps-biz-copilot-close" (click)="closeChat()" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
              </div>
              <div class="ps-biz-copilot-body">
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
                    emptyStateGreeting="What do you want to predict? Describe it in plain words.">
                  </mj-conversation-chat-area>
                } @else { <div class="ps-biz-copilot-empty"><mj-loading text="Connecting…" size="small"></mj-loading></div> }
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
      .ps-biz-host { display: flex; flex: 1; min-height: 0; overflow: hidden; }
      .ps-biz-main { flex: 1; min-width: 0; overflow-y: auto; padding: 16px 18px 28px; }
      .ps-biz-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
      .ps-biz-card { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-lg); padding: 18px; box-shadow: var(--mj-shadow-sm); display: flex; flex-direction: column; gap: 10px; transition: box-shadow .15s, transform .15s; }
      .ps-biz-card:hover { box-shadow: var(--mj-shadow-md); transform: translateY(-2px); }
      .ps-biz-card.blocked { opacity: .85; background: var(--mj-bg-surface-card); }
      .ps-biz-card-title { font-size: var(--mj-text-lg); font-weight: 600; color: var(--mj-text-primary); margin: 0; }
      .ps-biz-card-line { color: var(--mj-text-secondary); font-size: var(--mj-text-sm); margin: 0; flex: 1; }
      .ps-biz-card-foot { display: flex; justify-content: flex-end; }
      .ps-trust-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: var(--mj-radius-full); font-size: var(--mj-text-xs); font-weight: 600; }
      .trust-good, .trust-excellent { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
      .trust-fair { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
      .trust-poor { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }
      .ps-biz-empty { text-align: center; padding: 64px 16px; color: var(--mj-text-secondary); }
      .ps-biz-empty i { font-size: 40px; color: var(--mj-brand-primary); margin-bottom: 12px; }
      .ps-biz-empty h3 { margin: 0 0 6px; color: var(--mj-text-primary); }
      .ps-biz-empty p { margin: 0 0 16px; }
      .ps-biz-crumb { display: flex; align-items: center; gap: 8px; font-size: var(--mj-text-sm); color: var(--mj-text-muted); margin-bottom: 14px; }
      .ps-biz-crumb a { color: var(--mj-text-link); cursor: pointer; }
      .ps-biz-crumb a:hover { text-decoration: underline; }
      .ps-biz-crumb i { font-size: 10px; }
      .ps-trust-banner { display: flex; gap: 16px; align-items: center; padding: 18px 20px; border-radius: var(--mj-radius-lg); border: 1px solid; margin-bottom: 18px; }
      .ps-trust-banner.trust-good, .ps-trust-banner.trust-excellent { background: var(--mj-status-success-bg); border-color: var(--mj-status-success-border); }
      .ps-trust-banner.trust-fair { background: var(--mj-status-warning-bg); border-color: var(--mj-status-warning-border); }
      .ps-trust-banner.trust-poor { background: var(--mj-status-error-bg); border-color: var(--mj-status-error-border); }
      .ps-trust-dots { display: flex; gap: 3px; font-size: 18px; }
      .ps-trust-dots i { color: var(--mj-border-strong); } .ps-trust-dots i.on { color: var(--mj-status-warning); }
      .ps-trust-banner.trust-good .ps-trust-dots i.on, .ps-trust-banner.trust-excellent .ps-trust-dots i.on { color: var(--mj-status-success); }
      .ps-trust-grade { font-weight: 700; font-size: var(--mj-text-lg); color: var(--mj-text-primary); }
      .ps-trust-line { font-weight: 600; color: var(--mj-text-primary); margin-top: 2px; }
      .ps-trust-explain, .ps-trust-evidence { font-size: var(--mj-text-sm); margin-top: 4px; }
      .ps-action-bar { display: flex; gap: 10px; flex-wrap: wrap; padding: 14px 16px; border-radius: var(--mj-radius-lg); background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-default); }
      .ps-action-bar.locked { background: var(--mj-status-error-bg); border-color: var(--mj-status-error-border); }
      .ps-action-locked { display: flex; align-items: center; gap: 8px; color: var(--mj-status-error-text); font-weight: 600; font-size: var(--mj-text-sm); }
      .ps-drivers { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 0 0 16px; color: var(--mj-text-secondary); font-size: var(--mj-text-sm); }
      .ps-drivers i { color: var(--mj-status-warning); }
      .ps-driver-chip { background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-full); padding: 2px 10px; font-weight: 600; color: var(--mj-text-primary); }
      .ps-atrisk { border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-lg); overflow: hidden; margin-bottom: 16px; background: var(--mj-bg-surface); }
      .ps-atrisk-head { display: grid; grid-template-columns: 1fr 140px 52px; gap: 12px; padding: 8px 14px; background: var(--mj-bg-surface-card); border-bottom: 1px solid var(--mj-border-default); font-size: var(--mj-text-xs); font-weight: 600; color: var(--mj-text-muted); text-transform: uppercase; letter-spacing: .03em; }
      .ps-atrisk-rcol { grid-column: 2 / span 2; text-align: right; }
      .ps-atrisk-row { display: grid; grid-template-columns: 1fr 140px 52px; gap: 12px; align-items: center; padding: 9px 14px; border-bottom: 1px solid var(--mj-border-subtle); }
      .ps-atrisk-row:last-child { border-bottom: none; }
      .ps-atrisk-row:hover { background: var(--mj-bg-surface-hover); }
      .ps-atrisk-id { font-size: var(--mj-text-xs); color: var(--mj-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ps-atrisk-bar { height: 8px; border-radius: var(--mj-radius-full); background: var(--mj-bg-surface-sunken); overflow: hidden; }
      .ps-atrisk-fill { display: block; height: 100%; border-radius: var(--mj-radius-full); }
      .ps-atrisk-pct { text-align: right; font-weight: 700; font-size: var(--mj-text-sm); font-variant-numeric: tabular-nums; }
      .ps-atrisk-fill.risk-high { background: var(--mj-status-error); }
      .ps-atrisk-fill.risk-medium { background: var(--mj-status-warning); }
      .ps-atrisk-fill.risk-low { background: var(--mj-status-success); }
      .ps-atrisk-pct.risk-high { color: var(--mj-status-error-text); }
      .ps-atrisk-pct.risk-medium { color: var(--mj-status-warning-text); }
      .ps-atrisk-pct.risk-low { color: var(--mj-status-success-text); }
      .ps-atrisk-foot { padding: 8px 14px; font-size: var(--mj-text-xs); }
      .ps-atrisk-empty { padding: 24px; text-align: center; border: 1px dashed var(--mj-border-default); border-radius: var(--mj-radius-lg); margin-bottom: 16px; }
      .mono { font-family: var(--mj-font-family-mono); }
      .ps-biz-copilot { width: 420px; max-width: 42vw; flex: none; border-left: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); display: flex; flex-direction: column; min-height: 0; }
      .ps-biz-copilot-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--mj-border-default); }
      .ps-biz-copilot-title { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--mj-text-primary); }
      .ps-biz-copilot-title i { color: var(--mj-brand-primary); }
      .ps-biz-copilot-close { background: transparent; border: none; cursor: pointer; padding: 6px 8px; border-radius: 6px; color: var(--mj-text-muted); }
      .ps-biz-copilot-close:hover { background: var(--mj-bg-surface-hover); color: var(--mj-text-secondary); }
      .ps-biz-copilot-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .ps-biz-copilot-body mj-conversation-chat-area { flex: 1; min-height: 0; display: block; }
      .ps-biz-copilot-empty { display: flex; align-items: center; justify-content: center; flex: 1; }
      @media (max-width: 1100px) { .ps-biz-host.chat-open .ps-biz-main { display: none; } .ps-biz-copilot { width: 100%; max-width: none; border-left: none; } }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PSPredictionsResourceComponent extends PSResourceBase {
  protected readonly SectionKey = 'predictions';
  protected readonly SectionLabel = 'Predictions';
  protected readonly SectionIcon = 'fa-solid fa-wand-magic-sparkles';

  private readonly cdrLocal = inject(ChangeDetectorRef);

  /** catalog (the home grid) ↔ workspace (a selected prediction). */
  public view: 'catalog' | 'workspace' = 'catalog';
  public selected: BusinessPredictionCard | null = null;
  public chatOpen = false;
  public pendingPrompt: string | null = null;
  private _modelDevAgentId: string | null = null;

  /**
   * Embedded co-pilot conversation state. The chat-area starts in "new conversation" mode; on the first
   * send it creates the conversation and emits `conversationCreated`, at which point we capture the live
   * conversation and flip out of new-mode so subsequent sends append to the same thread. Without this
   * wiring the suppressed empty-state input has no valid conversation to write into and the first send
   * silently no-ops (matches the proven Form Builder co-pilot pattern).
   */
  public chatConversation: MJConversationEntity | null = null;
  public chatConversationId: string | null = null;
  public chatIsNewConversation = true;

  /** The ranked at-risk rows for the open prediction's latest run (empty until loaded / when no run yet). */
  public atRiskRows: AtRiskRow[] = [];
  /** Plain-language "what's driving this" drivers for the open prediction (global feature importance). */
  public drivers: string[] = [];
  /** Whether the at-risk list is loading for the open prediction. */
  public atRiskLoading = false;

  /** The business catalog cards, most-trustworthy first, derived from the engine's published models. */
  public get cards(): BusinessPredictionCard[] {
    return buildBusinessCatalog(
      this.engine.PublishedModels.map((m: MJMLModelEntity) => ({
        modelId: m.ID,
        name: this.engine.ModelDisplayName(m),
        HoldoutMetrics: m.HoldoutMetrics,
        Metrics: m.Metrics,
        ProblemType: m.ProblemType,
        updatedAt: m.__mj_UpdatedAt ?? null,
      })),
    );
  }

  public dots(c: BusinessPredictionCard): number { return trustDots(c.trust.grade); }
  public evidence(): string { return trustEvidenceLine({ noun: 'members' }); }

  public open(c: BusinessPredictionCard): void {
    if (!c.canOpen) return;
    this.selected = c;
    this.view = 'workspace';
    this.atRiskRows = [];
    this.drivers = [];
    this.cdrLocal.detectChanges();
    void this.loadAtRisk(c);
  }

  /** Load the open prediction's plain-language drivers + its latest run's ranked at-risk rows. */
  private async loadAtRisk(c: BusinessPredictionCard): Promise<void> {
    const model = this.engine.PublishedModels.find((m) => m.ID === c.modelId);
    this.drivers = topGlobalDrivers(model?.FeatureImportance ?? null, 3);
    this.atRiskLoading = true;
    this.cdrLocal.detectChanges();
    try {
      const provider = this.ProviderToUse;
      const user = provider.CurrentUser ?? undefined;
      const runs = await this.engine.LoadRecentRunsForModel(c.modelId, provider, user, { maxRows: 1 });
      const latest = runs[0];
      if (latest?.ID) {
        const res = await RunView.FromMetadataProvider(provider).RunView<MJProcessRunDetailEntity>(
          { EntityName: 'MJ: Process Run Details', ExtraFilter: `ProcessRunID='${latest.ID}'`, MaxRows: 2137, ResultType: 'entity_object' },
          user,
        );
        if (res.Success && this.selected?.modelId === c.modelId) {
          this.atRiskRows = parseAtRiskRows((res.Results ?? []).map((d) => ({ recordId: d.RecordID, ResultPayload: d.ResultPayload })));
        }
      }
    } catch (err) {
      LogError(`PSPredictionsResource.loadAtRisk: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.atRiskLoading = false;
      this.cdrLocal.detectChanges();
    }
  }

  public backToCatalog(): void {
    this.view = 'catalog';
    this.selected = null;
    this.atRiskRows = [];
    this.drivers = [];
    this.cdrLocal.detectChanges();
  }

  /** "Review the call list" — scroll the ranked at-risk list into view. */
  public scrollToList(): void {
    document.querySelector('[data-testid="ps-atrisk-list"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** "Save scores" / "Send to a list" — open the docked co-pilot seeded with the request (the agent does it). */
  public askAgentTo(prompt: string): void {
    this.pendingPrompt = prompt;
    this.chatOpen = true;
    void this.ensureModelDevAgentResolved();
    this.cdrLocal.detectChanges();
  }

  /** "Share / export" — download the at-risk list as a CSV (dependency-free). */
  public exportList(): void {
    if (this.atRiskRows.length === 0) return;
    const csv = ['Member,Likelihood %,Predicted', ...this.atRiskRows.map((r) => `${r.recordId},${r.riskPct},${r.class ?? ''}`)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(this.selected?.title ?? 'prediction').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-at-risk.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public newPrediction(): void {
    this.pendingPrompt = 'Help me build a new prediction. What do you want to know about your members?';
    this.chatOpen = true;
    void this.ensureModelDevAgentResolved();
    this.cdrLocal.detectChanges();
  }

  public closeChat(): void {
    this.chatOpen = false;
    this.pendingPrompt = null;
    this.cdrLocal.detectChanges();
  }

  /**
   * The chat-area created its backing conversation after the user's first message — capture the live
   * conversation, re-feed the pending message in the same change-detection cycle, and leave new-mode so
   * the thread renders (mirrors the Form Builder co-pilot's atomic state-flip).
   */
  public onChatConversationCreated(event: { conversation: MJConversationEntity; pendingMessage?: string }): void {
    this.pendingPrompt = event.pendingMessage ?? null;
    this.chatConversation = event.conversation;
    this.chatConversationId = event.conversation.ID;
    this.chatIsNewConversation = false;
    this.cdrLocal.detectChanges();
  }

  /** The chat-area delivered the seeded prompt — clear the buffer so a re-render doesn't resend it. */
  public onChatPendingMessageConsumed(): void {
    this.pendingPrompt = null;
    this.cdrLocal.detectChanges();
  }

  public get currentUser(): UserInfo | null { return this.ProviderToUse.CurrentUser ?? null; }
  public get chatEnvironmentId(): string {
    return (this.Data?.Configuration?.['environmentId'] as string | undefined) || MJEnvironmentEntityExtended.DefaultEnvironmentID;
  }
  public get applicationId(): string | null { return (this.Data?.Configuration?.['applicationId'] as string | undefined) ?? null; }
  public get modelDevAgentId(): string | null { return this._modelDevAgentId; }
  public get chatAppContext(): Record<string, unknown> {
    return { app: 'Predictive Studio', section: 'predictions', publishedModels: this.engine.PublishedModels.length };
  }

  private async ensureModelDevAgentResolved(): Promise<void> {
    if (this._modelDevAgentId) return;
    try {
      await AIEngineBase.Instance.Config(false, this.ProviderToUse.CurrentUser ?? undefined);
      this._modelDevAgentId =
        AIEngineBase.Instance.Agents?.find((a) => a.Name?.trim().toLowerCase() === MODEL_DEV_AGENT_NAME.toLowerCase())?.ID ?? null;
      if (!this._modelDevAgentId) LogError(`PSPredictionsResource: '${MODEL_DEV_AGENT_NAME}' not found — chat uses default-agent routing.`);
      this.cdrLocal.detectChanges();
    } catch (err) {
      LogError(`PSPredictionsResource.ensureModelDevAgentResolved: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/** Tree-shaking prevention — called from the subpath module so the @RegisterClass survives bundling. */
export function LoadPSPredictionsResource(): void {
  // intentionally empty
}
