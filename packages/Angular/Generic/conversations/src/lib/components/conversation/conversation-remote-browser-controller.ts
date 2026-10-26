import { Subscription } from 'rxjs';
import { JSONObject, JSONValue } from '@memberjunction/ai';
import { ClientToolMetadata } from '@memberjunction/ai-core-plus';
import { UUIDsEqual } from '@memberjunction/global';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import { RealtimeChannelContext } from '@memberjunction/realtime-runtime';
import { RemoteBrowserChannel } from '../realtime/remote-browser/remote-browser-channel';
import { RemoteBrowserSurfaceComponent } from '../realtime/remote-browser/remote-browser-surface.component';
import { REMOTE_BROWSER_TOOL_DEFINITIONS, REMOTE_BROWSER_TOOL_NAMES } from '../realtime/remote-browser/remote-browser-tools';

/** What a text agent is told about the conversation's browser, as `appContext.AdditionalContext.RemoteBrowser`. */
export interface ConversationRemoteBrowserContextSnapshot {
  Open: boolean;
  CurrentUrl: string | null;
}

/**
 * Options for constructing a {@link ConversationRemoteBrowserController}.
 */
export interface ConversationRemoteBrowserControllerOptions {
  /** Invoked when an agent's `browser_*` tool runs, so the UI can show the browser drawer. */
  OnAutoOpenSurface?: () => void;
  /** Invoked when the browser opens or closes, or its URL changes. */
  OnStateChange?: () => void;
  /** Optional custom GraphQL executor (used by unit tests; defaults to the provider's `ExecuteGQL`). */
  ExecuteServerAction?: <T>(query: string, variables: Record<string, JSONValue>) => Promise<T | null>;
}

const END_REMOTE_BROWSER_SESSION_MUTATION = `
  mutation EndRemoteBrowserSession($agentSessionID: String!) {
    EndRemoteBrowserSession(agentSessionID: $agentSessionID)
  }
`;

/** The `browser_*` tools in the shape an agent run reads from `appContext.Capabilities.Tools`. */
const BROWSER_TOOL_METADATA: ClientToolMetadata[] = REMOTE_BROWSER_TOOL_DEFINITIONS.map((def) => ({
  Name: def.Name,
  Description: def.Description,
  InputSchema: (def.ParametersSchema ?? {}) as Record<string, unknown>,
}));

type ClientToolHandler = ReturnType<AgentClientService['GetRegisteredTools']>[number]['Handler'];

/**
 * Gives one text conversation (`MJ: Conversations`) a live Remote Browser its agents can drive.
 *
 * The browser belongs to the conversation that opened it ({@link Open}); the controller captures that
 * ID, so a later conversation switch still stops and ends the right browser ({@link Close}).
 *
 * Agents reach the browser through the `browser_*` client tools. Their handlers live in
 * `AgentClientService`, whose registry is app-wide, so they are registered only while this
 * controller's browser is open, and removed on close only if this controller still owns them (a chat
 * area that opened a browser later takes them over). The tools are advertised to this conversation's
 * agent runs alone, through `appContext.Capabilities.Tools` ({@link WithBrowserContext}).
 */
export class ConversationRemoteBrowserController {
  private readonly channel = new RemoteBrowserChannel();
  private readonly options: ConversationRemoteBrowserControllerOptions;
  private readonly handlers = new Map<string, ClientToolHandler>();
  private agentClient: AgentClientService | null = null;
  private provider: GraphQLDataProvider | null = null;
  private pushSub: Subscription | null = null;
  private conversationId: string | null = null;
  private currentUrl: string | null = null;
  private stateVersion = 0;
  private disposed = false;

  constructor(options: ConversationRemoteBrowserControllerOptions = {}) {
    this.options = options;
    this.channel.Initialize(this.createChannelContext());
  }

  /** The underlying {@link RemoteBrowserChannel} instance driving the server browser. */
  public get Channel(): RemoteBrowserChannel {
    return this.channel;
  }

  /** The conversation whose browser is open, or `null` when none is. */
  public get ConversationId(): string | null {
    return this.conversationId;
  }

  /** The browser's last known URL. */
  public get CurrentUrl(): string | null {
    return this.currentUrl;
  }

  /** Bumps on every open, close and URL change, so a host can cache what it derives from the state. */
  public get StateVersion(): number {
    return this.stateVersion;
  }

