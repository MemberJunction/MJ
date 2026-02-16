import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockAxiosPost = vi.hoisted(() => vi.fn());
const mockIsAxiosError = vi.hoisted(() => vi.fn().mockReturnValue(false));

vi.mock('axios', () => ({
  default: {
    post: mockAxiosPost,
    get: vi.fn(),
  },
  isAxiosError: mockIsAxiosError,
}));

vi.mock('../config', () => ({
  REX_API_HOST: 'https://rex-api.test.co',
  REX_RECOMMEND_HOST: 'https://rex-recommend.test.co',
  REX_USERNAME: 'testuser',
  REX_PASSWORD: 'testpass',
  REX_API_KEY: 'test-rex-key',
  REX_BATCH_SIZE: 200,
}));

vi.mock('env-var', () => ({
  default: {
    get: (name: string) => ({
      asString: () => `mock-${name}`,
      default: (v: unknown) => ({ asInt: () => (typeof v === 'number' ? v : 200) }),
      asInt: () => 200,
    }),
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai-recommendations', () => {
  class MockRecommendationProviderBase {
    MinProbability: number = 0;
    MaxProbability: number = 1;
  }
  class MockRecommendationResult {
    Success: boolean = false;
    private _errors: string[] = [];
    private _warnings: string[] = [];
    constructor(_request: unknown) {}
    AppendError(msg: string) { this._errors.push(msg); this.Success = false; }
    AppendWarning(msg: string) { this._warnings.push(msg); }
    get Errors() { return this._errors; }
  }
  return {
    RecommendationProviderBase: MockRecommendationProviderBase,
    RecommendationRequest: class {},
    RecommendationResult: MockRecommendationResult,
  };
});

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  Metadata: vi.fn().mockImplementation(() => ({
    GetEntityObject: vi.fn().mockResolvedValue({
      NewRecord: vi.fn(),
      Save: vi.fn().mockResolvedValue(true),
      set RecommendationID(v: string) {},
      set DestinationEntityID(v: string) {},
      set DestinationEntityRecordID(v: string) {},
      set MatchProbability(v: number) {},
      set ListID(v: string) {},
      set RecordID(v: string) {},
      set AdditionalData(v: string) {},
      LatestResult: null,
    }),
    EntityByName: vi.fn().mockReturnValue({ ID: 'entity-id-1' }),
  })),
  RunView: vi.fn().mockImplementation(() => ({
    RunView: vi.fn().mockResolvedValue({
      Success: true,
      Results: [],
    }),
  })),
  RunViewResult: class {},
  EntityInfo: class {},
  UserInfo: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJEntityRecordDocumentEntityType: class {},
  MJListDetailEntity: class {},
  MJListEntity: class {},
  MJRecommendationEntity: class {},
  MJRecommendationItemEntity: class {},
}));

import { RexRecommendationsProvider } from '../provider';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('RexRecommendationsProvider', () => {
  let provider: RexRecommendationsProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new RexRecommendationsProvider();
  });

  /* ---- Constructor and defaults ---- */
  describe('constructor', () => {
    it('should create an instance', () => {
      expect(provider).toBeInstanceOf(RexRecommendationsProvider);
    });

    it('should set MinProbability to 0 and MaxProbability to 1', () => {
      expect(provider.MinProbability).toBe(0);
      expect(provider.MaxProbability).toBe(1);
    });
  });

  /* ---- ClampScore ---- */
  describe('ClampScore', () => {
    it('should return value within bounds', () => {
      const fn = (provider as unknown as Record<string, (...args: unknown[]) => number>)['ClampScore']
        .bind(provider);
      expect(fn(0.5, 0, 1)).toBe(0.5);
    });

    it('should clamp to min when below', () => {
      const fn = (provider as unknown as Record<string, (...args: unknown[]) => number>)['ClampScore']
        .bind(provider);
      expect(fn(-0.5, 0, 1)).toBe(0);
    });

    it('should clamp to max when above', () => {
      const fn = (provider as unknown as Record<string, (...args: unknown[]) => number>)['ClampScore']
        .bind(provider);
      expect(fn(1.5, 0, 1)).toBe(1);
    });

    it('should return exact boundary values', () => {
      const fn = (provider as unknown as Record<string, (...args: unknown[]) => number>)['ClampScore']
        .bind(provider);
      expect(fn(0, 0, 1)).toBe(0);
      expect(fn(1, 0, 1)).toBe(1);
    });
  });

  /* ---- GetAccessToken ---- */
  describe('GetAccessToken', () => {
    it('should return token on successful API call', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: {
          results: [{ 'rasa-token': 'mock-token-123' }],
          metadata: {},
        },
      });

      const fn = (provider as unknown as Record<string, () => Promise<string | null>>)['GetAccessToken']
        .bind(provider);
      const token = await fn();
      expect(token).toBe('mock-token-123');
    });

    it('should return null when API returns empty results', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { results: [], metadata: {} },
      });

      const fn = (provider as unknown as Record<string, () => Promise<string | null>>)['GetAccessToken']
        .bind(provider);
      const token = await fn();
      expect(token).toBeNull();
    });

    it('should return null when axios throws', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('network error'));

      const fn = (provider as unknown as Record<string, () => Promise<string | null>>)['GetAccessToken']
        .bind(provider);
      const token = await fn();
      expect(token).toBeNull();
    });
  });

  /* ---- Recommend ---- */
  describe('Recommend', () => {
    it('should return error when Options is missing EntityDocumentID', async () => {
      const request = {
        Options: {},
        Recommendations: [],
        CurrentUser: {},
      };

      const result = await provider.Recommend(request as never);
      expect(result.Success).toBe(false);
    });

    it('should return error when token cannot be obtained', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('auth fail'));

      const request = {
        Options: { EntityDocumentID: 'doc-1' },
        Recommendations: [],
        CurrentUser: {},
      };

      const result = await provider.Recommend(request as never);
      expect(result.Success).toBe(false);
    });
  });
});
