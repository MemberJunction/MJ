import type { Type } from '@angular/core';
import type { Subscription } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { JSONValue, RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeChannelClient, ChannelOnboardingDetails } from '../channels/base-realtime-channel-client';
import { RemoteBrowserHumanInputEvent, RemoteBrowserSnapshotView, RemoteBrowserSurfaceComponent } from './remote-browser-surface.component';
import {
  MapToolToAction,
  REMOTE_BROWSER_TOOL_DEFINITIONS,
  REMOTE_BROWSER_TOOL_NAMES,
  REMOTE_BROWSER_TOOL_PREFIX,
  RemoteBrowserAction,
  RemoteBrowserToolArgError,
} from './remote-browser-tools';
import { MediaSourceAudioSink, RemoteBrowserAudioChunkInput, RemoteBrowserAudioPlayer } from './remote-browser-audio-player';

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
 * GOAL mutation — hands a high-level goal to the server's autonomous browser agent (computer-use loop or
 * backend native AI) instead of relaying a granular action. The server plans + executes; we await the
 * terminal outcome. (Live per-step narration is a server-bridged concern; over this client-direct mutation
 * we get the final result.)
 */
const EXECUTE_REMOTE_BROWSER_GOAL_MUTATION = `
  mutation ExecuteRemoteBrowserGoal($agentSessionID: String!, $goal: String!, $startUrl: String) {
    ExecuteRemoteBrowserGoal(agentSessionID: $agentSessionID, goal: $goal, startUrl: $startUrl) {
      Success
      Strategy
      CurrentUrl
      Status
      StepCount
      Detail
    }
  }
`;

