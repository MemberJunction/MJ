import { describe, it, expect } from 'vitest';
import { UnwrapPhraseQuotes } from '../util';

describe('UnwrapPhraseQuotes', () => {
  it('removes one pair of straight or curly double quotes wrapping the term, and trims', () => {
    expect(UnwrapPhraseQuotes('"Executive Steering Review"')).toBe('Executive Steering Review');
    expect(UnwrapPhraseQuotes('  “Executive Steering Review”  ')).toBe('Executive Steering Review');
    expect(UnwrapPhraseQuotes('" SOW "')).toBe('SOW');
    expect(UnwrapPhraseQuotes('”mismatched“')).toBe('mismatched');
    expect(UnwrapPhraseQuotes('"two\nlines"')).toBe('two\nlines');
  });

  it('keeps a quote inside the term and removes only the outer pair', () => {
    expect(UnwrapPhraseQuotes('6" pipe')).toBe('6" pipe');
    expect(UnwrapPhraseQuotes('the "SOW" task')).toBe('the "SOW" task');
    expect(UnwrapPhraseQuotes('"12" x 6""')).toBe('12" x 6"');
  });

  it('returns the term unchanged when nothing but whitespace is inside, or it is not wrapped', () => {
    expect(UnwrapPhraseQuotes('""')).toBe('""');
    expect(UnwrapPhraseQuotes('" "')).toBe('" "');
    expect(UnwrapPhraseQuotes('"')).toBe('"');
    expect(UnwrapPhraseQuotes('')).toBe('');
    expect(UnwrapPhraseQuotes("'single'")).toBe("'single'");
    expect(UnwrapPhraseQuotes('plain words')).toBe('plain words');
  });
});
