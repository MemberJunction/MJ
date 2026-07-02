import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import type { RunQueryResult, RunViewResult } from '@memberjunction/core';

/**
 * Rule: data-result-validation
 *
 * Consolidates all RunView AND RunQuery RESULT USAGE validation into one rule.
 * Absorbs checks from:
 * - runview-runquery-result-validation (all)
 * - runquery-runview-spread-operator (all)
 * - runview-result-null-safety (all)
 *
 * Architecture:
 * - Phase 1: Collect result variables from await utilities.rv.RunView/RunViews/rq.RunQuery
 * - Phase 2: Validate usage of tracked result variables
 *
 * Checks:
 * 1. Invalid property access (.data, .rows, .records -> suggest .Results)
 * 2. Direct array method on result (.map, .filter, etc. -> use .Results.map)
 * 3. Passing result to setState without .Results
 * 4. Array.isArray pattern on result (always false since result is object)
 * 5. .length on result object
 * 6. Incorrect nested property access (result.data.entities)
 * 7. Destructuring invalid properties (const { data } = result)
 * 8. Weak fallback pattern (result?.records ?? result?.Rows ?? [])
 * 9. Spread operator on result object ([...result] or {...result})
 * 10. Missing Success check - .Results accessed without Success guard (medium severity)
 * 11. Incorrect optional check (.length on result)
 *
 * Severity: critical/high/medium
 * Applies to: all components
 */

const RULE_NAME = 'data-result-validation';

// Valid properties per result type
const RUNVIEW_RESULT_PROPS: readonly string[] = [
  'Success', 'Results', 'UserViewRunID', 'RowCount', 'TotalRowCount', 'ExecutionTime', 'ErrorMessage',
] as const satisfies readonly (keyof RunViewResult)[];

const RUNQUERY_RESULT_PROPS: readonly string[] = [
  'QueryID', 'QueryName', 'Success', 'Results', 'RowCount', 'TotalRowCount',
  'ExecutionTime', 'ErrorMessage', 'AppliedParameters', 'CacheHit', 'CacheKey', 'CacheTTLRemaining',
] as const satisfies readonly (keyof RunQueryResult)[];

const VALID_RUNVIEW_RESULT = new Set(RUNVIEW_RESULT_PROPS);
const VALID_RUNQUERY_RESULT = new Set(RUNQUERY_RESULT_PROPS);

const SEARCH_RESULT_PROPS: readonly string[] = [
  'Success', 'Results', 'TotalCount', 'ElapsedMs', 'SourceCounts', 'Providers', 'ErrorMessage',
] as const;

const VALID_SEARCH_RESULT = new Set(SEARCH_RESULT_PROPS);

const ARRAY_METHODS = new Set(['map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every', 'sort', 'concat']);

const ARRAY_EXPECTING_FUNCS = new Set([
  'map', 'filter', 'forEach', 'reduce', 'sort', 'concat',
  'processChartData', 'processData', 'transformData',
  'setData', 'setItems', 'setResults', 'setRows',
]);

const INCORRECT_TO_CORRECT: Record<string, string> = {
  data: 'Results', Data: 'Results',
  rows: 'Results', Rows: 'Results',
  records: 'Results', Records: 'Results',
  items: 'Results', Items: 'Results',
  values: 'Results', Values: 'Results',
  result: 'Results', Result: 'Results',
  resultSet: 'Results', ResultSet: 'Results',
  dataset: 'Results', Dataset: 'Results',
  response: 'Results', Response: 'Results',
};

type MethodType = 'RunView' | 'RunViews' | 'RunQuery' | 'Search' | 'PreviewSearch';

interface ResultVarInfo {
  line: number;
  column: number;
  method: MethodType;
  varName: string;
}

// ── Phase 1: Collect result variables ────────────────────────────────

/**
 * Attempts to extract utilities sub-object name and method name from a callee node.
 * Handles both MemberExpression (direct) and OptionalMemberExpression (optional chaining) patterns.
 * Returns [subObject, method] if matched, null otherwise.
 */
