import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Helper function to extract function name from a NodePath
 */
function getFunctionName(path: NodePath): string | null {
  const node = path.node;

  // Check for named function
  if (t.isFunctionDeclaration(node) && node.id) {
    return node.id.name;
  }

  // Check for arrow function assigned to variable
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    const parent = path.parent;
    if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
      return parent.id.name;
    }
  }

  // Check for function assigned as property
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
    const parent = path.parent;
    if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) {
      return parent.key.name;
    }
  }

  return null;
}

/**
 * Rule: react-hooks-rules
 *
 * Enforces the Rules of Hooks:
 * 1. Only call hooks at the top level (not inside loops, conditions, or nested functions)
 * 2. Only call hooks from React functions (components or custom hooks)
 * 3. Hooks must be called in the same order on every render
 *
 * Detects:
 * - Hooks called inside non-component/non-hook functions
 * - Hooks called conditionally (if statements, ternary, logical expressions)
 * - Hooks called inside loops
 * - Hooks called inside try/catch blocks (high severity warning)
 * - Hooks called after conditional early returns
 *
 * Severity: critical (most violations), high (try/catch blocks)
 * Applies to: all components
 */
export const reactHooksRulesRule: LintRule = {
  name: 'react-hooks-rules',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];
    const hooks = ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect'];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        if (t.isIdentifier(path.node.callee) && hooks.includes(path.node.callee.name)) {
          const hookName = path.node.callee.name;

          // Rule 1: Check if hook is inside the main component function or custom hook
          let funcParent = path.getFunctionParent();

          if (funcParent) {
            const funcName = getFunctionName(funcParent);

            // Violation: Hook not in component or custom hook
            if (funcName && funcName !== componentName && !funcName.startsWith('use')) {
              violations.push({
                rule: 'react-hooks-rules',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `React Hook "${hookName}" cannot be called inside function "${funcName}". Hooks can only be called at the top level of React components or custom hooks.`,
                code: path.toString().substring(0, 100),
              });
              return; // Skip further checks for this hook
            }
          }

          // Rule 2: Check if hook is inside a conditional (if statement)
          let parent: NodePath | null = path.parentPath;
          while (parent) {
            // Check if we've reached the component function - stop looking
            if (t.isFunctionDeclaration(parent.node) || t.isFunctionExpression(parent.node) || t.isArrowFunctionExpression(parent.node)) {
              const parentFuncName = getFunctionName(parent as NodePath<t.FunctionDeclaration>);
              if (parentFuncName === componentName || parentFuncName?.startsWith('use')) {
                break; // We've reached the component/hook boundary
              }
            }

            // Check for conditional statements
            if (t.isIfStatement(parent.node)) {
              violations.push({
                rule: 'react-hooks-rules',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `React Hook "${hookName}" is called conditionally. Hooks must be called in the exact same order in every component render.`,
                code: path.toString().substring(0, 100),
              });
              break;
            }

            // Check for ternary expressions
            if (t.isConditionalExpression(parent.node)) {
              violations.push({
                rule: 'react-hooks-rules',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `React Hook "${hookName}" is called conditionally in a ternary expression. Hooks must be called unconditionally.`,
                code: path.toString().substring(0, 100),
              });
              break;
            }

            // Check for logical expressions (&&, ||)
            if (t.isLogicalExpression(parent.node)) {
              violations.push({
                rule: 'react-hooks-rules',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `React Hook "${hookName}" is called conditionally in a logical expression. Hooks must be called unconditionally.`,
                code: path.toString().substring(0, 100),
              });
              break;
            }

            // Check for switch statements
            if (t.isSwitchStatement(parent.node) || t.isSwitchCase(parent.node)) {
              violations.push({
                rule: 'react-hooks-rules',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `React Hook "${hookName}" is called inside a switch statement. Hooks must be called at the top level.`,
                code: path.toString().substring(0, 100),
              });
              break;
            }

            // Rule 3: Check for loops
            if (
              t.isForStatement(parent.node) ||
              t.isForInStatement(parent.node) ||
              t.isForOfStatement(parent.node) ||
              t.isWhileStatement(parent.node) ||
              t.isDoWhileStatement(parent.node)
            ) {
              violations.push({
                rule: 'react-hooks-rules',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `React Hook "${hookName}" may not be called inside a loop. This can lead to hooks being called in different order between renders.`,
                code: path.toString().substring(0, 100),
              });
              break;
            }

            // Rule 4: Check for try/catch blocks
            if (t.isTryStatement(parent.node) || t.isCatchClause(parent.node)) {
              violations.push({
                rule: 'react-hooks-rules',
                severity: 'high', // Less severe as it might be intentional
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `React Hook "${hookName}" is called inside a try/catch block. While not strictly forbidden, this can lead to issues if the hook throws.`,
                code: path.toString().substring(0, 100),
              });
              break;
            }

            // Rule 5: Check for early returns before this hook
            // This is complex and would need to track control flow, so we'll do a simpler check
            if (t.isBlockStatement(parent.node)) {
              const statements = parent.node.body;

              // Find the statement that contains this hook by walking up the path
              let statementNode: NodePath | null = path.parentPath;
              while (statementNode && !statements.includes(statementNode.node as t.Statement)) {
                statementNode = statementNode.parentPath;
              }

              if (statementNode) {
                const hookIndex = statements.indexOf(statementNode.node as t.Statement);

                // Check if there's a return statement before this hook
                for (let i = 0; i < hookIndex; i++) {
                  const stmt = statements[i];
                  if (t.isReturnStatement(stmt)) {
                    violations.push({
                      rule: 'react-hooks-rules',
                      severity: 'critical',
                      line: path.node.loc?.start.line || 0,
                      column: path.node.loc?.start.column || 0,
                      message: `React Hook "${hookName}" is called after a conditional early return. All hooks must be called before any conditional returns.`,
                      code: path.toString().substring(0, 100),
                    });
                    break;
                  }

                  // Check for conditional returns
                  // NOTE: This check is too aggressive and produces false positives
                  // It triggers when ANY if statement exists before hooks, even if the early return
                  // is in the render section (after hooks) or in nested callbacks
                  // TODO: Improve this to only catch actual violations where hooks come after conditional returns
                  // if (t.isIfStatement(stmt) && ComponentLinter.containsReturn(stmt)) {
                  //   violations.push({
                  //     rule: 'react-hooks-rules',
                  //     severity: 'critical',
                  //     line: path.node.loc?.start.line || 0,
                  //     column: path.node.loc?.start.column || 0,
                  //     message: `React Hook "${hookName}" is called after a possible early return. Move this hook before any conditional logic.`,
                  //     code: path.toString().substring(0, 100),
                  //   });
                  //   break;
                  // }
                }
              }
            }

            parent = parent.parentPath;
          }
        }
      },
    });

    return violations;
  },
};
