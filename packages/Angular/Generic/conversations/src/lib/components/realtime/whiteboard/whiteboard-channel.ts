import type { Type } from '@angular/core';
import { Subscription } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { RealtimeToolDefinition } from '@memberjunction/ai';
import { REALTIME_CHANNEL_CONTRACT_VERSION, type RealtimeChannelDescriptor } from '@memberjunction/ai-core-plus';
import { ChannelInboundVideoBridge, IChannelFrameProvider, type MediaPlacement } from '@memberjunction/ai-realtime-client';
import { BaseRealtimeChannelClient, BuildToolBackedVerbs, ChannelOnboardingDetails } from '@memberjunction/realtime-runtime';
import {
  ApplyWhiteboardAgentTool, BuildWhiteboardExportSvg, RealtimeWhiteboardHostComponent, WHITEBOARD_TOOL_DEFINITIONS,
  WHITEBOARD_TOOL_PREFIX, WhiteboardState, WhiteboardWidgetInteractionEvent, WhiteboardWidgetSubmitEvent
} from '@memberjunction/ng-whiteboard';

/**
 * Whether a whiteboard tool result reports success.
 *
 * `ApplyWhiteboardAgentTool` returns a JSON `WhiteboardToolResult` string — `{ success: true, … }`
 * or `{ success: false, error }` — for every tool and every failure path. Anything that does not
 * parse as an object with `success === true` is treated as NOT a successful mutation, which is the
 * safe direction: the cost of missing a confirmation frame is one stale picture until the next
 * change, while the cost of a false one is telling the model an edit landed when it did not.
 */
function toolSucceeded(result: string): boolean {
  try {
    const parsed: unknown = JSON.parse(result);
    return parsed !== null && typeof parsed === 'object' && (parsed as { success?: unknown }).success === true;
  } catch {
    // A non-JSON result cannot be confirmed as a mutation — the host returned something this
    // channel does not understand, so it does not get a "your change is on screen" note.
    return false;
  }
}

/**
 * Asynchronously rasterizes an SVG string to a JPEG base64 string (without the `data:image/jpeg;base64,` prefix)
 * using an offscreen canvas. Returns null in non-DOM environments or when rendering fails.
 */
export async function RasterizeSvgToJpegBase64(svg: string, width = 1280, height = 720): Promise<string | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }
  return new Promise<string | null>((resolve) => {
    let url: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      if (url) {
        URL.revokeObjectURL(url);
        url = null;
      }
    };

    try {
      const img = new Image();
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      url = URL.createObjectURL(svgBlob);

      // Capped wait: resolve null and revoke URL if the Image never fires onload or onerror (item 61)
      timer = setTimeout(() => {
        console.error('[RealtimeWhiteboardChannel] SVG rasterization timed out after 5000ms');
        cleanup();
        resolve(null);
      }, 5000);

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            resolve(null);
            return;
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          cleanup();
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          const comma = dataUrl.indexOf(',');
          resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
        } catch (err) {
          console.error('[RealtimeWhiteboardChannel] Failed to rasterize SVG canvas to JPEG:', err);
          cleanup();
          resolve(null);
        }
      };
      img.onerror = (err) => {
        console.error('[RealtimeWhiteboardChannel] Failed to load SVG image for rasterization:', err);
        cleanup();
        resolve(null);
      };
      img.src = url;
    } catch (err) {
      console.error('[RealtimeWhiteboardChannel] Failed to initialize SVG rasterization:', err);
      cleanup();
      resolve(null);
    }
  });
}

/**
 * Per-widget throttle window for AMBIENT interaction context notes: at most one note per
 * widget per this many ms — within the window the LATEST summary wins (chatty widgets
 * collapse to one trailing-edge note instead of flooding the model's context).
 */
export const WHITEBOARD_INTERACTION_NOTE_THROTTLE_MS = 4000;

/** Per-widget ambient-note throttle bookkeeping. */
interface InteractionThrottleEntry {
  /** When this widget's last ambient note was sent (epoch ms). */
  LastSentAt: number;
  /** Trailing-edge timer for a deferred note, or null when the window is idle. */
  Timer: ReturnType<typeof setTimeout> | null;
  /** The latest event received within the open window (sent when the timer fires). */
  Pending: WhiteboardWidgetInteractionEvent | null;
}

