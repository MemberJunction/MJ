/**
 * The 6.1.4 AIPromptRunner's last lines of defence for the RuntimeOnly credential scope:
 *  - a rejected non-Error value keeps its own classification when it is wrapped (`asModelError`);
 *  - `executeModel` never hands a driver an empty key under a scope that rules out the environment
 *    (the OpenAI / Anthropic SDKs would read OPENAI_API_KEY / ANTHROPIC_API_KEY themselves);
 *  - the parallel result-selector judge runs under the parallel prompt's scope.
 * Private members are reached via cast, as the other suites in this folder do.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AIEngine } from '@memberjunction/aiengine';
import { BaseLLM, ChatResult, ErrorAnalyzer } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import type {
  AIPromptExecutionScope,
  AIPromptParams,
  AIPromptRunResult,
  MJAIModelEntityExtended,
  MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '../AIPromptRunner';
import { ParallelExecutionCoordinator } from '../ParallelExecutionCoordinator';
import type { ExecutionTaskResult } from '../ParallelExecution';

type RunnerInternals = {
  asModelError(caught: Error | ChatResult): Error;
  resolveCredentialForExecution(...args: unknown[]): Promise<string | undefined>;
  executeModel(
    model: MJAIModelEntityExtended,
    renderedPrompt: string,
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    vendorId: string | null,
    conversationMessages?: undefined,
    templateMessageRole?: 'system',
    cancellationToken?: AbortSignal,
    vendorDriverClass?: string,
    vendorApiName?: string,
  ): Promise<ChatResult>;
};
function priv(r: AIPromptRunner): RunnerInternals {
  return r as unknown as RunnerInternals;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('asModelError on a rejected value that is neither an Error nor a ChatResult', () => {
  it('a bare { status: 429 } is classified as itself before it is wrapped — still a RateLimit', () => {
    const wrapped = priv(new AIPromptRunner()).asModelError({ status: 429 } as unknown as ChatResult);

    expect(wrapped).toBeInstanceOf(Error);
    expect(ErrorAnalyzer.analyzeError(wrapped).errorType).toBe('RateLimit');
  });
});

describe('executeModel never hands a driver an empty key under RuntimeOnly', () => {
  const model = { ID: 'model-1', Name: 'Test Model', DriverClass: 'OpenAILLM', APIName: 'gpt-test', ModelVendors: [] } as unknown as MJAIModelEntityExtended;
  const prompt = { ID: 'prompt-1', Name: 'Test Prompt' } as unknown as MJAIPromptEntityExtended;
  const DRIVER_REACHED = 'driver creation reached';

  function arrange() {
    const runner = new AIPromptRunner();
    // No key resolves for this driver class.
    vi.spyOn(priv(runner), 'resolveCredentialForExecution').mockResolvedValue(undefined);
    const createInstance = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(() => {
      throw new Error(DRIVER_REACHED);
    });
    return { runner, createInstance };
  }

  function run(runner: AIPromptRunner, params: AIPromptParams): Promise<ChatResult> {
    return priv(runner).executeModel(model, 'rendered', prompt, params, null, undefined, 'system', undefined, 'OpenAILLM', 'gpt-test');
  }

  it('under RuntimeOnly, throws "No credentials found for driver class" and never creates the LLM driver', async () => {
    const { runner, createInstance } = arrange();

    await expect(run(runner, { prompt, CredentialScope: 'RuntimeOnly' })).rejects.toThrow(
      /No credentials found for driver class 'OpenAILLM'.*credential scope is RuntimeOnly/
    );
    expect(createInstance).not.toHaveBeenCalled();
  });

  it('under Any, an empty key does not stop it there — it goes on to create the driver', async () => {
    const { runner, createInstance } = arrange();

    await expect(run(runner, { prompt, CredentialScope: 'Any' })).rejects.toThrow(DRIVER_REACHED);
    expect(createInstance).toHaveBeenCalledWith(BaseLLM, 'OpenAILLM', undefined);
  });
});

describe('the parallel result-selector judge runs under the caller\'s scope', () => {
  const JUDGE_ID = 'aaaaaaaa-0000-4000-8000-0000000000aa';

  function candidate(taskId: string): ExecutionTaskResult {
    return {
      task: {
        taskId,
        prompt: { Name: 'Parallel Prompt' },
        model: { Name: `Model ${taskId}`, Vendor: 'Vendor' },
        executionGroup: 0,
        priority: 0,
        renderedPrompt: 'the original prompt',
      },
      success: true,
      rawResult: `answer ${taskId}`,
      executionTimeMS: 1,
    } as unknown as ExecutionTaskResult;
  }

  it("selectBestResult hands the judge's ExecutePrompt the executionScope's keys, configuration and CredentialScope", async () => {
    vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(AIEngine.Instance, 'Prompts', 'get').mockReturnValue(
      [{ ID: JUDGE_ID, Name: 'Judge' }] as unknown as MJAIPromptEntityExtended[]
    );
    const execute = vi.spyOn(AIPromptRunner.prototype, 'ExecutePrompt').mockResolvedValue({
      success: true,
      rawResult: JSON.stringify({ rankings: [{ candidateId: 'b', rank: 1, rationale: 'better' }, { candidateId: 'a', rank: 2, rationale: 'worse' }] }),
    } as AIPromptRunResult);
    const apiKeys = [{ driverClass: 'GeminiLLM', apiKey: 'customer-key' }];
    const executionScope: AIPromptExecutionScope = { configurationId: 'config-1', apiKeys, CredentialScope: 'RuntimeOnly' };

    const best = await new ParallelExecutionCoordinator().selectBestResult(
      [candidate('a'), candidate('b')],
      { method: 'PromptSelector', selectorPromptId: JUDGE_ID },
      undefined,
      undefined,
      executionScope,
    );

    expect(execute).toHaveBeenCalledTimes(1);
    const judgeParams = execute.mock.calls[0][0];
    expect(judgeParams.prompt?.ID).toBe(JUDGE_ID);
    expect(judgeParams.configurationId).toBe('config-1');
    expect(judgeParams.apiKeys).toBe(apiKeys);
    expect(judgeParams.CredentialScope).toBe('RuntimeOnly');
    expect(best?.task.taskId).toBe('b');
  });
});
