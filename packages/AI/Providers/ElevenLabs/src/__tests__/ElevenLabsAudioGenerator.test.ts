import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockConvert = vi.hoisted(() => vi.fn());
const mockConvertWithTimestamps = vi.hoisted(() => vi.fn());
const mockGetAllVoices = vi.hoisted(() => vi.fn());
const mockListModels = vi.hoisted(() => vi.fn());
const mockListDictionaries = vi.hoisted(() => vi.fn());

vi.mock('@elevenlabs/elevenlabs-js', () => {
  return {
    ElevenLabsClient: class MockElevenLabsClient {
      textToSpeech = { convert: mockConvert, convertWithTimestamps: mockConvertWithTimestamps };
      voices = { getAll: mockGetAllVoices };
      models = { list: mockListModels };
      pronunciationDictionaries = { list: mockListDictionaries };
      constructor(_opts: Record<string, unknown>) {}
    },
  };
});

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai', () => {
  class MockBaseAudioGenerator {
    protected _apiKey: string;
    constructor(apiKey: string) { this._apiKey = apiKey; }
    get apiKey() { return this._apiKey; }
  }
  class MockSpeechResult {
    data: Buffer | null = null;
    content: string = '';
    success: boolean = false;
    errorMessage: string = '';
    Alignment?: { Characters: string[]; StartSeconds: number[]; EndSeconds: number[] };
  }
  class MockVoiceInfo {
    id: string = '';
    name: string = '';
    description: string | undefined = undefined;
    labels: Array<{ key: string; value: string }> = [];
    category: string = '';
    previewUrl: string = '';
  }
  class MockAudioModel {
    id: string = '';
    name: string = '';
    supportsTextToSpeech: boolean = false;
    supportsVoiceConversion: boolean = false;
    supportsStyle: boolean = false;
    supportsSpeakerBoost: boolean = false;
    supportsFineTuning: boolean = false;
    languages: Array<{ id: string; name: string }> = [];
  }
  class MockPronounciationDictionary {
    id: string = '';
    name: string = '';
    description: string = '';
    latestVersionId: string = '';
    createdBy: string = '';
    creationTimeStamp: number = 0;
  }
  // Minimal stand-in for the realtime base class (the package index re-exports the
  // ElevenLabsRealtime driver, which extends it at module-load time).
  class MockBaseRealtimeModel {
    protected apiKey: string;
    constructor(apiKey: string) { this.apiKey = apiKey; }
  }
  return {
    BaseAudioGenerator: MockBaseAudioGenerator,
    // Read only as the driver's second @RegisterClass argument; RegisterClass is a no-op here.
    BaseTextToSpeech: class MockBaseTextToSpeech {},
    BaseRealtimeModel: MockBaseRealtimeModel,
    TextToSpeechParams: class {},
    SpeechResult: MockSpeechResult,
    SpeechToTextParams: class {},
    VoiceInfo: MockVoiceInfo,
    AudioModel: MockAudioModel,
    PronounciationDictionary: MockPronounciationDictionary,
    ThrowIfAborted: vi.fn(),
    IsRequestAborted: vi.fn().mockReturnValue(false),
    BuildCancellationErrorInfo: vi.fn(),
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
  };
});

