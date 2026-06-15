import type { Type } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { JSONValue, RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeChannelClient, ChannelOnboardingDetails } from '../channels/base-realtime-channel-client';
import { RemoteBrowserSnapshotView, RemoteBrowserSurfaceComponent } from './remote-browser-surface.component';
import {
  MapToolToAction, REMOTE_BROWSER_TOOL_DEFINITIONS, REMOTE_BROWSER_TOOL_PREFIX,
  RemoteBrowserAction, RemoteBrowserToolArgError
} from './remote-browser-tools';

/**
 * GraphQL mutation that drives the SERVER-hosted browser. The channel awaits it for every
 * `browser_*` tool call and feeds the result back to the model.
 */
const EXECUTE_REMOTE_BROWSER_ACTION_MUTATION = `
  mutation ExecuteRemoteBrowserAction(
    $agentSessionID: String!, $kind: String!, $url: String, $selector: String,
    $x: Float, $y: Float, $text: String, $key: String,
    $deltaX: Float, $deltaY: Float, $ms: Float
  ) {
    ExecuteRemoteBrowserAction(
      agentSessionID: $agentSessionID, kind: $kind, url: $url, selector: $selector,
      x: $x, y: $y, text: $text, key: $key,
      deltaX: $deltaX, deltaY: $deltaY, ms: $ms
    ) {
      Success
      CurrentUrl
      Detail
    }
  }
`;

/** The narrow projection of the `ExecuteRemoteBrowserAction` mutation payload the channel reads. */
interface ExecuteRemoteBrowserActionResult {
  ExecuteRemoteBrowserAction: {
    Success: boolean;
    CurrentUrl: string | null;
    Detail: string | null;
  } | null;
}

/**
 * GraphQL mutation that asks the server to start PUSHING live CDP screencast frames for the session.
 * Returns `Streaming: true` when the backend supports `ScreenStreaming` and the stream started; the
 * channel then drives the surface's canvas. `Streaming: false` (capability absent / start failed) leaves
 * the surface on its 700ms snapshot poll fallback.
 */
const START_SCREENCAST_MUTATION = `
  mutation StartRemoteBrowserScreencast($agentSessionID: String!) {
    StartRemoteBrowserScreencast(agentSessionID: $agentSessionID) {
      Streaming
    }
  }
`;

/** GraphQL mutation that stops the server-pushed screencast (best-effort teardown). */
const STOP_SCREENCAST_MUTATION = `
  mutation StopRemoteBrowserScreencast($agentSessionID: String!) {
    StopRemoteBrowserScreencast(agentSessionID: $agentSessionID)
  }
`;

/** The narrow projection of the `StartRemoteBrowserScreencast` mutation payload the channel reads. */
interface StartRemoteBrowserScreencastResult {
  StartRemoteBrowserScreencast: {
    Streaming: boolean;
  } | null;
}

/** GraphQL query the surface fetcher runs — the live screenshot + URL of the server browser. */
const REMOTE_BROWSER_SNAPSHOT_QUERY = `
  query RemoteBrowserSnapshot($agentSessionID: String!) {
    RemoteBrowserSnapshot(agentSessionID: $agentSessionID) {
      ScreenshotBase64
      CurrentUrl
    }
  }
`;

/** The narrow projection of the `RemoteBrowserSnapshot` query payload the channel reads. */
interface RemoteBrowserSnapshotResult {
  RemoteBrowserSnapshot: RemoteBrowserSnapshotView | null;
}

/** The result payload (serialized to JSON) the channel returns to the model per tool call. */
interface RemoteBrowserToolResult {
  success: boolean;
  /** The page URL after the action, when the server reported one. */
  currentUrl?: string;
  /** Human-readable detail (e.g. extracted page text for `browser_GetPageText`, or an error). */
  detail?: string;
  /** Error description when `success` is false. */
  error?: string;
}

/**
 * The REMOTE BROWSER as a pluggable interactive channel — a {@link BaseRealtimeChannelClient}
 * resolved from the `MJ: AI Agent Channels` registry row whose `ClientPluginClass` is
 * `'RealtimeRemoteBrowserChannel'`. One instance per session (ClassFactory-created at session
 * start).
 *
 * Topology (CLIENT-DIRECT, like the whiteboard — the browser just happens to live on the
 * server):
 *  - **Action**: the `browser_*` client-executed tool set ({@link REMOTE_BROWSER_TOOL_DEFINITIONS}).
 *    {@link ApplyAgentTool} maps a tool call → a normalized {@link RemoteBrowserAction}
 *    ({@link MapToolToAction}) and awaits the `ExecuteRemoteBrowserAction` GraphQL mutation
 *    (via {@link RealtimeChannelContext.ExecuteServerAction}) to drive the server browser,
 *    returning a concise JSON result for the model. Never throws — argument and transport
 *    failures map to a `{ success: false, error }` payload.
 *  - **Perception**: after a successful action, a `[browser]` context note carries the new
 *    page URL so the agent perceives where the page went; the surface independently polls a
 *    live screenshot.
 *  - **Surface**: {@link RemoteBrowserSurfaceComponent}, created dynamically in the channel
 *    tab; the plugin hands it the session's provider + id in {@link BindSurface} so it can
 *    poll `RemoteBrowserSnapshot`. View-only in v1 (no takeover input).
 *
 * The channel keeps NO client-side state of record — the browser's state lives entirely on
 * the server — so {@link SerializeState} / {@link RestoreState} use the base no-op behavior.
 */
