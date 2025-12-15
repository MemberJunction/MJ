// Validates that chart instances are properly stored and exposed via refs
(ast, path, t, context) => {
  // Initialize tracking sets if not already done
  context.apexChartVars = context.apexChartVars || new Set();
  context.apexChartVarsWithRefWarning = context.apexChartVarsWithRefWarning || new Set();
  context.needsExportFunctionality = context.needsExportFunctionality || null;

  // On first pass, check if component needs export functionality
  if (context.needsExportFunctionality === null) {
    context.needsExportFunctionality = false;

    // Check for export-related method calls (dataURI, exportChart, etc.)
    const hasExportCalls = (astNode) => {
      let found = false;
      const visitor = {
        CallExpression(callPath) {
          if (t.isMemberExpression(callPath.node.callee)) {
            const methodName = callPath.node.callee.property?.name;
            if (methodName === 'dataURI' ||
                methodName === 'exportChart' ||
                methodName === 'exportToSVG' ||
                methodName === 'exportToPNG') {
              found = true;
              callPath.stop();
            }
          }
        }
      };

      if (ast.program) {
        for (const node of ast.program.body) {
          if (found) break;
          const nodePath = { node, scope: path.scope };
          if (t.isFunctionDeclaration(node) || t.isExportDefaultDeclaration(node)) {
            const func = t.isFunctionDeclaration(node) ? node : node.declaration;
            if (func.body) {
              const tempPath = { node: func.body, scope: path.scope, traverse: (v) => {
                const walk = (n) => {
                  if (t.isCallExpression(n)) v.CallExpression({ node: n });
                  Object.values(n).forEach(val => {
                    if (val && typeof val === 'object') {
                      if (Array.isArray(val)) val.forEach(walk);
                      else walk(val);
                    }
                  });
                };
                walk(func.body);
              }};
              tempPath.traverse(visitor);
            }
          }
        }
      }
      return found;
    };

    context.needsExportFunctionality = hasExportCalls(ast);
  }

  // Check for new ApexCharts creation
  if (t.isNewExpression(path.node) && path.node.callee.name === 'ApexCharts') {
    const parent = path.parent;

    // Check if the chart instance is being stored
    if (t.isVariableDeclarator(parent)) {
      const varName = parent.id.name;
      context.apexChartVars.add(varName);

      // Now check if this variable is attached to a ref
      const scope = path.scope;
      const binding = scope.getBinding(varName);
      if (binding) {
        let isAttachedToRef = false;

        for (const refPath of binding.referencePaths) {
          // Check for patterns like: chartRef.current = chart
          if (t.isAssignmentExpression(refPath.parent) &&
              t.isMemberExpression(refPath.parent.left) &&
              refPath.parent.left.property?.name === 'current') {
            isAttachedToRef = true;
            break;
          }
          // Check for: chartRef.current._chart = chart
          if (t.isAssignmentExpression(refPath.parent) &&
              t.isMemberExpression(refPath.parent.left) &&
              refPath.parent.left.property?.name === '_chart') {
            isAttachedToRef = true;
            break;
          }
        }

        // Only warn about missing ref if component actually needs export functionality
        if (!isAttachedToRef && context.needsExportFunctionality) {
          // Mark that we already warned about this chart variable
          context.apexChartVarsWithRefWarning.add(varName);
          context.violations.push({
            severity: 'low',
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
          severity: 'low',
          message: 'dataURI() should be called on chart instance stored in ref.current',
          line: path.node.loc?.start.line,
          column: path.node.loc?.start.column,
          suggestion: 'Use: chartRef.current?.dataURI() or chart.dataURI()'
        });
      }
    }
  }
  
  // Check for chart.render() calls - but skip if we already warned about this chart variable
  if (t.isCallExpression(path.node) &&
      t.isMemberExpression(path.node.callee) &&
      path.node.callee.object?.name === 'chart' &&
      path.node.callee.property?.name === 'render') {

    const chartVarName = path.node.callee.object.name;

    // Skip if we already warned about this chart variable not being in a ref
    if (context.apexChartVarsWithRefWarning && context.apexChartVarsWithRefWarning.has(chartVarName)) {
      return; // Don't duplicate the warning
    }

    // Also skip if this chart variable was properly created and tracked
    if (context.apexChartVars && context.apexChartVars.has(chartVarName)) {
      // We already checked this variable when it was created
      return;
    }

    // Only check ref storage if component needs export functionality
    if (!context.needsExportFunctionality) {
      return; // Skip warning for components that don't need export
    }

    // This is a render() call on a chart we haven't seen created (might be from props/params)
    // Check if it's stored in a ref in the current scope
    let foundChartStorage = false;
    let currentPath = path;

    // Look up the tree for the containing function/block
    while (currentPath && !t.isFunctionDeclaration(currentPath.node) &&
           !t.isFunctionExpression(currentPath.node) &&
           !t.isArrowFunctionExpression(currentPath.node)) {
      currentPath = currentPath.parentPath;
    }

    if (currentPath) {
      // Check if chartRef.current = chart exists in this scope
      currentPath.traverse({
        AssignmentExpression(assignPath) {
          if (t.isMemberExpression(assignPath.node.left) &&
              assignPath.node.left.property?.name === 'current' &&
              t.isIdentifier(assignPath.node.right) &&
              assignPath.node.right.name === chartVarName) {
            foundChartStorage = true;
          }
        }
      });
    }

    if (!foundChartStorage) {
      context.violations.push({
        severity: 'low',
        message: `Chart instance '${chartVarName}' may not be stored in ref for export functionality`,
        line: path.node.loc?.start.line,
        column: path.node.loc?.start.column,
        suggestion: 'Store chart in ref: chartRef.current = chart;'
      });
    }
  }
}