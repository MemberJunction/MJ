/**
 * Output parsing + validation tests for the REAL AIPromptRunner type-coercion path.
 * Exercises parseStringOutput / parseNumberOutput / parseBooleanOutput / parseDateOutput /
 * parseObjectOutput (incl. CleanJSON, JSON5 repair, and validation-syntax cleaning) and
 * validateAgainstSchema against the real JSONValidator.
 *
 * These private methods don't touch AIEngine, so no engine mock is needed — only a real
 * AIPromptRunner instance reached via cast.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AIPromptRunner } from '../AIPromptRunner';
import type { ValidationErrorInfo } from '@memberjunction/global';

type ParseInternals = {
  parseStringOutput(s: string): string;
  parseNumberOutput(s: string, skip: boolean, errs: ValidationErrorInfo[]): number;
  parseBooleanOutput(s: string, skip: boolean, errs: ValidationErrorInfo[]): boolean;
  parseDateOutput(s: string, skip: boolean, errs: ValidationErrorInfo[]): Date;
  parseObjectOutput(s: string, prompt: unknown, skip: boolean, clean: boolean, errs: ValidationErrorInfo[], run: unknown, params?: unknown): Promise<unknown>;
  validateAgainstSchema(parsed: unknown, outputExample: string, promptId: string): Promise<ValidationErrorInfo[]>;
};
function priv(r: AIPromptRunner): ParseInternals { return r as unknown as ParseInternals; }

let runner: AIPromptRunner;
beforeEach(() => { runner = new AIPromptRunner(); });

describe('parseStringOutput', () => {
  it('returns the raw output unchanged', () => {
    expect(priv(runner).parseStringOutput('hello world')).toBe('hello world');
  });
});

describe('parseNumberOutput', () => {
  it('parses integers and floats', () => {
    expect(priv(runner).parseNumberOutput('42', false, [])).toBe(42);
    expect(priv(runner).parseNumberOutput('3.14', false, [])).toBeCloseTo(3.14);
  });
  it('throws + records an error on non-numeric input when validation is on', () => {
    const errs: ValidationErrorInfo[] = [];
    expect(() => priv(runner).parseNumberOutput('not a number', false, errs)).toThrow();
    expect(errs.length).toBe(1);
  });
  it('returns NaN (no throw) when skipValidation is true', () => {
    const errs: ValidationErrorInfo[] = [];
    expect(Number.isNaN(priv(runner).parseNumberOutput('xyz', true, errs))).toBe(true);
    expect(errs.length).toBe(0);
  });
});

describe('parseBooleanOutput', () => {
  it.each([['true', true], ['yes', true], ['1', true], ['false', false], ['no', false], ['0', false]] as const)(
    'maps "%s" -> %s', (input, expected) => {
      expect(priv(runner).parseBooleanOutput(input, false, [])).toBe(expected);
    });
  it('is case-insensitive and trims whitespace', () => {
    expect(priv(runner).parseBooleanOutput('  TRUE  ', false, [])).toBe(true);
    expect(priv(runner).parseBooleanOutput('No', false, [])).toBe(false);
  });
  it('throws on unrecognized input when validation is on', () => {
    const errs: ValidationErrorInfo[] = [];
    expect(() => priv(runner).parseBooleanOutput('maybe', false, errs)).toThrow();
    expect(errs.length).toBe(1);
  });
  it('returns false (no throw) when skipValidation is true', () => {
    expect(priv(runner).parseBooleanOutput('maybe', true, [])).toBe(false);
  });
});

describe('parseDateOutput', () => {
  it('parses a valid ISO date string', () => {
    const d = priv(runner).parseDateOutput('2026-06-13T00:00:00Z', false, []);
    expect(d.getUTCFullYear()).toBe(2026);
  });
  it('throws on an invalid date when validation is on', () => {
    const errs: ValidationErrorInfo[] = [];
    expect(() => priv(runner).parseDateOutput('not a date', false, errs)).toThrow();
    expect(errs.length).toBe(1);
  });
  it('returns an Invalid Date (no throw) when skipValidation is true', () => {
    expect(Number.isNaN(priv(runner).parseDateOutput('not a date', true, []).getTime())).toBe(true);
  });
});

describe('parseObjectOutput', () => {
  const prompt = (o: Record<string, unknown> = {}) => ({ OutputType: 'object', OutputExample: undefined, ...o });

  it('parses a plain JSON object', async () => {
    const res = await priv(runner).parseObjectOutput('{"a":1,"b":"x"}', prompt(), false, false, [], {});
    expect(res).toEqual({ a: 1, b: 'x' });
  });

  it('strips markdown code fences via CleanJSON before parsing', async () => {
    const fenced = '```json\n{"ok":true}\n```';
    const res = await priv(runner).parseObjectOutput(fenced, prompt(), false, false, [], {});
    expect(res).toEqual({ ok: true });
  });

  it('throws + records an error on invalid JSON when validation is on and repair is off', async () => {
    const errs: ValidationErrorInfo[] = [];
    await expect(priv(runner).parseObjectOutput('{broken', prompt(), false, false, errs, {})).rejects.toThrow();
    expect(errs.length).toBe(1);
  });

  it('returns the raw string (no throw) on invalid JSON when skipValidation is true', async () => {
    const res = await priv(runner).parseObjectOutput('{broken', prompt(), true, false, [], {});
    expect(res).toBe('{broken');
  });

  it('repairs malformed JSON via JSON5 when attemptJSONRepair is enabled', async () => {
    const run: Record<string, unknown> = {};
    // unquoted keys + single quotes + trailing comma => invalid JSON, valid JSON5
    const messy = "{ a: 1, b: 'two', }";
    const res = await priv(runner).parseObjectOutput(messy, prompt(), false, false, [], run, { attemptJSONRepair: true } as never);
    expect(res).toEqual({ a: 1, b: 'two' });
  });

  it('cleans validation-syntax suffixes from result keys when cleanValidationSyntax is true', async () => {
    const res = await priv(runner).parseObjectOutput(
      '{"name?":"John","age:number":42,"items:[2+]":[1,2]}', prompt(), true, true, [], {},
    ) as Record<string, unknown>;
    expect(Object.keys(res).sort()).toEqual(['age', 'items', 'name']);
    expect(res.name).toBe('John');
    expect(res.age).toBe(42);
  });
});

describe('validateAgainstSchema', () => {
  it('passes when the result matches the OutputExample shape', async () => {
    const example = JSON.stringify({ sentiment: 'positive', score: 0.9 });
    const errs = await priv(runner).validateAgainstSchema({ sentiment: 'negative', score: 0.1 }, example, 'p1');
    expect(errs).toEqual([]);
  });

  it('reports an error when a required field is missing', async () => {
    const example = JSON.stringify({ sentiment: 'positive', score: 0.9 });
    const errs = await priv(runner).validateAgainstSchema({ sentiment: 'negative' }, example, 'p1');
    expect(errs.length).toBeGreaterThan(0);
  });

  it('reports an error for a type mismatch (:number annotation)', async () => {
    const example = JSON.stringify({ 'score:number': 1 });
    const errs = await priv(runner).validateAgainstSchema({ score: 'not-a-number' }, example, 'p1');
    expect(errs.length).toBeGreaterThan(0);
  });

  it('returns a single error (does not throw) when the OutputExample itself is invalid JSON', async () => {
    const errs = await priv(runner).validateAgainstSchema({ a: 1 }, '{not valid', 'p1');
    expect(errs.length).toBe(1);
    expect(errs[0].Message).toMatch(/Invalid OutputExample JSON/);
  });
});
