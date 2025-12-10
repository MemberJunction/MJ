/**
 * Ensure ApexCharts instances are destroyed in cleanup
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
    
    // Check if we're in a useEffect
    let useEffectPath = path;
    while (useEffectPath) {
      if (t.isCallExpression(useEffectPath.node) && 
          t.isIdentifier(useEffectPath.node.callee) &&
          useEffectPath.node.callee.name === 'useEffect') {
        
        // Check for cleanup return
        const effectFn = useEffectPath.node.arguments[0];
        if (t.isArrowFunctionExpression(effectFn) || t.isFunctionExpression(effectFn)) {
          const body = effectFn.body;
          let hasCleanup = false;
          
          if (t.isBlockStatement(body)) {
            for (const stmt of body.body) {
              if (t.isReturnStatement(stmt) && stmt.argument) {
                // Check if the return contains destroy call
                const returnArg = stmt.argument;
                if (t.isArrowFunctionExpression(returnArg) || t.isFunctionExpression(returnArg)) {
                  // Check if cleanup function actually calls destroy()
                  const cleanupBody = returnArg.body;
                  const cleanupStatements = t.isBlockStatement(cleanupBody) ? cleanupBody.body : [cleanupBody];

                  // Look for destroy() call in cleanup function
                  for (const cleanupStmt of cleanupStatements) {
                    if (t.isExpressionStatement(cleanupStmt) && t.isCallExpression(cleanupStmt.expression)) {
                      const call = cleanupStmt.expression;
                      // Check if this is a call to destroy() - handles:
                      // - chart.destroy()
                      // - chartInstance.current.destroy()
                      // - this.chart.destroy()
                      if (t.isMemberExpression(call.callee) &&
                          t.isIdentifier(call.callee.property) &&
                          call.callee.property.name === 'destroy') {
                        hasCleanup = true;
                        break;
                      }
                    }
                    // Also handle optional chaining: chart?.destroy() or ref.current?.destroy()
                    else if (t.isExpressionStatement(cleanupStmt) && t.isOptionalCallExpression(cleanupStmt.expression)) {
                      const call = cleanupStmt.expression;
                      if (t.isOptionalMemberExpression(call.callee) &&
                          t.isIdentifier(call.callee.property) &&
                          call.callee.property.name === 'destroy') {
                        hasCleanup = true;
                        break;
                      }
                    }
                    // Also check if-statements with destroy calls: if (chartInstance.current) { chartInstance.current.destroy(); }
                    else if (t.isIfStatement(cleanupStmt)) {
                      const checkIfHasDestroy = (node) => {
                        if (t.isBlockStatement(node)) {
                          return node.body.some(s => checkIfHasDestroy(s));
                        }
                        if (t.isExpressionStatement(node) && t.isCallExpression(node.expression)) {
                          const call = node.expression;
                          return t.isMemberExpression(call.callee) &&
                                 t.isIdentifier(call.callee.property) &&
                                 call.callee.property.name === 'destroy';
                        }
                        return false;
                      };
                      if (checkIfHasDestroy(cleanupStmt.consequent)) {
                        hasCleanup = true;
                        break;
                      }
                    }
                  }
                }
              }
            }
          }
          
          if (!hasCleanup) {
            return {
              rule: 'apexcharts-missing-cleanup',
              severity: 'high',
              message: 'ApexCharts instances must be destroyed in useEffect cleanup',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              fix: 'return () => { chart?.destroy(); }'
            };
          }
        }
        break;
      }
      useEffectPath = useEffectPath.parentPath;
    }
  }
  return null;
}