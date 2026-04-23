import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentExecutionOptions } from './component-runner';
import { Violation } from './component-linter';
import { TypeContext } from './type-context';

/**
 * Base class for all component linter rules.
 *
 * Rules extend this class and decorate with `@RegisterClass(BaseLintRule, 'rule-name')`
 * to be automatically discovered by the linter via MJGlobal's ClassFactory.
 *
 * External packages (e.g., Skip-Brain) can define custom rules by extending this class
 * and registering them — the linter will discover them at runtime through the manifest system.
 *
 * @example
 * ```typescript
 * import { BaseLintRule } from '@memberjunction/react-test-harness';
 * import { RegisterClass } from '@memberjunction/global';
 *
 * @RegisterClass(BaseLintRule, 'my-custom-rule')
 * export class MyCustomRule extends BaseLintRule {
 *   Name = 'my-custom-rule';
 *   AppliesTo = 'all' as const;
 *
 *   Test(ast, componentName) {
 *     const violations = [];
 *     // ... your validation logic
 *     return violations;
 *   }
 * }
 * ```
 */
@RegisterClass(BaseLintRule)
export abstract class BaseLintRule {
  /**
   * Unique name of the rule (e.g., 'no-import-statements').
   * Must match the key used in @RegisterClass(BaseLintRule, 'rule-name').
   */
  abstract get Name(): string;

  /**
   * Scope where this rule applies:
   * - 'all': Applies to all components (root and child)
   * - 'child': Only applies to child components
   * - 'root': Only applies to root components
   */
  abstract get AppliesTo(): 'all' | 'child' | 'root';

  /**
   * Test function that analyzes the AST and returns violations.
   *
   * @param ast - The parsed Babel AST of the component code
   * @param componentName - Name of the component being linted
   * @param componentSpec - Optional component specification with metadata
   * @param options - Optional execution options for the component
   * @param typeContext - Optional shared type context with inferred variable types,
   *   entity/query field metadata, and callback parameter types
   * @returns Array of violations found by this rule
   */
  abstract Test(
    ast: t.File,
    componentName: string,
    componentSpec?: ComponentSpec,
    options?: ComponentExecutionOptions,
    typeContext?: TypeContext
  ): Violation[];
}

/**
 * Legacy interface — kept for backward compatibility during migration.
 * New rules should extend BaseLintRule instead.
 * @deprecated Use BaseLintRule class with @RegisterClass decorator
 */
export interface LintRule {
  name: string;
  appliesTo: 'all' | 'child' | 'root';
  deprecated?: boolean;
  test: (
    ast: t.File,
    componentName: string,
    componentSpec?: ComponentSpec,
    options?: ComponentExecutionOptions,
    typeContext?: TypeContext
  ) => Violation[];
}
