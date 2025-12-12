/**
 * Type Compatibility Rule - Consolidates all type-checking logic
 *
 * This rule validates type safety across the component:
 * - Variable assignments
 * - Function calls
 * - Binary operations
 * - Property access
 * - Array operations
 * - Component prop types
 *
 * @category type
 * @severity high
 *
 * ## Rationale
 * Type mismatches cause runtime errors. This rule catches type incompatibilities
 * before runtime by analyzing the AST and using type inference.
 *
 * ## Examples
 *
 * ### ❌ Violation
 * ```typescript
 * const name: string = "John";
 * const result = name - 5; // Arithmetic on string
 * ```
 *
 * ### ✅ Correct
 * ```typescript
 * const age: number = 30;
 * const result = age - 5; // Arithmetic on number
 * ```
 */

import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { TypeInferenceEngine } from '../type-inference-engine';
import { TypeContext } from '../type-context';
import { ControlFlowAnalyzer } from '../control-flow-analyzer';

export interface Violation {
  rule: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  line: number;
  column: number;
  message: string;
  code?: string;
  source?: 'user-component' | 'runtime-wrapper' | 'react-framework' | 'test-harness';
  suggestion?: {
    text: string;
    example?: string;
  };
}

export interface LintContext {
  componentName: string;
  componentSpec?: ComponentSpec;
  typeContext: TypeContext;
  typeEngine: TypeInferenceEngine;
  controlFlowAnalyzer: ControlFlowAnalyzer;
}

/**
 * TypeCompatibilityRule - Validates type safety across all operations
 */
export class TypeCompatibilityRule {
  name = 'type-compatibility';
  appliesTo: 'all' | 'child' | 'root' = 'all';

  /**
   * Validate type compatibility across the component
   */
  validate(ast: t.File, context: LintContext): Violation[] {
    const violations: Violation[] = [];

    // 1. Get type inference errors (parameter validation, etc.)
    const typeErrors = context.typeEngine.getErrors();
    for (const error of typeErrors) {
      violations.push({
        rule: 'type-compatibility',
        severity: error.type === 'error' ? 'high' : 'medium',
        line: error.line,
        column: error.column,
        message: error.message,
        code: error.code || '',
      });
    }

    // 2. Check binary operations for type mismatches
    this.checkBinaryOperations(ast, context, violations);

    // 3. Check array and string method calls
    this.checkMethodCalls(ast, context, violations);

    return violations;
  }

  /**
   * Check binary operations (arithmetic, logical, etc.) for type compatibility
   */
  private checkBinaryOperations(ast: t.File, context: LintContext, violations: Violation[]): void {
    const { typeEngine, controlFlowAnalyzer } = context;

    traverse(ast, {
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
            return;
          }

          // Check if both sides are guarded by typeof checks using Control Flow Analyzer
          const leftGuarded = controlFlowAnalyzer.isNarrowedToType(node.left, path, 'number');
          const rightGuarded = controlFlowAnalyzer.isNarrowedToType(node.right, path, 'number');

          // Only flag if we know the type is wrong (not unknown) AND not guarded by typeof
          if (!leftGuarded && leftType.type !== 'unknown' && leftType.type !== 'number' && leftType.type !== 'Date') {
            violations.push({
              rule: 'type-compatibility',
              severity: 'high',
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              message: `Arithmetic operator "${operator}" used with ${leftType.type} on left side. Expected number.`,
              code: `Convert to number: Number(value) ${operator} ...`,
            });
          }

          if (!rightGuarded && rightType.type !== 'unknown' && rightType.type !== 'number' && rightType.type !== 'Date') {
            violations.push({
              rule: 'type-compatibility',
              severity: 'high',
              line: node.loc?.start.line || 0,
              column: node.loc?.start.column || 0,
              message: `Arithmetic operator "${operator}" used with ${rightType.type} on right side. Expected number.`,
              code: `Convert to number: ... ${operator} Number(value)`,
            });
          }
        }
      },
    });
  }

  /**
   * Check method calls (array methods, string methods) for type compatibility
   */
  private checkMethodCalls(ast: t.File, context: LintContext, violations: Violation[]): void {
    const { typeEngine } = context;

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const node = path.node;

        if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
          const methodName = node.callee.property.name;

          // Array-specific methods
          const arrayOnlyMethods = [
            'push',
            'pop',
            'shift',
            'unshift',
            'splice',
            'slice',
            'map',
            'filter',
            'reduce',
            'reduceRight',
            'forEach',
            'find',
            'findIndex',
            'some',
            'every',
            'flat',
            'flatMap',
            'sort',
            'reverse',
            'concat',
            'join',
            'fill',
            'copyWithin',
          ];

          if (arrayOnlyMethods.includes(methodName)) {
            const objectType = typeEngine.inferExpressionType(node.callee.object, path);

            // Only flag if we know it's definitely not an array
            if (objectType.type !== 'unknown' && objectType.type !== 'array') {
              violations.push({
                rule: 'type-compatibility',
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
            'charAt',
            'charCodeAt',
            'codePointAt',
            'substring',
            'substr',
            'toUpperCase',
            'toLowerCase',
            'trim',
            'trimStart',
            'trimEnd',
            'padStart',
            'padEnd',
            'repeat',
            'split',
            'match',
            'replace',
            'replaceAll',
            'search',
            'localeCompare',
            'normalize',
          ];

          if (stringOnlyMethods.includes(methodName)) {
            const objectType = typeEngine.inferExpressionType(node.callee.object, path);

            // Only flag if we know it's definitely not a string
            if (objectType.type !== 'unknown' && objectType.type !== 'string') {
              violations.push({
                rule: 'type-compatibility',
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
  }
}
