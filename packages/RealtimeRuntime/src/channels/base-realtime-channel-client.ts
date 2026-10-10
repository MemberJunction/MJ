import { Observable, Subject } from 'rxjs';
import { IMetadataProvider } from '@memberjunction/core';
import { IsPlainObject } from '@memberjunction/global';
import {
  CHANNEL_INBOUND_VIDEO_TRACK, JSONObject, JSONValue, RealtimeToolDefinition, RealtimeTrackDescriptor, RealtimeTrackDirection
} from '@memberjunction/ai';
import {
  ChannelInboundVideoBridge,
  type BaseRealtimeClient,
  type IChannelFrameProvider,
  type MediaPlacement,
  type MediaVideoSource,
  type VideoSourceState
} from '@memberjunction/ai-realtime-client';
import {
  CompareExposure,
  DescribeExposureLimit,
  DescribeWithheldVerb,
  IsVerbWithheld,
  MinExposure,
  WithheldVerbs,
  ValidateJsonAgainstSchemaSubset,
  type AppContextSnapshot,
  type RealtimeChannelActor,
  type RealtimeChannelDescriptor,
  type RealtimeChannelExposure,
  type RealtimeChannelVerb,
} from '@memberjunction/ai-core-plus';
import type {
  RealtimeChannelEvent,
  RealtimeChannelOutput,
  RealtimeChannelVerbResult,
  RealtimeContextActionRequest,
  RealtimeContextActionResult,
} from './channel-contract-types';
import type { RealtimeSessionStreamEvent } from '../session/session-event-hub';
import { SynthesizeChannelDescriptor } from './channel-descriptor-synthesis';
import { ChannelPerceptionCoalescer, DEFAULT_CHANNEL_PERCEPTION_OPTIONS, type ChannelPerceptionOptions } from './channel-perception';
import { FormatChannelNote } from './channel-state-delta';
import { VisualPerceptionPump, type VisualFrameReason } from './channel-visual-pump';
import { DEFAULT_CHANNEL_SURFACE_PLACEMENT, type ChannelSurfacePlacement } from './channel-surface-placement';
import type { RealtimeCaptureKind, RealtimeCaptureState, RealtimeCaptureStates } from '../session/realtime-captures';
import type { RealtimeConnectionState } from '../session/RealtimeSessionRuntime';
import type { ParsedDelegationArtifact } from '../session/delegation-result-parser';

/**
 * A UI framework's component-class reference, as far as this runtime is concerned.
 *
 * This was `Type<T>` from `@angular/core`. That import was the *only* Angular tie in this file —
 * and it was never a real dependency: the runtime receives a component class from a channel plugin
 * and hands it to the host to render. It never constructs one, never reads a property off one, and
 * never cares what framework produced it.
 *
 * It is deliberately opaque. Trying to describe a component class *structurally* here would be
 * dishonest precision: each framework's constructor contract differs, and narrowing to any one of
 * them re-couples the runtime to that framework. The runtime only ever carries this value from the
 * plugin to the host, so "a class" is the whole of what it needs to know — the host, which does
 * know what a component is, narrows it at the single point where it instantiates one.
 *
 * Angular's `Type<T>` satisfies this unchanged, so no existing plugin needs editing. Without it,
 * every interactive channel — the whiteboard, the remote browser, the media surface — is
 * permanently Angular-only, which is exactly why a non-Angular host could not offer channels.
 */
export type RealtimeSurfaceComponentType = Function;

/**
 * Host services handed to a {@link BaseRealtimeChannelClient} at {@link BaseRealtimeChannelClient.Initialize}.
 *
 * The context is the plugin's ONLY line back to the live session — channels never talk to
 * `RealtimeSessionService` (or any host component) directly, which is what keeps them drop-in
 * plugins. Every member is host-implemented:
 *
 *  - the SESSION SERVICE supplies {@link SendContextNote} (perception feed into the live
 *    model), {@link RequestSave} (debounced state-of-record persistence onto the session's
 *    `MJ: AI Agent Session Channels` row) and {@link AgentName};
 *  - the OVERLAY SHELL wires {@link SetFocusMode} (through the service's focus stream) so a
 *    channel surface can request the focus layout — main call column collapsed, surface
 *    panel filling the overlay, floating call pill riding on top.
 */
export interface RealtimeChannelContext {
  /** Display name of the agent the live session fronts (e.g. `"Sage"`), fixed at session start. */
  AgentName: string;

  /**
   * The MJ metadata provider the live session runs on — the SAME `IMetadataProvider` instance that
   * authenticates the session (NOT necessarily the global default). A channel whose surface renders
   * MemberJunction-backed data (e.g. the Media channel streaming an `MJ: Files` record through
   * `mj-storage-media-player`) threads THIS provider into its surface / GraphQL calls so it stays
   * multi-provider safe. `null` only in degenerate/early states; channels fall back to the global
   * default when absent.
   */
  Provider: IMetadataProvider | null;

  /**
   * Feeds a background context note into the live realtime model (no spoken reply is
   * requested) — the PERCEPTION direction of the channel: serialized state deltas flow here
   * so the agent stays aware of what's on the surface. No-op when the session isn't live.
   */
  SendContextNote(text: string): void;

  /**
   * Asks the host to persist `stateJson` as this channel's state of record. The host
   * DEBOUNCES (a change burst becomes one save) and flushes any pending save at session
   * teardown — the plugin just calls this on every state mutation and never schedules
   * timers itself. Best-effort: persistence failures are logged host-side, never thrown.
   */
  RequestSave(stateJson: string): void;

  /**
   * Requests (or releases) the FOCUS layout for this channel's surface: the overlay
   * collapses the main call column and fills its stage with the surface, with a compact floating
   * call pill keeping mute / thread / end reachable. Any channel may request it; the host
   * tracks which channel holds focus and routes the pill's "exit" back to it via
   * {@link BaseRealtimeChannelClient.RequestFocusExit}.
   */
  SetFocusMode(on: boolean): void;

  /**
   * Asks the live model to SPEAK a response to the supplied instructions RIGHT NOW —
   * the channel's "react to this" path, e.g. a widget submission the user expects an
   * audible reaction to ({@link SendContextNote} deliberately never triggers speech).
   * Rides the realtime client's spoken-update channel, so on some providers the spoken
   * reply is narration-kind (ephemeral, not persisted as a caption). OPTIONAL member:
   * older host contexts may not supply it — plugins must call it null-safely.
   */
  RequestSpokenResponse?(instructions: string): void;

  /**
   * Persists a snapshot of the channel's state as a first-class versioned artifact
   * (`MJ: Artifacts` + version, linked into conversation history when possible) — e.g. the
   * whiteboard's "Save to artifacts". Distinct from {@link RealtimeChannelContext.RequestSave},
   * which maintains the session's rolling state of record. Best-effort: resolves to the
   * created Artifact ID, or `null` on failure (logged host-side, never thrown). Works during
   * the call AND right after it ends (the host retains the session id for late saves).
   */
  SaveAsArtifact(name: string, contentJson: string): Promise<string | null>;

  /**
   * The live `MJ: AI Agent Sessions` id this channel belongs to, or `null` before the
   * session has minted / after it has torn down. A channel whose tools or surface drive a
   * SERVER-SIDE resource (e.g. the Remote Browser channel's server-hosted browser) passes
   * this as the `agentSessionID` argument to its own GraphQL resolvers via
   * {@link ExecuteServerAction}. Most channels (whiteboard, shared doc) keep all state
   * client-side and never read it.
   */
  AgentSessionID: string | null;

  /**
   * Executes a CHANNEL-SPECIFIC GraphQL operation against the session's MJ server — the
   * escape hatch for channels backed by a SERVER-SIDE resource that the generic
   * {@link RequestSave} / {@link SaveAsArtifact} contract doesn't cover (e.g. the Remote
   * Browser channel driving a server-hosted browser through its own
   * `ExecuteRemoteBrowserAction` mutation + `RemoteBrowserSnapshot` query).
   *
   * The host runs the operation through the SAME provider the live session uses, so the
   * request rides the authenticated session. Best-effort and tolerant: a transport or
   * server error resolves to `null` (logged host-side) rather than throwing, so a channel
   * can map the failure to a model-readable result string without `try/catch`.
   *
   * @typeParam TResult The expected shape of the GraphQL operation's data payload.
   * @param query The GraphQL query/mutation document.
   * @param variables The operation variables (all JSON-serializable).
   * @returns The operation's `data` payload, or `null` on any failure / when no session is live.
   */
  ExecuteServerAction<TResult>(query: string, variables: Record<string, JSONValue>): Promise<TResult | null>;

  /**
   * OPTIONAL — the live app-context stream (where the user is, what they see, and the available
   * client-tool + agent manifest), pushed by the host (Explorer) at session start and on subsequent
   * changes. The headless `ClientContextChannel` subscribes to this and streams deltas to the model
   * via {@link SendContextNote}. Absent on hosts that don't supply app context (e.g. custom apps);
   * channels must read it null-safely.
   */
  AppContext$?: Observable<AppContextSnapshot | null>;

