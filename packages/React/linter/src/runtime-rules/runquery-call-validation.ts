import { traverse, NodePath, isNullOrUndefined, isStringLike, isNumberLike, isObjectLike } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec, ComponentQueryDataRequirement, ComponentQueryParameterValue } from '@memberjunction/interactive-component-types';
import { mapSQLTypeToJSType, TypeContext } from '../type-context';

/**
 * Rule: runquery-call-validation
 *
 * Consolidates all RunQuery CALL SITE validation into a single traversal.
 * Absorbs checks from:
 * - runview-runquery-valid-properties (RunQuery portion)
 * - runquery-parameters-validation (all)
 * - query-parameter-type-validation (all)
 * - query-param-null-check (all)
 * - runquery-missing-categorypath (all)
 * - runquery-runview-validation (all)
 *
 * Severity: critical/high/medium
 * Applies to: all components
 */

const RULE_NAME = 'runquery-call-validation';

/** Valid properties for RunQuery */
const VALID_RUNQUERY_PROPS = new Set([
  'QueryID', 'QueryName', 'CategoryID', 'CategoryPath',
  'Parameters', 'MaxRows', 'StartRow', 'ForceAuditLog', 'AuditLogDescription',
]);

/** SQL keywords for injection detection */
/**
 * SQL structural patterns that indicate actual SQL statements, not query names.
 * Requires multiple keywords in combination to avoid false positives on
 * domain terms like "Join Year", "Update Status", "Revenue From Events".
 */
const SQL_PATTERNS = [
  /\bSELECT\b.*\bFROM\b/i,         // SELECT ... FROM
  /\bINSERT\b.*\bINTO\b/i,         // INSERT INTO
  /\bUPDATE\b.*\bSET\b/i,          // UPDATE ... SET
  /\bDELETE\b.*\bFROM\b/i,         // DELETE FROM
  /\bDROP\b\s+\bTABLE\b/i,         // DROP TABLE
  /\bALTER\b\s+\bTABLE\b/i,        // ALTER TABLE
  /\bCREATE\b\s+\bTABLE\b/i,       // CREATE TABLE
  /\bEXEC\b\s+/i,                   // EXEC sp_...
  /[=;*]\s*$/,                       // SQL operators at end (WHERE x = 1; or SELECT *)
];

/** Scalar SQL types that do not accept array values */
const SCALAR_SQL_TYPES = new Set([
  'nvarchar', 'varchar', 'char', 'nchar', 'text', 'ntext',
  'int', 'bigint', 'smallint', 'tinyint',
  'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney',
  'bit',
  'date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset', 'time',
  'uniqueidentifier',
  'string', 'number', 'boolean',
]);

const DEFAULT_SUGGESTION = {
  text: 'Use only valid properties for RunView/RunViews and RunQuery',
  example: `// ❌ WRONG - Invalid properties on RunView:
await utilities.rv.RunView({
  EntityName: 'MJ: AI Prompt Runs',
  Parameters: { startDate, endDate },  // INVALID!
  GroupBy: 'Status'                    // INVALID!
});

// ✅ CORRECT - Use ExtraFilter for WHERE clauses:
await utilities.rv.RunView({
  EntityName: 'MJ: AI Prompt Runs',
  ExtraFilter: \`RunAt >= '\${startDate.toISOString()}' AND RunAt <= '\${endDate.toISOString()}'\`,
  OrderBy: 'RunAt DESC',
  Fields: ['RunAt', 'Status', 'Success']
});

// ✅ For aggregations, use RunQuery with a pre-defined query:
await utilities.rq.RunQuery({
  QueryName: 'Prompt Run Summary',
  Parameters: { startDate, endDate }  // Parameters ARE valid for RunQuery
});

// Valid RunView properties:
// - EntityName (required)
// - ExtraFilter, OrderBy, Fields, MaxRows, StartRow, ResultType (optional)

// Valid RunQuery properties:
// - QueryName (required)
// - CategoryPath, CategoryID, Parameters (optional)`,
};

// ── Callee matching ──────────────────────────────────────────────────

