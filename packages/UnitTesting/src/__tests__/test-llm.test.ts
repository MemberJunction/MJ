import { describe, it, expect, beforeEach } from 'vitest';
import { BaseLLM, ChatResult, ModelUsage, type ChatParams } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { TestLLM, registerTestLLM, type TestLLMOutcome } from '../ai/test-llm';
import { makeChatParams, makeFailedChatResult, makeModelUsage } from '../ai/chat-result-factories';
import { resetMJSingletons } from '../singleton-reset';

let llm: TestLLM;
beforeEach(() => {
  llm = new TestLLM();
});

describe('TestLLM — contract', () => {
  it('is a REAL BaseLLM (inherits the production ChatCompletion routing, not a structural fake)', () => {
    expect(llm).toBeInstanceOf(BaseLLM);
  });

  it('reports the plainest driver capabilities by default (no streaming, no prefill, no files)', () => {
    expect(llm.SupportsStreaming).toBe(false);
    expect(llm.SupportsPrefill).toBe(false);
    expect(llm.GetFileCapabilities()).toBeNull();
  });

  it('capability knobs are configurable and Reset() restores them', () => {
    llm.SetSupportsStreaming(true).SetSupportsPrefill(true).SetFileCapabilities({
      SupportedMimeTypes: ['application/pdf'],
      MaxFileSize: 1024,
      MaxFilesPerRequest: 2,
      HasFileAPI: false,
    });
    expect(llm.SupportsStreaming).toBe(true);
    expect(llm.SupportsPrefill).toBe(true);
    expect(llm.GetFileCapabilities()?.MaxFilesPerRequest).toBe(2);

    llm.Reset();
    expect(llm.SupportsStreaming).toBe(false);
    expect(llm.SupportsPrefill).toBe(false);
    expect(llm.GetFileCapabilities()).toBeNull();
  });

  it('ClassifyText and SummarizeText are unsupported (chat-scripting harness only)', async () => {
    await expect(llm.ClassifyText(makeChatParams())).rejects.toThrow(/not supported/);
    await expect(llm.SummarizeText(makeChatParams())).rejects.toThrow(/not supported/);
  });
});

describe('TestLLM — scripted outcomes', () => {
  it('succeed: resolves a real successful ChatResult with the scripted content', async () => {
    llm.Script({ kind: 'succeed', content: 'the answer' });
    const result = await llm.ChatCompletion(makeChatParams());
    expect(result).toBeInstanceOf(ChatResult);
    expect(result.success).toBe(true);
    expect(result.data.choices[0].message.content).toBe('the answer');
    expect(result.data.usage).toBeInstanceOf(ModelUsage);
    expect(result.data.usage?.totalTokens).toBe(15); // default 10 + 5
  });

  it('succeed: honors a scripted usage and reported model', async () => {
    llm.Script({ kind: 'succeed', content: 'x', usage: makeModelUsage({ promptTokens: 7, completionTokens: 3 }), model: 'api-name' });
    const result = await llm.ChatCompletion(makeChatParams());
    expect(result.data.usage?.totalTokens).toBe(10);
    expect(result.data.model).toBe('api-name');
  });

  it('consumes outcomes in order, then falls back to the default outcome', async () => {
    llm.Script(
      { kind: 'succeed', content: 'first' },
      { kind: 'succeed', content: 'second' },
    );
    expect((await llm.ChatCompletion(makeChatParams())).data.choices[0].message.content).toBe('first');
    expect((await llm.ChatCompletion(makeChatParams())).data.choices[0].message.content).toBe('second');
    expect((await llm.ChatCompletion(makeChatParams())).data.choices[0].message.content).toBe('test response'); // default
  });

  it('SetDefaultOutcome controls the exhausted-script behavior', async () => {
    llm.SetDefaultOutcome({ kind: 'succeed', content: '{}' });
    expect((await llm.ChatCompletion(makeChatParams())).data.choices[0].message.content).toBe('{}');
  });

  it('RepeatLastOutcome keeps replaying the final scripted entry', async () => {
    llm.RepeatLastOutcome = true;
    llm.Script({ kind: 'succeed', content: 'a' }, { kind: 'succeed', content: 'b' });
    expect((await llm.ChatCompletion(makeChatParams())).data.choices[0].message.content).toBe('a');
    expect((await llm.ChatCompletion(makeChatParams())).data.choices[0].message.content).toBe('b');
    expect((await llm.ChatCompletion(makeChatParams())).data.choices[0].message.content).toBe('b');
    expect((await llm.ChatCompletion(makeChatParams())).data.choices[0].message.content).toBe('b');
  });

  it('fail: RETURNS ChatResult{success:false} with real ErrorAnalyzer errorInfo (the historical failover bug class)', async () => {
    llm.Script({ kind: 'fail', error: new Error('Rate limit exceeded, too many requests') });
    const result = await llm.ChatCompletion(makeChatParams());
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Rate limit exceeded');
    expect(result.errorInfo?.errorType).toBe('RateLimit');
    expect(result.errorInfo?.canFailover).toBe(true);
  });

  it('failResult: returns the test-supplied result verbatim (errorInfo intentionally absent)', async () => {
    const custom = makeFailedChatResult({ errorMessage: 'provider exploded', omitData: true });
    llm.Script({ kind: 'failResult', result: custom });
    const result = await llm.ChatCompletion(makeChatParams());
    expect(result).toBe(custom);
    expect(result.errorInfo).toBeUndefined();
  });

  it('throw: rejects SDK-style with the scripted error, and the call is still recorded', async () => {
    const boom = new Error('socket hang up');
    llm.Script({ kind: 'throw', error: boom });
    await expect(llm.ChatCompletion(makeChatParams())).rejects.toBe(boom);
    expect(llm.CallCount).toBe(1);
  });

  it('hang: never settles (a hung provider socket)', async () => {
    llm.Script({ kind: 'hang' });
    const hung = llm.ChatCompletion(makeChatParams());
    const winner = await Promise.race([
      hung.then(() => 'settled'),
      new Promise<string>((resolve) => setTimeout(() => resolve('still pending'), 50)),
    ]);
    expect(winner).toBe('still pending');
  });

  it('delayMS: resolves only after the scripted delay', async () => {
    llm.Script({ kind: 'succeed', content: 'slow', delayMS: 40 });
    const start = Date.now();
    const result = await llm.ChatCompletion(makeChatParams());
    expect(Date.now() - start).toBeGreaterThanOrEqual(35);
    expect(result.data.choices[0].message.content).toBe('slow');
  });
});

