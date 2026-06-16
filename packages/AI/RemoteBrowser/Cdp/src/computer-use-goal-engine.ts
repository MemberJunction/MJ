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
}

/** Factory for a {@link ComputerUseGoalRun} — the injection point ({@link CdpRemoteBrowserSession.SetGoalEngineFactory}). */
export type ComputerUseGoalEngineFactory = () => ComputerUseGoalRun;

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
    const reasoning = step.ControllerReasoning ?? '';
    this.OnProgress?.({
      Step: step.StepNumber,
      Message: reasoning.length > 160 ? `${reasoning.slice(0, 160)}…` : reasoning,
      Url: step.Url,
    });
  }
}

/** The default factory used unless {@link CdpRemoteBrowserSession.SetGoalEngineFactory} overrides it. */
export const defaultComputerUseGoalEngineFactory: ComputerUseGoalEngineFactory = () => new ProgressComputerUseEngine();
