import { traverse, NodePath, createViolation, truncateCode } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: overflow-hidden-on-layout-container
 *
 * Detects `overflow: 'hidden'` on layout containers that also have `flex: 1`,
 * `height: '100%'`, or `height: '100vh'`. This combination creates an invisible
 * clipping boundary that blocks scrolling for child content (DataGrid, tables,
 * lists, etc.).
 *
 * The Angular host (`mj-react-component`) already delegates scrolling to its
 * parent container which uses `overflow: auto`. Adding `overflow: hidden` on the
 * React component's root or content wrapper silently clips all descendant
 * scrollbars.
 *
 * Does NOT flag:
 * - Small/fixed-size containers (e.g., `width: '200px'` with overflow hidden)
 * - Text truncation (overflow hidden + textOverflow ellipsis)
 * - Containers without flex/full-height layout indicators
 *
 * Severity: medium — the component renders but scrollable content is unreachable.
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'overflow-hidden-on-layout-container')
export class OverflowHiddenOnLayoutContainerRule extends BaseLintRule {
  get Name() { return 'overflow-hidden-on-layout-container'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      ObjectExpression(path: NodePath<t.ObjectExpression>) {
        if (!isInlineStyleObject(path)) {
          return;
        }

        const props = extractStyleProperties(path.node);
        if (!props) {
          return;
        }

        if (!hasOverflowHidden(props)) {
          return;
        }

        // Text truncation pattern — intentional, not a layout bug
        if (hasTextTruncation(props)) {
          return;
        }

        // Only flag if this looks like a layout container
        if (!isLayoutContainer(props)) {
          return;
        }

        violations.push(createViolation(
          'overflow-hidden-on-layout-container',
          'medium',
          path.node,
          `Component "${componentName}" uses overflow: 'hidden' on a layout container ` +
          `(with ${describeLayoutIndicator(props)}). This creates an invisible clipping ` +
          `boundary that blocks scrolling for child content like DataGrid, tables, and ` +
          `lists. The Angular host already manages scrolling via overflow: auto.`,
          truncateCode(formatStyleSnippet(props), 100),
          {
            text: `Use overflow: 'auto' to allow child scrolling, or remove the overflow property entirely.`,
            example:
              `// Before (blocks scrolling):\n` +
              `style={{ flex: 1, overflow: 'hidden' }}\n\n` +
              `// After (allows child scrolling):\n` +
              `style={{ flex: 1, overflow: 'auto' }}\n` +
              `// or simply:\n` +
              `style={{ flex: 1 }}`,
          },
        ));
      },
    });

    return violations;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface StyleProps {
  overflow: string | null;
  overflowX: string | null;
  overflowY: string | null;
  textOverflow: string | null;
  flex: string | number | null;
  height: string | null;
  node: t.ObjectExpression;
}

/**
 * Determines if this ObjectExpression is a JSX inline style object.
 * Matches both `style={{ ... }}` and `style={someVar}` where someVar
 * is assigned an object literal.
 */
function isInlineStyleObject(path: NodePath<t.ObjectExpression>): boolean {
  const parent = path.parent;

  // Direct: style={{ ... }}
  if (t.isJSXExpressionContainer(parent)) {
    const grandparent = path.parentPath?.parent;
    if (t.isJSXAttribute(grandparent) &&
        t.isJSXIdentifier(grandparent.name) &&
        grandparent.name.name === 'style') {
      return true;
    }
  }

  // Variable: const styles = { ... }  used as style={styles}
  // We also catch nested objects within style objects (e.g., containerStyle)
  if (t.isVariableDeclarator(parent)) {
    const id = parent.id;
    if (t.isIdentifier(id) && isStyleVariableName(id.name)) {
      return true;
    }
  }

  // Property in a styles object: { container: { overflow: 'hidden', flex: 1 } }
  if (t.isObjectProperty(parent) && t.isIdentifier(parent.key)) {
    const propName = parent.key.name.toLowerCase();
    if (propName.includes('style') || propName.includes('container') ||
        propName.includes('wrapper') || propName.includes('root') ||
        propName.includes('layout') || propName.includes('content')) {
      return true;
    }
  }

  return false;
}

function isStyleVariableName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes('style') || lower.includes('container') ||
         lower.includes('wrapper') || lower.includes('root') ||
         lower.includes('layout');
}

/**
 * Extracts known style properties from an ObjectExpression as simple values.
 */
function extractStyleProperties(node: t.ObjectExpression): StyleProps | null {
  const result: StyleProps = {
    overflow: null,
    overflowX: null,
    overflowY: null,
    textOverflow: null,
    flex: null,
    height: null,
    node,
  };

  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) {
      continue;
    }
    const key = prop.key.name;
    const val = prop.value;

    switch (key) {
      case 'overflow':
        result.overflow = extractStringOrNumberValue(val);
        break;
      case 'overflowX':
        result.overflowX = extractStringValue(val);
        break;
      case 'overflowY':
        result.overflowY = extractStringValue(val);
        break;
      case 'textOverflow':
        result.textOverflow = extractStringValue(val);
        break;
      case 'flex':
        result.flex = extractFlexValue(val);
        break;
      case 'height':
        result.height = extractStringOrNumberValue(val);
        break;
    }
  }

  return result;
}

function extractStringValue(node: t.Node): string | null {
  if (t.isStringLiteral(node)) return node.value;
  return null;
}

function extractStringOrNumberValue(node: t.Node): string | null {
  if (t.isStringLiteral(node)) return node.value;
  if (t.isNumericLiteral(node)) return String(node.value);
  return null;
}

function extractFlexValue(node: t.Node): string | number | null {
  if (t.isNumericLiteral(node)) return node.value;
  if (t.isStringLiteral(node)) return node.value;
  return null;
}

function hasOverflowHidden(props: StyleProps): boolean {
  return props.overflow === 'hidden' ||
         (props.overflowX === 'hidden' && props.overflowY === 'hidden');
}

function hasTextTruncation(props: StyleProps): boolean {
  return props.textOverflow === 'ellipsis';
}

/**
 * A layout container is identified by having flex: 1 (or similar) or
 * height: '100%' / '100vh' — these are full-size containers that wrap content.
 */
function isLayoutContainer(props: StyleProps): boolean {
  // flex: 1 or flex: '1' or flex: '1 1 0%' etc.
  if (props.flex !== null) {
    const flexStr = String(props.flex);
    if (flexStr === '1' || flexStr.startsWith('1 ')) {
      return true;
    }
  }

  // height: '100%' or height: '100vh'
  if (props.height === '100%' || props.height === '100vh') {
    return true;
  }

  return false;
}

function describeLayoutIndicator(props: StyleProps): string {
  const indicators: string[] = [];
  if (props.flex !== null) {
    indicators.push(`flex: ${typeof props.flex === 'string' ? `'${props.flex}'` : props.flex}`);
  }
  if (props.height === '100%' || props.height === '100vh') {
    indicators.push(`height: '${props.height}'`);
  }
  return indicators.join(' and ');
}

function formatStyleSnippet(props: StyleProps): string {
  const parts: string[] = [];
  if (props.overflow) parts.push(`overflow: '${props.overflow}'`);
  if (props.flex !== null) parts.push(`flex: ${typeof props.flex === 'string' ? `'${props.flex}'` : props.flex}`);
  if (props.height) parts.push(`height: '${props.height}'`);
  return `{ ${parts.join(', ')} }`;
}
