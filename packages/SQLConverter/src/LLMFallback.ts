import type { ILLMFallback } from './types.js';

/**
 * Default no-op LLM fallback implementation.
 * Always returns null (no LLM available).
 * Replace with a real implementation to enable LLM-based SQL fix-up.
 */
export class NoOpLLMFallback implements ILLMFallback {
  async FixConversion(): Promise<{ sql: string | null; model?: string }> {
    return { sql: null };
  }
}
