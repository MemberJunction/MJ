import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: prefer-async-await
 *
 * Encourages the use of async/await over .then() chains for better readability.
 *
 * Severity: low
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'prefer-async-await')
export class PreferAsyncAwaitRule extends BaseLintRule {
  get Name() { return 'prefer-async-await'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string): Violation[] {
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
  }
}
