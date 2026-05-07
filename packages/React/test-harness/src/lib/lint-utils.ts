/**
 * Shared utility functions and constants for component linter rules.
 *
 * All commonly-used patterns are consolidated here to avoid duplication
 * across rule files. Rules should import from this module rather than
 * reimplementing these helpers.
 */

import _traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import * as parser from '@babel/parser';
import { Violation } from './component-linter';

// ═══════════════════════════════════════════════════════════════════════════
// Babel Traverse Wrapper
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Babel traverse, with the CJS default-export unwrap that Node ESM requires.
 * Import this instead of duplicating the 3-line unwrap in every rule file.
 *
 * @example
 * ```typescript
 * import { traverse } from '../lint-utils';
 * traverse(ast, { CallExpression(path) { ... } });
 * ```
 */
type TraverseModule = typeof _traverse & { default?: typeof _traverse };
export const traverse = (((_traverse as TraverseModule).default) ?? _traverse) as typeof _traverse;

/** Re-export NodePath for convenience so rules don't need a separate @babel/traverse import */
export type { NodePath };

// ═══════════════════════════════════════════════════════════════════════════
// Violation Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates a violation object with consistent structure.
 */
export function createViolation(
  rule: string,
  severity: 'critical' | 'high' | 'medium' | 'low',
  node: t.Node | null | undefined,
  message: string,
  code?: string,
  suggestion?: { text: string; example?: string }
): Violation {
  return {
    rule,
    severity,
    line: node?.loc?.start.line || 0,
    column: node?.loc?.start.column || 0,
    message,
    code,
    suggestion,
  };
}

/**
 * Truncates code to a maximum length for display in violations.
 */
export function truncateCode(code: string, maxLength: number = 100): string {
  if (code.length <= maxLength) return code;
  return code.substring(0, maxLength) + '...';
}

// ═══════════════════════════════════════════════════════════════════════════
// String Similarity
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Levenshtein distance between two strings (case-insensitive).
 */
