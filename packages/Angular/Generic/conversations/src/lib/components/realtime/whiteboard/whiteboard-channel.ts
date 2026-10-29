import type { Type } from '@angular/core';
import { Subscription } from 'rxjs';
import { RealtimeToolDefinition, type JSONObject } from '@memberjunction/ai';
import { CompareExposure, REALTIME_CHANNEL_CONTRACT_VERSION, type RealtimeChannelDescriptor } from '@memberjunction/ai-core-plus';
import { ChannelInboundVideoBridge, IChannelFrameProvider, type MediaPlacement } from '@memberjunction/ai-realtime-client';
import { BaseRealtimeChannelClient, BuildToolBackedVerbs, ChannelOnboardingDetails } from '@memberjunction/realtime-runtime';
import { IsPlainObject, RegisterClass } from '@memberjunction/global';
import {
  ApplyWhiteboardAgentTool, BuildWhiteboardExportSvg, IsWhiteboardWidgetToolAllowed, IsWhiteboardWidgetToolName,
  MinWhiteboardWidgetAccess, RealtimeWhiteboardHostComponent, WHITEBOARD_TOOL_DEFINITIONS, WHITEBOARD_TOOL_NAMES,
  WHITEBOARD_TOOL_PREFIX, WHITEBOARD_WIDGET_TOOL_NAMES, WhiteboardAuthor, WhiteboardState, WhiteboardToolResult,
  SameWhiteboardWidgetActions, WhiteboardWidgetAccess, WhiteboardWidgetActionInfo, WhiteboardWidgetActionsChangedEventArgs,
  WhiteboardWidgetInteractionEvent,
  WhiteboardWidgetSubmitEvent, WhiteboardWidgetToolName
} from '@memberjunction/ng-whiteboard';
import { DEFAULT_WHITEBOARD_CHANNEL_CONFIG, ParseWhiteboardChannelConfig, type WhiteboardChannelConfig } from './whiteboard-channel-config';

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

/** Every widget tool's result carries the widget's contents (outline, state), so it requires `'state'` exposure. */
const WIDGET_TOOLS_RETURN_STATE: Readonly<Record<string, 'state'>> = Object.fromEntries(
  WHITEBOARD_WIDGET_TOOL_NAMES.map(name => [name, 'state' as const]));

/**
 * Per-widget throttle window for "widget offers actions" perception notes (same leading +
 * trailing, latest-wins shape as the ambient interaction notes).
 */
export const WHITEBOARD_ACTIONS_NOTE_THROTTLE_MS = 4000;

/**
 * Minimum spacing (ms) between the save requests a widget-state change triggers. The
 * session runtime debounces saves 3 s and RE-ARMS on every request, so a chatty widget
 * requesting on every keystroke would never save until teardown; spacing requests further
 * apart than the debounce guarantees each one lands.
 */
export const WHITEBOARD_WIDGET_STATE_SAVE_THROTTLE_MS = 5000;

/** The JSON key the widget states ride under, beside the board's own fields, in the session save payload. */
export const WHITEBOARD_WIDGET_STATES_SAVE_KEY = 'widgetStates';

/**
 * One widget command as {@link RealtimeWhiteboardChannel.OnBeforeWidgetCommand} sees it,
 * before it reaches the board.
 */
export interface WhiteboardChannelWidgetCommand {
  /** Which widget tool the agent called. */
  ToolName: WhiteboardWidgetToolName;
  /** The target widget's item ID, when the arguments name one. */
  ItemID: string | null;
  /** The parsed tool arguments, or null when they were not a JSON object (the board then answers `invalid_args`). */
  Args: Readonly<JSONObject> | null;
  /** The raw tool arguments as the model sent them. */
  ArgsJson: string;
  /** The effective widget access this call was checked against. */
  Access: WhiteboardWidgetAccess;
}

/** A widget-tool failure code (the `errorCode` of a {@link WhiteboardToolResult}). */
type WidgetToolErrorCode = NonNullable<WhiteboardToolResult['errorCode']>;

/** A JSON tool result for a widget command the channel refused before it reached the board. */
function widgetToolFailure(errorCode: WidgetToolErrorCode, error: string): string {
  const result: WhiteboardToolResult = { success: false, error, errorCode };
  return JSON.stringify(result);
}

/** Parses tool arguments into a JSON object, or null when they are not one. */
function parseToolArgs(argsJson: string): JSONObject | null {
  try {
    const parsed: unknown = JSON.parse(argsJson);
    // JSON.parse output is JSON by construction, so narrowing a plain object to JSONObject is not a type lie.
    return IsPlainObject(parsed) ? (parsed as JSONObject) : null;
  } catch {
    return null;
  }
}

