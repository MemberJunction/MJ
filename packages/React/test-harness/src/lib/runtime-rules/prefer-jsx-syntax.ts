import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';

/**
 * Rule: prefer-jsx-syntax
 *
 * Encourages the use of JSX syntax over React.createElement for better readability.
 *
 * Severity: low
 * Applies to: all components
 */
export const preferJsxSyntaxRule: LintRule = {
  name: 'prefer-jsx-syntax',
  appliesTo: 'all',
  test: (ast: t.File, componentName: string) => {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for React.createElement
        if (
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.object) &&
          callee.object.name === 'React' &&
          t.isIdentifier(callee.property) &&
          callee.property.name === 'createElement'
        ) {
          violations.push({
            rule: 'prefer-jsx-syntax',
            severity: 'low',
            line: callee.loc?.start.line || 0,
            column: callee.loc?.start.column || 0,
            message: 'Prefer JSX syntax over React.createElement for better readability',
            code: 'React.createElement(...) → <ComponentName ... />',
          });
        }
      },
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(preferJsxSyntaxRule);
