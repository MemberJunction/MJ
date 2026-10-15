import { describe, it, expect } from 'vitest';
import { ErrorAnalyzer } from '@memberjunction/ai';
import { AIPromptRunner } from '../AIPromptRunner';

function asModelError(caught: object): Error {
  return (new AIPromptRunner() as unknown as { asModelError(caught: object): Error }).asModelError(caught);
}

describe("a rejected result that carries a message but no errorInfo", () => {
  // An out-of-tree driver may reject with { success: false, errorMessage } and no errorInfo. Analyzed as
  // the raw object it has no `message`, so it read as Unknown/Transient; its message says what it was.
  it.each([
    ["Rate limit exceeded, please retry later", "RateLimit"],
    ["Invalid API key provided", "Authentication"],
    ["context_length_exceeded: maximum context length is 128k", "ContextLengthExceeded"],
  ])("%s keeps its classification (%s)", (errorMessage, errorType) => {
    const error = asModelError({ success: false, errorMessage });
    expect(error.message).toBe(errorMessage);
    expect(ErrorAnalyzer.analyzeError(error).errorType).toBe(errorType);
  });
});