describe('TestLLM — call recording', () => {
  it('captures the REAL ChatParams of every call, in order', async () => {
    llm.Script({ kind: 'succeed', content: 'a' }, { kind: 'succeed', content: 'b' });
    const p1 = makeChatParams({ model: 'api-claude' });
    const p2 = makeChatParams({ model: 'api-gpt' });
    await llm.ChatCompletion(p1);
    await llm.ChatCompletion(p2);
    expect(llm.CallCount).toBe(2);
    expect(llm.Calls[0]).toBe(p1);
    expect(llm.Calls[1]).toBe(p2);
    expect(llm.CalledModels).toEqual(['api-claude', 'api-gpt']);
  });

  it('records params handed to the driver including cancellationToken', async () => {
    const controller = new AbortController();
    await llm.ChatCompletion(makeChatParams({ cancellationToken: controller.signal }));
    expect(llm.Calls[0].cancellationToken).toBe(controller.signal);
  });

  it('Reset() clears the recording and the script', async () => {
    llm.Script({ kind: 'succeed', content: 'a' }, { kind: 'succeed', content: 'b' });
    await llm.ChatCompletion(makeChatParams());
    expect(llm.PendingOutcomeCount).toBe(1);
    llm.Reset();
    expect(llm.CallCount).toBe(0);
    expect(llm.PendingOutcomeCount).toBe(0);
  });
});

describe('TestLLM — streaming through the real BaseLLM template method', () => {
  it('streams scripted chunks via OnContent and finalizes an accumulated real ChatResult', async () => {
    llm.SetSupportsStreaming(true);
    llm.Script({ kind: 'stream', chunks: ['Hello', ' ', 'world'], usage: makeModelUsage({ promptTokens: 2, completionTokens: 3 }) });

    const received: Array<{ chunk: string; isComplete: boolean }> = [];
    let finalFromCallback: ChatResult | undefined;
    const params = makeChatParams({
      streaming: true,
      streamingCallbacks: {
        OnContent: (chunk, isComplete) => received.push({ chunk, isComplete }),
        OnComplete: (finalResponse) => { finalFromCallback = finalResponse; },
      },
    });

    const result = await llm.ChatCompletion(params);
    expect(result.success).toBe(true);
    expect(result.data.choices[0].message.content).toBe('Hello world');
    expect(result.data.usage?.totalTokens).toBe(5);
    expect(finalFromCallback).toBe(result);
    // three content chunks plus the final isComplete signal from the real template method
    expect(received.filter((r) => !r.isComplete).map((r) => r.chunk)).toEqual(['Hello', ' ', 'world']);
    expect(received[received.length - 1]).toEqual({ chunk: '', isComplete: true });
  });

  it('falls back to non-streaming when the driver does not support streaming', async () => {
    llm.Script({ kind: 'stream', chunks: ['a', 'b'] }); // SupportsStreaming still false
    const params = makeChatParams({ streaming: true, streamingCallbacks: { OnContent: () => undefined } });
    const result = await llm.ChatCompletion(params);
    expect(result.success).toBe(true);
    expect(result.data.choices[0].message.content).toBe('ab'); // joined, non-streaming path
  });

  it('a thrown scripted error surfaces as a rejected failed ChatResult from the streaming path', async () => {
    llm.SetSupportsStreaming(true);
    llm.Script({ kind: 'throw', error: new Error('stream exploded') });
    const params = makeChatParams({ streaming: true, streamingCallbacks: { OnContent: () => undefined } });
    await expect(llm.ChatCompletion(params)).rejects.toMatchObject({ success: false, errorMessage: 'stream exploded' });
  });
});

