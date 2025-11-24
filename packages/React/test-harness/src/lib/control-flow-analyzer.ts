/**
 * Control Flow Analyzer
 *
 * Tracks how types and values narrow through JavaScript code based on runtime checks.
 * Similar to TypeScript's control flow analysis for type narrowing.
 *
 * This eliminates false positives in linting rules by understanding patterns like:
 * - if (x != null) { x.method() }  // x is non-null here
 * - if (typeof x === 'number') { x + 1 }  // x is number here
 * - if (arr.length > 0) { arr[0] }  // arr has elements here
 *
 * @example
 * const cfa = new ControlFlowAnalyzer(ast, componentSpec);
 * if (cfa.isDefinitelyNonNull(node, path)) {
 *   // Safe to access property - no violation
 * }
 */

import * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';
import { TypeInferenceEngine } from './type-inference-engine';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import type { TypeInfo } from './type-context';

export class ControlFlowAnalyzer {
  private ast: t.File;
  private componentSpec?: ComponentSpec;
  private typeEngine: TypeInferenceEngine;

  constructor(ast: t.File, componentSpec?: ComponentSpec) {
    this.ast = ast;
    this.componentSpec = componentSpec;
    this.typeEngine = new TypeInferenceEngine(componentSpec);
  }

  /**
   * Check if a variable/property is definitely non-null at this location
   *
   * Detects patterns like:
   * - if (x != null) { x.method() }  // x is non-null here
   * - if (x !== undefined) { x.prop }
   * - if (x) { x.prop }  // truthiness check
   * - x && x.prop  // short-circuit &&
   * - x ? x.prop : default  // ternary check
   *
   * @param node - The node being accessed (identifier or member expression)
   * @param path - Current path in the AST
   * @returns true if guaranteed non-null, false otherwise
   */
  isDefinitelyNonNull(node: t.Node, path: NodePath): boolean {
    const varName = this.extractVariableName(node);
    if (!varName) return false;

    let currentPath: NodePath | null = path.parentPath;

    while (currentPath) {
      const node = currentPath.node;

      // Check if we're inside an if statement with a guard
      if (t.isIfStatement(node)) {
        const test = node.test;

        // Check for null guard
        if (this.detectNullGuard(test, varName)) {
          // Make sure we're in the consequent (then block)
          if (this.isInConsequent(path, currentPath)) {
            return true;
          }
        }

        // Check for truthiness guard
        if (this.detectTruthinessGuard(test, varName)) {
          if (this.isInConsequent(path, currentPath)) {
            return true;
          }
        }
      }

      // Check if we're inside a logical && expression
      if (t.isLogicalExpression(node) && node.operator === '&&') {
        // Check if left side is a guard for our variable
        if (this.detectNullGuard(node.left, varName) ||
            this.detectTruthinessGuard(node.left, varName)) {
          // Make sure we're in the right side
          if (this.isInRightSide(path, currentPath)) {
            return true;
          }
        }
      }

      // Check if we're inside a ternary with guard
      if (t.isConditionalExpression(node)) {
        if (this.detectNullGuard(node.test, varName) ||
            this.detectTruthinessGuard(node.test, varName)) {
          // Make sure we're in the consequent
          if (this.isInConsequent(path, currentPath)) {
            return true;
          }
        }
      }

      currentPath = currentPath.parentPath;
    }

    return false;
  }

