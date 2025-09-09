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
                  hasCleanup = true;
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