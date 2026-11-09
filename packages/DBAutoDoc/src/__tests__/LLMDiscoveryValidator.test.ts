import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RegisterClass, MJGlobal } from '@memberjunction/global';
import { BaseLLM, ChatParams, ChatResult, ClassifyResult, SummarizeResult, ModelUsage } from '@memberjunction/ai';
import { LLMDiscoveryValidator } from '../discovery/LLMDiscoveryValidator';
import { ColumnStatsCache } from '../discovery/ColumnStatsCache';
import { CreateLLMInstance } from '../utils/llm-factory';
import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver';
import type { AIConfig, RelationshipDiscoveryConfig } from '../types/config';

/**
 * The discovery validator used the raw provider name ('gemini') as the ClassFactory key. Nothing is
 * registered under it, so it got a bare BaseLLM and every ChatCompletion failed with
 * "this.nonStreamingChatCompletion is not a function". It must resolve the driver class like the rest
 * of DBAutoDoc ('gemini' → 'GeminiLLM').
 */

const CALLS: ChatParams[] = [];

/** Stand-in for the Gemini driver, registered under the same key the real one uses. */
@RegisterClass(BaseLLM, 'GeminiLLM')
class FakeGeminiLLM extends BaseLLM {
  protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
    CALLS.push(params);
    const result = new ChatResult(true, new Date(), new Date());
    result.data = {
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ validated: true, reasoning: 'looks right', recommendations: [] }) } }],
      usage: new ModelUsage(120, 30)
    };
    return result;
  }
  public async ClassifyText(): Promise<ClassifyResult> { throw new Error('not used'); }
  public async SummarizeText(): Promise<SummarizeResult> { throw new Error('not used'); }
  protected async createStreamingRequest(): Promise<never> { throw new Error('not used'); }
  protected processStreamingChunk(): { content: string } { throw new Error('not used'); }
  protected finalizeStreamingResponse(): ChatResult { throw new Error('not used'); }
}

const AI_CONFIG = { provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'test-key', temperature: 0.1, maxTokens: 1000 } as AIConfig;

function validator(): LLMDiscoveryValidator {
  return new LLMDiscoveryValidator(
    {} as BaseAutoDocDriver,
    {} as RelationshipDiscoveryConfig,
    AI_CONFIG,
    new ColumnStatsCache(),
    [{ name: 'dbo', tables: [], descriptionIterations: [] }]
  );
}

describe('LLMDiscoveryValidator model creation', () => {
  beforeEach(() => { CALLS.length = 0; });

  it('resolves the provider name to its registered driver and actually calls the model', async () => {
    expect(FakeGeminiLLM).toBeDefined(); // keep the registration import-live
    const result = await validator().ValidateTableRelationships('dbo', 'Orders', [], []);
    expect(CALLS).toHaveLength(1);
    expect(CALLS[0].model).toBe('gemini-3.8-flash');
    expect(result.validated).toBe(true);
    expect(result.InputTokens).toBe(120);
  });
});

describe('CreateLLMInstance', () => {
  it('maps a provider name to its driver class', () => {
    expect(CreateLLMInstance('gemini', 'k')).toBeInstanceOf(FakeGeminiLLM);
  });

  it('fails loudly when the ClassFactory falls back to a bare BaseLLM, instead of returning it', () => {
    // Simulate a provider whose driver isn't registered: the ClassFactory hands back the base class itself.
    // Stubbed rather than relying on a real unregistered provider, since which drivers load depends on the build.
    const bare = Object.create(BaseLLM.prototype) as BaseLLM;
    const spy = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValueOnce(bare);
    try {
      expect(() => CreateLLMInstance('mistral', 'k')).toThrow(/Failed to create LLM instance for provider: mistral/);
    } finally {
      spy.mockRestore();
    }
  });
});