function extractUtilitiesCallInfo(callee: t.Node): [string, string] | null {
  // Get the method name from the outermost property
  let methodName: string | null = null;
  let objectNode: t.Node | null = null;

  if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
    methodName = callee.property.name;
    objectNode = callee.object;
  } else if (t.isOptionalMemberExpression(callee) && t.isIdentifier(callee.property)) {
    methodName = callee.property.name;
    objectNode = callee.object;
  }

  if (!methodName || !objectNode) return null;

  // Check if the object is utilities.xxx (direct or optional)
  let subObject: string | null = null;

  if (t.isMemberExpression(objectNode) && t.isIdentifier(objectNode.object) &&
      objectNode.object.name === 'utilities' && t.isIdentifier(objectNode.property)) {
    subObject = objectNode.property.name;
  } else if (t.isOptionalMemberExpression(objectNode) && t.isIdentifier(objectNode.object) &&
      objectNode.object.name === 'utilities' && t.isIdentifier(objectNode.property)) {
    subObject = objectNode.property.name;
  }

  if (!subObject) return null;

  return [subObject, methodName];
}

/**
 * Resolves a MethodType from a utilities sub-object name and method name.
 */
function resolveMethodType(subObject: string, method: string): MethodType | null {
  if (subObject === 'rv' && (method === 'RunView' || method === 'RunViews')) {
    return method as MethodType;
  }
  if (subObject === 'rq' && method === 'RunQuery') return 'RunQuery';
  if (subObject === 'search' && method === 'Search') return 'Search';
  if (subObject === 'search' && method === 'PreviewSearch') return 'PreviewSearch';
  return null;
}

/**
 * Records a result variable from an AwaitExpression's parent (variable declarator or assignment).
 */
function recordResultVariable(
  path: NodePath<t.AwaitExpression>,
  methodType: MethodType,
  resultVariables: Map<string, ResultVarInfo>,
): void {
  const parent = path.parent;
  if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
    resultVariables.set(parent.id.name, {
      line: parent.id.loc?.start.line || 0,
      column: parent.id.loc?.start.column || 0,
      method: methodType,
      varName: parent.id.name,
    });
  } else if (t.isAssignmentExpression(parent) && t.isIdentifier(parent.left)) {
    resultVariables.set(parent.left.name, {
      line: parent.left.loc?.start.line || 0,
      column: parent.left.loc?.start.column || 0,
      method: methodType,
      varName: parent.left.name,
    });
  }
}

function collectResultVariables(ast: t.File): Map<string, ResultVarInfo> {
  const resultVariables = new Map<string, ResultVarInfo>();

  traverse(ast, {
    AwaitExpression(path: NodePath<t.AwaitExpression>) {
      const callExpr = path.node.argument;

      // Handle both CallExpression and OptionalCallExpression
      if (!t.isCallExpression(callExpr) && !t.isOptionalCallExpression(callExpr)) return;

      const info = extractUtilitiesCallInfo(callExpr.callee);
      if (!info) return;

      const methodType = resolveMethodType(info[0], info[1]);
      if (!methodType) return;

      recordResultVariable(path, methodType, resultVariables);
    },
  });

  return resultVariables;
}

// ── Scope-based binding check ────────────────────────────────────────

function isVariableFromRunQueryOrView(path: NodePath, varName: string, methodName: string): boolean {
  const binding = path.scope.getBinding(varName);
  if (!binding) return false;

  const bindingPath = binding.path;
  if (!t.isVariableDeclarator(bindingPath.node)) return false;

  const init = bindingPath.node.init;
  if (!init) return false;

  // Handle both CallExpression and OptionalCallExpression inside AwaitExpression
  if (t.isAwaitExpression(init) && (t.isCallExpression(init.argument) || t.isOptionalCallExpression(init.argument))) {
    const call = init.argument;
    const info = extractUtilitiesCallInfo(call.callee);
    if (info) {
      const [subObj, calledMethod] = info;
      if (methodName === 'RunView' && subObj === 'rv' && (calledMethod === 'RunView' || calledMethod === 'RunViews')) return true;
      if (methodName === 'RunQuery' && subObj === 'rq' && calledMethod === 'RunQuery') return true;
      if (methodName === 'Search' && subObj === 'search' && calledMethod === 'Search') return true;
      if (methodName === 'PreviewSearch' && subObj === 'search' && calledMethod === 'PreviewSearch') return true;
    }

    // Fallback: check just the method name without full utilities path
    if (t.isCallExpression(call) && t.isMemberExpression(call.callee) && t.isIdentifier(call.callee.property)) {
      const calledMethod = call.callee.property.name;
      const isFromMethod = calledMethod === methodName || (methodName === 'RunView' && calledMethod === 'RunViews');
      return isFromMethod;
    }
  }

  return false;
}

