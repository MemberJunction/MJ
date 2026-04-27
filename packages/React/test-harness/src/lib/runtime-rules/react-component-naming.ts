import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { traverse, NodePath, createViolation } from '../lint-utils';

/**
 * Rule: react-component-naming
 *
 * Ensures that React components follow naming conventions:
 * - Component names must start with an uppercase letter
 * - JSX treats lowercase as HTML elements
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'react-component-naming')
export class ReactComponentNamingRule extends BaseLintRule {
  get Name() { return 'react-component-naming'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id && path.node.id.name === componentName) {
          // Check if it's the main component function
          const funcName = path.node.id.name;

          // Check if function has component-like parameters (props structure)
          const firstParam = path.node.params[0];
          const hasComponentProps = firstParam && (t.isObjectPattern(firstParam) || t.isIdentifier(firstParam));

          if (hasComponentProps && funcName[0] !== funcName[0].toUpperCase()) {
            violations.push(
              createViolation(
                'react-component-naming',
                'critical',
                path.node.id,
                `React component "${funcName}" must start with uppercase. JSX treats lowercase as HTML elements.`,
                `function ${funcName[0].toUpperCase()}${funcName.slice(1)}`
              )
            );
          }
        }

        // Also check for any other component-like functions
        if (path.node.id && path.node.params[0]) {
          const funcName = path.node.id.name;
          const firstParam = path.node.params[0];

          // Check if it looks like a component (has props parameter and returns JSX)
          let returnsJSX = false;
          path.traverse({
            ReturnStatement(returnPath: NodePath<t.ReturnStatement>) {
              if (returnPath.node.argument && t.isJSXElement(returnPath.node.argument)) {
                returnsJSX = true;
              }
            },
          });

          if (returnsJSX && t.isObjectPattern(firstParam)) {
            // Check if any props match component prop pattern
            const propNames = firstParam.properties
              .filter((p): p is t.ObjectProperty => t.isObjectProperty(p))
              .filter((p) => t.isIdentifier(p.key))
              .map((p) => (p.key as t.Identifier).name);

            const hasComponentLikeProps = propNames.some((name) =>
              ['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings'].includes(
                name
              )
            );

            if (hasComponentLikeProps && funcName[0] !== funcName[0].toUpperCase()) {
              violations.push(
                createViolation(
                  'react-component-naming',
                  'critical',
                  path.node.id,
                  `Function "${funcName}" appears to be a React component and must start with uppercase.`,
                  `function ${funcName[0].toUpperCase()}${funcName.slice(1)}`
                )
              );
            }
          }
        }
      },
    });

    return violations;
    }
}