  /** Whether the app-wide registry holds THIS controller's `browser_*` handlers. */
  public get OwnsTools(): boolean {
    const registered = this.agentClient?.GetRegisteredTools() ?? [];
    return this.handlers.size > 0 && Array.from(this.handlers).every(([name, handler]) => registered.find((t) => t.Name === name)?.Handler === handler);
  }

  /** Connects the controller to the agent client (tool dispatch) and the provider (server calls, pushed frames). */
  public Initialize(agentClient: AgentClientService, provider: GraphQLDataProvider | null): void {
    this.agentClient = agentClient;
    this.provider = provider;
    this.pushSub?.unsubscribe();
    this.pushSub = provider?.PushStatusUpdates().subscribe((raw: string) => this.HandlePushMessage(raw)) ?? null;
  }

  /**
   * Opens the browser for `conversationId` and claims the `browser_*` tools. A browser this controller
   * held for a different conversation is ended first.
   */
  public Open(conversationId: string): void {
    if (this.conversationId && UUIDsEqual(this.conversationId, conversationId)) {
      this.registerBrowserTools();
      return;
    }
    void this.Close();
    this.conversationId = conversationId;
    this.registerBrowserTools();
    this.changed();
  }

  /**
   * Ends the conversation's browser: stops its streams, gives up the tools this controller still owns,
   * and ends the server browser so no Chromium process (or billed hosted browser) is left running.
   */
  public async Close(): Promise<void> {
    const conversationId = this.conversationId;
    if (!conversationId) {
      return;
    }
    // Unbinding reads the session ID synchronously, so it must run before the ID is cleared.
    this.channel.UnbindSurface();
    this.unregisterBrowserTools();
    this.conversationId = null;
    this.currentUrl = null;
    this.changed();
    await this.executeServerAction(END_REMOTE_BROWSER_SESSION_MUTATION, { agentSessionID: conversationId });
  }

  /** Binds the drawer's live surface (starts the screencast, audio and human takeover). */
  public BindSurface(surface: RemoteBrowserSurfaceComponent): void {
    this.channel.BindSurface(surface);
    if (this.currentUrl) {
      surface.SetCurrentUrl(this.currentUrl);
    }
  }

  /** Unbinds the surface when the drawer is hidden; the browser itself stays open. */
  public UnbindSurface(): void {
    this.channel.UnbindSurface();
  }

  /** Navigates the browser, e.g. from the drawer's URL bar. */
  public async Navigate(url: string): Promise<void> {
    await this.ExecuteBrowserTool(REMOTE_BROWSER_TOOL_NAMES.OpenUrl, { url });
  }

  /** Runs one `browser_*` tool against this conversation's browser. */
  public async ExecuteBrowserTool(toolName: string, params: Record<string, unknown>): Promise<{ Success: boolean; Data?: JSONValue; ErrorMessage?: string }> {
    if (!this.conversationId) {
      return { Success: false, ErrorMessage: 'No browser is open for this conversation.' };
    }
    this.options.OnAutoOpenSurface?.();
    const raw = await this.channel.ApplyAgentTool(toolName, JSON.stringify(params ?? {}));
    let result: { success?: boolean; currentUrl?: string; detail?: string; error?: string };
    try {
      result = JSON.parse(raw);
    } catch {
      return { Success: true, Data: { raw } };
    }
    this.setUrl(result.currentUrl);
    return result.success === false
      ? { Success: false, Data: result as JSONObject, ErrorMessage: result.error ?? result.detail ?? 'Browser tool execution failed.' }
      : { Success: true, Data: result as JSONObject };
  }

  /** What the agent is told about the browser. */
  public GetAppContextSnapshot(): ConversationRemoteBrowserContextSnapshot {
    return { Open: this.conversationId !== null, CurrentUrl: this.currentUrl };
  }

