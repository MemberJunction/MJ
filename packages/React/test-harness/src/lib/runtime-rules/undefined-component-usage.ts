import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: undefined-component-usage
 *
 * Detects components that are destructured from the components prop but never used
 * in JSX. These may be missing from the component spec's dependencies array or
 * are simply unused.
 *
 * Severity: low (informational warning)
 * Applies to: all components
 */
export const undefinedComponentUsageRule: LintRule = {
  name: 'undefined-component-usage',
  appliesTo: 'all',
  test: (ast, componentName, componentSpec?: ComponentSpec) => {
    const violations: Violation[] = [];
    const componentsFromProps = new Set<string>();
    const componentsUsedInJSX = new Set<string>();
    let hasComponentsProp = false;

    traverse(ast, {
      // First, find what's destructured from the components prop
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
          // Check if destructuring from 'components'
          if (path.node.init.name === 'components') {
            hasComponentsProp = true;
            for (const prop of path.node.id.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                componentsFromProps.add(prop.key.name);
              }
            }
          }
        }
      },

      // Also check object destructuring in function parameters
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
          const param = path.node.params[0];
          if (t.isObjectPattern(param)) {
            for (const prop of param.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'components') {
                hasComponentsProp = true;
                // Look for nested destructuring like { components: { A, B } }
                if (t.isObjectPattern(prop.value)) {
                  for (const innerProp of prop.value.properties) {
                    if (t.isObjectProperty(innerProp) && t.isIdentifier(innerProp.key)) {
                      componentsFromProps.add(innerProp.key.name);
                    }
                  }
                }
              }
            }
          }
        }
      },

      // Track JSX element usage
      JSXElement(path: NodePath<t.JSXElement>) {
        const openingElement = path.node.openingElement;

        // Check for direct usage (e.g., <ComponentName>)
        if (t.isJSXIdentifier(openingElement.name) && /^[A-Z]/.test(openingElement.name.name)) {
          const componentName = openingElement.name.name;
          // Only track if it's from our destructured components
          if (componentsFromProps.has(componentName)) {
            componentsUsedInJSX.add(componentName);
          }
        }

        // Also check for components.X pattern (e.g., <components.ComponentName>)
        if (t.isJSXMemberExpression(openingElement.name)) {
          if (
            t.isJSXIdentifier(openingElement.name.object) &&
            openingElement.name.object.name === 'components' &&
            t.isJSXIdentifier(openingElement.name.property)
          ) {
            const componentName = openingElement.name.property.name;
            // Track usage of components accessed via dot notation
            if (componentsFromProps.has(componentName)) {
              componentsUsedInJSX.add(componentName);
            }
          }
        }
      },
    });

    // Only check if we found a components prop
    if (hasComponentsProp && componentsFromProps.size > 0) {
      // Find components that are destructured but never used
      const unusedComponents = Array.from(componentsFromProps).filter((comp) => !componentsUsedInJSX.has(comp));

      if (unusedComponents.length > 0) {
        violations.push({
          rule: 'undefined-component-usage',
          severity: 'low',
          line: 1,
          column: 0,
          message: `Component destructures ${unusedComponents.join(', ')} from components prop but never uses them. These may be missing from the component spec's dependencies array.`,
        });
      }
    }

    return violations;
  },
};
