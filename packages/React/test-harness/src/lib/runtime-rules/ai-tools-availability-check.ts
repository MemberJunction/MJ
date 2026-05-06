import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: ai-tools-availability-check
 *
 * Checks that `utilities.ai` is guarded with a null/undefined check before use.
 * The `ai` property on the utilities object may be undefined if the AI tools
 * are not configured or available. Accessing methods on it without a guard
 * will throw a runtime error.
 *
 * Correct patterns:
 *   if (utilities.ai) { await utilities.ai.ExecutePrompt(...); }
 *   const result = await utilities.ai?.ExecutePrompt(...);
 *
 * Incorrect pattern:
 *   const result = await utilities.ai.ExecutePrompt(...);
 *
 * Severity: medium
 * Applies to: all components
 */

/**
 * Checks if a NodePath is inside a guard that checks `utilities.ai` for truthiness.
 * Recognized guard patterns:
 *   - if (utilities.ai) { ... }
 *   - if (utilities.ai != null) { ... }
 *   - utilities.ai && ...
 */
function isInsideAiGuard(path: NodePath): boolean {
  let current: NodePath | null = path.parentPath;

  while (current) {
    // Check if statements
    if (current.isIfStatement()) {
      if (testChecksUtilitiesAi(current.node.test)) {
        if (isInConsequent(path.node, current.node)) {
          return true;
        }
      }
    }

    // Check logical && guards: utilities.ai && utilities.ai.ExecutePrompt(...)
    if (current.isLogicalExpression() && current.node.operator === '&&') {
      if (testChecksUtilitiesAi(current.node.left)) {
        return true;
      }
    }

    // Check ternary: utilities.ai ? utilities.ai.ExecutePrompt(...) : null
    if (current.isConditionalExpression()) {
      if (testChecksUtilitiesAi(current.node.test)) {
        return true;
      }
    }

    // Check try/catch: try { utilities.ai.ExecutePrompt(...) } catch { ... }
    if (current.isTryStatement()) {
      return true;
    }

    // Check for early-return guard in enclosing function:
    // if (!utilities.ai) return;  OR  if (!utilities.ai) { return; }
    if (current.isFunction()) {
      const body = current.get('body');
      if (body && !Array.isArray(body) && body.isBlockStatement()) {
        for (const stmt of body.get('body')) {
          if (stmt.isIfStatement()) {
            const test = stmt.node.test;
            // Check for: if (!utilities.ai) return;
            if (t.isUnaryExpression(test) && test.operator === '!' && isUtilitiesAiAccess(test.argument)) {
              return true;
            }
            // Check for: if (utilities.ai == null) return;
            if (t.isBinaryExpression(test) && (test.operator === '==' || test.operator === '===')) {
              if (
                isUtilitiesAiAccess(test.left) &&
                (t.isNullLiteral(test.right) || (t.isIdentifier(test.right) && test.right.name === 'undefined'))
              ) {
                return true;
              }
            }
          }
        }
      }
      // Stop walking up past the function boundary
      break;
    }

    current = current.parentPath;
  }

  return false;
}

/**
 * Checks if a test expression is checking `utilities.ai` for truthiness.
 */
function testChecksUtilitiesAi(test: t.Node): boolean {
  // Direct: utilities.ai
  if (isUtilitiesAiAccess(test)) {
    return true;
  }

  // Negated null check: utilities.ai != null  or  utilities.ai !== null
  // Also: utilities.ai !== undefined
  if (t.isBinaryExpression(test) && (test.operator === '!=' || test.operator === '!==')) {
    if (
      isUtilitiesAiAccess(test.left) &&
      (t.isNullLiteral(test.right) || (t.isIdentifier(test.right) && test.right.name === 'undefined'))
    ) {
      return true;
    }
  }

  // Logical AND chain
  if (t.isLogicalExpression(test) && test.operator === '&&') {
    return testChecksUtilitiesAi(test.left) || testChecksUtilitiesAi(test.right);
  }

  return false;
}

