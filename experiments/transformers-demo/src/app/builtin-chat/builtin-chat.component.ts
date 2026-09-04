import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  DestroyRef,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ChatMessage } from '../ai/chat.service';
import {
  type ActivityEvent,
  BuiltInAIService,
  type BuiltInAvailability,
  type ContextUsage,
  type EnvironmentInfo,
  type GenerationStats,
  type RouteProbeResult,
} from '../ai/builtin-ai.service';
import { ROUTER_SAMPLE_REQUESTS, type RouterSampleRequest } from '../ai/builtin-ai-router';

interface ProbeSummary {
  Count: number;
  ValidJson: number;
  MedianMs: number;
  Scored: number;
  IntentMatches: number;
  AgentMatches: number;
}

/**
 * Chat UI over Chrome's built-in Prompt API (Gemma 4 via the EAP flag, Gemini Nano otherwise).
 * Deliberately mirrors `ChatComponent` (Transformers.js) so the two paths can be compared, plus a
 * "router probe" panel that exercises JSON-Schema-constrained classification — the
 * client-side pre-processor / request-router idea.
 */
@Component({
    selector: 'app-builtin-chat',
    imports: [DecimalPipe, FormsModule, RouterLink],
    template: `
    <div class="layout">
      <div class="main">
    @if (!IsSupported) {
      <div class="init-prompt">
        <h2>Chrome built-in AI is not available here</h2>
        <p>
          This browser does not expose <code>LanguageModel</code> (the Prompt API) to web pages.
        </p>
        <ol class="setup">
          <li>Use <strong>Chrome Canary 153+</strong> (Early Preview Program, Gemma 4 dev trial).</li>
          <li>Enable <code>chrome://flags/#gemma4-for-built-in-ai</code> and relaunch.</li>
          <li>Reload this page and click <em>Connect</em> — the first connect downloads the model (~2.4 GB).</li>
        </ol>
        <a routerLink="/home" class="back-link">← Home</a>
      </div>
    } @else if (IsLoading) {
      <div class="loading-overlay">
        <div class="loading-content">
          <div class="spinner"></div>
          <p>Preparing Chrome's on-device model... {{ LoadProgress | number:'1.0-0' }}%</p>
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="LoadProgress"></div>
          </div>
          <p class="loading-hint">
            Chrome downloads the model once per profile (~2.4 GB for Gemma 4 2B).<br>
            Later sessions attach in well under a second.
          </p>
        </div>
      </div>
    } @else if (IsReady) {
      <div class="chat-container">
        <div class="chat-header">
          <h2>Chrome Built-in AI</h2>
          <span class="model-badge">Prompt API · Gemma 4 (2B) via EAP flag · on-device</span>
          @if (Stats) {
            <span class="model-badge stats" title="Measured in the app, including per-chunk UI work — typically 15–30% below the raw API benchmark">
              {{ Stats.TokensPerSecond }} tok/s · first token {{ Stats.TimeToFirstTokenMs }} ms ·
              {{ Stats.OutputTokens }} tokens in {{ Stats.TotalMs }} ms
            </span>
          }
          @if (Context) {
            <span class="model-badge">context {{ Context.Used }} / {{ Context.Window }}</span>
          }
          @if (NetCount !== null) {
            <span class="model-badge" [class.net-ok]="NetCount === 0" [class.net-bad]="NetCount > 0 && !Hybrid" [class.net-info]="NetCount > 0 && Hybrid"
                  title="Counted with the Resource Timing API while the model was working">
              {{ NetCount }} network requests during last reply
            </span>
          }
          <span class="model-badge" [class.offline]="!Online">{{ Online ? 'online' : 'offline — still working' }}</span>
          <span class="spacer"></span>
          <label class="toggle" title="Route locally; when research is needed, fetch on the web and answer locally over the result">
            <input type="checkbox" [ngModel]="Hybrid" (ngModelChange)="ai.SetHybrid($event)" [disabled]="IsGenerating || ProbeRunning"> Hybrid research
          </label>
          <button class="ghost-btn" (click)="ShowProbe = !ShowProbe">
            {{ ShowProbe ? 'Hide router probe' : 'Router probe' }}
          </button>
          @if (!ShowActivity) {
            <button class="ghost-btn" (click)="ShowActivity = true">Show activity</button>
          }
          <button class="ghost-btn" (click)="Clear()" [disabled]="IsGenerating">New chat</button>
        </div>

        @if (ShowProbe) {
          <div class="probe">
            <div class="probe-intro">
              <strong>Router probe.</strong> Each line is classified on one long-lived router session primed with a
              Betty routing system prompt (recycled near the context limit; a fresh <code>create()</code> per request
              measured ~2× slower and <code>clone()</code> ~3× slower in Canary 155), with the response constrained to a
              JSON schema (<code>Intent</code>, <code>TargetAgent</code>, <code>Confidence</code>). Lines that match a
              built-in sample are scored against a hand label.
            </div>
            <textarea [(ngModel)]="ProbeInput" rows="5" [disabled]="ProbeRunning"
                      placeholder="One request per line"></textarea>
            <div class="probe-actions">
              <button class="send-btn" (click)="RunProbe()" [disabled]="ProbeRunning || IsGenerating || !ProbeInput.trim()">
                {{ ProbeRunning ? 'Classifying…' : 'Classify all' }}
              </button>
              <button class="ghost-btn" (click)="ResetProbeInput()" [disabled]="ProbeRunning">Reset samples</button>
              @if (ProbeSummary) {
                <span class="probe-summary">
                  {{ ProbeSummary.Count }} requests · {{ ProbeSummary.ValidJson }} valid JSON ·
                  median {{ ProbeSummary.MedianMs }} ms
                  @if (ProbeSummary.Scored > 0) {
                    · intent {{ ProbeSummary.IntentMatches }}/{{ ProbeSummary.Scored }} ·
                    agent {{ ProbeSummary.AgentMatches }}/{{ ProbeSummary.Scored }}
                  }
                </span>
              }
            </div>
            @if (ProbeResults.length) {
              <div class="probe-table-wrap">
                <table class="probe-table">
                  <thead>
                    <tr><th>Request</th><th>Intent</th><th>Agent</th><th>Conf.</th><th>ms</th></tr>
                  </thead>
                  <tbody>
                    @for (r of ProbeResults; track $index) {
                      <tr>
                        <td class="req">{{ r.Message }}</td>
                        @if (r.Decision) {
                          <td [class.ok]="IntentOk(r) === true" [class.bad]="IntentOk(r) === false">
                            {{ r.Decision.Intent }}
                            @if (IntentOk(r) === false) { <span class="exp">exp. {{ ExpectedFor(r.Message)?.ExpectedIntent }}</span> }
                          </td>
                          <td [class.ok]="AgentOk(r) === true" [class.bad]="AgentOk(r) === false">
                            {{ r.Decision.TargetAgent }}
                            @if (AgentOk(r) === false) { <span class="exp">exp. {{ ExpectedFor(r.Message)?.ExpectedAgent }}</span> }
                          </td>
                          <td>{{ r.Decision.Confidence | number:'1.2-2' }}</td>
                        } @else {
                          <td colspan="3" class="bad">{{ r.Error || r.Raw }}</td>
                        }
                        <td>{{ r.LatencyMs }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        }

        <div class="messages" #messagesContainer>
          @for (msg of DisplayMessages; track $index) {
            <div class="message" [class.user]="msg.Role === 'user'" [class.assistant]="msg.Role === 'assistant'">
              <div class="message-role">{{ msg.Role === 'user' ? 'You' : 'AI' }}</div>
              <div class="message-content">{{ msg.Content }}</div>
            </div>
          }
          @if (IsGenerating) {
            <div class="message assistant">
              <div class="message-role">AI</div>
              <div class="message-content">{{ StreamingText }}<span class="cursor">&#x2588;</span></div>
            </div>
          }
        </div>

        @if (ErrorMessage) { <p class="error inline">{{ ErrorMessage }}</p> }
        @if (Hybrid) {
          <p class="hybrid-hint">
            <strong>Hybrid:</strong> Gemma 4 routes each message locally. For <code>needs_research</code> and
            <code>answer_from_knowledge</code> it then decides whether a lookup helps and which tool (Wikipedia, GitHub releases,
            or none); the page fetches, and Gemma 4 answers over the result. Smalltalk and off-topic stay local.
            Try: <em>What's the latest MemberJunction release and what changed?</em> · <em>Who founded the American Nurses Association?</em> · <em>What is 15% of 240?</em>
          </p>
        }

        <div class="input-area">
          <textarea
            [(ngModel)]="UserInput"
            (keydown.enter)="OnEnter($event)"
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            [disabled]="IsGenerating"
            rows="2"
          ></textarea>
          @if (!IsGenerating) {
            <button (click)="Send()" [disabled]="!UserInput.trim() || ProbeRunning" class="send-btn">Send</button>
          } @else {
            <button (click)="ai.Abort()" class="abort-btn">Stop</button>
          }
        </div>
      </div>
    } @else {
      <div class="init-prompt">
        <h2>Chrome Built-in AI Chat</h2>
        <p>
          Uses the Prompt API (<code>LanguageModel</code>) — the model ships with Chrome and runs in
          Chrome's on-device model service. Nothing is bundled by this app and no data leaves the device.
        </p>
        <p class="availability">
          Availability: <span class="pill" [attr.data-state]="Availability">{{ Availability }}</span>
        </p>
        @if (Availability === 'downloadable') {
          <p class="loading-hint">Connecting will download the model (~2.4 GB) — Chrome requires a click for that.</p>
        }
        @if (Availability === 'unavailable') {
          <p class="loading-hint">
            Chrome reports the model unavailable: check <code>chrome://flags/#gemma4-for-built-in-ai</code>,
            hardware requirements (GPU with &gt;4 GB VRAM or 16 GB RAM, 22 GB free disk), and that you are on Canary 153+.
          </p>
        }
        <button (click)="Connect()" class="load-btn" [disabled]="Availability === 'unavailable'">Connect</button>
        @if (ErrorMessage) { <p class="error">{{ ErrorMessage }}</p> }
        <p class="loading-hint">
          The activity panel on the right shows each Prompt API call and its timing.
          @if (!ShowActivity) { <button type="button" class="ghost-btn small" (click)="ShowActivity = true">Show it</button> }
        </p>
        <a routerLink="/home" class="back-link">← Home</a>
      </div>
    }
      </div>

      @if (ShowActivity) {
        <aside class="activity">
          <div class="activity-header">
            <strong>Activity</strong>
            <span class="hint">every Prompt API call, as it happens</span>
            <span class="spacer"></span>
            <button class="ghost-btn small" (click)="ai.ClearActivity()" [disabled]="!Events.length">Clear</button>
            <button class="ghost-btn small" (click)="ShowActivity = false">Hide</button>
          </div>
          <div class="env">
            <span><b>Browser</b>{{ Env?.Browser || '…' }}</span>
            <span><b>GPU</b>{{ Env?.Gpu || '…' }}</span>
            <span><b>Runs in</b>Chrome's on-device model service, a separate process — the page only sends text and receives tokens</span>
            <span><b>Model</b>not exposed by the API; verify at chrome://on-device-internals (Model Status → Models)</span>
            <span><b>Network</b><span class="pill-inline" [class.offline]="!Online">{{ Online ? 'online' : 'OFFLINE' }}</span> · secure context {{ Env?.SecureContext ? 'yes' : 'no' }} · try it with Wi-Fi off</span>
          </div>
          <div class="activity-list" #activityList>
            @for (e of Events; track e.Id) {
              <div class="ev" [attr.data-kind]="e.Kind" [class.live]="e.Live">
                <div class="ev-top">
                  <span class="ev-t">{{ FormatT(e.At) }}</span>
                  <span class="ev-kind">{{ e.Kind }}</span>
                  @if (e.DurationMs != null) { <span class="ev-dur">{{ e.DurationMs }} ms</span> }
                </div>
                <div class="ev-label">{{ e.Label }}</div>
                @if (e.Call) { <div class="ev-call">{{ e.Call }}</div> }
                @if (e.Detail) {
                  <div class="ev-detail" [class.open]="Expanded.has(e.Id)" (click)="ToggleExpand(e.Id)"
                       title="Click to expand / collapse">{{ e.Detail }}</div>
                }
              </div>
            }
            @if (!Events.length) { <div class="ev-empty">Nothing yet — connect or send a message.</div> }
          </div>
        </aside>
      }
    </div>
  `,
    styles: [`
    :host { display: flex; flex-direction: column; height: 100vh; font-family: system-ui, sans-serif; }
    .layout { display: flex; height: 100vh; }
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
    .main > .init-prompt { overflow-y: auto; }
    code { background: #f0f0f0; padding: 1px 5px; border-radius: 4px; font-size: 90%; }

    .loading-overlay { display: flex; align-items: center; justify-content: center; height: 100%; background: #f8f9fa; }
    .loading-content { text-align: center; max-width: 420px; }
    .spinner { width: 40px; height: 40px; border: 3px solid #e0e0e0; border-top-color: #3b82f6; border-radius: 50%;
               animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .progress-bar { height: 6px; background: #e0e0e0; border-radius: 3px; overflow: hidden; margin: 12px 0; }
    .progress-fill { height: 100%; background: #3b82f6; transition: width 0.3s; }
    .loading-hint { font-size: 13px; color: #888; margin-top: 12px; }

    .chat-container { display: flex; flex-direction: column; height: 100%; }
    .chat-header { padding: 12px 20px; border-bottom: 1px solid #e0e0e0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .chat-header h2 { margin: 0; font-size: 18px; }
    .model-badge { font-size: 12px; color: #666; background: #f0f0f0; padding: 2px 8px; border-radius: 10px; }
    .model-badge.stats { background: #e8f1ff; color: #1d4ed8; }
    .model-badge.net-ok { background: #dcfce7; color: #15803d; }
    .model-badge.net-bad { background: #fee2e2; color: #b91c1c; }
    .model-badge.net-info { background: #e0f2fe; color: #0369a1; }
    .toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #333; cursor: pointer; padding: 4px 8px; border: 1px solid #d0d0d0; border-radius: 8px; }
    .toggle input { margin: 0; }
    .hybrid-hint { margin: 0 20px 8px; font-size: 12.5px; color: #555; line-height: 1.5; }
    .hybrid-hint em { color: #0369a1; font-style: normal; }
    .model-badge.offline, .pill-inline.offline { background: #fef3c7; color: #b45309; font-weight: 600; }
    .pill-inline { padding: 0 6px; border-radius: 8px; background: #e5e7eb; }
    .env { display: flex; flex-direction: column; gap: 3px; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; font-size: 11.5px; color: #555; line-height: 1.4; background: #f4f5f7; }
    .env b { color: #888; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; margin-right: 6px; }
    .spacer { flex: 1; }
    .ghost-btn { background: transparent; border: 1px solid #d0d0d0; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
    .ghost-btn:disabled { opacity: 0.5; cursor: default; }
    .ghost-btn.small { padding: 3px 8px; font-size: 12px; }

    .activity { width: 400px; flex: none; border-left: 1px solid #e0e0e0; background: #fbfbfc; display: flex; flex-direction: column; font-size: 12.5px; }
    .activity-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #e0e0e0; }
    .activity-header .hint { color: #888; font-size: 12px; }
    .activity-list { flex: 1; overflow-y: auto; padding: 6px 12px 12px; }
    .ev { padding: 7px 0 7px 10px; border-bottom: 1px dashed #e6e6e6; border-left: 3px solid #d0d0d0; margin: 0 0 2px; }
    .ev[data-kind="availability"] { border-left-color: #9ca3af; }
    .ev[data-kind="create"], .ev[data-kind="download"] { border-left-color: #3b82f6; }
    .ev[data-kind="prompt"] { border-left-color: #8b5cf6; }
    .ev[data-kind="stream"] { border-left-color: #14b8a6; }
    .ev[data-kind="complete"] { border-left-color: #22c55e; }
    .ev[data-kind="abort"] { border-left-color: #f59e0b; }
    .ev[data-kind="error"] { border-left-color: #ef4444; }
    .ev[data-kind="router"], .ev[data-kind="route"] { border-left-color: #d97706; }
    .ev[data-kind="network"] { border-left-color: #10b981; }
    .ev[data-kind="plan"] { border-left-color: #a855f7; }
    .ev[data-kind="fetch"] { border-left-color: #0ea5e9; }
    .ev-top { display: flex; gap: 8px; align-items: baseline; color: #888; font-family: ui-monospace, Menlo, monospace; font-size: 11px; }
    .ev-kind { text-transform: uppercase; letter-spacing: 0.04em; }
    .ev-dur { margin-left: auto; color: #1d4ed8; font-weight: 600; }
    .ev-label { color: #222; margin-top: 2px; line-height: 1.4; }
    .ev.live .ev-label::after { content: ' ●'; color: #3b82f6; animation: blink 1s step-end infinite; }
    .ev-call { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: #444; background: #eef0f3; padding: 2px 6px; border-radius: 4px; margin-top: 4px; white-space: pre-wrap; word-break: break-all; }
    .ev-detail { margin-top: 4px; color: #666; white-space: pre-wrap; word-break: break-word; max-height: 3.9em; overflow: hidden; cursor: pointer; line-height: 1.3; }
    .ev-detail.open { max-height: none; }
    .ev-empty { color: #999; padding: 16px 4px; }
    @media (max-width: 900px) { .layout { flex-direction: column; } .activity { width: auto; border-left: none; border-top: 1px solid #e0e0e0; max-height: 40vh; } }

    .probe { border-bottom: 1px solid #e0e0e0; background: #fafafa; padding: 12px 20px; display: flex; flex-direction: column; gap: 8px; }
    .probe-intro { font-size: 13px; color: #555; line-height: 1.5; }
    .probe textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #d0d0d0; border-radius: 8px;
                      font-family: inherit; font-size: 13px; resize: vertical; }
    .probe-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .probe-summary { font-size: 13px; color: #1d4ed8; }
    .probe-table-wrap { max-height: 260px; overflow: auto; border: 1px solid #e0e0e0; border-radius: 8px; background: white; }
    .probe-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .probe-table th, .probe-table td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
    .probe-table th { position: sticky; top: 0; background: #f5f5f5; font-weight: 600; }
    .probe-table td.req { max-width: 380px; }
    .probe-table td.ok { color: #15803d; }
    .probe-table td.bad { color: #b91c1c; }
    .exp { display: block; font-size: 11px; color: #888; }

    .messages { flex: 1; overflow-y: auto; padding: 20px; }
    .message { margin-bottom: 16px; max-width: 80%; }
    .message.user { margin-left: auto; }
    .message.assistant { margin-right: auto; }
    .message-role { font-size: 12px; font-weight: 600; color: #888; margin-bottom: 4px; }
    .message.user .message-role { text-align: right; }
    .message-content { padding: 10px 14px; border-radius: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .message.user .message-content { background: #3b82f6; color: white; }
    .message.assistant .message-content { background: #f0f0f0; color: #333; }
    .cursor { animation: blink 0.7s step-end infinite; }
    @keyframes blink { 50% { opacity: 0; } }

    .input-area { display: flex; gap: 8px; padding: 16px 20px; border-top: 1px solid #e0e0e0; background: #fafafa; }
    .input-area textarea { flex: 1; padding: 10px 14px; border: 1px solid #d0d0d0; border-radius: 8px; resize: none;
                           font-family: inherit; font-size: 14px; outline: none; }
    .input-area textarea:focus { border-color: #3b82f6; }
    .send-btn, .abort-btn, .load-btn { padding: 10px 20px; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; font-weight: 500; }
    .send-btn { background: #3b82f6; color: white; }
    .send-btn:disabled, .load-btn:disabled { opacity: 0.5; cursor: default; }
    .abort-btn { background: #ef4444; color: white; }
    .load-btn { background: #3b82f6; color: white; padding: 12px 32px; font-size: 16px; }

    .init-prompt { text-align: center; padding: 80px 20px; max-width: 640px; margin: 0 auto; }
    .init-prompt h2 { font-size: 24px; margin-bottom: 8px; }
    .init-prompt p { color: #666; margin-bottom: 20px; line-height: 1.5; }
    .setup { text-align: left; color: #555; line-height: 1.7; margin: 0 auto 24px; max-width: 520px; }
    .availability { font-size: 14px; }
    .pill { padding: 2px 10px; border-radius: 10px; background: #eee; font-weight: 600; }
    .pill[data-state="available"] { background: #dcfce7; color: #15803d; }
    .pill[data-state="downloadable"], .pill[data-state="downloading"] { background: #fef3c7; color: #b45309; }
    .pill[data-state="unavailable"], .pill[data-state="unsupported"] { background: #fee2e2; color: #b91c1c; }
    .back-link { display: inline-block; margin-top: 24px; color: #3b82f6; text-decoration: none; }
    .error { color: #ef4444; margin-top: 16px; }
    .error.inline { margin: 0 20px 8px; font-size: 13px; }
  `]
})
export class BuiltInChatComponent implements OnInit {
  @ViewChild('messagesContainer') MessagesContainer!: ElementRef;

