import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { TypeInferenceEngine } from '../type-inference-engine';
import { ControlFlowAnalyzer } from '../control-flow-analyzer';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: type-mismatch-operation
 *
 * Validates that operations are type-safe (e.g., no arithmetic on strings, array methods on non-arrays).
 *
 * DEPRECATED: This rule is being replaced by TypeCompatibilityRule in Phase 1 refactor.
 * Will be removed after Phase 1 validation is complete.
 *
 * Severity: high
 * Applies to: all components
 *
 * Closure dependencies: TypeInferenceEngine, ControlFlowAnalyzer (instantiated locally, no closure)
 */
@RegisterClass(BaseLintRule, 'type-mismatch-operation')
export class TypeMismatchOperationRule extends BaseLintRule {
  get Name() { return 'type-mismatch-operation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // Create type inference engine
    const typeEngine = new TypeInferenceEngine(componentSpec);

    // Create control flow analyzer
    const cfa = new ControlFlowAnalyzer(ast, componentSpec);

    // Run analysis synchronously (the async part is not needed for basic inference)
    typeEngine.analyze(ast);

    traverse(ast, {
      // Check binary operations for type mismatches
      BinaryExpression(path: NodePath<t.BinaryExpression>) {
        const node = path.node;
        const operator = node.operator;

        // Skip comparison operators - they work with any types
        if (['==', '!=', '===', '!==', '<', '<=', '>', '>=', 'in', 'instanceof'].includes(operator)) {
          return;
        }

        // Check arithmetic operators (should be numbers)
        if (['-', '*', '/', '%', '**', '|', '&', '^', '<<', '>>', '>>>'].includes(operator)) {
          // Skip if left is PrivateName
          if (t.isPrivateName(node.left)) return;

          const leftType = typeEngine.inferExpressionType(node.left, path);
          const rightType = typeEngine.inferExpressionType(node.right, path);

          // Special case: Date - Date is valid (subtraction only)
          if (operator === '-' && leftType.type === 'Date' && rightType.type === 'Date') {
            // Date - Date produces a number (milliseconds), this is valid
            return;
          }

          // Check if both sides are guarded by typeof checks using Control Flow Analyzer
          const leftGuarded = cfa.isNarrowedToType(node.left, path, 'number');
          const rightGuarded = cfa.isNarrowedToType(node.right, path, 'number');

          // Only flag if we know the type is wrong (not unknown) AND not guarded by typeof
          if (!leftGuarded && leftType.type !== 'unknown' && leftType.type !== 'number' && leftType.type !== 'Date') {
            violations.push({
              rule: 'type-mismatch-operation',
              severity: 'high',
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              message: `Arithmetic operator "${operator}" used with ${leftType.type} on left side. Expected number.`,
              code: `Convert to number: Number(value) ${operator} ...`,
            });
          }

          if (!rightGuarded && rightType.type !== 'unknown' && rightType.type !== 'number' && rightType.type !== 'Date') {
            violations.push({
              rule: 'type-mismatch-operation',
              severity: 'high',
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              message: `Arithmetic operator "${operator}" used with ${rightType.type} on right side. Expected number.`,
              code: `Convert to number: ... ${operator} Number(value)`,
            });
          }
        }
      },

      // Check array method calls on non-arrays
      CallExpression(path: NodePath<t.CallExpression>) {
        const node = path.node;

        if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
          const methodName = node.callee.property.name;

          // Array-specific methods. Excludes `slice` and `concat` because
          // both exist on String.prototype with identical signatures/semantics
          // — flagging them on inferred-string types produces false positives
          // (e.g. `someString.slice(1)`). The remaining names are genuinely
          // array-only.
          const arrayOnlyMethods = [
            'push', 'pop', 'shift', 'unshift', 'splice',
            'map', 'filter', 'reduce', 'reduceRight', 'forEach',
            'find', 'findIndex', 'some', 'every', 'flat', 'flatMap',
            'sort', 'reverse', 'join', 'fill', 'copyWithin',
          ];

          if (arrayOnlyMethods.includes(methodName)) {
            const objectType = typeEngine.inferExpressionType(node.callee.object, path);

            // Only flag if we know it's definitely not an array
            if (objectType.type !== 'unknown' && objectType.type !== 'array') {
              violations.push({
                rule: 'type-mismatch-operation',
                severity: 'high',
                line: node.loc?.start.line || 0,
                column: node.loc?.start.column || 0,
                message: `Array method "${methodName}()" called on ${objectType.type}. This will fail at runtime.`,
                code: `Ensure value is an array before calling .${methodName}()`,
              });
            }
          }

          // String-specific methods
          const stringOnlyMethods = [
            'charAt', 'charCodeAt', 'codePointAt', 'substring', 'substr',
            'toUpperCase', 'toLowerCase', 'trim', 'trimStart', 'trimEnd',
            'padStart', 'padEnd', 'repeat', 'split', 'match', 'replace',
            'replaceAll', 'search', 'localeCompare', 'normalize',
          ];

          if (stringOnlyMethods.includes(methodName)) {
            const objectType = typeEngine.inferExpressionType(node.callee.object, path);

            // Only flag if we know it's definitely not a string
            if (objectType.type !== 'unknown' && objectType.type !== 'string') {
              violations.push({
                rule: 'type-mismatch-operation',
                severity: 'high',
                line: node.loc?.start.line || 0,
                column: node.loc?.start.column || 0,
                message: `String method "${methodName}()" called on ${objectType.type}. This may fail at runtime.`,
                code: `Ensure value is a string or convert: String(value).${methodName}()`,
              });
            }
          }
        }
      },
    });

    return violations;
    }
}
