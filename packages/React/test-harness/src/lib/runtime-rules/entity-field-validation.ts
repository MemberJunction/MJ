import _traverse, { NodePath } from '@babel/traverse';
type TraverseModule = typeof _traverse & { default?: typeof _traverse };
const traverse = (((_traverse as TraverseModule).default) ?? _traverse) as typeof _traverse;
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { TypeContext } from '../type-context';

/**
 * Rule: entity-field-validation
 *
 * Validates that accessed fields exist on the entity being queried.
 * Tracks RunView result variables and their entity names, then checks
 * field access in array method callbacks (map, forEach, filter, etc.).
 *
 * Severity: critical
 * Applies to: all components
 *
 * Closure dependencies: TypeContext (instantiated locally from componentSpec, no closure)
 */
@RegisterClass(BaseLintRule, 'entity-field-validation')
export class EntityFieldValidationRule extends BaseLintRule {
  get Name() { return 'entity-field-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // Skip if no data requirements with entities
    if (!componentSpec?.dataRequirements?.entities || componentSpec.dataRequirements.entities.length === 0) {
      return violations;
    }

    // Build a map of entity names to their field names from metadata
    const entityFieldsMap = new Map<string, Set<string>>();
    const typeContext = new TypeContext(componentSpec);

    for (const entityReq of componentSpec.dataRequirements.entities) {
      const fields = typeContext.getEntityFieldTypesSync(entityReq.name);
      if (fields.size > 0) {
        entityFieldsMap.set(entityReq.name, new Set(fields.keys()));
      }
    }

    // If we couldn't load any entity metadata, skip validation
    if (entityFieldsMap.size === 0) {
      return violations;
    }

    // Track variables that hold RunView results and their entity names
    const runViewResultVars = new Map<string, string>(); // varName -> entityName
    // Track variables that hold entity row arrays (from .Results)
    const entityArrayVars = new Map<string, string>(); // varName -> entityName

    // Helper function to validate field access within a callback body
    const validateFieldAccessInCallback = (
      callbackBody: t.Node,
      paramName: string,
      entityName: string,
    ) => {
      const validFields = entityFieldsMap.get(entityName);
      if (!validFields) return;

      // Walk the callback body to find all member expressions
      traverse(callbackBody, {
        MemberExpression(innerPath: NodePath<t.MemberExpression>) {
          // Skip if computed access (e.g., obj[prop])
          if (innerPath.node.computed) return;

          // Check if accessing a field on the entity row variable
          if (t.isIdentifier(innerPath.node.object) &&
              innerPath.node.object.name === paramName &&
              t.isIdentifier(innerPath.node.property)) {
            const fieldName = innerPath.node.property.name;

            if (!validFields.has(fieldName)) {
              const availableFields = Array.from(validFields).slice(0, 10);
              const moreText = validFields.size > 10 ? ` and ${validFields.size - 10} more` : '';

              violations.push({
                rule: 'entity-field-validation',
                severity: 'critical',
                line: innerPath.node.loc?.start.line || 0,
                column: innerPath.node.loc?.start.column || 0,
                message: `Field "${fieldName}" does not exist on entity "${entityName}". Available fields: ${availableFields.join(', ')}${moreText}`,
                code: `${paramName}.${fieldName}`,
              });
            }
          }
        },
        noScope: true,
      });
    };

    // First pass: identify RunView result variables and their entity names
    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (!t.isIdentifier(path.node.id)) return;
        const varName = path.node.id.name;
        const init = path.node.init;

        if (!init) return;

        // Check for await utilities.rv.RunView(...)
        if (t.isAwaitExpression(init) && t.isCallExpression(init.argument)) {
          const call = init.argument;
          if (t.isMemberExpression(call.callee) &&
              t.isMemberExpression(call.callee.object) &&
              t.isIdentifier(call.callee.property) &&
              call.callee.property.name === 'RunView') {
            if (call.arguments.length > 0 && t.isObjectExpression(call.arguments[0])) {
              for (const prop of call.arguments[0].properties) {
                if (t.isObjectProperty(prop) &&
                    t.isIdentifier(prop.key) &&
                    prop.key.name === 'EntityName' &&
                    t.isStringLiteral(prop.value)) {
                  runViewResultVars.set(varName, prop.value.value);
                  break;
                }
              }
            }
          }
        }

        // Check for result.Results assignment
        if (t.isMemberExpression(init) &&
            t.isIdentifier(init.object) &&
            t.isIdentifier(init.property) &&
            init.property.name === 'Results') {
          const sourceVar = init.object.name;
          if (runViewResultVars.has(sourceVar)) {
            entityArrayVars.set(varName, runViewResultVars.get(sourceVar)!);
          }
        }
      },

      // Track array element access like results[0] or items.map(item => ...)
      CallExpression(path: NodePath<t.CallExpression>) {
        // Handle array methods like map, forEach, filter
        if (t.isMemberExpression(path.node.callee) &&
            t.isIdentifier(path.node.callee.property)) {
          const methodName = path.node.callee.property.name;
          const arrayMethods = ['map', 'forEach', 'filter', 'find', 'some', 'every', 'reduce'];

          if (arrayMethods.includes(methodName)) {
            let entityName: string | undefined;

            // Check if calling on a known entity array variable
            if (t.isIdentifier(path.node.callee.object)) {
              entityName = entityArrayVars.get(path.node.callee.object.name);
            }

            // Check if calling on result.Results
            if (t.isMemberExpression(path.node.callee.object) &&
                t.isIdentifier(path.node.callee.object.object) &&
                t.isIdentifier(path.node.callee.object.property) &&
                path.node.callee.object.property.name === 'Results') {
              const resultVar = path.node.callee.object.object.name;
              entityName = runViewResultVars.get(resultVar);
            }

            if (entityName && path.node.arguments.length > 0) {
              const callback = path.node.arguments[0];
              if ((t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) &&
                  callback.params.length > 0) {
                const param = callback.params[0];
                if (t.isIdentifier(param)) {
                  validateFieldAccessInCallback(callback.body, param.name, entityName);
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