/**
 * The LIVE WHITEBOARD as a pluggable interactive channel — the canonical
 * {@link BaseRealtimeChannelClient} implementation, resolved from the `MJ: AI Agent
 * Channels` registry row whose `ClientPluginClass` is `'RealtimeWhiteboardChannel'`.
 *
 * One instance per session (created via ClassFactory at session start). It owns the
 * board's {@link WhiteboardState} engine and contributes the channel's full contract:
 *
 *  - **Action**: the `Whiteboard_*` client-executed tool set
 *    ({@link WHITEBOARD_TOOL_DEFINITIONS}); {@link ApplyAgentTool} prefers the BOUND host
 *    component (board mutation + violet pop-in / toast / presence-cursor garnish) and
 *    falls back to the pure {@link ApplyWhiteboardAgentTool} engine call when no surface
 *    is bound (e.g. the board has not been shown yet) — the channel keeps working, just
 *    without the garnish.
 *  - **Perception**: {@link BindSurface} subscribes the host's coalesced (750 ms)
 *    `SceneDelta` stream and pipes each delta into the live model's context as a
 *    `[whiteboard]` background note; the agent-undo toast click flows the same way.
 *  - **Surface**: {@link RealtimeWhiteboardHostComponent}, created on the overlay's stage; the
 *    host's "Move to stage" button rides `Context.SetFocusMode`, and the board hears where the
 *    overlay placed it ({@link OnSurfacePlacementChange}) so the button offers the way back.
 *  - **State of record**: every board mutation (user edits AND agent tool calls) requests
 *    a save of {@link WhiteboardState.ToJSON} under channel name `'Whiteboard'` — the
 *    host debounces and flushes at teardown.
 *
 * A PRIOR session's persisted board is restored through {@link RestoreState} (invoked by
 * the session host after Initialize, before any surface binding): the saved JSON is
 * rehydrated IN PLACE into the same {@link WhiteboardState} instance, so the save
 * subscription and any later surface binding keep pointing at one engine. Malformed or
 * incompatible payloads are tolerated — the board simply starts fresh.
 */
@RegisterClass(BaseRealtimeChannelClient, 'RealtimeWhiteboardChannel')
export class RealtimeWhiteboardChannel extends BaseRealtimeChannelClient<RealtimeWhiteboardHostComponent> implements IChannelFrameProvider {
  /** The board's state of record — created fresh with the plugin (one per session). */
  public readonly State = new WhiteboardState();

  /** The live bound surface, when the channel tab's pane is instantiated. */
  private host: RealtimeWhiteboardHostComponent | null = null;
  /** Output subscriptions on the bound surface (SceneDelta / AgentUndo / FocusModeChange). */
  private surfaceSubs: Subscription[] = [];
  /** Board-mutation subscription driving the debounced state-of-record save. */
  private stateChangedSub: Subscription | null = null;
  /** Per-widget ambient-interaction note throttles (ItemID → window state). */
  private interactionThrottles = new Map<string, InteractionThrottleEntry>();
  public get ChannelName(): string {
    return 'Whiteboard';
  }

  /**
   * Produces the latest visual scene as a base64-encoded frame for the video bridge.
   * Renders the whiteboard SVG into an offscreen canvas and returns base64 JPEG.
   */
  public async GetLatestFrame(): Promise<string | null> {
    if (!this.State) {
      return null;
    }
    try {
      const svg = BuildWhiteboardExportSvg(this.State);
      return await RasterizeSvgToJpegBase64(svg);
    } catch (err) {
      console.error('[RealtimeWhiteboardChannel] Failed to export whiteboard frame:', err);
      return null;
    }
  }

  /**
   * The shared frame bridge, which now lives on the base channel (`VisualVideoBridge`). This accessor
   * keeps the board's long-standing `videoBridge` handle — tests and tooling reach the bridge by that
   * name — pointing at the one the pump actually writes to.
   */
  private get videoBridge(): ChannelInboundVideoBridge | null {
    return this.VisualVideoBridge;
  }
  private set videoBridge(bridge: ChannelInboundVideoBridge | null) {
    this.VisualVideoBridge = bridge;
  }

  // The change-driven frame pump (leading edge, trailing settle, dedupe, negotiated cadence, one
  // confirmation frame after an agent edit) used to live here. It is now the base channel's
  // `EnableVisualPerception` pump, enabled from OnInitialize — this channel only says WHEN its picture
  // changed. The behavior is unchanged, including (deliberately) the shared bridge's fixed-rate poller:
  // see `StartBridgePoller` in OnInitialize.

  public get ToolNamePrefix(): string {
    return WHITEBOARD_TOOL_PREFIX;
  }

  public get TabTitle(): string {
    return 'Whiteboard';
  }

