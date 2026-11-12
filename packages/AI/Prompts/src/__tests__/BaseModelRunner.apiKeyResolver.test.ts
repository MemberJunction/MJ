import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { CredentialEngine } from '@memberjunction/credentials';
import { AIAPIKeys } from '@memberjunction/ai';
import type { AIPromptParams, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseModelRunner } from '../BaseModelRunner';

/**
 * `AIPromptParams.APIKeyResolver` (#4807): a caller holding a run's key-resolution capability rather than
 * its key list — Computer Use inside an agent run — gets the run's key in the legacy tier, after any
 * explicit `apiKeys` entry and before the environment key.
 */
class ResolverProbeRunner extends BaseModelRunner {
  public override get RequiredModelType(): string {
    return 'LLM';
  }

  public Has(driverClass: string, params: AIPromptParams): boolean {
    return this.HasCredentialsAvailable(driverClass, undefined, undefined, undefined, params);
  }

  public Resolve(driverClass: string, params: AIPromptParams): Promise<string> {
    return this.ResolveCredentialForExecution(driverClass, undefined, undefined, undefined, params);
  }
}

const prompt = { Name: 'Test Prompt' } as unknown as MJAIPromptEntityExtended;

describe('BaseModelRunner APIKeyResolver', () => {
  const runner = new ResolverProbeRunner();

  beforeEach(() => {
    (AIAPIKeys as unknown as Record<string, Record<string, string>>)['_cachedAPIKeys'] = {};
    process.env['AI_VENDOR_API_KEY__OPENAILLM'] = 'platform-key';
    vi.spyOn(CredentialEngine.Instance, 'Config').mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env['AI_VENDOR_API_KEY__OPENAILLM'];
    vi.restoreAllMocks();
  });

  it('answers with the resolver\'s key over the platform key', async () => {
    const asked: string[] = [];
    const key = await runner.Resolve('OpenAILLM', {
      prompt,
      APIKeyResolver: (driverClass) => { asked.push(driverClass); return 'run-key'; },
    });

    expect(key).toBe('run-key');
    expect(asked).toEqual(['OpenAILLM']);
  });

  it('lets an explicit apiKeys entry win over the resolver, without asking it', async () => {
    const resolver = vi.fn(() => 'run-key');
    const key = await runner.Resolve('OpenAILLM', {
      prompt,
      apiKeys: [{ driverClass: 'OpenAILLM', apiKey: 'explicit-key' }],
      APIKeyResolver: resolver,
    });

    expect(key).toBe('explicit-key');
    expect(resolver).not.toHaveBeenCalled();
  });

  it('asks the resolver when apiKeys has no entry for the driver class', async () => {
    const key = await runner.Resolve('OpenAILLM', {
      prompt,
      apiKeys: [{ driverClass: 'GeminiLLM', apiKey: 'other-key' }],
      APIKeyResolver: () => 'run-key',
    });

    expect(key).toBe('run-key');
  });

  it('falls back to the platform key when the resolver has no answer (a refusal)', async () => {
    const key = await runner.Resolve('OpenAILLM', { prompt, APIKeyResolver: () => undefined });
    expect(key).toBe('platform-key');
  });

  it('without a resolver, resolution is unchanged', async () => {
    expect(await runner.Resolve('OpenAILLM', { prompt })).toBe('platform-key');
  });

  describe('under RuntimeOnly', () => {
    it('counts the resolver\'s answer as a runtime key, without consulting platform credentials', async () => {
      const configure = vi.spyOn(CredentialEngine.Instance, 'Config');
      const key = await runner.Resolve('OpenAILLM', { prompt, CredentialScope: 'RuntimeOnly', APIKeyResolver: () => 'run-key' });

      expect(key).toBe('run-key');
      expect(configure).not.toHaveBeenCalled();
    });

    it('a resolver refusal leaves no key — never the platform key', async () => {
      const key = await runner.Resolve('OpenAILLM', { prompt, CredentialScope: 'RuntimeOnly', APIKeyResolver: () => undefined });
      expect(key).toBeUndefined();
    });

    it('a candidate the resolver answers for is available; one it refuses is not', () => {
      const params: AIPromptParams = {
        prompt,
        CredentialScope: 'RuntimeOnly',
        APIKeyResolver: (driverClass) => (driverClass === 'OpenAILLM' ? 'run-key' : undefined),
      };

      expect(runner.Has('OpenAILLM', params)).toBe(true);
      expect(runner.Has('AnthropicLLM', params)).toBe(false);
    });
  });
});
