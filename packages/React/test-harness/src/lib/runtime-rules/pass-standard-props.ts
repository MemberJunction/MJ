import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { createViolation, getJSXElementName, hasJSXAttribute } from '../lint-utils';

/**
 * Rule: pass-standard-props
 *
 * Ensures that all dependency components receive the standard props:
 * styles, utilities, and components.
 *
 * Severity: critical
 * Applies to: all components
 */
export const passStandardPropsRule: LintRule = {
  name: 'pass-standard-props',
  appliesTo: 'all',
  test: (ast, _componentName, componentSpec) => {
    const violations: Violation[] = [];
    const requiredProps = ['styles', 'utilities', 'components'];

    // ONLY check components that are explicitly in our dependencies
    // Do NOT check library components, HTML elements, or anything else
    const ourComponentNames = new Set<string>();

    // Only add components from the componentSpec.dependencies array
    if (componentSpec?.dependencies && Array.isArray(componentSpec.dependencies)) {
      for (const dep of componentSpec.dependencies) {
        if (dep && dep.name) {
          ourComponentNames.add(dep.name);
        }
      }
    }

    // If there are no dependencies, skip this rule entirely
    if (ourComponentNames.size === 0) {
      return violations;
    }

    traverse(ast, {
      JSXElement(path: NodePath<t.JSXElement>) {
        const openingElement = path.node.openingElement;
        const elementName = getJSXElementName(openingElement);

        // Only check if this is one of our dependency components
        if (elementName && ourComponentNames.has(elementName)) {
          // Check for required props
          const missingProps: string[] = [];

          for (const propName of requiredProps) {
            if (!hasJSXAttribute(openingElement, propName)) {
              missingProps.push(propName);
            }
          }

          if (missingProps.length > 0) {
            violations.push(
              createViolation(
                'pass-standard-props',
                'critical',
                openingElement,
                `Dependency component "${elementName}" is missing required props: ${missingProps.join(', ')}. Components from dependencies must receive styles, utilities, and components props.`,
                `<${elementName} ... />`
              )
            );
          }
        }
      },
    });

    return violations;
  },
};
