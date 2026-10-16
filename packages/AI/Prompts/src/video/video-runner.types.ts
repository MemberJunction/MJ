/**
 * @fileoverview Parameter and result types for `AIVideoRunner`.
 *
 * @module @memberjunction/ai-prompts
 */

import type { AvatarVideoParams, VideoGenerationParams, VideoResult } from '@memberjunction/ai';
import type { AIMediaRunOptions, AIMediaRunResult } from '../media/media-runner.types';

/**
 * Parameters for `AIVideoRunner.RunAvatarVideo`: the driver's own `AvatarVideoParams` (avatar,
 * audio and background assets, layout and size), plus the runner's options.
 *
 * Avatar and asset IDs belong to one provider account, so pin `ModelID` (or use a prompt whose
 * failover stays on one model) when more than one video model is bound.
 */
export interface AIAvatarVideoRunParams extends AvatarVideoParams, AIMediaRunOptions {}

/** The result of `AIVideoRunner.RunAvatarVideo`. */
export interface AIVideoRunResult extends AIMediaRunResult {
  /**
   * The provider's ID for the video, when it accepted the request. For HeyGen this identifies a
   * render job: the video renders after the call returns, and is fetched from HeyGen by this ID.
   */
  VideoID?: string;

  /** The video's length in seconds, when the driver reported it. HeyGen's driver does not. */
  DurationSeconds?: number;

  /** The driver's result. Absent when the call never reached a model. */
  VideoResult?: VideoResult;
}

/**
 * Parameters for `AIVideoRunner.RunGenerateVideo`: the driver's own `VideoGenerationParams`
 * (prompt, mode, duration, aspect ratio, quality, optional seed/references/keyframes/source video),
 * plus the media runner options and optional polling interval override.
 */
export interface AIVideoGenerationRunParams extends VideoGenerationParams, AIMediaRunOptions {
  /**
   * Delay in milliseconds between `GetVideoGenerationStatus` polls while a submitted job is
   * `Pending` or `Running`. Defaults to `AIVideoRunner.DEFAULT_POLL_INTERVAL_MS` (`5000`).
   */
  PollIntervalMS?: number;
}

/**
 * The result of `AIVideoRunner.RunGenerateVideo`.
 *
 * The runner resolves and returns the generated video bytes in `Video.Data`; it never uploads
 * them to storage. Callers store the bytes through their own storage path and record provenance
 * (`ModelID`, `PromptRunID`, `JobID`, `C2PA`).
 */
export interface AIVideoGenerationRunResult extends AIMediaRunResult {
  /** Provider's job identifier from submission / status polling. */
  JobID?: string;

  /** Resolved video clip and metadata when generation succeeded. */
  Video?: {
    Data: Buffer;
    MimeType: string;
    DurationSeconds: number;
    Width: number;
    Height: number;
  };

  /** Whether the provider embeds C2PA content credentials in the generated video. */
  C2PA?: boolean;

  /**
   * Driver-reported cost only (for example when the provider returns credits/cost on submission).
   * When absent, the server prices the `MJ: AI Prompt Runs` row on save from the active `Per Second`
   * model cost row; read the computed cost back by `PromptRunID`.
   */
  Cost?: number;

  /** ISO 4217 currency code for {@link Cost} when the driver reported a cost. */
  CostCurrency?: string;
}

