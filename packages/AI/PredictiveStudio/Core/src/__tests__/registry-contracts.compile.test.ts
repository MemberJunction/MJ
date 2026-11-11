/**
 * The compile-time half of the review's contract checks: `fixtures/registry-contract-refusals.ts` compiled with the
 * TypeScript compiler API under this package's `tsconfig.json` has no diagnostics (every `@ts-expect-error` is used),
 * and with every `@ts-expect-error` line removed has exactly the review's 15 errors (`agentPublish` replaced by
 * `agentSignOff`, D4-16).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/registry-contract-refusals.ts');
const TSCONFIG = resolve(here, '../../tsconfig.json');

/** The package's compiler options, with emit off (the fixture is checked, never built). */
function compilerOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(TSCONFIG, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); },
  });
  if (parsed === undefined) throw new Error(`cannot read ${TSCONFIG}`);
  return { ...parsed.options, noEmit: true, declaration: false, declarationMap: false, sourceMap: false };
}

/** One diagnostic of the fixture: its 1-based line, the name the statement declares, and the TS error code. */
interface FixtureDiagnostic {
  readonly Line: number;
  readonly Name: string;
  readonly Code: number;
}

/**
 * The code each refusal must fail with, in fixture order: f1–f5 and the two literals miss `#issued` (TS2741), the
 * direct `new` hits the private constructor (TS2673), an unknown member is an excess property (TS2353), a wrong literal
 * or a raw number is not assignable (TS2322).
 */
const EXPECTED_CODES: readonly (readonly [string, number])[] = [
  ['f1', 2741], ['f2', 2741], ['f3', 2741], ['f4', 2741], ['f5', 2741], ['direct', 2673],
  ['finalistAsSimple', 2741], ['mismatchedRegistry', 2741], ['separateGate', 2353], ['badMargin', 2322],
  ['replacesField', 2353], ['agentSignOff', 2322], ['badTask', 2322], ['storedBooleans', 2353], ['callerMargin', 2353],
];

/** True for a `// @ts-expect-error` directive line (not prose that mentions the directive). */
function isDirective(line: string): boolean {
  return /^\s*\/\/ @ts-expect-error\b/.test(line);
}

/** The name an `export const <name>` line declares. */
function declaredName(line: string): string {
  const m = /export const (\w+)/.exec(line);
  return m?.[1] || line.trim();
}

/** Compiles the fixture (its text replaced by `text`) and returns its diagnostics with line, declared name and code. */
function compileDiagnostics(text: string): FixtureDiagnostic[] {
  const lines = text.split('\n');
  return compileProgram(text).map((d) => {
    const line = d.file !== undefined && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line : -1;
    return { Line: line + 1, Name: declaredName(lines[line] || ''), Code: d.code };
  });
}

/** Compiles the fixture (its text replaced by `text`) and returns the formatted diagnostics. */
function compileText(text: string): string {
  return ts.formatDiagnostics(compileProgram(text), { getCanonicalFileName: (f) => f, getCurrentDirectory: () => here, getNewLine: () => '\n' });
}

/** Compiles the fixture (its text replaced by `text`) under the package's options. */
function compileProgram(text: string): readonly ts.Diagnostic[] {
  const options = compilerOptions();
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    resolve(fileName) === FIXTURE
      ? ts.createSourceFile(fileName, text, languageVersion, true)
      : original(fileName, languageVersion, onError, shouldCreate);
  return ts.getPreEmitDiagnostics(ts.createProgram([FIXTURE], options, host));
}

describe('registry contract compile-time refusals', () => {
  const source = readFileSync(FIXTURE, 'utf8');

  it('compiles with every @ts-expect-error used (0 diagnostics)', () => {
    expect(compileText(source)).toBe('');
  }, 120_000);

  it('fails with exactly the 15 refusals, one per removed @ts-expect-error line, each with its code', () => {
    const original = source.split('\n');
    const stripped = original.filter((line) => !isDirective(line));
    // Each directive guards the next line; after stripping, that statement sits `directives so far` lines higher.
    const expected: FixtureDiagnostic[] = [];
    original.forEach((line, k) => {
      if (!isDirective(line)) return;
      const removedSoFar = original.slice(0, k + 1).filter(isDirective).length;
      const strippedLine = k + 2 - removedSoFar;
      const pair = EXPECTED_CODES[expected.length];
      expected.push({ Line: strippedLine, Name: pair?.[0] || '?', Code: pair?.[1] || 0 });
    });
    expect(expected).toHaveLength(15);
    expect(expected.map((e) => declaredName(stripped[e.Line - 1] || ''))).toEqual(EXPECTED_CODES.map(([name]) => name));
    expect(compileDiagnostics(stripped.join('\n'))).toEqual(expected);
    expect(compileText(stripped.join('\n')).match(/error TS\d+/g) || []).toHaveLength(15);
  }, 120_000);
});