  /**
   * OPTIONAL — executes a host-registered surface CLIENT TOOL by name (the handlers the host wired
   * from the active surface's `SetAgentClientTools`). The headless `ClientContextChannel`'s
   * `ContextTool` proxy routes the model's `{ action, params }` here so a surface tool runs in the
   * browser with no server round-trip. Best-effort and tolerant — resolves to a structured result
   * (never throws); `Success: false` for an unknown tool or a thrown handler. Absent on hosts that
   * register no client tools.
   *
   * @param name The client-tool name (the model's `action`).
   * @param params The tool parameters (the model's `params`).
   * @returns A structured result the channel serializes back to the model.
   */
  ExecuteClientTool?(
    name: string,
    params: Record<string, unknown>
  ): Promise<{ Success: boolean; Result?: unknown; ErrorMessage?: string }>;

  /**
   * OPTIONAL — runs a CHANNEL-ADDRESSED `ContextTool` call: `{ action, params, target: { channel, instance? } }`.
   * The headless `ClientContextChannel`'s proxy routes a call here when the model named a target; the
   * host runtime resolves the channel, validates `params` against the verb's declared schema (a failure
   * comes back as a structured, model-recoverable error — never a half-applied mutation), enforces
   * `InvokableBy`, and opens an `on-demand` channel when the action is `'open'`. Never throws.
   *
   * Absent on hosts that do not scope channels; the proxy then reports that channel addressing is
   * unavailable instead of guessing.
   *
   * @param request The addressed call.
   * @returns A structured outcome the proxy serializes back to the model.
   */
  DispatchContextAction?(request: RealtimeContextActionRequest): Promise<RealtimeContextActionResult>;

  /**
   * The resolved per-channel configuration for THIS channel: the host's defaults beneath the agent's
   * and the app's `channels.config[<key>]` (see `ResolveRealtimeChannelScope`). Empty (`{}`) when none
   * was configured. A channel reads its policy knobs from here (e.g. an identity channel's allowed
   * email domains); it never reads the cascade itself.
   *
   * Treat it as untrusted, validated input: it is JSON authored by an operator, not typed code.
   */
  ChannelConfig?: Readonly<JSONObject>;

  /**
   * OPTIONAL — the events the SERVER publishes to this session (identity verification today; app-defined
   * types too), hot with no replay. A channel that reacts to them (an identity channel learning that the
   * user verified) subscribes in {@link BaseRealtimeChannelClient.OnInitialize} and unsubscribes at
   * {@link BaseRealtimeChannelClient.Dispose}. Absent on hosts whose session has no event transport.
   */
  SessionEvents$?: Observable<RealtimeSessionStreamEvent>;

  /**
   * OPTIONAL — sends a visual frame into the live session's inbound video track
   * (e.g. from Whiteboard or Remote Browser video bridges). No-op when the session
   * has not established an inbound video track or is not live.
   *
   * @param base64Image The image data (base64-encoded JPEG/PNG).
   * @param mimeType The image MIME type (defaults to 'image/jpeg').
   */
  SendVideoFrame?(base64Image: string, mimeType?: string): void;

  /**
   * OPTIONAL — checks whether a media track is currently established on the live session.
   */
  IsTrackEstablished?(modality: string, direction: RealtimeTrackDirection): boolean;

  /**
   * OPTIONAL — the underlying {@link BaseRealtimeClient} driving the media and transport planes.
   */
  Client?: BaseRealtimeClient | null;

  /**
   * OPTIONAL — the session's camera and screen share, now and on every change (the runtime's `Captures$`). A channel that
   * fronts a capture ({@link BaseRealtimeChannelClient.CaptureKind}) follows it here.
   */
  Captures$?: Observable<RealtimeCaptureStates>;

  /**
   * OPTIONAL — starts the camera or a screen share for the user's click on the channel's surface: the runtime's
   * `StartCamera` or `StartScreenShare`, under the same policy. Resolves with the capture's state; a failure is a state,
   * never a throw.
   */
  StartCapture?(kind: RealtimeCaptureKind): Promise<RealtimeCaptureState>;

  /** OPTIONAL — stops the camera or the screen share (the runtime's `StopCamera` / `StopScreenShare`). */
  StopCapture?(kind: RealtimeCaptureKind): void;

  /**
   * OPTIONAL — the session's video sources, now and on every change (the runtime's `VideoSources$`): each source the
   * video source arbiter knows, whether it is on (`Enabled`) and whether the model is being sent its frames (`Active`).
   * On a model that takes one video stream, a capture that is on can still be one the model is not sent. A channel that
   * fronts a capture finds its source by `REALTIME_CAPTURE_SOURCE_IDS`, and says the agent sees the capture only while
   * that source is both.
   */
  VideoSources$?: Observable<readonly VideoSourceState[]>;

  /**
   * OPTIONAL — the agent's video while the model sends it, `null` otherwise (the runtime's `AgentVideo$`). A channel that
   * shows the agent, one that sinks outbound video ({@link BaseRealtimeChannelClient.GetSunkTracks}), follows it here.
   */
  AgentVideo$?: Observable<MediaVideoSource | null>;

  /**
   * OPTIONAL — the call's state, now and on every change (the runtime's `ConnectionState$`): connecting, listening,
   * speaking, thinking, an error, or closed. A channel that shows the agent follows the agent's turn here.
   */
  ConnectionState$?: Observable<RealtimeConnectionState>;

  /**
   * OPTIONAL — whether the call is resuming on a new provider connection mid-call, now and on every change (the runtime's
   * `Resuming$`). The agent's video can stop for a few seconds while it does, so a channel that shows the agent holds the
   * last frame through the gap rather than showing that the video has stalled.
   */
  Resuming$?: Observable<boolean>;
}

/**
 * The first-run INTRO content for an interactive channel — the concise "what is this surface
 * and how do I use it" copy the overlay shows the very first time a user opens this channel's
 * tab (persisted "seen" per user, so it's shown ONCE per channel per user).
 *
 * A channel opts in by overriding {@link BaseRealtimeChannelClient.GetOnboardingDetails}; the
 * default returns `null`, so the base Voice/text channel (which has no plugin at all) AND any
 * plugin that doesn't override it show nothing.
 */
export interface ChannelOnboardingDetails {
  /** Short title, usually the surface name (e.g. `"Whiteboard"`). */
  Heading: string;
  /** One or two sentences: what the surface is and what the user can expect to see on it. */
  Description: string;
  /** Optional quick-tip bullets (kept to 2-3 short, scannable lines). */
  Tips?: string[];
  /** Optional Font Awesome icon class for the intro panel (e.g. `'fa-solid fa-chalkboard'`). */
  IconClass?: string;
}

/**
 * Base class for CLIENT-SIDE interactive-channel plugins (per
 * `plans/ai-agent-sessions.md` → "Interactive Channels" / "Pluggable Channel Interfaces").
 *
 * An interactive channel is a bidirectional surface the session's single realtime agent
 * both PERCEIVES and ACTS UPON (whiteboard, shared doc, map, …). A concrete plugin
 * contributes everything the channel needs, so the session service / call overlay carry
 * ZERO channel-specific wiring:
 *
 *  1. a CLIENT-EXECUTED TOOL SET ({@link GetToolDefinitions}, declared to the realtime
 *     model at session mint) plus the local executor ({@link ApplyAgentTool}) the host
 *     routes `{@link ToolNamePrefix}*` calls to — the ACTION direction;
 *  2. a STATE→CONTEXT SERIALIZER policy — the plugin owns its state engine and pushes
 *     coalesced deltas through {@link RealtimeChannelContext.SendContextNote} — the
 *     PERCEPTION direction;
 *  3. an OPTIONAL ANGULAR SURFACE ({@link GetSurfaceComponent}) the overlay creates dynamically
 *     in a channel tab, handed back through {@link BindSurface} so the plugin wires its own
 *     inputs/outputs (the host never knows the component's API). A channel may be **server-only**
 *     (no rendered surface) — e.g. a bridge-contributed meeting-controls or native-whiteboard
 *     channel whose surface lives on the external platform, not in MJ. Such a channel returns
 *     `null` from {@link GetSurfaceComponent} ({@link HasSurface} is `false`) and the overlay
 *     simply skips its tab while still wiring its tools + perception;
 *  4. a STATE OF RECORD ({@link SerializeState}, persisted via
 *     {@link RealtimeChannelContext.RequestSave} under {@link ChannelName}).
 *
 * ### Registration & resolution (mirrors the realtime model drivers)
 * Concrete plugins are `@RegisterClass(BaseRealtimeChannelClient, '<ClientPluginClass>')`
 * and are resolved at session start from the `MJ: AI Agent Channels` registry: each ACTIVE
 * row's `ClientPluginClass` is the ClassFactory key (exactly how `BaseRealtimeClient`
 * drivers resolve by provider key). Ship a `Load<YourChannel>()` no-op alongside the class
 * and call it from a static code path to defeat tree-shaking.
 *
 * ### Lifecycle — ONE INSTANCE PER SESSION (not a singleton)
 * `ClassFactory.CreateInstance` → {@link Initialize}(ctx) → zero or more
 * {@link BindSurface}/{@link UnbindSurface} cycles (the Angular overlay creates the surface the
 * first time it is shown and keeps it until the channel leaves the session; another host may
 * recreate it), each telling the plugin when its surface goes in and out of sight
 * ({@link OnSurfaceVisibilityChange}) and where it is placed ({@link OnSurfacePlacementChange})
 * → {@link Dispose} at teardown.
 * {@link ApplyAgentTool} MUST work with NO surface bound (apply to the state engine
 * directly; skip the UI garnish) — tool calls can arrive before the surface is first shown.
 *
 * @typeParam TSurface The plugin's Angular surface component type. The host only ever
 *   sees the default (`object`) — the typed parameter exists so concrete plugins get a
 *   fully typed {@link BindSurface} without casts.
 */
