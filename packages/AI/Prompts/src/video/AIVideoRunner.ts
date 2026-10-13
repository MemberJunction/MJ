/**
 * @fileoverview Runner for avatar video generation on `Video` models.
 *
 * @module @memberjunction/ai-prompts
 */

import { AvatarVideoParams, BaseVideoGenerator, VideoResult } from '@memberjunction/ai';
import { BaseMediaRunner } from '../media/BaseMediaRunner';
import { AIMediaRunOutcome } from '../media/media-runner.types';
import { SecondsIn } from '../media/media-usage';
import { AIAvatarVideoRunParams, AIVideoRunResult } from './video-runner.types';

/**
 * Runs avatar video generation on `Video` models (`BaseVideoGenerator` drivers). It selects a model
 * from the carrier prompt's bindings (or the pinned `ModelID`), resolves credentials, fails over,
 * and writes an `MJ: AI Prompt Runs` row.
 *
 * The runner models what the primitive offers, which is a request and nothing after it.
 * `BaseVideoGenerator.CreateAvatarVideo` returns a video ID, and HeyGen, the one driver, returns it
 * as soon as HeyGen accepts the render job, before the video exists. The primitive has no call to
 * check a job's status, so the runner does not wait for the render: a successful run means the
 * provider accepted the request, and its row records the video ID. For the same reason the video's
 * length is recorded, in the `Seconds` measure, only when a driver reports it in
 * `VideoResult.usage`; HeyGen's does not, so its runs record no usage and stay uncosted.
 *
 * `CreateVideoTranslation` is not run: its params are an empty placeholder, and no driver
 * implements it.
 */
export class AIVideoRunner extends BaseMediaRunner<AIAvatarVideoRunParams, BaseVideoGenerator, VideoResult> {
  /** The carrier prompt used when the caller names none. */
  public static readonly DEFAULT_PROMPT_NAME = 'Default Video Generation';

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
      Invoke: driver => driver.CreateAvatarVideo(this.DriverParams<AvatarVideoParams>(params)),
      DescribeRequest: p => this.describeRequest(p),
      DescribeOutput: output => this.describeVideo(output),
    });
    return this.toResult(outcome);
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
}
