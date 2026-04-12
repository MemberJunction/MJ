import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';

/**
 * Rule: runview-result-null-safety
 *
 * Warns when RunView/RunQuery result.Results is accessed without first checking
 * result.Success. Accessing .Results without a Success guard can lead to
 * operating on undefined data when the query fails.
 *
 * Correct pattern:
 *   if (result.Success) {
 *     result.Results.map(...);
 *   }
 *
 * Incorrect pattern:
 *   result.Results.map(...);  // No Success check
 *
 * Severity: medium
 * Applies to: all components
 */

/**
 * Checks whether a callee node matches utilities.rv.RunView or utilities.rv.RunViews.
 */
function isRunViewCall(callee: t.Expression | t.V8IntrinsicIdentifier): boolean {
  return (
    t.isMemberExpression(callee) &&
    t.isMemberExpression(callee.object) &&
    t.isIdentifier(callee.object.object) &&
    callee.object.object.name === 'utilities' &&
    t.isIdentifier(callee.object.property) &&
    callee.object.property.name === 'rv' &&
    t.isIdentifier(callee.property) &&
    (callee.property.name === 'RunView' || callee.property.name === 'RunViews')
  );
}

/**
 * Checks whether a callee node matches utilities.rq.RunQuery.
 */
function isRunQueryCall(callee: t.Expression | t.V8IntrinsicIdentifier): boolean {
  return (
    t.isMemberExpression(callee) &&
    t.isMemberExpression(callee.object) &&
    t.isIdentifier(callee.object.object) &&
    callee.object.object.name === 'utilities' &&
    t.isIdentifier(callee.object.property) &&
    callee.object.property.name === 'rq' &&
    t.isIdentifier(callee.property) &&
    callee.property.name === 'RunQuery'
  );
}

/**
 * Collects variable names assigned from RunView/RunQuery await expressions.
 */
function collectResultVariables(ast: t.File): Set<string> {
  const resultVars = new Set<string>();

  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (!t.isIdentifier(path.node.id)) return;
      const init = path.node.init;
      if (!init || !t.isAwaitExpression(init)) return;
      if (!t.isCallExpression(init.argument)) return;

      const callee = init.argument.callee;
      if (isRunViewCall(callee) || isRunQueryCall(callee)) {
        resultVars.add(path.node.id.name);
      }
    },
    noScope: true,
  });

  return resultVars;
}

/**
 * Checks if a given NodePath is inside an if-block that tests `varName.Success`
 * or `varName?.Success`, or is preceded by an early-return guard like
 * `if (!result.Success) { return; }`.
 */
function isInsideSuccessGuard(
  path: NodePath,
  varName: string,
): boolean {
  let current: NodePath | null = path.parentPath;

  while (current) {
    if (current.isIfStatement()) {
      if (testChecksSuccess(current.node.test, varName)) {
        // Ensure our path is in the consequent (true branch), not the alternate
        if (isDescendantOf(path.node, current.node.consequent)) {
          return true;
        }
      }
    }

    // Also check logical && guards: result.Success && result.Results.map(...)
    if (current.isLogicalExpression() && current.node.operator === '&&') {
      if (testChecksSuccess(current.node.left, varName)) {
        return true;
      }
    }

    // Check conditional (ternary): result.Success ? result.Results.map(...) : []
    if (current.isConditionalExpression()) {
      if (testChecksSuccess(current.node.test, varName)) {
        return true;
      }
    }

    current = current.parentPath;
  }

  // Check for early-return guard pattern: if (!result.Success) { return; }
  // If such a guard exists before this path in the same block, the code after
  // it is effectively guarded.
  if (isPrecededByEarlyReturnGuard(path, varName)) {
    return true;
  }

  return false;
}

/**
 * Checks if a path is preceded by an early-return guard like:
 *   if (!result.Success) { ... return; }
 *   if (!result?.Success) { ... return; }
 *
 * This means any code after that if-statement is implicitly guarded.
 */
