import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { mapSQLTypeToJSType } from '../type-context';

/**
 * Rule: query-parameter-type-validation
 *
 * Validates that RunQuery parameter values match their expected types based on the query definition.
 * Checks for type mismatches (e.g., string where number is expected) and provides helpful suggestions.
 *
 * Severity: high
 * Applies to: all components
 */
export const queryParameterTypeValidationRule: LintRule = {
  name: 'query-parameter-type-validation',
  appliesTo: 'all',
  test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
    const violations: Violation[] = [];

    // Skip if no queries in spec
    if (!componentSpec?.dataRequirements?.queries || componentSpec.dataRequirements.queries.length === 0) {
      return violations;
    }

    // Build a map of query parameters with their types
    const queryParamsMap = new Map<string, Map<string, { type: string; sqlType: string }>>();
    for (const query of componentSpec.dataRequirements.queries) {
      if (query.parameters) {
        const paramMap = new Map<string, { type: string; sqlType: string }>();
        for (const param of query.parameters) {
          // Extended parameter info includes type
          const extParam = param as { name: string; type?: string };
          if (extParam.type) {
            paramMap.set(param.name.toLowerCase(), {
              type: mapSQLTypeToJSType(extParam.type),
              sqlType: extParam.type,
            });
          }
        }
        if (paramMap.size > 0) {
          queryParamsMap.set(query.name, paramMap);
        }
      }
    }

    // If no parameter type info available, skip validation
    if (queryParamsMap.size === 0) {
      return violations;
    }

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for utilities.rq.RunQuery
        if (
          t.isMemberExpression(callee) &&
          t.isMemberExpression(callee.object) &&
          t.isIdentifier(callee.object.object) &&
          callee.object.object.name === 'utilities' &&
          t.isIdentifier(callee.object.property) &&
          callee.object.property.name === 'rq' &&
          t.isIdentifier(callee.property) &&
          callee.property.name === 'RunQuery'
        ) {
          // Get the first argument (RunQuery params object)
          const runQueryParams = path.node.arguments[0];
          if (!t.isObjectExpression(runQueryParams)) return;

          // Find QueryName and Parameters
          let queryName: string | null = null;
          let parametersNode: t.ObjectExpression | null = null;

          for (const prop of runQueryParams.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              if (prop.key.name === 'QueryName' && t.isStringLiteral(prop.value)) {
                queryName = prop.value.value;
              } else if (prop.key.name === 'Parameters' && t.isObjectExpression(prop.value)) {
                parametersNode = prop.value;
              }
            }
          }

          // Skip if no query name or no parameters
          if (!queryName || !parametersNode) return;

          // Get the parameter types for this query
          const paramTypes = queryParamsMap.get(queryName);
          if (!paramTypes) return;

          // Validate each parameter value type
          for (const prop of parametersNode.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              const paramName = prop.key.name;
              const paramTypeInfo = paramTypes.get(paramName.toLowerCase());

              if (!paramTypeInfo) continue;

              const expectedType = paramTypeInfo.type;
              let actualType: string | null = null;
              let valueDesc: string = '';

              // Determine the actual type of the value
              if (t.isStringLiteral(prop.value)) {
                actualType = 'string';
                valueDesc = `'${prop.value.value}'`;
              } else if (t.isNumericLiteral(prop.value)) {
                actualType = 'number';
                valueDesc = String(prop.value.value);
              } else if (t.isBooleanLiteral(prop.value)) {
                actualType = 'boolean';
                valueDesc = String(prop.value.value);
              } else if (t.isNullLiteral(prop.value)) {
                actualType = 'null';
                valueDesc = 'null';
              } else if (t.isIdentifier(prop.value)) {
                // Variable - skip type checking (would need type inference)
                continue;
              } else if (t.isTemplateLiteral(prop.value)) {
                actualType = 'string';
                valueDesc = 'template string';
              } else {
                // Complex expression - skip
                continue;
              }

              // Check for type mismatch
              if (actualType && actualType !== expectedType) {
                // Special cases: allow null for nullable parameters
                if (actualType === 'null') {
                  continue;
                }

                // Generate suggestion based on expected type
                let suggestion = '';
                if (expectedType === 'number' && actualType === 'string') {
                  // If the string looks like a number, suggest removing quotes
                  if (t.isStringLiteral(prop.value) && !isNaN(Number(prop.value.value))) {
                    suggestion = `Use ${paramName}: ${prop.value.value} (without quotes)`;
                  } else {
                    suggestion = `Use a numeric value`;
                  }
                } else if (expectedType === 'boolean' && actualType === 'string') {
                  if (t.isStringLiteral(prop.value)) {
                    const val = prop.value.value.toLowerCase();
                    if (val === 'true' || val === 'false') {
                      suggestion = `Use ${paramName}: ${val} (without quotes)`;
                    } else {
                      suggestion = `Use ${paramName}: true or ${paramName}: false`;
                    }
                  }
                } else if (expectedType === 'string' && actualType === 'number') {
                  suggestion = `Use ${paramName}: '${valueDesc}'`;
                }

                violations.push({
                  rule: 'query-parameter-type-validation',
                  severity: 'high',
                  line: prop.loc?.start.line || 0,
                  column: prop.loc?.start.column || 0,
                  message: `Parameter "${paramName}" has wrong type. Expected ${expectedType} (${paramTypeInfo.sqlType}), got ${actualType} (${valueDesc}).${suggestion ? ' ' + suggestion : ''}`,
                  code: suggestion || `${paramName}: <${expectedType} value>`,
                });
              }

              // NOTE: Date parameter validation has been moved to TypeInferenceEngine
              // and is surfaced via the 'type-inference-errors' rule
            }
          }
        }
      },
    });

    return violations;
  },
};
