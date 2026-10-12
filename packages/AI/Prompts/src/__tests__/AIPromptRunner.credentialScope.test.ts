/**
 * The RuntimeOnly credential scope on the 6.1.4 AIPromptRunner, where credential resolution lives
 * directly on the runner (private) rather than on a shared BaseModelRunner. Reached via cast, as the
 * other private-method suites in this folder do.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { AIEngine } from '@memberjunction/aiengine';
import { CredentialEngine } from '@memberjunction/credentials';
import { AIAPIKeys } from '@memberjunction/ai';
import type { AIPromptParams, MJAIPromptEntityExtended, MJAIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '../AIPromptRunner';

type CredentialInternals = {
  hasCredentialsAvailable(driverClass: string, promptId: string | undefined, modelId: string | undefined, vendorId: string | undefined, params?: AIPromptParams): boolean;
  resolveCredentialForExecution(driverClass: string, promptId: string | undefined, modelId: string | undefined, vendorId: string | undefined, params: AIPromptParams): Promise<string>;
  attemptJSONRepair(rawOutput: string, originalError: Error, params: AIPromptParams, currentPromptRun: MJAIPromptRunEntityExtended): Promise<unknown>;
};
function priv(r: AIPromptRunner): CredentialInternals { return r as unknown as CredentialInternals; }

const prompt = { Name: 'Test Prompt' } as unknown as MJAIPromptEntityExtended;
const runKeys = [{ driverClass: 'GeminiLLM', apiKey: 'customer-key' }];

describe('AIPromptRunner credential scope', () => {
  const runner = new AIPromptRunner();

  beforeEach(() => {
    (AIAPIKeys as unknown as Record<string, Record<string, string>>)['_cachedAPIKeys'] = {};
    process.env['AI_VENDOR_API_KEY__VERTEXLLM'] = 'platform-key';
  });

  afterEach(() => {
    delete process.env['AI_VENDOR_API_KEY__VERTEXLLM'];
    vi.restoreAllMocks();
  });

  it('under Any, a driver class the run has no key for is available on the platform key', () => {
    expect(priv(runner).hasCredentialsAvailable('VertexLLM', undefined, undefined, undefined, { prompt, apiKeys: runKeys })).toBe(true);
  });

  it('under RuntimeOnly, the same candidate is unavailable — failover cannot reach it', () => {
    expect(priv(runner).hasCredentialsAvailable('VertexLLM', undefined, undefined, undefined, { prompt, apiKeys: runKeys, CredentialScope: 'RuntimeOnly' })).toBe(false);
    expect(priv(runner).hasCredentialsAvailable('GeminiLLM', undefined, undefined, undefined, { prompt, apiKeys: runKeys, CredentialScope: 'RuntimeOnly' })).toBe(true);
  });

  it('under RuntimeOnly, a platform credential binding does not make a candidate available', () => {
    vi.spyOn(AIEngine.Instance, 'HasCredentialBindings').mockReturnValue(true);
    expect(priv(runner).hasCredentialsAvailable('OpenAILLM', undefined, undefined, 'vendor-1', { prompt })).toBe(true);
    expect(priv(runner).hasCredentialsAvailable('OpenAILLM', undefined, undefined, 'vendor-1', { prompt, CredentialScope: 'RuntimeOnly' })).toBe(false);
  });

  it('under RuntimeOnly, resolves the run key without consulting platform credentials, and nothing for an unkeyed class', async () => {
    const configure = vi.spyOn(CredentialEngine.Instance, 'Config');
    await expect(priv(runner).resolveCredentialForExecution('GeminiLLM', undefined, undefined, 'vendor-1', { prompt, apiKeys: runKeys, CredentialScope: 'RuntimeOnly' })).resolves.toBe('customer-key');
    await expect(priv(runner).resolveCredentialForExecution('VertexLLM', undefined, undefined, undefined, { prompt, apiKeys: runKeys, CredentialScope: 'RuntimeOnly' })).resolves.toBeUndefined();
    expect(configure).not.toHaveBeenCalled();
  });

  it("runs an AI JSON repair under the repaired prompt's configuration and credentials", async () => {
    vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue(
      [{ ID: 'repair-json', Name: 'Repair JSON', Category: 'MJ: System' }] as unknown as MJAIPromptEntityExtended[]
    );
    const execute = vi.spyOn(runner, 'ExecutePrompt').mockResolvedValue({ success: true, result: '{"total": 1}' } as Awaited<ReturnType<AIPromptRunner['ExecutePrompt']>>);

    await priv(runner).attemptJSONRepair(
      '{"total": }',
      new Error('Unexpected token }'),
      { prompt, configurationId: 'config-1', apiKeys: runKeys, credentialId: 'credential-1', CredentialScope: 'RuntimeOnly' },
      { ID: 'run-being-repaired' } as unknown as MJAIPromptRunEntityExtended,
    );

    const repairParams = execute.mock.calls[0][0];
    expect(repairParams.parentPromptRunId).toBe('run-being-repaired');
    expect(repairParams.configurationId).toBe('config-1');
    expect(repairParams.apiKeys).toBe(runKeys);
    expect(repairParams.credentialId).toBe('credential-1');
    expect(repairParams.CredentialScope).toBe('RuntimeOnly');
  });
});

describe('a rejected streaming ChatResult in the failover loop', () => {
  it('becomes an Error with the vendor message and the driver classification, not "Unknown error"', async () => {
    const { ErrorAnalyzer } = await import('@memberjunction/ai');
    const rejected = {
      success: false,
      errorMessage: 'API key not valid. Please pass a valid API key.',
      errorInfo: { errorType: 'Authentication', severity: 'Fatal', canFailover: true },
    };

    const error = ((new AIPromptRunner()) as unknown as { asModelError(caught: object): Error }).asModelError(rejected);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('API key not valid. Please pass a valid API key.');
    expect(ErrorAnalyzer.analyzeError(error).errorType).toBe('Authentication');
    expect(ErrorAnalyzer.analyzeError(error).severity).toBe('Fatal');
  });
});
