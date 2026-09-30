import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
import { AudioModel, BaseSpeechToText, ErrorAnalyzer, ModelUsage, SpeechResult, SpeechToTextParams } from '@memberjunction/ai';
import { VENDOR } from '@memberjunction/unit-testing';
import { MediaHarness } from './__fixtures__/media-runner.harness';
import { AnLLMModelID, LoadMediaCatalog, USAGE_TYPE } from './__fixtures__/media-runner.catalog';
import { AISpeechToTextRunner } from '../audio/AISpeechToTextRunner';
import type { AISpeechToTextRunParams } from '../audio/audio-runner.types';

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
// Scripted transcription drivers, registered with the ClassFactory under their driver keys.
// ---------------------------------------------------------------------------
const DRIVER_A = 'STTRunnerTestDriverA';
const DRIVER_B = 'STTRunnerTestDriverB';

/** Audio whose bytes, raw or base 64, must never reach the run row. */
const AUDIO = Buffer.from('SECRET-RECORDED-AUDIO');
const TRANSCRIPT = 'The meeting starts at nine.';

interface TranscriptionCall {
  Driver: string;
  APIKey: string;
  Params: SpeechToTextParams;
}

const calls: TranscriptionCall[] = [];
let respond: (driver: string, params: SpeechToTextParams) => SpeechResult;

/** A transcript, with the duration the provider reported when it reported one. */
function transcribed(durationSeconds?: number): SpeechResult {
  const result = new SpeechResult();
  result.success = true;
  result.content = TRANSCRIPT;
  result.usage = durationSeconds === undefined ? undefined : ModelUsage.ForMedia('Seconds', durationSeconds);
  return result;
}

/** A failure from a driver that reports only a message, and leaves it unclassified. */
function failed(message: string): SpeechResult {
  const result = new SpeechResult();
  result.success = false;
  result.errorMessage = message;
  return result;
}

/**
 * A failure the way the OpenAI and Groq drivers report one: the message, and the analyzer's reading
 * of the error their SDK threw, which keeps its HTTP status on `status`.
 */
function rejected(message: string, status: number): SpeechResult {
  const result = failed(message);
  result.errorInfo = ErrorAnalyzer.AnalyzeError(Object.assign(new Error(message), { status }), 'Test vendor');
  return result;
}

/** What OpenAI's Whisper endpoint returns for audio it cannot read. */
const INVALID_FORMAT_400 = "400 Invalid file format. Supported formats: ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm']";

abstract class ScriptedSpeechToText extends BaseSpeechToText {
  constructor(private readonly key: string, private readonly driverKey: string) {
    super(key);
  }

  public async SpeechToText(params: SpeechToTextParams): Promise<SpeechResult> {
    calls.push({ Driver: this.driverKey, APIKey: this.key, Params: params });
    return respond(this.driverKey, params);
  }

  public async GetModels(): Promise<AudioModel[]> {
    return [];
  }

  public async GetSupportedMethods(): Promise<string[]> {
    return ['SpeechToText'];
  }
}

class TestDriverA extends ScriptedSpeechToText {
  constructor(apiKey: string) { super(apiKey, DRIVER_A); }
}
class TestDriverB extends ScriptedSpeechToText {
  constructor(apiKey: string) { super(apiKey, DRIVER_B); }
}
MJGlobal.Instance.ClassFactory.Register(BaseSpeechToText, TestDriverA, DRIVER_A, 1000);
MJGlobal.Instance.ClassFactory.Register(BaseSpeechToText, TestDriverB, DRIVER_B, 1000);

// ---------------------------------------------------------------------------
// Catalog: a Whisper model served by two vendors, and a second model.
// ---------------------------------------------------------------------------
const STT_TYPE_ID = 'D3C3D3C3-0000-4000-8000-000000000001';
const PRIMARY_ID = 'D3C3D3C3-0000-4000-8000-0000000000A1';
const SECONDARY_ID = 'D3C3D3C3-0000-4000-8000-0000000000A2';
const PROMPT_ID = 'D3C3D3C3-0000-4000-8000-0000000000F1';

const contextUser = new UserInfo(undefined, { ID: 'user-001', Name: 'Test User', Email: 'test@example.com' });

