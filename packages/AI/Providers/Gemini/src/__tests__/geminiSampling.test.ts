import { describe, it, expect } from 'vitest';
import { ParseGeminiVersion, AcceptsCustomSampling } from '../geminiSampling';

describe('ParseGeminiVersion', () => {
  it.each([
    ['gemini-2.5-flash', { Major: 2, Minor: 5 }],
    ['gemini-3-pro-preview', { Major: 3, Minor: 0 }],
    ['gemini-3.10-flash', { Major: 3, Minor: 10 }],
    ['gemini-3.6', { Major: 3, Minor: 6 }],
    ['Gemini-3.6-Flash', { Major: 3, Minor: 6 }],
    ['gemini-2.5-flash-preview-09-2025', { Major: 2, Minor: 5 }],
    ['publishers/google/models/gemini-3.8-flash', { Major: 3, Minor: 8 }],
    ['google/gemini-3.5-flash', { Major: 3, Minor: 5 }],
    // a suffix right after the minor version must not drop the minor (would read as 3.0)
    ['gemini-3.6@001', { Major: 3, Minor: 6 }],
    ['gemini-3.5flash', { Major: 3, Minor: 5 }],
  ])('%s → %o', (id, expected) => {
    expect(ParseGeminiVersion(id)).toEqual(expected);
  });

  it.each(['gemini-flash-latest', 'gemini-exp-1206', 'gemini-pro', 'gemma-4-26b-a4b-it-maas', ''])(
    '%s has no version', (id) => {
      expect(ParseGeminiVersion(id)).toBeUndefined();
    });
});

describe('AcceptsCustomSampling', () => {
  it.each([
    ['gemini-2.5-pro', true],
    ['gemini-3.5-flash', true],
    ['gemini-3.6-flash', false],
    ['gemini-3.6@001', false],
    ['gemini-4-pro', false],
    ['gemini-flash-latest', false],
    ['gemma-4-26b-a4b-it-maas', true],
  ])('%s → %s', (id, expected) => {
    expect(AcceptsCustomSampling(id)).toBe(expected);
  });
});
