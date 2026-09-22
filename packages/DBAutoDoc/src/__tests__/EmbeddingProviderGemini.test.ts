import { describe, it, expect, vi } from 'vitest';
import { BaseEmbeddings } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

import { createEmbeddingProvider } from '../discovery/EmbeddingProvider.js';

/**
 * `EmbeddingProvider`'s driver map had no `gemini` entry, so even an EXPLICIT
 * `embedding.provider: 'gemini'` threw "not supported" — while `gemini` is the default LLM
 * provider of this package and `GeminiEmbedding` has been registered all along.
 *
 * The other half of the same bug — what happens when nothing is configured — is in
 * `EmbeddingProviderDefault.test.ts`.
 */

/** Records what the ClassFactory was asked for, without instantiating a real driver. */
function spyOnClassFactory() {
  return vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue({
    EmbedTexts: async () => ({ vectors: [] }),
  } as unknown as BaseEmbeddings);
}

describe('gemini is a usable embedding provider', () => {
  it('resolves to the registered GeminiEmbedding driver class', () => {
    // 'GeminiEmbedding' is the @RegisterClass(BaseEmbeddings, ...) key in the Gemini provider
    // package. A raw 'gemini' here would be a ClassFactory miss, which is the same defect this
    // package already had in LLMDiscoveryValidator.
    const spy = spyOnClassFactory();
    try {
      createEmbeddingProvider({ provider: 'gemini', apiKey: 'k' });
      expect(spy.mock.calls[0][1]).toBe('GeminiEmbedding');
    } finally {
      spy.mockRestore();
    }
  });

  it('leaves the model to the driver rather than pinning a second copy of it', () => {
    // GeminiEmbedding defaults its own model, and that default moves with the model generation.
    // Naming it here too would be a second place to remember on every bump.
    const spy = spyOnClassFactory();
    try {
      const provider = createEmbeddingProvider({ provider: 'gemini', apiKey: 'k' });
      expect(provider.provider).toBe('gemini');
      expect((provider as unknown as { model: string }).model).toBe('');
    } finally {
      spy.mockRestore();
    }
  });

  it('still refuses a provider with no driver, naming what is supported', () => {
    expect(() =>
      createEmbeddingProvider({ provider: 'anthropic' as never, apiKey: 'k' })
    ).toThrow(/not supported/);
  });
});