  public get TabIcon(): string {
    return 'fa-solid fa-chalkboard';
  }

  /** The board can be shared on its own: the call's Share menu offers it under "This panel" while it is on screen. */
  public override get SurfaceShareable(): boolean {
    return true;
  }

  public GetToolDefinitions(): RealtimeToolDefinition[] {
    return WHITEBOARD_TOOL_DEFINITIONS;
  }

  public override GetSurfaceComponent(): Type<RealtimeWhiteboardHostComponent> {
    return RealtimeWhiteboardHostComponent;
  }

  /** First-run intro shown the first time the user opens the Whiteboard tab (once per user). */
  public override GetOnboardingDetails(): ChannelOnboardingDetails {
    return {
      Heading: 'Whiteboard',
      Description:
        'A shared canvas the agent can sketch, write and annotate on live during the call — ' +
        'whatever it draws appears here instantly, and anything you add is something it can see too.',
      Tips: [
        'Watch the board fill in as you talk — the agent updates it in real time.',
        'Add your own notes or shapes; the agent perceives your edits and can build on them.',
        'Use Focus to give the board the whole screen, and save it to artifacts to keep it.'
      ],
      IconClass: 'fa-solid fa-chalkboard'
    };
  }

  /**
   * The board's self-description: what it holds, every `Whiteboard_*` tool as a verb (so a tool a
   * subclass adds shows up here too), and that the model can SEE it (frames), not just read its state.
   */
  public override GetDescriptor(): RealtimeChannelDescriptor {
    return {
      Key: this.ChannelName,
      Version: REALTIME_CHANNEL_CONTRACT_VERSION,
      DisplayName: this.TabTitle,
      OwningPackage: '@memberjunction/ng-conversations',
      Instructions:
        'A shared canvas you and the user can both draw, write and annotate on live. Whatever you add ' +
        'appears instantly, and you perceive what the user adds. Use it to sketch, diagram and explain ' +
        'visually; do not narrate minor edits.',
      Nouns: [
        {
          Name: 'pages',
          Description: 'The board\'s pages, in order; each holds the items (notes, shapes, connectors, text, widgets) drawn on it.',
          Schema: { type: 'array', items: { type: 'object' } }
        }
      ],
      Verbs: BuildToolBackedVerbs(this.GetToolDefinitions(), this.ToolNamePrefix),
      Events: [
        { Name: 'state_changed', Description: 'The board changed (by you or the user).' },
        { Name: 'frame_pushed', Description: 'A picture of the board was sent to you.' }
      ],
      DisplayPolicy: 'open-on-start',
      DefaultAvailability: 'all-sessions',
      MaxExposure: 'pixels'
    };
  }

  /**
   * Persist the board (host-debounced) on EVERY board mutation — user edits AND agent tools — and drive
   * the visual pump. The board feeds the model its own perception (coalesced scene deltas from the
   * bound surface), so state changes are recorded for events and frame tagging only (`Perceive: false`):
   * the structured note would duplicate the deltas.
   */
  protected override OnInitialize(): void {
    this.stateChangedSub?.unsubscribe();
    this.EnableVisualPerception(this, {
      ConfirmationNote:
        '[whiteboard] visual confirmation of your action (background — do NOT narrate or announce your own change; continue naturally)',
      // Preserves what the board always did: it started the bridge's fixed-rate poller despite being
      // designed heartbeat-free. Flagged for the reviewer; remove to make the board purely change-driven.
      StartBridgePoller: true
    });
    this.stateChangedSub = this.State.Changed$.subscribe((change) => {
      this.Context?.RequestSave(this.State.ToJSON());
      this.RecordChange({ Author: change.Author, Perceive: false });
      // Only user edits (and scene replacements like undo) drive the settle-debounce pipeline.
      // Agent edits are confirmed with a single frame in ApplyAgentTool.
      if (change.Author === 'user' || change.Op === 'replace') {
        void this.NotifyVisualChange();
      }
    });
  }