function isRunQueryCallee(callee: t.Expression | t.V8IntrinsicIdentifier): boolean {
  return (
    t.isMemberExpression(callee) &&
    t.isMemberExpression(callee.object) &&
    t.isIdentifier(callee.object.object) &&
    callee.object.object.name === 'utilities' &&
    t.isIdentifier(callee.object.property) &&
    callee.object.property.name === 'rq' &&
    t.isIdentifier(callee.property) &&
    callee.property.name === 'RunQuery'
  );
}

// ── useState init collector ──────────────────────────────────────────

function collectUseStateInits(
  ast: t.File,
): Map<string, { category: string; description: string }> {
  const stateInits = new Map<string, { category: string; description: string }>();

  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      if (!t.isArrayPattern(path.node.id)) return;
      const init = path.node.init;
      if (!init || !t.isCallExpression(init) || !t.isIdentifier(init.callee) || init.callee.name !== 'useState') return;

      const firstEl = path.node.id.elements[0];
      if (!t.isIdentifier(firstEl)) return;

      if (init.arguments.length > 0) {
        const arg = init.arguments[0];
        const category = getLiteralCategory(arg);
        if (category && category !== 'null') {
          let description: string;
          if (t.isNumericLiteral(arg)) description = String(arg.value);
          else if (t.isStringLiteral(arg)) description = `"${arg.value}"`;
          else if (t.isBooleanLiteral(arg)) description = String(arg.value);
          else description = category;

          stateInits.set(firstEl.name, { category, description });
        }
      }
    },
    noScope: true,
  });

  return stateInits;
}

function getLiteralCategory(node: t.Expression | t.SpreadElement | t.JSXNamespacedName | t.ArgumentPlaceholder): string | null {
  if (t.isNumericLiteral(node)) return 'number';
  if (t.isStringLiteral(node)) return 'string';
  if (t.isBooleanLiteral(node)) return 'boolean';
  if (t.isNullLiteral(node)) return 'null';
  if (t.isTemplateLiteral(node)) return 'string';
  return null;
}

function expectedJsCategory(paramType: string | undefined): string | null {
  if (!paramType) return null;
  const lower = paramType.toLowerCase().replace(/\(.*\)/, '').trim();

  const numericTypes = new Set([
    'int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric',
    'float', 'real', 'money', 'smallmoney', 'number',
  ]);
  const stringTypes = new Set([
    'nvarchar', 'varchar', 'char', 'nchar', 'text', 'ntext',
    'uniqueidentifier', 'string',
  ]);
  const boolTypes = new Set(['bit', 'boolean']);

  if (numericTypes.has(lower)) return 'number';
  if (stringTypes.has(lower)) return 'string';
  if (boolTypes.has(lower)) return 'boolean';
  return null;
}

// ── Invalid-property message builder ─────────────────────────────────

function buildInvalidRunQueryPropertyMessage(propName: string): string {
  switch (propName) {
    case 'ExtraFilter':
      return `RunQuery does not support 'ExtraFilter'. WHERE clauses should be in the pre-defined query or passed as Parameters.`;
    case 'Fields':
      return `RunQuery does not support 'Fields'. The query definition determines returned fields.`;
    case 'OrderBy':
      return `RunQuery does not support 'OrderBy'. ORDER BY should be in the query definition.`;
    default:
      return `Invalid property '${propName}' on RunQuery. Valid properties: ${Array.from(VALID_RUNQUERY_PROPS).join(', ')}`;
  }
}

// ── Property type validation ─────────────────────────────────────────

