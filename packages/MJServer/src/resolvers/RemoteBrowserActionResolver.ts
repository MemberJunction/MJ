/**
 * @fileoverview GraphQL resolvers for the **Remote Browser** native realtime channel, CLIENT-DIRECT
 * topology.
 *
 * Realtime sessions are client-direct: the model talks to the browser, and the agent's browser-driving
 * tools execute CLIENT-side (like the live Whiteboard). Each client-executed browser tool relays its
 * intent to the server through {@link RemoteBrowserActionResolver.ExecuteRemoteBrowserAction}, which drives
 * the server-side {@link RemoteBrowserEngine}'s live browser. A second query,
 * {@link RemoteBrowserActionResolver.RemoteBrowserSnapshot}, returns the current screenshot + URL for the
 * client's live view.
 *
 * Both operations are **ownership-gated** exactly like {@link import('./RealtimeClientSessionResolver').RealtimeClientSessionResolver}:
 * the `AIAgentSession.UserID` must equal the calling user. The mutation lazily starts the browser on first
 * use — so a realtime session that never touches the browser never launches Chrome — resolving the backend
 * from the agent's `TypeConfiguration` (`{ remoteBrowser: { provider } }`), else the single Active provider.
 *
 * @module @memberjunction/server
 */
import { Resolver, Mutation, Query, Arg, Ctx, Float, Int, ObjectType, Field, PubSub, PubSubEngine } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { UserInfo, IMetadataProvider, LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentSessionEntity, MJAIAgentEntity } from '@memberjunction/core-entities';
import { RemoteBrowserEngine } from '@memberjunction/remote-browser-server';
import { beginBrowserGoalStep, finalizeBrowserGoalStep, extractCoAgentRunID } from '../agentSessions/remoteBrowserGoalEngine.js';
import { RemoteBrowserGoalRegistry } from '../agentSessions/remoteBrowserGoalRegistry.js';
import { randomUUID } from 'node:crypto';
import {
  RemoteBrowserAction,
  RemoteBrowserAudioChunk,
  RemoteBrowserHumanInput,
  RemoteBrowserModifierKey,
  RemoteBrowserCapabilityNotSupportedError,
} from '@memberjunction/remote-browser-base';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadWriteProvider } from '../util.js';
import { PUSH_STATUS_UPDATES_TOPIC } from '../generic/PushStatusResolver.js';
import { AIEngine } from '@memberjunction/aiengine';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';

/** Entity name — centralised so the `MJ:`-prefix convention is applied in exactly one place. */
const SESSION_ENTITY = 'MJ: AI Agent Sessions';
/** Entity name for the agent whose `TypeConfiguration` carries the remote-browser provider preference. */
const AGENT_ENTITY = 'MJ: AI Agents';
/**
 * Name of the governable vision AI Prompt that interprets a browser screenshot for a non-vision voice agent.
 * Seeded as metadata (`metadata/prompts/.remote-browser-visual-interpreter-prompt.json`) and pinned to the
 * `Gemini 3.1 Flash-Lite` model via its `MJ: AI Prompt Models` association — so the model is chosen by the
 * prompt's own configuration, not hard-coded here.
 */
const VISUAL_INTERPRETER_PROMPT_NAME = 'Remote Browser Visual Interpreter';

/**
 * The strongly-typed shape of the slice of an agent's `TypeConfiguration` JSON this resolver reads — the
 * optional `remoteBrowser.provider` backend-name preference. Everything else in the blob is ignored here.
 */
interface RemoteBrowserTypeConfiguration {
  remoteBrowser?: {
    /** The display name of the remote-browser backend to use (e.g. `'Self-Hosted Chrome'`). */
    provider?: string;
  };
}

/**
 * Result of {@link RemoteBrowserActionResolver.ExecuteRemoteBrowserAction} — the outcome of one browser
 * action plus the resulting URL the client narrates / displays.
 */
@ObjectType()
export class RemoteBrowserActionResult {
  /** Whether the browser action completed successfully. */
  @Field(() => Boolean)
  Success: boolean;

  /** The page URL after the action, when known. Null when the action produced no URL. */
  @Field(() => String, { nullable: true })
  CurrentUrl?: string;

  /** Human-readable detail — an error message on failure, a note on success. Null when none. */
  @Field(() => String, { nullable: true })
  Detail?: string;
}

/**
 * Result of {@link RemoteBrowserActionResolver.ExecuteRemoteBrowserGoal} — the outcome of an autonomous,
 * goal-driven browser run (computer-use loop or backend native AI).
 */
@ObjectType()
export class RemoteBrowserGoalResultType {
  /** Whether the goal was achieved. */
  @Field(() => Boolean)
  Success: boolean;

  /**
   * Handle for the async goal run. `ExecuteRemoteBrowserGoal` STARTS the goal and returns this with
   * `Status: 'Running'`; the client polls {@link RemoteBrowserActionResolver.GetRemoteBrowserGoalResult}
   * with it until the run reports a terminal status.
   */
  @Field(() => String, { nullable: true })
  GoalRunID?: string;

  /** Which control strategy executed the goal (`ComputerUse` / `NativeAI`). */
  @Field(() => String, { nullable: true })
  Strategy?: string;

  /** The page URL when the run ended, when known. */
  @Field(() => String, { nullable: true })
  CurrentUrl?: string;

  /** Terminal status label (`Completed` / `MaxStepsReached` / `Impossible` / `Error` / …). */
  @Field(() => String, { nullable: true })
  Status?: string;

  /** Number of perceive-act steps executed (computer-use strategy). */
  @Field(() => Int, { nullable: true })
  StepCount?: number;

  /** Human-readable detail (judge feedback / error message). */
  @Field(() => String, { nullable: true })
  Detail?: string;
}

/**
 * Result of {@link RemoteBrowserActionResolver.RemoteBrowserSnapshot} — the current viewport screenshot +
 * URL for the client's live view. Both fields are null when the session holds no live browser.
 */
@ObjectType()
export class RemoteBrowserSnapshot {
  /** The current viewport screenshot, Base64-encoded. Null when no live browser exists for the session. */
  @Field(() => String, { nullable: true })
  ScreenshotBase64?: string;

  /** The browser's current URL. Null when no live browser exists for the session. */
  @Field(() => String, { nullable: true })
  CurrentUrl?: string;
}

/**
 * Result of {@link RemoteBrowserActionResolver.StartRemoteBrowserScreencast} — whether the live CDP
 * screencast started. When `false` the backend lacks the `ScreenStreaming` capability (or the start
 * failed); the client keeps its 700ms snapshot poll as the fallback live view. When `true` the server
 * is now PUSHING encoded frames on the user's push-status topic and the client paints them on a canvas.
 */
