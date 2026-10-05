import { describe, it, expect } from 'vitest';
import { ErrorAnalyzer } from '@memberjunction/ai';
import { BaseModelRunner } from '../BaseModelRunner';

/** Exposes the failover loop's conversion of a caught value into the Error it records. */
class FailoverProbeRunner extends BaseModelRunner {
  public override get RequiredModelType(): string {
    return 'LLM';
  }

  public AsModelError(caught: object): Error {
    return (this as unknown as { asModelError(caught: object): Error }).asModelError(caught);
  }
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
