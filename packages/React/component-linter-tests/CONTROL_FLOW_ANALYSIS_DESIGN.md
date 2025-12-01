# Control Flow Analysis System Design

## Overview

The Control Flow Analyzer (CFA) is a sophisticated system for tracking how types and values narrow through JavaScript code based on runtime checks. This eliminates false positives in linting by understanding what TypeScript's type checker knows: that `if (x != null)` means x is non-null inside that block.

## Why We Need This

**Current Problem**: Our linter has scattered, duplicated logic for detecting guards:
- `type-mismatch-operation` has `isGuardedByTypeof()` function (98 lines)
- `unsafe-formatting-methods` has null check detection (37 lines)
- `unsafe-array-operations` has truthiness checks (scattered throughout)
- Each rule implements its own partial solution
- Lots of false positives remain

**Solution**: Centralize all control flow analysis into one robust system that all rules can use.

## Architecture

### Core Class: ControlFlowAnalyzer

```typescript
/**
 * Control Flow Analyzer
 * 
 * Tracks how types and values narrow through code based on runtime checks.
 * Similar to TypeScript's control flow analysis for type narrowing.
 * 
 * Usage:
 *   const cfa = new ControlFlowAnalyzer(ast, componentSpec);
 *   if (cfa.isDefinitelyNonNull(node, path)) {
 *     // Safe to access property
 *   }
 */
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
  isDefinitelyNonNull(node: t.Node, path: NodePath): boolean;

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
  isNarrowedToType(node: t.Node, path: NodePath, expectedType: string): boolean;

  /**
   * Check if code is definitely unreachable
   * 
   * Detects patterns like:
   * - Code after return statement
   * - Code after throw statement
   * - Else block when if always returns
   * 
   * @param path - Current path in the AST
   * @returns true if unreachable, false otherwise
   */
  isUnreachable(path: NodePath): boolean;

  /**
   * Get the narrowed type info for a node at a location
   * 
   * @param node - The node to analyze
   * @param path - Current path in the AST
   * @returns TypeInfo with narrowed type, or null if can't determine
   */
  getNarrowedType(node: t.Node, path: NodePath): TypeInfo | null;

  /**
   * Check if an array/object is guaranteed to have content
   * 
   * Detects patterns like:
   * - if (arr.length > 0) { arr[0] }  // arr has elements
   * - if (arr.length === 0) return; arr[0]  // early return pattern
   * - arr.filter(x => x > 5)[0]  // result of filter could be empty
   * 
   * @param node - The array/object node
   * @param path - Current path in the AST
   * @returns true if guaranteed non-empty, false otherwise
   */
  isDefinitelyNonEmpty(node: t.Node, path: NodePath): boolean;
}
```

## Implementation Details

### 1. Variable State Tracking

Track what we know about each variable at each point in code:

```typescript
interface VariableState {
  name: string;
  type: TypeInfo;
  isNullable: boolean;
  isUndefinable: boolean;
  isInitialized: boolean;
  isEmpty: boolean;  // for arrays/objects
}

interface Scope {
  path: NodePath;
  variables: Map<string, VariableState>;
  parent?: Scope;
}
```

### 2. Guard Detection Patterns

#### Type Guards (typeof)
```javascript
// Pattern 1: typeof x === 'type'
if (typeof x === 'number') {
  x + 1  // ✅ x is number here
}

// Pattern 2: 'type' === typeof x (reversed)
if ('string' === typeof x) {
  x.toUpperCase()  // ✅ x is string here
}

// Pattern 3: && conjunction
if (typeof x === 'number' && typeof y === 'number') {
  x - y  // ✅ both are numbers here
}
```

**Implementation**:
```typescript
private detectTypeofGuard(
  test: t.Expression,
  varName: string
): string | null {
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
```

