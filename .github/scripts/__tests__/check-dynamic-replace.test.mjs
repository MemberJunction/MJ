import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findViolations,
  classifyReplacementArg,
  maskLiteralsAndComments,
  splitCallArguments,
} from '../check-dynamic-replace.mjs';

const linesOf = (v) => v.map((x) => x.line);

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'check-dynamic-replace.mjs');

/**
 * Build a throwaway repo with the gate installed at its own `.github/scripts/`
 * path. The gate resolves REPO_ROOT from `import.meta.url`, not from cwd, so it
 * must be COPIED in — running the real one with `cwd` set would still scan MJ.
 */
function makeRepo(prefix) {
  const repo = mkdtempSync(join(tmpdir(), prefix));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
  mkdirSync(join(repo, '.github', 'scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(repo, '.github', 'scripts', 'check-dynamic-replace.mjs'));
  mkdirSync(join(repo, 'packages', 'x'), { recursive: true });
  git('init', '-q', '.');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  return { repo, git };
}

function runGate(repo, args, env = {}) {
  try {
    return {
      code: 0,
      output: execFileSync('node', [join(repo, '.github', 'scripts', 'check-dynamic-replace.mjs'), ...args], {
        cwd: repo,
        encoding: 'utf8',
        env: { ...process.env, ...env },
      }),
    };
  } catch (err) {
    return { code: err.status, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('classifyReplacementArg', () => {
  it.each([
    ['() => value', 'function'],
    ['(_m, p1) => `${p1}x`', 'function'],
    ['m => m.toUpperCase()', 'function'],
    ['function (m) { return m; }', 'function'],
    ['async function (m) { return m; }', 'function'],
  ])('treats %s as safe (%s)', (arg, reason) => {
    expect(classifyReplacementArg(arg)).toEqual({ safe: true, reason });
  });

  it('treats a static string literal as safe', () => {
    // Post-masking shape: delimiters kept, body blanked.
    expect(classifyReplacementArg("'    '").safe).toBe(true);
    expect(classifyReplacementArg('"  "').safe).toBe(true);
  });

  it('flags a bare identifier', () => {
    expect(classifyReplacementArg('value')).toEqual({
      safe: false, reason: 'dynamic-expression',
    });
  });

  it('flags a member expression', () => {
    expect(classifyReplacementArg('replacement.new').safe).toBe(false);
  });

  /**
   * Regression: a leading `(` used to be taken as an arrow-function parameter
   * list, which silently exempted `(a ?? '').replace(...)` — one of the real
   * #3171 sites (securityInfo.ts MagicLinkScope tokens).
   */
  it('flags a parenthesised expression that merely starts with (', () => {
    expect(classifyReplacementArg(`(scope?.ResourceID ?? '').replace(/'/g, "''")`).safe)
      .toBe(false);
  });

  it('flags a nested arrow that is not the argument itself', () => {
    expect(classifyReplacementArg("list.map(x => x).join('')").safe).toBe(false);
  });

  it('flags an interpolated template', () => {
    expect(classifyReplacementArg('`${value}`')).toEqual({
      safe: false, reason: 'interpolated-template',
    });
  });
});

describe('maskLiteralsAndComments', () => {
  it('preserves line count so reported lines stay accurate', () => {
    const src = "const a = 1;\n// comment\n/* block\n   spans */\nconst b = 'x';\n";
    expect(maskLiteralsAndComments(src).split('\n')).toHaveLength(src.split('\n').length);
  });

  it('blanks a .replace( that only appears inside a string', () => {
    const src = `const doc = "call .replace(a, b) here";`;
    expect(findViolations(src)).toHaveLength(0);
  });

  it('keeps ${ markers inside templates', () => {
    expect(maskLiteralsAndComments('`a${x}b`')).toContain('${');
  });

  /**
   * Regression: a quote INSIDE a regex literal (`.replace(/'/g, "''")`) used to
   * be read as a string opener, desynchronising the scan and silently hiding
   * the rest of the line — which is how securityInfo.ts:573 escaped detection.
   */
  it('does not let a quote inside a regex literal swallow the line', () => {
    const src = `ret = ret.replace(/\\{\\{Token\\}\\}/g, (scope?.ID ?? '').replace(/'/g, "''"));`;
    expect(findViolations(src)).toHaveLength(1);
  });

  it('treats a division slash as division, not a regex', () => {
    const src = "const ratio = a / b;\ns.replace(p, value);";
    expect(linesOf(findViolations(src))).toEqual([2]);
  });

  it('ignores braces inside a regex literal when splitting arguments', () => {
    const src = 's.replace(/a{1,3}/g, () => x);';
    expect(findViolations(src)).toHaveLength(0);
  });
});

describe('splitCallArguments', () => {
  it('does not split on commas nested inside parens', () => {
    const src = 'f(a, g(b, c), d)';
    const { args } = splitCallArguments(src, src.indexOf('('));
    expect(args.map((a) => a.text.trim())).toEqual(['a', 'g(b, c)', 'd']);
  });

  it('returns the closing paren index so callers can compute the call span', () => {
    const src = 'f(a, b)';
    expect(splitCallArguments(src, 1).end).toBe(src.length - 1);
  });

  it('returns null for an unterminated call', () => {
    expect(splitCallArguments('f(a, b', 1)).toBeNull();
  });
});

describe('findViolations', () => {
  it('flags the #3171 shape: dynamic value in a string replacement', () => {
    const src = [
      'function f(content, name, value) {',
      '  const newLine = `${name}=${value}`;',
      '  return content.replace(pattern, newLine);',
      '}',
    ].join('\n');
    expect(linesOf(findViolations(src))).toEqual([3]);
  });

  it('accepts the fixed shape', () => {
    const src = 'return content.replace(pattern, () => newLine);';
    expect(findViolations(src)).toHaveLength(0);
  });

  it('accepts a replacement function that preserves capture groups', () => {
    const src = 'content.replace(p, (_m, a, _b, c) => `${a}${value}${c}`);';
    expect(findViolations(src)).toHaveLength(0);
  });

  it('flags an interpolated template even when it uses capture groups', () => {
    const src = 'content = content.replace(emptyPattern, `$1\'${value}\'`);';
    expect(findViolations(src)).toHaveLength(1);
  });

  it('leaves single-argument replace calls alone', () => {
    expect(findViolations('s.replace(/x/g)')).toHaveLength(0);
  });

  it('covers replaceAll too', () => {
    const src = 's.replaceAll(token, value);';
    const v = findViolations(src);
    expect(v).toHaveLength(1);
    expect(v[0].method).toBe('replaceAll');
  });

  it('honours a same-line suppression', () => {
    const src = 's.replace(p, escaped); // safe-replace: pre-escaped above';
    expect(findViolations(src)).toHaveLength(0);
  });

  it('honours a previous-line suppression', () => {
    const src = '// safe-replace: pre-escaped above\ns.replace(p, escaped);';
    expect(findViolations(src)).toHaveLength(0);
  });

  it('does not treat an unrelated comment as suppression', () => {
    const src = '// just a note\ns.replace(p, escaped);';
    expect(findViolations(src)).toHaveLength(1);
  });

  it('ignores a commented-out violation', () => {
    expect(findViolations('// s.replace(p, value);')).toHaveLength(0);
  });

  it('reports every violation in a file', () => {
    const src = ['a.replace(p, x);', 'b.replace(p, () => y);', 'c.replaceAll(p, z);'].join('\n');
    expect(linesOf(findViolations(src))).toEqual([1, 3]);
  });

  // ─── multi-line call attribution ──────────────────────────────────
  //
  // The violation used to be attributed to the line holding `.replace(`. For a
  // call spread over several lines that is a line the change may never have
  // touched, so the line-aware filter waved the violation through.

  it('reports a multi-line call at the REPLACEMENT ARGUMENT line', () => {
    const src = ['a = b.replace(', '  pattern,', '  dangerousValue', ');'].join('\n');
    const [v] = findViolations(src);
    expect(v.line).toBe(3);
  });

  it('exposes the full call span so any touched line can gate it', () => {
    const src = ['a = b.replace(', '  pattern,', '  dangerousValue', ');'].join('\n');
    const [v] = findViolations(src);
    expect({ startLine: v.startLine, endLine: v.endLine }).toEqual({ startLine: 1, endLine: 4 });
  });

  it('honours a suppression placed anywhere inside a multi-line call', () => {
    const src = [
      'a = b.replace(',
      '  pattern,',
      '  escaped, // safe-replace: pre-escaped upstream',
      ');',
    ].join('\n');
    expect(findViolations(src)).toHaveLength(0);
  });

  // ─── nested template interpolations ───────────────────────────────

  it('masks strings nested inside a template interpolation', () => {
    // The inner text only MENTIONS a replace call; it must not be scanned.
    const src = 'const s = `${x("a.replace(p, v)")}`;';
    expect(findViolations(src)).toHaveLength(0);
  });

  it('still flags a real dynamic replace inside a template interpolation', () => {
    const src = 'const s = `${a.replace(p, value)}`;';
    expect(findViolations(src)).toHaveLength(1);
  });

  it('does not mistake an object-literal brace for the end of an interpolation', () => {
    const src = 'const s = `${fn({ a: 1 })} tail`;\nb.replace(p, value);';
    expect(linesOf(findViolations(src))).toEqual([2]);
  });
});

// ─── large diffs (#3769 follow-up) ────────────────────────────────
//
// `git diff --unified=0` over a real PR routinely runs to megabytes — the
// materialization PR (#3735) alone produced 897 KB. `execFileSync` buffers the
// whole thing and its default `maxBuffer` is 1 MiB, so the gate died with a raw
// `spawnSync git ENOBUFS` stack and exit 1: an unrelated PR turned red, and the
// message pointed at Node internals rather than at anything the author did.

describe('large diffs', () => {
  const repos = [];
  afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

  /** A source file with no `.replace(` in it, sized to blow past a buffer limit. */
  const filler = (bytes) => {
    const line = `export const pad${'x'.repeat(40)} = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';\n`;
    return line.repeat(Math.ceil(bytes / line.length));
  };

  it('reports a verdict instead of crashing when the diff exceeds 1 MiB', () => {
    const { repo, git } = makeRepo('dyn-replace-big-');
    repos.push(repo);
    writeFileSync(join(repo, 'packages', 'x', 'a.ts'), 'export const a = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('branch', '-M', 'next');
    git('checkout', '-qb', 'feat');
    // ~2 MiB of added lines — comfortably over the 1 MiB default.
    writeFileSync(join(repo, 'packages', 'x', 'big.ts'), filler(2 * 1024 * 1024));
    git('add', '-A');
    git('commit', '-qm', 'feat');

    const { code, output } = runGate(repo, ['--base', 'next']);

    expect(output).not.toContain('ENOBUFS');
    expect(output).toContain('clean');
    expect(code).toBe(0);
  });

  /**
   * The buffer is generous but finite. When it IS exhausted the gate must say so
   * and exit non-zero — never print "clean", which would report a pass over a
   * scope it never actually read. Same doctrine as an unresolvable base ref.
   */
  it('fails loudly rather than reporting a pass when the diff exceeds the buffer', () => {
    const { repo, git } = makeRepo('dyn-replace-cap-');
    repos.push(repo);
    writeFileSync(join(repo, 'packages', 'x', 'a.ts'), 'export const a = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('branch', '-M', 'next');
    git('checkout', '-qb', 'feat');
    writeFileSync(join(repo, 'packages', 'x', 'big.ts'), filler(256 * 1024));
    git('add', '-A');
    git('commit', '-qm', 'feat');

    // Squeeze the cap below the diff size rather than generating gigabytes.
    const { code, output } = runGate(repo, ['--base', 'next'], { MJ_GIT_MAX_BUFFER: '4096' });

    expect(output).not.toContain('clean');
    expect(output).toMatch(/too large|exceeds|buffer/i);
    expect(code).toBe(2);
  });
});

// ─── direct-invocation detection (#3769 follow-up) ────────────────
//
// `invokedDirectly` compared `fileURLToPath(import.meta.url)` to `process.argv[1]`
// as raw strings. Node resolves symlinks when loading an ES module, so the former
// is the physical path while the latter keeps whatever the caller typed — on macOS
// `os.tmpdir()` alone splits them (`/var/…` vs `/private/var/…`). The comparison
// then decided "imported", and the gate printed nothing and exited 0: a silent
// pass, the single outcome this script must never produce.

describe('direct invocation', () => {
  const repos = [];
  afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

  it('runs when invoked through a path that is not already a realpath', () => {
    const { repo } = makeRepo('dyn-replace-symlink-');
    repos.push(repo);
    const { output } = runGate(repo, ['--help']);
    expect(output).toContain('Usage:');
  });
});

// ─── JSX (#3769 follow-up) ────────────────────────────────────────
//
// `.tsx`/`.jsx` are in SOURCE_EXTENSIONS, so the gate claims to cover them. But
// the `/` of a closing tag sits right after `<`, which `isRegexPosition` read as
// a regex opener — the scan then blanked everything from there to the next `/`
// or newline. Any `.replace(` later on that line vanished, silently, in exactly
// the file type React code lives in.

describe('JSX', () => {
  it('flags a dynamic replace after a closing tag on the same line', () => {
    const src = 'return <p><b>{label}</b>{body.replace(re, userValue)}</p>;';
    expect(findViolations(src)).toHaveLength(1);
  });

  it('flags a dynamic replace after a fragment close', () => {
    const src = 'return <><Row /></>; const s = tpl.replace(re, userValue);';
    expect(findViolations(src)).toHaveLength(1);
  });

  it('flags a dynamic replace inside a prop after a sibling closing tag', () => {
    const src = 'return <div><A /></div><B x={s.replace(re, userValue)} />;';
    expect(findViolations(src)).toHaveLength(1);
  });

  it('still accepts a replacement function in the same shape', () => {
    const src = 'return <p><b>{label}</b>{body.replace(re, () => userValue)}</p>;';
    expect(findViolations(src)).toHaveLength(0);
  });

  /** The `<` heuristic must not cost us real regex detection elsewhere. */
  it('still treats a regex literal after a comparison as a regex', () => {
    const src = 'if (a < /x,y/.source.length) { s.replace(p, value); }';
    expect(findViolations(src)).toHaveLength(1);
  });
});
