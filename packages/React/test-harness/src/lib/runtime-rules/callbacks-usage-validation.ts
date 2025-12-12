import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: callbacks-usage-validation
 *
 * Validates that callbacks are only accessed using allowed methods
 * (OpenEntityRecord, RegisterMethod, CreateSimpleNotification).
 * Ensures that component events are not mistakenly accessed through callbacks.
 *
 * Severity: critical
 * Applies to: all components
 */
export const callbacksUsageValidationRule: LintRule = {
  name: 'callbacks-usage-validation',
  appliesTo: 'all',
  test: (ast, _componentName, componentSpec) => {
    const violations: Violation[] = [];

    // Define the allowed methods on ComponentCallbacks interface
    const allowedCallbackMethods = new Set(['OpenEntityRecord', 'RegisterMethod', 'CreateSimpleNotification']);

    // Build list of component's event names from spec
    const componentEvents = new Set<string>();
    if (componentSpec?.events) {
      for (const event of componentSpec.events) {
        if (event.name) {
          componentEvents.add(event.name);
        }
      }
    }

    traverse(ast, {
      MemberExpression(path: NodePath<t.MemberExpression>) {
        // Check for callbacks.something access
        if (t.isIdentifier(path.node.object) && path.node.object.name === 'callbacks') {
          if (t.isIdentifier(path.node.property)) {
            const methodName = path.node.property.name;

            // IMPORTANT: Check if it's a known runtime callback FIRST
            // This prevents false positives when components mistakenly declare
            // runtime callbacks as events in their spec
            if (allowedCallbackMethods.has(methodName)) {
              // This is a valid runtime callback - allow it
              return;
            }

            // Check if it's trying to access an event
            if (componentEvents.has(methodName)) {
              violations.push({
                rule: 'callbacks-usage-validation',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Event "${methodName}" should not be accessed from callbacks. Events are passed as direct props to the component. Use the prop directly: ${methodName}`,
                suggestion: {
                  text: `Events defined in the component spec are passed as direct props, not through callbacks. Access the event directly as a prop.`,
                  example: `// ❌ WRONG - Accessing event from callbacks
const { ${methodName} } = callbacks || {};
callbacks?.${methodName}?.(data);

// ✅ CORRECT - Event is a direct prop
// In the component props destructuring:
function MyComponent({ ..., ${methodName} }) {
  // Use with null checking:
  if (${methodName}) {
    ${methodName}(data);
  }
}`,
                },
              });
            } else {
              // It's not a runtime callback or an event - it's invalid
              violations.push({
                rule: 'callbacks-usage-validation',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Invalid callback method "${methodName}". The callbacks prop only supports: ${Array.from(allowedCallbackMethods).join(', ')}`,
                suggestion: {
                  text: `The callbacks prop is reserved for specific MemberJunction framework methods. Custom events should be defined in the component spec's events array and passed as props.`,
                  example: `// Allowed callbacks methods:
callbacks?.OpenEntityRecord?.(entityName, key);
callbacks?.RegisterMethod?.(methodName, handler);
callbacks?.CreateSimpleNotification?.(message, style, hideAfter);

// For custom events, define them in the spec and use as props:
function MyComponent({ onCustomEvent }) {
  if (onCustomEvent) {
    onCustomEvent(data);
  }
}`,
                },
              });
            }
          }
        }
      },

      // Also check for destructuring from callbacks
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init) && path.node.init.name === 'callbacks') {
          // Check each destructured property
          for (const prop of path.node.id.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              const methodName = prop.key.name;

              // IMPORTANT: Check if it's a known runtime callback FIRST
              if (allowedCallbackMethods.has(methodName)) {
                // This is a valid runtime callback - allow it
                continue;
              }

              if (componentEvents.has(methodName)) {
                violations.push({
                  rule: 'callbacks-usage-validation',
                  severity: 'critical',
                  line: prop.loc?.start.line || 0,
                  column: prop.loc?.start.column || 0,
                  message: `Event "${methodName}" should not be destructured from callbacks. Events are passed as direct props to the component.`,
                  suggestion: {
                    text: `Events should be destructured from the component props, not from callbacks.`,
                    example: `// ❌ WRONG
const { ${methodName} } = callbacks || {};

// ✅ CORRECT
function MyComponent({ utilities, styles, callbacks, ${methodName} }) {
  // ${methodName} is now available as a prop
}`,
                  },
                });
              } else if (!allowedCallbackMethods.has(methodName)) {
                violations.push({
                  rule: 'callbacks-usage-validation',
                  severity: 'critical',
                  line: prop.loc?.start.line || 0,
                  column: prop.loc?.start.column || 0,
                  message: `Invalid callback method "${methodName}" being destructured. The callbacks prop only supports: ${Array.from(allowedCallbackMethods).join(', ')}`,
                });
              }
            }
          }
        }

        // Also check for: const { something } = callbacks || {}
        if (
          t.isObjectPattern(path.node.id) &&
          t.isLogicalExpression(path.node.init) &&
          path.node.init.operator === '||' &&
          t.isIdentifier(path.node.init.left) &&
          path.node.init.left.name === 'callbacks'
        ) {
          // Check each destructured property
          for (const prop of path.node.id.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              const methodName = prop.key.name;

              if (componentEvents.has(methodName)) {
                violations.push({
                  rule: 'callbacks-usage-validation',
                  severity: 'critical',
                  line: prop.loc?.start.line || 0,
                  column: prop.loc?.start.column || 0,
                  message: `Event "${methodName}" should not be destructured from callbacks. Events are passed as direct props to the component.`,
                  suggestion: {
                    text: `Events should be destructured from the component props, not from callbacks.`,
                    example: `// ❌ WRONG
const { ${methodName} } = callbacks || {};

// ✅ CORRECT
function MyComponent({ utilities, styles, callbacks, ${methodName} }) {
  // ${methodName} is now available as a prop
}`,
                  },
                });
              } else if (!allowedCallbackMethods.has(methodName)) {
                violations.push({
                  rule: 'callbacks-usage-validation',
                  severity: 'critical',
                  line: prop.loc?.start.line || 0,
                  column: prop.loc?.start.column || 0,
                  message: `Invalid callback method "${methodName}" being destructured. The callbacks prop only supports: ${Array.from(allowedCallbackMethods).join(', ')}`,
                });
              }
            }
          }
        }
      },
    });

    return violations;
  },
};
