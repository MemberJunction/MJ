/**
 * Recommend modern join() pattern over enter/exit
 * @param {Object} ast - The full AST
 * @param {Object} path - Current node path being validated
 * @param {Object} t - Babel types
 * @param {Object} context - Additional context
 * @returns {Object|null} Violation object or null if valid
 */
(ast, path, t, context) => {
  // Check for old enter/append pattern
  if (t.isCallExpression(path.node) &&
      t.isMemberExpression(path.node.callee) &&
      t.isIdentifier(path.node.callee.property) &&
      path.node.callee.property.name === 'enter') {
    
    // Check if followed by append
    if (t.isMemberExpression(path.parent) &&
        path.parent.object === path.node &&
        t.isCallExpression(path.parent.parent) &&
        t.isIdentifier(path.parent.property) &&
        path.parent.property.name === 'append') {
      
      return {
        rule: 'd3-use-join',
        severity: 'low',
        message: 'Consider using the modern .join() pattern instead of .enter().append()',
        line: path.node.loc?.start.line || 0,
        column: path.node.loc?.start.column || 0,
        fix: '.join("element") // Handles enter, update, and exit automatically'
      };
    }
  }
  return null;
}