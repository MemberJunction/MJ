import { traverse, NodePath, isNullOrUndefined, isStringLike, isNumberLike, isArrayLike } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: runview-call-validation
 *
 * Consolidates all RunView/RunViews CALL SITE validation into a single traversal.
 * Absorbs checks from:
 * - runview-runquery-valid-properties (RunView/RunViews portions)
 * - runview-entity-validation (all)
 *
 * Checks:
 * 1. Missing first parameter
 * 2. RunViews: argument must be array (not single object)
 * 3. RunView: argument must be object (allow Identifier — skip validation for variables)
 * 4. Missing required EntityName property
 * 5. Invalid property names with specific messages
 * 6. Invalid property types (EntityName must be string, ExtraFilter string, Fields array, MaxRows number, etc.)
 * 7. EntityName not found in componentSpec.dataRequirements.entities (medium severity)
 *
 * Severity: critical/medium
 * Applies to: all components
 */

/** Valid properties for RunView/RunViews */
const VALID_RUNVIEW_PROPS = new Set([
  'EntityName', 'ExtraFilter', 'OrderBy', 'Fields', 'MaxRows', 'StartRow', 'ResultType',
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

// ── Helpers for invalid-property messages ────────────────────────────

function buildInvalidPropertyMessage(methodName: string, propName: string): { message: string; fix: string } {
  const defaultMessage = `Invalid property '${propName}' on ${methodName}. Valid properties: ${Array.from(VALID_RUNVIEW_PROPS).join(', ')}`;
  const defaultFix = `Remove '${propName}' property`;

  switch (propName) {
    case 'Parameters':
      return {
        message: `${methodName} does not support 'Parameters'. Use 'ExtraFilter' for WHERE clauses.`,
        fix: `Replace 'Parameters' with 'ExtraFilter' and format as SQL WHERE clause`,
      };
    case 'ViewID':
    case 'ViewName':
      return {
        message: `${methodName} property '${propName}' is not allowed in components. Use 'EntityName' instead.`,
        fix: `Replace '${propName}' with 'EntityName' and specify the entity name`,
      };
    case 'UserSearchString':
      return {
        message: `${methodName} property 'UserSearchString' is not allowed in components. Use 'ExtraFilter' for filtering.`,
        fix: `Remove 'UserSearchString' and use 'ExtraFilter' with appropriate WHERE clause`,
      };
    case 'ForceAuditLog':
    case 'AuditLogDescription':
      return {
        message: `${methodName} property '${propName}' is not allowed in components.`,
        fix: `Remove '${propName}' property`,
      };
    case 'GroupBy':
      return {
        message: `${methodName} does not support 'GroupBy'. Use RunQuery with a pre-defined query for aggregations.`,
        fix: `Remove 'GroupBy' and use RunQuery instead for aggregated data`,
      };
    case 'Having':
      return {
        message: `${methodName} does not support 'Having'. Use RunQuery with a pre-defined query.`,
        fix: `Remove 'Having' and use RunQuery instead`,
      };
    default:
      return { message: defaultMessage, fix: defaultFix };
  }
}

// ── Property type validation ─────────────────────────────────────────

function validatePropertyType(
  methodName: string,
  propName: string,
  value: t.Expression | t.PatternLike,
  prop: t.ObjectProperty,
  violations: Violation[],
): void {
  if (propName === 'ExtraFilter' || propName === 'OrderBy' || propName === 'EntityName') {
    const allowNullUndefined = propName === 'ExtraFilter' || propName === 'OrderBy';
    if (!isStringLike(value) && !(allowNullUndefined && isNullOrUndefined(value))) {
      const exampleMap: Record<string, string> = {
        ExtraFilter: `"Status = 'Active' AND Type = 'Customer'"`,
        OrderBy: `"CreatedAt DESC"`,
        EntityName: `"Products"`,
      };
      violations.push({
        rule: 'runview-call-validation',
        severity: 'critical',
        line: prop.loc?.start.line || 0,
        column: prop.loc?.start.column || 0,
        message: `${methodName} property '${propName}' must be a string, not ${t.isObjectExpression(value) ? 'an object' : t.isArrayExpression(value) ? 'an array' : 'a non-string value'}. Example: ${propName}: ${exampleMap[propName] || '""'}`,
        code: `${propName}: ${value.type === 'ObjectExpression' ? '{...}' : value.type === 'ArrayExpression' ? '[...]' : '...'}`,
        suggestion: DEFAULT_SUGGESTION,
      });
    }
  } else if (propName === 'Fields') {
    if (!isArrayLike(value) && !isStringLike(value)) {
      violations.push({
        rule: 'runview-call-validation',
        severity: 'critical',
        line: prop.loc?.start.line || 0,
        column: prop.loc?.start.column || 0,
        message: `${methodName} property 'Fields' must be an array of field names or a comma-separated string. Example: Fields: ['ID', 'Name', 'Status'] or Fields: 'ID, Name, Status'`,
        code: `Fields: ${value.type === 'ObjectExpression' ? '{...}' : '...'}`,
        suggestion: DEFAULT_SUGGESTION,
      });
    }
  } else if (propName === 'MaxRows' || propName === 'StartRow') {
    if (!isNumberLike(value)) {
      violations.push({
        rule: 'runview-call-validation',
        severity: 'critical',
        line: prop.loc?.start.line || 0,
        column: prop.loc?.start.column || 0,
        message: `${methodName} property '${propName}' must be a number. Example: ${propName}: ${propName === 'MaxRows' ? '100' : '0'}`,
        code: `${propName}: ${value.type === 'StringLiteral' ? '"..."' : value.type === 'ObjectExpression' ? '{...}' : '...'}`,
        suggestion: DEFAULT_SUGGESTION,
      });
    }
  }
}

// ── Entity spec validation ───────────────────────────────────────────

function validateEntityAgainstSpec(
  config: t.ObjectExpression,
  componentSpec: ComponentSpec | undefined,
  violations: Violation[],
): void {
  if (!componentSpec?.dataRequirements?.entities) return;

  const specEntityNames = componentSpec.dataRequirements.entities.map((e) => e.name);
  if (specEntityNames.length === 0) return;

  let entityName: string | null = null;
  for (const prop of config.properties) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'EntityName' && t.isStringLiteral(prop.value)) {
      entityName = prop.value.value;
      break;
    }
  }

  if (entityName && !specEntityNames.includes(entityName)) {
    violations.push({
      rule: 'runview-call-validation',
      severity: 'medium',
      line: config.loc?.start.line || 0,
      column: config.loc?.start.column || 0,
      message: `Entity '${entityName}' not in component spec. Available entities: ${specEntityNames.join(', ')}`,
      code: `EntityName: '${specEntityNames[0] || 'EntityFromSpec'}'`,
    });
  }
}

