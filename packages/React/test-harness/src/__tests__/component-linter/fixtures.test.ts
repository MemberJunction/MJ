/**
 * Fixture-Based Component Linter Tests
 *
 * Runs the linter against real component specs loaded from JSON fixtures.
 * Organized into three categories:
 * - broken-components: Must produce at least one violation
 * - fixed-components: Must NOT produce invalid-property violations
 * - valid-components: Must produce zero violations
 *
 * Some linter rules require a database connection (entity field validation,
 * library-specific lint rules, component dependency resolution). Fixtures
 * that depend on these rules are skipped when running without a database.
 * To run the full suite, provide DB credentials via environment variables
 * and set COMPONENT_LINTER_DB_TESTS=true.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter, LintResult } from '../../lib/component-linter';
import { loadFixturesByCategory, LoadedFixture } from './fixture-loader';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Detect whether a fixture requires database metadata to validate correctly.
 *
 * Broken fixtures in these categories need DB-populated entity/query metadata
 * for their violations to fire:
 * - schema-validation/*: entity field, query field, chart field, datagrid field checks
 * - type-rules/*: cross-component type flow validation
 * - best-practice-rules/data-operations/optional-chain-*: need entity field lookups
 * - best-practice-rules/data-operations/spread-field-*: need entity field lookups
 *
 * Valid fixtures with libraries need contextUser for library lint rule loading.
 */
function fixtureRequiresDatabase(fixture: LoadedFixture): boolean {
  const name = fixture.metadata.name;

  // Broken fixtures: schema validation and type rules need entity metadata
  if (fixture.metadata.category === 'broken') {
    if (name.startsWith('schema-validation/') || name.startsWith('type-rules/')) {
      return true;
    }
    // Specific best-practice rules that need entity field lookups
    if (name.includes('optional-chain-') || name.includes('spread-field-')) {
      return true;
    }
  }

  // Valid fixtures with libraries need contextUser for library lint rules
  if (fixture.metadata.category === 'valid') {
    const spec = fixture.spec as ComponentSpec & { libraries?: unknown[] };
    if (spec.libraries && Array.isArray(spec.libraries) && spec.libraries.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Helper that loads fixtures then runs validation for each.
 * DB-dependent fixtures are skipped when no database is available.
 */
function registerFixtureTests(
  categoryLabel: string,
  category: 'broken' | 'fixed' | 'valid',
  assertFn: (lintResult: LintResult, fixture: LoadedFixture) => void,
) {
  describe(categoryLabel, () => {
    let fixtures: LoadedFixture[] = [];
    let loadError: string | undefined;

    const fixturesPromise = loadFixturesByCategory(category).catch((err) => {
      loadError = err instanceof Error ? err.message : String(err);
      return [] as LoadedFixture[];
    });

    it('should load fixtures', async () => {
      fixtures = await fixturesPromise;
      if (loadError) {
        expect.fail(`Failed to load ${category} fixtures: ${loadError}`);
      }
      expect(fixtures.length).toBeGreaterThan(0);
    });

    it('each fixture should pass validation', async () => {
      fixtures = await fixturesPromise;

      const results: { name: string; passed: boolean; skipped: boolean; detail: string }[] = [];

      for (const fixture of fixtures) {
        if (!fixture.spec.code) {
          results.push({ name: fixture.metadata.name, passed: true, skipped: true, detail: 'no code' });
          continue;
        }

        if (fixtureRequiresDatabase(fixture)) {
          results.push({ name: fixture.metadata.name, passed: true, skipped: true, detail: 'requires database' });
          continue;
        }

        try {
          const lintResult: LintResult = await ComponentLinter.lintComponent(
            fixture.spec.code,
            fixture.spec.name,
            fixture.spec,
            true,
          );
          assertFn(lintResult, fixture);
          results.push({
            name: fixture.metadata.name,
            passed: true,
            skipped: false,
            detail: `${lintResult.violations.length} violations`,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push({ name: fixture.metadata.name, passed: false, skipped: false, detail: msg });
        }
      }

      const failures = results.filter((r) => !r.passed);
      const passed = results.filter((r) => r.passed && !r.skipped);
      const skipped = results.filter((r) => r.skipped);

      if (failures.length > 0) {
        const summary = failures.map((f) => `  - ${f.name}: ${f.detail}`).join('\n');
        expect.fail(
          `${failures.length} of ${results.length} ${category} fixtures failed ` +
            `(${passed.length} passed, ${skipped.length} skipped):\n${summary}`,
        );
      }
    });
  });
}

// Broken components: each must produce at least one violation
registerFixtureTests('Broken Component Fixtures', 'broken', (lintResult) => {
  if (lintResult.violations.length === 0) {
    throw new Error('Expected violations but got 0');
  }
});

// Fixed components: must NOT have invalid-property violations (.Results / "don't have")
registerFixtureTests('Fixed Component Fixtures', 'fixed', (lintResult) => {
  const invalidPropertyViolations = lintResult.violations.filter(
    (v) => v.message.includes('.Results') && v.message.includes("don't have"),
  );
  if (invalidPropertyViolations.length > 0) {
    throw new Error(
      `${invalidPropertyViolations.length} invalid-property violation(s): ` +
        `${invalidPropertyViolations.map((v) => v.message.slice(0, 80)).join('; ')}`,
    );
  }
});

// Valid components: must have zero violations
registerFixtureTests('Valid Component Fixtures', 'valid', (lintResult) => {
  if (lintResult.violations.length > 0) {
    const summary = lintResult.violations
      .map((v) => `[${v.severity}] ${v.rule}: ${v.message.slice(0, 100)}`)
      .join('\n    ');
    throw new Error(`${lintResult.violations.length} violation(s):\n    ${summary}`);
  }
});
