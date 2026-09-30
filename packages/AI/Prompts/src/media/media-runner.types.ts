/**
 * @fileoverview Parameter and result types shared by the media runners: text-to-speech,
 * speech-to-text and video.
 *
 * @module @memberjunction/ai-prompts
 */

import type { UserInfo } from '@memberjunction/core';
import type { AIAPIKey, ModelUsage, SpeechResult } from '@memberjunction/ai';

/**
 * What every media operation adds to its driver params: the fields the runner needs to choose a
 * model, resolve its credential and record the run. The runner strips them before calling the
 * driver, so a driver never sees the context user or the keys.
 */
export interface AIMediaRunOptions {
  /** The user the run is made and recorded for. Required. */
  ContextUser: UserInfo;

  /**
   * Pins the model by ID. Failover then stays within that model's vendors. Leave it unset to let the
   * carrier prompt's bindings choose.
   */
  ModelID?: string;

  /**
   * The `MJ: AI Prompts` row whose bindings choose the model and whose failover settings apply.
   * Defaults to the runner's default carrier prompt, found by name.
   */
  PromptID?: string;

  /**
   * Keys by driver class, passed through as the base runner's `apiKeys`. A key reaches only the
   * candidates of its own driver class. They rank as they do for chat prompts, just above the
   * environment keys: a credential bound to the prompt-model, the model-vendor or the vendor, or a
   * default credential of the vendor's credential type, wins over them.
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

  /**
   * A bound, in milliseconds, on each driver call, as `AIPromptParams.timeoutMS` bounds each chat
   * call: every failover candidate gets its own. A call that runs longer fails with an
   * `AIPromptTimeoutError`, which reads as a network error and so fails over. For audio a driver
   * splits, the bound covers the whole transcription. Unset or not positive means no bound, unless the
   * runner declares a `DefaultPromptTimeoutMS`.
   *
   * The media drivers take no abort signal, so a request that times out is abandoned, not torn down:
   * the runner stops waiting for it and ignores its result.
   */
  TimeoutMS?: number;

  /**
   * Cancels the call, as `AIPromptParams.cancellationToken` cancels a chat call. A token already
   * aborted refuses the call before a run row exists. Aborted during the call, it ends the call at
   * once, before any further failover candidate, and the run row is recorded as `Cancelled`. As with
   * {@link TimeoutMS}, a request already sent is abandoned rather than torn down.
   */
  CancellationToken?: AbortSignal;
}

/**
 * The fields every media runner result has. The runners never throw: every failure is
 * `Success: false` with an `ErrorMessage`.
 */
export interface AIMediaRunResult {
  /** Whether the driver reported success. */
  Success: boolean;

  /** Why the call failed, when it did. */
  ErrorMessage?: string;

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

/** A media runner's result as the shared lifecycle produces it: the common fields and the driver's output. */
export interface AIMediaRunOutcome<TOutput> extends AIMediaRunResult {
  /** The driver's result. Absent when the call never reached a model. */
  Output?: TOutput;
}

/**
 * The fields of a driver result the shared lifecycle reads: the outcome, the error message and its
 * classification, and the usage when the driver reported it. `SpeechResult` and `VideoResult` both
 * have them.
 */
export type MediaDriverOutput = Pick<SpeechResult, 'success' | 'errorMessage' | 'errorInfo' | 'usage'>;

/**
 * One operation a media runner performs: its name, how it validates and describes the request for
 * the run row, and the driver call it makes.
 *
 * @typeParam TParams The operation's params, including {@link AIMediaRunOptions}.
 * @typeParam TDriver The driver base class the operation calls.
 * @typeParam TOutput The driver's result type.
 */
export interface MediaOperation<TParams, TDriver, TOutput extends MediaDriverOutput> {
  /** The operation's name, for messages. */
  Name: string;

  /** Why the params cannot run, or undefined when they can. Checked before a model is chosen. */
  Validate: (params: TParams) => string | undefined;

  /**
   * Calls the driver. `apiName` is the candidate's API name at its vendor, or undefined when it has
   * none, in which case the driver uses its own default model.
   */
  Invoke: (driver: TDriver, apiName: string | undefined) => Promise<TOutput>;

  /** The run row's `Messages`: JSON describing what was asked. Never media bytes. */
  DescribeRequest: (params: TParams) => string;

  /** The run row's `Result` for a successful call. Never media bytes. */
  DescribeOutput: (output: TOutput) => string;

  /**
   * The runner's own count of a successful call's usage (for example the characters sent), recorded
   * when the driver reports no quantity of its own. Omit it when the runner can count nothing.
   */
  CountUsage?: (params: TParams, output: TOutput) => ModelUsage | undefined;
}