@ObjectType()
export class RemoteBrowserScreencastResult {
  /** Whether the server-pushed screencast is now running for this session. */
  @Field(() => Boolean)
  Streaming: boolean;
}

/**
 * Result of {@link RemoteBrowserActionResolver.StartRemoteBrowserAudioStream} — whether the live tab-audio
 * stream started. When `false` the backend lacks an audio-capture mechanism (v1 gates audio by backend
 * implementation, not a metadata flag) or the start failed; the client simply plays no audio. When `true`
 * the server is now PUSHING encoded audio chunks on the user's push-status topic and the client plays them.
 */
@ObjectType()
export class RemoteBrowserAudioStreamResult {
  /** Whether the server-pushed tab-audio stream is now running for this session. */
  @Field(() => Boolean)
  Streaming: boolean;
}

/**
 * Result of {@link RemoteBrowserActionResolver.GetRemoteBrowserSelection} — the remote page's current text
 * selection, the copy-out half of human clipboard support. `Text` is `''` when nothing is selected, no live
 * browser exists, or the backend can't read the selection (the client then writes nothing to the clipboard).
 */
@ObjectType()
export class RemoteBrowserSelection {
  /** The remote page's current selection text, or `''` when nothing is selected / unavailable. */
  @Field(() => String)
  Text: string;
}

/**
 * One UI element the visual interpreter localized in the screenshot — a label plus the pixel centroid the
 * voice agent can feed straight into `browser_Click(x, y)`. Coordinates are in the SCREENSHOT's own pixel
 * space (top-left origin), which equals the live browser viewport.
 */
@ObjectType()
export class RemoteBrowserInterpretedElement {
  /** Short human-readable label for the element (e.g. `'Sign In button'`). */
  @Field()
  Label: string;

  /** Pixel X of the element's centroid in the screenshot's coordinate space. */
  @Field(() => Float)
  X: number;

  /** Pixel Y of the element's centroid in the screenshot's coordinate space. */
  @Field(() => Float)
  Y: number;

  /** The interpreter's 0-1 confidence that this localization is correct. */
  @Field(() => Float)
  Confidence: number;
}

/**
 * Result of {@link RemoteBrowserActionResolver.InterpretRemoteBrowserPage} — how a fast vision model "sees"
 * the current browser viewport on behalf of a voice agent that cannot view images. `Description` is a concise
 * text summary; `Elements` localizes any UI elements the request asked for (empty for a plain describe).
 * `Detail` carries a non-fatal note (e.g. `'no live browser'` or a vision-error message) — every path is
 * best-effort and never throws.
 */
@ObjectType()
export class RemoteBrowserInterpretation {
  /** A 1-3 sentence summary of what is visible/actionable, or null when nothing could be interpreted. */
  @Field(() => String, { nullable: true })
  Description?: string;

  /** UI elements matching the request, each with a pixel centroid. Empty for a describe-only request. */
  @Field(() => [RemoteBrowserInterpretedElement])
  Elements: RemoteBrowserInterpretedElement[];

  /** Non-fatal note explaining a null/empty result (e.g. `'no live browser'`, a parse/vision error). */
  @Field(() => String, { nullable: true })
  Detail?: string;
}

/** The strict-JSON shape the visual-interpreter prompt is contracted to return, before mapping to GraphQL. */
interface VisualInterpreterPayload {
  description?: string;
  elements?: Array<{ label?: string; x?: number; y?: number; confidence?: number }>;
}

/**
 * Resolver for the Remote Browser native realtime channel. A single {@link RemoteBrowserEngine} instance
 * (the process-wide singleton) backs every request; ownership is enforced per call against the session's
 * `UserID`.
 */
@Resolver()
export class RemoteBrowserActionResolver extends ResolverBase {
  /**
   * Agent-session ids whose live CDP screencast this resolver has already started. Keyed by
   * `agentSessionID` so a re-issued {@link RemoteBrowserActionResolver.StartRemoteBrowserScreencast}
   * (e.g. the surface re-binding after a tab collapse) is idempotent and never stacks two screencasts
   * on the one session. Entries are removed by {@link RemoteBrowserActionResolver.StopRemoteBrowserScreencast}.
   */
  private startedScreencasts = new Set<string>();

  /**
   * Agent-session ids whose live tab-audio stream this resolver has already started. Keyed by
   * `agentSessionID` so a re-issued {@link RemoteBrowserActionResolver.StartRemoteBrowserAudioStream}
   * (the surface re-binding) is idempotent and never stacks two captures on the one session. Entries are
   * removed by {@link RemoteBrowserActionResolver.StopRemoteBrowserAudioStream}.
   */
  private startedAudioStreams = new Set<string>();

  /**
   * Execute ONE browser action relayed from the client-direct realtime session, returning the outcome +
   * resulting URL.
   *
   * Flow:
   * 1. Ownership gate — the session's `UserID` must equal the caller's (throws otherwise).
   * 2. Lazily start (or reuse) the session's browser via {@link RemoteBrowserEngine.StartSessionForAgentSession},
   *    resolving the backend from the agent's `TypeConfiguration` (`{ remoteBrowser: { provider } }`), else
   *    the single Active provider.
   * 3. Build a strongly-typed {@link RemoteBrowserAction} from `kind` + the supplied fields.
   * 4. Execute it against the live session and return the result.
   *
   * @param agentSessionID The `AIAgentSession` id the browser is bound to.
   * @param kind The action kind (`'navigate' | 'click' | 'type' | 'key' | 'scroll' | 'back' | 'forward' | 'wait'`).
   * @returns The action result (success + resulting URL + detail).
   */
  @Mutation(() => RemoteBrowserActionResult)
  async ExecuteRemoteBrowserAction(
    @Arg('agentSessionID', () => String) agentSessionID: string,
    @Arg('kind', () => String) kind: string,
    @Ctx() { userPayload, providers }: AppContext,
    @Arg('url', () => String, { nullable: true }) url?: string,
    @Arg('selector', () => String, { nullable: true }) selector?: string,
    @Arg('x', () => Float, { nullable: true }) x?: number,
    @Arg('y', () => Float, { nullable: true }) y?: number,
    @Arg('text', () => String, { nullable: true }) text?: string,
    @Arg('key', () => String, { nullable: true }) key?: string,
    @Arg('deltaX', () => Float, { nullable: true }) deltaX?: number,
    @Arg('deltaY', () => Float, { nullable: true }) deltaY?: number,
    @Arg('ms', () => Float, { nullable: true }) ms?: number,
  ): Promise<RemoteBrowserActionResult> {
    const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
    const session = await this.loadOwnedSession(agentSessionID, contextUser, provider);

    const action = this.buildAction({ kind, url, selector, x, y, text, key, deltaX, deltaY, ms });
    if (!action) {
      return { Success: false, Detail: `Unknown or incomplete remote-browser action '${kind}'.` };
    }

    const providerName = await this.resolveProviderName(session, contextUser, provider);
    try {
      const liveSession = await RemoteBrowserEngine.Instance.StartSessionForAgentSession(agentSessionID, contextUser, providerName);
      const result = await liveSession.ExecuteAction(action);
      return { Success: result.Success, CurrentUrl: result.CurrentUrl, Detail: result.Detail };
    } catch (err) {
      // Surface the real failure to BOTH the MJAPI terminal (for diagnosis) and the model (so it
      // narrates the actual cause instead of the opaque client-side "no response from the server").
      const message = err instanceof Error ? err.message : String(err);
      LogError(`ExecuteRemoteBrowserAction failed (provider='${providerName}', kind='${kind}'): ${message}`);
      return { Success: false, Detail: `Remote browser error (${providerName}): ${message}` };
    }
  }

