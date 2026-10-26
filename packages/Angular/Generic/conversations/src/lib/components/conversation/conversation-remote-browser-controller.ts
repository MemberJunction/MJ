import { Subscription } from 'rxjs';
import { JSONObject, JSONValue } from '@memberjunction/ai';
import { UUIDsEqual } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import { ConversationsRuntime } from '@memberjunction/conversations-runtime';
import { RealtimeChannelContext } from '@memberjunction/realtime-runtime';
import { RemoteBrowserChannel } from '../realtime/remote-browser/remote-browser-channel';
import { RemoteBrowserSurfaceComponent } from '../realtime/remote-browser/remote-browser-surface.component';
import { REMOTE_BROWSER_TOOL_DEFINITIONS, REMOTE_BROWSER_TOOL_NAMES } from '../realtime/remote-browser/remote-browser-tools';
import { RemoteBrowserAudioChunkInput } from '../realtime/remote-browser/remote-browser-audio-player';

/**
 * Snapshot of the conversation's live Remote Browser state, injected into `appContext.remoteBrowser`
 * so turn-based text agents (Sage, Betty, etc.) know whether the browser drawer is open and what page
 * and elements are currently visible.
 */
export interface ConversationRemoteBrowserContextSnapshot {
  open: boolean;
  conversationId: string | null;
  currentUrl: string | null;
  lastDetail: string | null;
  lastObservation: JSONValue | null;
  lastFilled: JSONValue | null;
}

/**
 * Options for constructing a {@link ConversationRemoteBrowserController}.
 */
export interface ConversationRemoteBrowserControllerOptions {
  /** Returns the active conversation ID (used as the server-side `agentSessionID` scope). */
  GetConversationId: () => string | null;
  /** Returns whether the browser drawer is currently open in the UI. */
  IsSurfaceOpen: () => boolean;
  /** Invoked when a `browser_*` tool runs so the UI can automatically open the browser drawer. */
  OnAutoOpenSurface?: () => void;
  /** Invoked whenever browser state (`CurrentUrl`, `LastObservation`, etc.) changes. */
  OnStateChange?: () => void;
  /** Optional custom GraphQL executor (used by unit tests; defaults to `GraphQLDataProvider.ExecuteGQL`). */
  ExecuteServerAction?: <T>(query: string, variables: Record<string, JSONValue>) => Promise<T | null>;
}

/**
 * Bridges MemberJunction's {@link RemoteBrowserChannel} + {@link RemoteBrowserSurfaceComponent} to
 * turn-based text conversations (`MJ: Conversations`).
 *
 * Responsibilities:
 * 1. Registers all `browser_*` client tools (`REMOTE_BROWSER_TOOL_DEFINITIONS`) with both
 *    `AgentClientService` and `ConversationsRuntime.Instance.Tools` so any server-side agent in a
 *    standard text conversation can invoke `browser_OpenUrl`, `browser_Inspect`, `browser_Fill`,
 *    `browser_Click`, etc. via the `ClientToolRequest` pub/sub loop.
 * 2. Delegates tool execution and surface binding (`BindSurface` / `UnbindSurface`) to an internal
 *    {@link RemoteBrowserChannel} scoped to the active `ConversationId`.
 * 3. Subscribes to `GraphQLDataProvider.PushStatusUpdates()` to forward `RemoteBrowserScreencastFrame`
 *    and `RemoteBrowserAudioChunk` events for the active `ConversationId` to the channel's live canvas
 *    and audio player.
 * 4. Tracks structured observation state (`CurrentUrl`, `LastObservation`, `LastFilled`, `LastDetail`)
 *    for `appContext.remoteBrowser`.
 */
export class ConversationRemoteBrowserController {
  private readonly channel = new RemoteBrowserChannel();
  private readonly options: ConversationRemoteBrowserControllerOptions;
  private agentClient: AgentClientService | null = null;
  private provider: GraphQLDataProvider | null = null;
  private pushSub: Subscription | null = null;
  private currentUrl: string | null = null;
  private lastDetail: string | null = null;
  private lastObservation: JSONValue | null = null;
  private lastFilled: JSONValue | null = null;
  private registeredTools = false;

  constructor(options: ConversationRemoteBrowserControllerOptions) {
    this.options = options;
    this.channel.Initialize(this.createChannelContext());
  }

  /** The underlying {@link RemoteBrowserChannel} instance driving the server browser. */
  public get Channel(): RemoteBrowserChannel {
    return this.channel;
  }

  /** The last URL reported by the server browser or observed from a frame/snapshot. */
  public get CurrentUrl(): string | null {
    return this.currentUrl;
  }

  /** The last human-readable detail returned by a browser action. */
  public get LastDetail(): string | null {
    return this.lastDetail;
  }

  /** The most recent structured DOM observation returned by `browser_Inspect`. */
  public get LastObservation(): JSONValue | null {
    return this.lastObservation;
  }