export abstract class BaseRealtimeChannelClient<TSurface extends object = object> {
  /**
   * The host context, available from {@link Initialize} until {@link Dispose}.
   * `null` outside that window — guard with `?.` in any code that can run early/late.
   */
  protected Context: RealtimeChannelContext | null = null;

  /**
   * The channel definition name — MUST match the `MJ: AI Agent Channels` row's `Name`
   * (e.g. `'Whiteboard'`). Used as the persistence key for {@link SerializeState} saves
   * and as the channel tab's stable key.
   */
  public abstract get ChannelName(): string;

  /**
   * The shared name prefix of every tool this channel exposes (e.g. `'Whiteboard_'`).
   * The host registers ONE local-execution route per plugin: tool calls whose name starts
   * with this prefix go to {@link ApplyAgentTool} instead of the server relay.
   *
   * Default `''` — a v2 channel with NO native tools (it is reached only through the `ContextTool`
   * proxy). The host registers no route for an empty prefix: an empty prefix would match *every*
   * tool name and hijack the server relay.
   */
  public get ToolNamePrefix(): string {
    return '';
  }

  /** Label for the channel's tab on the overlay's surface panel (e.g. `'Whiteboard'`). Defaults to {@link ChannelName}. */
  public get TabTitle(): string {
    return this.ChannelName;
  }

  /** Font Awesome icon class for the channel's tab (e.g. `'fa-solid fa-chalkboard'`). Defaults to a generic puzzle-piece. */
  public get TabIcon(): string {
    return 'fa-solid fa-puzzle-piece';
  }

  /**
   * OPTIONAL accent color for the channel's tab (a CSS color string, e.g. an `hsl()` /
   * token). When a plugin supplies one, the overlay paints the tab's dot + active underline
   * with it; when omitted (the default `null`), the overlay derives a stable, deterministic
   * color from the {@link ChannelName} so every channel still reads as a distinct, colored
   * surface. A channel only overrides this to enforce a specific brand accent.
   */
  public get TabColor(): string | null {
    return null;
  }

  /**
   * The channel's CLIENT-EXECUTED tool declarations, aggregated by the session service
   * into the `clientTools` set declared to the realtime model at session mint. The server
   * only DECLARES these — execution stays in the browser via {@link ApplyAgentTool}.
   *
   * Default `[]` — a v2 channel whose verbs are reached through the proxy only.
   */
  public GetToolDefinitions(): RealtimeToolDefinition[] {
    return [];
  }

  /**
   * Executes ONE agent tool call locally (the ACTION direction) and returns the result
   * JSON string fed back to the model as the `tool_response`. Called for every tool whose
   * name starts with {@link ToolNamePrefix}. Must work both WITH a bound surface (apply +
   * UI garnish) and WITHOUT one (apply to the state engine directly — the surface may not
   * exist yet, e.g. it has not been shown). Should not throw: return a
   * `{ success: false, error }` payload so the model can narrate the failure (the host
   * additionally wraps anything thrown).
   *
   * **This is the LEGACY entry point.** Channels written against the v2 contract override
   * {@link ApplyVerb} instead and inherit this method: the default maps the tool name back to its verb,
   * calls {@link ApplyVerb} as the agent, and serializes the structured result. Channels written
   * against v1 override THIS and inherit {@link ApplyVerb}, which adapts it. A channel must override
   * at least one of the two — overriding neither is reported as a failure result, never a recursion.
   */
  public ApplyAgentTool(toolName: string, argsJson: string): string | Promise<string> {
    if (this.bridgingVerbAndNativeTool) {
      return JSON.stringify({ success: false, error: this.implementsNeitherMessage() });
    }
    this.bridgingVerbAndNativeTool = true;
    let result: RealtimeChannelVerbResult | Promise<RealtimeChannelVerbResult>;
    try {
      result = this.ApplyVerb(this.ResolveVerbForTool(toolName), parseToolArguments(argsJson), 'agent');
    } finally {
      this.bridgingVerbAndNativeTool = false;
    }
    return result instanceof Promise ? result.then(serializeVerbResult) : serializeVerbResult(result);
  }

  /**
   * The Angular component the overlay creates dynamically as this channel's tab pane, or `null`
   * for a **server-only** channel that renders no MJ surface (its surface, if any, lives on the
   * external platform — e.g. a bridge-contributed native whiteboard or meeting-controls channel).
   *
   * When this returns `null`, the overlay renders NO tab for the channel and never calls
   * {@link BindSurface}/{@link UnbindSurface} — but the channel's tools ({@link GetToolDefinitions} /
   * {@link ApplyAgentTool}) and perception ({@link RealtimeChannelContext.SendContextNote}) still run.
   * A created surface instance is handed straight back via {@link BindSurface}; the host treats it as
   * opaque.
   *
   * Default: `null` (server-only). A channel with a rendered surface overrides this to return its
   * component type.
   */
  public GetSurfaceComponent(): RealtimeSurfaceComponentType | null {
    return null;
  }

  /**
   * Whether this channel has a rendered MJ surface ({@link GetSurfaceComponent} returns non-null).
   * The overlay uses this to decide whether to register a surface tab; server-only channels are
   * `false`. Override only if surface availability must be decided WITHOUT constructing the type
   * (the default calls {@link GetSurfaceComponent} once).
   */
  public HasSurface(): boolean {
    return this.GetSurfaceComponent() != null;
  }

  /**
   * The channel's FIRST-RUN INTRO content, or `null` when the channel offers no onboarding.
   * The overlay shows this once per channel per user — the first time the user opens this
   * channel's surface tab — and remembers "seen" via the user's settings (NOT localStorage),
   * so it never re-appears on later sessions or other devices.
   *
   * Default: `null` (no intro). The base Voice/text channel has no plugin at all, so it never
   * shows an intro; an interactive channel with a surface worth explaining (whiteboard, remote
   * browser, …) overrides this to return its {@link ChannelOnboardingDetails}. A plugin that
   * doesn't override it simply shows nothing — onboarding is strictly opt-in.
   */
  public GetOnboardingDetails(): ChannelOnboardingDetails | null {
    return null;
  }

  /**
   * Called by the host right after it created the surface component (and BEFORE the
   * component's first change detection, so inputs set here are visible in its `ngOnInit`).
   * The plugin — which knows its own component type — sets inputs (state engine, agent
   * name, …) and subscribes outputs here, wiring perception/garnish flows back through
   * {@link Context}. May be called again with a NEW instance after an
   * {@link UnbindSurface} (the host recreated the surface).
   */
  public BindSurface(_instance: TSurface): void {
    // default: a channel with no surface has nothing to bind
  }

  /**
   * Called by the host when the surface component is being destroyed (the channel left
   * the session / the overlay was torn down). Drop the instance reference and unsubscribe any
   * output subscriptions — after this, {@link ApplyAgentTool} runs in its no-surface
   * mode. Default: no-op.
   */
  public UnbindSurface(): void {
    // default: nothing to release
  }

  /**
   * Called by the host when the bound surface comes into sight or goes out of it (the panel collapsed or hidden,
   * another tab active, the call minimized). The surface stays bound and keeps its state; a channel can pause work
   * nobody sees, such as a screenshot poll, and resume it when the surface is shown again. The host calls it right
   * after {@link BindSurface} with the surface's current visibility, then on every change, and not after
   * {@link UnbindSurface}. Default: no-op, so a surface keeps running out of sight.
   */
  public OnSurfaceVisibilityChange(_visible: boolean): void {
    // default: nothing to pause
  }

