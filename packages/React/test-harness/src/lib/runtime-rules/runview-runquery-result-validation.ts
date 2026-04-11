import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';
import type { RunQueryResult, RunViewResult } from '@memberjunction/core';

// Extract property names from TypeScript types at compile time
const runQueryResultProps: readonly string[] = [
  'QueryID',
  'QueryName',
  'Success',
  'Results',
  'RowCount',
  'TotalRowCount',
  'ExecutionTime',
  'ErrorMessage',
  'AppliedParameters',
  'CacheHit',
  'CacheKey',
  'CacheTTLRemaining',
] as const satisfies readonly (keyof RunQueryResult)[];

const runViewResultProps: readonly string[] = [
  'Success',
  'Results',
  'UserViewRunID',
  'RowCount',
  'TotalRowCount',
  'ExecutionTime',
  'ErrorMessage',
] as const satisfies readonly (keyof RunViewResult)[];

/**
 * Helper to check if a variable was assigned from a RunQuery or RunView call.
 * Walks up the scope chain to find the variable declaration.
 *
 * NOTE: This is a standalone version of ComponentLinter.isVariableFromRunQueryOrView.
 * It checks the binding's initialization to determine the source method.
 */
function isVariableFromRunQueryOrView(path: NodePath, varName: string, methodName: string): boolean {
  const binding = path.scope.getBinding(varName);
  if (!binding) return false;

  const bindingPath = binding.path;
  if (!t.isVariableDeclarator(bindingPath.node)) return false;

  const init = bindingPath.node.init;
  if (!init) return false;

  // Check for direct await call: const result = await utilities.rv.RunView(...)
  if (t.isAwaitExpression(init) && t.isCallExpression(init.argument)) {
    const call = init.argument;
    if (t.isMemberExpression(call.callee) && t.isIdentifier(call.callee.property)) {
      const calledMethod = call.callee.property.name;

      // Check for utilities.rv.RunView/RunViews or utilities.rq.RunQuery
      if (t.isMemberExpression(call.callee.object) &&
          t.isIdentifier(call.callee.object.object) &&
          call.callee.object.object.name === 'utilities' &&
          t.isIdentifier(call.callee.object.property)) {
        const subObj = call.callee.object.property.name;

        if (methodName === 'RunView' && subObj === 'rv' && (calledMethod === 'RunView' || calledMethod === 'RunViews')) {
          return true;
        }
        if (methodName === 'RunQuery' && subObj === 'rq' && calledMethod === 'RunQuery') {
          return true;
        }
      }

      // Also check for direct method call patterns
      const isFromMethod = calledMethod === methodName ||
                           (methodName === 'RunView' && calledMethod === 'RunViews');
      return isFromMethod;
    }
  }

  return false;
}

/**
 * Rule: runview-runquery-result-validation
 *
 * Validates correct usage of RunView/RunQuery result objects.
 * Catches common mistakes like:
 * - Calling array methods directly on result objects
 * - Accessing invalid properties (e.g., .data instead of .Results)
 * - Missing Success check before accessing Results
 * - Array.isArray pattern that always fails on result objects
 * - Destructuring invalid properties
 *
 * Severity: critical/high
 * Applies to: all components
 *
 * Closure dependencies: Uses isVariableFromRunQueryOrView helper (extracted from ComponentLinter)
 */
