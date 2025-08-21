// Validates that data passed to ApexCharts is in the correct series format
(ast, path, t, context) => {
  // Look for chart creation or series updates
  if (t.isNewExpression(path.node) && path.node.callee.name === 'ApexCharts') {
    const configArg = path.node.arguments[1];
    if (configArg && t.isObjectExpression(configArg)) {
      const seriesProp = configArg.properties.find(p => 
        t.isObjectProperty(p) && 
        t.isIdentifier(p.key) && 
        p.key.name === 'series'
      );
      
      if (seriesProp && t.isIdentifier(seriesProp.value)) {
        // Track the variable name for later validation
        context.apexSeriesVars = context.apexSeriesVars || new Set();
        context.apexSeriesVars.add(seriesProp.value.name);
      }
    }
  }
  
  // Check updateSeries calls
  if (t.isMemberExpression(path.node) && 
      t.isIdentifier(path.node.property) && 
      path.node.property.name === 'updateSeries') {
    const parent = path.parent;
    if (t.isCallExpression(parent)) {
      const arg = parent.arguments[0];
      if (arg && t.isIdentifier(arg)) {
        // Flag for validation - series data should be array of objects with name and data
        context.violations.push({
          severity: 'medium',
          message: `Verify that '${arg.name}' is formatted as ApexCharts series: [{name: string, data: [{x, y}]}]`,
          line: path.node.loc?.start.line,
          column: path.node.loc?.start.column,
          suggestion: 'Transform data to: selectedMetrics.map(metric => ({ name: metric, data: points.map(p => ({x: timestamp, y: value})) }))'
        });
      }
    }
  }
  
  // Look for common data format mistakes
  if (t.isObjectExpression(path.node)) {
    const hasDateProp = path.node.properties.some(p => 
      t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'date'
    );
    const hasDurationProp = path.node.properties.some(p => 
      t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'duration'
    );
    const hasCostProp = path.node.properties.some(p => 
      t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === 'cost'
    );
    
    // This looks like processed data that needs transformation
    if (hasDateProp && (hasDurationProp || hasCostProp)) {
      // Check if this is being passed to chart
      let parent = path.parent;
      let depth = 0;
      while (parent && depth < 5) {
        if (t.isJSXAttribute(parent) && parent.name?.name === 'seriesData') {
          context.violations.push({
            severity: 'critical',
            message: 'Data structure {date, duration, cost} needs transformation to ApexCharts series format',
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column,
            suggestion: 'Transform to: [{name: "Duration", data: [{x: timestamp, y: value}]}, ...]'
          });
          break;
        }
        parent = parent.parent;
        depth++;
      }
    }
  }
}