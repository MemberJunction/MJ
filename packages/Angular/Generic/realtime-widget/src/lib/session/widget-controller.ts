/**
 * The widget's orchestration, free of any UI framework: authenticate → mint → connect → live → end, the
 * phase machine that drives what the widget shows, and the translation of the runtime's streams into the
 * DOM events a page author listens to.
 *
 * It is the generic descendant of the Caliber widget's launch service. What came across: the connection-state
 * → phase mapping, the "this state is about MY launch, not the previous session's replayed one" latch, the
 * dropped-start postcondition, and cleanup of a launch whose mount went away mid-flight. What stayed behind:
 * the Caliber mint Proxy (replaced by the runtime's `IRealtimeSessionLauncher` seam), reconcile handles,
 * and the assessment-specific resume tree.
 *
 * It drives a real {@link RealtimeSessionRuntime} (the Angular `RealtimeSessionService` in production, a plain
 * runtime in tests) — it does not re-implement any of the call.
 */
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import type { JSONObject } from '@memberjunction/ai';
import { IsIdentityVerifiedEventPayload, type RealtimeChannelDescriptor } from '@memberjunction/ai-core-plus';
import {
  type BaseRealtimeChannelClient,
  type RealtimeConnectionState,
  type RealtimeContextActionResult,
  type RealtimeHostChannelDeclaration,
  type RealtimeSessionRuntime
} from '@memberjunction/realtime-runtime';
import { ResolveAuthMode } from '../config';
import type {
  WidgetAuthMode,
  WidgetConfig,
  WidgetEndReason,
  WidgetErrorCode,
  WidgetOutboundEvent,
  WidgetPhase
} from '../types';
import { SESSION_EXPIRED_MESSAGE, type WidgetAuthAdapter } from '../auth/widget-auth.adapter';
import { WidgetKeyError, type WidgetGuestSession } from '../auth/widget-key-client';
import type { WidgetPageClose } from '../lifecycle/widget-page-close';
import type { WidgetResumeStore } from '../resume/widget-resume-store';

/** A channel class the page registers (`registerChannel`): constructible with no arguments. */
export type WidgetChannelClass = new () => BaseRealtimeChannelClient;

/** The slice of the guest-session client the controller uses (the real one is `WidgetKeyClient`). */
export interface WidgetGuestSessionSource {
  Mint(): Promise<WidgetGuestSession>;
  Refresh(): Promise<WidgetGuestSession>;
}

export interface WidgetControllerDeps {
  runtime: RealtimeSessionRuntime;
  /** Builds the auth adapter for an api-url and (when the credential can be renewed) a renewer. */
  createAuth: (apiUrl: string | null, refresh: (() => Promise<string>) | null) => WidgetAuthAdapter;
  createGuestSessions: (apiUrl: string, widgetKey: string) => WidgetGuestSessionSource;
  createResumeStore: (scope: string) => WidgetResumeStore;
  pageClose: WidgetPageClose;
  now?: () => number;
}

/** The outcome of a host-initiated channel call. */
export interface WidgetChannelResult {
  success: boolean;
  /** What the channel returned, when it did. */
  result?: unknown;
  /** Why it failed, in words; and the stable code behind them. */
  error?: string;
  errorCode?: string;
}

/** Channel names a page may write, and the ClassFactory key each resolves to. Others are taken as keys. */
export const BUILT_IN_CHANNEL_KEYS: Readonly<Record<string, string>> = {
  IdentityVerification: 'IdentityVerificationChannel',
  Whiteboard: 'RealtimeWhiteboardChannel',
  Media: 'RealtimeMediaChannel',
  RemoteBrowser: 'RealtimeRemoteBrowserChannel',
  ClientContext: 'ClientContextChannel'
};

/** Phases a connection state may move the widget FROM into `connecting` (never regressing below live). */
const PRE_LIVE_PHASES: ReadonlySet<WidgetPhase> = new Set<WidgetPhase>(['booting', 'connecting']);