function loadCatalog(): void {
  LoadMediaCatalog(MediaHarness, {
    ModelTypeID: STT_TYPE_ID,
    ModelTypeName: 'Speech to Text',
    PromptID: PROMPT_ID,
    PromptName: AISpeechToTextRunner.DEFAULT_PROMPT_NAME,
    FailoverStrategy: 'NextBestModel',
    Models: [
      {
        ID: PRIMARY_ID, Name: 'Whisper Test', PowerRank: 20, PromptPriority: 10,
        Vendors: [
          { VendorID: VENDOR.Groq, Vendor: 'Groq', DriverClass: DRIVER_A, APIName: 'whisper-groq', Priority: 10 },
          { VendorID: VENDOR.OpenAI, Vendor: 'OpenAI', DriverClass: DRIVER_B, APIName: 'whisper-openai', Priority: 5 },
        ],
      },
      {
        ID: SECONDARY_ID, Name: 'Second Transcriber', PowerRank: 10, PromptPriority: 5,
        Vendors: [{ VendorID: VENDOR.Google, Vendor: 'Google', DriverClass: DRIVER_A, APIName: 'transcriber-two', Priority: 10 }],
      },
    ],
  });
}

function transcriptionParams(overrides: Partial<AISpeechToTextRunParams> = {}): AISpeechToTextRunParams {
  return { audioData: AUDIO, fileName: 'standup.mp3', language: 'en', ContextUser: contextUser, ...overrides };
}

