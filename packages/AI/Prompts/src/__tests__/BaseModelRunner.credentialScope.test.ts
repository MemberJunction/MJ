import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { AIEngine } from '@memberjunction/aiengine';
import { CredentialEngine } from '@memberjunction/credentials';
import { AIAPIKeys } from '@memberjunction/ai';
import type { AIPromptParams, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseModelRunner } from '../BaseModelRunner';

/** Exposes the two credential seams every runner shares: candidate gating and key resolution. */
class CredentialProbeRunner extends BaseModelRunner {
  public override get RequiredModelType(): string {
    return 'LLM';
  }

  public Has(driverClass: string, vendorId: string | undefined, params: AIPromptParams): boolean {
    return this.HasCredentialsAvailable(driverClass, undefined, undefined, vendorId, params);
  }

  public Resolve(driverClass: string, vendorId: string | undefined, params: AIPromptParams): Promise<string> {
    return this.ResolveCredentialForExecution(driverClass, undefined, undefined, vendorId, params);
  }
}

const prompt = { Name: 'Test Prompt' } as unknown as MJAIPromptEntityExtended;
const runKeys = [{ driverClass: 'GeminiLLM', apiKey: 'customer-key' }];

describe('BaseModelRunner credential scope', () => {
  const runner = new CredentialProbeRunner();

  beforeEach(() => {
    (AIAPIKeys as unknown as Record<string, Record<string, string>>)['_cachedAPIKeys'] = {};
    process.env['AI_VENDOR_API_KEY__VERTEXLLM'] = 'platform-key';
  });

  afterEach(() => {
    delete process.env['AI_VENDOR_API_KEY__VERTEXLLM'];
    vi.restoreAllMocks();
  });

  describe('HasCredentialsAvailable', () => {
    it('under Any, a driver class the run has no key for is available on the platform key', () => {
      expect(runner.Has('VertexLLM', undefined, { prompt, apiKeys: runKeys })).toBe(true);
    });

    it('under RuntimeOnly, the same candidate is unavailable — failover cannot reach it', () => {
      expect(runner.Has('VertexLLM', undefined, { prompt, apiKeys: runKeys, CredentialScope: 'RuntimeOnly' })).toBe(false);
    });

    it('under RuntimeOnly, a driver class the run carries a key for is still available', () => {
      expect(runner.Has('GeminiLLM', undefined, { prompt, apiKeys: runKeys, CredentialScope: 'RuntimeOnly' })).toBe(true);
    });

    it('under RuntimeOnly, a platform credential binding does not make a candidate available', () => {
      // Bindings outrank apiKeys under Any, so they are a second platform source the scope must close.
      vi.spyOn(AIEngine.Instance, 'HasCredentialBindings').mockReturnValue(true);

      expect(runner.Has('OpenAILLM', 'vendor-1', { prompt })).toBe(true);
      expect(runner.Has('OpenAILLM', 'vendor-1', { prompt, CredentialScope: 'RuntimeOnly' })).toBe(false);
    });

    it('under RuntimeOnly, a per-request credentialId is the caller\'s own and still counts', () => {
      expect(runner.Has('OpenAILLM', undefined, { prompt, credentialId: 'credential-1', CredentialScope: 'RuntimeOnly' })).toBe(true);
    });
  });

  describe('ResolveCredentialForExecution', () => {
    it('under RuntimeOnly, answers with the run key and never consults platform credentials', async () => {
      const configure = vi.spyOn(CredentialEngine.Instance, 'Config');

      const key = await runner.Resolve('GeminiLLM', 'vendor-1', { prompt, apiKeys: runKeys, CredentialScope: 'RuntimeOnly' });

      expect(key).toBe('customer-key');
      expect(configure).not.toHaveBeenCalled();
    });

    it('under RuntimeOnly, has no key for a driver class the run does not carry', async () => {
      const key = await runner.Resolve('VertexLLM', undefined, { prompt, apiKeys: runKeys, CredentialScope: 'RuntimeOnly' });
      expect(key).toBeUndefined();
    });
  });
});
