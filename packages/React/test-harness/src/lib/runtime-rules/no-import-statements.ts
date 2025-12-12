import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { createViolation, truncateCode } from '../lint-utils';
import { RuleRegistry } from '../rule-registry';

/**
 * Rule: no-import-statements
 *
 * Ensures that interactive components do not contain import statements.
 * All dependencies must be passed as props (utilities, components, styles).
 *
 * Severity: critical
 * Applies to: all components
 */
export const noImportStatementsRule: LintRule = {
  name: 'no-import-statements',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        violations.push(
          createViolation(
            'no-import-statements',
            'critical',
            path.node,
            `Component "${componentName}" contains an import statement. Interactive components cannot use import statements - all dependencies must be passed as props.`,
            truncateCode(path.toString())
          )
        );
      },
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(noImportStatementsRule);