/** The narrow projection of the `ExecuteRemoteBrowserGoal` mutation payload the channel reads. */
interface ExecuteRemoteBrowserGoalResult {
  ExecuteRemoteBrowserGoal: {
    Success: boolean;
    Strategy: string | null;
    CurrentUrl: string | null;
    Status: string | null;
    StepCount: number | null;
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

/**
 * GraphQL mutation that asks the server to start PUSHING live tab-audio chunks for the session — so a
 * co-agent demoing a video/audio site is HEARD. Returns `Streaming: true` when the backend can capture
 * audio (v1 gates by backend implementation) and the stream started; `Streaming: false` means no audio
 * (capability absent / start failed) and the client simply plays nothing.
 */
const START_AUDIO_STREAM_MUTATION = `
  mutation StartRemoteBrowserAudioStream($agentSessionID: String!) {
    StartRemoteBrowserAudioStream(agentSessionID: $agentSessionID) {
      Streaming
    }
  }
`;

/** GraphQL mutation that stops the server-pushed tab-audio stream (best-effort teardown). */
const STOP_AUDIO_STREAM_MUTATION = `
  mutation StopRemoteBrowserAudioStream($agentSessionID: String!) {
    StopRemoteBrowserAudioStream(agentSessionID: $agentSessionID)
  }
`;

/** The narrow projection of the `StartRemoteBrowserAudioStream` mutation payload the channel reads. */
interface StartRemoteBrowserAudioStreamResult {
  StartRemoteBrowserAudioStream: {
    Streaming: boolean;
  } | null;
}

/**
 * HUMAN-TAKEOVER mutation — relays ONE pointer/keyboard input the user performed on the live canvas into the
 * server-hosted browser (Collaborative control). Best-effort: the server returns `false` when the backend
 * lacks `HumanTakeover` or no live browser exists; the channel doesn't act on the boolean.
 */
const RELAY_HUMAN_INPUT_MUTATION = `
  mutation RelayRemoteBrowserHumanInput(
    $agentSessionID: String!, $kind: String!, $x: Float, $y: Float, $button: String, $key: String,
    $text: String, $deltaX: Float, $deltaY: Float, $modifiers: String
  ) {
    RelayRemoteBrowserHumanInput(
      agentSessionID: $agentSessionID, kind: $kind, x: $x, y: $y, button: $button, key: $key,
      text: $text, deltaX: $deltaX, deltaY: $deltaY, modifiers: $modifiers
    )
  }
`;

/**
 * COPY-OUT query — reads the remote page's current text selection so the surface can write it to the LOCAL
 * clipboard on a `copy` / Cmd+C (the mirror of the `'text'` paste-in path). Returns `''` when nothing is
 * selected, no live browser exists, or the backend lacks `HumanTakeover`.
 */
const GET_SELECTION_QUERY = `
  query GetRemoteBrowserSelection($agentSessionID: String!) {
    GetRemoteBrowserSelection(agentSessionID: $agentSessionID) {
      Text
    }
  }
`;

/** The narrow projection of the `GetRemoteBrowserSelection` query payload the channel reads. */
interface GetRemoteBrowserSelectionResult {
  GetRemoteBrowserSelection: {
    Text: string;
  } | null;
}

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

/**
 * VISION-QUERY mutation (separate from {@link EXECUTE_REMOTE_BROWSER_ACTION_MUTATION} — this OBSERVES the page,
 * it does not drive it). The server captures the live screenshot and runs a fast vision model over it, so the
 * non-omnimodal voice agent can "see" the page: a text description and/or localized elements with pixel
 * centroids. Backs both `browser_DescribePage` (no target) and `browser_LocateElement` (a target description).
 */
const INTERPRET_PAGE_MUTATION = `
  mutation InterpretRemoteBrowserPage($agentSessionID: String!, $query: String) {
    InterpretRemoteBrowserPage(agentSessionID: $agentSessionID, query: $query) {
      Description
      Elements {
        Label
        X
        Y
        Confidence
      }
      Detail
    }
  }
`;

/** One element localized by the visual interpreter — label + pixel centroid + confidence. */
interface RemoteBrowserInterpretedElement {
  Label: string;
  X: number;
  Y: number;
  Confidence: number;
}

/** The narrow projection of the `InterpretRemoteBrowserPage` mutation payload the channel reads. */
interface InterpretRemoteBrowserPageResult {
  InterpretRemoteBrowserPage: {
    Description: string | null;
    Elements: RemoteBrowserInterpretedElement[];
    Detail: string | null;
  } | null;
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
 *    poll `RemoteBrowserSnapshot`. HUMAN TAKEOVER is enabled by default (Collaborative): the
 *    user can click/type into the live canvas and those events relay to the server browser via
 *    {@link RELAY_HUMAN_INPUT_MUTATION} (server-gated on the backend's `HumanTakeover` capability).
 *
 * The channel keeps NO client-side state of record — the browser's state lives entirely on
 * the server — so {@link SerializeState} / {@link RestoreState} use the base no-op behavior.
 */
@RegisterClass(BaseRealtimeChannelClient, 'RealtimeRemoteBrowserChannel')
export class RemoteBrowserChannel extends BaseRealtimeChannelClient<RemoteBrowserSurfaceComponent> {
  /** The live bound surface, when the channel tab's pane is instantiated. */
  private surface: RemoteBrowserSurfaceComponent | null = null;

  /** Subscription to the bound surface's `HumanInput` output, torn down on unbind/dispose. */
  private humanInputSub: Subscription | null = null;

  /**
   * Whether the server confirmed it is PUSHING screencast frames for this session (`ScreenStreaming`
   * supported). When `true` the surface renders pushed frames on its canvas and skips its poll, and
   * {@link OnScreencastFrame} forwards each pushed frame to it. When `false` the surface keeps polling.
   */
  private streaming = false;

  /**
   * Whether the server confirmed it is PUSHING tab-audio chunks for this session (the backend can capture
   * audio). When `true` {@link OnAudioChunk} feeds each pushed chunk to {@link audioPlayer}; when `false`
   * no audio plays.
   */
  private audioStreaming = false;

  /** The client-side audio player fed pushed chunks while {@link audioStreaming}; `null` until started. */
  private audioPlayer: RemoteBrowserAudioPlayer | null = null;

  /** Subscription to the bound surface's `AudioMutedChange` output (the speaker toggle), torn down on unbind. */
  private audioMutedSub: Subscription | null = null;

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
        'You can also grab the wheel: click and type directly on the live page and the agent picks ' +
        'up right where you left off.',
      Tips: [
        'Ask the agent to look something up, open a site or fill in a form — it controls the page.',
        'Click on the live view to take over, then click and type to drive it yourself — the "You\'re driving" badge shows when takeover is active.',
        'The current page URL is shown so you always know where the agent has navigated.',
      ],
      IconClass: 'fa-solid fa-globe',
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
   *
   * HUMAN TAKEOVER is enabled BY DEFAULT (Collaborative): the surface is flipped `Interactive = true` and
   * its `HumanInput` output subscribed, forwarding each pointer/keyboard event to the server via
   * {@link RELAY_HUMAN_INPUT_MUTATION}. Takeover only takes effect on the canvas (screencast) path; the
   * `<img>` poll fallback stays view-only. The server gates the actual routing on the backend's
   * `HumanTakeover` capability, so this is safe to enable unconditionally.
   */
  public BindSurface(instance: RemoteBrowserSurfaceComponent): void {
    this.surface = instance;
    instance.Fetch = () => this.fetchSnapshot();
    // Copy-out: the surface reads the remote selection through this on a local `copy` and writes it locally.
    instance.FetchSelection = () => this.fetchSelection();
    instance.Interactive = true;
    this.humanInputSub = instance.HumanInput.subscribe((input) => this.relayHumanInput(input));
    this.audioMutedSub = instance.AudioMutedChange.subscribe((muted) => this.audioPlayer?.SetMuted(muted));
    void this.startScreencast(instance);
    void this.startAudioStream(instance);
  }

  public override UnbindSurface(): void {
    this.humanInputSub?.unsubscribe();
    this.humanInputSub = null;
    this.audioMutedSub?.unsubscribe();
    this.audioMutedSub = null;
    void this.stopScreencast();
    void this.stopAudioStream();
    this.surface = null;
  }

  public override Dispose(): void {
    this.humanInputSub?.unsubscribe();
    this.humanInputSub = null;
    this.audioMutedSub?.unsubscribe();
    this.audioMutedSub = null;
    void this.stopScreencast();
    void this.stopAudioStream();
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
   * Feeds one PUSHED tab-audio chunk to the client-side audio player. Called by the session service when a
   * `RemoteBrowserAudioChunk` arrives on the push-status stream for THIS session. No-op when the channel
   * isn't audio-streaming or the player has been torn down.
   *
   * @param chunk The pushed audio chunk (base64 webm-opus + codec/seq metadata).
   */
  public OnAudioChunk(chunk: RemoteBrowserAudioChunkInput): void {
    if (this.audioStreaming) {
      this.audioPlayer?.Enqueue(chunk);
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
    const data = await this.Context?.ExecuteServerAction<StartRemoteBrowserScreencastResult>(START_SCREENCAST_MUTATION, { agentSessionID: sessionId });
    if (data?.StartRemoteBrowserScreencast?.Streaming === true) {
      this.streaming = true;
      instance.Streaming = true;
    }
  }

  /**
   * Asks the server to start the live tab-audio stream and, on success, spins up the client-side
   * {@link RemoteBrowserAudioPlayer} (speaker ON by default — the call is the activating user gesture) so
   * pushed chunks play. Best-effort: a `null`/`Streaming: false` result (no audio capability or transport
   * failure) leaves the channel silent with no player.
   *
   * @param instance The bound surface, flipped to show the speaker toggle when audio starts.
   */
  private async startAudioStream(instance: RemoteBrowserSurfaceComponent): Promise<void> {
    const sessionId = this.Context?.AgentSessionID;
    if (!sessionId) {
      return;
    }
    const data = await this.Context?.ExecuteServerAction<StartRemoteBrowserAudioStreamResult>(START_AUDIO_STREAM_MUTATION, { agentSessionID: sessionId });
    if (data?.StartRemoteBrowserAudioStream?.Streaming === true) {
      this.audioStreaming = true;
      this.audioPlayer = new RemoteBrowserAudioPlayer(new MediaSourceAudioSink());
      // Speaker defaults ON; reflect that on the surface so the toggle renders un-muted.
      instance.AudioAvailable = true;
      instance.AudioMuted = false;
    }
  }

  /** Asks the server to stop the tab-audio stream (best-effort), disposes the player, and clears state. */
  private async stopAudioStream(): Promise<void> {
    const wasStreaming = this.audioStreaming;
    this.audioStreaming = false;
    this.audioPlayer?.Dispose();
    this.audioPlayer = null;
    const sessionId = this.Context?.AgentSessionID;
    if (!wasStreaming || !sessionId) {
      return;
    }
    await this.Context?.ExecuteServerAction(STOP_AUDIO_STREAM_MUTATION, { agentSessionID: sessionId });
  }

  /**
   * Relays ONE human-takeover input from the surface to the server's {@link RELAY_HUMAN_INPUT_MUTATION}.
   * Best-effort and fire-and-forget: never throws, and the boolean result is ignored (the server already
   * gates routing on the backend's `HumanTakeover` capability). No-op when no live session id exists.
   *
   * @param input The flattened pointer/keyboard input the user performed on the live canvas.
   */
  private relayHumanInput(input: RemoteBrowserHumanInputEvent): void {
    const sessionId = this.Context?.AgentSessionID;
    if (!sessionId) {
      return;
    }
    void this.Context?.ExecuteServerAction(RELAY_HUMAN_INPUT_MUTATION, {
      agentSessionID: sessionId,
      kind: input.kind,
      x: input.x ?? null,
      y: input.y ?? null,
      button: input.button ?? null,
      key: input.key ?? null,
      // Paste-in: the `'text'` kind carries the local clipboard text the server inserts into the page.
      text: input.text ?? null,
      deltaX: input.deltaX ?? null,
      deltaY: input.deltaY ?? null,
      // Server expects a comma-separated modifier list (e.g. "Shift,Control"); null when none held.
      modifiers: input.modifiers && input.modifiers.length > 0 ? input.modifiers.join(',') : null,
    });
  }

  /**
   * Reads the remote page's current selection for COPY-OUT — backs the surface's `FetchSelection`. Awaits
   * the `GetRemoteBrowserSelection` query and returns its text. Best-effort by contract
   * ({@link RemoteBrowserSelectionFetcher}): returns `''` when no session is live or the query fails, so a
   * best-effort copy never throws.
   */
  private async fetchSelection(): Promise<string> {
    const sessionId = this.Context?.AgentSessionID;
    if (!sessionId) {
      return '';
    }
    const data = await this.Context?.ExecuteServerAction<GetRemoteBrowserSelectionResult>(GET_SELECTION_QUERY, { agentSessionID: sessionId });
    return data?.GetRemoteBrowserSelection?.Text ?? '';
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
    const data = await this.Context?.ExecuteServerAction<RemoteBrowserSnapshotResult>(REMOTE_BROWSER_SNAPSHOT_QUERY, { agentSessionID: sessionId });
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
    // VISION-QUERY branch: the two interpreter tools OBSERVE the page (run a vision model over a screenshot)
    // rather than drive it, so they route to the separate interpret mutation, not MapToolToAction.
    if (toolName === REMOTE_BROWSER_TOOL_NAMES.DescribePage) {
      return this.interpretPage(undefined);
    }
    if (toolName === REMOTE_BROWSER_TOOL_NAMES.AchieveGoal) {
      return this.achieveGoal(argsJson);
    }
    if (toolName === REMOTE_BROWSER_TOOL_NAMES.LocateElement) {
      const description = this.asArgString(this.parseArgs(argsJson)['description']);
      if (!description) {
        return this.fail('browser_LocateElement requires a "description" of the element to find.');
      }
      return this.interpretPage(description);
    }

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
      EXECUTE_REMOTE_BROWSER_ACTION_MUTATION,
      this.buildVariables(sessionId, action),
    );
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
      // In streaming mode the surface's snapshot poll (which carries the URL) is stopped, so push the new
      // URL to the live-view bar directly — otherwise it stays stuck on "No page loaded yet".
      this.surface?.SetCurrentUrl(result.CurrentUrl);
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
      ms: action.Ms ?? null,
    };
  }

  /**
   * GOAL path for the `browser_AchieveGoal` tool: hands a high-level goal to the server's autonomous
   * browser agent (computer-use loop / native AI) via {@link EXECUTE_REMOTE_BROWSER_GOAL_MUTATION} and
   * returns a concise result for the model. Never throws — failures map to a `{ success: false }` string.
   *
   * @param argsJson The raw tool-call arguments (`{ goal, startUrl? }`).
   * @returns The model-readable result string.
   */
  private async achieveGoal(argsJson: string): Promise<string> {
    const sessionId = this.Context?.AgentSessionID;
    if (!sessionId) {
      return this.fail('No live browser session is available yet — the realtime session may still be connecting; try again in a moment.');
    }
    const args = this.parseArgs(argsJson);
    const goal = this.asArgString(args['goal']);
    if (!goal) {
      return this.fail('browser_AchieveGoal requires a "goal" describing what to accomplish.');
    }
    const startUrl = this.asArgString(args['startUrl']) ?? null;

    const data = await this.Context?.ExecuteServerAction<ExecuteRemoteBrowserGoalResult>(EXECUTE_REMOTE_BROWSER_GOAL_MUTATION, {
      agentSessionID: sessionId,
      goal,
      startUrl,
    });
    const result = data?.ExecuteRemoteBrowserGoal ?? null;
    if (!result) {
      return this.fail('The browser goal could not be executed (no response from the server).');
    }
    if (result.CurrentUrl) {
      this.Context?.SendContextNote(`[browser] current page: ${result.CurrentUrl}`);
      this.surface?.SetCurrentUrl(result.CurrentUrl);
    }
    if (!result.Success) {
      return this.fail(result.Detail ?? `The goal could not be completed (${result.Status ?? 'unknown'}).`);
    }
    return this.ok(result.CurrentUrl, result.Detail ?? `Goal completed (${result.Status ?? 'Completed'}, ${result.StepCount ?? 0} steps).`);
  }

  /**
   * Runs the VISION-QUERY path for the `browser_DescribePage` / `browser_LocateElement` tools: awaits the
   * `InterpretRemoteBrowserPage` mutation (server captures a screenshot + runs a fast vision model) and returns
   * a concise JSON string the model reads. For a describe (no `query`) it returns `{ description }`; for a locate
   * it returns `{ found, element, all }` so the agent can `browser_Click` the centroid. Never throws — a null
   * session, no response, or a server detail-only result all map to a result string the model can narrate.
   *
   * @param query The visual target to locate, or `undefined` for a plain page description.
   * @returns A JSON string describing the interpretation for the model.
   */
  private async interpretPage(query: string | undefined): Promise<string> {
    const sessionId = this.Context?.AgentSessionID;
    if (!sessionId) {
      console.warn('[RemoteBrowser] interpret tool invoked but AgentSessionID is null', {
        hasContext: !!this.Context,
        agentSessionID: this.Context?.AgentSessionID ?? null,
      });
      return this.fail('No live browser session is available yet — the realtime session may still be connecting; try again in a moment.');
    }

    const data = await this.Context?.ExecuteServerAction<InterpretRemoteBrowserPageResult>(INTERPRET_PAGE_MUTATION, {
      agentSessionID: sessionId,
      query: query ?? null,
    });
    const result = data?.InterpretRemoteBrowserPage ?? null;
    if (!result) {
      return this.fail('The page could not be interpreted (no response from the server).');
    }

    if (query === undefined) {
      // DescribePage — hand back the description (or the server's detail note when nothing was interpreted).
      return JSON.stringify({ description: result.Description ?? result.Detail ?? null });
    }

    // LocateElement — surface whether anything matched, the best match, and all candidates.
    const elements = result.Elements ?? [];
    const best = elements[0];
    return JSON.stringify({
      found: elements.length > 0,
      element: best ? { label: best.Label, x: best.X, y: best.Y } : null,
      all: elements,
      ...(result.Detail ? { detail: result.Detail } : {}),
    });
  }

  /** Coerces a parsed tool-arg to a non-empty string, or `undefined` when absent / wrong-typed. */
  private asArgString(value: JSONValue | undefined): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  /** Parses the tool-args JSON into a plain object; returns `{}` for empty/malformed input. */
  private parseArgs(argsJson: string): Record<string, JSONValue> {
    const trimmed = argsJson?.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, JSONValue>) : {};
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
