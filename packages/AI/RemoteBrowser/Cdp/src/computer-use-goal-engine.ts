/**
 * @fileoverview The **computer-use goal-engine seam** for the CDP remote-browser session. Lets
 * {@link import('./cdp-remote-browser-session').CdpRemoteBrowserSession.RunComputerUseGoal} drive an
 * autonomous goal loop over its *already-attached* `PlaywrightBrowserAdapter`, while staying injectable so
 * unit tests run with a fake engine (no browser, no LLM) and production can bind the MJ engine
 * (`@memberjunction/computer-use-engine`'s `MJComputerUseEngine`) for vision-model auto-selection.
 *
 * @module @memberjunction/remote-browser-cdp
 */

import type { UserInfo } from '@memberjunction/core';
import { BaseBrowserAdapter, ComputerUseEngine, type ComputerUseResult, type RunComputerUseParams, type StepRecord } from '@memberjunction/computer-use';

/** A normalized per-step progress note surfaced from the goal loop. */
export interface ComputerUseGoalProgress {
  /** 1-based step number. */
  Step: number;
  /** A short, model-safe note (the controller's reasoning summary). */
  Message: string;
  /** The page URL at this step, when known. */
  Url?: string;
}

/**
 * The minimal surface {@link import('./cdp-remote-browser-session').CdpRemoteBrowserSession} needs from a
 * computer-use engine. Satisfied by `ComputerUseEngine` (and its `MJComputerUseEngine` subclass); a fake
 * implements it in tests.
 */
export interface ComputerUseGoalRun {
  /** Inject the live, CDP-attached adapter the loop should drive. */
  SetBrowserAdapter(adapter: BaseBrowserAdapter): void;
  /** Run the goal loop to completion. */
  Run(params: RunComputerUseParams): Promise<ComputerUseResult>;
  /** Cooperatively stop the loop (barge-in). */
  Stop(): void;
  /** Optional per-step progress hook the session sets before {@link Run}. */
  OnProgress?: (progress: ComputerUseGoalProgress) => void;
  /**
   * Optional MJ user the session sets before {@link Run}. An MJ-aware engine
   * (`MJComputerUseEngine`) runs its controller/judge prompts under this user; the default base engine
   * ignores it.
   */
  ContextUser?: UserInfo;

  /** Optional parent agent-run id the session sets before {@link Run} (MJ-aware engines link prompt runs to it). */
  AgentRunID?: string;

  /** Optional parent agent-run-step id the session sets before {@link Run} (MJ-aware engines nest child prompt steps under it). */
  AgentRunStepID?: string;
}

/** Factory for a {@link ComputerUseGoalRun} — the injection point ({@link CdpRemoteBrowserSession.SetGoalEngineFactory}). */
export type ComputerUseGoalEngineFactory = () => ComputerUseGoalRun;

/** Max length of a forwarded progress message before it is truncated with an ellipsis. */
export const PROGRESS_MESSAGE_MAX_LENGTH = 160;

/**
 * Builds a normalized, model-safe {@link ComputerUseGoalProgress} note from a completed step: the
 * controller's reasoning summary, truncated to {@link PROGRESS_MESSAGE_MAX_LENGTH} with an ellipsis. Shared
 * by every goal engine that forwards progress ({@link ProgressComputerUseEngine} and the server-tier MJ
 * engine) so the narration shape stays identical across them.
 *
 * @param step The completed step record.
 * @returns The progress note to forward to the caller's `OnProgress`.
 */
export function buildProgressNote(step: StepRecord): ComputerUseGoalProgress {
  const reasoning = step.ControllerReasoning ?? '';
  return {
    Step: step.StepNumber,
    Message: reasoning.length > PROGRESS_MESSAGE_MAX_LENGTH ? `${reasoning.slice(0, PROGRESS_MESSAGE_MAX_LENGTH)}…` : reasoning,
    Url: step.Url,
  };
}

/**
 * The default engine: a thin `ComputerUseEngine` subclass that forwards each completed step to
 * {@link ComputerUseGoalRun.OnProgress}. It runs the real loop, so it requires a controller model — bind
 * `MJComputerUseEngine` via {@link CdpRemoteBrowserSession.SetGoalEngineFactory} in production for
 * automatic vision-model selection through MJ metadata.
 */
export class ProgressComputerUseEngine extends ComputerUseEngine implements ComputerUseGoalRun {
  /** Per-run progress hook. */
  public OnProgress?: (progress: ComputerUseGoalProgress) => void;

  protected override onStepComplete(step: StepRecord, _params: RunComputerUseParams): void {
    this.OnProgress?.(buildProgressNote(step));
  }
}

/** The default factory used unless {@link CdpRemoteBrowserSession.SetGoalEngineFactory} overrides it. */
export const defaultComputerUseGoalEngineFactory: ComputerUseGoalEngineFactory = () => new ProgressComputerUseEngine();
