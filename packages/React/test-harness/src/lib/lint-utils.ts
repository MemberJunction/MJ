import * as t from '@babel/types';
import { Violation } from './component-linter';

/**
 * Shared utility functions for lint rules.
 * These helpers are commonly used across multiple rules.
 */

/**
 * Creates a violation object with consistent structure.
 *
 * @param rule - Name of the rule that generated the violation
 * @param severity - Severity level of the violation
 * @param node - AST node where the violation occurred
 * @param message - Human-readable message describing the violation
 * @param code - Optional code snippet showing the problematic code
 * @param suggestion - Optional suggestion for fixing the violation
 * @returns A properly formatted Violation object
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
 * Extracts the name of a JSX element.
 * Handles both simple identifiers and member expressions (e.g., Antd.Button).
 *
 * @param node - JSX opening element node
 * @returns The element name as a string, or null if it cannot be determined
 */
export function getJSXElementName(node: t.JSXOpeningElement): string | null {
  if (t.isJSXIdentifier(node.name)) {
    return node.name.name;
  } else if (t.isJSXMemberExpression(node.name)) {
    // Handle expressions like Antd.Button
    const parts: string[] = [];
    let current: t.JSXMemberExpression | t.JSXIdentifier = node.name;

    while (t.isJSXMemberExpression(current)) {
      if (t.isJSXIdentifier(current.property)) {
        parts.unshift(current.property.name);
      }
      current = current.object;
    }

    if (t.isJSXIdentifier(current)) {
      parts.unshift(current.name);
    }

    return parts.join('.');
  }
  return null;
}

/**
 * Checks if a JSX element has a specific attribute.
 *
 * @param element - JSX opening element to check
 * @param attributeName - Name of the attribute to look for
 * @returns true if the attribute exists, false otherwise
 */
export function hasJSXAttribute(element: t.JSXOpeningElement, attributeName: string): boolean {
  return element.attributes.some(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === attributeName
  );
}

/**
 * Gets the value of a JSX attribute.
 *
 * @param element - JSX opening element to check
 * @param attributeName - Name of the attribute
 * @returns The attribute node if found, null otherwise
 */
export function getJSXAttribute(element: t.JSXOpeningElement, attributeName: string): t.JSXAttribute | null {
  const attr = element.attributes.find(
    (attr) => t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name) && attr.name.name === attributeName
  );
  return t.isJSXAttribute(attr) ? attr : null;
}

/**
 * Checks if a function parameter is destructuring props.
 *
 * @param param - Function parameter to check
 * @returns true if the parameter is destructuring an object
 */
export function isPropsDestructuring(param: t.LVal): boolean {
  return t.isObjectPattern(param);
}

/**
 * Extracts property names from an object pattern (destructuring).
 *
 * @param pattern - Object pattern to analyze
 * @returns Array of property names being destructured
 */
export function extractDestructuredProps(pattern: t.ObjectPattern): string[] {
  return pattern.properties
    .filter((prop): prop is t.ObjectProperty => t.isObjectProperty(prop))
    .filter((prop) => t.isIdentifier(prop.key))
    .map((prop) => (prop.key as t.Identifier).name);
}

/**
 * Checks if a node is at the top level of the program (not nested in a function).
 *
 * @param path - AST traversal path
 * @returns true if the node is at the top level
 */
export function isTopLevel(path: { getFunctionParent: () => unknown; scope: { path: { type: string } } }): boolean {
  return path.getFunctionParent() === null || path.scope.path.type === 'Program';
}

/**
 * Truncates code to a maximum length for display in violations.
 *
 * @param code - Code string to truncate
 * @param maxLength - Maximum length (default: 100)
 * @returns Truncated code string
 */
export function truncateCode(code: string, maxLength: number = 100): string {
  if (code.length <= maxLength) {
    return code;
  }
  return code.substring(0, maxLength) + '...';
}