  /**
   * Wires the dynamically-created board host: inputs (shared state engine + agent name)
   * are set BEFORE the component's first change detection, and the perception/garnish
   * outputs are subscribed back into the host context — the overlay never sees any of it.
   */
  public BindSurface(instance: RealtimeWhiteboardHostComponent): void {
    this.EnsureVideoBridge();
    this.releaseSurface();
    this.host = instance;
    instance.State = this.State;
    instance.AgentName = this.Context?.AgentName ?? 'Agent';
    this.surfaceSubs.push(
      // The board's coalesced scene delta — the perception feed the agent "sees".
      instance.SceneDelta.subscribe((deltaJson: string) => {
        // Background PERCEPTION, not conversation: the model sees every user edit without
        // being told, but must not narrate minor changes — only react when something is
        // significant (or when asked). The etiquette rides in the note itself so any
        // realtime model gets it regardless of system-prompt sync state.
        this.Context?.SendContextNote(
          '[whiteboard] board update (background context — do NOT comment on minor edits; ' +
          'only mention it if the change is significant to the discussion): ' + deltaJson);
      }),
      // The user clicked Undo on the agent-action toast (the undo already applied locally).
      instance.AgentUndo.subscribe(() => {
        this.Context?.SendContextNote('[whiteboard] user undid your last change');
      }),
      // A sandboxed HTML widget submitted user input (MJWhiteboard.submit) — already
      // validated, size-capped and not canceled (the host's cancelable WidgetSubmitting
      // event ran first). Surface it to the agent so it can react to quiz answers /
      // micro-form input it asked for.
      instance.WidgetSubmitted.subscribe((submit: WhiteboardWidgetSubmitEvent) => {
        // Durable awareness first (the note persists in the model's context)…
        this.Context?.SendContextNote(
          `[whiteboard] the user submitted input in widget "${submit.Title || submit.ItemID}": ${submit.DataJson}`);
        // …then make the model REACT — a submission is explicit user input the user is
        // waiting on; without this trigger, SendContextNote alone produces dead silence
        // ("I clicked Submit and nothing happened").
        this.Context?.RequestSpokenResponse?.(
          `The user just submitted input in the whiteboard widget "${submit.Title || submit.ItemID}": ${submit.DataJson}. ` +
          `React to it now in your own voice — acknowledge their choice and continue naturally.`);
      }),
      // AMBIENT widget telemetry (the injected recorder, NOT widget-authored script):
      // clicks / changes / typing summarized by the board. Pure background perception —
      // throttled per widget so chatty widgets don't flood the model's context, and framed
      // with do-not-respond etiquette (explicit MJWhiteboard.submit input arrives above).
      instance.WidgetInteraction.subscribe((interaction: WhiteboardWidgetInteractionEvent) => {
        this.onWidgetInteraction(interaction);
      }),
      // The board's Focus toggle — ask the shell to collapse/restore the main call column.
      instance.FocusModeChange.subscribe((focused: boolean) => {
        this.Context?.SetFocusMode(focused);
      }),
      // "Save to artifacts": snapshot the board as a first-class versioned artifact.
      instance.SaveToArtifactsRequested.subscribe(() => {
        void this.saveBoardAsArtifact();
      })
    );
  }

  public override UnbindSurface(): void {
    this.releaseSurface();
  }

  /**
   * Routes one ambient widget-interaction batch to the agent as a throttled background
   * context note: outside an open window the note goes out immediately and opens a
   * {@link WHITEBOARD_INTERACTION_NOTE_THROTTLE_MS} window; within the window the LATEST
   * event is stashed and a trailing-edge timer sends it when the window closes (one note
   * per widget per window, latest summary wins).
   */
  private onWidgetInteraction(interaction: WhiteboardWidgetInteractionEvent): void {
    const now = Date.now();
    const entry = this.interactionThrottles.get(interaction.ItemID);
    if (!entry || (entry.Timer === null && now - entry.LastSentAt >= WHITEBOARD_INTERACTION_NOTE_THROTTLE_MS)) {
      this.sendInteractionNote(interaction);
      this.interactionThrottles.set(interaction.ItemID, { LastSentAt: now, Timer: null, Pending: null });
      return;
    }
    entry.Pending = interaction; // latest wins within the window
    if (entry.Timer === null) {
      const wait = Math.max(0, entry.LastSentAt + WHITEBOARD_INTERACTION_NOTE_THROTTLE_MS - now);
      entry.Timer = setTimeout(() => {
        entry.Timer = null;
        const pending = entry.Pending;
        entry.Pending = null;
        if (pending) {
          entry.LastSentAt = Date.now();
          this.sendInteractionNote(pending);
        }
      }, wait);
    }
  }

  /** The ambient-note framing: background etiquette rides in the note itself (like scene deltas). */
  private sendInteractionNote(interaction: WhiteboardWidgetInteractionEvent): void {
    this.Context?.SendContextNote(
      `[whiteboard] ambient activity in widget "${interaction.Title || interaction.ItemID}" ` +
      '(background — do NOT respond unless it is significant or you are asked; ' +
      `explicit submissions arrive separately): ${interaction.Summary}`);
  }

