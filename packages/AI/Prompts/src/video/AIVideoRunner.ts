/**
 * @fileoverview Runner for avatar video and generative video operations on `Video` models.
 *
 * @module @memberjunction/ai-prompts
 */

import { AvatarVideoParams, BaseVideoGenerator, VideoResult } from '@memberjunction/ai';
import { BaseMediaRunner } from '../media/BaseMediaRunner';
import { AIMediaRunOutcome } from '../media/media-runner.types';
import { SecondsIn } from '../media/media-usage';
import { VideoGenerationRunner, VideoGenerationCallOutput } from './VideoGenerationRunner';
import {
  AIAvatarVideoRunParams,
  AIVideoGenerationRunParams,
  AIVideoGenerationRunResult,
  AIVideoRunResult,
} from './video-runner.types';

/**
 * Runs video operations on `Video` models (`BaseVideoGenerator` drivers). It selects a model
 * from the carrier prompt's bindings (or the pinned `ModelID`), resolves credentials, fails over,
 * and writes an `MJ: AI Prompt Runs` row.
 *
 * Two distinct video workflows are supported:
 *
 * 1. **Avatar video (`RunAvatarVideo`)** — carrier prompt `'Default Video Generation'`.
 *    `BaseVideoGenerator.CreateAvatarVideo` returns a video ID as soon as the provider (e.g. HeyGen)
 *    accepts the render job, before the video exists. The runner does not poll or wait for the
 *    avatar render: a successful run means the provider accepted the request, and its row records
 *    the video ID.
 *
 * 2. **Generative video (`RunGenerateVideo`)** — carrier prompt `'Default Generative Video'`.
 *    Submits a prompt via `BaseVideoGenerator.GenerateVideo`, polls `GetVideoGenerationStatus`
 *    until the job reaches a terminal state (`Succeeded`, `Failed`, or `Cancelled`), resolves the
 *    clip bytes (`Buffer`, base64 string, or delivery URL download), flushes the prompt-run save,
 *    and returns the clip bytes in `Video.Data`. The runner never stores bytes to `MJStorage`;
 *    callers persist the returned `Buffer` through their own storage path and attach provenance
 *    (`ModelID`, `PromptRunID`, `JobID`, `C2PA`).
 *
 * `CreateVideoTranslation` is not run: its params are an empty placeholder, and no driver
 * implements it.
 */
export class AIVideoRunner extends BaseMediaRunner<AIAvatarVideoRunParams, BaseVideoGenerator, VideoResult> {
  /** The carrier prompt used by `RunAvatarVideo` when the caller names none. */
  public static readonly DEFAULT_PROMPT_NAME = 'Default Video Generation';

  /** The carrier prompt used by `RunGenerateVideo` when the caller names none. */
  public static readonly GENERATIVE_PROMPT_NAME = 'Default Generative Video';

  /** Maximum number of status polls (`GetVideoGenerationStatus`) per submitted generative video job (360 × 5s = 30 min). */
  public static readonly MAX_POLL_ATTEMPTS = 360;

  /** Maximum consecutive `GetVideoGenerationStatus` throws before aborting polling for a submitted job. */
  public static readonly MAX_CONSECUTIVE_POLL_ERRORS = 5;

  /** Default delay in milliseconds between `GetVideoGenerationStatus` polls. */
  public static readonly DEFAULT_POLL_INTERVAL_MS = 5000;

  /** Video calls run only on `Video` models. */
  public override get RequiredModelType(): string {
    return 'Video';
  }

  protected override get DefaultLogCategory(): string {
    return 'AIVideoRunner';
  }

  protected override get DefaultPromptName(): string {
    return AIVideoRunner.DEFAULT_PROMPT_NAME;
  }

  protected override get DriverBaseClass(): typeof BaseVideoGenerator {
    return BaseVideoGenerator;
  }

