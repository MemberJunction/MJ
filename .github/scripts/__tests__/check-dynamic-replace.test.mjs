import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findViolations,
  classifyReplacementArg,
  maskLiteralsAndComments,
  splitCallArguments,
  UnparseableSourceError,
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

  /**
   * The symlink is created EXPLICITLY rather than relying on `os.tmpdir()`
   * happening to be one. It is on macOS (`/var` -> `/private/var`), but on the
   * Linux runners CI actually uses `os.tmpdir()` is a real directory — so a test
   * that leaned on it would pass with or without the fix, exactly where it
   * matters most.
   */
  it('runs when invoked through a symlinked path', () => {
    const { repo } = makeRepo('dyn-replace-symlink-');
    repos.push(repo);
    const link = join(dirname(repo), `${basename(repo)}-link`);
    symlinkSync(repo, link, 'dir');
    repos.push(link);

    const viaLink = execFileSync(
      'node',
      [join(link, '.github', 'scripts', 'check-dynamic-replace.mjs'), '--help'],
      { cwd: repo, encoding: 'utf8' },
    );
    expect(viaLink).toContain('Usage:');
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

// ─── scanner must never go blind (#3769 review) ───────────────────
//
// `isRegexPosition` looked back over the RAW source, so a trailing `//` comment
// on the previous line was read as code. When its last word wasn't a keyword the
// next line's `/` was called division, the regex went unmasked, and a backtick
// inside it opened a template frame that never closed — blanking the rest of the
// FILE. The gate then printed "✓ clean" over code it had never parsed. Two real
// files did this (SafeExpressionEvaluator.ts, calculate-expression.action.ts).

describe('scanner blindness', () => {
  const canary = '\nconst out = s.replace(pattern, userValue);\n';

  it('is not blinded by a trailing comment above a regex holding a backtick', () => {
    const src = ['const re = [', '  /x/, // note', '  /`/,', '];'].join('\n');
    expect(findViolations(src + canary)).toHaveLength(1);
  });

  it('reports a residual-frame desync instead of silently under-reporting', () => {
    // An unterminated template is unparseable; the gate must refuse, not pass.
    expect(() => findViolations('const a = `never closed;\n')).toThrow(UnparseableSourceError);
  });

  it('still parses a balanced file without complaint', () => {
    expect(() => findViolations('const a = `closed`;\ns.replace(p, () => v);\n')).not.toThrow();
  });

  it('flags a replace after a self-closing JSX tag with an expression prop', () => {
    expect(findViolations('const el = <Foo x={1} />; const o = s.replace(p, v);')).toHaveLength(1);
  });

  it('flags a replace after a postfix increment used in division', () => {
    expect(findViolations('const r = (i++ / 2) + s.replace(p, v);')).toHaveLength(1);
  });

  it('flags a replace after a postfix decrement used in division', () => {
    expect(findViolations('const r = (i-- / 2) + s.replace(p, v);')).toHaveLength(1);
  });

  it('still masks a genuine regex opening after an operator', () => {
    // `/'/` here IS a regex; if we mis-call it division the quote desyncs the line.
    expect(findViolations("const m = x || /'/.test(y); s.replace(p, v);")).toHaveLength(1);
  });
});

// ─── CLI argument handling (#3769 review) ─────────────────────────
//
// `--file` with a missing, nonexistent or filtered-out path fell through to
// "✓ 0 file(s) clean" and exit 0 — a pass reported over nothing at all, while
// `--base` already exits 2 for the identical mistake. An unknown flag was
// silently ignored, so a typo'd invocation quietly checked something else.

describe('CLI arguments', () => {
  const repos = [];
  afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

  /**
   * A repo whose diff mode WORKS. Without a resolvable base, every bad-argument
   * case exits 2 via base resolution instead of via validation — the assertions
   * would pass while proving nothing.
   */
  const workingRepo = () => {
    const { repo, git } = makeRepo('dyn-replace-cli-');
    repos.push(repo);
    writeFileSync(join(repo, 'packages', 'x', 'a.ts'), 's.replace(p, () => v);\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('branch', '-M', 'next');
    git('checkout', '-qb', 'feat');
    return repo;
  };

  it('confirms the control: diff mode against this base does report clean', () => {
    const { code, output } = runGate(workingRepo(), ['--base', 'next']);
    expect(output).toContain('clean');
    expect(code).toBe(0);
  });

  it('rejects --file with no value instead of reporting a pass', () => {
    const { code, output } = runGate(workingRepo(), ['--file']);
    expect(output).not.toContain('clean');
    expect(code).toBe(2);
  });

  it('rejects a --file path that does not exist', () => {
    const { code, output } = runGate(workingRepo(), ['--file', 'packages/x/nope.ts']);
    expect(output).not.toContain('clean');
    expect(code).toBe(2);
  });

  it('rejects an unknown flag instead of silently checking something else', () => {
    // BASE_REF makes diff mode viable, so a pass here would mean the flag was
    // ignored — not that the base failed to resolve.
    const { code, output } = runGate(workingRepo(), ['--bogus-flag'], { BASE_REF: 'next' });
    expect(output).not.toContain('clean');
    expect(code).toBe(2);
  });

  it('rejects --base with no value', () => {
    const { code, output } = runGate(workingRepo(), ['--base'], { BASE_REF: 'next' });
    expect(output).not.toContain('clean');
    expect(code).toBe(2);
  });

  it('still accepts a valid --file', () => {
    const r = workingRepo();
    const { code, output } = runGate(r, ['--file', join(r, 'packages', 'x', 'a.ts')]);
    expect(output).toContain('clean');
    expect(code).toBe(0);
  });
});

// ─── scan cost (#3769 review) ─────────────────────────────────────
//
// `lineAt` did `masked.slice(0, index).split('\n').length` per violation, so a
// file with V violations over N characters cost O(V·N). Measured before the fix:
// 2k lines 89ms, 20k lines 8.3s, 100k lines 212s — 10x the input for 93x the
// time. Real files never hit it, but a generated or vendored blob would, and a
// gate that takes three minutes gets disabled.

describe('scan cost', () => {
  const bigSource = (n) =>
    Array.from({ length: n }, (_, i) => `const a${i} = x / y; s.replace(p, v${i});`).join('\n');

  it('reports correct line numbers on a large file', () => {
    const v = findViolations(bigSource(5000));
    expect(v).toHaveLength(5000);
    expect(v[0].line).toBe(1);
    expect(v[4999].line).toBe(5000);
  });

  /**
   * Deliberately loose — this guards the COMPLEXITY, not a wall-clock budget.
   * Linear finishes in well under a second; the quadratic version needed 8.3s
   * for this input, so anything near the bound means the O(V·N) scan is back.
   */
  it('scans 20k violations in linear-ish time', () => {
    const started = Date.now();
    expect(findViolations(bigSource(20000))).toHaveLength(20000);
    expect(Date.now() - started).toBeLessThan(4000);
  });
});

// ─── suppression scope (#3769 review) ─────────────────────────────
//
// The marker was only honoured on the SINGLE line above the call. But the escape
// hatch exists to force a written reason, and real reasons run to several lines —
// so the natural way to write one put the marker out of range and the suppression
// silently did nothing. Three separate attempts in one sitting tripped over it.
// The scan now covers the contiguous comment block immediately above the call.

describe('suppression scope', () => {
  it('honours a marker on the first line of a multi-line comment block', () => {
    const src = [
      '// safe-replace: alias is \\w-only by construction',
      '// so the replacement can never contain a $',
      's.replace(p, alias);',
    ].join('\n');
    expect(findViolations(src)).toHaveLength(0);
  });

  it('honours a marker in the middle of a comment block', () => {
    const src = [
      '// Explanation first.',
      '// safe-replace: pre-escaped upstream',
      '// And a trailing note.',
      's.replace(p, escaped);',
    ].join('\n');
    expect(findViolations(src)).toHaveLength(0);
  });

  it('honours a JSDoc block above the call', () => {
    const src = ['/**', ' * safe-replace: value is a constant', ' */', 's.replace(p, v);'].join('\n');
    expect(findViolations(src)).toHaveLength(0);
  });

  // The widening must not reach past the block it belongs to.
  it('does not honour a marker separated from the call by code', () => {
    const src = ['// safe-replace: applies to the NEXT call only', 'other();', 's.replace(p, v);'].join('\n');
    expect(findViolations(src)).toHaveLength(1);
  });

  it('does not honour a marker separated from the call by a blank line', () => {
    const src = ['// safe-replace: stale marker', '', 's.replace(p, v);'].join('\n');
    expect(findViolations(src)).toHaveLength(1);
  });
});

// ─── fail-open defects (#3769 second review) ──────────────────────

describe('diff parsing cannot be hijacked by file content', () => {
  const repos = [];
  afterAll(() => repos.forEach((r) => rmSync(r, { recursive: true, force: true })));

  /**
   * Under `--unified=0` an ADDED line carries a `+` prefix, so source content
   * beginning `++ b/x` renders as `+++ b/x` and matched the file-header regex.
   * Everything after it was attributed to a file that does not exist, then
   * dropped by the existsSync filter — so a real violation shipped as "clean".
   * A file header only ever appears as a `--- a/…` / `+++ b/…` PAIR.
   */
  it('does not treat a body line beginning "++ b/" as a file header', () => {
    const { repo, git } = makeRepo('dyn-replace-hijack-');
    repos.push(repo);
    const filler = Array.from({ length: 30 }, (_, i) => `const p${i} = 1;`).join('\n');
    writeFileSync(join(repo, 'packages', 'x', 'a.ts'), `export const seed = 1;\n${filler}\n`);
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('branch', '-M', 'next');
    git('checkout', '-qb', 'feat');

    // Two separate hunks: patch-like text near the top, the violation at the end.
    writeFileSync(
      join(repo, 'packages', 'x', 'a.ts'),
      ['export const seed = 1;', 'const patchFixture = `', '++ b/nowhere.ts', '`;', filler,
       's = s.replace("a", userValue);', ''].join('\n'),
    );
    git('add', '-A');
    git('commit', '-qm', 'feat');

    const { code, output } = runGate(repo, ['--base', 'next']);
    expect(output).not.toContain('clean');
    expect(output).toContain('a.ts');
    expect(code).toBe(1);
  });
});

describe('regex literals beginning with >', () => {
  /**
   * The JSX self-closing-tag rule (`/>`) fired for ANY regex starting with `>`,
   * leaving `/>/` unmasked; the closing `/` was then read as a regex opener and
   * the rest of the line was blanked. 53 files in this repo contain
   * `replace(/>`, and HTML-escape chains are exactly where a dynamic
   * replacement gets appended.
   */
  it('flags a dynamic replacement whose search is /">"/', () => {
    expect(findViolations('html.replace(/>/g, userValue)')).toHaveLength(1);
  });

  it('does not let /">"/ blank the rest of the line', () => {
    // The first call is safe (arrow), so a single finding proves the SECOND
    // call was still seen — i.e. the line was not truncated at the `>` regex.
    const src = 's.replace(/>/g, () => safe); const b = t.replace(p, dangerousValue);';
    const [only] = findViolations(src);
    expect(only?.text).toContain('dangerousValue');
  });

  it('handles a realistic HTML-escape chain ending in a dynamic replacement', () => {
    const src = `col.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g, userValue)`;
    expect(findViolations(src)).toHaveLength(1);
  });

  it('still treats a self-closing JSX tag with an expression prop as JSX', () => {
    expect(findViolations('const el = <Foo x={1} />; const o = s.replace(p, v);')).toHaveLength(1);
  });
});
