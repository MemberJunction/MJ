import { describe, it, expect, vi } from 'vitest';
import {
  BaseModelRunner,
  type ModelVendorCandidate,
  type FailoverConfiguration,
  type FailoverAttempt,
} from '../BaseModelRunner';
import { BaseResult, type AIErrorInfo } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import type {
  MJAIPromptEntityExtended,
  MJAIModelEntityExtended,
  MJAIPromptRunEntityExtended,
  AIPromptParams,
} from '@memberjunction/ai-core-plus';

class TestResult extends BaseResult {
  public value?: string;

  constructor(success: boolean, value?: string, errorInfo?: AIErrorInfo, errorMessage?: string) {
    const now = new Date();
    super(success, now, now);
    this.value = value;
    this.errorInfo = errorInfo;
    this.errorMessage = errorMessage;
  }
}

class FakePromptRun {
  public ID = 'fake-pr-1';
  public ModelID?: string;
  public VendorID?: string | null;
  public FailoverAttempts?: number;
  public FailoverErrors?: string | null;
  public FailoverDurations?: string | null;
  public TotalFailoverDuration?: number | null;
  public OriginalModelID?: string;
  [k: string]: unknown;

  NewRecord(): boolean { return true; }
  async Save(): Promise<boolean> { return true; }
}

class TestModelRunner extends BaseModelRunner {
  public availableDrivers = new Set<string>();

  // Not an LLM: the loop has no chat code, so it serves a runner of any model type.
  public override get RequiredModelType(): string {
    return AIEngine.Instance.EmbeddingModelTypeName;
  }

  public override HasCredentialsAvailable(
    driverClass: string,
    _promptId: string,
    _modelId: string,
    _vendorId: string | null,
    _params?: AIPromptParams
  ): boolean {
    return this.availableDrivers.has(driverClass);
  }

  public invokeRaceWithinBound<T>(call: Promise<T>, signal: AbortSignal, prompt: MJAIPromptEntityExtended): Promise<T> {
    const bound = this.createExecutionBound(prompt, { prompt }, signal);
    return this.RaceWithinBound(call, bound, prompt).finally(() => bound.Dispose());
  }

  public invokeExecuteWithFailover<TResult extends BaseResult>(
    prompt: MJAIPromptEntityExtended,
    params: AIPromptParams,
    allCandidates: ModelVendorCandidate[],
    failoverConfig: FailoverConfiguration,
    executeOnCandidate: (candidate: ModelVendorCandidate) => Promise<TResult>,
    createErrorResult: (lastError: Error | null, failoverAttempts: FailoverAttempt[]) => TResult,
    promptRun?: MJAIPromptRunEntityExtended,
    credentialAvailability?: Map<string, boolean>
  ): Promise<TResult> {
    return this.ExecuteWithFailover(
      prompt,
      params,
      allCandidates,
      failoverConfig,
      executeOnCandidate,
      createErrorResult,
      promptRun,
      credentialAvailability
    );
  }
}

