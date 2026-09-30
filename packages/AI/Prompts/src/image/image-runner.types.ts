/**
 * @fileoverview Parameter and result types for `AIImageGenerationRunner`.
 *
 * @module @memberjunction/ai-prompts
 */

import type { UserInfo } from '@memberjunction/core';
import type {
  AIAPIKey,
  ImageEditParams,
  ImageGenerationParams,
  ImageGenerationResult,
} from '@memberjunction/ai';

/**
 * What every image operation adds to its driver params: the fields the runner needs to choose a
 * model, resolve its credential and record the run. The runner strips them before calling the
 * driver, so a driver never sees the context user or the keys.
 */
export interface AIImageRunOptions {
  /** The user the run is made and recorded for. Required. */
  ContextUser: UserInfo;

  /**
   * Pins the image model by ID, as `AIDecisionRunner` does with `override.modelId`. Failover then
   * stays within that model's vendors. Leave it unset to let the carrier prompt's bindings choose,
   * which is what makes failover reach another model.
   */
  ModelID?: string;

  /**
   * The `MJ: AI Prompts` row whose bindings choose the model and whose failover settings apply.
   * Defaults to the `Default Image Generation` prompt.
   */
  PromptID?: string;

  /**
   * Keys by driver class, passed through as the base runner's `apiKeys`. A key reaches only the
   * candidates of its own driver class, so a caller whose key should survive failover supplies one
   * for each driver class a candidate may use.
   *
   * They rank as they do for chat prompts, just above the environment keys: a credential bound to
   * the prompt-model, the model-vendor or the vendor, or a default credential of the vendor's
   * credential type, wins over them.
   */
  APIKeys?: AIAPIKey[];

  /** A parent `MJ: AI Prompt Runs` row, recorded as this run's `ParentID`. */
  ParentRunID?: string;

  /** The agent the call is made for, recorded as the run row's `AgentID`. */
  AgentID?: string;

  /**
   * Called with the run row's ID as soon as the row exists, before the model call: the hook an
   * agent step uses to point its `TargetLogID` at the row. An error it throws is logged, never
   * raised.
   */
  OnPromptRunCreated?: (promptRunId: string) => void | Promise<void>;

  /**
   * The agent run this call belongs to. `MJ: AI Prompt Runs` has no agent-run column, so it is
   * recorded in the row's `Messages`, for reading only. To join the row to the run, use
   * {@link OnPromptRunCreated}.
   */
  AgentRunID?: string;
}

/**
 * Parameters for `AIImageGenerationRunner.RunImageGeneration`: the driver's own
 * `ImageGenerationParams` (prompt, n, size, quality, style and the rest), plus the runner's options.
 * The driver's `model` is set by the runner, per candidate, to the candidate's API name.
 */
export interface AIImageGenerationRunParams extends ImageGenerationParams, AIImageRunOptions {}

/**
 * Parameters for `AIImageGenerationRunner.RunImageEdit`: the driver's own `ImageEditParams`
 * (image, prompt, mask and the rest), plus the runner's options. The source image and mask are
 * passed to the driver and never recorded on the run row.
 */
export interface AIImageEditRunParams extends ImageEditParams, AIImageRunOptions {}

/**
 * The result of an image operation. The runner never throws: every failure is `Success: false`
 * with an `ErrorMessage`.
 */
export interface AIImageRunResult {
  /** Whether the driver reported success. A success can still carry zero images. */
  Success: boolean;

  /** Why the operation failed, when it did. */
  ErrorMessage?: string;

  /** The driver's result, with the images. Absent when the call never reached a model. */
  ImageResult?: ImageGenerationResult;

  /** The `MJ: AI Prompt Runs` row for this call. Absent when the call never reached a model. */
  PromptRunID?: string;

  /** The model that answered after any failover, or the last one tried when the call failed. */
  ModelID?: string;

  /** The name of that model. */
  ModelName?: string;

  /** The driver class of that model's vendor. */
  DriverClass?: string;

  /** Wall-clock time for the whole call, in milliseconds. */
  ExecutionTimeMS: number;
}