  /**
   * Execute a high-level GOAL against the session's browser — the agent sets an intent ("log in and open
   * the latest invoice") and the resolved control strategy (computer-use loop or backend native AI) plans
   * + executes it autonomously, instead of relaying granular actions. Ownership-gated; lazily starts the
   * browser. Returns the terminal outcome (this is a request/response mutation — for live progress
   * narration in a server-bridged realtime session the broker calls {@link RemoteBrowserEngine.AchieveGoal}
   * in-process with an `OnProgress` callback).
   *
   * @param agentSessionID The `AIAgentSession` id the browser is bound to.
   * @param goal The natural-language goal.
   * @returns The goal outcome (success, strategy, status, step count, url, detail).
   */
  @Mutation(() => RemoteBrowserGoalResultType)
  async ExecuteRemoteBrowserGoal(
    @Arg('agentSessionID', () => String) agentSessionID: string,
    @Arg('goal', () => String) goal: string,
    @Ctx() { userPayload, providers }: AppContext,
    @Arg('startUrl', () => String, { nullable: true }) startUrl?: string,
    @Arg('maxSteps', () => Int, { nullable: true }) maxSteps?: number,
    @Arg('preferredStrategy', () => String, { nullable: true }) preferredStrategy?: string,
  ): Promise<RemoteBrowserGoalResultType> {
    const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
    const session = await this.loadOwnedSession(agentSessionID, contextUser, provider);
    const providerName = await this.resolveProviderName(session, contextUser, provider);
    // Observability: nest this goal's many prompt runs under ONE "Browser goal" step on the realtime
    // co-agent run (when the session has one). Best-effort — a null step just means the goal runs unlinked.
    const coAgentRunID = extractCoAgentRunID(session.Config_);
    const goalStep = await beginBrowserGoalStep(provider, contextUser, coAgentRunID, goal);

    // ASYNC START: a goal loop can run for minutes; do NOT hold this request open for it (browser
    // fetch / proxy / janitor timeouts would kill the request while the loop runs on, and the agent
    // would get "no response from the server" despite a successful run). Register the run, kick the
    // loop off WITHOUT awaiting, and return a GoalRunID the client polls via GetRemoteBrowserGoalResult.
    const goalRunID = randomUUID();
    RemoteBrowserGoalRegistry.Instance.Begin(agentSessionID, goalRunID);
    void RemoteBrowserEngine.Instance.AchieveGoal(agentSessionID, goal, {
      ContextUser: contextUser,
      ProviderName: providerName,
      StartUrl: startUrl,
      MaxSteps: maxSteps,
      PreferredStrategy: preferredStrategy === 'NativeAI' || preferredStrategy === 'ComputerUse' ? preferredStrategy : undefined,
      AgentRunID: coAgentRunID,
      AgentRunStepID: goalStep?.ID,
    })
      .then(async (result) => {
        await finalizeBrowserGoalStep(goalStep, result);
        RemoteBrowserGoalRegistry.Instance.Complete(agentSessionID, goalRunID, result);
      })
      .catch(async (err) => {
        const message = err instanceof Error ? err.message : String(err);
        LogError(`ExecuteRemoteBrowserGoal failed (provider='${providerName}'): ${message}`);
        const failure = { Success: false, Status: 'Error', Detail: `Remote browser error (${providerName}): ${message}` };
        await finalizeBrowserGoalStep(goalStep, failure);
        RemoteBrowserGoalRegistry.Instance.Complete(agentSessionID, goalRunID, failure);
      });

    return { Success: true, Status: 'Running', GoalRunID: goalRunID, Detail: 'Goal started.' };
  }

  /**
   * Poll the outcome of a goal STARTED by {@link RemoteBrowserActionResolver.ExecuteRemoteBrowserGoal}.
   * Returns `Status: 'Running'` while the loop is in flight, then the terminal outcome (success,
   * strategy, status, step count, url, detail) once it finishes. Ownership-gated. A `Status: 'Unknown'`
   * result means the run id is unrecognized — it expired (results are retained briefly) or never existed.
   *
   * @param agentSessionID The `AIAgentSession` id the goal runs against.
   * @param goalRunID The handle returned by `ExecuteRemoteBrowserGoal`.
   * @returns The current/terminal goal outcome.
   */
  @Query(() => RemoteBrowserGoalResultType)
  async GetRemoteBrowserGoalResult(
    @Arg('agentSessionID', () => String) agentSessionID: string,
    @Arg('goalRunID', () => String) goalRunID: string,
    @Ctx() { userPayload, providers }: AppContext,
  ): Promise<RemoteBrowserGoalResultType> {
    const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
    await this.loadOwnedSession(agentSessionID, contextUser, provider);
    const record = RemoteBrowserGoalRegistry.Instance.Get(agentSessionID, goalRunID);
    if (!record) {
      return { Success: false, Status: 'Unknown', GoalRunID: goalRunID, Detail: 'No such goal run (it may have expired).' };
    }
    if (record.Status === 'Running' || !record.Outcome) {
      return { Success: false, Status: 'Running', GoalRunID: goalRunID };
    }
    return { ...record.Outcome, GoalRunID: goalRunID };
  }

