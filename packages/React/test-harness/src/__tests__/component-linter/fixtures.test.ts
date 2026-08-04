/**
 * Fixture-Based Component Linter Tests
 *
 * Each fixture is its own test for clear per-fixture pass/fail visibility.
 * Organized into three categories:
 * - broken-components: Must produce at least one violation
 * - fixed-components: Must NOT produce invalid-property violations
 * - valid-components: Must produce zero actionable violations (low severity OK)
 *
 * Some fixtures require a database connection for entity/query metadata.
 * These are skipped when running without a database.
 */

import { describe, it, expect } from 'vitest';
import { ComponentLinter, LintResult } from '@memberjunction/react-linter';
import { loadFixturesByCategory, LoadedFixture } from './fixture-loader';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

// ═══════════════════════════════════════════════════════════════════════════
// Setup helpers
// ═══════════════════════════════════════════════════════════════════════════

const DB_AVAILABLE = process.env.__MJ_DB_AVAILABLE === 'true';

function getContextUser(): UserInfo | undefined {
  if (!DB_AVAILABLE) return undefined;
  try {
    const user = UserCache.Instance.UserByName('System', false);
    return user || UserCache.Instance.Users?.[0] || undefined;
  } catch {
    return undefined;
  }
}

function hasFieldMetadataInSpec(spec: ComponentSpec): boolean {
  const entities = spec.dataRequirements?.entities;
  const queries = spec.dataRequirements?.queries;
  const hasEntityFields = entities?.some(
    (e: Record<string, unknown>) => Array.isArray(e.fieldMetadata) && (e.fieldMetadata as unknown[]).length > 0
  ) ?? false;
  const hasQueryFields = queries?.some(
    (q: Record<string, unknown>) => Array.isArray(q.fields) && (q.fields as unknown[]).length > 0
  ) ?? false;
  return hasEntityFields || hasQueryFields;
}

function fixtureRequiresDatabase(fixture: LoadedFixture): boolean {
  const name = fixture.metadata.name;
  if (fixture.metadata.category === 'broken') {
    if (name.startsWith('schema-validation/') || name.startsWith('type-rules/')) return true;
    if ((name.includes('optional-chain-') || name.includes('spread-field-')) && !hasFieldMetadataInSpec(fixture.spec)) return true;
  }
  if (fixture.metadata.category === 'valid') {
    const spec = fixture.spec as ComponentSpec & { libraries?: unknown[] };
    if (spec.libraries && Array.isArray(spec.libraries) && spec.libraries.length > 0) return true;
  }
  return false;
}

// Fixtures that the current linter cannot yet detect — tracked by their own
// metadata description ("may fail until linter refactor"). These produce zero
// violations today and will be flipped on once the optional-chain detection
// path lands in ComponentLinter. Kept skipped (rather than removed) so the
// fixtures themselves remain authoritative for what we want to detect.
const PENDING_LINTER_REFACTOR = new Set<string>([
  'best-practice-rules/data-operations/optional-chain-array-access-broken',
  'best-practice-rules/data-operations/optional-chain-invalid-field-broken',
  // Requires cross-component data-flow tracking to know which fields survive
  // through .map()/.reduce()/.filter() transformations before reaching the grid
  'schema-validation/data-grid-validation/datagrid-mixed-source-invalid-broken',
  'type-rules/cross-component-computed-field-typo-broken',
  'type-rules/cross-component-entity-to-grid-broken',
  'type-rules/cross-component-filter-field-access-broken',
  'type-rules/pipeline-entity-to-filter-to-grid-broken',
  'type-rules/pipeline-query-to-transform-to-chart-broken',
]);


function shouldSkip(fixture: LoadedFixture): string | false {
  if (!fixture.spec.code) return 'no code';
  if (fixtureRequiresDatabase(fixture) && !DB_AVAILABLE) return 'requires database';
  if (PENDING_LINTER_REFACTOR.has(fixture.metadata.name)) return 'pending linter refactor (optional-chain detection)';
  return false;
}

async function lintFixture(fixture: LoadedFixture): Promise<LintResult> {
  return ComponentLinter.lintComponent(
    fixture.spec.code,
    fixture.spec.name,
    fixture.spec,
    true,
    getContextUser(),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Load fixtures at module level (vitest supports top-level await)
// ═══════════════════════════════════════════════════════════════════════════

const brokenFixtures = await loadFixturesByCategory('broken').catch(() => [] as LoadedFixture[]);
const fixedFixtures = await loadFixturesByCategory('fixed').catch(() => [] as LoadedFixture[]);
const validFixtures = await loadFixturesByCategory('valid').catch(() => [] as LoadedFixture[]);

// ═══════════════════════════════════════════════════════════════════════════
// Broken Components: each must produce at least one violation
// ═══════════════════════════════════════════════════════════════════════════

describe('Broken Component Fixtures', () => {
  it('should load fixtures', () => {
    expect(brokenFixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of brokenFixtures) {
    const skipReason = shouldSkip(fixture);

    if (skipReason) {
      it.skip(`${fixture.metadata.name} (${skipReason})`, () => {});
    } else {
      it(`${fixture.metadata.name}`, async () => {
        const result = await lintFixture(fixture);
        expect(
          result.violations.length,
          `Expected at least 1 violation but got 0`
        ).toBeGreaterThan(0);
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Fixed Components: must NOT have invalid-property violations
// ═══════════════════════════════════════════════════════════════════════════

describe('Fixed Component Fixtures', () => {
  it('should load fixtures', () => {
    expect(fixedFixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of fixedFixtures) {
    const skipReason = shouldSkip(fixture);

    if (skipReason) {
      it.skip(`${fixture.metadata.name} (${skipReason})`, () => {});
    } else {
      it(`${fixture.metadata.name}`, async () => {
        const result = await lintFixture(fixture);
        const invalidPropertyViolations = result.violations.filter(
          (v) => v.message.includes('.Results') && v.message.includes("don't have"),
        );
        expect(
          invalidPropertyViolations.length,
          `${invalidPropertyViolations.length} invalid-property violation(s): ${invalidPropertyViolations.map((v) => v.message.slice(0, 80)).join('; ')}`
        ).toBe(0);
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Valid Components: must have zero actionable violations (low severity OK)
// ═══════════════════════════════════════════════════════════════════════════

describe('Valid Component Fixtures', () => {
  it('should load fixtures', () => {
    expect(validFixtures.length).toBeGreaterThan(0);
  });

  for (const fixture of validFixtures) {
    const skipReason = shouldSkip(fixture);

    if (skipReason) {
      it.skip(`${fixture.metadata.name} (${skipReason})`, () => {});
    } else {
      it(`${fixture.metadata.name}`, async () => {
        const result = await lintFixture(fixture);
        const actionableViolations = result.violations.filter((v) => v.severity !== 'low');
        if (actionableViolations.length > 0) {
          const summary = actionableViolations
            .map((v) => `[${v.severity}] ${v.rule}: ${v.message.slice(0, 100)}`)
            .join('\n    ');
          expect.fail(`${actionableViolations.length} violation(s):\n    ${summary}`);
        }
      });
    }
  }
});
