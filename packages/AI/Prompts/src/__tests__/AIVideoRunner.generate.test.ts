import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import {
  AvatarInfo,
  AvatarVideoParams,
  BaseVideoGenerator,
  ErrorAnalyzer,
  ModelUsage,
  VideoGenerationJob,
  VideoGenerationParams,
  VideoResult,
  VideoTranslationParams,
} from '@memberjunction/ai';
import { VENDOR } from '@memberjunction/unit-testing';
import { MediaHarness } from './__fixtures__/media-runner.harness';
import { LoadMediaCatalog, USAGE_TYPE } from './__fixtures__/media-runner.catalog';
import { AIVideoRunner } from '../video/AIVideoRunner';
import type { AIVideoGenerationRunParams } from '../video/video-runner.types';

// ---------------------------------------------------------------------------
// Mocks: the engine, the default provider, keys and credentials all come from the shared harness.
// ---------------------------------------------------------------------------
type Harness = typeof import('./__fixtures__/media-runner.harness');

vi.mock('@memberjunction/aiengine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/aiengine')>();
  const { MediaHarness: harness } = await vi.importActual<Harness>('./__fixtures__/media-runner.harness');
  return { ...actual, AIEngine: { Instance: harness.Engine } };
});

vi.mock('@memberjunction/ai-engine-base', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/ai-engine-base')>();
  const { MediaHarness: harness } = await vi.importActual<Harness>('./__fixtures__/media-runner.harness');
  return { ...actual, AIEngineBase: { Instance: harness.EngineBase } };
});

vi.mock('@memberjunction/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/ai')>();
  const { MediaHarness: harness } = await vi.importActual<Harness>('./__fixtures__/media-runner.harness');
  return {
    ...actual,
    GetAIAPIKey: (driverClass: string, keys?: Array<{ driverClass: string; apiKey: string }>) =>
      harness.GetAPIKey(driverClass, keys),
  };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  const { MediaHarness: harness } = await vi.importActual<Harness>('./__fixtures__/media-runner.harness');
  class TestMetadata {
    public static get Provider() {
      return harness.Provider;
    }
  }
  return { ...actual, Metadata: TestMetadata };
});

vi.mock('@memberjunction/credentials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/credentials')>();
  const { MediaHarness: harness } = await vi.importActual<Harness>('./__fixtures__/media-runner.harness');
  return { ...actual, CredentialEngine: { Instance: harness.CredentialEngine } };
});

// ---------------------------------------------------------------------------
// Scripted generative video drivers
// ---------------------------------------------------------------------------
const GEN_DRIVER_A = 'VideoGenTestDriverA';
const GEN_DRIVER_B = 'VideoGenTestDriverB';

interface SubmitCall {
  Driver: string;
  APIKey: string;
  Params: VideoGenerationParams;
}

interface PollCall {
  Driver: string;
  JobID: string;
  Signal?: AbortSignal;
}

const submitCalls: SubmitCall[] = [];
const pollCalls: PollCall[] = [];

let onSubmit: (driver: string, params: VideoGenerationParams) => VideoGenerationJob | Promise<VideoGenerationJob>;
let onPoll: (driver: string, jobId: string, signal?: AbortSignal) => VideoGenerationJob | Promise<VideoGenerationJob>;

abstract class ScriptedGenerativeVideoDriver extends BaseVideoGenerator {
  constructor(
    private readonly key: string,
    private readonly driverKey: string,
  ) {
    super(key);
  }

  public override async GenerateVideo(params: VideoGenerationParams): Promise<VideoGenerationJob> {
    submitCalls.push({ Driver: this.driverKey, APIKey: this.key, Params: params });
    return onSubmit(this.driverKey, params);
  }

