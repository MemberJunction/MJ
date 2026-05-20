import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import type { LinterOptions } from '../linter-options';
import { ControlFlowAnalyzer } from '../control-flow-analyzer';
import { TypeInferenceEngine } from '../type-inference-engine';
import type { EntityFieldInfo, EntityInfo } from '@memberjunction/core';

/**
 * Rule: unsafe-formatting-methods
 *
 * Detects formatting methods (toFixed, toLowerCase, etc.) called on potentially null/undefined
 * values without optional chaining or null checks. Uses control flow analysis and type inference
 * to reduce false positives.
 *
 * Closure dependencies: ControlFlowAnalyzer, TypeInferenceEngine, LinterOptions,
 * EntityInfo, EntityFieldInfo (all instantiated locally within the rule)
 *
 * Severity: medium-high (depends on entity metadata nullability)
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'unsafe-formatting-methods')
export class UnsafeFormattingMethodsRule extends BaseLintRule {
  get Name() { return 'unsafe-formatting-methods'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec, options?: LinterOptions): Violation[] {
    const violations: Violation[] = [];

    // Standard props that are always defined (passed by runtime to all components)
    const standardProps = new Set(['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings']);

    // Create control flow analyzer for guard detection
    const cfa = new ControlFlowAnalyzer(ast, componentSpec);

    // Create type inference engine for property safety checking
    const typeInferenceEngine = new TypeInferenceEngine(componentSpec);
    // Run analysis synchronously (the async part is not needed for basic inference)
    typeInferenceEngine.analyze(ast);
    const typeContext = typeInferenceEngine.getTypeContext();

    /**
     * Check if an object property is safe to access based on type inference.
     * Returns true if the object is locally defined with known structure and the property exists.
     *
     * Example: const metrics = { winRate: 75.5 }; metrics.winRate.toFixed() is safe
     */
    const isKnownObjectProperty = (objectName: string, propertyName: string): boolean => {
      const varType = typeContext.getVariableType(objectName);
      if (!varType) {
        return false;
      }

      // Check if it's an object type with known fields
      if (varType.type === 'object' && varType.fields) {
        const fieldInfo = varType.fields.get(propertyName);
        // Property exists in the object definition and is non-null
        return fieldInfo !== undefined && !fieldInfo.nullable;
      }

      return false;
    };

    // Common formatting methods that can fail on null/undefined
    const formattingMethods = new Set([
      // Number methods
      'toFixed',
      'toPrecision',
      'toExponential',
      // Conversion methods
      'toLocaleString',
      'toString',
      // String methods
      'toLowerCase',
      'toUpperCase',
      'trim',
      'split',
      'slice',
      'substring',
      'substr',
      'charAt',
      'charCodeAt',
      'indexOf',
      'lastIndexOf',
      'padStart',
      'padEnd',
      'repeat',
      'replace',
    ]);

    // Helper to check if a field is nullable in entity metadata
    interface FieldNullabilityResult {
      found: boolean;
      nullable: boolean;
      entityName?: string;
      fieldName?: string;
    }

    const checkFieldNullability = (propertyName: string): FieldNullabilityResult => {
      // Step 1: Check if componentSpec has data requirements and utilities are available
      if (!componentSpec?.dataRequirements?.entities || !options?.utilities?.md?.Entities) {
        return { found: false, nullable: false };
      }

      try {
        // Step 2: Iterate through only the entities defined in dataRequirements
        for (const dataReqEntity of componentSpec.dataRequirements.entities) {
          const entityName = dataReqEntity.name; // e.g., "AI Prompt Runs"

          // Step 3: Find this entity in the full metadata (case insensitive)
          // Use proper typing - we know Entities is an array of EntityInfo objects
          const fullEntity = options.utilities.md?.Entities.find((e: EntityInfo) => e.Name && e.Name.toLowerCase() === entityName.toLowerCase());

          if (fullEntity && fullEntity.Fields && Array.isArray(fullEntity.Fields)) {
            // Step 4: Look for the field in this specific entity (case insensitive)
            const field = fullEntity.Fields.find((f: EntityFieldInfo) => f.Name && f.Name.trim().toLowerCase() === propertyName.trim().toLowerCase());

            if (field) {
              // Field found - check if it's nullable
              // In MJ, AllowsNull is a boolean property
              return {
                found: true,
                nullable: field.AllowsNull,
                entityName: fullEntity.Name,
                fieldName: field.Name,
              };
            }
          }
        }
      } catch (error) {
        // If there's any error accessing metadata, fail gracefully
        console.warn('Error checking field nullability:', error);
      }

      return { found: false, nullable: false };
    };

    traverse(ast, {
      // Check JSX expressions
      JSXExpressionContainer(path: NodePath<t.JSXExpressionContainer>) {
        const expr = path.node.expression;

        // Look for object.property.method() pattern
        if (t.isCallExpression(expr) && t.isMemberExpression(expr.callee) && t.isIdentifier(expr.callee.property)) {
          const methodName = expr.callee.property.name;

          // Check if it's a formatting method
          if (formattingMethods.has(methodName)) {
            const callee = expr.callee;

            // Check if the object being called on is also a member expression (x.y pattern)
            if (t.isMemberExpression(callee.object) && t.isIdentifier(callee.object.property)) {
              const propertyName = callee.object.property.name;

              // Check if optional chaining is already used
              const hasOptionalChaining = callee.object.optional || callee.optional;

              // Check if there's a fallback (looking in parent for || or ??)
              let hasFallback = false;
              const parent = path.parent;
              const grandParent = path.parentPath?.parent;

              // Check if parent is a logical expression with fallback
              if (grandParent && t.isLogicalExpression(grandParent) && (grandParent.operator === '||' || grandParent.operator === '??')) {
                hasFallback = true;
              }

              // Also check conditional expressions
              if (grandParent && t.isConditionalExpression(grandParent)) {
                hasFallback = true;
              }

              // Check if inside a null/undefined check using Control Flow Analyzer
              const hasNullCheck = cfa.isDefinitelyNonNull(callee.object, path);

              // Skip if accessing properties on standard props (guaranteed to be defined)
              // Pattern: styles.borders.radius is ALWAYS safe (styles is always provided)
              let isStandardProp = false;
              if (t.isIdentifier(callee.object.object)) {
                const objectName = callee.object.object.name;
                if (standardProps.has(objectName)) {
                  isStandardProp = true;
                }
              }

              // Skip if the object property is known to be safe via type inference
              // Pattern: const metrics = { winRate: 75.5 }; metrics.winRate.toFixed() is safe
              // This uses TypeInferenceEngine to track object literal assignments
              let isKnownObjectProperty_flag = false;
              if (t.isIdentifier(callee.object.object)) {
                const objectName = callee.object.object.name;
                isKnownObjectProperty_flag = isKnownObjectProperty(objectName, propertyName);
              }

              if (!hasOptionalChaining && !hasFallback && !hasNullCheck && !isStandardProp && !isKnownObjectProperty_flag) {
                // Check entity metadata for this field
                const fieldInfo = checkFieldNullability(propertyName);

                // Determine severity based on metadata
                let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
                let message = `Unsafe formatting method '${methodName}()' called on '${propertyName}'. Consider using optional chaining.`;

                if (fieldInfo.found) {
                  if (fieldInfo.nullable) {
                    severity = 'high';
                    message = `Field '${fieldInfo.fieldName}' from entity '${fieldInfo.entityName}' is nullable. Use optional chaining to prevent runtime errors when calling '${methodName}()'.`;
                  } else {
                    // Keep medium severity but note it's non-nullable
                    message = `Field '${fieldInfo.fieldName}' from entity '${fieldInfo.entityName}' appears to be non-nullable, but consider using optional chaining for safety when calling '${methodName}()'.`;
                  }
                }

                // Get the object name for better error message
                let objectName = '';
                if (t.isIdentifier(callee.object.object)) {
                  objectName = callee.object.object.name;
                }

                violations.push({
                  rule: 'unsafe-formatting-methods',
                  severity: severity,
                  line: expr.loc?.start.line || 0,
                  column: expr.loc?.start.column || 0,
                  message: message,
                  code: `${objectName}.${propertyName}.${methodName}() → ${objectName}.${propertyName}?.${methodName}() ?? defaultValue`,
                });
              }
            }
          }
        }
      },

      // Also check template literals
      TemplateLiteral(path: NodePath<t.TemplateLiteral>) {
        for (const expr of path.node.expressions) {
          // Look for object.property.method() pattern in template expressions
          if (t.isCallExpression(expr) && t.isMemberExpression(expr.callee) && t.isIdentifier(expr.callee.property)) {
            const methodName = expr.callee.property.name;

            // Check if it's a formatting method
            if (formattingMethods.has(methodName)) {
              const callee = expr.callee;

              // Check if the object being called on is also a member expression (x.y pattern)
              if (t.isMemberExpression(callee.object) && t.isIdentifier(callee.object.property)) {
                const propertyName = callee.object.property.name;

                // Check if optional chaining is already used
                const hasOptionalChaining = callee.object.optional || callee.optional;

                // Check if inside a null/undefined check using Control Flow Analyzer
                // Note: For template literals, we need to check the template itself since
                // the expression doesn't have its own NodePath
                const hasNullCheck = cfa.isDefinitelyNonNull(callee.object, path) ||
                                    cfa.isProtectedByTernary(callee.object, path);

                // Skip if accessing properties on standard props (guaranteed to be defined)
                let isStandardProp = false;
                if (t.isIdentifier(callee.object.object)) {
                  const objectName = callee.object.object.name;
                  if (standardProps.has(objectName)) {
                    isStandardProp = true;
                  }
                }

                // Skip if the object property is known to be safe via type inference
                // Pattern: const metrics = { winRate: 75.5 }; metrics.winRate.toFixed() is safe
                // This uses TypeInferenceEngine to track object literal assignments
                let isKnownObjectProperty_flag = false;
                if (t.isIdentifier(callee.object.object)) {
                  const objectName = callee.object.object.name;
                  isKnownObjectProperty_flag = isKnownObjectProperty(objectName, propertyName);
                }

                if (!hasOptionalChaining && !hasNullCheck && !isStandardProp && !isKnownObjectProperty_flag) {
                  // Check entity metadata for this field
                  const fieldInfo = checkFieldNullability(propertyName);

                  // Determine severity based on metadata
                  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
                  let message = `Unsafe formatting method '${methodName}()' called on '${propertyName}' in template literal. Consider using optional chaining.`;

                  if (fieldInfo.found) {
                    if (fieldInfo.nullable) {
                      severity = 'high';
                      message = `Field '${propertyName}' is nullable in entity metadata. Use optional chaining to prevent runtime errors when calling '${methodName}()' in template literal.`;
                    } else {
                      // Keep medium severity but note it's non-nullable
                      message = `Field '${propertyName}' appears to be non-nullable, but consider using optional chaining for safety when calling '${methodName}()' in template literal.`;
                    }
                  }

                  // Get the object name for better error message
                  let objectName = '';
                  if (t.isIdentifier(callee.object.object)) {
                    objectName = callee.object.object.name;
                  }

                  violations.push({
                    rule: 'unsafe-formatting-methods',
                    severity: severity,
                    line: expr.loc?.start.line || 0,
                    column: expr.loc?.start.column || 0,
                    message: message,
                    code: `\${${objectName}.${propertyName}.${methodName}()} → \${${objectName}.${propertyName}?.${methodName}() ?? defaultValue}`,
                  });
                }
              }
            }
          }
        }
      },
    });

    return violations;
    }
}