  /** Cancels all pending ambient-note timers and resets the per-widget throttle windows. */
  private clearInteractionThrottles(): void {
    for (const entry of this.interactionThrottles.values()) {
      if (entry.Timer !== null) {
        clearTimeout(entry.Timer);
      }
    }
    this.interactionThrottles.clear();
  }

  /**
   * Persists the current board as a `MJ: Artifacts` snapshot via the host context
   * (best-effort; the host logs failures). On success the agent is told via a context
   * note so it can reference the saved artifact naturally.
   */
  private async saveBoardAsArtifact(): Promise<void> {
    const ctx = this.Context;
    if (!ctx) {
      return;
    }
    const now = new Date();
    const name = `Whiteboard — ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const artifactId = await ctx.SaveAsArtifact(name, this.State.ToJSON());
    if (artifactId) {
      ctx.SendContextNote(`[whiteboard] the user saved the current board as the artifact "${name}"`);
    }
  }

  /**
   * Executes one `Whiteboard_*` tool call LOCALLY. Prefers the live bound host (board
   * mutation + UI garnish); falls back to the pure engine function when no surface is
   * bound so the channel keeps working before the board is first shown.
   */
  public ApplyAgentTool(toolName: string, argsJson: string): string {
    let result: string;
    if (this.host) {
      result = this.host.ApplyAgentTool(toolName, argsJson);
    } else {
      result = ApplyWhiteboardAgentTool(this.State, toolName, argsJson);
    }
    // A SUCCESSFUL agent tool triggers exactly ONE immediate visual confirmation frame and a note
    // telling the model not to narrate its own change. A FAILED one must trigger neither: every
    // failure path returns `{ success: false, error }` (bad JSON args, unknown tool, per-tool
    // validation), and confirming it would tell the model its edit landed AND instruct it to stay
    // quiet about it — so the failure would vanish from the user's view while the model carried on.
    // It would also push a frame identical to the last one, since a failed tool changes nothing.
    if (toolSucceeded(result)) {
      void this.ConfirmVisualChange();
    }
    return result;
  }

  /** The board's serialized state of record (persisted under {@link ChannelName}). */
  public override SerializeState(): string | null {
    return this.State.ToJSON();
  }

  /**
   * Rehydrates a prior session's saved board into THIS session's state engine (in place —
   * the {@link State} instance and its subscriptions are preserved). Returns `true` on
   * success; malformed / incompatible JSON returns `false` and the board stays fresh
   * (never throws — {@link WhiteboardState.LoadFromJSON} is tolerant by contract).
   */
  public override RestoreState(stateJson: string): boolean {
    return this.State.LoadFromJSON(stateJson);
  }

  /** Keeps the board's "Move to stage" / "Back to tab" button true to where the host placed it. */
  public override OnSurfacePlacementChange(placement: MediaPlacement): void {
    this.host?.SetOnStage(placement === 'stage');
  }

  /**
   * Exit focus mode THROUGH the bound host (its own Focus button state stays in sync; it
   * re-emits `FocusModeChange(false)` → `Context.SetFocusMode(false)`). When no surface is
   * bound the overlay's defensive flag clear covers it.
   */
  public override RequestFocusExit(): void {
    if (this.host?.FocusMode) {
      this.host.ToggleFocus();
    }
  }

  public override Dispose(): void {
    this.stateChangedSub?.unsubscribe();
    this.stateChangedSub = null;
    super.Dispose(); // releases the surface binding, the visual pump + bridge, and the context
  }

  /** Unsubscribes surface outputs, cancels pending ambient notes and drops the host reference. */
  private releaseSurface(): void {
    for (const sub of this.surfaceSubs) {
      sub.unsubscribe();
    }
    this.surfaceSubs = [];
    this.clearInteractionThrottles();
    this.host = null;
  }
}

/**
 * Tree-shaking prevention: the whiteboard channel is resolved dynamically through the
 * ClassFactory (by the registry row's `ClientPluginClass` key), so this static call is
 * what keeps its `@RegisterClass` side effect from being eliminated by the bundler.
 * Called by `RealtimeSessionService` alongside the realtime-client driver Load calls.
 */
export function LoadRealtimeWhiteboardChannel(): void {
  // intentional no-op — the import side effect performs the registration
}

/** @deprecated Use {@link RasterizeSvgToJpegBase64}. */
export async function rasterizeSvgToJpegBase64(svg: string, width = 1280, height = 720): Promise<string | null> {
  return RasterizeSvgToJpegBase64(svg, width, height);
}
