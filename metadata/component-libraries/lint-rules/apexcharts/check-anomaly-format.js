// Validates that anomaly data for ApexCharts annotations is correctly formatted
(ast, path, t, context) => {
  // Look for annotations configuration in chart options
  if (t.isObjectProperty(path.node) && 
      t.isIdentifier(path.node.key) && 
      path.node.key.name === 'annotations') {
    
    const value = path.node.value;
    if (t.isObjectExpression(value)) {
      // Check for points property
      const pointsProp = value.properties.find(p => 
        t.isObjectProperty(p) && 
        t.isIdentifier(p.key) && 
        p.key.name === 'points' 
      );
      
      if (pointsProp) {
        // Check if it's mapping over anomalies
        if (t.isCallExpression(pointsProp.value) && 
            t.isMemberExpression(pointsProp.value.callee) &&
            pointsProp.value.callee.property?.name === 'map') {
          
          const mapArg = pointsProp.value.arguments[0];
          if (t.isArrowFunctionExpression(mapArg) || t.isFunctionExpression(mapArg)) {
            const body = mapArg.body;
            
            // Check the structure being returned
            if (t.isObjectExpression(body) || 
                (t.isBlockStatement(body) && body.body.length > 0)) {
              
              // Look for common mistakes
              const checkForDateField = (obj) => {
                if (t.isObjectExpression(obj)) {
                  const hasDate = obj.properties.some(p => 
                    t.isObjectProperty(p) && 
                    t.isIdentifier(p.key) && 
                    p.key.name === 'date'
                  );
                  const hasX = obj.properties.some(p => 
                    t.isObjectProperty(p) && 
                    t.isIdentifier(p.key) && 
                    p.key.name === 'x'
                  );
                  
                  if (hasDate && !hasX) {
                    context.violations.push({
                      severity: 'critical',
                      message: 'Anomaly annotations should use "x" property with timestamp, not "date"',
                      line: obj.loc?.start.line,
                      column: obj.loc?.start.column,
                      suggestion: 'Change to: { x: new Date(anomaly.date).getTime(), y: anomaly.value, ... }'
                    });
                  }
                }
              };
              
              if (t.isObjectExpression(body)) {
                checkForDateField(body);
              }
            }
          }
        }
      }
    }
  }
  
  // Check for anomaly data being set in state
  if (t.isCallExpression(path.node) && 
      t.isIdentifier(path.node.callee) && 
      path.node.callee.name === 'setAnomalies') {
    
    const arg = path.node.arguments[0];
    if (t.isArrayExpression(arg) && arg.elements.length > 0) {
      const firstElement = arg.elements[0];
      
      if (t.isObjectExpression(firstElement)) {
        const hasDate = firstElement.properties.some(p => 
          t.isObjectProperty(p) && 
          t.isIdentifier(p.key) && 
          p.key.name === 'date'
        );
        const hasX = firstElement.properties.some(p => 
          t.isObjectProperty(p) && 
          t.isIdentifier(p.key) && 
          p.key.name === 'x'
        );
        
        if (hasDate && !hasX) {
          context.violations.push({
            severity: 'medium',
            message: 'Anomaly data should include "x" property for ApexCharts compatibility',
            line: firstElement.loc?.start.line,
            column: firstElement.loc?.start.column,
            suggestion: 'Include: { x: new Date(point.date), y: value, metric: metricName }'
          });
        }
      }
    }
  }
}