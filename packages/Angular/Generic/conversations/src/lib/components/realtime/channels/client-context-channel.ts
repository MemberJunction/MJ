/**
 * @fileoverview The headless **Client Context** channel — the browser half of the live wire that
 * keeps the realtime co-agent continuously aware of the user's app context and lets it act in the
 * app through a single stable proxy tool.
 *
 * Paired with `ClientContextChannelServer` (`@memberjunction/ai-agents`) via the seeded
 * `MJ: AI Agent Channels` row (`Name: 'ClientContextChannel'`, `IsHeadless: 1`,
 * `ClientPluginClass: 'ClientContextChannel'`).
 *
 * Two responsibilities, both client-side (no server round-trip in the client-direct topology):
 *
 *  1. **Perception (streaming).** It subscribes to the host's live app-context stream
 *     ({@link RealtimeChannelContext.AppContext$}, fed by Explorer from `NavigationService`) and, on
 *     every change, pushes a compact `SendContextNote` so the model always knows where the user is,
 *     what they see, and which tools/agents are available — the *continuous* half of client-context
 *     delivery (the session-start half is injected into the companion prompt server-side at mint).
 *
 *  2. **Action (the `ContextTool` proxy).** It declares ONE stable tool, `ContextTool`, so the
 *     provider tool surface never changes mid-session (which connect-bound providers reject). The
 *     model invokes any currently-available surface client tool via `ContextTool({ action, params })`;
 *     the channel routes that to the host's {@link RealtimeChannelContext.ExecuteClientTool} (which runs
 *     the surface handler the host registered from `SetAgentClientTools`) and returns a structured
 *     result the model narrates.
 *
 * **Headless:** no surface component — it never mounts a tab (`GetSurfaceComponent` stays `null`;
 * `BindSurface` is a no-op). It is a wire, not a panel.
 *
 * @module @memberjunction/ng-conversations
 */
import { RegisterClass } from '@memberjunction/global';
import { JSONObject, RealtimeToolDefinition } from '@memberjunction/ai';
import { FormatAppContextNote, REALTIME_CHANNEL_CONTRACT_VERSION, type RealtimeChannelDescriptor } from '@memberjunction/ai-core-plus';
import { Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { BaseRealtimeChannelClient, type RealtimeContextActionResult } from '@memberjunction/realtime-runtime';

/** The stable name of the single proxy tool this channel registers with the realtime provider. */
export const CONTEXT_TOOL_NAME = 'ContextTool';

/** The single stable proxy tool — declared once; the live catalog of valid `action`s rides context. */
const CONTEXT_TOOL_DEFINITION: RealtimeToolDefinition = {
  Name: CONTEXT_TOOL_NAME,
  Description:
    "Perform an action in the application the user is currently in, or on one of the interactive " +
    "channels listed in your channel notes. The set of valid actions (the client tools and the things " +
    "you can do on the current surface) is provided to you continuously as context — only call actions " +
    "listed as currently available. Pass the action name and its parameters. To act on an interactive " +
    "channel instead of the app, also pass `target` naming the channel (and, for a channel that has " +
    "several, the instance); to open a channel that is available but not open yet, use action \"open\" " +
    "with that target.",
  ParametersSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'The name of a currently-available action/tool to run (from the context you were given).'
      },
      params: {
        type: 'object',
        description: "The action's parameters, matching its advertised input schema."
      },
      target: {
        type: 'object',
        description: 'Set this to act on an interactive channel rather than the app. Omit it for app actions.',
        properties: {
          channel: { type: 'string', description: 'The channel to address (from your channel notes).' },
          instance: { type: 'string', description: 'Which instance, for a channel that has several. Usually omitted.' }
        },
        required: ['channel']
      }
    },
    required: ['action']
  }
};

/**
 * The headless Client Context channel client. One instance per realtime session (created by the
 * session service from the `MJ: AI Agent Channels` registry — never construct directly).
 */
@RegisterClass(BaseRealtimeChannelClient, 'ClientContextChannel')
export class ClientContextChannel extends BaseRealtimeChannelClient<object> {
  /** Subscription to the host app-context stream (perception); cleared on {@link Dispose}. */
  private appContextSub: Subscription | null = null;

  /** Matches the seeded `MJ: AI Agent Channels` row's `Name`. */
  public get ChannelName(): string {
    return 'ClientContextChannel';
  }

  /** Routing prefix — the single `ContextTool` matches `ContextTool`.startsWith(prefix). */
  public get ToolNamePrefix(): string {
    return CONTEXT_TOOL_NAME;
  }

  /** Headless — never rendered, but the abstract contract requires a label/icon. */
  public get TabTitle(): string {
    return 'App Context';
  }
  public get TabIcon(): string {
    return 'fa-solid fa-satellite-dish';
  }

  /** Declares the single stable proxy tool. */
  public GetToolDefinitions(): RealtimeToolDefinition[] {
    return [CONTEXT_TOOL_DEFINITION];
  }

  /**
   * The channel's self-description. It has NO verbs of its own: it is the door, not a room — `ContextTool`
   * runs app client tools, or addresses another channel through `target`. Declaring that explicitly keeps
   * it from being addressed as if it were a channel with things to do.
   */
  public override GetDescriptor(): RealtimeChannelDescriptor {
    return {
      Key: this.ChannelName,
      Version: REALTIME_CHANNEL_CONTRACT_VERSION,
      DisplayName: this.TabTitle,
      Instructions:
        'Keeps you aware of where the user is in the app and lets you act there through ContextTool. ' +
        'It is not itself something to operate.',
      Nouns: [],
      Verbs: [],
      DisplayPolicy: 'headless',
      DefaultAvailability: 'all-sessions',
      MaxExposure: 'state'
    };
  }