function validateRunQueryPropertyType(
  propName: string,
  value: t.Expression | t.PatternLike,
  prop: t.ObjectProperty,
  violations: Violation[],
): void {
  if (propName === 'QueryID' || propName === 'QueryName' || propName === 'CategoryID' || propName === 'CategoryPath') {
    if (!isStringLike(value)) {
      const exampleMap: Record<string, string> = {
        QueryID: `"550e8400-e29b-41d4-a716-446655440000"`,
        QueryName: `"Sales by Region"`,
        CategoryID: `"123e4567-e89b-12d3-a456-426614174000"`,
        CategoryPath: `"/Reports/Sales/"`,
      };
      violations.push({
        rule: RULE_NAME,
        severity: 'critical',
        line: prop.loc?.start.line || 0,
        column: prop.loc?.start.column || 0,
        message: `RunQuery property '${propName}' must be a string. Example: ${propName}: ${exampleMap[propName] || '""'}`,
        code: `${propName}: ${value.type === 'ObjectExpression' ? '{...}' : value.type === 'ArrayExpression' ? '[...]' : '...'}`,
        suggestion: DEFAULT_SUGGESTION,
      });
    }
  } else if (propName === 'Parameters') {
    if (!isObjectLike(value)) {
      violations.push({
        rule: RULE_NAME,
        severity: 'critical',
        line: prop.loc?.start.line || 0,
        column: prop.loc?.start.column || 0,
        message: `RunQuery property 'Parameters' must be an object containing key-value pairs. Example: Parameters: { startDate: '2024-01-01', status: 'Active' }`,
        code: `Parameters: ${t.isArrayExpression(value) ? '[...]' : t.isStringLiteral(value) ? '"..."' : '...'}`,
        suggestion: DEFAULT_SUGGESTION,
      });
    }
  } else if (propName === 'MaxRows' || propName === 'StartRow') {
    if (!isNumberLike(value)) {
      violations.push({
        rule: RULE_NAME,
        severity: 'critical',
        line: prop.loc?.start.line || 0,
        column: prop.loc?.start.column || 0,
        message: `RunQuery property '${propName}' must be a number. Example: ${propName}: ${propName === 'MaxRows' ? '100' : '0'}`,
        code: `${propName}: ${value.type === 'StringLiteral' ? '"..."' : value.type === 'ObjectExpression' ? '{...}' : '...'}`,
        suggestion: DEFAULT_SUGGESTION,
      });
    }
  }
}

// ── SQL injection detection ──────────────────────────────────────────

function detectSQLInjection(
  value: t.Node,
  path: NodePath<t.CallExpression>,
  violations: Violation[],
  knownQueryNames?: Set<string>,
): void {
  if (t.isStringLiteral(value)) {
    const queryName = value.value;

    // Skip SQL check if the query name is a known registered query from the spec
    if (knownQueryNames?.has(queryName)) return;

    // Check for structural SQL patterns (require multiple keywords in combination
    // to avoid false positives on domain terms like "Join Year", "Revenue From Events")
    const looksLikeSQL = SQL_PATTERNS.some((pattern) => pattern.test(queryName));

    if (looksLikeSQL) {
      violations.push({
        rule: RULE_NAME,
        severity: 'critical',
        line: value.loc?.start.line || 0,
        column: value.loc?.start.column || 0,
        message: `RunQuery cannot accept SQL statements. QueryName must be a registered query name, not SQL: "${queryName.substring(0, 50)}..."`,
        code: value.value.substring(0, 100),
      });
    }
  } else if (t.isIdentifier(value) || t.isTemplateLiteral(value)) {
    violations.push({
      rule: RULE_NAME,
      severity: 'medium',
      line: value.loc?.start.line || 0,
      column: value.loc?.start.column || 0,
      message: `Dynamic QueryName detected. Ensure this is a query name, not a SQL statement.`,
      code: path.toString().substring(0, 100),
    });
  }
}

// ── Query existence validation ───────────────────────────────────────

function validateQueryExistence(
  queryName: string,
  componentSpec: ComponentSpec | undefined,
  path: NodePath<t.CallExpression>,
  violations: Violation[],
): void {
  if (!componentSpec?.dataRequirements?.queries) return;

  const queryExists = componentSpec.dataRequirements.queries.some((q) => q.name === queryName);
  if (!queryExists) {
    const availableQueries = componentSpec.dataRequirements.queries.map((q) => q.name).join(', ');
    violations.push({
      rule: RULE_NAME,
      severity: 'high',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `Query '${queryName}' not found in component spec. Available queries: ${availableQueries || 'none'}`,
      code: `QueryName: '${componentSpec.dataRequirements.queries[0]?.name || 'QueryNameFromSpec'}'`,
    });
  }
}

// ── CategoryPath validation ──────────────────────────────────────────