#### Null/Undefined Guards
```javascript
// Pattern 1: x != null (checks both null and undefined)
if (x != null) {
  x.prop  // ✅ x is non-null here
}

// Pattern 2: x !== null (strict check)
if (x !== null) {
  x.prop  // ✅ x is not null here
}

// Pattern 3: x !== undefined
if (x !== undefined) {
  x.prop  // ✅ x is defined here
}

// Pattern 4: JSX conditional rendering
{x != null && <div>{x.prop}</div>}  // ✅ x is non-null in JSX
```

**Implementation**:
```typescript
private detectNullGuard(
  test: t.Expression,
  varName: string
): boolean {
  if (!t.isBinaryExpression(test)) return false;
  
  // x != null OR x !== null OR x !== undefined
  if (test.operator === '!=' || test.operator === '!==') {
    const left = test.left;
    const right = test.right;
    
    // Check if left is our variable
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
```

#### Truthiness Guards
```javascript
// Pattern 1: if (x)
if (x) {
  x.prop  // ✅ x is truthy here
}

// Pattern 2: && short-circuit
x && x.prop  // ✅ x is truthy when accessing prop

// Pattern 3: ternary
x ? x.prop : default  // ✅ x is truthy in consequent
```

**Implementation**:
```typescript
private detectTruthinessGuard(
  test: t.Expression,
  varName: string
): boolean {
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
```

#### Array Length Guards
```javascript
// Pattern 1: if (arr.length > 0)
if (arr.length > 0) {
  arr[0]  // ✅ arr has elements here
}

// Pattern 2: Early return
if (arr.length === 0) return;
arr[0]  // ✅ arr must have elements here

// Pattern 3: Ternary
arr.length > 0 ? arr[0] : default  // ✅ arr has elements in consequent
```

**Implementation**:
```typescript
private detectArrayLengthGuard(
  test: t.Expression,
  arrayName: string
): boolean {
  if (!t.isBinaryExpression(test)) return false;
  
  // arr.length > 0
  if ((test.operator === '>' || test.operator === '>=') &&
      t.isMemberExpression(test.left) &&
      t.isIdentifier(test.left.object) &&
      test.left.object.name === arrayName &&
      t.isIdentifier(test.left.property) &&
      test.left.property.name === 'length' &&
      t.isNumericLiteral(test.right) &&
      test.right.value === 0) {
    return true;
  }
  
  return false;
}
```

### 3. Scope Walking Algorithm

Walk up the AST to find enclosing scopes and check what guards are active:

```typescript
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
```

### 4. Helper Methods

```typescript
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
```

## Integration with Existing Rules

### Before: Scattered Logic

```typescript
// type-mismatch-operation rule (98 lines of guard checking)
const isGuardedByTypeof = (variableNode: t.Node, expectedType: string): boolean => {
  // ... 98 lines of code duplicated in this rule
};

// unsafe-formatting-methods rule (37 lines of null checking)
let hasNullCheck = false;
let currentPath: NodePath | null = path.parentPath;
while (currentPath && !hasNullCheck) {
  // ... 37 lines of code duplicated in this rule
}

// unsafe-array-operations rule (scattered throughout)
// Various array length checks scattered in different places
```

### After: Unified System

```typescript
// Create analyzer once
const cfa = new ControlFlowAnalyzer(ast, componentSpec);

// type-mismatch-operation rule
if (cfa.isNarrowedToType(leftNode, path, 'number') &&
    cfa.isNarrowedToType(rightNode, path, 'number')) {
  // Both sides are numbers - safe!
  return;
}

// unsafe-formatting-methods rule
if (cfa.isDefinitelyNonNull(propertyNode, path)) {
  // Property is guaranteed non-null - safe!
  return;
}

// unsafe-array-operations rule
if (cfa.isDefinitelyNonEmpty(arrayNode, path)) {
  // Array is guaranteed to have elements - safe!
  return;
}
```

## Benefits

1. **Consistency**: All rules use the same logic for detecting guards
2. **Maintainability**: Fix a bug once, all rules benefit
3. **Extensibility**: Add new guard patterns in one place
4. **Performance**: Reuse analysis results across rules
5. **Accuracy**: Fewer false positives, matches TypeScript's behavior
6. **Testability**: Test control flow logic separately from rules

