import traverse, { NodePath } from '@babel/traverse';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: runquery-runview-spread-operator
 *
 * Detects incorrect usage of the spread operator on RunView/RunQuery result objects.
 * The result object contains metadata properties (Success, ErrorMessage, etc.) —
 * use ...result.Results to spread the data array instead.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'runquery-runview-spread-operator')
export class RunqueryRunviewSpreadOperatorRule extends BaseLintRule {
  get Name() { return 'runquery-runview-spread-operator'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

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

    // First pass: identify all RunView/RunQuery calls
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
              }
            }
          }
        }
      },
    });

    // Second pass: check for spread operator usage
    traverse(ast, {
      SpreadElement(path: NodePath<t.SpreadElement>) {
        if (t.isIdentifier(path.node.argument)) {
          const varName = path.node.argument.name;

          if (resultVariables.has(varName)) {
            const resultInfo = resultVariables.get(varName)!;

            violations.push({
              rule: 'runquery-runview-spread-operator',
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
          }
        }
      },
    });

    return violations;
    }
}