function validateCategoryPath(
  queryName: string,
  hasCategoryPath: boolean,
  queryNameProp: t.ObjectProperty | undefined,
  path: NodePath<t.CallExpression>,
  componentSpec: ComponentSpec | undefined,
  violations: Violation[],
): void {
  if (!componentSpec?.dataRequirements?.queries || hasCategoryPath) return;

  const specQuery = componentSpec.dataRequirements.queries.find((q) => q.name === queryName);
  if (!specQuery?.categoryPath || specQuery.categoryPath.trim().length === 0) return;

  const expectedCategoryPath = specQuery.categoryPath;
  violations.push({
    rule: RULE_NAME,
    severity: 'critical',
    line: queryNameProp?.loc?.start.line || path.node.loc?.start.line || 0,
    column: queryNameProp?.loc?.start.column || path.node.loc?.start.column || 0,
    message: `RunQuery with QueryName '${queryName}' is missing required CategoryPath parameter. Queries are uniquely identified by both QueryName and CategoryPath together. Without CategoryPath, RunQuery may find a different query with the same name, causing collisions and unintended behavior.`,
    code: `RunQuery({ QueryName: '${queryName}' })  // Missing: CategoryPath`,
    suggestion: {
      text: `Add CategoryPath property to uniquely identify the query. The CategoryPath should match what's defined in your dataRequirements.queries[].categoryPath`,
      example: `await utilities.rq.RunQuery({
  QueryName: '${queryName}',
  CategoryPath: '${expectedCategoryPath}',  // Required: ensures correct query is used
  Parameters: {
    // Your query parameters here
  }
})`,
    },
  });
}

// ── Parameters: array format ─────────────────────────────────────────

function validateParametersArray(
  paramValue: t.ArrayExpression,
  parametersNode: t.ObjectProperty,
  specQuery: ComponentQueryDataRequirement | undefined,
  violations: Violation[],
): void {
  const arrayElements = paramValue.elements.filter((e): e is t.ObjectExpression => t.isObjectExpression(e));

  const paramPairs: { name: string; value: string | number | boolean }[] = [];
  let isNameValueFormat = true;

  for (const elem of arrayElements) {
    let name: string | null = null;
    let value: string | number | boolean | null = null;

    for (const prop of elem.properties) {
      if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
        const propName = prop.key.name.toLowerCase();
        if (propName === 'name' || propName === 'fieldname') {
          if (t.isStringLiteral(prop.value)) name = prop.value.value;
          else if (t.isIdentifier(prop.value)) name = prop.value.name;
        } else if (propName === 'value') {
          if (t.isStringLiteral(prop.value)) value = `'${prop.value.value}'`;
          else if (t.isNumericLiteral(prop.value)) value = prop.value.value;
          else if (t.isBooleanLiteral(prop.value)) value = prop.value.value;
          else if (t.isIdentifier(prop.value)) value = prop.value.name;
          else value = '/* value */';
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

  let fixMessage: string;
  let fixCode: string;

  if (isNameValueFormat && paramPairs.length > 0) {
    const objProps = paramPairs.map((p) => `  ${p.name}: ${p.value}`).join(',\n');
    fixCode = `Parameters: {\n${objProps}\n}`;

    if (specQuery?.parameters) {
      const specParamNames = specQuery.parameters.map((p) => p.name);
      const providedNames = paramPairs.map((p) => p.name);
      const missing = specParamNames.filter((n) => !providedNames.includes(n));
      const extra = providedNames.filter((n) => !specParamNames.includes(n));

      if (missing.length > 0 || extra.length > 0) {
        fixMessage = `RunQuery Parameters must be object, not array. `;
        if (missing.length > 0) fixMessage += `Missing required: ${missing.join(', ')}. `;
        if (extra.length > 0) fixMessage += `Unknown params: ${extra.join(', ')}. `;
        fixMessage += `Expected params from spec: ${specParamNames.join(', ')}`;
      } else {
        fixMessage = `RunQuery Parameters must be object with key-value pairs, not array. Auto-fix: convert [{Name,Value}] to object format`;
      }
    } else {
      fixMessage = `RunQuery Parameters must be object with key-value pairs, not array of {Name/Value} objects`;
    }
  } else {
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
    rule: RULE_NAME,
    severity: 'critical',
    line: parametersNode.loc?.start.line || 0,
    column: parametersNode.loc?.start.column || 0,
    message: fixMessage,
    code: fixCode,
  });
}

// ── Parameters: object format (spec validation) ──────────────────────

function validateParametersObject(
  paramValue: t.ObjectExpression,
  parametersNode: t.ObjectProperty,
  queryName: string,
  specQuery: ComponentQueryDataRequirement,
  violations: Violation[],
): void {
  if (!specQuery.parameters) return;

  const providedParamsMap = new Map<string, string>();
  for (const prop of paramValue.properties) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      providedParamsMap.set(prop.key.name.toLowerCase(), prop.key.name);
    }
  }

  const requiredParams = specQuery.parameters.filter((p) => {
    return p.isRequired === true || p.value === '@runtime';
  });

  const specParamNames = specQuery.parameters.map((p) => p.name);
  const specParamNamesLower = specParamNames.map((n) => n.toLowerCase());

  const missing = requiredParams
    .map((p) => p.name)
    .filter((n) => !providedParamsMap.has(n.toLowerCase()));

  const extra = Array.from(providedParamsMap.values()).filter(
    (providedName) => !specParamNamesLower.includes(providedName.toLowerCase()),
  );

  if (missing.length > 0 || extra.length > 0) {
    let message = `Query '${queryName}' parameter mismatch. `;
    if (missing.length > 0) message += `Missing: ${missing.join(', ')}. `;
    if (extra.length > 0) message += `Unknown: ${extra.join(', ')}. `;

    const correctParams = specQuery.parameters
      .map((p) => {
        const providedName = providedParamsMap.get(p.name.toLowerCase());
        if (providedName) {
          const existingProp = paramValue.properties.find(
            (prop) => t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name.toLowerCase() === p.name.toLowerCase(),
          ) as t.ObjectProperty | undefined;

          if (existingProp && t.isStringLiteral(existingProp.value)) return `  ${p.name}: '${existingProp.value.value}'`;
          if (existingProp && t.isNumericLiteral(existingProp.value)) return `  ${p.name}: ${existingProp.value.value}`;
          if (existingProp && t.isIdentifier(existingProp.value)) return `  ${p.name}: ${existingProp.value.name}`;
        }
        return `  ${p.name}: '${p.testValue || 'value'}'`;
      })
      .join(',\n');

    violations.push({
      rule: RULE_NAME,
      severity: 'high',
      line: parametersNode.loc?.start.line || 0,
      column: parametersNode.loc?.start.column || 0,
      message: message + `Expected: {${specParamNames.join(', ')}}`,
      code: `Parameters: {\n${correctParams}\n}`,
    });
  }
}

