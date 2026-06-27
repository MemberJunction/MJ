/**
 * Validate that the Chart.js canvas parent container has position: 'relative'
 * and an explicit height. Without these, Chart.js renders into a 0-height or
 * collapsed container, producing a blank canvas.
 *
 * @param {Object} ast - The full AST
 * @param {Object} path - Current node path being validated
 * @param {Object} t - Babel types
 * @param {Object} context - Additional context with libraryName, globalVariable, instanceVariables
 * @returns {Object|null} Violation object or null if valid
 */
(ast, path, t, context) => {
  // Only trigger on <canvas> JSXOpeningElements that have a ref attribute
  if (!t.isJSXOpeningElement(path.node) ||
      !t.isJSXIdentifier(path.node.name) ||
      path.node.name.name !== 'canvas') {
    return null;
  }

  const hasRef = path.node.attributes.some(attr =>
    t.isJSXAttribute(attr) &&
    t.isJSXIdentifier(attr.name) &&
    attr.name.name === 'ref'
  );

  if (!hasRef) return null;

  // Walk up from the canvas JSXElement to find the nearest parent JSXElement
  // path is JSXOpeningElement -> parentPath is the canvas JSXElement
  let walker = path.parentPath?.parentPath;
  let parentJSX = null;
  while (walker) {
    if (t.isJSXElement(walker.node)) {
      parentJSX = walker;
      break;
    }
    walker = walker.parentPath;
  }

  if (!parentJSX) return null;

  const openingEl = parentJSX.node.openingElement;

  // Extract the ObjectExpression from an inline style={{ ... }} attribute
  const styleAttr = openingEl.attributes.find(attr =>
    t.isJSXAttribute(attr) &&
    t.isJSXIdentifier(attr.name) &&
    attr.name.name === 'style'
  );

  if (!styleAttr ||
      !t.isJSXExpressionContainer(styleAttr.value) ||
      !t.isObjectExpression(styleAttr.value.expression)) {
    // No inline style object at all
    return {
      rule: 'chart-canvas-container',
      severity: 'high',
      message: "Chart.js canvas container must have an inline style with position: 'relative' and explicit height",
      line: openingEl.loc?.start.line || 0,
      column: openingEl.loc?.start.column || 0,
      fix: "<div style={{ position: 'relative', width: '100%', height: '300px' }}>"
    };
  }

  const styleObj = styleAttr.value.expression;

  // Check for position: 'relative'
  const hasPosition = styleObj.properties.some(prop =>
    t.isObjectProperty(prop) &&
    t.isIdentifier(prop.key) &&
    prop.key.name === 'position' &&
    t.isStringLiteral(prop.value) &&
    prop.value.value === 'relative'
  );

  // Check for explicit height (any value type is fine — string, number, expression)
  const hasHeight = styleObj.properties.some(prop =>
    t.isObjectProperty(prop) &&
    t.isIdentifier(prop.key) &&
    prop.key.name === 'height'
  );

  const missing = [];
  if (!hasPosition) missing.push("position: 'relative'");
  if (!hasHeight) missing.push("explicit height (e.g. height: '300px')");

  if (missing.length > 0) {
    return {
      rule: 'chart-canvas-container',
      severity: 'high',
      message: `Chart.js canvas container is missing ${missing.join(' and ')}. Without these the chart renders as a blank/collapsed canvas.`,
      line: openingEl.loc?.start.line || 0,
      column: openingEl.loc?.start.column || 0,
      fix: "<div style={{ position: 'relative', width: '100%', height: '300px' }}>"
    };
  }

  return null;
}
