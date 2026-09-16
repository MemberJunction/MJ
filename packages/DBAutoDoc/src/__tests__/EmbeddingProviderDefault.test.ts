import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEmbeddings } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';

import { defaultEmbeddingProviderFor } from '../discovery/embedding-provider-default.js';
import { resolveEmbeddingProvider } from '../discovery/SemanticPhase.js';
import type { AIConfig, OrganicKeyDetectionConfig } from '../types/config.js';

/**
 * With nothing configured, organic-key detection embedded through `OpenAIEmbedding` using the
 * GEMINI api key — because `SemanticPhase` defaulted to the literal `'openai'` while
 * `AIConfig.provider` defaults to `gemini` and the same key is handed to both. The operator sees
 * an authentication failure from a provider they never set up, on a pass they may not have known
 * used embeddings at all.
 *
 * The default now follows the credential that exists.
 */

describe('the default embedding provider follows the key that exists', () => {
  it('sends a Gemini key to the Gemini embedding driver — the shipped-default case', () => {
    expect(defaultEmbeddingProviderFor('gemini')).toBe('gemini');
  });

  it('maps every vendor that ships both an LLM and an embedding driver', () => {
    expect(defaultEmbeddingProviderFor('openai')).toBe('openai');
    expect(defaultEmbeddingProviderFor('mistral')).toBe('mistral');
    expect(defaultEmbeddingProviderFor('azure')).toBe('azure');
    expect(defaultEmbeddingProviderFor('bedrock')).toBe('bedrock');
  });

  it('is forgiving about case and whitespace in a hand-edited config', () => {
    expect(defaultEmbeddingProviderFor('  GEMINI ')).toBe('gemini');
  });

  it('never infers `local`, which is a deliberate choice rather than a fallback', () => {
    // `local` needs no key, so it would "work" for every vendor — and would silently swap a
    // hosted embedding model for a small on-disk one, changing cluster quality with no signal.
    for (const p of ['gemini', 'openai', 'mistral', 'azure', 'bedrock']) {
      expect(defaultEmbeddingProviderFor(p)).not.toBe('local');
    }
  });

  it('asks for an explicit choice when the LLM vendor has no embedding driver', () => {
    // Not a new failure: an Anthropic key sent to OpenAIEmbedding failed too — opaquely, a layer
    // down, and blamed on OpenAI. This names the decision the operator has to make.
    for (const p of ['anthropic', 'groq', 'openrouter', 'cerebras', 'xai', 'vertex']) {
      expect(() => defaultEmbeddingProviderFor(p)).toThrow(/embedding\.provider/);
    }
  });

  it('gives every provider the AI config accepts a defined outcome — its own vendor, or an error', () => {
    // The invariant that keeps this honest as providers are added: a vendor is either mapped to
    // ITS OWN embedding driver, or it refuses. What must never happen again is the third
    // possibility — quietly resolving to some other vendor's driver with this vendor's key.
    const all: AIConfig['provider'][] = [
      'gemini', 'openai', 'anthropic', 'groq', 'mistral', 'vertex',
      'azure', 'cerebras', 'openrouter', 'xai', 'bedrock',
    ];
    for (const p of all) {
      let resolved: string | null = null;
      try {
        resolved = defaultEmbeddingProviderFor(p);
      } catch {
        resolved = null;
      }
      if (resolved !== null) {
        expect(resolved).toBe(p); // never another vendor's driver
      } else {
        expect(() => defaultEmbeddingProviderFor(p)).toThrow(/embedding\.provider/);
      }
    }
  });
});

describe('the semantic phase actually uses that default', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Reports which driver class the ClassFactory was asked for, without building a real driver. */
  function driverClassFor(aiProvider: AIConfig['provider'], config: OrganicKeyDetectionConfig = {}): string {
    const spy = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockReturnValue({
      EmbedTexts: async () => ({ vectors: [] }),
    } as unknown as BaseEmbeddings);
    resolveEmbeddingProvider(config, { provider: aiProvider, model: 'm', apiKey: 'k' } as AIConfig);
    return String(spy.mock.calls[0][1]);
  }

  it('sends the Gemini key to GeminiEmbedding under the shipped defaults', () => {
    // THE BUG, end to end: nothing configured, provider defaults to gemini, and this used to
    // resolve OpenAIEmbedding and authenticate with a Gemini key.
    expect(driverClassFor('gemini')).toBe('GeminiEmbedding');
    expect(driverClassFor('gemini')).not.toBe('OpenAIEmbedding');
  });

  it('still honours an explicit choice over the inferred one', () => {
    // An operator who has set up a separate embedding vendor must keep getting it.
    expect(driverClassFor('gemini', { embedding: { provider: 'local' } })).toBe('LocalEmbedding');
  });

  it('refuses rather than guessing when the LLM vendor has no embedding driver', () => {
    expect(() => driverClassFor('anthropic')).toThrow(/embedding\.provider/);
  });
});