// ── Parameters: variable reference (TypeContext) ─────────────────────

function validateParametersVariable(
  paramValue: t.Identifier,
  parametersNode: t.ObjectProperty,
  queryName: string,
  specQuery: ComponentQueryDataRequirement,
  typeContext: TypeContext | undefined,
  violations: Violation[],
): void {
  if (!typeContext || !specQuery.parameters) return;

  const varType = typeContext.getVariableType(paramValue.name);
  if (varType?.type !== 'object' || !varType.fields) return;

  const providedParamsLower = new Map<string, string>();
  for (const [fieldName] of varType.fields) {
    providedParamsLower.set(fieldName.toLowerCase(), fieldName);
  }

  const specParamNames = specQuery.parameters.map((p) => p.name);
  const specParamNamesLower = specParamNames.map((n) => n.toLowerCase());

  const extra = Array.from(providedParamsLower.values()).filter(
    (name) => !specParamNamesLower.includes(name.toLowerCase()),
  );

  if (extra.length > 0) {
    violations.push({
      rule: RULE_NAME,
      severity: 'high',
      line: parametersNode.loc?.start.line || 0,
      column: parametersNode.loc?.start.column || 0,
      message: `Query '${queryName}' has unknown parameters: ${extra.join(', ')}. Expected: {${specParamNames.join(', ')}}`,
      code: `Parameters: ${paramValue.name}`,
    });
  }
}

// ── Parameters: other invalid type ───────────────────────────────────

function validateParametersOtherType(
  parametersNode: t.ObjectProperty,
  specQuery: ComponentQueryDataRequirement | undefined,
  violations: Violation[],
): void {
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
    rule: RULE_NAME,
    severity: 'critical',
    line: parametersNode.loc?.start.line || 0,
    column: parametersNode.loc?.start.column || 0,
    message,
    code: fixCode,
  });
}

// ── Parameter value type validation ──────────────────────────────────

