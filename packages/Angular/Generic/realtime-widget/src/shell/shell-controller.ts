/**
 * The shell's brain: the pre-call half of the phase machine, and the bridge to the lazily loaded call.
 *
 * Framework-free and DOM-free (the element renders from it), so every rule here is a plain unit test. What it
 * owns, and why it is here rather than in the call chunk:
 *
 *  - `idle → consent → booting`: the consent gate is answered BEFORE any heavy code downloads, so a visitor who
 *    declines costs the page nothing, and the microphone is provably not started.
 *  - Loading the call chunk (`booting`), with a retryable `load-failed` error.
 *  - **Calls made before the call exists.** The call code loads on `start()`, so a page can legitimately call
 *    methods while it has not arrived. The rules are specified here and tested:
 *      `openChannel`        queued while a start is pending (consent, booting, connecting — or `auto-start` has
 *                           not fired yet) and run, in order, when the call goes live; it resolves to a failure
 *                           if the call never gets there; with no start pending it resolves to `no_session` at
 *                           once (it never starts a call by itself, and never waits on one that may never come).
 *      `sendContextNote`    queued (at most {@link MAX_QUEUED_NOTES}, oldest dropped) from ANY phase except a live
 *                           call, and delivered in order when the next call goes live; cleared when a call ends,
 *                           so one call's context is never replayed into the next.
 *      `requestSpokenResponse` is about NOW, so it is never queued: `false` unless the call is live.
 *      `registerChannel`    remembered and registered with every call this widget creates.
 *      `end`                abandons a pending start (nothing loads, nothing connects) and returns to `idle`.
 */
import type { JSONObject } from '@memberjunction/ai';
import { ResolveAuthMode } from '../lib/config';
import type { WidgetChannelClass, WidgetChannelResult } from '../lib/session/widget-controller';
import type { WidgetConfig, WidgetErrorCode, WidgetOutboundEvent, WidgetPhase } from '../lib/types';
import type { WidgetSessionHandle, WidgetSessionOptions } from './session-contract';

/** Context notes held while no call is live. A page that floods the queue loses the OLDEST. */
export const MAX_QUEUED_NOTES = 20;

/** Words for a failure to download the call code. */
export const LOAD_FAILED_MESSAGE = 'We could not load the voice assistant. Check your connection and try again.';

const NO_CALL_RESULT: WidgetChannelResult = { success: false, error: 'There is no live call to open a channel in.', errorCode: 'no_session' };
const CALL_ENDED_RESULT: WidgetChannelResult = { success: false, error: 'The call ended before the channel could be opened.', errorCode: 'no_session' };

/** What the shell controller needs from its surroundings. */
export interface ShellControllerPorts {
  /** The element's current configuration. */
  GetConfig(): WidgetConfig;
  /** Loads the call code and creates this element's session. Rejects when the code cannot be loaded. */
  CreateSession(options: WidgetSessionOptions): Promise<WidgetSessionHandle>;
  /** Dispatches an event on the element. */
  Emit(event: WidgetOutboundEvent): void;
  /** The page's CSP nonce, for the call chunk's styles. */
  GetNonce(): string | null;
}

interface PendingChannelOpen {
  channel: string;
  inputs: JSONObject;
  resolve: (result: WidgetChannelResult) => void;
}

/** The configuration the call itself runs on: the shell has already asked for consent and handled auto-start. */
export function SessionConfigFrom(config: WidgetConfig): WidgetConfig {
  return { ...config, requireConsent: false, autoStart: false };
}

export class ShellController {
  private phase: WidgetPhase = 'idle';
  private errorMessage = '';
  private session: WidgetSessionHandle | null = null;
  private sessionPromise: Promise<WidgetSessionHandle> | null = null;
  private generation = 0;
  private startInFlight: Promise<void> | null = null;
  private readyAnnounced = false;
  private disposed = false;
  /** `auto-start` is configured and its start has not happened yet (so a call made now is early, not too late). */
  private autoStartPending = false;
  private readonly registeredChannels: WidgetChannelClass[] = [];
  private readonly notes: string[] = [];
  private readonly channelOpens: PendingChannelOpen[] = [];
  private readonly phaseListeners = new Set<(phase: WidgetPhase) => void>();

  constructor(private readonly ports: ShellControllerPorts) {}

  // ── Observation ────────────────────────────────────────────────────────────

  public get Phase(): WidgetPhase {
    return this.phase;
  }

  /** The words for the `error` phase. */
  public get ErrorMessage(): string {
    return this.errorMessage;
  }

