import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import type { ChatMessage } from './chat.service';
import {
  ROUTER_RESPONSE_SCHEMA,
  ROUTER_SYSTEM_PROMPT,
  type RouterDecision,
} from './builtin-ai-router';
import {
  BuildGroundedPrompt,
  PLANNER_SCHEMA,
  PLANNER_SYSTEM_PROMPT,
  RunResearchTool,
  type ResearchPlan,
} from './builtin-ai-hybrid';

/**
 * Availability as reported by `LanguageModel.availability()`, plus `unsupported` when the
 * Prompt API global is absent from this browser entirely.
 */
export type BuiltInAvailability = Availability | 'unsupported';

export interface GenerationStats {
  TimeToFirstTokenMs: number;
  TotalMs: number;
  OutputTokens: number;
  TokensPerSecond: number;
}

export interface ContextUsage {
  Used: number;
  Window: number;
}

export type ActivityKind =
  | 'availability' | 'create' | 'download' | 'prompt' | 'stream' | 'complete' | 'abort' | 'error' | 'router' | 'route' | 'network'
  | 'plan' | 'fetch';

/** Facts about where inference runs that the page can observe directly. */
export interface EnvironmentInfo {
  Browser: string;
  Gpu: string;
  SecureContext: boolean;
  PromptApi: boolean;
}

/** One line in the activity log: what the page asked the Prompt API to do, and what came back. */
export interface ActivityEvent {
  Id: number;
  /** performance.now() when the event was logged */
  At: number;
  Kind: ActivityKind;
  Label: string;
  /** The API call as issued, e.g. `session.prompt(text, { responseConstraint })` */
  Call?: string;
  /** Payload / response text, shown collapsed in the UI */
  Detail?: string;
  DurationMs?: number;
  /** Still in progress (updated in place) */
  Live?: boolean;
}

export interface RouteProbeResult {
  Message: string;
  Decision: RouterDecision | null;
  Raw: string;
  LatencyMs: number;
  Error?: string;
}

/**
 * Thin Angular wrapper around Chrome's built-in Prompt API (`LanguageModel`).
 *
 * Mirrors the observable surface of `ChatService` (the Transformers.js path) so the two can be
 * compared side by side, but there is no Web Worker here: the Prompt API is only exposed on
 * `Window` (verified: `'LanguageModel' in self` is false inside a Worker in Canary 155), and the
 * model itself runs out-of-process in Chrome's on-device model service, so the page's main thread
 * is never blocked by inference anyway.
 *
 * The conversation history is held by the `LanguageModel` session itself; `Messages` below is
 * only kept for display.
 */
@Injectable({ providedIn: 'root' })
export class BuiltInAIService implements OnDestroy {
  private session: LanguageModel | null = null;
  /** Long-lived helper sessions (router, planner) keyed by role; recycled near the context limit. */
  private helperSessions = new Map<string, LanguageModel>();
  /** In-flight create() per role so two concurrent callers never create two sessions. */
  private pendingHelperSessions = new Map<string, Promise<LanguageModel>>();
  /** Resource Timing entries delivered by a PerformanceObserver — independent of the global buffer and its clearing. */
  private netEntries: PerformanceResourceTiming[] = [];
  /** performance.now() when the last streamed reply finished producing text (before tokenizer + network accounting). */
  private lastStreamEndAt = 0;
  private abortController: AbortController | null = null;
  private _Hybrid = new BehaviorSubject<boolean>(false);

  private readonly SystemPrompt = 'You are a helpful assistant. Keep responses concise and clear.';

  // State
  private _Availability = new BehaviorSubject<BuiltInAvailability>('unsupported');
  private _IsLoading = new BehaviorSubject<boolean>(false);
  private _IsReady = new BehaviorSubject<boolean>(false);
  private _IsGenerating = new BehaviorSubject<boolean>(false);
  private _LoadProgress = new BehaviorSubject<number>(0);
  private _CurrentToken = new Subject<string>();
  private _GenerationComplete = new Subject<string>();
  private _Error = new Subject<string>();
  private _Stats = new BehaviorSubject<GenerationStats | null>(null);
  private _ContextUsage = new BehaviorSubject<ContextUsage | null>(null);
  private _Events = new BehaviorSubject<ActivityEvent[]>([]);
  private nextEventId = 1;
  private _Online = new BehaviorSubject<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  private _NetworkDuringLast = new BehaviorSubject<number | null>(null);
  private environment: Promise<EnvironmentInfo> | null = null;

