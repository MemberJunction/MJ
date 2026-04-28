import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: no-child-implementation
 *
 * Ensures that root component files do not contain child component implementations.
 * Root components should only reference child components, not implement them.
 *
 * Severity: critical
 * Applies to: root components only
 */
@RegisterClass(BaseLintRule, 'no-child-implementation')
export class NoChildImplementationRule extends BaseLintRule {
  get Name() { return 'no-child-implementation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'root'; }

  Test(ast: t.File, componentName: string): Violation[] {
    const violations: Violation[] = [];
    const rootFunctionName = componentName;
    const declaredFunctions: string[] = [];

    // First pass: collect all function declarations
    traverse(ast, {
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id) {
          declaredFunctions.push(path.node.id.name);
        }
      },
    });

    // If there are multiple function declarations and they look like components
    // (start with capital letter), it's likely implementing children
    const componentFunctions = declaredFunctions.filter((name) => name !== rootFunctionName && /^[A-Z]/.test(name));

    if (componentFunctions.length > 0) {
      violations.push({
        rule: 'no-child-implementation',
        severity: 'critical',
        line: 1,
        column: 0,
        message: `Root component file contains child component implementations: ${componentFunctions.join(', ')}. Root should only reference child components, not implement them.`,
        suggestion: {
          text: 'Remove child component implementations. Only the root component function should be in this file',
          example: 'Move child component functions to separate generation requests',
        },
      });
    }

    return violations;
  }
}
