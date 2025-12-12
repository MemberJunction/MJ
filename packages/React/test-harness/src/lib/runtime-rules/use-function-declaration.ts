import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { createViolation, truncateCode } from '../lint-utils';

/**
 * Rule: use-function-declaration
 *
 * Ensures that components use function declaration syntax instead of
 * arrow functions or function expressions.
 *
 * Severity: critical
 * Applies to: all components
 */
export const useFunctionDeclarationRule: LintRule = {
  name: 'use-function-declaration',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        // Only check TOP-LEVEL declarations (not nested inside functions)
        // This prevents flagging arrow functions inside the component
        const isTopLevel = path.getFunctionParent() === null || path.scope.path.type === 'Program';

        if (!isTopLevel) {
          return; // Skip non-top-level declarations
        }

        // Check if this is the main component being defined as arrow function
        if (t.isIdentifier(path.node.id) && path.node.id.name === componentName) {
          const init = path.node.init;

          // Check if it's an arrow function
          if (t.isArrowFunctionExpression(init)) {
            violations.push(
              createViolation(
                'use-function-declaration',
                'critical',
                path.node,
                `Component "${componentName}" must be defined using function declaration syntax, not arrow function.`,
                truncateCode(path.toString(), 150)
              )
            );
          }
        }

        // Also check for any other TOP-LEVEL component-like arrow functions (starts with capital letter)
        // But ONLY at the top level, not inside the component
        if (t.isIdentifier(path.node.id) && /^[A-Z]/.test(path.node.id.name)) {
          const init = path.node.init;
          if (t.isArrowFunctionExpression(init)) {
            // Only flag if it's at the top level (parallel to main component)
            violations.push(
              createViolation(
                'use-function-declaration',
                'high',
                path.node,
                `Top-level component "${path.node.id.name}" should use function declaration syntax.`,
                truncateCode(path.toString(), 150)
              )
            );
          }
        }
      },
    });

    return violations;
  },
};