  /**
   * Requests an avatar video (`BaseVideoGenerator.CreateAvatarVideo`). The avatar video params carry
   * no model name, so the candidate's API name is not passed. Never throws: every failure is a
   * result with `Success: false` and an `ErrorMessage`.
   */
  public async RunAvatarVideo(params: AIAvatarVideoRunParams): Promise<AIVideoRunResult> {
    const outcome = await this.RunMediaOperation(params, {
      Name: 'CreateAvatarVideo',
      Validate: p => (p.avatarId && p.avatarId.trim().length > 0 ? undefined : 'An avatar is required (params.avatarId)'),
      Invoke: (driver, _apiName, signal) => driver.CreateAvatarVideo(this.DriverParams<AvatarVideoParams>(params, signal)),
      DescribeRequest: p => this.describeRequest(p),
      DescribeOutput: output => this.describeVideo(output),
    });
    return this.toResult(outcome);
  }

  /**
   * Submits a generative video job (`BaseVideoGenerator.GenerateVideo`), polls
   * `GetVideoGenerationStatus` until completion, resolves the video bytes, and waits for the
   * `MJ: AI Prompt Runs` save to complete before returning so the caller can immediately reference
   * or read back `PromptRunID`.
   *
   * Returns the video bytes in `Video.Data` and never uploads them to storage. Never throws: every
   * failure is returned as `Success: false` with an `ErrorMessage`.
   */
  public async RunGenerateVideo(params: AIVideoGenerationRunParams): Promise<AIVideoGenerationRunResult> {
    const inner = new VideoGenerationRunner();
    if (this._provider) {
      inner.Provider = this._provider;
    }
    const outcome = await inner.Run(params);
    await inner.WaitForPendingPromptRunSaves();
    return this.toGenerationResult(outcome);
  }

  /** The run row's `Messages`: the title, avatar, size and the IDs of the assets used. */
  private describeRequest(params: AIAvatarVideoRunParams): string {
    return JSON.stringify({
      Operation: 'CreateAvatarVideo',
      Title: params.title,
      AvatarID: params.avatarId,
      AvatarStyle: params.avatarStyle,
      Width: params.outputWidth,
      Height: params.outputHeight,
      AudioAssetID: params.audioAssetId,
      ImageAssetID: params.imageAssetId,
      AgentRunID: params.AgentRunID,
    });
  }

  /** The run row's `Result`: the video's ID, and its length when the driver reported one. */
  private describeVideo(output: VideoResult): string {
    return JSON.stringify({
      VideoID: output.videoId,
      DurationSeconds: SecondsIn(output.usage, 'output') ?? null,
    });
  }

  /** The caller's result: the shared fields, the video ID and length, and the driver's result. */
  private toResult(outcome: AIMediaRunOutcome<VideoResult>): AIVideoRunResult {
    const { Output, ...result } = outcome;
    return {
      ...result,
      VideoID: outcome.Success ? Output?.videoId : undefined,
      DurationSeconds: SecondsIn(Output?.usage, 'output'),
      VideoResult: Output,
    };
  }

  /** Maps the generative video runner's outcome to {@link AIVideoGenerationRunResult}. */
  private toGenerationResult(
    outcome: AIMediaRunOutcome<VideoGenerationCallOutput>,
  ): AIVideoGenerationRunResult {
    const { Output, ...result } = outcome;
    const job = Output?.Job;
    const videoMeta = job?.Video;
    const bytes = Output?.Bytes;
    const usage = Output?.usage;
    return {
      ...result,
      JobID: job?.JobID,
      Video:
        outcome.Success && bytes && videoMeta
          ? {
              Data: bytes,
              MimeType: videoMeta.MimeType,
              DurationSeconds: videoMeta.DurationSeconds,
              Width: videoMeta.Width,
              Height: videoMeta.Height,
            }
          : undefined,
      C2PA: job?.Provenance?.C2PA,
      Cost: typeof usage?.cost === 'number' ? usage.cost : undefined,
      CostCurrency: typeof usage?.cost === 'number' ? usage.costCurrency : undefined,
    };
  }
}