  protected readonly ai = inject(BuiltInAIService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  IsSupported = BuiltInAIService.IsSupported();
  Availability: BuiltInAvailability = 'unsupported';
  IsLoading = false;
  IsReady = false;
  IsGenerating = false;
  LoadProgress = 0;
  UserInput = '';
  StreamingText = '';
  ErrorMessage = '';
  Stats: GenerationStats | null = null;
  Context: ContextUsage | null = null;
  DisplayMessages: ChatMessage[] = [];

  // Activity log + environment
  @ViewChild('activityList') ActivityList?: ElementRef;
  ShowActivity = true;
  Env: EnvironmentInfo | null = null;
  Online = true;
  Hybrid = false;
  NetCount: number | null = null;
  Events: ActivityEvent[] = [];
  Expanded = new Set<number>();
  private firstEventAt: number | null = null;

  // Router probe
  ShowProbe = false;
  ProbeInput = ROUTER_SAMPLE_REQUESTS.map((r) => r.Message).join('\n');
  ProbeResults: RouteProbeResult[] = [];
  ProbeRunning = false;
  ProbeSummary: ProbeSummary | null = null;

  ngOnInit(): void {
    this.ai.Availability$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => (this.Availability = v));
    this.ai.IsLoading$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => (this.IsLoading = v));
    this.ai.IsReady$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => (this.IsReady = v));
    this.ai.IsGenerating$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => (this.IsGenerating = v));
    this.ai.LoadProgress$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => (this.LoadProgress = v));
    this.ai.Stats$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => (this.Stats = v));
    this.ai.ContextUsage$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => (this.Context = v));
    this.ai.Error$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((err) => (this.ErrorMessage = err));
    this.ai.Online$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => (this.Online = v));
    this.ai.NetworkDuringLast$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => (this.NetCount = v));
    this.ai.Hybrid$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => (this.Hybrid = v));
    // The service is a root singleton: coming back to this route must show the conversation it still holds.
    this.DisplayMessages = this.ai.GetHistory().filter((m) => m.Role !== 'system');
    this.ai.GetEnvironment().then((env) => { this.Env = env; this.cdr.detectChanges(); });
    this.ai.Events$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((events) => {
      this.Events = events;
      if (!events.length) this.firstEventAt = null;
      else this.firstEventAt ??= events[0].At;
      Promise.resolve().then(() => {
        this.cdr.detectChanges();
        const el = this.ActivityList?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });

    this.ai.CurrentToken$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((token) => {
      this.StreamingText += token;
      this.ScrollToBottom();
    });

    this.ai.GenerationComplete$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      Promise.resolve().then(() => {
        this.StreamingText = '';
        this.DisplayMessages = this.ai.GetHistory().filter((m) => m.Role !== 'system');
        this.cdr.detectChanges();
        this.ScrollToBottom();
      });
    });

    if (this.IsSupported) {
      this.ai.CheckAvailability();
    }
  }

  Connect(): void {
    this.ErrorMessage = '';
    this.ai.Initialize();
  }

  Send(): void {
    const text = this.UserInput.trim();
    if (!text || this.ProbeRunning || this.IsGenerating) return;
    this.UserInput = '';
    this.StreamingText = '';
    this.ErrorMessage = '';
    this.DisplayMessages = [
      ...this.ai.GetHistory().filter((m) => m.Role !== 'system'),
      { Role: 'user', Content: text },
    ];
    this.ai.SendMessage(text);
    this.ScrollToBottom();
  }

  OnEnter(event: Event): void {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey) {
      ke.preventDefault();
      this.Send();
    }
  }

  async Clear(): Promise<void> {
    this.DisplayMessages = [];
    this.StreamingText = '';
    await this.ai.ClearHistory();
  }

  ResetProbeInput(): void {
    this.ProbeInput = ROUTER_SAMPLE_REQUESTS.map((r) => r.Message).join('\n');
  }

  async RunProbe(): Promise<void> {
    const requests = this.ProbeInput.split('\n').map((l) => l.trim()).filter(Boolean);
    // The probe and a chat turn share the router session and the network counter: never run both at once.
    if (!requests.length || this.IsGenerating || this.ProbeRunning) return;
    this.ProbeRunning = true;
    this.ProbeResults = [];
    this.ProbeSummary = null;
    try {
      await this.ai.ClassifyRequests(requests, (r) => {
        this.ProbeResults = [...this.ProbeResults, r];
        this.cdr.detectChanges();
      });
    } finally {
      this.ProbeRunning = false;
      this.ProbeSummary = this.Summarize(this.ProbeResults);
      this.cdr.detectChanges();
    }
  }

  /** Time since the first logged event, e.g. "t+12.34s". */
  FormatT(at: number): string {
    return `t+${((at - (this.firstEventAt ?? at)) / 1000).toFixed(2)}s`;
  }

  ToggleExpand(id: number): void {
    if (this.Expanded.has(id)) this.Expanded.delete(id);
    else this.Expanded.add(id);
  }

  ExpectedFor(message: string): RouterSampleRequest | undefined {
    return ROUTER_SAMPLE_REQUESTS.find((s) => s.Message === message);
  }

  /** true/false when the request is a labelled sample, null when unscored. */
  IntentOk(r: RouteProbeResult): boolean | null {
    const exp = this.ExpectedFor(r.Message);
    return exp && r.Decision ? r.Decision.Intent === exp.ExpectedIntent : null;
  }

  AgentOk(r: RouteProbeResult): boolean | null {
    const exp = this.ExpectedFor(r.Message);
    return exp && r.Decision ? r.Decision.TargetAgent === exp.ExpectedAgent : null;
  }

  private Summarize(results: RouteProbeResult[]): ProbeSummary {
    const latencies = results.map((r) => r.LatencyMs).sort((a, b) => a - b);
    const scored = results.filter((r) => this.ExpectedFor(r.Message) && r.Decision);
    return {
      Count: results.length,
      ValidJson: results.filter((r) => r.Decision).length,
      MedianMs: latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0,
      Scored: scored.length,
      IntentMatches: scored.filter((r) => this.IntentOk(r)).length,
      AgentMatches: scored.filter((r) => this.AgentOk(r)).length,
    };
  }

  private ScrollToBottom(): void {
    Promise.resolve().then(() => {
      const el = this.MessagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
      this.cdr.detectChanges();
    });
  }
}
