import * as t from '@babel/types';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentExecutionOptions } from './component-runner';
import { Violation } from './component-linter';

/**
 * Interface for lint rules in the component linter system.
 * All lint rules must implement this interface to be used by the RuleRegistry.
 */
export interface LintRule {
  /**
   * Unique name of the rule (e.g., 'no-import-statements')
   */
  name: string;

  /**
   * Scope where this rule applies:
   * - 'all': Applies to all components (root and child)
   * - 'child': Only applies to child components
   * - 'root': Only applies to root components
   */
  appliesTo: 'all' | 'child' | 'root';

  /**
   * Whether this rule is deprecated and should be phased out
   * @deprecated Phase 3: Mark rules as deprecated during transition
   */
  deprecated?: boolean;

  /**
   * Test function that analyzes the AST and returns violations.
   *
   * @param ast - The parsed Babel AST of the component code
   * @param componentName - Name of the component being linted
   * @param componentSpec - Optional component specification with metadata
   * @param options - Optional execution options for the component
   * @returns Array of violations found by this rule
   */
  test: (
    ast: t.File,
    componentName: string,
    componentSpec?: ComponentSpec,
    options?: ComponentExecutionOptions
  ) => Violation[];
}
