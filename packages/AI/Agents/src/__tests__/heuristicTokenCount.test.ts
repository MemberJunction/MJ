import { describe, expect, it } from 'vitest';
import { BaseAgent } from '../base-agent';

class TestableAgent extends BaseAgent {
  public testHeuristicTokenCount(text: string): number {
    return (this as unknown as { heuristicTokenCount: (t: string) => number }).heuristicTokenCount(text);
  }
}

describe('BaseAgent.heuristicTokenCount — zero-allocation token counting', () => {
  const agent = new TestableAgent();

  function referenceRegexTokenCount(text: string): number {
    const charCount = text.length;
    const structuralChars = (text.match(/[\{\}\[\],:]/g) || []).length;
    const whitespaceChars = (text.match(/\s/g) || []).length;
    const effectiveChars = charCount - whitespaceChars * 0.5;
    const baseTokens = effectiveChars / 4;
    const structuralTokens = structuralChars * 0.05;
    return Math.ceil(baseTokens + structuralTokens);
  }

  it('returns 0 for empty string', () => {
    expect(agent.testHeuristicTokenCount('')).toBe(0);
    expect(agent.testHeuristicTokenCount('')).toBe(referenceRegexTokenCount(''));
  });

  it('matches reference regex formula for pure text', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    expect(agent.testHeuristicTokenCount(text)).toBe(referenceRegexTokenCount(text));
  });

  it('matches reference regex formula for structural JSON characters', () => {
    const json = JSON.stringify({
      name: 'MemberJunction',
      version: 6.3,
      features: ['workers', 'scheduler', 'streaming'],
      nested: { a: 1, b: 2, c: [3, 4, 5] },
    });
    expect(agent.testHeuristicTokenCount(json)).toBe(referenceRegexTokenCount(json));
  });

  it('handles multiline text with tabs, newlines, and carriage returns', () => {
    const text = "Line 1\r\n\tLine 2: [a, b, c]\r\n\t{\r\n\t\t'key': 'val'\r\n\t}";
    expect(agent.testHeuristicTokenCount(text)).toBe(referenceRegexTokenCount(text));
  });

  it('handles non-ASCII unicode whitespace (e.g. non-breaking space)', () => {
    const text = 'Hello\u00A0World: [1, 2]';
    expect(agent.testHeuristicTokenCount(text)).toBe(referenceRegexTokenCount(text));
  });

  it('handles large structural outputs correctly without allocating match arrays', () => {
    const largeJson = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ id: i, name: `item-${i}` })));
    expect(agent.testHeuristicTokenCount(largeJson)).toBe(referenceRegexTokenCount(largeJson));
  });
});
