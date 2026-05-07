import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { TypeContext, mapSQLTypeToJSType } from '../type-context';

/**
 * Rule: chart-field-validation
 *
 * Validates that chart component props reference fields that exist in the data source.
 * Checks valueField, groupByField/groupBy, and seriesField against available fields
 * from entity metadata or query fieldMetadata in the spec. Also validates that
 * aggregate functions (average, sum) are only applied to numeric fields.
 *
 * Severity: high
 * Applies to: all components
 */

/** Chart-related prop names that reference data fields */
const CHART_FIELD_PROPS = new Set(['valueField', 'groupByField', 'groupBy', 'seriesField']);

/** Props that specify aggregate functions */
const AGGREGATE_PROP = 'aggregateFunction';

/** Aggregate functions that require numeric fields */
const NUMERIC_AGGREGATES = new Set(['sum', 'average', 'avg', 'min', 'max', 'median', 'standardDeviation']);

/** SQL types that map to numeric JavaScript types */
const NUMERIC_SQL_TYPES = new Set([
  'int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric',
  'float', 'real', 'money', 'smallmoney',
]);

/** Chart component name patterns */
const CHART_COMPONENT_NAMES = new Set(['SimpleChart', 'MultiSeriesChart']);

/**
 * Checks if a JSX element name matches a chart component.
 * Matches known chart names and dependency components with chart-related props.
 */
function isChartComponent(
  elementName: string,
  hasChartProps: boolean,
): boolean {
  if (CHART_COMPONENT_NAMES.has(elementName)) return true;
  // If the element has chart field props, treat it as a chart component
  return hasChartProps;
}

/**
 * Collects available field names and their SQL types from the component spec's data requirements.
 * Merges entity fieldMetadata and query fields into a unified map.
 */
function collectAvailableFields(
  typeContext: TypeContext,
  componentSpec: { dataRequirements?: { entities?: { name: string; fieldMetadata?: { name: string; type: string }[] }[]; queries?: { name: string; categoryPath: string; fields?: { name: string; type: string }[] }[] } },
): Map<string, string> {
  const fieldMap = new Map<string, string>(); // fieldName -> sqlType

  // Collect from entities
  if (componentSpec.dataRequirements?.entities) {
    for (const entity of componentSpec.dataRequirements.entities) {
      const entityFields = typeContext.getEntityFieldTypesSync(entity.name);
      for (const [fieldName, fieldInfo] of entityFields) {
        fieldMap.set(fieldName, fieldInfo.sqlType ?? 'nvarchar');
      }
      // Also use fieldMetadata directly from the spec (lightweight info)
      if (entity.fieldMetadata) {
        for (const fm of entity.fieldMetadata) {
          if (!fieldMap.has(fm.name)) {
            fieldMap.set(fm.name, fm.type);
          }
        }
      }
    }
  }

  // Collect from queries
  if (componentSpec.dataRequirements?.queries) {
    for (const query of componentSpec.dataRequirements.queries) {
      const queryFields = typeContext.getQueryFieldTypes(query.name, query.categoryPath);
      if (queryFields) {
        for (const [fieldName, fieldInfo] of queryFields) {
          if (!fieldMap.has(fieldName)) {
            fieldMap.set(fieldName, fieldInfo.sqlType ?? 'nvarchar');
          }
        }
      }
      // Also use fields directly from the query spec
      if (query.fields) {
        for (const f of query.fields) {
          if (!fieldMap.has(f.name)) {
            fieldMap.set(f.name, f.type);
          }
        }
      }
    }
  }

  return fieldMap;
}

/**
 * Checks whether a SQL type is numeric.
 */
function isNumericSqlType(sqlType: string): boolean {
  const normalized = sqlType.toLowerCase().replace(/\(.*\)/, '').trim();
  if (NUMERIC_SQL_TYPES.has(normalized)) return true;
  return mapSQLTypeToJSType(normalized) === 'number';
}

/**
 * Extracts JSX attribute props from a JSXOpeningElement and returns them as a map.
 */
function extractJsxProps(
  openingElement: t.JSXOpeningElement,
): Map<string, t.JSXAttribute> {
  const props = new Map<string, t.JSXAttribute>();
  for (const attr of openingElement.attributes) {
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
      props.set(attr.name.name, attr);
    }
  }
  return props;
}

/**
 * Extracts a string literal value from a JSX attribute value node.
 * Returns null if the value is not a string literal.
 */
function getStringLiteralFromAttr(attr: t.JSXAttribute): string | null {
  if (t.isStringLiteral(attr.value)) {
    return attr.value.value;
  }
  // Handle JSXExpressionContainer wrapping a string literal
  if (
    t.isJSXExpressionContainer(attr.value) &&
    t.isStringLiteral(attr.value.expression)
  ) {
    return attr.value.expression.value;
  }
  return null;
}

/**
 * Validates that chart field props (valueField, groupBy, seriesField) reference
 * fields that exist in the available data source fields.
 */