describe('BaseModelRunner.ExecuteWithFailover', () => {
  const createCandidate = (
    id: string,
    name: string,
    driverClass: string,
    vendorId: string,
    vendorName: string,
    priority: number
  ): ModelVendorCandidate => {
    const model = {
      ID: id,
      Name: name,
      ModelVendors: [],
    } as unknown as MJAIModelEntityExtended;

    return {
      model,
      vendorId,
      vendorName,
      driverClass,
      isPreferredVendor: false,
      priority,
      source: 'prompt-model',
    };
  };

  const createPrompt = (overrides: Partial<MJAIPromptEntityExtended> = {}): MJAIPromptEntityExtended =>
    ({
      ID: 'prompt-fo-1',
      Name: 'Failover Prompt',
      FailoverStrategy: 'NextBestModel',
      MaxRetries: 0,
      RetryDelayMS: 0,
      ...overrides,
    } as unknown as MJAIPromptEntityExtended);

  const failoverConfig: FailoverConfiguration = {
    strategy: 'NextBestModel',
    maxAttempts: 3,
    delaySeconds: 0,
    modelStrategy: 'PreferSameModel',
    errorScope: 'All',
  };

  const params: AIPromptParams = { prompt: createPrompt() };

  it('1. The first candidate fails with errorInfo.canFailover === true, and the second succeeds. The second candidate result is returned, and failover success is recorded on the prompt run', async () => {
    const runner = new TestModelRunner();
    const c1 = createCandidate('m-1', 'Model 1', 'Driver1', 'v-1', 'Vendor 1', 10);
    const c2 = createCandidate('m-2', 'Model 2', 'Driver2', 'v-2', 'Vendor 2', 5);
    runner.availableDrivers.add('Driver1');
    runner.availableDrivers.add('Driver2');

    const prompt = createPrompt();
    const promptRun = new FakePromptRun() as unknown as MJAIPromptRunEntityExtended;

    const executeOnCandidate = vi.fn(async (candidate: ModelVendorCandidate): Promise<TestResult> => {
      if (candidate.model.ID === 'm-1') {
        const errorInfo: AIErrorInfo = {
          canFailover: true,
          errorType: 'NetworkError',
          severity: 'Retriable',
        };
        return new TestResult(false, undefined, errorInfo, 'Connection reset by peer');
      }
      return new TestResult(true, 'success-from-candidate-2');
    });

    const createErrorResult = vi.fn((lastError: Error | null, attempts: FailoverAttempt[]): TestResult => {
      return new TestResult(false, undefined, undefined, lastError?.message);
    });

    const result = await runner.invokeExecuteWithFailover(
      prompt,
      params,
      [c1, c2],
      failoverConfig,
      executeOnCandidate,
      createErrorResult,
      promptRun
    );

    expect(runner.RequiredModelType).toBe('Embeddings'); // the loop is not tied to chat models
    expect(executeOnCandidate).toHaveBeenCalledTimes(2);
    expect(createErrorResult).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.value).toBe('success-from-candidate-2');

    const rawRun = promptRun as unknown as FakePromptRun;
    expect(rawRun.FailoverAttempts).toBe(1);
    expect(rawRun.ModelID).toBe('m-2');
    expect(rawRun.VendorID).toBe('v-2');
    expect(rawRun.FailoverErrors).toBeDefined();
    const parsedErrors = JSON.parse(rawRun.FailoverErrors as string);
    expect(parsedErrors).toHaveLength(1);
    expect(parsedErrors[0].model).toBe('m-1');
  });

  it('2. Every candidate fails over. createErrorResult is called once, with the last error and one FailoverAttempt per attempted candidate', async () => {
    const runner = new TestModelRunner();
    const c1 = createCandidate('m-1', 'Model 1', 'Driver1', 'v-1', 'Vendor 1', 10);
    const c2 = createCandidate('m-2', 'Model 2', 'Driver2', 'v-2', 'Vendor 2', 5);
    runner.availableDrivers.add('Driver1');
    runner.availableDrivers.add('Driver2');

    const prompt = createPrompt();
    const promptRun = new FakePromptRun() as unknown as MJAIPromptRunEntityExtended;

    const executeOnCandidate = vi.fn(async (candidate: ModelVendorCandidate): Promise<TestResult> => {
      const errorInfo: AIErrorInfo = {
        canFailover: true,
        errorType: 'NetworkError',
        severity: 'Retriable',
      };
      return new TestResult(false, undefined, errorInfo, `Failure on ${candidate.model.Name}`);
    });

    const createErrorResult = vi.fn((lastError: Error | null, attempts: FailoverAttempt[]): TestResult => {
      return new TestResult(false, undefined, undefined, `All failed: ${lastError?.message}`);
    });

    const result = await runner.invokeExecuteWithFailover(
      prompt,
      params,
      [c1, c2],
      failoverConfig,
      executeOnCandidate,
      createErrorResult,
      promptRun
    );

    expect(executeOnCandidate).toHaveBeenCalledTimes(2);
    expect(createErrorResult).toHaveBeenCalledTimes(1);

    const [receivedError, receivedAttempts] = createErrorResult.mock.calls[0];
    expect(receivedError?.message).toBe('Failure on Model 2');
    expect(receivedAttempts).toHaveLength(2);
    expect(receivedAttempts[0].modelId).toBe('m-1');
    expect(receivedAttempts[1].modelId).toBe('m-2');

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('All failed: Failure on Model 2');

    const rawRun = promptRun as unknown as FakePromptRun;
    expect(rawRun.FailoverAttempts).toBe(2);
  });

  it('3. Every candidate lacks credentials. executeOnCandidate is never called, and createErrorResult receives an error whose message starts with No API credentials configured', async () => {
    const runner = new TestModelRunner();
    const c1 = createCandidate('m-1', 'Model 1', 'Driver1', 'v-1', 'Vendor 1', 10);
    const c2 = createCandidate('m-2', 'Model 2', 'Driver2', 'v-2', 'Vendor 2', 5);
    // Neither Driver1 nor Driver2 has credentials
    runner.availableDrivers.clear();

    const prompt = createPrompt({ Name: 'Secret Prompt' });
    const executeOnCandidate = vi.fn(async (): Promise<TestResult> => {
      return new TestResult(true, 'should-not-run');
    });

    const createErrorResult = vi.fn((lastError: Error | null, attempts: FailoverAttempt[]): TestResult => {
      return new TestResult(false, undefined, undefined, lastError?.message);
    });

    const result = await runner.invokeExecuteWithFailover(
      prompt,
      params,
      [c1, c2],
      failoverConfig,
      executeOnCandidate,
      createErrorResult
    );

    expect(executeOnCandidate).not.toHaveBeenCalled();
    expect(createErrorResult).toHaveBeenCalledTimes(1);

    const [receivedError, receivedAttempts] = createErrorResult.mock.calls[0];
    expect(receivedError?.message).toMatch(/^No API credentials configured/);
    expect(receivedError?.message).toContain('candidate model-vendor combination(s) for prompt "Secret Prompt"');
    expect(receivedAttempts).toEqual([]);
    expect(result.success).toBe(false);
  });

  it('4. A failure that is not eligible for failover (canFailover === false) is returned as-is, with no further candidates tried', async () => {
    const runner = new TestModelRunner();
    const c1 = createCandidate('m-1', 'Model 1', 'Driver1', 'v-1', 'Vendor 1', 10);
    const c2 = createCandidate('m-2', 'Model 2', 'Driver2', 'v-2', 'Vendor 2', 5);
    runner.availableDrivers.add('Driver1');
    runner.availableDrivers.add('Driver2');

    const prompt = createPrompt();

    const nonFailoverError: AIErrorInfo = {
      canFailover: false,
      errorType: 'InvalidRequest',
      severity: 'Fatal',
    };

    const executeOnCandidate = vi.fn(async (candidate: ModelVendorCandidate): Promise<TestResult> => {
      if (candidate.model.ID === 'm-1') {
        return new TestResult(false, undefined, nonFailoverError, 'Prompt schema violation');
      }
      return new TestResult(true, 'candidate-2-should-not-run');
    });

    const createErrorResult = vi.fn((lastError: Error | null, attempts: FailoverAttempt[]): TestResult => {
      return new TestResult(false, undefined, undefined, lastError?.message);
    });

    const result = await runner.invokeExecuteWithFailover(
      prompt,
      params,
      [c1, c2],
      failoverConfig,
      executeOnCandidate,
      createErrorResult
    );

    expect(executeOnCandidate).toHaveBeenCalledTimes(1);
    expect(createErrorResult).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('Prompt schema violation');
    expect(result.errorInfo?.canFailover).toBe(false);
  });

  it('RaceWithinBound leaves no abort listener on a caller token reused across calls', async () => {
    const runner = new TestModelRunner();
    const controller = new AbortController();
    const added = vi.spyOn(controller.signal, 'addEventListener');
    const removed = vi.spyOn(controller.signal, 'removeEventListener');

    for (let i = 0; i < 50; i++) {
      await runner.invokeRaceWithinBound(Promise.resolve(i), controller.signal, createPrompt());
    }

    const adds = added.mock.calls.filter(([type]) => type === 'abort').length;
    const removes = removed.mock.calls.filter(([type]) => type === 'abort').length;
    expect(adds).toBe(50);
    expect(removes).toBe(adds);
  });

  describe('caller cancellation', () => {
    const networkError: AIErrorInfo = { canFailover: true, errorType: 'NetworkError', severity: 'Retriable' };
    const driverCancelled: AIErrorInfo = { canFailover: false, errorType: 'Unknown', severity: 'Fatal', providerErrorCode: 'request_cancelled' };

    function setup() {
      const runner = new TestModelRunner();
      const candidates = [
        createCandidate('m-1', 'Model 1', 'Driver1', 'v-1', 'Vendor 1', 10),
        createCandidate('m-2', 'Model 2', 'Driver2', 'v-2', 'Vendor 2', 5),
        createCandidate('m-3', 'Model 3', 'Driver3', 'v-3', 'Vendor 3', 1),
      ];
      ['Driver1', 'Driver2', 'Driver3'].forEach(d => runner.availableDrivers.add(d));
      const createErrorResult = vi.fn((lastError: Error | null, _attempts: FailoverAttempt[]): TestResult =>
        new TestResult(false, undefined, (lastError as Error & { errorInfo?: AIErrorInfo } | null)?.errorInfo, lastError?.message));
      const logError = vi.spyOn(runner as unknown as { logError: (e: Error | string) => void }, 'logError');
      return { runner, candidates, createErrorResult, logError };
    }

    it('tries no candidate when the token is already aborted', async () => {
      const { runner, candidates, createErrorResult } = setup();
      const controller = new AbortController();
      controller.abort();
      const executeOnCandidate = vi.fn(async (): Promise<TestResult> => new TestResult(true, 'must not run'));

      const result = await runner.invokeExecuteWithFailover(
        createPrompt(), { ...params, cancellationToken: controller.signal }, candidates, failoverConfig, executeOnCandidate, createErrorResult);

      expect(executeOnCandidate).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.errorInfo).toMatchObject({ canFailover: false, severity: 'Fatal', providerErrorCode: 'request_cancelled' });
    });

    it('stops after the candidate that was in flight when the caller aborted, even if that call reports a failover-eligible error', async () => {
      const { runner, candidates, createErrorResult, logError } = setup();
      const controller = new AbortController();
      const executeOnCandidate = vi.fn(async (): Promise<TestResult> => {
        controller.abort();
        return new TestResult(false, undefined, networkError, 'socket hang up');
      });

      const result = await runner.invokeExecuteWithFailover(
        createPrompt(), { ...params, cancellationToken: controller.signal }, candidates, failoverConfig, executeOnCandidate, createErrorResult);

      expect(executeOnCandidate).toHaveBeenCalledTimes(1);
      expect(result.errorMessage).toBe('Chat completion was cancelled');
      expect(result.errorInfo?.providerErrorCode).toBe('request_cancelled');
      expect(logError).not.toHaveBeenCalled();
    });

    it('stops when the in-flight candidate throws after the caller aborted', async () => {
      const { runner, candidates, createErrorResult, logError } = setup();
      const controller = new AbortController();
      const executeOnCandidate = vi.fn(async (): Promise<TestResult> => {
        controller.abort();
        throw new Error('Chat completion was cancelled');
      });

      const result = await runner.invokeExecuteWithFailover(
        createPrompt(), { ...params, cancellationToken: controller.signal }, candidates, failoverConfig, executeOnCandidate, createErrorResult);

      expect(executeOnCandidate).toHaveBeenCalledTimes(1);
      expect(result.errorInfo?.canFailover).toBe(false);
      expect(logError).not.toHaveBeenCalled();
    });

    it('stops on a thrown cancellation error even when the loop was given no token', async () => {
      const { runner, candidates, createErrorResult } = setup();
      const executeOnCandidate = vi.fn(async (): Promise<TestResult> => {
        throw (runner as unknown as { BuildCancellationError(): Error }).BuildCancellationError();
      });

      const result = await runner.invokeExecuteWithFailover(createPrompt(), params, candidates, failoverConfig, executeOnCandidate, createErrorResult);

      expect(executeOnCandidate).toHaveBeenCalledTimes(1);
      expect(result.errorInfo?.providerErrorCode).toBe('request_cancelled');
    });

    it('returns a driver-reported cancellation as a cancellation, without logging it as a failure that cannot fail over', async () => {
      const { runner, candidates, createErrorResult, logError } = setup();
      const executeOnCandidate = vi.fn(async (): Promise<TestResult> =>
        new TestResult(false, undefined, driverCancelled, 'Request cancelled by caller'));

      const result = await runner.invokeExecuteWithFailover(createPrompt(), params, candidates, failoverConfig, executeOnCandidate, createErrorResult);

      expect(executeOnCandidate).toHaveBeenCalledTimes(1);
      expect(result.errorMessage).toBe('Request cancelled by caller');
      expect(result.errorInfo?.providerErrorCode).toBe('request_cancelled');
      expect(logError).not.toHaveBeenCalled();
    });

    it('records the real failures before the cancellation on the prompt run, but not the cancellation itself', async () => {
      const { runner, candidates, createErrorResult } = setup();
      const controller = new AbortController();
      const promptRun = new FakePromptRun() as unknown as MJAIPromptRunEntityExtended;
      const executeOnCandidate = vi.fn(async (candidate: ModelVendorCandidate): Promise<TestResult> => {
        if (candidate.model.ID === 'm-1') {
          return new TestResult(false, undefined, networkError, 'Connection reset by peer');
        }
        controller.abort();
        throw new Error('Chat completion was cancelled');
      });

      await runner.invokeExecuteWithFailover(
        createPrompt(), { ...params, cancellationToken: controller.signal }, candidates, failoverConfig, executeOnCandidate, createErrorResult, promptRun);

      expect(executeOnCandidate).toHaveBeenCalledTimes(2);
      const rawRun = promptRun as unknown as FakePromptRun;
      expect(rawRun.FailoverAttempts).toBe(1);
      expect(JSON.parse(rawRun.FailoverErrors as string)[0].model).toBe('m-1');
    });
  });
});
