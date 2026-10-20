/**
 * @fileoverview Parameter and result types for `AIVideoRunner`.
 *
 * @module @memberjunction/ai-prompts
 */

import type { AvatarVideoParams, VideoResult } from '@memberjunction/ai';
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