  /**
   * Called by the host when the bound surface moves: to the stage (it fills the call), to its tab, or out of sight
   * because the user hid it. A channel can adapt its own chrome, such as a "Move to stage" button that has nothing to
   * do once the surface is on the stage. Called right after {@link BindSurface} with the current placement, then on
   * every move, and not after {@link UnbindSurface}. Default: no-op.
   */
  public OnSurfacePlacementChange(_placement: MediaPlacement): void {
    // default: a surface looks the same wherever it is placed
  }

  private surfacePlacement: ChannelSurfacePlacement = DEFAULT_CHANNEL_SURFACE_PLACEMENT;

  /**
   * Where this channel's surface shows when a call starts, and where the user may move it: from the channel's registry
   * row (`UIConfig.Placement` and `UIConfig.AllowedPlacements`). A channel without a row, or whose row says nothing,
   * starts on its tab and can go anywhere.
   */
  public get SurfacePlacement(): ChannelSurfacePlacement {
    return this.surfacePlacement;
  }

  /**
   * Sets {@link SurfacePlacement}. The runtime calls it with the registry row's placement when it builds the channel, before
   * the channel mounts, as it applies exposure policy with {@link ApplyExposure}.
   */
  public ApplySurfacePlacement(placement: ChannelSurfacePlacement): void {
    this.surfacePlacement = placement;
  }

  /**
   * Whether the user may share this channel's surface on its own: a host that offers it lists the surface, named by
   * {@link TabTitle} with {@link TabIcon}, under "This panel" in its Share menu while the surface is on screen, and the
   * share then shows only that surface. Default `false`, so a channel opts in with this getter. A surface that shows the
   * agent its own call (the camera, the screen share, the agent's video) never should.
   */
  public get SurfaceShareable(): boolean {
    return false;
  }

  /**
   * The runtime capture this channel fronts (`'camera'` or `'screen'`), or `null`. Such a channel is the capture's policy:
   * the runtime starts the capture only while the channel is in the session and the session's policy lets the agent see
   * pixels through it, and the user's "agent can see" choice for the channel decides whether the capture's frames reach
   * the model. Default `null`.
   */
  public get CaptureKind(): RealtimeCaptureKind | null {
    return null;
  }

  /**
   * Binds the host context and invokes the {@link OnInitialize} hook. Called exactly once
   * per session, right after ClassFactory instantiation and before any tool call or
   * surface bind.
   */
  public Initialize(ctx: RealtimeChannelContext): void {
    this.Context = ctx;
    this.OnInitialize();
  }

  /**
   * Subclass hook invoked from {@link Initialize} once {@link Context} is bound — wire
   * state-engine subscriptions (e.g. state change → `Context.RequestSave(...)`) here.
   * Default: no-op.
   */
  protected OnInitialize(): void {
    // default: nothing to initialize
  }

  /**
   * Subclass hook invoked once the realtime session is connected and live (the client driver
   * is created, connected, and media tracks negotiated). Channels that establish media bridges
   * (e.g. video streaming) can start them here when `Context.Client` is available.
   * Default: no-op.
   */
  public OnSessionStarted(): void {
    // A channel with visual perception brings its frame bridge up now: the video track is only
    // negotiated once the session connects, so this is the first moment it can be established.
    if (this.visualFrameProvider) {
      this.EnsureVideoBridge();
    }
  }

  /**
   * Max time {@link ResolveAgentSessionId} waits for the session id to bind before giving up, and the
   * poll interval it re-checks on. Protected so tests can shrink the wait; production keeps the
   * defaults (the real mint race is sub-second, 8s is generous headroom).
   */
  protected SessionIdWaitTimeoutMs = 8000;
  protected SessionIdWaitIntervalMs = 200;

  /**
   * Resolves the live {@link RealtimeChannelContext.AgentSessionID}, briefly WAITING for it when it
   * isn't bound yet rather than giving up instantly. `AgentSessionID` is a live getter over the
   * session service's current id: it reads `null` in the window BEFORE the session mints (the
   * realtime model can fire a tool call the very first beat it connects, before `mintSession`
   * resolves) and again AFTER teardown. Server-backed tool paths (e.g. the Remote Browser channel's
   * `browser_*` tools) call this instead of reading `Context?.AgentSessionID` synchronously, so a tool
   * invoked a beat early WAITS for the session to come live — defense-in-depth against the
   * "session id missing" race — instead of returning a hard failure to the model.
   *
   * Returns the id as soon as it's non-null (the common path resolves immediately, no delay), or
   * `null` if it's still unbound after {@link SessionIdWaitTimeoutMs} — or the channel was
   * {@link Dispose}d in the meantime (`Context` goes null, so we stop waiting on a torn-down session).
   */
  protected async ResolveAgentSessionId(): Promise<string | null> {
    const immediate = this.Context?.AgentSessionID ?? null;
    if (immediate) {
      return immediate;
    }
    const intervalMs = Math.max(1, this.SessionIdWaitIntervalMs);
    for (let waited = 0; waited < this.SessionIdWaitTimeoutMs; waited += intervalMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      // Context goes null on Dispose() — the session is gone, stop waiting.
      if (!this.Context) {
        return null;
      }
      const id = this.Context.AgentSessionID;
      if (id) {
        return id;
      }
    }
    return this.Context?.AgentSessionID ?? null;
  }

  /**
   * Serializes the channel's current state of record (the payload persisted on the
   * session's channel row), or `null` when the channel keeps no persistent state.
   * Default: `null`.
   */
  public SerializeState(): string | null {
    return null;
  }

  /**
   * Restores a PRIOR session's saved channel state (the payload a previous session
   * persisted via {@link SerializeState} / {@link RealtimeChannelContext.RequestSave}).
   * Invoked by the session host AFTER {@link Initialize} and BEFORE any surface binding,
   * when a prior session's saved state exists for this channel.
   *
   * Returns `true` when the state was applied; `false` when the channel ignored it —
   * either because it keeps no persistent state (this default) or because the payload was
   * malformed/incompatible. Implementations MUST be tolerant: never throw on bad input,
   * just return `false` and start fresh.
   */
  public RestoreState(stateJson: string): boolean {
    return false;
  }

  /**
   * The focus pill's "exit" affordance, routed by the overlay to the channel that holds
   * focus. Implementations should leave focus mode through their OWN surface (so surface
   * toggles stay in sync), ultimately emitting `Context.SetFocusMode(false)`. The overlay
   * defensively clears its layout flag as well, so a no-op default is safe.
   */
  public RequestFocusExit(): void {
    // default: the overlay's defensive clear handles it
  }

  /**
   * Media tracks this client channel can SOURCE — samples flowing into the model.
   * Default `[]`.
   */
  public GetSourcedTracks(): readonly RealtimeTrackDescriptor[] {
    // A channel that enabled visual perception sources the inbound video track the pump writes to — unless the
    // agent's policy has already ruled pixels out (the user's own toggle does not: a user who turns the agent's
    // view back on mid-call needs the track to exist). Not requesting video is also what keeps a session out of
    // the shorter session limits video carries.
    return this.visualFrameProvider && this.policyAllowsPixels() ? [CHANNEL_INBOUND_VIDEO_TRACK] : [];
  }

  /**
   * Media tracks this client channel can SINK — samples flowing from the model OUT.
   * Default `[]`.
   *
   * The session requests them when it connects, so the driver establishes the ones the model supports. A channel that
   * sinks outbound video shows the agent's video: it follows {@link RealtimeChannelContext.AgentVideo$}, and counts as
   * used once the video arrives, so the host shows its surface.
   */
  public GetSunkTracks(): readonly RealtimeTrackDescriptor[] {
    return [];
  }

  /**
   * Whether this channel shows the agent's video: it sinks outbound video ({@link GetSunkTracks}). The runtime marks it
   * as used when the video arrives, and a host presents its surface as the agent (the call overlay puts it in the agent's
   * place in the call rather than in the focus layout).
   */
  public get ShowsAgentVideo(): boolean {
    return this.GetSunkTracks().some((t) => t.Direction === 'outbound' && String(t.Modality).trim().toLowerCase() === 'video');
  }

  // ── Contract v2: descriptor, state, verbs, events, open/complete ───────────

  /**
   * The channel's stable primary-instance id. A single-instance channel has exactly one; a
   * {@link RealtimeChannelDescriptor.MultiInstance} channel owns further instance ids itself and
   * routes by the `instanceId` argument of {@link ApplyVerb}. Appears in every structured note
   * (`[channel:<Key>#<instance>] …`) and every {@link RealtimeChannelEvent}.
   */
  public get InstanceId(): string {
    return PRIMARY_CHANNEL_INSTANCE_ID;
  }

