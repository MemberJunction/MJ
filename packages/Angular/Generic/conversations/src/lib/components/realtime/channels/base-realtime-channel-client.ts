import type { Type } from '@angular/core';
import { IMetadataProvider } from '@memberjunction/core';
import { JSONValue, RealtimeToolDefinition } from '@memberjunction/ai';

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
   * collapses the main call column so the surface owns the screen, with a compact floating
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
 * {@link BindSurface}/{@link UnbindSurface} cycles (the surface pane is created/destroyed
 * with the overlay's tab panel, e.g. collapse/expand) → {@link Dispose} at teardown.
 * {@link ApplyAgentTool} MUST work with NO surface bound (apply to the state engine
 * directly; skip the UI garnish) — tool calls can arrive while the panel is collapsed.
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
   */
  public abstract get ToolNamePrefix(): string;

  /** Label for the channel's tab on the overlay's surface panel (e.g. `'Whiteboard'`). */
  public abstract get TabTitle(): string;

  /** Font Awesome icon class for the channel's tab (e.g. `'fa-solid fa-chalkboard'`). */
  public abstract get TabIcon(): string;

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
   */
  public abstract GetToolDefinitions(): RealtimeToolDefinition[];

  /**
   * Executes ONE agent tool call locally (the ACTION direction) and returns the result
   * JSON string fed back to the model as the `tool_response`. Called for every tool whose
   * name starts with {@link ToolNamePrefix}. Must work both WITH a bound surface (apply +
   * UI garnish) and WITHOUT one (apply to the state engine directly — the tab pane may not
   * exist, e.g. the surface panel is collapsed). Should not throw: return a
   * `{ success: false, error }` payload so the model can narrate the failure (the host
   * additionally wraps anything thrown).
   */
  public abstract ApplyAgentTool(toolName: string, argsJson: string): string | Promise<string>;

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
  public GetSurfaceComponent(): Type<TSurface> | null {
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
   * {@link UnbindSurface} (the pane is destroyed/recreated with the tab panel).
   */
  public abstract BindSurface(instance: TSurface): void;

  /**
   * Called by the host when the surface component is being destroyed (tab panel
   * collapsed / overlay torn down). Drop the instance reference and unsubscribe any
   * output subscriptions — after this, {@link ApplyAgentTool} runs in its no-surface
   * mode. Default: no-op.
   */
  public UnbindSurface(): void {
    // default: nothing to release
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
   * Tears the plugin down at session end: release the surface binding, unsubscribe
   * state-engine subscriptions, then drop the context. Subclasses overriding this MUST
   * call `super.Dispose()`. Any final state save has already been flushed by the host
   * (the debounced {@link RealtimeChannelContext.RequestSave} pipeline) before disposal.
   */
  public Dispose(): void {
    this.UnbindSurface();
    this.Context = null;
  }
}
