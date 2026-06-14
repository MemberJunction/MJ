import type { Type } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { JSONValue, RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeChannelClient } from '../channels/base-realtime-channel-client';
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

  /**
   * Wires the dynamically-created surface: hands it a snapshot fetcher closing over the
   * channel context (session id + provider live there), so the surface stays transport-
   * agnostic. Set BEFORE the surface's first change detection (the pane binds synchronously),
   * so its `ngOnInit` poll has the fetcher.
   */
  public BindSurface(instance: RemoteBrowserSurfaceComponent): void {
    this.surface = instance;
    instance.Fetch = () => this.fetchSnapshot();
  }

  public override UnbindSurface(): void {
    this.surface = null;
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
      return this.fail('No live browser session is available.');
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