  /** The most recent per-field verification array returned by `browser_Fill`. */
  public get LastFilled(): JSONValue | null {
    return this.lastFilled;
  }

  /**
   * Connects the controller to the Angular `AgentClientService` and `GraphQLDataProvider`,
   * registering all `browser_*` client tools and subscribing to server-pushed screencast frames.
   */
  public InitializeClientWiring(agentClient: AgentClientService, provider: GraphQLDataProvider | null): void {
    this.agentClient = agentClient;
    this.provider = provider;
    this.registerBrowserTools();
    this.subscribeToPushUpdates();
  }

  /**
   * Binds the live `<mj-realtime-remote-browser-surface>` component to the underlying channel,
   * starting screencast/audio streaming (with 700ms snapshot polling fallback) and human takeover.
   */
  public BindSurface(surface: RemoteBrowserSurfaceComponent): void {
    this.channel.BindSurface(surface);
    if (this.currentUrl) {
      surface.SetCurrentUrl(this.currentUrl);
    }
  }

  /** Unbinds the surface component when the browser drawer closes. */
  public UnbindSurface(): void {
    this.channel.UnbindSurface();
  }

  /** Updates visibility on the bound surface so snapshot polling pauses when hidden. */
  public SetSurfaceVisible(visible: boolean): void {
    this.channel.OnSurfaceVisibilityChange(visible);
  }

  /**
   * Navigates the conversation's remote browser directly (e.g., from a user URL bar or action)
   * and refreshes the DOM inspection state.
   */
  public async NavigateAndInspect(url: string): Promise<void> {
    await this.ExecuteBrowserTool(REMOTE_BROWSER_TOOL_NAMES.OpenUrl, { url });
    await this.ExecuteBrowserTool(REMOTE_BROWSER_TOOL_NAMES.Inspect, {});
  }

  /**
   * Executes a single `browser_*` tool against the active conversation's remote browser session.
   */
  public async ExecuteBrowserTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<{ Success: boolean; Data?: JSONValue; ErrorMessage?: string }> {
    this.options.OnAutoOpenSurface?.();
    const rawJson = await this.channel.ApplyAgentTool(toolName, JSON.stringify(params ?? {}));
    try {
      const parsed = JSON.parse(rawJson) as {
        success?: boolean;
        currentUrl?: string;
        detail?: string;
        observation?: JSONValue;
        filled?: JSONValue;
        error?: string;
      };
      if (typeof parsed.currentUrl === 'string' && parsed.currentUrl.trim().length > 0) {
        this.currentUrl = parsed.currentUrl.trim();
      }
      if (typeof parsed.detail === 'string' && parsed.detail.trim().length > 0) {
        this.lastDetail = parsed.detail.trim();
      }
      if (parsed.observation !== undefined) {
        this.lastObservation = parsed.observation;
      }
      if (parsed.filled !== undefined) {
        this.lastFilled = parsed.filled;
      }
      this.options.OnStateChange?.();
      if (parsed.success === false) {
        return {
          Success: false,
          Data: parsed as unknown as JSONValue,
          ErrorMessage: parsed.error ?? parsed.detail ?? 'Browser tool execution failed.',
        };
      }
      return {
        Success: true,
        Data: parsed as unknown as JSONValue,
      };
    } catch {
      return {
        Success: true,
        Data: { raw: rawJson },
      };
    }
  }

  /**
   * Returns a JSON-serializable snapshot of the conversation's Remote Browser state for `appContext`.
   */
  public GetAppContextSnapshot(): ConversationRemoteBrowserContextSnapshot {
    return {
      open: this.options.IsSurfaceOpen(),
      conversationId: this.options.GetConversationId(),
      currentUrl: this.currentUrl,
      lastDetail: this.lastDetail,
      lastObservation: this.lastObservation,
      lastFilled: this.lastFilled,
    };
  }

  /** Tears down tool registrations, push subscriptions, and the underlying channel. */
  public Dispose(): void {
    this.unregisterBrowserTools();
    this.pushSub?.unsubscribe();
    this.pushSub = null;
    this.channel.Dispose();
  }

  private registerBrowserTools(): void {
    if (this.registeredTools) {
      return;
    }
    this.registeredTools = true;
    const runtimeTools = ConversationsRuntime.Instance.Tools;

    for (const def of REMOTE_BROWSER_TOOL_DEFINITIONS) {
      const schema = (def.ParametersSchema ?? { type: 'object', properties: {} }) as JSONObject;
      const handler = async (params: Record<string, unknown>) => this.ExecuteBrowserTool(def.Name, params);

      this.agentClient?.RegisterTool({
        Name: def.Name,
        Description: def.Description,
        ParameterSchema: schema,
        Handler: handler,
      });

      if (runtimeTools.GetTool(def.Name)) {
        runtimeTools.Unregister(def.Name);
      }
      runtimeTools.Register({
        Name: def.Name,
        Description: def.Description,
        ParameterSchema: schema,
        Handler: handler,
      });
    }

    if (
      this.provider?.sessionId &&
      this.agentClient &&
      (!this.agentClient.IsActive || this.agentClient.SessionId !== this.provider.sessionId)
    ) {
      this.agentClient.StartSession(this.provider.sessionId);
    }
  }

