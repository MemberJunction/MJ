import { describe, it, expect } from 'vitest';
import { ParseSimpleAggregateExpression } from '../lib/aggregate-setup-dialog/aggregate-expression';

/** Every string of length 0..maxLength over `alphabet`. */
function allStrings(alphabet: string[], maxLength: number): string[] {
  let level = [''];
  const all = [''];
  for (let len = 1; len <= maxLength; len++) {
    level = level.flatMap((prefix) => alphabet.map((token) => prefix + token));
    all.push(...level);
  }
  return all;
}

/** The pre-change parser, kept as the oracle. */
function oldParse(expression: string): { Func: string; Column: string } | null {
  const match = expression.trim().match(/^(SUM|AVG|COUNT|MIN|MAX|COUNT_DISTINCT)\s*\(\s*(\*|\[?([\w\s]+)\]?)\s*\)$/i);
  if (!match) return null;
  return { Func: match[1].toUpperCase(), Column: match[2] === '*' ? '' : (match[3] || match[2]).trim() };
}

describe('ParseSimpleAggregateExpression', () => {
  it.each([
    ['SUM(Amount)', { Func: 'SUM', Column: 'Amount' }],
    ['count_distinct( [Customer ID] )', { Func: 'COUNT_DISTINCT', Column: 'Customer ID' }],
    ['COUNT(*)', { Func: 'COUNT', Column: '' }],
    ['SUM(Amount) + 1', null],
    ['SUM()', null],
    ['MEDIAN(x)', null],
  ])('parses %j', (expression, expected) => {
    expect(ParseSimpleAggregateExpression(expression)).toEqual(expected);
  });

  it('parses exactly what the regex it replaces parsed', () => {
    for (const prefix of ['SUM', 'count_distinct ', 'MAX', 'x']) {
      for (const rest of allStrings(['(', ')', '[', ']', ' ', 'a', '*'], 6)) {
        const expression = prefix + rest;
        expect(ParseSimpleAggregateExpression(expression)).toEqual(oldParse(expression));
      }
    }
  });

  it('rejects a long crafted argument in linear time', () => {
    const started = performance.now();
    expect(ParseSimpleAggregateExpression('SUM(' + ' a'.repeat(50_000) + '!)')).toBeNull();
    expect(performance.now() - started).toBeLessThan(2500);
  });
});