  public override async GetVideoGenerationStatus(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<VideoGenerationJob> {
    pollCalls.push({ Driver: this.driverKey, JobID: jobId, Signal: signal });
    return onPoll(this.driverKey, jobId, signal);
  }

  public async CreateAvatarVideo(_params: AvatarVideoParams): Promise<VideoResult> {
    throw new Error('not used');
  }

  public async CreateVideoTranslation(_params: VideoTranslationParams): Promise<VideoResult> {
    throw new Error('not used');
  }

  public async GetAvatars(): Promise<AvatarInfo[]> {
    return [];
  }

  public async GetSupportedMethods(): Promise<string[]> {
    return ['GenerateVideo', 'GetVideoGenerationStatus'];
  }
}

class GenTestDriverA extends ScriptedGenerativeVideoDriver {
  constructor(apiKey: string) {
    super(apiKey, GEN_DRIVER_A);
  }
}

class GenTestDriverB extends ScriptedGenerativeVideoDriver {
  constructor(apiKey: string) {
    super(apiKey, GEN_DRIVER_B);
  }
}

MJGlobal.Instance.ClassFactory.Register(BaseVideoGenerator, GenTestDriverA, GEN_DRIVER_A, 1000);
MJGlobal.Instance.ClassFactory.Register(BaseVideoGenerator, GenTestDriverB, GEN_DRIVER_B, 1000);

// ---------------------------------------------------------------------------
// Catalog: Default Generative Video with NextBestModel failover across two models
// ---------------------------------------------------------------------------
const VIDEO_TYPE_ID = 'E4D4E4D4-0000-4000-8000-000000000001';
const GEN_MODEL_A_ID = 'E4D4E4D4-0000-4000-8000-0000000000B1';
const GEN_MODEL_B_ID = 'E4D4E4D4-0000-4000-8000-0000000000B2';
const GEN_PROMPT_ID = 'E4D4E4D4-0000-4000-8000-0000000000F2';

const contextUser = new UserInfo(undefined, {
  ID: 'user-001',
  Name: 'Test User',
  Email: 'test@example.com',
});

const SAMPLE_MP4 = Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex');

function loadCatalog(): void {
  LoadMediaCatalog(MediaHarness, {
    ModelTypeID: VIDEO_TYPE_ID,
    ModelTypeName: 'Video',
    PromptID: GEN_PROMPT_ID,
    PromptName: AIVideoRunner.GENERATIVE_PROMPT_NAME,
    FailoverStrategy: 'NextBestModel',
    Models: [
      {
        ID: GEN_MODEL_A_ID,
        Name: 'FLUX 3 Video',
        PowerRank: 20,
        PromptPriority: 10,
        Vendors: [
          {
            VendorID: VENDOR.OpenAI,
            Vendor: 'Black Forest Labs',
            DriverClass: GEN_DRIVER_A,
            APIName: 'flux-3-video',
            Priority: 10,
          },
        ],
      },
      {
        ID: GEN_MODEL_B_ID,
        Name: 'Fallback Video Model',
        PowerRank: 10,
        PromptPriority: 5,
        Vendors: [
          {
            VendorID: VENDOR.Google,
            Vendor: 'Google',
            DriverClass: GEN_DRIVER_B,
            APIName: 'fallback-video',
            Priority: 10,
          },
        ],
      },
    ],
  });
}

function genParams(overrides: Partial<AIVideoGenerationRunParams> = {}): AIVideoGenerationRunParams {
  return {
    Prompt: 'A slow dolly shot over a misty mountain ridge at sunrise',
    Mode: 'TextToVideo',
    DurationSeconds: 6,
    AspectRatio: '16:9',
    Quality: 'standard',
    PollIntervalMS: 0,
    ContextUser: contextUser,
    ...overrides,
  };
}

function succeededJob(overrides: Partial<VideoGenerationJob> = {}): VideoGenerationJob {
  return {
    JobID: 'bfl-job-101',
    Status: 'Succeeded',
    Video: {
      Data: Buffer.from(SAMPLE_MP4),
      MimeType: 'video/mp4',
      DurationSeconds: 6,
      Width: 1280,
      Height: 720,
    },
    Provenance: { C2PA: true },
    ...overrides,
  };
}

describe('AIVideoRunner.RunGenerateVideo', () => {
  let runner: AIVideoRunner;

  beforeEach(() => {
    MediaHarness.Reset();
    loadCatalog();
    submitCalls.length = 0;
    pollCalls.length = 0;
    onSubmit = () => ({ JobID: 'bfl-job-101', Status: 'Pending' });
    onPoll = () => succeededJob();
    runner = new AIVideoRunner();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. byte resolution and provenance mapping', () => {
    it('resolves Video.Data when the driver returns a Buffer directly, mapping JobID and C2PA', async () => {
      const result = await runner.RunGenerateVideo(genParams({ Seed: 42 }));

      expect(result.Success).toBe(true);
      expect(result.JobID).toBe('bfl-job-101');
      expect(result.C2PA).toBe(true);
      expect(result.ModelID).toBe(GEN_MODEL_A_ID);
      expect(result.DriverClass).toBe(GEN_DRIVER_A);
      expect(Buffer.isBuffer(result.Video?.Data)).toBe(true);
      expect(result.Video?.Data.equals(SAMPLE_MP4)).toBe(true);
      expect(result.Video?.MimeType).toBe('video/mp4');
      expect(result.Video?.DurationSeconds).toBe(6);
      expect(result.Video?.Width).toBe(1280);
      expect(result.Video?.Height).toBe(720);
      expect(submitCalls).toHaveLength(1);
      expect(Object.keys(submitCalls[0].Params)).not.toContain('PollIntervalMS');
      expect(Object.keys(submitCalls[0].Params)).not.toContain('ContextUser');
      expect(pollCalls).toHaveLength(1);
      expect(pollCalls[0].JobID).toBe('bfl-job-101');
    });

    it('decodes base64 string Video.Data into a Buffer', async () => {
      const b64 = SAMPLE_MP4.toString('base64');
      onPoll = () =>
        succeededJob({
          JobID: 'bfl-job-b64',
          Video: {
            Data: `data:video/mp4;base64,${b64}`,
            MimeType: 'video/mp4',
            DurationSeconds: 6,
            Width: 1920,
            Height: 1080,
          },
          Provenance: { C2PA: false },
        });

      const result = await runner.RunGenerateVideo(genParams());

      expect(result.Success).toBe(true);
      expect(result.JobID).toBe('bfl-job-b64');
      expect(result.C2PA).toBe(false);
      expect(Buffer.isBuffer(result.Video?.Data)).toBe(true);
      expect(result.Video?.Data.equals(SAMPLE_MP4)).toBe(true);
    });

    it('downloads bytes from Video.URL when Data is absent', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(new Uint8Array(SAMPLE_MP4), {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        }),
      );
      onPoll = () =>
        succeededJob({
          JobID: 'bfl-job-url',
          Video: {
            URL: 'https://delivery-us1.bfl.ai/results/clip.mp4',
            MimeType: 'video/mp4',
            DurationSeconds: 6,
            Width: 1280,
            Height: 720,
          },
        });

      const result = await runner.RunGenerateVideo(genParams());

      expect(result.Success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0][0]).toBe('https://delivery-us1.bfl.ai/results/clip.mp4');
      expect(Buffer.isBuffer(result.Video?.Data)).toBe(true);
      expect(result.Video?.Data.equals(SAMPLE_MP4)).toBe(true);
    });
  });

  describe('2. failover and post-submit non-failover contract', () => {
    it('fails over to the second candidate when submission fails with a retriable 429', async () => {
      onSubmit = (driver) => {
        if (driver === GEN_DRIVER_A) {
          const message = 'Request failed with status code 429';
          return {
            JobID: '',
            Status: 'Failed',
            ErrorMessage: message,
            ErrorInfo: ErrorAnalyzer.AnalyzeError(
              Object.assign(new Error(message), { status: 429 }),
              'Black Forest Labs',
            ),
          };
        }
        return { JobID: 'fallback-job-202', Status: 'Pending' };
      };
      onPoll = () => succeededJob({ JobID: 'fallback-job-202' });

      const result = await runner.RunGenerateVideo(genParams());

      expect(result.Success).toBe(true);
      expect(result.JobID).toBe('fallback-job-202');
      expect(result.ModelID).toBe(GEN_MODEL_B_ID);
      expect(result.DriverClass).toBe(GEN_DRIVER_B);
      expect(submitCalls.map((c) => c.Driver)).toEqual([GEN_DRIVER_A, GEN_DRIVER_B]);
      expect(MediaHarness.LastRun?.FailoverAttempts).toBe(1);
    });

    it('does NOT fail over when a job returns Status: Failed after submission (FLUX 3 terminal status)', async () => {
      const failureMessage = 'Video generation failed with status: Error';
      onSubmit = () => ({ JobID: 'https://api.bfl.ai/v1/get_result?id=job-mod', Status: 'Pending' });
      onPoll = () => ({
        JobID: 'https://api.bfl.ai/v1/get_result?id=job-mod',
        Status: 'Failed',
        ErrorMessage: failureMessage,
        ErrorInfo: ErrorAnalyzer.AnalyzeError(new Error(failureMessage), 'Black Forest Labs'),
      });

      const result = await runner.RunGenerateVideo(genParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain(failureMessage);
      expect(submitCalls).toHaveLength(1);
      expect(pollCalls).toHaveLength(1);
      expect(MediaHarness.LastRun?.Status).toBe('Failed');
      expect(MediaHarness.LastRun?.FailoverAttempts ?? 0).toBe(0);
    });

    it('retries transient poll throws (e.g. HTTP 429 on poll) and succeeds without failing over or losing the billed job', async () => {
      const submitUsage = ModelUsage.ForMedia('Seconds', 0, 6);
      submitUsage.cost = 1.44;
      submitUsage.costCurrency = 'USD';
      onSubmit = () => ({
        JobID: 'https://api.bfl.ai/v1/get_result?id=job-transient',
        Status: 'Pending',
        Usage: submitUsage,
      });
      let pollCount = 0;
      onPoll = () => {
        pollCount++;
        if (pollCount === 1) {
          throw Object.assign(new Error('BFL status poll failed (HTTP 429): Too Many Requests'), {
            status: 429,
          });
        }
        if (pollCount === 2) {
          return {
            JobID: 'https://api.bfl.ai/v1/get_result?id=job-transient',
            Status: 'Running',
          };
        }
        return succeededJob({ JobID: 'https://api.bfl.ai/v1/get_result?id=job-transient' });
      };

      const result = await runner.RunGenerateVideo(genParams());

      expect(result.Success).toBe(true);
      expect(submitCalls).toHaveLength(1);
      expect(pollCalls).toHaveLength(3);
      expect(result.Cost).toBe(1.44);
    });

    it('stops after MAX_CONSECUTIVE_POLL_ERRORS (5) consecutive poll throws and does NOT fail over to the second candidate', async () => {
      onSubmit = () => ({ JobID: 'bfl-job-err5', Status: 'Running' });
      onPoll = () => {
        throw new Error('BFL status poll failed (HTTP 503): Service Unavailable');
      };

      const result = await runner.RunGenerateVideo(genParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('bfl-job-err5');
      expect(result.ErrorMessage).toContain('5 consecutive status poll errors');
      expect(submitCalls).toHaveLength(1);
      expect(pollCalls).toHaveLength(AIVideoRunner.MAX_CONSECUTIVE_POLL_ERRORS);
      expect(MediaHarness.LastRun?.Status).toBe('Failed');
      expect(MediaHarness.LastRun?.FailoverAttempts ?? 0).toBe(0);
    });
  });

  describe('3. cancellation during polling', () => {
    it('aborts polling when CancellationToken fires, records Status: Cancelled, and makes no further polls', async () => {
      const controller = new AbortController();
      onSubmit = () => ({ JobID: 'bfl-job-cancel', Status: 'Pending' });
      onPoll = () => {
        controller.abort('user cancelled');
        return { JobID: 'bfl-job-cancel', Status: 'Running' };
      };

      const result = await runner.RunGenerateVideo(
        genParams({ CancellationToken: controller.signal }),
      );
      const run = MediaHarness.LastRun;

      expect(result.Success).toBe(false);
      expect(submitCalls).toHaveLength(1);
      expect(pollCalls).toHaveLength(1);
      expect(run?.Status).toBe('Cancelled');
      expect(run?.Cancelled).toBe(true);
      expect(run?.CancellationReason).toBe('user_requested');
      expect(run?.FailoverAttempts ?? 0).toBe(0);
    });
  });

  describe('4. poll cap (MAX_POLL_ATTEMPTS) and TimeoutMS', () => {
    it('stops after exactly MAX_POLL_ATTEMPTS when the job stays Running, naming the job ID without failing over', async () => {
      onSubmit = () => ({ JobID: 'bfl-job-stuck-999', Status: 'Running' });
      onPoll = () => ({ JobID: 'bfl-job-stuck-999', Status: 'Running' });

      const result = await runner.RunGenerateVideo(genParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('bfl-job-stuck-999');
      expect(result.ErrorMessage).toContain(String(AIVideoRunner.MAX_POLL_ATTEMPTS));
      expect(submitCalls).toHaveLength(1);
      expect(pollCalls).toHaveLength(AIVideoRunner.MAX_POLL_ATTEMPTS);
      expect(MediaHarness.LastRun?.Status).toBe('Failed');
      expect(MediaHarness.LastRun?.FailoverAttempts ?? 0).toBe(0);
    });

    it('when TimeoutMS fires after submit, stops polling as Fatal without failing over to the second candidate', async () => {
      onSubmit = () => ({ JobID: 'bfl-job-timeout-777', Status: 'Pending' });
      onPoll = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { JobID: 'bfl-job-timeout-777', Status: 'Running' };
      };

      const result = await runner.RunGenerateVideo(genParams({ TimeoutMS: 60 }));

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toContain('bfl-job-timeout-777');
      expect(result.ErrorMessage).toContain('60ms');
      expect(result.ErrorMessage).toContain('billed');
      expect(submitCalls).toHaveLength(1);
      expect(MediaHarness.LastRun?.Status).toBe('Failed');
      expect(MediaHarness.LastRun?.FailoverAttempts ?? 0).toBe(0);
    });
  });

  describe('5. usage, cost, and prompt-run save flush', () => {
    it('records driver-reported seconds and cost on both the run row and the result, with the save flushed before returning', async () => {
      const realGetEntityObject = MediaHarness.Provider.GetEntityObject.bind(MediaHarness.Provider);
      const getEntitySpy = vi
        .spyOn(MediaHarness.Provider, 'GetEntityObject')
        .mockImplementation(async (entityName: string) => {
          const row = await realGetEntityObject(entityName);
          const realSave = row.Save.bind(row);
          row.Save = async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
            return realSave();
          };
          return row;
        });

      try {
        const usage = ModelUsage.ForMedia('Seconds', 0, 8);
        usage.cost = 1.92;
        usage.costCurrency = 'USD';
        onSubmit = () => ({ JobID: 'bfl-job-costed', Status: 'Pending', Usage: usage });
        onPoll = () =>
          succeededJob({
            JobID: 'bfl-job-costed',
            Video: {
              Data: Buffer.from(SAMPLE_MP4),
              MimeType: 'video/mp4',
              DurationSeconds: 8,
              Width: 1280,
              Height: 720,
            },
          });

        const result = await runner.RunGenerateVideo(genParams({ DurationSeconds: 8 }));
        const run = MediaHarness.LastRun;

        expect(result.Success).toBe(true);
        expect(result.Cost).toBe(1.92);
        expect(result.CostCurrency).toBe('USD');
        expect(run?.ID).toBe(result.PromptRunID);
        expect(run?.SaveCount).toBe(2);
        expect(run?.Status).toBe('Completed');
        expect(run?.UsageTypeID).toBe(USAGE_TYPE.Seconds);
        expect(run?.OutputUnitsUsed).toBe(8);
        expect(run?.Cost).toBe(1.92);
      } finally {
        getEntitySpy.mockRestore();
      }
    });

    it('counts seconds from Video.DurationSeconds when the driver reports no usage, leaving result.Cost undefined', async () => {
      onSubmit = () => ({ JobID: 'bfl-job-nocost', Status: 'Pending' });
      onPoll = () =>
        succeededJob({
          JobID: 'bfl-job-nocost',
          Usage: undefined,
          Video: {
            Data: Buffer.from(SAMPLE_MP4),
            MimeType: 'video/mp4',
            DurationSeconds: 10,
            Width: 1280,
            Height: 720,
          },
        });

      const result = await runner.RunGenerateVideo(genParams({ DurationSeconds: 6 }));
      const run = MediaHarness.LastRun;

      expect(result.Success).toBe(true);
      expect(result.Cost).toBeUndefined();
      expect(result.CostCurrency).toBeUndefined();
      expect(run?.SaveCount).toBeGreaterThanOrEqual(2);
      expect(run?.UsageTypeID).toBe(USAGE_TYPE.Seconds);
      expect(run?.OutputUnitsUsed).toBe(10);
    });
  });

  describe('6. Messages and Result hold no media bytes', () => {
    it('writes compact JSON in Messages and Result (< 2 KB each) without embedding any base64 media payloads', async () => {
      const clipBytes = Buffer.alloc(4096, 0xab);
      const refImageB64 = Buffer.alloc(2048, 0xcd).toString('base64');
      const keyframeB64 = Buffer.alloc(2048, 0xef).toString('base64');
      const sourceVideoB64 = Buffer.alloc(2048, 0x77).toString('base64');

      onPoll = () =>
        succeededJob({
          JobID: 'bfl-job-compact',
          Video: {
            Data: clipBytes,
            MimeType: 'video/mp4',
            DurationSeconds: 6,
            Width: 1280,
            Height: 720,
          },
          Provenance: { C2PA: true },
        });

      const result = await runner.RunGenerateVideo(
        genParams({
          Seed: 7,
          WantAudio: true,
          AgentRunID: 'agent-run-99',
          ReferenceImages: [{ Data: refImageB64, MimeType: 'image/png', Role: 'style' }],
          Keyframes: [{ Seconds: 0, Data: keyframeB64, MimeType: 'image/png' }],
          SourceVideo: { Data: sourceVideoB64, MimeType: 'video/mp4' },
        }),
      );
      const run = MediaHarness.LastRun;

      expect(result.Success).toBe(true);
      const messagesStr = String(run?.Messages ?? '');
      const resultStr = String(run?.Result ?? '');

      expect(Buffer.byteLength(messagesStr, 'utf8')).toBeLessThan(2048);
      expect(Buffer.byteLength(resultStr, 'utf8')).toBeLessThan(2048);
      expect(messagesStr).not.toContain(clipBytes.toString('base64'));
      expect(messagesStr).not.toContain(refImageB64);
      expect(messagesStr).not.toContain(keyframeB64);
      expect(messagesStr).not.toContain(sourceVideoB64);
      expect(resultStr).not.toContain(clipBytes.toString('base64'));

      expect(JSON.parse(messagesStr)).toEqual({
        Operation: 'GenerateVideo',
        Prompt: 'A slow dolly shot over a misty mountain ridge at sunrise',
        Mode: 'TextToVideo',
        DurationSeconds: 6,
        AspectRatio: '16:9',
        Quality: 'standard',
        Seed: 7,
        ReferenceImageCount: 1,
        KeyframeCount: 1,
        KeyframeSeconds: [0],
        HasSourceVideo: true,
        WantAudio: true,
        AgentRunID: 'agent-run-99',
      });
      expect(JSON.parse(resultStr)).toEqual({
        JobID: 'bfl-job-compact',
        MimeType: 'video/mp4',
        DurationSeconds: 6,
        Width: 1280,
        Height: 720,
        ByteLength: 4096,
        C2PA: true,
      });
    });
  });

  describe('7. validation refusals create no run row', () => {
    it('refuses an empty prompt without creating a run row', async () => {
      const result = await runner.RunGenerateVideo(genParams({ Prompt: '   ' }));

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/prompt is required/i);
      expect(submitCalls).toHaveLength(0);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });

    it('refuses a non-positive DurationSeconds without creating a run row', async () => {
      const result = await runner.RunGenerateVideo(genParams({ DurationSeconds: 0 }));

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/DurationSeconds/i);
      expect(submitCalls).toHaveLength(0);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });

    it('refuses an invalid Mode without creating a run row', async () => {
      const result = await runner.RunGenerateVideo(
        genParams({ Mode: 'InvalidMode' as AIVideoGenerationRunParams['Mode'] }),
      );

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/Mode must be/i);
      expect(submitCalls).toHaveLength(0);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });
  });
});
