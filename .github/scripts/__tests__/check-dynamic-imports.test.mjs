import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FindDynamicImports, PackageNameOf, ScanTree } from '../check-dynamic-imports.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-dynamic-imports.mjs');

describe('PackageNameOf', () => {
  it('returns the package of a bare specifier', () => {
    expect(PackageNameOf('cohere-ai')).toBe('cohere-ai');
    expect(PackageNameOf('lodash/fp')).toBe('lodash');
    expect(PackageNameOf('@elastic/elasticsearch')).toBe('@elastic/elasticsearch');
    expect(PackageNameOf('@scope/pkg/plugins')).toBe('@scope/pkg');
  });

  it('returns null for paths, URLs, subpath imports and built-ins', () => {
    for (const s of ['./x.js', '../x', '/abs/x.js', 'file:///x.js', 'node:fs', 'fs', 'path/posix', '#internal', 'C:\\x.js']) {
      expect(PackageNameOf(s), s).toBeNull();
    }
  });
});

describe('FindDynamicImports', () => {
  const specifiers = (src) => FindDynamicImports(src).map((h) => h.specifier);

  it('recovers a plain literal and a no-substitution template', () => {
    expect(specifiers("await import('a'); await import(`b`);")).toEqual(['a', 'b']);
  });

  it('recovers a literal behind `as string`, `satisfies`, parentheses and `!`', () => {
    expect(specifiers("await import('a' as string); await import(('b')); await import('c' satisfies string); await import('d'!);")).toEqual(['a', 'b', 'c', 'd']);
  });

  it('recovers a const in the same or an enclosing scope', () => {
    const src = [
      "const MOD = '@x/outer';",
      'async function f() {',
      "  const inner = '@x/inner';",
      '  await import(inner);',
      '  await import(MOD);',
      '}',
    ].join('\n');
    expect(specifiers(src)).toEqual(['@x/inner', '@x/outer']);
  });

  it('treats a parameter, a let, or a template with substitutions as dynamic', () => {
    const src = [
      'async function f(spec: string) { await import(spec); }',
      "let mutable = 'x'; await import(mutable);",
      'await import(`${base}/x.js`);',
    ].join('\n');
    expect(specifiers(src)).toEqual([null, null, null]);
  });

  it('ignores `typeof import()` type positions', () => {
    expect(FindDynamicImports("type T = typeof import('pkg');")).toEqual([]);
  });

  it('honours the exemption comment above, on the line, or inside the call', () => {
    const src = [
      '// dynamic-import: host-provided addon',
      "await import('a');",
      "await import('b'); // dynamic-import: optional peer",
      "await import(/* dynamic-import: test */ 'c');",
      "await import('d');",
    ].join('\n');
    expect(FindDynamicImports(src).map((h) => h.exempt)).toEqual([true, true, true, false]);
  });

  it('does not carry an exemption across a code line', () => {
    const src = ['// dynamic-import: only for the next line', 'const x = 1;', "await import('a');"].join('\n');
    expect(FindDynamicImports(src)[0].exempt).toBe(false);
  });
});

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'dyn-imports-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

describe('ScanTree', () => {
  it('flags an undeclared literal and accepts every dependency field', () => {
    const root = fixture({
      'a/package.json': { name: 'a', dependencies: { dep: '1' }, optionalDependencies: { opt: '1' }, peerDependencies: { peer: '1' } },
      'a/src/x.ts': "await import('dep'); await import('opt'); await import('peer'); await import('a/sub'); await import('missing' as string);",
    });
    const { violations } = ScanTree(root);
    expect(violations.map((v) => v.pkg)).toEqual(['missing']);
    expect(violations[0].line).toBe(1);
  });

  it('checks a file against its nearest package.json', () => {
    const root = fixture({
      'outer/package.json': { name: 'outer', dependencies: { shared: '1' } },
      'outer/inner/package.json': { name: 'inner' },
      'outer/inner/src/x.ts': "await import('shared');",
    });
    expect(ScanTree(root).violations.map((v) => v.pkg)).toEqual(['shared']);
  });

  it('skips tests, declarations, dist and node_modules', () => {
    const root = fixture({
      'a/package.json': { name: 'a' },
      'a/src/__tests__/x.ts': "await import('missing');",
      'a/src/x.test.ts': "await import('missing');",
      'a/src/x.d.ts': "await import('missing');",
      'a/dist/x.js': "await import('missing');",
      'a/node_modules/m/x.js': "await import('missing');",
    });
    expect(ScanTree(root).violations).toEqual([]);
  });

  it('lists unannotated dynamic specifiers separately and does not fail on them', () => {
    const root = fixture({
      'a/package.json': { name: 'a' },
      'a/src/x.ts': 'export async function f(s: string) { return import(s); }',
    });
    const { violations, dynamic } = ScanTree(root);
    expect(violations).toEqual([]);
    expect(dynamic).toHaveLength(1);
  });
});

describe('CLI', () => {
  it('exits 1 on a violation and 0 when clean', () => {
    const bad = fixture({ 'a/package.json': { name: 'a' }, 'a/src/x.ts': "await import('missing');" });
    const good = fixture({ 'a/package.json': { name: 'a', dependencies: { ok: '1' } }, 'a/src/x.ts': "await import('ok');" });
    const runBad = spawnSync(process.execPath, [SCRIPT, '--root', bad], { encoding: 'utf8' });
    const runGood = spawnSync(process.execPath, [SCRIPT, '--root', good], { encoding: 'utf8' });
    expect(runBad.status).toBe(1);
    expect(runBad.stderr).toContain("import('missing')");
    expect(runGood.status).toBe(0);
  });
});