/** Phases a connection state must never move the widget OUT of: ended/failed stays ended/failed. */
const TERMINAL_PHASES: ReadonlySet<WidgetPhase> = new Set<WidgetPhase>(['ended', 'error']);

/** `setTimeout` takes a 32-bit delay; a deadline further out than this is re-armed in hops. */
const MAX_TIMER_MS = 2_147_000_000;

export const CONNECTION_LOST_MESSAGE = 'The connection was interrupted. Please try again.';

/**
 * MJ accepted the start and nothing came of it. `StartRealtimeSession` returns a bare `undefined` when its
 * `IsActive` guard is still set by a teardown that has not finished — no throw, no signal. The usual cause is
 * transient and trying again clears it, but the flag can stick for the life of the page, which only a reload
 * escapes — so the copy names both.
 */
export const START_DROPPED_MESSAGE = 'The call could not be started. Please try again, or reload the page if it keeps happening.';

/** Words for why a start failed, preferring what a visitor can act on over the raw error. */
export function DescribeStartError(error: Error | null): string {
  if (error === null) {
    return CONNECTION_LOST_MESSAGE;
  }
  if (error.name === 'NotAllowedError' || /permission|denied|not allowed/i.test(error.message)) {
    return 'Microphone access was blocked. Allow the microphone for this site in your browser, then try again.';
  }
  if (error.name === 'NotFoundError' || /requested device not found/i.test(error.message)) {
    return 'No microphone was found. Connect one and try again.';
  }
  return error.message.length > 0 ? error.message : CONNECTION_LOST_MESSAGE;
}

/** What a launch resolved before it could start the runtime session. */
interface PreparedSession {
  agentId: string;
  applicationId: string | null;
  deadline: Date | null;
  guestChannels: string[];
}

/** The one place a launch's failure carries its code. */
class LaunchFailure extends Error {
  constructor(
    message: string,
    public readonly code: WidgetErrorCode
  ) {
    super(message);
  }
}

export class WidgetController {
  private config: WidgetConfig;
  private readonly now: () => number;
  private readonly eventsSubject = new Subject<WidgetOutboundEvent>();
  private readonly phaseSubject = new Subject<WidgetPhase>();
  private readonly surfaceOpenSubject = new BehaviorSubject<boolean>(false);
  private readonly subs = new Subscription();
  private readonly channelSubs = new Map<BaseRealtimeChannelClient, Subscription>();
  private readonly registeredChannels = new Map<string, WidgetChannelClass>();

  private phase: WidgetPhase = 'idle';
  private errorMessage = '';
  private auth: WidgetAuthAdapter | null = null;
  private store: WidgetResumeStore | null = null;
  private guest: WidgetGuestSession | null = null;
  private guestSource: WidgetGuestSessionSource | null = null;
  private disposed = false;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by every start/end/dispose; a launch that finds it changed has been abandoned. */
  private launchGeneration = 0;
  private endReason: WidgetEndReason | null = null;
  private readyAnnounced = false;
  /** The conversation the live session belongs to, for the resume store. */
  private liveSessionConversationId: string | null = null;
  /** Set once the call has reached a live turn-state — gates the `closed` → ended edge. */
  private sawLive = false;
  /**
   * True once THIS launch has asked MJ to start a session. `ConnectionState$` is a BehaviorSubject whose
   * teardown deliberately preserves a terminal `'error'`, so a controller built for a re-mounted host is
   * handed the PREVIOUS session's final state the moment it subscribes. A state that predates our start is
   * not about our session — the subscription still has to exist first, because the runtime emits
   * `'connecting'` from INSIDE `StartRealtimeSession`.
   */
  private started = false;
  /**
   * True while THIS widget has a call open on the runtime. The runtime is shared (one per page), so ending
   * "the session" on behalf of a widget that never started one — an idle widget being removed, an `end()` on
   * a widget that is not live — would hang up a call that belongs to another widget or to the host page.
   */
  private ownsRuntimeCall = false;
  /** True once a connection state has arrived that belongs to THIS launch (the only sign a start was accepted). */
  private sawOwnState = false;
  private connectionSub: Subscription | null = null;

