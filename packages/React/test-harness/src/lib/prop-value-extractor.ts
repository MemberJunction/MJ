/**
 * Prop Value Extractor Utility
 *
 * Extracts static values from JSX attribute AST nodes for validation purposes.
 * This utility is foundational for semantic validation - it converts AST nodes
 * into analyzable values that semantic validators can work with.
 *
 * Supported Extractions:
 * - Literal values: strings, numbers, booleans, null
 * - Arrays of literals
 * - Object literals (nested)
 * - Identifies dynamic values (identifiers/expressions) that can't be extracted
 *
 * Usage:
 * ```typescript
 * const value = PropValueExtractor.extract(jsxAttribute);
 * if (value._type === 'identifier') {
 *   // Can't validate statically - skip with warning
 * } else {
 *   // Can validate - proceed with constraint checking
 * }
 * ```
 */

import * as t from '@babel/types';

/**
 * Represents a value that couldn't be extracted statically
 */
export interface DynamicValue {
  _type: 'identifier' | 'expression';
  name?: string;
  description?: string;
}

/**
 * Union type for extracted values
 */
export type ExtractedValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ExtractedValue[]
  | { [key: string]: ExtractedValue }
  | DynamicValue;

/**
 * Utility class for extracting static values from JSX attribute AST nodes
 */
export class PropValueExtractor {
  /**
   * Extract a value from a JSX attribute
   *
   * @param attr - The JSX attribute node
   * @returns The extracted value, or a DynamicValue object if it can't be extracted statically
   *
   * @example
   * ```typescript
   * // Boolean shorthand: <Component show />
   * PropValueExtractor.extract(attr) // => true
   *
   * // String literal: <Component name="test" />
   * PropValueExtractor.extract(attr) // => "test"
   *
   * // Expression: <Component count={42} />
   * PropValueExtractor.extract(attr) // => 42
   *
   * // Array: <Component items={['a', 'b']} />
   * PropValueExtractor.extract(attr) // => ['a', 'b']
   *
   * // Dynamic: <Component name={userName} />
   * PropValueExtractor.extract(attr) // => { _type: 'identifier', name: 'userName' }
   * ```
   */
  static extract(attr: t.JSXAttribute): ExtractedValue {
    // Boolean shorthand: <Component show />
    if (!attr.value) {
      return true;
    }

    // String literal: <Component name="test" />
    if (t.isStringLiteral(attr.value)) {
      return attr.value.value;
    }

    // Expression container: <Component prop={...} />
    if (t.isJSXExpressionContainer(attr.value)) {
      const expr = attr.value.expression;

      // Handle JSXEmptyExpression (e.g., {/* comment */})
      if (t.isJSXEmptyExpression(expr)) {
        return undefined;
      }

      return this.extractExpression(expr);
    }

    // JSX element or fragment (rare but possible)
    if (t.isJSXElement(attr.value) || t.isJSXFragment(attr.value)) {
      return {
        _type: 'expression',
        description: 'JSX element as prop value',
      };
    }

    return undefined;
  }

  /**
   * Extract a value from an expression node
   *
   * @param expr - The expression node
   * @returns The extracted value
   */
  private static extractExpression(expr: t.Expression | t.JSXEmptyExpression): ExtractedValue {
    // Simple literals
    if (t.isStringLiteral(expr)) return expr.value;
    if (t.isNumericLiteral(expr)) return expr.value;
    if (t.isBooleanLiteral(expr)) return expr.value;
    if (t.isNullLiteral(expr)) return null;

    // Template literals (can be static)
    if (t.isTemplateLiteral(expr)) {
      return this.extractTemplateLiteral(expr);
    }

    // Arrays
    if (t.isArrayExpression(expr)) {
      return this.extractArray(expr);
    }

    // Objects
    if (t.isObjectExpression(expr)) {
      return this.extractObjectLiteral(expr);
    }

    // Unary expressions (e.g., -5, !true)
    if (t.isUnaryExpression(expr)) {
      return this.extractUnaryExpression(expr);
    }

    // Binary expressions (e.g., 1 + 2, 'hello' + 'world')
    if (t.isBinaryExpression(expr)) {
      return this.extractBinaryExpression(expr);
    }

    // Identifiers - can't extract statically
    if (t.isIdentifier(expr)) {
      return {
        _type: 'identifier',
        name: expr.name,
      };
    }

    // Member expressions (e.g., obj.prop)
    if (t.isMemberExpression(expr)) {
      return {
        _type: 'expression',
        description: 'member expression',
      };
    }

    // Call expressions (e.g., func())
    if (t.isCallExpression(expr)) {
      return {
        _type: 'expression',
        description: 'function call',
      };
    }

    // Arrow functions, function expressions
    if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
      return {
        _type: 'expression',
        description: 'function',
      };
    }

