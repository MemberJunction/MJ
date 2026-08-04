import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: search-call-validation
 *
 * Validates `utilities.search.Search()` and `utilities.search.PreviewSearch()` call arguments.
 *
 * Search() checks:
 * 1. First argument must be an object (or Identifier — skip validation for variables)
 * 2. Required property: `Query` (string) — flag if missing
 * 3. Valid properties: Query, MaxResults, MinScore, Filters — flag unknown properties
 * 4. Property types: Query=string, MaxResults=number, MinScore=number (0-1), Filters=object
 * 5. Filters sub-properties: EntityNames, SourceTypes, Tags — all must be arrays
 * 6. SourceTypes valid values: 'Vector', 'FullText', 'Entity', 'Storage'
 *
 * PreviewSearch() checks:
 * 1. First argument must be string (the query)
 * 2. Second argument if present must be number (maxResults)
 *
 * Severity: critical for missing Query, high for invalid properties/types
 * Applies to: all components
 */

const RULE_NAME = 'search-call-validation';

const VALID_SEARCH_PROPS = new Set(['Query', 'MaxResults', 'MinScore', 'Filters']);
const VALID_FILTER_PROPS = new Set(['EntityNames', 'SourceTypes', 'Tags']);
const VALID_SOURCE_TYPES = new Set(['Vector', 'FullText', 'Entity', 'Storage']);

/**
 * Checks if a call expression targets utilities.search.Search or utilities.search.PreviewSearch.
 * Returns the method name if matched, null otherwise.
 * Handles both direct and optional-chaining patterns.
 */
function getSearchMethodName(callee: t.Node): string | null {
  // Direct: utilities.search.Search(...)
  if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
    const methodName = callee.property.name;
    if (methodName !== 'Search' && methodName !== 'PreviewSearch') return null;

    const obj = callee.object;
    // utilities.search.Method
    if (
      t.isMemberExpression(obj) &&
      t.isIdentifier(obj.object) && obj.object.name === 'utilities' &&
      t.isIdentifier(obj.property) && obj.property.name === 'search'
    ) return methodName;

    // utilities.search?.Method (optional on search)
    if (
      t.isOptionalMemberExpression(obj) &&
      t.isIdentifier(obj.object) && obj.object.name === 'utilities' &&
      t.isIdentifier(obj.property) && obj.property.name === 'search'
    ) return methodName;
  }

  // Optional call: utilities.search?.Search?.(...) or utilities.search.Search?.(...)
  if (t.isOptionalMemberExpression(callee) && t.isIdentifier(callee.property)) {
    const methodName = callee.property.name;
    if (methodName !== 'Search' && methodName !== 'PreviewSearch') return null;

    const obj = callee.object;
    if (
      t.isMemberExpression(obj) &&
      t.isIdentifier(obj.object) && obj.object.name === 'utilities' &&
      t.isIdentifier(obj.property) && obj.property.name === 'search'
    ) return methodName;

    if (
      t.isOptionalMemberExpression(obj) &&
      t.isIdentifier(obj.object) && obj.object.name === 'utilities' &&
      t.isIdentifier(obj.property) && obj.property.name === 'search'
    ) return methodName;
  }

  return null;
}

// ── Search() argument validation ─────────────────────────────────────

function validateSearchArgs(
  args: Array<t.Expression | t.SpreadElement | t.ArgumentPlaceholder>,
  line: number,
  column: number,
  violations: Violation[],
): void {
  if (args.length === 0) {
    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line, column,
      message: 'Search() requires an options object argument with at least a "Query" property.',
      code: 'utilities.search.Search()',
    });
    return;
  }

  const firstArg = args[0];

  // If it's a variable reference, skip validation (can't statically analyze)
  if (t.isIdentifier(firstArg)) return;

  if (!t.isObjectExpression(firstArg)) {
    violations.push({
      rule: RULE_NAME,
      severity: 'high',
      line: firstArg.loc?.start.line ?? line,
      column: firstArg.loc?.start.column ?? column,
      message: 'Search() argument must be an object with at least a "Query" property.',
      code: 'utilities.search.Search(...)',
    });
    return;
  }

  validateSearchOptionsObject(firstArg, violations);
}

