import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: validate-component-references
 *
 * Validates that component references used in JSX or React.createElement calls
 * match declared dependencies. Also warns about unused dependencies.
 *
 * Severity: critical (for undefined references), low (for unused dependencies)
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'validate-component-references')
export class ValidateComponentReferencesRule extends BaseLintRule {
  get Name() { return 'validate-component-references'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // Skip if no spec or no dependencies
    if (!componentSpec?.dependencies || componentSpec.dependencies.length === 0) {
      return violations;
    }

    // Build a set of available component names from dependencies
    const availableComponents = new Set<string>();
    for (const dep of componentSpec.dependencies) {
      if (dep.location === 'embedded' && dep.name) {
        availableComponents.add(dep.name);
      }
    }

    // If no embedded dependencies, nothing to validate
    if (availableComponents.size === 0) {
      return violations;
    }

    // Track ALL defined variables in scope (from destructuring, imports, declarations, etc.)
    const definedVariables = new Set<string>();
    const referencedComponents = new Set<string>();

    // First pass: collect all variable declarations and destructuring
    traverse(ast, {
      // Track variable declarations (const x = ...)
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isIdentifier(path.node.id)) {
          definedVariables.add(path.node.id.name);
        } else if (t.isObjectPattern(path.node.id)) {
          // Track all destructured variables
          const collectDestructured = (pattern: t.ObjectPattern) => {
            for (const prop of pattern.properties) {
              if (t.isObjectProperty(prop)) {
                if (t.isIdentifier(prop.value)) {
                  definedVariables.add(prop.value.name);
                } else if (t.isObjectPattern(prop.value)) {
                  collectDestructured(prop.value);
                }
              } else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) {
                definedVariables.add(prop.argument.name);
              }
            }
          };
          collectDestructured(path.node.id);
        } else if (t.isArrayPattern(path.node.id)) {
          // Track array destructuring
          for (const elem of path.node.id.elements) {
            if (t.isIdentifier(elem)) {
              definedVariables.add(elem.name);
            }
          }
        }
      },

