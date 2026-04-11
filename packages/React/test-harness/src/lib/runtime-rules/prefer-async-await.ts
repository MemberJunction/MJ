import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';

/**
 * Rule: prefer-async-await
 *
 * Encourages the use of async/await over .then() chains for better readability.
 *
 * Severity: low
 * Applies to: all components
 */
export const preferAsyncAwaitRule: LintRule = {
  name: 'prefer-async-await',
  appliesTo: 'all',
  test: (ast: t.File, componentName: string) => {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for .then() chains
        if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && callee.property.name === 'then') {
          // Try to get the context of what's being chained
          let context = '';
          if (t.isMemberExpression(callee.object)) {
            context = ' Consider using async/await for cleaner code.';
          }

          violations.push({
            rule: 'prefer-async-await',
            severity: 'low',
            line: callee.property.loc?.start.line || 0,
            column: callee.property.loc?.start.column || 0,
            message: `Prefer async/await over .then() chains for better readability.${context}`,
            code: '.then(result => ...) → const result = await ...',
          });
        }
      },
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(preferAsyncAwaitRule);