  private unregisterBrowserTools(): void {
    if (!this.registeredTools) {
      return;
    }
    this.registeredTools = false;
    const runtimeTools = ConversationsRuntime.Instance.Tools;
    for (const def of REMOTE_BROWSER_TOOL_DEFINITIONS) {
      this.agentClient?.UnregisterTool(def.Name);
      runtimeTools.Unregister(def.Name);
    }
  }

  private subscribeToPushUpdates(): void {
    this.pushSub?.unsubscribe();
    this.pushSub = null;
    if (!this.provider) {
      return;
    }
    this.pushSub = this.provider.PushStatusUpdates().subscribe((rawStatus: string) => {
      if (!rawStatus) {
        return;
      }
      this.HandlePushMessage(rawStatus);
    });
  }

  /**
   * Routes a raw `PushStatusUpdates` JSON string for `RemoteBrowserScreencastFrame` or
   * `RemoteBrowserAudioChunk` when its `agentSessionID` matches the active conversation ID.
   */
  public HandlePushMessage(rawMessage: string): void {
    const activeConversationId = this.options.GetConversationId();
    if (!activeConversationId) {
      return;
    }
    try {
      const outer = JSON.parse(rawMessage) as Record<string, unknown>;
      const innerRaw = typeof outer['message'] === 'string' ? outer['message'] : rawMessage;
      const parsed = (typeof outer['message'] === 'string' ? JSON.parse(innerRaw) : outer) as {
        resolver?: string;
        type?: string;
        agentSessionID?: string;
        currentUrl?: string | null;
        dataBase64?: string;
        codec?: string;
        sampleRate?: number;
        channels?: number;
        seq?: number;
      };
      if (parsed.resolver !== 'RemoteBrowserActionResolver' || !parsed.agentSessionID) {
        return;
      }
      if (!UUIDsEqual(parsed.agentSessionID, activeConversationId)) {
        return;
      }
      if (parsed.type === 'RemoteBrowserScreencastFrame' && typeof parsed.dataBase64 === 'string') {
        if (typeof parsed.currentUrl === 'string' && parsed.currentUrl.trim().length > 0) {
          this.currentUrl = parsed.currentUrl.trim();
        }
        this.channel.OnScreencastFrame(parsed.dataBase64, parsed.currentUrl ?? null);
        this.options.OnStateChange?.();
      } else if (parsed.type === 'RemoteBrowserAudioChunk' && typeof parsed.dataBase64 === 'string') {
        const chunk: RemoteBrowserAudioChunkInput = {
          dataBase64: parsed.dataBase64,
          codec: parsed.codec === 'webm-opus' ? 'webm-opus' : 'webm-opus',
          sampleRate: typeof parsed.sampleRate === 'number' ? parsed.sampleRate : 48000,
          channels: typeof parsed.channels === 'number' ? parsed.channels : 2,
          seq: typeof parsed.seq === 'number' ? parsed.seq : 0,
        };
        this.channel.OnAudioChunk(chunk);
      }
    } catch {
      // Ignore non-JSON or unrelated status updates
    }
  }

  private createChannelContext(): RealtimeChannelContext {
    const self = this;
    return {
      AgentName: 'ConversationAgent',
      get Provider(): GraphQLDataProvider | null {
        return self.provider;
      },
      get AgentSessionID(): string | null {
        return self.options.GetConversationId();
      },
      SendContextNote: (text: string) => {
        const prefix = '[browser] current page: ';
        const changedPrefix = '[browser] the page changed to: ';
        if (text.startsWith(prefix)) {
          self.currentUrl = text.slice(prefix.length).trim();
          self.options.OnStateChange?.();
        } else if (text.startsWith(changedPrefix)) {
          const rest = text.slice(changedPrefix.length);
          const dashIdx = rest.indexOf(' — ');
          self.currentUrl = (dashIdx >= 0 ? rest.slice(0, dashIdx) : rest).trim();
          self.options.OnStateChange?.();
        }
      },
      RequestSave: () => undefined,
      SetFocusMode: () => undefined,
      SaveAsArtifact: async () => null,
      ExecuteServerAction: async <T>(query: string, variables: Record<string, JSONValue>): Promise<T | null> => {
        if (self.options.ExecuteServerAction) {
          return self.options.ExecuteServerAction<T>(query, variables);
        }
        if (!self.provider) {
          return null;
        }
        try {
          const result = await self.provider.ExecuteGQL(query, variables);
          return (result as T) ?? null;
        } catch (err) {
          console.warn('[ConversationRemoteBrowserController] GraphQL execution failed:', err);
          return null;
        }
      },
    };
  }
}
