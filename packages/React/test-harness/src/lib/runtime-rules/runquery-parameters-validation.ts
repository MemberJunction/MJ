import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec, ComponentQueryDataRequirement } from '@memberjunction/interactive-component-types';

/**
 * Rule: runquery-parameters-validation
 *
 * Validates that RunQuery Parameters are properly formatted and match the component spec.
 * Ensures parameters are objects (not arrays), contain required fields, and match expected parameter names.
 *
 * Severity: critical/high
 * Applies to: all components
 */
export const runqueryParametersValidationRule: LintRule = {
  name: 'runquery-parameters-validation',
  appliesTo: 'all',
  test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
    const violations: Violation[] = [];

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

          // Find QueryName or QueryID to identify the query
          let queryName: string | null = null;
          let parametersNode: t.ObjectProperty | null = null;

          for (const prop of runQueryParams.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
              if (prop.key.name === 'QueryName' && t.isStringLiteral(prop.value)) {
                queryName = prop.value.value;
              } else if (prop.key.name === 'Parameters') {
                parametersNode = prop;
              }
            }
          }

          // IMPORTANT: Validate query name existence FIRST, before checking Parameters
          // This ensures we catch missing queries even when no Parameters are provided
          if (queryName && componentSpec?.dataRequirements?.queries) {
            const queryExists = componentSpec.dataRequirements.queries.some((q) => q.name === queryName);
            if (!queryExists) {
              const availableQueries = componentSpec.dataRequirements.queries.map((q) => q.name).join(', ');
              violations.push({
                rule: 'runquery-parameters-validation',
                severity: 'high',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Query '${queryName}' not found in component spec. Available queries: ${availableQueries || 'none'}`,
                code: `QueryName: '${componentSpec.dataRequirements.queries[0]?.name || 'QueryNameFromSpec'}'`,
              });
            }
          }

          // Check if query requires parameters but Parameters property is missing
          if (!parametersNode) {
            // Find the query spec to check if it has required parameters
            let specQuery: ComponentQueryDataRequirement | undefined;
            if (componentSpec?.dataRequirements?.queries && queryName) {
              specQuery = componentSpec.dataRequirements.queries.find((q) => q.name === queryName);
            }

            if (specQuery?.parameters && specQuery.parameters.length > 0) {
              // Check if any parameters are required
              // Note: isRequired field is being added to ComponentQueryParameterValue type
              const requiredParams = specQuery.parameters.filter((p) => {
                // Check for explicit isRequired flag (when available)
                const hasRequiredFlag = (p as any).isRequired === true || (p as any).isRequired === '1';
                // Or infer required if value is '@runtime' (runtime parameters should be provided)
                const isRuntimeParam = p.value === '@runtime';
                return hasRequiredFlag || isRuntimeParam;
              });

              if (requiredParams.length > 0) {
                const paramNames = requiredParams.map((p) => p.name).join(', ');
                const exampleParams = requiredParams.map((p) => `  ${p.name}: ${p.testValue ? `'${p.testValue}'` : "'value'"}`).join(',\n');

                violations.push({
                  rule: 'runquery-parameters-validation',
                  severity: 'high',
                  line: path.node.loc?.start.line || 0,
                  column: path.node.loc?.start.column || 0,
                  message: `Query '${queryName}' requires parameters but RunQuery call is missing 'Parameters' property. Required: ${paramNames}`,
                  code: `Parameters: {\n${exampleParams}\n}`,
                });
              }
            }

            // Skip further parameter validation since there's no Parameters property
            return;
          }

          // Find the query in componentSpec if available
          let specQuery: ComponentQueryDataRequirement | undefined;
          if (componentSpec?.dataRequirements?.queries && queryName) {
            specQuery = componentSpec.dataRequirements.queries.find((q) => q.name === queryName);
          }

          // Validate Parameters structure
          const paramValue = parametersNode.value;

          // Case 1: Parameters is an array (incorrect format)
          if (t.isArrayExpression(paramValue)) {
            const arrayElements = paramValue.elements.filter((e): e is t.ObjectExpression => t.isObjectExpression(e));

            // Check if it's an array of {Name/FieldName, Value} objects
            const paramPairs: { name: string; value: any }[] = [];
            let isNameValueFormat = true;

            for (const elem of arrayElements) {
              let name: string | null = null;
              let value: any = null;

              for (const prop of elem.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  const propName = prop.key.name.toLowerCase();
                  if (propName === 'name' || propName === 'fieldname') {
                    if (t.isStringLiteral(prop.value)) {
                      name = prop.value.value;
                    } else if (t.isIdentifier(prop.value)) {
                      name = prop.value.name;
                    }
                  } else if (propName === 'value') {
                    // Get the actual value (could be string, number, boolean, etc.)
                    if (t.isStringLiteral(prop.value)) {
                      value = `'${prop.value.value}'`;
                    } else if (t.isNumericLiteral(prop.value)) {
                      value = prop.value.value;
                    } else if (t.isBooleanLiteral(prop.value)) {
                      value = prop.value.value;
                    } else if (t.isIdentifier(prop.value)) {
                      value = prop.value.name;
                    } else {
                      value = '/* value */';
                    }
                  }
                }
              }

              if (name && value !== null) {
                paramPairs.push({ name, value });
              } else {
                isNameValueFormat = false;
                break;
              }
            }

            // Generate fix suggestion
            let fixMessage: string;
            let fixCode: string;

            if (isNameValueFormat && paramPairs.length > 0) {
              // Convert array format to object
              const objProps = paramPairs.map((p) => `  ${p.name}: ${p.value}`).join(',\n');
              fixCode = `Parameters: {\n${objProps}\n}`;

              // Check against spec if available
              if (specQuery?.parameters) {
                const specParamNames = specQuery.parameters.map((p) => p.name);
                const providedNames = paramPairs.map((p) => p.name);
                const missing = specParamNames.filter((n) => !providedNames.includes(n));
                const extra = providedNames.filter((n) => !specParamNames.includes(n));

                if (missing.length > 0 || extra.length > 0) {
                  fixMessage = `RunQuery Parameters must be object, not array. `;
                  if (missing.length > 0) {
                    fixMessage += `Missing required: ${missing.join(', ')}. `;
                  }
                  if (extra.length > 0) {
                    fixMessage += `Unknown params: ${extra.join(', ')}. `;
                  }
                  fixMessage += `Expected params from spec: ${specParamNames.join(', ')}`;
                } else {
                  fixMessage = `RunQuery Parameters must be object with key-value pairs, not array. Auto-fix: convert [{Name,Value}] to object format`;
                }
              } else {
                fixMessage = `RunQuery Parameters must be object with key-value pairs, not array of {Name/Value} objects`;
              }
            } else {
              // Invalid array format - provide example
              if (specQuery?.parameters && specQuery.parameters.length > 0) {
                const exampleParams = specQuery.parameters
                  .slice(0, 3)
                  .map((p) => `  ${p.name}: '${p.testValue || 'value'}'`)
                  .join(',\n');
                fixCode = `Parameters: {\n${exampleParams}\n}`;
                fixMessage = `RunQuery Parameters must be object. Expected params: ${specQuery.parameters.map((p) => p.name).join(', ')}`;
              } else {
                fixCode = `Parameters: {\n  paramName1: 'value1',\n  paramName2: 'value2'\n}`;
                fixMessage = `RunQuery Parameters must be object with key-value pairs, not array`;
              }
            }

            violations.push({
              rule: 'runquery-parameters-validation',
              severity: 'critical',
              line: parametersNode.loc?.start.line || 0,
              column: parametersNode.loc?.start.column || 0,
              message: fixMessage,
              code: fixCode,
            });
          }
          // Case 2: Parameters is an object (correct format, but validate against spec)
          else if (t.isObjectExpression(paramValue) && specQuery?.parameters) {
            // Create maps for case-insensitive comparison
            const providedParamsMap = new Map<string, string>(); // lowercase -> original

            for (const prop of paramValue.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                providedParamsMap.set(prop.key.name.toLowerCase(), prop.key.name);
              }
            }

            // Filter to only required parameters for validation
            const requiredParams = specQuery.parameters.filter((p) => {
              const hasRequiredFlag = (p as any).isRequired === true || (p as any).isRequired === '1';
              const isRuntimeParam = p.value === '@runtime';
              return hasRequiredFlag || isRuntimeParam;
            });

            const specParamNames = specQuery.parameters.map((p) => p.name);
            const specParamNamesLower = specParamNames.map((n) => n.toLowerCase());

            // Find missing REQUIRED parameters only (case-insensitive)
            const missing = requiredParams
              .map((p) => p.name)
              .filter((n) => !providedParamsMap.has(n.toLowerCase()));

            // Find extra parameters (not matching any spec param case-insensitively)
            const extra = Array.from(providedParamsMap.values()).filter((providedName) => !specParamNamesLower.includes(providedName.toLowerCase()));

            if (missing.length > 0 || extra.length > 0) {
              let message = `Query '${queryName}' parameter mismatch. `;
              if (missing.length > 0) {
                message += `Missing: ${missing.join(', ')}. `;
              }
              if (extra.length > 0) {
                message += `Unknown: ${extra.join(', ')}. `;
              }

              // Generate correct parameters object
              const correctParams = specQuery.parameters
                .map((p) => {
                  // Check if we have this param (case-insensitive)
                  const providedName = providedParamsMap.get(p.name.toLowerCase());
                  if (providedName) {
                    // Keep existing value, find the property with case-insensitive match
                    const existingProp = paramValue.properties.find(
                      (prop) => t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name.toLowerCase() === p.name.toLowerCase(),
                    ) as t.ObjectProperty | undefined;

                    if (existingProp && t.isStringLiteral(existingProp.value)) {
                      return `  ${p.name}: '${existingProp.value.value}'`;
                    } else if (existingProp && t.isNumericLiteral(existingProp.value)) {
                      return `  ${p.name}: ${existingProp.value.value}`;
                    } else if (existingProp && t.isIdentifier(existingProp.value)) {
                      return `  ${p.name}: ${existingProp.value.name}`;
                    }
                  }
                  // Add missing with test value
                  return `  ${p.name}: '${p.testValue || 'value'}'`;
                })
                .join(',\n');

              violations.push({
                rule: 'runquery-parameters-validation',
                severity: 'high',
                line: parametersNode.loc?.start.line || 0,
                column: parametersNode.loc?.start.column || 0,
                message: message + `Expected: {${specParamNames.join(', ')}}`,
                code: `Parameters: {\n${correctParams}\n}`,
              });
            }
          }
          // Case 3: Parameters is neither array nor object
          else if (!t.isObjectExpression(paramValue)) {
            let fixCode: string;
            let message: string;

            if (specQuery?.parameters && specQuery.parameters.length > 0) {
              const exampleParams = specQuery.parameters.map((p) => `  ${p.name}: '${p.testValue || 'value'}'`).join(',\n');
              fixCode = `Parameters: {\n${exampleParams}\n}`;
              message = `RunQuery Parameters must be object. Expected params from spec: ${specQuery.parameters.map((p) => p.name).join(', ')}`;
            } else {
              fixCode = `Parameters: {\n  paramName: 'value'\n}`;
              message = `RunQuery Parameters must be object with key-value pairs`;
            }

            violations.push({
              rule: 'runquery-parameters-validation',
              severity: 'critical',
              line: parametersNode.loc?.start.line || 0,
              column: parametersNode.loc?.start.column || 0,
              message,
              code: fixCode,
            });
          }

          // Note: Query name validation happens earlier (before Parameters check)
          // to ensure we catch missing queries even when no Parameters are provided
        }
      },
    });

    return violations;
  },
};
