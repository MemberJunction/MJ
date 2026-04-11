import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: event-invocation-pattern
 *
 * Ensures that event props (defined in componentSpec.events) are null-checked
 * before invocation. Events are optional props and calling them without a guard
 * can cause runtime errors.
 *
 * Severity: medium
 * Applies to: all components
 */
export const eventInvocationPatternRule: LintRule = {
  name: 'event-invocation-pattern',
  appliesTo: 'all',
  test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
    const violations: Violation[] = [];

    // Build list of component's event names from spec
    const componentEvents = new Set<string>();
    if (componentSpec?.events) {
      for (const event of componentSpec.events) {
        if (event.name) {
          componentEvents.add(event.name);
        }
      }
    }

    // If no events defined, skip this rule
    if (componentEvents.size === 0) {
      return violations;
    }

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        // Check if calling an event without null checking
        if (t.isIdentifier(path.node.callee)) {
          const eventName = path.node.callee.name;
          if (componentEvents.has(eventName)) {
            // Check if this call is inside a conditional that checks for the event
            let hasNullCheck = false;
            let currentPath: NodePath<t.Node> | null = path.parentPath;

            // Walk up the tree to see if we're inside an if statement that checks this event
            while (currentPath && !hasNullCheck) {
              if (t.isIfStatement(currentPath.node)) {
                const test = currentPath.node.test;
                // Check if the test checks for the event (simple cases)
                if (t.isIdentifier(test) && test.name === eventName) {
                  hasNullCheck = true;
                } else if (t.isLogicalExpression(test) && test.operator === '&&') {
                  // Check for patterns like: eventName && ...
                  if (t.isIdentifier(test.left) && test.left.name === eventName) {
                    hasNullCheck = true;
                  }
                }
              } else if (t.isLogicalExpression(currentPath.node) && currentPath.node.operator === '&&') {
                // Check for inline conditional: eventName && eventName()
                if (t.isIdentifier(currentPath.node.left) && currentPath.node.left.name === eventName) {
                  hasNullCheck = true;
                }
              } else if (t.isConditionalExpression(currentPath.node)) {
                // Check for ternary: eventName ? eventName() : null
                if (t.isIdentifier(currentPath.node.test) && currentPath.node.test.name === eventName) {
                  hasNullCheck = true;
                }
              }
              currentPath = currentPath.parentPath || null;
            }

            if (!hasNullCheck) {
              violations.push({
                rule: 'event-invocation-pattern',
                severity: 'medium',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Event "${eventName}" is being invoked without null-checking. Events are optional props and should be checked before invocation.`,
                suggestion: {
                  text: `Always check that an event prop exists before invoking it, as events are optional.`,
                  example: `// ❌ WRONG - No null check
${eventName}(data);

// ✅ CORRECT - With null check
if (${eventName}) {
  ${eventName}(data);
}

// ✅ ALSO CORRECT - Inline check
${eventName} && ${eventName}(data);

// ✅ ALSO CORRECT - Optional chaining
${eventName}?.(data);`,
                },
              });
            }
          }
        }
      },

      // Check for optional chaining on events (this is good!)
      OptionalCallExpression(path: NodePath<t.OptionalCallExpression>) {
        if (t.isIdentifier(path.node.callee)) {
          const eventName = path.node.callee.name;
          if (componentEvents.has(eventName)) {
            // This is actually the correct pattern, no violation
            return;
          }
        }
      },
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(eventInvocationPatternRule);