  /**
   * Adds the browser to an app context while it is open: its state under
   * `AdditionalContext.RemoteBrowser`, and, while this controller owns them, the `browser_*` tools
   * under `Capabilities.Tools`, the tier an agent run reads a surface's tools from. Returns `base`
   * unchanged while no browser is open.
   */
  public WithBrowserContext(base: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!this.conversationId) {
      return base;
    }
    const context = base ?? {};
    const additional = asRecord(context['AdditionalContext']);
    const capabilities = asRecord(context['Capabilities']);
    const tools = Array.isArray(capabilities['Tools']) ? (capabilities['Tools'] as ClientToolMetadata[]) : [];
    return {
      ...context,
      AdditionalContext: { ...additional, RemoteBrowser: this.GetAppContextSnapshot() },
      ...(this.OwnsTools ? { Capabilities: { ...capabilities, Tools: [...tools, ...BROWSER_TOOL_METADATA] } } : {}),
    };
  }

  /** Ends the browser and releases the tools, push subscription and channel. */
  public Dispose(): void {
    this.disposed = true;
    void this.Close();
    this.pushSub?.unsubscribe();
    this.pushSub = null;
    this.channel.Dispose();
  }

  /**
   * Routes a pushed `RemoteBrowserScreencastFrame` or `RemoteBrowserAudioChunk` to the channel when it
   * belongs to this controller's browser.
   */
  public HandlePushMessage(rawMessage: string): void {
    if (!this.conversationId || !rawMessage) {
      return;
    }
    let message: {
      resolver?: string;
      type?: string;
      agentSessionID?: string;
      currentUrl?: string | null;
      dataBase64?: string;
      sampleRate?: number;
      channels?: number;
      seq?: number;
    };
    try {
      const outer = JSON.parse(rawMessage) as Record<string, unknown>;
      message = typeof outer['message'] === 'string' ? JSON.parse(outer['message']) : outer;
    } catch {
      return; // Not JSON: an unrelated status update.
    }
    if (message.resolver !== 'RemoteBrowserActionResolver' || !message.agentSessionID || !UUIDsEqual(message.agentSessionID, this.conversationId)) {
      return;
    }
    if (typeof message.dataBase64 !== 'string') {
      return;
    }
    if (message.type === 'RemoteBrowserScreencastFrame') {
      this.channel.OnScreencastFrame(message.dataBase64, message.currentUrl ?? null);
      this.setUrl(message.currentUrl);
    } else if (message.type === 'RemoteBrowserAudioChunk') {
      this.channel.OnAudioChunk({
        dataBase64: message.dataBase64,
        codec: 'webm-opus',
        sampleRate: message.sampleRate ?? 48000,
        channels: message.channels ?? 2,
        seq: message.seq ?? 0,
      });
    }
  }

  /** Records a new URL; frames repeat the same one, so only a real change notifies the host. */
  private setUrl(url: string | null | undefined): void {
    const next = url?.trim();
    if (next && next !== this.currentUrl) {
      this.currentUrl = next;
      this.changed();
    }
  }

  private changed(): void {
    this.stateVersion++;
    if (!this.disposed) {
      this.options.OnStateChange?.();
    }
  }

  private registerBrowserTools(): void {
    const agentClient = this.agentClient;
    if (!agentClient) {
      return;
    }
    for (const def of REMOTE_BROWSER_TOOL_DEFINITIONS) {
      let handler = this.handlers.get(def.Name);
      if (!handler) {
        handler = (params: Record<string, unknown>) => this.ExecuteBrowserTool(def.Name, params);
        this.handlers.set(def.Name, handler);
      }
      agentClient.RegisterTool({ Name: def.Name, Description: def.Description, ParameterSchema: (def.ParametersSchema ?? {}) as JSONObject, Handler: handler });
    }
    const sessionId = this.provider?.sessionId;
    if (sessionId && (!agentClient.IsActive || agentClient.SessionId !== sessionId)) {
      agentClient.StartSession(sessionId);
    }
  }

  private unregisterBrowserTools(): void {
    const registered = this.agentClient?.GetRegisteredTools() ?? [];
    for (const [name, handler] of this.handlers) {
      if (registered.find((t) => t.Name === name)?.Handler === handler) {
        this.agentClient?.UnregisterTool(name);
      }
    }
  }

  private async executeServerAction<T>(query: string, variables: Record<string, JSONValue>): Promise<T | null> {
    if (this.options.ExecuteServerAction) {
      return this.options.ExecuteServerAction<T>(query, variables);
    }
    if (!this.provider) {
      return null;
    }
    try {
      return ((await this.provider.ExecuteGQL(query, variables)) as T) ?? null;
    } catch (err) {
      console.warn('[ConversationRemoteBrowserController] GraphQL execution failed:', err);
      return null;
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
        return self.conversationId;
      },
      // The channel narrates page changes as notes; a text conversation only needs the URL out of them.
      SendContextNote: (text: string) => {
        const match = /^\[browser\] (?:current page|the page changed to): (\S+)/.exec(text);
        self.setUrl(match?.[1]);
      },
      RequestSave: () => undefined,
      SetFocusMode: () => undefined,
      SaveAsArtifact: async () => null,
      ExecuteServerAction: <T>(query: string, variables: Record<string, JSONValue>) => self.executeServerAction<T>(query, variables),
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