  /**
   * Check if a variable is narrowed to a specific type at this location
   *
   * Detects patterns like:
   * - if (typeof x === 'number') { x + 1 }  // x is number
   * - if (x instanceof Date) { x.getTime() }  // x is Date
   * - if (Array.isArray(x)) { x.push() }  // x is array
   *
   * @param node - The node being checked
   * @param path - Current path in the AST
   * @param expectedType - The type to check for ('number', 'string', 'Date', etc.)
   * @returns true if narrowed to that type, false otherwise
   */
  isNarrowedToType(node: t.Node, path: NodePath, expectedType: string): boolean {
    const varName = this.extractVariableName(node);
    if (!varName) return false;

    let currentPath: NodePath | null = path.parentPath;

    while (currentPath) {
      const node = currentPath.node;

      // Check if we're inside an if statement with a typeof guard
      if (t.isIfStatement(node)) {
        // First check the test directly
        const detectedType = this.detectTypeofGuard(node.test, varName);
        if (detectedType === expectedType) {
          if (this.isInConsequent(path, currentPath)) {
            return true;
          }
        }

        // Also check recursively if the test is a && expression
        if (t.isLogicalExpression(node.test) && node.test.operator === '&&') {
          const recursiveType = this.detectTypeofGuardRecursive(node.test, varName);
          if (recursiveType === expectedType) {
            if (this.isInConsequent(path, currentPath)) {
              return true;
            }
          }
        }
      }

      // Check if we're inside a logical && expression with typeof guard
      if (t.isLogicalExpression(node) && node.operator === '&&') {
        const detectedType = this.detectTypeofGuard(node.left, varName);
        if (detectedType === expectedType) {
          if (this.isInRightSide(path, currentPath)) {
            return true;
          }
        }

        // Also check nested && expressions recursively
        if (t.isLogicalExpression(node.left) && node.left.operator === '&&') {
          const nestedType = this.detectTypeofGuardRecursive(node.left, varName);
          if (nestedType === expectedType) {
            if (this.isInRightSide(path, currentPath)) {
              return true;
            }
          }
        }
      }

      currentPath = currentPath.parentPath;
    }

    return false;
  }

  /**
   * Recursively check for typeof guards in nested && expressions
   */
  private detectTypeofGuardRecursive(expr: t.Expression, varName: string): string | null {
    if (t.isLogicalExpression(expr) && expr.operator === '&&') {
      // Check left side
      const leftType = this.detectTypeofGuard(expr.left, varName);
      if (leftType) return leftType;

      // Check right side recursively
      const rightType = this.detectTypeofGuardRecursive(expr.right, varName);
      if (rightType) return rightType;
    }

    // Check this expression directly
    return this.detectTypeofGuard(expr, varName);
  }

  /**
   * Detect typeof guard pattern: typeof x === 'type'
   */
  private detectTypeofGuard(test: t.Expression, varName: string): string | null {
    if (!t.isBinaryExpression(test)) return null;

    // typeof x === 'type'
    if (test.operator === '===' || test.operator === '==') {
      if (t.isUnaryExpression(test.left) &&
          test.left.operator === 'typeof' &&
          t.isIdentifier(test.left.argument) &&
          test.left.argument.name === varName &&
          t.isStringLiteral(test.right)) {
        return test.right.value;  // Return the type
      }

      // Reversed: 'type' === typeof x
      if (t.isStringLiteral(test.left) &&
          t.isUnaryExpression(test.right) &&
          test.right.operator === 'typeof' &&
          t.isIdentifier(test.right.argument) &&
          test.right.argument.name === varName) {
        return test.left.value;
      }
    }

    return null;
  }

  /**
   * Detect null/undefined guard pattern: x != null, x !== null, x !== undefined
   */
  private detectNullGuard(test: t.Expression, varName: string): boolean {
    if (!t.isBinaryExpression(test)) return false;

    // x != null OR x !== null OR x !== undefined
    if (test.operator === '!=' || test.operator === '!==') {
      const left = test.left;
      const right = test.right;

      // Check if left is our variable (direct identifier or member expression property)
      const isOurVar = (
        (t.isIdentifier(left) && left.name === varName) ||
        (t.isMemberExpression(left) &&
         t.isIdentifier(left.property) &&
         left.property.name === varName)
      );

      // Check if right is null or undefined
      const isNullish = (
        t.isNullLiteral(right) ||
        (t.isIdentifier(right) && right.name === 'undefined')
      );

      return isOurVar && isNullish;
    }

    return false;
  }

  /**
   * Detect truthiness guard pattern: if (x), x && expr
   */
  private detectTruthinessGuard(test: t.Expression, varName: string): boolean {
    // Direct identifier: if (x)
    if (t.isIdentifier(test) && test.name === varName) {
      return true;
    }

    // Member expression: if (obj.prop)
    if (t.isMemberExpression(test) &&
        t.isIdentifier(test.property) &&
        test.property.name === varName) {
      return true;
    }

    return false;
  }

  /**
   * Extract variable name from node
   */
  private extractVariableName(node: t.Node): string | null {
    if (t.isIdentifier(node)) {
      return node.name;
    }

    if (t.isMemberExpression(node) && t.isIdentifier(node.property)) {
      return node.property.name;
    }

    return null;
  }

