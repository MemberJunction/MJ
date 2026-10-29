import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { GenLib } from '../gen_lib';

// loom.ts loads the pinned Loom checkout at import time; the CSV and AUC helpers under test never touch it
// (vi.mock is hoisted above the imports).
vi.mock('../loom', () => ({ Loom: {} }));

const tempFile = (name: string): string => path.join(mkdtempSync(path.join(tmpdir(), 'gen-lib-')), name);

describe('GenLib.WriteCsv', () => {
  it('writes the first row\'s columns, empties null and absent cells, and ends with a newline', () => {
    const file = tempFile('a.csv');
    GenLib.WriteCsv(file, [{ A: 1, B: null, C: true }, { A: 2.5, C: false }]);
    expect(readFileSync(file, 'utf8')).toBe('A,B,C\n1,,true\n2.5,,false\n');
  });

  it('refuses cells holding a comma, quote or line break (the truth-suite CSV is unquoted)', () => {
    for (const v of ['a,b', 'say "hi"', 'two\nlines', 'cr\rhere']) {
      expect(() => GenLib.WriteCsv(tempFile('b.csv'), [{ V: v }])).toThrow(/unquoted/);
    }
  });

  it('honours an explicit column order and omits the trailing newline on request', () => {
    const file = tempFile('c.csv');
    GenLib.WriteCsv(file, [{ A: 1, B: 2 }], { Columns: ['B', 'A'], TrailingNewline: false });
    expect(readFileSync(file, 'utf8')).toBe('B,A\n2,1');
  });
});

describe('GenLib.AucWithTies', () => {
  it('scores separation, shares tied ranks and is null when a side is empty', () => {
    expect(GenLib.AucWithTies([0.9, 0.8], [0.1, 0.2])).toBe(1);
    expect(GenLib.AucWithTies([0.5], [0.5])).toBe(0.5);
    expect(GenLib.AucWithTies([], [0.1])).toBeNull();
  });
});

describe('GenLib.Round', () => {
  it('rounds to the given decimal places (6 by default)', () => {
    expect(GenLib.Round(1.23456789)).toBe(1.234568);
    expect(GenLib.Round(1.23456789, 2)).toBe(1.23);
  });
});