import { ElevenLabsAudioGenerator } from '../index';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('ElevenLabsAudioGenerator', () => {
  let audio: ElevenLabsAudioGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    audio = new ElevenLabsAudioGenerator('test-eleven-key');
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance', () => {
      expect(audio).toBeInstanceOf(ElevenLabsAudioGenerator);
    });
  });

  /* ---- GetVoices ---- */
  describe('GetVoices', () => {
    it('should parse voice list from API response', async () => {
      mockGetAllVoices.mockResolvedValueOnce({
        voices: [
          {
            voiceId: 'v1',
            name: 'Rachel',
            labels: { description: 'Calm', accent: 'American' },
            category: 'professional',
            previewUrl: 'https://preview.url/v1',
          },
          {
            voiceId: 'v2',
            name: 'Drew',
            labels: { description: 'Energetic' },
            category: 'narration',
            previewUrl: 'https://preview.url/v2',
          },
        ],
      });

      const voices = await audio.GetVoices();
      expect(voices).toHaveLength(2);
      expect(voices[0].id).toBe('v1');
      expect(voices[0].name).toBe('Rachel');
      expect(voices[0].description).toBe('Calm');
      expect(voices[0].labels).toHaveLength(2);
      expect(voices[0].category).toBe('professional');
    });

    it('should return empty array on error', async () => {
      mockGetAllVoices.mockRejectedValueOnce(new Error('API error'));
      const voices = await audio.GetVoices();
      expect(voices).toEqual([]);
    });
  });

  /* ---- GetModels ---- */
  describe('GetModels', () => {
    it('should parse model metadata from API', async () => {
      mockListModels.mockResolvedValueOnce([
        {
          modelId: 'eleven_monolingual_v1',
          name: 'Eleven English v1',
          canDoTextToSpeech: true,
          canDoVoiceConversion: false,
          canUseStyle: true,
          canUseSpeakerBoost: true,
          canBeFinetuned: false,
          languages: [
            { languageId: 'en', name: 'English' },
          ],
        },
      ]);

      const models = await audio.GetModels();
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('eleven_monolingual_v1');
      expect(models[0].name).toBe('Eleven English v1');
      expect(models[0].supportsTextToSpeech).toBe(true);
      expect(models[0].supportsVoiceConversion).toBe(false);
      expect(models[0].languages).toHaveLength(1);
      expect(models[0].languages[0].name).toBe('English');
    });

    it('should return empty array on error', async () => {
      mockListModels.mockRejectedValueOnce(new Error('API error'));
      const models = await audio.GetModels();
      expect(models).toEqual([]);
    });
  });

  /* ---- GetSupportedMethods ---- */
  describe('GetSupportedMethods', () => {
    it('should return supported method names', async () => {
      const methods = await audio.GetSupportedMethods();
      expect(methods).toContain('CreateSpeech');
      expect(methods).toContain('GetVoices');
      expect(methods).toContain('GetModels');
      expect(methods).toContain('GetPronounciationDictionaries');
    });
  });

  /* ---- SpeechToText ---- */
  describe('SpeechToText', () => {
    it('should throw not implemented', async () => {
      await expect(audio.SpeechToText({} as never)).rejects.toThrow('Method not implemented.');
    });
  });

  /* ---- GetPronounciationDictionaries ---- */
  describe('GetPronounciationDictionaries', () => {
    it('should handle pagination and return all dictionaries', async () => {
      mockListDictionaries
        .mockResolvedValueOnce({
          pronunciationDictionaries: [
            { id: 'd1', name: 'Dict 1', description: 'First', latestVersionId: 'v1', createdBy: 'user1', creationTimeUnix: 100 },
          ],
          hasMore: true,
          nextCursor: 'cursor1',
        })
        .mockResolvedValueOnce({
          pronunciationDictionaries: [
            { id: 'd2', name: 'Dict 2', description: 'Second', latestVersionId: 'v2', createdBy: 'user2', creationTimeUnix: 200 },
          ],
          hasMore: false,
        });

      const dicts = await audio.GetPronounciationDictionaries();
      expect(dicts).toHaveLength(2);
      expect(dicts[0].id).toBe('d1');
      expect(dicts[1].id).toBe('d2');
    });

    it('should return empty array on error', async () => {
      mockListDictionaries.mockRejectedValueOnce(new Error('API error'));
      const dicts = await audio.GetPronounciationDictionaries();
      expect(dicts).toEqual([]);
    });
  });

  /* ---- CreateSpeech ---- */
  describe('CreateSpeech', () => {
    function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      });
    }

    it('calls convert and leaves Alignment undefined when IncludeTimestamps is omitted or false', async () => {
      const sampleBytes = new Uint8Array([10, 20, 30, 40]);
      mockConvert.mockResolvedValueOnce(streamFromBytes(sampleBytes));

      const result = await audio.CreateSpeech({
        voice: 'voice-1',
        text: 'Hello there',
        model_id: 'eleven_monolingual_v1',
      });

      expect(mockConvert).toHaveBeenCalledTimes(1);
      expect(mockConvertWithTimestamps).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toEqual(Buffer.from(sampleBytes));
      expect(result.content).toBe(Buffer.from(sampleBytes).toString('base64'));
      expect(result.Alignment).toBeUndefined();
    });

    it('calls convertWithTimestamps and populates Alignment when IncludeTimestamps is true', async () => {
      const audioBase64 = Buffer.from([1, 2, 3, 4, 5]).toString('base64');
      mockConvertWithTimestamps.mockResolvedValueOnce({
        audioBase64,
        alignment: {
          characters: ['H', 'i', ' ', 'M', 'J'],
          characterStartTimesSeconds: [0, 0.08, 0.16, 0.22, 0.3],
          characterEndTimesSeconds: [0.08, 0.16, 0.22, 0.3, 0.42],
        },
      });

      const result = await audio.CreateSpeech({
        voice: 'voice-1',
        text: 'Hi MJ',
        model_id: 'eleven_multilingual_v2',
        IncludeTimestamps: true,
      });

      expect(mockConvertWithTimestamps).toHaveBeenCalledTimes(1);
      expect(mockConvertWithTimestamps.mock.calls[0][0]).toBe('voice-1');
      expect(mockConvertWithTimestamps.mock.calls[0][1]).toMatchObject({
        text: 'Hi MJ',
        modelId: 'eleven_multilingual_v2',
      });
      expect(mockConvert).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.content).toBe(audioBase64);
      expect(result.data).toEqual(Buffer.from(audioBase64, 'base64'));
      expect(result.Alignment).toEqual({
        Characters: ['H', 'i', ' ', 'M', 'J'],
        StartSeconds: [0, 0.08, 0.16, 0.22, 0.3],
        EndSeconds: [0.08, 0.16, 0.22, 0.3, 0.42],
      });
    });

    it('falls back to normalizedAlignment when alignment is absent on convertWithTimestamps response', async () => {
      const audioBase64 = Buffer.from([7, 8, 9]).toString('base64');
      mockConvertWithTimestamps.mockResolvedValueOnce({
        audioBase64,
        normalizedAlignment: {
          characters: ['1', '0'],
          characterStartTimesSeconds: [0, 0.1],
          characterEndTimesSeconds: [0.1, 0.25],
        },
      });

      const result = await audio.CreateSpeech({
        voice: 'voice-1',
        text: '10',
        IncludeTimestamps: true,
      });

      expect(result.success).toBe(true);
      expect(result.Alignment).toEqual({
        Characters: ['1', '0'],
        StartSeconds: [0, 0.1],
        EndSeconds: [0.1, 0.25],
      });
    });
  });
});
