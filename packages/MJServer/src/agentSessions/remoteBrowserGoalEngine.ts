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

import { UserInfo, LogError } from '@memberjunction/core';
import type { ComputerUseResult, RunComputerUseParams, StepRecord } from '@memberjunction/computer-use';
import { MJComputerUseEngine, MJRunComputerUseParams } from '@memberjunction/computer-use-engine';
import { CdpRemoteBrowserSession, type ComputerUseGoalProgress, type ComputerUseGoalRun } from '@memberjunction/remote-browser-cdp';

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

  /**
   * Adapts the transport-neutral base params into {@link MJRunComputerUseParams} (carrying the acting user)
   * and delegates to the MJ engine, which auto-selects a vision-capable controller model from MJ metadata.
   *
   * @param params The base computer-use params the CDP session built (goal + step cap + start url).
   * @returns The computer-use run result.
   */
  public override async Run(params: RunComputerUseParams): Promise<ComputerUseResult> {
    const mjParams = Object.assign(new MJRunComputerUseParams(), params);
    mjParams.ContextUser = this.ContextUser;
    return super.Run(mjParams);
  }

  protected override onStepComplete(step: StepRecord, params: MJRunComputerUseParams): void {
    super.onStepComplete(step, params); // keep MJ media persistence
    const reasoning = step.ControllerReasoning ?? '';
    this.OnProgress?.({
      Step: step.StepNumber,
      Message: reasoning.length > 160 ? `${reasoning.slice(0, 160)}…` : reasoning,
      Url: step.Url,
    });
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
