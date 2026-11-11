/**
 * The status-union parity case's compile-time leg, run by a gate. This package's `tsconfig.json` excludes
 * `__tests__`, so an `expectTypeOf` in a test file is never type-checked; instead `fixtures/status-union-parity.ts` is
 * compiled here with the TypeScript compiler API under the package's options and must have no diagnostics. A drifted
 * union (one member changed in memory) fails on exactly that assertion, so the check cannot pass vacuously.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/status-union-parity.ts');
const TSCONFIG = resolve(here, '../../tsconfig.json');
const COMPILE_TIMEOUT_MS = 120_000;

/** The package's compiler options with emit off. */
function compilerOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(TSCONFIG, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); },
  });
  if (parsed === undefined) throw new Error(`cannot read ${TSCONFIG}`);
  return { ...parsed.options, noEmit: true, declaration: false, declarationMap: false, sourceMap: false };
}

/** Compiles the fixture, with its text replaced by `fixtureText` when given, and returns the formatted diagnostics. */
function compile(fixtureText?: string): string {
  const options = compilerOptions();
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    fixtureText !== undefined && resolve(fileName) === FIXTURE
      ? ts.createSourceFile(fileName, fixtureText, languageVersion, true)
      : original(fileName, languageVersion, onError, shouldCreate);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([FIXTURE], options, host));
  return ts.formatDiagnostics(diagnostics, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => here, getNewLine: () => '\n' });
}

describe("Core's PersistedModelStatus equals the generated MJMLModelEntity['Status']", () => {
  it('compiles with no diagnostics', () => {
    expect(compile()).toBe('');
  }, COMPILE_TIMEOUT_MS);

  it('fails on the parity assertion when Core gains a member the entity lacks', () => {
    const text = readFileSync(FIXTURE, 'utf8');
    const drifted = text.replace('Equal<PersistedModelStatus,', "Equal<PersistedModelStatus | 'Shipped',");
    expect(drifted).not.toBe(text);
    const output = compile(drifted);
    expect(output).toMatch(/status-union-parity\.ts\(\d+,\d+\): error TS2344/);
  }, COMPILE_TIMEOUT_MS);
});
