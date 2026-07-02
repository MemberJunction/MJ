import { describe, it, expect } from 'vitest';
import { CrushCode } from '../crush-code';

const TS_SAMPLE = `import { Thing } from 'x';

/** Adds two numbers. */
export function add(a: number, b: number): number {
    const sum = a + b;
    const doubled = sum * 1;
    // noise comment
    return doubled;
}

export class Calculator {
    public multiply(a: number, b: number): number {
        let acc = 0;
        for (let i = 0; i < b; i++) {
            acc = acc + a;
        }
        return acc;
    }
}
`;

describe('CrushCode (typescript)', () => {
  it('collapses non-focal function bodies while preserving signatures', () => {
    const result = CrushCode(TS_SAMPLE, 'typescript', { MinBodyLines: 2 });
    expect(result.Text).toContain('export function add(a: number, b: number): number');
    expect(result.Text).toContain('public multiply(a: number, b: number): number');
    expect(result.Text).toContain('lines elided');
    expect(result.CrushedChars).toBeLessThan(result.OriginalChars);
    expect(result.Legend.Notes.join(' ')).toContain('collapsed');
  });

  it('keeps the focal region verbatim', () => {
    // add() spans lines 4-9; focus on it so it is NOT collapsed.
    const result = CrushCode(TS_SAMPLE, 'typescript', { MinBodyLines: 2, Focal: { StartLine: 4, EndLine: 9 } });
    expect(result.Text).toContain('const sum = a + b;');
    expect(result.Text).toContain('const doubled = sum * 1;');
  });

  it('preserves docstrings but can drop noise comments', () => {
    const result = CrushCode(TS_SAMPLE, 'typescript', { DropComments: true, MinBodyLines: 100 });
    expect(result.Text).toContain('/** Adds two numbers. */');
    expect(result.Text).not.toContain('// noise comment');
  });

  it('does not collapse control-flow blocks as if they were functions', () => {
    const src = `function run() {\n    if (x) {\n        doA();\n        doB();\n        doC();\n    }\n    return 1;\n}\n`;
    const result = CrushCode(src, 'typescript', { MinBodyLines: 2 });
    // The function body is collapsed, but the inner if-block is not separately mistaken
    // for a function; output stays well-formed (single collapse note).
    expect(result.Legend.Notes.filter((n) => n.includes('collapsed'))).toHaveLength(1);
  });

  it('is idempotent (second pass is a no-op on already-collapsed bodies)', () => {
    const once = CrushCode(TS_SAMPLE, 'typescript', { MinBodyLines: 2 }).Text;
    const twice = CrushCode(once, 'typescript', { MinBodyLines: 2 }).Text;
    expect(twice).toBe(once);
  });

  it('leaves small bodies (below MinBodyLines) verbatim', () => {
    const src = `function tiny() {\n    return 1;\n}\n`;
    const result = CrushCode(src, 'typescript', { MinBodyLines: 4 });
    expect(result.Text).toContain('return 1;');
    expect(result.Text).not.toContain('elided');
  });

  it('collapses arrow-function bodies', () => {
    const src = ['const h = (a, b) => {', '    const c = a + b;', '    const d = c * 2;', '    return d;', '};'].join('\n');
    const result = CrushCode(src, 'typescript', { MinBodyLines: 2 });
    expect(result.Text).toContain('const h = (a, b) => {');
    expect(result.Text).toContain('elided');
  });

  it('does not collapse object literals or control-flow as functions', () => {
    const obj = ['const config = {', '    a: 1,', '    b: 2,', '    c: 3,', '    d: 4,', '};'].join('\n');
    expect(CrushCode(obj, 'typescript', { MinBodyLines: 2 }).Text).toContain('a: 1,');
    const ctrl = ['for (const x of items) {', '    a();', '    b();', '    c();', '    d();', '}'].join('\n');
    expect(CrushCode(ctrl, 'typescript', { MinBodyLines: 2 }).Text).toContain('a();');
  });

  it('does not corrupt code with braces inside strings/comments', () => {
    const src = [
      'function f(a) {',
      '    const s = "a } not a close // nope";',
      '    work(a);',
      '    more(a);',
      '    return s;',
      '}',
      'const after = 42;',
    ].join('\n');
    const result = CrushCode(src, 'typescript', { MinBodyLines: 2 });
    // The trailing statement must survive — i.e. the close-brace match wasn't fooled.
    expect(result.Text).toContain('const after = 42;');
    expect(result.Text).toContain('function f(a) {');
  });
});

describe('CrushCode (sql)', () => {
  it('collapses long VALUES lists', () => {
    const rows = Array.from({ length: 10 }, (_, i) => `(${i}, 'name${i}')`).join(', ');
    const sql = `INSERT INTO Users (id, name) VALUES ${rows};`;
    const result = CrushCode(sql, 'sql');
    expect(result.Text).toContain('value tuples elided');
    expect(result.CrushedChars).toBeLessThan(result.OriginalChars);
  });

  it('strips comments when asked', () => {
    const sql = `-- a comment\nSELECT 1; /* block */`;
    const result = CrushCode(sql, 'sql', { DropComments: true });
    expect(result.Text).not.toContain('a comment');
    expect(result.Text).not.toContain('block');
    expect(result.Text).toContain('SELECT 1;');
  });

  it('leaves short SQL untouched', () => {
    const sql = `SELECT id, name FROM Users WHERE id = 1;`;
    const result = CrushCode(sql, 'sql');
    expect(result.Text).toBe(sql);
  });
});
