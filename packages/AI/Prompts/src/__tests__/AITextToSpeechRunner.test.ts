import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import {
  AudioModel,
  BaseTextToSpeech,
  ModelUsage,
  PronounciationDictionary,
  SpeechResult,
  TextToSpeechParams,
  VoiceInfo,
} from '@memberjunction/ai';
import { VENDOR } from '@memberjunction/unit-testing';
import { MediaHarness } from './__fixtures__/media-runner.harness';
import { AnLLMModelID, LoadMediaCatalog, USAGE_TYPE } from './__fixtures__/media-runner.catalog';
import { AITextToSpeechRunner } from '../audio/AITextToSpeechRunner';
import type { AITextToSpeechRunParams } from '../audio/audio-runner.types';

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
// Scripted TTS drivers, registered with the ClassFactory under their driver keys.
// ---------------------------------------------------------------------------
const DRIVER_A = 'TTSRunnerTestDriverA';
const DRIVER_B = 'TTSRunnerTestDriverB';

/** MP3 audio (an ID3 header) whose base 64 must never reach the run row. */
const AUDIO = Buffer.concat([Buffer.from('ID3'), Buffer.from('SECRET-AUDIO-BYTES')]);

interface SpeechCall {
  Driver: string;
  APIKey: string;
  Params: TextToSpeechParams;
}

const calls: SpeechCall[] = [];
let respond: (driver: string, params: TextToSpeechParams) => SpeechResult;

function spoken(usage?: ModelUsage): SpeechResult {
  const result = new SpeechResult();
  result.success = true;
  result.data = AUDIO;
  result.content = AUDIO.toString('base64');
  result.usage = usage;
  return result;
}

/** A failure the way the OpenAI and ElevenLabs drivers report one: caught, with only a message. */
function failed(message: string): SpeechResult {
  const result = new SpeechResult();
  result.success = false;
  result.errorMessage = message;
  return result;
}

abstract class ScriptedTextToSpeech extends BaseTextToSpeech {
  constructor(private readonly key: string, private readonly driverKey: string) {
    super(key);
  }

  public async CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult> {
    calls.push({ Driver: this.driverKey, APIKey: this.key, Params: params });
    return respond(this.driverKey, params);
  }

  public async GetVoices(): Promise<VoiceInfo[]> {
    return [];
  }

  public async GetModels(): Promise<AudioModel[]> {
    return [];
  }

  public async GetPronounciationDictionaries(): Promise<PronounciationDictionary[]> {
    return [];
  }

  public async GetSupportedMethods(): Promise<string[]> {
    return ['CreateSpeech'];
  }
}

class TestDriverA extends ScriptedTextToSpeech {
  constructor(apiKey: string) { super(apiKey, DRIVER_A); }
}
class TestDriverB extends ScriptedTextToSpeech {
  constructor(apiKey: string) { super(apiKey, DRIVER_B); }
}
MJGlobal.Instance.ClassFactory.Register(BaseTextToSpeech, TestDriverA, DRIVER_A, 1000);
MJGlobal.Instance.ClassFactory.Register(BaseTextToSpeech, TestDriverB, DRIVER_B, 1000);

// ---------------------------------------------------------------------------
// Catalog: a primary model served by two vendors, and a second model.
// ---------------------------------------------------------------------------
const TTS_TYPE_ID = 'C2B2C2B2-0000-4000-8000-000000000001';
const PRIMARY_ID = 'C2B2C2B2-0000-4000-8000-0000000000A1';
const SECONDARY_ID = 'C2B2C2B2-0000-4000-8000-0000000000A2';
const PROMPT_ID = 'C2B2C2B2-0000-4000-8000-0000000000F1';

const contextUser = new UserInfo(undefined, { ID: 'user-001', Name: 'Test User', Email: 'test@example.com' });

function loadCatalog(failoverStrategy: 'SameModelDifferentVendor' | 'NextBestModel' = 'SameModelDifferentVendor'): void {
  LoadMediaCatalog(MediaHarness, {
    ModelTypeID: TTS_TYPE_ID,
    ModelTypeName: 'TTS',
    PromptID: PROMPT_ID,
    PromptName: AITextToSpeechRunner.DEFAULT_PROMPT_NAME,
    FailoverStrategy: failoverStrategy,
    Models: [
      {
        ID: PRIMARY_ID, Name: 'Primary TTS Model', PowerRank: 20, PromptPriority: 10,
        Vendors: [
          { VendorID: VENDOR.OpenAI, Vendor: 'OpenAI', DriverClass: DRIVER_A, APIName: 'tts-primary', Priority: 10 },
          { VendorID: VENDOR.Google, Vendor: 'Google', DriverClass: DRIVER_B, APIName: 'tts-primary-google', Priority: 5 },
        ],
      },
      {
        ID: SECONDARY_ID, Name: 'Secondary TTS Model', PowerRank: 10, PromptPriority: 5,
        Vendors: [{ VendorID: VENDOR.Groq, Vendor: 'Groq', DriverClass: DRIVER_A, APIName: 'tts-secondary', Priority: 10 }],
      },
    ],
  });
}