function validateChartFieldProps(
  props: Map<string, t.JSXAttribute>,
  availableFields: Map<string, string>,
  violations: Violation[],
): void {
  for (const propName of CHART_FIELD_PROPS) {
    const attr = props.get(propName);
    if (!attr) continue;

    const fieldValue = getStringLiteralFromAttr(attr);
    if (!fieldValue) continue;

    if (!availableFields.has(fieldValue)) {
      const available = Array.from(availableFields.keys()).slice(0, 10);
      const moreText = availableFields.size > 10
        ? ` and ${availableFields.size - 10} more`
        : '';

      violations.push({
        rule: 'chart-field-validation',
        severity: 'high',
        line: attr.loc?.start.line ?? 0,
        column: attr.loc?.start.column ?? 0,
        message: `Chart prop "${propName}" references field "${fieldValue}" which does not exist in the data source. Available fields: ${available.join(', ')}${moreText}`,
        code: `${propName}="${fieldValue}"`,
        suggestion: {
          text: `Use one of the available fields: ${available.join(', ')}${moreText}`,
        },
      });
    }
  }
}

/**
 * Validates that aggregate functions (sum, average, etc.) are only applied
 * to numeric valueField references.
 */
function validateAggregateFunction(
  props: Map<string, t.JSXAttribute>,
  availableFields: Map<string, string>,
  violations: Violation[],
): void {
  const aggregateAttr = props.get(AGGREGATE_PROP);
  if (!aggregateAttr) return;

  const aggregateValue = getStringLiteralFromAttr(aggregateAttr);
  if (!aggregateValue) return;

  if (!NUMERIC_AGGREGATES.has(aggregateValue.toLowerCase())) return;

  // Check if valueField references a non-numeric field
  const valueFieldAttr = props.get('valueField');
  if (!valueFieldAttr) return;

  const valueFieldName = getStringLiteralFromAttr(valueFieldAttr);
  if (!valueFieldName) return;

  const sqlType = availableFields.get(valueFieldName);
  if (!sqlType) return; // Field doesn't exist - already caught by field validation

  if (!isNumericSqlType(sqlType)) {
    violations.push({
      rule: 'chart-field-validation',
      severity: 'high',
      line: aggregateAttr.loc?.start.line ?? 0,
      column: aggregateAttr.loc?.start.column ?? 0,
      message: `Aggregate function "${aggregateValue}" requires a numeric field, but valueField "${valueFieldName}" has type "${sqlType}" which is not numeric`,
      code: `aggregateFunction="${aggregateValue}" valueField="${valueFieldName}"`,
      suggestion: {
        text: `Use a numeric field for "${aggregateValue}" aggregation, or use "count" which works on all field types`,
      },
    });
  }
}

@RegisterClass(BaseLintRule, 'chart-field-validation')
export class ChartFieldValidationRule extends BaseLintRule {
  get Name() { return 'chart-field-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    if (!componentSpec?.dataRequirements) {
      return violations;
    }

    const typeContext = new TypeContext(componentSpec);
    const availableFields = collectAvailableFields(typeContext, componentSpec);

    // If no fields found in the spec, skip validation
    if (availableFields.size === 0) {
      return violations;
    }

    // Check if the component contains data transformations (.map, .reduce, .flatMap)
    // that could create computed fields not in the original metadata.
    // If so, skip chart field validation since we can't statically determine field names.
    let hasDataTransformations = false;
    traverse(ast, {
      CallExpression(p: NodePath<t.CallExpression>) {
        if (t.isMemberExpression(p.node.callee) && t.isIdentifier(p.node.callee.property)) {
          const method = p.node.callee.property.name;
          if (['map', 'flatMap', 'reduce'].includes(method)) {
            hasDataTransformations = true;
            p.stop();
          }
        }
      },
      noScope: true,
    } as Parameters<typeof traverse>[1]);
    if (hasDataTransformations) {
      return violations;
    }

    traverse(ast, {
      JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
        const nameNode = path.node.name;
        if (!t.isJSXIdentifier(nameNode)) return;

        const props = extractJsxProps(path.node);
        const hasChartProps = Array.from(props.keys()).some(
          (p) => CHART_FIELD_PROPS.has(p) || p === AGGREGATE_PROP,
        );

        if (!isChartComponent(nameNode.name, hasChartProps)) return;

        // Check if the data prop comes from a transformation (.map, .reduce, etc.)
        // If so, the fields may differ from raw metadata — skip validation
        const dataAttr = props.get('data');
        if (dataAttr) {
          const dataValue = t.isJSXExpressionContainer(dataAttr.value) ? dataAttr.value.expression : null;
          if (dataValue && t.isIdentifier(dataValue)) {
            const binding = path.scope.getBinding(dataValue.name);
            if (binding && t.isVariableDeclarator(binding.path.node)) {
              const init = binding.path.node.init;
              // Check if initialized from a .map(), .filter(), .reduce(), etc.
              if (init && t.isCallExpression(init) && t.isMemberExpression(init.callee) && t.isIdentifier(init.callee.property)) {
                const method = init.callee.property.name;
                if (['map', 'flatMap', 'reduce'].includes(method)) {
                  return; // Data is transformed — can't validate fields statically
                }
              }
            }
          }
        }

        // Validate each chart field prop
        validateChartFieldProps(props, availableFields, violations);

        // Validate aggregate function on numeric fields
        validateAggregateFunction(props, availableFields, violations);
      },
    });

    return violations;
  }
}
