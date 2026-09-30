/**
 * @fileoverview Runner for text-to-speech on `TTS` models.
 *
 * @module @memberjunction/ai-prompts
 */

import { BaseTextToSpeech, ModelUsage, SpeechResult, TextToSpeechParams } from '@memberjunction/ai';
import { BaseMediaRunner } from '../media/BaseMediaRunner';
import { AIMediaRunOutcome } from '../media/media-runner.types';
import { AITextToSpeechRunParams, AITextToSpeechRunResult } from './audio-runner.types';
import { Base64ByteLength, CountCharacters, DetectAudioFormat, SecondsIn } from './audio-description';

/**
 * Runs text-to-speech on `TTS` models (`BaseTextToSpeech` drivers). It does for a speech call what
 * `AIPromptRunner` does for a chat call: selects a model from the carrier prompt's bindings (or the
 * pinned `ModelID`), resolves credentials, fails over, and writes an `MJ: AI Prompt Runs` row.
 *
 * The row never holds audio. `Messages` records the text, the voice and the character count, and
 * `Result` the audio's format, size and, when the driver reported it, duration. Usage is the
 * driver's when it reports a quantity; otherwise the characters sent are counted in the
 * `Characters` measure. No price unit type prices `Characters` yet, so such a run is left uncosted,
 * with a logged reason, rather than priced wrong. The runner never sets a cost itself.
 */
export class AITextToSpeechRunner extends BaseMediaRunner<AITextToSpeechRunParams, BaseTextToSpeech, SpeechResult> {
  /** The carrier prompt used when the caller names none. */
  public static readonly DEFAULT_PROMPT_NAME = 'Default Text To Speech';

  /** Speech calls run only on `TTS` models. */
  public override get RequiredModelType(): string {
    return 'TTS';
  }

  protected override get DefaultLogCategory(): string {
    return 'AITextToSpeechRunner';
  }

  protected override get DefaultPromptName(): string {
    return AITextToSpeechRunner.DEFAULT_PROMPT_NAME;
  }

  protected override get DriverBaseClass(): typeof BaseTextToSpeech {
    return BaseTextToSpeech;
  }

  /**
   * Speaks `params.text` (`BaseTextToSpeech.CreateSpeech`). Never throws: every failure is a result
   * with `Success: false` and an `ErrorMessage`.
   */
  public async RunTextToSpeech(params: AITextToSpeechRunParams): Promise<AITextToSpeechRunResult> {
    const outcome = await this.RunMediaOperation(params, {
      Name: 'CreateSpeech',
      Validate: p => (p.text && p.text.trim().length > 0 ? undefined : 'Text to speak is required (params.text)'),
      Invoke: (driver, apiName) => driver.CreateSpeech({ ...this.DriverParams<TextToSpeechParams>(params), model_id: apiName }),
      DescribeRequest: p => this.describeRequest(p),
      DescribeOutput: output => this.describeAudio(output, params),
      CountUsage: p => ModelUsage.ForMedia('Characters', CountCharacters(p.text)),
    });
    return this.toResult(outcome);
  }

  /** The run row's `Messages`: the text, the voice, the requested format and the character count. */
  private describeRequest(params: AITextToSpeechRunParams): string {
    return JSON.stringify({
      Operation: 'CreateSpeech',
      Text: params.text,
      Voice: params.voice,
      OutputFormat: params.output_format,
      Characters: CountCharacters(params.text),
      AgentRunID: params.AgentRunID,
    });
  }

  /**
   * The run row's `Result`: the audio's format (read from its leading bytes, else the format asked
   * for), its size, and its duration when the driver reported one. Never the audio.
   */
  private describeAudio(output: SpeechResult, params: AITextToSpeechRunParams): string {
    return JSON.stringify({
      Format: DetectAudioFormat(output.data) ?? params.output_format ?? null,
      Bytes: output.data?.byteLength ?? Base64ByteLength(output.content),
      DurationSeconds: SecondsIn(output.usage, 'output') ?? null,
    });
  }

  /** The caller's result: the shared fields, with the driver's result as `SpeechResult`. */
  private toResult(outcome: AIMediaRunOutcome<SpeechResult>): AITextToSpeechRunResult {
    const { Output, ...result } = outcome;
    return { ...result, SpeechResult: Output };
  }
}