      // Track function declarations
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id) {
          definedVariables.add(path.node.id.name);
        }
      },

      // Track class declarations
      ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
        if (path.node.id) {
          definedVariables.add(path.node.id.name);
        }
      },

      // Track function parameters
      Function(path: NodePath<t.Function>) {
        for (const param of path.node.params) {
          if (t.isIdentifier(param)) {
            definedVariables.add(param.name);
          } else if (t.isObjectPattern(param)) {
            // Track destructured parameters
            const collectParams = (pattern: t.ObjectPattern) => {
              for (const prop of pattern.properties) {
                if (t.isObjectProperty(prop)) {
                  if (t.isIdentifier(prop.value)) {
                    definedVariables.add(prop.value.name);
                  } else if (t.isObjectPattern(prop.value)) {
                    collectParams(prop.value);
                  }
                }
              }
            };
            collectParams(param);
          }
        }
      },
    });

    // Second pass: check component usage
    traverse(ast, {
      // Look for React.createElement calls
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for React.createElement(ComponentName, ...)
        if (
          t.isMemberExpression(callee) &&
          t.isIdentifier(callee.object) &&
          callee.object.name === 'React' &&
          t.isIdentifier(callee.property) &&
          callee.property.name === 'createElement'
        ) {
          const firstArg = path.node.arguments[0];

          // If first argument is an identifier (component reference)
          if (t.isIdentifier(firstArg)) {
            const componentRef = firstArg.name;

            // Skip HTML elements and React built-ins
            if (!componentRef.match(/^[a-z]/) && componentRef !== 'Fragment') {
              // Only check if it's supposed to be a component dependency
              // and it's not defined elsewhere in the code
              if (availableComponents.has(componentRef)) {
                referencedComponents.add(componentRef);
              } else if (!definedVariables.has(componentRef)) {
                // Only complain if it's not defined anywhere
                const availableList = Array.from(availableComponents).sort().join(', ');
                const availableLibs =
                  componentSpec?.libraries
                    ?.map((lib) => lib.globalVariable)
                    .filter(Boolean)
                    .join(', ') || '';

                let message = `Component "${componentRef}" is not defined. Available component dependencies: ${availableList}`;
                if (availableLibs) {
                  message += `. Available libraries: ${availableLibs}`;
                }

                violations.push({
                  rule: 'validate-component-references',
                  severity: 'critical',
                  line: firstArg.loc?.start.line || 0,
                  column: firstArg.loc?.start.column || 0,
                  message: message,
                  code: `React.createElement(${componentRef}, ...)`,
                });
              }
            }
          }
        }
      },

      // Look for JSX elements
      JSXElement(path: NodePath<t.JSXElement>) {
        const openingElement = path.node.openingElement;
        const elementName = openingElement.name;

        if (t.isJSXIdentifier(elementName)) {
          const componentRef = elementName.name;

          // Skip HTML elements and fragments
          if (!componentRef.match(/^[a-z]/) && componentRef !== 'Fragment') {
            // Track if it's a known component dependency
            if (availableComponents.has(componentRef)) {
              referencedComponents.add(componentRef);
            } else if (!definedVariables.has(componentRef)) {
              // Only complain if it's not defined anywhere (not from libraries, not from declarations)
              const availableList = Array.from(availableComponents).sort().join(', ');
              const availableLibs =
                componentSpec?.libraries
                  ?.map((lib) => lib.globalVariable)
                  .filter(Boolean)
                  .join(', ') || '';

              let message = `Component "${componentRef}" is not defined. Available component dependencies: ${availableList}`;
              if (availableLibs) {
                message += `. Available libraries: ${availableLibs}`;
              }

              violations.push({
                rule: 'validate-component-references',
                severity: 'critical',
                line: elementName.loc?.start.line || 0,
                column: elementName.loc?.start.column || 0,
                message: message,
                code: `<${componentRef} ... />`,
              });
            }
          }
        }
      },

      // Look for destructuring from components prop specifically
      ObjectPattern(path: NodePath<t.ObjectPattern>) {
        // Check if this is destructuring from a 'components' parameter
        const parent = path.parent;

        // Check if it's a function parameter with components
        if (
          (t.isFunctionDeclaration(parent) || t.isFunctionExpression(parent) || t.isArrowFunctionExpression(parent)) &&
          parent.params.includes(path.node)
        ) {
          // Look for components property
          for (const prop of path.node.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'components' && t.isObjectPattern(prop.value)) {
              // Check each destructured component
              for (const componentProp of prop.value.properties) {
                if (t.isObjectProperty(componentProp) && t.isIdentifier(componentProp.key)) {
                  const componentRef = componentProp.key.name;
                  referencedComponents.add(componentRef);

                  if (!availableComponents.has(componentRef)) {
                    const availableList = Array.from(availableComponents).sort().join(', ');

                    // Try to find similar names for suggestions
                    const suggestions = Array.from(availableComponents).filter(
                      (name) => name.toLowerCase().includes(componentRef.toLowerCase()) || componentRef.toLowerCase().includes(name.toLowerCase()),
                    );

                    let message = `Destructured component "${componentRef}" is not found in dependencies. Available components: ${availableList}`;
                    if (suggestions.length > 0) {
                      message += `. Did you mean: ${suggestions.join(' or ')}?`;
                    }

                    violations.push({
                      rule: 'validate-component-references',
                      severity: 'critical',
                      line: componentProp.key.loc?.start.line || 0,
                      column: componentProp.key.loc?.start.column || 0,
                      message: message,
                      code: `{ components: { ${componentRef}, ... } }`,
                    });
                  }
                }
              }
            }
          }
        }
      },
    });

    // Also warn about unused dependencies
    for (const depName of availableComponents) {
      if (!referencedComponents.has(depName)) {
        violations.push({
          rule: 'validate-component-references',
          severity: 'low',
          line: 1,
          column: 0,
          message: `Component dependency "${depName}" is defined but never used in the code.`,
          code: `dependencies: [..., { name: "${depName}", ... }, ...]`,
        });
      }
    }

    return violations;
    }
}
