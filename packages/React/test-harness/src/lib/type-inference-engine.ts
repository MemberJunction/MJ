/**
 * Type Inference Engine - AST-based type inference for component linting
 *
 * This module analyzes JavaScript AST to infer and track types throughout
 * component code. It integrates with TypeContext to provide comprehensive
 * type information for validation rules.
 */

import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { UserInfo } from '@memberjunction/core';
import {
  TypeContext,
  TypeInfo,
  FieldTypeInfo,
  StandardTypes,
  mapSQLTypeToJSType,
  areTypesCompatible,
  describeType
} from './type-context';

/**
 * Result of type inference analysis
 */
export interface TypeInferenceResult {
  /** The type context with all inferred variable types */
  typeContext: TypeContext;
  /** Any type errors or warnings found during inference */
  errors: TypeInferenceError[];
}

/**
 * A type error or warning found during inference
 */
export interface TypeInferenceError {
  type: 'error' | 'warning';
  message: string;
  line: number;
  column: number;
  code?: string;
}

/**
 * TypeInferenceEngine - Analyzes AST to infer and track types
 */
export class TypeInferenceEngine {
  private typeContext: TypeContext;
  private errors: TypeInferenceError[] = [];
  private componentSpec?: ComponentSpec;
  private contextUser?: UserInfo;

  constructor(componentSpec?: ComponentSpec, contextUser?: UserInfo) {
    this.componentSpec = componentSpec;
    this.contextUser = contextUser;
    this.typeContext = new TypeContext(componentSpec);
  }

  /**
   * Analyze an AST and build type context
   */
  async analyze(ast: t.File): Promise<TypeInferenceResult> {
    this.errors = [];

    // First pass: collect all variable declarations and their types
    await this.collectVariableTypes(ast);

    // Return the result
    return {
      typeContext: this.typeContext,
      errors: this.errors
    };
  }

  /**
   * Get the type context after analysis
   */
  getTypeContext(): TypeContext {
    return this.typeContext;
  }

