/**
 * Validate ApexCharts options structure
 * @param {Object} ast - The full AST
 * @param {Object} path - Current node path being validated
 * @param {Object} t - Babel types
 * @param {Object} context - Additional context
 * @returns {Object|null} Violation object or null if valid
 */
(ast, path, t, context) => {
  if (t.isNewExpression(path.node) && 
      t.isIdentifier(path.node.callee) && 
      path.node.callee.name === 'ApexCharts' &&
      path.node.arguments[1]) {
    
    const optionsArg = path.node.arguments[1];
    
    if (t.isObjectExpression(optionsArg)) {
      const properties = optionsArg.properties;
      
      // Check for required properties
      const hasChart = properties.some(prop => 
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === 'chart'
      );
      
      const hasSeries = properties.some(prop => 
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === 'series'
      );
      
      if (!hasChart) {
        return {
          rule: 'apexcharts-missing-chart-config',
          severity: 'high',
          message: 'ApexCharts options must include a "chart" property',
          line: optionsArg.loc?.start.line || 0,
          column: optionsArg.loc?.start.column || 0,
          fix: 'chart: { type: "bar", height: 350 }'
        };
      }
      
      if (!hasSeries) {
        return {
          rule: 'apexcharts-missing-series',
          severity: 'high',
          message: 'ApexCharts options must include a "series" property',
          line: optionsArg.loc?.start.line || 0,
          column: optionsArg.loc?.start.column || 0,
          fix: 'series: [{ name: "Series 1", data: [] }]'
        };
      }
    }
  }
  return null;
}