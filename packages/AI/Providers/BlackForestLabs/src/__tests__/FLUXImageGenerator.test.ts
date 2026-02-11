import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai', () => {
  class MockGeneratedImage {
    data: Buffer | null = null;
    base64: string = '';
    url: string = '';
    format: string = '';
    index: number = 0;
  }

  class MockBaseImageGenerator {
    protected _apiKey: string;
    constructor(apiKey: string) { this._apiKey = apiKey; }
    get apiKey(): string { return this._apiKey; }

    protected createErrorResult(startTime: Date, message: string) {
      return {
        success: false,
        startTime,
        endTime: new Date(),
        images: [],
        errorMessage: message,
        errorInfo: null,
        metadata: null,
      };
    }

    protected createSuccessResult(startTime: Date, images: unknown[]) {
      return {
        success: true,
        startTime,
        endTime: new Date(),
        images,
        errorMessage: null,
        errorInfo: null,
        metadata: null,
      };
    }

    protected async normalizeImageInput(input: unknown) {
      return { base64: 'base64data', format: 'png' };
    }
  }

  return {
    BaseImageGenerator: MockBaseImageGenerator,
    ImageGenerationParams: class {},
    ImageGenerationResult: class {},
    ImageEditParams: class {},
    ImageVariationParams: class {},
    ImageModelInfo: class {},
    GeneratedImage: MockGeneratedImage,
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
  };
});

// Mock global fetch
vi.stubGlobal('fetch', mockFetch);

import { FLUXImageGenerator } from '../index';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('FLUXImageGenerator', () => {
  let generator: FLUXImageGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new FLUXImageGenerator('test-bfl-key');
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance with the provided API key', () => {
      expect(generator).toBeInstanceOf(FLUXImageGenerator);
    });

    it('should use default base URL when none provided', () => {
      const gen = new FLUXImageGenerator('key');
      expect((gen as unknown as Record<string, unknown>)['_baseUrl']).toBe('https://api.bfl.ai/v1');
    });

    it('should accept a custom base URL', () => {
      const gen = new FLUXImageGenerator('key', 'https://custom.api.com');
      expect((gen as unknown as Record<string, unknown>)['_baseUrl']).toBe('https://custom.api.com');
    });

    it('should ignore empty base URL string', () => {
      const gen = new FLUXImageGenerator('key', '');
      expect((gen as unknown as Record<string, unknown>)['_baseUrl']).toBe('https://api.bfl.ai/v1');
    });
  });

  /* ---- setPollingConfig ---- */
  describe('setPollingConfig', () => {
    it('should merge partial polling config', () => {
      generator.setPollingConfig({ maxWaitTime: 60000 });
      const config = (generator as unknown as Record<string, unknown>)['_pollingConfig'] as Record<string, number>;
      expect(config.maxWaitTime).toBe(60000);
      expect(config.pollInterval).toBe(2000); // unchanged default
    });
  });

  /* ---- buildGenerationRequest ---- */
  describe('buildGenerationRequest (private)', () => {
    it('should build basic request with prompt and defaults', () => {
      const fn = (generator as unknown as Record<string, (...args: unknown[]) => unknown>)['buildGenerationRequest']
        .bind(generator);
      const result = fn({ prompt: 'a cat' }) as Record<string, unknown>;
      expect(result.prompt).toBe('a cat');
      expect(result.output_format).toBe('png');
      expect(result.width).toBe(1024);
      expect(result.height).toBe(1024);
    });

    it('should parse size string into width and height', () => {
      const fn = (generator as unknown as Record<string, (...args: unknown[]) => unknown>)['buildGenerationRequest']
        .bind(generator);
      const result = fn({ prompt: 'a dog', size: '1536x1024' }) as Record<string, unknown>;
      expect(result.width).toBe(1536);
      expect(result.height).toBe(1024);
    });

    it('should include seed when provided', () => {
      const fn = (generator as unknown as Record<string, (...args: unknown[]) => unknown>)['buildGenerationRequest']
        .bind(generator);
      const result = fn({ prompt: 'a bird', seed: 42 }) as Record<string, unknown>;
      expect(result.seed).toBe(42);
    });

    it('should include aspectRatio when size is not set', () => {
      const fn = (generator as unknown as Record<string, (...args: unknown[]) => unknown>)['buildGenerationRequest']
        .bind(generator);
      const result = fn({ prompt: 'landscape', aspectRatio: '16:9' }) as Record<string, unknown>;
      expect(result.aspect_ratio).toBe('16:9');
    });

    it('should include providerOptions steps and guidance', () => {
      const fn = (generator as unknown as Record<string, (...args: unknown[]) => unknown>)['buildGenerationRequest']
        .bind(generator);
      const result = fn({
        prompt: 'test',
        providerOptions: { steps: 30, guidance: 7.5 },
      }) as Record<string, unknown>;
      expect(result.steps).toBe(30);
      expect(result.guidance).toBe(7.5);
    });
  });

  /* ---- getModelEndpoint ---- */
  describe('getModelEndpoint (private)', () => {
    it('should map known model names to endpoints', () => {
      const fn = (generator as unknown as Record<string, (...args: unknown[]) => unknown>)['getModelEndpoint']
        .bind(generator);
      expect(fn('flux-2-pro')).toBe('/flux-pro-2');
      expect(fn('flux-1.1-pro')).toBe('/flux-pro-1.1');
      expect(fn('flux-dev')).toBe('/flux-dev');
    });

    it('should return default endpoint for unknown model', () => {
      const fn = (generator as unknown as Record<string, (...args: unknown[]) => unknown>)['getModelEndpoint']
        .bind(generator);
      expect(fn('unknown-model')).toBe('/flux-pro-1.1');
    });
  });

  /* ---- GetModels ---- */
  describe('GetModels', () => {
    it('should return array of model info objects', async () => {
      const models = await generator.GetModels();
      expect(models.length).toBeGreaterThanOrEqual(3);
      expect(models[0].id).toBe('flux-2-pro');
      expect(models[0].supportsSeed).toBe(true);
    });
  });

  /* ---- GetSupportedMethods ---- */
  describe('GetSupportedMethods', () => {
    it('should return supported method names', async () => {
      const methods = await generator.GetSupportedMethods();
      expect(methods).toContain('GenerateImage');
      expect(methods).toContain('EditImage');
      expect(methods).toContain('CreateVariation');
    });
  });

  /* ---- GenerateImage error path ---- */
  describe('GenerateImage', () => {
    it('should return error when submitTask returns no id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }), // no id
      });

      const result = await generator.GenerateImage({ prompt: 'test' } as never);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('No task ID');
    });

    it('should return error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await generator.GenerateImage({ prompt: 'test' } as never);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Network error');
    });
  });
});