  /**
   * Routes a `ContextTool({ action, params, target? })` call. With a `target` the call is handed to the
   * runtime, which validates it against the addressed channel's verb schema (a malformed call comes back
   * as a structured, model-recoverable error) and opens an `on-demand` channel when asked; without one it
   * runs the host's registered surface client tool, exactly as before.
   *
   * Tolerant: malformed args, a missing host executor, or an unknown/throwing tool all serialize to
   * a structured `{ success: false, output }` the model narrates (never throws).
   */
  public async ApplyAgentTool(toolName: string, argsJson: string): Promise<string> {
    if (toolName !== CONTEXT_TOOL_NAME) {
      return JSON.stringify({ success: false, output: `Unknown context tool "${toolName}".` });
    }
    const parsed = this.parseArgs(argsJson);
    if (!parsed.action) {
      return JSON.stringify({ success: false, output: 'ContextTool requires an "action" naming the tool to run.' });
    }
    if (parsed.target) {
      return this.applyChannelAction(parsed.action, parsed.params, parsed.target);
    }
    const executor = this.Context?.ExecuteClientTool;
    if (!executor) {
      return JSON.stringify({
        success: false,
        output: 'No app surface is available to perform that action right now.'
      });
    }
    const result = await executor(parsed.action, parsed.params);
    return result.Success
      ? JSON.stringify({ success: true, output: result.Result ?? 'Done.' })
      : JSON.stringify({ success: false, output: result.ErrorMessage ?? 'The action could not be performed.' });
  }

  /** Runs a channel-addressed call through the runtime and serializes its structured outcome. */
  private async applyChannelAction(
    action: string,
    params: Record<string, unknown>,
    target: { channel: string; instance?: string }
  ): Promise<string> {
    const dispatch = this.Context?.DispatchContextAction;
    if (!dispatch) {
      return JSON.stringify({ success: false, output: 'Channel actions are not available in this session.' });
    }
    // The params came off the wire as JSON, so they are JSON by construction.
    const outcome = await dispatch({ Target: { Channel: target.channel, Instance: target.instance }, Action: action, Params: params as JSONObject });
    return JSON.stringify(this.serializeDispatchOutcome(outcome));
  }

  /** The model-facing shape of a dispatch outcome: success carries the result; a refusal carries what to fix. */
  private serializeDispatchOutcome(outcome: RealtimeContextActionResult): Record<string, unknown> {
    if (outcome.Success) {
      return { success: true, output: outcome.Result ?? 'Done.' };
    }
    return {
      success: false,
      output: outcome.ErrorMessage ?? 'The action could not be performed.',
      errorCode: outcome.ErrorCode,
      ...(outcome.Details ? { details: outcome.Details } : {}),
      ...(outcome.Available ? { available: outcome.Available } : {})
    };
  }

  /** Headless — no surface to bind. */
  public BindSurface(): void {
    /* no-op: this channel renders no surface */
  }

  /**
   * Subscribes to the host's live app-context stream and streams each change to the model as a
   * compact context note (the perception half). Null-safe — hosts that supply no `AppContext$`
   * (custom apps) simply get no streaming, and the session-start prompt injection still applies.
   */
  protected override OnInitialize(): void {
    const stream = this.Context?.AppContext$;
    if (!stream) {
      return;
    }
    this.appContextSub = stream
      .pipe(distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)))
      .subscribe((snapshot) => {
        if (!snapshot) {
          return;
        }
        const note = FormatAppContextNote(snapshot);
        if (note) {
          this.Context?.SendContextNote(note);
        }
      });
  }

  /** Tolerantly parses the `{ action, params, target? }` arguments. */
  private parseArgs(argsJson: string): {
    action: string | null;
    params: Record<string, unknown>;
    target: { channel: string; instance?: string } | null;
  } {
    try {
      const parsed = JSON.parse(argsJson) as { action?: unknown; params?: unknown; target?: unknown };
      const action = typeof parsed.action === 'string' && parsed.action.trim().length > 0 ? parsed.action.trim() : null;
      const params =
        parsed.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params)
          ? (parsed.params as Record<string, unknown>)
          : {};
      return { action, params, target: this.parseTarget(parsed.target) };
    } catch {
      return { action: null, params: {}, target: null };
    }
  }

  /** Reads a `target` — `{ channel, instance? }` — or `null` when absent or unusable (the call is then an app action). */
  private parseTarget(raw: unknown): { channel: string; instance?: string } | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    const target = raw as { channel?: unknown; instance?: unknown };
    const channel = typeof target.channel === 'string' ? target.channel.trim() : '';
    if (channel.length === 0) {
      return null;
    }
    const instance = typeof target.instance === 'string' && target.instance.trim().length > 0 ? target.instance.trim() : undefined;
    return instance ? { channel, instance } : { channel };
  }

  /** Unsubscribes the app-context stream and tears down. */
  public override Dispose(): void {
    this.appContextSub?.unsubscribe();
    this.appContextSub = null;
    super.Dispose();
  }
}

/**
 * Tree-shaking prevention for {@link ClientContextChannel}'s `@RegisterClass` registration. Called
 * from a static code path in `conversations.module.ts` so the registration always executes —
 * mirroring every other realtime channel client.
 */
export function LoadClientContextChannel(): void {
  // no-op — the import + call create a static reference bundlers cannot eliminate
}