export function levenshteinDistance(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  const m = al.length;
  const n = bl.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = al[i - 1] === bl[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Find the closest matching string from a list of candidates using Levenshtein distance.
 * Returns null if no match is within the maximum allowed distance.
 */
export function findClosestMatch(target: string, candidates: string[] | Set<string>, maxDistance?: number): string | null {
  let bestMatch: string | null = null;
  let bestDistance = Infinity;
  const max = maxDistance ?? Math.max(3, Math.floor(target.length * 0.5));

  for (const candidate of candidates) {
    const dist = levenshteinDistance(target, candidate);
    if (dist < bestDistance && dist > 0 && dist <= max) {
      bestDistance = dist;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Find a case-insensitive match that differs only in casing.
 */
export function findCaseMismatch(target: string, candidates: string[] | Set<string>): string | null {
  for (const candidate of candidates) {
    if (candidate.toLowerCase() === target.toLowerCase() && candidate !== target) {
      return candidate;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// AST Type Checking Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Checks if a node is null or undefined literal */
export function isNullOrUndefined(node: t.Node): boolean {
  return t.isNullLiteral(node) || (t.isIdentifier(node) && node.name === 'undefined');
}

/** Checks if a node is likely a string value (literal, template, identifier, call, etc.) */
export function isStringLike(node: t.Node, depth: number = 0): boolean {
  if (depth > 3) return false;
  if (t.isConditionalExpression(node)) {
    const consequentOk = isStringLike(node.consequent, depth + 1) || isNullOrUndefined(node.consequent);
    const alternateOk = isStringLike(node.alternate, depth + 1) || isNullOrUndefined(node.alternate);
    return consequentOk && alternateOk;
  }
  if (t.isObjectExpression(node) || t.isArrayExpression(node)) return false;
  return (
    t.isStringLiteral(node) ||
    t.isTemplateLiteral(node) ||
    t.isBinaryExpression(node) ||
    t.isIdentifier(node) ||
    t.isCallExpression(node) ||
    t.isMemberExpression(node)
  );
}

/** Checks if a node is likely a number value */
export function isNumberLike(node: t.Node): boolean {
  return (
    t.isNumericLiteral(node) ||
    t.isBinaryExpression(node) ||
    t.isUnaryExpression(node) ||
    t.isConditionalExpression(node) ||
    t.isIdentifier(node) ||
    t.isCallExpression(node) ||
    t.isMemberExpression(node)
  );
}

/** Checks if a node is likely an array value */
export function isArrayLike(node: t.Node): boolean {
  return (
    t.isArrayExpression(node) ||
    t.isIdentifier(node) ||
    t.isCallExpression(node) ||
    t.isMemberExpression(node) ||
    t.isConditionalExpression(node)
  );
}

/** Checks if a node is likely an object value (not array) */
export function isObjectLike(node: t.Node): boolean {
  if (t.isArrayExpression(node)) return false;
  return (
    t.isObjectExpression(node) ||
    t.isIdentifier(node) ||
    t.isCallExpression(node) ||
    t.isMemberExpression(node) ||
    t.isConditionalExpression(node) ||
    t.isSpreadElement(node)
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Object Property Extraction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract a string literal value from an ObjectExpression property by key name.
 * Returns null if the property doesn't exist or its value isn't a string literal.
 *
 * @example
 * ```typescript
 * // For: { QueryName: 'My Query', MaxRows: 100 }
 * getStringProperty(objectExpr, 'QueryName') // → 'My Query'
 * getStringProperty(objectExpr, 'MaxRows')   // → null (not a string)
 * ```
 */
export function getStringProperty(objectExpr: t.ObjectExpression, propName: string): string | null {
  for (const prop of objectExpr.properties) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) &&
        prop.key.name === propName && t.isStringLiteral(prop.value)) {
      return prop.value.value;
    }
  }
  return null;
}

/**
 * Get the AST node for a specific property value in an ObjectExpression.
 * Returns the ObjectProperty if found, null otherwise.
 */
export function getObjectProperty(objectExpr: t.ObjectExpression, propName: string): t.ObjectProperty | null {
  for (const prop of objectExpr.properties) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === propName) {
      return prop;
    }
  }
  return null;
}

/**
 * Get all property names from an ObjectExpression.
 */
export function getPropertyNames(objectExpr: t.ObjectExpression): string[] {
  return objectExpr.properties
    .filter((prop): prop is t.ObjectProperty => t.isObjectProperty(prop) && t.isIdentifier(prop.key))
    .map((prop) => (prop.key as t.Identifier).name);
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility Method Call Detection
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a CallExpression callee matches the pattern `utilities.<service>.<method>`.
 * Returns the service and method names if matched, null otherwise.
 *
 * @example
 * ```typescript
 * // For: utilities.rv.RunView(...)
 * getUtilitiesCallInfo(callee) // → { service: 'rv', method: 'RunView' }
 *
 * // For: utilities.rq.RunQuery(...)
 * getUtilitiesCallInfo(callee) // → { service: 'rq', method: 'RunQuery' }
 *
 * // For: utilities.search?.Search(...)
 * getUtilitiesCallInfo(callee) // → { service: 'search', method: 'Search' }
 * ```
 */
export function getUtilitiesCallInfo(callee: t.Node): { service: string; method: string } | null {
  // Standard: utilities.rv.RunView(...)
  if (t.isMemberExpression(callee) &&
      t.isMemberExpression(callee.object) &&
      t.isIdentifier(callee.object.object) &&
      callee.object.object.name === 'utilities' &&
      t.isIdentifier(callee.object.property) &&
      t.isIdentifier(callee.property)) {
    return { service: callee.object.property.name, method: callee.property.name };
  }

  // Optional chaining: utilities.search?.Search(...)
  if (t.isMemberExpression(callee) &&
      t.isOptionalMemberExpression(callee.object) &&
      t.isIdentifier((callee.object as t.OptionalMemberExpression).object) &&
      ((callee.object as t.OptionalMemberExpression).object as t.Identifier).name === 'utilities' &&
      t.isIdentifier((callee.object as t.OptionalMemberExpression).property) &&
      t.isIdentifier(callee.property)) {
    return {
      service: ((callee.object as t.OptionalMemberExpression).property as t.Identifier).name,
      method: (callee.property as t.Identifier).name,
    };
  }

  return null;
}

/** Check if a CallExpression callee is `utilities.rv.RunView` or `utilities.rv.RunViews` */
export function isRunViewCall(callee: t.Node): boolean {
  const info = getUtilitiesCallInfo(callee);
  return info !== null && info.service === 'rv' && (info.method === 'RunView' || info.method === 'RunViews');
}

/** Check if a CallExpression callee is `utilities.rq.RunQuery` */
export function isRunQueryCall(callee: t.Node): boolean {
  const info = getUtilitiesCallInfo(callee);
  return info !== null && info.service === 'rq' && info.method === 'RunQuery';
}

/** Check if a CallExpression callee is `utilities.search.Search` or `PreviewSearch` */
export function isSearchCall(callee: t.Node): boolean {
  const info = getUtilitiesCallInfo(callee);
  return info !== null && info.service === 'search' && (info.method === 'Search' || info.method === 'PreviewSearch');
}

// ═══════════════════════════════════════════════════════════════════════════
// Child Component Code Analysis
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parse component code and extract QueryName values from RunQuery calls.
 * Uses full AST analysis to avoid false positives from comments or string literals.
 */
export function extractRunQueryNamesFromCode(code: string): Set<string> {
  const queryNames = new Set<string>();
  try {
    const ast = parser.parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        if (isRunQueryCall(path.node.callee)) {
          const arg = path.node.arguments[0];
          if (t.isObjectExpression(arg)) {
            const queryName = getStringProperty(arg, 'QueryName');
            if (queryName) queryNames.add(queryName);
          }
        }
      },
    });
  } catch {
    // If parsing fails, return empty set
  }
  return queryNames;
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Standard array iteration method names */
export const ARRAY_METHODS = new Set([
  'map', 'filter', 'forEach', 'reduce', 'find', 'some', 'every',
  'sort', 'concat', 'flatMap', 'flat', 'slice', 'reverse',
]);

/** Functions that expect array arguments */
export const ARRAY_EXPECTING_FUNCS = new Set([
  'map', 'filter', 'forEach', 'reduce', 'sort', 'concat',
  'processChartData', 'processData', 'transformData',
  'setData', 'setItems', 'setResults', 'setRows',
]);

/** Functions that coerce values to numbers */
export const NUMERIC_COERCION_FUNCTIONS = new Set(['parseInt', 'parseFloat', 'Number']);

/**
 * Common DOM/React/JS properties that should never be validated as entity fields.
 * Used to prevent false positives when scope resolution picks up a variable name
 * collision (e.g., `e` used as both a .map() callback param and an onChange event param).
 */
export const NON_ENTITY_PROPERTIES = new Set([
  // DOM event properties
  'target', 'currentTarget', 'preventDefault', 'stopPropagation', 'nativeEvent',
  'type', 'bubbles', 'cancelable', 'defaultPrevented', 'eventPhase', 'isTrusted',
  // DOM element properties
  'value', 'checked', 'selectedIndex', 'innerHTML', 'textContent', 'className',
  'style', 'classList', 'dataset', 'children', 'parentNode', 'parentElement',
  'offsetWidth', 'offsetHeight', 'scrollTop', 'scrollLeft', 'clientWidth', 'clientHeight',
  // React/JS common
  'current', 'then', 'catch', 'finally', 'prototype', 'constructor', 'length',
  'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every', 'includes',
  'push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'concat', 'join',
  'keys', 'values', 'entries', 'toString', 'valueOf', 'hasOwnProperty',
]);

// ═══════════════════════════════════════════════════════════════════════════
// JSX Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** Extracts the name of a JSX element (handles member expressions like Antd.Button) */
export function getJSXElementName(node: t.JSXOpeningElement): string | null {
  if (t.isJSXIdentifier(node.name)) {
    return node.name.name;
  } else if (t.isJSXMemberExpression(node.name)) {
    const parts: string[] = [];
    let current: t.JSXMemberExpression | t.JSXIdentifier = node.name;
    while (t.isJSXMemberExpression(current)) {
      if (t.isJSXIdentifier(current.property)) parts.unshift(current.property.name);
      current = current.object;
    }
    if (t.isJSXIdentifier(current)) parts.unshift(current.name);
    return parts.join('.');
  }
  return null;
}

/** Checks if a JSX element has a specific attribute */
export function hasJSXAttribute(element: t.JSXOpeningElement, attributeName: string): boolean {
  return element.attributes.some(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === attributeName
  );
}

/** Gets a JSX attribute by name */
export function getJSXAttribute(element: t.JSXOpeningElement, attributeName: string): t.JSXAttribute | null {
  const attr = element.attributes.find(
    (a) => t.isJSXAttribute(a) && t.isJSXIdentifier(a.name) && a.name.name === attributeName
  );
  return t.isJSXAttribute(attr) ? attr : null;
}

/** Checks if a function parameter is destructuring props */
export function isPropsDestructuring(param: t.LVal): boolean {
  return t.isObjectPattern(param);
}

/** Extracts property names from an object pattern (destructuring) */
export function extractDestructuredProps(pattern: t.ObjectPattern): string[] {
  return pattern.properties
    .filter((prop): prop is t.ObjectProperty => t.isObjectProperty(prop))
    .filter((prop) => t.isIdentifier(prop.key))
    .map((prop) => (prop.key as t.Identifier).name);
}

/** Checks if a node is at the top level of the program */
export function isTopLevel(path: { getFunctionParent: () => unknown; scope: { path: { type: string } } }): boolean {
  return path.getFunctionParent() === null || path.scope.path.type === 'Program';
}
