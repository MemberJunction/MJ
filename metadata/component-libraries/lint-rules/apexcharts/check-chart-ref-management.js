// Validates that chart instances are properly stored and exposed via refs
(ast, path, t, context) => {
  // Check for new ApexCharts creation
  if (t.isNewExpression(path.node) && path.node.callee.name === 'ApexCharts') {
    const parent = path.parent;
    
    // Check if the chart instance is being stored
    if (t.isVariableDeclarator(parent)) {
      const varName = parent.id.name;
      context.apexChartVars = context.apexChartVars || new Set();
      context.apexChartVars.add(varName);
      
      // Now check if this variable is attached to a ref
      const scope = path.scope;
      const binding = scope.getBinding(varName);
      if (binding) {
        let isAttachedToRef = false;
        
        for (const refPath of binding.referencePaths) {
          // Check for patterns like: chartRef.current = chart
          if (t.isMemberExpression(refPath.parent) && 
              refPath.parent.property?.name === 'current') {
            isAttachedToRef = true;
            break;
          }
          // Check for: chartRef.current._chart = chart
          if (t.isMemberExpression(refPath.parent?.left) &&
              refPath.parent?.left?.property?.name === '_chart') {
            isAttachedToRef = true;
            break;
          }
        }
        
        if (!isAttachedToRef) {
          context.violations.push({
            type: 'error',  
            message: `ApexCharts instance '${varName}' should be attached to a ref for export functionality`,
            line: path.node.loc?.start.line,
            column: path.node.loc?.start.column,
            suggestion: 'After creating chart, store it: chartRef.current = chart;'
          });
        }
      }
    }
  }
  
  // Check for dataURI usage without proper ref
  if (t.isMemberExpression(path.node) && 
      t.isIdentifier(path.node.property) && 
      path.node.property.name === 'dataURI') {
    const object = path.node.object;
    
    // Check if it's accessing through a ref
    if (t.isMemberExpression(object)) {
      if (!object.property || object.property.name !== 'current') {
        context.violations.push({
          type: 'warning',
          message: 'dataURI() should be called on chart instance stored in ref.current',
          line: path.node.loc?.start.line,
          column: path.node.loc?.start.column,
          suggestion: 'Use: chartRef.current?.dataURI() or chart.dataURI()'
        });
      }
    }
  }
  
  // Check for missing chart storage in useEffect
  if (t.isCallExpression(path.node) && 
      t.isMemberExpression(path.node.callee) &&
      path.node.callee.object?.name === 'chart' &&
      path.node.callee.property?.name === 'render') {
    
    // Look for the chart variable in parent scope
    let foundChartStorage = false;
    let parent = path.parent;
    let depth = 0;
    
    while (parent && depth < 10) {
      if (t.isBlockStatement(parent)) {
        // Check if chartRef.current is set in this block
        const statements = parent.body;
        foundChartStorage = statements.some(stmt => {
          if (t.isExpressionStatement(stmt) && 
              t.isAssignmentExpression(stmt.expression)) {
            const left = stmt.expression.left;
            return t.isMemberExpression(left) && 
                   left.property?.name === 'current';
          }
          return false;
        });
        
        if (foundChartStorage) break;
      }
      parent = parent.parent;
      depth++;
    }
    
    if (!foundChartStorage) {
      context.violations.push({
        type: 'warning',
        message: 'Chart instance may not be stored in ref for export functionality',
        line: path.node.loc?.start.line,
        column: path.node.loc?.start.column,
        suggestion: 'Store chart in ref: chartRef.current = chart;'
      });
    }
  }
}