  /** The call, once its code has loaded and it has been created; `null` before. */
  public get Session(): WidgetSessionHandle | null {
    return this.session;
  }

  /** Listens for phase changes (the element re-renders on them). Returns the unsubscribe. */
  public OnPhase(listener: (phase: WidgetPhase) => void): () => void {
    this.phaseListeners.add(listener);
    return () => this.phaseListeners.delete(listener);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Announces the widget (once) and starts it when `auto-start` asked to. Dispatched on a microtask. */
  public Ready(): void {
    if (this.readyAnnounced || this.disposed) {
      return;
    }
    this.readyAnnounced = true;
    this.autoStartPending = this.ports.GetConfig().autoStart;
    queueMicrotask(() => {
      if (this.disposed) {
        return;
      }
      const config = this.ports.GetConfig();
      this.autoStartPending = config.autoStart;
      this.ports.Emit({ name: 'mj-ready', detail: { mode: ResolveAuthMode(config), autoStart: config.autoStart } });
      if (config.autoStart) {
        void this.Start();
      }
    });
  }

  /**
   * Starts the call: the consent gate first when the page asked for one (resolving once it is showing), else
   * straight to loading and connecting (resolving when the call is live or has failed). Ignored while a call is
   * starting or live.
   */
  public Start(): Promise<void> {
    if (this.disposed) {
      return Promise.resolve();
    }
    this.autoStartPending = false;
    if (this.startInFlight) {
      return this.startInFlight;
    }
    if (this.phase === 'consent' || this.phase === 'live') {
      return Promise.resolve();
    }
    if (this.ports.GetConfig().requireConsent) {
      this.setPhase('consent');
      return Promise.resolve();
    }
    return this.begin();
  }

  /** The visitor accepted the consent notice. */
  public AcceptConsent(): Promise<void> {
    if (this.phase !== 'consent') {
      return Promise.resolve();
    }
    return this.begin();
  }

  /** The visitor declined: nothing loads, nothing starts. */
  public DeclineConsent(): void {
    if (this.phase === 'consent') {
      this.settleAbandonedStart();
    }
  }

  /** Ends the call, or abandons a start that has not finished. Safe when nothing is happening. */
  public async End(): Promise<void> {
    this.generation++;
    const session = this.session;
    if (session) {
      await session.End();
    }
    if (this.phase === 'consent' || this.phase === 'booting' || this.phase === 'connecting') {
      this.settleAbandonedStart();
    }
  }

  /** The configuration changed. */
  public Configure(): void {
    this.session?.Configure(SessionConfigFrom(this.ports.GetConfig()));
  }

  /** The element was removed. Ends a call this widget started and releases the session. */
  public Dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.generation++;
    this.resolveChannelOpens(CALL_ENDED_RESULT);
    this.dropSessionSubscriptions();
    this.session?.Dispose();
    this.session = null;
    this.phaseListeners.clear();
  }

  // ── Host actions (see the class comment for the rules) ─────────────────────

  public OpenChannel(channel: string, inputs: JSONObject = {}): Promise<WidgetChannelResult> {
    if (this.session && this.phase === 'live') {
      return this.session.OpenChannel(channel, inputs);
    }
    const startPending = this.phase === 'consent' || this.phase === 'booting' || this.phase === 'connecting';
    if (startPending || (this.phase === 'idle' && this.autoStartPending)) {
      return new Promise((resolve) => this.channelOpens.push({ channel, inputs, resolve }));
    }
    return Promise.resolve(NO_CALL_RESULT);
  }

  public SendContextNote(text: string): void {
    if (this.session && this.phase === 'live') {
      this.session.SendContextNote(text);
      return;
    }
    this.notes.push(text);
    while (this.notes.length > MAX_QUEUED_NOTES) {
      this.notes.shift();
    }
  }

  public RequestSpokenResponse(text: string): boolean {
    return this.session !== null && this.phase === 'live' ? this.session.RequestSpokenResponse(text) : false;
  }

  public RegisterChannel(channelClass: WidgetChannelClass): void {
    this.registeredChannels.push(channelClass);
    this.session?.RegisterChannel(channelClass);
  }

  /** The tab is closing or being hidden. */
  public OnPageHide(persisted: boolean): void {
    this.session?.OnPageHide(persisted);
  }

  // ── Starting ───────────────────────────────────────────────────────────────

