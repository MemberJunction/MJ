/**
 * @fileoverview Package-internal runner for generative video (`GenerateVideo` + status polling).
 *
 * @module @memberjunction/ai-prompts
 */

import {
  AbortableDelay,
  BaseVideoGenerator,
  BuildCancellationErrorInfo,
  IsRequestAborted,
  IsTimeoutAbort,
  ModelUsage,
  VideoGenerationJob,
  VideoGenerationMode,
  VideoGenerationParams,
  VideoGenerationQuality,
} from '@memberjunction/ai';
import { BaseMediaRunner } from '../media/BaseMediaRunner';
import { AIMediaRunOutcome, MediaDriverOutput } from '../media/media-runner.types';
import { AIVideoRunner } from './AIVideoRunner';
import { AIVideoGenerationRunParams } from './video-runner.types';

const VALID_MODES = new Set<VideoGenerationMode>([
  'TextToVideo',
  'ImageToVideo',
  'VideoToVideo',
  'Continuation',
]);

const VALID_QUALITIES = new Set<VideoGenerationQuality>(['draft', 'standard', 'high']);

/**
 * Raw driver output carried across {@link BaseMediaRunner}'s candidate-walk
 * for a generative video call.
 */
export interface VideoGenerationCallOutput extends MediaDriverOutput {
  /** Final or last-observed job snapshot from the provider. */
  Job?: VideoGenerationJob;
  /** Resolved video bytes when generation succeeded. */
  Bytes?: Buffer;
}

/**
 * Package-internal runner for `GenerateVideo` (prompt submission + status polling
 * + video byte resolution) over {@link BaseVideoGenerator}.
 *
 * Pre-submit failures (`GenerateVideo` throws or returns `Status === 'Failed'`
 * before a job is queued) use the driver's error classification so transient
 * submission errors (HTTP 429/503) can fail over to the next model/vendor
 * candidate while pre-spend `Fatal` errors do not.
 *
 * Once a job is accepted (`Pending`, `Running`, or `Succeeded`), failover is
 * strictly disabled (`severity: 'Fatal', canFailover: false`) because the
 * submitted job is already running and billable at the first provider.
 */
export class VideoGenerationRunner extends BaseMediaRunner<
  AIVideoGenerationRunParams,
  BaseVideoGenerator,
  VideoGenerationCallOutput
