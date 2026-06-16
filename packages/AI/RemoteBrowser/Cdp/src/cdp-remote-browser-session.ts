/**
 * The shared CDP {@link IRemoteBrowserSession} implementation — implemented ONCE here and reused by all
 * 5 Remote Browser drivers via {@link import('./base-cdp-remote-browser-provider').BaseCdpRemoteBrowserProvider}.
 *
 * The session is a thin, strongly-typed adapter between the Base session contract and the enriched
 * `@memberjunction/computer-use` `PlaywrightBrowserAdapter`:
 * - Core methods translate Base actions to computer-use actions (see {@link mapRemoteBrowserAction})
 *   and run them through the already-connected adapter, mapping results back to the Base shape.
 * - Capability-gated methods (`StartScreencast`/`StopScreencast`, `RouteHumanInput`, `GetLiveViewUrl`,
 *   `InvokeNativeAIControl`) check the backend's feature flag first and throw
 *   {@link RemoteBrowserCapabilityNotSupportedError} when off; live-view and native-AI delegate to the
 *   driver-supplied {@link ICdpSessionBackend}.
 *
 * @see `packages/AI/RemoteBrowser/Base/src/remote-browser-session.ts` for the contract this implements.
 */

import { LogError } from '@memberjunction/core';
import {
  IRemoteBrowserProviderFeatures,
  IRemoteBrowserSession,
  RemoteBrowserAction,
  RemoteBrowserActionResult,
  RemoteBrowserAudioChunk,
  RemoteBrowserCapabilityNotSupportedError,
  RemoteBrowserGoalResult,
  RemoteBrowserHumanInput,
  RemoteBrowserScreencastFrame,
  RunComputerUseGoalOptions,
} from '@memberjunction/remote-browser-base';
import { ActionExecutionResult, PlaywrightBrowserAdapter, RunComputerUseParams, ScreencastFrame, ScreencastOptions } from '@memberjunction/computer-use';
import { mapHumanInput, mapRemoteBrowserAction } from './map-action';
import { ICdpAudioCaptureHandle, ICdpSessionBackend } from './cdp-session-backend';
import { ComputerUseGoalEngineFactory, defaultComputerUseGoalEngineFactory } from './computer-use-goal-engine';
import { wrapAdapterWithContext } from './context-injection';

/**
 * The shared, CDP-backed live remote-browser session. Constructed by
 * {@link import('./base-cdp-remote-browser-provider').BaseCdpRemoteBrowserProvider.Connect} with an
 * already-launched (CDP-attached) {@link PlaywrightBrowserAdapter}, the CDP endpoint string, the
 * backend's capability flags, and the driver's {@link ICdpSessionBackend} hooks.
 */
export class CdpRemoteBrowserSession implements IRemoteBrowserSession {
  /**
   * The computer-use goal-engine factory used by {@link CdpRemoteBrowserSession.RunComputerUseGoal}.
   * Defaults to the base `ComputerUseEngine` (requires a controller model); bind
   * `MJComputerUseEngine` here at startup for vision-model auto-selection, or a fake in tests.
   */
  private static goalEngineFactory: ComputerUseGoalEngineFactory = defaultComputerUseGoalEngineFactory;

  /**
   * Overrides the computer-use goal-engine factory (the injection seam — production binds the MJ engine;
   * tests inject a fake).
   *
   * @param factory The factory that builds a goal engine per run.
   */
  public static SetGoalEngineFactory(factory: ComputerUseGoalEngineFactory): void {
    CdpRemoteBrowserSession.goalEngineFactory = factory;
  }

  /**
   * The connected computer-use adapter that performs all real CDP I/O. Held privately; subclasses /
   * backends reach perception via {@link CdpRemoteBrowserSession.Adapter}.
   */
  private readonly adapter: PlaywrightBrowserAdapter;

  /** The CDP endpoint this session is attached to (returned by {@link CdpRemoteBrowserSession.GetCdpEndpoint}). */
  private readonly cdpEndpoint: string;

  /** The backend's capability flags; gate every capability-gated method below. */
  private readonly features: IRemoteBrowserProviderFeatures;

  /** Driver-supplied hooks for the backend-specific session concerns (live-view, native-AI, release). */
  private readonly backend: ICdpSessionBackend;

  /** The backend display name, used only in capability-error messages. */
  private readonly providerName: string;

