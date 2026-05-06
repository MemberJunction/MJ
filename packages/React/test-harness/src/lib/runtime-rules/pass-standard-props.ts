import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { traverse, NodePath, createViolation, getJSXElementName, hasJSXAttribute } from '../lint-utils';

/**
 * Rule: pass-standard-props
 *
 * Ensures that all dependency components receive the standard props:
 * styles, utilities, and components.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'pass-standard-props')
export class PassStandardPropsRule extends BaseLintRule {
  get Name() { return 'pass-standard-props'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec): Violation[] {
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
                `<${elementName} ... />`,
                {
                  text: 'Always pass standard props to all components',
                  example: `// Always include these props when calling components:
<ChildComponent
  items={items}  // Data props

  // Settings persistence
  savedUserSettings={savedUserSettings?.childComponent}
  onSaveUserSettings={handleChildSettings}

  // Standard props
  styles={styles}
  utilities={utilities}
  components={components}
  callbacks={callbacks}
/>`,
                }
              )
            );
          }
        }
      },
    });

    return violations;
  }
}