  /**
   * Check if path is inside the consequent (then block) of an if/ternary
   */
  private isInConsequent(targetPath: NodePath, ifPath: NodePath): boolean {
    const ifNode = ifPath.node;

    if (t.isIfStatement(ifNode)) {
      // Walk up from target to see if we hit the consequent
      let current: NodePath | null = targetPath;
      while (current && current !== ifPath) {
        if (current.node === ifNode.consequent) {
          return true;
        }
        current = current.parentPath;
      }
    }

    if (t.isConditionalExpression(ifNode)) {
      // Check if we're in the consequent branch
      let current: NodePath | null = targetPath;
      while (current && current !== ifPath) {
        if (current.node === ifNode.consequent) {
          return true;
        }
        current = current.parentPath;
      }
    }

    return false;
  }

  /**
   * Check if path is on the right side of a logical && expression
   */
  private isInRightSide(targetPath: NodePath, logicalPath: NodePath): boolean {
    const logicalNode = logicalPath.node;

    if (!t.isLogicalExpression(logicalNode)) {
      return false;
    }

    // Walk up from target to see if we hit the right side
    let current: NodePath | null = targetPath;
    while (current && current !== logicalPath) {
      if (current.node === logicalNode.right) {
        return true;
      }
      current = current.parentPath;
    }

    return false;
  }

  /**
   * Check if an array access is safe due to bounds checking guards
   *
   * Detects patterns like:
   * - if (arr.length > 0) { arr[0] }  // index 0 is safe
   * - if (arr.length > 2) { arr[2] }  // index 2 is safe
   * - if (arr.length === 0) return; arr[0]  // early return pattern
   * - arr.length > 0 && arr[0]  // inline guard
   * - arr ? arr[0] : default  // ternary guard
   *
   * @param arrayNode - The array being accessed (identifier or member expression)
   * @param accessIndex - The index being accessed (e.g., 0 for arr[0])
   * @param path - Current path in the AST
   * @returns true if access is guaranteed safe, false otherwise
   */
  isArrayAccessSafe(arrayNode: t.Node, accessIndex: number, path: NodePath): boolean {
    const arrayName = this.extractVariableName(arrayNode);
    if (!arrayName) return false;

    // Pattern 1: Ternary with truthiness or length check
    // arr ? arr[0] : default OR arr.length > 0 ? arr[0] : default
    // Also handles nested cases: arr ? `${arr[0]}` : default
    let currentPath: NodePath | null = path.parentPath;
    while (currentPath) {
      if (t.isConditionalExpression(currentPath.node)) {
        const test = currentPath.node.test;

        // Check if we're in the consequent (true branch)
        // Walk up from our path to see if we're inside the consequent
        let inConsequent = false;
        let checkPath: NodePath | null = path;
        while (checkPath && checkPath !== currentPath) {
          if (checkPath.node === currentPath.node.consequent) {
            inConsequent = true;
            break;
          }
          // Also check if we're inside the consequent
          let parent: NodePath | null = checkPath.parentPath;
          while (parent && parent !== currentPath) {
            if (parent.node === currentPath.node.consequent) {
              inConsequent = true;
              break;
            }
            parent = parent.parentPath;
          }
          if (inConsequent) break;
          checkPath = checkPath.parentPath;
        }

        if (inConsequent) {
          // Simple truthiness: arr ? arr[0] : default
          if (t.isIdentifier(test) && test.name === arrayName) {
            return true;
          }

          // Length check in test
          const maxSafeIndex = this.getMaxSafeIndexFromLengthCheck(test, arrayName);
          if (maxSafeIndex >= accessIndex) {
            return true;
          }
        }
      }

      currentPath = currentPath.parentPath;
    }

    // Pattern 2: Inline && guard
    // arr && arr[0] OR arr.length > 0 && arr[0]
    // Walk up to find any LogicalExpression ancestor
    currentPath = path.parentPath;
    while (currentPath) {
      if (t.isLogicalExpression(currentPath.node) && currentPath.node.operator === '&&') {
        const left = currentPath.node.left;

        // Check if we're on the right side
        if (this.isInRightSide(path, currentPath)) {
          // Truthiness check
          if (t.isIdentifier(left) && left.name === arrayName) {
            return true;
          }

          // Length check
          const maxSafeIndex = this.getMaxSafeIndexFromLengthCheck(left, arrayName);
          if (maxSafeIndex >= accessIndex) {
            return true;
          }
        }
      }

      currentPath = currentPath.parentPath;
    }

    // Pattern 3: if statement with guard
    currentPath = path.parentPath;
    while (currentPath) {
      if (t.isIfStatement(currentPath.node)) {
        const test = currentPath.node.test;
        const maxSafeIndex = this.getMaxSafeIndexFromLengthCheck(test, arrayName);

        if (maxSafeIndex >= accessIndex) {
          // Check if we're in the consequent block
          if (this.isInConsequent(path, currentPath)) {
            return true;
          }

          // Check for early return pattern
          const consequent = currentPath.node.consequent;
          if (this.hasEarlyReturn(consequent)) {
            // Code after early return is safe
            return true;
          }
        }

        // Also check for truthiness guard with early return
        if (t.isUnaryExpression(test) && test.operator === '!' &&
            t.isIdentifier(test.argument) && test.argument.name === arrayName) {
          // if (!arr) return; pattern makes arr[0] safe after
          if (this.hasEarlyReturn(currentPath.node.consequent)) {
            return true;
          }
        }
      }

      currentPath = currentPath.parentPath;
    }

    return false;
  }