  /**
   * Idle-keyframe interval (ms). CDP's `Page.screencastFrame` only fires on a viewport REPAINT, so a
   * static page, an SPA that finished painting before/around stream start, or any missed repaint would
   * leave the live view frozen on a stale (often blank) frame. While streaming we force a fresh frame
   * whenever the stream has been quiet for this long, so the canvas always converges to the true page
   * within ~1s. During active interaction real repaint frames keep `lastFrameAt` fresh and the timer
   * never fires — so this adds no traffic when the page is genuinely animating.
   */
  private static readonly SCREENCAST_KEYFRAME_IDLE_MS = 1000;

  /**
   * Frame-sizing caps for the live view. WITHOUT these, CDP streams frames at the full viewport ×
   * the host's device-pixel-ratio (2× on Retina) at full quality — so a heavy, image-dense page
   * (Amazon, Gemini) produces multi-MB JPEG frames that choke / get dropped on the subscription
   * transport, while a light page (Wikipedia) squeaks through: the "works on some sites, blank on
   * others" bug. CDP scales frames down to fit MaxWidth/MaxHeight server-side, so this also slashes
   * bandwidth and the PushStatusUpdates flood. A live "watch the agent browse" view does not need
   * 1:1 fidelity. JPEG quality 60 is plenty for a thumbnail-scale stream.
   */
  private static readonly SCREENCAST_OPTIONS: ScreencastOptions = {
    Format: 'jpeg',
    Quality: 60,
    MaxWidth: 1280,
    MaxHeight: 800,
    EveryNthFrame: 1,
  };

  /** Active idle-keyframe timer while a screencast is running; `null` when not streaming. */
  private screencastKeyframeTimer: ReturnType<typeof setInterval> | null = null;

  /** Epoch ms of the last frame emitted on the active stream (repaint OR forced). 0 when not streaming. */
  private lastFrameAt = 0;

  /**
   * The active backend audio-capture handle while an audio stream is running; `null` when not streaming
   * audio. Held so {@link StopAudioStream} and {@link Close} can tear the capture down.
   */
  private audioCaptureHandle: ICdpAudioCaptureHandle | null = null;

  /**
   * Constructs a {@link CdpRemoteBrowserSession}.
   *
   * @param adapter A {@link PlaywrightBrowserAdapter} already launched and attached to the backend's CDP endpoint.
   * @param cdpEndpoint The CDP connect endpoint URL the adapter is attached to.
   * @param features The backend's capability flags (drives capability gating).
   * @param backend The driver-supplied backend hooks for live-view / native-AI / release.
   * @param providerName Optional backend display name for capability-error messages.
   */
  constructor(
    adapter: PlaywrightBrowserAdapter,
    cdpEndpoint: string,
    features: IRemoteBrowserProviderFeatures,
    backend: ICdpSessionBackend,
    providerName: string = '',
  ) {
    this.adapter = adapter;
    this.cdpEndpoint = cdpEndpoint;
    this.features = features ?? {};
    this.backend = backend;
    this.providerName = providerName;
  }

  /**
   * The connected computer-use adapter, exposed to subclasses / backends that need raw perception
   * (`GetVisibleText`, `GetAccessibilitySnapshot`, `QueryElement`) beyond the Base session surface.
   * Protected: not part of the public {@link IRemoteBrowserSession} contract.
   */
  protected get Adapter(): PlaywrightBrowserAdapter {
    return this.adapter;
  }

  // ── Core (universal CDP substrate) ──────────────────────────────────────────

  /**
   * @inheritdoc
   */
  public GetCdpEndpoint(): string {
    return this.cdpEndpoint;
  }

  /**
   * @inheritdoc
   */
  public async Navigate(url: string): Promise<RemoteBrowserActionResult> {
    // The adapter's Navigate returns void and throws on failure, so we build the Base result here.
    try {
      await this.adapter.Navigate(url);
      // Force an immediate live-view frame: CDP only emits a screencast frame on a repaint, so the
      // first navigation can otherwise leave the user staring at a blank surface (best-effort).
      await this.pushImmediateFrame();
      return { Success: true, CurrentUrl: this.adapter.CurrentUrl };
    } catch (err) {
      return {
        Success: false,
        CurrentUrl: this.adapter.CurrentUrl,
        Detail: this.errorDetail(err),
      };
    }
  }