> {
  public override get RequiredModelType(): string {
    return 'Video';
  }

  protected override get DefaultLogCategory(): string {
    return 'AIVideoRunner';
  }

  protected override get DefaultPromptName(): string {
    return AIVideoRunner.GENERATIVE_PROMPT_NAME;
  }

  protected override get DriverBaseClass(): typeof BaseVideoGenerator {
    return BaseVideoGenerator;
  }

  public async Run(
    params: AIVideoGenerationRunParams,
  ): Promise<AIMediaRunOutcome<VideoGenerationCallOutput>> {
    return this.RunMediaOperation(params, {
      Name: 'GenerateVideo',
      Validate: (p) => {
        if (!p.Prompt || p.Prompt.trim().length === 0) {
          return 'A prompt is required (params.Prompt)';
        }
        if (
          typeof p.DurationSeconds !== 'number' ||
          !Number.isFinite(p.DurationSeconds) ||
          p.DurationSeconds <= 0
        ) {
          return 'A positive DurationSeconds is required (params.DurationSeconds)';
        }
        if (!VALID_MODES.has(p.Mode)) {
          return 'Mode must be TextToVideo, ImageToVideo, VideoToVideo, or Continuation (params.Mode)';
        }
        if (!VALID_QUALITIES.has(p.Quality)) {
          return 'Quality must be draft, standard, or high (params.Quality)';
        }
        return undefined;
      },
      Invoke: async (driver, _apiName, signal) => {
        const { PollIntervalMS: _pollIntervalMS, ...driverParams } =
          this.DriverParams<VideoGenerationParams & { PollIntervalMS?: number }>(
            params,
            signal,
          );

        const submitted = await driver.GenerateVideo(driverParams);

        if (submitted.Status === 'Failed') {
          return {
            success: false,
            errorMessage: submitted.ErrorMessage || 'Video generation submission failed',
            errorInfo: submitted.ErrorInfo,
            usage: submitted.Usage,
            Job: submitted,
          };
        }

        if (submitted.Status === 'Cancelled') {
          return {
            success: false,
            errorMessage: submitted.ErrorMessage || 'The Video call was cancelled',
            errorInfo: submitted.ErrorInfo ?? BuildCancellationErrorInfo({ signal }),
            usage: submitted.Usage,
            Job: submitted,
          };
        }

        const pollIntervalMS =
          typeof params.PollIntervalMS === 'number' &&
          Number.isFinite(params.PollIntervalMS) &&
          params.PollIntervalMS >= 0
            ? params.PollIntervalMS
            : AIVideoRunner.DEFAULT_POLL_INTERVAL_MS;

        let currentJob: VideoGenerationJob = submitted;
        let pollAttempts = 0;
        let consecutiveErrors = 0;

        while (currentJob.Status === 'Pending' || currentJob.Status === 'Running') {
          if (pollAttempts >= AIVideoRunner.MAX_POLL_ATTEMPTS) {
            return {
              success: false,
              errorMessage: `Video generation job '${currentJob.JobID}' did not complete within ${AIVideoRunner.MAX_POLL_ATTEMPTS} status polls; the job may still finish and be billed at the vendor.`,
              errorInfo: {
                errorType: 'ServiceUnavailable',
                severity: 'Fatal',
                canFailover: false,
              },
              usage: currentJob.Usage ?? submitted.Usage,
              Job: currentJob,
            };
          }

          await AbortableDelay(pollIntervalMS, signal);
          pollAttempts++;

          let polled: VideoGenerationJob;
          try {
            polled = await driver.GetVideoGenerationStatus(currentJob.JobID, signal);
          } catch (err) {
            if (
              (signal?.aborted || IsRequestAborted(err, signal)) &&
              !IsTimeoutAbort(signal)
            ) {
              throw err;
            }
            consecutiveErrors++;
            if (consecutiveErrors >= AIVideoRunner.MAX_CONSECUTIVE_POLL_ERRORS) {
              const detail = err instanceof Error ? err.message : String(err);
              return {
                success: false,
                errorMessage: `Video generation job '${currentJob.JobID}' failed after ${consecutiveErrors} consecutive status poll errors (${detail}); the job may still finish and be billed at the vendor.`,
                errorInfo: {
                  errorType: 'ServiceUnavailable',
                  severity: 'Fatal',
                  canFailover: false,
                },
                usage: currentJob.Usage ?? submitted.Usage,
                Job: currentJob,
              };
            }
            continue;
          }

          if (signal?.aborted && !IsTimeoutAbort(signal)) {
            return {
              success: false,
              errorMessage: 'The Video call was cancelled',
              errorInfo: BuildCancellationErrorInfo({ signal }),
              usage: polled.Usage ?? currentJob.Usage ?? submitted.Usage,
              Job: polled,
            };
          }

          consecutiveErrors = 0;
          currentJob = polled;
        }

        if (currentJob.Status === 'Cancelled') {
          return {
            success: false,
            errorMessage: currentJob.ErrorMessage || 'The Video call was cancelled',
            errorInfo: currentJob.ErrorInfo ?? BuildCancellationErrorInfo({ signal }),
            usage: currentJob.Usage ?? submitted.Usage,
            Job: currentJob,
          };
        }

        if (currentJob.Status === 'Failed') {
          return {
            success: false,
            errorMessage:
              currentJob.ErrorMessage ||
              `Video generation job '${currentJob.JobID}' failed after submission`,
            errorInfo: {
              ...(currentJob.ErrorInfo ?? { errorType: 'ModelError' }),
              severity: 'Fatal',
              canFailover: false,
            },
            usage: currentJob.Usage ?? submitted.Usage,
            Job: currentJob,
          };
        }

        // Status === 'Succeeded' — resolve video bytes
        const video = currentJob.Video;
        if (!video) {
          return {
            success: false,
            errorMessage: `Video generation job '${currentJob.JobID}' succeeded without a Video payload`,
            errorInfo: {
              errorType: 'ModelError',
              severity: 'Fatal',
              canFailover: false,
            },
            usage: currentJob.Usage ?? submitted.Usage,
            Job: currentJob,
          };
        }

        let bytes: Buffer | undefined;
        if (Buffer.isBuffer(video.Data)) {
          bytes = video.Data;
        } else if (typeof video.Data === 'string' && video.Data.length > 0) {
          const raw = video.Data.replace(/^data:[^;]+;base64,/, '');
          bytes = Buffer.from(raw, 'base64');
        } else if (video.URL) {
          try {
            const response = await fetch(
              video.URL,
              signal ? { signal } : undefined,
            );
            if (!response.ok) {
              return {
                success: false,
                errorMessage: `Video download for job '${currentJob.JobID}' failed with HTTP ${response.status}`,
                errorInfo: {
                  errorType: 'ModelError',
                  severity: 'Fatal',
                  canFailover: false,
                },
                usage: currentJob.Usage ?? submitted.Usage,
                Job: currentJob,
              };
            }
            bytes = Buffer.from(await response.arrayBuffer());
          } catch (err) {
            if (
              (signal?.aborted || IsRequestAborted(err, signal)) &&
              !IsTimeoutAbort(signal)
            ) {
              throw err;
            }
            const detail = err instanceof Error ? err.message : String(err);
            return {
              success: false,
              errorMessage: `Video download for job '${currentJob.JobID}' failed: ${detail}`,
              errorInfo: {
                errorType: 'ModelError',
                severity: 'Fatal',
                canFailover: false,
              },
              usage: currentJob.Usage ?? submitted.Usage,
              Job: currentJob,
            };
          }
        }

        if (!bytes || bytes.byteLength === 0) {
          return {
            success: false,
            errorMessage: `Video generation job '${currentJob.JobID}' succeeded with empty video bytes`,
            errorInfo: {
              errorType: 'ModelError',
              severity: 'Fatal',
              canFailover: false,
            },
            usage: currentJob.Usage ?? submitted.Usage,
            Job: currentJob,
          };
        }

        return {
          success: true,
          usage: currentJob.Usage ?? submitted.Usage,
          Job: currentJob,
          Bytes: bytes,
        };
      },
      DescribeRequest: (p) =>
        JSON.stringify({
          Operation: 'GenerateVideo',
          Prompt: p.Prompt,
          Mode: p.Mode,
          DurationSeconds: p.DurationSeconds,
          AspectRatio: p.AspectRatio,
          Quality: p.Quality,
          Seed: p.Seed,
          ReferenceImageCount: p.ReferenceImages?.length ?? 0,
          KeyframeCount: p.Keyframes?.length ?? 0,
          KeyframeSeconds: p.Keyframes?.map((k) => k.Seconds) ?? [],
          HasSourceVideo: Boolean(p.SourceVideo),
          WantAudio: p.WantAudio,
          AgentRunID: p.AgentRunID,
        }),
      DescribeOutput: (output) =>
        JSON.stringify({
          JobID: output.Job?.JobID,
          MimeType: output.Job?.Video?.MimeType,
          DurationSeconds: output.Job?.Video?.DurationSeconds,
          Width: output.Job?.Video?.Width,
          Height: output.Job?.Video?.Height,
          ByteLength: output.Bytes?.byteLength ?? 0,
          C2PA: output.Job?.Provenance?.C2PA,
        }),
      CountUsage: (p, output) =>
        ModelUsage.ForMedia(
          'Seconds',
          0,
          output.Job?.Video?.DurationSeconds || p.DurationSeconds,
        ),
    });
  }
}
