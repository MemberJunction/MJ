import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PsGateSpecs } from '../checks/ps-gates/ps-gate-specs';

describe('PsGateSpecs.UserFacingTexts', () => {
  let dir = '';
  const write = (name: string, body: string): string => {
    const f = path.join(dir, name);
    writeFileSync(f, body);
    return f;
  };
  const texts = (files: string[]): string[] => PsGateSpecs.UserFacingTexts(files).flatMap((g) => g.Texts);
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
    expect(texts([f])).toEqual(['Associated with the outcome', 'The model weights events attended highly for {…} members']);
  });

  it('drops thrown errors, console and log text, type unions, tool descriptions and Error-subclass messages', () => {
    const f = write('b.ts', [
      "throw new Error('This model is not ready yet');",
      "const e = new ValidationError(`Training was refused here`);",
      "console.warn('Could not load the scores');",
      "LogError(`Scoring run went wrong`);",
      "export type Badge = 'Increases Risk' | 'Lowers Risk';",
      "const tool = { Name: 'OpenPrediction', Description: 'Open a prediction to its workspace', ParameterSchema: { type: 'object', properties: { p: { type: 'string', description: 'The prediction to open' } } } };",
      "const band = { Key: 'high', Description: 'High likelihood of renewal' };",
      "class BadRuleError extends Error { constructor(v: string) { super(`Training refused: ${v} is not a rule ` + `Remove it to use the default`); } }",
      "const fallback = name || 'Untitled prediction';",
    ].join('\n'));
    expect(texts([f])).toEqual(['High likelihood of renewal', 'Untitled prediction']);
  });

  it('splits inline HTML templates into text and attribute values, drops CSS, and keeps prose holding a JSON example', () => {
    const f = write('c.ts', [
      "const template = `<div class=\"ps-panel\" title=\"Weighted by the model\">",
      "  @if (rows.length === 0) {",
      "  <span>No predictions yet</span>",
      "  }</div>`;",
      "const styles = `:host { display: flex; flex-direction: column; }`;",
      "const hint = `Reply with JSON like { \"Name\": \"Churn\"; \"Target\": \"Renewed\" } and nothing else`;",
    ].join('\n'));
    expect(texts([f])).toEqual(['No predictions yet', 'Weighted by the model', 'Reply with JSON like { "Name": "Churn"; "Target": "Renewed" } and nothing else']);
  });

  it('groups texts by file, keeps a Markdown prompt whole, de-duplicates across files and leaves out files with none', () => {
    const md = write('prompt.md', '# Story\n\nDescribe drivers as associated with the outcome.');
    const ts = write('d.ts', "const a = 'Describe the drivers'; const b = 'Describe the drivers';");
    const again = write('e.ts', "const c = 'Describe the drivers'; const d = 'x';");
    expect(PsGateSpecs.UserFacingTexts([md, ts, again]).map((g) => [path.basename(g.Label), g.Texts])).toEqual([
      ['prompt.md', ['# Story Describe drivers as associated with the outcome.']],
      ['d.ts', ['Describe the drivers']],
    ]);
  });
});

describe('PsGateSpecs.Ref', () => {
  it('narrows catalog codes to dataset references and refuses anything else', () => {
    expect(PsGateSpecs.Ref('world', 'W1-signal', 42)).toEqual({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    expect(PsGateSpecs.Ref('scenario', 'T3-lag', 2203)).toEqual({ Kind: 'scenario', ID: 'T3-lag', Seed: 2203 });
    expect(() => PsGateSpecs.Ref('world', 'C2', 1)).toThrow(/not a dataset/);
  });
});