  /**
   * @inheritdoc
   */
  public async ExecuteAction(action: RemoteBrowserAction): Promise<RemoteBrowserActionResult> {
    const result = await this.adapter.ExecuteAction(mapRemoteBrowserAction(action));
    // After a navigation-class action settles, force a fresh frame so the live view reflects the new
    // page immediately even if CDP hasn't fired a repaint frame yet (best-effort; the agent narrates
    // "I opened the page" and the user should SEE it without waiting for the next incidental repaint).
    if (result.Success && this.isNavigationAction(action)) {
      await this.pushImmediateFrame();
    }
    return this.toActionResult(result);
  }

  /**
   * @inheritdoc
   */
  public async CaptureScreenshot(): Promise<string> {
    return this.adapter.CaptureScreenshot();
  }

  /**
   * @inheritdoc
   */
  public GetCurrentUrl(): string {
    return this.adapter.CurrentUrl;
  }

  /**
   * @inheritdoc
   */
  public async Close(): Promise<void> {
    // Stop the idle-keyframe timer first so no forced frame fires against a tearing-down adapter.
    this.stopKeyframeTimer();
    // Tear down any active audio capture before closing the adapter it taps (best-effort).
    await this.teardownAudioCapture();
    // Close the browser adapter first, then release the backend resources. Both are best-effort:
    // a failure in one must not prevent the other from running, so teardown is always complete.
    try {
      await this.adapter.Close();
    } catch (err) {
      LogError(`CdpRemoteBrowserSession.Close: adapter.Close failed: ${this.errorDetail(err)}`);
    }
    try {
      await this.backend.Release();
    } catch (err) {
      LogError(`CdpRemoteBrowserSession.Close: backend.Release failed: ${this.errorDetail(err)}`);
    }
  }

  // ── Capability-gated (engine checks SupportedFeatures first; we re-check defensively) ──

  /**
   * @inheritdoc
   */
  public async StartScreencast(onFrame: (frame: RemoteBrowserScreencastFrame) => void): Promise<void> {
    this.requireFeature('ScreenStreaming');
    this.lastFrameAt = 0;
    // Stamp lastFrameAt on EVERY frame (repaint frames flow through here) so the idle-keyframe timer
    // only fires when the stream has actually gone quiet.
    await this.adapter.StartScreencast((frame) => {
      this.lastFrameAt = Date.now();
      onFrame(this.mapScreencastFrame(frame));
    }, CdpRemoteBrowserSession.SCREENCAST_OPTIONS);
    // Push an immediate first frame so the user sees the current page the moment the stream starts,
    // rather than a blank surface until the page next repaints (CDP only emits frames on a repaint).
    await this.pushImmediateFrame();
    this.startKeyframeTimer();
  }

  /**
   * @inheritdoc
   */
  public async StopScreencast(): Promise<void> {
    this.requireFeature('ScreenStreaming');
    this.stopKeyframeTimer();
    await this.adapter.StopScreencast();
  }

  /**
   * @inheritdoc
   *
   * Gated by BACKEND IMPLEMENTATION (v1): if the driver's {@link ICdpSessionBackend} provides no
   * `StartAudioCapture` hook, this throws {@link RemoteBrowserCapabilityNotSupportedError} — the same
   * shape as a non-streaming backend rejecting {@link StartScreencast}. Otherwise it delegates to the
   * backend (handing it the connected adapter), retaining the returned handle for teardown. Idempotent:
   * a re-call while already streaming audio is a no-op.
   */
  public async StartAudioStream(onChunk: (chunk: RemoteBrowserAudioChunk) => void): Promise<void> {
    if (!this.backend.StartAudioCapture) {
      throw new RemoteBrowserCapabilityNotSupportedError('AudioStreaming', this.providerName || 'CdpRemoteBrowserSession');
    }
    if (this.audioCaptureHandle) {
      return; // already capturing — don't stack a second capture on the one browser
    }
    this.audioCaptureHandle = await this.backend.StartAudioCapture(this.adapter, onChunk);
  }

  /**
   * @inheritdoc
   *
   * Gated by BACKEND IMPLEMENTATION (v1): throws {@link RemoteBrowserCapabilityNotSupportedError} on a
   * backend with no `StartAudioCapture` hook. Best-effort otherwise: stops the active capture (if any)
   * and clears the handle.
   */
  public async StopAudioStream(): Promise<void> {
    if (!this.backend.StartAudioCapture) {
      throw new RemoteBrowserCapabilityNotSupportedError('AudioStreaming', this.providerName || 'CdpRemoteBrowserSession');
    }
    await this.teardownAudioCapture();
  }

