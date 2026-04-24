import _traverse, { NodePath } from '@babel/traverse';
type TraverseModule = typeof _traverse & { default?: typeof _traverse };
const traverse = (((_traverse as TraverseModule).default) ?? _traverse) as typeof _traverse;
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: callback-parameter-validation
 *
 * Validates that callback method invocations (callbacks.OpenEntityRecord,
 * callbacks.RegisterMethod, callbacks.CreateSimpleNotification) are called
 * with the correct number and types of parameters.
 *
 * Severity: high (wrong parameter count), medium (invalid values), low (negative numbers)
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'callback-parameter-validation')
export class CallbackParameterValidationRule extends BaseLintRule {
  get Name() { return 'callback-parameter-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, _componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        // Check for callbacks?.method() calls
        if (t.isOptionalMemberExpression(path.node.callee) || t.isMemberExpression(path.node.callee)) {
          const callee = path.node.callee;

          // Check if it's callbacks.something or callbacks?.something
          if (
            (t.isIdentifier(callee.object) && callee.object.name === 'callbacks') ||
            (t.isOptionalMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === 'callbacks')
          ) {
            if (t.isIdentifier(callee.property)) {
              const methodName = callee.property.name;
              const args = path.node.arguments;

              // Validate parameters based on the method
              if (methodName === 'OpenEntityRecord') {
                // OpenEntityRecord(entityName: string, key: any)
                if (args.length < 2) {
                  violations.push({
                    rule: 'callback-parameter-validation',
                    severity: 'high',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `OpenEntityRecord requires 2 parameters (entityName, key), but ${args.length} provided`,
                    suggestion: {
                      text: `OpenEntityRecord expects an entity name and a key parameter.`,
                      example: `callbacks?.OpenEntityRecord?.(entityName, recordKey);`,
                    },
                  });
                }
              } else if (methodName === 'RegisterMethod') {
                // RegisterMethod(methodName: string, handler: Function)
                if (args.length < 2) {
                  violations.push({
                    rule: 'callback-parameter-validation',
                    severity: 'high',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `RegisterMethod requires 2 parameters (methodName, handler), but ${args.length} provided`,
                    suggestion: {
                      text: `RegisterMethod expects a method name and a handler function.`,
                      example: `callbacks?.RegisterMethod?.('myMethod', myHandler);`,
                    },
                  });
                }
              } else if (methodName === 'CreateSimpleNotification') {
                // CreateSimpleNotification(message: string, style?: NotificationStyle, hideAfter?: number)
                if (args.length < 1) {
                  violations.push({
                    rule: 'callback-parameter-validation',
                    severity: 'high',
                    line: path.node.loc?.start.line || 0,
                    column: path.node.loc?.start.column || 0,
                    message: `CreateSimpleNotification requires at least 1 parameter (message), but ${args.length} provided`,
                    suggestion: {
                      text: `CreateSimpleNotification expects a message and optional style and hideAfter parameters.`,
                      example: `callbacks?.CreateSimpleNotification?.('Success!', 'success', 3000);`,
                    },
                  });
                } else if (args.length >= 2) {
                  // Validate style parameter (second argument)
                  const styleArg = args[1];
                  if (t.isStringLiteral(styleArg)) {
                    const validStyles = ['none', 'success', 'error', 'warning', 'info'];
                    if (!validStyles.includes(styleArg.value)) {
                      violations.push({
                        rule: 'callback-parameter-validation',
                        severity: 'medium',
                        line: styleArg.loc?.start.line || 0,
                        column: styleArg.loc?.start.column || 0,
                        message: `Invalid notification style "${styleArg.value}". Must be one of: ${validStyles.join(', ')}`,
                        suggestion: {
                          text: `Use one of the valid notification styles.`,
                          example: `callbacks?.CreateSimpleNotification?.('Message', 'success', 3000);`,
                        },
                      });
                    }
                  }
                }

                // Validate hideAfter parameter (third argument) if provided
                if (args.length >= 3) {
                  const hideAfterArg = args[2];
                  if (t.isNumericLiteral(hideAfterArg) && hideAfterArg.value < 0) {
                    violations.push({
                      rule: 'callback-parameter-validation',
                      severity: 'low',
                      line: hideAfterArg.loc?.start.line || 0,
                      column: hideAfterArg.loc?.start.column || 0,
                      message: `hideAfter parameter should be a positive number (milliseconds)`,
                      suggestion: {
                        text: `Use a positive number for auto-hide duration in milliseconds.`,
                        example: `callbacks?.CreateSimpleNotification?.('Message', 'success', 3000); // Hide after 3 seconds`,
                      },
                    });
                  }
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