@RegisterClass(BaseRealtimeChannelClient, 'RealtimeRemoteBrowserChannel')
export class RemoteBrowserChannel extends BaseRealtimeChannelClient<RemoteBrowserSurfaceComponent> {
  /** The live bound surface, when the channel tab's pane is instantiated. */
  private surface: RemoteBrowserSurfaceComponent | null = null;

  /**
   * Whether the server confirmed it is PUSHING screencast frames for this session (`ScreenStreaming`
   * supported). When `true` the surface renders pushed frames on its canvas and skips its poll, and
   * {@link OnScreencastFrame} forwards each pushed frame to it. When `false` the surface keeps polling.
   */
  private streaming = false;

  public get ChannelName(): string {
    return 'Remote Browser';
  }

  public get ToolNamePrefix(): string {
    return REMOTE_BROWSER_TOOL_PREFIX;
  }

  public get TabTitle(): string {
    return 'Browser';
  }

  public get TabIcon(): string {
    return 'fa-solid fa-globe';
  }

  public GetToolDefinitions(): RealtimeToolDefinition[] {
    return REMOTE_BROWSER_TOOL_DEFINITIONS;
  }

  public override GetSurfaceComponent(): Type<RemoteBrowserSurfaceComponent> {
    return RemoteBrowserSurfaceComponent;
  }

  /** First-run intro shown the first time the user opens the Browser tab (once per user). */
  public override GetOnboardingDetails(): ChannelOnboardingDetails {
    return {
      Heading: 'Remote Browser',
      Description:
        'The agent drives a live web browser on the server and you can watch it work right here. ' +
        'This is a periodically-refreshing screenshot of that page — view-only in this version, ' +
        'so you watch rather than click.',
      Tips: [
        'Ask the agent to look something up, open a site or fill in a form — it controls the page.',
        'The view updates every few seconds; brief pauses just mean the next snapshot is loading.',
        'The current page URL is shown so you always know where the agent has navigated.'
      ],
      IconClass: 'fa-solid fa-globe'
    };
  }

  /**
   * Wires the dynamically-created surface: hands it a snapshot fetcher closing over the
   * channel context (session id + provider live there), so the surface stays transport-
   * agnostic. Set BEFORE the surface's first change detection (the pane binds synchronously),
   * so its `ngOnInit` poll has the fetcher.
   *
   * Also asks the server to start a live screencast. When the backend supports `ScreenStreaming` the
   * server starts PUSHING frames and reports `Streaming: true`; we flip the surface to canvas mode (its
   * poll is then skipped) and {@link OnScreencastFrame} paints each pushed frame. When the backend lacks
   * the capability (`Streaming: false`) the surface keeps the snapshot poll already running — graceful
   * fallback, no further action.
   */
  public BindSurface(instance: RemoteBrowserSurfaceComponent): void {
    this.surface = instance;
    instance.Fetch = () => this.fetchSnapshot();
    void this.startScreencast(instance);
  }

  public override UnbindSurface(): void {
    void this.stopScreencast();
    this.surface = null;
  }

  public override Dispose(): void {
    void this.stopScreencast();
    super.Dispose();
  }

  /**
   * Forwards one PUSHED screencast frame to the bound surface's canvas. Called by the session service
   * when a `RemoteBrowserScreencastFrame` arrives on the push-status stream for THIS session. No-op when
   * the channel isn't streaming or has no bound surface (e.g. the tab pane is collapsed).
   *
   * @param dataBase64 The frame image as raw base64 JPEG (no `data:` prefix).
   */
  public OnScreencastFrame(dataBase64: string): void {
    if (this.streaming) {
      this.surface?.RenderFrame(dataBase64);
    }
  }

  /**
   * Asks the server to start the live screencast and, on success, flips the surface to canvas mode so it
   * stops polling and starts painting pushed frames. Best-effort: a `null`/`Streaming: false` result
   * (capability absent or transport failure) leaves the surface on its poll fallback.
   */
  private async startScreencast(instance: RemoteBrowserSurfaceComponent): Promise<void> {
    const sessionId = this.Context?.AgentSessionID;
    if (!sessionId) {
      return;
    }
    const data = await this.Context?.ExecuteServerAction<StartRemoteBrowserScreencastResult>(
      START_SCREENCAST_MUTATION, { agentSessionID: sessionId });
    if (data?.StartRemoteBrowserScreencast?.Streaming === true) {
      this.streaming = true;
      instance.Streaming = true;
    }
  }

