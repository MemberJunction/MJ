import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: component-not-in-dependencies
 *
 * Ensures that all components accessed via components.X are defined in the
 * component spec's dependencies array. Using undefined components will cause
 * runtime errors.
 *
 * Severity: critical (causes runtime errors)
 * Applies to: all components
 */
export const componentNotInDependenciesRule: LintRule = {
  name: 'component-not-in-dependencies',
  appliesTo: 'all',
  test: (ast, componentName, componentSpec?: ComponentSpec) => {
    const violations: Violation[] = [];

    // Get the list of available component names from dependencies
    const availableComponents = new Set<string>();
    if (componentSpec?.dependencies) {
      for (const dep of componentSpec.dependencies) {
        if (dep.name) {
          availableComponents.add(dep.name);
        }
      }
    }

    traverse(ast, {
      // Check for components.X usage in JSX
      JSXElement(path: NodePath<t.JSXElement>) {
        const openingElement = path.node.openingElement;

        // Check for components.X pattern (e.g., <components.Loading>)
        if (t.isJSXMemberExpression(openingElement.name)) {
          if (
            t.isJSXIdentifier(openingElement.name.object) &&
            openingElement.name.object.name === 'components' &&
            t.isJSXIdentifier(openingElement.name.property)
          ) {
            const componentName = openingElement.name.property.name;

            // Check if this component is NOT in the dependencies
            if (!availableComponents.has(componentName)) {
              violations.push({
                rule: 'component-not-in-dependencies',
                severity: 'critical',
                line: openingElement.loc?.start.line || 0,
                column: openingElement.loc?.start.column || 0,
                message: `Component "${componentName}" is used via components.${componentName} but is not defined in the component spec's dependencies array. This will cause a runtime error.`,
                code: `<components.${componentName}>`,
              });
            }
          }
        }
      },

      // Also check for components.X usage in JavaScript expressions
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (t.isIdentifier(path.node.object) && path.node.object.name === 'components' && t.isIdentifier(path.node.property)) {
          const componentName = path.node.property.name;

          // Skip if this is a method call like components.hasOwnProperty
          const parent = path.parent;
          if (t.isCallExpression(parent) && parent.callee === path.node) {
            // Check if it looks like a component (starts with uppercase)
            if (!/^[A-Z]/.test(componentName)) {
              return; // Skip built-in methods
            }
          }

          // Check if this component is NOT in the dependencies
          if (/^[A-Z]/.test(componentName) && !availableComponents.has(componentName)) {
            violations.push({
              rule: 'component-not-in-dependencies',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `Component "${componentName}" is accessed via components.${componentName} but is not defined in the component spec's dependencies array. This will cause a runtime error.`,
              code: `components.${componentName}`,
            });
          }
        }
      },
    });

    return violations;
  },
};
