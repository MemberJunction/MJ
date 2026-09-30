import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import {
  AvatarInfo,
  AvatarVideoParams,
  BaseVideoGenerator,
  ModelUsage,
  VideoResult,
  VideoTranslationParams,
} from '@memberjunction/ai';
import { VENDOR } from '@memberjunction/unit-testing';
import { MediaHarness } from './__fixtures__/media-runner.harness';
import { AnLLMModelID, LoadMediaCatalog, USAGE_TYPE } from './__fixtures__/media-runner.catalog';
import { AIVideoRunner } from '../video/AIVideoRunner';
import type { AIAvatarVideoRunParams } from '../video/video-runner.types';

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
  return { ...actual, GetAIAPIKey: (driverClass: string, keys?: Array<{ driverClass: string; apiKey: string }>) => harness.GetAPIKey(driverClass, keys) };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  const { MediaHarness: harness } = await vi.importActual<Harness>('./__fixtures__/media-runner.harness');
  /** Every run row is created through the default provider, so the tests read rows from the fake one. */
  class TestMetadata {
    public static get Provider() { return harness.Provider; }
  }
  return { ...actual, Metadata: TestMetadata };
});

vi.mock('@memberjunction/credentials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/credentials')>();
  const { MediaHarness: harness } = await vi.importActual<Harness>('./__fixtures__/media-runner.harness');
  return { ...actual, CredentialEngine: { Instance: harness.CredentialEngine } };
});

// ---------------------------------------------------------------------------
// Scripted video drivers, registered with the ClassFactory under their driver keys.
// ---------------------------------------------------------------------------
const DRIVER_A = 'VideoRunnerTestDriverA';
const DRIVER_B = 'VideoRunnerTestDriverB';

interface VideoCall {
  Driver: string;
  APIKey: string;
  Params: AvatarVideoParams;
}

const calls: VideoCall[] = [];
let respond: (driver: string, params: AvatarVideoParams) => VideoResult;

/** What HeyGen's driver returns: the render job's ID, and no usage, since the video does not exist yet. */
function accepted(videoId: string, usage?: ModelUsage): VideoResult {
  const result = new VideoResult();
  result.success = true;
  result.videoId = videoId;
  result.usage = usage;
  return result;
}

/** A failure the way HeyGen's driver reports one: caught, with only a message. */
function failed(message: string): VideoResult {
  const result = new VideoResult();
  result.success = false;
  result.errorMessage = message;
  return result;
}

abstract class ScriptedVideoGenerator extends BaseVideoGenerator {
  constructor(private readonly key: string, private readonly driverKey: string) {
    super(key);
  }

  public async CreateAvatarVideo(params: AvatarVideoParams): Promise<VideoResult> {
    calls.push({ Driver: this.driverKey, APIKey: this.key, Params: params });
    return respond(this.driverKey, params);
  }

  public async CreateVideoTranslation(_params: VideoTranslationParams): Promise<VideoResult> {
    throw new Error('not used');
  }

  public async GetAvatars(): Promise<AvatarInfo[]> {
    return [];
  }

  public async GetSupportedMethods(): Promise<string[]> {
    return ['CreateAvatarVideo'];
  }
}

class TestDriverA extends ScriptedVideoGenerator {
  constructor(apiKey: string) { super(apiKey, DRIVER_A); }
}
class TestDriverB extends ScriptedVideoGenerator {
  constructor(apiKey: string) { super(apiKey, DRIVER_B); }
}
MJGlobal.Instance.ClassFactory.Register(BaseVideoGenerator, TestDriverA, DRIVER_A, 1000);
MJGlobal.Instance.ClassFactory.Register(BaseVideoGenerator, TestDriverB, DRIVER_B, 1000);

// ---------------------------------------------------------------------------
// Catalog: one avatar video model served by two vendors, as HeyGen's catch-all row is, with no API name.
// ---------------------------------------------------------------------------
const VIDEO_TYPE_ID = 'E4D4E4D4-0000-4000-8000-000000000001';
const VIDEO_MODEL_ID = 'E4D4E4D4-0000-4000-8000-0000000000A1';
const PROMPT_ID = 'E4D4E4D4-0000-4000-8000-0000000000F1';

const contextUser = new UserInfo(undefined, { ID: 'user-001', Name: 'Test User', Email: 'test@example.com' });

function loadCatalog(): void {
  LoadMediaCatalog(MediaHarness, {
    ModelTypeID: VIDEO_TYPE_ID,
    ModelTypeName: 'Video',
    PromptID: PROMPT_ID,
    PromptName: AIVideoRunner.DEFAULT_PROMPT_NAME,
    FailoverStrategy: 'SameModelDifferentVendor',
    Models: [{
      ID: VIDEO_MODEL_ID, Name: 'Avatar Video Model', PowerRank: 10, PromptPriority: 10,
      Vendors: [
        { VendorID: VENDOR.OpenAI, Vendor: 'OpenAI', DriverClass: DRIVER_A, APIName: null, Priority: 10 },
        { VendorID: VENDOR.Google, Vendor: 'Google', DriverClass: DRIVER_B, APIName: null, Priority: 5 },
      ],
    }],
  });
}