function validateParameterValueTypes(
  parametersNode: t.ObjectExpression,
  queryName: string,
  componentSpec: ComponentSpec,
  violations: Violation[],
): void {
  const querySpec = componentSpec.dataRequirements?.queries?.find((q) => q.name === queryName);
  if (!querySpec?.parameters) return;

  // Build type map
  const paramTypes = new Map<string, { type: string; sqlType: string }>();
  for (const param of querySpec.parameters) {
    const extParam = param as { name: string; type?: string };
    if (extParam.type) {
      paramTypes.set(param.name.toLowerCase(), {
        type: mapSQLTypeToJSType(extParam.type),
        sqlType: extParam.type,
      });
    }
  }
  if (paramTypes.size === 0) return;

  for (const prop of parametersNode.properties) {
    if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;

    const paramName = prop.key.name;
    const paramTypeInfo = paramTypes.get(paramName.toLowerCase());
    if (!paramTypeInfo) continue;

    const expectedType = paramTypeInfo.type;
    let actualType: string | null = null;
    let valueDesc = '';

    if (t.isStringLiteral(prop.value)) { actualType = 'string'; valueDesc = `'${prop.value.value}'`; }
    else if (t.isNumericLiteral(prop.value)) { actualType = 'number'; valueDesc = String(prop.value.value); }
    else if (t.isBooleanLiteral(prop.value)) { actualType = 'boolean'; valueDesc = String(prop.value.value); }
    else if (t.isNullLiteral(prop.value)) { actualType = 'null'; valueDesc = 'null'; }
    else if (t.isIdentifier(prop.value)) { continue; } // Variable - skip
    else if (t.isTemplateLiteral(prop.value)) { actualType = 'string'; valueDesc = 'template string'; }
    else { continue; } // Complex expression - skip

    if (actualType && actualType !== expectedType) {
      if (actualType === 'null') continue; // Allow null for nullable params

      let suggestion = '';
      if (expectedType === 'number' && actualType === 'string') {
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
        rule: RULE_NAME,
        severity: 'high',
        line: prop.loc?.start.line || 0,
        column: prop.loc?.start.column || 0,
        message: `Parameter "${paramName}" has wrong type. Expected ${expectedType} (${paramTypeInfo.sqlType}), got ${actualType} (${valueDesc}).${suggestion ? ' ' + suggestion : ''}`,
        code: suggestion || `${paramName}: <${expectedType} value>`,
      });
    }
  }
}

// ── Null/array/useState per-param checks ─────────────────────────────