  private begin(): Promise<void> {
    const generation = ++this.generation;
    this.setPhase('booting');
    const run = this.run(generation).finally(() => {
      if (this.startInFlight === run) {
        this.startInFlight = null;
      }
    });
    this.startInFlight = run;
    return run;
  }

  private async run(generation: number): Promise<void> {
    let session: WidgetSessionHandle;
    try {
      session = await this.ensureSession();
    } catch (error) {
      if (generation === this.generation) {
        console.error('[mj-realtime-widget] The call code could not be loaded:', error);
        this.fail('load-failed', LOAD_FAILED_MESSAGE);
      }
      return;
    }
    if (generation !== this.generation || this.disposed) {
      return; // ended (or removed) while the code was loading: nothing starts
    }
    session.Configure(SessionConfigFrom(this.ports.GetConfig()));
    await session.Start();
  }

  private ensureSession(): Promise<WidgetSessionHandle> {
    if (this.sessionPromise === null) {
      const pending = this.ports
        .CreateSession({ Config: SessionConfigFrom(this.ports.GetConfig()), Nonce: this.ports.GetNonce() })
        .then((session) => this.adopt(session));
      this.sessionPromise = pending;
      pending.catch(() => {
        if (this.sessionPromise === pending) {
          this.sessionPromise = null; // a failed load is retried, never cached
        }
      });
    }
    return this.sessionPromise;
  }

  /** Takes ownership of a freshly created session: registers the page's channels and follows its streams. */
  private adopt(session: WidgetSessionHandle): WidgetSessionHandle {
    if (this.disposed) {
      session.Dispose();
      return session;
    }
    this.session = session;
    for (const channelClass of this.registeredChannels) {
      session.RegisterChannel(channelClass);
    }
    this.sessionSubs.push(
      session.Phase$.subscribe((phase) => this.onSessionPhase(phase)),
      session.Events$.subscribe((event) => {
        // The shell owns these two: it announced ready itself and it narrates every phase, including the ones
        // before the call existed.
        if (event.name !== 'mj-phase-changed' && event.name !== 'mj-ready') {
          this.ports.Emit(event);
        }
      })
    );
    return session;
  }

  private onSessionPhase(phase: WidgetPhase): void {
    if (phase === 'idle') {
      // The call went back to idle: only meaningful when it was still starting (an End before it was live).
      if (this.phase === 'booting' || this.phase === 'connecting') {
        this.settleAbandonedStart();
      }
      return;
    }
    if (phase === 'error') {
      this.errorMessage = this.session?.ErrorMessage ?? '';
    }
    this.setPhase(phase);
  }

  // ── Queues ─────────────────────────────────────────────────────────────────

  private setPhase(next: WidgetPhase): void {
    if (next === this.phase || this.disposed) {
      return;
    }
    const previous = this.phase;
    this.phase = next;
    this.ports.Emit({ name: 'mj-phase-changed', detail: { phase: next, previous } });
    for (const listener of [...this.phaseListeners]) {
      listener(next);
    }
    this.onPhaseEntered(next);
  }

  private onPhaseEntered(phase: WidgetPhase): void {
    if (phase === 'live') {
      this.flushQueues();
    } else if (phase === 'ended') {
      this.notes.length = 0; // one call's context is never replayed into the next
      this.resolveChannelOpens(CALL_ENDED_RESULT);
    } else if (phase === 'error') {
      this.resolveChannelOpens(CALL_ENDED_RESULT);
    }
  }

  private flushQueues(): void {
    const session = this.session;
    if (!session) {
      return;
    }
    for (const note of this.notes.splice(0)) {
      session.SendContextNote(note);
    }
    for (const pending of this.channelOpens.splice(0)) {
      void session.OpenChannel(pending.channel, pending.inputs).then(pending.resolve);
    }
  }

  private resolveChannelOpens(result: WidgetChannelResult): void {
    for (const pending of this.channelOpens.splice(0)) {
      pending.resolve(result);
    }
  }

  private settleAbandonedStart(): void {
    this.setPhase('idle');
    this.resolveChannelOpens(CALL_ENDED_RESULT);
  }

  private fail(code: WidgetErrorCode, message: string): void {
    if (this.phase === 'error') {
      return;
    }
    this.errorMessage = message;
    this.setPhase('error');
    this.ports.Emit({ name: 'mj-error', detail: { code, message, phase: 'error' } });
  }

  private readonly sessionSubs: Array<{ unsubscribe(): void }> = [];

  private dropSessionSubscriptions(): void {
    for (const sub of this.sessionSubs.splice(0)) {
      sub.unsubscribe();
    }
  }
}
