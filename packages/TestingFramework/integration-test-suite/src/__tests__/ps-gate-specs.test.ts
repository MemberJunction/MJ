import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PsGateSpecs } from '../checks/ps-gates/ps-gate-specs';

describe('PsGateSpecs.UserFacingStrings', () => {
  let dir = '';
  const write = (name: string, body: string): string => {
    const f = path.join(dir, name);
    writeFileSync(f, body);
    return f;
  };
  beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), 'ps-gate-specs-')); });
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  it('reads string and multi-line template literals from the whole file, skipping comments and regex literals', () => {
    const f = write('a.ts', [
      "// a comment that says changing plans improves renewals",
      "/* a block comment that also mentions customers */",
      "const strip = (s: string) => s.replace(/[\"'`]/g, '');",
      "const label = 'Associated with the outcome';",
      "const story = `The model weights",
      "  events attended highly for ${name} members`;",
      "const icon = 'fa-solid fa-bolt';",
    ].join('\n'));
    expect(PsGateSpecs.UserFacingStrings([f])).toEqual([
      'Associated with the outcome',
      'The model weights events attended highly for {…} members',
    ]);
  });

  it('splits inline HTML templates into text and attribute values, drops CSS, and never reads the phrase-list file', () => {
    const f = write('b.ts', [
      "const template = `<div class=\"ps-panel\" title=\"Weighted by the model\">",
      "  @if (rows.length === 0) {",
      "  <span>No predictions yet</span>",
      "  }</div>`;",
      "const styles = `:host { display: flex; flex-direction: column; }`;",
    ].join('\n'));
    const list = write('causal-copy.ts', "const p = 'increase renewals by changing plans';");
    expect(PsGateSpecs.UserFacingStrings([f, list])).toEqual(['No predictions yet', 'Weighted by the model']);
  });

  it('keeps a Markdown prompt whole and de-duplicates texts', () => {
    const md = write('prompt.md', '# Story\n\nDescribe drivers as associated with the outcome.');
    const ts = write('c.ts', "const a = 'Describe the drivers'; const b = 'Describe the drivers';");
    expect(PsGateSpecs.UserFacingStrings([md, ts])).toEqual(['# Story Describe drivers as associated with the outcome.', 'Describe the drivers']);
  });
});

describe('PsGateSpecs.Ref', () => {
  it('narrows catalog codes to dataset references and refuses anything else', () => {
    expect(PsGateSpecs.Ref('world', 'W1-signal', 42)).toEqual({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    expect(PsGateSpecs.Ref('scenario', 'T3-lag', 2203)).toEqual({ Kind: 'scenario', ID: 'T3-lag', Seed: 2203 });
    expect(() => PsGateSpecs.Ref('world', 'C2', 1)).toThrow(/not a dataset/);
  });
});
