import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CausalCopy } from '@memberjunction/predictive-studio-core';
import { CausalCopyScan } from '../causal-copy';

describe('causal copy scan', () => {
  it('finds the shipped regression headline and ignores comments without quotes', () => {
    const src = "// this comment causes nothing\nreturn `Explains about ${pct}% of what drives the outcome.`;";
    const texts = CausalCopyScan.UserFacingText('trust.ts', src).map((t) => t.Text);
    expect(texts.some((t) => CausalCopyScan.Patterns.some((re) => re.test(t)))).toBe(true);
    expect(texts).not.toContain('this comment causes nothing');
  });
  it('accepts driver wording', () => {
    expect(CausalCopyScan.Patterns.some((re) => re.test('Top drivers of this prediction'))).toBe(false);
    expect(CausalCopyScan.Patterns.some((re) => re.test('Lowers Risk'))).toBe(false);
  });
});

describe('causal copy scan — one list (C4.5)', () => {
  it('uses exactly the Core list', () => {
    expect(CausalCopyScan.Patterns.map((re) => re.source)).toEqual(CausalCopy.Patterns.map((p) => p.Pattern.source));
  });
  it('skips the file that defines the list', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'causal-'));
    const list = path.join(dir, 'causal-copy.ts');
    writeFileSync(list, "export const L = ['what drives', 'lever'];\n");
    const ui = path.join(dir, 'panel.ts');
    writeFileSync(ui, "const t = 'Pull these levers';\n");
    expect(CausalCopyScan.Scan([list, ui])).toEqual([`${ui}:1: Pull these levers`]);
  });
});
