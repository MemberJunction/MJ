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
   * Check if a node is protected by a ternary/conditional guard
   * Useful for checking expressions inside template literals within ternaries
   *
   * @param node - The node to check (e.g., member expression)
   * @param path - Current path in the AST (should be close to the node's location)
   * @returns true if protected by a ternary guard, false otherwise
   */
  isProtectedByTernary(node: t.Node, path: NodePath): boolean {
    const varName = this.extractVariableName(node);
    if (!varName) return false;

    // DEBUG: Log what we're looking for
    const debugEnabled = false; // Set to true to enable logging
    if (debugEnabled) {
      console.log('[CFA] isProtectedByTernary checking:', varName);
      console.log('[CFA] Starting from path type:', path.node.type);
    }

    // Walk up from the path to find ConditionalExpression parents
    let currentPath: NodePath | null = path;
    let depth = 0;
    while (currentPath) {
      const parentPath: NodePath | null = currentPath.parentPath;

      if (debugEnabled) {
        console.log(`[CFA] Depth ${depth}: current=${currentPath.node.type}, parent=${parentPath?.node.type || 'null'}`);
      }

      if (parentPath && t.isConditionalExpression(parentPath.node)) {
        const test = parentPath.node.test;

        if (debugEnabled) {
          console.log('[CFA] Found ConditionalExpression!');
          console.log('[CFA] Test type:', test.type);
          console.log('[CFA] Consequent type:', parentPath.node.consequent.type);
        }

        if (this.detectNullGuard(test, varName) || this.detectTruthinessGuard(test, varName)) {
          if (debugEnabled) {
            console.log('[CFA] Guard detected for', varName);
          }

          // Check if current node is the consequent or is inside it
          // The consequent is the "true" branch of the ternary
          if (currentPath.node === parentPath.node.consequent) {
            if (debugEnabled) {
              console.log('[CFA] Current node IS the consequent - PROTECTED');
            }
            return true;
          }

          // Check if path is inside the consequent by walking up
          let checkPath: NodePath | null = path;
          while (checkPath && checkPath !== parentPath) {
            if (checkPath.node === parentPath.node.consequent) {
              if (debugEnabled) {
                console.log('[CFA] Path is inside consequent - PROTECTED');
              }
              return true;
            }
            checkPath = checkPath.parentPath;
          }

          if (debugEnabled) {
            console.log('[CFA] Not in consequent - checking failed');
          }
        } else if (debugEnabled) {
          console.log('[CFA] No guard detected for', varName);
        }
      }

      currentPath = parentPath;
      depth++;
    }

    if (debugEnabled) {
      console.log('[CFA] No protection found after', depth, 'levels');
    }
    return false;
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

    // For member expressions like products.length, also check if just the object (products) is guarded
    // This handles cases like: !products || ... || products.length
    const objectName = (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) &&
                       t.isIdentifier(node.object)
                       ? node.object.name
                       : null;

    let currentPath: NodePath | null = path.parentPath;

    while (currentPath) {
      const node = currentPath.node;

      // Check if we're inside an if statement with a guard
      if (t.isIfStatement(node)) {
        const test = node.test;

        // Check for null guard on full path or object
        if (this.detectNullGuard(test, varName) || (objectName && this.detectNullGuard(test, objectName))) {
          // Make sure we're in the consequent (then block)
          if (this.isInConsequent(path, currentPath)) {
            return true;
          }
        }

        // Check for truthiness guard on full path or object
        if (this.detectTruthinessGuard(test, varName) || (objectName && this.detectTruthinessGuard(test, objectName))) {
          if (this.isInConsequent(path, currentPath)) {
            return true;
          }
        }
      }

      // Check if we're inside a logical && expression
      if (t.isLogicalExpression(node) && node.operator === '&&') {
        // Check if left side is a guard for our variable or its object
        if (this.detectNullGuard(node.left, varName) ||
            this.detectTruthinessGuard(node.left, varName) ||
            (objectName && this.detectNullGuard(node.left, objectName)) ||
            (objectName && this.detectTruthinessGuard(node.left, objectName))) {
          // Make sure we're in the right side
          if (this.isInRightSide(path, currentPath)) {
            return true;
          }
        }
      }

      // Check if we're inside a logical || expression with negated guard
      // Pattern: !x || !y || x.prop - if we evaluate x.prop, !x must be false
      if (t.isLogicalExpression(node) && node.operator === '||') {
        // Check if left side contains a negated guard for our variable or object
        if (this.detectNegatedCheck(node.left, varName) ||
            (objectName && this.detectNegatedCheck(node.left, objectName))) {
          // Make sure we're in the right side
          if (this.isInRightSide(path, currentPath)) {
            return true;
          }
        }
      }

      // Check if we're inside a ternary with guard
      if (t.isConditionalExpression(node)) {
        // Check if we're in the consequent (true branch) with a guard on full path or object
        if (this.detectNullGuard(node.test, varName) ||
            this.detectTruthinessGuard(node.test, varName) ||
            (objectName && this.detectNullGuard(node.test, objectName)) ||
            (objectName && this.detectTruthinessGuard(node.test, objectName))) {
          if (this.isInConsequent(path, currentPath)) {
            return true;
          }
        }

        // Check if we're in the alternate (else branch) with a negated guard
        // Pattern: !x || x.length === 0 ? ... : <here>
        // In the else branch, we know !x is false, so x is truthy
        if (this.isInAlternate(path, currentPath)) {
          if (this.detectNegatedNullGuard(node.test, varName) ||
              (objectName && this.detectNegatedNullGuard(node.test, objectName))) {
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
   * Also detects short-circuit OR patterns: !x || x.prop (x.prop is safe due to short-circuit)
   */
  private detectNullGuard(test: t.Expression, varName: string): boolean {
    // Pattern 1: Short-circuit OR with truthiness check
    // !x || x.prop - if x is null/undefined, !x is true and second operand never evaluates
    if (t.isLogicalExpression(test) && test.operator === '||') {
      // Check immediate left side first
      const left = test.left;

      // Check if left side is !varName (negation/falsiness check)
      if (t.isUnaryExpression(left) && left.operator === '!' &&
          t.isIdentifier(left.argument) && left.argument.name === varName) {
        // The right side is protected by short-circuit evaluation
        // If varName is null/undefined, left is true and right never evaluates
        return true;
      }

      // Also check for: !x.prop || x.prop.method
      // Handles cases like: !results || results.length === 0
      if (t.isUnaryExpression(left) && left.operator === '!' &&
          t.isMemberExpression(left.argument) &&
          t.isIdentifier(left.argument.object) &&
          left.argument.object.name === varName) {
        // This proves varName itself is checked for truthiness
        return true;
      }

      // Handle OR chains: A || B || C || products.length
      // Recursively check the left side of the OR chain
      if (this.detectNullGuard(left, varName)) {
        return true;
      }
    }

    // Pattern 2: Standard binary null checks
    if (!t.isBinaryExpression(test)) return false;

    // x != null OR x !== null OR x !== undefined
    if (test.operator === '!=' || test.operator === '!==') {
      const left = test.left;
      const right = test.right;

      // Check if left is our variable
      // For member expressions, serialize the full path for comparison
      let leftVarName: string | null = null;
      if (t.isIdentifier(left)) {
        leftVarName = left.name;
      } else if (t.isMemberExpression(left) || t.isOptionalMemberExpression(left)) {
        leftVarName = this.serializeMemberExpression(left);
      }

      // Check if right is null or undefined
      const isNullish = (
        t.isNullLiteral(right) ||
        (t.isIdentifier(right) && right.name === 'undefined')
      );

      return leftVarName === varName && isNullish;
    }

    return false;
  }

  /**
   * Detect truthiness guard pattern: if (x), x && expr, x ? ... : ...
   *
   * Handles:
   * - Simple identifier: if (x)
   * - Member expression: if (obj.prop)
   * - Full path matching: if (item.TotalCost) protects item.TotalCost.toFixed()
   */
  private detectTruthinessGuard(test: t.Expression, varName: string): boolean {
    // Direct identifier: if (x)
    if (t.isIdentifier(test) && test.name === varName) {
      return true;
    }

    // Member expression or optional member expression: if (obj.prop) or if (obj?.prop)
    // Extract the full path and compare with varName
    if (t.isMemberExpression(test) || t.isOptionalMemberExpression(test)) {
      const testPath = this.serializeMemberExpression(test);
      if (testPath === varName) {
        return true;
      }
    }

    // Logical AND expression: if (x && y), both x and y are truthy in consequent
    // Check if varName appears on the left side of the && chain
    if (t.isLogicalExpression(test) && test.operator === '&&') {
      // Check left side first
      if (this.detectTruthinessGuard(test.left, varName)) {
        return true;
      }
      // For varName on the right side, it's only guaranteed truthy if left is also truthy
      // So we recursively check both sides
      if (this.detectTruthinessGuard(test.right, varName)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if expression contains a negated check (!x) for the variable
   * Used for detecting guards within OR chains
   *
   * @param expr - Expression to check
   * @param varName - Variable name to look for
   * @returns true if !varName exists in the expression
   */
  private detectNegatedCheck(expr: t.Expression, varName: string): boolean {
    // Direct negation: !x
    if (t.isUnaryExpression(expr) && expr.operator === '!') {
      if (t.isIdentifier(expr.argument) && expr.argument.name === varName) {
        return true;
      }
      // Also check !x.prop pattern (guards x)
      if (t.isMemberExpression(expr.argument) &&
          t.isIdentifier(expr.argument.object) &&
          expr.argument.object.name === varName) {
        return true;
      }
    }

    // Recursively check OR chains: A || B || C
    if (t.isLogicalExpression(expr) && expr.operator === '||') {
      return this.detectNegatedCheck(expr.left, varName) ||
             this.detectNegatedCheck(expr.right, varName);
    }

    return false;
  }

  /**
   * Detect negated null guard pattern for alternate branches
   *
   * In the alternate (else) branch of these patterns, the variable is proven truthy:
   * - !x || ... ? ... : <here>  (if !x is false, x is truthy)
   * - !x.prop || ... ? ... : <here>  (if !x.prop is false, x is truthy)
   *
   * @param test - The conditional test expression
   * @param varName - Variable name or full member path to check
   * @returns true if the pattern proves varName is truthy in the alternate branch
   */
  private detectNegatedNullGuard(test: t.Expression, varName: string): boolean {
    // Pattern: !x || x.length === 0 ? ... : <else>
    // In else branch, both !x and x.length === 0 are false
    if (t.isLogicalExpression(test) && test.operator === '||') {
      const left = test.left;

      // Check if left side is !varName (negation check)
      if (t.isUnaryExpression(left) && left.operator === '!') {
        // Check if the negated expression is our variable
        if (t.isIdentifier(left.argument) && left.argument.name === varName) {
          // In the alternate branch, !varName is false, so varName is truthy
          return true;
        }

        // Also handle !x.prop pattern
        if (t.isMemberExpression(left.argument) &&
            t.isIdentifier(left.argument.object) &&
            left.argument.object.name === varName) {
          // In the alternate branch, !x.prop is false, so x is truthy
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Extract variable name or full member expression path from node
   *
   * Examples:
   * - `arr` → "arr"
   * - `obj.prop` → "obj.prop"
   * - `result.Results` → "result.Results"
   * - `accountsResult.Results` → "accountsResult.Results"
   *
   * This allows CFA to match guards on nested properties correctly.
   * For example, guard `accountsResult.Results?.length > 0` protects `accountsResult.Results[0]`
   */
  private extractVariableName(node: t.Node): string | null {
    // Simple identifier: arr
    if (t.isIdentifier(node)) {
      return node.name;
    }

    // Member expression: serialize the full path
    if (t.isMemberExpression(node) || t.isOptionalMemberExpression(node)) {
      return this.serializeMemberExpression(node);
    }

    return null;
  }

  /**
   * Serialize a member expression to its full path string
   * Handles both regular and optional member expressions
   *
   * Examples:
   * - obj.prop → "obj.prop"
   * - obj?.prop → "obj.prop" (normalized, ignores optional chaining syntax)
   * - obj.prop.nested → "obj.prop.nested"
   */
  private serializeMemberExpression(node: t.MemberExpression | t.OptionalMemberExpression): string | null {
    const parts: string[] = [];
    let current: t.Expression | t.Super | t.PrivateName = node;

    // Walk up the member expression chain
    while (t.isMemberExpression(current) || t.isOptionalMemberExpression(current)) {
      // Get the property name
      if (t.isIdentifier(current.property)) {
        parts.unshift(current.property.name);
      } else {
        // Computed property or private name - can't serialize
        return null;
      }

      // Move to the object
      current = current.object;
    }

    // Base should be an identifier
    if (t.isIdentifier(current)) {
      parts.unshift(current.name);
      return parts.join('.');
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
   * Check if path is in the alternate (else) branch of an if or ternary
   */
  private isInAlternate(targetPath: NodePath, ifPath: NodePath): boolean {
    const ifNode = ifPath.node;

    if (t.isIfStatement(ifNode)) {
      // Walk up from target to see if we hit the alternate
      let current: NodePath | null = targetPath;
      while (current && current !== ifPath) {
        if (current.node === ifNode.alternate) {
          return true;
        }
        current = current.parentPath;
      }
    }

    if (t.isConditionalExpression(ifNode)) {
      // Check if we're in the alternate branch
      let current: NodePath | null = targetPath;
      while (current && current !== ifPath) {
        if (current.node === ifNode.alternate) {
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
   * - arr?.length > 0 → returns 0 (optional chaining proves non-null)
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

      // Check for arr.length > N or arr.length >= N (including optional chaining)
      if (this.isLengthAccess(left, arrayName) && t.isNumericLiteral(right)) {
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
      if (this.isLengthAccess(right, arrayName) && t.isNumericLiteral(left)) {
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
   * Check if an expression is accessing the length property of an array
   * Handles both regular and optional chaining: arr.length and arr?.length
   * Also handles nested paths: obj.arr.length and obj.arr?.length
   */
  private isLengthAccess(expr: t.Expression | t.PrivateName, arrayName: string): boolean {
    // Check if it's a member expression accessing 'length'
    if (!t.isMemberExpression(expr) && !t.isOptionalMemberExpression(expr)) {
      return false;
    }

    // Property must be 'length'
    if (!t.isIdentifier(expr.property) || expr.property.name !== 'length') {
      return false;
    }

    // Get the object being accessed (e.g., 'arr' in arr.length or 'obj.arr' in obj.arr.length)
    const objectPath = this.serializeMemberExpression(expr.object as any);

    // Simple case: arr.length where arrayName is 'arr'
    if (t.isIdentifier(expr.object) && expr.object.name === arrayName) {
      return true;
    }

    // Nested case: obj.arr.length where arrayName is 'obj.arr'
    if (objectPath === arrayName) {
      return true;
    }

    return false;
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
