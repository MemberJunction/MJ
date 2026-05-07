import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: prefer-jsx-syntax
 *
 * Encourages the use of JSX syntax over React.createElement for better readability.
 *
 * Severity: low
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'prefer-jsx-syntax')
export class PreferJsxSyntaxRule extends BaseLintRule {
  get Name() { return 'prefer-jsx-syntax'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string): Violation[] {
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
  }
}