function validateIndividualParamValues(
  parametersNode: t.ObjectExpression,
  queryName: string,
  componentSpec: ComponentSpec,
  stateInits: Map<string, { category: string; description: string }>,
  violations: Violation[],
): void {
  const querySpec = componentSpec.dataRequirements?.queries?.find((q) => q.name === queryName);
  if (!querySpec?.parameters) return;

  const specParamMap = new Map<string, ComponentQueryParameterValue>();
  for (const p of querySpec.parameters) {
    specParamMap.set(p.name.toLowerCase(), p);
  }

  for (const prop of parametersNode.properties) {
    if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;

    const paramName = prop.key.name;
    const specParam = specParamMap.get(paramName.toLowerCase());
    if (!specParam) continue;

    const value = prop.value;
    const isRequired = specParam.isRequired || specParam.value === '@runtime';

    // Check: null literal on required parameter
    if (t.isNullLiteral(value) && isRequired) {
      violations.push({
        rule: RULE_NAME,
        severity: 'high',
        line: prop.loc?.start.line ?? 0,
        column: prop.loc?.start.column ?? 0,
        message: `Required query parameter "${paramName}" is set to null. This will cause the query to fail or return unexpected results.`,
        code: `${paramName}: null`,
        suggestion: {
          text: `Provide a valid value for "${paramName}" or add a null guard before calling RunQuery`,
          example: `${paramName}: ${specParam.testValue ? `'${specParam.testValue}'` : "'value'"}`,
        },
      });
      continue;
    }

    // Check: array expression for scalar parameter
    if (t.isArrayExpression(value)) {
      const paramType = specParam.type?.toLowerCase().replace(/\(.*\)/, '').trim();
      if (!paramType || SCALAR_SQL_TYPES.has(paramType)) {
        violations.push({
          rule: RULE_NAME,
          severity: 'high',
          line: prop.loc?.start.line ?? 0,
          column: prop.loc?.start.column ?? 0,
          message: `Query parameter "${paramName}" expects a scalar value (type: ${specParam.type ?? 'scalar'}) but received an array. Pass a single value instead.`,
          code: `${paramName}: [...]`,
          suggestion: {
            text: `Pass a single value instead of an array`,
            example: `${paramName}: ${specParam.testValue ? `'${specParam.testValue}'` : "'value'"}`,
          },
        });
      }
      continue;
    }

    // Check: useState variable with mismatched init type
    if (t.isIdentifier(value)) {
      const stateInfo = stateInits.get(value.name);
      if (!stateInfo) continue;

      const expectedCategory = expectedJsCategory(specParam.type);
      if (!expectedCategory) continue;

      if (stateInfo.category !== expectedCategory) {
        violations.push({
          rule: RULE_NAME,
          severity: 'high',
          line: prop.loc?.start.line ?? 0,
          column: prop.loc?.start.column ?? 0,
          message: `Query parameter "${paramName}" expects type "${specParam.type}" (${expectedCategory}) but state variable "${value.name}" is initialized as ${stateInfo.category} (${stateInfo.description}). This type mismatch may cause the query to fail.`,
          code: `${paramName}: ${value.name}`,
          suggestion: {
            text: `Initialize the state variable with a ${expectedCategory} value, or convert before passing`,
            example: expectedCategory === 'number'
              ? `useState(0)`
              : expectedCategory === 'string'
                ? `useState('')`
                : `useState(false)`,
          },
        });
      }
    }
  }
}

// ── Missing required Parameters property ─────────────────────────────

function validateMissingParametersProperty(
  queryName: string,
  specQuery: ComponentQueryDataRequirement | undefined,
  path: NodePath<t.CallExpression>,
  violations: Violation[],
): void {
  if (!specQuery?.parameters || specQuery.parameters.length === 0) return;

  const requiredParams = specQuery.parameters.filter((p) => {
    return p.isRequired === true || p.value === '@runtime';
  });

  if (requiredParams.length > 0) {
    const paramNames = requiredParams.map((p) => p.name).join(', ');
    const exampleParams = requiredParams.map((p) => `  ${p.name}: ${p.testValue ? `'${p.testValue}'` : "'value'"}`).join(',\n');

    violations.push({
      rule: RULE_NAME,
      severity: 'high',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `Query '${queryName}' requires parameters but RunQuery call is missing 'Parameters' property. Required: ${paramNames}`,
      code: `Parameters: {\n${exampleParams}\n}`,
    });
  }
}

// ── Main Rule ────────────────────────────────────────────────────────

