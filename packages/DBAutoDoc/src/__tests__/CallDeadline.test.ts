import { describe, it, expect, vi } from 'vitest';
import { BaseLLM, ChatParams, ChatResult } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

import {
  DEFAULT_CALL_TIMEOUT_MS,
  LLMCallTimeoutError,
  resolveCallTimeoutMs,
  withCallDeadline,
} from '../utils/call-deadline.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { LLMDiscoveryValidator } from '../discovery/LLMDiscoveryValidator.js';
import type { AIConfig, RelationshipDiscoveryConfig } from '../types/config.js';

/**
 * Every LLM call in this package was unbounded: no timeout, no deadline, no AbortSignal at any of
 * the six provider call sites. The retry machinery cannot substitute for one, because it only runs
 * once a promise settles and a provider that accepts the socket then stops sending never settles
 * one. A stall therefore bypassed retry, backoff and error reporting alike, and simply parked the
 * run — looking, from outside, exactly like slow progress.
 *
 * These tests pin the bound BEHAVIOURALLY: that the promise rejects, that the in-flight request is
 * actually aborted (not merely abandoned), and that the call sites pass the signal through.
 */

describe('resolveCallTimeoutMs', () => {
  it('defaults when unset, so an existing config gets the bound', () => {
    expect(resolveCallTimeoutMs(undefined)).toBe(DEFAULT_CALL_TIMEOUT_MS);
  });

  it('treats 0 as an explicit opt-out', () => {
    expect(resolveCallTimeoutMs(0)).toBe(0);
  });

  it('treats a negative or non-finite value as no bound rather than an instant one', () => {
    // A negative ceiling that fired immediately would fail every call in the run.
    expect(resolveCallTimeoutMs(-1)).toBe(0);
    expect(resolveCallTimeoutMs(Number.NaN)).toBe(0);
  });
});

describe('withCallDeadline', () => {
  it('rejects with a typed timeout once the ceiling elapses, instead of waiting forever', async () => {
    // The call never settles on its own — the shape of a real stall.
    const promise = withCallDeadline(20, 'stalling call', () => new Promise<string>(() => {}));
    await expect(promise).rejects.toBeInstanceOf(LLMCallTimeoutError);
  });

  it('ABORTS the in-flight request, not just the wait', async () => {
    // Rejecting without aborting leaves the request open — which is how a failing provider ends up
    // holding a pile of sockets while the caller opens another. Assert the signal actually fired.
    let seen: AbortSignal | undefined;
    const promise = withCallDeadline(20, 'stalling call', signal => {
      seen = signal;
      return new Promise<string>(() => {});
    });
    await expect(promise).rejects.toBeInstanceOf(LLMCallTimeoutError);
    expect(seen).toBeDefined();
    expect(seen!.aborted).toBe(true);
  });

  it('carries the word "timeout" so the retry classifier treats a stall as retriable', async () => {
    // PromptEngine.isRetryableError classifies on message text; so does MJ's ErrorAnalyzer.
    const promise = withCallDeadline(20, 'stalling call', () => new Promise<string>(() => {}));
    await expect(promise).rejects.toThrow(/timeout/i);
  });

  it('leaves a call that finishes in time completely alone', async () => {
    const result = await withCallDeadline(5_000, 'quick call', async () => 'answered');
    expect(result).toBe('answered');
  });

  it('passes NO signal when the bound is disabled, restoring the previous behaviour exactly', async () => {
    let seen: AbortSignal | undefined | 'unset' = 'unset';
    const result = await withCallDeadline(0, 'unbounded call', async signal => {
      seen = signal;
      return 'answered';
    });
    expect(result).toBe('answered');
    expect(seen).toBeUndefined();
  });

  it('propagates the call\'s own failure unchanged rather than masking it as a timeout', async () => {
    await expect(
      withCallDeadline(5_000, 'failing call', async () => {
        throw new Error('401 invalid api key');
      })
    ).rejects.toThrow('401 invalid api key');
  });
});

