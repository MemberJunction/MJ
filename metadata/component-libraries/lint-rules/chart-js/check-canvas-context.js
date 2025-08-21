/**
 * Validate canvas context is obtained correctly
 * @param {Object} ast - The full AST
 * @param {Object} path - Current node path being validated
 * @param {Object} t - Babel types
 * @param {Object} context - Additional context
 * @returns {Object|null} Violation object or null if valid
 */
(ast, path, t, context) => {
  if (t.isNewExpression(path.node) && 
      t.isIdentifier(path.node.callee) && 
      path.node.callee.name === 'Chart' &&
      path.node.arguments[0]) {
    
    const firstArg = path.node.arguments[0];
    
    // Check if it's a getContext('2d') call
    if (t.isCallExpression(firstArg) &&
        t.isMemberExpression(firstArg.callee) &&
        t.isIdentifier(firstArg.callee.property) && 
        firstArg.callee.property.name === 'getContext') {
      
      const contextArg = firstArg.arguments[0];
      if (!t.isStringLiteral(contextArg) || contextArg.value !== '2d') {
        return {
          rule: 'chart-invalid-context',
          severity: 'high',
          message: 'Chart.js requires a 2D canvas context',
          line: contextArg?.loc?.start.line || 0,
          column: contextArg?.loc?.start.column || 0,
          fix: "getContext('2d')"
        };
      }
    }
  }
  return null;
}