// ── Single config validation ─────────────────────────────────────────

function validateRunViewConfig(
  config: t.ObjectExpression,
  methodName: string,
  componentSpec: ComponentSpec | undefined,
  violations: Violation[],
): void {
  let hasEntityName = false;

  for (const prop of config.properties) {
    if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;

    const propName = prop.key.name;
    if (propName === 'EntityName') hasEntityName = true;

    if (!VALID_RUNVIEW_PROPS.has(propName)) {
      const { message } = buildInvalidPropertyMessage(methodName, propName);
      violations.push({
        rule: 'runview-call-validation',
        severity: 'critical',
        line: prop.loc?.start.line || 0,
        column: prop.loc?.start.column || 0,
        message,
        code: `${propName}: ...`,
        suggestion: DEFAULT_SUGGESTION,
      });
    } else {
      validatePropertyType(methodName, propName, prop.value, prop, violations);
    }
  }

  if (!hasEntityName) {
    violations.push({
      rule: 'runview-call-validation',
      severity: 'critical',
      line: config.loc?.start.line || 0,
      column: config.loc?.start.column || 0,
      message: `${methodName} requires 'EntityName' property. Add EntityName to identify what data to retrieve.`,
      code: `${methodName}({ ... })`,
      suggestion: DEFAULT_SUGGESTION,
    });
  }

  validateEntityAgainstSpec(config, componentSpec, violations);
}

// ── Main Rule ────────────────────────────────────────────────────────

@RegisterClass(BaseLintRule, 'runview-call-validation')
export class RunViewCallValidationRule extends BaseLintRule {
  get Name() { return 'runview-call-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        if (
          !t.isMemberExpression(callee) ||
          !t.isMemberExpression(callee.object) ||
          !t.isIdentifier(callee.object.object) ||
          callee.object.object.name !== 'utilities' ||
          !t.isIdentifier(callee.object.property) ||
          callee.object.property.name !== 'rv' ||
          !t.isIdentifier(callee.property)
        ) {
          return;
        }

        const methodName = callee.property.name;
        if (methodName !== 'RunView' && methodName !== 'RunViews') return;

        // Check 1: Missing first parameter
        if (!path.node.arguments[0]) {
          violations.push({
            rule: 'runview-call-validation',
            severity: 'critical',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            message: `${methodName} requires a ${methodName === 'RunViews' ? 'array of RunViewParams objects' : 'RunViewParams object'} as the first parameter.`,
            code: `${methodName}()`,
            suggestion: DEFAULT_SUGGESTION,
          });
          return;
        }

        let configs: t.ObjectExpression[] = [];

        if (methodName === 'RunViews') {
          // Check 2: RunViews must receive an array
          if (t.isArrayExpression(path.node.arguments[0])) {
            configs = path.node.arguments[0].elements.filter((e): e is t.ObjectExpression => t.isObjectExpression(e));
          } else {
            violations.push({
              rule: 'runview-call-validation',
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
              suggestion: DEFAULT_SUGGESTION,
            });
            return;
          }
        } else {
          // Check 3: RunView must receive an object (allow Identifier for variables)
          if (t.isObjectExpression(path.node.arguments[0])) {
            configs = [path.node.arguments[0]];
          } else if (t.isIdentifier(path.node.arguments[0])) {
            // Variable reference — can't statically validate, skip
            return;
          } else {
            const argType = t.isStringLiteral(path.node.arguments[0])
              ? 'string'
              : t.isArrayExpression(path.node.arguments[0])
                ? 'array'
                : 'non-object';
            violations.push({
              rule: 'runview-call-validation',
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
              suggestion: DEFAULT_SUGGESTION,
            });
            return;
          }
        }

        // Validate each config object
        for (const config of configs) {
          validateRunViewConfig(config, methodName, componentSpec, violations);
        }
      },
    });

    return violations;
  }
}