  /**
   * Return the current viewport screenshot + URL for the session's live browser — the client's live view.
   * Ownership-gated. When the session holds no live browser (never started, or already torn down), the
   * result's fields are null rather than an error.
   *
   * @param agentSessionID The `AIAgentSession` id.
   * @returns The current screenshot + URL, or an empty snapshot when no live browser exists.
   */
  @Query(() => RemoteBrowserSnapshot)
  async RemoteBrowserSnapshot(
    @Arg('agentSessionID', () => String) agentSessionID: string,
    @Ctx() { userPayload, providers }: AppContext,
  ): Promise<RemoteBrowserSnapshot> {
    const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
    await this.loadOwnedSession(agentSessionID, contextUser, provider);

    const liveSession = RemoteBrowserEngine.Instance.GetSessionForAgentSession(agentSessionID);
    if (!liveSession) {
      return {};
    }
    // The snapshot is a best-effort PERCEPTION poll (the surface fires it every ~700ms). A session
    // whose underlying browser adapter has been torn down — a stale/dead handle still in the live
    // map, a mid-poll teardown race, or a recycled backend container — makes CaptureScreenshot()
    // throw "Browser not launched". That must degrade to an empty snapshot (the surface keeps its
    // last good frame), NOT surface as a recurring GraphQL error the client logs on every tick —
    // exactly as this query's contract above promises ("null rather than an error"). The live
    // navigate/click path (ExecuteRemoteBrowserAction) is where a genuine browser failure is
    // reported to the agent; the read-only view poll never should be.
    try {
      const screenshot = await liveSession.CaptureScreenshot();
      return { ScreenshotBase64: screenshot, CurrentUrl: liveSession.GetCurrentUrl() };
    } catch (err) {
      LogError(
        `[RemoteBrowserActionResolver] Snapshot capture failed for agent session ${agentSessionID} ` +
          `(returning empty snapshot): ${err instanceof Error ? err.message : String(err)}`,
      );
      return {};
    }
  }

  /**
   * VISION-QUERY path (separate from the navigate/click {@link RemoteBrowserActionResolver.ExecuteRemoteBrowserAction}
   * path — this OBSERVES the page, it never drives it). Captures the session's current screenshot and runs
   * a fast vision AI Prompt over it so a non-omnimodal voice agent (audio/text-only) can effectively SEE the
   * page: a concise text description ("kinda see") and, when `query` names a target, the pixel centroid(s) the
   * agent can then feed to `browser_Click(x, y)`.
   *
   * Flow:
   * 1. Ownership gate — the session's `UserID` must equal the caller's (throws otherwise).
   * 2. Get the LIVE session and `CaptureScreenshot()`. No live session / no screenshot → `{ Description: null,
   *    Elements: [], Detail: 'no live browser' }`.
   * 3. Run the `Remote Browser Visual Interpreter` prompt with the screenshot as an `image_url` content block
   *    plus an instruction derived from `query` (empty/"describe" → describe; a named target → locate it).
   * 4. Parse the strict-JSON result tolerantly and map it to {@link RemoteBrowserInterpretation}.
   *
   * Best-effort + tolerant by contract: any vision/prompt/parse failure is logged and returned as
   * `{ Description: null, Elements: [], Detail: <message> }`. This mutation NEVER throws past the ownership gate.
   *
   * @param agentSessionID The `AIAgentSession` id the browser is bound to.
   * @param query Optional request — empty/"describe" for a page description, else a visual target to localize.
   * @returns The interpretation (description + localized elements + optional detail note).
   */
  @Mutation(() => RemoteBrowserInterpretation)
  async InterpretRemoteBrowserPage(
    @Arg('agentSessionID', () => String) agentSessionID: string,
    @Ctx() { userPayload, providers }: AppContext,
    @Arg('query', () => String, { nullable: true }) query?: string,
  ): Promise<RemoteBrowserInterpretation> {
    const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
    await this.loadOwnedSession(agentSessionID, contextUser, provider);

    const liveSession = RemoteBrowserEngine.Instance.GetSessionForAgentSession(agentSessionID);
    if (!liveSession) {
      return { Description: undefined, Elements: [], Detail: 'no live browser' };
    }

    try {
      const screenshot = await liveSession.CaptureScreenshot();
      if (!screenshot) {
        return { Description: undefined, Elements: [], Detail: 'no live browser' };
      }
      return await this.runVisualInterpreter(screenshot, query, contextUser);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      LogError(`InterpretRemoteBrowserPage failed for session ${agentSessionID}: ${message}`);
      return { Description: undefined, Elements: [], Detail: message };
    }
  }

  /**
   * Starts a live CDP screencast on the session's browser and PUSHES each encoded frame to the calling
   * user's push-status topic — replacing the client's 700ms snapshot poll with low-latency pushed frames.
   * Ownership-gated. Idempotent: a re-call for an already-streaming session is a no-op that reports
   * `Streaming: true`.
   *
   * Capability gating: {@link IRemoteBrowserSession.StartScreencast} throws
   * {@link RemoteBrowserCapabilityNotSupportedError} on a backend without `ScreenStreaming` — caught here
   * and reported as `Streaming: false`, leaving the client on its polling fallback. Any other failure is
   * logged and likewise reported as `Streaming: false` (the poll keeps the view alive).
   *
   * @param agentSessionID The `AIAgentSession` id the browser is bound to.
   * @returns `{ Streaming: true }` when frames are now being pushed, else `{ Streaming: false }`.
   */
  @Mutation(() => RemoteBrowserScreencastResult)
  async StartRemoteBrowserScreencast(
    @Arg('agentSessionID', () => String) agentSessionID: string,
    @Ctx() { userPayload, providers }: AppContext,
    @PubSub() pubSub: PubSubEngine,
  ): Promise<RemoteBrowserScreencastResult> {
    const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
    const session = await this.loadOwnedSession(agentSessionID, contextUser, provider);

    // Idempotent: a re-bind must not stack a second screencast on the one live browser.
    if (this.startedScreencasts.has(agentSessionID)) {
      return { Streaming: true };
    }

    const providerName = await this.resolveProviderName(session, contextUser, provider);
    try {
      const liveSession = await RemoteBrowserEngine.Instance.StartSessionForAgentSession(agentSessionID, contextUser, providerName);
      await liveSession.StartScreencast((frame) => this.publishFrame(pubSub, userPayload, agentSessionID, frame));
      this.startedScreencasts.add(agentSessionID);
      return { Streaming: true };
    } catch (err) {
      if (err instanceof RemoteBrowserCapabilityNotSupportedError) {
        // Backend can't stream — the client keeps polling. Not an error condition.
        return { Streaming: false };
      }
      const message = err instanceof Error ? err.message : String(err);
      LogError(`StartRemoteBrowserScreencast failed (provider='${providerName}'): ${message}`);
      return { Streaming: false };
    }
  }