  /**
   * First pass: collect variable types from declarations and assignments
   */
  private async collectVariableTypes(ast: t.File): Promise<void> {
    const self = this;

    traverse(ast, {
      // Track variable declarations
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        self.inferDeclaratorType(path);
      },

      // Track assignments to existing variables
      AssignmentExpression(path: NodePath<t.AssignmentExpression>) {
        self.inferAssignmentType(path);
      },

      // Track function parameters
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        self.inferFunctionParameterTypes(path);
      },

      ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
        self.inferArrowFunctionParameterTypes(path);
      }
    });
  }

  /**
   * Infer type from a variable declarator
   */
  private inferDeclaratorType(path: NodePath<t.VariableDeclarator>): void {
    const node = path.node;

    // Get variable name(s)
    if (t.isIdentifier(node.id)) {
      const varName = node.id.name;

      if (node.init) {
        const type = this.inferExpressionType(node.init, path);
        this.typeContext.setVariableType(varName, type);
      } else {
        // Declared but not initialized
        this.typeContext.setVariableType(varName, { type: 'undefined', nullable: true });
      }
    } else if (t.isObjectPattern(node.id) && node.init) {
      // Destructuring: const { a, b } = obj
      this.inferDestructuringTypes(node.id, node.init, path);
    } else if (t.isArrayPattern(node.id) && node.init) {
      // Array destructuring: const [a, b] = arr
      this.inferArrayDestructuringTypes(node.id, node.init, path);
    }
  }

  /**
   * Infer type from an assignment expression
   */
  private inferAssignmentType(path: NodePath<t.AssignmentExpression>): void {
    const node = path.node;

    if (t.isIdentifier(node.left)) {
      const varName = node.left.name;
      const type = this.inferExpressionType(node.right, path);
      this.typeContext.setVariableType(varName, type);
    }
  }

  /**
   * Infer types for function parameters (component props)
   */
  private inferFunctionParameterTypes(path: NodePath<t.FunctionDeclaration>): void {
    const params = path.node.params;

    for (const param of params) {
      if (t.isIdentifier(param)) {
        // Simple parameter - unknown type
        this.typeContext.setVariableType(param.name, StandardTypes.unknown);
      } else if (t.isObjectPattern(param)) {
        // Destructured props - this is the common component pattern
        this.inferComponentPropsTypes(param);
      }
    }
  }

  /**
   * Infer types for arrow function parameters
   */
  private inferArrowFunctionParameterTypes(path: NodePath<t.ArrowFunctionExpression>): void {
    const params = path.node.params;

    for (const param of params) {
      if (t.isIdentifier(param)) {
        this.typeContext.setVariableType(param.name, StandardTypes.unknown);
      } else if (t.isObjectPattern(param)) {
        this.inferComponentPropsTypes(param);
      }
    }
  }

  /**
   * Infer types for component props from destructuring pattern
   */
  private inferComponentPropsTypes(pattern: t.ObjectPattern): void {
    for (const prop of pattern.properties) {
      if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
        const propName = prop.key.name;

        // Known standard props
        switch (propName) {
          case 'utilities':
            this.typeContext.setVariableType(propName, {
              type: 'object',
              fields: new Map([
                ['rv', { type: 'object', fromMetadata: true }], // RunView service
                ['rq', { type: 'object', fromMetadata: true }], // RunQuery service
                ['md', { type: 'object', fromMetadata: true }]  // Metadata
              ])
            });
            break;

          case 'styles':
            this.typeContext.setVariableType(propName, { type: 'object' });
            break;

          case 'components':
            this.typeContext.setVariableType(propName, { type: 'object' });
            break;

          case 'callbacks':
            this.typeContext.setVariableType(propName, { type: 'object' });
            break;

          case 'savedUserSettings':
            this.typeContext.setVariableType(propName, { type: 'object', nullable: true });
            break;

          case 'onSavedUserSettingsChange':
          case 'onSaveUserSettings':
            this.typeContext.setVariableType(propName, { type: 'function' });
            break;

          default:
            // Check if it's a prop defined in the component spec
            if (this.componentSpec?.properties) {
              const specProp = this.componentSpec.properties.find(p => p.name === propName);
              if (specProp) {
                this.typeContext.setVariableType(propName, {
                  type: this.mapSpecTypeToJSType(specProp.type),
                  nullable: !specProp.required
                });
                break;
              }
            }

            // Check if it's an event (on* prefix)
            if (propName.startsWith('on')) {
              this.typeContext.setVariableType(propName, { type: 'function', nullable: true });
            } else {
              this.typeContext.setVariableType(propName, StandardTypes.unknown);
            }
        }
      }
    }
  }

  /**
   * Map component spec type to JavaScript type
   */
  private mapSpecTypeToJSType(specType?: string): string {
    if (!specType) return 'unknown';

    const type = specType.toLowerCase();
    if (type === 'string') return 'string';
    if (type === 'number' || type === 'int' || type === 'integer' || type === 'float' || type === 'decimal') return 'number';
    if (type === 'boolean' || type === 'bool') return 'boolean';
    if (type.startsWith('array') || type.endsWith('[]')) return 'array';
    if (type === 'object') return 'object';
    if (type === 'function') return 'function';

    return 'unknown';
  }

  /**
   * Infer types from object destructuring
   */
  private inferDestructuringTypes(pattern: t.ObjectPattern, init: t.Expression, path: NodePath): void {
    const sourceType = this.inferExpressionType(init, path);

    for (const prop of pattern.properties) {
      if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
        const propName = prop.key.name;
        const varName = t.isIdentifier(prop.value) ? prop.value.name : propName;

        // Try to get the property type from the source
        if (sourceType.fields?.has(propName)) {
          const fieldType = sourceType.fields.get(propName)!;
          this.typeContext.setVariableType(varName, { type: fieldType.type, nullable: fieldType.nullable });
        } else {
          this.typeContext.setVariableType(varName, StandardTypes.unknown);
        }
      } else if (t.isRestElement(prop) && t.isIdentifier(prop.argument)) {
        // Rest element: const { a, ...rest } = obj
        this.typeContext.setVariableType(prop.argument.name, { type: 'object' });
      }
    }
  }

  /**
   * Infer types from array destructuring
   */
  private inferArrayDestructuringTypes(pattern: t.ArrayPattern, init: t.Expression, path: NodePath): void {
    const sourceType = this.inferExpressionType(init, path);

    for (let i = 0; i < pattern.elements.length; i++) {
      const element = pattern.elements[i];

      if (t.isIdentifier(element)) {
        // Get element type from array
        if (sourceType.arrayElementType) {
          this.typeContext.setVariableType(element.name, sourceType.arrayElementType);
        } else {
          this.typeContext.setVariableType(element.name, StandardTypes.unknown);
        }
      } else if (t.isRestElement(element) && t.isIdentifier(element.argument)) {
        // Rest element: const [a, ...rest] = arr
        this.typeContext.setVariableType(element.argument.name, {
          type: 'array',
          arrayElementType: sourceType.arrayElementType
        });
      }
    }
  }

  /**
   * Infer the type of an expression
   */
  inferExpressionType(node: t.Expression | t.SpreadElement | t.JSXNamespacedName | t.ArgumentPlaceholder, path?: NodePath): TypeInfo {
    // Literals
    if (t.isStringLiteral(node) || t.isTemplateLiteral(node)) {
      return StandardTypes.string;
    }
    if (t.isNumericLiteral(node)) {
      return StandardTypes.number;
    }
    if (t.isBooleanLiteral(node)) {
      return StandardTypes.boolean;
    }
    if (t.isNullLiteral(node)) {
      return StandardTypes.null;
    }
    if (t.isArrayExpression(node)) {
      return this.inferArrayType(node, path);
    }
    if (t.isObjectExpression(node)) {
      return this.inferObjectType(node, path);
    }

    // Identifiers (variable references)
    if (t.isIdentifier(node)) {
      return this.typeContext.getVariableType(node.name) || StandardTypes.unknown;
    }

    // Function expressions
    if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
      return StandardTypes.function;
    }

    // Call expressions
    if (t.isCallExpression(node)) {
      return this.inferCallExpressionType(node, path);
    }

    // New expressions (constructor calls like new Date())
    if (t.isNewExpression(node)) {
      return this.inferNewExpressionType(node, path);
    }

    // Member expressions
    if (t.isMemberExpression(node)) {
      return this.inferMemberExpressionType(node, path);
    }

    // Binary expressions
    if (t.isBinaryExpression(node)) {
      return this.inferBinaryExpressionType(node, path);
    }

    // Unary expressions
    if (t.isUnaryExpression(node)) {
      return this.inferUnaryExpressionType(node);
    }

    // Conditional (ternary) expressions
    if (t.isConditionalExpression(node)) {
      // Return the type of the consequent (or alternate if different, return unknown)
      const consequentType = this.inferExpressionType(node.consequent, path);
      const alternateType = this.inferExpressionType(node.alternate, path);

      if (areTypesCompatible(consequentType, alternateType)) {
        return consequentType;
      }
      return StandardTypes.unknown;
    }

    // Logical expressions (&&, ||, ??)
    if (t.isLogicalExpression(node)) {
      // For ||, the result is the first truthy value
      // For &&, the result is the first falsy or last value
      // For ??, the result is the first non-nullish value
      return this.inferExpressionType(node.right, path);
    }

    // Await expressions
    if (t.isAwaitExpression(node)) {
      return this.inferExpressionType(node.argument, path);
    }

    return StandardTypes.unknown;
  }

  /**
   * Infer type for array expressions
   */
  private inferArrayType(node: t.ArrayExpression, path?: NodePath): TypeInfo {
    if (node.elements.length === 0) {
      return { type: 'array', arrayElementType: StandardTypes.unknown };
    }

    // Try to infer element type from first element
    const firstElement = node.elements[0];
    if (firstElement && !t.isSpreadElement(firstElement)) {
      const elementType = this.inferExpressionType(firstElement, path);
      return { type: 'array', arrayElementType: elementType };
    }

    return { type: 'array', arrayElementType: StandardTypes.unknown };
  }

  /**
   * Infer type for object expressions
   */
  private inferObjectType(node: t.ObjectExpression, path?: NodePath): TypeInfo {
    const fields = new Map<string, FieldTypeInfo>();

    for (const prop of node.properties) {
      if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
        const propName = prop.key.name;
        const propType = this.inferExpressionType(prop.value as t.Expression, path);
        fields.set(propName, {
          type: propType.type,
          fromMetadata: false,
          nullable: propType.nullable
        });
      }
    }

    return { type: 'object', fields };
  }

  /**
   * Infer type for call expressions
   */
  private inferCallExpressionType(node: t.CallExpression, path?: NodePath): TypeInfo {
    // Check for RunView/RunQuery calls
    if (t.isMemberExpression(node.callee)) {
      const calleeObj = node.callee.object;
      const calleeProp = node.callee.property;

      // utilities.rv.RunView or utilities.rv.RunViews
      if (t.isMemberExpression(calleeObj) &&
          t.isIdentifier(calleeObj.property) &&
          t.isIdentifier(calleeProp)) {

        const serviceName = calleeObj.property.name;
        const methodName = calleeProp.name;

        if (serviceName === 'rv' && (methodName === 'RunView' || methodName === 'RunViews')) {
          return this.inferRunViewResultType(node);
        }

        if (serviceName === 'rq' && methodName === 'RunQuery') {
          return this.inferRunQueryResultType(node);
        }
      }
    }

    // Array methods that return arrays
    if (t.isMemberExpression(node.callee) && t.isIdentifier(node.callee.property)) {
      const methodName = node.callee.property.name;
      const arrayMethods = ['filter', 'map', 'slice', 'concat', 'flat', 'flatMap', 'sort', 'reverse'];

      if (arrayMethods.includes(methodName)) {
        const arrayType = this.inferExpressionType(node.callee.object, path);
        if (arrayType.type === 'array') {
          // For map, the element type might change
          if (methodName === 'map') {
            return { type: 'array', arrayElementType: StandardTypes.unknown };
          }
          return arrayType;
        }
      }

      // Array methods that return elements
      if (methodName === 'find') {
        const arrayType = this.inferExpressionType(node.callee.object, path);
        if (arrayType.arrayElementType) {
          return { ...arrayType.arrayElementType, nullable: true };
        }
      }

      // Methods that return numbers
      if (['indexOf', 'findIndex', 'length'].includes(methodName)) {
        return StandardTypes.number;
      }

      // Methods that return booleans
      if (['includes', 'some', 'every'].includes(methodName)) {
        return StandardTypes.boolean;
      }
    }

    return StandardTypes.unknown;
  }

  /**
   * Infer type for new expressions (constructor calls)
   */
  private inferNewExpressionType(node: t.NewExpression, path?: NodePath): TypeInfo {
    // Check for common constructors
    if (t.isIdentifier(node.callee)) {
      const constructorName = node.callee.name;

      // Date constructor
      if (constructorName === 'Date') {
        return { type: 'Date', fromMetadata: false };
      }

      // Array constructor
      if (constructorName === 'Array') {
        return { type: 'array', arrayElementType: StandardTypes.unknown };
      }

      // Object constructor
      if (constructorName === 'Object') {
        return { type: 'object', fields: new Map() };
      }

      // Map constructor
      if (constructorName === 'Map') {
        return { type: 'Map', fromMetadata: false };
      }

      // Set constructor
      if (constructorName === 'Set') {
        return { type: 'Set', fromMetadata: false };
      }

      // RegExp constructor
      if (constructorName === 'RegExp') {
        return { type: 'RegExp', fromMetadata: false };
      }

      // Error and related constructors
      if (['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError'].includes(constructorName)) {
        return { type: 'Error', fromMetadata: false };
      }
    }

    return StandardTypes.unknown;
  }

  /**
   * Infer type for RunView result
   */
  private inferRunViewResultType(node: t.CallExpression): TypeInfo {
    // Try to extract EntityName from the arguments
    let entityName: string | undefined;

    if (node.arguments.length > 0 && t.isObjectExpression(node.arguments[0])) {
      for (const prop of node.arguments[0].properties) {
        if (t.isObjectProperty(prop) &&
            t.isIdentifier(prop.key) &&
            prop.key.name === 'EntityName' &&
            t.isStringLiteral(prop.value)) {
          entityName = prop.value.value;
          break;
        }
      }
    }

    return this.typeContext.createRunViewResultType(entityName || 'unknown');
  }

  /**
   * Infer type for RunQuery result
   */
  private inferRunQueryResultType(node: t.CallExpression): TypeInfo {
    // Try to extract QueryName from the arguments
    let queryName: string | undefined;

    if (node.arguments.length > 0 && t.isObjectExpression(node.arguments[0])) {
      for (const prop of node.arguments[0].properties) {
        if (t.isObjectProperty(prop) &&
            t.isIdentifier(prop.key) &&
            prop.key.name === 'QueryName' &&
            t.isStringLiteral(prop.value)) {
          queryName = prop.value.value;
          break;
        }
      }
    }

    return this.typeContext.createRunQueryResultType(queryName || 'unknown');
  }

  /**
   * Infer type for member expressions
   */
  private inferMemberExpressionType(node: t.MemberExpression, path?: NodePath): TypeInfo {
    const objectType = this.inferExpressionType(node.object, path);

    // Array index access
    if (node.computed && t.isNumericLiteral(node.property)) {
      if (objectType.arrayElementType) {
        return objectType.arrayElementType;
      }
    }

    // Property access
    if (t.isIdentifier(node.property)) {
      const propName = node.property.name;

      // Check if the object has known fields
      if (objectType.fields?.has(propName)) {
        const field = objectType.fields.get(propName)!;
        return { type: field.type, nullable: field.nullable };
      }

      // Special case: Results property on RunView/RunQuery result
      if (propName === 'Results' && objectType.type === 'object') {
        // This should be an array of entity/query rows
        if (objectType.entityName) {
          return {
            type: 'array',
            arrayElementType: {
              type: 'entity-row',
              entityName: objectType.entityName
            }
          };
        }
        if (objectType.queryName) {
          return {
            type: 'array',
            arrayElementType: {
              type: 'query-row',
              queryName: objectType.queryName
            }
          };
        }
      }

      // Array length
      if (propName === 'length' && objectType.type === 'array') {
        return StandardTypes.number;
      }
    }

    return StandardTypes.unknown;
  }

  /**
   * Infer type for binary expressions
   */
  private inferBinaryExpressionType(node: t.BinaryExpression, path?: NodePath): TypeInfo {
    const operator = node.operator;

    // Comparison operators always return boolean
    if (['==', '!=', '===', '!==', '<', '<=', '>', '>=', 'in', 'instanceof'].includes(operator)) {
      return StandardTypes.boolean;
    }

    // Arithmetic operators return number
    if (['-', '*', '/', '%', '**', '|', '&', '^', '<<', '>>', '>>>'].includes(operator)) {
      return StandardTypes.number;
    }

    // + can be string or number
    if (operator === '+') {
      // node.left can be PrivateName in some cases, skip type inference for those
      if (t.isPrivateName(node.left)) {
        return StandardTypes.unknown;
      }

      const leftType = this.inferExpressionType(node.left, path);
      const rightType = this.inferExpressionType(node.right, path);

      if (leftType.type === 'string' || rightType.type === 'string') {
        return StandardTypes.string;
      }
      if (leftType.type === 'number' && rightType.type === 'number') {
        return StandardTypes.number;
      }
    }

    return StandardTypes.unknown;
  }

  /**
   * Infer type for unary expressions
   */
  private inferUnaryExpressionType(node: t.UnaryExpression): TypeInfo {
    const operator = node.operator;

    if (operator === '!') {
      return StandardTypes.boolean;
    }
    if (operator === 'typeof') {
      return StandardTypes.string;
    }
    if (['+', '-', '~'].includes(operator)) {
      return StandardTypes.number;
    }
    if (operator === 'void') {
      return StandardTypes.undefined;
    }

    return StandardTypes.unknown;
  }

  /**
   * Get inferred type for a variable by name
   */
  getVariableType(name: string): TypeInfo | undefined {
    return this.typeContext.getVariableType(name);
  }

  /**
   * Check if an expression is a specific type
   */
  isType(node: t.Expression, expectedType: string, path?: NodePath): boolean {
    const actualType = this.inferExpressionType(node, path);
    return actualType.type === expectedType;
  }
}

/**
 * Convenience function to analyze an AST and return type context
 */
export async function analyzeTypes(
  ast: t.File,
  componentSpec?: ComponentSpec,
  contextUser?: UserInfo
): Promise<TypeInferenceResult> {
  const engine = new TypeInferenceEngine(componentSpec, contextUser);
  return engine.analyze(ast);
}
