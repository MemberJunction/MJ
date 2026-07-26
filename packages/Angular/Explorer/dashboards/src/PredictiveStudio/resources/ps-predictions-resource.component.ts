import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { LogError, RunView, UserInfo } from '@memberjunction/core';
import { MJConversationEntity, MJEnvironmentEntityExtended, MJMLModelEntity, MJProcessRunDetailEntity, MJListEntity, MJListDetailEntity } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { trustDots, trustEvidenceLine } from '@memberjunction/predictive-studio-core';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { PSResourceBase } from './ps-resource-base';
import { buildBusinessCatalog, type BusinessPredictionCard } from '../business-predictions.view-models';
import { parseAtRiskRows, topGlobalDrivers, labelFromRecord, type AtRiskRow } from '../at-risk.view-models';
import { buildPredictionsAgentContext, resolvePSRecord, buildPSNotFoundError } from '../predictive-studio-agent-context';
import { validateStringParam } from '../../shared/agent-tool-validation';
import { buildImprovePrompt, PS_CAPABILITY_CARDS, type PSCapabilityCard } from '../predictive-studio-copilot.view-models';

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
    <mj-page-body-interior [Flex]="true" [Padding]="false">
      @if (isLoading) {
        <mj-loading text="Loading your predictions…" size="medium"></mj-loading>
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
        <div class="ps-biz-host" [class.chat-open]="chatOpen">
          <div class="ps-biz-main">
            <!-- ───────── CATALOG ───────── -->
            @if (view === 'catalog') {
              @if (cards.length === 0) {
                <div class="ps-biz-intro" data-testid="ps-predictions-empty">
                  <div class="ps-biz-intro-head">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    <h2>Predict what's next for your data</h2>
                    <p>Predictive Studio turns your records into plain-language predictions — describe what you want to know, and the agent builds and trains a model with you. Here's what you can do:</p>
                  </div>
                  <div class="ps-cap-grid">
                    @for (cap of capabilityCards; track cap.title) {
                      <div class="ps-cap-card">
                        <i [class]="cap.icon"></i>
                        <div class="ps-cap-title">{{ cap.title }}</div>
                        <div class="ps-cap-blurb">{{ cap.blurb }}</div>
                      </div>
                    }
                  </div>
                  <button mjButton variant="primary" size="md" data-testid="ps-intro-build" (click)="newPrediction()"><i class="fa-solid fa-plus"></i> Build your first prediction</button>
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
                          <button mjButton variant="secondary" size="sm" data-testid="ps-improve-prediction" (click)="improvePrediction(c)"><i class="fa-solid fa-wand-magic-sparkles"></i> Improve this</button>
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
                  } @else if (atRiskError) {
                    <div class="ps-atrisk-error" data-testid="ps-atrisk-error" role="alert">
                      <i class="fa-solid fa-triangle-exclamation"></i>
                      <span class="ps-atrisk-error-msg">Couldn't load who's at risk: {{ atRiskError }}</span>
                      <button mjButton variant="secondary" size="sm" (click)="retryAtRisk()"><i class="fa-solid fa-rotate-right"></i> Try again</button>
                    </div>
                  } @else if (atRiskRows.length > 0) {
                    <div class="ps-atrisk" data-testid="ps-atrisk-list" #atriskList>
                      <div class="ps-atrisk-head"><span>Member</span><span class="ps-atrisk-rcol">Likelihood</span></div>
                      @for (r of atRiskRows.slice(0, 50); track r.recordId) {
                        <div class="ps-atrisk-row" data-testid="ps-atrisk-row">
                          <div class="ps-atrisk-idcell">
                            <span class="ps-atrisk-id" [class.mono]="!r.label" [title]="r.recordId">{{ r.label || r.recordId }}</span>
                            @if (r.drivers && r.drivers.length > 0) {
                              <span class="ps-atrisk-why" data-testid="ps-atrisk-why">
                                @for (d of r.drivers.slice(0, 2); track d.label) {
                                  <span class="ps-why-chip" [class.up]="d.up" [class.down]="!d.up" [title]="(d.up ? 'Increases risk: ' : 'Lowers risk: ') + d.label">
                                    <i class="fa-solid" [class.fa-arrow-up]="d.up" [class.fa-arrow-down]="!d.up"></i> {{ d.label }}
                                  </span>
                                }
                              </span>
                            }
                          </div>
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
                    <button mjButton variant="secondary" size="sm" data-testid="ps-act-list" [disabled]="creatingList || atRiskRows.length === 0" (click)="sendToList()"><i class="fa-solid" [class.fa-paper-plane]="!creatingList" [class.fa-spinner]="creatingList" [class.fa-spin]="creatingList"></i> Send to a list</button>
                    <button mjButton variant="secondary" size="sm" data-testid="ps-act-export" [disabled]="atRiskRows.length === 0" (click)="exportList()"><i class="fa-solid fa-file-export"></i> Share / export</button>
                  } @else {
                    <div class="ps-action-locked"><i class="fa-solid fa-lock"></i> {{ selected.trust.gateReason }}</div>
                  }
                </div>
                @if (listResult) { <div class="ps-list-result muted" data-testid="ps-list-result">{{ listResult }}</div> }
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
                    (pendingMessageConsumed)="onChatPendingMessageConsumed()">
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
      .ps-biz-card { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-md); padding: 18px; display: flex; flex-direction: column; gap: 10px; transition: border-color .12s, background .12s; }
      .ps-biz-card:hover { border-color: var(--mj-brand-primary); background: color-mix(in srgb, var(--mj-brand-primary) 4%, var(--mj-bg-surface)); }
      .ps-biz-card.blocked { opacity: .85; background: var(--mj-bg-surface-card); }
      .ps-biz-card-title { font-size: var(--mj-text-lg); font-weight: 600; color: var(--mj-text-primary); margin: 0; }
      .ps-biz-card-line { color: var(--mj-text-secondary); font-size: var(--mj-text-sm); margin: 0; flex: 1; }
      .ps-biz-card-foot { display: flex; justify-content: flex-end; }
      .ps-trust-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: var(--mj-radius-full); font-size: var(--mj-text-xs); font-weight: 600; }
      .trust-good, .trust-excellent { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
      .trust-fair { background: var(--mj-status-warning-bg); color: var(--mj-status-warning-text); }
      .trust-poor { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }
      .ps-biz-intro { max-width: 820px; margin: 32px auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 20px; }
      .ps-biz-intro-head i { font-size: 40px; color: var(--mj-brand-primary); }
      .ps-biz-intro-head h2 { margin: 12px 0 6px; color: var(--mj-text-primary); font-size: var(--mj-text-xl); }
      .ps-biz-intro-head p { margin: 0 auto; max-width: 620px; color: var(--mj-text-secondary); font-size: var(--mj-text-sm); }
      .ps-cap-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; width: 100%; }
      .ps-cap-card { background: var(--mj-bg-surface); border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-md); padding: 18px 16px; text-align: left; display: flex; flex-direction: column; gap: 6px; }
      .ps-cap-card i { font-size: 20px; color: var(--mj-brand-primary); }
      .ps-cap-title { font-weight: 600; color: var(--mj-text-primary); font-size: var(--mj-text-sm); }
      .ps-cap-blurb { color: var(--mj-text-secondary); font-size: var(--mj-text-xs); line-height: 1.45; }
      .ps-biz-crumb { display: flex; align-items: center; gap: 8px; font-size: var(--mj-text-sm); color: var(--mj-text-muted); margin-bottom: 14px; }
      .ps-biz-crumb a { color: var(--mj-text-link); cursor: pointer; }
      .ps-biz-crumb a:hover { text-decoration: underline; }
      .ps-biz-crumb i { font-size: 10px; }
      .ps-trust-banner { display: flex; gap: 16px; align-items: center; padding: 18px 20px; border-radius: var(--mj-radius-md); border: 1px solid; margin-bottom: 18px; }
      .ps-trust-banner.trust-good, .ps-trust-banner.trust-excellent { background: var(--mj-status-success-bg); border-color: var(--mj-status-success-border); }
      .ps-trust-banner.trust-fair { background: var(--mj-status-warning-bg); border-color: var(--mj-status-warning-border); }
      .ps-trust-banner.trust-poor { background: var(--mj-status-error-bg); border-color: var(--mj-status-error-border); }
      .ps-trust-dots { display: flex; gap: 3px; font-size: 18px; }
      .ps-trust-dots i { color: var(--mj-border-strong); } .ps-trust-dots i.on { color: var(--mj-status-warning); }
      .ps-trust-banner.trust-good .ps-trust-dots i.on, .ps-trust-banner.trust-excellent .ps-trust-dots i.on { color: var(--mj-status-success); }
      .ps-trust-grade { font-weight: 700; font-size: var(--mj-text-lg); color: var(--mj-text-primary); }
      .ps-trust-line { font-weight: 600; color: var(--mj-text-primary); margin-top: 2px; }
      .ps-trust-explain, .ps-trust-evidence { font-size: var(--mj-text-sm); margin-top: 4px; }
      .ps-action-bar { display: flex; gap: 10px; flex-wrap: wrap; padding: 14px 16px; border-radius: var(--mj-radius-md); background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-default); }
      .ps-action-bar.locked { background: var(--mj-status-error-bg); border-color: var(--mj-status-error-border); }
      .ps-action-locked { display: flex; align-items: center; gap: 8px; color: var(--mj-status-error-text); font-weight: 600; font-size: var(--mj-text-sm); }
      .ps-drivers { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 0 0 16px; color: var(--mj-text-secondary); font-size: var(--mj-text-sm); }
      .ps-drivers i { color: var(--mj-status-warning); }
      .ps-driver-chip { background: var(--mj-bg-surface-card); border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-full); padding: 2px 10px; font-weight: 600; color: var(--mj-text-primary); }
      .ps-atrisk { border: 1px solid var(--mj-border-default); border-radius: var(--mj-radius-md); overflow: hidden; margin-bottom: 16px; background: var(--mj-bg-surface); }
      .ps-atrisk-head { display: grid; grid-template-columns: 1fr 140px 52px; gap: 12px; padding: 8px 14px; background: var(--mj-bg-surface-card); border-bottom: 1px solid var(--mj-border-default); font-size: var(--mj-text-xs); font-weight: 600; color: var(--mj-text-muted); text-transform: uppercase; letter-spacing: .03em; }
      .ps-atrisk-rcol { grid-column: 2 / span 2; text-align: right; }
      .ps-atrisk-row { display: grid; grid-template-columns: 1fr 140px 52px; gap: 12px; align-items: center; padding: 9px 14px; border-bottom: 1px solid var(--mj-border-subtle); }
      .ps-atrisk-row:last-child { border-bottom: none; }
      .ps-atrisk-row:hover { background: var(--mj-bg-surface-hover); }
      .ps-atrisk-idcell { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
      .ps-atrisk-id { font-size: var(--mj-text-xs); color: var(--mj-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ps-atrisk-why { display: flex; gap: 6px; flex-wrap: wrap; }
      .ps-why-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: var(--mj-radius-full); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ps-why-chip i { font-size: 8px; }
      .ps-why-chip.up { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); }
      .ps-why-chip.down { background: var(--mj-status-success-bg); color: var(--mj-status-success-text); }
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
      .ps-atrisk-empty { padding: 24px; text-align: center; border: 1px dashed var(--mj-border-default); border-radius: var(--mj-radius-md); margin-bottom: 16px; }
      .ps-atrisk-error { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border: 1px solid var(--mj-status-error-border); background: var(--mj-status-error-bg); border-radius: var(--mj-radius-md); margin-bottom: 16px; color: var(--mj-status-error-text); font-size: var(--mj-text-sm); }
      .ps-atrisk-error i { color: var(--mj-status-error); }
      .ps-atrisk-error .ps-atrisk-error-msg { flex: 1; min-width: 0; word-break: break-word; }
      .mono { font-family: var(--mj-font-family-mono); }
      /* Kept local (not in the shared stylesheet) deliberately: shared styles are injected by the
         ViewEncapsulation.None PANEL components, and this banner renders precisely when panels DON'T. */
      .ps-load-error { display: flex; align-items: center; gap: 14px; max-width: 620px; margin: 32px auto; padding: 18px 20px; border: 1px solid var(--mj-status-error-border); background: var(--mj-status-error-bg); border-radius: var(--mj-radius-lg); }
      .ps-load-error > i { font-size: 24px; color: var(--mj-status-error); }
      .ps-load-error-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
      .ps-load-error-text strong { color: var(--mj-text-primary); }
      .ps-load-error-detail { color: var(--mj-text-secondary); font-size: var(--mj-text-sm); word-break: break-word; }
      .ps-biz-copilot { width: 560px; min-width: 380px; max-width: 60vw; flex: none; border-left: 1px solid var(--mj-border-default); background: var(--mj-bg-surface); display: flex; flex-direction: column; min-height: 0; }
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
  /** Set when the at-risk load fails — the workspace shows a "couldn't load" banner with retry instead of the misleading no-results empty state. */
  public atRiskError: string | null = null;
  /** "Send to a list" in-flight guard + last-result message (P1 #4). */
  public creatingList = false;
  public listResult: string | null = null;

  /** Capability cards for the first-run intro (what PS can do), shown when the catalog is empty. */
  public readonly capabilityCards: readonly PSCapabilityCard[] = PS_CAPABILITY_CARDS;

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

  /** Deep agent context for the Predictions door: catalog counts + names, and (in workspace) the selection + at-risk breakdown. */
  protected override extraAgentContext(): Record<string, unknown> {
    const cards = this.cards;
    return buildPredictionsAgentContext({
      View: this.view,
      PredictionCount: cards.length,
      ReadyPredictionCount: cards.filter((c) => c.canOpen).length,
      VisiblePredictionNames: cards.map((c) => c.title),
      ChatOpen: this.chatOpen,
      Selected: this.selected ? { Name: this.selected.title, TrustGrade: this.selected.trust.grade, CanOpen: this.selected.canOpen } : null,
      AtRiskLoaded: this.view === 'workspace' && !this.atRiskLoading && !this.atRiskError,
      AtRiskCount: this.atRiskRows.length,
      HighRiskCount: this.atRiskRows.filter((r) => r.band === 'high').length,
      MediumRiskCount: this.atRiskRows.filter((r) => r.band === 'medium').length,
      LowRiskCount: this.atRiskRows.filter((r) => r.band === 'low').length,
      Drivers: this.drivers,
    });
  }

  /**
   * 🔒 Read/navigate-only agent tools for the Predictions door: open a (trust-cleared) prediction, go back
   * to the catalog, review the call list, export the at-risk list (CSV — read-only, mirrors Data Explorer's
   * ExportView), and open the "+ New prediction" co-pilot. **DELIBERATELY NOT exposed:** "Save scores to
   * records", "Send to a list" (both WRITE records), and any train/publish/delete — those stay behind the
   * user's clicks and the approve-gated builder.
   */
  protected override registerAgentTools(): void {
    this.navigationService.SetAgentClientTools(this, [
      {
        Name: 'OpenPrediction',
        Description:
          'Open a prediction to its workspace (trust verdict + who-is-at-risk list). Pass the prediction ID or name (see VisiblePredictionNames). Only trust-cleared predictions can open; a blocked one returns why.',
        ParameterSchema: { type: 'object', properties: { prediction: { type: 'string', description: 'The prediction ID or name to open' } } },
        Handler: async (params: Record<string, unknown>) => {
          const check = validateStringParam(params['prediction'], 'prediction');
          if (!check.ok) return check.result;
          const candidates = this.cards.map((c) => ({ ID: c.modelId, Name: c.title }));
          const match = resolvePSRecord(check.value, candidates);
          if (!match) return { Success: false, ErrorMessage: buildPSNotFoundError(check.value, candidates, 'prediction') };
          const card = this.cards.find((c) => UUIDsEqual(c.modelId, match.ID));
          if (!card) return { Success: false, ErrorMessage: buildPSNotFoundError(check.value, candidates, 'prediction') };
          if (!card.canOpen) {
            return { Success: false, ErrorMessage: `"${card.title}" isn't ready to open: ${card.blockedReason ?? card.trust.gateReason ?? 'it needs an analyst first.'}` };
          }
          this.open(card);
          return { Success: true, Data: { opened: card.title, trust: card.trust.grade } };
        },
      },
      {
        Name: 'BackToPredictionCatalog',
        Description: 'Return from a prediction workspace to the catalog (the grid of all predictions).',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.backToCatalog();
          this.publishAgentContext();
          return { Success: true, Data: { view: 'catalog' } };
        },
      },
      {
        Name: 'ReviewCallList',
        Description: 'Scroll the open prediction workspace to its ranked at-risk "call list". Only meaningful when a prediction is open.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          if (this.view !== 'workspace' || !this.selected) return { Success: false, ErrorMessage: 'No prediction is open. Use OpenPrediction first.' };
          this.scrollToList();
          return { Success: true };
        },
      },
      {
        Name: 'ExportAtRiskList',
        Description: 'Download the open prediction\'s at-risk list as a CSV (read-only export). Only works when a prediction is open and its list has loaded.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          if (this.view !== 'workspace' || this.atRiskRows.length === 0) return { Success: false, ErrorMessage: 'No at-risk list is loaded to export. Open a prediction with results first.' };
          this.exportList();
          return { Success: true, Data: { rows: this.atRiskRows.length } };
        },
      },
      {
        Name: 'OpenNewPredictionCopilot',
        Description: 'Open the "+ New prediction" Model Development Agent co-pilot (does not send a message — the user drives the conversation). Use when the user wants to build a new prediction.',
        ParameterSchema: { type: 'object', properties: {} },
        Handler: async () => {
          this.openNewPredictionCopilot();
          return { Success: true, Data: { chatOpen: true } };
        },
      },
    ]);
  }

  public open(c: BusinessPredictionCard): void {
    if (!c.canOpen) return;
    this.selected = c;
    this.view = 'workspace';
    this.atRiskRows = [];
    this.drivers = [];
    this.atRiskError = null;
    this.listResult = null;
    // Mark loading BEFORE the publish below: otherwise AtRiskLoaded computes true for one publish with
    // atRiskRows still [], fabricating "0 at risk" to the agent for a list that hasn't been fetched yet.
    this.atRiskLoading = true;
    this.publishAgentContext();
    this.cdrLocal.detectChanges();
    void this.loadAtRisk(c);
  }

  /** Load the open prediction's plain-language drivers + its latest run's ranked at-risk rows. */
  private async loadAtRisk(c: BusinessPredictionCard): Promise<void> {
    const model = this.engine.PublishedModels.find((m) => UUIDsEqual(m.ID, c.modelId));
    this.drivers = topGlobalDrivers(model?.FeatureImportance ?? null, 3);
    this.atRiskLoading = true;
    this.atRiskError = null;
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
          await this.resolveAtRiskLabels(model);
        }
      }
    } catch (err) {
      this.atRiskError = err instanceof Error ? err.message : String(err);
      LogError(`PSPredictionsResource.loadAtRisk: ${this.atRiskError}`);
    } finally {
      this.atRiskLoading = false;
      this.publishAgentContext();
      this.cdrLocal.detectChanges();
    }
  }

  /** Retry loading the open prediction's at-risk list after a failure — bound to the at-risk error banner. */
  public retryAtRisk(): void {
    if (this.selected) void this.loadAtRisk(this.selected);
  }

  /**
   * P1 #3 — resolve the raw record ids in the at-risk list to human labels (member name/email) from the
   * model's target entity, so the list reads like a call sheet instead of a column of UUIDs. Resolves the
   * top-risk rows (capped) to keep the lookup light; unresolved rows fall back to their id in the template.
   */
  /** Resolve a model's scored target entity (id + name) via its pipeline — the model row itself only carries PipelineID. */
  private targetEntityForModel(model: MJMLModelEntity | undefined): { id: string; name: string } | null {
    const pipeline = model ? this.engine.Pipelines.find((pp) => UUIDsEqual(pp.ID, model.PipelineID)) : undefined;
    const id = pipeline?.TargetEntityID;
    if (!id) return null;
    const name = this.ProviderToUse.Entities.find((e) => UUIDsEqual(e.ID, id))?.Name;
    return name ? { id, name } : null;
  }

  private async resolveAtRiskLabels(model: MJMLModelEntity | undefined): Promise<void> {
    // Labels are cosmetic — any failure here degrades to record ids, it must never surface as a
    // "couldn't load who's at risk" error that hides a perfectly good list.
    try {
      const target = this.targetEntityForModel(model);
      if (!target || this.atRiskRows.length === 0) return;
      const entity = this.ProviderToUse.EntityByName(target.name);
      const targets = this.atRiskRows.slice(0, 200); // the rows a user actually acts on
      const ids = targets.map((r) => `'${r.recordId.replace(/'/g, "''")}'`);
      // Only fetch the columns labelFromRecord can actually use — a broad no-Fields fetch pulls every
      // column (incl. large text/JSON) of an arbitrary entity just to render a display name. Fall back
      // to the broad fetch only when the entity has none of the candidate label fields.
      const candidates = ['Name', 'FirstName', 'LastName', 'Email'];
      const labelFields = entity ? candidates.filter((c) => entity.Fields.some((f) => f.Name.toLowerCase() === c.toLowerCase())) : [];
      const res = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<Record<string, unknown>>(
        {
          EntityName: target.name,
          ExtraFilter: `ID IN (${ids.join(',')})`,
          ...(labelFields.length > 0 ? { Fields: ['ID', ...labelFields] } : {}),
          ResultType: 'simple',
          MaxRows: ids.length,
        },
        this.ProviderToUse.CurrentUser ?? undefined,
      );
      if (!res.Success) return;
      const byId = new Map<string, Record<string, unknown>>();
      for (const row of res.Results ?? []) byId.set(NormalizeUUID(String((row as { ID?: unknown }).ID ?? '')), row);
      for (const r of this.atRiskRows) {
        const rec = byId.get(NormalizeUUID(r.recordId));
        if (rec) r.label = labelFromRecord(rec);
      }
    } catch (err) {
      LogError(`PSPredictionsResource.resolveAtRiskLabels (cosmetic — list keeps ids): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  public backToCatalog(): void {
    this.view = 'catalog';
    this.selected = null;
    this.atRiskRows = [];
    this.drivers = [];
    this.atRiskError = null;
    this.publishAgentContext();
    this.cdrLocal.detectChanges();
  }

  /** "Review the call list" — scroll the ranked at-risk list into view. */
  public scrollToList(): void {
    document.querySelector('[data-testid="ps-atrisk-list"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** "Save scores" — still routed conversationally through the co-pilot (needs a designated write-back column). */
  public askAgentTo(prompt: string): void {
    this.pendingPrompt = prompt;
    this.chatOpen = true;
    void this.ensureModelDevAgentResolved();
    this.cdrLocal.detectChanges();
  }

  /**
   * P1 #4 — "Send to a list" as a one-click server action (no agent sentence to parse): create an MJ List
   * over the model's target entity and add the at-risk members (high/medium band, capped) so a team can
   * act on it immediately (outreach campaign, tasks, etc.).
   */
  public async sendToList(): Promise<void> {
    if (this.creatingList || this.atRiskRows.length === 0 || !this.selected) return;
    const model = this.engine.PublishedModels.find((m) => UUIDsEqual(m.ID, this.selected!.modelId));
    const target = this.targetEntityForModel(model);
    const entityId = target?.id;
    if (!entityId) return;
    this.creatingList = true;
    this.listResult = null;
    this.cdrLocal.detectChanges();
    try {
      const p = this.ProviderToUse;
      const user = p.CurrentUser ?? undefined;
      const list = await p.GetEntityObject<MJListEntity>('MJ: Lists', user);
      // Minute-resolution timestamp so two sends on the same day don't produce identical-named lists.
      list.Name = `At-Risk: ${this.selected.title} (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`;
      list.EntityID = entityId;
      if (user?.ID) list.UserID = user.ID;
      list.RefreshMode = 'Additive';
      list.UseSnapshot = false;
      if (!(await list.Save())) {
        this.listResult = `Couldn't create the list: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`;
        return;
      }
      const members = this.atRiskRows.filter((r) => r.band !== 'low').slice(0, 200);
      let seq = 0;
      let added = 0;
      let firstFailure: string | null = null;
      for (const r of members) {
        const ld = await p.GetEntityObject<MJListDetailEntity>('MJ: List Details', user);
        ld.ListID = list.ID;
        ld.RecordID = r.recordId;
        ld.Sequence = seq++;
        ld.Status = 'Active';
        if (await ld.Save()) {
          added++;
        } else if (!firstFailure) {
          firstFailure = ld.LatestResult?.CompleteMessage ?? 'unknown error';
        }
      }
      const failed = members.length - added;
      this.listResult =
        failed === 0
          ? `Added ${added} at-risk member${added === 1 ? '' : 's'} to “${list.Name}”.`
          : `Added ${added} of ${members.length} members to “${list.Name}” — ${failed} failed to add (first error: ${firstFailure}).`;
      if (failed > 0) LogError(`PSPredictionsResource.sendToList: ${failed}/${members.length} adds failed. First: ${firstFailure}`);
    } catch (err) {
      this.listResult = `Couldn't create the list: ${err instanceof Error ? err.message : String(err)}`;
      LogError(`PSPredictionsResource.sendToList: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.creatingList = false;
      this.cdrLocal.detectChanges();
    }
  }

  /**
   * Quote one CSV cell: RFC-4180 double-quote escaping (handles commas/quotes/newlines in labels) plus a
   * leading `'` on formula-starting characters (`=`, `+`, `-`, `@`) so a hostile label can't execute as an
   * Excel/Sheets formula on open.
   */
  private csvCell(value: string): string {
    const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
  }

  /** "Share / export" — download the at-risk list as a CSV (dependency-free). */
  public exportList(): void {
    if (this.atRiskRows.length === 0) return;
    const csv = [
      'Member,Likelihood %,Predicted',
      ...this.atRiskRows.map((r) => `${this.csvCell(r.label ?? r.recordId)},${r.riskPct},${this.csvCell(r.class ?? '')}`),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(this.selected?.title ?? 'prediction').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-at-risk.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** "+ New prediction" — open the co-pilot to a clean chat (Sonar-style); the user describes their goal and the agent drives the build. */
  public newPrediction(): void {
    this.pendingPrompt = null;
    this.chatOpen = true;
    void this.ensureModelDevAgentResolved();
    this.publishAgentContext();
    this.cdrLocal.detectChanges();
  }

  /**
   * "Improve this" on a blocked (not-trustworthy-enough) prediction — turns the trust dead-end into a next
   * step by opening the co-pilot seeded with the model's name + why it's held, so the agent proposes concrete
   * ways to make it reliable and can rebuild it.
   */
  public improvePrediction(c: BusinessPredictionCard): void {
    this.pendingPrompt = buildImprovePrompt({
      name: c.title,
      trustGrade: c.trust.grade,
      reason: c.blockedReason ?? c.trust.gateReason ?? null,
    });
    this.chatOpen = true;
    void this.ensureModelDevAgentResolved();
    this.publishAgentContext();
    this.cdrLocal.detectChanges();
  }

  /** Open the "+ New prediction" co-pilot (clean chat) — used by the read-only `OpenNewPredictionCopilot` agent tool. */
  public openNewPredictionCopilot(): void {
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