  /**
   * Stops a screencast previously started by {@link RemoteBrowserActionResolver.StartRemoteBrowserScreencast}.
   * Ownership-gated and best-effort: when no live browser exists, or `StopScreencast` rejects, the call
   * still resolves `true` (the client's teardown should never depend on this succeeding).
   *
   * @param agentSessionID The `AIAgentSession` id.
   * @returns `true` (always) once the stop has been attempted.
   */
  @Mutation(() => Boolean)
  async StopRemoteBrowserScreencast(
    @Arg('agentSessionID', () => String) agentSessionID: string,
    @Ctx() { userPayload, providers }: AppContext,
  ): Promise<boolean> {
    const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
    await this.loadOwnedSession(agentSessionID, contextUser, provider);

    this.startedScreencasts.delete(agentSessionID);
    const liveSession = RemoteBrowserEngine.Instance.GetSessionForAgentSession(agentSessionID);
    if (liveSession) {
      try {
        await liveSession.StopScreencast();
      } catch (err) {
        // Best-effort: a backend without ScreenStreaming throws here too; teardown ignores it.
        const message = err instanceof Error ? err.message : String(err);
        LogError(`StopRemoteBrowserScreencast (best-effort) for session ${agentSessionID}: ${message}`);
      }
    }
    return true;
  }

  /**
   * Starts streaming the session browser's TAB AUDIO and PUSHES each encoded chunk to the calling user's
   * push-status topic — so a co-agent demoing a video/audio site is HEARD, not just seen. Ownership-gated.
   * Idempotent: a re-call for an already-streaming session is a no-op that reports `Streaming: true`.
   *
   * Capability gating (v1 = by backend implementation): {@link IRemoteBrowserSession.StartAudioStream}
   * throws {@link RemoteBrowserCapabilityNotSupportedError} on a backend with no audio-capture mechanism —
   * caught here and reported as `Streaming: false` (the client simply plays no audio). Any other failure is
   * logged and likewise reported as `Streaming: false`.
   *
   * @param agentSessionID The `AIAgentSession` id the browser is bound to.
   * @returns `{ Streaming: true }` when audio chunks are now being pushed, else `{ Streaming: false }`.
   */
  @Mutation(() => RemoteBrowserAudioStreamResult)
  async StartRemoteBrowserAudioStream(
    @Arg('agentSessionID', () => String) agentSessionID: string,
    @Ctx() { userPayload, providers }: AppContext,
    @PubSub() pubSub: PubSubEngine,
  ): Promise<RemoteBrowserAudioStreamResult> {
    const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
    const session = await this.loadOwnedSession(agentSessionID, contextUser, provider);

    // Idempotent: a re-bind must not stack a second audio capture on the one live browser.
    if (this.startedAudioStreams.has(agentSessionID)) {
      return { Streaming: true };
    }

    const providerName = await this.resolveProviderName(session, contextUser, provider);
    try {
      const liveSession = await RemoteBrowserEngine.Instance.StartSessionForAgentSession(agentSessionID, contextUser, providerName);
      await liveSession.StartAudioStream((chunk) => this.publishAudioChunk(pubSub, userPayload, agentSessionID, chunk));
      this.startedAudioStreams.add(agentSessionID);
      return { Streaming: true };
    } catch (err) {
      if (err instanceof RemoteBrowserCapabilityNotSupportedError) {
        // Backend can't capture audio — the client plays no audio. Not an error condition.
        return { Streaming: false };
      }
      const message = err instanceof Error ? err.message : String(err);
      LogError(`StartRemoteBrowserAudioStream failed (provider='${providerName}'): ${message}`);
      return { Streaming: false };
    }
  }

  /**
   * Stops a tab-audio stream previously started by {@link RemoteBrowserActionResolver.StartRemoteBrowserAudioStream}.
   * Ownership-gated and best-effort: when no live browser exists, or `StopAudioStream` rejects, the call
   * still resolves `true` (the client's teardown should never depend on this succeeding).
   *
   * @param agentSessionID The `AIAgentSession` id.
   * @returns `true` (always) once the stop has been attempted.
   */
  @Mutation(() => Boolean)
  async StopRemoteBrowserAudioStream(
    @Arg('agentSessionID', () => String) agentSessionID: string,
    @Ctx() { userPayload, providers }: AppContext,
  ): Promise<boolean> {
    const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
    await this.loadOwnedSession(agentSessionID, contextUser, provider);

    this.startedAudioStreams.delete(agentSessionID);
    const liveSession = RemoteBrowserEngine.Instance.GetSessionForAgentSession(agentSessionID);
    if (liveSession) {
      try {
        await liveSession.StopAudioStream();
      } catch (err) {
        // Best-effort: a backend without audio capture throws here too; teardown ignores it.
        const message = err instanceof Error ? err.message : String(err);
        LogError(`StopRemoteBrowserAudioStream (best-effort) for session ${agentSessionID}: ${message}`);
      }
    }
    return true;
  }

  /**
   * Relays ONE human-takeover input (pointer move/click or key press) from the user watching the live
   * screencast into the session's server-hosted browser — the "grab the wheel" path. Ownership-gated.
   * The surface captures the event on the live-view canvas, maps display→viewport coordinates, and calls
   * this; the resolver builds a strongly-typed {@link RemoteBrowserHumanInput} and routes it over CDP via
   * {@link IRemoteBrowserSession.RouteHumanInput}.
   *
   * Gracefully best-effort, never throws past the ownership gate:
   * - No live browser for the session → `false`.
   * - Unknown/incomplete input (`buildHumanInput` returns null) → `false`.
   * - Backend lacks `HumanTakeover` ({@link RemoteBrowserCapabilityNotSupportedError}) → `false` (the
   *   live view stays view-only for that backend).
   * - Any other failure → logged + `false`.
   *
   * NOTE: this prototype does NOT reject by control mode here — the engine's floor arbiter governs the
   * agent⇄human floor, so we just relay. Finer floor / `AgentOnly` gating is a follow-up.
   *
   * @param agentSessionID The `AIAgentSession` id the browser is bound to.
   * @param kind The input kind (`'pointer-move' | 'pointer-click' | 'pointer-down' | 'pointer-up' | 'key' | 'text' | 'scroll'`).
   * @param text The pasted text (the `'text'` paste-in kind only) — inserted into the page's focused element.
   * @param modifiers Optional comma-separated modifier keys held during the input (`'Shift'`, `'Control'`,
   *   `'Alt'`, `'Meta'`) — carries Shift-click selection and Ctrl/Cmd+key chords faithfully.
   * @returns `true` when the input was routed, else `false`.
   */
  @Mutation(() => Boolean)
  async RelayRemoteBrowserHumanInput(
    @Arg('agentSessionID', () => String) agentSessionID: string,
    @Arg('kind', () => String) kind: string,
    @Ctx() { userPayload, providers }: AppContext,
    @Arg('x', () => Float, { nullable: true }) x?: number,
    @Arg('y', () => Float, { nullable: true }) y?: number,
    @Arg('button', () => String, { nullable: true }) button?: string,
    @Arg('key', () => String, { nullable: true }) key?: string,
    @Arg('text', () => String, { nullable: true }) text?: string,
    @Arg('deltaX', () => Float, { nullable: true }) deltaX?: number,
    @Arg('deltaY', () => Float, { nullable: true }) deltaY?: number,
    @Arg('modifiers', () => String, { nullable: true }) modifiers?: string,
  ): Promise<boolean> {
    const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
    await this.loadOwnedSession(agentSessionID, contextUser, provider);

    const liveSession = RemoteBrowserEngine.Instance.GetSessionForAgentSession(agentSessionID);
    if (!liveSession) {
      return false;
    }

    const input = this.buildHumanInput({ kind, x, y, button, key, text, deltaX, deltaY, modifiers });
    if (!input) {
      return false;
    }

    try {
      liveSession.RouteHumanInput(input);
      return true;
    } catch (err) {
      if (err instanceof RemoteBrowserCapabilityNotSupportedError) {
        // Backend can't take human input — the live view stays view-only. Not an error condition.
        return false;
      }
      const message = err instanceof Error ? err.message : String(err);
      LogError(`RelayRemoteBrowserHumanInput failed (kind='${kind}'): ${message}`);
      return false;
    }
  }

