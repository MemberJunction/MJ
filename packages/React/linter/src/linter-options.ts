import type { UserInfo } from '@memberjunction/core';
import type {
  ComponentSpec,
  ComponentUtilities,
  SimpleEntityInfo,
} from '@memberjunction/interactive-component-types';

/**
 * Options accepted by the linter and individual lint rules at runtime.
 *
 * This is a strict subset of the fields the linter actually reads — the
 * companion `@memberjunction/react-test-harness` package extends this
 * interface with browser-execution-specific fields (Playwright timeouts,
 * onPageReady callbacks, etc.) that are irrelevant to static analysis.
 *
 * Keeping the linter's surface narrow avoids dragging Playwright-shaped
 * options into server-side action callers that only want static checks.
 */
export interface LinterOptions {
  /** Component spec being analyzed (linter walks `code`, `dataRequirements`, etc.). */
  componentSpec?: ComponentSpec;

  /** Auth/context — required by rules that resolve entity metadata. */
  contextUser?: UserInfo;

  /**
   * Optional array of entity metadata providing complete field lists per entity.
   * Used by the linter to validate field usage with two-tier severity:
   * - Medium: Field exists in entity but not declared in dataRequirements
   * - Critical: Field does not exist in entity at all
   *
   * If not provided, linter only checks against dataRequirements.fieldMetadata
   * which may cause false-positive critical errors for valid but undeclared fields.
   */
  entityMetadata?: SimpleEntityInfo[];

  /**
   * Runtime utility hub forwarded to rules that need live metadata access
   * (e.g. utilities.md.Entities). Optional — rules guard against absence.
   */
  utilities?: ComponentUtilities;
}