  constructor(private readonly deps: WidgetControllerDeps, initialConfig: WidgetConfig) {
    this.config = initialConfig;
    this.now = deps.now ?? (() => Date.now());
    this.wireRuntimeStreams();
  }

  // ── Observation ────────────────────────────────────────────────────────────

  /** Everything the page should hear about, as typed events. */
  public get Events$(): Observable<WidgetOutboundEvent> {
    return this.eventsSubject.asObservable();
  }

  /** Emits each phase the widget enters. */
  public get Phase$(): Observable<WidgetPhase> {
    return this.phaseSubject.asObservable();
  }

  public get Phase(): WidgetPhase {
    return this.phase;
  }

  /**
   * Whether a channel that RENDERS something (a form, a board) is open in the live call. The overlay only
   * shows a channel's surface in console chrome or in a container wide enough for one, so a widget on a
   * phone would otherwise open a form nobody can see; the component uses this to move an `auto` chrome to
   * `console` for as long as such a channel is open.
   */
  public get SurfaceChannelOpen$(): Observable<boolean> {
    return this.surfaceOpenSubject.asObservable();
  }

  /** The words for the last failure; empty outside the `error` phase. */
  public get ErrorMessage(): string {
    return this.errorMessage;
  }

  public get Config(): WidgetConfig {
    return this.config;
  }

  public get Mode(): WidgetAuthMode {
    return ResolveAuthMode(this.config);
  }

  /** Replaces the configuration (the component calls this as attributes and properties change). */
  public Configure(config: WidgetConfig): void {
    this.config = config;
  }