function validateSearchOptionsObject(obj: t.ObjectExpression, violations: Violation[]): void {
  const propNames = new Set<string>();

  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;
    propNames.add(prop.key.name);
  }

  // Check required Query property
  if (!propNames.has('Query')) {
    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line: obj.loc?.start.line ?? 0,
      column: obj.loc?.start.column ?? 0,
      message: 'Search() options missing required "Query" property. The query string is required for search.',
      code: 'Search({ ... })',
    });
  }

  // Check for invalid properties and validate types
  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;

    const name = prop.key.name;
    const value = prop.value;
    const propLine = prop.loc?.start.line ?? 0;
    const propCol = prop.loc?.start.column ?? 0;

    if (!VALID_SEARCH_PROPS.has(name)) {
      violations.push({
        rule: RULE_NAME,
        severity: 'high',
        line: propLine,
        column: propCol,
        message: `Unknown property "${name}" in Search() options. Valid properties: ${[...VALID_SEARCH_PROPS].join(', ')}`,
        code: name,
      });
      continue;
    }

    validateSearchPropertyType(name, value, propLine, propCol, violations);
  }
}

function validateSearchPropertyType(
  name: string,
  value: t.Node,
  line: number,
  column: number,
  violations: Violation[],
): void {
  // Skip validation for identifiers/expressions — can't statically determine type
  if (t.isIdentifier(value) || t.isCallExpression(value) || t.isMemberExpression(value) ||
      t.isTemplateLiteral(value) || t.isConditionalExpression(value)) return;

  switch (name) {
    case 'Query':
      if (!t.isStringLiteral(value) && !t.isTemplateLiteral(value)) {
        // Only flag clearly wrong types (numbers, booleans, objects, arrays)
        if (t.isNumericLiteral(value) || t.isBooleanLiteral(value) ||
            t.isObjectExpression(value) || t.isArrayExpression(value)) {
          violations.push({
            rule: RULE_NAME, severity: 'high', line, column,
            message: 'Search() "Query" property must be a string.',
            code: `Query: ${t.isNumericLiteral(value) ? String(value.value) : '...'}`,
          });
        }
      }
      break;

    case 'MaxResults':
      if (!t.isNumericLiteral(value)) {
        if (t.isStringLiteral(value) || t.isBooleanLiteral(value)) {
          violations.push({
            rule: RULE_NAME, severity: 'high', line, column,
            message: 'Search() "MaxResults" property must be a number.',
            code: `MaxResults: ${t.isStringLiteral(value) ? `"${value.value}"` : '...'}`,
          });
        }
      }
      break;

    case 'MinScore':
      if (t.isNumericLiteral(value)) {
        if (value.value < 0 || value.value > 1) {
          violations.push({
            rule: RULE_NAME, severity: 'high', line, column,
            message: `Search() "MinScore" must be between 0 and 1, got ${value.value}.`,
            code: `MinScore: ${value.value}`,
          });
        }
      } else if (t.isStringLiteral(value) || t.isBooleanLiteral(value)) {
        violations.push({
          rule: RULE_NAME, severity: 'high', line, column,
          message: 'Search() "MinScore" property must be a number between 0 and 1.',
          code: `MinScore: ${t.isStringLiteral(value) ? `"${value.value}"` : '...'}`,
        });
      }
      break;

    case 'Filters':
      if (t.isObjectExpression(value)) {
        validateFiltersObject(value, violations);
      } else if (t.isStringLiteral(value) || t.isNumericLiteral(value) || t.isBooleanLiteral(value) || t.isArrayExpression(value)) {
        violations.push({
          rule: RULE_NAME, severity: 'high', line, column,
          message: 'Search() "Filters" property must be an object with optional EntityNames, SourceTypes, and Tags arrays.',
          code: 'Filters: ...',
        });
      }
      break;
  }
}

