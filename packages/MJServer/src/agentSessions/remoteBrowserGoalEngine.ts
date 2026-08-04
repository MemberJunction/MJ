/**
 * @fileoverview **Production binding** of the Remote Browser goal-engine seam to MJ's computer-use engine.
 *
 * The CDP remote-browser session ({@link CdpRemoteBrowserSession}) runs goal-driven browser control through
 * an injectable {@link ComputerUseGoalRun} factory. By default that factory yields a bare
 * `ProgressComputerUseEngine` (base computer-use), which has no model auto-selection — so it can't run a goal
 * unsupervised. This module binds the factory to {@link MJProgressComputerUseEngine}: an MJ-aware engine that
 * routes controller/judge prompts through `AIPromptRunner`, auto-selects a vision-capable model from MJ
 * metadata, persists step media, AND forwards per-step progress for live narration.
 *
 * Called once at server startup from `agentSessions/index.ts` (the realtime composition point), so every
 * goal-driven run on this process uses the MJ engine. Kept here (an application package), not in any library,
 * because it is the seam where the transport-neutral CDP layer is wired to MJ's AI stack.
 *
 * @module @memberjunction/server
 */

import { UserInfo, LogError, IMetadataProvider, RunView } from '@memberjunction/core';
import { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';
import { initAgentRunStep, finalizeAgentRunStep } from '@memberjunction/ai-core-plus';
import type { ComputerUseResult, RunComputerUseParams, StepRecord } from '@memberjunction/computer-use';
import { MJComputerUseEngine, MJRunComputerUseParams } from '@memberjunction/computer-use-engine';
import type { RemoteBrowserGoalResult } from '@memberjunction/remote-browser-base';
import { buildProgressNote, CdpRemoteBrowserSession, type ComputerUseGoalProgress, type ComputerUseGoalRun } from '@memberjunction/remote-browser-cdp';

/**
 * Adapts the transport-neutral base computer-use params into {@link MJRunComputerUseParams}, injecting the
 * acting user so the MJ engine can run its controller/judge prompts as that user. Pure + exported for unit
 * testing; {@link MJProgressComputerUseEngine.Run} is a one-liner over it.
 *
 * @param params The base computer-use params the CDP session built (goal + step cap + start url).
 * @param contextUser The acting MJ user (may be undefined; the MJ engine handles the unset case).
 * @param agentRunID Optional parent agent-run id (links the goal's prompt runs to the realtime agent run).
 * @param agentRunStepID Optional parent agent-run-step id (nests a child prompt step per prompt under it).
 * @returns The MJ-aware params to hand to `MJComputerUseEngine.Run`.
 */
export function buildMJGoalParams(params: RunComputerUseParams, contextUser?: UserInfo, agentRunID?: string, agentRunStepID?: string): MJRunComputerUseParams {
  const mjParams = Object.assign(new MJRunComputerUseParams(), params);
  mjParams.ContextUser = contextUser;
  mjParams.AgentRunId = agentRunID;
  mjParams.AgentRunStepID = agentRunStepID;
  return mjParams;
}

/**
 * The MJ-aware goal engine bound in production. Extends {@link MJComputerUseEngine} (prompt-runner routing,
 * vision-model auto-selection, credential resolution, media persistence) and satisfies the
 * {@link ComputerUseGoalRun} seam:
 *
 * - {@link SetBrowserAdapter} / {@link Stop} are inherited from the base computer-use engine.
 * - {@link OnProgress} + {@link ContextUser} are set by the CDP session before {@link Run}.
 * - {@link Run} adapts the transport-neutral base params into {@link MJRunComputerUseParams} (injecting the
 *   acting user) so the MJ engine can run its prompts.
 * - {@link onStepComplete} chains the MJ media-persistence behavior, then forwards a model-safe progress note.
 */
export class MJProgressComputerUseEngine extends MJComputerUseEngine implements ComputerUseGoalRun {
  /** Per-step progress hook the CDP session sets before {@link Run} (drives live narration). */
  public OnProgress?: (progress: ComputerUseGoalProgress) => void;

  /** The MJ user the goal run executes as; the CDP session sets it from the session's context user. */
  public ContextUser?: UserInfo;

  /** Parent agent-run id the CDP session sets before {@link Run} (links the goal's prompt runs to it). */
  public AgentRunID?: string;

  /** Parent agent-run-step id the CDP session sets before {@link Run} (nests child prompt steps under it). */
  public AgentRunStepID?: string;

  /**
   * Adapts the transport-neutral base params into {@link MJRunComputerUseParams} (carrying the acting user
   * + the parent run/step linkage) and delegates to the MJ engine, which auto-selects a vision-capable
   * controller model from MJ metadata and nests a child step per prompt when the linkage is present.
   *
   * @param params The base computer-use params the CDP session built (goal + step cap + start url).
   * @returns The computer-use run result.
   */
  public override async Run(params: RunComputerUseParams): Promise<ComputerUseResult> {
    return super.Run(buildMJGoalParams(params, this.ContextUser, this.AgentRunID, this.AgentRunStepID));
  }

  protected override onStepComplete(step: StepRecord, params: MJRunComputerUseParams): void {
    super.onStepComplete(step, params); // keep MJ media persistence
    this.OnProgress?.(buildProgressNote(step)); // shared note shape with the base ProgressComputerUseEngine
  }
}

/**
 * Extracts the realtime co-agent observability run id from an `AIAgentSession.Config_` JSON blob (the
 * `coAgentRunID` a voice session persists). Returns `undefined` for a missing/non-voice/un-parseable
 * config — goal-run observability is best-effort and degrades to "no parent run" cleanly.
 *
 * @param configJson The session's `Config_` string.
 * @returns The co-agent run id, or `undefined`.
 */
export function extractCoAgentRunID(configJson: string | null | undefined): string | undefined {
  if (!configJson) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(configJson) as { coAgentRunID?: unknown };
    return typeof parsed.coAgentRunID === 'string' ? parsed.coAgentRunID : undefined;
  } catch {
    return undefined;
  }
}

