/**
 * Skip-With-Warning Tests
 *
 * Verifies that the linter produces LOW severity warnings (not actionable violations)
 * when metadata is unavailable for entities, queries, or child component properties.
 * These are valid components that work correctly at runtime — the linter simply cannot
 * verify field/prop access without metadata, so it emits informational warnings.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter, LintResult } from '../../lib/component-linter';
import { loadFixture } from './fixture-loader';

describe('Skip-with-warning behavior', () => {
  it('should warn when entity metadata is unavailable', async () => {
    const fixture = await loadFixture('valid', 'no-metadata-entity');
    const result: LintResult = await ComponentLinter.lintComponent(
      fixture.spec.code,
      fixture.spec.name,
      fixture.spec,
      true,
    );

    const lowWarnings = result.violations.filter(v => v.severity === 'low');
    const highViolations = result.violations.filter(v => v.severity === 'high' || v.severity === 'critical');

    expect(highViolations.length).toBe(0);
    expect(lowWarnings.some(w =>
      w.rule === 'entity-field-access-validation' &&
      w.message.includes('entity metadata not available')
    )).toBe(true);
  });

  it('should warn when query field metadata is unavailable', async () => {
    const fixture = await loadFixture('valid', 'no-metadata-query');
    const result: LintResult = await ComponentLinter.lintComponent(
      fixture.spec.code,
      fixture.spec.name,
      fixture.spec,
      true,
    );

    const lowWarnings = result.violations.filter(v => v.severity === 'low');
    const highViolations = result.violations.filter(v => v.severity === 'high' || v.severity === 'critical');

    expect(highViolations.length).toBe(0);
    expect(lowWarnings.some(w =>
      w.rule === 'query-result-field-access-validation' &&
      w.message.includes('query field metadata not available')
    )).toBe(true);
  });

  it('should warn when dependency property metadata is unavailable', async () => {
    const fixture = await loadFixture('valid', 'no-metadata-dependency');
    const result: LintResult = await ComponentLinter.lintComponent(
      fixture.spec.code,
      fixture.spec.name,
      fixture.spec,
      true,
    );

    const lowWarnings = result.violations.filter(v => v.severity === 'low');
    const highViolations = result.violations.filter(v => v.severity === 'high' || v.severity === 'critical');

    expect(highViolations.length).toBe(0);
    expect(lowWarnings.some(w =>
      w.rule === 'child-component-prop-validation' &&
      w.message.includes('no property metadata available')
    )).toBe(true);
  });
});
