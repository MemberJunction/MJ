import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockConvert = vi.hoisted(() => vi.fn());
const mockGetAllVoices = vi.hoisted(() => vi.fn());
const mockListModels = vi.hoisted(() => vi.fn());
const mockListDictionaries = vi.hoisted(() => vi.fn());

vi.mock('@elevenlabs/elevenlabs-js', () => {
  return {
    ElevenLabsClient: class MockElevenLabsClient {
      textToSpeech = { convert: mockConvert };
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
  return {
    BaseAudioGenerator: MockBaseAudioGenerator,
    TextToSpeechParams: class {},
    SpeechResult: MockSpeechResult,
    SpeechToTextParams: class {},
    VoiceInfo: MockVoiceInfo,
    AudioModel: MockAudioModel,
    PronounciationDictionary: MockPronounciationDictionary,
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
});
