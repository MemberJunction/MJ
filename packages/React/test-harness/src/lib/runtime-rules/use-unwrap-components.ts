import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: use-unwrap-components
 *
 * Ensures that components use unwrapComponents() utility to access library components
 * instead of direct destructuring. This ensures safe access to library APIs.
 *
 * Severity: critical
 * Applies to: all components
 */
export const useUnwrapComponentsRule: LintRule = {
  name: 'use-unwrap-components',
  appliesTo: 'all',
  test: (ast, _componentName, componentSpec) => {
    const violations: Violation[] = [];

    // Build a set of library global variables
    const libraryGlobals = new Set<string>();
    if (componentSpec?.libraries) {
      for (const lib of componentSpec.libraries) {
        if (lib.globalVariable) {
          libraryGlobals.add(lib.globalVariable);
        }
      }
    }

    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        // Check for direct destructuring from library globals
        if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
          const sourceVar = path.node.init.name;

          // Check if this is destructuring from a library global
          if (libraryGlobals.has(sourceVar)) {
            // Extract the destructured component names
            const componentNames: string[] = [];
            for (const prop of path.node.id.properties) {
              if (t.isObjectProperty(prop)) {
                if (t.isIdentifier(prop.key)) {
                  componentNames.push(prop.key.name);
                }
              }
            }

            violations.push({
              rule: 'use-unwrap-components',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `Direct destructuring from library "${sourceVar}" is not allowed. You MUST use unwrapComponents to access library components. Replace "const { ${componentNames.join(', ')} } = ${sourceVar};" with "const { ${componentNames.join(', ')} } = unwrapComponents(${sourceVar}, [${componentNames.map((n) => `'${n}'`).join(', ')}]);"`,
            });
          }
        }

        // Also check for MemberExpression destructuring like const { Button } = antd.Button
        if (t.isObjectPattern(path.node.id) && t.isMemberExpression(path.node.init)) {
          const memberExpr = path.node.init;
          if (t.isIdentifier(memberExpr.object)) {
            const objName = memberExpr.object.name;
            if (libraryGlobals.has(objName)) {
              violations.push({
                rule: 'use-unwrap-components',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Direct destructuring from library member expression is not allowed. Use unwrapComponents to safely access library components. Example: Instead of "const { Something } = ${objName}.Something;", use "const { Something } = unwrapComponents(${objName}, ['Something']);"`,
              });
            }
          }
        }
      },
    });

    return violations;
  },
};