  /**
   * Returns the remote page's CURRENT text selection — the copy-out half of human clipboard support. The
   * viewer captures a local `copy` / Cmd+C, calls this to read what the human selected on the live page, and
   * writes the result to the LOCAL clipboard (sidestepping the isolated remote clipboard, the mirror of the
   * `'text'` paste-in path). Ownership-gated.
   *
   * Gracefully best-effort, never throws past the ownership gate (mirrors {@link RemoteBrowserSnapshot}):
   * - No live browser for the session → `{ Text: '' }`.
   * - Backend lacks `HumanTakeover` ({@link RemoteBrowserCapabilityNotSupportedError}) → `{ Text: '' }`.
   * - Nothing selected / any other read failure → `{ Text: '' }` (logged).
   *
   * @param agentSessionID The `AIAgentSession` id the browser is bound to.
   * @returns The selection text, or `{ Text: '' }` when none is readable.
   */
  @Query(() => RemoteBrowserSelection)
  async GetRemoteBrowserSelection(
    @Arg('agentSessionID', () => String) agentSessionID: string,
    @Ctx() { userPayload, providers }: AppContext,
  ): Promise<RemoteBrowserSelection> {
    const { contextUser, provider } = this.requireUserAndProvider(userPayload, providers);
    await this.loadOwnedSession(agentSessionID, contextUser, provider);

    const liveSession = RemoteBrowserEngine.Instance.GetSessionForAgentSession(agentSessionID);
    if (!liveSession) {
      return { Text: '' };
    }

    try {
      return { Text: await liveSession.GetSelectionText() };
    } catch (err) {
      if (err instanceof RemoteBrowserCapabilityNotSupportedError) {
        // Backend can't read the selection — copy-out is simply unavailable. Not an error condition.
        return { Text: '' };
      }
      const message = err instanceof Error ? err.message : String(err);
      LogError(`GetRemoteBrowserSelection failed for session ${agentSessionID}: ${message}`);
      return { Text: '' };
    }
  }

  // ----- internals -------------------------------------------------------------------------