  /**
   * The channel's SELF-DESCRIPTION — what it is, what it holds, what it accepts, how it behaves in a
   * session. This is the contract an agent reads to operate a channel it has never seen, and what the
   * runtime reads to scope, advertise and validate. Pure data; called often, so keep it cheap.
   *
   * Default: a descriptor SYNTHESIZED from the v1 members (tools → verbs, intro → instructions),
   * stamped with the legacy contract version — so a channel that implements nothing new is still
   * describable and works exactly as before. A v2 channel overrides this with an authored descriptor.
   * (Build verbs from {@link GetToolDefinitions} with `BuildToolBackedVerbs` when they are the
   * native tools, so a subclass that adds a tool does not leave the descriptor lying.)
   */
  public GetDescriptor(): RealtimeChannelDescriptor {
    return SynthesizeChannelDescriptor(this);
  }

  /**
   * A snapshot of the channel's things (the descriptor's nouns), keyed by noun name. Perception notes
   * are computed as deltas between successive snapshots, so this must be a pure read.
   *
   * Default: the parsed {@link SerializeState} when that is a JSON object, else `{}` — which makes a
   * v1 channel's state of record its (single, opaque) snapshot with no code change.
   */
  public GetState(): JSONObject {
    const serialized = this.SerializeState();
    if (serialized === null) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(serialized);
      // JSON.parse output is JSON by construction, so narrowing it to JSONObject is not a type lie.
      return IsPlainObject(parsed) ? (parsed as JSONObject) : { state: parsed as JSONValue };
    } catch (error) {
      // A channel whose state of record is not JSON has no structured snapshot to offer; say so once
      // (this runs on every perception note) rather than silently presenting it as empty.
      this.warnStateIssueOnce(
        'unparseable-serialized-state',
        `SerializeState() did not return JSON, so GetState() reports an empty snapshot: ${error instanceof Error ? error.message : String(error)}`
      );
      return {};
    }
  }

  /**
   * Checks the current {@link GetState} snapshot against the descriptor's noun schemas and returns
   * every violation (empty when valid). Useful in a channel's own tests; the runtime also runs it on
   * every perception note when {@link StrictStateChecks} is on.
   */
  public ValidateState(): string[] {
    const state = this.GetState();
    const issues: string[] = [];
    for (const noun of this.GetDescriptor().Nouns) {
      if (noun.Name in state) {
        issues.push(...ValidateJsonAgainstSchemaSubset(state[noun.Name], noun.Schema, `$.${noun.Name}`));
      }
    }
    return issues;
  }

  /**
   * Whether state snapshots are validated against the descriptor's noun schemas as notes are built —
   * a development aid that surfaces a channel whose state drifted from its own declaration. On by
   * default only when a Node-style environment reports a non-production `NODE_ENV` (tests, tooling);
   * a browser production build never pays for it. Hosts may set it explicitly.
   */
  public static StrictStateChecks: boolean = isDevelopmentEnvironment();

  /**
   * Runs one verb of this channel — the contract-v2 entry point, reached through the `ContextTool`
   * proxy (and, via {@link ApplyAgentTool}, by native tool calls).
   *
   * The runtime has ALREADY resolved the verb against the descriptor, enforced `InvokableBy`, and
   * validated `args` against the verb's parameter schema before calling this, so an override can
   * trust its inputs' shape. It must work with no surface bound, and should not throw — return a
   * failure result so the model can recover.
   *
   * Default: adapts the legacy {@link ApplyAgentTool} (the verb's native tool name, args as JSON),
   * so every v1 channel is reachable through the proxy with no change. A v2 channel overrides this.
   *
   * @param verb The verb name (as declared in the descriptor).
   * @param args The validated parameters.
   * @param actor Who is acting: the agent (a model call) or the user (their own interaction).
   * @param instanceId Which instance of a multi-instance channel; `undefined` for the primary instance.
   */
  public ApplyVerb(
    verb: string,
    args: JSONObject,
    actor: RealtimeChannelActor,
    instanceId?: string
  ): RealtimeChannelVerbResult | Promise<RealtimeChannelVerbResult> {
    if (this.bridgingVerbAndNativeTool) {
      return { Success: false, ErrorCode: 'verb_failed', Error: this.implementsNeitherMessage() };
    }
    this.bridgingVerbAndNativeTool = true;
    let outcome: string | Promise<string>;
    try {
      outcome = this.ApplyAgentTool(this.ResolveNativeToolName(verb), JSON.stringify(args));
    } finally {
      this.bridgingVerbAndNativeTool = false;
    }
    return outcome instanceof Promise ? outcome.then(parseLegacyVerbResult) : parseLegacyVerbResult(outcome);
  }

  /**
   * Maps a native tool name back to its verb: the descriptor's `NativeToolName` match first, then the
   * name minus {@link ToolNamePrefix}. Protected so a channel with an unusual naming scheme can
   * override it.
   */
  protected ResolveVerbForTool(toolName: string): string {
    const declared = this.GetDescriptor().Verbs.find((v) => v.NativeToolName === toolName);
    if (declared) {
      return declared.Name;
    }
    const prefix = this.ToolNamePrefix;
    return prefix.length > 0 && toolName.length > prefix.length && toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName;
  }

  /** Maps a verb to the native tool name it is reachable as (inverse of {@link ResolveVerbForTool}). */
  protected ResolveNativeToolName(verb: string): string {
    const wanted = verb.trim().toLowerCase();
    const declared = this.GetDescriptor().Verbs.find((v) => v.Name.toLowerCase() === wanted);
    if (declared?.NativeToolName) {
      return declared.NativeToolName;
    }
    const prefix = this.ToolNamePrefix;
    return prefix.length > 0 && !verb.startsWith(prefix) ? `${prefix}${verb}` : verb;
  }

  /**
   * The descriptor verb a native tool call runs, or `undefined` when the tool is not one of the channel's verbs
   * (the runtime uses it to apply {@link RefuseVerbForExposure} on the native-tool route as well as the `ContextTool` one).
   *
   * @param toolName The native tool name the model called.
   */
  public FindVerbForNativeTool(toolName: string): RealtimeChannelVerb | undefined {
    const wanted = this.ResolveVerbForTool(toolName).toLowerCase();
    return this.GetDescriptor().Verbs.find((v) => v.Name.toLowerCase() === wanted);
  }

  /**
   * Whether the agent may be given this verb's result at the channel's current exposure. A verb that declares
   * `ReturnsChannelData` is refused whole when exposure is below that level, because its result would hand the agent
   * what the user or a zero-data-retention policy held back from it. Policy, not redaction: the result is never filtered.
   *
   * Applies to the AGENT (the dispatcher and the native-tool route call it); a user acting through the surface is not restricted.
   *
   * @param verb The verb the agent is calling.
   * @returns The sentence to give the agent, or `null` when the call may proceed.
   */
  public RefuseVerbForExposure(verb: Pick<RealtimeChannelVerb, 'Name' | 'ReturnsChannelData'>): string | null {
    const effective = this.Exposure;
    return IsVerbWithheld(verb, effective) ? DescribeWithheldVerb(verb.Name, this.GetDescriptor().DisplayName, effective, this.exposureReasons) : null;
  }

  /** Why a channel that overrides neither entry point cannot run anything. */
  private implementsNeitherMessage(): string {
    return `Channel '${this.ChannelName}' implements neither ApplyVerb nor ApplyAgentTool.`;
  }

  private readonly channelEventsSubject = new Subject<RealtimeChannelEvent>();
  private readonly channelOutputSubject = new Subject<RealtimeChannelOutput>();

  /**
   * Everything this channel streams out, as typed events: state changes, discrete user actions, frames
   * pushed, opened/completed. Hosts subscribe (the embeddable element re-emits these as DOM events);
   * the model is told about a change through a coalesced note instead — see {@link RecordChange}.
   * Completes at {@link Dispose}.
   */
  public readonly Events$: Observable<RealtimeChannelEvent> = this.channelEventsSubject.asObservable();

  /** What the channel handed back when it completed (see {@link Complete}). Completes at {@link Dispose}. */
  public readonly Output$: Observable<RealtimeChannelOutput> = this.channelOutputSubject.asObservable();

  /**
   * Opens the channel — mounts it for use and seeds it with `inputs`. Called by the runtime when the
   * agent (or user) opens an `on-demand` channel, after the channel has been initialized.
   *
   * Validates `inputs` against the descriptor's `Inputs` schema (a violation is a structured
   * `'invalid_params'` failure, never a half-opened channel), runs the {@link OnOpen} hook, then tells
   * the model the channel is open and what it currently holds (`opened` note with a state snapshot) —
   * and takes that snapshot as the baseline later changes are described against.
   *
   * @param inputs What the agent asked to seed the channel with.
   */
  public async Open(inputs: JSONObject = {}): Promise<RealtimeChannelVerbResult> {
    const descriptor = this.GetDescriptor();
    if (descriptor.Inputs) {
      const issues = ValidateJsonAgainstSchemaSubset(inputs, descriptor.Inputs);
      if (issues.length > 0) {
        return {
          Success: false,
          ErrorCode: 'invalid_params',
          Error: `The inputs for opening ${descriptor.Key} are invalid.`,
          Details: issues
        };
      }
    }
    const opened = await this.OnOpen(inputs);
    if (opened && !opened.Success) {
      return opened;
    }
    // A multi-instance channel names the instance it just created; every other channel has one id.
    const instanceId = opened?.Instance ?? this.InstanceId;
    this.EmitChannelEvent('opened', { inputs }, undefined, instanceId);
    if (this.Exposure === 'none') {
      // The agent opened it and may use it, but exposure policy keeps what it holds from the model.
      this.Context?.SendContextNote(FormatChannelNote(descriptor.Key, instanceId, 'opened', { exposure: 'none' }));
    } else {
      const state = this.GetState();
      this.ensurePerception().SetBaseline(state);
      this.Context?.SendContextNote(FormatChannelNote(descriptor.Key, instanceId, 'opened', { state }));
    }
    const extra = opened && IsPlainObject(opened.Result) ? (opened.Result as JSONObject) : {};
    return { Success: true, Result: { opened: true, channel: descriptor.Key, instance: instanceId, ...extra } };
  }

  /**
   * Subclass hook for {@link Open}: apply the (already validated) seed `inputs`. Return a failure
   * result to refuse the open; return nothing for success. Default: nothing to do.
   */
  protected OnOpen(_inputs: JSONObject): void | RealtimeChannelVerbResult | Promise<void | RealtimeChannelVerbResult> {
    // default: a channel with no seed data has nothing to apply
  }

  /**
   * The channel finished and is handing something back (a submitted form, a chosen option, a
   * finished game). Emits on {@link Output$} and {@link Events$} and tells the model with a
   * `completed` note. The output is validated against the descriptor's `Output` schema when
   * {@link StrictStateChecks} is on; a mismatch is logged, never swallowed into silence or thrown.
   *
   * @param output What the channel hands back.
   * @param instanceId The instance that completed, for a multi-instance channel (default: the primary instance).
   */
  public Complete(output: JSONObject, instanceId: string = this.InstanceId): void {
    const descriptor = this.GetDescriptor();
    if (descriptor.Output && BaseRealtimeChannelClient.StrictStateChecks) {
      const issues = ValidateJsonAgainstSchemaSubset(output, descriptor.Output, '$');
      if (issues.length > 0) {
        console.warn(`[RealtimeChannel:${descriptor.Key}] Complete() output does not match the descriptor's Output schema: ${issues.join('; ')}`);
      }
    }
    this.channelOutputSubject.next({ Channel: descriptor.Key, Instance: instanceId, Output: output, OccurredAt: Date.now() });
    this.EmitChannelEvent('completed', output, undefined, instanceId);
    // The output is what the channel holds (a submitted form, a chosen option): state exposure decides
    // whether the model is told it, or only that the channel finished.
    this.Context?.SendContextNote(
      FormatChannelNote(descriptor.Key, instanceId, 'completed', this.Exposure === 'none' ? { exposure: 'none' } : output)
    );
  }

  // ── Contract v2: change tracking + structured perception ───────────────────

  /** Monotonic id of the latest state change; tags state events and the frames that describe them. */
  private channelChangeSeq = 0;
  /** Re-entrancy guard for the default {@link ApplyVerb} ↔ {@link ApplyAgentTool} bridge. */
  private bridgingVerbAndNativeTool = false;
  private channelPerception: ChannelPerceptionCoalescer | null = null;
  /** Dev-check messages already logged, so a drifting state warns once, not on every note. */
  private readonly warnedStateIssueKeys = new Set<string>();

  /** Tuning for the perception coalescer (debounce window, max note size). Override to change it. */
  protected PerceptionOptions: ChannelPerceptionOptions = DEFAULT_CHANNEL_PERCEPTION_OPTIONS;

  /** The id of the latest state change (0 before any). */
  protected get CurrentChangeId(): number {
    return this.channelChangeSeq;
  }

  /**
   * Records that the channel's state changed. Call this on EVERY mutation, whoever caused it.
   *
   * It (1) assigns the change a monotonic id, (2) emits a `state_changed` event on {@link Events$}
   * immediately (observers see every change), and (3) — unless `Perceive` is `false` — schedules a
   * COALESCED structured note to the model: a burst of N changes inside the debounce window produces
   * ONE `[channel:<Key>#<instance>] state_changed {"changeId":…,"changes":N,"delta":{…}}` note carrying
   * what differs from what the model was last told (the first note is a full snapshot). Notes that
   * would be too large degrade to a list of changed paths.
   *
   * @param options `Author` — who made the change (carried on the event); `Perceive` — whether the
   *   model should be told (default `true`; a channel that already feeds the model its own perception
   *   — like the Whiteboard's scene deltas — passes `false`).
   * @returns The change's id.
   */
  protected RecordChange(options: { Author?: RealtimeChannelActor | 'system'; Perceive?: boolean } = {}): number {
    const id = ++this.channelChangeSeq;
    this.EmitChannelEvent('state_changed', options.Author ? { author: options.Author } : {}, id);
    // Observers of Events$ see every change; the MODEL is told only what exposure policy lets it perceive.
    if (options.Perceive !== false && this.Exposure !== 'none') {
      this.ensurePerception().Record(id);
    }
    return id;
  }

  /**
   * Emits a typed event on {@link Events$} (NOT to the model — use {@link RecordChange} for state the
   * model should perceive, or send an explicit note for a discrete event it must hear about).
   *
   * @param name The event name (declare it in the descriptor's `Events`).
   * @param payload The event payload.
   * @param changeId The change id the event relates to, when it relates to one.
   * @param instanceId The instance the event is about, for a multi-instance channel (default: the primary instance).
   */
  protected EmitChannelEvent(name: string, payload: JSONObject = {}, changeId?: number, instanceId: string = this.InstanceId): void {
    const event: RealtimeChannelEvent = {
      Channel: this.ChannelName,
      Instance: instanceId,
      Name: name,
      Payload: payload,
      OccurredAt: Date.now()
    };
    if (changeId !== undefined) {
      event.ChangeId = changeId;
    }
    this.channelEventsSubject.next(event);
  }

  /** Sends any pending coalesced perception note now (e.g. before a surface is torn down). */
  protected FlushPerception(): void {
    this.channelPerception?.Flush();
  }

  /** The perception coalescer, created on first use. */
  private ensurePerception(): ChannelPerceptionCoalescer {
    if (!this.channelPerception) {
      const channel = this;
      this.channelPerception = new ChannelPerceptionCoalescer(
        {
          get ChannelKey(): string {
            return channel.ChannelName;
          },
          get InstanceId(): string {
            return channel.InstanceId;
          },
          GetState: () => this.getStateChecked(),
          SendNote: (text: string) => this.Context?.SendContextNote(text),
          OnError: (error: unknown) => console.error(`[RealtimeChannel:${this.ChannelName}] Perception note failed:`, error)
        },
        this.PerceptionOptions
      );
    }
    return this.channelPerception;
  }

  /** {@link GetState}, with the development-time schema check applied when {@link StrictStateChecks} is on. */
  private getStateChecked(): JSONObject {
    const state = this.GetState();
    if (BaseRealtimeChannelClient.StrictStateChecks) {
      for (const issue of this.ValidateState()) {
        this.warnStateIssueOnce(issue, `State does not match its descriptor: ${issue}`);
      }
    }
    return state;
  }

  /** Logs a state problem once per channel instance — these checks run on every perception note. */
  private warnStateIssueOnce(key: string, message: string): void {
    if (this.warnedStateIssueKeys.has(key)) {
      return;
    }
    this.warnedStateIssueKeys.add(key);
    console.warn(`[RealtimeChannel:${this.ChannelName}] ${message}`);
  }

  // ── Contract v2: artifacts from delegated runs ─────────────────────────────

  /**
   * Whether this channel wants to be offered the artifacts a delegated run just produced (the agent asked
   * Skip or Sage to build something, and it came back as artifacts). A channel that hosts artifacts says yes
   * for the ones it can show — and for an artifact it ALREADY shows, so a newer version replaces it in place.
   *
   * Asked of every channel in the session, mounted or merely advertised. For an advertised channel it is
   * asked before the channel has been initialized, so it must not depend on {@link Context}; the channel's
   * resolved configuration is passed in for exactly that reason. Saying yes for an advertised channel
   * mounts it, so only answer yes when you will do something with the artifacts.
   *
   * Default: `false` — a channel that does not host artifacts is never bothered.
   *
   * @param artifacts What the delegated run produced.
   * @param config This channel's resolved configuration (host defaults beneath agent/app config).
   */
  public AcceptsDelegationArtifacts(_artifacts: readonly ParsedDelegationArtifact[], _config: JSONObject): boolean {
    return false;
  }

  /**
   * A delegated run produced artifacts this channel said it wants ({@link AcceptsDelegationArtifacts}). The
   * channel is mounted and initialized by now. Never throw into the runtime: handle your own failures and
   * report them (the runtime logs anything that escapes, but cannot recover the work).
   *
   * Default: nothing.
   *
   * @param artifacts What the delegated run produced.
   */
  public OnDelegationArtifacts(_artifacts: readonly ParsedDelegationArtifact[]): void | Promise<void> {
    // default: a channel that does not host artifacts ignores them
  }

  // ── Contract v2: exposure (how much of this channel the model may perceive) ──

  /** The exposure the SERVER's policy allows (agent cap, zero data retention); `undefined` until the runtime applies one. */
  private policyExposure: RealtimeChannelExposure | undefined;
  /** The user's own choice for this channel; `undefined` when they made none. */
  private userExposure: RealtimeChannelExposure | undefined;
  /** Why exposure is below the channel's ceiling, as sentences the agent can be told. */
  private exposureReasons: string[] = [];

  /**
   * How much of this channel the model may perceive without asking: the lowest of the channel's own ceiling
   * (`GetDescriptor().MaxExposure`), the server policy and the user's choice. A channel nobody has applied a
   * policy to simply has its ceiling, which is what every channel had before exposure policy existed.
   *
   * - `'none'`: no state notes and no frames.
   * - `'state'`: structured state notes; no frames.
   * - `'pixels'`: state notes and frames.
   *
   * It governs what flows to the model UNPROMPTED (perception notes, the contents of `opened` / `completed`
   * notes, frames). It does not REDACT what a verb's result contains: a verb is all-or-nothing. A verb whose
   * result would show the model something above this level declares `ReturnsChannelData` on the verb, and
   * when this level is below it the verb is refused whole (`exposure_restricted`) and listed to the model as
   * unavailable; see {@link RefuseVerbForExposure}. A verb that does not declare it returns what the channel
   * says it returns, so a channel whose verbs reveal sensitive data must either declare it or lower its own
   * `MaxExposure`.
   */
  public get Exposure(): RealtimeChannelExposure {
    return MinExposure(this.GetDescriptor().MaxExposure, this.policyExposure, this.userExposure);
  }

  /** Why {@link Exposure} is below the channel's ceiling; empty when it is not. */
  public get ExposureReasons(): readonly string[] {
    return this.exposureReasons;
  }

  /**
   * Whether the server policy (not the user) leaves room for pixels. Deliberately does not consult the
   * descriptor: a synthesized descriptor derives its `MaxExposure` from {@link GetSourcedTracks}, which asks
   * this, so reading it here would recurse. A channel that enabled visual perception has declared pixels.
   */
  private policyAllowsPixels(): boolean {
    return this.policyExposure === undefined || this.policyExposure === 'pixels';
  }

  /**
   * Applies exposure policy: the server's decision and the user's own choice. The runtime calls this when
   * it mounts the channel and again whenever the user changes their choice.
   *
   * Withdrawing exposure takes effect immediately: a pending perception note is dropped, a pending frame
   * is dropped, and the channel's video source stops being forwarded. Restoring it re-baselines (the
   * model's picture of the channel is stale, so the next note is a full snapshot) and sends a fresh frame.
   * When the call is live the model is told about the change, with the reason, so it never assumes it
   * can still see what it can't.
   *
   * @param settings `Policy` — the server-decided exposure; `User` — the user's choice (omit for none);
   *   `Reasons` — why the policy lowered it, from the server's limits.
   */
  public ApplyExposure(settings: ChannelExposureSettings): void {
    const previous = this.Exposure;
    this.policyExposure = settings.Policy;
    this.userExposure = settings.User;
    this.exposureReasons = [...(settings.Reasons ?? [])];
    const next = this.Exposure;
    if (previous === next) {
      return;
    }
    this.applyExposureEffects(previous, next);
    this.announceExposureChange(previous, next);
  }

  /** Makes a change in exposure real: stops what is no longer allowed, restarts what is again. */
  private applyExposureEffects(previous: RealtimeChannelExposure, next: RealtimeChannelExposure): void {
    const hadState = CompareExposure(previous, 'state') >= 0;
    const hasState = CompareExposure(next, 'state') >= 0;
    if (hadState && !hasState) {
      this.channelPerception?.CancelPending();
    } else if (!hadState && hasState) {
      // The model's picture of this channel went stale while it could not see it.
      this.channelPerception?.ResetBaseline();
      if (this.Context?.Client) {
        this.ensurePerception().Record(this.channelChangeSeq);
      }
    }
    const hadPixels = previous === 'pixels';
    const hasPixels = next === 'pixels';
    this.VisualVideoBridge?.SetSourceEnabled?.(hasPixels, false);
    if (hadPixels && !hasPixels) {
      this.visualFramePump?.CancelPending();
    } else if (!hadPixels && hasPixels) {
      void this.NotifyVisualChange();
    }
  }

  /** Emits the change on {@link Events$} and, when the call is live, tells the model what it can now perceive and why. */
  private announceExposureChange(previous: RealtimeChannelExposure, next: RealtimeChannelExposure): void {
    const ceiling = this.GetDescriptor().MaxExposure;
    const limit = DescribeExposureLimit(next, ceiling, this.exposureReasons);
    const payload: JSONObject = { exposure: next, was: previous };
    if (limit) {
      payload['limit'] = limit;
    }
    const unavailable = WithheldVerbs(this.GetDescriptor().Verbs, next).map((v) => v.Name);
    if (unavailable.length > 0) {
      payload['unavailableActions'] = unavailable;
    }
    this.EmitChannelEvent('exposure_changed', payload);
    if (this.Context?.Client) {
      this.Context.SendContextNote(FormatChannelNote(this.ChannelName, this.InstanceId, 'exposure_changed', payload));
    }
  }

  // ── Contract v2: visual perception (the change-driven frame pump) ──────────

  /** The frame source the visual pump captures from, once {@link EnableVisualPerception} ran. */
  private visualFrameProvider: IChannelFrameProvider | null = null;
  private visualPerceptionOptions: VisualPerceptionOptions = {};
  private visualFramePump: VisualPerceptionPump | null = null;
  /**
   * The shared frame bridge that carries frames to the model's inbound video track. Deliberately NOT named
   * `videoBridge`: channels that predate the pump (the Remote Browser, app channels) declare their own
   * private `videoBridge`, and a second private of the same name in the base class would stop them compiling.
   */
  protected VisualVideoBridge: ChannelInboundVideoBridge | null = null;

  /** Default frame cadence when the track negotiated none (1 fps — the Gemini Live ceiling). */
  private static readonly DEFAULT_VISUAL_CADENCE_MS = 1000;
  /** Floor for the negotiated cadence (4 fps) so a fast model never makes a channel spin. */
  private static readonly MIN_VISUAL_CADENCE_MS = 250;

  /**
   * Opts this channel into VISUAL perception: its surface can be shown to a video-capable model as
   * frames. Call it from {@link OnInitialize} with the channel's frame source.
   *
   * The channel then needs only to say *when* its picture changed — {@link NotifyVisualChange} after a
   * user edit, {@link ConfirmVisualChange} after a successful agent edit — and the base class does the
   * rest: change-driven (no idle heartbeat), paced to the negotiated cadence, a trailing settle so the
   * model ends on the final state of a burst, dedupe of identical frames, and a single confirmation
   * frame (with a "do not narrate" note) after an agent edit. Every frame is tagged with the change id
   * of the state it was captured at (`frame_pushed` events), so state and pixels can be cross-checked.
   *
   * Also makes {@link GetSourcedTracks} report the inbound video track, which is what gets it
   * negotiated. Idempotent: calling it again replaces the provider and options.
   *
   * @param provider Renders the channel's current picture as a base64 JPEG (or `null`).
   * @param options See {@link VisualPerceptionOptions}.
   */
  protected EnableVisualPerception(provider: IChannelFrameProvider, options: VisualPerceptionOptions = {}): void {
    this.visualFrameProvider = provider;
    this.visualPerceptionOptions = options;
    if (this.visualFramePump) {
      this.visualFramePump.CancelPending();
    } else {
      this.visualFramePump = this.createVisualPump(provider);
    }
    this.EnsureVideoBridge();
  }

  /**
   * The channel's picture changed because of a USER action (or a scene replacement): push a frame,
   * respecting the cadence. Resolves when the decision has been carried out; never rejects. A no-op
   * until {@link EnableVisualPerception} ran and the session has an inbound video track.
   */
  protected NotifyVisualChange(): Promise<void> {
    return this.visualFramePump ? this.visualFramePump.OnChange() : Promise.resolve();
  }

  /**
   * An AGENT action succeeded and changed the channel's picture: push exactly one confirmation frame
   * now and tell the model not to narrate its own change. Call only on SUCCESS — confirming a failed
   * action would assert an edit landed that did not. A no-op until {@link EnableVisualPerception} ran.
   */
  protected ConfirmVisualChange(): Promise<void> {
    return this.visualFramePump ? this.visualFramePump.Confirm() : Promise.resolve();
  }

  /**
   * Returns the shared frame bridge, creating it if needed and (only when the channel opted into the
   * legacy poller) starting its fixed-rate poll once the video track is up. `null` when no context is bound.
   */
  protected EnsureVideoBridge(): ChannelInboundVideoBridge | null {
    if (!this.VisualVideoBridge && this.Context && this.visualFrameProvider) {
      // The channel registers as a SOURCE with the session's video arbiter (the single writer of inbound
      // video) rather than writing to the model itself, so when several sources are live the arbiter decides
      // which one the model sees and tells it. The id and label are how the "agent can see" UI names it.
      const descriptor = this.GetDescriptor();
      this.VisualVideoBridge = new ChannelInboundVideoBridge(() => this.Context?.Client, this.visualFrameProvider, {
        SourceID: `${descriptor.Key}#${this.InstanceId}`,
        Label: descriptor.DisplayName,
        Kind: 'surface',
        ChannelKey: descriptor.Key,
      });
      if (this.Exposure !== 'pixels') {
        this.VisualVideoBridge.SetSourceEnabled?.(false, false);
      }
    }
    // List the source with the arbiter as soon as the video track is up, so the user can see and switch it
    // before it has sent a frame (a source switched off never sends one, and would otherwise be unlistable).
    // (Optional call: channels' tests install minimal bridge stubs that predate source registration, as with Start below.)
    this.VisualVideoBridge?.Register?.();
    if (
      this.visualPerceptionOptions.StartBridgePoller &&
      this.VisualVideoBridge &&
      !this.VisualVideoBridge.IsActive &&
      this.Context?.Client?.IsTrackEstablished('video', 'inbound')
    ) {
      this.VisualVideoBridge.Start?.();
    }
    return this.VisualVideoBridge;
  }

  /** Builds the pump, wiring it to this channel's context, bridge and event stream. */
  private createVisualPump(provider: IChannelFrameProvider): VisualPerceptionPump {
    return new VisualPerceptionPump({
      GetSink: () => this.EnsureVideoBridge(),
      IsInboundVideoEstablished: () => this.Context?.Client?.IsTrackEstablished('video', 'inbound') ?? false,
      IsPermitted: () => this.Exposure === 'pixels',
      GetCadenceMs: () => this.getNegotiatedVisualCadenceMs(),
      CaptureFrame: async () => provider.GetLatestFrame(),
      GetChangeId: () => this.channelChangeSeq,
      OnFramePushed: (frame: string, reason: VisualFrameReason, changeId: number) =>
        this.EmitChannelEvent('frame_pushed', { reason, bytes: frame.length }, changeId),
      SendConfirmationNote: (changeId: number) => this.Context?.SendContextNote(this.confirmationNote(changeId)),
      OnError: (context: string, error: unknown) =>
        console.error(`[RealtimeChannel:${this.ChannelName}] Error in the visual ${context} path:`, error)
    });
  }

  /** The "do not narrate your own change" note sent with a confirmation frame. */
  private confirmationNote(changeId: number): string {
    const configured = this.visualPerceptionOptions.ConfirmationNote;
    if (typeof configured === 'string') {
      return configured;
    }
    if (typeof configured === 'function') {
      return configured(changeId);
    }
    return FormatChannelNote(this.ChannelName, this.InstanceId, 'frame_confirmed', {
      changeId,
      guidance: 'visual confirmation of your action (background — do NOT narrate or announce your own change; continue naturally)'
    });
  }

  /**
   * The frame cadence in ms: the rate the inbound video track negotiated (`1000 / Rate`), clamped to
   * a 250ms floor; 1000ms when nothing was negotiated.
   */
  private getNegotiatedVisualCadenceMs(): number {
    const tracks = this.Context?.Client?.EstablishedTracks;
    const rate = tracks?.find((t) => t.Descriptor.Modality === 'video' && t.Descriptor.Direction === 'inbound')?.Descriptor.Rate;
    if (typeof rate === 'number' && rate > 0) {
      return Math.max(BaseRealtimeChannelClient.MIN_VISUAL_CADENCE_MS, Math.floor(1000 / rate));
    }
    return BaseRealtimeChannelClient.DEFAULT_VISUAL_CADENCE_MS;
  }

  /**
   * Tears the plugin down at session end: release the surface binding, unsubscribe
   * state-engine subscriptions, then drop the context. Subclasses overriding this MUST
   * call `super.Dispose()`. Any final state save has already been flushed by the host
   * (the debounced {@link RealtimeChannelContext.RequestSave} pipeline) before disposal.
   */
  public Dispose(): void {
    this.UnbindSurface();
    this.channelPerception?.Dispose();
    this.channelPerception = null;
    this.visualFramePump?.Dispose();
    this.visualFramePump = null;
    this.VisualVideoBridge?.Stop();
    this.VisualVideoBridge = null;
    this.channelEventsSubject.complete();
    this.channelOutputSubject.complete();
    this.Context = null;
  }
}

