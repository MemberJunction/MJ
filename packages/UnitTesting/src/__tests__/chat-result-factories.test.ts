import { describe, it, expect } from 'vitest';
import { ChatParams, ChatResult, ModelUsage } from '@memberjunction/ai';
import {
  makeChatParams,
  makeDriverFailureChatResult,
  makeErrorInfo,
  makeFailedChatResult,
  makeModelUsage,
  makeSuccessChatResult,
} from '../ai/chat-result-factories';

describe('makeModelUsage', () => {
  it('returns a REAL ModelUsage instance with the standard defaults (10/5, cost 0.001)', () => {
    const usage = makeModelUsage();
    expect(usage).toBeInstanceOf(ModelUsage);
    expect(usage.promptTokens).toBe(10);
    expect(usage.completionTokens).toBe(5);
    expect(usage.cost).toBe(0.001);
    expect(usage.totalTokens).toBe(15); // real computed getter, not a hand-set property
  });

  it('honors overrides including the cache-token buckets', () => {
    const usage = makeModelUsage({ promptTokens: 100, completionTokens: 50, cacheReadTokens: 30, cacheWriteTokens: 7 });
    expect(usage.totalTokens).toBe(150);
    expect(usage.totalInputTokens).toBe(137); // promptTokens + cacheRead + cacheWrite
  });

  it('allows explicitly opting out of the default cost', () => {
    const usage = makeModelUsage({ cost: undefined });
    expect(usage.cost).toBeUndefined();
  });
});

describe('makeSuccessChatResult', () => {
  it('builds a REAL successful ChatResult with one assistant choice', () => {
    const result = makeSuccessChatResult('hello world');
    expect(result).toBeInstanceOf(ChatResult);
    expect(result.success).toBe(true);
    expect(result.statusText).toBe('success');
    expect(result.data.choices).toHaveLength(1);
    expect(result.data.choices[0].message.role).toBe('assistant');
    expect(result.data.choices[0].message.content).toBe('hello world');
    expect(result.data.choices[0].finish_reason).toBe('stop');
    expect(result.data.usage).toBeInstanceOf(ModelUsage);
  });

  it('threads usage, model, thinking, and finishReason overrides through', () => {
    const usage = makeModelUsage({ promptTokens: 3, completionTokens: 4 });
    const result = makeSuccessChatResult('x', { usage, model: 'claude-opus-4-5', thinking: 'chain of thought', finishReason: 'length' });
    expect(result.data.usage).toBe(usage);
    expect(result.data.model).toBe('claude-opus-4-5');
    expect(result.data.choices[0].message.thinking).toBe('chain of thought');
    expect(result.data.choices[0].finish_reason).toBe('length');
  });

  it('uses the supplied start/end times (timeElapsed comes from the real getter)', () => {
    const startTime = new Date(1000);
    const endTime = new Date(1500);
    const result = makeSuccessChatResult('x', { startTime, endTime });
    expect(result.timeElapsed).toBe(500);
  });
});

describe('makeFailedChatResult', () => {
  it('mirrors the BaseLLM error shape by default: empty choices, zero usage, statusText error', () => {
    const result = makeFailedChatResult();
    expect(result).toBeInstanceOf(ChatResult);
    expect(result.success).toBe(false);
    expect(result.statusText).toBe('error');
    expect(result.errorMessage).toBe('Test failure');
    expect(result.data.choices).toHaveLength(0);
    expect(result.data.usage?.totalTokens).toBe(0);
    expect(result.errorInfo).toBeUndefined(); // undiagnosed unless the test supplies one
  });

  it('omitData leaves data unassigned for drivers that return no data on failure', () => {
    const result = makeFailedChatResult({ errorMessage: 'provider exploded', omitData: true });
    expect(result.data).toBeUndefined();
    expect(result.errorMessage).toBe('provider exploded');
  });

  it('attaches errorInfo and exception only when supplied', () => {
    const boom = new Error('boom');
    const result = makeFailedChatResult({ errorMessage: 'boom', exception: boom, errorInfo: makeErrorInfo({ errorType: 'RateLimit' }) });
    expect(result.exception).toBe(boom);
    expect(result.errorInfo?.errorType).toBe('RateLimit');
  });
});

describe('makeDriverFailureChatResult', () => {
  it('classifies through the REAL ErrorAnalyzer: network error → NetworkError, failover-eligible', () => {
    const result = makeDriverFailureChatResult(new Error('connect ECONNREFUSED 10.0.0.5:443'));
    expect(result.success).toBe(false);
    expect(result.errorInfo?.errorType).toBe('NetworkError');
    expect(result.errorInfo?.canFailover).toBe(true);
  });

  it('classifies a rate-limit message as RateLimit', () => {
    const result = makeDriverFailureChatResult(new Error('Rate limit exceeded, too many requests'));
    expect(result.errorInfo?.errorType).toBe('RateLimit');
  });

  it('classifies a structural request error as Fatal/non-failover (InvalidRequest)', () => {
    const result = makeDriverFailureChatResult(new Error('Malformed JSON in request payload'));
    expect(result.errorInfo?.errorType).toBe('InvalidRequest');
    expect(result.errorInfo?.severity).toBe('Fatal');
    expect(result.errorInfo?.canFailover).toBe(false);
  });

  it('carries the original error as message and exception', () => {
    const boom = new Error('Service temporarily unavailable');
    const result = makeDriverFailureChatResult(boom);
    expect(result.errorMessage).toBe('Service temporarily unavailable');
    expect(result.exception).toBe(boom);
  });
});

describe('makeErrorInfo', () => {
  it('defaults to an Unknown/Retriable/failover-eligible error', () => {
    const info = makeErrorInfo();
    expect(info.errorType).toBe('Unknown');
    expect(info.severity).toBe('Retriable');
    expect(info.canFailover).toBe(true);
  });

  it('honors overrides', () => {
    const info = makeErrorInfo({ errorType: 'Authentication', severity: 'Fatal', canFailover: false, httpStatusCode: 401 });
    expect(info.errorType).toBe('Authentication');
    expect(info.severity).toBe('Fatal');
    expect(info.canFailover).toBe(false);
    expect(info.httpStatusCode).toBe(401);
  });
});

describe('makeChatParams', () => {
  it('returns a REAL ChatParams instance (class defaults intact) with a default model + user message', () => {
    const params = makeChatParams();
    expect(params).toBeInstanceOf(ChatParams);
    expect(params.model).toBe('test-model');
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe('user');
    expect(params.enableCaching).toBe(true); // real class-level default preserved
  });

  it('applies overrides on top of the defaults', () => {
    const params = makeChatParams({ model: 'gpt-5', temperature: 0.2, effortLevel: '3' });
    expect(params.model).toBe('gpt-5');
    expect(params.temperature).toBe(0.2);
    expect(params.effortLevel).toBe('3');
    expect(params.messages).toHaveLength(1); // untouched default
  });
});
