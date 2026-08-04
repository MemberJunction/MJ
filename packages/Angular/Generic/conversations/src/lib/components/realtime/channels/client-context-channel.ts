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
import { RealtimeToolDefinition } from '@memberjunction/ai';
import { FormatAppContextNote } from '@memberjunction/ai-core-plus';
import { Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { BaseRealtimeChannelClient } from './base-realtime-channel-client';

/** The stable name of the single proxy tool this channel registers with the realtime provider. */
export const CONTEXT_TOOL_NAME = 'ContextTool';

/** The single stable proxy tool — declared once; the live catalog of valid `action`s rides context. */
const CONTEXT_TOOL_DEFINITION: RealtimeToolDefinition = {
  Name: CONTEXT_TOOL_NAME,
  Description:
    "Perform an action in the application the user is currently in. The set of valid actions (the " +
    "client tools and the things you can do on the current surface) is provided to you continuously " +
    "as context — only call actions listed as currently available. Pass the action name and its " +
    "parameters.",
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
   * Routes a `ContextTool({ action, params })` call to the host's registered surface client tool.
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

  /** Tolerantly parses the `{ action, params }` arguments. */
  private parseArgs(argsJson: string): { action: string | null; params: Record<string, unknown> } {
    try {
      const parsed = JSON.parse(argsJson) as { action?: unknown; params?: unknown };
      const action = typeof parsed.action === 'string' && parsed.action.trim().length > 0 ? parsed.action.trim() : null;
      const params =
        parsed.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params)
          ? (parsed.params as Record<string, unknown>)
          : {};
      return { action, params };
    } catch {
      return { action: null, params: {} };
    }
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