// ── Success guard checking ───────────────────────────────────────────

function testChecksSuccess(test: t.Node, varName: string): boolean {
  if (
    t.isMemberExpression(test) &&
    t.isIdentifier(test.object) &&
    test.object.name === varName &&
    t.isIdentifier(test.property) &&
    (test.property.name === 'Success' || test.property.name === 'Results')
  ) return true;

  if (
    t.isOptionalMemberExpression(test) &&
    t.isIdentifier(test.object) &&
    test.object.name === varName &&
    t.isIdentifier(test.property) &&
    (test.property.name === 'Success' || test.property.name === 'Results')
  ) return true;

  if (t.isLogicalExpression(test) && test.operator === '&&') {
    return testChecksSuccess(test.left, varName) || testChecksSuccess(test.right, varName);
  }

  return false;
}

function testChecksNegatedSuccess(test: t.Node, varName: string): boolean {
  if (t.isUnaryExpression(test) && test.operator === '!') {
    return testChecksSuccess(test.argument, varName);
  }
  return false;
}

function blockContainsReturn(node: t.Statement): boolean {
  if (t.isReturnStatement(node)) return true;
  if (t.isBlockStatement(node)) return node.body.some(s => t.isReturnStatement(s));
  return false;
}

function isDescendantOf(targetNode: t.Node, containerNode: t.Node): boolean {
  if (targetNode === containerNode) return true;
  let found = false;
  traverse(containerNode, {
    enter(innerPath: NodePath) {
      if (innerPath.node === targetNode) { found = true; innerPath.stop(); }
    },
    noScope: true,
  });
  return found;
}

function isPrecededByEarlyReturnGuard(path: NodePath, varName: string): boolean {
  let blockPath: NodePath | null = path;
  while (blockPath && !blockPath.isBlockStatement() && !blockPath.isProgram()) {
    blockPath = blockPath.parentPath;
  }
  if (!blockPath) return false;

  const container = blockPath.node;
  const body: t.Statement[] = t.isBlockStatement(container) ? container.body : t.isProgram(container) ? container.body : [];
  const targetLine = path.node.loc?.start.line ?? 0;

  for (const stmt of body) {
    if ((stmt.loc?.start.line ?? 0) >= targetLine) break;
    if (
      t.isIfStatement(stmt) &&
      testChecksNegatedSuccess(stmt.test, varName) &&
      blockContainsReturn(stmt.consequent)
    ) return true;
  }

  return false;
}

function isInsideSuccessGuard(path: NodePath, varName: string): boolean {
  let current: NodePath | null = path.parentPath;

  while (current) {
    if (current.isIfStatement()) {
      if (testChecksSuccess(current.node.test, varName) && isDescendantOf(path.node, current.node.consequent)) {
        return true;
      }
    }
    if (current.isLogicalExpression() && current.node.operator === '&&') {
      if (testChecksSuccess(current.node.left, varName)) return true;
    }
    if (current.isConditionalExpression()) {
      if (testChecksSuccess(current.node.test, varName)) return true;
    }
    current = current.parentPath;
  }

  return isPrecededByEarlyReturnGuard(path, varName);
}

// ── Property access validation helper ────────────────────────────────

