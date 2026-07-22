/**
 * Corpus test for CrushCode: run it over a large set of REAL TypeScript and SQL files from
 * the repository and assert the robustness/structure invariants hold on real-world code:
 *   1. never throws (TS + SQL, with and without comment-dropping);
 *   2. is a true no-op when collapsing is disabled and comments are kept;
 *   3. is idempotent (collapsing twice == once);
 *   4. never corrupts a non-collapsed region — every output line is either an original line
 *      or the synthetic collapse marker (so the brace-matcher never mangles surrounding code);
 *   5. collapsing never increases size.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CrushCode } from '../crush-code';

const REPO = join(process.cwd(), '..', '..', '..');

function collectFiles(dir: string, ext: string, limit: number): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    if (out.length >= limit) return;
    let entries: string[];
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (e === 'node_modules' || e === 'dist' || e === '.git') continue;
      const p = join(d, e);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (e.endsWith(ext) && !e.endsWith('.d.ts')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const ELIDED = /\/\* … \d+ lines elided \*\/ \}$/;

function assertNoCorruption(source: string, crushedText: string): void {
  const originalLines = new Set(source.split('\n').map((l) => l.trimEnd()));
  for (const line of crushedText.split('\n')) {
    const trimmed = line.trimEnd();
    if (ELIDED.test(trimmed)) continue; // synthetic collapse marker — expected
    expect(originalLines.has(trimmed), `output line not found verbatim in source: ${JSON.stringify(line)}`).toBe(true);
  }
}

describe('CrushCode corpus — TypeScript', () => {
  const files = collectFiles(join(REPO, 'packages', 'AI', 'Agents', 'src'), '.ts', 60);

  it('found a corpus to test', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('never throws on real TS (collapse + comment-drop variants)', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(() => CrushCode(src, 'typescript', { MinBodyLines: 3 }), f).not.toThrow();
      expect(() => CrushCode(src, 'typescript', { MinBodyLines: 3, DropComments: true }), f).not.toThrow();
    }
  });

  it('is a true no-op when collapsing is disabled and comments are kept', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const r = CrushCode(src, 'typescript', { MinBodyLines: 10_000_000, DropComments: false });
      expect(r.Text, f).toBe(src);
    }
  });

  it('never corrupts non-collapsed regions and never grows the source', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const r = CrushCode(src, 'typescript', { MinBodyLines: 3 });
      assertNoCorruption(src, r.Text);
      expect(r.CrushedChars, f).toBeLessThanOrEqual(r.OriginalChars);
    }
  });

  it('is idempotent (collapse twice == once)', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const once = CrushCode(src, 'typescript', { MinBodyLines: 3 }).Text;
      const twice = CrushCode(once, 'typescript', { MinBodyLines: 3 }).Text;
      expect(twice, f).toBe(once);
    }
  });
});

describe('CrushCode corpus — SQL', () => {
  const files = collectFiles(join(REPO, 'migrations'), '.sql', 20);

  it('never throws on real SQL migrations and never grows the source', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      let r;
      expect(() => { r = CrushCode(src, 'sql', { DropComments: true }); }, f).not.toThrow();
      expect(r!.CrushedChars, f).toBeLessThanOrEqual(r!.OriginalChars);
    }
  });

  it('SQL with comments kept and no long VALUES lists is a no-op', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const r = CrushCode(src, 'sql', { DropComments: false });
      // Either unchanged, or only changed by collapsing genuinely long VALUES lists.
      if (!r.Legend.Notes.some((n) => n.includes('VALUES'))) {
        expect(r.Text, f).toBe(src.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n'));
      }
    }
  });
});