  /**
   * @inheritdoc
   *
   * Fire-and-forget by contract (the Base signature returns `void`): the human-takeover input is
   * mapped to a computer-use action and dispatched on the adapter, but we do not await it. Any
   * rejection is logged and swallowed so a single dropped pointer/key event never tears down the
   * takeover stream.
   */
  public RouteHumanInput(input: RemoteBrowserHumanInput): void {
    this.requireFeature('HumanTakeover');
    void this.adapter.ExecuteAction(mapHumanInput(input)).catch((err: unknown) => {
      LogError(`CdpRemoteBrowserSession.RouteHumanInput failed: ${this.errorDetail(err)}`);
    });
  }

  /**
   * @inheritdoc
   */
  public async GetLiveViewUrl(): Promise<string> {
    this.requireFeature('LiveView');
    return this.backend.GetLiveViewUrl();
  }

  /**
   * @inheritdoc
   */
  public async InvokeNativeAIControl(intent: string): Promise<RemoteBrowserActionResult> {
    this.requireFeature('NativeAIControl');
    return this.backend.InvokeNativeAIControl(intent);
  }

  /**
   * @inheritdoc
   *
   * Runs computer-use against THIS session's already-attached adapter (same instance the human watches —
   * no second CDP attach). Wires per-step progress + barge-in (`options.Signal` → engine `Stop()`), then
   * maps the rich {@link ComputerUseResult} onto the transport-neutral {@link RemoteBrowserGoalResult}.
   */
  public async RunComputerUseGoal(goal: string, options?: RunComputerUseGoalOptions): Promise<RemoteBrowserGoalResult> {
    const engine = CdpRemoteBrowserSession.goalEngineFactory();
    // Model-blind credential/context injection: when a Context is supplied, drive a proxy adapter that
    // resolves `{{label}}` tokens to real values at the CDP boundary — neither model ever sees the value.
    const adapter = options?.Context ? wrapAdapterWithContext(this.adapter, options.Context) : this.adapter;
    engine.SetBrowserAdapter(adapter);
    if (options?.OnProgress) {
      engine.OnProgress = (p) => options.OnProgress?.({ Step: p.Step, Message: p.Message, Url: p.Url });
    }
    // Forward the acting user so an MJ-aware engine runs its prompts under it (no-op for the base engine).
    if (options?.ContextUser) {
      engine.ContextUser = options.ContextUser;
    }
    // Forward the parent agent run + step so an MJ-aware engine nests this goal's prompt runs under them.
    if (options?.AgentRunID) {
      engine.AgentRunID = options.AgentRunID;
    }
    if (options?.AgentRunStepID) {
      engine.AgentRunStepID = options.AgentRunStepID;
    }
    const onAbort = (): void => engine.Stop();
    options?.Signal?.addEventListener('abort', onAbort, { once: true });
    try {
      // Build via the class so defaulted required fields (e.g. MaxSteps) are present; override only what we have.
      const params = Object.assign(new RunComputerUseParams(), { Goal: goal });
      if (options?.StartUrl) {
        params.StartUrl = options.StartUrl;
      }
      if (options?.MaxSteps != null) {
        params.MaxSteps = options.MaxSteps;
      }
      const result = await engine.Run(params);
      return {
        Success: result.Success,
        Strategy: 'ComputerUse',
        CurrentUrl: result.FinalUrl || this.adapter.CurrentUrl,
        Status: result.Status,
        StepCount: result.TotalSteps,
        Detail: result.Error?.Message ?? result.FinalJudgeVerdict?.Reason,
      };
    } catch (err) {
      return {
        Success: false,
        Strategy: 'ComputerUse',
        CurrentUrl: this.adapter.CurrentUrl,
        Status: 'Error',
        Detail: this.errorDetail(err),
      };
    } finally {
      options?.Signal?.removeEventListener('abort', onAbort);
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  /**
   * Best-effort: ask the adapter to capture and push ONE on-demand screencast frame through the active
   * stream. Used right after the stream starts and after a navigation settles so the live view refreshes
   * immediately, working around CDP's "frames only on repaint" behavior. A no-op on the adapter when no
   * screencast is running; any failure is logged and swallowed so a missed frame never breaks an action.
   */
  private async pushImmediateFrame(): Promise<void> {
    try {
      await this.adapter.CaptureScreencastFrame();
      // A forced frame counts as activity — reset the idle clock so the timer doesn't double-fire.
      this.lastFrameAt = Date.now();
    } catch (err) {
      LogError(`CdpRemoteBrowserSession.pushImmediateFrame failed (non-fatal): ${this.errorDetail(err)}`);
    }
  }

  /**
   * Starts the idle-keyframe timer (replacing any prior). Each tick forces a fresh frame ONLY when the
   * stream has been quiet for {@link SCREENCAST_KEYFRAME_IDLE_MS} — so static / SPA pages still refresh
   * while genuinely animating pages (whose repaint frames keep the clock fresh) incur no extra traffic.
   * `unref`'d so it never keeps a Node process alive on its own.
   */
  private startKeyframeTimer(): void {
    this.stopKeyframeTimer();
    const timer = setInterval(() => {
      if (Date.now() - this.lastFrameAt >= CdpRemoteBrowserSession.SCREENCAST_KEYFRAME_IDLE_MS) {
        void this.pushImmediateFrame();
      }
    }, CdpRemoteBrowserSession.SCREENCAST_KEYFRAME_IDLE_MS);
    (timer as { unref?: () => void }).unref?.();
    this.screencastKeyframeTimer = timer;
  }

  /** Stops + clears the idle-keyframe timer if running. Safe to call when no timer exists. */
  private stopKeyframeTimer(): void {
    if (this.screencastKeyframeTimer) {
      clearInterval(this.screencastKeyframeTimer);
      this.screencastKeyframeTimer = null;
    }
  }

  /**
   * Stops the active backend audio capture (if any) and clears the handle. Best-effort: a backend
   * `Stop` rejection is logged and swallowed so teardown (which runs from both {@link StopAudioStream}
   * and {@link Close}) always completes. No-op when no capture is running.
   */
  private async teardownAudioCapture(): Promise<void> {
    const handle = this.audioCaptureHandle;
    if (!handle) {
      return;
    }
    this.audioCaptureHandle = null;
    try {
      await handle.Stop();
    } catch (err) {
      LogError(`CdpRemoteBrowserSession.teardownAudioCapture: handle.Stop failed: ${this.errorDetail(err)}`);
    }
  }

  /**
   * True when an action changes the page such that the live view should be force-refreshed: navigation,
   * history back/forward. Clicks/typing/scrolls repaint on their own and don't need the forced frame.
   *
   * @param action The Base action just executed.
   * @returns Whether to push an immediate post-action frame.
   */
  private isNavigationAction(action: RemoteBrowserAction): boolean {
    return action.Kind === 'navigate' || action.Kind === 'back' || action.Kind === 'forward';
  }

  /**
   * Maps a computer-use {@link ActionExecutionResult} to the Base {@link RemoteBrowserActionResult}.
   * `CurrentUrl` is read from the adapter (the freshest value post-action); `Detail` carries the
   * adapter's error string on failure.
   *
   * @param result The computer-use execution result.
   * @returns The equivalent Base action result.
   */
  private toActionResult(result: ActionExecutionResult): RemoteBrowserActionResult {
    return {
      Success: result.Success,
      CurrentUrl: this.adapter.CurrentUrl,
      Detail: result.Error,
    };
  }

  /**
   * Maps a computer-use {@link ScreencastFrame} to the Base {@link RemoteBrowserScreencastFrame}. The
   * two shapes are identical (DataBase64 / Width / Height / SequenceNumber); this keeps the Base
   * package free of any computer-use dependency.
   *
   * @param frame The computer-use screencast frame.
   * @returns The equivalent Base screencast frame.
   */
  private mapScreencastFrame(frame: ScreencastFrame): RemoteBrowserScreencastFrame {
    return {
      DataBase64: frame.DataBase64,
      Width: frame.Width,
      Height: frame.Height,
      SequenceNumber: frame.SequenceNumber,
    };
  }

  /**
   * Defense-in-depth capability gate: throws {@link RemoteBrowserCapabilityNotSupportedError} when the
   * named feature flag is not enabled. Mirrors the driver's `RequireFeature` so a metadata flag that
   * lied — or a caller that bypassed the engine's gate — fails loudly here.
   *
   * @param featureName The capability flag to require.
   * @throws {RemoteBrowserCapabilityNotSupportedError} when the flag is not `true`.
   */
  private requireFeature(featureName: keyof IRemoteBrowserProviderFeatures): void {
    if (this.features[featureName] !== true) {
      throw new RemoteBrowserCapabilityNotSupportedError(String(featureName), this.providerName || 'CdpRemoteBrowserSession');
    }
  }

  /**
   * Extracts a human-readable detail string from an unknown thrown value.
   *
   * @param err The caught value.
   * @returns The error message when `err` is an `Error`, otherwise its string form.
   */
  private errorDetail(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