/** The primary instance id of a single-instance channel. */
const PRIMARY_CHANNEL_INSTANCE_ID = '1';

/**
 * Settings for {@link BaseRealtimeChannelClient.ApplyExposure}.
 */
export interface ChannelExposureSettings {
  /** The exposure the server's policy allows (agent cap and zero-data-retention requirement). Omit when no server policy applies. */
  Policy?: RealtimeChannelExposure;
  /** The user's own choice for this channel. Omit when they made none. */
  User?: RealtimeChannelExposure;
  /** Why the policy lowered exposure, as sentences the agent can be told. */
  Reasons?: readonly string[];
}

/**
 * Options for {@link BaseRealtimeChannelClient.EnableVisualPerception}.
 */
export interface VisualPerceptionOptions {
  /**
   * The note sent after a confirmation frame — a literal string, or a function of the change id.
   * Default: a structured `frame_confirmed` note carrying a do-not-narrate instruction. The Whiteboard
   * passes its original wording to stay byte-for-byte what it was.
   */
  ConfirmationNote?: string | ((changeId: number) => string);
  /**
   * Also start the shared bridge's fixed-rate poller (1 fps) once the video track is up.
   *
   * Default `false`: the pump is purely change-driven. This exists ONLY so the Whiteboard keeps the
   * behavior it had before the pump was lifted: it has always started the bridge's poller (which
   * re-sends the board every second regardless of change) despite its own comments and design
   * stating it is heartbeat-free. Nothing new should set this.
   */
  StartBridgePoller?: boolean;
}