  /**
   * Extract the maximum safe array index from a length check expression
   *
   * Examples:
   * - arr.length > 0 → returns 0 (index 0 is safe)
   * - arr.length > 2 → returns 2 (indices 0-2 are safe)
   * - arr.length >= 3 → returns 2 (indices 0-2 are safe)
   * - arr.length !== 0 → returns 0 (index 0 is safe)
   *
   * @param test - The test expression to analyze
   * @param arrayName - The array variable name to look for
   * @returns Maximum safe index, or -1 if no length check found
   */
  private getMaxSafeIndexFromLengthCheck(test: t.Expression, arrayName: string): number {
    if (t.isBinaryExpression(test)) {
      const { left, right, operator } = test;

      // Check for arr.length > N or arr.length >= N
      if (t.isMemberExpression(left) &&
          t.isIdentifier(left.object) &&
          left.object.name === arrayName &&
          t.isIdentifier(left.property) &&
          left.property.name === 'length' &&
          t.isNumericLiteral(right)) {

        const checkValue = right.value;

        // arr.length > N means indices 0 to N are safe
        if (operator === '>') {
          return checkValue;
        }

        // arr.length >= N means indices 0 to N-1 are safe
        if (operator === '>=') {
          return checkValue - 1;
        }

        // arr.length !== 0 or arr.length != 0 means index 0 is safe
        if ((operator === '!==' || operator === '!=') && checkValue === 0) {
          return 0;
        }
      }

      // Check reverse: N < arr.length or N <= arr.length
      if (t.isMemberExpression(right) &&
          t.isIdentifier(right.object) &&
          right.object.name === arrayName &&
          t.isIdentifier(right.property) &&
          right.property.name === 'length' &&
          t.isNumericLiteral(left)) {

        const checkValue = left.value;

        // N < arr.length means indices 0 to N are safe
        if (operator === '<') {
          return checkValue;
        }

        // N <= arr.length means indices 0 to N-1 are safe
        if (operator === '<=') {
          return checkValue - 1;
        }
      }
    }

    // Check logical expressions (recursively)
    if (t.isLogicalExpression(test)) {
      const leftMax = this.getMaxSafeIndexFromLengthCheck(test.left as t.Expression, arrayName);
      const rightMax = this.getMaxSafeIndexFromLengthCheck(test.right as t.Expression, arrayName);

      // For && operator, both sides must be true, so take minimum
      if (test.operator === '&&') {
        if (leftMax >= 0 && rightMax >= 0) {
          return Math.min(leftMax, rightMax);
        }
        return Math.max(leftMax, rightMax);
      }

      // For || operator, either side can be true, so take maximum
      if (test.operator === '||') {
        return Math.max(leftMax, rightMax);
      }
    }

    return -1;
  }

  /**
   * Check if a statement or block contains an early return
   */
  private hasEarlyReturn(statement: t.Statement): boolean {
    if (t.isReturnStatement(statement)) {
      return true;
    }

    if (t.isBlockStatement(statement)) {
      for (const stmt of statement.body) {
        if (t.isReturnStatement(stmt)) {
          return true;
        }
      }
    }

    return false;
  }
}