/** Whether a widget event came from the agent's own operate command (absent Author = the user). */
function isAgentAuthored(event: { ItemID: string; Author?: WhiteboardAuthor }): boolean {
  return event.Author === 'agent';
}

/** Reads the `widgetStates` sibling key of a saved payload; anything malformed reads as none. */
function readSavedWidgetStates(stateJson: string): Record<string, string> {
  const saved = parseToolArgs(stateJson);
  const raw = saved ? saved[WHITEBOARD_WIDGET_STATES_SAVE_KEY] : undefined;
  const out: Record<string, string> = {};
  if (IsPlainObject(raw)) {
    for (const [id, value] of Object.entries(raw as JSONObject)) {
      if (typeof value === 'string') {
        out[id] = value;
      }
    }
  }
  return out;
}

/** Per-key throttle bookkeeping. */
interface NoteThrottleEntry<T> {
  /** When this key's last note was sent (epoch ms). */
  LastSentAt: number;
  /** Trailing-edge timer for a deferred note, or null when the window is idle. */
  Timer: ReturnType<typeof setTimeout> | null;
  /** The latest value received within the open window (sent when the timer fires). */
  Pending: T | null;
}

/**
 * Per-key leading + trailing throttle for background notes: outside an open window a value
 * is sent immediately and opens a window; within the window the LATEST value is stashed and
 * a trailing-edge timer sends it when the window closes (one note per key per window).
 */
class KeyedNoteThrottle<T> {
  private entries = new Map<string, NoteThrottleEntry<T>>();

  constructor(private readonly windowMs: number, private readonly send: (value: T) => void) {}

