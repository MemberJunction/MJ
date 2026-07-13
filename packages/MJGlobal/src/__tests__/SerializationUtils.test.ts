import { describe, it, expect } from 'vitest';
import { ToJSONSafe } from '../util/SerializationUtils';

describe('ToJSONSafe', () => {
  it('passes through a plain JSON-safe object unchanged', () => {
    const input = { model: 'gpt-5', usage: { prompt_tokens: 10, cached: 0 }, choices: [{ index: 0 }] };
    expect(ToJSONSafe(input)).toEqual(input);
  });

  it('replaces circular references with the [Circular] marker instead of throwing', () => {
    const a: Record<string, unknown> = { name: 'root' };
    a.self = a; // circular
    const result = ToJSONSafe(a) as Record<string, unknown>;
    expect(result.name).toBe('root');
    expect(result.self).toBe('[Circular]');
  });

  it('stringifies BigInt values (which JSON.stringify would otherwise throw on)', () => {
    const result = ToJSONSafe({ total: BigInt('9007199254740993') }) as Record<string, unknown>;
    expect(result.total).toBe('9007199254740993');
  });

  it('drops functions and undefined like JSON.stringify does', () => {
    const result = ToJSONSafe({ keep: 1, fn: () => 1, gone: undefined }) as Record<string, unknown>;
    expect(result).toEqual({ keep: 1 });
  });

  it('returns null for values that are not representable as JSON', () => {
    expect(ToJSONSafe(undefined)).toBeNull();
    expect(ToJSONSafe(() => 1)).toBeNull();
  });

  it('produces an object safe for a downstream JSON.stringify', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.loop = circular;
    const safe = ToJSONSafe({ provider: 'openai', raw: circular });
    expect(() => JSON.stringify(safe)).not.toThrow();
  });
});
