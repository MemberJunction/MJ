import { describe, it, expect, vi } from 'vitest';
import { BaseResult, ErrorAnalyzer } from '@memberjunction/ai';
import { BaseModelRunner, type FailoverAttempt, type FailoverConfiguration, type ModelVendorCandidate } from '../BaseModelRunner';
import type { AIPromptParams, MJAIModelEntityExtended, MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';

/** Exposes the failover loop's conversion of a caught value into the Error it records. */
class FailoverProbeRunner extends BaseModelRunner {
  public override get RequiredModelType(): string {
    return 'LLM';
  }

  public AsModelError(caught: object): Error {
    return (this as unknown as { asModelError(caught: object): Error }).asModelError(caught);
  }

  /** Every candidate is credentialed, so the loop tries whatever the failover decision allows. */
  public override HasCredentialsAvailable(): boolean {
    return true;
  }

  public RunFailover(
    candidates: ModelVendorCandidate[],
    executeOnCandidate: (candidate: ModelVendorCandidate) => Promise<BaseResult>,
    createErrorResult: (lastError: Error | null, attempts: FailoverAttempt[]) => BaseResult
  ): Promise<BaseResult> {
    const prompt = { ID: 'prompt-rejected', Name: 'Rejected Prompt', FailoverStrategy: 'NextBestModel', MaxRetries: 0 } as unknown as MJAIPromptEntityExtended;
    const params: AIPromptParams = { prompt };
    const config: FailoverConfiguration = { strategy: 'NextBestModel', maxAttempts: 3, delaySeconds: 0, modelStrategy: 'PreferSameModel', errorScope: 'All' };
    return this.ExecuteWithFailover(prompt, params, candidates, config, executeOnCandidate, createErrorResult);
  }
}

function candidate(id: string, vendorId: string): ModelVendorCandidate {
  return {
    model: { ID: id, Name: id, ModelVendors: [] } as unknown as MJAIModelEntityExtended,
    vendorId,
    vendorName: vendorId,
    driverClass: `Driver-${id}`,
    isPreferredVendor: false,
    priority: 1,
    source: 'prompt-model',
  };
}

describe('a rejected streaming ChatResult in the failover loop', () => {
  // BaseLLM rejects a failed stream with its ChatResult, not an Error. Recorded as-is it had no
  // message ("Unknown error") and re-analyzed as Unknown/Transient, so failover kept going on a
  // key the driver had already classified as invalid.
  it('becomes an Error with the vendor message and the driver classification, not "Unknown error"', () => {
    const rejected = {
      success: false,
      errorMessage: 'API key not valid. Please pass a valid API key.',
      errorInfo: { errorType: 'Authentication', severity: 'Fatal', canFailover: true },
    };

    const error = new FailoverProbeRunner().AsModelError(rejected);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('API key not valid. Please pass a valid API key.');
    expect(ErrorAnalyzer.analyzeError(error).errorType).toBe('Authentication');
    expect(ErrorAnalyzer.analyzeError(error).severity).toBe('Fatal');
  });

  it('leaves a real Error untouched', () => {
    const original = new Error('socket hang up');
    expect(new FailoverProbeRunner().AsModelError(original)).toBe(original);
  });
});

describe('the failover loop, when a candidate rejects with a failed ChatResult', () => {
  it('stops at the Fatal Authentication the driver reported, and records the vendor message, not "Unknown error"', async () => {
    // Each candidate is on its own vendor, so only the Fatal severity — read off the converted
    // Error — keeps the second one from being tried.
    const rejected = {
      success: false,
      errorMessage: 'API key not valid. Please pass a valid API key.',
      errorInfo: { errorType: 'Authentication', severity: 'Fatal', canFailover: true, errorMessage: 'API key not valid' },
    };
    const executeOnCandidate = vi.fn(async (c: ModelVendorCandidate): Promise<BaseResult> => {
      if (c.model.ID === 'm-1') {
        throw rejected;
      }
      return new BaseResult(true, new Date(), new Date());
    });
    const createErrorResult = vi.fn((lastError: Error | null, _attempts: FailoverAttempt[]): BaseResult => {
      const result = new BaseResult(false, new Date(), new Date());
      result.errorMessage = lastError?.message ?? 'Unknown error';
      return result;
    });

    const result = await new FailoverProbeRunner().RunFailover([candidate('m-1', 'v-1'), candidate('m-2', 'v-2')], executeOnCandidate, createErrorResult);

    expect(executeOnCandidate).toHaveBeenCalledTimes(1);
    expect(createErrorResult).toHaveBeenCalledTimes(1);
    const [lastError, attempts] = createErrorResult.mock.calls[0];
    expect(lastError).toBeInstanceOf(Error);
    expect(lastError?.message).toBe('API key not valid. Please pass a valid API key.');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].errorType).toBe('Authentication');
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('API key not valid. Please pass a valid API key.');
  });
});

describe('a rejected value that is neither an Error nor a ChatResult', () => {
  it('keeps the classification of what it said: a bare { status: 429 } is RateLimit, not Unknown', () => {
    const error = new FailoverProbeRunner().AsModelError({ status: 429 });

    expect(error).toBeInstanceOf(Error);
    expect(ErrorAnalyzer.analyzeError(error).errorType).toBe('RateLimit');
  });
});
