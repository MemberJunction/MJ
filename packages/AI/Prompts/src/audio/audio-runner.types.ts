/**
 * @fileoverview Parameter and result types for the audio runners.
 *
 * @module @memberjunction/ai-prompts
 */

import type { SpeechResult, SpeechToTextParams, TextToSpeechParams } from '@memberjunction/ai';
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

/**
 * Parameters for `AISpeechToTextRunner.RunSpeechToText`: the audio, as `audioData` bytes or a base 64
 * `audioFile` (one is required), and the driver's optional hints, plus the runner's options.
 *
 * The driver's `model` is set by the runner, per candidate, to the candidate's API name.
 */
export interface AISpeechToTextRunParams
  extends Pick<SpeechToTextParams, 'audioData' | 'fileName' | 'language' | 'prompt' | 'temperature'>,
    Partial<Pick<SpeechToTextParams, 'audioFile'>>,
    AIMediaRunOptions {}

/** The result of `AISpeechToTextRunner.RunSpeechToText`. */
export interface AISpeechToTextRunResult extends AIMediaRunResult {
  /** The transcript, when the call succeeded. */
  Transcript?: string;

  /**
   * The seconds of audio transcribed, when the driver reported them. Undefined otherwise; the runner
   * never estimates it.
   */
  DurationSeconds?: number;

  /** The driver's result. Absent when the call never reached a model. */
  SpeechResult?: SpeechResult;
}