function validatePropertyAccess(
  objName: string,
  propName: string,
  isFromRunQuery: boolean,
  isFromRunView: boolean,
  isFromSearch: boolean,
  line: number,
  column: number,
  code: string,
  violations: Violation[],
): void {
  if (!isFromRunQuery && !isFromRunView && !isFromSearch) return;

  const isValidQueryProp = VALID_RUNQUERY_RESULT.has(propName);
  const isValidViewProp = VALID_RUNVIEW_RESULT.has(propName);
  const isValidSearchProp = VALID_SEARCH_RESULT.has(propName);

  if (isFromRunQuery && !isValidQueryProp) {
    const suggestion = INCORRECT_TO_CORRECT[propName];
    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line, column,
      message: suggestion
        ? `RunQuery results don't have a ".${propName}" property. Use ".${suggestion}" instead. Change "${objName}.${propName}" to "${objName}.${suggestion}"`
        : `Invalid property "${propName}" on RunQuery result. Valid properties: ${RUNQUERY_RESULT_PROPS.join(', ')}`,
      code,
    });
  } else if (isFromRunView && !isValidViewProp) {
    const suggestion = INCORRECT_TO_CORRECT[propName];
    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line, column,
      message: suggestion
        ? `RunView results don't have a ".${propName}" property. Use ".${suggestion}" instead. Change "${objName}.${propName}" to "${objName}.${suggestion}"`
        : `Invalid property "${propName}" on RunView result. Valid properties: ${RUNVIEW_RESULT_PROPS.join(', ')}`,
      code,
    });
  } else if (isFromSearch && !isValidSearchProp) {
    const suggestion = INCORRECT_TO_CORRECT[propName];
    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line, column,
      message: suggestion
        ? `Search results don't have a ".${propName}" property. Use ".${suggestion}" instead. Change "${objName}.${propName}" to "${objName}.${suggestion}"`
        : `Invalid property "${propName}" on Search result. Valid properties: ${SEARCH_RESULT_PROPS.join(', ')}`,
      code,
    });
  }
}

// ── Main Rule ────────────────────────────────────────────────────────

