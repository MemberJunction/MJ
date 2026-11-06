/**
 * @fileoverview The text-to-speech port the room audio player announces through ({@link IRoomSpeechSynthesizer}),
 * and {@link MJRoomSpeechSynthesizer}, an implementation over MJ's own `AITextToSpeechRunner` (model selection,
 * credentials, failover and an `MJ: AI Prompt Runs` row, all handled there).
 *
 * The player ships with NO synthesizer installed, because a voice is vendor-specific and only the host knows which
 * one its callers should hear. A host opts in once at startup:
 *
 * ```ts
 * RoomAudioPlayer.Instance.SetSpeechSynthesizer(new MJRoomSpeechSynthesizer({ Voice: 'alloy' }));
 * ```
 *
 * @module @memberjunction/livekit-room-server
 */

import { LogError, type UserInfo } from '@memberjunction/core';
import { AITextToSpeechRunner } from '@memberjunction/ai-prompts';
import { DecodeAudio, type DecodedAudio } from './audio-decoder';

/** Turns announcement text into audio. Return `null` when speech could not be produced (and log why). */
export interface IRoomSpeechSynthesizer {
  /**
   * Speaks `text`.
   *
   * @param text What to say.
   * @param contextUser The user the synthesis runs (and is logged) as.
   * @returns The audio, or `null` when it could not be produced.
   */
  Synthesize(text: string, contextUser: UserInfo): Promise<DecodedAudio | null>;
}

/** Options for {@link MJRoomSpeechSynthesizer}. */
export interface MJRoomSpeechSynthesizerOptions {
  /** The provider-native voice id or name (required: voices belong to a vendor). */
  Voice: string;
  /** Pins the TTS model by ID. Recommended whenever the voice matters, since voices are vendor-specific. */
  ModelID?: string;
  /** The carrier `MJ: AI Prompts` row whose bindings choose the model. Default: the runner's `Default Text To Speech`. */
  PromptID?: string;
  /** The vendor's output format string (e.g. `mp3_44100_128`). Default: the vendor's default (MP3 or WAV decode either way). */
  OutputFormat?: string;
}

/** The part of `AITextToSpeechRunner` the synthesizer uses — a seam so tests inject a fake. */
export type TextToSpeechRunnerLike = Pick<AITextToSpeechRunner, 'RunTextToSpeech'>;

/** An {@link IRoomSpeechSynthesizer} backed by MJ's `AITextToSpeechRunner`. Never throws: failures log and return `null`. */
export class MJRoomSpeechSynthesizer implements IRoomSpeechSynthesizer {
  private readonly options: MJRoomSpeechSynthesizerOptions;
  private readonly runner: TextToSpeechRunnerLike;

  /**
   * @param options The voice and model selection.
   * @param runner The runner (tests); defaults to a new `AITextToSpeechRunner`.
   * @throws {Error} when no voice is given.
   */
  constructor(options: MJRoomSpeechSynthesizerOptions, runner?: TextToSpeechRunnerLike) {
    if (!options.Voice?.trim()) {
      throw new Error('MJRoomSpeechSynthesizer needs a Voice (a provider-native voice id or name).');
    }
    this.options = options;
    this.runner = runner ?? new AITextToSpeechRunner();
  }

  /** Speaks `text` through the configured TTS model and decodes the result to PCM. */
  public async Synthesize(text: string, contextUser: UserInfo): Promise<DecodedAudio | null> {
    try {
      const result = await this.runner.RunTextToSpeech({
        text,
        voice: this.options.Voice,
        output_format: this.options.OutputFormat,
        ModelID: this.options.ModelID,
        PromptID: this.options.PromptID,
        ContextUser: contextUser,
      });
      const audio = result.SpeechResult?.data;
      if (!result.Success || !audio || audio.byteLength === 0) {
        LogError(`[MJRoomSpeechSynthesizer] text-to-speech failed for voice '${this.options.Voice}': ${result.ErrorMessage ?? 'no audio returned'}`);
        return null;
      }
      return await DecodeAudio(new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength));
    } catch (err) {
      LogError(`[MJRoomSpeechSynthesizer] could not synthesize an announcement: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
