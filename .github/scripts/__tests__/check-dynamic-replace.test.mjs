import { describe, it, expect } from 'vitest';
import {
  findViolations,
  classifyReplacementArg,
  maskLiteralsAndComments,
  splitCallArguments,
} from '../check-dynamic-replace.mjs';

const linesOf = (v) => v.map((x) => x.line);

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