/** Truncates a goal to a step-name-friendly length. */
function goalStepName(goal: string): string {
  const trimmed = goal.trim();
  return `Browser goal: ${trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed}`;
}

/**
 * Creates the parent `Tool` step ("Browser goal: …") on the realtime co-agent run for a goal-driven browser
 * run — a single top-level timeline node the computer-use prompt steps then nest under. Best-effort: returns
 * `null` (so the goal still runs, just unlinked) when there's no co-agent run to attach to, or on any error.
 * Uses the shared {@link initAgentRunStep} helper so the field shape matches every other agent-run step.
 *
 * @param provider The metadata provider.
 * @param contextUser The acting user.
 * @param coAgentRunID The realtime co-agent run id (the parent run), or `undefined`.
 * @param goal The natural-language goal (becomes the step name).
 * @returns The saved parent step (to finalize + nest under), or `null`.
 */
export async function beginBrowserGoalStep(
  provider: IMetadataProvider,
  contextUser: UserInfo | undefined,
  coAgentRunID: string | undefined,
  goal: string,
): Promise<MJAIAgentRunStepEntity | null> {
  if (!coAgentRunID) {
    return null;
  }
  try {
    const rv = new RunView();
    const countResult = await rv.RunView(
      { EntityName: 'MJ: AI Agent Run Steps', ExtraFilter: `AgentRunID='${coAgentRunID.replace(/'/g, "''")}'`, Fields: ['ID'], ResultType: 'simple' },
      contextUser,
    );
    const stepNumber = (countResult.Success ? (countResult.Results?.length ?? 0) : 0) + 1;
    const step = await provider.GetEntityObject<MJAIAgentRunStepEntity>('MJ: AI Agent Run Steps', contextUser);
    step.NewRecord();
    initAgentRunStep(step, { AgentRunID: coAgentRunID, StepNumber: stepNumber, StepType: 'Tool', StepName: goalStepName(goal) });
    if (await step.Save()) {
      return step;
    }
    LogError(`[RemoteBrowserGoalEngine] beginBrowserGoalStep save failed: ${step.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return null;
  } catch (err) {
    LogError(`[RemoteBrowserGoalEngine] beginBrowserGoalStep threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Finalizes the parent browser-goal step from the goal outcome — `Completed`/`Failed` with an `OutputData`
 * envelope of strategy/status/step-count/url. A no-op when `step` is `null`. Best-effort (logged, never thrown).
 *
 * @param step The parent step from {@link beginBrowserGoalStep} (or `null`).
 * @param result The goal outcome.
 */
export async function finalizeBrowserGoalStep(step: MJAIAgentRunStepEntity | null, result: RemoteBrowserGoalResult): Promise<void> {
  if (!step) {
    return;
  }
  try {
    finalizeAgentRunStep(step, {
      success: result.Success,
      errorMessage: result.Success ? undefined : result.Detail,
      outputData: { strategy: result.Strategy, status: result.Status, stepCount: result.StepCount, currentUrl: result.CurrentUrl },
    });
    if (!(await step.Save())) {
      LogError(`[RemoteBrowserGoalEngine] finalizeBrowserGoalStep save failed: ${step.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
  } catch (err) {
    LogError(`[RemoteBrowserGoalEngine] finalizeBrowserGoalStep threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Binds the CDP goal-engine factory to {@link MJProgressComputerUseEngine}. Idempotent and safe to call at
 * startup; failures are logged (never thrown) so a binding hiccup can't abort server boot — goal runs would
 * simply fall back to the base engine.
 */
export function BindRemoteBrowserGoalEngine(): void {
  try {
    CdpRemoteBrowserSession.SetGoalEngineFactory(() => new MJProgressComputerUseEngine());
  } catch (err) {
    LogError(`[RemoteBrowserGoalEngine] Failed to bind MJ computer-use goal engine: ${err instanceof Error ? err.message : String(err)}`);
  }
}
