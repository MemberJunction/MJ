/**
 * Ensure ApexCharts instances call render() after creation
 * @param {Object} ast - The full AST
 * @param {Object} path - Current node path being validated
 * @param {Object} t - Babel types
 * @param {Object} context - Additional context
 * @returns {Object|null} Violation object or null if valid
 */
(ast, path, t, context) => {
  if (t.isNewExpression(path.node) && 
      t.isIdentifier(path.node.callee) && 
      path.node.callee.name === 'ApexCharts') {
    
    // Check if this is assigned to a variable
    if (t.isVariableDeclarator(path.parent)) {
      const varName = t.isIdentifier(path.parent.id) ? path.parent.id.name : null;
      
      if (varName) {
        // Look for render call on this variable
        let hasRender = false;
        const parentScope = path.getFunctionParent();
        
        if (parentScope) {
          parentScope.traverse({
            CallExpression(callPath) {
              if (t.isMemberExpression(callPath.node.callee) &&
                  t.isIdentifier(callPath.node.callee.object) &&
                  callPath.node.callee.object.name === varName &&
                  t.isIdentifier(callPath.node.callee.property) &&
                  callPath.node.callee.property.name === 'render') {
                hasRender = true;
              }
            }
          });
        }
        
        if (!hasRender) {
          return {
            rule: 'apexcharts-missing-render',
            severity: 'critical',
            message: 'ApexCharts instances must call .render() to display the chart',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            fix: `${varName}.render();`
          };
        }
      }
    }
  }
  return null;
}