  /** Asks the server to stop the screencast (best-effort) and clears the streaming flag. */
  private async stopScreencast(): Promise<void> {
    const wasStreaming = this.streaming;
    this.streaming = false;
    const sessionId = this.Context?.AgentSessionID;
    if (!wasStreaming || !sessionId) {
      return;
    }
    await this.Context?.ExecuteServerAction(STOP_SCREENCAST_MUTATION, { agentSessionID: sessionId });
  }

  /**
   * Fetches one live snapshot of the server browser for the surface — the PERCEPTION poll.
   * Best-effort by contract ({@link RemoteBrowserSnapshotFetcher}): returns `null` when no
   * session is live or the query fails (the surface keeps its last good frame).
   */
  private async fetchSnapshot(): Promise<RemoteBrowserSnapshotView | null> {
    const sessionId = this.Context?.AgentSessionID;
    if (!sessionId) {
      return null;
    }
    const data = await this.Context?.ExecuteServerAction<RemoteBrowserSnapshotResult>(
      REMOTE_BROWSER_SNAPSHOT_QUERY, { agentSessionID: sessionId });
    return data?.RemoteBrowserSnapshot ?? null;
  }

  /**
   * Executes ONE `browser_*` tool call: maps it to a server action and awaits the
   * `ExecuteRemoteBrowserAction` mutation, then returns a concise JSON result the model reads.
   * On success it also feeds the new page URL to the agent as a `[browser]` context note. Never
   * throws — bad arguments, no live session, and server failures all become a failed-result
   * payload so the model can narrate the problem.
   */
  public async ApplyAgentTool(toolName: string, argsJson: string): Promise<string> {
    let action: RemoteBrowserAction;
    try {
      action = MapToolToAction(toolName, this.parseArgs(argsJson));
    } catch (error) {
      const message = error instanceof RemoteBrowserToolArgError ? error.message : 'Invalid Remote Browser tool arguments.';
      return this.fail(message);
    }

    const sessionId = this.Context?.AgentSessionID;
    if (!sessionId) {
      // Diagnostic: distinguishes "channel never Initialized (no Context)" from "session id not yet
      // set on the service" — the two distinct causes of a null id at tool-execution time.
      console.warn('[RemoteBrowser] browser tool invoked but AgentSessionID is null', {
        tool: toolName,
        hasContext: !!this.Context,
        agentSessionID: this.Context?.AgentSessionID ?? null,
      });
      return this.fail('No live browser session is available yet — the realtime session may still be connecting; try again in a moment.');
    }

    const data = await this.Context?.ExecuteServerAction<ExecuteRemoteBrowserActionResult>(
      EXECUTE_REMOTE_BROWSER_ACTION_MUTATION, this.buildVariables(sessionId, action));
    const result = data?.ExecuteRemoteBrowserAction ?? null;
    if (!result) {
      return this.fail('The browser action could not be executed (no response from the server).');
    }
    if (!result.Success) {
      return this.fail(result.Detail ?? 'The browser action failed.');
    }

    if (result.CurrentUrl) {
      // PERCEPTION: tell the agent where the page is now (background — no spoken reply).
      this.Context?.SendContextNote(`[browser] current page: ${result.CurrentUrl}`);
    }
    return this.ok(result.CurrentUrl, result.Detail);
  }

  /** Builds the flat mutation variables from a normalized action (omitted fields ride as null). */
  private buildVariables(sessionId: string, action: RemoteBrowserAction): Record<string, JSONValue> {
    return {
      agentSessionID: sessionId,
      kind: action.Kind,
      url: action.Url ?? null,
      selector: action.Selector ?? null,
      x: action.X ?? null,
      y: action.Y ?? null,
      text: action.Text ?? null,
      key: action.Key ?? null,
      deltaX: action.DeltaX ?? null,
      deltaY: action.DeltaY ?? null,
      ms: action.Ms ?? null
    };
  }

  /** Parses the tool-args JSON into a plain object; returns `{}` for empty/malformed input. */
  private parseArgs(argsJson: string): Record<string, JSONValue> {
    const trimmed = argsJson?.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, JSONValue>)
        : {};
    } catch {
      return {};
    }
  }

  /** Builds a successful tool-result JSON string for the model. */
  private ok(currentUrl: string | null, detail: string | null): string {
    const result: RemoteBrowserToolResult = { success: true };
    if (currentUrl) {
      result.currentUrl = currentUrl;
    }
    if (detail) {
      result.detail = detail;
    }
    return JSON.stringify(result);
  }

  /** Builds a failed tool-result JSON string for the model. */
  private fail(error: string): string {
    const result: RemoteBrowserToolResult = { success: false, error };
    return JSON.stringify(result);
  }
}

/**
 * Tree-shaking prevention: the Remote Browser channel is resolved dynamically through the
 * ClassFactory (by the registry row's `ClientPluginClass` key), so this static call is what
 * keeps its `@RegisterClass` side effect from being eliminated by the bundler. Called from
 * `conversations.module.ts` alongside {@link LoadRealtimeWhiteboardChannel}.
 */
export function LoadRealtimeRemoteBrowserChannel(): void {
  // intentional no-op — the import side effect performs the registration
}