  /**
   * Publishes one encoded screencast frame to the calling user's push-status topic, in the same envelope
   * shape the conversations client already routes (mirrors `RealtimeClientSessionResolver`'s delegation
   * progress publish). The client matches on `resolver` + `type`, then on `agentSessionID`, and paints
   * `dataBase64` onto its canvas.
   *
   * @param pubSub The resolver-injected pub/sub engine.
   * @param userPayload The calling user's payload (its `sessionId` scopes the topic to this browser).
   * @param agentSessionID The `AIAgentSession` id the frame belongs to.
   * @param frame The encoded viewport frame.
   */
  private publishFrame(
    pubSub: PubSubEngine,
    userPayload: UserPayload,
    agentSessionID: string,
    frame: { DataBase64: string; Width: number; Height: number; SequenceNumber: number },
  ): void {
    pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
      message: JSON.stringify({
        resolver: 'RemoteBrowserActionResolver',
        type: 'RemoteBrowserScreencastFrame',
        agentSessionID,
        dataBase64: frame.DataBase64,
        width: frame.Width,
        height: frame.Height,
        seq: frame.SequenceNumber,
      }),
      sessionId: userPayload.sessionId,
    });
  }

  /**
   * Publishes one encoded tab-audio chunk to the calling user's push-status topic, in the same envelope
   * shape the conversations client routes for screencast frames (distinguished by `type`). The client
   * matches on `resolver` + `type`, then on `agentSessionID`, and feeds `dataBase64` to its audio player.
   *
   * @param pubSub The resolver-injected pub/sub engine.
   * @param userPayload The calling user's payload (its `sessionId` scopes the topic to this browser).
   * @param agentSessionID The `AIAgentSession` id the chunk belongs to.
   * @param chunk The encoded audio chunk.
   */
  private publishAudioChunk(pubSub: PubSubEngine, userPayload: UserPayload, agentSessionID: string, chunk: RemoteBrowserAudioChunk): void {
    pubSub.publish(PUSH_STATUS_UPDATES_TOPIC, {
      message: JSON.stringify({
        resolver: 'RemoteBrowserActionResolver',
        type: 'RemoteBrowserAudioChunk',
        agentSessionID,
        dataBase64: chunk.DataBase64,
        codec: chunk.Codec,
        sampleRate: chunk.SampleRate,
        channels: chunk.Channels,
        seq: chunk.SequenceNumber,
      }),
      sessionId: userPayload.sessionId,
    });
  }

  /**
   * Runs the governable `Remote Browser Visual Interpreter` AI Prompt over a screenshot + request, and maps
   * its strict-JSON output to {@link RemoteBrowserInterpretation}. The model is chosen by the PROMPT's own
   * `MJ: AI Prompt Models` association (pinned to Gemini 3.1 Flash-Lite in metadata) — not hard-coded here.
   * Tolerant: a missing prompt, a failed run, or unparseable output all degrade to a best-effort result.
   *
   * @param screenshotBase64 The raw Base64 viewport screenshot (no `data:` prefix).
   * @param query The agent's request — empty/"describe" for a description, else a target to localize.
   * @param contextUser The owning user (server-side multi-user safety).
   * @returns The mapped interpretation.
   */
  private async runVisualInterpreter(screenshotBase64: string, query: string | undefined, contextUser: UserInfo): Promise<RemoteBrowserInterpretation> {
    await AIEngine.Instance.Config(false, contextUser);
    const promptEntity = AIEngine.Instance.Prompts.find((p) => p.Name?.trim().toLowerCase() === VISUAL_INTERPRETER_PROMPT_NAME.toLowerCase());
    if (!promptEntity) {
      const detail = `Visual interpreter prompt '${VISUAL_INTERPRETER_PROMPT_NAME}' not found.`;
      LogError(detail);
      return { Description: undefined, Elements: [], Detail: detail };
    }

    const instruction = this.buildInterpreterInstruction(query);
    const params = new AIPromptParams();
    params.prompt = promptEntity;
    params.contextUser = contextUser;
    // The template surfaces the request via a {{ query }} variable; the screenshot rides as an image block.
    params.data = { query: instruction };
    params.conversationMessages = [
      {
        role: 'user',
        content: [
          { type: 'text', content: instruction },
          // Declare the explicit MIME so the modality check matches a concrete
          // 'image/jpeg' driver capability (not just a wildcard probe).
          { type: 'image_url', content: `data:image/jpeg;base64,${screenshotBase64}`, mimeType: 'image/jpeg' },
        ],
      },
    ];

    const runner = new AIPromptRunner();
    const result = await runner.ExecutePrompt(params);
    if (!result.success) {
      const detail = result.errorMessage ?? 'Visual interpreter prompt failed.';
      LogError(`InterpretRemoteBrowserPage: vision prompt failed: ${detail}`);
      return { Description: undefined, Elements: [], Detail: detail };
    }
    return this.mapInterpreterResult(result.rawResult);
  }

  /**
   * Builds the natural-language instruction handed to the visual interpreter from the raw `query`. An empty
   * / blank / "describe" request asks for a concise page description; anything else asks to locate that target
   * and return its pixel centroid.
   *
   * @param query The raw request from the agent.
   * @returns The instruction string.
   */
  private buildInterpreterInstruction(query: string | undefined): string {
    const trimmed = query?.trim();
    if (!trimmed || trimmed.toLowerCase() === 'describe') {
      return 'Describe concisely what is visible and actionable on this page. Return an empty elements array.';
    }
    return (
      `Find this UI element and report its approximate pixel centroid: "${trimmed}". ` +
      'Also give a one-sentence description of the page for context. ' +
      'If the element is not present, return an empty elements array.'
    );
  }

  /**
   * Tolerantly parses the interpreter's raw text output into a {@link RemoteBrowserInterpretation}. Strips
   * code fences before parsing; on parse failure returns the raw text as `Description` with no elements.
   *
   * @param raw The prompt's raw text output (may be null/undefined/fenced JSON).
   * @returns The mapped interpretation.
   */
  private mapInterpreterResult(raw: string | null | undefined): RemoteBrowserInterpretation {
    const text = (raw ?? '').trim();
    if (text.length === 0) {
      return { Description: undefined, Elements: [], Detail: 'Empty interpreter response.' };
    }
    const stripped = this.stripCodeFences(text);
    let payload: VisualInterpreterPayload;
    try {
      const parsed: unknown = JSON.parse(stripped);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { Description: text, Elements: [], Detail: 'Interpreter output was not a JSON object.' };
      }
      payload = parsed as VisualInterpreterPayload;
    } catch {
      // Not JSON — hand the raw text back as the description so the agent still gets something useful.
      return { Description: text, Elements: [] };
    }

    const elements = Array.isArray(payload.elements)
      ? payload.elements
          .filter((e) => typeof e?.x === 'number' && typeof e?.y === 'number')
          .map((e) => ({
            Label: typeof e.label === 'string' ? e.label : '',
            X: e.x as number,
            Y: e.y as number,
            Confidence: typeof e.confidence === 'number' ? e.confidence : 0,
          }))
      : [];
    return {
      Description: typeof payload.description === 'string' ? payload.description : undefined,
      Elements: elements,
    };
  }

  /**
   * Strips a leading/trailing Markdown code fence (```json … ```) from a model response so the inner JSON can
   * be parsed. Returns the input unchanged when no fence is present.
   *
   * @param text The possibly-fenced text.
   * @returns The text with any surrounding fence removed.
   */
  private stripCodeFences(text: string): string {
    const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
    const match = fence.exec(text.trim());
    return match ? match[1].trim() : text;
  }

  /** Resolve the request user + read-write provider, throwing a clear error if unauthenticated. */
  protected requireUserAndProvider(
    userPayload: AppContext['userPayload'],
    providers: AppContext['providers'],
  ): { contextUser: UserInfo; provider: IMetadataProvider } {
    const contextUser = this.GetUserFromPayload(userPayload);
    if (!contextUser) {
      throw new Error('Not authenticated: no user context for remote-browser operation');
    }
    return { contextUser, provider: GetReadWriteProvider(providers) };
  }

  /**
   * Loads the agent session and enforces inbound ownership: the session's `UserID` must equal the
   * caller's. Throws when the session is missing or owned by another user.
   *
   * @param agentSessionID The `AIAgentSession` id.
   * @returns The loaded, owned session entity.
   */
  protected async loadOwnedSession(agentSessionID: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<MJAIAgentSessionEntity> {
    const session = await provider.GetEntityObject<MJAIAgentSessionEntity>(SESSION_ENTITY, contextUser);
    if (!(await session.Load(agentSessionID))) {
      throw new Error(`Remote-browser session ${agentSessionID} not found.`);
    }
    if (!UUIDsEqual(session.UserID, contextUser.ID)) {
      throw new Error(`Not authorized: remote-browser session ${agentSessionID} is not owned by you.`);
    }
    return session;
  }

  /**
   * Resolves the remote-browser backend name for the session from the session's agent's
   * `TypeConfiguration` JSON (`{ remoteBrowser: { provider } }`). Best-effort: a missing agent, absent
   * config, or unparseable JSON all yield `undefined`, letting the engine fall back to the single Active
   * provider.
   *
   * @param session The owned session entity (supplies the agent id).
   * @returns The configured backend name, or `undefined` to let the engine auto-select.
   */
  protected async resolveProviderName(session: MJAIAgentSessionEntity, contextUser: UserInfo, provider: IMetadataProvider): Promise<string | undefined> {
    // The session's agent IS the co-agent (the realtime voice agent), and the interactive channels
    // (Remote Browser, Whiteboard) are the CO-AGENT's abilities — so the remoteBrowser backend config
    // lives on the co-agent's TypeConfiguration, not on the target agent it voices.
    try {
      const agent = await provider.GetEntityObject<MJAIAgentEntity>(AGENT_ENTITY, contextUser);
      if (!(await agent.Load(session.AgentID))) {
        return undefined;
      }
      const config = this.parseTypeConfiguration(agent.TypeConfiguration);
      const name = config?.remoteBrowser?.provider?.trim();
      return name && name.length > 0 ? name : undefined;
    } catch (error) {
      LogError(
        `ExecuteRemoteBrowserAction: failed to read agent TypeConfiguration for session ${session.ID} — ` +
          `falling back to the single Active provider: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  /**
   * Parses an agent's `TypeConfiguration` JSON into the {@link RemoteBrowserTypeConfiguration} slice this
   * resolver reads. Returns `null` for null/blank/non-object/unparseable input.
   *
   * @param json The raw `TypeConfiguration` JSON, or null.
   * @returns The parsed config slice, or `null`.
   */
  private parseTypeConfiguration(json: string | null): RemoteBrowserTypeConfiguration | null {
    if (!json || json.trim().length === 0) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(json);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as RemoteBrowserTypeConfiguration) : null;
    } catch {
      return null;
    }
  }

  /**
   * Builds a strongly-typed {@link RemoteBrowserAction} from the relayed `kind` + fields, validating the
   * fields each kind requires. Returns `null` for an unknown kind or a kind missing its required field(s).
   *
   * @param input The relayed action kind + all optional fields.
   * @returns The built action, or `null` when the kind is unknown / incomplete.
   */
  private buildAction(input: {
    kind: string;
    url?: string;
    selector?: string;
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    deltaX?: number;
    deltaY?: number;
    ms?: number;
  }): RemoteBrowserAction | null {
    switch (input.kind) {
      case 'navigate':
        return input.url ? { Kind: 'navigate', Url: input.url } : null;
      case 'click':
        if (input.selector || (typeof input.x === 'number' && typeof input.y === 'number')) {
          return { Kind: 'click', Selector: input.selector, X: input.x, Y: input.y };
        }
        return null;
      case 'type':
        return typeof input.text === 'string' ? { Kind: 'type', Text: input.text, Selector: input.selector } : null;
      case 'key':
        return input.key ? { Kind: 'key', Key: input.key } : null;
      case 'scroll':
        if (input.selector || typeof input.deltaX === 'number' || typeof input.deltaY === 'number') {
          return { Kind: 'scroll', DeltaX: input.deltaX, DeltaY: input.deltaY, Selector: input.selector };
        }
        return null;
      case 'back':
        return { Kind: 'back' };
      case 'forward':
        return { Kind: 'forward' };
      case 'wait':
        if (typeof input.ms === 'number' || input.selector) {
          return { Kind: 'wait', Ms: input.ms, Selector: input.selector };
        }
        return null;
      default:
        return null;
    }
  }

  /**
   * Builds a strongly-typed {@link RemoteBrowserHumanInput} from the relayed `kind` + fields, validating
   * each kind's required field(s). Returns `null` for an unknown kind or a kind missing its required
   * field(s): pointer-move/click/down/up need finite `x`,`y`; key needs a non-empty `key`; text needs a
   * non-empty `text`; scroll needs finite `x`,`y`,`deltaX`,`deltaY`. The `button` is clamped to the allowed
   * union (`'left' | 'middle' | 'right'`), defaulting unknown/absent values to `'left'`. Held `modifiers`
   * (e.g. Shift-click, Ctrl/Cmd+key) ride on pointer clicks/presses and key presses.
   *
   * @param input The relayed input kind + all optional fields.
   * @returns The built human input, or `null` when the kind is unknown / incomplete.
   */
  private buildHumanInput(input: {
    kind: string;
    x?: number;
    y?: number;
    button?: string;
    key?: string;
    text?: string;
    deltaX?: number;
    deltaY?: number;
    modifiers?: string;
  }): RemoteBrowserHumanInput | null {
    const modifiers = this.parseModifiers(input.modifiers);
    const hasXy = Number.isFinite(input.x) && Number.isFinite(input.y);
    switch (input.kind) {
      case 'pointer-move':
        return hasXy ? { Kind: 'pointer-move', X: input.x as number, Y: input.y as number } : null;
      case 'pointer-click':
        return hasXy
          ? {
              Kind: 'pointer-click',
              X: input.x as number,
              Y: input.y as number,
              Button: this.clampButton(input.button),
              ...(modifiers.length ? { Modifiers: modifiers } : {}),
            }
          : null;
      case 'pointer-down':
        return hasXy
          ? {
              Kind: 'pointer-down',
              X: input.x as number,
              Y: input.y as number,
              Button: this.clampButton(input.button),
              ...(modifiers.length ? { Modifiers: modifiers } : {}),
            }
          : null;
      case 'pointer-up':
        return hasXy
          ? {
              Kind: 'pointer-up',
              X: input.x as number,
              Y: input.y as number,
              Button: this.clampButton(input.button),
              ...(modifiers.length ? { Modifiers: modifiers } : {}),
            }
          : null;
      case 'key':
        return input.key && input.key.length > 0 ? { Kind: 'key', Key: input.key, ...(modifiers.length ? { Modifiers: modifiers } : {}) } : null;
      case 'text':
        // Human paste — insert the relayed clipboard text into the focused element. Empty text is a no-op.
        return typeof input.text === 'string' && input.text.length > 0 ? { Kind: 'text', Text: input.text } : null;
      case 'scroll':
        return hasXy && Number.isFinite(input.deltaX) && Number.isFinite(input.deltaY)
          ? { Kind: 'scroll', X: input.x as number, Y: input.y as number, DeltaX: input.deltaX as number, DeltaY: input.deltaY as number }
          : null;
      default:
        return null;
    }
  }

  /** Clamps a relayed mouse-button string to the allowed union, defaulting to `'left'`. */
  private clampButton(button: string | undefined): 'left' | 'middle' | 'right' {
    return button === 'middle' || button === 'right' ? button : 'left';
  }

  /**
   * Parses the relayed comma-separated `modifiers` string into the validated
   * {@link RemoteBrowserModifierKey} list, dropping any unrecognized token. Returns an empty array for a
   * null/blank input.
   *
   * @param modifiers The raw `'Shift,Control'`-style CSV, or undefined.
   * @returns The validated modifier list (possibly empty).
   */
  private parseModifiers(modifiers: string | undefined): RemoteBrowserModifierKey[] {
    if (!modifiers) {
      return [];
    }
    const allowed: RemoteBrowserModifierKey[] = ['Shift', 'Control', 'Alt', 'Meta'];
    return modifiers
      .split(',')
      .map((m) => m.trim())
      .filter((m): m is RemoteBrowserModifierKey => (allowed as string[]).includes(m));
  }
}
