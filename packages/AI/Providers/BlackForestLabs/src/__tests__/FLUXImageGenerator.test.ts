import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('@memberjunction/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/global')>()),
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai', async (importOriginal) => {
  // The cancellation helpers are the real ones, so the abort paths run the code that ships.
  const actual = await importOriginal<typeof import('@memberjunction/ai')>();
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
    ModelUsage: actual.ModelUsage,
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
    AbortableDelay: actual.AbortableDelay,
    IsRequestAborted: actual.IsRequestAborted,
    ThrowIfAborted: actual.ThrowIfAborted,
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
    it('should map known model names to BFL documented endpoints', () => {
      const fn = (generator as unknown as Record<string, (...args: unknown[]) => unknown>)['getModelEndpoint']
        .bind(generator);
      expect(fn('flux-2-pro')).toBe('/flux-2-pro');
      expect(fn('flux-1.1-pro')).toBe('/flux-pro-1.1');
      expect(fn('flux-1.1-pro-ultra')).toBe('/flux-pro-1.1-ultra');
      expect(fn('flux-ultra')).toBe('/flux-pro-1.1-ultra');
      expect(fn('flux-1-fill-pro')).toBe('/flux-pro-1.0-fill');
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

  /* ---- pollForResult ---- */
  describe('pollForResult', () => {
    it('uses polling_url from submit response when it is an https://*.bfl.ai/... URL', async () => {
      const regionalUrl = 'https://api.us.bfl.ai/v1/get_result?id=task-regional-1';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-regional-1',
          status: 'Ready',
          result: { sample: 'https://delivery.us1.bfl.ai/sample.jpg' },
        }),
      });

      const pollFn = (generator as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['pollForResult']
        .bind(generator);
      const res = (await pollFn({ id: 'task-regional-1', pollingUrl: regionalUrl })) as Record<string, unknown>;
      expect(res.status).toBe('Ready');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toBe(regionalUrl);
    });

    it('rejects a non-BFL or non-HTTPS polling_url and falls back to ${baseUrl}/get_result?id=...', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-fallback-1',
          status: 'Ready',
          result: { sample: 'https://delivery.us1.bfl.ai/sample.jpg' },
        }),
      });

      const pollFn = (generator as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['pollForResult']
        .bind(generator);
      await pollFn({ id: 'task-fallback-1', pollingUrl: 'https://evil.example.com/get_result?id=task-fallback-1' });
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.bfl.ai/v1/get_result?id=task-fallback-1');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-fallback-2',
          status: 'Ready',
          result: { sample: 'https://delivery.us1.bfl.ai/sample.jpg' },
        }),
      });
      await pollFn({ id: 'task-fallback-2', pollingUrl: 'http://api.bfl.ai/v1/get_result?id=task-fallback-2' });
      expect(mockFetch.mock.calls[1][0]).toBe('https://api.bfl.ai/v1/get_result?id=task-fallback-2');
    });

    it('falls back to ${baseUrl}/get_result?id=... when polling_url is absent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'task-no-url',
          status: 'Ready',
          result: { sample: 'https://delivery.us1.bfl.ai/sample.jpg' },
        }),
      });

      const pollFn = (generator as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)['pollForResult']
        .bind(generator);
      await pollFn({ id: 'task-no-url' });
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.bfl.ai/v1/get_result?id=task-no-url');
    });
  });

  /* ---- GenerateImage ---- */
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

    it('treats No Card Generated as a final failure and surfaces Moderation Reasons', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'task-mod-1',
            polling_url: 'https://api.bfl.ai/v1/get_result?id=task-mod-1',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'task-mod-1',
            status: 'No Card Generated',
            details: { 'Moderation Reasons': ['Safety Filter', 'Policy Violation'] },
          }),
        });

      const result = await generator.GenerateImage({ prompt: 'blocked prompt' } as never);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('No Card Generated');
      expect(result.errorMessage).toContain('Safety Filter, Policy Violation');
    });

    it('records settled cost in credits as usage.cost = credits / 100 USD and infers format from Content-Type', async () => {
      const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'task-cost-1',
            polling_url: 'https://api.eu.bfl.ai/v1/get_result?id=task-cost-1',
            cost: 4,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'task-cost-1',
            status: 'Ready',
            cost: 4.8,
            result: {
              sample: 'https://delivery-eu1.bfl.ai/results/sample.jpg',
              seed: 12345,
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'image/jpeg' }),
          arrayBuffer: async () =>
            imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength),
        });

      const result = await generator.GenerateImage({ prompt: 'a mountain lake' } as never);
      expect(result.success).toBe(true);
      expect(mockFetch.mock.calls[0][0]).toBe('https://api.bfl.ai/v1/flux-2-pro');
      expect(mockFetch.mock.calls[1][0]).toBe('https://api.eu.bfl.ai/v1/get_result?id=task-cost-1');
      expect(result.images).toHaveLength(1);
      expect(result.images[0].format).toBe('jpeg');
      expect(result.usage).toBeDefined();
      expect(result.usage?.unitKind).toBe('Images');
      expect(result.usage?.inputUnits).toBe(0);
      expect(result.usage?.outputUnits).toBe(1);
      expect(result.usage?.cost).toBeCloseTo(0.048, 6);
      expect(result.usage?.costCurrency).toBe('USD');
      expect(result.metadata).toEqual({ seed: 12345, cost: 4.8 });
    });
  });
});
