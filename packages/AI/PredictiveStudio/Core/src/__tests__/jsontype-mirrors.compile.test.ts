/**
 * The JSONType mirrors in `metadata/entities/JSONType-interfaces/IMLModelJsonTypes.ts` and
 * `IMLModelPublishRecordJsonTypes.ts`, and the `PredictiveStudio.PromoteModel` output's refusal in
 * `metadata/remote-operations/types/predictive-studio-promote-model.output.ts`, equal their Core types: `fixtures/jsontype-mirrors.ts`, compiled with the
 * TypeScript compiler API under this package's options, has no diagnostics. A drifted mirror (one member changed in
 * memory) fails on exactly the assertion for that type, so the check cannot pass vacuously.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(here, 'fixtures/jsontype-mirrors.ts');
const TSCONFIG = resolve(here, '../../tsconfig.json');
const MODELS_MIRROR = resolve(here, '../../../../../../metadata/entities/JSONType-interfaces/IMLModelJsonTypes.ts');
const PUBLISH_MIRROR = resolve(here, '../../../../../../metadata/entities/JSONType-interfaces/IMLModelPublishRecordJsonTypes.ts');
const PROMOTE_OUTPUT_MIRROR = resolve(here, '../../../../../../metadata/remote-operations/types/predictive-studio-promote-model.output.ts');

/** The package's compiler options with emit off; `rootDir` is dropped because the mirrors live outside `src`. */
function compilerOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(TSCONFIG, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n')); },
  });
  if (parsed === undefined) throw new Error(`cannot read ${TSCONFIG}`);
  const { rootDir: _rootDir, ...options } = parsed.options;
  return { ...options, noEmit: true, declaration: false, declarationMap: false, sourceMap: false };
}

/** Compiles the fixture, with any file's text replaced from `overrides`, and returns the formatted diagnostics. */
function compile(overrides: ReadonlyMap<string, string> = new Map()): string {
  const options = compilerOptions();
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = overrides.get(resolve(fileName));
    return text !== undefined
      ? ts.createSourceFile(fileName, text, languageVersion, true)
      : original(fileName, languageVersion, onError, shouldCreate);
  };
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([FIXTURE], options, host));
  return ts.formatDiagnostics(diagnostics, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => here, getNewLine: () => '\n' });
}

/** The fixture's declared mirror names that a compile output reports errors on. */
function failingMirrors(output: string): string[] {
  const lines = readFileSync(FIXTURE, 'utf8').split('\n');
  const found = [...output.matchAll(/jsontype-mirrors\.ts\((\d+),\d+\): error TS\d+/g)].map((m) => {
    const line = lines[Number(m[1]) - 1] || '';
    return /export type (\w+)/.exec(line)?.[1] || line.trim();
  });
  return [...new Set(found)];
}

describe('JSONType mirrors equal their Core types', () => {
  it('compiles with no diagnostics (all eight mirrors equal Core)', () => {
    expect(compile()).toBe('');
  }, 120_000);

  it('fails on exactly the drifted mirror (ML Models: CodeVersion.seed changed)', () => {
    const text = readFileSync(MODELS_MIRROR, 'utf8');
    const drifted = text.replace('readonly seed: number;', 'readonly seed: string;');
    expect(drifted).not.toBe(text);
    expect(failingMirrors(compile(new Map([[MODELS_MIRROR, drifted]])))).toEqual(['MirrorCodeVersion']);
  }, 120_000);

  it('fails on exactly the drifted mirror (Publish Records: an Actor variant dropped)', () => {
    const text = readFileSync(PUBLISH_MIRROR, 'utf8');
    const drifted = text.replace("  | { readonly kind: 'agent'; readonly agentRunId: string }", '');
    expect(drifted).not.toBe(text);
    // Actor is referenced by TransitionRefusal (`Actor['kind']`), so both assertions fail.
    expect(failingMirrors(compile(new Map([[PUBLISH_MIRROR, drifted]])))).toEqual(['MirrorActor', 'MirrorTransitionRefusal']);
  }, 120_000);

  it('fails on exactly the drifted mirror (PromoteModel output: a refusal kind dropped)', () => {
    const text = readFileSync(PROMOTE_OUTPUT_MIRROR, 'utf8');
    const drifted = text.replace("    | { readonly kind: 'reason-required' }\n", '');
    expect(drifted).not.toBe(text);
    expect(failingMirrors(compile(new Map([[PROMOTE_OUTPUT_MIRROR, drifted]])))).toEqual(['MirrorPromoteModelRefusal']);
  }, 120_000);
});
