import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: utilities-no-direct-instantiation
 *
 * Prevents direct instantiation of classes that should be accessed via the utilities parameter.
 * Classes like RunView, RunQuery, Metadata, and SimpleVectorService are provided by the runtime
 * and should be used through the utilities object.
 *
 * Severity: high
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'utilities-no-direct-instantiation')
export class UtilitiesNoDirectInstantiationRule extends BaseLintRule {
  get Name() { return 'utilities-no-direct-instantiation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];
    const restrictedClasses = new Map([
      ['RunView', 'utilities.rv'],
      ['RunQuery', 'utilities.rq'],
      ['Metadata', 'utilities.md'],
      ['SimpleVectorService', 'utilities.ai.VectorService'],
    ]);

    traverse(ast, {
      NewExpression(path: NodePath<t.NewExpression>) {
        // Check if instantiating a restricted class
        if (t.isIdentifier(path.node.callee)) {
          const className = path.node.callee.name;

          if (restrictedClasses.has(className)) {
            const utilityPath = restrictedClasses.get(className);
            violations.push({
              rule: 'utilities-no-direct-instantiation',
              severity: 'high',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `Don't instantiate ${className} directly. Use ${utilityPath} instead which is provided in the component's utilities parameter.`,
              code: `new ${className}()`,
            });
          }
        }
      },
    });

    return violations;
    }
}