  // Public observables
  Availability$: Observable<BuiltInAvailability> = this._Availability.asObservable();
  IsLoading$: Observable<boolean> = this._IsLoading.asObservable();
  IsReady$: Observable<boolean> = this._IsReady.asObservable();
  IsGenerating$: Observable<boolean> = this._IsGenerating.asObservable();
  LoadProgress$: Observable<number> = this._LoadProgress.asObservable();
  CurrentToken$: Observable<string> = this._CurrentToken.asObservable();
  GenerationComplete$: Observable<string> = this._GenerationComplete.asObservable();
  Error$: Observable<string> = this._Error.asObservable();
  Stats$: Observable<GenerationStats | null> = this._Stats.asObservable();
  ContextUsage$: Observable<ContextUsage | null> = this._ContextUsage.asObservable();
  /** Step-by-step log of every Prompt API interaction, newest last. */
  Events$: Observable<ActivityEvent[]> = this._Events.asObservable();
  /** Hybrid mode: route locally, fetch on the network when research is needed, answer locally over the result. */
  Hybrid$: Observable<boolean> = this._Hybrid.asObservable();
  /** navigator.onLine, kept live — inference keeps working when this is false. */
  Online$: Observable<boolean> = this._Online.asObservable();
  /** Number of network requests the page made during the last reply / probe batch (null until measured). */
  NetworkDuringLast$: Observable<number | null> = this._NetworkDuringLast.asObservable();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._Online.next(true));
      window.addEventListener('offline', () => this._Online.next(false));
      // Resource Timing is how the page shows what *it* requested while the model worked. Observe rather than read
      // the global buffer, so the count survives buffer clearing; cap our own copy.
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
          this.netEntries.push(...(list.getEntries() as PerformanceResourceTiming[]));
          if (this.netEntries.length > 4000) this.netEntries.splice(0, this.netEntries.length - 2000);
        });
        observer.observe({ type: 'resource', buffered: true });
      }
    }
  }

  /** Browser / GPU / context facts, computed once. */
  GetEnvironment(): Promise<EnvironmentInfo> {
    this.environment ??= (async () => {
      const uaData = (navigator as Navigator & { userAgentData?: { brands: { brand: string; version: string }[] } }).userAgentData;
      const brand = uaData?.brands.find((b) => !/Not.A.Brand|Chromium/i.test(b.brand)) ?? uaData?.brands[0];
      const browser = brand ? `${brand.brand} ${brand.version}` : navigator.userAgent.replace(/^.*?(Chrome\/[\d.]+).*$/, '$1');
      let gpu = 'WebGPU not available';
      try {
        const adapter = 'gpu' in navigator ? await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter() : null;
        const info = (adapter as unknown as { info?: { vendor?: string; architecture?: string; device?: string; description?: string } } | null)?.info;
        if (info) gpu = [info.description || info.device, info.vendor, info.architecture].filter(Boolean).join(' · ');
        else if (adapter) gpu = 'adapter present (no info exposed)';
      } catch { /* leave the default */ }
      return { Browser: browser, Gpu: gpu, SecureContext: isSecureContext, PromptApi: BuiltInAIService.IsSupported() };
    })();
    return this.environment;
  }

  private Messages: ChatMessage[] = [{ Role: 'system', Content: this.SystemPrompt }];

  /** True when this browser exposes the Prompt API at all. */
  static IsSupported(): boolean {
    return typeof globalThis !== 'undefined' && 'LanguageModel' in globalThis;
  }

  /** Ask Chrome whether the built-in model is available / downloadable / downloading. */
  async CheckAvailability(): Promise<BuiltInAvailability> {
    if (!BuiltInAIService.IsSupported()) {
      this._Availability.next('unsupported');
      return 'unsupported';
    }
    const ev = this.log('availability', 'Checking whether Chrome can serve the built-in model', {
      Call: 'LanguageModel.availability()', Live: true,
    });
    const t0 = performance.now();
    try {
      const availability = await LanguageModel.availability();
      this.update(ev, { Label: `Availability: ${availability}`, DurationMs: this.since(t0), Live: false });
      this._Availability.next(availability);
      return availability;
    } catch (e) {
      this.update(ev, { Kind: 'error', Label: `availability() failed: ${String(e)}`, DurationMs: this.since(t0), Live: false });
      this._Error.next(`availability() failed: ${String(e)}`);
      this._Availability.next('unavailable');
      return 'unavailable';
    }
  }

  /**
   * Create the session. When the model still has to be downloaded Chrome requires this to be
   * called from a user gesture (a click), so the UI exposes a button rather than auto-connecting.
   */
  async Initialize(): Promise<void> {
    if (this.session) return;
    if (!BuiltInAIService.IsSupported()) {
      this._Error.next('LanguageModel is not available in this browser.');
      return;
    }

    this._IsLoading.next(true);
    this._LoadProgress.next(0);
    const ev = this.log('create', 'Creating chat session (model loads into the GPU on first use)', {
      Call: 'LanguageModel.create({ initialPrompts: [{ role: "system", content }], monitor })',
      Detail: `system prompt: ${this.SystemPrompt}`, Live: true,
    });
    const t0 = performance.now();
    const download: { ev: ActivityEvent | null; sawPartial: boolean } = { ev: null, sawPartial: false };
    try {
      this.session = await LanguageModel.create({
        initialPrompts: [{ role: 'system', content: this.SystemPrompt }],
        monitor: (m) => {
          m.addEventListener('downloadprogress', (e: ProgressEvent) => {
            // Chrome reports loaded as a 0..1 fraction (total is 1); handle byte counts too.
            const pct = e.total && e.total !== 1 ? (e.loaded / e.total) * 100 : e.loaded * 100;
            this._LoadProgress.next(Math.min(100, pct));
            if (!download.ev) {
              download.ev = pct >= 100
                ? this.log('download', 'Model already in the Chrome profile — no download needed')
                : this.log('download', 'Downloading model into the Chrome profile', { Live: true });
            }
            if (pct > 0 && pct < 100) download.sawPartial = true;
            if (pct < 100 || download.ev.Live) {
              // Chrome emits 0% then 100% even when the model is already resident.
              const doneLabel = download.sawPartial ? 'Model downloaded' : 'Model already in the Chrome profile — no download needed';
              this.update(download.ev, { Label: pct >= 100 ? doneLabel : `Downloading model… ${pct.toFixed(1)}%`, Live: pct < 100, DurationMs: this.since(t0) });
            }
          });
        },
      });
      this.attachOverflowLog(this.session, 'chat');
      this.publishContextUsage();
      this.update(ev, {
        Label: 'Session ready',
        Detail: `contextWindow ${this.session.contextWindow} tokens · contextUsage ${this.session.contextUsage} (system prompt)`,
        DurationMs: this.since(t0), Live: false,
      });
      this._IsLoading.next(false);
      this._IsReady.next(true);
      this._Availability.next('available');
    } catch (e) {
      this.update(ev, { Kind: 'error', Label: `create() failed: ${String(e)}`, DurationMs: this.since(t0), Live: false });
      if (download.ev?.Live) this.update(download.ev, { Kind: 'error', Label: 'Download did not complete', Live: false });
      this._IsLoading.next(false);
      this._Error.next(`create() failed: ${String(e)}`);
    }
  }

  SetHybrid(enabled: boolean): void {
    this._Hybrid.next(enabled);
    this.log('plan', enabled
      ? 'Hybrid mode ON: each message is routed locally first; needs_research → plan a lookup → fetch → answer over the result'
      : 'Hybrid mode OFF: every message is answered locally with no lookups');
  }

  async SendMessage(userMessage: string): Promise<void> {
    if (!this.session || !this._IsReady.value || this._IsGenerating.value) return;

    this.Messages.push({ Role: 'user', Content: userMessage });
    this._IsGenerating.next(true);
    this.abortController = new AbortController();
    const netMark = performance.now();

    if (this._Hybrid.value) {
      try {
        await this.sendHybrid(userMessage, netMark);
      } catch (e) {
        this.log('error', `hybrid turn failed: ${String(e)}`);
        this._Error.next(`hybrid turn failed: ${String(e)}`);
        await this.finishTurn(netMark, null);
      }
    } else {
      this.log('prompt', `Prompt sent (${userMessage.length} chars) — the session keeps the conversation history itself`, {
        Call: 'session.promptStreaming(text, { signal })', Detail: userMessage,
      });
      await this.streamReply(userMessage, netMark);
    }
  }

  /**
   * The co-processor flow: (1) local router decides whether research is needed, (2) local planner picks a tool and
   * query, (3) the page fetches over the network, (4) the local model answers over the retrieved text. Steps 1-2 and 4
   * never leave the device; step 3 is the only network activity and shows up in the network counter.
   */
  private async sendHybrid(userMessage: string, netMark: number): Promise<void> {
    const tTurn = performance.now();
    const signal = this.abortController?.signal;
    const route = await this.classifyOne(userMessage, signal);
    if (signal?.aborted) return this.finishAborted(netMark);
    const intent = route.Decision?.Intent;
    // needs_research → lookup. answer_from_knowledge → let the planner decide (a 2B model's "knowledge" is thin, and
    // the planner answers `none` for math/translation). smalltalk, out_of_scope, needs_clarification → no lookup.
    if (intent !== 'needs_research' && intent !== 'answer_from_knowledge') {
      this.log('plan', `Router says ${intent ?? 'unknown'} → answering locally, no lookup`);
      this.log('prompt', `Prompt sent (${userMessage.length} chars)`, { Call: 'session.promptStreaming(text, { signal })', Detail: userMessage });
      await this.streamReply(userMessage, netMark);
      return;
    }

    // Plan the lookup locally.
    let plan: ResearchPlan | null = null;
    const planEv = this.log('plan', `Router says ${intent} → asking the local model whether a lookup helps, and which tool`, {
      Call: 'plannerSession.prompt(text, { responseConstraint: planSchema })', Live: true,
    });
    const tPlan = performance.now();
    try {
      const planner = await this.getHelperSession('planner', PLANNER_SYSTEM_PROMPT);
      const raw = await planner.prompt(userMessage, { responseConstraint: PLANNER_SCHEMA, signal });
      plan = this.parseJson<ResearchPlan>(raw);
      this.update(planEv, {
        Label: plan ? `Plan: ${plan.Tool}${plan.Query ? ` · "${plan.Query}"` : ''}` : 'Plan: unparseable response',
        Detail: raw, DurationMs: this.since(tPlan), Live: false,
      });
    } catch (e) {
      if (signal?.aborted) { this.update(planEv, { Kind: 'abort', Label: 'Stopped during planning', DurationMs: this.since(tPlan), Live: false }); return this.finishAborted(netMark); }
      this.update(planEv, { Kind: 'error', Label: `planner failed: ${String(e)}`, DurationMs: this.since(tPlan), Live: false });
      // A failed prompt may leave the session unusable (e.g. context overflow); start fresh next time.
      this.dropHelperSession('planner');
    }

    if (!plan || plan.Tool === 'none') {
      this.log('plan', 'No tool applies → answering locally');
      this.log('prompt', `Prompt sent (${userMessage.length} chars)`, { Call: 'session.promptStreaming(text, { signal })', Detail: userMessage });
      await this.streamReply(userMessage, netMark);
      return;
    }

    // Fetch over the network — the only step that leaves the device.
    const fetchEv = this.log('fetch', `Fetching from ${plan.Tool} over the network…`, {
      Call: plan.Tool === 'wikipedia'
        ? 'fetch(en.wikipedia.org/w/api.php?action=query&list=search…) then fetch(en.wikipedia.org/api/rest_v1/page/summary/…)'
        : 'fetch(api.github.com/repos/{owner}/{repo}/releases/latest)',
      Live: true,
    });
    const tFetch = performance.now();
    try {
      const ctx = await RunResearchTool(plan, this.abortController?.signal);
      if (!ctx) throw new Error('tool returned nothing');
      this.update(fetchEv, {
        Label: `Fetched ${ctx.Source}: ${ctx.Requests} request${ctx.Requests === 1 ? '' : 's'} · ${(ctx.Bytes / 1024).toFixed(1)} KB`,
        Detail: `${ctx.Url}\n\n${ctx.Text}`, DurationMs: ctx.Ms, Live: false,
      });
      const grounded = BuildGroundedPrompt(userMessage, ctx);
      this.log('prompt', `Prompt sent with retrieved context (${grounded.length} chars) — answered locally`, {
        Call: 'session.promptStreaming(groundedPrompt, { signal })', Detail: grounded,
      });
      const outcome = await this.streamReply(grounded, netMark, `\n\nSource: ${ctx.Url}`);
      if (outcome === 'complete') {
        // Total is taken at the moment the answer finished streaming — before the tokenizer pass and the
        // network-accounting wait, which are the demo's own overhead, not the model's.
        this.log('complete', `Hybrid turn: route ${route.LatencyMs} ms · plan ${Math.round(tFetch - tPlan)} ms · fetch ${ctx.Ms} ms · total ${Math.round(this.lastStreamEndAt - tTurn)} ms`);
      }
    } catch (e) {
      if (signal?.aborted) { this.update(fetchEv, { Kind: 'abort', Label: 'Stopped during the fetch', DurationMs: this.since(tFetch), Live: false }); return this.finishAborted(netMark); }
      this.update(fetchEv, { Kind: 'error', Label: `lookup failed: ${String(e)} → answering locally without it`, DurationMs: this.since(tFetch), Live: false });
      this.log('prompt', `Prompt sent (${userMessage.length} chars)`, { Call: 'session.promptStreaming(text, { signal })', Detail: userMessage });
      await this.streamReply(userMessage, netMark, '\n\n(Lookup failed — answered from the local model alone, unverified.)');
    }
  }

  /** Stop pressed before any answer text existed: close the turn without adding an assistant message. */
  private async finishAborted(netMark: number): Promise<void> {
    this.log('abort', 'Stopped before any answer was produced — nothing added to the conversation');
    await this.finishTurn(netMark, null);
  }

  /**
   * Close a turn in the right order: account for network first (so the count belongs to this turn and the next
   * Send cannot start inside the window), then release the UI and publish the final text.
   */
  private async finishTurn(netMark: number, completedText: string | null): Promise<void> {
    await this.reportNetwork(netMark, 'this reply');
    this._IsGenerating.next(false);
    this._GenerationComplete.next(completedText ?? '');
  }

  private dropHelperSession(role: string): void {
    this.helperSessions.get(role)?.destroy();
    this.helperSessions.delete(role);
    this.pendingHelperSessions.delete(role);
  }

  /** Chrome drops the oldest turns when a session overflows and fires this event; make it visible in the log. */
  private attachOverflowLog(session: LanguageModel, role: string): void {
    session.addEventListener('contextoverflow', () => {
      this.log('error', `${role} session context overflow — Chrome is dropping the oldest turns (contextUsage ${session.contextUsage} / ${session.contextWindow})`);
    });
  }

  /**
   * Stream one reply from the chat session; logs first token, progress, completion stats and the network count.
   * Returns how the turn ended so callers (the hybrid path) don't report a completed turn that failed.
   */
  private async streamReply(promptText: string, netMark: number, appendToReply = ''): Promise<'complete' | 'aborted' | 'failed'> {
    if (!this.session || !this.abortController) {
      await this.finishTurn(netMark, null);
      return 'failed';
    }
    const t0 = performance.now();
    let firstTokenAt: number | null = null;
    let text = '';
    let chunks = 0;
    let aborted = false;
    let streamEv: ActivityEvent | null = null;

    try {
      // ReadableStream async iteration: Chrome 124+; TypeScript 5.9's default DOM lib types it, so no extra lib entry or cast is needed.
      const stream = this.session.promptStreaming(promptText, { signal: this.abortController.signal });
      for await (const chunk of stream) {
        if (firstTokenAt === null) {
          firstTokenAt = performance.now();
          this.log('stream', 'First token received', { DurationMs: this.since(t0) });
          streamEv = this.log('stream', 'Streaming…', { Live: true });
        }
        text += chunk;
        chunks++;
        this._CurrentToken.next(chunk);
        if (streamEv && (chunks % 5 === 0)) {
          this.update(streamEv, { Label: `Streaming… ${chunks} chunks · ${text.length} chars`, DurationMs: this.since(t0) });
        }
      }
    } catch (e) {
      this.lastStreamEndAt = performance.now();
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        // Keep whatever streamed before the failure so the reader can see it, and say what happened.
        if (streamEv) this.update(streamEv, { Label: `Streaming stopped by an error after ${chunks} chunks · ${text.length} chars`, Live: false, DurationMs: this.since(t0) });
        this.log('error', `prompt failed: ${String(e)}`, { DurationMs: this.since(t0) });
        this._Error.next(`prompt failed: ${String(e)}`);
        if (text) this.Messages.push({ Role: 'assistant', Content: `${text}\n\n[reply interrupted: ${String(e)}]` });
        await this.finishTurn(netMark, text || null);
        return 'failed';
      }
      aborted = true; // keep whatever streamed so far
    }
    if (!aborted) this.lastStreamEndAt = performance.now();

    const totalMs = this.lastStreamEndAt - t0;
    const ttft = firstTokenAt === null ? totalMs : firstTokenAt - t0;
    if (streamEv) this.update(streamEv, { Label: `Streamed ${chunks} chunks · ${text.length} chars`, Live: false, DurationMs: Math.round(totalMs) });
    if (aborted && !text) { await this.finishAborted(netMark); return 'aborted'; }
    if (aborted) this.log('abort', `Aborted by user; kept ${text.length} chars`, { DurationMs: Math.round(totalMs) });
    // Output tokens measured with the model's own tokenizer.
    const tMeasure = performance.now();
    const outputTokens = await this.session.measureContextUsage(text).catch(() => Math.round(text.length / 4));
    const genSeconds = Math.max(0.001, (totalMs - ttft) / 1000);
    this.log('complete', `Reply complete: ${outputTokens} tokens · ${Math.round(outputTokens / genSeconds)} tok/s · first token ${Math.round(ttft)} ms`, {
      Call: 'session.measureContextUsage(replyText)  // token count via the model tokenizer',
      Detail: `${text}\n\n— contextUsage now ${this.session.contextUsage} / ${this.session.contextWindow} · measureContextUsage took ${this.since(tMeasure)} ms`,
      DurationMs: Math.round(totalMs),
    });

    this.Messages.push({ Role: 'assistant', Content: text + appendToReply });
    this._Stats.next({
      TimeToFirstTokenMs: Math.round(ttft),
      TotalMs: Math.round(totalMs),
      OutputTokens: outputTokens,
      TokensPerSecond: Math.round(outputTokens / genSeconds),
    });
    this.publishContextUsage();
    await this.finishTurn(netMark, text + appendToReply);
    return aborted ? 'aborted' : 'complete';
  }

  Abort(): void {
    this.log('abort', 'Stop requested', { Call: 'abortController.abort()' });
    this.abortController?.abort();
  }

  /** Sessions own their history, so "clear" means destroy + recreate (~0.4 s once the model is resident). */
  async ClearHistory(): Promise<void> {
    this.Messages = [this.Messages[0]];
    this.log('create', 'New chat: destroying the session (history lives in the session, so this is the only way to clear it)', { Call: 'session.destroy()' });
    this.session?.destroy();
    this.session = null;
    this._IsReady.next(false);
    this._Stats.next(null);
    await this.Initialize();
  }

  GetHistory(): ChatMessage[] {
    return [...this.Messages];
  }

  /**
   * Router probe: classify each request with a JSON-Schema-constrained response.
   *
   * All requests run on ONE long-lived router session primed with the router system prompt, recycled
   * before it nears the context window. Measured in Canary 155 / Gemma 4 2B (see
   * FINDINGS-CHROME-BUILTIN-AI.md): a dedicated long-lived session is a consistent ~300 ms per decision;
   * a fresh `create()` per request varies 0.25–0.9 s depending on what else is resident; `clone()` per
   * request is ~1 s. Prior decisions stay in the session's context (a mild few-shot effect), which is
   * acceptable for a router and is exactly what the recycling bounds.
   */
  async ClassifyRequests(
    messages: string[],
    onResult?: (result: RouteProbeResult) => void,
  ): Promise<RouteProbeResult[]> {
    if (!BuiltInAIService.IsSupported()) return [];
    const results: RouteProbeResult[] = [];
    const netMark = performance.now();
    for (const message of messages) {
      const result = await this.classifyOne(message);
      results.push(result);
      onResult?.(result);
    }
    await this.reportNetwork(netMark, `${messages.length} classification${messages.length === 1 ? '' : 's'}`);
    return results;
  }

  /** One JSON-Schema-constrained routing decision on the long-lived router session. */
  private async classifyOne(message: string, signal?: AbortSignal): Promise<RouteProbeResult> {
    const t0 = performance.now();
    let raw = '';
    let decision: RouterDecision | null = null;
    let error: string | undefined;
    let ev: ActivityEvent | null = null;
    try {
      const s = await this.getHelperSession('router', ROUTER_SYSTEM_PROMPT);
      ev = this.log('route', `Classifying: “${message}”`, {
        Call: 'routerSession.prompt(text, { responseConstraint: schema })',
        Detail: `schema: ${JSON.stringify(ROUTER_RESPONSE_SCHEMA)}`, Live: true,
      });
      raw = await s.prompt(message, { responseConstraint: ROUTER_RESPONSE_SCHEMA, signal });
      decision = this.parseJson<RouterDecision>(raw);
      if (!decision) error = 'Response did not parse as a single JSON object';
      this.update(ev, {
        Label: decision
          ? `→ ${decision.Intent} / ${decision.TargetAgent} (confidence ${decision.Confidence})`
          : `→ unparseable response`,
        Detail: `raw: ${raw}\ncontextUsage ${s.contextUsage} / ${s.contextWindow}`,
        DurationMs: this.since(t0), Live: false,
      });
    } catch (e) {
      error = String(e);
      if (signal?.aborted) {
        if (ev) this.update(ev, { Kind: 'abort', Label: 'Stopped during routing', DurationMs: this.since(t0), Live: false });
      } else {
        if (ev) this.update(ev, { Kind: 'error', Label: `route failed: ${error}`, DurationMs: this.since(t0), Live: false });
        else this.log('error', `route failed: ${error}`, { DurationMs: this.since(t0) });
        // A failed prompt may leave the session unusable; start fresh next time.
        this.dropHelperSession('router');
      }
    }
    return { Message: message, Decision: decision, Raw: raw, LatencyMs: Math.round(performance.now() - t0), Error: error };
  }

  /**
   * Lazily create a long-lived helper session for a role; recycle it once 80% of the context window is used
   * (~50 tokens per decision). One dedicated session is ~300 ms per decision; clone() per request measured ~1 s.
   * Concurrent callers share one in-flight create() so no session is ever orphaned.
   */
  private async getHelperSession(role: string, systemPrompt: string): Promise<LanguageModel> {
    const existing = this.helperSessions.get(role);
    if (existing && existing.contextUsage > existing.contextWindow * 0.8) {
      this.log('router', `Recycling ${role} session (contextUsage ${existing.contextUsage} > 80% of ${existing.contextWindow})`, { Call: `${role}Session.destroy()` });
      this.dropHelperSession(role);
    }
    const current = this.helperSessions.get(role);
    if (current) {
      this.log('router', `Reusing ${role} session (contextUsage ${current.contextUsage} / ${current.contextWindow})`);
      return current;
    }
    let pending = this.pendingHelperSessions.get(role);
    if (!pending) {
      pending = this.createHelperSession(role, systemPrompt);
      this.pendingHelperSessions.set(role, pending);
    }
    try {
      return await pending;
    } finally {
      this.pendingHelperSessions.delete(role);
    }
  }

  private async createHelperSession(role: string, systemPrompt: string): Promise<LanguageModel> {
    const ev = this.log('router', `Creating the long-lived ${role} session`, {
      Call: `LanguageModel.create({ initialPrompts: [{ role: "system", content: ${role.toUpperCase()}_SYSTEM_PROMPT }] })`,
      Detail: systemPrompt, Live: true,
    });
    const t0 = performance.now();
    try {
      const created = await LanguageModel.create({ initialPrompts: [{ role: 'system', content: systemPrompt }] });
      this.attachOverflowLog(created, role);
      this.helperSessions.set(role, created);
      this.update(ev, { Label: `${role[0].toUpperCase()}${role.slice(1)} session ready (system prompt = ${created.contextUsage} tokens)`, DurationMs: this.since(t0), Live: false });
      return created;
    } catch (e) {
      this.update(ev, { Kind: 'error', Label: `${role} session create() failed: ${String(e)}`, DurationMs: this.since(t0), Live: false });
      throw e;
    }
  }

  /**
   * `responseConstraint` guarantees the shape but was observed (once in ~60 calls) to emit a second JSON object
   * after the first, so fall back to the first `{…}` span. That is a first-brace-to-first-brace match, which is
   * enough only because both schemas here are flat objects without nested braces or braces in values.
   */
  private parseJson<T>(raw: string): T | null {
    try {
      return JSON.parse(raw) as T;
    } catch {
      const match = raw.match(/\{[\s\S]*?\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
  }

  ngOnDestroy(): void {
    this.session?.destroy();
    this.session = null;
    this.helperSessions.forEach((s) => s.destroy());
    this.helperSessions.clear();
    this.pendingHelperSessions.clear();
  }

  ClearActivity(): void {
    this._Events.next([]);
  }

  /**
   * Count the network requests THIS DOCUMENT made since `sinceMark`, via Resource Timing (fetch/XHR/scripts/images —
   * everything except WebSockets; entries land at response end, so a still-in-flight request is not yet counted).
   * Inference runs in Chrome's separate on-device model service, which is invisible to the page by construction:
   * a 0 here means the page made no requests, not that Chrome made none.
   */
  private async reportNetwork(sinceMark: number, what: string): Promise<void> {
    await new Promise((r) => setTimeout(r, 80)); // let late Resource Timing entries land
    const entries = this.netEntries.filter((e) => e.startTime >= sinceMark);
    this._NetworkDuringLast.next(entries.length);
    this.log('network', `Network requests made by this page during ${what}: ${entries.length}`, {
      Call: "performance.getEntriesByType('resource')  // Resource Timing API",
      Detail: entries.length
        ? entries.map((e) => `${e.initiatorType}  ${e.name}  (${Math.round(e.duration)} ms)`).join('\n')
        : `No fetch, XHR, script, image or other resource requests were made by this document while the model was working.${this._Online.value ? '' : ' The browser was offline.'} (Chrome's own model service is a separate process and is not visible from here.)`,
    });
  }

  private log(kind: ActivityKind, label: string, extra: Partial<Omit<ActivityEvent, 'Id' | 'At' | 'Kind' | 'Label'>> = {}): ActivityEvent {
    const ev: ActivityEvent = { Id: this.nextEventId++, At: performance.now(), Kind: kind, Label: label, ...extra };
    const list = this._Events.value;
    this._Events.next([...(list.length >= 500 ? list.slice(-400) : list), ev]);
    return ev;
  }

  /** Replace an event in place (same Id) so the UI row updates rather than appends. */
  private update(ev: ActivityEvent, patch: Partial<ActivityEvent>): void {
    Object.assign(ev, patch);
    this._Events.next(this._Events.value.map((e) => (e.Id === ev.Id ? { ...ev } : e)));
  }

  private since(t0: number): number {
    return Math.round(performance.now() - t0);
  }

  private publishContextUsage(): void {
    if (!this.session) return;
    this._ContextUsage.next({ Used: this.session.contextUsage, Window: this.session.contextWindow });
  }
}
