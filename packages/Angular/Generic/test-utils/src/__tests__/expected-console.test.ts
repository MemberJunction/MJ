import { describe, it, expect } from 'vitest';
import { ExpectConsoleLines, FormatConsoleArgs, UnexpectedConsoleLines } from '../lib/expected-console.js';

describe('ExpectConsoleLines', () => {
  const captured = ExpectConsoleLines({ error: [/^Save failed: simulated$/], log: [/^loaded \{"rows":2\}$/] });

  it('captures a declared line instead of printing it, and hands it to the test', () => {
    console.error('Save failed:', 'simulated');
    console.log('loaded', { rows: 2 });
    expect(captured.Lines('error')).toEqual(['Save failed: simulated']);
    expect(captured.Lines()).toHaveLength(2);
  });
});

describe('UnexpectedConsoleLines', () => {
  it('returns each line no pattern of its own method matches', () => {
    const lines = [{ Method: 'error' as const, Line: 'Save failed: simulated' }, { Method: 'warn' as const, Line: 'Save failed: simulated' }];
    expect(UnexpectedConsoleLines(lines, { error: [/^Save failed/] })).toEqual([{ Method: 'warn', Line: 'Save failed: simulated' }]);
  });
});

describe('FormatConsoleArgs', () => {
  it('joins strings, writes an Error by its stack and an object as JSON', () => {
    const err = new TypeError('x is not a function');
    expect(FormatConsoleArgs(['Failed:', err]).startsWith('Failed: TypeError: x is not a function')).toBe(true);
    expect(FormatConsoleArgs(['n', { a: 1 }])).toBe('n {"a":1}');
  });
});