    // Conditional expressions (ternary)
    if (t.isConditionalExpression(expr)) {
      return this.extractConditionalExpression(expr);
    }

    // All other expression types
    return {
      _type: 'expression',
      description: expr.type,
    };
  }

  /**
   * Extract template literal if it's static
   *
   * @param node - Template literal node
   * @returns Concatenated string if all expressions are literals, otherwise DynamicValue
   */
  private static extractTemplateLiteral(node: t.TemplateLiteral): ExtractedValue {
    // Check if all expressions are static literals
    const parts: string[] = [];

    for (let i = 0; i < node.quasis.length; i++) {
      parts.push(node.quasis[i].value.cooked || node.quasis[i].value.raw);

      if (i < node.expressions.length) {
        const expr = node.expressions[i];
        // Handle TSType nodes (TypeScript types in template literals)
        if (!t.isExpression(expr) && !t.isJSXEmptyExpression(expr)) {
          return {
            _type: 'expression',
            description: 'template literal with type annotation',
          };
        }
        const value = this.extractExpression(expr);

        // If any expression is dynamic, the whole template is dynamic
        if (this.isDynamicValue(value)) {
          return {
            _type: 'expression',
            description: 'template literal with dynamic expressions',
          };
        }

        // Convert to string
        parts.push(String(value));
      }
    }

    return parts.join('');
  }

  /**
   * Extract array expression
   *
   * @param node - Array expression node
   * @returns Array of extracted values
   */
  private static extractArray(node: t.ArrayExpression): ExtractedValue {
    const result: ExtractedValue[] = [];

    for (const element of node.elements) {
      if (!element) {
        // Sparse array: [1, , 3]
        result.push(undefined);
        continue;
      }

      if (t.isSpreadElement(element)) {
        // Spread element: [...items] - can't extract statically
        result.push({
          _type: 'expression',
          description: 'spread element',
        });
        continue;
      }

      result.push(this.extractExpression(element));
    }

    return result;
  }

  /**
   * Extract object literal
   *
   * @param node - Object expression node
   * @returns Object with extracted property values
   */
  private static extractObjectLiteral(node: t.ObjectExpression): ExtractedValue {
    const result: { [key: string]: ExtractedValue } = {};

    for (const prop of node.properties) {
      // Spread properties: { ...obj }
      if (t.isSpreadElement(prop)) {
        result['...'] = {
          _type: 'expression',
          description: 'spread property',
        };
        continue;
      }

      // Object method: { foo() {} }
      if (t.isObjectMethod(prop)) {
        const key = this.getPropertyKey(prop.key, prop.computed);
        if (key) {
          result[key] = {
            _type: 'expression',
            description: 'object method',
          };
        }
        continue;
      }

      // Regular property: { foo: 'bar' }
      if (t.isObjectProperty(prop)) {
        const key = this.getPropertyKey(prop.key, prop.computed);
        if (key) {
          result[key] = this.extractExpression(prop.value as t.Expression);
        }
        continue;
      }
    }

    return result;
  }

  /**
   * Get property key as string
   *
   * @param key - Property key node
   * @param computed - Whether the property is computed
   * @returns String key or null if can't be extracted
   */
  private static getPropertyKey(
    key: t.Expression | t.Identifier | t.PrivateName | t.StringLiteral | t.NumericLiteral | t.BigIntLiteral,
    computed: boolean
  ): string | null {
    if (t.isIdentifier(key)) {
      return key.name;
    }

    if (t.isStringLiteral(key)) {
      return key.value;
    }

    if (t.isNumericLiteral(key)) {
      return String(key.value);
    }

    if (computed && t.isExpression(key)) {
      // Computed property: { [expr]: value }
      const value = this.extractExpression(key);
      if (!this.isDynamicValue(value)) {
        return String(value);
      }
    }

    return null;
  }

  /**
   * Extract unary expression if operand is static
   *
   * @param node - Unary expression node
   * @returns Computed value or DynamicValue
   */
  private static extractUnaryExpression(node: t.UnaryExpression): ExtractedValue {
    const operand = this.extractExpression(node.argument);

    if (this.isDynamicValue(operand)) {
      return operand;
    }

    // Apply unary operator
    switch (node.operator) {
      case '-':
        return typeof operand === 'number' ? -operand : operand;
      case '+':
        return typeof operand === 'number' ? +operand : operand;
      case '!':
        return !operand;
      case '~':
        return typeof operand === 'number' ? ~operand : operand;
      case 'typeof':
        return typeof operand;
      case 'void':
        return undefined;
      default:
        return {
          _type: 'expression',
          description: `unary ${node.operator}`,
        };
    }
  }

  /**
   * Extract binary expression if both operands are static
   *
   * @param node - Binary expression node
   * @returns Computed value or DynamicValue
   */
  private static extractBinaryExpression(node: t.BinaryExpression): ExtractedValue {
    // Handle PrivateName in left operand (shouldn't happen in normal code but TypeScript allows it)
    if (t.isPrivateName(node.left)) {
      return {
        _type: 'expression',
        description: 'binary expression with private name',
      };
    }
    const left = this.extractExpression(node.left);
    const right = this.extractExpression(node.right);

    // If either side is dynamic, can't compute
    if (this.isDynamicValue(left) || this.isDynamicValue(right)) {
      return {
        _type: 'expression',
        description: `binary ${node.operator}`,
      };
    }

    // Try to compute the result
    try {
      switch (node.operator) {
        case '+':
          return (left as any) + (right as any);
        case '-':
          return (left as any) - (right as any);
        case '*':
          return (left as any) * (right as any);
        case '/':
          return (left as any) / (right as any);
        case '%':
          return (left as any) % (right as any);
        case '**':
          return (left as any) ** (right as any);
        case '==':
          return left == right;
        case '!=':
          return left != right;
        case '===':
          return left === right;
        case '!==':
          return left !== right;
        case '<':
          return (left as any) < (right as any);
        case '<=':
          return (left as any) <= (right as any);
        case '>':
          return (left as any) > (right as any);
        case '>=':
          return (left as any) >= (right as any);
        case '&':
          return (left as any) & (right as any);
        case '|':
          return (left as any) | (right as any);
        case '^':
          return (left as any) ^ (right as any);
        case '<<':
          return (left as any) << (right as any);
        case '>>':
          return (left as any) >> (right as any);
        case '>>>':
          return (left as any) >>> (right as any);
        default:
          return {
            _type: 'expression',
            description: `binary ${node.operator}`,
          };
      }
    } catch {
      // Computation failed (e.g., type error)
      return {
        _type: 'expression',
        description: `binary ${node.operator}`,
      };
    }
  }

  /**
   * Extract conditional expression (ternary) if all parts are static
   *
   * @param node - Conditional expression node
   * @returns Value of the taken branch or DynamicValue
   */
  private static extractConditionalExpression(node: t.ConditionalExpression): ExtractedValue {
    const test = this.extractExpression(node.test);

    // If test is dynamic, we can't determine which branch is taken
    if (this.isDynamicValue(test)) {
      return {
        _type: 'expression',
        description: 'conditional expression',
      };
    }

    // Evaluate which branch is taken
    const consequent = this.extractExpression(node.consequent);
    const alternate = this.extractExpression(node.alternate);

    return test ? consequent : alternate;
  }

  /**
   * Check if a value is a DynamicValue (can't be validated statically)
   *
   * @param value - The extracted value
   * @returns True if the value is dynamic
   */
  static isDynamicValue(value: ExtractedValue): value is DynamicValue {
    return (
      typeof value === 'object' &&
      value !== null &&
      '_type' in value &&
      (value._type === 'identifier' || value._type === 'expression')
    );
  }

  /**
   * Check if an array contains any dynamic values
   *
   * @param arr - The array to check
   * @returns True if any element is dynamic
   */
  static hasAnyDynamicValue(arr: ExtractedValue[]): boolean {
    return arr.some((val) => {
      if (this.isDynamicValue(val)) return true;
      if (Array.isArray(val)) return this.hasAnyDynamicValue(val);
      if (typeof val === 'object' && val !== null && !('_type' in val)) {
        return Object.values(val).some((v) => this.isDynamicValue(v));
      }
      return false;
    });
  }

  /**
   * Get a human-readable description of the value
   *
   * @param value - The extracted value
   * @returns Description string
   */
  static describe(value: ExtractedValue): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    if (this.isDynamicValue(value)) {
      if (value._type === 'identifier' && value.name) {
        return `identifier '${value.name}'`;
      }
      return value.description || 'dynamic expression';
    }

    if (Array.isArray(value)) {
      return `array with ${value.length} element${value.length !== 1 ? 's' : ''}`;
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value);
      return `object with ${keys.length} propert${keys.length !== 1 ? 'ies' : 'y'}: {${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
    }

    if (typeof value === 'string') {
      return `"${value.length > 50 ? value.substring(0, 50) + '...' : value}"`;
    }

    return String(value);
  }
}
