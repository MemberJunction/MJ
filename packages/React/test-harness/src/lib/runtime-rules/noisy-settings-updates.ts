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
 * Rule: noisy-settings-updates
 *
 * Prevents saving settings on every change/keystroke. Settings should only be
 * saved on blur, submit, or after debouncing to avoid excessive updates.
 *
 * Severity: critical
 * Applies to: all components
 */
export const noisySettingsUpdatesRule: LintRule = {
  name: 'noisy-settings-updates',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        // Check for onSaveUserSettings calls
        if (t.isOptionalCallExpression(path.node) || t.isCallExpression(path.node)) {
          const callee = path.node.callee;
          if (t.isIdentifier(callee) && callee.name === 'onSaveUserSettings') {
            // Check if this is inside an onChange/onInput handler
            let parent = path.getFunctionParent();
            if (parent) {
              const funcName = getFunctionName(parent);
              if (funcName && (funcName.includes('Change') || funcName.includes('Input'))) {
                // Check if it's not debounced or on blur
                const parentBody = parent.node.body;
                const hasDebounce = parentBody && parentBody.toString().includes('debounce');
                const hasTimeout = parentBody && parentBody.toString().includes('setTimeout');

                if (!hasDebounce && !hasTimeout) {
                  violations.push({
                    rule: 'noisy-settings-updates',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Saving settings on every change/keystroke. Save on blur, submit, or after debouncing.`,
                  });
                }
              }
            }
          }
        }
      },
    });

    return violations;
  },
};
