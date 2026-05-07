import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ControlFlowAnalyzer } from '../control-flow-analyzer';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: unsafe-array-operations
 *
 * Detects potentially unsafe array operations including:
 * - Direct array index access without bounds checking (arr[0])
 * - Array methods called on potentially undefined props
 * - reduce() without initial value
 *
 * Uses ControlFlowAnalyzer for guard detection.
 *
 * Severity: low
 * Applies to: all components
 *
 * Closure dependencies: ControlFlowAnalyzer (instantiated locally, no closure)
 */
@RegisterClass(BaseLintRule, 'unsafe-array-operations')
export class UnsafeArrayOperationsRule extends BaseLintRule {
  get Name() { return 'unsafe-array-operations'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // Create control flow analyzer for guard detection
    const cfa = new ControlFlowAnalyzer(ast, componentSpec);

    // Track which parameters are from props (likely from queries/RunView)
    const propsParams = new Set<string>();

    traverse(ast, {
      // Find the main component function to identify props
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id?.name === componentName) {
          const params = path.node.params[0];
          if (t.isObjectPattern(params)) {
            params.properties.forEach((prop) => {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                propsParams.add(prop.key.name);
              }
            });
          }
        }
      },

      FunctionExpression(path: NodePath<t.FunctionExpression>) {
        const parent = path.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
          if (parent.id.name === componentName) {
            const params = path.node.params[0];
            if (t.isObjectPattern(params)) {
              params.properties.forEach((prop) => {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  propsParams.add(prop.key.name);
                }
              });
            }
          }
        }
      },

      // Check for direct array access patterns like arr[0]
      MemberExpression(path: NodePath<t.MemberExpression>) {
        const { object, property, computed } = path.node;

        // Check for array[index] patterns
        if (computed && (t.isNumericLiteral(property) || (t.isIdentifier(property) && /^\d+$/.test(property.name)))) {
          const code = path.toString();

          // Check if there's optional chaining
          if (!path.node.optional) {
            let isSafe = false;

            const accessIndex = t.isNumericLiteral(property) ? property.value : parseInt(property.name, 10);

            // Use CFA to check if array access is safe due to bounds checking
            if (!isNaN(accessIndex) && cfa.isArrayAccessSafe(object, accessIndex, path)) {
              isSafe = true;
            }

            // Pattern 1: Result of split() always has at least one element
            if (!isSafe &&
                t.isCallExpression(object) &&
                t.isMemberExpression(object.callee) &&
                t.isIdentifier(object.callee.property) &&
                object.callee.property.name === 'split'
            ) {
              isSafe = true;
            }

            // Pattern 1b: Object.entries() callback parameters always have [0] and [1]
            if (t.isIdentifier(object) && t.isNumericLiteral(property) && property.value <= 1) {
              const funcParent = path.getFunctionParent();
              if (funcParent) {
                const params = funcParent.node.params;
                for (const param of params) {
                  if (t.isIdentifier(param) && param.name === object.name) {
                    const callParent = funcParent.parentPath;
                    if (callParent && t.isCallExpression(callParent.node)) {
                      const calleeNode = callParent.node.callee;
                      if (t.isMemberExpression(calleeNode) && t.isIdentifier(calleeNode.property)) {
                        const methodName = calleeNode.property.name;
                        if (['sort', 'filter', 'map', 'forEach', 'find', 'some', 'every', 'reduce', 'findIndex'].includes(methodName)) {
                          const checkForObjectEntries = (node: t.Node): boolean => {
                            if (
                              t.isCallExpression(node) &&
                              t.isMemberExpression(node.callee) &&
                              t.isIdentifier(node.callee.object) &&
                              node.callee.object.name === 'Object' &&
                              t.isIdentifier(node.callee.property) &&
                              node.callee.property.name === 'entries'
                            ) {
                              return true;
                            }
                            if (t.isCallExpression(node) && t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
                              const chainMethod = node.callee.property.name;
                              if (['filter', 'map', 'slice', 'concat', 'flat', 'flatMap', 'reverse', 'toSorted', 'toReversed'].includes(chainMethod)) {
                                return checkForObjectEntries(node.callee.object);
                              }
                            }
                            return false;
                          };

                          if (checkForObjectEntries(calleeNode.object)) {
                            isSafe = true;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }

            // Pattern 1c: Fallback pattern with array access (|| operator)
            if (!isSafe && t.isLogicalExpression(object) && object.operator === '||') {
              isSafe = true;
            }

            // Pattern 2: Object.keys/values/entries always returns an array
            if (
              t.isCallExpression(object) &&
              t.isMemberExpression(object.callee) &&
              t.isIdentifier(object.callee.object) &&
              object.callee.object.name === 'Object' &&
              t.isIdentifier(object.callee.property) &&
              ['keys', 'values', 'entries'].includes(object.callee.property.name)
            ) {
              isSafe = true;
            }

            // Pattern 4: Chained array methods that preserve or filter arrays
            if (!isSafe && t.isCallExpression(object)) {
              const arrayReturningMethods = [
                'sort', 'reverse', 'fill', 'copyWithin',
                'filter', 'map', 'slice', 'concat', 'flat', 'flatMap',
                'splice',
              ];

              if (t.isMemberExpression(object.callee) && t.isIdentifier(object.callee.property)) {
                const methodName = object.callee.property.name;
                if (arrayReturningMethods.includes(methodName)) {
                  isSafe = true;
                }
              }
            }

            if (!isSafe) {
              violations.push({
                rule: 'unsafe-array-operations',
                severity: 'low',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Direct array access "${code}" may be undefined. Consider using optional chaining: ${code.replace('[', '?.[')} or check array bounds first.`,
                code: code.substring(0, 50),
              });
            }
          }
        }

        // Check for array methods that could fail on undefined
        const unsafeArrayMethods = ['map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every', 'length'];

        if (t.isIdentifier(property) && unsafeArrayMethods.includes(property.name)) {
          if (t.isIdentifier(object) && propsParams.has(object.name)) {
            const isDataProp =
              object.name.toLowerCase().includes('data') ||
              object.name.toLowerCase().includes('items') ||
              object.name.toLowerCase().includes('results') ||
              object.name.toLowerCase().includes('records') ||
              object.name.toLowerCase().includes('list') ||
              object.name.toLowerCase().includes('types') ||
              object.name.toLowerCase().includes('options');

            if (isDataProp || property.name === 'length') {
              let hasGuard = false;

              // Check for optional chaining
              if (path.node.optional) {
                hasGuard = true;
              }

              // Check for (data || []).map pattern
              const parent = path.parent;
              if (t.isMemberExpression(parent) && t.isLogicalExpression(parent.object)) {
                if (parent.object.operator === '||' && t.isIdentifier(parent.object.left)) {
                  if (parent.object.left.name === object.name) {
                    hasGuard = true;
                  }
                }
              }

              // Check for inline guards like: data && data.map(...)
              const grandParent = path.parentPath?.parent;
              if (t.isLogicalExpression(grandParent) && grandParent.operator === '&&') {
                if (t.isIdentifier(grandParent.left) && grandParent.left.name === object.name) {
                  hasGuard = true;
                }
              }

              // Check for short-circuit OR guard
              if (!hasGuard && t.isLogicalExpression(grandParent) && grandParent.operator === '||') {
                if (t.isUnaryExpression(grandParent.left) &&
                    grandParent.left.operator === '!' &&
                    t.isIdentifier(grandParent.left.argument) &&
                    grandParent.left.argument.name === object.name) {
                  hasGuard = true;
                }
              }

              // Check with CFA for guards in conditional branches
              if (!hasGuard && cfa.isDefinitelyNonNull(object, path)) {
                hasGuard = true;
              }

              // Walk up the && chain to find guards in chained expressions
              if (!hasGuard) {
                let currentPath: NodePath | null = path.parentPath;
                while (currentPath) {
                  if (t.isIfStatement(currentPath.node)) {
                    const test = currentPath.node.test;
                    if (t.isLogicalExpression(test) && test.operator === '&&') {
                      const collectAndOperands = (node: t.Node): t.Node[] => {
                        if (t.isLogicalExpression(node) && node.operator === '&&') {
                          return [...collectAndOperands(node.left), ...collectAndOperands(node.right)];
                        }
                        return [node];
                      };

                      const operands = collectAndOperands(test);
                      let foundGuard = false;

                      for (let i = 0; i < operands.length; i++) {
                        const op = operands[i];

                        if (t.isIdentifier(op) && op.name === object.name) {
                          foundGuard = true;
                        }

                        let containsLengthAccess = false;
                        if (t.isBinaryExpression(op)) {
                          if (t.isMemberExpression(op.left) &&
                              t.isIdentifier(op.left.object) &&
                              op.left.object.name === object.name &&
                              t.isIdentifier(op.left.property) &&
                              op.left.property.name === 'length') {
                            containsLengthAccess = true;
                          }
                        } else if (t.isMemberExpression(op) &&
                                   t.isIdentifier(op.object) &&
                                   op.object.name === object.name) {
                          containsLengthAccess = true;
                        }

                        if (containsLengthAccess) {
                          if (foundGuard) {
                            hasGuard = true;
                            break;
                          }
                        }
                      }
                    }
                    break;
                  }
                  currentPath = currentPath.parentPath;
                }
              }

              // Check for early return guards in the function
              const functionParent = path.getFunctionParent();
              if (functionParent && !hasGuard) {
                let hasEarlyReturn = false;

                functionParent.traverse({
                  IfStatement(ifPath: NodePath<t.IfStatement>) {
                    if (ifPath.node.loc && path.node.loc) {
                      if (ifPath.node.loc.start.line > path.node.loc.start.line) {
                        return;
                      }
                    }

                    const test = ifPath.node.test;
                    let checksOurVariable = false;

                    if (t.isUnaryExpression(test) && test.operator === '!') {
                      if (t.isIdentifier(test.argument) && test.argument.name === object.name) {
                        checksOurVariable = true;
                      }
                    }

                    if (t.isLogicalExpression(test)) {
                      ifPath.traverse({
                        Identifier(idPath: NodePath<t.Identifier>) {
                          if (idPath.node.name === object.name) {
                            checksOurVariable = true;
                          }
                        },
                      });
                    }

                    if (checksOurVariable) {
                      const consequent = ifPath.node.consequent;
                      if (t.isBlockStatement(consequent)) {
                        for (const stmt of consequent.body) {
                          if (t.isReturnStatement(stmt)) {
                            hasEarlyReturn = true;
                            break;
                          }
                        }
                      } else if (t.isReturnStatement(consequent)) {
                        hasEarlyReturn = true;
                      }
                    }
                  },
                });

                if (hasEarlyReturn) {
                  hasGuard = true;
                }
              }

              if (!hasGuard) {
                const methodName = property.name;

                violations.push({
                  rule: 'unsafe-array-operations',
                  severity: 'low',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Potentially unsafe operation "${object.name}.${methodName}" on prop that may be undefined. Consider using optional chaining: ${object.name}?.${methodName} or provide a default: (${object.name} || []).${methodName}`,
                  code: `${object.name}.${methodName}`,
                });
              }
            }
          }
        }
      },

      // Check for reduce without initial value
      CallExpression(path: NodePath<t.CallExpression>) {
        if (t.isMemberExpression(path.node.callee) && t.isIdentifier(path.node.callee.property) && path.node.callee.property.name === 'reduce') {
          const hasInitialValue = path.node.arguments.length > 1;

          if (!hasInitialValue) {
            const code = path.toString();
            violations.push({
              rule: 'unsafe-array-operations',
              severity: 'low',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `reduce() without initial value may fail on empty arrays. Consider providing an initial value as the second argument.`,
              code: code.substring(0, 100),
            });
          }
        }
      },
    });

    return violations;
    }
}
