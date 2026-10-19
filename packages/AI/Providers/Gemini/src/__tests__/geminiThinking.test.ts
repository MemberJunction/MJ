import { describe, it, expect } from 'vitest';
import { ThinkingLevel } from '@google/genai';
import type { ThinkingConfig } from '@google/genai';
import { EffortToThinkingLevel, GeminiThinkingControlFor, GeminiThinkingFallback, ResolveGeminiThinkingConfig } from '../geminiThinking';

describe('EffortToThinkingLevel', () => {
  it.each([
    ['1', 'LOW'], ['33', 'LOW'], ['34', 'MEDIUM'], ['66', 'MEDIUM'], ['67', 'HIGH'], ['100', 'HIGH'],
    [' 50 ', 'MEDIUM'], ['0', 'LOW'], ['150', 'HIGH'], ['50.5', 'MEDIUM'],
  ])('numeric %s → %s (the bands MJ\'s other drivers use; never MINIMAL)', (effort, level) => {
    expect(EffortToThinkingLevel(effort)).toBe(level);
  });

  it.each([
    ['minimal', 'MINIMAL'], ['none', 'MINIMAL'], ['low', 'LOW'], ['Medium', 'MEDIUM'],
    ['HIGH', 'HIGH'], ['xhigh', 'HIGH'], ['max', 'HIGH'],
  ])('named %s → %s', (effort, level) => {
    expect(EffortToThinkingLevel(effort)).toBe(level);
  });

  it.each([undefined, null, '', '   ', 'turbo', '50%', 'NaN'])('%s → undefined', (effort) => {
    expect(EffortToThinkingLevel(effort)).toBeUndefined();
  });
});

describe('GeminiThinkingControlFor', () => {
  it.each([
    ['gemini-3.8-flash', 'level'],
    ['gemini-3-pro-preview', 'level'],
    ['gemini-flash-latest', 'level'],
    ['publishers/google/models/gemini-3.5-flash', 'level'],
    ['gemini-2.5-pro', 'budget'],
    ['gemini-2.5-flash-lite', 'budget'],
    ['gemini-2.0-flash', 'none'],
    ['gemini-1.5-pro', 'none'],
    // Gemma ids carry "-3" but are not Gemini models; a substring check misread them as Gemini 3.
    ['gemma-3-27b-it', 'none'],
    ['gemma-4-31b-it', 'none'],
  ])('%s → %s', (model, control) => {
    expect(GeminiThinkingControlFor(model)).toBe(control);
  });
});

describe('ResolveGeminiThinkingConfig', () => {
  it.each([undefined, null, '', '  '])('no effort (%s) sends nothing and reports nothing', (effort) => {
    expect(ResolveGeminiThinkingConfig('gemini-3.8-flash', effort)).toEqual({});
  });

  it('a level model gets thinkingLevel, with thought summaries', () => {
    expect(ResolveGeminiThinkingConfig('gemini-3.8-flash', '90')).toEqual({ Config: { thinkingLevel: 'HIGH', includeThoughts: true } });
  });

  it.each([['minimal', 512], ['1', 1024], ['50', 8192], ['90', 24576]])(
    'Gemini 2.5 at effort %s gets thinkingBudget %i', (effort, budget) => {
      expect(ResolveGeminiThinkingConfig('gemini-2.5-flash', effort)).toEqual({ Config: { thinkingBudget: budget, includeThoughts: true } });
    });

  it('a model that does not think reports why nothing is sent', () => {
    const resolution = ResolveGeminiThinkingConfig('gemini-2.0-flash', '90');
    expect(resolution.Config).toBeUndefined();
    expect(resolution.Ignored).toMatch(/does not take a thinking setting/);
  });

  it('an unrecognized effort reports why nothing is sent', () => {
    const resolution = ResolveGeminiThinkingConfig('gemini-3.8-flash', 'turbo');
    expect(resolution.Config).toBeUndefined();
    expect(resolution.Ignored).toMatch(/'turbo' is not a number from 1 to 100 or a level name/);
  });
});

describe('GeminiThinkingFallback', () => {
  it('a rejected MINIMAL falls back to LOW, keeping the rest of the setting', () => {
    expect(GeminiThinkingFallback({ thinkingLevel: ThinkingLevel.MINIMAL, includeThoughts: true })).toEqual({ thinkingLevel: ThinkingLevel.LOW, includeThoughts: true });
  });

  it.each<ThinkingConfig>([
    { thinkingLevel: ThinkingLevel.LOW }, { thinkingLevel: ThinkingLevel.MEDIUM }, { thinkingLevel: ThinkingLevel.HIGH }, { thinkingBudget: 1024 },
  ])('any other rejected setting %o falls back to none', (config) => {
    expect(GeminiThinkingFallback({ ...config, includeThoughts: true })).toBeUndefined();
  });
});
