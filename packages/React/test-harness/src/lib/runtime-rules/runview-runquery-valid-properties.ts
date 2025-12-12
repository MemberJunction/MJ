import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: runview-runquery-valid-properties
 *
 * Validates that RunView, RunViews, and RunQuery calls use correct properties and parameter formats.
 * Ensures proper structure and type validation for all database query operations.
 *
 * Severity: critical
 * Applies to: all components
 */
export const runviewRunqueryValidPropertiesRule: LintRule = {
  name: 'runview-runquery-valid-properties',
  appliesTo: 'all',
  test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
    const violations: Violation[] = [];

    // Valid properties for RunView/RunViews
    const validRunViewProps = new Set(['EntityName', 'ExtraFilter', 'OrderBy', 'Fields', 'MaxRows', 'StartRow', 'ResultType']);

    // Valid properties for RunQuery
    const validRunQueryProps = new Set([
      'QueryID',
      'QueryName',
      'CategoryID',
      'CategoryPath',
      'Parameters',
      'MaxRows',
      'StartRow',
      'ForceAuditLog',
      'AuditLogDescription',
    ]);

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for utilities.rv.RunView or utilities.rv.RunViews
        if (
          t.isMemberExpression(callee) &&
          t.isMemberExpression(callee.object) &&
          t.isIdentifier(callee.object.object) &&
          callee.object.object.name === 'utilities' &&
          t.isIdentifier(callee.object.property) &&
          callee.object.property.name === 'rv' &&
          t.isIdentifier(callee.property)
        ) {
          const methodName = callee.property.name;

          if (methodName === 'RunView' || methodName === 'RunViews') {
            // Check that first parameter exists
            if (!path.node.arguments[0]) {
              violations.push({
                rule: 'runview-runquery-valid-properties',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `${methodName} requires a ${methodName === 'RunViews' ? 'array of RunViewParams objects' : 'RunViewParams object'} as the first parameter.`,
                code: `${methodName}()`,
              });
              return;
            }

            // Get the config object(s)
            let configs: t.ObjectExpression[] = [];
            let hasValidFirstParam = false;

            if (methodName === 'RunViews') {
              // RunViews takes an array of configs
              if (t.isArrayExpression(path.node.arguments[0])) {
                hasValidFirstParam = true;
                configs = path.node.arguments[0].elements.filter((e): e is t.ObjectExpression => t.isObjectExpression(e));
              } else {
                violations.push({
                  rule: 'runview-runquery-valid-properties',
                  severity: 'critical',
                  line: path.node.arguments[0].loc?.start.line || 0,
                  column: path.node.arguments[0].loc?.start.column || 0,
                  message: `RunViews expects an array of RunViewParams objects, not a ${t.isObjectExpression(path.node.arguments[0]) ? 'single object' : 'non-array'}.
Use: RunViews([
  {
    EntityName: 'Entity1',
    ExtraFilter: 'IsActive = 1',
    Fields: 'ID, Name',
    StartRow: 0,
    MaxRows: 50
  },
  {
    EntityName: 'Entity2',
    OrderBy: 'CreatedAt DESC',
    StartRow: 0,
    MaxRows: 100
  }
])
Each object supports: EntityName, ExtraFilter, Fields, OrderBy, MaxRows, StartRow, ResultType`,
                  code: path.toString().substring(0, 100),
                });
              }
            } else if (methodName === 'RunView') {
              // RunView takes a single config
              if (t.isObjectExpression(path.node.arguments[0])) {
                hasValidFirstParam = true;
                configs = [path.node.arguments[0]];
              } else {
                const argType = t.isStringLiteral(path.node.arguments[0])
                  ? 'string'
                  : t.isArrayExpression(path.node.arguments[0])
                    ? 'array'
                    : t.isIdentifier(path.node.arguments[0])
                      ? 'identifier'
                      : 'non-object';
                violations.push({
                  rule: 'runview-runquery-valid-properties',
                  severity: 'critical',
                  line: path.node.arguments[0].loc?.start.line || 0,
                  column: path.node.arguments[0].loc?.start.column || 0,
                  message: `RunView expects a RunViewParams object, not ${argType === 'array' ? 'an' : 'a'} ${argType}.
Use: RunView({
  EntityName: 'YourEntity',
  ExtraFilter: 'Status = "Active"',  // Optional WHERE clause
  Fields: 'ID, Name, Status',        // Optional columns to return
  OrderBy: 'Name ASC',                // Optional sort
  StartRow: 0,                        // Optional offset (0-based)
  MaxRows: 100                        // Optional limit
})
Valid properties: EntityName, ExtraFilter, Fields, OrderBy, MaxRows, StartRow, ResultType`,
                  code: path.toString().substring(0, 100),
                });
              }
            }

            if (!hasValidFirstParam) {
              return;
            }

            // Check each config for invalid properties and required fields
            for (const config of configs) {
              // Check for required properties (must have EntityName)
              let hasEntityName = false;

              for (const prop of config.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  const propName = prop.key.name;

                  if (propName === 'EntityName') hasEntityName = true;

                  if (!validRunViewProps.has(propName)) {
                    // Special error messages for common mistakes
                    let message = `Invalid property '${propName}' on ${methodName}. Valid properties: ${Array.from(validRunViewProps).join(', ')}`;
                    let fix = `Remove '${propName}' property`;

                    if (propName === 'Parameters') {
                      message = `${methodName} does not support 'Parameters'. Use 'ExtraFilter' for WHERE clauses.`;
                      fix = `Replace 'Parameters' with 'ExtraFilter' and format as SQL WHERE clause`;
                    } else if (propName === 'ViewID' || propName === 'ViewName') {
                      message = `${methodName} property '${propName}' is not allowed in components. Use 'EntityName' instead.`;
                      fix = `Replace '${propName}' with 'EntityName' and specify the entity name`;
                    } else if (propName === 'UserSearchString') {
                      message = `${methodName} property 'UserSearchString' is not allowed in components. Use 'ExtraFilter' for filtering.`;
                      fix = `Remove 'UserSearchString' and use 'ExtraFilter' with appropriate WHERE clause`;
                    } else if (propName === 'ForceAuditLog' || propName === 'AuditLogDescription') {
                      message = `${methodName} property '${propName}' is not allowed in components.`;
                      fix = `Remove '${propName}' property`;
                    } else if (propName === 'GroupBy') {
                      message = `${methodName} does not support 'GroupBy'. Use RunQuery with a pre-defined query for aggregations.`;
                      fix = `Remove 'GroupBy' and use RunQuery instead for aggregated data`;
                    } else if (propName === 'Having') {
                      message = `${methodName} does not support 'Having'. Use RunQuery with a pre-defined query.`;
                      fix = `Remove 'Having' and use RunQuery instead`;
                    }

                    violations.push({
                      rule: 'runview-runquery-valid-properties',
                      severity: 'critical',
                      line: prop.loc?.start.line || 0,
                      column: prop.loc?.start.column || 0,
                      message,
                      code: `${propName}: ...`,
                    });
                  } else {
                    // Property name is valid, now check its type
                    const value = prop.value;

                    // Helper to check if a node is null or undefined
                    const isNullOrUndefined = (node: t.Node): boolean => {
                      return t.isNullLiteral(node) || (t.isIdentifier(node) && node.name === 'undefined');
                    };

                    // Helper to check if a node could evaluate to a string
                    const isStringLike = (node: t.Node, depth: number = 0): boolean => {
                      // Prevent infinite recursion
                      if (depth > 3) return false;

                      // Special handling for ternary operators - check both branches
                      if (t.isConditionalExpression(node)) {
                        const consequentOk = isStringLike(node.consequent, depth + 1) || isNullOrUndefined(node.consequent);
                        const alternateOk = isStringLike(node.alternate, depth + 1) || isNullOrUndefined(node.alternate);
                        return consequentOk && alternateOk;
                      }

                      // Explicitly reject object and array expressions
                      if (t.isObjectExpression(node) || t.isArrayExpression(node)) {
                        return false;
                      }

                      return (
                        t.isStringLiteral(node) ||
                        t.isTemplateLiteral(node) ||
                        t.isBinaryExpression(node) || // String concatenation
                        t.isIdentifier(node) || // Variable
                        t.isCallExpression(node) || // Function call
                        t.isMemberExpression(node)
                      ); // Property access
                    };

                    // Helper to check if a node could evaluate to a number
                    const isNumberLike = (node: t.Node): boolean => {
                      return (
                        t.isNumericLiteral(node) ||
                        t.isBinaryExpression(node) || // Math operations
                        t.isUnaryExpression(node) || // Negative numbers, etc
                        t.isConditionalExpression(node) || // Ternary
                        t.isIdentifier(node) || // Variable
                        t.isCallExpression(node) || // Function call
                        t.isMemberExpression(node)
                      ); // Property access
                    };

                    // Helper to check if a node is array-like
                    const isArrayLike = (node: t.Node): boolean => {
                      return (
                        t.isArrayExpression(node) ||
                        t.isIdentifier(node) || // Variable
                        t.isCallExpression(node) || // Function returning array
                        t.isMemberExpression(node) || // Property access
                        t.isConditionalExpression(node)
                      ); // Ternary
                    };

                    // Helper to check if a node is object-like (but not array)
                    const isObjectLike = (node: t.Node): boolean => {
                      if (t.isArrayExpression(node)) return false;
                      return (
                        t.isObjectExpression(node) ||
                        t.isIdentifier(node) || // Variable
                        t.isCallExpression(node) || // Function returning object
                        t.isMemberExpression(node) || // Property access
                        t.isConditionalExpression(node) || // Ternary
                        t.isSpreadElement(node)
                      ); // Spread syntax (though this is the problem case)
                    };

                    // Validate types based on property name
                    if (propName === 'ExtraFilter' || propName === 'OrderBy' || propName === 'EntityName') {
                      // These must be strings (ExtraFilter and OrderBy can also be null/undefined)
                      const allowNullUndefined = propName === 'ExtraFilter' || propName === 'OrderBy';
                      if (!isStringLike(value) && !(allowNullUndefined && isNullOrUndefined(value))) {
                        let exampleValue = '';
                        if (propName === 'ExtraFilter') {
                          exampleValue = `"Status = 'Active' AND Type = 'Customer'"`;
                        } else if (propName === 'OrderBy') {
                          exampleValue = `"CreatedAt DESC"`;
                        } else if (propName === 'EntityName') {
                          exampleValue = `"Products"`;
                        }

                        violations.push({
                          rule: 'runview-runquery-valid-properties',
                          severity: 'critical',
                          line: prop.loc?.start.line || 0,
                          column: prop.loc?.start.column || 0,
                          message: `${methodName} property '${propName}' must be a string, not ${t.isObjectExpression(value) ? 'an object' : t.isArrayExpression(value) ? 'an array' : 'a non-string value'}. Example: ${propName}: ${exampleValue}`,
                          code: `${propName}: ${prop.value.type === 'ObjectExpression' ? '{...}' : prop.value.type === 'ArrayExpression' ? '[...]' : '...'}`,
                        });
                      }
                    } else if (propName === 'Fields') {
                      // Fields must be an array of strings (or a string that we'll interpret as comma-separated)
                      if (!isArrayLike(value) && !isStringLike(value)) {
                        violations.push({
                          rule: 'runview-runquery-valid-properties',
                          severity: 'critical',
                          line: prop.loc?.start.line || 0,
                          column: prop.loc?.start.column || 0,
                          message: `${methodName} property 'Fields' must be an array of field names or a comma-separated string. Example: Fields: ['ID', 'Name', 'Status'] or Fields: 'ID, Name, Status'`,
                          code: `Fields: ${prop.value.type === 'ObjectExpression' ? '{...}' : '...'}`,
                        });
                      }
                    } else if (propName === 'MaxRows' || propName === 'StartRow') {
                      // These must be numbers
                      if (!isNumberLike(value)) {
                        violations.push({
                          rule: 'runview-runquery-valid-properties',
                          severity: 'critical',
                          line: prop.loc?.start.line || 0,
                          column: prop.loc?.start.column || 0,
                          message: `${methodName} property '${propName}' must be a number. Example: ${propName}: ${propName === 'MaxRows' ? '100' : '0'}`,
                          code: `${propName}: ${prop.value.type === 'StringLiteral' ? '"..."' : prop.value.type === 'ObjectExpression' ? '{...}' : '...'}`,
                        });
                      }
                    }
                  }
                }
              }

              // Check that EntityName is present (required property)
              if (!hasEntityName) {
                violations.push({
                  rule: 'runview-runquery-valid-properties',
                  severity: 'critical',
                  line: config.loc?.start.line || 0,
                  column: config.loc?.start.column || 0,
                  message: `${methodName} requires 'EntityName' property. Add EntityName to identify what data to retrieve.`,
                  code: `${methodName}({ ... })`,
                });
              }
            }
          }
        }

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
          // Check that first parameter exists and is an object
          if (!path.node.arguments[0]) {
            violations.push({
              rule: 'runview-runquery-valid-properties',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: `RunQuery requires a RunQueryParams object as the first parameter.
Use: RunQuery({
  QueryName: 'YourQuery',             // Or use QueryID: 'uuid'
  CategoryPath: 'Category/Subcategory', // Optional. Used when QueryName is provided to provide a better filter
  Parameters: {                       // Optional query parameters
    param1: 'value1'
  },
  StartRow: 0,                        // Optional offset (0-based)
  MaxRows: 100                        // Optional limit
})`,
              code: `RunQuery()`,
            });
          } else if (!t.isObjectExpression(path.node.arguments[0])) {
            // First parameter is not an object
            const argType = t.isStringLiteral(path.node.arguments[0]) ? 'string' : t.isIdentifier(path.node.arguments[0]) ? 'identifier' : 'non-object';
            violations.push({
              rule: 'runview-runquery-valid-properties',
              severity: 'critical',
              line: path.node.arguments[0].loc?.start.line || 0,
              column: path.node.arguments[0].loc?.start.column || 0,
              message: `RunQuery expects a RunQueryParams object, not a ${argType}.
Use: RunQuery({
  QueryName: 'YourQuery',             // Or use QueryID: 'uuid'
  CategoryPath: 'Category/Subcategory', // Optional. Used when QueryName is provided to provide a better filter
  Parameters: {                       // Optional query parameters
    startDate: '2024-01-01',
    endDate: '2024-12-31'
  },
  StartRow: 0,                        // Optional offset (0-based)
  MaxRows: 100                        // Optional limit
})
Valid properties: QueryID, QueryName, CategoryID, CategoryPath, Parameters, MaxRows, StartRow, ForceAuditLog, AuditLogDescription`,
              code: path.toString().substring(0, 100),
            });
          } else {
            const config = path.node.arguments[0];

            // Check for required properties (must have QueryID or QueryName)
            let hasQueryID = false;
            let hasQueryName = false;
            let hasCategoryPath = false;
            const foundProps: string[] = [];

            for (const prop of config.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                const propName = prop.key.name;
                foundProps.push(propName);

                if (propName === 'QueryID') hasQueryID = true;
                if (propName === 'QueryName') hasQueryName = true;
                if (propName === 'CategoryPath') hasCategoryPath = true;

                if (!validRunQueryProps.has(propName)) {
                  let message = `Invalid property '${propName}' on RunQuery. Valid properties: ${Array.from(validRunQueryProps).join(', ')}`;
                  let fix = `Remove '${propName}' property`;

                  if (propName === 'ExtraFilter') {
                    message = `RunQuery does not support 'ExtraFilter'. WHERE clauses should be in the pre-defined query or passed as Parameters.`;
                    fix = `Remove 'ExtraFilter'. Add WHERE logic to the query definition or pass as Parameters`;
                  } else if (propName === 'Fields') {
                    message = `RunQuery does not support 'Fields'. The query definition determines returned fields.`;
                    fix = `Remove 'Fields'. Modify the query definition to return desired fields`;
                  } else if (propName === 'OrderBy') {
                    message = `RunQuery does not support 'OrderBy'. ORDER BY should be in the query definition.`;
                    fix = `Remove 'OrderBy'. Add ORDER BY to the query definition`;
                  }

                  violations.push({
                    rule: 'runview-runquery-valid-properties',
                    severity: 'critical',
                    line: prop.loc?.start.line || 0,
                    column: prop.loc?.start.column || 0,
                    message,
                    code: `${propName}: ...`,
                  });
                } else {
                  // Property name is valid, now check its type
                  const value = prop.value;

                  // Helper to check if a node is null or undefined
                  const isNullOrUndefined = (node: t.Node): boolean => {
                    return t.isNullLiteral(node) || (t.isIdentifier(node) && node.name === 'undefined');
                  };

                  // Helper to check if a node could evaluate to a string
                  const isStringLike = (node: t.Node, depth: number = 0): boolean => {
                    // Prevent infinite recursion
                    if (depth > 3) return false;

                    // Special handling for ternary operators - check both branches
                    if (t.isConditionalExpression(node)) {
                      const consequentOk = isStringLike(node.consequent, depth + 1) || isNullOrUndefined(node.consequent);
                      const alternateOk = isStringLike(node.alternate, depth + 1) || isNullOrUndefined(node.alternate);
                      return consequentOk && alternateOk;
                    }

                    // Explicitly reject object and array expressions
                    if (t.isObjectExpression(node) || t.isArrayExpression(node)) {
                      return false;
                    }

                    return (
                      t.isStringLiteral(node) ||
                      t.isTemplateLiteral(node) ||
                      t.isBinaryExpression(node) || // String concatenation
                      t.isIdentifier(node) || // Variable
                      t.isCallExpression(node) || // Function call
                      t.isMemberExpression(node)
                    ); // Property access
                  };

                  // Helper to check if a node could evaluate to a number
                  const isNumberLike = (node: t.Node): boolean => {
                    return (
                      t.isNumericLiteral(node) ||
                      t.isBinaryExpression(node) || // Math operations
                      t.isUnaryExpression(node) || // Negative numbers, etc
                      t.isConditionalExpression(node) || // Ternary
                      t.isIdentifier(node) || // Variable
                      t.isCallExpression(node) || // Function call
                      t.isMemberExpression(node)
                    ); // Property access
                  };

                  // Helper to check if a node is object-like (but not array)
                  const isObjectLike = (node: t.Node): boolean => {
                    if (t.isArrayExpression(node)) return false;
                    return (
                      t.isObjectExpression(node) ||
                      t.isIdentifier(node) || // Variable
                      t.isCallExpression(node) || // Function returning object
                      t.isMemberExpression(node) || // Property access
                      t.isConditionalExpression(node) || // Ternary
                      t.isSpreadElement(node)
                    ); // Spread syntax
                  };

                  // Validate types based on property name
                  if (propName === 'QueryID' || propName === 'QueryName' || propName === 'CategoryID' || propName === 'CategoryPath') {
                    // These must be strings
                    if (!isStringLike(value)) {
                      let exampleValue = '';
                      if (propName === 'QueryID') {
                        exampleValue = `"550e8400-e29b-41d4-a716-446655440000"`;
                      } else if (propName === 'QueryName') {
                        exampleValue = `"Sales by Region"`;
                      } else if (propName === 'CategoryID') {
                        exampleValue = `"123e4567-e89b-12d3-a456-426614174000"`;
                      } else if (propName === 'CategoryPath') {
                        exampleValue = `"/Reports/Sales/"`;
                      }

                      violations.push({
                        rule: 'runview-runquery-valid-properties',
                        severity: 'critical',
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: `RunQuery property '${propName}' must be a string. Example: ${propName}: ${exampleValue}`,
                        code: `${propName}: ${prop.value.type === 'ObjectExpression' ? '{...}' : prop.value.type === 'ArrayExpression' ? '[...]' : '...'}`,
                      });
                    }
                  } else if (propName === 'Parameters') {
                    // Parameters must be an object (Record<string, any>)
                    if (!isObjectLike(value)) {
                      violations.push({
                        rule: 'runview-runquery-valid-properties',
                        severity: 'critical',
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: `RunQuery property 'Parameters' must be an object containing key-value pairs. Example: Parameters: { startDate: '2024-01-01', status: 'Active' }`,
                        code: `Parameters: ${t.isArrayExpression(value) ? '[...]' : t.isStringLiteral(value) ? '"..."' : '...'}`,
                      });
                    }
                  } else if (propName === 'MaxRows' || propName === 'StartRow') {
                    // These must be numbers
                    if (!isNumberLike(value)) {
                      violations.push({
                        rule: 'runview-runquery-valid-properties',
                        severity: 'critical',
                        line: prop.loc?.start.line || 0,
                        column: prop.loc?.start.column || 0,
                        message: `RunQuery property '${propName}' must be a number. Example: ${propName}: ${propName === 'MaxRows' ? '100' : '0'}`,
                        code: `${propName}: ${prop.value.type === 'StringLiteral' ? '"..."' : prop.value.type === 'ObjectExpression' ? '{...}' : '...'}`,
                      });
                    }
                  }
                }
              }
            }

            // Check that at least one required property is present
            if (!hasQueryID && !hasQueryName) {
              // Build helpful context about what properties were found
              const propsContext = foundProps.length > 0 ? ` Found properties: ${foundProps.join(', ')}.` : '';

              // Special message if CategoryPath was provided without QueryName
              const message = hasCategoryPath
                ? `RunQuery requires QueryName (or QueryID). CategoryPath alone is insufficient - it's only used to help filter when QueryName is ambiguous.${propsContext}`
                : `RunQuery requires either QueryID or QueryName property to identify which query to run.${propsContext}`;

              // Suggest QueryName from spec if available
              const exampleQueryName = componentSpec?.dataRequirements?.queries?.[0]?.name || 'YourQueryName';

              violations.push({
                rule: 'runview-runquery-valid-properties',
                severity: 'critical',
                line: config.loc?.start.line || 0,
                column: config.loc?.start.column || 0,
                message,
                code: `RunQuery({ QueryName: '${exampleQueryName}', ... })`,
                suggestion: {
                  text: 'Add QueryName property to identify the query',
                  example: `await utilities.rq.RunQuery({\n  QueryName: '${exampleQueryName}',${hasCategoryPath ? "\n  CategoryPath: '...',  // Optional, helps disambiguate" : ''}\n  Parameters: { ... }  // Optional query parameters\n})`,
                },
              });
            }

            // Special check for CategoryPath-only calls (common Skip generation issue)
            // This provides a more targeted error for this specific anti-pattern
            if (!hasQueryID && !hasQueryName && hasCategoryPath) {
              const exampleQueryName = componentSpec?.dataRequirements?.queries?.[0]?.name || 'YourQueryName';
              const categoryPathProp = config.properties.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'CategoryPath') as
                | t.ObjectProperty
                | undefined;

              violations.push({
                rule: 'runquery-categorypath-without-queryname',
                severity: 'critical',
                line: categoryPathProp?.loc?.start.line || config.loc?.start.line || 0,
                column: categoryPathProp?.loc?.start.column || config.loc?.start.column || 0,
                message: `CategoryPath cannot be used alone - it requires QueryName. CategoryPath is only used to disambiguate when multiple queries share the same name. You must specify which query to run using QueryName.`,
                code: `CategoryPath: '...'  // Missing: QueryName`,
                suggestion: {
                  text: 'Add QueryName property alongside CategoryPath. The query name should come from your dataRequirements.queries[].name',
                  example: `// Query name from your spec: "${exampleQueryName}"\nawait utilities.rq.RunQuery({\n  QueryName: '${exampleQueryName}',  // Required: identifies which query to run\n  CategoryPath: '...',  // Optional: helps disambiguate if multiple queries have same name\n  Parameters: {\n    // Your query parameters here\n  }\n})`,
                },
              });
            }
          }
        }
      },
    });

    return violations;
  },
};
