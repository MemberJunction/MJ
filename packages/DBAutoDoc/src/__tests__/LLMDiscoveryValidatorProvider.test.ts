import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The validator built its LLM by handing `aiConfig.provider` straight to
 * ClassFactory. That string is a PROVIDER NAME — `openrouter` — and the
 * registration is a DRIVER CLASS — `OpenRouterLLM`. They never matched, for any
 * provider.
 *
 * It did not throw. ClassFactory falls back to an instance of the BASE class
 * when nothing matches and the base carries no `@RequiresSubclass()`, so the
 * `if (!llm)` guard below it was dead and validation ran against an LLM that
 * cannot answer. Observed live:
 *
 *   ClassFactory: no registration found for base class 'BaseLLM' with key
 *   'openrouter'. ... Falling back to an instance of 'BaseLLM' itself.
 *
 * — immediately followed by the run starting relationship discovery anyway, on
 * the strength of "0 of 60 expected FKs found". A run with no working validator
 * reports the same trigger and spends the same budget.
 *
 * `llm-factory.ts` exists precisely to translate the one into the other, and
 * every other construction site in the package uses it.
 */

const SRC = path.resolve(import.meta.dirname, '../discovery/LLMDiscoveryValidator.ts');
const FACTORY = path.resolve(import.meta.dirname, '../utils/llm-factory.ts');

const source = (): string => readFileSync(SRC, 'utf8');

describe('the validator asks for a driver class, not a provider name', () => {
  it('builds its LLM through the provider factory', () => {
    expect(source()).toMatch(/createLLMInstance\(\s*aiConfig\.provider\s*,\s*aiConfig\.apiKey\s*\)/);
  });

  it('does not hand a provider name to ClassFactory', () => {
    // The specific defect: `CreateInstance(BaseLLM, aiConfig.provider, ...)`.
    // Matching on the call shape rather than on the absence of a word, so a
    // ClassFactory use for something unrelated would not fail this.
    expect(source()).not.toMatch(/CreateInstance<BaseLLM>\(\s*\n?\s*BaseLLM\s*,\s*\n?\s*aiConfig\.provider/);
  });

  it('the factory it now uses actually maps this provider', () => {
    // Guards the fix from the other side: routing through a factory that did
    // not know `openrouter` would trade a silent fallback for a hard throw.
    const factory = readFileSync(FACTORY, 'utf8');
    expect(factory).toMatch(/'openrouter'\s*:\s*'OpenRouterLLM'/);
  });

  it('keeps no dead guard behind the construction', () => {
    // `if (!llm) throw` never fired — ClassFactory returned a fallback instance,
    // not null. A guard that cannot fire reads as protection and is not.
    expect(source()).not.toMatch(/if \(!llm\)/);
  });
});