## Testing Strategy

### Unit Tests for ControlFlowAnalyzer

```typescript
describe('ControlFlowAnalyzer', () => {
  describe('isDefinitelyNonNull', () => {
    it('should detect != null guard', () => {
      const code = `
        if (x != null) {
          x.toFixed();  // Should be safe here
        }
      `;
      // Assert true
    });
    
    it('should detect && short-circuit', () => {
      const code = `x && x.toFixed()`;
      // Assert true for x in right side
    });
    
    it('should NOT detect in else block', () => {
      const code = `
        if (x != null) {
          // safe here
        } else {
          x.toFixed();  // NOT safe here
        }
      `;
      // Assert false in else block
    });
  });
  
  describe('isNarrowedToType', () => {
    it('should detect typeof guard', () => {
      const code = `
        if (typeof x === 'number') {
          x + 1;  // Should be safe here
        }
      `;
      // Assert true
    });
    
    it('should detect && conjunction', () => {
      const code = `
        if (typeof x === 'number' && typeof y === 'number') {
          x - y;  // Both should be safe here
        }
      `;
      // Assert true for both x and y
    });
  });
  
  describe('isDefinitelyNonEmpty', () => {
    it('should detect length > 0 guard', () => {
      const code = `
        if (arr.length > 0) {
          arr[0];  // Should be safe here
        }
      `;
      // Assert true
    });
    
    it('should detect early return pattern', () => {
      const code = `
        if (arr.length === 0) return;
        arr[0];  // Should be safe here
      `;
      // Assert true after early return
    });
  });
});
```

### Integration Tests

Run full fixture test suite and verify:
- Fewer false positives across all valid components
- All broken component tests still catch violations
- No new false negatives introduced

## File Structure

```
packages/React/test-harness/src/lib/
├── component-linter.ts          # Uses ControlFlowAnalyzer
├── type-inference-engine.ts     # Existing type inference
├── control-flow-analyzer.ts     # NEW: Control flow analysis
└── type-context.ts              # Existing type context
```

## Migration Plan

1. **Phase 1**: Create `control-flow-analyzer.ts` with core class
2. **Phase 2**: Implement `isDefinitelyNonNull()` method
3. **Phase 3**: Implement `isNarrowedToType()` method
4. **Phase 4**: Implement `isDefinitelyNonEmpty()` method
5. **Phase 5**: Update `type-mismatch-operation` rule to use it
6. **Phase 6**: Update `unsafe-formatting-methods` rule to use it
7. **Phase 7**: Update `unsafe-array-operations` rule to use it
8. **Phase 8**: Remove old duplicated guard detection code
9. **Phase 9**: Run full test suite and fix any issues
10. **Phase 10**: Document and commit

## Expected Impact

### Before CFA
- win-loss-analysis: 6 violations → 0 (manual fixes)
- simple-drilldown-chart: 2 violations → 0 (manual fixes)
- Remaining 24 valid components with violations

### After CFA
- Estimated: 15-20 additional components will become clean
- Major reduction in `unsafe-formatting-methods` violations (21 total)
- Significant reduction in `unsafe-array-operations` violations (13 total)
- Complete elimination of typeof narrowing false positives

## Future Enhancements

1. **Assignment Tracking**: Track when variables are reassigned
2. **Array Method Narrowing**: Understand that `.filter()` might return empty array
3. **Intersection Types**: Handle multiple guards on same variable
4. **Negation**: Handle `if (!x)` and `if (x === null)` patterns
5. **Custom Type Guards**: Recognize user-defined type guard functions

## References

- TypeScript Control Flow Analysis: https://www.typescriptlang.org/docs/handbook/2/narrowing.html
- Flow Type Refinements: https://flow.org/en/docs/lang/refinements/
- ESLint Type-Aware Linting: https://typescript-eslint.io/linting/typed-linting/

---

**Status**: Design complete, ready for implementation
**Priority**: High - will eliminate majority of false positives
**Estimated Effort**: 2-3 hours for full implementation and testing
**Dependencies**: None - can be built independently