function videoParams(overrides: Partial<AIAvatarVideoRunParams> = {}): AIAvatarVideoRunParams {
  return {
    title: 'Quarterly update',
    outputWidth: 1280,
    outputHeight: 720,
    avatarId: 'avatar-1',
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    audioAssetId: 'audio-asset-1',
    imageAssetId: 'image-asset-1',
    avatarStyle: 'normal',
    ContextUser: contextUser,
    ...overrides,
  };
}

describe('AIVideoRunner', () => {
  let runner: AIVideoRunner;

  beforeEach(() => {
    MediaHarness.Reset();
    loadCatalog();
    calls.length = 0;
    respond = () => accepted('video-job-1');
    runner = new AIVideoRunner();
  });

  it('requires Video models', () => {
    expect(runner.RequiredModelType).toBe('Video');
  });

  describe('a successful call', () => {
    it('requests the video and returns the ID the provider accepted it under', async () => {
      const result = await runner.RunAvatarVideo(videoParams());

      expect(result.Success).toBe(true);
      expect(result.VideoID).toBe('video-job-1');
      expect(result.ModelID).toBe(VIDEO_MODEL_ID);
      expect(result.DriverClass).toBe(DRIVER_A);
      expect(calls).toHaveLength(1);
      expect(calls[0].Params).toMatchObject({ avatarId: 'avatar-1', audioAssetId: 'audio-asset-1', outputWidth: 1280 });
      expect(Object.keys(calls[0].Params)).not.toContain('ContextUser');
      expect(Object.keys(calls[0].Params)).not.toContain('ModelID');
    });

    it('writes the run row with the video ID, and no usage when the driver reports no length', async () => {
      const result = await runner.RunAvatarVideo(videoParams({ AgentRunID: 'agent-run-1' }));
      await runner.WaitForPendingPromptRunSaves();
      const run = MediaHarness.LastRun;

      expect(run?.ID).toBe(result.PromptRunID);
      expect(run?.PromptID).toBe(PROMPT_ID);
      expect(run?.Status).toBe('Completed');
      expect(JSON.parse(String(run?.Result))).toEqual({ VideoID: 'video-job-1', DurationSeconds: null });
      expect(JSON.parse(String(run?.Messages))).toEqual({
        Operation: 'CreateAvatarVideo', Title: 'Quarterly update', AvatarID: 'avatar-1', AvatarStyle: 'normal',
        Width: 1280, Height: 720, AudioAssetID: 'audio-asset-1', ImageAssetID: 'image-asset-1', AgentRunID: 'agent-run-1',
      });
      expect(run?.UsageTypeID).toBeUndefined();
      expect(result.DurationSeconds).toBeUndefined();
    });

    it("records the video's seconds when the driver reports them", async () => {
      respond = () => accepted('video-job-2', ModelUsage.ForMedia('Seconds', 0, 30));

      const result = await runner.RunAvatarVideo(videoParams());
      await runner.WaitForPendingPromptRunSaves();
      const run = MediaHarness.LastRun;

      expect(result.DurationSeconds).toBe(30);
      expect(run?.UsageTypeID).toBe(USAGE_TYPE.Seconds);
      expect(run?.OutputUnitsUsed).toBe(30);
      expect(JSON.parse(String(run?.Result)).DurationSeconds).toBe(30);
    });
  });

  describe('failover', () => {
    it("fails over to the model's other vendor when the first reports an outage", async () => {
      respond = driver => (driver === DRIVER_A ? failed('Service temporarily unavailable') : accepted('video-job-3'));

      const result = await runner.RunAvatarVideo(videoParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(calls.map(c => c.Driver)).toEqual([DRIVER_A, DRIVER_B]);
      expect(result.Success).toBe(true);
      expect(result.VideoID).toBe('video-job-3');
      expect(result.DriverClass).toBe(DRIVER_B);
      expect(MediaHarness.LastRun?.FailoverAttempts).toBe(1);
    });

    it('a thrown outage fails over too, and a failure from every vendor is reported', async () => {
      respond = () => {
        throw Object.assign(new Error('503 Service Unavailable'), { status: 503 });
      };

      const result = await runner.RunAvatarVideo(videoParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(calls.map(c => c.Driver)).toEqual([DRIVER_A, DRIVER_B]);
      expect(result.Success).toBe(false);
      expect(result.VideoID).toBeUndefined();
      expect(MediaHarness.LastRun?.Status).toBe('Failed');
    });
  });

  describe('refusals', () => {
    it('refuses a model of another type', async () => {
      const result = await runner.RunAvatarVideo(videoParams({ ModelID: AnLLMModelID(MediaHarness) }));

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/this runner requires "Video"/);
      expect(calls).toHaveLength(0);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });

    it('fails clearly, without a run row, when no candidate has a key', async () => {
      MediaHarness.State.ConfiguredDrivers.clear();

      const result = await runner.RunAvatarVideo(videoParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/No Video model has credentials available for prompt 'Default Video Generation'/);
      expect(calls).toHaveLength(0);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });

    it('refuses a request with no avatar', async () => {
      const result = await runner.RunAvatarVideo(videoParams({ avatarId: '' }));

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/An avatar is required/);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });

    it('fails clearly when the default carrier prompt is missing', async () => {
      MediaHarness.State.Prompts = [];

      const result = await runner.RunAvatarVideo(videoParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/'Default Video Generation' prompt was not found/);
    });
  });
});