describe('TestLLM — ChatCompletions (parallel, inherited from the real BaseLLM)', () => {
  it('runs the real parallel implementation over scripted outcomes, converting rejections to failed results', async () => {
    llm.Script(
      { kind: 'succeed', content: 'one' },
      { kind: 'throw', error: new Error('connect ECONNREFUSED 10.0.0.5:443') },
    );
    const results = await llm.ChatCompletions([makeChatParams({ model: 'm1' }), makeChatParams({ model: 'm2' })]);
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].errorInfo?.errorType).toBe('NetworkError'); // real BaseLLM + real ErrorAnalyzer
    expect(llm.CalledModels).toEqual(['m1', 'm2']);
  });
});

describe('registerTestLLM — real ClassFactory resolution', () => {
  beforeEach(() => {
    // The ClassFactory has no unregister API; recreate the MJGlobal singleton so
    // each test registers into a fresh factory (no duplicate-registration noise).
    resetMJSingletons();
  });

  it('CreateInstance(BaseLLM, driverClass, apiKey) yields the SAME scripted instance', () => {
    registerTestLLM(llm, 'AnthropicLLM');
    const created = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, 'AnthropicLLM', 'sk-test');
    expect(created).toBe(llm);
  });

  it('one instance can stand in for multiple driver classes', async () => {
    registerTestLLM(llm, ['AnthropicLLM', 'OpenAILLM']);
    const a = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, 'AnthropicLLM', 'sk-test');
    const b = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, 'OpenAILLM', 'sk-test');
    expect(a).toBe(llm);
    expect(b).toBe(llm);

    llm.Script({ kind: 'succeed', content: 'from claude' }, { kind: 'succeed', content: 'from gpt' });
    await a?.ChatCompletion(makeChatParams({ model: 'api-claude' }));
    await b?.ChatCompletion(makeChatParams({ model: 'api-gpt' }));
    expect(llm.CalledModels).toEqual(['api-claude', 'api-gpt']); // single recorder across drivers
  });

  it('scripting applies to factory-created references (they ARE the scripted instance)', async () => {
    registerTestLLM(llm, 'GroqLLM');
    llm.Script({ kind: 'fail', error: new Error('Service temporarily unavailable') });
    const created = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, 'GroqLLM', 'sk-test');
    const result = await created?.ChatCompletion(makeChatParams());
    expect(result?.success).toBe(false);
    expect(result?.errorInfo?.errorType).toBe('ServiceUnavailable');
  });
});

describe('TestLLMOutcome — type is expressive enough for the drift-prone scenarios', () => {
  it('accepts every outcome kind used by the AI-stack suites', () => {
    const outcomes: TestLLMOutcome[] = [
      { kind: 'succeed', content: 'ok', usage: makeModelUsage(), model: 'api', thinking: 't', delayMS: 1 },
      { kind: 'fail', error: new Error('x') },
      { kind: 'failResult', result: makeFailedChatResult() },
      { kind: 'throw', error: new Error('y') },
      { kind: 'hang' },
      { kind: 'stream', chunks: ['a'], usage: makeModelUsage() },
    ];
    expect(outcomes).toHaveLength(6);
  });
});

describe('TestLLM — ChatParams typing sanity', () => {
  it('recorded calls are usable as real ChatParams without casts', async () => {
    await llm.ChatCompletion(makeChatParams({ model: 'm', temperature: 0.5 }));
    const call: ChatParams = llm.Calls[0];
    expect(call.temperature).toBe(0.5);
    expect(call.enableCaching).toBe(true); // defaulted by the REAL BaseLLM.ChatCompletion
  });
});
