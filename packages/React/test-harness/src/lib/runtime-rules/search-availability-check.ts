import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: search-availability-check
 *
 * Checks that `utilities.search` is guarded with a null/undefined check before use.
 * The `search` property on the utilities object may be undefined if the search
 * provider is not configured or available. Accessing methods on it without a guard
 * will throw a runtime error.
 *
 * Correct patterns:
 *   if (utilities.search) { await utilities.search.Search(...); }
 *   const result = await utilities.search?.Search(...);
 *
 * Incorrect pattern:
 *   const result = await utilities.search.Search(...);
 *
 * Severity: medium
 * Applies to: all components
 */

/**
 * Checks if a NodePath is inside a guard that checks `utilities.search` for truthiness.
 * Recognized guard patterns:
 *   - if (utilities.search) { ... }
 *   - if (utilities.search != null) { ... }
 *   - utilities.search && ...
 */
function isInsideSearchGuard(path: NodePath): boolean {
  let current: NodePath | null = path.parentPath;

  while (current) {
    // Check if statements
    if (current.isIfStatement()) {
      if (testChecksUtilitiesSearch(current.node.test)) {
        if (isInConsequent(path.node, current.node)) {
          return true;
        }
      }
    }

    // Check logical && guards: utilities.search && utilities.search.Search(...)
    if (current.isLogicalExpression() && current.node.operator === '&&') {
      if (testChecksUtilitiesSearch(current.node.left)) {
        return true;
      }
    }

    // Check ternary: utilities.search ? utilities.search.Search(...) : null
    if (current.isConditionalExpression()) {
      if (testChecksUtilitiesSearch(current.node.test)) {
        return true;
      }
    }

    // Check try/catch: try { utilities.search.Search(...) } catch { ... }
    if (current.isTryStatement()) {
      return true;
    }

    // Check for early-return guard in enclosing function:
    // if (!utilities.search) return;  OR  if (!utilities.search) { return; }
    if (current.isFunction()) {
      const body = current.get('body');
      if (body && !Array.isArray(body) && body.isBlockStatement()) {
        for (const stmt of body.get('body')) {
          if (stmt.isIfStatement()) {
            const test = stmt.node.test;
            // Check for: if (!utilities.search) return;
            if (t.isUnaryExpression(test) && test.operator === '!' && isUtilitiesSearchAccess(test.argument)) {
              return true;
            }
            // Check for: if (utilities.search == null) return;
            if (t.isBinaryExpression(test) && (test.operator === '==' || test.operator === '===')) {
              if (
                isUtilitiesSearchAccess(test.left) &&
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
 * Checks if a test expression is checking `utilities.search` for truthiness.
 */
function testChecksUtilitiesSearch(test: t.Node): boolean {
  // Direct: utilities.search
  if (isUtilitiesSearchAccess(test)) {
    return true;
  }

  // Negated null check: utilities.search != null  or  utilities.search !== null
  // Also: utilities.search !== undefined
  if (t.isBinaryExpression(test) && (test.operator === '!=' || test.operator === '!==')) {
    if (
      isUtilitiesSearchAccess(test.left) &&
      (t.isNullLiteral(test.right) || (t.isIdentifier(test.right) && test.right.name === 'undefined'))
    ) {
      return true;
    }
  }

  // Logical AND chain
  if (t.isLogicalExpression(test) && test.operator === '&&') {
    return testChecksUtilitiesSearch(test.left) || testChecksUtilitiesSearch(test.right);
  }

  return false;
}

/**
 * Checks if a node is `utilities.search` member expression.
 */
function isUtilitiesSearchAccess(node: t.Node): boolean {
  return (
    t.isMemberExpression(node) &&
    t.isIdentifier(node.object) &&
    node.object.name === 'utilities' &&
    t.isIdentifier(node.property) &&
    node.property.name === 'search'
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
 * Checks if a MemberExpression accesses a property/method on utilities.search
 * (i.e., utilities.search.Search or utilities.search.PreviewSearch).
 */
function isUtilitiesSearchMethodAccess(node: t.MemberExpression): boolean {
  return isUtilitiesSearchAccess(node.object);
}

/**
 * Checks if the access uses optional chaining at the search level.
 * Pattern: utilities.search?.Search(...)
 * In the AST this appears as an OptionalMemberExpression chain.
 */
function isOptionalSearchAccess(path: NodePath<t.MemberExpression>): boolean {
  const parent = path.parent;
  if (t.isOptionalCallExpression(parent) || t.isOptionalMemberExpression(parent)) {
    return true;
  }

  // Check if the utilities.search part itself is optional: utilities?.search?.method()
  if (t.isOptionalMemberExpression(path.node.object)) {
    return true;
  }

  return false;
}

@RegisterClass(BaseLintRule, 'search-availability-check')
export class SearchAvailabilityCheckRule extends BaseLintRule {
  get Name() { return 'search-availability-check'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File): Violation[] {
    const violations: Violation[] = [];

    // First pass: count total utilities.search accesses (guarded and unguarded)
    // If the component uses utilities.search extensively, it's designed for search environments
    let totalSearchAccesses = 0;
    traverse(ast, {
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (isUtilitiesSearchMethodAccess(path.node)) totalSearchAccesses++;
      },
      OptionalMemberExpression(path: NodePath) {
        const node = path.node as t.OptionalMemberExpression;
        if (node.object && isUtilitiesSearchAccess(node.object)) totalSearchAccesses++;
      },
    });

    // If >=3 total accesses, the component is designed for search environments — skip
    if (totalSearchAccesses >= 3) return violations;

    traverse(ast, {
      MemberExpression(path: NodePath<t.MemberExpression>) {
        // We want to find utilities.search.Search or utilities.search.PreviewSearch
        if (!isUtilitiesSearchMethodAccess(path.node)) return;

        // Skip if using optional chaining
        if (isOptionalSearchAccess(path)) return;

        // Skip if inside a guard
        if (isInsideSearchGuard(path)) return;

        const propertyName = t.isIdentifier(path.node.property)
          ? path.node.property.name
          : '(computed)';

        violations.push({
          rule: 'search-availability-check',
          severity: 'medium',
          line: path.node.loc?.start.line ?? 0,
          column: path.node.loc?.start.column ?? 0,
          message: `Accessing "utilities.search.${propertyName}" without checking if utilities.search is available. The search provider may be undefined if not configured.`,
          code: `utilities.search.${propertyName}`,
          suggestion: {
            text: `Add a null check before accessing utilities.search`,
            example: `if (utilities.search) {\n  const result = await utilities.search.${propertyName}(...);\n}`,
          },
        });
      },
    });

    return violations;
  }
}
