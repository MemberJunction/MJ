/**
 * Check ResponsiveContainer has proper parent dimensions
 * @param {Object} ast - The full AST
 * @param {Object} path - Current node path being validated
 * @param {Object} t - Babel types
 * @param {Object} context - Additional context
 * @returns {Object|null} Violation object or null if valid
 */
(ast, path, t, context) => {
  // Check for ResponsiveContainer usage
  if (t.isJSXElement(path.node) &&
      t.isJSXIdentifier(path.node.openingElement.name) &&
      path.node.openingElement.name.name === 'ResponsiveContainer') {
    
    // Check if width="100%" and height="100%" are used
    const attributes = path.node.openingElement.attributes;
    let hasPercentHeight = false;
    
    attributes.forEach(attr => {
      if (t.isJSXAttribute(attr) &&
          t.isJSXIdentifier(attr.name) &&
          attr.name.name === 'height') {
        
        if (t.isStringLiteral(attr.value) && attr.value.value === '100%') {
          hasPercentHeight = true;
        } else if (t.isJSXExpressionContainer(attr.value) &&
                   t.isStringLiteral(attr.value.expression) &&
                   attr.value.expression.value === '100%') {
          hasPercentHeight = true;
        }
      }
    });
    
    if (hasPercentHeight) {
      return {
        rule: 'recharts-responsive-container-height',
        severity: 'critical',
        message: 'ResponsiveContainer with height="100%" requires parent element to have explicit height',
        line: path.node.loc?.start.line || 0,
        column: path.node.loc?.start.column || 0,
        fix: 'Set parent div style={{ height: 400 }} or use fixed height on ResponsiveContainer'
      };
    }
  }
  return null;
}