/**
 * Check for Chart.register() when using tree-shaking
 * @param {Object} ast - The full AST
 * @param {Object} path - Current node path being validated
 * @param {Object} t - Babel types
 * @param {Object} context - Additional context
 * @returns {Object|null} Violation object or null if valid
 */
(ast, path, t, context) => {
  // Only check if we see specific controller imports
  if (t.isImportDeclaration(path.node) &&
      path.node.source.value === 'chart.js/auto') {
    return null; // auto import includes everything
  }
  
  if (t.isImportDeclaration(path.node) &&
      path.node.source.value === 'chart.js' &&
      path.node.specifiers.some(spec => 
        t.isImportSpecifier(spec) &&
        t.isIdentifier(spec.imported) &&
        ['BarController', 'LineController', 'PieController'].includes(spec.imported.name)
      )) {
    
    // Look for Chart.register call
    let hasRegister = false;
    ast.program.body.forEach(node => {
      if (t.isExpressionStatement(node) &&
          t.isCallExpression(node.expression) &&
          t.isMemberExpression(node.expression.callee) &&
          t.isIdentifier(node.expression.callee.object) &&
          node.expression.callee.object.name === 'Chart' &&
          t.isIdentifier(node.expression.callee.property) &&
          node.expression.callee.property.name === 'register') {
        hasRegister = true;
      }
    });
    
    if (!hasRegister) {
      return {
        rule: 'chart-missing-registration',
        severity: 'medium',
        message: 'When importing specific Chart.js components, you must call Chart.register()',
        line: path.node.loc?.start.line || 0,
        column: path.node.loc?.start.column || 0,
        fix: 'Chart.register(BarController, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);'
      };
    }
  }
  return null;
}