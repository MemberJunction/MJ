/**
 * @fileoverview Parameter and result types for the audio runners.
 *
 * @module @memberjunction/ai-prompts
 */

import type { SpeechResult, TextToSpeechParams } from '@memberjunction/ai';
import type { AIMediaRunOptions, AIMediaRunResult } from '../media/media-runner.types';

/**
 * Parameters for `AITextToSpeechRunner.RunTextToSpeech`: the driver's own `TextToSpeechParams`
 * (text, voice, voice settings and the rest), plus the runner's options.
 *
 * The runner sets the driver's `model_id` per candidate, to the candidate's API name; a model with
 * none leaves the driver's default. Voices belong to a vendor, so pin `ModelID` when the voice
 * matters.
 */
export interface AITextToSpeechRunParams extends TextToSpeechParams, AIMediaRunOptions {}

/** The result of `AITextToSpeechRunner.RunTextToSpeech`. */
export interface AITextToSpeechRunResult extends AIMediaRunResult {
  /**
   * The driver's result: the audio in `data`, and base 64 encoded in `content`. Absent when the call
   * never reached a model. The run row describes the audio but never holds it.
   */
  SpeechResult?: SpeechResult;
}
