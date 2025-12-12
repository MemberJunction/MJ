import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { createViolation, truncateCode } from '../lint-utils';

/**
 * Rule: no-require-statements
 *
 * Ensures that interactive components do not use require() or dynamic import().
 * All dependencies must be passed as props.
 *
 * Severity: critical
 * Applies to: all components
 */
export const noRequireStatementsRule: LintRule = {
  name: 'no-require-statements',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for require() calls
        if (t.isIdentifier(callee) && callee.name === 'require') {
          violations.push(
            createViolation(
              'no-require-statements',
              'critical',
              path.node,
              `Component "${componentName}" contains a require() statement. Interactive components cannot use require - all dependencies must be passed as props.`,
              truncateCode(path.toString())
            )
          );
        }

        // Also check for dynamic import() calls
        if (t.isImport(callee)) {
          violations.push(
            createViolation(
              'no-require-statements',
              'critical',
              path.node,
              `Component "${componentName}" contains a dynamic import() statement. Interactive components cannot use dynamic imports - all dependencies must be passed as props.`,
              truncateCode(path.toString())
            )
          );
        }
      },
    });

    return violations;
  },
};
