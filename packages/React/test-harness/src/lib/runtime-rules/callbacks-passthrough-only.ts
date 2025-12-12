import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: callbacks-passthrough-only
 *
 * Ensures that the callbacks prop is passed through unchanged to child components.
 * Callbacks should not be modified, spread with additional properties, or conditionally passed.
 * Component events should be passed as separate props.
 *
 * Severity: critical (most cases), medium (conditional expressions)
 * Applies to: all components
 */
export const callbacksPassthroughOnlyRule: LintRule = {
  name: 'callbacks-passthrough-only',
  appliesTo: 'all',
  test: (ast) => {
    const violations: Violation[] = [];

    traverse(ast, {
      JSXAttribute(path: NodePath<t.JSXAttribute>) {
        // Check if this is a callbacks prop being passed to a component
        if (t.isJSXIdentifier(path.node.name) && path.node.name.name === 'callbacks') {
          const value = path.node.value;

          // Check if value is a JSXExpressionContainer
          if (t.isJSXExpressionContainer(value)) {
            const expr = value.expression;

            // Valid patterns:
            // - callbacks={callbacks}
            // - callbacks={props.callbacks}
            // - callbacks={restProps.callbacks}
            const isValidPassthrough =
              (t.isIdentifier(expr) && expr.name === 'callbacks') ||
              (t.isMemberExpression(expr) && t.isIdentifier(expr.property) && expr.property.name === 'callbacks');

            if (!isValidPassthrough) {
              // Check for spreading pattern: {...callbacks, ...}
              if (t.isObjectExpression(expr)) {
                const hasSpread = expr.properties.some(
                  (prop) => t.isSpreadElement(prop) && t.isIdentifier(prop.argument) && prop.argument.name === 'callbacks'
                );

                if (hasSpread) {
                  // Found spreading callbacks with additional properties
                  const addedProps = expr.properties
                    .filter((prop) => !t.isSpreadElement(prop) && t.isObjectProperty(prop))
                    .map((prop) => {
                      if (t.isObjectProperty(prop)) {
                        if (t.isIdentifier(prop.key)) {
                          return prop.key.name;
                        } else if (t.isStringLiteral(prop.key)) {
                          return prop.key.value;
                        }
                      }
                      return 'unknown';
                    });

                  violations.push({
                    rule: 'callbacks-passthrough-only',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Callbacks must be passed through unchanged. Found spreading with additional properties: ${addedProps.join(', ')}. Component events should be passed as direct props, not added to callbacks.`,
                    suggestion: {
                      text: `The callbacks prop should only contain OpenEntityRecord and RegisterMethod. Pass component events as separate props.`,
                      example: `// ❌ WRONG - Modifying callbacks
<ChildComponent
  callbacks={{ ...callbacks, onOpen: handleOpen }}
/>

// ✅ CORRECT - Pass callbacks unchanged, events as props
<ChildComponent
  callbacks={callbacks}
  onOpen={handleOpen}
/>`,
                    },
                  });
                } else if (expr.properties.length > 0) {
                  // Creating new callbacks object
                  violations.push({
                    rule: 'callbacks-passthrough-only',
                    severity: 'critical',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `Callbacks must be passed through unchanged. Do not create new callback objects. Pass the callbacks prop directly.`,
                    suggestion: {
                      text: `Pass callbacks directly without modification.`,
                      example: `// ❌ WRONG - Creating new callbacks object
<ChildComponent
  callbacks={{ OpenEntityRecord: customHandler }}
/>

// ✅ CORRECT - Pass callbacks unchanged
<ChildComponent
  callbacks={callbacks}
/>`,
                    },
                  });
                }
              }
              // Check for conditional expressions
              else if (t.isConditionalExpression(expr) || t.isLogicalExpression(expr)) {
                violations.push({
                  rule: 'callbacks-passthrough-only',
                  severity: 'medium',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Callbacks should be passed through directly without conditional logic. Consider handling the condition at a higher level.`,
                  suggestion: {
                    text: `Pass callbacks directly or handle conditions in parent component.`,
                    example: `// ⚠️ AVOID - Conditional callbacks
<ChildComponent
  callbacks={someCondition ? callbacks : undefined}
/>

// ✅ BETTER - Pass callbacks directly
<ChildComponent
  callbacks={callbacks}
/>`,
                  },
                });
              }
              // Check for function calls or other expressions
              else if (!t.isIdentifier(expr) && !t.isMemberExpression(expr)) {
                violations.push({
                  rule: 'callbacks-passthrough-only',
                  severity: 'critical',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Callbacks must be passed through unchanged. Found complex expression instead of direct passthrough.`,
                  suggestion: {
                    text: `Pass the callbacks prop directly without modification.`,
                    example: `// ✅ CORRECT
<ChildComponent callbacks={callbacks} />`,
                  },
                });
              }
            }
          }
        }
      },

      // Also check for Object.assign or spread operations on callbacks
      CallExpression(path: NodePath<t.CallExpression>) {
        // Check for Object.assign(callbacks, ...)
        if (
          t.isMemberExpression(path.node.callee) &&
          t.isIdentifier(path.node.callee.object) &&
          path.node.callee.object.name === 'Object' &&
          t.isIdentifier(path.node.callee.property) &&
          path.node.callee.property.name === 'assign'
        ) {
          const args = path.node.arguments;
          if (args.length > 0) {
            // Check if callbacks is being modified
            const hasCallbacks = args.some((arg) => t.isIdentifier(arg) && arg.name === 'callbacks');

            if (hasCallbacks) {
              violations.push({
                rule: 'callbacks-passthrough-only',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Do not modify callbacks with Object.assign. Callbacks should be passed through unchanged.`,
                suggestion: {
                  text: `Pass callbacks directly and use separate props for component events.`,
                  example: `// ❌ WRONG
const modifiedCallbacks = Object.assign({}, callbacks, { onOpen: handler });

// ✅ CORRECT - Keep callbacks separate from events
<Component callbacks={callbacks} onOpen={handler} />`,
                },
              });
            }
          }
        }
      },

      // Check for variable assignments that modify callbacks
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isObjectExpression(path.node.init)) {
          const hasCallbacksSpread = path.node.init.properties.some(
            (prop) => t.isSpreadElement(prop) && t.isIdentifier(prop.argument) && prop.argument.name === 'callbacks'
          );

          if (hasCallbacksSpread) {
            const hasAdditionalProps = path.node.init.properties.some((prop) => !t.isSpreadElement(prop));

            if (hasAdditionalProps) {
              violations.push({
                rule: 'callbacks-passthrough-only',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Do not create modified copies of callbacks. Pass callbacks unchanged and use separate props for events.`,
                suggestion: {
                  text: `Keep callbacks immutable and pass component events as separate props.`,
                  example: `// ❌ WRONG
const extendedCallbacks = { ...callbacks, onCustomEvent: handler };

// ✅ CORRECT - Keep them separate
// Pass to child component:
<Component callbacks={callbacks} onCustomEvent={handler} />`,
                },
              });
            }
          }
        }
      },
    });

    return violations;
  },
};
