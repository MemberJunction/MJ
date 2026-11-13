import { describe, it, expect } from 'vitest';
import { UsageCounter } from '../generator/UsageCounter';

describe('UsageCounter', () => {
  const counter = () => {
    const c = new UsageCounter(); const m1 = { input_tokens: 2, output_tokens: 3, cache_read_input_tokens: 4574, cache_creation_input_tokens: 4221 };
    c.Add('m1', m1); c.Add('m1', m1); c.Add('m1', m1); c.Add('m2', { input_tokens: 2, output_tokens: 2, cache_read_input_tokens: 8795, cache_creation_input_tokens: 0 });
    return c;
  };
  it('counts each message id once and puts cache tokens on the input side', () => {
    const c = counter();
    expect(c.Turns).toBe(2); expect(c.InputTokens).toBe(4225); expect(c.CacheReadTokens).toBe(13369); expect(c.OutputTokens).toBe(5); expect(c.BudgetTokens).toBe(17599);
  });
  it('estimates the cost of a session from the host count', () => {
    expect(counter().EstimateCostUSD({ Input: 4, Output: 20, CachedInput: 0.2 })).toBeCloseTo(0.0196738, 7);
    expect(counter().EstimateCostUSD(null)).toBe(0);
  });
  it('keeps the largest output count a message id reports, and still counts the id once', () => {
    const c = new UsageCounter();
    c.Add('m1', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 });
    c.Add('m1', { input_tokens: 10, output_tokens: 420, cache_read_input_tokens: 100 });
    c.Add('m1', { input_tokens: 10, output_tokens: 400, cache_read_input_tokens: 100 });
    expect(c.OutputTokens).toBe(420); expect(c.InputTokens).toBe(10); expect(c.CacheReadTokens).toBe(100); expect(c.Turns).toBe(1);
  });
});
