import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';
import { TypeContext } from '../type-context';

/**
 * Rule: query-field-validation
 *
 * Validates that accessed fields exist in the query result definition (from component spec).
 * Tracks RunQuery result variables and their query names, then checks
 * field access in array method callbacks (map, forEach, filter, etc.).
 *
 * Severity: critical
 * Applies to: all components
 *
 * Closure dependencies: TypeContext (instantiated locally from componentSpec, no closure)
 */
export const queryFieldValidationRule: LintRule = {
  name: 'query-field-validation',
  appliesTo: 'all',
  test: (ast, _componentName, componentSpec) => {
    const violations: Violation[] = [];

    // Skip if no data requirements with queries
    if (!componentSpec?.dataRequirements?.queries || componentSpec.dataRequirements.queries.length === 0) {
      return violations;
    }

    // Build a map of query names to their field names from spec
    const queryFieldsMap = new Map<string, Set<string>>();
    const typeContext = new TypeContext(componentSpec);

    for (const queryReq of componentSpec.dataRequirements.queries) {
      const fields = typeContext.getQueryFieldTypes(queryReq.name, queryReq.categoryPath);
      if (fields && fields.size > 0) {
        queryFieldsMap.set(queryReq.name, new Set(fields.keys()));
      }
    }

    // If we couldn't load any query field metadata, skip validation
    if (queryFieldsMap.size === 0) {
      return violations;
    }

    // Track variables that hold RunQuery results and their query names
    const runQueryResultVars = new Map<string, string>(); // varName -> queryName
    // Track variables that hold query row arrays (from .Results)
    const queryArrayVars = new Map<string, string>(); // varName -> queryName

    // Helper function to validate field access within a callback body
    const validateFieldAccessInCallback = (
      callbackBody: t.Node,
      paramName: string,
      queryName: string,
    ) => {
      const validFields = queryFieldsMap.get(queryName);
      if (!validFields) return;

      // Walk the callback body to find all member expressions
      traverse(callbackBody, {
        MemberExpression(innerPath: NodePath<t.MemberExpression>) {
          // Skip if computed access (e.g., obj[prop])
          if (innerPath.node.computed) return;

          // Check if accessing a field on the query row variable
          if (t.isIdentifier(innerPath.node.object) &&
              innerPath.node.object.name === paramName &&
              t.isIdentifier(innerPath.node.property)) {
            const fieldName = innerPath.node.property.name;

            if (!validFields.has(fieldName)) {
              const availableFields = Array.from(validFields).slice(0, 10);
              const moreText = validFields.size > 10 ? ` and ${validFields.size - 10} more` : '';

              violations.push({
                rule: 'query-field-validation',
                severity: 'critical',
                line: innerPath.node.loc?.start.line || 0,
                column: innerPath.node.loc?.start.column || 0,
                message: `Field "${fieldName}" does not exist on query "${queryName}". Available fields: ${availableFields.join(', ')}${moreText}`,
                code: `${paramName}.${fieldName}`,
              });
            }
          }
        },
        noScope: true,
      });
    };

    // First pass: identify RunQuery result variables and their query names
    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (!t.isIdentifier(path.node.id)) return;
        const varName = path.node.id.name;
        const init = path.node.init;

        if (!init) return;

        // Check for await utilities.rq.RunQuery(...)
        if (t.isAwaitExpression(init) && t.isCallExpression(init.argument)) {
          const call = init.argument;
          if (t.isMemberExpression(call.callee) &&
              t.isMemberExpression(call.callee.object) &&
              t.isIdentifier(call.callee.property) &&
              call.callee.property.name === 'RunQuery') {
            if (call.arguments.length > 0 && t.isObjectExpression(call.arguments[0])) {
              for (const prop of call.arguments[0].properties) {
                if (t.isObjectProperty(prop) &&
                    t.isIdentifier(prop.key) &&
                    prop.key.name === 'QueryName' &&
                    t.isStringLiteral(prop.value)) {
                  runQueryResultVars.set(varName, prop.value.value);
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
          if (runQueryResultVars.has(sourceVar)) {
            queryArrayVars.set(varName, runQueryResultVars.get(sourceVar)!);
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
            let queryName: string | undefined;

            // Check if calling on a known query array variable
            if (t.isIdentifier(path.node.callee.object)) {
              queryName = queryArrayVars.get(path.node.callee.object.name);
            }

            // Check if calling on result.Results
            if (t.isMemberExpression(path.node.callee.object) &&
                t.isIdentifier(path.node.callee.object.object) &&
                t.isIdentifier(path.node.callee.object.property) &&
                path.node.callee.object.property.name === 'Results') {
              const resultVar = path.node.callee.object.object.name;
              queryName = runQueryResultVars.get(resultVar);
            }

            if (queryName && path.node.arguments.length > 0) {
              const callback = path.node.arguments[0];
              if ((t.isArrowFunctionExpression(callback) || t.isFunctionExpression(callback)) &&
                  callback.params.length > 0) {
                const param = callback.params[0];
                if (t.isIdentifier(param)) {
                  validateFieldAccessInCallback(callback.body, param.name, queryName);
                }
              }
            }
          }
        }
      },
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(queryFieldValidationRule);
