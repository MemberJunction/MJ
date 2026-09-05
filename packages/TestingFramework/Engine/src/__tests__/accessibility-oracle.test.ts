/**
 * Unit tests for AccessibilityOracle
 */

import { AccessibilityOracle, AccessibilityScanOutput, AccessibilityViolation } from '../oracles/AccessibilityOracle';
import type { OracleInput, OracleResult } from '../types';
import type { UserInfo } from '@memberjunction/core';

/**
 * Helper to build a minimal OracleInput. The oracle only reads actualOutput,
 * so the entity/user fields can be inert placeholders (same idiom as the
 * Computer-Use oracle tests).
 */
function buildInput(actualOutput?: unknown): OracleInput {
  return {
    test: {} as OracleInput['test'], // oracle doesn't inspect the test entity
    actualOutput,
    contextUser: {} as UserInfo // oracle doesn't inspect contextUser
  };
}

function violation(overrides: Partial<AccessibilityViolation> = {}): AccessibilityViolation {
  return {
    ruleId: 'label',
    impact: 'critical',
    wcagTags: ['wcag2a', 'wcag412'],
    description: 'Form element does not have a label',
    selectors: ['input.mj-forms-field-input'],
    pageUrl: '/app/records/users',
    ...overrides
  };
}

function scan(violations: AccessibilityViolation[], extra: Partial<AccessibilityScanOutput> = {}): AccessibilityScanOutput {
  return { violations, ...extra };
}

/** Type-safe accessor for oracle-specific details */
function details(result: OracleResult): Record<string, unknown> {
  return (result.details ?? {}) as Record<string, unknown>;
}

describe('AccessibilityOracle', () => {
  let oracle: AccessibilityOracle;

  beforeEach(() => {
    oracle = new AccessibilityOracle();
  });

  it('exposes the "accessibility" oracle type', () => {
    expect(oracle.type).toBe('accessibility');
  });

  describe('input validation', () => {
    it('fails when actualOutput is missing', async () => {
      const result = await oracle.evaluate(buildInput(undefined), {});
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.message).toContain('No accessibility scan output');
    });

    it('fails when actualOutput has no violations array', async () => {
      const result = await oracle.evaluate(buildInput({ notViolations: [] }), {});
      expect(result.passed).toBe(false);
      expect(result.message).toContain('No accessibility scan output');
    });

    it('skips malformed violation entries rather than erroring', async () => {
      const result = await oracle.evaluate(
        buildInput({ violations: [null, 42, { impact: 'critical' }, violation()] }),
        {}
      );
      expect(details(result).totalViolations).toBe(1);
    });

    it('normalizes unknown impact strings to moderate', async () => {
      const result = await oracle.evaluate(
        buildInput({ violations: [violation({ impact: 'catastrophic' as AccessibilityViolation['impact'] })] }),
        {}
      );
      const bySeverity = details(result).bySeverity as Record<string, number>;
      expect(bySeverity.moderate).toBe(1);
    });
  });

  describe('severity gating', () => {
    it('passes a clean scan', async () => {
      const result = await oracle.evaluate(buildInput(scan([])), {});
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('fails on a critical violation by default', async () => {
      const result = await oracle.evaluate(buildInput(scan([violation({ impact: 'critical' })])), {});
      expect(result.passed).toBe(false);
      expect(result.score).toBeLessThan(1);
    });

    it('fails on a serious violation by default', async () => {
      const result = await oracle.evaluate(buildInput(scan([violation({ impact: 'serious' })])), {});
      expect(result.passed).toBe(false);
    });

    it('passes moderate/minor violations by default (not in failOn)', async () => {
      const result = await oracle.evaluate(
        buildInput(scan([violation({ impact: 'moderate' }), violation({ impact: 'minor' })])),
        {}
      );
      expect(result.passed).toBe(true);
      expect(details(result).totalViolations).toBe(2);
      expect(details(result).gatingViolations).toBe(0);
    });

    it('honors a custom failOn list', async () => {
      const result = await oracle.evaluate(
        buildInput(scan([violation({ impact: 'minor' })])),
        { failOn: ['minor'] }
      );
      expect(result.passed).toBe(false);
    });

    it('ignores invalid failOn values and falls back to the default gate', async () => {
      const result = await oracle.evaluate(
        buildInput(scan([violation({ impact: 'critical' })])),
        { failOn: ['bogus'] }
      );
      expect(result.passed).toBe(false); // critical still gates via fallback
    });
  });

  describe('thresholds and allowlist', () => {
    it('tolerates violations up to maxViolations', async () => {
      const result = await oracle.evaluate(
        buildInput(scan([violation(), violation({ ruleId: 'button-name' })])),
        { maxViolations: 2 }
      );
      expect(result.passed).toBe(true);
    });

    it('fails once maxViolations is exceeded', async () => {
      const result = await oracle.evaluate(
        buildInput(scan([violation(), violation({ ruleId: 'button-name' }), violation({ ruleId: 'image-alt' })])),
        { maxViolations: 2 }
      );
      expect(result.passed).toBe(false);
    });

    it('suppresses allowedRules entirely and reports the suppression count', async () => {
      const result = await oracle.evaluate(
        buildInput(scan([violation({ ruleId: 'color-contrast' }), violation({ ruleId: 'label' })])),
        { allowedRules: ['color-contrast'] }
      );
      expect(details(result).totalViolations).toBe(1);
      expect(details(result).allowedRuleSuppressions).toBe(1);
      expect(result.passed).toBe(false); // 'label' still gates
    });
  });

  describe('scoring and details', () => {
    it('decays score linearly with gating violations', async () => {
      const five = Array.from({ length: 5 }, (_, i) => violation({ ruleId: `rule-${i}` }));
      const result = await oracle.evaluate(buildInput(scan(five)), {});
      expect(result.score).toBeCloseTo(0.5);
    });

    it('floors the score at 0', async () => {
      const many = Array.from({ length: 25 }, (_, i) => violation({ ruleId: `rule-${i}` }));
      const result = await oracle.evaluate(buildInput(scan(many)), {});
      expect(result.score).toBe(0);
    });

    it('caps reported selectors at 5 per violation and passes through scan metadata', async () => {
      const wide = violation({ selectors: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
      const result = await oracle.evaluate(
        buildInput(scan([wide], { scannedPages: ['/home'], passedRuleCount: 42 })),
        {}
      );
      const reported = details(result).violations as Array<{ selectors: string[] }>;
      expect(reported[0].selectors).toHaveLength(5);
      expect(details(result).scannedPages).toEqual(['/home']);
      expect(details(result).passedRuleCount).toBe(42);
    });
  });
});