@RegisterClass(BaseLintRule, 'data-result-validation')
export class DataResultValidationRule extends BaseLintRule {
  get Name() { return 'data-result-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File): Violation[] {
    const violations: Violation[] = [];

    // Phase 1: Collect result variables
    const resultVariables = collectResultVariables(ast);
    if (resultVariables.size === 0) return violations;

    // Collect simple set for null-safety (just variable names)
    const resultVarNames = new Set(resultVariables.keys());

    // Phase 2: Validate usage
    traverse(ast, {
      // ── Array methods + setState + array-expecting funcs ──────
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check 2: result.map(), result.filter(), etc.
        if (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && t.isIdentifier(callee.property)) {
          const objName = callee.object.name;
          const methodName = callee.property.name;

          if (ARRAY_METHODS.has(methodName)) {
            const isFromRunView = isVariableFromRunQueryOrView(path, objName, 'RunView');
            const isFromRunQuery = isVariableFromRunQueryOrView(path, objName, 'RunQuery');
            const isFromSearch = isVariableFromRunQueryOrView(path, objName, 'Search');
            const isFromPreviewSearch = isVariableFromRunQueryOrView(path, objName, 'PreviewSearch');

            if (isFromRunView || isFromRunQuery || isFromSearch || isFromPreviewSearch) {
              const methodType = isFromRunView ? 'RunView' : isFromRunQuery ? 'RunQuery' : isFromSearch ? 'Search' : 'PreviewSearch';
              violations.push({
                rule: RULE_NAME,
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Cannot call array method "${methodName}" directly on ${methodType} result. Use "${objName}.Results.${methodName}(...)" instead. ${methodType} returns an object with { Success, Results, ... }, not an array.`,
                code: `${objName}.${methodName}(...)`,
              });
            }
          }
        }

        // Check 3 & 4: setState patterns
        if (t.isIdentifier(callee)) {
          const funcName = callee.name;
          const setStatePatterns = [/^set[A-Z]/, /^update[A-Z]/];
          const isSetStateFunction = setStatePatterns.some((pattern) => pattern.test(funcName));

          if (isSetStateFunction && path.node.arguments.length > 0) {
            const firstArg = path.node.arguments[0];

            // Check 4: Array.isArray ternary pattern in setState
            if (t.isConditionalExpression(firstArg)) {
              const test = firstArg.test;
              const consequent = firstArg.consequent;

              if (
                t.isCallExpression(test) &&
                t.isMemberExpression(test.callee) &&
                t.isIdentifier(test.callee.object) &&
                test.callee.object.name === 'Array' &&
                t.isIdentifier(test.callee.property) &&
                test.callee.property.name === 'isArray' &&
                test.arguments.length === 1 &&
                t.isIdentifier(test.arguments[0])
              ) {
                const varName = test.arguments[0].name;
                if (resultVariables.has(varName) && t.isIdentifier(consequent) && consequent.name === varName) {
                  const resultInfo = resultVariables.get(varName)!;
                  violations.push({
                    rule: RULE_NAME,
                    severity: 'critical',
                    line: firstArg.loc?.start.line || 0,
                    column: firstArg.loc?.start.column || 0,
                    message: `Passing ${resultInfo.method} result with incorrect Array.isArray check to ${funcName}. This will always pass an empty array because ${resultInfo.method} returns an object, not an array.

Correct pattern:
  if (${varName}.Success) {
    ${funcName}(${varName}.Results || []);
  } else {
    console.error('Failed to load data:', ${varName}.ErrorMessage);
  }`,
                    code: `${funcName}(Array.isArray(${varName}) ? ${varName} : [])`,
                  });
                }
              }
            }

            // Check 3: Passing result directly to setState
            if (t.isIdentifier(firstArg) && resultVariables.has(firstArg.name)) {
              const resultInfo = resultVariables.get(firstArg.name)!;
              violations.push({
                rule: RULE_NAME,
                severity: 'critical',
                line: firstArg.loc?.start.line || 0,
                column: firstArg.loc?.start.column || 0,
                message: `Passing ${resultInfo.method} result directly to ${funcName}. Use "${firstArg.name}.Results" or check "${firstArg.name}.Success" first. ${resultInfo.method} returns { Success, Results, ErrorMessage }, not the data array.`,
                code: `${funcName}(${firstArg.name})`,
              });
            }
          }
        }

        // Check: passing result to array-expecting functions
        for (const arg of path.node.arguments) {
          if (!t.isIdentifier(arg) || !resultVariables.has(arg.name)) continue;

          const resultInfo = resultVariables.get(arg.name)!;
          let funcName = '';
          if (t.isIdentifier(path.node.callee)) {
            funcName = path.node.callee.name;
          } else if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property)) {
            funcName = path.node.callee.property.name;
          }

          if (ARRAY_EXPECTING_FUNCS.has(funcName.toLowerCase()) ||
              Array.from(ARRAY_EXPECTING_FUNCS).some((f) => funcName.toLowerCase().includes(f.toLowerCase()))) {
            violations.push({
              rule: RULE_NAME,
              severity: 'critical',
              line: arg.loc?.start.line || 0,
              column: arg.loc?.start.column || 0,
              message: `Passing ${resultInfo.method} result object directly to ${funcName}() which expects an array.
Correct pattern:
  if (${resultInfo.varName}?.Success) {
    ${funcName}(${resultInfo.varName}.Results);
  } else {
    console.error('${resultInfo.method} failed:', ${resultInfo.varName}?.ErrorMessage);
    ${funcName}([]); // Provide empty array as fallback
  }`,
              code: `${funcName}(${arg.name})`,
            });
          }
        }
      },

      // ── Property access (MemberExpression) ─────────────────────
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (!t.isIdentifier(path.node.object) || !t.isIdentifier(path.node.property)) return;

        const objName = path.node.object.name;
        const propName = path.node.property.name;

        const hasBinding = path.scope.hasBinding(objName);
        const isFromRunQuery = hasBinding && isVariableFromRunQueryOrView(path, objName, 'RunQuery');
        const isFromRunView = hasBinding && isVariableFromRunQueryOrView(path, objName, 'RunView');
        const isFromSearch = hasBinding && (isVariableFromRunQueryOrView(path, objName, 'Search') || isVariableFromRunQueryOrView(path, objName, 'PreviewSearch'));

        // Check 5: .length on result
        if (propName === 'length' && resultVariables.has(objName)) {
          const resultInfo = resultVariables.get(objName)!;
          violations.push({
            rule: RULE_NAME,
            severity: 'critical',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            message: `Cannot check .length on ${resultInfo.method} result directly. ${resultInfo.method} returns an object with Success and Results properties.
Correct pattern:
  if (${resultInfo.varName}?.Success && ${resultInfo.varName}?.Results?.length > 0) {
    // Process ${resultInfo.varName}.Results array
  }`,
            code: `${objName}.length`,
          });
        }

        // Check 1: Invalid property access
        validatePropertyAccess(objName, propName, isFromRunQuery, isFromRunView, isFromSearch,
          path.node.loc?.start.line || 0, path.node.loc?.start.column || 0,
          `${objName}.${propName}`, violations);

        // Check 6: Nested incorrect access like result.data.entities
        if (
          (isFromRunQuery || isFromRunView || isFromSearch) &&
          t.isMemberExpression(path.parent) &&
          t.isIdentifier(path.parent.property) &&
          (propName === 'data' || propName === 'Data')
        ) {
          const nestedProp = path.parent.property.name;
          const sourceType = isFromSearch ? 'Search' : 'RunQuery/RunView';
          violations.push({
            rule: RULE_NAME,
            severity: 'critical',
            line: path.parent.loc?.start.line || 0,
            column: path.parent.loc?.start.column || 0,
            message: `Incorrect nested property access "${objName}.${propName}.${nestedProp}". ${sourceType} results use ".Results" directly for the data array. Change to "${objName}.Results"`,
            code: `${objName}.${propName}.${nestedProp}`,
          });
        }

        // Check 10: Missing Success check (null safety)
        if (propName === 'Results' && resultVarNames.has(objName)) {
          if (!isInsideSuccessGuard(path, objName)) {
            const resultInfo = resultVariables.get(objName);
            const sourceDesc = resultInfo && (resultInfo.method === 'Search' || resultInfo.method === 'PreviewSearch')
              ? 'Search' : 'RunView/RunQuery';
            violations.push({
              rule: RULE_NAME,
              severity: 'medium',
              line: path.node.loc?.start.line ?? 0,
              column: path.node.loc?.start.column ?? 0,
              message: `Accessing "${objName}.Results" without checking "${objName}.Success" first. ${sourceDesc} can fail, and .Results may be undefined when Success is false.`,
              code: `${objName}.Results`,
              suggestion: {
                text: `Wrap in a Success check before accessing Results`,
                example: `if (${objName}.Success) {\n  ${objName}.Results.map(...);\n} else {\n  console.error('Query failed:', ${objName}.ErrorMessage);\n}`,
              },
            });
          }
        }
      },

      // ── Optional member expressions ────────────────────────────
      OptionalMemberExpression(path: NodePath<t.OptionalMemberExpression>) {
        if (!t.isIdentifier(path.node.object) || !t.isIdentifier(path.node.property)) return;

        const objName = path.node.object.name;
        const propName = path.node.property.name;

        const hasBinding = path.scope.hasBinding(objName);
        const isFromRunQuery = hasBinding && isVariableFromRunQueryOrView(path, objName, 'RunQuery');
        const isFromRunView = hasBinding && isVariableFromRunQueryOrView(path, objName, 'RunView');
        const isFromSearch = hasBinding && (isVariableFromRunQueryOrView(path, objName, 'Search') || isVariableFromRunQueryOrView(path, objName, 'PreviewSearch'));

        // Check 1 (optional chaining variant)
        validatePropertyAccess(objName, propName, isFromRunQuery, isFromRunView, isFromSearch,
          path.node.loc?.start.line || 0, path.node.loc?.start.column || 0,
          `${objName}?.${propName}`, violations);

        // Note: result?.Results is inherently null-safe — do NOT flag for missing Success check
      },

      // ── Check 8: Weak fallback patterns ────────────────────────
      LogicalExpression(path: NodePath<t.LogicalExpression>) {
        if (path.node.operator !== '??') return;

        const invalidAccesses: Array<{ objName: string; propName: string; line: number }> = [];

        const checkNode = (node: t.Node) => {
          if (t.isOptionalMemberExpression(node) && t.isIdentifier(node.object) && t.isIdentifier(node.property)) {
            const objName = node.object.name;
            const propName = node.property.name;

            const hasBinding = path.scope.hasBinding(objName);
            const isFromRunQuery = hasBinding && isVariableFromRunQueryOrView(path, objName, 'RunQuery');
            const isFromRunView = hasBinding && isVariableFromRunQueryOrView(path, objName, 'RunView');
            const isFromSearch = hasBinding && (isVariableFromRunQueryOrView(path, objName, 'Search') || isVariableFromRunQueryOrView(path, objName, 'PreviewSearch'));

            if (isFromRunQuery || isFromRunView || isFromSearch) {
              const isValidQueryProp = VALID_RUNQUERY_RESULT.has(propName);
              const isValidViewProp = VALID_RUNVIEW_RESULT.has(propName);
              const isValidSearchProp = VALID_SEARCH_RESULT.has(propName);

              if ((isFromRunQuery && !isValidQueryProp) || (isFromRunView && !isValidViewProp) || (isFromSearch && !isValidSearchProp)) {
                invalidAccesses.push({ objName, propName, line: node.loc?.start.line || 0 });
              }
            }
          } else if (t.isLogicalExpression(node) && node.operator === '??') {
            checkNode(node.left);
            checkNode(node.right);
          }
        };

        checkNode(path.node);

        if (invalidAccesses.length >= 2) {
          const objName = invalidAccesses[0].objName;
          const props = invalidAccesses.map((a) => a.propName).join(', ');

          violations.push({
            rule: RULE_NAME,
            severity: 'critical',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            message: `Weak fallback pattern detected: "${objName}?.${invalidAccesses[0].propName} ?? ${objName}?.${invalidAccesses[1].propName} ?? ..." uses multiple INVALID properties (${props}). This masks the real issue. Use "${objName}?.Results ?? []" instead.`,
            code: path.toString().substring(0, 100),
          });
        }
      },

      // ── Check 7: Destructuring invalid properties ──────────────
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (!t.isObjectPattern(path.node.id) || !t.isIdentifier(path.node.init)) return;

        const sourceName = path.node.init.name;
        const hasBinding = path.scope.hasBinding(sourceName);
        const isFromRunQuery = hasBinding && isVariableFromRunQueryOrView(path, sourceName, 'RunQuery');
        const isFromRunView = hasBinding && isVariableFromRunQueryOrView(path, sourceName, 'RunView');
        const isFromSearch = hasBinding && (isVariableFromRunQueryOrView(path, sourceName, 'Search') || isVariableFromRunQueryOrView(path, sourceName, 'PreviewSearch'));

        if (!isFromRunQuery && !isFromRunView && !isFromSearch) return;

        for (const prop of path.node.id.properties) {
          if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;

          const propName = prop.key.name;
          const isValidQueryProp = VALID_RUNQUERY_RESULT.has(propName);
          const isValidViewProp = VALID_RUNVIEW_RESULT.has(propName);
          const isValidSearchProp = VALID_SEARCH_RESULT.has(propName);

          if (isFromRunQuery && !isValidQueryProp) {
            const suggestion = INCORRECT_TO_CORRECT[propName];
            violations.push({
              rule: RULE_NAME,
              severity: 'critical',
              line: prop.loc?.start.line || 0,
              column: prop.loc?.start.column || 0,
              message: suggestion
                ? `Destructuring invalid property "${propName}" from RunQuery result. Use "${suggestion}" instead.`
                : `Destructuring invalid property "${propName}" from RunQuery result. Valid properties: ${RUNQUERY_RESULT_PROPS.join(', ')}`,
              code: `{ ${propName} }`,
            });
          } else if (isFromRunView && !isValidViewProp) {
            const suggestion = INCORRECT_TO_CORRECT[propName];
            violations.push({
              rule: RULE_NAME,
              severity: 'critical',
              line: prop.loc?.start.line || 0,
              column: prop.loc?.start.column || 0,
              message: suggestion
                ? `Destructuring invalid property "${propName}" from RunView result. Use "${suggestion}" instead.`
                : `Destructuring invalid property "${propName}" from RunView result. Valid properties: ${RUNVIEW_RESULT_PROPS.join(', ')}`,
              code: `{ ${propName} }`,
            });
          } else if (isFromSearch && !isValidSearchProp) {
            const suggestion = INCORRECT_TO_CORRECT[propName];
            violations.push({
              rule: RULE_NAME,
              severity: 'critical',
              line: prop.loc?.start.line || 0,
              column: prop.loc?.start.column || 0,
              message: suggestion
                ? `Destructuring invalid property "${propName}" from Search result. Use "${suggestion}" instead.`
                : `Destructuring invalid property "${propName}" from Search result. Valid properties: ${SEARCH_RESULT_PROPS.join(', ')}`,
              code: `{ ${propName} }`,
            });
          }
        }
      },

      // ── Check 4 & 11: ConditionalExpression patterns ───────────
      ConditionalExpression(path: NodePath<t.ConditionalExpression>) {
        const test = path.node.test;
        const consequent = path.node.consequent;
        const alternate = path.node.alternate;

        if (
          t.isCallExpression(test) &&
          t.isMemberExpression(test.callee) &&
          t.isIdentifier(test.callee.object) &&
          test.callee.object.name === 'Array' &&
          t.isIdentifier(test.callee.property) &&
          test.callee.property.name === 'isArray' &&
          test.arguments.length === 1 &&
          t.isIdentifier(test.arguments[0])
        ) {
          const varName = test.arguments[0].name;

          if (
            resultVariables.has(varName) &&
            t.isIdentifier(consequent) &&
            consequent.name === varName &&
            t.isArrayExpression(alternate) &&
            alternate.elements.length === 0
          ) {
            const resultInfo = resultVariables.get(varName)!;
            violations.push({
              rule: RULE_NAME,
              severity: 'critical',
              line: test.loc?.start.line || 0,
              column: test.loc?.start.column || 0,
              message: `${resultInfo.method} never returns an array directly. The pattern "Array.isArray(${varName}) ? ${varName} : []" will always evaluate to [] because ${varName} is an object with { Success, Results, ErrorMessage }.

Correct patterns:
  // Option 1: Simple with fallback
  ${varName}.Results || []

  // Option 2: Check success first
  if (${varName}.Success) {
    setData(${varName}.Results || []);
  } else {
    console.error('Failed:', ${varName}.ErrorMessage);
    setData([]);
  }`,
              code: `Array.isArray(${varName}) ? ${varName} : []`,
            });
          }
        }
      },

      // ── Check 9: Spread operator on result object ──────────────
      SpreadElement(path: NodePath<t.SpreadElement>) {
        if (!t.isIdentifier(path.node.argument)) return;

        const varName = path.node.argument.name;
        if (!resultVariables.has(varName)) return;

        const resultInfo = resultVariables.get(varName)!;
        violations.push({
          rule: RULE_NAME,
          severity: 'critical',
          line: path.node.loc?.start.line || 0,
          column: path.node.loc?.start.column || 0,
          message: `Cannot use spread operator on ${resultInfo.method} result object. Use ...${varName}.Results to spread the data array.

Correct pattern:
  const allData = [...existingData, ...${varName}.Results];

  // Or with null safety:
  const allData = [...existingData, ...(${varName}.Results || [])];`,
          code: `...${varName}`,
        });
      },

      // ── Check 11: IfStatement patterns ─────────────────────────
      IfStatement(path: NodePath<t.IfStatement>) {
        const test = path.node.test;

        // Pattern: if (result) - check for Results access without Success check
        if (t.isIdentifier(test) && resultVariables.has(test.name)) {
          const resultInfo = resultVariables.get(test.name)!;
          let checksSuccess = false;
          let checksResults = false;

          path.traverse({
            MemberExpression(innerPath: NodePath<t.MemberExpression>) {
              if (t.isIdentifier(innerPath.node.object) && innerPath.node.object.name === test.name) {
                const prop = t.isIdentifier(innerPath.node.property) ? innerPath.node.property.name : '';
                if (prop === 'Success') checksSuccess = true;
                if (prop === 'Results') checksResults = true;
              }
            },
          });

          if (checksResults && !checksSuccess) {
            violations.push({
              rule: RULE_NAME,
              severity: 'high',
              line: test.loc?.start.line || 0,
              column: test.loc?.start.column || 0,
              message: `Checking ${resultInfo.method} result without verifying Success property.
Correct pattern:
  if (${resultInfo.varName}?.Success) {
    const data = ${resultInfo.varName}.Results;
  } else {
    // Handle error: ${resultInfo.varName}.ErrorMessage
  }`,
              code: `if (${test.name})`,
            });
          }
        }

        // Pattern: if (result?.length)
        if (
          t.isOptionalMemberExpression(test) &&
          t.isIdentifier(test.object) &&
          t.isIdentifier(test.property) &&
          test.property.name === 'length' &&
          resultVariables.has(test.object.name)
        ) {
          const resultInfo = resultVariables.get(test.object.name)!;
          violations.push({
            rule: RULE_NAME,
            severity: 'critical',
            line: test.loc?.start.line || 0,
            column: test.loc?.start.column || 0,
            message: `Incorrect check: "${test.object.name}?.length" on ${resultInfo.method} result.
Correct pattern:
  if (${resultInfo.varName}?.Success && ${resultInfo.varName}?.Results?.length > 0) {
    const processedData = processChartData(${resultInfo.varName}.Results);
  }`,
            code: `if (${test.object.name}?.length)`,
          });
        }
      },
    });

    return violations;
  }
}