  /**
   * Announces the widget as ready (once) and starts it when `auto-start` asked to. The component calls this
   * after its first render; a page that attached its listeners in the same tick as the element still hears it,
   * because the event is dispatched on a microtask.
   */
  public Ready(): void {
    if (this.readyAnnounced || this.disposed) {
      return;
    }
    this.readyAnnounced = true;
    queueMicrotask(() => {
      if (this.disposed) {
        return;
      }
      this.emit({ name: 'mj-ready', detail: { mode: this.Mode, autoStart: this.config.autoStart } });
      if (this.config.autoStart) {
        void this.Start();
      }
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Starts the call: shows the consent gate first when the page asked for one, otherwise goes straight to
   * authenticating and connecting. Ignored while a call is starting or live.
   */
  public async Start(): Promise<void> {
    if (this.disposed || !['idle', 'ended', 'error', 'consent'].includes(this.phase)) {
      return;
    }
    if (this.config.requireConsent) {
      this.setPhase('consent');
      return;
    }
    await this.launch(false);
  }

  /** The visitor accepted the consent gate. Only meaningful in the `consent` phase. */
  public async AcceptConsent(recordingConsent: boolean): Promise<void> {
    if (this.phase !== 'consent') {
      return;
    }
    await this.launch(recordingConsent);
  }

  /** The visitor declined the consent gate: nothing starts, and the widget returns to idle. */
  public DeclineConsent(): void {
    if (this.phase === 'consent') {
      this.setPhase('idle');
    }
  }

  /** Ends the call. Safe when no call is live. */
  public async End(reason: WidgetEndReason = 'user'): Promise<void> {
    this.launchGeneration++;
    this.endReason ??= reason;
    try {
      await this.endOwnRuntimeCall();
    } catch (error) {
      console.error('[mj-realtime-widget] Ending the session failed:', error);
    }
    if (this.phase === 'consent' || this.phase === 'booting' || this.phase === 'connecting') {
      // The call never went live, so the runtime has no SessionEnded for us — settle the phase here.
      this.setPhase('idle');
      this.endReason = null;
    }
  }

  /** The visitor pressed End in the overlay (the runtime has already ended the call). */
  public NotifyOverlayEnded(): void {
    this.endReason ??= 'user';
  }

  /** `pagehide`. Returns whether a close was sent. */
  public OnPageHide(persisted: boolean): boolean {
    if (!persisted && this.deps.pageClose.IsArmed) {
      this.endReason ??= 'page-close';
    }
    return this.deps.pageClose.OnPageHide(persisted);
  }

  /** The element was removed from the page. Closes a live call; never throws. */
  public Dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.launchGeneration++;
    this.clearDeadlineTimer();
    if (this.deps.pageClose.IsArmed) {
      this.deps.pageClose.OnHostTeardown();
    }
    this.connectionSub?.unsubscribe();
    this.subs.unsubscribe();
    for (const sub of this.channelSubs.values()) {
      sub.unsubscribe();
    }
    this.channelSubs.clear();
    void this.endOwnRuntimeCall().catch((error: unknown) => {
      console.error('[mj-realtime-widget] Ending the session on removal failed:', error);
    });
    this.eventsSubject.complete();
    this.phaseSubject.complete();
    this.surfaceOpenSubject.complete();
  }

  // ── Host actions ───────────────────────────────────────────────────────────

  /** Registers a channel class the page brings. It is declared to every session this widget starts. */
  public RegisterChannel(channelClass: WidgetChannelClass): void {
    const name = new channelClass().ChannelName;
    if (name.trim().length === 0) {
      throw new Error('registerChannel: the channel class has no ChannelName.');
    }
    this.registeredChannels.set(name.toLowerCase(), channelClass);
  }

  /** Opens (and seeds) a channel in the live session, the way the agent's `open` action would. */
  public async OpenChannel(channel: string, inputs: JSONObject = {}): Promise<WidgetChannelResult> {
    if (!this.deps.runtime.IsActive) {
      return { success: false, error: 'There is no live call to open a channel in.', errorCode: 'no_session' };
    }
    const outcome: RealtimeContextActionResult = await this.deps.runtime.OpenChannel(channel, inputs);
    return outcome.Success
      ? { success: true, result: outcome.Result }
      : { success: false, error: outcome.ErrorMessage ?? 'The channel could not be opened.', errorCode: outcome.ErrorCode };
  }

  /** Tells the agent something in the background (no spoken reply). No-op when no call is live. */
  public SendContextNote(text: string): void {
    this.deps.runtime.SendContextNote(text);
  }

  /** Asks the agent to speak, right now, to the given instructions. Returns whether the request was delivered. */
  public RequestSpokenResponse(instructions: string): boolean {
    return this.deps.runtime.RequestSpokenOpening(instructions);
  }

  /** The descriptors of the channels in the live session (for a host UI that lists what the agent can do). */
  public GetChannelDescriptors(): RealtimeChannelDescriptor[] {
    return [...this.deps.runtime.ActiveChannels, ...this.deps.runtime.AdvertisedChannels].map((c) => c.GetDescriptor());
  }

  // ── Launch ─────────────────────────────────────────────────────────────────

  private async launch(recordingConsent: boolean): Promise<void> {
    const generation = ++this.launchGeneration;
    this.resetLaunchState();
    try {
      this.setPhase('booting');
      const prepared = await this.prepareSession();
      if (this.isAbandoned(generation)) {
        return;
      }
      this.setPhase('connecting');
      await this.startRuntimeSession(prepared, recordingConsent, generation);
    } catch (error) {
      if (this.isAbandoned(generation)) {
        await this.endAbandonedSession();
        return;
      }
      this.fail(error instanceof LaunchFailure ? error.code : 'start-failed', error instanceof Error ? error.message : 'The call could not be started.');
    }
  }

  private resetLaunchState(): void {
    this.endReason = null;
    this.errorMessage = '';
    this.sawLive = false;
    this.started = false;
    this.ownsRuntimeCall = false;
    this.sawOwnState = false;
    this.guest = null;
    this.clearDeadlineTimer();
    this.deps.runtime.SetSessionDeadline(null);
  }

  private isAbandoned(generation: number): boolean {
    return this.disposed || generation !== this.launchGeneration;
  }

  /** Authenticates per the configured mode and resolves what the runtime session needs. */
  private async prepareSession(): Promise<PreparedSession> {
    const mode = this.Mode;
    const config = this.config;
    const scope = `${config.apiUrl ?? ''}|${config.widgetKey ?? config.agentId ?? ''}`;
    this.store = this.deps.createResumeStore(scope);
    if (mode === 'host' || (mode === 'launcher' && !config.token && !config.inviteToken)) {
      return this.prepareWithoutCredential(mode);
    }
    if (mode === 'widget-key') {
      return this.prepareGuestSession();
    }
    return this.prepareWithCredential(mode);
  }

  /** `host` and a bare `launcher`: the page (or the launcher) owns the principal; there is nothing to hold. */
  private prepareWithoutCredential(mode: WidgetAuthMode): PreparedSession {
    const agentId = this.config.agentId ?? '';
    if (mode === 'host' && agentId.length === 0) {
      throw new LaunchFailure('No agent was specified. Set the agent-id attribute.', 'no-agent');
    }
    if (mode === 'host' && this.config.launcher === null) {
      this.auth = this.deps.createAuth(this.config.apiUrl, null);
      if (!this.auth.HasPrincipal()) {
        throw new LaunchFailure('No credential was supplied. Set widget-key, invite-token or token, or run inside an authenticated MemberJunction page.', 'no-credential');
      }
    }
    return { agentId, applicationId: this.config.applicationId, deadline: null, guestChannels: [] };
  }

  private async prepareGuestSession(): Promise<PreparedSession> {
    const { apiUrl, widgetKey } = this.config;
    if (!apiUrl || !widgetKey) {
      throw new LaunchFailure('A widget-key needs the api-url of the server that issued it.', 'no-credential');
    }
    this.guestSource = this.deps.createGuestSessions(apiUrl, widgetKey);
    const guest = await this.mintGuest(this.guestSource, 'Mint');
    if (guest.modality === 'Text') {
      throw new LaunchFailure('This widget is not enabled for voice.', 'voice-not-enabled');
    }
    this.guest = guest;
    this.auth = this.deps.createAuth(apiUrl, () => this.renewGuestToken());
    await this.holdOrFail(this.auth, guest.token);
    if (this.config.agentId && this.config.agentId !== guest.pinnedAgentId) {
      console.warn(`[mj-realtime-widget] agent-id "${this.config.agentId}" ignored: this widget key pins agent "${guest.pinnedAgentId}".`);
    }
    const deadline = guest.voiceMaxSessionMinutes ? new Date(this.now() + guest.voiceMaxSessionMinutes * 60_000) : null;
    return { agentId: guest.pinnedAgentId, applicationId: guest.applicationId, deadline, guestChannels: guest.enabledChannels };
  }

  private async mintGuest(source: WidgetGuestSessionSource, op: 'Mint' | 'Refresh'): Promise<WidgetGuestSession> {
    try {
      return await source[op]();
    } catch (error) {
      if (error instanceof WidgetKeyError) {
        throw new LaunchFailure(error.message, 'auth-failed');
      }
      throw error;
    }
  }

  /** The provider's way to renew a guest token: ask the server's refresh path and hand back the new one. */
  private async renewGuestToken(): Promise<string> {
    if (this.guestSource === null) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    const next = await this.mintGuest(this.guestSource, 'Refresh');
    this.guest = next;
    return next.token;
  }

  /** `invite-token`, `token` and a launcher that also carries a credential. */
  private async prepareWithCredential(mode: WidgetAuthMode): Promise<PreparedSession> {
    const config = this.config;
    const agentId = config.agentId ?? '';
    if (agentId.length === 0 && mode !== 'launcher') {
      throw new LaunchFailure('No agent was specified. Set the agent-id attribute.', 'no-agent');
    }
    this.auth = this.deps.createAuth(config.apiUrl, null);
    // A single-use invite that was already redeemed in this tab has left a session JWT in the resume store;
    // spend that rather than the (now spent) invite.
    const credential = this.store?.ReadJwt() ?? config.token ?? config.inviteToken;
    if (credential === null || credential === undefined) {
      throw new LaunchFailure('No credential was supplied.', 'no-credential');
    }
    const jwt = await this.holdOrFail(this.auth, credential);
    if (jwt !== null) {
      this.store?.WriteJwt(jwt, this.auth.ReadExpiry(jwt));
    }
    return { agentId, applicationId: config.applicationId, deadline: null, guestChannels: [] };
  }

  private async holdOrFail(auth: WidgetAuthAdapter, credential: string): Promise<string | null> {
    const held = await auth.Hold(credential);
    if (!held.held) {
      throw new LaunchFailure(held.failure.message, 'auth-failed');
    }
    return held.jwt;
  }

  private async startRuntimeSession(prepared: PreparedSession, recordingConsent: boolean, generation: number): Promise<void> {
    const runtime = this.deps.runtime;
    if (this.config.launcher) {
      runtime.Launcher = this.config.launcher;
    }
    if (prepared.deadline) {
      runtime.SetSessionDeadline(prepared.deadline);
    }
    this.wireConnectionState();
    const lastSessionId = this.store?.Read()?.lastSessionId ?? null;
    // Set BEFORE the call, not after: the runtime pushes 'connecting' from inside StartRealtimeSession, and
    // that one IS ours.
    this.started = true;
    this.ownsRuntimeCall = true;
    try {
      await runtime.StartRealtimeSession(
        prepared.agentId,
        this.config.conversationId,
        lastSessionId,
        this.config.agentName,
        null,
        null,
        null,
        null,
        recordingConsent,
        null,
        prepared.applicationId,
        null,
        { HostChannels: this.buildHostChannels(prepared.guestChannels) }
      );
    } catch (error) {
      throw new LaunchFailure(DescribeStartError(error instanceof Error ? error : null), this.config.launcher ? 'launcher-failed' : 'start-failed');
    }
    if (this.isAbandoned(generation)) {
      await this.endAbandonedSession();
      return;
    }
    // Postcondition: the runtime reports a dropped start by returning normally having emitted nothing at all.
    // Surfacing that is the difference between a Try-again button and a permanent spinner.
    if (!this.sawOwnState) {
      throw new LaunchFailure(START_DROPPED_MESSAGE, 'start-dropped');
    }
    this.openSeededChannels();
  }

  /** The channels this widget declares to the session: what the page listed, what the guest instance enables, what the page registered. */
  private buildHostChannels(guestChannels: string[]): RealtimeHostChannelDeclaration[] {
    const declared = new Map<string, RealtimeHostChannelDeclaration>();
    for (const name of [...(this.config.channels ?? []), ...guestChannels]) {
      const id = name.toLowerCase();
      const custom = this.registeredChannels.get(id);
      declared.set(id, custom ? { Create: () => new custom() } : { ClientPluginClass: BUILT_IN_CHANNEL_KEYS[name] ?? name });
    }
    for (const [id, channelClass] of this.registeredChannels) {
      if (!declared.has(id)) {
        declared.set(id, { Create: () => new channelClass() });
      }
    }
    return [...declared.values()];
  }

  /** Opens every channel the page seeded with `channelInputs`, now that the call is up. */
  private openSeededChannels(): void {
    for (const [channel, inputs] of Object.entries(this.config.channelInputs)) {
      void this.OpenChannel(channel, inputs).then((result) => {
        if (!result.success) {
          this.emitError('channel-failed', `Could not open the ${channel} channel: ${result.error ?? 'unknown error'}`);
        }
      });
    }
  }

  private async endAbandonedSession(): Promise<void> {
    try {
      await this.deps.runtime.EndRealtimeSession();
    } catch (error) {
      console.error('[mj-realtime-widget] An abandoned launch could not close the session it opened:', error);
    }
  }

  // ── Runtime streams ────────────────────────────────────────────────────────

  private wireRuntimeStreams(): void {
    const runtime = this.deps.runtime;
    this.subs.add(runtime.SessionStarted$.subscribe((e) => this.onSessionStarted(e.sessionId, e.channelNames)));
    this.subs.add(runtime.SessionEnded$.subscribe((e) => this.onSessionEnded(e.sessionId, e.reason)));
    this.subs.add(runtime.SessionEvents$.subscribe((event) => this.onSessionEvent(event)));
    this.subs.add(runtime.ActiveChannels$.subscribe((channels) => this.syncChannelSubscriptions(channels)));
    this.subs.add(runtime.SessionDeadline$.subscribe((deadline) => this.armDeadlineTimer(deadline)));
  }

  private onSessionStarted(sessionId: string, channels: string[]): void {
    this.liveSessionConversationId = this.config.conversationId;
    this.deps.pageClose.Arm(sessionId);
    this.store?.WriteSession(sessionId, this.liveSessionConversationId);
    this.emit({
      name: 'mj-session-started',
      detail: { sessionId, agentId: this.config.agentId, conversationId: this.liveSessionConversationId, channels }
    });
  }

  private onSessionEnded(sessionId: string, runtimeReason: 'explicit' | 'error'): void {
    this.deps.pageClose.Disarm();
    this.clearDeadlineTimer();
    this.surfaceOpenSubject.next(false);
    const reason: WidgetEndReason = this.endReason ?? (runtimeReason === 'error' ? 'error' : 'remote');
    this.emit({ name: 'mj-session-ended', detail: { sessionId, reason } });
  }

  private onSessionEvent(event: { Type: string; AgentSessionID: string; OccurredAt: string; Payload: unknown }): void {
    this.emit({
      name: 'mj-session-event',
      detail: { type: event.Type, sessionId: event.AgentSessionID, occurredAt: event.OccurredAt, payload: event.Payload as JSONObject }
    });
    if (event.Type === 'identity.verified' && IsIdentityVerifiedEventPayload(event.Payload)) {
      const p = event.Payload;
      this.emit({
        name: 'mj-verified',
        detail: {
          sessionId: event.AgentSessionID,
          email: p.VerifiedEmail,
          name: p.VerifiedName,
          verifiedAt: p.VerifiedAt,
          method: p.Method,
          ...(p.MaxSessionDeadlineIso ? { maxSessionDeadline: p.MaxSessionDeadlineIso } : {}),
          recovered: p.Recovered === true
        }
      });
    }
  }

  /** Subscribes to the typed streams of every mounted channel, and lets go of the ones that left. */
  private syncChannelSubscriptions(channels: readonly BaseRealtimeChannelClient[]): void {
    for (const [channel, sub] of this.channelSubs) {
      if (!channels.includes(channel)) {
        sub.unsubscribe();
        this.channelSubs.delete(channel);
      }
    }
    for (const channel of channels) {
      if (!this.channelSubs.has(channel)) {
        this.channelSubs.set(channel, this.subscribeChannel(channel));
      }
    }
  }

  private subscribeChannel(channel: BaseRealtimeChannelClient): Subscription {
    const sub = new Subscription();
    sub.add(
      channel.Events$.subscribe((e) => {
        if (e.Name === 'opened') {
          if (channel.HasSurface()) {
            this.surfaceOpenSubject.next(true);
          }
          const inputs = (e.Payload['inputs'] ?? {}) as JSONObject;
          this.emit({ name: 'mj-channel-opened', detail: { channel: e.Channel, instance: e.Instance, inputs } });
        }
        this.emit({
          name: 'mj-channel-event',
          detail: { channel: e.Channel, instance: e.Instance, name: e.Name, payload: e.Payload, ...(e.ChangeId !== undefined ? { changeId: e.ChangeId } : {}), occurredAt: e.OccurredAt }
        });
      })
    );
    sub.add(
      channel.Output$.subscribe((o) =>
        this.emit({ name: 'mj-channel-output', detail: { channel: o.Channel, instance: o.Instance, output: o.Output, occurredAt: o.OccurredAt } })
      )
    );
    return sub;
  }

  // ── Connection state → phase ───────────────────────────────────────────────

  private wireConnectionState(): void {
    this.connectionSub?.unsubscribe();
    this.connectionSub = this.deps.runtime.ConnectionState$.subscribe((state) => this.applyConnectionState(state));
  }

  /**
   * Maps one connection state onto the phase:
   *   • `connecting` → `connecting`, but NEVER regressing below `live` (that would unmount the overlay that
   *     owns the connection);
   *   • `listening | speaking | thinking` → `live` (idempotent);
   *   • `error` → `error`, with the start error's words when the call never went live;
   *   • `closed` → `ended`, but only after the call actually went live (the initial `closed` is ignored);
   *   • nothing, once the phase is terminal — a provider still talking while teardown runs is not news.
   */
  private applyConnectionState(state: RealtimeConnectionState): void {
    if (!this.started) {
      return; // the PREVIOUS session's state, replayed to a fresh subscriber
    }
    this.sawOwnState = true;
    if (TERMINAL_PHASES.has(this.phase)) {
      return;
    }
    switch (state) {
      case 'connecting':
        if (PRE_LIVE_PHASES.has(this.phase)) {
          this.setPhase('connecting');
        }
        break;
      case 'listening':
      case 'speaking':
      case 'thinking':
        this.sawLive = true;
        this.setPhase('live');
        break;
      case 'error':
        // The runtime swallows a launcher throw into this state, so a custom launcher is named here.
        this.fail(
          this.sawLive ? 'connection-lost' : this.config.launcher ? 'launcher-failed' : 'start-failed',
          this.sawLive ? CONNECTION_LOST_MESSAGE : DescribeStartError(this.deps.runtime.LastStartError)
        );
        break;
      case 'closed':
        if (this.sawLive) {
          this.setPhase('ended');
        }
        break;
    }
  }

  // ── Deadline ───────────────────────────────────────────────────────────────

  /** Ends the call when the (server-confirmed) deadline passes, so the visitor sees why instead of a dead line. */
  private armDeadlineTimer(deadline: Date | null): void {
    this.clearDeadlineTimer();
    if (deadline === null || this.disposed) {
      return;
    }
    const remaining = deadline.getTime() - this.now();
    if (remaining <= 0) {
      void this.End('deadline');
      return;
    }
    this.deadlineTimer = setTimeout(() => this.armDeadlineTimer(deadline), Math.min(remaining, MAX_TIMER_MS));
  }

  private clearDeadlineTimer(): void {
    if (this.deadlineTimer !== null) {
      clearTimeout(this.deadlineTimer);
      this.deadlineTimer = null;
    }
  }

  // ── Phase + errors ─────────────────────────────────────────────────────────

  /** Ends the runtime's call, but only when this widget is the one that opened it. */
  private async endOwnRuntimeCall(): Promise<void> {
    if (!this.ownsRuntimeCall) {
      return;
    }
    this.ownsRuntimeCall = false;
    await this.deps.runtime.EndRealtimeSession();
  }

  private setPhase(next: WidgetPhase): void {
    if (next === this.phase) {
      return;
    }
    if (next === 'ended' || next === 'error') {
      this.ownsRuntimeCall = false; // the runtime has already torn the call down
    }
    const previous = this.phase;
    this.phase = next;
    this.phaseSubject.next(next);
    this.emit({ name: 'mj-phase-changed', detail: { phase: next, previous } });
  }

  private fail(code: WidgetErrorCode, message: string): void {
    if (this.phase === 'error') {
      return;
    }
    this.errorMessage = message;
    this.setPhase('error');
    this.emitError(code, message);
  }

  private emitError(code: WidgetErrorCode, message: string): void {
    this.emit({ name: 'mj-error', detail: { code, message, phase: this.phase } });
  }

  private emit(event: WidgetOutboundEvent): void {
    if (!this.disposed) {
      this.eventsSubject.next(event);
    }
  }
}
