import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEmbeddings, EmbedTextsParams } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

import { CreateEmbeddingProvider } from '../discovery/EmbeddingProvider.js';
import { ResolveEmbeddingProvider } from '../discovery/SemanticPhase.js';
import type { AIConfig } from '../types/config.js';

/**
 * Embedding batches get the same wall-clock ceiling as the LLM calls. They run after every
 * normalization call has been paid for, so a stalled batch parked the organic-key pass with the
 * money already spent.
 */

/** A driver whose EmbedTexts never settles, recording the params it was given. */
function stallingDriver(): { seen: EmbedTextsParams[] } {
  const seen: EmbedTextsParams[] = [];
  vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue({
    EmbedTexts: (params: EmbedTextsParams) => {
      seen.push(params);
      return new Promise(() => {});
    },
  } as unknown as BaseEmbeddings);
  return { seen };
}

/** A driver that answers at once with one vector per text. */
function answeringDriver(): { seen: EmbedTextsParams[] } {
  const seen: EmbedTextsParams[] = [];
  vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue({
    EmbedTexts: async (params: EmbedTextsParams) => {
      seen.push(params);
      return { vectors: params.texts.map(() => [1, 0]) };
    },
  } as unknown as BaseEmbeddings);
  return { seen };
}

describe('embedding batches are bounded', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a stalled batch with a call timeout, and aborts the request it gave the driver', async () => {
    const { seen } = stallingDriver();
    const provider = CreateEmbeddingProvider({ provider: 'openai', apiKey: 'k', CallTimeoutMs: 30 });

    await expect(provider.Embed(['a', 'b'])).rejects.toThrow(/call timeout/);
    expect(seen[0].CancellationToken?.aborted).toBe(true);
  });

  it('applies the default ceiling when none is configured', async () => {
    const { seen } = answeringDriver();
    await CreateEmbeddingProvider({ provider: 'openai', apiKey: 'k' }).Embed(['a']);

    expect(seen[0].CancellationToken).toBeInstanceOf(AbortSignal);
  });

  it('passes no signal at all when the bound is disabled, as before', async () => {
    const { seen } = answeringDriver();
    await CreateEmbeddingProvider({ provider: 'openai', apiKey: 'k', CallTimeoutMs: 0 }).Embed(['a']);

    expect('CancellationToken' in seen[0]).toBe(false);
  });

  it('takes its ceiling from ai.callTimeoutMs in the semantic phase', async () => {
    stallingDriver();
    const handle = ResolveEmbeddingProvider({ enabled: true }, { provider: 'openai', model: 'm', apiKey: 'k', callTimeoutMs: 30 } as AIConfig);

    await expect(handle.embed(['a'])).rejects.toThrow(/call timeout/);
  });
});
