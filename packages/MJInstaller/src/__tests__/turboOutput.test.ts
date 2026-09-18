import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyTurboFailures } from '../util/turboOutput.js';

/** Tolerated set used by DependencyPhase. */
const DEPENDENCY_TOLERATED = [
  'mj_generatedentities',
  'mj_generatedactions',
  'ng-core-entity-forms',
  'server-bootstrap-lite',
  'server-bootstrap',
  'ng-bootstrap',
] as const;

/** Tolerated set used by CodeGenPhase — deliberately excludes the generated packages. */
const CODEGEN_TOLERATED = [
  'ng-core-entity-forms',
  'server-bootstrap-lite',
  'server-bootstrap',
  'ng-bootstrap',
] as const;

const ESC = '';

describe('classifyTurboFailures', () => {
  it("reads every package from turbo's single comma-separated summary line", () => {
    const output = [
      ' Tasks:    0 successful, 3 total',
      'Cached:    0 cached, 3 total',
      '  Time:    169ms',
      'Failed:    mj_generatedactions#build, mj_generatedentities#build, mj_api#build',
    ].join('\n');

    const verdict = classifyTurboFailures(output, DEPENDENCY_TOLERATED);

    expect(verdict.FailedPackages).toEqual(['mj_generatedactions', 'mj_generatedentities', 'mj_api']);
  });

  it('does not tolerate a real failure riding behind a codegen-managed one', () => {
    // Regression guard for #4562: the old regex captured only the first name,
    // so mj_api's failure was swallowed and the install reported success.
    const verdict = classifyTurboFailures('Failed:    mj_generatedactions#build, mj_api#build', DEPENDENCY_TOLERATED);

    expect(verdict.Attributable).toBe(true);
    expect(verdict.ToleratedOnly).toBe(false);
  });

  it('reaches the same verdict regardless of the order turbo lists failures', () => {
    const forward = classifyTurboFailures('Failed:    mj_generatedactions#build, mj_api#build', DEPENDENCY_TOLERATED);
    const reverse = classifyTurboFailures('Failed:    mj_api#build, mj_generatedactions#build', DEPENDENCY_TOLERATED);

    expect(forward.ToleratedOnly).toBe(reverse.ToleratedOnly);
    expect([...forward.FailedPackages].sort()).toEqual([...reverse.FailedPackages].sort());
  });

  it('strips the SGR escapes turbo emits when FORCE_COLOR is set', () => {
    // Regression guard for #4562. This is the real byte sequence captured from a
    // failing `mj install` run, with the installer's own indentation wrapper.
    const output =
      `${ESC}[2m    ${ESC}[1mFailed:    ${ESC}[31m${ESC}[1mmj_generatedactions#build${ESC}[0m, ` +
      `${ESC}[31m${ESC}[1mmj_generatedentities#build${ESC}[0m${ESC}[0m${ESC}[22m`;

    const verdict = classifyTurboFailures(output, DEPENDENCY_TOLERATED);

    expect(verdict.FailedPackages).toEqual(['mj_generatedactions', 'mj_generatedentities']);
    expect(verdict.ToleratedOnly).toBe(true);
  });

  it('handles scoped package names', () => {
    const output = 'Failed:    @memberjunction/ng-core-entity-forms#build, @memberjunction/server-bootstrap#build';

    const verdict = classifyTurboFailures(output, DEPENDENCY_TOLERATED);

    expect(verdict.FailedPackages).toEqual([
      '@memberjunction/ng-core-entity-forms',
      '@memberjunction/server-bootstrap',
    ]);
    expect(verdict.ToleratedOnly).toBe(true);
  });

  it('handles CRLF line endings', () => {
    const verdict = classifyTurboFailures(
      'Failed:    mj_generatedactions#build, mj_generatedentities#build\r\n',
      DEPENDENCY_TOLERATED
    );

    expect(verdict.FailedPackages).toEqual(['mj_generatedactions', 'mj_generatedentities']);
  });

  it('deduplicates a package named on more than one summary line', () => {
    const output = ['Failed:    mj_generatedactions#build', 'Failed:    mj_generatedactions#build'].join('\n');

    expect(classifyTurboFailures(output, DEPENDENCY_TOLERATED).FailedPackages).toEqual(['mj_generatedactions']);
  });

  it('reports a failure it cannot attribute rather than tolerating it', () => {
    const verdict = classifyTurboFailures(' ERROR  run failed: command  exited (2)', DEPENDENCY_TOLERATED);

    expect(verdict.FailedPackages).toEqual([]);
    expect(verdict.Attributable).toBe(false);
    expect(verdict.ToleratedOnly).toBe(false);
  });

  it('honours a caller-specific tolerated set', () => {
    // CodeGenPhase's rebuild does not tolerate the generated packages.
    const output = 'Failed:    mj_generatedactions#build';

    expect(classifyTurboFailures(output, DEPENDENCY_TOLERATED).ToleratedOnly).toBe(true);
    expect(classifyTurboFailures(output, CODEGEN_TOLERATED).ToleratedOnly).toBe(false);
  });
});

describe('no phase re-implements turbo parsing', () => {
  // Two copies of this parser drifted apart and both were wrong in different
  // ways (#4562): DependencyPhase's accepted unscoped names, CodeGenPhase's
  // required a leading `@` and so could never match mj_generatedentities.
  // One decision, one place.
  const phaseSource = (name: string) =>
    readFileSync(fileURLToPath(new URL(`../phases/${name}`, import.meta.url)), 'utf8');

  it.each(['DependencyPhase.ts', 'CodeGenPhase.ts'])('%s does not define its own Failed: regex', (name) => {
    expect(phaseSource(name)).not.toMatch(/\/Failed:/);
  });
});