describe('AISpeechToTextRunner', () => {
  let runner: AISpeechToTextRunner;

  beforeEach(() => {
    MediaHarness.Reset();
    loadCatalog();
    calls.length = 0;
    respond = () => transcribed(42.5);
    runner = new AISpeechToTextRunner();
  });

  it("requires Task 0.1's single speech-to-text model type", () => {
    expect(runner.RequiredModelType).toBe('Speech to Text');
  });

  describe('a successful call', () => {
    it('transcribes through the top-priority model and returns the transcript and duration', async () => {
      const result = await runner.RunSpeechToText(transcriptionParams());

      expect(result.Success).toBe(true);
      expect(result.Transcript).toBe(TRANSCRIPT);
      expect(result.DurationSeconds).toBe(42.5);
      expect(result.ModelID).toBe(PRIMARY_ID);
      expect(result.DriverClass).toBe(DRIVER_A);
      expect(calls).toHaveLength(1);
      expect(calls[0].Params).toMatchObject({ model: 'whisper-groq', audioData: AUDIO, fileName: 'standup.mp3', language: 'en' });
      expect(Object.keys(calls[0].Params)).not.toContain('ContextUser');
    });

    it('writes the run row with the transcript as Result and the audio seconds in the Seconds measure', async () => {
      const result = await runner.RunSpeechToText(transcriptionParams({ AgentRunID: 'agent-run-1' }));
      await runner.WaitForPendingPromptRunSaves();
      const run = MediaHarness.LastRun;

      expect(run?.ID).toBe(result.PromptRunID);
      expect(run?.PromptID).toBe(PROMPT_ID);
      expect(run?.Status).toBe('Completed');
      expect(run?.Result).toBe(TRANSCRIPT);
      expect(run?.UsageTypeID).toBe(USAGE_TYPE.Seconds);
      expect(run?.InputUnitsUsed).toBe(42.5);
      expect(run?.Cost).toBeUndefined();
      expect(JSON.parse(String(run?.Messages))).toEqual({
        Operation: 'SpeechToText', FileName: 'standup.mp3', Language: 'en', AudioBytes: AUDIO.byteLength, AgentRunID: 'agent-run-1',
      });
    });

    it('records no usage when the driver reported no duration, rather than guessing one', async () => {
      respond = () => transcribed();

      const result = await runner.RunSpeechToText(transcriptionParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(result.Success).toBe(true);
      expect(result.DurationSeconds).toBeUndefined();
      expect(MediaHarness.LastRun?.UsageTypeID).toBeUndefined();
      expect(MediaHarness.LastRun?.InputUnitsUsed).toBeUndefined();
    });

    it('accepts base 64 audio, and never stores the audio in either form', async () => {
      const base64 = AUDIO.toString('base64');

      const result = await runner.RunSpeechToText(transcriptionParams({ audioData: undefined, audioFile: base64 }));
      await runner.WaitForPendingPromptRunSaves();
      const run = MediaHarness.LastRun;

      expect(result.Success).toBe(true);
      expect(calls[0].Params.audioFile).toBe(base64);
      expect(JSON.parse(String(run?.Messages)).AudioBytes).toBe(AUDIO.byteLength);
      expect(JSON.stringify(run)).not.toContain(base64);
      expect(JSON.stringify(run)).not.toContain('SECRET-RECORDED-AUDIO');
    });
  });

  describe('failover', () => {
    it("fails over to the model's other vendor when a pinned model's first vendor fails", async () => {
      respond = driver => (driver === DRIVER_A ? failed('503 Service Unavailable') : transcribed(10));

      const result = await runner.RunSpeechToText(transcriptionParams({ ModelID: PRIMARY_ID }));
      await runner.WaitForPendingPromptRunSaves();

      expect(calls.map(c => c.Params.model)).toEqual(['whisper-groq', 'whisper-openai']);
      expect(result.Success).toBe(true);
      expect(result.ModelID).toBe(PRIMARY_ID);
      expect(result.DriverClass).toBe(DRIVER_B);
      expect(MediaHarness.LastRun?.FailoverAttempts).toBe(1);
      expect(MediaHarness.LastRun?.InputUnitsUsed).toBe(10);
    });

    it('a pinned model never fails over to another model', async () => {
      respond = () => failed('503 Service Unavailable');

      const result = await runner.RunSpeechToText(transcriptionParams({ ModelID: PRIMARY_ID }));
      await runner.WaitForPendingPromptRunSaves();

      expect(calls.map(c => c.Params.model)).toEqual(['whisper-groq', 'whisper-openai']);
      expect(result.Success).toBe(false);
      expect(result.Transcript).toBeUndefined();
      expect(MediaHarness.LastRun?.Status).toBe('Failed');
      expect(MediaHarness.LastRun?.ErrorMessage).toBe('503 Service Unavailable');
    });

    it('under the prompt, NextBestModel reaches the next model', async () => {
      respond = (_driver, params) => (params.model === 'transcriber-two' ? transcribed(5) : failed('503 Service Unavailable'));

      const result = await runner.RunSpeechToText(transcriptionParams());

      expect(result.Success).toBe(true);
      expect(result.ModelID).toBe(SECONDARY_ID);
    });

    it('audio the vendor rejects (a 400) is not uploaded to any other candidate', async () => {
      respond = () => rejected(INVALID_FORMAT_400, 400);

      const result = await runner.RunSpeechToText(transcriptionParams());
      await runner.WaitForPendingPromptRunSaves();

      expect(calls.map(c => c.Params.model)).toEqual(['whisper-groq']);
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toBe(INVALID_FORMAT_400);
      expect(MediaHarness.LastRun?.Status).toBe('Failed');
    });

    it('a rate limit (a 429) still reaches the next candidate', async () => {
      respond = driver => (driver === DRIVER_A ? rejected('429 Rate limit reached for model `whisper-large-v3`', 429) : transcribed(5));

      const result = await runner.RunSpeechToText(transcriptionParams());

      expect(calls.map(c => c.Params.model)).toEqual(['whisper-groq', 'whisper-openai']);
      expect(result.Success).toBe(true);
      expect(result.DriverClass).toBe(DRIVER_B);
    });
  });

  describe('refusals', () => {
    it('refuses a model of another type', async () => {
      const result = await runner.RunSpeechToText(transcriptionParams({ ModelID: AnLLMModelID(MediaHarness) }));

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/this runner requires "Speech to Text"/);
      expect(calls).toHaveLength(0);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });

    it('fails clearly, without a run row, when no candidate has a key', async () => {
      MediaHarness.State.ConfiguredDrivers.clear();

      const result = await runner.RunSpeechToText(transcriptionParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/No Speech to Text model has credentials available for prompt 'Default Speech To Text'/);
      expect(calls).toHaveLength(0);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });

    it('refuses a call with no audio', async () => {
      const result = await runner.RunSpeechToText(transcriptionParams({ audioData: Buffer.alloc(0) }));

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/Audio is required/);
      expect(MediaHarness.State.Runs).toHaveLength(0);
    });

    it('fails clearly when the default carrier prompt is missing', async () => {
      MediaHarness.State.Prompts = [];

      const result = await runner.RunSpeechToText(transcriptionParams());

      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toMatch(/'Default Speech To Text' prompt was not found/);
    });
  });
});