export const runviewRunqueryResultValidationRule: LintRule = {
  name: 'runview-runquery-result-validation',
  appliesTo: 'all',
  test: (ast) => {
    const violations: Violation[] = [];

    const validRunQueryResultProps = new Set(runQueryResultProps);
    const validRunViewResultProps = new Set(runViewResultProps);

    const arrayMethods = new Set(['map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every', 'sort', 'concat']);

    const arrayExpectingFuncs = new Set([
      'map', 'filter', 'forEach', 'reduce', 'sort', 'concat',
      'processChartData', 'processData', 'transformData',
      'setData', 'setItems', 'setResults', 'setRows',
    ]);

    const incorrectToCorrectMap: Record<string, string> = {
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

    // Track variables that hold RunView/RunQuery results
    const resultVariables = new Map<
      string,
      {
        line: number;
        column: number;
        method: 'RunView' | 'RunViews' | 'RunQuery';
        varName: string;
      }
    >();

    // First pass: identify all RunView/RunQuery calls and their assigned variables
    traverse(ast, {
      AwaitExpression(path: NodePath<t.AwaitExpression>) {
        const callExpr = path.node.argument;

        if (t.isCallExpression(callExpr) && t.isMemberExpression(callExpr.callee)) {
          const callee = callExpr.callee;

          if (
            t.isMemberExpression(callee.object) &&
            t.isIdentifier(callee.object.object) &&
            callee.object.object.name === 'utilities' &&
            t.isIdentifier(callee.object.property)
          ) {
            const subObject = callee.object.property.name;
            const method = t.isIdentifier(callee.property) ? callee.property.name : '';

            let methodType: 'RunView' | 'RunViews' | 'RunQuery' | null = null;
            if (subObject === 'rv' && (method === 'RunView' || method === 'RunViews')) {
              methodType = method as 'RunView' | 'RunViews';
            } else if (subObject === 'rq' && method === 'RunQuery') {
              methodType = 'RunQuery';
            }

            if (methodType) {
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
          }
        }
      },
    });

    // Helper to validate property access
    const validatePropertyAccess = (
      objName: string,
      propName: string,
      isFromRunQuery: boolean,
      isFromRunView: boolean,
      line: number,
      column: number,
      code: string,
    ) => {
      if (!isFromRunQuery && !isFromRunView) return;

      const isValidQueryProp = validRunQueryResultProps.has(propName);
      const isValidViewProp = validRunViewResultProps.has(propName);

      if (isFromRunQuery && !isValidQueryProp) {
        const suggestion = incorrectToCorrectMap[propName];
        violations.push({
          rule: 'runview-runquery-result-validation',
          severity: 'critical',
          line,
          column,
          message: suggestion
            ? `RunQuery results don't have a ".${propName}" property. Use ".${suggestion}" instead. Change "${objName}.${propName}" to "${objName}.${suggestion}"`
            : `Invalid property "${propName}" on RunQuery result. Valid properties: ${runQueryResultProps.join(', ')}`,
          code,
        });
      } else if (isFromRunView && !isValidViewProp) {
        const suggestion = incorrectToCorrectMap[propName];
        violations.push({
          rule: 'runview-runquery-result-validation',
          severity: 'critical',
          line,
          column,
          message: suggestion
            ? `RunView results don't have a ".${propName}" property. Use ".${suggestion}" instead. Change "${objName}.${propName}" to "${objName}.${suggestion}"`
            : `Invalid property "${propName}" on RunView result. Valid properties: ${runViewResultProps.join(', ')}`,
          code,
        });
      }
    };

    // Second pass: check for incorrect usage patterns
    traverse(ast, {
      // Check for direct array method calls and property access
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for result.map(), result.filter(), etc.
        if (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && t.isIdentifier(callee.property)) {
          const objName = callee.object.name;
          const methodName = callee.property.name;

          if (arrayMethods.has(methodName)) {
            const isFromRunView = isVariableFromRunQueryOrView(path, objName, 'RunView');
            const isFromRunQuery = isVariableFromRunQueryOrView(path, objName, 'RunQuery');

            if (isFromRunView || isFromRunQuery) {
              const methodType = isFromRunView ? 'RunView' : 'RunQuery';
              violations.push({
                rule: 'runview-runquery-result-validation',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Cannot call array method "${methodName}" directly on ${methodType} result. Use "${objName}.Results.${methodName}(...)" instead. ${methodType} returns an object with { Success, Results, ... }, not an array.`,
                code: `${objName}.${methodName}(...)`,
              });
            }
          }
        }

        // Check for setState patterns
        if (t.isIdentifier(callee)) {
          const funcName = callee.name;
          const setStatePatterns = [/^set[A-Z]/, /^update[A-Z]/];
          const isSetStateFunction = setStatePatterns.some((pattern) => pattern.test(funcName));

          if (isSetStateFunction && path.node.arguments.length > 0) {
            const firstArg = path.node.arguments[0];

            // Check for Array.isArray ternary pattern in setState
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
                    rule: 'runview-runquery-result-validation',
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

            // Check for passing result directly to setState
            if (t.isIdentifier(firstArg) && resultVariables.has(firstArg.name)) {
              const resultInfo = resultVariables.get(firstArg.name)!;
              violations.push({
                rule: 'runview-runquery-result-validation',
                severity: 'critical',
                line: firstArg.loc?.start.line || 0,
                column: firstArg.loc?.start.column || 0,
                message: `Passing ${resultInfo.method} result directly to ${funcName}. Use "${firstArg.name}.Results" or check "${firstArg.name}.Success" first. ${resultInfo.method} returns { Success, Results, ErrorMessage }, not the data array.`,
                code: `${funcName}(${firstArg.name})`,
              });
            }
          }
        }

        // Check for passing result to array-expecting functions
        for (const arg of path.node.arguments) {
          if (t.isIdentifier(arg) && resultVariables.has(arg.name)) {
            const resultInfo = resultVariables.get(arg.name)!;
            let funcName = '';
            if (t.isIdentifier(path.node.callee)) {
              funcName = path.node.callee.name;
            } else if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property)) {
              funcName = path.node.callee.property.name;
            }

            if (arrayExpectingFuncs.has(funcName.toLowerCase()) ||
                Array.from(arrayExpectingFuncs).some((f) => funcName.toLowerCase().includes(f.toLowerCase()))) {
              violations.push({
                rule: 'runview-runquery-result-validation',
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
        }
      },

      // Check member expressions for invalid property access
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (t.isIdentifier(path.node.object) && t.isIdentifier(path.node.property)) {
          const objName = path.node.object.name;
          const propName = path.node.property.name;

          const isFromRunQuery = path.scope.hasBinding(objName) && isVariableFromRunQueryOrView(path, objName, 'RunQuery');
          const isFromRunView = path.scope.hasBinding(objName) && isVariableFromRunQueryOrView(path, objName, 'RunView');

          // Check for .length on result
          if (propName === 'length' && resultVariables.has(objName)) {
            const resultInfo = resultVariables.get(objName)!;
            violations.push({
              rule: 'runview-runquery-result-validation',
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

          validatePropertyAccess(
            objName,
            propName,
            isFromRunQuery,
            isFromRunView,
            path.node.loc?.start.line || 0,
            path.node.loc?.start.column || 0,
            `${objName}.${propName}`,
          );

          // Check for nested incorrect access like result.data.entities
          if (
            (isFromRunQuery || isFromRunView) &&
            t.isMemberExpression(path.parent) &&
            t.isIdentifier(path.parent.property) &&
            (propName === 'data' || propName === 'Data')
          ) {
            const nestedProp = path.parent.property.name;
            violations.push({
              rule: 'runview-runquery-result-validation',
              severity: 'critical',
              line: path.parent.loc?.start.line || 0,
              column: path.parent.loc?.start.column || 0,
              message: `Incorrect nested property access "${objName}.${propName}.${nestedProp}". RunQuery/RunView results use ".Results" directly for the data array. Change to "${objName}.Results"`,
              code: `${objName}.${propName}.${nestedProp}`,
            });
          }
        }
      },

      // Check optional member expressions
      OptionalMemberExpression(path: NodePath<t.OptionalMemberExpression>) {
        if (t.isIdentifier(path.node.object) && t.isIdentifier(path.node.property)) {
          const objName = path.node.object.name;
          const propName = path.node.property.name;

          const isFromRunQuery = path.scope.hasBinding(objName) && isVariableFromRunQueryOrView(path, objName, 'RunQuery');
          const isFromRunView = path.scope.hasBinding(objName) && isVariableFromRunQueryOrView(path, objName, 'RunView');

          validatePropertyAccess(
            objName,
            propName,
            isFromRunQuery,
            isFromRunView,
            path.node.loc?.start.line || 0,
            path.node.loc?.start.column || 0,
            `${objName}?.${propName}`,
          );
        }
      },

      // Check for weak fallback patterns
      LogicalExpression(path: NodePath<t.LogicalExpression>) {
        if (path.node.operator !== '??') return;

        const invalidAccesses: Array<{ objName: string; propName: string; line: number }> = [];

        const checkNode = (node: t.Node) => {
          if (t.isOptionalMemberExpression(node) && t.isIdentifier(node.object) && t.isIdentifier(node.property)) {
            const objName = node.object.name;
            const propName = node.property.name;

            const isFromRunQuery = path.scope.hasBinding(objName) && isVariableFromRunQueryOrView(path, objName, 'RunQuery');
            const isFromRunView = path.scope.hasBinding(objName) && isVariableFromRunQueryOrView(path, objName, 'RunView');

            if (isFromRunQuery || isFromRunView) {
              const isValidQueryProp = validRunQueryResultProps.has(propName);
              const isValidViewProp = validRunViewResultProps.has(propName);

              if ((isFromRunQuery && !isValidQueryProp) || (isFromRunView && !isValidViewProp)) {
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
            rule: 'runview-runquery-result-validation',
            severity: 'critical',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            message: `Weak fallback pattern detected: "${objName}?.${invalidAccesses[0].propName} ?? ${objName}?.${invalidAccesses[1].propName} ?? ..." uses multiple INVALID properties (${props}). This masks the real issue. Use "${objName}?.Results ?? []" instead.`,
            code: path.toString().substring(0, 100),
          });
        }
      },

      // Check destructuring patterns
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
          const sourceName = path.node.init.name;

          const isFromRunQuery = path.scope.hasBinding(sourceName) && isVariableFromRunQueryOrView(path, sourceName, 'RunQuery');
          const isFromRunView = path.scope.hasBinding(sourceName) && isVariableFromRunQueryOrView(path, sourceName, 'RunView');

          if (isFromRunQuery || isFromRunView) {
            for (const prop of path.node.id.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                const propName = prop.key.name;
                const isValidQueryProp = validRunQueryResultProps.has(propName);
                const isValidViewProp = validRunViewResultProps.has(propName);

                if (isFromRunQuery && !isValidQueryProp) {
                  const suggestion = incorrectToCorrectMap[propName];
                  violations.push({
                    rule: 'runview-runquery-result-validation',
                    severity: 'critical',
                    line: prop.loc?.start.line || 0,
                    column: prop.loc?.start.column || 0,
                    message: suggestion
                      ? `Destructuring invalid property "${propName}" from RunQuery result. Use "${suggestion}" instead.`
                      : `Destructuring invalid property "${propName}" from RunQuery result. Valid properties: ${runQueryResultProps.join(', ')}`,
                    code: `{ ${propName} }`,
                  });
                } else if (isFromRunView && !isValidViewProp) {
                  const suggestion = incorrectToCorrectMap[propName];
                  violations.push({
                    rule: 'runview-runquery-result-validation',
                    severity: 'critical',
                    line: prop.loc?.start.line || 0,
                    column: prop.loc?.start.column || 0,
                    message: suggestion
                      ? `Destructuring invalid property "${propName}" from RunView result. Use "${suggestion}" instead.`
                      : `Destructuring invalid property "${propName}" from RunView result. Valid properties: ${runViewResultProps.join(', ')}`,
                    code: `{ ${propName} }`,
                  });
                }
              }
            }
          }
        }
      },

      // Check conditional expressions for Array.isArray pattern
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
              rule: 'runview-runquery-result-validation',
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

      // Check if statements for result access without Success check
      IfStatement(path: NodePath<t.IfStatement>) {
        const test = path.node.test;

        // Pattern: if (result) or if (result?.length)
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
              rule: 'runview-runquery-result-validation',
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
            rule: 'runview-runquery-result-validation',
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
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(runviewRunqueryResultValidationRule);