function speechParams(overrides: Partial<AITextToSpeechRunParams> = {}): AITextToSpeechRunParams {
  return { text: 'Héllo 👋', voice: 'alloy', ContextUser: contextUser, ...overrides };
}

describe('AITextToSpeechRunner', () => {
  let runner: AITextToSpeechRunner;

  beforeEach(() => {
    MediaHarness.Reset();
    loadCatalog();
    calls.length = 0;
    respond = () => spoken();
    runner = new AITextToSpeechRunner();
  });

  it('requires TTS models', () => {
    expect(runner.RequiredModelType).toBe('TTS');
  });

  describe('a successful call', () => {
    it('speaks through the top-priority model and returns the audio', async () => {
      const result = await runner.RunTextToSpeech(speechParams());

      expect(result.Success).toBe(true);
      expect(result.SpeechResult?.data).toEqual(AUDIO);
      expect(result.ModelID).toBe(PRIMARY_ID);
      expect(result.ModelName).toBe('Primary TTS Model');
      expect(result.DriverClass).toBe(DRIVER_A);
      expect(calls).toHaveLength(1);
      expect(calls[0].Params).toMatchObject({ text: 'Héllo 👋', voice: 'alloy', model_id: 'tts-primary' });
      expect(Object.keys(calls[0].Params)).not.toContain('ContextUser');
      expect(Object.keys(calls[0].Params)).not.toContain('APIKeys');
    });

    it('writes the run row with the characters sent in the Characters measure', async () => {
      const result = await runner.RunTextToSpeech(speechParams());
      await runner.WaitForPendingPromptRunSaves();
      const run = MediaHarness.LastRun;

      expect(run?.ID).toBe(result.PromptRunID);
      expect(run?.PromptID).toBe(PROMPT_ID);
      expect(run?.ModelID).toBe(PRIMARY_ID);
      expect(run?.Status).toBe('Completed');
      expect(run?.Success).toBe(true);
      // 'Héllo 👋' is 7 characters (code points), though 8 UTF-16 units.
      expect(run?.UsageTypeID).toBe(USAGE_TYPE.Characters);
      expect(run?.InputUnitsUsed).toBe(7);
      expect(run?.OutputUnitsUsed).toBe(0);
      expect(run?.TokensUsed).toBeUndefined();
      expect(run?.Cost).toBeUndefined();
    });

    it('describes the audio on the run row without storing it', async () => {
      await runner.RunTextToSpeech(speechParams({ AgentRunID: 'agent-run-1' }));
      await runner.WaitForPendingPromptRunSaves();
      const run = MediaHarness.LastRun;

      expect(JSON.parse(String(run?.Messages))).toEqual({
        Operation: 'CreateSpeech', Text: 'Héllo 👋', Voice: 'alloy', Characters: 7, AgentRunID: 'agent-run-1',
      });
      expect(JSON.parse(String(run?.Result))).toEqual({ Format: 'mp3', Bytes: AUDIO.byteLength, DurationSeconds: null });
      expect(JSON.stringify(run)).not.toContain(AUDIO.toString('base64'));
      expect(JSON.stringify(run)).not.toContain('SECRET-AUDIO-BYTES');
    });

    it("records the driver's own measure when it reports one, not the character count", async () => {
      respond = () => spoken(ModelUsage.ForMedia('Seconds', 0, 3.5));

      await runner.RunTextToSpeech(speechParams());
      await runner.WaitForPendingPromptRunSaves();
      const run = MediaHarness.LastRun;

      expect(run?.UsageTypeID).toBe(USAGE_TYPE.Seconds);
      expect(run?.OutputUnitsUsed).toBe(3.5);
      expect(JSON.parse(String(run?.Result)).DurationSeconds).toBe(3.5);
    });

    it('records the parent run and the agent, and hands the row ID over before the model call', async () => {
      const createdBeforeCall: Array<{ ID: string; DriverCalls: number }> = [];

      const result = await runner.RunTextToSpeech(speechParams({
        ParentRunID: 'parent-run-1',
        AgentID: 'agent-1',
        OnPromptRunCreated: (id: string) => { createdBeforeCall.push({ ID: id, DriverCalls: calls.length }); },
      }));
      await runner.WaitForPendingPromptRunSaves();

      expect(MediaHarness.LastRun?.ParentID).toBe('parent-run-1');
      expect(MediaHarness.LastRun?.AgentID).toBe('agent-1');
      expect(createdBeforeCall).toEqual([{ ID: result.PromptRunID, DriverCalls: 0 }]);
    });
  });

  describe('failover', () => {
    it("fails over to the model's other vendor when the driver reports an outage", async () => {
      respond = driver => (driver === DRIVER_A ? failed('503 Service Unavailable') : spoken());

      const result = await runner.RunTextToSpeech(speechParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(calls.map(c => c.Params.model_id)).toEqual(['tts-primary', 'tts-primary-google']);
      expect(result.Success).toBe(true);
      expect(result.ModelID).toBe(PRIMARY_ID);
      expect(result.DriverClass).toBe(DRIVER_B);
      expect(MediaHarness.LastRun?.FailoverAttempts).toBe(1);
    });

    it('SameModelDifferentVendor never moves to another model, whose voices differ', async () => {
      respond = () => failed('503 Service Unavailable');

      const result = await runner.RunTextToSpeech(speechParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(calls.map(c => c.Params.model_id)).toEqual(['tts-primary', 'tts-primary-google']);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toBe('503 Service Unavailable');
      expect(MediaHarness.LastRun?.Status).toBe('Failed');
      // A failed call is not billed for the characters it sent.
      expect(MediaHarness.LastRun?.UsageTypeID).toBeUndefined();
    });

    it('a pinned model fails over only within its own vendors, even under NextBestModel', async () => {
      loadCatalog('NextBestModel');
      respond = driver => (driver === DRIVER_A ? failed('503 Service Unavailable') : failed('Rate limit exceeded'));

      const result = await runner.RunTextToSpeech(speechParams({ ModelID: PRIMARY_ID }));

      expect(calls.map(c => c.Params.model_id)).toEqual(['tts-primary', 'tts-primary-google']);
      expect(result.Success).toBe(false);
    });

    it('NextBestModel reaches the next model when the first one fails', async () => {
      loadCatalog('NextBestModel');
      respond = (_driver, params) => (params.model_id === 'tts-secondary' ? spoken() : failed('503 Service Unavailable'));

      const result = await runner.RunTextToSpeech(speechParams());

      expect(result.Success).toBe(true);
      expect(result.ModelID).toBe(SECONDARY_ID);
    });

    it('a bad request does not fail over', async () => {
      respond = () => failed('Invalid JSON in request body');

      const result = await runner.RunTextToSpeech(speechParams());

      expect(calls).toHaveLength(1);
      expect(result.Success).toBe(false);
    });
  });

  describe('refusals', () => {
    it('refuses a model of another type', async () => {
      const result = await runner.RunTextToSpeech(speechParams({ ModelID: AnLLMModelID(MediaHarness) }));

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/this runner requires "TTS"/);
      expect(calls).toHaveLength(0);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });

    it('fails clearly, without a run row, when no candidate has a key', async () => {
      MediaHarness.State.ConfiguredDrivers.clear();

      const result = await runner.RunTextToSpeech(speechParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/No TTS model has credentials available for prompt 'Default Text To Speech'/);
      expect(result.ErrorMessage).toContain(DRIVER_A);
      expect(calls).toHaveLength(0);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });

    it("passes the caller's key to the driver of its class", async () => {
      MediaHarness.State.ConfiguredDrivers.clear();

      const result = await runner.RunTextToSpeech(speechParams({ APIKeys: [{ driverClass: DRIVER_A, apiKey: 'caller-key' }] }));

      expect(result.Success).toBe(true);
      expect(calls[0].APIKey).toBe('caller-key');
    });

    it('refuses empty text without creating a run', async () => {
      const result = await runner.RunTextToSpeech(speechParams({ text: '   ' }));

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/Text to speak is required/);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });

    it('fails clearly when the default carrier prompt is missing', async () => {
      MediaHarness.State.Prompts = [];

      const result = await runner.RunTextToSpeech(speechParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/'Default Text To Speech' prompt was not found/);
    });

    it('fails over past a driver class nothing is registered for', async () => {
      loadCatalog('NextBestModel');
      MediaHarness.State.Models.forEach(m => m.ModelVendors.forEach(mv => {
        if (mv.DriverClass === DRIVER_A) {
          mv.DriverClass = 'UnregisteredTTSDriver';
        }
      }));
      MediaHarness.State.ConfiguredDrivers.add('UnregisteredTTSDriver');

      const result = await runner.RunTextToSpeech(speechParams());

      expect(result.Success).toBe(true);
      expect(result.DriverClass).toBe(DRIVER_B);
    });
  });
});