function isPrecededByEarlyReturnGuard(
  path: NodePath,
  varName: string,
): boolean {
  // Walk up to find the containing block statement
  let blockPath: NodePath | null = path;
  while (blockPath && !blockPath.isBlockStatement() && !blockPath.isProgram()) {
    blockPath = blockPath.parentPath;
  }
  if (!blockPath) return false;

  const container = blockPath.node;
  const body: t.Statement[] = t.isBlockStatement(container)
    ? container.body
    : t.isProgram(container)
      ? container.body
      : [];

  // Find the line of our target node
  const targetLine = path.node.loc?.start.line ?? 0;

  for (const stmt of body) {
    // Only look at statements that come before the current path
    if ((stmt.loc?.start.line ?? 0) >= targetLine) break;

    if (
      t.isIfStatement(stmt) &&
      testChecksNegatedSuccess(stmt.test, varName) &&
      blockContainsReturn(stmt.consequent)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a test expression is a negated Success check:
 *   !result.Success, !result?.Success
 */
function testChecksNegatedSuccess(test: t.Node, varName: string): boolean {
  if (t.isUnaryExpression(test) && test.operator === '!') {
    return testChecksSuccess(test.argument, varName);
  }
  return false;
}

/**
 * Checks if a block (or single statement) contains a return statement.
 */
function blockContainsReturn(node: t.Statement): boolean {
  if (t.isReturnStatement(node)) return true;
  if (t.isBlockStatement(node)) {
    return node.body.some(s => t.isReturnStatement(s));
  }
  return false;
}

/**
 * Checks if a test expression is checking `varName.Success` / `varName?.Success`
 * or `varName.Results` / `varName?.Results` (truthiness check on Results is also
 * a valid guard since it confirms the result object and Results array exist).
 */
function testChecksSuccess(test: t.Node, varName: string): boolean {
  // Direct: result.Success or result.Results
  if (
    t.isMemberExpression(test) &&
    t.isIdentifier(test.object) &&
    test.object.name === varName &&
    t.isIdentifier(test.property) &&
    (test.property.name === 'Success' || test.property.name === 'Results')
  ) {
    return true;
  }

  // Optional chaining: result?.Success or result?.Results
  if (
    t.isOptionalMemberExpression(test) &&
    t.isIdentifier(test.object) &&
    test.object.name === varName &&
    t.isIdentifier(test.property) &&
    (test.property.name === 'Success' || test.property.name === 'Results')
  ) {
    return true;
  }

  // Logical AND: result.Success && ...
  if (t.isLogicalExpression(test) && test.operator === '&&') {
    return testChecksSuccess(test.left, varName) || testChecksSuccess(test.right, varName);
  }

  return false;
}

/**
 * Simple check: is targetNode a descendant of containerNode?
 * Uses a traversal to find the target within the container.
 */
function isDescendantOf(targetNode: t.Node, containerNode: t.Node): boolean {
  if (targetNode === containerNode) return true;

  let found = false;
  traverse(containerNode, {
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

export const runviewResultNullSafetyRule: LintRule = {
  name: 'runview-result-null-safety',
  appliesTo: 'all',
  test: (ast) => {
    const violations: Violation[] = [];

    const resultVars = collectResultVariables(ast);
    if (resultVars.size === 0) return violations;

    // Find .Results accesses on result variables and check for Success guards
    traverse(ast, {
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (!t.isIdentifier(path.node.object) || !t.isIdentifier(path.node.property)) return;
        if (path.node.property.name !== 'Results') return;

        const varName = path.node.object.name;
        if (!resultVars.has(varName)) return;

        if (!isInsideSuccessGuard(path, varName)) {
          violations.push({
            rule: 'runview-result-null-safety',
            severity: 'medium',
            line: path.node.loc?.start.line ?? 0,
            column: path.node.loc?.start.column ?? 0,
            message: `Accessing "${varName}.Results" without checking "${varName}.Success" first. RunView/RunQuery can fail, and .Results may be undefined when Success is false.`,
            code: `${varName}.Results`,
            suggestion: {
              text: `Wrap in a Success check before accessing Results`,
              example: `if (${varName}.Success) {\n  ${varName}.Results.map(...);\n} else {\n  console.error('Query failed:', ${varName}.ErrorMessage);\n}`,
            },
          });
        }
      },

      // Optional chaining (result?.Results) is inherently null-safe — do not flag it.
      // It prevents crashes when result is null/undefined, which is a valid safety pattern.
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(runviewResultNullSafetyRule);
