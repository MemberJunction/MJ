/**
 * @fileoverview Runner for speech-to-text on `Speech to Text` models.
 *
 * @module @memberjunction/ai-prompts
 */

import { BaseSpeechToText, SpeechResult, SpeechToTextParams } from '@memberjunction/ai';
import { BaseMediaRunner } from '../media/BaseMediaRunner';
import { AIMediaRunOutcome } from '../media/media-runner.types';
import { AISpeechToTextRunParams, AISpeechToTextRunResult } from './audio-runner.types';
import { Base64ByteLength, SecondsIn } from './audio-description';

/**
 * Runs speech-to-text on `Speech to Text` models (`BaseSpeechToText` drivers). It selects a model
 * from the carrier prompt's bindings (or the pinned `ModelID`), resolves credentials, fails over,
 * and writes an `MJ: AI Prompt Runs` row.
 *
 * The row never holds audio: `Messages` records the file name, the language, the steering prompt
 * and the audio's size, and `Result` is the transcript. Usage is the driver's: the audio's duration
 * in `Seconds` when the provider reported one, which the model's per-minute or per-hour cost row
 * prices. When the driver reported no duration nothing is recorded, rather than an estimate from the
 * audio's size, so the run stays uncosted.
 */
export class AISpeechToTextRunner extends BaseMediaRunner<AISpeechToTextRunParams, BaseSpeechToText, SpeechResult> {
  /** The carrier prompt used when the caller names none. */
  public static readonly DEFAULT_PROMPT_NAME = 'Default Speech To Text';

  /** Transcription calls run only on `Speech to Text` models. */
  public override get RequiredModelType(): string {
    return 'Speech to Text';
  }

  protected override get DefaultLogCategory(): string {
    return 'AISpeechToTextRunner';
  }

  protected override get DefaultPromptName(): string {
    return AISpeechToTextRunner.DEFAULT_PROMPT_NAME;
  }

  protected override get DriverBaseClass(): typeof BaseSpeechToText {
    return BaseSpeechToText;
  }

  /**
   * Transcribes `params.audioData` (or the base 64 `params.audioFile`) with
   * `BaseSpeechToText.SpeechToText`. Never throws: every failure is a result with `Success: false`
   * and an `ErrorMessage`.
   */
  public async RunSpeechToText(params: AISpeechToTextRunParams): Promise<AISpeechToTextRunResult> {
    const outcome = await this.RunMediaOperation(params, {
      Name: 'SpeechToText',
      Validate: p => (this.audioBytes(p) > 0 ? undefined : 'Audio is required (params.audioData, or base 64 params.audioFile)'),
      Invoke: (driver, apiName) => driver.SpeechToText(this.toDriverParams(params, apiName)),
      DescribeRequest: p => this.describeRequest(p),
      DescribeOutput: output => output.content ?? '',
    });
    return this.toResult(outcome);
  }

  /** The size of the audio, from whichever form the caller used. */
  private audioBytes(params: AISpeechToTextRunParams): number {
    return params.audioData?.byteLength || Base64ByteLength(params.audioFile);
  }

  /**
   * The driver's params. `model` is the candidate's API name; when the model has none it is left
   * empty, which the drivers read as "use your default".
   */
  private toDriverParams(params: AISpeechToTextRunParams, apiName: string | undefined): SpeechToTextParams {
    const driverParams = new SpeechToTextParams();
    driverParams.model = apiName ?? '';
    driverParams.audioFile = params.audioFile ?? '';
    driverParams.audioData = params.audioData;
    driverParams.fileName = params.fileName;
    driverParams.language = params.language;
    driverParams.prompt = params.prompt;
    driverParams.temperature = params.temperature;
    return driverParams;
  }

  /** The run row's `Messages`: the file name, language, steering prompt and audio size. Never the audio. */
  private describeRequest(params: AISpeechToTextRunParams): string {
    return JSON.stringify({
      Operation: 'SpeechToText',
      FileName: params.fileName,
      Language: params.language,
      Prompt: params.prompt,
      AudioBytes: this.audioBytes(params),
      AgentRunID: params.AgentRunID,
    });
  }

  /** The caller's result: the shared fields, the transcript and duration, and the driver's result. */
  private toResult(outcome: AIMediaRunOutcome<SpeechResult>): AISpeechToTextRunResult {
    const { Output, ...result } = outcome;
    return {
      ...result,
      Transcript: outcome.Success ? Output?.content : undefined,
      DurationSeconds: SecondsIn(Output?.usage, 'input'),
      SpeechResult: Output,
    };
  }
}
