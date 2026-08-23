import { ComponentFixture } from '@angular/core/testing';
import axe from 'axe-core';

/**
 * Axe rules that CANNOT produce meaningful results under jsdom and are therefore
 * disabled by default for every {@link ExpectNoAxeViolations} call:
 *
 *  - `color-contrast` — needs a real layout/paint engine to resolve effective fore/background
 *    colors; jsdom performs no layout, so the rule either errors or reports garbage.
 *  - `region`, `landmark-one-main`, `page-has-heading-one`, `bypass` — PAGE-level structure
 *    rules ("all content in landmarks", "page has a main landmark / h1 / skip link"). A
 *    component fixture is a fragment, not a page — these belong to the e2e tier
 *    (see `e2e/specs/a11y.spec.ts`), where the full Explorer shell is scanned.
 *
 * Exported so specs (and the e2e tier) can see exactly what the jsdom preset waives.
 */
export const JSDOM_UNSUPPORTED_AXE_RULES: readonly string[] = [
  'color-contrast',
  'region',
  'landmark-one-main',
  'page-has-heading-one',
  'bypass',
];

/** Options for {@link ExpectNoAxeViolations}. */
export interface ExpectNoAxeViolationsOptions {
  /**
   * Extra rule ids to disable FOR THIS CALL, on top of {@link JSDOM_UNSUPPORTED_AXE_RULES}.
   *
   * Reserve this for **known, tracked accessibility debt** in the widget under test —
   * always pair it with an `// A11Y-DEBT:` comment at the call site naming each rule and
   * why it's waived, so the debt is grep-able and the rest of the rule set keeps gating.
   */
  disableRules?: readonly string[];
}

/** One line per violation: id, impact, help text, and the CSS targets of every impacted node. */
function formatViolations(violations: axe.Result[]): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes.map((node) => node.target.join(' ')).join(', ');
      return `  - ${violation.id} [${violation.impact ?? 'unknown impact'}]: ${violation.help}\n      nodes: ${nodes}`;
    })
    .join('\n');
}

/**
 * Run axe-core against a rendered component fixture and FAIL the test if any
 * accessibility violations are found — with a message listing each violation's rule id,
 * impact, and the impacted DOM nodes.
 *
 * The scan uses a jsdom-safe preset ({@link JSDOM_UNSUPPORTED_AXE_RULES}): rules that need a
 * real layout engine (color-contrast) or a full page (landmark/region structure) are
 * disabled, because a jsdom component fragment can never satisfy them honestly. Everything
 * else — labels, alt text, ARIA validity, roles, names — runs at full strength.
 *
 * @example
 * ```ts
 * it('has no axe violations', async () => {
 *   const fixture = renderComponentFixture(MyWidgetComponent, { inputs: { ... } });
 *   await ExpectNoAxeViolations(fixture);
 * });
 *
 * // With tracked debt (widget fix is product work):
 * // A11Y-DEBT: label — the search input has no accessible name (placeholder only).
 * await ExpectNoAxeViolations(fixture, { disableRules: ['label'] });
 * ```
 */
export async function ExpectNoAxeViolations<T>(
  fixture: ComponentFixture<T>,
  options: ExpectNoAxeViolationsOptions = {},
): Promise<void> {
  const disabled = [...JSDOM_UNSUPPORTED_AXE_RULES, ...(options.disableRules ?? [])];
  const rules: { [ruleId: string]: { enabled: boolean } } = {};
  for (const ruleId of disabled) {
    rules[ruleId] = { enabled: false };
  }
  const element = fixture.nativeElement as Element;
  const results = await axe.run(element, { rules });
  if (results.violations.length > 0) {
    throw new Error(
      `Expected no axe accessibility violations, but found ${results.violations.length}:\n` +
        `${formatViolations(results.violations)}\n` +
        `(jsdom preset disables: ${disabled.join(', ')})`,
    );
  }
}