/** Minimal AIConfig for the call-site tests. */
function aiConfig(over: Partial<AIConfig> = {}): AIConfig {
  return { provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-test', ...over };
}

/** A driver that records the ChatParams it was handed and never answers on its own. */
class RecordingLLM {
  public lastParams: ChatParams | undefined;
  public resolveWith: ChatResult | undefined;
  async ChatCompletion(params: ChatParams): Promise<ChatResult> {
    this.lastParams = params;
    if (this.resolveWith) {
      return this.resolveWith;
    }
    return new Promise<ChatResult>(() => {});
  }
}

function okResult(): ChatResult {
  return {
    success: true,
    data: { choices: [{ message: { content: '{}' } }], usage: { totalTokens: 1, promptTokens: 1, completionTokens: 0 } },
  } as unknown as ChatResult;
}

describe('PromptEngine — the bound reaches the driver', () => {
  it('hands the provider a cancellationToken, which is what makes the abort real', async () => {
    const llm = new RecordingLLM();
    llm.resolveWith = okResult();
    const engine = new PromptEngine(aiConfig(), '/nonexistent-prompts');
    (engine as unknown as { llm: RecordingLLM }).llm = llm;

    await (engine as unknown as {
      executeWithRetry: (p: ChatParams, len: number) => Promise<ChatResult>;
    }).executeWithRetry({ model: 'gpt-4o-mini', messages: [] } as ChatParams, 10);

    expect(llm.lastParams?.cancellationToken).toBeDefined();
  });

  it('passes no cancellationToken when the bound is disabled', async () => {
    const llm = new RecordingLLM();
    llm.resolveWith = okResult();
    const engine = new PromptEngine(aiConfig({ callTimeoutMs: 0 }), '/nonexistent-prompts');
    (engine as unknown as { llm: RecordingLLM }).llm = llm;

    await (engine as unknown as {
      executeWithRetry: (p: ChatParams, len: number) => Promise<ChatResult>;
    }).executeWithRetry({ model: 'gpt-4o-mini', messages: [] } as ChatParams, 10);

    expect(llm.lastParams?.cancellationToken).toBeUndefined();
  });

  it('classifies a call-timeout message as retryable', () => {
    // Without this the deadline would convert a stall into an immediate give-up, which is a
    // different failure from the one being fixed.
    const engine = new PromptEngine(aiConfig(), '/nonexistent-prompts');
    const isRetryable = (engine as unknown as { isRetryableError: (m: string) => boolean })
      .isRetryableError.bind(engine);
    expect(isRetryable('prompt for model x exceeded its 120000ms call timeout — the model call was aborted (timeout)')).toBe(true);
    // And the classifier still refuses the things it always refused.
    expect(isRetryable('401 unauthorized')).toBe(false);
  });
});

describe('LLMDiscoveryValidator — the provider resolves through the driver-class map', () => {
  it('asks the ClassFactory for the DRIVER CLASS, not the raw provider name', () => {
    // This constructor used to pass `aiConfig.provider` ('gemini') as the ClassFactory
    // registration key. Registered keys are driver names ('GeminiLLM'), so the documented provider
    // values could not resolve here at all — while the other five call sites in the package mapped
    // them correctly through llm-factory.
    const spy = vi
      .spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance')
      .mockReturnValue(new RecordingLLM() as unknown as BaseLLM);

    try {
      new LLMDiscoveryValidator(
        {} as never,
        {} as RelationshipDiscoveryConfig,
        aiConfig({ provider: 'gemini' }),
        {} as never,
        []
      );
      const key = spy.mock.calls[0][1];
      expect(key).toBe('GeminiLLM');
      expect(key).not.toBe('gemini');
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects an unknown provider with the supported list instead of a ClassFactory miss', () => {
    expect(
      () =>
        new LLMDiscoveryValidator(
          {} as never,
          {} as RelationshipDiscoveryConfig,
          aiConfig({ provider: 'not-a-provider' as AIConfig['provider'] }),
          {} as never,
          []
        )
    ).toThrow(/Unknown provider/);
  });
});