  /** Offers one value for `key`; it is sent now or at the end of the key's open window. */
  public Push(key: string, value: T): void {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || (entry.Timer === null && now - entry.LastSentAt >= this.windowMs)) {
      this.send(value);
      this.entries.set(key, { LastSentAt: now, Timer: null, Pending: null });
      return;
    }
    entry.Pending = value; // latest wins within the window
    if (entry.Timer === null) {
      const wait = Math.max(0, entry.LastSentAt + this.windowMs - now);
      entry.Timer = setTimeout(() => this.flush(entry), wait);
    }
  }

  /** Cancels every pending trailing note and resets all windows. */
  public Clear(): void {
    for (const entry of this.entries.values()) {
      if (entry.Timer !== null) {
        clearTimeout(entry.Timer);
      }
    }
    this.entries.clear();
  }

  private flush(entry: NoteThrottleEntry<T>): void {
    entry.Timer = null;
    const pending = entry.Pending;
    entry.Pending = null;
    if (pending !== null) {
      entry.LastSentAt = Date.now();
      this.send(pending);
    }
  }
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
  private interactionThrottles = new KeyedNoteThrottle<WhiteboardWidgetInteractionEvent>(
    WHITEBOARD_INTERACTION_NOTE_THROTTLE_MS, (interaction) => this.sendInteractionNote(interaction));
  /** Per-widget "offers actions" note throttles (ItemID → window state). */
  private actionsNoteThrottles = new KeyedNoteThrottle<WhiteboardWidgetActionsChangedEventArgs>(
    WHITEBOARD_ACTIONS_NOTE_THROTTLE_MS, (actions) => this.sendActionsNote(actions));
  /** Per-widget action list of the last "offers actions" note SENT (ItemID → actions), for dedupe. */
  private lastActionsNoted = new Map<string, WhiteboardWidgetActionInfo[]>();
  /** The parsed `ChannelConfig` (defaults until {@link OnInitialize}). */
  private config: WhiteboardChannelConfig = { ...DEFAULT_WHITEBOARD_CHANNEL_CONFIG };
  /** Widget-state subscription driving the throttled save. */
  private widgetStateSub: Subscription | null = null;
  /** Trailing timer of the widget-state save throttle, or null when idle. */
  private widgetStateSaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** When the widget-state path last requested a save (epoch ms). */
  private lastWidgetStateSaveAt = Number.NEGATIVE_INFINITY;
  /** True while {@link RestoreState} runs: saves are held so none carries a half-restored board. */
  private restoring = false;
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

  /**
   * The board's tools. The widget tools are declared only as far as {@link MaxWidgetAccess}
   * allows (`'inspect-only'` declares Inspect only, `'off'` none). Read before the channel is
   * initialized, so it depends on the class alone, never on the session's config.
   */
  public GetToolDefinitions(): RealtimeToolDefinition[] {
    const max = this.MaxWidgetAccess;
    if (max === 'full') {
      return WHITEBOARD_TOOL_DEFINITIONS;
    }
    return WHITEBOARD_TOOL_DEFINITIONS.filter(tool => !IsWhiteboardWidgetToolName(tool.Name) || IsWhiteboardWidgetToolAllowed(max, tool.Name));
  }

  // ────────────────────────────────────────────── widget access policy (extension points)

  /**
   * The most widget access this channel class ever offers — which widget tools it DECLARES to the
   * model (tools are collected before the channel is initialized, so this cannot depend on the
   * session). Default `'full'`. A host app lowers it by subclassing the channel and registering the
   * subclass under `'RealtimeWhiteboardChannel'` (or via `HostChannels[].Create`).
   */
  protected get MaxWidgetAccess(): WhiteboardWidgetAccess {
    return 'full';
  }

  /**
   * The widget access in force for ONE call, evaluated per call (so it may change mid-session,
   * e.g. `'off'` while an assessment is open). Default: the lower of {@link MaxWidgetAccess} and
   * the session's `widgetAccess` config. A call it does not allow returns `access_denied`.
   */
  protected ResolveWidgetAccess(): WhiteboardWidgetAccess {
    return MinWhiteboardWidgetAccess(this.MaxWidgetAccess, this.config.WidgetAccess);
  }

  /**
   * Last-moment veto of one widget command that access already allows: return the refusal text the
   * model should see (the call returns `vetoed` with it) or `null` to let it through. Default allows all.
   */
  protected OnBeforeWidgetCommand(_command: WhiteboardChannelWidgetCommand): string | null {
    return null;
  }

  /** Whether widget runtime state rides in this session's saves (config `persistWidgetState`). */
  public get PersistWidgetState(): boolean {
    return this.config.PersistWidgetState;
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
      // Each widget tool returns the widget's contents, so the runtime refuses it below 'state' exposure.
      Verbs: BuildToolBackedVerbs(this.GetToolDefinitions(), this.ToolNamePrefix, 'agent', WIDGET_TOOLS_RETURN_STATE),
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
    this.applyChannelConfig();
    this.stateChangedSub?.unsubscribe();
    this.EnableVisualPerception(this, {
      ConfirmationNote:
        '[whiteboard] visual confirmation of your action (background — do NOT narrate or announce your own change; continue naturally)',
      // Preserves what the board always did: it started the bridge's fixed-rate poller despite being
      // designed heartbeat-free. Flagged for the reviewer; remove to make the board purely change-driven.
      StartBridgePoller: true
    });
    this.stateChangedSub = this.State.Changed$.subscribe((change) => {
      if (!this.restoring) {
        this.Context?.RequestSave(this.BuildSavePayload());
      }
      this.RecordChange({ Author: change.Author, Perceive: false });
      // Only user edits (and scene replacements like undo) drive the settle-debounce pipeline.
      // Agent edits are confirmed with a single frame in ApplyAgentTool.
      if (change.Author === 'user' || change.Op === 'replace') {
        void this.NotifyVisualChange();
      }
    });
    // Widget state is runtime data (no Changed$): save it on its own, throttled cadence.
    this.widgetStateSub?.unsubscribe();
    this.widgetStateSub = this.State.WidgetStateChanged$.subscribe(() => this.scheduleWidgetStateSave());
  }

  /** Parses `ChannelConfig`; an invalid member falls back to its default with a console warning. */
  private applyChannelConfig(): void {
    const parsed = ParseWhiteboardChannelConfig(this.Context?.ChannelConfig);
    this.config = parsed.Config;
    for (const problem of parsed.Problems) {
      console.warn(`[RealtimeWhiteboardChannel] channel config: ${problem}`);
    }
  }

  /**
   * Tells the model, once the session is live, which widget tools this session's access leaves
   * unavailable (notes sent before the session is live are dropped, so not from OnInitialize).
   */
  public override OnSessionStarted(): void {
    super.OnSessionStarted();
    const limit = this.describeWidgetAccessLimit(this.ResolveWidgetAccess());
    if (limit) {
      this.Context?.SendContextNote(`[whiteboard] ${limit}`);
    }
  }

  /** One sentence naming the widget tools `access` leaves unavailable, or null at full access. */
  private describeWidgetAccessLimit(access: WhiteboardWidgetAccess): string | null {
    if (access === 'full') {
      return null;
    }
    const unavailable = WHITEBOARD_WIDGET_TOOL_NAMES.filter(name => !IsWhiteboardWidgetToolAllowed(access, name));
    const reason = access === 'off'
      ? 'widget tools are turned off for this session'
      : `widgets are inspect-only for this session — read them with ${WHITEBOARD_TOOL_NAMES.InspectWidget}, but do not try to change them`;
    return `${unavailable.join(', ')} ${unavailable.length === 1 ? 'is' : 'are'} unavailable: ${reason}.`;
  }

  /**
   * The session save payload: the board's own JSON plus, when `persistWidgetState` is on and any
   * widget holds state, a sibling `widgetStates` key. Old readers ignore the unknown key; LiveKit
   * sync and Save-to-artifact keep plain {@link WhiteboardState.ToJSON}.
   */
  protected BuildSavePayload(): string {
    const boardJson = this.State.ToJSON();
    if (!this.config.PersistWidgetState) {
      return boardJson;
    }
    const widgetStates = this.State.WidgetStatesToJSON();
    if (Object.keys(widgetStates).length === 0) {
      return boardJson;
    }
    const payload = parseToolArgs(boardJson) ?? {};
    payload[WHITEBOARD_WIDGET_STATES_SAVE_KEY] = widgetStates;
    return JSON.stringify(payload);
  }

  /**
   * Requests a save for a widget-state change at most once per
   * {@link WHITEBOARD_WIDGET_STATE_SAVE_THROTTLE_MS} (leading edge, then one trailing request with
   * the latest state). Nothing is requested when `persistWidgetState` is off.
   */
  private scheduleWidgetStateSave(): void {
    if (this.restoring || !this.config.PersistWidgetState || this.widgetStateSaveTimer !== null) {
      return;
    }
    const wait = this.lastWidgetStateSaveAt + WHITEBOARD_WIDGET_STATE_SAVE_THROTTLE_MS - Date.now();
    if (wait <= 0) {
      this.requestWidgetStateSave();
      return;
    }
    this.widgetStateSaveTimer = setTimeout(() => {
      this.widgetStateSaveTimer = null;
      this.requestWidgetStateSave();
    }, wait);
  }

  private requestWidgetStateSave(): void {
    this.lastWidgetStateSaveAt = Date.now();
    this.Context?.RequestSave(this.BuildSavePayload());
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
    instance.AgentWidgetAccess = this.ResolveWidgetAccess();
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
        // The agent's own operate command submitted it: the tool result already carries
        // `submitted`, so no note and no spoken reaction (it would answer itself).
        if (isAgentAuthored(submit)) {
          return;
        }
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
      // A widget registered or changed its named actions — a throttled perception note.
      instance.WidgetActionsChanged.subscribe((actions: WhiteboardWidgetActionsChangedEventArgs) => {
        this.actionsNoteThrottles.Push(actions.ItemID, actions);
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
   * per widget per window, latest summary wins). The agent's own interactions (its operate
   * steps) are not echoed back to it.
   */
  private onWidgetInteraction(interaction: WhiteboardWidgetInteractionEvent): void {
    if (isAgentAuthored(interaction)) {
      return;
    }
    this.interactionThrottles.Push(interaction.ItemID, interaction);
  }

  /** The ambient-note framing: background etiquette rides in the note itself (like scene deltas). */
  private sendInteractionNote(interaction: WhiteboardWidgetInteractionEvent): void {
    this.Context?.SendContextNote(
      `[whiteboard] ambient activity in widget "${interaction.Title || interaction.ItemID}" ` +
      '(background — do NOT respond unless it is significant or you are asked; ' +
      `explicit submissions arrive separately): ${interaction.Summary}`);
  }

  /**
   * "[whiteboard] widget … offers actions: …" — sent only when the channel's exposure lets the
   * model see board contents (`'state'` or above) and this session may call widget actions,
   * and only when the list (names + descriptions) differs from the last note sent for that
   * widget: a remount, a `hello` answer or the agent's own inspect re-reports the same list.
   */
  private sendActionsNote(event: WhiteboardWidgetActionsChangedEventArgs): void {
    if (event.Actions.length === 0 || CompareExposure(this.Exposure, 'state') < 0) {
      return;
    }
    if (!IsWhiteboardWidgetToolAllowed(this.ResolveWidgetAccess(), WHITEBOARD_TOOL_NAMES.CallWidget)) {
      return;
    }
    const lastSent = this.lastActionsNoted.get(event.ItemID);
    if (lastSent && SameWhiteboardWidgetActions(lastSent, event.Actions)) {
      return;
    }
    this.lastActionsNoted.set(event.ItemID, event.Actions.map(action => ({ ...action })));
    const names = event.Actions.map(action => action.Name).join(', ');
    this.Context?.SendContextNote(`[whiteboard] widget "${event.Title || event.ItemID}" (${event.ItemID}) offers actions: ${names}`);
  }

  /** Cancels all pending ambient / actions note timers and resets the per-widget throttle windows. */
  private clearInteractionThrottles(): void {
    this.interactionThrottles.Clear();
    this.actionsNoteThrottles.Clear();
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
   * Executes one `Whiteboard_*` tool call LOCALLY. Board tools prefer the live bound host
   * (board mutation + UI garnish) and fall back to the pure engine function when no surface
   * is bound, so the channel keeps working before the board is first shown. Widget tools
   * (inspect / operate / call) need the live board and resolve asynchronously; see
   * {@link applyWidgetTool}.
   *
   * Return contract: **board tools return a plain `string` synchronously** (bound or not);
   * **the three widget tools** ({@link IsWhiteboardWidgetToolName}) **return a
   * `Promise<string>`** (policy refusals may also come back as a plain string). The declared
   * type is therefore `string | Promise<string>`. An override that post-processes results
   * should route `IsWhiteboardWidgetToolName(toolName)` calls straight to `super` and, for the
   * rest, narrow the board result with `typeof result === 'string'`.
   */
  public ApplyAgentTool(toolName: string, argsJson: string): string | Promise<string> {
    if (IsWhiteboardWidgetToolName(toolName)) {
      return this.applyWidgetTool(toolName, argsJson);
    }
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

  /**
   * One widget command: access policy (`access_denied`, with the reason), then the
   * {@link OnBeforeWidgetCommand} veto (`vetoed`), then the live board (`surface_unavailable`
   * when none is bound). No confirmation frame: a widget's picture is a placeholder in frames.
   */
  private applyWidgetTool(toolName: WhiteboardWidgetToolName, argsJson: string): string | Promise<string> {
    const access = this.ResolveWidgetAccess();
    if (!IsWhiteboardWidgetToolAllowed(access, toolName)) {
      return widgetToolFailure('access_denied', this.describeWidgetAccessLimit(access) ?? `${toolName} is not available.`);
    }
    const args = parseToolArgs(argsJson);
    const itemId = args && typeof args['itemId'] === 'string' ? args['itemId'] : null;
    const refusal = this.OnBeforeWidgetCommand({ ToolName: toolName, ItemID: itemId, Args: args, ArgsJson: argsJson, Access: access });
    if (refusal !== null) {
      return widgetToolFailure('vetoed', refusal);
    }
    const host = this.host;
    if (!host) {
      return widgetToolFailure('surface_unavailable',
        'The whiteboard isn\'t open, so its widgets can\'t be reached; ask the user to open the Whiteboard panel, then try again.');
    }
    host.AgentWidgetAccess = access; // per-call policy may have changed since BindSurface
    return host.ApplyAgentToolAsync(toolName, argsJson).catch((error: Error) =>
      widgetToolFailure('surface_unavailable', `The whiteboard could not run ${toolName}: ${error?.message ?? String(error)}`));
  }

  /**
   * The board's serialized state of record — the board JSON only. It also backs the channel's
   * `GetState()` snapshot, so widget states (learner answers) stay out of it; they ride only in
   * the session save payload ({@link BuildSavePayload}).
   */
  public override SerializeState(): string | null {
    return this.State.ToJSON();
  }

  /**
   * Rehydrates a prior session's saved board into THIS session's state engine (in place —
   * the {@link State} instance and its subscriptions are preserved). Returns `true` on
   * success; malformed / incompatible JSON returns `false` and the board stays fresh
   * (never throws — {@link WhiteboardState.LoadFromJSON} is tolerant by contract).
   *
   * Saves: none are requested while the board and its widget states are being loaded (so no
   * save can pair the restored board with stale in-memory widget states); after a successful
   * restore, exactly one save is requested carrying both. A failed restore requests nothing.
   */
  public override RestoreState(stateJson: string): boolean {
    this.restoring = true;
    try {
      if (!this.State.LoadFromJSON(stateJson)) {
        return false;
      }
      // A legacy payload (no `widgetStates` key) simply restores no widget state. With
      // `persistWidgetState` off nothing is restored either: state lives in memory only.
      this.State.LoadWidgetStates(this.config.PersistWidgetState ? readSavedWidgetStates(stateJson) : {});
    }
    finally {
      this.restoring = false;
    }
    this.Context?.RequestSave(this.BuildSavePayload());
    return true;
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
    this.widgetStateSub?.unsubscribe();
    this.widgetStateSub = null;
    if (this.widgetStateSaveTimer !== null) {
      // Best effort: hand the latest widget state over before the context is released.
      clearTimeout(this.widgetStateSaveTimer);
      this.widgetStateSaveTimer = null;
      this.requestWidgetStateSave();
    }
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
