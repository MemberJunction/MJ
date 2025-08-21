/**
 * Ensure chart components have data prop
 * @param {Object} ast - The full AST
 * @param {Object} path - Current node path being validated
 * @param {Object} t - Babel types
 * @param {Object} context - Additional context
 * @returns {Object|null} Violation object or null if valid
 */
(ast, path, t, context) => {
  // Check for Recharts chart components
  const chartComponents = ['LineChart', 'BarChart', 'AreaChart', 'PieChart', 'ScatterChart', 'RadarChart'];
  
  if (t.isJSXElement(path.node) &&
      t.isJSXIdentifier(path.node.openingElement.name) &&
      chartComponents.includes(path.node.openingElement.name.name)) {
    
    const attributes = path.node.openingElement.attributes;
    let hasData = false; 
    
    attributes.forEach(attr => {
      if (t.isJSXAttribute(attr) &&
          t.isJSXIdentifier(attr.name) &&
          attr.name.name === 'data') {
        hasData = true;
      }
    });
    
    if (!hasData) {
      return {
        rule: 'recharts-missing-data',
        severity: 'high',
        message: `${path.node.openingElement.name.name} requires a data prop`,
        line: path.node.loc?.start.line || 0,
        column: path.node.loc?.start.column || 0,
        fix: 'data={chartData}'
      };
    }
  }
  return null;
}