@RegisterClass(BaseLintRule, 'runquery-call-validation')
export class RunQueryCallValidationRule extends BaseLintRule {
  get Name() { return 'runquery-call-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec, _options?: unknown, typeContext?: TypeContext): Violation[] {
    const violations: Violation[] = [];

    // Pre-collect useState initializers for type checking
    const stateInits = collectUseStateInits(ast);

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        if (!isRunQueryCallee(path.node.callee)) return;

        // A. Argument structure checks
        if (!path.node.arguments[0]) {
          violations.push({
            rule: RULE_NAME,
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
            suggestion: DEFAULT_SUGGESTION,
          });
          return;
        }

        if (t.isIdentifier(path.node.arguments[0])) return; // Variable — skip

        if (!t.isObjectExpression(path.node.arguments[0])) {
          const argType = t.isStringLiteral(path.node.arguments[0]) ? 'string' : 'non-object';
          violations.push({
            rule: RULE_NAME,
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
            suggestion: DEFAULT_SUGGESTION,
          });
          return;
        }

        const config = path.node.arguments[0];

        // B. Extract properties and validate
        let hasQueryID = false;
        let hasQueryName = false;
        let hasCategoryPath = false;
        let queryName: string | null = null;
        let parametersNode: t.ObjectProperty | null = null;
        let queryNameProp: t.ObjectProperty | undefined;
        const foundProps: string[] = [];

        for (const prop of config.properties) {
          if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;

          const propName = prop.key.name;
          foundProps.push(propName);

          if (propName === 'QueryID') hasQueryID = true;
          if (propName === 'QueryName') {
            hasQueryName = true;
            queryNameProp = prop;
            if (t.isStringLiteral(prop.value)) queryName = prop.value.value;
          }
          if (propName === 'CategoryPath') hasCategoryPath = true;
          if (propName === 'Parameters') parametersNode = prop;

          // Check invalid property names
          if (!VALID_RUNQUERY_PROPS.has(propName)) {
            violations.push({
              rule: RULE_NAME,
              severity: 'critical',
              line: prop.loc?.start.line || 0,
              column: prop.loc?.start.column || 0,
              message: buildInvalidRunQueryPropertyMessage(propName),
              code: `${propName}: ...`,
              suggestion: DEFAULT_SUGGESTION,
            });
          } else {
            // Validate property types
            validateRunQueryPropertyType(propName, prop.value, prop, violations);
          }
        }

        // Must have QueryID or QueryName
        if (!hasQueryID && !hasQueryName) {
          const propsContext = foundProps.length > 0 ? ` Found properties: ${foundProps.join(', ')}.` : '';
          const message = hasCategoryPath
            ? `RunQuery requires QueryName (or QueryID). CategoryPath alone is insufficient - it's only used to help filter when QueryName is ambiguous.${propsContext}`
            : `RunQuery requires either QueryID or QueryName property to identify which query to run.${propsContext}`;

          const exampleQueryName = componentSpec?.dataRequirements?.queries?.[0]?.name || 'YourQueryName';
          violations.push({
            rule: RULE_NAME,
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

        // CategoryPath without QueryName — specific anti-pattern
        if (!hasQueryID && !hasQueryName && hasCategoryPath) {
          const exampleQueryName = componentSpec?.dataRequirements?.queries?.[0]?.name || 'YourQueryName';
          const categoryPathProp = config.properties.find((p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'CategoryPath') as
            | t.ObjectProperty
            | undefined;

          violations.push({
            rule: RULE_NAME,
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

        // C. Query existence + SQL injection detection
        const knownQueryNames = new Set<string>(
          componentSpec?.dataRequirements?.queries?.map(q => q.name).filter(Boolean) ?? []
        );
        if (queryName) {
          validateQueryExistence(queryName, componentSpec, path, violations);
          if (queryNameProp) {
            detectSQLInjection(queryNameProp.value, path, violations, knownQueryNames);
          }
        } else if (hasQueryName && queryNameProp) {
          // Dynamic query name — still check for SQL injection
          detectSQLInjection(queryNameProp.value, path, violations, knownQueryNames);
        }

        // D. CategoryPath missing when spec requires it
        if (queryName) {
          validateCategoryPath(queryName, hasCategoryPath, queryNameProp, path, componentSpec, violations);
        }

        // E. Parameters validation
        if (!parametersNode) {
          // Check if missing Parameters is a problem
          if (queryName) {
            const specQuery = componentSpec?.dataRequirements?.queries?.find((q) => q.name === queryName);
            validateMissingParametersProperty(queryName, specQuery, path, violations);
          }
          return;
        }

        const paramValue = parametersNode.value;
        const specQuery = queryName
          ? componentSpec?.dataRequirements?.queries?.find((q) => q.name === queryName)
          : undefined;

        if (t.isArrayExpression(paramValue)) {
          validateParametersArray(paramValue, parametersNode, specQuery, violations);
        } else if (t.isObjectExpression(paramValue)) {
          // Validate param names against spec
          if (specQuery) {
            validateParametersObject(paramValue, parametersNode, queryName!, specQuery, violations);
          }
          // Validate parameter value types
          if (queryName && componentSpec) {
            validateParameterValueTypes(paramValue, queryName, componentSpec, violations);
            validateIndividualParamValues(paramValue, queryName, componentSpec, stateInits, violations);
          }
        } else if (t.isIdentifier(paramValue)) {
          if (specQuery && queryName) {
            validateParametersVariable(paramValue, parametersNode, queryName, specQuery, typeContext, violations);
          }
        } else {
          // Other invalid type
          validateParametersOtherType(parametersNode, specQuery, violations);
        }
      },
    });

    return violations;
  }
}
