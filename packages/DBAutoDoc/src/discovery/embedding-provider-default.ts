/**
 * Which embedding provider to use when the organic-key config does not name one.
 *
 * THE BUG THIS REPLACES. The default was the literal `'openai'`, while the default LLM provider is
 * `gemini` and `SemanticPhase` passes the LLM's API key straight to the embedding driver. So the
 * SHIPPED DEFAULT CONFIGURATION handed a Gemini key to `OpenAIEmbedding` — which fails with an
 * authentication error from a provider the operator never configured, on a pass they did not know
 * used embeddings at all.
 *
 * Defaulting to the embedding driver of the SAME vendor as the key is the only choice that can be
 * right without asking: it is the one provider the operator has definitely authenticated with.
 *
 * Providers with no MJ embedding driver get a named error rather than a silent substitution. That
 * is not a new failure — sending an Anthropic key to `OpenAIEmbedding` failed too, just opaquely,
 * a layer further down and blamed on the wrong service.
 */

import type { EmbeddingProviderName } from './EmbeddingProvider.js';

/**
 * LLM provider → the embedding provider whose driver takes the same credential.
 *
 * Only vendors that ship BOTH an LLM and a `BaseEmbeddings` driver appear here. `local` is
 * deliberately absent: it needs no key, so it is a deliberate choice an operator makes explicitly,
 * never something inferred from which LLM they happen to use.
 */
const LLM_PROVIDER_TO_EMBEDDING: Partial<Record<string, EmbeddingProviderName>> = {
    gemini: 'gemini',
    openai: 'openai',
    mistral: 'mistral',
    azure: 'azure',
    bedrock: 'bedrock',
};

/**
 * Resolves the embedding provider implied by the configured LLM provider.
 *
 * @throws when the LLM vendor ships no embedding driver — the operator must set
 *         `organicKeyDetection.embedding.provider` (and, for a different vendor, that vendor's key).
 */
export function defaultEmbeddingProviderFor(llmProvider: string): EmbeddingProviderName {
    const mapped = LLM_PROVIDER_TO_EMBEDDING[String(llmProvider ?? '').trim().toLowerCase()];
    if (mapped) {
        return mapped;
    }
    const supported = Object.keys(LLM_PROVIDER_TO_EMBEDDING).join(', ');
    throw new Error(
        `Organic-key detection needs an embedding provider, and '${llmProvider}' has no embedding driver. ` +
            `Set organicKeyDetection.embedding.provider explicitly — 'local' needs no API key, and ` +
            `${supported} reuse the key of the matching LLM vendor.`,
    );
}
