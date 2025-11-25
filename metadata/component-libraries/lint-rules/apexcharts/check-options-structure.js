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

      // Helper function to check if a property might have a field through spread or direct property
      const hasPropertyOrSpread = (propName) => {
        return properties.some(prop => {
          // Direct property
          if (t.isObjectProperty(prop) &&
              t.isIdentifier(prop.key) &&
              prop.key.name === propName) {
            return true;
          }
          // Spread element - assume it might have the property
          if (t.isSpreadElement(prop)) {
            return true;
          }
          return false;
        });
      };

      const hasChart = hasPropertyOrSpread('chart');
      const hasSeries = hasPropertyOrSpread('series');

      // Only report violation if we're certain the property is missing
      // (i.e., no direct property and no spread elements that might contain it)
      const hasSpread = properties.some(prop => t.isSpreadElement(prop));

      if (!hasChart && !hasSpread) {
        return {
          rule: 'apexcharts-missing-chart-config',
          severity: 'high',
          message: 'ApexCharts options must include a "chart" property',
          line: optionsArg.loc?.start.line || 0,
          column: optionsArg.loc?.start.column || 0,
          fix: 'chart: { type: "bar", height: 350 }'
        };
      }

      if (!hasSeries && !hasSpread) {
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