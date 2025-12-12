import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Helper function to extract function name from a NodePath
 */
function getFunctionName(path: NodePath): string | null {
  const node = path.node;

  // Check for named function
  if (t.isFunctionDeclaration(node) && node.id) {
    return node.id.name;
  }

  // Check for arrow function assigned to variable
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    const parent = path.parent;
    if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
      return parent.id.name;
    }
  }

  // Check for function assigned as property
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    const parent = path.parent;
    if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) {
      return parent.key.name;
    }
  }

  return null;
}

/**
 * Rule: server-reload-on-client-operation
 *
 * Detects when components reload data from the server during sort/filter operations.
 * These operations should be performed client-side using useMemo for better performance.
 *
 * Severity: critical
 * Applies to: all components
 */
export const serverReloadOnClientOperationRule: LintRule = {
  name: 'server-reload-on-client-operation',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Look for data loading functions
        if (t.isIdentifier(callee) && (callee.name.includes('load') || callee.name.includes('fetch'))) {
          // Check if it's called in sort/filter handlers
          let funcParent = path.getFunctionParent();
          if (funcParent) {
            const funcName = getFunctionName(funcParent);
            if (
              funcName &&
              (funcName.includes('Sort') || funcName.includes('Filter') || funcName.includes('handleSort') || funcName.includes('handleFilter'))
            ) {
              violations.push({
                rule: 'server-reload-on-client-operation',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: 'Reloading data from server on sort/filter. Use useMemo for client-side operations.',
                code: `${funcName} calls ${callee.name}`,
              });
            }
          }
        }
      },
    });

    return violations;
  },
};
