import { describe, it, expect, vi, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseLLM, type AICredentialScope, type ChatResult } from '@memberjunction/ai';
import type { AIPromptParams, MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '../AIPromptRunner';

/** The private model call, reached the way the other AIPromptRunner tests reach private members. */
type ExecuteModel = (
  model: MJAIModelEntityExtended,
  renderedPrompt: string,
  prompt: MJAIPromptEntityExtended,
  params: AIPromptParams,
  vendorId: string | null,
  conversationMessages?: undefined,
  templateMessageRole?: 'system',
  cancellationToken?: AbortSignal,
  vendorDriverClass?: string,
  vendorApiName?: string
) => Promise<ChatResult>;

const DRIVER = 'OpenAILLM';
const model = { ID: 'model-1', Name: 'Model 1', DriverClass: DRIVER, APIName: 'gpt-test', ModelVendors: [] } as unknown as MJAIModelEntityExtended;
const prompt = { ID: 'prompt-1', Name: 'Scoped Prompt' } as unknown as MJAIPromptEntityExtended;

/** Thrown by the stubbed ClassFactory: the call got past the guard and asked for a driver. */
const REACHED_DRIVER = 'reached CreateInstance';

/**
 * Runs executeModel with no resolved key. The ClassFactory throws a sentinel, so a run that gets past
 * the guard stops at driver creation instead of making a model call.
 */
async function runWithoutKey(credentialScope: AICredentialScope | undefined): Promise<{ error: Error; createInstance: ReturnType<typeof vi.spyOn> }> {
  const runner = new AIPromptRunner();
  vi.spyOn(runner as unknown as { ResolveCredentialForExecution(): Promise<string | undefined> }, 'ResolveCredentialForExecution')
    .mockResolvedValue(undefined);
  const createInstance = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(() => {
    throw new Error(REACHED_DRIVER);
  });
  const executeModel = (runner as unknown as { executeModel: ExecuteModel }).executeModel.bind(runner);
  const params: AIPromptParams = { prompt, CredentialScope: credentialScope };

  const error = await executeModel(model, 'rendered', prompt, params, null, undefined, 'system', undefined, DRIVER, 'gpt-test').then(
    () => new Error('executeModel resolved'),
    (e: Error) => e
  );
  return { error, createInstance };
}

describe('AIPromptRunner.executeModel with no resolved API key', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('under RuntimeOnly, fails before creating the driver — the SDK would otherwise read the key from the environment', async () => {
    const { error, createInstance } = await runWithoutKey('RuntimeOnly');

    expect(error.message).toMatch(/No credentials found for driver class 'OpenAILLM'/);
    expect(error.message).toContain('RuntimeOnly');
    expect(createInstance).not.toHaveBeenCalled();
  });

  it.each([
    { label: "'Any'", scope: 'Any' as const },
    { label: 'an omitted scope', scope: undefined },
  ])('under $label, does not stop at the guard and goes on to create the driver', async ({ scope }) => {
    const { error, createInstance } = await runWithoutKey(scope);

    expect(error.message).toBe(REACHED_DRIVER);
    expect(createInstance).toHaveBeenCalledWith(BaseLLM, DRIVER, undefined);
  });
});