/** True when a Node-style environment reports a non-production `NODE_ENV` (never in a plain browser). */
function isDevelopmentEnvironment(): boolean {
  return typeof process !== 'undefined' && !!process.env && process.env['NODE_ENV'] !== undefined && process.env['NODE_ENV'] !== 'production';
}

/** Tolerantly parses native tool arguments into a plain object (`{}` for anything else). */
function parseToolArguments(argsJson: string): JSONObject {
  try {
    const parsed: unknown = argsJson ? JSON.parse(argsJson) : {};
    // JSON.parse output is JSON by construction, so narrowing it to JSONObject is not a type lie.
    return IsPlainObject(parsed) ? (parsed as JSONObject) : {};
  } catch {
    return {};
  }
}

/** Serializes a structured verb result for the native tool path (the model reads this JSON). */
function serializeVerbResult(result: RealtimeChannelVerbResult): string {
  if (result.Success) {
    return JSON.stringify(result.Result === undefined ? { success: true } : { success: true, result: result.Result });
  }
  const failure: JSONObject = { success: false, error: result.Error ?? 'The action could not be performed.' };
  if (result.ErrorCode) {
    failure['errorCode'] = result.ErrorCode;
  }
  if (result.Details) {
    failure['details'] = result.Details;
  }
  return JSON.stringify(failure);
}

/**
 * Adapts a legacy tool result string to a structured {@link RealtimeChannelVerbResult}: a JSON object
 * with `success: false` is a failure (its `error`/`output`/`message` becomes the message); any other
 * JSON is the result; a non-JSON string is the result as text.
 */
function parseLegacyVerbResult(resultJson: string): RealtimeChannelVerbResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultJson);
  } catch {
    return { Success: true, Result: resultJson };
  }
  if (IsPlainObject(parsed) && parsed['success'] === false) {
    const message = [parsed['error'], parsed['output'], parsed['message']].find((m): m is string => typeof m === 'string' && m.length > 0);
    return { Success: false, ErrorCode: 'verb_failed', Error: message ?? 'The action could not be performed.', Result: parsed as JSONObject };
  }
  // JSON.parse output is JSON by construction, so narrowing it to JSONValue is not a type lie.
  return { Success: true, Result: parsed as JSONValue };
}