/**
 * Checks if a node is `utilities.ai` member expression.
 */
function isUtilitiesAiAccess(node: t.Node): boolean {
  return (
    t.isMemberExpression(node) &&
    t.isIdentifier(node.object) &&
    node.object.name === 'utilities' &&
    t.isIdentifier(node.property) &&
    node.property.name === 'ai'
  );
}

/**
 * Checks if targetNode is within the consequent (true branch) of an if statement.
 */
function isInConsequent(targetNode: t.Node, ifStatement: t.IfStatement): boolean {
  let found = false;
  traverse(ifStatement.consequent, {
    enter(innerPath: NodePath) {
      if (innerPath.node === targetNode) {
        found = true;
        innerPath.stop();
      }
    },
    noScope: true,
  });
  return found;
}

/**
 * Checks if a MemberExpression accesses a property/method on utilities.ai
 * (i.e., utilities.ai.SomeMethod or utilities.ai.someProperty).
 */
function isUtilitiesAiMethodAccess(node: t.MemberExpression): boolean {
  // The object should be utilities.ai
  return isUtilitiesAiAccess(node.object);
}

/**
 * Checks if the access uses optional chaining at the ai level.
 * Pattern: utilities.ai?.ExecutePrompt(...)
 * In the AST this appears as an OptionalMemberExpression chain.
 */
function isOptionalAiAccess(path: NodePath<t.MemberExpression>): boolean {
  // Check if parent is an optional call expression chained from utilities.ai
  // Pattern: utilities.ai?.method() results in OptionalCallExpression
  const parent = path.parent;
  if (t.isOptionalCallExpression(parent) || t.isOptionalMemberExpression(parent)) {
    return true;
  }

  // Check if the utilities.ai part itself is optional: utilities?.ai?.method()
  if (t.isOptionalMemberExpression(path.node.object)) {
    return true;
  }

  return false;
}

@RegisterClass(BaseLintRule, 'ai-tools-availability-check')
export class AiToolsAvailabilityCheckRule extends BaseLintRule {
  get Name() { return 'ai-tools-availability-check'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File): Violation[] {
    const violations: Violation[] = [];

    // First pass: count total utilities.ai accesses (guarded and unguarded)
    // If the component uses utilities.ai extensively, it's designed for AI environments
    let totalAiAccesses = 0;
    traverse(ast, {
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (isUtilitiesAiMethodAccess(path.node)) totalAiAccesses++;
      },
      OptionalMemberExpression(path: NodePath) {
        const node = path.node as t.OptionalMemberExpression;
        if (node.object && isUtilitiesAiAccess(node.object)) totalAiAccesses++;
      },
    });

    // If >=3 total accesses, the component is designed for AI environments — skip
    if (totalAiAccesses >= 3) return violations;

    traverse(ast, {
      MemberExpression(path: NodePath<t.MemberExpression>) {
        // We want to find utilities.ai.SomeMethod or utilities.ai.someProp
        if (!isUtilitiesAiMethodAccess(path.node)) return;

        // Skip if using optional chaining
        if (isOptionalAiAccess(path)) return;

        // Skip if inside a guard
        if (isInsideAiGuard(path)) return;

        const propertyName = t.isIdentifier(path.node.property)
          ? path.node.property.name
          : '(computed)';

        violations.push({
          rule: 'ai-tools-availability-check',
          severity: 'medium',
          line: path.node.loc?.start.line ?? 0,
          column: path.node.loc?.start.column ?? 0,
          message: `Accessing "utilities.ai.${propertyName}" without checking if utilities.ai is available. The ai tools may be undefined if not configured.`,
          code: `utilities.ai.${propertyName}`,
          suggestion: {
            text: `Add a null check before accessing utilities.ai`,
            example: `if (utilities.ai) {\n  const result = await utilities.ai.${propertyName}(...);\n}`,
          },
        });
      },
    });

    return violations;
  }
}