function validateFiltersObject(obj: t.ObjectExpression, violations: Violation[]): void {
  for (const prop of obj.properties) {
    if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;

    const name = prop.key.name;
    const value = prop.value;
    const propLine = prop.loc?.start.line ?? 0;
    const propCol = prop.loc?.start.column ?? 0;

    if (!VALID_FILTER_PROPS.has(name)) {
      violations.push({
        rule: RULE_NAME,
        severity: 'high',
        line: propLine,
        column: propCol,
        message: `Unknown property "${name}" in Search() Filters. Valid properties: ${[...VALID_FILTER_PROPS].join(', ')}`,
        code: name,
      });
      continue;
    }

    // All filter properties should be arrays (skip identifiers)
    if (t.isIdentifier(value) || t.isCallExpression(value) || t.isMemberExpression(value)) continue;

    if (!t.isArrayExpression(value)) {
      violations.push({
        rule: RULE_NAME,
        severity: 'high',
        line: propLine,
        column: propCol,
        message: `Search() Filters.${name} must be an array.`,
        code: `${name}: ...`,
      });
      continue;
    }

    // Validate SourceTypes values
    if (name === 'SourceTypes') {
      validateSourceTypeValues(value, violations);
    }
  }
}

function validateSourceTypeValues(arr: t.ArrayExpression, violations: Violation[]): void {
  for (const elem of arr.elements) {
    if (!t.isStringLiteral(elem)) continue;
    if (!VALID_SOURCE_TYPES.has(elem.value)) {
      violations.push({
        rule: RULE_NAME,
        severity: 'high',
        line: elem.loc?.start.line ?? 0,
        column: elem.loc?.start.column ?? 0,
        message: `Invalid SourceType "${elem.value}". Valid values: ${[...VALID_SOURCE_TYPES].join(', ')}`,
        code: `"${elem.value}"`,
      });
    }
  }
}

// ── PreviewSearch() argument validation ──────────────────────────────

function validatePreviewSearchArgs(
  args: Array<t.Expression | t.SpreadElement | t.ArgumentPlaceholder>,
  line: number,
  column: number,
  violations: Violation[],
): void {
  if (args.length === 0) {
    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line, column,
      message: 'PreviewSearch() requires at least a query string argument.',
      code: 'utilities.search.PreviewSearch()',
    });
    return;
  }

  const firstArg = args[0];

  // Skip identifiers — can't statically validate variable types
  if (!t.isIdentifier(firstArg) && !t.isStringLiteral(firstArg) && !t.isTemplateLiteral(firstArg)) {
    if (t.isNumericLiteral(firstArg) || t.isBooleanLiteral(firstArg) ||
        t.isObjectExpression(firstArg) || t.isArrayExpression(firstArg)) {
      violations.push({
        rule: RULE_NAME,
        severity: 'high',
        line: firstArg.loc?.start.line ?? line,
        column: firstArg.loc?.start.column ?? column,
        message: 'PreviewSearch() first argument must be a query string.',
        code: 'PreviewSearch(...)',
      });
    }
  }

  // Validate second argument if present
  if (args.length >= 2) {
    const secondArg = args[1];
    if (!t.isIdentifier(secondArg) && !t.isNumericLiteral(secondArg)) {
      if (t.isStringLiteral(secondArg) || t.isBooleanLiteral(secondArg) ||
          t.isObjectExpression(secondArg) || t.isArrayExpression(secondArg)) {
        violations.push({
          rule: RULE_NAME,
          severity: 'high',
          line: secondArg.loc?.start.line ?? line,
          column: secondArg.loc?.start.column ?? column,
          message: 'PreviewSearch() second argument (maxResults) must be a number.',
          code: 'PreviewSearch(query, ...)',
        });
      }
    }
  }
}

// ── Main Rule ────────────────────────────────────────────────────────

@RegisterClass(BaseLintRule, 'search-call-validation')
export class SearchCallValidationRule extends BaseLintRule {
  get Name() { return 'search-call-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File): Violation[] {
    const violations: Violation[] = [];

    const visitCall = (path: NodePath<t.CallExpression | t.OptionalCallExpression>) => {
      const methodName = getSearchMethodName(path.node.callee);
      if (!methodName) return;

      const line = path.node.loc?.start.line ?? 0;
      const column = path.node.loc?.start.column ?? 0;

      if (methodName === 'Search') {
        validateSearchArgs(path.node.arguments, line, column, violations);
      } else if (methodName === 'PreviewSearch') {
        validatePreviewSearchArgs(path.node.arguments, line, column, violations);
      }
    };

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) { visitCall(path); },
      OptionalCallExpression(path: NodePath<t.OptionalCallExpression>) { visitCall(path); },
    });

    return violations;
  }
}
